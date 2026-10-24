package umbra

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sync"
	"time"

	"github.com/peterstace/simplefeatures/geom"
)

// OverlayRequest uses WGS84 west/south/east/north bounds. Historical instants are
// supported for map inspection, independently of future-only route departures.
type OverlayRequest struct {
	At     string    `json:"at"`
	Bounds []float64 `json:"bounds"`
}
type OverlayGeometry struct {
	Type        string        `json:"type"`
	Coordinates [][][]float64 `json:"coordinates"`
}
type OverlayProperties struct {
	BuildingID   string  `json:"building_id"`
	HeightSource string  `json:"height_source"`
	Low          float64 `json:"height_low_m,omitempty"`
	High         float64 `json:"height_high_m,omitempty"`
}
type OverlayFeature struct {
	Type       string            `json:"type"`
	Properties OverlayProperties `json:"properties"`
	Geometry   OverlayGeometry   `json:"geometry"`
}
type Overlay struct {
	Type            string           `json:"type"`
	At              string           `json:"at"`
	State           string           `json:"state"`
	Features        []OverlayFeature `json:"features"`
	Attribution     []string         `json:"attribution"`
	Warnings        []string         `json:"warnings"`
	Truncated       bool             `json:"truncated"`
	PartialCoverage bool             `json:"partial_coverage"`
	Coverage        []float64        `json:"coverage"`
	Elevation       float64          `json:"solar_elevation"`
	Azimuth         float64          `json:"solar_azimuth"`
	FieldValidated  bool             `json:"field_validated"`
}

// Bounded immutable response cache. The handler's calculation slots bound
// concurrent misses. Cache hits never mutate a previously returned response.
type overlayCache struct {
	mu     sync.Mutex
	values map[string]Overlay
	order  []string
}

func (c *overlayCache) get(key string) (Overlay, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.values[key]
	return v, ok
}
func (c *overlayCache) put(key string, value Overlay) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.values == nil {
		c.values = map[string]Overlay{}
	}
	if _, exists := c.values[key]; exists {
		return
	}
	if len(c.order) == 8 {
		delete(c.values, c.order[0])
		c.order = c.order[1:]
	}
	c.values[key] = value
	c.order = append(c.order, key)
}

func polygonGeometry(poly Polygon) (geom.Geometry, error) {
	points := 0
	if len(poly) > 64 {
		return geom.Geometry{}, fmt.Errorf("building exceeds ring budget")
	}
	for _, ring := range poly {
		points += len(ring)
	}
	if points > 1024 {
		return geom.Geometry{}, fmt.Errorf("building exceeds vertex budget")
	}
	rings := make([]geom.LineString, 0, len(poly))
	for _, ring := range poly {
		coords := make([]float64, 0, len(ring)*2)
		for _, p := range ring {
			coords = append(coords, p.X, p.Y)
		}
		rings = append(rings, geom.NewLineString(geom.NewSequence(coords, geom.DimXY)))
	}
	g := geom.NewPolygon(rings).AsGeometry()
	return g, g.Validate()
}

// CastShadow sweeps the complete footprint (including holes) along the ground
// projection of its vertical prism. Unioning swept boundary faces preserves
// concavities/courtyards, unlike a convex-hull shortcut. Roof shape/terrain are
// not inferred. The result excludes the building's own footprint.
func CastShadow(poly Polygon, height float64, sun Sun) (geom.Geometry, error) {
	base, err := polygonGeometry(poly)
	if err != nil {
		return geom.Geometry{}, err
	}
	if height <= 0 || sun.Elevation < 5 || sun.Elevation > 90 || !finite(height) {
		return geom.Geometry{}, fmt.Errorf("unsupported shadow height or solar elevation")
	}
	center := bounds(poly[0])
	direction := solarDirection(Point{(center.West + center.East) / 2, (center.South + center.North) / 2}, sun.Azimuth)
	distance := height / math.Tan(radians(sun.Elevation))
	dx, dy := -direction.X*distance, -direction.Y*distance
	if distance < 0.00001 {
		return geom.Geometry{}, nil
	}
	pieces := []geom.Geometry{base, base.TransformXY(func(p geom.XY) geom.XY { return geom.XY{X: p.X + dx, Y: p.Y + dy} })}
	for _, ring := range poly {
		if len(ring) > 10000 {
			return geom.Geometry{}, fmt.Errorf("building ring exceeds vertex budget")
		}
		for i := 1; i < len(ring); i++ {
			a, b := ring[i-1], ring[i]
			if math.Abs(cross(sub(b, a), Point{dx, dy})) < 1e-7 {
				continue
			}
			quad, err := polygonGeometry(Polygon{{a, b, {X: b.X + dx, Y: b.Y + dy}, {X: a.X + dx, Y: a.Y + dy}, a}})
			if err != nil {
				return geom.Geometry{}, err
			}
			pieces = append(pieces, quad)
		}
	}
	merged, err := geom.UnionMany(pieces)
	if err != nil {
		return geom.Geometry{}, err
	}
	return geom.Difference(merged, base)
}

func overlayViewport(q OverlayRequest, d *Dataset) (time.Time, geom.Geometry, bool, error) {
	at, err := time.Parse(time.RFC3339Nano, q.At)
	if err != nil || at.Year() < 2000 || at.Year() > 2100 {
		return at, geom.Geometry{}, false, routeError("at must be an RFC3339 instant in years 2000 to 2100")
	}
	if len(q.Bounds) != 4 {
		return at, geom.Geometry{}, false, routeError("bounds must be west south east north")
	}
	w, s, e, n := q.Bounds[0], q.Bounds[1], q.Bounds[2], q.Bounds[3]
	for _, v := range q.Bounds {
		if !finite(v) {
			return at, geom.Geometry{}, false, routeError("bounds must be finite")
		}
	}
	if w < -180 || e > 180 || s < -80 || n > 84 || e <= w || n <= s || e-w > .5 || n-s > .5 || (e-w)*(n-s) > .04 {
		return at, geom.Geometry{}, false, routeError("unsupported viewport; zoom in on the pilot")
	}
	poly := Polygon{{Project(Coordinate{s, w}), Project(Coordinate{s, e}), Project(Coordinate{n, e}), Project(Coordinate{n, w}), Project(Coordinate{s, w})}}
	viewport, err := polygonGeometry(poly)
	if err != nil {
		return at, geom.Geometry{}, false, routeError("invalid viewport")
	}
	pilot, err := polygonGeometry(Rect(d.Pilot))
	if err != nil {
		return at, geom.Geometry{}, false, err
	}
	clipped, err := geom.Intersection(viewport, pilot)
	if err != nil {
		return at, geom.Geometry{}, false, err
	}
	if clipped.IsEmpty() || clipped.Area() < .01 {
		return at, geom.Geometry{}, false, routeError("viewport is outside the prepared pilot")
	}
	return at, clipped, clipped.Area()+.1 < viewport.Area(), nil
}

func (r *Router) MapShadows(ctx context.Context, q OverlayRequest) (Overlay, error) {
	at, viewport, partial, err := overlayViewport(q, r.Data)
	if err != nil {
		return Overlay{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, r.Settings.ComputeBudget)
	defer cancel()
	sw, ne := Unproject(Point{r.Data.Pilot.West, r.Data.Pilot.South}), Unproject(Point{r.Data.Pilot.East, r.Data.Pilot.North})
	sun := SolarPosition(at, Unproject(Point{(r.Data.Pilot.West + r.Data.Pilot.East) / 2, (r.Data.Pilot.South + r.Data.Pilot.North) / 2}))
	result := Overlay{Type: "FeatureCollection", At: q.At, State: "available", Features: []OverlayFeature{}, Attribution: []string{Attribution},
		Warnings:        []string{"Experimental flat-ground building-prism shadows; not field validated. Trees, clouds, terrain and unmapped obstructions are not modeled."},
		PartialCoverage: partial, Coverage: []float64{sw.Longitude, sw.Latitude, ne.Longitude, ne.Latitude}, Elevation: sun.Elevation, Azimuth: sun.Azimuth}
	if partial {
		result.Warnings = append(result.Warnings, "Viewport extends beyond the pilot; only covered geometry is returned.")
	}
	if sun.Elevation < -0.833 {
		result.State = "night"
		return result, nil
	}
	if sun.Elevation < 5 {
		result.State = "low_sun"
		return result, nil
	}
	vertices, skipped := 0, 0
	viewportBounds := bounds([]Point{Project(Coordinate{q.Bounds[1], q.Bounds[0]}), Project(Coordinate{q.Bounds[1], q.Bounds[2]}), Project(Coordinate{q.Bounds[3], q.Bounds[0]}), Project(Coordinate{q.Bounds[3], q.Bounds[2]})})
	for _, building := range r.Data.Buildings {
		if err := ctx.Err(); err != nil {
			return Overlay{}, err
		}
		reach := building.Height.Low / math.Tan(radians(sun.Elevation))
		if building.Height.Source == "missing" || building.Height.Source == "unsupported_elevated" {
			reach = 0
		}
		if !building.Box.Expand(reach).Intersects(viewportBounds) {
			continue
		}
		properties := OverlayProperties{BuildingID: building.ID, HeightSource: "unknown"}
		switch building.Height.Source {
		case "osm_height_tag":
			properties.HeightSource = "osm_height"
			properties.Low = building.Height.Low
			properties.High = building.Height.High
		case "estimated_from_levels":
			properties.HeightSource = "levels_estimate"
			properties.Low = building.Height.Low
			properties.High = building.Height.High
		}
		for _, poly := range building.Geometry {
			if err := ctx.Err(); err != nil {
				return Overlay{}, err
			}
			var shape geom.Geometry
			if properties.HeightSource == "unknown" {
				shape, err = polygonGeometry(poly)
			} else {
				shape, err = CastShadow(poly, building.Height.Low, sun)
			}
			if err != nil {
				skipped++
				continue
			}
			if shape.IsEmpty() {
				continue
			}
			shape, err = geom.Intersection(shape, viewport)
			if err != nil {
				skipped++
				continue
			}
			for _, piece := range shape.Dump() {
				p, ok := piece.AsPolygon()
				if !ok || p.IsEmpty() || p.Area() < .01 {
					continue
				}
				if simplified, e := p.Simplify(.2); e == nil && !simplified.IsEmpty() {
					p = simplified
				}
				coordinates := [][][]float64{}
				count := 0
				for _, ring := range p.DumpRings() {
					seq := ring.Coordinates()
					points := make([][]float64, 0, seq.Length())
					count += seq.Length()
					for i := 0; i < seq.Length(); i++ {
						xy := seq.GetXY(i)
						gps := Unproject(Point{xy.X, xy.Y})
						points = append(points, []float64{gps.Longitude, gps.Latitude})
					}
					coordinates = append(coordinates, points)
				}
				if vertices+count > 60000 || len(result.Features) >= 2000 {
					result.Truncated = true
					break
				}
				vertices += count
				result.Features = append(result.Features, OverlayFeature{Type: "Feature", Properties: properties, Geometry: OverlayGeometry{Type: "Polygon", Coordinates: coordinates}})
			}
			if result.Truncated {
				break
			}
		}
		if result.Truncated {
			break
		}
	}
	result.Warnings = append(result.Warnings, "Floor-count shadows use the lower assumed height (2.5 m per floor); the larger possible shadow remains uncertain. Missing/elevated heights are footprint outlines, not invented shadows.")
	if skipped > 0 {
		result.Warnings = append(result.Warnings, fmt.Sprintf("%d invalid or unsupported polygon operations were omitted.", skipped))
	}
	if result.Truncated {
		result.Warnings = append(result.Warnings, "Overlay geometry was truncated to the mobile feature/vertex budget; zoom in.")
	}
	if raw, e := json.Marshal(result); e != nil || len(raw) > 4_900_000 {
		return Overlay{}, fmt.Errorf("overlay exceeds response-size budget")
	}
	return result, nil
}
