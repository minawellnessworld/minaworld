/* 관리자 → 보안 · 감사 로그(PART 6): 누가 언제 무엇을 조회/변경했는지 */
import { ROLES } from '../../config.js?v=2.0.24';
import { friendlyError } from '../../store.js?v=2.0.24';
import { listAuditLogs, auditActionLabel } from '../../store-security.js?v=2.0.24';
import { icon, esc, fmtDateTime, badge, noticeBox, emptyState } from '../../ui.js?v=2.0.24';

function table(headers, rows) {
  return '<div class="table-scroll"><table class="data-table"><thead><tr>' +
    headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function emptyRow(cols, text) {
  return '<tr><td colspan="' + cols + '" class="table-empty">' + esc(text) + '</td></tr>';
}

function roleTone(role) {
  if (role === 'admin' || role === 'super_admin') return 'navy';
  if (role === 'partner_admin' || role === 'staff') return 'gold';
  return 'neutral';
}

export async function build(ctx) {
  var search = ctx.query.get('q') || '';
  var logs = [];
  var error = '';
  try {
    logs = await listAuditLogs({ limit: 300, search: search });
  } catch (err) {
    error = friendlyError(err);
  }

  var rows = logs.map(function (log) {
    var detail = '';
    try {
      detail = JSON.stringify(log.detail || {});
      if (detail.length > 90) detail = detail.slice(0, 90) + '…';
    } catch (err) { detail = ''; }
    return '<tr>' +
      '<td class="muted small nowrap">' + fmtDateTime(log.created_at) + '</td>' +
      '<td class="muted small">' + esc(log.actor_email || (log.actor_id ? String(log.actor_id).slice(0, 8) : '시스템')) +
        '<br>' + badge(ROLES[log.actor_role] || log.actor_role || '-', roleTone(log.actor_role)) + '</td>' +
      '<td><strong>' + esc(auditActionLabel(log.action)) + '</strong><br><span class="muted small">' + esc(log.action) + '</span></td>' +
      '<td class="muted small">' + esc(log.target_table || '-') + '<br>' + esc(log.target_id || '') + '</td>' +
      '<td class="muted small mono">' + esc(detail) + '</td>' +
    '</tr>';
  }).join('');

  var html =
    (error ? noticeBox(esc(error), 'warn') : '') +
    '<section class="admin-section">' +
      '<div class="admin-toolbar">' +
        '<input type="search" id="audit-search" placeholder="행위자 · 액션 · 대상 검색" value="' + esc(search) + '">' +
        '<span class="muted small">최근 ' + logs.length + '건</span>' +
      '</div>' +
      table(['시각', '행위자', '액션', '대상', '상세'], rows || emptyRow(5, '아직 감사 로그가 없습니다. 관리자·기관 작업이 기록되면 이곳에 쌓입니다.')) +
      noticeBox('감사 로그는 관리자·기관 관리자만 조회할 수 있습니다(RLS: 전체 관리자 전체, 기관 관리자는 자기 기관만). 회원 개인정보 원문은 기록하지 않습니다.', 'neutral') +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">기록되는 주요 이벤트</h2>' +
      '<div class="audit-legend">' +
        ['member_status_changed', 'booking_status_changed', 'result_created', 'result_visibility_changed',
          'org_account_issued', 'staff_permissions_changed', 'settlement_created', 'settlement_paid',
          'content_created', 'account_withdrawn', 'mfa_verified'].map(function (action) {
          return '<span class="perm-chip">' + esc(auditActionLabel(action)) + '</span>';
        }).join('') +
      '</div>' +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var input = el.querySelector('#audit-search');
      var timer = null;
      input.addEventListener('input', function () {
        var value = this.value.trim();
        clearTimeout(timer);
        timer = setTimeout(function () {
          window.location.hash = '#/admin/audit' + (value ? '?q=' + encodeURIComponent(value) : '');
        }, 400);
      });
    }
  };
}
