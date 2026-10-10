// Chạy: node tests/run-tests.mjs   (cần Node 18+)
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { Chess } from '../lib/chess.js';
import { Engine, ELOS, levelParams } from '../js/ai.js';

let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

// 1) perft — kiểm tra bộ sinh nước đi của chess.js
const perft = (g, d) => { if (!d) return 1; let n = 0; for (const m of g.moves({ verbose: true })) { g.move(m); n += perft(g, d - 1); g.undo(); } return n; };
for (const [name, fen, d, exp] of [
  ['start d3', undefined, 3, 8902],
  ['kiwipete d2', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 2, 2039],
  ['pos3 d4', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4, 43238],
  ['pos4 d3', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3, 9467],
  ['pos5 d3', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 62379],
]) { const n = perft(new Chess(fen), d); ok(n === exp, `perft ${name}: ${n} (mong đợi ${exp})`); }

// 2) luật đặc biệt
let g = new Chess('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
ok(g.moves().includes('O-O') && g.moves().includes('O-O-O'), 'nhập thành hợp lệ');
g = new Chess('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1'); // f2 không chiếu e1... xe đen ở f2 khống chế f1
ok(!g.moves().includes('O-O'), 'không nhập thành qua ô bị chiếu');
g = new Chess('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
ok(g.moves().includes('exd6'), 'bắt tốt qua đường');
g = new Chess('8/P6k/8/8/8/8/8/K7 w - - 0 1');
ok(['a8=Q', 'a8=R', 'a8=B', 'a8=N+'].every((m) => g.moves().some((x) => x.startsWith(m.slice(0, 4)))), 'phong cấp 4 loại quân');
g = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
ok(g.isStalemate() && g.isDraw(), 'hòa do hết nước đi');
ok(new Chess('8/8/8/4k3/8/8/8/4K3 w - - 0 1').isInsufficientMaterial(), 'hòa do thiếu lực lượng');
g = new Chess(); for (const m of ['f3', 'e5', 'g4', 'Qh4']) g.move(m);
ok(g.isCheckmate(), "chiếu hết (nước Fool's mate)");
g = new Chess(); for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) g.move(m);
ok(g.isThreefoldRepetition(), 'lặp lại vị trí 3 lần');
ok(new Chess('8/8/8/4k3/8/8/8/4K2R w - - 100 80').isDraw(), 'luật 50 nước');

// 3) tham số mức Elo đơn điệu
const ps = ELOS.map(levelParams);
ok(ELOS.length === 19 && ELOS[0] === 200 && ELOS[18] === 2000, '19 mức Elo từ 200 đến 2000');
ok(ps.filter((p) => !p.native).every((p, i, a) => !i || (p.temp < a[i - 1].temp && p.cap < a[i - 1].cap && p.depth >= a[i - 1].depth)), 'Elo thấp -> sai lầm nhiều hơn, sâu ít hơn');

// 4) engine thật qua UCI
function nodeEngine() {
  const p = spawn('node', ['engine/stockfish-19-lite-single.js'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: p.stdout });
  let cb = () => {}; rl.on('line', (l) => cb(l));
  return new Engine({ send: (c) => p.stdin.write(c + '\n'), onLine: (f) => { cb = f; }, terminate: () => p.kill() });
}
const e = nodeEngine(); await e.init();
ok(e.ready, 'engine khởi tạo xong (uciok/readyok)');
try { await new Engine({ send() {}, onLine() {}, terminate() {} }).search('x'); ok(false, 'search khi chưa sẵn sàng'); } catch { ok(true, 'từ chối search khi engine chưa sẵn sàng'); }
// hủy tìm kiếm
const long = e.search(new Chess().fen(), { movetime: 5000 }); await new Promise((r) => setTimeout(r, 200));
const t0 = Date.now(); await e.stop(); ok((await long) === null && Date.now() - t0 < 1500, 'dừng tìm kiếm giữa chừng, kết quả cũ bị bỏ');
// chiếu hết trong 1 nước: mọi mức phải tìm thấy khi mức đủ cao
const mate1 = '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1';
for (const elo of [200, 1000, 2000]) { let h = 0; for (let i = 0; i < 6; i++) { if ((await e.pickMove(mate1, elo)) === 'a1a8') h++; } console.log(`  Elo ${elo}: chiếu hết 1 nước ${h}/6 lần`); if (elo === 2000) ok(h === 6, 'Elo 2000 luôn thấy chiếu hết 1 nước'); }
e.terminate();

// 5) đấu giữa các mức: nước đi luôn hợp lệ, mức cao hơn thắng nhiều hơn
async function play(wElo, bElo) {
  const A = nodeEngine(); await A.init(); const B = nodeEngine(); await B.init();
  const g = new Chess();
  while (!g.isGameOver() && g.history().length < 160) {
    const eng = g.turn() === 'w' ? A : B, elo = g.turn() === 'w' ? wElo : bElo;
    const u = await eng.pickMove(g.fen(), elo, 120);
    let m; try { m = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { m = null; }
    if (!m) { A.terminate(); B.terminate(); return { illegal: u }; }
  }
  A.terminate(); B.terminate();
  return { r: g.isCheckmate() ? (g.turn() === 'w' ? 'b' : 'w') : 'd', plies: g.history().length };
}
for (const [lo, hi] of [[300, 1200], [1200, 2000]]) {
  const res = await Promise.all([play(lo, hi), play(hi, lo), play(lo, hi), play(hi, lo)]);
  ok(res.every((x) => !x.illegal), `Elo ${lo} vs ${hi}: không có nước đi bất hợp lệ`);
  const hiWins = res.filter((x, i) => x.r === (i % 2 ? 'w' : 'b')).length, loWins = res.filter((x, i) => x.r === (i % 2 ? 'b' : 'w')).length;
  console.log(`  ${hi} thắng ${hiWins}, ${lo} thắng ${loWins}, hòa/chưa xong ${res.length - hiWins - loWins} (độ dài: ${res.map((x) => x.plies).join(', ')} nửa nước)`);
  ok(hiWins >= loWins, `Elo ${hi} không thua nhiều hơn Elo ${lo}`);
}
console.log(fail ? `\n${fail} kiểm thử THẤT BẠI` : '\nTất cả kiểm thử đạt'); process.exit(fail ? 1 : 0);
