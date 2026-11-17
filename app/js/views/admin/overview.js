/* 관리자 → 운영 요약: 기간 필터 + 10대 실제 집계 + 월별 매출 차트 */
import { BOOKING_STATUS, ROLES } from '../../config.js?v=2.0.13';
import { state, friendlyError, todayStr } from '../../store.js?v=2.0.13';
import { getPeriodMetrics, fetchMetricSource, monthlyRevenue, rangeFor } from '../../store-security.js?v=2.0.13';
import { icon, esc, fmtKRW, fmtDate, badge, chartBaseOptions, noticeBox } from '../../ui.js?v=2.0.13';

function statCard(label, value, sub, tone) {
  return '<div class="stat-card tone-' + (tone || 'ivory') + '">' +
    '<span class="stat-label">' + esc(label) + '</span>' +
    '<strong class="stat-value">' + esc(value) + '</strong>' +
    (sub ? '<span class="stat-sub">' + esc(sub) + '</span>' : '') +
  '</div>';
}

function table(headers, rows) {
  return '<div class="table-scroll"><table class="data-table"><thead><tr>' +
    headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function emptyRow(cols, text) {
  return '<tr><td colspan="' + cols + '" class="table-empty">' + esc(text) + '</td></tr>';
}

var PERIODS = [
  { id: 'today', label: '오늘' },
  { id: 'week', label: '이번 주' },
  { id: 'month', label: '이번 달' },
  { id: 'year', label: '올해' },
  { id: 'custom', label: '직접 설정' }
];

export async function build(ctx) {
  var period = ctx.query.get('period') || 'month';
  if (['today', 'week', 'month', 'year', 'custom'].indexOf(period) < 0) period = 'month';
  var customStart = ctx.query.get('start') || '';
  var customEnd = ctx.query.get('end') || '';
  var range = rangeFor(period, customStart || undefined, customEnd || undefined);

  var source = await fetchMetricSource();
  var metrics = await getPeriodMetrics(range, source);
  var revenueSeries = monthlyRevenue(source, 6);

  var periodBar = PERIODS.map(function (p) {
    return '<a class="seg-btn' + (p.id === period ? ' is-on' : '') + '" href="#/admin/overview?period=' + p.id + '">' + esc(p.label) + '</a>';
  }).join('');

  var customForm = period === 'custom'
    ? '<div class="period-custom">' +
        '<label class="field-compact"><span>시작</span><input type="date" id="ov-start" value="' + esc(range.start) + '"></label>' +
        '<label class="field-compact"><span>종료</span><input type="date" id="ov-end" value="' + esc(range.end) + '"></label>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="ov-apply">적용</button>' +
      '</div>'
    : '';

  var status = metrics.statusCounts;
  var statusChips = Object.keys(BOOKING_STATUS).map(function (key) {
    return '<span class="status-chip"><em>' + esc(BOOKING_STATUS[key]) + '</em><strong>' + (status[key] || 0) + '</strong></span>';
  }).join('');

  var recent = (source.bookings || []).slice(0, 8);
  var recentRows = recent.length
    ? recent.map(function (b) {
        return '<tr><td>' + fmtDate(b.preferred_date) + ' <span class="muted small">' + esc(b.preferred_time) + '</span></td>' +
          '<td>' + esc(b.program_title) + '</td>' +
          '<td class="muted small">' + esc(b.booker_name || '') + '</td>' +
          '<td>' + badge(BOOKING_STATUS[b.status] || b.status, b.status === 'completed' ? 'green' : b.status === 'canceled' || b.status === 'noshow' ? 'red' : 'yellow') + '</td>' +
          '<td>' + (Number(b.final_amount) > 0 ? fmtKRW(b.final_amount) : '상담 확정') + '</td></tr>';
      }).join('')
    : emptyRow(5, '아직 예약이 없습니다.');

  var recentMembers = (source.profiles || []).slice(0, 6);
  var memberRows = recentMembers.length
    ? recentMembers.map(function (p) {
        return '<tr><td>' + esc(p.full_name || '-') + '</td><td class="muted small">' + esc(p.email || '') + '</td>' +
          '<td>' + esc(ROLES[p.role] || p.role || '') + '</td><td>' + esc(p.member_grade || '') + '</td>' +
          '<td class="muted small">' + fmtDate(p.created_at) + '</td></tr>';
      }).join('')
    : emptyRow(5, '회원이 없습니다.');

  var html =
    '<section class="admin-section">' +
      '<div class="admin-toolbar">' +
        '<div class="seg-group">' + periodBar + '</div>' +
        '<span class="action-spacer"></span>' +
        '<span class="muted small">' + esc(range.start) + ' ~ ' + esc(range.end) + '</span>' +
      '</div>' +
      customForm +
      '<div class="stat-grid stat-grid-5">' +
        statCard('전체 회원', metrics.totalMembers + '명', '탈퇴 제외', 'navy') +
        statCard('신규 회원', metrics.newMembers + '명', '선택 기간 가입', 'gold') +
        statCard('전체 예약', metrics.totalBookings + '건', '취소 제외', 'ivory') +
        statCard('오늘 예약', metrics.todayBookings + '건', fmtDate(todayStr()), 'yellow') +
        statCard('검사 진행', metrics.checksInProgress + '건', '대기 + 확정', 'ivory') +
        statCard('뉴로피드백 이용', metrics.neuroUsed + '회', '선택 기간 훈련 기록', 'ivory') +
        statCard('프로그램 판매', metrics.programSales + '건', '검사 외 프로그램', 'ivory') +
        statCard('전체 매출', fmtKRW(metrics.revenue), '결제 완료 기준 · 환불 ' + fmtKRW(metrics.refund), 'navy') +
        statCard('제휴 기관', metrics.partnerOrgs + '곳', '운영 중 기관', 'gold') +
        statCard('교육 신청자', metrics.academyApplicants + '명', '선택 기간 접수', 'yellow') +
      '</div>' +
      '<div class="status-chips">' + statusChips + '</div>' +
      noticeBox('모든 수치는 실제 DB 집계입니다. 매출은 <code>payments.status = paid</code> 금액만 합산하며, 환불액은 별도로 표시합니다.', 'neutral') +
    '</section>' +

    '<section class="admin-section">' +
      '<h2 class="admin-h2">월별 매출</h2>' +
      '<div class="chart-card"><div class="chart-wrap chart-wrap-tall"><canvas id="ov-chart"></canvas></div>' +
      '<p class="chart-caption">최근 6개월 · 결제 완료 금액(원)</p></div>' +
    '</section>' +

    '<section class="admin-section">' +
      '<h2 class="admin-h2">최근 예약</h2>' +
      table(['일시', '프로그램', '예약자', '상태', '금액'], recentRows) +
    '</section>' +

    '<section class="admin-section">' +
      '<h2 class="admin-h2">최근 가입 회원</h2>' +
      table(['이름', '이메일', '권한', '등급', '가입일'], memberRows) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var apply = el.querySelector('#ov-apply');
      if (apply) {
        apply.addEventListener('click', function () {
          var start = el.querySelector('#ov-start').value;
          var end = el.querySelector('#ov-end').value;
          if (!start || !end) return;
          window.location.hash = '#/admin/overview?period=custom&start=' + start + '&end=' + end;
        });
      }

      var canvas = el.querySelector('#ov-chart');
      if (canvas && window.Chart) {
        var options = chartBaseOptions();
        options.plugins.legend.display = false;
        options.scales.y.ticks.callback = function (value) {
          return Number(value).toLocaleString('ko-KR');
        };
        new window.Chart(canvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: revenueSeries.labels,
            datasets: [{
              label: '매출',
              data: revenueSeries.totals,
              backgroundColor: 'rgba(201, 169, 110, 0.85)',
              borderRadius: 8,
              maxBarThickness: 42
            }]
          },
          options: options
        });
      } else if (canvas) {
        canvas.parentNode.innerHTML = '<p class="muted small">차트 라이브러리를 불러오지 못했습니다.</p>';
      }
    }
  };
}
