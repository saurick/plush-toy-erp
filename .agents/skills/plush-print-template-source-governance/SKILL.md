---
name: plush-print-template-source-governance
description: 项目打印模板源文件治理（plush-toy-erp）。Use when Codex implements or reviews plush-toy-erp print templates, print workspaces, customer Excel/PDF/image sources, engineering material detail sheets, color cards, work instructions, purchase/processing contracts, yoyoosun customer print samples, repeated source blocks, source noise, scan artifacts, incidental marks, template source intent, cell layout, image upload behavior, row selection, rich text, PDF/print preview, screenshot debugging, visual evidence, performance/quality risks, or customer-vs-Product-Core print-template boundaries.
---

# Plush Print Template Source Governance

阅读口径：正文默认中文主线 + English anchors；`name` / `display_name` 保持英文。本 skill 负责 plush-toy-erp 打印模板从客户源文件到运行时模板的识别、边界、交互和验证治理。若只做通用判断，先用全局 `$erp-print-template-source-governance`；落到本仓库实现时使用本 skill。

## Truth Chain / 必读真源

按任务范围读取，不机械全量展开：

- `/Users/simon/projects/plush-toy-erp/AGENTS.md`
- `/Users/simon/projects/plush-toy-erp/README.md`
- `/Users/simon/projects/plush-toy-erp/docs/当前真源与交接顺序.md`
- `/Users/simon/projects/plush-toy-erp/web/README.md`
- `/Users/simon/projects/plush-toy-erp/docs/打印模板字段与编辑行为清单.md`
- `/Users/simon/projects/plush-toy-erp/docs/打印模板实现原理.md`
- `/Users/simon/projects/plush-toy-erp/docs/product/prototypes/README.md`；涉及 UI / prototype intent 时再读对应 prototype README
- `/Users/simon/projects/plush-toy-erp/docs/customers/<customer-key>/source-manifest.json`；客户专属任务同时读 raw source files
- `/Users/simon/projects/plush-toy-erp/scripts/import/customerSourceManifestCheck.mjs` 和 `scripts/import/README.md`；校验 yoyoosun raw source registration、checksum、size 或 structured extraction boundary 时必读
- `/Users/simon/projects/plush-toy-erp/config/customers/<customer-key>/README.md`；涉及 runtime samples、extracted image assets 或 `printTemplateDefaults` 时必读
- 当前代码真源，重点是 `web/src/erp/pages/PrintCenterPage.jsx`、`web/src/erp/config/printTemplates.mjs`、`web/src/erp/data/engineeringPrintTemplates.mjs`、`web/src/erp/pages/EngineeringPrintWorkspacePage.jsx`、`web/src/erp/utils/engineeringPrintEditor.mjs`、`web/src/erp/utils/printWorkspace.js` 以及相关 print components / styles / tests

## Project Rules / 项目边界

- 当前正式模板包括 `采购合同`、`加工合同`、`物料分析明细表`、`色卡`、`作业指导书`。新增或改变正式模板时，必须同步检查 `fieldRequirements`、`moduleKeys`、`factBoundary: read_snapshot_only` 和服务端 PDF 模块门禁。
- yoyoosun raw sources 必须先走 `docs/customers/yoyoosun/source-manifest.json`：path、sha256、size、media type、source kind、structuredExtract policy 和 duplicate group 都是 source-boundary evidence。不要直接 glob `raw-source-files/*.xlsx`，也不要把截图当正式 source chain。
- 打印输出真源是当前独立打印窗口里的右侧纸面 DOM；左侧字段面板、附件上传条和工具栏只是编辑入口，不是第二套模板。
- 打印模板只读业务快照和当前窗口草稿，不创建、确认、过账或反写采购、委外、生产、库存、质检、出货或财务事实。
- 客户源文件、客户公司名、真实联系人、真实电话、真实签字人、客户图片和原始资料路径不能自动进入 Product Core 默认样例。客户专属内容应留在 `docs/customers/<customer-key>/`、客户配置包、客户打印模板、assets 或交付资料边界。
- 客户源文件里的轻微干扰和噪点不能照着实现：扫描污点、截图边缘、临时批注、手工审阅痕迹、重复拼接缝、Excel 临时辅助行、偶发错位或孤立格式异常，默认先归为 source noise，除非能证明它是稳定模板结构、客户固定要求或可编辑业务元素。
- Excel workbook 可能混有 print templates、summary sheets、vendor / customer reference data、import-prep clues、hidden helper rows 和 styled blank regions；任何内容进入 Product Core 或 customer config 前，都要先分类 sheet / region。
- Excel dimensions 可能被样式或 drawings 撑大；必须计算真实内容区，并独立解析 drawing / image anchors。图片 anchor 在文本 used range 外，不等于可以丢弃。
- 提取或生成的 customer assets 必须保留 provenance：workbook path、sheet name、drawing file / id、row / column anchor、crop / layout、source dimensions、runtime URL，以及它是 customer sample 还是 editable runtime slot。
- 图片尺寸和位置先按甲方源文件理解：产品图、色卡图、样板图、签章/签名或其他固定图片如果在源文件中有明确单元格、合并区域、坐标框或占位比例，运行时默认应落在同一语义区域并保持接近源文件的视觉尺寸；不能因为实现方便改放到文件末尾、通用上传条或任意缩略图区。
- Product Core 默认样例应使用中性展示值；模板样例文字默认黑色，颜色/加粗是编辑能力，不是默认样式证据。
- Product Core 默认样例不要按甲方长表塞满。若编号作业行、材料行、色卡行或合同明细行行为一致，默认只保留 2-5 条代表行；长清单、分页和性能用 fixture / L1 / PDF 回归覆盖，不靠默认样例复制所有源行。
- 不要为了当前截图补页面私有真源、旧 `business_records` 链路、额外草稿 key、第二套 PDF HTML 或客户硬编码。
- 模板质量同样是交付边界：不要为某个截图堆一批一次性 CSS/JS 补丁、无限 base64 图片快照、整页截图型模板、重复测高循环或第二套隐藏 PDF DOM；优先复用 `printWorkspace.js`、`PrintWorkspaceShell`、工程模板 normalizer、共享图片槽和 scoped CSS。
- Official templates 需要等价于 trade QA catalog 的 coverage matrix，即使它存放在 plush-specific code / docs：template key、source workbook / page、field requirements、mapper、renderer、module gate、image slots、browser / PDF checks 和 blind spots 都要可追踪。
- Runtime limits 是正确性的一部分。复用现有 engineering row / image limits 和 server PDF payload / concurrency / timeout；如果新增 row / image / vector 路径，要补上对应 bound 或说明为什么现有 bound 足够。
- 职业任务文案是打印模板交付的一部分：模板标题、按钮、导出/PDF、帮助提示和正式打印件要使用岗位能理解的任务、影响和下一步；不要把 `mapper`、`snapshot`、`DOM`、`payload`、`source noise` 等开发术语直接暴露给业务用户。
- 若打印模板改动触达页面布局、交互态或可访问性，同时使用 `$plush-page-design-governance`；触达字段真源、API、RBAC、schema、Workflow/Fact 时切到 `$plush-domain-boundary-governance`。

## Workflow / 工作流

1. 确认 scope 和现状。
   - 运行 `git -C /Users/simon/projects/plush-toy-erp status --short`，隔离无关 worktree changes。
   - 将任务分类为 source-intent review、template layout、editor interaction、image behavior、mapper / field contract、PDF / print output 或 customer-config boundary。

2. 先理解 source，再匹配像素。
   - 检查 workbook / PDF 结构，不只看截图：sheets / pages、print areas、duplicated upper / lower blocks、hidden rows / columns、merged cells、dimensions、fonts、borders、images 和 page setup。
   - 使用 spreadsheet / PDF tooling 或 bundled libraries 做 source inspection；screenshot 只用于 visual regression，不是唯一 source parser。
   - yoyoosun raw files 成为当前真源前，先运行或引用 `customerSourceManifestCheck.mjs`；输出里报告 unregistered file、checksum drift 或 duplicate-source relationship。
   - real used range、print area 和 drawing anchors 分开检查；styled `max_column` 或 off-table image anchor 只是分类证据，不能直接扩大 / 裁掉模板。
   - 判断一份完整模板在哪里结束。作业指导书里第一个 `备注` / footer 常可作为模板结束线，下面内容可能是 repeated source module。
   - 编码前先拆开 reusable template body、duplicate blocks、sample text、customer data 和 runtime fields。
   - 编码前先拆开 source noise；对比 repeated source blocks、neighboring rows、workbook metadata 和 customer docs，只实现稳定结构，不实现孤立噪点。

3. 映射 source regions 到 plush runtime concepts。
   - Header / company / title / product metadata -> editable 或 mapper-fed draft fields。
   - Detail / material / color / instruction rows -> repeatable row model；源文件编号行暗示重复操作时支持 insert above / below。
   - `裁床` 等 section headings -> 若 runtime 行为相同，作为同一 instruction model 的 section row 或统一 row type。
   - Product images 和 row images -> 只属于 current-window image slots，不替代 business attachments 或 Product Core facts。
   - Remarks / signatures -> template footer / remark area，不是实现下方重复源模块的理由。
   - Extracted images 和 sample row images -> customer asset / sample boundary，并保留 source provenance；runtime uploads 仍是 current-window draft images，不是 customer raw-source archives。
   - Repeated rows -> 一个 shared row model 加 compact samples。行为一致时保留 2-5 条 default rows；只有源行语义不同或首屏预览确实需要时才增加默认样例行。
   - Source-positioned images -> source-aligned runtime slots。例如 header / product cell 里的产品图按源 cell ratio 和 position；行图片进入 eligible row image area；footer / signature image 只有源文件如此放置时才进 footer / signature region。

4. 精确定义 controls。
   - Top / side toolbar buttons 必须对应真实操作：select row、insert above / below、delete row、add image、remove image、clear / blank template、preview PDF、download PDF、print。
   - selected operation row 和 section row 行为一致时，统一 row target model 和 toolbar actions，不保留两套让人困惑的术语。
   - Row / cell selection 不进入 content editing；content editing 不应意外切换 selected target。
   - Printed table / grid cells 里的 editable text 必须铺满单元格，匹配 purchase / processing contract workbench pattern：visible editable layer 覆盖 cell 宽高、继承对齐方式，让整格成为稳定 click / focus target；不要只让 bordered cell 里的小 inline `span` 可编辑。
   - Active editable focus 在 official templates 中统一使用 solid / inset treatment；虚线只保留给 placeholders、image drop zones 或 source / reference aids。row / cell selection 可以独立高亮，但不能像第二套编辑边框。
   - Image upload 应支持任何 eligible instruction row，图片先横向排列，宽度不足时在 cell 内换行。
   - Image slots 必须有明确尺寸。Header / product images 跟随 source cell ratio、source anchor 和 source visual footprint；row images 使用 row image area 内的 bounded thumbnails / cards；footer / end-of-template images 只有源文件或需求定义时才使用 bounded appendix area。多图放不下一行时，在同一行内换行，或按模板合同进入 appendix / new page。
   - 加图不能静默把 row height 压到不可用比例；打印模板优先 bounded image size + row / page growth，不用 hidden overflow 或 distorted aspect ratio。
   - Rich text 必须可逆：能标红就必须能取消标红；bold 不可靠时移除按钮，不展示假能力。

5. 在现有 print workspace path 上实现。
   - 复用 `printWorkspace.js`、`PrintWorkspaceShell`、existing draft / mapper helpers、engineering template data structures、scoped print CSS 和 PDF utilities。
   - editor side padding 可以为了纸面比例收紧，但不能牺牲 toolbar readability 和 paper centering。
   - 修 layout 时不要隐藏或删除正式 docs / source files；只在 runtime template 中排除 duplicate source regions，并写明原因。
   - 约束 runtime cost：images / rows 只 normalize 一次，避免 repeated full-paper remeasure loops；localStorage / window snapshots 保持在现有 print workspace model 内；shared row / image model 足够时，不做 per-customer special branches。
   - 新增 official template 或大改模板时，更新 coverage matrix：source version、template key、mapper / view model、renderer、PDF module guard、interaction coverage 和 known blind spots。

## Validation / 验证要求

- Source screenshot 和 runtime screenshot 要一起用，不能只依赖其中一个。
- 截图调试必须覆盖实际问题状态：给截图或 Playwright artifact 命名，至少覆盖 source baseline、runtime editor、selected target、edit focus、insert above / below 后目标位置，以及必要的 PDF / print 输出；截图发现问题时继续调试到可重复验证通过。
- Layout 验证要检查真实 cell geometry：table width、column ratios、row heights、font size、line height、borders、padding、overflow 和 adjacent boxes。
- Cell editing 要比较 editable layer 与 parent cell 的 bounding box，确认它铺满 printable cell area；除非该 cell 明确是 label-only 或 non-editable，否则 focus / selection highlight 不应暴露一个更小的 inline editor。
- Edit-focus styling 要在浏览器里检查 computed styles：official templates 的 active editable cells 不应混用 dashed 和 solid borders；selection 与 editing focus 要保持视觉区分。
- Image rows 要测试 one image、multiple images、wide image、tall image 和 wrap behavior。
- Fixed / product / static images 要对比 source anchor、display box、aspect ratio 和 nearby cell geometry，不只看图片是否出现。
- Sample rows 要确认重复行使用 compact default sample；长清单行为用 separate fixture / regression 覆盖。
- Row operations 要覆盖 default row、section row、blank row、selected row、insert above / below、delete、add image、remove image 和 edit recovery。
- PDF / print 要确认使用同一份 current paper DOM，editor highlights / toolbars 不进入打印结果。
- 职业任务文案要检查模板标题、按钮、导出/PDF、帮助提示和正式打印件，确认业务用户看到的是岗位任务语言，不是开发者术语。
- Performance / quality 要检查本轮最高风险 bound：image count / size、DOM node growth、localStorage snapshot size、image load 后 layout settling、无 repeated measurement loop、编辑区域无明显 lag。
- Source provenance 输出 manifest / checksum 结果、workbook / PDF 结构证据、real used range decision，涉及图片时输出 image-anchor provenance。
- Official template coverage 要确认 `printTemplates.mjs`、server PDF module gate、docs、tests / L1 scenario 和 blind-spot notes 对齐。
- Skill-only / docs-only changes 要运行 skill validator、YAML parse、metadata scan、`git diff --check`，并更新 `progress.md`。
- Runtime implementation changes 按 plush docs 和 touched files 选择检查；page / style work 通常需要相关 `style:l1` browser-level regression。

## Output / 输出要求

使用本 skill 后，回答必须报告：

- Source intent：实现的 template body、排除的 duplicates，以及 sample / customer / runtime split。
- Sample policy：默认代表行数量、为什么源文件额外行不进入 sample data、长清单行为由什么验证。
- Source provenance：manifest entry、checksum / version status、structuredExtract policy、workbook / sheet / page baseline 和 extracted asset provenance。
- Source noise：排除的 scan / screenshot / Excel artifacts、suspected incidental marks，以及仍需客户确认的不确定区域。
- Files changed，并说明 customer-specific data 是否保持在 Product Core 外。
- Toolbar、row / image / rich-text、whole-cell editor 和 focus behavior：哪些已实现，哪些是有意移除。
- Career-facing copy：模板标题、按钮、导出/PDF 和帮助提示是否使用岗位语言；若保留技术词，说明原因和读者。
- Image policy：source anchor / box、header / row / footer / static slot size、source-proportional visual footprint、per-row image limit、wrap strategy、row-height behavior，以及图片是 current-window drafts 还是 customer sample assets。
- Source-vs-runtime visual evidence、DOM / box checks、automated tests 和 PDF / print checks。
- Performance / quality evidence 与 remaining blind spots：image / DOM / snapshot bounds、layout-settling behavior，以及是否有 broader stress test 留到后续。
- Coverage matrix status：source file、template key、mapper、renderer、PDF module guard、browser / PDF regression、docs entry 和 known blind spots。
- What stayed out of scope：schema、RBAC、Workflow / Fact、business attachments、customer config activation 或 unrelated source documents。
