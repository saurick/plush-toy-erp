# Phase 1 Implementation Plan

## 原则

后续实现必须拆小，不允许一轮直接做：

```text
schema + migration + repo + usecase + API + UI + docs
```

必须按阶段推进：

```text
review -> schema -> migration -> repo -> usecase -> API/RBAC -> UI -> docs -> E2E
```

本文件只规划下一步 Codex goals，不代表任何 runtime 已实现。

Phase 2 schema final review 已新增实现前 cutline。任何 Ent schema goal 必须先遵循 `docs/product/v1-implementation-cutline.md` 和 `docs/product/v1-schema-go-no-go.md`，不得把 draft-only / deferred 对象顺手落表。

## 002-schema-design-final-review

| Item | 内容 |
| --- | --- |
| objective | 对 `customers / suppliers / contacts / product_skus / sales_orders / sales_order_items` 做 schema final review |
| allowed files | `docs/product/domain-schema-draft-v1-v2.md`, `docs/product/migration-readiness-checklist.md`, `docs/architecture/*phase1*` 或同类评审文档 |
| forbidden files | runtime code, Ent schema, migrations, docs registry, seedData, workflow.go, rbac.go, server/internal/data |
| schema change | No |
| migration | No |
| runtime | No |
| test commands | `git diff --stat`, `grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true`, `cd web && pnpm test` |
| stop conditions | 发现重复现有真源、current 字段直接进 Product Core、Workflow / Fact 混淆 |
| expected output | final schema review 文档和字段分类表 |
| review checklist | 是否通过 migration-readiness checklist；是否无禁止字段；是否保留 `business_records` 过渡口径 |

## 003-customers-suppliers-ent-schema

| Item | 内容 |
| --- | --- |
| objective | 仅新增客户、供应商、联系人 Ent schema 和 Atlas migration |
| allowed files | `server/internal/data/model/schema/*`, generated ent files, migration files, relevant docs |
| forbidden files | workflow.go, rbac.go unless permission scope separately approved, web pages, seedData |
| schema change | Yes |
| migration | Yes |
| runtime | No business API |
| test commands | `cd server && make print_db_url && make data && make migrate_status`, relevant schema tests |
| stop conditions | schema 字段包含 current-only 必填、重复 partner 影子表、无迁移回滚计划 |
| expected output | Ent schema + migration + docs status update |
| review checklist | 唯一索引、nullable 策略、contacts owner 策略、business_records backfill plan |

## 004-customers-suppliers-repo-usecase-tests

| Item | 内容 |
| --- | --- |
| objective | 增加 customers / suppliers / contacts repo/usecase 和单元测试，不接 UI |
| allowed files | `server/internal/biz/*`, `server/internal/data/*`, tests, docs |
| forbidden files | frontend pages, docs registry, seedData, unrelated workflow rules |
| schema change | No unless 003 已完成且发现阻断问题需单独确认 |
| migration | No |
| runtime | Yes, backend usecase only |
| test commands | `cd server && go test ./internal/biz ./internal/data` |
| stop conditions | 缺少状态机/幂等/权限边界设计，或直接读写 business_records 当正式主档 |
| expected output | repo/usecase/tests |
| review checklist | disabled/inactive、重复 code、联系人主从、历史快照不被破坏 |

## 005-product-skus-bom-version-schema-review

| Item | 内容 |
| --- | --- |
| objective | 评审 `product_skus` 是否 V1 落 schema，以及 BOM 是否需要 sku/version 扩展 |
| allowed files | docs only |
| forbidden files | Ent schema, migrations, runtime code |
| schema change | No |
| migration | No |
| runtime | No |
| test commands | `git diff --stat`, keyword grep, `cd web && pnpm test` |
| stop conditions | SKU 只是 `products` 别名、BOM version 重复现有 `bom_headers.version` |
| expected output | schema go/no-go 评审 |
| review checklist | SKU 是否影响订单/BOM/库存/出货粒度；current 字段是否只作为线索 |

## 006-sales-orders-schema

| Item | 内容 |
| --- | --- |
| objective | 新增 `sales_orders / sales_order_items` Ent schema 和 migration |
| allowed files | schema, migration, generated ent, schema docs |
| forbidden files | UI, seedData, workflow fact-writing rules, shipment/finance schema |
| schema change | Yes |
| migration | Yes |
| runtime | No business API |
| test commands | `cd server && make print_db_url && make data && make migrate_status`, schema tests |
| stop conditions | `shipped_quantity` 作为手工事实、`shipping_released` 等同 shipped、订单状态承接财务事实 |
| expected output | sales order schema + migration |
| review checklist | lifecycle status、line status、quantity decimal、customer snapshot、SKU optionality |

## 007-sales-orders-usecase-status-machine

| Item | 内容 |
| --- | --- |
| objective | 增加 SalesOrderUsecase 和订单生命周期状态机，不接出货/财务事实 |
| allowed files | backend biz/data, tests, docs |
| forbidden files | shipments, inventory fact writing, finance fact writing, UI |
| schema change | No |
| migration | No |
| runtime | Yes |
| test commands | `cd server && go test ./internal/biz ./internal/data` |
| stop conditions | order done 直接写 `inventory_txns`、shipment、AR/AP、invoice/payment |
| expected output | usecase + tests |
| review checklist | draft/submitted/canceled/closed、幂等、不可物理删除、业务状态和派生状态分离 |

## 008-api-rbac-for-masterdata-order

| Item | 内容 |
| --- | --- |
| objective | 接入 customers/suppliers/sales orders API 和 RBAC 动作权限 |
| allowed files | server API/service/biz/rbac/data tests, frontend API client if needed |
| forbidden files | unrelated UI pages, seedData, workflow fact-writing |
| schema change | No |
| migration | No |
| runtime | Yes |
| test commands | `cd server && go test ./internal/biz ./internal/data ./internal/service ./internal/server`, error-code sync if changed |
| stop conditions | 只靠菜单权限；未登录/disabled/非管理员/无权限未覆盖 |
| expected output | API + RBAC + tests |
| review checklist | Feature Flag -> RBAC -> Data Scope -> State Machine -> Business Rule -> Idempotency -> Audit Log |

## 009-frontend-v1-pages

| Item | 内容 |
| --- | --- |
| objective | 接入 V1 客户/供应商/订单页面，退出或降级 business_records 影子写入 |
| allowed files | web pages/config/tests/docs registry only if explicitly included by goal |
| forbidden files | Ent schema, migrations, backend facts, seedData unless goal permits |
| schema change | No |
| migration | No |
| runtime | Yes, frontend |
| test commands | `cd web && pnpm lint && pnpm css && pnpm test && pnpm style:l1` |
| stop conditions | 前端本地派生库存/出货/财务事实；中文文案做业务判断 |
| expected output | UI pages + tests + browser regression |
| review checklist | 默认态、交互态、恢复态、相邻区域、错误提示、权限隐藏不是安全边界 |

## 010-customer-data-import-draft

| Item | 内容 |
| --- | --- |
| objective | 设计 current 客户数据导入草案，分类字段并提出 dry-run / backfill 策略 |
| allowed files | docs/customers/current, docs/product import draft, scripts only if later goal explicitly permits |
| forbidden files | runtime import loader, Ent schema, migrations, seedData |
| schema change | No |
| migration | No |
| runtime | No |
| test commands | `git diff --stat`, keyword grep, optional fixture validation in later goal |
| stop conditions | current Excel 列直接写 Product Core；导入覆盖正式事实；无 dry-run |
| expected output | import mapping draft and unresolved question list |
| review checklist | Product Core / Industry Template / Customer Config / Customer Extension / Data Import Adapter / Print Template Input / Candidate / Reporting / Customer Material 分类 |
