/* S11. BRAIN GAME — 두뇌게임 6종 + 최고기록·연속 출석(스트릭)
   ---------------------------------------------------------------------
   · 저장·표시하는 값은 본인이 실제로 플레이한 기록뿐입니다.
     (최고기록 · 최근기록 · 오늘 완료 · 연속 플레이 일수 / 타인 비교·뇌나이 없음)
   · 포인트 적립과 연결하지 않습니다. (체크인 하루 +5P 정책만 유지)
   · 타이머(setTimeout/setInterval)와 애니메이션(requestAnimationFrame)은
     게임 종료·다른 화면 이동(destroy) 시 모두 정리합니다.
   · 게임 개수는 config.js 의 BRAIN_GAMES 길이를 그대로 따릅니다.
   · '오늘 챌린지' 완주 목표는 Math.min(4, 게임 수) — 게임이 늘어도 하루 부담은 4종.
   ===================================================================== */
import { BRAIN_GAMES, brainGameMeta, brainGameScoreText } from '../config.js?v=2.0.36';
import {
  state, listBrainGameLogs, saveBrainGameLog, computeBrainGameStats, friendlyError
} from '../store.js?v=2.0.36';
import { icon, esc, toast, go, noticeBox } from '../ui.js?v=2.0.36';
import { sfx, unlockSfx, sfxToggleHtml, bindSfxToggles } from '../game-sfx.js?v=2.0.36';

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
/* 드래그 앤 드롭처럼 게임 밖(window/document)에 붙인 리스너의 정리 함수 —
   destroy()·게임 종료·화면 이동 시 확실히 떼어 냅니다. */
var activeDragCancel = null;

function cancelActiveDrag() {
  if (typeof activeDragCancel === 'function') {
    var fn = activeDragCancel;
    activeDragCancel = null;
    try { fn(); } catch (err) { /* 이미 정리된 경우 무시 */ }
  }
}

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
  cancelActiveDrag();
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
  var goal = stats.todayGoal || Math.min(4, total);
  var done = Math.min(stats.todayCount, goal);
  var pct = goal ? Math.round((done / goal) * 100) : 0;
  var complete = stats.todayCount >= goal;
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
      '<div class="bg-today-head"><strong>오늘 챌린지</strong><span>' + done + '/' + goal + ' 완료</span></div>' +
      '<div class="bg-progress"><span class="bg-progress-bar" style="width:' + pct + '%"></span></div>' +
      '<div class="bg-week" aria-label="최근 7일 플레이 기록">' + weekHtml(stats) + '</div>' +
    '</div>' +
    (complete
      ? '<div class="bg-complete">' + icon('trophy', 18) +
          '<span><strong>오늘의 두뇌 워밍업 ' + goal + '종 완주!</strong><span>내일도 한 판씩 이어가면 연속 기록이 늘어납니다.</span></span>' +
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

/* 게임 선택 카드의 예시 그림 — 게임별 미니 플레이 프리뷰 (인라인 SVG 84×68, 바깥 배경은 CSS 톤) */
function previewSvg(inner) {
  return '<svg class="bg-game-thumb-svg" viewBox="0 0 84 68" width="84" height="68" aria-hidden="true" focusable="false">' + inner + '</svg>';
}

var BB_PREVIEW_COLORS = { a: '#E4694F', b: '#F5B82E', c: '#3E9E8A', d: '#4A7BC4', e: '#8B6BC7' };

var GAME_PREVIEWS = {
  /* 1) 순서 기억 — 3×3 격자 + 켜진 불빛 1·2·3 + 연결선 */
  memory_seq: function () {
    var out = '';
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        out += '<rect x="' + (14 + c * 20) + '" y="' + (5 + r * 20) + '" width="16" height="16" rx="5" ' +
          'fill="rgba(255,255,255,.13)" stroke="rgba(255,255,255,.2)"/>';
      }
    }
    out += '<path d="M22 13 42 33 62 53" fill="none" stroke="#F5B82E" stroke-width="1.6" stroke-dasharray="3 2.4" stroke-linecap="round"/>';
    var lit = [[22, 13, '1'], [42, 33, '2'], [62, 53, '3']];
    for (var i = 0; i < lit.length; i++) {
      out += '<rect x="' + (lit[i][0] - 8) + '" y="' + (lit[i][1] - 8) + '" width="16" height="16" rx="5" fill="#F5B82E"/>' +
        '<text x="' + lit[i][0] + '" y="' + (lit[i][1] + 3.4) + '" text-anchor="middle" font-size="9" font-weight="800" fill="#241A02">' + lit[i][2] + '</text>';
    }
    return out;
  },
  /* 2) 색깔 vs 글자 — 파란 잉크 '빨강' + 색상 버튼 4개 */
  stroop_color: function () {
    var dots = [['#B4453F', 18], ['#1F4E9C', 34], ['#1F7A5A', 50], ['#C98A0B', 66]];
    var out = '<rect x="8" y="6" width="68" height="33" rx="9" fill="#FFFFFF"/>' +
      '<text x="42" y="29" text-anchor="middle" font-size="17" font-weight="900" letter-spacing="-0.6" fill="#1F4E9C">빨강</text>';
    for (var i = 0; i < dots.length; i++) {
      out += '<circle cx="' + dots[i][1] + '" cy="54" r="6.5" fill="' + dots[i][0] + '"' +
        (i === 1 ? ' stroke="#FFFFFF" stroke-width="2"' : ' opacity=".88"') + '/>';
    }
    return out;
  },
  /* 3) 1→25 숫자 터치 — 1·2·3 이 골드로 눌린 미니 숫자판 */
  number_grid: function () {
    var out = '';
    var nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (var i = 0; i < nums.length; i++) {
      var r = Math.floor(i / 3);
      var c = i % 3;
      var x = 13 + c * 20;
      var y = 5 + r * 20;
      var hit = nums[i] <= 3;
      out += '<rect x="' + x + '" y="' + y + '" width="16" height="16" rx="4.5" fill="' + (hit ? '#C9A96E' : '#FFFFFF') + '" stroke="rgba(7,13,30,.1)" stroke-width="1"/>' +
        '<text x="' + (x + 8) + '" y="' + (y + 12) + '" text-anchor="middle" font-size="9.5" font-weight="800" fill="' + (hit ? '#FFFFFF' : '#8A93A6') + '">' + nums[i] + '</text>';
    }
    return out;
  },
  /* 4) 양궁 과녁 — 5중 동심원 + 중앙 조준점 + 화살 */
  archery_target: function () {
    return '<circle cx="42" cy="34" r="30" fill="#FAF7F2"/>' +
      '<circle cx="42" cy="34" r="24" fill="#2B2B33"/>' +
      '<circle cx="42" cy="34" r="18" fill="#3F6FB5"/>' +
      '<circle cx="42" cy="34" r="12" fill="#B4453F"/>' +
      '<circle cx="42" cy="34" r="6.5" fill="#F5B82E"/>' +
      '<path d="M62 11 48 27" stroke="#4A5568" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M62 11 58 12 61 15Z" fill="#B4453F"/>' +
      '<circle cx="47.5" cy="28.5" r="7" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-opacity=".92"/>' +
      '<circle cx="47.5" cy="28.5" r="1.6" fill="#FFFFFF"/>';
  },
  /* 5) 브레인 주방 매드니스 — 손님 + 주문 말풍선(버거·음료) + 조리대 */
  order_cooking: function () {
    return '<circle cx="20" cy="31" r="11" fill="#F6CEAA"/>' +
      '<path d="M9.4 28.6a10.8 10.8 0 0 1 21.2 0c-2.6-3.4-6-5-10.6-5s-8 1.6-10.6 5Z" fill="#2C2C35"/>' +
      '<circle cx="16.2" cy="31" r="1.3" fill="#2B2B33"/><circle cx="23.8" cy="31" r="1.3" fill="#2B2B33"/>' +
      '<path d="M17 35.6c1 1.7 5 1.7 6 0" stroke="#B4736B" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M3.4 52c0-5.4 5.2-8.6 11.6-8.6S26.6 46.6 26.6 52Z" fill="#41587C"/>' +
      '<rect x="34" y="5" width="44" height="30" rx="9" fill="#FFFFFF"/>' +
      '<path d="M36 34 33 41 42.6 35.6Z" fill="#FFFFFF"/>' +
      '<rect x="40" y="11" width="15" height="4.4" rx="2.2" fill="#E0A93C"/>' +
      '<rect x="40" y="15.8" width="15" height="3.6" rx="1.6" fill="#7A4A2C"/>' +
      '<rect x="40" y="19.8" width="15" height="3.4" rx="1.7" fill="#E0A93C"/>' +
      '<path d="M43 16.4h9" stroke="#3E9E8A" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M60 12h9l-1.4 13h-6.2Z" fill="#B4453F"/>' +
      '<path d="M60 12h9l-.3 3h-8.4Z" fill="#FFFFFF" fill-opacity=".55"/>' +
      '<path d="M66 12 69 6" stroke="#8A93A6" stroke-width="1.4" stroke-linecap="round"/>' +
      '<rect x="6" y="54" width="72" height="9" rx="4.5" fill="rgba(255,255,255,.22)"/>' +
      '<path d="M12 60.5h16M32 60.5h16M52 60.5h16" stroke="rgba(7,13,30,.35)" stroke-width="1.4" stroke-linecap="round"/>' +
      '<ellipse cx="66" cy="57.5" rx="9" ry="2.6" fill="#FFFFFF" fill-opacity=".75"/>' +
      '<circle cx="66" cy="56" r="3" fill="#7A4A2C"/>';
  },
  /* 6) 블록 블라스트 — 컬러 블록 격자 + 빛나는 클리어 줄 + 하단 3조각 */
  block_blast: function () {
    var map = [
      ['a', '', '', 'b', ''],
      ['a', 'a', '', 'b', 'c'],
      ['', '', '', '', ''],
      ['', 'd', 'd', 'c', 'c']
    ];
    var out = '';
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 5; c++) {
        var x = 15 + c * 11;
        var y = 4 + r * 11;
        var clearRow = r === 2;
        var key = map[r][c];
        var fill = clearRow ? '#FFF1C9' : (key ? BB_PREVIEW_COLORS[key] : 'rgba(255,255,255,.1)');
        out += '<rect x="' + x + '" y="' + y + '" width="9" height="9" rx="2.4" fill="' + fill + '"' +
          (clearRow ? ' stroke="#F5B82E" stroke-width="1"' : '') + '/>';
      }
    }
    out += '<rect x="13" y="25" width="59" height="11" rx="4" fill="none" stroke="#F5B82E" stroke-opacity=".55" stroke-width="1.2"/>';
    /* 하단 블록 조각 3개 */
    out += '<rect x="16" y="52" width="9" height="9" rx="2.4" fill="#E4694F"/>' +
      '<rect x="34" y="52" width="9" height="9" rx="2.4" fill="#F5B82E"/><rect x="45" y="52" width="9" height="9" rx="2.4" fill="#F5B82E"/>' +
      '<rect x="63" y="52" width="9" height="9" rx="2.4" fill="#4A7BC4"/><rect x="63" y="63" width="9" height="9" rx="2.4" fill="#4A7BC4"/>' +
      '<rect x="74" y="63" width="9" height="9" rx="2.4" fill="#4A7BC4"/>';
    return out;
  }
};

function gamePreviewHtml(key) {
  var fn = GAME_PREVIEWS[key];
  if (fn) return previewSvg(fn());
  /* 앞으로 게임이 더 늘어도 그림이 비지 않도록 두는 기본 폴백 */
  return previewSvg(
    '<rect x="12" y="10" width="60" height="40" rx="11" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.3)"/>' +
    '<circle cx="30" cy="30" r="7" fill="#F5B82E"/>' +
    '<circle cx="44" cy="30" r="7" fill="rgba(255,255,255,.4)"/>' +
    '<circle cx="58" cy="30" r="7" fill="rgba(255,255,255,.22)"/>' +
    '<text x="42" y="62" text-anchor="middle" font-size="9" font-weight="700" fill="rgba(255,255,255,.6)">NEW GAME</text>'
  );
}

function hubHtml(stats) {
  var total = BRAIN_GAMES.length;
  var goal = stats.todayGoal || Math.min(4, total);
  var cards = BRAIN_GAMES.map(function (g) {
    var best = stats.bestByGame[g.key];
    var latest = stats.latestByGame[g.key];
    var doneToday = Boolean(stats.todayGames[g.key]);
    return '<button type="button" class="bg-game-card' + (doneToday ? ' is-done' : '') + '" data-game="' + esc(g.key) + '">' +
      '<span class="bg-game-thumb tone-' + esc(g.tone) + '">' + gamePreviewHtml(g.key) + '</span>' +
      '<span class="bg-game-text">' +
        '<span class="bg-game-area">' + esc(g.area) + '</span>' +
        '<span class="bg-game-title-row"><strong>' + esc(g.title) + '</strong>' +
          (doneToday ? '<span class="bg-done">' + icon('check', 11) + '오늘 완료</span>' : '') +
        '</span>' +
        '<span class="bg-game-sub">' + esc(g.desc) + '</span>' +
        '<span class="bg-game-meta">' +
          '<span class="bg-game-best">' + (best ? '최고 ' + brainGameScoreText(g.key, best.score) : '첫 기록 도전') + '</span>' +
          (latest ? '<span class="bg-game-latest">최근 ' + brainGameScoreText(g.key, latest.score) + '</span>' : '') +
        '</span>' +
      '</span>' +
      '<span class="bg-play-ico">' + icon('chevronRight', 16) + '</span>' +
    '</button>';
  }).join('');

  return '<div class="section-head"><h2 class="section-title">' + total + '종 두뇌게임</h2>' +
      '<div class="section-action bg-hub-tools"><span class="muted small">자유롭게 · 몇 번이든</span>' +
        sfxToggleHtml('bg-sfx-hub') + '</div></div>' +
    '<div class="bg-games">' + cards + '</div>' +
    '<p class="bg-guide">게임은 골라서 몇 번이든 즐길 수 있어요. 아무 게임이나 ' + goal + '종을 하면 오늘 챌린지가 완성됩니다.</p>';
}

function resultHtml(key, meta, result, isRecord, stats, saveFailed) {
  var best = stats.bestByGame[key];
  var latest = stats.latestByGame[key];
  var total = stats.gameCount || BRAIN_GAMES.length;
  var goal = stats.todayGoal || Math.min(4, total);
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
      '<div class="bg-result-row"><span>오늘 챌린지</span><strong>' + Math.min(stats.todayCount, goal) + '/' + goal + ' 완료</strong></div>' +
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

/* 토핑 스테이션 그림 — 스텐 바트에 담긴 양상추·토마토·치즈 */
function toppingSvg() {
  return '<svg viewBox="0 0 56 46" class="bg-rush-topping-art" aria-hidden="true">' +
    '<defs>' +
      '<linearGradient id="bgTopSteel" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#F7FAFD"/><stop offset=".5" stop-color="#CFD7E1"/><stop offset="1" stop-color="#828C9A"/>' +
      '</linearGradient>' +
      '<linearGradient id="bgTopInner" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#AEBBCC"/><stop offset="1" stop-color="#E6ECF3"/>' +
      '</linearGradient>' +
      '<linearGradient id="bgTopLeaf" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#A6E4AE"/><stop offset="1" stop-color="#3E8C56"/>' +
      '</linearGradient>' +
    '</defs>' +
    /* 스텐 바트 */
    '<path d="M5 24h46c0 11.8-10 19.2-23 19.2S5 35.8 5 24Z" fill="url(#bgTopSteel)"/>' +
    '<ellipse cx="28" cy="24" rx="23" ry="6" fill="url(#bgTopInner)" stroke="#8E99A7" stroke-width="1.1"/>' +
    '<path d="M8.4 26c1.6 8 9.2 13.9 19.6 13.9" stroke="rgba(255,255,255,.8)" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
    /* 내용물 — 바트에 수북이 담긴 양상추·토마토·치즈 */
    '<g>' +
      '<path d="M8.6 25.6c-2.1-5.2-.2-10.6 4.8-12.6 3-1.2 6.1 0 7.1 2.3-4.1 1-6.3 4.2-6.6 8.5Z" fill="url(#bgTopLeaf)"/>' +
      '<path d="M15.6 26.6c-1.7-5.7 1-11.2 6.5-12.9 3-.9 6 .3 7.4 2.6-5.1.3-8.6 4.1-9.4 9.5Z" fill="#7ECB8E"/>' +
      '<path d="M27.4 26.2c-.9-5.5 2-10.2 7.5-11.2 2.6-.5 5.2.4 6.7 2.4-4.9.6-8 3.9-8.6 8.6Z" fill="url(#bgTopLeaf)"/>' +
      '<path d="M38.8 27c.6-4.7 3.6-8.1 8.1-8.3 1.8 0 3.4.6 4.4 2-3.9.6-6.3 3.1-6.7 6.3Z" fill="#6FBF80"/>' +
      '<circle cx="18.6" cy="21" r="6" fill="#E05348"/>' +
      '<circle cx="18.6" cy="21" r="4" fill="#F27F6D"/>' +
      '<circle cx="18.6" cy="21" r="1.8" fill="#FBB9A9"/>' +
      '<circle cx="35" cy="20" r="5.4" fill="#D64A40"/>' +
      '<circle cx="35" cy="20" r="3.6" fill="#EE7A67"/>' +
      '<circle cx="35" cy="20" r="1.6" fill="#FBB9A9"/>' +
      '<path d="M23.6 14.2 31.8 10.2l8.8 4.1-8.6 4.5Z" fill="#F6C74A"/>' +
      '<path d="M26.8 13.8 31.8 11.2l4.7 2.2-4.7 2.4Z" fill="#FFE08A"/>' +
      '<rect x="14.6" y="26.2" width="4.6" height="3.2" rx="1" fill="#F6C74A"/>' +
      '<rect x="33.4" y="25.6" width="4" height="3" rx="1" fill="#FFD873"/>' +
    '</g>' +
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
      '<div class="bg-rush-station is-topping">' +
        '<span class="bg-rush-station-label">토핑</span>' +
        '<button type="button" class="bg-rush-topping" data-act="top" aria-label="토핑 올리기 — 버거에 양상추·토마토·치즈 올리기">' +
          toppingSvg() +
          '<span class="bg-rush-topping-n">토핑 올리기</span>' +
        '</button>' +
      '</div>' +
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
      body = '<span class="bg-rush-gslot-plus">＋</span><span class="bg-rush-slot-n">패티 굽기</span>';
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
    if (!layers) layers = '<span class="bg-rush-bun-hint"></span>';
    var label = dish ? '서빙 →' : (!p.bun ? '번 올리기' : '패티 올리기');
    var trash = (p.bun || p.patty || p.special)
      ? '<span class="bg-rush-trash" data-trash="p' + i + '">🗑️</span>'
      : '';
    return '<span class="bg-rush-stack">' + layers + '</span>' +
      '<span class="bg-rush-plate-base"></span>' +
      '<span class="bg-rush-slot-n' + (dish ? ' is-gold' : '') + '">' + label + '</span>' + trash;
  }

  function drinkInner(i) {
    var ds = drinks[i];
    var label = ds.state === 'ready' ? '서빙 →' : (ds.state === 'brewing' ? '따르는 중' : '음료 붓기');
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

  function addTopping() {
    for (var i = 0; i < plates.length; i++) {
      var p = plates[i];
      if (p.bun && !p.special) {
        p.special = true;
        statusEl.textContent = p.patty
          ? '토핑을 올려 스페셜 버거 완성!'
          : '토핑을 올렸어요. 이제 구운 패티를 올리면 스페셜 버거 완성!';
        sfx.topping();
        paintAll();
        return;
      }
    }
    statusEl.textContent = '번이 올라간 접시에만 토핑을 올릴 수 있어요 — 빈 접시를 눌러 번을 먼저 올려 주세요.';
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
    statusEl.textContent = '패티를 올릴 접시가 없어요 — 빈 접시를 눌러 번을 먼저 올려 주세요.';
    sfx.nope();
  }

  function tapPlate(idx) {
    var p = plates[idx];
    if (!p) return;
    var dish = dishOfPlate(p);
    if (!dish) {
      if (!p.bun && !p.patty) {
        p.bun = true;
        statusEl.textContent = '빈 접시에 번을 올렸어요. 이제 철판 그릴을 눌러 패티를 구우세요.';
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
    if (act === 'top') addTopping();
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
  /* 더블클릭(더블탭) 기본동작 차단 — 화면 확대·텍스트 선택 방지 */
  playEl.addEventListener('dblclick', function (ev) { ev.preventDefault(); });

  later(function () {
    if (finished) return;
    var now = Date.now();
    endAt = now + RUSH_DURATION;
    lastNow = now;
    nextSpawnAt = [now, now + 1100, now + 2200];
    paintAll();
    statusEl.textContent = '영업 시작! 손님이 왔어요 — 접시·그릴·토핑·음료를 눌러 요리하세요.';
    sfx.start();
    every(tick, 80);
    tick();
  }, 700);
}

/* ------------- 6) 블록 블라스트 (block_blast · 8×8 블록 퍼즐)
   · 아래 3개 조각을 보드로 **끌어다 놓는 드래그 앤 드롭**이 기본 조작입니다.
     (짧게 탭해 조각을 고른 뒤 보드 칸을 누르는 방법도 보조로 함께 동작합니다.)
   · 가로·세로 8칸이 꽉 차면 줄이 지워집니다.
   · 점수 = 놓은 칸 수 × 2 + 줄 보너스(1줄 10 · 2줄 30 · 3줄 60 · 4줄 이상 100) + 콤보 보너스
   · 3조각을 모두 쓰면 새 조각 3개를 받고, 남은 조각 중 하나도 놓을 곳이 없으면 결과를 저장합니다. */
var BB_N = 8;
var BB_LIFT = 62;          /* 드래그 중 조각을 손가락보다 위로 띄우는 높이(px) */
var BB_CELL_POINTS = 2;
var BB_LINE_POINTS = [0, 10, 30, 60, 100];
var BB_COLORS = ['c1', 'c2', 'c3', 'c4', 'c5'];
var BB_POOL = [
  { w: 1, h: 1, cells: [[0, 0]] },
  { w: 2, h: 1, cells: [[0, 0], [0, 1]] },
  { w: 1, h: 2, cells: [[0, 0], [1, 0]] },
  { w: 3, h: 1, cells: [[0, 0], [0, 1], [0, 2]] },
  { w: 1, h: 3, cells: [[0, 0], [1, 0], [2, 0]] },
  { w: 4, h: 1, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { w: 1, h: 4, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { w: 2, h: 2, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  /* ㄱ자 3칸 — 네 방향 */
  { w: 2, h: 2, cells: [[0, 0], [0, 1], [1, 0]] },
  { w: 2, h: 2, cells: [[0, 0], [0, 1], [1, 1]] },
  { w: 2, h: 2, cells: [[0, 0], [1, 0], [1, 1]] },
  { w: 2, h: 2, cells: [[0, 1], [1, 0], [1, 1]] },
  /* ㄴ자 4칸 */
  { w: 3, h: 2, cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
  { w: 3, h: 2, cells: [[0, 0], [0, 1], [0, 2], [1, 0]] },
  { w: 2, h: 3, cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { w: 2, h: 3, cells: [[0, 1], [1, 1], [2, 0], [2, 1]] },
  { w: 2, h: 3, cells: [[0, 0], [0, 1], [1, 0], [2, 0]] },
  { w: 2, h: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  { w: 3, h: 2, cells: [[0, 0], [1, 0], [1, 1], [1, 2]] },
  { w: 3, h: 2, cells: [[0, 2], [1, 0], [1, 1], [1, 2]] },  /* T자 · S자 · Z자 */
  { w: 3, h: 2, cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { w: 3, h: 2, cells: [[0, 1], [1, 0], [1, 1], [1, 2]] },
  { w: 2, h: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { w: 2, h: 3, cells: [[0, 1], [1, 0], [1, 1], [2, 0]] },
  /* 3×2 큰 블록 */
  { w: 3, h: 2, cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]] }
];

function bbMakePiece(def) {
  return {
    w: def.w,
    h: def.h,
    cells: def.cells,
    color: BB_COLORS[Math.floor(Math.random() * BB_COLORS.length)],
    used: false
  };
}

function bbRandomPiece(smallOnly) {
  var pool = BB_POOL;
  if (smallOnly) {
    pool = BB_POOL.filter(function (d) { return d.cells.length <= 3; });
  }
  return bbMakePiece(pool[Math.floor(Math.random() * pool.length)]);
}

function runBlockBlast(playEl, done) {
  var grid = [];
  for (var gi = 0; gi < BB_N * BB_N; gi++) grid.push('');
  var pieces = [];
  var selected = -1;
  var score = 0;
  var linesTotal = 0;
  var combo = 0;
  var locked = false;
  var finished = false;
  var clearing = {};
  var ghost = null;
  var dragState = null;
  var suppressTrayClick = 0;

  var cellsHtml = '';
  for (var b = 0; b < BB_N * BB_N; b++) {
    cellsHtml += '<button type="button" class="bg-bb-cell" data-idx="' + b + '" aria-label="' +
      (Math.floor(b / BB_N) + 1) + '행 ' + (b % BB_N + 1) + '열"></button>';
  }

  playEl.innerHTML =
    '<div class="bg-hud">' +
      '<span class="bg-hud-item">점수<strong id="bg-bb-score">0</strong></span>' +
      '<span class="bg-hud-item">지운 줄<strong id="bg-bb-lines">0</strong></span>' +
      '<span class="bg-hud-item">콤보<strong id="bg-bb-combo">x0</strong></span>' +
    '</div>' +
    '<div class="bg-bb-board" id="bg-bb-board">' + cellsHtml + '</div>' +
    '<div class="bg-bb-tray" id="bg-bb-tray"></div>' +
    '<p class="bg-status" id="bg-status">조각을 고르고 보드에 놓아 보세요.</p>';

  var boardEl = playEl.querySelector('#bg-bb-board');
  var trayEl = playEl.querySelector('#bg-bb-tray');
  var statusEl = playEl.querySelector('#bg-status');
  var scoreEl = playEl.querySelector('#bg-bb-score');
  var linesEl = playEl.querySelector('#bg-bb-lines');
  var comboEl = playEl.querySelector('#bg-bb-combo');
  var cellEls = boardEl.querySelectorAll('.bg-bb-cell');

  function at(r, c) { return r * BB_N + c; }

  function fits(piece, r0, c0) {
    if (r0 < 0 || c0 < 0 || r0 + piece.h > BB_N || c0 + piece.w > BB_N) return false;
    for (var i = 0; i < piece.cells.length; i++) {
      var rr = r0 + piece.cells[i][0];
      var cc = c0 + piece.cells[i][1];
      if (rr < 0 || cc < 0 || rr >= BB_N || cc >= BB_N) return false;
      if (grid[at(rr, cc)]) return false;
    }
    return true;
  }

  function fitsAnywhere(piece) {
    for (var r = 0; r + piece.h <= BB_N; r++) {
      for (var c = 0; c + piece.w <= BB_N; c++) {
        if (fits(piece, r, c)) return true;
      }
    }
    return false;
  }

  function remaining() {
    var out = [];
    for (var i = 0; i < pieces.length; i++) {
      if (pieces[i] && !pieces[i].used) out.push(i);
    }
    return out;
  }

  function hasAnyMove() {
    var left = remaining();
    for (var i = 0; i < left.length; i++) {
      if (fitsAnywhere(pieces[left[i]])) return true;
    }
    return false;
  }

  function filledCount() {
    var n = 0;
    for (var i = 0; i < grid.length; i++) if (grid[i]) n += 1;
    return n;
  }

  /* --------------------------------------------------------- 그리기 */
  function paintBoard() {
    for (var i = 0; i < cellEls.length; i++) {
      var cls = 'bg-bb-cell';
      if (grid[i]) cls += ' is-filled ' + grid[i];
      if (clearing[i]) cls += ' is-clearing';
      if (ghost && ghost.map[i]) cls += ghost.ok ? ' is-ghost ' + ghost.color : ' is-ghost-bad';
      if (ghost && ghost.lines && ghost.lines[i]) cls += ' is-ghost-line';
      cellEls[i].className = cls;
    }
  }

  function paintHud() {
    scoreEl.textContent = String(score);
    linesEl.textContent = String(linesTotal);
    comboEl.textContent = 'x' + combo;
  }

  function pieceMiniGrid(piece) {
    var out = '';
    for (var r = 0; r < piece.h; r++) {
      for (var c = 0; c < piece.w; c++) {
        var on = false;
        for (var i = 0; i < piece.cells.length; i++) {
          if (piece.cells[i][0] === r && piece.cells[i][1] === c) { on = true; break; }
        }
        out += '<span class="bg-bb-mini' + (on ? ' is-on ' + piece.color : ' is-off') + '"></span>';
      }
    }
    return '<span class="bg-bb-mini-grid" style="grid-template-columns:repeat(' + piece.w + ',1fr)">' + out + '</span>';
  }

  function paintTray() {
    var html = '';
    for (var i = 0; i < 3; i++) {
      var p = pieces[i];
      if (!p || p.used) {
        html += '<span class="bg-bb-slot is-used" aria-hidden="true"></span>';
        continue;
      }
      html += '<button type="button" class="bg-bb-slot' + (selected === i ? ' is-selected' : '') + '"' +
        ' data-piece="' + i + '" aria-label="블록 조각 ' + (i + 1) + ' — ' + p.cells.length + '칸"' +
        ' aria-pressed="' + (selected === i ? 'true' : 'false') + '">' + pieceMiniGrid(p) + '</button>';
    }
    trayEl.innerHTML = html;
  }

  /* ------------------------------------------------------- 새 조각 */
  function trayFits(list) {
    for (var i = 0; i < list.length; i++) {
      if (fitsAnywhere(list[i])) return true;
    }
    return false;
  }

  function newTray() {
    var tight = filledCount() >= 34;
    var out = [];
    for (var i = 0; i < 3; i++) out.push(bbRandomPiece(tight && i === 0));
    var guard = 0;
    while (!trayFits(out) && guard < 40) {
      out[guard % 3] = bbRandomPiece(guard < 24);
      guard += 1;
    }
    return out;
  }

  /* --------------------------------------------------------- 놓기 */
  function selectPiece(i) {
    if (locked || finished) return;
    if (!pieces[i] || pieces[i].used) return;
    if (selected === i) return;
    selected = i;
    sfx.select();
    paintTray();
    statusEl.textContent = '보드에서 놓을 칸을 눌러 주세요.';
  }

  function placePiece(p, r0, c0) {
    locked = true;
    ghost = null;
    for (var i = 0; i < p.cells.length; i++) {
      grid[at(r0 + p.cells[i][0], c0 + p.cells[i][1])] = p.color;
    }
    p.used = true;
    selected = -1;
    score += p.cells.length * BB_CELL_POINTS;
    paintBoard();
    paintTray();
    paintHud();
    sfx.place();
    later(function () { resolveLines(); }, 110);
  }

  function resolveLines() {
    if (finished) return;
    var rows = [];
    var cols = [];
    var r, c;
    for (r = 0; r < BB_N; r++) {
      var rowFull = true;
      for (c = 0; c < BB_N; c++) {
        if (!grid[at(r, c)]) { rowFull = false; break; }
      }
      if (rowFull) rows.push(r);
    }
    for (c = 0; c < BB_N; c++) {
      var colFull = true;
      for (r = 0; r < BB_N; r++) {
        if (!grid[at(r, c)]) { colFull = false; break; }
      }
      if (colFull) cols.push(c);
    }
    var count = rows.length + cols.length;
    if (!count) {
      combo = 0;
      paintHud();
      afterPlace();
      return;
    }

    combo += 1;
    linesTotal += count;
    var base = BB_LINE_POINTS[Math.min(BB_LINE_POINTS.length - 1, count)] || 0;
    var bonus = base + (combo > 1 ? (combo - 1) * 5 : 0);
    score += bonus;
    clearing = {};
    for (var i = 0; i < rows.length; i++) {
      for (c = 0; c < BB_N; c++) clearing[at(rows[i], c)] = true;
    }
    for (var j = 0; j < cols.length; j++) {
      for (r = 0; r < BB_N; r++) clearing[at(r, cols[j])] = true;
    }
    paintBoard();
    paintHud();
    sfx.clear(count);
    statusEl.textContent = (count > 1 ? count + '줄 동시 클리어! ' : '줄 클리어! ') + '+' + bonus + '점' +
      (combo > 1 ? ' · 콤보 x' + combo : '');

    later(function () {
      for (var k = 0; k < grid.length; k++) {
        if (clearing[k]) grid[k] = '';
      }
      clearing = {};
      paintBoard();
      afterPlace();
    }, 340);
  }

  function afterPlace() {
    if (finished) return;
    var left = remaining();
    if (!left.length) {
      pieces = newTray();
      selected = 0;
      paintTray();
      sfx.refill();
      later(function () {
        if (finished) return;
        if (!hasAnyMove()) { gameOver(); return; }
        locked = false;
        if (remaining().length === 1) selected = remaining()[0];
        paintTray();
        statusEl.textContent = '새 조각 3개! 이어서 놓아 보세요.';
      }, 240);
      return;
    }
    if (!hasAnyMove()) { gameOver(); return; }
    locked = false;
    if (remaining().length === 1) {
      selected = remaining()[0];
      paintTray();
      statusEl.textContent = '마지막 조각이에요. 보드에서 놓을 칸을 눌러 주세요.';
      return;
    }
    if (selected < 0 || !pieces[selected] || pieces[selected].used) {
      selected = remaining()[0];
    }
    paintTray();
    statusEl.textContent = '다음 조각을 골라 보드에 놓아 보세요.';
  }

  function gameOver() {
    if (finished) return;
    finished = true;
    locked = true;
    cleanupDrag();
    paintBoard();
    clearAllTimers();
    statusEl.textContent = '더 이상 놓을 곳이 없어요! ' + score + '점으로 기록을 저장합니다.';
    sfx.close();
    later(function () {
      done({ game_key: 'block_blast', score: score, metric_ms: null, accuracy: null });
    }, 950);
  }

  /* --------------------------------------------------------- 입력 */
  function onTray(ev) {
    if (Date.now() < suppressTrayClick) return;
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-piece]') : null;
    if (!el) return;
    selectPiece(Number(el.getAttribute('data-piece')));
  }

  function showGhost(idx) {
    if (dragState || selected < 0 || locked || finished) return;
    var p = pieces[selected];
    if (!p || p.used) return;
    var r0 = Math.floor(idx / BB_N);
    var c0 = idx % BB_N;
    var map = {};
    for (var i = 0; i < p.cells.length; i++) {
      var r = r0 + p.cells[i][0];
      var c = c0 + p.cells[i][1];
      if (r < BB_N && c < BB_N) map[at(r, c)] = true;
    }
    ghost = { map: map, ok: fits(p, r0, c0), color: p.color };
    paintBoard();
  }

  function clearGhost() {
    if (!ghost) return;
    ghost = null;
    paintBoard();
  }

  function onBoard(ev) {
    if (finished || dragState) return;
    var el = ev.target && ev.target.closest ? ev.target.closest('.bg-bb-cell') : null;
    if (!el) return;
    if (locked) return;
    var idx = Number(el.getAttribute('data-idx'));
    if (selected < 0) {
      sfx.nope();
      statusEl.textContent = '아래 블록 조각을 먼저 고르거나, 조각을 보드로 끌어다 놓아 주세요.';
      return;
    }
    var p = pieces[selected];
    var r0 = Math.floor(idx / BB_N);
    var c0 = idx % BB_N;
    if (!p || !fits(p, r0, c0)) {
      sfx.nope();
      el.classList.remove('is-blocked');
      void el.offsetWidth;
      el.classList.add('is-blocked');
      later(function () { el.classList.remove('is-blocked'); }, 360);
      statusEl.textContent = '여기에는 이 조각을 놓을 수 없어요. 다른 칸을 눌러 주세요.';
      return;
    }
    placePiece(p, r0, c0);
  }

  /* ------------------------------------------- 드래그 앤 드롭 (기본 조작) */
  function boardMetrics() {
    var c0 = cellEls[0].getBoundingClientRect();
    var c1 = cellEls[1].getBoundingClientRect();
    var c8 = cellEls[8].getBoundingClientRect();
    return {
      cellW: c0.width,
      cellH: c0.height,
      strideX: c1.left - c0.left,
      strideY: c8.top - c0.top,
      originX: c0.left + c0.width / 2,
      originY: c0.top + c0.height / 2
    };
  }

  function buildDragNode(p, m) {
    var gap = Math.max(1, m.strideX - m.cellW);
    var el = document.createElement('div');
    el.className = 'bg-bb-drag';
    el.setAttribute('aria-hidden', 'true');
    el.style.gridTemplateColumns = 'repeat(' + p.w + ', ' + m.cellW + 'px)';
    el.style.gap = gap + 'px';
    el.style.width = (p.w * m.cellW + (p.w - 1) * gap) + 'px';
    el.style.height = (p.h * m.cellH + (p.h - 1) * gap) + 'px';
    for (var r = 0; r < p.h; r++) {
      for (var c = 0; c < p.w; c++) {
        var on = false;
        for (var i = 0; i < p.cells.length; i++) {
          if (p.cells[i][0] === r && p.cells[i][1] === c) { on = true; break; }
        }
        var cell = document.createElement('span');
        cell.className = 'bg-bb-cell' + (on ? ' is-filled ' + p.color : ' is-void');
        cell.style.width = m.cellW + 'px';
        cell.style.height = m.cellH + 'px';
        el.appendChild(cell);
      }
    }
    return el;
  }

  function positionDragNode(x, y, moved) {
    var d = dragState;
    if (!d) return;
    var w = d.node.offsetWidth || 0;
    var h = d.node.offsetHeight || 0;
    var left = x - w / 2;
    var top = y - BB_LIFT - h;
    if (top < 4) top = 4;
    d.left = left;
    d.top = top;
    d.node.style.left = Math.round(left) + 'px';
    d.node.style.top = Math.round(top) + 'px';
    if (moved) d.node.classList.add('is-moved');
  }

  /* 끌고 다니는 조각이 놓일 칸 + 그 배치로 지워질 줄을 미리 보여줍니다. */
  function updateDragTarget() {
    var d = dragState;
    if (!d) return;
    var p = pieces[d.idx];
    if (!p || p.used) { ghost = null; paintBoard(); return; }
    var m = boardMetrics();
    var col = Math.round((d.left + m.cellW / 2 - m.originX) / m.strideX);
    var row = Math.round((d.top + m.cellH / 2 - m.originY) / m.strideY);
    if (!fits(p, row, col)) {
      d.row = -1;
      d.col = -1;
      d.ok = false;
      ghost = null;
      if (row >= 0 && row < BB_N && col >= 0 && col < BB_N) {
        var bad = {};
        for (var i = 0; i < p.cells.length; i++) {
          var rr = row + p.cells[i][0];
          var cc = col + p.cells[i][1];
          if (rr >= 0 && rr < BB_N && cc >= 0 && cc < BB_N) bad[at(rr, cc)] = true;
        }
        ghost = { map: bad, ok: false, color: p.color };
      }
      paintBoard();
      return;
    }

    d.row = row;
    d.col = col;
    d.ok = true;
    var map = {};
    var sim = grid.slice();
    for (var k = 0; k < p.cells.length; k++) {
      var pr = row + p.cells[k][0];
      var pc = col + p.cells[k][1];
      map[at(pr, pc)] = true;
      sim[at(pr, pc)] = p.color;
    }
    var lines = {};
    var r2, c2;
    for (r2 = 0; r2 < BB_N; r2++) {
      var full = true;
      for (c2 = 0; c2 < BB_N; c2++) { if (!sim[at(r2, c2)]) { full = false; break; } }
      if (full) { for (c2 = 0; c2 < BB_N; c2++) lines[at(r2, c2)] = true; }
    }
    for (c2 = 0; c2 < BB_N; c2++) {
      var fullC = true;
      for (r2 = 0; r2 < BB_N; r2++) { if (!sim[at(r2, c2)]) { fullC = false; break; } }
      if (fullC) { for (r2 = 0; r2 < BB_N; r2++) lines[at(r2, c2)] = true; }
    }
    ghost = { map: map, ok: true, color: p.color, lines: lines };
    paintBoard();
  }

  function removeDragListeners() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragUp);
    window.removeEventListener('pointercancel', onDragCancel);
    window.removeEventListener('blur', onDragCancel);
  }

  function cleanupDrag() {
    removeDragListeners();
    if (dragState && dragState.node && dragState.node.parentNode) {
      dragState.node.parentNode.removeChild(dragState.node);
    }
    dragState = null;
    ghost = null;
    if (activeDragCancel === cleanupDrag) activeDragCancel = null;
  }

  function onDragMove(ev) {
    if (!dragState) return;
    if (ev.cancelable) ev.preventDefault();
    var dx = ev.clientX - dragState.startX;
    var dy = ev.clientY - dragState.startY;
    if (!dragState.moved && (dx * dx + dy * dy) > 36) {
      dragState.moved = true;
      statusEl.textContent = '손가락을 떼면 그 자리에 놓입니다. 빛나는 줄을 노려 보세요!';
    }
    positionDragNode(ev.clientX, ev.clientY, dragState.moved);
    updateDragTarget();
  }

  function onDragUp() {
    if (!dragState) return;
    var d = dragState;
    var wasMoved = d.moved;
    var ok = d.ok;
    var row = d.row;
    var col = d.col;
    var idx = d.idx;
    cleanupDrag();
    paintBoard();
    if (!wasMoved) {
      /* 거의 움직이지 않은 탭 — 조각 선택(탭 → 보드 칸 방법의 보조 조작) */
      selectPiece(idx);
      return;
    }
    suppressTrayClick = Date.now() + 450;
    if (ok) {
      var p = pieces[idx];
      if (p && !p.used && fits(p, row, col)) placePiece(p, row, col);
      return;
    }
    sfx.nope();
    paintTray();
    statusEl.textContent = '보드 안의 놓을 수 있는 칸에 놓아 주세요.';
  }

  function onDragCancel() {
    if (!dragState) return;
    cleanupDrag();
    paintBoard();
    paintTray();
    suppressTrayClick = Date.now() + 450;
    statusEl.textContent = '드래그를 취소했어요. 조각을 다시 끌어다 놓아 보세요.';
  }

  function onTrayPointerDown(ev) {
    if (finished || locked || dragState) return;
    if (typeof ev.button === 'number' && ev.button > 0) return;
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-piece]') : null;
    if (!el) return;
    var idx = Number(el.getAttribute('data-piece'));
    var p = pieces[idx];
    if (!p || p.used) return;
    if (ev.cancelable) ev.preventDefault();
    var m = boardMetrics();
    var node = buildDragNode(p, m);
    document.body.appendChild(node);
    dragState = {
      idx: idx,
      node: node,
      startX: ev.clientX,
      startY: ev.clientY,
      moved: false,
      row: -1,
      col: -1,
      ok: false,
      left: 0,
      top: 0
    };
    activeDragCancel = cleanupDrag;
    selectPiece(idx);
    positionDragNode(ev.clientX, ev.clientY, false);
    updateDragTarget();
    window.addEventListener('pointermove', onDragMove, { passive: false });
    window.addEventListener('pointerup', onDragUp);
    window.addEventListener('pointercancel', onDragCancel);
    window.addEventListener('blur', onDragCancel);
    statusEl.textContent = '조각을 보드 위로 끌어다 놓아 보세요.';
  }

  trayEl.addEventListener('click', onTray);
  trayEl.addEventListener('pointerdown', onTrayPointerDown);
  boardEl.addEventListener('click', onBoard);
  boardEl.addEventListener('pointermove', function (ev) {
    if (dragState) return;
    if (ev.pointerType && ev.pointerType !== 'mouse') return;
    var el = ev.target && ev.target.closest ? ev.target.closest('.bg-bb-cell') : null;
    if (el) showGhost(Number(el.getAttribute('data-idx')));
  });
  boardEl.addEventListener('pointerleave', clearGhost);

  /* --------------------------------------------------------- 시작 */
  pieces = newTray();
  selected = 0;
  paintBoard();
  paintTray();
  paintHud();
  later(function () {
    if (finished) return;
    statusEl.textContent = '아래 조각을 보드로 끌어다 놓아 보세요. 가로·세로 8칸을 채우면 줄이 지워집니다!';
    sfx.start();
  }, 500);
}

/* ------------------------------------------------------------- 결과 저장 */
function finishGame(playEl, key, meta, result, logs, refreshBoard, showHub, restart) {
  cancelActiveDrag();
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
      '<p class="page-desc">기억 · 집중 · 주의전환 · 조준 · 멀티태스킹 · 공간지각 ' + BRAIN_GAMES.length + '종을 1~2분씩 가볍게. 매일 한 판이면 기록이 이어집니다.</p>' +
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
    cancelActiveDrag();
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
    else if (key === 'block_blast') runBlockBlast(playEl, done);
  }

  el.addEventListener('pointerdown', function () { unlockSfx(); }, { once: true });
  renderHub();
}
