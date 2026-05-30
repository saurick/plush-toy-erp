# V1 后续 Codex Goals

文档类型：V1 后续 Codex Goals
状态：拟定中
运行时代码是否已实现：005 已新增 `customers / suppliers / contacts` 后端 repo/usecase；API/RBAC/UI 仍未实现
Ent Schema 是否已实现：003 已新增 schema 文件；004 已新增生成代码
Migration 是否已实现：是，004 已生成
当前实现真源：schema 文件、生成的 Ent 代码、Atlas migration，以及 005 新增的 `customers / suppliers / contacts` 后端 repo/usecase；`sales_orders / sales_order_items` usecase、API/RBAC/UI 仍未实现

不要把 schema、repo/usecase、API/RBAC、UI 放进同一轮。

推荐顺序：

```text
final review -> Ent schema -> migration/generate -> repo/usecase tests -> API/RBAC -> UI -> import/demo -> E2E
```

## 003-v1-ent-schema-customers-suppliers-orders

状态：003 已新增 schema 文件；004 已新增生成代码和 Atlas migration；无运行时代码。

- 目标：仅新增 `customers / suppliers / contacts / sales_orders / sales_order_items` Ent schema 草案。
- 允许修改文件：`server/internal/data/model/schema/*`；如项目流程要求，可包含生成的 Ent 文件；schema 文档状态更新。
- 禁止修改文件：`server/internal/biz/workflow.go`、`server/internal/biz/rbac.go`、业务 repo/usecase、API/service/server、web UI、docs registry、seedData、`server/internal/core/*`。
- 是否允许 schema change：是。
- 是否允许 migration：本 Goal 不允许；优先 schema only，然后进入 004。
- 是否允许 runtime：否。
- 测试命令：`git status --short`；`git diff --stat`；`grep -R "tenant_id" server/internal/data/model/schema docs/product docs/architecture docs/customers docs/reference config deployments || true`；`cd server && go test ./internal/biz ./internal/data`。
- 停止条件：出现 `tenant_id`；第一阶段 cutline 中出现 `product_sku_id`；出现 shipment/inventory/finance 事实字段；把 current-only 字段做成必填；重复定义 products/materials/units/warehouses/BOM/purchase/quality 真源。
- 预期输出：Ent schema diff，以及证明 cutline 合规的文档更新。

## 004-v1-migration-and-ent-generate

状态：004 已新增生成代码和 Atlas migration；没有 repo/usecase、API/RBAC、UI、docs registry 或 seedData。

- 目标：基于 003 已审查的 schema 生成 Ent / Atlas migration，并确认 migration readiness。
- 允许修改文件：生成的 Ent 文件、migration 文件、schema 文档、migration readiness notes。
- 禁止修改文件：runtime usecase、API/RBAC、UI、docs registry、seedData、workflow fact-writing。
- 是否允许 schema change：是。
- 是否允许 migration：是。
- 是否允许 runtime：否。
- 测试命令：`cd server && make print_db_url && make data && make migrate_status`；`cd server && go test ./internal/biz ./internal/data`；`git diff --stat`。
- 停止条件：migration 修改了无关表；缺少唯一约束；生成 SQL 增加 forbidden fields；当前 DB target 不清楚。
- 预期输出：生成 Ent + migration + 状态更新；不新增运行时行为。

## 005-v1-repo-usecase-masterdata

状态：已新增 `customers / suppliers / contacts` 后端 repo/usecase 和测试；未接 API/RBAC/UI、docs registry、seedData 或 `business_records` transition。

- 目标：增加 `customers / suppliers / contacts` 的 repo/usecase 和单元测试，不接 API/UI。
- 允许修改文件：`server/internal/biz/*`、`server/internal/data/*`、tests、相关文档。
- 禁止修改文件：前端页面、docs registry、seedData、workflow rules；除非明确纳入本 Goal，否则不做 sales order usecase。
- 是否允许 schema change：否。
- 是否允许 migration：否。
- 是否允许 runtime：是，仅 backend usecase。
- 测试命令：`cd server && go test ./internal/biz ./internal/data`。
- 停止条件：直接把 `business_records` 当正式主档；缺少 inactive / duplicate / contact owner 测试；没有 migration snapshot plan。
- 输出：MasterData repo/usecase/tests 和文档状态更新已完成。

## 006-v1-repo-usecase-sales-order

状态：建议下一轮执行；尚未实现。

- 目标：增加 SalesOrderUsecase 和订单生命周期状态机，但不写 shipment/inventory/finance facts。
- 允许修改文件：backend biz/data/tests 和文档。
- 禁止修改文件：shipments、inventory fact writing、finance fact writing、UI、docs registry、seedData。
- 是否允许 schema change：否。
- 是否允许 migration：否。
- 是否允许 runtime：是。
- 测试命令：`cd server && go test ./internal/biz ./internal/data`。
- 停止条件：把 `shipping_released` 等同于 `shipped`；手工写 `shipped_quantity` 事实；订单 done 时写 `inventory_txns`、shipments、AR/AP、invoice/payment。
- 预期输出：Sales order repo/usecase/tests，并且状态只覆盖生命周期，不写下游事实。

## 007-v1-api-rbac-masterdata-order

状态：未实现。

- 目标：接入 customers / suppliers / contacts / sales_orders API 和 RBAC 动作权限。
- 允许修改文件：server API/service/biz/rbac/data tests；如有需要，可修改 error code files；相关文档。
- 禁止修改文件：前端页面、seedData、workflow fact-writing；除非单独批准，否则不改 Ent schema。
- 是否允许 schema change：否。
- 是否允许 migration：否。
- 是否允许 runtime：是。
- 测试命令：`cd server && go test ./internal/biz ./internal/data ./internal/service ./internal/server`；如果 error codes 变更，运行 `bash scripts/qa/error-code-sync.sh` 和 `bash scripts/qa/error-codes.sh`。
- 停止条件：只做菜单权限；缺少 unauth / disabled / non-admin / no-permission 测试；没有 data scope / state machine 检查。
- 预期输出：API/RBAC/tests，并且执行顺序遵守 Feature Flag -> RBAC -> Data Scope -> State Machine -> Business Rule -> Idempotency -> Audit Log。

## 008-v1-frontend-masterdata-order-pages

状态：未实现。

- 目标：接入 V1 客户 / 供应商 / 订单页面，退出或降级 overlapping `business_records` 写入。
- 允许修改文件：web pages/config/tests；只有当本 Goal 明确包含 docs registry 时，才允许修改 docs registry。
- 禁止修改文件：Ent schema、migrations、backend fact writing；除非 Goal 允许，否则不改 seedData。
- 是否允许 schema change：否。
- 是否允许 migration：否。
- 是否允许 runtime：是，frontend。
- 测试命令：`cd web && pnpm lint && pnpm css && pnpm test && pnpm style:l1`。
- 停止条件：前端本地派生库存 / 出货 / 财务事实；用中文文案做业务判断；`business_records` 和正式 API 双写。
- 预期输出：UI pages/tests/browser regression，并记录状态覆盖范围。

## 009-business-records-transition-audit

状态：未实现。

- 目标：审计 `business_records` 在 partners/products/orders/purchase/shipping/finance/debug 中的引用和退出路径。
- 允许修改文件：docs/product、docs/architecture、audit notes；scripts 只有在单独批准时才允许。
- 禁止修改文件：runtime deletion、Ent schema、migrations、UI removal、seedData destructive edits。
- 是否允许 schema change：否。
- 是否允许 migration：否。
- 是否允许 runtime：否。
- 测试命令：`git diff --stat`；`rg -n "business_records|businessRecord|BusinessRecord|partners|products" server web docs`；`cd web && pnpm test`；`cd server && go test ./internal/biz ./internal/data`。
- 停止条件：未做引用审计就直接建议删除；不能区分 compatibility/demo/source snapshot 和 Product Core。
- 预期输出：Reference inventory、transition risk list、migration source map。

## 010-current-customer-data-import-draft

状态：未实现。

- 目标：设计 current 客户数据导入草案，分类字段，并提出 dry-run / backfill 策略。
- 允许修改文件：docs/customers/current、docs/product import draft、docs/architecture。
- 禁止修改文件：runtime import loader、Ent schema、migrations、seedData、frontend pages。
- 是否允许 schema change：否。
- 是否允许 migration：否。
- 是否允许 runtime：否。
- 测试命令：`git diff --stat`；`grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true`；后续 Goal 可选 fixture validation。
- 停止条件：把 current Excel columns 变成 Product Core required fields；导入覆盖已入账 / 已过账事实；没有 dry-run 或 unresolved queue。
- 预期输出：字段分类表、导入映射草案、未决问题列表。
