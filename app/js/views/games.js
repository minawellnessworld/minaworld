/* S11. BRAIN GAME — 두뇌게임 4종 + 최고기록·연속 출석(스트릭)
   ---------------------------------------------------------------------
   · 저장·표시하는 값은 본인이 실제로 플레이한 기록뿐입니다.
     (최고기록 · 최근기록 · 오늘 완료 · 연속 플레이 일수 / 타인 비교·뇌나이 없음)
   · 포인트 적립과 연결하지 않습니다. (체크인 하루 +5P 정책만 유지)
   · 타이머는 게임 종료·다른 화면 이동(destroy) 시 모두 정리합니다.
   ===================================================================== */
import { BRAIN_GAMES, brainGameMeta, brainGameScoreText } from '../config.js?v=2.0.24';
import {
  state, listBrainGameLogs, saveBrainGameLog, computeBrainGameStats, friendlyError
} from '../store.js?v=2.0.24';
import { icon, esc, toast, go, noticeBox } from '../ui.js?v=2.0.24';

var WEEK_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

var STROOP_COLORS = [
  { name: '빨강', ink: '#B4453F' },
  { name: '파랑', ink: '#1F4E9C' },
  { name: '초록', ink: '#1F7A5A' },
  { name: '노랑', ink: '#C98A0B' }
];

/* ---------------------------------------------------------------- timers */
var timers = [];

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

function clearAllTimers() {
  for (var i = 0; i < timers.length; i++) {
    clearTimeout(timers[i]);
    clearInterval(timers[i]);
  }
  timers = [];
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
  var pct = Math.round((stats.todayCount / 4) * 100);
  var complete = stats.todayCount >= 4;
  return '<div class="bg-board-inner">' +
    '<div class="bg-streak">' +
      '<span class="bg-streak-ico">' + icon('flame', 22) + '</span>' +
      '<span class="bg-streak-body">' +
        '<strong>' + (stats.streakDays > 0 ? stats.streakDays + '일 연속 플레이' : '오늘 첫 판을 시작해 보세요') + '</strong>' +
        '<span>' + (stats.streakDays > 0 ? '하루 한 판이면 기록이 이어집니다' : '4종 두뇌게임 · 1~2분이면 충분해요') + '</span>' +
      '</span>' +
      '<span class="bg-streak-total">누적<strong>' + stats.totalPlays + '</strong>판</span>' +
    '</div>' +
    '<div class="bg-today">' +
      '<div class="bg-today-head"><strong>오늘 챌린지</strong><span>' + stats.todayCount + '/4 완료</span></div>' +
      '<div class="bg-progress"><span class="bg-progress-bar" style="width:' + pct + '%"></span></div>' +
      '<div class="bg-week" aria-label="최근 7일 플레이 기록">' + weekHtml(stats) + '</div>' +
    '</div>' +
    (complete
      ? '<div class="bg-complete">' + icon('trophy', 18) +
          '<span><strong>오늘의 두뇌 워밍업 4종 완주!</strong><span>내일도 한 판씩 이어가면 연속 기록이 늘어납니다.</span></span>' +
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

  return '<div class="section-head"><h2 class="section-title">4종 두뇌게임</h2>' +
      '<div class="section-action"><span class="muted small">자유롭게 · 몇 번이든</span></div></div>' +
    '<div class="bg-games">' + cards + '</div>' +
    '<p class="bg-guide">게임은 골라서 몇 번이든 즐길 수 있어요. 오늘 4종을 모두 하면 하루 챌린지가 완성됩니다.</p>';
}

function resultHtml(key, meta, result, isRecord, stats, saveFailed) {
  var best = stats.bestByGame[key];
  var latest = stats.latestByGame[key];
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
        : '<div class="bg-result-row"><span>정답률</span><strong>' + Number(result.accuracy) + '%</strong></div>') +
      '<div class="bg-result-row"><span>오늘 챌린지</span><strong>' + stats.todayCount + '/4 완료</strong></div>' +
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

/* ---------------------------------- 4) 순발력 터치 (reaction_speed) */
function runReaction(playEl, done) {
  var results = [];
  var phase = 'idle'; /* idle | wait | go | early */
  var signalAt = 0;
  var finished = false;

  playEl.innerHTML =
    '<div class="bg-hud">' +
      '<span class="bg-hud-item">라운드<strong id="bg-react-round">1</strong>/3</span>' +
      '<span class="bg-hud-item">기록<strong id="bg-react-list">-</strong></span>' +
    '</div>' +
    '<button type="button" class="bg-react-pad is-idle" id="bg-react-pad">' +
      '<span class="bg-react-label" id="bg-react-label">준비…</span>' +
      '<span class="bg-react-hint" id="bg-react-hint">신호가 바뀌면 바로 터치하세요</span>' +
    '</button>' +
    '<p class="bg-status" id="bg-status">3라운드 평균 반응속도를 측정합니다.</p>';

  var pad = playEl.querySelector('#bg-react-pad');
  var labelEl = playEl.querySelector('#bg-react-label');
  var hintEl = playEl.querySelector('#bg-react-hint');
  var roundEl = playEl.querySelector('#bg-react-round');
  var listEl = playEl.querySelector('#bg-react-list');
  var statusEl = playEl.querySelector('#bg-status');

  function paint(cls) {
    pad.className = 'bg-react-pad ' + cls;
  }

  function listText() {
    if (!results.length) return '-';
    return results.map(function (ms) { return ms + 'ms'; }).join(' · ');
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearAllTimers();
    var sum = results.reduce(function (acc, ms) { return acc + ms; }, 0);
    var avg = Math.round(sum / results.length);
    paint('is-done');
    labelEl.textContent = avg + 'ms';
    hintEl.textContent = '3라운드 평균';
    statusEl.textContent = '측정 완료 — 평균 ' + avg + 'ms (' + results.join('ms · ') + 'ms)';
    done({ game_key: 'reaction_speed', score: avg, metric_ms: avg, accuracy: null });
  }

  function beginTrial() {
    phase = 'wait';
    paint('is-wait');
    roundEl.textContent = String(Math.min(3, results.length + 1));
    listEl.textContent = listText();
    labelEl.textContent = '준비…';
    hintEl.textContent = '신호가 바뀌면 바로 터치하세요';
    statusEl.textContent = '아직 누르지 마세요.';
    var delay = 1500 + Math.floor(Math.random() * 2000);
    later(function () {
      if (finished) return;
      phase = 'go';
      signalAt = Date.now();
      paint('is-go');
      labelEl.textContent = '지금 터치!';
      hintEl.textContent = '';
      statusEl.textContent = '';
    }, delay);
  }

  pad.addEventListener('click', function () {
    if (finished) return;
    if (phase === 'wait') {
      phase = 'early';
      paint('is-early');
      labelEl.textContent = '너무 빨랐어요';
      hintEl.textContent = '신호 전에 터치했습니다';
      statusEl.textContent = '이번 라운드를 다시 측정합니다.';
      later(beginTrial, 1300);
      return;
    }
    if (phase !== 'go') return;
    var ms = Date.now() - signalAt;
    results.push(ms);
    phase = 'idle';
    paint('is-done');
    labelEl.textContent = ms + 'ms';
    hintEl.textContent = results.length >= 3 ? '3라운드 완료' : '다음 라운드 준비';
    statusEl.textContent = results.length >= 3 ? '잠시 후 기록을 저장합니다…' : '좋아요! 다음 신호를 기다리세요.';
    listEl.textContent = listText();
    if (results.length >= 3) later(finish, 700);
    else later(beginTrial, 1000);
  });

  later(beginTrial, 600);
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
      '<p class="page-desc">기억력 · 집중력 · 주의전환 · 반응속도 4종을 1~2분씩 가볍게. 매일 한 판이면 기록이 이어집니다.</p>' +
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
    else if (key === 'reaction_speed') runReaction(playEl, done);
  }

  renderHub();
}
