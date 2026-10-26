package tests

import (
	"context"
	"math"
	"strings"
	"testing"
	"time"

	u "github.com/Ieditzu/umbra/server/internal/umbra"
)

func routingFixture(t *testing.T) (*u.Router, u.Request) {
	t.Helper()
	d := shadowData(t)
	p := d.Nodes[0].Point
	points := []u.Point{p, {X: p.X + 100, Y: p.Y}, {X: p.X, Y: p.Y + 50}, {X: p.X + 100, Y: p.Y + 50}}
	d.Nodes = nil
	d.Edges = nil
	for i, v := range points {
		d.Nodes = append(d.Nodes, u.Node{ID: int64(i + 1), Point: v})
	}
	for _, pair := range [][2]int{{1, 2}, {1, 3}, {3, 4}, {4, 2}} {
		a, b := pair[0], pair[1]
		d.Edges = append(d.Edges, u.Edge{From: int64(a), To: int64(b), Geometry: []u.Point{points[a-1], points[b-1]}, PositionKnown: true, Highway: "footway"})
	}
	if err := d.Initialize(); err != nil {
		t.Fatal(err)
	}
	r := u.NewRouter(d)
	r.Now = func() time.Time { return time.Date(2026, 6, 20, 12, 0, 0, 0, time.UTC) }
	r.Exposure = func(v u.Point, at time.Time, known bool) u.ExposureResult {
		if v.Y > p.Y+10 {
			return u.ExposureResult{Exposure: "shade", Reason: "osm_height_tag"}
		}
		return u.ExposureResult{Exposure: "sun", Reason: "audited_clear_ray"}
	}
	q := u.Request{SchemaVersion: 1, Origin: u.Unproject(points[0]), Destination: u.Unproject(points[1]), DepartureAt: "2026-06-21T12:00:00.000+03:00", DepartureTimezone: "Europe/Bucharest", MaxExtraMinutes: 5, WalkingSpeed: 1}
	return r, q
}
func TestRoutingDetourAndDistinctAlternatives(t *testing.T) {
	r, q := routingFixture(t)
	v, err := r.Compare(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Routes) != 2 || v.Routes[0].Kind != "fastest" || v.Routes[1].Kind != "shadiest" {
		t.Fatalf("routes %+v", v.Routes)
	}
	if v.DepartureAt != q.DepartureAt {
		t.Fatal("timestamp not preserved byte-for-byte")
	}
	if math.Abs(v.Routes[0].Duration-100) > .01 || math.Abs(v.Routes[1].Duration-200) > .01 {
		t.Fatal(v.Routes)
	}
	ids := map[string]bool{}
	for _, route := range v.Routes {
		if ids[route.ID] {
			t.Fatal("duplicate route")
		}
		ids[route.ID] = true
		sum := 0.
		for _, s := range route.Segments {
			sum += s.Duration
		}
		if math.Abs(sum-route.Duration) > 1e-6 {
			t.Fatal("duration mismatch")
		}
		if route.Duration > v.Routes[0].Duration+300 {
			t.Fatal("detour limit violated")
		}
	}
	q.MaxExtraMinutes = 0
	v, err = r.Compare(context.Background(), q)
	if err != nil || len(v.Routes) != 1 {
		t.Fatalf("zero detour: %+v %v", v, err)
	}
}
func TestUnknownIsNotShade(t *testing.T) {
	r, q := routingFixture(t)
	r.Exposure = func(_ u.Point, _ time.Time, _ bool) u.ExposureResult {
		return u.ExposureResult{Exposure: "unknown", Reason: "height_uncertainty"}
	}
	v, err := r.Compare(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Routes) != 1 {
		t.Fatal("all unknown should not create a benefit")
	}
	for _, s := range v.Routes[0].Segments {
		if s.Exposure != "unknown" {
			t.Fatal(s)
		}
	}
}
func TestExposureUsesArrivalTimes(t *testing.T) {
	r, q := routingFixture(t)
	q.MaxExtraMinutes = 0
	start, _ := time.Parse(time.RFC3339Nano, q.DepartureAt)
	r.Exposure = func(_ u.Point, at time.Time, _ bool) u.ExposureResult {
		if at.Sub(start) >= 50*time.Second {
			return u.ExposureResult{Exposure: "shade", Reason: "osm_height_tag"}
		}
		return u.ExposureResult{Exposure: "sun", Reason: "audited_clear_ray"}
	}
	v, err := r.Compare(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Routes[0].Segments) != 2 || v.Routes[0].Segments[0].Exposure != "sun" || v.Routes[0].Segments[1].Exposure != "shade" {
		t.Fatal(v.Routes)
	}
	if math.Abs(v.Routes[0].Segments[0].Duration-50) > 1e-6 {
		t.Fatal(v.Routes)
	}
}
func TestNoRouteOutsideAreaAndPastDate(t *testing.T) {
	r, q := routingFixture(t)
	q.Destination = u.Coordinate{}
	if _, err := r.Compare(context.Background(), q); err == nil {
		t.Fatal("outside pilot accepted")
	}
	r, q = routingFixture(t)
	q.DepartureAt = "2026-06-19T09:00:00Z"
	if _, err := r.Compare(context.Background(), q); err == nil {
		t.Fatal("past date accepted")
	}
	r, q = routingFixture(t)
	q.DepartureAt = "2026-06-21T12:00:00"
	if _, err := r.Compare(context.Background(), q); err == nil {
		t.Fatal("naive local date accepted")
	}
	r, q = routingFixture(t)
	r.Data.Edges = r.Data.Edges[:0]
	r.Data.Adjacency = map[int64][]int{}
	if _, err := r.Compare(context.Background(), q); err == nil || !strings.Contains(err.Error(), "no connected") {
		t.Fatal(err)
	}
}
func TestNightReturnsFastestWithExplicitUnknown(t *testing.T) {
	r, q := routingFixture(t)
	q.DepartureAt = "2026-06-21T23:00:00Z"
	m := u.Model{Data: r.Data}
	r.Exposure = m.At
	v, err := r.Compare(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Routes) != 1 || v.Routes[0].Segments[0].Exposure != "unknown" {
		t.Fatal(v)
	}
	if !strings.Contains(strings.Join(v.Warnings, " "), "below the horizon") {
		t.Fatal("missing night explanation")
	}
}
func TestRoutingDeadlineAndCancellation(t *testing.T) {
	r, q := routingFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := r.Compare(ctx, q); err == nil {
		t.Fatal("cancellation ignored")
	}
	r.Settings.ComputeBudget = time.Nanosecond
	if _, err := r.Compare(context.Background(), q); err == nil {
		t.Fatal("deadline ignored")
	}
}

func TestMaximumDetourExcludesLongerShadeCandidate(t *testing.T) {
	r, q := routingFixture(t)
	p := r.Data.Nodes[0].Point
	// Increase the shaded alternative to 500 m versus the 100 m baseline.
	r.Data.Nodes[2].Point.Y = p.Y + 200
	r.Data.Nodes[3].Point.Y = p.Y + 200
	positions := map[int64]u.Point{}
	for _, n := range r.Data.Nodes {
		positions[n.ID] = n.Point
	}
	for i := range r.Data.Edges {
		e := &r.Data.Edges[i]
		e.Geometry = []u.Point{positions[e.From], positions[e.To]}
	}
	if err := r.Data.Initialize(); err != nil {
		t.Fatal(err)
	}
	q.MaxExtraMinutes = 5
	v, err := r.Compare(context.Background(), q)
	if err != nil || len(v.Routes) != 1 {
		t.Fatalf("500 m walk must not fit 100 s + 300 s: %v %+v", err, v)
	}
	q.MaxExtraMinutes = 10
	v, err = r.Compare(context.Background(), q)
	if err != nil || len(v.Routes) != 2 {
		t.Fatalf("500 m walk should fit larger budget: %v %+v", err, v)
	}
}
