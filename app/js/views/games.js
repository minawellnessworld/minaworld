/* S11. BRAIN GAME — 두뇌게임 5종 + 최고기록·연속 출석(스트릭)
   ---------------------------------------------------------------------
   · 저장·표시하는 값은 본인이 실제로 플레이한 기록뿐입니다.
     (최고기록 · 최근기록 · 오늘 완료 · 연속 플레이 일수 / 타인 비교·뇌나이 없음)
   · 포인트 적립과 연결하지 않습니다. (체크인 하루 +5P 정책만 유지)
   · 타이머(setTimeout/setInterval)와 애니메이션(requestAnimationFrame)은
     게임 종료·다른 화면 이동(destroy) 시 모두 정리합니다.
   · 게임 개수는 config.js 의 BRAIN_GAMES 길이를 그대로 따릅니다.
   ===================================================================== */
import { BRAIN_GAMES, brainGameMeta, brainGameScoreText } from '../config.js?v=2.0.29';
import {
  state, listBrainGameLogs, saveBrainGameLog, computeBrainGameStats, friendlyError
} from '../store.js?v=2.0.29';
import { icon, esc, toast, go, noticeBox } from '../ui.js?v=2.0.29';
import { sfx, unlockSfx, sfxToggleHtml, bindSfxToggles } from '../game-sfx.js?v=2.0.29';

var WEEK_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

var STROOP_COLORS = [
  { name: '빨강', ink: '#B4453F' },
  { name: '파랑', ink: '#1F4E9C' },
  { name: '초록', ink: '#1F7A5A' },
  { name: '노랑', ink: '#C98A0B' }
];

/* ---------------------------------------------------------------- timers */
var timers = [];
var rafId = 0;

function later(fn, ms) {
  var id = setTimeout(function () {
    timers = timers.filter(function (t) { return t !== id; });
    fn();
  }, ms);
  timers.push(id);
  return id;
}

function every(fn, ms) {
  var id = setInterval(fn, ms);
  timers.push(id);
  return id;
}

/* requestAnimationFrame 루프 — 한 프레임만 예약하고, 끝나면 스스로 다시 예약합니다. */
function frame(fn) {
  rafId = requestAnimationFrame(fn);
  return rafId;
}

function stopFrames() {
  if (rafId) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

function clearAllTimers() {
  for (var i = 0; i < timers.length; i++) {
    clearTimeout(timers[i]);
    clearInterval(timers[i]);
  }
  timers = [];
  stopFrames();
}

export function destroy() {
  clearAllTimers();
}

/* ----------------------------------------------------------------- html */
function weekHtml(stats) {
  return stats.last7Days.map(function (d) {
    return '<span class="bg-week-day' + (d.played ? ' is-on' : '') + '" title="' + esc(d.date) + '">' +
      '<span class="bg-week-dot"></span>' +
      '<span class="bg-week-num">' + WEEK_SHORT[d.weekday] + '</span>' +
    '</span>';
  }).join('');
}

function boardHtml(stats) {
  var total = stats.gameCount || BRAIN_GAMES.length;
  var pct = total ? Math.round((stats.todayCount / total) * 100) : 0;
  var complete = stats.todayCount >= total;
  return '<div class="bg-board-inner">' +
    '<div class="bg-streak">' +
      '<span class="bg-streak-ico">' + icon('flame', 22) + '</span>' +
      '<span class="bg-streak-body">' +
        '<strong>' + (stats.streakDays > 0 ? stats.streakDays + '일 연속 플레이' : '오늘 첫 판을 시작해 보세요') + '</strong>' +
        '<span>' + (stats.streakDays > 0 ? '하루 한 판이면 기록이 이어집니다' : total + '종 두뇌게임 · 1~2분이면 충분해요') + '</span>' +
      '</span>' +
      '<span class="bg-streak-total">누적<strong>' + stats.totalPlays + '</strong>판</span>' +
    '</div>' +
    '<div class="bg-today">' +
      '<div class="bg-today-head"><strong>오늘 챌린지</strong><span>' + stats.todayCount + '/' + total + ' 완료</span></div>' +
      '<div class="bg-progress"><span class="bg-progress-bar" style="width:' + pct + '%"></span></div>' +
      '<div class="bg-week" aria-label="최근 7일 플레이 기록">' + weekHtml(stats) + '</div>' +
    '</div>' +
    (complete
      ? '<div class="bg-complete">' + icon('trophy', 18) +
          '<span><strong>오늘의 두뇌 워밍업 ' + total + '종 완주!</strong><span>내일도 한 판씩 이어가면 연속 기록이 늘어납니다.</span></span>' +
        '</div>'
      : '') +
    (!state.session
      ? '<div class="bg-guest">' + icon('user', 16) +
          '<span>로그인하면 최고기록과 연속 플레이 일수가 내 계정에 저장됩니다.</span>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="bg-login">로그인</button>' +
        '</div>'
      : '') +
  '</div>';
}

function hubHtml(stats) {
  var cards = BRAIN_GAMES.map(function (g) {
    var best = stats.bestByGame[g.key];
    var latest = stats.latestByGame[g.key];
    var doneToday = Boolean(stats.todayGames[g.key]);
    return '<button type="button" class="bg-game-card' + (doneToday ? ' is-done' : '') + '" data-game="' + esc(g.key) + '">' +
      '<span class="bg-game-ico tone-' + esc(g.tone) + '">' + icon(g.ico, 20) + '</span>' +
      '<span class="bg-game-text">' +
        '<span class="bg-game-area">' + esc(g.area) + '</span>' +
        '<strong>' + esc(g.title) + '</strong>' +
        '<span class="bg-game-sub">' + esc(g.desc) + '</span>' +
        '<span class="bg-game-meta">' +
          '<span class="bg-game-best">' + (best ? '최고 ' + brainGameScoreText(g.key, best.score) : '첫 기록 도전') + '</span>' +
          (latest ? '<span class="bg-game-latest">최근 ' + brainGameScoreText(g.key, latest.score) + '</span>' : '') +
        '</span>' +
      '</span>' +
      (doneToday
        ? '<span class="bg-done">' + icon('check', 12) + '오늘 완료</span>'
        : '<span class="bg-play-ico">' + icon('chevronRight', 16) + '</span>') +
    '</button>';
  }).join('');

  var total = BRAIN_GAMES.length;
  return '<div class="section-head"><h2 class="section-title">' + total + '종 두뇌게임</h2>' +
      '<div class="section-action bg-hub-tools"><span class="muted small">자유롭게 · 몇 번이든</span>' +
        sfxToggleHtml('bg-sfx-hub') + '</div></div>' +
    '<div class="bg-games">' + cards + '</div>' +
    '<p class="bg-guide">게임은 골라서 몇 번이든 즐길 수 있어요. 오늘 ' + total + '종을 모두 하면 하루 챌린지가 완성됩니다.</p>';
}

function resultHtml(key, meta, result, isRecord, stats, saveFailed) {
  var best = stats.bestByGame[key];
  var latest = stats.latestByGame[key];
  var total = stats.gameCount || BRAIN_GAMES.length;
  var accuracyLabel = key === 'stroop_color' ? '정답률' : '정확도';
  var note = saveFailed
    ? '기록 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.'
    : (state.session ? '기록이 내 계정에 저장되었습니다.' : '게스트 기록으로 이 기기에 저장되었습니다 · 로그인하면 계정에 남습니다.');
  return '<div class="bg-result">' +
    '<span class="bg-result-tag">' + esc(meta.area) + '</span>' +
    '<strong class="bg-result-title">' + esc(meta.title) + '</strong>' +
    '<div class="bg-result-score">' + brainGameScoreText(key, result.score) + '</div>' +
    (isRecord
      ? '<span class="bg-new-record">' + icon('trophy', 14) + '새 최고 기록!</span>'
      : '<span class="bg-result-sub">이번 판 기록</span>') +
    '<div class="bg-result-rows">' +
      '<div class="bg-result-row"><span>최고 기록</span><strong>' + (best ? brainGameScoreText(key, best.score) : '-') + '</strong></div>' +
      '<div class="bg-result-row"><span>최근 기록</span><strong>' + (latest ? brainGameScoreText(key, latest.score) : '-') + '</strong></div>' +
      (result.accuracy === null || result.accuracy === undefined
        ? ''
        : '<div class="bg-result-row"><span>' + accuracyLabel + '</span><strong>' + Number(result.accuracy) + '%</strong></div>') +
      '<div class="bg-result-row"><span>오늘 챌린지</span><strong>' + stats.todayCount + '/' + total + ' 완료</strong></div>' +
      '<div class="bg-result-row"><span>연속 플레이</span><strong>' + stats.streakDays + '일</strong></div>' +
    '</div>' +
    '<p class="bg-save-note">' + esc(note) + '</p>' +
    '<div class="bg-result-actions">' +
      '<button type="button" class="btn btn-primary btn-block" data-again="1">다시 하기</button>' +
      '<button type="button" class="btn btn-ghost btn-block" data-hub="1">다른 게임 선택</button>' +
    '</div>' +
  '</div>';
}

/* ------------------------------------------------------------ 게임 공통 */
function tilesHtml() {
  var out = '';
  for (var i = 0; i < 9; i++) {
    out += '<button type="button" class="bg-tile" data-tile="' + i + '" aria-label="' + (i + 1) + '번 칸"><span class="bg-tile-dot"></span></button>';
  }
  return out;
}

function shuffleNumbers() {
  var arr = [];
  for (var i = 1; i <= 25; i++) arr.push(i);
  for (var j = arr.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var tmp = arr[j];
    arr[j] = arr[k];
    arr[k] = tmp;
  }
  return arr;
}

function pickIndex(length, exclude) {
  var idx = Math.floor(Math.random() * length);
  if (length > 1 && idx === exclude) idx = (idx + 1) % length;
  return idx;
}

/* ------------------------------------------------- 1) 순서 기억 (memory_seq) */
function runMemory(playEl, done) {
  var seq = [];
  var completed = 0;
  var pos = 0;
  var locked = true;

  playEl.innerHTML =
    '<div class="bg-hud">' +
      '<span class="bg-hud-item">라운드<strong id="bg-mem-round">1</strong></span>' +
      '<span class="bg-hud-item">길이<strong id="bg-mem-len">3</strong>칸</span>' +
      '<span class="bg-hud-item">클리어<strong id="bg-mem-clear">0</strong></span>' +
    '</div>' +
    '<div class="bg-tiles" id="bg-tiles">' + tilesHtml() + '</div>' +
    '<p class="bg-status" id="bg-status">잠시 후 불빛 순서가 시작됩니다…</p>';

  var tilesEl = playEl.querySelector('#bg-tiles');
  var statusEl = playEl.querySelector('#bg-status');
  var roundEl = playEl.querySelector('#bg-mem-round');
  var lenEl = playEl.querySelector('#bg-mem-len');
  var clearEl = playEl.querySelector('#bg-mem-clear');
  var tileBtns = tilesEl.querySelectorAll('.bg-tile');

  function buildSeq(length) {
    var out = [];
    var prev = -1;
    for (var i = 0; i < length; i++) {
      prev = pickIndex(9, prev);
      out.push(prev);
    }
    return out;
  }

  function playSequence() {
    locked = true;
    var i = 0;
    function step() {
      if (i >= seq.length) {
        later(function () {
          locked = false;
          pos = 0;
          tilesEl.classList.add('is-input');
          statusEl.textContent = '이제 순서대로 눌러 보세요!';
        }, 300);
        return;
      }
      var idx = seq[i];
      tileBtns[idx].classList.add('is-lit');
      sfx.note(idx);
      later(function () {
        tileBtns[idx].classList.remove('is-lit');
        i += 1;
        later(step, 160);
      }, 500);
    }
    later(step, 450);
  }

  function startRound() {
    var level = completed + 1;
    seq = buildSeq(2 + level);
    pos = 0;
    roundEl.textContent = String(level);
    lenEl.textContent = String(seq.length);
    clearEl.textContent = String(completed);
    statusEl.textContent = '순서를 기억하세요…';
    tilesEl.classList.remove('is-input');
    playSequence();
  }

  function onTile() {
    if (locked) return;
    var idx = Number(this.getAttribute('data-tile'));
    if (idx === seq[pos]) {
      var self = this;
      self.classList.add('is-tap');
      sfx.note(idx);
      later(function () { self.classList.remove('is-tap'); }, 180);
      pos += 1;
      if (pos >= seq.length) {
        locked = true;
        completed += 1;
        clearEl.textContent = String(completed);
        tilesEl.classList.remove('is-input');
        statusEl.textContent = '좋아요! ' + completed + '단계 성공 — 다음 라운드로 이어집니다.';
        sfx.correct();
        later(startRound, 800);
      }
    } else {
      locked = true;
      this.classList.add('is-wrong');
      sfx.wrong();
      tilesEl.classList.remove('is-input');
      statusEl.textContent = '앗, 순서가 달라요. ' + completed + '단계에서 기록이 저장됩니다.';
      later(function () {
        done({ game_key: 'memory_seq', score: completed, metric_ms: null, accuracy: null });
      }, 900);
    }
  }

  for (var t = 0; t < tileBtns.length; t++) {
    tileBtns[t].addEventListener('click', onTile);
  }

  later(startRound, 500);
}

/* --------------------------------------- 2) 색깔 vs 글자 (stroop_color) */
function runStroop(playEl, done) {
  var TOTAL_MS = 30000;
  var endAt = 0;
  var correct = 0;
  var attempts = 0;
  var answerName = '';
  var finished = false;

  var optionHtml = STROOP_COLORS.map(function (c) {
    return '<button type="button" class="bg-stroop-btn" data-color="' + esc(c.name) + '">' + esc(c.name) + '</button>';
  }).join('');

  playEl.innerHTML =
    '<div class="bg-hud">' +
      '<span class="bg-hud-item">남은 시간<strong id="bg-stroop-time">30.0</strong>초</span>' +
      '<span class="bg-hud-item">정답<strong id="bg-stroop-score">0</strong></span>' +
    '</div>' +
    '<div class="bg-timerbar"><span class="bg-timerbar-fill" id="bg-stroop-bar"></span></div>' +
    '<div class="bg-stroop-card">' +
      '<span class="bg-stroop-hint">글자의 뜻이 아니라 <strong>글자 색깔</strong>을 고르세요</span>' +
      '<div class="bg-stroop-word" id="bg-stroop-word">빨강</div>' +
    '</div>' +
    '<div class="bg-stroop-options" id="bg-stroop-options">' + optionHtml + '</div>' +
    '<p class="bg-status" id="bg-status">곧 시작합니다…</p>';

  var wordEl = playEl.querySelector('#bg-stroop-word');
  var statusEl = playEl.querySelector('#bg-status');
  var timeEl = playEl.querySelector('#bg-stroop-time');
  var scoreEl = playEl.querySelector('#bg-stroop-score');
  var barEl = playEl.querySelector('#bg-stroop-bar');
  var optionEl = playEl.querySelector('#bg-stroop-options');
  var optionBtns = optionEl.querySelectorAll('[data-color]');

  function nextWord() {
    var wordIdx = pickIndex(STROOP_COLORS.length, -1);
    var inkIdx = pickIndex(STROOP_COLORS.length, wordIdx);
    answerName = STROOP_COLORS[inkIdx].name;
    wordEl.textContent = STROOP_COLORS[wordIdx].name;
    wordEl.style.color = STROOP_COLORS[inkIdx].ink;
  }

  function tick() {
    var left = Math.max(0, endAt - Date.now());
    timeEl.textContent = (left / 1000).toFixed(1);
    barEl.style.width = Math.max(0, Math.min(100, (left / TOTAL_MS) * 100)) + '%';
    if (left <= 0 && !finished) finish();
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearAllTimers();
    var accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
    wordEl.textContent = '끝!';
    wordEl.style.color = '#070D1E';
    sfx.chime();
    statusEl.textContent = '30초 완료 — 맞힌 개수 ' + correct + '개 · 정답률 ' + accuracy + '%';
    done({ game_key: 'stroop_color', score: correct, metric_ms: null, accuracy: accuracy });
  }

  function onAnswer() {
    if (finished) return;
    var picked = this.getAttribute('data-color');
    attempts += 1;
    if (picked === answerName) {
      correct += 1;
      sfx.correct();
      scoreEl.textContent = String(correct);
      wordEl.classList.add('is-correct');
      later(function () { wordEl.classList.remove('is-correct'); }, 160);
    } else {
      sfx.nope();
      wordEl.classList.add('is-miss');
      later(function () { wordEl.classList.remove('is-miss'); }, 180);
    }
    nextWord();
  }

  for (var o = 0; o < optionBtns.length; o++) {
    optionBtns[o].addEventListener('click', onAnswer);
  }

  later(function () {
    nextWord();
    endAt = Date.now() + TOTAL_MS;
    statusEl.textContent = '시작! 색깔을 고르세요.';
    every(tick, 100);
    tick();
  }, 700);
}

/* ------------------------------------- 3) 1→25 숫자 터치 (number_grid) */
function runNumberGrid(playEl, done) {
  var cells = shuffleNumbers();
  var next = 1;
  var started = false;
  var finished = false;
  var startAt = 0;
  var mistakes = 0;

  var cellHtml = cells.map(function (n) {
    return '<button type="button" class="bg-num" data-num="' + n + '">' + n + '</button>';
  }).join('');

  playEl.innerHTML =
    '<div class="bg-hud">' +
      '<span class="bg-hud-item">시간<strong id="bg-num-time">0.00</strong>초</span>' +
      '<span class="bg-hud-item">다음 숫자<strong id="bg-num-next">1</strong></span>' +
      '<span class="bg-hud-item">실수<strong id="bg-num-miss">0</strong></span>' +
    '</div>' +
    '<div class="bg-number-grid" id="bg-number-grid">' + cellHtml + '</div>' +
    '<p class="bg-status" id="bg-status">1을 누르면 타이머가 시작됩니다!</p>';

  var gridEl = playEl.querySelector('#bg-number-grid');
  var timeEl = playEl.querySelector('#bg-num-time');
  var nextEl = playEl.querySelector('#bg-num-next');
  var missEl = playEl.querySelector('#bg-num-miss');
  var statusEl = playEl.querySelector('#bg-status');
  var numBtns = gridEl.querySelectorAll('.bg-num');

  every(function () {
    if (!started || finished) return;
    timeEl.textContent = ((Date.now() - startAt) / 1000).toFixed(2);
  }, 50);

  function finish() {
    if (finished) return;
    finished = true;
    clearAllTimers();
    var elapsed = Math.max(1, Date.now() - startAt);
    timeEl.textContent = (elapsed / 1000).toFixed(2);
    nextEl.textContent = '완료';
    sfx.chime();
    statusEl.textContent = '25까지 완료! 걸린 시간 ' + (elapsed / 1000).toFixed(2) + '초 · 실수 ' + mistakes + '회';
    done({ game_key: 'number_grid', score: elapsed, metric_ms: elapsed, accuracy: null });
  }

  function onCell() {
    if (finished) return;
    var value = Number(this.getAttribute('data-num'));
    if (value !== next) {
      var self = this;
      self.classList.add('is-shake');
      sfx.nope();
      later(function () { self.classList.remove('is-shake'); }, 320);
      mistakes += 1;
      missEl.textContent = String(mistakes);
      statusEl.textContent = '다음은 ' + next + '입니다!';
      return;
    }
    if (!started) {
      started = true;
      startAt = Date.now();
      statusEl.textContent = '좋아요, 끝까지 이어가세요!';
    }
    this.classList.add('is-done');
    this.disabled = true;
    sfx.pop(value);
    next += 1;
    if (next > 25) {
      finish();
      return;
    }
    nextEl.textContent = String(next);
  }

  for (var c = 0; c < numBtns.length; c++) {
    numBtns[c].addEventListener('click', onCell);
  }
}

/* ----------------------- 4) 양궁 과녁 맞히기 (archery_target) */
var ARC_TOTAL_SHOTS = 5;
var ARC_MAX_SCORE = 50;

/* 과녁판 한가운데를 0, 흰색(6점) 테두리를 1로 본 거리 비율 */
function arcRingOf(dx, dy) {
  var r = Math.sqrt(dx * dx + dy * dy) / 50;
  if (r <= 0.2) return 10;
  if (r <= 0.4) return 9;
  if (r <= 0.6) return 8;
  if (r <= 0.8) return 7;
  if (r <= 1) return 6;
  return 0;
}

function arcFeedback(score) {
  if (score === 10) return '10점! 정중앙!';
  if (score === 9) return '9점! 아주 좋아요';
  if (score === 8) return '8점! 좋아요';
  if (score === 7) return '7점 — 조금만 더 중앙으로';
  if (score === 6) return '6점 — 과녁 끝이에요';
  return '과녁 밖! 다음 발을 노려 보세요';
}

function runArchery(playEl, done) {
  var shots = [];
  var phase = 'wait';       /* wait | aim | feedback */
  var activeT = 0;          /* 조준점이 실제로 움직인 시간(초) */
  var lastTick = 0;
  var speedUp = 1;
  var finished = false;
  var aimX = 0;
  var aimY = 0;

  var ringHtml = ['6', '7', '8', '9', '10'].map(function (n) {
    return '<span class="bg-arc-ring is-' + n + '" aria-hidden="true"></span>';
  }).join('');

  var badgeHtml = '';
  for (var b = 0; b < ARC_TOTAL_SHOTS; b++) {
    badgeHtml += '<span class="bg-arc-shot" data-shot="' + b + '">-</span>';
  }

  playEl.innerHTML =
    '<div class="bg-hud">' +
      '<span class="bg-hud-item">라운드<strong id="bg-arc-round">1</strong>/' + ARC_TOTAL_SHOTS + '</span>' +
      '<span class="bg-hud-item">합계<strong id="bg-arc-total">0</strong>점</span>' +
    '</div>' +
    '<div class="bg-archery">' +
      '<div class="bg-archery-board" id="bg-arc-board" role="button" tabindex="0" aria-label="과녁판 — 누르면 화살을 쏩니다">' +
        ringHtml +
        '<span class="bg-arc-x" aria-hidden="true"></span>' +
        '<span class="bg-arc-aim" id="bg-arc-aim" aria-hidden="true"></span>' +
      '</div>' +
    '</div>' +
    '<div class="bg-arc-shots" id="bg-arc-shots">' + badgeHtml + '</div>' +
    '<button type="button" class="btn btn-primary btn-block bg-arc-shoot" id="bg-arc-shoot">화살 쏘기</button>' +
    '<p class="bg-status" id="bg-status">조준점이 과녁 위를 흔들립니다. 중앙에 가까울 때 쏘세요!</p>';

  var boardEl = playEl.querySelector('#bg-arc-board');
  var aimEl = playEl.querySelector('#bg-arc-aim');
  var shotsEl = playEl.querySelector('#bg-arc-shots');
  var roundEl = playEl.querySelector('#bg-arc-round');
  var totalEl = playEl.querySelector('#bg-arc-total');
  var statusEl = playEl.querySelector('#bg-status');
  var shootBtn = playEl.querySelector('#bg-arc-shoot');

  function totalScore() {
    var sum = 0;
    for (var i = 0; i < shots.length; i++) sum += shots[i];
    return sum;
  }

  function updateAim() {
    /* 리사주 궤적 — 두 축의 주기가 달라 과녁 안을 자연스럽게 흔들립니다.
       발사할수록 조금씩 빨라지지만 5발 안에 충분히 맞힐 수 있는 속도입니다. */
    var amp = 40;
    var w = 1.7 * speedUp;
    aimX = amp * Math.sin(activeT * w + 0.7);
    aimY = amp * Math.sin(activeT * w * 1.41 + 2.1);
    aimEl.style.left = (50 + aimX) + '%';
    aimEl.style.top = (50 + aimY) + '%';
  }

  function loop() {
    if (finished) return;
    var now = Date.now();
    var dt = lastTick ? (now - lastTick) / 1000 : 0;
    lastTick = now;
    if (phase === 'aim') {
      activeT += dt;
      updateAim();
    }
    frame(loop);
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearAllTimers();
    var sum = totalScore();
    var accuracy = Math.round((sum / ARC_MAX_SCORE) * 100);
    statusEl.textContent = ARC_TOTAL_SHOTS + '발 완료 — 합계 ' + sum + '점 · 정확도 ' + accuracy + '%';
    done({ game_key: 'archery_target', score: sum, metric_ms: null, accuracy: accuracy });
  }

  function shoot() {
    if (finished || phase !== 'aim') return;
    phase = 'feedback';
    speedUp += 0.12;
    var score = arcRingOf(aimX, aimY);
    shots.push(score);
    sfx.bow();
    later(function () { sfx.hit(score); }, 90);

    var pin = document.createElement('span');
    pin.className = 'bg-arc-pin' + (score === 10 ? ' is-ten' : '') + (score === 0 ? ' is-out' : '');
    pin.style.left = (50 + aimX) + '%';
    pin.style.top = (50 + aimY) + '%';
    boardEl.appendChild(pin);

    var badge = shotsEl.querySelector('[data-shot="' + (shots.length - 1) + '"]');
    if (badge) {
      badge.textContent = score === 0 ? 'X' : String(score);
      badge.className = 'bg-arc-shot is-filled' + (score === 10 ? ' is-ten' : '') + (score === 0 ? ' is-zero' : '');
    }
    totalEl.textContent = String(totalScore());
    roundEl.textContent = String(Math.min(ARC_TOTAL_SHOTS, shots.length + 1));
    statusEl.textContent = arcFeedback(score);

    if (shots.length >= ARC_TOTAL_SHOTS) {
      later(finish, 1100);
    } else {
      later(function () {
        if (finished) return;
        phase = 'aim';
        statusEl.textContent = '다음 발 — 중앙을 노려 보세요!';
      }, 850);
    }
  }

  boardEl.addEventListener('click', shoot);
  shootBtn.addEventListener('click', shoot);
  boardEl.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
      ev.preventDefault();
      shoot();
    }
  });

  later(function () {
    if (finished) return;
    phase = 'aim';
    lastTick = Date.now();
    updateAim();
    loop();
    statusEl.textContent = '시작! 조준점이 중앙에 올 때 과녁을 누르세요.';
  }, 650);
}

/* ------------- 5) 브레인 주방 매드니스 (order_cooking · 타임 매니지먼트)
   · 손님이 카운터로 걸어 들어와 주문하고, 서빙받으면 웃으며 걸어 나갑니다.
   · 조리대(음료 머신 · 도자기 접시 · 철판 그릴)와 재료 바구니를 직접 눌러 요리합니다.
   · 슬롯 DOM은 한 번만 만들고, 상태가 바뀐 슬롯만 다시 그려 입장·퇴장 애니메이션이 끊기지 않습니다. */
var RUSH_DURATION = 60000;
var RUSH_PATTY_MS = 2200;      /* 패티 익는 시간 */
var RUSH_BURN_MS = 4500;       /* 다 익은 뒤 태우기까지 */
var RUSH_DRINK_MS = 1500;      /* 음료 채우는 시간 */
var RUSH_COMBO_WINDOW = 3500;  /* 연속 서빙 콤보 인정 시간 */
var RUSH_LEAVE_MS = 720;       /* 웃으며/화나서 걸어 나가는 연출 길이 */
var RUSH_RESPAWN_MS = 380;     /* 빈 자리에 다음 손님이 오기까지 */
var RUSH_ITEM = {
  basic: { e: '🍔', n: '기본 버거' },
  special: { e: '🥗', n: '스페셜 버거' },
  drink: { e: '🥤', n: '음료' }
};

/* 손님 캐릭터 풀 — 머리·옷·피부·소품이 모두 다른 6종 */
var RUSH_GUESTS = [
  { skin: '#F6CEAA', hair: '#2C2C35', shirt: '#41587C', style: 'short' },
  { skin: '#F2C39B', hair: '#5A3524', shirt: '#C46A5B', style: 'bob', glasses: true },
  { skin: '#EFC9B0', hair: '#1F1F27', shirt: '#4F8A6B', style: 'long' },
  { skin: '#F7D2B2', hair: '#7A4A2C', shirt: '#E0A93C', style: 'cap' },
  { skin: '#EBC0A0', hair: '#3A3A44', shirt: '#6F5EA8', style: 'bun' },
  { skin: '#F0CBB3', hair: '#B9B4AE', shirt: '#8E6A5A', style: 'elder', glasses: true }
];

function guestSvg(g) {
  var hair = '<path d="M9.6 17.2a10.4 10.4 0 0 1 20.8 0c-1.8-3.2-5.6-4.8-10.4-4.8s-8.6 1.6-10.4 4.8Z" fill="' + g.hair + '"/>';
  if (g.style === 'bob') {
    hair += '<path d="M9.4 16.6c-1.2 3.6-1 7.8.3 10.6 1.3-.5 2-1.6 2.2-3.3-.8-2.4-.8-5.2 0-7.3Zm21.2 0c1.2 3.6 1 7.8-.3 10.6-1.3-.5-2-1.6-2.2-3.3.8-2.4.8-5.2 0-7.3Z" fill="' + g.hair + '"/>';
  } else if (g.style === 'long') {
    hair += '<path d="M9.2 16.2c-1.6 4.8-1.4 10.2.4 13.8 1.6-.4 2.5-1.7 2.7-3.7-1-3.6-1-7.4-.2-10.1Zm21.6 0c1.6 4.8 1.4 10.2-.4 13.8-1.6-.4-2.5-1.7-2.7-3.7 1-3.6 1-7.4.2-10.1Z" fill="' + g.hair + '"/>';
  } else if (g.style === 'bun') {
    hair += '<circle cx="20" cy="5.6" r="3.2" fill="' + g.hair + '"/>';
  } else if (g.style === 'cap') {
    hair = '<path d="M9.8 14.6c.5-5.2 4.5-8.8 10.2-8.8s9.7 3.6 10.2 8.8Z" fill="' + g.shirt + '"/>' +
      '<path d="M28.6 13.2h6.6c1 0 1.5 1 1 1.8-.9 1.2-2.8 1.8-4.9 1.5-1.4-.2-2.4-1.3-2.7-3.3Z" fill="' + g.shirt + '"/>';
  } else if (g.style === 'elder') {
    hair = '<path d="M9.6 17.4a10.4 10.4 0 0 1 20.8 0c-2-2.8-5.6-4.2-10.4-4.2s-8.4 1.4-10.4 4.2Z" fill="' + g.hair + '"/>' +
      '<path d="M12.4 9.4c1.6-1.6 4.2-2.6 7.6-2.6" stroke="rgba(255,255,255,.8)" stroke-width="1.2" fill="none" stroke-linecap="round"/>';
  }
  var glasses = g.glasses
    ? '<g fill="none" stroke="#54545F" stroke-width="1.1"><circle cx="15.9" cy="17.6" r="3.3"/><circle cx="24.1" cy="17.6" r="3.3"/><path d="M19.2 17.6h1.6"/></g>'
    : '';
  return '<svg viewBox="0 0 40 42" class="bg-rush-av" aria-hidden="true">' +
    '<path d="M5.2 42c0-6.8 6.7-11.2 14.8-11.2S34.8 35.2 34.8 42Z" fill="' + g.shirt + '"/>' +
    '<path d="M16.2 31.4 20 34.5l3.8-3.1" stroke="rgba(255,255,255,.6)" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
    '<rect x="16.8" y="25.2" width="6.4" height="7" rx="3" fill="' + g.skin + '"/>' +
    '<circle cx="20" cy="17.6" r="10.2" fill="' + g.skin + '"/>' +
    '<circle cx="9.7" cy="18.4" r="1.9" fill="' + g.skin + '"/><circle cx="30.3" cy="18.4" r="1.9" fill="' + g.skin + '"/>' +
    hair +
    '<circle cx="16.1" cy="17.6" r="1.3" fill="#2B2B33"/><circle cx="23.9" cy="17.6" r="1.3" fill="#2B2B33"/>' +
    glasses +
    '<g class="av-brow" stroke="#2B2B33" stroke-width="1.1" stroke-linecap="round"><path d="M13.6 14 18 15.4"/><path d="M26.4 14 22 15.4"/></g>' +
    '<g class="av-blush"><ellipse cx="13.4" cy="20.6" rx="1.7" ry="1" fill="#F09A8E" opacity=".6"/><ellipse cx="26.6" cy="20.6" rx="1.7" ry="1" fill="#F09A8E" opacity=".6"/></g>' +
    '<g class="av-m av-m-calm"><path d="M17 21.2c1 2 5 2 6 0" stroke="#B4736B" stroke-width="1.4" fill="none" stroke-linecap="round"/></g>' +
    '<g class="av-m av-m-neutral"><path d="M17.8 21.9h4.4" stroke="#B4736B" stroke-width="1.4" stroke-linecap="round"/></g>' +
    '<g class="av-m av-m-warn"><path d="M17.2 22.6c1.2-1.5 4.4-1.5 5.6 0" stroke="#B4736B" stroke-width="1.4" fill="none" stroke-linecap="round"/></g>' +
    '<g class="av-m av-m-angry"><path d="M16.9 22.8c1.5-1.5 4.7-1.5 6.2 0" stroke="#A2564E" stroke-width="1.5" fill="none" stroke-linecap="round"/></g>' +
    '<g class="av-m av-m-joy"><path d="M16.3 20.7a4.6 3.4 0 0 0 7.4 0Z" fill="#B4736B"/></g>' +
  '</svg>';
}

function runCooking(playEl, done) {
  var endAt = 0;
  var lastNow = 0;
  var finished = false;
  var score = 0;
  var comboStreak = 0;
  var lastServeAt = 0;
  var servedCustomers = 0;
  var lostCustomers = 0;
  var nextId = 1;
  var customers = [null, null, null];
  var nextSpawnAt = [0, 0, 0];
  var grill = [
    { state: 'empty', startAt: 0, readyAt: 0 },
    { state: 'empty', startAt: 0, readyAt: 0 }
  ];
  var plates = [
    { bun: false, patty: false, special: false },
    { bun: false, patty: false, special: false }
  ];
  var drinks = [
    { state: 'empty', startAt: 0, readyAt: 0 },
    { state: 'empty', startAt: 0, readyAt: 0 }
  ];
  var slotEls = [];
  var custEls = [null, null, null];
  var grillEls = [];
  var plateEls = [];
  var drinkEls = [];
  var sigG = [null, null];
  var sigP = [null, null];
  var sigD = [null, null];

  playEl.innerHTML =
    '<div class="bg-hud">' +
      '<span class="bg-hud-item">남은 시간<strong id="bg-rush-time">60.0</strong>초</span>' +
      '<span class="bg-hud-item">점수<strong id="bg-rush-score">0</strong>점</span>' +
      '<span class="bg-hud-item">COMBO<strong id="bg-rush-combo">x0</strong></span>' +
      '<span class="bg-hud-item">서빙<strong id="bg-rush-served">0</strong>명</span>' +
    '</div>' +
    '<div class="bg-timerbar"><span class="bg-timerbar-fill" id="bg-rush-bar"></span></div>' +
    '<div class="bg-rush-floor">' +
      '<div class="bg-rush-custs" id="bg-rush-custs">' +
        '<div class="bg-rush-slotwrap is-empty" data-slot="0"><div class="bg-rush-seat"><span class="bg-rush-seat-e">💺</span><span>다음 손님…</span></div></div>' +
        '<div class="bg-rush-slotwrap is-empty" data-slot="1"><div class="bg-rush-seat"><span class="bg-rush-seat-e">💺</span><span>다음 손님…</span></div></div>' +
        '<div class="bg-rush-slotwrap is-empty" data-slot="2"><div class="bg-rush-seat"><span class="bg-rush-seat-e">💺</span><span>다음 손님…</span></div></div>' +
      '</div>' +
    '</div>' +
    '<div class="bg-rush-kitchen">' +
      '<div class="bg-rush-station is-drink">' +
        '<span class="bg-rush-station-label">음료 머신</span>' +
        '<div class="bg-rush-machine" id="bg-rush-drinks"></div>' +
      '</div>' +
      '<div class="bg-rush-station is-plate">' +
        '<span class="bg-rush-station-label">접시</span>' +
        '<div class="bg-rush-slots" id="bg-rush-plates"></div>' +
      '</div>' +
      '<div class="bg-rush-station is-grill">' +
        '<span class="bg-rush-station-label">철판 그릴</span>' +
        '<div class="bg-rush-slots" id="bg-rush-grill"></div>' +
      '</div>' +
    '</div>' +
    '<div class="bg-rush-tray">' +
      '<button type="button" class="bg-rush-basket" data-act="bun" aria-label="번 바구니 — 빈 접시에 번 올리기"><span class="bk-ico">🍞</span><span class="bk-nm">번</span></button>' +
      '<button type="button" class="bg-rush-basket" data-act="cook" aria-label="생패티 바구니 — 빈 그릴에 패티 올리기"><span class="bk-ico">🥩</span><span class="bk-nm">패티</span></button>' +
      '<button type="button" class="bg-rush-basket" data-act="top" aria-label="토핑 바구니 — 버거에 토핑 올리기"><span class="bk-ico">🥬</span><span class="bk-nm">토핑</span></button>' +
    '</div>' +
    '<p class="bg-status" id="bg-status">곧 영업이 시작됩니다. 손님 주문을 확인하세요!</p>';

  var custsEl = playEl.querySelector('#bg-rush-custs');
  var grillEl = playEl.querySelector('#bg-rush-grill');
  var platesEl = playEl.querySelector('#bg-rush-plates');
  var drinksEl = playEl.querySelector('#bg-rush-drinks');
  var timeEl = playEl.querySelector('#bg-rush-time');
  var barEl = playEl.querySelector('#bg-rush-bar');
  var scoreEl = playEl.querySelector('#bg-rush-score');
  var comboEl = playEl.querySelector('#bg-rush-combo');
  var servedEl = playEl.querySelector('#bg-rush-served');
  var statusEl = playEl.querySelector('#bg-status');

  for (var s = 0; s < 3; s++) {
    slotEls.push(custsEl.querySelector('[data-slot="' + s + '"]'));
  }

  /* ---- 슬롯 래퍼는 한 번만 만들어 두고 안쪽만 갈아 끼웁니다 ---- */
  function makeSlot(host, cls, act, idx, list) {
    var el = document.createElement('div');
    el.className = cls;
    el.setAttribute('data-act', act);
    el.setAttribute('data-idx', String(idx));
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    host.appendChild(el);
    list.push(el);
    return el;
  }
  for (var g0 = 0; g0 < 2; g0++) makeSlot(grillEl, 'bg-rush-gslot is-empty', 'gs', g0, grillEls);
  for (var p0 = 0; p0 < 2; p0++) makeSlot(platesEl, 'bg-rush-plate is-empty', 'ps', p0, plateEls);
  for (var d0 = 0; d0 < 2; d0++) makeSlot(drinksEl, 'bg-rush-drink is-empty', 'ds', d0, drinkEls);

  function dishOfPlate(p) {
    if (!p.bun || !p.patty) return '';
    return p.special ? 'special' : 'basic';
  }

  function allDone(c) {
    for (var i = 0; i < c.done.length; i++) {
      if (!c.done[i]) return false;
    }
    return true;
  }

  /* --------------------------------------------------------- 손님 그리기 */
  function orderHtml(c) {
    var out = '';
    for (var j = 0; j < c.items.length; j++) {
      var it = RUSH_ITEM[c.items[j]];
      out += '<span class="bg-rush-order' + (c.done[j] ? ' is-done' : '') + '">' +
        '<span class="bg-rush-order-e">' + it.e + '</span>' +
        '<span class="bg-rush-order-n">' + it.n + '</span>' +
      '</span>';
    }
    return out;
  }

  function buildCustEl(c) {
    var el = document.createElement('div');
    el.className = 'bg-rush-cust mood-calm is-entering from-' + (c.slot % 2 === 0 ? 'left' : 'right');
    el.setAttribute('data-cid', String(c.id));
    el.innerHTML =
      '<span class="bg-rush-avatar">' + guestSvg(RUSH_GUESTS[c.guest]) + '</span>' +
      '<span class="bg-rush-bubble">' + orderHtml(c) + '</span>' +
      '<span class="bg-rush-pat"><i class="bg-rush-pat-fill" style="width:100%"></i></span>';
    return el;
  }

  function paintCust(i) {
    var c = customers[i];
    var el = custEls[i];
    if (!c || !el) return;
    var ratio = Math.max(0, Math.min(1, c.patienceLeft / c.patienceMax));
    var fill = el.querySelector('.bg-rush-pat-fill');
    if (fill) {
      fill.style.width = (ratio * 100) + '%';
      fill.className = 'bg-rush-pat-fill' + (ratio <= 0.25 ? ' is-low' : (ratio <= 0.5 ? ' is-warn' : ''));
    }
    if (c.phase === 'wait') {
      var mood = ratio > 0.62 ? 'calm' : (ratio > 0.32 ? 'neutral' : (ratio > 0.12 ? 'warn' : 'angry'));
      el.classList.remove('mood-calm', 'mood-neutral', 'mood-warn', 'mood-angry', 'mood-joy');
      el.classList.add('mood-' + mood);
    }
    var items = el.querySelectorAll('.bg-rush-order');
    for (var j = 0; j < items.length && j < c.done.length; j++) {
      if (c.done[j]) items[j].classList.add('is-done');
      else items[j].classList.remove('is-done');
    }
  }

  function syncCustomers() {
    for (var i = 0; i < 3; i++) {
      var c = customers[i];
      var el = custEls[i];
      if (c && !el) {
        el = buildCustEl(c);
        custEls[i] = el;
        slotEls[i].classList.remove('is-empty');
        slotEls[i].appendChild(el);
        paintCust(i);
        continue;
      }
      if (!c && el) {
        if (el.parentNode) el.parentNode.removeChild(el);
        custEls[i] = null;
        slotEls[i].classList.add('is-empty');
        continue;
      }
      if (!c || !el) continue;
      if (c.phase === 'happy' && !el.classList.contains('is-leaving-happy')) {
        el.classList.remove('is-entering', 'from-left', 'from-right');
        el.classList.remove('mood-calm', 'mood-neutral', 'mood-warn', 'mood-angry');
        el.classList.add('mood-joy', 'is-leaving-happy');
        el.insertAdjacentHTML('beforeend', '<span class="bg-rush-say is-happy">맛있어요! 👍</span>');
        var b1 = el.querySelector('.bg-rush-bubble');
        if (b1) b1.classList.add('is-faded');
      } else if (c.phase === 'angry' && !el.classList.contains('is-leaving-angry')) {
        el.classList.remove('is-entering', 'from-left', 'from-right');
        el.classList.remove('mood-calm', 'mood-neutral', 'mood-warn', 'mood-joy');
        el.classList.add('mood-angry', 'is-leaving-angry');
        el.insertAdjacentHTML('beforeend', '<span class="bg-rush-say is-angry">너무 늦었어요 😤</span>');
        var b2 = el.querySelector('.bg-rush-bubble');
        if (b2) b2.classList.add('is-faded');
      }
      paintCust(i);
    }
  }

  /* 점수 팝업 (+10! · COMBO x2 +20!) */
  function popScore(slot, text, tone) {
    var host = slotEls[slot];
    if (!host) return;
    var el = document.createElement('span');
    el.className = 'bg-rush-float' + (tone ? ' ' + tone : '');
    el.textContent = text;
    el.style.marginLeft = (Math.random() * 16 - 8) + 'px';
    host.appendChild(el);
    later(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 950);
  }

  /* --------------------------------------------------------- 주방 그리기 */
  function grillInner(i) {
    var st = grill[i];
    var body;
    if (st.state === 'empty') {
      body = '<span class="bg-rush-gslot-plus">＋</span><span class="bg-rush-slot-n">패티</span>';
    } else if (st.state === 'cooking') {
      body = '<span class="bg-rush-grill-lines"></span><span class="bg-rush-patty is-cooking"></span>' +
        '<span class="bg-rush-heat"></span><span class="bg-rush-gbar"><i></i></span>' +
        '<span class="bg-rush-slot-n is-light">지글지글…</span>';
    } else if (st.state === 'ready') {
      body = '<span class="bg-rush-grill-lines"></span><span class="bg-rush-patty is-ready"></span>' +
        '<span class="bg-rush-slot-n is-gold">완성! 접시로</span>';
    } else {
      body = '<span class="bg-rush-grill-lines"></span><span class="bg-rush-patty is-burnt"></span>' +
        '<span class="bg-rush-smoke"></span><span class="bg-rush-slot-n">탄 패티</span>';
    }
    var trash = (st.state === 'ready' || st.state === 'burnt')
      ? '<span class="bg-rush-trash" data-trash="g' + i + '">🗑️</span>'
      : '';
    return body + trash;
  }

  function plateInner(i) {
    var p = plates[i];
    var dish = dishOfPlate(p);
    var layers = '';
    if (dish) layers += '<span class="bg-rush-layer is-top"></span>';
    if (p.special) layers += '<span class="bg-rush-layer is-lettuce"></span>';
    if (p.patty) layers += '<span class="bg-rush-layer is-patty"></span>';
    if (p.bun) layers += '<span class="bg-rush-layer is-bun"></span>';
    if (!layers) layers = '<span class="bg-rush-plate-plus">＋</span>';
    var label = dish ? '서빙 →' : (p.bun ? '패티 올리기' : '빈 접시');
    var trash = (p.bun || p.patty || p.special)
      ? '<span class="bg-rush-trash" data-trash="p' + i + '">🗑️</span>'
      : '';
    return '<span class="bg-rush-stack">' + layers + '</span>' +
      '<span class="bg-rush-plate-base"></span>' +
      '<span class="bg-rush-slot-n' + (dish ? ' is-gold' : '') + '">' + label + '</span>' + trash;
  }

  function drinkInner(i) {
    var ds = drinks[i];
    var label = ds.state === 'ready' ? '서빙 →' : (ds.state === 'brewing' ? '따르는 중' : '컵');
    return '<span class="bg-rush-nozzle"></span>' +
      '<span class="bg-rush-cup">' +
        (ds.state === 'empty' ? '' : '<i class="bg-rush-cup-fill"></i>') +
        (ds.state === 'brewing' ? '<span class="bg-rush-stream"></span>' : '') +
      '</span>' +
      '<span class="bg-rush-slot-n' + (ds.state === 'ready' ? ' is-gold' : '') + '">' + label + '</span>' +
      (ds.state === 'ready' ? '<span class="bg-rush-trash" data-trash="d' + i + '">🗑️</span>' : '');
  }

  function paintGrill(i) {
    var el = grillEls[i];
    if (!el) return;
    var st = grill[i];
    if (sigG[i] !== st.state) {
      sigG[i] = st.state;
      el.className = 'bg-rush-gslot is-' + st.state;
      el.innerHTML = grillInner(i);
    }
    if (st.state === 'cooking') {
      var f = el.querySelector('.bg-rush-gbar > i');
      if (f) f.style.width = Math.max(0, Math.min(100, ((Date.now() - st.startAt) / RUSH_PATTY_MS) * 100)) + '%';
    }
  }

  function paintPlate(i) {
    var el = plateEls[i];
    if (!el) return;
    var p = plates[i];
    var dish = dishOfPlate(p);
    var sig = (p.bun ? '1' : '0') + (p.patty ? '1' : '0') + (p.special ? '1' : '0') + (dish ? 'D' : '');
    if (sigP[i] !== sig) {
      sigP[i] = sig;
      el.className = 'bg-rush-plate' + (dish ? ' is-dish' : (p.bun || p.patty ? ' is-started' : ' is-empty'));
      el.innerHTML = plateInner(i);
    }
  }

  function paintDrink(i) {
    var el = drinkEls[i];
    if (!el) return;
    var ds = drinks[i];
    if (sigD[i] !== ds.state) {
      sigD[i] = ds.state;
      el.className = 'bg-rush-drink is-' + (ds.state === 'ready' ? 'ready' : (ds.state === 'brewing' ? 'filling' : 'empty'));
      el.innerHTML = drinkInner(i);
    }
    if (ds.state === 'brewing') {
      var f = el.querySelector('.bg-rush-cup-fill');
      if (f) f.style.height = Math.max(0, Math.min(100, ((Date.now() - ds.startAt) / RUSH_DRINK_MS) * 100)) + '%';
    }
  }

  function paintKitchen() {
    for (var g = 0; g < 2; g++) paintGrill(g);
    for (var p = 0; p < 2; p++) paintPlate(p);
    for (var d = 0; d < 2; d++) paintDrink(d);
  }

  function paintHud() {
    scoreEl.textContent = String(score);
    comboEl.textContent = 'x' + comboStreak;
    servedEl.textContent = String(servedCustomers);
  }

  function paintAll() {
    paintHud();
    syncCustomers();
    paintKitchen();
  }

  /* ------------------------------------------------------------- 손님 흐름 */
  function spawn(slot) {
    var pool = ['basic', 'special', 'drink'];
    var a = pool[Math.floor(Math.random() * pool.length)];
    var items = [a];
    if (Math.random() < 0.45) {
      var b = a;
      var guard = 0;
      while (b === a && guard < 12) {
        b = pool[Math.floor(Math.random() * pool.length)];
        guard += 1;
      }
      items.push(b);
    }
    var max = 16000 + Math.floor(Math.random() * 9000);
    customers[slot] = {
      id: nextId,
      slot: slot,
      guest: Math.floor(Math.random() * RUSH_GUESTS.length),
      items: items,
      done: items.map(function () { return false; }),
      patienceMax: max,
      patienceLeft: max,
      phase: 'wait',
      leaveAt: 0
    };
    nextId += 1;
  }

  function findTarget(dishKey) {
    var best = -1;
    var bestLeft = Infinity;
    for (var i = 0; i < customers.length; i++) {
      var c = customers[i];
      if (!c || c.phase !== 'wait') continue;
      for (var j = 0; j < c.items.length; j++) {
        if (c.items[j] === dishKey && !c.done[j] && c.patienceLeft < bestLeft) {
          bestLeft = c.patienceLeft;
          best = i;
        }
      }
    }
    return best;
  }

  function serveItem(dishKey, clearFn) {
    var idx = findTarget(dishKey);
    if (idx < 0) {
      statusEl.textContent = '지금은 ' + RUSH_ITEM[dishKey].n + '을 기다리는 손님이 없어요.';
      sfx.nope();
      return;
    }
    var c = customers[idx];
    for (var k = 0; k < c.items.length; k++) {
      if (c.items[k] === dishKey && !c.done[k]) { c.done[k] = true; break; }
    }
    var now = Date.now();
    var bonus = 0;
    if (lastServeAt && now - lastServeAt <= RUSH_COMBO_WINDOW) {
      comboStreak += 1;
      bonus = Math.min(30, comboStreak * 10);
    } else {
      comboStreak = 0;
    }
    lastServeAt = now;
    score += 10 + bonus;
    clearFn();
    popScore(idx, '+' + (10 + bonus) + (bonus ? ' COMBO!' : ''));
    sfx.serve(comboStreak);
    if (allDone(c)) {
      servedCustomers += 1;
      score += 15;
      c.phase = 'happy';
      c.leaveAt = now;
      popScore(idx, '+25!');
      statusEl.textContent = '서빙 완료! +' + (25 + bonus) + '점' + (bonus ? ' (COMBO +' + bonus + ')' : '') + ' — 손님이 좋아하며 나갑니다.';
      sfx.happy();
    } else {
      statusEl.textContent = RUSH_ITEM[dishKey].n + ' 서빙! +' + (10 + bonus) + '점' + (bonus ? ' (COMBO +' + bonus + ')' : '');
    }
    paintAll();
  }

  /* --------------------------------------------------------------- 조리 */
  function startPatty(idx) {
    var target = -1;
    if (idx >= 0 && grill[idx] && grill[idx].state === 'empty') {
      target = idx;
    } else {
      for (var i = 0; i < grill.length; i++) {
        if (grill[i].state === 'empty') { target = i; break; }
      }
    }
    if (target < 0) {
      statusEl.textContent = '그릴이 꽉 찼어요 — 다 익은 패티를 접시로 옮겨 주세요.';
      sfx.nope();
      return;
    }
    var now = Date.now();
    grill[target] = { state: 'cooking', startAt: now, readyAt: now + RUSH_PATTY_MS };
    statusEl.textContent = '철판에 생패티를 올렸어요. 지글지글…';
    sfx.sizzle();
    paintAll();
  }

  function putBun() {
    for (var i = 0; i < plates.length; i++) {
      if (!plates[i].bun) {
        plates[i].bun = true;
        statusEl.textContent = '접시에 번을 올렸어요. 이제 패티를 올리세요.';
        sfx.topping();
        paintAll();
        return;
      }
    }
    statusEl.textContent = '접시가 모두 사용 중이에요 — 완성된 버거를 서빙하거나 비워 주세요.';
    sfx.nope();
  }

  function addTopping() {
    for (var i = 0; i < plates.length; i++) {
      var p = plates[i];
      if (p.bun && p.patty && !p.special) {
        p.special = true;
        statusEl.textContent = '토핑을 올려 스페셜 버거 완성!';
        sfx.topping();
        paintAll();
        return;
      }
    }
    statusEl.textContent = '버거가 완성된 접시에만 토핑을 올릴 수 있어요.';
    sfx.nope();
  }

  function startDrink(idx) {
    var target = -1;
    if (idx >= 0 && drinks[idx] && drinks[idx].state === 'empty') target = idx;
    else {
      for (var i = 0; i < drinks.length; i++) {
        if (drinks[i].state === 'empty') { target = i; break; }
      }
    }
    if (target < 0) {
      statusEl.textContent = '음료 머신이 꽉 찼어요 — 완성된 음료를 서빙해 주세요.';
      sfx.nope();
      return;
    }
    var now = Date.now();
    drinks[target] = { state: 'brewing', startAt: now, readyAt: now + RUSH_DRINK_MS };
    statusEl.textContent = '음료 머신에서 컵에 음료를 따르고 있어요.';
    sfx.drink();
    paintAll();
  }

  function tapGrill(idx) {
    var st = grill[idx];
    if (!st) return;
    if (st.state === 'empty') { startPatty(idx); return; }
    if (st.state === 'burnt') {
      grill[idx] = { state: 'empty', startAt: 0, readyAt: 0 };
      statusEl.textContent = '탄 패티를 버렸어요.';
      sfx.push();
      paintAll();
      return;
    }
    if (st.state !== 'ready') {
      statusEl.textContent = '아직 지글지글 익는 중이에요.';
      return;
    }
    for (var i = 0; i < plates.length; i++) {
      if (plates[i].bun && !plates[i].patty) {
        plates[i].patty = true;
        grill[idx] = { state: 'empty', startAt: 0, readyAt: 0 };
        statusEl.textContent = '구운 패티를 접시에 올렸어요. 완성하면 접시를 눌러 서빙하세요!';
        sfx.topping();
        paintAll();
        return;
      }
    }
    statusEl.textContent = '패티를 올릴 접시가 없어요 — 번 바구니로 빵을 먼저 놓아 주세요.';
    sfx.nope();
  }

  function tapPlate(idx) {
    var p = plates[idx];
    if (!p) return;
    var dish = dishOfPlate(p);
    if (!dish) {
      if (!p.bun && !p.patty) {
        p.bun = true;
        statusEl.textContent = '빈 접시에 번을 올렸어요.';
        sfx.topping();
      } else {
        statusEl.textContent = '패티를 올려야 버거가 완성됩니다.';
        sfx.nope();
      }
      paintAll();
      return;
    }
    serveItem(dish, function () {
      plates[idx] = { bun: false, patty: false, special: false };
    });
  }

  function tapDrink(idx) {
    var ds = drinks[idx];
    if (!ds) return;
    if (ds.state === 'empty') { startDrink(idx); return; }
    if (ds.state !== 'ready') {
      statusEl.textContent = '음료가 아직 채워지는 중이에요.';
      return;
    }
    serveItem('drink', function () {
      drinks[idx] = { state: 'empty', startAt: 0, readyAt: 0 };
    });
  }

  function discard(code) {
    var kind = code.charAt(0);
    var idx = Number(code.charAt(1));
    if (kind === 'g') grill[idx] = { state: 'empty', startAt: 0, readyAt: 0 };
    else if (kind === 'p') plates[idx] = { bun: false, patty: false, special: false };
    else if (kind === 'd') drinks[idx] = { state: 'empty', startAt: 0, readyAt: 0 };
    statusEl.textContent = '버렸어요.';
    sfx.push();
    paintAll();
  }

  function onClick(ev) {
    if (finished) return;
    var target = ev.target;
    if (!target || !target.closest) return;
    var trash = target.closest('[data-trash]');
    if (trash) {
      ev.stopPropagation();
      discard(trash.getAttribute('data-trash'));
      return;
    }
    var el = target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var idx = Number(el.getAttribute('data-idx') || 0);
    if (act === 'cook') startPatty(-1);
    else if (act === 'bun') putBun();
    else if (act === 'top') addTopping();
    else if (act === 'gs') tapGrill(idx);
    else if (act === 'ps') tapPlate(idx);
    else if (act === 'ds') tapDrink(idx);
  }

  /* --------------------------------------------------------------- 진행 */
  function tick() {
    var now = Date.now();
    var dt = lastNow ? Math.min(400, now - lastNow) : 0;
    lastNow = now;
    var left = Math.max(0, endAt - now);
    timeEl.textContent = (left / 1000).toFixed(1);
    barEl.style.width = Math.max(0, Math.min(100, (left / RUSH_DURATION) * 100)) + '%';
    paintHud();

    for (var i = 0; i < customers.length; i++) {
      var c = customers[i];
      if (c && (c.phase === 'happy' || c.phase === 'angry')) {
        if (now - c.leaveAt >= RUSH_LEAVE_MS) {
          customers[i] = null;
          nextSpawnAt[i] = now + RUSH_RESPAWN_MS;
        }
        continue;
      }
      if (c) {
        c.patienceLeft -= dt;
        if (c.patienceLeft <= 0) {
          c.patienceLeft = 0;
          lostCustomers += 1;
          comboStreak = 0;
          lastServeAt = 0;
          c.phase = 'angry';
          c.leaveAt = now;
          popScore(i, '😤', 'is-bad');
          sfx.sad();
          statusEl.textContent = '손님이 기다리다 화나서 떠났어요…';
        }
      } else if (now >= nextSpawnAt[i] && left > 0) {
        spawn(i);
        sfx.door();
      }
    }
    syncCustomers();

    for (var g = 0; g < grill.length; g++) {
      var st = grill[g];
      if (st.state === 'cooking' && now >= st.readyAt) {
        st.state = 'ready';
        st.readyAt = now;
        sfx.ready();
      } else if (st.state === 'ready' && now - st.readyAt >= RUSH_BURN_MS) {
        st.state = 'burnt';
      }
    }

    for (var d = 0; d < drinks.length; d++) {
      var ds = drinks[d];
      if (ds.state === 'brewing' && now >= ds.readyAt) ds.state = 'ready';
    }

    paintKitchen();

    if (left <= 0 && !finished) finish();
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearAllTimers();
    var total = servedCustomers + lostCustomers;
    var accuracy = total ? Math.round((servedCustomers / total) * 100) : 0;
    statusEl.textContent = '영업 종료 — ' + score + '점 · 서빙 ' + servedCustomers + '명';
    sfx.close();
    done({ game_key: 'order_cooking', score: score, metric_ms: null, accuracy: accuracy });
  }

  playEl.addEventListener('click', onClick);

  later(function () {
    if (finished) return;
    var now = Date.now();
    endAt = now + RUSH_DURATION;
    lastNow = now;
    nextSpawnAt = [now, now + 1100, now + 2200];
    paintAll();
    statusEl.textContent = '영업 시작! 손님이 왔어요 — 바구니·그릴·접시를 눌러 요리하세요.';
    sfx.start();
    every(tick, 80);
    tick();
  }, 700);
}

/* ------------------------------------------------------------- 결과 저장 */
function finishGame(playEl, key, meta, result, logs, refreshBoard, showHub, restart) {
  var before = computeBrainGameStats(logs);
  var prevBest = before.bestByGame[key];
  var prevScore = prevBest ? Number(prevBest.score) : null;
  var isRecord = prevScore === null
    ? Number(result.score) > 0
    : (meta.direction === 'lower' ? Number(result.score) < prevScore : Number(result.score) > prevScore);

  clearAllTimers();
  playEl.innerHTML = '<div class="bg-result is-loading"><span class="spinner"></span><span>기록을 저장하는 중…</span></div>';

  saveBrainGameLog(result).then(function (row) {
    if (row) logs.push(row);
    refreshBoard();
    showResult(false);
  }).catch(function (err) {
    console.warn('[MINA] 두뇌게임 기록 저장 실패', err);
    toast(friendlyError(err), 'error');
    showResult(true);
  });

  function showResult(saveFailed) {
    var stats = computeBrainGameStats(logs);
    playEl.innerHTML = resultHtml(key, meta, result, isRecord, stats, saveFailed);
    sfx.finish();
    if (isRecord) later(function () { sfx.record(); }, 560);
    var again = playEl.querySelector('[data-again]');
    if (again) again.addEventListener('click', function () { restart(key); });
    var hub = playEl.querySelector('[data-hub]');
    if (hub) hub.addEventListener('click', function () { showHub(); });
  }
}

/* ------------------------------------------------------------------ 페이지 */
export async function render(ctx) {
  var logs = [];
  try {
    logs = await listBrainGameLogs(state.session ? state.session.user.id : null, 300);
  } catch (err) {
    console.warn('[MINA] 두뇌게임 기록 조회 실패', err);
    logs = [];
  }

  var html =
    '<header class="page-head">' +
      '<span class="page-eyebrow">' + icon('gamepad', 16) + ' BRAIN GAME</span>' +
      '<h1 class="page-title">오늘의 두뇌 워밍업</h1>' +
      '<p class="page-desc">기억력 · 집중력 · 주의전환 · 집중 조준 · 멀티태스킹 5종을 1~2분씩 가볍게. 매일 한 판이면 기록이 이어집니다.</p>' +
    '</header>' +

    '<div id="bg-board" class="bg-board"></div>' +
    '<section class="section" id="bg-hub"></section>' +
    '<section class="bg-stage" id="bg-stage" hidden></section>' +

    '<section class="section">' +
      noticeBox('<strong>비의료 웰니스 안내</strong><br>두뇌게임 기록은 본인이 플레이한 결과일 뿐, 인지능력이나 건강 상태를 평가하는 의학적 검사가 아닙니다. 진단·치료를 대체하지 않습니다.', 'warn') +
    '</section>' +

    '<footer class="app-footer">' +
      '<p class="footer-brand">MINA Wellness World</p>' +
      '<p class="footer-note">기록은 본인 계정에만 저장되며 다른 사람과 비교하지 않습니다.</p>' +
      '<p class="footer-links"><a href="#/home">홈</a><span>·</span><a href="../index.html">미나월드 홈페이지</a></p>' +
    '</footer>';

  return {
    title: '두뇌게임',
    html: html,
    mount: function (el) { mountGames(el, logs); },
    destroy: function () { clearAllTimers(); }
  };
}

function mountGames(el, logs) {
  var boardEl = el.querySelector('#bg-board');
  var hubEl = el.querySelector('#bg-hub');
  var stageEl = el.querySelector('#bg-stage');

  function refreshBoard() {
    var stats = computeBrainGameStats(logs);
    boardEl.innerHTML = boardHtml(stats);
    var login = boardEl.querySelector('#bg-login');
    if (login) login.addEventListener('click', function () { go('/account'); });
    return stats;
  }

  function renderHub() {
    var stats = refreshBoard();
    hubEl.innerHTML = hubHtml(stats);
    var cards = hubEl.querySelectorAll('[data-game]');
    for (var i = 0; i < cards.length; i++) {
      cards[i].addEventListener('click', function () {
        startGame(this.getAttribute('data-game'));
      });
    }
    bindSfxToggles(hubEl);
  }

  function showHub() {
    clearAllTimers();
    el.classList.remove('bg-playing');
    stageEl.hidden = true;
    stageEl.innerHTML = '';
    boardEl.hidden = false;
    hubEl.hidden = false;
    renderHub();
  }

  function startGame(key) {
    var meta = brainGameMeta(key);
    if (!meta) return;
    unlockSfx();
    clearAllTimers();
    el.classList.add('bg-playing');
    boardEl.hidden = true;
    hubEl.hidden = true;
    stageEl.hidden = false;
    stageEl.innerHTML =
      '<div class="bg-game-head">' +
        '<button type="button" class="bg-back" id="bg-back">' + icon('chevronLeft', 16) + '게임 목록</button>' +
        '<span class="bg-head-right"><span class="bg-game-area">' + esc(meta.area) + '</span>' +
          sfxToggleHtml('bg-sfx-play') + '</span>' +
      '</div>' +
      '<h2 class="bg-game-title">' + esc(meta.title) + '</h2>' +
      '<p class="bg-game-desc">' + esc(meta.howto) + '</p>' +
      '<div class="bg-play" id="bg-play"></div>';
    var back = stageEl.querySelector('#bg-back');
    back.addEventListener('click', showHub);
    bindSfxToggles(stageEl);

    var playEl = stageEl.querySelector('#bg-play');
    function done(result) {
      finishGame(playEl, key, meta, result, logs, refreshBoard, showHub, startGame);
    }
    if (key === 'memory_seq') runMemory(playEl, done);
    else if (key === 'stroop_color') runStroop(playEl, done);
    else if (key === 'number_grid') runNumberGrid(playEl, done);
    else if (key === 'archery_target') runArchery(playEl, done);
    else if (key === 'order_cooking') runCooking(playEl, done);
  }

  el.addEventListener('pointerdown', function () { unlockSfx(); }, { once: true });
  renderHub();
}
