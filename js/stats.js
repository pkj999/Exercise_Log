'use strict';

  // ---------- [통계] 주간 요약 및 부위 밸런스 ----------
  function renderWeeklySummary() {
    var now = new Date();
    var monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    var startIso = fmtDate(monday);
    var endIso = fmtDate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));

    var weekDays = data.days.filter(function (d) { return d.date >= startIso && d.date <= endIso; });
    var totalSets = 0, byCat = {}, totalDurMin = 0, hadAnySession = false;
    weekDays.forEach(function (day) {
      totalDurMin += day.durationMin || 0;
      if (day.startedAt > 0) hadAnySession = true;
      day.exercises.forEach(function (ex) {
        var n = workSets(ex.sets).length;
        totalSets += n;
        byCat[ex.category] = (byCat[ex.category] || 0) + n;
      });
    });

    var doneDays = workoutDaysIn(startIso, endIso);
    $('wk-days').textContent = weekDays.length + '일';
    var goalEl = $('wk-goal');
    if (data.weeklyGoal > 0) {
      goalEl.style.display = '';
      if (doneDays >= data.weeklyGoal) {
        goalEl.textContent = '목표 ' + data.weeklyGoal + '일 달성';
        goalEl.style.color = 'var(--wt-good)';
      } else {
        goalEl.textContent = '목표 ' + data.weeklyGoal + '일';
        goalEl.style.color = 'var(--wt-text-muted)';
      }
    } else {
      goalEl.style.display = 'none';
    }
    $('wk-sets').textContent = totalSets ? totalSets + '세트' : '-';
    var durCap = $('wk-duration');
    if (hadAnySession) {
      durCap.textContent = '⏱ 이번 주 총 운동시간 ' + (fmtDuration(totalDurMin) || '1분 미만');
      durCap.style.display = '';
    } else {
      durCap.style.display = 'none';
    }

    var wrap = $('wk-balance');
    if (!totalSets) {
      wrap.innerHTML = '<p style="font-size:12px;color:var(--wt-text-muted);margin:0;">이번 주 기록이 없습니다.</p>';
      return;
    }
    wrap.innerHTML = Object.keys(byCat).map(function (c) { return { cat: c, sets: byCat[c] }; })
      .filter(function (e) { return e.sets > 0; })
      .sort(function (a, b) { return b.sets - a.sets; })
      .map(function (e) {
        var pct = Math.round(e.sets / totalSets * 100);
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">' +
          '<span style="display:flex;align-items:center;gap:4px;width:54px;flex-shrink:0;color:var(--wt-text-muted);">' +
          svg(meta(e.cat).icon, 15) +
          '<span style="font-size:11px;font-weight:600;color:var(--wt-text);">' + e.cat + '</span></span>' +
          '<span style="flex:1;height:6px;background:var(--wt-bg);border-radius:999px;overflow:hidden;">' +
          '<span style="display:block;height:100%;width:' + pct + '%;background:var(--wt-text-muted);border-radius:999px;"></span></span>' +
          '<span style="font-size:11px;color:var(--wt-text-muted);width:64px;text-align:right;flex-shrink:0;">' + e.sets + '세트 ' + pct + '%</span></div>';
      }).join('');
  }

  // ---------- [통계] 그래프 (볼륨/최고무게/1RM 추이) ----------
  // drawLineChart()는 범용 단일선 그래프 함수로, 아래 두 군데에서 재사용된다:
  //   1) renderCategoryVolumeChart() — 부위 하나를 선택해 그 부위의 볼륨 추이
  //   2) renderProgress() — 종목 하나를 선택해 무게/볼륨/세트/1RM 추이
  var chartRetries = {};
  var chartAnimId = {};
  function drawLineChart(canvasId, points, valueKey, labelFn, lineColor) {
    var canvas = $(canvasId);
    if (!canvas) return;
    var parent = canvas.parentElement;

    // 크기 측정: getBoundingClientRect -> offsetWidth -> clientWidth 순으로 시도
    var box = parent.getBoundingClientRect();
    var cw = box.width || parent.offsetWidth || parent.clientWidth || 0;
    var ch = box.height || parent.offsetHeight || parent.clientHeight || 0;

    // 아직 레이아웃이 잡히지 않았으면 잠시 후 다시 시도 (최대 5회)
    if (cw < 10 || ch < 10) {
      var tries = chartRetries[canvasId] || 0;
      if (tries < 5) {
        chartRetries[canvasId] = tries + 1;
        setTimeout(function () { drawLineChart(canvasId, points, valueKey, labelFn); }, 120);
      }
      return;
    }
    chartRetries[canvasId] = 0;

    if (chartAnimId[canvasId]) { cancelAnimationFrame(chartAnimId[canvasId]); chartAnimId[canvasId] = null; }

    var rect = { width: cw, height: ch };
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (!points.length) return;

    var accent = lineColor || cssVar('--wt-accent', '#5E6AD2');
    var grid = cssVar('--wt-border', '#E2E8F0');
    var muted = cssVar('--wt-text-muted', '#64748B');
    var cardBg = cssVar('--wt-card', '#FFFFFF');

    var padL = 50, padR = 12, padT = 12, padB = 24;
    var w = rect.width - padL - padR, h = rect.height - padT - padB;
    if (w <= 0 || h <= 0) return;

    var vals = points.map(function (p) { return p[valueKey]; });
    var minV = Math.min.apply(null, vals), maxV = Math.max.apply(null, vals);
    if (minV === maxV) { minV = Math.max(0, minV - 5); maxV = maxV + 5; }
    var range = (maxV - minV) || 1;

    function xAt(i) { return padL + (points.length === 1 ? w / 2 : (w * i / (points.length - 1))); }
    function yAt(v) { return padT + h - ((v - minV) / range) * h; }

    function drawStatic() {
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = grid; ctx.lineWidth = 1;
      for (var g = 0; g <= 3; g++) {
        var gy = padT + (h * g / 3);
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + w, gy); ctx.stroke();
      }
      ctx.fillStyle = muted;
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(labelFn(maxV), padL - 6, padT + 4);
      ctx.fillText(labelFn(minV), padL - 6, padT + h);
      ctx.fillStyle = muted; ctx.textAlign = 'center';
      ctx.fillText(fmtDisplayDate(points[0].date), xAt(0), padT + h + 16);
      if (points.length > 1) {
        ctx.fillText(fmtDisplayDate(points[points.length - 1].date), xAt(points.length - 1), padT + h + 16);
      }
    }

    // progress(0~1)만큼만 선과 점을 그려서 등장 모션을 만듦
    function drawProgress(progress) {
      drawStatic();
      if (points.length === 1) {
        var x0 = xAt(0), y0 = yAt(points[0][valueKey]);
        var r0 = 5 * Math.min(1, progress * 1.4);
        if (r0 > 0) {
          ctx.fillStyle = cardBg;
          ctx.beginPath(); ctx.arc(x0, y0, r0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.stroke();
        }
        return;
      }
      var reveal = progress * (points.length - 1);
      ctx.strokeStyle = accent; ctx.lineWidth = 3;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var i = 0; i < points.length && i <= reveal; i++) {
        var x = xAt(i), y = yAt(points[i][valueKey]);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      var lastFull = Math.floor(Math.min(reveal, points.length - 1));
      if (reveal > lastFull && lastFull < points.length - 1) {
        var frac = reveal - lastFull;
        var x1 = xAt(lastFull), y1 = yAt(points[lastFull][valueKey]);
        var x2 = xAt(lastFull + 1), y2 = yAt(points[lastFull + 1][valueKey]);
        ctx.lineTo(x1 + (x2 - x1) * frac, y1 + (y2 - y1) * frac);
      }
      ctx.stroke();

      points.forEach(function (p, i) {
        if (i > reveal + 0.001) return;
        var local = Math.max(0, Math.min(1, (reveal - i) * 3 + 1));
        var r = 5 * local;
        if (r <= 0) return;
        var x = xAt(i), y = yAt(p[valueKey]);
        ctx.fillStyle = cardBg;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.stroke();
      });
    }

    var duration = Math.min(700, 260 + points.length * 30);
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      drawProgress(eased);
      if (t < 1) chartAnimId[canvasId] = requestAnimationFrame(step);
      else chartAnimId[canvasId] = null;
    }
    chartAnimId[canvasId] = requestAnimationFrame(step);
  }

  // 부위별(카테고리별)로 세션 날짜에 볼륨을 모아, 최근 기록 있는 세션 최대 10회씩만 남김
  function categoryVolumeSeries() {
    var byCatDay = {};
    data.days.forEach(function (day) {
      var dayByCat = {};
      day.exercises.forEach(function (ex) {
        var v = setVolume(ex.sets);
        if (!v) return;
        dayByCat[ex.category] = (dayByCat[ex.category] || 0) + v;
      });
      Object.keys(dayByCat).forEach(function (cat) {
        byCatDay[cat] = byCatDay[cat] || [];
        byCatDay[cat].push({ date: day.date, volume: dayByCat[cat] });
      });
    });
    var series = [];
    Object.keys(byCatDay).forEach(function (cat) {
      var pts = byCatDay[cat].sort(function (a, b) { return a.date.localeCompare(b.date); }).slice(-10);
      if (pts.length >= 2) series.push({ cat: cat, points: pts });
    });
    return series;
  }

  // 부위별 볼륨 추이 — 여러 부위를 한 그래프에 겹쳐 그리면 부위 간 볼륨 차이(하체 vs 어깨)
  // 때문에 뒤섞여 읽기 어려워지므로, 부위 하나를 선택해서 그 부위만 보는 방식으로 유지
  var volCatSelected = null;
  function renderCategoryVolumeChart() {
    var series = categoryVolumeSeries();
    var empty = $('total-empty');
    var canvas = $('total-canvas');
    var selectEl = $('vol-cat-select');
    if (!series.length) {
      canvas.parentElement.style.display = 'none';
      selectEl.style.display = 'none';
      empty.style.display = 'block';
      $('total-vol-caption').textContent = '';
      return;
    }
    var cats = series.map(function (s) { return s.cat; });
    if (!volCatSelected || cats.indexOf(volCatSelected) === -1) volCatSelected = cats[0];
    selectEl.innerHTML = cats.map(function (c) {
      return '<option value="' + escapeHtml(c) + '"' + (c === volCatSelected ? ' selected' : '') + '>' + escapeHtml(c) + '</option>';
    }).join('');
    selectEl.style.display = '';
    canvas.parentElement.style.display = '';
    empty.style.display = 'none';
    var s = series.find(function (x) { return x.cat === volCatSelected; });
    $('total-vol-caption').textContent = '최근 ' + s.points.length + '회';
    drawLineChart('total-canvas', s.points, 'volume', fmtVol, meta(volCatSelected).color);
  }
  $('vol-cat-select').addEventListener('change', function () {
    volCatSelected = this.value;
    renderCategoryVolumeChart();
  });

  // 최근 14일 중 기록이 있는 날짜만 뽑아 차트로 표시 (기존 [통계] 볼륨 추이와 동일한 방식)
  function proteinChartPoints() {
    return proteinDailyTotals(14).filter(function (p) { return p.grams > 0; });
  }
  function renderProteinStats() {
    var week = proteinAverage(7), month = proteinAverage(30);
    $('protein-week-avg').textContent = week > 0 ? week + 'g' : '-';
    $('protein-month-avg').textContent = month > 0 ? month + 'g' : '-';

    var points = proteinChartPoints();
    var canvas = $('protein-canvas');
    var empty = $('protein-stats-empty');
    if (points.length < 2) {
      canvas.parentElement.style.display = 'none';
      empty.style.display = 'block';
      $('protein-stats-caption').textContent = '';
      return;
    }
    canvas.parentElement.style.display = '';
    empty.style.display = 'none';
    $('protein-stats-caption').textContent = data.protein.targetG > 0 ? '목표 ' + data.protein.targetG + 'g' : '최근 ' + points.length + '일';
    drawLineChart('protein-canvas', points, 'grams', function (v) { return Math.round(v) + 'g'; });
  }

  // 종목(이름+변형) 목록. 한 이름에 변형이 여러 개 쓰인 적 있을 때만 "이름 · 변형"으로 쪼개서 보여주고,
  // 변형을 한 번도 안 썼거나 하나만 썼던 이름은 그냥 이름 그대로 보여준다(불필요하게 목록만 늘리지 않기 위해).
  var progressOptionsByKey = {};
  function allExerciseOptions() {
    var seen = {}; // key(이름\u0000변형) -> { name, variant }
    data.days.forEach(function (day) {
      day.exercises.forEach(function (ex) {
        var v = ex.variant || '';
        var key = ex.name + '\u0000' + v;
        if (!seen[key]) seen[key] = { name: ex.name, variant: v };
      });
    });
    var variantCountByName = {};
    Object.keys(seen).forEach(function (k) {
      var n = seen[k].name;
      variantCountByName[n] = (variantCountByName[n] || 0) + 1;
    });
    var options = Object.keys(seen).map(function (k) {
      var o = seen[k];
      var multi = variantCountByName[o.name] > 1;
      var label = multi ? (o.name + ' · ' + (o.variant || '(변형 없음)')) : o.name;
      return { key: k, name: o.name, variant: o.variant, label: label };
    });
    options.sort(function (a, b) { return a.label.localeCompare(b.label, 'ko'); });
    return options;
  }

  function renderProgressSelect() {
    var sel = $('progress-exercise');
    var options = allExerciseOptions();
    var prev = sel.value;
    sel.innerHTML = '';
    progressOptionsByKey = {};
    if (!options.length) {
      $('progress-empty').style.display = 'block';
      $('progress-stats').style.display = 'none';
      sel.style.display = 'none';
      return;
    }
    sel.style.display = '';
    $('progress-empty').style.display = 'none';
    options.forEach(function (o) {
      progressOptionsByKey[o.key] = o;
      var opt = document.createElement('option');
      opt.value = o.key; opt.textContent = o.label;
      sel.appendChild(opt);
    });
    if (progressOptionsByKey[prev]) sel.value = prev;
    renderProgress();
  }

  function isCardioExercise(name) {
    for (var i = 0; i < data.days.length; i++) {
      var m = data.days[i].exercises.filter(function (ex) { return ex.name === name; });
      if (m.length) return m.some(function (ex) { return hasCardio(ex.sets); });
    }
    return false;
  }
  function pointsFor(name, variant) {
    var cardio = isCardioExercise(name);
    return data.days.slice().sort(function (a, b) { return a.date.localeCompare(b.date); })
      .map(function (day) {
        var matches = day.exercises.filter(function (ex) {
          return ex.name === name && (variant === undefined || (ex.variant || '') === variant);
        });
        if (!matches.length) return null;
        var all = [].concat.apply([], matches.map(function (m) { return m.sets; }));
        if (cardio) {
          var mins = totalMinutes(all);
          var maxInt = all.reduce(function (mx, x) { return Math.max(mx, x.intensity || 0); }, 0);
          var dist = all.reduce(function (sum, x) { return sum + (x.distance || 0); }, 0);
          return { date: day.date, cardio: true, weight: maxInt, volume: mins, minutes: mins, distance: dist, sets: workSets(all).length };
        }
        return { date: day.date, cardio: false, weight: maxWeight(all), volume: setVolume(all), oneRM: Math.round(Math.max.apply(null, [0].concat(all.map(estOneRM)))), sets: workSets(all).length };
      })
      .filter(function (p) { return p && (p.cardio ? p.minutes > 0 : p.weight > 0); });
  }

  function renderProgress() {
    var key = $('progress-exercise').value;
    var opt = progressOptionsByKey[key];
    if (!opt) return;
    var name = opt.name, variant = opt.variant;
    $('progress-stats').style.display = 'block';

    var points = pointsFor(name, variant);
    var cardio = points.length ? !!points[0].cardio : false;
    var unit = cardio ? '' : 'kg';

    $('chart-mode-weight').textContent = cardio ? '강도' : '최고 무게';
    document.querySelectorAll('#progress-stats .wt-stat-label')[0].textContent = cardio ? '최고 강도' : '최고 무게';
    document.querySelectorAll('#progress-stats .wt-stat-label')[1].textContent = cardio ? '최근 강도' : '최근 무게';

    var maxW = points.length ? Math.max.apply(null, points.map(function (p) { return p.weight; })) : 0;
    var recentW = points.length ? points[points.length - 1].weight : 0;
    var prevW = points.length > 1 ? points[points.length - 2].weight : null;

    $('stat-max').textContent = maxW ? maxW + unit : '-';
    $('stat-count').textContent = points.length;

    var el = $('stat-recent');
    el.innerHTML = '';
    var main = document.createElement('span');
    main.textContent = recentW ? recentW + unit : '-';
    el.appendChild(main);
    if (prevW !== null && recentW !== prevW) {
      var diff = Math.round((recentW - prevW) * 100) / 100;
      var delta = document.createElement('span');
      delta.style.cssText = 'font-size:13px;font-weight:700;color:' + (diff > 0 ? 'var(--wt-good)' : 'var(--wt-text-muted)') + ';';
      delta.textContent = (diff > 0 ? '+' : '') + diff + unit;
      el.appendChild(delta);
    }

    // 정체기(plateau) 안내 — PR 배지(금색·트로피)와 겹치지 않게 차분한 톤으로 구분
    var plateauBadge = $('progress-plateau-badge');
    var plateau = !cardio ? detectPlateau(name, variant) : null;
    if (plateau) {
      plateauBadge.textContent = '⏸ ' + plateau.daysSincePR + '일째 정체 · 최근 ' + plateau.sessionsSincePR + '회 동안 1RM 갱신 없음';
      plateauBadge.style.display = 'inline-block';
    } else {
      plateauBadge.style.display = 'none';
    }

    var labelFn;
    if (chartMode === 'sets') labelFn = function (v) { return v + '세트'; };
    else labelFn = cardio ? function (v) { return '강도 ' + Math.round(v); } : function (v) { return Math.round(v) + 'kg'; };

    drawLineChart('progress-canvas', points, chartMode, labelFn);
    renderProgressTable(points, cardio);
    renderProgressNotes(name, variant);
  }

  function renderProgressNotes(name, variant) {
    var card = $('progress-notes');
    var list = $('progress-notes-list');
    var rows = [];
    data.days.slice().sort(function (a, b) { return b.date.localeCompare(a.date); })
      .forEach(function (day) {
        (day.exercises || []).forEach(function (ex) {
          if (ex.name !== name) return;
          if (variant !== undefined && (ex.variant || '') !== variant) return;
          (ex.sets || []).forEach(function (st) {
            if (!st.note && !(st.tags && st.tags.length)) return;
            rows.push({ date: day.date, note: st.note || '', tags: st.tags || [], label: setLabel(st) });
          });
        });
      });
    if (!rows.length) { card.style.display = 'none'; list.innerHTML = ''; return; }
    card.style.display = '';
    list.innerHTML = rows.slice(0, 15).map(function (r) {
      var tags = r.tags.map(function (t) { return '<span class="wt-tag-mini">' + escapeHtml(t) + '</span>'; }).join('');
      return '<div class="wt-note-row">' +
        '<span class="wt-note-date">' + escapeHtml(fmtDisplayDate(r.date)) + '</span>' +
        '<span style="color:var(--wt-text-muted);font-size:11px;margin-left:6px;">' + escapeHtml(r.label) + '</span>' +
        tags +
        (r.note ? '<div style="margin-top:3px;">' + escapeHtml(r.note) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  function renderProgressTable(points, cardio) {
    var el = $('progress-table');
    if (!points.length) { el.innerHTML = ''; return; }
    var unit = cardio ? '' : 'kg';
    el.innerHTML = '<table style="width:100%;border-collapse:collapse;"><tbody>' +
      points.slice().reverse().map(function (p, idx, arr) {
        var prev = arr[idx + 1];
        var deltaHtml = '';
        if (prev) {
          var d = Math.round((p.weight - prev.weight) * 100) / 100;
          if (d !== 0) deltaHtml = '<span style="font-size:12px;font-weight:700;color:' +
            (d > 0 ? 'var(--wt-good)' : 'var(--wt-text-muted)') + ';margin-left:6px;">' + (d > 0 ? '+' : '') + d + unit + '</span>';
        }
        var sub = cardio
          ? p.minutes + '분' + (p.distance ? ' · ' + (Math.round(p.distance * 100) / 100) + 'km' : '')
          : p.sets + '세트';
        var main = cardio ? '강도 ' + p.weight : p.weight + 'kg';
        return '<tr><td style="padding:8px 0;font-size:13px;color:var(--wt-text-muted);border-top:1px solid var(--wt-border);">' +
          fmtDisplayDate(p.date) + '<span style="font-size:11px;margin-left:6px;">' + sub + '</span></td>' +
          '<td style="padding:8px 0;font-size:13px;font-weight:700;text-align:right;color:var(--wt-text);border-top:1px solid var(--wt-border);">' +
          main + deltaHtml + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  $('chart-mode-weight').addEventListener('click', function () {
    chartMode = 'weight';
    this.classList.add('active');
    $('chart-mode-sets').classList.remove('active');
    renderProgress();
  });
  $('chart-mode-sets').addEventListener('click', function () {
    chartMode = 'sets';
    this.classList.add('active');
    $('chart-mode-weight').classList.remove('active');
    renderProgress();
  });

