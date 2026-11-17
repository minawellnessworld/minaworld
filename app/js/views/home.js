/* S01. 홈 — 개인 회원 메인 대시보드(PART 2-2) + 오늘의 뇌 컨디션 체크인 */
import { BRAND, MINA_MEANING, GOAL_OPTIONS } from '../config.js?v=2.0.7';
import {
  state, listWellness, addWellness, listBookings, listPosts, listResults, listPackages,
  listSessions, getPrograms, isStaff, isOrgWorker,
  friendlyError, dateKey, todayStr
} from '../store.js?v=2.0.7';
import {
  listOrganizationsFiltered, listBranchesForOrg, listMyMemberships, setShareBrainResults
} from '../store-org.js?v=2.0.7';
import { recordConsents, logAudit } from '../store-security.js?v=2.0.7';
import {
  icon, esc, fmtKRW, fmtDate, todayLabel, toast, emptyState, setBusy, sectionHead, go, track, noticeBox
} from '../ui.js?v=2.0.7';
import { requireLoginSheet } from '../booking.js?v=2.0.7';
import { latestSpoonArticle, spoonDateLabel } from '../spoon.js?v=2.0.7';

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

function dashTile(ico, label, value, sub, href) {
  var inner = '<span class="dash-ico">' + icon(ico, 18) + '</span>' +
    '<span class="dash-label">' + esc(label) + '</span>' +
    '<strong class="dash-value">' + esc(value) + '</strong>' +
    (sub ? '<span class="dash-sub">' + esc(sub) + '</span>' : '');
  if (href) return '<a class="dash-tile" href="' + href + '">' + inner + '</a>';
  return '<div class="dash-tile">' + inner + '</div>';
}

export async function render(ctx) {
  var today = new Date();
  var weekAgo = new Date(today.getTime() - 86400000 * 6);
  var logs = [];
  var bookings = [];
  var notices = [];
  var events = [];
  var results = [];
  var packages = [];
  var sessions = [];
  var programs = [];
  var memberships = [];
  var branches = [];

  try {
    var jobs = [listPosts({ category: 'notice' }), listPosts({ category: 'event' })];
    if (state.session) {
      var uid = state.session.user.id;
      jobs.push(listWellness(uid, 20), listBookings(uid), listResults(uid), listPackages(uid), listSessions(uid), listMyMemberships());
    }
    var loaded = await Promise.all(jobs);
    notices = loaded[0] || [];
    events = loaded[1] || [];
    if (state.session) {
      logs = loaded[2] || [];
      bookings = loaded[3] || [];
      results = loaded[4] || [];
      packages = loaded[5] || [];
      sessions = loaded[6] || [];
      memberships = loaded[7] || [];
    }
    programs = await getPrograms();
    try {
      var orgs = await listOrganizationsFiltered('active');
      await Promise.all((orgs || []).map(async function (o) {
        var rows = await listBranchesForOrg(o.id);
        (rows || []).forEach(function (b) { branches.push(b); });
      }));
    } catch (err) { branches = []; }
  } catch (err) {
    console.warn('[MINA] 홈 데이터 조회 실패', err);
  }

  var todayStrValue = todayStr();
  var todayLog = null;
  for (var i = 0; i < logs.length; i++) {
    if (logs[i].logged_at === todayStrValue) todayLog = logs[i];
  }

  var upcomingList = bookings.filter(function (b) {
    return (b.status === 'pending' || b.status === 'confirmed') && String(b.preferred_date) >= todayStrValue;
  }).sort(function (a, b) { return String(a.preferred_date).localeCompare(String(b.preferred_date)); });
  var upcoming = upcomingList[0];

  var latestResult = results.slice().sort(function (a, b) {
    return String(b.measured_at).localeCompare(String(a.measured_at));
  })[0];

  var activePackages = packages.filter(function (p) { return p.status === 'active'; });
  var remaining = activePackages.reduce(function (sum, p) {
    return sum + Math.max(0, Number(p.total_sessions || 0) - Number(p.used_sessions || 0));
  }, 0);
  var totalUsed = packages.reduce(function (sum, p) { return sum + Number(p.used_sessions || 0); }, 0);
  var latestWellness = logs[0] || null;

  /* 기관 결과 열람 요청 배너 */
  var shareRequests = memberships.filter(function (m) {
    return m.status === 'approved' && m.result_access_requested && !m.share_brain_results;
  });

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

  /* 추천 프로그램: 목표에 맞는 카테고리 우선 */
  var goals = state.profile && Array.isArray(state.profile.goals) ? state.profile.goals : [];
  var recommend = (programs || []).filter(function (p) { return p.category !== 'academy'; }).slice();
  if (goals.length) {
    recommend.sort(function (a, b) {
      var aMatch = goals.some(function (g) { return String(a.title + a.sub_category + a.description).indexOf(String(g).replace(' 관리', '')) >= 0; }) ? 0 : 1;
      var bMatch = goals.some(function (g) { return String(b.title + b.sub_category + b.description).indexOf(String(g).replace(' 관리', '')) >= 0; }) ? 0 : 1;
      return aMatch - bMatch;
    });
  }
  recommend = recommend.slice(0, 3);

  var topNotice = events[0] || notices[0] || null;

  var spoonLatest = null;
  try {
    spoonLatest = await latestSpoonArticle();
  } catch (err) {
    spoonLatest = null;
  }

  var spoonSection = spoonLatest
    ? '<section class="section">' +
        sectionHead('오늘의 하루 한 스푼, 뇌과학',
          '<a class="spoon-all-link" href="#/community?c=neuroscience">전체 보기' + icon('chevronRight', 13) + '</a>') +
        '<a class="spoon-hero" href="#/community/spoon/' + esc(spoonLatest.id) + '">' +
          '<div class="spoon-hero-top">' +
            '<span class="spoon-hero-tag">DAILY BRAIN INSIGHTS</span>' +
            '<span class="spoon-hero-date">' + esc(spoonDateLabel(spoonLatest.date)) + '</span>' +
          '</div>' +
          '<strong class="spoon-hero-title">' + esc(spoonLatest.title) + '</strong>' +
          (spoonLatest.summary ? '<p class="spoon-hero-summary">' + esc(spoonLatest.summary) + '</p>' : '') +
          '<div class="spoon-hero-foot">' +
            '<span class="pill pill-gold">' + esc(spoonLatest.categoryLabel) + '</span>' +
            '<span class="spoon-hero-cta">30초 요약으로 읽기' + icon('chevronRight', 13) + '</span>' +
          '</div>' +
        '</a>' +
      '</section>'
    : '';
  var dash = '';
  if (state.session) {
    var name = (state.profile && (state.profile.full_name || state.profile.email)) || '회원';
    dash =
      '<section class="dash">' +
        '<div class="dash-hello">' +
          '<span class="dash-eyebrow">' + todayLabel() + '</span>' +
          '<h1>안녕하세요, <strong>' + esc(name) + '</strong>님</h1>' +
          '<p>' + esc(BRAND.greetingTagline) + '</p>' +
        '</div>' +
        '<div class="dash-grid">' +
          dashTile('file', '최근 검사', latestResult ? fmtDate(latestResult.measured_at) : '기록 없음',
            latestResult ? (latestResult.check_type === 'full' ? '종합검사' : '간편검사') : '검사 후 표시', latestResult ? '#/my-brain' : '#/brain-check') +
          dashTile('calendar', '다음 예약', upcoming ? fmtDate(upcoming.preferred_date) : '예정 없음',
            upcoming ? (upcoming.preferred_time + ' · ' + upcoming.program_title) : '예약을 잡아보세요', upcoming ? '#/brain-check' : '#/brain-check') +
          dashTile('grid', '이용 프로그램', String(activePackages.length) + '개', packages.length ? '누적 ' + packages.length + '건' : '이용 전', '#/my-brain') +
          dashTile('sparkle', '뉴로피드백 잔여', String(remaining) + '회', totalUsed ? '누적 ' + totalUsed + '회 훈련' : '이용권 없음', '#/neuro') +
          dashTile('heart', '최근 웰니스', latestWellness ? fmtDate(latestWellness.logged_at) : '기록 없음',
            latestWellness ? ('집중 ' + (latestWellness.focus_level || '-') + ' · 스트레스 ' + (latestWellness.stress_level || '-')) : '오늘 체크인해 보세요', '#/my-brain') +
          dashTile('chat', '공지 · 이벤트', String(notices.length + events.length) + '건', topNotice ? topNotice.title : '새 소식 없음', '#/community') +
        '</div>' +
        (shareRequests.length
          ? '<div class="share-banner" id="share-banner">' +
              '<div class="share-banner-body">' +
                '<span class="share-tag">' + icon('shield', 14) + ' 제휴 기관 요청</span>' +
                '<strong>' + esc((shareRequests[0].organizations && shareRequests[0].organizations.name) || '소속 기관') + '</strong>' +
                '<p>기관에서 내 검사 결과 열람 동의를 요청했습니다. 동의하면 기관 담당자가 검사 결과를 볼 수 있습니다.</p>' +
              '</div>' +
              '<div class="share-banner-actions">' +
                '<button type="button" class="btn btn-ghost btn-sm" data-share="no">거절</button>' +
                '<button type="button" class="btn btn-primary btn-sm" data-share="yes">동의</button>' +
              '</div>' +
            '</div>'
          : '') +
      '</section>';
  }

  var html =
    dash +

    '<section class="hero">' +
      '<div class="hero-top">' +
        '<span class="hero-eyebrow">MINA WELLNESS WORLD</span>' +
        '<span class="hero-date">' + todayLabel() + '</span>' +
      '</div>' +
      '<p class="hero-welcome">' + (state.session ? 'BRAIN WELLNESS DAILY' : BRAND.welcome) + '</p>' +
      '<h1 class="hero-title">' + BRAND.question + '</h1>' +
      checkinCard +
    '</section>' +

    spoonSection +

    (state.session && upcoming
      ? '<section class="section">' +
          '<a class="next-card" href="#/brain-check">' +
            '<span class="next-ico">' + icon('calendar', 20) + '</span>' +
            '<span class="next-body"><span class="muted small">다가오는 일정</span>' +
              '<strong>' + esc(upcoming.program_title) + '</strong>' +
              '<span class="muted small">' + fmtDate(upcoming.preferred_date) + ' ' + esc(upcoming.preferred_time) +
                (upcoming.branch_name ? ' · ' + esc(upcoming.branch_name) : '') + '</span></span>' +
            '<span class="menu-arrow">' + icon('chevronRight', 18) + '</span>' +
          '</a>' +
        '</section>'
      : '') +

    (state.session && recommend.length
      ? '<section class="section">' +
          sectionHead('추천 프로그램', '<a class="muted small" href="#/programs">전체 보기</a>') +
          '<div class="reco-list">' +
            recommend.map(function (p) {
              return '<a class="reco-card" href="#/programs">' +
                '<span class="reco-badge">' + esc(p.sub_category || p.category) + '</span>' +
                '<strong>' + esc(p.title) + '</strong>' +
                '<span class="reco-price">' + esc(p.price_krw ? fmtKRW(p.price_krw) : (p.price_label || '상담 확정')) + '</span>' +
                '<span class="reco-desc">' + esc(String(p.subtitle || p.description || '').slice(0, 46)) + '</span>' +
              '</a>';
            }).join('') +
          '</div>' +
        '</section>'
      : '') +

    (topNotice
      ? '<section class="section">' +
          '<a class="notice-card" href="#/community">' +
            '<span class="notice-tag">' + (events[0] ? '이벤트' : '공지') + '</span>' +
            '<span class="notice-body">' + esc(topNotice.title) + '</span>' +
            icon('chevronRight', 18) +
          '</a>' +
        '</section>'
      : '') +

    '<section class="section slogan-card">' +
      '<p class="slogan-quote">“' + BRAND.slogan + '”</p>' +
      '<div class="mina-grid">' + miCard + '</div>' +
    '</section>' +

    '<section class="section">' +
      sectionHead('어디서 시작할까요?', '<span class="muted small">6가지 브레인 케어</span>') +
      '<div class="menu-grid">' + menuCards + '</div>' +
    '</section>' +

    (state.session && memberships.filter(function (m) { return m.status === 'approved'; }).length
      ? '<section class="section">' +
          sectionHead('나의 소속 기관', '<span class="muted small">' + memberships.filter(function (m) { return m.status === 'approved'; }).length + '곳</span>') +
          '<div class="org-chip-list">' + memberships.filter(function (m) { return m.status === 'approved'; }).map(function (m) {
            var orgName = (m.organizations && m.organizations.name) || '기관';
            return '<div class="org-chip"><strong>' + esc(orgName) + '</strong>' +
              (m.share_brain_results
                ? '<span class="badge badge-green">결과 공유 중</span>'
                : '<span class="badge badge-neutral">결과 비공유</span>') + '</div>';
          }).join('') + '</div>' +
          '<a class="btn btn-ghost btn-sm btn-block" href="#/account">공유 설정 변경</a>' +
        '</section>'
      : '') +

    (isStaff()
      ? '<section class="section">' +
          '<a class="admin-banner" href="#/admin">' +
            '<span class="admin-badge">' + icon('shield', 18) + ' ADMIN</span>' +
            '<span><strong>관리자 콘솔 바로가기</strong><span>회원 · 예약 · 결과 등록 · 매출 관리</span></span>' +
            icon('chevronRight', 18) +
          '</a>' +
        '</section>'
      : '') +

    (isOrgWorker()
      ? '<section class="section">' +
          '<a class="admin-banner" href="#/partner">' +
            '<span class="admin-badge">' + icon('shield', 18) + ' PARTNER</span>' +
            '<span><strong>기관 대시보드 바로가기</strong><span>기관 회원 · 예약 · 정산</span></span>' +
            icon('chevronRight', 18) +
          '</a>' +
        '</section>'
      : '') +

    '<footer class="app-footer">' +
      '<p class="footer-brand">MINA Wellness World</p>' +
      '<p class="footer-note">' + esc(BRAND.nonMedical) + '</p>' +
      '<p class="footer-links"><a href="../index.html">미나월드 홈페이지</a><span>·</span><a href="#/account">이용 안내</a><span>·</span><a href="#/admin-login">기관·관리자</a></p>' +
    '</footer>';

  return {
    title: state.session ? '홈' : 'MINA WORLD',
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

      /* 기관 결과 공유 요청 — 동의/거절 */
      var shareButtons = el.querySelectorAll('[data-share]');
      for (var s = 0; s < shareButtons.length; s++) {
        shareButtons[s].addEventListener('click', async function () {
          var membership = shareRequests[0];
          if (!membership) return;
          var agree = this.getAttribute('data-share') === 'yes';
          setBusy(this, true, '처리 중');
          try {
            await setShareBrainResults(membership.id, agree);
            await recordConsents([{ type: 'partner_share', agreed: agree }]);
            await logAudit({
              action: 'result_access_requested',
              target_table: 'org_memberships',
              target_id: membership.id,
              detail: { share_brain_results: agree, by: 'member' }
            });
            toast(agree ? '검사 결과 공유에 동의했습니다.' : '요청을 거절했습니다.', 'success');
            await ctx.rerender();
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(this, false);
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
