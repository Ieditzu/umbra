package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata"

	"github.com/Ieditzu/umbra/server/internal/umbra"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: umbra prepare|serve [flags]")
	}
	flags := flag.NewFlagSet(os.Args[1], flag.ExitOnError)
	path := flags.String("data", umbra.DefaultDataPath(), "prepared dataset path outside Git")
	endpoint := flags.String("overpass", umbra.DefaultOverpass, "read-only Overpass interpreter endpoint")
	refresh := flags.Bool("refresh", false, "explicitly fetch a fresh extract")
	auditPath := flags.String("audit", "", "optional reviewed obstruction inventory JSON in EPSG:32635")
	addrDefault := os.Getenv("UMBRA_ADDR")
	if addrDefault == "" {
		addrDefault = "0.0.0.0:8000"
	}
	addr := flags.String("addr", addrDefault, "serve bind address; use a LAN IP from the phone")
	flags.Parse(os.Args[2:])
	switch os.Args[1] {
	case "prepare":
		var audit *umbra.Audit
		if *auditPath != "" {
			b, e := os.ReadFile(*auditPath)
			if e != nil {
				log.Fatal(e)
			}
			audit = &umbra.Audit{}
			if e = json.Unmarshal(b, audit); e != nil {
				log.Fatal(e)
			}
		}
		ctx, cancel := context.WithTimeout(context.Background(), 160*time.Second)
		defer cancel()
		d, e := umbra.Prepare(ctx, *path, *endpoint, *refresh, audit)
		if e != nil {
			log.Fatal(e)
		}
		counts := map[string]int{}
		for _, b := range d.Buildings {
			counts[b.Height.Source]++
		}
		out := map[string]any{"data_path": *path, "pilot": d.PilotID, "nodes": len(d.Nodes), "directed_edges": len(d.Edges), "buildings": len(d.Buildings), "height_sources": counts, "metadata": d.Metadata}
		b, _ := json.MarshalIndent(out, "", "  ")
		fmt.Println(string(b))
	case "serve":
		var router *umbra.Router
		d, e := umbra.LoadDataset(*path)
		if e != nil {
			log.Printf("dataset unavailable: %v; health will report not ready", e)
		} else {
			router = umbra.NewRouter(d)
		}
		server := &http.Server{Addr: *addr, Handler: umbra.NewHandler(router), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 17 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10}
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		go func() {
			<-ctx.Done()
			shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			server.Shutdown(shutdown)
		}()
		log.Printf("Umbra listening on %s; route calculations use the prepared snapshot only", *addr)
		if e = server.ListenAndServe(); e != nil && !errors.Is(e, http.ErrServerClosed) {
			log.Fatal(e)
		}
	default:
		log.Fatal("supported commands: prepare serve")
	}
}
