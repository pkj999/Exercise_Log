'use strict';
// =========================================================================
// 탭 화면 — 운동(루틴) · 기록 · 종목 · 설정, 그리고 상세 페이지들
// =========================================================================

var currentTab = 'workout';
var TAB_TITLES = { workout: '운동', history: '기록', exercises: '종목', settings: '설정' };
var calMonth = new Date(); calMonth.setDate(1);
var histDay = null;      // 기록 탭에서 캘린더로 고른 날짜 (YYYY-MM-DD)
var exQuery = '';

function switchTab(tab) {
  currentTab = tab;
  Array.prototype.forEach.call(document.querySelectorAll('.tab-btn'), function (b) {
    b.classList.toggle('on', b.getAttribute('data-tab') === tab);
  });
  window.scrollTo(0, 0);
  refreshTab();
}
function refreshTab() {
  $('tab-title').textContent = TAB_TITLES[currentTab];
  var v = $('view');
  if (currentTab === 'workout') v.innerHTML = workoutTabHtml();
  else if (currentTab === 'history') v.innerHTML = historyTabHtml();
  else if (currentTab === 'exercises') { v.innerHTML = exercisesTabHtml(); renderExList(); }
  else v.innerHTML = settingsTabHtml();
}
// 진행 중인 운동 미니 바 (탭 화면 위에서만 보임)
function refreshChrome() {
  var show = !!active && !pages.some(function (p) { return p.isLive; });
  $('minibar').hidden = !show;
  if (show) $('minibar-name').textContent = active.name;
  tickTimers();
}

// ---------- 운동 탭 ----------
function workoutTabHtml() {
  var h = '<h2 class="sec-title">빠른 시작</h2>';
  if (active) {
    h += '<button class="card resume" data-a="resume"><span class="pulse"></span><span class="list-main"><b>' + esc(active.name) + '</b>' +
      '<small>진행 중 · <span class="js-elapsed"></span></small></span>' + icon('right', 18) + '</button>';
  } else {
    h += '<button class="btn btn-primary btn-block btn-lg" data-a="start-empty">' + icon('plus', 20) + '빈 운동 시작</button>';
  }
  h += '<div class="sec-head"><h2 class="sec-title">루틴 <span class="count">' + data.routines.length + '</span></h2>' +
    '<button class="btn btn-ghost btn-sm" data-a="new-routine">' + icon('plus', 15) + '새 루틴</button></div>';
  if (!data.routines.length) {
    h += '<div class="empty">' + icon('list', 30) + '<p>자주 하는 운동 구성을 루틴으로 만들어 두면<br>한 번에 불러와서 시작할 수 있어요.</p>' +
      '<button class="btn btn-secondary" data-a="new-routine">첫 루틴 만들기</button></div>';
  }
  data.routines.forEach(function (r) {
    var last = 0;
    data.workouts.forEach(function (w) { if (w.routineId === r.id && w.start > last) last = w.start; });
    var names = r.exercises.map(function (b) { return exName(b.exId); });
    h += '<div class="card routine" data-rid="' + r.id + '">' +
      '<div class="card-head"><b>' + esc(r.name) + '</b><button class="icon-btn" data-a="routine-menu" aria-label="루틴 메뉴">' + icon('more', 20) + '</button></div>' +
      '<p class="routine-ex">' + esc(names.join(', ') || '종목 없음') + '</p>' +
      '<p class="meta">종목 ' + r.exercises.length + '개' + (last ? ' · 마지막 ' + fmtKoDate(last) : '') + '</p>' +
      '<button class="btn btn-primary btn-block" data-a="start-routine">' + icon('play', 14) + '루틴 시작</button></div>';
  });
  return h;
}

// ---------- 기록 탭 ----------
function weekStart(ms) {
  var d = new Date(ms); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 월요일 시작
  return d.getTime();
}
function historyTabHtml() {
  var ws = weekStart(Date.now());
  var thisWeek = data.workouts.filter(function (w) { return w.start >= ws; });
  var weekVol = thisWeek.reduce(function (a, w) { return a + workoutVolume(w); }, 0);
  var weekDur = thisWeek.reduce(function (a, w) { return a + workoutDuration(w); }, 0);
  var h = '<div class="stat-grid">' +
    '<div class="stat"><small>이번 주</small><b>' + thisWeek.length + '회</b></div>' +
    '<div class="stat"><small>이번 주 볼륨</small><b>' + fmtNum(weekVol) + '<i>kg</i></b></div>' +
    '<div class="stat"><small>이번 주 시간</small><b>' + fmtDur(weekDur) + '</b></div></div>';
  h += '<div class="card"><div class="card-head"><b>주간 볼륨</b><small class="muted">최근 12주</small></div>' + weeklyChart() + '</div>';
  h += calendarHtml();
  h += '<button class="btn btn-secondary btn-block" data-a="add-past">' + icon('plus', 17) + (histDay ? fmtKoDate(new Date(histDay + 'T12:00').getTime()) + ' 운동 추가' : '지난 운동 기록 추가') + '</button>';
  var list = sortedWorkouts().filter(function (w) { return !histDay || fmtDate(w.start) === histDay; });
  if (!data.workouts.length) {
    h += '<div class="empty">' + icon('history', 30) + '<p>아직 저장된 운동이 없어요.</p></div>';
  } else if (!list.length) {
    h += '<p class="hint">이 날은 기록이 없어요.</p>';
  }
  var lastMonth = '';
  list.forEach(function (w) {
    var d = new Date(w.start), mk = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월';
    if (mk !== lastMonth && !histDay) { h += '<h3 class="month-head">' + mk + '</h3>'; lastMonth = mk; }
    h += workoutCardHtml(w);
  });
  return h;
}
function workoutCardHtml(w) {
  var prs = workoutPRs(w);
  var h = '<button class="card workout" data-a="open-workout" data-wid="' + w.id + '">' +
    '<div class="card-head"><b>' + esc(w.name) + '</b><small class="muted">' + fmtKoDate(w.start) + '</small></div>' +
    '<div class="wk-stats"><span>' + icon('clock', 14) + fmtDur(workoutDuration(w)) + '</span><span>' + fmtNum(workoutVolume(w)) + 'kg</span>' +
    '<span>' + workoutSetCount(w) + '세트</span>' + (prs.count ? '<span class="pr">' + icon('trophy', 14) + 'PR ' + prs.count + '</span>' : '') + '</div>' +
    '<div class="wk-lines">';
  w.exercises.slice(0, 4).forEach(function (b) {
    var type = exType(b.exId), best = bestSet(b.sets, type);
    h += '<div class="wk-line"><span>' + b.sets.length + ' × ' + esc(exName(b.exId)) + '</span><span class="muted">' + (best ? esc(fmtSet(best, type)) : '') + '</span></div>';
  });
  if (w.exercises.length > 4) h += '<div class="wk-line muted">외 ' + (w.exercises.length - 4) + '개 종목</div>';
  return h + '</div></button>';
}
// 이 운동에서 세운 PR — 그 이전 운동들의 최고 기록과 비교
function workoutPRs(w) {
  var marks = {}, count = 0;
  w.exercises.forEach(function (b, bi) {
    var type = exType(b.exId), hist = bestBefore(b.exId, w.start, w.id);
    if (!hist.score) return;
    var bs = hist.score, bw = hist.w;
    b.sets.forEach(function (s, si) {
      if (!isWork(s)) return;
      var sc = setScore(s, type);
      if (sc > bs || (type === 'wr' && (s.w || 0) > bw)) { marks[bi + ':' + si] = true; count++; }
      bs = Math.max(bs, sc); if (type === 'wr') bw = Math.max(bw, s.w || 0);
    });
  });
  return { marks: marks, count: count };
}
function weeklyChart() {
  var ws = weekStart(Date.now()), W = 7 * 86400000, weeks = [];
  for (var i = 11; i >= 0; i--) weeks.push({ start: ws - i * W, vol: 0 });
  data.workouts.forEach(function (w) {
    var k = weekStart(w.start);
    weeks.forEach(function (x) { if (x.start === k) x.vol += workoutVolume(w); });
  });
  var max = Math.max.apply(null, weeks.map(function (x) { return x.vol; })) || 1;
  var bw = 100 / 12;
  var bars = weeks.map(function (x, i) {
    var hgt = x.vol ? Math.max(3, x.vol / max * 100) : 0;
    return '<div class="bar-col"><div class="bar' + (i === 11 ? ' now' : '') + '" style="height:' + hgt + '%" title="' + fmtNum(x.vol) + 'kg"></div></div>';
  }).join('');
  var labels = weeks.map(function (x, i) {
    var d = new Date(x.start);
    return '<span>' + (i % 3 === 0 || i === 11 ? (d.getMonth() + 1) + '/' + d.getDate() : '') + '</span>';
  }).join('');
  return '<div class="bars-wrap"><div class="bars-max">' + fmtNum(max === 1 && !weeks.some(function (x) { return x.vol; }) ? 0 : max) + 'kg</div><div class="bars">' + bars + '</div><div class="bar-labels">' + labels + '</div></div>';
}
function calendarHtml() {
  var y = calMonth.getFullYear(), m = calMonth.getMonth();
  var first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
  var has = {};
  data.workouts.forEach(function (w) { has[fmtDate(w.start)] = (has[fmtDate(w.start)] || 0) + 1; });
  var today = fmtDate(new Date());
  var h = '<div class="card cal"><div class="cal-head"><button class="icon-btn" data-a="cal-prev" aria-label="이전 달">' + icon('back', 18) + '</button>' +
    '<b>' + y + '년 ' + (m + 1) + '월</b><button class="icon-btn" data-a="cal-next" aria-label="다음 달">' + icon('right', 18) + '</button></div><div class="cal-grid">' +
    '일월화수목금토'.split('').map(function (d) { return '<span class="cal-dow">' + d + '</span>'; }).join('');
  for (var i = 0; i < first; i++) h += '<span></span>';
  for (var d = 1; d <= days; d++) {
    var key = y + '-' + pad2(m + 1) + '-' + pad2(d);
    h += '<button class="cal-day' + (has[key] ? ' has' : '') + (key === today ? ' today' : '') + (key === histDay ? ' sel' : '') + '" data-a="cal-day" data-d="' + key + '">' + d + '</button>';
  }
  h += '</div>' + (histDay ? '<button class="btn btn-ghost btn-sm cal-clear" data-a="cal-clear">전체 기록 보기</button>' : '') + '</div>';
  return h;
}

// ---------- 운동 상세 ----------
function openWorkoutDetail(id) {
  var page = pushPage(function (el) {
    var w = data.workouts.find(function (x) { return x.id === id; });
    if (!w) { el.innerHTML = pageHeader({ title: '기록' }) + '<div class="page-body"><p class="hint">삭제된 기록입니다.</p></div>'; return; }
    var prs = workoutPRs(w);
    var h = pageHeader({ title: '운동 기록', right: '<button class="icon-btn" data-w="menu" aria-label="메뉴">' + icon('more', 20) + '</button>' }) +
      '<div class="page-body"><h2 class="detail-title">' + esc(w.name) + '</h2>' +
      '<p class="meta">' + fmtKoDate(w.start) + ' · ' + fmtClock(w.start) + '–' + fmtClock(w.end) + '</p>' +
      '<div class="stat-grid four"><div class="stat"><small>시간</small><b>' + fmtDur(workoutDuration(w)) + '</b></div>' +
      '<div class="stat"><small>볼륨</small><b>' + fmtNum(workoutVolume(w)) + '<i>kg</i></b></div>' +
      '<div class="stat"><small>세트</small><b>' + workoutSetCount(w) + '</b></div>' +
      '<div class="stat"><small>PR</small><b>' + prs.count + '</b></div></div>' +
      (w.note ? '<p class="note-box">' + esc(w.note) + '</p>' : '');
    w.exercises.forEach(function (b, bi) {
      var type = exType(b.exId);
      h += '<div class="card"><button class="block-name" data-w="ex" data-ex="' + b.exId + '">' + esc(exName(b.exId)) + '</button>' +
        (b.note ? '<p class="meta">' + esc(b.note) + '</p>' : '') + '<div class="set-list">' +
        setLinesHtml(b.sets, type, function (s, si) {
          return (prs.marks[bi + ':' + si] ? '<span class="pr">' + icon('trophy', 14) + 'PR</span>' : '') +
            (type === 'wr' && isWork(s) && s.r > 1 ? '<span class="muted e1">1RM ' + fmtNum(e1rm(s.w, s.r)) + '</span>' : '');
        }) + '</div></div>';
    });
    el.innerHTML = h + '</div>';
  });
  page.el.addEventListener('click', function (e) {
    var b = e.target.closest('[data-w]');
    if (!b) return;
    var w = data.workouts.find(function (x) { return x.id === id; });
    if (!w) return;
    if (b.getAttribute('data-w') === 'ex') { if (exById(b.getAttribute('data-ex'))) openExerciseDetail(b.getAttribute('data-ex')); return; }
    actionSheet(w.name, [
      { label: '수정', icon: 'edit', onClick: function () { openEditor('edit', w, { closeCount: 2 }); } },
      { label: '이 구성으로 다시 운동하기', icon: 'play', onClick: function () { startWorkout(null, w.exercises, w.name); } },
      { label: '루틴으로 저장', icon: 'copy', onClick: function () {
        data.routines.push({ id: uid(), name: w.name, exercises: clone(w.exercises) });
        save(); toast('루틴으로 저장했습니다');
      } },
      { label: '삭제', icon: 'trash', danger: true, onClick: function () {
        confirmSheet('이 운동 기록을 삭제할까요?', '삭제', function () {
          data.workouts = data.workouts.filter(function (x) { return x.id !== id; });
          save(); closePage(1, function () { toast('삭제했습니다'); });
        });
      } }
    ]);
  });
}

// 세트 목록 (번호 · 워밍업 W · 드롭 D · 실패 F 배지) — extra(s, i)로 줄 끝에 덧붙일 내용
function setBadge(t, no) { return t === 'n' ? String(no) : SET_TYPES.filter(function (x) { return x.key === t; })[0].badge; }
function setLinesHtml(sets, type, extra) {
  var no = 0;
  return sets.map(function (s, i) {
    if (s.t !== 'w') no++;
    return '<div class="set-line"><span class="set-badge t-' + s.t + '">' + setBadge(s.t, no) + '</span><span>' + esc(fmtSet(s, type)) + '</span>' +
      (extra ? extra(s, i) : '') + '</div>';
  }).join('');
}

// ---------- 종목 탭 ----------
function exercisesTabHtml() {
  return '<div class="sec-head"><div class="search grow"><span class="search-icon">' + icon('search', 17) + '</span>' +
    '<input class="input" id="ex-q" placeholder="종목 검색" autocomplete="off" value="' + esc(exQuery) + '"></div>' +
    '<button class="btn btn-primary btn-sm" data-a="new-ex">' + icon('plus', 15) + '새 종목</button></div><div id="ex-list"></div>';
}
function renderExList() {
  var box = $('ex-list'); if (!box) return;
  var counts = {};
  data.workouts.forEach(function (w) { w.exercises.forEach(function (b) { counts[b.exId] = (counts[b.exId] || 0) + 1; }); });
  var list = filterExercises(exQuery, '');
  if (!data.exercises.length) {
    box.innerHTML = '<div class="empty">' + icon('dumbbell', 30) + '<p>종목이 없어요.<br>내가 하는 운동만 직접 추가해서 쓰는 방식이에요.</p></div>';
    return;
  }
  if (!list.length) { box.innerHTML = '<p class="hint">검색 결과가 없어요.</p>'; return; }
  var h = '';
  MUSCLES.forEach(function (m) {
    var g = list.filter(function (e) { return e.muscle === m; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'ko'); });
    if (!g.length) return;
    h += '<h3 class="month-head">' + m + ' <span class="count">' + g.length + '</span></h3><div class="list card flush">' + g.map(function (e) {
      return '<button class="list-row" data-a="open-ex" data-id="' + e.id + '"><span class="ex-avatar">' + esc(e.name.charAt(0)) + '</span>' +
        '<span class="list-main"><b>' + esc(e.name) + '</b><small>' + TYPES[e.type] + ' · ' + (counts[e.id] || 0) + '회 운동</small></span>' + icon('right', 16) + '</button>';
    }).join('') + '</div>';
  });
  box.innerHTML = h;
}

// ---------- 종목 상세 ----------
function exerciseHistory(exId) {
  var out = [];
  data.workouts.forEach(function (w) {
    var sets = [];
    w.exercises.forEach(function (b) { if (b.exId === exId) sets = sets.concat(b.sets); });
    if (sets.length) out.push({ w: w, sets: sets });
  });
  return out.sort(function (a, b) { return a.w.start - b.w.start; });
}
function openExerciseDetail(exId) {
  var st = { metric: 'e1rm' };
  var page = pushPage(function (el) {
    var ex = exById(exId);
    if (!ex) { el.innerHTML = pageHeader({ title: '종목' }) + '<div class="page-body"><p class="hint">삭제된 종목입니다.</p></div>'; return; }
    var hist = exerciseHistory(exId), type = ex.type;
    var h = pageHeader({ title: ex.name, right: '<button class="icon-btn" data-x="edit" aria-label="종목 수정">' + icon('edit', 18) + '</button>' }) +
      '<div class="page-body"><p class="meta">' + ex.muscle + ' · ' + TYPES[type] + '</p>';
    var all = [];
    hist.forEach(function (x) { x.sets.forEach(function (s) { if (isWork(s)) all.push(s); }); });
    var mx = function (f) { return all.reduce(function (a, s) { return Math.max(a, f(s)); }, 0); };
    var stats;
    if (type === 'wr') stats = [['최고 무게', fmtNum(mx(function (s) { return s.w || 0; })) + 'kg'], ['예상 1RM', fmtNum(mx(function (s) { return e1rm(s.w || 0, s.r || 0); })) + 'kg'], ['최고 볼륨', fmtNum(mx(setVolume)) + 'kg'], ['운동 횟수', hist.length + '회']];
    else if (type === 'r') stats = [['최고 횟수', mx(function (s) { return s.r || 0; }) + '회'], ['총 횟수', all.reduce(function (a, s) { return a + (s.r || 0); }, 0) + '회'], ['운동 횟수', hist.length + '회']];
    else if (type === 't') stats = [['최장 시간', fmtDur(mx(function (s) { return s.s || 0; }))], ['운동 횟수', hist.length + '회']];
    else stats = [['최장 거리', fmtNum(mx(function (s) { return s.d || 0; })) + 'km'], ['최장 시간', fmtDur(mx(function (s) { return s.s || 0; }))], ['운동 횟수', hist.length + '회']];
    h += '<div class="stat-grid' + (stats.length === 4 ? ' four' : '') + '">' + stats.map(function (s) { return '<div class="stat"><small>' + s[0] + '</small><b>' + s[1] + '</b></div>'; }).join('') + '</div>';

    if (hist.length) {
      var metrics = type === 'wr' ? [['e1rm', '예상 1RM'], ['w', '최고 무게'], ['vol', '볼륨']] : type === 'r' ? [['r', '최고 횟수'], ['tot', '총 횟수']] : type === 't' ? [['s', '최장 시간']] : [['d', '거리'], ['s', '시간']];
      if (!metrics.some(function (m) { return m[0] === st.metric; })) st.metric = metrics[0][0];
      var pts = hist.map(function (x) {
        var ws = x.sets.filter(isWork), v = 0;
        ws.forEach(function (s) {
          var val = st.metric === 'e1rm' ? e1rm(s.w || 0, s.r || 0) : st.metric === 'vol' ? setVolume(s) : st.metric === 'tot' ? s.r || 0 : s[st.metric] || 0;
          v = (st.metric === 'vol' || st.metric === 'tot') ? v + val : Math.max(v, val);
        });
        return { t: x.w.start, v: v };
      });
      var unit = { e1rm: 'kg', w: 'kg', vol: 'kg', r: '회', tot: '회', s: '초', d: 'km' }[st.metric];
      h += '<div class="card"><div class="chips">' + (metrics.length > 1 ? metrics.map(function (m) {
        return '<button class="chip' + (st.metric === m[0] ? ' on' : '') + '" data-x="metric" data-m="' + m[0] + '">' + m[1] + '</button>';
      }).join('') : '') + '</div>' + lineChart(pts, unit) + '</div>';
      h += '<h3 class="month-head">기록</h3>';
      hist.slice().reverse().forEach(function (x) {
        h += '<button class="card hist-item" data-x="workout" data-wid="' + x.w.id + '"><div class="card-head"><b>' + esc(x.w.name) + '</b><small class="muted">' + fmtKoDate(x.w.start) + '</small></div>' +
          '<div class="set-list">' + setLinesHtml(x.sets, type) + '</div></button>';
      });
    } else {
      h += '<div class="empty">' + icon('history', 28) + '<p>아직 이 종목의 기록이 없어요.</p></div>';
    }
    el.innerHTML = h + '</div>';
  });
  page.el.addEventListener('click', function (e) {
    var b = e.target.closest('[data-x]');
    if (!b) return;
    var act = b.getAttribute('data-x');
    if (act === 'metric') { st.metric = b.getAttribute('data-m'); page.render(); }
    else if (act === 'workout') openWorkoutDetail(b.getAttribute('data-wid'));
    else if (act === 'edit') {
      var ex = exById(exId);
      if (ex) openExerciseForm(ex, '', function (res) { if (res === null) closePage(); else page.render(); });
    }
  });
}
function lineChart(pts, unit) {
  if (pts.length < 2) return '<p class="hint">기록이 2회 이상 쌓이면 추이 그래프가 보여요.' + (pts.length ? ' (현재 ' + fmtNum(pts[0].v) + unit + ')' : '') + '</p>';
  var W = 320, H = 150, P = 8;
  var vs = pts.map(function (p) { return p.v; });
  var min = Math.min.apply(null, vs), max = Math.max.apply(null, vs);
  if (max === min) { max += 1; min = Math.max(0, min - 1); }
  var t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  var xy = pts.map(function (p) {
    var x = P + (t1 === t0 ? 0 : (p.t - t0) / (t1 - t0)) * (W - 2 * P);
    var y = P + (1 - (p.v - min) / (max - min)) * (H - 2 * P);
    return [x.toFixed(1), y.toFixed(1)];
  });
  var fmtV = function (v) { return unit === '초' ? fmtDur(v) : fmtNum(v) + unit; };
  return '<div class="chart"><div class="chart-y"><span>' + fmtV(max) + '</span><span>' + fmtV(min) + '</span></div>' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="chart-svg">' +
    '<polyline points="' + xy.map(function (p) { return p.join(','); }).join(' ') + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
    '</svg><div class="chart-dots">' + xy.map(function (p) { return '<i style="left:' + (p[0] / W * 100) + '%;top:' + (p[1] / H * 100) + '%"></i>'; }).join('') + '</div>' +
    '<div class="chart-x"><span>' + fmtKoDate(t0) + '</span><span>' + fmtKoDate(t1) + '</span></div></div>';
}

// ---------- 설정 탭 ----------
function settingsTabHtml() {
  var s = data.settings, cfg = getGhConfig();
  var h = '<h2 class="sec-title">화면</h2><div class="card"><div class="row"><span>테마</span><div class="seg">' +
    [['auto', '자동'], ['light', '라이트'], ['dark', '다크']].map(function (t) {
      return '<button class="' + (s.theme === t[0] ? 'on' : '') + '" data-a="theme" data-v="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div></div></div>';
  h += '<h2 class="sec-title">운동</h2><div class="card">' +
    '<div class="row"><span>기본 휴식 시간</span><div class="stepper"><button data-a="rest-dec" aria-label="줄이기">−</button><b>' + fmtRest(s.rest) + '</b><button data-a="rest-inc" aria-label="늘리기">+</button></div></div>' +
    '<div class="row"><span>휴식 끝 알림음</span><button class="switch' + (s.sound ? ' on' : '') + '" data-a="toggle" data-k="sound" aria-label="알림음"></button></div>' +
    '<div class="row"><span>휴식 끝 진동</span><button class="switch' + (s.vibrate ? ' on' : '') + '" data-a="toggle" data-k="vibrate" aria-label="진동"></button></div></div>';
  h += '<h2 class="sec-title">GitHub 동기화</h2><div class="card">';
  if (cfg) {
    h += '<div class="row"><span class="list-main"><b>' + esc(cfg.owner + '/' + cfg.repo) + '</b><small>' + esc(cfg.branch || 'main') + ' 브랜치 · ' + esc(GH_DATA_PATH) +
      (cfg.tokenExpiresAt ? '<br>토큰 만료: ' + esc(String(cfg.tokenExpiresAt).slice(0, 10)) : '') + '</small></span><span class="badge ok">연결됨</span></div>' +
      '<div class="btn-row"><button class="btn btn-secondary" data-a="gh-reload">' + icon('refresh', 16) + '다시 불러오기</button><button class="btn btn-secondary danger" data-a="gh-disconnect">연결 해제</button></div>';
  } else {
    h += '<p class="hint left">연결하면 기록이 GitHub 저장소에 저장되어 여러 기기에서 같이 쓸 수 있어요. 연결하지 않으면 이 기기에만 저장됩니다.</p>' +
      '<div class="field-row"><label class="field"><span>계정</span><input class="input" id="gh-owner" autocomplete="off" autocapitalize="off"></label>' +
      '<label class="field"><span>저장소</span><input class="input" id="gh-repo" autocomplete="off" autocapitalize="off"></label></div>' +
      '<label class="field"><span>브랜치</span><input class="input" id="gh-branch" value="main" autocomplete="off" autocapitalize="off"></label>' +
      '<label class="field"><span>토큰 (Fine-grained, Contents 읽기/쓰기)</span><input class="input" id="gh-token" type="password" autocomplete="off"></label>' +
      '<p class="sheet-note" id="gh-msg" hidden></p><button class="btn btn-primary btn-block" data-a="gh-connect">연결</button>';
  }
  h += '</div>';
  h += '<h2 class="sec-title">데이터</h2><div class="card">' +
    '<div class="row"><span class="list-main"><b>저장 위치</b><small>' + (store.mode === 'github' ? 'GitHub' : store.mode === 'claude' ? 'Claude 앱 저장소' : '이 기기 (브라우저)') + ' · 운동 ' + data.workouts.length + '회 · 종목 ' + data.exercises.length + '개 · 루틴 ' + data.routines.length + '개</small></span></div>' +
    '<div class="btn-row"><button class="btn btn-secondary" data-a="export">백업 파일 저장</button><button class="btn btn-secondary" data-a="import">백업 불러오기</button></div>' +
    '<button class="btn btn-text-danger btn-block" data-a="wipe">모든 데이터 지우기</button></div>' +
    '<input type="file" id="import-file" accept="application/json,.json" hidden>';
  h += '<p class="version">운동일지 ver.' + APP_VERSION + ' · ' + APP_BUILD_DATE + '</p>';
  return h;
}
function hasAnyData(d) { return d.workouts.length || d.exercises.length || d.routines.length; }
async function ghConnect() {
  var cfg = {
    owner: $('gh-owner').value.trim(), repo: $('gh-repo').value.trim(),
    branch: $('gh-branch').value.trim() || 'main', token: $('gh-token').value.trim()
  };
  var msg = $('gh-msg');
  function show(t) { msg.textContent = t; msg.hidden = false; }
  if (!cfg.owner || !cfg.repo || !cfg.token) { show('계정, 저장소, 토큰을 모두 입력하세요.'); return; }
  show('연결 확인 중...');
  try {
    var test = await ghTestConnection(cfg);
    cfg.tokenExpiresAt = test.tokenExpiresAt || null;
    var remote = await ghGetData(cfg);
    var finish = async function (useRemote) {
      setGhConfig(cfg);
      ghSha = remote.sha;
      try { localStorage.removeItem(GH_PENDING_KEY); localStorage.removeItem(GH_CACHE_AT_KEY); } catch (e) {}
      if (useRemote) {
        data = normalize(JSON.parse(remote.value));
        try { localStorage.setItem(GH_CACHE_KEY, remote.value); } catch (e) {}
        applyTheme();
      } else {
        await persist();
      }
      toast('GitHub에 연결했습니다');
      refreshTab();
    };
    if (remote.value && hasAnyData(data)) {
      actionSheet('GitHub에 이미 데이터가 있습니다', [
        { label: 'GitHub 데이터 불러오기 (이 기기 데이터 대체)', icon: 'refresh', onClick: function () { finish(true).catch(function (e) { show(e.message); }); } },
        { label: '이 기기 데이터로 GitHub 덮어쓰기', icon: 'up', danger: true, onClick: function () { finish(false).catch(function (e) { show(e.message); }); } }
      ]);
    } else {
      await finish(!!remote.value);
    }
  } catch (e) { show(e.message || '연결에 실패했습니다.'); }
}
function exportData() {
  var json = JSON.stringify(data, null, 1);
  var name = 'exercise-log-' + fmtDate(new Date()) + '.json';
  try {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast('백업 파일을 저장했습니다');
  } catch (e) {
    if (navigator.clipboard) navigator.clipboard.writeText(json).then(function () { toast('파일 저장이 안 돼서 클립보드에 복사했습니다'); });
  }
}
function importData(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var obj;
    try { obj = JSON.parse(reader.result); } catch (e) { toast('JSON 파일이 아닙니다'); return; }
    if (!obj || !Array.isArray(obj.workouts) || !Array.isArray(obj.exercises)) { toast('이 앱의 백업 파일 형식이 아닙니다'); return; }
    var d = normalize(obj);
    confirmSheet('백업(운동 ' + d.workouts.length + '회, 종목 ' + d.exercises.length + '개)으로 지금 데이터를 대체할까요?', '대체', function () {
      data = d; applyTheme(); save(); refreshTab(); toast('불러왔습니다');
    });
  };
  reader.readAsText(file);
}

// ---------- 탭 화면 이벤트 ----------
$('view').addEventListener('input', function (e) {
  if (e.target.id === 'ex-q') { exQuery = e.target.value; renderExList(); }
});
$('view').addEventListener('change', function (e) {
  if (e.target.id === 'import-file' && e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
});
$('view').addEventListener('click', function (e) {
  var b = e.target.closest('[data-a]');
  if (!b) return;
  var act = b.getAttribute('data-a');
  var rEl = b.closest('[data-rid]');
  var routine = rEl ? data.routines.find(function (r) { return r.id === rEl.getAttribute('data-rid'); }) : null;
  switch (act) {
    case 'start-empty': startWorkout(null); break;
    case 'resume': openEditor('live'); break;
    case 'new-routine': openEditor('routine'); break;
    case 'start-routine': if (routine) startWorkout(routine); break;
    case 'routine-menu':
      actionSheet(routine.name, [
        { label: '수정', icon: 'edit', onClick: function () { openEditor('routine', routine); } },
        { label: '복제', icon: 'copy', onClick: function () {
          var c = clone(routine); c.id = uid(); c.name = (routine.name + ' 사본').slice(0, 40);
          data.routines.splice(data.routines.indexOf(routine) + 1, 0, c); save(); refreshTab();
        } },
        { label: '삭제', icon: 'trash', danger: true, onClick: function () {
          confirmSheet('‘' + routine.name + '’ 루틴을 삭제할까요? 운동 기록은 지워지지 않습니다.', '삭제', function () {
            data.routines = data.routines.filter(function (r) { return r !== routine; }); save(); refreshTab();
          });
        } }
      ]);
      break;
    case 'open-workout': openWorkoutDetail(b.getAttribute('data-wid')); break;
    case 'add-past': openEditor('edit', null, { date: histDay }); break;
    case 'cal-prev': calMonth.setMonth(calMonth.getMonth() - 1); refreshTab(); break;
    case 'cal-next': calMonth.setMonth(calMonth.getMonth() + 1); refreshTab(); break;
    case 'cal-day': var d = b.getAttribute('data-d'); histDay = histDay === d ? null : d; refreshTab(); break;
    case 'cal-clear': histDay = null; refreshTab(); break;
    case 'new-ex': openExerciseForm(null, exQuery.trim(), function () { refreshTab(); }); break;
    case 'open-ex': openExerciseDetail(b.getAttribute('data-id')); break;
    case 'theme': data.settings.theme = b.getAttribute('data-v'); applyTheme(); save(); refreshTab(); break;
    case 'rest-dec': case 'rest-inc':
      var i = REST_OPTIONS.indexOf(data.settings.rest);
      if (i < 0) i = 4;
      i = Math.max(0, Math.min(REST_OPTIONS.length - 1, i + (act === 'rest-inc' ? 1 : -1)));
      data.settings.rest = REST_OPTIONS[i]; save(); refreshTab();
      break;
    case 'toggle': var k = b.getAttribute('data-k'); data.settings[k] = !data.settings[k]; save(); refreshTab(); break;
    case 'gh-connect': ghConnect(); break;
    case 'gh-reload':
      if (localStorage.getItem(GH_PENDING_KEY)) { toast('아직 GitHub에 올라가지 않은 변경사항이 있어 다시 불러오지 않았습니다', 3500); break; }
      try { localStorage.removeItem(GH_CACHE_AT_KEY); } catch (e2) {}
      loadData().then(function () { applyTheme(); refreshTab(); toast('GitHub에서 다시 불러왔습니다'); });
      break;
    case 'gh-disconnect':
      confirmSheet('GitHub 연결을 해제할까요? 지금 데이터는 이 기기에 복사해 둡니다.', '연결 해제', function () {
        clearGhConfig();
        try { [GH_CACHE_KEY, GH_CACHE_AT_KEY, GH_PENDING_KEY].forEach(function (k2) { localStorage.removeItem(k2); }); } catch (e3) {}
        save(); refreshTab(); toast('연결을 해제했습니다');
      });
      break;
    case 'export': exportData(); break;
    case 'import': $('import-file').click(); break;
    case 'wipe':
      confirmSheet('운동 기록, 종목, 루틴을 모두 지울까요? 되돌릴 수 없습니다.' + (store.mode === 'github' ? ' (GitHub의 데이터도 비워집니다)' : ''), '모두 지우기', function () {
        var keep = data.settings;
        data = emptyData(); data.settings = keep;
        save(); refreshTab(); toast('모든 데이터를 지웠습니다');
      });
      break;
  }
});
