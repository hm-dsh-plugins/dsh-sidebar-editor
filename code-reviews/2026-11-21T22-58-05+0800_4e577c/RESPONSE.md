# 修复记录

- **对应评审**：[REVIEW.md](./REVIEW.md)（被审提交 `4e577c0e3096546f76087daeb3fecfad8888f267`，评审开始于 2026-11-21T22-58:05+0800）
- **响应时间**：2026-11-21T23:19:01+0800
- **修复提交**：本文件与修复同一提交，提交信息引用本目录名。

## 逐项回应

### [P1][F1] 日期版本号是 semver 预发布版，`npm publish` 直接拒绝

- **处理**：已修复（文档口径，版本形态不变）。
- **位置**：[README.md:293-295](../../README.md#L293-L295)
- **做法**：在「版本号」一节写明发布命令是 `npm publish --tag latest`，并说明不带 `--tag` 时 npm 会拒绝、标签指向该版本后 `npm install` 照常可用。不改版本形态：`yyyy.MM.dd-x` 是约定的格式，改成三段式（如 `2026.1121.1`）会让版本号不再是可读日期。
- **验证**：文档改动，无自动断言。npm 的拒绝行为取自评审的离线复现（`npm publish --dry-run`），本轮未连真实 registry。

### [P2][F2] 滚动记忆按「第一个未隐藏的 `[data-sidebar-right-session]`」判断当前对话

- **处理**：已修复。
- **位置**：[src/client/scroll-memory.js:32-45](../../src/client/scroll-memory.js#L32-L45)（`visibleSession`）
- **做法**：只认最外层容器——任何自身带有 `[data-sidebar-right-session]` 祖先的节点都跳过，再在其中取不带 `hidden` 的那个。侧边栏内层那个从不隐藏的面板因此不再被当成交互对话。
- **验证**：
  - [scripts/dom.mjs](../../scripts/dom.mjs) 的对话容器改成上游真实的两层结构（外层带 `hidden`、内层不带），并让被保留的对话排在文档顺序前面——这正是误判的条件。两条检查在新的结构下通过：重开文件恢复 240、切换对话后回到 0。
  - 反向确认过这条测试确实会抓到这个缺陷：把 `visibleSession` 临时改回「第一个未隐藏的匹配」，`npm run verify` 立即在「switching conversation forgets where the file was」报 `FAIL :: 240`（54/55）。

### [P2][F3] 只含 CR 行尾的文件在保存时被静默改写成 LF

- **处理**：已修复。
- **位置**：[src/client/line-endings.js:27-79](../../src/client/line-endings.js#L27-L79)（`detectLineEnding` / `otherEnding` / `endingLabel`）
- **做法**：识别三种分隔符（`\r\n`、`\n`、孤立 `\r`），按多数决选出文件自己的行尾，平局时仍偏向 LF（保持旧行为）。CR 会成为保存时插入的分隔符，工具栏按钮显示 `CR`。`otherEnding` 只把 CR 导向 LF，不把 CR 放进 LF/CRLF 的循环——否则从 `CRLF` 点一下会写出一个 CR-only 文件。
- **验证**：[scripts/dom.mjs](../../scripts/dom.mjs) 新增三条：CR-only 文件报告自己的行尾、可以保存、写入的文本保留 `\r` 且不含 `\n`。

### [P2][F4] 写入本身失败时临时文件不删除

- **处理**：已修复。
- **位置**：[src/host/text-file.js:184-206](../../src/host/text-file.js#L184-L206)
- **做法**：把「建临时文件 → 写入 → flush → 复制权限位 → rename」整段包进一个 `try`，任何一步失败都先 `rm(temporary, { force: true })` 再原样抛错；`handle.close()` 放进内层 `finally`，它抛错也落进同一个清理窗口。rename 的独立 `catch` 因此不再需要。
- **验证**：[scripts/verify.mjs](../../scripts/verify.mjs) 新增一段正式检查：用注入 `ENOSPC` 的 `node:fs/promises` shim 加载 `lib/host/text-file.js` 的副本，断言写入被拒、目标文件未动、目录里没有 `.dsh-editor-*` 残留。评审的 `probe-temp-file-leak.mjs` 已不再是探针，而是这三条断言。

### [P3][F5] `bump-version` 先写 `package.json` 再读 `package-lock.json`

- **处理**：已修复。
- **位置**：[scripts/bump-version.mjs](../../scripts/bump-version.mjs)
- **做法**：先读并解析两份文件，都成功后才写；`package.json` 缺版本号时直接失败。脚本拆成可复用的导出（`today` / `nextVersion` / `bumpVersion`），只有作为程序运行时才执行写入（导入不会改动任何文件）。README 的 152 项里现在有 9 条覆盖它：同日 +1、跨日归 1、旧格式归 1、本地日期、manifest 与 lock 两处同步、缺 lock 时拒绝且 manifest 不变。
- **验证**：`npm run verify` 的 `bump:` 段落 9 条全绿；其中「缺 lock 时 manifest 不变」直接对应本次缺陷。

### [P3][F6] README 的体积表在 `b9f6b1f` 之后没有同步

- **处理**：已修复。
- **位置**：[README.md:260-264](../../README.md#L260-L264)
- **做法**：改为 1 547 KiB（未压缩）、869 KiB（`--minify`）、409 KiB（gzip -9）。tarball 450 KB 不变。
- **验证**：本轮重新构建并实测 `node:zlib` 的 gzip -9 字节数。

### [P3][F7] 无人读取的 `absolutePath` 状态与失败保存的 `at`

- **处理**：已修复。
- **位置**：[src/client/use-file-document.js](../../src/client/use-file-document.js)
- **做法**：删掉 `absolutePath` 状态及其三处写入（返回值也不再包含它）；`SAVE.failed` 不再写 `at`（没有读者，`describeStatus` 只在 `SAVE.saved` 读时间戳）。预览头部本来就显示路径，这一点与 README 一致。
- **验证**：`npm run verify` 全绿；DOM 挂载与保存路径无回归。

### [P3][F8] `host-route.js` 的 JSDoc 宣称有一个 `stat` 动作

- **处理**：已修复。
- **位置**：[src/client/host-route.js:16](../../src/client/host-route.js#L16)
- **做法**：类型改为 `'read' | 'write'`。

### [P3][F9] 编辑器宿主的 ref 是内联箭头函数

- **处理**：已修复。
- **位置**：[src/client/EditorBody.js:98-112](../../src/client/EditorBody.js#L98-L112)
- **做法**：ref 回调改为 `useCallback`（依赖 `scrollportRef`），宿主节点不再每次渲染被摘挂一次，`scrollportRef` 的交接只发生在挂载与卸载。没有把 `.cm-scroller` 交出去：编辑器自己已经记忆滚动位置，再让预览记一份会变成两套来源。
- **验证**：DOM 挂载与卸载的既有检查通过；没有直接断言「ref 不再重跑」的自动检查（React 的提交细节不适合在 jsdom 里断言）。

## 待确认项的处理

1. **行号导航与滚动恢复的先后**：已处理。`EditorBody` 把当前导航行通过 `lineRef` 交给 `useFileDocument`，`load` 在存在导航时不写回记忆位置——只留导航这一个动作能移动视图，因此不再依赖 React effect 与 CodeMirror 测量帧的先后。**未自动验证**：jsdom 没有布局，无法测「最终停在目标行」；需要在真实浏览器里点一个 `文件:行号` 链接确认。
2. **`callHost` 用 `document.baseURI` 解析相对路由**：已处理。`ROUTE` 改为以 `/` 开头的绝对路径，部署前缀不会再混进请求路径（Host 注册的就是绝对路径）。**未自动验证**：当前 GUI 挂在根路径，子路径部署没有环境可试。
3. **保存飞行途中文件被换掉**：未处理。当前 tab 与 `resourceAddress` 一一对应，路径不可达；为了一个当前不存在的复用方式引入额外状态，会把 `persist` 的契约变复杂。已在 `use-code-editor.js` 保留「body 可能被交给另一个文件」的注释，若上游将来改成复用，这里需要重新评审。
4. **`readText` 的尺寸上限只在 `stat` 时检查**：已处理。`readFile` 之后按实际字节数再判一次 `MAX_TEXT_BYTES`，超出时返回同样的 `too-large`。**未自动验证**：要构造 stat 与 readFile 之间文件增长，需要替换 `stat`；本轮只做了代码修正。
5. **`describeStatus` 的兜底**：保留。`SAVE.saved` 但 `at` 缺失时显示不带时间戳的「已保存」——这是一个不会静默失败的退化，而不是错误状态；删掉它反而会让状态行留空。

## 构建与测试

| 命令 | 结果 |
|---|---|
| `npm run build` | `built lib/client.js (1547 KiB) and lib/index.js + lib/host/` |
| `npm run verify` | `97/97 checks passed` + `55/55 DOM checks passed`，共 **152** 项（修复前 85 + 52 = 137），退出码 0 |
| `node --check`（改动过的 `src/**`、`scripts/bump-version.mjs`） | 通过 |
| `npm run build -- --minify` | 869 KiB；gzip -9 后 302 KiB（构建后已还原，产物仍对应默认构建） |

测试数量变化：

- `verify.mjs` 85 → 97：新增「写入失败清理临时文件」3 条，`bump-version` 9 条。
- `dom.mjs` 52 → 55：新增 CR-only 行尾 3 条；滚动用例改用两层对话结构（条数不变，覆盖更强）。

未自动验证：真实浏览器里的行号导航落点、子路径部署下的路由、stat 与 readFile 之间的尺寸窗口、`npm ci`（需要网络）、真实 registry 发布、`--minify` 产物在浏览器中的行为。
