'use strict';

  // ---------- [저장] 오늘 기록 확정 저장 ----------
  $('save-entry-btn').addEventListener('click', async function () {
    var dateVal = $('entry-date').value;
    if (!dateVal) { showError('날짜를 선택해 주세요.'); return; }
    var valid = staging.filter(function (s) { return s.sets.length > 0; });
    if (!valid.length) { showError('세트를 1개 이상 추가해 주세요.'); return; }
    clearError();

    var day = data.days.find(function (d) { return d.date === dateVal; });
    if (!day) { day = { date: dateVal, exercises: [] }; data.days.push(day); }
    valid.forEach(function (item) {
      var cleaned = item.sets.map(function (st) {
        var c = {};
        Object.keys(st).forEach(function (k) { c[k] = st[k]; });
        return c;
      });
      day.exercises.push({ name: item.name, category: item.category, variant: item.variant || '', sets: cleaned });
    });
    day.exercises = mergeDupExercises(day.exercises);
    commitSessionDuration(day);
    applyRoutineDayOnSave(day);

    // 이 시점부터는 이미 data.days에 실제로 반영된 상태다 — GitHub 저장이 뒤에서
    // 실패하더라도 되돌리지 않는다. 되돌리지 않고 staging도 여기서 바로 비워야,
    // 실패 후 사용자가 저장 버튼을 다시 눌렀을 때 같은 세트가 또 한 번 합쳐져
    // 중복으로 쌓이는 걸 막을 수 있다(예전엔 여기서 persist() 실패 시 아래 정리
    // 코드가 전혀 실행되지 않아서, 다시 누를 때마다 같은 내용이 계속 겹쳐 쌓였음).
    clearDraft();
    staging = [];
    closeQuickEntry();
    selectedCategory = null;
    editMode = false;
    disarm();
    $('add-exercise-form').style.display = 'none';
    renderAll();
    safeScrollTop();
    try {
      await persist();
      toast('오늘 기록을 저장했습니다');
    } catch (e) {
      showError('이 기기에는 저장했지만 GitHub 저장에는 실패했습니다 (' + (e.message || '알 수 없는 오류') + '). 네트워크 확인 후 설정 탭에서 새로고침해주세요.');
    }
  });

  // ---------- [조회] 저장된 기록 목록 및 날짜 카드 ----------
  function applyHistoryOpen() {
    var head = $('history-head'), list = $('history-list');
    head.classList.toggle('open', !!data.historyOpen);
    head.setAttribute('aria-expanded', data.historyOpen ? 'true' : 'false');
    list.style.display = data.historyOpen ? '' : 'none';
  }
  $('history-head').addEventListener('click', function () {
    data.historyOpen = !data.historyOpen;
    applyHistoryOpen();
    persist();
  });

  function renderHistory() {
    var c = $('history-list');
    c.innerHTML = '';
    var days = data.days.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 10);
    if (!days.length) {
      $('history-head').style.display = 'none';
      c.style.display = '';
      c.innerHTML = '<p style="font-size:13px;color:var(--wt-text-muted);text-align:center;padding:2rem 0;">아직 기록이 없습니다. 위에서 부위를 선택해 첫 운동을 기록해 보세요.</p>';
      return;
    }
    $('history-head').style.display = 'flex';
    $('history-count').textContent = days.length + '일';
    days.forEach(function (d) { c.appendChild(buildDayCard(d)); });
    applyHistoryOpen();
  }

  function buildDayCard(day, opts) {
    var showDuration = !!(opts && opts.showDuration);
    var card = document.createElement('div');
    card.className = 'wt-card';
    card.style.marginBottom = '10px';

    var daySets = day.exercises.reduce(function (sum, ex) { return sum + workSets(ex.sets).length; }, 0);
    var dayMin = day.exercises.reduce(function (sum, ex) { return sum + totalMinutes(ex.sets); }, 0);
    var headBits = [];
    if (daySets > 0) headBits.push(daySets + '세트');
    if (dayMin > 0) headBits.push(dayMin + '분');
    var header = document.createElement('div');
    header.className = 'wt-row-sb wt-gap-8';
    header.style.marginBottom = '10px';
    var isToday = day.date === $('entry-date').value;
    var dateP = document.createElement('p');
    dateP.style.cssText = 'font-size:12px;color:var(--wt-text-muted);margin:0;font-weight:700;';
    dateP.innerHTML = fmtDisplayDate(day.date) + (isToday ? '<span class="wt-saved-tag">저장됨</span>' : '');

    var rightWrap = document.createElement('div');
    rightWrap.className = 'wt-row wt-gap-6 wt-shrink0';
    var volP = document.createElement('p');
    volP.style.cssText = 'font-size:12px;margin:0;font-weight:700;color:var(--wt-accent);white-space:nowrap;';
    volP.textContent = headBits.join(' · ') || '-';
    rightWrap.appendChild(volP);

    header.appendChild(dateP); header.appendChild(rightWrap);
    card.appendChild(header);

    if (showDuration && day.startedAt > 0) {
      var durP = document.createElement('p');
      durP.style.cssText = 'font-size:12px;color:var(--wt-text-muted);margin:-4px 0 10px;';
      durP.textContent = '⏱ 총 소요시간 ' + (fmtDuration(day.durationMin) || '1분 미만');
      card.appendChild(durP);
    }

    var list = document.createElement('div');
    list.className = 'wt-col wt-gap-10';

    day.exercises.forEach(function (ex, exIdx) {
      var m = meta(ex.category);
      var exRow = document.createElement('div');
      exRow.className = 'wt-row-start wt-gap-12';

      var icon = document.createElement('div');
      icon.className = 'wt-row-icon';
      icon.innerHTML = svg(m.icon, 21);

      var setLines = [];
      var i = 0;
      while (i < ex.sets.length) {
        var s0 = ex.sets[i];
        var label0 = setLabel(s0) + rpeBadge(s0);
        var warm0 = !!s0.warmup;
        var count = 1;
        var anyPR = !!s0.pr;
        var j = i + 1;
        while (j < ex.sets.length) {
          var sj = ex.sets[j];
          if ((setLabel(sj) + rpeBadge(sj)) === label0 && !!sj.warmup === warm0) { count++; if (sj.pr) anyPR = true; j++; }
          else break;
        }
        var line = warm0
          ? '<span style="color:var(--wt-text-muted);">' + label0 + '<span class="wt-warm-badge">W</span></span>'
          : label0;
        if (count > 1) line += ' <span style="color:var(--wt-text-muted);font-weight:700;">(' + count + ')</span>';
        if (anyPR) line += prBadgeHtml(true);
        setLines.push(line);
        i = j;
      }
      var setsHtml = setLines.map(function (l) { return '<div style="margin-top:2px;">' + l + '</div>'; }).join('');
      var exTail = hasCardio(ex.sets) ? '<div style="margin-top:2px;">총 ' + totalMinutes(ex.sets) + '분</div>' : '';

      var notes = ex.sets.filter(function (s) { return s.note; })
        .map(function (s) { return '<span style="display:block;font-size:11px;color:var(--wt-text-muted);margin-top:2px;">· ' + escapeHtml(s.note) + '</span>'; }).join('');

      var exVariantBadge = ex.variant ? '<span class="wt-plan-badge">' + escapeHtml(ex.variant) + '</span>' : '';
      var mid = document.createElement('div');
      mid.className = 'wt-flex1-0';
      mid.innerHTML = '<p style="font-size:14px;font-weight:700;margin:0 0 2px;color:var(--wt-text);">' + escapeHtml(ex.name) + exVariantBadge + '</p>' +
        '<div style="font-size:13px;color:var(--wt-text-muted);">' + setsHtml + exTail + '</div>' + notes;

      var btnGroup = document.createElement('div');
      btnGroup.className = 'wt-row wt-gap-4 wt-shrink0';

      var editBtn = document.createElement('button');
      editBtn.className = 'wt-icon-btn-sm';
      editBtn.setAttribute('aria-label', ex.name + ' 기록 수정');
      editBtn.innerHTML = svg('pencil', 14);
      editBtn.addEventListener('click', function () { openQuickEntryForRecord(day, exIdx); });

      var delBtn = document.createElement('button');
      delBtn.className = 'wt-icon-btn-sm danger';
      delBtn.setAttribute('aria-label', ex.name + ' 기록 삭제');
      delBtn.innerHTML = svg('trash', 14);
      delBtn.addEventListener('click', function () {
        armDelete(delBtn, '삭제할까요?', async function () {
          day.exercises.splice(exIdx, 1);
          if (!day.exercises.length) data.days = data.days.filter(function (d) { return d !== day; });
          renderAll();
          try { await persist(); }
          catch (e) { showError('이 기기에서는 삭제했지만 GitHub 저장에는 실패했습니다 (' + (e.message || '알 수 없는 오류') + ').'); }
        });
      });

      btnGroup.appendChild(editBtn); btnGroup.appendChild(delBtn);
      exRow.appendChild(icon); exRow.appendChild(mid); exRow.appendChild(btnGroup);
      list.appendChild(exRow);
    });

    card.appendChild(list);
    return card;
  }

  // ---------- [조회] 캘린더 ----------
  // 캘린더 셀 하단에 그날 한 부위를 알약 모양 점으로 표시(부위별 색) — 최대 3개까지만, 나머지는 생략
  function dayCategoryDots(day) {
    if (!day) return '';
    var seen = {}, cats = [];
    day.exercises.forEach(function (ex) {
      var c = ex.category || '기타';
      if (!seen[c]) { seen[c] = true; cats.push(c); }
    });
    return cats.slice(0, 3).map(function (c) {
      return '<span class="wt-cal-dot" style="background:' + meta(c).color + ';"></span>';
    }).join('');
  }
  function renderCalendar() {
    var y = calCursor.getFullYear(), mo = calCursor.getMonth();
    $('cal-title').textContent = y + '년 ' + (mo + 1) + '월';
    var grid = $('cal-grid');
    grid.innerHTML = '';

    ['월', '화', '수', '목', '금', '토', '일'].forEach(function (d) {
      var el = document.createElement('div');
      el.style.cssText = 'text-align:center;font-size:11px;font-weight:700;color:var(--wt-text-muted);padding-bottom:4px;';
      el.textContent = d;
      grid.appendChild(el);
    });
    var headTail = document.createElement('div');
    headTail.style.cssText = 'text-align:center;font-size:10px;font-weight:700;color:var(--wt-text-muted);padding-bottom:4px;';
    headTail.textContent = data.weeklyGoal > 0 ? '주' : '';
    grid.appendChild(headTail);

    var first = (new Date(y, mo, 1).getDay() + 6) % 7;
    var total = new Date(y, mo + 1, 0).getDate();
    var todayIso = fmtDate(new Date());

    // 맨 앞/뒤 빈 칸도 그냥 비워두지 않고, 흔한 달력들처럼 전/다음 달 날짜를 옅게 채워 보여준다 —
    // 안 그러면 "이번 달 1일이 속한 주"의 나머지 요일(지난달 말)이 통째로 안 보여서, 주 목표
    // 달성 배지는 그 요일들까지 계산에 넣는데(workoutDaysIn은 월 구분 없이 날짜로만 계산) 정작
    // 화면에는 그 근거가 안 보이는 모순이 생긴다.
    function outsideCell(dateObj) {
      var iso = fmtDate(dateObj);
      var day = data.days.find(function (d) { return d.date === iso; });
      var cell = document.createElement('button');
      cell.className = 'wt-cal-cell outside' + (iso === calSelected ? ' selected' : '');
      cell.innerHTML = '<span>' + dateObj.getDate() + '</span>' + (day ? '<span class="wt-cal-dots">' + dayCategoryDots(day) + '</span>' : '');
      cell.addEventListener('click', function () {
        calSelected = (calSelected === iso) ? null : iso;
        renderCalendar();
        renderCalDetail();
      });
      return cell;
    }
    for (var i = 0; i < first; i++) {
      grid.appendChild(outsideCell(new Date(y, mo, i - first + 1)));
    }
    for (var n = 1; n <= total; n++) {
      (function (n) {
        var iso = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(n).padStart(2, '0');
        var day = data.days.find(function (d) { return d.date === iso; });
        var cell = document.createElement('button');
        cell.className = 'wt-cal-cell' + (iso === todayIso ? ' today' : '') + (iso === calSelected ? ' selected' : '');
        cell.innerHTML = '<span>' + n + '</span>' + (day ? '<span class="wt-cal-dots">' + dayCategoryDots(day) + '</span>' : '');
        cell.addEventListener('click', function () {
          calSelected = (calSelected === iso) ? null : iso;
          renderCalendar();
          renderCalDetail();
        });
        grid.appendChild(cell);
        if ((first + n) % 7 === 0) appendWeekFlag(new Date(y, mo, n));
      })(n);
    }
    var tailBlanks = (7 - ((first + total) % 7)) % 7;
    for (var t = 0; t < tailBlanks; t++) {
      grid.appendChild(outsideCell(new Date(y, mo + 1, t + 1)));
    }
    if (tailBlanks > 0) appendWeekFlag(new Date(y, mo, total));

    function appendWeekFlag(anyDayInWeek) {
      var flag = document.createElement('div');
      flag.className = 'wt-wk-flag';
      if (data.weeklyGoal > 0) {
        var ws = weekStart(anyDayInWeek);
        var we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 6);
        var cnt = workoutDaysIn(fmtDate(ws), fmtDate(we));
        if (cnt >= data.weeklyGoal) {
          flag.classList.add('done');
          flag.innerHTML = '<span class="wt-wk-badge">' + svg('check', 13) + '</span>';
          flag.title = '주 목표 ' + data.weeklyGoal + '일 달성 (' + cnt + '일)';
        }
      }
      grid.appendChild(flag);
    }
  }

  function renderCalDetail() {
    var el = $('cal-detail');
    el.innerHTML = '';
    if (!calSelected) return;
    var day = data.days.find(function (d) { return d.date === calSelected; });
    if (!day) {
      el.innerHTML = '<p style="font-size:13px;color:var(--wt-text-muted);text-align:center;padding:1.5rem 0;">' +
        fmtDisplayDate(calSelected) + '에는 기록이 없습니다.</p>';
      return;
    }
    el.appendChild(buildDayCard(day, { showDuration: true }));
  }

  $('cal-prev').addEventListener('click', function () {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  $('cal-next').addEventListener('click', function () {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
    renderCalendar();
  });

