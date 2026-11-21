# 代码评审记录

- **被审提交**：`4e577c0e3096546f76087daeb3fecfad8888f267`（`chore: 版本号改为日期 + 当日第几次构建`），父提交 `b9f6b1fbe8603d47b172a4f3364b74fddadb9631`（`feat: 保存后状态栏给出固定格式的时间戳`）。
- **分支**：`main`。
- **评审时间**：2026-11-21T22:58:05+0800（Asia/Shanghai）开始，2026-11-21T23:12+0800 结束。
- **评审开始时工作区状态**：`git status --porcelain` 为空（干净），`HEAD` 为 `4e577c0`。评审期间未改动任何生产代码或测试代码；`lib/` 被 `npm run build` 重建后与提交内容字节一致，`--minify` 产生的差异已用 `git checkout -- lib` 还原。
- **评审范围**：
  1. 变更评审：`b9f6b1f`（`formatTimestamp` + 状态栏文案）与 `4e577c0`（日期版本号 + `scripts/bump-version.mjs`）。
  2. 全项目评审：`README.md`（仓库内唯一的设计/行为文档，无 `DESIGN.md`）与 `src/`、`scripts/`、`package.json`、`lib/` 的一致性；三个方向：缺陷、实现、资源管理。
- 仓库里此前没有 `code-reviews/` 目录，这是第一轮评审，没有上一轮修复可对照。
- 本轮交付的 `code-reviews/` 未提交（按要求留给 fixer 与修复一起提交）。

## 变更评审结论

**`b9f6b1f`（固定格式时间戳）**：实现正确，未发现缺陷。

- `formatTimestamp` 逐字段补零、取本地时区，不再受 `toLocaleTimeString` 的 locale/秒数影响；`describeStatus` 只在 `SAVE.saved` 且 `at !== undefined` 时才格式时间戳，`at` 缺失时退回 `已保存`（该组合当前不可达，见"待确认"）。
- 中英文案（`已保存（{time}）` / `Saved ({time})`）与 README 第 46–48 行一致；`scripts/dom.mjs` 新增的固定格式断言在真实组件上通过。
- 唯一的副作用：它让 `lib/client.js` 增大了约 4 KiB，README 的体积表没有跟着更新（见 F6）。

**`4e577c0`（日期版本号）**：`package.json` 与 `package-lock.json` 的三处版本一致（`2026.11.21-1`）；脚本的同日 +1、跨日归 1、旧格式归 1、lock 同步都按 README 描述工作（见 `scripts/probe-bump-version.mjs`）。但版本形态本身引入了一个发布期错误（F1），脚本本身有一个失败顺序问题（F5）。

## 发现

### [P1][F1] 日期版本号是 semver 预发布版，`npm publish` 直接拒绝

- **位置**：[package.json:3](../../package.json#L3)、[scripts/bump-version.mjs:45](../../scripts/bump-version.mjs#L45)
- **触发条件**：按 README「版本号」一节的流程 `npm run bump && npm publish`（README 第 90–94 行把 npm 作为分发渠道之一）。
- **实际结果**：`2026.11.21-1` 是 semver 预发布版（`semver.parse(...).prerelease` 为 `[1]`）。npm 对"预发布版 + 默认 `latest` 标签"的发布直接报错，发布流程走不完：

  ```
  $ npm publish --dry-run
  npm error You must specify a tag using --tag when publishing a prerelease version.
  ```

  本机 npm 12.0.2 离线复现；对应实现见 `npm/lib/commands/publish.js` 的 `isPreRelease && isDefaultTag` 分支。另外 `semver.lt('2026.11.21-1', '2026.11.21')` 为 `true`，即任何一次"同日无后缀"的版本都排在预发布版之上，这个形态本身也不适合走 `latest`。
- **修复建议**：发布命令固定为 `npm publish --tag latest`，并把这条写进 README 的版本号/发布一节（或加一个 `release` npm script）；否则换一种不是预发布版的日期形态（例如 `2026.1121.1`、`2026.11.21001` 之类仍满足 semver 的三段式），或把"从 npm 安装"从 README 里去掉。**不接受**的处理是让用户自己记得加 `--tag`——文档里没有这个信息。

### [P2][F2] 滚动记忆按"第一个未隐藏的 `[data-sidebar-right-session]`"判断当前对话，真实 DOM 里会读到保留对话的面板

- **位置**：[src/client/scroll-memory.js:28](../../src/client/scroll-memory.js#L28-L42)（`visibleSession` / `syncSession`），调用点 [rememberScroll:69](../../src/client/scroll-memory.js#L68-L75)、[recallScroll:84](../../src/client/scroll-memory.js#L83-L86)
- **触发条件**：同时有两个对话的侧边栏视图常驻（一个对话有保留标签页就会这样，这正是 README 场景），且当前对话不是 `views` 排序后的第一个。上游 `SidebarSessionViews.publish()` 按 `sessionId.localeCompare` 排序，所以"当前对话不在第一位"很常见。
- **实际结果**：`data-sidebar-right-session` 在上游被写在两个元素上——保留对话的外层容器（带 `hidden`，`ui-sidebar-right/src/client/shell/RightbarRoot.tsx:22`）和它内部的面板（**从不带 `hidden`**，`SidebarRight.tsx:347`）。`visibleSession()` 返回的是第一个 `hidden !== true` 的匹配，于是命中的是"某个保留对话的内部面板"，而不是当前对话。后果有两个方向：
  1. 切换对话时 `activeSession` 不变，`positions.clear()` 不执行，再切回来仍恢复到旧位置，与 README 第 38 行"切换对话后从首行开始"不符；
  2. 保留视图被回收（关掉该对话最后一个标签）时，第一个匹配会跳到别的对话，位置被无端清空。

  `scripts/probe-scroll-session.mjs` 用与上游相同的 DOM 形态复现（`session-b` 是当前对话，`session-a` 是被保留且排在前面的对话）：

  ```
  matches in document order: [ 'session-a(wrapper) hidden=true', 'session-a(panel) hidden=false',
                               'session-b(wrapper) hidden=false', 'session-b(panel) hidden=false' ]
  recall before switching conversation: 240
  recall after switching to another conversation: 240     ← 期望已被清空
  ```

  现有 `scripts/dom.mjs` 的滚动检查只构造了单层元素（`sidebarSession()` 造一个带该属性的 div，没有内层面板），所以测试是绿的。
- **修复建议**：不要以"第一个未隐藏的匹配"为准。两个可行方向：(a) 只认外层容器——跳过自身是另一个匹配元素后代的节点，或反过来取匹配元素里 `closest('[hidden]') === null` 且**自身不是**另一个未隐藏匹配的后代；(b) 干脆不用 DOM 猜：`scrollportRef` 回调时从 `useTabInfo()` 拿当前 `sessionId`，把"当前对话"作为显式输入传进来。后者与 README 的语义更一致，也不用依赖别人的 DOM 属性。无论哪种，`scripts/dom.mjs` 的滚动用例都应改成上游的真实层级（外层 `hidden` + 内层面板）。

### [P2][F3] 只含 CR 行尾的文件在保存时被静默改写成 LF

- **位置**：[src/client/line-endings.js:24](../../src/client/line-endings.js#L24-L32)（`detectLineEnding` 只数 `\n`）、[src/client/use-file-document.js:212](../../src/client/use-file-document.js#L209-L216)（保存时用选定的行尾重新拼接）
- **触发条件**：打开一个只用 `\r` 作行分隔的文件（经典 Mac 格式，或某些老工具导出的文本），改一处后保存。
- **实际结果**：`detectLineEnding` 对 `first\rsecond\rthird\r` 返回 LF（`crlf = lf = 0`），而 CodeMirror 用的是 `/\r\n?|\n/`（`@codemirror/state` 的 `DefaultSplit`），所以文档有 3 行；保存时按 LF 拼接，磁盘上的每个 `\r` 都变成 `\n`。`scripts/probe-cr-only-save.mjs` 在真实组件上复现：

  ```
  file on disk (read): "first\rsecond\rthird\r"
  text the save writes: "first\nsecond\nthird\nx"
  status line: 已保存（2026-11-21 23:11:50）
  ```

  也就是说，状态栏报"已保存"，但文件的换行字节被改了，且没有任何提示。README 第 49–52 行只说"多数的字节的行尾为准"，而这里 CR 是 100% 的行尾却不是被选中的那个。
- **修复建议**：`detectLineEnding` 把 `\r` 也计入（`\r\n` 记 CRLF，孤立 `\r` 记 CR），并在只检出 CR 时明确处理：要么拒绝保存并给出"这个文件使用 CR 行尾，保存会改写为 LF"的说明条，要么在行尾控件里加上 CR。最省事的诚实做法是检出 CR 时在工具栏/状态栏提示一句，别静默改写。回归用例可以直接复用 `probe-cr-only-save.mjs` 的形态，断言写入的文本里保留 `\r`。

### [P2][F4] 写入本身失败时临时文件不删除，用户内容留在工作区里

- **位置**：[src/host/text-file.js:174](../../src/host/text-file.js#L174-L190)
- **触发条件**：临时文件已创建，但 `writeFile` / `sync` / `close` 抛错（磁盘满、I/O 错误、配额、句柄被吊销），即"写不进去"而不是"rename 失败"。
- **实际结果**：`try { writeFile; sync } finally { close }` 之后直接抛出，`rm(temporary)` 只在 `rename` 失败的 catch 里执行，于是 `<目标文件>.dsh-editor-<pid>-<时间戳>-<序号>.tmp` 留在原目录。它带着用户刚编辑的内容（或半截内容），`git status` 看不到（`.gitignore` 有 `*.tmp`），除非有人去翻目录。`scripts/probe-temp-file-leak.mjs` 用 fs shim 注入 `ENOSPC` 复现：

  ```
  writeText rejected with: ENOSPC - ENOSPC: no space left on device, write
  target still holds: "old contents\n"
  temporary files left in the directory: [ 'notes.txt.dsh-editor-38680-1795273910560-0.tmp' ]
  ```

  （目标文件本身没被破坏，这点是对的。）
- **修复建议**：把临时文件的整个生命周期包进一个 `try/catch`，任何失败（含 `writeFile`/`sync`/`close`/`chmod`）都先 `rm(temporary, { force: true })` 再原样抛出；`rename` 的 catch 就可以合并进去。注意 `finally` 里 `handle.close()` 抛错会覆盖原始错误，也顺手 `catch` 掉或保留原始错误。`verify.mjs` 里"临时文件不残留"那条只覆盖成功路径，建议补一条失败路径（用同样的注入方式，或至少断言 `writeText` 的错误分支里有 `rm`）。

### [P3][F5] `bump-version` 先写 `package.json` 再读 `package-lock.json`，lock 不可读时崩在中间且已经消耗了当天的编号

- **位置**：[scripts/bump-version.mjs:47](../../scripts/bump-version.mjs#L47-L56)
- **触发条件**：`package-lock.json` 缺失（例如 `npm install` 前、`git clean` 后、局部检出）或不是合法 JSON。
- **实际结果**：`package.json` 已被改写为新版本，进程随后在读 lock 时抛 `ENOENT` 退出；工作区留在"manifest 已加一、lock 还是旧版本"的不一致状态，`npm ci` 会因此拒绝运行，而这次的 `-n` 已经被用掉了。`scripts/probe-bump-version.mjs` 复现：`package.json` 从 `2026.11.21-7` 变成 `2026.11.21-8`，进程非零退出。
- **修复建议**：先读完并解析两份文件，确认都能写，再依次写回（或者先写 lock、后写 manifest，让 `package.json` 成为最后一步，契约上更安全）；读不到 lock 时直接失败，不动 manifest。另外 `scripts/bump-version.mjs` 目前没有任何检查覆盖（`verify.mjs` / `dom.mjs` 都不跑它，README 的 137 项里也没有它），而这个脚本每次发布都要跑——把 `probe-bump-version.mjs` 的同日/跨日/lock 同步三条做成正式断言，成本很低。

### [P3][F6] README 的体积表在 `b9f6b1f` 之后没有同步

- **位置**：[README.md:261](../../README.md#L259-L264)
- **触发条件**：任何一次按 README 复核体积的读者。
- **实际结果**：`npm run build` 报 `1546 KiB`、`npm run build -- --minify` 报 `869 KiB`、`gzip -9` 为 `409 KiB`，README 写的是 `1 542 KiB`、`867 KiB`、`408 KiB`（tarball 的 `450 KB` 是对的：`npm pack --dry-run` 为 449 665 字节）。差值（约 4 KiB / 2 KiB / 1 KiB）与 `b9f6b1f` 往 bundle 里加的代码量量级一致，说明这次提交更新了 tarball 数字却漏了 bundle 那三个。
- **修复建议**：改成 1 546 KiB / 869 KiB / 409 KiB（并注明 gzip 的级别，或者干脆只写约数）。

### [P3][F7] `use-file-document` 维护了一个没人读的 `absolutePath` 状态，失败的保存也记录了一个没人读的 `at`

- **位置**：[src/client/use-file-document.js:33](../../src/client/use-file-document.js#L27-L35)、[:138](../../src/client/use-file-document.js#L138)、[:227](../../src/client/use-file-document.js#L227)、[:284](../../src/client/use-file-document.js#L284)；`setSave({ state: SAVE.failed, at: new Date() })` 在 [:239](../../src/client/use-file-document.js#L239)
- **触发条件**：每次读/存成功。
- **实际结果**：`absolutePath` 只被写入、并在返回值里出现，`EditorBody` 从不读取它（`grep absolutePath src/` 只有这几处），每次 `setAbsolutePath` 都白白多一次渲染；`save.at` 只在 `state === SAVE.saved` 时被 `describeStatus` 消费，失败分支写入的 `Date` 永远没有读者。
- **修复建议**：删掉 `absolutePath` 状态（预览头部本来就显示绝对路径，README 第 41 行也说路径不重复），`SAVE.failed` 分支不写 `at`。这两处都属于"生产代码里没人消费的状态"，删掉比保留更容易理解。

### [P3][F8] `host-route.js` 的 JSDoc 宣称有一个 `stat` 动作，协议里并不存在

- **位置**：[src/client/host-route.js:14](../../src/client/host-route.js#L14)
- **触发条件**：读代码的人按注释理解协议。
- **实际结果**：`callHost` 的 JSDoc 写 `'read' | 'write' | 'stat'`，而 Host 侧只有 `read` / `write`，`scripts/verify.mjs:253-254` 还专门断言 `stat` 会得到 `unknown-action`。README 第 19 行的表述（`read` / `write`）是对的，只有这行注释错了。
- **修复建议**：把类型改成 `'read' | 'write'`。

### [P3][F9] 编辑器宿主的 ref 是内联箭头函数，每次渲染都让 React 摘挂一次 ref，预览的 scrollport 被来回重置

- **位置**：[src/client/EditorBody.js:84](../../src/client/EditorBody.js#L84-L92)
- **触发条件**：`EditorBody` 任意一次重渲染（键入使状态变脏、保存状态变化、语言/主题切换）。
- **实际结果**：内联 ref 每次都是新函数，React 在提交阶段先以 `null` 调用旧 ref、再以节点调用新 ref。`scrollportRef(null)` 在上游 `TextPreview.bindScrollport`（`ui-sidebar-documentpreview/src/client/TextPreview.tsx:122-126`）里会把 `scrollportRef.current` 换成预览自己的外层 body，并把它的 `scrollTop` 写成预览记住的偏移（对编辑器来说是个不滚动的 div，等于丢弃这次交接）；随后 `scrollportRef(node)` 再换回来。功能上看不出坏结果，但每次提交都发生一次 scrollport 交接闪断，预览自己的"记住这个标签的滚动位置"对编辑器永远不生效（它收到的事件 `target` 不是它认的 scrollport）。
- **修复建议**：用 `useCallback` 把 ref 回调固定下来（或把 `containerRef` 作为 ref 直接用、`scrollportRef` 只在挂载/卸载时调用一次）。顺带可以决定：要不要把 `.cm-scroller` 作为 scrollport 交出去——接口注释说的是"renderer-owned scrollport"，交出宿主 div 在语义上不对。

## 待确认

以下问题无法只凭本仓库代码证伪/证实，列为待确认：

1. **行号导航与滚动恢复的先后顺序**：`EditorBody` 的行号导航效果（[EditorBody.js:68-75](../../src/client/EditorBody.js#L68-L75)）在 `doc.phase` 变成 `ready` 后 dispatch `scrollIntoView`，而 `load` 同时排了一个 `requestMeasure` 把 `scrollTop` 写成记住的位置（[use-file-document.js:169-176](../../src/client/use-file-document.js#L169-L176)）。带 `文件:行号` 打开文件时，两者谁最后落地取决于 React passive effect 与 CodeMirror 测量帧的先后；若测量帧在后，滚动会被拉回记忆位置（首次打开即 0），只有光标落在目标行。
2. **`callHost` 用 `document.baseURI` 解析相对路由**（[host-route.js:20](../../src/client/host-route.js#L20)）：当前 GUI 挂在根路径（`http://127.0.0.1:3090/`）所以解析为 `/api/plugins/dsh-sidebar-editor`；若界面被部署到某个子路径下，请求会变成 `<prefix>/api/...`，而 Host 注册的是绝对路径 `/api/...`。没有反代/子路径部署的证据，故只作提示。
3. **保存飞行途中文件被换掉**：`persist` 用的是当前 `file` prop（[use-file-document.js:209-216](../../src/client/use-file-document.js#L209-L216)），而 `use-code-editor.js:27-32` 的注释明确假设"body 可能被交给另一个文件而不重建"。真实预览里 tab 与 `resourceAddress` 一一对应（`renderSlot` 的 `entryKey` 是渲染器 id，tab 的 `contentId` 不变），所以这个假设目前不成立；一旦上游改了复用方式，飞行中的保存会把 A 的正文写进 B，并按 A 的版本号校验。
4. **`readText` 的尺寸上限只在 `stat` 时检查**（[text-file.js:62-67](../../src/host/text-file.js#L62-L68)）：`stat` 与 `readFile` 之间文件增长会读出超过 12 MiB 的内容。属于并发窗口，未构造复现。
5. **`describeStatus` 的兜底**：`SAVE.saved` 但 `at === undefined` 会显示无时间戳的 `已保存`（[EditorBody.js:206-208](../../src/client/EditorBody.js#L206-L210)）。当前所有 `SAVE.saved` 都由 `persist` 写入并带 `at`，所以不可达；如果以后有别的路径设置 `saved`，状态栏就会静默退化成另一种文案。

## 构建与测试

以下都在 `S:\local\repos\dsh-plugins\dsh-sidebar-editor` 下执行，Node `v26.13.1`、npm `12.0.2`、Windows。

| 命令 | 结果 |
|---|---|
| `npm run build` | `built lib/client.js (1546 KiB) and lib/index.js + lib/host/`；重建后 `git status --porcelain` 为空，`lib/` 与提交内容逐字节一致 |
| `npm run verify` | `85/85 checks passed` + `52/52 DOM checks passed`（共 137，与 README 一致），退出码 0 |
| `npm run build -- --minify` | `built lib/client.js (869 KiB, minified)`；随后 `git checkout -- lib` 还原，`git status` 干净 |
| `npm pack --dry-run` | tarball 449 665 字节，10 个文件（`LICENSE`、`README.md`、`cordis.patch.yml`、`package.json`、`lib/index.js`、`lib/client.js`、`lib/host/*.js`），`*.map` 不进包 |
| `node --check`（`src/**`、`scripts/**` 全部） | 通过 |
| `npm publish --dry-run`（离线，临时目录里放同名同版本的 `package.json`） | `npm error You must specify a tag using --tag when publishing a prerelease version.`（F1 的复现；未触碰真实 registry） |

评审用到的探针脚本（都在 `scripts/` 下，只读仓库、只在系统临时目录里造文件，跑完自行清理）：

| 脚本 | 用途 | 结论 |
|---|---|---|
| `scripts/probe-scroll-session.mjs` | 用上游的两层 `[data-sidebar-right-session]` 结构跑 `src/client/scroll-memory.js` | F2 |
| `scripts/probe-cr-only-save.mjs` | jsdom 挂载真实 `EditorBody`，读入 CR-only 文件并保存 | F3 |
| `scripts/probe-temp-file-leak.mjs` | 把 `lib/host/text-file.js` 的 fs 依赖换成注入 `ENOSPC` 的 shim，验证失败路径 | F4 |
| `scripts/probe-bump-version.mjs` | 在临时 checkout 里跑 `scripts/bump-version.mjs`（同日/跨日/旧格式/非补零/缺 lock） | F5 |
| `scripts/probe-workspace-root.mjs` | 检查 `contains()` 在工作区是驱动器根（`C:\`）时是否误判 | 否证：`C:\` 归一化后仍能正确包含其下路径，未发现问题，保留以记录本轮查过 |

## 未验证项

- **真实浏览器/真实 DSH 实例上的滚动行为**：F2 是从上游源码里的两处 `data-sidebar-right-session` 写出点 + 构造 DOM 证明的，没有在真实浏览器里开两个保活对话逐像素核对（会改动用户的实例状态，未做）。
- **`npm ci`**：需要网络，本轮不执行；只静态核对了 `package.json` / `package-lock.json` 的三处版本一致。
- **真实 registry 上的 `npm publish`**：只离线复现了 npm 的拒绝逻辑，没有真正推送（F1 的修复需要发布者确认走 `--tag` 还是改版本形态）。
- **`--minify` 产物在浏览器里的行为**：只测了体积，没有在浏览器里加载压缩产物。
- **`inject` 检查的完整性**：`verify.mjs` 用正则扫 `ctx.<service>`，动态取服务（`ctx.get('sessionPersistence')`）不在检查范围内；本轮没有人工枚举所有可能的 `ctx.get` 用法。
