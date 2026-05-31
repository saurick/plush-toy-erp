# Codex Goal 009: business_records Transition Audit

## 任务名称

009：business_records 兼容层过渡审计与退出方案

---

## 任务性质

本轮属于：

Audit / Docs-only

本轮只允许做审计、文档和计划。

本轮不改 runtime。  
本轮不改 Ent schema。  
本轮不新增 migration。  
本轮不改 generated code。  
本轮不改 repo/usecase。  
本轮不改 API/RBAC。  
本轮不改 UI。  
本轮不改 docs registry。  
本轮不改 seedData。  
本轮不迁移数据。  
本轮不删除 business_records。  

必须明确：

本轮是否改 runtime：否
本轮是否改 Ent schema：否
本轮是否新增 migration：否
本轮是否改 API：否
本轮是否改 RBAC：否
本轮是否改 UI：否
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：否
本轮是否做真实数据迁移：否

---

## 背景

003 已新增 V1 Ent schema：

- customers
- suppliers
- contacts
- sales_orders
- sales_order_items

004 已完成：

- Ent generated code
- Atlas migration

005 已完成：

- customers / suppliers / contacts repo/usecase
- contacts owner_type + owner_id guard
- contacts primary contact 策略

006 已完成：

- sales_orders / sales_order_items repo/usecase
- sales order lifecycle: draft / submitted / active / closed / canceled
- sales order item status: open / closed / canceled
- customer / product / unit guard

007 已完成：

- customers / suppliers / contacts JSON-RPC API
- sales_orders / sales_order_items JSON-RPC API
- V1 API/RBAC 权限码和测试

008 已完成：

- V1 customers / suppliers / contacts 前端页面
- V1 sales_orders / sales_order_items 前端页面
- V1 前端 API client
- V1 路由
- 前端测试、mocked route render、style:l1

但旧的 business_records 兼容层仍然存在。

business_records 当前定位：

- 兼容层
- demo
- seed
- source snapshot
- 调研入口
- 旧页面 / 旧样本承载层

business_records 不是：

- 长期事实真源
- 正式 customers / suppliers 真源
- 正式 sales_orders 真源
- 库存事实
- 出货事实
- 财务事实

009 的目标：

审计 business_records 现在被哪些页面、配置、seed、docs、测试、helper、API 使用，判断它与 V1 正式模型的重叠点，输出过渡计划。

009 不处理：

- 删除 business_records
- 修改 business_records schema
- 修改 business_records repo/usecase
- 修改 business_records API
- 修改前端页面
- 修改 seedData
- 修改 docs registry
- 执行数据迁移
- 写 import/backfill 代码
- 写双写逻辑

---

## 必须先读

### 项目规则

- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- progress.md

### GPT / Codex 上下文

- docs/codex-goals/_gpt-context-summary.md
- docs/codex-goals/README.md
- docs/codex-goals/_new-session-goal-template.md
- docs/codex-goals/_goal-file-template.md
- docs/codex-goals/_review-output-protocol.md

如果某些模板文件不存在，请记录缺失，不要自行大范围补模板。

### 003 / 004 / 005 / 006 / 007 / 008 Goal 与审查结果

- docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
- docs/codex-goals/004-v1-migration-and-ent-generate.md
- docs/codex-goals/005-v1-repo-usecase-masterdata.md
- docs/codex-goals/006-v1-repo-usecase-sales-order.md
- docs/codex-goals/007-v1-api-rbac-masterdata-order.md
- docs/codex-goals/008-v1-frontend-masterdata-order-pages.md
- .codex-review/latest.md

如果 .codex-review/latest.md 不存在，请继续，但必须从 003/004/005/006/007/008 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

### Phase 0 / 1 / 2 文档

- docs/product/zero-to-one-architecture.md
- docs/product/product-principles.md
- docs/product/domain-model-v1.md
- docs/product/module-boundaries.md
- docs/product/config-permission-policy.md
- docs/product/customer-instance-policy.md
- docs/product/customer-delta-policy.md
- docs/product/rewrite-roadmap.md
- docs/product/release-gates.md
- docs/product/test-strategy.md
- docs/architecture/status-workflow-fact-boundary.md

- docs/architecture/masterdata-order-source-document-review.md
- docs/architecture/customer-supplier-masterdata-review.md
- docs/architecture/product-sku-bom-boundary-review.md
- docs/architecture/order-purchase-boundary-review.md
- docs/product/domain-schema-draft-v1-v2.md
- docs/product/migration-readiness-checklist.md
- docs/product/phase1-implementation-plan.md
- docs/product/phase1-risk-register.md

- docs/product/schema-design-final-review.md
- docs/product/v1-entity-decision-record.md
- docs/product/v1-implementation-cutline.md
- docs/product/v1-schema-go-no-go.md
- docs/product/business-records-transition-plan.md
- docs/product/v1-next-codex-goals.md

### business_records 相关代码与配置

Codex 必须先搜索真实仓库，不要猜路径。

至少搜索：

- business_records
- businessRecords
- BusinessRecord
- partners
- project-orders
- sales-orders
- products
- customer
- supplier

建议命令：

    grep -R "business_records\|businessRecords\|BusinessRecord" server web docs -n | head -200
    grep -R "partners\|project-orders\|sales-orders" web/src/erp docs -n | head -200

如本地有 rg，可用 rg。

必须重点检查：

- server/internal/data/model/schema/business_record.go
- server/internal/data/model/ent/businessrecord*
- server/internal/data/business_record*
- server/internal/biz/business*
- server/internal/data/jsonrpc*
- web/src/erp/config/businessModules.mjs
- web/src/erp/config/businessRecordDefinitions.mjs
- web/src/erp/config/seedData.mjs
- web/src/erp/router.jsx
- web/src/erp/pages/*
- web/src/erp/api/*
- web/src/erp/utils/*
- web/src/erp/docs/*
- docs/current-source-of-truth.md
- docs/product/*
- docs/architecture/*

如果某些文件不存在，请记录缺失，不要猜。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

- AGENTS.md
- docs/current-source-of-truth.md
- docs/product/business-records-transition-plan.md
- docs/product/v1-implementation-cutline.md
- docs/product/v1-schema-go-no-go.md
- docs/product/v1-next-codex-goals.md
- server/internal/data/model/schema/business_record.go
- 现有 business_records 相关代码
- 现有 business_records 相关前端配置
- 003 到 008 已完成的 V1 正式模型 / API / UI 文件

### 只能作为线索

- docs/customers/current/*
- web/src/erp/config/seedData.mjs
- 截图
- Excel 样本
- PDF 样本
- 历史 Codex 输出
- docs/reference/imported-notes/*

### 禁止作为当前实现真源

- 历史聊天记忆
- 未经确认的截图 / 口头描述
- 未落地 architecture review
- 未实现 schema draft
- current 客户样本字段
- demo / seed 数据

必须保持：

- 代码 / schema / migration / tests 是实现真源。
- current-source-of-truth 是当前状态入口。
- schema draft 不是 implemented。
- architecture review 不是 runtime。
- customer material 不是 Product Core。
- business_records 是兼容层，不是正式事实真源。

---

## 允许修改的文件

本轮允许新增：

- docs/product/business-records-reference-audit.md
- docs/product/business-records-transition-audit.md
- docs/product/business-records-cutover-plan.md
- docs/product/business-records-data-map-draft.md
- docs/product/business-records-risk-register.md

允许小幅更新：

- docs/current-source-of-truth.md
- docs/product/business-records-transition-plan.md
- docs/product/v1-next-codex-goals.md
- docs/product/v1-schema-go-no-go.md
- progress.md

允许生成或覆盖：

- .codex-review/latest.md

---

## 禁止修改的文件

本轮禁止修改：

- server/internal/biz/*
- server/internal/data/*
- server/internal/data/model/schema/*
- server/internal/data/model/migrate/*
- server/internal/data/model/ent/*
- server/internal/core/*
- web/src/erp/config/docs.mjs
- web/src/erp/config/seedData.mjs
- web/src/erp/router.jsx
- web/src/erp/pages/*
- web/src/erp/api/*
- web/src/erp/utils/*
- web/src/erp/mobile/*
- server/deploy
- scripts
- docs/codex-goals/_new-session-goal-template.md
- docs/codex-goals/_goal-file-template.md
- docs/codex-goals/_review-output-protocol.md

特别说明：

- 本轮不得改 business_records 代码。
- 本轮不得改 business_records schema。
- 本轮不得改 V1 页面。
- 本轮不得改 seedData。
- 本轮不得改 docs registry。
- 本轮不得做任何实际迁移。
- 本轮不得做双写。
- 本轮不得删除旧入口。

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

Audit / Docs-only

不得扩大到：

- runtime
- schema
- migration
- generated code
- repo/usecase
- API/RBAC
- UI
- seedData
- docs registry
- data migration
- import/backfill

禁止把下面内容放进同一轮：

- audit + 删除 business_records
- audit + seedData 改造
- audit + UI 入口切换
- audit + API 双写
- audit + 数据迁移
- audit + import/backfill

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

- 输出 business_records 引用审计清单。
- 输出 business_records 与 V1 正式模型的重叠矩阵。
- 输出 business_records 可以继续保留的范围。
- 输出 business_records 不应继续承载的范围。
- 输出 business_records 切换 / 降级 / 只读 / deprecated 的分阶段计划。
- 输出 business_records 数据映射草案，但不迁移数据。
- 输出 current 客户样本和 demo/seed 的处理建议。
- 输出 business_records 相关风险登记。
- 明确哪些内容可以进入后续 import draft。
- 明确哪些内容必须等待人工确认。
- 明确哪些内容不能自动迁移。
- 不删除 business_records。
- 不改 business_records runtime。
- 不改 V1 页面。
- 不改 seedData。
- 不改 docs registry。
- 不新增 tenant_id。
- 不新增 schema/migration。
- 不新增 ChangeUsecase/change_records。
- 不写 shipment/inventory/finance facts。
- .codex-review/latest.md 已生成。

不能只写“已完成审计”。

---

## 停止条件

出现以下情况必须停止并报告：

- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 需要修改禁止路径。
- 需要删除 business_records。
- 需要修改 business_records schema。
- 需要修改 business_records runtime。
- 需要改 seedData 或 docs registry。
- 需要改 V1 页面。
- 需要做数据迁移。
- 需要写 import/backfill 代码。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 schema/migration。
- 需要写 shipment/inventory/finance facts。
- 无法区分 demo/seed/source snapshot 与正式事实。
- 无法确认引用来源。
- 需要删除、回退、整理或 stash 非本轮改动。

停止时必须输出：

停止原因：
涉及文件：
风险：
建议下一步：

---

## Git 策略

默认规则：

- 本轮默认不提交、不推送。
- 不允许执行 git add .
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。

必须先运行并记录：

    git status --short
    git branch --show-current
    git log --oneline -3

如果发现当前仓库已经有自动 commit 或 origin/main 同步，必须在 review 中说明，不要继续 commit/push。

必须区分：

- tracked diff
- untracked files
- 本轮新增文件
- 历史未跟踪文件

如果存在历史 untracked 文件，不要删除，报告即可。

---

## 审计内容要求

### 1. business-records-reference-audit.md

路径：

- docs/product/business-records-reference-audit.md

必须包含：

- business_records 后端 schema 引用。
- business_records 后端 repo/usecase/API 引用。
- business_records 前端页面引用。
- business_records 前端 config 引用。
- business_records seed/demo 引用。
- business_records docs 引用。
- business_records tests 引用。
- business_records 与 partners / project-orders / products / orders 相关的入口。
- 每个引用的作用：
  - runtime
  - UI
  - seed/demo
  - docs/help
  - test
  - compatibility
  - source snapshot
- 每个引用是否与 V1 正式模型重叠。
- 每个引用建议：
  - keep
  - keep as demo
  - make read-only
  - deprecate later
  - replace by V1
  - needs manual review

必须用表格。

### 2. business-records-transition-audit.md

路径：

- docs/product/business-records-transition-audit.md

必须回答：

- business_records 当前是什么。
- business_records 现在不能是什么。
- V1 customers / suppliers / contacts 出现后，partners 类入口如何处理。
- V1 sales_orders 出现后，orders / project-orders 类入口如何处理。
- products 类 business_records 与现有 products schema 如何避免重复。
- business_records 如何继续作为兼容层。
- business_records 如何避免双写真源。
- business_records 何时进入只读。
- business_records 何时可以标记 deprecated。
- business_records 是否能删除，删除前需要哪些条件。
- 哪些内容必须人工确认。

必须明确：

business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

### 3. business-records-cutover-plan.md

路径：

- docs/product/business-records-cutover-plan.md

必须输出分阶段计划：

Stage 0: 当前状态
- business_records 继续存在。
- V1 正式模型已具备 schema / migration / repo/usecase / API/RBAC / UI。
- business_records 仍可能承载旧入口、demo、source snapshot、seed。

Stage 1: 并行可见但禁止双写
- 新 V1 页面作为正式入口。
- business_records 相关重叠入口不得继续新增核心功能。
- 不做自动迁移。
- 不删除旧数据。

Stage 2: 只读 / demo 化
- 重叠领域的 business_records 页面转为只读或 demo。
- seed/demo 明确标记。
- 用户操作引导到 V1 页面。

Stage 3: 数据映射 / dry-run
- 只做 dry-run mapping。
- 输出可迁移、不可迁移、需人工确认清单。
- 不写正式数据。

Stage 4: 受控迁移
- 只有人工确认后才允许执行。
- 必须有备份、回滚、校验。
- 必须禁止双写。

Stage 5: deprecated / archive
- 只在引用清零、数据完成迁移、客户确认后执行。
- 不建议当前阶段做。

### 4. business-records-data-map-draft.md

路径：

- docs/product/business-records-data-map-draft.md

必须输出映射草案：

- business_records partners -> customers / suppliers / contacts
- business_records project-orders / orders -> sales_orders / sales_order_items
- business_records products -> existing products / future product_skus draft-only
- business_records materials -> existing materials
- business_records warehouses -> existing warehouses

每类必须写：

- source fields
- target model
- target fields
- can auto map?
- needs manual review?
- forbidden auto map?
- notes

必须明确：

- current 客户样本字段不能自动变成 Product Core 必填字段。
- product_skus 仍 draft-only，不得自动映射。
- purchase_orders / shipments / finance facts 仍 deferred，不得自动映射。
- 没有事实依据不得生成 shipment / inventory / finance facts。

### 5. business-records-risk-register.md

路径：

- docs/product/business-records-risk-register.md

必须列风险：

- 双真源风险。
- 双写风险。
- demo 数据误当正式数据。
- current 客户字段污染 Product Core。
- business_records orders 误当 sales_orders。
- business_records products 与 products schema 重复。
- partners 同时对应 customers / suppliers。
- 旧页面继续新增功能导致 V1 失焦。
- 自动迁移误写正式数据。
- 删除 business_records 破坏历史文档 / demo / QA。
- seedData / docs registry 修改引发前端回归。
- 迁移后无法回滚。
- 用户误认为 business_records 是正式入口。

每项写：

- risk
- impact
- evidence
- mitigation
- owner layer
- next review needed

---

## Workflow / Fact 边界

本轮不得接 Workflow。

必须保持：

- Workflow task done != Fact posted。
- shipping_released != shipped。
- shipment_release done -> shipping_released。
- sales_order 是 Source Document。
- shipment 才是未来出货事实。
- inventory_txns 才是库存落账事实。

不得新增让 workflow 写这些对象的逻辑。

---

## Sales Order / Shipment 边界

business_records audit 不得建议：

- markAsShipped
- shipSalesOrder
- reserveStock
- deductInventory
- generateInvoice
- generateReceivable
- receivePayment

不得建议从 business_records 自动生成：

- shipments
- stock_reservations
- inventory_txns
- AR/AP
- invoice
- payment

---

## tenant_id 规则

本轮禁止新增 tenant_id。

如果 grep 命中 tenant_id，必须解释是否只来自：

- imported notes
- 禁止说明
- future SaaS 评审候选说明
- current 不是 runtime tenant 说明

不得进入：

- schema
- runtime
- migration
- transition plan
- data mapping target

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

本轮改文档，需要检查 diff、格式、边界词和禁止项。

命令：

    git status --short
    git diff --stat
    git diff --check
    git ls-files --others --exclude-standard

### 单元测试

选择：否。

原因：

本轮 docs-only，不改代码。

### 集成测试

选择：否。

原因：

本轮 docs-only，不改 API/repo/usecase/DB。

### 冒烟测试

选择：否。

原因：

本轮不改运行入口或前端页面。

### 回归测试

选择：有限选择。

原因：

如果只改 docs/product，不需要跑前后端全量；如果误改 web/docs registry，则必须停止。

### E2E 测试

选择：否。

原因：

本轮不改 UI 或用户路径。

### 视觉 / 样式回归

选择：否。

原因：

本轮不改 UI / 样式。

---

## 验收命令

必须运行：

    git status --short
    git branch --show-current
    git log --oneline -3
    git diff --stat
    git diff --check
    git ls-files --others --exclude-standard

必须运行引用审计命令：

    grep -R "business_records\|businessRecords\|BusinessRecord" server web docs -n || true
    grep -R "partners\|project-orders\|sales-orders" web/src/erp docs -n || true

必须运行边界检查：

    grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true
    grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
    grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" docs/product docs/architecture || true
    grep -R "markAsShipped\|shipSalesOrder\|reserveStock\|deductInventory\|generateInvoice\|generateReceivable\|receivePayment" docs/product docs/architecture || true
    grep -R "ChangeUsecase\|change_records" docs/product docs/architecture || true

不得运行：

    cd server && make data
    cd server && make migrate_status

不得运行前端测试，除非本轮意外改了前端文件；如果改了前端文件，必须停止并报告。

不得运行后端测试，除非本轮意外改了后端文件；如果改了后端文件，必须停止并报告。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

business_records transition audit has been added.
No runtime, API, UI, seedData, docs registry, migration, schema, import/backfill, or deletion has been implemented.

### progress.md

记录本轮：

009 business_records transition audit completed.
No runtime / schema / migration / API / UI / seedData / docs registry / import/backfill changes.

如果本轮中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

- 010-current-customer-data-import-draft
- 或 008-menu-entry-review / V1 menu entry goal，如项目更需要菜单入口

但不得把下一轮写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

009 business_records transition audit added

但不得把 migration / import / deletion 写成完成。

---

## 项目长期禁止项

必须遵守：

- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

---

## 审查报告要求

本轮完成后必须生成：

.codex-review/latest.md

审查报告必须遵守：

docs/codex-goals/_review-output-protocol.md

用户必须能用下面命令复制：

    cat .codex-review/latest.md | pbcopy

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

【完成】

【新增/修改文件】

【本轮改动范围】

【business_records 引用审计摘要】

【与 V1 正式模型重叠矩阵】

【cutover 分阶段计划】

【data map draft 摘要】

【明确没有做的内容】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】

    cat .codex-review/latest.md | pbcopy

## 完成后给 GPT 的复盘材料

.codex-review/latest.md 必须包含：

- git status --short
- git diff --stat
- git ls-files --others --exclude-standard
- business_records 引用清单摘要
- 重叠矩阵摘要
- cutover plan 摘要
- data map draft 摘要
- tenant_id grep 解释
- shipping_released grep 解释
- forbidden action grep 解释
- 禁止路径检查
- 测试层级选择
- 测试命令和结果
- 下一轮建议