// studio.js — Custom Studio: tự chỉnh bàn cờ, vẽ quân, đặt cách di chuyển, bày quân và chơi thử.
import { BoardView } from './board.js';
import { DrawEditor } from './draw.js';
import { MoveEditor } from './moves.js';
import { customPieceSvg } from './pieces.js';
import { PRESETS, estimateValue } from './variant.js';
import { BOT_LEVELS } from './variant-ai.js';
import { newDef, normalizeDef, validateDef, cloneDef, exportJson, importJson, LIMITS } from './defs.js';
import { startCustom, initCustomGame } from './customgame.js';
import { $, cfg, load, save, show, msg, onTheme } from './ui.js';

const THEMES = { green: ['#ebecd0', '#739552'], brown: ['#edd6b0', '#b88762'], blue: ['#dee3e6', '#8ca2ad'], purple: ['#f0f1f0', '#8476ba'], gray: ['#dcdcdc', '#8b8b8b'] };
const ST = { def: null, tab: 'board', sel: null, color: 'w', tool: null, mirror: 'v', libId: null };
let view, hooks = {}, saveTimer = 0, draw = null, moves = null, inited = false;

const art = (t, c) => customPieceSvg(t, c, cfg.pieces);
const typeOf = (id) => ST.def.types.find((t) => t.id === id);
const idx = (x, y) => y * ST.def.w + x;
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const E = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => save('cc.studio', ST.def), 250); }
function touch(reconf = false) { persist(); paintBoard(reconf); }

// ---------- bàn cờ xem trước ----------
function boardColors() { return { light: ST.def.light || getComputedStyle(document.documentElement).getPropertyValue('--lt').trim() || '#ebecd0', dark: ST.def.dark || getComputedStyle(document.documentElement).getPropertyValue('--dk').trim() || '#739552' }; }
function paintBoard(reconf = false) {
  const d = ST.def, b = $('stBoard');
  if (reconf || view.w !== d.w || view.h !== d.h) view.configure({ w: d.w, h: d.h, voids: d.voids, flip: false });
  b.style.removeProperty('--lt'); b.style.removeProperty('--dk'); if (d.light) b.style.setProperty('--lt', d.light); if (d.dark) b.style.setProperty('--dk', d.dark);
  const list = d.setup.map((s) => ({ x: s.x, y: s.y, html: art(typeOf(s.t) || d.types[0], s.c), cls: s.c }));
  view.setPieces(list, [], { instant: true });
  view.setMarks({ sel: ST.tab === 'pieces' && ST.sel ? null : null });
  const hl = { board: 'Bấm hoặc rê chuột trên bàn để bật/tắt ô khuyết (ô không tồn tại).', pieces: 'Bấm vào một quân trên bàn để chỉnh sửa loại quân đó.', setup: 'Chọn quân ở bên phải, rồi bấm hoặc rê chuột trên bàn để đặt. Tẩy để xóa.', play: 'Kiểm tra lại thế cờ ban đầu, rồi bấm "Bắt đầu chơi".' };
  $('stHint').textContent = hl[ST.tab];
}
function press(x, y) {
  const d = ST.def, i = idx(x, y);
  if (ST.tab === 'board') {
    const at = d.voids.indexOf(i);
    if (at >= 0) d.voids.splice(at, 1); else { d.voids.push(i); d.setup = d.setup.filter((s) => idx(s.x, s.y) !== i); }
    touch(true);
  } else if (ST.tab === 'setup') place(x, y);
  else if (ST.tab === 'pieces') { const s = d.setup.find((q) => q.x === x && q.y === y); if (s && s.t !== ST.sel) { ST.sel = s.t; renderPanel(); } }
  return false;
}

// ---------- đặt quân ----------
function putOne(x, y, c, t) {
  const d = ST.def; if (x < 0 || y < 0 || x >= d.w || y >= d.h || d.voids.includes(idx(x, y))) return;
  d.setup = d.setup.filter((s) => !(s.x === x && s.y === y));
  if (t) d.setup.push({ t, c, x, y });
}
function place(x, y) {
  const d = ST.def, t = ST.tool === 'erase' ? null : ST.tool; if (ST.tool === null) return;
  putOne(x, y, ST.color, t);
  const mx = ST.mirror === 'v' ? x : ST.mirror === 'r' ? d.w - 1 - x : null, my = d.h - 1 - y;
  if (mx !== null && !(mx === x && my === y)) putOne(mx, my, ST.color === 'w' ? 'b' : 'w', t);
  touch();
}

// ---------- chọn tab & dựng bảng điều khiển ----------
function setTab(t) {
  ST.tab = t; $$('#stTabs button').forEach((b) => { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t); });
  renderPanel(); paintBoard();
}
function renderPanel() {
  const p = $('stPanel'); p.textContent = ''; draw = moves = null;
  ({ board: boardPanel, pieces: piecesPanel, setup: setupPanel, play: playPanel })[ST.tab](p);
}
const num = (min, max, v, k) => `<input type="number" min="${min}" max="${max}" value="${v}" data-k="${k}">`;

function boardPanel(p) {
  const d = ST.def;
  p.append(E(`<div class="card"><h3>Kích thước bàn</h3>
    <div class="row2"><label class="inl">Chiều rộng ${num(LIMITS.minSize, LIMITS.maxSize, d.w, 'w')}</label><label class="inl">Chiều cao ${num(LIMITS.minSize, LIMITS.maxSize, d.h, 'h')}</label></div>
    <p class="note">Từ ${LIMITS.minSize} đến ${LIMITS.maxSize} ô mỗi chiều. Quân Đen sẽ bám theo cạnh trên khi đổi chiều cao.</p></div>`));
  p.append(E(`<div class="card"><h3>Màu bàn cờ</h3>
    <div class="themes">${Object.entries(THEMES).map(([k, [l, dk]]) => `<button type="button" class="thm" data-th="${k}" title="${k}" style="background:linear-gradient(135deg,${l} 50%,${dk} 50%)"></button>`).join('')}<button type="button" class="thm auto" data-th="" title="Theo giao diện chung">Tự động</button></div>
    <div class="row2"><label class="inl">Ô sáng <input type="color" data-k="light" value="${boardColors().light.startsWith('#') && boardColors().light.length === 7 ? boardColors().light : '#ebecd0'}"></label><label class="inl">Ô tối <input type="color" data-k="dark" value="${boardColors().dark.startsWith('#') && boardColors().dark.length === 7 ? boardColors().dark : '#739552'}"></label></div></div>`));
  p.append(E(`<div class="card"><h3>Ô khuyết</h3><p class="note">Ô khuyết không tồn tại: quân không thể đi vào hay đi xuyên qua (trừ quân "bay qua"). Bấm trực tiếp lên bàn cờ để tạo.</p>
    <button type="button" data-act="clearVoids">Xóa hết ô khuyết (${d.voids.length})</button></div>`));
  p.append(E(`<div class="card"><h3>Bắt đầu từ mẫu có sẵn</h3><div class="row2"><select data-k="preset">${PRESETS.map((q) => `<option value="${q.id}">${q.name}</option>`).join('')}</select><button type="button" data-act="loadPreset">Tải mẫu</button></div>
    <button type="button" data-act="newBlank">Bàn trống (giữ các quân đã tạo)</button></div>`));
  p.onchange = p.oninput = (e) => {
    const k = e.target.dataset.k; if (!k) return;
    if (k === 'w' || k === 'h') { const v = Math.max(LIMITS.minSize, Math.min(LIMITS.maxSize, Math.round(+e.target.value) || 8)); if (e.type === 'change') { resize(k === 'w' ? v : d.w, k === 'h' ? v : d.h); e.target.value = v; touch(true); } }
    else if (k === 'light' || k === 'dark') { d[k] = e.target.value; touch(); }
  };
  p.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.th !== undefined) { const t = THEMES[b.dataset.th]; if (t) { d.light = t[0]; d.dark = t[1]; } else { delete d.light; delete d.dark; } renderPanel(); touch(); }
    else if (b.dataset.act === 'clearVoids') { d.voids = []; renderPanel(); touch(true); }
    else if (b.dataset.act === 'loadPreset') { const q = PRESETS.find((z) => z.id === p.querySelector('[data-k=preset]').value); if (q && confirm('Thay thế thiết kế hiện tại bằng mẫu này?')) { ST.def = normalizeDef(q.make()); ST.sel = ST.def.types[0].id; ST.libId = null; $('stTitle').value = ST.def.name; renderPanel(); touch(true); } }
    else if (b.dataset.act === 'newBlank') { if (confirm('Xóa toàn bộ quân trên bàn (giữ nguyên các loại quân)?')) { d.setup = []; renderPanel(); touch(); } }
  };
}
function resize(nw, nh) {
  const d = ST.def, dh = nh - d.h;
  d.setup = d.setup.map((s) => ({ ...s, y: s.c === 'b' ? s.y + dh : s.y })).filter((s) => s.x < nw && s.y >= 0 && s.y < nh);
  d.voids = d.voids.map((i) => [i % d.w, (i / d.w) | 0]).filter(([x, y]) => x < nw && y < nh).map(([x, y]) => y * nw + x);
  d.w = nw; d.h = nh;
}

// ---------- tab quân cờ ----------
function newType() {
  const d = ST.def; if (d.types.length >= LIMITS.maxTypes) return msg(`Tối đa ${LIMITS.maxTypes} loại quân.`);
  let n = d.types.length + 1, id = 'u' + n; while (typeOf(id)) id = 'u' + ++n;
  const t = { id, name: 'Quân mới', letter: '', value: 1, royal: false, promote: null, moves: [{ dx: 0, dy: 1, max: 1, mode: 'a' }], art: { base: null, items: [{ t: 'ell', cx: 50, cy: 56, rx: 26, ry: 26, fill: 'side', stroke: 'edge', sw: 4, g: 1 }, { t: 'ell', cx: 50, cy: 56, rx: 11, ry: 11, fill: '#f4a261', stroke: 'edge', sw: 3, g: 2 }] } };
  d.types.push(t); ST.sel = id; renderPanel(); touch();
}
function piecesPanel(p) {
  const d = ST.def; if (!typeOf(ST.sel)) ST.sel = d.types[0].id; const t = typeOf(ST.sel);
  const list = E('<div class="typeList" role="listbox" aria-label="Danh sách quân"></div>');
  const refreshList = () => {
    list.textContent = '';
    for (const q of d.types) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'typeBtn' + (q.id === ST.sel ? ' on' : ''); b.dataset.id = q.id; b.setAttribute('role', 'option'); b.title = q.name;
      b.innerHTML = `<span class="tp">${art(q, 'w')}</span><span class="tn"></span>`; b.querySelector('.tn').textContent = q.name + (q.royal ? ' ♛' : ''); list.append(b);
    }
    const add = document.createElement('button'); add.type = 'button'; add.className = 'typeBtn add'; add.dataset.act = 'new'; add.innerHTML = '<span class="tp">＋</span><span class="tn">Quân mới</span>'; list.append(add);
  };
  refreshList(); p.append(list);
  const form = E(`<div class="card"><div class="row2"><label class="inl grow">Tên <input type="text" data-k="name" maxlength="24"></label><label class="inl">Ký hiệu <input type="text" data-k="letter" maxlength="2" size="2" title="Chữ dùng trong bảng ghi nước đi"></label></div>
    <div class="row2"><label class="inl">Giá trị (cho bot) <input type="number" min="0" max="99" step="0.1" data-k="value"></label><button type="button" data-act="autoval" title="Ước lượng theo số ô quân kiểm soát">Tự tính</button></div>
    <label class="chk"><input type="checkbox" data-k="royal"> Quân Vua (royal): bị chiếu thì phải cứu, bị chiếu hết là thua</label>
    <label class="chk"><input type="checkbox" data-k="promo"> Phong cấp khi tới hàng cuối của đối phương</label>
    <div class="promoList" data-promo hidden></div>
    <div class="row2"><button type="button" data-act="dup">Nhân bản quân này</button><button type="button" data-act="del" class="warn">Xóa quân này</button></div></div>`);
  form.querySelector('[data-k=name]').value = t.name; form.querySelector('[data-k=letter]').value = t.letter; form.querySelector('[data-k=value]').value = t.value;
  form.querySelector('[data-k=royal]').checked = t.royal; form.querySelector('[data-k=promo]').checked = !!t.promote;
  const pl = form.querySelector('[data-promo]');
  const buildPromo = () => {
    pl.hidden = !t.promote; pl.textContent = ''; if (!t.promote) return; pl.append('Có thể phong thành: ');
    for (const q of d.types) { if (q.royal || q.id === t.id) continue; const l = document.createElement('label'); l.className = 'chk mini'; const c = document.createElement('input'); c.type = 'checkbox'; c.checked = t.promote.includes(q.id); c.onchange = () => { t.promote = c.checked ? [...new Set([...t.promote, q.id])] : t.promote.filter((x) => x !== q.id); persist(); }; l.append(c, ' ' + q.name); pl.append(l); }
  };
  buildPromo(); p.append(form);
  const dw = E('<div class="card"><h3>Hình dạng quân</h3><div class="drawHost"></div></div>'), mv = E('<div class="card"><h3>Cách di chuyển</h3><div class="mvHost"></div></div>');
  p.append(dw, mv);
  draw = new DrawEditor(dw.querySelector('.drawHost'), { onChange: () => { refreshList(); touch(); moves?.paint(); }, colors: boardColors, set: () => cfg.pieces });
  draw.setArt(t.art);
  moves = new MoveEditor(mv.querySelector('.mvHost'), { getType: () => t, onChange: () => { persist(); }, pieceHtml: () => art(t, 'w') });
  moves.setType(); moves.paint();

  form.oninput = (e) => {
    const k = e.target.dataset.k; if (!k) return;
    if (k === 'name') t.name = e.target.value.slice(0, 24) || 'Quân'; else if (k === 'letter') t.letter = e.target.value.replace(/[<>"'&]/g, '').slice(0, 2);
    else if (k === 'value') t.value = Math.max(0, Math.min(99, +e.target.value || 0));
    else if (k === 'royal') t.royal = e.target.checked;
    else if (k === 'promo') { t.promote = e.target.checked ? d.types.filter((q) => !q.royal && q.id !== t.id).map((q) => q.id) : null; buildPromo(); }
    refreshList(); persist();
  };
  form.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'autoval') { t.value = estimateValue(t); form.querySelector('[data-k=value]').value = t.value; persist(); }
    else if (b.dataset.act === 'dup') { if (d.types.length >= LIMITS.maxTypes) return msg(`Tối đa ${LIMITS.maxTypes} loại quân.`); const c = cloneDef({ types: [t] }).types[0]; let n = d.types.length + 1, id = 'u' + n; while (typeOf(id)) id = 'u' + ++n; c.id = id; c.name = (t.name + ' 2').slice(0, 24); d.types.push(c); ST.sel = id; renderPanel(); touch(); }
    else if (b.dataset.act === 'del') {
      if (d.types.length <= 1) return msg('Cần giữ lại ít nhất một loại quân.');
      const used = d.setup.filter((s) => s.t === t.id).length;
      if (!confirm(`Xóa "${t.name}"${used ? ` và ${used} quân của nó trên bàn` : ''}?`)) return;
      d.types = d.types.filter((q) => q.id !== t.id); d.setup = d.setup.filter((s) => s.t !== t.id); for (const q of d.types) if (q.promote) q.promote = q.promote.filter((x) => x !== t.id);
      ST.sel = d.types[0].id; renderPanel(); touch();
    }
  };
  list.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.act === 'new') newType(); else { ST.sel = b.dataset.id; renderPanel(); } };
}

// ---------- tab đặt quân ----------
function setupPanel(p) {
  const d = ST.def; if (ST.tool === null) ST.tool = d.types[0].id; if (ST.tool !== 'erase' && !typeOf(ST.tool)) ST.tool = d.types[0].id;
  const tray = E('<div class="card"><h3>Chọn quân để đặt</h3><div class="seg big" data-seg="color"><button type="button" data-v="w">Quân Trắng</button><button type="button" data-v="b">Quân Đen</button></div><div class="tray"></div></div>');
  const fill = () => {
    const tr = tray.querySelector('.tray'); tr.textContent = '';
    for (const q of d.types) { const b = document.createElement('button'); b.type = 'button'; b.className = 'typeBtn' + (ST.tool === q.id ? ' on' : ''); b.dataset.t = q.id; b.title = q.name; b.innerHTML = `<span class="tp">${art(q, ST.color)}</span><span class="tn"></span>`; b.querySelector('.tn').textContent = q.name; tr.append(b); }
    const er = document.createElement('button'); er.type = 'button'; er.className = 'typeBtn' + (ST.tool === 'erase' ? ' on' : ''); er.dataset.t = 'erase'; er.innerHTML = '<span class="tp">⌫</span><span class="tn">Tẩy</span>'; tr.append(er);
    for (const b of tray.querySelectorAll('[data-seg=color] button')) b.classList.toggle('on', b.dataset.v === ST.color);
  };
  fill(); p.append(tray);
  p.append(E(`<div class="card"><h3>Đối xứng</h3><label class="inl">Khi đặt quân, tự đặt quân đối thủ <select data-k="mirror"><option value="v">Phản chiếu dọc (như cờ vua)</option><option value="r">Xoay 180°</option><option value="">Không</option></select></label>
    <div class="row2"><label class="inl">Điền cả hàng số ${num(1, d.h, 2, 'row')}</label><button type="button" data-act="fillRow">Điền hàng</button></div>
    <div class="row2"><button type="button" data-act="clearAll" class="warn">Xóa hết quân</button><button type="button" data-act="swap">Đổi màu toàn bộ</button></div></div>`));
  p.append(E(`<div class="card"><h3>Ai đi trước?</h3><div class="seg" data-seg="turn"><button type="button" data-v="w">Trắng</button><button type="button" data-v="b">Đen</button></div></div>`));
  const syncSeg = () => { for (const b of p.querySelectorAll('[data-seg=turn] button')) b.classList.toggle('on', b.dataset.v === d.turn); p.querySelector('[data-k=mirror]').value = ST.mirror; };
  syncSeg();
  p.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const seg = b.closest('[data-seg]')?.dataset.seg;
    if (seg === 'color') { ST.color = b.dataset.v; fill(); }
    else if (seg === 'turn') { d.turn = b.dataset.v; syncSeg(); persist(); }
    else if (b.dataset.t) { ST.tool = b.dataset.t; fill(); }
    else if (b.dataset.act === 'clearAll') { if (confirm('Xóa tất cả quân trên bàn?')) { d.setup = []; touch(); } }
    else if (b.dataset.act === 'swap') { d.setup = d.setup.map((s) => ({ ...s, c: s.c === 'w' ? 'b' : 'w', y: d.h - 1 - s.y })); touch(); }
    else if (b.dataset.act === 'fillRow') { const r = Math.max(1, Math.min(d.h, +p.querySelector('[data-k=row]').value || 1)) - 1; for (let x = 0; x < d.w; x++) place(x, r); }
  };
  p.onchange = (e) => { if (e.target.dataset.k === 'mirror') ST.mirror = e.target.value; };
}

// ---------- tab chơi ----------
function playPanel(p) {
  const d = ST.def, issues = validateDef(d), bad = issues.some((i) => i.level === 'error');
  const card = E('<div class="card"><h3></h3><p class="note"></p><ul class="issues"></ul><button type="button" id="stPlay" class="primary big">Bắt đầu chơi</button></div>');
  card.querySelector('h3').textContent = d.name;
  card.querySelector('.note').textContent = `${d.w}×${d.h} · ${d.types.length} loại quân · ${d.setup.length} quân trên bàn${d.voids.length ? ` · ${d.voids.length} ô khuyết` : ''}`;
  const ul = card.querySelector('ul'); for (const i of issues) { const li = document.createElement('li'); li.className = i.level; li.textContent = i.text; ul.append(li); }
  if (!issues.length) { const li = document.createElement('li'); li.className = 'ok'; li.textContent = 'Mọi thứ đã sẵn sàng.'; ul.append(li); }
  card.querySelector('#stPlay').disabled = bad; card.querySelector('#stPlay').onclick = openPlayDialog;
  p.append(card);
  p.append(E(`<div class="card"><h3>Luật áp dụng</h3><ul class="rulesInfo"><li>Quân không được để Vua (royal) của mình bị tấn công; hết nước đi khi bị chiếu là thua, không bị chiếu là hòa.</li><li>Không có nhập thành và bắt tốt qua đường. Quân có luật "nước đầu" chỉ dùng được khi chưa từng di chuyển.</li><li>Hòa khi lặp thế 3 lần hoặc 100 nước không bắt quân/phong cấp.</li></ul></div>`));
}
function openPlayDialog() {
  const o = load('cc.cplay', { opp: 'bot', level: 3, color: 'w', tc: '', autoFlip: false, practice: false });
  $('cOpp').value = o.opp; $('cLevel').value = o.level; $('cColor').value = o.color; $('cTc').value = o.tc; $('cAutoFlip').checked = o.autoFlip; $('cPractice').checked = o.practice;
  syncPlayDlg(); $('cSetup').showModal();
}
function syncPlayDlg() { const bot = $('cOpp').value === 'bot'; for (const id of ['cLevelRow', 'cColorRow']) $(id).hidden = !bot; $('cFlipRow').hidden = bot; }

// ---------- thư viện & tệp ----------
function saveToLibrary() {
  const lib = load('cc.library', []), d = cloneDef(ST.def); d.name = ($('stTitle').value.trim() || d.name).slice(0, 60);
  const i = lib.findIndex((x) => x.id === ST.libId);
  if (i >= 0) lib[i] = { ...lib[i], name: d.name, t: Date.now(), def: d }; else { ST.libId = 'l' + Date.now().toString(36); lib.unshift({ id: ST.libId, name: d.name, t: Date.now(), def: d }); }
  if (!save('cc.library', lib.slice(0, 50))) return msg('Không lưu được vào bộ nhớ trình duyệt (có thể đã đầy hoặc bị chặn). Hãy dùng "Xuất" để lưu thành file.');
  msg(`Đã lưu "${d.name}" vào thư viện.`);
}
function showLibrary() {
  const box = $('libList'), lib = load('cc.library', []); box.textContent = '';
  if (!lib.length) box.textContent = 'Thư viện đang trống. Bấm "Lưu" để thêm thiết kế hiện tại.';
  for (const it of lib) {
    const row = document.createElement('div'); row.className = 'hrow'; const s = document.createElement('span'); s.append(it.name, document.createElement('br'), new Date(it.t).toLocaleString('vi-VN') + ` · ${it.def?.w}×${it.def?.h}`); row.append(s);
    const open = document.createElement('button'); open.textContent = 'Mở'; open.onclick = () => { try { loadDef(normalizeDef(it.def), it.id); $('libDlg').close(); } catch (e) { msg(e.message); } };
    const del = document.createElement('button'); del.textContent = 'Xóa'; del.onclick = () => { if (confirm(`Xóa "${it.name}"?`)) { save('cc.library', lib.filter((x) => x.id !== it.id)); showLibrary(); } };
    row.append(open, del); box.append(row);
  }
  $('libDlg').showModal();
}
function loadDef(def, libId = null) { ST.def = def; ST.libId = libId; ST.sel = def.types[0].id; ST.tool = def.types[0].id; $('stTitle').value = def.name; persist(); setTab('board'); paintBoard(true); }
function exportFile() {
  const d = cloneDef(ST.def); d.name = $('stTitle').value.trim() || d.name;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportJson(d)], { type: 'application/json' }));
  a.download = (d.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'co-vua-tuy-chinh') + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- khởi tạo ----------
export function initStudio(h) {
  hooks = h; if (inited) return; inited = true;
  const saved = load('cc.studio', null); try { ST.def = saved ? normalizeDef(saved) : newDef(); } catch { ST.def = newDef(); }
  ST.sel = ST.def.types[0].id; ST.tool = ST.def.types[0].id;
  view = new BoardView($('stBoard')).on({ press, paint: true }); view.configure({ w: ST.def.w, h: ST.def.h, voids: ST.def.voids });
  $('stTitle').value = ST.def.name; $('stTitle').oninput = (e) => { ST.def.name = e.target.value.slice(0, 60); persist(); };
  $('stTabs').onclick = (e) => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); };
  $('stSave').onclick = saveToLibrary; $('stOpen').onclick = showLibrary; $('libClose').onclick = () => $('libDlg').close();
  $('stExport').onclick = exportFile; $('stImport').onclick = () => $('stFile').click();
  $('stFile').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > 2e6) return msg('File quá lớn.'); try { loadDef(importJson(await f.text())); msg('Đã nhập thiết kế.'); } catch (err) { msg(err.message); } };
  for (const l of BOT_LEVELS) $('cLevel').add(new Option(`${l.id} · ${l.name}`, l.id));
  $('cOpp').onchange = syncPlayDlg; $('cSetupCancel').onclick = () => $('cSetup').close();
  $('cSetupGo').onclick = (e) => {
    e.preventDefault(); $('cSetup').close();
    const o = { opp: $('cOpp').value, level: +$('cLevel').value, color: $('cColor').value, tc: $('cTc').value, autoFlip: $('cAutoFlip').checked, practice: $('cPractice').checked };
    save('cc.cplay', o); const d = cloneDef(ST.def); d.name = $('stTitle').value.trim() || d.name; startCustom(d, o);
  };
  initCustomGame({ goMenu: () => hooks.goMenu(), toStudio: () => openStudio() });
  onTheme(() => { if (document.documentElement.dataset.view === 'studio') { renderPanel(); paintBoard(); } });
}
export function openStudio(def) {
  if (def) { ST.def = normalizeDef(def); ST.libId = null; $('stTitle').value = ST.def.name; }
  show('studio'); setTab(ST.tab); paintBoard(true);
}
