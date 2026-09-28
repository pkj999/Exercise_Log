// 운동 기록 — 간단한 앱 쉘 캐싱 서비스워커
// 로컬 파일(index.html, manifest, 아이콘)만 캐시하고,
// 외부 CDN(폰트 등)은 그대로 네트워크로 통과시킵니다.
const CACHE_NAME = 'workout-log-shell-ver1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-192-maskable.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 같은 출처(로컬 앱 쉘 파일)만 캐시 우선 전략 적용. GitHub API 요청은 항상 최신 데이터가
  // 필요하므로(오프라인 폴백은 앱 쪽 로컬 캐시가 이미 처리) 여기서 가로채지 않는다.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => {
        const fetchPromise = fetch(req)
          .then(res => {
            if (res && res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
  // 외부 CDN(폰트) 및 GitHub API 요청은 그대로 네트워크로
});
