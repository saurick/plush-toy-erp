# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。

## 2026-06-03 13:59
- 完成：在 `docs/README.md` 新增“设计文档分类入口 / Design Document Entry Points”，按顶层设计、详细设计、测试与验收设计、客户与交付设计、参考与归档列出人工校对和任务拆分常用入口；同时明确该分类不替代 `docs/document-inventory.md` 完整清单，也不替代 `docs/current-source-of-truth.md`、代码、migration 和测试。
- 下一步：后续人工校对设计文档时，可先按 `docs/README.md` 分类入口逐层检查；若新增、删除、重命名长期维护文档或改变职责分类，再同步检查 `docs/document-inventory.md` 和相关目录 README。
- 阻塞/风险：docs-only 导航补充；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、`business_records` 或部署主路径。本轮追加前 `progress.md` 为 162 行 / 30370 bytes，未达到归档阈值。

## 2026-06-03 12:16
- 完成：移除前端产品内文档中心、帮助中心、高级文档和开发与验收页面的运行时代码与 Markdown，包括 `web/src/erp/docs/*`、`docs.mjs`、对应页面 / 组件 / util / 测试、前端 debug API client 和相关样式；旧 `/erp/docs/*`、`/erp/qa/*`、`/erp/help-center`、`/erp/source-readiness`、`/erp/mobile-workbenches`、`/erp/roles/*` 等路径仅兼容重定向到 `/erp/dashboard`。
- 完成：同步服务端内置菜单和 RBAC，移除帮助中心权限与旧 docs / QA 菜单下发，旧菜单权限归一到看板；同步 `AGENTS.md`、`README.md`、`docs/current-source-of-truth.md`、`web/README.md`、产品 / 架构 / 客户相关文档和 `docs/document-inventory.md`，将当前口径收敛为“仓库正式文档保留，产品内文档入口已下线”。
- 下一步：若未来要恢复产品内业务帮助或开发验收入口，需单独设计 registry、菜单权限、路由、seed navigation 和浏览器回归；不要复用本轮删除的旧页面作为隐藏真源。
- 阻塞/风险：本轮未改 schema、migration、库存 / 出货 / 财务 fact usecase、真实导入 loader 或部署脚本；后端 debug JSON-RPC 能力仍保留为受权限保护的内部调试接口，不再有前端调试页面入口。验证已通过 `cd web && pnpm lint && pnpm css && pnpm test && pnpm style:l1`、`cd server && go test ./internal/biz ./internal/data`、`git diff --check`。本轮追加前 `progress.md` 为 156 行 / 28819 bytes，未达到归档阈值。

## 2026-06-02 21:15
- 完成：批量补齐长期维护 Markdown 的 H1 中文主体 + English anchor，覆盖产品、架构、工作流、仓库、财务、角色、可观测性、部署约定、打印模板说明、外部 imported notes、客户 evidence 和旧架构归档文档；同时给旧进度归档补 H1。
- 下一步：后续新增或触达长期维护 Markdown 时，继续保持 H1 和 `docs/document-inventory.md` 的标题 / 当前用途口径一致；不要把标题双语化误认为 runtime、schema、API 或 UI 能力变化。
- 阻塞/风险：docs-only 标题收口；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、数据库或部署配置。

## 2026-06-02 21:08
- 完成：修正 `docs/architecture/finished-goods-inbound-workflow-review.md` H1 标题，按仓库长期维护 Markdown 约定改为中文主体 + English anchor：`成品入库 Workflow Usecase 评审 / Finished Goods Inbound Workflow Usecase Review`。
- 下一步：后续触达其它长期维护 Markdown 时，继续检查 H1 和文档清单是否保持中文主体 + English anchor；本轮不批量重命名相邻评审文档。
- 阻塞/风险：docs-only 标题修正；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 140 行 / 26203 bytes，未达到归档阈值。

## 2026-06-02 21:07
- 完成：收口旧执行工作流口径，活跃规则改为普通实施任务边界：同步 `AGENTS.md`、当前真源、产品路线、实施治理、测试策略、文档清单、客户导入资料和 import dry-run / freeze checker 输出文案，统一避免把旧执行规格目录、短任务模板或本地审查报告当当前执行主路径。
- 完成：将原执行规格目录下 4 个模板 / 协议 Markdown 移入系统废纸篓，Git 记录为删除；`docs/document-inventory.md` 已移除该活跃分类，避免旧模板继续充当隐藏真源。
- 下一步：后续非平凡任务直接在当前会话、正式设计文档、roadmap 或台账中明确目标、允许 / 禁止路径、验收命令、停止条件和风险；如需要审查材料，直接在最终回复或用户指定文档中输出，不恢复本地审查报告默认流程。
- 阻塞/风险：docs/script wording 收口；未改 runtime 业务逻辑、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、数据库或部署配置。本轮追加前 `progress.md` 为 140 行 / 26203 bytes，未达到归档阈值。

## 2026-06-02 20:45
- 完成：审查 `docs` 目录 README 覆盖情况，补齐长期维护目录 README：`docs/architecture/README.md`、`docs/product/README.md`、`docs/customers/README.md`、`docs/reference/README.md`、`docs/workflow/README.md`、`docs/roles/README.md`、`docs/finance/README.md`、`docs/warehouse/README.md`、`docs/observability/README.md`。
- 完成：同步 `AGENTS.md` 和 `docs/README.md` 的目录 README 维护规则；同步 `docs/document-inventory.md` 新增 README 条目；修正 `docs/reference/imported-notes/README.md` 漏列的 imported notes 文件。
- 下一步：后续新增、删除、重命名长期维护文档，或改变文档职责、归属目录、入口状态、真源状态时，同时检查对应目录 README 和 `docs/document-inventory.md`。
- 阻塞/风险：docs-only 目录说明补齐；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、`business_records` 或部署主路径。本轮追加前 `progress.md` 为 134 行 / 25062 bytes，未达到归档阈值。工作区已有其他 docs 现场改动，本轮未回退。

## 2026-06-02 20:36
- 完成：将 `docs/architecture/` 中 6 份旧 Phase 实现历史评审归档到 `docs/archive/architecture-history/`，包括 `phase-2b-bom-lot-schema-review.md`、`phase-2c-purchase-receipt-review.md`、`phase-2d-purchase-return-quality-review.md`、`phase-2d-purchase-receipt-adjustment-review.md`、`phase-2d-quality-inspection-entry-review.md` 和 `phase-2d-quality-inspection-schema-review.md`；新增归档 README，明确这些文件只作历史追溯，不再作为当前架构真源。
- 完成：同步 `AGENTS.md`、根 `README.md`、`docs/current-source-of-truth.md`、`docs/document-inventory.md` 和 `docs/archive/README.md`，把活跃架构入口收口到长期边界文档，避免旧 Phase 施工记录继续主导后续 roadmap 或模块实现。
- 下一步：后续模块实现任务先读活跃 `docs/architecture/*` 边界文档和 `docs/current-source-of-truth.md`；若归档 Phase 文档中有结论需要恢复为当前真源，必须先抽取到正式架构 / 产品文档并重新验收。
- 阻塞/风险：docs-only 归档；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader、部署配置或本地审查报告。 本轮追加前 `progress.md` 为 128 行 / 23768 bytes，未达到归档阈值。

## 2026-06-02 20:24
- 完成：新增 `docs/product/implementation-governance.md`，固化模块实施治理口径，明确 Phase 是实施顺序，Architecture Layer 是职责边界，并补充标准模块开发闭环、模块类型适用强度、阶段门禁、禁止项和实施任务拆分规则。
- 完成：同步 `docs/product/product-completion-roadmap.md` 的短引用、`docs/current-source-of-truth.md` 的阅读入口和 `docs/document-inventory.md` 的长期文档登记。
- 下一步：后续拆新模块实现任务前先按 `docs/product/implementation-governance.md` 确认 Phase、Architecture Layer、门禁、允许范围和测试层级，再进入 schema、usecase、API/RBAC、UI 或 delivery/import。
- 阻塞/风险：docs-only 治理文档收口；未改 runtime、schema、migration、generated code、server/web 代码、seedData、docs registry、API、RBAC、UI、真实 import loader 或本地审查报告。本轮追加前 `progress.md` 为 122 行 / 22741 bytes，未达到归档阈值。

## 2026-06-02 19:50
- 完成：删除 `docs/product/product-completion-roadmap.md` 顶部“本次重构结论”过程说明，避免 roadmap 长期保留来源解释和补丁口吻；同步前移 `0.x` 小节编号，并收紧 metadata 中“不包含”的表述。
- 下一步：后续 roadmap 只保留当前产品路线、边界和阶段结果；过程来源、调整背景和本轮执行记录只进入 `progress.md` 或用户指定的验收材料。
- 阻塞/风险：docs-only 文案收口；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、`business_records` 或部署主路径。本轮追加前 `progress.md` 为 117 行 / 22025 bytes，未达到归档阈值。

## 2026-06-02 19:31
- 完成：将 `docs/product/product-completion-roadmap.md` 从旧 `00x` 编号执行进度口径重构为“重新做项目”的 Phase 路线，明确旧编号只作为历史施工记录，新路线按 Phase 0 到 Phase 12 表达。
- 完成：同步 `docs/product/product-delivery-ledgers.md` 的当前推荐下一步和相关前置条件，把 `v1-formal-menu-and-legacy-entry-exit`、旧 import loader 编号式路线改为 Phase 制；同步 `docs/current-source-of-truth.md` 对 roadmap 的描述，避免继续暗示 roadmap 是旧候选任务顺序。
- 下一步：如果继续执行，应先拆 `Phase 0 docs-only reset` 的正式任务说明，限定为产品原则、分层、状态边界、客户配置、交付骨架、测试策略和任务拆分规则，不改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry 或 loader。
- 阻塞/风险：docs-only roadmap 重构；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、`business_records` 或部署主路径。本轮追加前 `progress.md` 为 111 行 / 20871 bytes，未达到归档阈值。

## 2026-06-02 17:15
- 完成：同步修正 `AGENTS.md` 中残留的 `current` 客户边界口径，明确当前永绅客户稳定 key 是 `yoyoosun`，不要恢复 `current` 客户目录或导入工作区别名，并把“禁止把 current 客户资料写成 Product Core”改为“禁止把任一客户资料写成 Product Core”。
- 完成：将工程原则中的文档同步规则扩展为：代码行为、目录结构、脚本名称、部署方式、配置字段、客户 key 或正式文档口径变化时，必须同轮检查并按需更新相关 README、docs、`docs/current-source-of-truth.md`、`docs/document-inventory.md`、产品 / 架构文档、帮助文档和 `progress.md`。
- 完成：新增根 `.gitattributes`，将 `docs/customers/*/raw-source-files/**` 标记为 binary；同步 `docs/customers/yoyoosun/raw-source-files/README.md`，明确 Git 不应把原始 Excel / PDF / PNG 当文本做 whitespace 检查或展示正文 diff。
- 下一步：后续改代码、目录、脚本名、客户 key 或正式口径时，按 `AGENTS.md` 先确认影响面，再同步相关文档；只属于历史归档、外部参考或普通变量名的 `current` 不机械改。
- 阻塞/风险：规则 / docs 口径修正；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、`business_records` 或部署主路径。本轮追加前 `progress.md` 为 104 行 / 19403 bytes，未达到归档阈值。

## 2026-06-02 17:07
- 完成：按用户确认删除 `current` 客户目录 / 导入工作区别名，将可追溯客户资料统一收口到 `docs/customers/yoyoosun/`，并同步 `config/customers/yoyoosun/`、`deployments/yoyoosun/`、`scripts/import/fixtures/customers/yoyoosun/`。
- 完成：将 import tooling 从 `currentCustomerDryRun` / `currentSourceSnapshotFreezeCheck` 改为通用 `customerImportDryRun` / `customerSourceSnapshotFreezeCheck`，同时把 yoyoosun fixture 与 evidence 输出路径改到客户 key 下；同步 README、当前真源、文档清单、产品路线、交付台账和客户导入文档，移除活跃文档里的 `current` 客户 key 口径。
- 下一步：后续同时处理多个客户时，按 `docs/customers/<customer-key>/`、`config/customers/<customer-key>/`、`deployments/<customer-key>/` 和 `scripts/import/fixtures/customers/<customer-key>/` 并列隔离；不要恢复 `current` alias。
- 阻塞/风险：本轮不改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、真实 import loader、`business_records` 或部署主路径；原始二进制文件仍直接进入 Git，后续继续批量增加时应单独评审 Git LFS / 对象存储 / 脱敏 fixture。本轮追加前 `progress.md` 为 98 行 / 18077 bytes，未达到归档阈值。

## 2026-06-02 16:50
- 完成：补齐 `docs/` 下 19 个 `Doc Type / 文档类型` metadata 值的中文说明，保留原 English anchor，并将 `Current Source Snapshot Freeze Evidence` 明确为 `current 来源快照冻结证据`。
- 完成：同步 `docs/README.md` 文档 metadata 规则，明确凡出现 `Doc Type / 文档类型`，类型值必须保留 English anchor 并补中文说明。
- 下一步：后续新增带 metadata 头的 Markdown 时，先按 `docs/README.md` 保持字段名和值的中英可读性，再判断是否需要同步 `docs/document-inventory.md`。
- 阻塞/风险：docs-only 文案口径修正；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader、`business_records` 或部署配置。本轮追加前 `progress.md` 为 92 行 / 17229 bytes，未达到归档阈值。

## 2026-06-02 16:33
- 完成：按客户维度修正原始文件归档路径，将永绅客户稳定 key 定为 `yoyoosun`，把原件目录和归档评审从 `docs/customers/current/` 移到 `docs/customers/yoyoosun/`。
- 完成：新增 `docs/customers/yoyoosun/README.md`，同步 `docs/customers/current/README.md`、`source-materials.md`、`docs/current-source-of-truth.md` 和 `docs/document-inventory.md`，明确 `current` 只是当前活跃客户 / 导入工作区别名，不是长期客户 key；后续多客户资料按 `docs/customers/<customer-key>/` 隔离。
- 下一步：后续若需要客户级配置或交付包，应优先建立 `config/customers/yoyoosun/*` 和 `deployments/yoyoosun/*`，不要继续把长期客户资料塞进 `current`。
- 阻塞/风险：docs-only + 原件归档路径修正；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader、`business_records` 或部署配置。

## 2026-06-02 16:27（已由 16:33 修正）
- 完成：当时修正 current 原始客户文件归档口径，将 8 个本地原始 Excel / PDF / PNG 复制到 `docs/customers/current/raw-source-files/`，保留原始文件名，用于后续字段、模板、导入、页面和验收溯源；该路径已在 16:33 修正为 `docs/customers/yoyoosun/raw-source-files/`。
- 完成：当时新增 `docs/customers/current/raw-source-files/README.md`，并同步 `raw-source-file-archive-review.md`、`source-materials.md`、`README.md`、`docs/current-source-of-truth.md` 和 `docs/document-inventory.md`，明确原件已在项目归档，但仍不是 Product Core、runtime、schema、migration、API、UI、seedData、docs registry、真实导入批准或 `business_records` cutover；该归档文档已在 16:33 移至 `docs/customers/yoyoosun/`。
- 下一步：后续从原件推进功能前，先生成脱敏 / 结构化 fixture 或正式产品 / 架构评审；如果继续批量增加原始二进制文件，再评审 Git LFS、对象存储或只提交脱敏样本。
- 阻塞/风险：当前仓库未启用 Git LFS，本批原件约 24MB，直接进入 Git 会增加仓库历史体积；本轮未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader、`business_records` 或部署配置。本轮追加前 `progress.md` 为 80 行 / 14564 bytes，未达到归档阈值。

## 2026-06-02 16:18（已由 16:27 和 16:33 修正）
- 完成：当时新增 `docs/customers/current/raw-source-file-archive-review.md`，登记 `/Users/simon/Downloads/永绅erp/原文件/` 下 8 个 current 原始 Excel / PDF / PNG 的类型、大小、checksum、用途分类、允许落点和禁止事项；该归档文档已在 16:33 移至 `docs/customers/yoyoosun/raw-source-file-archive-review.md`。
- 完成：同步 `docs/customers/current/README.md`、`docs/customers/current/source-materials.md`、`docs/document-inventory.md` 和 `docs/current-source-of-truth.md`，当时明确原始文件本轮不移动进仓库、不提交二进制原件、不作为 Product Core 或真实导入批准；该“原件不进仓库”口径已在 16:27 修正为“原件进入 `raw-source-files/` 归档，但仍不作为 Product Core 或真实导入批准”。
- 下一步：如需从原件生成 dry-run 数据，先做脱敏 / 结构化 snapshot fixture，落到 `scripts/import/fixtures/current/*`；如需迁移原件，另开归档迁移任务评审敏感信息、引用关系、docs registry、测试断言和 Git 历史体积。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader、`business_records` 或部署配置。本轮追加前 `progress.md` 为 74 行 / 13483 bytes，未达到归档阈值。

## 2026-06-02 16:03
- 完成：检查 tracked Markdown 的中英可读性状态，确认 metadata 字段已无英文-only 问题、`docs/document-inventory.md` 清单无漏列 / stale 路径 / 英文-only 用途项。
- 完成：将 54 个仍为英文-only 的 Markdown H1 标题补为中文主体 + English anchor，覆盖根 README、配置 / 部署 README、架构评审、产品路线、current 客户资料、外部参考、server internal README、脚本 fixtures 和前端骨架 README。
- 完成：继续补齐当前活跃文档里明显用于阅读的英文-only 二级 / 三级章节标题，共 111 处；保留外部导入原文、归档日期标题、纯表名 / API / 代码锚点等不适合机械翻译的标题边界。
- 完成：把“长期维护 Markdown H1 标题和用于阅读的主要章节标题应中文主体 + English anchor”的规则同步写入 `AGENTS.md` 和 `docs/README.md`。
- 下一步：后续新增或重命名长期维护 Markdown 文档时，同时检查 H1、主要章节标题、metadata 和 `docs/document-inventory.md` 标题 / 用途列是否都保留中文说明与 English anchor。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 66 行 / 12127 bytes，未达到归档阈值。

## 2026-06-02 15:47
- 完成：将 `docs/document-inventory.md` 的“标题 / 当前用途”清单项统一补成中文主体 + English anchor，覆盖架构评审、产品路线、current 客户资料、外部参考、前端 / 后端 / 脚本说明等仍偏英文的条目，方便人工审查时先读懂用途、再用英文锚点检索。
- 完成：把“文档清单标题 / 用途列必须中文主体 + English anchor”的规则同步写入 `AGENTS.md`、`docs/README.md` 和 `docs/document-inventory.md` 使用规则。
- 下一步：后续新增、删除、重命名或调整长期维护 Markdown 文档时，除同步清单外，也要按中文主体 + English anchor 维护清单里的“标题 / 当前用途”列。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 60 行 / 11157 bytes，未达到归档阈值。

## 2026-06-02 15:34
- 完成：按“活跃文档树回到 roadmap / current-source / product-delivery-ledgers”的口径清理历史遗留文档。删除已完成编号执行规格 `000` 到 `012`、旧 `rewrite-roadmap` 兼容入口、早期根目录初始化 / 主流程 / 数据模型 / 项目状态文档，以及旧 Phase 1 / V1 schema draft、cutline、go/no-go、旧下一步规划等执行规划文档；这些内容后续仅从 Git 历史或 `docs/archive/*` 过程线索追溯。
- 完成：同步 `README.md`、`AGENTS.md`、`docs/README.md`、`docs/document-inventory.md`、`docs/current-source-of-truth.md`、原执行规格目录模板说明、`docs/product/product-completion-roadmap.md`、`docs/product/domain-model-v1.md`、`docs/product/product-delivery-ledgers.md`、`docs/product/business-records-reference-audit.md`、`docs/product/business-records-cutover-plan.md`、`docs/architecture/phase-2b-bom-lot-schema-review.md` 和 `scripts/project-scan.sh`，移除活跃文档对已删除文件的引用。
- 下一步：剩余 `business_records` 过渡文档、current import 文档、正式架构评审、产品内帮助文档和 imported-notes 仍保留；它们分别对应 roadmap 第 13 / 14 阶段、当前事实边界、产品内展示或 Reference Only 输入，后续应按具体阶段再整合，不在本轮无差别删除。
- 阻塞/风险：docs / governance cleanup；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。`scripts/project-scan.sh` 仅更新扫描目标中的已删除文档路径。本轮追加前 `progress.md` 为 54 行 / 9495 bytes，未达到归档阈值。

## 2026-06-02 15:06
- 完成：按用户已删除 `docs/changes/*` 的现场同步相关文档，更新 `docs/document-inventory.md`、`docs/README.md` 和 `web/README.md`，移除当前索引和前端文档规则中的 `docs/changes/*` 入口；保留 `docs/current-source-of-truth.md` 中“历史 changes 文件已清理、当前状态回到真源索引 / 正式文档 / 代码 / 测试”的口径。
- 下一步：后续若需要追溯旧 changes 内容，只能从 Git 历史或 `docs/archive/progress-2026-06-02-before-print-template-defer.md` 的过程线索回查；当前文档清单不再列出 `docs/changes/*`。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 49 行 / 8649 bytes，未达到归档阈值。

## 2026-06-02 12:42
- 完成：将 `docs/document-inventory.md` 同步维护规则写入 `AGENTS.md`、`docs/README.md` 和 `docs/document-inventory.md` 本身：新增、删除、重命名长期维护 Markdown 文档，或调整文档用途、归属分类、产品内入口 / 外部参考 / 归档 / 任务说明等入口状态时，必须同步更新文档清单。
- 完成：明确例外边界：只改现有文档正文、措辞、局部结论或表格数据，且不改变标题、职责、分类、路径或入口状态时，通常不需要更新文档清单；如果清单中的“标题 / 当前用途”会因此失真，则必须同步更新。
- 下一步：后续文档增删改名或分类调整时，按该规则同步维护 `docs/document-inventory.md`。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 43 行 / 7658 bytes，未达到归档阈值。

## 2026-06-02 12:39
- 完成：将现有英文 metadata 字段名双语化，覆盖 `Doc Type`、`Status`、`Runtime Implemented`、`Ent Schema Implemented`、`Migration Implemented`、`Current Implementation Source of Truth`、`Runtime Source of Truth`、`Schema Source of Truth`、`Notes`、`Current Evidence Inputs` 以及 imported note 的 `Source`、`Imported At`、`Purpose`、`Not Source Of Truth` 等字段；同时给常见 `Status` 值和 `Yes/No` 值补中文说明。
- 完成：新增 `docs/document-inventory.md`，按仓库根文档、配置与部署骨架、docs 真源入口、架构评审、产品与路线、客户资料边界、旧执行规格、历史变更、外部参考、前端产品内文档、前后端 / 脚本说明等分类列出当前 tracked Markdown 文档；同步在根 `README.md` 和 `docs/README.md` 增加文档清单入口。
- 下一步：后续新增、删除或重命名长期维护文档时，同步更新 `docs/document-inventory.md`；若状态值或类型值容易误解，在对应文档触达时继续补中文值说明。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 37 行 / 6371 bytes，未达到归档阈值。

## 2026-06-02 12:23
- 完成：补充 metadata 双语规则：后续若新增可被机器读取或跨团队复用的 metadata，必须同时保留中文说明和 English anchor；推荐 `title_zh/title_en`、`summary_zh/summary_en`、`status_zh/status_key` 这类成对字段。
- 完成：明确当前前端 registry 尚未消费 `title_en` / `summary_en` 等字段；如要新增双语 metadata 到运行时 registry，必须同步修改渲染消费逻辑和 `docs.test.mjs`，不能只写未生效字段。
- 下一步：如果后续决定真正支持双语前端文档展示，再单独拆 UI / registry / test 任务，先设计字段结构再落代码。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 31 行 / 5490 bytes，未达到归档阈值。

## 2026-06-02 12:22
- 完成：整理文档 metadata / registry 边界，明确当前仓库不要求所有 Markdown 添加 YAML frontmatter 或统一 metadata 头；metadata 主要用于减少产品内文档入口、受众、状态和是否接入前端页面的信息差，不制造新的内容真源。
- 完成：在 `docs/README.md` 增加全仓分类规则，列出 `README`、`docs/current-source-of-truth.md`、`docs/product/*`、`docs/architecture/*`、旧执行规格目录、`docs/changes/*`、`docs/archive/*`、`progress.md`、`docs/reference/imported-notes/*`、`server/docs/*` 等不需要产品内 metadata 的文档类型和应保留信息；在 `web/README.md` 增加前端文档注册约定，明确 `docRegistry`、`seedData.mjs` 和 `docs.test.mjs` 才是产品内文档入口守卫。
- 下一步：后续若新增产品内文档页，只对 `web/src/erp/docs/*.md` 走 `docs.mjs` / `seedData.mjs` 注册；若要引入 Markdown frontmatter，必须先实现解析器和测试，再限定目录。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 25 行 / 4253 bytes，未达到归档阈值。

## 2026-06-02 12:01
- 完成：读取 `/Users/simon/Desktop/automated-test-strategy.md`，将其中适合本项目的自动化测试分层、Workflow / Fact 边界检查、docs-only 验收、Schema / Migration、Repo / Usecase、API / RBAC、Frontend UI、current import dry-run / freeze 和部署前验收口径整理进 `docs/product/test-strategy.md`。
- 完成：明确暂不直接落地的内容，包括完整业务 E2E runner、真实 import loader 测试、shipment / finance 完整事实测试、backup / restore 脚本和 CI 分层自动化，避免把未来建议写成当前已实现能力；同步在 `README.md` 文档索引加入自动化测试策略入口。
- 下一步：后续新增真实 import loader、出货 / 财务事实层或 CI 流水线时，再按本文 T6 / T7 / T8 补 runner、结构化摘要和验收命令。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、import loader、部署脚本或 CI 配置。本轮追加前 `progress.md` 为 19 行 / 3170 bytes，未达到归档阈值。

## 2026-06-02 11:47
- 完成：按“打印模板暂不做产品内核”的决策收紧正式产品文档。`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`、`docs/product/zero-to-one-architecture.md`、`docs/product/product-principles.md`、`docs/product/config-permission-policy.md`、`docs/product/v1-schema-go-no-go.md`、`docs/product/customer-delta-policy.md` 和 `docs/product/formal-menu-entry-plan.md` 均已明确：打印格式当前只作为客户打印样本、交付诉求或 `Print Template Candidate` 记录，默认 Deferred；不进入 Product Core，不作为行业模板默认能力，不新增模板 schema，不实现模板设计器或通用模板引擎。
- 完成：同步 current 客户资料边界和业务记录过渡文档，把“打印模板 / 合同样式”统一改为客户打印样本、`Print Template Input` 或 `Print Template Candidate`；只有至少 2-3 个真实客户同类单据重复、字段来源稳定且差异主要是抬头 / 字段显示 / 版式微调时，才重新评审是否做 Print Template Core MVP。
- 下一步：如果后续客户继续提出打印格式诉求，先登记到客户差异台账和客户打印样本清单，不进入 roadmap 编号；等多客户重复性成立后再单独拆 `print-template-core-mvp-review`。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、打印中心实现、模板渲染、loader 或部署配置。旧 `progress.md` 已按阈值要求归档到 `docs/archive/progress-2026-06-02-before-print-template-defer.md`。

## 2026-06-02 10:28
- 完成：将 `/Users/simon/Desktop/plush-toy-erp-from-0-to-1-plan.md` 归档为 `docs/reference/imported-notes/plush-toy-erp-from-0-to-1-plan.md`，明确 `Reference Only`，不作为 runtime、schema、migration、API、UI、目录结构、roadmap 编号或交付排期真源；同步更新 imported-notes README 文件清单。
- 完成：从外部规划稿中只提炼稳定口径到正式文档：`docs/product/zero-to-one-architecture.md` 补业务闭环主线；`docs/product/domain-model-v1.md` 补业务域职责和字段 / API / 状态示例边界；`docs/architecture/status-workflow-fact-boundary.md` 补混合状态词拆层规则。
- 下一步：如继续吸收外部规划，只能按具体评审拆到 domain model、architecture review 或单独任务说明；roadmap 不吸收目录大重构、团队排期、时间估算或 API / schema 示例。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。`progress.md` 本次追加前已检查为 380 行 / 79551 bytes，后续再更新时大概率需要先归档。
