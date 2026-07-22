# QA 脚本 / QA Scripts

本文是 `scripts/qa/` 的目录入口。仓库级脚本总览仍在 [scripts/README.md](../README.md)；测试选择和验证层级真源仍在 [docs/product/自动化测试策略.md](../../docs/product/自动化测试策略.md)。

## 目录职责

`scripts/qa/` 只放本地验收、静态守卫、边界扫描和测试编排脚本。它可以读取代码、配置、文档和本地输出，必要时生成 ignored evidence；它不负责生产发布、不直接导入真实客户数据、不替代后端 RBAC / Workflow / Fact usecase。

## 常用入口

| 入口                                                                                                                                | 用途                                                                                                                                                                                    | 建议时机                                        |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `bash scripts/qa/affected.sh --plan`                                                                                                | 读取当前工作树、staged、指定 base 或显式文件，按 T0-T8 和受影响领域输出最小必要测试；默认只计划，未知路径保守升级为 `full.sh`                                                           | 开发过程中、准备验证前                          |
| `bash scripts/qa/affected.sh --run`                                                                                                 | 执行 affected 选出的安全本地命令并记录逐项耗时；浏览器 L1、`make data` 和目标环境证据仍作为 required follow-up 单列                                                                     | 完成一个可验证切片后                            |
| `bash scripts/qa/fast.sh`                                                                                                           | 高频快速检查，覆盖文档清单、命名边界、客户配置、菜单和核心脚本守卫                                                                                                                      | 日常开发后                                      |
| `node scripts/qa/skill-health.mjs`                                                                                                  | 检查项目 Skill frontmatter、目录名、metadata、README 索引和相对引用；`affected` 对 Skill 变更会直接执行，不再只提示 follow-up                                                           | 修改 `.agents/skills/**` 后                     |
| `node scripts/qa/erp-field-linkage.mjs`                                                                                            | 运行字段联动专项，前后绑定同一仓库指纹，并把脱敏结构化证据写入 `output/qa/coverage/field-linkage.latest.json`；只证明该专项，不代表整仓覆盖                                      | 修改字段来源、映射、回显或打印链路后            |
| `node scripts/qa/test-coverage-report.mjs --write`                                                                                 | 聚合当前 commit / worktree 指纹、真实代码覆盖制品、业务场景、T0-T8 与验收状态到 `output/qa/coverage/latest.json`；缺制品写 `missing`，不自动运行全量测试                              | 刷新开发工作台覆盖状态前                        |
| `bash scripts/qa/strict.sh`                                                                                                         | full 的真实超集：复用全部 full 门禁及真实 browser-smoke，再追加扩展视口、零 warning、shell / YAML 格式和严格 govulncheck                                                                | 发版前 / 大改后                                 |
| `bash scripts/qa/full.sh`                                                                                                           | 推送前全量检查；在本项目 AUX 段选择空闲端口、串行自启当前 worktree Vite 并运行 Chromium，另含 fast、secrets、历史存量升级与当前 schema PostgreSQL、前后端测试 / 构建和 govulncheck      | 提交推送前                                      |
| `sh scripts/qa/populated-upgrade-preflight.sh --audit <populated-upgrade\|customer-config-cutover> ...`                             | 对指定数据库运行固定 allowlist 的 migration 只读审计；不执行 migration 或自动数据治理                                                                                                   | 跨越 20260714055504 / 20260714055825 前         |
| `.github/workflows/ci.yml`                                                                                                          | 单一 job 复用 `strict.sh` 的完整本地门禁，另在前后补 Ent / Atlas 零漂移与 committed source archive；不复制第二套业务规则                                                                | pull request、main push、手工触发               |
| `node scripts/qa/docs-inventory.test.mjs`                                                                                           | 检查当前维护 Markdown 是否登记到 `docs/文档清单.md`                                                                                                                                     | 新增、删除、重命名 README 或长期文档后          |
| `node --test scripts/qa/dev-entry-boundary.test.mjs`                                                                                | 锁住 `make dev_restart`先预检再停服、启动预检只读，以及 Product Core / 客户开发入口共用同一 web preflight                                                                               | 调整本地启动命令、Vite 代理或 migration 预检后  |
| `node scripts/qa/customer-package-lint.mjs --all`                                                                                   | 从构建期客户索引校验 demo、reference-customer 和 yoyoosun raw package；不 publish/activate                                                                                              | 调整客户包、catalog 或 schema 后                |
| `node scripts/qa/customer-config-runtime-manifest.mjs --all --mode preview`                                                         | 以 preview 模式编译并验证全部登记 draft 客户包的不可发布 manifest；不调用后端或写事实                                                                                                   | 调整 manifest compiler/effective-session 输入后 |
| `node scripts/qa/private-deployment-boundaries.mjs`                                                                                 | 检查三份客户文档、三份配置和最小部署参数边界，并禁止 reference 部署目录                                                                                                                 | 调整私有化模板或 reference 文档后               |
| `node scripts/qa/phase-label-boundaries.mjs` + `node --test scripts/qa/phase-label-boundaries.test.mjs`                             | 全仓扫描活跃代码、脚本和正式文档中的编号阶段命名，并验证完整 Phase 编号、P 子阶段编号和 P 编号发布目标会被拒绝；P0/P1 风险等级、p95 百分位和产品编码不受影响                            | 改脚本、API、命名或治理文档后                   |
| `node scripts/qa/experimental/canonical-runtime-audit.mjs`                                                                          | 非阻断实验审计；宽泛 keyword 命中只作只读复核线索，不进入 fast / affected，不代表产品缺陷或发布证据；恢复阻断前必须改成逐域 status key / API field / function / runtime branch 精确合同 | 需要人工盘点历史词命中时                        |
| `node scripts/qa/test-data-isolation-boundary.mjs --json`                                                                           | 只读检查 Product Core demo seed、yoyoosun 模拟数据和真实导入准备边界，并锁住 dry-run 不具备执行能力                                                                                     | 改 seed、fixture、模拟数据或导入准备工具后      |
| `node scripts/qa/manual-acceptance-catalog.mjs`                                                                                     | 从当前正式路由、客户菜单、岗位矩阵和打印模板生成 50 项全页面手工验收目录；当前 yoyoosun 正式页面全部进入目录，默认只输出、不连接后端                                                    | 准备全页面试用验收范围时                        |
| `node scripts/qa/manual-acceptance-dataset.mjs`                                                                                     | 默认生成 local 与 133 同语义计划；显式 `--apply --target` 后由唯一串行 runner 调用同一组正式 API 入口并校验严格阶段回执                                                                 | 准备或重放双环境全页面模拟数据时                |
| `node scripts/qa/manual-acceptance-source-data.mjs --target local-dev --data-version 2026.07.16-v5 --run-id 20260716-V5 --json`     | 生成带稳定批次前缀的客户、供应商、产品规格、材料、加工环节及销售 / 采购 / 委外 / BOM 源数据计划；默认只读                                                                               | 写入模拟源数据前确认数量、状态和边界时          |
| `node scripts/qa/manual-acceptance-account-scenarios.mjs --json`                                                                    | 生成停用、多岗位和无业务入口三种补充账号计划；在已完成首个管理员 bootstrap 的 fresh 本地 / 133 验收库中，创建或精确核对十个正式岗位账号，再调和三类场景账号                             | 核对登录与入口异常场景前                        |
| `node scripts/qa/manual-acceptance-task-data.mjs --data-version 2026.07.16-v5 --run-id 20260716-V5`                                 | 生成九个岗位各 20 条、共 180 条任务的可重复计划；仓库任务按回货、入库、备料、出货和异常分别归类，其中 4 条真实进入出货放行；默认只输出、不连接后端                                      | 准备岗位任务端数据前                            |
| `node scripts/qa/manual-acceptance-fact-data.mjs --source-report <report> --data-version 2026.07.16-v5 --run-id 20260716-V5 --json` | 复用已核验源数据，按正式来源驱动 API 统一准备采购、质检、库存、生产、出货和财务事实；默认只读                                                                                           | 写入模拟业务事实前                              |
| `node scripts/qa/manual-acceptance-readiness.mjs`                                                                                   | 生成 50 项只读就绪核验计划，并校验每页只引用共享 role / source / task / facts / catalog 阶段；显式 `--verify --backend-url` 才查询运行数据                                              | 写入后核对页面数据是否达到手工验收门槛时        |
| `node scripts/qa/manual-acceptance-browser.mjs --plan --base-url <local-url> --backend-url <local-url>`                             | 生成 50 项本机浏览器验收计划；真实模式只登录、逐页读取和切换只读任务页签，列表及两个数据看板都必须取得当前页面数据证据，不点击业务写动作                                                | 核对真实账号、页面、岗位端和打印入口时          |
| `node scripts/qa/manual-acceptance-source-retire.mjs --data-version 2026.07.16-v5 --run-id 20260716-V5`                             | 默认 dry-run，预览按批次取消 / 归档源单并停用主数据的退出动作；local 与已登记 133 均受精确 target policy 保护，不物理删除历史记录                                                       | 试用批次退出前                                  |
| `node scripts/qa/customer-config-effective-session-probe.mjs --json`                                                                | 无 Authorization 探测本地 `customer_config.get_effective_session`，确认后端可达和 `40302 未登录` 边界                                                                                   | yoyoosun 静态入口已命中、但还没有真实登录证据时 |
| `node --test scripts/qa/customer-package-preview-boundary.test.mjs`                                                                 | 锁住客户配置包 businessFlows / stateMachines / processPolicies 仍为 preview-only，不写 Fact、不覆盖 usecase 生命周期                                                                    | 调整客户包流程、状态机或策略预览后              |

## 主要脚本分组

| 分组                 | 典型脚本                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 边界                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 编排入口             | `fast.sh`、`strict.sh`、`full.sh`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 只编排本地检查，不代表目标环境 release evidence 已完成                                                                                                                  |
| 文档、命名与真源守卫 | `docs-inventory.test.mjs`、`yoyoosun-role-flow-handbook.test.mjs`、`phase-label-boundaries.mjs`、`experimental/canonical-runtime-audit.mjs`                                                                                                                                                                                                                                                                                                                                                                                                         | 前三者阻断路径、永绅角色 / 权限 / 流程手册和命名漂移；canonical broad scan 仅为显式非阻断实验审计，不进入 fast / affected，不能替代逐域合同、migration 或 runtime 验证 |
| 覆盖证据             | `erp-field-linkage.mjs`、`test-coverage-report.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 只聚合真实、脱敏、ignored 制品；未采集、过期、跳过、阻塞和零执行必须单列，不把文件数或历史绿色换算成覆盖率，也不执行 full / 数据库 / 浏览器写入                         |
| 客户配置与私有化边界 | `config/customers/index.test.mjs`、`scripts/build/apply-customer-web-config.test.mjs`、`customer-config-boundaries.mjs`、`customer-config-effective-session-probe.mjs`、`customer-package-lint.mjs`、`customer-package-preview-boundary.test.mjs`、`customer-config-runtime-manifest.mjs`、`private-deployment-boundaries.mjs`、`private-deployment-package-closure.test.mjs`                                                                                                                                                                   | 只做构建期索引、overlay、lint / preview / manifest 编译、无凭据读回探针和模板边界检查；`boundariesSatisfied` 不等于交付、evidence 或签收完成，不写 Fact                 |
| Workflow / Fact 边界 | `workflow-fact-boundary.test.mjs`、`workflow-ui-action-boundary.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 防止协同任务路径越界写入事实层                                                                                                                                          |
| 测试数据隔离         | `test-data-isolation-boundary.mjs`、`manual-acceptance-dataset.mjs`、`manual-acceptance-dataset-runner.mjs`、`manual-acceptance-page-data-contract.mjs`、`manual-acceptance-catalog.mjs`、`manual-acceptance-account-scenarios.mjs`、`manual-acceptance-source-data.mjs`、`manual-acceptance-task-data.mjs`、`manual-acceptance-fact-data.mjs`、`manual-acceptance-source-driven-facts.mjs`、`manual-acceptance-attachment-data.mjs`、`manual-acceptance-readiness.mjs`、`manual-acceptance-browser.mjs`、`manual-acceptance-source-retire.mjs` | Product Core、本地 / 133 同版模拟数据、页面归属、真实导入准备和执行门禁分桶检查；当前事实只走正式来源驱动 API，旧通用写入器不得回流，浏览器入口只执行登录和只读页面查询 |
| 代码质量和安全       | `secrets.sh`、`error-codes.sh`、`go-vet.sh`、`govulncheck.sh`、`shellcheck.sh`、`shfmt.sh`、`yamllint.sh`                                                                                                                                                                                                                                                                                                                                                                                                                                       | 按对应语言 / 配置类型补充检查，不替代业务回归                                                                                                                           |

## 门禁完整性与 CI 边界

`full.sh` 默认拒绝继承的 `STYLE_L1_BASE_URL`，仅在本项目 `15200-15299` AUX 段为本轮选择空闲端口，并只清理自身启动的 Vite 进程。同一 worktree 的浏览器证据使用原子 PID 锁串行运行；活动锁直接阻断，stale lock 也保守失败且保留现场，只能在确认 owner 已不存在且没有门禁运行后手工清理。外部 base URL 只能用于显式单项 browser smoke，不能替代 full 的当前 worktree 证据。server 全量测试先在唯一临时数据库中从历史 checkpoint 装载合成存量行，验证 055504 / 055825 两项只读 blocker、克重 kg→g 非空/NULL 存量转换和 latest pending=0；随后再为本批 current-schema 关键事务矩阵创建另一座唯一临时库，同批完成 migration、测试和 fail-closed 清理，不复用固定开发测试库。它还启用真实 Chromium PDF 安全集成，本机自动发现 Chrome/Chromium，CI 则传入本轮 Playwright 下载的精确可执行路径。安全集成未执行会以 Go skip 阻断 full。`strict.sh` 直接复用 full，保持 strict 是 full 的真实超集。fast / full 的固定 Node 与 Go 测试除子进程退出码外，还要求可解析结果、实际执行数大于 0、失败数与跳过数均为 0；缺 summary、零执行或 skip 一律阻断。

`populated-upgrade-preflight.sh` 只接受 `populated-upgrade` 和 `customer-config-cutover` 两个 audit key，并把 DSN 仅从调用方指定的环境变量传给 `psql`。前者检查 20260714055504 的状态、生命周期、取消审计束、流程锚点、版本和待删除时间字段，同时检查 WIP `20260717035245 -> 20260717043625` 委外关联切换：旧列仍有链接时阻断删除，切换后活动外发批次缺少 durable allocation 时也阻断；后者检查 20260714055825 前必须显式治理的流程运行态与任务配置锚点。两者都使用 read-only 事务，不能修复或清理生产数据；出现 blocker 后必须停止 apply，由单独评审的治理动作处理，完成后重跑审计。

直接运行 full / strict 时，任何 `SKIP_*`、`STRICT_SKIP_*` 或调用者提供的旧 coverage 变量都会得到 `incomplete` 并失败；full 始终真实执行 secrets 与 govulncheck，不接受普通调用者自签 JSON 作为前序成功证明。pre-push 先按每个真实 push ref 执行完整历史 secrets，成功后再以聚合范围调用普通 full；新 remote ref 的聚合范围固定为 `empty-tree..HEAD`，确保普通文件、schema 与 repo 变更实际进入 diff / DB guard。任一步失败，外层都不能输出完整结果。

CI action 固定到审核过的 commit，工具链读取 `.n-node-version`、`web/package.json#packageManager` 和 `server/go.mod`。单一 strict job 先执行 `make data` 并要求仓库零漂移，再由 `strict.sh` 完整复用本地 full / browser / fresh PostgreSQL 门禁，最后检查 committed source archive；`db-guard` 只是提前阻断的静态启发式，不能替代 Ent / Atlas 零漂移、冻结树 fresh / upgrade 验证或目标环境 evidence。

仓库内 workflow 只能证明 CI 定义存在。本地 hook 可被 `--no-verify` 绕过；GitHub branch protection / required check 是否启用必须另取远端设置证据，不能用本地 full / strict 或 workflow 文件存在来替代。

## 输出与写入边界

- 脱敏报告和模拟 evidence 默认写到 `output/**` 或调用方显式指定的 ignored 目录。
- 覆盖报告固定留在 `output/qa/coverage/**`，不得放入 `web/public/**`、生产构建或长期 Markdown；开发接口只读返固定 latest 文件，不接受调用方路径。
- 字段联动报告只能由顶层 `erp-field-linkage.mjs` runner 生成，底层 builder 要求 runner 传入完整 repository identity，不是手工入口。裸 `--go-coverprofile` / `--web-coverage` 参数没有 repository identity，聚合器只能将其作为 `stale` 诊断；要记为当前代码证据，必须提供携带当前仓库指纹的 `--artifact` JSON。
- 脚本不得把真实密码、token、完整 DSN、URL userinfo、原始客户文件内容或未脱敏输出写入仓库。
- 调整 QA 脚本后，至少运行对应 `node --check` / `node --test`，并按影响面补 `fast.sh`、`strict.sh` 或专题命令。

## 全页面试用验收数据

当前唯一整批合同是 `2026.07.16-v5 / 20260716-V5`。本地开发库和 133 试用库使用同一套业务含义、数量与状态矩阵，但数据库 ID 各自独立，不能复制表行或用“编号相同”代替读回证明。正式部署默认不执行这套数据。

133 的 V5 使用独立 Compose project `plush-toy-erp-v5`：命令必须显式带 `-p plush-toy-erp-v5`，并同时带 `compose.yml` 与只声明 project name 的 `compose.customer-trial-133.yml`。PostgreSQL 为 `127.0.0.1:55435`、后端 HTTP / gRPC 为 `8315 / 9315`、前端为 `5185`；Jaeger 端口组为 `45775 / 46831 / 46832 / 45778 / 46687 / 54268 / 54250 / 49411 / 44317 / 44318`。PostgreSQL 只能挂载 `/home/simon/plush-toy-erp-v5/data/postgres`，migration 锁只能使用 `/home/simon/plush-toy-erp-v5/run/atlas-migrate.lock`；旧 `plush-toy-erp-prod` 栈及其 `5435` 端口保留作回滚。任何直连数据库的辅助工具也必须命中 `55435 / plush_erp_uat_20260716_v5`，不能误连旧栈；正常整批造数仍只走后端 API。

133 造数前必须先在固定 release 上按 `status -> dry-run -> stop V5 app-server -> apply -> status` 完成 migration，不停旧栈也不停 V5 PostgreSQL。精确命令以 [Compose 迁移脚本](../../server/deploy/compose/prod/README.md#迁移脚本) 为唯一运维入口。运行 env 必须由当前用户持有、精确 `0600` 且无符号链接父路径；preflight 只使用其私有快照并在结束时复核原文件。启动后必须传 `production-preflight.sh --runtime --expected-release <40sha>`，同时证明四服务 image ref / content ID 和 app / web `GIT_SHA` 都绑定同一 release，才能进入配置激活与整批造数。

50 个正式验收目标统一登记在 `manual-acceptance-page-data-contract.mjs`。每页只能引用共享的 `role / source / task / facts / catalog` 阶段，不允许页面自带 builder、脚本或另一套 fixture；业务看板可以同时消费多个共享阶段，但不能另造页面数据。`manual-acceptance-dataset-runner.mjs` 直接消费相同的阶段入口。新增页面、probe 或入口发生漏登、重复或分叉时，readiness 合同测试会 fail closed。

模拟数据沿用永绅原文件的简短习惯，例如款号与品名分开、规格写成“米白·小号”、材料写成“米白短毛绒”、环节写成“裁片 / 车缝 / 电绣”，备注用“分两批交货”“颜色按样板”这类日常说法。用户可见来源编号使用 `YS5-*`，岗位任务使用 `YS-V5-*`；模拟身份还由 `datasetKey / dataVersion / runId` 和报告统一证明。原文件只用于理解字段和用词，不直接导入真实行。

| 阶段                                                     | 本地                                                                                                    | 133 试用库                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| fresh 前置与基础资料                                     | 全新专用库 migration 后显式应用 local-test 配置并只创建 1 个单位、4 个仓库；runner 先做空业务库基线门禁 | 全新独立库先 bootstrap 管理员、应用 customer-trial 配置，再运行镜像内受控 core bootstrap；禁止通用远程 seed |
| 岗位账号                                                 | runner 在空库基线通过后创建或精确核对十个岗位账号，并调和三类场景账号                                   | 同一入口、同一规则；不得复用本地账号行或数据库 ID                                                           |
| 客户、供应商、产品、材料、工序、销售 / 采购 / 委外 / BOM | 按稳定编号写入并读回                                                                                    | 通过已登记目标、精确确认和带外证明写入并读回                                                                |
| 采购收货、质检、库存、生产、预留、出货、财务             | 统一由 `manual-acceptance-fact-data.mjs` 调用正式来源驱动 API                                           | 同一入口；不得复制本地报告或数据库 ID                                                                       |
| 附件与就绪核对                                           | 绑定同批源单、事实和任务报告                                                                            | 额外绑定 release、migration 和全部 debug=false 证明                                                         |

先生成当前双环境计划。以下命令只输出计划，不连接后端：

```bash
node scripts/qa/manual-acceptance-dataset.mjs

node scripts/qa/manual-acceptance-catalog.mjs \
  --out output/qa/manual-acceptance/catalog

node scripts/qa/manual-acceptance-source-data.mjs \
  --target local-dev \
  --data-version 2026.07.16-v5 \
  --run-id 20260716-V5 \
  --json

node scripts/qa/manual-acceptance-data-depth.mjs
```

正常整批写入只使用顶层 runner。它按 `core → baseline → role → source → task → facts → purchase-quality → attachments → readiness` 串行执行；两端 handler 身份和 target-free 业务输入相同，目标适配层只提供 endpoint、数据库身份、凭据、确认、带外证明和报告目录。`core` 在登录前先调用只读 `/readyz/runtime-identity`，用摘要同时绑定实际数据库、完整 40 位 release commit 和 14 位 Atlas revision；探针只返回匹配 marker，不返回数据库名或连接信息。随后登录 admin 读取真实 `debug.capabilities`，再次核对数据库、运行环境和六个 debug=false，只读证明后续阶段依赖的 1 个稳定单位和 4 个仓库。`baseline` 再逐类读回客户、供应商、材料、产品、SKU、工序、BOM、来源单、Workflow 和全部 Fact 都为 0；任何已有业务记录都会阻断，不能用历史数据凑页面数量。材料、产品、工序、BOM 与业务源单数量随后由 `source` 阶段独立写入并读回。密码创建与重置统一要求 8～20 位且 UTF-8 编码后不超过 72 字节，凭据只从环境变量注入，不写报告。

顶层 runner 不隐式创建数据库、执行 migration、创建首个管理员、激活客户配置或直接执行 core seed。两端完整顺序固定为 `fresh database → migration → first admin → customer config apply/readback → exact core bootstrap → dataset runner → browser`。本地 core 仅允许下面这条精确数据库绑定命令；133 使用镜像内 `/app/bootstrap-manual-acceptance-core`，详见 [Compose 部署说明](../../server/deploy/compose/prod/README.md)。

两端配置都从当前 tracked yoyoosun 包生成同一份 preview 输入；这一步只写 ignored 报告，不连接后端：

```bash
node scripts/qa/customer-config-runtime-manifest.mjs \
  --customer yoyoosun \
  --mode preview \
  --out output/qa/manual-acceptance-dataset/yoyoosun-runtime-manifest-preview.json
```

本地隔离库通过本地专用 gate 应用配置，不能携带远端 attestation：

```bash
MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.07.16-v5:20260716-V5:plush_erp_acceptance_20260716_v5_dev \
MANUAL_ACCEPTANCE_ADMIN_USERNAME=admin \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<isolated-local-admin-password>' \
MANUAL_ACCEPTANCE_PASSWORD='<different-demo-password>' \
  node scripts/qa/manual-acceptance-customer-config.mjs \
    --apply \
    --preview-manifest output/qa/manual-acceptance-dataset/yoyoosun-runtime-manifest-preview.json \
    --target local-dev \
    --backend-url http://127.0.0.1:8310 \
    --database-name plush_erp_acceptance_20260716_v5_dev \
    --data-version 2026.07.16-v5 \
    --run-id 20260716-V5 \
    --out output/qa/manual-acceptance/datasets/2026.07.16-v5/local/customer-config
```

```bash
POSTGRES_DSN='postgres://<user>:<password>@192.168.0.106:5432/plush_erp_acceptance_20260716_v5_dev?sslmode=disable' \
  bash scripts/seed-core-demo-data.sh \
    --references-only \
    --expected-database plush_erp_acceptance_20260716_v5_dev \
    --confirm SEED_MANUAL_ACCEPTANCE_CORE_REFERENCES:local-dev:plush_erp_acceptance_20260716_v5_dev:2026.07.16-v5:20260716-V5
```

本地命令必须指向明确绑定专用验收数据库的后端；当前共享开发端口不能因为地址是本机就当作验收库：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<8-to-20-character-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<8-to-20-character-admin-password>' \
  node scripts/qa/manual-acceptance-dataset.mjs \
    --apply \
    --target local \
    --data-version 2026.07.16-v5 \
    --run-id 20260716-V5 \
    --backend-url '<dedicated-local-acceptance-backend-url-not-port-8300>' \
    --database-name plush_erp_acceptance_20260716_v5_dev \
    --confirm APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.07.16-v5:20260716-V5:plush_erp_acceptance_20260716_v5_dev
```

本地 `--apply` 同时要求显式后端、`plush_erp_acceptance_*` 数据库名和数据库绑定确认串；端口 `8300` 在参数解析阶段直接拒绝。运行态数据库摘要不匹配时，runner 在认证前停止，不会创建登录会话，也不会进入 `role` 或任何业务写阶段。

133 仍使用同一命令和 runner，但必须额外传入 dry-run 计划给出的精确确认串，以及绑定当前 40 位小写 commit、至少 `20260714165115` 的 14 位 migration 和全部 debug=false 的 attestation。探针会把声明与当前容器 `GIT_SHA`、实际连接库和 Atlas 最新 revision 做只读核对；未冻结并部署同一代码版本时不得写入。

下面是 133 在 migration、一次性管理员和 SSH 隧道已经就绪后的完整可执行链。先在本机通过 `18375` 后端隧道应用 V5 配置；`<release>` 与 `<migration>` 必须替换成当前容器和 Atlas 的精确读回值：

```bash
export MANUAL_ACCEPTANCE_TARGET_CONFIRM='APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:customer-trial-133:2026.07.16-v5:20260716-V5'
export MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON='{"target":"customer-trial-133","origin":"http://127.0.0.1:18375","customerKey":"yoyoosun","environment":"prod","release":"<40-character-lowercase-release>","migration":"<14-digit-migration>","debug":{"seedEnabled":false,"seedAllowed":false,"cleanupEnabled":false,"cleanupAllowed":false,"businessDataClearEnabled":false,"businessDataClearAllowed":false}}'

MANUAL_ACCEPTANCE_ADMIN_USERNAME=admin \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<133-independent-admin-password>' \
MANUAL_ACCEPTANCE_PASSWORD='<different-demo-password>' \
  node scripts/qa/manual-acceptance-customer-config.mjs \
    --apply \
    --preview-manifest output/qa/manual-acceptance-dataset/yoyoosun-runtime-manifest-preview.json \
    --target customer-trial-133 \
    --backend-url http://127.0.0.1:18375 \
    --database-name plush_erp_uat_20260716_v5 \
    --data-version 2026.07.16-v5 \
    --run-id 20260716-V5 \
    --out output/qa/manual-acceptance/datasets/2026.07.16-v5/customer-trial-133/customer-config
```

配置读回为 active 后，在 133 的固定 release 目录运行镜像内 core bootstrap。preflight 与该命令必须在同一个干净 shell 中执行；若宿主已定义 env-file 同名键、`COMPOSE_*` project/file/profile/env-file/path-separator 或 `DOCKER_HOST / DOCKER_CONTEXT / DOCKER_TLS_VERIFY / DOCKER_CERT_PATH`，先 `unset` 后再继续：

```bash
cd /home/simon/plush-toy-erp-v5/current/server/deploy/compose/prod
docker compose \
  -p plush-toy-erp-v5 \
  --env-file /home/simon/plush-toy-erp-v5/runtime/.env.customer-trial-133 \
  -f /home/simon/plush-toy-erp-v5/current/server/deploy/compose/prod/compose.yml \
  -f /home/simon/plush-toy-erp-v5/current/server/deploy/compose/prod/compose.customer-trial-133.yml \
  run --rm -T --no-deps --pull never \
  app-server /app/bootstrap-manual-acceptance-core \
    --expected-database plush_erp_uat_20260716_v5 \
    --expected-migration '<14-digit-migration>' \
    --expected-release '<40-character-lowercase-release>' \
    --confirm 'BOOTSTRAP_MANUAL_ACCEPTANCE_CORE:customer-trial-133:yoyoosun:plush_erp_uat_20260716_v5:yoyoosun-manual-acceptance:2026.07.16-v5:20260716-V5:<14-digit-migration>:<40-character-lowercase-release>'
```

回到本机，通过同一隧道执行唯一顶层 runner：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<different-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<133-independent-admin-password>' \
  node scripts/qa/manual-acceptance-dataset.mjs \
    --apply \
    --target customer-trial-133 \
    --backend-url http://127.0.0.1:18375 \
    --data-version 2026.07.16-v5 \
    --run-id 20260716-V5 \
    --confirm APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:customer-trial-133:2026.07.16-v5:20260716-V5 \
    --target-attestation-json "$MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON"
```

该命令完成后，规范总回执必须位于 `output/qa/manual-acceptance/datasets/2026.07.16-v5/customer-trial-133/dataset/apply-report.json`。不得跳过总回执，直接拼接分阶段报告去跑浏览器。

首次执行前，该目标的规范总回执必须不存在。若某阶段失败，或完整成功后需要证明同批幂等重放，保留原回执，并在完全相同的目标、版本、批次、后端和带外证明参数后追加 `--resume-report output/qa/manual-acceptance/datasets/2026.07.16-v5/<target>/dataset/apply-report.json`。禁止删除回执后重新冒充 fresh apply；resume 会重验 core、客户配置、数据库、release / migration、连续阶段和各组件 digest。

fresh apply 会在开始时捕获一次岗位任务时间锚点并写入总回执；同批 resume 必须校验并复用该锚点，不能按当前时间重排到期日。业务数据版本中的日期只用于来源单业务日期，不再充当任务到期锚点。本地和 133 共享同一时间策略与语义 digest，但分别在自己的 fresh 回执中绑定执行锚点。浏览器必须在回执记录的有效期内同时看到出货放行的“即将到期”和“已超时”；锚点过期后不得继续沿用旧报告宣称通过，应换新数据版本并从 fresh 空库重放。

role 阶段只有正式账号场景 API 一个写入口；V5 计划不登记 `seed-role-demo-admins.sh --reset-password`，避免宽泛 dev DSN 或 override 绕过 exact V5 验收库绑定。

fresh 和 resume 都会原子占用同目录的 `dataset/.apply.lock`，同一目标同一版本的第二个进程会在任何 RPC 前停止。若进程异常退出并留下锁，不得直接删除；先确认锁内 PID 已退出，再按错误提示把原锁重命名为带 owner 标识的 .stale-\* 归档，随后重跑完全相同的命令。

下面的分阶段入口只用于定位单个阶段问题，不是另一套页面数据生成流程。直接运行时仍必须显式使用当前版本和批次，密码只从环境变量提供，不写进报告或仓库：

```bash
MANUAL_ACCEPTANCE_SIM_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA \
MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.07.16-v5:20260716-V5:plush_erp_acceptance_20260716_v5_dev \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-source-data.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.07.16-v5 \
    --run-id 20260716-V5 \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --database-name plush_erp_acceptance_20260716_v5_dev \
    --out output/qa/manual-acceptance/datasets/2026.07.16-v5/local/source
```

随后按同一 `dataVersion / runId` 准备九岗位任务和统一事实链。采购收货与质检已经归入事实入口，不再单独调用 `purchase-quality-simulated-matrix.mjs`；旧 `operational-fact-simulated-closure.mjs` 只保留历史 report-only 守卫，不能作为当前数据入口。

```bash
node scripts/qa/manual-acceptance-task-data.mjs \
  --target local-dev \
  --data-version 2026.07.16-v5 \
  --run-id 20260716-V5

MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM=APPLY_SIMULATED_ACCOUNT_SCENARIOS \
MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.07.16-v5:20260716-V5:plush_erp_acceptance_20260716_v5_dev \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-account-scenarios.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.07.16-v5 \
    --run-id 20260716-V5 \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --database-name plush_erp_acceptance_20260716_v5_dev \
    --json

MANUAL_ACCEPTANCE_TASK_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_TASKS \
MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.07.16-v5:20260716-V5:plush_erp_acceptance_20260716_v5_dev \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-task-data.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.07.16-v5 \
    --run-id 20260716-V5 \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --database-name plush_erp_acceptance_20260716_v5_dev \
    --out output/qa/manual-acceptance/datasets/2026.07.16-v5/local/task
```

`manual-acceptance-fact-data.mjs` 必须输出 `source-driven-operational-facts-v1` 报告，记录本批采购收货、质检、库存、生产、预留、出货与财务对象的精确 ID、业务编号和状态。重复执行只能完整复用或继续同一批次；发现部分冲突或报告身份不一致时必须停止。Readiness、附件和浏览器入口都会拒绝旧通用事实报告。

```bash
MANUAL_ACCEPTANCE_SIM_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA \
MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.07.16-v5:20260716-V5:plush_erp_acceptance_20260716_v5_dev \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-fact-data.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.07.16-v5 \
    --run-id 20260716-V5 \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --database-name plush_erp_acceptance_20260716_v5_dev \
    --source-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/source/apply-report.json \
    --out output/qa/manual-acceptance/datasets/2026.07.16-v5/local/facts
```

需要分段排障时，`--phase purchase-quality` 只准备采购、收货、质检和材料库存；`--phase facts` 会先核对或复用这批采购前置，再继续生产、委外、出货和财务，不是绕过采购前置的独立入口。最终验收仍必须执行完整模式并生成一份同时包含全部精确引用的事实报告。

写入后只读核对 50 项验收目标：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-readiness.mjs \
    --verify \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --database-name plush_erp_acceptance_20260716_v5_dev \
    --source-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/source/apply-report.json \
    --fact-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/facts/apply-report.json \
    --task-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/task/apply-report.json \
    --out output/qa/manual-acceptance/datasets/2026.07.16-v5/local/readiness
```

`readiness` 独立命令保持严格非绿：40 项可查询数据全部通过、5 项模板预览与 5 项打印工作台仍待浏览器时，报告为 `queryChecksPassed=true / queryEvidenceComplete=false` 并退出 1。顶层 dataset runner 只在“0 项查询失败、恰好这 10 项打印目标 `not_proven`、其余 40 项全过”时把数据底座记为已证明，同时明确写入 `browserEvidencePending=true`；任意其他缺口仍立即阻断。浏览器还必须为 5 个预览各证明至少 1 份可见数据，并为每个打印工作台证明本批来源至少 5 条，再打开精确 25 行单据和真实 PDF。最终只有同批浏览器报告的 `acceptancePassed=true` 才能宣称 50 项自动化验收完成。

出货数据是精确合同：同批必须恰好 47 张出货单，且恰好 1 张有 25 行明细。fact 写入报告、readiness 读回和出货页面 DOM 任一出现 45、46、48 张，或出现零张/多张 25 行单据，都必须失败。

附件入口绑定同批源单、事实和任务报告，按岗位权限上传并做列表与下载读回。133 还必须提供 `MANUAL_ACCEPTANCE_TARGET_CONFIRM` 和 `MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON`，证明精确 target、origin、customer、release、migration 及全部 debug=false；未绑定最终 commit / image 时不得写 133。

最后执行真实浏览器只读核对。页面能打开、页面有数据、数量达到门槛和人工确认是四类不同证据，不能合并成一句“已验收”：

```bash
node scripts/qa/manual-acceptance-browser.mjs --plan \
  --base-url http://127.0.0.1:15200 \
  --backend-url '<dedicated-local-acceptance-backend-url>'

MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
  node scripts/qa/manual-acceptance-browser.mjs \
    --base-url http://127.0.0.1:15200 \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --dataset-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/dataset/apply-report.json \
    --source-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/source/apply-report.json \
    --fact-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/facts/apply-report.json \
    --readiness-report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/readiness/verify-report.json \
    --report output/qa/manual-acceptance/datasets/2026.07.16-v5/local/browser/report.json
```

`customer-trial-133` 的浏览器报告必须写到当前版本与目标的规范路径 `output/qa/manual-acceptance/datasets/<dataVersion>/customer-trial-133/browser/report.json`，并同时提供同批 `dataset/apply-report.json`、`readiness/verify-report.json` 与 `MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON`。浏览器启动前会重新调用 `/readyz/runtime-identity`，把当前数据库、完整 release commit、Atlas migration、fresh baseline、attachments、source / fact / task / readiness 批次身份原子绑定；readiness 只参与身份闭合，列表数量仍必须由当前页面 DOM 重新证明，打印仍必须由当前 5 份 PDF 证明。

133 前端隧道为 `18376` 时，最终浏览器命令为：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<different-demo-password>' \
  node scripts/qa/manual-acceptance-browser.mjs \
    --base-url http://127.0.0.1:18376 \
    --backend-url http://127.0.0.1:18375 \
    --dataset-report output/qa/manual-acceptance/datasets/2026.07.16-v5/customer-trial-133/dataset/apply-report.json \
    --source-report output/qa/manual-acceptance/datasets/2026.07.16-v5/customer-trial-133/source/apply-report.json \
    --fact-report output/qa/manual-acceptance/datasets/2026.07.16-v5/customer-trial-133/facts/apply-report.json \
    --readiness-report output/qa/manual-acceptance/datasets/2026.07.16-v5/customer-trial-133/readiness/verify-report.json \
    --target-attestation-json "$MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON" \
    --report output/qa/manual-acceptance/datasets/2026.07.16-v5/customer-trial-133/browser/report.json
```

打印工作台必须从同批采购订单、委外订单和 BOM 选择真实模拟记录。PDF 出现 4xx / 5xx、空文件、非 PDF 或缺少 `request_id` 都要失败，不能用页面打开代替带值打印证据。

退出批次前必须先 dry-run。执行后源单进入取消 / 归档状态，主数据转为停用；已过账库存、出货和财务历史继续保留，不做物理删除。本地和 133 都走同一 target policy，133 仍要求精确确认和带外证明：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
  node scripts/qa/manual-acceptance-source-retire.mjs \
    --target local-dev \
    --data-version 2026.07.16-v5 \
    --run-id 20260716-V5

MANUAL_ACCEPTANCE_RETIRE_CONFIRM=RETIRE_SIMULATED_MANUAL_ACCEPTANCE_SOURCE_DATA \
MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.07.16-v5:20260716-V5:plush_erp_acceptance_20260716_v5_dev \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-source-retire.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.07.16-v5 \
    --run-id 20260716-V5 \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --database-name plush_erp_acceptance_20260716_v5_dev
```

手工验收数据不是压测数据。容量和压力入口只能使用一次性隔离数据库；共享开发库与 133 试用库都不得拿来压测。容量幂等探针必须通过 `--task-source-type / --task-source-id` 绑定同批 `trial_pmc_work` 模拟任务，并校验 `simulated_only / trial_task` 标记；不得借用正式来源生成任务。ignored 本地报告也不等于目标服务器的发布证据。

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
