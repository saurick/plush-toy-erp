# 部署脚本 / Deploy Scripts

本文是 `scripts/deploy/` 的目录入口。部署主路径和目标环境边界仍以 [server/deploy/README.md](../../server/deploy/README.md)、[server/deploy/compose/prod/README.md](../../server/deploy/compose/prod/README.md) 和 [docs/部署约定.md](../../docs/部署约定.md) 为准。

## 目录职责

`scripts/deploy/` 放生产 preflight、release evidence、客户配置发布证据、closeout plan / runner 和部署资料包检查工具。多数脚本默认只读或 report-only；真实执行必须显式确认，并满足对应 evidence、备份、smoke、权限和脱敏前置。

## 常用入口

| 入口 | 用途 | 是否执行目标动作 |
| --- | --- | --- |
| `bash scripts/deploy/production-preflight.sh` | 检查生产运行时 env、Compose、固定镜像 tag、migration 和低配部署边界 | 否，只检查 |
| `node scripts/deploy/release-evidence-status.mjs` | 只读汇总 release evidence 目录状态、缺口和下一步 | 否，只读 |
| `node scripts/deploy/release-evidence-gate.mjs` | 校验 release evidence 是否满足门禁 | 否，只校验证据 |
| `node scripts/deploy/release-evidence-closeout-plan.mjs` | 从 status 生成分组 closeout action 和缺失输入 | 否，只生成计划 |
| `node scripts/deploy/release-evidence-closeout-runner.mjs` | materialize closeout plan；默认 report-only，显式确认后才执行可运行机器步骤 | 默认否，`--execute` 才执行 |
| `node scripts/deploy/customer-config-release-readiness.mjs` | 聚合客户配置 manifest、release evidence、activation gate 和读回证据 | 否，只聚合证据 |
| `node scripts/deploy/customer-config-release-execute.mjs` | 客户配置 validate / publish / activate / rollback 执行器 | 默认否，显式确认后才调用 JSON-RPC |

## 客户配置读回 preflight

`customer-config-release-readiness.mjs --readback-preflight-report <path>` 只读取本地 manifest、执行器报告和目标 smoke 脱敏报告的结构，用于确认 `customer_config.get_effective_session` 读回证据还缺什么；它不调用后端、不读取管理员 token、不写 release evidence、不发布 / 激活 / rollback，也不导入业务数据。报告里的 `targetSmoke.customerConfigEffectiveSession.responseBodyStored` 表示目标 smoke 是否实际保存了响应正文，合规值应为 `false`；`responseBodyNotStored=true` 才表示 `responseBodyStored=false` 的脱敏证据已经存在。

## Release Evidence 主路径

1. 先用 `release-evidence-status.mjs` 看缺口。
2. 用 `release-evidence-closeout-plan.mjs` 判断本机输入是否足够。
3. 只在 action `canRun=true` 且已确认真实输入时，才用 `release-evidence-closeout-runner.mjs --execute`。
4. 每次写入证据后重新跑 status / gate。
5. release gate 通过只说明 evidence 文件满足门禁，不替代真实目标环境执行记录、人工签收或回滚演练。

## 安全边界

- 不在低配目标服务器上构建镜像、前端包或 Go 二进制；目标服务器只负责加载制品、启动服务、执行 migration 和部署后检查。
- `--backend-url`、`--endpoint`、`SMOKE_ENDPOINT`、`SMOKE_BACKEND_URL` 不得包含 URL 账号密码。
- 报告只保存 repo-relative path、alias、hash、env key 名和脱敏摘要，不保存 token、完整 DSN、完整凭据 URL 或本机绝对路径。
- `--execute` 类操作必须有脚本要求的确认环境变量，且不得执行 blocked action 或人工签收步骤。

## 修改后验证

调整 deploy 脚本后，优先运行对应测试文件，例如：

```bash
node --test scripts/deploy/release-evidence-status.test.mjs
node --test scripts/deploy/release-evidence-closeout-plan.test.mjs
node --test scripts/deploy/customer-config-release-readiness.test.mjs
```

涉及发布证据口径时，再补：

```bash
node --test scripts/deploy/release-evidence-gate.test.mjs
git diff --check
```
