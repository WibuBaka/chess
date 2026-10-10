// draw.js — trình vẽ quân cờ vector cho Custom Studio.
// Bản vẽ: { base, items[] } (xem pieces.js). Màu 'side'/'edge' tự đổi theo phe Trắng/Đen khi hiển thị.
import { itemSvg, pieceSvg, STD, STD_NAMES } from './pieces.js';

const PALETTE = ['side', 'edge', '#ffffff', '#14161a', '#e63946', '#f4a261', '#ffd166', '#2ec4b6', '#1d7fd1', '#7b2cbf', '#ff70a6', '#8d5524', '#8a8f98', 'none'];
const TOOLS = [['pen', 'Bút', 'M4 20l4-1 11-11-3-3L5 16z'], ['line', 'Đường thẳng', 'M5 19L19 5'], ['rect', 'Hình chữ nhật', 'M5 7h14v10H5z'], ['ell', 'Hình elip', 'M12 6a7 5 0 1 0 .01 0z'], ['blob', 'Vùng tô tự do', 'M6 15c-2-4 2-9 7-8s6 6 3 9-8 3-10-1z'], ['erase', 'Tẩy nét', 'M7 19l-3-3 9-9 6 6-6 6zM13 19h7']];

const sd = (p, a, b) => { // khoảng cách từ điểm p đến đoạn ab
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
const polyDist = (p, pts, closed) => { let m = Infinity; for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) m = Math.min(m, sd(p, pts[i], pts[(i + 1) % pts.length])); if (pts.length === 1) m = Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]); return m; };
const inPoly = (p, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { if ((pts[i][1] > p[1]) !== (pts[j][1] > p[1]) && p[0] < (pts[j][0] - pts[i][0]) * (p[1] - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]) c = !c; } return c; };
export function hitItem(it, p) {
  const tol = (it.sw ?? 3) / 2 + 2.5, filled = it.fill && it.fill !== 'none';
  switch (it.t) {
    case 'path': return polyDist(p, it.pts, false) <= tol;
    case 'line': return sd(p, [it.x1, it.y1], [it.x2, it.y2]) <= tol;
    case 'blob': return (filled && inPoly(p, it.pts)) || polyDist(p, it.pts, true) <= tol;
    case 'rect': { const inside = p[0] >= it.x && p[0] <= it.x + it.w && p[1] >= it.y && p[1] <= it.y + it.h; if (filled && inside) return true; return polyDist(p, [[it.x, it.y], [it.x + it.w, it.y], [it.x + it.w, it.y + it.h], [it.x, it.y + it.h]], true) <= tol; }
    case 'ell': { const k = ((p[0] - it.cx) / (it.rx || 1)) ** 2 + ((p[1] - it.cy) / (it.ry || 1)) ** 2; if (filled && k <= 1) return true; return Math.abs(Math.sqrt(k) - 1) * Math.min(it.rx, it.ry) <= tol; }
    default: return false;
  }
}
function simplify(pts, eps) { // Douglas–Peucker
  if (pts.length < 3) return pts;
  let idx = 0, md = 0; for (let i = 1; i < pts.length - 1; i++) { const d = sd(pts[i], pts[0], pts[pts.length - 1]); if (d > md) { md = d; idx = i; } }
  if (md <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}
export function mirrorItem(it) {
  const m = JSON.parse(JSON.stringify(it)), f = (x) => Math.round((100 - x) * 10) / 10;
  if (m.pts) m.pts = m.pts.map(([x, y]) => [f(x), y]);
  if (m.t === 'line') { m.x1 = f(m.x1); m.x2 = f(m.x2); }
  if (m.t === 'rect') m.x = f(m.x + m.w);
  if (m.t === 'ell') m.cx = f(m.cx);
  return m;
}

export class DrawEditor {
  constructor(host, api) {
    this.host = host; this.api = api; this.art = { base: null, items: [] };
    Object.assign(this, { tool: 'pen', stroke: 'edge', fill: 'side', target: 'stroke', sw: 4, mirror: true, side: 'w', bg: 'l', undo: [], redo: [], cur: null });
    this._build();
  }

  setArt(art) { this.art = art; this.undo = []; this.redo = []; this.cur = null; this._syncUi(); this.paint(); }

  _build() {
    const h = this.host; h.textContent = ''; h.classList.add('draw');
    h.innerHTML = `
      <div class="drawTools" role="toolbar" aria-label="Công cụ vẽ">${TOOLS.map(([id, name, d]) => `<button type="button" data-tool="${id}" title="${name}" aria-label="${name}"><svg viewBox="0 0 24 24"><path d="${d}"/></svg></button>`).join('')}
        <span class="sp"></span><button type="button" data-act="undo" title="Hoàn tác (Ctrl+Z)">↶</button><button type="button" data-act="redo" title="Làm lại">↷</button><button type="button" data-act="clear" title="Xóa toàn bộ nét vẽ">🗑</button></div>
      <svg class="drawCanvas" viewBox="0 0 100 100" tabindex="0" aria-label="Khung vẽ quân cờ"></svg>
      <div class="drawOpts">
        <div class="row"><button type="button" class="chipBtn" data-target="stroke">Viền <i class="sw" data-sw="stroke"></i></button><button type="button" class="chipBtn" data-target="fill">Tô <i class="sw" data-sw="fill"></i></button>
          <label class="inl">Nét <input type="range" min="1" max="12" step="0.5" data-k="sw"></label></div>
        <div class="palette" role="group" aria-label="Bảng màu"></div>
        <div class="row">
          <label class="chk"><input type="checkbox" data-k="mirror"> Đối xứng trái–phải</label>
          <span class="seg" data-seg="side"><button type="button" data-v="w">Xem: Trắng</button><button type="button" data-v="b">Đen</button></span>
          <span class="seg" data-seg="bg"><button type="button" data-v="l">Nền sáng</button><button type="button" data-v="d">tối</button></span>
        </div>
        <label class="inl">Hình nền có sẵn <select data-k="base"><option value="">Trống (tự vẽ hoàn toàn)</option>${STD.map((t) => `<option value="${t}">${STD_NAMES[t]}</option>`).join('')}</select></label>
      </div>`;
    this.svg = h.querySelector('.drawCanvas');
    const pal = h.querySelector('.palette');
    for (const c of PALETTE) { const b = document.createElement('button'); b.type = 'button'; b.dataset.c = c; b.title = c === 'side' ? 'Màu phe (trắng/đen)' : c === 'edge' ? 'Viền phe' : c === 'none' ? 'Không tô' : c; b.className = 'cs ' + (['side', 'edge', 'none'].includes(c) ? 'k-' + c : ''); if (!['side', 'edge', 'none'].includes(c)) b.style.background = c; pal.append(b); }
    const pick = document.createElement('input'); pick.type = 'color'; pick.className = 'cpick'; pick.title = 'Chọn màu khác'; pick.value = '#e63946'; pick.setAttribute('aria-label', 'Chọn màu khác'); pal.append(pick);
    pick.oninput = () => this._setColor(pick.value);
    h.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !h.contains(b)) return;
      if (b.dataset.tool) { this.tool = b.dataset.tool; this._syncUi(); }
      else if (b.dataset.c) this._setColor(b.dataset.c);
      else if (b.dataset.target) { this.target = b.dataset.target; this._syncUi(); }
      else if (b.dataset.act) this[b.dataset.act + 'Act']();
      else if (b.dataset.v) { this[b.closest('[data-seg]').dataset.seg] = b.dataset.v; this._syncUi(); this.paint(); }
    });
    h.querySelector('[data-k=sw]').oninput = (e) => { this.sw = +e.target.value; };
    h.querySelector('[data-k=mirror]').onchange = (e) => { this.mirror = e.target.checked; this.paint(); };
    h.querySelector('[data-k=base]').onchange = (e) => { this._snap(); this.art.base = e.target.value || null; this._changed(); };
    const s = this.svg;
    s.addEventListener('pointerdown', (e) => this._down(e)); s.addEventListener('pointermove', (e) => this._move(e));
    s.addEventListener('pointerup', (e) => this._up(e)); s.addEventListener('pointercancel', () => { this.cur = null; this.erasing = false; this.paint(); });
    s.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redoAct() : this.undoAct(); } });
    this._syncUi();
  }
  _syncUi() {
    const h = this.host;
    for (const b of h.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === this.tool);
    for (const b of h.querySelectorAll('[data-target]')) b.classList.toggle('on', b.dataset.target === this.target);
    for (const k of ['stroke', 'fill']) { const i = h.querySelector(`[data-sw=${k}]`); i.className = 'sw ' + (['side', 'edge', 'none'].includes(this[k]) ? 'k-' + this[k] : ''); i.style.background = ['side', 'edge', 'none'].includes(this[k]) ? '' : this[k]; }
    for (const g of h.querySelectorAll('[data-seg]')) for (const b of g.querySelectorAll('button')) b.classList.toggle('on', this[g.dataset.seg] === b.dataset.v);
    h.querySelector('[data-k=sw]').value = this.sw; h.querySelector('[data-k=mirror]').checked = this.mirror; h.querySelector('[data-k=base]').value = this.art.base || '';
    this.svg.style.cursor = this.tool === 'erase' ? 'cell' : 'crosshair';
  }
  _setColor(c) { this[this.target] = c; this._syncUi(); }
  // các nút gọi qua data-act
  undoAct() { if (!this.undo.length) return; this.redo.push(JSON.stringify(this.art)); this._restore(this.undo.pop()); }
  redoAct() { if (!this.redo.length) return; this.undo.push(JSON.stringify(this.art)); this._restore(this.redo.pop()); }
  clearAct() { if (!this.art.items.length) return; this._snap(); this.art.items = []; this._changed(); }
  _restore(js) { const a = JSON.parse(js); this.art.base = a.base; this.art.items = a.items; this._changed(); }
  _snap() { this.undo.push(JSON.stringify(this.art)); if (this.undo.length > 60) this.undo.shift(); this.redo = []; }
  _changed() { this._syncUi(); this.paint(); this.api.onChange?.(); }

  _pt(e) { const r = this.svg.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width * 100) * 10) / 10, Math.round(((e.clientY - r.top) / r.height * 100) * 10) / 10]; }
  _down(e) {
    if (e.button !== 0) return; e.preventDefault(); this.svg.focus({ preventScroll: true }); this.svg.setPointerCapture?.(e.pointerId);
    const p = this._pt(e);
    if (this.tool === 'erase') { this.erasing = true; this._snap(); this._erase(p); return; }
    this.cur = { tool: this.tool, pts: [p], a: p, b: p };
  }
  _move(e) {
    const p = this._pt(e);
    if (this.erasing) return this._erase(p);
    const c = this.cur; if (!c) return; c.b = p;
    if (c.tool === 'pen' || c.tool === 'blob') { const l = c.pts[c.pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) >= 1.2) c.pts.push(p); }
    this.paint();
  }
  _up(e) {
    if (this.erasing) { this.erasing = false; if (this._erased) { this._erased = false; this._changed(); } else this.undo.pop(); return; }
    const c = this.cur; this.cur = null; if (!c) return;
    c.b = this._pt(e); const it = this._make(c);
    if (it) { this._snap(); const g = 1 + Math.max(0, ...this.art.items.map((x) => x.g || 0)); it.g = g; this.art.items.push(it); if (this.mirror) { const m = mirrorItem(it); this.art.items.push(m); } this._changed(); } else this.paint();
  }
  _make(c) {
    const st = this.stroke, fl = this.fill, sw = this.sw, [a, b] = [c.a, c.b], w = Math.abs(b[0] - a[0]), h = Math.abs(b[1] - a[1]);
    switch (c.tool) {
      case 'pen': { const pts = simplify(c.pts, .45); return { t: 'path', pts, stroke: st, sw }; }
      case 'blob': return c.pts.length >= 3 ? { t: 'blob', pts: simplify(c.pts, .45), fill: fl, stroke: st, sw } : null;
      case 'line': return w + h < 1.5 ? null : { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: st, sw };
      case 'rect': return w < 1.5 || h < 1.5 ? null : { t: 'rect', x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w, h, r: 0, fill: fl, stroke: st, sw };
      case 'ell': return w < 1.5 || h < 1.5 ? null : { t: 'ell', cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, rx: w / 2, ry: h / 2, fill: fl, stroke: st, sw };
      default: return null;
    }
  }
  _erase(p) {
    const items = this.art.items;
    for (let i = items.length - 1; i >= 0; i--) if (hitItem(items[i], p)) { const g = items[i].g; this.art.items = g ? items.filter((x) => x.g !== g) : items.filter((_, j) => j !== i); this._erased = true; this.paint(); return; }
  }

  paint() {
    const { light, dark } = this.api.colors?.() || { light: '#ebecd0', dark: '#739552' }, bg = this.bg === 'l' ? light : dark, side = this.side;
    let o = `<rect width="100" height="100" fill="${bg}"/>`;
    for (let i = 1; i < 10; i++) o += `<path d="M${i * 10} 0V100M0 ${i * 10}H100" stroke="rgba(0,0,0,.09)" stroke-width=".3"/>`;
    o += `<path d="M50 0V100" stroke="rgba(0,0,0,${this.mirror ? .28 : .1})" stroke-width=".5" stroke-dasharray="2 2"/>`;
    if (this.art.base) o += pieceSvg(this.art.base, side, this.api.set?.() || 'neo').replace(/^<svg[^>]*>/, '<g>').replace(/<\/svg>$/, '</g>');
    for (const it of this.art.items) o += itemSvg(it, side);
    const c = this.cur;
    if (c) {
      const prev = this._make(c) || (c.tool === 'pen' || c.tool === 'blob' ? { t: 'path', pts: c.pts, stroke: this.stroke, sw: this.sw } : null);
      if (prev) { o += `<g opacity=".75">${itemSvg(prev, side)}${this.mirror ? itemSvg(mirrorItem(prev), side) : ''}</g>`; }
    }
    this.svg.innerHTML = o;
  }
}
