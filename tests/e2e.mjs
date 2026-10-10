// Kiểm thử giao diện trên trình duyệt thật (Playwright + Chromium). Chạy: node tests/e2e.mjs
// Cần: npm i -D playwright && npx playwright install chromium  (hoặc đặt CHROMIUM_PATH tới một Chromium có sẵn)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pw; try { pw = await import('playwright'); } catch { pw = await import('/opt/npm-tools/node_modules/playwright/index.mjs'); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p += '/index.html';
  if (!p.startsWith(root) || !fs.existsSync(p)) { r.statusCode = 404; return r.end(); }
  r.setHeader('content-type', MIME[path.extname(p)] || 'application/octet-stream'); r.end(fs.readFileSync(p));
}).listen(0);
const port = srv.address().port;
const browser = await pw.chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errs = [];
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fresh(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport }); const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  pg.on('dialog', (d) => d.accept());
  await pg.goto(`http://localhost:${port}/`); return pg;
}
const until = async (pg, f, arg, ms = 15000) => { try { await pg.waitForFunction(f, arg, { timeout: ms }); return true; } catch { return false; } };

try {
  // ===== menu =====
  let pg = await fresh();
  ok(await pg.locator('#menuView').isVisible(), 'mở trang là main menu');
  ok(await pg.locator('#goBot, #goFriend, #goStudio').count() === 3, 'menu có 3 lựa chọn: máy, bạn, Custom Studio');
  ok(await pg.locator('#menuBoard .pc').count() === 32, 'bàn cờ trang trí ở menu có 32 quân');
  await pg.waitForTimeout(1500);
  ok(await pg.evaluate(() => document.querySelectorAll('#menuBoard .sq.last').length === 2), 'bàn cờ menu tự chạy ván mẫu');

  // ===== cài đặt =====
  await pg.click('#menuSettings'); await pg.selectOption('#boardSel', 'brown'); await pg.selectOption('#pieceSel', 'flat'); await pg.selectOption('#themeSel', 'dark');
  ok(await pg.evaluate(() => document.documentElement.dataset.board === 'brown' && document.documentElement.dataset.theme === 'dark'), 'đổi màu bàn / giao diện tối');
  ok(await pg.evaluate(() => !!document.querySelector('#menuBoard .ps.flat')), 'đổi bộ quân sang kiểu phẳng áp dụng ngay');
  await pg.selectOption('#pieceSel', 'neo'); await pg.click('#settingsClose');

  // ===== chơi với bạn =====
  await pg.click('#goFriend'); await pg.fill('#nameW', 'An'); await pg.fill('#nameB', 'Bình'); await pg.click('#friendGo');
  const sq = (s) => pg.locator(`#board .sq[data-sq=${s}]`);
  await sq('e2').click(); ok(await pg.locator('#board .sq.mv').count() === 2, 'chọn tốt e2 hiện 2 ô gợi ý');
  await sq('e5').click(); ok(await pg.locator('#moves button').count() === 0, 'bấm ô không hợp lệ không đi quân');
  await sq('e2').click(); await sq('e4').click();
  ok(await pg.locator('#moves button').count() === 1, 'đi e2-e4 bằng hai lần bấm');
  ok((await pg.textContent('#status')).includes('Bình'), 'đến lượt người thứ hai (có tên)');
  // kéo thả bằng chuột
  const box = async (s) => (await sq(s).boundingBox());
  const a = await box('e7'), b = await box('e5');
  await pg.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await pg.mouse.down(); await pg.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); await pg.mouse.up();
  await pg.waitForTimeout(300);
  ok(await pg.locator('#moves button').count() === 2, 'kéo thả quân e7-e5 bằng chuột');
  await pg.click('#undoBtn'); ok(await pg.locator('#moves button').count() === 1, 'chơi với bạn: quay lại nước');
  // chiếu hết kiểu "Fool's mate"
  await pg.click('#replayBtn'); await pg.waitForTimeout(200);
  for (const [f, t] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) { await sq(f).click(); await sq(t).click(); await pg.waitForTimeout(120); }
  ok(await pg.locator('#resDlg[open]').count() === 1 && /Bình thắng/.test(await pg.textContent('#resTitle')), 'chiếu hết: hiện "Bình thắng!"');
  ok(JSON.parse(await pg.evaluate(() => localStorage.getItem('cc.history'))).length >= 1, 'ván được lưu vào lịch sử');
  await pg.click('#resMenu'); ok(await pg.locator('#menuView').isVisible(), 'quay về menu từ hộp thoại kết quả');

  // ===== chơi với bot Stockfish =====
  await pg.click('#goBot'); ok(await until(pg, () => !document.getElementById('goBtn').disabled, null, 30000), 'Stockfish tải xong khi vào chế độ chơi với máy');
  await pg.selectOption('#eloSel', '600'); await pg.selectOption('#colorSel', 'w'); await pg.click('#goBtn');
  await sq('e2').click(); await sq('e4').click();
  ok(await until(pg, () => document.querySelectorAll('#moves button').length === 2), 'Stockfish trả lời bằng nước hợp lệ');
  await pg.click('#resignBtn'); ok(/Bạn thua/.test(await pg.textContent('#status')), 'xin thua trước máy');
  await pg.click('#resMenu');

  // ===== Custom Studio =====
  await pg.click('#goStudio');
  ok(await pg.locator('#stBoard .pc').count() === 32, 'Studio khởi tạo bằng bàn cờ chuẩn');
  // đổi kích thước
  await pg.fill('[data-k=w]', '10'); await pg.press('[data-k=w]', 'Enter'); await pg.evaluate(() => document.querySelector('[data-k=w]').dispatchEvent(new Event('change', { bubbles: true })));
  ok(await pg.locator('#stBoard .sq').count() === 80, 'đổi bàn thành 10×8 (80 ô)');
  // ô khuyết
  const cell = await pg.locator('#stBoard .sq[data-sq=d4]').boundingBox(); await pg.mouse.click(cell.x + 5, cell.y + 5);
  ok(await pg.locator('#stBoard .sq.void').count() === 1, 'bấm ô để tạo ô khuyết');
  // quân mới + vẽ + luật đi
  await pg.click('[data-tab=pieces]'); await pg.click('.typeBtn.add');
  ok(await pg.locator('.typeBtn').count() === 8, 'thêm loại quân mới (6 + mới + nút thêm)');
  await pg.fill('[data-k=name]', 'Pháo thủ');
  const cv = await pg.locator('.drawCanvas').boundingBox();
  await pg.mouse.move(cv.x + cv.width * .3, cv.y + cv.height * .2); await pg.mouse.down();
  for (let i = 1; i <= 12; i++) await pg.mouse.move(cv.x + cv.width * (.3 + i * .03), cv.y + cv.height * (.2 + i * .02));
  await pg.mouse.up();
  const items = await pg.evaluate(() => JSON.parse(localStorage.getItem('cc.studio') || 'null'));
  await sleep(400);
  const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('cc.studio')));
  const nt = saved.types.find((t) => t.name === 'Pháo thủ');
  ok(!!nt && nt.art.items.length >= 4, 'nét vẽ tay được thêm (kèm bản đối xứng)'); void items;
  // luật: xóa hết, thêm "Xe" nhanh rồi thêm một bước Mã bằng cách bấm ô
  await pg.click('[data-q=clear]'); await pg.click('[data-q=rook]');
  ok(await pg.locator('.mvGrid .mc.hit').count() === 24, 'luật "như Xe" hiện 24 ô trên bàn xem trước 13×13');
  await pg.locator('.mvGrid .mc[data-dx="1"][data-dy="2"]').click();
  await sleep(350);
  const saved2 = await pg.evaluate(() => JSON.parse(localStorage.getItem('cc.studio'))); const nt2 = saved2.types.find((t) => t.name === 'Pháo thủ');
  ok(nt2.moves.length === 12 && nt2.moves.filter((m) => m.max === 1).length === 8, 'bấm ô (1,2) thêm 8 bước nhảy kiểu Mã (đối xứng)');
  // đặt quân: đặt quân mới ở giữa bàn, tự có đối xứng
  await pg.click('[data-tab=setup]'); await pg.locator('.tray .typeBtn', { hasText: 'Pháo thủ' }).click();
  const c2 = await pg.locator('#stBoard .sq[data-sq=e4]').boundingBox(); await pg.mouse.click(c2.x + 5, c2.y + 5);
  ok(await pg.locator('#stBoard .pc').count() === 34, 'đặt quân mới: tự thêm quân đối xứng cho đối thủ');
  // chơi với bạn trên bàn tùy biến
  await pg.click('[data-tab=play]'); await pg.click('#stPlay'); await pg.selectOption('#cOpp', 'friend'); await pg.click('#cSetupGo');
  ok(await pg.locator('#cgameView').isVisible() && await pg.locator('#cBoard .sq').count() === 80, 'vào ván tùy biến 10×8');
  const cs = (s) => pg.locator(`#cBoard .sq[data-sq=${s}]`);
  await cs('e4').click(); const nMoves = await pg.locator('#cBoard .sq.mv').count();
  ok(nMoves > 10, `quân tự tạo có ${nMoves} nước đi (Xe + Mã)`);
  await cs('e4').click();
  await cs('b2').click(); await cs('b4').click();
  ok(await pg.locator('#cMoves button').count() === 1, 'tốt đi 2 ô ở nước đầu trong ván tùy biến');
  // bot trên bàn tùy biến (worker)
  await pg.click('#cStudio'); await pg.click('[data-tab=play]'); await pg.click('#stPlay'); await pg.selectOption('#cOpp', 'bot'); await pg.selectOption('#cLevel', '2'); await pg.selectOption('#cColor', 'w'); await pg.click('#cSetupGo');
  await cs('b2').click(); await cs('b3').click();
  ok(await until(pg, () => document.querySelectorAll('#cMoves button').length === 2, null, 20000), 'bot trả lời trên bàn tùy biến (Web Worker)');
  // đồng hồ + thua
  await pg.click('#cResign'); ok(await pg.locator('#cResDlg[open]').count() === 1, 'xin thua trong ván tùy biến hiện hộp thoại kết quả');
  await pg.click('#cResMenu');

  // ===== xuất / nhập JSON =====
  const rt = await pg.evaluate(async () => { const m = await import('./js/defs.js'); const s = JSON.parse(localStorage.getItem('cc.studio')); const t = m.importJson(m.exportJson(m.normalizeDef(s))); return JSON.stringify(t) === JSON.stringify(m.normalizeDef(s)); });
  ok(rt, 'xuất rồi nhập JSON cho kết quả y hệt');
  const bad = await pg.evaluate(async () => { const m = await import('./js/defs.js'); const d = m.normalizeDef({ w: 99, h: -4, types: [{ id: 'a"><img', name: '<b>x</b>', art: { items: [{ t: 'rect', x: 1, y: 1, w: 5, h: 5, fill: 'red" onload="x', stroke: '#fff' }] }, moves: [{ dx: 1, dy: 0, max: 99 }] }], setup: [{ t: 'a"><img', c: 'w', x: 0, y: 0 }] }); return JSON.stringify(d); });
  ok(!bad.includes('onload') && !bad.includes('<img') && JSON.parse(bad).w === 16, 'dữ liệu JSON độc hại bị làm sạch (giới hạn kích thước, bỏ ký tự nguy hiểm)');
  await pg.context().close();

  // ===== điện thoại =====
  pg = await fresh({ width: 390, height: 780 });
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'menu không tràn ngang trên điện thoại');
  await pg.click('#goFriend'); await pg.click('#friendGo'); await pg.waitForTimeout(200);
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'màn hình ván cờ không tràn ngang trên điện thoại');
  const bw = (await pg.locator('#board').boundingBox()).width; ok(bw > 330, 'bàn cờ chiếm gần hết chiều ngang điện thoại (' + Math.round(bw) + 'px)');
  await pg.click('#menuBtn'); await pg.click('#goStudio'); await pg.waitForTimeout(200);
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Studio không tràn ngang trên điện thoại');
  await pg.context().close();
} catch (e) { console.log('FAIL ngoại lệ: ' + e.stack); fail++; }
const realErrs = errs.filter((e) => !/favicon/.test(e)); ok(realErrs.length === 0, 'không có lỗi JS/console' + (realErrs.length ? ': ' + realErrs.slice(0, 3).join(' | ') : ''));
await browser.close(); srv.close();
console.log(fail ? `\n${fail} kiểm thử giao diện THẤT BẠI` : '\nKiểm thử giao diện đạt'); process.exit(fail ? 1 : 0);
