/* =====================================================================
   MINA WORLD App — Service Worker (v2.0.0)
   - 앱 셸(HTML/CSS/JS/아이콘) 전체 선캐시 → 오프라인에서도 껍데기 실행
   - 신규 v2 모듈(store-org / store-security / admin-login / partner / admin/*) 포함
   - Supabase · CDN · GA4 요청은 네트워크 패스스루 (캐시하지 않음)
   ===================================================================== */
const VERSION = 'mina-app-v2.0.23';
const CACHE_NAME = VERSION + '-shell';          // 앱 셸 선캐시
const RUNTIME_CACHE = VERSION + '-runtime';     // 런타임 보조 캐시

/* PRECACHE_ASSETS: index.html 이 로드하는 모든 모듈 + 신규 v2 모듈 전체 */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json?v=2.0.23',
  './css/app.css?v=2.0.23',

  /* core modules */
  './js/app.js?v=2.0.23',
  './js/config.js?v=2.0.23',
  './js/catalog.js?v=2.0.23',
  './js/check-items.js?v=2.0.23',
  './js/pdf-parser.js?v=2.0.23',
  './js/capture-ocr.js?v=2.0.23',
  './js/supabase.js?v=2.0.23',
  './js/store.js?v=2.0.23',
  './js/spoon.js?v=2.0.23',
  './js/store-org.js?v=2.0.23',
  './js/store-security.js?v=2.0.23',
  './js/ui.js?v=2.0.23',
  './js/booking.js?v=2.0.23',

  /* B2C views */
  './js/views/home.js?v=2.0.23',
  './js/views/brain-check.js?v=2.0.23',
  './js/views/neuro.js?v=2.0.23',
  './js/views/my-brain.js?v=2.0.23',
  './js/views/programs.js?v=2.0.23',
  './js/views/academy.js?v=2.0.23',
  './js/views/community.js?v=2.0.23',
  './js/views/account.js?v=2.0.23',
  './js/views/more.js?v=2.0.23',

  /* admin · partner */
  './js/views/admin.js?v=2.0.23',
  './js/views/admin-login.js?v=2.0.23',
  './js/views/partner.js?v=2.0.23',
  './js/views/admin/overview.js?v=2.0.23',
  './js/views/admin/bookings.js?v=2.0.23',
  './js/views/admin/members.js?v=2.0.23',
  './js/views/admin/results.js?v=2.0.23',
  './js/views/admin/content.js?v=2.0.23',
  './js/views/admin/orgs.js?v=2.0.23',
  './js/views/admin/settlements.js?v=2.0.23',
  './js/views/admin/audit.js?v=2.0.23',
  './js/views/admin/security.js?v=2.0.23',
  './js/views/admin/neuro-capture.js?v=2.0.23',

  /* icons · assets */
  './icons/icon-192.png?v=2.0.23',
  './icons/icon-512.png?v=2.0.23',
  './icons/icon-maskable-512.png?v=2.0.23',
  './icons/apple-touch-icon.png?v=2.0.23',
  './icons/favicon-32.png?v=2.0.23',
  '../assets/logo-pulse-accent.png',
  '../assets/logo-pulse-white.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 개별 실패가 전체 설치를 막지 않도록 하나씩 캐시
      return Promise.all(
        PRECACHE_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn('[SW] 캐시 실패', url, err && err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isPassthrough(url) {
  const host = url.hostname;
  return (
    host.endsWith('supabase.co') ||
    host.endsWith('supabase.in') ||
    host === 'cdn.jsdelivr.net' ||
    host === 'www.googletagmanager.com' ||
    host === 'www.google-analytics.com' ||
    host === 'fonts.googleapis.com' ||
    host === 'fonts.gstatic.com'
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  if (url.origin !== self.location.origin) {
    // 외부 API · CDN · 분석 도구는 그대로 네트워크로
    if (isPassthrough(url)) return;
    return;
  }

  // 페이지 이동(navigation) 요청: 네트워크 우선, 실패 시 캐시된 앱 셸
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() =>
          caches.match('./index.html').then((cached) => cached || caches.match('./'))
        )
    );
    return;
  }

  // 데이터 피드(JSON: spoon-feed / articles)는 캐시하지 않고 항상 네트워크 최신본을 씁니다
  if (/\/data\/[^/]*\.json$/.test(url.pathname)) {
    event.respondWith(
      fetch(request.url, { cache: 'no-store' }).catch(() => caches.match(request))
    );
    return;
  }

  // 정적 자원: 캐시 우선 + 백그라운드 갱신
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
