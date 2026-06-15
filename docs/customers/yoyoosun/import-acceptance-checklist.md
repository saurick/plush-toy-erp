Doc Type / 文档类型: Yoyoosun Customer Import Acceptance Checklist / 永绅 yoyoosun 客户导入验收清单
Status / 状态: Draft + Dry-run / Freeze Evidence + Execution Loader Prepared / 草案，已准备 dry-run / freeze 证据和受控执行器
Runtime Implemented / 运行时已实现: Import execution tooling only / 仅导入执行工具
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# 永绅 yoyoosun 客户导入验收清单 / Yoyoosun Customer Import Acceptance Checklist

本清单用于 永绅 yoyoosun 客户导入前的 dry-run、freeze、approval 和 execution gate 验收。当前已具备 dry-run draft、CLI dry-run package、source snapshot freeze checker、sanitized freeze fixtures、freeze evidence、real dry-run evidence、manual review checklist 和受控 import execution loader。当前没有可直接执行的客户真实数据，试用模拟中执行器只允许用于报告模式和门禁校验，不执行真实写入。

试用模拟不拆 A/B/C/D 或任何字母子阶段，试用目标只能一次性使用 seed、fixture 或手工构造的模拟客户、供应商、联系人和销售订单数据做环境、账号、菜单、V1 页面和岗位任务端演练；本清单中的 execution loader 不应被用于把模拟数据写成客户真实导入结果。

## 检查清单 / Checklist

| item                                                         | required before import execution | evidence                                                                                                                                                                                                        | status                     |
| ------------------------------------------------------------ | -------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| source files confirmed                                       |                               是 | source reference list，文件名 / sheet / row / business_record id                                                                                                                                                | Draft only                 |
| dry-run package generated                                    |                               是 | `source-references.json`、`normalized-rows.json`、`candidates.json`、`unresolved-queue.json`、`duplicates.json`、`conflicts.json`、`forbidden-auto-import.json`、`validation-summary.json`、`dry-run-report.md` | Tooling available          |
| source snapshot freeze evidence generated                    |                               是 | `freeze-metadata.json`、`freeze-check-summary.json`、`freeze-check-report.md`                                                                                                                                   | Evidence prepared          |
| manual review checklist prepared                             |                               是 | `docs/customers/yoyoosun/source-snapshot-manual-review-checklist.md`                                                                                                                                            | Evidence prepared          |
| execution loader available                                   |                               是 | `scripts/import/customerImportExecute.mjs`、`scripts/import/customerImportExecute.test.mjs`                                                                                                                     | Tooling available          |
| execution report generated                                   |                               是 | `import-execution-report.json`、`import-execution-report.md`                                                                                                                                                    | Report mode available      |
| simulated trial data marked                                  |                               是 | seed、fixture 或手工样本必须标记为 simulated / demo，不可写成客户真实数据                                                                                                                                       | Current trial target       |
| field classification reviewed                                |                               是 | `import-field-classification.md` 经人工评审                                                                                                                                                                     | Draft only                 |
| target model confirmed                                       |                               是 | V1 / existing formal model 列表                                                                                                                                                                                 | Draft only                 |
| required fields present                                      |                               是 | required field validation summary                                                                                                                                                                               | Draft only                 |
| duplicate rules reviewed                                     |                               是 | duplicate code/name candidates reviewed                                                                                                                                                                         | Draft only                 |
| unresolved queue empty or approved                           |                               是 | unresolved queue 全部 resolved / approved defer / approved skip                                                                                                                                                 | Draft only                 |
| no forbidden facts generated                                 |                               是 | forbidden auto-import list 为空或全部 block                                                                                                                                                                     | Draft only                 |
| no `tenant_id` introduced                                    |                               是 | grep / diff 证明未进入 schema、runtime、mapping target                                                                                                                                                          | Draft only                 |
| no shipment facts generated                                  |                               是 | `shipments / shipment_items` 不在 import target                                                                                                                                                                 | Draft only                 |
| no inventory facts generated                                 |                               是 | `inventory_txns / inventory_balances / inventory_lots` 不在 import target                                                                                                                                       | Draft only                 |
| no finance facts generated                                   |                               是 | AR/AP、invoice、payment、reconciliation 不在 import target                                                                                                                                                      | Draft only                 |
| no `product_skus` generated unless future review approves    |                               是 | SKU 字段全部 deferred / unresolved                                                                                                                                                                              | Draft only                 |
| no `purchase_orders` generated unless future review approves |                               是 | purchase order 字段全部 deferred / unresolved                                                                                                                                                                   | Draft only                 |
| old business_records runtime not required                    |                               是 | 旧表族已删除；删除前 JSONL evidence 不作为自动导入来源                                                                                                                                                         | Draft only                 |
| seedData not modified                                        |                               是 | `web/src/erp/config/seedData.mjs` 未改                                                                                                                                                                          | Draft only                 |
| frontend docs registry not restored                          |                               是 | 产品内 docs registry 已移除，导入任务不恢复 `web/src/erp/config/docs.mjs`                                                                                                                                       | Draft only                 |
| V1 data preview reviewed                                     |                               是 | customers/suppliers/contacts/orders/items preview                                                                                                                                                               | Draft only                 |
| rollback plan prepared                                       |                               是 | rollback 或 forward-fix 方案                                                                                                                                                                                    | Stage 6 execution required |
| backup plan prepared                                         |                               是 | 数据库备份和 source artifact 归档，`--backup-evidence` 指向存在的证据文件                                                                                                                                       | Stage 6 execution required |
| customer sign-off                                            |                               是 | 客户确认导入预览和 unresolved 处理                                                                                                                                                                              | Future Stage 5 required    |

## CLI 证据 / CLI Evidence

dry-run evidence 由以下命令生成：

```bash
node scripts/import/customerImportDryRun.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.sample.json \
  --out output/customers/yoyoosun/import-dry-run \
  --format json,md
```

`validation-summary.json` 中 `canExecuteRealImport` 必须始终为 `false`。当前试用模拟不执行真实导入；人工确认、数据库备份、回滚 / forward-fix 方案、客户 sign-off 和 execution loader 门禁只能作为未来另开数据治理评审的输入，不能改变当前只能模拟的试用目标。

## 冻结证据 / Freeze Evidence

freeze evidence 由以下命令生成：

```bash
node scripts/import/customerSourceSnapshotFreezeCheck.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \
  --out output/customers/yoyoosun/source-snapshot-freeze
```

real dry-run evidence 由以下命令生成：

```bash
node scripts/import/customerImportDryRun.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \
  --out output/customers/yoyoosun/real-dry-run-evidence \
  --format json,md
```

`freeze-metadata.json` 和 `validation-summary.json` 中 `canExecuteRealImport` 都必须为 `false`。output 目录是 evidence，不是 import approval，不纳入 git。

## 执行器证据 / Execution Loader Evidence

受控执行器默认只生成报告：

```bash
node scripts/import/customerImportExecute.mjs \
  --dry-run-package output/customers/yoyoosun/real-dry-run-evidence \
  --approval output/customers/yoyoosun/import-approval.json \
  --backup-evidence output/customers/yoyoosun/backup-evidence.txt \
  --out output/customers/yoyoosun/import-execution
```

没有 `--execute` 时，报告中的 `executed` 必须为 `false`。当前试用模拟禁止真实写入；以下变量只描述执行器历史门禁形态，不代表当前允许使用：

```bash
CUSTOMER_IMPORT_CONFIRM=EXECUTE_YOYOOSUN_IMPORT
CUSTOMER_IMPORT_ADMIN_TOKEN=...
# or CUSTOMER_IMPORT_ADMIN_USERNAME / CUSTOMER_IMPORT_ADMIN_PASSWORD
```

即使显式传入 `--backend-url` 或 `CUSTOMER_IMPORT_BACKEND_URL`，当前也不得在试用模拟中执行真实写入。不要把 sample approval fixture 当客户批准。

## 导入前门禁 / Pre-import Gate

真实 import execution 之前必须同时满足：

1. dry-run preview 已生成且通过人工确认。
2. unresolved queue 不存在 block 项。
3. deferred domain 已被明确排除或转入后续实现任务。
4. forbidden fact generation 清单全部 block。
5. 备份、回滚、幂等、校验和审计已在单独 implementation task 中设计。
6. import loader 只走正式 V1 JSON-RPC API / existing usecase，不绕过业务规则。
7. 不恢复旧 `business_records` 表族，也不把删除前 JSONL evidence 当自动导入来源。
8. execution report 已生成并归档；当前不进入真实执行或导入后对账。

## 拒绝条件 / Rejection Criteria

出现以下情况不得执行导入：

- 需要新增 schema、migration 或 `tenant_id`。
- 需要创建 `product_skus`、`purchase_orders`、`shipments`、`stock_reservations` 或 finance facts。
- 需要从旧记录自动生成 shipment / inventory / finance facts。
- 需要修改 seedData、docs registry、runtime API/UI，或恢复旧 `business_records` 才能让 dry-run 通过。
- 永绅 yoyoosun 客户字段被当作 Product Core 必填字段。
- 模拟数据被当作客户真实数据或导入批准。
- 真实导入被拆成试用模拟的字母子阶段或后续半阶段。
- unresolved queue 中还有 block 项。
- freeze evidence 或 real dry-run evidence 被误读为真实导入批准。
- 缺少 approval、backup evidence、确认短语、目标后端或管理员凭据。
- approval 试图批准 unsupported target、deferred domain、forbidden auto-import 或 unresolved block。
