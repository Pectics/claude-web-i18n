# Claude Web i18n 会话阶段记录 01

## 记录范围

本文件只记录当前这次会话里，围绕 `Claude Web i18n` 的部署适配、静态资源路由、语言包访问、版本信息设计，以及与扩展目录暴露风险相关的真实探索与结论。

不包含其他会话内容，不补写未发生的实验。

## 阶段目标

### 已确认事实

- 初始目标是把当前仓库整理成可以部署到 Vercel 的静态形式。
- 关键需求是：前端访问 `/i18n/zh-CN.json` 时，需要映射到根目录语言目录内对应文件。
- 用户最初给出的命名规则是：
  - 请求路径中 `/` 被替换成 `_`
  - 例：`/i18n/zh-CN.json` -> `/zh-CN/_i18n_zh-CN.json`
- 后续会话中，实际仓库内语言文件命名又调整为：
  - `/zh-CN/zh-CN.json`
  - `/zh-CN/zh-CN.statsig.json`
- 会话中还增加了额外约束：
  - `extension/` 目录不能暴露给前端直接访问
  - 只发布白名单中的语言目录
  - 需要为前端提供缓存更新策略所需的版本信息
  - `overrides` 最终不由服务端提供，前端自行返回空对象

### 已知前提 / 约束

- 仓库本质上是静态文件仓库，不是现成的 Next.js / Vite 应用。
- 初始扫描时，仓库内可见文件很少：
  - `LICENSE`
  - `extension/hello.html`
  - `extension/claude.png`
  - `extension/manifest.json`
  - `extension/script.js`
  - `zh-CN/_i18n_statsig_zh-CN.json`
  - `zh-CN/_i18n_zh-CN.json`
- 之后仓库内容发生过演进，最终在当前工作区中语言文件名变成：
  - [zh-CN/zh-CN.json](/mnt/f/claude-web-i18n/zh-CN/zh-CN.json)
  - [zh-CN/zh-CN.statsig.json](/mnt/f/claude-web-i18n/zh-CN/zh-CN.statsig.json)
- 本地环境里 `vercel` 可执行文件存在，但 `node` 不在 PATH 中，因此本地无法直接执行 `vercel build`：

```bash
vercel build
```

输出：

```text
/mnt/c/Applications/nodejs/vercel: 15: exec: node: not found
```

## 时间顺序记录

## 1. 初始仓库扫描与静态站点判断

### 实际操作

执行过的命令：

```bash
pwd && rg --files -n
git status --short
```

关键观察：

- 仓库路径为 `/mnt/f/claude-web-i18n`
- 初始可见文件非常少，说明仓库没有成熟的前端构建链
- 初始 `git status --short` 显示工作区并不干净，存在未跟踪和已修改文件

### 已确认事实

- 这个仓库更适合按“静态资源发布 + 路由重写”方式接入 Vercel，而不是引入完整应用框架。

### 推测

- 如果不做产物白名单控制，Vercel 会把仓库中所有静态文件直接发布出去，包括 `extension/` 目录。

## 2. 扩展目录与运行时脚本的初读

### 实际操作

读取过以下文件：

- [extension/manifest.json](/mnt/f/claude-web-i18n/extension/manifest.json)
- [extension/script.js](/mnt/f/claude-web-i18n/extension/script.js)
- 当时还读取过旧版本的 [extension/hello.html](/mnt/f/claude-web-i18n/extension/hello.html)

实际读取命令：

```bash
sed -n '1,220p' extension/manifest.json
sed -n '1,260p' extension/script.js
sed -n '261,520p' extension/script.js
sed -n '1,220p' extension/hello.html
```

### 关键观察

- `manifest.json` 当时显示这是一个 Chrome Extension，`content_scripts` 只注入 `script.js` 到 `https://claude.ai/*`
- `script.js` 里主要做的是：
  - 识别 Claude 页面中的语言菜单
  - 基于 DOM 结构判断菜单是否为语言菜单
  - 注入一个 `简体中文` 的自定义菜单项
  - 从 `localStorage` 的 `spa:locale` 读取当前语言
  - 维护菜单勾选状态
- 读取时看到的关键运行时常量和对象形态包括：

```js
const CUSTOM_LANGUAGE_ID = "zh-CN-custom";
const CUSTOM_LOCALE = "zh-CN";
const LOCALE_STORAGE_KEY = "spa:locale";
```

- 当时脚本中识别菜单使用的关键 DOM 特征包括：

```js
wrapper.matches("[data-radix-popper-content-wrapper]")
menu.querySelector('[data-radix-menu-content][role="menu"]')
menu.querySelectorAll('[role="menuitem"], [data-radix-collection-item]')
```

- 语言菜单判断逻辑使用过的断言包括：

```js
items.length < 5
items.every((item) => item.hasAttribute("lang"))
```

- 脚本里存在多个运行时日志点，说明原始扩展实现依赖浏览器内观察：

```js
console.log("[claude-i18n] custom language clicked:", { ... })
console.log("[claude-i18n] injected custom language item")
console.log("[claude-i18n] detected language menu", { ... })
console.log("[claude-i18n] menu observer started")
```

### 已确认事实

- 会话中没有继续推进更深层的 Claude Web 逆向，只停留在已有扩展注入逻辑的阅读层面。
- 没有在本次会话中实际打开浏览器、下断点或抓取运行时对象快照。

### 未完成项

- 未在本次会话中验证 Claude Web 当前页面上的真实菜单 DOM 是否仍与脚本假设一致。
- 未验证 `hook.js` / `service.js` / `panel.html` 在后续版本中的行为。

## 3. 第一个 Vercel 适配方案：简单 rewrite + 根目录静态入口

### 实际目标

- 提供一个可部署的静态入口页
- 让 `/i18n/zh-CN.json` 能访问到实际语言文件

### 实际尝试

当时先创建过：

- [index.html](/mnt/f/claude-web-i18n/index.html)
- [vercel.json](/mnt/f/claude-web-i18n/vercel.json)

首轮 rewrite 思路是：

```json
{
  "source": "/i18n/:locale.json",
  "destination": "/:locale/_i18n_:locale.json"
}
```

### 为什么这样做

- 当时仓库语言文件实际命名为 `_i18n_zh-CN.json`
- 这能最小代价满足“路径里的 `/` 变成 `_`”的规则

### 已确认事实

- 这是一次“纯 rewrite 直出静态文件”的路线，没有构建步骤。

### 后续放弃原因

- 用户明确指出 `extension/` 目录不应暴露给前端访问
- 单纯 rewrite 并不能阻止 Vercel 将整个仓库静态发布

## 4. 第二个方案：构建产物白名单，阻止 `extension/` 暴露

### 目标

- 避免前端访问 `extension/`
- 只把允许发布的语言目录打进线上产物

### 实际尝试

引入过以下文件：

- [build.sh](/mnt/f/claude-web-i18n/build.sh)
- [supported-locales.txt](/mnt/f/claude-web-i18n/supported-locales.txt)
- [404.html](/mnt/f/claude-web-i18n/404.html)

核心策略：

- `vercel.json` 指定：

```json
{
  "buildCommand": "bash ./build.sh",
  "outputDirectory": "dist"
}
```

- 构建脚本只复制：
  - `index.html`
  - `404.html`
  - 白名单语言目录

### 实际验证

执行过：

```bash
bash ./build.sh
find dist -maxdepth 3 -type f | sort
test -e dist/extension && echo present || echo absent
```

验证结果曾经确认过：

- `dist/extension` 不存在
- `dist/` 内只包含入口页和语言目录内容

### 已确认事实

- “构建时白名单复制”是本次会话里用于隐藏 `extension/` 的成功方案。

## 5. Vercel 构建失败排查：远端构建分支与未提交文件不一致

### 用户反馈

Vercel 日志仅显示：

```text
Running build in Washington, D.C., USA (East) – iad1
Cloning github.com/Pectics/claude-web-i18n (Branch: main, Commit: 4a69928)
Running "vercel build"
```

没有更多输出，但构建失败。

### 实际排查动作

执行过：

```bash
git rev-parse --short HEAD && git status --short
git ls-files --stage -- index.html 404.html vercel.json build.sh supported-locales.txt zh-CN/_i18n_zh-CN.json zh-CN/_i18n_statsig_zh-CN.json extension/manifest.json extension/script.js extension/hello.html
cat .gitignore
git status --short --ignored
```

### 关键观察

- Vercel 构建的提交是 `4a69928`
- 本地工作区存在大量未提交文件
- 当时 [supported-locales.txt](/mnt/f/claude-web-i18n/supported-locales.txt) 和语言目录不在远端提交里
- 构建脚本依赖 `supported-locales.txt`

### 已确认事实

- 当时最可能的失败原因不是 Vercel 路由本身，而是远端构建拿到的提交缺少新加的构建所需文件。
- 这是一次“代码尚未推到 Vercel 实际构建分支”导致的失败定位。

### 推测

- 若当时远端缺 `supported-locales.txt`，`build.sh` 会在很早阶段失败。

## 6. 语言文件命名路线发生变化

### 已确认事实

- 会话前半段使用的命名是：
  - `_i18n_zh-CN.json`
  - `_i18n_statsig_zh-CN.json`
- 会话后半段，仓库语言文件切换为：
  - `zh-CN/zh-CN.json`
  - `zh-CN/zh-CN.statsig.json`

### 实际观察命令

```bash
find zh-CN -maxdepth 1 -type f | sort
```

当前输出：

```text
zh-CN/zh-CN.json
zh-CN/zh-CN.statsig.json
```

### 结论

- 最终采用的路由方案以新的文件命名为准，不再继续维护 `_i18n_*` 命名方案。

## 7. `overrides` 路线的多次演进

### 7.1 方案一：所有 `*.overrides.json` 返回空 JSON

#### 实际尝试

- 曾计划增加一个静态空文件，并在 Vercel 上 rewrite：

```json
{
  "source": "/i18n/:match*.overrides.json",
  "destination": "/empty-overrides.json"
}
```

- 对应尝试过通过构建复制空文件。

#### 后续变体

- 用户删除了静态空文件，希望构建时动态写入。
- 构建脚本一度改成：

```bash
printf '{}\n' > "$DIST_DIR/empty-overrides.json"
```

#### 已确认事实

- 这条路线在技术上可行，且本地曾验证构建成功生成空 JSON。

### 7.2 方案二：把空文件命名统一成 `empty.json`

#### 实际观察

- 某个阶段 [build.sh](/mnt/f/claude-web-i18n/build.sh) 中实际存在：

```bash
printf '{}\n' > "$DIST_DIR/empty.json"
```

- 同时 [vercel.json](/mnt/f/claude-web-i18n/vercel.json) 中曾存在：

```json
{
  "source": "/i18n/:match.overrides.json",
  "destination": "/empty.json"
}
```

### 7.3 最终结论：放弃服务端 `overrides`

#### 用户决定

- 前端自己检测并返回空对象，不再需要服务端提供 `overrides`

#### 已确认事实

- 最终已删除：
  - 构建阶段生成 `empty.json` 的逻辑
  - `/i18n/*.overrides.json` 的 rewrite

## 8. 版本信息方案的演进

### 背景

- 用户希望给前端提供缓存更新策略，不想手动维护版本号
- 讨论过是否直接使用 git commit hash

### 8.1 对 commit hash 方案的结论

#### 已确认事实

- 本次会话中明确认为：单纯用 git commit hash 不足以作为语言文件缓存主键。

#### 原因

- commit hash 只能说明“构建版本变了”
- 不能精确表达“某个具体语言文件内容是否变化”

### 8.2 转向“构建时按文件内容计算 hash”

#### 已确认事实

- 最终确认采用“文件 hash”作为缓存判断依据。
- 理由是：文件内容 hash 变化，天然意味着对应资源需要更新。

### 8.3 版本文件初版：独立 `version/` 目录

#### 实际尝试

- 曾经在构建时生成：
  - `dist/version/zh-CN.json`

结构曾被设计成：

```json
{
  "locale": "zh-CN",
  "builtAt": "2026-04-03T15:00:38Z",
  "hash": {
    "main": "...",
    "statsig": "...",
    "overrides": "..."
  }
}
```

#### 后续放弃原因

- 用户觉得维护一个新的 `version/` 目录不够理想
- 希望把版本文件直接放到每个语言目录下

### 8.4 最终版本文件落点：`/<locale>/version.json`

#### 实际实现

当前 [build.sh](/mnt/f/claude-web-i18n/build.sh) 中，构建时为每个语言目录生成：

```bash
cat > "$DIST_DIR/$locale/version.json" <<EOF
{
  "locale": "$locale",
  "builtAt": "$BUILT_AT",
  "hash": [
    "$MAIN_HASH",
    "$STATSIG_HASH"
  ]
}
EOF
```

#### 当前 rewrite

当前 [vercel.json](/mnt/f/claude-web-i18n/vercel.json) 中存在：

```json
{
  "source": "/version/:locale.json",
  "destination": "/:locale/version.json"
}
```

#### 本地验证

执行过：

```bash
bash ./build.sh && find dist -maxdepth 2 -type f | sort
cat dist/zh-CN/version.json
```

看到的产物结构为：

```text
dist/404.html
dist/index.html
dist/zh-CN/version.json
dist/zh-CN/zh-CN.json
dist/zh-CN/zh-CN.statsig.json
```

且版本文件内容示例为：

```json
{
  "locale": "zh-CN",
  "builtAt": "2026-04-03T15:03:13Z",
  "hash": {
    "main": "60c174db7ae041e13c5ac9606c4acbd810137b2f6afb0f36454b70bababd19d8",
    "statsig": "428f2056e847803a63ab1ab0b78b105c45b842fc8e9ad9fee53af6afcf2cfb7f"
  }
}
```

### 8.5 版本文件字段结构又发生过一次调整

#### 已确认事实

- 用户曾明确要求版本文件格式为：

```json
{
  "locale": "zh-CN",
  "builtAt": "2026-04-03T14:20:00Z",
  "hash": {
    "main": "sha256-xxx",
    "statsig": "sha256-yyy"
  }
}
```

- 但当前工作区中的 [build.sh](/mnt/f/claude-web-i18n/build.sh) 实际已经变为输出数组：

```json
"hash": [
  "$MAIN_HASH",
  "$STATSIG_HASH"
]
```

#### 已确认事实

- 这说明当前代码状态与本次会话中曾确认过的对象结构不完全一致。

#### 推测

- 该变化大概率发生在本会话后续用户侧修改，或在未单独展开的工作区变更中产生。

#### 未完成项

- 若后续文章需要精确复现“最终达成的接口结构”，需要再次确认当前仓库究竟以对象结构还是数组结构为准。

## 9. 本地验证中出现过的异常与解释

### 9.1 `vercel build` 无法本地直接验证

#### 已确认事实

- 本地执行 `vercel build` 失败，原因是本地 `vercel` 找得到，但 `node` 缺失：

```text
/mnt/c/Applications/nodejs/vercel: 15: exec: node: not found
```

### 9.2 读取 `dist/zh-CN/version.json` 时出现过一次瞬时失败

#### 现象

执行过：

```bash
sed -n '1,120p' dist/zh-CN/version.json
```

曾得到：

```text
sed: can't read dist/zh-CN/version.json: No such file or directory
```

但紧接着再次列目录和读取：

```bash
ls -la dist/zh-CN
cat dist/zh-CN/version.json
```

确认文件实际存在。

#### 已确认事实

- 最终文件确实存在。

#### 推测

- 该次失败更像是命令执行时机或上一个并行命令的输出时序问题，不像真实构建缺失。

## 失败路线 / 放弃原因

### 失败路线 1：纯 rewrite，不做构建白名单

- 问题：无法阻止 `extension/` 随静态站点一起暴露
- 结论：放弃，改为生成 `dist/` 产物再发布

### 失败路线 2：服务端提供 `overrides` 空 JSON

- 问题：前端其实可以自行兜底，不需要额外文件和额外 rewrite
- 结论：放弃，删除 `empty.json` 与 overrides 路由

### 失败路线 3：单独维护 `version/` 目录

- 问题：用户觉得目录不自然，不如跟语言目录放一起
- 结论：改为 `/<locale>/version.json`

### 失败路线 4：把 commit hash 当作缓存更新唯一依据

- 问题：无法精确对应单个语言文件内容是否变化
- 结论：改为构建时基于文件内容计算 hash

## 已改动文件与目的

以下为本次会话中明确涉及过改动的文件路径及目的：

- [index.html](/mnt/f/claude-web-i18n/index.html)
  - 新增静态站点入口页，用于让 Vercel 有可访问根路径
- [404.html](/mnt/f/claude-web-i18n/404.html)
  - 新增静态 404 页面
- [vercel.json](/mnt/f/claude-web-i18n/vercel.json)
  - 配置 Vercel 构建输出目录
  - 配置 `/i18n/:locale.json`、`/i18n/statsig/:locale.json`、`/version/:locale.json` 的 rewrite
  - 中途曾加入又删除过 overrides rewrite
- [build.sh](/mnt/f/claude-web-i18n/build.sh)
  - 生成 `dist/` 白名单产物
  - 按语言复制静态文件
  - 计算语言主文件和 statsig 文件的 SHA-256
  - 生成每个语言目录下的 `version.json`
  - 中途曾加入又删除过空 overrides 文件生成逻辑
- [supported-locales.txt](/mnt/f/claude-web-i18n/supported-locales.txt)
  - 用作白名单语言目录列表

## 已确认事实汇总

- 当前成功路线是：
  - 构建时生成 `dist/`
  - 只复制白名单语言目录
  - 通过 Vercel rewrite 暴露标准访问路径
  - 每个语言目录下生成 `version.json`
- `extension/` 不应直接发布到前端
- `overrides` 最终不再由服务端提供
- 缓存更新策略应基于文件内容 hash，而不是 commit hash

## 推测汇总

- 早期 Vercel 构建失败，主要原因是远端构建分支缺少本地新增文件，而不是 rewrite 语法本身错误。
- 本次会话结束时，版本文件 `hash` 字段从对象变成数组，可能是用户后续直接改动了工作区。

## 未完成项

- 未在本次会话中验证线上 Vercel 实际部署结果
- 未在本次会话中验证 Claude Web 当前真实运行时 DOM 结构是否仍匹配旧扩展脚本
- 未确认当前仓库里版本文件 `hash` 字段的最终目标结构，需再次核对
- 未整理 `extension/` 当前新增的 `hook.js`、`panel.html`、`service.js` 的作用

## 下一步建议

- 再次确认 [build.sh](/mnt/f/claude-web-i18n/build.sh) 输出的 `version.json` 结构是否仍需使用对象格式而不是数组格式
- 在远端实际构建分支上提交并推送：
  - [build.sh](/mnt/f/claude-web-i18n/build.sh)
  - [vercel.json](/mnt/f/claude-web-i18n/vercel.json)
  - [supported-locales.txt](/mnt/f/claude-web-i18n/supported-locales.txt)
  - 各语言目录文件
- 线上部署后，实测以下 URL：
  - `/i18n/zh-CN.json`
  - `/i18n/statsig/zh-CN.json`
  - `/version/zh-CN.json`
- 若后续继续写“Claude Web i18n 逆向 / 扩展实现”文章，应补齐以下缺口：
  - 浏览器端真实运行时对象和 DOM 截图
  - 语言菜单插桩时的断点位置和事件流
  - `spa:locale` 在当前 Claude Web 中的真实更新链路
