package tests

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	u "github.com/Ieditzu/umbra/server/internal/umbra"
)

func TestHTTPResponseAgainstUnmodifiedMobileParser(t *testing.T) {
	r, q := routingFixture(t)
	b, _ := json.Marshal(q)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/routes/compare", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	u.NewHandler(r).ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var response any
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	module, err := filepath.Abs("../../mobile/src/domain/routes.ts")
	if err != nil {
		t.Fatal(err)
	}
	moduleURL := (&url.URL{Scheme: "file", Path: module}).String()
	payload, _ := json.Marshal(map[string]any{"request": q, "response": response})
	// Executes the production TypeScript validator without copying or editing it.
	script := `import fs from 'node:fs'; const {parseComparison}=await import(process.argv[1]); const {request,response}=JSON.parse(fs.readFileSync(0,'utf8')); const result=parseComparison(response,request); if(!result.routes.length)throw Error('empty routes'); console.log('mobile contract accepted');`
	cmd := exec.Command("node", "--experimental-strip-types", "--input-type=module", "-e", script, moduleURL)
	cmd.Stdin = bytes.NewReader(payload)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("mobile parser rejected real HTTP response: %v\n%s", err, out)
	}
	if !strings.Contains(string(out), "accepted") {
		t.Fatal(string(out))
	}
}
func TestReadinessAndHTTPValidation(t *testing.T) {
	notReady := httptest.NewRecorder()
	u.NewHandler(nil).ServeHTTP(notReady, httptest.NewRequest("GET", "/health", nil))
	if notReady.Code != 503 {
		t.Fatal(notReady.Code)
	}
	r, q := routingFixture(t)
	handler := u.NewHandler(r)
	health := httptest.NewRecorder()
	handler.ServeHTTP(health, httptest.NewRequest("GET", "/health", nil))
	if health.Code != 200 {
		t.Fatal(health.Code)
	}
	for _, body := range []string{`{}`, `{"schema_version":1}`, `{"schema_version":null}`, `not json`} {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest("POST", "/v1/routes/compare", strings.NewReader(body)))
		if w.Code != 422 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	b, _ := json.Marshal(q)
	var fields map[string]any
	json.Unmarshal(b, &fields)
	fields["max_extra_minutes"] = 7
	b, _ = json.Marshal(fields)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("POST", "/v1/routes/compare", bytes.NewReader(b)))
	if w.Code != 422 {
		t.Fatal(w.Code)
	}
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, httptest.NewRequest("POST", "/v1/routes/compare", strings.NewReader(strings.Repeat(" ", 17000))))
	if w.Code != 413 {
		t.Fatal(w.Code)
	}
}
