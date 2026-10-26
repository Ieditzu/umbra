package tests

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	u "github.com/Ieditzu/umbra/server/internal/umbra"
)

func TestHeightSources(t *testing.T) {
	cases := []struct {
		tags   map[string]string
		source string
		low    float64
	}{{map[string]string{"height": "12 m"}, "osm_height_tag", 12}, {map[string]string{"building:levels": "4"}, "estimated_from_levels", 10}, {map[string]string{}, "missing", 0}, {map[string]string{"height": "30 ft"}, "missing", 0}, {map[string]string{"height": "NaN", "building:levels": "2"}, "estimated_from_levels", 5}, {map[string]string{"height": "8", "min_height": "3"}, "unsupported_elevated", 0}}
	for _, c := range cases {
		h := u.BuildingHeight(c.tags)
		if h.Source != c.source || h.Low != c.low {
			t.Fatalf("%v: %+v", c.tags, h)
		}
	}
}
func extract(t *testing.T) []byte {
	t.Helper()
	raw := `{"osm3s":{"timestamp_osm_base":"2026-10-24T00:00:00Z"},"elements":[
{"type":"node","id":1,"lat":44.173,"lon":28.635},
{"type":"node","id":2,"lat":44.174,"lon":28.635},
{"type":"node","id":3,"lat":44.175,"lon":28.635},
{"type":"node","id":4,"lat":44.174,"lon":28.636},
{"type":"node","id":5,"lat":44.173,"lon":28.636},
{"type":"node","id":6,"lat":44.173,"lon":28.637},
{"type":"node","id":7,"lat":44.174,"lon":28.637},
{"type":"way","id":100,"nodes":[1,2,3],"tags":{"highway":"footway"}},
{"type":"way","id":101,"nodes":[2,4],"tags":{"highway":"footway","access":"private"}},
{"type":"way","id":102,"nodes":[3,4],"tags":{"highway":"residential","sidewalk":"separate"}},
{"type":"way","id":103,"nodes":[4,7],"tags":{"highway":"residential"}},
{"type":"way","id":104,"nodes":[5,6,7,4,5],"tags":{"building":"yes","building:levels":"2"}}
]}`
	return []byte(raw)
}
func TestOSMGraphAndCache(t *testing.T) {
	d, err := u.BuildDataset(extract(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Buildings) != 1 || len(d.Edges) != 6 {
		t.Fatalf("unexpected dataset buildings=%d edges=%d", len(d.Buildings), len(d.Edges))
	}
	for _, e := range d.Edges {
		if e.WayID == 101 || e.WayID == 102 {
			t.Fatal("restricted way imported")
		}
		if e.WayID == 103 && e.PositionKnown {
			t.Fatal("road centreline assigned sidewalk precision")
		}
	}
	p := filepath.Join(t.TempDir(), "dataset.json")
	if err = u.SaveDataset(p, d); err != nil {
		t.Fatal(err)
	}
	again, err := u.LoadDataset(p)
	if err != nil || len(again.Edges) != len(d.Edges) {
		t.Fatalf("cache round trip %v", err)
	}
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	var v map[string]any
	if json.Unmarshal(b, &v) != nil || v["crs"] != "EPSG:32635" {
		t.Fatal("cache CRS")
	}
}
func TestPreparationReusesCache(t *testing.T) {
	var calls atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.UserAgent() != u.UserAgent {
			t.Error("missing identifying user agent")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(extract(t))
	}))
	defer s.Close()
	p := filepath.Join(t.TempDir(), "dataset.json")
	for range 2 {
		if _, err := u.Prepare(context.Background(), p, s.URL, false, nil); err != nil {
			t.Fatal(err)
		}
	}
	if calls.Load() != 1 {
		t.Fatal("downloaded a cached area again")
	}
}
func TestPartialDownloadNotAccepted(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"remark":"runtime error","elements":[]}`))
	}))
	defer s.Close()
	if _, err := u.Prepare(context.Background(), filepath.Join(t.TempDir(), "data.json"), s.URL, false, nil); err == nil {
		t.Fatal("partial download accepted")
	}
}

func TestRestrictedAccessAndFootDirection(t *testing.T) {
	for _, access := range []string{"private", "permit", "customers", "destination", "unknown-value"} {
		var raw u.OSMResponse
		json.Unmarshal(extract(t), &raw)
		for i := range raw.Elements {
			if raw.Elements[i].ID == 100 && raw.Elements[i].Type == "way" {
				raw.Elements[i].Tags["access"] = access
			}
		}
		b, _ := json.Marshal(raw)
		d, err := u.BuildDataset(b)
		if err != nil {
			t.Fatal(err)
		}
		for _, e := range d.Edges {
			if e.WayID == 100 {
				t.Fatalf("restricted %s imported", access)
			}
		}
	}
	var raw u.OSMResponse
	json.Unmarshal(extract(t), &raw)
	for i := range raw.Elements {
		if raw.Elements[i].ID == 100 && raw.Elements[i].Type == "way" {
			raw.Elements[i].Tags["oneway:foot"] = "yes"
			raw.Elements[i].Tags["access"] = "private"
			raw.Elements[i].Tags["foot"] = "yes"
		}
	}
	b, _ := json.Marshal(raw)
	d, err := u.BuildDataset(b)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, e := range d.Edges {
		if e.WayID == 100 {
			count++
			if e.From >= e.To {
				t.Fatal("foot one-way ignored")
			}
		}
	}
	if count != 2 {
		t.Fatal("explicit foot access override ignored")
	}
}
func TestNoBuildingShortcut(t *testing.T) {
	var raw u.OSMResponse
	json.Unmarshal(extract(t), &raw)
	raw.Elements = append(raw.Elements, u.OSMElement{Type: "node", ID: 8, Lat: 44.1735, Lon: 28.6355}, u.OSMElement{Type: "node", ID: 9, Lat: 44.1735, Lon: 28.6375}, u.OSMElement{Type: "way", ID: 105, Nodes: []int64{8, 9}, Tags: map[string]string{"highway": "footway"}})
	b, _ := json.Marshal(raw)
	d, err := u.BuildDataset(b)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range d.Edges {
		if e.WayID == 105 {
			t.Fatal("path through building interior imported")
		}
	}
}
func TestMultipolygonOuterFragmentsAndHole(t *testing.T) {
	var raw u.OSMResponse
	json.Unmarshal(extract(t), &raw)
	for i := range raw.Elements {
		if raw.Elements[i].Type == "way" && raw.Elements[i].ID == 104 {
			raw.Elements[i].Nodes = []int64{5, 6, 7}
			raw.Elements[i].Tags = nil
		}
	}
	raw.Elements = append(raw.Elements, u.OSMElement{Type: "way", ID: 106, Nodes: []int64{7, 4, 5}}, u.OSMElement{Type: "node", ID: 10, Lat: 44.1732, Lon: 28.6362}, u.OSMElement{Type: "node", ID: 11, Lat: 44.1732, Lon: 28.6368}, u.OSMElement{Type: "node", ID: 12, Lat: 44.1738, Lon: 28.6368}, u.OSMElement{Type: "node", ID: 13, Lat: 44.1738, Lon: 28.6362}, u.OSMElement{Type: "way", ID: 107, Nodes: []int64{10, 11, 12, 13, 10}}, u.OSMElement{Type: "relation", ID: 200, Tags: map[string]string{"type": "multipolygon", "building": "yes", "height": "10"}, Members: []u.OSMMember{{Type: "way", Ref: 104, Role: "outer"}, {Type: "way", Ref: 106, Role: "outer"}, {Type: "way", Ref: 107, Role: "inner"}}})
	b, _ := json.Marshal(raw)
	d, err := u.BuildDataset(b)
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Buildings) != 1 || len(d.Buildings[0].Geometry[0]) != 2 {
		t.Fatal("relation rings lost or duplicated", d.Buildings)
	}
}
