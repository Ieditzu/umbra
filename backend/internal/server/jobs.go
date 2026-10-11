package server

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

type work struct {
	ID, UserID, Attempt string
	Request             AnalysisRequest
}
type workerResult struct {
	Result    json.RawMessage   `json:"result"`
	Artifacts map[string]string `json:"artifacts"`
}

func (s *Server) Run(ctx context.Context) {
	go s.cleanupLoop(ctx)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			job, e := s.claim(ctx)
			if e != nil {
				slog.Error("queue claim failed", "error", e)
				continue
			}
			if job == nil {
				continue
			}
			s.execute(ctx, *job)
		}
	}
}
func (s *Server) claim(ctx context.Context) (*work, error) {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		return nil, e
	}
	defer tx.Rollback(ctx)
	// Expired leases are retried once. A per-attempt directory fences old worker output.
	_, e = tx.Exec(ctx, `UPDATE analyses SET status='queued',message='Recovering interrupted analysis',lease_until=NULL WHERE status='running' AND lease_until<now()`)
	if e != nil {
		return nil, e
	}
	var job work
	var request []byte
	e = tx.QueryRow(ctx, `SELECT id,user_id,request FROM analyses WHERE status='queued' AND deleted_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`).Scan(&job.ID, &job.UserID, &request)
	if e != nil {
		if errors.Is(e, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, e
	}
	if e = json.Unmarshal(request, &job.Request); e != nil {
		return nil, e
	}
	job.Attempt = id()
	_, e = tx.Exec(ctx, `UPDATE analyses SET status='running',attempt=$2,attempts=attempts+1,lease_until=$3,updated_at=now(),message='Preparing analysis',progress=0.02 WHERE id=$1`, job.ID, job.Attempt, time.Now().Add(s.Config.JobTimeout+30*time.Second))
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		return nil, e
	}
	return &job, nil
}
func (s *Server) execute(parent context.Context, job work) {
	var attempts int
	var expiry time.Time
	if e := s.DB.QueryRow(parent, `SELECT attempts,expires_at FROM analyses WHERE id=$1`, job.ID).Scan(&attempts, &expiry); e != nil {
		return
	}
	if attempts > 2 || time.Now().After(expiry) {
		s.finish(parent, job, nil, "Analysis could not complete. Your reserved credit was released")
		return
	}
	paths := map[string]string{}
	roles := map[string]string{"calibration": job.Request.CalibrationID, "main": job.Request.MainID}
	if job.Request.ReferenceID != "" {
		roles["ground_truth"] = job.Request.ReferenceID
	}
	for role, mid := range roles {
		var path string
		if e := s.DB.QueryRow(parent, `SELECT relative_path FROM media WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL AND expires_at>now()`, mid, job.UserID).Scan(&path); e != nil {
			s.finish(parent, job, nil, "An input clip is unavailable. Your reserved credit was released")
			return
		}
		paths[role] = path
	}
	ctx, cancel := context.WithTimeout(parent, s.Config.JobTimeout)
	defer cancel()
	done := make(chan struct{})
	go s.trackProgress(ctx, job, done)
	var out workerResult
	e := s.workerCall(ctx, "/analyse", map[string]any{"id": job.ID, "attempt": job.Attempt, "paths": paths, "scene": map[string]any{"recorded_at": job.Request.RecordedAt, "latitude": job.Request.Latitude, "longitude": job.Request.Longitude}, "shadow_region": job.Request.ShadowRegion}, &out)
	close(done)
	if parent.Err() != nil {
		return
	} // On shutdown leave the reservation and lease for recovery.
	if e != nil {
		slog.Error("analysis worker failed", "analysis_id", job.ID, "error", e)
		s.finish(parent, job, nil, "Video processing failed or timed out. Your reserved credit was released")
		return
	}
	if len(out.Result) == 0 || out.Artifacts["result"] == "" || out.Artifacts["report"] == "" {
		s.finish(parent, job, nil, "Incomplete analysis output. Your reserved credit was released")
		return
	}
	prefix := filepath.Join("runs", job.ID, job.Attempt) + string(filepath.Separator)
	for _, relative := range out.Artifacts {
		if relative == "" {
			continue
		}
		if len(relative) < len(prefix) || relative[:len(prefix)] != prefix {
			s.finish(parent, job, nil, "Invalid analysis output. Your reserved credit was released")
			return
		}
		p, err := s.safePath(relative)
		if err != nil {
			s.finish(parent, job, nil, "Invalid analysis output. Your reserved credit was released")
			return
		}
		if st, err := os.Stat(p); err != nil || !st.Mode().IsRegular() {
			s.finish(parent, job, nil, "Incomplete analysis files. Your reserved credit was released")
			return
		}
	}
	s.finish(parent, job, &out, "")
}
func (s *Server) trackProgress(ctx context.Context, job work, done <-chan struct{}) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-done:
			return
		case <-ticker.C:
			poll, cancel := context.WithTimeout(ctx, 2*time.Second)
			req, _ := http.NewRequestWithContext(poll, "GET", s.Config.WorkerURL+"/progress/"+job.Attempt, nil)
			req.Header.Set("Authorization", "Bearer "+s.Config.WorkerToken)
			resp, e := s.client.Do(req)
			if e == nil {
				var v struct {
					Progress float64 `json:"progress"`
					Message  string  `json:"message"`
				}
				if resp.StatusCode == 200 && json.NewDecoder(resp.Body).Decode(&v) == nil && v.Progress >= 0 && v.Progress <= 1 {
					_, _ = s.DB.Exec(poll, `UPDATE analyses SET progress=$3,message=$4,updated_at=now() WHERE id=$1 AND attempt=$2 AND status='running'`, job.ID, job.Attempt, v.Progress, v.Message)
				}
				resp.Body.Close()
			}
			cancel()
		}
	}
}
func (s *Server) finish(ctx context.Context, job work, out *workerResult, message string) {
	tx, e := s.DB.Begin(ctx)
	if e != nil {
		slog.Error("job settlement unavailable", "analysis_id", job.ID)
		return
	}
	defer tx.Rollback(ctx)
	var lock string
	e = tx.QueryRow(ctx, `SELECT id FROM users WHERE id=$1 FOR UPDATE`, job.UserID).Scan(&lock)
	if e != nil {
		return
	}
	var status, attempt string
	e = tx.QueryRow(ctx, `SELECT status,attempt FROM analyses WHERE id=$1 FOR UPDATE`, job.ID).Scan(&status, &attempt)
	if e != nil || status != "running" || attempt != job.Attempt {
		return
	}
	if out != nil {
		e = grant(ctx, tx, job.UserID, -1, "analysis", "analysis:"+job.ID, "Completed analysis")
		if e == nil {
			artifacts, _ := json.Marshal(out.Artifacts)
			_, e = tx.Exec(ctx, `UPDATE analyses SET status='succeeded',progress=1,message='Complete',result=$2,artifacts=$3,lease_until=NULL,updated_at=now() WHERE id=$1`, job.ID, out.Result, artifacts)
		}
	} else {
		_, e = tx.Exec(ctx, `UPDATE analyses SET status='failed',message=$2,lease_until=NULL,updated_at=now() WHERE id=$1`, job.ID, message)
	}
	if e == nil {
		_, e = tx.Exec(ctx, `UPDATE users SET reserved=reserved-1 WHERE id=$1`, job.UserID)
	}
	if e == nil {
		e = tx.Commit(ctx)
	}
	if e != nil {
		slog.Error("job settlement failed", "analysis_id", job.ID, "error", e)
	}
}
func (s *Server) cleanupLoop(ctx context.Context) {
	s.cleanup(ctx)
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.cleanup(ctx)
		}
	}
}
func (s *Server) cleanup(ctx context.Context) {
	// Recover uploads whose writer stopped before database registration.
	if entries, err := os.ReadDir(filepath.Join(s.Config.DataDir, "media")); err == nil {
		for _, entry := range entries {
			if !entry.Type().IsRegular() || len(entry.Name()) != 32 {
				continue
			}
			info, err := entry.Info()
			if err != nil || time.Since(info.ModTime()) < time.Hour {
				continue
			}
			var registered bool
			if err = s.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM media WHERE relative_path=$1)`, "media/"+entry.Name()).Scan(&registered); err == nil && !registered {
				_ = os.Remove(filepath.Join(s.Config.DataDir, "media", entry.Name()))
			}
		}
	}
	// Retain summary/ledger records, remove footage and large result timelines.
	rows, e := s.DB.Query(ctx, `SELECT id,relative_path FROM media WHERE expires_at<now() AND deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM analyses a WHERE a.status IN ('running','queued') AND (a.request->>'calibration_media_id'=media.id OR a.request->>'main_media_id'=media.id OR a.request->>'ground_truth_media_id'=media.id))`)
	if e == nil {
		for rows.Next() {
			var mid, p string
			if rows.Scan(&mid, &p) == nil {
				if path, err := s.safePath(p); err == nil {
					if err = os.Remove(path); err == nil || os.IsNotExist(err) {
						_, _ = s.DB.Exec(ctx, `UPDATE media SET deleted_at=now() WHERE id=$1`, mid)
					}
				}
			}
		}
		rows.Close()
	}
	rows, e = s.DB.Query(ctx, `SELECT id FROM analyses WHERE expires_at<now() AND status IN ('succeeded','failed')`)
	if e == nil {
		for rows.Next() {
			var aid string
			if rows.Scan(&aid) == nil && len(aid) == 32 {
				if e = os.RemoveAll(filepath.Join(s.Config.DataDir, "runs", aid)); e == nil {
					_, _ = s.DB.Exec(ctx, `UPDATE analyses SET artifacts=NULL,result=result-'timeline' WHERE id=$1`, aid)
				}
			}
		}
		rows.Close()
	}
	_, _ = s.DB.Exec(ctx, `DELETE FROM sessions WHERE expires_at<now()`)
	_, _ = s.DB.Exec(ctx, `DELETE FROM account_tokens WHERE expires_at<now()`)
}
