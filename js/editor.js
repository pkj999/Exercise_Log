'use strict';
// =========================================================================
// 운동 편집기 — 세 가지 모드를 한 화면에서 처리
//   live    : 진행 중인 운동 (세트 완료 체크 · 휴식 타이머 · 경과 시간)
//   edit    : 지난 운동 추가/수정 (날짜·시작 시각·소요 시간 직접 입력)
//   routine : 루틴 편집 (목표 무게/횟수 템플릿)
// =========================================================================

// ---------- 진행 중인 운동 (이 기기 로컬에만 저장) ----------
var active = null;
function loadActive() {
  try {
    var raw = localStorage.getItem(ACTIVE_KEY);
    active = raw ? JSON.parse(raw) : null;
    if (active && !Array.isArray(active.exercises)) active = null;
  } catch (e) { active = null; }
}
function saveActive() {
  try {
    if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch (e) {}
}
function defaultWorkoutName(ms) {
  var h = new Date(ms || Date.now()).getHours();
  return (h < 5 ? '새벽' : h < 11 ? '아침' : h < 14 ? '점심' : h < 18 ? '오후' : '저녁') + ' 운동';
}
function liveBlocksFrom(blocks) {
  return (blocks || []).map(function (b) {
    var sets = b.sets.length ? b.sets : [{ t: 'n' }];
    return {
      exId: b.exId, note: b.note || '', rest: b.rest,
      sets: sets.map(function (s) { var c = cleanSet(s); c.done = false; return c; })
    };
  });
}
// routine: 루틴으로 시작 / blocks: 지난 운동 구성 그대로 다시 하기
function startWorkout(routine, blocks, name) {
  function go() {
    active = {
      id: uid(), name: name || (routine ? routine.name : defaultWorkoutName()),
      routineId: routine ? routine.id : '', start: Date.now(), note: '',
      exercises: liveBlocksFrom(routine ? routine.exercises : blocks),
      restEnd: 0, restTotal: 0
    };
    saveActive();
    openEditor('live');
  }
  if (active) {
    actionSheet('진행 중인 운동이 있습니다', [
      { label: '진행 중인 운동 이어하기', icon: 'play', onClick: function () { openEditor('live'); } },
      { label: '버리고 새로 시작', icon: 'trash', danger: true, onClick: go }
    ]);
  } else go();
}

// ---------- 열 정의 (종목 type별 입력 칸) ----------
var COLS = {
  wr: [{ k: 'w', h: 'kg', im: 'decimal' }, { k: 'r', h: '횟수', im: 'numeric' }],
  r: [{ k: 'r', h: '횟수', im: 'numeric' }],
  t: [{ k: 's', h: '초', im: 'numeric' }],
  dt: [{ k: 'd', h: 'km', im: 'decimal' }, { k: 'm', h: '분', im: 'decimal' }]
};
function valOf(s, k) {
  if (!s) return '';
  if (k === 'm') return s.s != null ? Math.round(s.s / 6) / 10 : '';
  return s[k] != null ? s[k] : '';
}
function setVal(s, k, v) {
  if (k === 'm') { if (v == null) delete s.s; else s.s = Math.round(v * 60); }
  else if (v == null) delete s[k];
  else s[k] = v;
}
function fmtSetShort(s, type) {
  if (!s) return '—';
  if (type === 'r') return '×' + (s.r || 0);
  if (type === 't') return fmtDur(s.s);
  if (type === 'dt') return (s.d ? fmtNum(s.d) + 'km ' : '') + (s.s ? Math.round(s.s / 60) + '분' : '');
  return fmtNum(s.w || 0) + '×' + (s.r || 0);
}
function hasValue(s) { return !!(s.w || s.r || s.s || s.d); }
function setValid(s, type) {
  if (type === 'wr' || type === 'r') return s.r > 0;
  if (type === 't') return s.s > 0;
  return s.s > 0 || s.d > 0;
}

// ---------- 편집기 열기 ----------
function newPastWorkout(dateStr) {
  var start;
  if (dateStr) start = new Date(dateStr + 'T18:00').getTime();
  else { var d = new Date(); d.setMinutes(0, 0, 0); start = d.getTime() - 3600000; }
  return { id: uid(), name: defaultWorkoutName(start), routineId: '', start: start, end: start + 3600000, note: '', exercises: [] };
}
function openEditor(mode, src, opts) {
  opts = opts || {};
  var ed = { mode: mode, isNew: !src, dirty: false, opts: opts };
  if (mode === 'live') ed.obj = active;
  else if (mode === 'edit') ed.obj = src ? clone(src) : newPastWorkout(opts.date);
  else ed.obj = src ? clone(src) : { id: uid(), name: '', exercises: [] };
  var page = pushPage(function (el) { renderEditor(el, ed); });
  page.isLive = mode === 'live';
  if (mode !== 'live') {
    page.guard = function () {
      if (!ed.dirty) return false;
      confirmSheet('저장하지 않은 변경사항이 있습니다. 버릴까요?', '버리기', function () {
        page.forceClose = true; closePage();
      });
      return true;
    };
  }
  bindEditor(page.el, ed, page);
  refreshChrome();
  return page;
}

// ---------- 그리기 ----------
function renderEditor(el, ed) {
  var o = ed.obj, live = ed.mode === 'live', routine = ed.mode === 'routine';
  if (live && !active) { el.innerHTML = ''; return; }
  var title = live ? '운동 중' : routine ? (ed.isNew ? '새 루틴' : '루틴 편집') : (ed.isNew ? '지난 운동 추가' : '기록 수정');
  var right = '<button class="btn btn-primary btn-sm" data-e="' + (live ? 'finish' : 'save') + '">' + (live ? '완료' : '저장') + '</button>';
  var h = pageHeader({ backIcon: live ? 'down' : 'back', backAttr: 'data-e="back"', title: title, right: right });
  h += '<div class="page-body editor">';
  if (live) {
    h += '<div class="stats-bar"><div><small>시간</small><b class="js-elapsed">' + fmtTimer((Date.now() - o.start) / 1000) + '</b></div>' +
      '<div><small>볼륨</small><b class="js-vol">0kg</b></div><div><small>세트</small><b class="js-sets">0</b></div></div>';
  }
  h += '<input class="title-input" data-f="name" maxlength="40" value="' + esc(o.name) + '" placeholder="' + (routine ? '루틴 이름 (예: 상체 A)' : '운동 이름') + '">';
  if (ed.mode === 'edit') {
    var sd = new Date(o.start);
    h += '<div class="field-row">' +
      '<label class="field"><span>날짜</span><input type="date" class="input" data-f="date" value="' + fmtDate(sd) + '"></label>' +
      '<label class="field"><span>시작</span><input type="time" class="input" data-f="time" value="' + fmtClock(o.start) + '"></label>' +
      '<label class="field narrow"><span>소요(분)</span><input type="number" class="input" inputmode="numeric" data-f="dur" value="' + Math.round(workoutDuration(o) / 60) + '"></label></div>';
  }
  if (!routine) h += '<textarea class="note-input" data-f="note" rows="1" maxlength="1000" placeholder="메모 (선택)">' + esc(o.note || '') + '</textarea>';

  if (!o.exercises.length) {
    h += '<div class="empty">' + icon('dumbbell', 30) + '<p>' + (routine ? '루틴에 넣을 종목을 추가하세요' : '종목을 추가해 기록을 시작하세요') + '</p></div>';
  }
  o.exercises.forEach(function (b, i) { h += blockHtml(b, i, ed); });
  h += '<button class="btn btn-primary btn-block" data-e="add-ex">' + icon('plus', 18) + '종목 추가</button>';
  if (live) h += '<button class="btn btn-text-danger btn-block" data-e="discard">운동 취소</button>';
  else if (!ed.isNew) h += '<button class="btn btn-text-danger btn-block" data-e="delete">' + (routine ? '루틴 삭제' : '기록 삭제') + '</button>';
  h += '</div>';
  if (live) {
    h += '<div class="rest-bar js-restbar" hidden><div class="rest-progress js-restprog"></div>' +
      '<div class="rest-main">' + icon('clock', 16) + '<b class="js-resttime">0:00</b></div>' +
      '<button class="rest-btn" data-e="rest-minus">−15</button><button class="rest-btn" data-e="rest-plus">+15</button>' +
      '<button class="rest-btn strong" data-e="rest-skip">건너뛰기</button></div>';
  }
  el.innerHTML = h;
  autosize(el.querySelector('.note-input'));
  if (live) { updateStats(el, o); tickTimers(); }
}

function blockHtml(b, i, ed) {
  var live = ed.mode === 'live', o = ed.obj;
  var ex = exById(b.exId), type = ex ? ex.type : 'wr', cols = COLS[type];
  var prev = previousSets(b.exId, ed.mode === 'routine' ? Infinity : o.start, o.id);
  var grid = '34px minmax(0,1fr) ' + cols.map(function () { return '64px'; }).join(' ') + (live ? ' 40px' : '');
  var h = '<section class="block" data-b="' + i + '">' +
    '<div class="block-head"><button class="block-name" data-e="ex-detail">' + esc(ex ? ex.name : '(삭제된 종목)') + '</button>' +
    '<button class="icon-btn" data-e="block-menu" aria-label="종목 메뉴">' + icon('more', 20) + '</button></div>' +
    '<input class="block-note" data-bn maxlength="200" value="' + esc(b.note || '') + '" placeholder="메모 추가">';
  if (ed.mode !== 'edit') {
    var rest = b.rest != null ? b.rest : data.settings.rest;
    h += '<button class="rest-chip" data-e="rest">' + icon('clock', 14) + '휴식 ' + fmtRest(rest) + (b.rest == null ? ' (기본)' : '') + '</button>';
  }
  h += '<div class="set-table">' +
    '<div class="set-row head" style="grid-template-columns:' + grid + '"><span>세트</span><span>이전</span>' +
    cols.map(function (c) { return '<span>' + c.h + '</span>'; }).join('') + (live ? '<span>' + icon('check', 14) + '</span>' : '') + '</div>';
  var workNo = 0;
  b.sets.forEach(function (s, j) {
    if (s.t !== 'w') workNo++;
    var badge = setBadge(s.t, workNo);
    var p = prev && prev[j];
    h += '<div class="set-row' + (s.done ? ' done' : '') + '" data-s="' + j + '" style="grid-template-columns:' + grid + '">' +
      '<button class="set-badge t-' + s.t + '" data-e="set-type">' + badge + '</button>' +
      '<button class="prev" data-e="fill-prev"' + (p ? '' : ' disabled') + '>' + (s.pr ? icon('trophy', 13) : '') + esc(fmtSetShort(p, type)) + '</button>' +
      cols.map(function (c) {
        return '<input class="set-input" data-k="' + c.k + '" type="number" inputmode="' + c.im + '" step="any" min="0" value="' + valOf(s, c.k) + '" placeholder="' + (p ? valOf(p, c.k) : '') + '">';
      }).join('') +
      (live ? '<button class="check' + (s.done ? ' on' : '') + '" data-e="check" aria-label="세트 완료">' + icon('check', 16) + '</button>' : '') +
      '</div>';
  });
  h += '</div><button class="add-set" data-e="add-set">' + icon('plus', 15) + '세트 추가</button></section>';
  return h;
}

function autosize(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.max(40, ta.scrollHeight) + 'px';
}
function liveTotals(o) {
  var vol = 0, sets = 0;
  o.exercises.forEach(function (b) {
    b.sets.forEach(function (s) { if (s.done) { sets++; vol += setVolume(s); } });
  });
  return { vol: vol, sets: sets };
}
function updateStats(el, o) {
  var t = liveTotals(o);
  var v = el.querySelector('.js-vol'), s = el.querySelector('.js-sets');
  if (v) v.textContent = fmtNum(t.vol) + 'kg';
  if (s) s.textContent = t.sets;
}

// ---------- 이벤트 ----------
function bindEditor(el, ed, page) {
  var o = ed.obj;
  function changed() {
    ed.dirty = true;
    if (ed.mode === 'live') { saveActive(); updateStats(el, o); }
  }
  function rerender() { page.render(); }
  function ctx(target) {
    var bEl = target.closest('[data-b]'), sEl = target.closest('[data-s]');
    var b = bEl ? o.exercises[Number(bEl.getAttribute('data-b'))] : null;
    return { bi: bEl ? Number(bEl.getAttribute('data-b')) : -1, b: b, j: sEl ? Number(sEl.getAttribute('data-s')) : -1, row: sEl };
  }

  el.addEventListener('input', function (e) {
    var t = e.target;
    var f = t.getAttribute('data-f');
    if (f === 'name') o.name = t.value;
    else if (f === 'note') { o.note = t.value; autosize(t); }
    else if (f === 'date' || f === 'time' || f === 'dur') {
      var dateV = el.querySelector('[data-f="date"]').value, timeV = el.querySelector('[data-f="time"]').value || '18:00';
      var dur = Math.max(0, Math.min(1440, Number(el.querySelector('[data-f="dur"]').value) || 0));
      var st = new Date(dateV + 'T' + timeV).getTime();
      if (isFinite(st)) { o.start = st; o.end = st + dur * 60000; }
    } else if (t.hasAttribute('data-bn')) {
      ctx(t).b.note = t.value;
    } else if (t.hasAttribute('data-k')) {
      var c = ctx(t), s = c.b.sets[c.j];
      var v = num(t.value);
      setVal(s, t.getAttribute('data-k'), v != null && v >= 0 ? v : null);
    } else return;
    changed();
  });

  el.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-e]');
    if (!btn || btn.disabled) return;
    var act = btn.getAttribute('data-e');
    var c = ctx(btn);
    switch (act) {
      case 'back': closePage(); break;
      case 'finish': finishLive(el, ed); break;
      case 'save': ed.mode === 'routine' ? saveRoutine(ed, page) : saveEdited(ed, page); break;
      case 'discard':
        confirmSheet('운동을 취소할까요? 이번 기록은 저장되지 않습니다.', '운동 취소', function () {
          active = null; saveActive(); closePage();
        });
        break;
      case 'delete':
        confirmSheet(ed.mode === 'routine' ? '이 루틴을 삭제할까요?' : '이 운동 기록을 삭제할까요?', '삭제', function () {
          var list = ed.mode === 'routine' ? data.routines : data.workouts;
          var idx = list.findIndex(function (x) { return x.id === o.id; });
          if (idx >= 0) list.splice(idx, 1);
          save();
          page.forceClose = true;
          closePage(ed.opts.closeCount || 1, function () { toast('삭제했습니다'); });
        });
        break;
      case 'add-ex':
        openPicker({
          multi: true,
          onPick: function (ids) {
            ids.forEach(function (id) { o.exercises.push(newBlock(id, ed)); });
            changed();
          }
        });
        break;
      case 'ex-detail': if (exById(c.b.exId)) openExerciseDetail(c.b.exId); break;
      case 'block-menu': blockMenu(c.bi, ed, changed, rerender); break;
      case 'rest':
        var cur = c.b.rest;
        actionSheet('휴식 타이머', [{ label: '기본값 따르기 (' + fmtRest(data.settings.rest) + ')', active: cur == null, onClick: function () { c.b.rest = null; changed(); rerender(); } }]
          .concat(REST_OPTIONS.map(function (sec) {
            return { label: fmtRest(sec), active: cur === sec, onClick: function () { c.b.rest = sec; changed(); rerender(); } };
          })));
        break;
      case 'set-type':
        var s0 = c.b.sets[c.j];
        actionSheet(c.j + 1 + '번째 세트', SET_TYPES.map(function (t) {
          return { label: t.label + (t.badge ? ' (' + t.badge + ')' : ''), active: s0.t === t.key, onClick: function () { s0.t = t.key; changed(); rerender(); } };
        }).concat([{ label: '세트 삭제', icon: 'trash', danger: true, onClick: function () { c.b.sets.splice(c.j, 1); changed(); rerender(); } }]));
        break;
      case 'fill-prev':
        var prev = previousSets(c.b.exId, ed.mode === 'routine' ? Infinity : o.start, o.id);
        var p = prev && prev[c.j];
        if (p) {
          var tgt = c.b.sets[c.j];
          ['w', 'r', 's', 'd'].forEach(function (k) { if (p[k] != null) tgt[k] = p[k]; });
          changed(); rerender();
        }
        break;
      case 'add-set':
        var last = c.b.sets[c.b.sets.length - 1];
        var ns = { t: last && last.t !== 'w' ? last.t : 'n' };
        if (last) ['w', 'r', 's', 'd'].forEach(function (k) { if (last[k] != null) ns[k] = last[k]; });
        if (ed.mode === 'live') ns.done = false;
        c.b.sets.push(ns);
        changed(); rerender();
        break;
      case 'check': toggleCheck(c, ed, el, changed); break;
      case 'rest-minus': adjustRest(-15); break;
      case 'rest-plus': adjustRest(15); break;
      case 'rest-skip': stopRest(); break;
    }
  });
}

function newBlock(exId, ed) {
  var prev = previousSets(exId, ed.mode === 'routine' ? Infinity : ed.obj.start, ed.obj.id);
  var n = prev ? prev.length : (ed.mode === 'routine' ? 3 : 1);
  var sets = [];
  for (var i = 0; i < n; i++) {
    var s = { t: prev ? prev[i].t : 'n' };
    if (ed.mode === 'routine' && prev) ['w', 'r', 's', 'd'].forEach(function (k) { if (prev[i][k] != null) s[k] = prev[i][k]; });
    if (ed.mode === 'live') s.done = false;
    sets.push(s);
  }
  return { exId: exId, note: '', rest: null, sets: sets };
}

function blockMenu(bi, ed, changed, rerender) {
  var list = ed.obj.exercises;
  var items = [
    { label: '종목 교체', icon: 'swap', onClick: function () {
      openPicker({ multi: false, title: '종목 교체', onPick: function (ids) { list[bi].exId = ids[0]; changed(); } });
    } }
  ];
  if (bi > 0) items.push({ label: '위로 이동', icon: 'up', onClick: function () { list.splice(bi - 1, 0, list.splice(bi, 1)[0]); changed(); rerender(); } });
  if (bi < list.length - 1) items.push({ label: '아래로 이동', icon: 'dn', onClick: function () { list.splice(bi + 1, 0, list.splice(bi, 1)[0]); changed(); rerender(); } });
  items.push({ label: '종목 삭제', icon: 'trash', danger: true, onClick: function () { list.splice(bi, 1); changed(); rerender(); } });
  actionSheet(exName(list[bi].exId), items);
}

function toggleCheck(c, ed, el, changed) {
  var o = ed.obj, s = c.b.sets[c.j], type = exType(c.b.exId);
  if (s.done) {
    s.done = false; delete s.pr;
  } else {
    // 비어 있는 칸은 이전 기록(placeholder) 값으로 채운다 — 같은 무게로 반복할 때 바로 체크만 하면 되게
    var prev = previousSets(c.b.exId, o.start, o.id);
    var p = prev && prev[c.j];
    COLS[type].forEach(function (col) {
      var k = col.k === 'm' ? 's' : col.k;
      if (s[k] == null && p && p[k] != null) s[k] = p[k];
    });
    if (!setValid(s, type)) {
      toast(type === 't' ? '시간을 입력하세요' : type === 'dt' ? '거리나 시간을 입력하세요' : '횟수를 입력하세요');
      return;
    }
    s.done = true;
    // PR 판정 — 이전 기록이 있는 종목만 (처음 하는 종목은 표시 안 함)
    if (isWork(s)) {
      var hist = bestBefore(c.b.exId, o.start, o.id);
      var cur = 0, curW = 0;
      o.exercises.forEach(function (b) {
        if (b.exId !== c.b.exId) return;
        b.sets.forEach(function (x) { if (x !== s && x.done && isWork(x)) { cur = Math.max(cur, setScore(x, type)); curW = Math.max(curW, x.w || 0); } });
      });
      var sc = setScore(s, type);
      var isPr = hist.score > 0 && (sc > Math.max(hist.score, cur) || (type === 'wr' && (s.w || 0) > Math.max(hist.w, curW)));
      if (isPr) { s.pr = true; toast('🏆 개인 기록! ' + exName(c.b.exId) + ' ' + fmtSet(s, type), 3000); }
    }
    var rest = c.b.rest != null ? c.b.rest : data.settings.rest;
    if (rest > 0) startRest(rest);
  }
  changed();
  // 행만 다시 그리기 (포커스/스크롤 유지)
  var row = c.row;
  row.classList.toggle('done', !!s.done);
  row.querySelector('.check').classList.toggle('on', !!s.done);
  COLS[type].forEach(function (col) { var inp = row.querySelector('[data-k="' + col.k + '"]'); if (inp) inp.value = valOf(s, col.k); });
  var pv = row.querySelector('.prev');
  var prevS = previousSets(c.b.exId, o.start, o.id);
  pv.innerHTML = (s.pr ? icon('trophy', 13) : '') + esc(fmtSetShort(prevS && prevS[c.j], type));
}

// ---------- 휴식 타이머 ----------
function startRest(sec) {
  if (!active) return;
  active.restEnd = Date.now() + sec * 1000;
  active.restTotal = sec;
  saveActive();
  tickTimers();
}
function adjustRest(delta) {
  if (!active || !active.restEnd) return;
  active.restEnd += delta * 1000;
  active.restTotal = Math.max(1, active.restTotal + delta);
  if (active.restEnd <= Date.now()) { stopRest(); return; }
  saveActive(); tickTimers();
}
function stopRest() {
  if (!active) return;
  active.restEnd = 0; saveActive(); tickTimers();
}
function tickTimers() {
  var now = Date.now();
  var els = document.querySelectorAll('.js-elapsed');
  for (var i = 0; i < els.length; i++) els[i].textContent = active ? fmtTimer((now - active.start) / 1000) : '0:00';
  var resting = !!(active && active.restEnd);
  var remain = resting ? (active.restEnd - now) / 1000 : 0;
  if (resting && remain <= 0) {
    active.restEnd = 0; saveActive(); resting = false;
    restAlert();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.js-restbar'), function (b) { b.hidden = !resting; });
  Array.prototype.forEach.call(document.querySelectorAll('.js-resttime'), function (t) { t.textContent = fmtTimer(Math.ceil(remain)); });
  Array.prototype.forEach.call(document.querySelectorAll('.js-restprog'), function (p) {
    p.style.width = resting ? Math.max(0, Math.min(100, remain / active.restTotal * 100)) + '%' : '0';
  });
}
var audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}
function beep() {
  if (!audioCtx) return;
  try {
    [0, 0.25, 0.5].forEach(function (t) {
      var osc = audioCtx.createOscillator(), g = audioCtx.createGain();
      osc.frequency.value = 880; osc.connect(g); g.connect(audioCtx.destination);
      var at = audioCtx.currentTime + t;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
      osc.start(at); osc.stop(at + 0.2);
    });
  } catch (e) {}
}
function restAlert() {
  if (data.settings.sound) beep();
  if (data.settings.vibrate && navigator.vibrate) { try { navigator.vibrate([200, 100, 200]); } catch (e) {} }
  toast('휴식 끝! 다음 세트를 시작하세요');
}

// ---------- 저장 ----------
function structureChanged(routine, blocks) {
  if (routine.exercises.length !== blocks.length) return true;
  return routine.exercises.some(function (b, i) { return b.exId !== blocks[i].exId || b.sets.length !== blocks[i].sets.length; });
}
function finishLive(el, ed) {
  var o = ed.obj;
  var done = 0, skipped = 0;
  o.exercises.forEach(function (b) { b.sets.forEach(function (s) { if (s.done) done++; else if (hasValue(s)) skipped++; }); });
  if (!done) {
    toast('완료(✓) 체크한 세트가 없습니다');
    return;
  }
  var blocks = o.exercises.map(function (b) {
    return { exId: b.exId, note: (b.note || '').trim(), rest: b.rest, sets: b.sets.filter(function (s) { return s.done; }).map(cleanSet) };
  }).filter(function (b) { return b.sets.length && exById(b.exId); });
  var routine = o.routineId ? data.routines.find(function (r) { return r.id === o.routineId; }) : null;
  var t = liveTotals(o);
  var h = '<div class="sheet-title">운동 완료</div>' +
    '<div class="finish-stats"><div><small>시간</small><b>' + fmtDur((Date.now() - o.start) / 1000) + '</b></div>' +
    '<div><small>볼륨</small><b>' + fmtNum(t.vol) + 'kg</b></div><div><small>세트</small><b>' + t.sets + '</b></div></div>' +
    '<label class="field"><span>운동 이름</span><input class="input" id="fin-name" maxlength="40" value="' + esc(o.name) + '"></label>' +
    (skipped ? '<p class="sheet-note">완료 체크하지 않은 세트 ' + skipped + '개는 저장되지 않아요.</p>' : '') +
    (routine
      ? '<label class="check-line"><input type="checkbox" id="fin-routine"' + (structureChanged(routine, o.exercises) ? ' checked' : '') + '><span>루틴 ‘' + esc(routine.name) + '’에 이번 구성·무게 반영</span></label>'
      : '<label class="check-line"><input type="checkbox" id="fin-routine"><span>이 구성을 새 루틴으로도 저장</span></label>') +
    '<div class="sheet-row"><button class="btn btn-secondary" data-c="0">계속 운동</button><button class="btn btn-primary" data-c="1">저장</button></div>';
  showSheet(h, function (box) {
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]');
      if (!b) return;
      if (b.getAttribute('data-c') === '0') { hideSheet(); return; }
      var name = box.querySelector('#fin-name').value.trim() || defaultWorkoutName(o.start);
      var toRoutine = box.querySelector('#fin-routine').checked;
      hideSheet();
      var w = { id: o.id, name: name, routineId: o.routineId || '', start: o.start, end: Date.now(), note: (o.note || '').trim(), exercises: blocks };
      data.workouts.push(w);
      if (toRoutine) {
        // 루틴에는 편집기에 보이는 구성 그대로(이번에 건너뛴 종목·세트 포함) 반영한다 — 하루 빼먹었다고 루틴에서 사라지지 않게
        var tpl = o.exercises.filter(function (b) { return exById(b.exId); }).map(function (b) {
          return { exId: b.exId, note: (b.note || '').trim(), rest: b.rest, sets: b.sets.map(cleanSet) };
        });
        if (routine) routine.exercises = tpl;
        else { var nr = { id: uid(), name: name, exercises: tpl }; data.routines.push(nr); w.routineId = nr.id; }
      }
      active = null; saveActive();
      save();
      closePage(1, function () {
        switchTab('history');
        openWorkoutDetail(w.id);
        toast('운동을 저장했습니다 💪');
      });
    });
  });
}
function saveEdited(ed, page) {
  var o = ed.obj;
  var blocks = o.exercises.map(function (b) {
    return { exId: b.exId, note: (b.note || '').trim(), rest: b.rest, sets: b.sets.filter(hasValue).map(cleanSet) };
  }).filter(function (b) { return b.sets.length && exById(b.exId); });
  if (!blocks.length) { toast('세트를 하나 이상 입력하세요'); return; }
  var w = { id: o.id, name: (o.name || '').trim() || defaultWorkoutName(o.start), routineId: o.routineId || '', start: o.start, end: Math.max(o.start, o.end), note: (o.note || '').trim(), exercises: blocks };
  var idx = data.workouts.findIndex(function (x) { return x.id === w.id; });
  if (idx >= 0) data.workouts[idx] = w; else data.workouts.push(w);
  save();
  ed.dirty = false; page.forceClose = true;
  closePage(1, function () { toast(ed.isNew ? '운동을 추가했습니다' : '수정했습니다'); });
}
function saveRoutine(ed, page) {
  var o = ed.obj;
  var name = (o.name || '').trim();
  if (!name) { toast('루틴 이름을 입력하세요'); var inp = page.el.querySelector('[data-f="name"]'); if (inp) inp.focus(); return; }
  if (!o.exercises.length) { toast('종목을 하나 이상 추가하세요'); return; }
  var r = { id: o.id, name: name, exercises: o.exercises.filter(function (b) { return exById(b.exId); }).map(function (b) {
    return { exId: b.exId, note: (b.note || '').trim(), rest: b.rest, sets: b.sets.map(cleanSet) };
  }) };
  var idx = data.routines.findIndex(function (x) { return x.id === r.id; });
  if (idx >= 0) data.routines[idx] = r; else data.routines.push(r);
  save();
  ed.dirty = false; page.forceClose = true;
  closePage(1, function () { toast('루틴을 저장했습니다'); });
}
