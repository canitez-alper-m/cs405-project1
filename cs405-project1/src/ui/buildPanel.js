// Builds the side panel. Returns the <pre> elements that main.js fills with text.

import { Panel, el } from './controls.js';

const deg = (v) => `${v.toFixed(0)}°`;

export function buildPanel(root, { state, cam, curve, actions }) {
  const P = new Panel(root);
  el('h1', { text: 'Kavunlu Natürmort — CS405 Project 1' }, root);
  el('p', { class: 'sub', text: 'Şeker Ahmed Paşa · Sakıp Sabancı Museum · WebGPU' }, root);
  const out = {};

  // ---------------------------------------------------------------- E: views / debug
  const e = P.section('Views, reset & debug (Part E)');
  let r = P.row(e);
  P.choice(r, [['main', 'Main camera'], ['inspection', 'Inspection'], ['split', 'Split']], { get: () => state.view, set: (v) => (state.view = v) });
  r = P.row(e);
  P.button(r, 'Reset scene', actions.reset);
  P.button(r, 'Save PNG of 3D view', actions.savePNG);
  r = P.row(e);
  P.toggle(r, 'Node axes', { get: () => state.debugAxes, set: (v) => (state.debugAxes = v) });
  P.toggle(r, 'Frustum', { get: () => state.showFrustum, set: (v) => (state.showFrustum = v) });
  P.toggle(r, 'Grid', { get: () => state.showGrid, set: (v) => (state.showGrid = v) });
  P.toggle(r, 'Strings', { get: () => state.showStrings, set: (v) => (state.showStrings = v) });
  P.hint(e, 'Main view: drag empty space to orbit, wheel to zoom, drag curve points to edit, double-click the painting to add a point.');

  // ---------------------------------------------------------------- A
  const a = P.section('A · Transformations');
  r = P.row(a);
  P.choice(r, [['TRS', 'M = T·R·S'], ['SRT', 'M = S·R·T']], { get: () => state.order, set: (v) => (state.order = v) });
  P.toggle(r, 'Ghost of other order', { get: () => state.showGhost, set: (v) => (state.showGhost = v) });
  const A = state.A;
  P.slider(a, 'translate x', { min: -4, max: 4, step: 0.05, get: () => A.tx, set: (v) => (A.tx = v) });
  P.slider(a, 'translate y', { min: 0, max: 3, step: 0.05, get: () => A.ty, set: (v) => (A.ty = v) });
  P.slider(a, 'translate z', { min: -2, max: 2, step: 0.05, get: () => A.tz, set: (v) => (A.tz = v) });
  P.slider(a, 'rotation', { min: -180, max: 180, step: 1, get: () => A.angleDeg, set: (v) => (A.angleDeg = v), fmt: deg });
  r = P.row(a);
  el('span', { text: 'rotation axis', class: 'hint' }, r);
  P.choice(r, [['x', 'x'], ['y', 'y'], ['z', 'z']], { get: () => A.axis, set: (v) => (A.axis = v) });
  P.slider(a, 'scale', { min: 0.2, max: 2.5, step: 0.05, get: () => A.s, set: (v) => (A.s = v) });
  out.matrices = P.pre(a);
  P.hint(a, 'The red cube uses the selected order; the blue wireframe shows the other order. All other objects use T·R·S.');

  // ---------------------------------------------------------------- B
  const b = P.section('B · Scene graph');
  r = P.row(b);
  P.toggle(r, 'Animate mobile', { get: () => state.animate, set: (v) => (state.animate = v) });
  P.slider(b, 'θ1 (bar1)', { min: -180, max: 180, step: 1, get: () => state.theta1Deg, set: (v) => (state.theta1Deg = v), fmt: deg });
  P.slider(b, 'θ2 (bar2)', { min: -180, max: 180, step: 1, get: () => state.theta2Deg, set: (v) => (state.theta2Deg = v), fmt: deg });
  out.tree = P.pre(b);
  out.leaf = P.pre(b);

  // ---------------------------------------------------------------- C
  const c = P.section('C · Camera & projection');
  r = P.row(c);
  P.choice(r, [[false, 'Perspective'], [true, 'Orthographic']], { get: () => cam.ortho, set: (v) => (cam.ortho = v) });
  P.button(r, 'Look straight down', () => { cam.pitch = Math.PI / 2; });
  P.slider(c, 'azimuth', { min: -3.14, max: 3.14, step: 0.01, get: () => cam.yaw, set: (v) => (cam.yaw = v) });
  P.slider(c, 'elevation', { min: -1.5708, max: 1.5708, step: 0.01, get: () => cam.pitch, set: (v) => (cam.pitch = v) });
  P.slider(c, 'distance', { min: 3, max: 40, step: 0.1, get: () => cam.dist, set: (v) => (cam.dist = v), fmt: (v) => v.toFixed(1) });
  P.slider(c, 'fov y', { min: 15, max: 110, step: 1, get: () => cam.fovDeg, set: (v) => (cam.fovDeg = v), fmt: deg });
  P.slider(c, 'near', { min: 0.05, max: 10, step: 0.05, get: () => cam.near, set: (v) => (cam.near = Math.min(v, cam.far - 0.1)) });
  P.slider(c, 'far', { min: 5, max: 100, step: 0.5, get: () => cam.far, set: (v) => (cam.far = Math.max(v, cam.near + 0.1)), fmt: (v) => v.toFixed(1) });
  out.camera = P.pre(c);

  // ---------------------------------------------------------------- D
  const d = P.section('D · Curves over the painting');
  r = P.row(d);
  P.choice(r, [['bezier', 'Bézier (C¹ piecewise)'], ['catmull', 'Catmull–Rom']], { get: () => curve.mode, set: (v) => (curve.mode = v) });
  P.slider(d, 'parameter t', { min: 0, max: 1, step: 0.001, get: () => state.t, set: (v) => (state.t = v), fmt: (v) => v.toFixed(3) });
  r = P.row(d);
  P.toggle(r, 'Animate rider', { get: () => state.curveAnim, set: (v) => (state.curveAnim = v) });
  P.toggle(r, 'de Casteljau', { get: () => state.showCasteljau, set: (v) => (state.showCasteljau = v) });
  P.toggle(r, 'Control polygon', { get: () => state.showPolygon, set: (v) => (state.showPolygon = v) });
  r = P.row(d);
  P.button(r, 'Remove last segment', () => curve.removeLast());
  P.button(r, 'Export JSON', actions.exportJSON);
  out.curve = P.pre(d);
  out.json = P.pre(d);
  out.json.hidden = true;

  return { panel: P, out };
}
