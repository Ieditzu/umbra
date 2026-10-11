package server

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Region struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}
type AnalysisRequest struct {
	Name          string     `json:"name"`
	CalibrationID string     `json:"calibration_media_id"`
	MainID        string     `json:"main_media_id"`
	ReferenceID   string     `json:"ground_truth_media_id,omitempty"`
	RecordedAt    *time.Time `json:"recorded_at,omitempty"`
	Latitude      *float64   `json:"latitude,omitempty"`
	Longitude     *float64   `json:"longitude,omitempty"`
	ShadowRegion  *Region    `json:"shadow_region,omitempty"`
}

func (v *AnalysisRequest) validate() bool {
	v.Name = strings.TrimSpace(v.Name)
	if len(v.Name) < 1 || len(v.Name) > 100 || v.CalibrationID == "" || v.MainID == "" || v.CalibrationID == v.MainID {
		return false
	}
	if (v.Latitude == nil) != (v.Longitude == nil) {
		return false
	}
	if v.Latitude != nil && (*v.Latitude < -90 || *v.Latitude > 90 || *v.Longitude < -180 || *v.Longitude > 180) {
		return false
	}
	if b := v.ShadowRegion; b != nil {
		if math.IsNaN(b.X) || math.IsNaN(b.Y) || b.X < 0 || b.Y < 0 || b.Width <= .02 || b.Height <= .02 || b.X+b.Width > 1 || b.Y+b.Height > 1 {
			return false
		}
	}
	return true
}
func (s *Server) workerCall(ctx context.Context, path string, payload, out any) error {
	data, e := json.Marshal(payload)
	if e != nil {
		return e
	}
	req, e := http.NewRequestWithContext(ctx, "POST", s.Config.WorkerURL+path, bytes.NewReader(data))
	if e != nil {
		return e
	}
	req.Header.Set("Authorization", "Bearer "+s.Config.WorkerToken)
	req.Header.Set("Content-Type", "application/json")
	resp, e := s.client.Do(req)
	if e != nil {
		return e
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("worker returned %d", resp.StatusCode)
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 16*1024*1024)).Decode(out)
}

func (s *Server) listMedia(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query(r.Context(), `SELECT id,role,name,metadata,expires_at FROM media WHERE user_id=$1 AND deleted_at IS NULL AND expires_at>now() ORDER BY created_at DESC`, who(r).ID)
	if err != nil {
		fail(w, 500, "internal_error", "Stored clips unavailable")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var mid, role, name string
		var metadata json.RawMessage
		var expires time.Time
		if err = rows.Scan(&mid, &role, &name, &metadata, &expires); err != nil {
			fail(w, 500, "internal_error", "Stored clips unavailable")
			return
		}
		items = append(items, map[string]any{"id": mid, "role": role, "name": name, "metadata": metadata, "expires_at": expires})
	}
	if rows.Err() != nil {
		fail(w, 500, "internal_error", "Stored clips unavailable")
		return
	}
	reply(w, 200, map[string]any{"items": items})
}
func (s *Server) upload(w http.ResponseWriter, r *http.Request) {
	uid := who(r).ID
	// Serialize upload admission per account without holding a database transaction for decoding.
	if !s.allow("upload:"+uid, 20, time.Hour) {
		fail(w, 429, "upload_limit", "Maximum 20 uploads per hour")
		return
	}
	var count int
	if e := s.DB.QueryRow(r.Context(), `SELECT count(*) FROM media WHERE user_id=$1 AND deleted_at IS NULL AND expires_at>now()`, uid).Scan(&count); e != nil {
		fail(w, 500, "internal_error", "Upload unavailable")
		return
	}
	if count >= 20 {
		fail(w, 422, "storage_limit", "Delete unused clips before uploading more (maximum 20)")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, s.Config.MaxUpload+1024*1024)
	reader, e := r.MultipartReader()
	if e != nil {
		fail(w, 422, "invalid_upload", "Send multipart/form-data with role and file fields")
		return
	}
	mid := id()
	relative := "media/" + mid
	destination := filepath.Join(s.Config.DataDir, relative)
	saved := false
	defer func() {
		if !saved {
			_ = os.Remove(destination)
		}
	}()
	role, name := "", ""
	hasFile := false
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			fail(w, 413, "invalid_upload", "Upload exceeds the limit or is incomplete")
			return
		}
		switch part.FormName() {
		case "role":
			b, err := io.ReadAll(io.LimitReader(part, 32))
			if err != nil {
				fail(w, 422, "invalid_upload", "Invalid role")
				return
			}
			role = string(b)
		case "file":
			if hasFile {
				fail(w, 422, "invalid_upload", "Send one file per upload")
				return
			}
			hasFile = true
			name = filepath.Base(strings.ReplaceAll(part.FileName(), "\\", "/"))
			if len(name) > 200 {
				name = name[:200]
			}
			ext := strings.ToLower(filepath.Ext(name))
			if ext != ".mp4" && ext != ".webm" && ext != ".mov" {
				fail(w, 422, "unsupported_video", "Upload an MP4, WebM or MOV video")
				return
			}
			file, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
			if err != nil {
				fail(w, 500, "internal_error", "Video storage unavailable")
				return
			}
			n, err := io.Copy(file, io.LimitReader(part, s.Config.MaxUpload+1))
			closeErr := file.Close()
			if err != nil || closeErr != nil || n == 0 || n > s.Config.MaxUpload {
				fail(w, 413, "invalid_upload", "Video is empty, incomplete, or exceeds the upload limit")
				return
			}
		default:
			fail(w, 422, "invalid_upload", "Only role and file fields are accepted")
			return
		}
		_ = part.Close()
	}
	if !hasFile || (role != "calibration" && role != "main" && role != "ground_truth") {
		fail(w, 422, "invalid_upload", "Provide a file and calibration, main or ground_truth role")
		return
	}
	var metadata map[string]any
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	if e = s.workerCall(ctx, "/inspect", map[string]any{"path": relative, "role": role}, &metadata); e != nil {
		fail(w, 422, "invalid_video", "Video must be decodable, at most 18 seconds for calibration or 60 seconds for trial/reference, and at most 3840 × 2160 pixels")
		return
	}
	// Lock the user and recheck the storage cap after concurrent uploads.
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		fail(w, 500, "internal_error", "Upload registration failed")
		return
	}
	defer tx.Rollback(r.Context())
	var locked string
	e = tx.QueryRow(r.Context(), `SELECT id FROM users WHERE id=$1 FOR UPDATE`, uid).Scan(&locked)
	if e == nil {
		e = tx.QueryRow(r.Context(), `SELECT count(*) FROM media WHERE user_id=$1 AND deleted_at IS NULL AND expires_at>now()`, uid).Scan(&count)
	}
	if e != nil {
		fail(w, 500, "internal_error", "Upload registration failed")
		return
	}
	if count >= 20 {
		fail(w, 422, "storage_limit", "Maximum 20 stored clips per account")
		return
	}
	expiry := time.Now().Add(30 * 24 * time.Hour)
	meta, _ := json.Marshal(metadata)
	_, e = tx.Exec(r.Context(), `INSERT INTO media(id,user_id,role,name,relative_path,metadata,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, mid, uid, role, name, relative, meta, expiry)
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		fail(w, 500, "internal_error", "Upload registration failed")
		return
	}
	saved = true
	reply(w, 201, map[string]any{"id": mid, "role": role, "name": name, "metadata": metadata, "expires_at": expiry})
}
func (s *Server) submit(w http.ResponseWriter, r *http.Request) {
	var v AnalysisRequest
	if !decode(w, r, &v) {
		return
	}
	if !v.validate() {
		fail(w, 422, "invalid_input", "Provide a name, calibration/trial IDs and valid optional scene coordinates or shadow region")
		return
	}
	key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if len(key) > 128 {
		fail(w, 422, "invalid_input", "Idempotency-Key must be at most 128 characters")
		return
	}
	data, _ := json.Marshal(v)
	hash := digest(string(data))
	uid := who(r).ID
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		fail(w, 500, "internal_error", "Submission unavailable")
		return
	}
	defer tx.Rollback(r.Context())
	var credits, reserved int
	e = tx.QueryRow(r.Context(), `SELECT credits,reserved FROM users WHERE id=$1 FOR UPDATE`, uid).Scan(&credits, &reserved)
	if e != nil {
		fail(w, 500, "internal_error", "Submission unavailable")
		return
	}
	if key != "" {
		var existing, previous string
		e = tx.QueryRow(r.Context(), `SELECT id,request_hash FROM analyses WHERE user_id=$1 AND idempotency_key=$2`, uid, key).Scan(&existing, &previous)
		if e == nil {
			if hash != previous {
				fail(w, 409, "idempotency_conflict", "This idempotency key was used with a different request")
				return
			}
			reply(w, 200, map[string]any{"id": existing, "replayed": true})
			return
		}
	}
	if credits-reserved < 1 {
		fail(w, 402, "insufficient_credits", "You need one available credit to run an analysis")
		return
	}
	var outstanding int
	e = tx.QueryRow(r.Context(), `SELECT count(*) FROM analyses WHERE user_id=$1 AND status IN ('queued','running')`, uid).Scan(&outstanding)
	if e != nil {
		fail(w, 500, "internal_error", "Submission unavailable")
		return
	}
	if outstanding >= 2 {
		fail(w, 429, "job_limit", "Wait for an existing analysis to complete (maximum two outstanding)")
		return
	}
	expiry := time.Now().Add(30 * 24 * time.Hour)
	roles := map[string]string{v.CalibrationID: "calibration", v.MainID: "main"}
	if v.ReferenceID != "" {
		roles[v.ReferenceID] = "ground_truth"
	}
	for mid, role := range roles {
		var actual string
		var expires time.Time
		e = tx.QueryRow(r.Context(), `SELECT role,expires_at FROM media WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL AND expires_at>now() FOR UPDATE`, mid, uid).Scan(&actual, &expires)
		if e != nil || actual != role {
			fail(w, 422, "invalid_media", "A clip is unavailable or has the wrong role")
			return
		}
		if expires.Before(expiry) {
			expiry = expires
		}
	}
	aid := id()
	var idem any
	if key != "" {
		idem = key
	}
	_, e = tx.Exec(r.Context(), `INSERT INTO analyses(id,user_id,name,request,request_hash,idempotency_key,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, aid, uid, v.Name, data, hash, idem, expiry)
	if e == nil {
		_, e = tx.Exec(r.Context(), `UPDATE users SET reserved=reserved+1 WHERE id=$1`, uid)
	}
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		fail(w, 500, "internal_error", "Submission unavailable")
		return
	}
	reply(w, 202, map[string]any{"id": aid, "status": "queued", "reserved_credits": 1})
}
func (s *Server) listAnalyses(w http.ResponseWriter, r *http.Request) {
	limit := 20
	offset := 0
	var e error
	if p := r.URL.Query().Get("limit"); p != "" {
		limit, e = strconv.Atoi(p)
		if e != nil || limit < 1 || limit > 100 {
			fail(w, 422, "invalid_input", "limit must be 1–100")
			return
		}
	}
	if p := r.URL.Query().Get("offset"); p != "" {
		offset, e = strconv.Atoi(p)
		if e != nil || offset < 0 {
			fail(w, 422, "invalid_input", "offset must be non-negative")
			return
		}
	}
	rows, e := s.DB.Query(r.Context(), `SELECT id,name,status,progress,message,result,created_at,expires_at FROM analyses WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3`, who(r).ID, limit+1, offset)
	if e != nil {
		fail(w, 500, "internal_error", "History unavailable")
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var aid, name, status, message string
		var progress float64
		var result json.RawMessage
		var created, expiry time.Time
		if rows.Scan(&aid, &name, &status, &progress, &message, &result, &created, &expiry) != nil {
			fail(w, 500, "internal_error", "History unavailable")
			return
		}
		var summary map[string]any
		if len(result) > 0 {
			_ = json.Unmarshal(result, &summary)
		}
		items = append(items, map[string]any{"id": aid, "name": name, "status": status, "progress": progress, "message": message, "state": summary["state"], "lead_time_s": summary["lead_time_s"], "created_at": created, "expires_at": expiry})
	}
	if rows.Err() != nil {
		fail(w, 500, "internal_error", "History unavailable")
		return
	}
	more := len(items) > limit
	if more {
		items = items[:limit]
	}
	reply(w, 200, map[string]any{"items": items, "has_more": more, "offset": offset, "limit": limit})
}
func (s *Server) analysis(w http.ResponseWriter, r *http.Request) {
	var aid, name, status, message string
	var progress float64
	var result, request json.RawMessage
	var created, expiry time.Time
	e := s.DB.QueryRow(r.Context(), `SELECT id,name,status,progress,message,result,request,created_at,expires_at FROM analyses WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`, r.PathValue("id"), who(r).ID).Scan(&aid, &name, &status, &progress, &message, &result, &request, &created, &expiry)
	if e != nil {
		fail(w, 404, "not_found", "Analysis not found")
		return
	}
	reply(w, 200, map[string]any{"id": aid, "name": name, "status": status, "progress": progress, "message": message, "result": result, "request": request, "created_at": created, "expires_at": expiry, "artifacts_expired": time.Now().After(expiry)})
}
func (s *Server) artifact(w http.ResponseWriter, r *http.Request) {
	var raw []byte
	var expiry time.Time
	e := s.DB.QueryRow(r.Context(), `SELECT artifacts,expires_at FROM analyses WHERE id=$1 AND user_id=$2 AND status='succeeded' AND deleted_at IS NULL`, r.PathValue("id"), who(r).ID).Scan(&raw, &expiry)
	if e != nil {
		fail(w, 404, "not_found", "Artifacts not found")
		return
	}
	if time.Now().After(expiry) {
		fail(w, 410, "expired", "These files have expired")
		return
	}
	var artifacts map[string]string
	if json.Unmarshal(raw, &artifacts) != nil {
		fail(w, 404, "not_found", "Artifact not found")
		return
	}
	kind := r.PathValue("kind")
	if kind == "bundle" {
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", `attachment; filename="umbra-evidence.zip"`)
		archive := zip.NewWriter(w)
		defer archive.Close()
		for _, k := range []string{"result", "report", "predictions", "overlay", "visualization", "hidden_path_visualization"} {
			if relative := artifacts[k]; relative != "" {
				p, e := s.safePath(relative)
				if e != nil {
					continue
				}
				f, e := os.Open(p)
				if e != nil {
					continue
				}
				out, e := archive.Create(artifactName(k, p))
				if e == nil {
					_, _ = io.Copy(out, f)
				}
				f.Close()
			}
		}
		return
	}
	relative := artifacts[kind]
	if relative == "" {
		fail(w, 404, "not_found", "Artifact not available")
		return
	}
	p, e := s.safePath(relative)
	if e != nil {
		fail(w, 404, "not_found", "Artifact not found")
		return
	}
	if _, e = os.Stat(p); e != nil {
		fail(w, 410, "expired", "Artifact is no longer available")
		return
	}
	if kind != "visualization" && kind != "hidden_path_visualization" {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, artifactName(kind, p)))
	}
	http.ServeFile(w, r, p)
}

func artifactName(kind, path string) string {
	names := map[string]string{"result": "result.json", "report": "report.html", "predictions": "predictions.csv", "overlay": "scene.png", "visualization": "corner-trial.mp4", "hidden_path_visualization": "reference-path.mp4"}
	if name := names[kind]; name != "" {
		return name
	}
	return filepath.Base(path)
}
func (s *Server) safePath(relative string) (string, error) {
	if filepath.IsAbs(relative) || relative == "" {
		return "", fmt.Errorf("invalid path")
	}
	p := filepath.Join(s.Config.DataDir, relative)
	rel, e := filepath.Rel(s.Config.DataDir, p)
	if e != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("invalid path")
	}
	resolved, e := filepath.EvalSymlinks(p)
	if e == nil {
		rel, e = filepath.Rel(s.Config.DataDir, resolved)
		if e != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return "", fmt.Errorf("invalid path")
		}
	}
	return p, nil
}
func (s *Server) deleteAnalysis(w http.ResponseWriter, r *http.Request) {
	aid, uid := r.PathValue("id"), who(r).ID
	tag, e := s.DB.Exec(r.Context(), `UPDATE analyses SET deleted_at=now(),result=NULL,artifacts=NULL WHERE id=$1 AND user_id=$2 AND status IN ('succeeded','failed') AND deleted_at IS NULL`, aid, uid)
	if e != nil {
		fail(w, 500, "internal_error", "Deletion failed")
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 409, "not_deletable", "Analysis is unavailable or still processing")
		return
	}
	if len(aid) == 32 && !strings.ContainsAny(aid, "/\\.") {
		_ = os.RemoveAll(filepath.Join(s.Config.DataDir, "runs", aid))
	}
	reply(w, 200, map[string]string{"message": "Analysis and generated files deleted"})
}
func (s *Server) deleteMedia(w http.ResponseWriter, r *http.Request) {
	uid, mid := who(r).ID, r.PathValue("id")
	tx, e := s.DB.Begin(r.Context())
	if e != nil {
		fail(w, 500, "internal_error", "Deletion failed")
		return
	}
	defer tx.Rollback(r.Context())
	var locked string
	e = tx.QueryRow(r.Context(), `SELECT id FROM users WHERE id=$1 FOR UPDATE`, uid).Scan(&locked)
	if e != nil {
		fail(w, 500, "internal_error", "Deletion failed")
		return
	}
	var p string
	e = tx.QueryRow(r.Context(), `SELECT relative_path FROM media WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL FOR UPDATE`, mid, uid).Scan(&p)
	if e != nil {
		fail(w, 404, "not_found", "Clip not found")
		return
	}
	var used bool
	e = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM analyses WHERE user_id=$1 AND status IN ('queued','running') AND (request->>'calibration_media_id'=$2 OR request->>'main_media_id'=$2 OR request->>'ground_truth_media_id'=$2))`, uid, mid).Scan(&used)
	if e != nil {
		fail(w, 500, "internal_error", "Deletion failed")
		return
	}
	if used {
		fail(w, 409, "clip_in_use", "Wait for the analysis using this clip to finish")
		return
	}
	_, e = tx.Exec(r.Context(), `UPDATE media SET deleted_at=now() WHERE id=$1`, mid)
	if e == nil {
		e = tx.Commit(r.Context())
	}
	if e != nil {
		fail(w, 500, "internal_error", "Deletion failed")
		return
	}
	if path, e := s.safePath(p); e == nil {
		_ = os.Remove(path)
	}
	reply(w, 200, map[string]string{"message": "Clip deleted"})
}
