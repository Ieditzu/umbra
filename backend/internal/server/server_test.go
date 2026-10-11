package server

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	stripe "github.com/stripe/stripe-go/v86"
	"golang.org/x/crypto/bcrypt"
)

func testServer(t *testing.T) *Server {
	t.Helper()
	dsn := os.Getenv("UMBRA_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set UMBRA_TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	ctx := context.Background()
	admin, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	schema := "test_" + id()
	if _, e = admin.Exec(ctx, "CREATE SCHEMA "+schema); e != nil {
		t.Fatal(e)
	}
	u, e := url.Parse(dsn)
	if e != nil {
		t.Fatal(e)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	c := Config{DatabaseURL: u.String(), DataDir: t.TempDir(), FrontendDir: t.TempDir(), PublicURL: "http://localhost:8000", WorkerToken: strings.Repeat("t", 32), JobTimeout: time.Minute, MaxUpload: 1024 * 1024}
	s, e := New(ctx, c)
	if e != nil {
		t.Fatal(e)
	}
	migration, e := os.ReadFile("../../migrations/001_initial.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.DB.Exec(ctx, string(migration)); e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { s.DB.Close(); _, _ = admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); admin.Close() })
	return s
}
func testUser(t *testing.T, s *Server, credits int) (string, string) {
	t.Helper()
	uid := id()
	token := "umbra_" + randomToken()
	_, e := s.DB.Exec(context.Background(), `INSERT INTO users(id,email,password_hash,verified,credits) VALUES($1,$2,'unused',true,$3)`, uid, uid+"@example.test", credits)
	if e != nil {
		t.Fatal(e)
	}
	_, e = s.DB.Exec(context.Background(), `INSERT INTO api_keys(id,user_id,name,prefix,token_hash) VALUES($1,$2,'test','umbra_test',$3)`, id(), uid, digest(token))
	if e != nil {
		t.Fatal(e)
	}
	return uid, token
}
func call(s *Server, method, path, token string, body any, headers map[string]string) *httptest.ResponseRecorder {
	var data []byte
	if body != nil {
		data, _ = json.Marshal(body)
	}
	r := httptest.NewRequest(method, path, bytes.NewReader(data))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	s.Handler().ServeHTTP(w, r)
	return w
}
func readMap(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var v map[string]any
	if e := json.Unmarshal(w.Body.Bytes(), &v); e != nil {
		t.Fatalf("invalid JSON %s", w.Body.String())
	}
	return v
}
func mediaPair(t *testing.T, s *Server, uid string) (string, string) {
	t.Helper()
	ids := []string{id(), id()}
	for i, role := range []string{"calibration", "main"} {
		_, e := s.DB.Exec(context.Background(), `INSERT INTO media(id,user_id,role,name,relative_path,metadata,expires_at) VALUES($1,$2,$3,'clip.mp4',$4,'{}',now()+interval '30 days')`, ids[i], uid, role, "media/"+ids[i])
		if e != nil {
			t.Fatal(e)
		}
		if e = os.WriteFile(filepath.Join(s.Config.DataDir, "media", ids[i]), []byte("test fixture"), 0600); e != nil {
			t.Fatal(e)
		}
	}
	return ids[0], ids[1]
}
func TestAccountSessionsAndVerification(t *testing.T) {
	s := testServer(t)
	signup := call(s, "POST", "/api/v1/auth/signup", "", credentials{Email: "person@example.test", Password: "long-test-password"}, nil)
	if signup.Code != 201 {
		t.Fatal(signup.Code, signup.Body.String())
	}
	cookies := signup.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatal("unsafe session cookie")
	}
	cookie := cookies[0].Name + "=" + cookies[0].Value
	me := call(s, "GET", "/api/v1/me", "", nil, map[string]string{"Cookie": cookie})
	u := readMap(t, me)
	if u["available"] != float64(0) || u["verified"] != false {
		t.Fatal("credits before verification")
	}
	uid := u["id"].(string)
	known := randomToken()
	_, e := s.DB.Exec(context.Background(), `INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'verify',now()+interval '1 hour')`, digest(known), uid)
	if e != nil {
		t.Fatal(e)
	}
	verified := call(s, "POST", "/api/v1/auth/verify", "", map[string]string{"token": known}, nil)
	if verified.Code != 200 {
		t.Fatal(verified.Body.String())
	}
	if replay := call(s, "POST", "/api/v1/auth/verify", "", map[string]string{"token": known}, nil); replay.Code != 422 {
		t.Fatal("verification replay accepted")
	}
	me = call(s, "GET", "/api/v1/me", "", nil, map[string]string{"Cookie": cookie})
	u = readMap(t, me)
	if u["available"] != float64(10) {
		t.Fatal("starter grant missing")
	}
	denied := call(s, "POST", "/api/v1/keys", "", map[string]string{"name": "no csrf"}, map[string]string{"Cookie": cookie})
	if denied.Code != 403 {
		t.Fatal("missing CSRF accepted")
	}
	created := call(s, "POST", "/api/v1/keys", "", map[string]string{"name": "integration"}, map[string]string{"Cookie": cookie, "X-CSRF-Token": u["csrf_token"].(string)})
	if created.Code != 201 {
		t.Fatal(created.Body.String())
	}
	key := readMap(t, created)
	secret := key["token"].(string)
	if auth := call(s, "GET", "/api/v1/me", secret, nil, nil); auth.Code != 200 {
		t.Fatal("API key failed")
	}
	revoked := call(s, "DELETE", "/api/v1/keys/"+key["id"].(string), "", nil, map[string]string{"Cookie": cookie, "X-CSRF-Token": u["csrf_token"].(string)})
	if revoked.Code != 200 {
		t.Fatal("revoke failed")
	}
	if auth := call(s, "GET", "/api/v1/me", secret, nil, nil); auth.Code != 401 {
		t.Fatal("revoked key accepted")
	}
	resetToken := randomToken()
	_, e = s.DB.Exec(context.Background(), `INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,'reset',now()+interval '1 hour')`, digest(resetToken), uid)
	if e != nil {
		t.Fatal(e)
	}
	reset := call(s, "POST", "/api/v1/auth/reset-password", "", map[string]string{"token": resetToken, "password": "new-long-test-password"}, nil)
	if reset.Code != 200 {
		t.Fatal(reset.Body.String())
	}
	if old := call(s, "GET", "/api/v1/me", "", nil, map[string]string{"Cookie": cookie}); old.Code != 401 {
		t.Fatal("reset did not revoke sessions")
	}
	login := call(s, "POST", "/api/v1/auth/login", "", credentials{Email: "person@example.test", Password: "new-long-test-password"}, nil)
	if login.Code != 200 {
		t.Fatal("new password login failed")
	}
}
func TestConcurrentReservationsIdempotencyAndIsolation(t *testing.T) {
	s := testServer(t)
	uid, token := testUser(t, s, 1)
	calibration, main := mediaPair(t, s, uid)
	payload := AnalysisRequest{Name: "Trial", CalibrationID: calibration, MainID: main}
	var wg sync.WaitGroup
	codes := make(chan int, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes <- call(s, "POST", "/api/v1/analyses", token, payload, map[string]string{"Idempotency-Key": "same-request"}).Code
		}()
	}
	wg.Wait()
	close(codes)
	created := 0
	for code := range codes {
		if code == 202 {
			created++
		} else if code != 200 {
			t.Fatalf("duplicate returned %d", code)
		}
	}
	if created != 1 {
		t.Fatal("created multiple jobs")
	}
	var reserved int
	if e := s.DB.QueryRow(context.Background(), `SELECT reserved FROM users WHERE id=$1`, uid).Scan(&reserved); e != nil || reserved != 1 {
		t.Fatal("invalid reservation")
	}
	payload.Name = "Changed"
	if conflict := call(s, "POST", "/api/v1/analyses", token, payload, map[string]string{"Idempotency-Key": "same-request"}); conflict.Code != 409 {
		t.Fatal("idempotency conflict not detected")
	}
	if insufficient := call(s, "POST", "/api/v1/analyses", token, payload, nil); insufficient.Code != 402 {
		t.Fatal("overspending accepted")
	}
	_, other := testUser(t, s, 10)
	if stolen := call(s, "POST", "/api/v1/analyses", other, payload, nil); stolen.Code != 422 {
		t.Fatal("cross-account media accepted")
	}
	list := readMap(t, call(s, "GET", "/api/v1/analyses", token, nil, nil))
	aid := list["items"].([]any)[0].(map[string]any)["id"].(string)
	if leaked := call(s, "GET", "/api/v1/analyses/"+aid, other, nil, nil); leaked.Code != 404 {
		t.Fatal("cross-account analysis exposed")
	}
	if deletion := call(s, "DELETE", "/api/v1/media/"+main, token, nil, nil); deletion.Code != 409 {
		t.Fatal("running input can be deleted")
	}
	job, e := s.claim(context.Background())
	if e != nil || job == nil {
		t.Fatal(e)
	}
	s.finish(context.Background(), *job, nil, "Failed and refunded")
	s.finish(context.Background(), *job, nil, "duplicate")
	if e = s.DB.QueryRow(context.Background(), `SELECT reserved FROM users WHERE id=$1`, uid).Scan(&reserved); e != nil || reserved != 0 {
		t.Fatal("reservation not released exactly once")
	}
}
func TestJobCompletionRecoveryAndArtifacts(t *testing.T) {
	s := testServer(t)
	uid, token := testUser(t, s, 10)
	calibration, main := mediaPair(t, s, uid)
	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+s.Config.WorkerToken {
			w.WriteHeader(401)
			return
		}
		var v struct {
			ID      string `json:"id"`
			Attempt string `json:"attempt"`
		}
		_ = json.NewDecoder(r.Body).Decode(&v)
		relative := filepath.Join("runs", v.ID, v.Attempt)
		_ = os.MkdirAll(filepath.Join(s.Config.DataDir, relative), 0700)
		_ = os.WriteFile(filepath.Join(s.Config.DataDir, relative, "result.json"), []byte(`{"state":"no_reliable_signal"}`), 0600)
		_ = os.WriteFile(filepath.Join(s.Config.DataDir, relative, "report.html"), []byte("evidence"), 0600)
		reply(w, 200, workerResult{Result: json.RawMessage(`{"state":"no_reliable_signal","confidence":0,"reasons":[]}`), Artifacts: map[string]string{"result": relative + "/result.json", "report": relative + "/report.html"}})
	}))
	defer worker.Close()
	s.Config.WorkerURL = worker.URL
	submitted := call(s, "POST", "/api/v1/analyses", token, AnalysisRequest{Name: "Recover", CalibrationID: calibration, MainID: main}, nil)
	if submitted.Code != 202 {
		t.Fatal(submitted.Body.String())
	}
	aid := readMap(t, submitted)["id"].(string)
	job, e := s.claim(context.Background())
	if e != nil || job == nil {
		t.Fatal(e)
	}
	_, e = s.DB.Exec(context.Background(), `UPDATE analyses SET lease_until=now()-interval '1 second' WHERE id=$1`, aid)
	if e != nil {
		t.Fatal(e)
	}
	recovered, e := s.claim(context.Background())
	if e != nil || recovered == nil || recovered.Attempt == job.Attempt {
		t.Fatal("job not recovered")
	}
	s.finish(context.Background(), *job, nil, "stale attempt") // Stale settlement must be fenced.
	s.execute(context.Background(), *recovered)
	s.execute(context.Background(), *recovered)
	me := readMap(t, call(s, "GET", "/api/v1/me", token, nil, nil))
	if me["available"] != float64(9) || me["reserved"] != float64(0) {
		t.Fatal("settlement double charged", me)
	}
	result := readMap(t, call(s, "GET", "/api/v1/analyses/"+aid, token, nil, nil))
	if result["status"] != "succeeded" {
		t.Fatal(result)
	}
	bundle := call(s, "GET", "/api/v1/analyses/"+aid+"/artifacts/bundle", token, nil, nil)
	if bundle.Code != 200 || !strings.HasPrefix(bundle.Body.String(), "PK") {
		t.Fatal("bundle invalid")
	}
	archive, err := zip.NewReader(bytes.NewReader(bundle.Body.Bytes()), int64(bundle.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	foundReport := false
	for _, file := range archive.File {
		if file.Name == "report.html" {
			foundReport = true
		}
	}
	if !foundReport {
		t.Fatal("bundle is missing the stable report filename")
	}
	_, other := testUser(t, s, 0)
	if leaked := call(s, "GET", "/api/v1/analyses/"+aid+"/artifacts/report", other, nil, nil); leaked.Code != 404 {
		t.Fatal("artifact exposed")
	}
	_, e = s.DB.Exec(context.Background(), `UPDATE analyses SET expires_at=now()-interval '1 second' WHERE id=$1`, aid)
	if e != nil {
		t.Fatal(e)
	}
	if expired := call(s, "GET", "/api/v1/analyses/"+aid+"/artifacts/report", token, nil, nil); expired.Code != 410 {
		t.Fatal("expired artifacts served")
	}
	s.cleanup(context.Background())
	if _, e = os.Stat(filepath.Join(s.Config.DataDir, "runs", aid)); !os.IsNotExist(e) {
		t.Fatal("expired files retained")
	}
}
func TestStripeDisabledAndPaymentReplay(t *testing.T) {
	s := testServer(t)
	uid, token := testUser(t, s, 0)
	for _, path := range []string{"/api/v1/billing/checkout", "/api/v1/billing/webhook"} {
		if disabled := call(s, "POST", path, token, nil, nil); disabled.Code != 503 {
			t.Fatal("Stripe enabled without credentials")
		}
	}
	s.billingEnabled = true
	s.Config.StripeWebhook = "whsec_test_only"
	if invalid := call(s, "POST", "/api/v1/billing/webhook", "", map[string]string{"id": "fake"}, nil); invalid.Code != 400 {
		t.Fatal("invalid signature accepted")
	}
	order := id()
	_, e := s.DB.Exec(context.Background(), `INSERT INTO checkout_orders(id,user_id,credits,amount,currency) VALUES($1,$2,100,1000,'eur')`, order, uid)
	if e != nil {
		t.Fatal(e)
	}
	session := &stripe.CheckoutSession{ID: "cs_test_unique", ClientReferenceID: order, Mode: "payment", PaymentStatus: "paid", AmountTotal: 1000, Currency: "eur", Metadata: map[string]string{"umbra_order": order}}
	var wg sync.WaitGroup
	errs := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs <- s.fulfill(context.Background(), fmt.Sprintf("evt_%d", i), session)
		}(i)
	}
	wg.Wait()
	close(errs)
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	var credits int
	if e = s.DB.QueryRow(context.Background(), `SELECT credits FROM users WHERE id=$1`, uid).Scan(&credits); e != nil || credits != 100 {
		t.Fatal("payment replay granted multiple packs")
	}
	wrong := *session
	wrong.AmountTotal = 1
	if s.fulfill(context.Background(), "wrong", &wrong) == nil {
		t.Fatal("price mismatch accepted")
	}
}
func TestUploadValidationAndOwnership(t *testing.T) {
	s := testServer(t)
	_, token := testUser(t, s, 10)
	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reply(w, 200, map[string]any{"duration_s": 4, "width": 640, "height": 360})
	}))
	defer worker.Close()
	s.Config.WorkerURL = worker.URL
	upload := func(filename, role string, size int) *httptest.ResponseRecorder {
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		_ = writer.WriteField("role", role)
		part, _ := writer.CreateFormFile("file", filename)
		_, _ = io.Copy(part, strings.NewReader(strings.Repeat("v", size)))
		_ = writer.Close()
		r := httptest.NewRequest("POST", "/api/v1/media", &body)
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Content-Type", writer.FormDataContentType())
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, r)
		return w
	}
	if bad := upload("clip.exe", "main", 10); bad.Code != 422 {
		t.Fatal("unsupported file accepted")
	}
	if large := upload("clip.mp4", "main", int(s.Config.MaxUpload)+1); large.Code != 413 {
		t.Fatal("oversized video accepted")
	}
	good := upload("clip.mp4", "main", 10)
	if good.Code != 201 {
		t.Fatal(good.Body.String())
	}
	v := readMap(t, good)
	clips := readMap(t, call(s, "GET", "/api/v1/media", token, nil, nil))
	if len(clips["items"].([]any)) != 1 {
		t.Fatal("uploaded clip missing from library")
	}
	if _, exists := v["relative_path"]; exists {
		t.Fatal("storage path exposed")
	}
	_, other := testUser(t, s, 0)
	otherClips := readMap(t, call(s, "GET", "/api/v1/media", other, nil, nil))
	if len(otherClips["items"].([]any)) != 0 {
		t.Fatal("another account's clip library exposed")
	}
	if del := call(s, "DELETE", "/api/v1/media/"+v["id"].(string), other, nil, nil); del.Code != 404 {
		t.Fatal("another user's upload deleted")
	}
}
func TestCredentialAndInputValidation(t *testing.T) {
	v := credentials{Email: " Person@Example.com ", Password: "long-test-password"}
	if !validCredentials(&v) || v.Email != "person@example.com" {
		t.Fatal("email normalization failed")
	}
	v.Password = "short"
	if validCredentials(&v) {
		t.Fatal("weak password accepted")
	}
	request := AnalysisRequest{Name: " Trial ", CalibrationID: "a", MainID: "b", ShadowRegion: &Region{X: .8, Y: .1, Width: .4, Height: .2}}
	if request.validate() {
		t.Fatal("out-of-frame region accepted")
	}
	request.ShadowRegion = nil
	if !request.validate() {
		t.Fatal("valid analysis rejected")
	}
	if bcrypt.CompareHashAndPassword([]byte("$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW"), []byte("test")) == nil {
		t.Fatal("unexpected dummy password")
	}
}

func TestSignedDelayedStripePayment(t *testing.T) {
	s := testServer(t)
	uid, _ := testUser(t, s, 0)
	s.billingEnabled = true
	s.Config.StripeWebhook = "whsec_local_test"
	order := id()
	_, err := s.DB.Exec(context.Background(), `INSERT INTO checkout_orders(id,user_id,credits,amount,currency) VALUES($1,$2,100,1000,'eur')`, order, uid)
	if err != nil {
		t.Fatal(err)
	}
	session := map[string]any{"id": "cs_delayed", "object": "checkout.session", "client_reference_id": order, "mode": "payment", "payment_status": "unpaid", "amount_total": 1000, "currency": "eur", "metadata": map[string]string{"umbra_order": order}}
	send := func(eventID, eventType string) *httptest.ResponseRecorder {
		payload, _ := json.Marshal(map[string]any{"id": eventID, "object": "event", "api_version": stripe.APIVersion, "type": eventType, "data": map[string]any{"object": session}})
		timestamp := fmt.Sprint(time.Now().Unix())
		mac := hmac.New(sha256.New, []byte(s.Config.StripeWebhook))
		mac.Write([]byte(timestamp + "."))
		mac.Write(payload)
		r := httptest.NewRequest("POST", "/api/v1/billing/webhook", bytes.NewReader(payload))
		r.Header.Set("Stripe-Signature", "t="+timestamp+",v1="+hex.EncodeToString(mac.Sum(nil)))
		w := httptest.NewRecorder()
		s.Handler().ServeHTTP(w, r)
		return w
	}
	if response := send("evt_unpaid", "checkout.session.completed"); response.Code != 200 {
		t.Fatal(response.Body.String())
	}
	var balance int
	if err = s.DB.QueryRow(context.Background(), `SELECT credits FROM users WHERE id=$1`, uid).Scan(&balance); err != nil || balance != 0 {
		t.Fatal("unpaid event granted credits")
	}
	session["payment_status"] = "paid"
	for i := 0; i < 2; i++ {
		if response := send("evt_delayed", "checkout.session.async_payment_succeeded"); response.Code != 200 {
			t.Fatal(response.Body.String())
		}
	}
	if err = s.DB.QueryRow(context.Background(), `SELECT credits FROM users WHERE id=$1`, uid).Scan(&balance); err != nil || balance != 100 {
		t.Fatal("delayed payment not settled exactly once")
	}
}

func TestTrustedProxyBoundary(t *testing.T) {
	s := &Server{Config: Config{TrustedProxies: []netip.Prefix{netip.MustParsePrefix("127.0.0.1/32")}}}
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "192.0.2.10:1234"
	r.Header.Set("X-Forwarded-For", "198.51.100.20")
	if s.clientIP(r) != "192.0.2.10" {
		t.Fatal("untrusted forwarded header accepted")
	}
	r.RemoteAddr = "127.0.0.1:1234"
	r.Header.Set("X-Forwarded-For", "203.0.113.99, 198.51.100.20, 127.0.0.1")
	if s.clientIP(r) != "198.51.100.20" {
		t.Fatal("proxy chain did not select nearest untrusted client")
	}
}

func TestOrphanUploadCleanup(t *testing.T) {
	s := testServer(t)
	orphan := filepath.Join(s.Config.DataDir, "media", id())
	fresh := filepath.Join(s.Config.DataDir, "media", id())
	if err := os.WriteFile(orphan, []byte("interrupted upload"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fresh, []byte("upload in progress"), 0600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-2 * time.Hour)
	if err := os.Chtimes(orphan, old, old); err != nil {
		t.Fatal(err)
	}
	s.cleanup(context.Background())
	if _, err := os.Stat(orphan); !os.IsNotExist(err) {
		t.Fatal("orphan upload retained")
	}
	if _, err := os.Stat(fresh); err != nil {
		t.Fatal("active upload removed")
	}
}
