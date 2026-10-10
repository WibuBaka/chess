// moves.js — trình chỉnh cách di chuyển của quân (bàn xem trước 13×13, quân ở giữa, Trắng tiến lên phía trên).
const N = 13, C0 = 6;
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
const kindOf = (r) => (r.max === 1 ? 'leap' : 'ride');
const keyOf = (r) => `${r.dx},${r.dy},${kindOf(r)}`;
const MODE_TXT = { a: 'đi & ăn', m: 'chỉ đi', c: 'chỉ ăn' };
const ARROW = (dx, dy) => { const a = Math.atan2(dy, dx), i = Math.round(a / (Math.PI / 4)); return '→↗↑↖←↙↓↘'[((i % 8) + 8) % 8]; };

export function symVectors(dx, dy, sym) {
  const out = new Map(), add = (x, y) => out.set(x + ',' + y, [x, y]);
  add(dx, dy);
  if (sym === 'lr' || sym === 'quad' || sym === 'all8') add(-dx, dy);
  if (sym === 'quad' || sym === 'all8') { add(dx, -dy); add(-dx, -dy); }
  if (sym === 'all8') { add(dy, dx); add(-dy, dx); add(dy, -dx); add(-dy, -dx); }
  return [...out.values()];
}

// Các ô mà một luật chạm tới trên bàn trống (để vẽ xem trước)
export function reach(rule) {
  const out = []; const lim = rule.max === 0 ? 99 : rule.max;
  for (let k = 1; k <= lim; k++) { const x = rule.dx * k, y = rule.dy * k; if (Math.abs(x) > C0 || Math.abs(y) > C0) break; out.push([x, y]); }
  return out;
}

export const QUICK = {
  rook: { name: 'Xe', rules: () => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ dx, dy, max: 0, mode: 'a' })) },
  bishop: { name: 'Tượng', rules: () => [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([dx, dy]) => ({ dx, dy, max: 0, mode: 'a' })) },
  knight: { name: 'Mã', rules: () => [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]].map(([dx, dy]) => ({ dx, dy, max: 1, mode: 'a' })) },
  king: { name: 'Vua', rules: () => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(([dx, dy]) => ({ dx, dy, max: 1, mode: 'a' })) },
  pawn: { name: 'Tốt', rules: () => [{ dx: 0, dy: 1, max: 1, mode: 'm' }, { dx: 0, dy: 1, max: 2, mode: 'm', first: true }, { dx: 1, dy: 1, max: 1, mode: 'c' }, { dx: -1, dy: 1, max: 1, mode: 'c' }] },
};

export class MoveEditor {
  constructor(host, api) {
    this.host = host; this.api = api;
    Object.assign(this, { kind: 'leap', maxN: 3, mode: 'a', jump: false, first: false, sym: 'all8', erase: false });
    this._build();
  }

  _build() {
    const h = this.host; h.classList.add('mv');
    h.innerHTML = `
      <div class="mvCtl">
        <div class="seg" data-seg="kind" role="group" aria-label="Kiểu bước"><button type="button" data-v="leap" title="Đến đúng ô được bấm">Nhảy 1 bước</button><button type="button" data-v="ride" title="Đi liên tục theo hướng đó như Xe/Tượng">Trượt</button><button type="button" data-v="ridemax" title="Trượt nhưng tối đa N ô">Trượt ≤ N</button><button type="button" data-v="erase" title="Bấm vào ô để xóa luật chạm tới ô đó">Tẩy</button></div>
        <label class="inl" data-for="ridemax">N = <input type="number" min="2" max="12" value="3" data-k="maxN"></label>
        <div class="seg" data-seg="mode" role="group" aria-label="Chế độ"><button type="button" data-v="a">Đi &amp; ăn</button><button type="button" data-v="m">Chỉ đi</button><button type="button" data-v="c">Chỉ ăn</button><button type="button" data-v="hop" title="Kiểu Pháo: ăn quân đứng ngay sau đúng một quân chắn">Ăn qua 1 quân</button></div>
        <div class="row"><label class="chk"><input type="checkbox" data-k="jump"> Bay qua quân cản</label><label class="chk"><input type="checkbox" data-k="first"> Chỉ ở nước đi đầu tiên</label></div>
        <label class="inl">Đối xứng <select data-k="sym"><option value="all8">Đủ 8 hướng (như Mã/Xe/Hậu)</option><option value="quad">4 góc (±x, ±y)</option><option value="lr">Trái ↔ phải</option><option value="none">Không (một ô)</option></select></label>
      </div>
      <div class="mvGridWrap"><div class="mvGrid" role="grid" aria-label="Bàn xem trước cách đi"></div><div class="mvDir">↑ hướng tiến của Trắng</div></div>
      <div class="mvLegend"><span><i class="d a"></i>đi &amp; ăn</span><span><i class="d m"></i>chỉ đi</span><span><i class="d c"></i>chỉ ăn</span><span><i class="d hop"></i>ăn qua quân</span><span><i class="d first"></i>nước đầu</span></div>
      <div class="mvQuick"><b>Thêm nhanh:</b> ${Object.entries(QUICK).map(([k, q]) => `<button type="button" data-q="${k}">+ ${q.name}</button>`).join('')}<button type="button" data-q="clear" class="warn">Xóa hết luật</button></div>
      <details class="mvRulesBox"><summary>Danh sách luật (<span data-n>0</span>)</summary><div class="mvRules"></div></details>`;
    this.grid = h.querySelector('.mvGrid');
    for (let gy = N - 1; gy >= -0; gy--) for (let gx = 0; gx < N; gx++) {
      const d = document.createElement('div'); d.className = 'mc' + ((gx + gy) % 2 ? ' l' : ' d'); d.dataset.dx = gx - C0; d.dataset.dy = gy - C0;
      if (gx === C0 && gy === C0) d.classList.add('ctr');
      this.grid.append(d);
    }
    this.grid.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('.mc'); if (!c || c.classList.contains('ctr')) return; e.preventDefault();
      this._click(+c.dataset.dx, +c.dataset.dy);
    });
    h.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.v) { const g = b.closest('[data-seg]').dataset.seg; if (g === 'kind') { this.erase = b.dataset.v === 'erase'; if (!this.erase) this.kind = b.dataset.v; } else this.mode = b.dataset.v; this._sync(); }
      else if (b.dataset.q) this._quick(b.dataset.q);
      else if (b.dataset.del !== undefined) { this.rules().splice(+b.dataset.del, 1); this._changed(); }
    });
    for (const el of h.querySelectorAll('[data-k]')) el.addEventListener('input', () => { const k = el.dataset.k; this[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(2, Math.min(12, +el.value || 3)) : el.value; this._sync(); });
  }

  rules() { return this.api.getType().moves; }
  setType() { this._sync(); this.paint(); }

  _sync() {
    const h = this.host;
    for (const g of h.querySelectorAll('[data-seg]')) for (const b of g.querySelectorAll('button')) b.classList.toggle('on', g.dataset.seg === 'kind' ? (this.erase ? b.dataset.v === 'erase' : b.dataset.v === this.kind) : b.dataset.v === this.mode);
    for (const k of ['jump', 'first']) h.querySelector(`[data-k=${k}]`).checked = this[k];
    h.querySelector('[data-k=sym]').value = this.sym;
    h.querySelector('[data-for=ridemax]').hidden = !(this.kind === 'ridemax' && !this.erase);
    h.querySelector('[data-k=jump]').disabled = this.kind === 'leap' || this.erase;
  }

  _make(dx, dy) {
    const hop = this.mode === 'hop', ride = this.kind !== 'leap';
    const r = { dx, dy, max: this.kind === 'leap' ? 1 : this.kind === 'ride' ? 0 : this.maxN, mode: hop ? 'c' : this.mode };
    if (ride && this.jump) r.jump = true; if (this.first) r.first = true; if (hop) { r.hop = true; if (r.max === 1) r.max = 0; }
    return r;
  }

  _click(cx, cy) {
    const rs = this.rules();
    if (this.erase) {
      const cells = new Set(symVectors(cx, cy, this.sym).map(([x, y]) => x + ',' + y));
      const keep = rs.filter((r) => !reach(r).some(([x, y]) => cells.has(x + ',' + y)));
      rs.length = 0; rs.push(...keep); return this._changed();
    }
    const ride = this.kind !== 'leap';
    const vecs = new Map();
    for (const [x, y] of symVectors(cx, cy, this.sym)) { let vx = x, vy = y; if (ride) { const g = gcd(x, y); vx = x / g; vy = y / g; } vecs.set(vx + ',' + vy, [vx, vy]); }
    const kind = ride ? 'ride' : 'leap', exist = [...vecs.values()].map(([x, y]) => rs.findIndex((r) => r.dx === x && r.dy === y && kindOf(r) === kind));
    if (exist.every((i) => i >= 0)) { // tất cả đã có → bật tắt: xóa
      const del = new Set(exist); const keep = rs.filter((_, i) => !del.has(i)); rs.length = 0; rs.push(...keep);
    } else {
      for (const [x, y] of vecs.values()) { const i = rs.findIndex((r) => r.dx === x && r.dy === y && kindOf(r) === kind); const nr = this._make(x, y); if (i >= 0) rs[i] = nr; else rs.push(nr); }
    }
    this._changed();
  }

  _quick(k) {
    const rs = this.rules();
    if (k === 'clear') rs.length = 0;
    else for (const r of QUICK[k].rules()) { const i = rs.findIndex((o) => keyOf(o) === keyOf(r) && !!o.first === !!r.first); if (i >= 0) rs[i] = r; else rs.push(r); }
    this._changed();
  }

  _changed() { this.paint(); this.api.onChange?.(); }

  paint() {
    const cells = new Map();
    for (const r of this.rules()) for (const [x, y] of reach(r)) {
      const k = x + ',' + y, c = cells.get(k) || { a: 0, m: 0, c: 0, hop: 0, first: 0, ride: 0 };
      if (r.hop) c.hop = 1; else c[r.mode] = 1; if (r.first) c.first = 1; if (r.max !== 1) c.ride = 1; cells.set(k, c);
    }
    for (const d of this.grid.children) {
      const k = d.dataset.dx + ',' + d.dataset.dy, c = cells.get(k);
      d.className = 'mc' + ((+d.dataset.dx + C0 + +d.dataset.dy + C0) % 2 ? ' l' : ' d') + (d.classList.contains('ctr') ? ' ctr' : '');
      if (c) { const m = c.a || (c.m && c.c) ? 'a' : c.m ? 'm' : c.c ? 'c' : ''; d.classList.add('hit'); if (m) d.classList.add('t-' + m); if (c.hop) d.classList.add('t-hop'); if (c.first) d.classList.add('first'); if (c.ride) d.classList.add('ride'); }
      if (d.classList.contains('ctr')) d.innerHTML = this.api.pieceHtml();
    }
    const rs = this.rules(), list = this.host.querySelector('.mvRules'); this.host.querySelector('[data-n]').textContent = rs.length; list.textContent = '';
    rs.forEach((r, i) => {
      const s = document.createElement('span'); s.className = 'rule';
      const mm = r.hop ? 'ăn qua 1 quân' : MODE_TXT[r.mode];
      s.append(`${ARROW(r.dx, r.dy)} (${r.dx},${r.dy}) ${r.max === 1 ? 'nhảy' : r.max === 0 ? 'trượt' : 'trượt ≤' + r.max} · ${mm}${r.jump ? ' · bay' : ''}${r.first ? ' · nước đầu' : ''} `);
      const b = document.createElement('button'); b.type = 'button'; b.dataset.del = i; b.textContent = '×'; b.title = 'Xóa luật này'; b.setAttribute('aria-label', 'Xóa luật'); s.append(b); list.append(s);
    });
  }
}
