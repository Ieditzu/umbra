package umbra

import "time"

type Coordinate struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}
type Request struct {
	SchemaVersion     int        `json:"schema_version"`
	Origin            Coordinate `json:"origin"`
	Destination       Coordinate `json:"destination"`
	DepartureAt       string     `json:"departure_at"`
	DepartureTimezone string     `json:"departure_timezone"`
	MaxExtraMinutes   int        `json:"max_extra_minutes"`
	WalkingSpeed      float64    `json:"walking_speed_mps"`
}
type Segment struct {
	Coordinates []Coordinate `json:"coordinates"`
	Duration    float64      `json:"duration_s"`
	Exposure    string       `json:"exposure"`
}
type Route struct {
	ID       string    `json:"id"`
	Kind     string    `json:"kind"`
	Distance float64   `json:"distance_m"`
	Duration float64   `json:"duration_s"`
	Segments []Segment `json:"segments"`
}
type Comparison struct {
	SchemaVersion int      `json:"schema_version"`
	DepartureAt   string   `json:"departure_at"`
	GeneratedAt   string   `json:"generated_at"`
	Method        string   `json:"method"`
	Routes        []Route  `json:"routes"`
	Warnings      []string `json:"warnings"`
	Attribution   []string `json:"attribution"`
}
type Settings struct {
	MaxSnapM       float64
	SampleM        float64
	CandidateLimit int
	ComputeBudget  time.Duration
}

func DefaultSettings() Settings { return Settings{75, 10, 12, 12 * time.Second} }
