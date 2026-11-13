// Curve evaluation for Part D. Points are arrays of any dimension
// (the app uses 2-D points [u, v] in the painting's normalised coordinates).

const lerpN = (a, b, t) => a.map((ai, i) => ai + (b[i] - ai) * t);
const combine = (pts, w) => pts[0].map((_, i) => pts.reduce((s, p, k) => s + w[k] * p[i], 0));

// Cubic Bernstein basis: B0 = (1−t)³, B1 = 3(1−t)²t, B2 = 3(1−t)t², B3 = t³.
export function bernstein3(t) {
  const u = 1 - t;
  return [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
}

// B(t) = Σ Bi(t) Pi
export function cubicBezier(p0, p1, p2, p3, t) {
  return combine([p0, p1, p2, p3], bernstein3(t));
}

// B'(t) = 3(1−t)²(P1−P0) + 6(1−t)t(P2−P1) + 3t²(P3−P2)
export function cubicBezierTangent(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const w = [-3 * u * u, 3 * u * u - 6 * u * t, 6 * u * t - 3 * t * t, 3 * t * t];
  return combine([p0, p1, p2, p3], w);
}

// de Casteljau: repeatedly lerp neighbours by t. Returns every level so the
// construction can be drawn; levels[3][0] is the curve point B(t).
export function deCasteljau(points, t) {
  const levels = [points.map((p) => p.slice())];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i + 1 < prev.length; i++) next.push(lerpN(prev[i], prev[i + 1], t));
    levels.push(next);
  }
  return levels;
}

// ---------------------------------------------------------------- piecewise Bézier
// Control array layout: K0 H H K1 H H K2 ... (3n+1 points, n segments).
// Knots (curve passes through them) are at indices 0, 3, 6, ...
export const segmentCount = (pts) => Math.floor((pts.length - 1) / 3);

// Global parameter s ∈ [0,1] → (segment index, local t).
export function locate(nSegs, s) {
  const x = Math.min(nSegs, Math.max(0, s) * nSegs);
  const seg = Math.min(nSegs - 1, Math.floor(x)); // s = 1 → last segment at t = 1
  return { seg, t: x - seg };
}

export function piecewiseBezier(pts, s) {
  const { seg, t } = locate(segmentCount(pts), s);
  const q = pts.slice(seg * 3, seg * 3 + 4);
  return { point: cubicBezier(...q, t), tangent: cubicBezierTangent(...q, t), seg, t };
}

// C¹ at an interior knot K (index 3k) between handles A (3k−1) and B (3k+1):
//   segment i ends with derivative 3(K − A), segment i+1 starts with 3(B − K),
//   so C¹ ⇔ B − K = K − A ⇔ B = 2K − A.
// After the control point `moved` changes, re-establish that for every joint.
export function enforceC1(pts, moved = -1) {
  for (let k = 3; k < pts.length - 1; k += 3) {
    const A = pts[k - 1], K = pts[k], B = pts[k + 1];
    if (moved === k + 1) pts[k - 1] = K.map((ki, i) => 2 * ki - B[i]);
    else pts[k + 1] = K.map((ki, i) => 2 * ki - A[i]); // default: the incoming handle wins
  }
  return pts;
}

// Largest violation of B − K = K − A over all joints (0 means exactly C¹).
export function c1Error(pts) {
  let e = 0;
  for (let k = 3; k < pts.length - 1; k += 3) {
    const A = pts[k - 1], K = pts[k], B = pts[k + 1];
    e = Math.max(e, Math.hypot(...K.map((ki, i) => (B[i] - ki) - (ki - A[i]))));
  }
  return e;
}

// ---------------------------------------------------------------- Catmull–Rom
// Uniform Catmull–Rom through points P0..Pm. Between Pi and Pi+1:
//   C(t) = ½ [ 2Pi + (−Pi−1 + Pi+1)t + (2Pi−1 − 5Pi + 4Pi+1 − Pi+2)t² + (−Pi−1 + 3Pi − 3Pi+1 + Pi+2)t³ ]
// End points are duplicated so the curve reaches the first and last point.
function crWeights(t) {
  const t2 = t * t, t3 = t2 * t;
  return [0.5 * (-t + 2 * t2 - t3), 0.5 * (2 - 5 * t2 + 3 * t3), 0.5 * (t + 4 * t2 - 3 * t3), 0.5 * (-t2 + t3)];
}
function crDerivWeights(t) {
  const t2 = t * t;
  return [0.5 * (-1 + 4 * t - 3 * t2), 0.5 * (-10 * t + 9 * t2), 0.5 * (1 + 8 * t - 9 * t2), 0.5 * (-2 * t + 3 * t2)];
}
function crQuad(P, i) {
  const at = (j) => P[Math.min(P.length - 1, Math.max(0, j))];
  return [at(i - 1), at(i), at(i + 1), at(i + 2)];
}
export function catmullRom(P, s) {
  const { seg, t } = locate(P.length - 1, s);
  const q = crQuad(P, seg);
  return { point: combine(q, crWeights(t)), tangent: combine(q, crDerivWeights(t)), seg, t };
}

// Knots of a piecewise-Bézier control array (the points the curve passes through).
export const knotsOf = (pts) => pts.filter((_, i) => i % 3 === 0);

// Initial handles for a list of knots, taken from Catmull–Rom tangents
// (handle = K ± (K_{i+1} − K_{i−1})/6). This is automatically C¹.
export function bezierFromKnots(K) {
  const out = [];
  const at = (j) => K[Math.min(K.length - 1, Math.max(0, j))];
  for (let i = 0; i < K.length; i++) {
    const d = at(i + 1).map((x, k) => (x - at(i - 1)[k]) / 6);
    if (i > 0) out.push(K[i].map((x, k) => x - d[k]));
    out.push(K[i].slice());
    if (i < K.length - 1) out.push(K[i].map((x, k) => x + d[k]));
  }
  return out;
}
