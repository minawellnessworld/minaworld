/* 더보기 — 커뮤니티 · 아카데미 · 마이페이지 · 관리자 · 앱 안내 */
import { CONFIG, BRAND, MINA_MEANING, PRIVACY_POLICY, privacyPolicyHtml, BRAIN_GAMES } from '../config.js?v=2.0.26';
import { state, isStaff, isOrgWorker } from '../store.js?v=2.0.26';
import { icon, esc, badge, sectionHead, noticeBox, openSheet, closeSheet } from '../ui.js?v=2.0.26';

var LINKS = [
  { href: '#/games', ico: 'gamepad', title: 'BRAIN GAME', sub: '기억력 · 집중력 · 조준 · 순서 ' + BRAIN_GAMES.length + '종 두뇌게임' },
  { href: '#/community', ico: 'chat', title: 'MINA COMMUNITY', sub: '공지 · 뇌과학 정보 · 후기 · Q&A' },
  { href: '#/academy', ico: 'file', title: 'MINA ACADEMY', sub: '뇌교육상담사 전문가 과정 (40시간 · 5주)' },
  { href: '#/neuro', ico: 'sparkle', title: 'NEURO TRAINING', sub: '뉴로피드백 패키지 · 훈련 기록' },
  { href: '#/account', ico: 'user', title: '마이페이지', sub: '예약 · 결제 · 쿠폰 · 알림함' },
  { href: '#/brain-check', ico: 'pulse', title: 'BRAIN CHECK', sub: '간편검사 · 종합검사 예약' },
  { href: '#/admin-login', ico: 'lock', title: '관리자 · 기관 담당자', sub: '전체 관리자 · 제휴 기관 로그인 포털' }
];

export async function render(ctx) {
  var linkRows = LINKS.map(function (link) {
    return '<a class="more-row" href="' + link.href + '">' +
      '<span class="more-ico">' + icon(link.ico, 20) + '</span>' +
      '<span class="more-text"><strong>' + esc(link.title) + '</strong><span>' + esc(link.sub) + '</span></span>' +
      icon('chevronRight', 18) +
    '</a>';
  }).join('');

  var mi = MINA_MEANING.map(function (m) {
    return '<span class="mina-chip"><strong>' + esc(m.letter) + '</strong>' + esc(m.word) + '</span>';
  }).join('');

  var html =
    '<header class="page-head">' +
      '<span class="page-eyebrow">' + icon('menu', 16) + ' MORE</span>' +
      '<h1 class="page-title">더보기</h1>' +
      '<p class="page-desc">커뮤니티 · 아카데미 · 마이페이지 · 앱 안내를 한곳에서.</p>' +
    '</header>' +

    '<section class="section">' +
      '<div class="more-list">' + linkRows + '</div>' +
    '</section>' +

    (isStaff()
      ? '<section class="section"><a class="admin-banner" href="#/admin">' +
          '<span class="admin-badge">' + icon('shield', 18) + ' ADMIN</span>' +
          '<span><strong>관리자 콘솔</strong><span>회원 · 예약 · 결과 · 매출 · B2B 관리</span></span>' +
          icon('chevronRight', 18) + '</a></section>'
      : '') +

    (isOrgWorker()
      ? '<section class="section"><a class="admin-banner" href="#/partner">' +
          '<span class="admin-badge">' + icon('shield', 18) + ' PARTNER</span>' +
          '<span><strong>기관 대시보드</strong><span>기관 회원 · 예약 · 결과 · 정산</span></span>' +
          icon('chevronRight', 18) + '</a></section>'
      : '') +

    '<section class="section">' +
      sectionHead('브랜드', '') +
      '<div class="card brand-card">' +
        '<img class="brand-card-logo" src="../assets/logo-pulse-accent.png" alt="MINA Wellness World">' +
        '<p class="brand-slogan">“' + esc(BRAND.slogan) + '”</p>' +
        '<div class="mina-chips">' + mi + '</div>' +
      '</div>' +
    '</section>' +

    '<section class="section">' +
      sectionHead('앱 설치 안내', '') +
      '<div class="info-rows">' +
        '<div class="info-row">' + icon('sparkle', 17) + '<span><strong>아이폰</strong> Safari 공유 → ‘홈 화면에 추가’를 누르면 앱처럼 실행됩니다.</span></div>' +
        '<div class="info-row">' + icon('sparkle', 17) + '<span><strong>안드로이드</strong> Chrome 우측 상단 메뉴 → ‘앱 설치’를 선택하세요.</span></div>' +
        '<div class="info-row">' + icon('info', 17) + '<span><strong>버전</strong> v' + esc(CONFIG.APP_VERSION) + ' · PWA (웹앱)</span></div>' +
      '</div>' +
      '<button type="button" class="btn btn-ghost btn-block btn-sm" id="pwa-guide">설치 · 연동 상태 자세히 보기</button>' +
    '</section>' +

    '<section class="section">' +
      sectionHead('보안 · 정책', '<span class="muted small">v' + esc(CONFIG.APP_VERSION) + '</span>') +
      '<div class="info-rows">' +
        '<div class="info-row">' + icon('shield', 17) + '<span><strong>개인정보 처리방침</strong> 수집 항목 · 보유 기간 · 위탁사 · 이용자 권리 전문</span></div>' +
        '<div class="info-row">' + icon('lock', 17) + '<span><strong>민감정보 안내</strong> 뇌파 측정 · 상담 기록은 별도 동의 기반 웰니스 데이터입니다.</span></div>' +
        '<div class="info-row">' + icon('user', 17) + '<span><strong>개인정보 보호책임자</strong> 대표 이미나 · ' + esc(CONFIG.CONTACT_EMAIL) + '</span></div>' +
      '</div>' +
      '<button type="button" class="btn btn-ghost btn-block btn-sm" id="privacy-policy">' + icon('shield', 16) + '개인정보 처리방침 · 보안 안내 전문 보기</button>' +
    '</section>' +

    '<section class="section">' +
      noticeBox('<strong>비의료 웰니스 고지</strong><br>' + esc(BRAND.nonMedical), 'warn') +
      noticeBox('결제(PG) · 카카오 알림톡 · 앱 푸시는 외부 키 연동 전까지 <strong>연동 대기</strong> 상태로 표시됩니다.', 'neutral') +
    '</section>' +

    '<footer class="app-footer">' +
      '<p class="footer-brand">MINA Wellness World</p>' +
      '<p class="footer-note">대표 이미나 · minawellnessworld@gmail.com · 010-5424-0807</p>' +
      '<p class="footer-links"><a href="../index.html">홈페이지</a><span>·</span><a href="../programs.html">프로그램 안내</a></p>' +
    '</footer>';

  return {
    title: '더보기',
    html: html,
    mount: function (el) {
      var privacyBtn = el.querySelector('#privacy-policy');
      if (privacyBtn) {
        privacyBtn.addEventListener('click', function () {
          openSheet({
            title: '개인정보 처리방침 · 보안 안내',
            subtitle: '시행 ' + PRIVACY_POLICY.effective + ' · 버전 ' + PRIVACY_POLICY.version,
            wide: true,
            content: privacyPolicyHtml(),
            footer: '<button type="button" class="btn btn-primary" data-close>확인</button>',
            onMount: function (sheet) {
              var c = sheet.querySelector('[data-close]');
              if (c) c.addEventListener('click', function () { closeSheet(); });
            }
          });
        });
      }

      var btn = el.querySelector('#pwa-guide');
      if (btn) {
        btn.addEventListener('click', function () {
          openSheet({
            title: '앱 · 연동 상태',
            content:
              '<div class="status-list">' +
                '<div class="status-row"><span>로그인 · 데이터 저장</span>' + badge(state.mode === 'live' ? '연결됨 (Supabase)' : '로컬 체험 모드', state.mode === 'live' ? 'green' : 'yellow') + '</div>' +
                '<div class="status-row"><span>카카오 로그인</span>' + badge('외부 키 연동 필요', 'neutral') + '</div>' +
                '<div class="status-row"><span>온라인 카드결제(PG)</span>' + badge('가맹점 키 연동 대기', 'neutral') + '</div>' +
                '<div class="status-row"><span>카카오 알림톡 / 앱 푸시</span>' + badge('API 연동 필요', 'neutral') + '</div>' +
                '<div class="status-row"><span>검사 결과지 보관</span>' + badge('비공개 Storage · Signed URL', 'green') + '</div>' +
              '</div>' +
              '<p class="sheet-help">앱 버전 v' + esc(CONFIG.APP_VERSION) + ' · iOS/Android 스토어 앱은 동일 코드로 Capacitor 패키징 예정입니다.</p>',
            footer: '<button type="button" class="btn btn-primary" data-close>확인</button>',
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
