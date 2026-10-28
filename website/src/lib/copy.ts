// Page copy. Facts follow README.md / README.zh-CN.md; update them together.
export type Lang = 'en' | 'zh';

export const paths = {
  en: { home: '/', docs: '/docs/' },
  zh: { home: '/zh/', docs: '/zh/docs/' },
} as const;

const en = {
  htmlLang: 'en',
  meta: {
    title: 'DashBye: less dashboard, more shipping',
    description: 'A local CLI that keeps a browser extension’s store package, listing copy, images, and privacy declarations in its repository, compares them with Chrome Web Store, Firefox Add-ons, and Edge Add-ons, and writes nothing until you approve the exact plan.',
    docsTitle: 'Usage guide · DashBye',
    docsDescription: 'Install DashBye, set it up with a coding agent, and run store releases for Chrome Web Store, Firefox Add-ons, and Edge Add-ons.',
  },
  nav: { guide: 'Guide', github: 'GitHub', switchLabel: '中文', switchName: '简体中文', skip: 'Skip to content', home: 'DashBye home', label: 'Main' },
  hero: {
    title: ['Less dashboard.', 'More shipping.'],
    lede: 'Give your coding agent a versioned release workspace for browser extensions. DashBye keeps the package, store copy, screenshots, artwork, and privacy declarations in your extension repository, compares them with each store, and writes nothing until you approve the exact plan.',
    guide: 'Read the usage guide',
    facts: ['Node.js 22+', 'GPL-3.0-only', 'No account, server, or telemetry'],
    mascotAlt: 'The DashBye gecko waving goodbye from the top of a dashboard',
  },
  copy: { label: 'Copy', done: 'Copied', failed: 'Copy failed. Select the text instead.', failedShort: 'Select to copy' },
  release: {
    eyebrow: 'dashbye release',
    title: 'One plan. One yes. Then a read-back.',
    notes: [
      { term: 'Readable, not revealing', text: 'Saved plans and JSON output hold versions, counts, and which fields change, never field contents. Text changes are previewed only in your terminal.' },
      { term: 'Destructive changes are marked', text: 'A replaced image or a removed screenshot is flagged in the plan, before you answer the one question.' },
      { term: 'Done means zero differences', text: 'After saving, DashBye reads the Chrome draft back and writes the release lock only when nothing is left to change. Edge’s API cannot read its draft, so DashBye records the upload instead.' },
    ],
  },
  problems: {
    title: 'What it solves',
    items: [
      { q: 'New build, old screenshots?', a: 'Version store assets with the extension and compare them before the release.' },
      { q: 'New permission, last version’s explanation?', a: 'Validate declarations against the built extension while there is still time to fix them.' },
      { q: 'Copy, paste, upload, repeat?', a: 'Review one deterministic plan instead of reconstructing the listing by hand.' },
    ],
  },
  flow: {
    title: 'How a release moves',
    steps: [
      { who: 'Repository', text: 'Your extension repository holds the build and the store resources.' },
      { who: 'Agent', text: 'Audits the real build, manifest, copy, images, and privacy evidence.' },
      { who: 'DashBye', text: 'Compares them with each store you manage and builds one plan.' },
      { who: 'You', text: 'Approve the exact plan.' },
      { who: 'DashBye', text: 'Writes the approved changes and reads them back.' },
    ],
    local: 'DashBye runs locally. It reaches Chrome Web Store through your dedicated Chrome session, and Firefox Add-ons and Edge Add-ons through their official APIs with keys you keep outside the repository.',
  },
  stores: {
    title: 'Three stores, clear limits',
    head: ['Store', 'DashBye does', 'You still do'],
    rows: [
      ['Chrome Web Store', 'Saves the package, listing, images, and privacy declarations to the Dashboard draft, then reads them back', 'Sign in to Google; submit for review and publish'],
      ['Firefox Add-ons', 'Validates the package; dashbye submit creates a listed version from an approved plan; after AMO approves it, updates the summary, description, homepage, support email, and categories', 'Support URL and screenshots in AMO Developer Hub'],
      ['Microsoft Edge Add-ons', 'Uploads the package to the product’s draft submission', 'Store listing, review, and publishing in Partner Center'],
    ],
    firefox: 'Firefox Add-ons has no draft. A version created by dashbye submit enters AMO review and cannot be taken back, and listing updates go live immediately. DashBye does both only for the plan you approve.',
  },
  agent: {
    title: 'Hand it to your agent',
    intro: 'Open your extension repository in a coding agent with local file and terminal access, and paste this prompt.',
    agentHead: 'The agent',
    agentDoes: ['Installs or locates the CLI', 'Initializes the repository', 'Organizes and validates the release resources', 'Prepares a concrete change plan'],
    youHead: 'You',
    youDo: ['Provide product facts the repository cannot prove', 'Sign in to Google in the Chrome window DashBye opens', 'Approve the exact plan before DashBye writes to the draft', 'Submit for review and publish yourself'],
  },
  never: {
    title: 'What DashBye will not do',
    items: [
      'Submit Chrome or Edge items for review, or publish them',
      'Sign in for you, solve CAPTCHAs, or disguise its browser',
      'Invent product claims, permission purposes, or data-use certifications',
      'Talk to Chrome over anything but a loopback connection',
      'Collect telemetry: there is no DashBye account or server',
    ],
    more: 'Security boundaries',
  },
  status: {
    title: 'Early, and honest about it',
    text: 'Exercised on real store items: Chrome package upload, artwork replacement, and selected privacy-copy changes; one Firefox submission and a listing update after approval; one Edge package upload. Still unverified: multiple locales, collected-data and certification changes, new permission confirmations, and sign-in on Windows and Linux.',
    link: 'Validation record',
  },
  end: {
    title: 'Ship the next version from your repository.',
    guide: 'Usage guide',
  },
  footer: { license: 'Code: GPL-3.0-only', brand: 'Brand and mascot terms', disclaimer: 'Not affiliated with Google, Mozilla, or Microsoft.' },
  docs: { onPage: 'On this page', back: 'Back to top' },
  notFound: { title: 'This page waved goodbye.', text: 'Nothing lives at this address.', home: 'Go to the home page', guide: 'Open the usage guide' },
};

type Copy = typeof en;

const zh: Copy = {
  htmlLang: 'zh-CN',
  meta: {
    title: 'DashBye：少填表，多发版',
    description: '本地运行的 CLI：把浏览器扩展的扩展包、商店文案、图片和隐私声明放进扩展仓库，与 Chrome Web Store、Firefox 附加组件商店、Edge 加载项商店逐项比对，你批准具体计划之前不写入任何内容。',
    docsTitle: '使用指南 · DashBye',
    docsDescription: '安装 DashBye，交给编码 Agent 配置，并在 Chrome Web Store、Firefox 附加组件商店和 Edge 加载项商店完成发布。',
  },
  nav: { guide: '使用指南', github: 'GitHub', switchLabel: 'EN', switchName: 'English', skip: '跳到正文', home: 'DashBye 首页', label: '主导航' },
  hero: {
    title: ['少填表，', '多发版。'],
    lede: '让编码 Agent 替你打理浏览器扩展的商店发布。扩展包、商店文案、截图、推广图和隐私声明都放进扩展仓库，跟代码一起做版本管理；DashBye 把它们与各个商店逐项比对，你批准具体计划之前不写入任何内容。',
    guide: '阅读使用指南',
    facts: ['Node.js 22+', 'GPL-3.0-only', '无需账号，没有服务器，不收集遥测'],
    mascotAlt: 'DashBye 的壁虎站在 dashboard 上挥手告别',
  },
  copy: { label: '复制', done: '已复制', failed: '复制失败，请手动选择文本。', failedShort: '请手动复制' },
  release: {
    eyebrow: 'dashbye release',
    title: '一份计划，一次确认，写完回读。',
    notes: [
      { term: '看得懂，不泄露', text: '保存的计划和 JSON 输出只记录版本号、数量和要改哪些字段，不含字段内容。文案改动只在你的终端里预览。' },
      { term: '破坏性改动单独标出', text: '替换图片、删除截图会在计划里单独标出，你回答那一个问题之前就能看到。' },
      { term: '剩余差异为零才算完成', text: '保存后 DashBye 回读 Chrome 草稿，确认没有剩余改动才写入版本锁。Edge 的 API 读不到草稿，所以 DashBye 改为记录这次上传。' },
    ],
  },
  problems: {
    title: '解决的问题',
    items: [
      { q: '代码更新了，商店截图还是上个版本的？', a: '素材跟着扩展一起做版本管理，发布前统一比对。' },
      { q: '新加了权限，说明文字还是老一套？', a: '对照实际构建产物校验声明，趁还来得及就把遗漏找出来。' },
      { q: '复制、粘贴、上传，下个版本从头再来？', a: '只需审一份确定的计划，不必再凭记忆把商店页面拼一遍。' },
    ],
  },
  flow: {
    title: '一次发布怎么走',
    steps: [
      { who: '扩展仓库', text: '存放构建产物和商店素材。' },
      { who: 'Agent', text: '审计真实的构建、manifest、文案、图片和隐私依据。' },
      { who: 'DashBye', text: '与你管理的每个商店比对，合成一份变更计划。' },
      { who: '你', text: '批准这份具体的计划。' },
      { who: 'DashBye', text: '写入批准的改动，并回读核对。' },
    ],
    local: 'DashBye 只在你的电脑上运行：通过专用 Chrome 会话访问 Chrome Web Store，通过官方 API 访问 Firefox 和 Edge 的商店，所需密钥放在仓库之外。',
  },
  stores: {
    title: '三个商店，边界清楚',
    head: ['商店', 'DashBye 负责', '仍由你完成'],
    rows: [
      ['Chrome Web Store', '把扩展包、商店文案、图片和隐私声明保存到 Dashboard 草稿，并回读核对', '登录 Google；提交审核与发布'],
      ['Firefox 附加组件商店', '校验扩展包；dashbye submit 按批准的计划创建上架版本；AMO 审核通过后，更新简介、描述、主页、支持邮箱和分类', '在 AMO 开发者中心维护支持网址和截图'],
      ['Microsoft Edge 加载项商店', '把扩展包上传到产品的草稿提交', '在 Partner Center 编辑商店页、提交审核与发布'],
    ],
    firefox: 'Firefox 附加组件商店没有草稿。dashbye submit 创建的版本会进入 AMO 审核，无法撤回；商店页的修改也会立即生效。这两类操作，DashBye 只按你批准的计划执行。',
  },
  agent: {
    title: '交给 Agent',
    intro: '打开扩展仓库，在能读写本地文件、能执行终端命令的编码 Agent 里粘贴这段提示词。',
    agentHead: 'Agent 负责',
    agentDoes: ['安装（或找到已装好的）CLI', '初始化仓库', '整理发布素材并跑完校验', '交给你一份具体的变更计划'],
    youHead: '你负责',
    youDo: ['补充仓库里查不到的产品事实', '在 DashBye 打开的 Chrome 窗口里登录 Google', '在 DashBye 写入草稿之前批准计划', '亲手提交审核与发布'],
  },
  never: {
    title: 'DashBye 不会做的事',
    items: [
      '为 Chrome 或 Edge 提交审核、发布上架',
      '替你登录、处理验证码，或伪装浏览器指纹',
      '编造产品功能、权限用途或数据使用认证',
      '通过 loopback 以外的连接控制 Chrome',
      '收集遥测数据：DashBye 没有账号，也没有服务器',
    ],
    more: '安全边界',
  },
  status: {
    title: '早期版本，如实说明',
    text: '已在真实商店条目上跑通：Chrome 的扩展包上传、图片替换和部分隐私文案修改；一次 Firefox 版本提交，以及审核通过后的一次商店页更新；一次 Edge 扩展包上传。尚未验证：多语言、数据类别与认证的变更、新增权限的确认，以及在 Windows 和 Linux 上登录。',
    link: '验证记录',
  },
  end: {
    title: '下一个版本，从仓库里发出去。',
    guide: '使用指南',
  },
  footer: { license: '代码：GPL-3.0-only', brand: '品牌与吉祥物条款', disclaimer: '与 Google、Mozilla、Microsoft 无关联。' },
  docs: { onPage: '本页内容', back: '回到顶部' },
  notFound: { title: '这个页面已经挥手告别。', text: '这个地址没有内容。', home: '回到首页', guide: '打开使用指南' },
};

export const copy: Record<Lang, Copy> = { en, zh };

// A synthetic run (fictional item ID, versions, and text) in the real terminal output format:
// format.ts, multi-plan.ts, text-preview.ts, and release() in cli.ts.
export const releaseTranscript = [
  { kind: 'cmd', text: 'dashbye release' },
  { kind: 'head', text: 'Chrome Web Store' },
  { kind: 'out', text: `  Target: item ${'a'.repeat(32)}, en` },
  { kind: 'out', text: '  3 changes:', note: 1 },
  { kind: 'out', text: '    Package  upload package version 1.4.2 → 1.5.0' },
  { kind: 'out', text: '    Listing  update description' },
  { kind: 'warn', text: '    Listing  replace small promo tile (440×280)  ! replaces existing content', note: 2 },
  { kind: 'gap', text: '' },
  { kind: 'head', text: 'Microsoft Edge Add-ons' },
  { kind: 'out', text: '  Package 1.5.0 → draft submission' },
  { kind: 'out', text: '  Store listing and publishing stay in Partner Center.' },
  { kind: 'gap', text: '' },
  { kind: 'head', text: 'Text changes' },
  { kind: 'out', text: '  Chrome Web Store · description: new text, 412 characters' },
  { kind: 'out', text: '    starts: "Jump between headings in long pages and pick up where you left off."' },
  { kind: 'ask', text: 'Save these changes to the Dashboard draft and upload the Edge package to its draft? [Y/n] ', answer: 'y' },
  { kind: 'ok', text: 'Chrome Web Store: Draft saved and read back with no remaining differences. Release lock: 1.5.0.lock.json', note: 3 },
  { kind: 'out', text: 'Microsoft Edge Add-ons: uploaded 1.5.0 to the draft submission. Review the listing and publish in Partner Center.' },
  { kind: 'gap', text: '' },
  { kind: 'head', text: 'Next:' },
  { kind: 'out', text: '  - Chrome Web Store: review the saved draft and submit it for review in the Developer Dashboard.' },
  { kind: 'out', text: '  - Microsoft Edge Add-ons: update the store listing if needed, then publish in Partner Center.' },
] as const;
