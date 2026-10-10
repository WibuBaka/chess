// ui.js — tiện ích giao diện dùng chung: cài đặt, âm thanh, điều hướng giữa các màn hình.
import { PIECE_SETS, pieceSvg, ensureDefs, STD } from './pieces.js';

export const $ = (id) => document.getElementById(id);
export const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
export const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const cfg = Object.assign({
  elo: 1200, color: 'w', tc: '', practice: false,
  theme: globalThis.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  board: 'green', pieces: 'neo', sound: true, anim: true,
}, load('cc.settings', {}));
export const saveCfg = () => save('cc.settings', cfg);

export const fmt = (ms) => { ms = Math.max(0, ms); const s = Math.floor(ms / 1000); return ms < 10000 ? (ms / 1000).toFixed(1) : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const banner = (t) => { $('banner').textContent = t; $('banner').hidden = !t; };

// ---------- âm thanh (tổng hợp bằng WebAudio, không cần file) ----------
let ac;
export function sfx(kind = 'move') {
  if (!cfg.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime, out = ac.createGain(); out.connect(ac.destination);
    const tone = (f0, f1, dur, vol, type = 'triangle', at = 0) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + at + dur);
      g.gain.setValueAtTime(vol, t + at); g.gain.exponentialRampToValueAtTime(.001, t + at + dur);
      o.connect(g).connect(out); o.start(t + at); o.stop(t + at + dur + .02);
    };
    const noise = (dur, vol) => {
      const b = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
      const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      s.buffer = b; g.gain.value = vol; s.connect(f).connect(g).connect(out); s.start(t);
    };
    if (kind === 'capture') { tone(240, 70, .1, .22); noise(.07, .25); }
    else if (kind === 'check') { tone(520, 360, .16, .14, 'sine'); tone(520, 360, .16, .14, 'sine', .14); tone(200, 80, .08, .15); }
    else if (kind === 'end') { tone(523, 523, .25, .12, 'sine'); tone(659, 659, .25, .12, 'sine', .12); tone(784, 784, .4, .12, 'sine', .24); }
    else if (kind === 'start') { tone(440, 660, .14, .1, 'sine'); }
    else tone(190, 85, .09, .2);
  } catch { /* không có âm thanh */ }
}

// ---------- giao diện ----------
export function applyTheme() {
  document.documentElement.dataset.theme = cfg.theme; document.documentElement.dataset.board = cfg.board;
  document.documentElement.dataset.anim = cfg.anim ? 'on' : 'off';
  saveCfg(); for (const f of themeListeners) f();
}
const themeListeners = [];
export const onTheme = (f) => themeListeners.push(f);

// Hộp thoại thông báo đơn giản (thay alert)
export function msg(text) { $('msgText').textContent = text; $('msgDlg').showModal(); }

// ---------- điều hướng ----------
export const VIEWS = ['menu', 'game', 'cgame', 'studio'];
const viewListeners = [];
export const onView = (f) => viewListeners.push(f);
export let current = 'menu';
export function show(name) {
  current = name;
  for (const v of VIEWS) $(v + 'View').hidden = v !== name;
  $('backBtn').hidden = name === 'menu';
  document.documentElement.dataset.view = name;
  for (const f of viewListeners) f(name);
  try { history.replaceState(null, '', '#' + name); } catch { /* file:// */ }
  window.scrollTo?.(0, 0);
}

// ---------- hộp thoại cài đặt (có xem trước bộ quân) ----------
export function initSettings() {
  ensureDefs();
  for (const [k, v] of Object.entries(PIECE_SETS)) $('pieceSel').add(new Option(v, k));
  const demo = () => { $('pieceDemo').innerHTML = STD.slice().reverse().map((t, i) => `<span class="pd">${pieceSvg(t, i % 2 ? 'b' : 'w', cfg.pieces)}</span>`).join(''); };
  const sync = () => { $('themeSel').value = cfg.theme; $('boardSel').value = cfg.board; $('pieceSel').value = cfg.pieces; $('soundChk').checked = cfg.sound; $('animChk').checked = cfg.anim; demo(); };
  const open = () => { sync(); $('settingsDlg').showModal(); };
  $('settingsBtn').onclick = open; $('menuSettings').onclick = open; $('settingsClose').onclick = () => $('settingsDlg').close();
  $('themeSel').onchange = (e) => { cfg.theme = e.target.value; applyTheme(); };
  $('boardSel').onchange = (e) => { cfg.board = e.target.value; applyTheme(); };
  $('pieceSel').onchange = (e) => { cfg.pieces = e.target.value; demo(); applyTheme(); };
  $('soundChk').onchange = (e) => { cfg.sound = e.target.checked; saveCfg(); if (cfg.sound) sfx('move'); };
  $('animChk').onchange = (e) => { cfg.anim = e.target.checked; applyTheme(); };
  $('msgOk').onclick = () => $('msgDlg').close();
  applyTheme();
}
