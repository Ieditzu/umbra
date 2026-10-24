package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/Ieditzu/umbra/server/internal/umbra"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("usage: umbra prepare [--data path] [--refresh] [--overpass url] [--audit file]")
	}
	flags := flag.NewFlagSet(os.Args[1], flag.ExitOnError)
	path := flags.String("data", umbra.DefaultDataPath(), "prepared dataset path outside Git")
	endpoint := flags.String("overpass", umbra.DefaultOverpass, "read-only Overpass interpreter endpoint")
	refresh := flags.Bool("refresh", false, "explicitly fetch a fresh extract")
	auditPath := flags.String("audit", "", "optional reviewed obstruction inventory JSON in EPSG:32635")
	flags.Parse(os.Args[2:])
	if os.Args[1] != "prepare" {
		log.Fatal("supported command: prepare")
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
}
