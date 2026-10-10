// customgame.js — chơi một trò chơi tùy biến (do Custom Studio tạo): với bot hoặc với bạn cùng thiết bị.
import { Game } from './variant.js';
import { chooseFor, BOT_LEVELS } from './variant-ai.js';
import { BoardView } from './board.js';
import { customPieceSvg, drawingSvg } from './pieces.js';
import { $, cfg, fmt, sfx, show, onTheme } from './ui.js';

const C = { def: null, game: null, opp: 'bot', level: 3, me: 'w', flip: false, tc: '', inc: 0, clocks: { w: 0, b: 0 }, ts: 0, mode: 'idle', sel: null, targets: [], view: null,
  thinking: false, token: 0, practice: false, autoFlip: false, flipTk: 0, over: null, worker: null, reqId: 0 };
let hooks = {};
const view = new BoardView($('cBoard')).on({ press: (x, y) => press(x, y), drop: (fx, fy, tx, ty) => drop(fx, fy, tx, ty) });

const idx = (x, y) => y * C.game.w + x;
const xy = (i) => [i % C.game.w, (i / C.game.w) | 0];
const bottom = () => (C.opp === 'bot' ? ((C.me === 'b') !== C.flip ? 'b' : 'w') : (C.flip ? 'b' : 'w'));
const nameOf = (c) => (C.opp === 'friend' ? (c === 'w' ? 'Trắng' : 'Đen') : c === C.me ? 'Bạn' : `Bot (${BOT_LEVELS.find((l) => l.id === C.level)?.name || ''})`);
const mine = () => (C.mode !== 'play' || C.view !== null || C.thinking ? null : C.opp === 'friend' ? C.game.turn : C.game.turn === C.me ? C.me : null);

// Thế cờ tại nước thứ v (null = hiện tại)
function posAt(v) {
  if (v === null) return C.game;
  const g = new Game(C.def); for (let i = 0; i < v; i++) { const m = C.game.log[i]; g.play(m.from, m.to, m.promo); } return g;
}
const art = (t, c) => customPieceSvg(C.def.types[t - 1], c, cfg.pieces);

function paintMarks() {
  const g = posAt(C.view), live = C.view === null, last = C.game.log[(C.view ?? C.game.log.length) - 1];
  let check = null; const c = g.turn, sg = c === 'w' ? 1 : -1, en = c === 'w' ? 'b' : 'w';
  for (let i = 0; i < g.n; i++) { const v = g.board[i] * sg; if (v > 0 && g.royal[v] && g.attacked(i, en)) { check = xy(i); break; } }
  view.setMarks({ sel: C.sel !== null ? xy(C.sel) : null, check, last: last ? [xy(last.from), xy(last.to)] : [],
    targets: live ? [...new Set(C.targets.map((m) => m.to))].map((to) => ({ x: xy(to)[0], y: xy(to)[1], cap: !!C.game.board[to] })) : [] });
}
function render(moves = []) {
  const g = posAt(C.view), m = mine(), list = [];
  for (let i = 0; i < g.n; i++) { const v = g.board[i]; if (!v) continue; const t = Math.abs(v), c = v > 0 ? 'w' : 'b', [x, y] = xy(i); list.push({ x, y, html: art(t, c), cls: c, canMove: c === m }); }
  view.setFlip(bottom() === 'b'); view.setPieces(list, cfg.anim ? moves : []);
  paintMarks(); renderMoves(); renderPlayers(); renderStatus(); renderClocks(); renderButtons();
}

function select(i) { C.sel = i; C.targets = i === null ? [] : C.game.legal().filter((m) => m.from === i); paintMarks(); }
function press(x, y) {
  const m = mine(); if (!m) return false;
  const i = idx(x, y), v = C.game.board[i];
  if (C.sel !== null && C.targets.some((t) => t.to === i)) { tryMove(C.sel, i); return false; }
  if (v && (v > 0 ? 'w' : 'b') === m) { select(i); return true; }
  select(null); return false;
}
function drop(fx, fy, tx, ty) {
  const from = idx(fx, fy), to = idx(tx, ty);
  if (!mine() || C.sel !== from || !C.targets.some((t) => t.to === to)) { select(null); return false; }
  tryMove(from, to); return true;
}
async function tryMove(from, to) {
  const ch = C.game.promotionChoices(from, to); let promo = 0;
  if (ch.length === 1) promo = ch[0];
  else if (ch.length > 1) { promo = await askPromo(C.game.turn, ch); if (!promo) { select(null); render(); return; } }
  doMove(from, to, promo);
}
function askPromo(color, choices) {
  return new Promise((res) => {
    const box = $('promoBtns'); box.textContent = ''; let done = false;
    for (const t of choices) { const b = document.createElement('button'); b.type = 'button'; b.title = C.def.types[t - 1].name; b.innerHTML = `<span class="pc ${color}">${art(t, color)}</span>`; b.onclick = () => { done = true; $('promo').close(); res(t); }; box.append(b); }
    $('promo').onclose = () => { if (!done) res(0); };
    $('promo').showModal();
  });
}

function doMove(from, to, promo) {
  const mover = C.game.turn, cap = !!C.game.board[to], rec = C.game.play(from, to, promo);
  if (!rec) return null;
  if (C.tc) { C.clocks[mover] += C.inc * 1000; C.ts = Date.now(); }
  C.sel = null; C.targets = []; C.view = null;
  sfx(rec.text.endsWith('+') || rec.text.endsWith('#') ? 'check' : cap ? 'capture' : 'move');
  render([{ from: xy(from), to: xy(to) }]);
  const st = C.game.status();
  if (st.over) return finish(st.result, st.reason), rec;
  if (C.opp === 'friend') {
    if (C.autoFlip) { const tk = ++C.flipTk; setTimeout(() => { if (tk === C.flipTk && C.mode === 'play' && C.view === null) { C.flip = C.game.turn === 'b'; render(); } }, 520); }
  } else if (C.game.turn !== C.me) botMove();
  return rec;
}

// ---------- bot (Web Worker, có dự phòng chạy trực tiếp) ----------
function botMove() {
  const token = ++C.token; C.thinking = true; renderStatus(); renderButtons();
  const moves = C.game.log.map((m) => ({ from: m.from, to: m.to, promo: m.promo || 0 })), id = ++C.reqId;
  const done = (mv, err) => {
    if (token !== C.token) return; C.thinking = false;
    if (C.mode !== 'play') return renderStatus();
    if (err || !mv) { // dự phòng: nước hợp lệ đầu tiên
      const f = C.game.legal()[0]; if (f) doMove(f.from, f.to, f.promo || 0); return;
    }
    if (!doMove(mv.from, mv.to, mv.promo || 0)) { const f = C.game.legal()[0]; if (f) doMove(f.from, f.to, f.promo || 0); }
  };
  const sync = () => setTimeout(() => { try { done(chooseFor(C.def, moves, C.level)); } catch (e) { done(null, e); } }, 30);
  if (C.worker === false) return sync();
  try {
    if (!C.worker) {
      C.worker = new Worker(new URL('./variant-worker.js', import.meta.url), { type: 'module' });
      C.worker.onmessage = (e) => { const cb = C.pending?.[e.data.id]; if (cb) { delete C.pending[e.data.id]; cb(e.data); } };
      C.worker.onerror = () => { const p = C.pending; C.pending = {}; C.worker = false; for (const k in p) p[k]({ error: 'worker' }); };
      C.pending = {};
    }
    C.pending[id] = (d) => { if (d.error === 'worker') sync(); else done(d.move, d.error); };
    C.worker.postMessage({ id, def: C.def, moves, level: C.level });
  } catch { C.worker = false; sync(); }
}

function finish(result, reason) {
  C.mode = 'over'; C.over = { result, reason }; C.token++; C.flipTk++; C.thinking = false;
  sfx('end'); render();
  const w = result === 'd' ? 'Hòa' : C.opp === 'friend' ? `${nameOf(result)} thắng!` : result === C.me ? 'Bạn thắng!' : 'Bạn thua';
  $('cResTitle').textContent = w; $('cResNote').textContent = `${reason} · ${Math.ceil(C.game.log.length / 2)} nước`; $('cResDlg').showModal();
}

export function startCustom(def, o = {}) {
  C.token++; C.flipTk++;
  C.def = JSON.parse(JSON.stringify(def)); C.game = new Game(C.def); C.opp = o.opp || 'bot'; C.level = +o.level || 3; C.practice = !!o.practice; C.autoFlip = !!o.autoFlip;
  C.me = C.opp === 'friend' ? 'w' : o.color === 'r' ? (Math.random() < .5 ? 'w' : 'b') : o.color || 'w';
  C.opts = { ...o };
  C.tc = o.tc || ''; const [mn, inc] = C.tc ? C.tc.split('+').map(Number) : [0, 0]; C.clocks = { w: mn * 60000, b: mn * 60000 }; C.inc = inc || 0; C.ts = Date.now();
  C.mode = 'play'; C.flip = false; C.sel = null; C.targets = []; C.view = null; C.thinking = false; C.over = null;
  view.configure({ w: C.game.w, h: C.game.h, voids: C.def.voids || [], flip: false });
  applyBoardColors(); $('cHead').textContent = C.def.name || 'Ván tùy chỉnh';
  show('cgame'); render(); sfx('start');
  const st = C.game.status(); if (st.over) return finish(st.result, st.reason);
  if (C.opp === 'bot' && C.game.turn !== C.me) botMove();
}

function applyBoardColors() {
  const b = $('cBoard'); b.style.removeProperty('--lt'); b.style.removeProperty('--dk');
  if (C.def.light) b.style.setProperty('--lt', C.def.light); if (C.def.dark) b.style.setProperty('--dk', C.def.dark);
}

// ---------- thông tin ----------
function renderMoves() {
  const ol = $('cMoves'), log = C.game.log, cur = C.view ?? log.length; ol.textContent = '';
  // nếu Đen đi trước thì ô đầu của hàng 1 để trống
  const first = C.def.turn === 'b' ? 1 : 0, items = [...Array(first).fill(null), ...log];
  for (let i = 0; i < items.length; i += 2) {
    const li = document.createElement('li'); li.style.display = 'contents'; li.innerHTML = `<span class="n">${i / 2 + 1}.</span>`;
    for (const j of [i, i + 1]) {
      if (j >= items.length) break;
      const b = document.createElement('button'); b.type = 'button';
      if (items[j] === null) { b.textContent = '…'; b.disabled = true; } else { const ply = j - first + 1; b.textContent = items[j].text; b.className = ply === cur ? 'cur' : ''; b.onclick = () => { C.view = ply === log.length ? null : ply; C.sel = null; C.targets = []; render(); }; }
      li.append(b);
    }
    ol.append(li);
  }
  ol.scrollTop = ol.scrollHeight;
}
function renderPlayers() {
  const g = posAt(C.view), bt = bottom(), initial = { w: {}, b: {} };
  for (const s of C.def.setup || []) { const t = C.game.tIndex[s.t]; if (t) initial[s.c][t] = (initial[s.c][t] || 0) + 1; }
  const val = (c, miss) => Object.entries(miss).reduce((a, [t, n]) => a + n * (C.game.value[t] || 0), 0);
  const missing = { w: {}, b: {} };
  for (const c of ['w', 'b']) for (const [t, n] of Object.entries(initial[c])) { const lost = n - (g.cnt[c][t] || 0); if (lost > 0) missing[c][t] = lost; }
  for (const [el, c] of [[$('cTop'), bt === 'w' ? 'b' : 'w'], [$('cBot'), bt]]) {
    const o = c === 'w' ? 'b' : 'w'; el.querySelector('.name').textContent = nameOf(c); el.querySelector('.elo').textContent = '';
    el.querySelector('.av').innerHTML = c === C.me && C.opp === 'bot' || C.opp === 'friend' ? '<svg viewBox="0 0 45 45"><circle cx="22.5" cy="16" r="7"/><path d="M9 38c0-9 6-13 13.500-13S36 29 36 38z"/></svg>' : drawingSvg({ base: 'n', items: [] }, 'b', cfg.pieces);
    let cap = ''; for (const [t, n] of Object.entries(missing[o]).sort((a, b) => (C.game.value[b[0]] || 0) - (C.game.value[a[0]] || 0))) for (let i = 0; i < n; i++) cap += `<span class="pc ${o}">${art(+t, o)}</span>`;
    const diff = Math.round((val(c, missing[o]) - val(o, missing[c])) * 10) / 10;
    el.querySelector('.cap').innerHTML = cap + (diff > 0 ? `<b>+${diff}</b>` : '');
  }
}
function renderStatus() {
  let t;
  if (C.mode === 'over') t = (C.over.result === 'd' ? 'Hòa' : C.opp === 'friend' ? `${nameOf(C.over.result)} thắng` : C.over.result === C.me ? 'Bạn thắng' : 'Bạn thua') + ` — ${C.over.reason}`;
  else if (C.thinking) t = 'Bot đang suy nghĩ…';
  else { const g = C.game; t = (C.opp === 'friend' ? `Đến lượt ${nameOf(g.turn)}` : g.turn === C.me ? 'Đến lượt bạn' : 'Đến lượt bot') + (g.inCheck() ? ' — đang bị chiếu!' : ''); }
  $('cStatus').textContent = t;
}
function renderClocks() {
  const bt = bottom();
  for (const [el, c] of [[$('cTop'), bt === 'w' ? 'b' : 'w'], [$('cBot'), bt]]) {
    const k = el.lastElementChild; k.textContent = C.tc ? fmt(C.clocks[c]) : '';
    k.classList.toggle('on', C.mode === 'play' && C.game.turn === c); k.classList.toggle('low', !!C.tc && C.clocks[c] < 10000);
  }
}
function renderButtons() {
  const n = C.game.log.length, undoable = C.mode === 'play' && n && (C.opp === 'friend' || C.practice);
  $('cUndo').disabled = !undoable; $('cUndo').hidden = C.opp === 'bot' && !C.practice;
  $('cResign').disabled = C.mode !== 'play'; $('cDraw').hidden = C.opp !== 'friend'; $('cDraw').disabled = C.mode !== 'play';
  for (const id of ['cFirst', 'cPrev', 'cNext', 'cLast']) $(id).disabled = !n;
}

setInterval(() => {
  if (C.mode !== 'play' || !C.tc) return;
  const now = Date.now(), t = C.game.turn; C.clocks[t] -= now - C.ts; C.ts = now;
  if (C.clocks[t] <= 0) { C.clocks[t] = 0; return finish(t === 'w' ? 'b' : 'w', 'Hết giờ'); }
  renderClocks();
}, 100);

export function initCustomGame(h) {
  hooks = h;
  const go = (v) => {
    const n = C.game.log.length, old = C.view ?? n, nv = v === null || v >= n ? null : Math.max(0, v), nn = nv ?? n; let mv = [];
    if (Math.abs(nn - old) === 1) { const m = C.game.log[Math.max(nn, old) - 1]; mv = nn > old ? [{ from: xy(m.from), to: xy(m.to) }] : [{ from: xy(m.to), to: xy(m.from) }]; }
    C.view = nv; C.sel = null; C.targets = []; render(mv);
  };
  $('cFirst').onclick = () => C.game?.log.length && go(0); $('cPrev').onclick = () => C.game?.log.length && go((C.view ?? C.game.log.length) - 1);
  $('cNext').onclick = () => C.view !== null && go(C.view + 1); $('cLast').onclick = () => go(null);
  $('cFlip').onclick = () => { C.flip = !C.flip; C.sel = null; C.targets = []; render(); };
  $('cUndo').onclick = () => {
    if (!(C.mode === 'play' && C.game.log.length)) return;
    C.token++; C.thinking = false; C.flipTk++; C.game.undo();
    if (C.opp === 'bot' && C.game.turn !== C.me && C.game.log.length) C.game.undo();
    C.view = null; C.sel = null; C.targets = []; if (C.opp === 'friend' && C.autoFlip) C.flip = C.game.turn === 'b';
    render(); if (C.opp === 'bot' && C.game.turn !== C.me) botMove();
  };
  $('cResign').onclick = () => { if (C.mode !== 'play') return; const who = C.opp === 'friend' ? C.game.turn : C.me; if (confirm(`${nameOf(who)} xin thua?`)) finish(who === 'w' ? 'b' : 'w', `${nameOf(who)} xin thua`); };
  $('cDraw').onclick = () => { if (C.mode === 'play' && confirm('Cả hai người chơi đồng ý hòa?')) finish('d', 'Hai bên đồng ý hòa'); };
  $('cAgain').onclick = () => C.def && startCustom(C.def, C.opts);
  $('cStudio').onclick = () => { C.token++; C.mode = 'idle'; hooks.toStudio?.(); };
  $('cMenu').onclick = () => { if (C.mode === 'play' && C.game.log.length > 1 && !confirm('Rời khỏi ván đang chơi?')) return; C.token++; C.mode = 'idle'; hooks.goMenu?.(); };
  $('cResAgain').onclick = () => { $('cResDlg').close(); startCustom(C.def, C.opts); };
  $('cResStudio').onclick = () => { $('cResDlg').close(); hooks.toStudio?.(); };
  $('cResMenu').onclick = () => { $('cResDlg').close(); hooks.goMenu?.(); };
  onTheme(() => { if (C.game && document.documentElement.dataset.view === 'cgame') render(); });
}
export const customState = C;
