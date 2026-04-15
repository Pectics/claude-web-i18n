(function () {
  if (window.__CLAUDE_I18N_PAGE_HOOK_INSTALLED__) {
    return;
  }
  window.__CLAUDE_I18N_PAGE_HOOK_INSTALLED__ = true;

  const OVERRIDE_STORAGE_KEY = "claude-i18n:locale";
  const EXTENSION_LOCALES_STORAGE_KEY = "claude-i18n:extension-locales";
  const EXTENSION_LOCALES = readExtensionLocales();
  const ORIGINAL_ORIGIN = "https://claude.ai";
  const STORE_FLAG = "__CLAUDE_I18N_STORE__";
  const STATUS_FLAG = "__CLAUDE_I18N_RUNTIME_STATUS__";
  const PAGE_REQUEST_SOURCE = "claude-i18n-page";
  const PAGE_RESPONSE_SOURCE = "claude-i18n-extension";
  const CAPTURE_TIMEOUT_MS = 15000;

  const originalAssign = Object.assign;
  const originalFetch = window.fetch.bind(window);
  let requestCounter = 0;
  let restoredAssign = false;
  let captureTimedOut = false;

  publishStatus({
    stage: "boot",
    captured: false,
  });

  const restoreTimer = window.setTimeout(() => {
    captureTimedOut = true;
    restoreAssign();
    publishStatus({
      stage: "timeout",
      captured: Boolean(window[STORE_FLAG]),
    });
  }, CAPTURE_TIMEOUT_MS);

  const patchedAssign = function patchedAssign(target, ...sources) {
    const result = originalAssign.apply(this, [target, ...sources]);
    inspectCandidate(target, "assign-target");
    for (const source of sources) {
      inspectCandidate(source, "assign-source");
    }
    return result;
  };

  Object.assign = patchedAssign;
  window.fetch = patchedFetch;

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (!data || data.source !== PAGE_RESPONSE_SOURCE || data.type !== "runtime-request") {
      return;
    }

    Promise.resolve(handleRuntimeRequest(data.payload))
      .then((payload) => {
        respondToRuntimeRequest(data.requestId, true, payload);
      })
      .catch((error) => {
        respondToRuntimeRequest(data.requestId, false, null, error);
      });
  });

  async function patchedFetch(input, init) {
    const url = toUrl(input);
    const overrideLocale = readOverrideLocale();

    if (isExtensionLocale(overrideLocale) && isTargetGatedMessagesRequest(url)) {
      console.log("[claude-i18n] served gated messages stub", {
        locale: overrideLocale,
        url: url.toString(),
      });

      return new Response('{"messages":{},"gates":[]}', {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      });
    }

    if (isExtensionLocale(overrideLocale) && isTargetI18nRequest(url)) {
      const payload = await requestExtensionPayload(overrideLocale, url.toString());
      console.log("[claude-i18n] served i18n request via extension cache", {
        locale: overrideLocale,
        url: url.toString(),
        cacheStatus: payload.cacheStatus,
      });

      return new Response(payload.body, {
        status: payload.status,
        headers: payload.headers,
      });
    }

    return originalFetch(input, init);
  }

  function respondToRuntimeRequest(requestId, ok, payload, error) {
    window.postMessage(
      {
        source: PAGE_RESPONSE_SOURCE,
        type: "runtime-response",
        requestId,
        ok,
        payload,
        error: ok ? null : error instanceof Error ? error.message : String(error),
      },
      window.location.origin,
    );
  }

  function handleRuntimeRequest(payload) {
    const type = payload?.type;

    if (type === "status") {
      return readStatus();
    }

    if (type === "set-locale-override") {
      return {
        ok: applyLocaleOverride(payload.locale ?? null),
        status: readStatus(),
      };
    }

    if (type === "clear-locale-override") {
      return {
        ok: applyLocaleOverride(null),
        status: readStatus(),
      };
    }

    throw new Error(`Unknown runtime request: ${String(type)}`);
  }

  function inspectCandidate(candidate, reason) {
    if (!candidate || restoredAssign || captureTimedOut) {
      return false;
    }

    if (typeof candidate === "function" && isTargetStore(candidate)) {
      captureStore(candidate, reason);
      return true;
    }

    if (
      candidate &&
      typeof candidate === "object" &&
      typeof candidate.getState === "function" &&
      isTargetStore(candidate)
    ) {
      captureStore(candidate, reason);
      return true;
    }

    return false;
  }

  function isTargetStore(candidate) {
    if (!candidate || typeof candidate.getState !== "function") {
      return false;
    }

    let state;
    try {
      state = candidate.getState();
    } catch {
      return false;
    }

    return Boolean(
      state &&
        typeof state === "object" &&
        Object.prototype.hasOwnProperty.call(state, "localeOverride") &&
        Object.prototype.hasOwnProperty.call(state, "messagesLocale") &&
        typeof state.setLocaleOverride === "function" &&
        typeof state.setGatedMessages === "function" &&
        typeof state.clearGatedMessages === "function",
    );
  }

  function captureStore(store, reason) {
    if (window[STORE_FLAG] === store) {
      return;
    }

    window[STORE_FLAG] = store;
    restoreAssign();
    window.clearTimeout(restoreTimer);

    const pendingLocale = readOverrideLocale();
    if (isExtensionLocale(pendingLocale)) {
      applyLocaleOverride(pendingLocale);
    }

    publishStatus({
      stage: "ready",
      captured: true,
      reason,
      keys: Object.keys(store.getState()),
      localeOverride: store.getState().localeOverride,
      messagesLocale: store.getState().messagesLocale,
    });
  }

  function applyLocaleOverride(locale) {
    const store = window[STORE_FLAG];
    if (!store || typeof store.getState !== "function") {
      publishStatus({
        stage: "waiting",
        captured: false,
        reason: "store-missing",
      });
      return false;
    }

    store.getState().setLocaleOverride(locale);

    publishStatus({
      stage: "applied",
      captured: true,
      localeOverride: store.getState().localeOverride,
      messagesLocale: store.getState().messagesLocale,
    });

    return true;
  }

  function restoreAssign() {
    if (restoredAssign) {
      return;
    }

    if (Object.assign === patchedAssign) {
      Object.assign = originalAssign;
    }
    restoredAssign = true;
  }

  function readOverrideLocale() {
    try {
      const value = window.localStorage.getItem(OVERRIDE_STORAGE_KEY);
      return typeof value === "string" && value ? value : null;
    } catch {
      return null;
    }
  }

  function readStatus() {
    return window[STATUS_FLAG] ?? {
      stage: "unknown",
      captured: Boolean(window[STORE_FLAG]),
    };
  }

  function publishStatus(payload) {
    window[STATUS_FLAG] = payload;
    window.postMessage(
      {
        source: PAGE_REQUEST_SOURCE,
        type: "claude-i18n-runtime-status",
        payload,
      },
      window.location.origin,
    );
  }

  function isExtensionLocale(locale) {
    return typeof locale === "string" && EXTENSION_LOCALES.has(locale);
  }

  function readExtensionLocales() {
    try {
      const raw = window.localStorage.getItem(EXTENSION_LOCALES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? new Set(parsed) : new Set();
    } catch {
      return new Set();
    }
  }

  function toUrl(input) {
    try {
      if (input instanceof Request) {
        return new URL(input.url, window.location.href);
      }

      return new URL(String(input), window.location.href);
    } catch {
      return null;
    }
  }

  function isTargetI18nRequest(url) {
    if (!url || url.origin !== ORIGINAL_ORIGIN) {
      return false;
    }

    return (
      /^\/i18n\/[^/]+\.json$/.test(url.pathname) ||
      /^\/i18n\/statsig\/[^/]+\.json$/.test(url.pathname) ||
      /^\/i18n\/[^/]+\.overrides\.json$/.test(url.pathname)
    );
  }

  function isTargetGatedMessagesRequest(url) {
    if (!url || url.origin !== ORIGINAL_ORIGIN) {
      return false;
    }

    return url.pathname === "/web-api/gated-messages";
  }

  function requestExtensionPayload(locale, url) {
    return new Promise((resolve, reject) => {
      const requestId = `req-${Date.now()}-${requestCounter++}`;

      function handleMessage(event) {
        if (event.source !== window) {
          return;
        }

        const data = event.data;
        if (
          !data ||
          data.source !== PAGE_RESPONSE_SOURCE ||
          data.type !== "i18n-fetch-response" ||
          data.requestId !== requestId
        ) {
          return;
        }

        window.removeEventListener("message", handleMessage);

        if (!data.ok) {
          reject(new Error(data.error || "Unknown extension fetch error"));
          return;
        }

        resolve(data.payload);
      }

      window.addEventListener("message", handleMessage);
      window.postMessage(
        {
          source: PAGE_REQUEST_SOURCE,
          type: "i18n-fetch",
          requestId,
          locale,
          url,
        },
        window.location.origin,
      );
    });
  }
})();
