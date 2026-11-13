// 4×4 matrix library, written from scratch for CS405 Project 1.
//
// Storage convention: COLUMN-MAJOR, 16 numbers. Element (row r, column c)
// lives at index c*4 + r. This is exactly the layout WGSL's mat4x4<f32>
// expects in a uniform buffer, so a matrix can be uploaded without transposing.
//
// Vectors are column vectors and matrices multiply on the left:
//     p' = M · p,  and  M = A · B  applies B first, then A.

import { sub, cross, dot, normalize, length } from './vec3.js';

export function identity() {
  return [1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1];
}

// o = a · b
export function multiply(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; // row r of a · column c of b
      o[c * 4 + r] = s;
    }
  }
  return o;
}

// multiplyAll(A, B, C) = A · B · C  (C is applied first)
export function multiplyAll(...ms) {
  return ms.reduce((acc, m) => multiply(acc, m), identity());
}

// The translation sits in the 4th column: indices 12, 13, 14.
export function translate(x, y, z) {
  return [1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          x, y, z, 1];
}

export function scale(x, y = x, z = x) {
  return [x, 0, 0, 0,
          0, y, 0, 0,
          0, 0, z, 0,
          0, 0, 0, 1];
}

// Right-handed rotations by angle a (radians), counter-clockwise when looking
// down the axis towards the origin. Written column by column.
export function rotateX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0,
          0, c, s, 0,
          0, -s, c, 0,
          0, 0, 0, 1];
}

export function rotateY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0,
          0, 1, 0, 0,
          s, 0, c, 0,
          0, 0, 0, 1];
}

export function rotateZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, 0, 0,
          -s, c, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1];
}

export function rotate(axis, a) {
  if (axis === 'x') return rotateX(a);
  if (axis === 'y') return rotateY(a);
  return rotateZ(a);
}

export function transpose(m) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[r * 4 + c] = m[c * 4 + r];
  return o;
}

// Inverse of a rigid transform M = [R | t] (rotation + translation only).
// Because R is orthonormal, R⁻¹ = Rᵀ, so M⁻¹ = [Rᵀ | −Rᵀ t].
export function invertRigid(m) {
  const o = identity();
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 4 + r] = m[r * 4 + c]; // Rᵀ
  const tx = m[12], ty = m[13], tz = m[14];
  for (let r = 0; r < 3; r++) o[12 + r] = -(o[r] * tx + o[4 + r] * ty + o[8 + r] * tz);
  return o;
}

// M · (x, y, z, w). Returns [x', y', z', w'].
export function transformVec4(m, p, w = 1) {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  ];
}

export const transformPoint = (m, p) => transformVec4(m, p, 1).slice(0, 3);
export const transformDir = (m, d) => transformVec4(m, d, 0).slice(0, 3);
export const getTranslation = (m) => [m[12], m[13], m[14]];

// ---------------------------------------------------------------- camera
// Camera basis from eye/target/up. The camera looks down its own −z axis, so
//   w = normalize(eye − target)        (points backwards, out of the screen)
//   u = normalize(up × w)              (camera right)   — 1st cross product
//   v = w × u                          (camera up)      — 2nd cross product
// If up is parallel to the view direction, up × w = 0 and u is undefined.
// In that case a different helper "up" is used, so the camera never flips to NaN.
export function lookAtBasis(eye, target, up = [0, 1, 0]) {
  const w = normalize(sub(eye, target));
  let r = cross(up, w);
  let degenerate = false;
  if (length(r) < 1e-6) {
    degenerate = true;
    const alt = Math.abs(w[2]) < 0.9 ? [0, 0, -1] : [1, 0, 0];
    r = cross(alt, w);
  }
  const u = normalize(r);
  const v = cross(w, u);
  return { u, v, w, degenerate };
}

// View matrix V = [ uᵀ  −u·eye ]
//                 [ vᵀ  −v·eye ]
//                 [ wᵀ  −w·eye ]
//                 [ 0     1    ]
// i.e. the inverse of the camera's rigid "camera-to-world" matrix [u v w eye].
export function lookAt(eye, target, up = [0, 1, 0]) {
  const { u, v, w } = lookAtBasis(eye, target, up);
  return [u[0], v[0], w[0], 0,
          u[1], v[1], w[1], 0,
          u[2], v[2], w[2], 0,
          -dot(u, eye), -dot(v, eye), -dot(w, eye), 1];
}

// Perspective projection for WebGPU: view-space z = −near → depth 0,
// z = −far → depth 1 (OpenGL would map to −1..1 instead).
//   x_clip = (f/aspect)·x,  y_clip = f·y,  z_clip = A·z + B,  w_clip = −z
//   with f = 1/tan(fovY/2),  A = far/(near−far),  B = near·far/(near−far).
export function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const A = far / (near - far);
  const B = (near * far) / (near - far);
  return [f / aspect, 0, 0, 0,
          0, f, 0, 0,
          0, 0, A, -1,
          0, 0, B, 0];
}

// Orthographic projection for WebGPU: x,y in [l,r]×[b,t] → [−1,1],
// z = −near → 0 and z = −far → 1, w stays 1.
export function orthographic(left, right, bottom, top, near, far) {
  return [2 / (right - left), 0, 0, 0,
          0, 2 / (top - bottom), 0, 0,
          0, 0, 1 / (near - far), 0,
          -(right + left) / (right - left), -(top + bottom) / (top - bottom), near / (near - far), 1];
}

// Pretty-print as 4 rows (row-major on screen, even though storage is column-major).
export function format(m, digits = 2) {
  let s = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let v = m[c * 4 + r];
      if (Math.abs(v) < 0.5 * 10 ** -digits) v = 0;
      s += v.toFixed(digits).padStart(digits + 5);
    }
    s += '\n';
  }
  return s;
}
