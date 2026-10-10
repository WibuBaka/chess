// Kiểm thử khói giao diện bằng jsdom + engine thật (Node). Chạy: node tests/ui-smoke.mjs
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const dom = new JSDOM(readFileSync('index.html', 'utf8'), { url: 'http://localhost:8000/' });
const w = dom.window;
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
Object.assign(globalThis, { document: w.document, localStorage: w.localStorage, location: w.location, Option: w.Option, confirm: () => true, alert: (m) => console.log('alert:', m) });
globalThis.Worker = class { constructor(url) {
  const p = spawn('node', [String(url)], { stdio: ['pipe', 'pipe', 'inherit'] }); this.p = p;
  readline.createInterface({ input: p.stdout }).on('line', (l) => this.onmessage?.({ data: l })); }
  postMessage(c) { this.p.stdin.write(c + '\n'); } terminate() { this.p.kill(); } };

let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const $ = (id) => document.getElementById(id), sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(50); } return false; };
const sq = (s) => document.querySelector(`.sq[data-sq=${s}]`);
const nMoves = () => $('moves').querySelectorAll('button').length;
const startGame = (o) => { $('eloSel').value = o.elo; $('colorSel').value = o.color; $('tcSel').value = o.tc || ''; $('practiceChk').checked = !!o.practice; $('goBtn').click(); };

await import('../js/app.js');
ok(await until(() => !$('goBtn').disabled, 20000), 'engine tải xong, nút Bắt đầu được bật');
ok($('setup').open, 'hộp thoại chọn ván mở sẵn');
ok($('eloSel').options.length === 19, 'menu có 19 mức Elo');

startGame({ elo: 1000, color: 'w', practice: true });
ok(document.querySelectorAll('.sq').length === 64 && document.querySelectorAll('.pc').length === 32, 'bàn cờ 64 ô, 32 quân');
sq('e2').click(); ok(document.querySelectorAll('.sq.mv').length === 2, 'chọn tốt e2 hiện 2 ô có thể đi');
sq('e5').click(); ok(nMoves() === 0, 'bấm ô không hợp lệ không đi quân');
sq('e2').click(); sq('e4').click();
ok(nMoves() === 1, 'đi e2-e4');
ok(await until(() => nMoves() === 2), 'AI trả lời bằng nước hợp lệ');
$('undoBtn').click(); ok(await until(() => nMoves() === 0), 'luyện tập: quay lại cả cặp nước');
await sleep(300); ok(nMoves() === 0, 'không có nước AI cũ chen vào sau khi quay lại');

startGame({ elo: 600, color: 'b' });
ok(document.querySelector('.sq').dataset.sq === 'h1', 'chơi quân Đen: bàn cờ lật');
ok(await until(() => nMoves() === 1), 'AI (Trắng) đi trước');
ok($('undoBtn').hidden, 'ngoài chế độ luyện tập: ẩn nút quay lại');

startGame({ elo: 400, color: 'w', tc: '1+0' });
ok(/^\d+:\d\d$/.test($('botPlayer').lastElementChild.textContent), 'hiện đồng hồ khi chọn tính giờ');
sq('d2').click(); sq('d4').click(); await until(() => nMoves() === 2);
sq('g1').click(); sq('f3').click(); await until(() => nMoves() === 4);
$('resignBtn').click();
ok(/Bạn thua/.test($('status').textContent), 'xin thua: ' + $('status').textContent);
ok(JSON.parse(localStorage.getItem('cc.history')).length === 1, 'ván được lưu vào lịch sử');
const before = nMoves(); await sleep(1500); ok(nMoves() === before, 'AI không đi tiếp sau khi ván kết thúc');
$('analyzeBtn').click();
ok(await until(() => !$('report').hidden, 60000), 'phân tích sau ván cho ra báo cáo');
$('replayBtn').click(); ok(nMoves() === 0 && !$('report').hidden === false, 'chơi lại: ván mới sạch trạng thái cũ');

$('importBtn').click(); $('pgnText').value = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *'; $('pgnGo').click();
ok(nMoves() === 6 && !$('contBtn').hidden, 'nhập PGN 6 nước, có nút chơi tiếp');
document.querySelectorAll('#moves button')[1].click();
ok(document.querySelectorAll('.pc').length === 32 && sq('e5').querySelector('.pc'), 'bấm một nước trong danh sách để xem lại thế cờ');
$('flipBtn').click(); ok(document.querySelector('.sq').dataset.sq === 'h1', 'nút Lật bàn xoay bàn cờ');
$('importBtn').click(); $('pgnText').value = '1. e4 d5 2. exd5 *'; $('pgnGo').click();
ok(/\+1/.test($('botPlayer').querySelector('.cap').textContent) && $('botPlayer').querySelectorAll('.cap .pc').length === 1, 'hiện quân đã bắt và lợi thế +1');
$('prevBtn').click(); ok($('botPlayer').querySelectorAll('.cap .pc').length === 0, 'nút ‹ lùi một nước, quân bắt được cập nhật theo thế cờ');
console.log(fail ? `\n${fail} kiểm thử giao diện THẤT BẠI` : '\nKiểm thử giao diện đạt'); process.exit(fail ? 1 : 0);
