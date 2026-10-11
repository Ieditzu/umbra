package server

import (
	"context"
	"crypto/tls"
	"fmt"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
	"log/slog"
	"net"
	"net/http"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

type credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func validCredentials(v *credentials) bool {
	v.Email = strings.ToLower(strings.TrimSpace(v.Email))
	a, e := mail.ParseAddress(v.Email)
	return e == nil && a.Address == v.Email && len(v.Email) <= 254 && len(v.Password) >= 12 && len(v.Password) <= 72
}
func (s *Server) authAllowed(w http.ResponseWriter, r *http.Request) bool {
	host := s.clientIP(r)
	if !s.allow("auth:"+host, 20, 15*time.Minute) {
		fail(w, 429, "rate_limit", "Too many account requests. Retry later")
		return false
	}
	if origin := r.Header.Get("Origin"); origin != "" && origin != s.Config.PublicURL {
		fail(w, 403, "csrf", "Request origin is not allowed")
		return false
	}
	return true
}
func (s *Server) signup(w http.ResponseWriter, r *http.Request) {
	if !s.authAllowed(w, r) {
		return
	}
	var v credentials
	if !decode(w, r, &v) {
		return
	}
	if !validCredentials(&v) {
		fail(w, 422, "invalid_input", "Use a valid email and a password of 12–72 bytes")
		return
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(v.Password), 12)
	if e != nil {
		fail(w, 500, "internal_error", "Account could not be created")
		return
	}
	uid := id()
	_, e = s.DB.Exec(r.Context(), `INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING`, uid, v.Email, string(hash))
	if e != nil {
		fail(w, 500, "internal_error", "Account could not be created")
		return
	}
	var owner string
	if e = s.DB.QueryRow(r.Context(), `SELECT id FROM users WHERE email=$1`, v.Email).Scan(&owner); e != nil || owner != uid {
		fail(w, 409, "account_exists", "An account already exists. Sign in or reset your password")
		return
	}
	if e = s.sendToken(r.Context(), uid, v.Email, "verify"); e != nil {
		slog.Error("verification delivery failed", "user_id", uid)
		fail(w, 503, "email_unavailable", "Account created, but verification delivery failed. Sign in and resend the email")
		return
	}
	if e = s.session(w, r, uid); e != nil {
		fail(w, 500, "internal_error", "Sign in to your new account")
		return
	}
	reply(w, 201, map[string]string{"message": "Check your email to verify your account"})
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	if !s.authAllowed(w, r) {
		return
	}
	var v credentials
	if !decode(w, r, &v) {
		return
	}
	v.Email = strings.ToLower(strings.TrimSpace(v.Email))
	var uid, hash string
	e := s.DB.QueryRow(r.Context(), `SELECT id,password_hash FROM users WHERE email=$1`, v.Email).Scan(&uid, &hash)
	if e != nil {
		hash = "$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW"
	}
	passwordErr := bcrypt.CompareHashAndPassword([]byte(hash), []byte(v.Password))
	if e != nil || passwordErr != nil {
		fail(w, 401, "invalid_credentials", "Email or password is incorrect")
		return
	}
	if e = s.session(w, r, uid); e != nil {
		fail(w, 500, "internal_error", "Sign in failed. Retry")
		return
	}
	reply(w, 200, map[string]string{"message": "Signed in"})
}
func (s *Server) session(w http.ResponseWriter, r *http.Request, uid string) error {
	token, csrf := randomToken(), randomToken()
	_, e := s.DB.Exec(r.Context(), `INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '7 days')`, digest(token), uid, csrf)
	if e != nil {
		return e
	}
	http.SetCookie(w, &http.Cookie{Name: "umbra_session", Value: token, Path: "/", HttpOnly: true, Secure: s.Config.Environment == "production", SameSite: http.SameSiteLaxMode, MaxAge: 7 * 86400})
	return nil
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if c, e := r.Cookie("umbra_session"); e == nil {
		_, e = s.DB.Exec(r.Context(), `DELETE FROM sessions WHERE token_hash=$1`, digest(c.Value))
		if e != nil {
			fail(w, 500, "internal_error", "Sign out failed")
			return
		}
	}
	http.SetCookie(w, &http.Cookie{Name: "umbra_session", Value: "", Path: "/", HttpOnly: true, Secure: s.Config.Environment == "production", SameSite: http.SameSiteLaxMode, MaxAge: -1})
	reply(w, 200, map[string]string{"message": "Signed out"})
}
func (s *Server) sendToken(ctx context.Context, uid, email, kind string) error {
	token := randomToken()
	duration := time.Hour
	if kind == "verify" {
		duration = 24 * time.Hour
	}
	_, e := s.DB.Exec(ctx, `INSERT INTO account_tokens(token_hash,user_id,kind,expires_at) VALUES($1,$2,$3,$4)`, digest(token), uid, kind, time.Now().Add(duration))
	if e != nil {
		return e
	}
	route := "verify"
	subject := "Verify your Umbra account"
	if kind == "reset" {
		route = "reset-password"
		subject = "Reset your Umbra password"
	}
	// Tokens stay in the URL fragment: they are not sent in referrers or request logs.
	link := s.Config.PublicURL + "/" + route + "#token=" + token
	if s.Config.SMTPHost == "" {
		if s.Config.Environment == "production" {
			return fmt.Errorf("SMTP not configured")
		}
		slog.Info("development account email", "subject", subject, "link", link)
		return nil
	}
	host, _, e := net.SplitHostPort(s.Config.SMTPHost)
	if e != nil {
		return e
	}
	conn, e := net.DialTimeout("tcp", s.Config.SMTPHost, 10*time.Second)
	if e != nil {
		return e
	}
	_ = conn.SetDeadline(time.Now().Add(15 * time.Second))
	client, e := smtp.NewClient(conn, host)
	if e != nil {
		conn.Close()
		return e
	}
	defer client.Close()
	if ok, _ := client.Extension("STARTTLS"); ok {
		if e = client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); e != nil {
			return e
		}
	} else if s.Config.Environment == "production" {
		return fmt.Errorf("SMTP requires STARTTLS")
	}
	if s.Config.SMTPUser != "" {
		if e = client.Auth(smtp.PlainAuth("", s.Config.SMTPUser, s.Config.SMTPPassword, host)); e != nil {
			return e
		}
	}
	if e = client.Mail(s.Config.SMTPFrom); e != nil {
		return e
	}
	if e = client.Rcpt(email); e != nil {
		return e
	}
	writer, e := client.Data()
	if e != nil {
		return e
	}
	_, e = fmt.Fprintf(writer, "From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\nThis link expires in %s. If you did not request it, ignore this email.\r\n", s.Config.SMTPFrom, email, subject, link, duration)
	if e != nil {
		return e
	}
	if e = writer.Close(); e != nil {
		return e
	}
	return client.Quit()
}
func (s *Server) verify(w http.ResponseWriter, r *http.Request) {
	if !s.authAllowed(w, r) {
		return
	}
	var v struct {
		Token string `json:"token"`
	}
	if !decode(w, r, &v) {
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		fail(w, 500, "internal_error", "Verification unavailable")
		return
	}
	defer tx.Rollback(r.Context())
	var uid string
	e = tx.QueryRow(r.Context(), `DELETE FROM account_tokens WHERE token_hash=$1 AND kind='verify' AND expires_at>now() RETURNING user_id`, digest(v.Token)).Scan(&uid)
	if e != nil {
		fail(w, 422, "invalid_token", "Verification link expired or was already used")
		return
	}
	var granted bool
	e = tx.QueryRow(r.Context(), `SELECT starter_granted FROM users WHERE id=$1 FOR UPDATE`, uid).Scan(&granted)
	if e == nil && !granted {
		e = grant(r.Context(), tx, uid, 10, "starter", "starter:"+uid, "Starter credits")
	}
	if e == nil {
		_, e = tx.Exec(r.Context(), `UPDATE users SET verified=true,starter_granted=true WHERE id=$1`, uid)
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		fail(w, 500, "internal_error", "Verification unavailable")
		return
	}
	reply(w, 200, map[string]string{"message": "Email verified. Your starter credits are ready"})
}
func (s *Server) resend(w http.ResponseWriter, r *http.Request) {
	u := who(r)
	if u.Verified {
		reply(w, 200, map[string]string{"message": "Email already verified"})
		return
	}
	if !s.allow("verify:"+u.ID, 3, time.Hour) {
		fail(w, 429, "rate_limit", "Try again in one hour")
		return
	}
	var email string
	e := s.DB.QueryRow(r.Context(), `SELECT email FROM users WHERE id=$1`, u.ID).Scan(&email)
	if e == nil {
		e = s.sendToken(r.Context(), u.ID, email, "verify")
	}
	if e != nil {
		fail(w, 503, "email_unavailable", "Email delivery unavailable. Retry later")
		return
	}
	reply(w, 200, map[string]string{"message": "Verification email sent"})
}
func (s *Server) forgot(w http.ResponseWriter, r *http.Request) {
	if !s.authAllowed(w, r) {
		return
	}
	var v struct {
		Email string `json:"email"`
	}
	if !decode(w, r, &v) {
		return
	}
	var uid, email string
	e := s.DB.QueryRow(r.Context(), `SELECT id,email FROM users WHERE email=$1`, strings.ToLower(strings.TrimSpace(v.Email))).Scan(&uid, &email)
	if e == nil && s.allow("reset:"+uid, 3, time.Hour) {
		if e = s.sendToken(r.Context(), uid, email, "reset"); e != nil {
			slog.Error("recovery email delivery failed", "user_id", uid)
		}
	}
	reply(w, 200, map[string]string{"message": "If that account exists, a recovery email is on its way"})
}
func (s *Server) reset(w http.ResponseWriter, r *http.Request) {
	if !s.authAllowed(w, r) {
		return
	}
	var v struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !decode(w, r, &v) {
		return
	}
	if len(v.Password) < 12 || len(v.Password) > 72 {
		fail(w, 422, "invalid_input", "Use a password of 12–72 bytes")
		return
	}
	hash, e := bcrypt.GenerateFromPassword([]byte(v.Password), 12)
	if e != nil {
		fail(w, 500, "internal_error", "Password reset unavailable")
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		fail(w, 500, "internal_error", "Password reset unavailable")
		return
	}
	defer tx.Rollback(r.Context())
	var uid string
	e = tx.QueryRow(r.Context(), `DELETE FROM account_tokens WHERE token_hash=$1 AND kind='reset' AND expires_at>now() RETURNING user_id`, digest(v.Token)).Scan(&uid)
	if e != nil {
		fail(w, 422, "invalid_token", "Recovery link expired or was already used")
		return
	}
	_, e = tx.Exec(r.Context(), `UPDATE users SET password_hash=$2 WHERE id=$1`, uid, string(hash))
	if e == nil {
		_, e = tx.Exec(r.Context(), `DELETE FROM sessions WHERE user_id=$1`, uid)
	}
	if e == nil {
		_, e = tx.Exec(r.Context(), `DELETE FROM account_tokens WHERE user_id=$1 AND kind='reset'`, uid)
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		fail(w, 500, "internal_error", "Password reset unavailable")
		return
	}
	reply(w, 200, map[string]string{"message": "Password changed. Sign in with your new password"})
}
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u := who(r)
	var email string
	var credits, reserved int
	e := s.DB.QueryRow(r.Context(), `SELECT email,credits,reserved FROM users WHERE id=$1`, u.ID).Scan(&email, &credits, &reserved)
	if e != nil {
		fail(w, 500, "internal_error", "Account unavailable")
		return
	}
	reply(w, 200, map[string]any{"id": u.ID, "email": email, "verified": u.Verified, "credits": credits, "reserved": reserved, "available": credits - reserved, "csrf_token": u.CSRF})
}
func (s *Server) keys(w http.ResponseWriter, r *http.Request) {
	rows, e := s.DB.Query(r.Context(), `SELECT id,name,prefix,created_at,revoked_at FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC`, who(r).ID)
	if e != nil {
		fail(w, 500, "internal_error", "Keys unavailable")
		return
	}
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var key, name, prefix string
		var created time.Time
		var revoked *time.Time
		if rows.Scan(&key, &name, &prefix, &created, &revoked) != nil {
			fail(w, 500, "internal_error", "Keys unavailable")
			return
		}
		out = append(out, map[string]any{"id": key, "name": name, "prefix": prefix, "created_at": created, "revoked_at": revoked})
	}
	if rows.Err() != nil {
		fail(w, 500, "internal_error", "Keys unavailable")
		return
	}
	reply(w, 200, map[string]any{"items": out})
}
func (s *Server) createKey(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Name string `json:"name"`
	}
	if !decode(w, r, &v) {
		return
	}
	v.Name = strings.TrimSpace(v.Name)
	if len(v.Name) < 1 || len(v.Name) > 80 {
		fail(w, 422, "invalid_input", "Name must contain 1–80 characters")
		return
	}
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		fail(w, 500, "internal_error", "Key creation failed")
		return
	}
	defer tx.Rollback(r.Context())
	uid := who(r).ID
	var lock string
	e = tx.QueryRow(r.Context(), `SELECT id FROM users WHERE id=$1 FOR UPDATE`, uid).Scan(&lock)
	var count int
	if e == nil {
		e = tx.QueryRow(r.Context(), `SELECT count(*) FROM api_keys WHERE user_id=$1 AND revoked_at IS NULL`, uid).Scan(&count)
	}
	if e != nil {
		fail(w, 500, "internal_error", "Key creation failed")
		return
	}
	if count >= 20 {
		fail(w, 422, "key_limit", "Revoke a key before creating another (maximum 20)")
		return
	}
	token := "umbra_" + randomToken()
	key := id()
	_, e = tx.Exec(r.Context(), `INSERT INTO api_keys(id,user_id,name,prefix,token_hash) VALUES($1,$2,$3,$4,$5)`, key, uid, v.Name, token[:14], digest(token))
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		fail(w, 500, "internal_error", "Key creation failed")
		return
	}
	reply(w, 201, map[string]string{"id": key, "name": v.Name, "token": token, "prefix": token[:14]})
}
func (s *Server) revokeKey(w http.ResponseWriter, r *http.Request) {
	tag, e := s.DB.Exec(r.Context(), `UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL`, r.PathValue("id"), who(r).ID)
	if e != nil {
		fail(w, 500, "internal_error", "Revocation failed")
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "not_found", "Active key not found")
		return
	}
	reply(w, 200, map[string]string{"message": "Key revoked"})
}
func grant(ctx context.Context, tx pgx.Tx, uid string, amount int, kind, reference, description string) error {
	tag, e := tx.Exec(ctx, `INSERT INTO credit_ledger(id,user_id,amount,kind,reference,description) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(reference) DO NOTHING`, id(), uid, amount, kind, reference, description)
	if e != nil {
		return e
	}
	if tag.RowsAffected() == 0 {
		return nil
	}
	_, e = tx.Exec(ctx, `UPDATE users SET credits=credits+$2 WHERE id=$1`, uid, amount)
	return e
}
