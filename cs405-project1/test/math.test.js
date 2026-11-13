// Unit tests for the maths modules. Run with npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/math/mat4.js';
import * as C from '../src/math/curves.js';

const close = (a, b, eps = 1e-9) => {
  assert.equal(a.length, b.length);
  a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < eps, `index ${i}: ${x} vs ${b[i]}`));
};

test('identity is neutral for multiply', () => {
  const A = M.multiplyAll(M.translate(1, 2, 3), M.rotateY(0.7), M.scale(2, 3, 4));
  close(M.multiply(M.identity(), A), A);
  close(M.multiply(A, M.identity()), A);
});

test('column-major layout: translation in elements 12..14', () => {
  const T = M.translate(4, 5, 6);
  assert.deepEqual([T[12], T[13], T[14]], [4, 5, 6]);
  close(M.transformPoint(T, [1, 1, 1]), [5, 6, 7]);
});

test('rotations turn axes the right-handed way', () => {
  close(M.transformPoint(M.rotateZ(Math.PI / 2), [1, 0, 0]), [0, 1, 0]);
  close(M.transformPoint(M.rotateX(Math.PI / 2), [0, 1, 0]), [0, 0, 1]);
  close(M.transformPoint(M.rotateY(Math.PI / 2), [0, 0, 1]), [1, 0, 0]);
});

test('multiply applies the right matrix first', () => {
  // T·S: scale then translate.   S·T: translate then scale (translation is scaled too this way).
  const T = M.translate(1, 0, 0), S = M.scale(2);
  close(M.transformPoint(M.multiply(T, S), [1, 0, 0]), [3, 0, 0]);
  close(M.transformPoint(M.multiply(S, T), [1, 0, 0]), [4, 0, 0]);
});

test('T·R·S differs from S·R·T', () => {
  const T = M.translate(1.5, 0.5, 0), R = M.rotateY(0.6), S = M.scale(1.4);
  const a = M.multiplyAll(T, R, S), b = M.multiplyAll(S, R, T);
  assert.ok(Math.abs(a[12] - b[12]) > 0.1);
});

test('transpose twice is identity, and transposes a rotation into its inverse', () => {
  const R = M.rotateX(0.4);
  close(M.transpose(M.transpose(R)), R);
  close(M.multiply(M.transpose(R), R), M.identity());
});

test('invertRigid undoes rotation + translation', () => {
  const A = M.multiplyAll(M.translate(3, -2, 5), M.rotateY(1.1), M.rotateX(-0.3));
  close(M.multiply(M.invertRigid(A), A), M.identity(), 1e-12);
  close(M.multiply(A, M.invertRigid(A)), M.identity(), 1e-12);
});

test('lookAt sends eye to origin and target onto −z', () => {
  const eye = [3, 4, 5], target = [0, 1, 0];
  const V = M.lookAt(eye, target, [0, 1, 0]);
  close(M.transformPoint(V, eye), [0, 0, 0], 1e-12);
  const t = M.transformPoint(V, target);
  close(t.slice(0, 2), [0, 0], 1e-12);
  assert.ok(t[2] < 0);
  // V is rigid: its upper 3×3 is orthonormal
  close(M.multiply(V, M.invertRigid(V)), M.identity(), 1e-12);
});

test('lookAt handles up parallel to the view direction', () => {
  const V = M.lookAt([0, 10, 0], [0, 0, 0], [0, 1, 0]);
  assert.ok(V.every(Number.isFinite));
  assert.ok(M.lookAtBasis([0, 10, 0], [0, 0, 0], [0, 1, 0]).degenerate);
  close(M.transformPoint(V, [0, 0, 0]), [0, 0, -10], 1e-12);
});

test('perspective maps near → 0 and far → 1 (WebGPU)', () => {
  const n = 0.5, f = 40, P = M.perspective(Math.PI / 3, 1.5, n, f);
  const z = (d) => { const c = M.transformVec4(P, [0, 0, -d]); return c[2] / c[3]; };
  assert.ok(Math.abs(z(n)) < 1e-12);
  assert.ok(Math.abs(z(f) - 1) < 1e-12);
  assert.ok(z(5) > 0 && z(5) < 1);
  // a point on the top frustum edge lands on y_ndc = 1
  const d = 7, c = M.transformVec4(P, [0, d * Math.tan(Math.PI / 6), -d]);
  assert.ok(Math.abs(c[1] / c[3] - 1) < 1e-12);
});

test('orthographic maps the box to [−1,1]² × [0,1]', () => {
  const O = M.orthographic(-4, 4, -3, 3, 0.5, 40);
  close(M.transformPoint(O, [4, 3, -0.5]), [1, 1, 0], 1e-12);
  close(M.transformPoint(O, [-4, -3, -40]), [-1, -1, 1], 1e-12);
});

test('Bernstein basis sums to 1', () => {
  for (const t of [0, 0.2, 0.5, 0.9, 1]) assert.ok(Math.abs(C.bernstein3(t).reduce((a, b) => a + b) - 1) < 1e-12);
});

test('Bézier starts at P0, ends at P3, and de Casteljau agrees', () => {
  const P = [[0, 0], [1, 2], [3, 2], [4, 0]];
  close(C.cubicBezier(...P, 0), P[0]);
  close(C.cubicBezier(...P, 1), P[3]);
  for (const t of [0.1, 0.45, 0.8]) close(C.deCasteljau(P, t)[3][0], C.cubicBezier(...P, t), 1e-12);
  close(C.cubicBezierTangent(...P, 0), [3, 6]); // 3(P1 − P0)
});

test('enforceC1 makes every joint C¹', () => {
  const pts = [[0, 0], [1, 1], [2, 1], [3, 0], [3.5, 2], [5, 1], [6, 0], [6, 1], [7, 2], [8, 0]];
  assert.ok(C.c1Error(pts) > 0.1);
  C.enforceC1(pts);
  assert.ok(C.c1Error(pts) < 1e-12);
  // tangents match on both sides of the joint at global s = 1/3
  const segs = C.segmentCount(pts);
  const left = C.cubicBezierTangent(...pts.slice(0, 4), 1), right = C.cubicBezierTangent(...pts.slice(3, 7), 0);
  close(left, right, 1e-12);
  assert.equal(segs, 3);
});

test('Catmull–Rom passes through its points', () => {
  const K = [[0, 0], [1, 2], [3, 3], [4, 1], [6, 0]];
  for (let i = 0; i < K.length; i++) close(C.catmullRom(K, i / (K.length - 1)).point, K[i], 1e-9);
});

test('bezierFromKnots gives a C¹ curve through the knots', () => {
  const K = [[0, 0], [1, 2], [3, 3], [4, 1]];
  const pts = C.bezierFromKnots(K);
  assert.equal(pts.length, 3 * (K.length - 1) + 1);
  assert.ok(C.c1Error(pts) < 1e-12);
  close(C.piecewiseBezier(pts, 1).point, K[3], 1e-6);
});
