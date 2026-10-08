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

  // ---------- [설정] 종목 소그룹 (소그룹 카드 안에 종목을 칩으로 넣는 방식) ----------
  function exercisesInSubgroup(sg) {
    return allKnownExerciseNames().filter(function (n) { return subgroupOf(n) === sg; });
  }

  function assignSubgroup(name, sg) {
    data.exerciseSubgroups = data.exerciseSubgroups || {};
    if (sg) data.exerciseSubgroups[name] = sg; else delete data.exerciseSubgroups[name];
    persist();
  }

  // "+ 종목 추가" 피커가 지금 열려 있는 소그룹명(없으면 null) — 한 번에 하나만 열림
  var subgroupAddOpenFor = null;
  var subgroupAddSearch = '';
  // 막 만들었지만 아직 종목을 하나도 안 넣은 소그룹 — distinctSubgroups()는 실제로 쓰인
  // 소그룹만 찾아내므로, 종목을 넣기 전까지는 이 목록에 임시로 담아둬야 카드가 안 사라진다.
  var pendingEmptyGroups = {};

  function allSubgroupCards() {
    var set = {};
    distinctSubgroups().forEach(function (s) { set[s] = true; });
    Object.keys(pendingEmptyGroups).forEach(function (s) { set[s] = true; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'ko'); });
  }

  $('subgroup-head').addEventListener('click', function () {
    var head = $('subgroup-head'), body = $('subgroup-body');
    var open = !head.classList.contains('open');
    head.classList.toggle('open', open);
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    body.style.display = open ? '' : 'none';
  });

  function renderExerciseSubgroups() {
    var groupCount = allSubgroupCards().length;
    $('subgroup-head-status').textContent = groupCount ? groupCount + '개' : '사용 안 함';
    var wrap = $('subgroup-list');
    wrap.innerHTML = '';
    var groups = allSubgroupCards();

    groups.forEach(function (sg) {
      var card = document.createElement('div');
      card.style.cssText = 'border:1.5px solid var(--wt-border);border-radius:12px;padding:12px;margin-bottom:8px;';

      var head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;';
      var title = document.createElement('span');
      title.style.cssText = 'font-size:13px;font-weight:700;color:var(--wt-text);';
      title.textContent = sg;
      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.setAttribute('aria-label', sg + ' 소그룹 삭제');
      delBtn.style.cssText = 'border:none;background:transparent;color:var(--wt-text-muted);cursor:pointer;display:flex;';
      delBtn.innerHTML = svg('trash', 14);
      delBtn.addEventListener('click', function () {
        armDelete(delBtn, '삭제할까요?', function () {
          exercisesInSubgroup(sg).forEach(function (n) { assignSubgroup(n, ''); });
          delete pendingEmptyGroups[sg];
          if (subgroupAddOpenFor === sg) subgroupAddOpenFor = null;
          renderExerciseSubgroups();
        });
      });
      head.appendChild(title);
      head.appendChild(delBtn);
      card.appendChild(head);

      var chipsWrap = document.createElement('div');
      chipsWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
      exercisesInSubgroup(sg).forEach(function (name) {
        var chip = document.createElement('span');
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:var(--wt-accent-soft);color:var(--wt-accent-dark);font-size:12px;font-weight:600;padding:6px 6px 6px 10px;border-radius:999px;';
        chip.textContent = name;
        var x = document.createElement('button');
        x.type = 'button';
        x.setAttribute('aria-label', name + ' 제거');
        x.style.cssText = 'border:none;background:transparent;color:inherit;display:flex;cursor:pointer;padding:2px;';
        x.innerHTML = svg('x', 11);
        x.addEventListener('click', function () { assignSubgroup(name, ''); renderExerciseSubgroups(); });
        chip.appendChild(x);
        chipsWrap.appendChild(chip);
      });

      var addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.textContent = '+ 종목 추가';
      addBtn.style.cssText = 'font-size:12px;font-weight:700;color:var(--wt-accent);background:transparent;border:1.5px dashed var(--wt-border-strong);padding:6px 10px;border-radius:999px;cursor:pointer;';
      addBtn.addEventListener('click', function () {
        subgroupAddOpenFor = subgroupAddOpenFor === sg ? null : sg;
        subgroupAddSearch = '';
        renderExerciseSubgroups();
      });
      chipsWrap.appendChild(addBtn);
      card.appendChild(chipsWrap);

      if (subgroupAddOpenFor === sg) {
        var picker = document.createElement('div');
        picker.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid var(--wt-border);';
        var search = document.createElement('input');
        search.type = 'text';
        search.className = 'wt-input';
        search.placeholder = '종목 검색';
        search.value = subgroupAddSearch;
        search.style.cssText = 'width:100%;font-size:12px;padding:7px 10px;margin-bottom:8px;';
        var listWrap = document.createElement('div');
        listWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;max-height:160px;overflow-y:auto;';

        function renderPickerList() {
          var q = subgroupAddSearch.trim().toLowerCase();
          var candidates = allKnownExerciseNames().filter(function (n) {
            return subgroupOf(n) !== sg && (!q || n.toLowerCase().indexOf(q) !== -1);
          });
          listWrap.innerHTML = '';
          if (!candidates.length) {
            listWrap.innerHTML = '<p style="font-size:12px;color:var(--wt-text-muted);margin:0;">' +
              (q ? '검색 결과가 없습니다.' : '추가할 종목이 없습니다.') + '</p>';
            return;
          }
          candidates.forEach(function (name) {
            var already = subgroupOf(name);
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = name + (already ? ' (' + already + ')' : '');
            if (already) btn.title = '지금 "' + already + '"에 있어요 — 누르면 여기로 옮겨집니다.';
            btn.style.cssText = 'font-size:12px;font-weight:600;padding:6px 10px;border-radius:999px;cursor:pointer;' +
              (already ? 'background:var(--wt-bg);color:var(--wt-text-muted);border:1px solid var(--wt-border);' : 'background:transparent;color:var(--wt-text);border:1.5px solid var(--wt-border-strong);');
            btn.addEventListener('click', function () {
              assignSubgroup(name, sg);
              delete pendingEmptyGroups[sg];
              renderExerciseSubgroups();
            });
            listWrap.appendChild(btn);
          });
        }
        search.addEventListener('input', function () { subgroupAddSearch = search.value; renderPickerList(); });
        picker.appendChild(search);
        picker.appendChild(listWrap);
        card.appendChild(picker);
        renderPickerList();
        setTimeout(function () { search.focus(); }, 0);
      }

      wrap.appendChild(card);
    });

    if (!groups.length) {
      var empty = document.createElement('p');
      empty.style.cssText = 'font-size:12px;color:var(--wt-text-muted);text-align:center;padding:0.5rem 0 1rem;';
      empty.textContent = '아직 소그룹이 없습니다. 아래에서 먼저 만들어보세요.';
      wrap.appendChild(empty);
    }

    var addGroupRow = document.createElement('div');
    addGroupRow.style.cssText = 'display:flex;gap:6px;';
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'wt-input wt-flex1-0';
    nameInput.placeholder = '새 소그룹 이름 (예: 프레스류)';
    nameInput.maxLength = 20;
    var addGroupBtn = document.createElement('button');
    addGroupBtn.type = 'button';
    addGroupBtn.className = 'wt-btn-secondary';
    addGroupBtn.style.padding = '10px 14px';
    addGroupBtn.textContent = '+ 소그룹';
    function submitNewGroup() {
      var v = nameInput.value.trim().slice(0, 20);
      if (!v || allSubgroupCards().indexOf(v) !== -1) return;
      pendingEmptyGroups[v] = true;
      subgroupAddOpenFor = v;
      subgroupAddSearch = '';
      renderExerciseSubgroups();
    }
    addGroupBtn.addEventListener('click', submitNewGroup);
    nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitNewGroup(); } });
    addGroupRow.appendChild(nameInput);
    addGroupRow.appendChild(addGroupBtn);
    wrap.appendChild(addGroupRow);
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
    armDelete($('routine-delete-btn'), '삭제할까요?', function () {
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

  // 모바일 브라우저에서 <input list="..."> 네이티브 자동완성 말풍선이 엉뚱한 위치(좌측 상단
  // 등)에 뜨면서 터치가 안 먹는 문제가 있어(PC에서만 정상 동작), datalist 대신 직접 그리는
  // 칩 목록으로 자동완성을 구현한다.
  function renderRoutineItemSuggestions() {
    var box = $('routine-item-suggestions');
    var q = $('routine-item-subgroup-input').value.trim().toLowerCase();
    var options = distinctSubgroups().filter(function (s) { return !q || s.toLowerCase().indexOf(q) !== -1; });
    box.innerHTML = '';
    if (!options.length) { box.style.display = 'none'; return; }
    box.style.display = 'flex';
    options.forEach(function (s) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = s;
      chip.style.cssText = 'font-size:12px;font-weight:600;padding:6px 10px;border-radius:999px;border:1.5px solid var(--wt-border-strong);background:var(--wt-bg);color:var(--wt-text);cursor:pointer;';
      chip.addEventListener('click', function () {
        $('routine-item-subgroup-input').value = s;
        addRoutineItemFromInput();
      });
      box.appendChild(chip);
    });
  }

  function addRoutineItemFromInput() {
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
    renderRoutineItemSuggestions();
    renderTodayRoutineCard();
  }
  $('routine-item-add-btn').addEventListener('click', addRoutineItemFromInput);
  $('routine-item-subgroup-input').addEventListener('input', renderRoutineItemSuggestions);
  $('routine-item-subgroup-input').addEventListener('focus', renderRoutineItemSuggestions);

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
    renderRoutineItemSuggestions();
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
