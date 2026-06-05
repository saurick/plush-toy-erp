Doc Type / 文档类型: Document Inventory / 文档清单
Status / 状态: Active Index / 当前索引
Runtime Source of Truth / 运行时真源: No / 否
Schema Source of Truth / Schema 真源: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否
Notes / 备注: 本文只用于查找和人工审查当前仓库 Markdown 文档，不替代 `docs/current-source-of-truth.md`、正式产品 / 架构文档、代码或测试。

# 文档清单 / Document Inventory

本文按目录整理当前仓库 tracked Markdown 文档，回答三个问题：

1. 当前有哪些文档。
2. 每类文档大致负责什么。
3. 哪些文档是产品内入口、哪些只是过程记录、外部参考或子系统说明。

本文不是业务真源，不是 roadmap，不是 schema / migration / runtime 状态真源。判断当前能力、当前禁止项和当前下一步时，仍先读 `docs/current-source-of-truth.md`，再读对应正式文档和代码。

## 使用规则

- `docs/product/*` 和 `docs/architecture/*` 是正式产品 / 架构评审文档；当前不再镜像到前端文档中心。
- `docs/archive/*`、`progress.md` 只用于历史追溯；原 `docs/changes/*` 历史文件已删除，当前状态回到 `docs/current-source-of-truth.md`、正式产品 / 架构文档、代码和测试交叉确认。
- `docs/reference/imported-notes/*` 是外部输入，必须先经过正式文档和代码复核。
- README / server docs / config docs / deployment docs 是目录、运行、部署或子系统维护说明。
- `docs/` 下长期维护目录的 `README.md` 只维护目录职责、非真源边界和更新规则，不维护每篇文档正文细节。
- 新增、删除、重命名长期维护 Markdown 文档，或调整文档用途、归属分类、入口状态时，必须同步更新本文。
- 只改现有文档正文且不改变标题、职责、分类、路径或入口状态时，可以不更新本文；若“标题 / 当前用途”会失真，则必须同步更新。
- 本文“标题 / 当前用途”列默认使用中文主体 + English anchor；若原文档标题是英文，仍应补中文说明，避免清单变成只有英文的索引。

## 文档清单

### 仓库根文档

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `AGENTS.md` | plush-toy-erp 协作约定 |
| `README.md` | 仓库总览、启动方式、当前边界和文档入口 |
| `progress.md` | 过程记录和最近完成事项，不作为当前正式需求真源 |

### 配置与部署骨架

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `config/customers/yoyoosun/README.md` | 永绅 yoyoosun 客户配置包骨架 |
| `config/industry-templates/plush/README.md` | 毛绒行业模板骨架 |
| `deployments/yoyoosun/README.md` | 永绅 yoyoosun 客户部署资料未来落点 |

### docs 根入口与当前真源

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/README.md` | 文档目录说明 / docs Directory Guide |
| `docs/document-inventory.md` | 文档清单 / Document Inventory |
| `docs/current-source-of-truth.md` | 当前真源与交接顺序 / Current Source Of Truth And Handoff Order |
| `docs/deployment-conventions.md` | 部署真源约定 / Deployment Conventions |
| `docs/erp-print-template-field-behavior.md` | 打印模板字段与编辑行为清单 / ERP Print Template Field Behavior |
| `docs/erp-print-template-implementation.md` | 打印模板实现原理 / ERP Print Template Implementation |

### 架构评审

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/architecture/README.md` | 架构评审 / Architecture Reviews |
| `docs/architecture/customer-supplier-masterdata-review.md` | 客户 / 供应商主数据评审 / Customer / Supplier MasterData Review |
| `docs/architecture/finished-goods-inbound-workflow-review.md` | 成品入库 Workflow Usecase 评审 / Finished Goods Inbound Workflow Usecase Review |
| `docs/architecture/industry-schema-review.md` | 行业专表 Ent Schema 评审 / Industry Schema Review |
| `docs/architecture/masterdata-order-source-document-review.md` | 主数据 / 源单据 / 事实边界评审 / MasterData / Source Document / Fact Review |
| `docs/architecture/material-product-inventory-schema-review.md` | 材料、成品、BOM 与库存专表 Schema 评审 |
| `docs/architecture/order-purchase-boundary-review.md` | 订单 / 采购边界评审 / Order / Purchase Boundary Review |
| `docs/architecture/product-sku-bom-boundary-review.md` | 产品 / SKU / BOM 边界评审 / Product / SKU / BOM Boundary Review |
| `docs/architecture/shipment-inventory-boundary-review.md` | 出货事实与库存边界评审 / Shipment / Inventory Boundary Review |
| `docs/architecture/shipment-release-workflow-review.md` | 出货放行 Workflow Usecase 评审 / Shipment Release Workflow Usecase Review |
| `docs/architecture/shipment-usecase-review.md` | 出货事实最小模型评审 / ShipmentUsecase Review |
| `docs/architecture/status-workflow-fact-boundary.md` | 状态 / Workflow / Fact 边界 / Status, Workflow And Fact Boundary |
| `docs/architecture/warehouse-inbound-workflow-review.md` | 仓库入库 Workflow Usecase 评审 / Warehouse Inbound Workflow Usecase Review |
| `docs/architecture/workflow-usecase-review.md` | 工作流 Usecase 统一编排评审 / Workflow Usecase Review |

### 产品与路线

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/product/README.md` | 产品与路线 / Product Docs |
| `docs/product/business-records-cutover-plan.md` | 业务记录切换计划 / business_records Cutover Plan |
| `docs/product/business-records-data-map-draft.md` | 业务记录数据映射草案 / business_records Data Map Draft |
| `docs/product/business-records-reference-audit.md` | 业务记录引用审计 / business_records Reference Audit |
| `docs/product/business-records-risk-register.md` | 业务记录风险登记 / business_records Risk Register |
| `docs/product/business-records-transition-audit.md` | 业务记录过渡审计 / business_records Transition Audit |
| `docs/product/business-records-transition-plan.md` | 业务记录过渡计划 / business_records Transition Plan |
| `docs/product/config-permission-policy.md` | 配置与权限策略 / Config And Permission Policy |
| `docs/product/customer-delta-policy.md` | 客户差异策略 / Customer Delta Policy |
| `docs/product/customer-instance-policy.md` | 客户实例策略 / Customer Instance Policy |
| `docs/product/domain-model-v1.md` | 领域模型 V1 / Domain Model V1 |
| `docs/product/formal-menu-entry-plan.md` | 正式产品入口与菜单配置计划 / Formal Menu Entry Plan |
| `docs/product/implementation-governance.md` | 模块实施治理 / Implementation Governance |
| `docs/product/migration-readiness-checklist.md` | 迁移准备检查清单 / Migration Readiness Checklist |
| `docs/product/module-boundaries.md` | 模块边界 / Module Boundaries |
| `docs/product/product-completion-roadmap.md` | 产品完成路线图 / Product Completion Roadmap |
| `docs/product/product-delivery-ledgers.md` | 产品能力进度台账、客户交付矩阵与客户差异台账 / Product Delivery Ledgers |
| `docs/product/product-principles.md` | 产品原则 / Product Principles |
| `docs/product/release-gates.md` | 发布门禁 / Release Gates |
| `docs/product/test-strategy.md` | 自动化测试策略 / Test Strategy |
| `docs/product/zero-to-one-architecture.md` | 零到一产品架构 / Zero To One Architecture |

### 客户资料边界

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/customers/README.md` | 客户资料 / Customer Materials |
| `docs/customers/yoyoosun/README.md` | 永绅 yoyoosun 客户资料 / Yoyoosun Customer Materials |
| `docs/customers/yoyoosun/assumption-register.md` | 假设登记 / Assumption Register |
| `docs/customers/yoyoosun/change-request-process.md` | 变更请求流程 / Change Request Process |
| `docs/customers/yoyoosun/customer-config-draft.md` | 客户配置草案 / Customer Config Draft |
| `docs/customers/yoyoosun/decision-log.md` | 决策日志 / Decision Log |
| `docs/customers/yoyoosun/delta-register.md` | 差异登记 / Delta Register |
| `docs/customers/yoyoosun/import-acceptance-checklist.md` | 永绅 yoyoosun 客户导入验收清单 / Yoyoosun Customer Import Acceptance Checklist |
| `docs/customers/yoyoosun/import-dry-run-plan.md` | 永绅 yoyoosun 客户导入 dry-run 计划 / Yoyoosun Customer Import Dry-run Plan |
| `docs/customers/yoyoosun/import-dry-run-tooling.md` | 永绅 yoyoosun 客户导入 dry-run 工具说明 / Yoyoosun Customer Import Dry-run Tooling |
| `docs/customers/yoyoosun/import-field-classification.md` | 永绅 yoyoosun 客户导入字段分类 / Yoyoosun Customer Import Field Classification |
| `docs/customers/yoyoosun/import-risk-register.md` | 永绅 yoyoosun 客户导入风险登记 / Yoyoosun Customer Import Risk Register |
| `docs/customers/yoyoosun/import-source-inventory.md` | 永绅 yoyoosun 客户导入来源清单 / Yoyoosun Customer Import Source Inventory |
| `docs/customers/yoyoosun/import-strategy.md` | 永绅 yoyoosun 客户导入策略 / Yoyoosun Customer Import Strategy |
| `docs/customers/yoyoosun/import-unresolved-queue.md` | 永绅 yoyoosun 客户导入待确认队列 / Yoyoosun Customer Import Unresolved Queue |
| `docs/customers/yoyoosun/question-backlog.md` | 问题待办 / Question Backlog |
| `docs/customers/yoyoosun/real-dry-run-evidence.md` | 永绅 yoyoosun 真实 dry-run evidence / Yoyoosun Real Dry-run Evidence |
| `docs/customers/yoyoosun/requirement-clues.md` | 需求线索 / Requirement Clues |
| `docs/customers/yoyoosun/source-materials.md` | 来源材料 / Source Materials |
| `docs/customers/yoyoosun/source-snapshot-freeze.md` | 永绅 yoyoosun 来源快照冻结 / Yoyoosun Source Snapshot Freeze |
| `docs/customers/yoyoosun/source-snapshot-manual-review-checklist.md` | 永绅 yoyoosun 来源快照人工复查清单 / Yoyoosun Source Snapshot Manual Review Checklist |
| `docs/customers/yoyoosun/raw-source-file-archive-review.md` | 永绅 yoyoosun 原始客户文件归档评审 / Yoyoosun Raw Source File Archive Review |
| `docs/customers/yoyoosun/raw-source-files/README.md` | 永绅 yoyoosun 原始客户文件 / Yoyoosun Raw Source Files |

### Workflow / 角色 / 财务 / 仓库 / 可观测性

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/workflow/README.md` | 工作流文档 / Workflow Docs |
| `docs/workflow/notification-alert-v1.md` | 通知、预警、催办与升级 v1 / Notification Alert v1 |
| `docs/workflow/task-flow-v1.md` | 工作流主任务树 v1 / Task Flow v1 |
| `docs/roles/README.md` | 角色与权限 / Roles And Permissions |
| `docs/roles/role-permission-matrix-v1.md` | 角色权限矩阵 v1 / Role Permission Matrix v1 |
| `docs/finance/README.md` | 财务文档 / Finance Docs |
| `docs/finance/finance-v1.md` | 财务 v1 / Finance v1 |
| `docs/warehouse/README.md` | 仓库与品质 / Warehouse And Quality |
| `docs/warehouse/warehouse-quality-v1.md` | 仓库与品质 v1 / Warehouse Quality v1 |
| `docs/observability/README.md` | 可观测性 / Observability |
| `docs/observability/log-trace-audit-v1.md` | 日志 / 审计 / Trace v1 / Log / Trace / Audit v1 |

### 归档

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/archive/README.md` | 归档 / Archive |
| `docs/archive/architecture-history/README.md` | 架构历史评审归档 / Architecture History Archive |
| `docs/archive/architecture-history/phase-2b-bom-lot-schema-review.md` | 库存批次与 BOM Schema 历史评审归档 / Phase 2B BOM And Inventory Lot Schema Review |
| `docs/archive/architecture-history/phase-2c-purchase-receipt-review.md` | 采购入库最小闭环历史评审归档 / Phase 2C Purchase Receipt Review |
| `docs/archive/architecture-history/phase-2d-purchase-receipt-adjustment-review.md` | 采购入库差异与入库后更正历史评审归档 / Phase 2D-B Purchase Receipt Adjustment Review |
| `docs/archive/architecture-history/phase-2d-purchase-return-quality-review.md` | 采购退货、入库差异与来料质检入口历史评审归档 / Phase 2D Purchase Return And Quality Review |
| `docs/archive/architecture-history/phase-2d-quality-inspection-entry-review.md` | 来料质检入口、批次状态与冻结库存边界历史评审归档 / Phase 2D-C Quality Inspection Entry Review |
| `docs/archive/architecture-history/phase-2d-quality-inspection-schema-review.md` | 来料质检最小主表历史评审归档 / Phase 2D-C2 quality_inspections Schema Review |
| `docs/archive/progress-2026-06-02-before-print-template-defer.md` | 过程记录归档 / Progress Archive 2026-06-02 Before Print Template Defer |
| `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md` | 移动端任务页改版前过程记录归档 / Progress Archive 2026-06-05 Before Mobile Task Redesign |

### 外部参考

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/reference/README.md` | 参考资料 / Reference |
| `docs/reference/imported-notes/README.md` | 外部设计输入 / Imported Design Notes |
| `docs/reference/imported-notes/erp_plush_productization_config_permission_workflow_state_design.md` | 毛绒玩具 ERP 产品化配置、权限、流程与状态设计总结 |
| `docs/reference/imported-notes/erp_status_workflow_context.md` | 状态分层、状态机、Workflow 与业务事实设计总结 / ERP Status Workflow Context |
| `docs/reference/imported-notes/plush-toy-erp-from-0-to-1-plan.md` | 外部导入说明：毛绒玩具 ERP 从 0 到 1 重构方案 / Imported Note: Plush Toy ERP From 0 To 1 Plan |

### 前端 / 后端 / 脚本说明

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `web/README.md` | web 前端说明 |
| `web/src/erp/mobile/roles/README.md` | 移动端角色骨架 / Mobile Roles Skeleton |
| `web/src/erp/modules/README.md` | ERP 模块骨架 / ERP Modules Skeleton |
| `server/README.md` | server 后端说明 |
| `server/deploy/README.md` | server/deploy 说明 |
| `server/deploy/compose/prod/README.md` | Compose 部署说明 |
| `server/docs/README.md` | server/docs 文档索引 |
| `server/docs/api.md` | JSON-RPC API 说明 |
| `server/docs/config.md` | 服务配置说明 |
| `server/docs/ent.md` | Ent + Atlas 数据模型说明 |
| `server/docs/observability.md` | 可观测性与健康检查说明 |
| `server/docs/runtime.md` | 服务运行说明 |
| `server/internal/biz/README.md` | 业务层说明 / Biz |
| `server/internal/core/README.md` | 核心层骨架 / Core Skeleton |
| `server/internal/data/AI_DB_WORKFLOW.md` | AI 助手数据库变更操作手册 |
| `server/internal/data/README.md` | 数据层说明 / Data |
| `server/internal/service/README.md` | 服务层说明 / Service |
| `server/pkg/taskgroup/README.md` | taskgroup 并发任务工具说明 / taskgroup |
| `server/third_party/README.md` | 第三方代码说明 / third_party |
| `server/third_party/validate/README.md` | protoc-gen-validate 说明 / protoc-gen-validate |
| `scripts/README.md` | QA 脚本说明 |
| `scripts/import/fixtures/customers/yoyoosun/README.md` | yoyoosun 导入 dry-run fixtures / Yoyoosun Import Dry-run Fixtures |
