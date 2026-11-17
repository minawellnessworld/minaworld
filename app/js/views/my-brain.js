/* S04. MY BRAIN — 나의 뇌 관리 대시보드 */
import { BRAND, GOAL_OPTIONS, GRADES, BOOKING_STATUS } from '../config.js';
import {
  state, updateProfile, listResults, listPackages, listSessions, listBookings, listWellness,
  getSignedResultUrl, friendlyError, todayStr
} from '../store.js';
import {
  icon, esc, fmtKRW, fmtDate, toast, emptyState, noticeBox, sectionHead, chartBaseOptions,
  loadingBlock, badge, bookingStatusTone, setBusy
} from '../ui.js';
import { bookingItemHtml, bindBookingActions } from '../booking.js';

function summaryTile(ico, label, value, sub) {
  return '<div class="summary-tile">' +
    '<span class="tile-ico">' + icon(ico, 18) + '</span>' +
    '<span class="tile-label">' + esc(label) + '</span>' +
    '<strong class="tile-value">' + esc(value) + '</strong>' +
    (sub ? '<span class="tile-sub">' + esc(sub) + '</span>' : '') +
  '</div>';
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
  var loadError = '';

  try {
    var loaded = await Promise.all([listResults(), listPackages(), listSessions(), listBookings(), listWellness(undefined, 30)]);
    results = loaded[0];
    packages = loaded[1];
    sessions = loaded[2];
    bookings = loaded[3];
    wellness = loaded[4];
  } catch (err) {
    loadError = friendlyError(err);
  }

  var profile = state.profile || {};
  var goals = Array.isArray(profile.goals) ? profile.goals : [];
  var todayStrValue = todayStr();

  var upcoming = bookings.filter(function (b) {
    return (b.status === 'pending' || b.status === 'confirmed') && String(b.preferred_date) >= todayStrValue;
  }).sort(function (a, b) { return String(a.preferred_date).localeCompare(String(b.preferred_date)); })[0];

  var totalUsed = packages.reduce(function (sum, p) { return sum + Number(p.used_sessions || 0); }, 0);
  var remaining = packages.reduce(function (sum, p) {
    return sum + Math.max(0, Number(p.total_sessions || 0) - Number(p.used_sessions || 0));
  }, 0);

  var latestResult = results[0] || null;

  var goalChips = GOAL_OPTIONS.map(function (goal) {
    var on = goals.indexOf(goal) >= 0 ? ' is-on' : '';
    return '<button type="button" class="chip' + on + '" data-goal="' + esc(goal) + '">' + esc(goal) + '</button>';
  }).join('');

  var summary =
    '<div class="summary-grid">' +
      summaryTile('calendar', '최근 뇌파측정', latestResult ? fmtDate(latestResult.measured_at) : '측정 전', latestResult ? (latestResult.check_type === 'full' ? '종합검사' : '간편검사') : '기록 없음') +
      summaryTile('sparkle', '뉴로피드백', String(totalUsed) + '회', remaining > 0 ? ('잔여 ' + remaining + '회') : '보유 이용권 없음') +
      summaryTile('chart', '검사 기록', String(results.length) + '건', results.length >= 2 ? '변화 그래프 제공' : '2건 이상 시 그래프') +
      summaryTile('clock', '다음 일정', upcoming ? fmtDate(upcoming.preferred_date) : '예정 없음', upcoming ? (upcoming.preferred_time + ' · ' + upcoming.program_title) : '예약 시 표시') +
    '</div>';

  var resultFileCard = '';
  if (latestResult) {
    resultFileCard = '<div class="result-preview">' +
      '<div class="list-top"><strong>' + esc(latestResult.check_type === 'full' ? '종합검사 결과지' : '간편검사 결과지') + '</strong>' +
        badge(fmtDate(latestResult.measured_at), 'neutral') + '</div>' +
      (latestResult.summary_note ? '<p class="list-note">' + esc(latestResult.summary_note) + '</p>' : '') +
      (latestResult.file_path
        ? '<button type="button" class="btn btn-ghost btn-sm" data-latest-file>결과지 열기</button>'
        : '<p class="muted small">결과지 파일이 아직 등록되지 않았습니다.</p>') +
      (latestResult.next_recheck_date ? '<p class="muted small recheck-text">' + icon('calendar', 14) + ' 다음 재검사 권장일 · ' + fmtDate(latestResult.next_recheck_date) + '</p>' : '') +
    '</div>';
  }

  var goalsPanel =
    '<div class="card goal-card">' +
      '<div class="goal-head"><strong>나의 목표</strong><span class="muted small">복수 선택 가능</span></div>' +
      '<div class="chip-wrap" id="goal-chips">' + goalChips + '</div>' +
      '<textarea id="goal-note" rows="2" maxlength="200" placeholder="이번 달 목표를 직접 적어보세요 (선택)">' + esc(profile.goal_note || '') + '</textarea>' +
      '<button type="button" class="btn btn-primary btn-sm btn-block" id="goal-save">목표 저장</button>' +
    '</div>';

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
          badge(p.status === 'completed' ? '완료' : '진행 중', p.status === 'completed' ? 'neutral' : 'green') + '</div>' +
          '<div class="usage-figures"><strong>' + Math.max(0, total - used) + '</strong><span>/ ' + total + '회 남음</span></div>' +
          '<div class="progress"><span style="width:' + percent + '%"></span></div>' +
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
        return '<div class="wellness-row">' +
          '<div class="wellness-date">' + fmtDate(log.logged_at) + '</div>' +
          '<div class="wellness-body"><div class="metric-chips">' +
            values.map(function (v) { return '<span class="metric-chip">' + esc(v) + '</span>'; }).join('') +
          '</div>' + (log.memo ? '<p class="list-note">' + esc(log.memo) + '</p>' : '') + '</div>' +
        '</div>';
      }).join('')
    : emptyState({
        icon: 'heart',
        title: '아직 웰니스 기록이 없습니다',
        desc: '홈에서 오늘의 뇌 컨디션을 기록하면 매일 쌓입니다.',
        action: '<a class="btn btn-ghost btn-sm" href="#/home">체크인 하러가기</a>'
      });

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
    '<section class="section">' + resultFileCard + goalsPanel + '</section>' +

    '<section class="section">' +
      sectionHead('검사 결과 변화', results.length >= 2 ? '<span class="muted small">' + results.length + '건</span>' : '') +
      (results.length >= 2
        ? '<div class="chart-card"><div class="chart-wrap"><canvas id="result-chart"></canvas></div>' +
          '<p class="chart-caption">실제 검사 결과만 표시됩니다 (집중 · 스트레스 지표)</p></div>'
        : emptyState({
            icon: 'chart',
            title: results.length ? '변화 그래프는 검사 2건 이상부터 표시됩니다' : '아직 검사 결과 데이터가 없습니다',
            desc: '실제 측정 결과가 2건 이상 쌓이면 자동으로 변화 그래프가 그려집니다. 임의 수치는 표시하지 않습니다.',
            action: '<a class="btn btn-ghost btn-sm" href="#/brain-check">검사 안내 보기</a>'
          })) +
    '</section>' +

    '<section class="section">' +
      '<div class="tab-strip" role="tablist">' +
        '<button type="button" class="tab-btn is-on" data-tab="bookings">예약 내역</button>' +
        '<button type="button" class="tab-btn" data-tab="packages">구매 프로그램</button>' +
        '<button type="button" class="tab-btn" data-tab="wellness">웰니스 기록</button>' +
      '</div>' +
      '<div class="tab-panel is-on" data-panel="bookings">' + bookingsPanel + '</div>' +
      '<div class="tab-panel" data-panel="packages">' + packagesPanel + '</div>' +
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

      var fileBtn = el.querySelector('[data-latest-file]');
      if (fileBtn && latestResult) {
        fileBtn.addEventListener('click', async function () {
          if (!latestResult.file_path) return;
          setBusy(fileBtn, true, '여는 중');
          try {
            var url = await getSignedResultUrl(latestResult.file_path);
            if (url) window.open(url, '_blank', 'noopener');
            else toast('결과지 열람 주소를 발급하지 못했습니다.', 'error');
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
          setBusy(fileBtn, false);
        });
      }

      var tabButtons = el.querySelectorAll('[data-tab]');
      for (var t = 0; t < tabButtons.length; t++) {
        tabButtons[t].addEventListener('click', function () {
          var target = this.getAttribute('data-tab');
          var allButtons = el.querySelectorAll('[data-tab]');
          for (var k = 0; k < allButtons.length; k++) allButtons[k].classList.toggle('is-on', allButtons[k] === this);
          var panels = el.querySelectorAll('[data-panel]');
          for (var p = 0; p < panels.length; p++) {
            panels[p].classList.toggle('is-on', panels[p].getAttribute('data-panel') === target);
          }
        });
      }

      var canvas = el.querySelector('#result-chart');
      if (canvas && results.length >= 2) {
        if (!window.Chart) {
          canvas.parentNode.innerHTML = '<p class="muted small">그래프 라이브러리를 불러오지 못했습니다.</p>';
        } else {
          var ordered = results.slice().sort(function (a, b) {
            return String(a.measured_at).localeCompare(String(b.measured_at));
          });
          new window.Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
              labels: ordered.map(function (r) { return fmtDate(r.measured_at); }),
              datasets: [
                {
                  label: '집중 지표',
                  data: ordered.map(function (r) { return r.focus_score === null || r.focus_score === undefined ? null : Number(r.focus_score); }),
                  borderColor: '#070D1E', backgroundColor: 'rgba(7,13,30,0.08)', tension: 0.3, spanGaps: true, pointRadius: 3.5, borderWidth: 2
                },
                {
                  label: '스트레스 지표',
                  data: ordered.map(function (r) { return r.stress_index === null || r.stress_index === undefined ? null : Number(r.stress_index); }),
                  borderColor: '#F5B82E', backgroundColor: 'rgba(245,184,46,0.14)', tension: 0.3, spanGaps: true, pointRadius: 3.5, borderWidth: 2
                }
              ]
            },
            options: chartBaseOptions()
          });
        }
      }

      bindBookingActions(el, function () { ctx.rerender(); });
    }
  };
}
