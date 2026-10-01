'use strict';

  // ---------- [저장] 데이터 불러오기·저장·임시저장 ----------
  async function loadData() {
    try {
      var res = await store.get(STORAGE_KEY);
      if (res && res.value) { applyLoaded(JSON.parse(res.value)); return; }
    } catch (e) {}
    for (var i = 0; i < LEGACY_KEYS.length; i++) {
      try {
        var legacy = await store.get(LEGACY_KEYS[i]);
        if (legacy && legacy.value) {
          applyLoaded(JSON.parse(legacy.value));
          await persist();
          return;
        }
      } catch (e) {}
    }
  }
  // 같은 날 같은 종목이 여러 항목으로 나뉜 경우 하나로 합침
  function mergeDupExercises(list) {
    var out = [], idx = {};
    (list || []).forEach(function (ex) {
      var key = (ex.category || '기타') + '\u0000' + ex.name + '\u0000' + (ex.variant || '');
      if (idx[key] === undefined) { idx[key] = out.length; out.push(ex); }
      else { out[idx[key]].sets = (out[idx[key]].sets || []).concat(ex.sets || []); }
    });
    return out;
  }

  // GitHub 최초 연결 시 — 연결 전 이 기기에만 있던 기록(localDays)을, 방금 불러온 원격 기록
  // 배열(days)에 병합한다. 날짜가 없으면 그 날 통째로 추가, 있으면 종목 단위로 중복 여부만
  // 확인해서 새 것만 추가 (텍스트 백업 "합치기"와 같은 방식의 중복 판정)
  function mergeLocalDaysInto(days, localDays) {
    var addedDays = 0, addedEx = 0;
    localDays.forEach(function (inDay) {
      var mine = days.find(function (d) { return d.date === inDay.date; });
      if (!mine) {
        days.push(JSON.parse(JSON.stringify(inDay)));
        addedDays += 1;
        addedEx += (inDay.exercises || []).length;
        return;
      }
      (inDay.exercises || []).forEach(function (inEx) {
        var dup = mine.exercises.some(function (myEx) {
          return myEx.name === inEx.name && (myEx.variant || '') === (inEx.variant || '') &&
            JSON.stringify(myEx.sets) === JSON.stringify(inEx.sets);
        });
        if (!dup) { mine.exercises.push(JSON.parse(JSON.stringify(inEx))); addedEx += 1; }
      });
    });
    days.forEach(function (d) { d.exercises = mergeDupExercises(d.exercises); });
    return { addedDays: addedDays, addedEx: addedEx };
  }

  function applyLoaded(obj) {
    data.days = Array.isArray(obj.days) ? obj.days.map(function (d) {
      return {
        date: d.date,
        durationMin: (isFinite(Number(d.durationMin)) && Number(d.durationMin) > 0) ? Math.min(1440, Math.round(Number(d.durationMin))) : 0,
        startedAt: Number(d.startedAt) > 0 ? Number(d.startedAt) : 0,
        endedAt: Number(d.endedAt) > 0 ? Number(d.endedAt) : 0,
        exercises: (d.exercises || []).map(function (ex) {
          return {
            name: ex.name,
            category: ex.category || '기타',
            variant: (typeof ex.variant === 'string') ? ex.variant.trim().slice(0, 16) : '',
            sets: (ex.sets || []).map(function (s) {
              var out = {
                weight: Number(s.weight) || 0,
                reps: Number(s.reps) || 0,
                warmup: !!s.warmup
              };
              if (s.note) out.note = s.note;
              if (s.rpe) out.rpe = s.rpe;
              if (s.bwLoad) { out.bw = true; out.bwLoad = Number(s.bwLoad) || 0; }
              if (Array.isArray(s.tags) && s.tags.length) {
                out.tags = s.tags.map(function (t) { return String(t); }).slice(0, 8);
              }
              if (s.cardio) {
                out.cardio = true;
                out.minutes = Number(s.minutes) || 0;
                out.intensity = Number(s.intensity) || 0;
                if (s.distance) out.distance = Number(s.distance) || 0;
              }
              return out;
            })
          };
        })
      };
    }) : [];
    data.days.forEach(function (d) { d.exercises = mergeDupExercises(d.exercises); });
    data.customExercises = obj.customExercises || {};
    data.hiddenExercises = obj.hiddenExercises || {};
    data.restSeconds = Number(obj.restSeconds) > 0 ? Number(obj.restSeconds) : 90;
    data.sound = obj.sound !== false;
    data.vibrate = obj.vibrate !== false;
    data.dark = !!obj.dark;
    data.heightCm = Number(obj.heightCm) > 0 ? Number(obj.heightCm) : 0;
    data.weightKg = Number(obj.weightKg) > 0 ? Number(obj.weightKg) : 0;
    data.weeklyGoal = Math.min(7, Math.max(0, Math.round(Number(obj.weeklyGoal) || 0)));
    data.historyOpen = !!obj.historyOpen;
    data.proteinOpen = !!obj.proteinOpen;
    data.bwExercises = {};
    if (obj.bwExercises && typeof obj.bwExercises === 'object') {
      Object.keys(obj.bwExercises).forEach(function (k) {
        var v = Number(obj.bwExercises[k]);
        if (isFinite(v) && v > 0) data.bwExercises[k] = Math.min(150, Math.max(5, Math.round(v)));
      });
    }
    data.protein = { targetG: 0, targetAuto: true, goalDirection: 'maintain', logs: {} };
    if (obj.protein && typeof obj.protein === 'object') {
      var pg = Number(obj.protein.targetG);
      data.protein.targetG = (isFinite(pg) && pg > 0 && pg <= LIMITS.proteinTarget) ? Math.round(pg) : 0;
      data.protein.targetAuto = obj.protein.targetAuto !== false;
      var dir = obj.protein.goalDirection;
      data.protein.goalDirection = (dir === 'cut' || dir === 'bulk') ? dir : 'maintain';
      if (obj.protein.logs && typeof obj.protein.logs === 'object') {
        Object.keys(obj.protein.logs).forEach(function (dateKey) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
          var arr = obj.protein.logs[dateKey];
          if (!Array.isArray(arr)) return;
          var cleaned = arr.map(function (it) {
            if (!it || typeof it !== 'object') return null;
            var g = Number(it.grams);
            if (!isFinite(g) || g <= 0 || g > LIMITS.proteinMeal) return null;
            var label = (typeof it.label === 'string' && it.label.trim()) ? it.label.trim().slice(0, 20) : '끼니';
            return { id: typeof it.id === 'string' ? it.id : uid(), label: label, grams: Math.round(g) };
          }).filter(Boolean);
          if (cleaned.length) data.protein.logs[dateKey] = cleaned;
        });
      }
    }
    data.customProteinLabels = Array.isArray(obj.customProteinLabels)
      ? obj.customProteinLabels.map(function (l) { return String(l).trim().slice(0, 10); }).filter(Boolean).slice(0, 30)
      : [];
    data.hiddenProteinLabels = Array.isArray(obj.hiddenProteinLabels)
      ? obj.hiddenProteinLabels.map(function (l) { return String(l).trim().slice(0, 10); }).filter(Boolean)
      : [];
    data.proteinLabelGrams = {};
    if (obj.proteinLabelGrams && typeof obj.proteinLabelGrams === 'object') {
      Object.keys(obj.proteinLabelGrams).forEach(function (l) {
        var g = Number(obj.proteinLabelGrams[l]);
        if (isFinite(g) && g > 0 && g <= LIMITS.proteinMeal) data.proteinLabelGrams[l.slice(0, 10)] = Math.round(g);
      });
    }
    data.schema = SCHEMA;
  }
  async function persist() {
    try { await store.set(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) {
      showError('저장에 실패했습니다.');
      // showError()는 기록(log) 탭의 #form-error에만 나타나서, 다른 탭(설정 등)에서
      // persist()를 호출한 경우엔 사용자가 실패를 아예 못 볼 수 있었다. toast는 탭과
      // 무관하게 항상 보이므로, 코드 곳곳에서 await/catch 없이 그냥 persist()만
      // 호출해도(다크모드 전환 등) 실패가 조용히 묻히지 않도록 여기서 한 번 더 알린다.
      // 실제 이유(e.message)를 그대로 보여준다 — "인터넷 연결을 확인해주세요"로 뭉뚱그리면
      // 진짜 원인(예: GitHub 요청 제한, 토큰 문제)이 인터넷 문제로 오인돼 엉뚱한 곳을 고치게 됨.
      toast('저장에 실패했습니다 — ' + (e.message || '알 수 없는 오류'), 3500);
      // 그래도 다시 던져서, 호출한 쪽이 await/catch로 더 구체적인 안내를 하고 싶다면
      // 할 수 있게 둔다(예: GitHub 연결 화면의 개별 실패 메시지)
      throw e;
    }
  }

  // 저장 전 임시 기록 보관 — 앱을 닫아도 유지됨
  function saveDraft() {
    try {
      var payload = {
        date: $('entry-date').value, staging: staging,
        session: { startAt: sessionStartAt, lastAt: sessionLastAt, accumMs: sessionAccumMs }
      };
      if (!staging.length) { store.set(DRAFT_KEY, ''); return; }
      store.set(DRAFT_KEY, JSON.stringify(payload));
    } catch (e) {}
  }
  async function loadDraft() {
    try {
      var res = await store.get(DRAFT_KEY);
      if (!res || !res.value) return;
      var d = JSON.parse(res.value);
      if (!d || !Array.isArray(d.staging) || !d.staging.length) return;
      staging = d.staging.map(function (item) {
        return {
          category: item.category, name: item.name, variant: item.variant || '',
          sets: (item.sets || []).map(function (x) { return x; })
        };
      });
      if (d.date) $('entry-date').value = d.date;
      if (d.session && typeof d.session === 'object') {
        sessionStartAt = Number(d.session.startAt) > 0 ? Number(d.session.startAt) : null;
        sessionLastAt = Number(d.session.lastAt) > 0 ? Number(d.session.lastAt) : null;
        sessionAccumMs = Number(d.session.accumMs) > 0 ? Math.min(SESSION_MAX_ACCUM_MS, Number(d.session.accumMs)) : 0;
      }
    } catch (e) {}
  }
  function clearDraft() { try { store.set(DRAFT_KEY, ''); } catch (e) {} }

  function showError(msg) { var el = $('form-error'); el.textContent = msg; el.style.display = 'block'; }
  function clearError() { $('form-error').style.display = 'none'; }

