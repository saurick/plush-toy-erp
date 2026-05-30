# Test Strategy

## T0 到 T6

| 等级 | 改动类型 | 建议命令 |
| --- | --- | --- |
| T0 | 只改文档 | `git diff --stat`、目标文件列表、关键词边界检查、`cd web && pnpm test` |
| T1 | 改前端配置 / docs / seed | `cd web && pnpm lint && pnpm css && pnpm test`，必要时 docs registry / seed 测试 |
| T2 | 改 UI | T1 + `cd web && pnpm style:l1`，必要时浏览器级回归 |
| T3 | 改后端 biz/data 非 schema | `cd server && go test ./internal/... ./pkg/...`，相关 usecase/repo 专项测试 |
| T4 | 改 Ent schema | `cd server && make print_db_url && make data && make migrate_status`，对应 PG 防呆测试 |
| T5 | 改部署 / 脚本 | shellcheck / shfmt / compose config / deploy README / smoke |
| T6 | 发版前 | `scripts/qa/full.sh` 或 `scripts/qa/strict.sh`，再按发布流程做远端 smoke |

## 本轮 Phase 0 验收

本轮只属于 T0：

```bash
git diff --stat
find docs/product docs/architecture docs/reference docs/customers/current config/industry-templates/plush config/customers/current deployments/current -maxdepth 3 -type f | sort
grep -R "tenant_id" docs/product docs/architecture docs/reference docs/customers config deployments || true
cd web && pnpm test
```

`tenant_id` 搜索允许在 imported notes 或正式文档的禁止说明中出现；不允许出现在 Ent schema、migration 或 runtime 方案中。
