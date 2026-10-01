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
   * [분류 태그]
   *   [저장]  데이터 보관 — 저장소 어댑터, 불러오기/저장, 백업·복원
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
   *   · 저장된 기록 수정 중에는 editingRecordCtx가 설정되며,
   *     이때 commitStaging()은 동작하지 않습니다(임시 목록 오염 방지).
   * ========================================================================= */

  // 클로드가 파일을 보내줄 때마다 최신본인지 구분할 수 있도록, 코드를 수정할 때는 이 값도 함께 갱신한다
  // (버전은 수정할 때마다 1씩 올리고, 날짜는 그 수정이 반영된 날짜로 갱신)
  var APP_VERSION = 24;
  var APP_BUILD_DATE = '2026-10-01';
  var STORAGE_KEY = 'workout-tracker-data';
  var LEGACY_KEYS = ['workout-log-v3', 'workout-log-v2', 'workout-log'];
  var SCHEMA = 5; // day.durationMin/startedAt/endedAt(운동 소요시간) 추가. 마이그레이션 분기는 없음 — applyLoaded()가 항상 방어적으로 필드를 재구성하므로 구버전 데이터는 해당 필드가 0/미설정으로 채워짐

  // ---------- [저장] GitHub 동기화 (선택 사항 — 설정 안 하면 기존처럼 이 기기에만 저장됨) ----------
  var GH_CONFIG_KEY = 'wt-github-cfg';
  var GH_CACHE_KEY = 'wt-github-cache'; // GitHub 요청 실패(오프라인 등) 시 마지막으로 받았던 내용을 대신 보여주기 위한 로컬 사본
  var GH_CACHE_AT_KEY = 'wt-github-cache-at'; // 위 사본을 "내가 직접" 마지막으로 저장에 성공한 시각
  // "이 기기에서 바꾼 내용을 아직 GitHub에 제대로 올리지 못했다"는 표시. GH_CACHE_KEY는
  // GitHub 저장 성공/실패와 무관하게 항상 최신 내용으로 먼저 갱신해두는데(오프라인에서도
  // 바로 반영되게 하려고), 만약 그 뒤 저장이 실제로는 실패했는데도 이 표시가 없으면 —
  // 나중에 GitHub에서 새로 읽어올 때(새로고침, 다음 실행 등) 아직 안 올라간 변경사항이
  // "예전 것"으로 취급되어 그 오래된 내용에 덮어써져 사라질 수 있다(실제로 겪은 사고).
  // 그래서 PUT을 시도하기 직전에 이 값을 켜두고, 성공했을 때만 끈다 — 켜져 있는 동안은
  // 네트워크에서 새로 읽어오더라도 로컬 내용을 절대 덮어쓰지 않는다.
  var GH_PENDING_KEY = 'wt-github-pending';
  // GitHub Contents API는 커밋 자체는 바로 끝나도, 그 직후 다시 읽으면 몇 초~몇 분 정도 저장 전
  // 내용을 그대로 돌려주는 지연(읽기 일관성 지연)이 있을 수 있다. 그래서 "방금 내가 저장한 것"은
  // 이 시간 동안 무조건 로컬 사본을 그대로 믿고, 네트워크로 다시 확인하지 않는다 — 안 그러면
  // 예를 들어 다크→라이트로 바꾸고 바로 앱을 껐다 켰을 때, 지연된 응답 때문에 다시 다크로
  // 보이는 것처럼 방금 바꾼 설정이 도로 사라지는 것처럼 보일 수 있다.
  var GH_WRITE_GRACE_MS = 3 * 60 * 1000;
  var GH_API = 'https://api.github.com';
  var GH_DATA_PATH = 'data/workout-data.json';
  var ghSha = null; // 마지막으로 읽거나 쓴 파일의 sha — 다음 저장(PUT) 때 충돌 감지용으로 필요

  function getGhConfig() {
    try { var raw = window.localStorage.getItem(GH_CONFIG_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function setGhConfig(cfg) { try { window.localStorage.setItem(GH_CONFIG_KEY, JSON.stringify(cfg)); } catch (e) {} }
  function clearGhConfig() { try { window.localStorage.removeItem(GH_CONFIG_KEY); } catch (e) {} }

  function utf8ToBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  function base64ToUtf8(b64) {
    var binary = atob(b64.replace(/\n/g, ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  async function ghFetch(cfg, opts) {
    opts = opts || {};
    var url = GH_API + '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + GH_DATA_PATH + (opts.query || '');
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, opts.timeoutMs || 20000);
    try {
      var headers = {
        Authorization: 'Bearer ' + cfg.token,
        Accept: opts.accept || 'application/vnd.github+json'
      };
      if (opts.method === 'PUT') headers['Content-Type'] = 'application/json';
      var res = await fetch(url, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal
      });
      if (res.status === 401) throw new Error('GitHub 토큰이 만료됐거나 유효하지 않습니다. 설정에서 다시 연결해주세요.');
      // GitHub는 만료일이 있는 토큰으로 요청하면 응답 헤더에 만료 시각을 실어준다 — 연결된
      // 상태에서 쓸 때마다 최신값으로 갱신해서, 사용자가 따로 만료일을 입력할 필요가 없게 함
      try {
        var exp = res.headers.get('github-authentication-token-expiration');
        if (exp) {
          var stored = getGhConfig();
          if (stored) { stored.tokenExpiresAt = exp; setGhConfig(stored); }
        }
      } catch (e) {}
      return res;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('요청 시간이 초과됐습니다. 네트워크 상태를 확인해주세요.');
      // fetch() 자체가 응답조차 못 받고 실패하면(오프라인, DNS 실패, 연결 끊김 등) 브라우저가
      // "Failed to fetch" 같은 뭉뚱그린 영문 메시지만 준다 — 이 경우만 진짜 연결 문제이므로
      // 안내를 한국어로 바꿔준다. (GitHub가 응답은 했지만 거부한 경우(401/403/429 등)는 위에서
      // 이미 구체적인 메시지로 처리되거나, 호출한 쪽에서 응답 본문의 실제 메시지를 그대로 쓴다.)
      if (e instanceof TypeError) throw new Error('네트워크 연결에 실패했습니다. 인터넷 연결 상태를 확인해주세요.');
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Contents API는 "저장소는 있는데 그 안에 파일이 아직 없음"과 "저장소 이름 자체가
  // 틀렸거나 토큰이 그 저장소를 못 봄"을 똑같이 404로 돌려줘서 구분이 안 된다. 그래서
  // 404가 나오면 저장소 자체가 실제로 있는지(/repos/{owner}/{repo})를 따로 한 번 더
  // 확인해서, "저장소 이름이 틀렸는데도 성공이라고 잘못 알려주는" 일이 없게 한다.
  async function ghRepoExists(cfg) {
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var res = await fetch(GH_API + '/repos/' + cfg.owner + '/' + cfg.repo, {
        headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json' },
        signal: controller.signal
      });
      return res.status !== 404;
    } catch (e) {
      return true; // 이 확인 자체가 실패하면(네트워크 등) 기존 동작을 막지 않는다 — 판단을 보류
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function ghGetData(cfg) {
    var res = await ghFetch(cfg, { query: '?ref=' + (cfg.branch || 'main') });
    var tokenExpiresAt = res.headers.get('github-authentication-token-expiration') || null;
    if (res.status === 404) {
      if (!(await ghRepoExists(cfg))) throw new Error('저장소 "' + cfg.owner + '/' + cfg.repo + '"를 찾을 수 없습니다. 이름을 확인해주세요.');
      return { value: null, sha: null, tokenExpiresAt: tokenExpiresAt };
    }
    if (!res.ok) {
      var body = await res.json().catch(function () { return {}; });
      throw new Error(body.message || 'GitHub 읽기 실패 (' + res.status + ')');
    }
    var json = await res.json();
    var text;
    if (json.content != null) {
      text = base64ToUtf8(json.content);
    } else if (json.size > 0) {
      var rawRes = await ghFetch(cfg, { query: '?ref=' + (cfg.branch || 'main'), accept: 'application/vnd.github.raw' });
      if (!rawRes.ok) throw new Error('기록 파일이 커서 읽는 데 실패했습니다 (' + rawRes.status + ').');
      text = await rawRes.text();
    } else {
      text = null;
    }
    return { value: text, sha: json.sha, tokenExpiresAt: tokenExpiresAt };
  }

  async function ghTestConnection(cfg) {
    var res = await ghFetch(cfg, { query: '?ref=' + (cfg.branch || 'main') });
    if (res.status === 401) throw new Error('토큰이 올바르지 않거나 만료되었습니다.');
    if (res.status === 403) throw new Error('접근이 거부되었습니다. 토큰 권한(Contents: Read and write)을 확인해주세요.');
    var tokenExpiresAt = res.headers.get('github-authentication-token-expiration') || null;
    if (res.status === 404) {
      if (!(await ghRepoExists(cfg))) throw new Error('저장소 "' + cfg.owner + '/' + cfg.repo + '"를 찾을 수 없습니다. 계정명과 저장소 이름을 확인해주세요.');
      return { tokenExpiresAt: tokenExpiresAt }; // 저장소는 있지만 아직 기록 파일이 없음 — 처음 연결할 때는 정상
    }
    if (!res.ok) {
      var body = await res.json().catch(function () { return {}; });
      throw new Error(body.message || '연결 실패 (' + res.status + ')');
    }
    return { tokenExpiresAt: tokenExpiresAt };
  }

  async function ghPutData(cfg, valueStr, sha) {
    var body = { message: 'update workout data', content: utf8ToBase64(valueStr), branch: cfg.branch || 'main' };
    if (sha) body.sha = sha;
    var res = await ghFetch(cfg, { method: 'PUT', body: body });
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      var e = new Error(err.message || 'GitHub 저장 실패 (' + res.status + ')');
      e.status = res.status;
      throw e;
    }
    var json = await res.json();
    return json.content.sha;
  }

  // ---------- [저장] 저장소 어댑터 (클로드 앱 storage / 브라우저 localStorage / GitHub) ----------
  var store = (function () {
    var hasClaude = typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function';
    var baseStore;
    if (hasClaude) {
      baseStore = {
        mode: 'claude',
        get: function (k) { return window.storage.get(k, false); },
        set: function (k, v) { return window.storage.set(k, v, false); }
      };
    } else {
      baseStore = {
        mode: 'local',
        get: function (k) {
          return new Promise(function (resolve, reject) {
            try {
              var v = window.localStorage.getItem(k);
              if (v === null) reject(new Error('not found')); else resolve({ key: k, value: v });
            } catch (e) { reject(e); }
          });
        },
        set: function (k, v) {
          return new Promise(function (resolve, reject) {
            try { window.localStorage.setItem(k, v); resolve({ key: k, value: v }); }
            catch (e) { reject(e); }
          });
        }
      };
    }

    // 운동 기록 본문(STORAGE_KEY)만 GitHub로 라우팅한다. 임시저장(draft)·타이머 같은 건
    // 기기마다 다르고 자주 바뀌는 값이라 그대로 이 기기 로컬에만 둔다(매번 GitHub에 커밋하면
    // API 호출도 과하고 커밋 기록도 지저분해짐).

    // 기록을 연달아 빠르게 지우거나 추가하면 persist()가 짧은 간격으로 여러 번 겹쳐 불릴 수
    // 있는데, 그때마다 store.set이 곧바로 PUT을 쏘면 서로 다른 요청이 같은(오래된) ghSha를
    // 들고 동시에 시작돼서 뒤늦게 도착한 쪽이 충돌(409)로 실패할 수 있다(1회 재시도로도 세
    // 번째 이상 겹치면 못 따라잡음). 그래서 실제 GitHub 쓰기는 한 번에 하나씩만, 앞선 쓰기가
    // 끝난 뒤에 이어서 실행되도록 큐로 순서를 강제한다 — 화면/로컬 반영은 이미 즉시 끝나
    // 있으므로 사용자 입장에서 느려지는 건 없고, 뒤에서 GitHub에 순서대로 쌓이기만 한다.
    var ghWriteQueue = Promise.resolve();
    function queueGhWrite(fn) {
      var result = ghWriteQueue.then(fn, fn);
      ghWriteQueue = result.catch(function () {});
      return result;
    }

    return {
      get mode() { return getGhConfig() ? 'github' : baseStore.mode; },
      get: function (k) {
        var cfg = getGhConfig();
        if (!cfg || k !== STORAGE_KEY) return baseStore.get(k);
        try {
          // 아직 GitHub에 못 올린 이 기기만의 변경사항이 있으면(GH_PENDING_KEY), 네트워크에서
          // 새로 읽어와서 그걸 덮어쓰는 사고를 막기 위해 무조건 로컬 사본을 그대로 믿는다.
          var pending = !!window.localStorage.getItem(GH_PENDING_KEY);
          var cachedAt = Number(window.localStorage.getItem(GH_CACHE_AT_KEY) || 0);
          var cached = window.localStorage.getItem(GH_CACHE_KEY);
          if (cached && (pending || (cachedAt && (Date.now() - cachedAt) < GH_WRITE_GRACE_MS))) {
            return Promise.resolve({ key: k, value: cached });
          }
        } catch (e) {}
        return ghGetData(cfg).then(function (r) {
          if (r.value == null) return baseStore.get(k);
          ghSha = r.sha;
          try { window.localStorage.setItem(GH_CACHE_KEY, r.value); } catch (e) {}
          return { key: k, value: r.value };
        }).catch(function (err) {
          try {
            var cached = window.localStorage.getItem(GH_CACHE_KEY);
            if (cached) return { key: k, value: cached };
          } catch (e) {}
          throw err;
        });
      },
      set: function (k, v) {
        var cfg = getGhConfig();
        if (!cfg || k !== STORAGE_KEY) return baseStore.set(k, v);
        try { window.localStorage.setItem(GH_CACHE_KEY, v); } catch (e) {}
        // PUT을 시도하기 전에 먼저 "아직 안 올라갔다"고 표시해둔다 — 이 시도가 실패로
        // 끝나면(그 사이 앱이 꺼지거나 오프라인이 되는 경우 포함) 이 표시가 남아있어서,
        // 다음에 GitHub에서 다시 읽어올 때 이 변경사항이 예전 것으로 취급되어 사라지지 않는다.
        try { window.localStorage.setItem(GH_PENDING_KEY, '1'); } catch (e) {}
        function markWritten() {
          try { window.localStorage.setItem(GH_CACHE_AT_KEY, String(Date.now())); } catch (e) {}
          try { window.localStorage.removeItem(GH_PENDING_KEY); } catch (e) {}
        }
        return queueGhWrite(function () {
          // ghSha는 메모리 변수라 새로고침/앱 재실행 시 null로 초기화되는데, "아직 못 올린
          // 변경사항이 있다(pending)" 표시 때문에 store.get()이 네트워크 조회를 건너뛰면
          // ghSha가 계속 null로 남는다. null인 채로 PUT하면 "파일이 이미 있는데 sha가
          // 없다"며 GitHub가 거부하고, 실패하니 pending도 안 꺼져서 — 영원히 같은 이유로
          // 실패만 반복하는 고리에 빠진다(실제로 겪은 사고). 그래서 쓰기 전에 ghSha가 없으면
          // 먼저 최신 sha만 확인해서 채워둔다.
          var ensureSha = ghSha ? Promise.resolve(ghSha) : ghGetData(cfg).then(function (r) { ghSha = r.sha; return ghSha; });
          return ensureSha.then(function () {
            return ghPutData(cfg, v, ghSha);
          }).then(function (sha) {
            ghSha = sha;
            markWritten();
            return { key: k, value: v };
          }).catch(function (err) {
            if (err.status === 409 || err.status === 422) {
              // sha가 어긋남(충돌) — 최신 sha로 다시 한 번만 시도. 쓰기가 이제 큐로 한 번에
              // 하나씩만 실행되므로, 남은 충돌 가능성은 사실상 다른 기기가 동시에 저장한
              // 경우뿐이라 재시도 한 번이면 충분하다.
              return ghGetData(cfg).then(function (r) {
                ghSha = r.sha;
                return ghPutData(cfg, v, ghSha).then(function (sha) { ghSha = sha; markWritten(); return { key: k, value: v }; });
              });
            }
            throw err;
          });
        });
      }
    };
  })();

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

  // ---------- [공용] 두 번 눌러 삭제 (오터치 방지) ----------
  var armedBtn = null, armTimer = null;
  function armDelete(btn, label, onConfirm) {
    if (armedBtn === btn) { disarm(); onConfirm(); return; }
    disarm();
    armedBtn = btn;
    btn.dataset.prevHtml = btn.innerHTML;
    btn.innerHTML = '<span style="font-size:11px;font-weight:700;white-space:nowrap;">' + (label || '삭제?') + '</span>';
    btn.style.width = 'auto';
    btn.style.padding = '0 10px';
    armTimer = setTimeout(disarm, 3000);
  }
  function disarm() {
    if (armTimer) { clearTimeout(armTimer); armTimer = null; }
    if (armedBtn && armedBtn.dataset.prevHtml !== undefined) {
      armedBtn.innerHTML = armedBtn.dataset.prevHtml;
      armedBtn.style.width = '';
      armedBtn.style.padding = '';
      delete armedBtn.dataset.prevHtml;
    }
    armedBtn = null;
  }

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
    restSeconds: 90, sound: true, vibrate: true, dark: false,
    heightCm: 0, weightKg: 0, weeklyGoal: 0, historyOpen: false, bwExercises: {}, schema: SCHEMA,
    protein: { targetG: 0, targetAuto: true, goalDirection: 'maintain', logs: {} }, proteinOpen: false,
    customProteinLabels: [], hiddenProteinLabels: [], proteinLabelGrams: {}
  };
  var staging = [];
  var selectedCategory = null;
  // 오늘 운동 세션 소요시간 추적용 (저장 전, 메모리 상태 — saveDraft로 새로고침 대비 영속화)
  var sessionStartAt = null;   // 이번 세션에서 첫 세트를 추가한 시각(ms)
  var sessionLastAt = null;    // 가장 최근 세트를 추가한 시각(ms)
  var sessionAccumMs = 0;      // 세트 사이 텀이 SESSION_GAP_MS 이내였던 구간만 누적한 소요시간(ms)
  var currentQE = null;
  var editingRecordCtx = null; // { day, exIdx } — 저장된 기록을 수정 중일 때만 설정됨
  var editingSetIndex = -1;
  var warmupOn = false;
  var rpeSelected = null;
  var DRAFT_KEY = 'workout-tracker-draft';
  var TIMER_KEY = 'workout-tracker-timer-end';
  var chartMode = 'weight';
  var calCursor = new Date();
  var calSelected = null;
  var editMode = false;
  var exSearch = '';
  var timerId = null, timerRemaining = 0;
  var audioCtx = null;

