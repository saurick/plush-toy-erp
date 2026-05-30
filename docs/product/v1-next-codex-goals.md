Doc Type: V1 Next Codex Goals
Status: Proposed
Runtime Implemented: No
Ent Schema Implemented: No
Migration Implemented: No
Current Implementation Source of Truth: No

# V1 Next Codex Goals

不要把 schema、repo/usecase、API/RBAC、UI 放进同一轮。

推荐顺序：

```text
final review -> Ent schema -> migration/generate -> repo/usecase tests -> API/RBAC -> UI -> import/demo -> E2E
```

## 003-v1-ent-schema-customers-suppliers-orders

| Item | Content |
|---|---|
| objective | 仅新增 `customers / suppliers / contacts / sales_orders / sales_order_items` Ent schema 草案。 |
| allowed files | `server/internal/data/model/schema/*`, generated Ent files if required by project workflow, schema docs status updates. |
| forbidden files | `server/internal/biz/workflow.go`, `server/internal/biz/rbac.go`, business repo/usecase, API/service/server, web UI, docs registry, seedData, `server/internal/core/*`. |
| schema change yes/no | Yes |
| migration yes/no | No in this goal unless explicitly split to generated migration after review; prefer schema only then 004. |
| runtime yes/no | No |
| test commands | `git status --short`; `git diff --stat`; `grep -R "tenant_id" server/internal/data/model/schema docs/product docs/architecture docs/customers docs/reference config deployments || true`; `cd server && go test ./internal/biz ./internal/data`. |
| stop conditions | `tenant_id`; `product_sku_id` first cutline; shipment/inventory/finance fact fields; current-only required fields; duplicate products/materials/units/warehouses/BOM/purchase/quality truth. |
| expected output | Ent schema diff and updated docs proving cutline compliance. |

## 004-v1-migration-and-ent-generate

| Item | Content |
|---|---|
| objective | 基于 003 已审 schema 生成 Ent / Atlas migration，并确认 migration readiness。 |
| allowed files | generated Ent files, migration files, schema docs, migration readiness notes. |
| forbidden files | runtime usecase, API/RBAC, UI, docs registry, seedData, workflow fact-writing. |
| schema change yes/no | Yes |
| migration yes/no | Yes |
| runtime yes/no | No |
| test commands | `cd server && make print_db_url && make data && make migrate_status`; `cd server && go test ./internal/biz ./internal/data`; `git diff --stat`. |
| stop conditions | migration changes unrelated tables; no unique constraints; generated SQL adds forbidden fields; current DB target unclear. |
| expected output | Generated Ent + migration + status update; no runtime behavior. |

## 005-v1-repo-usecase-masterdata

| Item | Content |
|---|---|
| objective | 增加 customers / suppliers / contacts repo/usecase 和单元测试，不接 API/UI。 |
| allowed files | `server/internal/biz/*`, `server/internal/data/*`, tests, relevant docs. |
| forbidden files | frontend pages, docs registry, seedData, workflow rules, sales order usecase unless explicitly included. |
| schema change yes/no | No |
| migration yes/no | No |
| runtime yes/no | Yes, backend usecase only |
| test commands | `cd server && go test ./internal/biz ./internal/data`. |
| stop conditions | 直接把 `business_records` 当正式主档；缺少 inactive/duplicate/contact owner tests；无 migration snapshot plan. |
| expected output | MasterData repo/usecase/tests and docs update. |

## 006-v1-repo-usecase-sales-order

| Item | Content |
|---|---|
| objective | 增加 SalesOrderUsecase 和订单生命周期状态机，不写 shipment/inventory/finance facts。 |
| allowed files | backend biz/data/tests and docs. |
| forbidden files | shipments, inventory fact writing, finance fact writing, UI, docs registry, seedData. |
| schema change yes/no | No |
| migration yes/no | No |
| runtime yes/no | Yes |
| test commands | `cd server && go test ./internal/biz ./internal/data`. |
| stop conditions | `shipping_released` 等于 `shipped`; `shipped_quantity` 手工事实; order done 写 `inventory_txns`、shipments、AR/AP、invoice/payment. |
| expected output | Sales order repo/usecase/tests with lifecycle-only status. |

## 007-v1-api-rbac-masterdata-order

| Item | Content |
|---|---|
| objective | 接 customers / suppliers / contacts / sales_orders API 和 RBAC 动作权限。 |
| allowed files | server API/service/biz/rbac/data tests, error code files if needed, docs. |
| forbidden files | frontend pages, seedData, workflow fact-writing, Ent schema unless separately approved. |
| schema change yes/no | No |
| migration yes/no | No |
| runtime yes/no | Yes |
| test commands | `cd server && go test ./internal/biz ./internal/data ./internal/service ./internal/server`; if error codes changed, run `bash scripts/qa/error-code-sync.sh` and `bash scripts/qa/error-codes.sh`. |
| stop conditions | only menu permission; missing unauth/disabled/non-admin/no-permission tests; no data scope/state machine checks. |
| expected output | API/RBAC/tests with Feature Flag -> RBAC -> Data Scope -> State Machine -> Business Rule -> Idempotency -> Audit Log order. |

## 008-v1-frontend-masterdata-order-pages

| Item | Content |
|---|---|
| objective | 接入 V1 客户/供应商/订单页面，退出或降级 overlapping business_records 写入。 |
| allowed files | web pages/config/tests/docs registry only if explicitly included by this goal. |
| forbidden files | Ent schema, migrations, backend fact writing, seedData unless goal permits. |
| schema change yes/no | No |
| migration yes/no | No |
| runtime yes/no | Yes, frontend |
| test commands | `cd web && pnpm lint && pnpm css && pnpm test && pnpm style:l1`. |
| stop conditions | 前端本地派生库存/出货/财务事实；中文文案做业务判断；business_records 和正式 API 双写。 |
| expected output | UI pages/tests/browser regression and documented state coverage. |

## 009-business-records-transition-audit

| Item | Content |
|---|---|
| objective | 审计 business_records 在 partners/products/orders/purchase/shipping/finance/debug 中的引用和退出路径。 |
| allowed files | docs/product, docs/architecture, audit notes; scripts only if separately approved. |
| forbidden files | runtime deletion, Ent schema, migrations, UI removal, seedData destructive edits. |
| schema change yes/no | No |
| migration yes/no | No |
| runtime yes/no | No |
| test commands | `git diff --stat`; `rg -n "business_records|businessRecord|BusinessRecord|partners|products" server web docs`; `cd web && pnpm test`; `cd server && go test ./internal/biz ./internal/data`. |
| stop conditions | proposes direct deletion without reference audit; fails to distinguish compatibility/demo/source snapshot from Product Core. |
| expected output | Reference inventory, transition risk list and migration source map. |

## 010-current-customer-data-import-draft

| Item | Content |
|---|---|
| objective | 设计 current 客户数据导入草案，分类字段并提出 dry-run / backfill 策略。 |
| allowed files | docs/customers/current, docs/product import draft, docs/architecture. |
| forbidden files | runtime import loader, Ent schema, migrations, seedData, frontend pages. |
| schema change yes/no | No |
| migration yes/no | No |
| runtime yes/no | No |
| test commands | `git diff --stat`; `grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true`; optional fixture validation in later goal. |
| stop conditions | current Excel columns become Product Core required fields; import overwrites posted facts; no dry-run or unresolved queue. |
| expected output | Field classification table, import mapping draft, unresolved question list. |
