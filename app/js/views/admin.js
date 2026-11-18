/* S09. 관리자 콘솔 (#/admin) — PART 3 통합 관리자 시스템
   탭: 운영 요약 · 예약(달력) · 회원 · 검사 결과 · 뉴로피드백 · 결제·매출 ·
       프로그램 · 아카데미 · 콘텐츠 · 쿠폰 · 상담 기록 · 제휴 기관 · 기관 정산 · 감사 로그 · 보안 */
import {
  CHECK_TYPES, BOOKING_STATUS, BOOKING_PAYMENT_STATUS, PAYMENT_STATUS, ROLES, GRADES,
  COMMUNITY_CATEGORIES, ENROLLMENT_STATUS, categoryLabel
} from '../config.js?v=2.0.19';
import {
  state, isAdmin, isStaff, listProfiles, listPackages, adminSavePackage, adminUpdatePackage,
  listSessions, adminSaveSession, listAllPrograms, adminUpdateProgram,
  listCohorts, adminCreateCohort, adminUpdateCohort, listEnrollments, adminUpdateEnrollment,
  listMaterials, adminCreateMaterial, listCoupons, adminCreateCoupon, adminUpdateCoupon,
  listNotes, adminCreateNote, listPayments, adminSetPaymentStatus, friendlyError, todayStr
} from '../store.js?v=2.0.19';
import {
  icon, esc, fmtKRW, fmtDate, fmtDateTime, toast, emptyState, noticeBox, badge,
  openSheet, closeSheet, setBusy, go
} from '../ui.js?v=2.0.19';
import { logAudit } from '../store-security.js?v=2.0.19';
import * as OverviewTab from './admin/overview.js?v=2.0.19';
import * as BookingsTab from './admin/bookings.js?v=2.0.19';
import * as MembersTab from './admin/members.js?v=2.0.19';
import * as ResultsTab from './admin/results.js?v=2.0.19';
import * as ContentTab from './admin/content.js?v=2.0.19';
import * as OrgsTab from './admin/orgs.js?v=2.0.19';
import * as SettlementsTab from './admin/settlements.js?v=2.0.19';
import * as AuditTab from './admin/audit.js?v=2.0.19';
import * as SecurityTab from './admin/security.js?v=2.0.19';

var TABS = [
  { id: 'overview', label: '운영 요약', ico: 'chart' },
  { id: 'bookings', label: '예약 관리', ico: 'calendar' },
  { id: 'members', label: '회원 관리', ico: 'users' },
  { id: 'results', label: '검사 결과', ico: 'file' },
  { id: 'neuro', label: '뉴로피드백', ico: 'sparkle' },
  { id: 'payments', label: '결제·매출', ico: 'wallet' },
  { id: 'programs', label: '프로그램', ico: 'grid' },
  { id: 'academy', label: '아카데미', ico: 'user' },
  { id: 'content', label: '콘텐츠', ico: 'chat' },
  { id: 'coupons', label: '쿠폰', ico: 'sparkle' },
  { id: 'notes', label: '상담 기록', ico: 'lock' },
  { id: 'orgs', label: '제휴 기관', ico: 'shield' },
  { id: 'settlements', label: '기관 정산', ico: 'wallet' },
  { id: 'audit', label: '감사 로그', ico: 'file' },
  { id: 'security', label: '보안 · 2FA', ico: 'lock' }
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
      '<td><strong>' + esc(p.package_name) + '</strong>' + (p.refund_rule ? '<br><span class="muted small">' + esc(p.refund_rule) + '</span>' : '') + '</td>' +
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
      '<td>' + esc(s.protocol || '-') + (s.duration_minutes ? '<br><span class="muted small">' + s.duration_minutes + '분</span>' : '') + '</td>' +
      '<td class="muted small">' + (s.focus_metric === null || s.focus_metric === undefined ? '-' : Number(s.focus_metric).toFixed(1)) + ' / ' +
        (s.calm_metric === null || s.calm_metric === undefined ? '-' : Number(s.calm_metric).toFixed(1)) + '</td>' +
      '<td class="muted small">' + esc(s.prev_comparison || '-') + '</td>' +
      '<td class="muted small">' + esc(s.counselor_name || '-') + '</td>' +
      '<td class="muted small">' + esc(s.counselor_memo || '-') + '</td>' +
    '</tr>';
  }).join('');

  var html =
    '<section class="admin-section">' +
      '<h2 class="admin-h2">패키지 부여</h2>' +
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
      noticeBox('이용권 결제 완료 시 <code>sync_neuro_package_on_payment</code> 트리거가 자동 등록하고, 환불 시 <code>expired</code> 로 만료 처리합니다. 여기서는 수동 보정만 합니다.', 'neutral') +
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
        '<div class="form-grid form-grid-4">' +
          '<label class="field"><span class="field-label">회차</span><input type="number" id="ses-no" value="1" min="1"></label>' +
          '<label class="field"><span class="field-label">훈련일</span><input type="date" id="ses-date" value="' + todayStr() + '"></label>' +
          '<label class="field"><span class="field-label">프로토콜</span><input type="text" id="ses-protocol" placeholder="예: SMR 집중 훈련"></label>' +
          '<label class="field"><span class="field-label">시간(분)</span><input type="number" id="ses-duration" value="40" min="1"></label>' +
        '</div>' +
        '<div class="form-grid form-grid-3">' +
          '<label class="field"><span class="field-label">집중 지표</span><input type="number" step="0.1" id="ses-focus"></label>' +
          '<label class="field"><span class="field-label">이완 지표</span><input type="number" step="0.1" id="ses-calm"></label>' +
          '<label class="field"><span class="field-label">담당 상담사</span><input type="text" id="ses-counselor" placeholder="상담사 이름"></label>' +
        '</div>' +
        '<label class="field"><span class="field-label">이전 대비 코멘트</span><input type="text" id="ses-prev" placeholder="예: 집중 유지 시간 20% 향상"></label>' +
        '<label class="field"><span class="field-label">담당 상담사 메모 (회원에게 표시)</span><textarea id="ses-memo" rows="2"></textarea></label>' +
        '<button type="button" class="btn btn-primary" id="ses-submit">회차 기록 저장</button>' +
      '</div>' +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">회차 기록 (' + sessions.length + ')</h2>' +
      table(['회차', '회원', '훈련일', '프로토콜', '집중/이완', '이전 대비', '상담사', '메모'], sessionRows || emptyRow(8, '등록된 훈련 기록이 없습니다.')) +
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
            duration_minutes: Number(el.querySelector('#ses-duration').value) || 40,
            focus_metric: num('#ses-focus'),
            calm_metric: num('#ses-calm'),
            counselor_name: el.querySelector('#ses-counselor').value.trim(),
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

/* ------------------------------------------------------------ payments */
async function buildPayments() {
  var profiles = await listProfiles();
  var payments = await listPayments();
  var writable = isAdmin();
  var paid = payments.filter(function (p) { return p.status === 'paid'; });
  var paidTotal = paid.reduce(function (sum, p) { return sum + Number(p.amount || 0); }, 0);
  var refunded = payments.filter(function (p) { return p.status === 'refunded'; });
  var refundTotal = refunded.reduce(function (sum, p) { return sum + Number(p.amount || 0); }, 0);
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
      statCard('환불 합계', fmtKRW(refundTotal), refunded.length + '건', 'ivory') +
      statCard('입금 확인 대기', pending.length + '건', 'PG 연동 대기 포함', 'yellow') +
      statCard('결제 수단', 'PG 연동 대기', '무통장 · 현장 확인', 'ivory') +
    '</div>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">결제 내역 (' + payments.length + ')</h2>' +
      table(['일자', '회원', '항목', '금액', '상태', '비고'], rows || emptyRow(6, '결제 내역이 없습니다.')) +
      noticeBox('결제 상태를 <strong>결제 완료</strong>로 바꾸면 뉴로피드백 이용권이 자동 등록되고, <strong>환불 완료</strong>로 바꾸면 이용권이 만료 처리됩니다(DB 트리거).', 'neutral') +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var selects = el.querySelectorAll('[data-pay-status]');
      for (var i = 0; i < selects.length; i++) {
        selects[i].addEventListener('change', async function () {
          try {
            await adminSetPaymentStatus(this.getAttribute('data-pay-status'), this.value);
            await logAudit({ action: 'booking_payment_changed', target_table: 'payments', target_id: this.getAttribute('data-pay-status'), detail: { status: this.value } });
            toast('결제 상태가 변경되었습니다.', 'success');
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
        });
      }
    }
  };
}

/* ------------------------------------------------------------ programs */
async function buildPrograms(ctx) {
  var profiles = await listProfiles();
  var programs = await listAllPrograms();
  var writable = isAdmin();

  var rows = programs.map(function (p) {
    var owner = '';
    if (p.org_id) {
      for (var i = 0; i < profiles.length; i++) {
        if (String(profiles[i].org_id) === String(p.org_id)) { owner = '기관 전용'; break; }
      }
      owner = owner || '기관 전용';
    }
    return '<tr data-program-row="' + esc(p.id) + '">' +
      '<td><strong>' + esc(p.title) + '</strong><br><span class="muted small">' + esc(p.category) + ' · ' + esc(p.sub_category || '') + (owner ? ' · ' + owner : '') + '</span></td>' +
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
      '<p class="muted small">가격과 노출 여부는 저장 즉시 앱 화면에 반영됩니다. 가격 미확정 상품은 price_label(예: 상담 확정 · 관리자 설정가)만 표시됩니다. 기관 전용 상품은 기관 대시보드에서 관리합니다.</p>' +
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
            await logAudit({ action: 'program_updated', target_table: 'programs', target_id: id, detail: patch });
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
            wide: true,
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
                  await logAudit({ action: 'program_updated', target_table: 'programs', target_id: id, detail: { description: true } });
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
      noticeBox('수료 후 응시하는 자격은 등록 민간자격입니다. 교육 안내 문구는 콘텐츠 → 교육 안내(academy_guide)에서도 수정할 수 있습니다.', 'neutral') +
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
          await logAudit({ action: 'content_created', target_table: 'academy_cohorts', detail: { title: title } });
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
            await logAudit({ action: 'content_updated', target_table: 'academy_cohorts', target_id: this.getAttribute('data-cohort-status'), detail: { status: this.value } });
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
            await logAudit({ action: 'content_updated', target_table: 'academy_enrollments', target_id: id, detail: { status: statusEl.value } });
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
          await logAudit({ action: 'content_created', target_table: 'coupons', detail: { code: code } });
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
            await logAudit({ action: 'content_updated', target_table: 'coupons', target_id: code, detail: { active: !active } });
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
          await logAudit({ action: 'content_created', target_table: 'consultation_notes', detail: { user_id: userId } });
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

/* ---------------------------------------------------------------- render */
var BUILDERS = {
  overview: OverviewTab.build,
  bookings: BookingsTab.build,
  members: MembersTab.build,
  results: ResultsTab.build,
  neuro: buildNeuro,
  payments: buildPayments,
  programs: buildPrograms,
  academy: buildAcademy,
  content: ContentTab.build,
  coupons: buildCoupons,
  notes: buildNotes,
  orgs: OrgsTab.build,
  settlements: SettlementsTab.build,
  audit: AuditTab.build,
  security: SecurityTab.build
};

export async function render(ctx) {
  if (!isStaff()) {
    return {
      title: '관리자',
      html: '<div class="empty empty-error"><div class="empty-icon">' + icon('lock', 26) + '</div>' +
        '<p class="empty-title">접근 권한이 없습니다</p>' +
        '<p class="empty-desc">관리자 · 상담사 계정만 이용할 수 있습니다.</p>' +
        '<div class="empty-action"><a class="btn btn-primary" href="#/admin-login">관리자 로그인</a></div></div>',
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
      '<div class="admin-header-right">' +
        '<a class="btn btn-ghost btn-xs" href="#/admin-login">포털</a>' +
        '<a class="btn btn-ghost btn-xs" href="../index.html">홈페이지</a>' +
      '</div>' +
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
