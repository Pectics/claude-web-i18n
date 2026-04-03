# Claude Web i18n 会话阶段记录 02

## 记录范围

本文件只记录当前这次会话里，围绕 `Claude Web i18n` Chrome 扩展的逆向判断、菜单交互方案设计、代码实现、审查结论与后续修正所真实发生的内容。

不补写其他会话，不扩展到未发生的实验。

## 阶段目标

### 已确认事实

- 本次会话的直接目标是继续推进 `Claude Web i18n` Chrome 扩展，重点解决“点击 `简体中文` 后尽可能无刷新切换”的实现路径。
- 用户在会话开始时明确要求：
  - 先阅读 [EXPLORATION_NOTES.md](/mnt/f/claude-web-i18n/EXPLORATION_NOTES.md)
  - 先总结 3 个文件：
    - [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js)
    - [extension/hook.js](/mnt/f/claude-web-i18n/extension/hook.js)
    - [extension/service.js](/mnt/f/claude-web-i18n/extension/service.js)
  - 不要重复已经确认过的探索结论
  - 优先沿着 `EXPLORATION_NOTES.md` 中的 “Best current idea for no-refresh switching” 继续

### 已知前提 / 约束

用户明确禁止重复投入精力的方向与已有结论：

- Claude 后端 `profile locale` 是受限枚举，不能直接支持 `zh-CN`
- `spa:locale` 不是应该依赖的主状态源
- 自定义语言状态应该用 `localStorage["claude-i18n:locale"]`
- i18n 请求拦截、远端中文资源加载、本地缓存，这条链路已经跑通
- 手动调用 runtime store 的 `setLocaleOverride("zh-CN")` 已证明“无刷新切换”在原理上可行
- 通用 React fiber/store 扫描不稳定，不应继续作为主要精力方向

本次会话接受的主路线是：

- 点击 `简体中文` 时，先写 `claude-i18n:locale`
- 再程序化点击一个“真实官方语言项”，复用 Claude 自己的无刷新语言切换链路
- 请求仍由扩展拦截并返回 `zh-CN` 资源
- 如果程序化点击失败，再回退到 reload

## 时间顺序记录

## 1. 阅读 handoff 文档并确认当前主方案

### 实际操作

读取过：

- [EXPLORATION_NOTES.md](/mnt/f/claude-web-i18n/EXPLORATION_NOTES.md)

实际命令：

```bash
sed -n '1,260p' /mnt/f/claude-web-i18n/EXPLORATION_NOTES.md
rg -n "Best current idea for no-refresh switching|no-refresh switching|programmatic click|reload|setLocaleOverride|discover-i18n-store" /mnt/f/claude-web-i18n/EXPLORATION_NOTES.md
sed -n '320,390p' /mnt/f/claude-web-i18n/EXPLORATION_NOTES.md
```

### 关键观察

从 notes 中再次确认的内容：

- 目前“无刷新切换”的最佳现实路径，不再是找运行时 store，而是：

```text
1. user clicks 简体中文
2. extension writes claude-i18n:locale = "zh-CN"
3. extension finds one official menu item
4. extension calls .click() on that item
5. Claude's own language change pipeline runs
6. extension intercepts requests and serves Chinese resources
```

- 文档中还明确写出 fallback：

```text
if programmatic click fails, reload the page
```

### 已确认事实

- 本次会话没有继续重新探索通用 store 自动发现，而是接受并沿用 handoff 文档推荐的主方向。

### 推测

- 复用官方点击链路比继续逆向 runtime store 更稳定，因为它更接近 Claude 自己已经支持的 UI 路径。

## 2. 总结当前 extension 目录的 3 个文件

### 实际操作

读取过：

- [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js)
- [extension/hook.js](/mnt/f/claude-web-i18n/extension/hook.js)
- [extension/service.js](/mnt/f/claude-web-i18n/extension/service.js)

实际命令：

```bash
sed -n '1,260p' /mnt/f/claude-web-i18n/extension/script.js
sed -n '261,520p' /mnt/f/claude-web-i18n/extension/script.js
sed -n '1,260p' /mnt/f/claude-web-i18n/extension/hook.js
sed -n '261,520p' /mnt/f/claude-web-i18n/extension/hook.js
sed -n '1,260p' /mnt/f/claude-web-i18n/extension/service.js
sed -n '261,520p' /mnt/f/claude-web-i18n/extension/service.js
```

### 文件总结

#### [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js)

已确认职责：

- 注入页内 `hook.js`
- 建立 content script 与 page hook 的 `postMessage` 桥
- 识别 Claude 的语言 submenu
- clone 一个官方未选中项，插入 `简体中文`
- 为官方语言项加监听
- 点击 `简体中文` 时，原先逻辑是：
  - 写 `claude-i18n:locale = "zh-CN"`
  - 调 `applyLocaleOverride("zh-CN")`
  - 失败则 `window.location.reload()`

关键结构 / 常量：

```js
const CUSTOM_LANGUAGE_ID = "zh-CN-custom";
const CUSTOM_LOCALE = "zh-CN";
const OVERRIDE_STORAGE_KEY = "claude-i18n:locale";
const PAGE_HOOK_SCRIPT_ID = "claude-i18n-page-hook";
```

语言菜单识别依赖：

```js
[data-radix-popper-content-wrapper]
[data-radix-menu-content][role="menu"]
aria-labelledby
aria-controls
item.hasAttribute("lang")
```

#### [extension/hook.js](/mnt/f/claude-web-i18n/extension/hook.js)

已确认职责：

- 在 page context 中 patch `window.fetch` 与 `XMLHttpRequest`
- 尝试从 React fiber / hook chain 发现 Claude 的 i18n store
- 暴露 page-side 接口：
  - `discover-i18n-store`
  - `set-locale-override`
- 当 `claude-i18n:locale` 存在时，拦截：
  - `/i18n/[locale].json`
  - `/i18n/statsig/[locale].json`
  - `/i18n/[locale].overrides.json`

当时观察到的 store 识别条件：

```js
typeof candidate.setLocaleOverride === "function"
typeof candidate.setGatedMessages === "function"
typeof candidate.clearGatedMessages === "function"
"messagesLocale" in candidate
"localeOverride" in candidate
```

#### [extension/service.js](/mnt/f/claude-web-i18n/extension/service.js)

已确认职责：

- background service worker
- 接收 `i18n-fetch` 消息
- 根据请求 URL 判断资源类型：
  - `base`
  - `statsig`
  - `overrides`
- 对 `overrides` 直接返回 `{}`：

```js
if (resource.kind === "overrides") {
  return {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: "{}"
  };
}
```

- 通过远端版本清单判断缓存是否新鲜：

```js
const CACHE_NAME = "claude-i18n-cache-v1";
const REMOTE_BASE_URL = "https://claude-web-i18n.vercel.app";
const VERSION_STORAGE_KEY = "claude-i18n:versions";
const BODY_STORAGE_KEY = "claude-i18n:bodies";
```

- 优先从 `Cache Storage` 命中，失败退到 `chrome.storage.local`

### 已确认事实

- 本次会话开始时，扩展主体逻辑仍是“点击中文 -> 尝试直接 `setLocaleOverride` -> 失败 reload”，尚未实现“程序化点击官方语言项”主方案。

## 3. 一次误操作：先改代码，随后按用户要求回退

### 实际发生

- 在用户明确说“先不要直接落地”之前，先改了 [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js) 一版，把点击中文改成程序化点击官方项。
- 用户随后明确指出：“不用直接落地”。
- 该次改动随后被完整回退。

### 已确认事实

- 本次会话里确实发生过一次“提前动手”的误操作。
- 该误操作没有保留在最终代码状态中。

### 相关文件

- [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js)

## 4. 用户补充的关键 bug 现象与由此收敛出来的实现思路

### 用户描述的 bug

用户给出的核心场景：

- 当前官方语言是 `en-US`
- 切到扩展语言 `zh-CN`
- 视觉上看起来是：
  - `zh-CN` 被勾选
  - `en-US` 没有被勾选
- 但 Claude 内部“官方当前语言”实际上还是 `en-US`
- 这时再点击 `en-US` 切回英文：
  - 页面不会刷新成英文
  - 勾选又跑回去

用户还补充了一个重要观察：

- 直接复制 `English` 那个 DOM 元素并不能复用官方行为
- 克隆后的元素：
  - 没有 hover 特效
  - 不能触发交互链路
  - 不能完成真正的语言切换

### 从这个 bug 导出的结论

已确认事实：

- “只更新扩展自己的勾选态”是不够的
- 当前前端勾选态与 Claude 内部真实官方 locale 是脱节的
- 官方语言项存在“已选语言二次点击不触发刷新”的分支
- 用 clone 出来的官方项当触发器不可行

由用户提出、并在后续计划中被采纳的设计方向：

- `claude-i18n:locale` 升级为前端唯一权威语言状态
- 它既表示扩展语言，也表示官方语言
- 点击官方语言项时，也要同步把 `claude-i18n:locale` 改成对应官方语言
- 真正是否要拦截 i18n 请求，由“这个 locale 是否属于扩展语言集合”决定
- 当目标语言无法直接触发 Claude 原生切换链路时，要选一个“既不等于当前真实官方语言，也不等于当前目标语言”的真实官方项做 fake click 触发器

## 5. 确立三层设计：状态层 / 菜单层 / 拦截层

### 方案整理结果

在对用户口头方案进行整理后，本次会话形成了一个完整设计，并在后续被实现：

#### 状态层

- `localStorage["claude-i18n:locale"]` 是前端唯一真值
- `spa:locale` 只作辅助 / 兜底观察
- “Claude 当前真实官方语言”用于判断某个官方项能否直接触发切换

#### 菜单层

- 官切官：
  - 如果点的是当前 `claude-i18n:locale`，直接 no-op
  - 如果点的是另一个官方语言，写入 `claude-i18n:locale` 后走官方原生点击
- 官切扩：
  - 写入 `claude-i18n:locale = zh-CN`
  - fake click 一个真实官方触发器项
- 扩切官：
  - 如果目标官方语言等于当前真实官方语言，不能直接依赖原生点击
  - 也需要 fake click 一个真实官方触发器项

#### 拦截层

- 只看 `claude-i18n:locale`
- 如果是扩展语言集合成员，就拦截 i18n 并返回扩展资源
- 如果是官方语言，就放行
- synthetic transition 期间，必要时还要改写 `account_profile` 请求中的 `locale`

### 已确认事实

- 这里没有再去设计“官方后端真的接受 `zh-CN`”，而是继续接受合法官方 locale + 前端 override 的约束。

## 6. 形成正式实现计划

### 实际发生

用户要求先做一个优雅的计划。

会话中先补了一轮非破坏性检查：

```bash
rg --files /mnt/f/claude-web-i18n/extension
sed -n '1,220p' /mnt/f/claude-web-i18n/extension/manifest.json
rg -n "account_profile|profile|/i18n/|claude-i18n:locale|spa:locale|fetch\\s*=|XMLHttpRequest|webRequest|declarativeNetRequest" /mnt/f/claude-web-i18n/extension /mnt/f/claude-web-i18n -g '!EXPLORATION_NOTES.md'
```

得到的环境确认：

- 当前 extension 下文件包括：
  - `manifest.json`
  - `hook.js`
  - `script.js`
  - `service.js`
  - `panel.html`
  - `claude.png`
- `manifest.json` 显示：
  - `content_scripts` 在 `document_start` 注入 `script.js`
  - `web_accessible_resources` 暴露 `hook.js`
  - 没有 `webRequest` 或 DNR 级别拦截，现有能力仍是 page hook + background message

### 正式计划的内容

会话中生成了一个完整实现计划，核心点包括：

- `claude-i18n:locale` 升级为统一真值
- 增加 `EXTENSION_LOCALES = new Set(["zh-CN"])`
- 增加 `transitionContext`
- `script.js` 中：
  - 官方项和扩展项统一更新 `claude-i18n:locale`
  - synthetic click 只用真实官方项，不用 clone
- `hook.js` 中：
  - i18n 拦截只在 locale 属于扩展语言集合时发生
  - synthetic transition 期间改写 `account_profile` 的 locale
  - 官方 synthetic transition 如目标官方 locale 与触发器不同，还要临时改写 i18n 请求 URL

## 7. 按计划进行代码实现

### 实际改动过的文件

- [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js)
- [extension/hook.js](/mnt/f/claude-web-i18n/extension/hook.js)

### 改动目的

#### [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js)

改动目的：

- 将 `claude-i18n:locale` 作为统一语言真值
- 新增 transition context 桥接：

```js
setTransitionContext(...)
clearTransitionContext()
```

- 新增真实官方语言与目标语言判断：

```js
getCurrentOfficialLocale(menu)
getDesiredLocale(menu)
getTriggerLanguageItem(menu, desiredLocale)
```

- 为官方语言项加 capture 阶段监听：
  - 支持 direct 官方切换
  - 支持“扩切官且目标等于当前真实官方语言”时的 synthetic trigger

- 为扩展项 `简体中文` 切换为：
  - 写 `claude-i18n:locale`
  - 选择真实官方触发器
  - 写 transition context
  - 程序化点击真实官方项
  - 失败 fallback reload

#### [extension/hook.js](/mnt/f/claude-web-i18n/extension/hook.js)

改动目的：

- 增加扩展语言集合：

```js
const EXTENSION_LOCALES = new Set(["zh-CN"]);
```

- 增加 transition context：

```js
let transitionContext = null;
let transitionContextTimer = null;
```

- 新增 page hook 消息：
  - `set-transition-context`
  - `clear-transition-context`

- 新增 profile 请求改写相关逻辑：

```js
isProfileLocaleRequest(url, bodyText, method)
rewriteProfileBody(bodyText, nextLocale)
```

- fetch / XHR 在 synthetic transition 中改写 profile locale
- fetch / XHR 在“官方 synthetic transition 且目标 locale 与触发器不同”时临时改写 i18n URL
- i18n 拦截只在 `readOverrideLocale()` 返回的是扩展语言集合成员时才介入

### 会话中的实现约束

- 没有修改 [extension/service.js](/mnt/f/claude-web-i18n/extension/service.js)
- 没有继续围绕 `discoverStoreFromReact()` 做新探索；它只被保留为辅助/兼容逻辑

## 8. 实施后的自检限制

### 实际尝试

尝试过的静态语法检查命令：

```bash
node -c /mnt/f/claude-web-i18n/extension/script.js
node -c /mnt/f/claude-web-i18n/extension/hook.js
command -v node || command -v bun || command -v deno || command -v qjs || command -v quickjs || command -v js
python -m py_compile /dev/null
```

### 已确认事实

- 当前环境没有 `node`
- 当前环境也没有 `bun` / `deno` / 其它 JS 运行时
- 当前环境也没有 `python`
- 因此，本次会话里没有做成真正的 JS 语法校验
- 也没有进行真实浏览器手测

## 9. 开子 agent 做 review

### 实际发生

在用户要求“开个子agent review 一下”后，启动了一个 review 向的子 agent，目标是只审查：

- [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js)
- [extension/hook.js](/mnt/f/claude-web-i18n/extension/hook.js)

要求它重点寻找：

- 行为回归
- 状态错位
- 请求改写风险
- race condition
- 错误假设

### 子 agent 返回的主要 findings

#### 已确认事实

1. 真实官方菜单项仍然被原地改写，污染了后面要复用的原生节点  
   文件参考：
   - [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js)

2. transition context 在成功切换后没有立即清理，会在 5 秒 TTL 内污染后续请求  
   文件参考：
   - [extension/hook.js](/mnt/f/claude-web-i18n/extension/hook.js)

3. 官方 synthetic i18n rewrite 没有很好保留原请求形态  
   文件参考：
   - [extension/hook.js](/mnt/f/claude-web-i18n/extension/hook.js)

4. `currentOfficialLocale` 被缓存成菜单打开时的快照，菜单实例内第二次操作可能判断错误  
   文件参考：
   - [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js)

### 结论

- 子 agent 的审查直接指出了“这版虽然方向对，但菜单层仍然碰了真实官方节点、过渡上下文也不够一次性”的风险。

## 10. 根据 review 结果进行二次修正

### 实际改动过的文件

- [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js)
- [extension/hook.js](/mnt/f/claude-web-i18n/extension/hook.js)

### 修正内容

#### [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js)

修正目标：

- 不再直接改真实官方节点的 indicator 子树
- 不再缓存 `currentOfficialLocale` 快照

实际做法：

- 新增菜单样式注入：

```js
const MENU_STYLE_ID = "claude-i18n-menu-style";
```

- 使用 CSS 在扩展语言模式下隐藏官方项现有勾选，而不是替换官方 indicator DOM：

```css
[data-claude-i18n-mode="extension"] > [lang]:not([data-custom-language="true"]) > :nth-child(2) {
  visibility: hidden;
}
```

- `syncMenuSelection(menu)` 只更新扩展自定义项的勾选
- 官方语言的“是否当前真实 locale”每次重新从真实官方选中项读取，再退回 `spa:locale`
- 在 direct 官方切换分支中，避免提前对真实官方项做额外结构改写

#### [extension/hook.js](/mnt/f/claude-web-i18n/extension/hook.js)

修正目标：

- transition context 改成真正的一次性 / 短尾窗口
- 官方 synthetic i18n rewrite 尽量保留请求形态

实际做法：

- 新增：

```js
scheduleTransitionContextClear(delayMs)
completeProfileTransitionStep(context)
```

- 扩展语言 synthetic transition：
  - profile rewrite 成功后立即 `clearTransitionContext()`

- 官方 synthetic transition：
  - profile rewrite 成功后只保留一个约 750ms 的短尾窗口给剩余 i18n 请求

- fetch 情况下：
  - 如果原请求是 `Request`，则用：

```js
new Request(rewrittenUrl.toString(), input)
```

  保留原请求属性

- XHR 情况下：
  - 不再在 `send()` 中降级成 `fetch(GET)`
  - 而是在 `open()` 阶段就把 URL 改写为目标 i18n URL，再走原生 XHR

### 已确认事实

- 此轮修正后，review 指出的 4 个主要问题都被针对性处理了
- 但仍未进行真实浏览器验证，因此“代码已写完”不等于“行为已验证”

## 11. 失败路线 / 放弃原因

### 失败路线 1：继续依赖通用运行时 store 自动发现

#### 为什么没走

- 用户在会话开头已经明确禁止继续把主要精力放在通用 React fiber/store 扫描上
- 已有 handoff 文档也明确说明这条路线不稳定

### 失败路线 2：复制一个官方语言项，靠 clone 节点当触发器

#### 为什么失败 / 被放弃

- 用户直接反馈，这样生成的新元素：
  - 没有完整 hover 特效
  - 无法点击交互触发语言切换
  - 不能复用 Claude 的真实无刷新切换链路

### 失败路线 3：只维护扩展自己的勾选态，不把官方语言也纳入 `claude-i18n:locale`

#### 为什么失败 / 被放弃

- 用户给出的实际 bug 已证明：
  - 前端视觉勾选态与 Claude 内部真实官方 locale 发生脱节
  - 之后点击当前真实官方 locale 时，Claude 落入“已选项二次点击不触发刷新”的分支

### 失败路线 4：在真实官方节点上直接重写 indicator / `aria-checked`

#### 为什么失败 / 被放弃

- 子 agent review 指出，这会污染后面要复用的原生官方节点
- 本次会话里随后改成：
  - 只维护扩展项自己的勾选
  - 官方项使用视觉隐藏，不碰其原生结构

## 12. 关键代码片段 / 运行时结构 / 调试信息

### 本次会话中反复围绕的关键状态

```js
localStorage["claude-i18n:locale"]
localStorage["spa:locale"]
```

### 本次会话中确认/延用的运行时 store 相关接口

虽然没有把它作为主路径继续实现，但本次会话仍明确承认它是备用调试能力：

```js
window.__claudeI18nStore
window.__claudeI18nStore.getState().setLocaleOverride("zh-CN")
```

### 本次会话中确立的新 page hook 消息

```js
set-transition-context
clear-transition-context
set-locale-override
discover-i18n-store
```

### 本次会话中新增/围绕的关键结构

```js
const EXTENSION_LOCALES = new Set(["zh-CN"]);
```

```js
transitionContext = {
  active: true,
  desiredLocale,
  triggerLocale,
  profileLocaleToSend,
  expiresAt
}
```

### synthetic transition 的核心策略

```text
1. 写 claude-i18n:locale
2. 根据当前真实官方 locale 与目标 locale 选 triggerLocale
3. 写 transitionContext
4. 程序化点击真实官方语言项
5. hook.js 中按需要改写 profile locale
6. hook.js 中按需要改写 i18n URL
7. 若失败则 reload
```

## 13. 最终结论

### 已确认事实

- 本次会话把“统一语言状态 + 真实官方项触发链路”的方案，从口头设计推进到了实际代码实现。
- 真实发生过的主线是：
  - 先读 handoff 文档
  - 再总结现有 3 个扩展文件
  - 用户补充关键 bug 现象
  - 基于该 bug 完整重构状态模型
  - 实现代码
  - 启动子 agent 做 review
  - 根据 review 再做一轮修正

### 推测

- 方向上已经从“靠运行时 store 扫描驱动切换”转向“复用官方点击链路 + 自己维护统一状态”，这比此前路线更接近可维护实现。
- 但是否真正稳定，仍要以浏览器内真实手测为准，尤其是：
  - 官方直切
  - 官切扩
  - 扩切官（点回当前真实官方语言）
  - synthetic transition 期间的 profile 与 i18n 请求顺序

## 14. 未完成项

- 尚未进行真实浏览器手测
- 尚未核对实际 `account_profile` 请求路径与 body 结构，当前 matcher 仍是：
  - URL 包含 `account_profile`
  - body 中存在 `locale` 字段
- 尚未验证菜单保持打开时，连续多次切换是否都正确
- 尚未验证扩展语言模式下官方勾选隐藏样式是否对不同菜单结构都稳定
- 尚未验证 transition context 的短尾窗口长度是否合适

## 15. 下一步建议

1. 用真实浏览器手测以下场景，并记录 network/request 顺序：
   - 官切官：`A -> B`
   - 官切扩：`B -> zh-CN`
   - 扩切官：`zh-CN -> B`
   - 菜单保持打开时连续切换

2. 重点观察：
   - 是否真的命中了真实官方触发器项
   - `account_profile` 的实际请求 URL / method / body 结构
   - i18n 请求到底走的是 `fetch` 还是 `XHR`
   - synthetic transition 期间是否存在多次 profile 请求

3. 如果浏览器实测再暴露问题，优先记录：
   - 触发前的 `claude-i18n:locale`
   - 当前真实官方 locale
   - 目标 locale
   - trigger locale
   - 实际请求的 i18n URL 与 profile locale

4. 本文件适合作为后续合并成博客文章时的“原始阶段记录”，而不是直接对外发布稿。
