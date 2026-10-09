<img src="https://raw.githubusercontent.com/HiAriesZhou/DashBye/main/brand/dashbye-readme.png" alt="DashBye 的挥手壁虎" width="112">

# DashBye

*少填表，多发版。*

让编码 Agent 替你打理 Chrome Web Store 发布。扩展包、商店文案、截图、推广图和隐私声明都放进扩展仓库，跟代码一起做版本管理；DashBye 据此备好一份草稿，由你逐项过目。

[English](README.md) · [简体中文](README.zh-CN.md) · [手动使用命令行](#手动使用命令行) · [使用指南](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.zh-CN.md)

## 示例

前提：扩展仓库已配置好 DashBye，并已在专用 Chrome 中登录 Google 账号。

### 1. 告诉 Agent 你的需求

对 Agent 说：“为这个扩展仓库配置 DashBye，并准备好 Chrome Web Store 草稿。”Agent 会检查构建产物和商店素材，再与线上现有的草稿逐项比对。

### 2. 审阅并批准变更计划

Agent 列出变更计划：目标是扩展的**英文商店页**，只有**一项改动：替换 440 × 280 的小型推广图**；扩展包、描述、截图和隐私声明都没有差异。Agent 说明替换会先删除旧图、再上传新图，然后等待确认。维护者回复“保存”，批准执行。

### 3. 保存草稿并核对结果

DashBye 保存草稿后会立即回读核对。这个例子里，第一次回读仍有差异，Agent 没有直接报告完成，而是重新运行 inspect 和 plan，确认已没有待执行的操作，再执行一次零操作同步：结果为 `saved_and_reread`，写入版本锁，新计划为 `operations: []`，即**剩余差异为零**。草稿只做保存，不会提交审核，也不会发布。[案例说明](https://github.com/HiAriesZhou/DashBye/blob/main/docs/assets/demo/README.md)

想在自己的扩展仓库中使用，把下面的提示词交给 Agent 即可。

## 交给 Agent 配置

打开扩展仓库，在能读写本地文件、能执行终端命令的编码 Agent 里粘贴：

```text
为这个扩展仓库配置 DashBye，并准备好 Chrome Web Store 草稿。
源码：https://github.com/HiAriesZhou/DashBye

安装 DashBye（不要用 sudo），先读 dashbye -h，再用 dashbye init --agent --json
完成当前仓库的配置。一切以真实的构建产物、manifest、现有商店文案、截图、推广图
和隐私依据为准。仓库里确认不了的事实直接问我；产品功能、权限用途、数据使用声明
和各项认证，一律不能编。

诊断文件都放在所有仓库之外。运行 validate 和 plan 时加上 --json；需要访问
Dashboard 时，DashBye 会自己打开专用的 Chrome。我只负责在那个窗口里登录 Google。
如果当前环境打不开图形界面，说明原因，并让我运行 "dashbye chrome"。把目标条目和
每一项改动都列给我看，等我明确同意后再执行 sync-draft。

同步后必须回读，确认剩余差异为零。不要提交审核，也不要发布。最后告诉我改了哪些
文件、做了哪些检查、还有哪些问题没解决。
```

Agent 会安装（或找到已装好的）CLI，初始化仓库，整理发布素材，跑完校验，最后交给你一份具体的变更计划。

你只需要做三件事：补充仓库里查不到的产品事实；在 DashBye 打开的 Chrome 窗口里登录 Google；在 DashBye 写入草稿之前，批准那份计划。

希望提示词里直接带上项目路径？安装后运行：

```bash
dashbye agent-prompt --project /path/to/extension
```

## 工作流程

扩展仓库 → Agent 审计真实的构建和素材 → DashBye 与商店草稿比对 → 你批准计划 → DashBye 保存草稿并回读核对。

DashBye 只在你的电脑上运行，通过专用 Chrome 会话直连 Google：不用注册账号，没有服务器，也不收集任何遥测数据。**它的工作到保存草稿为止；提交审核和正式发布，仍由你在 Dashboard 里亲手完成。**

## 解决的问题

- **代码更新了，商店截图还是上个版本的？** 素材跟着扩展一起做版本管理，发布前统一比对。
- **新加了权限，说明文字还是老一套？** 对照实际构建产物校验声明，趁还来得及就把遗漏找出来。
- **复制、粘贴、上传，下个版本从头再来？** 只需审一份确定的计划，不必再凭记忆把商店页面拼一遍。

## 手动使用命令行

需要 **Node.js 22+**、Git、官方版 Chrome，以及一个已经存在的 Chrome Web Store 条目。

全局安装，然后在扩展仓库里初始化：

```bash
npm install --global dashbye
cd /path/to/extension
dashbye init
```

用真实的文案、图片和隐私声明填好生成的 `store/` 模板，然后依次校验、生成计划、同步：

```bash
dashbye validate
dashbye plan
dashbye sync-draft
```

`plan` 需要时会自动打开 DashBye 专用的 Chrome 窗口。第一次使用时在窗口里登录 Google，DashBye 会等你登录完再读取草稿，列出每一项改动，并把计划保存在仓库之外。

`sync-draft` 会再列一遍改动，然后询问 `Save these changes to the Dashboard draft? [Y/n]`。直接回车即保存，输入 `n` 取消。执行成功，意味着草稿已保存、回读后**剩余差异为零**，并写入了版本锁文件。

想看某个命令有哪些参数，运行 `dashbye <命令> -h`。源码安装、素材目录结构、Chrome 设置和各种失败情况，见[使用指南](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.zh-CN.md)。

## 后续发版

更新构建产物和 `store/` 里的文件，再走一遍 **validate → plan → sync-draft**。专用 Chrome 会记住登录状态，下次发版不用重新登录。

DashBye 会自动找到最近的 `dashbye.config.yml`，截图放在哪儿，说一次就够了。批准之后，只要构建产物、素材或线上草稿有任何变化，都要重新生成计划、重新审阅。

## 需要你负责的事项

- 仓库里没有的产品事实、隐私声明和认证
- 手动登录 Google
- 每一次写入 Dashboard 前的计划审批
- 最终的提交审核与发布

注意：期望状态里的空列表或 `null` 可能意味着删除，Agent 必须把这类操作单独列出来。DashBye 会拒绝已过期的计划，并用你批准时的期望状态核对保存结果。

## 当前支持情况

这还是早期技术版本。扩展包上传、图片替换、部分隐私文案修改、草稿保存与回读，都已在真实 Dashboard 上跑通。多语言、无头模式复用登录会话、数据类别与认证的变更、新增权限的确认，目前还没有验证过。

[使用与源码安装](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.zh-CN.md) · [素材结构说明](https://github.com/HiAriesZhou/DashBye/blob/main/docs/store-schema.md) · [验证记录](https://github.com/HiAriesZhou/DashBye/blob/main/docs/validation.md) · [安全边界](https://github.com/HiAriesZhou/DashBye/blob/main/docs/security.md) · [架构](https://github.com/HiAriesZhou/DashBye/blob/main/docs/architecture.md)

全部命令和参数，运行 `dashbye -h` 查看。

## 许可与品牌

代码以 [GPL-3.0-only](LICENSE) 发布，在遵守条款的前提下可以商用，适用范围见[许可说明](LICENSING.md)。早先以 MIT 发布的版本，仍按原许可使用。

DashBye 的名称、Logo 和吉祥物另有[品牌政策](TRADEMARK.md)和[素材条款](https://github.com/HiAriesZhou/DashBye/blob/main/brand/LICENSE)。fork 之后若作为独立产品推广，请换用自己的名称和形象。
