/* S01. 홈 — 오늘의 뇌 컨디션 체크인 · 6대 메뉴 */
import { BRAND, MINA_MEANING } from '../config.js';
import { state, listWellness, addWellness, listBookings, listPosts, isStaff, friendlyError, dateKey, todayStr } from '../store.js';
import { icon, esc, fmtDate, todayLabel, toast, emptyState, setBusy, sectionHead, go, track } from '../ui.js';
import { requireLoginSheet } from '../booking.js';

var MENU = [
  { key: 'brain_check', title: 'BRAIN CHECK', sub: '뇌파측정 · 뇌기능검사 예약', ico: 'pulse', href: '#/brain-check', tone: 'navy' },
  { key: 'neuro', title: 'NEURO TRAINING', sub: '뉴로피드백 훈련 · 이력 관리', ico: 'sparkle', href: '#/neuro', tone: 'yellow' },
  { key: 'mind_care', title: 'MIND CARE', sub: '스트레스 · 감정 · 번아웃 케어', ico: 'heart', href: '#/programs?group=MIND%20CARE', tone: 'ivory' },
  { key: 'brain_wellness', title: 'BRAIN WELLNESS', sub: '수면 · 명상 · 집중 · 기억력', ico: 'brain', href: '#/programs?group=BRAIN%20WELLNESS', tone: 'ivory' },
  { key: 'academy', title: 'MINA ACADEMY', sub: '뇌교육상담사 전문가 과정', ico: 'file', href: '#/academy', tone: 'navy' },
  { key: 'community', title: 'MINA COMMUNITY', sub: '공지 · 뇌과학 · 후기 · Q&A', ico: 'chat', href: '#/community', tone: 'yellow' }
];

var CHECK_ROWS = [
  { key: 'focus_level', label: '집중', low: '흐릿', high: '선명' },
  { key: 'stress_level', label: '스트레스', low: '편안', high: '높음' },
  { key: 'sleep_level', label: '수면', low: '부족', high: '충분' }
];

function scoreRow(row, value) {
  var dots = '';
  for (var i = 1; i <= 5; i++) {
    dots += '<button type="button" class="score-dot' + (value === i ? ' is-on' : '') +
      '" data-check="' + row.key + '" data-value="' + i + '" aria-label="' + row.label + ' ' + i + '점">' + i + '</button>';
  }
  return '<div class="checkin-row">' +
    '<div class="checkin-label"><strong>' + row.label + '</strong></div>' +
    '<div class="checkin-scale"><span class="scale-edge">' + row.low + '</span>' +
      '<div class="score-dots">' + dots + '</div>' +
      '<span class="scale-edge">' + row.high + '</span></div>' +
  '</div>';
}

export async function render(ctx) {
  var today = new Date();
  var weekAgo = new Date(today.getTime() - 86400000 * 6);
  var logs = [];
  var bookings = [];
  var notices = [];

  try {
    var jobs = [listPosts({ category: 'notice' })];
    if (state.session) jobs.push(listWellness(undefined, 20), listBookings());
    var results = await Promise.all(jobs);
    notices = results[0] || [];
    if (state.session) {
      logs = results[1] || [];
      bookings = results[2] || [];
    }
  } catch (err) {
    console.warn('[MINA] 홈 데이터 조회 실패', err);
  }

  var todayStrValue = todayStr();
  var todayLog = null;
  for (var i = 0; i < logs.length; i++) {
    if (logs[i].logged_at === todayStrValue) todayLog = logs[i];
  }

  var upcoming = bookings.filter(function (b) {
    return (b.status === 'pending' || b.status === 'confirmed') && String(b.preferred_date) >= todayStrValue;
  }).sort(function (a, b) { return String(a.preferred_date).localeCompare(String(b.preferred_date)); })[0];

  var recordDays = {};
  for (var j = 0; j < logs.length; j++) recordDays[logs[j].logged_at] = true;
  var miniWeek = '';
  for (var d = 0; d < 7; d++) {
    var day = new Date(weekAgo.getTime() + 86400000 * d);
    var key = dateKey(day);
    var has = Boolean(recordDays[key]);
    miniWeek += '<span class="mini-day' + (has ? ' is-on' : '') + '" title="' + fmtDate(key) + '">' +
      '<span class="mini-dot"></span><span class="mini-num">' + day.getDate() + '</span></span>';
  }

  var menuCards = MENU.map(function (item) {
    return '<a class="menu-card tone-' + item.tone + '" href="' + item.href + '" data-menu="' + item.key + '">' +
      '<span class="menu-ico">' + icon(item.ico, 22) + '</span>' +
      '<span class="menu-text"><strong>' + item.title + '</strong><span>' + esc(item.sub) + '</span></span>' +
      '<span class="menu-arrow">' + icon('chevronRight', 18) + '</span>' +
    '</a>';
  }).join('');

  var checkinCard;
  if (!state.session) {
    checkinCard =
      '<div class="checkin-card">' +
        '<div class="checkin-head"><strong>오늘의 뇌 컨디션 체크인</strong><span class="muted small">로그인 필요</span></div>' +
        '<p class="checkin-guest">집중 · 스트레스 · 수면을 1~5점으로 기록하면 나의 뇌 컨디션 흐름이 쌓입니다.</p>' +
        '<button type="button" class="btn btn-accent btn-block" id="home-login">로그인하고 기록하기</button>' +
      '</div>';
  } else {
    checkinCard =
      '<div class="checkin-card" id="checkin-card">' +
        '<div class="checkin-head"><strong>오늘의 뇌 컨디션 체크인</strong>' +
          (todayLog ? '<span class="pill pill-ok">오늘 기록 완료</span>' : '<span class="muted small">1~5점</span>') +
        '</div>' +
        CHECK_ROWS.map(function (row) {
          return scoreRow(row, todayLog ? todayLog[row.key] : 0);
        }).join('') +
        '<textarea id="checkin-memo" rows="2" class="checkin-memo" maxlength="200" placeholder="오늘의 몸과 마음 상태 메모 (선택)">' +
          esc(todayLog ? todayLog.memo || '' : '') + '</textarea>' +
        '<div class="checkin-foot">' +
          '<div class="mini-week" aria-label="최근 7일 기록">' + miniWeek + '</div>' +
          '<button type="button" class="btn btn-primary btn-sm" id="checkin-save">' + (todayLog ? '수정 저장' : '기록 저장') + '</button>' +
        '</div>' +
      '</div>';
  }

  var miCard = MINA_MEANING.map(function (m) {
    return '<div class="mina-item"><span class="mina-letter">' + esc(m.letter) + '</span>' +
      '<div><strong>' + esc(m.word) + '</strong><span>' + esc(m.text) + '</span></div></div>';
  }).join('');

  var html =
    '<section class="hero">' +
      '<div class="hero-top">' +
        '<span class="hero-eyebrow">MINA WELLNESS WORLD</span>' +
        '<span class="hero-date">' + todayLabel() + '</span>' +
      '</div>' +
      '<p class="hero-welcome">' + BRAND.welcome + '</p>' +
      '<h1 class="hero-title">' + BRAND.question + '</h1>' +
      checkinCard +
    '</section>' +

    '<section class="section slogan-card">' +
      '<p class="slogan-quote">“' + BRAND.slogan + '”</p>' +
      '<div class="mina-grid">' + miCard + '</div>' +
    '</section>' +

    (upcoming
      ? '<section class="section">' +
          '<a class="next-card" href="#/brain-check">' +
            '<span class="next-ico">' + icon('calendar', 20) + '</span>' +
            '<span class="next-body"><span class="muted small">다가오는 일정</span>' +
              '<strong>' + esc(upcoming.program_title) + '</strong>' +
              '<span class="muted small">' + fmtDate(upcoming.preferred_date) + ' ' + esc(upcoming.preferred_time) + '</span></span>' +
            '<span class="menu-arrow">' + icon('chevronRight', 18) + '</span>' +
          '</a>' +
        '</section>'
      : '') +

    '<section class="section">' +
      sectionHead('어디서 시작할까요?', '<span class="muted small">6가지 브레인 케어</span>') +
      '<div class="menu-grid">' + menuCards + '</div>' +
    '</section>' +

    '<section class="section">' +
      '<a class="notice-card" href="#/community">' +
        '<span class="notice-tag">공지</span>' +
        '<span class="notice-body">' + esc(notices.length ? notices[0].title : 'MINA WORLD 소식을 커뮤니티에서 확인하세요.') + '</span>' +
        icon('chevronRight', 18) +
      '</a>' +
    '</section>' +

    (isStaff()
      ? '<section class="section">' +
          '<a class="admin-banner" href="#/admin">' +
            '<span class="admin-badge">' + icon('shield', 18) + ' ADMIN</span>' +
            '<span><strong>관리자 콘솔 바로가기</strong><span>회원 · 예약 · 결과 등록 · 매출 관리</span></span>' +
            icon('chevronRight', 18) +
          '</a>' +
        '</section>'
      : '') +

    '<footer class="app-footer">' +
      '<p class="footer-brand">MINA Wellness World</p>' +
      '<p class="footer-note">' + esc(BRAND.nonMedical) + '</p>' +
      '<p class="footer-links"><a href="../index.html">미나월드 홈페이지</a><span>·</span><a href="#/account">이용 안내</a></p>' +
    '</footer>';

  return {
    title: '홈',
    html: html,
    mount: function (el) {
      var loginBtn = el.querySelector('#home-login');
      if (loginBtn) loginBtn.addEventListener('click', function () { go('/account'); });

      var selected = {
        focus_level: todayLog ? todayLog.focus_level : 0,
        stress_level: todayLog ? todayLog.stress_level : 0,
        sleep_level: todayLog ? todayLog.sleep_level : 0
      };

      var dots = el.querySelectorAll('.score-dot');
      for (var i = 0; i < dots.length; i++) {
        dots[i].addEventListener('click', function () {
          var key = this.getAttribute('data-check');
          var value = Number(this.getAttribute('data-value'));
          selected[key] = value;
          var group = this.parentNode.querySelectorAll('.score-dot');
          for (var k = 0; k < group.length; k++) {
            group[k].classList.toggle('is-on', Number(group[k].getAttribute('data-value')) <= value);
            group[k].classList.toggle('is-active', Number(group[k].getAttribute('data-value')) === value);
          }
        });
      }

      var saveBtn = el.querySelector('#checkin-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', async function () {
          if (!selected.focus_level || !selected.stress_level || !selected.sleep_level) {
            toast('집중 · 스트레스 · 수면을 모두 선택해 주세요.');
            return;
          }
          var memoEl = el.querySelector('#checkin-memo');
          setBusy(saveBtn, true, '저장 중');
          try {
            await addWellness({
              logged_at: todayStrValue,
              condition_label: '일일 체크인',
              focus_level: selected.focus_level,
              stress_level: selected.stress_level,
              sleep_level: selected.sleep_level,
              memo: memoEl ? memoEl.value.trim() : ''
            });
            track('wellness_checkin', {
              focus: selected.focus_level,
              stress: selected.stress_level,
              sleep: selected.sleep_level
            });
            toast('오늘의 뇌 컨디션이 기록되었습니다.', 'success');
            if (typeof ctx.rerender === 'function') await ctx.rerender();
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(saveBtn, false);
          }
        });
      }

      var menuLinks = el.querySelectorAll('[data-menu]');
      for (var m = 0; m < menuLinks.length; m++) {
        menuLinks[m].addEventListener('click', function () {
          track('home_menu_click', { menu: this.getAttribute('data-menu') });
        });
      }
    }
  };
}
