/* PART 4 — 제휴 기관 전용 대시보드 (#/partner)
   partner_admin · staff 로그인 시 진입.
   - 자기 org_id 데이터만 요청 (타 기관 데이터는 서버 RLS로도 0건)
   - 직원은 부여된 권한 메뉴만 렌더링 (미허용 탭 접근 차단) */
import {
  ORG_TYPES, BOOKING_STATUS, SETTLEMENT_STATUS, MEMBERSHIP_STATUS,
  STAFF_PERMISSIONS, STAFF_ROLE_OPTIONS, CHECK_TYPES, ROLES, WEEKDAYS,
  hasPermission, staffPermissionLabels
} from '../config.js?v=2.0.22';
import { editorHtml, bindEditor, fillItemsDetailed } from '../check-items.js?v=2.0.22';
import { bindPdfAutofill } from '../pdf-parser.js?v=2.0.22';
import {
  state, isAdmin, isOrgAdmin, myOrgId, friendlyError, todayStr,
  listProfiles, listBookings, adminSetBookingStatus, listResults, adminSaveResult, uploadResultFile,
  adminUpdateProfile
} from '../store.js?v=2.0.22';
import {
  getPartnerMetrics, listOrgMemberships, updateMembership, requestResultAccess,
  issueStaffAccount, issueOrgMemberAccount, listPreAssignments, deletePreAssignment,
  listOrgSchedules, saveSchedule, deleteSchedule, listBranchesForOrg, saveBranch,
  listOrgPrograms, saveOrgProgram, setOrgProgramActive,
  listOrgPayments, settlementTotals, listSettlements, createSettlement, markSettlementPaid,
  listOrgResults, listOrgBookings,
  getOrganization
} from '../store-org.js?v=2.0.22';
import { logAudit } from '../store-security.js?v=2.0.22';
import { openAdminBookingModal } from '../booking.js?v=2.0.22';
import {
  icon, esc, fmtKRW, fmtDate, fmtDateTime, toast, emptyState, noticeBox, badge,
  openSheet, closeSheet, confirmDialog, setBusy, downloadCsv, loadingBlock
} from '../ui.js?v=2.0.22';

function opt(value, label, selected) {
  return '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(label) + '</option>';
}

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

function memberName(profiles, id) {
  for (var i = 0; i < (profiles || []).length; i++) {
    if (String(profiles[i].id) === String(id)) return (profiles[i].full_name || '') + ' (' + (profiles[i].email || '') + ')';
  }
  return '회원 ' + String(id || '').slice(0, 8);
}

function permCheckboxes(selected, prefix) {
  var perms = selected || {};
  return '<div class="perm-grid">' + STAFF_PERMISSIONS.map(function (p) {
    return '<label class="perm-item"><input type="checkbox" data-perm="' + p.key + '"' +
      (perms[p.key] ? ' checked' : '') + '><span><strong>' + esc(p.label) + '</strong><em>' + esc(p.desc) + '</em></span></label>';
  }).join('') + '</div>';
}

/* ------------------------------------------------------------- 대시보드 */
async function buildDashboard(org) {
  var metrics = await getPartnerMetrics(org.id);
  var bookings = [];
  try { bookings = await listOrgBookings(org.id); } catch (err) { bookings = []; }
  var mine = bookings.filter(function (b) { return String(b.org_id) === String(org.id); }).slice(0, 8);
  var staffRows = metrics.staffStats.length
    ? metrics.staffStats.map(function (s) {
        return '<tr><td><strong>' + esc(s.name) + '</strong></td><td>' + s.bookings + '건</td>' +
          '<td>' + s.completed + '건</td>' +
          '<td>' + (s.bookings ? Math.round(s.completed / s.bookings * 100) : 0) + '%</td></tr>';
      }).join('')
    : emptyRow(4, '아직 담당자별 예약 실적이 없습니다.');

  var html =
    '<div class="stat-grid stat-grid-4">' +
      statCard('기관 소속 회원', metrics.members + '명', '최근 30일 신규 ' + metrics.newMembers + '명', 'navy') +
      statCard('검사 예약 / 완료', metrics.checkBookings + ' / ' + metrics.checkCompleted + '건', '오늘 예약 ' + metrics.todayBookings + '건', 'yellow') +
      statCard('뉴로피드백 진행', metrics.neuroSessions + '회', '프로그램 이용 ' + metrics.programUses + '건', 'ivory') +
      statCard('기관 매출 (누적)', fmtKRW(metrics.revenue), '환불 ' + fmtKRW(metrics.refund), 'ivory') +
    '</div>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">담당자별 실적</h2>' +
      table(['담당자', '예약', '방문 완료', '완료율'], staffRows) +
      noticeBox('이 화면의 모든 수치는 <strong>' + esc(org.name) + '</strong> 데이터만 집계합니다. 타 기관 데이터는 서버 RLS 정책으로 조회되지 않습니다.', 'neutral') +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">최근 예약</h2>' +
      table(['일시', '프로그램', '회원', '상태'], mine.length
        ? mine.map(function (b) {
            return '<tr><td>' + fmtDate(b.preferred_date) + ' <span class="muted small">' + esc(b.preferred_time) + '</span></td>' +
              '<td>' + esc(b.program_title) + '</td>' +
              '<td class="muted small">' + esc(b.booker_name || '') + '</td>' +
              '<td>' + badge(BOOKING_STATUS[b.status] || b.status, b.status === 'completed' ? 'green' : b.status === 'canceled' ? 'red' : 'yellow') + '</td></tr>';
          }).join('')
        : emptyRow(4, '기관 예약이 없습니다.')) +
    '</section>';

  return { html: html, bind: function () {} };
}

/* --------------------------------------------------------------- 회원 관리 */
async function buildMembers(org) {
  var memberships = await listOrgMemberships(org.id);
  var profiles = [];
  try { profiles = await listProfiles(); } catch (err) { profiles = []; }
  var preAssignments = [];
  try { preAssignments = await listPreAssignments(org.id); } catch (err) { preAssignments = []; }
  var canWrite = hasPermission(state.profile, 'members') && (isOrgAdmin() || isAdmin());

  var pending = memberships.filter(function (m) { return m.status === 'pending'; });

  var rows = memberships.map(function (m) {
    var p = m.profiles || {};
    var shareOn = Boolean(m.share_brain_results);
    return '<tr data-membership="' + esc(m.id) + '">' +
      '<td><strong>' + esc(p.full_name || '(이름 없음)') + '</strong><br><span class="muted small">' + esc(p.email || '') + '</span>' +
        '<br><span class="muted small">' + esc(p.phone || '') + '</span></td>' +
      '<td>' + badge(MEMBERSHIP_STATUS[m.status] || m.status, m.status === 'approved' ? 'green' : m.status === 'rejected' ? 'red' : 'yellow') + '</td>' +
      '<td>' + (shareOn ? badge('공유 동의', 'green') : badge('미동의', 'neutral')) +
        (m.result_access_requested ? '<br><span class="muted small">열람 요청됨</span>' : '') + '</td>' +
      '<td class="muted small">' + fmtDate(m.created_at) + '</td>' +
      '<td>' +
        (m.status === 'pending' && canWrite
          ? '<button type="button" class="btn btn-ghost btn-xs" data-approve="' + esc(m.id) + '">소속 승인</button>' +
            '<button type="button" class="btn btn-ghost btn-xs btn-quiet-danger" data-reject="' + esc(m.id) + '">거절</button>'
          : '') +
        (shareOn
          ? '<button type="button" class="btn btn-ghost btn-xs" data-open-result="' + esc(m.user_id) + '">결과 보기</button>'
          : '<button type="button" class="btn btn-ghost btn-xs" data-request="' + esc(m.id) + '"' + (m.result_access_requested ? ' disabled' : '') + '>' +
            (m.result_access_requested ? '요청 완료' : '결과 열람 요청') + '</button>') +
      '</td>' +
    '</tr>';
  }).join('');

  var preRows = preAssignments.length
    ? preAssignments.map(function (a) {
        return '<tr><td>' + esc(a.full_name || '-') + '</td><td class="muted small">' + esc(a.email) + '</td>' +
          '<td>' + esc(ROLES[a.role] || a.role) + '</td>' +
          '<td class="muted small">' + fmtDate(a.created_at) + '</td>' +
          '<td><button type="button" class="btn btn-ghost btn-xs btn-quiet-danger" data-cancel-pre="' + esc(a.email) + '">취소</button></td></tr>';
      }).join('')
    : emptyRow(5, '대기 중인 사전 배정이 없습니다.');

  var html =
    '<section class="admin-section">' +
      '<h2 class="admin-h2">기관 신규 회원 등록</h2>' +
      noticeBox('계정을 즉시 발급합니다. 발급된 임시 비밀번호는 회원에게 전달해 주세요. 회원은 로그인 후 비밀번호를 변경할 수 있습니다.', 'neutral') +
      (canWrite
        ? '<div class="admin-form">' +
            '<div class="form-grid">' +
              '<label class="field"><span class="field-label">이름</span><input type="text" id="pm-name"></label>' +
              '<label class="field"><span class="field-label">이메일</span><input type="email" id="pm-email" placeholder="member@example.com"></label>' +
            '</div>' +
            '<div class="form-grid">' +
              '<label class="field"><span class="field-label">연락처</span><input type="tel" id="pm-phone"></label>' +
              '<label class="field"><span class="field-label">결과 공유 동의</span>' +
                '<select id="pm-share">' + opt('false', '동의 받지 않음(기본)', 'false') + opt('true', '동의 받음', 'false') + '</select></label>' +
            '</div>' +
            '<button type="button" class="btn btn-primary" id="pm-submit">회원 계정 즉시 발급</button>' +
          '</div>'
        : '') +
      (preAssignments.length
        ? '<h3 class="admin-h4">발급 대기(사전 배정) ' + preAssignments.length + '건</h3>' + table(['이름', '이메일', '역할', '등록일', ''], preRows)
        : '') +
    '</section>' +
    (pending.length
      ? '<section class="admin-section">' +
          '<h2 class="admin-h2">소속 승인 대기 ' + pending.length + '건</h2>' +
          noticeBox('회원이 기관 소속을 요청했거나 관리자가 사전 등록한 건입니다. 승인해야 기관 통계·결과 공유 대상에 포함됩니다.', 'warn') +
        '</section>'
      : '') +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">기관 소속 회원 (' + memberships.length + ')</h2>' +
      table(['회원', '소속 상태', '결과 공유', '등록일', ''], rows || emptyRow(5, '기관 소속 회원이 없습니다. 위에서 신규 회원을 등록해 보세요.')) +
      noticeBox('검사 결과는 회원이 <strong>결과 공유에 동의한 경우에만</strong> 표시됩니다. 미동의 회원은 "결과 열람 요청"만 보낼 수 있습니다. (DB RLS도 동일하게 차단)', 'neutral') +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var submit = el.querySelector('#pm-submit');
      if (submit) {
        submit.addEventListener('click', async function () {
          var email = el.querySelector('#pm-email').value.trim();
          var name = el.querySelector('#pm-name').value.trim();
          if (!email) { toast('이메일을 입력해 주세요.'); return; }
          setBusy(submit, true, '계정 발급 중');
          try {
            var result = await issueOrgMemberAccount({
              email: email,
              full_name: name,
              phone: el.querySelector('#pm-phone').value.trim(),
              share_brain_results: el.querySelector('#pm-share').value === 'true',
              org_id: org.id
            });
            await logAudit({ action: 'member_org_added', target_table: 'profiles', target_id: email, detail: { org_id: org.id } });
            openSheet({
              title: '회원 계정이 발급되었습니다',
              content: '<div class="summary-list">' +
                '<div class="summary-row"><span>이메일</span><strong>' + esc(result.email) + '</strong></div>' +
                '<div class="summary-row"><span>임시 비밀번호</span><strong class="mono">' + esc(result.tempPassword) + '</strong></div>' +
                '</div>' + noticeBox('이 임시 비밀번호는 다시 표시되지 않습니다. 회원에게 전달하고 첫 로그인 후 변경하도록 안내해 주세요.', 'warn') +
                (result.note ? noticeBox(esc(result.note), 'warn') : ''),
              footer: '<button type="button" class="btn btn-primary" data-close>확인</button>',
              onMount: function (sheet) {
                var c = sheet.querySelector('[data-close]');
                if (c) c.addEventListener('click', function () {
                  closeSheet();
                  refresh().catch(function (err) { console.warn(err); });
                });
              }
            });
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
          setBusy(submit, false);
        });
      }

      var approveButtons = el.querySelectorAll('[data-approve]');
      for (var i = 0; i < approveButtons.length; i++) {
        approveButtons[i].addEventListener('click', async function () {
          try {
            await updateMembership(this.getAttribute('data-approve'), { status: 'approved' });
            await logAudit({ action: 'membership_approved', target_table: 'org_memberships', target_id: this.getAttribute('data-approve'), detail: {} });
            toast('소속이 승인되었습니다.', 'success');
            await refresh();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }

      var rejectButtons = el.querySelectorAll('[data-reject]');
      for (var r = 0; r < rejectButtons.length; r++) {
        rejectButtons[r].addEventListener('click', async function () {
          try {
            await updateMembership(this.getAttribute('data-reject'), { status: 'rejected' });
            toast('소속 요청을 거절했습니다.', 'success');
            await refresh();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }

      var requestButtons = el.querySelectorAll('[data-request]');
      for (var q = 0; q < requestButtons.length; q++) {
        requestButtons[q].addEventListener('click', async function () {
          try {
            await requestResultAccess(this.getAttribute('data-request'));
            await logAudit({ action: 'result_access_requested', target_table: 'org_memberships', target_id: this.getAttribute('data-request'), detail: { org_id: org.id } });
            toast('회원에게 결과 열람 동의 요청을 보냈습니다. 회원이 동의하면 결과가 표시됩니다.', 'success');
            await refresh();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }

      var openButtons = el.querySelectorAll('[data-open-result]');
      for (var o = 0; o < openButtons.length; o++) {
        openButtons[o].addEventListener('click', function () {
          openMemberResults(org, this.getAttribute('data-open-result'), profiles);
        });
      }

      var cancelPre = el.querySelectorAll('[data-cancel-pre]');
      for (var c = 0; c < cancelPre.length; c++) {
        cancelPre[c].addEventListener('click', async function () {
          try {
            await deletePreAssignment(this.getAttribute('data-cancel-pre'));
            toast('사전 배정을 취소했습니다.', 'success');
            await refresh();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }
    }
  };
}

function refresh() {
  try { window.dispatchEvent(new HashChangeEvent('hashchange')); }
  catch (err) { window.dispatchEvent(new Event('hashchange')); }
  return Promise.resolve();
}

async function openMemberResults(org, userId, profiles) {
  var body = loadingBlock('검사 결과를 불러오는 중');
  openSheet({
    title: '회원 검사 결과',
    subtitle: '결과 공유에 동의한 회원의 기록만 표시됩니다',
    wide: true,
    content: '<div id="presult-body">' + body + '</div>',
    footer: '<button type="button" class="btn btn-primary" data-close>닫기</button>',
    onMount: async function (el) {
      var target = el.querySelector('#presult-body');
      var close = el.querySelector('[data-close]');
      if (close) close.addEventListener('click', function () { closeSheet(); });
      try {
        var all = await listResults(userId);
        var mine = (all || []).filter(function (r) { return String(r.user_id) === String(userId); });
        if (!mine.length) {
          target.innerHTML = emptyState({ icon: 'file', title: '열람 가능한 검사 결과가 없습니다', desc: '회원이 결과 공유에 동의했는지, 결과가 등록되었는지 확인해 주세요.' });
          return;
        }
        target.innerHTML = '<p class="muted small">' + esc(memberName(profiles, userId)) + '</p>' +
          mine.map(function (r) {
            return '<div class="list-card">' +
              '<div class="list-top"><strong>' + esc(CHECK_TYPES[r.check_type] || r.check_type) + '</strong>' + badge(fmtDate(r.measured_at), 'neutral') + '</div>' +
              '<div class="list-meta">' +
                '<span>' + icon('sparkle', 15) + '감정 성향 ' + (r.emotion_type ? esc(r.emotion_type) : '-') + '</span>' +
                '<span>' + icon('file', 15) + '항목 설명 ' + (r.item_details && Object.keys(r.item_details).length ? Object.keys(r.item_details).length + '건' : '-') + '</span>' +
              '</div>' +
              (r.summary_note ? '<p class="list-note">' + esc(r.summary_note) + '</p>' : '') +
            '</div>';
          }).join('');
      } catch (err) {
        target.innerHTML = noticeBox(friendlyError(err), 'warn');
      }
    }
  });
}

/* --------------------------------------------------------------- 예약 관리 */
async function buildBookings(org) {
  var bookings = (await listOrgBookings(org.id)).filter(function (b) { return String(b.org_id) === String(org.id); });
  var canWrite = hasPermission(state.profile, 'bookings');

  var rows = bookings.map(function (b) {
    return '<tr>' +
      '<td>' + fmtDate(b.preferred_date) + '<br><span class="muted small">' + esc(b.preferred_time) + '</span></td>' +
      '<td><strong>' + esc(b.program_title) + '</strong><br><span class="muted small">' + esc(b.booker_name || '') + ' · ' + esc(b.booker_phone || '') + '</span></td>' +
      '<td>' + (canWrite
        ? '<select data-pstatus="' + esc(b.id) + '">' + Object.keys(BOOKING_STATUS).map(function (s) { return opt(s, BOOKING_STATUS[s], b.status); }).join('') + '</select>'
        : badge(BOOKING_STATUS[b.status] || b.status, 'neutral')) + '</td>' +
      '<td>' + (Number(b.final_amount) > 0 ? fmtKRW(b.final_amount) : '상담 확정') + '</td>' +
      '<td class="muted small">' + esc(b.branch_name || '-') + '</td>' +
    '</tr>';
  }).join('');

  var html =
    '<section class="admin-section">' +
      '<div class="admin-toolbar">' +
        '<span class="muted small">기관 예약 ' + bookings.length + '건</span>' +
        (canWrite ? '<span class="action-spacer"></span><button type="button" class="btn btn-primary btn-sm" id="pb-new">예약 직접 등록</button>' : '') +
      '</div>' +
      table(['일시', '프로그램 · 예약자', '상태', '금액', '지점'], rows || emptyRow(5, '기관 예약이 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var newBtn = el.querySelector('#pb-new');
      if (newBtn) newBtn.addEventListener('click', function () { openAdminBookingModal({}); });
      var selects = el.querySelectorAll('[data-pstatus]');
      for (var i = 0; i < selects.length; i++) {
        selects[i].addEventListener('change', async function () {
          try {
            await adminSetBookingStatus(this.getAttribute('data-pstatus'), this.value);
            await logAudit({ action: 'booking_status_changed', target_table: 'bookings', target_id: this.getAttribute('data-pstatus'), detail: { status: this.value } });
            toast('예약 상태가 변경되었습니다.', 'success');
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }
    }
  };
}

/* --------------------------------------------------------------- 검사 결과 */
async function buildResults(org) {
  var canView = hasPermission(state.profile, 'results_view');
  var canWrite = hasPermission(state.profile, 'results_write');
  var memberships = await listOrgMemberships(org.id);
  var profiles = [];
  try { profiles = await listProfiles(); } catch (err) { profiles = []; }
  var shared = memberships.filter(function (m) { return m.status === 'approved' && m.share_brain_results; });
  var results = [];
  try { results = await listOrgResults(org.id); } catch (err) { results = []; }
  var orgResults = results.filter(function (r) { return String(r.org_id || '') === String(org.id); });

  var rows = orgResults.map(function (r) {
    return '<tr><td>' + fmtDate(r.measured_at) + '</td>' +
      '<td class="muted small">' + esc(memberName(profiles, r.user_id)) + '</td>' +
      '<td>' + esc(CHECK_TYPES[r.check_type] || r.check_type) + '</td>' +
      '<td class="muted small">' + (r.emotion_type ? esc(r.emotion_type) : '-') + '</td>' +
      '<td>' + (r.file_path ? badge('결과지 등록', 'green') : badge('파일 없음', 'neutral')) + '</td></tr>';
  }).join('');

  var memberOptions = shared.map(function (m) {
    var p = m.profiles || {};
    return opt(m.user_id, (p.full_name || '') + ' · ' + (p.email || ''));
  }).join('');

  var html =
    (canView
      ? '<section class="admin-section">' +
          '<h2 class="admin-h2">결과 공유 동의 회원 (' + shared.length + ')</h2>' +
          (shared.length
            ? '<div class="member-chip-grid">' + shared.map(function (m) {
                var p = m.profiles || {};
                return '<button type="button" class="member-chip" data-open-result="' + esc(m.user_id) + '">' +
                  '<strong>' + esc(p.full_name || '회원') + '</strong><em>' + esc(p.email || '') + '</em></button>';
              }).join('') + '</div>'
            : emptyState({ icon: 'shield', title: '아직 결과 공유에 동의한 회원이 없습니다', desc: '회원이 마이페이지에서 제휴 기관 결과 공유에 동의하면 이곳에 표시됩니다.' })) +
          noticeBox('동의하지 않은 회원의 결과는 화면·DB 어디에서도 조회되지 않습니다.', 'neutral') +
        '</section>'
      : '') +
    (canWrite
      ? '<section class="admin-section">' +
          '<h2 class="admin-h2">검사 결과 등록</h2>' +
          '<div class="admin-form">' +
            '<label class="field"><span class="field-label">회원 (결과 공유 동의 필요)</span><select id="pr-user"><option value="">회원 선택</option>' + memberOptions + '</select></label>' +
            '<div class="form-grid">' +
              '<label class="field"><span class="field-label">검사 유형</span><select id="pr-type">' + opt('simple', CHECK_TYPES.simple) + opt('full', CHECK_TYPES.full) + '</select></label>' +
              '<label class="field"><span class="field-label">측정일</span><input type="date" id="pr-date" value="' + todayStr() + '"></label>' +
            '</div>' +
            '<div class="form-grid">' +
              '<label class="field"><span class="field-label">감정 성향</span><input type="text" id="pr-emotion"></label>' +
              '<label class="field"><span class="field-label">다음 재검사 권장일</span><input type="date" id="pr-recheck"></label>' +
            '</div>' +
            editorHtml('pr', 'simple', { label: '항목별 설명 (MY BRAIN에 그대로 표시)' }) +
            '<label class="field"><span class="field-label">요약 코멘트</span><textarea id="pr-summary" rows="2"></textarea></label>' +
            '<label class="field"><span class="field-label">결과지 파일 (PDF · 이미지)</span><input type="file" id="pr-file" accept="application/pdf,image/*"></label>' +
            '<p class="field-hint">PDF를 첨부하면 측정일 · 감정 성향 · 항목별 설명이 자동으로 입력됩니다. 등록 전 내용을 꼭 확인해 주세요.</p>' +
            '<div id="pr-pdf-status" class="pdf-status" hidden></div>' +
            '<button type="button" class="btn btn-primary" id="pr-submit">결과 등록</button>' +
          '</div>' +
        '</section>'
      : '') +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">기관 검사 결과 (' + orgResults.length + ')</h2>' +
      table(['측정일', '회원', '유형', '감정 성향', '결과지'], rows || emptyRow(5, '등록된 기관 검사 결과가 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var openButtons = el.querySelectorAll('[data-open-result]');
      for (var i = 0; i < openButtons.length; i++) {
        openButtons[i].addEventListener('click', function () {
          openMemberResults(org, this.getAttribute('data-open-result'), profiles);
        });
      }

      var submit = el.querySelector('#pr-submit');
      if (!submit) return;
      var itemEditor = bindEditor(el, 'pr', '#pr-type', function (message) { toast(message); });

      var pdfAutofill = bindPdfAutofill({
        fileInput: el.querySelector('#pr-file'),
        statusEl: el.querySelector('#pr-pdf-status'),
        typeEl: el.querySelector('#pr-type'),
        fields: {
          date: el.querySelector('#pr-date'),
          emotion: el.querySelector('#pr-emotion'),
          summary: el.querySelector('#pr-summary')
        },
        fillItems: function (map, options) {
          return fillItemsDetailed(el.querySelector('#pr-items'), map, options);
        }
      });

      /* 등록 완료 뒤 폼을 처음 상태로 돌려, 앞선 결과지 값이 다음 등록으로 넘어가지 않게 합니다. */
      function resetResultForm() {
        var typeEl = el.querySelector('#pr-type');
        if (typeEl) typeEl.value = 'simple';
        var dateEl = el.querySelector('#pr-date');
        if (dateEl) dateEl.value = todayStr();
        var emotionEl = el.querySelector('#pr-emotion');
        if (emotionEl) emotionEl.value = '';
        var summaryEl = el.querySelector('#pr-summary');
        if (summaryEl) summaryEl.value = '';
        var recheckEl = el.querySelector('#pr-recheck');
        if (recheckEl) recheckEl.value = '';
        var fileEl = el.querySelector('#pr-file');
        if (fileEl) { try { fileEl.value = ''; } catch (err) { /* noop */ } }
        var statusEl = el.querySelector('#pr-pdf-status');
        if (statusEl) { statusEl.hidden = true; statusEl.innerHTML = ''; }
        if (itemEditor) itemEditor.refresh();
        if (itemEditor) itemEditor.apply();
        if (pdfAutofill && pdfAutofill.reset) pdfAutofill.reset();
      }
      submit.addEventListener('click', async function () {
        var userId = el.querySelector('#pr-user').value;
        if (!userId) { toast('회원을 선택해 주세요. (결과 공유 동의 회원만 선택 가능)', 'error'); return; }
        var itemDetails = itemEditor ? itemEditor.items() : {};
        setBusy(submit, true, '등록 중');
        try {
          var fileInput = el.querySelector('#pr-file');
          var file = fileInput && fileInput.files ? fileInput.files[0] : null;
          var uploaded = { file_path: '', file_name: '' };
          if (file) uploaded = await uploadResultFile(userId, file);
          var saved = await adminSaveResult({
            user_id: userId,
            booking_id: null,
            check_type: el.querySelector('#pr-type').value,
            measured_at: el.querySelector('#pr-date').value,
            focus_score: null,
            stress_index: null,
            balance_index: null,
            feedback_score: null,
            emotion_type: el.querySelector('#pr-emotion').value.trim(),
            summary_note: el.querySelector('#pr-summary').value.trim(),
            item_details: itemDetails,
            is_public: true,
            org_id: org.id,
            file_path: uploaded.file_path,
            file_name: uploaded.file_name,
            next_recheck_date: el.querySelector('#pr-recheck').value || null
          });
          await logAudit({ action: 'result_created', target_table: 'brain_check_results', target_id: saved ? saved.id : '', detail: { user_id: userId, org_id: org.id } });
          toast('검사 결과가 등록되었습니다.', 'success');
          resetResultForm();
          window.location.hash = '#/partner/results?r=' + Date.now();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });
    }
  };
}

/* ------------------------------------------------------- 직원 · 권한 관리 */
async function buildStaff(org) {
  if (!isOrgAdmin() && !isAdmin()) {
    return { html: noticeBox('직원 계정 발급·권한 관리는 기관 관리자만 가능합니다.', 'warn'), bind: function () {} };
  }
  var profiles = [];
  try { profiles = await listProfiles(); } catch (err) { profiles = []; }
  var staff = profiles.filter(function (p) {
    return String(p.org_id || '') === String(org.id) && (p.role === 'staff' || p.role === 'partner_admin');
  });

  var rows = staff.map(function (p) {
    return '<tr data-staff-row="' + esc(p.id) + '">' +
      '<td><strong>' + esc(p.full_name || '-') + '</strong><br><span class="muted small">' + esc(p.email) + '</span></td>' +
      '<td>' + badge(ROLES[p.role] || p.role, 'navy') + '<br><span class="muted small">' + esc(p.staff_role || '-') + '</span></td>' +
      '<td><label class="field-compact"><input type="text" class="input-sm" data-staff-role="' + esc(p.id) + '" value="' + esc(p.staff_role || '') + '"></label></td>' +
      '<td class="muted small">' + esc(staffPermissionLabels(p.staff_permissions)) + '</td>' +
      '<td><button type="button" class="btn btn-ghost btn-xs" data-perm-edit="' + esc(p.id) + '">권한 수정</button></td>' +
    '</tr>';
  }).join('');

  var html =
    '<section class="admin-section">' +
      '<h2 class="admin-h2">직원 계정 발급</h2>' +
      noticeBox('직원 계정은 실제 로그인이 가능한 계정으로 즉시 발급됩니다. 부여한 권한 메뉴만 직원 화면에 나타납니다.', 'neutral') +
      '<div class="admin-form">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">이름</span><input type="text" id="ps-name"></label>' +
          '<label class="field"><span class="field-label">이메일</span><input type="email" id="ps-email" placeholder="staff@example.com"></label>' +
        '</div>' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">연락처</span><input type="tel" id="ps-phone"></label>' +
          '<label class="field"><span class="field-label">직무</span><select id="ps-role">' +
            STAFF_ROLE_OPTIONS.map(function (r) { return opt(r, r); }).join('') + '</select></label>' +
        '</div>' +
        '<div class="field"><span class="field-label">세부 권한</span>' + permCheckboxes({ dashboard: true, bookings: true }, 'ps') + '</div>' +
        '<button type="button" class="btn btn-primary" id="ps-submit">직원 계정 발급</button>' +
      '</div>' +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">기관 직원 (' + staff.length + ')</h2>' +
      table(['직원', '역할', '직무', '권한', ''], rows || emptyRow(5, '등록된 직원이 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var submit = el.querySelector('#ps-submit');
      if (submit) {
        submit.addEventListener('click', async function () {
          var email = el.querySelector('#ps-email').value.trim();
          var name = el.querySelector('#ps-name').value.trim();
          if (!email) { toast('이메일을 입력해 주세요.'); return; }
          var perms = {};
          var boxes = el.querySelectorAll('[data-perm]');
          for (var i = 0; i < boxes.length; i++) {
            if (boxes[i].checked) perms[boxes[i].getAttribute('data-perm')] = true;
          }
          if (!Object.keys(perms).length) { toast('직원에게 부여할 권한을 하나 이상 선택해 주세요.'); return; }
          setBusy(submit, true, '발급 중');
          try {
            var result = await issueStaffAccount({
              email: email,
              full_name: name,
              phone: el.querySelector('#ps-phone').value.trim(),
              staff_role: el.querySelector('#ps-role').value,
              staff_permissions: perms,
              org_id: org.id
            });
            await logAudit({ action: 'staff_account_issued', target_table: 'profiles', target_id: email, detail: { org_id: org.id, permissions: perms } });
            openSheet({
              title: '직원 계정이 발급되었습니다',
              content: '<div class="summary-list">' +
                '<div class="summary-row"><span>이메일</span><strong>' + esc(result.email) + '</strong></div>' +
                '<div class="summary-row"><span>임시 비밀번호</span><strong class="mono">' + esc(result.tempPassword) + '</strong></div>' +
                '<div class="summary-row"><span>권한</span><strong>' + esc(staffPermissionLabels(perms)) + '</strong></div>' +
                '</div>' + noticeBox('임시 비밀번호는 다시 표시되지 않습니다. 직원에게 전달해 주세요. 직원은 #/admin-login 에서 로그인합니다.', 'warn') +
                (result.note ? noticeBox(esc(result.note), 'warn') : ''),
              footer: '<button type="button" class="btn btn-primary" data-close>확인</button>',
              onMount: function (sheet) {
                var c = sheet.querySelector('[data-close]');
                if (c) c.addEventListener('click', function () { closeSheet(); window.location.hash = '#/partner/staff?r=' + Date.now(); });
              }
            });
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
          setBusy(submit, false);
        });
      }

      var editButtons = el.querySelectorAll('[data-perm-edit]');
      for (var e = 0; e < editButtons.length; e++) {
        editButtons[e].addEventListener('click', function () {
          var id = this.getAttribute('data-perm-edit');
          var target = null;
          for (var k = 0; k < staff.length; k++) if (String(staff[k].id) === String(id)) target = staff[k];
          if (!target) return;
          openSheet({
            title: '직원 권한 수정',
            subtitle: target.full_name + ' · ' + target.email,
            content:
              '<label class="field"><span class="field-label">직무</span><input type="text" id="pe-staff-role" value="' + esc(target.staff_role || '') + '"></label>' +
              '<div class="field"><span class="field-label">세부 권한</span>' + permCheckboxes(target.staff_permissions || {}, 'pe') + '</div>' +
              noticeBox('권한은 직원이 다시 로그인할 때 화면에 반영됩니다.', 'neutral'),
            footer: '<button type="button" class="btn btn-ghost" data-close>닫기</button>' +
              '<button type="button" class="btn btn-primary" id="pe-save">저장</button>',
            onMount: function (sheet) {
              var c = sheet.querySelector('[data-close]');
              if (c) c.addEventListener('click', function () { closeSheet(); });
              var save = sheet.querySelector('#pe-save');
              save.addEventListener('click', async function () {
                var perms = {};
                var boxes = sheet.querySelectorAll('[data-perm]');
                for (var i = 0; i < boxes.length; i++) {
                  if (boxes[i].checked) perms[boxes[i].getAttribute('data-perm')] = true;
                }
                setBusy(save, true, '저장 중');
                try {
                  await adminUpdateProfile(id, {
                    staff_role: sheet.querySelector('#pe-staff-role').value.trim(),
                    staff_permissions: perms
                  });
                  /* RLS가 막은 경우(0건 업데이트)를 숨기지 않고 확인합니다 */
                  var after = null;
                  var refreshed = await listProfiles();
                  for (var k = 0; k < refreshed.length; k++) if (String(refreshed[k].id) === String(id)) after = refreshed[k];
                  var savedPerms = (after && after.staff_permissions) || {};
                  var same = Object.keys(perms).filter(function (key) { return perms[key]; }).sort().join(',') ===
                    Object.keys(savedPerms).filter(function (key) { return savedPerms[key]; }).sort().join(',');
                  if (!after || !same) {
                    throw new Error('저장이 반영되지 않았습니다. 현재 DB 정책은 기관 관리자의 직원 권한 수정(profiles update)을 허용하지 않습니다. 전체 관리자 콘솔 → 회원 관리에서 변경해 주세요.');
                  }
                  await logAudit({ action: 'staff_permissions_changed', target_table: 'profiles', target_id: id, detail: { permissions: perms } });
                  toast('권한이 저장되었습니다.', 'success');
                  closeSheet();
                  await refresh();
                } catch (err) {
                  toast(friendlyError(err), 'error');
                  setBusy(save, false);
                }
              });
            }
          });
        });
      }
    }
  };
}

/* ----------------------------------------------------- 상품 · 운영시간 */
async function buildPrograms(org) {
  var data = await listOrgPrograms(org.id);
  var branches = await listBranchesForOrg(org.id);
  var schedules = await listOrgSchedules(org.id);

  var programRows = data.own.map(function (p) {
    return '<tr data-org-program="' + esc(p.id) + '">' +
      '<td><strong>' + esc(p.title) + '</strong><br><span class="muted small">' + esc(p.category) + '</span></td>' +
      '<td><input type="number" class="input-sm" data-oprice="' + esc(p.id) + '" value="' + (p.price_krw === null || p.price_krw === undefined ? '' : p.price_krw) + '" placeholder="미정"></td>' +
      '<td><label class="switch"><input type="checkbox" data-oactive="' + esc(p.id) + '"' + (p.active ? ' checked' : '') + '><span></span></label></td>' +
      '<td><button type="button" class="btn btn-ghost btn-xs" data-osave="' + esc(p.id) + '">저장</button></td>' +
    '</tr>';
  }).join('');

  var scheduleRows = branches.map(function (b) {
    var perDay = WEEKDAYS.map(function (label, weekday) {
      var row = null;
      for (var i = 0; i < schedules.length; i++) {
        if (Number(schedules[i].weekday) === weekday && String(schedules[i].branch_id || '') === String(b.id)) row = schedules[i];
      }
      return { weekday: weekday, label: label, row: row };
    });
    return '<tr><td><strong>' + esc(b.name) + '</strong><br><span class="muted small">' + esc(b.address || '') + '</span></td>' +
      '<td>' + perDay.map(function (day) {
        return '<div class="sched-row">' +
          '<span class="sched-day">' + day.label + '</span>' +
          (day.row
            ? '<input type="time" class="input-sm" data-sched-open="' + esc(day.row.id) + '" value="' + esc(String(day.row.open_time).slice(0, 5)) + '">' +
              '<span class="muted small">~</span>' +
              '<input type="time" class="input-sm" data-sched-close="' + esc(day.row.id) + '" value="' + esc(String(day.row.close_time).slice(0, 5)) + '">' +
              '<button type="button" class="btn btn-ghost btn-xs" data-sched-save="' + esc(day.row.id) + '">저장</button>' +
              '<button type="button" class="btn btn-ghost btn-xs btn-quiet-danger" data-sched-del="' + esc(day.row.id) + '">삭제</button>'
            : '<span class="muted small">휴무</span>' +
              '<button type="button" class="btn btn-ghost btn-xs" data-sched-add="1" data-branch="' + esc(b.id) + '" data-weekday="' + day.weekday + '">운영 추가</button>') +
        '</div>';
      }).join('') + '</td></tr>';
  }).join('');

  var html =
    (isOrgAdmin() || isAdmin()
      ? ''
      : noticeBox('상품·운영시간 <strong>변경</strong>은 기관 관리자만 가능합니다. 직원은 조회만 할 수 있습니다(DB 정책).', 'warn')) +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">기관 전용 프로그램</h2>' +
      '<p class="muted small">예: 헬스장 「PT + 뇌파측정」, 필라테스 「자세관리 + 브레인웰니스」. 가격과 노출 여부를 직접 관리합니다.</p>' +
      '<div class="admin-form">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">프로그램명</span><input type="text" id="op-title" placeholder="예: PT + 뇌파측정 8주"></label>' +
          '<label class="field"><span class="field-label">카테고리</span><select id="op-cat">' +
            opt('brain_check', 'BRAIN CHECK') + opt('neuro_training', 'NEURO TRAINING') +
            opt('mind_care', 'MIND CARE') + opt('brain_wellness', 'BRAIN WELLNESS') + '</select></label>' +
        '</div>' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">가격 (원)</span><input type="number" id="op-price" min="0"></label>' +
          '<label class="field"><span class="field-label">소요 시간</span><input type="text" id="op-duration" placeholder="예: 50분 · 총 8회"></label>' +
        '</div>' +
        '<label class="field"><span class="field-label">소개</span><textarea id="op-desc" rows="2"></textarea></label>' +
        '<button type="button" class="btn btn-primary" id="op-submit">프로그램 추가</button>' +
      '</div>' +
      table(['프로그램', '가격(원)', '노출', ''], programRows || emptyRow(4, '기관 전용 프로그램이 없습니다. 공용 프로그램만 노출됩니다.')) +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">지점별 운영시간</h2>' +
      '<p class="muted small">회원 예약 화면은 이 운영시간으로만 시간대를 생성합니다. 예약된 시간대는 자동으로 비활성화됩니다.</p>' +
      table(['지점', '요일별 운영시간'], scheduleRows || emptyRow(2, '등록된 지점이 없습니다.')) +
      '<div class="admin-form" style="margin-top:12px">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">지점명</span><input type="text" id="pb-name"></label>' +
          '<label class="field"><span class="field-label">주소</span><input type="text" id="pb-address"></label>' +
        '</div>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="pb-submit">지점 추가</button>' +
      '</div>' +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var submit = el.querySelector('#op-submit');
      submit.addEventListener('click', async function () {
        var title = el.querySelector('#op-title').value.trim();
        if (!title) { toast('프로그램명을 입력해 주세요.'); return; }
        setBusy(submit, true, '추가 중');
        try {
          await saveOrgProgram({
            title: title,
            category: el.querySelector('#op-cat').value,
            price_krw: el.querySelector('#op-price').value,
            duration_text: el.querySelector('#op-duration').value.trim(),
            description: el.querySelector('#op-desc').value.trim(),
            org_id: org.id,
            active: true
          });
          await logAudit({ action: 'program_updated', target_table: 'programs', detail: { org_id: org.id, title: title } });
          toast('프로그램이 추가되었습니다.', 'success');
          window.location.hash = '#/partner/programs?r=' + Date.now();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });

      var saveButtons = el.querySelectorAll('[data-osave]');
      for (var i = 0; i < saveButtons.length; i++) {
        saveButtons[i].addEventListener('click', async function () {
          var id = this.getAttribute('data-osave');
          var priceEl = el.querySelector('[data-oprice="' + id + '"]');
          var activeEl = el.querySelector('[data-oactive="' + id + '"]');
          var target = null;
          for (var k = 0; k < data.own.length; k++) if (String(data.own[k].id) === String(id)) target = data.own[k];
          setBusy(this, true, '저장');
          try {
            await saveOrgProgram(Object.assign({}, target || {}, {
              price_krw: priceEl.value,
              active: activeEl.checked,
              org_id: org.id
            }), id);
            toast('저장되었습니다.', 'success');
            setBusy(this, false);
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(this, false);
          }
        });
      }

      var schedSave = el.querySelectorAll('[data-sched-save]');
      for (var s = 0; s < schedSave.length; s++) {
        schedSave[s].addEventListener('click', async function () {
          var id = this.getAttribute('data-sched-save');
          var openEl = el.querySelector('[data-sched-open="' + id + '"]');
          var closeEl = el.querySelector('[data-sched-close="' + id + '"]');
          setBusy(this, true, '저장');
          try {
            await saveSchedule({
              org_id: org.id,
              branch_id: (function () {
                for (var k = 0; k < schedules.length; k++) if (String(schedules[k].id) === String(id)) return schedules[k].branch_id;
                return null;
              })(),
              weekday: (function () {
                for (var k = 0; k < schedules.length; k++) if (String(schedules[k].id) === String(id)) return schedules[k].weekday;
                return 1;
              })(),
              open_time: openEl.value,
              close_time: closeEl.value,
              slot_minutes: 60,
              is_active: true
            }, id);
            await logAudit({ action: 'schedule_updated', target_table: 'org_schedules', target_id: id, detail: { open: openEl.value, close: closeEl.value } });
            toast('운영시간이 저장되었습니다.', 'success');
            setBusy(this, false);
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(this, false);
          }
        });
      }

      var schedDel = el.querySelectorAll('[data-sched-del]');
      for (var d = 0; d < schedDel.length; d++) {
        schedDel[d].addEventListener('click', async function () {
          try {
            await deleteSchedule(this.getAttribute('data-sched-del'));
            toast('해당 요일 운영을 삭제했습니다.', 'success');
            window.location.hash = '#/partner/programs?r=' + Date.now();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }

      var schedAdd = el.querySelectorAll('[data-sched-add]');
      for (var a = 0; a < schedAdd.length; a++) {
        schedAdd[a].addEventListener('click', async function () {
          try {
            await saveSchedule({
              org_id: org.id,
              branch_id: this.getAttribute('data-branch'),
              weekday: Number(this.getAttribute('data-weekday')),
              open_time: '10:00',
              close_time: '19:00',
              slot_minutes: 60,
              is_active: true
            });
            toast('운영일이 추가되었습니다. 시간을 조정해 주세요.', 'success');
            window.location.hash = '#/partner/programs?r=' + Date.now();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }

      var branchSubmit = el.querySelector('#pb-submit');
      branchSubmit.addEventListener('click', async function () {
        var name = el.querySelector('#pb-name').value.trim();
        if (!name) { toast('지점명을 입력해 주세요.'); return; }
        setBusy(branchSubmit, true, '추가 중');
        try {
          await saveBranch({ org_id: org.id, name: name, address: el.querySelector('#pb-address').value.trim(), status: 'active' });
          toast('지점이 추가되었습니다.', 'success');
          window.location.hash = '#/partner/programs?r=' + Date.now();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(branchSubmit, false);
        }
      });
    }
  };
}

/* --------------------------------------------------------------- 정산 */
async function buildSettlements(org) {
  var thisMonth = todayStr().slice(0, 7);
  var canWrite = isAdmin();
  var payments = await listOrgPayments(org.id);
  var months = {};
  payments.forEach(function (p) {
    var key = String(p.created_at || '').slice(0, 7);
    if (key) months[key] = (months[key] || 0) + 1;
  });
  var monthList = Object.keys(months).sort().reverse();
  if (monthList.indexOf(thisMonth) < 0) monthList.unshift(thisMonth);

  var settlements = await listSettlements(org.id);

  var previewRows = monthList.slice(0, 12).map(function (month) {
    var scoped = payments.filter(function (p) { return String(p.created_at || '').slice(0, 7) === month; });
    var totals = settlementTotals(scoped, org.commission_rate);
    var existing = settlements.filter(function (s) { return s.period_month === month; })[0];
    return '<tr><td><strong>' + esc(month) + '</strong></td>' +
      '<td>' + fmtKRW(totals.gross) + '</td>' +
      '<td>' + fmtKRW(totals.refund) + '</td>' +
      '<td>' + Number(totals.commission_rate) + '% · ' + fmtKRW(totals.commission) + '</td>' +
      '<td><strong>' + fmtKRW(totals.net) + '</strong></td>' +
      '<td>' + (existing
        ? badge(SETTLEMENT_STATUS[existing.status] || existing.status, existing.status === 'paid' ? 'green' : 'yellow')
        : (canWrite
          ? '<button type="button" class="btn btn-ghost btn-xs" data-settle-create="' + esc(month) + '">정산 생성</button>'
          : '<span class="muted small">정산 예정</span>')) +
      '</td></tr>';
  }).join('');

  var settlementRows = settlements.map(function (s) {
    return '<tr><td>' + esc(s.period_month) + '</td>' +
      '<td>' + fmtKRW(s.gross_amount) + '</td><td>' + fmtKRW(s.refund_amount) + '</td>' +
      '<td>' + fmtKRW(s.commission_amount) + ' <span class="muted small">(' + Number(s.commission_rate) + '%)</span></td>' +
      '<td><strong>' + fmtKRW(s.net_payout) + '</strong></td>' +
      '<td>' + badge(SETTLEMENT_STATUS[s.status] || s.status, s.status === 'paid' ? 'green' : 'yellow') +
        (s.paid_at ? '<br><span class="muted small">' + fmtDate(s.paid_at) + '</span>' : '') + '</td>' +
      '<td>' + (s.status !== 'paid' && canWrite
        ? '<button type="button" class="btn btn-ghost btn-xs" data-settle-paid="' + esc(s.id) + '">정산 완료</button>' : '') + '</td></tr>';
  }).join('');

  var html =
    '<div class="stat-grid">' +
      statCard('정산 계좌', (org.settlement_bank || '-') + ' ' + (org.settlement_account || ''), '기관 정보에서 수정', 'ivory') +
      statCard('수수료율', Number(org.commission_rate || 0) + '%', '계약 조건 기준', 'yellow') +
      statCard('정산 완료 합계', fmtKRW(settlements.filter(function (s) { return s.status === 'paid'; }).reduce(function (sum, s) { return sum + Number(s.net_payout || 0); }, 0)), settlements.filter(function (s) { return s.status === 'paid'; }).length + '건', 'navy') +
    '</div>' +
    '<section class="admin-section">' +
      '<div class="admin-toolbar"><h2 class="admin-h2" style="margin:0">월별 정산 예정</h2>' +
        '<span class="action-spacer"></span>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="settle-csv">정산 내역 CSV</button></div>' +
      table(['정산 월', '매출', '환불', '수수료', '정산 예정액', ''], previewRows || emptyRow(6, '정산할 결제 내역이 없습니다.')) +
      noticeBox('정산 금액은 실제 <code>payments</code> 의 결제 완료(paid)·환불(refunded) 금액과 기관 수수료율로 계산합니다. 추정치를 임의로 만들지 않습니다.' +
        (canWrite ? '' : ' 정산 확정·지급 완료 처리는 MINA WORLD 전체 관리자가 진행합니다.'), 'neutral') +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">정산 기록 (' + settlements.length + ')</h2>' +
      table(['정산 월', '매출', '환불', '수수료', '지급액', '상태', ''], settlementRows || emptyRow(7, '생성된 정산이 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var csvBtn = el.querySelector('#settle-csv');
      if (csvBtn) {
        csvBtn.addEventListener('click', function () {
          if (!settlements.length) { toast('내려받을 정산 내역이 없습니다.'); return; }
          downloadCsv(
            'mina-settlement-' + org.name + '-' + todayStr() + '.csv',
            ['정산 월', '매출(원)', '환불(원)', '수수료율(%)', '수수료(원)', '지급액(원)', '상태', '지급일'],
            settlements.map(function (s) {
              return [s.period_month, s.gross_amount, s.refund_amount, s.commission_rate, s.commission_amount, s.net_payout, SETTLEMENT_STATUS[s.status] || s.status, s.paid_at ? fmtDate(s.paid_at) : ''];
            })
          );
        });
      }

      var createButtons = el.querySelectorAll('[data-settle-create]');
      for (var i = 0; i < createButtons.length; i++) {
        createButtons[i].addEventListener('click', async function () {
          var month = this.getAttribute('data-settle-create');
          setBusy(this, true, '생성 중');
          try {
            await createSettlement(org.id, month, org.commission_rate, '');
            await logAudit({ action: 'settlement_created', target_table: 'settlements', target_id: month, detail: { org_id: org.id } });
            toast(month + ' 정산이 생성되었습니다.', 'success');
            window.location.hash = '#/partner/settlements?r=' + Date.now();
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(this, false);
          }
        });
      }

      var paidButtons = el.querySelectorAll('[data-settle-paid]');
      for (var p = 0; p < paidButtons.length; p++) {
        paidButtons[p].addEventListener('click', async function () {
          var ok = await confirmDialog({ title: '정산 완료 처리', message: '이 정산을 완료 상태로 변경할까요? 지급일이 기록됩니다.', confirmLabel: '완료 처리', danger: false });
          if (!ok) return;
          try {
            await markSettlementPaid(this.getAttribute('data-settle-paid'));
            await logAudit({ action: 'settlement_paid', target_table: 'settlements', target_id: this.getAttribute('data-settle-paid'), detail: {} });
            toast('정산 완료로 처리되었습니다.', 'success');
            window.location.hash = '#/partner/settlements?r=' + Date.now();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }
    }
  };
}

/* --------------------------------------------------------------- render */
var TAB_DEFS = [
  { id: 'dashboard', label: '대시보드', ico: 'chart', perm: 'dashboard' },
  { id: 'members', label: '회원 관리', ico: 'users', perm: 'members' },
  { id: 'bookings', label: '예약 관리', ico: 'calendar', perm: 'bookings' },
  { id: 'results', label: '검사 결과', ico: 'file', perm: 'results_view', altPerm: 'results_write' },
  { id: 'staff', label: '직원 · 권한', ico: 'shield', perm: null, orgAdminOnly: true },
  { id: 'programs', label: '상품 · 운영시간', ico: 'grid', perm: 'programs' },
  { id: 'settlements', label: '정산', ico: 'wallet', perm: 'settlements' }
];

function visibleTabs() {
  var profile = state.profile || {};
  return TAB_DEFS.filter(function (tab) {
    if (tab.orgAdminOnly) return profile.role === 'partner_admin' || profile.role === 'admin' || profile.role === 'super_admin';
    if (!tab.perm) return true;
    if (isAdmin()) return true;
    return hasPermission(profile, tab.perm) || (tab.altPerm ? hasPermission(profile, tab.altPerm) : false);
  });
}

export async function render(ctx) {
  if (!state.session || !state.profile) {
    return {
      title: '기관 대시보드',
      pageClass: 'partner-page',
      html: '<div class="portal-mini">' +
        '<h1>제휴 기관 대시보드</h1>' +
        '<p class="muted">기관 계정으로 로그인해야 이용할 수 있습니다.</p>' +
        '<a class="btn btn-primary" href="#/admin-login">기관 · 관리자 로그인</a>' +
        '</div>',
      mount: function () {}
    };
  }

  var profile = state.profile;
  var isPlatformAdmin = profile.role === 'admin' || profile.role === 'super_admin';
  if (profile.role !== 'partner_admin' && profile.role !== 'staff' && !isPlatformAdmin) {
    return {
      title: '기관 대시보드',
      pageClass: 'partner-page',
      html: '<div class="empty empty-error"><div class="empty-icon">' + icon('lock', 26) + '</div>' +
        '<p class="empty-title">접근 권한이 없습니다</p>' +
        '<p class="empty-desc">제휴 기관 관리자 또는 기관 직원 계정만 이용할 수 있습니다. 일반 회원은 마이페이지를 이용해 주세요.</p>' +
        '<div class="empty-action"><a class="btn btn-primary" href="#/account">마이페이지로</a></div></div>',
      mount: function () {}
    };
  }

  var orgId = myOrgId();
  if (!orgId) {
    return {
      title: '기관 대시보드',
      pageClass: 'partner-page',
      html: '<div class="empty"><div class="empty-icon">' + icon('shield', 26) + '</div>' +
        '<p class="empty-title">연결된 기관이 없습니다</p>' +
        '<p class="empty-desc">계정에 기관이 연결되어 있지 않습니다. 전체 관리자 콘솔에서 기관 계정을 발급받아 주세요.</p>' +
        '<div class="empty-action"><a class="btn btn-ghost" href="#/admin">전체 관리자 콘솔</a></div></div>',
      mount: function () {}
    };
  }

  var org = null;
  try { org = await getOrganization(orgId); } catch (err) { console.warn(err); }
  if (!org) {
    org = { id: orgId, name: '내 기관', commission_rate: 15, org_type: 'wellness' };
  }

  var tabs = visibleTabs();
  var allowedIds = tabs.map(function (t) { return t.id; });
  var tabId = ctx.segments[1] || 'dashboard';
  if (allowedIds.indexOf(tabId) < 0) tabId = allowedIds[0] || 'dashboard';

  var builder = {
    dashboard: buildDashboard,
    members: buildMembers,
    bookings: buildBookings,
    results: buildResults,
    staff: buildStaff,
    programs: buildPrograms,
    settlements: buildSettlements
  }[tabId];

  var built;
  try {
    built = await builder(org);
  } catch (err) {
    console.error('[MINA] 기관 탭 로드 실패', err);
    built = {
      html: '<section class="admin-section">' + emptyState({
        icon: 'alert',
        title: '데이터를 불러오지 못했습니다',
        desc: friendlyError(err)
      }) + '</section>',
      bind: function () {}
    };
  }

  var tabBar = tabs.map(function (tab) {
    return '<a class="admin-tab' + (tab.id === tabId ? ' is-on' : '') + '" href="#/partner/' + tab.id + '">' +
      icon(tab.ico, 16) + '<span>' + tab.label + '</span></a>';
  }).join('');

  var staffNote = profile.role === 'staff'
    ? '<span class="pill pill-gold">' + esc(staffPermissionLabels(profile.staff_permissions)) + '</span>'
    : '<span class="pill pill-navy">' + esc(ROLES[profile.role] || '') + '</span>';

  var html =
    '<header class="admin-header">' +
      '<div class="admin-header-left">' +
        '<a class="admin-back" href="#/home" aria-label="앱으로 돌아가기">' + icon('chevronLeft', 18) + '</a>' +
        '<div><h1>' + esc(org.name) + '</h1>' +
          '<p class="muted small">' + esc(ORG_TYPES[org.org_type] || '') + ' · ' + esc(profile.full_name || profile.email || '') + ' · ' +
            esc(state.mode === 'live' ? '실서버 연결' : '로컬 체험 모드') + '</p></div>' +
      '</div>' +
      '<div class="admin-header-right">' + staffNote + '</div>' +
    '</header>' +
    '<nav class="admin-tabs">' + tabBar + '</nav>' +
    '<div class="admin-body">' + built.html + '</div>';

  return {
    title: '기관 대시보드',
    pageClass: 'admin-page partner-page',
    html: html,
    mount: function (el) {
      if (typeof built.bind === 'function') built.bind(el);
    }
  };
}
