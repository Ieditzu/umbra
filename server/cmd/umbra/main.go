package main

import (
	"context"
	"crypto/sha256"
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
	city := flags.Bool("city", false, "prepare the wider Constanta city extract instead of the central research pilot; use a separate --data path")
	suceava := flags.Bool("suceava", false, "prepare the Suceava city extract; use a separate --data path")
	extract := flags.String("extract", "", "optional local OSM JSON extract instead of an Overpass download")
	auditPath := flags.String("audit", "", "optional reviewed obstruction inventory JSON in EPSG:32635")
	addrDefault := os.Getenv("UMBRA_ADDR")
	if addrDefault == "" {
		addrDefault = "0.0.0.0:8000"
	}
	addr := flags.String("addr", addrDefault, "serve bind address; use a LAN IP from the phone")
	flags.Parse(os.Args[2:])
	switch os.Args[1] {
	case "prepare":
		if *suceava && (*city || *extract == "") {
			log.Fatal("--suceava requires --extract and cannot be combined with --city")
		}
		if (*city || *suceava) && *path == umbra.DefaultDataPath() {
			log.Fatal("--city requires an explicit separate --data path")
		}
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
		var d *umbra.Dataset
		var e error
		if *extract != "" {
			b, err := os.ReadFile(*extract)
			if err != nil {
				log.Fatal(err)
			}
			area, id := umbra.PilotBBox, umbra.PilotID
			if *city {
				area, id = umbra.CityArea, "constanta-city-v1"
			}
			if *suceava {
				area, id = umbra.Bounds{West: 26.09, South: 47.59, East: 26.41, North: 47.77}, "suceava-city-v1"
			}
			d, e = umbra.BuildDatasetArea(b, area, id)
			if e == nil {
				d.Audit = audit
				d.Metadata["import_source"] = "local OSM JSON extract"
				d.Metadata["source_sha256"] = fmt.Sprintf("%x", sha256.Sum256(b))
				var provenance struct {
					Source struct {
						URL  string `json:"url"`
						File string `json:"file"`
						SHA  string `json:"sha256"`
					} `json:"source"`
				}
				if err := json.Unmarshal(b, &provenance); err == nil {
					d.Metadata["source_url"], d.Metadata["source_file"], d.Metadata["source_pbf_sha256"] = provenance.Source.URL, provenance.Source.File, provenance.Source.SHA
				}
				e = umbra.SaveDataset(*path, d)
			}
		} else if *city {
			d, e = umbra.PrepareArea(ctx, *path, *endpoint, *refresh, audit, umbra.CityArea, "constanta-city-v1")
		} else {
			d, e = umbra.Prepare(ctx, *path, *endpoint, *refresh, audit)
		}
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
