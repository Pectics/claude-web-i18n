# Claude Web i18n Exploration Notes

This file records the exploration history for the Chrome extension in this repo. It is intended as:

- the handoff document for future chat threads
- the source material for a later blog post
- the reference for why certain implementation choices were made

Date range: 2026-04-03 to 2026-04-04  
Primary workspace: `/mnt/f/claude-web-i18n`

## Goal

Build a Chrome extension that adds `简体中文` to Claude Web's language menu and makes Claude Web load a custom Chinese language pack, without requiring backend support from Claude for `zh-CN`.

## High-level result so far

Working now:

- The extension injects a custom `简体中文` entry into Claude's language submenu.
- The custom menu item visually matches the native Radix dropdown reasonably well.
- The extension maintains its own override state in `localStorage["claude-i18n:locale"]`.
- When override is active, i18n requests are intercepted and served from custom Chinese resources.
- Custom language resources are cached locally by the extension.
- Official language selection still works, and choosing an official language clears the override.

Partially working / in progress:

- Clicking `简体中文` currently still falls back to page reload if the page-level runtime i18n store cannot be found automatically.
- A fully reliable no-refresh language switch has been manually proven possible, but automatic runtime store discovery has not been made reliable yet.

## Key product constraint discovered

Claude Web does not accept arbitrary locales in its backend profile API.

Observed behavior:

- Choosing an official language triggers a profile update request.
- The backend stores a `locale` field such as `en-US`.
- Manually trying `zh-CN` causes backend validation failure:
  - `locale.str-enum[Locale]: Input is not one of the permitted values.`

Implication:

- We cannot make Claude "officially support" `zh-CN` via its backend locale field.
- We must keep the official locale on a supported value and layer our own override behavior on top.

## Architecture direction chosen

### State model

Do not rely on Claude's `spa:locale` as the source of truth for Chinese mode.

Instead:

- official locale remains whatever Claude supports
- extension override locale is stored separately:
  - `localStorage["claude-i18n:locale"] = "zh-CN"`

This decouples the custom translation mode from Claude's backend-enforced locale enum.

### Request interception model

Intercept Claude Web i18n requests in page context and serve custom resources:

- `/i18n/[locale].json`
- `/i18n/statsig/[locale].json`
- `/i18n/[locale].overrides.json`

Current behavior:

- base and statsig requests are redirected to custom Chinese resources
- overrides requests are intercepted and replaced with `{}` for simplicity

### Caching model

Language files are cached locally by the extension.

Current storage split:

- version metadata:
  - `chrome.storage.local["claude-i18n:versions"]`
- language bodies:
  - primarily `Cache Storage`
  - mirrored into `chrome.storage.local["claude-i18n:bodies"]` as fallback and debug aid

Version manifest endpoint expected from backend:

- `/version/[locale].json`

Example shape:

```json
{
  "locale": "zh-CN",
  "builtAt": "2026-04-03T15:03:13Z",
  "hash": [
    "hash-for-base-json",
    "hash-for-statsig-json"
  ]
}
```

Interpretation used:

- `hash[0]` = base i18n json hash
- `hash[1]` = statsig json hash

## Frontend exploration history

### 1. Understanding the menu system

Important discovery:

- Claude Web uses Radix UI menus rendered through a portal.
- Hovering `Language` creates a new menu under `document.body`.
- The submenu root looks like:
  - wrapper: `[data-radix-popper-content-wrapper]`
  - menu: `[data-radix-menu-content][role="menu"]`

Important structural relation:

- submenu has `aria-labelledby="<trigger-id>"`
- left-side trigger item has matching `id` and `aria-controls`

This allowed reliable identification of the language submenu.

### 2. Injecting the custom language item

Early attempts used loose text heuristics and accidentally injected into the profile menu too.

That was replaced with a more precise rule:

- find Radix submenu
- read `aria-labelledby`
- find the exact trigger element
- verify it is the `Language` submenu trigger
- only then inject `简体中文`

### 3. Making the injected item look native

Problems solved during iteration:

- hover highlight missing
- wrong selected checkmark behavior
- layout distortion due to cloning the wrong node

Current approach:

- clone an unselected official language item
- preserve Radix menu item structure
- manually apply hover state via `data-highlighted`
- render custom checkmark in the right-side indicator slot

### 4. Why `spa:locale` was not enough

Observed:

- editing `spa:locale` could affect some visible state temporarily
- but Claude's own selected language state did not re-read it on each hover
- refresh would restore an official locale anyway

Conclusion:

- `spa:locale` is not the real source of truth for custom language mode
- it is not sufficient for persistence or UI authority

## Runtime i18n loading exploration

### Key function identified

While stepping through code after language JSON was loaded, a function with this shape was found:

- it computes `a = localeOverride ?? locale`
- it fetches:
  - `/i18n/${a}.json`
  - `/i18n/statsig/${a}.json`
  - `/i18n/${a}.overrides.json`
- it merges those results
- it stores the merged messages into a global store

The corresponding Zustand-like store was identified in source as:

```js
const oW = S(e => ({
  messages: {},
  messagesLocale: null,
  gates: [],
  isLoaded: false,
  localeOverride: null,
  setGatedMessages: ...,
  setLocaleOverride: t => e({ localeOverride: t }),
  clearGatedMessages: ...
}))
```

Critical finding:

- calling `setLocaleOverride("zh-CN")` manually causes Claude Web to start requesting `zh-CN` language files without a page refresh

This proved that a fully no-refresh language switch is technically possible.

### What was manually verified

By pausing at the right runtime scope and exposing the store manually, the following was confirmed:

```js
window.__claudeI18nStore = oW
window.__claudeI18nStore.getState().setLocaleOverride("zh-CN")
```

Result:

- Claude Web re-runs the i18n loading flow
- requests `zh-CN` language resources
- if the extension intercepts them successfully, the page can switch language without reload

### Why auto-discovery is still unresolved

Multiple strategies were attempted:

- scanning React fibers by component name
- scanning React fibers by hook chain
- scanning candidate objects for Zustand-like store shape
- inspecting React props and click handlers on language menu items

These attempts did not produce a reliable automatic runtime handle to the store.

Important conclusion:

- no-refresh switching is proven in principle
- but automatic runtime store discovery is not yet reliable enough for production use

## 2026-04-04 targeted restart: runtime entry extraction

This section records the later "restart from scratch" exploration whose only goal was:

- find the real runtime callable language override entry
- avoid broad React / hook / store blind scanning
- identify a path that could eventually be automated inside the extension

### Fixed facts carried into this round

Already known before this round:

- backend profile locale is an enum and cannot be extended to `zh-CN`
- changing `spa:locale` is not sufficient
- calling the right in-scope `setLocaleOverride("zh-CN")` does trigger no-refresh i18n reloads
- broad fiber / hook / store blind scans were unstable and should not be the main strategy

### Confirmed runtime target

The real loader function was re-confirmed in current production assets. In this build it appeared as:

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
    const i = lW.getState().messagesLocale;
    ...
    r(d, l?.gates ?? [], n ? a : void 0)
  }, [o, l, c, r, a, s])
}
```

The store variable name drifted from a previous build's `oW` to current build's `lW`.

Critical implication:

- symbol names are unstable
- semantic anchors are stable enough:
  - `queryKey: ["i18n_public", a]`
  - `/i18n/statsig/`
  - `/web-api/gated-messages?locale=`
  - `getState().messagesLocale`

### What was stably proven in DevTools

Using a breakpoint inside the outer `useEffect` of the function above, the current build's store was directly readable:

```js
{
  hasGetState: true,
  keys: [
    "messages",
    "messagesLocale",
    "gates",
    "isLoaded",
    "localeOverride",
    "setGatedMessages",
    "setLocaleOverride",
    "clearGatedMessages"
  ],
  localeOverride: "ja-JP",
  setLocaleOverrideType: "function"
}
```

Then leaking it to global worked:

```js
window.__CLAUDE_I18N_STORE__ = lW
```

And manual calls through that leaked handle worked:

```js
window.__CLAUDE_I18N_STORE__.getState().setLocaleOverride("ja-JP")
```

Observed result:

- Claude Web re-requested locale assets with no page refresh
- this re-proved that `setLocaleOverride(...)` is the real runtime control entry

### Route 1 tried: replace the top-level `index-*.js` module with a patched `blob:` module

Goal:

- intercept the top module script at `document_start`
- fetch original source
- inject a line that leaks the store
- replace the original entry with a `blob:` module

What was implemented:

- a content script injected a page script before app boot
- the page script detected the `type="module"` top-level `index-*.js`
- it fetched the original source and patched the i18n loader signature
- it tried to preserve imports by rewriting relative module specifiers to absolute asset URLs
- it also tried rewriting `import.meta.url` to the original asset URL

Why this route was abandoned:

- even after patching relative imports and `import.meta.url`, the app boot path became unstable
- failures included module resolution problems and eventually application bootstrap crashes such as:
  - `Must call inside CurrentAccountProvider`
- conclusion:
  - replacing Claude's top-level Vite ESM entry with a `blob:` module changes runtime semantics too much
  - this is not a safe production route

Important takeaway:

- whole-entry replacement is too invasive
- future patching, if any, must be narrower than replacing the root module

### Route 2 tried: `chrome.debugger`-based extraction

Goal:

- avoid broad scanning
- use Chrome DevTools Protocol to attach to the Claude tab
- wait for the real `index-*.js` to parse
- fetch script source via `Debugger.getScriptSource`
- locate the unique i18n store signature in the real asset text
- set a breakpoint at the `lW.getState().messagesLocale` site
- when paused in the real call frame, leak the store and optionally call `setLocaleOverride(...)`

What was implemented in extension form:

- service worker attached via `chrome.debugger`
- it scanned current Claude tabs and listened to future tab updates
- it matched the production asset URL
- it matched the unique store signature in source
- it successfully exposed status such as:

```js
window.__CLAUDE_I18N_DEBUGGER_STATUS__
// => { ok: true, stage: "ready", storeVar: "lW" }
```

And the direct entry was still validated manually:

```js
window.__CLAUDE_I18N_STORE__.getState().setLocaleOverride("ja-JP")
```

Why this route is not acceptable as the final user-facing solution:

- Chrome shows a visible banner such as:
  - "this extension is debugging this page"
- that UX is unacceptable for normal end users

Current judgment on this route:

- useful as a development probe
- useful for deriving exact runtime anchors
- not acceptable as the final shipping mechanism

### Current best conclusion after this round

The main technical uncertainty has been resolved:

- the true runtime callable entry is the Zustand-like i18n store's `setLocaleOverride(...)`
- the store can be reached reliably if we hit the real i18n loader scope

The remaining problem is now narrower:

- how to expose or invoke that store/action without:
  - broad runtime blind scans
  - replacing the entire top-level module
  - using `chrome.debugger` in the shipped extension

### Recommended next step for the next exploration round

Do not spend time rediscovering the runtime entry.

Instead, treat these as fixed:

- `setLocaleOverride(...)` is the real entry
- the i18n loader signature around `queryKey: ["i18n_public", a]` is the best semantic anchor
- whole-entry `blob:` replacement is too invasive
- `chrome.debugger` is acceptable only as a temporary probe, not as the product solution

The next round should focus on one of these narrower directions:

- a less invasive runtime patch than replacing the root `index-*.js`
- hooking a smaller dynamic chunk or a later module boundary
- using a stable module/runtime factory interception point if one can be found without broad blind scanning
- using the debugger-derived exact source anchors only to design a non-debugger final injection

## Request interception exploration

### URLs observed

Claude Web requests resources like:

- `https://claude.ai/i18n/en-US.json`
- `https://claude.ai/i18n/statsig/en-US.json`
- `https://claude.ai/i18n/ja-JP.overrides.json`

Custom resources currently used:

- `https://claude-web-i18n.vercel.app/i18n/zh-CN.json`
- `https://claude-web-i18n.vercel.app/i18n/statsig/zh-CN.json`

### Important bug discovered and fixed

Initially only `en-US` requests were intercepted.

Bug:

- if user switched to French first, then enabled Chinese, the page requested `fr-FR.json`
- Chinese override failed because interception was hardcoded to `en-US`

Fix:

- intercept any official `/i18n/*.json` and `/i18n/statsig/*.json`
- always remap them to custom `zh-CN` resources when override is active

## Current extension file roles

### `/mnt/f/claude-web-i18n/extension/script.js`

Responsibilities:

- inject custom `简体中文` menu item
- maintain `claude-i18n:locale`
- bridge messages between page script and extension service worker
- try to invoke no-refresh locale override if available
- otherwise fall back to reload

### `/mnt/f/claude-web-i18n/extension/hook.js`

Responsibilities:

- run in page context
- intercept `fetch` and `XMLHttpRequest` for i18n requests
- ask extension backend for cached/custom language payloads
- attempt to discover runtime i18n store
- expose page-level locale override actions through `window.postMessage`

Status:

- request interception works
- store discovery logic is still unreliable

### `/mnt/f/claude-web-i18n/extension/service.js`

Responsibilities:

- respond to page interception requests
- fetch remote Chinese resources
- check `/version/[locale].json`
- cache i18n bodies locally
- return cached payloads when fresh

Status:

- version-aware language pack serving works
- overrides are returned as inline empty object

## Cache behavior verified

Verified from runtime logs:

- `hook.js` logs:
  - `served i18n request via extension cache`
- `cacheStatus: "hit-cache-storage"` was observed

This confirms:

- request interception works
- local cache is actually being used

Extension DevTools checks that proved useful:

```js
await caches.keys()
const cache = await caches.open('claude-i18n-cache-v1');
await cache.keys();
const res = await cache.match('https://cache.claude-i18n.local/zh-CN.json');
await res.text();
```

## Best current idea for no-refresh switching

Because automatic store discovery is unreliable, the most practical fallback idea is:

- when user clicks `简体中文`
- write `claude-i18n:locale = "zh-CN"`
- programmatically click an official language item in the menu
- let Claude's own click handler trigger its normal no-refresh i18n reload chain
- requests are intercepted, so even if official handler requests `en-US` or another supported locale, the extension returns Chinese resources

Why this is promising:

- no need to find Zustand store directly
- reuses Claude's own supported interaction path
- likely more stable than runtime store scanning

This idea was proposed but not yet fully implemented in code.

## Backend notes for future blog post

There is additional backend work in another thread.

That should eventually be incorporated into the blog post, especially:

- serving version manifests
- serving custom i18n base/statsig payloads
- cache invalidation design
- deployment details on Vercel

## Recommended next steps

### Product-level next step

Implement the "programmatically click an official language item" approach for no-refresh switching.

Suggested flow:

1. user clicks `简体中文`
2. extension writes `claude-i18n:locale = "zh-CN"`
3. extension finds one official menu item, preferably the currently selected one or the first official item
4. extension calls `.click()` on that item
5. Claude's own language change pipeline runs
6. extension intercepts requests and serves Chinese resources

Fallback:

- if programmatic click fails, reload the page

### Engineering cleanup next step

After no-refresh flow is stable:

- clean up store-discovery code that is no longer needed
- reduce exploration-only logging
- add explicit cache invalidation / manual clear helpers

## Blog post angle ideas

Potential post theme:

"How I added a non-existent language to Claude Web with a Chrome extension"

Suggested sections:

1. Why backend locale spoofing fails
2. How Claude Web really loads i18n messages
3. Radix UI portal menus and injecting a fake language entry
4. Intercepting i18n requests in page context
5. Serving and caching custom language packs
6. The tradeoff between runtime store hacking and reusing official click flows

## Resume checklist for a new thread

When resuming in a new chat:

- read this file first
- inspect:
  - `/mnt/f/claude-web-i18n/extension/script.js`
  - `/mnt/f/claude-web-i18n/extension/hook.js`
  - `/mnt/f/claude-web-i18n/extension/service.js`
- do not re-explore backend locale enum rejection from scratch
- do not re-explore `spa:locale` as the primary state source
- prioritize the official-item `.click()` no-refresh strategy
