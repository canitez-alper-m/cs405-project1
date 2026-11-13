// The scene: painting on the wall, a table with objects (Part A), a hanging
// mobile (Part B) and a seed that rides the traced curve (Part D).
//
//   root
//   ├─ painting                      T(0, 3.1, 0)
//   │  ├─ frame                      T(0, 0, −0.06)
//   │  └─ rider                      T(curve point) · R_z(tangent angle)   ← Part D
//   ├─ table                         T(0, 0, 2.2)
//   │  ├─ objectA                    T·R·S  or  S·R·T  (UI)                 ← Part A
//   │  ├─ melon                      T(2.3, 0.42, −0.4) · R_y(0.35)
//   │  └─ plate                      T(0.4, 0.04, 0.9)
//   │     └─ apple                   T(0, 0.27, 0)
//   └─ hook                          T(5.6, 6.4, 2.4)
//      └─ bar1                       T(0, −0.7, 0) · R_y(θ1)    (animated)
//         ├─ melonL                  T(−1.5, −0.9, 0)
//         └─ bar2                    T(1.5, −0.8, 0) · R_y(θ2)  (animated)
//            ├─ cherry               T(−0.8, −0.6, 0)           ← leaf, depth 4
//            └─ slice                T(0.8, −0.6, 0) · R_z(0.3)

import * as M from '../math/mat4.js';
import { SceneNode } from './node.js';

// Painting size in world units: 5 high, width from the image's aspect ratio (720 × 502).
export const PAINTING = { width: 5 * 720 / 502, height: 5, center: [0, 3.1, 0], pixels: [720, 502] };

// sRGB hex → linear RGB (lighting is done in linear space, the shader encodes back to sRGB).
export function hexToLinear(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
}

export function buildScene() {
  const root = new SceneNode('root');

  const painting = root.add(new SceneNode('painting', {
    local: M.translate(...PAINTING.center), mesh: 'painting',
    meshMatrix: M.scale(PAINTING.width, PAINTING.height, 1),
  }));
  painting.add(new SceneNode('frame', {
    local: M.translate(0, 0, -0.06), mesh: 'cube', color: hexToLinear('#3b2a1a'),
    meshMatrix: M.scale(PAINTING.width + 0.35, PAINTING.height + 0.35, 0.1),
  }));
  painting.add(new SceneNode('rider', { mesh: 'pointer', color: hexToLinear('#e8c547'), meshMatrix: M.scale(0.45) }));

  const table = root.add(new SceneNode('table', {
    local: M.translate(0, 0, 2.2), mesh: 'cube', color: hexToLinear('#8f9a96'),
    meshMatrix: M.multiply(M.translate(0, -0.15, 0), M.scale(8.6, 0.3, 4.2)),
  }));
  table.add(new SceneNode('objectA', { mesh: 'cube', color: hexToLinear('#b4441c') }));
  table.add(new SceneNode('melon', {
    local: M.multiply(M.translate(2.3, 0.42, -0.4), M.rotateY(0.35)), mesh: 'sphere',
    color: hexToLinear('#c9a032'), meshMatrix: M.scale(1.5, 0.84, 0.9),
  }));
  const plate = table.add(new SceneNode('plate', {
    local: M.translate(0.4, 0.04, 0.9), mesh: 'cube', color: hexToLinear('#e8e2d0'),
    meshMatrix: M.scale(1.2, 0.08, 1.2),
  }));
  plate.add(new SceneNode('apple', { local: M.translate(0, 0.27, 0), mesh: 'sphere', color: hexToLinear('#9fbf3b'), meshMatrix: M.scale(0.46) }));

  const hook = root.add(new SceneNode('hook', { local: M.translate(5.6, 6.4, 2.4), mesh: 'cube', color: hexToLinear('#444444'), meshMatrix: M.scale(0.18) }));
  const bar1 = hook.add(new SceneNode('bar1', { mesh: 'cube', color: hexToLinear('#2d2d2d'), meshMatrix: M.scale(3.0, 0.05, 0.05), string: true }));
  bar1.add(new SceneNode('melonL', { local: M.translate(-1.5, -0.9, 0), mesh: 'sphere', color: hexToLinear('#d2a53a'), meshMatrix: M.scale(0.7, 0.46, 0.46), string: true }));
  const bar2 = bar1.add(new SceneNode('bar2', { mesh: 'cube', color: hexToLinear('#2d2d2d'), meshMatrix: M.scale(1.6, 0.04, 0.04), string: true }));
  bar2.add(new SceneNode('cherry', { local: M.translate(-0.8, -0.6, 0), mesh: 'sphere', color: hexToLinear('#a3201c'), meshMatrix: M.scale(0.28), string: true }));
  bar2.add(new SceneNode('slice', {
    local: M.multiply(M.translate(0.8, -0.6, 0), M.rotateZ(0.3)), mesh: 'cube',
    color: hexToLinear('#b7c94a'), meshMatrix: M.scale(0.5, 0.12, 0.3), string: true,
  }));

  return root;
}

// Part A: the two composition orders for the UI-controlled object.
export function objectAMatrices(a) {
  const T = M.translate(a.tx, a.ty, a.tz);
  const R = M.rotate(a.axis, a.angle);
  const S = M.scale(a.s);
  return { T, R, S, TRS: M.multiplyAll(T, R, S), SRT: M.multiplyAll(S, R, T) };
}

// Animated locals of the mobile.
export function mobileLocals(theta1, theta2) {
  return {
    bar1: M.multiply(M.translate(0, -0.7, 0), M.rotateY(theta1)),
    bar2: M.multiply(M.translate(1.5, -0.8, 0), M.rotateY(theta2)),
  };
}
