/* S08. 회원가입 · 로그인 · 마이페이지
   PART 2-1: 개인정보/민감정보/마케팅 동의 → consent_logs 실제 기록
   계정 관리: 비밀번호 변경 · 회원정보 수정 · 회원 탈퇴(withdraw_my_account) · 기관 소속/결과 공유 토글 */
import {
  state, signIn, signUp, signOut, updateProfile, listBookings, listPayments,
  listCoupons, validateCoupon, listNotifications, markNotificationRead, isStaff, isOrgWorker,
  friendlyError, passwordIssue
} from '../store.js?v=2.0.11';
import { listMyMemberships, setShareBrainResults, requestOrgMembership, listOrganizationsFiltered } from '../store-org.js?v=2.0.11';
import { CONSENT_ITEMS, CONSENT_LABELS, ROLES, PRIVACY_POLICY, privacyPolicyHtml } from '../config.js?v=2.0.11';
import {
  recordConsents, listMyConsents, changeMyPassword, withdrawMyAccount, logAudit
} from '../store-security.js?v=2.0.11';
import {
  icon, esc, fmtKRW, fmtDate, fmtDateTime, toast, emptyState, noticeBox, sectionHead,
  badge, openSheet, closeSheet, setBusy, go, timeAgo, paymentStatusTone, confirmDialog
} from '../ui.js?v=2.0.11';
import { bookingItemHtml, bindBookingActions } from '../booking.js?v=2.0.11';

var GRADE_ORDER = ['Welcome', 'Mind', 'Neuro', 'Alignment'];
var GRADE_DESC = {
  Welcome: '첫 방문 · 기본 웰컴 등급',
  Mind: '마인드케어 프로그램 이용 회원',
  Neuro: '뉴로피드백 루틴 진행 회원',
  Alignment: '정기 관리 · 최상위 정렬 등급'
};

function consentCheckboxes(prefix) {
  return CONSENT_ITEMS.map(function (item) {
    return '<label class="consent-block">' +
      '<input type="checkbox" id="' + prefix + '-' + item.key + '"' + (item.required ? ' data-required="1"' : '') + '>' +
      '<span><strong>' + esc(item.label) + '</strong><em>' + esc(item.summary) + '</em></span>' +
    '</label>';
  }).join('');
}

/* 개인정보 처리방침 · 민감정보 처리 안내 전문 시트 */
function openPrivacySheet() {
  openSheet({
    title: '개인정보 처리방침',
    subtitle: '시행 ' + PRIVACY_POLICY.effective + ' · 버전 ' + PRIVACY_POLICY.version,
    wide: true,
    content: privacyPolicyHtml(),
    footer: '<button type="button" class="btn btn-primary" data-close>확인</button>',
    onMount: function (sheet) {
      var c = sheet.querySelector('[data-close]');
      if (c) c.addEventListener('click', function () { closeSheet(); });
    }
  });
}

function authView(ctx) {
  return {
    title: '로그인',
    html:
      '<header class="page-head">' +
        '<span class="page-eyebrow">' + icon('user', 16) + ' MY ACCOUNT</span>' +
        '<h1 class="page-title">MINA WORLD<br>시작하기</h1>' +
        '<p class="page-desc">이메일 계정으로 예약·검사 결과·훈련 기록을 안전하게 관리하세요.</p>' +
      '</header>' +

      '<section class="section">' +
        '<div class="tab-strip" role="tablist">' +
          '<button type="button" class="tab-btn is-on" data-auth-tab="login">로그인</button>' +
          '<button type="button" class="tab-btn" data-auth-tab="signup">회원가입</button>' +
        '</div>' +

        '<form class="auth-card" id="login-form" data-auth-panel="login" autocomplete="on">' +
          '<label class="field"><span class="field-label">이메일</span>' +
            '<input type="email" id="login-email" autocomplete="email" placeholder="you@example.com" required></label>' +
          '<label class="field"><span class="field-label">비밀번호</span>' +
            '<input type="password" id="login-password" autocomplete="current-password" placeholder="비밀번호" required></label>' +
          '<button type="submit" class="btn btn-primary btn-block" id="login-submit">로그인</button>' +
          '<p class="field-hint">비밀번호를 잊으셨다면 대표 메일(minawellnessworld@gmail.com)로 문의해 주세요.</p>' +
        '</form>' +

        '<form class="auth-card is-hidden" id="signup-form" data-auth-panel="signup">' +
          '<label class="field"><span class="field-label">이름</span>' +
            '<input type="text" id="signup-name" autocomplete="name" placeholder="이름" required></label>' +
          '<label class="field"><span class="field-label">이메일</span>' +
            '<input type="email" id="signup-email" autocomplete="email" placeholder="you@example.com" required></label>' +
          '<label class="field"><span class="field-label">연락처</span>' +
            '<input type="tel" id="signup-phone" autocomplete="tel" placeholder="010-0000-0000"></label>' +
          '<label class="field"><span class="field-label">비밀번호 (8자 이상 · 영문+숫자 포함)</span>' +
            '<input type="password" id="signup-password" autocomplete="new-password" placeholder="영문+숫자 조합 8자 이상" required></label>' +
          '<div class="consent-group">' + consentCheckboxes('signup') + '</div>' +
          '<button type="button" class="btn btn-ghost btn-block btn-sm" id="signup-privacy">개인정보 처리방침 전문 보기</button>' +
          '<p class="field-hint">필수 동의 항목에 체크해야 가입할 수 있습니다. 동의 이력은 <code>consent_logs</code> 에 기록됩니다.</p>' +
          '<button type="submit" class="btn btn-primary btn-block" id="signup-submit">회원가입</button>' +
        '</form>' +

        '<div class="auth-divider"><span>또는</span></div>' +
        '<button type="button" class="btn btn-kakao btn-block" id="kakao-login">' +
          icon('chat', 18) + '카카오 로그인</button>' +
        '<p class="field-hint center">외부 연동 필요 — 카카오 디벨로퍼스 앱 키 등록 후 활성화 (현재 이메일 로그인 이용)</p>' +
        '<p class="field-hint center">휴대폰 본인인증은 통신사 인증 연동 전까지 제공되지 않습니다.</p>' +
      '</section>' +

      '<section class="section">' +
        noticeBox('가입 시 입력한 정보는 예약·결과·훈련 기록 제공 목적으로만 사용됩니다. 측정 결과는 의료기관의 진단을 대체하지 않는 웰니스 데이터입니다.', 'neutral') +
        '<a class="btn btn-ghost btn-block btn-sm" href="#/admin-login">관리자 · 제휴 기관 담당자 로그인</a>' +
      '</section>' +

      '<footer class="app-footer"><p class="footer-note">계정 문의 · minawellnessworld@gmail.com</p></footer>',
    mount: function (el) {
      var tabs = el.querySelectorAll('[data-auth-tab]');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function () {
          var target = this.getAttribute('data-auth-tab');
          var all = el.querySelectorAll('[data-auth-tab]');
          for (var k = 0; k < all.length; k++) all[k].classList.toggle('is-on', all[k] === this);
          var panels = el.querySelectorAll('[data-auth-panel]');
          for (var p = 0; p < panels.length; p++) {
            var isTarget = panels[p].getAttribute('data-auth-panel') === target;
            panels[p].classList.toggle('is-hidden', !isTarget);
          }
        });
      }

      var loginForm = el.querySelector('#login-form');
      loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var btn = el.querySelector('#login-submit');
        var email = el.querySelector('#login-email').value;
        var password = el.querySelector('#login-password').value;
        setBusy(btn, true, '로그인 중');
        try {
          await signIn(email, password);
          toast('로그인되었습니다.', 'success');
          ctx.rerender();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(btn, false);
        }
      });

      var signupForm = el.querySelector('#signup-form');
      signupForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        var btn = el.querySelector('#signup-submit');
        var consentState = {};
        var missing = [];
        CONSENT_ITEMS.forEach(function (item) {
          var input = el.querySelector('#signup-' + item.key);
          consentState[item.key] = Boolean(input && input.checked);
          if (item.required && !consentState[item.key]) missing.push(item.label);
        });
        if (missing.length) {
          toast('필수 동의 항목에 체크해 주세요: ' + missing[0], 'error');
          return;
        }
        var signupPassword = el.querySelector('#signup-password').value;
        var signupPwIssue = passwordIssue(signupPassword);
        if (signupPwIssue) {
          toast(signupPwIssue, 'error');
          return;
        }
        setBusy(btn, true, '가입 중');
        try {
          var result = await signUp({
            email: el.querySelector('#signup-email').value,
            password: el.querySelector('#signup-password').value,
            fullName: el.querySelector('#signup-name').value,
            phone: el.querySelector('#signup-phone').value
          });
          if (result.needsConfirmation) {
            openSheet({
              title: '가입 확인 메일 발송',
              content: '<p class="sheet-help">' + esc(result.message) + '</p>' +
                noticeBox('메일 인증 후 로그인하면 예약과 기록을 사용할 수 있습니다. 동의 이력은 첫 로그인 시 기록됩니다.', 'neutral'),
              footer: '<button type="button" class="btn btn-primary" data-close>확인</button>',
              onMount: function (s) {
                var c = s.querySelector('[data-close]');
                if (c) c.addEventListener('click', function () { closeSheet(); });
              }
            });
            setBusy(btn, false);
            return;
          }
          /* 가입 즉시 동의 이력 저장 (privacy/sensitive 필수 + marketing 선택) */
          try {
            await recordConsents(CONSENT_ITEMS.map(function (item) {
              return { type: item.key, agreed: Boolean(consentState[item.key]) };
            }));
          } catch (err) {
            console.warn('[MINA] 동의 이력 저장 실패', err);
            toast('동의 이력 저장에 실패했습니다. 마이페이지에서 다시 동의해 주세요.', 'error');
          }
          toast('회원가입이 완료되었습니다.', 'success');
          ctx.rerender();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(btn, false);
        }
      });

      var kakao = el.querySelector('#kakao-login');
      kakao.addEventListener('click', function () {        openSheet({
          title: '카카오 로그인',
          content:
            noticeBox('<strong>외부 연동 필요</strong> — 카카오 디벨로퍼스 앱 키 · Redirect URI 등록 후 활성화됩니다. 현재는 <strong>이메일 로그인</strong>을 이용해 주세요.', 'warn') +
            '<ul class="bullet-list">' +
              '<li>연동 준비: 카카오 디벨로퍼스 앱 생성 → REST API 키 / JavaScript 키 등록</li>' +
              '<li>Supabase Auth → Providers → Kakao 활성화 및 Redirect URI 등록</li>' +
              '<li>활성화되면 이 버튼이 실제 카카오 인증 화면으로 연결됩니다.</li>' +
            '</ul>',
          footer: '<button type="button" class="btn btn-primary" data-close>확인</button>',
          onMount: function (s) {
            var c = s.querySelector('[data-close]');
            if (c) c.addEventListener('click', function () { closeSheet(); });
          }
        });
      });

      /* 회원가입 동의 아래 — 개인정보 처리방침 전문 시트 */
      var privacyBtn = el.querySelector('#signup-privacy');
      if (privacyBtn) privacyBtn.addEventListener('click', openPrivacySheet);
    }
  };
}

export async function render(ctx) {
  if (!state.session) return authView(ctx);

  var profile = state.profile || {};
  var bookings = [];
  var payments = [];
  var notifications = [];
  var coupons = [];
  var memberships = [];
  var consents = [];
  var orgs = [];
  var loadError = '';

  try {
    var uid = state.session.user.id;
    var loaded = await Promise.all([listBookings(uid), listPayments(uid), listNotifications(), listCoupons(), listMyMemberships(), listMyConsents()]);
    bookings = loaded[0];
    payments = loaded[1];
    notifications = loaded[2];
    coupons = loaded[3];
    memberships = loaded[4];
    consents = loaded[5];
  } catch (err) {
    loadError = friendlyError(err);
  }

  try {
    orgs = await listOrganizationsFiltered('active');
  } catch (err) {
    orgs = [];
  }

  var unread = notifications.filter(function (n) { return !n.is_read; }).length;

  var bookingList = bookings.length
    ? bookings.map(bookingItemHtml).join('')
    : emptyState({
        icon: 'calendar',
        title: '예약 내역이 없습니다',
        desc: '브레인체크 · 뉴로피드백 · 프로그램 예약을 시작해 보세요.',
        action: '<a class="btn btn-ghost btn-sm" href="#/brain-check">검사 예약</a>'
      });

  var paymentList = payments.length
    ? payments.map(function (p) {
        return '<div class="list-card">' +
          '<div class="list-top"><strong>' + esc(p.title) + '</strong>' +
            badge(p.status === 'paid' ? '결제 완료' : p.status === 'refunded' ? '환불' : p.status === 'pending_deposit' ? '입금 확인 대기' : '결제 연동 대기', paymentStatusTone(p.status)) +
          '</div>' +
          '<div class="list-meta"><span>' + icon('wallet', 15) + fmtKRW(p.amount) + '</span>' +
            '<span>' + icon('clock', 15) + fmtDate(p.created_at) + '</span></div>' +
          (p.receipt_note ? '<p class="list-note">' + esc(p.receipt_note) + '</p>' : '') +
        '</div>';
      }).join('')
    : emptyState({ icon: 'wallet', title: '결제 내역이 없습니다', desc: '예약 시 결제 기록이 함께 생성됩니다.' });

  var notiList = notifications.length
    ? notifications.slice(0, 5).map(function (n) {
        return '<button type="button" class="noti-item' + (n.is_read ? '' : ' is-unread') + '" data-noti="' + esc(n.id) + '">' +
          '<span class="noti-dot"></span><span class="noti-body"><strong>' + esc(n.title) + '</strong>' +
          '<span class="noti-text">' + esc(n.body) + '</span>' +
          '<span class="noti-meta">' + timeAgo(n.created_at) + ' · 앱 내 알림 저장' + (n.channel === 'in_app' ? '' : ' · 외부 발송 연동 대기') + '</span></span></button>';
      }).join('')
    : emptyState({ icon: 'bell', title: '알림이 없습니다', desc: '예약 접수·결과 등록 시 앱 내 알림함에 기록됩니다.' });

  var couponRows = coupons.filter(function (c) { return c.active; }).map(function (c) {
    var discountText = c.discount_type === 'percent' ? (c.discount_value + '% 할인') : (fmtKRW(c.discount_value) + ' 할인');
    return '<div class="coupon-row"><div><strong>' + esc(c.code) + '</strong>' +
      '<p class="muted small">' + esc(c.title) + ' · ' + discountText +
      (c.min_amount ? ' · 최소 ' + fmtKRW(c.min_amount) : '') + '</p></div>' +
      '<span class="badge badge-yellow">사용 가능</span></div>';
  }).join('');

  var gradeIndex = Math.max(0, GRADE_ORDER.indexOf(profile.member_grade || 'Welcome'));
  var gradePips = GRADE_ORDER.map(function (grade, index) {
    return '<div class="grade-pip' + (index <= gradeIndex ? ' is-on' : '') + '">' +
      '<span>' + esc(grade) + '</span><small>' + esc(GRADE_DESC[grade]) + '</small></div>';
  }).join('');

  var orgRows = memberships.length
    ? memberships.map(function (m) {
        var orgName = (m.organizations && m.organizations.name) || '기관';
        return '<div class="membership-row">' +
          '<div class="membership-info"><strong>' + esc(orgName) + '</strong>' +
            '<span class="muted small">' + badge(m.status === 'approved' ? '소속 승인' : m.status === 'pending' ? '승인 대기' : '거절', m.status === 'approved' ? 'green' : 'neutral') +
              (m.result_access_requested ? ' ' + badge('기관 열람 요청', 'yellow') : '') + '</span></div>' +
          '<label class="membership-toggle"><span class="muted small">검사 결과 공유</span>' +
            '<span class="switch"><input type="checkbox" data-share-toggle="' + esc(m.id) + '"' + (m.share_brain_results ? ' checked' : '') + '><span></span></span></label>' +
        '</div>';
      }).join('')
    : emptyState({
        icon: 'shield',
        title: '연결된 제휴 기관이 없습니다',
        desc: '기관 담당자가 회원님을 기관 소속으로 등록하면 이곳에 표시되고, 결과 공유 여부를 직접 선택할 수 있습니다.'
      });

  var consentRows = consents.length
    ? consents.slice(0, 8).map(function (c) {
        return '<div class="consent-history-row"><span class="muted small">' + fmtDateTime(c.created_at) + '</span>' +
          '<strong>' + esc(CONSENT_LABELS[c.consent_type] || c.consent_type) + '</strong>' +
          badge(c.agreed ? '동의' : '철회', c.agreed ? 'green' : 'neutral') +
          '<span class="muted small">v' + esc(c.version || '') + '</span></div>';
      }).join('')
    : '<p class="muted small">아직 저장된 동의 이력이 없습니다.</p>';

  var html =
    '<header class="profile-head">' +
      '<div class="profile-avatar">' + esc((profile.full_name || 'M').slice(0, 1)) + '</div>' +
      '<div class="profile-info">' +
        '<h1>' + esc(profile.full_name || '회원') + ' 님</h1>' +
        '<p class="muted small">' + esc(profile.email || '') + '</p>' +
        '<div class="grade-row">' + badge(profile.member_grade || 'Welcome', 'navy') +
          (isStaff() || isOrgWorker() ? badge(ROLES[profile.role] || '', 'yellow') : badge('일반 회원', 'neutral')) +
        '</div>' +
      '</div>' +
    '</header>' +

    (loadError ? '<section class="section">' + noticeBox(esc(loadError), 'warn') + '</section>' : '') +

    '<section class="section">' +
      '<div class="quick-grid">' +
        '<a class="quick-item" href="#/brain-check">' + icon('pulse', 20) + '<span>예약 내역</span></a>' +
        '<button type="button" class="quick-item" data-scroll="payments">' + icon('wallet', 20) + '<span>결제 내역</span></button>' +
        '<button type="button" class="quick-item" data-scroll="coupons">' + icon('sparkle', 20) + '<span>쿠폰함</span></button>' +
        '<button type="button" class="quick-item" data-scroll="notifications">' + icon('bell', 20) + '<span>알림함' + (unread ? ' ' + unread : '') + '</span></button>' +
      '</div>' +
    '</section>' +

    '<section class="section">' +
      sectionHead('회원 등급', '<span class="muted small">현재 ' + esc(profile.member_grade || 'Welcome') + '</span>') +
      '<div class="grade-track">' + gradePips + '</div>' +
    '</section>' +

    '<section class="section">' +
      sectionHead('제휴 기관 소속 · 결과 공유', '<span class="muted small">동의 기반</span>') +
      orgRows +
      (orgs.length
        ? '<div class="card form-card">' +
            '<strong class="danger-title" style="color:var(--navy)">기관 소속 요청</strong>' +
            '<p class="muted small">다니는 헬스장·필라테스·기업 복지 프로그램 등 제휴 기관을 선택하면 담당자 승인 후 소속이 연결됩니다.</p>' +
            '<div class="input-inline">' +
              '<select id="org-request"><option value="">기관 선택</option>' +
                orgs.map(function (o) {
                  return '<option value="' + esc(o.id) + '">' + esc(o.name) + '</option>';
                }).join('') +
              '</select>' +
              '<button type="button" class="btn btn-ghost btn-sm" id="org-request-btn">소속 요청</button>' +
            '</div>' +
          '</div>'
        : '') +
      noticeBox('검사 결과는 <strong>공유에 동의한 경우에만</strong> 기관에 표시됩니다. 언제든 끌 수 있고, 끄면 즉시 조회가 차단됩니다.', 'neutral') +
    '</section>' +

    '<section class="section">' +
      sectionHead('내 예약', '<span class="muted small">일정 변경 · 취소</span>') +
      bookingList +
    '</section>' +

    '<section class="section" id="payments-section">' +
      sectionHead('결제 내역', '<span class="muted small">PG 연동 대기 상태 구분</span>') +
      paymentList +
      noticeBox('온라인 카드결제(PG)는 가맹점 키 연동 후 활성화됩니다. 현재 예약은 접수 후 계좌 입금 또는 현장 결제로 진행됩니다.', 'neutral') +
    '</section>' +

    '<section class="section" id="coupons-section">' +
      sectionHead('쿠폰 · 프로모션', '<span class="muted small">코드 테스트</span>') +
      (couponRows || emptyState({ icon: 'sparkle', title: '사용 가능한 쿠폰이 없습니다', desc: '관리자가 쿠폰을 발행하면 이곳에 표시됩니다.' })) +
      '<div class="coupon-test">' +
        '<input type="text" id="coupon-code" placeholder="쿠폰 코드 (예: MINAWELCOME)">' +
        '<button type="button" class="btn btn-ghost btn-sm" id="coupon-check">확인</button>' +
      '</div>' +
      '<p class="field-hint" id="coupon-result">50,000원 상품 기준으로 할인 금액을 미리 계산해 볼 수 있습니다.</p>' +
    '</section>' +

    '<section class="section" id="notifications-section">' +
      sectionHead('알림함', '<span class="muted small">앱 내 저장 · 알림톡/푸시 연동 필요</span>') +
      notiList +
      noticeBox('카카오 알림톡·앱 푸시는 외부 API 연동 전까지 발송되지 않으며, 알림 내용은 앱 안에만 저장됩니다.', 'neutral') +
    '</section>' +

    '<section class="section">' +
      sectionHead('회원 정보 수정', '') +
      '<div class="card form-card">' +
        '<label class="field"><span class="field-label">이름</span><input type="text" id="profile-name" value="' + esc(profile.full_name || '') + '"></label>' +
        '<label class="field"><span class="field-label">연락처</span><input type="tel" id="profile-phone" value="' + esc(profile.phone || '') + '" placeholder="010-0000-0000"></label>' +
        '<button type="button" class="btn btn-ghost btn-block btn-sm" id="profile-save">정보 저장</button>' +
      '</div>' +
    '</section>' +

    '<section class="section">' +
      sectionHead('계정 보안', '<span class="muted small">비밀번호 · 탈퇴</span>') +
      '<div class="card form-card">' +
        '<label class="field"><span class="field-label">새 비밀번호 (8자 이상 · 영문+숫자 포함)</span><input type="password" id="pw-new" autocomplete="new-password" placeholder="영문+숫자 조합 8자 이상"></label>' +
        '<label class="field"><span class="field-label">새 비밀번호 확인</span><input type="password" id="pw-confirm" autocomplete="new-password" placeholder="한 번 더 입력"></label>' +
        '<button type="button" class="btn btn-ghost btn-block btn-sm" id="pw-save">비밀번호 변경</button>' +
        '<p class="field-hint">휴대폰 본인인증 · 카카오 로그인은 외부 인증 연동 후 제공됩니다.</p>' +
      '</div>' +
      '<div class="card form-card danger-card">' +
        '<strong class="danger-title">회원 탈퇴</strong>' +
        '<p class="muted small">탈퇴하면 이름·연락처 등 개인정보가 비식별화되고 기관 결과 공유가 즉시 중단됩니다. 예약·결제 기록은 법정 보존 기준에 따라 보관됩니다.</p>' +
        '<button type="button" class="btn btn-danger btn-block btn-sm" id="withdraw-btn">회원 탈퇴 진행</button>' +
      '</div>' +
    '</section>' +

    '<section class="section">' +
      sectionHead('동의 이력', '<span class="muted small">consent_logs</span>') +
      '<div class="consent-history">' + consentRows + '</div>' +
      '<button type="button" class="btn btn-ghost btn-block btn-sm" id="consent-update">동의 항목 다시 확인</button>' +
    '</section>' +

    (isStaff()
      ? '<section class="section"><a class="admin-banner" href="#/admin">' +
          '<span class="admin-badge">' + icon('shield', 18) + ' ADMIN</span>' +
          '<span><strong>관리자 콘솔</strong><span>회원 · 예약 · 결과 · 매출 관리</span></span>' +
          icon('chevronRight', 18) + '</a></section>'
      : '') +
    (isOrgWorker()
      ? '<section class="section"><a class="admin-banner" href="#/partner">' +
          '<span class="admin-badge">' + icon('shield', 18) + ' PARTNER</span>' +
          '<span><strong>기관 대시보드</strong><span>기관 회원 · 예약 · 정산</span></span>' +
          icon('chevronRight', 18) + '</a></section>'
      : '') +

    '<section class="section">' +
      '<button type="button" class="btn btn-ghost btn-block" id="logout-btn">' + icon('logout', 18) + '로그아웃</button>' +
    '</section>' +

    '<footer class="app-footer">' +
      '<p class="footer-note">문의 · minawellnessworld@gmail.com · 010-5424-0807</p>' +
    '</footer>';

  return {
    title: '마이페이지',
    html: html,
    mount: function (el) {
      var scrollButtons = el.querySelectorAll('[data-scroll]');
      for (var i = 0; i < scrollButtons.length; i++) {
        scrollButtons[i].addEventListener('click', function () {
          var target = this.getAttribute('data-scroll');
          var targetEl = el.querySelector('#' + target + '-section');
          if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }

      var notiButtons = el.querySelectorAll('[data-noti]');
      for (var n = 0; n < notiButtons.length; n++) {
        notiButtons[n].addEventListener('click', async function () {
          var id = this.getAttribute('data-noti');
          try {
            await markNotificationRead(id);
            this.classList.remove('is-unread');
          } catch (err) { console.warn(err); }
        });
      }

      var checkBtn = el.querySelector('#coupon-check');
      if (checkBtn) {
        checkBtn.addEventListener('click', async function () {
          var code = el.querySelector('#coupon-code').value.trim();
          var resultEl = el.querySelector('#coupon-result');
          if (!code) { toast('쿠폰 코드를 입력해 주세요.'); return; }
          setBusy(checkBtn, true, '확인');
          try {
            var result = await validateCoupon(code, 50000);
            resultEl.innerHTML = result.ok
              ? '<span class="ok-text">' + esc(result.message) + ' · 50,000원 상품 기준</span>'
              : '<span class="err-text">' + esc(result.message) + '</span>';
          } catch (err) {
            resultEl.innerHTML = '<span class="err-text">' + esc(friendlyError(err)) + '</span>';
          }
          setBusy(checkBtn, false);
        });
      }

      var saveBtn = el.querySelector('#profile-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', async function () {
          var name = el.querySelector('#profile-name').value.trim();
          var phone = el.querySelector('#profile-phone').value.trim();
          if (!name) { toast('이름을 입력해 주세요.'); return; }
          setBusy(saveBtn, true, '저장 중');
          try {
            await updateProfile({ full_name: name, phone: phone });
            toast('회원 정보가 저장되었습니다.', 'success');
            setBusy(saveBtn, false);
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(saveBtn, false);
          }
        });
      }

      /* 제휴 기관 결과 공유 토글 — 동의/철회를 함께 기록 */
      var shareToggles = el.querySelectorAll('[data-share-toggle]');
      for (var s = 0; s < shareToggles.length; s++) {
        shareToggles[s].addEventListener('change', async function () {
          var id = this.getAttribute('data-share-toggle');
          var value = this.checked;
          try {
            await setShareBrainResults(id, value);
            await recordConsents([{ type: 'partner_share', agreed: value }]);
            toast(value ? '검사 결과 공유에 동의했습니다.' : '결과 공유를 중단했습니다.', 'success');
          } catch (err) {
            toast(friendlyError(err), 'error');
            this.checked = !value;
          }
        });
      }

      var orgRequestBtn = el.querySelector('#org-request-btn');
      if (orgRequestBtn) {
        orgRequestBtn.addEventListener('click', async function () {
          var orgId = el.querySelector('#org-request').value;
          if (!orgId) { toast('기관을 선택해 주세요.'); return; }
          setBusy(orgRequestBtn, true, '요청 중');
          try {
            await requestOrgMembership(orgId);
            await logAudit({ action: 'membership_requested', target_table: 'org_memberships', target_id: orgId, detail: { requested: true } });
            toast('소속 요청을 보냈습니다. 기관 담당자 승인 후 연결됩니다.', 'success');
            ctx.rerender();
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(orgRequestBtn, false);
          }
        });
      }

      var pwSave = el.querySelector('#pw-save');
      if (pwSave) {
        pwSave.addEventListener('click', async function () {
          var pw = el.querySelector('#pw-new').value;
          var confirmValue = el.querySelector('#pw-confirm').value;
          var pwIssue = passwordIssue(pw);
          if (pwIssue) { toast(pwIssue); return; }
          if (pw !== confirmValue) { toast('비밀번호 확인이 일치하지 않습니다.'); return; }
          setBusy(pwSave, true, '변경 중');
          try {
            await changeMyPassword(pw);
            el.querySelector('#pw-new').value = '';
            el.querySelector('#pw-confirm').value = '';
            toast('비밀번호가 변경되었습니다.', 'success');
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
          setBusy(pwSave, false);
        });
      }

      var withdrawBtn = el.querySelector('#withdraw-btn');
      if (withdrawBtn) {
        withdrawBtn.addEventListener('click', async function () {
          var ok = await confirmDialog({
            title: '정말 탈퇴하시겠어요?',
            message: '탈퇴하면 이름·연락처가 비식별화되고 기관 결과 공유가 중단됩니다. 이 작업은 되돌릴 수 없습니다.',
            confirmLabel: '탈퇴 진행',
            cancelLabel: '취소'
          });
          if (!ok) return;
          setBusy(withdrawBtn, true, '처리 중');
          try {
            await withdrawMyAccount();
            toast('탈퇴가 처리되었습니다. 그동안 함께해서 감사했습니다.', 'success');
            go('/home');
            ctx.rerender();
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(withdrawBtn, false);
          }
        });
      }

      var consentUpdate = el.querySelector('#consent-update');
      if (consentUpdate) {
        consentUpdate.addEventListener('click', function () {
          openSheet({
            title: '동의 항목 확인',
            subtitle: '변경한 내용은 이력으로 새로 기록됩니다',
            content: '<div class="consent-group">' + consentCheckboxes('reconsent') + '</div>' +
              noticeBox('필수 항목(개인정보·민감정보)은 서비스 제공에 반드시 필요합니다. 동의를 철회하면 계정 이용이 제한될 수 있습니다.', 'warn'),
            footer: '<button type="button" class="btn btn-ghost" data-close>닫기</button>' +
              '<button type="button" class="btn btn-primary" id="reconsent-save">저장</button>',
            onMount: function (sheet) {
              var c = sheet.querySelector('[data-close]');
              if (c) c.addEventListener('click', function () { closeSheet(); });
              var save = sheet.querySelector('#reconsent-save');
              save.addEventListener('click', async function () {
                var entries = CONSENT_ITEMS.map(function (item) {
                  var input = sheet.querySelector('#reconsent-' + item.key);
                  return { type: item.key, agreed: Boolean(input && input.checked) };
                });
                setBusy(save, true, '저장 중');
                try {
                  await recordConsents(entries);
                  toast('동의 이력이 저장되었습니다.', 'success');
                  closeSheet();
                  ctx.rerender();
                } catch (err) {
                  toast(friendlyError(err), 'error');
                  setBusy(save, false);
                }
              });
            }
          });
        });
      }

      var logoutBtn = el.querySelector('#logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async function () {
          await signOut();
          toast('로그아웃되었습니다.');
          go('/home');
        });
      }

      bindBookingActions(el, function () { ctx.rerender(); });
    }
  };
}
