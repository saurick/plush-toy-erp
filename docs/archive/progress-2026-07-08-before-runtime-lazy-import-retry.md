# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md` 至 `docs/archive/progress-2026-07-06-before-color-card-padding.md`：历史过程记录索引见归档文件本身和 git history。
- `docs/archive/progress-2026-07-06-before-print-restore-sample.md`：归档 2026-07-06 工程模板源文件比例、噪点、编辑层、焦点、刷新恢复、分页与作业指导书备注等打印模板长流水，为本轮恢复样例修复前归档。

## 当前活跃事项

- 多甲方角色能力流程编排以 `docs/product/多甲方角色能力流程编排优先级.md` 和 `node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 的 `implementationOrder` 为本地优先级入口；GPT/reference 资料只作输入，当前真源仍回到代码、migration、测试和正式文档。
- 当前审计显示 P0-P4 本地证据为 ready；P5 的 133 内部验证证据已收口到 `deployments/yoyoosun/evidence/releases/2026-07-03/`，`release-evidence-status` 为 `ready`，closeoutSummary 为 `gateVerified=6/6`、`blockers=0`。
- 本次 133 发布验证已完成本地构建镜像、远端 `docker load`、运行时 `.env` 脱敏 preflight、migration before/after、pre-migration backup、隔离恢复 + migration 演练、真实库 migration、业务容器重建、目标 smoke、rollback / forward-fix evidence 和 internal-only sign-off。

## 2026-07-06 打印模板刷新恢复瘦身

完成：按 `$plush-code-review-governance` 和 `$plush-print-template-source-governance` 复盘“无痕模式正常、原浏览器不正常”的实际原因，确认用户侧复现主要来自旧浏览器缓存 / 旧前端 bundle。保留必要的打印工作台主路径和编辑中刷新回归：`state` 工作台 URL、窗口级结构化草稿、`setDraft` 同步持久化、`contenteditable input` / 当前 editable DOM 文本变化写草稿、失焦提交 React 渲染态、页面退出前 blur 当前活动编辑区并 flush 当前 draft、恢复样例同步纸面 DOM；撤掉后续为了追缓存误判追加的 `keyup`、自定义 active-edit flush 事件、刷新快捷键和页面隐藏前置保存兜底。L1 不再模拟 Cmd+R，只验证五套模板从打印中心进入后编辑中直接 reload、结构化草稿保留、刷新后继续编辑和恢复样例清除标记。

下一步：如果后续用户同一浏览器仍报旧行为，先要求硬刷新 / 清站点数据 / 无痕对照，并确认当前页面实际加载的是最新 bundle，再继续定位 runtime；不要在未排除缓存前继续叠加恢复兜底。

阻塞/风险：本轮只做打印模板编辑恢复链路瘦身、L1 断言收敛、打印文档和进度口径修正；不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化、业务附件归档、源 Excel、客户配置激活或模板字段合同。已通过 `git diff --check`、targeted ESLint、33 个 print workspace / engineering editor 单测，以及五模板 `STYLE_L1_SCENARIOS=print-workspace-material-shell-refresh,print-workspace-processing-shell-refresh,print-workspace-engineering-material-detail-shell-refresh,print-workspace-engineering-color-card-shell-refresh,print-workspace-engineering-work-instruction-shell-refresh pnpm style:l1`。

## 2026-07-06 五套打印模板编辑中刷新不丢失

完成：按 `$plush-code-review-governance` 和 `$plush-print-template-source-governance` 排查“五份模板编辑时刷新仍丢失”。当时先按运行时恢复链路处理：右侧 `contentEditable` 原先主要在 `blur` 后才写入结构化草稿，用户保持焦点直接刷新时可能丢失未提交草稿；同时将打印工作台打开与刷新主路径收口为直接可恢复 React 工作台 URL，保留 `state` 和 window state 兼容信息，但不再把地址栏改写到 `/print-window-shell.html`。后续复盘确认用户本机持续复现主要来自旧浏览器缓存 / 旧前端 bundle，因此本条只作为代码侧加固背景，不再作为最终用户侧根因。

下一步：后续新增打印模板时必须接入同一 `usePersistentPrintWorkspaceDraft` 和刷新 L1；如果要重新启用静态 shell 作为编辑主路径，需要先单独评审脚本重放、按钮交互和结构化 draft 同步，不要再让 shell HTML 快照覆盖 React draft。

阻塞/风险：本轮只改打印工作台恢复链路、五套模板编辑持久化、壳页兼容持久化、L1 断言/场景和进度记录；不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化、业务附件归档、源 Excel、客户配置激活或模板字段合同。已通过 `pnpm exec node --test src/erp/utils/printWorkspace.test.mjs src/erp/utils/usePrintWorkspaceWindowSnapshot.test.mjs src/erp/utils/engineeringPrintEditor.test.mjs`、`STYLE_L1_SCENARIOS=print-workspace-material-shell-refresh,print-workspace-processing-shell-refresh,print-workspace-engineering-material-detail-shell-refresh,print-workspace-engineering-color-card-shell-refresh,print-workspace-engineering-work-instruction-shell-refresh pnpm style:l1`。验证覆盖的是五份模板在右侧纸面编辑焦点仍停留时刷新；未覆盖服务端 PDF 生成、业务附件留档和真实客户源文件变更，因为本轮没有触达这些链路。

## 2026-07-06 五套打印模板恢复样例修复

完成：继续按 `$plush-code-review-governance`、`$plush-print-template-source-governance` 和 `$plush-test-governance` 修复“编辑内容已缓存后，刷新 / 恢复样例仍不稳”的回归。复测发现右侧纸面 DOM 可能已经保住了编辑值，但窗口级结构化草稿仍可能停在旧值；代码侧保留的有效修复是把 `setDraft` 收口为每次解析出新草稿都同步写当前窗口草稿 key，让输入期草稿以 `draftRef` 为准，避免旧 React state 在 effect 或页面退出时覆盖最新输入；采购合同、加工合同和三套工程模板的可编辑控件通过 `input` 和当前 editable DOM 文本变化在编辑期静默写草稿、失焦再提交 React 渲染态。后续复盘确认用户本机持续复现主要来自旧浏览器缓存 / 旧前端 bundle，因此已撤掉 `keyup`、刷新快捷键、页面隐藏和自定义 active-edit flush 等过度兜底。L1 保留真实路径：五份模板从打印中心进入编辑页后输入标记，不离焦直接 reload；刷新后证明右侧纸面和结构化草稿保留编辑值；刷新后继续编辑，再点击 `恢复样例`，断言标记从右侧纸面和页面正文消失。

下一步：后续若新增模板或重构编辑器，恢复样例、空白模板、左侧字段改值都必须验证右侧纸面 DOM 同步，不只验证 localStorage 或 React state。

阻塞/风险：归档前 `progress.md` 为 328 行、80088 字节，已归档到 `docs/archive/progress-2026-07-06-before-print-restore-sample.md` 后再追加本轮记录。本轮只改打印模板右侧可编辑 DOM 同步、窗口级结构化草稿持久化、刷新/恢复 L1 断言、打印实现文档和进度记录；不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化、业务附件归档、源 Excel、客户配置激活或模板字段合同。原验证曾通过 targeted ESLint、print workspace 单测和五模板 `style:l1`；后续瘦身已改动同一区域，最终以最新瘦身后的验证记录为准。另用 `http://localhost:5175/erp/print-workspace/engineering-color-card?state=4f98e6f0-652e-4043-9c0b-fd49a1eab47e` 做 direct-state 复现时确认右侧中文编辑、左侧字段编辑和 reload 后均保留；用户后续用无痕模式确认原浏览器问题主要是缓存，因此同一浏览器继续复现时必须先清缓存 / 确认最新 bundle。

## 2026-07-06 物料明细毛向左侧换行

完成：按 `$plush-print-template-source-governance` 和 `$plush-page-design-governance` 继续修正物料分析明细表顶部信息区。`毛向` 仍不回到源 Excel 标题右侧的 source noise 位置，本轮把上一轮第三列单独换行调整为第一列左侧单独换行；编辑焦点仍铺满标签右侧值槽，并在 L1 中新增左侧对齐盒模型断言，防止后续再次漂到中间列。

下一步：如果后续还要继续压缩顶部信息区高度，应整体评审顶部字段分组和图片区高度，不再把 `毛向` 塞回 `设计师` 同一行横向复合格。

阻塞/风险：追加前 `progress.md` 为 30 行、6075 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/engineering-print.css`、`web/scripts/style-l1/scenarios.mjs`、`docs/打印模板字段与编辑行为清单.md` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化、业务附件归档、源 Excel、客户配置激活、模板字段合同、默认样例数据或客户配置。已通过 `node scripts/import/customerSourceManifestCheck.mjs --manifest docs/customers/yoyoosun/source-manifest.json --raw-dir docs/customers/yoyoosun/raw-source-files`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec eslint scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`。截图证据更新为 `web/output/playwright/style-l1/engineering-template-review/runtime/material-detail-hair-direction-focus-latest.png`。

## 2026-07-06 色卡页脚编辑值槽和默认签核值

完成：按 `$plush-print-template-source-governance` 和 `$plush-page-design-governance` 修复色卡页脚非表格字段焦点框过窄的问题。`制卡 / 日期 / 审核 / 复核` 继续保持源 Excel 的非表格页脚视觉，但每个字段组改成 label + value grid，右侧可编辑值槽铺满当前字段组高度和宽度；空值或短值时焦点框不再只包住文字。本轮同时补齐打印中心默认样例的 `审核 / 复核` 值为 `审核人 / 复核人`，业务记录带值打开时如果草稿明确为空仍保持空白，不用默认样例伪造业务事实。

下一步：后续如果继续调整色卡页脚，应同时保留“贴近色卡表格下方”和“非表格字段整槽可编辑”两个口径；不要把页脚推回页底，也不要退回 inline 小编辑框。

阻塞/风险：追加前 `progress.md` 为 38 行、7784 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/engineering-print.css`、`web/src/erp/data/engineeringPrintTemplates.mjs`、`web/scripts/style-l1/scenarios.mjs`、`docs/打印模板字段与编辑行为清单.md` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化、业务附件归档、源 Excel、客户配置激活或模板字段合同。已通过 `node scripts/import/customerSourceManifestCheck.mjs --manifest docs/customers/yoyoosun/source-manifest.json --raw-dir docs/customers/yoyoosun/raw-source-files`、`node --check web/scripts/style-l1/scenarios.mjs`、`node --check web/src/erp/data/engineeringPrintTemplates.mjs`、`/usr/local/bin/pnpm --dir web exec eslint scripts/style-l1/scenarios.mjs src/erp/data/engineeringPrintTemplates.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`node --input-type=module -e "import('./web/src/erp/data/engineeringPrintTemplates.mjs').then(({createColorCardDraft})=>{const draft=createColorCardDraft(); if(draft.auditor!=='审核人'||draft.reviewer!=='复核人') throw new Error(JSON.stringify({auditor:draft.auditor,reviewer:draft.reviewer})); console.log(JSON.stringify({auditor:draft.auditor,reviewer:draft.reviewer}))})"`、`git diff --check -- web/src/erp/styles/app/engineering-print.css web/src/erp/data/engineeringPrintTemplates.mjs web/scripts/style-l1/scenarios.mjs docs/打印模板字段与编辑行为清单.md progress.md`。截图证据新增 `web/output/playwright/style-l1/engineering-template-review/runtime/color-card-footer-focus-latest.png`。

## 2026-07-06 色卡顶部产品字段值槽

完成：按 `$plush-print-template-source-governance` 和 `$plush-page-design-governance` 继续统一色卡非表格字段编辑口径。`产品编号 / 产品名称` 仍保持源 Excel 的非表格标题信息视觉，但右侧可编辑值槽改为铺满对应 grid 列和行高；聚焦时绿色实线内描边覆盖完整值槽，不再只包住文字。本轮 L1 同步新增两个顶部值槽的 DOM / box 断言，并生成 `color-card-meta-focus-latest.png` 截图。

下一步：后续色卡顶部如继续调整宽度，只改 grid 列比例和 L1 断言，不要回退成 inline 小编辑框。

阻塞/风险：追加前 `progress.md` 为 46 行、10771 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/engineering-print.css`、`web/scripts/style-l1/scenarios.mjs`、`docs/打印模板字段与编辑行为清单.md` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、图片持久化、业务附件归档、源 Excel、客户配置激活、模板字段合同、默认样例数据或客户配置。已通过 `node scripts/import/customerSourceManifestCheck.mjs --manifest docs/customers/yoyoosun/source-manifest.json --raw-dir docs/customers/yoyoosun/raw-source-files`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec eslint scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`。

## 2026-07-06 采购合同和加工合同纸面留白收窄

完成：按 `$plush-print-template-source-governance` 和 `$plush-page-design-governance` 收窄采购合同、加工合同右侧纸面左右留白。两份合同的 screen 纸面和 print media 覆盖都从左右 `8.5mm` 收到 `5mm`；采购合同小屏响应式从左右 `6mm` 收到 `5mm`。L1 新增合同纸面 DOM / box 断言，检查左右 padding、表格贴合内容区、纸面和表格无横向溢出，并输出 `print-workspace-material-contract-narrow-padding.png`、`print-workspace-processing-contract-narrow-padding.png` 两张截图。

下一步：如果后续还要继续给合同明细表扩宽，应优先评审列比例和字号，而不是把左右留白继续压到贴边；采购/加工合同仍以右侧纸面 DOM 作为打印/PDF 输出真源。

阻塞/风险：追加前 `progress.md` 为 54 行、12344 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/material-contract-print.css`、`web/src/erp/styles/app/processing-contract-print.css`、`web/src/erp/styles/app/business-modals.css`、`web/src/erp/styles/app/print-responsive.css`、`web/scripts/style-l1/scenarios.mjs`、`web/scripts/style-l1/printAssertions.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、业务附件归档、源 Excel、客户配置激活、模板字段合同、样例数据、工具栏、图片槽或富文本能力。已通过 `git diff --check -- web/src/erp/styles/app/material-contract-print.css web/src/erp/styles/app/processing-contract-print.css web/src/erp/styles/app/business-modals.css web/src/erp/styles/app/print-responsive.css web/scripts/style-l1/printAssertions.mjs web/scripts/style-l1/scenarios.mjs`、`node --check web/scripts/style-l1/scenarios.mjs`、`node --check web/scripts/style-l1/printAssertions.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=print-workspace-material,print-workspace-material-print-media-narrow-viewport STYLE_L1_PORT=5237 /usr/local/bin/pnpm --dir web style:l1`。`STYLE_L1_SCENARIOS=print-workspace-material,print-workspace-processing,print-workspace-material-print-media-narrow-viewport STYLE_L1_PORT=5236 /usr/local/bin/pnpm --dir web style:l1` 在加工合同旧合计行大数值断言处失败：旧 helper 向兼容草稿 key 写入边界样本，但当前加工合同运行时已走窗口级草稿 key，页面读到默认合计 `27072`；新增的加工合同留白断言和截图已在失败前执行通过，草稿注入 helper 漂移留到后续单独修。

## 2026-07-06 五套打印模板顶部编辑区间距统一

完成：按 `$plush-print-template-source-governance`、`$plush-page-design-governance` 和 `$playwright` 排查“五个模板编辑区域距离顶部按钮区域不一致”。根因是三套工程资料模板通过 `.erp-engineering-print-workspace-shell .erp-print-shell__stage { padding: 6px; }` 覆盖了共享打印工作台舞台 padding，而采购合同 / 加工合同仍使用共享 `24px`，导致 `toolbar -> paper` 外层距离合同为 `37px`、工程模板为 `19px`。本轮把工程模板舞台 padding 收回到 `24px`，五套模板统一为 `toolbarToContent=12px`、`stageToPaper=25px`、`toolbarToPaper=37px`；同步在 style-l1 增加 `assertPrintWorkspacePaperTopRhythm`，覆盖采购合同、加工合同、物料分析明细表、色卡和作业指导书的纸面顶距。

下一步：如果后续要进一步统一“纸面内部首行内容到纸面顶部”的距离，需要单独做模板源结构评审；当前作业指导书首行是源 Excel 表格第一行，内部 `paperToFirst` 比合同和物料明细更小，本轮没有把它改成合同式标题留白，避免破坏源模板结构。

阻塞/风险：追加前 `progress.md` 为 62 行、14926 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/engineering-print.css`、`web/scripts/style-l1/scenarios.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、业务附件归档、源 Excel、客户配置激活、模板字段合同、样例数据、工具栏、图片槽或富文本能力。已通过 Playwright DOM 量测五套模板、`/usr/local/bin/pnpm --dir web css`、`git diff --check -- web/src/erp/styles/app/engineering-print.css web/scripts/style-l1/scenarios.mjs`、`STYLE_L1_PORT=4287 STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_PORT=4288 STYLE_L1_SCENARIOS=print-workspace-material /usr/local/bin/pnpm --dir web style:l1`。`STYLE_L1_PORT=4289 STYLE_L1_SCENARIOS=print-workspace-processing /usr/local/bin/pnpm --dir web style:l1` 仍在加工合同旧合计行大数值断言处失败，失败信息为页面仍读到默认合计 `27072`；本轮新增的顶部间距断言已在该失败前执行通过，该旧草稿注入 helper 漂移未纳入本轮修复。

## 2026-07-06 作业指导书新增作业行行高继承

完成：按 `$plush-print-template-source-governance`、`$plush-page-design-governance` 和 `$playwright` 修复作业指导书编号作业行下插后行高低于样例行的问题。根因是 `createBlankInstructionRow` 生成的新作业行默认 `heightMm: null`，而默认样例行来自源 Sheet1 的 11.6mm 文本行高；渲染时新增行退回 CSS 默认高度。现将编号作业行插入规则收口到 `engineeringPrintEditor.mjs`：新空白作业行只继承相邻普通文本作业行的 `heightMm / fontSizePt`，不复制文字、图片、图片区域高度、批注、标注或客户样例数据；若相邻行是图片 / 测量 / 标注行，则优先取另一侧普通文本行，避免继承 216mm 这类特殊图片行高度。L1 同步锁住下插后的新增行必须带 `--instruction-row-min-height: 11.6mm` 且实际像素高度保持在样例文本行区间。

下一步：后续若给作业指导书增加显式“图片行 / 测量行 / 普通行”类型选择，再把行类型选择和默认行高策略单独评审；当前仍保持一个共享作业行模型。

阻塞/风险：追加前 `progress.md` 为 70 行、18265 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/utils/engineeringPrintEditor.mjs`、`web/src/erp/utils/engineeringPrintEditor.test.mjs`、`web/scripts/style-l1/scenarios.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、业务附件归档、源 Excel、客户配置激活、模板字段合同、默认样例文字、图片槽或段落行插入策略。已通过 `/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`。验证覆盖默认态、行选择态、下插 / 删除恢复态、图片上传 / 清空、段落行边界、DOM 行高变量、实际像素高度和相邻区域无横向溢出；未跑服务端 PDF 生成和完整 `pnpm test`，因为本轮没有触达 PDF 后端和全局测试主线。

## 2026-07-06 物料明细跨页表格底线

完成：按 `$plush-print-template-source-governance` 修复物料分析明细表换页时上一页表格最后一条横线缺失。根因是物料明细主表沿用 `border-collapse: collapse`，浏览器 / PDF 分页时分页片段边界容易吞掉 collapsed border；本轮只把 `.erp-material-detail-table` 改为 `border-collapse: separate; border-spacing: 0`，由单元格自身绘制右边线和底边线，并给行加 `break-inside: avoid`，避免依赖表格片段外边框。L1 在 `engineering-print-workspace-row-buttons` 中新增跨页压力断言：临时扩展物料行到 72 行，检查第一页页尾附近行仍有单元格底边线和侧边线，并输出 `web/output/playwright/style-l1/engineering-template-review/runtime/material-detail-page-break-border-latest.png`。

下一步：如果后续发现色卡或作业指导书在真实 PDF 分页中也有 collapsed border 被裁切，应按各自表格结构单独评审，不要把所有工程表格一次性改成同一套边框模型；物料明细当前只改主表，不改顶部信息区、页脚、图片槽或样例数据。

阻塞/风险：追加前 `progress.md` 为 70 行、18265 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/engineering-print.css`、`web/scripts/style-l1/scenarios.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、业务附件归档、源 Excel、客户配置激活、模板字段合同、默认样例、工具栏、图片槽或富文本能力。已通过 `pnpm css`、`pnpm exec eslint scripts/style-l1/scenarios.mjs`、`pnpm exec node --test src/erp/utils/engineeringPrintEditor.test.mjs src/erp/utils/printPageMargin.test.mjs`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons pnpm style:l1`。尝试把 `src/erp/config/printTemplates.test.mjs` 一起跑时仍有既有失败：`FL_print_templates_sample__uses_generic_sample_values_without_customer_identity` 断言作业指导书默认样例 `sample.rows.length >= 8`，当前运行时样例少于 8；该失败不在本轮物料明细分页边框路径内，未纳入本轮修复。

## 2026-07-06 三套工程模板 PDF 留白与编辑区一致

完成：按 `$plush-print-template-source-governance`、`$plush-page-design-governance` 和 `$playwright` 修复新增三套工程模板在线预览 / 下载 PDF 与编辑区视觉不一致的问题。根因是服务端 PDF 快照 CSS 内联白名单只覆盖采购 / 加工合同 token，未包含 `erp-engineering-print`、`erp-material-detail`、`erp-color-card`、`erp-work-instruction` 等工程模板规则，导致 PDF 端缺纸面盒模型、左右留白和表格布局样式。本轮把工程模板 CSS token 纳入 `printPdf.mjs` 的 PDF 快照白名单，并在工程纸面 print media 中显式锁定 `border-box`、`210mm`、对称 `margin`、白底和无边框；L1 新增三套工程模板 screen / print media 纸面盒模型断言，确认左右 padding 对称、纸面宽度一致、打印态不带编辑边框。

下一步：后续新增正式打印模板时，除 `printTemplates.mjs`、服务端 PDF module gate 和编辑页 L1 外，还必须同步检查 `printPdf.mjs` 的 CSS 快照白名单，避免 PDF 端丢模板专属样式。

阻塞/风险：追加前 `progress.md` 为 70 行、18265 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/utils/printPdf.mjs`、`web/src/erp/utils/printPdf.test.mjs`、`web/src/erp/styles/app/engineering-print.css`、`web/scripts/style-l1/scenarios.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、业务附件归档、源 Excel、客户配置激活、模板字段合同、默认样例、图片槽或富文本能力。已通过 `node --check web/scripts/style-l1/scenarios.mjs && node --check web/src/erp/utils/printPdf.mjs`、`pnpm exec node --test src/erp/utils/printPdf.test.mjs`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons pnpm style:l1`、`pnpm exec eslint --ext .mjs scripts/style-l1/scenarios.mjs src/erp/utils/printPdf.mjs src/erp/utils/printPdf.test.mjs`、`pnpm css`。本轮验证覆盖本地浏览器 screen / print media 与服务端 PDF 快照 CSS 内联规则；未执行真实后端 `/templates/render-pdf` 目标环境 smoke。

## 2026-07-07 加工合同编辑区标题样式收口

完成：按 `$plush-print-template-source-governance` 和 `$plush-page-design-governance` 排查“采购订单编辑区域标题加粗、加工合同不是”的差异。根因在业务编辑弹窗层：采购订单明细区已经使用共享 `BusinessLineItemsSection`，加工合同明细区仍在 `OutsourcingOrderForm` 里手写同名结构，容易在标题、说明、空态和后续样式治理上漂移。本轮把加工合同的 `加工明细` 区改回共享明细区组件，保留原有行字段、复制行、移除行、添加条目、数量合计和金额合计逻辑，并补一个独立 `processing-contract-form-modal-title-desktop` L1 场景，直接断言 `加工明细` computed `font-weight >= 700`。

下一步：后续采购订单、加工合同、销售订单、BOM 等多明细业务表单继续优先复用 `BusinessLineItemsSection`；不要为单页再手写一套相似标题和 footer 结构。

阻塞/风险：追加前 `progress.md` 为 102 行、24884 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/components/outsourcing-orders/OutsourcingOrderForm.jsx`、`web/scripts/style-l1/scenarios.mjs`、`web/scripts/style-l1/businessFormalScenarios.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、采购 / 委外后端 usecase、打印模板字段合同、PDF 后端、源 Excel、客户配置或业务附件。已通过 `node --check web/scripts/style-l1/scenarios.mjs && node --check web/scripts/style-l1/businessFormalScenarios.mjs`、`/usr/local/bin/pnpm --dir web exec eslint scripts/style-l1/scenarios.mjs scripts/style-l1/businessFormalScenarios.mjs`、`cd web && /usr/local/bin/pnpm exec eslint --fix --ext .js --ext .jsx src/erp/components/outsourcing-orders/OutsourcingOrderForm.jsx`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=processing-contract-form-modal-title-desktop /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop /usr/local/bin/pnpm --dir web style:l1`、`git diff --check -- web/src/erp/components/outsourcing-orders/OutsourcingOrderForm.jsx web/scripts/style-l1/scenarios.mjs web/scripts/style-l1/businessFormalScenarios.mjs`。尝试跑 `STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm --dir web style:l1` 时失败在更早的产品档案 heading / click 流程，未进入加工合同断言；本轮改用新增窄场景覆盖加工合同弹窗。

## 2026-07-07 作业指导书段落行新增行高继承

完成：按 `$plush-print-template-source-governance`、`$plush-page-design-governance` 和 `$plush-code-review-governance` 继续修复作业指导书“所有行新增行为一致”的问题。上一轮只收口了编号作业行和续页编号作业行，段落行仍通过 `createBlankInstructionSectionRow()` 生成 `heightMm: null` 的空行，导致 `裁床 / 刺绣 / 车缝` 段落下插空行比源样例文本行矮。本轮新增段落行也改为继承相邻普通文本行的 `heightMm`，并复用已有图片 / 标注排除规则；新空行只继承版式高度，不复制文字、图片、图片行高度或客户样例内容。

下一步：后续如果段落行也要支持显式字体大小或独立图片行类型，应先评审段落行数据结构和 UI 控件，不要再让编号行、续页行、段落行各自维护一套插入策略。

阻塞/风险：追加前 `progress.md` 为 102 行、24884 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/utils/engineeringPrintEditor.mjs`、`web/src/erp/utils/engineeringPrintEditor.test.mjs`、`web/scripts/style-l1/scenarios.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、业务附件归档、源 Excel、客户配置激活、模板字段合同、默认样例文字、图片槽或富文本能力。已通过 `node --check web/src/erp/utils/engineeringPrintEditor.mjs`、`node --check web/src/erp/utils/engineeringPrintEditor.test.mjs`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec node --test src/erp/utils/engineeringPrintEditor.test.mjs`、`/usr/local/bin/pnpm --dir web exec eslint src/erp/utils/engineeringPrintEditor.mjs src/erp/utils/engineeringPrintEditor.test.mjs scripts/style-l1/scenarios.mjs`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`node scripts/import/customerSourceManifestCheck.mjs --manifest docs/customers/yoyoosun/source-manifest.json --raw-dir docs/customers/yoyoosun/raw-source-files`、`git diff --check -- web/scripts/style-l1/scenarios.mjs progress.md`。验证覆盖默认态、段落行选择态、下插 / 删除恢复态、相邻普通文本行高继承、图片相邻行不复制、DOM 行高变量、实际像素高度和图片 / 转义占位不复制；未跑服务端 PDF 生成和完整 `pnpm test`，因为本轮没有触达 PDF 后端和全局测试主线。

## 2026-07-07 三套工程模板 PDF 页面盒模型修复

完成：按 `$plush-code-review-governance`、`$plush-print-template-source-governance` 和 `$playwright` 复查用户反馈“截图看依然不一致”。新增截图和盒模型诊断确认：右侧编辑区纸面与 PDF 请求 HTML 内部 padding 已对称，但服务端 PDF 快照覆盖层仍让 `body` 保持 1440px viewport 宽度，并把 210mm 纸面 `margin: 0 auto` 居中在 1440px 画布内；真正 A4 PDF 输出时纸面被从页面左边界偏移，表现为左右留白不一致。本轮把服务端 PDF 快照的 `html, body` 收口到 `210mm` 宽，并将 `[data-server-pdf-root]`、采购合同和加工合同纸面输出改为 `margin: 0` + `width/max-width: 210mm`，让 PDF 页面从 A4 原点输出；同时保留工程模板 CSS 内联白名单。L1 新增点击三套工程模板 `在线预览 PDF` 的快照回归：拦截请求 HTML，按 print media 重绘，断言 `bodyWidth` 为 A4 宽、纸面 left 为 0、纸面 right 对齐 body，内容左右 gap 对称，并输出 `material-detail-server-pdf-page-box.png`、`color-card-server-pdf-page-box.png`、`work-instruction-server-pdf-page-box.png` 截图。

下一步：后续如果新增模板或调整服务端 PDF viewport，必须同时验证完整 PDF 页面盒模型，不只截 `[data-server-pdf-root]` 纸面自身；否则会再次漏掉“纸面内部对称、但纸面被放在错误画布里”的问题。

阻塞/风险：追加前 `progress.md` 为 118 行、29900 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/utils/printPdf.mjs`、`web/src/erp/utils/printPdf.test.mjs`、`web/scripts/style-l1/scenarios.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、业务附件归档、源 Excel、客户配置激活、模板字段合同、默认样例、图片槽或富文本能力。已通过 `pnpm exec node --test src/erp/utils/printPdf.test.mjs`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons pnpm style:l1`、`pnpm exec eslint --ext .mjs scripts/style-l1/scenarios.mjs src/erp/utils/printPdf.mjs src/erp/utils/printPdf.test.mjs`、`pnpm css`、`git diff --check -- web/src/erp/utils/printPdf.mjs web/src/erp/utils/printPdf.test.mjs web/scripts/style-l1/scenarios.mjs web/src/erp/styles/app/engineering-print.css progress.md`。本轮验证覆盖三套工程模板的编辑区截图、PDF 请求 HTML 快照重绘、A4 页面盒模型、内容左右 gap 和目标 L1；未调用真实后端 `/templates/render-pdf` 生成最终二进制 PDF，因为本地 style-l1 仍按既有机制 mock PDF 响应，但已验证服务端实际接收的 HTML 页面盒模型。

## 2026-07-07 工程模板中心预览断点收窄

完成：按 `$plush-code-review-governance`、`$plush-print-template-source-governance` 和 `$playwright` 排查用户截图里三套工程模板“在线预览 / 纸面预览无法显示”的问题。真实登录 + 真实后端 PDF 验证显示 `/erp/print-workspace/engineering-material-detail`、`/erp/print-workspace/engineering-color-card`、`/erp/print-workspace/engineering-work-instruction` 点击 `在线预览 PDF` 均返回 200 并打开 blob iframe；根因转为打印中心响应式断点：`968px` 宽度时 `.erp-print-center-workbench` 在 `max-width: 1200px` 就上下堆叠，三张工程模板列表占满首屏，纸面预览实际在首屏下方。现将打印中心堆叠断点收窄到 `860px`，让 968px 宽度下模板列表和纸面预览保持双栏同屏可见；同时新增 `print-center-engineering-preview-tablet` L1 场景，暗色 968x534 逐个选择物料分析明细表、色卡、作业指导书，断言预览面板在首屏、样例内容渲染且无横向溢出。同步把作业指导书默认样例测试从旧 `>=8` 行更新为代表行 `2-5` 行口径。

下一步：如果后续继续调整打印中心移动端布局，应先用 968px / 720px 两个断点验证预览是否仍可见；不要把模板选择列表再次过早堆到预览上方。

阻塞/风险：追加前 `progress.md` 为 126 行、33132 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/print-center.css`、`web/scripts/style-l1/scenarios.mjs`、`web/src/erp/config/printTemplates.test.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、PDF 后端、业务附件归档、源 Excel、客户配置激活、模板字段合同、默认样例内容、图片槽或富文本能力。已通过 `node --test web/src/erp/config/printTemplates.test.mjs web/src/erp/utils/printWorkspace.test.mjs web/src/erp/utils/printPdf.test.mjs web/src/erp/utils/engineeringPrintEditor.test.mjs`、`STYLE_L1_SCENARIOS=print-center-engineering-preview-tablet PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web style:l1`。真实登录复现命令确认三套工程模板在线 PDF 预览均成功；该命令依赖本机 `localhost:8300` 和 `127.0.0.1:5175` 当前运行态，不作为目标环境 release evidence。

## 2026-07-07 提交前打印模板守卫收口

完成：等待 `019f383a-2ed8-77c0-a194-391118c9355f` 会话完成后，按 full-worktree closeout 复跑提交前验证。`scripts/qa/full.sh` 先暴露三类旧守卫口径：销售订单字段链路测试仍断言正式打印模板只有采购 / 加工两套；开发态客户配置控制台仍写死 2 套打印模板；文档清单未登记三个新增 `docs/archive/progress-2026-07-*` 归档文件。本轮把这些守卫同步到当前五套正式模板口径，销售订单打印模板仍保持未启用边界，并补齐 `docs/打印模板实现原理.md` 与 `docs/文档清单.md`。随后修复 `style:l1` 加工合同大数值 / 续页样本注入 helper：当前工作台 reload 前会通过 `pagehide/beforeunload` flush 旧 React draftRef，旧 helper 只写 localStorage 会被覆盖；现在改为 reload 前注册一次性 init script，在新文档加载 React 前注入当前工作台草稿 key 和 legacy key，恢复时删除标记并还原原草稿。

下一步：如果后续继续新增打印模板，测试守卫应优先断言 catalog 标题、source-grounded 数量和销售订单未启用边界，不再写死旧模板数量；L1 需要 reload 注入草稿时继续走当前窗口级草稿 key，不回退到单一 legacy key。

阻塞/风险：追加前 `progress.md` 为 134 行、35469 字节，未达到 600 行或 80KiB 归档阈值。本轮只修提交前守卫和 L1 helper，不新增业务能力，不改 schema、migration、RBAC、Workflow / Fact、服务端 PDF、源 Excel、客户配置激活或真实导入。已通过 `node --test scripts/qa/sales-order-field-chain-boundary.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/docs-inventory.test.mjs`、`node --check web/scripts/style-l1/printAssertions.mjs`、`git diff --check -- web/scripts/style-l1/printAssertions.mjs`、`STYLE_L1_SCENARIOS=print-workspace-processing /usr/local/bin/pnpm --dir web style:l1`、`bash scripts/qa/full.sh`。完整 `/usr/local/bin/pnpm --dir web style:l1` 在 targeted 场景修复后再次运行超过 7 分钟无输出，已手动中断并清理本次 4173 测试服务；因此本轮完整 L1 全场景未完成，提交前浏览器证据以目标会话通过的 `print-center-engineering-preview-tablet`、本轮通过的 `print-workspace-processing` 和 `full.sh` 为准。

## 2026-07-07 加工合同纸面标题样式对齐

完成：按 `$plush-code-review-governance` 和 `$plush-print-template-source-governance` 重新定位用户截图中的问题层级，确认差异发生在独立打印窗口右侧纸面 DOM，而不是业务编辑弹窗。采购合同纸面标题使用 `SimSun`、`8.6mm`、`700`；加工合同标题虽然也是 `700`，但继承纸面 `STSong` 且字号为 `8.8mm`，浏览器渲染观感更细。本轮只把 `.erp-processing-contract-paper__title` 收口到采购合同同一套标题字体族、字号、字重和字距，保留加工合同正文、表格、字段、附件和 PDF 链路不变；新增 `print-workspace-contract-title-parity` L1 场景，分别读取采购合同和加工合同标题 computed style，并保存标题局部截图。

下一步：后续采购合同 / 加工合同纸面标题再调整时，应同步修改并跑 `print-workspace-contract-title-parity`，不要只改其中一套模板。

阻塞/风险：追加前 `progress.md` 为 142 行、37841 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/processing-contract-print.css`、`web/scripts/style-l1/scenarios.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、采购 / 委外 usecase、打印字段映射、客户配置、源文件、服务端 PDF 或业务附件。已通过 `node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec eslint scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=print-workspace-contract-title-parity /usr/local/bin/pnpm --dir web style:l1`、`git diff --check -- web/src/erp/styles/app/processing-contract-print.css web/scripts/style-l1/scenarios.mjs`。浏览器证据输出到 `web/output/playwright/style-l1/print-workspace-material-title-parity.png` 和 `web/output/playwright/style-l1/print-workspace-processing-title-parity.png`；未跑完整 `style:l1` 全场景和服务端真实 PDF 二进制生成，因为本轮只触达两个正式合同模板的标题 CSS 与窄范围 L1。

## 2026-07-07 物料明细长业务值换行

完成：按 `$plush-code-review-governance`、`$plush-print-template-source-governance` 和 `$plush-page-design-governance` 修复物料分析明细表从 BOM 业务页带值打开后，长物料名称、厂家料号、规格、组装部位和备注在窄列中不稳定换行、视觉上压到相邻列的问题。根因在工程打印表格单元格盒模型：虽然表格是 fixed layout，但物料明细的可编辑内容块没有完整收口 `min/max-width`、`white-space`、`line-break` 和断行策略，长连续英文 / 中英混合值可按内容宽度绘制。本轮只改 `engineering-print.css` 的物料明细表格格内换行约束，并新增 `engineering-material-detail-long-value-wrap` L1 场景，注入长连续中文、英文料号、规格、组装部位和备注，断言 `scrollWidth <= clientWidth`、内容块不越过单元格 / 表格 / 纸面边界，并保存截图 `web/output/playwright/style-l1/engineering-template-review/runtime/material-detail-long-value-wrap-latest.png`。

下一步：如果后续要让单位列里的长单位码也自动换行，应单独评审单位列口径；当前仍保留常规 `PCS` 单位不拆行的既有断言，避免把短单位显示改散。

阻塞/风险：追加前 `progress.md` 为 150 行、39941 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/engineering-print.css`、`web/scripts/style-l1/printAssertions.mjs`、`web/scripts/styleL1.mjs`、`web/scripts/style-l1/scenarios.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、BOM / 物料字段映射、服务端 PDF、业务附件归档、源 Excel、客户配置激活、模板字段合同、默认样例、工具栏、图片槽或富文本能力。已通过 `node --check web/scripts/style-l1/printAssertions.mjs web/scripts/style-l1/scenarios.mjs web/scripts/styleL1.mjs`、`/usr/local/bin/pnpm --dir web css`、`git diff --check`、`STYLE_L1_SCENARIOS=engineering-material-detail-long-value-wrap STYLE_L1_PORT=4298 /usr/local/bin/pnpm --dir web style:l1`。尝试跑既有大场景 `engineering-print-workspace-row-buttons` 时，物料明细长值断言已在前半段执行通过，但随后失败在当前工作区已有作业指导书行模型改动对应的旧行高断言（`sectionTitleHeightVars / sewingNoteHeightVar` 期望未同步），该失败不属于本轮物料明细换行路径。

## 2026-07-07 工程模板 PDF 预览等待页修复

完成：按 `$plush-code-review-governance`、`$plush-runtime-diagnostics`、`$plush-print-template-source-governance` 和 `$playwright` 重新排查三套工程模板在线预览停在“正在等待 PDF 预览结果...”的问题。真实浏览器复现确认弹窗已打开到 `pdf-preview-shell.html`，但主窗口在部分时序下没有及时完成 PDF 快照并写入预览页；根因收窄到打开弹窗后主页面等待 `requestAnimationFrame` 提交编辑态，opener 被弹窗聚焦 / 后台节流时该等待可能长期不返回，导致 `/templates/render-pdf` 请求不发出。现给 `waitForSnapshotCommit()` 增加 80ms 兜底，保持 rAF 优先但不允许弹窗链路永久挂起；新增单测覆盖 rAF 被节流时仍能结束等待，并新增 `print-workspace-engineering-preview-popups` L1 场景，逐个验证物料分析明细表、色卡、作业指导书弹窗不再停留等待页。

下一步：后续如继续优化 PDF 预热，应把预热 pending promise 与用户点击触发的当前弹窗绑定策略单独评审；当前先保证点击主路径一定能发请求并把结果写入当前预览窗口。

阻塞/风险：追加前 `progress.md` 为 158 行、42393 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/utils/printPdf.mjs`、`web/src/erp/utils/printPdf.test.mjs`、`web/scripts/style-l1/scenarios.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、服务端 PDF、业务附件、源 Excel、客户配置激活、模板字段合同、默认样例、图片槽或富文本能力。已通过 `node --test web/src/erp/utils/printPdf.test.mjs`、`STYLE_L1_SCENARIOS=print-workspace-engineering-preview-popups /usr/local/bin/pnpm --dir web style:l1`、`/usr/local/bin/pnpm --dir web exec eslint src/erp/utils/printPdf.mjs src/erp/utils/printPdf.test.mjs scripts/style-l1/scenarios.mjs`、`node --check`。真实登录 + 真实后端回归确认三套工程模板最终均出现 `iframe.pdf-preview-frame` 且 iframe src 为 blob，`/templates/render-pdf` 返回 200。扩大运行 `printTemplates / engineeringPrintEditor` 相关测试时仍失败在当前工作区已有作业指导书行类型 / 默认样例行数断言，和本轮 PDF 等待页修复无关，未在本轮处理。

## 2026-07-07 工程模板浏览器打印左右留白收口

完成：按 `$plush-code-review-governance` 和 `$plush-print-template-source-governance` 复查用户截图中“点击打印按钮后左右留白仍不一致”的问题。根因不是在线 PDF 预览路径，而是浏览器 `window.print()` 的 live DOM 打印路径：工程模板纸面在 print media 下仍按 210mm 纸张居中在更宽的 `.erp-print-shell__stage-wrap` 内，Chrome 打印预览再套默认边距后表现为左侧大空白、右侧贴边。现把工程模板打印媒体下的 workspace shell、content、stage、stage-wrap 和 paper 都收口为 210mm、`margin: 0`、`padding: 0`，并让 stage-wrap 在打印时 `flex-start`，保证三套工程模板纸面从 A4 原点输出，和编辑区纸面盒模型一致。同步把 `engineering-print-workspace-row-buttons` L1 的 print media 断言升级为检查 `stageWidth === paperWidth`、纸面左右 gap 为 0，并把作业指导书相关断言更新到当前统一行模型，避免旧 `.section-row` 结构阻塞打印回归。

下一步：后续如果再调整工程打印工作台的 stage / shell / print media，必须跑 `STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`，并确认三套模板打印媒体下 stage 与 paper 宽度一致。

阻塞/风险：追加前 `progress.md` 为 158 行、42393 字节，未达到 600 行或 80KiB 归档阈值。本轮只收口浏览器打印按钮路径和对应 L1 断言；不改 schema、migration、RBAC、Workflow / Fact、服务端 PDF 渲染接口、业务附件归档、源 Excel、客户配置激活、模板字段合同、默认样例字段、图片槽或富文本语义。已通过 `STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=print-workspace-engineering-color-card-shell-refresh /usr/local/bin/pnpm --dir web style:l1`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .mjs scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .jsx src/erp/pages/EngineeringPrintWorkspacePage.jsx`、`/usr/local/bin/pnpm --dir web css`、`git diff --check -- web/src/erp/pages/EngineeringPrintWorkspacePage.jsx web/src/erp/styles/app/engineering-print.css web/scripts/style-l1/scenarios.mjs progress.md`。本轮未执行完整全站 `style:l1`，因为当前工作区已有多项打印模板 WIP，验证范围按本次问题收敛到三套工程模板打印按钮路径和相邻作业指导书行模型回归。

## 2026-07-07 作业指导书统一正文行模型

完成：按 `$plush-print-template-source-governance`、`$plush-page-design-governance` 和 `$plush-test-governance` 把作业指导书正文从固定 `裁床 / 刺绣 / 印花 / 车缝 / 备注` 字段收口为统一 `rows` 正文行。正文行支持 `title / step / note / remark` 四种类型，标题行、说明行、备注行和编号行默认统一 `11.6mm` 行高；编号行按当前页顺序自动编号，只有编号行允许维护行内图片。旧草稿和 yoyoosun 客户配置包里的 `cuttingRows / sewingIntroRows / sewingNote / remark` 等字段仍在数据归一化层压平成正文行，纸面和左侧字段面板不再走旧固定段落渲染。同步更新作业指导书工具栏、左侧字段清单、模板登记、实现文档和 L1 浏览器断言。

下一步：后续如果甲方继续调整作业指导书正文结构，应只扩展正文行类型或行级配置，不要重新增加固定“裁床 / 车缝”字段；客户专属默认文本继续留在客户配置包或打印草稿，不上升为 Product Core 规则。

阻塞/风险：追加前 `progress.md` 为 174 行、47472 字节，未达到 600 行或 80KiB 归档阈值。本轮不改 schema、migration、RBAC、Workflow / Fact、委外 usecase、服务端 PDF 接口、源 Excel、客户配置激活或真实导入。已通过 `node --test web/src/erp/utils/engineeringPrintEditor.test.mjs web/src/erp/config/printTemplates.test.mjs`、`node --check web/src/erp/data/engineeringPrintTemplates.mjs web/src/erp/utils/engineeringPrintEditor.mjs web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec eslint src/erp/data/engineeringPrintTemplates.mjs src/erp/utils/engineeringPrintEditor.mjs src/erp/utils/engineeringPrintEditor.test.mjs src/erp/config/printTemplates.test.mjs scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec eslint --ext .jsx src/erp/pages/EngineeringPrintWorkspacePage.jsx`、`/usr/local/bin/pnpm --dir web css`、`node scripts/import/customerSourceManifestCheck.mjs --manifest docs/customers/yoyoosun/source-manifest.json --raw-dir docs/customers/yoyoosun/raw-source-files`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons,engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1`。本轮未跑完整全站 `style:l1`，验证范围按作业指导书正文行模型收敛到目标模板行按钮、行高、客户样例压平和相邻工程模板场景。

## 2026-07-07 物料明细所有列长值换行补强

完成：按 `$plush-code-review-governance`、`$plush-print-template-source-governance`、`$plush-page-design-governance` 和 `$playwright` 复查用户从 BOM 物料页带值打开 `物料分析明细表` 后单位列不换行的问题。根因是上一轮为了常规 `PCS` 单位保留了第 6 列 `nowrap` 特例，而第 6 列正是 `单位`；BOM mapper 仍按 `unit.name || unit.code || ''` 把业务单位原样带进打印草稿，不是字段真源缺值或错位。本轮删除单位列不换行特例，让物料明细表所有明细列统一使用 `white-space: normal`、`overflow-wrap: anywhere`、`word-break: break-word`。同时把 `engineering-material-detail-long-value-wrap` L1 从 5 个字段扩到 14 个字段，覆盖材料类别、物料名称、厂商料号、规格、颜色、单位、组装部位、片数、单位用量、损耗、总用量、两个加工方式和备注，并断言 `scrollWidth <= clientWidth`、内容块不越过单元格 / 表格 / 纸面边界、长值形成多行 line boxes；截图继续输出到 `web/output/playwright/style-l1/engineering-template-review/runtime/material-detail-long-value-wrap-latest.png`。

下一步：后续物料明细表新增列或调整列顺序时，必须同步更新 `MATERIAL_DETAIL_COLUMNS` 对应的长值换行 L1 索引；不要再为单列补 `nowrap` 这类例外，除非先证明该列不会承接业务页长值。

阻塞/风险：追加前 `progress.md` 为 182 行、49988 字节，未达到 600 行或 80KiB 归档阈值。本轮只改物料分析明细表纸面样式和 L1 断言；不改 schema、migration、RBAC、Workflow / Fact、BOM / 单位 / 物料字段映射、服务端 PDF、源 Excel、客户配置激活、模板字段合同、图片槽、工具栏或富文本能力。已通过 `node --check web/scripts/style-l1/printAssertions.mjs`、`node --check web/scripts/style-l1/scenarios.mjs`、`node --check web/scripts/styleL1.mjs`、`/usr/local/bin/pnpm --dir web css`、`git diff --check`、`STYLE_L1_SCENARIOS=engineering-material-detail-long-value-wrap STYLE_L1_PORT=4302 /usr/local/bin/pnpm --dir web style:l1`。第一次同场景用 `4301` 端口启动失败在 Vite HMR WebSocket / empty response，未进入业务断言；换 `4302` 后通过。未跑完整全站 `style:l1` 和真实 PDF 二进制生成，因为本轮影响面收敛在工程物料明细纸面 DOM 的列内换行。

## 2026-07-07 本地 Vite proxy IPv4 固定

完成：排查 `/Users/simon/projects` 下同类 Vite dev runtime 风险后，确认 plush 的 HMR 已固定为 `127.0.0.1`；本轮只把 `web/vite.shared.mjs` 中 `/rpc`、`/templates` proxy 默认目标从 `localhost:8300` 收口到 `127.0.0.1:8300`，避免本机 `localhost` 优先解析到 `::1` 时后端代理间歇失败。

下一步：后续若调整 desktop / prototype / customer preview 的端口，继续保持 HMR host 与本地 proxy target 使用明确 IPv4 loopback；浏览器访问地址仍可按脚本实际打印端口使用。

阻塞/风险：追加前 `progress.md` 为 190 行、52452 字节，未达到 600 行或 80KiB 归档阈值。本轮只改本地开发 Vite 共享配置，不改产品核心、客户配置、schema、migration、Workflow / Fact、打印模板或正式文档。

## 2026-07-08 作业指导书模块内编号重编

完成：按 `$plush-print-template-source-governance` 重新核对 `docs/customers/yoyoosun/source-manifest.json` 与源 Excel，确认 `26029#夜樱烬色才料明细表2026-1-19.xlsx`、`26204#抱抱猴子材料明细表2026-4-10.xlsx` 的 `Sheet1` 作业指导书正文使用小模块内编号：`裁床`、`刺绣/印花`、`车缝` 以及说明行后的具体步骤都从 `1` 开始。本轮把 `engineeringPrintTemplates.mjs` 和 `engineeringPrintEditor.mjs` 的作业指导书重编号规则从整页连续改为遇到标题行 / 说明行重置；默认样例、旧 `sewingIntroRows / sewingNote / rows` 兼容压平、行类型切换、插入 / 删除和续页说明行后的编号都按该口径重编。同步更新打印模板字段行为文档、实现原理文档和 `engineering-print-workspace-row-buttons` L1 断言。

下一步：后续若继续调整作业指导书源结构，应先按 manifest + workbook 复核真实 Sheet1 模块边界，再扩展正文行类型或行级配置；不要回退到整页全局连续编号。

阻塞/风险：追加前 `progress.md` 为 198 行、53313 字节，未达到 600 行或 80KiB 归档阈值。本轮只改作业指导书当前打印草稿的编号显示 / 编辑规则和对应文档 / 测试；不改 schema、migration、RBAC、Workflow / Fact、委外 usecase、服务端 PDF 接口、业务附件、源 Excel、客户配置激活或真实导入。已通过 `node --test web/src/erp/utils/engineeringPrintEditor.test.mjs web/src/erp/config/printTemplates.test.mjs`、`node --check web/src/erp/data/engineeringPrintTemplates.mjs web/src/erp/utils/engineeringPrintEditor.mjs web/src/erp/utils/engineeringPrintEditor.test.mjs web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec eslint src/erp/data/engineeringPrintTemplates.mjs src/erp/utils/engineeringPrintEditor.mjs src/erp/utils/engineeringPrintEditor.test.mjs src/erp/config/printTemplates.test.mjs scripts/style-l1/scenarios.mjs`、`node scripts/import/customerSourceManifestCheck.mjs --manifest docs/customers/yoyoosun/source-manifest.json --raw-dir docs/customers/yoyoosun/raw-source-files`、`STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=engineering-print-workspace-yoyoosun-sheet1-assets /usr/local/bin/pnpm --dir web style:l1` 和 `git diff --check`。未跑完整全站 `style:l1`；验证范围按本次编号口径收敛到作业指导书行模型、客户 Sheet1 样例和相关工程打印浏览器场景。

## 2026-07-08 本地 Vite 开发入口 IPv4 统一

完成：继续收口本地 Vite dev origin：`web/vite.shared.mjs` 保留 `host: 0.0.0.0` 和局域网 `Network` 地址，但按实际 `serverPort` 将自动打开地址、终端 `Local:` 打印和 `localhost:<port>` 页面访问统一规范到 `http://127.0.0.1:<port>`；同步更新 `web/README.md` 中 5175 桌面后台、岗位任务端和 dev-only 入口的本地访问示例。端口顺延类预览说明仍以脚本实际输出为准，本轮不硬改。

下一步：后续调整 desktop / prototype / customer preview 端口时，继续保持 HMR host、本机打开地址和本地 proxy target 使用明确 IPv4 loopback；端口顺延脚本仍按实际打印 URL 验收。

阻塞/风险：追加前 `progress.md` 为 206 行、55905 字节，未达到 600 行或 80KiB 归档阈值。本轮只改本地开发 Vite 共享配置和前端 README，不改产品核心、客户配置、schema、migration、Workflow / Fact、打印模板、源 Excel、客户配置激活或真实导入。

## 2026-07-08 本地开发入口反向跳转修复

完成：修复上一轮 plush 本地 Vite 入口统一后，浏览器地址栏在 `localhost` 与 `127.0.0.1` 之间反复横跳的问题。根因是 `web/vite.shared.mjs` 已在 dev HTML 注入层把 `localhost` 规范到 `127.0.0.1`，但 `web/src/common/theme/localDevThemeOrigin.mjs` 仍把 `127.0.0.1` 当作 alias 并在前端启动层改回 `localhost`。本轮把主题本地 host 规范方向同步为 `localhost -> 127.0.0.1`，并让重定向使用 `location.replace`，避免写入多余历史记录。

下一步：后续本地入口、主题偏好或 dev-only 页面再调整 host 口径时，必须同时检查 Vite HTML 注入层和前端启动层，保证只有一个 canonical host，不能保留双向跳转。

阻塞/风险：追加前 `progress.md` 为 214 行、56956 字节，未达到 600 行或 80KiB 归档阈值。本轮只改本地开发 host 规范 helper 和对应单测，不改产品核心、客户配置、schema、migration、Workflow / Fact、打印模板、源 Excel、客户配置激活或真实导入。已通过 `node --test web/src/common/theme/localDevThemeOrigin.test.mjs`、`node --check web/src/common/theme/localDevThemeOrigin.mjs web/src/common/theme/localDevThemeOrigin.test.mjs`、`/usr/local/bin/pnpm --dir web exec eslint src/common/theme/localDevThemeOrigin.mjs src/common/theme/localDevThemeOrigin.test.mjs`；并用临时 `ERP_VITE_PORT=4316` 真实浏览器验证 `http://localhost:4316/__dev/testing` 只跳到 `http://127.0.0.1:4316/__dev/testing`，刷新后不回跳且 console/page error 为 0。

## 2026-07-08 色卡顶部产品字段长值换行

完成：按 `$plush-print-template-source-governance` 和 `$plush-page-design-governance` 修复色卡打印纸面顶部 `产品编号 / 产品名称` 两个值槽长值不换行的问题。根因是 `.erp-color-card-paper__meta > .erp-engineering-print-editable` 局部覆盖成 `white-space: nowrap` 和 `overflow-wrap: normal`，关掉了工程打印可编辑文本的全局换行策略。本轮只把色卡顶部值槽恢复为 `white-space: normal`、`overflow-wrap: anywhere`，保留原有 grid 结构、标签、值槽铺满和 `flex` 垂直居中行为；并在 `engineering-print-workspace-row-buttons` 色卡段加入长产品编号 / 长产品名称 DOM 断言和截图输出，检查 `scrollWidth <= clientWidth`、line boxes 形成多行、标签与相邻值槽不互相覆盖。

下一步：后续如果继续调整色卡顶部信息区，应继续按右侧纸面 DOM 验证，不要改左侧字段面板或 PDF 后端另起一套；如果要处理色卡行编辑焦点切换失败，应作为单独任务定位当前行选择 / contenteditable blur 恢复链路。

阻塞/风险：追加前 `progress.md` 为 222 行、58567 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/engineering-print.css`、`web/scripts/style-l1/scenarios.mjs` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、BOM / 物料字段映射、服务端 PDF、源 Excel、客户配置激活、模板字段合同、图片槽、工具栏、富文本能力或业务附件。已通过 `/usr/local/bin/pnpm --dir web css`、`node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web exec eslint scripts/style-l1/scenarios.mjs`、`git diff --check`、`/usr/local/bin/pnpm --dir web test`。真实浏览器窄验证使用 `http://127.0.0.1:4175/erp/print-workspace/engineering-color-card?draft=fresh` 和 style-l1 admin mock 注入长值，确认产品编号 6 个 line box、产品名称 2 个 line box、两个值槽均无横向溢出，截图输出到 `web/output/playwright/style-l1/engineering-template-review/runtime/color-card-meta-long-value-wrap-manual.png`。尝试运行 `STYLE_L1_SCENARIOS=engineering-print-workspace-row-buttons` 时，脚本内置 `localhost` dev server 两次落到 `chrome-error://chromewebdata/`；改用 `STYLE_L1_BASE_URL=http://127.0.0.1:4175` 后进入页面，但失败在既有色卡行编辑焦点切换断言（`热裁 -1` 行从一个编辑框切到另一个编辑框后焦点边框消失），发生在本轮新增的顶部长值断言之前，未在本轮处理。

## 2026-07-08 物料明细与色卡非表格字段顶部对齐

完成：按 `$plush-print-template-source-governance` 和 `$plush-page-design-governance` 将 `物料分析明细表` 与 `色卡` 的非表格字段值槽改为长值换行后从顶部开始对齐，和采购合同 / 加工合同的长字段阅读口径保持一致。具体覆盖物料明细顶部 9 个业务信息值槽、物料明细页脚 `审核 / 制表`、色卡顶部 `产品编号 / 产品名称`、色卡页脚 `制卡 / 日期 / 审核 / 复核`；值槽继续铺满可点击区域，支持 `overflow-wrap: anywhere`，不改表格结构、行操作、图片槽、默认样例、字段 mapper、PDF 接口或业务事实。

下一步：后续如果要把色卡明细表格或物料明细表格单元格也从垂直居中改为顶部对齐，应单独评审表格阅读口径；本轮只处理标签和值同格的非表格字段。

阻塞/风险：追加前 `progress.md` 为 230 行、61195 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/engineering-print.css`、`web/scripts/style-l1/scenarios.mjs`、`docs/打印模板字段与编辑行为清单.md` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、BOM / 物料字段映射、服务端 PDF、源 Excel、客户配置激活、模板字段合同、图片槽、工具栏、富文本能力或业务附件。已通过 `/usr/local/bin/pnpm --dir web css`、`git diff --check -- web/src/erp/styles/app/engineering-print.css web/scripts/style-l1/scenarios.mjs docs/打印模板字段与编辑行为清单.md`、`STYLE_L1_BASE_URL=http://127.0.0.1:4297 STYLE_L1_SCENARIOS=engineering-material-detail-long-value-wrap /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_BASE_URL=http://127.0.0.1:4297 STYLE_L1_SCENARIOS=print-workspace-engineering-color-card-shell-refresh /usr/local/bin/pnpm --dir web style:l1`，并用 Playwright + style-l1 admin mock 在 `127.0.0.1:4297` 注入长值验证物料顶部 9 个值槽、物料页脚 2 个值槽、色卡顶部 2 个值槽、色卡页脚 4 个值槽均为顶部对齐且无横向溢出；截图输出到 `web/output/playwright/style-l1/engineering-template-review/runtime/*top-align-probe.png`。完整 `engineering-print-workspace-row-buttons` 仍失败在当前工作区既有的物料明细表单元格焦点切换断言（从一个编辑框切到另一个编辑框后前一个 blur 提交导致新焦点边框消失），不是本轮顶部对齐断言失败，未在本轮处理。

## 2026-07-08 工程模板编辑焦点态对齐合同模板

完成：按 `$plush-print-template-source-governance` 和 `$plush-page-design-governance` 将工程打印模板共享编辑框 `.erp-engineering-print-editable:focus` 的焦点态改为采购合同 / 加工合同同款视觉 token：浅绿色底色 `rgb(47 143 75 / 8%)` + 绿色实线内描边 `rgb(47 143 75 / 82%)`，覆盖物料分析明细表、色卡和作业指导书。同步把 `assertPrintEditableFocusBorderStyle` 的 L1 断言从“非虚线 + 有内描边”升级为锁定合同同款颜色 token，并更新打印模板字段与编辑行为清单，避免后续工程模板再漂回更深的绿底或页面私有样式。

下一步：后续如需统一“行选中 / 单元格选中 / hover”这类非编辑焦点态，应单独按合同模板、工程模板表格语义评审；本轮只收口真实编辑框获得焦点时的可见反馈。

阻塞/风险：追加前 `progress.md` 为 238 行、63717 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/engineering-print.css`、`web/scripts/style-l1/scenarios.mjs`、`docs/打印模板字段与编辑行为清单.md` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、BOM / 物料字段映射、服务端 PDF、源 Excel、客户配置激活、图片槽、工具栏、富文本能力、选中态或行操作。已通过 `node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir /Users/simon/projects/plush-toy-erp/web css`、`git diff --check -- web/src/erp/styles/app/engineering-print.css web/scripts/style-l1/scenarios.mjs docs/打印模板字段与编辑行为清单.md`、`STYLE_L1_BASE_URL=http://127.0.0.1:4297 STYLE_L1_SCENARIOS=print-workspace-engineering-color-card-shell-refresh /usr/local/bin/pnpm --dir /Users/simon/projects/plush-toy-erp/web style:l1`、`STYLE_L1_BASE_URL=http://127.0.0.1:4297 STYLE_L1_SCENARIOS=engineering-material-detail-long-value-wrap /usr/local/bin/pnpm --dir /Users/simon/projects/plush-toy-erp/web style:l1`；并用 Playwright + style-l1 admin mock 在 `127.0.0.1:4297` 实测采购合同、加工合同、物料分析明细表、色卡和作业指导书 5 个模板的 focused editable 均为 `rgba(47, 143, 75, 0.82) ... inset`、`rgba(47, 143, 75, 0.08)`、`outline: none`，截图输出到 `web/output/playwright/style-l1/engineering-template-review/runtime/*-focused.png`。未跑完整全站 `style:l1`；当前工作区已有完整 `engineering-print-workspace-row-buttons` 焦点切换失败未在本轮处理。

## 2026-07-08 工程模板编辑框文字垂直居中

完成：按 `$plush-print-template-source-governance` 复核采购合同 / 加工合同表格编辑框的运行时盒模型，确认合同编辑框内部文字是 `display:flex; align-items:center` 且文字中心基本贴近编辑框中心。本轮把工程模板非表格字段值槽的内部对齐从上一轮的 `flex-start / start` 改为 `center`，覆盖物料分析明细表顶部信息区、物料页脚审核 / 制表、色卡顶部产品编号 / 产品名称、色卡页脚制卡 / 日期 / 审核 / 复核；继续保留值槽铺满可点击区域、同款绿色焦点态和长值换行不横向溢出。同步把字段行为文档从“顶部开始对齐”修正为“值槽文字上下居中”，并将 L1 断言改为保护工程模板值槽的 `align-items:center` 和物料顶部信息格文字中心位置。

下一步：如果后续要统一表格内多行长文本的垂直策略，应按合同表格单元格、工程表格单元格和非表格值槽分别评审；本轮只处理用户指出的编辑框内部文字上下位置。

阻塞/风险：追加前 `progress.md` 为 246 行、66289 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/engineering-print.css`、`web/scripts/style-l1/scenarios.mjs`、`docs/打印模板字段与编辑行为清单.md` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、BOM / 物料字段映射、服务端 PDF、源 Excel、客户配置激活、图片槽、工具栏、富文本能力、选中态或行操作。已通过 `node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir /Users/simon/projects/plush-toy-erp/web css`、`git diff --check -- web/src/erp/styles/app/engineering-print.css web/scripts/style-l1/scenarios.mjs docs/打印模板字段与编辑行为清单.md`、`STYLE_L1_BASE_URL=http://127.0.0.1:4297 STYLE_L1_SCENARIOS=engineering-material-detail-long-value-wrap /usr/local/bin/pnpm --dir /Users/simon/projects/plush-toy-erp/web style:l1`、`STYLE_L1_BASE_URL=http://127.0.0.1:4297 STYLE_L1_SCENARIOS=print-workspace-engineering-color-card-shell-refresh /usr/local/bin/pnpm --dir /Users/simon/projects/plush-toy-erp/web style:l1`；并用 Playwright + style-l1 admin mock 在 `127.0.0.1:4297` 对比采购合同、加工合同、物料分析明细表、色卡的 focused editable，确认合同表格文字中心偏差约 0.29 / 0.41px，工程模板对应值槽约 0.27-0.8px，焦点态均为 `rgba(47, 143, 75, 0.82) ... inset` + `rgba(47, 143, 75, 0.08)` + `outline: none`，截图输出到 `web/output/playwright/style-l1/engineering-template-review/runtime/*-vertical-center-focused.png`。未跑完整全站 `style:l1`；当前工作区已有完整 `engineering-print-workspace-row-buttons` 焦点切换失败未在本轮处理。

## 2026-07-08 工程模板字段组顶对齐与编辑框内居中拆层

完成：修正上一轮把“编辑框内部文字居中”和“字段名 / 字段值外层对齐”混在一起的问题。当前口径拆为两层：物料分析明细表顶部信息区、物料页脚、色卡顶部和色卡页脚的字段名与右侧值槽在字段组内向上对齐；值槽本身继续铺满可点击区域，值槽内部文字按合同模板编辑框口径上下居中。同步更新 `docs/打印模板字段与编辑行为清单.md`，并把 L1 改为同时保护字段组外层 `align-items:start`、编辑值槽 `align-items:center`、同款焦点态和长值不横向溢出。

下一步：后续若要继续调整多行长值的垂直阅读口径，应先区分“字段组外层对齐”“编辑框内文字对齐”和“表格单元格内容对齐”三层，不要再用一个 `align-items` 口径覆盖全部。

阻塞/风险：追加前 `progress.md` 为 270 行、74681 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/engineering-print.css`、`web/scripts/style-l1/scenarios.mjs`、`docs/打印模板字段与编辑行为清单.md` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、BOM / 物料字段映射、服务端 PDF、源 Excel、客户配置激活、图片槽、工具栏、富文本能力、选中态或行操作。已通过 `node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir /Users/simon/projects/plush-toy-erp/web css`、`git diff --check -- web/src/erp/styles/app/engineering-print.css web/scripts/style-l1/scenarios.mjs docs/打印模板字段与编辑行为清单.md`、`STYLE_L1_BASE_URL=http://127.0.0.1:4297 STYLE_L1_SCENARIOS=engineering-material-detail-long-value-wrap /usr/local/bin/pnpm --dir /Users/simon/projects/plush-toy-erp/web style:l1`、`STYLE_L1_BASE_URL=http://127.0.0.1:4297 STYLE_L1_SCENARIOS=print-workspace-engineering-color-card-shell-refresh /usr/local/bin/pnpm --dir /Users/simon/projects/plush-toy-erp/web style:l1`；并用 Playwright + style-l1 admin mock 在 `127.0.0.1:4297` 实测物料顶部、物料页脚、色卡顶部和色卡页脚：外层字段组 `fieldAlignItems=start`，字段名和值槽顶端差值 `topDelta=0`，编辑框内部 `editorAlignItems=center`，文字中心偏差 `0.27-0.8px`，焦点态仍为 `rgba(47, 143, 75, 0.82) ... inset` + `rgba(47, 143, 75, 0.08)` + `outline: none`；截图输出到 `web/output/playwright/style-l1/engineering-template-review/runtime/*-field-top-editor-center-focused.png`。未跑完整全站 `style:l1`；当前工作区已有完整 `engineering-print-workspace-row-buttons` 焦点切换失败未在本轮处理。

## 2026-07-08 工程模板字段文字和值文字基线对齐

完成：按 `$plush-page-design-governance` 修正上一轮仍以盒子顶边判断对齐的问题。最终口径改为：字段名文字和值文字按同一视觉行对齐，编辑框自身保留稳定点击高度，编辑框内部文字继续上下居中。实现上把物料分析明细表顶部信息区、物料页脚、色卡顶部和色卡页脚的字段组从 `start` 改为 `baseline`；对应编辑值槽从 `stretch/height:100%` 改为 `baseline` 自身对齐 + 最小高度，保留 `display:flex; align-items:center` 和合同同款焦点态。同步更新字段行为文档与 L1，断言字段名文字和值文字 `textTopDelta <= 2px`、编辑框内部文字中心偏差、长值换行和焦点样式。

下一步：后续如果再调整该区域，必须同时看两条线：可见文字对齐线和编辑框点击 / 焦点盒子；不要再用外层盒子顶边等同于字段和值对齐。

阻塞/风险：追加前 `progress.md` 为 278 行、77400 字节，未达到 600 行或 80KiB 归档阈值。本轮只改 `web/src/erp/styles/app/engineering-print.css`、`web/scripts/style-l1/scenarios.mjs`、`docs/打印模板字段与编辑行为清单.md` 和进度记录；不改 schema、migration、RBAC、Workflow / Fact、BOM / 物料字段映射、服务端 PDF、源 Excel、客户配置激活、图片槽、工具栏、富文本能力、选中态或行操作。已通过 `node --check web/scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir /Users/simon/projects/plush-toy-erp/web css`、`git diff --check -- web/src/erp/styles/app/engineering-print.css web/scripts/style-l1/scenarios.mjs docs/打印模板字段与编辑行为清单.md`、`STYLE_L1_BASE_URL=http://127.0.0.1:4297 STYLE_L1_SCENARIOS=engineering-material-detail-long-value-wrap /usr/local/bin/pnpm --dir /Users/simon/projects/plush-toy-erp/web style:l1`、`STYLE_L1_BASE_URL=http://127.0.0.1:4297 STYLE_L1_SCENARIOS=print-workspace-engineering-color-card-shell-refresh /usr/local/bin/pnpm --dir /Users/simon/projects/plush-toy-erp/web style:l1`；并用 Playwright + style-l1 admin mock 在 `127.0.0.1:4297` 实测物料顶部、物料页脚、色卡顶部和色卡页脚：`fieldAlignItems=baseline`，字段名文字和值文字 `textTopDelta=0`，编辑框内部 `editorAlignItems=center`，文字中心偏差 `0.27-0.8px`，焦点态仍为 `rgba(47, 143, 75, 0.82) ... inset` + `rgba(47, 143, 75, 0.08)` + `outline: none`；截图输出到 `web/output/playwright/style-l1/engineering-template-review/runtime/*-label-text-editor-text-aligned-focused.png`。未跑完整全站 `style:l1`；当前工作区已有完整 `engineering-print-workspace-row-buttons` 焦点切换失败未在本轮处理。

## 2026-07-08 作业指导书入口归属修正

完成：按 `$plush-domain-boundary-governance` 和 `$plush-page-design-governance` 修正打印入口归属：BOM 管理页现在负责 `打印物料明细 / 打印色卡 / 打印作业指导书` 三套工程资料模板；委外订单页只保留 `加工合同打印`，删除作业指导书入口和旧的委外订单到作业指导书草稿 mapper。同步把作业指导书模板 `moduleKeys`、服务端 PDF 模块门禁、server 测试、README、当前真源索引、打印模板字段清单、实现原理文档和 priority audit 锚点从 `outsourcing_orders` 改为 `material_bom`，避免 BOM 页打开作业指导书后被委外模块状态误拦。

下一步：后续如果作业指导书需要进一步带出工序、部门或工艺步骤，应从 BOM / 工程资料当前真源或打印草稿补充，不要重新把入口放回委外订单页；委外订单页继续只承接加工合同源单打印。

阻塞/风险：追加前 `progress.md` 为 254 行、69145 字节，未达到 600 行或 80KiB 归档阈值。本轮不改 schema、migration、RBAC 权限码、Workflow / Fact、BOM usecase、委外 usecase、源 Excel、客户配置激活、服务端 PDF 渲染主体或真实导入。已通过 `node --check web/src/erp/data/engineeringPrintTemplates.mjs web/src/erp/pages/BOMVersionsPage.jsx web/src/erp/pages/V1OutsourcingOrdersPage.jsx web/src/erp/config/printTemplates.mjs web/src/erp/utils/businessModuleNavigation.test.mjs web/scripts/style-l1/businessFormalScenarios.mjs scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --test web/src/erp/utils/engineeringPrintEditor.test.mjs web/src/erp/config/printTemplates.test.mjs web/src/erp/utils/businessModuleNavigation.test.mjs`、`go test ./internal/server -run 'TestTemplatePDFReferencedModuleKeys|TestEnforceTemplatePDFModulesEnabled'`、`/usr/local/bin/pnpm --dir web exec eslint --ext .jsx src/erp/pages/BOMVersionsPage.jsx src/erp/pages/V1OutsourcingOrdersPage.jsx`、`/usr/local/bin/pnpm --dir web exec eslint src/erp/data/engineeringPrintTemplates.mjs src/erp/config/printTemplates.mjs src/erp/utils/engineeringPrintEditor.test.mjs src/erp/config/printTemplates.test.mjs src/erp/utils/businessModuleNavigation.test.mjs scripts/style-l1/businessFormalScenarios.mjs`、`/usr/local/bin/pnpm --dir web exec eslint scripts/style-l1/scenarios.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=print-template-business-entry-ownership STYLE_L1_BASE_URL=http://127.0.0.1:4312 /usr/local/bin/pnpm --dir web style:l1`。第一次自启动 L1 两次落到 `chrome-error://chromewebdata/`，手动 `STYLE_L1_BASE_URL` 未启动服务时连接被拒绝；临时启动 Vite 时未设置 `ERP_VITE_HMR_CLIENT_PORT` 又触发 5175 HMR console error。最终用 `ERP_VITE_PORT=4312 ERP_VITE_HMR_CLIENT_PORT=4312 /usr/local/bin/pnpm --dir web exec vite --config vite.config.mjs --host 127.0.0.1 --port 4312 --strictPort` 提供页面后，窄场景通过。根目录 `scripts/qa/multi-client-role-workflow-priority-audit.mjs` 不在 web ESLint base path 内，已用 `node --check` 覆盖语法。

## 2026-07-08 五套打印模板长业务带值换行回归

完成：按 `$plush-print-template-source-governance` 和 `$plush-test-governance` 对五套正式打印模板做长业务值回归，新增 `print-workspace-all-template-long-business-values` style:l1 场景：逐个打开 `采购合同`、`加工合同`、`物料分析明细表`、`色卡`、`作业指导书` 的独立打印工作台，对右侧纸面内可编辑业务值槽注入连续长值，断言值槽、父单元格和纸面均无横向溢出、无越界、无覆盖相邻区域。验证发现作业指导书窄列仍被 `pre-wrap + break-word` 撑出 `scrollWidth`，本轮将作业指导书纸面单元格和可编辑层收口为 `overflow-wrap:anywhere` + `word-break:break-word`，保留多行文本换行语义。

下一步：后续新增正式模板或新增业务页带值入口时，应复用该跨模板长值场景扩 coverage matrix；若要继续验证 PDF 二进制输出，需要单独跑在线预览 / 下载 PDF 链路，不把右侧纸面 DOM 回归等同于 PDF 服务端渲染全闭环。

阻塞/风险：追加前 `progress.md` 为 262 行、72292 字节，未达到 600 行或 80KiB 归档阈值。本轮只改打印纸面样式、style:l1 断言与进度记录；不改 schema、migration、RBAC、Workflow / Fact、BOM / 采购 / 委外 usecase、服务端 PDF 渲染主体、源 Excel、客户配置激活、图片槽、工具栏或真实业务写入。已通过 `node --check web/scripts/style-l1/printAssertions.mjs web/scripts/style-l1/scenarios.mjs web/scripts/styleL1.mjs`、`/usr/local/bin/pnpm --dir web exec eslint scripts/style-l1/printAssertions.mjs scripts/style-l1/scenarios.mjs scripts/styleL1.mjs`、`/usr/local/bin/pnpm --dir web css`、`STYLE_L1_SCENARIOS=print-workspace-processing STYLE_L1_BASE_URL=http://127.0.0.1:4316 /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=print-workspace-all-template-long-business-values STYLE_L1_BASE_URL=http://127.0.0.1:4316 /usr/local/bin/pnpm --dir web style:l1` 和 `git diff --check`。style:l1 自启动 `localhost` 在当前本机环境仍会落到 `chrome-error://chromewebdata/`；本轮使用 `ERP_VITE_HMR_CLIENT_PORT=4316 ... vite --host 127.0.0.1 --port 4316 --strictPort` 提供稳定页面后执行回归。截图证据输出到 `web/output/playwright/style-l1/print-workspace-*-long-business-values.png`。

## 2026-07-08 打印模板与 Workflow L1 收口提交

完成：提交前按 `$git-closeout-coordination` 接管 full-worktree closeout，并按 `$plush-test-governance` 补齐验证。修正 `web/scripts/styleL1.mjs` 自启动口径，默认使用 `127.0.0.1` 访问、Vite 监听 `0.0.0.0`，并把文档 ready 等待统一到 45 秒，避免本机 `localhost` alias 重定向后出现 `chrome-error://chromewebdata/`。同步把出货放行只读 L1 场景对齐当前真实路由：补 `customerKey: yoyoosun`、按 `list_tasks` 当前合同返回任务、为 `explain_action_access` 返回四个 denied 动作，并断言选中后写动作禁用、表格行无动作按钮和无横向溢出。

下一步：后续若把 `/erp/warehouse/shipping-release` 从 `WorkflowBusinessModulePage` 迁到 `FormalBusinessModulePage`，需要同步重写该只读场景的页面选择器和断言；不要只改 `businessModules.mjs` 的 `pageKind`。

阻塞/风险：追加前 `progress.md` 为 286 行、80171 字节，未达到 600 行或 80KiB 归档阈值。已通过 `git diff --check`、`/usr/local/bin/pnpm --dir web test`、`scripts/qa/fast.sh`、`STYLE_L1_SCENARIOS=root-redirect-desktop,permission-center-desktop /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=print-workspace-all-template-long-business-values /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-formal-shipping-release-readonly-actions-desktop /usr/local/bin/pnpm --dir web style:l1`，以及全量 style:l1 分片 `30 + 30 + 29` 个场景。未在本轮改变 schema、migration、RBAC 权限码、Workflow / Fact usecase、服务端 PDF 渲染主体或真实业务写入。
