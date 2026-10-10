// board.js — bàn cờ dùng chung cho cờ vua chuẩn và Custom Studio (kích thước W×H bất kỳ).
// Toạ độ logic: x = cột từ trái (0..W-1), y = hàng từ phía Trắng (0..H-1). a1 = (0,0).
// Quân đặt tuyệt đối bằng transform nên có thể trượt mượt khi đi; hỗ trợ kéo thả bằng pointer events,
// chuột phải để đánh dấu ô / vẽ mũi tên như chess.com.

export const fileName = (x) => (x < 26 ? String.fromCharCode(97 + x) : String(x));
export const sqName = (x, y) => fileName(x) + (y + 1);

export class BoardView {
  constructor(root) {
    this.root = root; this.w = 8; this.h = 8; this.flip = false; this.voids = new Set();
    this.pieces = new Map(); // "x,y" -> {el, html}
    this.sqEls = []; this.handlers = {}; this.drag = null; this.arrows = []; this.hl = new Set(); this.marks = {};
    this.root.classList.add('board');
    this.sqLayer = el('div', 'sqs'); this.pcLayer = el('div', 'pcs'); this.arrowSvg = svg('svg', { class: 'arrows', viewBox: '0 0 8 8' });
    this.root.append(this.sqLayer, this.pcLayer, this.arrowSvg);
    this.root.addEventListener('pointerdown', (e) => this._down(e));
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this._move = (e) => this._moveDrag(e); this._up = (e) => this._upDrag(e);
  }

  // h: {press(x,y)->bool(có thể kéo), drop(fx,fy,tx,ty)->bool(đã đi)}
  on(h) { this.handlers = h; return this; }

  configure({ w, h, voids = [], flip = this.flip } = {}) {
    this.w = w; this.h = h; this.flip = flip; this.voids = new Set(voids);
    for (const t of [this.root, this.root.closest('.boardCol')]) { t?.style.setProperty('--W', w); t?.style.setProperty('--H', h); }
    this.arrowSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this._buildSquares(); this.clearPieces(); this.clearUserMarks();
  }

  setFlip(flip) {
    if (flip === this.flip) return; this.flip = flip;
    this.root.classList.add('noanim'); this._buildSquares();
    for (const [k, p] of this.pieces) this._place(p.el, ...k.split(',').map(Number));
    this._applyMarks(); this._drawArrows();
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('noanim')));
  }

  _col(x) { return this.flip ? this.w - 1 - x : x; }
  _row(y) { return this.flip ? y : this.h - 1 - y; }

  _buildSquares() {
    const { w, h } = this; this.sqLayer.textContent = ''; this.sqEls = new Array(w * h);
    this.sqLayer.style.gridTemplateColumns = `repeat(${w},1fr)`; this.sqLayer.style.gridTemplateRows = `repeat(${h},1fr)`;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const x = this.flip ? w - 1 - c : c, y = this.flip ? r : h - 1 - r;
      const d = el('div', 'sq ' + ((x + y) % 2 === 0 ? 'd' : 'l') + (this.voids.has(y * w + x) ? ' void' : ''));
      d.dataset.x = x; d.dataset.y = y; d.dataset.sq = sqName(x, y);
      if (c === 0) d.insertAdjacentHTML('beforeend', `<span class="co r">${y + 1}</span>`);
      if (r === h - 1) d.insertAdjacentHTML('beforeend', `<span class="co f">${fileName(x)}</span>`);
      this.sqEls[y * w + x] = d; this.sqLayer.append(d);
    }
  }

  _place(el, x, y) { el.style.transform = `translate(${this._col(x) * 100}%,${this._row(y) * 100}%)`; }

  clearPieces() { this.pcLayer.textContent = ''; this.pieces.clear(); }

  // list: [{x,y,html,cls}]; moves: [{from:[x,y],to:[x,y]}] để trượt quân thay vì tạo mới
  setPieces(list, moves = [], { instant = false } = {}) {
    const { w, h } = this, key = (x, y) => x + ',' + y;
    if (instant) this.root.classList.add('noanim');
    for (const m of moves) {
      const a = key(...m.from), b = key(...m.to), pa = this.pieces.get(a);
      if (!pa) continue;
      const pb = this.pieces.get(b); if (pb && pb !== pa) this._fadeOut(pb.el);
      this.pieces.delete(a); this.pieces.set(b, pa); this._place(pa.el, ...m.to);
    }
    const seen = new Set();
    for (const it of list) {
      const k = key(it.x, it.y); seen.add(k); let p = this.pieces.get(k);
      const sig = it.html + '|' + (it.cls || '');
      if (!p) {
        const e = el('div', 'pc ' + (it.cls || '')); e.style.width = 100 / w + '%'; e.style.height = 100 / h + '%'; e.innerHTML = it.html;
        this._place(e, it.x, it.y); this.pcLayer.append(e); p = { el: e, sig }; this.pieces.set(k, p);
      } else {
        if (p.sig !== sig) { p.el.className = 'pc ' + (it.cls || ''); p.el.innerHTML = it.html; p.sig = sig; }
        if (!p.el.classList.contains('dragging')) this._place(p.el, it.x, it.y);
      }
      p.el.dataset.sq = sqName(it.x, it.y); p.el.classList.toggle('canmove', !!it.canMove);
    }
    for (const [k, p] of [...this.pieces]) if (!seen.has(k)) { this.pieces.delete(k); this._fadeOut(p.el); }
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('noanim')));
  }

  _fadeOut(e) { e.classList.add('gone'); setTimeout(() => e.remove(), 220); }

  // marks: {sel:[x,y]|null, targets:[{x,y,cap}], last:[[x,y],..], check:[x,y]|null}
  setMarks(m = {}) { this.marks = m; this._applyMarks(); }
  _applyMarks() {
    const m = this.marks, t = new Map((m.targets || []).map((q) => [q.y * this.w + q.x, q]));
    const last = new Set((m.last || []).map(([x, y]) => y * this.w + x));
    for (let i = 0; i < this.sqEls.length; i++) {
      const d = this.sqEls[i], x = i % this.w, y = (i / this.w) | 0, q = t.get(i);
      d.classList.toggle('sel', !!m.sel && m.sel[0] === x && m.sel[1] === y);
      d.classList.toggle('mv', !!q); d.classList.toggle('cap', !!q?.cap);
      d.classList.toggle('last', last.has(i));
      d.classList.toggle('chk', !!m.check && m.check[0] === x && m.check[1] === y);
      d.classList.toggle('hl', this.hl.has(i));
    }
  }

  clearUserMarks() { this.hl.clear(); this.arrows = []; this._applyMarks(); this._drawArrows(); }

  _drawArrows() {
    this.arrowSvg.textContent = '';
    const c = (x, y) => [this._col(x) + .5, this._row(y) + .5];
    for (const [a, b] of this.arrows) {
      const [x1, y1] = c(a % this.w, (a / this.w) | 0), [x2, y2] = c(b % this.w, (b / this.w) | 0);
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, hd = .34, sw = .17;
      const bx = x2 - ux * hd * .9, by = y2 - uy * hd * .9, sx = x1 + ux * .22, sy = y1 + uy * .22;
      const nx = -uy, ny = ux;
      this.arrowSvg.append(svg('path', { d: `M${sx - nx * sw / 2} ${sy - ny * sw / 2}L${bx - nx * sw / 2} ${by - ny * sw / 2}L${bx - nx * hd * .75} ${by - ny * hd * .75}L${x2} ${y2}L${bx + nx * hd * .75} ${by + ny * hd * .75}L${bx + nx * sw / 2} ${by + ny * sw / 2}L${sx + nx * sw / 2} ${sy + ny * sw / 2}Z`, fill: 'rgba(255,170,0,.82)' }));
    }
  }

  _cell(e) {
    const r = this.sqLayer.getBoundingClientRect();
    const c = Math.floor((e.clientX - r.left) / r.width * this.w), rw = Math.floor((e.clientY - r.top) / r.height * this.h);
    if (c < 0 || rw < 0 || c >= this.w || rw >= this.h) return null;
    return { x: this.flip ? this.w - 1 - c : c, y: this.flip ? rw : this.h - 1 - rw };
  }

  _down(e) {
    const cell = this._cell(e); if (!cell) return;
    if (e.button === 2) { this.rstart = cell; this.root.setPointerCapture?.(e.pointerId); this._rup = (ev) => this._rightUp(ev); window.addEventListener('pointerup', this._rup, { once: true }); return; }
    if (e.button !== 0) return;
    if (this.hl.size || this.arrows.length) this.clearUserMarks();
    const canDrag = this.handlers.press?.(cell.x, cell.y);
    if (!canDrag && this.handlers.paint) { // rê chuột để tô nhiều ô (Custom Studio)
      let last = cell.x + ',' + cell.y; e.preventDefault();
      const mv = (ev) => { const c = this._cell(ev); if (!c) return; const k = c.x + ',' + c.y; if (k !== last) { last = k; this.handlers.press(c.x, c.y); } };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); return;
    }
    if (!canDrag) return;
    const p = this.pieces.get(cell.x + ',' + cell.y); if (!p) return;
    e.preventDefault();
    this.drag = { from: cell, el: p.el, sx: e.clientX, sy: e.clientY, active: false, id: e.pointerId };
    window.addEventListener('pointermove', this._move); window.addEventListener('pointerup', this._up, { once: true });
    window.addEventListener('pointercancel', this._up, { once: true });
  }

  _moveDrag(e) {
    const d = this.drag; if (!d) return;
    if (!d.active) { if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return; d.active = true; d.el.classList.add('dragging'); this.root.classList.add('isdrag'); }
    const r = this.sqLayer.getBoundingClientRect(), cw = r.width / this.w, ch = r.height / this.h;
    d.el.style.transform = `translate(${e.clientX - r.left - cw / 2}px,${e.clientY - r.top - ch / 2}px)`;
    const c = this._cell(e);
    for (const s of this.sqEls) s?.classList.remove('over');
    if (c) this.sqEls[c.y * this.w + c.x]?.classList.add('over');
  }

  _upDrag(e) {
    window.removeEventListener('pointermove', this._move);
    const d = this.drag; this.drag = null; if (!d) return;
    for (const s of this.sqEls) s?.classList.remove('over');
    this.root.classList.remove('isdrag'); d.el.classList.remove('dragging');
    if (!d.active) return;
    const to = e.type === 'pointercancel' ? null : this._cell(e);
    let moved = false;
    if (to && (to.x !== d.from.x || to.y !== d.from.y)) {
      this.root.classList.add('noanim'); // đã thả đúng ô: không trượt thêm
      moved = !!this.handlers.drop?.(d.from.x, d.from.y, to.x, to.y);
      requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.remove('noanim')));
    }
    if (!moved) this._place(d.el, d.from.x, d.from.y); // trả về chỗ cũ
  }

  _rightUp(e) {
    const a = this.rstart; this.rstart = null; const b = this._cell(e); if (!a || !b) return;
    const ia = a.y * this.w + a.x, ib = b.y * this.w + b.x;
    if (ia === ib) { this.hl.has(ia) ? this.hl.delete(ia) : this.hl.add(ia); this._applyMarks(); return; }
    const i = this.arrows.findIndex(([p, q]) => p === ia && q === ib);
    if (i >= 0) this.arrows.splice(i, 1); else this.arrows.push([ia, ib]);
    this._drawArrows();
  }

  // Gỡ gán sự kiện toàn cục (khi huỷ bàn)
  destroy() { window.removeEventListener('pointermove', this._move); }
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function svg(tag, attrs) { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
