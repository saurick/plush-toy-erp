# yoyoosun 回滚 / Rollback Runbook

代码回滚、配置恢复与数据库恢复是不同动作。代码回滚仅允许 migration 序列和客户配置源指纹完全相同的已验证旧版本，复用正式 rollback controller / executor；不手工切 `.env` 后直接启动，也不自动 down migration。

## 回滚检查

| 现场 | 处理 |
| --- | --- |
| 应用失败且结构、配置兼容 | 准备固定目标的代码与镜像回滚计划 |
| schema / 数据或存储不兼容 | 先评审 forward-fix 或配套 PG、附件及配置恢复 |
| 执行结果未知 | 保留现场，先只读核对实际版本与 operation，不自动重试 |
| 首次生产初始化 | 没有旧生产版本可回退；使用本次初始化和备份恢复身份 |

## 代码回滚

1. 核对当前与目标 manifest、目标运行 SHA、客户写入、回滚理由和恢复点。
2. 只读准备计划：

```bash
node scripts/deploy/rollback-controller.mjs \
  --current-manifest <当前发布包>/release-manifest.json \
  --target-manifest <回滚发布包>/release-manifest.json \
  --target production-133 --idempotency-key <稳定随机键> --json
```

3. 获明确回滚授权后，通过版本中心或 `rollback-executor.mjs --help` 对应入口提交完整确认串。
4. 回滚后核对代码、镜像、health / ready、公网、客户配置和业务 smoke；保留原因、操作身份及恢复回执。

## 数据库与附件恢复

按[备份恢复流程](04-backup-restore.md#恢复步骤)，明确停写及可能的数据损失，选择配套 PG dump、附件备份、release、migration 和配置身份，在隔离目标恢复、校验后再切连接。不能用新 schema 配旧镜像，也不能删除库存、出货或财务事实当作回滚。

生产恢复后的账号与会话按正式账号治理处理，不执行 demo/test 的固定密码合同。客户验收资料、真实备份、凭据和未脱敏日志各按受控存储边界保存，不进入 Git。
