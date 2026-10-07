'use strict';

  /* =========================================================================
   * 운동일지 트래커 — 단일 파일 웹앱 (HTML + CSS + JS)
   *
   * [구조 안내]
   *   이 파일은 <style> · <body 마크업> · <script> 세 부분으로 되어 있습니다.
   *   아래 스크립트는 다음 섹션 순서로 배치되어 있으며,
   *   각 섹션은 `// ---------- [분류] 제목 ----------` 주석으로 구분됩니다.
   *   특정 기능을 찾을 때는 아래 분류 태그로 검색하세요.
   *
   * [파일 구성]
   *   core.js → github-sync.js → calc.js → persist.js → alerts.js → entry-form.js
   *   → staging-protein.js → history-calendar.js → stats.js → settings-screen.js → main.js
   *   (index.html의 <script> 로드 순서와 동일. github-sync.js는 GitHub 동기화 저장소
   *   어댑터(store)와 GH_ 상수·gh 함수 전용이고, 이 파일(core.js)은 상태·상수·계산·공용 유틸만 담는다.)
   *
   * [분류 태그]
   *   [저장]  데이터 보관 — 불러오기/저장, 백업·복원 (GitHub 동기화 어댑터는 github-sync.js)
   *   [데이터] 고정 데이터 — 부위·종목 목록, 입력 상한값, 태그
   *   [계산]  순수 계산 — 볼륨, 최고무게, 예상 1RM, PR 판정
   *   [상태]  앱 전역 상태 변수
   *   [공용]  여러 화면에서 함께 쓰는 도구 — 아이콘, 토스트, 삭제 확인
   *   [입력]  기록 입력 흐름 — 부위/종목 선택 → 빠른 입력 → 임시 목록
   *   [조회]  기록 보기 — 저장된 기록 목록, 캘린더, 지난 기록
   *   [통계]  주간 요약 및 그래프
   *   [알림]  휴식 타이머, 소리·진동·화면 플래시
   *   [설정]  테마, 신체 정보, 주간 목표 등 설정 화면
   *   [화면]  탭 전환, 스와이프, 레이아웃 여백
   *
   * [데이터 구조 요약]
   *   data.days      = [{ date:'YYYY-MM-DD', exercises:[{ category, name, sets:[...] }] }]
   *   세트(set)      = { weight, reps, warmup, rpe?, tags?, note?, pr?,
   *                      bw?/bwLoad? (맨몸운동), cardio?/minutes?/intensity?/distance? (유산소) }
   *   staging        = 저장 버튼을 누르기 전의 임시 목록 (data에 들어가기 전 단계)
   *
   * [수정 시 주의]
   *   · 워밍업(warmup) 세트는 볼륨·최고무게·PR 계산에서 제외됩니다.
   *   · 유산소(category === '유산소')는 무게/횟수 대신 시간/강도/거리를 씁니다.
   *   · 저장된 기록 수정 중에는 QEState.editingRecordCtx가 설정되며,
   *     이때 commitStaging()은 동작하지 않습니다(임시 목록 오염 방지).
   * ========================================================================= */

  // 클로드가 파일을 보내줄 때마다 최신본인지 구분할 수 있도록, 코드를 수정할 때는 이 값도 함께 갱신한다
  // (버전은 수정할 때마다 1씩 올리고, 날짜는 그 수정이 반영된 날짜로 갱신)
  var APP_VERSION = 39;
  var APP_BUILD_DATE = '2026-10-07';
  var STORAGE_KEY = 'workout-tracker-data';
  var LEGACY_KEYS = ['workout-log-v3', 'workout-log-v2', 'workout-log'];
  var SCHEMA = 5; // day.durationMin/startedAt/endedAt(운동 소요시간) 추가. 마이그레이션 분기는 없음 — applyLoaded()가 항상 방어적으로 필드를 재구성하므로 구버전 데이터는 해당 필드가 0/미설정으로 채워짐

  // GitHub 동기화 어댑터(store)와 관련 설정/함수(GH_*, gh*)는 js/github-sync.js로 분리됨 — 이 파일 바로 다음에 로드된다.
  // ---------- [공용] 아이콘 정의 및 렌더링 ----------
  // 아래 8개(chest~other)는 부위별 장비/동작 픽토그램. 현재는 "부위 선택" 화면에서는
  // 쓰지 않고(텍스트 칩으로만 표시 — [입력] 부위 선택 섹션 참고), 기록 리스트의 작은
  // 아이콘(wt-row-icon)에서만 쓰인다. CAT_META의 color 필드은 캘린더 점 표시와
  // "부위별 볼륨 추이" 차트 선 색에 쓰인다 — 부위 구분이 실제로 필요한 곳에는 기능적
  // 색상을 유지하는 방향(2026-09 리디자인에서 정리).
  var PATHS = {
    chest: '<path d="M3 10v4M6.5 7.5v9M6.5 12h11M17.5 7.5v9M21 10v4"/>',
    back: '<path d="M5 7l7 4 7-4"/><path d="M12 11v8"/>',
    shoulder: '<path d="M6 7h12"/><path d="M8 7v4M16 7v4"/><path d="M6 18c2-3 4-3.5 6-3.5s4 .5 6 3.5"/>',
    arms: '<path d="M4 12h1.6M18.4 12H20"/><path d="M7 9v6M17 9v6"/><path d="M7 12h10"/>',
    legs: '<path d="M9 4v13"/><path d="M6 19h6"/><path d="M15 4v13"/><path d="M12 19h6"/>',
    core: '<g fill="currentColor" stroke="none"><rect x="7" y="7.5" width="10" height="2" rx="1"/><rect x="7" y="11" width="10" height="2" rx="1"/><rect x="7" y="14.5" width="10" height="2" rx="1"/></g>',
    cardio: '<path d="M3 12h3.2l1.8-4.5 2.6 9 2-6.5 1.4 2h4.8"/>',
    other: '<circle cx="5" cy="12" r="2.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="2.1" fill="currentColor" stroke="none"/>',
    barbell: '<path d="M3 10v4M6.5 7.5v9M6.5 12h11M17.5 7.5v9M21 10v4"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16"/><path d="M9.5 4h5"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/>',
    check: '<path d="M5 13l4.5 4.5L19 7"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    download: '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19h14"/>',
    copy: '<rect x="9" y="9" width="10.5" height="10.5" rx="2.5"/><path d="M4.5 15V7a2.5 2.5 0 012.5-2.5h8"/>',
    bookmark: '<path d="M7 4h10v16l-5-4-5 4z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M3.5 10.5h17M8.5 3v5M15.5 3v5"/>',
    chart: '<path d="M3.5 20.5h17"/><path d="M6.5 20V11M12 20V4M17.5 20v-6"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5v.2a2 2 0 01-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 010-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3h.1a1.6 1.6 0 001-1.5V3a2 2 0 014 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8v.1a1.6 1.6 0 001.5 1H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    'chevron-left': '<path d="M15 5l-7 7 7 7"/>',
    'chevron-down': '<path d="M5 9l7 7 7-7"/>',
    'chevron-up': '<path d="M19 15l-7-7-7 7"/>',
    'pencil': '<path d="M4 20h4L19 9a2.1 2.1 0 10-3-3L5 17v3z"/>',
    'chevron-right': '<path d="M9 5l7 7-7 7"/>',
    'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
    'arrow-down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
    'refresh-cw': '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'
  };

  function svg(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (PATHS[name] || PATHS.other) + '</svg>';
  }
  function hydrateIcons() {
    var nodes = document.querySelectorAll('[data-icon]');
    Array.prototype.forEach.call(nodes, function (el) {
      el.innerHTML = svg(el.getAttribute('data-icon'), parseInt(el.getAttribute('data-size'), 10) || 16);
      el.removeAttribute('data-icon');
    });
  }

  // ---------- [공용] 삭제 확인 대화상자 ----------
  // 예전엔 버튼을 두 번 눌러서 확인했는데("삭제?"로 글자가 바뀌었다가 다시 누르면 삭제),
  // 같은 자리를 두 번 눌러야 하는 방식이라 오히려 실수로 연달아 눌러버리기 쉬웠다(특히
  // 목록이 다시 그려지며 버튼 위치/크기가 바뀌는 경우). 그래서 버튼 자체를 바꾸는 대신
  // 화면 아래에서 올라오는 확인 대화상자로 전부 바꿈 — 취소/삭제를 명확히 분리된 버튼으로.
  var confirmDialogOnConfirm = null;
  function armDelete(btn, label, onConfirm) {
    $('confirm-dialog-text').textContent = label || '삭제할까요?';
    $('confirm-dialog').style.display = 'flex';
    confirmDialogOnConfirm = onConfirm;
  }
  function disarm() {
    $('confirm-dialog').style.display = 'none';
    confirmDialogOnConfirm = null;
  }
  // core.js는 가장 먼저 로드되는 스크립트라 아직 calc.js의 $() 헬퍼가 없다 — 여기서만
  // document.getElementById를 직접 쓴다.
  document.getElementById('confirm-dialog-cancel').addEventListener('click', disarm);
  document.getElementById('confirm-dialog-backdrop').addEventListener('click', disarm);
  document.getElementById('confirm-dialog-ok').addEventListener('click', function () {
    var fn = confirmDialogOnConfirm;
    disarm();
    if (fn) fn();
  });

  // ---------- [데이터] 부위·종목 기본 목록 ----------
  var CATALOG = {
    '가슴': ['벤치프레스', '인클라인 벤치프레스', '덤벨 플라이', '딥스', '체스트프레스 머신'],
    '등': ['데드리프트', '풀업', '랫풀다운', '시티드로우', '벤트오버로우'],
    '어깨': ['숄더프레스', '사이드레터럴레이즈', '프론트레이즈', '페이스풀'],
    '하체': ['스쿼트', '레그프레스', '레그컬', '레그익스텐션', '런지'],
    '팔': ['바벨컬', '덤벨컬', '트라이셉스 익스텐션', '케이블 푸시다운'],
    '코어': ['플랭크', '크런치', '행잉레그레이즈'],
    '유산소': ['러닝머신', '사이클', '로잉머신'],
    '기타': []
  };
  // icon은 [공용] 아이콘 섹션의 PATHS 키(기록 리스트 아이콘용). color는 캘린더 점 표시와
  // "부위별 볼륨 추이" 차트 선 색에 쓰인다.
  var CAT_META = {
    '가슴': { icon: 'chest', color: '#FF9270' },
    '등': { icon: 'back', color: '#4E9AE8' },
    '어깨': { icon: 'shoulder', color: '#EF9F27' },
    '하체': { icon: 'legs', color: '#22B184' },
    '팔': { icon: 'arms', color: '#8F87E8' },
    '코어': { icon: 'core', color: '#E0648E' },
    '유산소': { icon: 'cardio', color: '#7BB230' },
    '기타': { icon: 'other', color: '#9A9A93' }
  };
  var CATEGORIES = Object.keys(CATALOG);
  function meta(c) { return CAT_META[c] || CAT_META['기타']; }

  // 세트 강도 3단계
  var RPE = [
    { key: 'easy',  label: '여유',  short: '여유', color: '#4E9AE8', desc: '몇 개 더 가능' },
    { key: 'mid',   label: '적정',  short: '적정', color: '#22B184', desc: '1~2개 여유' },
    { key: 'limit', label: '한계',  short: '한계', color: '#E8603C', desc: '더는 불가' }
  ];
  function rpeOf(key) {
    for (var i = 0; i < RPE.length; i++) if (RPE[i].key === key) return RPE[i];
    return null;
  }
  function isCardio(cat) { return cat === '유산소'; }

  // ---------- [데이터] 입력 상한값 (오타 방지) ----------
  var LIMITS = { weight: 500, reps: 100, minutes: 600, intensity: 20, distance: 200, proteinMeal: 300, proteinTarget: 400 };

  // ---------- [데이터] +/- 스테퍼 버튼의 1회 증감폭 (entry-form.js의 bindStepper가 씀) ----------
  var STEPS = { weight: 2.5, reps: 1, minutes: 5, intensity: 1 };

  // ---------- [데이터] 단백질 목표 방향성별 g/kg 계수 ----------
  // 체중(kg) × 계수 = 일일 목표 단백질(g). 운동하는 성인 기준 일반적으로 알려진 참고 범위이며,
  // 정밀한 영양 처방이 아니므로 개인차·질환 여부에 따라 조정이 필요할 수 있습니다.
  var PROTEIN_COEF = { cut: 2.0, maintain: 1.6, bulk: 1.8 };
  var PROTEIN_GOAL_LABELS = { cut: '체중 감량', maintain: '유지', bulk: '증량' };

  // ---------- [공용] 종목 이름 정규화 (공백·대소문자 차이 흡수) ----------
  function normName(v) { return String(v || '').toLowerCase().replace(/\s+/g, ''); }

  // ---------- [계산] 맨몸운동 체중 부하 (종목별 수동 지정) ----------
  // data.bwExercises = { '<종목명>': <체중 비율 %> }. 사용자가 직접 켠 종목에만 적용됨.
  function bwPercent(name) {
    if (!name) return 0;
    var v = Number((data.bwExercises || {})[name]);
    return (isFinite(v) && v > 0) ? Math.min(150, v) : 0;
  }
  function bwRatio(name) { return bwPercent(name) / 100; }
  function setBwPercent(name, pct) {
    if (!name) return;
    data.bwExercises = data.bwExercises || {};
    if (!pct) delete data.bwExercises[name];
    else data.bwExercises[name] = Math.min(150, Math.max(5, Math.round(pct)));
    persist();
  }
  // 기록 시점의 체중을 세트에 저장 — 이후 체중이 바뀌어도 과거 볼륨은 그대로 유지됨
  function bwLoadFor(name) {
    var r = bwRatio(name);
    if (!r || !(data.weightKg > 0)) return 0;
    return Math.round(data.weightKg * r * 10) / 10;
  }
  function effWeight(s) { return (Number(s.bwLoad) || 0) + (Number(s.weight) || 0); }

  // ---------- [상태] 앱 전역 상태 ----------
  var data = {
    days: [], customExercises: {}, hiddenExercises: {},
    restSeconds: 90, sound: true, vibrate: true, flash: true, dark: false,
    heightCm: 0, weightKg: 0, weeklyGoal: 0, historyOpen: false, bwExercises: {}, schema: SCHEMA,
    protein: { targetG: 0, targetAuto: true, goalDirection: 'maintain', logs: {} }, proteinOpen: false,
    customProteinLabels: [], hiddenProteinLabels: [], proteinLabelGrams: {},
    exerciseSubgroups: {}, routines: []
  };
  var staging = [];
  var selectedCategory = null;
  // 오늘 운동 세션 소요시간 추적용 (저장 전, 메모리 상태 — saveDraft로 새로고침 대비 영속화)
  var sessionStartAt = null;   // 이번 세션에서 첫 세트를 추가한 시각(ms)
  var sessionLastAt = null;    // 가장 최근 세트를 추가한 시각(ms)
  var sessionAccumMs = 0;      // 세트 사이 텀이 SESSION_GAP_MS 이내였던 구간만 누적한 소요시간(ms)
  // "빠른 입력" 화면(entry-form.js)이 지금 작성 중인 종목/세트에 관한 상태를 한데 묶어둔 것.
  // QEState.current가 null이면 입력 화면이 닫혀 있다는 뜻.
  var QEState = {
    current: null,           // 지금 입력 중인 종목 { category, name, variant, sets } — staging에 들어가기 전 임시본
    editingRecordCtx: null,  // { day, exIdx } — 저장된 기록을 수정 중일 때만 설정됨
    editingSetIndex: -1,     // current.sets 중 지금 고쳐쓰는 세트의 인덱스 (-1이면 새 세트 추가 중)
    warmupOn: false,         // 다음에 추가할 세트에 워밍업 표시를 붙일지
    rpeSelected: null        // 다음에 추가할 세트의 강도(easy/mid/limit), 선택 안 하면 null
  };
  var DRAFT_KEY = 'workout-tracker-draft';
  var TIMER_KEY = 'workout-tracker-timer-end';
  var chartMode = 'weight';
  var calCursor = new Date();
  var calSelected = null;
  var editMode = false;
  var exSearch = '';
  var timerId = null, timerRemaining = 0;
  var audioCtx = null;

