// Mouse input on the canvas. Positions are converted to canvas pixels (device
// pixels), the same units as the viewports.
//   drag on a curve point  → move it (in the plane of the painting)
//   drag elsewhere         → orbit the main camera
//   wheel                  → zoom (distance)
//   double-click painting  → add a curve point at the end

export function attachInput(canvas, h) {
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
  };
  let mode = null, last = null, pick = -1, view = null;

  canvas.addEventListener('pointerdown', (e) => {
    const p = pos(e);
    view = h.viewAt(p);
    if (!view || view.kind !== 'main') return;       // the inspection camera is fixed
    canvas.setPointerCapture(e.pointerId);
    pick = h.pickPoint(p, view);
    mode = pick >= 0 ? 'point' : 'orbit';
    last = p;
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!mode) return;
    const p = pos(e);
    if (mode === 'point') h.dragPoint(pick, p, view);
    else h.orbit((p[0] - last[0]) / view.dpr, (p[1] - last[1]) / view.dpr);
    last = p;
  });

  const end = () => { mode = null; pick = -1; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', (e) => {
    const v = h.viewAt(pos(e));
    if (!v || v.kind !== 'main') return;
    e.preventDefault();
    h.zoom(Math.exp(e.deltaY * 0.001));
  }, { passive: false });

  canvas.addEventListener('dblclick', (e) => {
    const p = pos(e), v = h.viewAt(p);
    if (v && v.kind === 'main') h.addPoint(p, v);
  });
}
