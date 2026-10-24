package umbra

import "math"

// Point is an EPSG:32635 (WGS84 / UTM zone 35N) position in metres.
type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}
type Polygon [][]Point // exterior ring followed by holes

type Bounds struct {
	West  float64 `json:"west"`
	South float64 `json:"south"`
	East  float64 `json:"east"`
	North float64 `json:"north"`
}

func (b Bounds) Contains(p Point) bool {
	return p.X >= b.West && p.X <= b.East && p.Y >= b.South && p.Y <= b.North
}
func (b Bounds) Intersects(c Bounds) bool {
	return b.West <= c.East && b.East >= c.West && b.South <= c.North && b.North >= c.South
}
func (b Bounds) Expand(m float64) Bounds {
	return Bounds{b.West - m, b.South - m, b.East + m, b.North + m}
}
func bounds(points []Point) Bounds {
	b := Bounds{math.Inf(1), math.Inf(1), math.Inf(-1), math.Inf(-1)}
	for _, p := range points {
		b.West = math.Min(b.West, p.X)
		b.East = math.Max(b.East, p.X)
		b.South = math.Min(b.South, p.Y)
		b.North = math.Max(b.North, p.Y)
	}
	return b
}
func distance(a, b Point) float64      { return math.Hypot(a.X-b.X, a.Y-b.Y) }
func lerp(a, b Point, t float64) Point { return Point{a.X + (b.X-a.X)*t, a.Y + (b.Y-a.Y)*t} }
func cross(a, b Point) float64         { return a.X*b.Y - a.Y*b.X }
func sub(a, b Point) Point             { return Point{a.X - b.X, a.Y - b.Y} }
func length(points []Point) float64 {
	v := 0.
	for i := 1; i < len(points); i++ {
		v += distance(points[i-1], points[i])
	}
	return v
}
func ringContains(r []Point, p Point) bool {
	in := false
	j := len(r) - 1
	for i := range r {
		a, b := r[i], r[j]
		if (a.Y > p.Y) != (b.Y > p.Y) && p.X < (b.X-a.X)*(p.Y-a.Y)/(b.Y-a.Y)+a.X {
			in = !in
		}
		j = i
	}
	return in
}
func polygonContains(poly Polygon, p Point) bool {
	for _, ring := range poly {
		for i := 1; i < len(ring); i++ {
			a, b := ring[i-1], ring[i]
			v, w := sub(b, a), sub(p, a)
			if math.Abs(cross(v, w)) < 1e-7*math.Max(1, distance(a, b)) &&
				w.X*v.X+w.Y*v.Y >= 0 && w.X*v.X+w.Y*v.Y <= v.X*v.X+v.Y*v.Y {
				return false // boundary contact alone does not cross a building interior
			}
		}
	}
	if len(poly) == 0 || !ringContains(poly[0], p) {
		return false
	}
	for _, hole := range poly[1:] {
		if ringContains(hole, p) {
			return false
		}
	}
	return true
}

// Intersection parameter on a->b. Parallel segments do not create an interior crossing.
func intersection(a, b, c, d Point) (float64, bool) {
	r, s := sub(b, a), sub(d, c)
	den := cross(r, s)
	if math.Abs(den) < 1e-10 {
		return 0, false
	}
	t, u := cross(sub(c, a), s)/den, cross(sub(c, a), r)/den
	return t, t >= 0 && t <= 1 && u >= 0 && u <= 1
}
func boundaryParameters(a, b Point, poly Polygon) []float64 {
	out := []float64{0, 1}
	for _, ring := range poly {
		for i := 1; i < len(ring); i++ {
			if t, ok := intersection(a, b, ring[i-1], ring[i]); ok {
				out = append(out, t)
			}
		}
	}
	return out
}

// firstInteriorDistance ignores tangencies and respects courtyards/holes.
func firstInteriorDistance(a, b Point, poly Polygon) (float64, bool) {
	ts := boundaryParameters(a, b, poly)
	sortFloats(ts)
	for i := 1; i < len(ts); i++ {
		if ts[i]-ts[i-1] > 1e-9 && polygonContains(poly, lerp(a, b, (ts[i]+ts[i-1])/2)) {
			return ts[i-1] * distance(a, b), true
		}
	}
	return 0, false
}
func segmentInside(a, b Point, poly Polygon) bool {
	ts := boundaryParameters(a, b, poly)
	sortFloats(ts)
	for i := 1; i < len(ts); i++ {
		if ts[i]-ts[i-1] > 1e-9 && !polygonContains(poly, lerp(a, b, (ts[i]+ts[i-1])/2)) {
			return false
		}
	}
	return true
}
func sortFloats(v []float64) { // tiny ring-intersection lists
	for i := 1; i < len(v); i++ {
		for j := i; j > 0 && v[j] < v[j-1]; j-- {
			v[j], v[j-1] = v[j-1], v[j]
		}
	}
}
func Rect(b Bounds) Polygon {
	return Polygon{{{b.West, b.South}, {b.East, b.South}, {b.East, b.North}, {b.West, b.North}, {b.West, b.South}}}
}
func radians(d float64) float64 { return d * math.Pi / 180 }
func degrees(r float64) float64 { return r * 180 / math.Pi }

// Project uses the WGS84 Transverse Mercator series for UTM zone 35N.
// The pilot is within 2 degrees of its 27-degree central meridian.
func Project(c Coordinate) Point {
	const a = 6378137.
	const e2 = 0.0066943799901413165
	const k = .9996
	lat, lon := radians(c.Latitude), radians(c.Longitude-27)
	ep := e2 / (1 - e2)
	n := a / math.Sqrt(1-e2*math.Pow(math.Sin(lat), 2))
	t := math.Pow(math.Tan(lat), 2)
	cc := ep * math.Pow(math.Cos(lat), 2)
	aa := math.Cos(lat) * lon
	m := a * ((1-e2/4-3*e2*e2/64-5*e2*e2*e2/256)*lat - (3*e2/8+3*e2*e2/32+45*e2*e2*e2/1024)*math.Sin(2*lat) + (15*e2*e2/256+45*e2*e2*e2/1024)*math.Sin(4*lat) - (35*e2*e2*e2/3072)*math.Sin(6*lat))
	return Point{500000 + k*n*(aa+(1-t+cc)*math.Pow(aa, 3)/6+(5-18*t+t*t+72*cc-58*ep)*math.Pow(aa, 5)/120), k * (m + n*math.Tan(lat)*(aa*aa/2+(5-t+9*cc+4*cc*cc)*math.Pow(aa, 4)/24+(61-58*t+t*t+600*cc-330*ep)*math.Pow(aa, 6)/720))}
}
func Unproject(p Point) Coordinate {
	const a = 6378137.
	const e2 = 0.0066943799901413165
	const k = .9996
	ep := e2 / (1 - e2)
	e1 := (1 - math.Sqrt(1-e2)) / (1 + math.Sqrt(1-e2))
	mu := (p.Y / k) / (a * (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256))
	f := mu + (3*e1/2-27*math.Pow(e1, 3)/32)*math.Sin(2*mu) + (21*e1*e1/16-55*math.Pow(e1, 4)/32)*math.Sin(4*mu) + (151*math.Pow(e1, 3)/96)*math.Sin(6*mu) + (1097*math.Pow(e1, 4)/512)*math.Sin(8*mu)
	n := a / math.Sqrt(1-e2*math.Pow(math.Sin(f), 2))
	r := a * (1 - e2) / math.Pow(1-e2*math.Pow(math.Sin(f), 2), 1.5)
	t := math.Pow(math.Tan(f), 2)
	c := ep * math.Pow(math.Cos(f), 2)
	d := (p.X - 500000) / (n * k)
	lat := f - (n*math.Tan(f)/r)*(d*d/2-(5+3*t+10*c-4*c*c-9*ep)*math.Pow(d, 4)/24+(61+90*t+298*c+45*t*t-252*ep-3*c*c)*math.Pow(d, 6)/720)
	lon := (d - (1+2*t+c)*math.Pow(d, 3)/6 + (5-2*c+28*t-3*c*c+8*ep+24*t*t)*math.Pow(d, 5)/120) / math.Cos(f)
	return Coordinate{degrees(lat), 27 + degrees(lon)}
}
