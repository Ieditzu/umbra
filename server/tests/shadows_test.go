package tests

import (
	u "github.com/Ieditzu/umbra/server/internal/umbra"
	"math"
	"testing"
	"time"
)

func shadowData(t *testing.T) *u.Dataset {
	t.Helper()
	p := u.Project(u.Coordinate{Latitude: 44.1733, Longitude: 28.6383})
	b := u.Bounds{West: p.X - 1000, South: p.Y - 1000, East: p.X + 1000, North: p.Y + 1000}
	d := &u.Dataset{Version: 1, CRS: "EPSG:32635", PilotID: "synthetic", Pilot: b, Imported: b, Nodes: []u.Node{{ID: 1, Point: p}, {ID: 2, Point: u.Point{X: p.X + 100, Y: p.Y}}}, Edges: []u.Edge{{From: 1, To: 2, Geometry: []u.Point{p, {X: p.X + 100, Y: p.Y}}, PositionKnown: true}}, Metadata: map[string]string{"evidence": "synthetic"}, Audit: &u.Audit{Area: u.Rect(b), MaxHeight: 100, Source: "synthetic complete inventory", ReviewedAt: "2026-01-01T00:00:00Z"}}
	if err := d.Initialize(); err != nil {
		t.Fatal(err)
	}
	return d
}
func TestVerifiableBuildingShadow(t *testing.T) {
	d := shadowData(t)
	p := d.Nodes[0].Point
	d.Buildings = []u.Building{{ID: "box", Geometry: []u.Polygon{u.Rect(u.Bounds{West: p.X - 10, South: p.Y + 5, East: p.X + 10, North: p.Y + 15})}, Tags: map[string]string{"height": "10"}}}
	if err := d.Initialize(); err != nil {
		t.Fatal(err)
	}
	m := u.Model{Data: d}
	sun := u.Sun{Elevation: 45, Azimuth: 0}
	if got := m.ClassifyAt(p, sun, true); got.Exposure != "shade" {
		t.Fatal(got)
	} // south of building, low ray meets roof
	far := u.Point{X: p.X, Y: p.Y - 20}
	if got := m.ClassifyAt(far, sun, true); got.Exposure != "sun" {
		t.Fatal(got)
	} // 25 m from building, 10 m shadow cannot reach
	if got := m.ClassifyAt(p, u.Sun{Elevation: 45, Azimuth: 180}, true); got.Exposure != "sun" {
		t.Fatal("shadow points toward sun", got)
	}
}
func TestMissingHeightAndMissingInventory(t *testing.T) {
	d := shadowData(t)
	p := d.Nodes[0].Point
	d.Buildings = []u.Building{{ID: "missing", Geometry: []u.Polygon{u.Rect(u.Bounds{West: p.X - 10, South: p.Y + 5, East: p.X + 10, North: p.Y + 15})}, Tags: map[string]string{}}}
	if err := d.Initialize(); err != nil {
		t.Fatal(err)
	}
	m := u.Model{Data: d}
	if got := m.ClassifyAt(p, u.Sun{Elevation: 45, Azimuth: 0}, true); got.Exposure != "unknown" || got.Reason != "height_uncertainty" {
		t.Fatal(got)
	}
	d.Buildings = nil
	d.Audit = nil
	if got := m.ClassifyAt(p, u.Sun{Elevation: 45, Azimuth: 0}, true); got.Exposure != "unknown" {
		t.Fatal(got)
	}
}
func TestEstimatedHeightBand(t *testing.T) {
	d := shadowData(t)
	p := d.Nodes[0].Point
	d.Buildings = []u.Building{{ID: "levels", Geometry: []u.Polygon{u.Rect(u.Bounds{West: p.X - 20, South: p.Y + 7, East: p.X + 20, North: p.Y + 12})}, Tags: map[string]string{"building:levels": "2"}}}
	if err := d.Initialize(); err != nil {
		t.Fatal(err)
	}
	got := (u.Model{Data: d}).ClassifyAt(p, u.Sun{Elevation: 45, Azimuth: 0}, true)
	if got.Exposure != "unknown" {
		t.Fatal("5–10 m height range should disagree at 7m", got)
	}
}
func TestNightHorizonAndRoad(t *testing.T) {
	d := shadowData(t)
	m := u.Model{Data: d}
	p := d.Nodes[0].Point
	for _, c := range []struct {
		sun    u.Sun
		known  bool
		reason string
	}{{u.Sun{Elevation: -20}, true, "night"}, {u.Sun{Elevation: 2}, true, "low_sun"}, {u.Sun{Elevation: 50}, false, "road_or_grade_position"}} {
		got := m.ClassifyAt(p, c.sun, c.known)
		if got.Exposure != "unknown" || got.Reason != c.reason {
			t.Fatal(got)
		}
	}
}
func TestSolarAgainstIndependentSPAReference(t *testing.T) {
	cases := []struct {
		when     string
		elev, az float64
	}{{"2026-06-21T09:00:00Z", 65.107850, 140.921654}, {"2026-10-25T00:30:00Z", -42.987458, 59.458320}, {"2026-10-25T01:30:00Z", -33.143967, 73.334045}, {"2026-12-21T10:00:00Z", 22.383078, 179.139205}, {"2026-06-21T21:00:00Z", -20.654585, 343.501197}}
	for _, c := range cases {
		at, _ := time.Parse(time.RFC3339, c.when)
		got := u.SolarPosition(at, u.Coordinate{Latitude: 44.1733, Longitude: 28.6383})
		if math.Abs(got.Elevation-c.elev) > .03 || math.Abs(got.Azimuth-c.az) > .05 {
			t.Fatalf("%s: %+v", c.when, got)
		}
	}
}
func TestSolarUsesInstantAcrossDST(t *testing.T) {
	loc, err := time.LoadLocation("Europe/Bucharest")
	if err != nil {
		t.Fatal(err)
	}
	a, _ := time.Parse(time.RFC3339, "2026-10-25T03:30:00+03:00")
	b, _ := time.Parse(time.RFC3339, "2026-10-25T03:30:00+02:00")
	c := u.Coordinate{Latitude: 44.1733, Longitude: 28.6383}
	if u.SolarPosition(a, c) != u.SolarPosition(a.In(loc), c) {
		t.Fatal("timezone changed instant")
	}
	if math.Abs(u.SolarPosition(a, c).Azimuth-u.SolarPosition(b, c).Azimuth) < 5 {
		t.Fatal("ambiguous DST instants collapsed")
	}
}
