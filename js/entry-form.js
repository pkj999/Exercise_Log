'use strict';

  // ---------- [입력] +/- 스테퍼 버튼 공통 처리 ----------
  // decimals가 있으면(무게) 소수 입력으로, 없으면(횟수·분·강도) 정수 입력으로 다룬다.
  function bindStepper(elId, minusId, plusId, step, max, decimals) {
    var mul = decimals ? Math.pow(10, decimals) : 1;
    function clamp(v) { return Math.max(0, Math.min(max, Math.round(v * mul) / mul)); }
    function current() {
      var el = $(elId);
      return decimals ? (parseFloat(el.value) || 0) : (parseInt(el.value, 10) || 0);
    }
    $(minusId).addEventListener('click', function () { $(elId).value = clamp(current() - step); });
    $(plusId).addEventListener('click', function () { $(elId).value = clamp(current() + step); });
  }

  // ---------- [입력] 부위 선택 및 종목 고르기 ----------
  function exercisesFor(cat) {
    var base = CATALOG[cat] || [];
    var custom = data.customExercises[cat] || [];
    var hidden = data.hiddenExercises[cat] || [];
    return base.concat(custom.filter(function (c) { return base.indexOf(c) === -1; }))
      .filter(function (n) { return hidden.indexOf(n) === -1; });
  }

  // variant를 넘기면 그 그립/기구로 한 기록만(없으면 "무변형"만) 찾는다 — 안 넘기면 이름이 같은 걸 전부 봄
  function lastPerformance(name, beforeDate, variant) {
    var days = data.days.filter(function (d) { return !beforeDate || d.date < beforeDate; })
      .slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    for (var i = 0; i < days.length; i++) {
      var matches = days[i].exercises.filter(function (ex) {
        return ex.name === name && (variant === undefined || (ex.variant || '') === variant);
      });
      if (matches.length) {
        var all = [].concat.apply([], matches.map(function (m) { return m.sets; }));
        return { date: days[i].date, sets: all, maxWeight: maxWeight(all) };
      }
    }
    return null;
  }
  // 이 종목을 가장 최근에 기록할 때 썼던 변형(그립/기구) 문구 — 새로 입력 시작할 때 기본값으로 씀
  function lastVariantFor(name) {
    var days = data.days.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    for (var i = 0; i < days.length; i++) {
      var matches = days[i].exercises.filter(function (ex) { return ex.name === name; });
      if (matches.length) return matches[matches.length - 1].variant || '';
    }
    return '';
  }
  // 이 종목에서 예전에 썼던 변형 문구 목록(최근 쓴 순, 중복 제거) — 타이핑 대신 탭으로 골라서
  // "로프"/"로프 "처럼 살짝 다르게 적어 기록이 갈라지는 걸 막기 위한 칩 목록에 씀
  function variantsUsedFor(name) {
    var out = [], seen = {};
    data.days.slice().sort(function (a, b) { return b.date.localeCompare(a.date); })
      .forEach(function (day) {
        day.exercises.forEach(function (ex) {
          if (ex.name !== name || !ex.variant || seen[ex.variant]) return;
          seen[ex.variant] = true;
          out.push(ex.variant);
        });
      });
    return out;
  }
  function renderVariantChips(name, activeVariant) {
    var wrap = $('qe-variant-chips');
    var used = variantsUsedFor(name);
    if (!used.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    wrap.style.display = 'flex';
    wrap.innerHTML = '';
    used.forEach(function (v) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'wt-chip' + (v === activeVariant ? ' active' : '');
      chip.textContent = v;
      chip.addEventListener('click', function () {
        $('qe-variant').value = v;
        $('qe-variant').dispatchEvent(new Event('input'));
      });
      wrap.appendChild(chip);
    });
  }

  function renderCategoryChips() {
    var wrap = $('category-chips');
    wrap.innerHTML = '';
    CATEGORIES.forEach(function (cat) {
      var active = selectedCategory === cat;
      var btn = document.createElement('button');
      btn.className = 'wt-cat-btn' + (active ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', function () {
        selectedCategory = active ? null : cat;
        editMode = false;
        exSearch = '';
        $('ex-search').value = '';
        disarm();
        $('add-exercise-form').style.display = 'none';
        closeQuickEntry();
        renderCategoryChips();
        renderExercisePicker();
      });
      wrap.appendChild(btn);
    });
  }

  var EX_PICKER_LIMIT = 6;
  var exPickerExpanded = false;
  var exPickerLastCat = null;
  function renderExercisePicker() {
    var picker = $('exercise-picker');
    if (!selectedCategory) { picker.style.display = 'none'; return; }
    picker.style.display = '';
    if (selectedCategory !== exPickerLastCat) { exPickerExpanded = false; exPickerLastCat = selectedCategory; }
    $('exercise-picker-label').textContent = selectedCategory + ' 운동';
    $('edit-hint').style.display = editMode ? '' : 'none';
    var editBtn = $('edit-exercises-btn');
    editBtn.classList.toggle('on', editMode);
    editBtn.textContent = editMode ? '편집 완료' : '종목 편집';

    $('ex-search-wrap').style.display = editMode ? 'none' : '';
    var none = $('ex-search-none');
    none.style.display = 'none';
    var q = normName(exSearch);
    $('ex-search-clear').style.display = exSearch ? 'flex' : 'none';

    var wrap = $('exercise-chips');
    wrap.innerHTML = '';
    var listed = exercisesFor(selectedCategory);
    if (!editMode) {
      var used = usageCount(selectedCategory);
      listed = listed.slice().sort(function (a, b) {
        var d = (used[b] || 0) - (used[a] || 0);
        return d !== 0 ? d : 0;
      });
      if (q) listed = listed.filter(function (n) { return normName(n).indexOf(q) !== -1; });
    }
    // 검색 중이 아닐 때만 기본 노출 개수를 제한 — 나머지는 "더보기"로 펼치거나 검색으로 찾음
    var hiddenCount = 0;
    var showCollapse = false;
    if (!editMode && !q && !exPickerExpanded && listed.length > EX_PICKER_LIMIT) {
      hiddenCount = listed.length - EX_PICKER_LIMIT;
      listed = listed.slice(0, EX_PICKER_LIMIT);
    } else if (!editMode && !q && exPickerExpanded && listed.length > EX_PICKER_LIMIT) {
      showCollapse = true;
    }
    listed.forEach(function (name) {
      var btn = document.createElement('button');
      btn.className = 'wt-chip' + (editMode ? ' deletable' : '');
      btn.innerHTML = escapeHtml(name) + (editMode ? svg('trash', 13) : '');
      btn.addEventListener('click', function () {
        if (editMode) {
          var custom = data.customExercises[selectedCategory] || [];
          var ci = custom.indexOf(name);
          if (ci !== -1) custom.splice(ci, 1);
          else {
            data.hiddenExercises[selectedCategory] = data.hiddenExercises[selectedCategory] || [];
            if (data.hiddenExercises[selectedCategory].indexOf(name) === -1) {
              data.hiddenExercises[selectedCategory].push(name);
            }
          }
          persist();
          if (QEState.current && QEState.current.name === name) closeQuickEntry();
          renderExercisePicker();
          return;
        }
        openQuickEntry(selectedCategory, name);
      });
      wrap.appendChild(btn);
    });

    if (hiddenCount > 0) {
      var moreBtn = document.createElement('button');
      moreBtn.className = 'wt-chip wt-chip-new';
      moreBtn.type = 'button';
      moreBtn.textContent = '더보기 (' + hiddenCount + ')';
      moreBtn.addEventListener('click', function () {
        exPickerExpanded = true;
        renderExercisePicker();
      });
      wrap.appendChild(moreBtn);
    } else if (showCollapse) {
      var lessBtn = document.createElement('button');
      lessBtn.className = 'wt-chip wt-chip-new';
      lessBtn.type = 'button';
      lessBtn.textContent = '접기';
      lessBtn.addEventListener('click', function () {
        exPickerExpanded = false;
        renderExercisePicker();
      });
      wrap.appendChild(lessBtn);
    }

    if (!editMode && exSearch.trim()) {
      var typed = exSearch.trim();
      var exists = exercisesFor(selectedCategory).some(function (n) { return normName(n) === normName(typed); });
      if (!exists) {
        var newBtn = document.createElement('button');
        newBtn.className = 'wt-chip wt-chip-new';
        newBtn.innerHTML = svg('plus', 13) + '\'' + escapeHtml(typed) + '\' 새 종목으로 추가';
        newBtn.addEventListener('click', function () {
          commitNewExercise(typed);
        });
        wrap.appendChild(newBtn);
        if (!listed.length) {
          none.style.display = '';
          none.textContent = '일치하는 종목이 없습니다. 오타가 아닌지 확인한 뒤 추가하세요.';
        }
      }
    }
  }

  // 같은 부위에서 종목별 기록 횟수 — 자주 쓰는 종목을 앞에 노출
  function usageCount(cat) {
    var out = {};
    data.days.forEach(function (day) {
      (day.exercises || []).forEach(function (ex) {
        if (ex.category !== cat) return;
        out[ex.name] = (out[ex.name] || 0) + 1;
      });
    });
    return out;
  }

  function commitNewExercise(forced) {
    var input = $('add-exercise-input');
    var name = (forced !== undefined ? String(forced) : (input.value || '')).trim();
    if (!name || !selectedCategory) return;
    var dup = exercisesFor(selectedCategory).find(function (n) { return normName(n) === normName(name); });
    if (dup) {
      exSearch = '';
      $('ex-search').value = '';
      $('add-exercise-form').style.display = 'none';
      input.value = '';
      renderExercisePicker();
      openQuickEntry(selectedCategory, dup);
      return;
    }
    var hidden = data.hiddenExercises[selectedCategory] || [];
    var hi = hidden.indexOf(name);
    if (hi !== -1) hidden.splice(hi, 1);
    data.customExercises[selectedCategory] = data.customExercises[selectedCategory] || [];
    if (data.customExercises[selectedCategory].indexOf(name) === -1 && (CATALOG[selectedCategory] || []).indexOf(name) === -1) {
      data.customExercises[selectedCategory].push(name);
    }
    persist();
    exSearch = '';
    $('ex-search').value = '';
    $('add-exercise-form').style.display = 'none';
    input.value = '';
    renderExercisePicker();
    openQuickEntry(selectedCategory, name);
    toast('\'' + name + '\' 종목을 추가했습니다');
  }

  $('ex-search').addEventListener('input', function () {
    exSearch = this.value || '';
    renderExercisePicker();
  });
  $('ex-search').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var typed = (this.value || '').trim();
    if (!typed || !selectedCategory) return;
    var hit = exercisesFor(selectedCategory).filter(function (n) { return normName(n).indexOf(normName(typed)) !== -1; });
    if (hit.length === 1) {
      exSearch = '';
      this.value = '';
      renderExercisePicker();
      openQuickEntry(selectedCategory, hit[0]);
    }
  });
  $('ex-search-clear').addEventListener('click', function () {
    exSearch = '';
    $('ex-search').value = '';
    renderExercisePicker();
  });
  $('add-exercise-confirm').addEventListener('click', commitNewExercise);
  $('add-exercise-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); commitNewExercise(); }
  });
  $('add-exercise-cancel').addEventListener('click', function () {
    $('add-exercise-form').style.display = 'none';
    $('add-exercise-input').value = '';
  });
  $('edit-exercises-btn').addEventListener('click', function () {
    editMode = !editMode;
    $('add-exercise-form').style.display = 'none';
    if (editMode) closeQuickEntry();
    renderExercisePicker();
  });

  // ---------- [입력] 빠른 입력 패널 (세트 추가/수정) ----------
  function setWarmup(on) {
    QEState.warmupOn = !!on;
    $('qe-warmup').classList.toggle('active', QEState.warmupOn);
  }

  function tagMini(s) {
    if (!s.tags || !s.tags.length) return '';
    return s.tags.map(function (t) { return '<span class="wt-tag-mini">' + escapeHtml(t) + '</span>'; }).join('');
  }

  function setRpe(key) {
    QEState.rpeSelected = key || null;
    renderRpeChips();
  }
  function renderRpeChips() {
    var wrap = $('qe-rpe-chips');
    wrap.innerHTML = '';
    RPE.forEach(function (r) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wt-rpe-chip';
      btn.innerHTML = r.label + '<span style="display:block;font-size:10px;font-weight:400;opacity:0.85;">' + r.desc + '</span>';
      if (QEState.rpeSelected === r.key) {
        // 앱 전체의 "선택 상태 = 테두리+옅은 배경" 규칙을 따르되, 여유/적정/한계를 색으로
        // 구분하는 기능적 목적은 유지 — 꽉 찬 원색 배경 대신 그 색을 옅게 깔아준다.
        btn.style.borderColor = r.color;
        btn.style.background = r.color + '20';
        btn.style.color = r.color;
      }
      btn.addEventListener('click', function () {
        setRpe(QEState.rpeSelected === r.key ? null : r.key);
      });
      wrap.appendChild(btn);
    });
  }

  function applyModeFields(category, name) {
    var cardio = isCardio(category);
    $('qe-strength-fields').style.display = cardio ? 'none' : 'flex';
    $('qe-cardio-fields').style.display = cardio ? 'block' : 'none';
    $('qe-warmup').style.display = cardio ? 'none' : '';
    applyBodyweightMode(cardio ? null : name);
  }
  function applyBodyweightMode(name) {
    var note = $('qe-bw-note');
    var label = $('qe-weight-label');
    var row = $('qe-bw-row');
    var toggle = $('qe-bw-toggle');
    var ratioBox = $('qe-bw-ratio');

    if (!name) { row.style.display = 'none'; note.style.display = 'none'; label.textContent = '무게(kg)'; return; }
    row.style.display = 'flex';

    var pct = bwPercent(name);
    var on = pct > 0;
    toggle.classList.toggle('on', on);
    ratioBox.style.display = on ? 'flex' : 'none';
    $('qe-bw-pct').textContent = (on ? pct : 100) + '%';
    label.textContent = on ? '추가 중량(kg)' : '무게(kg)';

    if (!on) { note.style.display = 'none'; return; }
    note.style.display = '';
    if (data.weightKg > 0) {
      note.className = 'wt-bw-note';
      note.textContent = '체중 ' + data.weightKg + 'kg의 ' + pct + '%인 ' + bwLoadFor(name) +
        'kg이 볼륨에 반영됩니다. 무게추를 달았다면 추가분만 입력하세요.';
    } else {
      note.className = 'wt-bw-note warn';
      note.textContent = '설정 > 신체 정보에 몸무게를 입력하면 체중이 볼륨에 반영됩니다.';
    }
  }

  $('qe-bw-toggle').addEventListener('click', function () {
    if (!QEState.current || isCardio(QEState.current.category)) return;
    var name = QEState.current.name;
    var on = bwPercent(name) > 0;
    setBwPercent(name, on ? 0 : 100);
    if (!on) $('qe-weight').value = 0;
    applyBodyweightMode(name);
    toast(on ? '맨몸운동 해제' : '맨몸운동으로 지정');
  });
  function nudgeBw(delta) {
    if (!QEState.current) return;
    var name = QEState.current.name;
    var cur = bwPercent(name);
    if (!cur) return;
    setBwPercent(name, cur + delta);
    applyBodyweightMode(name);
  }
  $('qe-bw-minus').addEventListener('click', function () { nudgeBw(-5); });
  $('qe-bw-plus').addEventListener('click', function () { nudgeBw(5); });
  function exitEditMode() {
    QEState.editingSetIndex = -1;
    $('qe-add-label').textContent = (QEState.current && isCardio(QEState.current.category)) ? '기록 추가' : '세트 추가';
    $('qe-cancel-edit').style.display = 'none';
    renderQESetList();
  }

  function openQuickEntry(category, name) {
    var dateVal = $('entry-date').value;
    var existing = staging.find(function (s) { return s.name === name && s.category === category; });
    QEState.current = existing || { category: category, name: name, variant: lastVariantFor(name), sets: [] };
    if (QEState.current.variant === undefined) QEState.current.variant = '';

    QEState.editingSetIndex = -1;
    setWarmup(false);
    setRpe(null);
    applyModeFields(category, name);
    $('quick-entry').style.display = '';
    $('qe-name').textContent = name;
    $('qe-variant').value = QEState.current.variant || '';
    renderVariantChips(name, QEState.current.variant || '');
    $('qe-note').value = '';
    $('qe-add-label').textContent = isCardio(category) ? '기록 추가' : '세트 추가';
    $('qe-cancel-edit').style.display = 'none';

    var cardio = isCardio(category);
    var last = lastPerformance(name, dateVal, QEState.current.variant);

    if (last) {
      renderLastRecord(last);
      var pool = workSets(last.sets);
      var ref = pool.length ? pool[pool.length - 1] : last.sets[last.sets.length - 1];
      if (cardio) {
        $('qe-minutes').value = ref.cardio ? (ref.minutes || 20) : 20;
        $('qe-intensity').value = ref.cardio ? (ref.intensity || 5) : 5;
        $('qe-distance').value = ref.cardio && ref.distance ? ref.distance : '';
      } else {
        $('qe-weight').value = ref.cardio ? 20 : ref.weight;
        $('qe-reps').value = ref.cardio ? 10 : ref.reps;
      }
    } else {
      renderLastRecord(null);
      if (cardio) { $('qe-minutes').value = 20; $('qe-intensity').value = 5; $('qe-distance').value = ''; }
      else { $('qe-weight').value = bwRatio(name) ? 0 : 20; $('qe-reps').value = 10; }
    }
    renderQESetList();
    safeScrollIntoView($('quick-entry'));
  }

  // 저장된 기록(기록 목록/캘린더 상세)의 종목 하나를 QE 패널로 불러와 직접 수정
  function openQuickEntryForRecord(day, exIdx) {
    var ex = day.exercises[exIdx];
    if (!ex) return;
    if (currentTab !== 'log') switchTab('log');
    QEState.editingRecordCtx = { day: day, exIdx: exIdx };
    selectedCategory = ex.category;
    editMode = false;
    renderCategoryChips();
    renderExercisePicker();

    QEState.current = {
      category: ex.category,
      name: ex.name,
      variant: ex.variant || '',
      sets: ex.sets.map(function (s) {
        var copy = {};
        Object.keys(s).forEach(function (k) { copy[k] = s[k]; });
        if (Array.isArray(s.tags)) copy.tags = s.tags.slice();
        return copy;
      })
    };
    QEState.editingSetIndex = -1;
    setWarmup(false);
    setRpe(null);
    applyModeFields(ex.category, ex.name);
    $('quick-entry').style.display = '';
    $('qe-name').textContent = ex.name + ' — 기록 수정';
    $('qe-variant').value = QEState.current.variant || '';
    renderVariantChips(ex.name, QEState.current.variant || '');
    $('qe-note').value = '';
    $('qe-add-label').textContent = isCardio(ex.category) ? '기록 추가' : '세트 추가';
    $('qe-cancel-edit').style.display = 'none';
    renderLastRecord(null);
    $('qe-finish-edit').style.display = '';
    renderQESetList();
    safeScrollIntoView($('quick-entry'));
  }

  function closeQuickEntry() {
    QEState.current = null;
    QEState.editingSetIndex = -1;
    QEState.editingRecordCtx = null;
    $('qe-finish-edit').style.display = 'none';
    $('quick-entry').style.display = 'none';
  }

  function renderQESetList() {
    var wrap = $('qe-set-list');
    wrap.innerHTML = '';
    if (!QEState.current) { $('qe-hint').style.display = 'none'; return; }
    $('qe-hint').style.display = QEState.current.sets.length ? '' : 'none';

    QEState.current.sets.forEach(function (s, i) {
      var row = document.createElement('div');
      row.className = 'wt-set-row' + (QEState.editingSetIndex === i ? ' editing' : '');

      var tailInfo = '';
      if (s.warmup) tailInfo = '<span class="wt-warm-badge">W</span>';

      var label = document.createElement('div');
      label.className = 'wt-flex1-0';
      label.style.cursor = 'pointer';
      label.innerHTML = '<span>' + (i + 1) + '. ' + setLabel(s) + tailInfo +
        prBadgeHtml(s.pr) +
        rpeBadge(s) + tagMini(s) + '</span>' +
        (s.note ? '<span style="display:block;font-size:11px;font-weight:400;color:var(--wt-text-muted);margin-top:2px;">' + escapeHtml(s.note) + '</span>' : '');
      label.addEventListener('click', function () { beginEditSet(i); });

      var del = document.createElement('button');
      del.className = 'wt-icon-btn-sm danger';
      del.style.width = '26px'; del.style.height = '26px';
      del.setAttribute('aria-label', (i + 1) + '번 세트 삭제');
      del.innerHTML = svg('trash', 13);
      del.addEventListener('click', function () {
        armDelete(del, '삭제할까요?', function () {
          QEState.current.sets.splice(i, 1);
          if (QEState.editingSetIndex === i) exitEditMode();
          else if (QEState.editingSetIndex > i) QEState.editingSetIndex -= 1;
          if (QEState.current.sets.length === 0) removeStaging(QEState.current);
          renderQESetList();
          renderStaging();
          saveDraft();
        });
      });

      row.appendChild(label);
      row.appendChild(del);
      wrap.appendChild(row);
    });
  }

  function beginEditSet(i) {
    if (!QEState.current || !QEState.current.sets[i]) return;
    var s = QEState.current.sets[i];
    QEState.editingSetIndex = i;
    if (s.cardio) {
      $('qe-minutes').value = s.minutes || 0;
      $('qe-intensity').value = s.intensity || 0;
      $('qe-distance').value = s.distance || '';
    } else {
      $('qe-weight').value = s.weight;
      $('qe-reps').value = s.reps;
    }
    $('qe-note').value = s.note || '';
    setWarmup(!!s.warmup);
    setRpe(s.rpe || null);
    $('qe-add-label').textContent = (i + 1) + '번 ' + (isCardio(QEState.current.category) ? '기록' : '세트') + ' 수정';
    $('qe-cancel-edit').style.display = '';
    renderQESetList();
  }

  function commitStaging() { if (QEState.current && !QEState.editingRecordCtx && staging.indexOf(QEState.current) === -1) staging.push(QEState.current); }
  function removeStaging(item) { staging = staging.filter(function (s) { return s !== item; }); }

  $('qe-close').addEventListener('click', closeQuickEntry);
  $('qe-finish-edit').addEventListener('click', async function () {
    if (!QEState.editingRecordCtx || !QEState.current) return;
    var day = QEState.editingRecordCtx.day, exIdx = QEState.editingRecordCtx.exIdx;
    if (!QEState.current.sets.length) {
      day.exercises.splice(exIdx, 1);
      if (!day.exercises.length) data.days = data.days.filter(function (d) { return d !== day; });
    } else {
      day.exercises[exIdx].sets = QEState.current.sets;
      day.exercises[exIdx].variant = QEState.current.variant || '';
    }
    closeQuickEntry();
    selectedCategory = null;
    renderAll();
    try {
      await persist();
      toast('수정을 저장했습니다');
    } catch (e) {
      showError('이 기기에는 저장했지만 GitHub 저장에는 실패했습니다 (' + (e.message || '알 수 없는 오류') + '). 네트워크 확인 후 설정 탭에서 새로고침해주세요.');
    }
  });
  $('qe-cancel-edit').addEventListener('click', exitEditMode);
  $('qe-warmup').addEventListener('click', function () { setWarmup(!QEState.warmupOn); });

  bindStepper('qe-weight', 'qe-weight-minus', 'qe-weight-plus', STEPS.weight, LIMITS.weight, 2);
  bindStepper('qe-reps', 'qe-reps-minus', 'qe-reps-plus', STEPS.reps, LIMITS.reps);
  // 변형(그립·기구)을 바꿔 입력하면, "지난 기록" 카드를 그 변형 기준으로 다시 찾아 보여줌
  // (무게/횟수 입력칸은 그대로 둠 — 이미 타이핑 중인 값을 지우지 않기 위해)
  $('qe-variant').addEventListener('input', function () {
    if (!QEState.current) return;
    QEState.current.variant = this.value.trim().slice(0, 16);
    document.querySelectorAll('#qe-variant-chips .wt-chip').forEach(function (chip) {
      chip.classList.toggle('active', chip.textContent === QEState.current.variant);
    });
    var last = lastPerformance(QEState.current.name, $('entry-date').value, QEState.current.variant);
    renderLastRecord(last);
  });
  bindStepper('qe-minutes', 'qe-min-minus', 'qe-min-plus', STEPS.minutes, LIMITS.minutes);
  bindStepper('qe-intensity', 'qe-int-minus', 'qe-int-plus', STEPS.intensity, LIMITS.intensity);

  $('qe-add-set').addEventListener('click', function () {
    unlockAudio();
    if (!QEState.current) return;
    var note = ($('qe-note').value || '').trim();
    var entry;

    if (isCardio(QEState.current.category)) {
      var mins = parseInt($('qe-minutes').value, 10);
      var inten = parseInt($('qe-intensity').value, 10);
      var distRaw = ($('qe-distance').value || '').trim();
      var dist = distRaw === '' ? null : parseFloat(distRaw);
      if (isNaN(mins) || mins <= 0) { showError('시간을 입력해 주세요.'); return; }
      if (mins > LIMITS.minutes) { showError('시간은 ' + LIMITS.minutes + '분까지 입력할 수 있습니다.'); return; }
      if (isNaN(inten) || inten < 0) { showError('강도를 입력해 주세요.'); return; }
      if (inten > LIMITS.intensity) { showError('강도는 ' + LIMITS.intensity + '까지 입력할 수 있습니다.'); return; }
      if (dist !== null && (isNaN(dist) || dist < 0)) { showError('거리를 올바르게 입력해 주세요.'); return; }
      if (dist !== null && dist > LIMITS.distance) { showError('거리는 ' + LIMITS.distance + 'km까지 입력할 수 있습니다.'); return; }
      entry = { cardio: true, minutes: mins, intensity: inten, weight: 0, reps: 0, warmup: false };
      if (dist !== null && dist > 0) entry.distance = Math.round(dist * 100) / 100;
    } else {
      var w = parseFloat($('qe-weight').value);
      var r = parseInt($('qe-reps').value, 10);
      if (isNaN(w) || w < 0) { showError('무게를 입력해 주세요.'); return; }
      if (w > LIMITS.weight) { showError('무게는 ' + LIMITS.weight + 'kg까지 입력할 수 있습니다. 숫자를 확인해 주세요.'); return; }
      if (isNaN(r) || r <= 0) { showError('횟수를 입력해 주세요.'); return; }
      if (r > LIMITS.reps) { showError('횟수는 ' + LIMITS.reps + '회까지 입력할 수 있습니다. 숫자를 확인해 주세요.'); return; }
      entry = { weight: w, reps: r, warmup: QEState.warmupOn };
      var bwl = bwLoadFor(QEState.current.name);
      if (bwl > 0) { entry.bw = true; entry.bwLoad = bwl; }
    }

    if (note) entry.note = note;
    if (QEState.rpeSelected) entry.rpe = QEState.rpeSelected;
    clearError();

    // 개인 최고기록(PR) 판정: 판정 기준은 [계산] judgeAndMarkPR()에 모아둠
    var baselineSets = QEState.editingSetIndex >= 0
      ? QEState.current.sets.filter(function (_, idx) { return idx !== QEState.editingSetIndex; })
      : QEState.current.sets;
    var prResult = judgeAndMarkPR(QEState.current.name, entry, baselineSets, QEState.current.variant);
    var isPR = prResult.isPR, newOneRM = prResult.oneRM;

    if (QEState.editingSetIndex >= 0) {
      QEState.current.sets[QEState.editingSetIndex] = entry;
      exitEditMode();
      $('qe-note').value = '';
      setWarmup(false);
      setRpe(null);
      renderStaging();
      saveDraft();
      if (isPR) toast(prToastMessage(QEState.current.name, newOneRM), 2600);
      return;
    }

    QEState.current.sets.push(entry);
    $('qe-note').value = '';
    setWarmup(false);
    setRpe(null);
    commitStaging();
    if (!QEState.editingRecordCtx) recordSetActivity();
    renderQESetList();
    renderStaging();
    saveDraft();
    startRestTimer();
    if (isPR) toast(prToastMessage(QEState.current.name, newOneRM), 2600);
  });

  // ---------- [입력] 저장 전 기록 알림줄 ----------
  function stagingCounts() {
    var ex = 0, sets = 0;
    staging.forEach(function (item) {
      if (!item.sets.length) return;
      ex += 1;
      sets += item.sets.length;
    });
    return { ex: ex, sets: sets };
  }
  function updateUnsavedBar() {
    var bar = $('unsaved-bar');
    var c = stagingCounts();
    if (!c.sets || currentTab !== 'log') {
      bar.style.display = 'none'; bar.classList.remove('show');
      $('view-log').style.marginTop = '';
      return;
    }
    // 저장 영역이 화면에 보이면 알림 줄은 숨김
    var visible = false;
    try {
      var r = $('staging-area').getBoundingClientRect();
      var h = window.innerHeight || 800;
      visible = r.top < h - 60 && r.bottom > 0;
    } catch (e) {}
    if (visible) {
      bar.style.display = 'none'; bar.classList.remove('show');
      $('view-log').style.marginTop = '';
      return;
    }
    $('unsaved-bar-text').textContent = '저장 전 기록 ' + c.ex + '종목 · ' + c.sets + '세트';
    bar.style.display = 'flex';
    // 헤더(휴식 타이머 포함)와 겹치지 않도록, 헤더가 화면에 보이는 동안은 그 아래에 위치시키고,
    // 그만큼 아래 내용(날짜 입력 등)도 밀어내려서 알림 줄이 그 위를 가리지 않게 함.
    // 스크롤을 내려 헤더가 화면 밖으로 나가면, 알림 줄은 화면 맨 위에 떠 있는 리마인더로만 동작하고
    // (이미 지나간 내용을 덮어도 무방) 아래 내용을 밀어내지 않는다.
    try {
      var hRect = $('top-header').getBoundingClientRect();
      if (hRect.bottom > 0) {
        bar.style.top = (Math.round(hRect.bottom) + 10) + 'px';
        $('view-log').style.marginTop = (bar.offsetHeight + 10) + 'px';
      } else {
        bar.style.top = '8px';
        $('view-log').style.marginTop = '';
      }
    } catch (e) { bar.style.top = ''; $('view-log').style.marginTop = ''; }
    requestAnimationFrame(function () { bar.classList.add('show'); });
  }
  $('unsaved-bar').addEventListener('click', function () {
    safeScrollIntoView($('staging-area'));
    setTimeout(updateUnsavedBar, 400);
  });
  // 스크롤 이벤트는 한 프레임에도 여러 번 발생할 수 있는데, updateUnsavedBar()는 매번
  // getBoundingClientRect()로 레이아웃을 읽는다 — 이벤트가 올 때마다 바로 실행하면 저사양
  // 기기에서 스크롤 중 버벅일 수 있어, requestAnimationFrame으로 프레임당 최대 1번만 돌린다.
  var unsavedBarTicking = false;
  window.addEventListener('scroll', function () {
    if (unsavedBarTicking) return;
    unsavedBarTicking = true;
    requestAnimationFrame(function () { unsavedBarTicking = false; updateUnsavedBar(); });
  }, { passive: true });

