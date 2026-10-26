package tests

import (
	"encoding/json"
	u "github.com/Ieditzu/umbra/server/internal/umbra"
	"testing"
)

func TestCityExtractIncludesNeighbourhoodsOutsideCentralPilot(t *testing.T) {
	raw := []byte(`{"osm3s":{"timestamp_osm_base":"2026-10-26T00:00:00Z"},"elements":[
 {"type":"node","id":1,"lat":44.25,"lon":28.62},
 {"type":"node","id":2,"lat":44.251,"lon":28.62},
 {"type":"way","id":10,"nodes":[1,2],"tags":{"highway":"footway"}}]}`)
	d, err := u.BuildDatasetArea(raw, u.CityArea, "constanta-city-v1")
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Nodes) != 2 || len(d.Edges) != 2 || d.PilotID != "constanta-city-v1" {
		t.Fatal("city graph was cropped to the old pilot")
	}
	for _, c := range []u.Coordinate{{Latitude: 44.18, Longitude: 28.65}, {Latitude: 44.23, Longitude: 28.61}, {Latitude: 44.28, Longitude: 28.62}, {Latitude: 44.12, Longitude: 28.60}} {
		if !d.Pilot.Contains(u.Project(c)) {
			b, _ := json.Marshal(c)
			t.Fatalf("missing city location %s", b)
		}
	}
	if _, err := u.BuildDataset(raw); err == nil {
		t.Fatal("central reference unexpectedly includes Mamaia")
	}
}
