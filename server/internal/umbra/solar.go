package umbra

import (
	"math"
	"time"
)

type Sun struct {
	Elevation float64
	Azimuth   float64
}

func norm(v float64) float64 { return math.Mod(math.Mod(v, 360)+360, 360) }

// SolarPosition implements the NOAA/Meeus solar-coordinate equations, geometric elevation.
// Azimuth is clockwise from true north. No weather/refraction/terrain inference is made.
func SolarPosition(t time.Time, c Coordinate) Sun {
	t = t.UTC()
	jd := float64(t.Unix())/86400 + 2440587.5 + float64(t.Nanosecond())/86400e9
	tt := (jd - 2451545) / 36525
	l := norm(280.46646 + tt*(36000.76983+tt*.0003032))
	m := 357.52911 + tt*(35999.05029-.0001537*tt)
	ecc := .016708634 - tt*(.000042037+.0000001267*tt)
	center := math.Sin(radians(m))*(1.914602-tt*(.004817+.000014*tt)) + math.Sin(2*radians(m))*(.019993-.000101*tt) + math.Sin(3*radians(m))*.000289
	omega := 125.04 - 1934.136*tt
	lambda := l + center - .00569 - .00478*math.Sin(radians(omega))
	eps := 23 + (26+(21.448-tt*(46.815+tt*(.00059-tt*.001813)))/60)/60 + .00256*math.Cos(radians(omega))
	decl := math.Asin(math.Sin(radians(eps)) * math.Sin(radians(lambda)))
	y := math.Pow(math.Tan(radians(eps)/2), 2)
	eq := 4 * degrees(y*math.Sin(2*radians(l))-2*ecc*math.Sin(radians(m))+4*ecc*y*math.Sin(radians(m))*math.Cos(2*radians(l))-.5*y*y*math.Sin(4*radians(l))-1.25*ecc*ecc*math.Sin(2*radians(m)))
	mins := float64(t.Hour()*60+t.Minute()) + float64(t.Second())/60 + float64(t.Nanosecond())/60e9
	ha := radians(norm((mins+eq+4*c.Longitude)/4) - 180)
	lat := radians(c.Latitude)
	cosz := math.Sin(lat)*math.Sin(decl) + math.Cos(lat)*math.Cos(decl)*math.Cos(ha)
	elevation := 90 - degrees(math.Acos(math.Max(-1, math.Min(1, cosz))))
	az := norm(degrees(math.Atan2(math.Sin(ha), math.Cos(ha)*math.Sin(lat)-math.Tan(decl)*math.Cos(lat))) + 180)
	return Sun{elevation, az}
}

// Convert a true-north solar bearing into a metric grid direction. This includes
// local UTM meridian convergence, rather than treating grid north as true north.
func solarDirection(p Point, az float64) Point {
	c := Unproject(p)
	d := 100. / 6378137.
	lat := radians(c.Latitude)
	lon := radians(c.Longitude)
	a := radians(az)
	lat2 := math.Asin(math.Sin(lat)*math.Cos(d) + math.Cos(lat)*math.Sin(d)*math.Cos(a))
	lon2 := lon + math.Atan2(math.Sin(a)*math.Sin(d)*math.Cos(lat), math.Cos(d)-math.Sin(lat)*math.Sin(lat2))
	q := Project(Coordinate{degrees(lat2), degrees(lon2)})
	v := sub(q, p)
	n := math.Hypot(v.X, v.Y)
	return Point{v.X / n, v.Y / n}
}
