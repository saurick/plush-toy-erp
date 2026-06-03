Doc Type / 文档类型: Yoyoosun Source Snapshot Freeze Evidence / yoyoosun 来源快照冻结证据
Status / 状态: Evidence Prepared / 证据已准备
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: `scripts/import/customerSourceSnapshotFreezeCheck.mjs`

# 永绅 yoyoosun 来源快照冻结 / Yoyoosun Source Snapshot Freeze

已新增 customer source snapshot freeze checker，并基于 sanitized fixture 生成 freeze evidence。该 evidence 只证明 source snapshot freeze checker 可运行、输入可追溯、风险可复查；它不是真实导入批准。

## 冻结 metadata / Freeze Metadata

| item | value |
|---|---|
| Freeze ID | `customer-freeze-1bcde22d39ea-7e31081a7a8b` |
| Freeze date | `2026-05-31T10:09:15.575Z` |
| Source snapshot file path | `scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json` |
| Existing snapshot file path | `scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json` |
| Output directory | `output/customers/yoyoosun/source-snapshot-freeze/` |
| Source SHA256 | `1bcde22d39ea34c0f801183229348e9c903d968cc5478b0e2d2dd2bbcabe31b9` |
| Existing SHA256 | `7e31081a7a8b50ebb74e916d4a2f7e9b110c55cf44ccbc9231598a40e38dff9f` |
| Source count | `20` |
| `noRealImport` | `true` |
| `canExecuteRealImport` | `false` |
| Manual review required | `true` |

## 冻结检查命令 / Freeze Checker Command

```bash
node scripts/import/customerSourceSnapshotFreezeCheck.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \
  --out output/customers/yoyoosun/source-snapshot-freeze
```

## Dry-run 命令 / Dry-run Command

```bash
node scripts/import/customerImportDryRun.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \
  --out output/customers/yoyoosun/real-dry-run-evidence \
  --format json,md
```

## 领域计数 / Domain Count

| domain | count |
|---|---:|
| customers | 2 |
| suppliers | 1 |
| contacts | 2 |
| sales_orders | 3 |
| sales_order_items | 2 |
| products | 1 |
| materials | 1 |
| units | 1 |
| warehouses | 1 |
| bom | 1 |
| product_skus | 1 |
| purchase_orders | 1 |
| shipment | 1 |
| inventory | 1 |
| finance | 1 |

## 来源类型计数 / Source Type Count

| sourceType | count |
|---|---:|
| Data Import Source | 19 |
| Industry Template Candidate | 1 |

## 已知阻塞 / Known Blockers

| blocker type | count | meaning |
|---|---:|---|
| forbidden field | 11 | shipment / inventory / finance / shipped-like fields must not be auto-imported. |
| shipping boundary risk | 4 | `shipping_released` or shipped wording must not become shipment, shipped, or inventory facts. |
| workflow fact boundary risk | 2 | workflow done / fact posted wording must not become posted facts. |

## 已知警告 / Known Warnings

| warning type | count | handling |
|---|---:|---|
| sensitive field | 5 | Review field names only; do not copy raw values into reports. |
| deferred field | 5 | `product_skus` and `purchase_orders` stay deferred until a later implementation task explicitly changes the boundary. |

## 敏感字段处理 / Sensitive Field Handling

Freeze checker evidence records sensitive field names and source references only. It does not output raw phone, email, address, contact, bank, account, or identity values in `freeze-check-summary.json` or `freeze-check-report.md`.

## 无真实导入声明 / No Real Import Statement

Source snapshot freeze evidence does not execute real import. It does not read DB, write DB, create a loader, generate SQL, generate migration, modify schema/API/UI/seedData/docs registry, write `business_records`, or perform `business_records` cutover. `canExecuteRealImport=false` is mandatory.

## 重新运行说明 / Re-run Instructions

```bash
rm -rf output/customers/yoyoosun/source-snapshot-freeze
node scripts/import/customerSourceSnapshotFreezeCheck.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \
  --out output/customers/yoyoosun/source-snapshot-freeze
```

Then inspect:

```bash
cat output/customers/yoyoosun/source-snapshot-freeze/freeze-metadata.json
cat output/customers/yoyoosun/source-snapshot-freeze/freeze-check-summary.json
cat output/customers/yoyoosun/source-snapshot-freeze/freeze-check-report.md
```

## 输出目录策略 / Output Directory Policy

`output/customers/yoyoosun/source-snapshot-freeze/` is local evidence output and is not committed to git. The committed truth is the CLI, sanitized fixtures, tests, and this documentation.
