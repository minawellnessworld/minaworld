/* S11. BRAIN GAME — 두뇌게임 5종 + 최고기록·연속 출석(스트릭)
   ---------------------------------------------------------------------
   · 저장·표시하는 값은 본인이 실제로 플레이한 기록뿐입니다.
     (최고기록 · 최근기록 · 오늘 완료 · 연속 플레이 일수 / 타인 비교·뇌나이 없음)
   · 포인트 적립과 연결하지 않습니다. (체크인 하루 +5P 정책만 유지)
   · 타이머(setTimeout/setInterval)와 애니메이션(requestAnimationFrame)은
     게임 종료·다른 화면 이동(destroy) 시 모두 정리합니다.
   · 게임 개수는 config.js 의 BRAIN_GAMES 길이를 그대로 따릅니다.
   ===================================================================== */
import { BRAIN_GAMES, brainGameMeta, brainGameScoreText } from '../config.js?v=2.0.27';
import {
  state, listBrainGameLogs, saveBrainGameLog, computeBrainGameStats, friendlyError
} from '../store.js?v=2.0.27';
import { icon, esc, toast, go, noticeBox } from '../ui.js?v=2.0.27';

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
      '<div class="section-action"><span class="muted small">자유롭게 · 몇 번이든</span></div></div>' +
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
      later(function () { self.classList.remove('is-tap'); }, 180);
      pos += 1;
      if (pos >= seq.length) {
        locked = true;
        completed += 1;
        clearEl.textContent = String(completed);
        tilesEl.classList.remove('is-input');
        statusEl.textContent = '좋아요! ' + completed + '단계 성공 — 다음 라운드로 이어집니다.';
        later(startRound, 800);
      }
    } else {
      locked = true;
      this.classList.add('is-wrong');
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
    statusEl.textContent = '30초 완료 — 맞힌 개수 ' + correct + '개 · 정답률 ' + accuracy + '%';
    done({ game_key: 'stroop_color', score: correct, metric_ms: null, accuracy: accuracy });
  }

  function onAnswer() {
    if (finished) return;
    var picked = this.getAttribute('data-color');
    attempts += 1;
    if (picked === answerName) {
      correct += 1;
      scoreEl.textContent = String(correct);
      wordEl.classList.add('is-correct');
      later(function () { wordEl.classList.remove('is-correct'); }, 160);
    } else {
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
    statusEl.textContent = '25까지 완료! 걸린 시간 ' + (elapsed / 1000).toFixed(2) + '초 · 실수 ' + mistakes + '회';
    done({ game_key: 'number_grid', score: elapsed, metric_ms: elapsed, accuracy: null });
  }

  function onCell() {
    if (finished) return;
    var value = Number(this.getAttribute('data-num'));
    if (value !== next) {
      var self = this;
      self.classList.add('is-shake');
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

/* ------------- 5) 브레인 주방 매드니스 (order_cooking · 타임 매니지먼트) */
var RUSH_DURATION = 60000;
var RUSH_PATTY_MS = 2200;      /* 패티 익는 시간 */
var RUSH_BURN_MS = 4500;       /* 다 익은 뒤 태우기까지 */
var RUSH_DRINK_MS = 1500;      /* 음료 채우는 시간 */
var RUSH_COMBO_WINDOW = 3500;  /* 연속 서빙 콤보 인정 시간 */
var RUSH_ITEM = {
  basic: { e: '🍔', n: '기본 버거' },
  special: { e: '🥗', n: '스페셜 버거' },
  drink: { e: '🥤', n: '음료' }
};
var RUSH_FACES = ['😊', '😐', '😟', '😡'];

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
  var flash = [null, null, null];
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
  var dirty = true;

  playEl.innerHTML =
    '<div class="bg-hud">' +
      '<span class="bg-hud-item">남은 시간<strong id="bg-rush-time">60.0</strong>초</span>' +
      '<span class="bg-hud-item">점수<strong id="bg-rush-score">0</strong>점</span>' +
      '<span class="bg-hud-item">COMBO<strong id="bg-rush-combo">x0</strong></span>' +
      '<span class="bg-hud-item">서빙<strong id="bg-rush-served">0</strong>명</span>' +
    '</div>' +
    '<div class="bg-timerbar"><span class="bg-timerbar-fill" id="bg-rush-bar"></span></div>' +
    '<div class="bg-rush-custs" id="bg-rush-custs"></div>' +
    '<div class="bg-rush-kitchen">' +
      '<div class="bg-rush-station">' +
        '<span class="bg-rush-station-label">🔥 그릴</span>' +
        '<div class="bg-rush-slots" id="bg-rush-grill"></div>' +
      '</div>' +
      '<div class="bg-rush-station">' +
        '<span class="bg-rush-station-label">🍽️ 접시</span>' +
        '<div class="bg-rush-slots" id="bg-rush-plates"></div>' +
      '</div>' +
      '<div class="bg-rush-station">' +
        '<span class="bg-rush-station-label">🥤 음료</span>' +
        '<div class="bg-rush-slots" id="bg-rush-drinks"></div>' +
      '</div>' +
    '</div>' +
    '<div class="bg-rush-actions">' +
      '<button type="button" class="bg-rush-act" data-act="cook">🥩 패티 굽기</button>' +
      '<button type="button" class="bg-rush-act" data-act="bun">🍞 빵 놓기</button>' +
      '<button type="button" class="bg-rush-act" data-act="top">🥬 토핑 올리기</button>' +
      '<button type="button" class="bg-rush-act" data-act="drink">🥤 음료 내리기</button>' +
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

  function faceOf(ratio) {
    if (ratio > 0.66) return RUSH_FACES[0];
    if (ratio > 0.33) return RUSH_FACES[1];
    if (ratio > 0.12) return RUSH_FACES[2];
    return RUSH_FACES[3];
  }

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
      items: items,
      done: items.map(function () { return false; }),
      patienceMax: max,
      patienceLeft: max
    };
    nextId += 1;
    flash[slot] = null;
  }

  function renderCustomers() {
    var now = Date.now();
    var out = '';
    for (var i = 0; i < 3; i++) {
      var c = customers[i];
      if (c) {
        var ratio = Math.max(0, c.patienceLeft / c.patienceMax);
        var order = '';
        for (var j = 0; j < c.items.length; j++) {
          var it = RUSH_ITEM[c.items[j]];
          order += '<span class="bg-rush-order' + (c.done[j] ? ' is-done' : '') + '">' +
            '<span class="bg-rush-order-e">' + it.e + '</span>' +
            '<span class="bg-rush-order-n">' + it.n + '</span>' +
          '</span>';
        }
        out += '<div class="bg-rush-cust">' +
          '<span class="bg-rush-face">' + faceOf(ratio) + '</span>' +
          '<span class="bg-rush-bubble">' + order + '</span>' +
          '<span class="bg-rush-pat"><i class="bg-rush-pat-fill' +
            (ratio <= 0.25 ? ' is-low' : (ratio <= 0.5 ? ' is-warn' : '')) +
            '" id="pat-' + i + '" style="width:' + (ratio * 100) + '%"></i></span>' +
        '</div>';
      } else {
        var f = flash[i];
        var show = f && now < f.until;
        out += '<div class="bg-rush-cust is-empty">' +
          '<span class="bg-rush-face">' + (show ? f.face : '💺') + '</span>' +
          '<span class="bg-rush-bubble is-empty">' + (show ? f.text : '다음 손님…') + '</span>' +
        '</div>';
      }
    }
    custsEl.innerHTML = out;
  }

  function renderKitchen() {
    var gh = '';
    for (var g = 0; g < grill.length; g++) {
      var st = grill[g];
      var cls = 'bg-rush-slot is-' + st.state;
      var inner = '';
      var trash = '';
      if (st.state === 'empty') {
        inner = '<span class="bg-rush-slot-e">＋</span><span class="bg-rush-slot-n">패티 굽기</span>';
      } else if (st.state === 'cooking') {
        inner = '<span class="bg-rush-slot-e">🥩</span>' +
          '<span class="bg-rush-slot-bar"><i class="bg-rush-fill" id="fill-g' + g + '" style="width:0%"></i></span>' +
          '<span class="bg-rush-slot-n">굽는 중</span>';
      } else if (st.state === 'ready') {
        inner = '<span class="bg-rush-slot-e">🍖</span><span class="bg-rush-slot-n">완성! 탭해서 접시로</span>';
        trash = 'g' + g;
      } else {
        inner = '<span class="bg-rush-slot-e">🔥</span><span class="bg-rush-slot-n">탄 패티 · 탭해서 비우기</span>';
      }
      gh += '<div class="' + cls + '" data-act="gs" data-idx="' + g + '" role="button" tabindex="0">' +
        inner + (trash ? '<span class="bg-rush-trash" data-trash="' + trash + '">🗑️</span>' : '') +
      '</div>';
    }
    grillEl.innerHTML = gh;

    var ph = '';
    for (var p = 0; p < plates.length; p++) {
      var pl = plates[p];
      var dish = dishOfPlate(pl);
      var icons = '';
      if (pl.bun) icons += '<span class="bg-rush-slot-e">🍞</span>';
      if (pl.patty) icons += '<span class="bg-rush-slot-e">🍖</span>';
      if (pl.special) icons += '<span class="bg-rush-slot-e">🥬</span>';
      var pcls = 'bg-rush-slot' + (dish ? ' is-dish' : (pl.bun ? ' is-cooking' : ' is-empty'));
      var pn = dish
        ? (RUSH_ITEM[dish].e + ' ' + RUSH_ITEM[dish].n + ' · 탭 서빙')
        : (pl.bun ? '빵 위에 패티를' : '빈 접시');
      ph += '<div class="' + pcls + '" data-act="ps" data-idx="' + p + '" role="button" tabindex="0">' +
        (icons || '<span class="bg-rush-slot-e">＋</span>') +
        '<span class="bg-rush-slot-n">' + pn + '</span>' +
        (pl.bun || pl.patty ? '<span class="bg-rush-trash" data-trash="p' + p + '">🗑️</span>' : '') +
      '</div>';
    }
    platesEl.innerHTML = ph;

    var dh = '';
    for (var d = 0; d < drinks.length; d++) {
      var ds = drinks[d];
      var dcls = 'bg-rush-slot is-' + (ds.state === 'ready' ? 'ready' : (ds.state === 'brewing' ? 'cooking' : 'empty'));
      var dinner = '';
      if (ds.state === 'empty') {
        dinner = '<span class="bg-rush-slot-e">＋</span><span class="bg-rush-slot-n">음료 내리기</span>';
      } else if (ds.state === 'brewing') {
        dinner = '<span class="bg-rush-slot-e">🥤</span>' +
          '<span class="bg-rush-slot-bar"><i class="bg-rush-fill" id="fill-d' + d + '" style="width:0%"></i></span>' +
          '<span class="bg-rush-slot-n">내리는 중</span>';
      } else {
        dinner = '<span class="bg-rush-slot-e">🥤</span><span class="bg-rush-slot-n">완성! 탭 서빙</span>';
      }
      dh += '<div class="' + dcls + '" data-act="ds" data-idx="' + d + '" role="button" tabindex="0">' +
        dinner + (ds.state === 'ready' ? '<span class="bg-rush-trash" data-trash="d' + d + '">🗑️</span>' : '') +
      '</div>';
    }
    drinksEl.innerHTML = dh;
  }

  function renderAll() {
    renderCustomers();
    renderKitchen();
    scoreEl.textContent = String(score);
    comboEl.textContent = 'x' + comboStreak;
    servedEl.textContent = String(servedCustomers);
  }

  function paintPatience() {
    for (var i = 0; i < 3; i++) {
      var c = customers[i];
      if (!c) continue;
      var fill = custsEl.querySelector('#pat-' + i);
      if (!fill) continue;
      var ratio = Math.max(0, c.patienceLeft / c.patienceMax);
      fill.style.width = (ratio * 100) + '%';
      fill.className = 'bg-rush-pat-fill' + (ratio <= 0.25 ? ' is-low' : (ratio <= 0.5 ? ' is-warn' : ''));
    }
  }

  function findTarget(dishKey) {
    var best = -1;
    var bestLeft = Infinity;
    for (var i = 0; i < customers.length; i++) {
      var c = customers[i];
      if (!c) continue;
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
    if (allDone(c)) {
      servedCustomers += 1;
      score += 15;
      customers[idx] = null;
      nextSpawnAt[idx] = now + 800;
      flash[idx] = { face: '😄', text: '맛있어요!', until: now + 700 };
      statusEl.textContent = '서빙 완료! +' + (25 + bonus) + '점' + (bonus ? ' (COMBO +' + bonus + ')' : '');
    } else {
      statusEl.textContent = RUSH_ITEM[dishKey].n + ' 서빙! +' + (10 + bonus) + '점' + (bonus ? ' (COMBO +' + bonus + ')' : '');
    }
    dirty = true;
  }

  function startPatty() {
    for (var i = 0; i < grill.length; i++) {
      if (grill[i].state === 'empty') {
        var now = Date.now();
        grill[i].state = 'cooking';
        grill[i].startAt = now;
        grill[i].readyAt = now + RUSH_PATTY_MS;
        statusEl.textContent = '패티를 굽기 시작했어요.';
        dirty = true;
        return;
      }
    }
    statusEl.textContent = '그릴이 꽉 찼어요 — 다 익은 패티를 접시로 옮겨 주세요.';
  }

  function putBun() {
    for (var i = 0; i < plates.length; i++) {
      if (!plates[i].bun) {
        plates[i].bun = true;
        statusEl.textContent = '접시에 빵을 올렸어요. 이제 패티를 올리세요.';
        dirty = true;
        return;
      }
    }
    statusEl.textContent = '접시가 모두 사용 중이에요 — 완성된 버거를 서빙하거나 비워 주세요.';
  }

  function addTopping() {
    for (var i = 0; i < plates.length; i++) {
      var p = plates[i];
      if (p.bun && p.patty && !p.special) {
        p.special = true;
        statusEl.textContent = '토핑을 올려 스페셜 버거로 업그레이드!';
        dirty = true;
        return;
      }
    }
    statusEl.textContent = '버거가 완성된 접시에만 토핑을 올릴 수 있어요.';
  }

  function startDrink() {
    for (var i = 0; i < drinks.length; i++) {
      if (drinks[i].state === 'empty') {
        var now = Date.now();
        drinks[i].state = 'brewing';
        drinks[i].startAt = now;
        drinks[i].readyAt = now + RUSH_DRINK_MS;
        statusEl.textContent = '음료를 내리고 있어요.';
        dirty = true;
        return;
      }
    }
    statusEl.textContent = '음료 머신이 꽉 찼어요 — 완성된 음료를 서빙해 주세요.';
  }

  function tapGrill(idx) {
    var st = grill[idx];
    if (!st) return;
    if (st.state === 'empty') { startPatty(); return; }
    if (st.state === 'burnt') {
      grill[idx] = { state: 'empty', startAt: 0, readyAt: 0 };
      statusEl.textContent = '탄 패티를 버렸어요.';
      dirty = true;
      return;
    }
    if (st.state !== 'ready') {
      statusEl.textContent = '아직 익는 중이에요.';
      return;
    }
    for (var i = 0; i < plates.length; i++) {
      if (plates[i].bun && !plates[i].patty) {
        plates[i].patty = true;
        grill[idx] = { state: 'empty', startAt: 0, readyAt: 0 };
        statusEl.textContent = '접시에 패티를 올렸어요. 완성된 버거를 손님에게 서빙하세요!';
        dirty = true;
        return;
      }
    }
    statusEl.textContent = '패티를 올릴 접시가 없어요 — 빵을 먼저 놓아 주세요.';
  }

  function tapPlate(idx) {
    var p = plates[idx];
    if (!p) return;
    var dish = dishOfPlate(p);
    if (!dish) {
      statusEl.textContent = p.bun ? '패티를 올려야 버거가 완성됩니다.' : '빈 접시예요. [빵 놓기]로 시작하세요.';
      return;
    }
    serveItem(dish, function () {
      plates[idx] = { bun: false, patty: false, special: false };
    });
  }

  function tapDrink(idx) {
    var ds = drinks[idx];
    if (!ds) return;
    if (ds.state === 'empty') { startDrink(); return; }
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
    dirty = true;
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
    if (act === 'cook') startPatty();
    else if (act === 'bun') putBun();
    else if (act === 'top') addTopping();
    else if (act === 'drink') startDrink();
    else if (act === 'gs') tapGrill(idx);
    else if (act === 'ps') tapPlate(idx);
    else if (act === 'ds') tapDrink(idx);
  }

  function tick() {
    var now = Date.now();
    var dt = lastNow ? Math.min(400, now - lastNow) : 0;
    lastNow = now;
    var left = Math.max(0, endAt - now);
    timeEl.textContent = (left / 1000).toFixed(1);
    barEl.style.width = Math.max(0, Math.min(100, (left / RUSH_DURATION) * 100)) + '%';

    for (var i = 0; i < customers.length; i++) {
      var c = customers[i];
      if (c) {
        c.patienceLeft -= dt;
        if (c.patienceLeft <= 0) {
          lostCustomers += 1;
          comboStreak = 0;
          lastServeAt = 0;
          customers[i] = null;
          nextSpawnAt[i] = now + 900;
          flash[i] = { face: '😞', text: '너무 늦었어요', until: now + 700 };
          statusEl.textContent = '손님이 기다리다 떠났어요…';
          dirty = true;
        }
      } else if (now >= nextSpawnAt[i] && left > 0) {
        spawn(i);
        dirty = true;
      }
    }

    for (var g = 0; g < grill.length; g++) {
      var st = grill[g];
      if (st.state === 'cooking' && now >= st.readyAt) {
        st.state = 'ready';
        st.readyAt = now;
        dirty = true;
      } else if (st.state === 'ready' && now - st.readyAt >= RUSH_BURN_MS) {
        st.state = 'burnt';
        dirty = true;
      }
      var gfill = playEl.querySelector('#fill-g' + g);
      if (gfill) {
        var gp = st.state === 'cooking' ? Math.min(100, ((now - st.startAt) / RUSH_PATTY_MS) * 100) : 100;
        gfill.style.width = Math.max(0, Math.min(100, gp)) + '%';
      }
    }

    for (var d = 0; d < drinks.length; d++) {
      var ds = drinks[d];
      if (ds.state === 'brewing' && now >= ds.readyAt) {
        ds.state = 'ready';
        dirty = true;
      }
      var dfill = playEl.querySelector('#fill-d' + d);
      if (dfill) {
        var dp = ds.state === 'brewing' ? Math.min(100, ((now - ds.startAt) / RUSH_DRINK_MS) * 100) : 100;
        dfill.style.width = Math.max(0, Math.min(100, dp)) + '%';
      }
    }

    paintPatience();

    if (dirty) {
      dirty = false;
      renderAll();
    }
    if (left <= 0 && !finished) finish();
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearAllTimers();
    var total = servedCustomers + lostCustomers;
    var accuracy = total ? Math.round((servedCustomers / total) * 100) : 0;
    statusEl.textContent = '영업 종료 — ' + score + '점 · 서빙 ' + servedCustomers + '명';
    done({ game_key: 'order_cooking', score: score, metric_ms: null, accuracy: accuracy });
  }

  playEl.addEventListener('click', onClick);

  later(function () {
    if (finished) return;
    var now = Date.now();
    endAt = now + RUSH_DURATION;
    lastNow = now;
    nextSpawnAt = [now, now + 1100, now + 2200];
    renderAll();
    statusEl.textContent = '영업 시작! 손님 주문을 보고 패티를 구우세요.';
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
  }

  function showHub() {
    clearAllTimers();
    stageEl.hidden = true;
    stageEl.innerHTML = '';
    boardEl.hidden = false;
    hubEl.hidden = false;
    renderHub();
  }

  function startGame(key) {
    var meta = brainGameMeta(key);
    if (!meta) return;
    clearAllTimers();
    boardEl.hidden = true;
    hubEl.hidden = true;
    stageEl.hidden = false;
    stageEl.innerHTML =
      '<div class="bg-game-head">' +
        '<button type="button" class="bg-back" id="bg-back">' + icon('chevronLeft', 16) + '게임 목록</button>' +
        '<span class="bg-game-area">' + esc(meta.area) + '</span>' +
      '</div>' +
      '<h2 class="bg-game-title">' + esc(meta.title) + '</h2>' +
      '<p class="bg-game-desc">' + esc(meta.howto) + '</p>' +
      '<div class="bg-play" id="bg-play"></div>';
    var back = stageEl.querySelector('#bg-back');
    back.addEventListener('click', showHub);

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

  renderHub();
}
