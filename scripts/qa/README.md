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
| `node scripts/qa/skill-health.mjs`                                                                       | 检查项目 Skill frontmatter、目录名、metadata、README 索引和相对引用；`affected` 对 Skill 变更会直接执行，不再只提示 follow-up                         | 修改 `.agents/skills/**` 后                     |
| `bash scripts/qa/strict.sh`                                                                             | full 的真实超集：复用全部 full 门禁及真实 browser-smoke，再追加扩展视口、零 warning、shell / YAML 格式和严格 govulncheck                               | 发版前 / 大改后                                 |
| `bash scripts/qa/full.sh`                                                                               | 推送前全量检查；动态空闲端口自启当前 worktree Vite 并运行 Chromium，另含 fast、secrets、历史存量升级与当前 schema PostgreSQL、前后端测试 / 构建和 govulncheck | 提交推送前                                      |
| `sh scripts/qa/populated-upgrade-preflight.sh --audit <populated-upgrade\|customer-config-cutover> ...` | 对指定数据库运行固定 allowlist 的 migration 只读审计；不执行 migration 或自动数据治理                                                                | 跨越 20260714055504 / 20260714055825 前          |
| `.github/workflows/ci.yml`                                                                              | 单一 job 复用 `strict.sh` 的完整本地门禁，另在前后补 Ent / Atlas 零漂移与 committed source archive；不复制第二套业务规则                              | pull request、main push、手工触发               |
| `node scripts/qa/docs-inventory.test.mjs`                                                               | 检查当前维护 Markdown 是否登记到 `docs/文档清单.md`                                                                                                    | 新增、删除、重命名 README 或长期文档后          |
| `node --test scripts/qa/dev-entry-boundary.test.mjs`                                                  | 锁住 `make dev_restart`先预检再停服、启动预检只读，以及 Product Core / 客户开发入口共用同一 web preflight                              | 调整本地启动命令、Vite 代理或 migration 预检后 |
| `node scripts/qa/customer-package-lint.mjs --all`                                                       | 从构建期客户索引校验 demo、reference-customer 和 yoyoosun raw package；不 publish/activate                                                              | 调整客户包、catalog 或 schema 后                 |
| `node scripts/qa/customer-config-runtime-manifest.mjs --all --mode preview`                            | 以 preview 模式编译并验证全部登记 draft 客户包的不可发布 manifest；不调用后端或写事实                                                                   | 调整 manifest compiler/effective-session 输入后 |
| `node scripts/qa/private-deployment-boundaries.mjs`                                                     | 检查三份客户文档、三份配置和最小部署参数边界，并禁止 reference 部署目录                                                                                 | 调整私有化模板或 reference 文档后               |
| `node scripts/qa/phase-label-boundaries.mjs` + `node --test scripts/qa/phase-label-boundaries.test.mjs`  | 全仓扫描活跃代码、脚本和正式文档中的编号阶段命名，并验证完整 Phase 编号、P 子阶段编号和 P 编号发布目标会被拒绝；P0/P1 风险等级、p95 百分位和产品编码不受影响 | 改脚本、API、命名或治理文档后                   |
| `node scripts/qa/experimental/canonical-runtime-audit.mjs`                                             | 非阻断实验审计；宽泛 keyword 命中只作只读复核线索，不进入 fast / affected，不代表产品缺陷或发布证据；恢复阻断前必须改成逐域 status key / API field / function / runtime branch 精确合同 | 需要人工盘点历史词命中时                        |
| `node scripts/qa/test-data-isolation-boundary.mjs --json`                                               | 只读检查 Product Core demo seed、yoyoosun 模拟数据和真实导入准备边界，并锁住 dry-run 不具备执行能力                                                    | 改 seed、fixture、模拟数据或导入准备工具后      |
| `node scripts/qa/manual-acceptance-catalog.mjs`                                                         | 从当前客户菜单、岗位矩阵和打印模板生成 48 项全页面手工验收目录；默认只输出，不连接后端                                                                 | 准备全页面试用验收范围时                        |
| `node scripts/qa/manual-acceptance-dataset.mjs`                                                         | 生成当前 `2026.07.15-v3 / 20260715-V3` 的 local 与 133 同语义计划；默认不连接后端                                                                      | 准备双环境全页面模拟数据前                      |
| `node scripts/qa/manual-acceptance-source-data.mjs --target local-dev --data-version 2026.07.15-v3 --run-id 20260715-V3 --json` | 生成带稳定批次前缀的客户、供应商、产品规格、材料、加工环节及销售 / 采购 / 委外 / BOM 源数据计划；默认只读                                              | 写入模拟源数据前确认数量、状态和边界时          |
| `node scripts/qa/manual-acceptance-account-scenarios.mjs --json`                                        | 生成停用、多岗位和无业务入口三种补充账号计划；不修改十个正式岗位账号                                                                                   | 核对登录与入口异常场景前                        |
| `node scripts/qa/manual-acceptance-task-data.mjs --data-version 2026.07.15-v3 --run-id 20260715-V3`     | 生成九个岗位各 20 条、共 180 条任务的可重复计划；默认只输出，不连接后端                                                                                | 准备岗位任务端数据前                            |
| `node scripts/qa/manual-acceptance-fact-data.mjs --source-report <report> --data-version 2026.07.15-v3 --run-id 20260715-V3 --json` | 复用已核验源数据，按正式来源驱动 API 统一准备采购、质检、库存、生产、出货和财务事实；默认只读                                                          | 写入模拟业务事实前                              |
| `node scripts/qa/manual-acceptance-readiness.mjs`                                                       | 生成 48 项只读就绪核验计划；只有显式 `--verify --backend-url` 才登录试用账号并查询数量和状态分布                                                       | 写入后核对页面数据是否达到手工验收门槛时        |
| `node scripts/qa/manual-acceptance-browser.mjs --plan --base-url <local-url> --backend-url <local-url>` | 生成 48 项本机浏览器验收计划；真实模式只登录、逐页读取和切换只读任务页签，不点击业务写动作                                                             | 核对真实账号、页面、岗位端和打印入口时          |
| `node scripts/qa/manual-acceptance-source-retire.mjs --data-version 2026.07.15-v3 --run-id 20260715-V3` | 默认 dry-run，预览按批次取消 / 归档源单并停用主数据的退出动作；local 与已登记 133 均受精确 target policy 保护，不物理删除历史记录                       | 试用批次退出前                                  |
| `node scripts/qa/customer-config-effective-session-probe.mjs --json`                                    | 无 Authorization 探测本地 `customer_config.get_effective_session`，确认后端可达和 `40302 未登录` 边界                                                  | yoyoosun 静态入口已命中、但还没有真实登录证据时 |
| `node --test scripts/qa/customer-package-preview-boundary.test.mjs`                                     | 锁住客户配置包 businessFlows / stateMachines / processPolicies 仍为 preview-only，不写 Fact、不覆盖 usecase 生命周期                                   | 调整客户包流程、状态机或策略预览后              |

## 主要脚本分组

| 分组                 | 典型脚本                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 边界                                                                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 编排入口             | `fast.sh`、`strict.sh`、`full.sh`                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 只编排本地检查，不代表目标环境 release evidence 已完成                                                                                                                                                                         |
| 文档、命名与真源守卫 | `docs-inventory.test.mjs`、`phase-label-boundaries.mjs`、`experimental/canonical-runtime-audit.mjs`                                                                                                                                                                                                                                                                                                                                                                                           | 前两者阻断路径、命名和登记漂移；canonical broad scan 仅为显式非阻断实验审计，不进入 fast / affected，不能替代逐域合同、migration 或 runtime 验证                                                                                  |
| 客户配置与私有化边界 | `config/customers/index.test.mjs`、`scripts/build/apply-customer-web-config.test.mjs`、`customer-config-boundaries.mjs`、`customer-config-effective-session-probe.mjs`、`customer-package-lint.mjs`、`customer-package-preview-boundary.test.mjs`、`customer-config-runtime-manifest.mjs`、`private-deployment-boundaries.mjs`、`private-deployment-package-closure.test.mjs` | 只做构建期索引、overlay、lint / preview / manifest 编译、无凭据读回探针和模板边界检查；`boundariesSatisfied` 不等于交付、evidence 或签收完成，不写 Fact |
| Workflow / Fact 边界 | `workflow-fact-boundary.test.mjs`、`workflow-ui-action-boundary.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                    | 防止协同任务路径越界写入事实层                                                                                                                                                                                                 |
| 测试数据隔离         | `test-data-isolation-boundary.mjs`、`manual-acceptance-dataset.mjs`、`manual-acceptance-catalog.mjs`、`manual-acceptance-source-data.mjs`、`manual-acceptance-task-data.mjs`、`manual-acceptance-fact-data.mjs`、`manual-acceptance-source-driven-facts.mjs`、`manual-acceptance-attachment-data.mjs`、`manual-acceptance-readiness.mjs`、`manual-acceptance-browser.mjs`、`manual-acceptance-source-retire.mjs` | Product Core、本地 / 133 同版模拟数据、真实导入准备和执行门禁分桶检查；当前事实只走正式来源驱动 API，旧通用写入器不得回流，浏览器入口只执行登录和只读页面查询 |
| 代码质量和安全       | `secrets.sh`、`error-codes.sh`、`go-vet.sh`、`govulncheck.sh`、`shellcheck.sh`、`shfmt.sh`、`yamllint.sh`                                                                                                                                                                                                                                                                                                                                                                                    | 按对应语言 / 配置类型补充检查，不替代业务回归                                                                                                                                                                                  |

## 门禁完整性与 CI 边界

`full.sh` 默认拒绝继承的 `STYLE_L1_BASE_URL`，为本轮分配动态端口并只清理自身启动的 Vite 进程；外部 base URL 只能用于显式单项 browser smoke，不能替代 full 的当前 worktree 证据。server 全量测试先在唯一临时数据库中从历史 checkpoint 装载合成存量行，验证 055504 / 055825 两项只读 blocker、显式测试专用切换和 latest pending=0，再运行当前 schema 关键事务矩阵；它还启用真实 Chromium PDF 安全集成，本机自动发现 Chrome/Chromium，CI 则传入本轮 Playwright 下载的精确可执行路径。安全集成未执行会以 Go skip 阻断 full。`strict.sh` 直接复用 full，保持 strict 是 full 的真实超集。fast / full 的固定 Node 与 Go 测试除子进程退出码外，还要求可解析结果、实际执行数大于 0、失败数与跳过数均为 0；缺 summary、零执行或 skip 一律阻断。

`populated-upgrade-preflight.sh` 只接受 `populated-upgrade` 和 `customer-config-cutover` 两个 audit key，并把 DSN 仅从调用方指定的环境变量传给 `psql`。前者检查 20260714055504 的状态、生命周期、取消审计束、流程锚点、版本和待删除时间字段；后者检查 20260714055825 前必须显式治理的流程运行态与任务配置锚点。两者都使用 read-only 事务，不能修复或清理生产数据；出现 blocker 后必须停止 apply，由单独评审的治理动作处理，完成后重跑审计。

直接运行 full / strict 时，任何 `SKIP_*`、`STRICT_SKIP_*` 或调用者提供的旧 coverage 变量都会得到 `incomplete` 并失败；full 始终真实执行 secrets 与 govulncheck，不接受普通调用者自签 JSON 作为前序成功证明。pre-push 先按每个真实 push ref 执行完整历史 secrets，成功后再以聚合范围调用普通 full；新 remote ref 的聚合范围固定为 `empty-tree..HEAD`，确保普通文件、schema 与 repo 变更实际进入 diff / DB guard。任一步失败，外层都不能输出完整结果。

CI action 固定到审核过的 commit，工具链读取 `.n-node-version`、`web/package.json#packageManager` 和 `server/go.mod`。单一 strict job 先执行 `make data` 并要求仓库零漂移，再由 `strict.sh` 完整复用本地 full / browser / fresh PostgreSQL 门禁，最后检查 committed source archive；`db-guard` 只是提前阻断的静态启发式，不能替代 Ent / Atlas 零漂移、冻结树 fresh / upgrade 验证或目标环境 evidence。

仓库内 workflow 只能证明 CI 定义存在。本地 hook 可被 `--no-verify` 绕过；GitHub branch protection / required check 是否启用必须另取远端设置证据，不能用本地 full / strict 或 workflow 文件存在来替代。

## 输出与写入边界

- 脱敏报告和模拟 evidence 默认写到 `output/**` 或调用方显式指定的 ignored 目录。
- 脚本不得把真实密码、token、完整 DSN、URL userinfo、原始客户文件内容或未脱敏输出写入仓库。
- 调整 QA 脚本后，至少运行对应 `node --check` / `node --test`，并按影响面补 `fast.sh`、`strict.sh` 或专题命令。

## 全页面试用验收数据

当前唯一整批合同是 `2026.07.15-v3 / 20260715-V3`。本地开发库和 133 试用库使用同一套业务含义、数量与状态矩阵，但数据库 ID 各自独立，不能复制表行或用“编号相同”代替读回证明。正式部署默认不执行这套数据。

模拟数据沿用永绅原文件的简短习惯，例如款号与品名分开、规格写成“米白·小号”、材料写成“米白短毛绒”、环节写成“裁片 / 车缝 / 电绣”，备注用“分两批交货”“颜色按样板”这类日常说法。页面名称不再每条重复开发提示；模拟身份由 `SIM-YOYOOSUN-*` 编号、`datasetKey / dataVersion / runId` 和报告统一证明。原文件只用于理解字段和用词，不直接导入真实行。

| 阶段 | 本地 | 133 试用库 |
| --- | --- | --- |
| 通用基础资料、岗位账号 | 可准备、核对或复用 | 只能核对或复用，禁止远程 seed |
| 客户、供应商、产品、材料、工序、销售 / 采购 / 委外 / BOM | 按稳定编号写入并读回 | 通过已登记目标、精确确认和带外证明写入并读回 |
| 采购收货、质检、库存、生产、预留、出货、财务 | 统一由 `manual-acceptance-fact-data.mjs` 调用正式来源驱动 API | 同一入口；不得复制本地报告或数据库 ID |
| 附件与就绪核对 | 绑定同批源单、事实和任务报告 | 额外绑定 release、migration 和全部 debug=false 证明 |

先生成当前双环境计划。以下命令只输出计划，不连接后端：

```bash
node scripts/qa/manual-acceptance-dataset.mjs

node scripts/qa/manual-acceptance-catalog.mjs \
  --out output/qa/manual-acceptance/catalog

node scripts/qa/manual-acceptance-source-data.mjs \
  --target local-dev \
  --data-version 2026.07.15-v3 \
  --run-id 20260715-V3 \
  --json

node scripts/qa/manual-acceptance-data-depth.mjs
```

本地写入必须显式使用当前版本和批次。密码只从环境变量提供，不写进报告或仓库：

```bash
MANUAL_ACCEPTANCE_SIM_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-source-data.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.07.15-v3 \
    --run-id 20260715-V3 \
    --backend-url http://127.0.0.1:8300 \
    --out output/qa/manual-acceptance/datasets/2026.07.15-v3/local/source
```

随后按同一 `dataVersion / runId` 准备九岗位任务和统一事实链。采购收货与质检已经归入事实入口，不再单独调用 `purchase-quality-simulated-matrix.mjs`；旧 `operational-fact-simulated-closure.mjs` 只保留历史 report-only 守卫，不能作为当前数据入口。

```bash
node scripts/qa/manual-acceptance-task-data.mjs \
  --target local-dev \
  --data-version 2026.07.15-v3 \
  --run-id 20260715-V3

MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM=APPLY_SIMULATED_ACCOUNT_SCENARIOS \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-account-scenarios.mjs --apply --json

MANUAL_ACCEPTANCE_TASK_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_TASKS \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-task-data.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.07.15-v3 \
    --run-id 20260715-V3 \
    --backend-url http://127.0.0.1:8300 \
    --out output/qa/manual-acceptance/datasets/2026.07.15-v3/local/task
```

`manual-acceptance-fact-data.mjs` 必须输出 `source-driven-operational-facts-v1` 报告，记录本批采购收货、质检、库存、生产、预留、出货与财务对象的精确 ID、业务编号和状态。重复执行只能完整复用或继续同一批次；发现部分冲突或报告身份不一致时必须停止。Readiness、附件和浏览器入口都会拒绝旧通用事实报告。

```bash
MANUAL_ACCEPTANCE_SIM_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-fact-data.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.07.15-v3 \
    --run-id 20260715-V3 \
    --backend-url http://127.0.0.1:8300 \
    --source-report output/qa/manual-acceptance/datasets/2026.07.15-v3/local/source/apply-report.json \
    --out output/qa/manual-acceptance/datasets/2026.07.15-v3/local/facts
```

需要分段排障时，`--phase purchase-quality` 只准备采购、收货、质检和材料库存；`--phase facts` 会先核对或复用这批采购前置，再继续生产、委外、出货和财务，不是绕过采购前置的独立入口。最终验收仍必须执行完整模式并生成一份同时包含全部精确引用的事实报告。

写入后只读核对 48 项验收目标：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-readiness.mjs \
    --verify \
    --backend-url http://127.0.0.1:8300 \
    --source-report output/qa/manual-acceptance/datasets/2026.07.15-v3/local/source/apply-report.json \
    --fact-report output/qa/manual-acceptance/datasets/2026.07.15-v3/local/facts/apply-report.json \
    --task-report output/qa/manual-acceptance/datasets/2026.07.15-v3/local/task/apply-report.json \
    --out output/qa/manual-acceptance/datasets/2026.07.15-v3/local/readiness
```

附件入口绑定同批源单、事实和任务报告，按岗位权限上传并做列表与下载读回。133 还必须提供 `MANUAL_ACCEPTANCE_TARGET_CONFIRM` 和 `MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON`，证明精确 target、origin、customer、release、migration 及全部 debug=false；未绑定最终 commit / image 时不得写 133。

最后执行真实浏览器只读核对。页面能打开、页面有数据、数量达到门槛和人工确认是四类不同证据，不能合并成一句“已验收”：

```bash
node scripts/qa/manual-acceptance-browser.mjs --plan \
  --base-url http://127.0.0.1:5177 \
  --backend-url http://127.0.0.1:8300

MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
  node scripts/qa/manual-acceptance-browser.mjs \
    --base-url http://127.0.0.1:5177 \
    --backend-url http://127.0.0.1:8300 \
    --source-report output/qa/manual-acceptance/datasets/2026.07.15-v3/local/source/apply-report.json \
    --fact-report output/qa/manual-acceptance/datasets/2026.07.15-v3/local/facts/apply-report.json \
    --report output/qa/manual-acceptance/datasets/2026.07.15-v3/local/browser/report.json
```

打印工作台必须从同批采购订单、委外订单和 BOM 选择真实模拟记录。PDF 出现 4xx / 5xx、空文件、非 PDF 或缺少 `request_id` 都要失败，不能用页面打开代替带值打印证据。

退出批次前必须先 dry-run。执行后源单进入取消 / 归档状态，主数据转为停用；已过账库存、出货和财务历史继续保留，不做物理删除。本地和 133 都走同一 target policy，133 仍要求精确确认和带外证明：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
  node scripts/qa/manual-acceptance-source-retire.mjs \
    --target local-dev \
    --data-version 2026.07.15-v3 \
    --run-id 20260715-V3

MANUAL_ACCEPTANCE_RETIRE_CONFIRM=RETIRE_SIMULATED_MANUAL_ACCEPTANCE_SOURCE_DATA \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-source-retire.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.07.15-v3 \
    --run-id 20260715-V3
```

手工验收数据不是压测数据。容量和压力入口只能使用一次性隔离数据库；共享开发库与 133 试用库都不得拿来压测。ignored 本地报告也不等于目标服务器的发布证据。

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
