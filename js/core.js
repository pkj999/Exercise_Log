'use strict';
/* =========================================================================
 * 운동일지 — Hevy를 참고해 재설계한 가벼운 개인 운동 기록 앱 (2026-11)
 *
 * [파일 구성] (index.html의 로드 순서)
 *   core.js     상태·스키마·공용 유틸·화면(페이지) 스택·시트
 *   store.js    저장소 어댑터 (로컬 / GitHub 동기화)
 *   editor.js   운동 편집기 — 진행 중 운동 · 지난 운동 추가/수정 · 루틴 편집을 한 화면으로 처리
 *   picker.js   종목 선택/생성
 *   screens.js  탭 화면 — 운동(루틴) · 기록 · 종목 · 설정
 *   main.js     초기화
 *
 * [데이터 구조]  (STORAGE_KEY 하나에 전부 저장)
 *   exercises = [{ id, name, muscle, type }]        type: wr(무게×횟수) r(횟수) t(시간) dt(거리+시간)
 *   routines  = [{ id, name, exercises: [Block] }]
 *   workouts  = [{ id, name, routineId, start, end, note, exercises: [Block] }]   start/end = ms
 *   Block     = { exId, note, rest, sets: [Set] }
 *   Set       = { t, w, r, s, d }   t: n(일반) w(워밍업) d(드롭) f(실패)
 *               w=kg, r=횟수, s=초, d=km — 종목 type에 맞는 값만 채움
 *   settings  = { rest, sound, vibrate, theme }
 *   진행 중인 운동은 ACTIVE_KEY(이 기기 로컬)에만 두고, 완료할 때 workouts에 들어간다.
 * ========================================================================= */

// 수정할 때마다 버전 +1, 날짜는 수정 반영일로 갱신 (설정 탭 하단에 표시)
var APP_VERSION = 46;
var APP_BUILD_DATE = '2026-11-20';

var STORAGE_KEY = 'exercise-log-v1';
var ACTIVE_KEY = 'exercise-log-active';
// 재설계 전 구버전 앱이 쓰던 로컬 키 — 첫 실행 때 지워서 저장 공간을 비운다 (GitHub 연결 정보 wt-github-cfg는 유지)
var OLD_KEYS = ['workout-tracker-data', 'workout-tracker-draft', 'workout-tracker-timer-end',
  'workout-log-v3', 'workout-log-v2', 'workout-log', 'wt-github-cache', 'wt-github-cache-at', 'wt-github-pending'];

var MUSCLES = ['가슴', '등', '어깨', '하체', '팔', '코어', '유산소', '전신', '기타'];
var TYPES = {
  wr: '무게 × 횟수',
  r: '횟수 (맨몸)',
  t: '시간',
  dt: '거리 + 시간'
};
var SET_TYPES = [
  { key: 'n', label: '일반', badge: '' },
  { key: 'w', label: '워밍업', badge: 'W' },
  { key: 'd', label: '드롭 세트', badge: 'D' },
  { key: 'f', label: '실패 지점', badge: 'F' }
];
var REST_OPTIONS = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];

var data = emptyData();

function emptyData() {
  return {
    v: 1, exercises: [], routines: [], workouts: [],
    settings: { rest: 90, sound: true, vibrate: true, theme: 'auto' }
  };
}

// ---------- 공용 유틸 ----------
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function num(v) { var n = Number(v); return (v === '' || v == null || !isFinite(n)) ? null : n; }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtDate(d) { d = new Date(d); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function fmtKoDate(ms) {
  var d = new Date(ms);
  return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + '일월화수목금토'[d.getDay()] + ')';
}
function fmtClock(ms) { var d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function fmtNum(n) { return (Math.round(n * 10) / 10).toLocaleString('ko-KR'); }
// 초 → "1:05:09" / "5:09"
function fmtTimer(sec) {
  sec = Math.max(0, Math.floor(sec));
  var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + pad2(m) : m) + ':' + pad2(s);
}
// 초 → "1시간 5분" / "45초"
function fmtDur(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return sec + '초';
  var h = Math.floor(sec / 3600), m = Math.round(sec % 3600 / 60);
  if (m === 60) { h += 1; m = 0; }
  return h ? h + '시간' + (m ? ' ' + m + '분' : '') : m + '분';
}
function fmtRest(sec) { return sec ? (sec >= 60 ? Math.floor(sec / 60) + '분' + (sec % 60 ? ' ' + sec % 60 + '초' : '') : sec + '초') : '끔'; }

// ---------- 계산 ----------
function exById(id) {
  for (var i = 0; i < data.exercises.length; i++) if (data.exercises[i].id === id) return data.exercises[i];
  return null;
}
function exName(id) { var e = exById(id); return e ? e.name : '(삭제된 종목)'; }
function exType(id) { var e = exById(id); return e ? e.type : 'wr'; }
function e1rm(w, r) { return (w > 0 && r > 0) ? (r === 1 ? w : w * (1 + r / 30)) : 0; }
function isWork(s) { return s.t !== 'w'; }
function setVolume(s) { return isWork(s) ? (s.w || 0) * (s.r || 0) : 0; }
function workoutVolume(w) {
  var v = 0;
  w.exercises.forEach(function (b) { b.sets.forEach(function (s) { v += setVolume(s); }); });
  return v;
}
function workoutSetCount(w) {
  var n = 0; w.exercises.forEach(function (b) { n += b.sets.length; }); return n;
}
function workoutDuration(w) { return w.end > w.start ? (w.end - w.start) / 1000 : 0; }
// 세트 한 줄 요약 — 종목 type에 따라
function fmtSet(s, type) {
  if (type === 'r') return (s.r || 0) + '회' + (s.w ? ' (+' + fmtNum(s.w) + 'kg)' : '');
  if (type === 't') return fmtDur(s.s);
  if (type === 'dt') return (s.d ? fmtNum(s.d) + 'km · ' : '') + fmtDur(s.s);
  return fmtNum(s.w || 0) + 'kg × ' + (s.r || 0);
}
// 세트의 "좋음" 점수 — 최고 세트 고르기/PR 판정용
function setScore(s, type) {
  if (!isWork(s)) return 0;
  if (type === 'wr') return e1rm(s.w || 0, s.r || 0);
  if (type === 'r') return s.r || 0;
  if (type === 't') return s.s || 0;
  if (type === 'dt') return s.d || s.s || 0;
  return 0;
}
function bestSet(sets, type) {
  var best = null, bs = -1;
  sets.forEach(function (s) { var sc = setScore(s, type); if (sc > bs) { bs = sc; best = s; } });
  return best;
}
function sortedWorkouts() { return data.workouts.slice().sort(function (a, b) { return b.start - a.start; }); }
// 해당 시각 이전, 이 종목을 마지막으로 한 운동의 세트 (이전 기록 칸에 표시)
function previousSets(exId, beforeMs, excludeId) {
  var best = null;
  data.workouts.forEach(function (w) {
    if (w.id === excludeId || w.start >= beforeMs) return;
    if (best && w.start <= best.start) return;
    if (w.exercises.some(function (b) { return b.exId === exId; })) best = w;
  });
  if (!best) return null;
  var sets = [];
  best.exercises.forEach(function (b) { if (b.exId === exId) sets = sets.concat(b.sets); });
  return sets;
}
// 이 시각 이전의 이 종목 최고 기록 { score, w } — PR 판정용
function bestBefore(exId, beforeMs, excludeId) {
  var type = exType(exId), score = 0, w = 0;
  data.workouts.forEach(function (wk) {
    if (wk.id === excludeId || wk.start >= beforeMs) return;
    wk.exercises.forEach(function (b) {
      if (b.exId !== exId) return;
      b.sets.forEach(function (s) {
        if (!isWork(s)) return;
        score = Math.max(score, setScore(s, type));
        if (type === 'wr') w = Math.max(w, s.w || 0);
      });
    });
  });
  return { score: score, w: w };
}
function exerciseUseCount(exId) {
  var n = 0;
  data.workouts.forEach(function (w) { if (w.exercises.some(function (b) { return b.exId === exId; })) n++; });
  return n;
}
function routineUseCount(exId) {
  return data.routines.filter(function (r) { return r.exercises.some(function (b) { return b.exId === exId; }); }).length;
}

// ---------- 불러오기 · 정리 · 저장 ----------
function cleanSet(s) {
  s = s || {};
  var out = { t: ['n', 'w', 'd', 'f'].indexOf(s.t) >= 0 ? s.t : 'n' };
  ['w', 'r', 's', 'd'].forEach(function (k) { var n = num(s[k]); if (n != null && n >= 0) out[k] = n; });
  return out;
}
function cleanBlock(b) {
  return {
    exId: String((b && b.exId) || ''),
    note: typeof (b && b.note) === 'string' ? b.note.slice(0, 200) : '',
    rest: num(b && b.rest) != null ? Math.min(600, Math.max(0, num(b.rest))) : null,
    sets: Array.isArray(b && b.sets) ? b.sets.map(cleanSet) : []
  };
}
function normalize(o) {
  var d = emptyData();
  if (!o || typeof o !== 'object') return d;
  d.exercises = (Array.isArray(o.exercises) ? o.exercises : []).filter(function (e) { return e && e.id && e.name; }).map(function (e) {
    return {
      id: String(e.id), name: String(e.name).trim().slice(0, 40),
      muscle: MUSCLES.indexOf(e.muscle) >= 0 ? e.muscle : '기타',
      type: TYPES[e.type] ? e.type : 'wr'
    };
  });
  d.routines = (Array.isArray(o.routines) ? o.routines : []).filter(Boolean).map(function (r) {
    return { id: String(r.id || uid()), name: String(r.name || '루틴').slice(0, 40), exercises: (r.exercises || []).map(cleanBlock) };
  });
  d.workouts = (Array.isArray(o.workouts) ? o.workouts : []).filter(function (w) { return w && num(w.start); }).map(function (w) {
    return {
      id: String(w.id || uid()), name: String(w.name || '운동').slice(0, 40),
      routineId: w.routineId ? String(w.routineId) : '',
      start: num(w.start), end: num(w.end) || num(w.start),
      note: typeof w.note === 'string' ? w.note.slice(0, 1000) : '',
      exercises: (w.exercises || []).map(cleanBlock)
    };
  });
  var s = o.settings || {};
  d.settings.rest = num(s.rest) != null ? Math.min(600, Math.max(0, num(s.rest))) : 90;
  d.settings.sound = s.sound !== false;
  d.settings.vibrate = s.vibrate !== false;
  d.settings.theme = ['auto', 'light', 'dark'].indexOf(s.theme) >= 0 ? s.theme : 'auto';
  return d;
}
async function loadData() {
  try {
    var res = await store.get(STORAGE_KEY);
    if (res && res.value) data = normalize(JSON.parse(res.value));
  } catch (e) {
    if (store.mode === 'github') toast('GitHub에서 불러오지 못했습니다 — ' + (e.message || ''), 4000);
  }
}
async function persist() {
  try { await store.set(STORAGE_KEY, JSON.stringify(data)); }
  catch (e) {
    toast('저장에 실패했습니다 — ' + (e.message || '알 수 없는 오류'), 4000);
    throw e;
  }
}
function save() { persist().catch(function () {}); }

// ---------- 아이콘 ----------
var ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 13l4.5 4.5L19 7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1" fill="currentColor"/><circle cx="3.5" cy="12" r="1" fill="currentColor"/><circle cx="3.5" cy="18" r="1" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 1 0-3-3L5 17v3z"/>',
  trash: '<path d="M4 7h16M9.5 4h5M10 11v6M14 11v6M6 7l1 13h10l1-13"/>',
  cal: '<rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M3.5 10.5h17M8.5 3v5M15.5 3v5"/>',
  copy: '<rect x="9" y="9" width="10.5" height="10.5" rx="2.5"/><path d="M4.5 15V7a2.5 2.5 0 0 1 2.5-2.5h8"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  dn: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  note: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  refresh: '<path d="M21 4v6h-6"/><path d="M3 20v-6h6"/><path d="M5.5 9a8 8 0 0 1 13.2-3L21 10M3 14l2.3 4A8 8 0 0 0 18.5 15"/>'
};
function icon(name, size) {
  size = size || 18;
  return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

// ---------- 토스트 ----------
var toastTimer = null;
function toast(msg, ms) {
  var el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
}

// ---------- 페이지 스택 (전체 화면으로 올라오는 화면들) ----------
// 각 페이지는 history 항목 하나와 짝을 이룬다 — 안드로이드/브라우저 뒤로가기로 닫을 수 있게.
// 닫을 때는 항상 closePage()(= history.back())를 거치고, 실제 제거는 popstate에서 한다.
var pages = [];
function pushPage(render) {
  var el = document.createElement('div');
  el.className = 'page';
  $('pages').appendChild(el);
  var page = { el: el, render: function () { var st = el.scrollTop; render(el, page); el.scrollTop = st; } };
  pages.push(page);
  page.render();
  requestAnimationFrame(function () { el.classList.add('in'); });
  history.pushState({ depth: pages.length }, '');
  document.body.classList.add('noscroll');
  return page;
}
// then: 페이지가 실제로 닫힌 뒤(popstate 처리 후) 실행할 함수
var afterPop = [];
function closePage(n, then) { if (then) afterPop.push(then); history.go(-(n || 1)); }
function topPage() { return pages[pages.length - 1]; }
window.addEventListener('popstate', function () {
  if (sheetOpen) hideSheet();
  var depth = (history.state && history.state.depth) || 0;
  // 저장 안 한 변경사항이 있는 페이지(guard)는 확인창을 띄우고 닫기를 되돌린다
  var tp = topPage();
  if (tp && pages.length > depth && tp.guard && !tp.forceClose && tp.guard()) {
    history.pushState({ depth: pages.length }, '');
    afterPop = [];
    return;
  }
  while (pages.length > depth) {
    var p = pages.pop();
    if (p.onClose) p.onClose();
    var el = p.el;
    el.classList.remove('in');
    setTimeout(function (x) { return function () { x.remove(); }; }(el), 220);
  }
  if (!pages.length) document.body.classList.remove('noscroll');
  var t = topPage();
  if (t) t.render(); else refreshTab();
  refreshChrome();
  var fns = afterPop; afterPop = [];
  fns.forEach(function (fn) { fn(); });
});
function pageHeader(opts) {
  return '<header class="page-head">' +
    '<button class="icon-btn" ' + (opts.backAttr || 'data-act="page-back"') + ' aria-label="뒤로">' + icon(opts.backIcon || 'back', 22) + '</button>' +
    '<div class="page-title">' + (opts.titleHtml || esc(opts.title || '')) + '</div>' +
    '<div class="page-right">' + (opts.right || '') + '</div></header>';
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-act="page-back"]');
  if (b) closePage();
});

// ---------- 시트 (아래에서 올라오는 메뉴 / 확인창) ----------
var sheetOpen = false;
// items: [{ label, icon, danger, onClick }]
function actionSheet(title, items) {
  var html = (title ? '<div class="sheet-title">' + esc(title) + '</div>' : '') +
    items.map(function (it, i) {
      return '<button class="sheet-item' + (it.danger ? ' danger' : '') + (it.active ? ' active' : '') + '" data-i="' + i + '">' +
        (it.icon ? icon(it.icon, 18) : '') + '<span>' + esc(it.label) + '</span>' + (it.active ? icon('check', 16) : '') + '</button>';
    }).join('') +
    '<button class="sheet-item cancel" data-i="-1">취소</button>';
  showSheet(html, function (box) {
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i]');
      if (!b) return;
      var i = Number(b.getAttribute('data-i'));
      hideSheet();
      if (i >= 0 && items[i].onClick) items[i].onClick();
    });
  });
}
function confirmSheet(msg, okLabel, onOk, opts) {
  opts = opts || {};
  showSheet('<div class="sheet-msg">' + esc(msg) + '</div>' +
    '<div class="sheet-row"><button class="btn btn-secondary" data-c="0">' + esc(opts.cancelLabel || '취소') + '</button>' +
    '<button class="btn ' + (opts.danger === false ? 'btn-primary' : 'btn-danger') + '" data-c="1">' + esc(okLabel) + '</button></div>',
  function (box) {
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]');
      if (!b) return;
      hideSheet();
      if (b.getAttribute('data-c') === '1') onOk();
      else if (opts.onCancel) opts.onCancel();
    });
  });
}
function showSheet(html, bind) {
  var box = $('sheet-box');
  box.innerHTML = html;
  var fresh = box.cloneNode(true); // 이전 리스너 제거
  box.parentNode.replaceChild(fresh, box);
  $('sheet').classList.add('show');
  sheetOpen = true;
  if (bind) bind(fresh);
}
function hideSheet() {
  $('sheet').classList.remove('show');
  sheetOpen = false;
}
$('sheet-backdrop').addEventListener('click', hideSheet);

// ---------- 테마 ----------
var darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function applyTheme() {
  var t = data.settings.theme;
  var dark = t === 'dark' || (t === 'auto' && darkMQ && darkMQ.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0E0F11' : '#F4F5F7');
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', applyTheme);
