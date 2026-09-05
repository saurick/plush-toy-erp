---
name: plush-print-template-source-governance
description: 项目打印模板源治理（plush-toy-erp）。Use to interpret customer print sources or change plush template fields, layout, editing, and PDF fidelity; ordinary page shells use page governance.
---

# Plush Print Template Source Governance

从当前任务的 checkout / Worktree 内用 `git rev-parse --show-toplevel` 核对仓库根；下文命令以该根目录为工作目录，仓库内引用也相对它解析。

本技能负责本项目的源文件识别、纸面编辑和 PDF / print 保真。直接使用本项目规则，不预先加载内容等价的通用打印技能。

## Truth Chain / 必读真源

按任务范围读取，不机械全量展开：

- `AGENTS.md`
- `README.md`
- `docs/当前真源与交接顺序.md`
- `web/README.md`
- `docs/打印模板字段与编辑行为清单.md`
- `docs/打印模板实现原理.md`
- `docs/product/prototypes/README.md`；涉及 UI / prototype intent 时再读对应 prototype README
- `scripts/import/README.md` 和 `scripts/import/customerSourceManifestCheck.mjs`；涉及客户原件时，由客户 Private 仓库显式传入 `<private-root>/manifests/source-manifest.json` 与 `<private-root>/sources`，不在 Product Core 猜测路径
- `config/customers/<customer-key>/README.md`；涉及 runtime samples、extracted image assets 或 `printTemplateDefaults` 时必读
- 当前代码真源，重点是 `web/src/erp/pages/PrintCenterPage.jsx`、`web/src/erp/config/printTemplates.mjs`、`web/src/erp/data/engineeringPrintTemplates.mjs`、`web/src/erp/pages/EngineeringPrintWorkspacePage.jsx`、`web/src/erp/utils/engineeringPrintEditor.mjs`、`web/src/erp/utils/printWorkspace.js` 以及相关 print components / styles / tests

## Project Rules / 项目边界

- 当前正式模板包括 `采购合同`、`加工合同`、`物料分析明细表`、`色卡`、`作业指导书`。新增或改变正式模板时，必须同步检查 `fieldRequirements`、`moduleKeys`、`factBoundary: read_snapshot_only` 和服务端 PDF 模块门禁。
- yoyoosun raw sources 的当前真源在兄弟 Private 仓库 `plush-toy-erp-customer-yoyoosun-private`。必须先按其 `manifests/source-manifest.json` 核对 path、sha256、size、media type、source kind、structuredExtract policy 和 duplicate group，并向 Product Core 工具显式传 `--manifest`、`--raw-dir`；不要 glob 私有 sources，也不要把截图当正式 source chain。
- 打印输出真源是当前独立打印窗口里的右侧纸面 DOM；左侧字段面板、附件上传条和工具栏只是编辑入口，不是第二套模板。
- 打印模板只读业务快照和当前窗口草稿，不创建、确认、过账或反写采购、委外、生产、库存、质检、出货或财务事实。
- 客户源文件、私密 manifest、客户公司名、真实联系人、真实电话、真实签字人、客户图片和原始资料路径不能自动进入 Product Core 默认样例。真实原件及未脱敏提取物留在客户 Private 仓库；仅经评审的脱敏配置、模板与 public assets 才进入 Product Core 对应客户配置边界。
- 不要为了当前截图补页面私有真源、额外草稿 key、第二套 PDF HTML 或客户硬编码。
- 模板质量同样是交付边界：不要为某个截图堆一批一次性 CSS/JS 补丁、无限 base64 图片快照、整页截图型模板、重复测高循环或第二套隐藏 PDF DOM；优先复用 `printWorkspace.js`、`PrintWorkspaceShell`、工程模板 normalizer、共享图片槽和 scoped CSS。
- 正式模板变化时维护本项目覆盖矩阵：template key、source version、field requirements、mapper、renderer、PDF module gate、图片槽、browser / PDF checks 和盲区；以当前代码、正式 docs 和测试核对。
- Runtime limits 是正确性的一部分。复用现有 engineering row / image limits 和 server PDF payload / concurrency / timeout；如果新增 row / image / vector 路径，要补上对应 bound 或说明为什么现有 bound 足够。
- 职业任务文案是打印模板交付的一部分：模板标题、按钮、导出/PDF、帮助提示和正式打印件要使用岗位能理解的任务、影响和下一步；不要把 `mapper`、`snapshot`、`DOM`、`payload`、`source noise` 等开发术语直接暴露给业务用户。

## Select the Relevant Detail

| 当前任务 | 必要读取 |
| --- | --- |
| 引入、替换源文件，判断版本、重复区域、噪点或图片锚点 | [Source Analysis](references/source-analysis.md) |
| 修改模板字段、布局、编辑、图片、分页或 PDF | [Template Runtime](references/template-runtime.md) |
| 只改说明或技能本身 | validator、YAML / metadata、引用和 scoped diff 检查 |

仅加载命中的分支。局部模板修订可复用未变化的源版本证据；源基准或字段 / 版式解释受影响时才重新解析客户原件。模板内编辑属于当前技能；触达共享页面壳或普通业务页面时才补 `$plush-page-design-governance`，字段真源、API、RBAC 或业务事实变化使用 `$plush-domain-boundary-governance`。按 `$plush-test-governance` 选择验证及高成本授权。

## Workflow

1. 用 `GIT_OPTIONAL_LOCKS=0 git status --short` 核对当前任务现场，明确目标模板、源版本、现有运行路径和本次影响面。
2. 按上表读取来源或实现分支，复用当前真源和已有工具完成已授权改动。
3. 按影响面选择来源、字段、真实浏览器、DOM / box metrics 和 PDF / print 验证；新增正式模板或改变实现路径时同步本项目覆盖记录、文档与测试。

## Output

报告完成内容、实际验证及剩余盲区；仅展开本次相关的来源版本、字段映射、编辑恢复、图片或性能证据。客户资料保持受控，不能以本地绿色替代实际打印或客户验收。
