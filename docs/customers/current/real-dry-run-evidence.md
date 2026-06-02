Doc Type / 文档类型: Current Real Dry-run Evidence
Status / 状态: 012 Evidence Prepared / 012 证据已准备
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: `scripts/import/currentCustomerDryRun.mjs`

# Current Real Dry-run Evidence

012 使用 011 已实现的 dry-run CLI 和 012 sanitized freeze fixtures 生成 real dry-run evidence package。该 package 用于人工 review，不是真实导入批准。

## Evidence Package

| item | value |
|---|---|
| Evidence package directory | `output/current-real-dry-run-evidence/` |
| Input source snapshot | `scripts/import/fixtures/current/source-snapshot.freeze.sample.json` |
| Input existing snapshot | `scripts/import/fixtures/current/existing-v1.freeze.sample.json` |
| `canExecuteRealImport` | `false` |
| No real import | Yes |
| Manual review required | Yes |

## Dry-run Command

```bash
node scripts/import/currentCustomerDryRun.mjs \
  --source scripts/import/fixtures/current/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.freeze.sample.json \
  --out output/current-real-dry-run-evidence \
  --format json,md
```

## Generated Output Files

| file | purpose |
|---|---|
| `source-references.json` | Source reference list for every sanitized source row. |
| `normalized-rows.json` | Normalized rows, raw fields, warnings, and skip flags. |
| `candidates.json` | `create/update/review/defer/forbidden` candidates. |
| `unresolved-queue.json` | Manual review queue with block / defer / review severity. |
| `duplicates.json` | Duplicate matching evidence. |
| `conflicts.json` | Existing-vs-source conflict evidence. |
| `forbidden-auto-import.json` | Shipment / inventory / finance / boundary forbidden evidence. |
| `validation-summary.json` | Summary counts and `canExecuteRealImport=false`. |
| `dry-run-report.md` | Markdown review report with no-real-import statement. |

## validation-summary Summary

| metric | value |
|---|---:|
| totalSources | 20 |
| normalizedRows | 20 |
| forbiddenCount | 15 |
| duplicateCount | 0 |
| conflictCount | 0 |
| blockerCount | 32 |
| canProceedToManualReview | true |
| canExecuteRealImport | false |

## Candidates Summary

| actionCandidate | count |
|---|---:|
| update | 4 |
| create | 8 |
| review | 3 |
| defer | 2 |
| forbidden | 3 |
| skip | 0 |

These are dry-run candidates only. `create` and `update` do not mean the system may write DB in 012.

## Unresolved Summary

| severity | count |
|---|---:|
| block | 17 |
| defer | 4 |
| review | 1 |
| warning | 0 |

Every block must be reviewed before any later import-loader design. Deferred rows remain out of scope for real import.

## Duplicates / Conflicts Summary

| output | count | handling |
|---|---:|---|
| duplicates | 0 | Continue to review if future real source snapshots include duplicate code/name. |
| conflicts | 0 | Continue to review if future real source snapshots produce update conflicts. |

## Forbidden Auto-import Summary

`forbidden-auto-import.json` contains 15 forbidden entries. The evidence intentionally preserves shipment / inventory / finance boundary records, including:

- `shipping_released != shipped`
- `workflow task done != fact posted`
- sales order source documents are not shipment facts
- inventory facts require formal fact usecases
- finance facts require later finance review

## No Real Import Statement

012 does not execute real import. It does not write DB, create a loader, write V1 tables, write `business_records`, generate SQL, generate migration, modify schema/API/UI/seedData/docs registry, or do `business_records` cutover. The dry-run output is evidence, not import approval.

## Manual Review Next Steps

1. Review `output/current-source-snapshot-freeze/freeze-check-summary.json`.
2. Review `output/current-real-dry-run-evidence/unresolved-queue.json`.
3. Confirm all `forbidden-auto-import.json` entries stay excluded.
4. Confirm `product_skus` and `purchase_orders` remain deferred.
5. Confirm no customer-sensitive raw value is copied into review notes.

## Next Allowed Step

A later Goal may review the evidence and design a real import loader only if it explicitly includes backup, rollback / forward-fix, idempotency, source reference, reconciliation, customer sign-off, and formal usecase boundaries.

## Next Forbidden Step

Do not jump from this evidence package directly to real import, DB writes, schema/API/UI/seedData/docs registry changes, or `business_records` runtime cutover.

## Output Directory Policy

`output/current-real-dry-run-evidence/` is local evidence output and is not committed to git.
