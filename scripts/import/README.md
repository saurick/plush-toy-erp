# 导入脚本 / Import Scripts

本文是 `scripts/import/` 的目录入口。客户资料和导入边界仍以 [docs/customers/yoyoosun/README.md](../../docs/customers/yoyoosun/README.md)、[docs/customers/yoyoosun/导入策略.md](../../docs/customers/yoyoosun/导入策略.md) 和 [scripts/README.md](../README.md) 为准。

## 目录职责

`scripts/import/` 放 yoyoosun source manifest 检查、只读 source extract、snapshot freeze、dry-run preview 和受控导入执行器。当前没有可直接执行的 yoyoosun 客户真实数据；真实写入必须另有客户确认、备份证据、恢复计划和显式执行确认。

## 主路径

| 步骤 | 脚本 | 输出 / 作用 |
| --- | --- | --- |
| 1. 来源清单校验 | `customerSourceManifestCheck.mjs` | 校验 tracked manifest、sha256、size 和未登记来源文件 |
| 2. 只读结构化提取 | `customerSourceExtract.mjs` | 从允许结构化的 Excel 生成本地 source snapshot 和报告 |
| 3. 冻结检查 | `customerSourceSnapshotFreezeCheck.mjs` | 生成 freeze metadata、summary 和 report |
| 4. dry-run preview | `customerImportDryRun.mjs` | 生成候选、冲突、未解决队列、禁止自动导入项和 dry-run 报告 |
| 5. 受控执行报告 | `customerImportExecute.mjs` | 默认 report-only；真实 `--execute` 需满足审批、备份、恢复和确认条件 |

## 写入边界

- manifest check、extract、freeze 和 dry-run 不连接数据库、不读取 server config、不调用 web runtime、不写正式表、不写 `business_records`。
- `fixtures/**` 只用于 report-only 自检，不能作为真实客户批准或真实导入证据。
- `customerImportExecute.mjs` 没有 `--execute` 时只生成报告；进入 `--execute` 必须使用 JSON-RPC V1 API，不直接写表、不生成 schema / migration、不创建出货、库存或财务事实。
- 输出默认写到 ignored `output/customers/yoyoosun/**`，不得把 raw rows、真实凭据、完整 DSN 或未脱敏客户原始内容写入仓库。

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

## 修改后验证

调整导入脚本后，优先运行对应测试：

```bash
node --test scripts/import/customerSourceManifestCheck.test.mjs
node --test scripts/import/customerImportDryRun.test.mjs
node --test scripts/import/customerImportExecute.test.mjs
git diff --check
```
