// variant-ai.js — bot cho luật tùy biến: negamax + alpha-beta + tìm sâu dần theo thời gian.
// Không phụ thuộc DOM. Chạy trong Web Worker (variant-worker.js) hoặc trực tiếp (kiểm thử / dự phòng).
import { Game } from './variant.js';

export const BOT_LEVELS = [
  { id: 1, name: 'Rất dễ', depth: 1, ms: 300, temp: 260 },
  { id: 2, name: 'Dễ', depth: 2, ms: 600, temp: 110 },
  { id: 3, name: 'Trung bình', depth: 3, ms: 1200, temp: 35 },
  { id: 4, name: 'Khó', depth: 5, ms: 2200, temp: 8 },
  { id: 5, name: 'Rất khó', depth: 8, ms: 4500, temp: 0 },
];
const INF = 1e9, MATE = 1e6;

class Abort extends Error {}

export class Searcher {
  constructor(game) {
    this.g = game; this.nodes = 0; this.deadline = Infinity;
    const { w, h } = game; this.cx = (w - 1) / 2; this.cy = (h - 1) / 2; this.maxd = Math.hypot(this.cx, this.cy) || 1;
    this.pawnLike = game.types.map((t) => !!t && !!(t.promote?.length));
  }

  // Điểm từ góc nhìn bên sắp đi (centipawn)
  evaluate() {
    const g = this.g, { w, board } = g; let s = 0;
    for (let i = 0; i < g.n; i++) {
      const v = board[i]; if (!v) continue;
      const t = Math.abs(v), sg = v > 0 ? 1 : -1, x = i % w, y = (i / w) | 0;
      let val = g.royal[t] ? 0 : g.value[t] * 100;
      const center = 1 - Math.hypot(x - this.cx, y - this.cy) / this.maxd;
      val += center * (g.royal[t] ? 3 : 14);
      if (this.pawnLike[t - 1]) val += (sg > 0 ? y : g.h - 1 - y) * 6;
      s += sg * val;
    }
    return g.turn === 'w' ? s : -s;
  }

  order(ms) {
    const g = this.g, vals = g.value;
    for (const m of ms) m.s = (m.promo ? 800 + vals[m.promo] * 10 : 0) + (m.cap ? 1000 + vals[m.cap] * 10 - vals[Math.abs(g.board[m.from])] : 0);
    ms.sort((a, b) => b.s - a.s);
  }

  tick() { if ((++this.nodes & 1023) === 0 && Date.now() > this.deadline) throw new Abort(); }

  quiesce(alpha, beta, ply, qd) {
    this.tick();
    const g = this.g, stand = this.evaluate();
    if (qd <= 0) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const color = g.turn, roy = g.hasRoyal(color), en = color === 'w' ? 'b' : 'w';
    const ms = g.pseudo(color, true).filter((m) => m.cap || m.promo); this.order(ms);
    for (const m of ms) {
      g.make(m);
      if (roy && g._unsafe(color, en)) { g.unmake(); continue; }
      const sc = -this.quiesce(-beta, -alpha, ply + 1, qd - 1); g.unmake();
      if (sc >= beta) return sc; if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  negamax(depth, alpha, beta, ply) {
    this.tick();
    const g = this.g;
    if (ply > 0 && g.half >= 100) return 0;
    if (depth <= 0) return this.quiesce(alpha, beta, ply, 4);
    const color = g.turn, roy = g.hasRoyal(color), en = color === 'w' ? 'b' : 'w';
    const ms = g.pseudo(color); this.order(ms);
    let best = -INF, legal = 0;
    for (const m of ms) {
      g.make(m);
      if (roy && g._unsafe(color, en)) { g.unmake(); continue; }
      legal++;
      const sc = -this.negamax(depth - 1, -beta, -alpha, ply + 1); g.unmake();
      if (sc > best) best = sc; if (sc > alpha) alpha = sc; if (alpha >= beta) break;
    }
    if (!legal) {
      if (roy) return g.inCheck(color) ? -MATE + ply : 0;
      let any = false; const sg = color === 'w' ? 1 : -1; for (let i = 0; i < g.n; i++) if (g.board[i] * sg > 0) { any = true; break; }
      return any ? 0 : -MATE + ply;
    }
    return best;
  }

  // Trả về [{m, score}] đã sắp giảm dần, ở độ sâu depth (cửa sổ đầy đủ cho từng nước gốc nếu full=true)
  root(depth, full, prev) {
    const g = this.g, color = g.turn, ms = g.legal(color); if (!ms.length) return [];
    this.order(ms); if (prev) ms.sort((a, b) => (prev.get(b.from + ':' + b.to + ':' + b.promo) ?? -INF) - (prev.get(a.from + ':' + a.to + ':' + a.promo) ?? -INF));
    const out = []; let alpha = -INF;
    for (const m of ms) {
      g.make(m);
      const sc = -this.negamax(depth - 1, -INF, full ? INF : -alpha, 1); g.unmake();
      // cửa sổ hẹp: kết quả ≤ alpha chỉ là cận trên, không coi là điểm chính xác
      out.push({ m, score: !full && out.length && sc <= alpha ? alpha - 1 : sc }); if (!full && sc > alpha) alpha = sc;
    }
    out.sort((a, b) => b.score - a.score); return out;
  }

  // Chọn nước đi. level: phần tử của BOT_LEVELS. rnd: hàm ngẫu nhiên (để kiểm thử xác định).
  pick(level, rnd = Math.random, msOverride) {
    const g = this.g, ms = g.legal(); if (!ms.length) return null; if (ms.length === 1) return ms[0];
    this.deadline = Date.now() + (msOverride ?? level.ms); this.nodes = 0;
    let best = null, prev = null; const base = g.stack.length;
    for (let d = 1; d <= level.depth; d++) {
      try {
        const r = this.root(d, level.temp > 0 && d === level.depth, prev);
        if (!r.length) break; best = r; prev = new Map(r.map((x) => [x.m.from + ':' + x.m.to + ':' + x.m.promo, x.score]));
        if (Math.abs(r[0].score) > MATE / 2) break;
      } catch (e) { if (!(e instanceof Abort)) throw e; while (g.stack.length > base) g.unmake(); break; } // hết giờ: trả bàn cờ về nguyên trạng
    }
    if (!best) return ms[Math.floor(rnd() * ms.length)];
    const top = best[0].score;
    if (level.temp <= 0 || best.length === 1 || top > MATE / 2) return best[0].m;
    // chọn ngẫu nhiên có trọng số theo độ thiệt hại, không chọn nước thua trực tiếp nếu còn lựa chọn
    const c = best.filter((x) => top - x.score < level.temp * 4 && !(x.score < -MATE / 2 && top > -MATE / 2));
    const wt = c.map((x) => Math.exp(-(top - x.score) / level.temp)); let r = rnd() * wt.reduce((a, b) => a + b, 0);
    for (let i = 0; i < c.length; i++) { r -= wt[i]; if (r <= 0) return c[i].m; }
    return c[0].m;
  }
}

// Tái dựng ván từ định nghĩa + danh sách nước đi rồi chọn nước cho bên đang đi.
export function chooseFor(def, moves, levelId, rnd) {
  const g = new Game(def);
  for (const m of moves) if (!g.play(m.from, m.to, m.promo || 0)) throw new Error('Lịch sử nước đi không hợp lệ');
  const level = BOT_LEVELS.find((l) => l.id === levelId) || BOT_LEVELS[2];
  const m = new Searcher(g).pick(level, rnd);
  return m ? { from: m.from, to: m.to, promo: m.promo || 0 } : null;
}
