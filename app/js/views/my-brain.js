/* S04. MY BRAIN — 나의 뇌 관리 대시보드 (PART 2-3)
   실제 측정 데이터만 표시합니다. 값이 없으면 빈 상태이며 임의 수치를 만들지 않습니다. */
import { BRAND, GOAL_OPTIONS, GRADES, CHECK_TYPES, CHECK_ITEM_LABELS } from '../config.js?v=2.0.35';
import {
  state, updateProfile, listResults, listPackages, listSessions, listBookings, listWellness,
  getSignedResultUrl, friendlyError, todayStr, deleteWellness
} from '../store.js?v=2.0.35';
import { listMyMemberships } from '../store-org.js?v=2.0.35';
import {
  icon, esc, fmtKRW, fmtDate, toast, emptyState, noticeBox, sectionHead,
  loadingBlock, badge, bookingStatusTone, setBusy, confirmDialog, go
} from '../ui.js?v=2.0.35';
import { bookingItemHtml, bindBookingActions } from '../booking.js?v=2.0.35';

function summaryTile(ico, label, value, sub) {
  return '<div class="summary-tile">' +
    '<span class="tile-ico">' + icon(ico, 18) + '</span>' +
    '<span class="tile-label">' + esc(label) + '</span>' +
    '<strong class="tile-value">' + esc(value) + '</strong>' +
    (sub ? '<span class="tile-sub">' + esc(sub) + '</span>' : '') +
  '</div>';
}

function metricText(value) {
  if (value === null || value === undefined || value === '') return '-';
  var num = Number(value);
  return isFinite(num) ? num.toFixed(1) : String(value);
}

/* 등록 시각(한국 시간 HH:MM) — 같은 날 중복 기록을 구분하기 위해 표시 */
function kstClock(iso) {
  if (!iso) return '';
  var date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul'
    }).format(date);
  } catch (err) {
    var shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return ('0' + shifted.getUTCHours()).slice(-2) + ':' + ('0' + shifted.getUTCMinutes()).slice(-2);
  }
}

function itemDetailsHtml(items, limit) {
  if (!items || typeof items !== 'object') return '';
  var keys = Object.keys(items);
  if (!keys.length) return '';
  var shown = typeof limit === 'number' ? keys.slice(0, limit) : keys;
  var rest = keys.length - shown.length;
  return '<div class="item-detail-list">' + shown.map(function (key) {
    return '<div class="item-detail-row"><span>' + esc(key) + '</span><strong>' + esc(items[key]) + '</strong></div>';
  }).join('') + '</div>' +
    (rest > 0
      ? '<p class="item-more">외 ' + rest + '항목 · <a href="#/my-brain?tab=results">전체 기록에서 보기</a></p>'
      : '');
}

export async function render(ctx) {
  if (!state.session) {
    return {
      title: 'MY BRAIN',
      html:
        '<header class="page-head">' +
          '<span class="page-eyebrow">' + icon('brain', 16) + ' MY BRAIN</span>' +
          '<h1 class="page-title">나의 뇌 관리<br>대시보드</h1>' +
          '<p class="page-desc">목표 설정, 검사 결과 변화, 뉴로피드백 횟수, 일일 웰니스 기록을 한곳에서 확인합니다.</p>' +
        '</header>' +
        '<section class="section">' +
          emptyState({
            icon: 'lock',
            title: '로그인하면 나의 뇌 데이터가 열립니다',
            desc: '검사 결과·훈련 기록·체크인 기록은 회원 계정에만 연결됩니다.',
            action: '<a class="btn btn-primary btn-sm" href="#/account">로그인 · 회원가입</a>'
          }) +
        '</section>' +
        '<section class="section">' +
          sectionHead('MY BRAIN에서 확인하는 것', '') +
          '<div class="info-rows">' +
            '<div class="info-row">' + icon('target', 17) + '<span><strong>개인 목표</strong> 집중·스트레스·수면·감정·기억력 관리 목표 저장</span></div>' +
            '<div class="info-row">' + icon('chart', 17) + '<span><strong>검사 변화</strong> 실제 검사 결과 2건 이상일 때 변화 그래프</span></div>' +
            '<div class="info-row">' + icon('sparkle', 17) + '<span><strong>뉴로피드백</strong> 누적 훈련 횟수와 잔여 이용권</span></div>' +
            '<div class="info-row">' + icon('calendar', 17) + '<span><strong>일정·기록</strong> 다음 검사/훈련 일정과 일일 체크인</span></div>' +
          '</div>' +
        '</section>',
      mount: function () { /* no-op */ }
    };
  }

  var results = [];
  var packages = [];
  var sessions = [];
  var bookings = [];
  var wellness = [];
  var memberships = [];
  var loadError = '';

  try {
    var uid = state.session.user.id;
    var loaded = await Promise.all([
      listResults(uid), listPackages(uid), listSessions(uid), listBookings(uid), listWellness(uid, 30), listMyMemberships()
    ]);
    results = loaded[0];
    packages = loaded[1];
    sessions = loaded[2];
    bookings = loaded[3];
    wellness = loaded[4];
    memberships = loaded[5];
  } catch (err) {
    loadError = friendlyError(err);
  }

  var profile = state.profile || {};
  var goals = Array.isArray(profile.goals) ? profile.goals : [];
  var todayStrValue = todayStr();

  /* 측정일 오름차순 → 같은 날짜면 등록 시각(created_at) 오름차순으로 안정 정렬.
     같은 날 두 번 등록해도 이전/현재가 뒤바뀌지 않습니다. */
  var orderedResults = results.slice().sort(function (a, b) {
    var am = String(a.measured_at || '');
    var bm = String(b.measured_at || '');
    if (am !== bm) return am.localeCompare(bm);
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  var latestResult = orderedResults[orderedResults.length - 1] || null;
  var prevResult = orderedResults.length >= 2 ? orderedResults[orderedResults.length - 2] : null;

  var upcoming = bookings.filter(function (b) {
    return (b.status === 'pending' || b.status === 'confirmed') && String(b.preferred_date) >= todayStrValue;
  }).sort(function (a, b) { return String(a.preferred_date).localeCompare(String(b.preferred_date)); })[0];

  var totalUsed = packages.reduce(function (sum, p) { return sum + Number(p.used_sessions || 0); }, 0);
  var remaining = packages.reduce(function (sum, p) {
    return sum + Math.max(0, Number(p.total_sessions || 0) - Number(p.used_sessions || 0));
  }, 0);
  var activePackage = packages.filter(function (p) { return p.status === 'active'; })[0] || null;

  var goalChips = GOAL_OPTIONS.map(function (goal) {
    var on = goals.indexOf(goal) >= 0 ? ' is-on' : '';
    return '<button type="button" class="chip' + on + '" data-goal="' + esc(goal) + '">' + esc(goal) + '</button>';
  }).join('');

  var summary =
    '<div class="summary-grid">' +
      summaryTile('calendar', '최근 뇌파측정', latestResult ? fmtDate(latestResult.measured_at) : '측정 전', latestResult ? (latestResult.check_type === 'full' ? '종합검사' : '간편검사') : '기록 없음') +
      summaryTile('sparkle', '뉴로피드백', String(totalUsed) + '회', remaining > 0 ? ('잔여 ' + remaining + '회') : '보유 이용권 없음') +
      summaryTile('chart', '검사 기록', String(results.length) + '건', results.length >= 2 ? '이전 결과와 비교 제공' : '2건 이상 시 비교') +
      summaryTile('clock', '다음 일정', upcoming ? fmtDate(upcoming.preferred_date) : '예정 없음', upcoming ? (upcoming.preferred_time + ' · ' + upcoming.program_title) : '예약 시 표시') +
    '</div>';

  var resultFileCard = '';
  if (latestResult) {
    resultFileCard = '<div class="result-preview">' +
      '<div class="list-top"><strong>' + esc(CHECK_TYPES[latestResult.check_type] || '검사 결과지') + '</strong>' +
        badge(fmtDate(latestResult.measured_at), 'neutral') + '</div>' +
      (latestResult.emotion_type
        ? '<p class="emotion-line">' + icon('sparkle', 14) + '<span>감정 성향 · <strong>' + esc(latestResult.emotion_type) + '</strong></span></p>'
        : '') +
      itemDetailsHtml(latestResult.item_details, 4) +
      (latestResult.summary_note ? '<p class="list-note">' + esc(latestResult.summary_note) + '</p>' : '') +
      (latestResult.file_path
        ? '<button type="button" class="btn btn-ghost btn-sm" data-file="' + esc(latestResult.file_path) + '">결과지 PDF 열람</button>'
        : '<p class="muted small">결과지 파일이 아직 등록되지 않았습니다.</p>') +
      (latestResult.next_recheck_date ? '<p class="muted small recheck-text">' + icon('calendar', 14) + ' 다음 재검사 권장일 · ' + fmtDate(latestResult.next_recheck_date) + '</p>' : '') +
    '</div>';
  }

  var compareCard = '';
  if (orderedResults.length >= 2) {
    var prevItems = prevResult.item_details && typeof prevResult.item_details === 'object' ? prevResult.item_details : {};
    var nowItems = latestResult.item_details && typeof latestResult.item_details === 'object' ? latestResult.item_details : {};
    var itemKeys = [];
    Object.keys(nowItems).forEach(function (key) { if (itemKeys.indexOf(key) < 0) itemKeys.push(key); });
    Object.keys(prevItems).forEach(function (key) { if (itemKeys.indexOf(key) < 0) itemKeys.push(key); });

    function cellText(value) {
      return value === null || value === undefined || value === '' ? '-' : esc(String(value));
    }

    var compareRows =
      '<tr><td>감정 성향</td><td>' + cellText(prevResult.emotion_type) + '</td><td><strong>' + cellText(latestResult.emotion_type) + '</strong></td></tr>' +
      '<tr><td>등록 항목 수</td><td>' + Object.keys(prevItems).length + '개</td><td><strong>' + Object.keys(nowItems).length + '개</strong></td></tr>' +
      itemKeys.map(function (key) {
        var before = prevItems[key];
        var now = nowItems[key];
        var both = before !== undefined && now !== undefined && String(before) !== '' && String(now) !== '';
        var changed = both && String(before) !== String(now);
        return '<tr' + (changed ? ' class="is-changed"' : '') + '><td>' + esc(key) + '</td><td>' + cellText(before) + '</td><td><strong>' + cellText(now) + '</strong>' +
          (changed ? ' <span class="delta">변화</span>' : '') + '</td></tr>';
      }).join('');

    var sameCount = itemKeys.filter(function (key) {
      var before = prevItems[key];
      var now = nowItems[key];
      return before !== undefined && now !== undefined && String(before) !== '' && String(before) === String(now);
    }).length;

    var sameFile = prevResult.file_path && latestResult.file_path &&
      String(prevResult.file_path) === String(latestResult.file_path);
    var sameDate = String(prevResult.measured_at) === String(latestResult.measured_at);
    var rangeLabel = fmtDate(prevResult.measured_at) + (sameDate ? ' ' + kstClock(prevResult.created_at) : '') +
      ' → ' + fmtDate(latestResult.measured_at) + (sameDate ? ' ' + kstClock(latestResult.created_at) : '');

    var noteRow = function (label, result) {
      return '<div class="compare-note"><span>' + esc(label) + '</span><p>' +
        (result.summary_note ? esc(result.summary_note) : '등록된 요약 코멘트가 없습니다.') + '</p></div>';
    };

    compareCard = '<div class="compare-card">' +
      '<div class="list-top"><strong>이전 vs 현재</strong>' +
        badge(rangeLabel, 'navy') + '</div>' +
      (sameFile
        ? noticeBox('두 기록에 <strong>같은 결과지 파일</strong>이 등록되어 있습니다. 한 번의 결과지를 두 번 등록한 경우에는 비교할 변화가 없습니다.', 'warn')
        : '') +
      '<table class="compare-table"><thead><tr><th>항목</th><th>이전</th><th>현재</th></tr></thead><tbody>' + compareRows + '</tbody></table>' +
      (sameCount
        ? '<p class="chart-caption">값이 같은 항목 ' + sameCount + '개 · 다른 항목 ' + (itemKeys.length - sameCount) + '개</p>'
        : '') +
      '<div class="compare-notes">' +
        noteRow(fmtDate(prevResult.measured_at), prevResult) +
        noteRow(fmtDate(latestResult.measured_at), latestResult) +
      '</div>' +
    '</div>';
  }

  var goalsPanel =
    '<div class="card goal-card">' +
      '<div class="goal-head"><strong>나의 목표</strong><span class="muted small">복수 선택 가능</span></div>' +
      '<div class="chip-wrap" id="goal-chips">' + goalChips + '</div>' +
      '<textarea id="goal-note" rows="2" maxlength="200" placeholder="이번 달 목표를 직접 적어보세요 (선택)">' + esc(profile.goal_note || '') + '</textarea>' +
      '<button type="button" class="btn btn-primary btn-sm btn-block" id="goal-save">목표 저장</button>' +
    '</div>';

  var resultList = orderedResults.slice().reverse().map(function (r) {
    return '<div class="result-row" data-result="' + esc(r.id) + '">' +
      '<div class="result-row-head"><strong>' + fmtDate(r.measured_at) + '</strong>' +
        badge(CHECK_TYPES[r.check_type] || r.check_type, 'neutral') +
        (r.file_path ? '<button type="button" class="btn btn-ghost btn-xs" data-file="' + esc(r.file_path) + '">PDF</button>' : '') +
      '</div>' +
      '<div class="metric-chips">' +
        (r.emotion_type ? '<span class="metric-chip">감정 성향 ' + esc(r.emotion_type) + '</span>' : '') +
        '<span class="metric-chip">항목 설명 ' + (r.item_details && Object.keys(r.item_details).length ? Object.keys(r.item_details).length + '건' : '-') + '</span>' +
      '</div>' +
      (r.summary_note ? '<p class="list-note">' + esc(r.summary_note) + '</p>' : '') +
      itemDetailsHtml(r.item_details) +
      (r.next_recheck_date ? '<p class="muted small">다음 재검사 권장 · ' + fmtDate(r.next_recheck_date) + '</p>' : '') +
    '</div>';
  }).join('');

  var sessionList = sessions.length
    ? sessions.slice().sort(function (a, b) { return Number(b.session_no || 0) - Number(a.session_no || 0); }).map(function (s) {
        return '<div class="session-row">' +
          '<div class="session-head"><strong>' + (s.session_no || '') + '회</strong>' +
            '<span class="muted small">' + fmtDate(s.trained_at) + (s.duration_minutes ? ' · ' + s.duration_minutes + '분' : '') + '</span>' +
            badge(s.protocol || '훈련', 'neutral') + '</div>' +
          '<div class="metric-chips">' +
            (s.focus_metric !== null && s.focus_metric !== undefined ? '<span class="metric-chip">집중 ' + metricText(s.focus_metric) + '</span>' : '') +
            (s.calm_metric !== null && s.calm_metric !== undefined ? '<span class="metric-chip">이완 ' + metricText(s.calm_metric) + '</span>' : '') +
          '</div>' +
          (s.prev_comparison ? '<p class="list-note">' + esc(s.prev_comparison) + '</p>' : '') +
          (s.counselor_memo || s.counselor_name
            ? '<div class="counselor-note">' + icon('chat', 14) + '<span><strong>' + esc(s.counselor_name || '담당 상담사') + '</strong> ' + esc(s.counselor_memo || '') + '</span></div>'
            : '') +
        '</div>';
      }).join('')
    : emptyState({
        icon: 'sparkle',
        title: '아직 뉴로피드백 기록이 없습니다',
        desc: '훈련 기록은 담당 상담사가 등록하며, 회차별 변화가 이곳에 쌓입니다.',
        action: '<a class="btn btn-ghost btn-sm" href="#/neuro">패키지 보기</a>'
      });

  var bookingsPanel = bookings.length
    ? bookings.map(bookingItemHtml).join('')
    : emptyState({
        icon: 'calendar',
        title: '예약 내역이 없습니다',
        desc: '브레인체크·뉴로피드백·프로그램 예약이 이곳에 모입니다.',
        action: '<a class="btn btn-ghost btn-sm" href="#/brain-check">검사 예약하기</a>'
      });

  var packagesPanel = packages.length
    ? packages.map(function (p) {
        var total = Number(p.total_sessions || 0);
        var used = Number(p.used_sessions || 0);
        var percent = total ? Math.min(100, Math.round(used / total * 100)) : 0;
        return '<div class="usage-card">' +
          '<div class="list-top"><strong>' + esc(p.package_name) + '</strong>' +
          badge(p.status === 'completed' ? '완료' : p.status === 'expired' ? '만료' : '진행 중', p.status === 'active' ? 'green' : 'neutral') + '</div>' +
          '<div class="usage-figures"><strong>' + Math.max(0, total - used) + '</strong><span>/ ' + total + '회 남음</span></div>' +
          '<div class="progress"><span style="width:' + percent + '%"></span></div>' +
          (p.expires_at ? '<p class="muted small">유효기간 ~ ' + fmtDate(p.expires_at) + '</p>' : '') +
          (p.refund_rule ? '<p class="muted small">환불 기준 · ' + esc(p.refund_rule) + '</p>' : '') +
        '</div>';
      }).join('')
    : emptyState({
        icon: 'sparkle',
        title: '구매한 프로그램이 없습니다',
        desc: '뉴로피드백 패키지나 프로그램을 신청하면 잔여 횟수가 표시됩니다.',
        action: '<a class="btn btn-ghost btn-sm" href="#/neuro">패키지 보기</a>'
      });

  var wellnessPanel = wellness.length
    ? wellness.map(function (log) {
        var values = [];
        if (log.focus_level) values.push('집중 ' + log.focus_level);
        if (log.stress_level) values.push('스트레스 ' + log.stress_level);
        if (log.sleep_level) values.push('수면 ' + log.sleep_level);
        var clock = kstClock(log.created_at);
        return '<div class="wellness-row">' +
          '<div class="wellness-date">' + fmtDate(log.logged_at) +
            (clock ? '<em class="wellness-clock">' + esc(clock) + '</em>' : '') + '</div>' +
          '<div class="wellness-body"><div class="metric-chips">' +
            values.map(function (v) { return '<span class="metric-chip">' + esc(v) + '</span>'; }).join('') +
          '</div>' + (log.memo ? '<p class="list-note">' + esc(log.memo) + '</p>' : '') + '</div>' +
          '<button type="button" class="btn btn-ghost btn-xs wellness-del" data-del-wellness="' + esc(log.id) + '">삭제</button>' +
        '</div>';
      }).join('')
    : emptyState({
        icon: 'heart',
        title: '아직 웰니스 기록이 없습니다',
        desc: '홈에서 오늘의 뇌 컨디션을 기록하면 매일 쌓입니다.',
        action: '<a class="btn btn-ghost btn-sm" href="#/home">체크인 하러가기</a>'
      });

  var counselorNotes = [];
  sessions.forEach(function (s) {
    if (s.counselor_memo) counselorNotes.push({ when: s.trained_at, name: s.counselor_name || '담당 상담사', text: s.counselor_memo });
  });
  var counselorPanel = counselorNotes.length
    ? counselorNotes.slice(0, 4).map(function (n) {
        return '<div class="counselor-row"><span class="muted small">' + fmtDate(n.when) + '</span>' +
          '<strong>' + esc(n.name) + '</strong><p>' + esc(n.text) + '</p></div>';
      }).join('')
    : '<p class="muted small">공개된 상담사 안내가 없습니다. 훈련 후 담당 상담사가 남긴 메모가 이곳에 표시됩니다.</p>';

  var orgPanel = memberships.length
    ? memberships.map(function (m) {
        var orgName = (m.organizations && m.organizations.name) || '기관';
        return '<div class="org-chip"><strong>' + esc(orgName) + '</strong>' +
          badge(m.status === 'approved' ? '소속 승인' : m.status === 'pending' ? '승인 대기' : '거절', m.status === 'approved' ? 'green' : 'neutral') +
          badge(m.share_brain_results ? '결과 공유 동의' : '결과 비공유', m.share_brain_results ? 'green' : 'neutral') + '</div>';
      }).join('')
    : '';

  var html =
    '<header class="page-head">' +
      '<span class="page-eyebrow">' + icon('brain', 16) + ' MY BRAIN</span>' +
      '<h1 class="page-title">' + esc(profile.full_name || '회원') + ' 님의<br>뇌 컨디션</h1>' +
      '<div class="grade-row">' +
        badge(profile.member_grade || 'Welcome', 'navy') +
        '<span class="muted small">' + esc(GRADES[profile.member_grade] ? GRADES[profile.member_grade].desc : '') + '</span>' +
      '</div>' +
    '</header>' +

    (loadError ? '<section class="section">' + noticeBox(esc(loadError), 'warn') + '</section>' : '') +

    '<section class="section">' + summary + '</section>' +

    (orgPanel
      ? '<section class="section">' + sectionHead('소속 기관 · 결과 공유', '<a class="muted small" href="#/account">설정</a>') + '<div class="org-chip-list">' + orgPanel + '</div>' + '</section>'
      : '') +

    '<section class="section">' +
      sectionHead('최근 검사 결과', latestResult ? '<a class="muted small" href="#/my-brain?tab=results">전체 기록</a>' : '') +
      (latestResult ? resultFileCard : emptyState({
        icon: 'file',
        title: '아직 등록된 검사 결과가 없습니다',
        desc: '뇌파측정 후 담당자가 결과를 등록하면 이곳에 표시됩니다. 임의 수치는 표시하지 않습니다.',
        action: '<a class="btn btn-ghost btn-sm" href="#/brain-check">검사 안내 보기</a>'
      })) +
    '</section>' +

    '<section class="section">' +
      sectionHead('이전 vs 현재', results.length >= 2 ? '<span class="muted small">' + results.length + '건 비교</span>' : '') +
      (results.length >= 2
        ? compareCard + '<p class="chart-caption">숫자 지표 대신 결과지의 항목별 설명과 감정 성향을 그대로 비교합니다.</p>'
        : emptyState({
            icon: 'chart',
            title: results.length ? '비교 리포트는 검사 2건 이상부터 표시됩니다' : '아직 검사 결과 데이터가 없습니다',
            desc: '실제 측정 결과가 2건 이상 쌓이면 감정 성향 · 항목별 설명 · 요약 코멘트를 이전 결과와 비교해 보여드립니다.'
          })) +
    '</section>' +

    '<section class="section">' + goalsPanel + '</section>' +

    '<section class="section">' +
      sectionHead('담당 상담사 안내', '<span class="muted small">공개 메모</span>') +
      '<div class="counselor-list">' + counselorPanel + '</div>' +
    '</section>' +

    '<section class="section">' +
      '<div class="tab-strip" role="tablist">' +
        '<button type="button" class="tab-btn is-on" data-tab="results">검사 기록</button>' +
        '<button type="button" class="tab-btn" data-tab="neuro">뉴로피드백</button>' +
        '<button type="button" class="tab-btn" data-tab="bookings">예약 · 이용권</button>' +
        '<button type="button" class="tab-btn" data-tab="wellness">웰니스 기록</button>' +
      '</div>' +
      '<div class="tab-panel is-on" data-panel="results">' + (resultList || emptyState({ icon: 'file', title: '검사 기록이 없습니다', desc: '검사 후 결과지가 등록되면 날짜별로 표시됩니다.' })) + '</div>' +
      '<div class="tab-panel" data-panel="neuro">' + sessionList + '</div>' +
      '<div class="tab-panel" data-panel="bookings">' + packagesPanel + bookingsPanel + '</div>' +
      '<div class="tab-panel" data-panel="wellness">' + wellnessPanel + '</div>' +
    '</section>' +

    '<footer class="app-footer"><p class="footer-note">' + esc(BRAND.nonMedical) + '</p></footer>';

  return {
    title: 'MY BRAIN',
    html: html,
    mount: function (el) {
      var selectedGoals = goals.slice();

      var chips = el.querySelectorAll('[data-goal]');
      for (var i = 0; i < chips.length; i++) {
        chips[i].addEventListener('click', function () {
          var goal = this.getAttribute('data-goal');
          var index = selectedGoals.indexOf(goal);
          if (index >= 0) selectedGoals.splice(index, 1);
          else selectedGoals.push(goal);
          this.classList.toggle('is-on');
        });
      }

      var saveBtn = el.querySelector('#goal-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', async function () {
          var noteEl = el.querySelector('#goal-note');
          setBusy(saveBtn, true, '저장 중');
          try {
            await updateProfile({ goals: selectedGoals, goal_note: noteEl ? noteEl.value.trim() : '' });
            toast('목표가 저장되었습니다.', 'success');
            setBusy(saveBtn, false);
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(saveBtn, false);
          }
        });
      }

      var fileButtons = el.querySelectorAll('[data-file]');
      for (var f = 0; f < fileButtons.length; f++) {
        fileButtons[f].addEventListener('click', async function () {
          var path = this.getAttribute('data-file');
          if (!path) return;
          setBusy(this, true, '여는 중');
          try {
            var url = await getSignedResultUrl(path);
            if (url) window.open(url, '_blank', 'noopener');
            else toast('결과지 열람 주소를 발급하지 못했습니다.', 'error');
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
          setBusy(this, false);
        });
      }

      /* 웰니스 체크 기록 삭제 — 같은 날 중복 등록 정리 */
      var delWellness = el.querySelectorAll('[data-del-wellness]');
      for (var w = 0; w < delWellness.length; w++) {
        delWellness[w].addEventListener('click', async function () {
          var id = this.getAttribute('data-del-wellness');
          if (!id) return;
          var ok = await confirmDialog({
            title: '웰니스 기록 삭제',
            message: '이 웰니스 체크 기록을 삭제할까요? 삭제한 기록은 되돌릴 수 없습니다.',
            confirmLabel: '삭제'
          });
          if (!ok) return;
          setBusy(this, true, '삭제 중');
          try {
            await deleteWellness(id);
            toast('웰니스 체크 기록을 삭제했습니다.', 'success');
            go('/my-brain?tab=wellness');
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(this, false);
          }
        });
      }

      var tabButtons = el.querySelectorAll('[data-tab]');
      function activate(tabId) {
        for (var k = 0; k < tabButtons.length; k++) {
          tabButtons[k].classList.toggle('is-on', tabButtons[k].getAttribute('data-tab') === tabId);
        }
        var panels = el.querySelectorAll('[data-panel]');
        for (var p = 0; p < panels.length; p++) {
          panels[p].classList.toggle('is-on', panels[p].getAttribute('data-panel') === tabId);
        }
      }
      for (var t = 0; t < tabButtons.length; t++) {
        tabButtons[t].addEventListener('click', function () {
          activate(this.getAttribute('data-tab'));
        });
      }
      var wanted = ctx.query.get('tab');
      if (wanted) activate(wanted);

      bindBookingActions(el, function () { ctx.rerender(); });
    }
  };
}
