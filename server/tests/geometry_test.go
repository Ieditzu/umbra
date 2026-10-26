package tests

import (
	u "github.com/Ieditzu/umbra/server/internal/umbra"
	"math"
	"testing"
)

func TestUTMReferenceAndRoundtrip(t *testing.T) {
	c := u.Coordinate{Latitude: 44.1733, Longitude: 28.6383}
	p := u.Project(c) // WGS84 UTM35 reference independently computed with PROJ.
	if math.Abs(p.X-630966.86447) > .01 || math.Abs(p.Y-4892426.12169) > .01 {
		t.Fatalf("projection differs from PROJ reference: %+v", p)
	}
	back := u.Unproject(p)
	if math.Abs(back.Latitude-c.Latitude) > 1e-7 || math.Abs(back.Longitude-c.Longitude) > 1e-7 {
		t.Fatal(back)
	}
}
