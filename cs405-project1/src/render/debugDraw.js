// Helpers that build world-space line and flat-triangle vertex lists
// ([x, y, z, r, g, b] per vertex) for debug drawings, the frustum and the curve.

import { transformPoint } from '../math/mat4.js';

export const COL = {
  x: [0.85, 0.12, 0.08], y: [0.1, 0.65, 0.15], z: [0.1, 0.3, 0.9],
  curve: [1.0, 0.68, 0.06], polygon: [0.85, 0.85, 0.85], knot: [0.75, 0.12, 0.03], handle: [0.95, 0.95, 0.95],
  frustum: [0.9, 0.25, 0.08], string: [0.3, 0.3, 0.3], ghost: [0.25, 0.55, 1.0], grid: [0.12, 0.12, 0.12],
  cast: [[0.25, 0.55, 0.95], [0.25, 0.75, 0.3], [0.95, 0.35, 0.15]],
};

export class Batch {
  constructor() { this.lines = []; this.tris = []; }

  line(a, b, c) { this.lines.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2], c[0], c[1], c[2]); }

  polyline(pts, c, closed = false) {
    for (let i = 0; i + 1 < pts.length; i++) this.line(pts[i], pts[i + 1], c);
    if (closed && pts.length > 2) this.line(pts[pts.length - 1], pts[0], c);
  }

  tri(a, b, c, col) { for (const p of [a, b, c]) this.tris.push(p[0], p[1], p[2], col[0], col[1], col[2]); }

  // Local x/y/z axes of a world matrix.
  axes(M, len = 0.6) {
    const o = transformPoint(M, [0, 0, 0]);
    this.line(o, transformPoint(M, [len, 0, 0]), COL.x);
    this.line(o, transformPoint(M, [0, len, 0]), COL.y);
    this.line(o, transformPoint(M, [0, 0, len]), COL.z);
  }

  // Wireframe of the unit cube transformed by M.
  wireCube(M, c) {
    const v = [];
    for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) v.push(transformPoint(M, [x, y, z]));
    const e = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, b] of e) this.line(v[a], v[b], c);
  }

  // Filled marker in a plane (u, v = in-plane unit directions), as a square or diamond.
  marker(p, size, col, u = [1, 0, 0], v = [0, 1, 0], diamond = false) {
    const at = (a, b) => [p[0] + u[0] * a + v[0] * b, p[1] + u[1] * a + v[1] * b, p[2] + u[2] * a + v[2] * b];
    const s = size / 2;
    const q = diamond ? [at(0, -s * 1.3), at(s * 1.3, 0), at(0, s * 1.3), at(-s * 1.3, 0)] : [at(-s, -s), at(s, -s), at(s, s), at(-s, s)];
    this.tri(q[0], q[1], q[2], col); this.tri(q[0], q[2], q[3], col);
  }

  // Thick polyline in the xy-plane at height z (the curve over the painting).
  ribbon(pts, width, col) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l * width / 2, ny = dx / l * width / 2;
      const a0 = [a[0] + nx, a[1] + ny, a[2]], a1 = [a[0] - nx, a[1] - ny, a[2]];
      const b0 = [b[0] + nx, b[1] + ny, b[2]], b1 = [b[0] - nx, b[1] - ny, b[2]];
      this.tri(a0, a1, b1, col); this.tri(a0, b1, b0, col);
    }
  }

  grid(n = 10, step = 1, y = -0.31) {
    for (let i = -n; i <= n; i++) {
      this.line([i * step, y, -n * step], [i * step, y, n * step], COL.grid);
      this.line([-n * step, y, i * step], [n * step, y, i * step], COL.grid);
    }
  }
}
