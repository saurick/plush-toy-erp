# progress archive 2026-07-06 before color card padding

归档来源：/Users/simon/projects/plush-toy-erp/progress.md
归档范围：2026-07-05 作业指导书 Sheet1 行高比例接入至 2026-07-05 作业指导书默认黑字与居中纠偏等长流水。

## 2026-07-05 作业指导书 Sheet1 行高比例接入

完成：继续按 `docs/customers/yoyoosun/raw-source-files/26204#抱抱猴子材料明细表2026-4-10.xlsx` 的 `Sheet1` 前页行高复核，补齐作业指导书表头 1-6 行、裁床标题 / 明细行、刺绣标题 / 明细行、车缝提示行和前 8 个作业步骤行的 `heightMm` 数据。纸面渲染改为用 `--work-instruction-row-height` / `--instruction-row-min-height` 驱动单元格高度，修正了旧 CSS 选择器 `.erp-work-instruction-paper__step-row` 不命中真实 `--text / --image` 作业行的问题。段落行从历史字符串兼容升级为 `{ text, heightMm }`，插入段落行时生成空白对象且不复制样例 Excel 行高；空白模板仍保留版式骨架但不带样例高度。L1 新增 DOM 断言：表头 6 行均为 `8.5mm`，裁床标题 `6.4mm`，裁床三行 `7.1mm / 10.8mm / 11.1mm`，刺绣行 `5mm`，车缝提示 `14.8mm`，首个作业步骤 `11.6mm`，并用 `getBoundingClientRect()` 确认这些变量实际影响浏览器行盒尺寸。第 18 行大图测量行仍保持 `216mm / 190mm`，最新实测行高 `719.109px`。

下一步：继续逼近图 1 / 图 2 仍需要实现真实 Excel 嵌入照片来源、shape / arrow / text box 导入或可编辑标注层，以及 Sheet1 多页重复表头 / 分页块结构；这些不是本轮行高接入范围。

阻塞/风险：本轮只改工程打印前端模板数据、编辑器段落行模型、纸面渲染、样式和 L1 回归，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片 / 形状持久化、客户配置或业务来源带值。最新 L1 证据见 `web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-row18-measurement-metrics-latest.json`、`web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-row18-measurement-row-latest.png`、`web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-row18-measurement-images-latest.png`。已通过 `/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`/usr/local/bin/pnpm --dir web build`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web lint`、`/usr/local/bin/pnpm --dir web test`、`git diff --check`；全量前端测试为 617 pass。

## 2026-07-05 作业指导书 Sheet1 多页块补齐

完成：继续用 bundled Python / openpyxl 只读复核 `Sheet1` A:I，确认原 Excel 不是单页，而是头部车缝、身体车缝、身体手工、头部手工四个重复页块。默认作业指导书样例新增 `continuationPages`，补齐身体车缝 20 个作业行、身体手工 3 个作业行和头部手工 3 个作业行，并按 Sheet1 行高写入 `heightMm`；其中身体车缝第 18 行继续保持 `216mm / 190mm` 大图测量行，身体手工第 2 行按原 Excel 大图行写入 `143.9mm`。纸面渲染新增只读续页表，复用 A:I colgroup、表头、notice、作业行、备注、批注线和图片槽样式，作业指导书纸面允许纵向 visible，续页表使用 `break-before: page` / `page-break-before: always`，避免后续表被父容器裁掉。L1 回归已升级为断言 4 张 A:I 表、3 张续页、每张 9 列、续页无按钮、身体车缝 20 行、身体 / 头部手工页各 3 行、续页分页样式和关键行高变量。

下一步：继续逼近“一模一样”仍需要把多页续页从只读样例推进到完整可编辑模型：续页作业行选择、插行、图片上传 / 清空、字段面板映射和保存路径都需要泛化；真实 Excel 嵌入照片、shape / arrow / text box 导入或可编辑标注层仍未实现。

阻塞/风险：本轮只改工程打印前端模板数据、只读续页渲染、样式和 L1 回归，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片 / 形状持久化、客户配置或业务来源带值。续页内容是中性样例文本，不把 raw 客户照片硬编码进 Product Core 默认模板；空白模板显式 `continuationPages: []`，不会把客户样例续页当空白业务事实。最新 L1 指标见 `web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-multipage-grid-metrics-latest.json`，续页截图辅助见 `web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-continuation-body-sewing-latest.png`。已通过 `/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`/usr/local/bin/pnpm --dir web build`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web lint`、`/usr/local/bin/pnpm --dir web test`、`git diff --check`；全量前端测试为 618 pass。

## 2026-07-05 作业指导书续页编号行交互接入

完成：把作业指导书编号行选择从首页 `rowIndex` 泛化为 `{ pageIndex, rowIndex }` 目标，首页和续页共用顶部“上插 / 下插 / 移除 / 给当前行加图 / 清空当前行图片”工具栏。续页作业行现在可在纸面内编辑行号、正文和左右图片批注；多图上传、清空图片、批注线和说明框都复用同一套行更新路径，纸面行内仍不显示加图或删除按钮。编辑器工具函数新增续页插行 / 移除行，新增空白行不复制 Excel 样例行高、图片、批注线或说明框，并只在当前续页内重新编号。L1 回归新增续页选择、续页下插 / 移除、续页大图行 4 图上传、横向换行、`216mm` 大行高、顶部清空图片和纸面按钮 0 的断言。

下一步：继续逼近“一模一样”还剩真实 Excel 嵌入照片导入 / 持久化、Excel shape / arrow / text box 导入或可编辑标注层，以及续页行在左侧字段面板里的批量编辑映射；这些仍需要单独做图片 / 形状来源与保存边界评审。

阻塞/风险：本轮仍只改工程打印前端工作台、编辑器工具函数、L1 回归和进度记录，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片 / 形状持久化、客户配置或业务来源带值。续页截图辅助见 `web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-continuation-body-sewing-latest.png`，第 18 行大图截图见 `web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-row18-measurement-row-latest.png`。已通过 `/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web lint`、`/usr/local/bin/pnpm --dir web css`、`/usr/local/bin/pnpm --dir web build`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web test`、`git diff --check`；全量前端测试为 619 pass。

## 2026-07-05 作业指导书字体比例与 Sheet1 形状来源复核

完成：继续按 `docs/customers/yoyoosun/raw-source-files/26204#抱抱猴子材料明细表2026-4-10.xlsx` 复核作业指导书，确认实际名为 `Sheet1` 的表对应 `xl/worksheets/sheet4.xml`，不是 workbook 的第一个 sheet。用 bundled Python 只读解析 `sheet4.xml`、`styles.xml` 和 `drawing4.xml`，抽取到作业指导书字号比例：公司 / 标题 16pt、表头字段 12pt、段落标题 14pt、步骤正文 10-11pt、序号 / 备注 12pt、notice 9pt；运行态 CSS 已按该比例映射到宋体像素字号，并把 L1 回归补强为读取 computed font-size 后断言这些比例。同步抽取 drawing anchors 和 workbook media 到 ignored output evidence，用于后续图片 / shape 专项复核；默认 Product Core 样例仍不硬编码 raw 客户照片。

下一步：继续逼近“一模一样”还剩真实 Excel 嵌入照片导入 / 持久化、Excel shape / arrow / text box 导入或可编辑标注层，以及续页行在左侧字段面板里的批量编辑映射；这些仍需要单独做图片 / 形状来源与保存边界评审。

阻塞/风险：本轮只改工程打印前端字号样式、L1 浏览器回归和进度归档记录，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片 / 形状持久化、客户配置或业务来源带值。最新 L1 指标见 `web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-multipage-grid-metrics-latest.json`，截图辅助见 `web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-row18-measurement-row-latest.png`、`web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-continuation-body-sewing-latest.png`。已通过 `/usr/local/bin/pnpm --dir web css`、`/usr/local/bin/pnpm --dir web lint`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web build`、`/usr/local/bin/pnpm --dir web test`；全量前端测试为 619 pass。

## 2026-07-05 作业指导书续页字段面板接入

完成：把左侧“当前记录字段（可编辑）”里的作业指导书行字段从首页专用映射改为首页 / 续页共用映射。现在首页作业行和每个续页作业行都会在左侧字段表里暴露行号、内容；已有左右图片批注的行也暴露对应批注字段，并复用同一套 `updateInstructionRowValue` 目标更新路径。L1 浏览器回归新增搜索 `续页 1 作业行 2 内容`、从左侧 textarea 修改内容、断言右侧续页纸面第 2 行同步更新，避免续页继续停留在“只可纸面局部编辑”的半闭环状态。

下一步：继续逼近“一模一样”还剩真实 Excel 嵌入照片导入 / 持久化、Excel shape / arrow / text box 导入或可编辑标注层；后续若要把续页 header、notice、裁床 / 刺绣段落也纳入左侧批量编辑，需要再按字段量和页面密度评估分组方式。

阻塞/风险：本轮只改工程打印前端字段面板映射、作业指导书页面组件和 L1 回归，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片 / 形状持久化、客户配置或业务来源带值。最新 L1 指标见 `web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-multipage-grid-metrics-latest.json`，截图辅助见 `web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-continuation-body-sewing-latest.png`。已通过 `node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web lint`、`/usr/local/bin/pnpm --dir web build`、`/usr/local/bin/pnpm --dir web test`；全量前端测试为 619 pass。

## 2026-07-05 作业指导书图片标注层可编辑接入

完成：把作业指导书已有 `imageLabels` 说明框和 `imageCallouts` 连线 / 箭头从“默认样例只读展示”推进为左侧字段面板可编辑。现在带标注的作业行会在左侧字段表里暴露说明框文案、X / Y / 宽度，以及连线 X1 / Y1 / X2 / Y2；更新时复用同一套作业行目标路径，并对坐标做 0-100、宽度 8-42 的边界归一。L1 浏览器回归新增第 18 行多图后从左侧修改蓝底说明框文案、说明框 X 坐标和第 2 条连线 X2 坐标，再断言右侧纸面的说明框文本、`left: 42%` 和 SVG `x2=62` 同步生效；最新截图 `work-instruction-row18-measurement-row-latest.png` 已显示更新后的说明框。

下一步：继续逼近“一模一样”仍需要真实 Excel 嵌入照片导入 / 持久化，以及从 `drawing4.xml` 自动导入 shape / arrow / text box 到上述可编辑标注模型；当前只是让已承载的标注层能编辑，不等于已经完整解析 Excel shapes。

阻塞/风险：本轮只改工程打印前端标注字段映射、作业指导书页面组件和 L1 回归，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化、客户配置或业务来源带值，也没有把 raw 客户照片硬编码进 Product Core 默认模板。最新 L1 截图见 `web/output/playwright/style-l1/engineering-work-instruction-review/runtime/work-instruction-row18-measurement-row-latest.png`。已通过 `node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web lint`、`/usr/local/bin/pnpm --dir web build`、`/usr/local/bin/pnpm --dir web test`；全量前端测试为 619 pass。

## 2026-07-05 作业指导书续页页眉图片同步

完成：继续按 `Sheet1` 的 `drawing4.xml` 锚点复核作业指导书页眉图，确认同一页眉图片在四张 A:I 页块重复出现。运行态改为把左侧上传的作业指导书页眉产品图从首页传递给每个续页页眉图片格，续页不再渲染空白图片槽；纸面图片格仍不显示上传 / 清空按钮，图片管理继续收口在左侧上传栏和顶部 / 左侧工具区。L1 浏览器回归同步升级为空态检查 4 个页眉图片格均为空、上传后 4 张 Sheet 的页眉格各显示 1 张图，并继续断言纸面图片按钮数为 0。

下一步：继续逼近“一模一样”仍需要真实 Excel 嵌入照片导入 / 持久化，以及从 `drawing4.xml` 自动导入 shape / arrow / text box 到可编辑标注模型；本轮只同步用户上传后的页眉图，不把 raw 客户照片硬编码进 Product Core 默认模板。

阻塞/风险：本轮只改工程打印前端作业指导书续页页眉图片数据流和 L1 回归，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化、客户配置或业务来源带值。已通过 `node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web lint`、`/usr/local/bin/pnpm --dir web build`、`/usr/local/bin/pnpm --dir web test`、`git diff --check`；全量前端测试为 619 pass。

## 2026-07-05 作业指导书 yoyoosun Sheet1 图片资产样例接入

完成：继续按 `docs/customers/yoyoosun/raw-source-files/26204#抱抱猴子材料明细表2026-4-10.xlsx` 的 `Sheet1` / `drawing4.xml` 复核作业指导书图片来源，确认当前 workbook 的 Sheet1 对应 `xl/worksheets/sheet4.xml`。从 workbook media 中按当前页面缺口抽取页眉产品图、头眼鼻步骤图、身体车缝测量图和身体手工大图，放入 `config/customers/yoyoosun/assets/engineering-work-instruction/sheet1/`，并通过 `customer-config.example.js` 的 `engineeringPrintSamples["engineering-work-instruction"]` 作为 yoyoosun 客户样例配置接入。工程打印工作台新增运行时客户样例读取：只在 fresh / fallback 默认稿中按 URL 覆盖作业指导书图片槽，不覆盖已有本地草稿或业务输入稿；Product Core 默认模板仍保持中性，不把 raw 客户图片硬编码进通用默认。作业指导书页眉图片格高度从 `38mm` 调整为 `47mm`，更贴近原 Excel 6 行页眉图片占位比例。L1 新增 `engineering-print-workspace-yoyoosun-sheet1-assets`，通过拦截 `/customer-config.js` 和 `/customer-assets/yoyoosun/**` 验证 4 张 Sheet 页眉图、首页第 3 行图片、续页第 18 行 4 张图片换行、大图行高度、身体手工大图、纸面内图片按钮为 0、无横向溢出。

下一步：继续逼近“一模一样”仍需要把 `drawing4.xml` 里的 shape / arrow / text box 自动导入到现有可编辑标注层，并评审图片 / 形状持久化边界；当前是从原 Excel 机械抽取图片资产并通过客户配置映射，不是完整 Excel 自动导入器。

阻塞/风险：本轮只改 yoyoosun 客户配置样例、客户资产、工程打印前端样例应用、样式高度、单测、L1 回归和客户配置 README，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端或真实业务附件归档。最新 L1 截图见 `web/output/playwright/style-l1/engineering-print-workspace-yoyoosun-sheet1-assets.png`。已通过 `node --check web/src/erp/data/engineeringPrintTemplates.mjs && node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web lint`、`/usr/local/bin/pnpm --dir web css`、`/usr/local/bin/pnpm --dir web build`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons,engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web test`、`git diff --check`；全量前端测试为 620 pass。

## 2026-07-05 作业指导书 yoyoosun Sheet1 文本与缺失车缝单元格接入

完成：继续对照 `Sheet1` 的 `sheet4.xml`、单元格文本和 `drawing4.xml`，确认当前 fresh 预览虽然已有图片，但仍显示大量中性样例字段，且 Excel 车缝标题后的编号说明行缺失。工程打印作业指导书模型新增 `sewingTitleHeightMm` 和 `sewingIntroRows`，纸面渲染改为“车缝标题行 / 编号说明行 / 注释行”三段，左侧字段面板也暴露 `车缝说明行`，段落插入 / 移除继续复用顶部“选择段落行”工具栏。`customer-config.example.js` 的 yoyoosun `engineeringPrintSamples["engineering-work-instruction"]` 新增 `draftPatch`，在 fresh / fallback 样例预览中覆盖公司、产品编号、工序、制表、设计师、产品名称、裁床 / 刺绣 / 车缝说明、首页 8 个作业行、身体车缝 20 行、身体手工 3 行、头部手工 3 行和关键标注文案；Product Core 默认模板仍不写入永绅公司名、raw 客户照片或客户作业文本。L1 yoyoosun 场景已升级为同时断言图片和文本：永绅公司名、猴子抱抱-头 / 身体、车缝针型号、缺失的“止口必须一致”说明行、首页第 3 行打眼/打鼻文本框、身体车缝定肩带行、身体手工订按扣行、4 图换行、大图行高度和纸面图片按钮为 0。

下一步：继续逼近“一模一样”还需要把 `drawing4.xml` 里的 shape / arrow / text box 坐标自动转换成当前 `imageLabels / imageCallouts` 标注模型，并评审图片 / 形状的真实持久化边界；当前 `draftPatch` 是客户样例覆盖，不是完整 Excel 自动导入器。

阻塞/风险：本轮只改工程打印前端模型、纸面渲染、yoyoosun 客户样例配置、客户配置 README、单测、L1 回归和进度记录，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端或业务附件归档。最新截图见 `web/output/playwright/style-l1/engineering-print-workspace-yoyoosun-sheet1-assets.png`。已通过 `node --check web/src/erp/data/engineeringPrintTemplates.mjs`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons,engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web lint`、`/usr/local/bin/pnpm --dir web css`、`/usr/local/bin/pnpm --dir web build`、`/usr/local/bin/pnpm --dir web test`；全量前端测试为 620 pass。

## 2026-07-05 作业指导书编辑舞台留白收窄

完成：复核当前运行态截图后确认工程打印工作台虽已把 `.erp-print-shell__stage-wrap` 设为左对齐，但 `.erp-engineering-print-paper` 基础规则仍是 `margin: 0 auto`，导致纸面在宽舞台中继续居中，左侧出现大块灰色空白。新增工程打印工作台作用域覆盖 `.erp-engineering-print-workspace-shell .erp-engineering-print-paper { margin: 0; }`，只影响工程打印工作台，不改采购 / 加工合同等其它打印纸面。L1 yoyoosun 场景新增 DOM 断言：纸面 computed `margin-left / margin-right` 均为 `0px`，纸面左边距舞台左边不超过 `16px`，并继续断言无横向溢出、行内图片按钮为 0、4 图换行和 Sheet1 文本 / 图片样例都存在。用 `soffice` 把原 Excel 转为 PDF，并定位 PDF 第 8 页为目标作业指导书第一页，抽取源截图 `output/playwright/style-l1/source-excel/sheet1-work-instruction-page1.png`；当前实现截图继续输出到 `web/output/playwright/style-l1/engineering-print-workspace-yoyoosun-sheet1-assets.png`。

下一步：继续逼近“一模一样”仍需要把 `drawing4.xml` 中的 shape / arrow / text box 自动转换为 `imageLabels / imageCallouts`，并继续按源 Excel 第 8 / 9 / 12 / 13 页和运行态截图复核单元格高度、标注位置和多页分页差距。

阻塞/风险：本轮只改工程打印工作台 CSS 和 L1 回归断言，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、客户配置、图片持久化或业务附件归档。已通过 `node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons,engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web build`。

## 2026-07-05 作业指导书 Sheet1 红字与纸面编辑提示清理

完成：继续对照用户图 1 / 图 2 和 `docs/customers/yoyoosun/raw-source-files/26204#抱抱猴子材料明细表2026-4-10.xlsx` 的 `Sheet1`，把首页车缝注释行、作业行 2、作业行 3 左右说明框、作业行 7，以及身体续页车缝注释行 / 作业行 19 中可确认的红色加粗片段写入 yoyoosun `engineeringPrintSamples["engineering-work-instruction"]` 的 rich text 样例。纸面渲染继续复用顶部 / 左侧的行选择与加图 / 清图操作，移除作业指导书纸面图片单元格里的“已上传 N 张”编辑状态文案，并删除对应无用 CSS，避免打印纸面出现非 Excel 单元格内容。L1 yoyoosun 场景新增断言：红字加粗片段至少包含车缝止口、面部打好折、不能压毛、请参照样板、拨毛车；行 2 / 行 7 computed color 为 `rgb(255, 0, 0)` 且字重 >= 700；纸面图片操作按钮数和“已上传”状态文案数均为 0。

下一步：继续逼近“一模一样”仍需要把 `drawing4.xml` 中的 shape / arrow / text box 坐标自动转换为 `imageLabels / imageCallouts`，并按 Sheet1 多页截图继续微调标注位置、图片裁切 / contain 策略和分页差距；当前客户样例已覆盖确定红字和图片资产，但不是完整 Excel 自动导入器。

阻塞/风险：本轮只改 yoyoosun 客户样例配置、作业指导书纸面图片状态文案、工程打印 CSS、单测、L1 回归和进度记录，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化或业务附件归档。最新实现截图见 `web/output/playwright/style-l1/engineering-print-workspace-yoyoosun-sheet1-assets.png`，源 Excel 对照截图见 `output/playwright/style-l1/source-excel/sheet1-work-instruction-page1.png`。已通过 `node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons,engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web build`、`/usr/local/bin/pnpm --dir web test`；全量前端测试为 620 pass。

## 2026-07-05 作业指导书 Sheet1 图片 crop 与第 3 行 shape 尺寸收口

完成：继续解析 `Sheet1` 对应的 `xl/drawings/drawing4.xml`，确认页眉产品图、首页作业行 3 眼鼻参考图、身体作业行 18 多图和手工大图都带 `a:srcRect` crop 信息，旧实现只使用原始 media 会导致图片内容窗口和 Excel 不一致。工程打印图片快照新增 `crop` 展示元数据，运行时客户样例和作业行图片 normalizer 均保留该字段；`ImageSlot` 在存在 crop 时按 Excel srcRect 计算图片绝对定位和缩放，没有 crop 的用户上传图片继续走原 contain 行为。yoyoosun 样例接入从 `drawing4.xml` 抽取的 crop 数值，并把第 3 行 annotation layout 的中间图片槽调到接近原 shape 的 `55.5mm × 47.6mm`，右侧说明框按原 Excel 段落补 `<br>` 分段。L1 yoyoosun 场景新增 DOM 断言：页眉图、第 3 行图、第 18 行首图均带 `data-image-crop="excel-src-rect"`，第 3 行图 crop left/top 为 `3.395 / 26.558`，裁切后图片 width/height 放大比例符合 srcRect，第 3 行图片槽浏览器尺寸约 210px × 180px。

下一步：继续逼近“一模一样”仍需把 `drawing4.xml` 中的 callout shape 几何（wedgeRectCallout 的 adj、蓝色箭头 / 标注框坐标）自动转换为当前 `imageLabels / imageCallouts`，并按 Sheet1 第 9 / 12 / 13 页继续比对续页图片位置和分页。

阻塞/风险：本轮只改工程打印前端图片展示元数据、yoyoosun 客户样例 crop 配置、作业指导书 CSS、单测、L1 回归和进度记录，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化或业务附件归档。最新实现截图见 `web/output/playwright/style-l1/engineering-print-workspace-yoyoosun-sheet1-assets.png`。已通过 `node --check web/src/erp/data/engineeringPrintTemplates.mjs`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons,engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web build`、`/usr/local/bin/pnpm --dir web test`；全量前端测试为 620 pass。

## 2026-07-05 作业指导书 Sheet1 第 18 行组合图定位布局收口

完成：继续对照用户图 2 和 `Sheet1` 原 Excel 截图复核身体续页第 18 行，确认第 18 行源文件不是普通等宽图片流，而是按 Excel shape 位置摆放的组合图片区；旧实现把多张图片等宽换行并叠加说明框，导致蓝底误图、重复标注和比例偏差。工程打印图片快照新增可选 `layout` 元数据，运行时客户样例和 normalizer 保留该字段；纸面渲染只在图片自身带 `layout` 时使用绝对定位布局，没有 `layout` 的用户上传多图继续走 `flex-wrap` 换行。yoyoosun 第 18 行改为直接使用 workbook 提取出的两张组合图：`body-snap-measure-a.png` 裁掉源截图未显示的底部横尺区域，`body-snap-measure-b.png` 保留爪尖和充电口组合区；不再额外叠加重复说明框 / callout，也移除定位组合图的纸面槽边框。L1 yoyoosun 场景新增输出 `web/output/playwright/style-l1/engineering-work-instruction-review/yoyoosun-sheet1/yoyoosun-sheet1-row18-latest.png`、续页整页截图和 metrics JSON，并断言第 18 行使用 2 张 yoyoosun 组合图、定位坐标、crop bottom、纸面按钮为 0；同时保留 row-buttons 场景断言普通上传 4 张图仍自动换行。

下一步：继续逼近“一模一样”仍需按 Sheet1 第 9 / 12 / 13 页继续复核其它续页组合图位置、分页和行高；若后续要让用户编辑 Excel 内嵌组合图里的箭头 / 说明框，需要先评审是否从图片资产升级为可编辑 shape 模型，避免把组合图和可编辑标注双轨混用。

阻塞/风险：本轮只改工程打印前端图片布局元数据、yoyoosun 客户样例配置、作业指导书 CSS、L1 回归和进度记录，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化或业务附件归档。`node --check` 不能直接检查 `.jsx` 扩展，JSX 语法由 Vite build 覆盖。已通过 `node --check config/customers/yoyoosun/customer-config.example.js`、`node --check web/src/erp/data/engineeringPrintTemplates.mjs`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons,engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web build`、`/usr/local/bin/pnpm --dir web test`、`git diff --check`；全量前端测试为 620 pass。

## 2026-07-05 作业指导书 Sheet1 身体车缝分页拆分

完成：继续对照源 Excel `Sheet1` 第 9 页和当前 runtime 截图，确认旧 yoyoosun 样例把“猴子抱抱-身体”车缝 1-20 行放进同一张 sheet，运行态高度达到约 2131px，和源 Excel 第 9 页只承载身体车缝 1-12 行的分页不一致。已把 yoyoosun `engineeringPrintSamples["engineering-work-instruction"]` 的身体车缝样例拆为两张 sheet：第 1 张保留裁床 / 刺绣 / 车缝标题、车缝说明和 1-12 行；第 2 张承载 13-20 行以及第 18 行组合图片区。第 18 行图片 assignment 从旧 `pageIndex: 0,rowIndex: 17` 改为新 `pageIndex: 1,rowIndex: 5`，身体手工大图 assignment 顺延到 `pageIndex: 2,rowIndex: 1`。L1 yoyoosun 场景同步升级为 5 张 sheet，新增每页截图输出 `web/output/playwright/style-l1/engineering-work-instruction-review/yoyoosun-sheet1/yoyoosun-sheet1-sheet-01-latest.png` 至 `...sheet-05-latest.png`，并在 metrics 中记录每页产品名、作业行数、图片行数和高度；断言身体车缝第 1 页为 12 行 / 0 图片行，第 2 页为 8 行 / 1 图片行。

下一步：继续按源 Excel 后续页复核第 13-20 行所在页的顶部截图遮挡、页眉重复策略、备注行位置和第 18 行图片区域高度；当前已经把最大分页错误拆开，但还没有宣称所有 Sheet1 页都和 Excel 完全一致。

阻塞/风险：本轮只改 yoyoosun 客户样例分页和 L1 回归证据，不改 Product Core 默认模板、schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化或业务附件归档。逐页截图输出用于人工对照，但长 sheet 的截图仍受浏览器视口限制，后续若要逐行精准复核应继续补行级裁图。已通过 `node --check config/customers/yoyoosun/customer-config.example.js`、`node --check web/scripts/style-l1/scenarios.mjs`、`STYLE_L1_SCENARIOS=engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`。

## 2026-07-05 作业指导书续页空值回填修正

完成：继续对照源 Excel 和当前 yoyoosun runtime 截图，确认身体车缝页右侧“制表 / 设计师 / 审核”值单元格在 Excel 中为空，但前端归一化把显式空字符串当缺失处理，回填成 Product Core 默认样例文案“制表人 / 设计师 / 审核人”。已修正 `normalizeWorkInstructionPage`：续页字段显式提供空字符串时保留为空，只有字段缺失时才使用默认样例；覆盖字段包括公司名、产品编号、工序、部门、制表、设计师、审核、产品名称、车缝标题和备注。同步更新工程打印编辑器单测，验证客户样例续页 `maker / designer / auditor / remark` 的显式空值不会被默认样例污染，并更新第 18 行组合图分页 / layout 合同。L1 yoyoosun metrics 新增 `bodySewingPage1MetaValues`，断言身体车缝第 1 页制表、设计师、审核值单元格均为空；最新截图 `web/output/playwright/style-l1/engineering-work-instruction-review/yoyoosun-sheet1/yoyoosun-sheet1-sheet-02-latest.png` 已显示这三个值格为空。

下一步：继续复核第 13-20 行所在页的页眉重复策略、备注行位置、第 18 行图片区域高度和后续手工页图片/空白格；当前只是修正显式空值残留，不代表整份 Sheet1 已完全一致。

阻塞/风险：本轮只改工程打印作业指导书续页归一化、相关单测、yoyoosun L1 断言和进度记录，不改 Product Core 默认模板、schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化或业务附件归档。已通过 `node --check web/src/erp/data/engineeringPrintTemplates.mjs`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`STYLE_L1_SCENARIOS=engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`。

## 2026-07-05 作业指导书身体车缝强调行字号收口

完成：继续对照源 Excel 第 9 页和最新 runtime 截图，确认 yoyoosun 身体车缝第 2 行应为整行大号红色加粗，第 5 行后半段应为红色加粗；旧实现仍按普通 11pt 行渲染，导致单元格格式与 Excel 明显不一致。已为作业指导书作业行增加 `fontSizePt` 行级字号元数据归一化与渲染 CSS 变量，当前只在 yoyoosun 客户样例第 2 行使用 `24pt -> 32px`，不改变 Product Core 默认模板；第 5 行按源图补局部红色加粗 rich text。空白插入行同步显式保持 `fontSizePt: null`，避免新增行继承样例格式。L1 yoyoosun 场景新增身体车缝第 2 行 / 第 5 行 computed style 断言，metrics 确认第 2 行内容与序号均为 `32px`、红色、700 粗体，第 5 行红字段为红色、700 粗体；最新截图 `web/output/playwright/style-l1/engineering-work-instruction-review/yoyoosun-sheet1/yoyoosun-sheet1-sheet-02-latest.png` 已显示第 2 行大红字和第 5 行局部红字。

下一步：继续对照 Sheet1 后续页复核第 13-20 行所在页、手工页大图、备注行位置、页眉重复策略和 Excel shape / 标注转换；当前只是把第 9 页最明显的强调行格式补齐，不宣称整份 Sheet1 已完全一致。

阻塞/风险：本轮只改工程打印作业指导书行级字号渲染、yoyoosun 客户样例 rich text / 字号配置、相关单测、yoyoosun L1 断言和进度记录，不改 Product Core 默认模板、schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化或业务附件归档。`.jsx` 不能用 `node --check` 直接检查，JSX 语法由 L1/Vite 编译覆盖。已通过 `node --check config/customers/yoyoosun/customer-config.example.js`、`node --check web/src/erp/data/engineeringPrintTemplates.mjs`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`git diff --check`。

## 2026-07-05 作业指导书身体车缝 13-20 行续页结构收口

完成：继续对照用户图 2 和从 `docs/customers/yoyoosun/raw-source-files/26204#抱抱猴子材料明细表2026-4-10.xlsx` 导出的 Sheet1 源图，确认身体车缝 13-20 行是同一张无页眉的作业行区域，不应像旧 runtime 一样先重复页眉再进入第 13 行。作业指导书续页新增 `showHeader:false` 版式元数据；yoyoosun 身体车缝 13-20 行页设置为 body-only，保留同页 13-20 行和第 18 行大图，不改变 Product Core 默认模板。同步补第 15 行后半段红色加粗 rich text，第 19 行红字继续保留。L1 yoyoosun 场景改为断言 5 张 sheet 的页眉图计数为 `[1,1,0,1,1]`，第 3 张 sheet `hasHeader=false / isBodyOnly=true / firstRowNo=13 / rowCount=8 / imageRowCount=1`，并断言第 15 / 19 行 computed color 为 `rgb(255, 0, 0)`、font-weight 为 `700`。最新截图 `web/output/playwright/style-l1/engineering-work-instruction-review/yoyoosun-sheet1/yoyoosun-sheet1-sheet-03-latest.png` 已显示 13-20 行页不再有重复页眉。

下一步：继续对照 Sheet1 手工页和顶部产品图策略；当前仍未完成所有页的 Excel 级一致性，尤其是手工页垂直位置、页眉产品图是否复制、备注行位置以及 shape / 标注自动转换还需要继续复核。

阻塞/风险：本轮只改工程打印续页渲染、yoyoosun 客户样例版式配置、相关 L1 断言和进度记录，不改 Product Core 默认模板、schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化或业务附件归档。已通过 `node --check config/customers/yoyoosun/customer-config.example.js`、`node --check web/src/erp/data/engineeringPrintTemplates.mjs`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`git diff --check`。

## 2026-07-05 作业指导书默认黑字与居中纠偏

完成：根据用户纠偏，作业指导书不再按源 Excel 逐字逐色还原默认文案，而是参考上下两份原文档的共同/差异来做模板结构和图片逻辑；默认样例文字应为黑色，红色/加粗只作为用户选中文字后的编辑能力。已移除 Product Core 默认作业指导书样例和 yoyoosun 客户样例中的默认红色 / 加粗 rich text，并撤掉身体车缝第 2 行 `fontSizePt:24` 特例，恢复常规字号。工程打印作业指导书纸张位置从左贴边恢复为和其他模板一致的居中：stage wrap 使用 `justify-content:center`，paper 继续 `margin:0 auto`。L1 改为断言默认红字 / 默认强强调计数均为 0，身体车缝第 2 行字号为常规 `14.67px / 16px`，并用 `stageLeftGap === stageRightGap`、`stageCenterDelta=0` 验证居中；同时保留 `engineering-print-workspace-row-buttons` 场景验证选中文本后加红 / 加粗仍可用。

下一步：继续围绕“参考上下两份原文档组合模板结构”复核图片上传/多图换行、页眉图策略、手工页位置和 body-only 页结构；不要再把源 Excel 里的红字默认样式当模板默认。

阻塞/风险：本轮只改工程打印作业指导书默认样例、yoyoosun 客户样例、居中 CSS、L1 断言和进度记录，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化或业务附件归档。已通过 `node --check config/customers/yoyoosun/customer-config.example.js`、`node --check web/src/erp/data/engineeringPrintTemplates.mjs`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`git diff --check`。

## 2026-07-05 作业指导书第一个备注后重复模板删除

完成：根据用户最新截图和纠偏，重新确认原 Excel 的 Sheet1 是上下两份同格式作业指导书表拼在一起，当前打印模板应只取第一份“备注”及以上作为一个模板，备注后的“本公司 / 作业指导书 / 身体 / 手工”等内容是重复表块，不应继续作为默认样例渲染。已把 Product Core 默认作业指导书样例的 `continuationPages` 改为空，并把 yoyoosun 客户样例的 `continuationPages` 和续页专用行图绑定删除；页眉图与主表第 3 行图片仍保留。L1 yoyoosun 指标已改为断言 `sheetCount=1`、`continuationSheetCount=0`、无身体/手工重复段，截图继续输出到 `web/output/playwright/style-l1/engineering-work-instruction-review/yoyoosun-sheet1/yoyoosun-sheet1-sheet-01-latest.png`。

下一步：继续按首个模板内部做单元格比例、图片槽、字体和交互复核；后续若要支持用户手动新增第二张作业指导书，应作为显式新页/新模板能力评审，不再把源 Excel 下半段默认带入。

阻塞/风险：本轮只删除默认和 yoyoosun 样例里的重复续页数据，并同步调整单测与 L1 断言；保留通用续页数据结构和显式续页增删单测，也保留顶部选择行后加图、清空当前行图片、多图换行和选中文字加红/加粗能力。不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化或业务附件归档。已通过 `node --check config/customers/yoyoosun/customer-config.example.js && node --check web/src/erp/data/engineeringPrintTemplates.mjs && node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`git diff --check`。

## 2026-07-05 作业指导书 5 行样例与行选择交互收口

完成：根据用户继续纠偏，作业指导书默认样例和 yoyoosun 客户样例只展示首个模板内 5 条普通作业行，所有作业行统一 `11.6mm` 样例行高，不再保留第 3 行批注特例、第 18 行大图特例或默认作业行图片。作业行图片仍通过顶部“给当前行加图 / 清空当前行图片”维护，任意作业行可选中上传，多图先横向排列并在横向装不下时换行。修正选择模式下点击作业行文字会进入 contenteditable 的问题：作业行选择模式现在点击单元格文字会选中整行，不抢编辑焦点。富文本工具删除“文字加粗”，只保留“文字标红/取消”；默认样例仍为黑字，选中已标红文字可再次点击取消红色。

下一步：如果后续要恢复加粗，需要先明确它是否属于必要编辑能力，并补可见字重差异和浏览器回归；当前主路径先保持最少必要文字格式能力。

阻塞/风险：本轮只改工程打印作业指导书前端模板数据、yoyoosun 客户样例、纸面交互和 L1 回归，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化或业务附件归档。打印中心原型仍只是 `To Implement` 骨架，本轮未把运行态细节同步到原型。已通过 `node --check config/customers/yoyoosun/customer-config.example.js`、`node --check web/src/erp/data/engineeringPrintTemplates.mjs`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`、`git diff --check`。

## 2026-07-06 打印模板源文件治理 skill

完成：新增项目 skill `$plush-print-template-source-governance`，把客户 Excel / PDF / 截图到打印模板的主路径收口为“先识别模板本体、重复模块、样例数据、客户专属内容和 runtime 字段，再实现版式、图片槽、行选择、PDF / 打印验证”。同步补充 `.agents/skills/README.md` 和根 `README.md` 的 skill 导航；同时新增全局通用 skill `$erp-print-template-source-governance` 作为跨项目范式。

下一步：后续作业指导书、色卡、物料明细、采购 / 加工合同等打印模板任务，优先用本 skill 与 `$plush-page-design-governance`、`$plush-test-governance` 组合执行，避免再次把源 Excel 的重复下半段或样例文案误当作 runtime 模板。

阻塞/风险：追加前 `progress.md` 为 201 行、51115 字节，未达到 600 行或 80KB 归档阈值。本轮只改 skill、skill 导航和进度记录，不改 runtime、schema、migration、RBAC、Workflow / Fact、PDF 后端、客户配置或源文件。验证覆盖 YAML 解析、metadata 扫描和 `git diff --check`；官方 `quick_validate.py` 后续发现受当前 Python 环境 PyYAML 缺失限制，见后续记录。

## 2026-07-06 打印模板源文件噪点过滤约束

完成：补强全局 `$erp-print-template-source-governance` 和项目 `$plush-print-template-source-governance`，新增 source noise / 噪点过滤门禁：甲方源文件中的扫描污点、截图边缘、临时批注、手工审阅痕迹、重复拼接缝、Excel 临时辅助行、偶发错位或孤立格式异常，默认不得照着实现；只有能证明它是稳定模板结构、客户固定要求或可编辑业务元素时，才进入模板实现。

下一步：后续打印模板任务在截图比对之外，要显式写出哪些内容被当作 signal 实现、哪些被当作 noise 排除、哪些仍需客户确认。

阻塞/风险：追加前 `progress.md` 为 209 行、52280 字节，未达到 600 行或 80KB 归档阈值。本轮只改 skill 和进度记录，不改 runtime、schema、migration、RBAC、Workflow / Fact、PDF 后端、客户配置或源文件。验证覆盖 YAML/metadata 扫描和 `git diff --check`；官方 `quick_validate.py` 后续发现受当前 Python 环境 PyYAML 缺失限制，见后续记录。

## 2026-07-06 打印模板性能和质量治理约束

完成：继续补强全局 `$erp-print-template-source-governance` 和项目 `$plush-print-template-source-governance`，新增打印模板 performance / quality gate：模板实现不仅要像源文件，还要控制 DOM / 图片 / localStorage 快照 / PDF payload / 测高循环成本，避免整页截图型模板、重复测量、一次性 CSS/JS 补丁、第二套隐藏 PDF DOM 或客户私有分支沉淀成长期债。

下一步：后续打印模板任务在验收时除截图比对外，还要报告图片/DOM/snapshot 边界、布局稳定性、最高风险交互回归和未覆盖的性能盲区。

阻塞/风险：追加前 `progress.md` 为 217 行、53304 字节，未达到 600 行或 80KB 归档阈值。本轮只改 skill 和进度记录，不改 runtime、schema、migration、RBAC、Workflow / Fact、PDF 后端、客户配置或源文件。验证覆盖 YAML/metadata 扫描和 `git diff --check`；官方 `quick_validate.py` 后续发现受当前 Python 环境 PyYAML 缺失限制，见后续记录。

## 2026-07-06 打印模板源文件版本链与结构解析治理

完成：继续补强全局 `$erp-print-template-source-governance` 和项目 `$plush-print-template-source-governance`，新增 source tooling / source provenance / coverage matrix 约束：读取 Excel / PDF 源文件时必须使用结构化工具或对应 skill 辅助，不只看截图；yoyoosun 原始文件必须先走 `source-manifest.json` 的 path / sha256 / size / structuredExtract 边界；实现前要识别真实 used range、打印区、重复模块、图片 drawing anchor、客户资产来源和模板覆盖矩阵。同步把图片资产 provenance、工程模板行数 / 图片数 / PDF payload 等性能边界写入项目 skill。

下一步：后续作业指导书、色卡、物料明细、采购 / 加工合同等打印模板任务，输出里要额外报告源文件登记与 checksum 状态、真实内容区判断、图片锚点来源、模板 key / mapper / renderer / PDF 门禁 / L1 或 PDF 回归覆盖，以及仍未覆盖的盲区。

阻塞/风险：追加前 `progress.md` 为 225 行、54302 字节，未达到 600 行或 80KB 归档阈值。本轮只改全局和项目 skill 以及进度记录，不改 runtime、schema、migration、RBAC、Workflow / Fact、PDF 后端、客户配置、客户源文件或图片资产。官方 `quick_validate.py` 因当前 Python 环境缺少 PyYAML 无法直接完成；已读取 validator 逻辑并用 Ruby 做等价 frontmatter 校验，YAML 解析和 metadata 扫描通过。

## 2026-07-06 打印模板样例行与图片槽治理

完成：继续补强全局 `$erp-print-template-source-governance` 和项目 `$plush-print-template-source-governance`，把“甲方源文件很多行但行行为一致时，默认样例只保留 2-5 条代表行”写成明确约束；长清单、分页和性能改由 fixture / L1 / PDF 回归覆盖，不再靠默认样例复制所有源行。同步补充图片导入规则：页眉 / 产品图按源单元格比例，作业行图片按有界缩略图 / 卡片放入行内图片区，页尾 / 文件末尾图片走有界 appendix 区域；多图先横向排列，宽度不够时在同一行内换行，必要时行高或分页增长，禁止隐藏溢出、拉伸变形或无界 base64。

下一步：后续作业指导书、色卡、物料明细等模板任务，要在输出里说明默认代表行数量、为什么源文件额外行不进入样例、哪条回归覆盖长清单，以及每类图片槽的尺寸、数量上限、换行和行高策略。

阻塞/风险：追加前 `progress.md` 为 233 行、55820 字节，未达到 600 行或 80KB 归档阈值。本轮只改全局和项目 skill 以及进度记录，不改 runtime、schema、migration、RBAC、Workflow / Fact、PDF 后端、客户配置、客户源文件或图片资产。官方 `quick_validate.py` 仍因当前 Python 环境缺少 PyYAML 无法直接完成；已用 Ruby 做等价 frontmatter 校验，后续还需继续跑 YAML / metadata / diff 检查。

## 2026-07-06 打印模板图片源位置与源尺寸治理

完成：继续补强全局 `$erp-print-template-source-governance` 和项目 `$plush-print-template-source-governance`，把“图片尺寸和位置先按甲方源文件理解”写成明确约束。产品图、色卡图、样板图、签章/签名或其他固定图片如果在源文件中有单元格、合并区域、坐标框或占位比例，运行时默认落在同一语义区域，并保持接近源文件的视觉尺寸；不能因为实现方便改放到文件末尾、通用上传条或任意缩略图区。动态行内多图仍按有界尺寸、横向优先、宽度不够换行和行高/分页增长治理。

下一步：后续模板实现输出里要说明每类图片槽对应的源 anchor/box、运行时显示尺寸、为什么位置或尺寸有差异，以及产品图 / 行内图 / 页尾图 / 静态签章分别属于当前窗口草稿、客户样例资产还是 source-only evidence。

阻塞/风险：追加前 `progress.md` 为 241 行、57314 字节，未达到 600 行或 80KB 归档阈值。本轮只改全局和项目 skill 以及进度记录，不改 runtime、schema、migration、RBAC、Workflow / Fact、PDF 后端、客户配置、客户源文件或图片资产。官方 `quick_validate.py` 仍因当前 Python 环境缺少 PyYAML 无法直接完成；已用 Ruby 做等价 frontmatter 校验，后续还需继续跑 YAML / metadata / diff 检查。

## 2026-07-06 打印模板治理 skill 审查与提交收口

完成：按 `$plush-code-review-governance` 复核新增的通用 `$erp-print-template-source-governance`、项目 `$plush-print-template-source-governance` 和 `$trade-print-template-source-governance` 三份打印模板治理 skill。审查重点为触发描述、项目版与通用版边界、源文件意图识别、重复模块过滤、噪点过滤、样例行数量、图片源位置/尺寸、性能质量门禁、metadata 和提交范围隔离；未发现需要继续修改的阻断问题。

下一步：后续实际模板实现仍要按对应项目 skill 读取真实 Excel/PDF/截图、源文件 manifest、截图与 DOM/box 证据，不把本次 skill 审查等同于某个具体模板 runtime 已验收。

阻塞/风险：追加前 `progress.md` 为 249 行、59493 字节，未达到 600 行或 80KB 归档阈值。本轮是 skill-only / docs-only 审查与提交收口，不改 runtime、schema、migration、RBAC、Workflow / Fact、PDF 后端、客户配置、源文件或图片资产。官方 `quick_validate.py` 因当前 Python 环境缺少 PyYAML 仍无法直接完成；已用 Ruby 做等价 frontmatter / `agents/openai.yaml` / metadata 校验，并用 `git diff --check` 检查相关 staged 范围。

## 2026-07-06 作业指导书纸面行统一选择交互

完成：按 `$plush-page-design-governance` 收口作业指导书纸面行交互：前端只保留一个“选择行”模式，裁床 / 刺绣 / 车缝说明段落行和编号作业行都可在选中后通过顶部工具栏上插、下插、移除、加图和清空图片。内部仍保留段落区 `sectionKey` 与编号作业行 target 的语义区别，避免把不同模板区域的数据混成一类；但用户可见行为保持一致。段落行新增图片快照数组和稳定 input key，选择模式下点击文字只选中行、不进入编辑态；新增段落行不继承 Excel 样例行高、图片或 `&amp;nbsp;` 转义占位。同步更新作业指导书 L1 场景，使图片 input 定位到目标行内部，覆盖段落行 / 编号行统一上传和横向换行。

下一步：如果后续要继续扩展行级能力，应优先在同一套纸面行 target / toolbar 合同里补，不再恢复“选择作业行 / 选择段落行”两套按钮。加粗功能当前未恢复，文字格式主路径仍是“文字标红 / 取消”。

阻塞/风险：追加前 `progress.md` 为 257 行、60302 字节，未达到 600 行或 80KB 归档阈值。本轮只改工程打印作业指导书前端数据、编辑器工具函数、页面交互和 L1 回归，不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化或业务附件归档。已通过 `node --check web/src/erp/data/engineeringPrintTemplates.mjs && node --check web/src/erp/utils/engineeringPrintEditor.mjs && node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web lint`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`。
