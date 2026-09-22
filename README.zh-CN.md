# DashBye

[English](README.md) · [简体中文](README.zh-CN.md)

*少填表，多发布。*

<img src="brand/dashbye-logo.png" alt="DashBye 挥手壁虎标志" width="240">

DashBye 是一个完全在你电脑上运行的 Chrome Web Store 草稿管理 CLI。
把扩展包、商店文案、截图、
推广图和隐私声明保存在扩展仓库中，随版本一起维护。

它帮助你避免“本地已有新图片，Dashboard 还是旧图”、权限变更后说明过期，
以及手工填表时遗漏字段。先比对本地期望状态与远端草稿，确认具体改动，
再保存并回读核对。**自动化止于 Save draft，提交审核和发布由你操作。**

## 资源始终由你掌控

- **资源在本地，批准后直达商店草稿。** DashBye 从你指定的本地目录读取资源，
  通过本机 Chrome 直接将已批准的改动上传到 Google 的 Chrome Web Store Dashboard。
  DashBye 是纯本地 CLI，没有服务器，也不托管你的资源。
- **无需 DashBye 账号，没有遥测。** 配置、计划和版本 lock 保存在本机。
  DashBye 没有后端、使用分析或资源同步服务，也不会将资源公开或推送到 Git。
- **登录会话由你的浏览器保存。** 你在独立的本地 Chrome Profile 中人工登录
  Google；DashBye 不导出 Cookie，也不把密码写进项目文件。

本地校验无需连接 Dashboard；读取或保存草稿时才连接 Google。
如果交给外部 AI Agent 操作，该 Agent 如何处理文件和对话内容，取决于它自身的
权限及数据政策，与 DashBye 的本地执行边界是两回事。

## 1. 安装

需要 **Node.js 22+**、Git；访问 Dashboard 时需要官方 Chrome。

### 在终端安装

```bash
npm install --global dashbye
dashbye -h
```

然后进入扩展仓库，运行命令行初始化向导：

```bash
cd /path/to/extension
dashbye init
```

命令行向导是默认的配置方式。它会依次收集必要信息、展示最终配置，并在写入
项目文件前请求确认。

<details>
<summary>备选：从源码构建，不做全局安装</summary>

```bash
git clone https://github.com/HiAriesZhou/DashBye.git
cd DashBye
npm ci
node dist/src/cli.js -h
```

`npm ci` 会通过 prepare 脚本构建 CLI。后续将命令中的 `dashbye` 替换为
`node /绝对路径/DashBye/dist/src/cli.js`。

</details>

### 交给 Agent

在能访问文件和终端的编码 Agent 中打开扩展仓库，展开并复制这段提示词：

<details>
<summary>展开：安装与配置 prompt</summary>

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
5. 访问 Dashboard 前，让我启动专用 Chrome 并人工登录。Profile 和诊断文件
   放在仓库外。先运行 inspect 和 plan，展示目标及全部改动，经我明确确认
   该计划后才能执行 sync-draft。
6. 保存后必须回读，确认剩余操作为零。不得提交审核或发布。
   汇报文件改动、验证结果和未解决问题。
```

</details>

Agent 使用的仍是同一个本地 CLI 和项目配置。`init --agent --json` 是为无法回答
交互式终端提示的 Agent 提供的文本自动化接口，不依赖也不提供图形控件。
没有本地文件和终端权限的聊天会话只能指导操作，无法代为安装。

## 2. 配置扩展项目

```bash
cd /path/to/extension
dashbye init
```

向导依次收集项目路径、构建产物、资源目录（默认 `store`）、条目 ID、语言和
专用 Chrome endpoint。确认预览后保存；已有配置可复用，也可明确选择重新配置。

```text
extension/
  dashbye.config.yml       # 路径与 Dashboard 目标
  store/
    release.yml           # 完整商店文案与隐私状态
    listing/              # 描述文本
    assets/               # 图标、截图、推广图
    releases/             # 同步核对成功后生成的 lock
```

用真实素材和声明补全模板，再运行 `dashbye validate`。初始化完成不等于
资源已达到发布要求。字段与图片规格见[资源 schema](docs/store-schema.md)。

通常每个项目只需初始化一次；后续自动查找最近的 `dashbye.config.yml`，
显式 CLI 参数优先。每个版本在配置位置更新资源即可。
注意：空列表和 `null` 可能表示删除远端内容。

## 3. 连接 Chrome

为 Dashboard 创建专用的本地 Chrome Profile。Profile 是 Chrome 保存设置和
登录状态的文件夹，不是 DashBye 云端账号。为它单独指定一个项目仓库之外的目录，
是为了避免登录文件被误提交到 Git，同时与日常浏览器会话分开。
下面的 macOS 示例使用本机应用数据目录。

人工登录后，DashBye 会复用已打开的目标编辑页，或在这个专用会话中打开
Dashboard，再按配置中的完整 item ID 自动进入条目。登录失效时会停止并等待
人工认证。如果同一 item 打开了多个编辑页，DashBye 会拒绝继续，避免页面状态冲突。

<details>
<summary>展开 macOS 启动命令</summary>

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$HOME/Library/Application Support/DashBye/chrome-profile" \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9333 \
  https://chromewebstore.google.com/devconsole
```

</details>

其他系统使用相同参数，替换 Chrome 可执行文件与独立 Profile 路径。
DashBye 连接配置中的 loopback endpoint，不控制日常 Chrome、不自动登录、
不导出 Cookie，也不会自动启动 Chrome。无头模式复用会话尚未验证。

## 4. 核对并保存草稿

诊断文件放在仓库外。示例中的 `/path/to/private-output` 需替换为已存在的私有目录。

```bash
dashbye validate
dashbye doctor --json
dashbye inspect --output /path/to/private-output/current-draft.json
dashbye plan --output /path/to/private-output/draft-plan.json
```

核对具体条目与全部变更，批准后执行：

```bash
dashbye sync-draft \
  --plan /path/to/private-output/draft-plan.json \
  --approve-plan <已审核计划中的approvalHash> \
  --non-interactive
```

构建产物、资源或远端状态变化后，重新生成并审核计划。
同步成功会保存草稿、回读核对，仅在无剩余差异时生成版本 lock。
提交审核仍由你在 Dashboard 操作。

## 当前状态与文档

当前是早期技术版本。已在真实 Dashboard 验证包上传、图片替换、部分隐私文案修改、
草稿保存及回读。多语言、无头会话复用、数据类别／认证变更及新增权限确认尚未验证。

完整操作手册：`dashbye -h` · [资源 schema](docs/store-schema.md) ·
[验证记录](docs/validation.md) · [架构](docs/architecture.md) ·
[安全边界](docs/security.md)

## 许可与品牌

代码采用 **GPL-3.0-only**，见 [LICENSE](LICENSE) 和[许可范围](LICENSING.md)。
分发修改版须遵守 GPLv3，包括对应源码提供义务；允许合规商用。

DashBye 名称、Logo、吉祥物和独立视觉品牌素材不随代码许可证授权。
以独立产品推广的 fork 应使用自己的品牌，详见[品牌政策](TRADEMARK.md)及
[素材条款](brand/LICENSE)。这些条款不限制代码的 GPL 权利，也不主张垄断
一般产品创意。此前 MIT 版本仍保留原有许可。
