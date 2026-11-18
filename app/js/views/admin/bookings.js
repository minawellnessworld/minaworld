/* 관리자 → 예약 관리: 일별 / 주별 / 월별 전환 + 지점·담당자 필터 + 상태 5종 + 직접 등록 */
import { BOOKING_STATUS } from '../../config.js?v=2.0.20';
import { state, listBookings, listProfiles, adminSetBookingStatus, friendlyError, todayStr } from '../../store.js?v=2.0.20';
import { listOrganizationsFiltered, listBranchesForOrg } from '../../store-org.js?v=2.0.20';
import { logAudit } from '../../store-security.js?v=2.0.20';
import { openAdminBookingModal } from '../../booking.js?v=2.0.20';
import { icon, esc, fmtKRW, toast, badge, noticeBox, emptyState } from '../../ui.js?v=2.0.20';

function opt(value, label, selected) {
  return '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(label) + '</option>';
}

function ymd(d) {
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}

function parseDate(text) {
  var d = new Date(String(text) + 'T00:00:00');
  return isNaN(d.getTime()) ? new Date() : d;
}

function addDays(date, days) {
  var d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function statusTone(status) {
  if (status === 'completed') return 'green';
  if (status === 'canceled' || status === 'noshow') return 'red';
  if (status === 'confirmed') return 'navy';
  return 'yellow';
}

function tabLink(view, date, org) {
  return '#/admin/bookings?view=' + view + '&date=' + date + (org ? '&org=' + org : '');
}

export async function build(ctx) {
  var view = ctx.query.get('view') || 'month';
  if (['day', 'week', 'month'].indexOf(view) < 0) view = 'month';
  var anchor = ctx.query.get('date') || todayStr();
  var orgFilter = ctx.query.get('org') || '';
  var counselorFilter = ctx.query.get('staff') || '';

  var bookings = [];
  var orgs = [];
  var branches = [];
  var profiles = [];
  try {
    bookings = await listBookings();
    orgs = await listOrganizationsFiltered();
    var allBranches = await Promise.all((orgs || []).map(function (o) { return listBranchesForOrg(o.id); }));
    allBranches.forEach(function (rows) { branches = branches.concat(rows || []); });
    profiles = await listProfiles();
  } catch (err) {
    console.warn('[MINA] 예약 데이터 조회 실패', err);
  }

  var scoped = bookings.filter(function (b) {
    if (orgFilter && String(b.org_id || '') !== String(orgFilter)) return false;
    if (counselorFilter && String(b.counselor_name || '') !== String(counselorFilter)) return false;
    return true;
  });

  var byDate = {};
  scoped.forEach(function (b) {
    var key = String(b.preferred_date || '').slice(0, 10);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(b);
  });

  var orgOptions = '<option value="">전체 지점</option>' + (orgs || []).map(function (o) {
    return opt(o.id, o.name, orgFilter);
  }).join('');

  var counselorNames = [];
  scoped.forEach(function (b) {
    var name = b.counselor_name || '';
    if (name && counselorNames.indexOf(name) < 0) counselorNames.push(name);
  });
  var staffOptions = '<option value="">전체 담당자</option>' + counselorNames.map(function (name) {
    return opt(name, name, counselorFilter);
  }).join('');

  var body = '';

  if (view === 'month') {
    var base = parseDate(anchor + '-01');
    var first = new Date(base.getFullYear(), base.getMonth(), 1);
    var last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    var startPad = first.getDay();
    var cells = [];
    for (var p = 0; p < startPad; p++) cells.push(null);
    for (var d = 1; d <= last.getDate(); d++) cells.push(new Date(base.getFullYear(), base.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);

    var prevMonth = new Date(base.getFullYear(), base.getMonth() - 1, 1);
    var nextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    var weeks = [];
    for (var w = 0; w < cells.length; w += 7) weeks.push(cells.slice(w, w + 7));

    body =
      '<div class="cal-head">' +
        '<a class="icon-btn" href="#/admin/bookings?view=month&date=' + ymd(prevMonth) + (orgFilter ? '&org=' + orgFilter : '') + '">' + icon('chevronLeft', 18) + '</a>' +
        '<strong>' + base.getFullYear() + '년 ' + (base.getMonth() + 1) + '월</strong>' +
        '<a class="icon-btn" href="#/admin/bookings?view=month&date=' + ymd(nextMonth) + (orgFilter ? '&org=' + orgFilter : '') + '">' + icon('chevronRight', 18) + '</a>' +
      '</div>' +
      '<div class="cal-grid cal-grid-head">' +
        ['일', '월', '화', '수', '목', '금', '토'].map(function (d2) { return '<span>' + d2 + '</span>'; }).join('') +
      '</div>' +
      '<div class="cal-grid">' +
        weeks.map(function (week) {
          return week.map(function (day) {
            if (!day) return '<div class="cal-cell is-empty"></div>';
            var key = ymd(day);
            var rows = byDate[key] || [];
            var counts = { pending: 0, confirmed: 0, completed: 0, canceled: 0, noshow: 0 };
            rows.forEach(function (b) { counts[b.status] = (counts[b.status] || 0) + 1; });
            var isToday = key === todayStr();
            return '<a class="cal-cell' + (isToday ? ' is-today' : '') + (rows.length ? ' has-booking' : '') + '" href="' + tabLink('day', key, orgFilter) + '">' +
              '<span class="cal-num">' + day.getDate() + '</span>' +
              (rows.length
                ? '<span class="cal-count">' + rows.length + '</span>' +
                  '<span class="cal-dots">' +
                    ['pending', 'confirmed', 'completed', 'canceled', 'noshow'].map(function (k) {
                      return counts[k] ? '<i class="dot dot-' + k + '" title="' + esc(BOOKING_STATUS[k]) + ' ' + counts[k] + '"></i>' : '';
                    }).join('') +
                  '</span>'
                : '') +
            '</a>';
          }).join('');
        }).join('') +
      '</div>' +
      '<div class="cal-legend">' +
        ['pending', 'confirmed', 'completed', 'canceled', 'noshow'].map(function (k) {
          return '<span><i class="dot dot-' + k + '"></i>' + esc(BOOKING_STATUS[k]) + '</span>';
        }).join('') +
      '</div>';
  } else if (view === 'week') {
    var anchorDate = parseDate(anchor);
    var weekStart = addDays(anchorDate, -anchorDate.getDay());
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(weekStart, i));
    body =
      '<div class="cal-head">' +
        '<a class="icon-btn" href="' + tabLink('week', ymd(addDays(weekStart, -7)), orgFilter) + '">' + icon('chevronLeft', 18) + '</a>' +
        '<strong>' + ymd(days[0]) + ' ~ ' + ymd(days[6]) + '</strong>' +
        '<a class="icon-btn" href="' + tabLink('week', ymd(addDays(weekStart, 7)), orgFilter) + '">' + icon('chevronRight', 18) + '</a>' +
      '</div>' +
      '<div class="week-grid">' +
        days.map(function (day) {
          var key = ymd(day);
          var rows = (byDate[key] || []).slice().sort(function (a, b) {
            return String(a.preferred_time).localeCompare(String(b.preferred_time));
          });
          return '<div class="week-col' + (key === todayStr() ? ' is-today' : '') + '">' +
            '<div class="week-col-head"><strong>' + ('0' + (day.getMonth() + 1)).slice(-2) + '.' + ('0' + day.getDate()).slice(-2) + '</strong>' +
              '<em>' + ['일', '월', '화', '수', '목', '금', '토'][day.getDay()] + '</em></div>' +
            (rows.length
              ? rows.map(function (b) {
                  return '<button type="button" class="week-item tone-' + statusTone(b.status) + '" data-bk="' + esc(b.id) + '">' +
                    '<span class="week-time">' + esc(b.preferred_time) + '</span>' +
                    '<span class="week-title">' + esc(b.program_title) + '</span>' +
                    '<span class="week-sub">' + esc(b.booker_name || '') + '</span>' +
                  '</button>';
                }).join('')
              : '<p class="week-empty">예약 없음</p>') +
          '</div>';
        }).join('') +
      '</div>';
  } else {
    var dayKey = anchor;
    var dayRows = (byDate[dayKey] || []).slice().sort(function (a, b) {
      return String(a.preferred_time).localeCompare(String(b.preferred_time));
    });
    var prev = addDays(parseDate(dayKey), -1);
    var next = addDays(parseDate(dayKey), 1);
    body =
      '<div class="cal-head">' +
        '<a class="icon-btn" href="' + tabLink('day', ymd(prev), orgFilter) + '">' + icon('chevronLeft', 18) + '</a>' +
        '<strong>' + dayKey + '</strong>' +
        '<a class="icon-btn" href="' + tabLink('day', ymd(next), orgFilter) + '">' + icon('chevronRight', 18) + '</a>' +
      '</div>' +
      (dayRows.length
        ? '<div class="day-list">' + dayRows.map(function (b) {
            return '<div class="day-row" data-booking="' + esc(b.id) + '">' +
              '<span class="day-time">' + esc(b.preferred_time) + '</span>' +
              '<div class="day-body"><strong>' + esc(b.program_title) + '</strong>' +
                '<span class="muted small">' + esc(b.booker_name || '') + ' · ' + esc(b.booker_phone || '') +
                  (b.branch_name ? ' · ' + esc(b.branch_name) : '') + '</span></div>' +
              '<div class="day-actions">' +
                '<select data-bstatus="' + esc(b.id) + '">' + Object.keys(BOOKING_STATUS).map(function (s) {
                  return opt(s, BOOKING_STATUS[s], b.status);
                }).join('') + '</select>' +
                '<span class="muted small">' + (Number(b.final_amount) > 0 ? fmtKRW(b.final_amount) : '상담 확정') + '</span>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>'
        : emptyState({ icon: 'calendar', title: '이 날짜에는 예약이 없습니다', desc: '다른 날짜를 선택하거나 예약을 직접 등록할 수 있습니다.' })) +
      '<div class="footer-actions"><button type="button" class="btn btn-primary btn-sm" id="bk-new">예약 직접 등록</button></div>';
  }

  var html =
    '<section class="admin-section">' +
      '<div class="admin-toolbar">' +
        '<div class="seg-group">' +
          '<a class="seg-btn' + (view === 'day' ? ' is-on' : '') + '" href="' + tabLink('day', anchor, orgFilter) + '">일별</a>' +
          '<a class="seg-btn' + (view === 'week' ? ' is-on' : '') + '" href="' + tabLink('week', anchor, orgFilter) + '">주별</a>' +
          '<a class="seg-btn' + (view === 'month' ? ' is-on' : '') + '" href="' + tabLink('month', anchor, orgFilter) + '">월별</a>' +
        '</div>' +
        '<span class="action-spacer"></span>' +
        '<a class="btn btn-ghost btn-sm" href="#/admin/bookings?view=day&date=' + todayStr() + '">오늘</a>' +
        '<button type="button" class="btn btn-primary btn-sm" id="bk-new-top">예약 등록</button>' +
      '</div>' +
      '<div class="admin-toolbar">' +
        '<select id="bk-org">' + orgOptions + '</select>' +
        '<select id="bk-staff">' + staffOptions + '</select>' +
        '<span class="muted small">표시 ' + scoped.length + '건 / 전체 ' + bookings.length + '건</span>' +
      '</div>' +
      body +
      noticeBox('예약 상태 5종(예약 대기 · 예약 확정 · 방문 완료 · 취소 · 노쇼)을 바로 변경할 수 있습니다. 노쇼는 정산·매출에 포함되지 않습니다.', 'neutral') +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var orgSel = el.querySelector('#bk-org');
      if (orgSel) {
        orgSel.addEventListener('change', function () {
          var base = '#/admin/bookings?view=' + view + '&date=' + anchor;
          if (this.value) base += '&org=' + this.value;
          window.location.hash = base;
        });
      }
      var staffSel = el.querySelector('#bk-staff');
      if (staffSel) {
        staffSel.addEventListener('change', function () {
          var base = '#/admin/bookings?view=' + view + '&date=' + anchor;
          if (orgFilter) base += '&org=' + orgFilter;
          if (this.value) base += '&staff=' + encodeURIComponent(this.value);
          window.location.hash = base;
        });
      }

      var newTop = el.querySelector('#bk-new-top');
      if (newTop) newTop.addEventListener('click', function () { openAdminBookingModal({ onDone: function () { window.location.hash = '#/admin/bookings?view=day&date=' + todayStr(); } }); });
      var newBottom = el.querySelector('#bk-new');
      if (newBottom) newBottom.addEventListener('click', function () { openAdminBookingModal({ onDone: function () { window.location.hash = '#/admin/bookings?view=day&date=' + anchor; } }); });

      var selects = el.querySelectorAll('[data-bstatus]');
      for (var i = 0; i < selects.length; i++) {
        selects[i].addEventListener('change', async function () {
          var id = this.getAttribute('data-bstatus');
          var value = this.value;
          try {
            await adminSetBookingStatus(id, value);
            await logAudit({ action: 'booking_status_changed', target_table: 'bookings', target_id: id, detail: { status: value } });
            toast('예약 상태가 ' + (BOOKING_STATUS[value] || value) + '(으)로 변경되었습니다.', 'success');
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
        });
      }

      var weekItems = el.querySelectorAll('[data-bk]');
      for (var w = 0; w < weekItems.length; w++) {
        weekItems[w].addEventListener('click', function () {
          var id = this.getAttribute('data-bk');
          var target = null;
          for (var k = 0; k < scoped.length; k++) if (String(scoped[k].id) === String(id)) target = scoped[k];
          if (!target) return;
          var dateKey = String(target.preferred_date).slice(0, 10);
          window.location.hash = '#/admin/bookings?view=day&date=' + dateKey + (orgFilter ? '&org=' + orgFilter : '');
        });
      }
    }
  };
}
