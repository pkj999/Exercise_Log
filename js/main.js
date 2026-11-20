'use strict';
// ---------- 초기화 ----------
Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function (b) {
  b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
});
$('minibar').addEventListener('click', function () { if (active) openEditor('live'); });
['touchstart', 'click'].forEach(function (ev) {
  document.addEventListener(ev, unlockAudio, { passive: true, once: true });
});
setInterval(tickTimers, 500);
document.addEventListener('visibilitychange', function () { if (!document.hidden) tickTimers(); });

(async function init() {
  try { OLD_KEYS.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
  history.replaceState({ depth: 0 }, '');
  loadActive();
  await loadData();
  applyTheme();
  $('loading').hidden = true;
  $('app').hidden = false;
  switchTab('workout');
  refreshChrome();
  if ('serviceWorker' in navigator) {
    try {
      // updateViaCache:'none' — sw.js 자체를 브라우저 HTTP 캐시에서 꺼내 "안 바뀜"으로 오판하지 않게.
      // 새 서비스워커가 넘겨받으면 한 번 자동 새로고침해서 최신 코드가 바로 반영되게 한다.
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
        reg.update().catch(function () {});
      });
      var reloading = false;
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (reloading || !hadController) return;
        reloading = true;
        window.location.reload();
      });
    } catch (e) {}
  }
})();
