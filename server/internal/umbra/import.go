package umbra

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const DefaultOverpass = "https://overpass-api.de/api/interpreter"
const UserAgent = "UmbraShadeRouting/0.1 (research pilot; https://github.com/Ieditzu/umbra)"

type OSMMember struct {
	Type string `json:"type"`
	Ref  int64  `json:"ref"`
	Role string `json:"role"`
}
type OSMElement struct {
	Type    string            `json:"type"`
	ID      int64             `json:"id"`
	Lat     float64           `json:"lat"`
	Lon     float64           `json:"lon"`
	Nodes   []int64           `json:"nodes"`
	Members []OSMMember       `json:"members"`
	Tags    map[string]string `json:"tags"`
}
type OSMResponse struct {
	Elements []OSMElement `json:"elements"`
	Remark   string       `json:"remark"`
	OSM3S    struct {
		Timestamp string `json:"timestamp_osm_base"`
	} `json:"osm3s"`
}

func PilotMetric() Bounds {
	a := Project(Coordinate{PilotBBox.South, PilotBBox.West})
	b := Project(Coordinate{PilotBBox.North, PilotBBox.East})
	return Bounds{a.X, a.Y, b.X, b.Y}
}
func importQuery() string {
	b := PilotMetric().Expand(500)
	a, z := Unproject(Point{b.West, b.South}), Unproject(Point{b.East, b.North})
	return fmt.Sprintf(`[out:json][timeout:120];(way["highway"](%f,%f,%f,%f);nwr["building"](%f,%f,%f,%f);nwr["building:part"](%f,%f,%f,%f););(._;>;);out body;`, PilotBBox.South, PilotBBox.West, PilotBBox.North, PilotBBox.East, a.Latitude, a.Longitude, z.Latitude, z.Longitude, a.Latitude, a.Longitude, z.Latitude, z.Longitude)
}

// Prepare is an explicit operator action; requests served by the API never call it.
// Identical queries reuse raw cache indefinitely unless refresh is requested.
func Prepare(ctx context.Context, path, endpoint string, refresh bool, audit *Audit) (*Dataset, error) {
	if !refresh {
		if d, e := LoadDataset(path); e == nil {
			if audit != nil {
				return nil, fmt.Errorf("audit change requires --refresh")
			}
			return d, nil
		}
	}
	query := importQuery()
	sum := sha256.Sum256([]byte(endpoint + query))
	key := hex.EncodeToString(sum[:])
	rawPath := filepath.Join(filepath.Dir(path), "overpass-"+key+".json")
	raw, err := os.ReadFile(rawPath)
	if refresh || err != nil {
		req, e := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(url.Values{"data": {query}}.Encode()))
		if e != nil {
			return nil, e
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.Header.Set("User-Agent", UserAgent)
		client := &http.Client{Timeout: 150 * time.Second}
		res, e := client.Do(req)
		if e != nil {
			return nil, e
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("Overpass returned %d; retry-after=%q; no automatic retries", res.StatusCode, res.Header.Get("Retry-After"))
		}
		raw, e = io.ReadAll(io.LimitReader(res.Body, 40_000_001))
		if e != nil {
			return nil, e
		}
		if len(raw) > 40_000_000 {
			return nil, fmt.Errorf("pilot extract exceeds 40 MB limit")
		}
		var check OSMResponse
		if e = json.Unmarshal(raw, &check); e != nil || check.Remark != "" || len(check.Elements) == 0 {
			return nil, fmt.Errorf("incomplete Overpass response: %s", check.Remark)
		}
		if e = os.MkdirAll(filepath.Dir(path), 0755); e != nil {
			return nil, e
		}
		if e = atomicBytes(rawPath, raw); e != nil {
			return nil, e
		}
	}
	d, err := BuildDataset(raw)
	if err != nil {
		return nil, err
	}
	d.Audit = audit
	d.Metadata["overpass_endpoint"] = endpoint
	d.Metadata["query_sha256"] = key
	if err = SaveDataset(path, d); err != nil {
		return nil, err
	}
	return d, nil
}
func atomicBytes(path string, body []byte) error {
	f, e := os.CreateTemp(filepath.Dir(path), "download-*.tmp")
	if e != nil {
		return e
	}
	name := f.Name()
	defer os.Remove(name)
	if _, e = f.Write(body); e != nil {
		f.Close()
		return e
	}
	if e = f.Close(); e != nil {
		return e
	}
	return os.Rename(name, path)
}
func denied(v string) bool {
	switch v {
	case "no", "private", "customers", "destination", "delivery", "use_sidepath", "agricultural", "forestry":
		return true
	}
	return false
}
func walkingWay(t map[string]string) (bool, bool) {
	if t["area"] == "yes" || t["indoor"] == "yes" || t["construction"] != "" || t["proposed"] != "" || t["foot:conditional"] != "" || t["access:conditional"] != "" {
		return false, false
	}
	foot := t["foot"]
	if denied(foot) || (denied(t["access"]) && foot != "yes" && foot != "designated" && foot != "permissive") {
		return false, false
	}
	switch t["highway"] {
	case "footway", "pedestrian", "path", "steps":
		return true, t["tunnel"] != "yes" && t["bridge"] != "yes" && (t["layer"] == "" || t["layer"] == "0")
	case "living_street", "residential", "service":
		if t["sidewalk"] == "separate" {
			return false, false
		}
		return true, false // lawful mapped road route, no fabricated sidewalk offset or shade
	}
	return false, false
}
func blockedNode(t map[string]string) bool {
	if denied(t["foot"]) || (denied(t["access"]) && t["foot"] != "yes" && t["foot"] != "designated") {
		return true
	}
	if t["barrier"] != "" {
		switch t["barrier"] {
		case "bollard", "cycle_barrier", "kerb", "entrance":
			return false
		}
		return t["foot"] != "yes" && t["foot"] != "designated" && t["access"] != "yes"
	}
	return false
}
func BuildDataset(raw []byte) (*Dataset, error) {
	var osm OSMResponse
	if err := json.Unmarshal(raw, &osm); err != nil {
		return nil, err
	}
	if osm.Remark != "" {
		return nil, fmt.Errorf("partial OSM result: %s", osm.Remark)
	}
	nodes := map[int64]OSMElement{}
	ways := map[int64]OSMElement{}
	relations := []OSMElement{}
	for _, e := range osm.Elements {
		switch e.Type {
		case "node":
			nodes[e.ID] = e
		case "way":
			ways[e.ID] = e
		case "relation":
			relations = append(relations, e)
		}
	}
	d := &Dataset{Version: 1, CRS: "EPSG:32635", PilotID: PilotID, Pilot: PilotMetric(), Imported: PilotMetric().Expand(500), Metadata: map[string]string{"imported_at": time.Now().UTC().Format(time.RFC3339), "osm_base_timestamp": osm.OSM3S.Timestamp, "data_license": "ODbL-1.0", "attribution": Attribution, "field_validated": "false", "building_inventory": "not_verified_complete"}}
	geometry := func(ids []int64) ([]Point, bool) {
		out := []Point{}
		for _, id := range ids {
			n, ok := nodes[id]
			if !ok {
				return nil, false
			}
			out = append(out, Project(Coordinate{n.Lat, n.Lon}))
		}
		return out, len(out) >= 4 && ids[0] == ids[len(ids)-1]
	}
	used := map[int64]bool{}
	skipped := 0
	for _, rel := range relations {
		if !isBuilding(rel.Tags) {
			continue
		}
		outer, inner := [][]int64{}, [][]int64{}
		valid := true
		memberIDs := []int64{}
		for _, m := range rel.Members {
			if m.Type != "way" {
				continue
			}
			w, ok := ways[m.Ref]
			if !ok {
				valid = false
				break
			}
			memberIDs = append(memberIDs, m.Ref)
			if m.Role == "inner" {
				inner = append(inner, w.Nodes)
			} else if m.Role == "outer" || m.Role == "" {
				outer = append(outer, w.Nodes)
			}
		}
		or, ok := joinRings(outer)
		ir, ok2 := joinRings(inner)
		if !valid || !ok || !ok2 || len(or) == 0 {
			skipped++
			continue
		}
		polys := []Polygon{}
		for _, r := range or {
			p, ok := geometry(r)
			if !ok {
				valid = false
				break
			}
			polys = append(polys, Polygon{p})
		}
		for _, r := range ir {
			hole, ok := geometry(r)
			if !ok {
				valid = false
				break
			}
			assigned := false
			for i := range polys {
				if ringContains(polys[i][0], hole[0]) {
					polys[i] = append(polys[i], hole)
					assigned = true
					break
				}
			}
			if !assigned {
				valid = false
				break
			}
		}
		if !valid {
			skipped++
			continue
		}
		d.Buildings = append(d.Buildings, Building{ID: fmt.Sprintf("relation/%d", rel.ID), Geometry: polys, Tags: rel.Tags, Height: BuildingHeight(rel.Tags)})
		for _, id := range memberIDs {
			used[id] = true
		}
	}
	ids := make([]int64, 0, len(ways))
	for id := range ways {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	for _, id := range ids {
		w := ways[id]
		if isBuilding(w.Tags) && !used[id] {
			if p, ok := geometry(w.Nodes); ok {
				d.Buildings = append(d.Buildings, Building{ID: fmt.Sprintf("way/%d", id), Geometry: []Polygon{{p}}, Tags: w.Tags, Height: BuildingHeight(w.Tags)})
			} else {
				skipped++
			}
		}
	}
	for i := range d.Buildings {
		all := []Point{}
		for _, p := range d.Buildings[i].Geometry {
			all = append(all, p[0]...)
		}
		d.Buildings[i].Box = bounds(all)
	}
	kept := map[int64]Point{}
	excluded := 0
	for _, id := range ids {
		w := ways[id]
		allowed, positionKnown := walkingWay(w.Tags)
		if !allowed {
			continue
		}
		for i := 1; i < len(w.Nodes); i++ {
			a, ok := nodes[w.Nodes[i-1]]
			b, ok2 := nodes[w.Nodes[i]]
			if !ok || !ok2 || blockedNode(a.Tags) || blockedNode(b.Tags) {
				excluded++
				continue
			}
			p, q := Project(Coordinate{a.Lat, a.Lon}), Project(Coordinate{b.Lat, b.Lon})
			if !d.Pilot.Contains(p) || !d.Pilot.Contains(q) || distance(p, q) < .05 {
				continue
			}
			blocked := false
			box := bounds([]Point{p, q})
			for _, building := range d.Buildings {
				if !box.Intersects(building.Box) {
					continue
				}
				for _, poly := range building.Geometry {
					if _, hit := firstInteriorDistance(p, q, poly); hit {
						blocked = true
						break
					}
				}
				if blocked {
					break
				}
			}
			if blocked {
				excluded++
				continue
			}
			kept[a.ID] = p
			kept[b.ID] = q
			edge := Edge{From: a.ID, To: b.ID, WayID: id, Geometry: []Point{p, q}, Highway: w.Tags["highway"], PositionKnown: positionKnown}
			footDir := w.Tags["oneway:foot"]
			if footDir != "-1" {
				d.Edges = append(d.Edges, edge)
			}
			if footDir != "yes" && footDir != "1" && footDir != "true" {
				edge.From, edge.To = edge.To, edge.From
				edge.Geometry = []Point{q, p}
				d.Edges = append(d.Edges, edge)
			}
		}
	}
	nids := make([]int64, 0, len(kept))
	for id := range kept {
		nids = append(nids, id)
	}
	sort.Slice(nids, func(i, j int) bool { return nids[i] < nids[j] })
	for _, id := range nids {
		d.Nodes = append(d.Nodes, Node{id, kept[id]})
	}
	d.Metadata["skipped_buildings"] = fmt.Sprint(skipped)
	d.Metadata["excluded_edges"] = fmt.Sprint(excluded)
	if err := d.Initialize(); err != nil {
		return nil, err
	}
	return d, nil
}
func isBuilding(tags map[string]string) bool {
	return (tags["building"] != "" && tags["building"] != "no") || (tags["building:part"] != "" && tags["building:part"] != "no")
}
func joinRings(parts [][]int64) ([][]int64, bool) {
	pending := append([][]int64(nil), parts...)
	out := [][]int64{}
	for len(pending) > 0 {
		r := append([]int64(nil), pending[0]...)
		pending = pending[1:]
		if len(r) < 2 {
			return nil, false
		}
		for r[0] != r[len(r)-1] {
			found := false
			for i, p := range pending {
				if len(p) < 2 {
					return nil, false
				}
				if r[len(r)-1] == p[0] {
					r = append(r, p[1:]...)
				} else if r[len(r)-1] == p[len(p)-1] {
					for j := len(p) - 2; j >= 0; j-- {
						r = append(r, p[j])
					}
				} else {
					continue
				}
				pending = append(pending[:i], pending[i+1:]...)
				found = true
				break
			}
			if !found {
				return nil, false
			}
		}
		if len(r) < 4 {
			return nil, false
		}
		out = append(out, r)
	}
	return out, true
}
