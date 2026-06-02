Doc Type / 文档类型: Current Customer Import Dry-run Tooling / current 客户导入 dry-run 工具说明
Status / 状态: Implemented Tooling / 已实现本地工具
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: `scripts/import/currentCustomerDryRun.mjs`

# current 客户导入 dry-run 工具说明 / Current Customer Import Dry-run Tooling

011 已新增 current 客户导入 dry-run CLI。012 又新增 source snapshot freeze checker，并用 sanitized freeze fixtures 生成 freeze evidence 与 real dry-run evidence package。两者都只读取 JSON snapshot，供人工 review 使用；它们不执行真实导入。

## 012 冻结检查器 / 012 Freeze Checker

```bash
node scripts/import/currentSourceSnapshotFreezeCheck.mjs \
  --source scripts/import/fixtures/current/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.freeze.sample.json \
  --out output/current-source-snapshot-freeze
```

输出：

| 文件 | 说明 |
|---|---|
| `freeze-metadata.json` | Freeze ID、freeze date、source/existing path、SHA256、source count、domain/source type counts、`noRealImport=true`、`canExecuteRealImport=false`。 |
| `freeze-check-summary.json` | Source root/row 校验、duplicate sourceId、domain、fields、source reference、sensitive / forbidden / deferred / boundary 风险统计。 |
| `freeze-check-report.md` | 可读 freeze 报告，包含 checksum、domain counts、blockers、warnings、sensitive review、forbidden review、deferred review 和 no-real-import statement。 |

012 生成的 evidence 目录：

- `output/current-source-snapshot-freeze/`
- `output/current-real-dry-run-evidence/`

这些 output 目录只作为本地 evidence，不纳入 git，也不是 import approval。

## CLI 用法

```bash
node scripts/import/currentCustomerDryRun.mjs \
  --source scripts/import/fixtures/current/source-snapshot.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.sample.json \
  --out output/current-import-dry-run \
  --format json,md
```

012 real dry-run evidence 使用 freeze fixtures：

```bash
node scripts/import/currentCustomerDryRun.mjs \
  --source scripts/import/fixtures/current/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.freeze.sample.json \
  --out output/current-real-dry-run-evidence \
  --format json,md
```

查看帮助：

```bash
node scripts/import/currentCustomerDryRun.mjs --help
```

## 参数

| 参数 | 必填 | 说明 |
|---|---:|---|
| `--source` | 是 | source snapshot JSON 路径。 |
| `--existing` | 是 | existing V1 / formal model snapshot JSON 路径。 |
| `--out` | 是 | dry-run package 输出目录。 |
| `--format` | 否 | `json`、`md` 或 `json,md`，默认 `json,md`。 |
| `--fail-on-blockers` | 否 | 存在 block severity unresolved 或 forbidden 项时，仍先写输出，再返回非 0。 |
| `--strict-source` | 否 | source row 缺少 `sourceId/sourceType/sourceKind/moduleKey/domain/fields` 时返回非 0。 |
| `--help` | 否 | 输出帮助。 |

## Source Snapshot 最小格式

```json
{
  "version": 1,
  "generatedAt": "2026-05-31T00:00:00.000Z",
  "sources": [
    {
      "sourceId": "br-partners-001",
      "sourceType": "Data Import Source",
      "sourceKind": "business_records",
      "moduleKey": "partners",
      "fileName": "business-records-export.json",
      "sheetName": null,
      "rowNumber": 1,
      "domain": "customers",
      "fields": {
        "document_no": "C001",
        "title": "示例客户"
      },
      "items": []
    }
  ]
}
```

本工具不解析 Excel / PDF / OCR。外部资料必须先被人工或后续单独工具整理成 JSON snapshot。

## Existing Snapshot 最小格式

```json
{
  "version": 1,
  "customers": [
    {
      "id": "customer-1",
      "code": "C001",
      "name": "示例客户",
      "displayName": "示例客户",
      "status": "active"
    }
  ],
  "suppliers": [],
  "contacts": [],
  "salesOrders": [],
  "salesOrderItems": [],
  "products": [],
  "materials": [],
  "units": [],
  "warehouses": [],
  "bomHeaders": [],
  "bomItems": []
}
```

existing snapshot 只作为只读匹配输入。CLI 不从数据库读取 existing snapshot，也不会写回该文件。

## 输出文件

`--format json,md` 会在 `--out` 目录生成：

| 文件 | 说明 |
|---|---|
| `source-references.json` | 每条 source 的来源、文件、sheet、行号和引用标签。 |
| `normalized-rows.json` | trim、空值、decimal/date/money/unit 基础规范化结果和 warning。 |
| `candidates.json` | `create/update/skip/defer/forbidden/review` 候选动作。 |
| `unresolved-queue.json` | block / defer / review / warning 人工处理队列。 |
| `duplicates.json` | code/name 等重复匹配。 |
| `conflicts.json` | 已匹配对象与 source 候选字段冲突。 |
| `forbidden-auto-import.json` | shipment、inventory、finance、`shipping_released -> shipped`、workflow done -> fact posted 等禁止自动导入项。 |
| `validation-summary.json` | 统计汇总；`canExecuteRealImport` 永远是 `false`。 |
| `dry-run-report.md` | 可读 Markdown 报告。 |

## 退出码 / Exit Code

| 场景 | 结果 |
|---|---|
| `--help` | `0` |
| 缺少 `--source/--existing/--out` | 非 `0` |
| source / existing 文件不存在或 JSON 无效 | 非 `0` |
| snapshot `version` 不是 `1` | 非 `0` |
| `--strict-source` 且 source metadata 缺失 | 非 `0` |
| `--fail-on-blockers` 且存在 block / forbidden | 非 `0`，但会先生成输出文件 |
| 默认 dry-run 有 block / forbidden | `0`，由报告交给人工 review |

## 手工 Review 下一步

1. 先看 `validation-summary.json`，确认 `canExecuteRealImport` 为 `false`。
2. 处理 `unresolved-queue.json` 中的 block / defer / review 项。
3. 核对 `duplicates.json` 和 `conflicts.json`，不要自动合并同名或同 code 主体。
4. 确认 `forbidden-auto-import.json` 中的 shipment / inventory / finance 项全部排除。
5. 只有后续单独 Goal 才能设计或实现真实 import loader，并且必须补备份、回滚、幂等、校验和客户 sign-off。

## 明确边界

- 不连接数据库。
- 不读取 server config。
- 不调用 server / web runtime。
- 不写正式表。
- 不写 `business_records`。
- 不生成 SQL。
- 不新增 schema / migration。
- 不改 API / RBAC / UI。
- 不改 seedData。
- 不改 docs registry。
- 不执行真实 import / backfill。
- `canExecuteRealImport` 永远是 `false`。
- 012 freeze evidence 和 dry-run evidence 不是导入批准。
- 真实 import loader 仍需单独 Goal，并且必须另有备份、回滚、幂等、对账、客户确认和正式 usecase 边界。
- `sales_order` 仍是 Source Document / Business Commitment，不是 shipment、inventory 或 finance fact。
- `shipping_released != shipped`。
- `workflow task done != fact posted`。
