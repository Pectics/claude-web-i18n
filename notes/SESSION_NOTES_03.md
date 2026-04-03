# Session Notes 03

This file is a raw session archive for the Claude Web i18n reverse-engineering and Chrome extension work that happened in this chat only.

It is not a polished article draft. It is intended to preserve:

- the real exploration path
- verified findings
- failed routes
- runtime observations
- concrete commands / snippets / object shapes
- code changes made during this session

Date context from session:

- 2026-04-03 to 2026-04-04
- workspace: `/mnt/f/claude-web-i18n`

## Scope of this record

This document only covers work that actually happened in this session:

- initial inspection of the `extension` directory
- menu injection work for Claude Web language UI
- request interception and local caching experiments
- runtime reverse-engineering to find the internal i18n switching entrypoint
- the eventual conclusion that the next exploration thread should focus specifically on acquiring a callable `setLocaleOverride` path

It does not summarize all prior or future threads.

## Initial goal at the start of the session

The immediate user goal at the start was to inspect the `extension` folder and understand the Chrome extension being developed.

That then evolved into the concrete product goal:

- add a custom `简体中文` option to Claude Web's language submenu
- make Claude Web load custom Chinese language resources through the extension
- ideally make switching happen without a full page refresh

## Initial repository / extension state observed

Early inspection found the `extension` directory contained:

- `extension/hello.html`
- `extension/claude.png`
- `extension/manifest.json`
- `extension/script.js`

Observed state:

- `manifest.json` used Manifest V3
- popup pointed at `hello.html`
- `hello.html` referenced `popup.js`, but that file did not exist
- `script.js` was mostly commented-out Chrome tutorial sample code and contained no useful Claude Web logic

### Files inspected at the beginning

- `/mnt/f/claude-web-i18n/extension/manifest.json`
- `/mnt/f/claude-web-i18n/extension/hello.html`
- `/mnt/f/claude-web-i18n/extension/script.js`

### Early technical conclusion

Confirmed facts:

- the extension started as a minimal scaffold
- popup was broken because `popup.js` was missing
- the content script had no real behavior yet

## First Chrome extension issue found and fixed

When trying to load the extension, Chrome reported:

- `Invalid value for 'content_scripts[0].matches[0]': Empty path.`

Cause:

- `manifest.json` included `https://claude.ai` in `matches`
- Chrome requires a path, so the correct match was `https://claude.ai/*`

### Code change made

File changed:

- `/mnt/f/claude-web-i18n/extension/manifest.json`

Purpose:

- remove invalid `https://claude.ai`
- keep valid `https://claude.ai/*`

## Discovering how the Claude language menu works

The user investigated the DOM behavior manually in DevTools.

Important confirmed fact:

- hovering the `Language` block does not toggle visibility of a pre-existing menu
- instead, a new DOM subtree is inserted into `document.body`

The user observed the inserted node:

```html
<div data-radix-popper-content-wrapper ...>
  <div data-radix-menu-content="" role="menu" ...>
```

This established that Claude Web was using a Radix UI portal / popper menu.

Also observed:

- the submenu appears under `body`, not nested under the left menu
- trying to trace raw React call stacks from subtree modification breakpoints was noisy and not useful

### Useful runtime structure captured

Observed wrapper:

- `[data-radix-popper-content-wrapper]`

Observed actual menu node:

- `[data-radix-menu-content][role="menu"]`

Observed trigger relationship:

- submenu had `aria-labelledby="radix-..."`
- left-side `Language` menu item had matching `id`
- left-side trigger also had `aria-controls` matching the submenu `id`

### Conclusion

Confirmed fact:

- the correct strategy for identifying the language submenu is not text heuristics alone
- it should use the Radix relationship between submenu `aria-labelledby` and trigger `id`

## Building the injected `简体中文` menu item

The first real implementation work was in `extension/script.js`.

The content script was rewritten from the old tutorial sample into a Radix menu observer:

- observe new nodes added under `body`
- detect `data-radix-popper-content-wrapper`
- find the nested menu
- attempt to identify the language submenu
- inject a cloned custom menu item labeled `简体中文`

### Files changed during this phase

- `/mnt/f/claude-web-i18n/extension/script.js`

### Early behavior

The script successfully injected `简体中文`, but the first version had a major false positive:

- the custom item was inserted into the first-level profile menu as well

Reason:

- the submenu detection logic was too broad and text-based

## Failure route: broad text heuristic for identifying language menu

### Attempt

The script initially used menu item text heuristics to decide whether a Radix menu was the language menu:

- detect words like `english`, `japanese`, `français`, etc.
- exclude menus containing `Settings`, `Get help`, `Log out`, etc.

### Why it was attempted

- it was fast to implement
- user had already confirmed the submenu was dynamically inserted

### Why it was abandoned

- it caused false positives in the profile menu
- it depended on UI text that changes when official language changes
- it was not structurally reliable

### Replacement

Detection was changed to use:

- menu `aria-labelledby`
- trigger `id`
- trigger `aria-controls === menu.id`
- requirement that language menu items carry `lang` attributes

## Structural details captured from actual DOM

The user pasted real HTML for:

1. the left-side `Language` trigger item
2. the right-side submenu wrapper + menu
3. a concrete official language menu item

Important observations from those snippets:

- left trigger:
  - `role="menuitem"`
  - `aria-haspopup="menu"`
  - `aria-expanded="true"`
  - `aria-controls="radix-..."`
  - inner label `Language`
- right submenu:
  - `role="menu"`
  - `data-radix-menu-content`
  - `aria-labelledby="same-trigger-id"`
- official language item:
  - `role="menuitem"`
  - `lang="en-US"` or other locale
  - first child is label container
  - second child is indicator area
  - selected item uses an SVG checkmark
  - unselected item uses a placeholder `div.h-4.w-4`

These details were used to make injection more precise.

## Styling and behavior issues solved for the custom item

Several UI bugs were found and fixed iteratively.

### 1. Missing hover highlight

Observed:

- official items darkened on hover
- the injected `简体中文` did not

Cause:

- native hover state was not pure CSS
- Radix / React was adding `data-highlighted` dynamically

Fix:

- add hover listeners to the custom item
- set `data-highlighted` on pointer move
- remove it on pointer leave

### 2. Wrong selected checkmark on the custom item

Observed:

- even when `spa:locale` or later override state did not indicate Chinese, the custom item still sometimes showed a checkmark

Cause:

- the custom item was originally cloned from `English`, which was a selected item
- the selected SVG indicator leaked into the clone

Fix:

- normalize the indicator slot
- replace indicator with a placeholder `div.h-4.w-4`
- only inject the check icon when the custom locale should visually appear selected

### 3. Broken height / padding on `English` and `简体中文`

Observed:

- `English` and the injected item became visually taller
- padding/layout became wrong

Cause:

- indicator detection logic was too aggressive
- it manipulated internal descendants instead of only the top-level two-child menu structure

Fix:

- treat first direct child as label container
- treat second direct child as indicator container
- stop auto-appending structural nodes into arbitrary descendant positions

### 4. Official selected item still showed checkmark after override

Observed:

- if Chinese override was active, the custom item could show a checkmark
- but the official selected language could still keep its own native checkmark

Cause:

- official selected indicator came from Claude's own internal state, not from a live reread of storage

Fix at the menu rendering layer:

- when override is active and menu opens, normalize indicator slots for all official items
- remove their visual checkmarks
- only render a checkmark for the custom item

Important note:

- this was only a visual sync layer for the menu
- it did not modify Claude's actual internal locale state

## Investigation into Claude's own locale state

### Experiment with `spa:locale`

The user discovered Claude Web stores a locale value in:

- `localStorage["spa:locale"]`

Experiments showed:

- reading it was possible from the content script
- manually changing it changed some visible behavior in the menu
- but official menu state did not fully follow it live
- after page refresh, unsupported values were overwritten

### Confirmed limitation

Manually changing `spa:locale` to `zh-CN` was not enough.

Observed behavior:

- refresh reverted it to an official locale such as `en-US`

## Backend locale constraint discovered

The user performed network inspection during official language changes and found:

- choosing a language triggers a `PUT` to update the user profile
- the profile response contains:
  - `locale`
  - `work_function`
  - `conversation_preferences`
  - etc.

Example successful response when official locale was `en-US`:

```json
{
  "work_function": "Engineering",
  "conversation_preferences": "",
  "locale": "en-US",
  "onboarding_topics": [],
  "avatar": 0,
  "pixel_avatar": null
}
```

Attempting `zh-CN` returned:

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "locale.str-enum[Locale]: Input is not one of the permitted values."
  },
  "request_id": "..."
}
```

### Confirmed fact

Claude backend enforces a locale enum. `zh-CN` is not accepted.

### Product implication

The extension cannot make Claude "officially" support Chinese via backend locale.

The extension must:

- keep its own override state
- intercept frontend language file loading
- avoid relying on Claude backend for Chinese mode

## Request interception design and implementation

After backend rejection was confirmed, the architecture shifted to:

- maintain `localStorage["claude-i18n:locale"]`
- when active, intercept Claude Web i18n requests
- serve custom language resources from the extension / remote backend

### Language resource endpoints discovered

The user confirmed Claude Web requests these patterns:

- `https://claude.ai/i18n/en-US.json`
- `https://claude.ai/i18n/statsig/en-US.json`
- `https://claude.ai/i18n/ja-JP.overrides.json`

Custom Chinese resources provided by user backend:

- `https://claude-web-i18n.vercel.app/i18n/zh-CN.json`
- `https://claude-web-i18n.vercel.app/i18n/statsig/zh-CN.json`

At first, discussion considered special handling for `overrides`, then the strategy was simplified:

- for now, just intercept `*.overrides.json` and return `{}` directly

### Files changed during interception work

- `/mnt/f/claude-web-i18n/extension/manifest.json`
- `/mnt/f/claude-web-i18n/extension/script.js`
- `/mnt/f/claude-web-i18n/extension/hook.js`
- `/mnt/f/claude-web-i18n/extension/service.js`

### Extension architecture implemented during this session

#### `extension/script.js`

Responsibilities during this session:

- inject page script
- bridge page messages to extension background
- maintain `claude-i18n:locale`
- inject `简体中文` into language menu
- synchronize menu visual state
- later attempt no-refresh switching

#### `extension/hook.js`

Responsibilities during this session:

- run in page context
- patch `window.fetch`
- patch `XMLHttpRequest`
- intercept Claude i18n requests
- ask extension backend for payloads
- later attempt runtime store discovery and page-level locale switching

#### `extension/service.js`

Responsibilities during this session:

- receive i18n fetch requests from content/page layer
- fetch custom Chinese resources from remote backend
- cache resources locally
- consult `/version/[locale].json` to invalidate cache
- return inline `{}` for `overrides` requests

### Manifest changes during this phase

Manifest changes included:

- adding service worker background
- adding storage permissions
- adding host permissions for `https://claude-web-i18n.vercel.app/*`
- adding `web_accessible_resources` for the page hook
- using `run_at: "document_start"`

## Local cache exploration

The session then moved into making the custom language resources cached locally.

### User asked whether Chrome extensions could persist file-like resources

The answer settled on:

- `Cache Storage` for language payload bodies
- `chrome.storage.local` for metadata

### Resource size context

The user measured a language file around:

- `654 KB`

Conclusion reached:

- `Cache Storage` is a reasonable fit for actual JSON bodies
- `chrome.storage.local` is better for metadata such as version/hash

### Version manifest design adopted

The remote backend exposes:

- `/version/[locale].json`

Example structure provided by the user:

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

Interpretation used in the implementation:

- `hash[0]` corresponds to `/i18n/[locale].json`
- `hash[1]` corresponds to `/i18n/statsig/[locale].json`

### Initial confusion about where payloads were stored

At one point:

- `chrome.storage.local["claude-i18n:versions"]` existed
- but `caches.keys()` returned empty arrays

This showed:

- metadata had been written
- actual cache bodies had not yet landed as expected

To debug this, the service worker implementation was expanded to:

- log cache reads and writes explicitly
- mirror bodies into `chrome.storage.local["claude-i18n:bodies"]` as fallback and debug aid

### Later runtime confirmation

After more fixes, browser logs showed:

```text
[claude-i18n] served i18n request via extension cache
cacheStatus: "hit-cache-storage"
```

This is a confirmed fact:

- the request interception chain and extension local cache were both functioning

## Failure route: intercepting only `en-US`

### Attempt

The interception logic originally only matched:

- `/i18n/en-US.json`
- `/i18n/statsig/en-US.json`

### Failure observed

If the user first switched official language to something else, like French, then enabled Chinese:

- Claude requested `/i18n/fr-FR.json`
- Chinese override no longer worked

### Fix

Interception was broadened to:

- any `/i18n/[locale].json`
- any `/i18n/statsig/[locale].json`
- any `/i18n/[locale].overrides.json`

### Confirmed conclusion

Custom Chinese override must not assume the official current locale is `en-US`.

## Reverse-engineering the runtime i18n switching path

This became the deepest technical part of the session.

### Important code path identified by the user

While stepping through the frontend after i18n JSON responses were received, the user found a key function:

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
            return {
                ...i,
                ...l,
                ...o
            }
        },
        staleTime: 1 / 0,
        retry: 1
    })
      , {data: l, isError: c} = f({
        queryKey: ["i18n_secret", n, a],
        queryFn: async () => {
            const e = await fetch(`/web-api/gated-messages?locale=${encodeURIComponent(a)}`);
            ...
        },
        staleTime: 3e5,
        retry: 1,
        enabled: !0
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

### Confirmed interpretation

From this function, the following facts were derived and treated as confirmed by further experiments:

- runtime language loading uses `localeOverride ?? locale`
- changing `localeOverride` should re-run the i18n load chain
- that load chain fetches:
  - base i18n JSON
  - statsig i18n JSON
  - optional overrides JSON
- then merges results and pushes them into a runtime store

### Store definition identified by the user

The user then found the store definition:

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

### Confirmed fact from manual runtime experiments

When the user manually paused execution at a scope where `oW` was available and then executed:

```js
window.__claudeI18nStore = oW
window.__claudeI18nStore.getState().setLocaleOverride("zh-CN")
```

The result was:

- Claude Web began requesting `zh-CN` language resources without a page refresh

This is one of the most important confirmed facts in the session:

- no-refresh language switching is possible if the runtime store and `setLocaleOverride` can be reached

## Reverse-engineering attempts around menu item event handlers

Because automatic store discovery was hard, another route was explored: follow the official language item's event handlers.

### React props observed on an official language item

The user inspected `__reactProps$...` on a real language item and saw structures like:

```js
{
  role: "menuitem",
  className: "...",
  lang: "id-ID",
  children: [...],
  tabIndex: -1,
  "data-orientation": "vertical",
  "data-radix-collection-item": ""
}
```

and for the left `Language` trigger:

```js
{
  role: "menuitem",
  id: "radix-...",
  aria-haspopup: "menu",
  aria-expanded: true,
  aria-controls: "radix-...",
  ...
}
```

### More useful runtime object found later

Inside the event chain the user reached an object like:

```js
{
  __scopeMenu: {...},
  disabled: false,
  className: "...",
  lang: "ja-JP",
  onSelect: () => o(e.locale),
  ...
}
```

Important confirmed fact:

- official language selection eventually routes through an `onSelect` callback of shape:

```js
() => o(e.locale)
```

This strongly suggested the official language switch logic is a simple runtime callback taking a locale.

### Why the event-chain route stalled

Attempts to peel the event chain further were repeatedly obstructed by:

- compressed variable names with frequent reuse (`e`, `o`, `t`, `a`)
- scope confusion between wrapper handlers and inner handlers
- DevTools breaking on noisy intermediate wrappers
- difficulty isolating the true underlying callback or store

### Conclusion from this route

Confirmed:

- official language items do carry a meaningful selection callback
- no-refresh switching through official runtime logic is real

Not achieved:

- stable extraction of the final callable object through event wrappers

## Failure routes / abandoned or unresolved approaches

### 1. Broad menu text heuristics

Why tried:

- fast way to identify the language menu

Why dropped:

- false positives in the profile menu
- locale-dependent strings made it fragile

### 2. Treating `spa:locale` as the main control point

Why tried:

- it was easy to see in storage

Why dropped:

- not authoritative
- unsupported values are overwritten
- did not drive the full runtime i18n reload chain

### 3. Hardcoding interception to `en-US`

Why tried:

- initial proof of concept assumed English default

Why dropped:

- failed as soon as official locale changed

### 4. Automatic runtime store discovery by generic React fiber scanning

Multiple variants were attempted in `hook.js`:

- broad candidate scanning
- limited field recursion
- looking for a `Wsn` fiber by component name
- traversing hook chains
- traversing the full fiber tree and hook chains

Why it was pursued:

- if the extension could automatically find `oW`, it could call `setLocaleOverride("zh-CN")` without refresh

Why it remains unresolved:

- runtime component names are minified and unstable
- the relevant store does not appear to be reachable in a simple, stable, generic way through scanned fiber objects
- repeated scanning attempts produced no reliable `discovered i18n store` event

### 5. Programmatic click on an official language item

This idea was proposed late in the session:

- when user clicks `简体中文`, set `claude-i18n:locale = zh-CN`
- then programmatically click an official language item
- let Claude's normal no-refresh language change path run
- requests get intercepted and return Chinese resources

Why the idea looked promising:

- it avoids needing direct access to `setLocaleOverride`
- it reuses Claude's own click path

Why it was not accepted as the final direction for the next thread:

- the user had already tested enough to conclude that fetch interception alone was insufficient in all situations because some official language transitions stop re-fetching after resources are already warm
- user decided the next thread should focus specifically on obtaining the runtime `setLocaleOverride` path

So this route was discussed, not completed.

## Code changes made during this session

The following files were modified at some point in the session:

- `/mnt/f/claude-web-i18n/extension/manifest.json`
  - fix invalid Chrome match pattern
  - add background service worker, permissions, host permissions, web accessible resources
- `/mnt/f/claude-web-i18n/extension/script.js`
  - replace tutorial scaffold with Radix menu observer and custom language injection logic
  - maintain `claude-i18n:locale`
  - bridge to page hook and later attempt no-refresh switching
- `/mnt/f/claude-web-i18n/extension/hook.js`
  - patch fetch / XHR
  - forward i18n resource requests through extension backend
  - attempt runtime store discovery
- `/mnt/f/claude-web-i18n/extension/service.js`
  - fetch custom remote language resources
  - consult version manifest
  - maintain local cache
  - return empty object for overrides

Also, a summary file had previously been written in-session:

- `/mnt/f/claude-web-i18n/EXPLORATION_NOTES.md`

Later in this session, the user explicitly stated:

- most of the experimental code had been deleted again
- the next step should restart from a much narrower objective:
  - obtain a callable `setLocaleOverride`

Therefore, file contents in the repo after this session may no longer match every intermediate experiment described here.

## Important DevTools commands and techniques used in this session

### DOM mutation observation

Used to confirm how the menu appears:

```js
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      console.log('added node:', node);
      console.log('html:', node.outerHTML?.slice(0, 1000));
    }
  }
}).observe(document.body, {
  childList: true,
  subtree: false,
});
```

### Accessing React props from selected element

```js
const pk = Object.keys($0).find(k => k.startsWith("__reactProps$"));
const props = $0[pk];
props
```

### Accessing React fiber from selected element

```js
const fk = Object.keys($0).find(k => k.startsWith("__reactFiber$"));
const fiber = $0[fk];
```

### Debugging event handlers

```js
debug(props.onClick)
debug(props.onPointerDown)
```

and triggering without mouse movement:

```js
$0.click()
$0.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
```

### Runtime cache inspection in extension service worker DevTools

```js
await caches.keys()
const cache = await caches.open('claude-i18n-cache-v1');
await cache.keys();
const res = await cache.match('https://cache.claude-i18n.local/zh-CN.json');
await res.text();
```

### Runtime store manual verification

When paused in the right scope:

```js
window.__claudeI18nStore = oW
window.__claudeI18nStore.getState()
window.__claudeI18nStore.getState().setLocaleOverride("zh-CN")
window.__claudeI18nStore.getState().setLocaleOverride(null)
```

## Confirmed facts at end of this session

The following were confirmed by actual observation in this session:

1. Claude backend rejects unsupported locales such as `zh-CN`.
2. `spa:locale` is not enough to own Chinese mode.
3. The `Language` submenu is a Radix portal under `document.body`.
4. A custom `简体中文` item can be injected into the submenu.
5. Official i18n requests can be intercepted and served from custom Chinese resources.
6. The extension cache chain can serve language files locally.
7. Claude runtime i18n loading uses `localeOverride ?? locale`.
8. A runtime store exists with `setLocaleOverride`.
9. Manually calling `setLocaleOverride("zh-CN")` can trigger no-refresh language reloading.
10. Generic automatic discovery of that runtime store was not made reliable in this session.

## Distinguishing fact vs inference

### Confirmed facts

- All items listed in the previous section.
- The `Wsn`-like function and `oW` store definition were actually observed in source.
- `setLocaleOverride("zh-CN")` was manually tested in a valid runtime scope and caused zh-CN language requests.

### Inferences / strong but still indirect interpretations

- The `onSelect: () => o(e.locale)` callback seen in menu-item runtime data likely participates in the official no-refresh language switch path.
- Programmatic clicking of an official language item is probably a viable no-refresh fallback path, but this was not fully completed in this session.

### Unfinished items

- reliable automatic acquisition of `setLocaleOverride` from extension code
- robust no-refresh Chinese switching in production code
- deciding whether the final approach should be:
  - runtime store capture
  - official-item click reuse
  - bundle patch / runtime hook at store creation

## Final conclusion reached in this session

By the end of the session, the user explicitly narrowed the future objective:

- stop trying to build around partial workarounds
- restart cleanly
- focus specifically on acquiring a callable runtime entrypoint equivalent to `setLocaleOverride`

The final direction for the next exploration thread was:

- treat this as a focused reverse-engineering task
- do not rehash backend locale rejection or `spa:locale` findings
- prioritize finding a stable way to obtain and call the real runtime locale override action

## Next-step recommendations for the next thread

1. Start from a clean narrowed objective:
   - get a callable `setLocaleOverride`

2. Do not spend more time on:
   - backend locale spoofing
   - `spa:locale` as primary control source
   - broad generic React fiber/store scans

3. Focus future exploration on:
   - deterministic capture of the runtime store at creation time
   - bundle patching or source-map-assisted patching if needed
   - more precise runtime hook strategies rather than whole-tree scans

4. Use this file as raw material for a future merged blog/article draft, together with backend notes from the other thread.
