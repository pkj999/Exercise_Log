'use strict';

  // ---------- [설정] 테마 (라이트/다크) ----------
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', data.dark ? 'dark' : 'light');
    $('theme-color-meta').setAttribute('content', data.dark ? '#111214' : '#F7F7F9');
    $('theme-toggle').innerHTML = svg(data.dark ? 'sun' : 'moon', 16);
    redrawCharts();
  }
  function redrawCharts() {
    if ($('view-progress').style.display !== 'none') {
      renderCategoryVolumeChart();
      if ($('progress-stats').style.display !== 'none') renderProgress();
    }
  }

  // ---------- [알림] 소리 · 진동 · 화면 플래시 ----------
  var canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  function unlockAudio() {
    if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }
  function beep() {
    if (!data.sound) return;
    unlockAudio();
    if (!audioCtx) return;
    try {
      [0, 0.28, 0.56].forEach(function (offset) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880;
        var t = audioCtx.currentTime + offset;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(t); osc.stop(t + 0.22);
      });
    } catch (e) {}
  }
  function buzz() {
    if (!data.vibrate || !canVibrate) return;
    try { navigator.vibrate([250, 120, 250, 120, 400]); } catch (e) {}
  }
  function fireAlert() { beep(); buzz(); }
  function flashScreen() {
    var el = $('wt-flash-overlay');
    if (!el) return;
    el.classList.remove('show');
    void el.offsetWidth; // 애니메이션 재시작을 위한 리플로우
    el.classList.add('show');
  }

  // ---------- [알림] 휴식 타이머 ----------
  var timerEndPulseId = null;
  // 새로고침 후에도 이어지도록, 남은 초가 아니라 "종료 예정 시각"을 저장해둔다
  function persistTimerEnd(endAt) {
    try { store.set(TIMER_KEY, endAt ? String(endAt) : ''); } catch (e) {}
  }
  function runTimerTick() {
    timerId = setInterval(function () {
      timerRemaining -= 1;
      if (timerRemaining <= 0) {
        clearInterval(timerId); timerId = null;
        onRestTimerEnd();
        return;
      }
      $('rest-timer-value').textContent = fmtMinSec(timerRemaining);
    }, 1000);
  }
  function startRestTimer() {
    stopRestTimer();
    timerRemaining = data.restSeconds;
    persistTimerEnd(Date.now() + data.restSeconds * 1000);
    $('rest-timer-pill').style.display = 'flex';
    updateUnsavedBar();
    $('rest-timer-value').textContent = fmtMinSec(timerRemaining);
    runTimerTick();
  }
  // 새로고침·재접속 시 저장해둔 종료 예정 시각을 읽어 타이머를 이어서 표시
  function resumeRestTimerIfAny() {
    return store.get(TIMER_KEY).then(function (res) {
      var endAt = res && res.value ? parseInt(res.value, 10) : 0;
      if (!endAt) return;
      var remaining = Math.round((endAt - Date.now()) / 1000);
      if (remaining > 0) {
        timerRemaining = remaining;
        $('rest-timer-pill').style.display = 'flex';
        updateUnsavedBar();
        $('rest-timer-value').textContent = fmtMinSec(timerRemaining);
        runTimerTick();
      } else {
        // 자리를 비운 사이 이미 끝난 경우: 소리·진동 없이 종료 상태만 표시
        $('rest-timer-pill').style.display = 'flex';
        $('rest-timer-pill').classList.add('wt-timer-ended');
        $('rest-timer-value').textContent = '휴식 끝';
        updateUnsavedBar();
        persistTimerEnd(null);
      }
    }).catch(function () {});
  }
  // 휴식 종료: 사용자가 직접 닫기 전까지 진동/화면 플래시를 반복해 알아차리기 쉽게 함
  function onRestTimerEnd() {
    $('rest-timer-value').textContent = '휴식 끝';
    $('rest-timer-pill').classList.add('wt-timer-ended');
    persistTimerEnd(null);
    fireAlert();
    flashScreen();
    var reps = 0;
    timerEndPulseId = setInterval(function () {
      reps += 1;
      if (reps >= 6) { clearInterval(timerEndPulseId); timerEndPulseId = null; return; }
      buzz();
      flashScreen();
    }, 2200);
  }
  function stopRestTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (timerEndPulseId) { clearInterval(timerEndPulseId); timerEndPulseId = null; }
    $('rest-timer-pill').classList.remove('wt-timer-ended');
    persistTimerEnd(null);
  }

  $('rest-timer-stop').addEventListener('click', function () {
    stopRestTimer();
    $('rest-timer-pill').style.display = 'none';
    updateUnsavedBar();
  });
  // 종료 상태(펄스 중)일 때는 알림음 영역을 탭해도 바로 닫히도록 함 (정지 버튼 대체 동선)
  $('rest-timer-pill').addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#rest-timer-stop')) return;
    if (!$('rest-timer-pill').classList.contains('wt-timer-ended')) return;
    stopRestTimer();
    $('rest-timer-pill').style.display = 'none';
    updateUnsavedBar();
  });

