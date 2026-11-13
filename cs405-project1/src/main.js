// CS405 Project 1 — entry point. Owns the application state and the frame loop,
// and glues maths (src/math), scene (src/scene), rendering (src/render) and UI (src/ui).

import * as M from './math/mat4.js';
import { Renderer } from './render/renderer.js';
import { Batch, COL } from './render/debugDraw.js';
import { buildScene, objectAMatrices, mobileLocals, PAINTING } from './scene/scene.js';
import { OrbitCamera, InspectionCamera } from './scene/camera.js';
import { CurveModel } from './scene/curveModel.js';
import { buildPanel } from './ui/buildPanel.js';
import { attachInput } from './ui/input.js';

const DEG = Math.PI / 180;

function defaultState() {
  return {
    view: 'split',                // 'main' | 'inspection' | 'split'
    order: 'TRS',                 // Part A composition order for objectA
    A: { tx: -1.8, ty: 0.45, tz: 0.6, angleDeg: 30, axis: 'y', s: 0.9 },
    showGhost: true,
    animate: true, theta1Deg: 20, theta2Deg: -40,
    debugAxes: false, showFrustum: true, showGrid: true, showStrings: true,
    t: 0.3, curveAnim: true, showCasteljau: true, showPolygon: true,
  };
}

const state = defaultState();
const cam = new OrbitCamera();
const insp = new InspectionCamera();
const curve = new CurveModel();
const root = buildScene();
const N = Object.fromEntries(['painting', 'table', 'objectA', 'rider', 'hook', 'bar1', 'bar2', 'cherry'].map((n) => [n, root.find(n)]));

const canvas = document.getElementById('gpu');
const hud = document.getElementById('hud');
const labels = document.getElementById('labels');

function resetAll() {
  const d = defaultState(), A = state.A;
  Object.assign(state, d);
  state.A = Object.assign(A, d.A);  // keep the same object: the panel holds a reference to it
  cam.reset();
  curve.reset();
}

function exportJSON() {
  const text = JSON.stringify(curve.toJSON(), null, 2);
  out.json.hidden = false;
  out.json.textContent = text;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = 'curve.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function savePNG() {
  if (!renderer) return;
  const { blob } = await renderer.capture();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kavunlu-${state.view}-${Date.now()}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const { panel, out } = buildPanel(document.getElementById('panel'), { state, cam, curve, actions: { reset: resetAll, exportJSON, savePNG } });

// ---------------------------------------------------------------- layout
let views = [];
let mainAspect = 1;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const half = Math.floor(w / 2);
  const rects = state.view === 'split'
    ? [['main', [0, 0, half, h]], ['inspection', [half, 0, w - half, h]]]
    : [[state.view, [0, 0, w, h]]];
  views = rects.map(([kind, rect]) => ({ kind, rect, dpr, aspect: rect[2] / rect[3] }));
  mainAspect = (views.find((v) => v.kind === 'main') || { aspect: w / h }).aspect;
  // view labels
  const html = views.map((v) => `<span style="left:${v.rect[0] / dpr + 10}px">${v.kind === 'main' ? 'Main camera' : 'Inspection camera'}</span>`).join('');
  if (labels.innerHTML !== html) labels.innerHTML = html;
}

// ---------------------------------------------------------------- curve helpers
// Painting-local → world. The painting node's world matrix places the curve in the scene.
const curveToWorld = (uv, z) => M.transformPoint(N.painting.world, [...CurveModel.uvToLocal(uv), z]);

function editableIndices() {
  return curve.pts.map((_, i) => i).filter((i) => curve.mode === 'bezier' || curve.isKnot(i));
}

function project(VP, rect, p) {
  const c = M.transformVec4(VP, p);
  if (c[3] <= 1e-6) return null;
  return [rect[0] + (c[0] / c[3] * 0.5 + 0.5) * rect[2], rect[1] + (0.5 - c[1] / c[3] * 0.5) * rect[3]];
}

// Mouse position → point on the painting plane → normalised (u, v).
function pixelToUV(p, v) {
  const ndcX = ((p[0] - v.rect[0]) / v.rect[2]) * 2 - 1;
  const ndcY = 1 - ((p[1] - v.rect[1]) / v.rect[3]) * 2;
  const { o, d } = cam.ray(ndcX, ndcY, v.aspect);
  const zPlane = N.painting.world[14];
  if (Math.abs(d[2]) < 1e-9) return null;
  const s = (zPlane - o[2]) / d[2];
  if (s < 0) return null;
  const hit = [o[0] + s * d[0], o[1] + s * d[1]];
  return [(hit[0] - N.painting.world[12]) / PAINTING.width + 0.5, (hit[1] - N.painting.world[13]) / PAINTING.height + 0.5];
}

attachInput(canvas, {
  viewAt: (p) => views.find((v) => p[0] >= v.rect[0] && p[0] < v.rect[0] + v.rect[2] && p[1] >= v.rect[1] && p[1] < v.rect[1] + v.rect[3]) || null,
  pickPoint(p, v) {
    let best = -1, bestD = 14 * v.dpr;
    for (const i of editableIndices()) {
      const s = project(v.VP, v.rect, curveToWorld(curve.pts[i], 0.04));
      if (!s) continue;
      const d = Math.hypot(s[0] - p[0], s[1] - p[1]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  },
  dragPoint(i, p, v) {
    const uv = pixelToUV(p, v);
    if (uv) curve.move(i, uv.map((x) => Math.min(1.05, Math.max(-0.05, x))));
  },
  addPoint(p, v) {
    const uv = pixelToUV(p, v);
    if (uv && uv.every((x) => x >= 0 && x <= 1)) curve.addKnot(uv);
  },
  orbit(dx, dy) {
    cam.yaw -= dx * 0.008;
    cam.pitch = Math.min(Math.PI / 2, Math.max(-Math.PI / 2, cam.pitch + dy * 0.008));
  },
  zoom(f) { cam.dist = Math.min(40, Math.max(3, cam.dist * f)); },
});

// ---------------------------------------------------------------- per-frame geometry
function buildCommonBatch(AM) {
  const b = new Batch();
  if (state.showGrid) b.grid(12, 1, -0.3);

  // Part B: strings of the mobile and (debug) local axes of every node
  root.traverse((n) => {
    if (state.showStrings && n.string && n.parent) b.line(M.getTranslation(n.parent.world), M.getTranslation(n.world), COL.string);
    if (state.debugAxes) b.axes(n.world, n === root ? 1.5 : 0.6);
  });

  // Part A: wireframe "ghost" of the other composition order
  if (state.showGhost) b.wireCube(M.multiply(N.table.world, state.order === 'TRS' ? AM.SRT : AM.TRS), COL.ghost);

  // Part D: the curve as a ribbon on the painting
  const segs = curve.segments();
  b.ribbon(curve.sample(segs * 40).map((uv) => curveToWorld(uv, 0.02)), 0.05, COL.curve);
  const ux = [1, 0, 0], uy = [0, 1, 0];
  if (state.showPolygon) {
    const poly = curve.mode === 'bezier' ? curve.pts : curve.knots();
    b.polyline(poly.map((uv) => curveToWorld(uv, 0.03)), COL.polygon);
  }
  for (const i of editableIndices()) {
    const k = curve.isKnot(i);
    b.marker(curveToWorld(curve.pts[i], 0.04), k ? 0.15 : 0.1, k ? COL.knot : COL.handle, ux, uy, k);
  }
  if (curve.mode === 'bezier' && state.showCasteljau) {
    // drawn as thin ribbons (WebGPU lines are only 1 px wide)
    const { levels } = curve.casteljau(state.t);
    b.ribbon(levels[0].map((uv) => curveToWorld(uv, 0.045)), 0.018, [0.95, 0.95, 0.95]);
    for (let L = 1; L < levels.length; L++) {
      const pts = levels[L].map((uv) => curveToWorld(uv, 0.05 + L * 0.005));
      b.ribbon(pts, 0.022, COL.cast[L - 1]);
      for (const p of pts) b.marker(p, L === 3 ? 0.17 : 0.1, COL.cast[L - 1], ux, uy);
    }
  }
  return b;
}

function buildFrustumBatch() {
  const b = new Batch();
  const f = cam.frustumCorners(mainAspect);
  b.polyline(f.near, COL.frustum, true);
  b.polyline(f.far, COL.frustum, true);
  for (let i = 0; i < 4; i++) {
    b.line(f.near[i], f.far[i], COL.frustum);
    if (!cam.ortho) b.line(f.eye, f.near[i], COL.frustum);
  }
  b.axes(f.camToWorld, 1.0);                              // camera's u, v, w at the eye
  b.line(f.eye, cam.target, [0.6, 0.6, 0.6]);
  b.marker(cam.target, 0.15, [0.95, 0.95, 0.95], [1, 0, 0], [0, 1, 0], true);
  return b;
}

// ---------------------------------------------------------------- text panels
const v3 = (p, d = 2) => `(${p.map((x) => x.toFixed(d)).join(', ')})`;

function updateText(AM, ev, stats, timing) {
  const B = cam.basis();
  hud.textContent =
    `frame ${timing.interval.toFixed(2)} ms (${(1000 / timing.interval).toFixed(0)} fps)   CPU ${timing.cpu.toFixed(2)} ms\n` +
    `vertices/frame ${stats.vertices.toLocaleString()}   draw calls ${stats.drawCalls}\n` +
    `view ${state.view}   projection ${cam.ortho ? 'orthographic' : 'perspective'}\n` +
    `eye ${v3(cam.eye())}  target ${v3(cam.target)}\n` +
    `fov ${cam.fovDeg.toFixed(0)}°  near ${cam.near.toFixed(2)}  far ${cam.far.toFixed(1)}` +
    (B.degenerate ? '\nup ∥ view direction → fallback up used' : '');

  const act = (s, on) => (on ? `<span class="act">${s}</span>` : s);
  out.matrices.innerHTML =
    act(`M = T·R·S${state.order === 'TRS' ? '   ◀ active (red cube)' : '   (blue ghost)'}\n${M.format(AM.TRS)}`, state.order === 'TRS') + '\n' +
    act(`M = S·R·T${state.order === 'SRT' ? '   ◀ active (red cube)' : '   (blue ghost)'}\n${M.format(AM.SRT)}`, state.order === 'SRT');

  let tree = '';
  root.traverse((n, d) => { tree += `${'  '.repeat(d)}${d ? '└ ' : ''}${n.name.padEnd(12 - Math.min(10, 2 * d))} world pos ${v3(M.getTranslation(n.world), 2)}\n`; });
  out.tree.textContent = `depth-first traversal (${countNodes()} nodes)\n` + tree;

  const chain = N.cherry.path().slice(1).map((n) => n.local); // root's local is the identity
  const product = M.multiplyAll(...chain);
  const err = Math.max(...product.map((x, i) => Math.abs(x - N.cherry.world[i])));
  out.leaf.textContent =
    `world(cherry) = L_hook · L_bar1 · L_bar2 · L_cherry\n` +
    `  L_hook   = T(5.6, 6.4, 2.4)\n` +
    `  L_bar1   = T(0, −0.7, 0) · R_y(${state.theta1Deg.toFixed(0)}°)\n` +
    `  L_bar2   = T(1.5, −0.8, 0) · R_y(${state.theta2Deg.toFixed(0)}°)\n` +
    `  L_cherry = T(−0.8, −0.6, 0)\n\n` +
    M.format(N.cherry.world, 3) +
    `cherry in world: ${v3(M.getTranslation(N.cherry.world), 3)}\n` +
    `|chain product − traversal| = ${err.toExponential(1)}`;

  out.camera.textContent =
    `eye    ${v3(cam.eye())}\ntarget ${v3(cam.target)}\nup     ${v3(cam.up)}\n` +
    `u = up×w ${v3(B.u)}\nv = w×u  ${v3(B.v)}\nw        ${v3(B.w)}\n` +
    (B.degenerate ? 'up ∥ view direction → fallback up used\n' : '') +
    `\nV = lookAt(eye, target, up)\n${M.format(cam.view())}\n` +
    `P = ${cam.ortho ? 'orthographic' : 'perspective'}(aspect ${mainAspect.toFixed(2)})\n${M.format(cam.proj(mainAspect), 3)}`;

  const [u, v] = ev.point;
  out.curve.textContent =
    `${curve.mode === 'bezier' ? 'piecewise cubic Bézier' : 'Catmull–Rom spline'}, ${curve.segments()} segments\n` +
    `control points ${curve.pts.length} (knots ${curve.knots().length})\n` +
    `t = ${state.t.toFixed(3)} → segment ${ev.seg}, local t = ${ev.t.toFixed(3)}\n` +
    `C(t) = (${u.toFixed(3)}, ${v.toFixed(3)}) normalised\n` +
    `C'(t) = (${ev.tangent[0].toFixed(3)}, ${ev.tangent[1].toFixed(3)})\n` +
    `max C¹ error at joints = ${curve.c1Error().toExponential(1)}\n\n` +
    `C¹ at knot K:  P_after = 2K − P_before`;
}

let nodeCount = 0;
function countNodes() { if (!nodeCount) root.traverse(() => nodeCount++); return nodeCount; }

// ---------------------------------------------------------------- frame loop
let renderer = null;
let last = performance.now(), textAt = 0;
const timing = { interval: 16.7, cpu: 1 };
let stats = { vertices: 0, drawCalls: 0 };

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  timing.interval += ((now - last) - timing.interval) * 0.1;   // smoothed
  last = now;
  const t0 = performance.now();

  resize();
  if (state.animate) {
    const wrap = (a) => ((a + 180) % 360 + 360) % 360 - 180;
    state.theta1Deg = wrap(state.theta1Deg + dt * 35);
    state.theta2Deg = wrap(state.theta2Deg - dt * 70);
  }
  if (state.curveAnim) state.t = (state.t + dt * 0.05) % 1;

  // update local transforms, then one traversal computes every world matrix
  const AM = objectAMatrices({ ...state.A, angle: state.A.angleDeg * DEG });
  N.objectA.local = state.order === 'TRS' ? AM.TRS : AM.SRT;
  const ml = mobileLocals(state.theta1Deg * DEG, state.theta2Deg * DEG);
  N.bar1.local = ml.bar1;
  N.bar2.local = ml.bar2;
  const ev = curve.evaluate(state.t);
  const [lx, ly] = CurveModel.uvToLocal(ev.point);
  // tangent in painting units → angle in the painting plane; the seed points along it
  const angle = Math.atan2(ev.tangent[1] * PAINTING.height, ev.tangent[0] * PAINTING.width);
  N.rider.local = M.multiply(M.translate(lx, ly, 0.14), M.rotateZ(angle));
  root.updateWorld();

  const draws = [];
  root.traverse((n) => { if (n.mesh && n.visible) draws.push({ mesh: n.mesh, model: M.multiply(n.world, n.meshMatrix), color: n.color }); });
  const common = buildCommonBatch(AM);
  const frustum = state.showFrustum ? buildFrustumBatch() : null;

  const rviews = views.map((v) => {
    const c = v.kind === 'main' ? cam : insp;
    v.VP = M.multiply(c.proj(v.aspect), c.view());
    const extra = v.kind === 'inspection' && frustum;
    return {
      viewport: v.rect, VP: v.VP, draws,
      lines: extra ? common.lines.concat(frustum.lines) : common.lines,
      tris: extra ? common.tris.concat(frustum.tris) : common.tris,
    };
  });
  stats = renderer.render(rviews);
  timing.cpu += (performance.now() - t0 - timing.cpu) * 0.1;

  if (now - textAt > 100) { textAt = now; updateText(AM, ev, stats, timing); }
  panel.sync();
  requestAnimationFrame(frame);
}

async function start() {
  try {
    renderer = await Renderer.create(canvas, `${import.meta.env.BASE_URL}kavunlu.jpg`);
  } catch (e) {
    const box = document.getElementById('error');
    box.hidden = false;
    box.textContent = `Could not start WebGPU: ${e.message} Use a current Chrome, Edge, Safari or Firefox with WebGPU enabled.`;
    console.error(e);
    return;
  }
  resize();
  requestAnimationFrame(frame);
}

// handy for debugging from the console
window.app = { state, cam, insp, curve, root, M, capture: () => renderer.capture(), get renderer() { return renderer; } };
start();
