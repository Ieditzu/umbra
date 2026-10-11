package main

import (
	"context"
	"flag"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"umbra/backend/internal/server"
)

func main() {
	if e := run(); e != nil {
		slog.Error("umbra stopped", "error", e)
		os.Exit(1)
	}
}
func run() error {
	command := "serve"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if command == "migrate" || command == "credits" {
		db, e := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
		if e != nil {
			return e
		}
		defer db.Close()
		if command == "migrate" {
			schema, e := os.ReadFile("migrations/001_initial.sql")
			if e != nil {
				return e
			}
			tx, e := db.Begin(ctx)
			if e != nil {
				return e
			}
			defer tx.Rollback(ctx)
			if _, e = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(74261901)`); e != nil {
				return e
			}
			if _, e = tx.Exec(ctx, string(schema)); e != nil {
				return e
			}
			return tx.Commit(ctx)
		}
		flags := flag.NewFlagSet("credits", flag.ContinueOnError)
		email := flags.String("email", "", "Account email")
		amount := flags.Int("amount", 0, "Signed credit adjustment")
		reason := flags.String("reason", "", "Audit reason")
		reference := flags.String("reference", "", "Unique adjustment reference")
		if e = flags.Parse(os.Args[2:]); e != nil {
			return e
		}
		if *email == "" || *amount == 0 || *reason == "" || *reference == "" {
			return fmt.Errorf("credits requires --email, --amount, --reason and --reference")
		}
		tx, e := db.Begin(ctx)
		if e != nil {
			return e
		}
		defer tx.Rollback(ctx)
		var uid string
		if e = tx.QueryRow(ctx, `SELECT id FROM users WHERE email=$1 FOR UPDATE`, *email).Scan(&uid); e != nil {
			return e
		}
		tag, e := tx.Exec(ctx, `INSERT INTO credit_ledger(id,user_id,amount,kind,reference,description) VALUES(md5(random()::text || clock_timestamp()::text),$1,$2,'adjustment',$3,$4) ON CONFLICT(reference) DO NOTHING`, uid, *amount, "operator:"+*reference, *reason)
		if e != nil {
			return e
		}
		if tag.RowsAffected() > 0 {
			if _, e = tx.Exec(ctx, `UPDATE users SET credits=credits+$2 WHERE id=$1`, uid, *amount); e != nil {
				return e
			}
		}
		return tx.Commit(ctx)
	}
	if command != "serve" {
		return fmt.Errorf("use serve, migrate, or credits")
	}
	config, e := server.LoadConfig()
	if e != nil {
		return e
	}
	app, e := server.New(ctx, config)
	if e != nil {
		return e
	}
	defer app.DB.Close()
	workerDone := make(chan struct{})
	go func() { app.Run(ctx); close(workerDone) }()
	httpServer := &http.Server{Addr: config.Address, Handler: app.Handler(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 2 * time.Minute, WriteTimeout: 3 * time.Minute, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16384}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutdown)
	}()
	slog.Info("Umbra public service ready", "address", config.Address)
	e = httpServer.ListenAndServe()
	cancel()
	<-workerDone
	if e == http.ErrServerClosed {
		return nil
	}
	return e
}
