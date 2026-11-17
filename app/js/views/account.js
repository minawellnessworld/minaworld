/* S08. 회원가입 · 로그인 · 마이페이지 */
import {
  state, signIn, signUp, signOut, updateProfile, listBookings, listPayments,
  listCoupons, validateCoupon, listNotifications, markNotificationRead, isStaff, friendlyError
} from '../store.js';
import {
  icon, esc, fmtKRW, fmtDate, fmtDateTime, toast, emptyState, noticeBox, sectionHead,
  badge, openSheet, closeSheet, setBusy, go, timeAgo, paymentStatusTone
} from '../ui.js';
import { bookingItemHtml, bindBookingActions } from '../booking.js';

var GRADE_ORDER = ['Welcome', 'Mind', 'Neuro', 'Alignment'];
var GRADE_DESC = {
  Welcome: '첫 방문 · 기본 웰컴 등급',
  Mind: '마인드케어 프로그램 이용 회원',
  Neuro: '뉴로피드백 루틴 진행 회원',
  Alignment: '정기 관리 · 최상위 정렬 등급'
};

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
          '<label class="field"><span class="field-label">비밀번호 (6자 이상)</span>' +
            '<input type="password" id="signup-password" autocomplete="new-password" placeholder="비밀번호" required></label>' +
          '<label class="consent-row"><input type="checkbox" id="signup-consent"><span>개인정보 수집·이용(이름·연락처·이메일, 서비스 제공 목적)에 동의합니다.</span></label>' +
          '<button type="submit" class="btn btn-primary btn-block" id="signup-submit">회원가입</button>' +
        '</form>' +

        '<div class="auth-divider"><span>또는</span></div>' +
        '<button type="button" class="btn btn-kakao btn-block" id="kakao-login">' +
          icon('chat', 18) + '카카오 로그인</button>' +
        '<p class="field-hint center">외부 연동 필요 — 카카오 디벨로퍼스 앱 키 등록 후 활성화 (현재 이메일 로그인 이용)</p>' +
      '</section>' +

      '<section class="section">' +
        noticeBox('가입 시 입력한 정보는 예약·결과·훈련 기록 제공 목적으로만 사용됩니다. 측정 결과는 의료기관의 진단을 대체하지 않는 웰니스 데이터입니다.', 'neutral') +
      '</section>' +

      '<footer class="app-footer"><p class="footer-note">계정 문의 · ' + 'minawellnessworld@gmail.com</p></footer>',
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
        var consent = el.querySelector('#signup-consent').checked;
        if (!consent) { toast('개인정보 수집·이용 동의가 필요합니다.'); return; }
        setBusy(btn, true, '가입 중');
        try {
          var result = await signUp({
            email: el.querySelector('#signup-email').value,
            password: el.querySelector('#signup-password').value,
            fullName: el.querySelector('#signup-name').value,
            phone: el.querySelector('#signup-phone').value
          });
          if (result.needsConfirmation) {
            closeSheet();
            openSheet({
              title: '가입 확인 메일 발송',
              content: '<p class="sheet-help">' + esc(result.message) + '</p>' +
                noticeBox('메일 인증 후 로그인하면 예약과 기록을 사용할 수 있습니다.', 'neutral'),
              footer: '<button type="button" class="btn btn-primary" data-close>확인</button>',
              onMount: function (s) {
                var c = s.querySelector('[data-close]');
                if (c) c.addEventListener('click', function () { closeSheet(); });
              }
            });
            setBusy(btn, false);
            return;
          }
          toast('회원가입이 완료되었습니다.', 'success');
          ctx.rerender();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(btn, false);
        }
      });

      var kakao = el.querySelector('#kakao-login');
      kakao.addEventListener('click', function () {
        openSheet({
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
  var loadError = '';

  try {
    var loaded = await Promise.all([listBookings(), listPayments(), listNotifications(), listCoupons()]);
    bookings = loaded[0];
    payments = loaded[1];
    notifications = loaded[2];
    coupons = loaded[3];
  } catch (err) {
    loadError = friendlyError(err);
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

  var html =
    '<header class="profile-head">' +
      '<div class="profile-avatar">' + esc((profile.full_name || 'M').slice(0, 1)) + '</div>' +
      '<div class="profile-info">' +
        '<h1>' + esc(profile.full_name || '회원') + ' 님</h1>' +
        '<p class="muted small">' + esc(profile.email || '') + '</p>' +
        '<div class="grade-row">' + badge(profile.member_grade || 'Welcome', 'navy') +
          (isStaff() ? badge(profile.role === 'admin' ? '총괄 관리자' : '상담사', 'yellow') : badge('일반 회원', 'neutral')) +
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

    (isStaff()
      ? '<section class="section"><a class="admin-banner" href="#/admin">' +
          '<span class="admin-badge">' + icon('shield', 18) + ' ADMIN</span>' +
          '<span><strong>관리자 콘솔</strong><span>회원 · 예약 · 결과 · 매출 관리</span></span>' +
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
