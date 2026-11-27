// 운동일지 — 간단한 앱 쉘 캐싱 서비스워커
// 로컬 파일(index.html, manifest, 아이콘)만 캐시하고,
// 외부 CDN(폰트 등)은 그대로 네트워크로 통과시킵니다.
const CACHE_NAME = 'exercise-log-shell-r1-12';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
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

// 휴식 끝 알림: 앱 화면의 타이머는 앱을 나가면 멈추므로, 화면이 "몇 시에 알려줘"(rest-schedule)를 보내면
// 서비스워커가 그 시각까지 기다렸다가 알림을 띄운다. 기다리는 동안 waitUntil로 서비스워커가 꺼지지 않게 붙잡는데,
// 브라우저가 이를 최대 약 5분까지만 허용하므로 그보다 긴 휴식은 알림을 보장하지 못한다.
// 새 예약이나 취소(rest-cancel)가 오면 이전 예약은 무효(token)가 되고, 앱을 보고 있으면 알림을 건너뛴다(앱 안 알림이 울림).
let restToken = 0;
const REST_MAX_WAIT_MS = 295000;
self.addEventListener('message', event => {
  const d = event.data || {};
  if (d.type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (d.type === 'rest-cancel') { restToken++; return; }
  if (d.type === 'rest-schedule') {
    const token = ++restToken;
    const delay = Math.max(0, Number(d.at) - Date.now());
    if (delay > REST_MAX_WAIT_MS) return;
    event.waitUntil(new Promise(resolve => setTimeout(resolve, delay)).then(async () => {
      if (token !== restToken) return;
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (list.some(c => c.visibilityState === 'visible' && c.focused)) return;
      await self.registration.showNotification(d.title || '휴식 끝!', d.options || {});
    }).catch(() => {}));
  }
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

// 휴식 끝 알림을 누르면 열려 있는 앱 창으로 돌아가고, 없으면 새로 연다
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      return self.clients.openWindow ? self.clients.openWindow('./') : undefined;
    })
  );
});
