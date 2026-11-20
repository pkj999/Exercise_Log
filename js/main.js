'use strict';

  // ---------- [화면] 하단 탭 전환 ----------
  var TITLES = { log: '운동일지', calendar: '캘린더', progress: '통계', settings: '설정' };
  var currentTab = 'log';
  var TAB_ORDER = ['log', 'calendar', 'progress', 'settings'];
  function switchTab(tab) {
    if (tab === currentTab && $('view-' + tab).style.display !== 'none') return;
    var prevIdx = TAB_ORDER.indexOf(currentTab);
    var nextIdx = TAB_ORDER.indexOf(tab);
    var dir = nextIdx >= prevIdx ? 'fwd' : 'back';
    currentTab = tab;
    $('view-log').style.display = tab === 'log' ? '' : 'none';
    $('view-calendar').style.display = tab === 'calendar' ? '' : 'none';
    $('view-progress').style.display = tab === 'progress' ? '' : 'none';
    $('view-settings').style.display = tab === 'settings' ? '' : 'none';
    var activeView = $('view-' + tab);
    activeView.classList.remove('wt-tab-anim-fwd', 'wt-tab-anim-back');
    void activeView.offsetWidth; // 애니메이션 재시작을 위한 강제 리플로우
    activeView.classList.add(dir === 'fwd' ? 'wt-tab-anim-fwd' : 'wt-tab-anim-back');
    $('screen-title').textContent = TITLES[tab];
    Array.prototype.forEach.call(document.querySelectorAll('.wt-tabbar-btn'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    disarm();
    if (tab === 'calendar') { renderCalendar(); renderCalDetail(); }
    if (tab === 'progress') {
      renderWeeklySummary();
      requestAnimationFrame(function () {
        renderCategoryVolumeChart();
        renderProteinStats();
        renderProgress();
      });
    }
    if (tab === 'settings') renderSettings();
    updateUnsavedBar();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.wt-tabbar-btn'), function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
  });

  $('progress-exercise').addEventListener('change', renderProgress);
  $('entry-date').addEventListener('change', function () {
    updateTodayVolume();
    renderProteinToday();
    checkFutureDate();
    saveDraft();
    routineOverrideId = null;
    renderTodayRoutineCard();
    if (QEState.current) openQuickEntry(QEState.current.category, QEState.current.name);
  });

  window.addEventListener('resize', function () {
    if ($('view-progress').style.display !== 'none') {
      renderCategoryVolumeChart();
      renderProteinStats();
      if ($('progress-stats').style.display !== 'none') renderProgress();
    }
  });
  document.addEventListener('touchstart', function once() {
    unlockAudio();
    document.removeEventListener('touchstart', once);
  }, { passive: true });
  document.addEventListener('click', function once() {
    unlockAudio();
    document.removeEventListener('click', once);
  });

  function renderAll() {
    renderCategoryChips();
    renderExercisePicker();
    renderTodayRoutineCard();
    renderStaging();
    renderHistory();
    renderProgressSelect();
    renderWeeklySummary();
    renderCategoryVolumeChart();
    renderProteinToday();
    renderProteinQuickChips();
    renderProteinStats();
    renderCalendar();
    renderCalDetail();
    renderSettings();
  }

  // ---------- [화면] 하단 고정 탭바 여백 확보 ----------
  function syncTabbarSpace() {
    var bar = $('tabbar');
    if (bar.style.display === 'none') return;
    var h = bar.getBoundingClientRect().height;
    $('wt-root').style.paddingBottom = (h + 20) + 'px';
  }
  window.addEventListener('resize', syncTabbarSpace);

  (async function init() {
    $('app-version').textContent = '운동일지 ver.' + APP_VERSION + ' · ' + APP_BUILD_DATE;
    hydrateIcons();
    await loadData();
    applyTheme();
    $('loading').style.display = 'none';
    $('view-log').style.display = '';
    $('tabbar').style.display = '';
    syncTabbarSpace();
    $('entry-date').value = fmtDate(new Date());
    await loadDraft();
    await resumeRestTimerIfAny();
    checkFutureDate();
    $('storage-mode').textContent = storageModeLabel();
    renderRpeChips();
    renderAll();
    if ('serviceWorker' in navigator) {
      try {
        // updateViaCache:'none' 없이는, 브라우저가 sw.js 파일 자체를 자기 HTTP 캐시에서
        // 꺼내 "바뀐 게 없다"고 판단해버릴 수 있다 — 그러면 서비스워커 안의 네트워크 우선
        // 전략을 고쳐도 그 수정된 sw.js 자체를 영영 못 받아오는 모순이 생긴다(실제로 겪은
        // 사고: 코드를 고쳐도 "반영 안 됐다"는 보고가 계속 들어옴). 매번 새 버전 여부를
        // 네트워크로 직접 확인하도록 강제하고, 새 버전이 넘겨받으면 한 번 자동 새로고침해서
        // 사용자가 수동으로 몇 번씩 새로고침할 필요가 없게 한다.
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
          reg.update().catch(function () {});
        });
        var swReloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          if (swReloading) return;
          swReloading = true;
          window.location.reload();
        });
      } catch (e) {}
    }
  })();
