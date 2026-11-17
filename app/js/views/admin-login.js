/* PART 3 — 관리자 로그인 포털 (#/admin-login)
   전체 관리자 · 제휴 기관 관리자 · 기관 직원 공용 로그인.
   일반 회원이 들어오면 권한 구분을 안내하고 마이페이지로 보냅니다.
   2단계 인증(TOTP)이 등록된 계정은 로그인 직후 6자리 코드 검증을 요구합니다. */
import { BRAND, ROLES, STAFF_PERMISSIONS } from '../config.js?v=2.0.10';
import { state, signIn, signOut, refreshProfile, homeRouteForRole, friendlyError } from '../store.js?v=2.0.10';
import { getMfaStatus, verifyTotp, needsMfaChallenge } from '../store-security.js?v=2.0.10';
import { icon, esc, toast, setBusy, go, openSheet, closeSheet, noticeBox } from '../ui.js?v=2.0.10';

function roleBadge(profile) {
  var role = profile ? profile.role : 'member';
  return '<span class="badge badge-gold">' + esc(ROLES[role] || role) + '</span>';
}

function portalShell(inner) {
  return '<div class="portal">' +
    '<aside class="portal-aside">' +
      '<div class="portal-brand">' +
        '<span class="portal-mark">M</span>' +
        '<div><strong>MINA WORLD</strong><span>Unified Platform v2</span></div>' +
      '</div>' +
      '<h1 class="portal-title">하나의 플랫폼,<br>세 개의 운영 화면</h1>' +
      '<p class="portal-desc">회원(B2C) · 전체 관리자 · 제휴 기관 관리자와 직원이 같은 데이터로 움직입니다.</p>' +
      '<ul class="portal-points">' +
        '<li><span class="portal-num">01</span><div><strong>전체 관리자</strong><em>전체 기관 · 회원 · 매출 · 정산 · 감사 로그</em></div></li>' +
        '<li><span class="portal-num">02</span><div><strong>제휴 기관 관리자</strong><em>자기 기관 회원 · 예약 · 결과 · 정산 (타 기관 차단)</em></div></li>' +
        '<li><span class="portal-num">03</span><div><strong>기관 직원</strong><em>부여된 세부 권한 메뉴만 표시</em></div></li>' +
      '</ul>' +
      '<p class="portal-foot">' + esc(BRAND.nonMedical) + '</p>' +
    '</aside>' +
    '<section class="portal-main">' + inner + '</section>' +
  '</div>';
}

function mfaFormHtml() {
  return '<div class="portal-card">' +
      '<span class="portal-eyebrow">' + icon('shield', 16) + ' 2단계 인증</span>' +
      '<h2>인증 코드 6자리를 입력해 주세요</h2>' +
      '<p class="muted small">인증 앱(Google Authenticator · 1Password 등)에 표시된 코드를 입력하면 관리 화면으로 이동합니다.</p>' +
      '<label class="field"><span class="field-label">인증 코드</span>' +
        '<input type="text" id="mfa-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></label>' +
      '<p class="field-hint err-text" id="mfa-error"></p>' +
      '<button type="button" class="btn btn-primary btn-block" id="mfa-submit">인증하고 계속</button>' +
      '<button type="button" class="btn btn-ghost btn-block btn-sm" id="mfa-cancel">다른 계정으로 로그인</button>' +
    '</div>';
}

export async function render(ctx) {
  var profile = state.profile;
  var signedIn = Boolean(state.session && profile);

  if (signedIn && !ctx.query.get('switch')) {
    var role = profile.role || 'member';
    var target = homeRouteForRole();
    var allowed = role === 'admin' || role === 'super_admin' || role === 'counselor' ||
      role === 'partner_admin' || role === 'staff';
    var inner =
      '<div class="portal-card">' +
        '<span class="portal-eyebrow">' + icon('user', 16) + ' 현재 로그인</span>' +
        '<h2>' + esc(profile.full_name || profile.email || '') + ' 님</h2>' +
        '<p class="muted small">' + esc(profile.email || '') + ' · ' + roleBadge(profile) + '</p>' +
        (allowed
          ? '<p class="portal-lead">이 계정으로 ' + (role === 'partner_admin' || role === 'staff' ? '제휴 기관 대시보드' : '전체 관리자 콘솔') + '에 들어갈 수 있습니다.</p>' +
            '<a class="btn btn-primary btn-block" href="#' + target + '">' + (role === 'partner_admin' || role === 'staff' ? '기관 대시보드로 이동' : '관리자 콘솔로 이동') + '</a>'
          : noticeBox('<strong>일반 회원 계정으로 로그인되어 있습니다.</strong> 관리자·기관 계정은 별도로 발급되며, 관리 기능은 회원 계정에 열리지 않습니다.', 'warn') +
            '<a class="btn btn-primary btn-block" href="#/account">마이페이지로 이동</a>') +
        '<button type="button" class="btn btn-ghost btn-block btn-sm" id="portal-switch">다른 계정으로 로그인</button>' +
      '</div>';
    return {
      title: '관리자 로그인',
      pageClass: 'portal-page',
      html: portalShell(inner),
      mount: function (el) {
        var btn = el.querySelector('#portal-switch');
        if (btn) {
          btn.addEventListener('click', async function () {
            await signOut();
            go('/admin-login');
            ctx.rerender();
          });
        }
      }
    };
  }

  var form =
    '<div class="portal-card">' +
      '<span class="portal-eyebrow">' + icon('lock', 16) + ' ADMIN PORTAL</span>' +
      '<h2>관리자 · 기관 담당자 로그인</h2>' +
      '<p class="muted small">전체 관리자, 제휴 기관 관리자, 기관 직원이 함께 사용하는 로그인입니다. 로그인 후 역할에 맞는 화면으로 자동 이동합니다.</p>' +
      '<form id="portal-form" autocomplete="on">' +
        '<label class="field"><span class="field-label">이메일</span>' +
          '<input type="email" id="portal-email" autocomplete="username" placeholder="name@example.com" required></label>' +
        '<label class="field"><span class="field-label">비밀번호</span>' +
          '<input type="password" id="portal-password" autocomplete="current-password" placeholder="비밀번호" required></label>' +
        '<button type="submit" class="btn btn-primary btn-block" id="portal-submit">로그인</button>' +
      '</form>' +
      '<p class="field-hint" id="portal-error"></p>' +
      '<div class="portal-links">' +
        '<a href="#/account">일반 회원 로그인 · 회원가입</a>' +
        '<a href="#/home">앱 홈으로</a>' +
      '</div>' +
      '<div class="portal-cap">' +
        '<h3>기관 직원은 어떤 메뉴가 열리나요?</h3>' +
        '<p class="muted small">기관 관리자가 부여한 권한만 표시됩니다. 부여되지 않은 메뉴는 화면에 나타나지 않고 주소로 접근해도 차단됩니다.</p>' +
        '<div class="perm-chips">' + STAFF_PERMISSIONS.map(function (p) {
          return '<span class="perm-chip">' + esc(p.label) + '</span>';
        }).join('') + '</div>' +
      '</div>' +
    '</div>';

  return {
    title: '관리자 로그인',
    pageClass: 'portal-page',
    html: portalShell(form),
    mount: function (el) {
      var formEl = el.querySelector('#portal-form');
      var errorEl = el.querySelector('#portal-error');

      formEl.addEventListener('submit', async function (event) {
        event.preventDefault();
        var submit = el.querySelector('#portal-submit');
        var email = el.querySelector('#portal-email').value;
        var password = el.querySelector('#portal-password').value;
        if (errorEl) errorEl.textContent = '';
        setBusy(submit, true, '로그인 중');
        try {
          await signIn(email, password);
          await refreshProfile();
          if (!state.profile) throw new Error('계정 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');

          var mustMfa = await needsMfaChallenge();
          if (mustMfa) {
            await openMfaChallenge(ctx);
            return;
          }
          routeByRole(ctx);
        } catch (err) {
          if (errorEl) errorEl.textContent = friendlyError(err);
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });
    }
  };
}

async function openMfaChallenge(ctx) {
  var status = await getMfaStatus();
  var verified = (status.verified && status.verified[0]) || null;
  if (!verified) {
    toast('2단계 인증 팩터를 찾지 못했습니다. 전체 관리자에게 문의해 주세요.', 'error');
    return;
  }
  openSheet({
    title: '2단계 인증',
    subtitle: '등록된 인증 앱의 6자리 코드를 입력해 주세요',
    content: mfaFormHtml(),
    onMount: function (el) {
      var input = el.querySelector('#mfa-code');
      var submit = el.querySelector('#mfa-submit');
      var errorEl = el.querySelector('#mfa-error');
      var cancel = el.querySelector('#mfa-cancel');
      if (input) input.focus();
      submit.addEventListener('click', async function () {
        var code = (input.value || '').replace(/\s/g, '');
        if (code.length !== 6) { errorEl.textContent = '6자리 코드를 입력해 주세요.'; return; }
        setBusy(submit, true, '확인 중');
        try {
          await verifyTotp(verified.id, code);
          closeSheet();
          toast('2단계 인증이 완료되었습니다.', 'success');
          routeByRole(ctx);
        } catch (err) {
          errorEl.textContent = friendlyError(err);
          setBusy(submit, false);
        }
      });
      if (cancel) {
        cancel.addEventListener('click', async function () {
          await signOut();
          closeSheet();
          ctx.rerender();
        });
      }
    }
  });
}

function routeByRole(ctx) {
  var role = state.profile ? state.profile.role : 'member';
  if (role === 'admin' || role === 'super_admin' || role === 'counselor') {
    go('/admin');
  } else if (role === 'partner_admin' || role === 'staff') {
    go('/partner');
  } else {
    openSheet({
      title: '관리 권한이 없는 계정입니다',
      content: noticeBox('이 계정은 <strong>일반 회원</strong>입니다. 관리자·기관 화면은 발급된 담당자 계정으로만 열립니다.', 'warn') +
        '<p class="sheet-help">기관 담당자 계정이 필요하다면 MINA WORLD 대표 메일로 요청해 주세요.</p>',
      footer: '<button type="button" class="btn btn-primary" data-close>확인</button>',
      onMount: function (el) {
        var c = el.querySelector('[data-close]');
        if (c) c.addEventListener('click', function () { closeSheet(); go('/account'); });
      }
    });
  }
}
