// pieces.js — bộ quân cờ vẽ bằng SVG (tự vẽ cho dự án này, không dùng tài nguyên bên ngoài)
// và bộ dựng SVG cho quân do người dùng tự vẽ trong Custom Studio.
// Toạ độ: viewBox 0 0 100 100, quân đối xứng quanh x = 50.

export const PIECE_SETS = { neo: 'Neo (bóng, giống chess.com)', flat: 'Phẳng (nét đậm)' };
export const STD = ['p', 'n', 'b', 'r', 'q', 'k'];
export const STD_NAMES = { p: 'Tốt', n: 'Mã', b: 'Tượng', r: 'Xe', q: 'Hậu', k: 'Vua' };

const pill = (x1, x2, y1, y2) => { const r = (y2 - y1) / 2; return `M${x1 + r} ${y1}H${x2 - r}A${r} ${r} 0 0 1 ${x2 - r} ${y2}H${x1 + r}A${r} ${r} 0 0 1 ${x1 + r} ${y1}Z`; };
const rr = (x, y, w, h, r) => `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
const BASE = pill(24, 76, 78, 89);

// m = hình chính (tô + viền), d = nét chi tiết (chỉ viền), c = hình tròn [cx, cy, r], e = mắt
const SHAPES = {
  p: [
    { m: 'M33 80C34 67 41.500 59.500 43.500 50H56.500C58.500 59.500 66 67 67 80Z' },
    { m: rr(34, 43, 32, 9, 4.500) },
    { c: [50, 30, 12.500] },
    { m: BASE },
  ],
  r: [
    { m: 'M33 46H67L64 73H36Z' },
    { m: 'M27 16H40V25H44.500V16H55.500V25H60V16H73V37L66 45H34L27 37Z' },
    { m: rr(29, 70, 42, 9, 3) },
    { m: BASE },
    { d: 'M33 37H67' },
  ],
  b: [
    { m: 'M37 56H63C64 66 68 73 70 80H30C32 73 36 66 37 56Z' },
    { m: rr(35, 49, 30, 8, 4) },
    { m: 'M50 15C61 24 68 33 66 41C65 46.500 60.500 49.500 56 50H44C39.500 49.500 35 46.500 34 41C32 33 39 24 50 15Z' },
    { c: [50, 12, 4.800] },
    { d: 'M44 37L55.500 25.500' },
    { m: BASE },
  ],
  n: [
    { m: 'M28 80C28 66 35 59.500 42.500 50C38.500 51 35 53.500 31 55.500C25 58 21 53.500 22.500 48.500C24 43 30 34 37 27L39.500 13L48 21.500C67 24 77 46 73 80Z' },
    { d: 'M52 28C62 36 65 52 63 69' },
    { d: 'M31 55.500C28.500 54.500 25.500 52 24.500 49.500' },
    { e: [40.500, 33.500, 2.600] },
    { e: [27, 47.500, 1.400] },
    { m: BASE },
  ],
  q: [
    { m: 'M19 30L31 60L35.500 30L44 58L50 24L56 58L64.500 30L69 60L81 30L73 72H27Z' },
    { c: [19, 27, 4.600] }, { c: [35.500, 24, 4.600] }, { c: [50, 20.500, 4.600] }, { c: [64.500, 24, 4.600] }, { c: [81, 27, 4.600] },
    { m: rr(27, 69, 46, 10, 4) },
    { m: BASE },
  ],
  k: [
    { m: 'M50 30C67 30 77 38 77 50C77 58 71 62 69 70H31C29 62 23 58 23 50C23 38 33 30 50 30Z' },
    { d: 'M29 52C41 58 59 58 71 52' },
    { m: 'M45 6H55V13H62V22H55V31H45V22H38V13H45Z' },
    { m: rr(29, 68, 42, 11, 4.500) },
    { m: BASE },
  ],
};

let defsDone = false;
export function ensureDefs() {
  if (defsDone || typeof document === 'undefined') return;
  defsDone = true;
  const d = document.createElement('div');
  d.setAttribute('aria-hidden', 'true');
  d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  d.innerHTML = `<svg width="0" height="0"><defs>
    <linearGradient id="pg-w" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#eef0f3"/><stop offset="1" stop-color="#c9ced6"/></linearGradient>
    <linearGradient id="pg-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b727c"/><stop offset=".5" stop-color="#3d424a"/><stop offset="1" stop-color="#1f2227"/></linearGradient>
  </defs></svg>`;
  document.body.prepend(d);
}

// Trả về chuỗi SVG của quân chuẩn. set: 'neo' | 'flat'
export function pieceSvg(type, color, set = 'neo') {
  const sh = SHAPES[type]; if (!sh) return '';
  const w = color === 'w', neo = set !== 'flat';
  const fill = neo ? `url(#pg-${w ? 'w' : 'b'})` : (w ? '#f6f3ea' : '#3b4452');
  const stroke = w ? '#2b2f36' : '#0b0d10', det = w ? '#2b2f36' : '#b9c2cd';
  const sw = neo ? 2.4 : 3.2;
  let o = `<svg viewBox="0 0 100 100" aria-hidden="true" class="ps ${neo ? 'neo' : 'flat'}"><g stroke-linejoin="round" stroke-linecap="round">`;
  for (const s of sh) {
    if (s.m) o += `<path d="${s.m}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    else if (s.c) o += `<circle cx="${s.c[0]}" cy="${s.c[1]}" r="${s.c[2]}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
    else if (s.d) o += `<path d="${s.d}" fill="none" stroke="${det}" stroke-width="${sw * .75}"/>`;
    else if (s.e) o += `<circle cx="${s.e[0]}" cy="${s.e[1]}" r="${s.e[2]}" fill="${det}" stroke="none"/>`;
  }
  return o + '</g></svg>';
}

// ---------- quân tự vẽ ----------
// Bản vẽ: { base: 'p'|'n'|...|null, items: [ {t:'path'|'blob'|'line'|'rect'|'ell', ...} ] }
// Màu đặc biệt: 'side' = màu phe (trắng/đen), 'edge' = màu viền phe, 'none' = không tô.
export const SIDE_FILL = { w: '#f4f1e8', b: '#3a424e' };
export const SIDE_EDGE = { w: '#262a31', b: '#07090c' };
const col = (c, side) => (c === 'side' ? SIDE_FILL[side] : c === 'edge' ? SIDE_EDGE[side] : c || 'none');
const f1 = (n) => (Math.round(n * 10) / 10).toString();

// làm mượt đường nét tự do bằng Catmull-Rom -> Bezier
export function smoothPath(pts, closed = false) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${f1(pts[0][0])} ${f1(pts[0][1])}l0.01 0`;
  if (pts.length === 2) return `M${f1(pts[0][0])} ${f1(pts[0][1])}L${f1(pts[1][0])} ${f1(pts[1][1])}`;
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}

export function itemSvg(it, side) {
  const st = `stroke="${col(it.stroke, side)}" stroke-width="${it.sw ?? 3}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (it.t) {
    case 'path': return `<path d="${smoothPath(it.pts)}" fill="none" ${st}/>`;
    case 'blob': return `<path d="${smoothPath(it.pts, true)}" fill="${col(it.fill, side)}" ${st}/>`;
    case 'line': return `<path d="M${f1(it.x1)} ${f1(it.y1)}L${f1(it.x2)} ${f1(it.y2)}" fill="none" ${st}/>`;
    case 'rect': return `<rect x="${f1(it.x)}" y="${f1(it.y)}" width="${f1(it.w)}" height="${f1(it.h)}" rx="${f1(it.r ?? 0)}" fill="${col(it.fill, side)}" ${st}/>`;
    case 'ell': return `<ellipse cx="${f1(it.cx)}" cy="${f1(it.cy)}" rx="${f1(it.rx)}" ry="${f1(it.ry)}" fill="${col(it.fill, side)}" ${st}/>`;
    default: return '';
  }
}

export function drawingSvg(dr, side, set = 'neo') {
  let inner = '';
  if (dr?.base && SHAPES[dr.base]) inner += pieceSvg(dr.base, side, set).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  for (const it of dr?.items || []) inner += itemSvg(it, side);
  return `<svg viewBox="0 0 100 100" aria-hidden="true" class="ps custom">${inner}</svg>`;
}

// Quân của một bộ luật tùy biến: type = {art:{base,items}}
export function customPieceSvg(type, side, set = 'neo') { return drawingSvg(type.art, side, set); }
