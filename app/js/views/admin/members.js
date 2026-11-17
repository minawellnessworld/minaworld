/* 관리자 → 회원 관리: 통합 상세 뷰(가입·프로그램·예약·결제·검사·훈련·상담) + 상태 관리 */
import { ROLES, GRADES, PROFILE_STATUS, CHECK_TYPES, BOOKING_STATUS } from '../../config.js?v=2.0.6';
import {
  state, listProfiles, adminUpdateProfile, listBookings, listResults, listSessions,
  listPayments, listNotes, listPackages, listOrganizations, friendlyError
} from '../../store.js?v=2.0.6';
import { listMembershipsForUser } from '../../store-org.js?v=2.0.6';
import { logAudit } from '../../store-security.js?v=2.0.6';
import {
  icon, esc, fmtKRW, fmtDate, fmtDateTime, toast, badge, openSheet, closeSheet, noticeBox, loadingBlock
} from '../../ui.js?v=2.0.6';

function opt(value, label, selected) {
  return '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(label) + '</option>';
}

function statusTone(status) {
  if (status === 'suspended') return 'red';
  if (status === 'withdrawn') return 'neutral';
  return 'green';
}

function table(headers, rows) {
  return '<div class="table-scroll"><table class="data-table"><thead><tr>' +
    headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function emptyRow(cols, text) {
  return '<tr><td colspan="' + cols + '" class="table-empty">' + esc(text) + '</td></tr>';
}

export async function build(ctx) {
  var profiles = [];
  var bookings = [];
  var results = [];
  var sessions = [];
  var orgs = [];
  var packages = [];
  var writable = state.profile && (state.profile.role === 'admin' || state.profile.role === 'super_admin');
  var loadError = '';

  try {
    var loaded = await Promise.all([listProfiles(), listBookings(), listResults(), listSessions(), listOrganizations(), listPackages()]);
    profiles = loaded[0] || [];
    bookings = loaded[1] || [];
    results = loaded[2] || [];
    sessions = loaded[3] || [];
    orgs = loaded[4] || [];
    packages = loaded[5] || [];
  } catch (err) {
    loadError = friendlyError(err);
  }

  function orgName(id) {
    for (var i = 0; i < orgs.length; i++) if (String(orgs[i].id) === String(id)) return orgs[i].name;
    return '';
  }

  var rows = profiles.map(function (p) {
    var bookingCount = bookings.filter(function (b) { return String(b.user_id) === String(p.id); }).length;
    var resultCount = results.filter(function (r) { return String(r.user_id) === String(p.id); }).length;
    var sessionCount = sessions.filter(function (s) { return String(s.user_id) === String(p.id); }).length;
    var isWithdrawn = p.status === 'withdrawn';
    return '<tr data-member-row="' + esc(p.id) + '"' + (isWithdrawn ? ' class="is-dim"' : '') + '>' +
      '<td><strong>' + esc(p.full_name || '-') + '</strong><br><span class="muted small">' + esc(p.email || '') + '</span>' +
        '<br><span class="muted small">' + esc(p.phone || '') + '</span>' +
        (p.org_id ? '<br><span class="pill pill-gold">' + esc(orgName(p.org_id) || '기관') + '</span>' : '') + '</td>' +
      '<td>' + (writable
        ? '<select data-role="' + esc(p.id) + '">' + Object.keys(ROLES).map(function (role) { return opt(role, ROLES[role], p.role); }).join('') + '</select>'
        : esc(ROLES[p.role] || p.role || '')) +
        (p.staff_role ? '<br><span class="muted small">' + esc(p.staff_role) + '</span>' : '') + '</td>' +
      '<td>' + (writable
        ? '<select data-grade="' + esc(p.id) + '">' + Object.keys(GRADES).map(function (g) { return opt(g, g, p.member_grade); }).join('') + '</select>'
        : esc(p.member_grade || '')) + '</td>' +
      '<td>' + (writable
        ? '<select data-status="' + esc(p.id) + '">' + Object.keys(PROFILE_STATUS).map(function (s) { return opt(s, PROFILE_STATUS[s], p.status || 'active'); }).join('') + '</select>'
        : badge(PROFILE_STATUS[p.status || 'active'], statusTone(p.status))) + '</td>' +
      '<td class="muted small">예약 ' + bookingCount + ' · 검사 ' + resultCount + ' · 훈련 ' + sessionCount + '</td>' +
      '<td class="muted small">' + fmtDate(p.created_at) + '</td>' +
      '<td><button type="button" class="btn btn-ghost btn-xs" data-detail="' + esc(p.id) + '">통합 보기</button></td>' +
    '</tr>';
  }).join('');

  var activeCount = profiles.filter(function (p) { return (p.status || 'active') === 'active'; }).length;
  var suspended = profiles.filter(function (p) { return p.status === 'suspended'; }).length;
  var withdrawn = profiles.filter(function (p) { return p.status === 'withdrawn'; }).length;

  var html =
    (loadError ? noticeBox(esc(loadError), 'warn') : '') +
    '<div class="stat-grid">' +
      '<div class="stat-card tone-navy"><span class="stat-label">전체 회원</span><strong class="stat-value">' + profiles.length + '명</strong><span class="stat-sub">이용 중 ' + activeCount + '명</span></div>' +
      '<div class="stat-card tone-ivory"><span class="stat-label">이용 정지</span><strong class="stat-value">' + suspended + '명</strong><span class="stat-sub">상태 관리</span></div>' +
      '<div class="stat-card tone-ivory"><span class="stat-label">탈퇴</span><strong class="stat-value">' + withdrawn + '명</strong><span class="stat-sub">비식별 처리</span></div>' +
      '<div class="stat-card tone-gold"><span class="stat-label">기관 소속</span><strong class="stat-value">' + profiles.filter(function (p) { return p.org_id; }).length + '명</strong><span class="stat-sub">제휴 연결</span></div>' +
    '</div>' +
    '<section class="admin-section">' +
      '<div class="admin-toolbar">' +
        '<input type="search" id="member-search" placeholder="이름 · 이메일 · 연락처 검색">' +
        '<span class="muted small">총 ' + profiles.length + '명</span>' +
      '</div>' +
      table(['회원', '권한', '등급', '상태', '이용 이력', '가입일', ''], rows || emptyRow(7, '회원이 없습니다.')) +
      noticeBox('회원 상태를 <strong>이용 정지</strong>로 바꾸면 로그인 후 주요 기능 이용이 제한됩니다. <strong>탈퇴</strong>는 회원이 직접 탈퇴 RPC로 처리하며 개인정보가 비식별화됩니다.', 'neutral') +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var search = el.querySelector('#member-search');
      if (search) {
        search.addEventListener('input', function () {
          var needle = this.value.toLowerCase();
          var trs = el.querySelectorAll('[data-member-row]');
          for (var i = 0; i < trs.length; i++) {
            trs[i].style.display = trs[i].textContent.toLowerCase().indexOf(needle) >= 0 ? '' : 'none';
          }
        });
      }

      function profileById(id) {
        for (var i = 0; i < profiles.length; i++) if (String(profiles[i].id) === String(id)) return profiles[i];
        return null;
      }

      async function change(id, patch, action, message) {
        try {
          await adminUpdateProfile(id, patch);
          await logAudit({ action: action, target_table: 'profiles', target_id: id, detail: patch });
          toast(message, 'success');
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (err) {
          toast(friendlyError(err), 'error');
        }
      }

      var roleSelects = el.querySelectorAll('[data-role]');
      for (var i = 0; i < roleSelects.length; i++) {
        roleSelects[i].addEventListener('change', function () {
          change(this.getAttribute('data-role'), { role: this.value }, 'member_role_changed', '권한이 변경되었습니다.');
        });
      }
      var gradeSelects = el.querySelectorAll('[data-grade]');
      for (var g = 0; g < gradeSelects.length; g++) {
        gradeSelects[g].addEventListener('change', function () {
          change(this.getAttribute('data-grade'), { member_grade: this.value }, 'member_role_changed', '회원 등급이 변경되었습니다.');
        });
      }
      var statusSelects = el.querySelectorAll('[data-status]');
      for (var s = 0; s < statusSelects.length; s++) {
        statusSelects[s].addEventListener('change', function () {
          change(this.getAttribute('data-status'), { status: this.value }, 'member_status_changed', '회원 상태가 변경되었습니다.');
        });
      }

      var detailButtons = el.querySelectorAll('[data-detail]');
      for (var d = 0; d < detailButtons.length; d++) {
        detailButtons[d].addEventListener('click', function () {
          var id = this.getAttribute('data-detail');
          openMemberDetail(id, profileById(id), orgs);
        });
      }
    }
  };
}

async function openMemberDetail(userId, profile, orgs) {
  openSheet({
    title: profile ? (profile.full_name || '회원') : '회원 상세',
    subtitle: profile ? (profile.email || '') : '',
    wide: true,
    content: '<div id="md-body">' + loadingBlock('통합 이력을 불러오는 중') + '</div>',
    footer: '<button type="button" class="btn btn-primary" data-close>닫기</button>',
    onMount: async function (el) {
      var close = el.querySelector('[data-close]');
      if (close) close.addEventListener('click', function () { closeSheet(); });
      var body = el.querySelector('#md-body');
      try {
        var loaded = await Promise.all([
          listBookings(userId), listPayments(userId), listResults(userId),
          listSessions(userId), listNotes(userId), listPackages(userId)
        ]);
        var myMemberships = [];
        try { myMemberships = await listMembershipsForUser(userId); } catch (err) { myMemberships = []; }

        var bookings = loaded[0] || [];
        var payments = loaded[1] || [];
        var results = loaded[2] || [];
        var sessions = loaded[3] || [];
        var notes = loaded[4] || [];
        var packages = loaded[5] || [];

        var orgName = '';
        for (var i = 0; i < orgs.length; i++) if (String(orgs[i].id) === String(profile ? profile.org_id : '')) orgName = orgs[i].name;

        var paidTotal = payments.reduce(function (sum, p) { return p.status === 'paid' ? sum + Number(p.amount || 0) : sum; }, 0);

        body.innerHTML =
          '<div class="detail-grid">' +
            '<div class="detail-cell"><span>가입일</span><strong>' + fmtDate(profile ? profile.created_at : '') + '</strong></div>' +
            '<div class="detail-cell"><span>권한</span><strong>' + esc(ROLES[profile ? profile.role : ''] || '') + '</strong></div>' +
            '<div class="detail-cell"><span>등급</span><strong>' + esc(profile ? profile.member_grade : '') + '</strong></div>' +
            '<div class="detail-cell"><span>상태</span><strong>' + esc(PROFILE_STATUS[profile ? (profile.status || 'active') : 'active']) + '</strong></div>' +
            '<div class="detail-cell"><span>연락처</span><strong>' + esc(profile ? profile.phone || '-' : '-') + '</strong></div>' +
            '<div class="detail-cell"><span>소속 기관</span><strong>' + esc(orgName || '없음') + '</strong></div>' +
            '<div class="detail-cell"><span>누적 결제</span><strong>' + fmtKRW(paidTotal) + '</strong></div>' +
            '<div class="detail-cell"><span>목표</span><strong>' + esc(profile && profile.goals && profile.goals.length ? profile.goals.join(', ') : '-') + '</strong></div>' +
          '</div>' +

          '<h4 class="admin-h4">이용 프로그램 ' + packages.length + '개</h4>' +
          (packages.length
            ? packages.map(function (p) {
                return '<div class="mini-row"><span>' + esc(p.package_name) + '</span><strong>' +
                  Math.max(0, Number(p.total_sessions || 0) - Number(p.used_sessions || 0)) + ' / ' + p.total_sessions + '회 남음</strong>' +
                  badge(p.status === 'completed' ? '완료' : p.status === 'expired' ? '만료' : '진행 중', p.status === 'active' ? 'green' : 'neutral') + '</div>';
              }).join('')
            : '<p class="muted small">이용 중인 프로그램이 없습니다.</p>') +

          '<h4 class="admin-h4">예약 ' + bookings.length + '건</h4>' +
          (bookings.length
            ? bookings.slice(0, 12).map(function (b) {
                return '<div class="mini-row"><span>' + fmtDate(b.preferred_date) + ' ' + esc(b.preferred_time) + '</span><strong>' + esc(b.program_title) + '</strong>' +
                  badge(BOOKING_STATUS[b.status] || b.status, b.status === 'completed' ? 'green' : b.status === 'canceled' || b.status === 'noshow' ? 'red' : 'yellow') + '</div>';
              }).join('')
            : '<p class="muted small">예약이 없습니다.</p>') +

          '<h4 class="admin-h4">결제 ' + payments.length + '건</h4>' +
          (payments.length
            ? payments.map(function (p) {
                return '<div class="mini-row"><span>' + fmtDate(p.created_at) + '</span><strong>' + esc(p.title) + '</strong>' +
                  fmtKRW(p.amount) + badge(p.status === 'paid' ? '결제 완료' : p.status === 'refunded' ? '환불' : '대기', p.status === 'paid' ? 'green' : p.status === 'refunded' ? 'red' : 'yellow') + '</div>';
              }).join('')
            : '<p class="muted small">결제 내역이 없습니다.</p>') +

          '<h4 class="admin-h4">검사 결과 ' + results.length + '건</h4>' +
          (results.length
            ? results.map(function (r) {
                return '<div class="mini-row"><span>' + fmtDate(r.measured_at) + '</span><strong>' + esc(CHECK_TYPES[r.check_type] || r.check_type) + '</strong>' +
                  badge(r.is_public === false ? '비공개' : '공개', r.is_public === false ? 'neutral' : 'green') +
                  (r.file_path ? badge('결과지', 'navy') : '') + '</div>';
              }).join('')
            : '<p class="muted small">검사 결과가 없습니다.</p>') +

          '<h4 class="admin-h4">뉴로피드백 ' + sessions.length + '회</h4>' +
          (sessions.length
            ? sessions.map(function (s) {
                return '<div class="mini-row"><span>' + (s.session_no || '') + '회 · ' + fmtDate(s.trained_at) + '</span><strong>' + esc(s.protocol || '') + '</strong>' +
                  (s.counselor_name ? '<em class="muted small">' + esc(s.counselor_name) + '</em>' : '') + '</div>';
              }).join('')
            : '<p class="muted small">훈련 기록이 없습니다.</p>') +

          '<h4 class="admin-h4">상담 기록 ' + notes.length + '건</h4>' +
          (notes.length
            ? notes.map(function (n) {
                return '<div class="mini-row"><span>' + fmtDateTime(n.created_at) + '</span><strong>' + esc(n.memo) + '</strong></div>';
              }).join('')
            : '<p class="muted small">상담 기록이 없습니다.</p>') +

          '<h4 class="admin-h4">기관 소속 ' + myMemberships.length + '건</h4>' +
          (myMemberships.length
            ? myMemberships.map(function (m) {
                return '<div class="mini-row"><span>' + fmtDate(m.created_at) + '</span><strong>' + esc((m.organizations && m.organizations.name) || '기관') + '</strong>' +
                  badge(m.status === 'approved' ? '소속 승인' : m.status === 'pending' ? '대기' : '거절', m.status === 'approved' ? 'green' : m.status === 'pending' ? 'yellow' : 'neutral') +
                  badge(m.share_brain_results ? '결과 공유' : '공유 안 함', m.share_brain_results ? 'green' : 'neutral') + '</div>';
              }).join('')
            : '<p class="muted small">기관 소속이 없습니다.</p>');
      } catch (err) {
        body.innerHTML = noticeBox(friendlyError(err), 'warn');
      }
    }
  });
}
