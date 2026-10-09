# DashBye 使用指南

[返回 README](../README.zh-CN.md) · [English](usage.md)

DashBye 以编码 Agent 为主要使用方式。Agent 负责检查仓库和重复的 CLI 操作；你负责补充产品事实、人工登录，并批准确切的草稿计划。

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
   已知信息直接传参。返回 needs_input 时，通过普通对话一次询问一个问题。
   itemId 对应 --item-id，其余字段对应 --project、--artifact、--resources、
   --language、--endpoint。带上累积参数继续调用。
3. 返回 existing_config 时推荐复用，只有我选择后才重新配置。
   返回 ready 时展示预览，经我确认后，将 writeCommand 作为参数数组执行。
   使用本地 CLI 时替换其中的可执行入口。
4. 审计实际构建产物及已有素材，将完整文案、图片和隐私状态整理在当前扩展的
   资源目录。不得编造权限用途、数据收集声明或认证。运行 validate；
   初始化模板只是占位内容，不是可发布声明。
5. 运行 plan 时加上 --json。需要访问 Dashboard 时，DashBye 会自己打开专用的
   Chrome；只让我在那个窗口里登录 Google，登录后再运行一次 plan。当前环境打不开
   图形界面时，说明原因，并让我运行 "dashbye chrome"。把目标条目和全部改动列给
   我看，经我明确同意后，才能执行 sync-draft --approve-plan <approvalHash>。
6. 保存后必须回读，确认剩余操作为零。不得提交审核或发布。
   汇报文件改动、验证结果和未解决问题。
```

安装 DashBye 后，可以生成带有已知参数的交接提示词：

```bash
dashbye agent-prompt \
  --project /path/to/extension \
  --artifact dist/release.zip
```

### Agent 协议如何工作

`init --agent --json` 会返回三种状态之一：

- `needs_input`：Agent 向你询问一个缺失信息，带上累积参数重试。
- `ready`：Agent 展示预览，确认后执行参数数组形式的 `writeCommand`。
- `existing_config`：Agent 推荐复用已有配置，除非你明确选择重新配置。

这是文本协议，不依赖图形控件。无法访问本地文件和终端的聊天只能提供指导。

Agent 可以从 manifest 获取事实并整理文件；如果仓库证据无法确认产品行为、数据用途、法律认证或权限用途，就必须询问。专用 Chrome 由 DashBye 打开，你只需在那个窗口里登录 Google。每次 Dashboard 写入都绑定到你批准的确切计划。

## 手动 CLI 流程

需要 Node.js 22+、Git、官方 Chrome，以及已有的 Chrome Web Store 条目。

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

## Chrome 与登录

`inspect`、`plan` 和 `sync-draft` 发现调试端口没有响应时，会用 DashBye 专用的 Profile 和配置里的本机回环端口打开官方 Chrome。想提前登录，可以运行 `dashbye chrome` 手动打开。加上 `--no-launch` 则不自动打开，只使用已经在运行的会话。

这个 Profile 只保存 Chrome 设置和登录状态，不是 DashBye 账号，也和你日常用的浏览器完全分开。Google 登录需要你在打开的窗口里自己完成。在终端里，DashBye 会等你登录（最长约十分钟），登录后自动继续；不在终端里运行时，它会停下来，提示你登录后重新运行。

DashBye 会在 Chrome 的标准安装位置查找。如果你装在别处，把 `DASHBYE_CHROME` 设为 Chrome 可执行文件的绝对路径。配置里的端点必须是本机回环地址，例如 `http://127.0.0.1:9333`。

运行 `dashbye doctor` 可以检查配置和 Chrome 连接。

- Chrome 打开后调试端口仍没有响应：可能已经有一个使用 DashBye Profile、但没开调试端口的窗口。退出那个 Chrome 后重试。
- 登录过期：在 DashBye 的 Chrome 窗口里重新登录。
- 同一条目的重复编辑页可以保留；DashBye 会使用自己的工作标签页。不同发布者或浏览器账户上下文仍需明确。
- 语言选择错误：使用完整的 Dashboard 语言标签。多语言操作尚未验证。

DashBye 为配置的条目建立一个工作标签页，并在后续命令中复用它，保留已有编辑页及其未保存内容。工作页标记会在同源导航和刷新后保留；跨域登录清除标记后，DashBye 可能建立一个替代工作页。等待登录期间，重复运行命令不会继续开新标签页。DashBye 不会自动登录、读取 Profile 数据或导出 Cookie。无头会话复用尚未验证。

## 文件保存位置

计划、读取结果和 Chrome Profile 都保存在系统为当前用户准备的应用目录里，不会进入任何仓库：

| 系统 | 目录 |
| --- | --- |
| macOS | `~/Library/Application Support/DashBye` |
| Windows | `%LOCALAPPDATA%\DashBye` |
| Linux 等 | `$XDG_STATE_HOME/dashbye`（默认 `~/.local/state/dashbye`） |

Chrome Profile 在 `chrome-profile/` 下；每个条目最近一次的 `plan.json` 和 `inspect.json` 在 `items/<hash>/` 下，目录名是条目 ID 的哈希。需要另存一份时，用 `--output` 指定位置。

## 配置与后续版本

通常每个扩展只初始化一次。后续命令自动查找最近的 `dashbye.config.yml`，显式 CLI 参数优先。YAML 路径相对于其配置文件或资源目录解析，CLI 路径相对于当前工作目录解析。

真实条目的截图和其他诊断文件请放在仓库之外；DashBye 自己的计划、读取结果和 Chrome Profile 本来就不在仓库里。版本 lock 保存在配置的资源目录中。

每次更新：重新构建扩展、更新资源，然后依次运行 validate、plan 和 sync-draft。构建包、资源或 Dashboard 草稿变化后，要重新生成计划，不得复用旧 approval hash。

DashBye 没有后端或遥测。外部 Agent 如何处理文件及对话内容，另由该 Agent 的权限和数据政策决定。

## 更多参考

完整命令与参数见 `dashbye -h`。另见[验证记录](validation.md)、[安全边界](security.md)和[架构](architecture.md)。
