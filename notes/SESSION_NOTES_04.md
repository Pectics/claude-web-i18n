# SESSION_NOTES_04

Date: 2026-04-04  
Workspace: `/mnt/f/claude-web-i18n`

## Scope

This file records only the exploration that happened in this chat session.

Primary topic:

- Claude Web runtime i18n reverse engineering
- locating the real runtime language override entry
- extension implementation attempts to automate access to that entry

This is a raw session archive, not a polished article.

## Session Goal

Fixed goal at the start of the session:

- find the real callable runtime language override entry in Claude Web
- specifically something equivalent to:
  - `setLocaleOverride`
  - `store.getState().setLocaleOverride(...)`
  - or another no-refresh runtime action that triggers i18n reload
- prioritize a stable extension-usable route to obtain that runtime entry
- avoid broad React fiber scanning / hook scanning / blind store scanning as the main strategy

## Known Constraints At Session Start

These were provided as already-established facts and were not supposed to be re-proven:

1. Claude backend profile `locale` is an enum and does not directly accept arbitrary values such as `zh-CN`.
2. Changing `spa:locale` alone is insufficient and is not the final source of truth.
3. Manually calling the correct runtime `setLocaleOverride("zh-CN")` in the right scope already proved that Claude Web can no-refresh request:
   - `/i18n/zh-CN.json`
   - `/i18n/statsig/zh-CN.json`
   - `/i18n/zh-CN.overrides.json`
4. Therefore no-refresh language switching is possible in principle; the remaining problem is obtaining the runtime entry reliably from an extension.
5. Previous broad exploration methods had already been tried and were deprioritized:
   - generic React fiber scanning
   - generic hook-chain scanning
   - blind runtime store scanning

## Initial Repository State Read

Files observed at the start:

- [`extension/manifest.json`](/mnt/f/claude-web-i18n/extension/manifest.json)
- [`extension/panel.html`](/mnt/f/claude-web-i18n/extension/panel.html)
- [`extension.bak/manifest.json`](/mnt/f/claude-web-i18n/extension.bak/manifest.json)
- [`extension.bak/hook.js`](/mnt/f/claude-web-i18n/extension.bak/hook.js)
- [`extension.bak/script.js`](/mnt/f/claude-web-i18n/extension.bak/script.js)
- [`extension.bak/service.js`](/mnt/f/claude-web-i18n/extension.bak/service.js)
- [`EXPLORATION_NOTES.md`](/mnt/f/claude-web-i18n/EXPLORATION_NOTES.md)

Observed current-state facts:

- current `extension/` was a minimal skeleton only
- old experimentation code still existed under `extension.bak/`
- this session therefore treated the task as a fresh targeted exploration, not an incremental patch on deleted old code

## Source Clue Used As Anchor

The user supplied a deobfuscated source shape for the i18n loader and the Zustand-like store.

Important source clue:

```js
function Wsn() {
    const {locale: e} = L()
      , {activeOrganization: t} = TI()
      , n = t?.uuid
      , s = oW(e => e.localeOverride)
      , a = s ?? e
      , r = oW(e => e.setGatedMessages)
      , i = oW(e => e.clearGatedMessages)
      , {data: o} = f({
        queryKey: ["i18n_public", a],
        queryFn: async () => {
            const e = encodeURIComponent(a)
              , t = "en-US" !== a
              , [n,s,r] = await Promise.all([
                  fetch(`/i18n/${e}.json`),
                  fetch(`/i18n/statsig/${e}.json`),
                  t ? fetch(`/i18n/${e}.overrides.json`).catch(() => null) : Promise.resolve(null)
              ]);
            ...
        }
    })
    ...
    d.useEffect(() => {
        const d = {
            ...o,
            ...l?.messages
        };
        r(d, l?.gates ?? [], n ? a : void 0)
    }, [o, l, c, r, a, s])
}
```

Store definition clue:

```js
const oW = S(e => ({
    messages: {},
    messagesLocale: null,
    gates: [],
    isLoaded: !1,
    localeOverride: null,
    setGatedMessages: (t, n, s) => e(e => ({
        messages: t,
        gates: n,
        messagesLocale: s ?? e.messagesLocale,
        isLoaded: !0
    })),
    setLocaleOverride: t => e({
        localeOverride: t
    }),
    clearGatedMessages: () => e({
        messages: {},
        messagesLocale: null,
        gates: [],
        isLoaded: !1
    })
}))
```

This clue became the main signature used throughout the session.

## Phase 1: Confirm webpack/chunk entry access

### Step 1.1: detect runtime chunk container

Console command used:

```js
Object.entries(window)
  .filter(([k, v]) => Array.isArray(v) && /chunk|webpack/i.test(k))
  .map(([k, v]) => ({ key: k, length: v.length, push: typeof v.push }))
```

Observed result:

```js
[
  {
    "key": "webpackChunkDestination",
    "length": 1,
    "push": "function"
  }
]
```

Confirmed fact:

- Claude Web exposes a webpack-style chunk container named `webpackChunkDestination`

### Step 1.2: extract `__webpack_require__`

Console command used:

```js
window.webpackChunkDestination.push([
  [Symbol("claude-i18n-probe")],
  {},
  function (__webpack_require__) {
    window.__CLAUDE_WP_REQUIRE__ = __webpack_require__;
  }
]);

typeof window.__CLAUDE_WP_REQUIRE__
```

Observed result:

```js
"function"
```

Confirmed fact:

- runtime `__webpack_require__` is retrievable from the chunk loader

## Phase 2: Attempt direct module/cache discovery

### Step 2.1: search webpack factories by source string

Console command used:

```js
(() => {
  const req = window.__CLAUDE_WP_REQUIRE__;
  const mods = req.m || {};
  const needles = [
    "setLocaleOverride",
    "localeOverride",
    "i18n_public",
    "/i18n/statsig/",
    "clearGatedMessages",
    "setGatedMessages"
  ];

  return Object.entries(mods)
    .map(([id, factory]) => {
      const src = Function.prototype.toString.call(factory);
      const hits = needles.filter((s) => src.includes(s));
      return hits.length ? { id, hits } : null;
    })
    .filter(Boolean)
    .slice(0, 20);
})()
```

Observed result:

- `[]`

Conclusion:

- `Function.prototype.toString()` on `req.m` factory functions was not a reliable way to recover meaningful source anchors here

### Step 2.2: search webpack cache for Zustand-like exports

Console command used:

```js
(() => {
  const req = window.__CLAUDE_WP_REQUIRE__;
  const cache = req.c || {};
  const out = [];

  for (const [id, mod] of Object.entries(cache)) {
    const exp = mod && mod.exports;
    const candidates = [exp];

    if (exp && typeof exp === "object") {
      for (const v of Object.values(exp)) candidates.push(v);
    }

    for (const v of candidates) {
      if (!v || typeof v !== "function") continue;
      if (typeof v.getState !== "function") continue;

      let state;
      try {
        state = v.getState();
      } catch {
        continue;
      }
      if (!state || typeof state !== "object") continue;

      const hasLocaleOverride = Object.prototype.hasOwnProperty.call(state, "localeOverride");
      const hasSetter = typeof state.setLocaleOverride === "function";
      const hasGated =
        typeof state.setGatedMessages === "function" &&
        typeof state.clearGatedMessages === "function";

      if (hasLocaleOverride || hasSetter || hasGated) {
        out.push({
          id,
          exportType: typeof exp,
          keys: Object.keys(state).slice(0, 12),
          hasLocaleOverride,
          hasSetter,
          hasGated,
        });
      }
    }
  }

  return out;
})()
```

Observed result:

- `[]`

Conclusion:

- the store was not directly exposed in a form detectable from webpack module cache exports
- module-internal closure scope remained the likely location

## Phase 3: Runtime breakpoint strategy on real i18n loader

This became the first successful route in the session.

### Step 3.1: hook `fetch` and break on i18n requests

Console command used:

```js
(() => {
  if (window.__CLAUDE_I18N_FETCH_HOOKED__) return "already hooked";

  const rawFetch = window.fetch;
  window.__CLAUDE_I18N_FETCH_HOOKED__ = true;

  window.fetch = function (...args) {
    const url = String(args[0] && args[0].url ? args[0].url : args[0]);
    if (
      url.includes("/i18n/") ||
      url.includes("/web-api/gated-messages?locale=")
    ) {
      debugger;
    }
    return rawFetch.apply(this, args);
  };

  "hooked";
})()
```

Then an official language switch was triggered manually to cause a pause.

### Step 3.2: inspect call stack

Observed call stack shape from screenshot:

- `window.fetch`
- `queryFn`
- `fetchFn`
- additional vendor stack frames

Important observation:

- one caller frame was a function named `queryFn` inside `index-0ZPjnUcp.js`

### Step 3.3: inspect source around paused `queryFn`

After opening the source around the `queryFn` frame, the actual minified runtime function was obtained:

```js
function rsn() {
    const {locale: e} = L()
      , {activeOrganization: t} = LI()
      , n = t?.uuid
      , s = lW(e => e.localeOverride)
      , a = s ?? e
      , r = lW(e => e.setGatedMessages)
      , i = lW(e => e.clearGatedMessages)
      , {data: o} = f({
        queryKey: ["i18n_public", a],
        queryFn: async () => {
            const e = encodeURIComponent(a)
              , t = "en-US" !== a
              , [n,s,r] = await Promise.all([fetch(`/i18n/${e}.json`), fetch(`/i18n/statsig/${e}.json`), t ? fetch(`/i18n/${e}.overrides.json`).catch( () => null) : Promise.resolve(null)]);
            ...
        }
    })
    ...
    d.useEffect( () => {
        const e = !!o
          , t = !!l
          , n = e && (t || c || Ad);
        if (!e && !t)
            return;
        const i = lW.getState().messagesLocale;
        if (!!s && s !== i && !n)
            return;
        const d = {
            ...o,
            ...l?.messages
        };
        r(d, l?.gates ?? [], n ? a : void 0)
    }
    , [o, l, c, r, a, s])
}
```

Confirmed fact:

- the target function still exists in runtime
- the minified store variable name in this build was `lW`
- therefore symbol names drift, but the semantic structure remains stable

### Step 3.4: initial attempt to `eval("oW")` / `eval("lW")` in `queryFn` frame

Attempt:

- inspect locals in the `queryFn` frame with `eval`

Observed result:

- all candidate names were `<missing>`

Conclusion:

- the inner async `queryFn` frame did not expose the outer lexical binding directly through simple `eval(...)`
- this did not disprove the existence of the store; it only meant the wrong frame was selected

### Step 3.5: breakpoint on `lW.getState().messagesLocale`

The next instruction was:

- set a breakpoint on:

```js
const i = lW.getState().messagesLocale;
```

Then after pausing at that outer frame, this console expression was run:

```js
({
  hasGetState: !!(lW && typeof lW.getState === "function"),
  keys: lW ? Object.keys(lW.getState()) : null,
  localeOverride: lW?.getState?.().localeOverride,
  setLocaleOverrideType: typeof lW?.getState?.().setLocaleOverride
})
```

Observed result:

```js
{
  "hasGetState": true,
  "keys": [
    "messages",
    "messagesLocale",
    "gates",
    "isLoaded",
    "localeOverride",
    "setGatedMessages",
    "setLocaleOverride",
    "clearGatedMessages"
  ],
  "localeOverride": "ja-JP",
  "setLocaleOverrideType": "function"
}
```

Confirmed fact:

- at the correct outer frame, the runtime store is directly accessible
- it exposes the exact expected state keys and methods
- `setLocaleOverride` is the real callable runtime entry

### Step 3.6: leak store to global object

While paused in the correct frame, this was executed:

```js
window.__CLAUDE_I18N_STORE__ = lW
```

After resume, in normal console:

```js
({
  ok: !!window.__CLAUDE_I18N_STORE__,
  keys: Object.keys(window.__CLAUDE_I18N_STORE__.getState()),
  localeOverride: window.__CLAUDE_I18N_STORE__.getState().localeOverride
})
```

Observed result:

```js
{
  "ok": true,
  "keys": [
    "messages",
    "messagesLocale",
    "gates",
    "isLoaded",
    "localeOverride",
    "setGatedMessages",
    "setLocaleOverride",
    "clearGatedMessages"
  ],
  "localeOverride": "ja-JP"
}
```

Confirmed fact:

- once leaked from module scope, the store remains callable from global page context

## Phase 4: Live call verification of runtime entry

Later in the session, after extension automation reached the point of exposing the store automatically, this manual console command was run:

```js
window.__CLAUDE_I18N_STORE__.getState().setLocaleOverride("zh-CN")
```

Observed result:

- Claude Web immediately re-requested the zh-CN i18n resources
- however, since official Claude infrastructure does not actually host zh-CN files, the page could not complete a real zh-CN switch from official assets
- user clarified that changing to `ja-JP` works because those official files exist

Confirmed fact:

- the real runtime action is callable from the extracted store
- the action triggers no-refresh i18n reload
- the absence of official zh-CN assets is separate from the runtime entry problem

## Phase 5: Attempted extension automation via main bundle replacement

This was the first extension implementation route attempted in this session.

### Motivation

Hypothesis:

- since the i18n loader signature in the entry bundle appeared stable
- and the top-level module script could be identified
- the extension might replace the original `index-*.js` module with a patched blob version that leaks the store

### Repository changes for this attempt

Files created or modified during this route:

- [`extension/manifest.json`](/mnt/f/claude-web-i18n/extension/manifest.json)
- [`extension/bootstrap.js`](/mnt/f/claude-web-i18n/extension/bootstrap.js)
- [`extension/page-hook.js`](/mnt/f/claude-web-i18n/extension/page-hook.js)

Purpose:

- inject a page script at `document_start`
- identify the main `type="module"` entry script
- fetch its source
- patch it to expose `window.__CLAUDE_I18N_STORE__`
- replace the original module with a `blob:` URL version

### Supporting runtime checks

Observed main script element:

```js
{
  "src": "https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/index-0ZPjnUcp.js",
  "type": "module",
  "async": false,
  "defer": false,
  "crossOrigin": "anonymous",
  "nonce": "iMHA5u7azykOKSvnqug4XA==",
  "outerHTML": "<script type=\"module\" crossorigin=\"\" src=\"https://assets-proxy.anthropic.com/claude-ai/v2/assets/v1/index-0ZPjnUcp.js\" nonce=\"\"></script>"
}
```

Blob module feasibility test:

```js
(async () => {
  try {
    const code = 'window.__CLAUDE_BLOB_MODULE_OK__ = 1;';
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const s = document.createElement('script');
    s.type = 'module';
    s.src = url;

    const done = new Promise((resolve) => {
      s.onload = () => resolve({ loaded: true, flag: window.__CLAUDE_BLOB_MODULE_OK__ === 1 });
      s.onerror = (e) => resolve({ loaded: false, error: String(e) });
    });

    document.head.appendChild(s);
    const result = await done;
    URL.revokeObjectURL(url);
    s.remove();
    return result;
  } catch (e) {
    return { loaded: false, error: String(e) };
  }
})()
```

Observed result:

```js
{
  "loaded": true,
  "flag": true
}
```

Confirmed fact:

- CSP allowed `blob:` module execution

### Bundle text inspection done locally from terminal

Once local terminal fetches were adjusted with `Origin`, `Referer`, and `User-Agent` headers, the same bundle could be downloaded and inspected from the workspace environment.

Important bundle observations:

- `i18n_public` occurred exactly once
- `/web-api/gated-messages?locale=` occurred exactly once
- `/i18n/statsig/` occurred exactly once
- `.getState().messagesLocale` occurred exactly once
- the minified function exactly matched the runtime-discovered `rsn` / `lW` structure

This confirmed that entry bundle source patching was possible in theory.

### Failure progression in this route

Several patch revisions were attempted:

1. patch around `.getState().messagesLocale`
2. patch around the fuller signature containing:
   - `queryKey:["i18n_public",a]`
   - `lW(e=>e.localeOverride)`
   - `lW(e=>e.setGatedMessages)`
   - `lW(e=>e.clearGatedMessages)`
3. rewrite relative module specifiers such as:
   - `from "./vendor-D_tHagme.js"`
   - `import("./c6fceefc5-BZ5tXeGv.js")`
4. replace `import.meta.url` with the original entry module absolute URL

Observed failures:

- at first, `window.__CLAUDE_I18N_PATCH_STATUS__` reported `loaded`, but `window.__CLAUDE_I18N_STORE__` was absent
- then runtime error:

```txt
Failed to resolve module specifier "./vendor-D_tHagme.js". Invalid relative url or base scheme isn't hierarchical.
```

- after further rewriting, the page began to crash with:

```txt
Error: Must call inside CurrentAccountProvider
```

and the UI showed a Claude outage-style error screen

### Local evidence explaining likely cause

Local source analysis showed:

- `import.meta.url` appears 106 times in the entry bundle
- Vite runtime heavily relies on it for dynamic import and preload handling

Conclusion for this route:

- replacing the main entry bundle with a `blob:` module materially changes the Vite runtime environment
- even aggressive specifier rewriting did not preserve full runtime semantics
- this route was judged unsuitable for reliable product use and was abandoned

## Phase 6: Attempted extension automation via `chrome.debugger`

This became the successful automation route for development/probing, but not for end-user release.

### Motivation

Given the successful manual breakpoint extraction, the next idea was:

- let the extension attach Chrome DevTools Protocol to Claude tabs
- wait for the real `index-*.js` script to parse
- locate the unique i18n loader signature in script source
- set a breakpoint at the `lW.getState().messagesLocale` position
- when paused in the correct call frame, evaluate:
  - `window.__CLAUDE_I18N_STORE__ = lW`
  - optionally call `setLocaleOverride(...)`

### Repository changes for this attempt

Files modified:

- [`extension/manifest.json`](/mnt/f/claude-web-i18n/extension/manifest.json)
- [`extension/service.js`](/mnt/f/claude-web-i18n/extension/service.js)

Files removed from prior failed route:

- [`extension/bootstrap.js`](/mnt/f/claude-web-i18n/extension/bootstrap.js)
- [`extension/page-hook.js`](/mnt/f/claude-web-i18n/extension/page-hook.js)

Manifest changes included:

- add `debugger`
- add `tabs`
- add background service worker
- add host permission for `https://assets-proxy.anthropic.com/*`

### Initial debugger automation behavior

After implementation, the page reported:

```js
{
  "ok": true,
  "stage": "ready",
  "storeVar": "lW"
}
```

This meant:

- the debugger-attached extension could automatically locate the target script and extract the store variable name
- the store was automatically exposed without manual DevTools scope probing

At that stage, this was the strongest confirmation in the session that extension-side automation of the runtime entry was possible.

### Auto-apply extension storage attempt

The service worker was then extended to read:

- `chrome.storage.local["claude-i18n:locale"]`

and call:

```js
window.__CLAUDE_I18N_STORE__.getState().setLocaleOverride(storedLocale)
```

However, on the next round this no longer appeared to fire, and page-side status became `undefined`.

### Instrumentation added to debugger route

To diagnose this, the service worker was instrumented with logging and open-tab scanning.

Added behaviors:

- log service worker boot
- scan existing `https://claude.ai/*` tabs on startup/install
- log debugger attach and breakpoint events

Observed service worker logs:

```txt
[claude-i18n] service worker boot
[claude-i18n] scanning open Claude tabs
[claude-i18n] attaching debugger
[claude-i18n] extension installed or reloaded
[claude-i18n] debugger attached
[claude-i18n] scanning open Claude tabs
[claude-i18n] debugger already attached
[claude-i18n] attaching debugger
[claude-i18n] debugger attached
[claude-i18n] runtime/debugger enabled
[claude-i18n] debugger already attached
[claude-i18n] runtime/debugger enabled
[claude-i18n] breakpoint set
[claude-i18n] breakpoint set
[claude-i18n] tabs.onUpdated {tabId: ..., url: 'https://claude.ai/new', status: 'loading'}
[claude-i18n] debugger already attached {tabId: ...}
[claude-i18n] tabs.onUpdated {tabId: ..., url: 'https://claude.ai/new', status: undefined}
[claude-i18n] tabs.onUpdated {tabId: ..., url: 'https://claude.ai/new', status: 'complete'}
```

Important observation:

- breakpoint was being set
- but no `paused` event was seen

### Interpretation of debugger issue

Likely reason identified during the session:

- the breakpoint was being set after the already-parsed script had advanced too far for that load
- for a minified single-line bundle, timing is tight
- therefore a refinement was proposed:
  - use `Debugger.setBreakpointByUrl`
  - then auto-reload the tab
  - catch the next execution before the target line runs

This refinement was implemented, but before continuing down that path, a product concern interrupted the route.

### Product/UX concern that stopped this route

User observed:

- every page refresh showed Chrome’s visible banner that the extension was debugging the page

This led to an explicit decision:

- `chrome.debugger` may be acceptable as a development probe
- it is not acceptable as the final shipped user-facing implementation

Confirmed conclusion:

- debugger route is valuable as a precise runtime probe
- debugger route is not acceptable as final product UX

## Confirmed Facts By End Of Session

These were firmly established in this session:

1. Claude Web uses a webpack chunk container `webpackChunkDestination`.
2. `__webpack_require__` can be retrieved from that chunk runtime.
3. The real i18n loader exists in runtime in a minified function matching the expected semantic shape.
4. The minified symbol name for the store changes by build; in this session/build it was `lW`.
5. The correct runtime store shape is:

```js
{
  messages,
  messagesLocale,
  gates,
  isLoaded,
  localeOverride,
  setGatedMessages,
  setLocaleOverride,
  clearGatedMessages
}
```

6. `setLocaleOverride(...)` is the real callable runtime action.
7. Calling `setLocaleOverride(...)` triggers no-refresh i18n requests.
8. The runtime store can be exposed to `window` if execution pauses in the correct outer frame.
9. An extension can automate discovery of the correct runtime scope using `chrome.debugger`.
10. `chrome.debugger` causes visible Chrome “debugging this page” UX and is therefore not suitable for final release.
11. Replacing the main Vite entry bundle with a patched `blob:` module is not safe enough; it breaks runtime assumptions.

## Failures / Abandoned Routes

### 1. Webpack factory string search

Why tried:

- hoped that `req.m` factory source would still contain stable strings

Why failed:

- `Function.prototype.toString()` on module factories did not yield usable searchable text here

### 2. Webpack cache export scan

Why tried:

- hoped the Zustand store API might already be exported by some loaded module

Why failed:

- no matching exported store API was found
- store lived in module lexical scope instead

### 3. Reading locals from wrong paused frame

Why tried:

- direct `eval` in paused `queryFn` frame

Why failed:

- the outer store binding was not directly visible from that inner frame

### 4. Main entry bundle replacement with patched `blob:` module

Why tried:

- direct, deterministic way to expose store early without runtime scanning

Why failed:

- relative module specifier issues
- `import.meta.url` dependence throughout Vite runtime
- eventually page bootstrap corruption (`CurrentAccountProvider` error)

### 5. `chrome.debugger` as final implementation

Why tried:

- it was the cleanest automation route to the exact runtime scope

Why abandoned for productization:

- Chrome shows a visible debugging indicator/banner
- unacceptable UX for released extension

## Code / File Changes Made During This Session

### Files modified while testing the main-bundle replacement route

- [`extension/manifest.json`](/mnt/f/claude-web-i18n/extension/manifest.json)
  - add content script injection and web-accessible page hook for bundle replacement
- [`extension/bootstrap.js`](/mnt/f/claude-web-i18n/extension/bootstrap.js)
  - inject page script at `document_start`
- [`extension/page-hook.js`](/mnt/f/claude-web-i18n/extension/page-hook.js)
  - identify main module script
  - fetch source
  - patch source
  - attempt blob replacement
  - rewrite relative imports and `import.meta.url`

These files were later removed when the route was abandoned.

### Files modified while testing the debugger route

- [`extension/manifest.json`](/mnt/f/claude-web-i18n/extension/manifest.json)
  - switch to `debugger` + `tabs` permissions
  - register background service worker
  - allow access to asset host
- [`extension/service.js`](/mnt/f/claude-web-i18n/extension/service.js)
  - attach debugger to Claude tabs
  - enable Runtime / Debugger domains
  - fetch target script source
  - locate i18n store signature
  - set breakpoint
  - evaluate on call frame to expose store
  - later read extension storage and attempt auto-apply locale
  - later add service worker logging and open-tab scanning
  - later add URL-based future breakpoint and reload strategy

## Important Commands / Snippets Collected From This Session

### Runtime chunk probe

```js
window.webpackChunkDestination.push([
  [Symbol("claude-i18n-probe")],
  {},
  function (__webpack_require__) {
    window.__CLAUDE_WP_REQUIRE__ = __webpack_require__;
  }
]);
```

### Fetch breakpoint hook

```js
window.fetch = function (...args) {
  const url = String(args[0] && args[0].url ? args[0].url : args[0]);
  if (
    url.includes("/i18n/") ||
    url.includes("/web-api/gated-messages?locale=")
  ) {
    debugger;
  }
  return rawFetch.apply(this, args);
};
```

### Correct frame verification

```js
({
  hasGetState: !!(lW && typeof lW.getState === "function"),
  keys: lW ? Object.keys(lW.getState()) : null,
  localeOverride: lW?.getState?.().localeOverride,
  setLocaleOverrideType: typeof lW?.getState?.().setLocaleOverride
})
```

### Leak runtime store

```js
window.__CLAUDE_I18N_STORE__ = lW
```

### Manual runtime action

```js
window.__CLAUDE_I18N_STORE__.getState().setLocaleOverride("zh-CN")
```

### Page-side blob module feasibility test

```js
(async () => {
  const code = 'window.__CLAUDE_BLOB_MODULE_OK__ = 1;';
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  const s = document.createElement('script');
  s.type = 'module';
  s.src = url;
  ...
})()
```

## Confirmed Facts vs. Inference

### Confirmed facts

- runtime store exists and is directly callable in the correct scope
- `setLocaleOverride(...)` is the real no-refresh trigger
- symbol names drift across builds
- debugger route can automate runtime entry discovery
- blob main-entry replacement is unstable

### Inference / likely interpretation

- the main reason blob replacement failed is not the store patch itself, but broader Vite runtime dependence on `import.meta.url` and original module environment
- a viable final non-debugger route will likely need a more surgical injection point than replacing the entire entry bundle

These are strong inferences from observed failures, but not fully closed proofs.

## Unfinished Items

1. A final production-safe, non-debugger method to expose or call the runtime store has not yet been implemented.
2. The refined `setBreakpointByUrl` + reload debugger strategy was prepared, but not fully explored after the UX concern surfaced.
3. Automatic no-refresh locale override from extension storage was not fully validated end-to-end.
4. Request interception and custom zh-CN asset serving were not the focus of this session and remain out of scope here.

## Next-Step Recommendations

These are recommendations based only on this session’s results.

1. Treat `chrome.debugger` as a development probe only.
2. Preserve the confirmed runtime target:
   - the i18n store in the `rsn`-like loader
   - `store.getState().setLocaleOverride(...)`
3. Do not continue investing in whole-entry `blob:` bundle replacement.
4. Use the debugger-proven target scope to derive a narrower non-debugger patch strategy.
5. Candidate next route:
   - identify a smaller or later-loading chunk / runtime seam
   - inject only enough code to leak the store once
   - avoid changing the entire Vite entry environment

## Session End State

By the end of the session, the core reverse-engineering question was effectively answered:

- the real runtime entry is the Zustand-like i18n store’s `setLocaleOverride(...)`
- the store can be reached in the real `rsn`-like i18n loader scope
- extension automation of discovery is technically possible
- but the two automation routes explored here split cleanly:
  - `blob` entry replacement: technically possible to attempt, but runtime-breaking and abandoned
  - `chrome.debugger`: technically successful as a probe, but not acceptable for final user-facing release

This leaves the project in a more constrained but clearer state than before the session:

- the runtime target is no longer unknown
- the remaining problem is specifically how to reach that target without debugger UX and without destabilizing Claude Web’s module runtime
