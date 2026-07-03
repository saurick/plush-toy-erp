# QA 脚本 / QA Scripts

本文是 `scripts/qa/` 的目录入口。仓库级脚本总览仍在 [scripts/README.md](../README.md)；测试选择和验证层级真源仍在 [docs/product/自动化测试策略.md](../../docs/product/自动化测试策略.md)。

## 目录职责

`scripts/qa/` 只放本地验收、静态守卫、边界扫描和测试编排脚本。它可以读取代码、配置、文档和本地输出，必要时生成 ignored evidence；它不负责生产发布、不直接导入真实客户数据、不替代后端 RBAC / Workflow / Fact usecase。

## 常用入口

| 入口 | 用途 | 建议时机 |
| --- | --- | --- |
| `bash scripts/qa/fast.sh` | 高频快速检查，覆盖文档清单、命名边界、客户配置、菜单和核心脚本守卫 | 日常开发后 |
| `bash scripts/qa/strict.sh` | 严格检查，面向发版前或大范围收口 | 发版前 / 大改后 |
| `bash scripts/qa/full.sh` | 推送前全量检查，包含 fast、前端测试 / 构建和后端测试 / 构建 | 提交推送前 |
| `node scripts/qa/docs-inventory.test.mjs` | 检查当前维护 Markdown 是否登记到 `docs/文档清单.md` | 新增、删除、重命名 README 或长期文档后 |
| `node scripts/qa/phase-label-boundaries.mjs` | 扫描活跃运行时代码、脚本和正式文档入口的历史阶段命名残留 | 改脚本、API、命名或治理文档后 |
| `node scripts/qa/test-data-isolation-boundary.mjs --json` | 只读检查 Product Core demo seed、yoyoosun 模拟数据、真实导入预检和真实导入执行门禁是否隔离 | 改 seed、fixture、模拟数据或导入工具后 |
| `node scripts/qa/customer-config-effective-session-probe.mjs --json` | 无 Authorization 探测本地 `customer_config.get_effective_session`，确认后端可达和 `40302 未登录` 边界 | yoyoosun 静态入口已命中、但还没有真实登录证据时 |
| `node --test scripts/qa/customer-package-preview-boundary.test.mjs` | 锁住客户配置包 businessFlows / stateMachines / processPolicies 仍为 preview-only，不写 Fact、不覆盖 usecase 生命周期 | 调整客户包流程、状态机或策略预览后 |

## 主要脚本分组

| 分组 | 典型脚本 | 边界 |
| --- | --- | --- |
| 编排入口 | `fast.sh`、`strict.sh`、`full.sh` | 只编排本地检查，不代表目标环境 release evidence 已完成 |
| 文档与命名守卫 | `docs-inventory.test.mjs`、`phase-label-boundaries.mjs` | 只证明路径、命名和登记未漂移，不证明文档内容是 runtime truth |
| 客户配置与私有化边界 | `customer-config-boundaries.mjs`、`customer-config-effective-session-probe.mjs`、`customer-package-lint.mjs`、`customer-package-preview-boundary.test.mjs`、`customer-config-runtime-manifest.mjs` | 只做 lint / preview / manifest 编译、无凭据读回探针和边界检查，不写 Fact |
| Workflow / Fact 边界 | `workflow-fact-boundary.test.mjs`、`workflow-ui-action-boundary.test.mjs` | 防止协同任务路径越界写入事实层 |
| 测试数据隔离 | `test-data-isolation-boundary.mjs`、`trial-simulated-data.mjs`、`mobile-workflow-simulated-closure.mjs`、`operational-fact-simulated-closure.mjs` | Product Core demo seed、yoyoosun 模拟数据、真实导入预检和真实执行门禁分桶检查；不连接后端、不写 DB、不执行导入 |
| 代码质量和安全 | `secrets.sh`、`error-codes.sh`、`go-vet.sh`、`govulncheck.sh`、`shellcheck.sh`、`shfmt.sh`、`yamllint.sh` | 按对应语言 / 配置类型补充检查，不替代业务回归 |

## 输出与写入边界

- 脱敏报告和模拟 evidence 默认写到 `output/**` 或调用方显式指定的 ignored 目录。
- 脚本不得把真实密码、token、完整 DSN、URL userinfo、原始客户文件内容或未脱敏输出写入仓库。
- 调整 QA 脚本后，至少运行对应 `node --check` / `node --test`，并按影响面补 `fast.sh`、`strict.sh` 或专题命令。
