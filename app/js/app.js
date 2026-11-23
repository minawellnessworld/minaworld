/* =====================================================================
   MINA WORLD App — 부트스트랩 & 해시 라우터
   ===================================================================== */
import { state, boot, subscribe, isStaff, listNotifications, markNotificationRead } from './store.js?v=2.0.29';
import { icon, go, openSheet, closeSheet, loadingBlock, esc, timeAgo, toast } from './ui.js?v=2.0.29';
import { requireLoginSheet } from './booking.js?v=2.0.29';

import * as HomeView from './views/home.js?v=2.0.29';
import * as BrainCheckView from './views/brain-check.js?v=2.0.29';
import * as NeuroView from './views/neuro.js?v=2.0.29';
import * as MyBrainView from './views/my-brain.js?v=2.0.29';
import * as ProgramsView from './views/programs.js?v=2.0.29';
import * as AcademyView from './views/academy.js?v=2.0.29';
import * as CommunityView from './views/community.js?v=2.0.29';
import * as AccountView from './views/account.js?v=2.0.29';
import * as MoreView from './views/more.js?v=2.0.29';
import * as GamesView from './views/games.js?v=2.0.29';
import * as AdminView from './views/admin.js?v=2.0.29';
import * as AdminLoginView from './views/admin-login.js?v=2.0.29';
import * as PartnerView from './views/partner.js?v=2.0.29';

var ROUTES = {
  home: HomeView,
  'brain-check': BrainCheckView,
  neuro: NeuroView,
  'my-brain': MyBrainView,
  programs: ProgramsView,
  games: GamesView,
  academy: AcademyView,
  community: CommunityView,
  more: MoreView,
  account: AccountView,
  admin: AdminView,
  'admin-login': AdminLoginView,
  partner: PartnerView
};

var TABS = [
  { id: 'home', label: '홈', icon: 'home', match: ['home'] },
  { id: 'brain-check', label: '브레인체크', icon: 'pulse', match: ['brain-check', 'neuro'] },
  { id: 'my-brain', label: 'MY BRAIN', icon: 'brain', match: ['my-brain'] },
  { id: 'games', label: '두뇌게임', icon: 'gamepad', match: ['games'] },
  { id: 'programs', label: '프로그램', icon: 'grid', match: ['programs', 'academy'] },
  { id: 'more', label: '더보기', icon: 'menu', match: ['more', 'community', 'account', 'admin'] }
];

var currentView = null;
var unreadCount = 0;
var lastRouteKey = '';

function parseHash() {
  var raw = location.hash.replace(/^#/, '');
  if (!raw) return { path: '/home', segments: ['home'], query: new URLSearchParams() };
  var queryIndex = raw.indexOf('?');
  var query = new URLSearchParams(queryIndex >= 0 ? raw.slice(queryIndex + 1) : '');
  var path = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
  if (path.charAt(0) !== '/') path = '/' + path;
  var segments = path.split('/').filter(function (seg) { return seg.length > 0; });
  if (!segments.length) segments = ['home'];
  return { path: path, segments: segments, query: query };
}

function initials(name, email) {
  var source = (name || '').trim();
  if (source) return source.slice(0, 1);
  if (email) return String(email).slice(0, 1).toUpperCase();
  return 'M';
}

function renderHeader() {
  var header = document.getElementById('app-header');
  if (!header) return;
  var profile = state.profile;
  var label = profile ? initials(profile.full_name, profile.email) : 'M';
  header.innerHTML =
    '<a class="brand" href="#/home" aria-label="MINA WORLD 홈">' +
      '<img class="brand-logo" src="../assets/logo-pulse-accent.png" alt="MINA WORLD">' +
      '<span class="brand-word">MINA WORLD</span>' +
    '</a>' +
    '<div class="header-actions">' +
      '<button type="button" class="icon-btn" id="btn-noti" aria-label="알림함">' +
        icon('bell', 21) + (unreadCount > 0 ? '<span class="dot-badge"></span>' : '') +
      '</button>' +
      '<button type="button" class="avatar-chip' + (profile ? ' is-member' : '') + '" id="btn-account" aria-label="내 계정">' +
        (profile ? esc(label) : icon('user', 18)) +
      '</button>' +
    '</div>';

  var notiBtn = header.querySelector('#btn-noti');
  if (notiBtn) notiBtn.addEventListener('click', openNotificationSheet);
  var accountBtn = header.querySelector('#btn-account');
  if (accountBtn) accountBtn.addEventListener('click', function () { go('/account'); });

  var logo = header.querySelector('.brand-logo');
  if (logo) {
    logo.addEventListener('error', function () {
      logo.style.display = 'none';
      var word = header.querySelector('.brand-word');
      if (word) word.classList.add('is-visible');
    });
  }
}

function renderModeBanner() {
  var banner = document.getElementById('mode-banner');
  if (!banner) return;
  if (state.mode === 'live') {
    banner.innerHTML = '';
    banner.className = 'mode-banner is-live';
    return;
  }
  banner.className = 'mode-banner is-local';
  banner.innerHTML =
    '<button type="button" class="mode-banner-inner" id="mode-banner-btn">' +
      '<span class="mode-dot"></span>' +
      '<span><strong>로컬 체험 모드</strong> · Supabase 미연결 — 입력한 내용은 이 기기에만 저장됩니다.</span>' +
      '<span class="mode-more">안내</span>' +
    '</button>';
  var btn = banner.querySelector('#mode-banner-btn');
  if (btn) btn.addEventListener('click', function () {
    openSheet({
      title: '현재 연결 상태 안내',
      content:
        '<p class="sheet-help">이 화면은 <strong>Supabase 키가 아직 주입되지 않은 상태</strong>입니다. 화면·기능 검토를 위해 브라우저 저장소(localStorage)로 동작하며, 아래 데이터는 실제 서버에 저장되지 않습니다.</p>' +
        '<ul class="bullet-list">' +
          '<li>입력한 회원가입·예약·체크인 내용은 <strong>이 기기의 브라우저에만</strong> 저장됩니다.</li>' +
          '<li>검사 결과·훈련 기록은 관리자 화면에서 등록하기 전까지 <strong>빈 상태</strong>로 표시됩니다.</li>' +
          '<li>카카오 로그인, 온라인 카드결제, 알림톡·푸시는 외부 키 연동 전까지 <strong>연동 대기</strong> 상태로 표시됩니다.</li>' +
          '<li>Supabase 키를 주입하면 자동으로 실서버 모드로 전환됩니다. (js/config.js 안내 참고)</li>' +
        '</ul>',
      footer: '<button type="button" class="btn btn-primary" data-close>확인</button>',
      onMount: function (el) {
        var c = el.querySelector('[data-close]');
        if (c) c.addEventListener('click', function () { closeSheet(); });
      }
    });
  });
}

function renderTabBar(activeId) {
  var tabbar = document.getElementById('tabbar');
  if (!tabbar) return;
  tabbar.innerHTML = TABS.map(function (tab) {
    var active = tab.id === activeId ? ' is-active' : '';
    return '<a class="tab' + active + '" href="#/' + tab.id + '" aria-current="' + (active ? 'page' : 'false') + '">' +
      '<span class="tab-ico">' + icon(tab.icon, 22) + '</span>' +
      '<span class="tab-label">' + esc(tab.label) + '</span>' +
    '</a>';
  }).join('');
}

function activeTabFor(root) {
  for (var i = 0; i < TABS.length; i++) {
    if (TABS[i].match.indexOf(root) >= 0) return TABS[i].id;
  }
  return '';
}

export async function openNotificationSheet() {
  if (!state.session) {
    requireLoginSheet('알림은 로그인 후 확인할 수 있습니다.');
    return;
  }
  var body = loadingBlock('알림을 불러오는 중');
  openSheet({
    title: '알림함',
    subtitle: '앱 내 알림 저장 · 외부 발송(알림톡/푸시) 연동 대기',
    content: '<div id="noti-list">' + body + '</div>',
    onMount: async function (el) {
      var listEl = el.querySelector('#noti-list');
      try {
        var items = await listNotifications();
        if (!items.length) {
          listEl.innerHTML = '<div class="empty"><div class="empty-icon">' + icon('bell', 24) + '</div>' +
            '<p class="empty-title">아직 알림이 없습니다</p>' +
            '<p class="empty-desc">예약 접수·검사 결과 등록 시 이곳에 기록됩니다.</p></div>';
        } else {
          listEl.innerHTML = items.map(function (n) {
            return '<button type="button" class="noti-item' + (n.is_read ? '' : ' is-unread') + '" data-id="' + esc(n.id) + '">' +
              '<span class="noti-dot"></span>' +
              '<span class="noti-body"><strong>' + esc(n.title) + '</strong>' +
              '<span class="noti-text">' + esc(n.body) + '</span>' +
              '<span class="noti-meta">' + timeAgo(n.created_at) + ' · 앱 내 저장' + (n.channel === 'in_app' ? '' : ' · 외부 발송 연동 대기') + '</span>' +
              '</span></button>';
          }).join('');
          var buttons = listEl.querySelectorAll('.noti-item');
          for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener('click', async function () {
              var id = this.getAttribute('data-id');
              try { await markNotificationRead(id); } catch (err) { console.warn(err); }
              this.classList.remove('is-unread');
              unreadCount = Math.max(0, unreadCount - 1);
              renderHeader();
            });
          }
        }
      } catch (err) {
        listEl.innerHTML = '<p class="sheet-help">알림을 불러오지 못했습니다. ' + esc(err.message || '') + '</p>';
      }
    }
  });
}

async function refreshUnread() {
  if (!state.session) { unreadCount = 0; return; }
  try {
    var items = await listNotifications();
    unreadCount = items.filter(function (n) { return !n.is_read; }).length;
  } catch (err) {
    unreadCount = 0;
  }
}

function showDenied() {
  var el = document.getElementById('view');
  el.innerHTML =
    '<section class="page page-narrow">' +
      '<div class="empty empty-error">' +
        '<div class="empty-icon">' + icon('lock', 26) + '</div>' +
        '<p class="empty-title">접근 권한이 없습니다</p>' +
        '<p class="empty-desc">관리자 콘솔은 관리자 · 최고 관리자 · 본점 상담사 계정만 이용할 수 있습니다.</p>' +
        '<div class="empty-action"><a class="btn btn-primary" href="#/admin-login">관리자 포털에서 로그인</a>' +
          '<a class="btn btn-ghost" href="#/home">홈으로 돌아가기</a></div>' +
      '</div>' +
    '</section>';
}

async function renderRoute() {
  var route = parseHash();
  var root = route.segments[0];
  var view = ROUTES[root] || ROUTES.home;
  var body = document.body;
  var viewEl = document.getElementById('view');

  closeSheet(true);

  var isAdminRoute = root === 'admin';
  var isPartnerRoute = root === 'partner';
  var isPortalRoute = root === 'admin-login';
  var orgWorker = state.profile && (state.profile.role === 'partner_admin' || state.profile.role === 'staff');
  var platformStaff = state.profile && (state.profile.role === 'admin' || state.profile.role === 'super_admin' || state.profile.role === 'counselor');

  body.classList.toggle('admin-mode', Boolean(isAdminRoute || isPartnerRoute));
  body.classList.toggle('portal-mode', Boolean(isPortalRoute));

  if (isAdminRoute && !isStaff()) {
    renderHeader();
    renderTabBar('');
    showDenied();
    return;
  }

  if (isPartnerRoute && !orgWorker && !platformStaff) {
    /* 비로그인 · 일반 회원: partner 뷰가 안내 화면을 직접 렌더링합니다 */
    body.classList.remove('admin-mode');
  }

  renderTabBar(activeTabFor(root));
  renderHeader();

  var routeKey = route.path + '?' + route.query.toString();
  if (routeKey !== lastRouteKey) {
    lastRouteKey = routeKey;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  if (currentView && typeof currentView.destroy === 'function') {
    try { currentView.destroy(); } catch (err) { console.warn(err); }
  }
  currentView = null;

  var ctx = {
    root: root,
    segments: route.segments,
    query: route.query,
    path: route.path,
    rerender: renderRoute
  };

  if (viewEl) {
    viewEl.innerHTML = '<div class="page"><div class="route-loading"><span class="spinner"></span></div></div>';
    viewEl.classList.remove('view-enter');
    void viewEl.offsetWidth;
  }

  try {
    var result = await view.render(ctx);
    if (!result) return;
    if (viewEl) {
      viewEl.innerHTML = '<div class="page' + (result.pageClass ? ' ' + result.pageClass : '') + '">' + result.html + '</div>';
      viewEl.classList.add('view-enter');
    }
    document.title = (result.title ? result.title + ' | ' : '') + 'MINA WORLD';
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'page_view', { page_title: document.title, page_path: location.hash || '#/home' });
      }
    } catch (err) { /* analytics must never break the app */ }
    if (typeof result.mount === 'function') {
      await result.mount(viewEl);
    }
    currentView = result;
  } catch (err) {
    console.error('[MINA] 화면 렌더 실패', err);
    if (viewEl) {
      viewEl.innerHTML = '<div class="page"><div class="empty empty-error">' +
        '<div class="empty-icon">' + icon('alert', 26) + '</div>' +
        '<p class="empty-title">화면을 표시하지 못했습니다</p>' +
        '<p class="empty-desc">' + esc(err.message || '') + '</p>' +
        '<div class="empty-action"><button type="button" class="btn btn-ghost" id="reload-btn">다시 시도</button></div>' +
        '</div></div>';
      var reload = document.getElementById('reload-btn');
      if (reload) reload.addEventListener('click', renderRoute);
    }
  }
}

function setupGlobal() {
  window.addEventListener('hashchange', renderRoute);
  window.addEventListener('error', function (event) {
    console.error('[MINA] ' + (event.message || 'script error'));
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeSheet();
  });
  window.addEventListener('scroll', function () {
    var header = document.getElementById('app-header');
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }, { passive: true });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js?v=2.0.29').then(function (reg) {
      /* 매 방문마다 새 버전이 있는지 확인 → 배포 직후에도 오래된 앱 셸이 남지 않습니다 */
      if (reg && reg.update) {
        reg.update().catch(function () {});
      }
    }).catch(function (err) {
      console.warn('[MINA] 서비스워커 등록 실패', err);
    });
  });
}

async function start() {
  setupGlobal();
  registerServiceWorker();
  try {
    await boot();
  } catch (err) {
    console.error('[MINA] 초기화 실패', err);
    toast('앱 초기화 중 문제가 발생했습니다.', 'error');
  }
  await refreshUnread();
  renderModeBanner();
  subscribe(function () {
    refreshUnread().then(function () {
      renderHeader();
    });
  });
  if (!location.hash) {
    location.replace(location.pathname + '#/home');
  }
  await renderRoute();
}

start();
