// 운동일지 — 간단한 앱 쉘 캐싱 서비스워커
// 로컬 파일(index.html, manifest, 아이콘)만 캐시하고,
// 외부 CDN(폰트 등)은 그대로 네트워크로 통과시킵니다.
const CACHE_NAME = 'workout-log-shell-ver3';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon-192.png',
  './icon-192-maskable.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './js/core.js',
  './js/github-sync.js',
  './js/calc.js',
  './js/persist.js',
  './js/alerts.js',
  './js/entry-form.js',
  './js/staging-protein.js',
  './js/history-calendar.js',
  './js/stats.js',
  './js/settings-screen.js',
  './js/routine.js',
  './js/main.js'
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

  // 같은 출처(로컬 앱 쉘 파일)는 네트워크 우선 전략. 예전엔 캐시를 먼저 보여주고 네트워크
  // 응답은 "다음번"을 위해서만 저장해뒀는데, 그러면 코드를 고쳐 배포해도 한 번 더
  // 새로고침해야 반영되는 것처럼 보이는 문제가 있었다(실제로 겪은 혼란). 온라인일 땐 항상
  // 최신 파일을 받아오고, 오프라인일 때만 마지막으로 받아둔 캐시로 대신한다.
  // GitHub API 요청도 항상 최신 데이터가 필요하므로(오프라인 폴백은 앱 쪽 로컬 캐시가 이미
  // 처리) 여기서 가로채지 않는다.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
  // 외부 CDN(폰트) 및 GitHub API 요청은 그대로 네트워크로
});
