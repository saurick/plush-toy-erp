# QA 脚本 / QA Scripts

本文是 `scripts/qa/` 的目录入口。仓库级脚本总览仍在 [scripts/README.md](../README.md)；测试选择和验证层级真源仍在 [docs/product/自动化测试策略.md](../../docs/product/自动化测试策略.md)。

## 目录职责

`scripts/qa/` 只放本地验收、静态守卫、边界扫描和测试编排脚本。它可以读取代码、配置、文档和本地输出，必要时生成 ignored evidence；它不负责生产发布、不直接导入真实客户数据、不替代后端 RBAC / Workflow / Fact usecase。

## 常用入口

| 入口                                                                                                    | 用途                                                                                                                                                   | 建议时机                                        |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `bash scripts/qa/affected.sh --plan`                                                                    | 读取当前工作树、staged、指定 base 或显式文件，按 T0-T8 和受影响领域输出最小必要测试；默认只计划，未知路径保守升级为 `full.sh`                          | 开发过程中、准备验证前                          |
| `bash scripts/qa/affected.sh --run`                                                                     | 执行 affected 选出的安全本地命令并记录逐项耗时；浏览器 L1、`make data` 和目标环境证据仍作为 required follow-up 单列                                    | 完成一个可验证切片后                            |
| `bash scripts/qa/fast.sh`                                                                               | 高频快速检查，覆盖文档清单、命名边界、客户配置、菜单和核心脚本守卫                                                                                     | 日常开发后                                      |
| `bash scripts/qa/strict.sh`                                                                             | 严格检查，包含本地 PostgreSQL 关键事务门禁，面向发版前或大范围收口                                                                                     | 发版前 / 大改后                                 |
| `bash scripts/qa/full.sh`                                                                               | 推送前全量检查，包含 fast、secrets、前端测试 / 构建、本地 PostgreSQL 关键事务测试和后端测试 / 构建；govulncheck 最后运行，避免外部网络扰动本地并发门禁 | 提交推送前                                      |
| `node scripts/qa/docs-inventory.test.mjs`                                                               | 检查当前维护 Markdown 是否登记到 `docs/文档清单.md`                                                                                                    | 新增、删除、重命名 README 或长期文档后          |
| `node scripts/qa/phase-label-boundaries.mjs` + `node --test scripts/qa/phase-label-boundaries.test.mjs`  | 全仓扫描活跃代码、脚本和正式文档中的编号阶段命名，并验证完整 Phase 编号、P 子阶段编号和 P 编号发布目标会被拒绝；P0/P1 风险等级、p95 百分位和产品编码不受影响 | 改脚本、API、命名或治理文档后                   |
| `node scripts/qa/test-data-isolation-boundary.mjs --json`                                               | 只读检查 Product Core demo seed、yoyoosun 模拟数据和真实导入准备边界，并锁住 dry-run 不具备执行能力                                                    | 改 seed、fixture、模拟数据或导入准备工具后      |
| `node scripts/qa/manual-acceptance-catalog.mjs`                                                         | 从当前客户菜单、岗位矩阵和打印模板生成 47 项全页面手工验收目录；默认只输出，不连接后端                                                                 | 准备全页面试用验收范围时                        |
| `node scripts/qa/manual-acceptance-source-data.mjs --run-id LOCAL-UAT --json`                           | 生成带稳定批次前缀的客户、供应商、产品规格、材料、加工环节及销售 / 采购 / 委外 / BOM 源数据计划；默认只读                                              | 写入模拟源数据前确认数量、状态和边界时          |
| `node scripts/qa/manual-acceptance-account-scenarios.mjs --json`                                        | 生成停用、多岗位和无业务入口三种补充账号计划；不修改十个正式岗位账号                                                                                   | 核对登录与入口异常场景前                        |
| `node scripts/qa/manual-acceptance-task-data.mjs --run-id LOCAL-UAT`                                    | 生成九个岗位各 20 条、共 180 条任务的可重复计划；默认只输出，不连接后端                                                                                | 准备岗位任务端数据前                            |
| `node scripts/qa/manual-acceptance-fact-data.mjs --source-report <report> --run-id LOCAL-UAT-F1 --json` | 复用已核验源数据生成采购、质检、库存、生产、出货和财务事实计划；默认只读                                                                               | 写入模拟业务事实前                              |
| `node scripts/qa/manual-acceptance-readiness.mjs`                                                       | 生成 47 项只读就绪核验计划；只有显式 `--verify --backend-url` 才登录试用账号并查询数量和状态分布                                                       | 写入后核对页面数据是否达到手工验收门槛时        |
| `node scripts/qa/manual-acceptance-browser.mjs --plan --base-url <local-url> --backend-url <local-url>` | 生成 47 项本机浏览器验收计划；真实模式只登录、逐页读取和切换只读任务页签，不点击业务写动作                                                             | 核对真实账号、页面、岗位端和打印入口时          |
| `node scripts/qa/manual-acceptance-source-retire.mjs --run-id LOCAL-UAT`                                | 默认 dry-run，预览按批次取消 / 归档源单并停用主数据的退出动作；不物理删除历史记录                                                                      | 试用批次退出前                                  |
| `node scripts/qa/customer-config-effective-session-probe.mjs --json`                                    | 无 Authorization 探测本地 `customer_config.get_effective_session`，确认后端可达和 `40302 未登录` 边界                                                  | yoyoosun 静态入口已命中、但还没有真实登录证据时 |
| `node --test scripts/qa/customer-package-preview-boundary.test.mjs`                                     | 锁住客户配置包 businessFlows / stateMachines / processPolicies 仍为 preview-only，不写 Fact、不覆盖 usecase 生命周期                                   | 调整客户包流程、状态机或策略预览后              |

## 主要脚本分组

| 分组                 | 典型脚本                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 边界                                                                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 编排入口             | `fast.sh`、`strict.sh`、`full.sh`                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 只编排本地检查，不代表目标环境 release evidence 已完成                                                                                                                                                                         |
| 文档与命名守卫       | `docs-inventory.test.mjs`、`phase-label-boundaries.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                      | 只证明路径、命名和登记未漂移，不证明文档内容是 runtime truth                                                                                                                                                                   |
| 客户配置与私有化边界 | `customer-config-boundaries.mjs`、`customer-config-effective-session-probe.mjs`、`customer-package-lint.mjs`、`customer-package-preview-boundary.test.mjs`、`customer-config-runtime-manifest.mjs`                                                                                                                                                                                                                                                                                           | 只做 lint / preview / manifest 编译、无凭据读回探针和边界检查，不写 Fact                                                                                                                                                       |
| Workflow / Fact 边界 | `workflow-fact-boundary.test.mjs`、`workflow-ui-action-boundary.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                    | 防止协同任务路径越界写入事实层                                                                                                                                                                                                 |
| 测试数据隔离         | `test-data-isolation-boundary.mjs`、`manual-acceptance-catalog.mjs`、`manual-acceptance-source-data.mjs`、`manual-acceptance-data-depth.mjs`、`manual-acceptance-account-scenarios.mjs`、`manual-acceptance-task-data.mjs`、`manual-acceptance-fact-data.mjs`、`manual-acceptance-readiness.mjs`、`manual-acceptance-browser.mjs`、`manual-acceptance-source-retire.mjs`、`trial-simulated-data.mjs`、`purchase-quality-simulated-matrix.mjs`、`mobile-workflow-simulated-closure.mjs`、`operational-fact-simulated-closure.mjs` | Product Core demo seed、yoyoosun 中文试用矩阵、真实导入预检和真实执行门禁分桶检查；计划与静态守卫不连接后端、不写 DB、不执行导入，带显式确认的模拟脚本才会经正式业务入口写本机 local / dev；浏览器入口只执行登录和只读页面查询 |
| 代码质量和安全       | `secrets.sh`、`error-codes.sh`、`go-vet.sh`、`govulncheck.sh`、`shellcheck.sh`、`shfmt.sh`、`yamllint.sh`                                                                                                                                                                                                                                                                                                                                                                                    | 按对应语言 / 配置类型补充检查，不替代业务回归                                                                                                                                                                                  |

## 输出与写入边界

- 脱敏报告和模拟 evidence 默认写到 `output/**` 或调用方显式指定的 ignored 目录。
- 脚本不得把真实密码、token、完整 DSN、URL userinfo、原始客户文件内容或未脱敏输出写入仓库。
- 调整 QA 脚本后，至少运行对应 `node --check` / `node --test`，并按影响面补 `fast.sh`、`strict.sh` 或专题命令。

## 全页面试用验收数据

全页面试用数据按用途使用独立稳定批次：源数据使用 `SIM-YOYOOSUN-UAT-<runId>`，岗位任务使用 `SIM-YOYOOSUN-UAT-TASK-<runId>`，生产 / 库存 / 出货 / 财务事实使用 `SIM-YOYOOSUN-OPFACT-<runId>`，采购 / 质检事实使用 `SIM-YOYOOSUN-PQ-<runId>`。页面可见名称统一带 `【试用】`，不读取或导入真实客户资料。账号场景、源数据、岗位任务、业务事实、只读核验和退出各自使用独立入口。

事实数据入口组合调用的 `operational-fact-simulated-closure.mjs` 与 `purchase-quality-simulated-matrix.mjs` 自身也保持写入防线：无论从命令行还是导出的 `applyPlan` 调用，都只接受 loopback 地址，并在首条业务写入前确认运行环境为 `local / dev`、当前配置来自非空的 yoyoosun active revision。独立命令行分别要求 `OPERATIONAL_FACT_SIM_ADMIN_PASSWORD` 和 `PURCHASE_QUALITY_SIM_ADMIN_PASSWORD`；上层事实入口把 `MANUAL_ACCEPTANCE_ADMIN_PASSWORD` 显式传入导出执行函数。确认词或普通岗位账号密码都不能替代独立管理员守卫。

先生成验收目录和源数据计划，两条命令都不连接后端：

```bash
node scripts/qa/manual-acceptance-catalog.mjs \
  --out output/qa/manual-acceptance/catalog

node scripts/qa/manual-acceptance-source-data.mjs \
  --run-id LOCAL-UAT \
  --json

node scripts/qa/manual-acceptance-data-depth.mjs
```

数据厚度报告会锁定 1、8、25 条明细，0、1、2 个联系人，生产排程与生产异常各 20 条任务，以及 7 类业务对象的 3 至 5 份附件计划。附件矩阵目前是验收合同，不等于附件已经上传；真实附件写入必须继续经过 loopback、local / dev、active yoyoosun revision、正式权限与 Workflow `expected_version` 守卫。

真实上传 7 类对象的 27 份模拟附件时，`admin` 只做环境和 active revision 守卫，销售、采购、生产、工程、财务和 PMC 正式试用账号分别执行自己有权处理的附件写入。命令会按文件名复用已有附件，并在上传后执行列表与下载内容读回：

```bash
MANUAL_ACCEPTANCE_ATTACHMENT_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_ATTACHMENTS \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-password>' \
  node scripts/qa/manual-acceptance-attachment-data.mjs \
    --backend-url http://127.0.0.1:8300
```

手工验收档位不称为压测。容量回归和压力测试使用报告中的独立档位，并且只能写一次性隔离数据库；结果至少记录吞吐、成功率、p50 / p95 / p99、超时和错误分布、连接池与锁等待、幂等重试重复事实检查，以及压测前后数量和金额一致性。共享试用库只使用手工验收档位。

隔离容量库必须由执行者显式创建、迁移并准备至少 5,000 条 Workflow、2,000 条生产事实、2,000 条财务事实和 1,000 份附件；不能把共享开发库传给压力入口。压力入口会同时核对 URL 中的数据库名、数据库真实数量、active yoyoosun revision，并采样数据库连接、活跃查询、锁等待、冲突和死锁：

```bash
MANUAL_ACCEPTANCE_PRESSURE_CONFIRM=RUN_ISOLATED_MANUAL_ACCEPTANCE_PRESSURE \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-password>' \
MANUAL_ACCEPTANCE_PRESSURE_DATABASE_URL='<disposable-plush_erp_capacity-url>' \
  node scripts/qa/manual-acceptance-capacity-pressure.mjs \
    --base-url http://127.0.0.1:8300 \
    --database-name plush_erp_capacity_<run-id>
```

执行完成后必须先恢复共享开发服务，再销毁一次性容量库。压测报告保留在 `output/qa/manual-acceptance/capacity-pressure/report.json`，但 ignored 本地报告不等于目标服务器发布证据。

只在已确认的本地开发环境写入源数据：

```bash
MANUAL_ACCEPTANCE_SIM_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-source-data.mjs \
    --apply \
    --run-id LOCAL-UAT
```

写入后先用同一批次做只读核验，再准备补充账号和九岗位任务。三个计划命令均不写数据；只有带精确确认词的 `--apply` 才执行：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-source-data.mjs \
    --verify \
    --run-id LOCAL-UAT

node scripts/qa/manual-acceptance-account-scenarios.mjs --json
node scripts/qa/manual-acceptance-task-data.mjs --run-id LOCAL-UAT

MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM=APPLY_SIMULATED_ACCOUNT_SCENARIOS \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-account-scenarios.mjs --apply --json

MANUAL_ACCEPTANCE_TASK_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_TASKS \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-task-data.mjs \
    --apply \
    --run-id LOCAL-UAT \
    --out output/qa/manual-acceptance/task-data
```

源数据写入报告生成后，再独立生成并写入采购、质检、库存、生产、预留、出货和四类财务状态矩阵：

```bash
node scripts/qa/manual-acceptance-fact-data.mjs \
  --source-report output/qa/manual-acceptance/source-data/apply-report.json \
  --run-id LOCAL-UAT-FACTS \
  --json

MANUAL_ACCEPTANCE_FACT_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_FACTS \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-fact-data.mjs \
    --apply \
    --source-report output/qa/manual-acceptance/source-data/apply-report.json \
    --run-id LOCAL-UAT-FACTS
```

写入后只读核对 47 项验收目标。该入口只证明数量和状态分布，打印分页、筛选恢复、错误提示和人工结果仍按客户清单逐项确认：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-readiness.mjs \
    --verify \
    --backend-url http://127.0.0.1:8300 \
    --source-report output/qa/manual-acceptance/source-data/apply-report.json \
    --fact-report output/qa/manual-acceptance/fact-data/apply-report.json \
    --task-report output/qa/manual-acceptance/task-data/apply-report.json \
    --out output/qa/manual-acceptance/readiness
```

再执行本机真实浏览器只读核对。该入口覆盖 10 个正式桌面账号、9 个岗位任务端、3 个补充账号场景和全部 47 个正式目标；会产生登录 / 审计痕迹和 ignored 本地报告，但不点击新增、编辑、提交、完成、取消或过账动作。页面能打开、页面有数据和页面已达到目录最低数量会分开记录：

```bash
node scripts/qa/manual-acceptance-browser.mjs --plan \
  --base-url http://127.0.0.1:5177 \
  --backend-url http://127.0.0.1:8300

MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
  node scripts/qa/manual-acceptance-browser.mjs \
    --base-url http://127.0.0.1:5177 \
    --backend-url http://127.0.0.1:8300 \
    --report output/qa/manual-acceptance/browser/report.json
```

浏览器脚本会按人工查看节奏在登录和页面之间留出间隔，避免自动化本身触发本机限流。打印工作台的 PDF 请求只要出现 HTTP 4xx / 5xx 就会阻断验收，不按 `draft=fresh` 或状态码放宽。最终报告会绑定同一批本机模拟源单与事实报告，从采购订单、委外订单和 BOM 页面选择真实模拟业务记录，逐一验证采购合同、加工合同、物料明细、色卡和作业指导书：工作台必须显示“业务记录带值”，PDF 必须返回 2xx、`application/pdf`、非空 `%PDF` 文件头和 `request_id`，否则整体验收不通过。

退出源数据前必须先 dry-run。执行后源单进入取消 / 归档状态，主数据转为停用；已过账的库存、出货和财务历史继续保留，不做物理删除：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
  node scripts/qa/manual-acceptance-source-retire.mjs \
    --run-id LOCAL-UAT

MANUAL_ACCEPTANCE_RETIRE_CONFIRM=RETIRE_SIMULATED_MANUAL_ACCEPTANCE_SOURCE_DATA \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-source-retire.mjs \
    --apply \
    --run-id LOCAL-UAT
```

## 按影响面选择 / Affected Tests

`affected.sh` 默认收集 unstaged、staged 和未跟踪文件，也支持只看 staged、指定 Git base 或显式文件：

```bash
bash scripts/qa/affected.sh --plan
bash scripts/qa/affected.sh --staged --plan
bash scripts/qa/affected.sh --base origin/main --plan
bash scripts/qa/affected.sh --file web/src/erp/utils/dateRange.mjs --run
```

选择器优先复用同名 `*.test.mjs`；页面、共享布局和样式会提示补定向 `STYLE_L1_SCENARIOS`；业务事实 repo/usecase 会升级到本地隔离 PostgreSQL 关键事务门禁；schema/migration 会运行只读守卫和数据层测试，但不会自动执行可能改写生成文件的 `make data`；部署、全局入口、无独立测试的 QA 脚本和未知路径会保守升级到 `full.sh`。

`affected` 是开发期快速反馈入口，不修改 Git hooks。`pre-push` 仍固定运行 `full.sh`，发版前仍需 `strict.sh` 和目标环境 migration、health/smoke、备份恢复及回滚 evidence。
