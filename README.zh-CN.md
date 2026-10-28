<div align="center">

<img src="https://raw.githubusercontent.com/HiAriesZhou/DashBye/main/brand/dashbye-readme.png" alt="DashBye 的挥手壁虎" width="128">

<h1>DashBye</h1>

<p><strong>少填表，多发版。</strong></p>

<p>让编码 Agent 替你打理浏览器扩展的商店发布。<br>
扩展包、商店文案、截图、推广图和隐私声明都放进扩展仓库，跟代码一起做版本管理；DashBye 把它们与 Chrome Web Store、Firefox 附加组件商店和 Microsoft Edge 加载项商店逐项比对，你批准具体计划之前不写入任何内容。</p>

[![npm](https://img.shields.io/npm/v/dashbye?color=429C7E)](https://www.npmjs.com/package/dashbye) [![CI](https://github.com/HiAriesZhou/DashBye/actions/workflows/ci.yml/badge.svg)](https://github.com/HiAriesZhou/DashBye/actions/workflows/ci.yml) [![Node.js 22+](https://img.shields.io/badge/node-%3E%3D22-1D3043)](https://nodejs.org/) [![License: GPL-3.0-only](https://img.shields.io/badge/license-GPL--3.0--only-1D3043)](LICENSE)

[官网](https://dashbye.lol/zh/) · [English](README.md) · **简体中文** · [使用指南](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.zh-CN.md) · [示例](#示例)

</div>

---

## 解决的问题

- **代码更新了，商店截图还是上个版本的？** 素材跟着扩展一起做版本管理，发布前统一比对。
- **新加了权限，说明文字还是老一套？** 对照实际构建产物校验声明，趁还来得及就把遗漏找出来。
- **复制、粘贴、上传，下个版本从头再来？** 只需审一份确定的计划，不必再凭记忆把商店页面拼一遍。

## 工作流程

1. **扩展仓库**存放构建产物和商店素材。
2. **Agent 审计**真实的构建、manifest、文案、图片和隐私依据。
3. **DashBye 比对**它们与你管理的每个商店，合成一份变更计划。
4. **你批准**这份具体的计划。
5. **DashBye 写入**批准的改动，并回读核对。

DashBye 只在你的电脑上运行：通过专用 Chrome 会话访问 Chrome Web Store，通过官方 API 访问 Firefox 和 Edge 的商店，所需密钥放在仓库之外。不用注册账号，没有服务器，也不收集任何遥测数据。

## 支持的商店

| 商店 | DashBye 负责 | 仍由你完成 |
| --- | --- | --- |
| **Chrome Web Store** | 把扩展包、商店文案、图片和隐私声明保存到 Dashboard 草稿，并回读核对 | 登录 Google；提交审核与发布 |
| **Firefox 附加组件商店** | 校验扩展包；`dashbye submit` 按批准的计划创建上架版本；AMO 审核通过后，更新简介、描述、主页、支持邮箱和分类 | 在 AMO 开发者中心维护支持网址和截图 |
| **Microsoft Edge 加载项商店** | 把扩展包上传到产品的草稿提交 | 在 Partner Center 编辑商店页、提交审核与发布 |

> **重要**：Firefox 附加组件商店没有草稿。`dashbye submit` 创建的版本会进入 AMO 审核，无法撤回；商店页的修改也会立即生效。这两类操作，DashBye 只按你批准的计划执行。

## 交给 Agent 快速上手

打开扩展仓库，在能读写本地文件、能执行终端命令的编码 Agent 里粘贴：

```text
为这个扩展仓库配置 DashBye，并准备好商店发布（Chrome Web Store、Firefox
附加组件商店、Edge 加载项商店，只限我选择的商店）。
源码：https://github.com/HiAriesZhou/DashBye

安装 DashBye（不要用 sudo），先读 dashbye -h，再用 dashbye init --agent --json
完成当前仓库的配置。一切以真实的构建产物、manifest、现有商店文案、截图、推广图
和隐私依据为准。仓库里确认不了的事实直接问我；产品功能、权限用途、数据使用声明
和各项认证，一律不能编。

诊断文件都放在所有仓库之外。运行 validate 和 plan 时加上 --json；需要访问
Dashboard 时，DashBye 会自己打开专用的 Chrome。我只负责在那个窗口里登录 Google。
如果当前环境打不开图形界面，说明原因，并让我运行 "dashbye doctor --login"。
Firefox 和 Edge 用 API 密钥：请我来配置，你不要读取、打印、复制或提交密钥。
把目标条目和每一项改动都列给我看，并提醒 Firefox 商店页的修改保存后立即生效，
等我明确同意后再执行 sync-draft。

同步后必须回读，确认剩余差异为零。不要提交审核，也不要发布；不要运行
"dashbye submit"：Firefox 版本一旦进入 AMO 审核就无法撤回。最后告诉我改了哪些
文件、做了哪些检查、还有哪些问题没解决。
```

| Agent 负责 | 你负责 |
| --- | --- |
| 安装（或找到已装好的）CLI | 补充仓库里查不到的产品事实 |
| 初始化仓库 | 在 DashBye 打开的 Chrome 窗口里登录 Google |
| 整理发布素材并跑完校验 | 在 DashBye 写入草稿之前批准计划 |
| 交给你一份具体的变更计划 | 亲手提交审核与发布 |

希望提示词里直接带上项目路径？安装后运行：

```bash
dashbye init --prompt --project /path/to/extension
```

## 手动使用命令行

需要 **Node.js 22+**、Git，以及你要管理的每个商店里已经存在的条目。Chrome Web Store 还需要官方版 Chrome；Firefox 和 Edge 需要 API 密钥（见[素材结构说明](https://github.com/HiAriesZhou/DashBye/blob/main/docs/store-schema.md)）。

全局安装，然后在扩展仓库里初始化：

```bash
npm install --global dashbye
cd /path/to/extension
dashbye init
```

用真实的文案、图片和隐私声明填好生成的 `store/` 模板，然后运行发布：

```bash
dashbye release
```

`release` 会校验构建产物和素材，需要时自动打开 DashBye 专用的 Chrome 窗口，并为每个已配置的商店生成计划。第一次使用时在窗口里登录各商店后台（也可以提前运行 `dashbye doctor --login` 打开窗口），DashBye 会等你登录完再读取草稿。

- **保存**：列出每一项改动、预览文字变化，然后询问 `Save these changes to the Dashboard draft? [Y/n]`。
- **提交 Firefox**：如果有新的 Firefox 版本，因为 AMO 没有草稿，会再单独询问 `Submit Firefox … to AMO for review? [y/N]`。
- **完成**：各草稿已保存、回读后**剩余差异为零**，写入版本锁文件，并列出还需要你在商店后台完成的步骤。

`validate`、`plan`、`sync-draft` 和 `submit` 可以把同样的步骤拆开逐个执行。

想看某个命令有哪些参数，运行 `dashbye <命令> -h`。源码安装、素材目录结构、Chrome 设置和各种失败情况，见[使用指南](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.zh-CN.md)。

### 后续发版

更新构建产物和 `store/` 里的文件，再运行一次 `dashbye release`。在 `dashbye.config.yml` 里把安装包写成 `release/x-chrome-v{version}.zip` 这样的格式，DashBye 会自动选用最新的构建，发版时不用再改配置。专用 Chrome 会记住登录状态。

DashBye 会自动找到最近的 `dashbye.config.yml`，截图放在哪儿，说一次就够了。批准之后，只要构建产物、素材或线上草稿有任何变化，都要重新生成计划、重新审阅。

## 示例

一次针对某个扩展**英文商店页**的真实运行。开始前，扩展仓库已配置好 DashBye，维护者已在专用 Chrome 中登录 Google 账号。

<details>
<summary><strong>展开三个步骤</strong></summary>

<br>

**1. 告诉 Agent 你的需求**

对 Agent 说：“为这个扩展仓库配置 DashBye，并准备好 Chrome Web Store 草稿。”Agent 会检查构建产物和商店素材，再与线上现有的草稿逐项比对。

**2. 审阅并批准变更计划**

Agent 列出变更计划：目标是扩展的**英文商店页**，只有**一项改动：替换 440 × 280 的小型推广图**；扩展包、描述、截图和隐私声明都没有差异。Agent 说明替换会先删除旧图、再上传新图，然后等待确认。维护者回复“保存”，批准执行。

**3. 保存草稿并核对结果**

DashBye 保存草稿后会立即回读核对。这个例子里，第一次回读仍有差异，Agent 没有直接报告完成，而是重新运行 plan，确认已没有待执行的操作，再执行一次零操作同步：结果为 `saved_and_reread`，写入版本锁，新计划为 `operations: []`，即**剩余差异为零**。草稿只做保存，不会提交审核，也不会发布。

[案例说明](https://github.com/HiAriesZhou/DashBye/blob/main/docs/assets/demo/README.md)

</details>

## 需要你负责的事项

- 仓库里没有的产品事实、隐私声明和认证
- 手动登录各商店后台
- 每一次写入前的计划审批，以及每次 Firefox 提交前的单独确认
- 在 Chrome Web Store 后台提交审核、在 Partner Center 发布

> **注意**：期望状态里的空列表或 `null` 可能意味着删除，Agent 必须把这类操作单独列出来。DashBye 会拒绝已过期的计划，并用你批准时的期望状态核对保存结果。

## 在另一块屏幕上运行（可选）

DashBye 默认在你当前的屏幕上工作。如果不想让它的 Chrome 窗口占用你正在用的屏幕，可以在 `dashbye.config.yml` 里把 `browser.display` 设为另一块显示器的名字（例如第二台显示器），DashBye 只会把它自己的窗口移过去（仅限 macOS）。没有多余的显示器时，可以用虚拟屏，例如 [yomado](https://github.com/chekusu/yomado)，它能在 macOS 上创建带名字的虚拟显示器。DashBye 本身不依赖 yomado 或其他任何工具。

```yaml
browser:
  endpoint: http://127.0.0.1:9333
  display: DashBye   # 显示器或虚拟屏的名字；不填则留在当前屏幕
```

## 当前支持情况

这还是早期技术版本。已在真实商店条目上跑通的有：

- **Chrome Web Store**：扩展包上传、图片替换、部分隐私文案修改、草稿保存与回读。
- **Firefox 附加组件商店**：一次完整的 `dashbye submit`（从校验上传到版本回读），以及该版本通过 AMO 审核后的一次商店页更新。
- **Microsoft Edge 加载项商店**：一次上传扩展包到草稿提交。

尚未验证：多语言、数据类别与认证的变更、新增权限的确认。在 Windows 和 Linux 上，CI 只检查 DashBye 能找到并打开 Chrome，登录和 Dashboard 操作还没有验证。

按设计不支持：无头模式的 Chrome、Edge 的商店页字段（Edge 的 API 不提供），以及 Chrome 和 Edge 的提交审核与发布。

## 文档

| 文档 | 内容 |
| --- | --- |
| [使用指南](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.zh-CN.md) | 源码安装、素材目录结构、Chrome 设置、失败情况 |
| [素材结构说明](https://github.com/HiAriesZhou/DashBye/blob/main/docs/store-schema.md) | `dashbye.config.yml` 与 `store/` 素材目录结构 |
| [验证记录](https://github.com/HiAriesZhou/DashBye/blob/main/docs/validation.md) | 已在真实 Dashboard 上验证过的内容 |
| [安全边界](https://github.com/HiAriesZhou/DashBye/blob/main/docs/security.md) | 本地运行、loopback CDP 与写入边界 |
| [架构](https://github.com/HiAriesZhou/DashBye/blob/main/docs/architecture.md) | 本地意图如何变成经批准的写入 |

全部命令和参数，运行 `dashbye -h` 查看。

## 许可与品牌

代码以 [GPL-3.0-only](LICENSE) 发布，在遵守条款的前提下可以商用，适用范围见[许可说明](LICENSING.md)。早先以 MIT 发布的版本，仍按原许可使用。

DashBye 的名称、Logo 和吉祥物另有[品牌政策](TRADEMARK.md)和[素材条款](https://github.com/HiAriesZhou/DashBye/blob/main/brand/LICENSE)。fork 之后若作为独立产品推广，请换用自己的名称和形象。
