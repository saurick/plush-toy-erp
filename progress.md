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
