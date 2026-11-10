# 安装与发布

功能怎么用、代码怎么改，看 [README.md](README.md)。

## 包清单

`npm pack --dry-run` 的产物（10 个文件，约 437 KB）：

```
LICENSE                  1.1kB
README.md               19.5kB
cordis.patch.yml         365B
lib/client.js            1.6MB
lib/host/protocol.js     3.4kB
lib/host/route.js        2.0kB
lib/host/text-file.js    7.7kB
lib/host/workspace-path.js 6.1kB
lib/index.js             1.7kB
package.json             2.3kB
```

`src/`、`scripts/`、`node_modules/` 不进包。`lib/client.js.map` 也不进：它比 bundle 本身还大（3.0 MB vs 1.6 MB），装插件的人用不到——浏览器按 `plugins/??dsh-sidebar-editor/client.js&rev=…` 加载，没有地方去取这份 map。

## 元数据

| 项 | 值 |
|---|---|
| `private` | 已移除，可以发布 |
| `license` + `LICENSE` | MIT |
| `repository` / `homepage` | `github.com/hm-dsh-plugins/dsh-sidebar-editor` |
| `keywords` | `dsh` / `dsh-plugin` / `deepseek-harness` / `codemirror` / `editor` / `sidebar` |
| `engines.dsh` | `>=0.2.0 <0.3.0` |
| `engines.node` | `^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` |
| `prepack` | `npm run build`，打包前重建 `lib/` |
| `dsh.manifestVersion` | `1` |

`engines.dsh` 由 DSH 的安装与启动检查求值，用的是 `semver.satisfies(..., { includePrerelease: true })`，所以 `0.2.2-rc.1` 满足 `>=0.2.0 <0.3.0`。写了 `engines.dsh` 之后，兼容性只由它决定，不再回退到 `@deepseek-ai/dsh*` 的 peer 范围。

## 安装的几种形式

`dsh plugin --profile web <args>` 是 **pnpm 的透传**（`--help` 打出来就是 pnpm 的帮助），所以 `add` 接受 pnpm 能接受的一切：

| 传什么 | 得到什么 | 什么时候用 |
|---|---|---|
| 本地目录路径 | `link:` | 自己开发 |
| `file:./dsh-sidebar-editor` | 拷贝一份，之后改仓库不影响已装的 | 想固定住某个版本 |
| `./dsh-sidebar-editor-0.1.0.tgz` | 装 `npm pack` 的产物 | 内部传阅，不走 registry |
| `github:hm-dsh-plugins/dsh-sidebar-editor` | 从 GitHub 拉 | 还没发 npm、但想让别人试 |
| `dsh-sidebar-editor` | 从 npm 拉 | 正式分发 |

后两种才是别人能用的。想在市场里被搜到，见下面第二节。

## 一、发布到 npm

`dsh-sidebar-editor` 这个名字在 npm 上是空的（`npm view dsh-sidebar-editor` 返回 404），可以直接用。

发布前确认产物是最新的：

```powershell
npm run verify
npm pack --dry-run
```

`prepack` 会自动跑 `npm run build`，所以 tarball 里的 `lib/` 一定来自当前 `src/`。

```powershell
npm publish
```

包名不带 scope 就是 `dsh-sidebar-editor`；如果改用 scope（`@你/dsh-sidebar-editor`），首次发布要加 `--access public`。

> 发出去就收不回来了：`npm unpublish` 有 72 小时窗口，而且**版本号不重用**，撤回也占着那个号。所以先在 `npm pack --dry-run` 上确认清楚。

## 二、进目录（dsh-market 里能被搜到）

dsh-market 里的插件列表不是它自己维护的，而是每次打开时实时读 [awesome-dsh-plugin.com/plugins.json](https://awesome-dsh-plugin.com/plugins.json)。那个目录的源头是 GitHub 仓库 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)。

**做法就是向那个仓库提一个 PR，加一条。** market 自己仓库的 README 特意写明：别把插件条目 PR 到 market 那个 repo。

条目长这样（字段取自目录里真实的一条）：

```json
{
  "name": "dsh-sidebar-editor",
  "owner": "HiroMuraki",
  "url": "https://github.com/hm-dsh-plugins/dsh-sidebar-editor",
  "category": "ui",
  "description": {
    "en": "Editable CodeMirror renderer for the Sidebar's document preview: open a text file and edit it like a notepad, with an LF/CRLF control.",
    "zh": "在侧边栏的文档预览里用 CodeMirror 直接编辑文本文件，并提供一个 LF/CRLF 行尾切换。"
  },
  "npm": "dsh-sidebar-editor"
}
```

`version`、`stars`、`downloads`、`install`、`capabilities`、`added` 这些**不用你写**，是它 CI 扫出来的。`install` 会自动生成成：

```
dsh plugin --profile web add dsh-sidebar-editor
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

1. 发 npm
2. 去 awesome-dsh-plugin 提 PR
3. 等一天左右，站点和 app 内的市场都会自动出现

在那之前别人也不是装不了，只是 market 里搜不到（它只允许装目录里列出来的源），得显式敲 `dsh plugin --profile web add dsh-sidebar-editor`。

## 没验证的部分

- **没有 GitHub 仓库能否入目录**。目录条目的字段结构强烈指向"不行"，但没有找到明确写着这一条的说明。
