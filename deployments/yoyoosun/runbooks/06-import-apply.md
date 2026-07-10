# 永绅导入准备边界 / Yoyoosun Import Preparation

## 当前结论

当前没有经过客户确认、可直接写入的永绅真实数据。本部署包只允许来源校验、快照冻结和 dry-run，不提供 apply 命令，也不把 seed / fixture 当成真实导入。

```bash
node scripts/import/customerImportDryRun.mjs \
  --source output/customers/yoyoosun/source-extract/source-snapshot.extracted.json \
  --existing output/customers/yoyoosun/source-extract/existing-v1.empty-preview.json \
  --out output/customers/yoyoosun/source-extract/dry-run-preview \
  --format json,md
```

dry-run 只用于确认字段映射、重复、冲突、未决主体和禁止自动生成的事实，不连接目标环境。

## 未来真实导入的进入条件

1. 客户确认 source manifest、字段映射和 dry-run 结果。
2. 未决项已逐项处理，模拟数据与真实数据已明确隔离。
3. 通用导入批次能力已经通过 usecase、RBAC、审计、幂等、失败恢复和对账测试。
4. 目标环境备份与恢复演练通过。
5. 另开获得明确授权的数据治理任务执行；不得在本 runbook 临时拼命令。

库存、出货、收付款等事实始终由对应领域 usecase 产生，不能由主数据导入脚本补造。
