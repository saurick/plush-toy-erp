Doc Type / 文档类型: Current Customer Import Acceptance Checklist / current 客户导入验收清单
Status / 状态: Draft + 011 Tooling Evidence Added / 草案，已补 011 工具证据
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# current 客户导入验收清单 / Current Customer Import Acceptance Checklist

本清单用于 future current 客户导入前的 dry-run 验收。010 只产出清单，不执行真实导入；011 已新增 CLI dry-run package；012 已新增 source snapshot freeze checker、sanitized freeze fixtures、freeze evidence、real dry-run evidence 和 manual review checklist。这些都可作为 future import 前置 evidence，但仍不代表真实导入可以直接执行。

## 检查清单 / Checklist

| item | required before import execution | evidence | 010 status |
|---|---:|---|---|
| source files confirmed | 是 | source reference list，文件名 / sheet / row / business_record id | Draft only |
| 011 dry-run package generated | 是 | `source-references.json`、`normalized-rows.json`、`candidates.json`、`unresolved-queue.json`、`duplicates.json`、`conflicts.json`、`forbidden-auto-import.json`、`validation-summary.json`、`dry-run-report.md` | Tooling available |
| 012 source snapshot freeze evidence generated | 是 | `freeze-metadata.json`、`freeze-check-summary.json`、`freeze-check-report.md` | Evidence prepared |
| 012 manual review checklist prepared | 是 | `docs/customers/current/source-snapshot-manual-review-checklist.md` | Evidence prepared |
| field classification reviewed | 是 | `import-field-classification.md` 经人工评审 | Draft only |
| target model confirmed | 是 | V1 / existing formal model 列表 | Draft only |
| required fields present | 是 | required field validation summary | Draft only |
| duplicate rules reviewed | 是 | duplicate code/name candidates reviewed | Draft only |
| unresolved queue empty or approved | 是 | unresolved queue 全部 resolved / approved defer / approved skip | Draft only |
| no forbidden facts generated | 是 | forbidden auto-import list 为空或全部 block | Draft only |
| no `tenant_id` introduced | 是 | grep / diff 证明未进入 schema、runtime、mapping target | Draft only |
| no shipment facts generated | 是 | `shipments / shipment_items` 不在 import target | Draft only |
| no inventory facts generated | 是 | `inventory_txns / inventory_balances / inventory_lots` 不在 import target | Draft only |
| no finance facts generated | 是 | AR/AP、invoice、payment、reconciliation 不在 import target | Draft only |
| no `product_skus` generated unless future review approves | 是 | SKU 字段全部 deferred / unresolved | Draft only |
| no `purchase_orders` generated unless future review approves | 是 | purchase order 字段全部 deferred / unresolved | Draft only |
| business_records not deleted | 是 | `business_records` 只作 source snapshot | Draft only |
| seedData not modified | 是 | `web/src/erp/config/seedData.mjs` 未改 | Draft only |
| docs registry not modified | 是 | `web/src/erp/config/docs.mjs` 未改 | Draft only |
| V1 data preview reviewed | 是 | customers/suppliers/contacts/orders/items preview | Draft only |
| rollback plan prepared | 是 | rollback 或 forward-fix 方案 | Future Stage 6 required |
| backup plan prepared | 是 | 数据库备份和 source artifact 归档 | Future Stage 6 required |
| customer sign-off | 是 | 客户确认导入预览和 unresolved 处理 | Future Stage 5 required |

## 011 CLI 证据 / 011 CLI Evidence

011 的 dry-run evidence 由以下命令生成：

```bash
node scripts/import/currentCustomerDryRun.mjs \
  --source scripts/import/fixtures/current/source-snapshot.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.sample.json \
  --out output/current-import-dry-run \
  --format json,md
```

`validation-summary.json` 中 `canExecuteRealImport` 必须始终为 `false`。真实导入仍需要人工确认、数据库备份、回滚 / forward-fix 方案、客户 sign-off 和单独 implementation Goal。

## 012 冻结证据 / 012 Freeze Evidence

012 的 freeze evidence 由以下命令生成：

```bash
node scripts/import/currentSourceSnapshotFreezeCheck.mjs \
  --source scripts/import/fixtures/current/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.freeze.sample.json \
  --out output/current-source-snapshot-freeze
```

012 的 real dry-run evidence 由以下命令生成：

```bash
node scripts/import/currentCustomerDryRun.mjs \
  --source scripts/import/fixtures/current/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.freeze.sample.json \
  --out output/current-real-dry-run-evidence \
  --format json,md
```

`freeze-metadata.json` 和 `validation-summary.json` 中 `canExecuteRealImport` 都必须为 `false`。output 目录是 evidence，不是 import approval，不纳入 git。

## 导入前门禁 / Pre-import Gate

真实 import execution 之前必须同时满足：

1. dry-run preview 已生成且通过人工确认。
2. unresolved queue 不存在 block 项。
3. deferred domain 已被明确排除或转入后续 Goal。
4. forbidden fact generation 清单全部 block。
5. 备份、回滚、幂等、校验和审计已在单独 implementation Goal 中设计。
6. import loader 只走正式 V1 / existing usecase，不绕过业务规则。
7. `business_records` 保留为 source snapshot，不双写。

## 拒绝条件 / Rejection Criteria

出现以下情况不得执行导入：

- 需要新增 schema、migration 或 `tenant_id`。
- 需要创建 `product_skus`、`purchase_orders`、`shipments`、`stock_reservations` 或 finance facts。
- 需要从旧记录自动生成 shipment / inventory / finance facts。
- 需要修改 seedData、docs registry、runtime API/UI 或 `business_records` 才能让 dry-run 通过。
- current 客户字段被当作 Product Core 必填字段。
- unresolved queue 中还有 block 项。
- 012 freeze evidence 或 real dry-run evidence 被误读为真实导入批准。
