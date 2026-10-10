// app.js — menu chính, ván cờ vua chuẩn (đấu Stockfish / chơi với bạn), điều hướng giữa các màn hình.
import { Chess } from '../lib/chess.js';
import { Engine, workerTransport, ELOS } from './ai.js';
import { BoardView } from './board.js';
import { pieceSvg, ensureDefs } from './pieces.js';
import { $, load, save, cfg, saveCfg, fmt, banner, sfx, initSettings, show, onView, onTheme, msg } from './ui.js';
import { initStudio, openStudio } from './studio.js';

ensureDefs();
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const S = { flip: false, game: new Chess(), mode: 'idle', pvp: false, names: { w: 'Trắng', b: 'Đen' }, autoFlip: false, me: 'w', elo: cfg.elo, tc: '', inc: 0, practice: false, view: null,
  sel: null, targets: [], thinking: false, token: 0, atoken: 0, analyzing: false, clocks: { w: 0, b: 0 }, ts: 0, t0: 0, result: '*', note: '', report: null };
let engine = null, enginePromise = null;
const view = new BoardView($('board')).on({ press: (x, y) => press(x, y), drop: (fx, fy, tx, ty) => drop(fx, fy, tx, ty) });
view.configure({ w: 8, h: 8 });

// ---------- tiện ích ----------
const sqOf = (x, y) => 'abcdefgh'[x] + (y + 1);
const xyOf = (s) => [s.charCodeAt(0) - 97, +s[1] - 1];
const bottom = () => (S.pvp ? (S.flip ? 'b' : 'w') : ((S.me === 'b') !== S.flip ? 'b' : 'w'));
const hist = () => S.game.history({ verbose: true });
const fenAt = (v) => { if (v === null) return S.game.fen(); const h = hist(); return v === 0 ? (h[0]?.before ?? S.game.fen()) : h[v - 1].after; };
// bên được phép đi ngay bây giờ (null nếu bàn đang khóa)
const mine = () => (S.mode !== 'play' || S.view !== null || S.thinking ? null : S.pvp ? S.game.turn() : S.game.turn() === S.me && engine?.ready ? S.me : null);
const canPlay = () => mine() !== null;
const mating = (g, c) => { let m = 0; for (const row of g.board()) for (const p of row) if (p && p.color === c && p.type !== 'k') { if ('pqr'.includes(p.type)) return true; m++; } return m >= 2; };
const nameOf = (c) => (S.pvp ? S.names[c] : c === S.me ? 'Bạn' : 'Stockfish');

// ---------- engine (tải khi cần) ----------
function ensureEngine() {
  if (engine?.ready) return Promise.resolve(engine);
  if (enginePromise) return enginePromise;
  if (location.protocol === 'file:' && !globalThis.__SF_URL) {
    banner('Không thể tải engine khi mở trực tiếp file. Hãy chạy máy chủ cục bộ: python3 -m http.server 8000, rồi mở http://localhost:8000');
    return Promise.reject(new Error('file://'));
  }
  enginePromise = (async () => {
    const e = new Engine(workerTransport(globalThis.__SF_URL || 'engine/stockfish-19-lite-single.js')); await e.init(); engine = e; renderInfo(); renderButtons(); return e;
  })().catch((e) => { enginePromise = null; banner('Không tải được engine Stockfish: ' + e.message + '. Kiểm tra thư mục engine/ và chạy qua máy chủ cục bộ.'); throw e; });
  return enginePromise;
}

// ---------- bàn cờ ----------
function pieceList(g) {
  const out = [], m = mine();
  for (const row of g.board()) for (const p of row) if (p) { const [x, y] = xyOf(p.square); out.push({ x, y, html: pieceSvg(p.type, p.color, cfg.pieces), cls: p.color, canMove: p.color === m }); }
  return out;
}
function marks() {
  const g = new Chess(fenAt(S.view)), h = hist(), live = S.view === null, last = h[(S.view ?? h.length) - 1];
  let check = null;
  if (g.inCheck()) for (const row of g.board()) for (const p of row) if (p && p.type === 'k' && p.color === g.turn()) check = xyOf(p.square);
  return { sel: S.sel ? xyOf(S.sel) : null, check, last: last ? [xyOf(last.from), xyOf(last.to)] : [],
    targets: live ? S.targets.map((t) => ({ ...(([x, y]) => ({ x, y }))(xyOf(t)), cap: !!S.game.get(t) || (S.game.get(S.sel)?.type === 'p' && t[0] !== S.sel[0] && !S.game.get(t)) })) : [] };
}
const paintMarks = () => view.setMarks(marks());
function render(moves = []) {
  view.setFlip(bottom() === 'b');
  view.setPieces(pieceList(new Chess(fenAt(S.view))), cfg.anim ? moves : []);
  paintMarks(); renderMoves(); renderInfo(); renderClocks(); renderButtons();
}
function select(sq) { S.sel = sq; S.targets = sq ? S.game.moves({ square: sq, verbose: true }).map((m) => m.to) : []; paintMarks(); }

// nhấn xuống một ô: chọn quân / đi quân. Trả về true nếu quân có thể kéo.
function press(x, y) {
  const m = mine(); if (!m) return false;
  const sq = sqOf(x, y), p = S.game.get(sq);
  if (S.sel && S.targets.includes(sq)) { tryMove(S.sel, sq); return false; }
  if (p && p.color === m) { select(sq); return true; }
  select(null); return false;
}
function drop(fx, fy, tx, ty) {
  const from = sqOf(fx, fy), to = sqOf(tx, ty);
  if (!canPlay() || S.sel !== from || !S.targets.includes(to)) { select(null); return false; }
  tryMove(from, to); return true;
}
async function tryMove(from, to) {
  const ms = S.game.moves({ square: from, verbose: true }).filter((m) => m.to === to);
  if (!ms.length) return;
  let promo;
  if (ms[0].promotion) { promo = await askPromo(S.game.turn()); if (!promo) { select(null); render(); return; } }
  doMove(from, to, promo);
}
function askPromo(color) {
  return new Promise((res) => {
    const box = $('promoBtns'); box.textContent = ''; let done = false;
    for (const t of 'qrbn') { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span class="pc ${color}">${pieceSvg(t, color, cfg.pieces)}</span>`; b.onclick = () => { done = true; $('promo').close(); res(t); }; box.append(b); }
    $('promo').onclose = () => { if (!done) res(null); };
    $('promo').showModal();
  });
}

// ---------- luồng ván cờ ----------
function animFor(m) {
  const mv = [{ from: xyOf(m.from), to: xyOf(m.to) }], r = m.color === 'w' ? '1' : '8';
  if (m.flags.includes('k')) mv.push({ from: xyOf('h' + r), to: xyOf('f' + r) });
  if (m.flags.includes('q')) mv.push({ from: xyOf('a' + r), to: xyOf('d' + r) });
  return mv;
}
function doMove(from, to, promotion) {
  const mover = S.game.turn();
  let m; try { m = S.game.move({ from, to, promotion }); } catch { m = null; }
  if (!m) return null;
  if (S.tc) { S.clocks[mover] += S.inc * 1000; S.ts = Date.now(); }
  S.sel = null; S.targets = []; S.view = null; S.report = null;
  sfx(S.game.inCheck() ? 'check' : m.captured ? 'capture' : 'move');
  render(animFor(m));
  if (!endIfOver()) {
    if (S.pvp) { if (S.autoFlip) { const tk = ++S.flipTk; setTimeout(() => { if (tk === S.flipTk && S.mode === 'play' && S.view === null) { S.flip = S.game.turn() === 'b'; render(); } }, 520); } }
    else if (S.game.turn() !== S.me) aiMove();
  }
  return m;
}
S.flipTk = 0;
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
  const m = doMove(u.slice(0, 2), u.slice(2, 4), u[4]);
  if (!m) { // không được xảy ra; nếu có thì báo lỗi rõ ràng và chọn nước hợp lệ đầu tiên
    banner('Engine trả về nước không hợp lệ (' + u + '). Đã chọn nước hợp lệ đầu tiên.');
    const f = S.game.moves({ verbose: true })[0]; doMove(f.from, f.to, f.promotion);
  }
}
function finish(result, reason) {
  S.mode = 'over'; S.result = result; S.note = reason; S.token++; S.flipTk++; S.thinking = false; engine?.stop();
  const secs = Math.round((Date.now() - S.t0) / 1000), g = S.game;
  headers(); g.setHeader('Result', result);
  const h = load('cc.history', []);
  h.unshift({ t: Date.now(), result, reason, elo: S.elo, me: S.me, tc: S.tc, pvp: S.pvp, names: S.names, plies: g.history().length, secs, pgn: g.pgn() });
  save('cc.history', h.slice(0, 50)); sfx('end'); render();
  const w = result === '1/2-1/2' ? 'Hòa' : S.pvp ? `${S.names[result === '1-0' ? 'w' : 'b']} thắng!` : (result === '1-0') === (S.me === 'w') ? 'Bạn thắng!' : 'Bạn thua';
  $('resTitle').textContent = w; $('resNote').textContent = `${reason} (${result}) · ${Math.ceil(g.history().length / 2)} nước`; $('resDlg').showModal();
}
function headers() {
  const g = S.game, ai = `Stockfish (Elo mục tiêu ${S.elo})`;
  g.setHeader('Event', S.pvp ? 'Cờ vua – hai người' : 'Cờ vua vs Stockfish'); g.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
  g.setHeader('White', S.pvp ? S.names.w : S.me === 'w' ? 'Bạn' : ai); g.setHeader('Black', S.pvp ? S.names.b : S.me === 'b' ? 'Bạn' : ai);
  if (S.tc) g.setHeader('TimeControl', S.tc.split('+').map((x, i) => (i ? x : +x * 60)).join('+'));
}
function start(o, keepColor) {
  S.token++; S.atoken++; S.flipTk++; S.analyzing = false; engine?.stop();
  Object.assign(cfg, o.pvp ? { tc: o.tc } : o); saveCfg();
  S.game = new Chess(); S.flip = false; S.mode = 'play'; S.view = null; S.sel = null; S.targets = []; S.thinking = false; S.report = null; S.result = '*'; S.note = '';
  S.pvp = !!o.pvp; S.autoFlip = !!o.autoFlip; S.names = o.names || { w: 'Trắng', b: 'Đen' };
  S.elo = +(o.elo || cfg.elo); S.practice = !!o.practice; S.tc = o.tc;
  S.me = S.pvp ? 'w' : keepColor || (o.color === 'r' ? (Math.random() < .5 ? 'w' : 'b') : o.color);
  const [mn, inc] = o.tc ? o.tc.split('+').map(Number) : [0, 0];
  S.clocks = { w: mn * 60000, b: mn * 60000 }; S.inc = inc || 0; S.ts = Date.now(); S.t0 = Date.now();
  $('sideHead').textContent = S.pvp ? 'Chơi với bạn' : 'Chơi với máy';
  banner(''); headers(); view.clearUserMarks(); view.clearPieces(); render(); sfx('start');
  if (!S.pvp && S.game.turn() !== S.me) aiMove();
}
function undo() {
  if (S.mode !== 'play' || !(S.practice || S.pvp) || !hist().length) return;
  S.token++; S.thinking = false; engine?.stop(); S.flipTk++;
  S.game.undo(); if (!S.pvp && S.game.turn() !== S.me && hist().length) S.game.undo();
  S.view = null; S.sel = null; S.targets = []; if (S.pvp && S.autoFlip) S.flip = S.game.turn() === 'b';
  render();
  if (!S.pvp && S.game.turn() !== S.me) aiMove();
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
const HUMAN = '<svg viewBox="0 0 45 45"><circle cx="22.5" cy="16" r="7"/><path d="M9 38c0-9 6-13 13.500-13S36 29 36 38z"/></svg>';
function renderPlayers() {
  const bt = bottom(), have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } }, start0 = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  for (const row of new Chess(fenAt(S.view)).board()) for (const p of row) if (p && p.type !== 'k') have[p.color][p.type]++;
  const score = (c) => Object.keys(VAL).reduce((a, t) => a + VAL[t] * have[c][t], 0);
  for (const [el, c] of [[$('topPlayer'), bt === 'w' ? 'b' : 'w'], [$('botPlayer'), bt]]) {
    const o = c === 'w' ? 'b' : 'w', rev = S.mode === 'review', human = S.pvp || c === S.me;
    el.querySelector('.name').textContent = rev ? (c === 'w' ? 'Trắng' : 'Đen') : S.pvp ? S.names[c] : human ? 'Bạn' : 'Stockfish';
    el.querySelector('.elo').textContent = rev || human ? '' : `(Elo ${S.elo} ước lượng)`;
    el.querySelector('.av').innerHTML = human || rev ? HUMAN : pieceSvg('n', 'b', cfg.pieces);
    el.querySelector('.av').dataset.side = c;
    let cap = ''; for (const t of 'qrbnp') for (let i = 0; i < Math.max(0, start0[t] - have[o][t]); i++) cap += `<span class="pc ${o}">${pieceSvg(t, o, cfg.pieces)}</span>`;
    const d = score(c) - score(o); el.querySelector('.cap').innerHTML = cap + (d > 0 ? `<b>+${d}</b>` : '');
  }
}
function renderInfo() {
  renderPlayers();
  const g = S.game; let t;
  const needEngine = !S.pvp && S.mode !== 'review';
  if (needEngine && !engine?.ready && S.mode === 'play') t = $('banner').textContent ? 'Engine chưa sẵn sàng.' : 'Đang tải engine…';
  else if (S.mode === 'idle') t = 'Chọn "Ván mới" để bắt đầu.';
  else if (S.mode === 'over') { const w = S.result === '1/2-1/2' ? 'Hòa' : S.pvp ? `${S.names[S.result === '1-0' ? 'w' : 'b']} thắng` : (S.result === '1-0') === (S.me === 'w') ? 'Bạn thắng' : 'Bạn thua'; t = `${w} (${S.result}) — ${S.note}`; }
  else if (S.mode === 'review') t = `Ván nhập từ PGN: ${hist().length} nước.`;
  else if (S.pvp) t = `Đến lượt ${S.names[g.turn()]} (${g.turn() === 'w' ? 'Trắng' : 'Đen'})` + (g.inCheck() ? ' — đang bị chiếu!' : '');
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
  const canUndo = S.mode === 'play' && (S.practice || S.pvp) && n;
  $('undoBtn').disabled = !canUndo; $('undoBtn').hidden = !S.practice && !S.pvp && S.mode === 'play';
  $('resignBtn').disabled = S.mode !== 'play'; $('replayBtn').disabled = S.mode === 'idle';
  $('drawBtn').hidden = !(S.pvp && S.mode === 'play');
  $('analyzeBtn').disabled = !(n && over && !S.analyzing); $('pgnBtn').disabled = !n;
  for (const id of ['firstBtn', 'prevBtn', 'nextBtn', 'lastBtn']) $(id).disabled = !n;
  $('contBtn').hidden = !(S.mode === 'review' && !S.game.isGameOver());
  $('report').hidden = !S.report; if (S.report) $('report').innerHTML = S.report;
}

// ---------- phân tích sau ván ----------
async function analyze() {
  try { await ensureEngine(); } catch { return; }
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
    if (loss < 70 || (!S.pvp && m.color !== S.me && S.mode === 'over')) return;
    const kind = loss >= 300 ? 'Sai lầm nghiêm trọng' : loss >= 150 ? 'Sai lầm' : 'Thiếu chính xác';
    loss >= 300 ? bl++ : loss >= 150 ? mi++ : ina++;
    let alt = ''; try { const b = best[i]; if (b && b !== m.lan) alt = new Chess(fens[i]).move({ from: b.slice(0, 2), to: b.slice(2, 4), promotion: b[4] }).san; } catch { /* bỏ qua */ }
    rows.push(`<p><span class="bad">${kind}</span> — nước ${Math.floor(i / 2) + 1}${m.color === 'w' ? '.' : '...'} <b>${m.san}</b> (mất ≈${loss} centipawn)${alt ? `; nên cân nhắc <b>${alt}</b>` : ''}</p>`);
  });
  S.analyzing = false;
  S.report = `<p><b>Tổng quan${S.pvp ? ' (cả hai bên)' : ' (các nước của bạn)'}:</b> ${bl} sai lầm nghiêm trọng, ${mi} sai lầm, ${ina} thiếu chính xác.</p>${rows.join('') || '<p>Không phát hiện nước đi nào mất từ 70 centipawn trở lên.</p>'}<p class="note">Độ sâu 12 / tối đa 300 ms mỗi thế. 100 centipawn ≈ 1 tốt; đây không phải xác suất thắng.</p>`;
  renderInfo(); renderButtons();
}

// ---------- PGN & lịch sử ----------
function openPgn(text, mode) {
  try {
    const g = new Chess(); g.loadPgn(text);
    S.token++; S.atoken++; S.flipTk++; engine?.stop(); S.analyzing = false;
    S.game = g; S.flip = false; S.mode = mode; S.pvp = false; S.me = 'w'; S.tc = ''; S.view = null; S.report = null; S.thinking = false;
    const r = g.getHeaders().Result; S.result = r || '*'; S.note = ''; S.sel = null; S.targets = [];
    $('sideHead').textContent = 'Xem lại ván cờ';
    show('game'); banner(''); view.clearPieces(); view.clearUserMarks(); render();
  } catch (e) { msg('Không đọc được PGN: ' + e.message); }
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
    const w = x.result === '1/2-1/2' ? 'Hòa' : x.pvp ? `${x.names?.[x.result === '1-0' ? 'w' : 'b'] || '?'} thắng` : (x.result === '1-0') === (x.me === 'w') ? 'Thắng' : 'Thua';
    const who = x.pvp ? `${x.names?.w || 'Trắng'} – ${x.names?.b || 'Đen'}` : `AI Elo ${x.elo} · ${x.me === 'w' ? 'Trắng' : 'Đen'}`;
    const row = document.createElement('div'); row.className = 'hrow';
    const info = document.createElement('span');
    info.append(new Date(x.t).toLocaleString('vi-VN'), document.createElement('br'), `${w} · ${who} · ${Math.ceil(x.plies / 2)} nước · ${fmt(x.secs * 1000)}${x.tc ? ' · ' + x.tc : ''}`);
    row.append(info);
    const b = document.createElement('button'); b.textContent = 'Xem lại'; b.onclick = () => { $('histDlg').close(); openPgn(x.pgn, 'review'); }; row.append(b); box.append(row);
  });
  $('histDlg').showModal();
}

// ---------- vào các chế độ ----------
function openBot() {
  show('game'); $('sideHead').textContent = 'Chơi với máy';
  if (S.mode === 'idle' || S.mode === 'review') { S.pvp = false; view.clearPieces(); render(); }
  $('goBtn').disabled = !engine?.ready; $('goBtn').textContent = engine?.ready ? 'Bắt đầu' : 'Đang tải engine…';
  $('setup').showModal();
  ensureEngine().then(() => { $('goBtn').disabled = false; $('goBtn').textContent = 'Bắt đầu'; }).catch(() => { $('goBtn').textContent = 'Engine chưa sẵn sàng'; });
}
function openFriend() {
  show('game'); $('sideHead').textContent = 'Chơi với bạn';
  if (S.mode === 'idle' || S.mode === 'review') { S.pvp = true; view.clearPieces(); render(); }
  $('friendDlg').showModal();
}
const leaveGame = () => {
  if (S.mode === 'play' && hist().length > 1 && !confirm('Rời khỏi ván đang chơi? Ván này sẽ không được lưu.')) return false;
  if (S.mode === 'play') { S.mode = 'idle'; S.token++; S.flipTk++; engine?.stop(); S.thinking = false; }
  return true;
};
export function goMenu() { show('menu'); }

// ---------- khởi động ----------
for (const e of ELOS) $('eloSel').add(new Option(`${e} Elo`, e));
$('eloSel').value = cfg.elo; $('colorSel').value = cfg.color; $('tcSel').value = cfg.tc; $('practiceChk').checked = cfg.practice;
initSettings();
$('newBtn').onclick = () => (S.pvp ? openFriend() : openBot());
$('goBtn').onclick = (e) => { e.preventDefault(); $('setup').close(); start({ elo: +$('eloSel').value, color: $('colorSel').value, tc: $('tcSel').value, practice: $('practiceChk').checked }); };
$('setupCancel').onclick = () => { $('setup').close(); if (S.mode === 'idle') show('menu'); };
$('friendGo').onclick = (e) => {
  e.preventDefault(); $('friendDlg').close();
  start({ pvp: true, names: { w: $('nameW').value.trim() || 'Trắng', b: $('nameB').value.trim() || 'Đen' }, tc: $('ftcSel').value, autoFlip: $('autoFlipChk').checked });
};
$('friendCancel').onclick = () => { $('friendDlg').close(); if (S.mode === 'idle') show('menu'); };
$('replayBtn').onclick = () => start(S.pvp ? { pvp: true, names: S.names, tc: S.tc, autoFlip: S.autoFlip } : { ...cfg, practice: S.practice, tc: S.tc, elo: S.elo }, S.pvp ? undefined : S.me);
$('undoBtn').onclick = undo;
$('resignBtn').onclick = () => {
  if (S.mode !== 'play') return;
  const who = S.pvp ? S.game.turn() : S.me;
  if (confirm(S.pvp ? `${S.names[who]} xin thua?` : 'Bạn chắc chắn muốn xin thua?')) finish(who === 'w' ? '0-1' : '1-0', S.pvp ? `${S.names[who]} xin thua` : 'Bạn đã xin thua');
};
$('drawBtn').onclick = () => { if (S.mode === 'play' && confirm('Cả hai người chơi đồng ý hòa?')) finish('1/2-1/2', 'Hai bên đồng ý hòa'); };
$('analyzeBtn').onclick = analyze;
$('contBtn').onclick = async () => { try { await ensureEngine(); } catch { return; } S.pvp = false; S.me = S.game.turn(); S.mode = 'play'; S.t0 = Date.now(); S.practice = true; $('sideHead').textContent = 'Chơi với máy'; render(); };
const go = (v, anim = true) => {
  const n = hist().length, old = S.view ?? n, nv = v === null || v >= n ? null : Math.max(0, v), nn = nv ?? n; let mv = [];
  if (anim && Math.abs(nn - old) === 1) { const m = hist()[Math.max(nn, old) - 1]; mv = nn > old ? animFor(m) : [{ from: xyOf(m.to), to: xyOf(m.from) }]; }
  S.view = nv; S.sel = null; S.targets = []; render(mv);
};
$('firstBtn').onclick = () => hist().length && go(0); $('prevBtn').onclick = () => hist().length && go((S.view ?? hist().length) - 1);
$('nextBtn').onclick = () => S.view !== null && go(S.view + 1); $('lastBtn').onclick = () => go(null);
$('flipBtn').onclick = () => { S.flip = !S.flip; S.sel = null; S.targets = []; render(); };
$('resNew').onclick = () => { $('resDlg').close(); S.pvp ? openFriend() : openBot(); };
$('resMenu').onclick = () => { $('resDlg').close(); show('menu'); };
$('resAnalyze').onclick = () => { $('resDlg').close(); if (!$('analyzeBtn').disabled) analyze(); };
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || /TEXTAREA|SELECT|INPUT/.test(e.target.tagName) || e.ctrlKey || e.metaKey) return;
  const cur = document.documentElement.dataset.view;
  if (cur === 'game') { if (e.key === 'ArrowLeft') $('prevBtn').click(); else if (e.key === 'ArrowRight') $('nextBtn').click(); else if (e.key === 'f' || e.key === 'F') $('flipBtn').click(); }
  else if (cur === 'cgame') { if (e.key === 'ArrowLeft') $('cPrev').click(); else if (e.key === 'ArrowRight') $('cNext').click(); else if (e.key === 'f' || e.key === 'F') $('cFlip').click(); }
});
$('pgnBtn').onclick = downloadPgn;
const openImport = () => { $('pgnTitle').textContent = 'Nhập PGN'; $('pgnText').value = ''; $('pgnGo').textContent = 'Tải ván này'; $('pgnDlg').showModal(); };
$('importBtn').onclick = openImport; $('menuImport').onclick = openImport;
$('pgnGo').onclick = () => { const t = $('pgnText').value.trim(); if (t) { $('pgnDlg').close(); openPgn(t, 'review'); } };
$('pgnClose').onclick = () => $('pgnDlg').close();
$('histBtn').onclick = showHistory; $('menuHist').onclick = showHistory; $('histClose').onclick = () => $('histDlg').close();
$('histClear').onclick = () => { save('cc.history', []); showHistory(); };
$('menuBtn').onclick = () => { if (leaveGame()) show('menu'); };
$('homeBtn').onclick = () => { if (document.documentElement.dataset.view === 'game' && !leaveGame()) return; show('menu'); };
$('backBtn').onclick = () => $('homeBtn').click();
$('goBot').onclick = openBot; $('goFriend').onclick = openFriend; $('goStudio').onclick = () => openStudio();
// bấm nền hộp thoại để đóng (trừ hộp thoại bắt buộc chọn)
for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', (e) => { if (e.target === d && ['settingsDlg', 'histDlg', 'libDlg', 'pgnDlg'].includes(d.id)) d.close(); });

// ---------- bàn cờ trang trí ở menu: ván "Opera" (Morphy, 1858) tự chạy ----------
const demoView = new BoardView($('menuBoard')); demoView.configure({ w: 8, h: 8 }); $('menuBoard').classList.add('static');
const OPERA = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' ');
let demo = { g: new Chess(), i: 0, timer: null };
const demoList = (g) => g.board().flat().filter(Boolean).map((p) => ({ x: xyOf(p.square)[0], y: xyOf(p.square)[1], html: pieceSvg(p.type, p.color, cfg.pieces), cls: p.color }));
const demoPaint = (mv = [], instant = false) => demoView.setPieces(demoList(demo.g), cfg.anim ? mv : [], { instant });
function demoStep() {
  if (demo.i >= OPERA.length) { demo.i = 0; demo.g = new Chess(); demoPaint([], true); demoView.setMarks({}); return; }
  const m = demo.g.move(OPERA[demo.i++]); demoPaint(animFor(m));
  demoView.setMarks({ last: [xyOf(m.from), xyOf(m.to)] });
  if (demo.i >= OPERA.length) { clearInterval(demo.timer); demo.timer = setTimeout(() => { demo.timer = setInterval(demoStep, 1250); demoStep(); }, 3600); }
}
function demoRun(on) {
  clearInterval(demo.timer); clearTimeout(demo.timer); demo.timer = null;
  if (on) { demoPaint([], true); demo.timer = setInterval(demoStep, 1250); }
}
onView((v) => demoRun(v === 'menu'));
onTheme(() => { demoPaint([], true); if (S.mode !== 'idle' || document.documentElement.dataset.view === 'game') render(); });

initStudio({ goMenu });
render();
show('menu'); demoRun(true);
if (typeof window !== 'undefined') window.__chess = { S, view, get engine() { return engine; }, start, openPgn, show };
