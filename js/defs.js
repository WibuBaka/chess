// defs.js — tạo / kiểm tra / làm sạch định nghĩa trò chơi tùy biến (không phụ thuộc DOM).
// normalizeDef() được dùng cho mọi dữ liệu từ bên ngoài (file JSON, thư viện đã lưu) để không bao giờ
// đưa chuỗi lạ vào SVG/HTML hoặc làm engine bị treo vì kích thước quá lớn.
import { standardDef } from './variant.js';

export const LIMITS = { minSize: 4, maxSize: 16, maxTypes: 24, maxRules: 64, maxItems: 300, maxPts: 600 };
const BASES = ['p', 'n', 'b', 'r', 'q', 'k'];
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const int = (v, d, lo, hi) => Math.round(num(v, d, lo, hi));
const str = (v, d, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f<>"'&]/g, '').slice(0, max) : d);
const color = (v, d = 'none') => (v === 'side' || v === 'edge' || v === 'none' ? v : typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : d);
const tid = (v, d) => (typeof v === 'string' && /^[a-z0-9_]{1,12}$/i.test(v) ? v : d);

export function newDef() { const d = standardDef(); d.name = 'Trò chơi của tôi'; return d; }

export function normalizeArt(a) {
  const out = { base: BASES.includes(a?.base) ? a.base : null, items: [] };
  for (const it of Array.isArray(a?.items) ? a.items.slice(0, LIMITS.maxItems) : []) {
    const c = { t: it?.t, stroke: color(it?.stroke), sw: num(it?.sw, 3, 0, 20) };
    if (it.g !== undefined) c.g = int(it.g, 0, 0, 1e6);
    if (it.t === 'path' || it.t === 'blob') {
      c.pts = (Array.isArray(it.pts) ? it.pts.slice(0, LIMITS.maxPts) : []).map((p) => [num(p?.[0], 50, -50, 150), num(p?.[1], 50, -50, 150)]);
      if (!c.pts.length) continue; if (it.t === 'blob') c.fill = color(it.fill);
    } else if (it.t === 'line') { Object.assign(c, { x1: num(it.x1, 0, -50, 150), y1: num(it.y1, 0, -50, 150), x2: num(it.x2, 0, -50, 150), y2: num(it.y2, 0, -50, 150) }); }
    else if (it.t === 'rect') Object.assign(c, { x: num(it.x, 0, -50, 150), y: num(it.y, 0, -50, 150), w: num(it.w, 1, 0, 200), h: num(it.h, 1, 0, 200), r: num(it.r, 0, 0, 100), fill: color(it.fill) });
    else if (it.t === 'ell') Object.assign(c, { cx: num(it.cx, 50, -50, 150), cy: num(it.cy, 50, -50, 150), rx: num(it.rx, 1, 0, 100), ry: num(it.ry, 1, 0, 100), fill: color(it.fill) });
    else continue;
    out.items.push(c);
  }
  return out;
}

export function normalizeDef(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Dữ liệu không phải một trò chơi hợp lệ.');
  const w = int(raw.w, 8, LIMITS.minSize, LIMITS.maxSize), h = int(raw.h, 8, LIMITS.minSize, LIMITS.maxSize);
  const types = []; const ids = new Set();
  for (const t of Array.isArray(raw.types) ? raw.types.slice(0, LIMITS.maxTypes) : []) {
    let id = tid(t?.id, 'u' + types.length); while (ids.has(id)) id += 'x'; ids.add(id);
    const moves = [];
    for (const r of Array.isArray(t?.moves) ? t.moves.slice(0, LIMITS.maxRules) : []) {
      const dx = int(r?.dx, 0, -16, 16), dy = int(r?.dy, 0, -16, 16); if (!dx && !dy) continue;
      const hop = !!r.hop, mode = hop ? 'c' : ['a', 'm', 'c'].includes(r.mode) ? r.mode : 'a';
      const rule = { dx, dy, max: int(r.max, 1, 0, 16), mode }; if (r.jump) rule.jump = true; if (r.first) rule.first = true; if (hop) rule.hop = true; moves.push(rule);
    }
    types.push({ id, name: str(t?.name, 'Quân ' + (types.length + 1), 24) || 'Quân', letter: str(t?.letter, '', 2), value: num(t?.value, 1, 0, 99), royal: !!t?.royal,
      promote: Array.isArray(t?.promote) ? t.promote.map((x) => tid(x, null)).filter(Boolean).slice(0, LIMITS.maxTypes) : null, moves, art: normalizeArt(t?.art) });
  }
  if (!types.length) throw new Error('Trò chơi cần ít nhất một loại quân.');
  const setup = [];
  const taken = new Set();
  for (const s of Array.isArray(raw.setup) ? raw.setup.slice(0, w * h) : []) {
    const x = int(s?.x, -1, -1, 99), y = int(s?.y, -1, -1, 99), c = s?.c === 'b' ? 'b' : 'w';
    if (x < 0 || y < 0 || x >= w || y >= h || !ids.has(s?.t) || taken.has(y * w + x)) continue;
    taken.add(y * w + x); setup.push({ t: s.t, c, x, y, ...(s.m ? { m: 1 } : {}) });
  }
  const voids = [...new Set((Array.isArray(raw.voids) ? raw.voids : []).map((v) => int(v, -1, -1, 1e4)).filter((v) => v >= 0 && v < w * h))];
  const ok = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  for (const t of types) if (t.promote) t.promote = t.promote.filter((p) => ids.has(p));
  return { name: str(raw.name, 'Trò chơi của tôi', 60) || 'Trò chơi của tôi', w, h, voids: voids.filter((v) => !taken.has(v)), types, setup, turn: raw.turn === 'b' ? 'b' : 'w',
    ...(ok(raw.light) ? { light: raw.light } : {}), ...(ok(raw.dark) ? { dark: raw.dark } : {}) };
}

// Kiểm tra trước khi chơi: trả về danh sách {level:'error'|'warn', text}
export function validateDef(d) {
  const out = [], by = (c) => d.setup.filter((s) => s.c === c);
  if (!by('w').length) out.push({ level: 'error', text: 'Trắng chưa có quân nào trên bàn.' });
  if (!by('b').length) out.push({ level: 'error', text: 'Đen chưa có quân nào trên bàn.' });
  const royal = new Set(d.types.filter((t) => t.royal).map((t) => t.id));
  for (const c of ['w', 'b']) {
    const n = by(c).filter((s) => royal.has(s.t)).length;
    if (!n && by(c).length) out.push({ level: 'warn', text: `${c === 'w' ? 'Trắng' : 'Đen'} không có quân Vua (royal): ván chỉ kết thúc khi hết quân hoặc hết nước đi.` });
    if (n > 1) out.push({ level: 'warn', text: `${c === 'w' ? 'Trắng' : 'Đen'} có ${n} quân Vua: mọi quân Vua đều phải an toàn sau mỗi nước đi.` });
  }
  for (const t of d.types) if (!t.moves.length && by('w').concat(by('b')).some((s) => s.t === t.id)) out.push({ level: 'warn', text: `"${t.name}" chưa có cách di chuyển nên sẽ đứng yên (làm vật cản).` });
  return out;
}

export const cloneDef = (d) => JSON.parse(JSON.stringify(d));
export function exportJson(def) { return JSON.stringify({ format: 'co-vua-studio', version: 1, def }, null, 1); }
export function importJson(text) {
  let o; try { o = JSON.parse(text); } catch { throw new Error('File không phải JSON hợp lệ.'); }
  return normalizeDef(o?.format === 'co-vua-studio' ? o.def : o);
}
