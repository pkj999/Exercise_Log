'use strict';
// =========================================================================
// 종목 선택 · 종목 만들기/수정
// 기본 종목 목록(더미 데이터)은 없다 — 쓰는 종목만 직접 만들어서 쓴다.
// 검색어와 일치하는 종목이 없으면 그 이름으로 바로 만들 수 있다.
// =========================================================================

function normName(v) { return String(v || '').toLowerCase().replace(/\s+/g, ''); }
function lastUsedMap() {
  var m = {};
  data.workouts.forEach(function (w) { w.exercises.forEach(function (b) { if (!m[b.exId] || m[b.exId] < w.start) m[b.exId] = w.start; }); });
  return m;
}
function filterExercises(q, muscle) {
  var nq = normName(q), used = lastUsedMap();
  return data.exercises.filter(function (e) {
    return (!muscle || e.muscle === muscle) && (!nq || normName(e.name).indexOf(nq) >= 0);
  }).sort(function (a, b) {
    return (used[b.id] || 0) - (used[a.id] || 0) || a.name.localeCompare(b.name, 'ko');
  });
}

// opts: { multi, title, onPick(ids) }
function openPicker(opts) {
  var st = { q: '', muscle: '', sel: [] };
  var page = pushPage(function (el) {
    el.innerHTML = pageHeader({
      title: opts.title || '종목 추가',
      right: opts.multi ? '<button class="btn btn-primary btn-sm js-pick-add" data-p="add" disabled>추가</button>' : ''
    }) +
      '<div class="page-body">' +
      '<div class="search"><span class="search-icon">' + icon('search', 17) + '</span>' +
      '<input class="input" data-p="q" placeholder="종목 검색 또는 새 이름" autocomplete="off" value="' + esc(st.q) + '"></div>' +
      '<div class="chips js-muscles"></div>' +
      '<div class="js-list"></div></div>';
    renderPickerList(el, st, opts);
  });
  var el = page.el;
  el.addEventListener('input', function (e) {
    if (e.target.getAttribute('data-p') === 'q') { st.q = e.target.value; renderPickerList(el, st, opts); }
  });
  el.addEventListener('click', function (e) {
    var b = e.target.closest('[data-p]');
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-p');
    if (act === 'muscle') { st.muscle = b.getAttribute('data-m'); renderPickerList(el, st, opts); }
    else if (act === 'row') {
      var id = b.getAttribute('data-id');
      if (!opts.multi) { opts.onPick([id]); closePage(); return; }
      var k = st.sel.indexOf(id);
      if (k >= 0) st.sel.splice(k, 1); else st.sel.push(id);
      renderPickerList(el, st, opts);
    } else if (act === 'add') {
      if (!st.sel.length) return;
      opts.onPick(st.sel.slice()); closePage();
    } else if (act === 'create') {
      openExerciseForm(null, st.q.trim(), function (ex) {
        if (!opts.multi) { opts.onPick([ex.id]); closePage(); return; }
        st.sel.push(ex.id); st.q = ''; st.muscle = '';
        var inp = el.querySelector('[data-p="q"]'); if (inp) inp.value = '';
        renderPickerList(el, st, opts);
      });
    }
  });
}
function renderPickerList(el, st, opts) {
  var used = {};
  data.exercises.forEach(function (e) { used[e.muscle] = 1; });
  var ms = MUSCLES.filter(function (m) { return used[m]; });
  el.querySelector('.js-muscles').innerHTML = ms.length > 1
    ? ['<button class="chip' + (!st.muscle ? ' on' : '') + '" data-p="muscle" data-m="">전체</button>'].concat(ms.map(function (m) {
      return '<button class="chip' + (st.muscle === m ? ' on' : '') + '" data-p="muscle" data-m="' + m + '">' + m + '</button>';
    })).join('') : '';
  var list = filterExercises(st.q, st.muscle);
  var exact = data.exercises.some(function (e) { return normName(e.name) === normName(st.q); });
  var h = '';
  if (!data.exercises.length) h += '<p class="hint">아직 만든 종목이 없어요. 아래에서 첫 종목을 만들어 보세요.</p>';
  else if (!list.length) h += '<p class="hint">검색 결과가 없어요.</p>';
  h += '<div class="list">' + list.map(function (e) {
    var on = st.sel.indexOf(e.id) >= 0;
    return '<button class="list-row' + (on ? ' on' : '') + '" data-p="row" data-id="' + e.id + '">' +
      '<span class="ex-avatar">' + esc(e.name.charAt(0)) + '</span>' +
      '<span class="list-main"><b>' + esc(e.name) + '</b><small>' + e.muscle + ' · ' + TYPES[e.type] + '</small></span>' +
      (opts.multi ? '<span class="tick">' + (on ? icon('check', 16) : '') + '</span>' : '') + '</button>';
  }).join('') + '</div>';
  h += '<button class="btn btn-secondary btn-block" data-p="create">' + icon('plus', 17) +
    (st.q.trim() && !exact ? '‘' + esc(st.q.trim()) + '’ 새 종목으로 만들기' : '새 종목 만들기') + '</button>';
  el.querySelector('.js-list').innerHTML = h;
  var addBtn = el.querySelector('.js-pick-add');
  if (addBtn) { addBtn.disabled = !st.sel.length; addBtn.textContent = st.sel.length ? '추가 (' + st.sel.length + ')' : '추가'; }
}

// 종목 만들기/수정 시트. ex가 있으면 수정, 없으면 새로 만들기
function openExerciseForm(ex, presetName, onSaved) {
  var used = ex ? exerciseUseCount(ex.id) : 0;
  var inRoutine = ex ? routineUseCount(ex.id) : 0;
  var cur = { muscle: ex ? ex.muscle : '', type: ex ? ex.type : 'wr' };
  function chips(list, key, labels) {
    return list.map(function (v) {
      var dis = key === 'type' && used > 0 && v !== cur.type;
      return '<button class="chip' + (cur[key] === v ? ' on' : '') + '" data-' + key + '="' + v + '"' + (dis ? ' disabled' : '') + '>' + (labels ? labels[v] : v) + '</button>';
    }).join('');
  }
  var h = '<div class="sheet-title">' + (ex ? '종목 수정' : '새 종목') + '</div>' +
    '<label class="field"><span>이름</span><input class="input" id="exf-name" maxlength="40" placeholder="예: 벤치프레스" value="' + esc(ex ? ex.name : presetName || '') + '"></label>' +
    '<div class="field"><span>부위</span><div class="chips wrap js-muscle">' + chips(MUSCLES, 'muscle') + '</div></div>' +
    '<div class="field"><span>기록 방식</span><div class="chips wrap js-type">' + chips(Object.keys(TYPES), 'type', TYPES) + '</div>' +
    (used ? '<small class="field-note">기록이 있는 종목이라 기록 방식은 바꿀 수 없어요.</small>' : '') + '</div>' +
    '<p class="sheet-note js-exf-err" hidden></p>' +
    '<div class="sheet-row"><button class="btn btn-secondary" data-x="cancel">취소</button><button class="btn btn-primary" data-x="save">' + (ex ? '저장' : '만들기') + '</button></div>' +
    (ex ? '<button class="btn btn-text-danger btn-block" data-x="delete">종목 삭제</button>' : '');
  showSheet(h, function (box) {
    var err = box.querySelector('.js-exf-err');
    function fail(msg) { err.textContent = msg; err.hidden = false; }
    box.addEventListener('click', function (e) {
      var m = e.target.closest('[data-muscle]'), t = e.target.closest('[data-type]'), x = e.target.closest('[data-x]');
      if (m) { cur.muscle = m.getAttribute('data-muscle'); box.querySelector('.js-muscle').innerHTML = chips(MUSCLES, 'muscle'); return; }
      if (t && !t.disabled) { cur.type = t.getAttribute('data-type'); box.querySelector('.js-type').innerHTML = chips(Object.keys(TYPES), 'type', TYPES); return; }
      if (!x) return;
      var act = x.getAttribute('data-x');
      if (act === 'cancel') { hideSheet(); return; }
      if (act === 'delete') {
        if (used) { fail('운동 기록 ' + used + '개에 쓰인 종목이라 삭제할 수 없어요. 이름은 바꿀 수 있어요.'); return; }
        hideSheet();
        confirmSheet('‘' + ex.name + '’ 종목을 삭제할까요?' + (inRoutine ? ' 루틴 ' + inRoutine + '개에서도 빠집니다.' : ''), '삭제', function () {
          data.routines.forEach(function (r) { r.exercises = r.exercises.filter(function (b) { return b.exId !== ex.id; }); });
          data.exercises = data.exercises.filter(function (e2) { return e2.id !== ex.id; });
          save();
          if (onSaved) onSaved(null);
        });
        return;
      }
      var name = box.querySelector('#exf-name').value.trim();
      if (!name) { fail('이름을 입력하세요.'); return; }
      if (!cur.muscle) { fail('부위를 선택하세요.'); return; }
      var dup = data.exercises.some(function (e2) { return (!ex || e2.id !== ex.id) && normName(e2.name) === normName(name); });
      if (dup) { fail('같은 이름의 종목이 이미 있어요.'); return; }
      var target = ex;
      if (target) { target.name = name; target.muscle = cur.muscle; target.type = cur.type; }
      else { target = { id: uid(), name: name, muscle: cur.muscle, type: cur.type }; data.exercises.push(target); }
      save();
      hideSheet();
      if (onSaved) onSaved(target);
    });
    var nameInp = box.querySelector('#exf-name');
    if (!ex && !presetName) setTimeout(function () { nameInp.focus(); }, 250);
  });
}
