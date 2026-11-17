/* S09. 관리자 콘솔 (#/admin) — 12개 관리 탭 */
import {
  CHECK_TYPES, BOOKING_STATUS, BOOKING_PAYMENT_STATUS, PAYMENT_STATUS, ROLES, GRADES, ORG_TYPES,
  COMMUNITY_CATEGORIES, ENROLLMENT_STATUS, categoryLabel
} from '../config.js';
import {
  state, isAdmin, isStaff, listProfiles, adminUpdateProfile,
  listBookings, adminSetBookingStatus, adminSetBookingPayment, listPayments, adminSetPaymentStatus,
  listResults, adminSaveResult, uploadResultFile,
  listPackages, adminSavePackage, adminUpdatePackage, listSessions, adminSaveSession,
  listAllPrograms, adminUpdateProgram,
  listCohorts, adminCreateCohort, adminUpdateCohort, listEnrollments, adminUpdateEnrollment, listMaterials, adminCreateMaterial,
  listPosts, createPost, updatePost, deletePost,
  listCoupons, adminCreateCoupon, adminUpdateCoupon,
  listNotes, adminCreateNote,
  listOrganizations, adminCreateOrganization, adminUpdateOrganization, listBranches, adminCreateBranch,
  getDashboard, friendlyError, todayStr
} from '../store.js';
import {
  icon, esc, fmtKRW, fmtDate, fmtDateTime, toast, emptyState, noticeBox, badge,
  openSheet, closeSheet, confirmDialog, setBusy, go
} from '../ui.js';

var TABS = [
  { id: 'overview', label: '운영 요약', ico: 'chart' },
  { id: 'members', label: '회원 관리', ico: 'users' },
  { id: 'results', label: '검사 결과', ico: 'file' },
  { id: 'neuro', label: '뉴로피드백', ico: 'sparkle' },
  { id: 'bookings', label: '예약 관리', ico: 'calendar' },
  { id: 'payments', label: '결제·매출', ico: 'wallet' },
  { id: 'programs', label: '프로그램', ico: 'grid' },
  { id: 'academy', label: '아카데미', ico: 'user' },
  { id: 'community', label: '커뮤니티', ico: 'chat' },
  { id: 'coupons', label: '쿠폰', ico: 'sparkle' },
  { id: 'notes', label: '상담 기록', ico: 'lock' },
  { id: 'b2b', label: 'B2B 제휴', ico: 'shield' }
];

function opt(value, label, selected) {
  return '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(label) + '</option>';
}

function memberSelect(profiles, id, placeholder) {
  var rows = '<option value="">' + esc(placeholder || '회원 선택') + '</option>';
  rows += profiles.map(function (p) {
    var label = (p.full_name || '(이름 없음)') + ' · ' + (p.email || '');
    return opt(p.id, label);
  }).join('');
  return '<select id="' + id + '">' + rows + '</select>';
}

function memberName(profiles, userId) {
  for (var i = 0; i < profiles.length; i++) {
    if (String(profiles[i].id) === String(userId)) return (profiles[i].full_name || '') + ' (' + (profiles[i].email || '') + ')';
  }
  return '알 수 없음';
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

function adminReadOnlyNotice() {
  return noticeBox('<strong>조회 전용</strong> — 이 계정은 상담사 권한으로, 회원 등급·역할 변경과 프로그램/쿠폰 수정은 총괄 관리자만 가능합니다.', 'neutral');
}

/* ------------------------------------------------------------ overview */
async function buildOverview(ctx) {
  var d = await getDashboard();
  var html =
    '<div class="stat-grid">' +
      statCard('누적 회원', d.members + '명', '가입 기준', 'navy') +
      statCard('오늘 예약', d.todayBookings.length + '건', '취소 제외', 'yellow') +
      statCard('검사 대기', d.pendingChecks.length + '건', '예약·확정 상태', 'ivory') +
      statCard('이번 달 매출', fmtKRW(d.monthRevenue), '누적 결제 ' + fmtKRW(d.revenue), 'ivory') +
    '</div>' +

    '<section class="admin-section">' +
      '<h2 class="admin-h2">최근 예약</h2>' +
      table(['일시', '프로그램', '회원', '상태', '금액'], d.recentBookings.length
        ? d.recentBookings.map(function (b) {
            return '<tr>' +
              '<td>' + fmtDate(b.preferred_date) + '<br><span class="muted small">' + esc(b.preferred_time) + '</span></td>' +
              '<td>' + esc(b.program_title) + '</td>' +
              '<td class="muted small">' + esc(b.booker_name || '') + '</td>' +
              '<td>' + badge(BOOKING_STATUS[b.status] || b.status, b.status === 'canceled' ? 'red' : b.status === 'completed' ? 'green' : 'yellow') + '</td>' +
              '<td>' + (Number(b.final_amount) > 0 ? fmtKRW(b.final_amount) : '상담 확정') + '</td>' +
            '</tr>';
          }).join('')
        : emptyRow(5, '아직 예약이 없습니다.')) +
    '</section>' +

    '<section class="admin-section">' +
      '<h2 class="admin-h2">최근 가입 회원</h2>' +
      table(['이름', '이메일', '권한', '등급', '가입일'], d.recentMembers.length
        ? d.recentMembers.map(function (p) {
            return '<tr><td>' + esc(p.full_name || '-') + '</td><td class="muted small">' + esc(p.email || '') + '</td>' +
              '<td>' + esc(ROLES[p.role] || p.role || '') + '</td><td>' + esc(p.member_grade || '') + '</td>' +
              '<td class="muted small">' + fmtDate(p.created_at) + '</td></tr>';
          }).join('')
        : emptyRow(5, '회원이 없습니다.')) +
    '</section>' +
    noticeBox('모든 수치는 실제 DB 집계입니다. 결제 완료 처리된 payments 금액만 매출로 계산합니다.', 'neutral');

  return { html: html, bind: function () {} };
}

/* ------------------------------------------------------------- members */
async function buildMembers(ctx) {
  var profiles = await listProfiles();
  var bookings = await listBookings();
  var results = await listResults();
  var sessions = await listSessions();
  var writable = isAdmin();

  var rows = profiles.map(function (p) {
    var bookingCount = bookings.filter(function (b) { return b.user_id === p.id; }).length;
    var resultCount = results.filter(function (r) { return r.user_id === p.id; }).length;
    var sessionCount = sessions.filter(function (s) { return s.user_id === p.id; }).length;
    return '<tr data-member-row="' + esc(p.id) + '">' +
      '<td><strong>' + esc(p.full_name || '-') + '</strong><br><span class="muted small">' + esc(p.email || '') + '</span><br><span class="muted small">' + esc(p.phone || '') + '</span></td>' +
      '<td>' + (writable
        ? '<select data-role="' + esc(p.id) + '">' + Object.keys(ROLES).map(function (role) { return opt(role, ROLES[role], p.role); }).join('') + '</select>'
        : esc(ROLES[p.role] || p.role || '')) + '</td>' +
      '<td>' + (writable
        ? '<select data-grade="' + esc(p.id) + '">' + Object.keys(GRADES).map(function (g) { return opt(g, g, p.member_grade); }).join('') + '</select>'
        : esc(p.member_grade || '')) + '</td>' +
      '<td class="muted small">예약 ' + bookingCount + ' · 검사 ' + resultCount + ' · 훈련 ' + sessionCount + '</td>' +
      '<td class="muted small">' + fmtDate(p.created_at) + '</td>' +
      '<td><button type="button" class="btn btn-ghost btn-xs" data-history="' + esc(p.id) + '">이력</button></td>' +
    '</tr>';
  }).join('');

  var html =
    (writable ? '' : adminReadOnlyNotice()) +
    '<section class="admin-section">' +
      '<div class="admin-toolbar">' +
        '<input type="search" id="member-search" placeholder="이름 · 이메일 검색">' +
        '<span class="muted small">총 ' + profiles.length + '명</span>' +
      '</div>' +
      table(['회원', '권한', '등급', '이용 이력', '가입일', ''], rows || emptyRow(6, '회원이 없습니다.')) +
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

      var roleSelects = el.querySelectorAll('[data-role]');
      for (var i = 0; i < roleSelects.length; i++) {
        roleSelects[i].addEventListener('change', async function () {
          var id = this.getAttribute('data-role');
          try {
            await adminUpdateProfile(id, { role: this.value });
            toast('권한이 변경되었습니다.', 'success');
          } catch (err) {
            toast(friendlyError(err), 'error');
            ctx.rerender();
          }
        });
      }

      var gradeSelects = el.querySelectorAll('[data-grade]');
      for (var g = 0; g < gradeSelects.length; g++) {
        gradeSelects[g].addEventListener('change', async function () {
          var id = this.getAttribute('data-grade');
          try {
            await adminUpdateProfile(id, { member_grade: this.value });
            toast('회원 등급이 변경되었습니다.', 'success');
          } catch (err) {
            toast(friendlyError(err), 'error');
            ctx.rerender();
          }
        });
      }

      var historyButtons = el.querySelectorAll('[data-history]');
      for (var h = 0; h < historyButtons.length; h++) {
        historyButtons[h].addEventListener('click', function () {
          var id = this.getAttribute('data-history');
          var profile = null;
          for (var k = 0; k < profiles.length; k++) if (String(profiles[k].id) === String(id)) profile = profiles[k];
          if (!profile) return;
          var mine = bookings.filter(function (b) { return b.user_id === id; });
          var myResults = results.filter(function (r) { return r.user_id === id; });
          var mySessions = sessions.filter(function (s) { return s.user_id === id; });
          openSheet({
            title: profile.full_name || '회원',
            subtitle: profile.email || '',
            wide: true,
            content:
              '<div class="detail-grid">' +
                '<div class="detail-cell"><span>권한</span><strong>' + esc(ROLES[profile.role] || '') + '</strong></div>' +
                '<div class="detail-cell"><span>등급</span><strong>' + esc(profile.member_grade || '') + '</strong></div>' +
                '<div class="detail-cell"><span>연락처</span><strong>' + esc(profile.phone || '-') + '</strong></div>' +
                '<div class="detail-cell"><span>가입일</span><strong>' + fmtDate(profile.created_at) + '</strong></div>' +
              '</div>' +
              '<h4 class="admin-h4">예약 ' + mine.length + '건</h4>' +
              (mine.length ? mine.map(function (b) {
                return '<div class="mini-row"><span>' + fmtDate(b.preferred_date) + ' ' + esc(b.preferred_time) + '</span><strong>' + esc(b.program_title) + '</strong>' +
                  badge(BOOKING_STATUS[b.status] || b.status, 'neutral') + '</div>';
              }).join('') : '<p class="muted small">예약 없음</p>') +
              '<h4 class="admin-h4">검사 결과 ' + myResults.length + '건</h4>' +
              (myResults.length ? myResults.map(function (r) {
                return '<div class="mini-row"><span>' + fmtDate(r.measured_at) + '</span><strong>' + esc(CHECK_TYPES[r.check_type] || r.check_type) + '</strong>' +
                  (r.file_path ? badge('파일 등록', 'green') : badge('파일 없음', 'neutral')) + '</div>';
              }).join('') : '<p class="muted small">검사 결과 없음</p>') +
              '<h4 class="admin-h4">뉴로피드백 ' + mySessions.length + '회</h4>' +
              (mySessions.length ? mySessions.map(function (s) {
                return '<div class="mini-row"><span>' + (s.session_no || '') + '회 · ' + fmtDate(s.trained_at) + '</span><strong>' + esc(s.protocol || '') + '</strong></div>';
              }).join('') : '<p class="muted small">훈련 기록 없음</p>'),
            footer: '<button type="button" class="btn btn-primary" data-close>닫기</button>',
            onMount: function (sheet) {
              var c = sheet.querySelector('[data-close]');
              if (c) c.addEventListener('click', function () { closeSheet(); });
            }
          });
        });
      }
    }
  };
}

/* ------------------------------------------------------------- results */
async function buildResults(ctx) {
  var profiles = await listProfiles();
  var results = await listResults();
  var sorted = results.slice().sort(function (a, b) { return String(b.measured_at).localeCompare(String(a.measured_at)); });

  var rows = sorted.map(function (r) {
    return '<tr>' +
      '<td>' + fmtDate(r.measured_at) + '</td>' +
      '<td class="muted small">' + esc(memberName(profiles, r.user_id)) + '</td>' +
      '<td>' + esc(CHECK_TYPES[r.check_type] || r.check_type) + '</td>' +
      '<td class="muted small">' + [r.focus_score, r.stress_index, r.balance_index, r.feedback_score].map(function (v) {
        return v === null || v === undefined ? '-' : Number(v).toFixed(1);
      }).join(' / ') + '</td>' +
      '<td>' + (r.file_path ? badge('업로드됨', 'green') : badge('미등록', 'neutral')) + '</td>' +
      '<td class="muted small">' + (r.next_recheck_date ? fmtDate(r.next_recheck_date) : '-') + '</td>' +
    '</tr>';
  }).join('');

  var html =
    '<section class="admin-section">' +
      '<h2 class="admin-h2">검사 결과 등록</h2>' +
      '<div class="admin-form">' +
        '<label class="field"><span class="field-label">회원</span>' + memberSelect(profiles, 'res-user', '회원을 선택하세요') + '</label>' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">검사 유형</span><select id="res-type">' +
            opt('simple', CHECK_TYPES.simple) + opt('full', CHECK_TYPES.full) + '</select></label>' +
          '<label class="field"><span class="field-label">측정일</span><input type="date" id="res-date" value="' + todayStr() + '"></label>' +
        '</div>' +
        '<div class="form-grid form-grid-4">' +
          '<label class="field"><span class="field-label">집중</span><input type="number" step="0.1" id="res-focus" placeholder="0.0"></label>' +
          '<label class="field"><span class="field-label">스트레스</span><input type="number" step="0.1" id="res-stress" placeholder="0.0"></label>' +
          '<label class="field"><span class="field-label">좌우 균형</span><input type="number" step="0.1" id="res-balance" placeholder="0.0"></label>' +
          '<label class="field"><span class="field-label">자기 피드백</span><input type="number" step="0.1" id="res-feedback" placeholder="0.0"></label>' +
        '</div>' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">감정 성향</span><input type="text" id="res-emotion" placeholder="예: 안정 균형형"></label>' +
          '<label class="field"><span class="field-label">다음 재검사 권장일</span><input type="date" id="res-recheck"></label>' +
        '</div>' +
        '<label class="field"><span class="field-label">요약 코멘트 (회원에게 표시)</span><textarea id="res-summary" rows="2" placeholder="결과 요약 · 웰니스 안내"></textarea></label>' +
        '<label class="field"><span class="field-label">결과지 파일 (PDF · 이미지)</span><input type="file" id="res-file" accept="application/pdf,image/*"></label>' +
        '<p class="field-hint">파일은 비공개 Storage 버킷 <code>brain-results/{user_id}/…</code> 에 업로드되며, 회원은 Signed URL로만 열람합니다. 업로드가 실패하면 Supabase Storage에 비공개 버킷 <code>brain-results</code>가 있는지 확인해 주세요.</p>' +
        '<button type="button" class="btn btn-primary" id="res-submit">결과 등록</button>' +
      '</div>' +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">등록된 검사 결과 (' + results.length + ')</h2>' +
      table(['측정일', '회원', '유형', '집중/스트레스/균형/피드백', '결과지', '재검사'], rows || emptyRow(6, '등록된 결과가 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var submit = el.querySelector('#res-submit');
      submit.addEventListener('click', async function () {
        var userId = el.querySelector('#res-user').value;
        if (!userId) { toast('회원을 선택해 주세요.'); return; }
        var date = el.querySelector('#res-date').value;
        if (!date) { toast('측정일을 입력해 주세요.'); return; }
        var fileInput = el.querySelector('#res-file');
        var file = fileInput && fileInput.files ? fileInput.files[0] : null;
        var num = function (selector) {
          var raw = el.querySelector(selector).value;
          if (raw === '' || raw === null || raw === undefined) return null;
          var value = Number(raw);
          return isFinite(value) ? value : null;
        };
        setBusy(submit, true, '등록 중');
        try {
          var uploaded = { file_path: '', file_name: '' };
          if (file) uploaded = await uploadResultFile(userId, file);
          await adminSaveResult({
            user_id: userId,
            booking_id: null,
            check_type: el.querySelector('#res-type').value,
            measured_at: date,
            focus_score: num('#res-focus'),
            stress_index: num('#res-stress'),
            balance_index: num('#res-balance'),
            feedback_score: num('#res-feedback'),
            emotion_type: el.querySelector('#res-emotion').value.trim(),
            summary_note: el.querySelector('#res-summary').value.trim(),
            file_path: uploaded.file_path,
            file_name: uploaded.file_name,
            next_recheck_date: el.querySelector('#res-recheck').value || null
          });
          toast('검사 결과가 등록되었습니다.', 'success');
          ctx.rerender();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });
    }
  };
}

/* --------------------------------------------------------------- neuro */
async function buildNeuro(ctx) {
  var profiles = await listProfiles();
  var packages = await listPackages();
  var sessions = await listSessions();
  var sortedSessions = sessions.slice().sort(function (a, b) { return Number(b.session_no || 0) - Number(a.session_no || 0); });

  var packageRows = packages.map(function (p) {
    var remain = Math.max(0, Number(p.total_sessions || 0) - Number(p.used_sessions || 0));
    return '<tr>' +
      '<td class="muted small">' + esc(memberName(profiles, p.user_id)) + '</td>' +
      '<td><strong>' + esc(p.package_name) + '</strong></td>' +
      '<td>' + p.used_sessions + ' / ' + p.total_sessions + '<br><span class="muted small">잔여 ' + remain + '회</span></td>' +
      '<td>' + badge(p.status === 'completed' ? '완료' : p.status === 'expired' ? '만료' : '진행 중', p.status === 'active' ? 'green' : 'neutral') + '</td>' +
      '<td><button type="button" class="btn btn-ghost btn-xs" data-pkg-use="' + esc(p.id) + '" data-delta="1">+1</button>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-pkg-use="' + esc(p.id) + '" data-delta="-1">-1</button></td>' +
    '</tr>';
  }).join('');

  var sessionRows = sortedSessions.map(function (s) {
    return '<tr>' +
      '<td>' + (s.session_no || '') + '회</td>' +
      '<td class="muted small">' + esc(memberName(profiles, s.user_id)) + '</td>' +
      '<td>' + fmtDate(s.trained_at) + '</td>' +
      '<td>' + esc(s.protocol || '-') + '</td>' +
      '<td class="muted small">' + (s.focus_metric === null || s.focus_metric === undefined ? '-' : Number(s.focus_metric).toFixed(1)) + ' / ' +
        (s.calm_metric === null || s.calm_metric === undefined ? '-' : Number(s.calm_metric).toFixed(1)) + '</td>' +
      '<td class="muted small">' + esc(s.prev_comparison || '-') + '</td>' +
      '<td class="muted small">' + esc(s.counselor_memo || '-') + '</td>' +
    '</tr>';
  }).join('');

  var html =
    '<section class="admin-section">' +
      '<h2 class="admin-h2">패키지 부여 · 회차 차감</h2>' +
      '<div class="admin-form">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">회원</span>' + memberSelect(profiles, 'pkg-user', '회원 선택') + '</label>' +
          '<label class="field"><span class="field-label">패키지명</span><input type="text" id="pkg-name" placeholder="예: 뉴로피드백 10회 패키지"></label>' +
        '</div>' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">총 횟수</span><input type="number" id="pkg-total" value="10" min="1"></label>' +
          '<label class="field"><span class="field-label">유효기간 (선택)</span><input type="date" id="pkg-expires"></label>' +
        '</div>' +
        '<button type="button" class="btn btn-primary" id="pkg-submit">패키지 부여</button>' +
      '</div>' +
    '</section>' +

    '<section class="admin-section">' +
      '<h2 class="admin-h2">보유 패키지 (' + packages.length + ')</h2>' +
      table(['회원', '패키지', '사용/총', '상태', '조정'], packageRows || emptyRow(5, '등록된 패키지가 없습니다.')) +
    '</section>' +

    '<section class="admin-section">' +
      '<h2 class="admin-h2">회차 기록 입력</h2>' +
      '<div class="admin-form">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">회원</span>' + memberSelect(profiles, 'ses-user', '회원 선택') + '</label>' +
          '<label class="field"><span class="field-label">연결 패키지 (선택)</span><select id="ses-package"><option value="">없음</option>' +
            packages.map(function (p) {
              return opt(p.id, p.package_name + ' · ' + memberName(profiles, p.user_id));
            }).join('') + '</select></label>' +
        '</div>' +
        '<div class="form-grid form-grid-3">' +
          '<label class="field"><span class="field-label">회차</span><input type="number" id="ses-no" value="1" min="1"></label>' +
          '<label class="field"><span class="field-label">훈련일</span><input type="date" id="ses-date" value="' + todayStr() + '"></label>' +
          '<label class="field"><span class="field-label">프로토콜</span><input type="text" id="ses-protocol" placeholder="예: SMR 집중 훈련"></label>' +
        '</div>' +
        '<div class="form-grid form-grid-4">' +
          '<label class="field"><span class="field-label">집중 지표</span><input type="number" step="0.1" id="ses-focus"></label>' +
          '<label class="field"><span class="field-label">이완 지표</span><input type="number" step="0.1" id="ses-calm"></label>' +
          '<label class="field span-2"><span class="field-label">이전 대비 코멘트</span><input type="text" id="ses-prev" placeholder="예: 집중 유지 시간 20% 향상"></label>' +
        '</div>' +
        '<label class="field"><span class="field-label">담당 상담사 메모 (회원에게 표시)</span><textarea id="ses-memo" rows="2"></textarea></label>' +
        '<button type="button" class="btn btn-primary" id="ses-submit">회차 기록 저장</button>' +
      '</div>' +
    '</section>' +

    '<section class="admin-section">' +
      '<h2 class="admin-h2">회차 기록 (' + sessions.length + ')</h2>' +
      table(['회차', '회원', '훈련일', '프로토콜', '집중/이완', '이전 대비', '상담사 메모'], sessionRows || emptyRow(7, '등록된 훈련 기록이 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var pkgSubmit = el.querySelector('#pkg-submit');
      pkgSubmit.addEventListener('click', async function () {
        var userId = el.querySelector('#pkg-user').value;
        var name = el.querySelector('#pkg-name').value.trim();
        var total = Number(el.querySelector('#pkg-total').value);
        if (!userId) { toast('회원을 선택해 주세요.'); return; }
        if (!name) { toast('패키지명을 입력해 주세요.'); return; }
        if (!total || total < 1) { toast('총 횟수를 입력해 주세요.'); return; }
        setBusy(pkgSubmit, true, '저장 중');
        try {
          await adminSavePackage({
            user_id: userId,
            package_name: name,
            total_sessions: total,
            used_sessions: 0,
            status: 'active',
            expires_at: el.querySelector('#pkg-expires').value || null
          });
          toast('패키지가 부여되었습니다.', 'success');
          ctx.rerender();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(pkgSubmit, false);
        }
      });

      var useButtons = el.querySelectorAll('[data-pkg-use]');
      for (var i = 0; i < useButtons.length; i++) {
        useButtons[i].addEventListener('click', async function () {
          var id = this.getAttribute('data-pkg-use');
          var delta = Number(this.getAttribute('data-delta'));
          var target = null;
          for (var k = 0; k < packages.length; k++) if (String(packages[k].id) === String(id)) target = packages[k];
          if (!target) return;
          var next = Math.max(0, Math.min(Number(target.total_sessions), Number(target.used_sessions || 0) + delta));
          try {
            await adminUpdatePackage(id, {
              used_sessions: next,
              status: next >= Number(target.total_sessions) ? 'completed' : 'active'
            });
            toast('회차가 조정되었습니다.', 'success');
            ctx.rerender();
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
        });
      }

      var sesSubmit = el.querySelector('#ses-submit');
      sesSubmit.addEventListener('click', async function () {
        var userId = el.querySelector('#ses-user').value;
        var packageId = el.querySelector('#ses-package').value;
        var date = el.querySelector('#ses-date').value;
        if (!userId) { toast('회원을 선택해 주세요.'); return; }
        if (!date) { toast('훈련일을 입력해 주세요.'); return; }
        var num = function (selector) {
          var raw = el.querySelector(selector).value;
          if (raw === '') return null;
          var value = Number(raw);
          return isFinite(value) ? value : null;
        };
        setBusy(sesSubmit, true, '저장 중');
        try {
          await adminSaveSession({
            user_id: userId,
            package_id: packageId || null,
            session_no: Number(el.querySelector('#ses-no').value) || 1,
            trained_at: date,
            protocol: el.querySelector('#ses-protocol').value.trim(),
            focus_metric: num('#ses-focus'),
            calm_metric: num('#ses-calm'),
            prev_comparison: el.querySelector('#ses-prev').value.trim(),
            counselor_memo: el.querySelector('#ses-memo').value.trim()
          });
          toast('회차 기록이 저장되었습니다.', 'success');
          ctx.rerender();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(sesSubmit, false);
        }
      });
    }
  };
}

/* ------------------------------------------------------------ bookings */
async function buildBookings(ctx) {
  var profiles = await listProfiles();
  var bookings = await listBookings();
  var writable = isAdmin();

  var rows = bookings.map(function (b) {
    return '<tr>' +
      '<td>' + fmtDate(b.preferred_date) + '<br><span class="muted small">' + esc(b.preferred_time) + '</span></td>' +
      '<td><strong>' + esc(b.program_title) + '</strong><br><span class="muted small">' + esc(b.booker_name || '') + ' · ' + esc(b.booker_phone || '') + '</span></td>' +
      '<td class="muted small">' + esc(memberName(profiles, b.user_id)) + '</td>' +
      '<td>' + (writable
        ? '<select data-bstatus="' + esc(b.id) + '">' + Object.keys(BOOKING_STATUS).map(function (s) { return opt(s, BOOKING_STATUS[s], b.status); }).join('') + '</select>'
        : badge(BOOKING_STATUS[b.status] || b.status, 'neutral')) + '</td>' +
      '<td>' + (writable
        ? '<select data-bpay="' + esc(b.id) + '">' + Object.keys(PAYMENT_STATUS).map(function (s) { return opt(s, PAYMENT_STATUS[s], b.payment_status === 'bank_transfer' ? 'pending_deposit' : b.payment_status === 'pending_pg' ? 'integration_required' : b.payment_status); }).join('') + '</select>'
        : badge(BOOKING_PAYMENT_STATUS[b.payment_status] || '', 'neutral')) + '</td>' +
      '<td>' + (Number(b.final_amount) > 0 ? fmtKRW(b.final_amount) : '상담 확정') + '</td>' +
      '<td class="muted small">' + fmtDate(b.created_at) + '</td>' +
    '</tr>';
  }).join('');

  var html =
    (writable ? '' : adminReadOnlyNotice()) +
    '<section class="admin-section">' +
      '<div class="admin-toolbar">' +
        '<input type="search" id="booking-search" placeholder="회원 · 프로그램 검색">' +
        '<span class="muted small">총 ' + bookings.length + '건</span>' +
      '</div>' +
      table(['일시', '프로그램 · 예약자', '회원', '예약 상태', '결제 상태', '금액', '접수일'], rows || emptyRow(7, '예약이 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var search = el.querySelector('#booking-search');
      if (search) {
        search.addEventListener('input', function () {
          var needle = this.value.toLowerCase();
          var trs = el.querySelectorAll('tbody tr');
          for (var i = 0; i < trs.length; i++) {
            trs[i].style.display = trs[i].textContent.toLowerCase().indexOf(needle) >= 0 ? '' : 'none';
          }
        });
      }

      var statusSelects = el.querySelectorAll('[data-bstatus]');
      for (var i = 0; i < statusSelects.length; i++) {
        statusSelects[i].addEventListener('change', async function () {
          try {
            await adminSetBookingStatus(this.getAttribute('data-bstatus'), this.value);
            toast('예약 상태가 변경되었습니다.', 'success');
          } catch (err) {
            toast(friendlyError(err), 'error');
            ctx.rerender();
          }
        });
      }

      var paySelects = el.querySelectorAll('[data-bpay]');
      for (var p = 0; p < paySelects.length; p++) {
        paySelects[p].addEventListener('change', async function () {
          try {
            await adminSetBookingPayment(this.getAttribute('data-bpay'), this.value);
            toast('결제 상태가 변경되었습니다.', 'success');
          } catch (err) {
            toast(friendlyError(err), 'error');
            ctx.rerender();
          }
        });
      }
    }
  };
}

/* ------------------------------------------------------------ payments */
async function buildPayments(ctx) {
  var profiles = await listProfiles();
  var payments = await listPayments();
  var writable = isAdmin();
  var paid = payments.filter(function (p) { return p.status === 'paid'; });
  var paidTotal = paid.reduce(function (sum, p) { return sum + Number(p.amount || 0); }, 0);
  var pending = payments.filter(function (p) { return p.status !== 'paid' && p.status !== 'refunded'; });

  var rows = payments.map(function (p) {
    return '<tr>' +
      '<td class="muted small">' + fmtDate(p.created_at) + '</td>' +
      '<td class="muted small">' + esc(memberName(profiles, p.user_id)) + '</td>' +
      '<td>' + esc(p.title) + '</td>' +
      '<td>' + fmtKRW(p.amount) + '</td>' +
      '<td>' + (writable
        ? '<select data-pay-status="' + esc(p.id) + '">' + Object.keys(PAYMENT_STATUS).map(function (s) { return opt(s, PAYMENT_STATUS[s], p.status); }).join('') + '</select>'
        : badge(PAYMENT_STATUS[p.status] || p.status, 'neutral')) + '</td>' +
      '<td class="muted small">' + esc(p.receipt_note || '') + '</td>' +
    '</tr>';
  }).join('');

  var html =
    (writable ? '' : adminReadOnlyNotice()) +
    '<div class="stat-grid">' +
      statCard('결제 완료 합계', fmtKRW(paidTotal), paid.length + '건', 'navy') +
      statCard('입금 확인 대기', pending.length + '건', 'PG 연동 대기 포함', 'yellow') +
      statCard('결제 수단', 'PG 연동 대기', '무통장 · 현장 확인', 'ivory') +
    '</div>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">결제 내역 (' + payments.length + ')</h2>' +
      table(['일자', '회원', '항목', '금액', '상태', '비고'], rows || emptyRow(6, '결제 내역이 없습니다.')) +
      noticeBox('온라인 카드결제(PG) 가맹점 키 연동 후 자동 결제·환불이 활성화됩니다. 현재는 입금 확인·현장 결제 상태를 수동으로 관리합니다.', 'neutral') +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var selects = el.querySelectorAll('[data-pay-status]');
      for (var i = 0; i < selects.length; i++) {
        selects[i].addEventListener('change', async function () {
          try {
            await adminSetPaymentStatus(this.getAttribute('data-pay-status'), this.value);
            toast('결제 상태가 변경되었습니다.', 'success');
          } catch (err) {
            toast(friendlyError(err), 'error');
            ctx.rerender();
          }
        });
      }
    }
  };
}

/* ------------------------------------------------------------ programs */
async function buildPrograms(ctx) {
  var programs = await listAllPrograms();
  var writable = isAdmin();

  var rows = programs.map(function (p) {
    return '<tr data-program-row="' + esc(p.id) + '">' +
      '<td><strong>' + esc(p.title) + '</strong><br><span class="muted small">' + esc(p.category) + ' · ' + esc(p.sub_category || '') + '</span></td>' +
      '<td>' + (writable ? '<input type="number" class="input-sm" data-pfield="price_krw" value="' + (p.price_krw === null || p.price_krw === undefined ? '' : p.price_krw) + '" placeholder="미정">' : (p.price_krw ? fmtKRW(p.price_krw) : '-')) + '</td>' +
      '<td>' + (writable ? '<input type="text" class="input-sm" data-pfield="price_label" value="' + esc(p.price_label || '') + '">' : esc(p.price_label || '')) + '</td>' +
      '<td>' + (writable ? '<input type="text" class="input-sm" data-pfield="duration_text" value="' + esc(p.duration_text || '') + '">' : esc(p.duration_text || '')) + '</td>' +
      '<td>' + (writable ? '<label class="switch"><input type="checkbox" data-pfield="active"' + (p.active ? ' checked' : '') + '><span></span></label>' : (p.active ? '노출' : '숨김')) + '</td>' +
      '<td>' + (writable
        ? '<button type="button" class="btn btn-ghost btn-xs" data-psave="' + esc(p.id) + '">저장</button>' +
          '<button type="button" class="btn btn-ghost btn-xs" data-pdesc="' + esc(p.id) + '">설명</button>'
        : '') + '</td>' +
    '</tr>';
  }).join('');

  var html =
    (writable ? '' : adminReadOnlyNotice()) +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">프로그램 · 가격 관리</h2>' +
      '<p class="muted small">가격과 노출 여부는 저장 즉시 앱 화면에 반영됩니다. 가격 미확정 상품은 price_label(예: 상담 확정 · 관리자 설정가)만 표시됩니다.</p>' +
      table(['프로그램', '가격(원)', '가격 표시 문구', '소요 시간', '노출', ''], rows || emptyRow(6, '프로그램이 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var saveButtons = el.querySelectorAll('[data-psave]');
      for (var i = 0; i < saveButtons.length; i++) {
        saveButtons[i].addEventListener('click', async function () {
          var id = this.getAttribute('data-psave');
          var row = el.querySelector('[data-program-row="' + id + '"]');
          if (!row) return;
          var priceRaw = row.querySelector('[data-pfield="price_krw"]').value;
          var patch = {
            price_krw: priceRaw === '' ? null : Number(priceRaw),
            price_label: row.querySelector('[data-pfield="price_label"]').value.trim(),
            duration_text: row.querySelector('[data-pfield="duration_text"]').value.trim(),
            active: row.querySelector('[data-pfield="active"]').checked
          };
          setBusy(this, true, '저장');
          try {
            await adminUpdateProgram(id, patch);
            toast('프로그램 정보가 저장되었습니다.', 'success');
            setBusy(this, false);
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(this, false);
          }
        });
      }

      var descButtons = el.querySelectorAll('[data-pdesc]');
      for (var d = 0; d < descButtons.length; d++) {
        descButtons[d].addEventListener('click', function () {
          var id = this.getAttribute('data-pdesc');
          var target = null;
          for (var k = 0; k < programs.length; k++) if (programs[k].id === id) target = programs[k];
          if (!target) return;
          openSheet({
            title: target.title,
            subtitle: '설명 · 추천 대상 수정',
            content:
              '<label class="field"><span class="field-label">소개</span><textarea id="pd-desc" rows="4">' + esc(target.description || '') + '</textarea></label>' +
              '<label class="field"><span class="field-label">추천 대상</span><textarea id="pd-target" rows="2">' + esc(target.target_audience || '') + '</textarea></label>' +
              '<label class="field"><span class="field-label">진행 방식</span><textarea id="pd-format" rows="2">' + esc(target.format_method || '') + '</textarea></label>',
            footer: '<button type="button" class="btn btn-ghost" data-close>닫기</button>' +
              '<button type="button" class="btn btn-primary" id="pd-save">저장</button>',
            onMount: function (sheet) {
              var c = sheet.querySelector('[data-close]');
              if (c) c.addEventListener('click', function () { closeSheet(); });
              var save = sheet.querySelector('#pd-save');
              save.addEventListener('click', async function () {
                try {
                  await adminUpdateProgram(id, {
                    description: sheet.querySelector('#pd-desc').value.trim(),
                    target_audience: sheet.querySelector('#pd-target').value.trim(),
                    format_method: sheet.querySelector('#pd-format').value.trim()
                  });
                  toast('설명이 저장되었습니다.', 'success');
                  closeSheet();
                  ctx.rerender();
                } catch (err) {
                  toast(friendlyError(err), 'error');
                }
              });
            }
          });
        });
      }
    }
  };
}

/* ------------------------------------------------------------- academy */
async function buildAcademy(ctx) {
  var cohorts = await listCohorts();
  var enrollments = await listEnrollments();
  var materials = await listMaterials();
  var profiles = await listProfiles();
  var writable = isAdmin();

  var cohortRows = cohorts.map(function (c) {
    return '<tr>' +
      '<td><strong>' + esc(c.title) + '</strong></td>' +
      '<td class="muted small">' + esc(c.schedule_text) + '<br>' + esc(c.hours_text) + '</td>' +
      '<td class="muted small">' + esc(c.fee_label) + '</td>' +
      '<td><select data-cohort-status="' + esc(c.id) + '"' + (writable ? '' : ' disabled') + '>' +
        opt('recruiting', '모집 중', c.status) + opt('ongoing', '진행 중', c.status) + opt('closed', '마감', c.status) +
      '</select></td>' +
    '</tr>';
  }).join('');

  var enrollRows = enrollments.map(function (e) {
    var cohort = null;
    for (var i = 0; i < cohorts.length; i++) if (String(cohorts[i].id) === String(e.cohort_id)) cohort = cohorts[i];
    return '<tr>' +
      '<td class="muted small">' + esc(cohort ? cohort.title : '-') + '</td>' +
      '<td><strong>' + esc(e.applicant_name) + '</strong><br><span class="muted small">' + esc(e.applicant_phone) + '</span></td>' +
      '<td>' + esc(memberName(profiles, e.user_id)).split(' (')[0] + '</td>' +
      '<td>' + (writable
        ? '<select data-enr-status="' + esc(e.id) + '">' + Object.keys(ENROLLMENT_STATUS).map(function (s) { return opt(s, ENROLLMENT_STATUS[s], e.status); }).join('') + '</select>'
        : badge(ENROLLMENT_STATUS[e.status] || e.status, 'neutral')) + '</td>' +
      '<td>' + (writable
        ? '<input type="number" class="input-sm" value="' + Number(e.progress_hours || 0) + '" min="0" max="40" data-enr-progress="' + esc(e.id) + '"> / 40h'
        : Number(e.progress_hours || 0) + ' / 40h') + '</td>' +
      '<td>' + (writable
        ? '<select data-enr-exam="' + esc(e.id) + '">' + opt('pending', '응시 전', e.exam_status) + opt('passed', '합격', e.exam_status) + opt('failed', '불합격', e.exam_status) + '</select>'
        : (e.exam_status === 'passed' ? '합격' : e.exam_status === 'failed' ? '불합격' : '응시 전')) + '</td>' +
      '<td>' + (writable ? '<button type="button" class="btn btn-ghost btn-xs" data-enr-save="' + esc(e.id) + '">저장</button>' : '') + '</td>' +
    '</tr>';
  }).join('');

  var materialRows = materials.map(function (m) {
    return '<tr><td>' + esc(m.title) + '</td><td class="muted small">' + esc(m.body || '') + '</td>' +
      '<td>' + (m.is_notice ? badge('공지', 'yellow') : badge('자료', 'neutral')) + '</td>' +
      '<td class="muted small">' + (m.file_url ? '<a href="' + esc(m.file_url) + '" target="_blank" rel="noopener">링크</a>' : '-') + '</td>' +
      '<td class="muted small">' + fmtDate(m.created_at) + '</td></tr>';
  }).join('');

  var html =
    '<section class="admin-section">' +
      '<h2 class="admin-h2">기수 관리</h2>' +
      (writable ? '' : noticeBox('기수 추가·변경과 교육생 상태 변경은 총괄 관리자만 가능합니다. (상담사 계정은 조회 전용)', 'neutral')) +
      (writable ? '<div class="admin-form">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">기수명</span><input type="text" id="coh-title" placeholder="예: 2027년 2기 뇌교육상담사 과정"></label>' +
          '<label class="field"><span class="field-label">일정</span><input type="text" id="coh-schedule" placeholder="예: 매주 토요일 09:00~18:00"></label>' +
        '</div>' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">교육비 문구</span><input type="text" id="coh-fee" value="교육비 상담 안내 (관리자에서 금액 확정 반영)"></label>' +
          '<label class="field"><span class="field-label">정원</span><input type="number" id="coh-capacity" value="20" min="1"></label>' +
        '</div>' +
        '<button type="button" class="btn btn-primary" id="coh-submit">기수 추가</button>' +
      '</div>' : '') +
      table(['기수', '일정 · 시간', '교육비', '상태'], cohortRows || emptyRow(4, '기수가 없습니다.')) +
    '</section>' +

    '<section class="admin-section">' +
      '<h2 class="admin-h2">교육생 관리 (' + enrollments.length + ')</h2>' +
      table(['기수', '신청자', '회원', '수강 상태', '진도', '시험', ''], enrollRows || emptyRow(7, '수강 신청이 없습니다.')) +
    '</section>' +

    '<section class="admin-section">' +
      '<h2 class="admin-h2">교육 자료 · 공지</h2>' +
      (writable ? '<div class="admin-form">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">기수</span><select id="mat-cohort"><option value="">전체</option>' +
            cohorts.map(function (c) { return opt(c.id, c.title); }).join('') + '</select></label>' +
          '<label class="field"><span class="field-label">구분</span><select id="mat-notice">' + opt('false', '자료') + opt('true', '공지') + '</select></label>' +
        '</div>' +
        '<label class="field"><span class="field-label">제목</span><input type="text" id="mat-title" placeholder="교육 자료 제목"></label>' +
        '<label class="field"><span class="field-label">내용</span><textarea id="mat-body" rows="2"></textarea></label>' +
        '<label class="field"><span class="field-label">파일 링크 (선택)</span><input type="url" id="mat-url" placeholder="https://"></label>' +
        '<button type="button" class="btn btn-primary" id="mat-submit">자료 등록</button>' +
      '</div>' : '') +
      table(['제목', '내용', '구분', '링크', '등록일'], materialRows || emptyRow(5, '등록된 자료가 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      if (!writable) return;
      var cohSubmit = el.querySelector('#coh-submit');
      cohSubmit.addEventListener('click', async function () {
        var title = el.querySelector('#coh-title').value.trim();
        var schedule = el.querySelector('#coh-schedule').value.trim();
        if (!title || !schedule) { toast('기수명과 일정을 입력해 주세요.'); return; }
        setBusy(cohSubmit, true, '추가 중');
        try {
          await adminCreateCohort({
            title: title,
            schedule_text: schedule,
            fee_label: el.querySelector('#coh-fee').value.trim(),
            capacity: Number(el.querySelector('#coh-capacity').value) || 20
          });
          toast('기수가 추가되었습니다.', 'success');
          ctx.rerender();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(cohSubmit, false);
        }
      });

      var cohortStatus = el.querySelectorAll('[data-cohort-status]');
      for (var i = 0; i < cohortStatus.length; i++) {
        cohortStatus[i].addEventListener('change', async function () {
          try {
            await adminUpdateCohort(this.getAttribute('data-cohort-status'), { status: this.value });
            toast('기수 상태가 변경되었습니다.', 'success');
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
        });
      }

      var saveButtons = el.querySelectorAll('[data-enr-save]');
      for (var s = 0; s < saveButtons.length; s++) {
        saveButtons[s].addEventListener('click', async function () {
          var id = this.getAttribute('data-enr-save');
          var statusEl = el.querySelector('[data-enr-status="' + id + '"]');
          var progressEl = el.querySelector('[data-enr-progress="' + id + '"]');
          var examEl = el.querySelector('[data-enr-exam="' + id + '"]');
          setBusy(this, true, '저장');
          try {
            await adminUpdateEnrollment(id, {
              status: statusEl.value,
              progress_hours: Number(progressEl.value) || 0,
              exam_status: examEl.value
            });
            toast('교육생 정보가 저장되었습니다.', 'success');
            setBusy(this, false);
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(this, false);
          }
        });
      }

      var matSubmit = el.querySelector('#mat-submit');
      if (!matSubmit) return;
      matSubmit.addEventListener('click', async function () {
        var title = el.querySelector('#mat-title').value.trim();
        if (!title) { toast('제목을 입력해 주세요.'); return; }
        setBusy(matSubmit, true, '등록 중');
        try {
          await adminCreateMaterial({
            cohort_id: el.querySelector('#mat-cohort').value || null,
            title: title,
            body: el.querySelector('#mat-body').value.trim(),
            file_url: el.querySelector('#mat-url').value.trim(),
            is_notice: el.querySelector('#mat-notice').value === 'true'
          });
          toast('자료가 등록되었습니다.', 'success');
          ctx.rerender();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(matSubmit, false);
        }
      });
    }
  };
}

/* ----------------------------------------------------------- community */
async function buildCommunity(ctx) {
  var posts = await listPosts();
  var rows = posts.map(function (p) {
    return '<tr>' +
      '<td class="muted small">' + esc(categoryLabel(p.category)) + '</td>' +
      '<td><strong>' + esc(p.title) + '</strong>' +
        (p.is_pinned ? ' ' + badge('고정', 'yellow') : '') +
        (p.is_hidden ? ' ' + badge('숨김', 'red') : '') + '</td>' +
      '<td class="muted small">' + esc(p.author_name || '') + '</td>' +
      '<td class="muted small">' + fmtDate(p.created_at) + '</td>' +
      '<td>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-post-pin="' + esc(p.id) + '">' + (p.is_pinned ? '고정해제' : '고정') + '</button>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-post-hide="' + esc(p.id) + '">' + (p.is_hidden ? '숨김해제' : '숨김') + '</button>' +
        '<button type="button" class="btn btn-ghost btn-xs btn-quiet-danger" data-post-del="' + esc(p.id) + '">삭제</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  var catOptions = COMMUNITY_CATEGORIES.map(function (c) { return opt(c.id, c.label, c.id === 'notice' ? 'notice' : null); }).join('');

  var html =
    '<section class="admin-section">' +
      '<h2 class="admin-h2">공지 · 게시글 작성</h2>' +
      '<div class="admin-form">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">카테고리</span><select id="cp-cat">' + catOptions + '</select></label>' +
          '<label class="field field-inline"><span class="field-label">상단 고정</span><label class="switch"><input type="checkbox" id="cp-pin"><span></span></label></label>' +
        '</div>' +
        '<label class="field"><span class="field-label">제목</span><input type="text" id="cp-title"></label>' +
        '<label class="field"><span class="field-label">내용</span><textarea id="cp-body" rows="4"></textarea></label>' +
        '<button type="button" class="btn btn-primary" id="cp-submit">게시</button>' +
      '</div>' +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">전체 게시글 (' + posts.length + ')</h2>' +
      table(['카테고리', '제목', '작성자', '작성일', ''], rows || emptyRow(5, '게시글이 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var submit = el.querySelector('#cp-submit');
      submit.addEventListener('click', async function () {
        var title = el.querySelector('#cp-title').value.trim();
        var body = el.querySelector('#cp-body').value.trim();
        if (!title || !body) { toast('제목과 내용을 입력해 주세요.'); return; }
        setBusy(submit, true, '게시 중');
        try {
          var post = await createPost({
            category: el.querySelector('#cp-cat').value,
            title: title,
            body: body,
            is_pinned: el.querySelector('#cp-pin').checked
          });
          if (!post) throw new Error('게시글을 저장하지 못했습니다.');
          toast('게시되었습니다.', 'success');
          ctx.rerender();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });

      var pinButtons = el.querySelectorAll('[data-post-pin]');
      for (var i = 0; i < pinButtons.length; i++) {
        pinButtons[i].addEventListener('click', async function () {
          var id = this.getAttribute('data-post-pin');
          var target = null;
          for (var k = 0; k < posts.length; k++) if (String(posts[k].id) === String(id)) target = posts[k];
          if (!target) return;
          try {
            await updatePost(id, { is_pinned: !target.is_pinned });
            toast('고정 상태가 변경되었습니다.', 'success');
            ctx.rerender();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }

      var hideButtons = el.querySelectorAll('[data-post-hide]');
      for (var h = 0; h < hideButtons.length; h++) {
        hideButtons[h].addEventListener('click', async function () {
          var id = this.getAttribute('data-post-hide');
          var target = null;
          for (var k = 0; k < posts.length; k++) if (String(posts[k].id) === String(id)) target = posts[k];
          if (!target) return;
          try {
            await updatePost(id, { is_hidden: !target.is_hidden });
            toast('숨김 상태가 변경되었습니다.', 'success');
            ctx.rerender();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }

      var delButtons = el.querySelectorAll('[data-post-del]');
      for (var d = 0; d < delButtons.length; d++) {
        delButtons[d].addEventListener('click', async function () {
          var id = this.getAttribute('data-post-del');
          var ok = await confirmDialog({ title: '게시글 삭제', message: '이 게시글과 모든 댓글이 삭제됩니다. 계속할까요?', confirmLabel: '삭제' });
          if (!ok) return;
          try {
            await deletePost(id);
            toast('삭제되었습니다.', 'success');
            ctx.rerender();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }
    }
  };
}

/* ------------------------------------------------------------- coupons */
async function buildCoupons(ctx) {
  var coupons = await listCoupons();
  var writable = isAdmin();
  var rows = coupons.map(function (c) {
    return '<tr>' +
      '<td><strong>' + esc(c.code) + '</strong></td>' +
      '<td>' + esc(c.title) + '</td>' +
      '<td>' + (c.discount_type === 'percent' ? c.discount_value + '%' : fmtKRW(c.discount_value)) + '</td>' +
      '<td>' + fmtKRW(c.min_amount || 0) + '</td>' +
      '<td>' + (c.expires_at ? fmtDate(c.expires_at) : '무기한') + '</td>' +
      '<td>' + (writable
        ? '<button type="button" class="btn btn-ghost btn-xs" data-coupon-toggle="' + esc(c.code) + '" data-active="' + (c.active ? '1' : '0') + '">' + (c.active ? '비활성' : '활성') + '</button>'
        : badge(c.active ? '사용 가능' : '중지', c.active ? 'green' : 'neutral')) + '</td>' +
    '</tr>';
  }).join('');

  var html =
    (writable ? '' : adminReadOnlyNotice()) +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">쿠폰 발행</h2>' +
      '<div class="admin-form">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">쿠폰 코드</span><input type="text" id="c-code" placeholder="예: MINAWELCOME2" style="text-transform:uppercase"></label>' +
          '<label class="field"><span class="field-label">쿠폰명</span><input type="text" id="c-title" placeholder="예: 신규 회원 10% 할인"></label>' +
        '</div>' +
        '<div class="form-grid form-grid-4">' +
          '<label class="field"><span class="field-label">할인 방식</span><select id="c-type">' + opt('percent', '정률(%)') + opt('fixed', '정액(원)') + '</select></label>' +
          '<label class="field"><span class="field-label">할인 값</span><input type="number" id="c-value" value="10" min="1"></label>' +
          '<label class="field"><span class="field-label">최소 금액</span><input type="number" id="c-min" value="0" min="0"></label>' +
          '<label class="field"><span class="field-label">만료일</span><input type="date" id="c-expires"></label>' +
        '</div>' +
        '<button type="button" class="btn btn-primary" id="c-submit">쿠폰 발행</button>' +
      '</div>' +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">쿠폰 목록 (' + coupons.length + ')</h2>' +
      table(['코드', '쿠폰명', '할인', '최소 금액', '만료', ''], rows || emptyRow(6, '쿠폰이 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var submit = el.querySelector('#c-submit');
      submit.addEventListener('click', async function () {
        var code = el.querySelector('#c-code').value.trim();
        var title = el.querySelector('#c-title').value.trim();
        var value = Number(el.querySelector('#c-value').value);
        if (!code || !title) { toast('쿠폰 코드와 이름을 입력해 주세요.'); return; }
        if (!value || value < 1) { toast('할인 값을 입력해 주세요.'); return; }
        setBusy(submit, true, '발행 중');
        try {
          await adminCreateCoupon({
            code: code,
            title: title,
            discount_type: el.querySelector('#c-type').value,
            discount_value: value,
            min_amount: Number(el.querySelector('#c-min').value) || 0,
            active: true,
            expires_at: el.querySelector('#c-expires').value || null
          });
          toast('쿠폰이 발행되었습니다.', 'success');
          ctx.rerender();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });

      var toggles = el.querySelectorAll('[data-coupon-toggle]');
      for (var i = 0; i < toggles.length; i++) {
        toggles[i].addEventListener('click', async function () {
          var code = this.getAttribute('data-coupon-toggle');
          var active = this.getAttribute('data-active') === '1';
          try {
            await adminUpdateCoupon(code, { active: !active });
            toast('쿠폰 상태가 변경되었습니다.', 'success');
            ctx.rerender();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }
    }
  };
}

/* --------------------------------------------------------------- notes */
async function buildNotes(ctx) {
  var profiles = await listProfiles();
  var notes = await listNotes();
  var rows = notes.map(function (n) {
    return '<tr>' +
      '<td class="muted small">' + esc(memberName(profiles, n.user_id)) + '</td>' +
      '<td>' + esc(n.memo) + '</td>' +
      '<td class="muted small">' + fmtDateTime(n.created_at) + '</td>' +
    '</tr>';
  }).join('');

  var html =
    noticeBox('비공개 상담 기록은 관리자·상담사만 조회할 수 있으며, 회원 화면에는 표시되지 않습니다.', 'neutral') +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">상담 메모 작성</h2>' +
      '<div class="admin-form">' +
        '<label class="field"><span class="field-label">회원</span>' + memberSelect(profiles, 'note-user', '회원 선택') + '</label>' +
        '<label class="field"><span class="field-label">상담 메모</span><textarea id="note-memo" rows="4" placeholder="상담 내용 · 관찰 · 다음 계획"></textarea></label>' +
        '<button type="button" class="btn btn-primary" id="note-submit">기록 저장</button>' +
      '</div>' +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">상담 기록 (' + notes.length + ')</h2>' +
      table(['회원', '메모', '기록일'], rows || emptyRow(3, '상담 기록이 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var submit = el.querySelector('#note-submit');
      submit.addEventListener('click', async function () {
        var userId = el.querySelector('#note-user').value;
        var memo = el.querySelector('#note-memo').value.trim();
        if (!userId) { toast('회원을 선택해 주세요.'); return; }
        if (!memo) { toast('메모를 입력해 주세요.'); return; }
        setBusy(submit, true, '저장 중');
        try {
          await adminCreateNote(userId, memo);
          toast('상담 기록이 저장되었습니다.', 'success');
          ctx.rerender();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });
    }
  };
}

/* ----------------------------------------------------------------- b2b */
async function buildB2B(ctx) {
  var orgs = await listOrganizations();
  var branches = await listBranches();
  var profiles = await listProfiles();
  var bookings = await listBookings();
  var writable = isAdmin();

  var orgRows = orgs.map(function (o) {
    return '<tr>' +
      '<td><strong>' + esc(o.name) + '</strong><br><span class="muted small">' + esc(ORG_TYPES[o.org_type] || o.org_type) + '</span></td>' +
      '<td class="muted small">' + esc(o.contact_name || '-') + '<br>' + esc(o.contact_phone || '') + '<br>' + esc(o.contact_email || '') + '</td>' +
      '<td>' + (writable
        ? '<select data-org-status="' + esc(o.id) + '">' + opt('active', '활성', o.status) + opt('pending', '대기', o.status) + opt('paused', '중지', o.status) + '</select>'
        : badge(o.status, 'neutral')) + '</td>' +
      '<td class="muted small">' + fmtDate(o.created_at) + '</td>' +
    '</tr>';
  }).join('');

  var branchRows = branches.map(function (b) {
    var org = null;
    for (var i = 0; i < orgs.length; i++) if (String(orgs[i].id) === String(b.org_id)) org = orgs[i];
    return '<tr>' +
      '<td>' + esc(org ? org.name : '-') + '</td>' +
      '<td><strong>' + esc(b.name) + '</strong></td>' +
      '<td class="muted small">' + esc(b.address || '-') + '</td>' +
      '<td class="muted small">' + esc(b.phone || '-') + '</td>' +
      '<td>' + badge(b.status === 'active' ? '활성' : b.status, 'neutral') + '</td>' +
    '</tr>';
  }).join('');

  var orgStats = orgs.map(function (o) {
    var memberCount = profiles.filter(function (p) { return String(p.org_id) === String(o.id); }).length;
    var bookingCount = bookings.filter(function (b) { return String(b.org_id) === String(o.id); }).length;
    return '<tr><td>' + esc(o.name) + '</td><td>' + esc(ORG_TYPES[o.org_type] || o.org_type) + '</td>' +
      '<td>' + memberCount + '명</td><td>' + bookingCount + '건</td></tr>';
  }).join('');

  var html =
    (writable ? '' : adminReadOnlyNotice()) +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">제휴 기관 등록</h2>' +
      '<p class="muted small">기업 · 헬스장 · 필라테스 · 요가 · 병원 · 호텔 · 웰니스센터 제휴를 등록하면 회원·예약에 기관/지점을 연결할 수 있습니다.</p>' +
      (writable
        ? '<div class="admin-form">' +
            '<div class="form-grid">' +
              '<label class="field"><span class="field-label">기관명</span><input type="text" id="org-name" placeholder="예: OO기업 복지팀"></label>' +
              '<label class="field"><span class="field-label">유형</span><select id="org-type">' +
                Object.keys(ORG_TYPES).map(function (key) { return opt(key, ORG_TYPES[key]); }).join('') + '</select></label>' +
            '</div>' +
            '<div class="form-grid form-grid-3">' +
              '<label class="field"><span class="field-label">담당자</span><input type="text" id="org-contact"></label>' +
              '<label class="field"><span class="field-label">연락처</span><input type="tel" id="org-phone"></label>' +
              '<label class="field"><span class="field-label">이메일</span><input type="email" id="org-email"></label>' +
            '</div>' +
            '<label class="field"><span class="field-label">메모</span><input type="text" id="org-notes" placeholder="제휴 조건 · 예상 인원"></label>' +
            '<button type="button" class="btn btn-primary" id="org-submit">기관 등록</button>' +
          '</div>'
        : '') +
      table(['기관', '담당자', '상태', '등록일'], orgRows || emptyRow(4, '등록된 기관이 없습니다.')) +
    '</section>' +

    '<section class="admin-section">' +
      '<h2 class="admin-h2">지점 관리</h2>' +
      (writable
        ? '<div class="admin-form">' +
            '<div class="form-grid">' +
              '<label class="field"><span class="field-label">소속 기관</span><select id="br-org"><option value="">선택</option>' +
                orgs.map(function (o) { return opt(o.id, o.name); }).join('') + '</select></label>' +
              '<label class="field"><span class="field-label">지점명</span><input type="text" id="br-name" placeholder="예: 강남점"></label>' +
            '</div>' +
            '<div class="form-grid form-grid-3">' +
              '<label class="field"><span class="field-label">주소</span><input type="text" id="br-address"></label>' +
              '<label class="field"><span class="field-label">전화</span><input type="tel" id="br-phone"></label>' +
              '<label class="field field-inline"><span class="field-label">등록</span><button type="button" class="btn btn-primary btn-sm" id="br-submit">지점 추가</button></label>' +
            '</div>' +
          '</div>'
        : '') +
      table(['기관', '지점', '주소', '전화', '상태'], branchRows || emptyRow(5, '등록된 지점이 없습니다.')) +
    '</section>' +

    '<section class="admin-section">' +
      '<h2 class="admin-h2">기관별 현황</h2>' +
      table(['기관', '유형', '연결 회원', '예약'], orgStats || emptyRow(4, '기관 데이터가 없습니다.')) +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var orgSubmit = el.querySelector('#org-submit');
      if (orgSubmit) {
        orgSubmit.addEventListener('click', async function () {
          var name = el.querySelector('#org-name').value.trim();
          if (!name) { toast('기관명을 입력해 주세요.'); return; }
          setBusy(orgSubmit, true, '등록 중');
          try {
            await adminCreateOrganization({
              name: name,
              org_type: el.querySelector('#org-type').value,
              contact_name: el.querySelector('#org-contact').value.trim(),
              contact_phone: el.querySelector('#org-phone').value.trim(),
              contact_email: el.querySelector('#org-email').value.trim(),
              notes: el.querySelector('#org-notes').value.trim(),
              status: 'active'
            });
            toast('제휴 기관이 등록되었습니다.', 'success');
            ctx.rerender();
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(orgSubmit, false);
          }
        });
      }

      var brSubmit = el.querySelector('#br-submit');
      if (brSubmit) {
        brSubmit.addEventListener('click', async function () {
          var name = el.querySelector('#br-name').value.trim();
          if (!name) { toast('지점명을 입력해 주세요.'); return; }
          setBusy(brSubmit, true, '추가 중');
          try {
            await adminCreateBranch({
              org_id: el.querySelector('#br-org').value || null,
              name: name,
              address: el.querySelector('#br-address').value.trim(),
              phone: el.querySelector('#br-phone').value.trim(),
              status: 'active'
            });
            toast('지점이 추가되었습니다.', 'success');
            ctx.rerender();
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(brSubmit, false);
          }
        });
      }

      var orgStatus = el.querySelectorAll('[data-org-status]');
      for (var i = 0; i < orgStatus.length; i++) {
        orgStatus[i].addEventListener('change', async function () {
          try {
            await adminUpdateOrganization(this.getAttribute('data-org-status'), { status: this.value });
            toast('기관 상태가 변경되었습니다.', 'success');
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }
    }
  };
}

/* ---------------------------------------------------------------- render */
var BUILDERS = {
  overview: buildOverview,
  members: buildMembers,
  results: buildResults,
  neuro: buildNeuro,
  bookings: buildBookings,
  payments: buildPayments,
  programs: buildPrograms,
  academy: buildAcademy,
  community: buildCommunity,
  coupons: buildCoupons,
  notes: buildNotes,
  b2b: buildB2B
};

export async function render(ctx) {
  if (!isStaff()) {
    return {
      title: '관리자',
      html: '<div class="empty empty-error"><div class="empty-icon">' + icon('lock', 26) + '</div>' +
        '<p class="empty-title">접근 권한이 없습니다</p>' +
        '<p class="empty-desc">관리자 · 상담사 계정만 이용할 수 있습니다.</p></div>',
      mount: function () {}
    };
  }

  var tabId = ctx.segments[1] || 'overview';
  if (!BUILDERS[tabId]) tabId = 'overview';

  var built;
  try {
    built = await BUILDERS[tabId](ctx);
  } catch (err) {
    console.error('[MINA] 관리자 탭 로드 실패', err);
    built = {
      html: '<div class="admin-section">' + emptyState({
        icon: 'alert',
        title: '데이터를 불러오지 못했습니다',
        desc: friendlyError(err)
      }) + '</div>',
      bind: function () {}
    };
  }

  var tabBar = TABS.map(function (tab) {
    return '<a class="admin-tab' + (tab.id === tabId ? ' is-on' : '') + '" href="#/admin/' + tab.id + '">' +
      icon(tab.ico, 16) + '<span>' + tab.label + '</span></a>';
  }).join('');

  var profile = state.profile || {};
  var html =
    '<header class="admin-header">' +
      '<div class="admin-header-left">' +
        '<a class="admin-back" href="#/home" aria-label="앱으로 돌아가기">' + icon('chevronLeft', 18) + '</a>' +
        '<div><h1>관리자 콘솔</h1><p class="muted small">' +
          esc(profile.full_name || '') + ' · ' + esc(ROLES[profile.role] || '') +
          ' · ' + esc(state.mode === 'live' ? '실서버 연결' : '로컬 체험 모드') + '</p></div>' +
      '</div>' +
      '<a class="btn btn-ghost btn-xs" href="../index.html">홈페이지</a>' +
    '</header>' +
    '<nav class="admin-tabs">' + tabBar + '</nav>' +
    '<div class="admin-body">' + built.html + '</div>';

  return {
    title: '관리자 콘솔',
    pageClass: 'admin-page',
    html: html,
    mount: function (el) {
      if (typeof built.bind === 'function') built.bind(el);
    }
  };
}
