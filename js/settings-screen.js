'use strict';

  // ---------- [설정] 설정 화면 ----------
  // 데이터 백업 카드도 아코디언으로 — 자주 안 쓰는 기능이라 기본은 접어둠(상태는 저장 안 하고
  // 매번 접힌 채로 시작).
  $('backup-head').addEventListener('click', function () {
    var head = $('backup-head'), body = $('backup-body');
    var open = !head.classList.contains('open');
    head.classList.toggle('open', open);
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    body.style.display = open ? '' : 'none';
  });
  function renderSettings() {
    $('rest-display').textContent = fmtMinSec(data.restSeconds);
    $('sound-switch').classList.toggle('on', data.sound);
    $('vibe-switch').classList.toggle('on', data.vibrate && canVibrate);
    $('vibe-support').textContent = canVibrate ? '' : '이 브라우저는 진동을 지원하지 않습니다';
    $('vibe-switch').style.opacity = canVibrate ? '1' : '0.4';
    $('flash-switch').classList.toggle('on', data.flash);
    $('goal-display').textContent = data.weeklyGoal > 0 ? '주 ' + data.weeklyGoal + '일' : '사용 안 함';
    $('goal-hint').textContent = data.weeklyGoal > 0 ? '채운 주는 캘린더에 체크 표시' : '';
    renderBody();
    renderProteinSettings();
    renderGithubSync();
    renderExerciseSubgroups();
    renderRoutines();
  }

  function renderProteinSettings() {
    ['cut', 'maintain', 'bulk'].forEach(function (g) {
      $('protein-goal-' + g).classList.toggle('active', data.protein.goalDirection === g);
    });
    $('protein-target-input').value = data.protein.targetG > 0 ? data.protein.targetG : '';
    $('protein-target-auto-btn').style.display = data.protein.targetAuto ? 'none' : '';
    var note = $('protein-target-note');
    if (!(data.weightKg > 0)) {
      note.textContent = '몸무게를 입력하면 체중 기반으로 목표량이 자동 계산됩니다. (일반적으로 알려진 참고 범위이며 개인차가 있을 수 있습니다)';
    } else if (data.protein.targetAuto) {
      note.textContent = '체중 ' + data.weightKg + 'kg × ' + PROTEIN_COEF[data.protein.goalDirection] + 'g/kg (' +
        PROTEIN_GOAL_LABELS[data.protein.goalDirection] + ' 기준) 으로 자동 계산됨';
    } else {
      note.textContent = '직접 설정한 값입니다. 입력칸을 비우면 자동 계산으로 되돌아갑니다.';
    }
  }

  $('goal-minus').addEventListener('click', function () {
    data.weeklyGoal = Math.max(0, data.weeklyGoal - 1);
    renderSettings();
    renderCalendar();
    renderWeeklySummary();
    persist();
  });
  $('goal-plus').addEventListener('click', function () {
    data.weeklyGoal = Math.min(7, data.weeklyGoal + 1);
    renderSettings();
    renderCalendar();
    renderWeeklySummary();
    persist();
  });

  $('body-height').addEventListener('change', function () {
    var v = parseFloat(this.value);
    data.heightCm = (isFinite(v) && v > 0 && v <= 260) ? v : 0;
    if (!data.heightCm) this.value = '';
    persist();
  });
  $('body-weight').addEventListener('change', function () {
    var v = parseFloat(this.value);
    data.weightKg = (isFinite(v) && v > 0 && v <= 400) ? v : 0;
    if (!data.weightKg) this.value = '';
    if (QEState.current) applyBodyweightMode(isCardio(QEState.current.category) ? null : QEState.current.name);
    recalcProteinTargetIfAuto();
    renderProteinSettings();
    renderProteinToday();
    persist();
  });

  ['cut', 'maintain', 'bulk'].forEach(function (g) {
    $('protein-goal-' + g).addEventListener('click', function () {
      data.protein.goalDirection = g;
      recalcProteinTargetIfAuto();
      renderProteinSettings();
      renderProteinToday();
      persist();
    });
  });
  $('protein-target-input').addEventListener('change', function () {
    var raw = this.value;
    if (!raw) {
      data.protein.targetAuto = true;
      recalcProteinTargetIfAuto();
    } else {
      var v = parseFloat(raw);
      if (!isFinite(v) || v <= 0 || v > LIMITS.proteinTarget) {
        this.value = data.protein.targetG > 0 ? data.protein.targetG : '';
        return;
      }
      data.protein.targetG = Math.round(v);
      data.protein.targetAuto = false;
    }
    renderProteinSettings();
    renderProteinToday();
    persist();
  });
  $('protein-target-auto-btn').addEventListener('click', function () {
    data.protein.targetAuto = true;
    recalcProteinTargetIfAuto();
    renderProteinSettings();
    renderProteinToday();
    persist();
  });

  $('rest-minus').addEventListener('click', function () {
    data.restSeconds = Math.max(15, data.restSeconds - 15);
    $('rest-display').textContent = fmtMinSec(data.restSeconds);
    persist();
  });
  $('rest-plus').addEventListener('click', function () {
    data.restSeconds = Math.min(600, data.restSeconds + 15);
    $('rest-display').textContent = fmtMinSec(data.restSeconds);
    persist();
  });
  $('sound-switch').addEventListener('click', function () {
    data.sound = !data.sound;
    if (data.sound) { unlockAudio(); beep(); }
    renderSettings();
    persist();
  });
  $('vibe-switch').addEventListener('click', function () {
    if (!canVibrate) return;
    data.vibrate = !data.vibrate;
    if (data.vibrate) buzz();
    renderSettings();
    persist();
  });
  $('flash-switch').addEventListener('click', function () {
    data.flash = !data.flash;
    renderSettings();
    persist();
  });
  $('theme-toggle').addEventListener('click', function () {
    data.dark = !data.dark;
    applyTheme();
    renderSettings();
    persist();
  });
  $('test-alert-btn').addEventListener('click', function () {
    unlockAudio();
    fireAlert();
    flashScreen();
  });

  // ---------- [저장] GitHub 동기화 화면 ----------
  function storageModeLabel() {
    if (store.mode === 'github') return '저장 위치: GitHub 저장소 (이 기기 포함 모든 기기 공유)';
    return store.mode === 'claude' ? '저장 위치: 클로드 앱' : '저장 위치: 이 브라우저';
  }
  function ghMsg(text, ok) {
    var el = $('gh-msg');
    el.textContent = text;
    el.style.color = ok ? 'var(--wt-good)' : 'var(--wt-danger)';
    el.style.display = 'block';
  }
  var ghVerified = false; // "연결 테스트"를 통과했을 때만 true — 그래야 "저장하고 시작"이 눌림
  function invalidateGhVerify() {
    ghVerified = false;
    $('gh-connect-btn').disabled = true;
    $('gh-verify-hint').style.display = 'none';
    $('gh-test-msg').style.display = 'none';
  }
  // 헤더에 담긴 "2027-09-28 00:00:00 UTC" 형식 문자열에서 날짜만 뽑아 보여줌
  function formatTokenExpiry(raw) {
    var m = String(raw || '').match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : String(raw || '');
  }
  // GitHub 카드를 아코디언으로 접었다 펼 수 있게 함. 연결 상태가 "바뀌는 순간"에만
  // 자동으로 펼치거나 접고(연결 안 됨→펼침, 연결됨→접힘), 그 뒤로는 사용자가 직접 누른
  // 상태를 유지한다(매번 다시 렌더링될 때마다 임의로 접히거나 펼쳐지면 불편하므로).
  var ghSectionOpen = null;
  var ghLastConnectedState = null;
  function applyGhOpen() {
    var head = $('gh-head'), body = $('gh-body');
    head.classList.toggle('open', !!ghSectionOpen);
    head.setAttribute('aria-expanded', ghSectionOpen ? 'true' : 'false');
    body.style.display = ghSectionOpen ? '' : 'none';
  }
  $('gh-head').addEventListener('click', function () {
    ghSectionOpen = !ghSectionOpen;
    applyGhOpen();
  });
  function renderGithubSync() {
    var cfg = getGhConfig();
    var expEl = $('gh-token-expiry');
    var connected = !!cfg;
    if (ghLastConnectedState === null || ghLastConnectedState !== connected) ghSectionOpen = !connected;
    ghLastConnectedState = connected;
    $('gh-head-status').textContent = connected ? '연결됨' : '미연결';
    if (cfg) {
      $('gh-status').textContent = '연결됨 — ' + cfg.owner + '/' + cfg.repo + (cfg.branch && cfg.branch !== 'main' ? ' (브랜치: ' + cfg.branch + ')' : '') + '. 이 기기에서 저장하면 GitHub에도 함께 저장됩니다.';
      $('gh-form').style.display = 'none';
      $('gh-refresh-header-btn').style.display = '';
      $('gh-recover-btn').style.display = '';
      $('gh-disconnect-btn').style.display = '';
      $('gh-help').style.display = 'none';
      if (cfg.tokenExpiresAt) {
        expEl.textContent = '토큰 만료일: ' + formatTokenExpiry(cfg.tokenExpiresAt);
        expEl.style.display = '';
      } else {
        expEl.style.display = 'none';
      }
    } else {
      $('gh-status').textContent = '연결 안 됨 — 이 기기에만 저장됩니다.';
      $('gh-form').style.display = 'flex';
      $('gh-refresh-header-btn').style.display = 'none';
      $('gh-recover-btn').style.display = 'none';
      $('gh-disconnect-btn').style.display = 'none';
      $('gh-help').style.display = '';
      expEl.style.display = 'none';
      invalidateGhVerify();
    }
    applyGhOpen();
  }
  ['gh-owner', 'gh-repo', 'gh-branch', 'gh-token'].forEach(function (id) {
    $(id).addEventListener('input', invalidateGhVerify);
  });
  $('gh-advanced-toggle').addEventListener('click', function () {
    var box = $('gh-advanced');
    box.style.display = box.style.display === 'none' ? '' : 'none';
  });
  function readGhFormCfg() {
    return {
      owner: $('gh-owner').value.trim(),
      repo: $('gh-repo').value.trim(),
      branch: $('gh-branch').value.trim() || 'main',
      token: $('gh-token').value.trim()
    };
  }
  $('gh-test-btn').addEventListener('click', async function () {
    var cfg = readGhFormCfg();
    if (!cfg.owner || !cfg.repo || !cfg.token) { ghMsg('계정명, 저장소 이름, 토큰을 모두 입력해주세요.', false); return; }
    var btn = $('gh-test-btn');
    btn.disabled = true;
    btn.textContent = '확인 중...';
    var testMsgEl = $('gh-test-msg');
    testMsgEl.style.display = 'none';
    try {
      await ghTestConnection(cfg);
      ghVerified = true;
      $('gh-connect-btn').disabled = false;
      $('gh-verify-hint').style.display = 'none';
      testMsgEl.textContent = '연결 성공! "저장하고 시작"을 눌러주세요.';
      testMsgEl.style.color = 'var(--wt-good)';
      testMsgEl.style.display = 'block';
    } catch (e) {
      ghVerified = false;
      $('gh-connect-btn').disabled = true;
      testMsgEl.textContent = e.message || '연결에 실패했습니다.';
      testMsgEl.style.color = 'var(--wt-danger)';
      testMsgEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = '연결 테스트';
    }
  });
  $('gh-connect-btn').addEventListener('click', async function () {
    if (!ghVerified) { $('gh-verify-hint').style.display = 'block'; return; }
    var cfg = readGhFormCfg();
    if (!cfg.owner || !cfg.repo || !cfg.token) { ghMsg('계정명, 저장소 이름, 토큰을 모두 입력해주세요.', false); return; }
    var btn = $('gh-connect-btn');
    btn.disabled = true;
    btn.textContent = '저장 중...';
    try {
      var remote = await ghGetData(cfg);
      cfg.tokenExpiresAt = remote.tokenExpiresAt || null;
      if (remote.value != null) {
        // 이미 그 저장소에 기록이 있으면 — 그걸 이 기기의 최신 기록으로 삼되, 연결 전에
        // 이 기기에만 있던 기록(다른 곳엔 없던 것)은 사라지지 않도록 합쳐준다
        var localDaysSnapshot = data.days.length ? JSON.parse(JSON.stringify(data.days)) : [];
        applyLoaded(JSON.parse(remote.value));
        ghSha = remote.sha;
        setGhConfig(cfg);
        if (localDaysSnapshot.length) {
          var mergeResult = mergeLocalDaysInto(data.days, localDaysSnapshot);
          await persist(); // 합친 결과를 GitHub에도 반영
          renderAll();
          if (mergeResult.addedDays || mergeResult.addedEx) {
            ghMsg('GitHub 기록을 불러오고, 연결 전 이 기기에만 있던 기록(새 날짜 ' + mergeResult.addedDays + '일 · 운동 ' + mergeResult.addedEx + '건)도 합쳤습니다.', true);
          } else {
            ghMsg('GitHub에 있던 기록을 불러왔습니다.', true);
          }
        } else {
          try { window.localStorage.setItem(GH_CACHE_KEY, remote.value); } catch (e) {}
          renderAll();
          ghMsg('GitHub에 있던 기록을 불러왔습니다.', true);
        }
      } else {
        // 저장소에 아직 파일이 없으면 — 지금 이 기기의 기록을 처음으로 올린다
        ghSha = null;
        setGhConfig(cfg);
        await persist();
        ghMsg('이 기기의 기록을 GitHub에 처음 업로드했습니다.', true);
      }
      $('gh-owner').value = ''; $('gh-repo').value = ''; $('gh-branch').value = ''; $('gh-token').value = '';
      renderGithubSync();
      $('storage-mode').textContent = storageModeLabel();
    } catch (e) {
      ghMsg(e.message || '저장에 실패했습니다. 계정명/저장소 이름과 토큰을 확인해주세요.', false);
    } finally {
      btn.disabled = false;
      btn.textContent = '저장하고 시작';
    }
  });
  // 업무일지처럼, 설정 탭에 들어가지 않고도 헤더에서 바로 최신 기록을 받아올 수 있게 함
  // (다크모드 전환 버튼과 같은 자리 — GitHub 연결 중일 때만 보임)
  $('gh-refresh-header-btn').addEventListener('click', async function () {
    var cfg = getGhConfig();
    if (!cfg) return;
    var btn = $('gh-refresh-header-btn');
    var icon = btn.querySelector('[data-icon]');
    btn.disabled = true;
    if (icon) icon.classList.add('wt-spin');
    try {
      // 이 기기에 아직 GitHub로 못 올린 변경사항이 남아있는 채로 여기서 그냥 네트워크
      // 최신본을 덮어써버리면, 그 변경사항이 통째로 사라진다(실제로 겪은 사고). 그래서
      // 새로고침 전에 먼저 그 변경사항부터 올리기를 한 번 시도하고, 그마저 실패하면
      // 새로고침 자체를 하지 않는다 — "최신을 보고 싶다"는 요청이 "지금 내 기록을 지운다"로
      // 이어지면 안 되기 때문.
      var pending = false;
      try { pending = !!window.localStorage.getItem(GH_PENDING_KEY); } catch (e) {}
      if (pending) {
        try { await persist(); }
        catch (e) {
          toast('아직 저장 안 된 내용이 있어 새로고침을 건너뛰었습니다');
          ghMsg('이 기기에 GitHub로 못 올린 변경사항이 있어 새로고침을 하지 않았습니다 (' + (e.message || '알 수 없는 오류') + '). 다시 시도해주세요.', false);
          return;
        }
      }
      // store.get은 방금 내가 저장한 직후엔 로컬 사본을 우선하는데(읽기 지연 방지),
      // 새로고침은 "다른 기기가 방금 바꾼 걸 지금 당장 확인하고 싶다"는 명시적 요청이므로
      // 그 우선순위를 건너뛰고 항상 네트워크에서 실제로 다시 받아온다
      var remote = await ghGetData(cfg);
      cfg.tokenExpiresAt = remote.tokenExpiresAt || null;
      setGhConfig(cfg);
      if (remote.value != null) {
        applyLoaded(JSON.parse(remote.value));
        ghSha = remote.sha;
        try { window.localStorage.setItem(GH_CACHE_KEY, remote.value); } catch (e) {}
        try { window.localStorage.setItem(GH_CACHE_AT_KEY, String(Date.now())); } catch (e) {}
        renderAll();
        toast('최신 기록을 받아왔습니다');
        ghMsg('최신 기록을 받아왔습니다.', true);
      } else {
        toast('GitHub에 아직 기록 파일이 없습니다');
        ghMsg('GitHub에 아직 기록 파일이 없습니다.', false);
      }
    } catch (e) {
      toast(e.message || '새로고침에 실패했습니다');
      ghMsg(e.message || '새로고침에 실패했습니다.', false);
    } finally {
      btn.disabled = false;
      if (icon) icon.classList.remove('wt-spin');
    }
  });
  // GitHub 연결 이전에(혹은 연결 없이) 이 기기에만 저장돼 있던 기록을 확인해서 지금 기록에 합침.
  // 연결·병합 로직은 항상 GH_CACHE_KEY/원격 값만 다루고 이 기기의 원래 로컬 저장 키(STORAGE_KEY)는
  // 건드리지 않으므로, 연결 전에 쓴 기록이 있었다면 이 기기 안에 그대로 남아있을 가능성이 높음.
  $('gh-recover-btn').addEventListener('click', async function () {
    var raw = null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (!raw) { ghMsg('이 기기에 남은 예전 로컬 기록을 찾지 못했습니다.', false); return; }
    var orphan;
    try { orphan = JSON.parse(raw); } catch (e) { ghMsg('로컬 기록을 읽지 못했습니다.', false); return; }
    if (!orphan || !Array.isArray(orphan.days) || !orphan.days.length) {
      ghMsg('합칠 만한 예전 로컬 기록이 없습니다.', false);
      return;
    }
    var result = mergeLocalDaysInto(data.days, orphan.days);
    if (result.addedDays || result.addedEx) {
      renderAll(); // 합친 결과는 GitHub 저장 성공 여부와 상관없이 일단 화면에 보여줌
      try {
        await persist();
        ghMsg('이 기기에 남아있던 예전 로컬 기록을 합쳤습니다 (새 날짜 ' + result.addedDays + '일 · 운동 ' + result.addedEx + '건).', true);
        toast('예전 로컬 기록을 합쳤습니다');
      } catch (e) {
        // GitHub 저장이 실패해도 합친 결과는 이미 이 기기 화면/캐시에는 반영돼 있으니, 그게
        // "다른 기기에는 아직 안 올라갔다"는 걸 명확히 알려줘야 함(조용히 성공한 척하면 안 됨)
        ghMsg('로컬에는 합쳤지만 GitHub 저장에는 실패했습니다 (' + (e.message || '알 수 없는 오류') + '). 네트워크 확인 후 다시 시도해주세요.', false);
      }
    } else {
      ghMsg('찾아본 로컬 기록은 이미 다 반영되어 있어서, 새로 합칠 기록은 없었습니다.', true);
    }
  });
  $('gh-disconnect-btn').addEventListener('click', function () {
    armDelete($('gh-disconnect-btn'), '연결을 해제할까요?', async function () {
      clearGhConfig();
      ghSha = null;
      // 연결을 끊은 뒤에도 지금까지 GitHub에서 보고 있던 최신 기록이 이 기기에 그대로 이어지도록,
      // 로컬 저장소로도 한 번 저장해둔다(안 하면 다음에 앱을 열 때 연결 전의 옛 로컬 기록으로
      // 되돌아가 버릴 수 있음 — GH_CACHE_KEY에만 있고 STORAGE_KEY엔 없던 데이터라서)
      renderGithubSync();
      $('storage-mode').textContent = storageModeLabel();
      try {
        await persist();
        ghMsg('이 기기에서 연결 설정을 삭제했습니다. 지금까지의 기록은 이 기기에 그대로 저장돼 있고, GitHub의 데이터도 그대로 남아있습니다.', true);
      } catch (e) {
        ghMsg('연결 설정은 삭제했지만, 이 기기 로컬 저장에 실패했습니다 (' + (e.message || '알 수 없는 오류') + ').', false);
      }
    });
  });

  // ---------- [저장] 데이터 백업 및 복원 ----------
  function backupMsg(text, ok) {
    var el = $('backup-msg');
    el.textContent = text;
    el.style.color = ok ? 'var(--wt-good)' : 'var(--wt-danger)';
    el.style.display = 'block';
  }
  function hideBackupUI() {
    $('backup-box').style.display = 'none';
    $('import-actions').style.display = 'none';
    $('export-actions').style.display = 'none';
    $('backup-msg').style.display = 'none';
  }
  $('export-btn').addEventListener('click', function () {
    hideBackupUI();
    var box = $('backup-box');
    box.value = JSON.stringify(data);
    box.style.display = 'block';
    $('export-actions').style.display = 'flex';
    backupMsg('아래 내용을 복사해서 안전한 곳에 보관하세요.', true);
    toast('내보내기 내용이 준비됐습니다');
  });
  $('select-all-btn').addEventListener('click', function () {
    var box = $('backup-box');
    box.focus(); box.select();
    try { box.setSelectionRange(0, box.value.length); } catch (e) {}
    backupMsg('선택되었습니다. 길게 눌러 복사하세요.', true);
  });
  $('import-btn').addEventListener('click', function () {
    hideBackupUI();
    var box = $('backup-box');
    box.value = '';
    box.style.display = 'block';
    $('import-actions').style.display = 'flex';
    box.focus();
    backupMsg('백업 내용을 붙여넣은 뒤 합치기를 누르세요.', true);
  });
  function backupFilename() { return 'workout-backup-' + fmtDate(new Date()) + '.json'; }
  $('download-btn').addEventListener('click', function () {
    hideBackupUI();
    var url = null;
    try {
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = backupFilename();
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      backupMsg(backupFilename() + ' 로 저장했습니다. 파일 앱의 다운로드 폴더를 확인하세요.', true);
      toast('백업 파일을 저장했습니다');
    } catch (e) {
      backupMsg('이 환경에서는 파일 저장이 막혀 있습니다. 아래 텍스트로 내보내기를 사용하세요.', false);
    }
    if (url) setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 3000);
  });

  $('file-import-btn').addEventListener('click', function () {
    hideBackupUI();
    var f = $('file-input');
    f.value = '';
    f.click();
  });
  $('file-input').addEventListener('change', function () {
    var file = this.files && this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var box = $('backup-box');
      box.value = String(reader.result || '');
      box.style.display = 'block';
      $('import-actions').style.display = 'flex';
      backupMsg('\'' + file.name + '\' 을 읽었습니다. 아래 합치기를 누르면 기존 기록에 더해집니다.', true);
    };
    reader.onerror = function () { backupMsg('파일을 읽지 못했습니다.', false); };
    reader.readAsText(file);
  });

  $('backup-close').addEventListener('click', hideBackupUI);
  $('backup-close-2').addEventListener('click', hideBackupUI);

  $('import-merge').addEventListener('click', async function () {
    var raw = ($('backup-box').value || '').trim();
    if (!raw) { backupMsg('붙여넣은 내용이 없습니다.', false); return; }
    var incoming;
    try { incoming = JSON.parse(raw); }
    catch (e) { backupMsg('형식이 올바르지 않습니다.', false); return; }
    if (!incoming || !Array.isArray(incoming.days)) { backupMsg('운동 기록이 들어있지 않습니다.', false); return; }

    // 형식 검증 — 깨진 날짜/수치가 저장소에 들어가지 않도록 걸러냄
    var skipped = 0;
    function validDate(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T00:00:00').getTime()); }
    function sanitizeSets(list) {
      var out = [];
      (list || []).forEach(function (st) {
        if (!st || typeof st !== 'object') { skipped += 1; return; }
        var o = { weight: Number(st.weight), reps: Number(st.reps), warmup: !!st.warmup };
        if (st.cardio) {
          o = { cardio: true, minutes: Number(st.minutes), intensity: Number(st.intensity), weight: 0, reps: 0, warmup: false };
          if (!isFinite(o.minutes) || o.minutes < 0 || o.minutes > LIMITS.minutes) { skipped += 1; return; }
          if (!isFinite(o.intensity) || o.intensity < 0 || o.intensity > LIMITS.intensity) o.intensity = 0;
          var ds = Number(st.distance);
          if (isFinite(ds) && ds > 0 && ds <= LIMITS.distance) o.distance = ds;
        } else {
          if (!isFinite(o.weight) || o.weight < 0 || o.weight > LIMITS.weight) { skipped += 1; return; }
          if (!isFinite(o.reps) || o.reps <= 0 || o.reps > LIMITS.reps) { skipped += 1; return; }
          var bl = Number(st.bwLoad);
          if (isFinite(bl) && bl > 0) { o.bw = true; o.bwLoad = bl; }
        }
        if (typeof st.note === 'string' && st.note) o.note = st.note.slice(0, 200);
        if (typeof st.rpe === 'string' && rpeOf(st.rpe)) o.rpe = st.rpe;
        if (Array.isArray(st.tags) && st.tags.length) o.tags = st.tags.filter(function (t) { return typeof t === 'string'; }).slice(0, 8);
        out.push(o);
      });
      return out;
    }
    function sanitizeExercises(list) {
      var out = [];
      (list || []).forEach(function (ex) {
        if (!ex || typeof ex.name !== 'string' || !ex.name.trim()) { skipped += 1; return; }
        var sets = sanitizeSets(ex.sets);
        if (!sets.length) return;
        out.push({
          name: ex.name.trim().slice(0, 60),
          category: CATEGORIES.indexOf(ex.category) !== -1 ? ex.category : '기타',
          sets: sets
        });
      });
      return out;
    }

    incoming.days = incoming.days.filter(function (dd) {
      if (!dd || !validDate(dd.date)) { skipped += 1; return false; }
      dd.exercises = sanitizeExercises(dd.exercises);
      return dd.exercises.length > 0;
    });

    var addedDays = 0, addedEx = 0;
    incoming.days.forEach(function (inDay) {
      if (!inDay || !inDay.date) return;
      var mine = data.days.find(function (d) { return d.date === inDay.date; });
      if (!mine) {
        data.days.push(JSON.parse(JSON.stringify(inDay)));
        addedDays += 1;
        addedEx += (inDay.exercises || []).length;
        return;
      }
      (inDay.exercises || []).forEach(function (inEx) {
        var dup = mine.exercises.some(function (myEx) {
          return myEx.name === inEx.name && JSON.stringify(myEx.sets) === JSON.stringify(inEx.sets);
        });
        if (!dup) { mine.exercises.push(JSON.parse(JSON.stringify(inEx))); addedEx += 1; }
      });
    });

    Object.keys(incoming.customExercises || {}).forEach(function (cat) {
      data.customExercises[cat] = data.customExercises[cat] || [];
      (incoming.customExercises[cat] || []).forEach(function (n) {
        if (data.customExercises[cat].indexOf(n) === -1) data.customExercises[cat].push(n);
      });
    });
    data.days.forEach(function (d) { d.exercises = mergeDupExercises(d.exercises); });

    renderAll();
    try {
      await persist();
      backupMsg('복원 완료 — 새 날짜 ' + addedDays + '일, 운동 ' + addedEx + '건 추가.' +
        (skipped ? ' 형식이 맞지 않는 ' + skipped + '건은 건너뛰었습니다.' : ''), true);
    } catch (e) {
      backupMsg('이 기기에는 반영했지만 GitHub 저장에는 실패했습니다 (' + (e.message || '알 수 없는 오류') + '). 네트워크 확인 후 다시 시도해주세요.', false);
    }
  });

