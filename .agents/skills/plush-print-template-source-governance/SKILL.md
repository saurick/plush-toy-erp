---
name: plush-print-template-source-governance
description: 项目打印模板源文件治理（plush-toy-erp）。Use when Codex implements or reviews plush-toy-erp print templates, print workspaces, customer Excel/PDF/image sources, engineering material detail sheets, color cards, work instructions, purchase/processing contracts, yoyoosun customer print samples, repeated source blocks, source noise, scan artifacts, incidental marks, template source intent, cell layout, image upload behavior, row selection, rich text, PDF/print preview, performance/quality risks, or customer-vs-Product-Core print-template boundaries.
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
- `/Users/simon/projects/plush-toy-erp/docs/product/prototypes/README.md` and the relevant prototype README when UI/prototype intent is involved
- `/Users/simon/projects/plush-toy-erp/docs/customers/<customer-key>/source-manifest.json` and raw source files when the task is customer-specific
- `/Users/simon/projects/plush-toy-erp/scripts/import/customerSourceManifestCheck.mjs` and `scripts/import/README.md` when validating yoyoosun raw source registration, checksum, size, or structured extraction boundaries
- `/Users/simon/projects/plush-toy-erp/config/customers/<customer-key>/README.md` when runtime samples, extracted image assets, or `printTemplateDefaults` are involved
- Current code truth, especially `web/src/erp/pages/PrintCenterPage.jsx`, `web/src/erp/config/printTemplates.mjs`, `web/src/erp/data/engineeringPrintTemplates.mjs`, `web/src/erp/pages/EngineeringPrintWorkspacePage.jsx`, `web/src/erp/utils/engineeringPrintEditor.mjs`, `web/src/erp/utils/printWorkspace.js`, and related print components/styles/tests

## Project Rules / 项目边界

- 当前正式模板包括 `采购合同`、`加工合同`、`物料分析明细表`、`色卡`、`作业指导书`。新增或改变正式模板时，必须同步检查 `fieldRequirements`、`moduleKeys`、`factBoundary: read_snapshot_only` 和服务端 PDF 模块门禁。
- yoyoosun raw sources must go through `docs/customers/yoyoosun/source-manifest.json`: path, sha256, size, media type, source kind, structuredExtract policy, and duplicate group are source-boundary evidence. Do not glob `raw-source-files/*.xlsx` or use a screenshot as the formal source chain.
- 打印输出真源是当前独立打印窗口里的右侧纸面 DOM；左侧字段面板、附件上传条和工具栏只是编辑入口，不是第二套模板。
- 打印模板只读业务快照和当前窗口草稿，不创建、确认、过账或反写采购、委外、生产、库存、质检、出货或财务事实。
- 客户源文件、客户公司名、真实联系人、真实电话、真实签字人、客户图片和原始资料路径不能自动进入 Product Core 默认样例。客户专属内容应留在 `docs/customers/<customer-key>/`、客户配置包、客户打印模板、assets 或交付资料边界。
- 客户源文件里的轻微干扰和噪点不能照着实现：扫描污点、截图边缘、临时批注、手工审阅痕迹、重复拼接缝、Excel 临时辅助行、偶发错位或孤立格式异常，默认先归为 source noise，除非能证明它是稳定模板结构、客户固定要求或可编辑业务元素。
- Excel workbooks may mix print templates, summary sheets, vendor/customer reference data, import-prep clues, hidden helper rows, and styled blank regions. Classify each sheet/region before promoting anything into Product Core or customer config.
- Excel dimensions can be misleading when styles or drawings extend far beyond real content. Compute the real content region and parse drawing/image anchors independently; do not drop an image only because its anchor is outside the text used range.
- Extracted or generated customer assets must retain provenance: workbook path, sheet name, drawing file/id when available, row/column anchor, crop/layout, source dimensions, runtime URL, and whether the asset is a customer sample or editable runtime slot.
- 图片尺寸和位置先按甲方源文件理解：产品图、色卡图、样板图、签章/签名或其他固定图片如果在源文件中有明确单元格、合并区域、坐标框或占位比例，运行时默认应落在同一语义区域并保持接近源文件的视觉尺寸；不能因为实现方便改放到文件末尾、通用上传条或任意缩略图区。
- Product Core 默认样例应使用中性展示值；模板样例文字默认黑色，颜色/加粗是编辑能力，不是默认样式证据。
- Product Core 默认样例不要按甲方长表塞满。若编号作业行、材料行、色卡行或合同明细行行为一致，默认只保留 2-5 条代表行；长清单、分页和性能用 fixture / L1 / PDF 回归覆盖，不靠默认样例复制所有源行。
- 不要为了当前截图补页面私有真源、旧 `business_records` 链路、额外草稿 key、第二套 PDF HTML 或客户硬编码。
- 模板质量同样是交付边界：不要为某个截图堆一批一次性 CSS/JS 补丁、无限 base64 图片快照、整页截图型模板、重复测高循环或第二套隐藏 PDF DOM；优先复用 `printWorkspace.js`、`PrintWorkspaceShell`、工程模板 normalizer、共享图片槽和 scoped CSS。
- Official templates need a coverage matrix equivalent to trade's QA catalog even if it is stored in plush-specific code/docs: template key, source workbook/page, field requirements, mapper, renderer, module gate, image slots, browser/PDF checks, and blind spots.
- Runtime limits are part of correctness. Reuse existing constants such as engineering row/image limits and server PDF payload/concurrency/timeouts; if the task adds a new row/image/vector path, add or justify the corresponding bound.
- 若打印模板改动触达页面布局、交互态或可访问性，同时使用 `$plush-page-design-governance`；触达字段真源、API、RBAC、schema、Workflow/Fact 时切到 `$plush-domain-boundary-governance`。

## Workflow / 工作流

1. Confirm scope and existing state.
   - Run `git -C /Users/simon/projects/plush-toy-erp status --short` and isolate unrelated worktree changes.
   - Classify the task as source-intent review, template layout, editor interaction, image behavior, mapper/field contract, PDF/print output, or customer-config boundary.

2. Understand the source before matching pixels.
   - Inspect workbook/PDF structure, not only screenshots: sheets/pages, print areas, duplicated upper/lower blocks, hidden rows/columns, merged cells, dimensions, fonts, borders, images, and page setup.
   - Use spreadsheet/PDF tooling or bundled libraries for source inspection. Use screenshots for visual regression, not as the only source parser.
   - Run or reference `customerSourceManifestCheck.mjs` before treating yoyoosun raw files as current source truth; report any unregistered file, checksum drift, or duplicate-source relationship.
   - Inspect real used range, print area, and drawing anchors separately. A styled `max_column` or off-table image anchor is evidence to classify, not a reason to blindly expand or crop the template.
   - Decide where one complete template ends. For work instructions, the first `备注`/footer can mark the end of one template; content below may be a repeated source module.
   - Separate reusable template body, duplicate blocks, sample text, customer data, and runtime fields before coding.
   - Separate source noise before coding. Compare repeated source blocks, neighboring rows, workbook metadata, and customer docs; implement consistent structure, not isolated noise.

3. Map source regions to plush runtime concepts.
   - Header/company/title/product metadata -> editable or mapper-fed draft fields.
   - Detail/material/color/instruction rows -> repeatable row model with insert above/below where the source's numbered rows imply repeated operations.
   - Section headings such as `裁床` -> either a section row in the same instruction model or a unified row type if the runtime behavior is identical.
   - Product images and row images -> current-window image slots only; they do not replace business attachments or Product Core facts.
   - Remarks/signatures -> template footer/remark area, not a cue to implement duplicated lower source modules.
   - Extracted images and sample row images -> customer asset/sample boundary with source provenance; runtime uploads remain current-window draft images, not customer raw-source archives.
   - Repeated rows -> one shared row model plus compact samples. Keep 2-5 default rows when row behavior is the same; only add more default rows when the source row has distinct semantics or the template's first-screen preview needs it.
   - Source-positioned images -> source-aligned runtime slots. For example, product photos in a header/product cell should use that cell's source ratio and position; row photos belong in the eligible row image area; footer/signature images belong in the footer/signature region only when the source places them there.

4. Define controls exactly.
   - Top/side toolbar buttons must match the real operation: select row, insert above/below, delete row, add image, remove image, clear/blank template, preview PDF, download PDF, print.
   - If a selected operation row and section row should behave the same, unify the row target model and toolbar actions instead of keeping two confusing terms.
   - Row/cell selection must not enter content editing. Content editing must not accidentally switch selected target.
   - Image upload should work for any eligible instruction row, place images horizontally first, and wrap inside the cell when width is exhausted.
   - Image slots need explicit sizing. Header/product images follow the source cell ratio, source anchor, and source visual footprint; row images use bounded thumbnails/cards inside the row image area; footer/end-of-template images use bounded appendix areas only when the source or requirement defines that region. If more images do not fit in one line, wrap within the same row or move to an appendix/new page according to the template contract.
   - Adding images must not silently shrink row height below usable proportions. For print templates, prefer bounded image size plus row/page growth over hidden overflow or distorted aspect ratio.
   - Rich text should be reversible. If red can be toggled on, it must be toggled off. Remove unreliable bold controls rather than showing a non-working button.

5. Implement on the existing print workspace path.
   - Reuse `printWorkspace.js`, `PrintWorkspaceShell`, existing draft/mapper helpers, engineering template data structures, scoped print CSS, and PDF utilities.
   - Keep editor side padding tight enough for paper scale, but preserve toolbar readability and paper centering.
   - Do not hide or delete formal docs/source files while fixing layout; only exclude duplicate source regions in the runtime template with a documented reason.
   - Bound runtime cost: normalize images and rows once, avoid repeated full-paper remeasure loops, keep localStorage/window snapshots within the existing print workspace model, and avoid per-customer special branches when a shared row/image model fits.
   - For a new official template or major template rewrite, update the template coverage matrix: source version, template key, mapper/view model, renderer, PDF module guard, interaction coverage, and known blind spots.

## Validation / 验证要求

- Use source screenshots and runtime screenshots together; do not rely on either alone.
- For layout, check actual cell geometry: table width, column ratios, row heights, font size, line height, borders, padding, overflow, and adjacent boxes.
- For image rows, test one image, multiple images, wide image, tall image, and wrap behavior.
- For fixed/product/static images, compare source anchor, display box, aspect ratio, and nearby cell geometry against the runtime paper, not just whether an image appears.
- For sample rows, confirm repeated rows use a compact default sample and that long-list behavior is covered by a separate fixture/regression when needed.
- For row operations, test default row, section row, blank row, selected row, insert above/below, delete, add image, remove image, and recovery after editing.
- For PDF/print, confirm the same current paper DOM is used and editor highlights/toolbars do not print.
- For performance/quality, check the highest-risk bound for the task: image count/size, DOM node growth, localStorage snapshot size, layout settling after image load, no repeated measurement loop, and no visible interaction lag in the edited area.
- For source provenance, include the manifest/checksum result, workbook/PDF structure evidence, real used range decision, and image-anchor provenance when images are involved.
- For official template coverage, confirm `printTemplates.mjs`, server PDF module gate, docs, tests/L1 scenario, and blind-spot notes remain aligned.
- For skill-only/docs-only changes, run skill validator, YAML parse, metadata scan, `git diff --check`, and update `progress.md`.
- For runtime implementation changes, choose checks from plush docs and affected files; page/style work normally requires browser-level regression such as the relevant `style:l1` scenario.

## Output / 输出要求

When answering after using this skill, report:

- Source intent: implemented template body, excluded duplicates, sample/customer/runtime split.
- Sample policy: default representative row count, why source extra rows are excluded from sample data, and what validates long-list behavior.
- Source provenance: manifest entry, checksum/version status, structuredExtract policy, workbook/sheet/page baseline, and extracted asset provenance.
- Source noise: excluded scan/screenshot/Excel artifacts, suspected incidental marks, and any uncertain areas that still need customer confirmation.
- Files changed and whether customer-specific data stayed outside Product Core.
- Toolbar and row/image/rich-text behavior implemented or intentionally removed.
- Image policy: source anchor/box, header/row/footer/static slot size, source-proportional visual footprint, per-row image limit, wrap strategy, row-height behavior, and whether images remain current-window drafts or customer sample assets.
- Source-vs-runtime visual evidence, DOM/box checks, automated tests, and PDF/print checks.
- Performance/quality evidence and remaining blind spots: image/DOM/snapshot bounds, layout-settling behavior, and whether any broader stress test was intentionally left out.
- Coverage matrix status: source file, template key, mapper, renderer, PDF module guard, browser/PDF regression, docs entry, and known blind spots.
- What stayed out of scope: schema, RBAC, Workflow/Fact, business attachments, customer config activation, or unrelated source documents.
