package umbra

import (
	"math"
	"time"
)

type ExposureResult struct {
	Exposure string
	Reason   string
}
type Model struct{ Data *Dataset }

// ClassifyAt uses the dual of an extruded building's cast-shadow polygon: a ray
// from the ground point toward the sun intersects the footprint while its height
// is below the building roof. This preserves concave outlines and courtyard holes
// without constructing thousands of swept polygons for each traversal timestamp.
func (m Model) ClassifyAt(p Point, sun Sun, positionKnown bool) ExposureResult {
	if sun.Elevation < -.833 {
		return ExposureResult{"unknown", "night"}
	}
	if sun.Elevation < 5 {
		return ExposureResult{"unknown", "low_sun"}
	}
	if !positionKnown {
		return ExposureResult{"unknown", "road_or_grade_position"}
	}
	d := m.Data
	v := solarDirection(p, sun.Azimuth)
	rayLength := math.Hypot(d.Imported.East-d.Imported.West, d.Imported.North-d.Imported.South) * 2
	end := Point{p.X + v.X*rayLength, p.Y + v.Y*rayLength}
	rayBox := bounds([]Point{p, end})
	slope := math.Tan(radians(sun.Elevation))
	uncertain := false
	for _, b := range d.Buildings {
		if !rayBox.Intersects(b.Box) {
			continue
		}
		for _, poly := range b.Geometry {
			entry, hit := firstInteriorDistance(p, end, poly)
			if !hit {
				continue
			}
			if b.Height.Source == "missing" || b.Height.Source == "unsupported_elevated" {
				uncertain = true
				continue
			}
			// Estimated floor heights remain explicit assumptions. Between their lower
			// and upper sweeps the response is unknown, rather than forced into shade/sun.
			roofAtRay := entry * slope
			if roofAtRay+1e-4 < b.Height.Low {
				return ExposureResult{"shade", b.Height.Source}
			}
			if roofAtRay <= b.Height.High+1e-4 {
				uncertain = true
			}
		}
	}
	if uncertain {
		return ExposureResult{"unknown", "height_uncertainty"}
	}
	// OSM has no completeness guarantee. Absence of a mapped occluder is NOT proof
	// of sun. A reviewer must audit the ray corridor including nonbuilding obstacles.
	if d.Audit == nil {
		return ExposureResult{"unknown", "inventory_not_audited"}
	}
	reach := d.Audit.MaxHeight / slope
	far := Point{p.X + v.X*reach, p.Y + v.Y*reach}
	if !d.Imported.Contains(far) || !segmentInside(p, far, d.Audit.Area) {
		return ExposureResult{"unknown", "outside_obstruction_coverage"}
	}
	return ExposureResult{"sun", "audited_clear_ray"}
}
func (m Model) At(p Point, t time.Time, positionKnown bool) ExposureResult {
	return m.ClassifyAt(p, SolarPosition(t, Unproject(p)), positionKnown)
}

var reasonWarnings = map[string]string{
	"night":                        "The sun is below the horizon for part of this walk. The contract has no night category: these segments are unknown and no shade benefit is claimed.",
	"low_sun":                      "Solar elevation is below 5 degrees for part of this walk. Long shadows and horizon/refraction uncertainty are not classified.",
	"road_or_grade_position":       "OSM road centerlines and bridge/tunnel or elevated geometry have unknown exposure. No sidewalk position or road crossing has been invented.",
	"estimated_from_levels":        "Some modeled shade uses building:levels with assumed 2.5–3.5 m per floor plus up to 3 m roof allowance. These bounds are assumptions and not measured heights or confidence intervals.",
	"osm_height_tag":               "Some modeled shade uses OSM height tags. Tagged heights have not been independently measured or field validated.",
	"height_uncertainty":           "Potential obstructions have missing/unsupported heights or estimated height ranges that disagree; their affected exposure remains unknown.",
	"inventory_not_audited":        "The obstruction inventory has not been verified complete. Areas outside modeled building shadows remain unknown rather than automatically sun.",
	"outside_obstruction_coverage": "An exposure ray extends outside reviewed obstruction coverage; exposure remains unknown.",
	"audited_clear_ray":            "Sun estimates rely on the supplied obstruction-inventory audit and its maximum-height assumption; they are not weather observations.",
}
