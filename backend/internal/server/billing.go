package server

import (
	"context"
	"encoding/json"
	"fmt"
	stripe "github.com/stripe/stripe-go/v86"
	"io"
	"log/slog"
	"net/http"
	"time"
)

func (s *Server) configureBilling(ctx context.Context) error {
	// Partial configuration intentionally leaves billing disabled and makes no network request.
	if s.Config.StripeKey == "" || s.Config.StripeWebhook == "" || s.Config.StripePrice == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	price, e := stripe.NewClient(s.Config.StripeKey).V1Prices.Retrieve(ctx, s.Config.StripePrice, nil)
	if e != nil {
		return fmt.Errorf("validate configured Stripe price: %w", e)
	}
	if !price.Active || price.Currency != "eur" || price.UnitAmount != 1000 || price.Recurring != nil {
		return fmt.Errorf("Stripe price must be an active, one-time EUR 10.00 price")
	}
	s.billingEnabled = true
	return nil
}
func (s *Server) billing(w http.ResponseWriter, r *http.Request) {
	rows, e := s.DB.Query(r.Context(), `SELECT id,amount,kind,description,created_at FROM credit_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, who(r).ID)
	if e != nil {
		fail(w, 500, "internal_error", "Transactions unavailable")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var key, kind, description string
		var amount int
		var created time.Time
		if rows.Scan(&key, &amount, &kind, &description, &created) != nil {
			fail(w, 500, "internal_error", "Transactions unavailable")
			return
		}
		items = append(items, map[string]any{"id": key, "amount": amount, "kind": kind, "description": description, "created_at": created})
	}
	if rows.Err() != nil {
		fail(w, 500, "internal_error", "Transactions unavailable")
		return
	}
	reply(w, 200, map[string]any{"items": items, "billing_enabled": s.billingEnabled})
}
func (s *Server) checkout(w http.ResponseWriter, r *http.Request) {
	if !s.billingEnabled {
		fail(w, 503, "billing_disabled", "Credit purchases are not available yet")
		return
	}
	if !s.allow("checkout:"+who(r).ID, 10, time.Hour) {
		fail(w, 429, "rate_limit", "Too many checkout requests. Retry later")
		return
	}
	order := id()
	uid := who(r).ID
	_, e := s.DB.Exec(r.Context(), `INSERT INTO checkout_orders(id,user_id,credits,amount,currency) VALUES($1,$2,100,1000,'eur')`, order, uid)
	if e != nil {
		fail(w, 500, "internal_error", "Checkout unavailable")
		return
	}
	params := &stripe.CheckoutSessionCreateParams{Mode: stripe.String("payment"), ClientReferenceID: stripe.String(order), SuccessURL: stripe.String(s.Config.PublicURL + "/dashboard/billing?checkout=complete"), CancelURL: stripe.String(s.Config.PublicURL + "/dashboard/billing?checkout=cancelled"), LineItems: []*stripe.CheckoutSessionCreateLineItemParams{{Price: stripe.String(s.Config.StripePrice), Quantity: stripe.Int64(1)}}, Metadata: map[string]string{"umbra_order": order}}
	params.SetIdempotencyKey("umbra-order:" + order)
	session, e := stripe.NewClient(s.Config.StripeKey).V1CheckoutSessions.Create(r.Context(), params)
	if e != nil {
		slog.Error("stripe checkout failed", "order_id", order)
		fail(w, 502, "checkout_unavailable", "Checkout is unavailable. Retry later")
		return
	}
	_, e = s.DB.Exec(r.Context(), `UPDATE checkout_orders SET session_id=$2 WHERE id=$1 AND (session_id IS NULL OR session_id=$2)`, order, session.ID)
	if e != nil {
		fail(w, 500, "internal_error", "Checkout is unavailable. Retry later")
		return
	}
	reply(w, 200, map[string]string{"url": session.URL})
}
func (s *Server) webhook(w http.ResponseWriter, r *http.Request) {
	if !s.billingEnabled {
		fail(w, 503, "billing_disabled", "Payments are disabled")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	payload, e := io.ReadAll(r.Body)
	if e != nil {
		fail(w, 400, "invalid_event", "Invalid event body")
		return
	}
	event, e := stripe.ConstructEvent(payload, r.Header.Get("Stripe-Signature"), s.Config.StripeWebhook)
	if e != nil {
		fail(w, 400, "invalid_signature", "Invalid Stripe signature")
		return
	}
	if event.Type != "checkout.session.completed" && event.Type != "checkout.session.async_payment_succeeded" {
		reply(w, 200, map[string]string{"status": "ignored"})
		return
	}
	var session stripe.CheckoutSession
	if json.Unmarshal(event.Data.Raw, &session) != nil {
		fail(w, 400, "invalid_event", "Invalid checkout event")
		return
	}
	if session.PaymentStatus != "paid" {
		reply(w, 200, map[string]string{"status": "awaiting_payment"})
		return
	}
	if e = s.fulfill(r.Context(), event.ID, &session); e != nil {
		slog.Error("checkout settlement failed", "event_id", event.ID, "error", e)
		fail(w, 500, "settlement_failed", "Payment confirmation will be retried")
		return
	}
	reply(w, 200, map[string]string{"status": "received"})
}
func (s *Server) fulfill(ctx context.Context, eventID string, session *stripe.CheckoutSession) error {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	order := session.ClientReferenceID
	var uid, status, currency string
	var credits, amount int
	var stored *string
	// Consistent user-before-order locking also protects concurrent webhook delivery.
	e = tx.QueryRow(ctx, `SELECT user_id FROM checkout_orders WHERE id=$1`, order).Scan(&uid)
	if e != nil {
		return e
	}
	var lock string
	if e = tx.QueryRow(ctx, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, uid).Scan(&lock); e != nil {
		return e
	}
	e = tx.QueryRow(ctx, `SELECT status,credits,amount,currency,session_id FROM checkout_orders WHERE id=$1 FOR UPDATE`, order).Scan(&status, &credits, &amount, &currency, &stored)
	if e != nil {
		return e
	}
	if session.Mode != "payment" || session.PaymentStatus != "paid" || session.AmountTotal != int64(amount) || string(session.Currency) != currency || session.Metadata["umbra_order"] != order || stored != nil && *stored != session.ID {
		return fmt.Errorf("checkout does not match recorded order")
	}
	if status != "paid" {
		if e = grant(ctx, tx, uid, credits, "purchase", "checkout:"+session.ID, "100-credit pack"); e != nil {
			return e
		}
		_, e = tx.Exec(ctx, `UPDATE checkout_orders SET status='paid',session_id=$2 WHERE id=$1`, order, session.ID)
		if e != nil {
			return e
		}
	}
	_, e = tx.Exec(ctx, `INSERT INTO stripe_events(id) VALUES($1) ON CONFLICT DO NOTHING`, eventID)
	if e == nil {
		e = tx.Commit(ctx)
	}
	return e
}
