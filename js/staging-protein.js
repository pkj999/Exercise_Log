'use strict';

  // ---------- [입력] 오늘 추가할 기록 (저장 전 임시 목록) ----------
  // 오늘보다 미래 날짜면 안내 표시 (차단하지는 않음 — 계획 입력을 막지 않기 위함)
  function checkFutureDate() {
    var el = $('future-note');
    if (!el) return;
    var v = $('entry-date').value;
    el.style.display = (v && v > fmtDate(new Date())) ? '' : 'none';
  }

  function renderStaging() {
    var area = $('staging-area'), list = $('staging-list');
    updateTodayVolume();
    renderTodayRoutineCard();
    if (staging.length === 0) { area.style.display = 'none'; updateUnsavedBar(); return; }
    area.style.display = '';
    list.innerHTML = '';
    var dateVal = $('entry-date').value;

    staging.forEach(function (item, i) {
      var m = meta(item.category);
      var row = document.createElement('div');
      row.className = 'wt-row-card';

      var todayMax = maxWeight(item.sets);
      var last = lastPerformance(item.name, dateVal, item.variant);
      var trend = '';
      if (!isCardio(item.category) && last && last.maxWeight > 0 && todayMax > 0) {
        var d = Math.round((todayMax - last.maxWeight) * 100) / 100;
        if (d > 0) trend = '<span style="color:var(--wt-good);font-size:12px;margin-left:6px;font-weight:700;display:inline-flex;align-items:center;gap:1px;vertical-align:-3px;">' + svg('arrow-up', 12) + '+' + d + 'kg</span>';
        else if (d < 0) trend = '<span style="color:var(--wt-text-muted);font-size:12px;margin-left:6px;display:inline-flex;align-items:center;gap:1px;vertical-align:-3px;">' + svg('arrow-down', 12) + d + 'kg</span>';
        else trend = '<span style="color:var(--wt-text-muted);font-size:12px;margin-left:6px;">동일</span>';
      }

      var icon = document.createElement('div');
      icon.className = 'wt-row-icon';
      icon.innerHTML = svg(m.icon, 21);

      var warmCount = (item.sets || []).filter(function (s) { return s.warmup; }).length;
      var summary;
      if (!item.sets.length) {
        summary = isCardio(item.category) ? '기록을 추가하세요' : '세트를 추가하세요';
      } else if (hasCardio(item.sets)) {
        summary = item.sets.map(setLabel).join(' / ') + ' · 총 ' + totalMinutes(item.sets) + '분';
      } else {
        summary = item.sets.map(function (s) { return setLabel(s).replace(' × ', '×') + (s.warmup ? 'W' : ''); }).join(', ') +
          (warmCount ? ' · 워밍업 ' + warmCount : '');
      }
      var variantBadge = item.variant ? '<span class="wt-plan-badge">' + escapeHtml(item.variant) + '</span>' : '';
      var mid = document.createElement('div');
      mid.className = 'wt-flex1-0';
      mid.style.cursor = 'pointer';
      mid.innerHTML = '<p style="font-size:13px;font-weight:700;margin:0;color:var(--wt-text);">' + escapeHtml(item.name) + variantBadge + trend + '</p>' +
        '<p style="font-size:12px;color:var(--wt-text-muted);margin:2px 0 0;">' + summary + '</p>';
      mid.addEventListener('click', function () {
        selectedCategory = item.category;
        editMode = false;
        renderCategoryChips();
        renderExercisePicker();
        openQuickEntry(item.category, item.name);
      });

      var ordWrap = document.createElement('div');
      ordWrap.className = 'wt-col wt-gap-3 wt-shrink0';
      var up = document.createElement('button');
      up.type = 'button'; up.className = 'wt-rm-ord'; up.setAttribute('aria-label', item.name + ' 위로 이동');
      up.innerHTML = svg('chevron-up', 14);
      up.disabled = i === 0;
      up.addEventListener('click', function () {
        var t = staging[i - 1];
        staging[i - 1] = staging[i];
        staging[i] = t;
        renderStaging();
        saveDraft();
      });
      var down = document.createElement('button');
      down.type = 'button'; down.className = 'wt-rm-ord'; down.setAttribute('aria-label', item.name + ' 아래로 이동');
      down.innerHTML = svg('chevron-down', 14);
      down.disabled = i === staging.length - 1;
      down.addEventListener('click', function () {
        var t = staging[i + 1];
        staging[i + 1] = staging[i];
        staging[i] = t;
        renderStaging();
        saveDraft();
      });
      ordWrap.appendChild(up); ordWrap.appendChild(down);

      var del = document.createElement('button');
      del.className = 'wt-icon-btn-sm danger';
      del.setAttribute('aria-label', item.name + ' 삭제');
      del.innerHTML = svg('trash', 14);
      del.addEventListener('click', function () {
        armDelete(del, '삭제할까요?', function () {
          removeStaging(item);
          if (QEState.current === item) closeQuickEntry();
          renderStaging();
          saveDraft();
        });
      });

      row.appendChild(icon); row.appendChild(mid); row.appendChild(ordWrap); row.appendChild(del);
      list.appendChild(row);
    });

    var c = stagingCounts();
    $('draft-note').textContent = c.sets
      ? c.ex + '종목 · ' + c.sets + '세트 — 아직 저장되지 않았습니다'
      : '임시 저장됨 — 앱을 닫아도 유지됩니다';
    updateUnsavedBar();
  }

  function updateTodayVolume() {
    var dateVal = $('entry-date').value;
    var saved = data.days.find(function (d) { return d.date === dateVal; });
    var sets = 0;
    if (saved) saved.exercises.forEach(function (ex) { sets += workSets(ex.sets).length; });
    staging.forEach(function (s) { sets += workSets(s.sets).length; });
    $('today-volume').textContent = sets + '세트';
    updateTodayDuration();
  }
  // 기능1 - 로그 화면 상단 소요시간 캡션("OO분 진행 중" / "총 OO분")
  function updateTodayDuration() {
    var dateVal = $('entry-date').value;
    var saved = data.days.find(function (d) { return d.date === dateVal; });
    var savedMin = saved ? (saved.durationMin || 0) : 0;
    var isToday = dateVal === fmtDate(new Date());
    var liveActive = isToday && !!sessionStartAt;
    var cap = $('duration-caption');
    if (liveActive) {
      var liveMin = liveSessionMinutes();
      cap.textContent = '⏱ 오늘 ' + (fmtDuration(savedMin + liveMin) || '1분 미만') + ' 진행 중';
      cap.style.display = '';
    } else if (saved && saved.startedAt > 0) {
      cap.textContent = '⏱ 총 ' + (fmtDuration(savedMin) || '1분 미만');
      cap.style.display = '';
    } else {
      cap.style.display = 'none';
    }
  }

  // ---------- [단백질] '오늘 단백질' 섹션 렌더 (entry-date 기준) ----------
  function applyProteinOpen() {
    var head = $('protein-head'), body = $('protein-body');
    head.classList.toggle('open', !!data.proteinOpen);
    head.setAttribute('aria-expanded', data.proteinOpen ? 'true' : 'false');
    body.style.display = data.proteinOpen ? '' : 'none';
  }
  $('protein-head').addEventListener('click', function () {
    data.proteinOpen = !data.proteinOpen;
    applyProteinOpen();
    persist();
  });

  function renderProteinToday() {
    var dateStr = $('entry-date').value;
    var logs = proteinLogsFor(dateStr);
    var total = proteinTotalFor(dateStr);
    var target = data.protein.targetG;

    $('protein-count').textContent = target > 0 ? (total + ' / ' + target + 'g') : (total > 0 ? total + 'g' : '');
    $('protein-total-display').textContent = total + 'g';
    $('protein-target-tail').textContent = target > 0 ? (' / ' + target + 'g 목표') : ' (설정에서 목표량을 입력해 보세요)';
    var pct = target > 0 ? Math.round((total / target) * 100) : 0;
    $('protein-pct').textContent = target > 0 ? pct + '%' : '';
    $('protein-bar').style.width = Math.min(100, pct) + '%';
    $('protein-bar').style.background = pct >= 100 ? 'var(--wt-good)' : 'var(--wt-accent)';
    applyProteinOpen();

    var list = $('protein-log-list');
    list.innerHTML = '';
    $('protein-log-empty').style.display = logs.length ? 'none' : '';
    logs.forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'wt-soft-row';
      var label = document.createElement('span');
      label.style.cssText = 'font-size:13px;color:var(--wt-text);';
      label.innerHTML = escapeHtml(it.label) + ' · <b>' + it.grams + 'g</b>';
      var del = document.createElement('button');
      del.className = 'wt-icon-btn-sm';
      del.setAttribute('aria-label', it.label + ' 단백질 기록 삭제');
      del.innerHTML = svg('trash', 13);
      del.addEventListener('click', function () {
        deleteProteinLog(dateStr, it.id);
        renderProteinToday();
        persist();
      });
      row.appendChild(label); row.appendChild(del);
      list.appendChild(row);
    });
  }
  // ---------- [단백질] 빠른 입력 항목(끼니/보충제 등) 관리 — 종목 편집과 같은 방식 ----------
  var PROTEIN_QUICK_BASE = ['아침', '점심', '저녁', '간식'];
  var proteinLabelEditMode = false;
  function proteinQuickLabels() {
    var hidden = data.hiddenProteinLabels || [];
    return PROTEIN_QUICK_BASE.filter(function (l) { return hidden.indexOf(l) === -1; })
      .concat(data.customProteinLabels || []);
  }
  function renderProteinQuickChips() {
    var wrap = $('protein-quick-chips');
    wrap.innerHTML = '';
    proteinQuickLabels().forEach(function (l) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wt-chip' + (proteinLabelEditMode ? ' deletable' : '');
      btn.innerHTML = escapeHtml(l) + (proteinLabelEditMode ? svg('trash', 13) : '');
      btn.addEventListener('click', function () {
        if (proteinLabelEditMode) {
          var custom = data.customProteinLabels || [];
          var ci = custom.indexOf(l);
          if (ci !== -1) {
            custom.splice(ci, 1);
          } else {
            data.hiddenProteinLabels = data.hiddenProteinLabels || [];
            if (data.hiddenProteinLabels.indexOf(l) === -1) data.hiddenProteinLabels.push(l);
          }
          renderProteinQuickChips();
          persist();
          return;
        }
        $('protein-label-input').value = l;
        var lastGrams = data.proteinLabelGrams[l];
        $('protein-grams-input').value = lastGrams ? lastGrams : '';
        $('protein-grams-input').focus();
      });
      wrap.appendChild(btn);
    });
    if (!proteinLabelEditMode) {
      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'wt-chip wt-chip-new';
      addBtn.textContent = '+ 추가';
      addBtn.addEventListener('click', function () {
        $('protein-label-add-form').style.display = 'flex';
        $('protein-label-add-input').value = '';
        $('protein-label-add-input').focus();
      });
      wrap.appendChild(addBtn);
    }
  }
  $('protein-label-edit-btn').addEventListener('click', function () {
    proteinLabelEditMode = !proteinLabelEditMode;
    $('protein-label-edit-btn').classList.toggle('on', proteinLabelEditMode);
    $('protein-label-edit-btn').textContent = proteinLabelEditMode ? '편집 완료' : '편집';
    $('protein-label-edit-hint').style.display = proteinLabelEditMode ? '' : 'none';
    $('protein-label-add-form').style.display = 'none';
    renderProteinQuickChips();
  });
  $('protein-label-add-confirm').addEventListener('click', function () {
    var name = $('protein-label-add-input').value.trim().slice(0, 10);
    if (!name) return;
    if (proteinQuickLabels().indexOf(name) === -1) {
      data.customProteinLabels = data.customProteinLabels || [];
      data.customProteinLabels.push(name);
      persist();
    }
    $('protein-label-add-form').style.display = 'none';
    renderProteinQuickChips();
  });
  $('protein-label-add-cancel').addEventListener('click', function () {
    $('protein-label-add-form').style.display = 'none';
  });
  function submitProteinEntry() {
    var err = $('protein-add-err');
    var grams = parseFloat($('protein-grams-input').value);
    if (!isFinite(grams) || grams <= 0 || grams > LIMITS.proteinMeal) {
      err.textContent = '1~' + LIMITS.proteinMeal + 'g 사이의 값을 입력해 주세요.';
      err.style.display = 'block';
      return;
    }
    err.style.display = 'none';
    addProteinLog($('entry-date').value, $('protein-label-input').value, grams);
    $('protein-label-input').value = '';
    $('protein-grams-input').value = '';
    renderProteinToday();
    persist();
    // 추가 후 매번 손으로 키보드를 내려야 하는 불편을 줄이기 위해 자동으로 포커스를 해제함
    if (window.document.activeElement && typeof window.document.activeElement.blur === 'function') {
      window.document.activeElement.blur();
    }
  }
  $('protein-add-btn').addEventListener('click', submitProteinEntry);
  $('protein-grams-input').addEventListener('input', function () { $('protein-add-err').style.display = 'none'; });
  $('protein-grams-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submitProteinEntry(); }
  });
  $('protein-label-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $('protein-grams-input').focus(); }
  });
  // 입력칸에 포커스가 가면(키보드가 올라오면) 화면 가운데 쪽으로 스크롤해 키보드에 가리지 않게 함.
  // 키보드가 올라오는 애니메이션 시간을 감안해 살짝 지연 후 스크롤함.
  ['protein-label-input', 'protein-grams-input'].forEach(function (id) {
    $(id).addEventListener('focus', function () {
      var el = this;
      setTimeout(function () {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
      }, 250);
    });
  });

