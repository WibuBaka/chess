// ai.js — điều khiển Stockfish (UCI) và chọn nước đi theo mức Elo mục tiêu.
// Không phụ thuộc DOM: chạy được cả trong trình duyệt (Web Worker) lẫn Node (để kiểm thử).

export const ELOS = Array.from({ length: 19 }, (_, i) => 200 + i * 100);

// Elo >= 1400: dùng UCI_LimitStrength + UCI_Elo của Stockfish (tối thiểu 1320).
// Elo < 1400: lấy 6 nước ứng viên (MultiPV) ở độ sâu nông rồi chọn ngẫu nhiên có trọng số
// theo độ thiệt hại (centipawn); nước thiệt hại quá `cap` bị loại để tránh tự sát vô lý.
export function levelParams(elo) {
  const t = (elo - 200) / 1800;
  if (elo >= 1400) return { native: true, elo, movetime: 300 + Math.round(t * 900) };
  return {
    native: false,
    multipv: 6,
    depth: 1 + Math.round(t * 8),
    movetime: 150 + Math.round(t * 400),
    temp: 300 * Math.pow(1 - t, 1.3) + 40,
    cap: 550 * Math.pow(1 - t, 1.2) + 120,
  };
}

export function chooseMove(res, p, rnd = Math.random) {
  if (p.native || !res.lines.length) return res.best;
  const best = Math.max(...res.lines.map((l) => l.score));
  const c = res.lines.filter((l) => best - l.score <= p.cap);
  const w = c.map((l) => Math.exp(-(best - l.score) / p.temp));
  let r = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < c.length; i++) { r -= w[i]; if (r <= 0) return c[i].move; }
  return c[0].move;
}

export function workerTransport(url) {
  const w = new Worker(url);
  let cb = () => {};
  w.onmessage = (e) => cb(typeof e.data === 'string' ? e.data : String(e.data));
  w.onerror = (e) => cb('error ' + (e.message || 'không tải được worker'));
  return { send: (c) => w.postMessage(c), onLine: (f) => { cb = f; }, terminate: () => w.terminate() };
}

export class Engine {
  constructor(transport) {
    this.t = transport;
    this.cur = null;
    this.ready = false;
    this.failed = null;
    this.t.onLine((l) => this._line(l));
  }

  init(timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Engine không phản hồi (quá thời gian chờ)')), timeoutMs);
      this._boot = (msg) => {
        if (msg === 'uciok') this.t.send('isready');
        else if (msg === 'readyok') { clearTimeout(timer); this.ready = true; this._boot = null; resolve(); }
        else if (msg.startsWith('error')) { clearTimeout(timer); this.failed = msg; reject(new Error(msg)); }
      };
      this.t.send('uci');
    });
  }

  _line(l) {
    l = String(l).trim();
    if (this._boot) this._boot(l);
    const cur = this.cur;
    if (!cur) return;
    if (l.startsWith('info') && l.includes(' pv ') && !l.includes('bound')) {
      const s = l.match(/score (cp|mate) (-?\d+)/);
      if (!s) return;
      const mpv = +((l.match(/multipv (\d+)/) || [0, 1])[1]);
      const v = +s[2];
      cur.infos.set(mpv, {
        mpv, move: l.split(' pv ')[1].split(' ')[0],
        cp: s[1] === 'cp' ? v : null, mate: s[1] === 'mate' ? v : null,
        score: s[1] === 'cp' ? v : Math.sign(v) * (10000 - Math.abs(v) * 10),
        depth: +((l.match(/depth (\d+)/) || [0, 0])[1]),
      });
    } else if (l.startsWith('bestmove')) {
      this.cur = null;
      const lines = [...cur.infos.values()].sort((a, b) => a.mpv - b.mpv);
      cur.res(cur.cancelled ? null : { best: l.split(' ')[1], lines });
      cur.fin();
    }
  }

  cancel() {
    if (!this.cur) return Promise.resolve();
    this.cur.cancelled = true;
    this.t.send('stop');
    return this.cur.finished;
  }

  // Trả về {best, lines} hoặc null nếu tìm kiếm bị hủy / bị thay thế.
  async search(fen, o = {}) {
    if (!this.ready) throw new Error('Engine chưa sẵn sàng');
    await this.cancel();
    const cur = { infos: new Map(), cancelled: false };
    cur.finished = new Promise((r) => { cur.fin = r; });
    const result = new Promise((r) => { cur.res = r; });
    this.cur = cur;
    const t = this.t;
    t.send('setoption name MultiPV value ' + (o.multipv || 1));
    t.send('setoption name UCI_LimitStrength value ' + (o.limit ? 'true' : 'false'));
    if (o.limit) t.send('setoption name UCI_Elo value ' + o.elo);
    t.send('position fen ' + fen);
    t.send('go ' + (o.depth ? 'depth ' + o.depth + ' ' : '') + (o.movetime ? 'movetime ' + o.movetime : ''));
    return result;
  }

  // Nước đi của AI theo mức Elo mục tiêu. Trả về chuỗi UCI (vd "e2e4") hoặc null nếu bị hủy.
  async pickMove(fen, elo, maxMs) {
    const p = levelParams(elo);
    const movetime = maxMs ? Math.min(p.movetime, maxMs) : p.movetime;
    const res = await this.search(fen, p.native
      ? { limit: true, elo: p.elo, movetime }
      : { multipv: p.multipv, depth: p.depth, movetime });
    return res ? chooseMove(res, p) : null;
  }

  stop() { return this.cancel(); }
  terminate() { this.t.terminate(); }
}
