// Tiny DOM helpers for the control panel (no UI library).
// Every control reads its value through get() so the panel can be re-synced
// from the state each frame (needed after "Reset" and for animated values).

export function el(tag, attrs = {}, parent = null) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  if (parent) parent.appendChild(e);
  return e;
}

export class Panel {
  constructor(root) { this.root = root; this.syncers = []; }

  section(title, open = true) {
    const d = el('details', open ? { open: '' } : {}, this.root);
    el('summary', { text: title }, d);
    return d;
  }

  slider(parent, label, { min, max, step, get, set, fmt = (v) => v.toFixed(2) }) {
    const row = el('label', { class: 'slider' }, parent);
    el('span', { text: label }, row);
    const input = el('input', { type: 'range', min, max, step }, row);
    const val = el('span', { class: 'val' }, row);
    input.value = get();
    val.textContent = fmt(get());
    input.addEventListener('input', () => { set(parseFloat(input.value)); val.textContent = fmt(get()); });
    this.syncers.push(() => {
      const v = get();
      if (document.activeElement !== input && Math.abs(parseFloat(input.value) - v) > 1e-9) input.value = v;
      const t = fmt(v); if (val.textContent !== t) val.textContent = t;
    });
    return input;
  }

  toggle(parent, label, { get, set }) {
    const b = el('button', { text: label }, parent);
    b.addEventListener('click', () => set(!get()));
    this.syncers.push(() => b.classList.toggle('on', !!get()));
    return b;
  }

  // Segmented choice: options = [[value, label], ...]
  choice(parent, options, { get, set }) {
    const wrap = el('span', { class: 'seg' }, parent);
    const bs = options.map(([value, label]) => {
      const b = el('button', { text: label }, wrap);
      b.addEventListener('click', () => set(value));
      return [value, b];
    });
    this.syncers.push(() => bs.forEach(([v, b]) => b.classList.toggle('on', get() === v)));
    return wrap;
  }

  button(parent, label, onClick) {
    const b = el('button', { text: label }, parent);
    b.addEventListener('click', onClick);
    return b;
  }

  row(parent) { return el('div', { class: 'row' }, parent); }
  pre(parent) { return el('pre', { class: 'mat' }, parent); }
  hint(parent, html) { return el('p', { class: 'hint', html }, parent); }

  sync() { for (const s of this.syncers) s(); }
}
