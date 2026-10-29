# DashBye 使用指南

[返回 README](../README.zh-CN.md) · [English](usage.md)

DashBye 以编码 Agent 为主要使用方式。Agent 负责检查仓库和重复的 CLI 操作；你负责补充产品事实、人工登录、提供商店 API 密钥，并批准确切的计划。

## Agent 配置

在能够访问本地文件和终端的 Agent 中打开扩展仓库，然后粘贴：

```text
为当前会话的扩展仓库安装并配置 DashBye。
源码：https://github.com/HiAriesZhou/DashBye

1. 阅读 AGENTS.md，检查 git status，保留无关改动。检查 Node.js 22+ 和 Git，
   不使用 sudo，安装：
   npm install --global dashbye
   若无法全局安装，在扩展仓库之外 clone，运行 npm ci；之后用
   node /绝对路径/DashBye/dist/src/cli.js 代替 dashbye。
2. 阅读 dashbye -h 及源码中的 docs/store-schema.md，运行：
   dashbye init --agent --json --project <扩展仓库绝对路径>
   已知信息直接传参。返回 needs_input 时，通过普通对话一次询问一个问题，
   把回答用该问题给出的参数（flag）传回。第一个问题是要管理哪些商店：
   默认只管 Chrome Web Store；Firefox 附加组件商店和 Edge 加载项商店是可选的，
   把检测到的依据给我看，我选了才添加。带上累积参数继续调用。
3. 返回 existing_config 时推荐复用；只有我选择后，才修改商店或重新配置。
   返回 ready 时展示预览，经我确认后，将 writeCommand 作为参数数组执行。
   使用本地 CLI 时替换其中的可执行入口。
4. 审计实际构建产物及已有素材，将完整文案、图片和隐私状态整理在当前扩展的
   资源目录。不得编造权限用途、数据收集声明或认证。运行 validate；
   初始化模板只是占位内容，不是可发布声明。
5. 运行 plan 时加上 --json。需要访问 Dashboard 时，DashBye 会自己打开专用的
   Chrome；只让我在那个窗口里登录 Google，登录后再运行一次 plan。当前环境打不开
   图形界面时，说明原因，并让我运行 "dashbye doctor --login"。Firefox 和 Edge
   用 API 密钥：请我来配置，不得读取、打印、复制或提交密钥。把目标条目和全部
   改动列给我看，提醒 Firefox 商店页的修改保存后立即生效，经我明确同意后，
   才能执行 sync-draft --approve-plan <approvalHash>。
6. 保存后必须回读，确认剩余操作为零。不得提交审核或发布，也不得运行
   dashbye submit：Firefox 版本一旦进入 AMO 审核就无法撤回。
   汇报文件改动、验证结果和未解决问题。
```

安装 DashBye 后，可以生成带有已知参数的交接提示词：

```bash
dashbye init --prompt \
  --project /path/to/extension \
  --artifact dist/release.zip
```

### Agent 协议如何工作

`init --agent --json` 会返回三种状态之一：

- `needs_input`：Agent 向你询问一个缺失信息，带上累积参数重试。每个问题都注明对应参数；第一个问题是要管理哪些商店。
- `ready`：Agent 展示预览，确认后执行参数数组形式的 `writeCommand`。
- `existing_config`：Agent 推荐复用已有配置，除非你选择修改商店（`--stores`）或重新配置（`--overwrite`）。

这是文本协议，不依赖图形控件。无法访问本地文件和终端的聊天只能提供指导。

Agent 可以从 manifest 获取事实并整理文件；如果仓库证据无法确认产品行为、数据用途、法律认证或权限用途，就必须询问。专用 Chrome 由 DashBye 打开，你只需在那个窗口里登录 Google。Firefox 和 Edge 使用你在仓库之外配置的 API 密钥。每次商店写入都绑定到你批准的确切计划。

## 手动 CLI 流程

需要 Node.js 22+ 和 Git。默认的 Chrome Web Store 需要官方 Chrome 和已有的条目。Firefox 附加组件商店和 Edge 加载项商店是可选的，各自需要已有的条目和 API 密钥（见 [Firefox Add-ons](store-schema.md#firefox-add-ons) 和 [Microsoft Edge Add-ons](store-schema.md#microsoft-edge-add-ons)）。

安装后，在扩展仓库中初始化：

```bash
npm install --global dashbye
cd /path/to/extension
dashbye init
```

向导收集项目、构建产物、资源目录、完整条目 ID、Dashboard 语言和 loopback Chrome endpoint。核对预览后再写入。

用完整期望文案和隐私状态补全生成的发布模板。空列表和 `null` 可能表示删除，想保留的内容也要全部列出。字段说明见[资源 schema](store-schema.md)。

先校验，再生成计划：

```bash
dashbye validate
dashbye plan
```

专用 Chrome 没在运行时，`plan` 会自动打开它（见[Chrome 与登录](#chrome-与登录)），然后读取草稿，列出目标条目和每一项新增、更新、排序、替换和删除。计划会保存在仓库之外，位置见[文件保存位置](#文件保存位置)。

审阅无误后执行：

```bash
dashbye sync-draft
```

`sync-draft` 会重新读取草稿，再列一遍计划，然后询问 `Save these changes to the Dashboard draft? [Y/n]`。直接回车即保存，输入 `n` 取消。目标、构建产物、资源或线上草稿有变化时，DashBye 会拒绝执行旧计划。执行成功会保存草稿、回读确认剩余操作为零，并写入版本锁文件。

商品处于审核中（Pending review）时，Dashboard 会把所有草稿字段设为只读。`plan` 仍会读取草稿并列出差异，同时提示 `Blocked: item is in review; drafts cannot be edited until review completes`，并在 JSON 计划的 `blocking` 中记录原因。`sync-draft` 会在打开 Chrome 之前拒绝这样的计划；如果写入前商品进入审核，也会拒绝写入。审核结束后重新运行 `plan` 即可。

在终端里，各命令输出便于阅读的摘要；需要 JSON 时加 `--json`。脚本和 Agent 的输出不是终端，会得到 JSON，批准时必须使用 `--approve-plan <approvalHash>`。想看某个命令的参数，运行 `dashbye <命令> -h`；写错的参数会直接报错。

## 从源码安装

在扩展仓库之外克隆 DashBye：

```bash
git clone https://github.com/HiAriesZhou/DashBye.git
cd DashBye
npm ci
node dist/src/cli.js -h
```

`npm ci` 会通过 prepare 脚本构建 CLI。后续在扩展仓库中操作，将 `dashbye` 替换为 `node /绝对路径/DashBye/dist/src/cli.js`。

## 选择商店

默认只管理 Chrome Web Store；Firefox 附加组件商店和 Microsoft Edge 加载项商店是可选的。`dashbye init` 会在仓库里查找扩展包（`*.zip`、`*.xpi`、`dist/<浏览器>/`、`web-ext-artifacts/`、WXT 的 `.output/`）、`package.json` 里的打包脚本，以及 README 里的商店链接，然后问你要管理哪些商店。默认答案是 `chrome`；Firefox 和 Edge 会连同找到的依据一起列出，但只有你选了（例如输入 `chrome,firefox`）才会添加。只有你选中的商店会写进 `dashbye.config.yml` 的 `targets`，也只有它们会被校验、生成计划和同步。

以后想增减商店，可以运行 `dashbye init --stores chrome,firefox`（或运行 `dashbye init` 并选择 **change stores**），也可以直接改 `targets`。`--stores` 是完整列表：要列出所有要管理的商店，包括已经配置的。列出的已配置商店保持不变，没列出的会被移除，只会询问新加的商店。不在终端里运行时，还要一并传入新商店的参数，例如 `--firefox-artifact` 和 `--firefox-addon`；缺哪个参数，命令会直接指出。`validate`、`plan`、`sync-draft` 加上 `--store chrome` 这样的参数，可以只处理其中一部分。`validate` 发现仓库里有某个商店的包、但这个商店没配置时，会给出提示。

Chrome Web Store：保存草稿并回读核对。Edge：通过 Edge Add-ons API 把扩展包上传到产品的草稿提交；商店信息和发布仍在 Partner Center 完成（见 [Microsoft Edge Add-ons](store-schema.md#microsoft-edge-add-ons)）。Firefox 附加组件（AMO）没有草稿：在 AMO 审核通过这个版本之前，`sync-draft` 只上传扩展包供 AMO 验证；审核通过后，它会更新 AMO API 允许修改的商店字段（见 [Firefox Add-ons](store-schema.md#firefox-add-ons)）。

## 一次完成发布

日常发版只需运行 `dashbye release`。它会校验、为每个商店生成计划并预览文字变化，询问一次是否保存草稿；如果有新的 Firefox 版本，再单独询问一次是否提交（默认否，因为提交后无法撤回）。执行后会回读核对，并列出还需要你在商店后台完成的步骤。不在终端里运行时，它只输出计划和 `--approve-plan` / `--approve-submit` 两个审批哈希，不写入任何内容。`validate`、`plan`、`sync-draft` 和 `submit` 可以把同样的步骤拆开执行。

## 提交 Firefox 版本

AMO 没有草稿：创建 listed 版本就会进入审核队列，并且无法撤回。只有 `dashbye release`（新的 Firefox 版本）和 `dashbye submit` 会这样做。计划绑定了扩展包、源码包（`targets.firefox.source`）、版本说明（`store/releases/<版本>.notes.md`）、给审核员的说明（`stores.firefox.reviewerNotes`）以及 AMO 当前状态；AMO 已有这个版本、版本不够新、缺少版本说明或没有 AMO API 密钥时，计划会被拦下。提交后会读回核对；如果版本已经创建但后续步骤失败，结果为 `submitted_incomplete`，不会重试，请到 AMO 开发者中心补全，不要再次提交。AMO 审核通过后，再运行一次 `dashbye release` 即可同步商店信息。

## Chrome 与登录

`plan`、`sync-draft` 和 `release` 发现调试端口没有响应时，会用 DashBye 专用的 Profile 和配置里的本机回环端口打开官方 Chrome。想提前登录，可以运行 `dashbye doctor --login` 手动打开。加上 `--no-launch` 则不自动打开，只使用已经在运行的会话。

这个 Profile 只保存 Chrome 设置和登录状态，不是 DashBye 账号，也和你日常用的浏览器完全分开。Google 登录需要你在打开的窗口里自己完成。在终端里，DashBye 会等你登录（最长约十分钟），登录后自动继续；不在终端里运行时，它会停下来，提示你登录后重新运行。

DashBye 会在 Chrome 的标准安装位置查找。如果你装在别处，把 `DASHBYE_CHROME` 设为 Chrome 可执行文件的绝对路径。配置里的端点必须是本机回环地址，例如 `http://127.0.0.1:9333`。

运行 `dashbye doctor` 可以检查配置和 Chrome 连接。

- Chrome 打开后调试端口仍没有响应：可能已经有一个使用 DashBye Profile、但没开调试端口的窗口。退出那个 Chrome 后重试。
- DashBye Chrome 仍在运行、但所有窗口都关了（macOS 上常见）：调试端口有响应，却无法使用。DashBye 会在其中打开一个 Dashboard 窗口；加了 `--no-launch` 时它会停下，提示你运行 `dashbye doctor --login` 或新建窗口（Cmd+N / Ctrl+N）。`doctor` 会显示为“running without an open window”。
- 登录过期：在 DashBye 的 Chrome 窗口里重新登录。
- 同一条目的重复编辑页可以保留；DashBye 会使用自己的工作标签页。不同发布者或浏览器账户上下文仍需明确。
- 语言选择错误：使用完整的 Dashboard 语言标签。多语言操作尚未验证。

DashBye 为配置的条目建立一个工作标签页，并在后续命令中复用它，保留已有编辑页及其未保存内容。工作页标记会在同源导航和刷新后保留；跨域登录清除标记后，DashBye 可能建立一个替代工作页。等待登录期间，重复运行命令不会继续开新标签页。DashBye 不会自动登录、读取 Profile 数据或导出 Cookie。不支持无头模式的 Chrome，请使用可见的专用 Chrome。

## 文件保存位置

计划、读取结果和 Chrome Profile 都保存在系统为当前用户准备的应用目录里，不会进入任何仓库：

| 系统 | 目录 |
| --- | --- |
| macOS | `~/Library/Application Support/DashBye` |
| Windows | `%LOCALAPPDATA%\DashBye` |
| Linux 等 | `$XDG_STATE_HOME/dashbye`（默认 `~/.local/state/dashbye`） |

Chrome Profile 在 `chrome-profile/` 下；每个项目最近一次的 `plan.json`、`plan` 读到的 Chrome 草稿状态 `inspect.json` 在 `projects/<hash>/` 下，目录名是配置文件路径的哈希。需要另存一份时，用 `--output` 指定位置。

## 配置与后续版本

通常每个扩展只初始化一次。后续命令自动查找最近的 `dashbye.config.yml`，显式 CLI 参数优先。YAML 路径相对于其配置文件或资源目录解析，CLI 路径相对于当前工作目录解析。

真实条目的截图和其他诊断文件请放在仓库之外；DashBye 自己的计划、读取结果和 Chrome Profile 本来就不在仓库里。版本 lock 保存在配置的资源目录中。

每次更新：重新构建扩展、更新资源，然后运行 `dashbye release`。在 `dashbye.config.yml` 里把安装包写成带 `{version}` 的文件名，就不用每次改配置。

**Save draft** 没有返回完成状态时，DashBye 会读回草稿，只重试一次剩余的改动，前提是这些改动全部在已批准的计划内；否则会停下，请你重新生成计划。

### 代理

有没有代理都能使用。DashBye 连接专用 Chrome 走的是本机回环地址，因此即使设置了 `HTTP_PROXY` / `HTTPS_PROXY` 也始终直连；Chrome 自己按系统代理设置访问商店后台。访问商店 API（AMO、Edge）时：设置了 `HTTPS_PROXY` / `HTTP_PROXY` 就走代理，代理连不上时自动改为直连；没有代理或域名在 `NO_PROXY` 里时直连。写操作（上传包、提交版本、修改商店信息）只有在确定没有发到商店时才会改为直连重发；如果请求已经发出后连接才断开，DashBye 会报告失败，不会重复发送。重试前请先重新运行 `dashbye plan`。仅支持 HTTP(S) 代理，不使用 SOCKS 代理。

### 在另一块屏幕上运行（可选）

在 `browser.display` 里填写显示器名字（例如第二台显示器，或 [yomado](https://github.com/chekusu/yomado) 这类工具创建的虚拟屏），DashBye 会把它自己的 Chrome 窗口移到那块屏上（仅限 macOS）；其他 Chrome 窗口不受影响。名字可以写一部分，但必须只匹配到一块显示器；找不到时窗口留在原处并给出提示。DashBye 不依赖 yomado 或其他任何工具。构建包、资源或 Dashboard 草稿变化后，要重新生成计划，不得复用旧 approval hash。

DashBye 没有后端或遥测。外部 Agent 如何处理文件及对话内容，另由该 Agent 的权限和数据政策决定。

## 更多参考

完整命令与参数见 `dashbye -h`。另见[验证记录](validation.md)、[安全边界](security.md)和[架构](architecture.md)。
