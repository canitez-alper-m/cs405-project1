// Procedural geometry. Lit meshes are non-indexed triangle lists with
// interleaved [px, py, pz, nx, ny, nz] per vertex (stride 24 bytes).

import { cross, sub, normalize } from '../math/vec3.js';

function pushTri(out, a, b, c, n) {
  n = n || normalize(cross(sub(b, a), sub(c, a)));
  for (const p of [a, b, c]) out.push(p[0], p[1], p[2], n[0], n[1], n[2]);
}

// Unit cube centred at the origin, side 1.
export function cube() {
  const out = [];
  const faces = [ // normal, then the 4 corners counter-clockwise seen from outside
    [[1, 0, 0], [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]]],
    [[-1, 0, 0], [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]]],
    [[0, 1, 0], [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]]],
    [[0, -1, 0], [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]]],
    [[0, 0, 1], [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]]],
    [[0, 0, -1], [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]]],
  ];
  for (const [n, [a, b, c, d]] of faces) { pushTri(out, a, b, c, n); pushTri(out, a, c, d, n); }
  return new Float32Array(out);
}

// UV sphere of radius 0.5.
export function sphere(slices = 28, stacks = 18) {
  const out = [];
  const P = (i, j) => {
    const th = (i / slices) * 2 * Math.PI, ph = (j / stacks) * Math.PI;
    return [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
  };
  for (let j = 0; j < stacks; j++) {
    for (let i = 0; i < slices; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      for (const [x, y, z] of [a, c, b, a, d, c]) out.push(x * .5, y * .5, z * .5, x, y, z); // normal = direction
    }
  }
  return new Float32Array(out);
}

// A small "seed" pointer: a square pyramid whose tip points along +x.
// Used for the object that rides the curve, so its orientation is visible.
export function pointer() {
  const out = [];
  const tip = [0.6, 0, 0];
  const b = [[-0.4, -0.25, -0.18], [-0.4, 0.25, -0.18], [-0.4, 0.25, 0.18], [-0.4, -0.25, 0.18]];
  for (let i = 0; i < 4; i++) pushTri(out, b[i], b[(i + 1) % 4], tip);
  pushTri(out, b[0], b[3], b[2]); pushTri(out, b[0], b[2], b[1]);
  return new Float32Array(out);
}

// Painting quad in the xy-plane, side 1, facing +z. Layout [px, py, pz, u, v].
// Texture v runs downwards in the image, so v = 0.5 − y.
export function paintingQuad() {
  const v = [
    [-.5, -.5, 0, 0, 1], [.5, -.5, 0, 1, 1], [.5, .5, 0, 1, 0],
    [-.5, -.5, 0, 0, 1], [.5, .5, 0, 1, 0], [-.5, .5, 0, 0, 0],
  ];
  return new Float32Array(v.flat());
}
