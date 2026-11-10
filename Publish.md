# 安装与发布

这份文档说的是**怎么把这个插件装到别人机器上**。功能怎么用、代码怎么改，看 [README.md](README.md)。

## 现在是什么状态

你本机 profile 里是这个：

```json
"dsh-file-editor": "link:S:/local/share/repos/dsh-plugins/dsh-file-editor"
```

`link:` 是 pnpm 的一种依赖协议，意思是**别去下载或拷贝包，直接把 `node_modules` 里这个名字指向那个目录**。落盘就是一条符号链接：

```
~/.dsh/profiles/web/node_modules/dsh-file-editor -> S:/local/share/repos/dsh-plugins/dsh-file-editor
```

两个后果：

- **改完不用重装**。仓库里 `lib/` 一变，刷新页面就生效——这就是这几轮改完只要 `npm run build` 的原因。
- **只在这台机器、这个路径下成立**。别人 clone 走你的仓库是装不上的，他的 profile 里没有这条链接。

它是开发期的接线方式，不是分发格式。配置文件里另一条 `"dshmarket": "1.66.21"` 才是分发该有的样子。

## 安装的几种形式

`dsh plugin --profile web <args>` 是 **pnpm 的透传**（`--help` 打出来就是 pnpm 的帮助），所以 `add` 接受 pnpm 能接受的一切：

| 传什么 | 得到什么 | 什么时候用 |
|---|---|---|
| 本地目录路径 | `link:` | 自己开发 |
| `file:./dsh-file-editor` | 拷贝一份，之后改仓库不影响已装的 | 想固定住某个版本 |
| `./dsh-file-editor-0.1.0.tgz` | 装 `npm pack` 的产物 | 内部传阅，不走 registry |
| `github:你/dsh-file-editor` | 从 GitHub 拉 | 还没发 npm、但想让别人试 |
| `dsh-file-editor` | 从 npm 拉 | 正式分发 |

后两种才是别人能用的。想在市场里被搜到，见下面第二节。

## 一、发布到 npm

`dsh-file-editor` 这个名字在 npm 上是空的（`npm view dsh-file-editor` 返回 404），可以直接用。

### 发布前必须处理的几处

| 项 | 现状 | 怎么做 |
|---|---|---|
| `"private": true` | **有** | 删掉。npm 会直接拒绝发布 private 包 |
| LICENSE 文件 | **没有**（`package.json` 写了 MIT） | 补一个 `LICENSE`。npm 会自动带上它，即使不在 `files` 里 |
| 构建钩子 | **没有** | 加 `"prepack": "npm run build"`。`files` 里列的是 `lib`，打包时 `lib/` 是什么就发什么，没有这道钩子就可能把一个过期的 `lib/` 发出去（更早的一版 `build:client` 还真会删掉 `lib/index.js`，现在它只重建浏览器那一半） |
| `repository` | 没有 | 补上，目录页和卡片要用 |
| `keywords` | 没有 | 补几个，搜索能沾光 |
| `engines.dsh` | 没有 | 可选，见文末"没验证的部分" |

改完先看一眼最终会发出去哪些文件：

```powershell
npm pack --dry-run
```

现在跑出来是这样（`private: true` 不拦 `npm pack`，只拦 `publish`）：

```
README.md               16.8kB
cordis.patch.yml         365B
lib/client.js            1.6MB
lib/host/protocol.js     3.3kB
lib/host/route.js        2.3kB
lib/host/text-file.js    4.6kB
lib/host/workspace-path.js 4.9kB
lib/index.js             1.7kB
package.json             2.0kB
```

`src/`、`scripts/`、`node_modules/` 都不在，符合预期。

`lib/client.js.map` 也不在：`files` 里用了一条排除规则

```jsonc
"files": ["lib", "!lib/**/*.map", "cordis.patch.yml", "README.md"]
```

它比 bundle 本身还大（3.0 MB vs 1.6 MB），而装插件的人用不上——插件是以
`plugins/??dsh-file-editor/client.js&rev=…` 这种 URL 被加载的，浏览器没有地方去取这份 map。
排掉之后 tarball 从 1.1 MB 降到 **432 KB**。

要让用户拿到更小的 bundle，可以在构建时加 `--minify`（1 542 KiB → 867 KiB，gzip 后约 301 KiB）。
本地开发默认不压缩，因为读 `lib/client.js` 时还需要看得懂；`prepack` 里要不要压缩，是发布时的取舍。

### 发布

```powershell
npm publish
```

包名不带 scope 就是 `dsh-file-editor`；如果改用 scope（`@你/dsh-file-editor`），首次发布要加 `--access public`。

> 发出去就收不回来了：`npm unpublish` 有 72 小时窗口，而且**版本号不重用**，撤回也占着那个号。所以先在 `npm pack --dry-run` 上确认清楚。

## 二、进目录（dsh-market 里能被搜到）

dsh-market 里的插件列表不是它自己维护的，而是每次打开时实时读 [awesome-dsh-plugin.com/plugins.json](https://awesome-dsh-plugin.com/plugins.json)。那个目录的源头是 GitHub 仓库 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。

**做法就是向那个仓库提一个 PR，加一条。** market 自己仓库的 README 特意写明：别把插件条目 PR 到 market 那个 repo。

条目长这样（字段取自目录里真实的一条）：

```json
{
  "name": "dsh-file-editor",
  "owner": "你的 GitHub 用户名",
  "url": "https://github.com/你/dsh-file-editor",
  "category": "ui",
  "description": {
    "en": "Editable CodeMirror renderer for the Sidebar's document preview: open a text file and edit it like a notepad, with an LF/CRLF control.",
    "zh": "在侧边栏的文档预览里用 CodeMirror 直接编辑文本文件，并提供一个 LF/CRLF 行尾切换。"
  },
  "npm": "dsh-file-editor"
}
```

`version`、`stars`、`downloads`、`install`、`capabilities`、`added` 这些**不用你写**，是它 CI 扫出来的。`install` 会自动生成成：

```
dsh plugin --profile web add dsh-file-editor
```

`category` 从下面 24 个里选一个（`en` 是官方标签）：

| | | | |
|---|---|---|---|
| `agi` AGI 架构探索 | `ui` UI 增强 | `usage` 用量与计费 | `theme` 主题与外观 |
| `model` 模型与供应商 | `identity` 身份与通信 | `session` 会话与消息 | `memory` 记忆 |
| `tools` 工具与能力 | `wsl` WSL 与 Windows 互操作 | `browser` 浏览器与网络 | `vision` 视觉与多模态 |
| `voice` 语音与音频 | `docs` 文档与渲染 | `skill` 技能 | `workflow` 工作流与自动化 |
| `git` Git 与代码审查 | `notify` 通知与集成 | `dev` 开发与运行时 | `security` 安全与权限 |
| `remote` 远程与移动端 | `market` 插件市场与管理 | `fun` 娱乐 | |

这个插件建议 `ui`（UI 增强）或 `docs`（文档与渲染）——它本质是给文档预览多加一个可编辑的渲染器。

**需要一个 GitHub 仓库。** 目录里每条都挂在 `owner` + `url` 上，纯 npm、没有源码仓库的插件没有位置。所以顺序是：

1. 代码推到 GitHub
2. 发 npm
3. 去 awesome-dsh-plugin 提 PR
4. 等一天左右，站点和 app 内的市场都会自动出现

在那之前别人也不是装不了，只是 market 里搜不到（它只允许装目录里列出来的源），得显式敲 `dsh plugin --profile web add dsh-file-editor`。

## 没验证的部分

写这份文档时查了实际数据（profile 配置、`dsh plugin --help`、npm registry、目录的 `plugins.json`、已安装的各插件包），下面两条没能确认，用之前自己核一下：

- **`engines.dsh`**。market 的 README 说卡片会读它（或 `@deepseek-ai/dsh-*` 的 lockstep peer）来做宿主版本匹配提示，但我在已装的包里没找到任何先例——`dshmarket` 自己连 `engines` 字段都没有。格式和是否真的在读，没验证。
- **没有 GitHub 仓库能否入目录**。目录条目的字段结构强烈指向"不行"，但我没有找到明确写着这一条的说明。
