/* =====================================================================
   S11-b. 두뇌게임 공용 효과음 엔진 (game-sfx.js)
   ---------------------------------------------------------------------
   · 외부 MP3/WAV 없이 Web Audio API 신디사이저로만 소리를 만듭니다.
     (네트워크 지연·404 없음, 울리는 즉시 반응)
   · iOS Safari / PWA: 사용자의 탭·클릭 제스처 안에서 unlockSfx() 를 불러
     AudioContext 를 깨웁니다. (무음 1샘플 재생)
   · 사운드를 지원하지 않는 환경·브라우저 정책에서도 게임이 멈추지 않도록
     모든 오디오 호출은 try/catch 로 감쌉니다.
   · ON/OFF 는 localStorage 'mina_game_sfx_v1' 에 '1'(기본) / '0'(무음)로 저장합니다.
   · 새 주간 게임에서도 sfx.start() · sfx.correct() · sfx.wrong() ·
     sfx.finish() · sfx.record() 를 그대로 호출하면 됩니다.
   ===================================================================== */
import { icon, toast } from './ui.js?v=2.0.36';

var LS_KEY = 'mina_game_sfx_v1';
var ctx = null;
var master = null;
var enabled = readPref();

function readPref() {
  try {
    return localStorage.getItem(LS_KEY) !== '0';
  } catch (err) {
    return true;
  }
}

function savePref() {
  try {
    localStorage.setItem(LS_KEY, enabled ? '1' : '0');
  } catch (err) { /* 저장 실패해도 이번 세션 재생은 유지 */ }
}

export function isSfxOn() {
  return enabled;
}

/* 컨텍스트 준비 — 꺼져 있거나 미지원이면 null */
function audio() {
  if (!enabled) return null;
  try {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  } catch (err) {
    return null;
  }
}

/* 사용자 제스처 안에서 호출 — iOS 오디오 잠금 해제 */
export function unlockSfx() {
  var c = audio();
  if (!c) return;
  try {
    var buf = c.createBuffer(1, 1, c.sampleRate || 8000);
    var src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch (err) { /* 무시 */ }
}

/* ------------------------------------------------------------- 신디사이저 */
function tone(freq, delay, dur, opt) {
  var c = audio();
  if (!c) return;
  try {
    var o = c.createOscillator();
    var g = c.createGain();
    var t0 = c.currentTime + (delay || 0);
    var peak = (opt && opt.gain !== undefined) ? opt.gain : 0.14;
    var attack = (opt && opt.attack) ? opt.attack : 0.01;
    o.type = (opt && opt.type) || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opt && opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(40, opt.to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  } catch (err) { /* 사운드 실패는 게임을 멈추지 않습니다 */ }
}

/* 맑은 벨·마림바 소리 (기본음 + 배음 2개) */
function bell(freq, delay, dur, gain) {
  var g = gain || 0.13;
  tone(freq, delay, dur, { type: 'sine', gain: g });
  tone(freq * 2, delay, dur * 0.55, { type: 'sine', gain: g * 0.32 });
  tone(freq * 3.01, delay, dur * 0.3, { type: 'sine', gain: g * 0.14 });
}

/* 필터를 거친 노이즈 (지글지글·휙·물줄기) */
function noise(dur, opt) {
  var o = opt || {};
  var c = audio();
  if (!c) return;
  try {
    var len = Math.max(1, Math.ceil(c.sampleRate * dur));
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    var src = c.createBufferSource();
    src.buffer = buf;
    var f = c.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1800, c.currentTime + (o.delay || 0));
    f.Q.value = o.q || 0.8;
    var g = c.createGain();
    var t0 = c.currentTime + (o.delay || 0);
    var peak = o.gain || 0.07;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.to), t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  } catch (err) { /* 무시 */ }
}

/* 순서 기억 9칸 — C5~G6 펜타토닉 (멜로디처럼 기억) */
var SCALE = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51, 1567.98];

export var sfx = {
  /* 공통 */
  tap: function () {
    tone(680, 0, 0.09, { type: 'triangle', gain: 0.09, to: 540 });
  },
  start: function () {
    bell(784, 0, 0.34, 0.12);
    bell(1046.5, 0.12, 0.5, 0.12);
  },
  finish: function () {
    bell(523.25, 0, 0.3, 0.12);
    bell(659.25, 0.1, 0.3, 0.12);
    bell(783.99, 0.2, 0.34, 0.12);
    bell(1046.5, 0.3, 0.7, 0.14);
  },
  record: function () {
    bell(659.25, 0, 0.26, 0.11);
    bell(880, 0.09, 0.26, 0.11);
    bell(1046.5, 0.18, 0.3, 0.12);
    bell(1318.51, 0.27, 0.72, 0.14);
  },
  correct: function () {
    tone(880, 0, 0.13, { type: 'triangle', gain: 0.12 });
    tone(1318.51, 0.05, 0.2, { type: 'sine', gain: 0.1 });
  },
  nope: function () {
    tone(300, 0, 0.13, { type: 'triangle', gain: 0.07, to: 240 });
  },
  wrong: function () {
    tone(233, 0, 0.22, { type: 'triangle', gain: 0.11, to: 165 });
    tone(174, 0.1, 0.24, { type: 'sine', gain: 0.07 });
  },
  note: function (i) {
    var idx = ((Number(i) || 0) % SCALE.length + SCALE.length) % SCALE.length;
    bell(SCALE[idx], 0, 0.42, 0.12);
  },
  pop: function (step) {
    var n = Math.max(0, Number(step) || 0);
    var f = 380 + (n % 25) * 15;
    tone(f, 0, 0.09, { type: 'triangle', gain: 0.12 });
    tone(f * 2, 0.006, 0.06, { type: 'sine', gain: 0.045 });
    if (n % 5 === 0) bell(f * 2.2, 0.02, 0.16, 0.06);
  },
  chime: function () {
    bell(1046.5, 0, 0.36, 0.11);
    bell(783.99, 0.13, 0.36, 0.1);
    bell(659.25, 0.26, 0.6, 0.1);
  },
  /* 양궁 */
  bow: function () {
    noise(0.22, { freq: 2600, to: 700, gain: 0.09, q: 1.1 });
    tone(190, 0.01, 0.16, { type: 'sine', gain: 0.06, to: 90 });
  },
  hit: function (score) {
    var s = Number(score) || 0;
    if (s >= 10) {
      bell(1567.98, 0, 0.6, 0.14);
      bell(2349, 0.02, 0.5, 0.07);
    } else if (s >= 8) {
      bell(987.77, 0, 0.34, 0.12);
    } else if (s >= 6) {
      tone(440, 0, 0.14, { type: 'triangle', gain: 0.1, to: 380 });
      noise(0.08, { freq: 1400, gain: 0.04 });
    } else {
      noise(0.18, { freq: 500, to: 200, gain: 0.07 });
      tone(180, 0, 0.16, { type: 'sine', gain: 0.06, to: 110 });
    }
  },
  /* 주방 */
  door: function () {
    bell(2093, 0, 0.14, 0.09);
    bell(2637, 0.05, 0.5, 0.09);
  },
  sizzle: function () {
    noise(0.5, { freq: 3200, gain: 0.045, q: 0.55 });
    tone(95, 0, 0.34, { type: 'sine', gain: 0.05, to: 70 });
  },
  ready: function () {
    bell(1174.66, 0, 0.28, 0.11);
    bell(1567.98, 0.09, 0.4, 0.11);
  },
  push: function () {
    noise(0.15, { freq: 900, to: 380, gain: 0.06 });
    tone(300, 0, 0.11, { type: 'triangle', gain: 0.05, to: 200 });
  },
  topping: function () {
    tone(520, 0, 0.09, { type: 'triangle', gain: 0.1 });
    tone(760, 0.05, 0.12, { type: 'sine', gain: 0.075 });
  },
  drink: function () {
    noise(0.45, { freq: 1300, to: 2600, gain: 0.055, q: 2.2 });
    tone(620, 0.12, 0.1, { type: 'sine', gain: 0.045 });
    tone(840, 0.3, 0.1, { type: 'sine', gain: 0.045 });
  },
  serve: function (combo) {
    var n = Math.min(6, Math.max(0, Number(combo) || 0));
    var f = 880 * Math.pow(2, n / 12);
    bell(f, 0, 0.24, 0.12);
    bell(f * 1.5, 0.08, 0.42, 0.11);
  },
  happy: function () {
    bell(1046.5, 0, 0.16, 0.11);
    bell(1318.51, 0.07, 0.16, 0.11);
    bell(1567.98, 0.14, 0.5, 0.12);
  },
  sad: function () {
    tone(392, 0, 0.26, { type: 'triangle', gain: 0.09 });
    tone(329.63, 0.16, 0.28, { type: 'triangle', gain: 0.085 });
    tone(261.63, 0.32, 0.44, { type: 'sine', gain: 0.075 });
  },
  close: function () {
    bell(880, 0, 0.5, 0.11);
    bell(659.25, 0.16, 0.8, 0.1);
  },
  /* 블록 블라스트 */
  select: function () {
    tone(760, 0, 0.07, { type: 'triangle', gain: 0.09, to: 980 });
  },
  place: function () {
    tone(212, 0, 0.13, { type: 'sine', gain: 0.13, to: 132 });
    noise(0.07, { freq: 1500, to: 600, gain: 0.045 });
    bell(587.33, 0.02, 0.16, 0.05);
  },
  clear: function (lines) {
    var n = Math.min(4, Math.max(1, Number(lines) || 1));
    var base = 783.99 * Math.pow(2, (n - 1) / 6);
    bell(base, 0, 0.3, 0.11);
    bell(base * 1.25, 0.06, 0.3, 0.1);
    bell(base * 1.5, 0.12, 0.42, 0.1);
    if (n >= 2) bell(base * 2, 0.18, 0.55, 0.1);
    if (n >= 3) bell(base * 2.5, 0.26, 0.6, 0.08);
  },
  refill: function () {
    tone(520, 0, 0.08, { type: 'triangle', gain: 0.09, to: 700 });
    bell(880, 0.04, 0.24, 0.08);
  }
};

/* --------------------------------------------------------- ON/OFF 토글 UI */
export function sfxToggleHtml(id) {
  var on = enabled;
  var label = on ? '효과음 끄기' : '효과음 켜기';
  return '<button type="button" class="bg-sfx-btn' + (on ? ' is-on' : '') + '"' +
    (id ? ' id="' + id + '"' : '') +
    ' data-sfx-toggle="1" aria-pressed="' + (on ? 'true' : 'false') + '"' +
    ' aria-label="' + label + '" title="' + label + '">' +
    icon(on ? 'volumeOn' : 'volumeOff', 17) +
  '</button>';
}

export function refreshSfxButtons() {
  if (typeof document === 'undefined') return;
  var els = document.querySelectorAll('[data-sfx-toggle]');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var label = enabled ? '효과음 끄기' : '효과음 켜기';
    el.innerHTML = icon(enabled ? 'volumeOn' : 'volumeOff', 17);
    if (enabled) el.classList.add('is-on');
    else el.classList.remove('is-on');
    el.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    el.setAttribute('aria-label', label);
    el.setAttribute('title', label);
  }
}

function onToggle(ev) {
  if (ev) ev.stopPropagation();
  unlockSfx();
  enabled = !enabled;
  savePref();
  refreshSfxButtons();
  if (enabled) {
    sfx.start();
    toast('게임 효과음을 켰어요', 'default');
  } else {
    toast('게임 효과음을 껐어요', 'default');
  }
}

/* root 안의 토글 버튼에 클릭을 붙입니다(여러 번 불러도 한 번만 붙습니다). */
export function bindSfxToggles(root) {
  var host = root || document;
  var els = host.querySelectorAll('[data-sfx-toggle]');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    if (el.getAttribute('data-sfx-bound') === '1') continue;
    el.setAttribute('data-sfx-bound', '1');
    el.addEventListener('click', onToggle);
  }
  refreshSfxButtons();
}
