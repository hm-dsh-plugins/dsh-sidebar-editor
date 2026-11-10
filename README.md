# dsh-file-editor

在 DeepSeek Harness 的右侧边栏里，用 CodeMirror 直接把文件当记事本编辑。

DSH 自带的文件预览是**只读**的，这是它的设计：`@deepseek-ai/dsh-client-ui-sidebar-documentpreview`
只通过 `workspaceFiles` 这个 Remote 命名空间读文件，而这个命名空间**不提供任何写入操作**。
所以点开 `.txt` 只能看，选中复制也不顺手。

这个插件补上缺的那一半：一个可编辑的渲染器 + 一条受限的写入通道。

```
点开文件 → 直接就是编辑器 → 改 → Ctrl/Cmd+S
```

## 它做了什么

| 一半 | 内容 |
|---|---|
| **Host** | 在共享 `/api` 通道上注册一条已认证的路由 `POST /api/plugins/dsh-file-editor`（动作放在请求体里：`read` / `write`）。路径被限制在**当前会话的工作区**内；写入走同目录临时文件 + rename，写入前后各 flush 一次，失败不会留下半个文件。 |
| **Client** | 向 `documentPreviews` 注册一个额外的渲染器，并把它挂到 `sidebar.right.tab.document` 这个槽位上。只读预览一个都没动，仍可随时切回去。 |

> 动作为什么放在请求体而不是子路径？因为 Connection 的 Fetch 路由表是**精确路径**表
> （`map.get(pathname)`）。注册一个“前缀”不会收到它的子路径，`…/read` 会直接落到
> SPA 的 404。这一点在真实实例上实测过：路径拆成子路径时返回 `not found`，改成单一路径后
> 请求正确进入插件处理器。

**只读预览被保留。** 该插件不替换任何内置渲染器，只是在同一个「渲染器」下拉里多给一个选项，
并且因为注册在 `extension` 档位而默认排在前面。图片、PDF、Office、表格继续用它们自己的只读预览。

### 编辑体验

- CodeMirror 6：行号、撤销/重做、括号匹配与自动闭合、代码折叠、自动补全、多光标、查找替换（Ctrl/Cmd+F）、当前行高亮。
- 语法高亮覆盖约 130 种后缀，分两档：
  - 专用语法包：JavaScript / TypeScript / JSX / TSX、JSON、HTML、CSS、XML、YAML、Markdown、Python；
  - 轻量流式解析器：Shell、PowerShell、C/C++/Java/C#/Kotlin/Scala/Swift、Go、Rust、Ruby、PHP、Lua、Perl、R、Julia、Haskell、Clojure、Erlang、SQL、TOML、INI/`.env`、Dockerfile、diff/patch、CMake、Nginx、protobuf、HTTP、CoffeeScript、Fortran、Pascal、Tcl、Verilog、Elm、Haxe、Groovy、Octave、Jinja、VB。
  - 没识别的后缀就是纯文本，照样能编辑。
- 配色直接用应用的 `--dsw-alias-*` 设计令牌，所以亮色/暗色主题自动跟随。
- 中文 / 英文界面文案按 `document.lang` 自动选择。
- 工具栏只画预览头部表达不了的东西：语言标签、保存状态、行尾、`撤销改动`、`保存`。
  **文件路径不在这里重复一遍**——预览头部本来就显示着它，标签页上是文件名。

### 保存

- **只手动保存**，不会自动落盘：`Ctrl+S` / `Cmd+S`，或工具栏的「保存」按钮。
- 状态栏实时显示 `未保存` / `保存中…` / `已保存 · 时间` / `保存失败`；失败时下方会多出一条说明原因的红条
  （例如 `保存失败：…`，来自 Host 的错误信息），保存按钮保持可用，直接再按一次即可重试。
- **行尾**：工具栏那个 `LF` / `CRLF` 按钮切换这个文件写回时用的行尾，**默认取文件当前的**——
  打开一个 CRLF 文件、改两个字、保存，它还是 CRLF。点一下换成另一种，按钮上的字跟着变，
  状态栏同时转「未保存」（行尾也是文件内容的一部分，不写回不算保存）。
  CodeMirror 内部按行存文档，所以切换只影响保存时插入的分隔符，不动正文；多数字节的行尾为准。
- **冲突保护**：保存时带上读取时的文件版本（修改时间 + 字节数）。如果文件在这期间被别的程序改过，保存会被拒绝并弹出选择：`仍然覆盖` 或 `重新载入`。
- **外部改动不吞编辑**：预览发现文件在磁盘上变了而编辑器里还有未保存修改时，不会直接重载覆盖，而是显示同一组选择——丢弃编辑重新载入，或继续编辑并覆盖。
- **BOM 原样往返**：带 UTF-8 BOM 的文件读进来时把 BOM 记下来（编辑器里不显示），保存时原样写回；没有 BOM 的文件不会被加上。
- **只读文件明确拒绝**：目标是只读文件时返回 `403 read-only`，而不是在 rename 那一步报一个看不懂的 I/O 错误。
- 「撤销改动」按钮丢弃未保存的修改，重新从磁盘读取（行尾也一并回到文件当前的值）。

### 明确的拒绝，而不是静默损坏

| 情况 | 结果 |
|---|---|
| 路径逃出会话工作区（`..`、外部绝对路径、指向外面的符号链接） | `403 outside-workspace`，并告诉你工作区根在哪。链接是祖先目录、目标文件还不存在时同样拒绝（按最近的已存在祖先做 realpath） |
| 文件含 NUL 字节或不是合法 UTF-8 | `415 not-text`，提示改用只读预览 |
| 超过 12 MiB | `413 too-large` |
| 目标文件是只读的 | `403 read-only` |
| 对已存在的文件保存、但请求没带版本 | `428 version-required`。不带版本的写入只能是无从判断的覆盖，宁可拒绝 |
| 目录、符号链接末端、不存在的路径、工作区根目录本身 | `404 not-found` |

## 安装

插件包就在工作区里：`S:\local\share\repos\dsh-plugins\dsh-file-editor`（已构建，`lib/` 里有产物）。
`lib/` 随包一起提交，所以安装时不需要跑任何构建脚本，也不需要网络下载编译器。

> 给**别人**装、或者要发到 npm 和插件市场，见 [Publish.md](Publish.md)。下面这一节只讲本机。

### 推荐：本地路径安装

```powershell
npx -p @deepseek-ai/dsh dsh plugin --profile web add S:\local\share\repos\dsh-plugins\dsh-file-editor
```

装完**重启** DSH，然后刷新浏览器页面。

### 备选：手工接线（跳过包管理器）

不经过 npm/pnpm，直接把包目录链接进 profile：

```powershell
$profile = "$env:USERPROFILE\.dsh\profiles\web"
New-Item -ItemType Directory -Force -Path "$profile\node_modules" | Out-Null
New-Item -ItemType Junction -Path "$profile\node_modules\dsh-file-editor" `
         -Target "S:\local\share\repos\dsh-plugins\dsh-file-editor"
```

然后在 `$profile\cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: dsh-file-editor
      name: dsh-file-editor
```

重启 DSH 并刷新页面。`dsh --profile web --dump-config` 应当能看到 `dsh-file-editor` 这一行。

### 卸载

删掉 junction 和 `cordis.patch.yml` 里那个 `- insert:` 块（或用 `dsh plugin remove`），重启即可。客户端 fiber 会连同它注册的渲染器与槽位一起移除；组件注入到 `document.head` 的那张样式表会留到页面刷新为止——它的规则全部以 `.dsh-editor-` 开头，不会碰到别的界面。

## 怎么用

1. 在右侧「文件」标签里展开目录，点开一个文本文件。
2. 它直接就以编辑器打开——本插件在 `extension` 档位注册，排在 `builtin` 档位的只读预览前面。
   想换回只读预览，用预览头部的**渲染器下拉**选「纯文本」或「代码」即可。
3. 直接改，`Ctrl+S` 保存。

> 只读预览一个都没动，只是排在后面。图片、PDF、Office、表格不在本插件的后缀声明里，
> 仍然用它们自己的预览打开。

按行跳转（对话里的 `文件:行号` 链接）照常工作：编辑器会把光标移到那一行。

## 验证结论

`npm run verify` 会跑两套检查，共 133 项：

- **Host 与客户端包 85 项**（`verify.mjs`）：
  - Host：读、写、建目录、UTF-8 往返、**BOM 往返**、版本冲突拒绝与强制覆盖、**没带版本的覆盖被拒绝（`version-required`）**、路径穿越/外部绝对路径拒绝、**目录链接下的新文件拒绝**、**只读文件拒绝**、二进制与非法 UTF-8 拒绝、BOM 剥离、目录与工作区根拒绝、参数校验、未知会话、未知动作、临时文件不残留、**未物化会话经 `sessionPersistence` 解析**、**转义后超出内容上限的合法请求体照常保存**、**源码里用到的每个 `ctx.<服务>` 都在 `inject` 里声明**（递归扫描 `src/index.js` 与 `src/host/`）、**每个 `src/host/*.js` 都出现在 `lib/host/` 里**。
  - 客户端包：构建产物带「Generated from src/」banner、`__ModuleLoader__` 注册格式、包名、`factory(require)`、React 走平台模块表、`apply`/`inject` 导出、渲染器元数据（id、extension 档位、`loading: 'renderer'`、`wrap`）、130+ 后缀声明、body 槽位与 key、两处注册都由 effect 拥有，以及**源码里用到的每个 `ctx.<服务>` 都在 `inject` 里声明**。
- **DOM 挂载 48 项**（jsdom）：真把组件挂起来——读请求发出且路径解码正确、CodeMirror 挂载、行号开启、文件正文进入文档、contenteditable、样式只注入一次、卸载时干净拆除；**工具栏不重复文件路径**；**行尾控件**默认取文件自己的行尾、切换后转为未保存、切到 LF 就写 LF、切回 CRLF 就写 CRLF；**文档真的变了才算未保存**（直接向视图派发变更，覆盖「变更监听在视图创建之后挂上」这条时序）；**焦点在工具栏按钮上时 `Ctrl+S` 同样保存**；**被拒绝的保存会说明原因**；**保存后跟随的自动刷新不会重设文档**；**读还没落地时按 `Ctrl+S` 一个字节都不写**；**保存飞行途中继续键入，状态保持「未保存」**；**外部刷新不覆盖未保存编辑，冲突条给出「重新载入」且真的重载**；**打开失败后重试，编辑器回到面板并载入正文**；**界面语言切换后文案跟着变**。

> `inject` 检查是补的：cordis 只对**声明过**该服务的 fiber 解析 `ctx.<服务>`，
> 没声明就读取会抛 `cannot get property "x" without inject`，整个客户端条目直接 failed。
> 早期版本声明的是 `inject = ['slots']` 却用了 `ctx.documentPreviews`，于是 `dsh-file-editor`
> 的客户端条目在启动时失败，页面停在 "web boot: 1 entry did not activate"。
> 当时 74 项检查全绿——因为对 `documentPreviews` 的断言用的是 mock context，它永远提供该服务。
> 现在两半都从源码推导该用哪些服务，加一个服务却忘了声明会让 `npm run verify` 直接红。

> 另外两条 Host 检查也各自编码了一个真实缺陷：会话不在内存里时，
> `sessionPersistence.stat` 返回的是 `{ header, revision }`，工作区在 `header.cwd` 上，
> 早先少读一层 `header` 会让这类会话一律报 `unknown-session`；
> 请求体的上限是传输护栏而不是内容规则——JSON 转义会把换行翻倍，
> 一个完全合法的写请求其请求体可以超过内容上限，早先这种请求会被当成畸形请求拒掉。

另外在真实实例上做过这些核查（用一个临时 `DSH_HOME` + 与你 profile 相同的 bundle 组合启动）：

- `--dump-config` 的输出里出现 `- id: dsh-file-editor` 这一层，说明 bundle 补丁生效。
- `__DSH_BOOT__` 的 entries 里有 `{"id":"dsh-file-editor","url":"plugins/??dsh-file-editor/client.js&rev=…"}`，说明 Host 扫描识别了 `dsh.client` 声明。
- 该 combo URL 返回 **200（1.5 MB）**，内容以 `window.__ModuleLoader__.load({ id: "dsh-file-editor" …` 开头（现在前面多了一行「Generated from src/」banner）。
- 带浏览器 cookie 的 `POST /api/plugins/dsh-file-editor` 打到了插件自己的处理器上：返回的是插件的 JSON 错误体
  `{"code":"unknown-session",…}`，而不是通用 `not found`。未认证时是 401。
  这条也顺带证明了协议改动——早期把动作放在子路径（`…/read`）时，同样的请求返回的是纯文本 `not found`，
  因为 Connection 的路由表按精确路径查表。

写入路径后来在真实实例上跑通了（真的 `dsh web` + 真的会话 + 真的工作区）：

- `POST /api/plugins/dsh-file-editor` 用真实 `sessionId` 建出 `…\dsh_playground\.dsh-editor-selftest.txt`，
  返回 `{"absolutePath":…,"version":…,"bytes":18}`，磁盘上的内容一致。
- 浏览器里打开 `dsh-file-editor/README.md`：自动以编辑器打开，59 行正文进入 CodeMirror，行号、语言标签 `md`、
  状态栏「已保存」都在；键入内容后状态变「未保存」、保存按钮解禁，`Ctrl+S` 后回到「已保存」，磁盘内容同步更新。
- 启动日志与浏览器控制台都没有报错，`web boot` 不再有任何条目失败。

路径穿越、符号链接（含祖先目录与尚不存在的目标）、只读、二进制、非法 UTF-8、尺寸上限、版本冲突与强制覆盖这些拒绝路径，
仍由上面的 Host 检查在真实临时目录上覆盖，跑的是同一份 `lib/host/`。

## 包结构

```
dsh-file-editor/
├─ package.json            # dsh.bundle.patch + dsh.client（platform: web）
├─ cordis.patch.yml        # 把这一层插进 profile
├─ .gitattributes          # 换行固定为 LF
├─ .gitignore              # node_modules、临时文件、client.js.map
├─ lib/                    # 构建产物（生成，勿手改）
├─ src/index.js            # Host 入口：只做接线（name / inject / apply）
├─ src/host/
│  ├─ protocol.js          # 路由路径、尺寸上限、错误码 → HTTP 状态
│  ├─ route.js             # 请求分发：校验 → 解析目标 → 执行动作
│  ├─ workspace-path.js    # 路径解析与工作区围栏（唯一的安全边界）
│  └─ text-file.js         # 文本读写、版本号、原子写入
├─ src/client/
│  ├─ index.js             # 注册渲染器元数据与 body
│  ├─ EditorBody.js        # 组件：接线 + 工具栏 + 提示条
│  ├─ use-code-editor.js   # CodeMirror 视图的生命周期
│  ├─ use-file-document.js # 一个文件的编辑状态机（读 / 存 / 脏 / 行尾）
│  ├─ editor-setup.js      # 基础扩展、四个 compartment、主题与样式钩子
│  ├─ editor-theme.js      # DSH 设计令牌 → CodeMirror 主题与 CSS
│  ├─ address.js           # dsh-resource:// 地址解析
│  ├─ host-route.js        # 浏览器端调用 Host 路由
│  ├─ line-endings.js      # LF / CRLF 识别与切换
│  ├─ languages.js         # 后缀 → 语法高亮
│  └─ copy.js              # 中英文案
├─ scripts/
│  ├─ build.mjs            # src/ → lib/
│  ├─ verify.mjs           # 两半的行为测试
│  ├─ dom.mjs              # jsdom 挂载测试
│  └─ assert.mjs           # 两个测试脚本共用的断言与汇总
└─ Publish.md              # 安装与发布（npm / 插件市场）
```

## `lib/` 是构建产物

`lib/client.js` 那一坨不是手写的，是 `npm run build` 从 `src/client/` 打出来的。
每个产物文件第一行都写着：

```js
/* Generated from src/ by scripts/build.mjs — do not edit this file. */
```

改代码改 `src/`；`lib/` 手改会在下一次构建时被覆盖。

**为什么必须是一个 1.5 MB 的文件。** 浏览器那一半不是普通 ESM 包。DSH 的客户端模块系统要求
`client.js` 是**自包含的 CJS 工厂**，形如：

```js
window.__ModuleLoader__.load({ id: 'dsh-file-editor', factory: (require) => { … } })
```

`require` 只认平台模块表（`react`、`react-dom`、`@deepseek-ai/cordis`、`ui-primitives` 等）和包内
`require.async` 的相对 chunk；而相对 chunk 的 URL 由模块系统按包路径推导，第三方插件没法保证它会被服务到。
所以 CodeMirror 与全部语法包都静态打进来，没有按需分块。

**里面装了什么。**

| 部分 | 体积占比 |
|---|---|
| CodeMirror 6 核心（view / state / commands / search / autocomplete / language） | 主体 |
| 10 个 `@codemirror/lang-*` 语法包及其 Lezer 语法 | 较大 |
| 40 余个 `@codemirror/legacy-modes` 流式解析器 | 零碎但累加 |
| 本插件自己的代码（`src/client/`） | 约 40 KB |

| 形态 | 大小 |
|---|---|
| `lib/client.js` 未压缩（默认，方便读） | 1 542 KiB |
| `npm run build -- --minify` | 867 KiB |
| 这个文件 gzip 之后（浏览器实际传输量级） | 408 KiB |
| 发布出去的 tarball（`lib/**/*.map` 不进包） | 432 KB |

它在**第一次用到「编辑器」渲染器时**才被下载，之后由模块系统缓存；不影响 DSH 启动。

## 开发

```powershell
cd S:\local\share\repos\dsh-plugins\dsh-file-editor
npm install                    # 首次：装语法包与 esbuild
npm run build                  # 重新产出 lib/（含 banner）
npm run build -- --minify      # 想要小一点的产物
npm run build:client           # 只重打浏览器那一半，不动 lib/index.js
npm run verify                 # 跑上面那 133 项检查
```

### 版本控制

仓库用 git 管理（每个插件一个仓库，换行固定为 LF，见工作区的 `.gitattributes`）：

- `.gitignore` 排除 `node_modules/`、`*.tmp` 与 `lib/client.js.map`（map 比 bundle 还大，装插件的人用不到）。
- `lib/` 里除 map 之外的产物**随仓库提交**：包就是这样安装的，克隆后不构建也能用。改 `src/` 之后仍然必须
  `npm run build` 并一起提交，否则仓库里的产物与源码不一致。
- 提交信息用 `feat:` / `fix:` / `docs:` / `chore:` 前缀，一类改动一次提交；`lib/` 重建与 `src/` 改动放在同一次提交里。

工具链（`devDependencies`，都是当前正式版）：

| 用途 | 版本 |
|---|---|
| 打浏览器那一半 | esbuild 0.28 |
| 挂载测试的 DOM | jsdom 31（要求 Node 22.22+ / 24.15+ / 26+，`engines` 里写死了同一条） |
| 编辑器与语法 | CodeMirror 6（`view` 6.43 / `state` 6.7 / `language` 6.13） |
| 测试时真挂组件 | React 18.3 —— 和 DSH 客户端同一个大版本，生产里它是外部模块，不进 bundle |

`npm install --ignore-scripts` 也能用：构建脚本直接调 `node_modules/@esbuild/<platform>/esbuild.exe`，
不依赖 esbuild 的 postinstall。`.npmrc` 里开了 `engine-strict=true`——Node 太旧时是**装不上**，
而不是装完在 jsdom 那里报一句看不懂的错。

改完 `lib/` 之后，DSH 的客户端 HMR 会按文件修订号重新加载该插件；没有 watcher 时刷新页面即可。
manifest（`package.json` 的 exports、`dsh.client`）或 `cordis.patch.yml` 改动需要重启 DSH。

## 已知边界

- 只能在**会话工作区内**读写。这是安全边界，不是可配置项。
- 只处理 UTF-8 文本，上限 12 MiB。
- 保存保留原文件的权限位（POSIX mode，Windows 上是只读属性）；**Windows 的显式 ACL 不保留**——rename 上去的是新文件，它继承目录的默认 ACL。需要对某个文件单独设权限时，别指望编辑器保存后还在。
- 编辑器不注册任何面向模型的能力：没有工具、没有提示词段落、不写会话事件。你在里面改的东西不会进入模型上下文，除非你自己让模型去读它。
- 写入用的是当前会话的工作区根，所以同一个文件在不同会话里打开是两件不同的事。
