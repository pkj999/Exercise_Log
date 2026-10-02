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
      try { navigator.serviceWorker.register('sw.js'); } catch (e) {}
    }
  })();
