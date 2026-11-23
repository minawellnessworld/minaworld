/* S03. NEURO TRAINING — 뉴로피드백 패키지 · 훈련 기록 */
import { state, getPrograms, listPackages, listSessions, listBookings, friendlyError } from '../store.js?v=2.0.28';
import { icon, esc, fmtKRW, fmtDate, toast, emptyState, noticeBox, sectionHead, chartBaseOptions } from '../ui.js?v=2.0.28';
import { openBookingFlow, bookingItemHtml, bindBookingActions } from '../booking.js?v=2.0.28';

function packageCard(program) {
  var isSingle = program.id === 'neuro_1';
  return '<article class="package-card' + (isSingle ? ' is-single' : '') + '">' +
    '<div class="package-top">' +
      '<span class="badge badge-' + (isSingle ? 'neutral' : 'yellow') + '">' + esc(program.badge || program.sub_category) + '</span>' +
      '<h3>' + esc(program.title) + '</h3>' +
      '<p class="muted small">' + esc(program.subtitle || '') + '</p>' +
    '</div>' +
    '<div class="package-price"><strong>' + esc(program.price_label || fmtKRW(program.price_krw)) + '</strong>' +
      '<span>' + esc(program.duration_text || '') + '</span></div>' +
    '<p class="package-desc">' + esc(program.description || '') + '</p>' +
    '<button type="button" class="btn ' + (isSingle ? 'btn-ghost' : 'btn-primary') + ' btn-block btn-sm" data-book="' + esc(program.id) + '">신청 · 예약</button>' +
  '</article>';
}

function scorePair(ex) {
  var parts = [];
  if (ex.score_s !== null && ex.score_s !== undefined) parts.push(ex.score_s + 'S');
  if (ex.score_p !== null && ex.score_p !== undefined) parts.push(ex.score_p + 'P');
  return parts.join(' ');
}

function detailsBlock(details) {
  if (!details || !details.exercises || !details.exercises.length) return '';
  var totals = [];
  if (details.total_score_s !== null && details.total_score_s !== undefined) totals.push(details.total_score_s + 'S');
  if (details.total_points_p !== null && details.total_points_p !== undefined) totals.push(details.total_points_p + 'P');
  var rows = details.exercises.map(function (ex) {
    return '<div class="neuro-ex-row">' +
      '<span class="neuro-ex-seq">' + esc(ex.seq) + '</span>' +
      '<span class="neuro-ex-name">' + esc(ex.exercise || '-') + '</span>' +
      '<span class="neuro-ex-proto">' + esc(ex.protocol || '-') + '</span>' +
      '<span class="neuro-ex-score">' + esc(scorePair(ex) || '-') + '</span>' +
      '</div>';
  }).join('');
  return '<div class="neuro-details">' +
    '<div class="neuro-details-head">' +
      '<span class="metric-chip">총 ' + esc(totals.join(' · ') || '-') + '</span>' +
      '<span class="muted small">' + details.exercises.length + '단계' +
        (details.begin_time ? ' · ' + esc(details.begin_time) + (details.finish_time ? ' ~ ' + esc(details.finish_time) : '') : '') +
      '</span>' +
    '</div>' +
    '<div class="neuro-ex-table">' + rows + '</div>' +
    '</div>';
}

function sessionRow(session, index) {
  var metrics = [];
  if (session.focus_metric !== null && session.focus_metric !== undefined) {
    metrics.push('<span class="metric-chip">집중 ' + Number(session.focus_metric).toFixed(1) + '</span>');
  }
  if (session.calm_metric !== null && session.calm_metric !== undefined) {
    metrics.push('<span class="metric-chip">이완 ' + Number(session.calm_metric).toFixed(1) + '</span>');
  }
  return '<div class="session-row">' +
    '<div class="session-no">' + (session.session_no || index + 1) + '</div>' +
    '<div class="session-body">' +
      '<div class="session-head"><strong>' + esc(session.protocol || '맞춤 프로토콜 훈련') + '</strong>' +
        '<span class="muted small">' + fmtDate(session.trained_at) + '</span></div>' +
      (metrics.length ? '<div class="metric-chips">' + metrics.join('') + '</div>' : '') +
      detailsBlock(session.session_details) +
      (session.prev_comparison ? '<p class="session-note">이전 대비 · ' + esc(session.prev_comparison) + '</p>' : '') +
      (session.counselor_memo ? '<p class="session-memo">' + icon('user', 14) + '<span>담당 상담사 메모 · ' + esc(session.counselor_memo) + '</span></p>' : '') +
    '</div>' +
  '</div>';
}

export async function render(ctx) {
  var programs = [];
  var packages = [];
  var sessions = [];
  var bookings = [];
  var loadError = '';

  try {
    programs = await getPrograms('neuro_training');
    if (state.session) {
      var uid = state.session.user.id;
      var loaded = await Promise.all([listPackages(uid), listSessions(uid), listBookings(uid)]);
      packages = loaded[0];
      sessions = loaded[1];
      bookings = loaded[2].filter(function (b) { return String(b.program_id || '').indexOf('neuro_') === 0; });
    }
  } catch (err) {
    loadError = friendlyError(err);
  }

  var activePackages = packages.filter(function (p) { return p.status !== 'expired'; });
  var totalRemaining = activePackages.reduce(function (sum, p) {
    return sum + Math.max(0, Number(p.total_sessions || 0) - Number(p.used_sessions || 0));
  }, 0);
  var totalUsed = activePackages.reduce(function (sum, p) { return sum + Number(p.used_sessions || 0); }, 0);

  var packageBlock;
  if (!state.session) {
    packageBlock = emptyState({
      icon: 'lock',
      title: '로그인 후 이용권을 확인할 수 있습니다',
      desc: '보유 패키지 잔여 횟수와 회차별 훈련 기록이 계정에 저장됩니다.',
      action: '<a class="btn btn-ghost btn-sm" href="#/account">로그인 · 회원가입</a>'
    });
  } else if (!activePackages.length) {
    packageBlock = emptyState({
      icon: 'sparkle',
      title: '보유 이용권 없음',
      desc: '1회 훈련 또는 10·20·30회 패키지를 신청하면 잔여 횟수와 회차별 변화가 이곳에 기록됩니다.',
      action: '<button type="button" class="btn btn-ghost btn-sm" data-scroll-packages>패키지 보기</button>'
    });
  } else {
    packageBlock = activePackages.map(function (p) {
      var total = Number(p.total_sessions || 0);
      var used = Number(p.used_sessions || 0);
      var remain = Math.max(0, total - used);
      var percent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
      return '<div class="usage-card">' +
        '<div class="list-top"><strong>' + esc(p.package_name) + '</strong>' +
          '<span class="badge badge-' + (p.status === 'completed' ? 'neutral' : 'green') + '">' +
          (p.status === 'completed' ? '완료' : '진행 중') + '</span></div>' +
        '<div class="usage-figures"><strong>' + remain + '</strong><span>/ ' + total + '회 남음</span></div>' +
        '<div class="progress"><span style="width:' + percent + '%"></span></div>' +
        '<div class="usage-meta"><span>사용 ' + used + '회</span>' +
          (p.expires_at ? '<span>유효기간 ' + fmtDate(p.expires_at) + '</span>' : '<span>유효기간 상담 안내</span>') + '</div>' +
        (remain === 0
          ? '<button type="button" class="btn btn-accent btn-sm btn-block" data-rescroll>재등록 신청</button>'
          : '<button type="button" class="btn btn-ghost btn-sm btn-block" data-rescroll>추가 등록</button>') +
      '</div>';
    }).join('');
  }

  var scoreSessions = sessions.filter(function (s) {
    var d = s.session_details || {};
    return d.total_score_s !== null && d.total_score_s !== undefined;
  });
  var metricSessions = sessions.filter(function (s) {
    return (s.focus_metric !== null && s.focus_metric !== undefined) || (s.calm_metric !== null && s.calm_metric !== undefined);
  });
  var chartMode = scoreSessions.length >= 2 ? 'score' : (metricSessions.length >= 2 ? 'metric' : '');

  var sessionsBlock;
  if (!state.session) {
    sessionsBlock = emptyState({
      icon: 'lock',
      title: '훈련 기록은 로그인 후 표시됩니다',
      desc: '측정·훈련이 완료되면 담당 상담사가 기록을 등록합니다.'
    });
  } else if (!sessions.length) {
    sessionsBlock = emptyState({
      icon: 'chart',
      title: '아직 등록된 훈련 데이터가 없습니다',
      desc: '측정·훈련 완료 후 표시됩니다. 실제 회차 기록이 등록되면 이곳에 변화 그래프가 나타납니다.'
    });
  } else {
    sessionsBlock = '<div class="chart-card">' +
      (chartMode
        ? '<div class="chart-wrap"><canvas id="neuro-chart"></canvas></div>' +
          '<p class="chart-caption">' + (chartMode === 'score'
            ? '회차별 훈련 점수(S) · 포인트(P) — 실제 등록된 기록만 표시됩니다'
            : '실제 등록된 회차 기록만 표시됩니다 (집중 · 이완 지표)') + '</p>'
        : '<p class="chart-caption">비교 그래프는 회차 기록이 2회 이상일 때 표시됩니다. 현재 ' + sessions.length + '회 기록.</p>') +
    '</div>' +
    '<div class="session-list">' + sessions.map(sessionRow).join('') + '</div>';
  }

  var bookingBlock = '';
  if (state.session && bookings.length) {
    bookingBlock = '<section class="section">' + sectionHead('훈련 예약 내역', '') +
      bookings.map(bookingItemHtml).join('') + '</section>';
  }

  var html =
    '<header class="page-head">' +
      '<span class="page-eyebrow">' + icon('sparkle', 16) + ' NEURO TRAINING</span>' +
      '<h1 class="page-title">뇌파로 훈련하는<br>자기조절 루틴</h1>' +
      '<p class="page-desc">실시간 뇌파 피드백을 보며 이완과 몰입 상태를 스스로 조율합니다. 회차별 변화는 실제 기록으로만 표시됩니다.</p>' +
    '</header>' +

    '<section class="section usage-section">' +
      sectionHead('나의 훈련 현황', state.session ? '<span class="muted small">총 ' + totalRemaining + '회 남음 · 누적 ' + totalUsed + '회</span>' : '') +
      packageBlock +
    '</section>' +

    (loadError ? '<section class="section">' + noticeBox(esc(loadError), 'warn') + '</section>' : '') +

    '<section class="section">' +
      sectionHead('훈련 변화', sessions.length >= 2 ? '<span class="muted small">' + sessions.length + '회 기록</span>' : '') +
      sessionsBlock +
    '</section>' +

    '<section class="section" id="package-section">' +
      sectionHead('이용권 · 패키지', '<span class="muted small">가격 미확정 상품은 상담 확정</span>') +
      '<div class="package-grid">' + programs.map(packageCard).join('') + '</div>' +
      noticeBox('10·20·30회 패키지 금액은 표시된 할인가로 예약되며, 이용 기간과 일정은 상담에서 안내합니다.', 'neutral') +
    '</section>' +

    bookingBlock +

    '<section class="section">' +
      '<div class="info-rows">' +
        '<div class="info-row">' + icon('clock', 17) + '<span><strong>1회 40분</strong> 뇌파 센서 착용 후 맞춤 프로토콜로 진행합니다.</span></div>' +
        '<div class="info-row">' + icon('info', 17) + '<span><strong>기록 원칙</strong> 측정값이 없을 때 임의의 수치나 그래프는 표시하지 않습니다.</span></div>' +
      '</div>' +
    '</section>' +

    '<footer class="app-footer"><p class="footer-note">본 훈련은 의료기관의 진단·치료를 대체하지 않는 웰니스 프로그램입니다.</p></footer>';

  return {
    title: 'NEURO TRAINING',
    html: html,
    mount: function (el) {
      var bookButtons = el.querySelectorAll('[data-book]');
      for (var i = 0; i < bookButtons.length; i++) {
        bookButtons[i].addEventListener('click', function () {
          var id = this.getAttribute('data-book');
          var program = null;
          for (var k = 0; k < programs.length; k++) {
            if (programs[k].id === id) program = programs[k];
          }
          if (!program) return;
          openBookingFlow(program, { onDone: function () { ctx.rerender(); } });
        });
      }

      var scrollButtons = el.querySelectorAll('[data-scroll-packages], [data-rescroll]');
      for (var s = 0; s < scrollButtons.length; s++) {
        scrollButtons[s].addEventListener('click', function () {
          var section = el.querySelector('#package-section');
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }

      var canvas = el.querySelector('#neuro-chart');
      if (canvas && chartMode) {
        if (!window.Chart) {
          var wrap = canvas.parentNode;
          wrap.innerHTML = '<p class="muted small">그래프 라이브러리를 불러오지 못했습니다. 기록 목록은 아래에서 확인할 수 있습니다.</p>';
        } else {
          var labels = [];
          var seriesA = [];
          var seriesB = [];
          var labelA = '집중 지표';
          var labelB = '이완 지표';
          if (chartMode === 'score') {
            labels = scoreSessions.map(function (s) { return '#' + (s.session_no || '') ; });
            seriesA = scoreSessions.map(function (s) { return Number(s.session_details.total_score_s); });
            seriesB = scoreSessions.map(function (s) {
              var p = s.session_details.total_points_p;
              return p === null || p === undefined ? null : Number(p);
            });
            labelA = '훈련 점수(S)';
            labelB = '포인트(P)';
          } else {
            labels = metricSessions.map(function (s) { return (s.session_no || '') + '회'; });
            seriesA = metricSessions.map(function (s) {
              return s.focus_metric === null || s.focus_metric === undefined ? null : Number(s.focus_metric);
            });
            seriesB = metricSessions.map(function (s) {
              return s.calm_metric === null || s.calm_metric === undefined ? null : Number(s.calm_metric);
            });
          }
          var options = chartBaseOptions();
          new window.Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
              labels: labels,
              datasets: [
                {
                  label: labelA, data: seriesA, borderColor: '#070D1E', backgroundColor: 'rgba(7,13,30,0.08)',
                  tension: 0.35, spanGaps: true, pointRadius: 3.5, pointBackgroundColor: '#070D1E', borderWidth: 2
                },
                {
                  label: labelB, data: seriesB, borderColor: '#F5B82E', backgroundColor: 'rgba(245,184,46,0.14)',
                  tension: 0.35, spanGaps: true, pointRadius: 3.5, pointBackgroundColor: '#F5B82E', borderWidth: 2
                }
              ]
            },
            options: options
          });
        }
      }

      bindBookingActions(el, function () { ctx.rerender(); });
    }
  };
}
