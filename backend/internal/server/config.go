package server

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/mail"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Address, DatabaseURL, DataDir, FrontendDir, PublicURL, WorkerURL, WorkerToken, Environment string
	SMTPHost, SMTPUser, SMTPPassword, SMTPFrom                                                 string
	StripeKey, StripeWebhook, StripePrice                                                      string
	MaxUpload                                                                                  int64
	JobTimeout                                                                                 time.Duration
	TrustedProxies                                                                             []netip.Prefix
}

func LoadConfig() (Config, error) {
	c := Config{Address: env("UMBRA_ADDR", ":8000"), DatabaseURL: os.Getenv("DATABASE_URL"), DataDir: env("UMBRA_DATA_DIR", "../umbra-data/public"), FrontendDir: env("UMBRA_FRONTEND_DIR", "../frontend/dist"), PublicURL: strings.TrimRight(env("UMBRA_PUBLIC_URL", "http://localhost:8000"), "/"), WorkerURL: env("UMBRA_WORKER_URL", "http://127.0.0.1:8001"), WorkerToken: os.Getenv("UMBRA_WORKER_TOKEN"), Environment: env("UMBRA_ENV", "development"), SMTPHost: os.Getenv("SMTP_HOST"), SMTPUser: os.Getenv("SMTP_USER"), SMTPPassword: os.Getenv("SMTP_PASSWORD"), SMTPFrom: os.Getenv("SMTP_FROM"), StripeKey: os.Getenv("STRIPE_SECRET_KEY"), StripeWebhook: os.Getenv("STRIPE_WEBHOOK_SECRET"), StripePrice: os.Getenv("STRIPE_PRICE_ID"), MaxUpload: 250 * 1024 * 1024, JobTimeout: 10 * time.Minute}
	if v := os.Getenv("UMBRA_MAX_UPLOAD_MB"); v != "" {
		n, e := strconv.ParseInt(v, 10, 64)
		if e != nil || n < 1 || n > 2048 {
			return c, fmt.Errorf("invalid upload limit")
		}
		c.MaxUpload = n * 1024 * 1024
	}
	if c.DatabaseURL == "" || len(c.WorkerToken) < 32 {
		return c, fmt.Errorf("DATABASE_URL and UMBRA_WORKER_TOKEN (at least 32 characters) are required")
	}
	if c.Environment != "development" && c.Environment != "production" {
		return c, fmt.Errorf("UMBRA_ENV must be development or production")
	}
	public, err := url.Parse(c.PublicURL)
	if err != nil || public.Host == "" || public.User != nil || public.Path != "" || public.RawQuery != "" || public.Fragment != "" || (public.Scheme != "http" && public.Scheme != "https") {
		return c, fmt.Errorf("UMBRA_PUBLIC_URL must be an HTTP(S) origin without a path")
	}
	if c.SMTPFrom != "" {
		from, err := mail.ParseAddress(c.SMTPFrom)
		if err != nil || from.Address != c.SMTPFrom || strings.ContainsAny(c.SMTPFrom, "\r\n") {
			return c, fmt.Errorf("SMTP_FROM must be a plain email address")
		}
	}
	if c.SMTPHost != "" && c.SMTPFrom == "" {
		return c, fmt.Errorf("SMTP_HOST requires SMTP_FROM")
	}
	for _, value := range strings.Split(os.Getenv("UMBRA_TRUSTED_PROXY_CIDRS"), ",") {
		if value = strings.TrimSpace(value); value != "" {
			prefix, err := netip.ParsePrefix(value)
			if err != nil {
				return c, fmt.Errorf("invalid trusted proxy CIDR")
			}
			c.TrustedProxies = append(c.TrustedProxies, prefix)
		}
	}
	if c.Environment == "production" && (!strings.HasPrefix(c.PublicURL, "https://") || c.SMTPHost == "" || c.SMTPFrom == "") {
		return c, fmt.Errorf("production requires HTTPS public URL and SMTP delivery")
	}
	return c, nil
}
func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
func randomToken() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}
	return hex.EncodeToString(b)
}
func digest(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func id() string             { return randomToken()[:32] }
