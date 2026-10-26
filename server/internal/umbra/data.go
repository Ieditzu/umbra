package umbra

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const PilotID = "constanta-central-v1"

var PilotBBox = Bounds{28.630, 44.170, 28.640, 44.180} // lon/lat only at import boundary
const Attribution = "© OpenStreetMap contributors — ODbL 1.0 — https://www.openstreetmap.org/copyright"

type Node struct {
	ID    int64 `json:"id"`
	Point Point `json:"point"`
}
type Edge struct {
	From          int64   `json:"from"`
	To            int64   `json:"to"`
	WayID         int64   `json:"way_id"`
	Geometry      []Point `json:"geometry"`
	Highway       string  `json:"highway"`
	PositionKnown bool    `json:"position_known"`
	Length        float64 `json:"-"`
}
type Height struct {
	Low    float64 `json:"low_m"`
	High   float64 `json:"high_m"`
	Source string  `json:"source"`
}
type Building struct {
	ID       string            `json:"id"`
	Geometry []Polygon         `json:"geometry"`
	Tags     map[string]string `json:"tags"`
	Height   Height            `json:"height"`
	Box      Bounds            `json:"-"`
}
type Audit struct {
	Area       Polygon `json:"area"`
	MaxHeight  float64 `json:"max_obstacle_height_m"`
	Source     string  `json:"source"`
	ReviewedAt string  `json:"reviewed_at"`
}
type Dataset struct {
	Version   int               `json:"schema_version"`
	CRS       string            `json:"crs"`
	PilotID   string            `json:"pilot_id"`
	Pilot     Bounds            `json:"pilot_m"`
	Imported  Bounds            `json:"imported_m"`
	Nodes     []Node            `json:"nodes"`
	Edges     []Edge            `json:"edges"`
	Buildings []Building        `json:"buildings"`
	Metadata  map[string]string `json:"metadata"`
	Audit     *Audit            `json:"obstruction_audit,omitempty"`
	Adjacency map[int64][]int   `json:"-"`
	Positions map[int64]Point   `json:"-"`
}

func DefaultDataPath() string {
	if p := os.Getenv("UMBRA_DATA_PATH"); p != "" {
		return p
	}
	d, err := os.UserCacheDir()
	if err != nil {
		d = ".cache"
	}
	return filepath.Join(d, "umbra-server", PilotID, "dataset.json")
}
func parsePositive(s string) float64 {
	s = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(s), " m"))
	v, e := strconv.ParseFloat(s, 64)
	if e != nil || math.IsNaN(v) || math.IsInf(v, 0) || v <= 0 {
		return 0
	}
	return v
}
func BuildingHeight(tags map[string]string) Height {
	// Elevated volumes/roof-only structures cannot be treated as solid ground-level prisms.
	if parsePositive(tags["min_height"]) > 0 || parsePositive(tags["building:min_level"]) > 0 || tags["building"] == "roof" {
		return Height{Source: "unsupported_elevated"}
	}
	// Reject implausible pilot tags before they cast an effectively infinite
	// shadow. This sanity cap is not a completeness/height-ceiling audit.
	if h := parsePositive(tags["height"]); h > 0 && h <= 1000 {
		return Height{h, h, "osm_height_tag"}
	}
	if n := parsePositive(tags["building:levels"]); n > 0 && n <= 150 {
		return Height{n * 2.5, n*3.5 + 3, "estimated_from_levels"}
	}
	return Height{Source: "missing"}
}
func (d *Dataset) Initialize() error {
	if d.Version != 1 || d.CRS != "EPSG:32635" {
		return fmt.Errorf("unsupported cache schema or CRS")
	}
	if len(d.Nodes) == 0 || len(d.Edges) == 0 {
		return fmt.Errorf("walking graph is empty")
	}
	d.Positions = map[int64]Point{}
	d.Adjacency = map[int64][]int{}
	for _, n := range d.Nodes {
		if _, ok := d.Positions[n.ID]; ok {
			return fmt.Errorf("duplicate node")
		}
		if !d.Pilot.Contains(n.Point) {
			return fmt.Errorf("node outside pilot")
		}
		d.Positions[n.ID] = n.Point
	}
	for i := range d.Edges {
		e := &d.Edges[i]
		a, ok := d.Positions[e.From]
		b, ok2 := d.Positions[e.To]
		if !ok || !ok2 || len(e.Geometry) < 2 || distance(a, e.Geometry[0]) > .01 || distance(b, e.Geometry[len(e.Geometry)-1]) > .01 {
			return fmt.Errorf("edge endpoint geometry is disconnected")
		}
		e.Length = length(e.Geometry)
		if e.Length <= 0 || !finite(e.Length) {
			return fmt.Errorf("invalid edge length")
		}
		d.Adjacency[e.From] = append(d.Adjacency[e.From], i)
	}
	for i := range d.Buildings {
		b := &d.Buildings[i]
		if len(b.Geometry) == 0 {
			return fmt.Errorf("empty building geometry")
		}
		all := []Point{}
		for _, p := range b.Geometry {
			if len(p) == 0 {
				return fmt.Errorf("empty polygon")
			}
			for _, r := range p {
				if len(r) < 4 || distance(r[0], r[len(r)-1]) > .01 {
					return fmt.Errorf("unclosed building ring")
				}
			}
			all = append(all, p[0]...)
		}
		b.Box = bounds(all)
		b.Height = BuildingHeight(b.Tags)
	}
	if d.Audit != nil && (d.Audit.MaxHeight <= 0 || !finite(d.Audit.MaxHeight) || d.Audit.Source == "" || d.Audit.ReviewedAt == "" || len(d.Audit.Area) == 0) {
		return fmt.Errorf("invalid obstruction audit")
	}
	return nil
}
func LoadDataset(path string) (*Dataset, error) {
	f, e := os.Open(path)
	if e != nil {
		return nil, e
	}
	defer f.Close()
	var d Dataset
	if e = json.NewDecoder(f).Decode(&d); e != nil {
		return nil, e
	}
	if e = d.Initialize(); e != nil {
		return nil, e
	}
	return &d, nil
}
func SaveDataset(path string, d *Dataset) error {
	if e := d.Initialize(); e != nil {
		return e
	}
	if e := os.MkdirAll(filepath.Dir(path), 0755); e != nil {
		return e
	}
	f, e := os.CreateTemp(filepath.Dir(path), "dataset-*.tmp")
	if e != nil {
		return e
	}
	name := f.Name()
	defer os.Remove(name)
	if e = json.NewEncoder(f).Encode(d); e != nil {
		f.Close()
		return e
	}
	if e = f.Sync(); e != nil {
		f.Close()
		return e
	}
	if e = f.Close(); e != nil {
		return e
	}
	return os.Rename(name, path)
}
func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }
