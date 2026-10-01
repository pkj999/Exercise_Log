'use strict';

  // ---------- [계산] 볼륨·최고무게·표기 헬퍼 ----------
  function $(id) { return document.getElementById(id); }
  function fmtDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDisplayDate(iso) {
    var d = new Date(iso + 'T00:00:00');
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }
  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function safeScrollIntoView(el) {
    if (!el) return;
    try {
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (e) {
      try { el.scrollIntoView(); } catch (e2) {}
    }
  }
  function safeScrollTop() {
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (e) { try { window.scrollTo(0, 0); } catch (e2) {} }
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function fmtVol(v) {
    if (v >= 10000) return (Math.round(v / 100) / 10) + 't';
    return Math.round(v).toLocaleString() + 'kg';
  }
  function fmtMinSec(sec) {
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function workSets(sets) { return (sets || []).filter(function (s) { return !s.warmup; }); }
  function setVolume(sets) {
    return workSets(sets).reduce(function (sum, s) {
      if (s.cardio) return sum;
      return sum + effWeight(s) * s.reps;
    }, 0);
  }
  function maxWeight(sets) {
    var w = workSets(sets).filter(function (s) { return !s.cardio; });
    if (!w.length) return 0;
    return Math.max.apply(null, w.map(function (s) { return effWeight(s); }));
  }
  function totalMinutes(sets) {
    return (sets || []).reduce(function (sum, s) { return sum + (s.cardio ? (s.minutes || 0) : 0); }, 0);
  }
  function hasCardio(sets) { return (sets || []).some(function (s) { return s.cardio; }); }

  // ---------- [계산] 예상 1RM (Epley 공식) 및 개인 최고기록(PR) 판정 ----------
  // PR/1RM은 여러 화면(빠른 입력·저장된 기록·통계)에 걸쳐 있는 기능이라
  // "판정 기준"과 "표시 문구"만 이 섹션에 모아두고, 각 화면은 아래 함수를 호출만 한다.
  // 화면별 실제 호출 위치(로직 변경 시 함께 확인):
  //   - 세트 추가/수정 시 판정:        [입력] qe-add-set 클릭 핸들러 (judgeAndMarkPR 호출)
  //   - 빠른 입력 세트 목록 배지:      [입력] renderQESetList() (prBadgeHtml 호출)
  //   - 저장된 기록/캘린더 배지:       [조회] buildDayCard() (prBadgeHtml 호출)
  //   - 종목별 그래프의 1RM 추이 값:  [통계] pointsFor()
  //   - "예상 최고 1RM" 캡션:         [통계] renderProgress() (bestOneRMSoFar 호출)
  function estOneRM(s) {
    if (!s || s.cardio || s.warmup) return 0;
    var w = effWeight(s), r = Number(s.reps) || 0;
    if (w <= 0 || r <= 0) return 0;
    if (r === 1) return w;
    return w * (1 + r / 30);
  }
  // 저장된 기록(+선택적으로 현재 세션에서 이미 추가된 세트) 중 해당 종목의 역대 최고 1RM
  // variant를 넘기면 같은 이름이라도 그립/기구가 다른 기록은 비교 대상에서 제외한다
  // (안 넘기면 이름이 같은 모든 기록을 합쳐서 봄 — 통계 화면의 "전체" 조회용)
  function bestOneRMSoFar(name, extraSets, variant) {
    var best = 0;
    data.days.forEach(function (day) {
      day.exercises.forEach(function (ex) {
        if (ex.name !== name) return;
        if (variant !== undefined && (ex.variant || '') !== variant) return;
        ex.sets.forEach(function (s) { best = Math.max(best, estOneRM(s)); });
      });
    });
    (extraSets || []).forEach(function (s) { best = Math.max(best, estOneRM(s)); });
    return best;
  }
  // 세트(entry) 하나가 PR인지 판정하고, PR이면 entry.pr = true로 표시한다.
  // baselineSets: 이번 세트를 제외한 비교 기준 세트 목록(수정 중이면 수정 대상 제외하고 전달)
  function judgeAndMarkPR(name, entry, baselineSets, variant) {
    var prevBest = bestOneRMSoFar(name, baselineSets, variant);
    var newOneRM = estOneRM(entry);
    var isPR = prevBest > 0 && newOneRM > prevBest;
    if (isPR) entry.pr = true;
    return { isPR: isPR, oneRM: newOneRM };
  }
  // PR 배지 HTML — 빠른 입력 목록과 저장된 기록 카드 양쪽에서 동일하게 사용
  function prBadgeHtml(hasPR) {
    return hasPR ? '<span class="wt-pr-badge" title="개인 최고기록">🏆PR</span>' : '';
  }
  // PR 달성 토스트 문구 — 표현을 바꾸고 싶으면 여기 한 곳만 수정하면 됨
  function prToastMessage(name, oneRM) {
    return '🏆 ' + name + ' 신기록! 예상 1RM ' + Math.round(oneRM) + 'kg';
  }

  // ---------- [계산] 종목별 정체기(plateau) 판정 ----------
  // 화면별 실제 호출 위치: [통계] renderProgress() (progress-plateau-badge 표시)
  //
  // 판정 기준(아래 두 조건을 모두 만족해야 "정체"로 본다):
  //   1) 마지막 1RM 갱신 이후 같은 종목을 최소 PLATEAU_MIN_SESSIONS_SINCE_PR회 더 수행했는데도 갱신이 없었음
  //      — 주 1회처럼 드물게 하는 종목을 달력 일수만으로 성급하게 "정체"라 부르지 않기 위한 조건.
  //        즉 실제로 그만큼 "시도"를 했는데도 늘지 않았을 때만 정체로 본다(수행 빈도 반영).
  //   2) 마지막 1RM 갱신 이후 최소 PLATEAU_MIN_DAYS_SINCE_PR일 이상 지났음
  //      — 며칠 새 세션을 몰아서 했다는 이유만으로 정체라 부르지 않기 위한 최소 대기 기간.
  // 값 선정 근거: 3회는 "우연히 그날 컨디션이 안 좋았다"로 보기엔 충분히 반복된 횟수이고,
  // 14일은 일반적인 근력 운동 단위 루틴(주 1~3회 수행 기준)에서 최소 2주 정도는 지나야
  // "정체"라고 부를 만하다고 보는 통상적인 기준을 참고했다. 두 조건을 동시에 요구함으로써
  // 자주 하는 종목과 가끔 하는 종목 모두에 대해 성급한 판정을 피한다.
  // 전체 수행 기록이 PLATEAU_MIN_TOTAL_SESSIONS회 미만인 종목은 애초에 판정 대상에서 제외한다.
  var PLATEAU_MIN_TOTAL_SESSIONS = 4;
  var PLATEAU_MIN_SESSIONS_SINCE_PR = 3;
  var PLATEAU_MIN_DAYS_SINCE_PR = 14;

  // 'YYYY-MM-DD' 문자열 기준 오늘로부터 며칠 전인지(로컬 타임존 기준, UTC 파싱으로 인한 하루 오차 방지)
  function daysSinceDateStr(dateStr) {
    var p = dateStr.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2]);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today - d) / 86400000);
  }
  // 종목의 날짜별 최고 1RM 이력(오름차순). 하루에 여러 세트가 있으면 그날의 최고값 하나만 사용.
  function exerciseOneRMHistory(name, variant) {
    var byDate = {};
    data.days.forEach(function (day) {
      day.exercises.forEach(function (ex) {
        if (ex.name !== name) return;
        if (variant !== undefined && (ex.variant || '') !== variant) return;
        var best = 0;
        ex.sets.forEach(function (s) { best = Math.max(best, estOneRM(s)); });
        if (best > 0) byDate[day.date] = Math.max(byDate[day.date] || 0, best);
      });
    });
    return Object.keys(byDate).sort().map(function (d) { return { date: d, oneRM: byDate[d] }; });
  }
  // 정체 상태가 아니면 null, 정체면 { sessionsSincePR, daysSincePR, bestOneRM }를 반환
  function detectPlateau(name, variant) {
    var history = exerciseOneRMHistory(name, variant);
    if (history.length < PLATEAU_MIN_TOTAL_SESSIONS) return null;

    var bestSoFar = 0, lastPRIdx = 0;
    history.forEach(function (h, i) {
      if (h.oneRM > bestSoFar) { bestSoFar = h.oneRM; lastPRIdx = i; }
    });
    var sessionsSincePR = history.length - 1 - lastPRIdx;
    if (sessionsSincePR < PLATEAU_MIN_SESSIONS_SINCE_PR) return null;

    var daysSincePR = daysSinceDateStr(history[lastPRIdx].date);
    if (daysSincePR < PLATEAU_MIN_DAYS_SINCE_PR) return null;

    return { sessionsSincePR: sessionsSincePR, daysSincePR: daysSincePR, bestOneRM: bestSoFar };
  }

  // ---------- [계산] 운동 세션 소요시간 ----------
  // 화면별 실제 호출 위치:
  //   - 세트 추가 시 활동 기록:        [입력] qe-add-set 클릭 핸들러 (recordSetActivity 호출)
  //   - 저장(commit) 시 하루 기록에 반영: [저장] save-entry-btn 클릭 핸들러 (commitSessionDuration 호출)
  //   - 로그 화면 상단 "진행 중" 표시:  [입력] renderProteinToday 부근 (liveSessionMinutes 호출) — 실제로는 updateTodayVolume 근처에서 호출
  //   - 캘린더 상세 소요시간:          [조회] buildDayCard()
  //   - 주간요약 총 운동시간:          [통계] renderWeeklySummary()
  //
  // 세트 사이 텀이 SESSION_GAP_MS(기본 20분)를 넘으면 그 텀은 소요시간에 포함하지 않는다.
  // 예: 앱을 며칠 뒤 다시 켜서 같은 날짜에 세트를 추가해도, 그 사이 공백은 자동으로 제외된다.
  // 20분을 기준으로 잡은 이유: 세트 간 휴식은 보통 1~5분, 종목을 바꾸거나 슈퍼셋을 구성해도
  // 10~15분을 넘기는 경우는 드물기 때문에, 이를 넘는 공백은 "쉬는 중"이 아니라 "운동을 중단했다가
  // 다시 시작"으로 보는 것이 합리적이다. 세션 전체 누적 시간에는 6시간이라는 절대 상한을 별도로 둬서,
  // 혹시 있을 다른 이상 케이스에도 값이 비현실적으로 커지지 않도록 이중으로 방어한다.
  var SESSION_GAP_MS = 20 * 60 * 1000;
  var SESSION_MAX_ACCUM_MS = 6 * 60 * 60 * 1000;

  // 저장된 기록을 수정하는 중(editingRecordCtx)에는 호출하지 않는다 — 그건 과거 기록을 고치는
  // 것이지 "지금 운동 중"이 아니므로 세션 시간에 반영되면 안 된다. 호출부에서 그 가드를 건다.
  function recordSetActivity() {
    var now = Date.now();
    if (sessionLastAt && (now - sessionLastAt) <= SESSION_GAP_MS) {
      sessionAccumMs = Math.min(SESSION_MAX_ACCUM_MS, sessionAccumMs + (now - sessionLastAt));
    }
    if (!sessionStartAt) sessionStartAt = now;
    sessionLastAt = now;
  }
  // 지금 이 순간 기준 "진행 중" 소요 분(로그 화면 상단용). 활동이 없으면 0.
  function liveSessionMinutes() {
    if (!sessionStartAt) return 0;
    var now = Date.now();
    var extra = (sessionLastAt && (now - sessionLastAt) <= SESSION_GAP_MS) ? (now - sessionLastAt) : 0;
    return Math.round(Math.min(SESSION_MAX_ACCUM_MS, sessionAccumMs + extra) / 60000);
  }
  // 저장(commit) 시점에 이번 세션의 소요시간을 날짜 기록에 반영하고, 세션 상태를 초기화한다.
  // 마지막 세트 추가 이후 ~ 저장 버튼을 누른 시점까지도 소요시간에 포함한다(liveSessionMinutes와 동일한 방식) —
  // 그렇지 않으면 마지막 세트를 기록하고 정리하다 저장하는 사이의 시간이 누락되어 실제보다 적게 잡힌다.
  function commitSessionDuration(day) {
    if (!sessionStartAt) return; // 이번에 새로 추가한 세트가 없으면(예: 루틴만 불러와 바로 저장) 반영할 시간이 없음
    var now = Date.now();
    var extra = (sessionLastAt && (now - sessionLastAt) <= SESSION_GAP_MS) ? (now - sessionLastAt) : 0;
    var totalMs = Math.min(SESSION_MAX_ACCUM_MS, sessionAccumMs + extra);
    var minutes = Math.round(totalMs / 60000);
    day.durationMin = Math.min(1440, (day.durationMin || 0) + minutes);
    day.startedAt = day.startedAt || sessionStartAt;
    day.endedAt = now;
    sessionStartAt = null; sessionLastAt = null; sessionAccumMs = 0;
  }
  function fmtDuration(min) {
    if (!min || min <= 0) return '';
    if (min < 60) return min + '분';
    var h = Math.floor(min / 60), m = min % 60;
    return h + '시간' + (m ? ' ' + m + '분' : '');
  }

  // 세트 한 줄 표기
  function setLabel(s) {
    if (s.cardio) {
      var parts = [(s.minutes || 0) + '분'];
      if (s.intensity) parts.push('강도 ' + s.intensity);
      if (s.distance) parts.push(s.distance + 'km');
      return parts.join(' · ');
    }
    if (s.bwLoad) {
      return '체중' + (s.weight > 0 ? '+' + s.weight : '') + 'kg × ' + s.reps;
    }
    return s.weight + 'kg × ' + s.reps;
  }
  function rpeBadge(s) {
    var r = rpeOf(s.rpe);
    if (!r) return '';
    return '<span class="wt-rpe-badge" style="background:' + r.color + '22;color:' + r.color + ';">' + r.short + '</span>';
  }
  function cssVar(name, fallback) {
    var v = getComputedStyle($('wt-root')).getPropertyValue(name);
    return (v && v.trim()) ? v.trim() : fallback;
  }

  // ---------- [공용] 토스트 안내 메시지 ----------
  var wtToastTimer = null;
  function toast(msg, duration) {
    var el = $('wt-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (wtToastTimer) clearTimeout(wtToastTimer);
    wtToastTimer = setTimeout(function () { el.classList.remove('show'); }, duration || 1700);
  }
  function flash(el) {
    if (!el) return;
    el.classList.remove('wt-flash');
    void el.offsetWidth;
    el.classList.add('wt-flash');
  }

  // ---------- [조회] 지난 수행 기록 카드 ----------
  function renderLastRecord(last) {
    var box = $('qe-last');
    if (!box) return;
    if (!last) {
      box.className = 'wt-last-empty';
      box.textContent = '이전 기록이 없습니다. 첫 기록을 남겨보세요.';
      return;
    }
    box.className = 'wt-last-card';
    var chips = last.sets.map(function (s) {
      return '<span class="wt-last-set' + (s.warmup ? ' warm' : '') + '">' +
        escapeHtml(setLabel(s)) + (s.warmup ? ' W' : '') + '</span>';
    }).join('');
    var work = workSets(last.sets);
    var sum = '';
    if (work.length) {
      if (work[0].cardio) {
        sum = '총 ' + totalMinutes(last.sets) + '분 · ' + work.length + '회';
      } else {
        sum = '최고 ' + maxWeight(last.sets) + 'kg · ' + work.length + '세트';
      }
    }
    box.innerHTML =
      '<div class="wt-last-head"><span class="wt-last-title">지난 기록</span>' +
      '<span class="wt-last-date">' + escapeHtml(fmtDisplayDate(last.date)) + '</span></div>' +
      '<div class="wt-last-sets">' + chips + '</div>' +
      (sum ? '<span class="wt-last-sum">' + escapeHtml(sum) + '</span>' : '');
  }

  // ---------- [설정] 주간 운동 목표 ----------
  // 주 시작은 월요일 — '이번 주 요약'과 캘린더 주차를 같은 기준으로 맞춤
  function weekStart(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  }
  function workoutDaysIn(startIso, endIso) {
    return data.days.filter(function (d) {
      return d.date >= startIso && d.date <= endIso &&
        (d.exercises || []).some(function (ex) { return (ex.sets || []).length > 0; });
    }).length;
  }

  // ---------- [설정] 신체 정보 (키·몸무게) ----------
  function renderBody() {
    $('body-height').value = data.heightCm > 0 ? data.heightCm : '';
    $('body-weight').value = data.weightKg > 0 ? data.weightKg : '';
  }

  // ---------- [단백질] 목표량 계산 및 오늘 섭취 기록 ----------
  // 이 섹션이 단백질 기능의 계산 로직 전부를 담당한다. 화면(설정/기록/통계)은 아래 함수를
  // 호출만 하고, 판정·계산 기준을 바꿀 땐 이 섹션만 고치면 된다.
  //   - 목표량 자동계산 기준:   autoProteinTarget() (체중 × 방향성 계수, PROTEIN_COEF)
  //   - 오늘 총 섭취량/기록 목록: proteinLogsFor(), proteinTotalFor()
  //   - 새 끼니 기록 추가:      addProteinLog()
  //   - 통계용 일별 총량/평균:  proteinDailyTotals(), proteinAverage()
  function autoProteinTarget() {
    if (!(data.weightKg > 0)) return 0;
    var coef = PROTEIN_COEF[data.protein.goalDirection] || PROTEIN_COEF.maintain;
    return Math.round(data.weightKg * coef);
  }
  // targetAuto가 켜져 있을 때만 목표량을 다시 계산해 덮어씀 (사용자가 직접 입력한 값은 보존)
  function recalcProteinTargetIfAuto() {
    if (!data.protein.targetAuto) return;
    var t = autoProteinTarget();
    if (t > 0) data.protein.targetG = t;
  }
  function proteinLogsFor(dateStr) { return data.protein.logs[dateStr] || []; }
  function proteinTotalFor(dateStr) {
    return proteinLogsFor(dateStr).reduce(function (sum, it) { return sum + it.grams; }, 0);
  }
  // 끼니 기록 추가. 성공하면 true, 입력값이 상한을 벗어나면 false를 반환한다.
  function addProteinLog(dateStr, label, grams) {
    var g = Math.round(grams);
    if (!isFinite(g) || g <= 0 || g > LIMITS.proteinMeal) return false;
    var l = (label || '').trim().slice(0, 20) || '끼니';
    if (!data.protein.logs[dateStr]) data.protein.logs[dateStr] = [];
    data.protein.logs[dateStr].push({ id: uid(), label: l, grams: g });
    // 같은 항목(끼니 이름)을 다음에 또 고를 때, 마지막으로 입력했던 g수를 기본값으로 보여주기 위해 기억해둠
    data.proteinLabelGrams[l.slice(0, 10)] = g;
    return true;
  }
  function deleteProteinLog(dateStr, id) {
    if (!data.protein.logs[dateStr]) return;
    data.protein.logs[dateStr] = data.protein.logs[dateStr].filter(function (it) { return it.id !== id; });
    if (!data.protein.logs[dateStr].length) delete data.protein.logs[dateStr];
  }
  // 오늘부터 days일 전까지, 하루도 빠짐없이 총 섭취량을 담은 배열(날짜 오름차순). 기록 없는 날은 0.
  function proteinDailyTotals(days) {
    var out = [];
    var base = new Date();
    for (var i = days - 1; i >= 0; i--) {
      var dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      var key = fmtDate(dt);
      out.push({ date: key, grams: proteinTotalFor(key) });
    }
    return out;
  }
  // 최근 days일 중 "기록이 있는 날"만의 평균 (기록 없는 날은 0g이 아니라 미기록으로 취급해 평균에서 제외)
  function proteinAverage(days) {
    var vals = proteinDailyTotals(days).map(function (p) { return p.grams; }).filter(function (g) { return g > 0; });
    if (!vals.length) return 0;
    return Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
  }

