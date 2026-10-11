package server

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Server struct {
	Config         Config
	DB             *pgxpool.Pool
	mux            *http.ServeMux
	client         *http.Client
	billingEnabled bool
	limiterMu      sync.Mutex
	limits         map[string]*bucket
}
type bucket struct {
	Count int
	Until time.Time
}
type identity struct {
	ID       string
	Verified bool
	CSRF     string
	APIKey   bool
}
type identityKey struct{}

func New(ctx context.Context, c Config) (*Server, error) {
	db, e := pgxpool.New(ctx, c.DatabaseURL)
	if e != nil {
		return nil, e
	}
	if e = db.Ping(ctx); e != nil {
		db.Close()
		return nil, e
	}
	c.DataDir, e = filepath.Abs(c.DataDir)
	if e != nil {
		db.Close()
		return nil, e
	}
	if e = os.MkdirAll(filepath.Join(c.DataDir, "media"), 0700); e != nil {
		db.Close()
		return nil, e
	}
	if e = os.MkdirAll(filepath.Join(c.DataDir, "runs"), 0700); e != nil {
		db.Close()
		return nil, e
	}
	s := &Server{Config: c, DB: db, mux: http.NewServeMux(), client: &http.Client{Timeout: c.JobTimeout}, limits: map[string]*bucket{}}
	if e = s.configureBilling(ctx); e != nil {
		db.Close()
		return nil, e
	}
	s.routes()
	return s, nil
}
func (s *Server) routes() {
	m := s.mux
	m.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		reply(w, 200, map[string]any{"name": "umbra", "status": "ok"})
	})
	m.HandleFunc("GET /api/v1/ready", s.ready)
	m.HandleFunc("GET /api/v1/config", func(w http.ResponseWriter, r *http.Request) {
		reply(w, 200, map[string]any{"billing_enabled": s.billingEnabled, "pack_credits": 100, "pack_amount": 1000, "currency": "eur", "starter_credits": 10, "max_upload_bytes": s.Config.MaxUpload, "retention_days": 30})
	})
	m.HandleFunc("POST /api/v1/auth/signup", s.signup)
	m.HandleFunc("POST /api/v1/auth/login", s.login)
	m.HandleFunc("POST /api/v1/auth/verify", s.verify)
	m.HandleFunc("POST /api/v1/auth/forgot-password", s.forgot)
	m.HandleFunc("POST /api/v1/auth/reset-password", s.reset)
	m.Handle("POST /api/v1/auth/logout", s.protect(http.HandlerFunc(s.logout), false))
	m.Handle("POST /api/v1/auth/resend-verification", s.protect(http.HandlerFunc(s.resend), false))
	m.Handle("GET /api/v1/me", s.protect(http.HandlerFunc(s.me), false))
	m.Handle("GET /api/v1/keys", s.protect(http.HandlerFunc(s.keys), false))
	m.Handle("POST /api/v1/keys", s.protect(http.HandlerFunc(s.createKey), true))
	m.Handle("DELETE /api/v1/keys/{id}", s.protect(http.HandlerFunc(s.revokeKey), false))
	m.Handle("POST /api/v1/media", s.protect(http.HandlerFunc(s.upload), true))
	m.Handle("GET /api/v1/media", s.protect(http.HandlerFunc(s.listMedia), false))
	m.Handle("DELETE /api/v1/media/{id}", s.protect(http.HandlerFunc(s.deleteMedia), true))
	m.Handle("POST /api/v1/analyses", s.protect(http.HandlerFunc(s.submit), true))
	m.Handle("GET /api/v1/analyses", s.protect(http.HandlerFunc(s.listAnalyses), false))
	m.Handle("GET /api/v1/analyses/{id}", s.protect(http.HandlerFunc(s.analysis), false))
	m.Handle("DELETE /api/v1/analyses/{id}", s.protect(http.HandlerFunc(s.deleteAnalysis), false))
	m.Handle("GET /api/v1/jobs/{id}", s.protect(http.HandlerFunc(s.analysis), false))
	m.Handle("GET /api/v1/analyses/{id}/artifacts/{kind}", s.protect(http.HandlerFunc(s.artifact), false))
	m.Handle("GET /api/v1/billing", s.protect(http.HandlerFunc(s.billing), false))
	m.Handle("POST /api/v1/billing/checkout", s.protect(http.HandlerFunc(s.checkout), true))
	m.HandleFunc("POST /api/v1/billing/webhook", s.webhook)
	m.HandleFunc("GET /api/v1/openapi.json", s.openapi)
	m.HandleFunc("/", s.frontend)
}
func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		defer func() {
			if v := recover(); v != nil {
				slog.Error("request panic", "error", v)
				fail(w, 500, "internal_error", "The request could not be completed")
			}
		}()
		if strings.HasPrefix(r.URL.Path, "/api/") && r.URL.Path != "/api/v1/billing/webhook" {
			host := s.clientIP(r)
			if !s.allow("ip:"+host, 300, time.Minute) {
				fail(w, 429, "rate_limit", "Too many requests. Retry in one minute")
				return
			}
		}
		s.mux.ServeHTTP(w, r)
	})
}
func (s *Server) allow(key string, max int, window time.Duration) bool {
	s.limiterMu.Lock()
	defer s.limiterMu.Unlock()
	now := time.Now()
	if len(s.limits) > 10000 {
		for k, v := range s.limits {
			if now.After(v.Until) {
				delete(s.limits, k)
			}
		}
	}
	b := s.limits[key]
	if b == nil || now.After(b.Until) {
		s.limits[key] = &bucket{Count: 1, Until: now.Add(window)}
		return true
	}
	b.Count++
	return b.Count <= max
}
func reply(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, code, message string) {
	if status == http.StatusTooManyRequests {
		w.Header().Set("Retry-After", "60")
	}
	reply(w, status, map[string]any{"error": map[string]string{"code": code, "message": message}})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if e := d.Decode(v); e != nil {
		fail(w, 400, "invalid_input", "Provide a valid JSON request")
		return false
	}
	if e := d.Decode(&struct{}{}); !errors.Is(e, io.EOF) {
		fail(w, 400, "invalid_input", "Provide one JSON object")
		return false
	}
	return true
}
func who(r *http.Request) identity { return r.Context().Value(identityKey{}).(identity) }
func (s *Server) protect(next http.Handler, verified bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var u identity
		var e error
		if strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			u.APIKey = true
			e = s.DB.QueryRow(r.Context(), `SELECT u.id,u.verified FROM api_keys k JOIN users u ON u.id=k.user_id WHERE k.token_hash=$1 AND k.revoked_at IS NULL`, digest(token)).Scan(&u.ID, &u.Verified)
		} else {
			cookie, err := r.Cookie("umbra_session")
			if err != nil {
				fail(w, 401, "unauthorized", "Sign in to continue")
				return
			}
			e = s.DB.QueryRow(r.Context(), `SELECT u.id,u.verified,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`, digest(cookie.Value)).Scan(&u.ID, &u.Verified, &u.CSRF)
		}
		if e != nil {
			fail(w, 401, "unauthorized", "Sign in or provide a valid API key")
			return
		}
		if !u.APIKey && r.Method != "GET" && r.Method != "HEAD" {
			if r.Header.Get("X-CSRF-Token") != u.CSRF || r.Header.Get("Origin") != "" && r.Header.Get("Origin") != s.Config.PublicURL {
				fail(w, 403, "csrf", "Refresh the page and try again")
				return
			}
		}
		if verified && !u.Verified {
			fail(w, 403, "verification_required", "Verify your email before continuing")
			return
		}
		if !s.allow("user:"+u.ID, 120, time.Minute) {
			fail(w, 429, "rate_limit", "Too many requests. Retry in one minute")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), identityKey{}, u)))
	})
}
func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if s.DB.Ping(ctx) != nil {
		fail(w, 503, "not_ready", "Database unavailable")
		return
	}
	req, _ := http.NewRequestWithContext(ctx, "GET", s.Config.WorkerURL+"/health", nil)
	req.Header.Set("Authorization", "Bearer "+s.Config.WorkerToken)
	resp, e := s.client.Do(req)
	if e != nil {
		fail(w, 503, "not_ready", "Worker unavailable")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		fail(w, 503, "not_ready", "Worker unavailable")
		return
	}
	reply(w, 200, map[string]string{"status": "ready"})
}
func (s *Server) frontend(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" && r.Method != "HEAD" {
		http.NotFound(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/") {
		fail(w, 404, "not_found", "Endpoint not found")
		return
	}
	p := filepath.Join(s.Config.FrontendDir, filepath.Clean("/"+r.URL.Path))
	if st, e := os.Stat(p); e == nil && !st.IsDir() {
		http.ServeFile(w, r, p)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/assets/") {
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, filepath.Join(s.Config.FrontendDir, "index.html"))
}

func (s *Server) trusted(addr netip.Addr) bool {
	for _, prefix := range s.Config.TrustedProxies {
		if prefix.Contains(addr.Unmap()) {
			return true
		}
	}
	return false
}
func (s *Server) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	remote, err := netip.ParseAddr(host)
	if err != nil || !s.trusted(remote) {
		return host
	}
	chain := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
	for i := len(chain) - 1; i >= 0; i-- {
		addr, err := netip.ParseAddr(strings.TrimSpace(chain[i]))
		if err != nil {
			return host
		}
		if !s.trusted(addr) {
			return addr.String()
		}
	}
	return host
}
