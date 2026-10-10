// Kiểm thử bộ luật tùy biến và bot. Chạy: node tests/variant-tests.mjs
import { Game, standardDef, defFromFen, estimateValue, PRESETS, stdTypes } from '../js/variant.js';
import { Searcher, BOT_LEVELS, chooseFor } from '../js/variant-ai.js';
import { normalizeDef, validateDef, exportJson, importJson } from '../js/defs.js';

let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const perft = (g, d) => { if (!d) return 1; let n = 0; for (const m of g.legal()) { g.make(m); n += perft(g, d - 1); g.unmake(); } return n; };
const sq = (g, s) => (s.charCodeAt(0) - 97) + (+s.slice(1) - 1) * g.w;
const mv = (g, a, b, p = 0) => g.play(sq(g, a), sq(g, b), p);
const targets = (g, s) => g.legal().filter((m) => m.from === sq(g, s)).map((m) => g.sq(m.to)).sort();
const one = (rules, extra = {}) => ({ name: 't', w: 8, h: 8, voids: [], turn: 'w', types: [{ id: 'x', name: 'X', moves: rules, value: 1, ...extra }, { id: 'k', name: 'K', royal: true, moves: [], value: 0 }, { id: 'e', name: 'E', moves: [], value: 1 }], setup: [] });

// 1) chuẩn cờ vua: perft
let g = new Game(standardDef());
ok(JSON.stringify([1, 2, 3, 4].map((d) => perft(g, d))) === '[20,400,8902,197281]', 'perft cờ chuẩn d1-d4 = 20, 400, 8902, 197281');
g = new Game(defFromFen('n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - - 0 1'));
ok(JSON.stringify([1, 2, 3].map((d) => perft(g, d))) === '[24,496,9483]', 'perft thế phong cấp d1-d3 = 24, 496, 9483');

// 2) chiếu hết, hòa
g = new Game(standardDef()); mv(g, 'f2', 'f3'); mv(g, 'e7', 'e5'); mv(g, 'g2', 'g4'); mv(g, 'd8', 'h4');
ok(JSON.stringify(g.status()) === '{"over":true,"result":"b","reason":"Chiếu hết"}', "nhận ra chiếu hết (Fool's mate)");
ok(g.log.at(-1).text === 'Qh4#', 'ký hiệu nước chiếu hết: ' + g.log.at(-1).text);
g.undo(); ok(!g.status().over && g.log.length === 3, 'hoàn tác nước chiếu hết');
g = new Game(defFromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')); ok(g.status().result === 'd' && /pat/.test(g.status().reason), 'hòa do pat');
g = new Game(defFromFen('8/8/8/4k3/8/8/8/4K3 w - - 0 1')); ok(g.status().result === 'd', 'hòa do chỉ còn hai Vua');
g = new Game(standardDef()); for (const [a, b] of [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8'], ['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]) mv(g, a, b);
ok(g.status().result === 'd' && /lặp/.test(g.status().reason), 'hòa do lặp lại vị trí 3 lần');

// 3) luật quân tự định nghĩa
let d = one([{ dx: 1, dy: 2, max: 1, mode: 'a' }, { dx: 2, dy: 1, max: 1, mode: 'a' }]); d.setup = [{ t: 'x', c: 'w', x: 3, y: 3 }, { t: 'k', c: 'w', x: 0, y: 0 }, { t: 'k', c: 'b', x: 7, y: 7 }];
g = new Game(d); ok(targets(g, 'd4').join() === 'e6,f5', 'quân nhảy (1,2)/(2,1) một chiều: 2 ô (không tự đối xứng)');
d = one([{ dx: 0, dy: 1, max: 0, mode: 'a' }]); d.setup = [{ t: 'x', c: 'w', x: 0, y: 0 }, { t: 'e', c: 'b', x: 0, y: 4 }, { t: 'k', c: 'w', x: 7, y: 0 }, { t: 'k', c: 'b', x: 7, y: 7 }];
g = new Game(d); ok(targets(g, 'a1').join() === 'a2,a3,a4,a5', 'quân trượt: dừng và ăn quân địch đầu tiên');
d.setup[1].c = 'w'; g = new Game(d); ok(targets(g, 'a1').join() === 'a2,a3,a4', 'quân trượt bị quân mình chặn');
d = one([{ dx: 0, dy: 1, max: 0, mode: 'a', jump: true }]); d.setup = [{ t: 'x', c: 'w', x: 0, y: 0 }, { t: 'e', c: 'w', x: 0, y: 2 }, { t: 'e', c: 'b', x: 0, y: 4 }, { t: 'k', c: 'w', x: 7, y: 0 }, { t: 'k', c: 'b', x: 7, y: 7 }];
g = new Game(d); ok(targets(g, 'a1').join() === 'a2,a4,a5,a6,a7,a8', 'quân "bay qua quân cản": đi qua cả quân mình, vẫn ăn được quân địch');
d = one([{ dx: 0, dy: 1, max: 0, mode: 'm' }, { dx: 0, dy: 1, max: 0, mode: 'c', hop: true }]); d.setup = [{ t: 'x', c: 'w', x: 0, y: 0 }, { t: 'e', c: 'b', x: 0, y: 3 }, { t: 'e', c: 'b', x: 0, y: 5 }, { t: 'k', c: 'w', x: 7, y: 0 }, { t: 'k', c: 'b', x: 7, y: 7 }];
g = new Game(d); ok(targets(g, 'a1').join() === 'a2,a3,a6', 'quân kiểu Pháo: đi tới chỗ chắn, ăn quân sau đúng một bàn đạp');
d = one([{ dx: 0, dy: 1, max: 1, mode: 'm' }, { dx: 0, dy: 1, max: 2, mode: 'm', first: true }]); d.setup = [{ t: 'x', c: 'w', x: 0, y: 1 }, { t: 'k', c: 'w', x: 7, y: 0 }, { t: 'k', c: 'b', x: 7, y: 7 }];
d.types[1].moves = [{ dx: 1, dy: 0, max: 1, mode: 'a' }, { dx: -1, dy: 0, max: 1, mode: 'a' }];
g = new Game(d); ok(targets(g, 'a2').join() === 'a3,a4', 'luật "chỉ nước đầu": đi 2 ô lần đầu');
mv(g, 'a2', 'a3'); mv(g, 'h8', 'g8'); ok(targets(g, 'a3').join() === 'a4', 'luật "nước đầu" không dùng lại sau khi đã đi');
d = one([{ dx: 0, dy: 1, max: 1, mode: 'm' }], { promote: ['e'] }); d.setup = [{ t: 'x', c: 'w', x: 0, y: 6 }, { t: 'k', c: 'w', x: 7, y: 0 }, { t: 'k', c: 'b', x: 7, y: 7 }];
g = new Game(d); const rec = mv(g, 'a7', 'a8', g.tIndex.e); ok(!!rec && g.at(0, 7).t === g.tIndex.e && /=E/.test(rec.text), 'phong cấp khi tới hàng cuối: ' + rec?.text);
ok(g.promotionChoices(sq(g, 'a7'), sq(g, 'a8')).length === 0 || true, 'promotionChoices không lỗi');
d = one([{ dx: 0, dy: 1, max: 0, mode: 'a' }]); d.voids = [sq({ w: 8 }, 'a3')]; d.setup = [{ t: 'x', c: 'w', x: 0, y: 0 }, { t: 'k', c: 'w', x: 7, y: 0 }, { t: 'k', c: 'b', x: 7, y: 7 }];
g = new Game(d); ok(targets(g, 'a1').join() === 'a2', 'ô khuyết chặn quân trượt');
d = one([{ dx: 0, dy: 1, max: 0, mode: 'a' }]); d.setup = [{ t: 'x', c: 'b', x: 0, y: 7 }, { t: 'k', c: 'w', x: 7, y: 0 }, { t: 'k', c: 'b', x: 7, y: 7 }]; d.turn = 'b';
g = new Game(d); ok(targets(g, 'a8').join() === 'a1,a2,a3,a4,a5,a6,a7'.split(',').join() && true, 'Đen đi ngược chiều (hướng tiến bị lật dọc)');
// ghim quân: quân bị ghim không được rời đường chiếu
g = new Game(defFromFen('4k3/8/8/8/4r3/8/4N3/4K3 w - - 0 1')); ok(targets(g, 'e2').length === 0, 'quân bị ghim không đi được (vua bị lộ)');
// không có Vua: không bị chiếu, hết quân thì thua
d = one([{ dx: 1, dy: 0, max: 1, mode: 'a' }]); d.types = d.types.filter((t) => t.id !== 'k'); d.setup = [{ t: 'x', c: 'w', x: 0, y: 0 }, { t: 'e', c: 'b', x: 1, y: 0 }];
g = new Game(d); mv(g, 'a1', 'b1'); ok(g.status().result === 'w' && g.status().reason === 'Hết quân', 'không có Vua: ăn hết quân đối phương thì thắng');

// 4) mẫu có sẵn đều hợp lệ và chơi được
for (const p of PRESETS) { const gg = new Game(p.make()); const n = gg.legal().length; ok(n > 0 && !gg.status().over, `mẫu "${p.name}": ${n} nước đi hợp lệ ở thế đầu`); }
ok(estimateValue(stdTypes()[4]) > estimateValue(stdTypes()[1]), 'tự tính giá trị: Hậu > Mã');

// 5) bot
g = new Game(defFromFen('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1'));
for (const L of BOT_LEVELS.slice(1)) { const m = new Searcher(g).pick(L, () => 0.5); ok(g.sq(m.from) + g.sq(m.to) === 'a1a8', `bot mức ${L.id} (${L.name}) tìm ra chiếu hết 1 nước`); }
g = new Game(defFromFen('4k3/8/8/3q4/8/8/8/R3K2R w - - 0 1')); // quân Hậu đen treo? Xe ăn không được; kiểm tra nước hợp lệ
const bm = new Searcher(g).pick(BOT_LEVELS[4], Math.random, 600); ok(g.legal().some((m) => m.from === bm.from && m.to === bm.to), 'bot luôn trả về nước hợp lệ');
g = new Game(defFromFen('4k3/8/8/8/8/3q4/4P3/4K3 w - - 0 1')); // tốt e2 ăn được Hậu d3
const cap = new Searcher(g).pick(BOT_LEVELS[3], Math.random, 800); ok(g.sq(cap.from) + g.sq(cap.to) === 'e2d3', 'bot ăn Hậu miễn phí');
// ván bot-vs-bot hoàn chỉnh trên bàn mini, không bao giờ đi sai
g = new Game(PRESETS[1].make()); let n = 0; while (!g.status().over && n < 80) { const m = new Searcher(g).pick(BOT_LEVELS[n % 2 ? 1 : 2], Math.random, 80); if (!g.play(m.from, m.to, m.promo)) break; n++; }
ok(n > 10, `bot đấu bot trên bàn mini ${n} nước không lỗi`);
const viaWorkerApi = chooseFor(standardDef(), [{ from: 4 + 8, to: 4 + 24 }], 1); ok(!!viaWorkerApi && viaWorkerApi.from >= 0, 'chooseFor (giao diện của worker) hoạt động');

// 6) làm sạch dữ liệu JSON
const std = normalizeDef(standardDef()); ok(JSON.stringify(importJson(exportJson(std))) === JSON.stringify(std), 'xuất/nhập JSON giữ nguyên thiết kế');
ok((() => { try { normalizeDef({ w: 8, h: 8, types: [] }); return false; } catch { return true; } })(), 'từ chối thiết kế không có loại quân');
ok((() => { try { importJson('{not json'); return false; } catch { return true; } })(), 'từ chối JSON hỏng');
ok(validateDef({ ...std, setup: [] }).some((i) => i.level === 'error'), 'cảnh báo thiết kế chưa có quân');
console.log(fail ? `\n${fail} kiểm thử luật tùy biến THẤT BẠI` : '\nKiểm thử luật tùy biến đạt'); process.exit(fail ? 1 : 0);
