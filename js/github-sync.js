'use strict';

  // ---------- [저장] GitHub 동기화 (선택 사항 — 설정 안 하면 기존처럼 이 기기에만 저장됨) ----------
  // core.js에서 분리된 파일. STORAGE_KEY(core.js에서 정의)를 쓰므로 core.js 다음에 로드돼야 한다.
  // 여기서 만드는 `store`는 [저장] 저장소 어댑터로, persist.js의 loadData()/persist()가
  // store.get()/store.set()을 통해 쓴다 — GitHub 연결이 안 돼 있으면 로컬(localStorage/클로드 앱
  // storage)로, 연결돼 있으면 GitHub Contents API로 운동 기록 본문(STORAGE_KEY)만 라우팅한다.
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
