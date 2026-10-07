'use strict';

  // ---------- [루틴] 종목 ↔ 소그룹, A/B/C/D 루틴 분할 ----------
  // 루틴기능(앱 기본 제공)과는 별개로, 사용자가 직접 A/B/C/D 같은 순환 분할을
  // 구성하고 "마지막으로 한 루틴 다음 차례"를 기록 탭에서 바로 확인하기 위한 기능.
  // data.exerciseSubgroups: { "<종목명>": "<소그룹명>" } — 루틴 구성의 재료.
  // data.routines: [{ id, name:"A", label:"가슴·측면어깨·삼두", items:[{subgroup,count}] }]
  // day.routineDay: 그 날 실제로 수행한 것으로 "기록"된 루틴 이름(name). 저장(save-entry-btn)
  // 시점에 그때 화면에 떠 있던 루틴으로 자동 채워진다 — 다음 추천은 이 값만 보고 계산한다.

  function subgroupOf(name) { return (data.exerciseSubgroups || {})[name] || ''; }

  function allKnownExerciseNames() {
    var set = {};
    Object.keys(CATALOG).forEach(function (cat) { (CATALOG[cat] || []).forEach(function (n) { set[n] = true; }); });
    Object.keys(data.customExercises || {}).forEach(function (cat) {
      (data.customExercises[cat] || []).forEach(function (n) { set[n] = true; });
    });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'ko'); });
  }

  function distinctSubgroups() {
    var set = {};
    Object.keys(data.exerciseSubgroups || {}).forEach(function (k) { if (data.exerciseSubgroups[k]) set[data.exerciseSubgroups[k]] = true; });
    (data.routines || []).forEach(function (r) { (r.items || []).forEach(function (it) { if (it.subgroup) set[it.subgroup] = true; }); });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'ko'); });
  }

  function fmtMD(iso) {
    var d = new Date(iso + 'T00:00:00');
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  // ---------- [설정] 종목 소그룹 ----------
  function renderSubgroupDatalist() {
    $('subgroup-datalist').innerHTML = distinctSubgroups().map(function (s) {
      return '<option value="' + escapeHtml(s) + '"></option>';
    }).join('');
  }

  function renderExerciseSubgroups() {
    renderSubgroupDatalist();
    var wrap = $('subgroup-list');
    var names = allKnownExerciseNames();
    wrap.innerHTML = '';
    if (!names.length) {
      wrap.innerHTML = '<p style="font-size:12px;color:var(--wt-text-muted);text-align:center;padding:1rem 0;">아직 등록된 종목이 없습니다.</p>';
      return;
    }
    names.forEach(function (name) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:9px 10px;background:var(--wt-bg);border-radius:10px;';
      var label = document.createElement('span');
      label.className = 'wt-flex1-0';
      label.style.cssText = 'font-size:13px;font-weight:600;color:var(--wt-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      label.textContent = name;
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'wt-input';
      input.setAttribute('list', 'subgroup-datalist');
      input.placeholder = '소그룹 없음';
      input.value = subgroupOf(name);
      input.maxLength = 20;
      input.style.cssText = 'width:128px;flex-shrink:0;font-size:12px;padding:6px 8px;text-align:center;';
      input.addEventListener('change', function () {
        var v = input.value.trim().slice(0, 20);
        data.exerciseSubgroups = data.exerciseSubgroups || {};
        if (v) data.exerciseSubgroups[name] = v; else delete data.exerciseSubgroups[name];
        persist();
        renderSubgroupDatalist();
      });
      row.appendChild(label);
      row.appendChild(input);
      wrap.appendChild(row);
    });
  }

  // ---------- [설정] 루틴 분할 구성 ----------
  var routineEditIndex = 0;
  var routineViewMode = 'list'; // 'list' | 'matrix'

  function nextRoutineLetter() {
    var used = (data.routines || []).map(function (r) { return r.name; });
    var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (var i = 0; i < letters.length; i++) if (used.indexOf(letters[i]) === -1) return letters[i];
    return 'R' + ((data.routines || []).length + 1);
  }

  $('routine-head').addEventListener('click', function () {
    var head = $('routine-head'), body = $('routine-body');
    var open = !head.classList.contains('open');
    head.classList.toggle('open', open);
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    body.style.display = open ? '' : 'none';
  });

  $('routine-add-btn').addEventListener('click', function () {
    data.routines = data.routines || [];
    data.routines.push({ id: uid(), name: nextRoutineLetter(), label: '', items: [] });
    routineEditIndex = data.routines.length - 1;
    routineViewMode = 'list';
    persist();
    renderRoutines();
    renderTodayRoutineCard();
  });

  $('routine-delete-btn').addEventListener('click', function () {
    armDelete($('routine-delete-btn'), '삭제?', function () {
      var r = (data.routines || [])[routineEditIndex];
      if (!r) return;
      data.routines.splice(routineEditIndex, 1);
      routineEditIndex = Math.max(0, routineEditIndex - 1);
      persist();
      renderRoutines();
      renderTodayRoutineCard();
    });
  });

  $('routine-label-input').addEventListener('change', function () {
    var r = (data.routines || [])[routineEditIndex];
    if (!r) return;
    r.label = $('routine-label-input').value.trim().slice(0, 30);
    persist();
    renderRoutineTabs();
    renderTodayRoutineCard();
  });

  $('routine-item-add-btn').addEventListener('click', function () {
    var r = (data.routines || [])[routineEditIndex];
    if (!r) return;
    var v = $('routine-item-subgroup-input').value.trim().slice(0, 20);
    if (!v) return;
    r.items = r.items || [];
    var existing = r.items.find(function (it) { return it.subgroup === v; });
    if (existing) existing.count = Math.min(20, existing.count + 1);
    else r.items.push({ subgroup: v, count: 1 });
    $('routine-item-subgroup-input').value = '';
    persist();
    renderRoutineItemRows();
    renderSubgroupDatalist();
    renderTodayRoutineCard();
  });

  $('routine-view-toggle').addEventListener('click', function () {
    routineViewMode = routineViewMode === 'list' ? 'matrix' : 'list';
    renderRoutines();
  });

  function renderRoutineTabs() {
    var wrap = $('routine-tabs');
    wrap.innerHTML = '';
    (data.routines || []).forEach(function (r, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = r.name;
      btn.style.cssText = 'flex:1;text-align:center;padding:8px 0;border-radius:8px;border:none;font-size:13px;font-weight:800;cursor:pointer;' +
        (i === routineEditIndex ? 'background:var(--wt-accent);color:#fff;' : 'background:transparent;color:var(--wt-text-muted);');
      btn.addEventListener('click', function () { routineEditIndex = i; renderRoutines(); });
      wrap.appendChild(btn);
    });
  }

  function renderRoutineItemRows() {
    var wrap = $('routine-item-rows');
    wrap.innerHTML = '';
    var r = (data.routines || [])[routineEditIndex];
    if (!r) return;
    (r.items || []).forEach(function (it, idx) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;';
      row.innerHTML = '<span class="wt-flex1-0" style="font-size:14px;font-weight:600;color:var(--wt-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(it.subgroup) + '</span>' +
        '<div style="display:flex;align-items:center;gap:8px;background:var(--wt-bg);border-radius:10px;padding:4px 6px;flex-shrink:0;">' +
        '<button class="wt-stepper-btn" data-act="minus" data-idx="' + idx + '" aria-label="개수 감소">−</button>' +
        '<span style="font-size:13px;font-weight:800;color:var(--wt-text);min-width:14px;text-align:center;">' + it.count + '</span>' +
        '<button class="wt-stepper-btn" data-act="plus" data-idx="' + idx + '" aria-label="개수 증가">+</button>' +
        '</div>' +
        '<button class="wt-icon-btn-sm danger" data-act="remove" data-idx="' + idx + '" aria-label="소그룹 제거" style="width:26px;height:26px;flex-shrink:0;">' + svg('x', 13) + '</button>';
      wrap.appendChild(row);
    });
    Array.prototype.forEach.call(wrap.querySelectorAll('button[data-act]'), function (btn) {
      btn.addEventListener('click', function () {
        var idx = Number(btn.getAttribute('data-idx'));
        var act = btn.getAttribute('data-act');
        var it = r.items[idx];
        if (!it) return;
        if (act === 'minus') it.count = Math.max(1, it.count - 1);
        else if (act === 'plus') it.count = Math.min(20, it.count + 1);
        else if (act === 'remove') r.items.splice(idx, 1);
        persist();
        renderRoutineItemRows();
        renderTodayRoutineCard();
      });
    });
  }

  function renderRoutineMatrix() {
    var el = $('routine-matrix');
    var routines = data.routines || [];
    var subgroups = distinctSubgroups();
    if (!subgroups.length) {
      el.innerHTML = '<p style="font-size:12px;color:var(--wt-text-muted);text-align:center;padding:1rem 0;">아직 구성된 소그룹이 없습니다.</p>';
      return;
    }
    var html = '<table style="border-collapse:collapse;width:100%;min-width:' + (110 + routines.length * 46) + 'px;">';
    html += '<thead><tr><th style="text-align:left;padding:6px;font-size:11px;font-weight:700;color:var(--wt-text-muted);">소그룹</th>';
    routines.forEach(function (r) {
      html += '<th style="padding:6px;font-size:12px;font-weight:800;color:var(--wt-accent-dark);width:42px;">' + escapeHtml(r.name) + '</th>';
    });
    html += '</tr></thead><tbody>';
    subgroups.forEach(function (sg) {
      html += '<tr style="border-top:1px solid var(--wt-border);"><td style="padding:6px;font-size:12px;font-weight:600;color:var(--wt-text);text-align:left;">' + escapeHtml(sg) + '</td>';
      routines.forEach(function (r) {
        var it = (r.items || []).find(function (x) { return x.subgroup === sg; });
        html += '<td style="padding:4px;text-align:center;"><div style="width:28px;height:28px;margin:0 auto;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;' +
          (it ? 'background:var(--wt-accent);color:#fff;' : 'background:var(--wt-bg);color:var(--wt-border-strong);') + '">' + (it ? it.count : '·') + '</div></td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  function renderRoutines() {
    var routines = data.routines || [];
    $('routine-head-status').textContent = routines.length ? routines.length + '개' : '사용 안 함';
    if (routineEditIndex >= routines.length) routineEditIndex = Math.max(0, routines.length - 1);
    renderRoutineTabs();
    $('routine-view-toggle').textContent = routineViewMode === 'list' ? '표로 보기' : '목록으로 보기';
    $('routine-editor').style.display = (routineViewMode === 'list' && routines.length) ? '' : 'none';
    $('routine-matrix').style.display = (routineViewMode === 'matrix' && routines.length) ? '' : 'none';
    if (routineViewMode === 'list') {
      var r = routines[routineEditIndex];
      if (r) {
        $('routine-label-input').value = r.label || '';
        renderRoutineItemRows();
      } else {
        $('routine-item-rows').innerHTML = '';
      }
    } else {
      renderRoutineMatrix();
    }
    renderSubgroupDatalist();
  }

  // ---------- [기록] 오늘의 루틴 카드 ----------
  function lastRoutineDayEntry() {
    var days = (data.days || []).filter(function (d) { return d.routineDay; });
    if (!days.length) return null;
    days.sort(function (a, b) { return b.date.localeCompare(a.date); });
    return days[0];
  }

  function routineIndexByName(name) {
    return (data.routines || []).findIndex(function (r) { return r.name === name; });
  }

  function recommendedRoutine() {
    var routines = data.routines || [];
    if (!routines.length) return null;
    var last = lastRoutineDayEntry();
    if (!last) return routines[0];
    var idx = routineIndexByName(last.routineDay);
    if (idx === -1) return routines[0];
    return routines[(idx + 1) % routines.length];
  }

  var routineOverrideId = null; // null = 추천 루틴을 그대로 오늘의 루틴으로 사용

  function selectedRoutine() {
    var routines = data.routines || [];
    if (routineOverrideId) {
      var r = routines.find(function (x) { return x.id === routineOverrideId; });
      if (r) return r;
    }
    return recommendedRoutine();
  }

  // staging(임시 목록)에 저장 전 올려둔 것과, 이미 저장된 그 날 기록을 합쳐서
  // 소그룹별로 "서로 다른 종목을 몇 개 했는지"·"세트 수 합"을 계산한다.
  function todaySubgroupProgress() {
    var dateVal = $('entry-date') ? $('entry-date').value : '';
    var saved = (data.days || []).find(function (d) { return d.date === dateVal; });
    var bySubgroup = {};
    function add(ex) {
      var sg = subgroupOf(ex.name);
      if (!sg) return;
      bySubgroup[sg] = bySubgroup[sg] || { names: {}, sets: 0 };
      bySubgroup[sg].names[ex.name] = true;
      bySubgroup[sg].sets += workSets(ex.sets).length;
    }
    if (saved) saved.exercises.forEach(add);
    staging.forEach(add);
    return bySubgroup;
  }

  function renderRoutineSelect() {
    var sel = $('routine-select');
    var routines = data.routines || [];
    var rec = recommendedRoutine();
    sel.innerHTML = '<option value="">추천 · ' + (rec ? escapeHtml(rec.name) : '-') + '</option>' +
      routines.map(function (r) {
        return '<option value="' + escapeHtml(r.id) + '">' + escapeHtml(r.name) + (r.label ? ' · ' + escapeHtml(r.label) : '') + '</option>';
      }).join('');
    sel.value = routineOverrideId || '';
  }
  $('routine-select').addEventListener('change', function () {
    routineOverrideId = $('routine-select').value || null;
    renderTodayRoutineCard();
  });

  function renderRoutineTimeline() {
    var el = $('routine-timeline');
    var routines = data.routines || [];
    var last = lastRoutineDayEntry();
    var lastIdx = last ? routineIndexByName(last.routineDay) : -1;
    var cur = selectedRoutine();
    var curIdx = cur ? routines.indexOf(cur) : -1;

    var nodesHtml = routines.map(function (r, i) {
      var isCur = i === curIdx, isLast = !isCur && i === lastIdx;
      var circleStyle, numColor, capHtml, labelColor;
      if (isCur) {
        circleStyle = 'background:var(--wt-card);border:2.5px dashed var(--wt-accent);';
        numColor = 'var(--wt-accent)';
        capHtml = '오늘은 여기';
        labelColor = 'var(--wt-accent)';
      } else if (isLast) {
        circleStyle = 'background:var(--wt-text-muted);border:2px solid var(--wt-text-muted);';
        numColor = '#fff';
        capHtml = '마지막 · ' + fmtMD(last.date);
        labelColor = 'var(--wt-text)';
      } else {
        circleStyle = 'background:var(--wt-bg);border:2px solid var(--wt-border-strong);';
        numColor = 'var(--wt-text-muted)';
        capHtml = '';
        labelColor = 'var(--wt-text-muted)';
      }
      return '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:48px;">' +
        '<span style="font-size:9px;font-weight:800;color:' + (isCur ? 'var(--wt-accent)' : 'var(--wt-text-muted)') + ';white-space:nowrap;height:11px;">' + escapeHtml(capHtml) + '</span>' +
        '<div style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;' + circleStyle + '">' +
        '<span style="font-size:14px;font-weight:800;color:' + numColor + ';">' + escapeHtml(r.name) + '</span></div>' +
        '<span style="font-size:10px;font-weight:700;color:' + labelColor + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:48px;">' + escapeHtml(r.label || '') + '</span>' +
        '</div>';
    }).join('');

    el.innerHTML = routines.length > 1
      ? '<div style="position:absolute;left:20px;right:20px;top:29px;height:2px;background:var(--wt-border);"></div>' +
        '<div style="position:relative;display:flex;justify-content:space-between;">' + nodesHtml + '</div>'
      : '<div style="display:flex;">' + nodesHtml + '</div>';
  }

  function renderRoutineItems() {
    var el = $('routine-items');
    var r = selectedRoutine();
    if (!r) { el.innerHTML = ''; return; }
    var progress = todaySubgroupProgress();
    var metCount = 0, totalSets = 0;
    var chips = (r.items || []).map(function (it) {
      var p = progress[it.subgroup];
      var have = p ? Object.keys(p.names).length : 0;
      totalSets += p ? p.sets : 0;
      var met = have >= it.count;
      if (met) metCount++;
      return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;padding:6px 10px;border-radius:999px;' +
        (met ? 'background:var(--wt-accent);color:#fff;' : 'background:var(--wt-bg);color:var(--wt-text-muted);') + '">' +
        (met ? svg('check', 11) : '') + escapeHtml(it.subgroup) + ' ' + have + '/' + it.count + '</span>';
    }).join('');
    var total = (r.items || []).length;
    if (!total) {
      el.innerHTML = '<span style="font-size:12px;color:var(--wt-text-muted);">이 루틴엔 아직 구성 항목이 없어요 — 설정 탭에서 추가해주세요.</span>';
      return;
    }
    el.innerHTML = chips + '<span style="margin-left:auto;font-size:11px;font-weight:800;color:var(--wt-text);white-space:nowrap;">' + metCount + '/' + total + ' · ' + totalSets + '세트</span>';
  }

  function renderTodayRoutineCard() {
    var card = $('routine-card');
    if (!card) return;
    var routines = data.routines || [];
    if (!routines.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    renderRoutineSelect();
    renderRoutineTimeline();
    renderRoutineItems();
  }

  // 저장 시점에 지금 화면에 떠 있던 "오늘의 루틴"을 그 날짜에 기록해둔다 —
  // 다음에 "마지막 루틴 다음 차례"를 계산할 때 이 값만 보면 되게 하기 위함.
  function applyRoutineDayOnSave(day) {
    var r = selectedRoutine();
    day.routineDay = r ? r.name : (day.routineDay || '');
    routineOverrideId = null;
  }
