package umbra

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
func failure(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"detail": message})
}

// NewHandler serves only a previously prepared in-memory snapshot. It does not
// download OSM data or mutate cache files, and is safe for concurrent requests.
func NewHandler(router *Router) http.Handler {
	mux := http.NewServeMux()
	slots := make(chan struct{}, 2)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		if router == nil {
			writeJSON(w, 503, map[string]any{"status": "not_ready", "ready": false, "detail": "Prepare the pilot dataset then restart the server."})
			return
		}
		d := router.Data
		counts := map[string]int{}
		for _, b := range d.Buildings {
			counts[b.Height.Source]++
		}
		writeJSON(w, 200, map[string]any{"status": "ok", "ready": true, "pilot_id": d.PilotID, "crs": d.CRS, "nodes": len(d.Nodes), "directed_edges": len(d.Edges), "buildings": len(d.Buildings), "height_sources": counts, "osm_base_timestamp": d.Metadata["osm_base_timestamp"], "field_validated": false, "obstruction_inventory_audited": d.Audit != nil})
	})
	mux.HandleFunc("POST /v1/routes/compare", func(w http.ResponseWriter, r *http.Request) {
		if router == nil {
			failure(w, 503, "Pilot data is not prepared. Run the prepare command and restart the server.")
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			w.Header().Set("Retry-After", "1")
			failure(w, 503, "Calculation capacity is busy. Retry shortly.")
			return
		}
		if ct := r.Header.Get("Content-Type"); ct != "" && !strings.HasPrefix(strings.ToLower(ct), "application/json") {
			failure(w, 415, "Content-Type must be application/json")
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16384))
		if err != nil {
			failure(w, 413, "Request body exceeds 16 KiB")
			return
		}
		var fields map[string]json.RawMessage
		if json.Unmarshal(body, &fields) != nil {
			failure(w, 422, "Invalid JSON object")
			return
		}
		for _, key := range []string{"schema_version", "origin", "destination", "departure_at", "departure_timezone", "max_extra_minutes", "walking_speed_mps"} {
			if val, ok := fields[key]; !ok || string(val) == "null" {
				failure(w, 422, "Missing required field: "+key)
				return
			}
		}
		for _, key := range []string{"origin", "destination"} {
			var c map[string]json.RawMessage
			if json.Unmarshal(fields[key], &c) != nil || c["latitude"] == nil || c["longitude"] == nil || string(c["latitude"]) == "null" || string(c["longitude"]) == "null" {
				failure(w, 422, "Both coordinates are required for "+key)
				return
			}
		}
		var q Request
		decoder := json.NewDecoder(strings.NewReader(string(body)))
		decoder.DisallowUnknownFields()
		if err = decoder.Decode(&q); err != nil {
			failure(w, 422, "Request does not match schema_version 1: "+err.Error())
			return
		}
		result, err := router.Compare(r.Context(), q)
		if err != nil {
			if r.Context().Err() != nil {
				return
			}
			var re *RouteError
			if errors.As(err, &re) {
				failure(w, re.Status, re.Message)
			} else if errors.Is(err, context.DeadlineExceeded) {
				failure(w, 503, "Calculation exceeded the 12-second budget. Choose a shorter route.")
			} else {
				failure(w, 503, "Calculation unavailable")
			}
			return
		}
		writeJSON(w, 200, result)
	})
	return mux
}
