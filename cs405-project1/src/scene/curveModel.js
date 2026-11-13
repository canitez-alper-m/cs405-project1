// Part D: the editable curve traced over the painting.
// All points are stored in the painting's NORMALISED coordinates [u, v]:
// u ∈ [0,1] left → right, v ∈ [0,1] bottom → top (origin = bottom-left corner).

import * as C from '../math/curves.js';
import { PAINTING } from './scene.js';

// Outline of the melon and its cut slice in Kavunlu Natürmort, picked in image
// pixels (720 × 502, y down): top of the melon from the cut face, round the right
// end, along the rim of the slice to its left tip.
const TRACE_PX = [
  [197, 113], [300, 66], [450, 57], [585, 97], [636, 190], [618, 280],
  [590, 345], [470, 398], [300, 406], [160, 368], [133, 318],
];
const [IW, IH] = PAINTING.pixels;
const pxToUV = ([x, y]) => [x / IW, 1 - y / IH];

export class CurveModel {
  constructor() { this.reset(); }

  reset() {
    this.pts = C.bezierFromKnots(TRACE_PX.map(pxToUV)); // K H H K H H K ...
    this.mode = 'bezier';                                 // 'bezier' | 'catmull'
  }

  knots() { return C.knotsOf(this.pts); }
  segments() { return this.mode === 'bezier' ? C.segmentCount(this.pts) : this.knots().length - 1; }
  isKnot(i) { return i % 3 === 0; }

  // Point and tangent at global parameter s ∈ [0, 1].
  evaluate(s) {
    return this.mode === 'bezier' ? C.piecewiseBezier(this.pts, s) : C.catmullRom(this.knots(), s);
  }

  sample(n) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(this.evaluate(i / n).point);
    return out;
  }

  // de Casteljau levels of the Bézier segment that contains s.
  casteljau(s) {
    const { seg, t } = C.locate(C.segmentCount(this.pts), s);
    return { seg, t, levels: C.deCasteljau(this.pts.slice(seg * 3, seg * 3 + 4), t) };
  }

  // Drag point i to uv. A knot carries its two handles with it; a handle drags
  // its partner on the other side of the joint so the curve stays C¹.
  move(i, uv) {
    const p = this.pts[i];
    const d = [uv[0] - p[0], uv[1] - p[1]];
    if (this.isKnot(i)) {
      for (const j of [i - 1, i, i + 1]) if (this.pts[j]) this.pts[j] = [this.pts[j][0] + d[0], this.pts[j][1] + d[1]];
    } else {
      this.pts[i] = uv.slice();
      C.enforceC1(this.pts, i);
    }
  }

  // Place a new knot at the end of the curve (adds one C¹ segment).
  addKnot(uv) {
    const n = this.pts.length;
    const K = this.pts[n - 1], A = this.pts[n - 2];
    const h1 = [2 * K[0] - A[0], 2 * K[1] - A[1]];             // mirrored → C¹ at the old end knot
    const h2 = [h1[0] + (uv[0] - h1[0]) * 2 / 3, h1[1] + (uv[1] - h1[1]) * 2 / 3];
    this.pts.push(h1, h2, uv.slice());
  }

  removeLast() {
    if (C.segmentCount(this.pts) > 3) this.pts.splice(-3, 3);
  }

  c1Error() { return C.c1Error(this.pts); }

  // Painting-local coordinates (painting centre = origin, units = world units).
  static uvToLocal([u, v]) { return [(u - 0.5) * PAINTING.width, (v - 0.5) * PAINTING.height]; }

  toJSON() {
    const r = (x) => +x.toFixed(4);
    return {
      painting: 'Kavunlu Natürmort (Still Life with Melon)',
      artist: 'Şeker Ahmed Paşa',
      collection: 'Sakıp Sabancı Museum',
      coordinates: 'normalised: u 0..1 left to right, v 0..1 bottom to top, (0,0) = bottom-left',
      activeCurve: this.mode === 'bezier' ? 'piecewise cubic Bezier (C1)' : 'uniform Catmull-Rom',
      piecewiseBezier: {
        segments: C.segmentCount(this.pts),
        layout: 'K0 H H K1 H H K2 ... (knots at indices 0,3,6,...; segment i uses points 3i..3i+3)',
        c1MaxError: +this.c1Error().toExponential(2),
        controlPoints: this.pts.map((p, i) => ({ u: r(p[0]), v: r(p[1]), role: this.isKnot(i) ? 'knot' : 'handle' })),
      },
      catmullRom: {
        segments: this.knots().length - 1,
        points: this.knots().map((p) => ({ u: r(p[0]), v: r(p[1]) })),
      },
    };
  }
}
