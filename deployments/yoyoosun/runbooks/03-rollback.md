# yoyoosun 回滚 / Rollback Runbook

## 回滚类型

| 类型 | 适用场景 | 优先策略 |
| --- | --- | --- |
| 应用版本回滚 | 新镜像启动失败、页面严重异常 | 恢复上一版 `APP_IMAGE` / `WEB_IMAGE` |
| 配置回滚 | `.env` 或网关配置错误 | 恢复上一版受控配置 |
| migration 回滚 | migration 导致结构或数据不可用 | 优先恢复升级前备份；必要时走 forward-fix |
| 导入回滚 | 导入批次错误 | 当前 yoyoosun 真实导入未开放；未来必须按 import batch 和反向事实处理 |

## 决策前检查

1. 是否已经保留现场 evidence。
2. 是否有升级前备份和 image digest。
3. 是否发生 schema/migration 变更。
4. 是否已有客户业务写入。
5. 回滚是否比 forward-fix 风险更低。

## 应用版本回滚

只有确认本轮没有执行 migration，或数据库仍与旧镜像合同一致时，才允许单独回滚应用版本。migration 已成功 apply 后，旧镜像可能写入已删除字段或违反新约束，必须恢复升级前数据库备份并同时恢复旧镜像，或走已评审的 forward-fix；不得 image-only rollback。

```bash
cd /opt/plush-toy-erp/current/server/deploy/compose/prod
# 在受控 .env 中恢复上一版 APP_IMAGE / WEB_IMAGE
docker compose -f compose.yml --env-file /secure/path/yoyoosun/.env up -d --remove-orphans
docker compose -f compose.yml --env-file /secure/path/yoyoosun/.env ps
```

回滚后执行 smoke，并记录 rollback evidence。

## 数据库恢复

只有在 migration 或数据写入已经破坏当前库，且已有明确备份时才恢复数据库。恢复动作必须在客户使用窗口内明确通知，并记录：

- backup id、hash、大小和存储别名。
- 恢复目标库。
- 恢复后 migration version。
- 恢复后 smoke 结果。

恢复期间保持 `app-server` 和 Web 停止。恢复完成后先核对 migration version 与旧镜像合同，再同时启动旧后端和 Web；不得把新 schema 与旧镜像混用。

## 禁止

- 禁止直接删除库存、出货、财务事实流水来“回滚”。
- 禁止在没有备份 evidence 时继续 destructive 操作。
- 禁止把真实 dump、真实 `.env` 或未脱敏日志提交到本目录。

## Evidence

回滚 evidence 至少包含：原因、影响范围、决策人角色、使用的镜像 / 备份、执行时间、结果、后续处理和客户通知摘要。
