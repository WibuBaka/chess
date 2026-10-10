// variant.js — bộ luật cờ tùy biến: bàn W×H, ô "khuyết", quân có luật đi tự định nghĩa.
// Không phụ thuộc DOM (chạy được trong Web Worker và Node để kiểm thử).
//
// Định nghĩa trò chơi (def):
//   { name, w, h, voids:[chỉ số ô], types:[Type], setup:[{t, c, x, y, m?}], turn:'w' }
// Type:
//   { id, name, letter, value, royal, promote:[id...]|null, moves:[Rule], art }
// Rule (toạ độ tính theo phía Trắng: dy>0 là hướng tiến lên; Đen được lật dọc):
//   { dx, dy, max, mode, jump?, first?, hop? }
//   max: 1 = nhảy một bước đến (dx,dy); n>=2 = trượt tối đa n bước theo vector; 0 = trượt không giới hạn.
//   mode: 'a' đi và ăn, 'm' chỉ đi (ô trống), 'c' chỉ ăn.
//   jump: được bay qua các quân cản khi trượt.  first: chỉ dùng khi quân chưa từng di chuyển.
//   hop: ăn kiểu Pháo — phải có đúng một quân (bàn đạp) nằm giữa; luôn là luật chỉ-ăn.
// Chiếu: nếu một phe có quân "royal", nước đi không được để quân royal bị tấn công; hết nước đi khi bị chiếu = thua.

export const VOID_LIMIT = 4096;
const MODE = { a: 0, m: 1, c: 2 };

export class Game {
  constructor(def) {
    this.def = def; this.w = def.w; this.h = def.h; this.n = this.w * this.h;
    this.types = def.types; this.tIndex = {}; def.types.forEach((t, i) => { this.tIndex[t.id] = i + 1; });
    this.rules = [null, ...def.types.map((t) => (t.moves || []).map((r) => ({ dx: r.dx | 0, dy: r.dy | 0, max: r.max ?? 1, mode: r.hop ? 2 : MODE[r.mode || 'a'], jump: !!r.jump, first: !!r.first, hop: !!r.hop })))];
    this.royal = [false, ...def.types.map((t) => !!t.royal)];
    this.promo = [null, ...def.types.map((t) => (t.promote?.length ? t.promote.map((id) => this.tIndex[id]).filter(Boolean) : null))];
    this.value = [0, ...def.types.map((t) => t.value ?? 1)];
    this.board = new Int16Array(this.n); this.moved = new Uint8Array(this.n); this.vd = new Uint8Array(this.n);
    for (const i of def.voids || []) if (i >= 0 && i < this.n) this.vd[i] = 1;
    this.cnt = { w: new Int16Array(this.types.length + 1), b: new Int16Array(this.types.length + 1) };
    for (const s of def.setup || []) {
      const t = this.tIndex[s.t], i = s.y * this.w + s.x;
      if (!t || s.x < 0 || s.y < 0 || s.x >= this.w || s.y >= this.h || this.vd[i] || this.board[i]) continue;
      this.board[i] = s.c === 'w' ? t : -t; this.moved[i] = s.m ? 1 : 0; this.cnt[s.c][t]++;
    }
    this.turn = def.turn || 'w'; this.half = 0; this.stack = []; this.log = []; this.seen = new Map();
    this.hasFirst = [false, ...this.rules.slice(1).map((rs) => rs.some((r) => r.first))];
    this.stamp = 1; this.mark = new Int32Array(this.n * (this.types.length + 1));
    this._rec();
  }

  // ---------- tiện ích ----------
  at(x, y) { const v = this.board[y * this.w + x]; return v ? { t: Math.abs(v), c: v > 0 ? 'w' : 'b', type: this.types[Math.abs(v) - 1], moved: !!this.moved[y * this.w + x] } : null; }
  // khóa vị trí để đếm lặp: chỉ tính cờ "đã đi" của quân có luật "nước đầu"
  key() { let m = ''; for (let i = 0; i < this.n; i++) { const v = Math.abs(this.board[i]); if (v && this.hasFirst[v]) m += this.moved[i] ? '1' : '0'; } return this.turn + Array.from(this.board).join(',') + '|' + m; }
  _rec() { const k = this.key(); this.seen.set(k, (this.seen.get(k) || 0) + 1); return k; }
  _unrec() { const k = this.key(), c = this.seen.get(k) || 0; if (c <= 1) this.seen.delete(k); else this.seen.set(k, c - 1); }

  // Có thể tấn công ô sq (chỉ số) bởi phe `by` không?
  attacked(sq, by) {
    const { w, h, board, vd, moved } = this, sx = sq % w, sy = (sq / w) | 0, sgn = by === 'w' ? 1 : -1, cnt = this.cnt[by];
    for (let t = 1; t <= this.types.length; t++) {
      if (!cnt[t]) continue;
      const me = sgn * t, rs = this.rules[t];
      for (let r = 0; r < rs.length; r++) {
        const R = rs[r]; if (R.mode === 1) continue;
        const dx = R.dx, dy = R.dy * sgn, lim = R.max === 0 ? 99 : R.max;
        let ax = sx, ay = sy, screens = 0;
        for (let k = 1; k <= lim; k++) {
          ax -= dx; ay -= dy;
          if (ax < 0 || ay < 0 || ax >= w || ay >= h) break;
          const a = ay * w + ax;
          if (vd[a]) { if (R.jump) continue; break; }
          const v = board[a];
          if (!v) continue;
          if (R.hop) { if (screens === 0) { screens = 1; continue; } if (v === me && !(R.first && moved[a])) return true; break; }
          if (v === me && !(R.first && moved[a])) return true;
          if (!R.jump) break;
        }
      }
    }
    return false;
  }

  inCheck(color = this.turn) {
    const en = color === 'w' ? 'b' : 'w', sgn = color === 'w' ? 1 : -1;
    for (let i = 0; i < this.n; i++) { const v = this.board[i] * sgn; if (v > 0 && this.royal[v] && this.attacked(i, en)) return true; }
    return false;
  }
  hasRoyal(color) { const sgn = color === 'w' ? 1 : -1; for (let i = 0; i < this.n; i++) { const v = this.board[i] * sgn; if (v > 0 && this.royal[v]) return true; } return false; }

  // ---------- sinh nước đi ----------
  pseudo(color = this.turn, capsOnly = false) {
    const out = [], { w, h, board, vd, moved } = this, sgn = color === 'w' ? 1 : -1, T = this.types.length + 1;
    for (let i = 0; i < this.n; i++) {
      const v = board[i] * sgn; if (v <= 0) continue;
      const rs = this.rules[v], x0 = i % w, y0 = (i / w) | 0, pr = this.promo[v], st = ++this.stamp, mk = this.mark;
      const add = (to) => {
        const ty = (to / w) | 0, last = sgn > 0 ? ty === h - 1 : ty === 0, cap = board[to];
        if (pr && last) { for (const p of pr) { const k = to * T + p; if (mk[k] !== st) { mk[k] = st; out.push({ from: i, to, promo: p, cap: Math.abs(cap) }); } } }
        else { const k = to * T; if (mk[k] !== st) { mk[k] = st; out.push({ from: i, to, promo: 0, cap: Math.abs(cap) }); } }
      };
      for (let r = 0; r < rs.length; r++) {
        const R = rs[r]; if (R.first && moved[i]) continue;
        const dx = R.dx, dy = R.dy * sgn, lim = R.max === 0 ? 99 : R.max;
        if (R.hop) {
          let x = x0, y = y0, scr = false;
          for (let k = 1; k <= lim; k++) {
            x += dx; y += dy; if (x < 0 || y < 0 || x >= w || y >= h) break;
            const j = y * w + x; if (vd[j]) break;
            const u = board[j]; if (!u) continue;
            if (!scr) { scr = true; continue; }
            if (u * sgn < 0) add(j);
            break;
          }
          continue;
        }
        let x = x0, y = y0;
        for (let k = 1; k <= lim; k++) {
          x += dx; y += dy; if (x < 0 || y < 0 || x >= w || y >= h) break;
          const j = y * w + x;
          if (vd[j]) { if (R.jump) continue; break; }
          const u = board[j] * sgn;
          if (u === 0) { if (R.mode !== 2 && !capsOnly) add(j); continue; }
          if (u < 0 && R.mode !== 1) add(j);
          if (!R.jump) break;
        }
      }
    }
    return out;
  }

  // ---------- thực hiện / hoàn tác ----------
  make(m) {
    const { board, moved } = this, c = this.turn, sgn = c === 'w' ? 1 : -1, piece = board[m.from], cap = board[m.to];
    this.stack.push({ m, piece, cap, mvFrom: moved[m.from], mvTo: moved[m.to], half: this.half });
    board[m.to] = m.promo ? sgn * m.promo : piece; board[m.from] = 0; moved[m.to] = 1; moved[m.from] = 0;
    if (m.promo) { this.cnt[c][Math.abs(piece)]--; this.cnt[c][m.promo]++; }
    if (cap) this.cnt[c === 'w' ? 'b' : 'w'][Math.abs(cap)]--;
    this.half = cap || m.promo ? 0 : this.half + 1; this.turn = c === 'w' ? 'b' : 'w';
  }
  unmake() {
    const s = this.stack.pop(), m = s.m, c = this.turn === 'w' ? 'b' : 'w';
    this.turn = c; this.half = s.half; this.board[m.from] = s.piece; this.board[m.to] = s.cap; this.moved[m.from] = s.mvFrom; this.moved[m.to] = s.mvTo;
    if (m.promo) { this.cnt[c][m.promo]--; this.cnt[c][Math.abs(s.piece)]++; }
    if (s.cap) this.cnt[c === 'w' ? 'b' : 'w'][Math.abs(s.cap)]++;
  }

  // Nước đi hợp lệ (đã loại các nước để vua/royal bị chiếu)
  legal(color = this.turn) {
    const ps = this.pseudo(color), out = [], roy = this.hasRoyal(color);
    if (!roy) return ps;
    const en = color === 'w' ? 'b' : 'w';
    for (const m of ps) { this.make(m); const bad = this._unsafe(color, en); this.unmake(); if (!bad) out.push(m); }
    return out;
  }
  _unsafe(color, en) {
    const sgn = color === 'w' ? 1 : -1;
    for (let i = 0; i < this.n; i++) { const v = this.board[i] * sgn; if (v > 0 && this.royal[v] && this.attacked(i, en)) return true; }
    return false;
  }
  movesFrom(x, y) { const i = y * this.w + x; return this.legal().filter((m) => m.from === i); }

  // ---------- kết quả ----------
  // {over:false} hoặc {over:true, result:'w'|'b'|'d', reason}
  status() {
    const lm = this.legal(), c = this.turn;
    if (!lm.length) {
      if (this.hasRoyal(c)) return this.inCheck(c) ? { over: true, result: c === 'w' ? 'b' : 'w', reason: 'Chiếu hết' } : { over: true, result: 'd', reason: 'Hòa do hết nước đi (pat)' };
      let any = false; const sg = c === 'w' ? 1 : -1; for (let i = 0; i < this.n; i++) if (this.board[i] * sg > 0) { any = true; break; }
      return any ? { over: true, result: 'd', reason: 'Hòa do hết nước đi' } : { over: true, result: c === 'w' ? 'b' : 'w', reason: 'Hết quân' };
    }
    let nonRoyal = false; for (let i = 0; i < this.n; i++) { const v = Math.abs(this.board[i]); if (v && !this.royal[v]) { nonRoyal = true; break; } }
    if (!nonRoyal && this.def.types.some((t) => t.royal)) return { over: true, result: 'd', reason: 'Hòa do không đủ lực lượng' };
    if ((this.seen.get(this.key()) || 0) >= 3) return { over: true, result: 'd', reason: 'Hòa do lặp lại vị trí' };
    if (this.half >= 100) return { over: true, result: 'd', reason: 'Hòa: 100 nước không bắt quân / phong cấp' };
    return { over: false };
  }

  // ---------- ký hiệu & lịch sử ----------
  sq(i) { return String.fromCharCode(97 + (i % this.w)) + (((i / this.w) | 0) + 1); }
  text(m, lm = this.legal()) {
    const t = Math.abs(this.board[m.from]), ty = this.types[t - 1], L = ty.letter ?? (ty.name || '?')[0].toUpperCase();
    let dis = '';
    const same = lm.filter((o) => o !== m && o.to === m.to && Math.abs(this.board[o.from]) === t && o.promo === m.promo);
    if (same.length) { const fx = m.from % this.w; dis = same.some((o) => o.from % this.w === fx) ? this.sq(m.from) : this.sq(m.from)[0]; }
    const cap = m.cap ? 'x' : '', pm = m.promo ? '=' + (this.types[m.promo - 1].letter || this.types[m.promo - 1].name[0]) : '';
    return `${L}${dis}${cap}${this.sq(m.to)}${pm}`;
  }
  // Đi một nước (đối tượng từ legal()) và ghi lịch sử. Trả về bản ghi hoặc null.
  play(from, to, promo = 0) {
    const lm = this.legal(), m = lm.find((o) => o.from === from && o.to === to && (o.promo || 0) === (promo || 0));
    if (!m) return null;
    const txt = this.text(m, lm), color = this.turn; this.make(m); this._rec();
    const chk = this.inCheck(this.turn), st = this.status(), mate = st.over && st.reason === 'Chiếu hết';
    const rec = { ...m, text: txt + (mate ? '#' : chk ? '+' : ''), color }; this.log.push(rec); return rec;
  }
  undo() { if (!this.log.length) return null; this._unrec(); this.unmake(); return this.log.pop(); }
  promotionChoices(from, to) { return this.legal().filter((m) => m.from === from && m.to === to && m.promo).map((m) => m.promo); }
}

// ---------- định nghĩa quân chuẩn & các bản mẫu ----------
const L = (dx, dy, mode = 'a', extra = {}) => ({ dx, dy, max: 1, mode, ...extra });
const R = (dx, dy, mode = 'a', max = 0, extra = {}) => ({ dx, dy, max, mode, ...extra });
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const bishop = () => DIAG.map(([a, b]) => R(a, b)), rook = () => ORTH.map(([a, b]) => R(a, b)), knight = () => KN.map(([a, b]) => L(a, b));
export const stdTypes = () => [
  { id: 'p', name: 'Tốt', letter: '', value: 1, art: { base: 'p', items: [] }, promote: ['q', 'r', 'b', 'n'], moves: [R(0, 1, 'm', 1), R(0, 1, 'm', 2, { first: true }), L(1, 1, 'c'), L(-1, 1, 'c')] },
  { id: 'n', name: 'Mã', letter: 'N', value: 3, art: { base: 'n', items: [] }, moves: knight() },
  { id: 'b', name: 'Tượng', letter: 'B', value: 3.2, art: { base: 'b', items: [] }, moves: bishop() },
  { id: 'r', name: 'Xe', letter: 'R', value: 5, art: { base: 'r', items: [] }, moves: rook() },
  { id: 'q', name: 'Hậu', letter: 'Q', value: 9, art: { base: 'q', items: [] }, moves: [...rook(), ...bishop()] },
  { id: 'k', name: 'Vua', letter: 'K', value: 0, royal: true, art: { base: 'k', items: [] }, moves: [...ORTH, ...DIAG].map(([a, b]) => L(a, b)) },
];
const row = (ids, y, c) => ids.map((t, x) => ({ t, c, x, y }));
const pawns = (w, y, c) => Array.from({ length: w }, (_, x) => ({ t: 'p', c, x, y }));

export function standardDef() {
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  return { name: 'Cờ vua chuẩn (không nhập thành / bắt tốt qua đường)', w: 8, h: 8, voids: [], types: stdTypes(), turn: 'w',
    setup: [...row(back, 0, 'w'), ...pawns(8, 1, 'w'), ...pawns(8, 6, 'b'), ...row(back, 7, 'b')] };
}
export function miniDef() {
  const back = ['r', 'n', 'q', 'k', 'n', 'r'];
  return { name: 'Cờ vua mini 6×6', w: 6, h: 6, voids: [], types: stdTypes(), turn: 'w', setup: [...row(back, 0, 'w'), ...pawns(6, 1, 'w'), ...pawns(6, 4, 'b'), ...row(back, 5, 'b')] };
}
export function capablancaDef() {
  const types = stdTypes();
  types.push({ id: 'a', name: 'Đại giáo chủ', letter: 'A', value: 7, art: { base: 'b', items: [{ t: 'ell', cx: 50, cy: 31, rx: 6, ry: 6, fill: '#e4572e', stroke: 'edge', sw: 2.4 }] }, moves: [...bishop(), ...knight()] });
  types.push({ id: 'c', name: 'Thủ tướng', letter: 'C', value: 8.5, art: { base: 'r', items: [{ t: 'ell', cx: 50, cy: 56, rx: 6, ry: 6, fill: '#2e86e4', stroke: 'edge', sw: 2.4 }] }, moves: [...rook(), ...knight()] });
  const back = ['r', 'n', 'a', 'b', 'q', 'k', 'b', 'c', 'n', 'r'];
  return { name: 'Capablanca 10×8', w: 10, h: 8, voids: [], types, turn: 'w', setup: [...row(back, 0, 'w'), ...pawns(10, 1, 'w'), ...pawns(10, 6, 'b'), ...row(back, 7, 'b')] };
}
export function amazonDef() {
  const d = standardDef(), q = d.types.find((t) => t.id === 'q');
  q.name = 'Hậu-Mã (Amazon)'; q.letter = 'A'; q.value = 12; q.moves = [...q.moves, ...knight()];
  q.art = { base: 'q', items: [{ t: 'ell', cx: 50, cy: 58, rx: 6, ry: 6, fill: '#e4572e', stroke: 'edge', sw: 2.4 }] };
  d.name = 'Amazon: Hậu có thêm bước Mã';
  return d;
}
export function knightsDef() {
  const types = stdTypes().filter((t) => ['p', 'n', 'k'].includes(t.id)); types.find((t) => t.id === 'p').promote = ['n'];
  const back = ['n', 'n', 'n', 'k', 'n', 'n', 'n', 'n'];
  return { name: 'Đại chiến Mã', w: 8, h: 8, voids: [], types, turn: 'w', setup: [...row(back, 0, 'w'), ...pawns(8, 1, 'w'), ...pawns(8, 6, 'b'), ...row(back, 7, 'b')] };
}
export const PRESETS = [
  { id: 'std', name: 'Cờ vua chuẩn', make: standardDef },
  { id: 'mini', name: 'Cờ vua mini 6×6', make: miniDef },
  { id: 'cap', name: 'Capablanca 10×8', make: capablancaDef },
  { id: 'ama', name: 'Hậu Amazon', make: amazonDef },
  { id: 'kn', name: 'Đại chiến Mã', make: knightsDef },
];

// Dùng cho kiểm thử: nạp thế cờ chuẩn từ FEN (bỏ qua nhập thành, bắt tốt qua đường)
export function defFromFen(fen) {
  const d = standardDef(), [pl, tn] = fen.split(' '); d.setup = [];
  pl.split('/').forEach((rs, ri) => { let x = 0; const y = 7 - ri; for (const ch of rs) { if (/\d/.test(ch)) { x += +ch; continue; } const c = ch === ch.toUpperCase() ? 'w' : 'b', t = ch.toLowerCase(); d.setup.push({ t, c, x, y, m: t === 'p' ? (c === 'w' ? y !== 1 : y !== 6) : false }); x++; } });
  d.turn = tn === 'b' ? 'b' : 'w'; return d;
}

// Ước lượng giá trị quân từ số ô mà nó kiểm soát trên bàn trống 9×9 (giữa bàn).
export function estimateValue(type) {
  const g = new Game({ w: 9, h: 9, voids: [], types: [{ ...type, royal: false, promote: null, value: 1 }], setup: [{ t: type.id, c: 'w', x: 4, y: 4 }] });
  const mv = new Set(g.pseudo('w').map((m) => m.to)).size;
  const f = Math.min(Math.max(mv, 0), 40);
  return Math.max(0.5, Math.round((f * 0.3 + 0.2) * 10) / 10);
}
