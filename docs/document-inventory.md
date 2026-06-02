Doc Type / 文档类型: Document Inventory / 文档清单
Status / 状态: Active Index / 当前索引
Runtime Source of Truth / 运行时真源: No / 否
Schema Source of Truth / Schema 真源: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否
Notes / 备注: 本文只用于查找和人工审查当前仓库 Markdown 文档，不替代 `docs/current-source-of-truth.md`、正式产品 / 架构文档、代码或测试。

# Document Inventory / 文档清单

本文按目录整理当前仓库 tracked Markdown 文档，回答三个问题：

1. 当前有哪些文档。
2. 每类文档大致负责什么。
3. 哪些文档是产品内入口、哪些只是过程记录、外部参考或子系统说明。

本文不是业务真源，不是 roadmap，不是 schema / migration / runtime 状态真源。判断当前能力、当前禁止项和当前下一步时，仍先读 `docs/current-source-of-truth.md`，再读对应正式文档和代码。

## 使用规则

- `web/src/erp/docs/*.md` 是产品内文档源文件，是否展示取决于 `web/src/erp/config/docs.mjs` 和 `web/src/erp/config/seedData.mjs`。
- `docs/product/*` 和 `docs/architecture/*` 是正式产品 / 架构评审文档，但不自动进入前端帮助中心。
- `docs/codex-goals/*` 是阶段性执行规格和审计记录，完成后不作为后续路线真源。
- `docs/archive/*`、`progress.md` 只用于历史追溯；原 `docs/changes/*` 历史文件已删除，当前状态回到 `docs/current-source-of-truth.md`、正式产品 / 架构文档、代码和测试交叉确认。
- `docs/reference/imported-notes/*` 是外部输入，必须先经过正式文档和代码复核。
- README / server docs / config docs / deployment docs 是目录、运行、部署或子系统维护说明。
- 新增、删除、重命名长期维护 Markdown 文档，或调整文档用途、归属分类、入口状态时，必须同步更新本文。
- 只改现有文档正文且不改变标题、职责、分类、路径或入口状态时，可以不更新本文；若“标题 / 当前用途”会失真，则必须同步更新。

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
| `config/customers/current/README.md` | current 客户配置包骨架 |
| `config/industry-templates/plush/README.md` | 毛绒行业模板骨架 |
| `deployments/current/README.md` | current 客户部署资料未来落点 |

### docs 根入口与当前真源

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/README.md` | docs 目录说明、文档 metadata 与注册边界 |
| `docs/document-inventory.md` | 当前文档清单和查阅索引 |
| `docs/current-source-of-truth.md` | 当前真源与交接顺序 |
| `docs/project-status.md` | 当前项目基线 |
| `docs/deployment-conventions.md` | 部署真源约定 |
| `docs/plush-erp-initialization.md` | 毛绒 ERP 初始化范围 |
| `docs/plush-erp-operation-flow.md` | 毛绒 ERP 主流程 |
| `docs/plush-erp-data-model.md` | 毛绒 ERP 数据模型与导入映射 |
| `docs/erp-print-template-field-behavior.md` | ERP 打印模板字段与编辑行为清单 |
| `docs/erp-print-template-implementation.md` | ERP 打印模板实现原理 |

### 架构评审

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/architecture/customer-supplier-masterdata-review.md` | Customer / Supplier MasterData Review |
| `docs/architecture/finished-goods-inbound-workflow-review.md` | Finished Goods Inbound Workflow Usecase 评审 |
| `docs/architecture/industry-schema-review.md` | 行业专表 Ent Schema 评审 |
| `docs/architecture/masterdata-order-source-document-review.md` | MasterData / Source Document / Fact Review |
| `docs/architecture/material-product-inventory-schema-review.md` | 材料、成品、BOM 与库存专表 Schema 评审 |
| `docs/architecture/order-purchase-boundary-review.md` | Order / Purchase Boundary Review |
| `docs/architecture/phase-2b-bom-lot-schema-review.md` | Phase 2B BOM 与库存批次 Schema 评审 |
| `docs/architecture/phase-2c-purchase-receipt-review.md` | Phase 2C 采购入库最小闭环评审 |
| `docs/architecture/phase-2d-purchase-receipt-adjustment-review.md` | Phase 2D-B 采购入库差异 / 收货差异 / 入库后更正评审 |
| `docs/architecture/phase-2d-purchase-return-quality-review.md` | Phase 2D 采购退货 / 入库差异 / 来料质检入口评审 |
| `docs/architecture/phase-2d-quality-inspection-entry-review.md` | Phase 2D-C 来料质检入口 / 批次状态 / 冻结库存边界评审 |
| `docs/architecture/phase-2d-quality-inspection-schema-review.md` | Phase 2D-C2 quality_inspections 最小主表设计评审 |
| `docs/architecture/product-sku-bom-boundary-review.md` | Product / SKU / BOM Boundary Review |
| `docs/architecture/shipment-inventory-boundary-review.md` | Shipment / Inventory 出货事实边界评审 |
| `docs/architecture/shipment-release-workflow-review.md` | Shipment Release Workflow Usecase 评审 |
| `docs/architecture/shipment-usecase-review.md` | ShipmentUsecase / 出货事实最小模型评审 |
| `docs/architecture/status-workflow-fact-boundary.md` | Status, Workflow And Fact Boundary |
| `docs/architecture/warehouse-inbound-workflow-review.md` | Warehouse Inbound Workflow Usecase 评审 |
| `docs/architecture/workflow-usecase-review.md` | Workflow Usecase 统一编排评审 |

### 产品与路线

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/product/business-records-cutover-plan.md` | Business Records Cutover Plan |
| `docs/product/business-records-data-map-draft.md` | Business Records Data Map Draft |
| `docs/product/business-records-reference-audit.md` | Business Records Reference Audit |
| `docs/product/business-records-risk-register.md` | Business Records Risk Register |
| `docs/product/business-records-transition-audit.md` | Business Records Transition Audit |
| `docs/product/business-records-transition-plan.md` | Business Records Transition Plan |
| `docs/product/config-permission-policy.md` | Config And Permission Policy |
| `docs/product/current-customer-import-risk-register.md` | Current Customer Import Risk Register |
| `docs/product/current-customer-import-strategy.md` | Current Customer Import Strategy |
| `docs/product/customer-delta-policy.md` | Customer Delta Policy |
| `docs/product/customer-instance-policy.md` | Customer Instance Policy |
| `docs/product/domain-model-v1.md` | Domain Model V1 |
| `docs/product/domain-schema-draft-v1-v2.md` | Domain Schema Draft V1 / V2 |
| `docs/product/formal-menu-entry-plan.md` | 正式产品入口与菜单配置计划 |
| `docs/product/migration-readiness-checklist.md` | Migration Readiness Checklist |
| `docs/product/module-boundaries.md` | Module Boundaries |
| `docs/product/phase1-implementation-plan.md` | Phase 1 Implementation Plan |
| `docs/product/phase1-risk-register.md` | Phase 1 Risk Register |
| `docs/product/product-completion-roadmap.md` | 产品完成路线图 |
| `docs/product/product-delivery-ledgers.md` | 产品能力进度台账 + 客户交付矩阵 + 客户差异台账 |
| `docs/product/product-principles.md` | 产品原则 |
| `docs/product/release-gates.md` | Release Gates |
| `docs/product/rewrite-roadmap.md` | Rewrite Roadmap |
| `docs/product/schema-design-final-review.md` | Schema Design Final Review |
| `docs/product/test-strategy.md` | 自动化测试策略 |
| `docs/product/v1-entity-decision-record.md` | V1 Entity Decision Record |
| `docs/product/v1-implementation-cutline.md` | V1 Implementation Cutline |
| `docs/product/v1-next-codex-goals.md` | V1 后续 Codex Goals |
| `docs/product/v1-schema-go-no-go.md` | V1 Schema Go / No-Go Checklist |
| `docs/product/zero-to-one-architecture.md` | 0 到 1 产品架构 |

### 客户资料边界

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/customers/current/README.md` | current 客户资料边界 |
| `docs/customers/current/assumption-register.md` | Assumption Register |
| `docs/customers/current/change-request-process.md` | Change Request Process |
| `docs/customers/current/customer-config-draft.md` | Customer Config Draft |
| `docs/customers/current/decision-log.md` | Decision Log |
| `docs/customers/current/delta-register.md` | Delta Register |
| `docs/customers/current/import-acceptance-checklist.md` | Current Customer Import Acceptance Checklist |
| `docs/customers/current/import-dry-run-plan.md` | Current Customer Import Dry-run Plan |
| `docs/customers/current/import-dry-run-tooling.md` | Current Customer Import Dry-run Tooling |
| `docs/customers/current/import-field-classification.md` | Current Customer Import Field Classification |
| `docs/customers/current/import-source-inventory.md` | Current Customer Import Source Inventory |
| `docs/customers/current/import-unresolved-queue.md` | Current Customer Import Unresolved Queue |
| `docs/customers/current/question-backlog.md` | Question Backlog |
| `docs/customers/current/real-dry-run-evidence.md` | Current Real Dry-run Evidence |
| `docs/customers/current/requirement-clues.md` | Requirement Clues |
| `docs/customers/current/source-materials.md` | Source Materials |
| `docs/customers/current/source-snapshot-freeze.md` | Current Source Snapshot Freeze |
| `docs/customers/current/source-snapshot-manual-review-checklist.md` | Current Source Snapshot Manual Review Checklist |

### Workflow / 角色 / 财务 / 仓库 / 可观测性

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/workflow/notification-alert-v1.md` | 通知 / 预警 / 催办 / 升级 v1 |
| `docs/workflow/task-flow-v1.md` | 工作流主任务树 v1 |
| `docs/roles/role-permission-matrix-v1.md` | 角色权限矩阵 v1 |
| `docs/finance/finance-v1.md` | 财务 v1 |
| `docs/warehouse/warehouse-quality-v1.md` | 仓库与品质 v1 |
| `docs/observability/log-trace-audit-v1.md` | 日志 / 审计 / Trace v1 |

### Codex Goal

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/codex-goals/README.md` | Codex Goals 使用说明 |
| `docs/codex-goals/_goal-file-template.md` | Codex Goal 文件模板 |
| `docs/codex-goals/_new-session-goal-template.md` | Codex 新会话短 Goal 模板 |
| `docs/codex-goals/_review-output-protocol.md` | Codex 审查报告输出协议 |
| `docs/codex-goals/000-phase0-foundation.md` | Phase 0 执行规格 |
| `docs/codex-goals/001-overnight-phase1-masterdata-order-review.md` | Codex Goal 001: MasterData / Order / BOM / Purchase Review |
| `docs/codex-goals/002-schema-design-final-review.md` | Codex Goal 002: Schema Design Final Review |
| `docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md` | Codex Goal 003: V1 Ent Schema |
| `docs/codex-goals/004-v1-migration-and-ent-generate.md` | Codex Goal 004: V1 Ent Generate and Atlas Migration |
| `docs/codex-goals/005-v1-repo-usecase-masterdata.md` | Codex Goal 005: V1 MasterData Repo / Usecase |
| `docs/codex-goals/006-v1-repo-usecase-sales-order.md` | Codex Goal 006: V1 Sales Order Repo / Usecase |
| `docs/codex-goals/007-v1-api-rbac-masterdata-order.md` | Codex Goal 007: V1 API / RBAC |
| `docs/codex-goals/008-v1-frontend-masterdata-order-pages.md` | Codex Goal 008: V1 Frontend Pages |
| `docs/codex-goals/009-business-records-transition-audit.md` | Codex Goal 009: business_records Transition Audit |
| `docs/codex-goals/010-current-customer-data-import-draft.md` | Codex Goal 010: current Customer Data Import Draft |
| `docs/codex-goals/011-current-customer-import-dry-run-tooling.md` | Codex Goal 011: current Customer Import Dry-run Tooling |
| `docs/codex-goals/012-current-source-snapshot-freeze-and-real-dry-run-evidence.md` | Codex Goal 012: Source Snapshot Freeze and Real Dry-run Evidence |

### 归档

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/archive/README.md` | archive 目录说明 |
| `docs/archive/progress-2026-06-02-before-print-template-defer.md` | 2026-05-31 至 2026-06-02 旧 progress 归档 |

### 外部参考

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `docs/reference/imported-notes/README.md` | Imported Design Notes |
| `docs/reference/imported-notes/erp_plush_productization_config_permission_workflow_state_design.md` | 毛绒玩具 ERP 产品化配置、权限、流程与状态设计总结 |
| `docs/reference/imported-notes/erp_status_workflow_context.md` | ERP 状态分层、状态机、Workflow 与业务事实设计总结 |
| `docs/reference/imported-notes/plush-toy-erp-from-0-to-1-plan.md` | 外部 0 到 1 重构方案参考输入 |

### 前端产品内文档

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `web/src/erp/docs/acceptance-overview.md` | 验收结果总览 |
| `web/src/erp/docs/business-chain-debug.md` | 业务链路调试 |
| `web/src/erp/docs/calculation-guide.md` | ERP 计算口径 |
| `web/src/erp/docs/current-boundaries.md` | 当前明确不做 |
| `web/src/erp/docs/data-model.md` | 首批正式数据模型 |
| `web/src/erp/docs/desktop-role-guide.md` | 桌面端角色流程 |
| `web/src/erp/docs/exception-handling-guide.md` | 异常 / 返工 / 延期处理 |
| `web/src/erp/docs/field-linkage-coverage.md` | 字段联动覆盖 |
| `web/src/erp/docs/field-linkage-guide.md` | ERP 字段联动口径 |
| `web/src/erp/docs/field-truth.md` | 字段真源对照 |
| `web/src/erp/docs/finance-v1.md` | 财务 v1 |
| `web/src/erp/docs/import-mapping.md` | Excel / PDF 导入映射 |
| `web/src/erp/docs/industry-schema-review.md` | 行业专表 Ent Schema 评审 |
| `web/src/erp/docs/log-trace-audit-v1.md` | 日志 / 审计 / Trace v1 |
| `web/src/erp/docs/mobile-role-guide.md` | 手机端角色流程 |
| `web/src/erp/docs/mobile-roles.md` | 桌面单后台与移动端端口 |
| `web/src/erp/docs/notification-alert-v1.md` | 通知 / 预警 / 催办 / 升级 v1 |
| `web/src/erp/docs/operation-flow-overview.md` | ERP 流程图总览 |
| `web/src/erp/docs/operation-guide.md` | ERP 操作教程 |
| `web/src/erp/docs/operation-playbook.md` | 毛绒 ERP 主流程 |
| `web/src/erp/docs/print-snapshot-guide.md` | 打印 / 合同 / 快照口径 |
| `web/src/erp/docs/print-templates.md` | 模板打印与字段口径 |
| `web/src/erp/docs/productization-delivery.md` | 产品化与交付 |
| `web/src/erp/docs/qa-reports.md` | 专项报告 |
| `web/src/erp/docs/qa-run-records.md` | 运行记录 |
| `web/src/erp/docs/role-collaboration-guide.md` | 角色协同链路 |
| `web/src/erp/docs/role-page-document-matrix.md` | 角色权限 / 页面 / 单据矩阵 |
| `web/src/erp/docs/role-permission-matrix-v1.md` | 角色权限矩阵 v1 |
| `web/src/erp/docs/system-init.md` | 系统初始化与端口说明 |
| `web/src/erp/docs/system-layer-progress.md` | 系统分层进度 |
| `web/src/erp/docs/task-document-mapping.md` | 任务 / 单据映射表 |
| `web/src/erp/docs/task-flow-v1.md` | 工作流主任务树 v1 |
| `web/src/erp/docs/warehouse-quality-v1.md` | 仓库与品质 v1 |
| `web/src/erp/docs/workflow-schema-draft.md` | Workflow / Schema 草案 |
| `web/src/erp/docs/workflow-status-guide.md` | 任务 / 业务状态字典 |
| `web/src/erp/docs/workflow-task-debug.md` | 协同任务调试 |
| `web/src/erp/docs/workflow-usecase-review.md` | Workflow Usecase 统一编排评审 |

### 前端 / 后端 / 脚本说明

| 路径 | 标题 / 当前用途 |
| --- | --- |
| `web/README.md` | web 前端说明 |
| `web/src/erp/mobile/roles/README.md` | Mobile Roles Skeleton |
| `web/src/erp/modules/README.md` | ERP Modules Skeleton |
| `server/README.md` | server 后端说明 |
| `server/deploy/README.md` | server/deploy 说明 |
| `server/deploy/compose/prod/README.md` | Compose 部署说明 |
| `server/docs/README.md` | server/docs 文档索引 |
| `server/docs/api.md` | JSON-RPC API 说明 |
| `server/docs/config.md` | 服务配置说明 |
| `server/docs/ent.md` | Ent + Atlas 数据模型说明 |
| `server/docs/observability.md` | 可观测性与健康检查说明 |
| `server/docs/runtime.md` | 服务运行说明 |
| `server/internal/biz/README.md` | Biz |
| `server/internal/core/README.md` | Core Skeleton |
| `server/internal/data/AI_DB_WORKFLOW.md` | AI 助手数据库变更操作手册 |
| `server/internal/data/README.md` | Data |
| `server/internal/service/README.md` | Service |
| `server/pkg/taskgroup/README.md` | taskgroup |
| `server/third_party/README.md` | third_party |
| `server/third_party/validate/README.md` | protoc-gen-validate |
| `scripts/README.md` | QA 脚本说明 |
| `scripts/import/fixtures/current/README.md` | Current Import Dry-run Fixtures |
