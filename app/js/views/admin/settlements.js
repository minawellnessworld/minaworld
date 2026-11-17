/* 관리자 → 제휴 기관 정산: payments(paid/refunded) + 기관 수수료율 기반 정산 생성·완료·CSV */
import { SETTLEMENT_STATUS } from '../../config.js?v=2.0.5';
import { state, listPayments, listOrganizations, friendlyError, todayStr } from '../../store.js?v=2.0.5';
import { listSettlements, settlementTotals, createSettlement, markSettlementPaid } from '../../store-org.js?v=2.0.5';
import { logAudit } from '../../store-security.js?v=2.0.5';
import { icon, esc, fmtKRW, fmtDate, toast, badge, setBusy, downloadCsv, noticeBox, confirmDialog } from '../../ui.js?v=2.0.5';

function opt(value, label, selected) {
  return '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(label) + '</option>';
}

function table(headers, rows) {
  return '<div class="table-scroll"><table class="data-table"><thead><tr>' +
    headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function emptyRow(cols, text) {
  return '<tr><td colspan="' + cols + '" class="table-empty">' + esc(text) + '</td></tr>';
}

function statCard(label, value, sub, tone) {
  return '<div class="stat-card tone-' + (tone || 'ivory') + '">' +
    '<span class="stat-label">' + esc(label) + '</span>' +
    '<strong class="stat-value">' + esc(value) + '</strong>' +
    (sub ? '<span class="stat-sub">' + esc(sub) + '</span>' : '') +
  '</div>';
}

export async function build(ctx) {
  var month = ctx.query.get('month') || todayStr().slice(0, 7);
  var orgFilter = ctx.query.get('org') || '';

  var orgs = [];
  var payments = [];
  var settlements = [];
  try {
    var loaded = await Promise.all([listOrganizations(), listPayments(), listSettlements()]);
    orgs = loaded[0] || [];
    payments = loaded[1] || [];
    settlements = loaded[2] || [];
  } catch (err) {
    console.warn(err);
  }

  var monthPayments = payments.filter(function (p) { return String(p.created_at || '').slice(0, 7) === month; });

  var previewRows = orgs.map(function (o) {
    var scoped = monthPayments.filter(function (p) { return String(p.org_id || '') === String(o.id); });
    var totals = settlementTotals(scoped, o.commission_rate);
    var existing = settlements.filter(function (s) { return String(s.org_id) === String(o.id) && s.period_month === month; })[0];
    return '<tr>' +
      '<td><strong>' + esc(o.name) + '</strong><br><span class="muted small">' + esc(o.status) + '</span></td>' +
      '<td>' + fmtKRW(totals.gross) + '<br><span class="muted small">' + totals.count + '건</span></td>' +
      '<td>' + fmtKRW(totals.refund) + '</td>' +
      '<td>' + Number(totals.commission_rate) + '%<br><span class="muted small">' + fmtKRW(totals.commission) + '</span></td>' +
      '<td><strong>' + fmtKRW(totals.net) + '</strong></td>' +
      '<td>' + (existing
        ? badge(SETTLEMENT_STATUS[existing.status] || existing.status, existing.status === 'paid' ? 'green' : 'yellow')
        : '<button type="button" class="btn btn-ghost btn-xs" data-create="' + esc(o.id) + '" data-rate="' + Number(o.commission_rate || 0) + '">정산 생성</button>') +
      '</td></tr>';
  }).join('');

  var scopedSettlements = settlements.filter(function (s) {
    if (orgFilter && String(s.org_id) !== String(orgFilter)) return false;
    if (month && s.period_month !== month && ctx.query.get('all') !== '1') return false;
    return true;
  });

  var settlementRows = scopedSettlements.map(function (s) {
    var orgName = '';
    for (var i = 0; i < orgs.length; i++) if (String(orgs[i].id) === String(s.org_id)) orgName = orgs[i].name;
    return '<tr>' +
      '<td>' + esc(s.period_month) + '</td>' +
      '<td>' + esc(orgName || '기관') + '</td>' +
      '<td>' + fmtKRW(s.gross_amount) + '</td>' +
      '<td>' + fmtKRW(s.refund_amount) + '</td>' +
      '<td>' + fmtKRW(s.commission_amount) + ' <span class="muted small">(' + Number(s.commission_rate) + '%)</span></td>' +
      '<td><strong>' + fmtKRW(s.net_payout) + '</strong></td>' +
      '<td>' + badge(SETTLEMENT_STATUS[s.status] || s.status, s.status === 'paid' ? 'green' : 'yellow') +
        (s.paid_at ? '<br><span class="muted small">' + fmtDate(s.paid_at) + '</span>' : '') + '</td>' +
      '<td>' + (s.status !== 'paid' ? '<button type="button" class="btn btn-ghost btn-xs" data-paid="' + esc(s.id) + '">정산 완료</button>' : '') + '</td>' +
    '</tr>';
  }).join('');

  var scheduledTotal = settlements.filter(function (s) { return s.status === 'scheduled'; }).reduce(function (sum, s) { return sum + Number(s.net_payout || 0); }, 0);
  var paidTotal = settlements.filter(function (s) { return s.status === 'paid'; }).reduce(function (sum, s) { return sum + Number(s.net_payout || 0); }, 0);

  var html =
    '<div class="stat-grid">' +
      statCard('정산 예정 합계', fmtKRW(scheduledTotal), settlements.filter(function (s) { return s.status === 'scheduled'; }).length + '건', 'yellow') +
      statCard('정산 완료 합계', fmtKRW(paidTotal), settlements.filter(function (s) { return s.status === 'paid'; }).length + '건', 'navy') +
      statCard('이번 달 결제 완료', fmtKRW(monthPayments.filter(function (p) { return p.status === 'paid'; }).reduce(function (sum, p) { return sum + Number(p.amount || 0); }, 0)), month, 'ivory') +
    '</div>' +
    '<section class="admin-section">' +
      '<div class="admin-toolbar">' +
        '<label class="field-compact"><span>정산 월</span><input type="month" id="st-month" value="' + esc(month) + '"></label>' +
        '<select id="st-org"><option value="">전체 기관</option>' + orgs.map(function (o) { return opt(o.id, o.name, orgFilter); }).join('') + '</select>' +
        '<span class="action-spacer"></span>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="st-csv">CSV 다운로드</button>' +
      '</div>' +
      '<h2 class="admin-h2">' + esc(month) + ' 기관별 정산 예정</h2>' +
      table(['기관', '결제 완료 매출', '환불', '수수료', '정산 예정액', ''], previewRows || emptyRow(6, '등록된 기관이 없습니다.')) +
      noticeBox('정산 금액은 실제 <code>payments</code> 의 결제 완료·환불 금액과 기관별 수수료율로만 계산합니다. 임의 금액을 만들지 않습니다.', 'neutral') +
    '</section>' +
    '<section class="admin-section">' +
      '<div class="admin-toolbar"><h2 class="admin-h2" style="margin:0">정산 기록</h2>' +
        '<span class="action-spacer"></span>' +
        '<a class="btn btn-ghost btn-sm" href="#/admin/settlements?month=' + esc(month) + '&all=1">전체 기간 보기</a></div>' +
      table(['정산 월', '기관', '매출', '환불', '수수료', '지급액', '상태', ''], settlementRows || emptyRow(8, '생성된 정산이 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var monthEl = el.querySelector('#st-month');
      var orgEl = el.querySelector('#st-org');
      function navigate() {
        var base = '#/admin/settlements?month=' + (monthEl.value || month);
        if (orgEl.value) base += '&org=' + orgEl.value;
        window.location.hash = base;
      }
      monthEl.addEventListener('change', navigate);
      orgEl.addEventListener('change', navigate);

      var csvBtn = el.querySelector('#st-csv');
      csvBtn.addEventListener('click', function () {
        if (!scopedSettlements.length) { toast('내려받을 정산 내역이 없습니다.'); return; }
        downloadCsv('mina-settlements-' + month + '-' + todayStr() + '.csv',
          ['정산 월', '기관', '매출(원)', '환불(원)', '수수료율(%)', '수수료(원)', '지급액(원)', '상태', '지급일', '비고'],
          scopedSettlements.map(function (s) {
            var orgName = '';
            for (var i = 0; i < orgs.length; i++) if (String(orgs[i].id) === String(s.org_id)) orgName = orgs[i].name;
            return [s.period_month, orgName, s.gross_amount, s.refund_amount, s.commission_rate, s.commission_amount, s.net_payout, SETTLEMENT_STATUS[s.status] || s.status, s.paid_at ? fmtDate(s.paid_at) : '', s.note || ''];
          })
        );
      });

      var createButtons = el.querySelectorAll('[data-create]');
      for (var i = 0; i < createButtons.length; i++) {
        createButtons[i].addEventListener('click', async function () {
          var orgId = this.getAttribute('data-create');
          var rate = Number(this.getAttribute('data-rate'));
          setBusy(this, true, '생성 중');
          try {
            await createSettlement(orgId, month, rate, '');
            await logAudit({ action: 'settlement_created', target_table: 'settlements', target_id: month, detail: { org_id: orgId } });
            toast(month + ' 정산이 생성되었습니다.', 'success');
            window.location.hash = '#/admin/settlements?month=' + month + (orgFilter ? '&org=' + orgFilter : '') + '&r=' + Date.now();
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(this, false);
          }
        });
      }

      var paidButtons = el.querySelectorAll('[data-paid]');
      for (var p = 0; p < paidButtons.length; p++) {
        paidButtons[p].addEventListener('click', async function () {
          var ok = await confirmDialog({ title: '정산 완료 처리', message: '지급 완료로 표시하고 지급일을 기록합니다. 계속할까요?', confirmLabel: '완료 처리', danger: false });
          if (!ok) return;
          try {
            await markSettlementPaid(this.getAttribute('data-paid'));
            await logAudit({ action: 'settlement_paid', target_table: 'settlements', target_id: this.getAttribute('data-paid'), detail: {} });
            toast('정산 완료로 처리되었습니다.', 'success');
            window.location.hash = '#/admin/settlements?month=' + month + '&all=1&r=' + Date.now();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }
    }
  };
}
