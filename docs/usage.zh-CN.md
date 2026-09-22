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
5. 访问 Dashboard 前，使用 loopback remote-debugging endpoint 启动官方
   Chrome 和仓库外的专用 Profile。需要 GUI 权限时自行请求授权，不要让我执行
   启动命令；只让我在打开的窗口中登录 Google。当前环境无法启动 GUI 时，说明
   限制并提供准确的备用命令。随后运行 inspect 和 plan，展示目标及全部改动，
   经我明确确认该计划后才能执行 sync-draft。
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

Agent 可以从 manifest 获取事实并整理文件；如果仓库证据无法确认产品行为、数据用途、法律认证或权限用途，就必须询问。专用 Chrome 会话由 Agent 启动，你只需在打开的窗口中登录 Google。每次 Dashboard 写入都绑定到你批准的确切计划。

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

访问浏览器前先校验：

```bash
dashbye validate
```

按照下一节连接 Chrome 后，在仓库外选择一个已存在的私有目录保存诊断文件：

```bash
dashbye doctor --json
dashbye inspect --output /path/to/private-output/current-draft.json
dashbye plan --output /path/to/private-output/draft-plan.json
```

检查目标及每一项新增、更新、排序、替换和删除。执行已审核计划时，使用其确切的 `approvalHash`：

```bash
dashbye sync-draft \
  --plan /path/to/private-output/draft-plan.json \
  --approve-plan APPROVED_PLAN_HASH \
  --non-interactive
```

目标、构建产物、资源或远端草稿发生变化后，DashBye 会拒绝旧计划。成功执行会保存草稿、回读确认剩余操作为零，并生成版本 lock。

## 从源码安装

在扩展仓库之外克隆 DashBye：

```bash
git clone https://github.com/HiAriesZhou/DashBye.git
cd DashBye
npm ci
node dist/src/cli.js -h
```

`npm ci` 会通过 prepare 脚本构建 CLI。后续在扩展仓库中操作，将 `dashbye` 替换为 `node /绝对路径/DashBye/dist/src/cli.js`。

## 连接 Chrome

使用官方 Chrome，将专用 Profile 放在所有仓库之外。Profile 保存 Chrome 设置和登录会话，不是 DashBye 账号；请与日常浏览器分开。

macOS 启动命令：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$HOME/Library/Application Support/DashBye/chrome-profile" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9333 \
  https://chromewebstore.google.com/devconsole
```

Windows 或 Linux 使用本机安装的官方 Chrome 可执行文件，带上相同的 remote-debugging 参数和专用的绝对 Profile 路径。可执行文件位置取决于安装方式。配置 endpoint 必须匹配端口，例如 `http://127.0.0.1:9333`；DashBye 只接受 loopback 地址。

人工登录后，在扩展仓库执行 `dashbye doctor --json`，检查 `browser.connected` 和所有报告的问题。

- 连接失败：检查 Chrome 进程、调试端口和配置的 endpoint。
- 登录过期：重新人工登录。
- 同一条目打开多个编辑页：只保留一个。
- 语言选择错误：使用完整的 Dashboard 语言标签。多语言操作尚未验证。

DashBye 会复用匹配的编辑页，或在专用会话中进入配置的条目。它不会启动 Chrome、自动登录或导出 Cookie。无头会话复用尚未验证。

## 配置与后续版本

通常每个扩展只初始化一次。后续命令自动查找最近的 `dashbye.config.yml`，显式 CLI 参数优先。YAML 路径相对于其配置文件或资源目录解析，CLI 路径相对于当前工作目录解析。

浏览器 Profile、读取结果、计划、真实条目截图和其他诊断文件放在仓库之外。版本 lock 保存在配置的资源目录中。

每次更新：重新构建扩展、更新资源、校验、生成计划、审核批准，然后同步。构建包、资源或 Dashboard 草稿变化后，要重新生成计划，不得复用旧 approval hash。

DashBye 没有后端或遥测。外部 Agent 如何处理文件及对话内容，另由该 Agent 的权限和数据政策决定。

## 更多参考

完整命令与参数见 `dashbye -h`。另见[验证记录](validation.md)、[安全边界](security.md)和[架构](architecture.md)。
