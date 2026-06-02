# 自动化测试策略 / Test Strategy

本文用于把自动化测试和验收命令按改动影响面分层，帮助每个实施任务或日常改动选择合适的验证范围。

## 1. 定位

- 本文是测试选择和验收分层文档，不替代 `docs/current-source-of-truth.md`、代码、Ent schema、Atlas migration、`scripts/README.md` 或本轮具体任务说明。
- 具体任务的允许修改文件、禁止修改文件和验收命令，仍以当前用户要求、正式设计文档或任务说明为准。
- 文档里的“未来 / 后续”测试项只表示后续能力成熟后应补的方向，不代表当前仓库已经有对应 runner、脚本、API 或 E2E 环境。
- 自动化测试通过是必要条件，不等于业务事实、权限边界、部署状态和客户交付已经完成。涉及当前实现状态时，必须回到代码、测试和当前真源文档交叉确认。

## 2. 外部策略吸收结论

`/Users/simon/Desktop/automated-test-strategy.md` 中适合本项目长期保留的内容如下：

| 适合纳入 | 本项目落点 |
| --- | --- |
| 按改动影响面选择测试层级 | 收敛为本文 T0-T8 分层，不机械全跑，也不只跑最低层 |
| Workflow / Fact / Source Document 边界检查 | 进入 T0 / T1 静态边界检查和各业务层测试重点 |
| docs-only 不跑无关代码测试 | 进入 T1；若未改 runtime、前端配置或 docs registry，可只跑文档检查 |
| Ent + Atlas schema / migration 检查 | 进入 T2；改 schema 才运行 `make data` / `make migrate_status` |
| repo / usecase / API / RBAC 分层测试 | 进入 T3 / T4；API 不复制业务规则，权限不只靠前端隐藏 |
| 前端 lint / css / unit / `style:l1` | 进入 T5；样式和页面改动必须做浏览器级回归 |
| yoyoosun import dry-run 和 freeze evidence | 进入 T6；当前只允许 no-write evidence tooling |
| 私有化部署前的备份、迁移、smoke、回滚意识 | 进入 T8；当前仅记录策略，具体脚本以部署文档和现有脚本为准 |

暂不直接落地或必须标为后续的内容：

| 暂不直接落地 | 原因 |
| --- | --- |
| 完整业务 E2E runner | 当前还没有覆盖真实用户全链路的稳定造数和浏览器 E2E 主路径 |
| 真实 import loader 测试 | 当前只有 freeze / dry-run evidence tooling，不做真实导入、不写 DB |
| shipment / finance 完整事实测试 | 相关事实层还未完整落地，不能把未来测试写成当前能力 |
| backup-check / restore-check 脚本 | 仓库当前没有这些脚本，部署前应另行设计，不在本文伪造命令 |
| CI 分层自动化 | 可作为后续建议，当前不代表 CI 已经配置 |

## 3. 测试分层

| 层级 | 改动类型 | 必跑或优先命令 | 说明 |
| --- | --- | --- | --- |
| T0 静态检查 | 所有改动 | `git status --short`；`git diff --stat`；`git diff --check`；`git ls-files --others --exclude-standard` | 用于确认工作区、空白错误、未跟踪文件和并行现场 |
| T1 文档 / 规划 | roadmap、cutline、audit、risk register、客户资料、任务说明 | T0 + 相关边界 grep | 不改 runtime / schema / 前端配置时，一般不跑 Go / pnpm 测试 |
| T2 Schema / Migration | Ent schema、generated code、Atlas migration | `cd server && make print_db_url`；`cd server && make data`；`cd server && make migrate_status`；`cd server && go test ./internal/data/model/schema`；`cd server && go test ./internal/biz ./internal/data` | `migrate_status` pending 不是自动失败，但必须说明目标库是否已 apply |
| T3 Repo / Usecase | `internal/biz`、`internal/data`、状态机、guard、事务、事实层规则 | `cd server && go test ./internal/biz ./internal/data`；必要时加 `-count=1` 和 Phase PG target | 业务规则在 usecase / repo 锁住，API 和 UI 不复制业务规则 |
| T4 API / RBAC | JSON-RPC / HTTP handler、auth、permission code、角色矩阵、错误码 | `cd server && go test ./internal/biz ./internal/data ./internal/service ./internal/server`；改错误码时跑 `scripts/qa/error-code-sync.sh` 和 `scripts/qa/error-codes.sh` | 必须覆盖未登录、disabled admin、无权限、有权限、super admin 和 owner / assignee / status 边界 |
| T5 Frontend UI / 样式 | 页面、路由、API client、菜单、docs registry、seed、表单、样式 | `cd web && pnpm lint`；`cd web && pnpm css`；`cd web && pnpm test`；`cd web && pnpm style:l1` | 触达共享组件、布局、断点或页面状态时，必须做浏览器级默认态、交互态、恢复态和相邻区域回归 |
| T6 Import dry-run / freeze | `scripts/import/**`、yoyoosun source snapshot、dry-run evidence | `node --test scripts/import/customerImportDryRun.test.mjs scripts/import/customerSourceSnapshotFreezeCheck.test.mjs`；必要时运行 dry-run / freeze CLI 生成本地 `output/**` evidence | 当前阶段必须保持 no-write，不连接 DB，不写正式表，不写 `business_records` |
| T7 业务事实 / E2E | 库存、采购、质检、未来出货、财务、生产、委外真实事实 | 当前已有事实层按 T3 + Phase PG target；完整 E2E 后续再设计 | 不存在稳定 runner 时，不得把手工点按或未来命令写成已自动化 |
| T8 部署 / 发布 / 回滚 | Compose、发布脚本、migration apply、私有化交付 | `bash scripts/qa/full.sh` 或 `bash scripts/qa/strict.sh`；按部署文档做 migration、health、smoke、清理 | 低配服务器不做构建；备份 / 恢复 / 回滚脚本若不存在，必须先设计再声称覆盖 |

## 4. 静态边界检查

T0 / T1 至少按本轮影响面选择下列检查，不要无脑扫超大目录后忽略结果。

```bash
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

常用边界 grep：

```bash
grep -R "tenant_id" docs/customers docs/product docs/architecture docs/reference config deployments server web || true
grep -R "shipping_released" docs/customers docs/product docs/architecture docs/reference web server || true
grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" server web docs || true
grep -R "markAsShipped\|shipSalesOrder\|reserveStock\|deductInventory\|generateInvoice\|generateReceivable\|receivePayment" server web docs || true
grep -R "ChangeUsecase\|change_records" server web docs || true
```

这些 grep 不是“出现即失败”。如果命中的是禁止说明、边界说明、未来 deferred 说明或历史 imported note，必须在验收记录里说明命中语义；如果命中 runtime、schema、migration、seedData、API 或用户可见误导文案，应视为风险。

## 5. 按模块测试重点

| 模块 | 当前重点 |
| --- | --- |
| MasterData | customers / suppliers / contacts 的 create、update、get、list、active guard、唯一性和 contacts owner / primary guard |
| Sales Order | 只作为 Source Document / Business Commitment；测试 customer / product / unit active guard、数量金额 guard、生命周期 guard，不写 shipment / inventory / finance |
| Workflow | `done / blocked / rejected`、reason trim、旧原因清理、幂等、settled 终态保护、同名非目标任务不触发、`shipment_release done -> shipping_released` 且不等于 `shipped` |
| Inventory / Purchase / Quality | 事实流水、余额、批次状态、采购入库 / 退货 / 调整、来料质检状态机、REVERSAL、终态保护、防负数和事务失败边界 |
| API / RBAC | 权限码、角色、未登录、disabled admin、无权限、super admin、owner_role_key、assignee_id、task_status_key；前端隐藏菜单不是安全边界 |
| Frontend / Docs registry / Seed | API client contract、默认态、按钮权限、路由可打开、docs registry、seed navigation、普通帮助中心和开发验收入口不混淆 |
| Import dry-run | source parsing、field classification、duplicate / conflict / unresolved、forbidden facts、no-write、人工确认清单、输出 evidence 可审阅 |
| Deployment | 本地或 CI 构建、服务器只 load / restart / migrate / health / smoke；迁移前确认目标库和备份，发布后检查磁盘与旧镜像清理 |

## 6. 现有命令入口

高频本地 QA：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/fast.sh
```

提交 / 推送前全量 QA：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/full.sh
```

发版前严格 QA：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/strict.sh
```

前端页面和样式：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```

后端常用测试：

```bash
cd /Users/simon/projects/plush-toy-erp/server
go test ./internal/biz ./internal/data
go test ./...
make build
```

Ent + Atlas：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make print_db_url
make data
make migrate_status
```

Phase PG 防呆集成测试按对应阶段选择，不要无关全跑：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make phase2a_pg_test
make phase2b_pg_test
make phase2c_pg_test
make phase2d_pg_test
```

yoyoosun import dry-run / freeze 工具测试：

```bash
cd /Users/simon/projects/plush-toy-erp
node --test scripts/import/customerImportDryRun.test.mjs scripts/import/customerSourceSnapshotFreezeCheck.test.mjs
```

字段联动专项：

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/erp-field-linkage.mjs
```

## 7. 任务验收记录 / Task Verification Notes

非平凡任务的最终回复、`progress.md` 或用户明确要求的正式验收文档应包含：

- 本轮选择的测试层级。
- 本轮未选择的测试层级及原因。
- 实际运行命令和结果。
- 失败命令、关键日志和是否与本轮相关。
- 边界 grep 或禁止路径检查结果。
- Git 状态、未跟踪文件和并行现场说明。
- 若跳过 Go / pnpm / browser / migration / E2E，必须写明原因和剩余风险。

普通文档整理不自动生成额外审查报告；如只改正文且未触达 runtime、schema、前端配置或 docs registry，应在最终回复中说明验证范围。

## 8. 后续 CI 分层建议

这些是后续可落地方向，不代表当前 CI 已配置完成。

| 层级 | 建议内容 |
| --- | --- |
| 小任务 / PR | `git diff --check`、相关 package 测试、前端相关测试、边界 grep、任务验收说明检查 |
| 每日 | server 全量 `go test`、web `lint/css/test`、`style:l1`、docs implemented wording grep、migration status 检查 |
| 发版前 | `scripts/qa/strict.sh`、生产镜像本地构建、migration apply 演练、UI / API smoke、备份恢复演练、回滚路径检查 |

CI 落地前仍以本地命令、Git hooks、部署文档和当前任务说明为准。
