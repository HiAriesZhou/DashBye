<img src="https://raw.githubusercontent.com/HiAriesZhou/DashBye/main/brand/dashbye-readme.png" alt="DashBye 挥手壁虎" width="112">

# DashBye

*少填表，多发布。*

给编码 Agent 一套可版本管理的 Chrome Web Store 发布工作区。DashBye 把扩展包、商店文案、截图、推广图和隐私声明留在扩展仓库中，再准备一份可以逐项审核的草稿。

[English](README.md) · [简体中文](README.zh-CN.md) · [手动 CLI](#更喜欢自己敲命令) · [使用指南](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.zh-CN.md)

## 把这段交给 Agent

在能访问本地文件和终端的编码 Agent 中打开扩展仓库，粘贴：

```text
为当前扩展仓库配置 DashBye，并准备 Chrome Web Store 草稿。
源码：https://github.com/HiAriesZhou/DashBye

不使用 sudo 安装 DashBye，阅读 dashbye -h，并使用
dashbye init --agent --json 配置当前仓库。检查真实构建产物、manifest、已有
商店文案、截图、图片和隐私依据。无法从仓库确认的事实要问我；不得编造产品
功能、权限用途、数据使用声明或认证。

浏览器 Profile 和诊断文件放在仓库外。需要访问 Dashboard 时，让我启动专用
Chrome Profile 并人工登录。运行 validate、inspect 和 plan，向我展示完整目标
及每一项改动，在我明确批准后才能执行 sync-draft。

批准同步后，必须回读并确认剩余差异为零。不得提交审核或发布。最后汇报修改的
文件、执行的检查和仍未解决的问题。
```

Agent 会安装或找到 CLI、初始化仓库、整理发布资源、完成校验，并准备一份具体的变更计划。

你负责提供仓库无法证明的产品事实、亲自登录 Google，并在 DashBye 写入草稿前批准确切计划。

想让提示词自动带上项目路径？安装后运行：

```bash
dashbye agent-prompt --project /path/to/extension
```

## 接下来会发生什么

扩展仓库 → Agent 审计真实构建和资源 → DashBye 与商店草稿比对 → 你批准计划 → DashBye 保存并回读草稿。

DashBye 完全在本机运行，通过专用 Chrome 会话直接连接 Google。无需 DashBye 账号，没有服务器或遥测。**自动化止于保存草稿；提交审核和发布仍由你在 Dashboard 完成。**

## 又发新版，又填一遍？

- **代码更新了，商店截图还停在上个版本？** 素材跟随扩展版本维护，发布前统一比对。
- **新增了权限，说明还是去年的？** 根据实际构建产物校验声明，趁还来得及的时候发现遗漏。
- **复制、粘贴、上传，下次再来一次？** 审核一份确定的计划，不再凭记忆重建商店页面。

## 更喜欢自己敲命令？

需要 **Node.js 22+**、Git、官方 Chrome，以及已有的 Chrome Web Store 条目。

安装后，在扩展仓库中初始化：

```bash
npm install --global dashbye
cd /path/to/extension
dashbye init
```

用真实文案、图片和隐私声明补全生成的 `store/` 模板，再校验：

```bash
dashbye validate
```

在仓库外启动专用 Chrome Profile，并人工登录。启动命令和排错步骤见[浏览器指南](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.zh-CN.md#连接-chrome)。

在仓库外准备一个已存在的私有输出目录，读取当前草稿并生成计划：

```bash
dashbye doctor --json
dashbye inspect --output /path/to/private-output/current-draft.json
dashbye plan --output /path/to/private-output/draft-plan.json
```

逐项审核操作。批准后，将 `APPROVED_PLAN_HASH` 替换为这份计划中的 `approvalHash`：

```bash
dashbye sync-draft \
  --plan /path/to/private-output/draft-plan.json \
  --approve-plan APPROVED_PLAN_HASH \
  --non-interactive
```

成功意味着草稿已保存，回读后**剩余差异为零**，随后生成版本 lock。[使用指南](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.zh-CN.md)包含源码安装、资源结构、Chrome 设置和失败处理。

## 下个版本会短很多

更新扩展构建产物和 `store/` 中的文件。保持专用 Chrome 会话运行并登录，然后使用新计划的 hash 重复 **validate → plan → 审核 → sync-draft**。

DashBye 会自动查找最近的 `dashbye.config.yml`。截图放在哪里，教它一次就够了。如果批准后构建产物、资源或远端草稿发生变化，需要重新生成并审核计划。

## 仍然由你决定的事

- 缺失的产品事实、隐私声明和认证
- 人工登录 Google
- 每一份 Dashboard 写入计划的批准
- 最终提交审核与发布

期望状态中的空列表和 `null` 可能表示删除，因此 Agent 必须明确展示这些操作。DashBye 会拒绝过期计划，并将保存结果与已批准的期望状态再次比对。

## 目前能做到哪里

当前是早期技术版本。包上传、图片替换、部分隐私文案修改、草稿保存和回读已在真实 Dashboard 验证。多语言、无头会话复用、数据类别／认证变更及新增权限确认尚未验证。

[使用与源码安装](https://github.com/HiAriesZhou/DashBye/blob/main/docs/usage.zh-CN.md) · [资源 schema](https://github.com/HiAriesZhou/DashBye/blob/main/docs/store-schema.md) · [验证记录](https://github.com/HiAriesZhou/DashBye/blob/main/docs/validation.md) · [安全边界](https://github.com/HiAriesZhou/DashBye/blob/main/docs/security.md) · [架构](https://github.com/HiAriesZhou/DashBye/blob/main/docs/architecture.md)

完整命令与参数：`dashbye -h`。

## 许可与品牌

代码采用 [GPL-3.0-only](LICENSE)，允许遵守条款的商用，详见[许可范围](LICENSING.md)。此前 MIT 版本保留原有许可。

名称、Logo 和吉祥物适用独立的[品牌政策](TRADEMARK.md)与[素材条款](https://github.com/HiAriesZhou/DashBye/blob/main/brand/LICENSE)。以独立产品推广的 fork 应使用自己的品牌。
