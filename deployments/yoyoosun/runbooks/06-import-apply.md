# yoyoosun 导入执行 / Import Apply Runbook

## 当前结论

当前 yoyoosun 没有可直接执行的真实客户数据导入。本 runbook 只记录未来导入执行边界和必需 evidence；本轮资料包不授权真实导入、不写数据库、不写 `business_records`、不写库存、出货、预留或财务事实。

## 必需前置

1. source manifest 已冻结，文件 hash 已确认。
2. dry-run report 已生成并通过人工 review。
3. unresolved queue 已清零或逐项批准跳过。
4. 客户确认导入范围、字段映射、导入顺序和已知限制。
5. pre-import 数据库备份和恢复方案存在。
6. 导入批次号 `import_batch_id` 已确定。
7. 单独数据治理任务明确允许真实 apply。

## 当前允许命令

只允许 dry-run、freeze 和 execution report 模式：

```bash
node scripts/import/customerImportDryRun.mjs \
  --source output/customers/yoyoosun/source-extract/source-snapshot.extracted.json \
  --existing output/customers/yoyoosun/source-extract/existing-v1.empty-preview.json \
  --out output/customers/yoyoosun/source-extract/dry-run-preview \
  --format json,md
```

```bash
node scripts/import/customerImportExecute.mjs \
  --dry-run-package output/customers/yoyoosun/real-dry-run-evidence \
  --approval scripts/import/fixtures/customers/yoyoosun/import-approval.sample.json \
  --backup-evidence output/customers/yoyoosun/backup-evidence.txt \
  --out output/customers/yoyoosun/import-execution
```

没有 `--execute` 时不会连接数据库或后端。

## 未来 apply 原则

- 只能走已评审的 V1 API / usecase，不直接写表。
- 不导入库存、出货、预留、财务事实；这些事实必须通过对应领域 usecase 产生。
- 每条导入结果必须可追溯到 source、mapping、operator 和 batch。
- 错误导入优先使用批次撤销、反向事实或归档方案，不物理删除事实流水。

## Evidence

导入 evidence 只记录 source manifest version、mapping version、dry-run summary、unresolved summary、approval id、backup id、apply summary 和 rollback plan。禁止提交 raw Excel/PDF/JPG/PNG、完整客户行数据或真实备份。
