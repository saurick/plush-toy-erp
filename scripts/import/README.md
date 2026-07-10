# 导入准备脚本 / Import Preparation

本目录只负责客户资料的来源登记、只读提取、快照冻结和 dry-run。当前仓库没有真实客户数据导入执行器，也不授权把模拟数据写成客户真实数据。

## 主路径

| 目的 | 脚本 | 边界 |
| --- | --- | --- |
| 来源清单校验 | `customerSourceManifestCheck.mjs` | 校验路径、hash、大小和未登记文件 |
| 结构化提取 | `customerSourceExtract.mjs` | 只提取 manifest 允许的 Excel，PDF / 图片保留人工复核 |
| 快照冻结 | `customerSourceSnapshotFreezeCheck.mjs` | 生成可复查的 freeze evidence |
| 导入预演 | `customerImportDryRun.mjs` | 输出候选、重复、冲突、未决项和禁止自动导入项 |

这些脚本都不得连接后端或数据库，不写正式表，不生成 migration，不创建库存、出货、财务或 Workflow 事实。输出写入 ignored 的 `output/customers/<customer-key>/`；原始客户行、凭据和 DSN 不得进入仓库。

## 真实导入边界

以后拿到经客户确认的真实数据时，应单独评审通用导入批次能力：通过正式 usecase/API 写入，具备幂等批次、逐行结果、失败恢复、审计和导入后对账。它不能在本目录以某个客户名硬编码，也不能由 dry-run 参数偷偷开启。

## 常用命令

```bash
node scripts/import/customerSourceManifestCheck.mjs \
  --manifest docs/customers/yoyoosun/source-manifest.json \
  --raw-dir docs/customers/yoyoosun/raw-source-files

node scripts/import/customerImportDryRun.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.sample.json \
  --out output/customers/yoyoosun/import-dry-run \
  --format json,md
```

## 验证

```bash
node --test scripts/import/customerSourceManifestCheck.test.mjs \
  scripts/import/customerSourceExtract.test.mjs \
  scripts/import/customerSourceSnapshotFreezeCheck.test.mjs \
  scripts/import/customerImportDryRun.test.mjs
node --test scripts/qa/test-data-isolation-boundary.test.mjs
```
