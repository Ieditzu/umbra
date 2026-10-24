package tests

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	u "github.com/Ieditzu/umbra/server/internal/umbra"
)

// Opt-in LOCAL cache check. Never downloads data, never substitutes for field validation.
func TestPreparedPilotSmoke(t *testing.T) {
	path := os.Getenv("UMBRA_REAL_DATA")
	if path == "" {
		t.Skip("opt-in real OSM cache check; synthetic tests remain internet independent")
	}
	d, err := u.LoadDataset(path)
	if err != nil {
		t.Fatal(err)
	}
	r := u.NewRouter(d)
	var q u.Request
	found := false
	// Find reachable endpoints by walking only imported links, not straight-line inference.
	for _, start := range d.Nodes {
		queue := []int64{start.ID}
		seen := map[int64]bool{start.ID: true}
		for len(queue) > 0 && !found {
			id := queue[0]
			queue = queue[1:]
			p := d.Positions[id]
			dx, dy := p.X-start.Point.X, p.Y-start.Point.Y
			if dx*dx+dy*dy > 200*200 {
				q = u.Request{SchemaVersion: 1, Origin: u.Unproject(start.Point), Destination: u.Unproject(p), DepartureAt: time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339Nano), DepartureTimezone: "Europe/Bucharest", MaxExtraMinutes: 5, WalkingSpeed: 1.4}
				found = true
				break
			}
			for _, ei := range d.Adjacency[id] {
				next := d.Edges[ei].To
				if !seen[next] {
					seen[next] = true
					queue = append(queue, next)
				}
			}
		}
		if found {
			break
		}
	}
	if !found {
		t.Fatal("no connected 200 m walk in pilot")
	}
	begin := time.Now()
	v, err := r.Compare(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	if len(v.Routes) == 0 {
		t.Fatal("no route")
	}
	t.Logf("real OSM cache check: nodes=%d buildings=%d candidates returned=%d calculation=%s", len(d.Nodes), len(d.Buildings), len(v.Routes), time.Since(begin))
	for _, route := range v.Routes {
		totals := map[string]float64{}
		for _, s := range route.Segments {
			totals[s.Exposure] += s.Duration
		}
		t.Logf("%s distance=%.1fm duration=%.1fs modeled exposure seconds=%v", route.Kind, route.Distance, route.Duration, totals)
	}
	if dir := os.Getenv("UMBRA_SMOKE_OUTPUT"); dir != "" {
		if err = os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
		for name, payload := range map[string]any{"request.json": q, "response.json": v} {
			b, _ := json.MarshalIndent(payload, "", "  ")
			if err = os.WriteFile(filepath.Join(dir, name), b, 0644); err != nil {
				t.Fatal(err)
			}
		}
	}
}
