package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	u "github.com/Ieditzu/umbra/server/internal/umbra"
	"github.com/peterstace/simplefeatures/geom"
)

func overlayRequest(t *testing.T) u.OverlayRequest {
	t.Helper()
	return u.OverlayRequest{At: "2026-06-21T09:00:00.000Z", Bounds: []float64{28.635, 44.171, 28.640, 44.175}}
}
func overlayFixture(t *testing.T) *u.Router {
	t.Helper()
	d := shadowData(t)
	p := d.Nodes[0].Point
	d.Buildings = []u.Building{
		{ID: "tagged", Geometry: []u.Polygon{u.Rect(u.Bounds{West: p.X, South: p.Y, East: p.X + 15, North: p.Y + 15})}, Tags: map[string]string{"height": "12"}},
		{ID: "levels", Geometry: []u.Polygon{u.Rect(u.Bounds{West: p.X + 40, South: p.Y, East: p.X + 55, North: p.Y + 15})}, Tags: map[string]string{"building:levels": "4"}},
		{ID: "missing", Geometry: []u.Polygon{u.Rect(u.Bounds{West: p.X - 50, South: p.Y, East: p.X - 35, North: p.Y + 15})}, Tags: map[string]string{}},
	}
	if err := d.Initialize(); err != nil {
		t.Fatal(err)
	}
	return u.NewRouter(d)
}

func covered(t *testing.T, g geom.Geometry, p u.Point) bool {
	t.Helper()
	ok, err := geom.Covers(g, geom.NewPointXY(p.X, p.Y).AsGeometry())
	if err != nil {
		t.Fatal(err)
	}
	return ok
}
func TestMapShadowDirectionLengthAndCourtyard(t *testing.T) {
	p := u.Project(u.Coordinate{Latitude: 44.1733, Longitude: 28.6383})
	poly := u.Rect(u.Bounds{West: p.X, South: p.Y, East: p.X + 10, North: p.Y + 10})
	shadow, err := u.CastShadow(poly, 10, u.Sun{Elevation: 45, Azimuth: 0})
	if err != nil {
		t.Fatal(err)
	}
	if !covered(t, shadow, u.Point{X: p.X + 5, Y: p.Y - 5}) {
		t.Fatal("north sun must cast a south shadow")
	}
	if covered(t, shadow, u.Point{X: p.X + 5, Y: p.Y - 12}) || covered(t, shadow, u.Point{X: p.X + 5, Y: p.Y + 5}) {
		t.Fatal("shadow exceeds its length or covers the building footprint")
	}
	outer := u.Rect(u.Bounds{West: p.X, South: p.Y, East: p.X + 40, North: p.Y + 40})
	hole := u.Rect(u.Bounds{West: p.X + 10, South: p.Y + 10, East: p.X + 30, North: p.Y + 30})
	outer = append(outer, hole[0])
	g, err := u.CastShadow(outer, 3, u.Sun{Elevation: 45, Azimuth: 0})
	if err != nil {
		t.Fatal(err)
	}
	if covered(t, g, u.Point{X: p.X + 20, Y: p.Y + 20}) {
		t.Fatal("courtyard was filled by a convex hull")
	}
	if !covered(t, g, u.Point{X: p.X + 20, Y: p.Y + 28}) {
		t.Fatal("courtyard wall must cast into the courtyard")
	}
}
func TestConcaveShadowDoesNotInventAConvexHull(t *testing.T) {
	p := u.Project(u.Coordinate{Latitude: 44.1733, Longitude: 28.6383})
	poly := u.Polygon{{p, {X: p.X + 30, Y: p.Y}, {X: p.X + 30, Y: p.Y + 10}, {X: p.X + 10, Y: p.Y + 10}, {X: p.X + 10, Y: p.Y + 30}, {X: p.X, Y: p.Y + 30}, p}}
	g, err := u.CastShadow(poly, 3, u.Sun{Elevation: 45, Azimuth: 0})
	if err != nil {
		t.Fatal(err)
	}
	if covered(t, g, u.Point{X: p.X + 22, Y: p.Y + 18}) {
		t.Fatal("concavity falsely shaded")
	}
}
func TestOverlayMetadataHeightSourcesAndMobileParser(t *testing.T) {
	r := overlayFixture(t)
	q := overlayRequest(t)
	result, err := r.MapShadows(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	if result.At != q.At || result.State != "available" || result.FieldValidated || len(result.Features) < 3 {
		t.Fatalf("unexpected overlay: %+v", result)
	}
	sources := map[string]bool{}
	for _, feature := range result.Features {
		sources[feature.Properties.HeightSource] = true
	}
	for _, source := range []string{"osm_height", "levels_estimate", "unknown"} {
		if !sources[source] {
			t.Fatal("missing source", source)
		}
	}
	response, _ := json.Marshal(result)
	module, err := filepath.Abs("../../mobile/src/domain/shadows.ts")
	if err != nil {
		t.Fatal(err)
	}
	moduleURL := (&url.URL{Scheme: "file", Path: module}).String()
	payload, _ := json.Marshal(map[string]any{"response": json.RawMessage(response), "at": q.At})
	script := `import fs from 'node:fs'; const {parseShadowLayer}=await import(process.argv[1]); const {response,at}=JSON.parse(fs.readFileSync(0,'utf8')); const layer=parseShadowLayer(response,at);if(!layer.polygons.length)throw Error('missing polygons');console.log('mobile overlay accepted');`
	cmd := exec.Command("node", "--experimental-strip-types", "--input-type=module", "-e", script, moduleURL)
	cmd.Stdin = bytes.NewReader(payload)
	if out, err := cmd.CombinedOutput(); err != nil || !strings.Contains(string(out), "accepted") {
		t.Fatalf("mobile overlay parser rejected response: %v %s", err, out)
	}
}
func TestOverlayNightHistoricalAndTimeChange(t *testing.T) {
	r := overlayFixture(t)
	q := overlayRequest(t)
	day, err := r.MapShadows(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	q.At = "2026-06-21T21:00:00.000Z"
	night, err := r.MapShadows(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	if night.State != "night" || len(night.Features) != 0 {
		t.Fatal("night invented a daylight shadow", night.State)
	}
	q.At = "2026-06-21T12:00:00.000Z"
	later, err := r.MapShadows(context.Background(), q)
	if err != nil {
		t.Fatal(err)
	}
	if math.Abs(day.Azimuth-later.Azimuth) < 10 {
		t.Fatal("time did not change solar geometry")
	}
	q.At = "2020-06-21T09:00:00Z"
	if _, err = r.MapShadows(context.Background(), q); err != nil {
		t.Fatal("historical inspection should not use route future-only validation", err)
	}
}
func TestOverlayViewportValidationClippingAndCancellation(t *testing.T) {
	r := overlayFixture(t)
	q := overlayRequest(t)
	for _, bad := range []u.OverlayRequest{{At: q.At}, {At: "yesterday", Bounds: q.Bounds}, {At: q.At, Bounds: []float64{0, 0, 1, 1}}, {At: q.At, Bounds: []float64{28.64, 44.17, 28.63, 44.18}}, {At: q.At, Bounds: []float64{28.63, math.NaN(), 28.64, 44.18}}} {
		if _, err := r.MapShadows(context.Background(), bad); err == nil {
			t.Fatal("invalid viewport accepted", bad)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := r.MapShadows(ctx, q); err == nil {
		t.Fatal("cancelled overlay was computed")
	}
	q.Bounds = []float64{28.62, 44.16, 28.66, 44.19}
	result, err := r.MapShadows(context.Background(), q)
	if err != nil || !result.PartialCoverage {
		t.Fatal("partial coverage not disclosed", err)
	}
}
func TestShadowHTTPValidationAndConcurrentCache(t *testing.T) {
	r := overlayFixture(t)
	handler := u.NewHandler(r)
	q := overlayRequest(t)
	for _, body := range []string{`{}`, `null`, `{"at":"bad","bounds":[]}`, `{"at":"2026-06-21T09:00:00Z","bounds":[28.635,44.171,28.640,44.175]} {}`} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/v1/shadows", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(w, req)
		if w.Code != 422 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	body, _ := json.Marshal(q)
	request := func() *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("POST", "/v1/shadows", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		handler.ServeHTTP(w, req)
		return w
	}
	first, second := request(), request()
	if first.Code != 200 || second.Code != 200 || first.Body.String() != second.Body.String() {
		t.Fatal("cache response changed", first.Code, second.Code)
	}
	t.Run("cache race", func(t *testing.T) {
		for range 8 {
			t.Run("request", func(t *testing.T) {
				t.Parallel()
				if got := request(); got.Code != 200 {
					t.Fatal(got.Code)
				}
			})
		}
	})
	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/v1/shadows", bytes.NewReader(body))
	req.Header.Set("Content-Type", "text/plain")
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusUnsupportedMediaType {
		t.Fatal(w.Code)
	}
	w = httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/v1/shadows", strings.NewReader(strings.Repeat(" ", 17000)))
	req.Header.Set("Content-Type", "application/json")
	handler.ServeHTTP(w, req)
	if w.Code != 413 {
		t.Fatal(w.Code)
	}
	w = httptest.NewRecorder()
	u.NewHandler(nil).ServeHTTP(w, httptest.NewRequest("POST", "/v1/shadows", bytes.NewReader(body)))
	if w.Code != 503 {
		t.Fatal(w.Code)
	}
}
func TestOverlayComputeBudget(t *testing.T) {
	r := overlayFixture(t)
	r.Settings.ComputeBudget = time.Nanosecond
	if _, err := r.MapShadows(context.Background(), overlayRequest(t)); err == nil {
		t.Fatal("deadline ignored")
	}
}
