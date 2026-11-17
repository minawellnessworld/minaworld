/* =====================================================================
   MINA WORLD App — Service Worker (v2.0.0)
   - 앱 셸(HTML/CSS/JS/아이콘) 전체 선캐시 → 오프라인에서도 껍데기 실행
   - 신규 v2 모듈(store-org / store-security / admin-login / partner / admin/*) 포함
   - Supabase · CDN · GA4 요청은 네트워크 패스스루 (캐시하지 않음)
   ===================================================================== */
const VERSION = 'mina-app-v2.0.2';
const CACHE_NAME = VERSION + '-shell';          // 앱 셸 선캐시
const RUNTIME_CACHE = VERSION + '-runtime';     // 런타임 보조 캐시

/* PRECACHE_ASSETS: index.html 이 로드하는 모든 모듈 + 신규 v2 모듈 전체 */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',

  /* core modules */
  './js/app.js',
  './js/config.js',
  './js/catalog.js',
  './js/supabase.js',
  './js/store.js',
  './js/store-org.js',
  './js/store-security.js',
  './js/ui.js',
  './js/booking.js',

  /* B2C views */
  './js/views/home.js',
  './js/views/brain-check.js',
  './js/views/neuro.js',
  './js/views/my-brain.js',
  './js/views/programs.js',
  './js/views/academy.js',
  './js/views/community.js',
  './js/views/account.js',
  './js/views/more.js',

  /* admin · partner */
  './js/views/admin.js',
  './js/views/admin-login.js',
  './js/views/partner.js',
  './js/views/admin/overview.js',
  './js/views/admin/bookings.js',
  './js/views/admin/members.js',
  './js/views/admin/results.js',
  './js/views/admin/content.js',
  './js/views/admin/orgs.js',
  './js/views/admin/settlements.js',
  './js/views/admin/audit.js',
  './js/views/admin/security.js',

  /* icons · assets */
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
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
