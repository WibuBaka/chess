import { Chess } from '../lib/chess.js';
import { Engine, workerTransport, ELOS } from './ai.js';

const $ = (id) => document.getElementById(id);
const SVG = {
  p: '<circle cx="22.5" cy="13" r="5"/><path d="M16 35c0-8 2.5-12 6.5-15 4 3 6.5 7 6.5 15z"/><rect x="12" y="35" width="21" height="4" rx="1.5"/>',
  r: '<path d="M13 14h5v3.5h3V14h3v3.5h3V14h5v8l-3.5 3v9.5h-14V25L13 22z"/><rect x="11" y="34.5" width="23" height="4.5" rx="1.5"/>',
  n: '<path d="M14 35c0-9 3-13 7-17-3-.5-5-2.5-6-5.5 5-4 12-3 15 2 3 4 3.5 12 3.5 20.5z"/><circle class="eye" cx="21" cy="14.5" r="1.3"/><rect x="11" y="35" width="23" height="4" rx="1.5"/>',
  b: '<circle cx="22.5" cy="8" r="2.5"/><path d="M22.5 11c4 0 6.5 3 6.5 6.5 0 3-2 5-3.5 7 2.5 2.5 4 6 4 10.5h-14c0-4.5 1.5-8 4-10.5-1.5-2-3.5-4-3.5-7 0-3.5 2.5-6.5 6.5-6.5z"/><path class="ln" d="M20 17.5h5M22.5 15v5"/><rect x="11" y="35" width="23" height="4" rx="1.5"/>',
  q: '<path d="M12 36L9.5 16l7 8L18 12l4.5 11L27 12l1.5 12 7-8L33 36z"/><circle cx="9.5" cy="15" r="2"/><circle cx="18" cy="11" r="2"/><circle cx="22.5" cy="9" r="2"/><circle cx="27" cy="11" r="2"/><circle cx="35.5" cy="15" r="2"/><rect x="11" y="35" width="23" height="4" rx="1.5"/>',
  k: '<path class="ln" d="M22.5 5v8M19 8.5h7"/><path d="M22.5 14c-6.5 0-10.5 4-10.5 9 0 5 3 7.5 4 12.5h13c1-5 4-7.5 4-12.5 0-5-4-9-10.5-9z"/><rect x="11" y="35" width="23" height="4" rx="1.5"/>',
};
const pieceSvg = (t) => `<svg viewBox="0 0 45 45" aria-hidden="true">${SVG[t]}</svg>`;
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } };

const cfg = Object.assign({ elo: 1200, color: 'w', tc: '', practice: false, theme: globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark', board: 'green' }, load('cc.settings', {}));
const S = { flip: false, game: new Chess(), mode: 'idle', me: 'w', elo: cfg.elo, tc: '', inc: 0, practice: false, view: null,
  sel: null, targets: [], thinking: false, token: 0, atoken: 0, analyzing: false, clocks: { w: 0, b: 0 }, ts: 0, t0: 0, result: '*', note: '', report: null };
let engine = null;

// ---------- tiện ích ----------
const fmt = (ms) => { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); return ms < 10000 ? (ms / 1000).toFixed(1) : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const banner = (t) => { $('banner').textContent = t; $('banner').hidden = !t; };
const bottom = () => ((S.me === 'b') !== S.flip ? 'b' : 'w');
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
let ac;
const tick = (cap) => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.type = 'triangle'; o.frequency.setValueAtTime(cap ? 260 : 190, t); o.frequency.exponentialRampToValueAtTime(90, t + .07); g.gain.setValueAtTime(.16, t); g.gain.exponentialRampToValueAtTime(.001, t + .09); o.connect(g).connect(ac.destination); o.start(); o.stop(t + .1); } catch { /* không có âm thanh */ } };
const hist = () => S.game.history({ verbose: true });
const fenAt = (v) => { if (v === null) return S.game.fen(); const h = hist(); return v === 0 ? (h[0]?.before ?? S.game.fen()) : h[v - 1].after; };
const canPlay = () => S.mode === 'play' && S.view === null && !S.thinking && S.game.turn() === S.me && engine?.ready;
const mating = (g, c) => { let m = 0; for (const row of g.board()) for (const p of row) if (p && p.color === c && p.type !== 'k') { if ('pqr'.includes(p.type)) return true; m++; } return m >= 2; };

// ---------- bàn cờ ----------
function render() {
  const g = new Chess(fenAt(S.view)), flip = bottom() === 'b', h = hist(), live = S.view === null;
  const last = h[(S.view ?? h.length) - 1];
  const board = $('board'); board.textContent = '';
  const kingSq = live && g.inCheck() ? g.board().flat().find((p) => p && p.type === 'k' && p.color === g.turn())?.square : null;
  for (let i = 0; i < 64; i++) {
    const r = flip ? 7 - Math.floor(i / 8) : Math.floor(i / 8), f = flip ? 7 - (i % 8) : i % 8;
    const sq = 'abcdefgh'[f] + (8 - r), p = g.get(sq);
    const d = document.createElement('div');
    d.className = 'sq ' + ((r + f) % 2 ? 'd' : 'l') + (last && (last.from === sq || last.to === sq) ? ' last' : '') + (sq === kingSq ? ' chk' : '');
    d.dataset.sq = sq; d.tabIndex = -1; d.setAttribute('role', 'gridcell');
    if (i % 8 === 0) d.insertAdjacentHTML('beforeend', `<span class="co r">${8 - r}</span>`);
    if (i >= 56) d.insertAdjacentHTML('beforeend', `<span class="co f">${'abcdefgh'[f]}</span>`);
    if (p) {
      const s = document.createElement('span');
      s.className = 'pc ' + p.color; s.innerHTML = pieceSvg(p.type);
      s.draggable = canPlay() && p.color === S.me; d.append(s);
      d.setAttribute('aria-label', `${sq} ${p.color === 'w' ? 'trắng' : 'đen'} ${p.type}`);
    }
    board.append(d);
  }
  paintMarks(); renderMoves(); renderInfo(); renderClocks(); renderButtons();
}
function paintMarks() {
  for (const d of $('board').children) {
    const sq = d.dataset.sq;
    d.classList.toggle('sel', sq === S.sel);
    d.classList.toggle('mv', S.targets.includes(sq));
    d.classList.toggle('cap', S.targets.includes(sq) && !!S.game.get(sq));
  }
}
function select(sq) { S.sel = sq; S.targets = sq ? S.game.moves({ square: sq, verbose: true }).map((m) => m.to) : []; paintMarks(); }

async function onSquare(sq) {
  if (!canPlay()) return;
  const p = S.game.get(sq);
  if (S.sel && S.targets.includes(sq)) return tryMove(S.sel, sq);
  select(p && p.color === S.me && sq !== S.sel ? sq : null);
}
async function tryMove(from, to) {
  const ms = S.game.moves({ square: from, verbose: true }).filter((m) => m.to === to);
  if (!ms.length) return;
  let promo;
  if (ms[0].promotion) { promo = await askPromo(); if (!promo) return select(null); }
  doMove(from, to, promo);
}
function askPromo() {
  return new Promise((res) => {
    const box = $('promoBtns'); box.textContent = ''; let done = false;
    for (const t of 'qrbn') { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span class="pc ${S.me}">${pieceSvg(t)}</span>`; b.onclick = () => { done = true; $('promo').close(); res(t); }; box.append(b); }
    $('promo').onclose = () => { if (!done) res(null); };
    $('promo').showModal();
  });
}

$('board').addEventListener('click', (e) => { const d = e.target.closest('.sq'); if (d) onSquare(d.dataset.sq); });
$('board').addEventListener('dragstart', (e) => { const d = e.target.closest('.sq'); if (!d || !canPlay()) return e.preventDefault(); select(d.dataset.sq); e.dataTransfer.setData('text/plain', d.dataset.sq); e.dataTransfer.effectAllowed = 'move'; });
$('board').addEventListener('dragover', (e) => { const d = e.target.closest('.sq'); if (d && S.targets.includes(d.dataset.sq)) e.preventDefault(); });
$('board').addEventListener('drop', (e) => { e.preventDefault(); const d = e.target.closest('.sq'); if (d && S.sel && S.targets.includes(d.dataset.sq)) tryMove(S.sel, d.dataset.sq); });

// ---------- luồng ván cờ ----------
function doMove(from, to, promotion) {
  const mover = S.game.turn();
  let m; try { m = S.game.move({ from, to, promotion }); } catch { m = null; }
  if (!m) return null;
  if (S.tc) { S.clocks[mover] += S.inc * 1000; S.ts = Date.now(); }
  S.sel = null; S.targets = []; S.view = null; S.report = null; tick(!!m.captured);
  render();
  if (!endIfOver() && S.game.turn() !== S.me) aiMove();
  return m;
}
function endIfOver() {
  const g = S.game;
  if (!g.isGameOver()) return false;
  if (g.isCheckmate()) finish(g.turn() === 'w' ? '0-1' : '1-0', 'Chiếu hết');
  else if (g.isStalemate()) finish('1/2-1/2', 'Hòa do hết nước đi (pat)');
  else if (g.isInsufficientMaterial()) finish('1/2-1/2', 'Hòa do không đủ lực lượng chiếu hết');
  else if (g.isThreefoldRepetition()) finish('1/2-1/2', 'Hòa do lặp lại vị trí');
  else finish('1/2-1/2', 'Hòa theo luật 50 nước');
  return true;
}
async function aiMove() {
  const token = ++S.token; S.thinking = true; renderInfo(); renderButtons();
  const ai = S.me === 'w' ? 'b' : 'w';
  let u = null;
  try { u = await engine.pickMove(S.game.fen(), S.elo, S.tc ? Math.max(80, S.clocks[ai] / 40) : 0); }
  catch (e) { banner('Lỗi engine: ' + e.message); }
  if (token !== S.token) return; // kết quả cũ (đã đổi ván / quay lại nước)
  S.thinking = false;
  if (u === null || S.mode !== 'play') return renderInfo();
  let m = doMove(u.slice(0, 2), u.slice(2, 4), u[4]);
  if (!m) { // không được xảy ra; nếu có thì báo lỗi rõ ràng và chọn nước hợp lệ đầu tiên
    banner('Engine trả về nước không hợp lệ (' + u + '). Đã chọn nước hợp lệ đầu tiên.');
    const f = S.game.moves({ verbose: true })[0]; doMove(f.from, f.to, f.promotion);
  }
}
function finish(result, reason) {
  S.mode = 'over'; S.result = result; S.note = reason; S.token++; S.thinking = false; engine?.stop();
  const secs = Math.round((Date.now() - S.t0) / 1000), g = S.game;
  headers(); g.setHeader('Result', result);
  const h = load('cc.history', []);
  h.unshift({ t: Date.now(), result, reason, elo: S.elo, me: S.me, tc: S.tc, plies: g.history().length, secs, pgn: g.pgn() });
  save('cc.history', h.slice(0, 50)); render();
  const w = result === '1/2-1/2' ? 'Hòa' : (result === '1-0') === (S.me === 'w') ? 'Bạn thắng!' : 'Bạn thua';
  $('resTitle').textContent = w; $('resNote').textContent = `${reason} (${result}) · ${Math.ceil(g.history().length / 2)} nước`; $('resDlg').showModal();
}
function headers() {
  const g = S.game, ai = `Stockfish (Elo mục tiêu ${S.elo})`;
  g.setHeader('Event', 'Cờ vua vs Stockfish'); g.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
  g.setHeader('White', S.me === 'w' ? 'Bạn' : ai); g.setHeader('Black', S.me === 'b' ? 'Bạn' : ai);
  if (S.tc) g.setHeader('TimeControl', S.tc.split('+').map((x, i) => (i ? x : +x * 60)).join('+'));
}
function start(o, keepColor) {
  S.token++; S.atoken++; S.analyzing = false; engine?.stop();
  Object.assign(cfg, o); save('cc.settings', cfg);
  S.game = new Chess(); S.flip = false; S.mode = 'play'; S.view = null; S.sel = null; S.targets = []; S.thinking = false; S.report = null; S.result = '*'; S.note = '';
  S.elo = +o.elo; S.practice = !!o.practice; S.tc = o.tc;
  S.me = keepColor || (o.color === 'r' ? (Math.random() < .5 ? 'w' : 'b') : o.color);
  const [mn, inc] = o.tc ? o.tc.split('+').map(Number) : [0, 0];
  S.clocks = { w: mn * 60000, b: mn * 60000 }; S.inc = inc || 0; S.ts = Date.now(); S.t0 = Date.now();
  banner(''); headers(); render();
  if (S.game.turn() !== S.me) aiMove();
}
function undo() {
  if (S.mode !== 'play' || !S.practice || !hist().length) return;
  S.token++; S.thinking = false; engine.stop();
  S.game.undo(); if (S.game.turn() !== S.me && hist().length) S.game.undo();
  S.view = null; S.sel = null; S.targets = []; render();
  if (S.game.turn() !== S.me) aiMove();
}

// ---------- đồng hồ ----------
setInterval(() => {
  if (S.mode !== 'play' || !S.tc) return;
  const now = Date.now(), t = S.game.turn(); S.clocks[t] -= now - S.ts; S.ts = now;
  if (S.clocks[t] <= 0) {
    S.clocks[t] = 0; const o = t === 'w' ? 'b' : 'w';
    return mating(S.game, o) ? finish(t === 'w' ? '0-1' : '1-0', 'Hết giờ') : finish('1/2-1/2', 'Hết giờ nhưng đối phương không đủ lực lượng chiếu hết');
  }
  renderClocks();
}, 100);

// ---------- thông tin, nước đi, nút ----------
function renderPlayers() {
  const bt = bottom(), have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } }, start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  for (const row of new Chess(fenAt(S.view)).board()) for (const p of row) if (p && p.type !== 'k') have[p.color][p.type]++;
  const score = (c) => Object.keys(VAL).reduce((a, t) => a + VAL[t] * have[c][t], 0);
  for (const [el, c] of [[$('topPlayer'), bt === 'w' ? 'b' : 'w'], [$('botPlayer'), bt]]) {
    const o = c === 'w' ? 'b' : 'w', human = c === S.me && S.mode !== 'review';
    el.querySelector('.name').textContent = S.mode === 'review' ? (c === 'w' ? 'Trắng' : 'Đen') : human ? 'Bạn' : 'Stockfish';
    el.querySelector('.elo').textContent = S.mode === 'review' ? '' : human ? '' : `(Elo ${S.elo} ước lượng)`;
    el.querySelector('.av').innerHTML = human || S.mode === 'review' ? '<svg viewBox="0 0 45 45"><circle cx="22.5" cy="16" r="7"/><path d="M9 38c0-9 6-13 13.500-13S36 29 36 38z"/></svg>' : pieceSvg('n');
    let cap = ''; for (const t of 'qrbnp') for (let i = 0; i < Math.max(0, start[t] - have[o][t]); i++) cap += `<span class="pc ${o}">${pieceSvg(t)}</span>`;
    const d = score(c) - score(o); el.querySelector('.cap').innerHTML = cap + (d > 0 ? `<b>+${d}</b>` : '');
  }
}
function renderInfo() {
  renderPlayers();
  const g = S.game; let t;
  if (!engine?.ready) t = $('banner').textContent ? 'Engine chưa sẵn sàng.' : 'Đang tải engine…';
  else if (S.mode === 'idle') t = 'Chọn "Ván mới" để bắt đầu.';
  else if (S.mode === 'over') { const w = S.result === '1/2-1/2' ? 'Hòa' : (S.result === '1-0') === (S.me === 'w') ? 'Bạn thắng' : 'Bạn thua'; t = `${w} (${S.result}) — ${S.note}`; }
  else if (S.mode === 'review') t = `Ván nhập từ PGN: ${hist().length} nước.`;
  else t = S.thinking ? 'AI đang suy nghĩ…' : (g.turn() === S.me ? 'Đến lượt bạn' : 'Đến lượt AI') + (g.inCheck() ? ' — đang bị chiếu!' : '');
  if (S.analyzing) t = $('status').textContent;
  $('status').textContent = t;
}
function renderClocks() {
  const bt = bottom();
  for (const [el, c] of [[$('topPlayer'), bt === 'w' ? 'b' : 'w'], [$('botPlayer'), bt]]) {
    const k = el.lastElementChild; k.textContent = S.tc ? fmt(S.clocks[c]) : '';
    k.classList.toggle('on', S.mode === 'play' && S.game.turn() === c); k.classList.toggle('low', S.tc && S.clocks[c] < 10000);
  }
}
function renderMoves() {
  const ol = $('moves'), sans = S.game.history(), cur = S.view ?? sans.length; ol.textContent = '';
  for (let i = 0; i < sans.length; i += 2) {
    const li = document.createElement('li'); li.style.display = 'contents';
    li.innerHTML = `<span class="n">${i / 2 + 1}.</span>`;
    for (const j of [i, i + 1]) {
      if (j >= sans.length) break;
      const b = document.createElement('button'); b.type = 'button'; b.textContent = sans[j]; b.className = j + 1 === cur ? 'cur' : '';
      b.onclick = () => { S.view = j + 1 === sans.length ? null : j + 1; S.sel = null; S.targets = []; render(); }; li.append(b);
    }
    ol.append(li);
  }
  ol.scrollTop = ol.scrollHeight;
}
function renderButtons() {
  const n = hist().length, over = S.mode === 'over' || S.mode === 'review';
  $('undoBtn').disabled = !(S.mode === 'play' && S.practice && n); $('undoBtn').hidden = !S.practice && S.mode === 'play';
  $('resignBtn').disabled = S.mode !== 'play'; $('replayBtn').disabled = S.mode === 'idle';
  $('analyzeBtn').disabled = !(engine?.ready && n && over && !S.analyzing); $('pgnBtn').disabled = !n;
  for (const id of ['firstBtn', 'prevBtn', 'nextBtn', 'lastBtn']) $(id).disabled = !n;
  $('contBtn').hidden = !(S.mode === 'review' && !S.game.isGameOver());
  $('report').hidden = !S.report; if (S.report) $('report').innerHTML = S.report;
}

// ---------- phân tích sau ván ----------
async function analyze() {
  const atoken = ++S.atoken, moves = hist(), fens = [moves[0].before, ...moves.map((m) => m.after)];
  S.analyzing = true; renderButtons(); const ev = [], best = [];
  for (let i = 0; i < fens.length; i++) {
    $('status').textContent = `Đang phân tích ${i + 1}/${fens.length}…`;
    const c = new Chess(fens[i]);
    if (c.isCheckmate()) { ev.push(c.turn() === 'w' ? -10000 : 10000); best.push(null); continue; }
    if (c.isGameOver()) { ev.push(0); best.push(null); continue; }
    const r = await engine.search(fens[i], { depth: 12, movetime: 300 });
    if (!r || atoken !== S.atoken) { S.analyzing = false; return renderInfo(); }
    ev.push(c.turn() === 'w' ? r.lines[0].score : -r.lines[0].score); best.push(r.best);
  }
  const rows = []; let bl = 0, mi = 0, ina = 0; const cl = (x) => Math.max(-1000, Math.min(1000, x));
  moves.forEach((m, i) => {
    const loss = m.color === 'w' ? cl(ev[i]) - cl(ev[i + 1]) : cl(ev[i + 1]) - cl(ev[i]);
    if (loss < 70 || m.color !== S.me && S.mode === 'over') return;
    const kind = loss >= 300 ? 'Sai lầm nghiêm trọng' : loss >= 150 ? 'Sai lầm' : 'Thiếu chính xác';
    loss >= 300 ? bl++ : loss >= 150 ? mi++ : ina++;
    let alt = ''; try { const b = best[i]; if (b && b !== m.lan) alt = new Chess(fens[i]).move({ from: b.slice(0, 2), to: b.slice(2, 4), promotion: b[4] }).san; } catch { /* bỏ qua */ }
    rows.push(`<p><span class="bad">${kind}</span> — nước ${Math.floor(i / 2) + 1}${m.color === 'w' ? '.' : '...'} <b>${m.san}</b> (mất ≈${loss} centipawn)${alt ? `; nên cân nhắc <b>${alt}</b>` : ''}</p>`);
  });
  S.analyzing = false;
  S.report = `<p><b>Tổng quan (các nước của bạn):</b> ${bl} sai lầm nghiêm trọng, ${mi} sai lầm, ${ina} thiếu chính xác.</p>${rows.join('') || '<p>Không phát hiện nước đi nào mất từ 70 centipawn trở lên.</p>'}<p class="note">Độ sâu 12 / tối đa 300 ms mỗi thế. 100 centipawn ≈ 1 tốt; đây không phải xác suất thắng.</p>`;
  renderInfo(); renderButtons();
}

// ---------- PGN & lịch sử ----------
function openPgn(text, mode) {
  try {
    const g = new Chess(); g.loadPgn(text);
    S.token++; S.atoken++; engine?.stop(); S.analyzing = false;
    S.game = g; S.flip = false; S.mode = mode; S.me = 'w'; S.tc = ''; S.view = null; S.report = null; S.thinking = false;
    const r = g.getHeaders().Result; S.result = r || '*'; S.note = ''; S.sel = null; S.targets = [];
    if (mode === 'review' && g.isGameOver()) { S.mode = 'review'; }
    banner(''); render();
  } catch (e) { alert('Không đọc được PGN: ' + e.message); }
}
function downloadPgn() {
  if (S.mode === 'play') headers();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([S.game.pgn()], { type: 'application/x-chess-pgn' }));
  a.download = `co-vua-${new Date().toISOString().slice(0, 10)}.pgn`; a.click(); URL.revokeObjectURL(a.href);
}
function showHistory() {
  const box = $('histList'), h = load('cc.history', []); box.textContent = '';
  if (!h.length) box.textContent = 'Chưa có ván nào. Hoàn thành một ván để lưu tại đây.';
  h.forEach((x) => {
    const w = x.result === '1/2-1/2' ? 'Hòa' : (x.result === '1-0') === (x.me === 'w') ? 'Thắng' : 'Thua';
    const row = document.createElement('div'); row.className = 'hrow';
    row.innerHTML = `<span>${new Date(x.t).toLocaleString('vi-VN')}<br>${w} · AI Elo ${x.elo} · ${x.me === 'w' ? 'Trắng' : 'Đen'} · ${Math.ceil(x.plies / 2)} nước · ${fmt(x.secs * 1000)}${x.tc ? ' · ' + x.tc : ''}</span>`;
    const b = document.createElement('button'); b.textContent = 'Xem lại'; b.onclick = () => { $('histDlg').close(); openPgn(x.pgn, 'review'); }; row.append(b); box.append(row);
  });
  $('histDlg').showModal();
}

// ---------- khởi động ----------
for (const e of ELOS) $('eloSel').add(new Option(`${e} Elo`, e));
$('eloSel').value = cfg.elo; $('colorSel').value = cfg.color; $('tcSel').value = cfg.tc; $('practiceChk').checked = cfg.practice;
const applyTheme = () => { document.documentElement.dataset.theme = cfg.theme; document.documentElement.dataset.board = cfg.board; $('themeBtn').textContent = cfg.theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'; $('boardSel').value = cfg.board; save('cc.settings', cfg); };
$('themeBtn').onclick = () => { cfg.theme = cfg.theme === 'dark' ? 'light' : 'dark'; applyTheme(); };
$('boardSel').onchange = (e) => { cfg.board = e.target.value; applyTheme(); };
const openSetup = () => $('setup').showModal();
$('newBtn').onclick = openSetup;
$('goBtn').onclick = (e) => { e.preventDefault(); $('setup').close(); start({ elo: +$('eloSel').value, color: $('colorSel').value, tc: $('tcSel').value, practice: $('practiceChk').checked }); };
$('replayBtn').onclick = () => start({ ...cfg }, S.me);
$('undoBtn').onclick = undo;
$('resignBtn').onclick = () => { if (S.mode === 'play' && confirm('Bạn chắc chắn muốn xin thua?')) finish(S.me === 'w' ? '0-1' : '1-0', 'Bạn đã xin thua'); };
$('analyzeBtn').onclick = analyze;
$('contBtn').onclick = () => { S.me = S.game.turn(); S.mode = 'play'; S.t0 = Date.now(); S.practice = true; render(); };
const go = (v) => { const n = hist().length; S.view = v === null || v >= n ? null : Math.max(0, v); S.sel = null; S.targets = []; render(); };
$('firstBtn').onclick = () => hist().length && go(0); $('prevBtn').onclick = () => hist().length && go((S.view ?? hist().length) - 1);
$('nextBtn').onclick = () => S.view !== null && go(S.view + 1); $('lastBtn').onclick = () => go(null);
$('flipBtn').onclick = () => { S.flip = !S.flip; S.sel = null; S.targets = []; render(); };
$('resNew').onclick = () => { $('resDlg').close(); openSetup(); };
$('resAnalyze').onclick = () => { $('resDlg').close(); if (!$('analyzeBtn').disabled) analyze(); };
document.addEventListener('keydown', (e) => { if (document.querySelector('dialog[open]') || /TEXTAREA|SELECT|INPUT/.test(e.target.tagName)) return; if (e.key === 'ArrowLeft') $('prevBtn').click(); else if (e.key === 'ArrowRight') $('nextBtn').click(); });
$('pgnBtn').onclick = downloadPgn;
$('importBtn').onclick = () => { $('pgnTitle').textContent = 'Nhập PGN'; $('pgnText').value = ''; $('pgnGo').textContent = 'Tải ván này'; $('pgnDlg').showModal(); };
$('pgnGo').onclick = () => { const t = $('pgnText').value.trim(); if (t) { $('pgnDlg').close(); openPgn(t, 'review'); } };
$('pgnClose').onclick = () => $('pgnDlg').close();
$('histBtn').onclick = showHistory; $('histClose').onclick = () => $('histDlg').close();
$('histClear').onclick = () => { save('cc.history', []); showHistory(); };
applyTheme(); render();

(async () => {
  $('goBtn').disabled = true;
  if (location.protocol === 'file:' && !globalThis.__SF_URL) { banner('Không thể tải engine khi mở trực tiếp file. Hãy chạy máy chủ cục bộ: python3 -m http.server 8000, rồi mở http://localhost:8000'); $('status').textContent = 'Engine chưa sẵn sàng.'; return; }
  try {
    engine = new Engine(workerTransport(globalThis.__SF_URL || 'engine/stockfish-19-lite-single.js')); await engine.init();
    $('goBtn').disabled = false; renderInfo(); renderButtons(); openSetup();
  } catch (e) { banner('Không tải được engine Stockfish: ' + e.message + '. Kiểm tra thư mục engine/ và chạy qua máy chủ cục bộ.'); $('status').textContent = 'Engine chưa sẵn sàng.'; }
})();
