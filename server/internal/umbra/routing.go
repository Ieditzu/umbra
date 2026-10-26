package umbra

import (
	"container/heap"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

type RouteError struct {
	Status  int
	Message string
}

func (e *RouteError) Error() string   { return e.Message }
func routeError(message string) error { return &RouteError{422, message} }

type Router struct {
	Data     *Dataset
	Settings Settings
	Now      func() time.Time
	Exposure func(Point, time.Time, bool) ExposureResult
}

func NewRouter(d *Dataset) *Router {
	m := Model{Data: d}
	return &Router{d, DefaultSettings(), time.Now, m.At}
}
func (r *Router) Validate(q Request) (time.Time, error) {
	if q.SchemaVersion != 1 {
		return time.Time{}, routeError("schema_version must be 1")
	}
	for _, c := range []Coordinate{q.Origin, q.Destination} {
		if !finite(c.Latitude) || !finite(c.Longitude) || math.Abs(c.Latitude) > 90 || math.Abs(c.Longitude) > 180 {
			return time.Time{}, routeError("invalid geographic coordinates")
		}
	}
	a, b := Project(q.Origin), Project(q.Destination)
	if !r.Data.Pilot.Contains(a) || !r.Data.Pilot.Contains(b) {
		return time.Time{}, routeError("points outside the prepared Constanta pilot")
	}
	if distance(a, b) < 25 || distance(a, b) > 20000 {
		return time.Time{}, routeError("endpoints must be 25 m to 20 km apart")
	}
	if q.MaxExtraMinutes != 0 && q.MaxExtraMinutes != 5 && q.MaxExtraMinutes != 10 && q.MaxExtraMinutes != 15 {
		return time.Time{}, routeError("max_extra_minutes must be 0 5 10 or 15")
	}
	if !finite(q.WalkingSpeed) || q.WalkingSpeed <= 0 {
		return time.Time{}, routeError("walking_speed_mps must be positive")
	}
	at, err := time.Parse(time.RFC3339Nano, q.DepartureAt)
	if err != nil {
		return at, routeError("departure_at must be an RFC3339 instant with explicit UTC offset")
	}
	if at.Before(r.Now().Add(-time.Minute)) {
		return at, routeError("departure_at is in the past")
	}
	if at.Year() < 2000 || at.Year() > 2100 {
		return at, routeError("solar model supports years 2000 to 2100")
	}
	if _, err = time.LoadLocation(q.DepartureTimezone); err != nil || q.DepartureTimezone == "" || q.DepartureTimezone == "Local" {
		return at, routeError("departure_timezone must be an IANA time zone")
	}
	return at, nil
}
func (r *Router) snap(p Point) (int64, float64, error) {
	best := int64(0)
	dist := math.Inf(1)
	found := false
	for _, n := range r.Data.Nodes {
		d := distance(p, n.Point)
		if d < dist {
			best, dist, found = n.ID, d, true
		}
	}
	if !found || dist > r.Settings.MaxSnapM {
		return 0, 0, routeError("no mapped walking node within 75 m; choose a point closer to a mapped path")
	}
	q := r.Data.Positions[best]
	box := bounds([]Point{p, q})
	if dist > .05 {
		for _, b := range r.Data.Buildings {
			if !box.Intersects(b.Box) {
				continue
			}
			for _, poly := range b.Geometry {
				if _, hit := firstInteriorDistance(p, q, poly); hit {
					return 0, 0, routeError("nearest-node snap crosses a building; select the mapped path explicitly")
				}
			}
		}
	}
	return best, dist, nil
}

type item struct {
	node int64
	cost float64
	seq  int
}
type queue []item

func (q queue) Len() int { return len(q) }
func (q queue) Less(i, j int) bool {
	if q[i].cost == q[j].cost {
		return q[i].seq < q[j].seq
	}
	return q[i].cost < q[j].cost
}
func (q queue) Swap(i, j int) { q[i], q[j] = q[j], q[i] }
func (q *queue) Push(x any)   { *q = append(*q, x.(item)) }
func (q *queue) Pop() any     { a := *q; v := a[len(a)-1]; *q = a[:len(a)-1]; return v }
func (r *Router) shortest(ctx context.Context, from, to int64, weight func(int) float64, all bool) ([]int, map[int64]float64, error) {
	d := map[int64]float64{from: 0}
	prev := map[int64]int{}
	pq := &queue{{node: from}}
	seq := 0
	for pq.Len() > 0 {
		if err := ctx.Err(); err != nil {
			return nil, d, err
		}
		cur := heap.Pop(pq).(item)
		if cur.cost > d[cur.node]+1e-9 {
			continue
		}
		if cur.node == to && !all {
			break
		}
		for _, ei := range r.Data.Adjacency[cur.node] {
			e := r.Data.Edges[ei]
			v := cur.cost + weight(ei)
			old, ok := d[e.To]
			if !ok || v < old-1e-9 {
				d[e.To] = v
				prev[e.To] = ei
				seq++
				heap.Push(pq, item{e.To, v, seq})
			}
		}
	}
	if _, ok := d[to]; !ok {
		return nil, d, routeError("no connected walking route in the prepared graph; no missing link is synthesized")
	}
	path := []int{}
	for cur := to; cur != from; {
		ei, ok := prev[cur]
		if !ok {
			return nil, d, routeError("route reconstruction failed")
		}
		path = append(path, ei)
		cur = r.Data.Edges[ei].From
	}
	for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
		path[i], path[j] = path[j], path[i]
	}
	return path, d, nil
}

type evaluated struct {
	route    Route
	upperSun float64
	reasons  map[string]bool
}

func (r *Router) evaluate(ctx context.Context, path []int, q Request, at time.Time) (evaluated, error) {
	v := evaluated{reasons: map[string]bool{}}
	v.route.Segments = []Segment{}
	geometry := []Point{}
	elapsed := 0.
	samples := 0
	appendPiece := func(a, b Point, duration float64, ex ExposureResult) {
		v.reasons[ex.Reason] = true
		if ex.Exposure != "shade" {
			v.upperSun += duration
		}
		coords := []Coordinate{Unproject(a), Unproject(b)}
		last := len(v.route.Segments) - 1
		if last >= 0 && v.route.Segments[last].Exposure == ex.Exposure && len(v.route.Segments[last].Coordinates) < 9000 {
			v.route.Segments[last].Coordinates = append(v.route.Segments[last].Coordinates, coords[1])
			v.route.Segments[last].Duration += duration
		} else {
			v.route.Segments = append(v.route.Segments, Segment{coords, duration, ex.Exposure})
		}
	}
	for _, ei := range path {
		e := r.Data.Edges[ei]
		for _, p := range e.Geometry {
			if len(geometry) > 0 && distance(geometry[len(geometry)-1], p) < .001 {
				continue
			}
			for len(geometry) >= 2 {
				a, b := geometry[len(geometry)-2], geometry[len(geometry)-1]
				v, w := sub(b, a), sub(p, b)
				if math.Abs(cross(v, w)) > 1e-6*math.Max(1, distance(a, p)) || v.X*w.X+v.Y*w.Y < 0 {
					break
				}
				geometry = geometry[:len(geometry)-1]
			}
			geometry = append(geometry, p)
		}
		v.route.Distance += e.Length
		for i := 1; i < len(e.Geometry); i++ {
			a, b := e.Geometry[i-1], e.Geometry[i]
			ln := distance(a, b)
			if ln < 1e-8 {
				continue
			}
			step := math.Min(r.Settings.SampleM, q.WalkingSpeed*10)
			count := int(math.Ceil(ln / step))
			if count > 20000 || samples+count > 20000 {
				return v, routeError("route exceeds the pilot sampling budget")
			}
			samples += count
			for j := 0; j < count; j++ {
				if err := ctx.Err(); err != nil {
					return v, err
				}
				p, z := lerp(a, b, float64(j)/float64(count)), lerp(a, b, float64(j+1)/float64(count))
				seconds := distance(p, z) / q.WalkingSpeed
				when := at.Add(time.Duration((elapsed + seconds/2) * float64(time.Second)))
				ex := r.Exposure(lerp(p, z, .5), when, e.PositionKnown)
				appendPiece(p, z, seconds, ex)
				elapsed += seconds
			}
		}
	}
	if len(v.route.Segments) == 0 || len(v.route.Segments) > 5000 {
		return v, routeError("route has no usable geometry or exceeds segment budget")
	}
	hash := sha256.New()
	for _, p := range geometry {
		fmt.Fprintf(hash, "%.3f/%.3f;", p.X, p.Y)
	}
	v.route.ID = hex.EncodeToString(hash.Sum(nil))[:16]
	v.route.Duration = elapsed
	return v, nil
}
func (r *Router) Compare(ctx context.Context, q Request) (Comparison, error) {
	at, err := r.Validate(q)
	if err != nil {
		return Comparison{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, r.Settings.ComputeBudget)
	defer cancel()
	from, snapA, err := r.snap(Project(q.Origin))
	if err != nil {
		return Comparison{}, err
	}
	to, snapB, err := r.snap(Project(q.Destination))
	if err != nil {
		return Comparison{}, err
	}
	if from == to {
		return Comparison{}, routeError("endpoints snap to the same walking node")
	}
	fastest, dist, err := r.shortest(ctx, from, to, func(i int) float64 { return r.Data.Edges[i].Length }, true)
	if err != nil {
		return Comparison{}, err
	}
	fastestSeconds := dist[to] / q.WalkingSpeed
	limit := fastestSeconds + float64(q.MaxExtraMinutes*60)
	if limit > 4*3600 {
		return Comparison{}, routeError("pilot only supports walks of up to four hours including the detour budget")
	}
	base, err := r.evaluate(ctx, fastest, q, at)
	if err != nil {
		return Comparison{}, err
	}
	base.route.Kind = "fastest"
	candidates := []evaluated{base}
	seen := map[string]bool{base.route.ID: true}
	usage := map[int]int{}
	for _, ei := range fastest {
		usage[ei]++
	}
	// Candidates are generated by deterministic shadow-weighted Dijkstra and edge
	// penalties. Approximate arrival times guide search only; every accepted candidate
	// is re-evaluated using its own actual traversal clock below.
	edgeExposure := map[int]float64{}
	score := func(i int) float64 {
		if s, ok := edgeExposure[i]; ok {
			return s
		}
		e := r.Data.Edges[i]
		travel := dist[e.From] / q.WalkingSpeed
		duration := e.Length / q.WalkingSpeed
		bad := 0.
		for j := 0; j < 3; j++ {
			f := (float64(j) + .5) / 3
			p := lerp(e.Geometry[0], e.Geometry[len(e.Geometry)-1], f)
			ex := r.Exposure(p, at.Add(time.Duration((travel+duration*f)*float64(time.Second))), e.PositionKnown)
			if ex.Exposure != "shade" {
				bad++
			}
		}
		edgeExposure[i] = bad / 3
		return bad / 3
	}
	departureSun := SolarPosition(at, q.Origin)
	seek := departureSun.Elevation >= 5 || SolarPosition(at.Add(time.Duration(limit*float64(time.Second))), q.Destination).Elevation >= 5
	if seek {
		for attempt := 0; attempt < r.Settings.CandidateLimit; attempt++ {
			if ctx.Err() != nil {
				return Comparison{}, ctx.Err()
			}
			lambda := []float64{1, 3, 8, 20, 50, 100}[attempt%6]
			diversity := 0.
			if attempt >= 6 {
				diversity = .8
			}
			path, _, e := r.shortest(ctx, from, to, func(i int) float64 {
				return r.Data.Edges[i].Length * (1 + lambda*score(i) + diversity*float64(usage[i]))
			}, false)
			if e != nil {
				return Comparison{}, e
			}
			ln := 0.
			for _, ei := range path {
				ln += r.Data.Edges[ei].Length
			}
			for _, ei := range path {
				usage[ei]++
			}
			if ln/q.WalkingSpeed > limit+1e-6 {
				continue
			}
			v, e := r.evaluate(ctx, path, q, at)
			if e != nil {
				return Comparison{}, e
			}
			if !seen[v.route.ID] {
				seen[v.route.ID] = true
				candidates = append(candidates, v)
			}
		}
	}
	selected := []evaluated{base}
	best := -1
	for i := 1; i < len(candidates); i++ {
		v := candidates[i]
		if v.upperSun >= base.upperSun-1 {
			continue
		}
		if best < 0 || v.upperSun < candidates[best].upperSun-1e-6 || (math.Abs(v.upperSun-candidates[best].upperSun) < 1e-6 && v.route.Duration < candidates[best].route.Duration) {
			best = i
		}
	}
	if best >= 0 {
		shade := candidates[best]
		shade.route.Kind = "shadiest"
		balanced := -1
		bestUtility := 0.
		for i := 1; i < len(candidates); i++ {
			if i == best {
				continue
			}
			v := candidates[i]
			gain := base.upperSun - v.upperSun
			if gain <= 1 || v.route.Duration >= shade.route.Duration-1 {
				continue
			}
			utility := gain / (1 + v.route.Duration - base.route.Duration)
			if utility > bestUtility {
				bestUtility = utility
				balanced = i
			}
		}
		if balanced >= 0 {
			v := candidates[balanced]
			v.route.Kind = "balanced"
			selected = append(selected, v)
		}
		selected = append(selected, shade)
	}
	warnings := []string{
		"Experimental geometric building-shadow model on flat ground. Trees canopies clouds terrain weather and temporary obstructions are not inferred from absent OSM data. No field validation has been performed.",
		"Exposure is sampled at traversal midpoints at most 10 m and 10 s apart using each candidate's own arrival times. Walking speed is constant; crossings signals slopes stairs and pauses have no extra delay model.",
		"Candidate search is bounded and is not a global time-dependent optimum. Unknown exposure is penalized as possible sun and never counted as shade; comparisons minimize sun plus unknown seconds.",
		fmt.Sprintf("Endpoints snapped %.1f m and %.1f m to existing walking nodes. Off-network access is not routed and is excluded from duration. Verify the approach and mapped crossings on site.", snapA, snapB),
		"Routing is confined to the pilot and to selected public OSM way classes. Restricted barriers indoor links pedestrian areas without mapped paths and ways through building interiors are excluded. Roads tagged sidewalk=separate require separately mapped paths.",
	}
	if r.Data.Audit == nil {
		warnings = append(warnings, reasonWarnings["inventory_not_audited"])
	}
	if len(selected) == 1 {
		warnings = append(warnings, "No distinct candidate with lower sun-plus-unknown time was found within the accepted detour; only the fastest route is returned.")
	}
	reasons := map[string]bool{}
	routes := []Route{}
	for _, v := range selected {
		routes = append(routes, v.route)
		for reason := range v.reasons {
			reasons[reason] = true
		}
	}
	keys := []string{}
	for k := range reasons {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if msg := reasonWarnings[k]; msg != "" && !contains(warnings, msg) {
			warnings = append(warnings, msg)
		}
	}
	counts := map[string]int{}
	for _, b := range r.Data.Buildings {
		counts[b.Height.Source]++
	}
	warnings = append(warnings, fmt.Sprintf("Dataset %s from %s: %d OSM height tags %d floor-count estimates and %d missing or unsupported heights. OSM completeness is not guaranteed.", r.Data.PilotID, r.Data.Metadata["osm_base_timestamp"], counts["osm_height_tag"], counts["estimated_from_levels"], counts["missing"]+counts["unsupported_elevated"]))
	return Comparison{1, q.DepartureAt, r.Now().UTC().Format(time.RFC3339Nano), "bounded-candidates/time-dependent-ray-shadows/utm35/v1", routes, warnings, []string{Attribution}}, nil
}
func contains(v []string, s string) bool {
	for _, x := range v {
		if strings.EqualFold(x, s) {
			return true
		}
	}
	return false
}
