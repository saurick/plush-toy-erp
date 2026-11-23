# QA 脚本 / QA Scripts

本文是 `scripts/qa/` 的目录入口。仓库级脚本总览仍在 [scripts/README.md](../README.md)；测试选择和验证层级真源仍在 [docs/product/自动化测试策略.md](../../docs/product/自动化测试策略.md)。

## 按任务阅读

| 当前任务 | 入口 |
| --- | --- |
| 本次改动要测什么 | [按影响面选择](#按影响面选择--affected-tests) |
| Node 测试占用异常或卡死 | [测试资源保护](#node-test-resource-limits) |
| 准备试用数据与页面验收 | [全页面试用验收数据](../../docs/engineering/全页面试用验收数据.md) |
| 核对数量、事务与并发 | [领域事务验证](#postgresql-领域事务验证) |
| 检查打印输出 | [打印引擎验证](#打印引擎验证--pdf-runtime) |
| 核对完整门禁或准备推送 | [full 与 strict](#full-与-strict)、[推送准备](#推送准备与回执) |
| 查找具体脚本 | [常用入口](#常用入口) |

## 目录职责

事务、数量、并发及权限 / 事实边界的具名用例集中维护在 [关键规则目录](lib/business-rule-catalog.mjs)，由正式后端门禁、覆盖采集器和工作台共用。

`full.sh` 的普通 Go 阶段使用 `--business-rules server`，关键 PostgreSQL 执行器使用 `--business-rules postgres`，在原有执行数和零 skip 检查之外要求每个登记用例的精确 package、测试名及父终态通过。

目录维护、恢复图及发布前执行范围见[测试策略](../../docs/product/自动化测试策略.md#business-correctness)。

`scripts/qa/` 只放本地验收、静态守卫、边界扫描和测试编排脚本。它可以读取代码、配置、文档和本地输出，必要时生成 ignored evidence；它不负责生产发布、不直接导入真实客户数据、不替代后端 RBAC / Workflow / Fact usecase。

`affected` 的 Web 源码依赖扫描排除各层 `output/` 和 `node_modules/`。当计划已经包含完整 Web 测试时，复用 [源码测试发现](../../web/scripts/runUnitTests.mjs) 的实际集合，移除已被覆盖的单独测试命令；源码、脚本和开发服务测试遵循同一发现范围。其他 Node 检查仍保留，无法识别覆盖关系的源码继续选择完整 Web 测试。

### 工具环境与专项检查

普通本地与 CI 辅助工具使用现有 Node.js，数据库测试入口共用 `postgres-target-contract.mjs` 校验一次性目标。macOS 的[原生测试保护](native/README.md)安装与故障验证使用 Python 3 和本机 SDK；独立 Git 提交入口使用 Python 3 标准库。两者均不进入业务运行或目标部署链路。目标宿主机继续使用已有 Shell、jq 和系统工具，部署前检及回执不依赖宿主 Node.js 或 Go，见[部署脚本](../deploy/README.md)。

macOS 原生启动器的编译、退出、凭据清理和信号转发用例仅在 Mac 注册并实际执行；Linux CI 运行直接进程生命周期合同。两类结果按执行平台保留，不用跳过的 macOS 原生用例代表 Linux 验证通过，也不把 Linux 合同写成已执行 Mac 原生检查。

附件存储的真实 PostgreSQL / S3 迁移与恢复验证使用 `bash scripts/qa/attachment-storage-integration.sh`；固定 SeaweedFS 镜像，一次性本地容器，包含导出摘要门禁、私有访问、完整性、PG 加文件恢复和附件并发回归。测试前同时核对 PostgreSQL、集群健康与签名 S3 存储桶访问，就绪超时直接失败。

`fast` 与 baseline 对真实 Chromium 安全及进程生命周期集成使用同一范围边界；它们由 full / strict 的受控真实浏览器环境执行并拒绝跳过，不在缺少浏览器配置的开发快检中生成未执行项。

该入口不触碰登记数据库。Node 与 Go 测试摘要在失败时保留有界的用例名称，捕获的测试正文仍不进入摘要日志。Web 测试文件固定最多 4 个并发，避免高核数机器同时启动大量真实 Vite 监控器；HMR 文件更新与连接测试仍完整执行。

该演练也包含管理界面验证；单独运行 `node scripts/qa/attachment-console-integration.mjs` 可验证正式 Compose 的原生登录、只读浏览、服务端写入拒绝和退出登录。只在一次性测试覆盖中开放随机本机端口，结束后精确清理测试容器、网络和目录。

主机 Docker 默认地址池耗尽时，可为该夹具设置 `ATTACHMENT_CONSOLE_FIXTURE_SUBNET`，值须为已核对不冲突、地址对齐的私有 IPv4 `/27`；夹具拆为两个 `/28`，分别用于内部附件网络和本机浏览器入口，结束后检查网络与卷均已清理。该配置只影响一次性测试，不改变正式 Compose 或主机 Docker 配置。

终态来源任务办理人的前向修复使用 [terminal-task-assignee-preflight.sql](terminal-task-assignee-preflight.sql) 核查旧职责迁移与原始回执。没有可证明的原始分派记录时阻断升级，必须核对升级前备份；事件操作人不能替代任务办理人。

任务独立编号迁移使用 [workflow-task-number-preflight.sql](workflow-task-number-preflight.sql) 只读核查创建日期；迁移按上海日期回填每日流水并建立计数器，不修改原任务事件或冻结回执。

职责迁移尚未执行的演示目标可通过受控 Go 维护命令保全当前原始快照；已经执行的登记开发目标则从原备份恢复。两类入口及 dry-run / apply 边界见 [服务端开发说明](../../server/README.md)，对应 PostgreSQL 回归覆盖真实分派、原本未分派、备份不匹配拒绝与重复执行。

<a id="node-test-resource-limits"></a>

## Node 测试资源保护 / Node Test Resource Limits

Node 分组、Web 源码测试、按需测试门禁、CI Node / resource lane、原生覆盖采集和提交 hook 共用 [进程保护器](lib/node-test-process.mjs)。macOS 当前系统 Node 测试入口还必须经过已安装且源码匹配的[原生启动保护](native/README.md)：该入口的裸命令、绝对路径启动、`process.execPath` 及清空环境变量后的 Node 后代均进入同一单机预算。

正式安装的 macOS 保护器使用固定程序标识与持久证书签名，更新前后校验授权身份；证书不可用时停止安装。首次切换签名及真实文件夹授权的验证边界见[更新后的文件夹授权](native/README.md#更新后的文件夹授权)。

工具内置 Node 另有[堆上限保护](native/README.md#embedded-tool-heap-guard)。它不纳入下述 6 GiB 账本，不能限制堆外内存或所有会话合计；原始内置路径、旧连接、桌面宿主覆盖配置和未来私有 runtime generation 仍可能绕过。覆盖结论必须以对应实际内核回读为准。

| 保护 | 默认边界 |
| --- | --- |
| macOS 共享预算 | 全部受保护 Node 共享最多 6144 MiB，且不超过物理内存四分之一；独立原生 guardian 持有预留直到 Node 实际退出 |
| macOS 内核限额 | 编排 / runner / worker 分别为 256 / 512 / 1024 MiB，超限由系统终止；不依赖 RSS 采样或测试事件循环 |
| 跨会话准入 | macOS 一个活动作业，其他会话在内核锁上排队；本机测试文件固定单并发，Linux / CI 保持其原有文件并发配置 |
| 外部超时 | 裸命令 2 分钟、QA 编排 30 分钟、排队 15 分钟；正式门禁另有每文件 worker 5 分钟等细分时限 |
| 通用辅助保护 | V8 heap、每 100ms 的单进程 / 进程树 RSS 检查保留早期失败和诊断；它们不单独构成内核硬配额 |
| 输出 | stdout / stderr 合计最多捕获 32 MiB，超量立即失败 |
| 终止与结果 | 超限、超时、中断、父进程退出、源码 / 内核版本不匹配或限额读回失败均返回非零；原生退出事件回收 Node 后代与额度，通用门禁保留完整执行摘要 |

Linux worker 使用 `/proc/<pid>/exe` 核对 Node 身份，不依赖可变线程名；单进程 RSS 超限诊断记录 PID、程序名和峰值，不记录参数或环境变量。跨 Go / 前端错误合同按 `go list` 选择当前目标的完整正式 service 源码与该合同测试，避免仅为读取错误响应而编译无关集成测试引入的 Ent；完整 Go 测试仍由服务端 CI 执行，既有超时与内存边界不变。

从仓库根目录运行单文件或具名集合：

```bash
node scripts/qa/run-test-gate.mjs --kind node --label focused -- node --test --test-reporter=tap web/scripts/test/nodeTestProcess.test.mjs
```

已知慢测试可在门禁命令中显式指定 `--timeout-ms <毫秒>`（位于 `--` 前）；不为卡死或内存异常提高资源上限。本机裸 `node --test` 已由原生入口接管；正式验证继续使用门禁取得非零执行数和零 skip 证据。输出截断和 V8 堆上限都无法单独阻止断言格式化中的内存膨胀。

需要多个 Node 子进程同时存活的小负载夹具，可按[子进程额度声明](native/README.md#bounded-child-memory)为每个子进程下调预留与内核限额。声明不增加机器预算，也不提高任何角色的默认上限。

DOM 断言只输出有界值：存在性用 `Boolean(container.querySelector(...))`，身份用 `actualNode === expectedNode`，内容用文本、属性或数量。不要把 DOM / Window / React Fiber 整体交给相等、深比较或日志格式化；修复必须保留原来的失败条件。资源保护强制终止时，子进程清理钩子可能无法执行；涉及数据库或容器的测试仍按原 fixture 生命周期核对现场，不把被终止写成通过。

故障回归位于 [Node 进程保护测试](../../web/scripts/test/nodeTestProcess.test.mjs)，其 macOS 分支实际执行[原生内核回归](native/test_node_test_guard.py)。覆盖失败 DOM 格式化、死循环、跨会话预算、裸入口、清空环境变量、退出回收和真实安装 / 回滚；Linux 不注册 macOS 专属用例。本轮主机级验证不替代 Linux Runner 的资源合同或远端 CI。

## 主要脚本分组

### 编排入口

**典型脚本**：`fast.sh`、`strict.sh`、`full.sh`

**边界**：只编排本地检查，不代表目标环境 release evidence 已完成

### 文档、命名与真源守卫

**典型脚本**：`docs-inventory.test.mjs`、`schema-docs.test.mjs`、`phase-label-boundaries.mjs`、`experimental/canonical-runtime-audit.mjs`

**边界**：前三者阻断 Product Core 路径、数据字典和命名漂移；canonical broad scan 仅为显式非阻断实验审计，不进入 fast / affected，不能替代逐域合同、migration、目标结构读回或 runtime 验证

### 客户交付文档专项

**典型脚本**：`yoyoosun-role-flow-handbook.test.mjs`

**边界**：只在包含受控永绅文档的完整 checkout 中显式运行；由 `affected` 在客户资料变化时选择，不进入 Core fast / full / strict 或源码包

### 开发测试固定动作

**典型脚本**：`dev-testing-operation-store.mjs`、`dev-qa-execution-lock.mjs`、`run-gate-with-receipt.mjs`、`yoyoosun-role-jsonrpc-access.mjs`

**边界**：DEV 入口只接受 `fast / role-access / field-linkage` 固定意图；计划只读，三项结果独立，浏览器不能提供命令、参数、路径、环境变量或凭据

### 质量门禁运行与治理

**典型脚本**：`run-gate-with-receipt.mjs`、`run-gate-with-managed-database.mjs`、`dev-quality-gate-operation-store.mjs`、`quality-gate-catalog.mjs`、`../../web/dev-server/devQualityGatePlugin.mjs`

**边界**：DEV 页面只接受 `full / strict` 固定动作；正式 runner 与回执仍是唯一执行和结果真源，托管数据库包装器只负责本机隔离环境生命周期，本地 operation 只保存有界脱敏状态

### 覆盖证据

**典型脚本**：`erp-field-linkage.mjs`、`test-coverage-collect.mjs`、`test-coverage-report.mjs`、`dev-coverage-operation-store.mjs`

**边界**：baseline 只执行明确列出的非数据库本地测试；DEV 入口只接受固定 collect intent，以幂等索引和全局 QA 锁串行执行；业务域只按显式场景 ID 计数，未采集、过期、跳过、阻塞和零执行必须单列，不把历史绿色换算成覆盖率

### 本地开发库迁移

财务中国自然月月结修正的只读差异与异常阻断见 [finance-china-month-end-preflight.sql](finance-china-month-end-preflight.sql)；口径、存量范围及目标执行边界见 [财务账期迁移](../../docs/finance/财务业务与核销.md#中国自然月账期迁移)。

**典型脚本**：`../local-migration-workflow.mjs`、`dev-database-migration-operation-store.mjs`、`../../web/dev-server/devDatabaseMigrationPlugin.mjs`、`../../web/dev-server/devDatabaseMigrationRuntime.mjs`

**边界**：CLI 与 DEV 页面复用登记共享开发库的 status / plan / backup-restore / apply / readback / restart 服务；固定意图、幂等、单执行锁、执行前复核备份、无自动重试，不接受任意目标、命令、SQL 或凭据

### 客户配置与私有化边界

**典型脚本**：`config/customers/index.test.mjs`、`scripts/build/apply-customer-web-config.test.mjs`、`customer-config-boundaries.mjs`、`customer-config-effective-session-probe.mjs`、`customer-package-lint.mjs`、`customer-package-preview-boundary.test.mjs`、`customer-config-runtime-manifest.mjs`、`private-deployment-boundaries.mjs`、`private-deployment-package-closure.test.mjs`

**边界**：只做构建期索引、overlay、lint / preview / manifest 编译、无凭据读回探针和模板边界检查；`boundariesSatisfied` 不等于交付、evidence 或签收完成，不写 Fact

### Workflow / Fact 边界

**典型脚本**：`workflow-fact-boundary.test.mjs`、`workflow-ui-action-boundary.test.mjs`

**边界**：防止协同任务路径越界写入事实层

### 测试数据隔离

**典型脚本**：`test-data-isolation-boundary.mjs`、`local-acceptance-lifecycle.mjs`、`manual-acceptance-dataset.mjs`、`manual-acceptance-dataset-runner.mjs`、`manual-acceptance-page-data-contract.mjs`、`manual-acceptance-catalog.mjs`、`manual-acceptance-account-scenarios.mjs`、`manual-acceptance-source-data.mjs`、`manual-acceptance-task-data.mjs`、`manual-acceptance-fact-data.mjs`、`manual-acceptance-fact-rpc.mjs`、`manual-acceptance-source-driven-facts.mjs`、`manual-acceptance-attachment-data.mjs`、`manual-acceptance-readiness.mjs`、`manual-acceptance-browser.mjs`、`manual-acceptance-source-retire.mjs`

**边界**：Product Core、本地 / 133 同版模拟数据、页面归属、真实导入准备和执行门禁分桶检查；本地完整入口按批建库并自动回收，当前事实只走正式来源驱动 API，旧通用写入器不得回流

### 代码质量和安全

**典型脚本**：`secrets.sh`、`error-codes.sh`、`go-vet.sh`、`govulncheck.sh`、`shellcheck.sh`、`shfmt.sh`、`yamllint.sh`

**边界**：按对应语言 / 配置类型补充检查，不替代业务回归

<a id="quality-gate-guide-sync"></a>

## 门禁图文同步 / Quality Gate Guide Sync

质量门禁的“门禁规则”保留原门禁目录，另提供 Hook 入口、执行流程与测试结构；`?view=governance&guide=hooks|flows|tests|catalog` 定位对应内容。图解释执行代码，不代表 Hook 已启用、计划已执行或检查通过。

| 真源 / 改动 | 同轮同步与验证 |
| --- | --- |
| `.githooks/*`、`scripts/git-hooks/*`、推送准备和回执逻辑 | 核对 `devQualityGateGuide.mjs` 的入口、调用、条件、阻断与恢复说明，以及索引到流程节点和同名测试的关联 |
| affected、full / strict、隔离环境与资源清理 | 修改对应关键 Mermaid 与节点说明；并行、条件、清理结果不能由图补造 |
| CI 编排与覆盖合同 | 核对 `devCiWorkflow.mjs` 及其共用流程来源；保留 GitLab 原生运行结果和 DAG 入口 |
| 测试新增、删除、改名和分组 | 维护 `node-test-groups.mjs` 与正式发现器；工作台只读复用，不手抄文件清单、数量或另造测试执行器 |
| 断言或测试数据调整，但执行流程未变 | 核对说明是否受影响；不机械重画或要求全量门禁 |

1. 先对照当前脚本与同名行为测试，识别本次改变的调用、条件和结果。
2. 在同一轮修改对应图、节点说明、索引与引用；提交、推送、CI 三类证据不合并。中文含义由修改者核对，不自动推导全部代码。
3. 运行相关行为测试与图文合同检查；页面路径变化验证选中节点、返回、搜索分页及失败恢复。图文检查只证明解析、节点和引用一致，不能代替执行测试。

测试结构在打开或刷新时读取当前执行端的正式 Node / Web 测试发现结果与 Go 测试文件路径。未登记、重复登记、已登记但文件缺失分别显示；缺源码目录或读取失败不伪装成零测试通过。文件计数不等于用例数、业务覆盖或已执行数。接口不执行测试、不读源码内容、不接受任意路径或命令，且不建立常驻监听或全量代码解析服务。

## 门禁完整性与 CI 边界

`/__dev/quality-gates` 通过 development-only Bridge 异步调用固定的 full / strict 正式 runner。

若开发服务已有合规的 loopback `DISPOSABLE_DATABASE_BASE_URL`，继续直接使用；未显式登记时，Bridge 会先核对本机 Docker 和固定 `postgres:18.6` 镜像，再由 `run-gate-with-managed-database.mjs` 为本次 operation 创建随机凭据、`127.0.0.1` 动态端口和精确标签的独立容器。

默认 `origin/main` 的 `prepare-push.sh` 不进入该托管生命周期，只签发 `server-ci` 短门禁回执；显式 `--full` 或非标准 remote/ref 需要完整本地门禁时仍使用原受管路径，失败或清理读回不完整即形成终态失败。

浏览器不能提交命令、参数、路径、数据库、镜像、环境变量、Git ref、DSN、凭据或 SSH 目标；服务端固定校验 loopback、same-origin、CSRF、JSON 合同和请求大小，并与 coverage / testing 共用唯一 QA 执行锁。

运行、取消和超时均按精确进程组收口。托管模式只有正式 receipt、门禁内部一次性数据库 cleanup、托管容器删除及不存在读回、进程组消失全部成立时才能标为通过；清理只允许当前 operation 且 repository label 同时匹配的容器，不处理外部容器或监听。浏览器关闭、开发服务中断、进程被强杀或任一清理事件缺失都会 fail closed，不会伪造绿色结果。

页面的最近记录保存在 ignored `output/dev-workbench/quality-gate-operations/**`，每个 profile 只保留最近 20 个已结束 operation；记录不保存日志、DSN、密码、token 或私有路径。

`quality-gate-catalog.mjs` 只登记门禁职责、风险、正式来源引用、证据与退出条件，当前改动映射继续复用 `affected` 真源，阶段与最终结果继续读取同一正式 receipt。

dirty / clean、full / strict 和不同 environment fingerprint 不混算；少于 3 个可比样本时明确报告样本不足，不生成健康分数，也不会自动禁用或删除门禁。

GitLab CI 历史不写入上述本地 operation 目录。

工作台读取当前提交对应的 GitLab Pipeline、原生测试报告摘要及各覆盖率 Job。页面只保留提交、通过/失败、总耗时、首个失败、测试计数与分类覆盖率；完整 DAG、排队、Job 性能与日志直接跳转同一 Pipeline / Job。历史 CI 链接继续保留，本地 operation 不与 GitLab 混算。

`ci-native-reports.mjs` 将同一次执行的结果交给 GitLab，不再次运行测试：Node / resource lanes 和 Web 使用 Node 原生 JUnit reporter；Web 同时采集 LCOV 并转换为仓库相对路径的 Cobertura；Go test 的 JSON 与 coverprofile 分别转换为 JUnit 和 Cobertura。Web 数值是已加载源文件的行覆盖，Go 数值是测试包语句覆盖，分别展示，不视为整仓或业务验收比例。数据库、浏览器与专项发布回执仍走原有门禁合同，JUnit 不替代零 skip、真实执行数、exact SHA 或清理读回。

Node JUnit 保留原生 start/result 名称对应关系，使用仓库相对文件、行号和同名出现序号作为 `classname`，避免重复用例被 GitLab 合并。Web LCOV 路径按实际测试进程的 `web/` 工作目录解析，再转换为仓库相对路径，供 GitLab 对应源码行。回归覆盖嵌套同名、失败、跳过、有效层级和子目录执行；发布验收同时核对 GitLab 实际解析数量及覆盖文件路径，不能仅凭报告上传成功判断接入完成。

产出 Job 的 `artifacts:when:always` 上传原生报告，失败测试仍可查；`coverage` 与 `reports:coverage_report` 分别接入数值和逐行注释，沿用 90 天 CI 制品保留。报告未产生、解析失败、读取失败与制品过期分别显示，旧流水线不会补造报告。关键发布/部署记录及已归档证据继续长期保留。

独立工作台只读这些通用 CI 结果，服务端拒绝新建 full / strict 与本地覆盖基线；本地 Vite 入口保留诊断执行。独立端历史、取消和项目专项入口不删除。

CI 拆分采用 `90 / 120 / 40 / 20` 性能观察线：最近 5 次受保护 `main` 成功流水线中，实质工作 Job 的目标区间为 45–90 秒；中位数超过 90 秒时分析拆分，至少 3 次超过 120 秒时拆分或记录不可拆原因。新子 Job 原则上不少于 40 秒，且拆分应让关键路径至少缩短 20%；汇总 Job 不适用工作下限，但目标不超过 30 秒。

该规则只触发评审，不因单次波动阻断 CI；数据库、端口、Chromium、临时目录、exact SHA、测试完整性和清理回读无法独立时不得为时长数字强拆。

浏览器检查等待 Web 制品、Schema 生成、PostgreSQL 升级和关键数据库检查完成后启动。Schema 生成会由 Atlas 启停 Docker 开发库，升级与关键数据库检查还包含附件集成环境的 Docker 网络创建与清理；这些动作必须先结束，防止同一 Runner 的网络变动中断 Chromium 的 loopback 请求。其余独立检查继续并行。

CI 浏览器场景只执行一次，场景解析与回执校验均拒绝重试成功结果；首个失败直接使浏览器 Job 失败，并保留场景名与实际异常日志，不能先把子任务标绿再由汇总器拒绝。

`node-test-groups.mjs` 将 scripts Node 测试显式登记为 `fast / database / browser / release / resource_sensitive`，新增 tracked 测试未登记、重复登记或路径失效都会阻断。

`fast.sh` 只跑高频组；本地 `full.sh` 保持 shared / Web / server 三路并行，再串行资源敏感、关键 PostgreSQL、browser 和 govulncheck，用于独立诊断。

GitLab 普通 main CI 对外仍固定为 static、Node contracts、Web、Server/PostgreSQL、resource-sensitive、browser 和 security 七类：Node contracts 内部将 `fast + database + browser` 合并为 `core` lane；`production-preflight` 由同一测试源按稳定登记顺序交替分到 `release_preflight_a / b`，其余 release 测试保留慢项锚点并均衡分到 `release_a / b / c`。

每条 lane 都保持 `--test-concurrency=1`，两个 preflight lane 合并后仍要求完整覆盖和 zero-skip。

资源敏感合同把 39 个顶层测试按唯一 registry 和实测耗时均衡分为 `contract_a / b` 与 `runtime_a / b`；每条 lane 内仍串行，跨 lane 才并行，且继续核对一次性容器、file/advisory lock、并发、timeout 和异常清理。

Bootstrap fixture 子进程保留 90 秒硬上限容纳共享 Runner 的进程调度；各场景传入的业务 marker 等待期限不变，子进程超时或启动错误单独报告并失败关闭。

Web 内部把 lint/stylelint/测试与 production build 拆为 `checks` / `build`；Server/PostgreSQL 内部拆为 `schema`、`upgrade`、`test_build` 与 `critical_postgres`，只有需要真实 PostgreSQL 的 upgrade 和 critical lane 各自持有并清理独立数据库，只有 test/build lane 消费 Chromium，只有 schema lane 执行并读回 `make data` 零漂移。

所有 Node/resource/Web/Server 内部 lane 的每个 Job 都按 exact SHA、plan/range、完整清单、zero-skip 和清理读回 fan-in 为唯一 `node.json`、`web.json`、`server.json` / `resource.json`。

Browser 另保留一条场景串行 lane，只读复用同一 SHA 的唯一 Web build digest，并按 pipeline/job/lane 隔离端口、Chromium、临时目录、lock 和输出；场景穷尽/互斥、取消/超时清理及 fan-in 仍只产出规范 `browser.json`。外部七类合同不变。

每个可进入 Core CI 的分组 Node 测试因此恰好归属一次；客户交付文档专项仍只按 affected 或显式入口运行，不进入 Core CI。缺少、重复、额外、身份漂移或新 fixture 残留都会阻断，既存 fixture 现场不会被清理。

每个 strict 阶段仍只归属一个外部分片，聚合后仍要满足完整分类执行数、零 skip、source integrity、`make data`、依赖审计和资源清理读回，不以并行代替覆盖。

Node runner 失败时只在 ignored `output/qa/node-tests/<profile>-latest-failure.json` 写入有上限、已脱敏的结构化失败身份和耗时；不持久化原始 TAP、环境变量、参数、stdout / stderr、DSN、密码或 token，成功重跑会删除同 profile 的旧失败诊断。

GitLab CI 的 Playwright 运行包固定为 `playwright 1.63.0 / Chromium 153.0.8010.12 / revision 1243 / FFmpeg 1011`。

`ci-playwright-runtime.mjs` 只接受三个固定 ZIP 的精确长度与 SHA-256，普通 job 只读取同项目 GitLab Generic Package 中的 `runtime.tar` 并再次校验内层 ZIP；仅当该 package 返回 404 时，protected main 的 push `prepare` job 才能消费一次已由运维 owner 在 CI 外下载、校验并通过受信 SSH 放入精确私有目录的 Runner 本地冷种子。

脚本再次检查当前 uid、真实目录/普通文件、`0700/0600`、精确 inventory、长度和 SHA-256，随后上传 package、读回同一内容，并只删除已完整接受的种子；缺失或歧义不回退到 Runner 公网下载。

Runner cache 只保存已校验的原始 ZIP，不信任已解压目录；需要 Chromium 的 job 在自己的 `output/runtime/gitlab/playwright-$CI_JOB_ID` 解压，校验可执行文件后使用，并在成功或失败时精确清理。不得回退到普通 job 的 live `playwright install`、备用 URL、浮动版本或未校验缓存。

本地 clean 提交需要 exact-SHA 终态时，只使用上表的受管命令；`--exact-sha` 只接受 40 位小写 SHA，`--main-ref` 只接受 `HEAD`，不能混入 full / strict 或任意命令参数。包装器只负责一次性数据库和进程清理，`exact-sha-gate.mjs` 仍是 terminal / receipt 的唯一真源。

失败终态是该 SHA 与 fingerprint 的最终证据，不得删除、覆盖或重试；修复必须产生新提交和新 SHA 后再运行。

`full.sh` 默认拒绝继承的 `STYLE_L1_BASE_URL`，仅在本项目 `15200-15299` AUX 段为本轮选择空闲端口，并只清理自身启动的 Vite 进程。同一 worktree 的浏览器证据使用原子 PID 锁串行运行；活动锁直接阻断，stale lock 也保守失败且保留现场，只能在确认 owner 已不存在且没有门禁运行后手工清理。

外部 base URL 只能用于显式单项 browser smoke，不能替代 full 的当前 worktree 证据。

Server 阶段在唯一临时数据库中从历史 checkpoint 装载合成存量行，验证 055504 / 055825 两项只读 blocker、克重 kg→g 非空/NULL 存量转换和 latest pending=0；关键 PostgreSQL 矩阵使用同一 GitLab Server 分片中的另一座唯一临时库，完成 migration、测试和 fail-closed 清理，不复用固定开发测试库。

Server 阶段还启用真实 Chromium PDF 安全集成，本机自动发现 Chrome/Chromium，CI 则传入本 job 从已校验运行包解压出的精确可执行路径。安全集成未执行会以 Go skip 阻断 full。

fast / full 的固定 Node 与 Go 测试除子进程退出码外，还要求可解析结果、实际执行数大于 0、失败数与跳过数均为 0；缺 summary、零执行或 skip 一律阻断。

GitLab CI 的 Web / Server 测试仍在进程内解析完整 TAP / Go JSON，但 job 只输出有界汇总，避免原始逐测试 trace 超过 GitLab 日志上限；本地 full 保留完整诊断输出。

`populated-upgrade-preflight.sh` 只接受 `populated-upgrade`、`customer-config-cutover` 和 `database-constraints` 三个 audit key，并把 DSN 仅从调用方指定的环境变量传给 `psql`。

第一项检查 20260714055504 的状态、生命周期、取消审计束、流程锚点、版本和待删除时间字段，同时检查 WIP `20260717035245 -> 20260717043625` 委外关联切换：旧列仍有链接时阻断删除，切换后活动外发批次缺少 durable allocation 时也阻断；第二项检查 20260714055825 前必须显式治理的流程运行态与任务配置锚点；第三项在关键数据库约束收紧前只读核对现有约束和存量数据，任何不满足项都 fail closed。

三项都使用 read-only 事务，不能修复或清理生产数据；出现 blocker 后必须停止 apply，由单独评审的治理动作处理，完成后重跑审计。

直接运行 full / strict 时，任何 `SKIP_*`、`STRICT_SKIP_*` 或调用者提供的旧 coverage 变量都会得到 `incomplete` 并失败；full 始终真实执行 secrets 与 govulncheck，不接受普通调用者自签 JSON 作为前序成功证明。

默认单一 `origin/main` 的实际推送地址匹配[项目 GitLab 入口](../lib/gitlab-project.mjs)时，普通 `prepare-push` 签发 `server-ci` 回执：保留聚合范围风险计划、数据库 guard、remote URL、live checks 和 gate-tree 指纹，执行 git-log、严格 secrets 和下述定向 Node 检查。

pre-push hook 在连接后按真实 stdin 重算回执身份与检查清单，再执行 git-log / secrets；同一有效回执覆盖的定向测试不重复运行。其他 remote/ref、多 ref 与显式 `--full` 保持 affected/full 保守合同。

普通新 remote ref 的聚合范围固定为 `empty-tree..HEAD`，仍实际进入 affected / DB guard，不能消费 `server-ci` 回执。

定向检查由 affected 在同一计划中选择：复用现有 fast Node 分组，仅运行受影响的 fast 测试、改动或同名 `web/src/**` 测试；前端源码或 Vite 配置变化时补 DEV 隔离合同，CI 实现、分组、门禁入口或 Runner 配置变化时补 GitLab / Job 说明合同。即使开发期计划升级为 full，短检查清单也保留。

此入口不执行数据库、浏览器、发布或资源敏感分组，不扩大到全部 Web 测试、构建或业务浏览器。检查最多 4 个文件并发，macOS 仍由原生保护固定为单并发；整批截止时间按每个选中文件 2 秒计算，最短 120 秒、最长 300 秒。超时中止本次检查进程组并失败，不自动重试或放行。缺 summary、零执行、失败、skip 或前后源码 / 环境 / 远端范围漂移均不签发回执。清单、并发和截止时间绑定计划、签名与 gate-tree 合同，旧合同回执不能覆盖新增检查。

同一次 `prepare-push` 的远端 ref 读回每次尝试都受 20 秒硬超时约束，只对明确的超时、断连、拒绝连接、网络不可达和临时 DNS 失败做最多两次短间隔重试；权限、仓库、ref、响应合同及其他错误立即失败。三次尝试仍不可读时形成该次调用的终态失败，不补跑同一 SHA 的 affected/full，也不得绕过 pre-push hook。

开发阶段只跑 affected、同名测试和受影响单链浏览器。用户明确授权推送但未指定远端时，只准备并推送 GitLab `origin/main`；GitHub `main` 只接受 GitLab protected-main 的同 SHA mirror，不从本地直接更新，也不运行仓库 CI。

所有 writer 收口且 clean `main` 只做必要的 fast-forward-only 上游同步后，用普通 `prepare-push` 签发 `server-ci` 短门禁回执，高成本 affected/full/strict 由 GitLab CI 对推送后的 exact SHA 执行。

GitLab `CI Gate` 成功并确认 GitHub main 镜像到同一 SHA 后，GPT 才按目标提交范围做事后审查；有效 finding 回到仓库形成新候选。显式本地 `--full` 仍可用于独立诊断，非标准目标继续保守执行本地计划。只有影响生产正确性、安全、数据完整性、权限或可恢复发布的缺陷才允许改候选并重新进入 affected。

fixture、mock、选择器、测试文案、开发工作台或证据展示问题若不使生产结论失效，记录为后续事项，不扩展当前 QA 或重新跑全套。真实 CI / 目标阻塞只报告精确阻塞、清理状态和回滚点，不再新造一层门禁。

普通 main push 按真实文件路径选择验证范围，不依赖提交消息。路径规则由 `ci-plan.mjs` 的 `CI_FULL_CHANGE_PATTERNS` 与 workflow 同步测试守住；plan 再从 Git 范围独立复核，包含文件类型变化和改名两端。`CI Gate` 按入口依赖文档 Job、MR Job 或完整汇总。文档和 MR 必须读回对应 Job 成功后写入 `output/ci/checks/` 的本次流水线、SHA 和计划摘要；缺失或不匹配就失败。

| 实际改动 / 触发 | 执行范围 | 通过后能证明什么 |
| --- | --- | --- |
| 仅普通小写 `.md` 文档，含 `progress.md` 与客户交付矩阵 | `plan → quality_docs → CI Gate`，3 个 Job | diff/log、可信基线 secrets、文档登记 / 链接 / 命名及命中的 Skill / 客户资料边界；不产生 strict 或发布证据 |
| 任意非 Markdown、混合改动、未知扩展名或 `server/docs/database/**/*` 生成数据字典 | 原完整 DAG，当前 28 个 Job | 七类分片、聚合与 exact-SHA strict 证据包；仍不证明目标部署 |
| 首次 push（before SHA 为零） | 完整 CI | 避免未知基线被归入轻量检查 |
| 受保护 main 的手动流水线，`QA_MODE=full` | 同一 SHA 的完整 CI | 与完整 push CI 相同的覆盖和证据，provenance 保留真实 `web` 来源 |

历史密钥扫描和路径计划使用不同范围。受保护 main 的普通 push、文档 push 与手动 full 都从[已审计的固定检查点](ci-history-scan.mjs)扫描到本次 SHA；前一条流水线失败或被取消时，中间提交仍在扫描范围内。MR 使用可信 diff base。扫描只读取 Git 对象与基线的 `.gitleaks.toml`、`.gitleaksignore`，不接受候选的忽略文件或行内放行；`trust.json` 记录扫描范围、规则对象和工具版本，完整汇总按 Git 对象重新核对。推进检查点前，需用同样的 Gitleaks 版本与规则对新检查点的完整可达历史做脱敏扫描并保留成功证据。

文档 Job 只从 pnpm store 的只读缓存安装锁定依赖，用于客户文档的 Mermaid / DOM 语法检查；不执行 Web 构建或浏览器，也不需要 Go / Docker / Atlas / Chromium。MR 文档计划同样显式声明该依赖。生成数据字典仍走 full，因为其零漂移检查需要 Go 生成器。

文档检查通过在工作台显示为“文档检查已通过”，不提升 `releaseEligible`；工作台与发布复用读取 `ci-quality-shard.mjs` 的同一份完整 Job 清单，不能只凭 Pipeline 绿色或 `CI Gate` 名称判定可发布。

需要发布已经推送的纯文档 SHA 时，在 GitLab **Build → Pipelines → New pipeline** 选择 `main`，添加变量 `QA_MODE=full`；确认所选 main SHA 与目标一致后运行，等待完整 `CI Gate` 上传证据，再进入既有发布入口。

也可以在第一次推送时显式使用 `git push -o ci.variable=QA_MODE=full origin main`。手动 full 不制造空提交，不借用其他 SHA 证据；普通 API / trigger / schedule 或 MR 绿色不能替代完整 protected-main CI。

GitLab Runner 工具链读取 `.n-node-version`、`web/package.json#packageManager` 和 `server/go.mod`。

`.gitlab-ci.yml` 的唯一 cache writer 是 `prepare`；它在下载或写入 cache 前先核对 Chromium sandbox 清理 helper 的 root 身份、mode 和当前 job 的精确无交互 sudo policy。

六条 Node 内部 lane、Node fan-in 与 Web 分片只从同一 pnpm store 离线安装精确锁定的 Web 依赖，不写 cache；四条 resource 内部 lane 不消费该缓存。

Server test/build 只消费 Playwright ZIP，不恢复未使用的 pnpm store；Browser lane 同时消费 pnpm store 与同 key 的 Playwright ZIP。其他 Server/PostgreSQL 分片与 aggregate 不重复下载、解压无用缓存。

Go 运行与包编译并发由 workflow 统一限制为 4；govulncheck 保留完整符号分析与独立堆预算。Browser lane 只读消费 `quality_web_build` 的同一 digest；动态 PostgreSQL 端口、job 唯一 Chromium sandbox、浏览器锁与输出目录都按 pipeline/job/lane 隔离。

main 完整 CI 聚合后的 exact-SHA terminal 绑定 repository、40 位 SHA、source archive、policy / workflow / toolchain / migration / lock / 客户配置指纹、分类执行数和真实 `gitlab-ci` push / web provenance，`CI Gate` 再将 terminal、receipt 和 manifest 固化到 exact pipeline/job/SHA 的 Generic Package。

release 只接受 `CI_COMMIT_SHA == RELEASE_SHA` 的 protected main，服务器端回读该普通 CI 证据而不重跑 strict；同 SHA 候选制品只构建一次，以 `candidate.tar` 冻结后复用同一 bytes 做 migration、health/ready、smoke、备份恢复和重启演练，最后生成含同一 `release-rehearsal.json` 的 七项制品的 GitLab Release。

GitLab 发布、部署和回滚统一核验现行七项制品。安装缓存复用已校验的依赖，checksum、依赖合同和门禁仍按原入口执行。

`db-guard` 仍只是提前阻断的静态启发式，不能替代 Ent / Atlas 零漂移、冻结树 fresh / upgrade 验证或目标环境 evidence。

仓库内 workflow 只能证明 CI 定义存在。本地 hook 可被 `--no-verify` 绕过；GitLab protected branch、required `CI Gate`、protected variables/environment、Runner locked/tags 和 GitHub push mirror 是否启用必须另取远端设置证据，不能用本地 full / strict 或 workflow 文件存在来替代。

## 输出与写入边界

业务链定向规则检查复用工作台步骤关联和唯一关键规则目录，适用于当前所有已登记链路，不重新登记用例：

```bash
# 只读选测计划
node scripts/qa/business-chain-rule-check.mjs --chain purchase_to_inventory
# 运行关联的后端单元 / SQLite 合同用例并保存链路报告
node scripts/qa/business-chain-rule-check.mjs --chain purchase_to_inventory --run
```

每个命令按精确包名与顶层测试名核对 run / pass / fail / skip 和父终态；源码前后指纹变化、零执行、缺用例、异常退出或跳过均失败。每轮独立写入 `output/qa/business-chain-audit/<batch>/`，保留 `report.json`、冻结图定义、`go-test.json`、`test-results.json`、命令退出结果及 SHA-256 清单，现有工作台按批次只读展示。该入口不连接共享业务库，也不代跑 PostgreSQL / 浏览器门禁；单层通过的交接仍标为未证明，完整链路、真实数据库和客户验收证据分别取得。运行及输出上限固定，后台不驻留；未登记具名规则的动作阻断业务链目录构建。

工作台的“运行本链规则检查”经现有固定 QA 接口提交 `chain-rules` 与 `chainKey`，与其他 QA 共用互斥和操作回执；同一幂等标识不能改为另一条链。服务端从正式目录选测，并用 `--batch rules-<operation-id>` 固定输出批次，不覆盖旧批次。进程退出成功后仍须读回摘要清单、非零具名执行数和完整工作区身份，才能标记该次后端规则检查通过；链路报告里的未执行层级继续保持未证明。

历史数据库报告按原登记集校验计数与唯一标识；当前报告必须覆盖当前全部登记项。历史中缺少当前新增用例时显示未验证，不补造通过，也不把合法历史记录误报为损坏。


采购链 PostgreSQL 与桌面岗位实测使用同一隔离运行器：

```bash
node scripts/qa/transaction-browser-isolated.mjs --run --purchase-chain --out output/qa/purchase-chain-e2e/<run>
```

该范围以正式 API 准备模拟主数据和采购草稿，由采购、老板、仓库、品质、财务五个真实岗位的浏览器完成保存、提交、审批、清点收货、逐行 IQC、入库、应付草稿与过账。记录同一来源订单、收货单、批次和应付的数据库读回，覆盖质检不入账、审批不写事实、应付草稿与过账分离、权限拒绝、响应丢失恢复和幂等重放。它不证明手机、用料自动生成采购或审批拒绝分支已执行。

来源权限场景复用上述隔离批次：验证仓库、品质返回保留来源与数量但无采购价格；通过正式角色设置接口临时收回品质的收货读取和财务的退货读取，核对窗口关闭、动作隐藏、缺权提示、后端拒绝且事实不变，并恢复原权限、验证重新打开无残值。权限设置只作用于该一次性数据库，截图与逐请求记录随采购链报告保存。

同批次还执行 `purchase-related-source-permissions-browser.mjs` 的四条关联入口：从入库单生成退货、登记入库调整、已入库追加检验不合格生成退货、首次来料不合格生成处置。逐条收回本岗办理和来源读取权限，验证关闭清空、缺权提示、后端拒绝且数据库不变；保留旧会话实测提交被拒绝后的清理，再恢复权限通过真实页面生成草稿。两类质检入口额外延迟真实历史读取，确认撤权后请求取消且响应不会回填。辅助来源由正式 API 准备，草稿生成不增加库存或应付；后续处置确认、过账和冲正不包含在四条导入结果中。

工作台批次同时包含主采购链、采购过账纠正、首次来料不合格处置三个链路的逐步结果；`source-permission-checklist.md` 由本轮浏览器结果生成，列出四条入口的菜单位置、前置条件和通过项。截图、原始请求读回与清单均进入批次 SHA-256 清单，可通过“业务链路实测”下载。任一路径缺少撤权、拒绝、恢复、成功请求或数据库草稿读回时拒绝发布通过证据。

来源查询与权限刷新引起的桌面待办角标取消复用请求协调器，浏览器证据逐请求核对只读方法、请求标识和取消生命周期；写入中断、无对应取消记录及真实网络错误仍判失败。

链路实测报告在开发服务中通过 Vite 按需加载当前定义及其依赖；修改来源合同后重新读取报告即可比较最新定义，不使用服务启动时的旧模块缓存，也不改写历史执行结果。当前定义读取失败时报告接口明确失败。

数据库执行复用 `disposable-database-runner.mjs` 的 `purchase-chain-postgres` 工作流，仅允许 `ci` 一次性数据库；从采购链规则目录选取精确 PostgreSQL 用例，父测试缺失、失败、跳过、零执行及源码漂移均拒绝。原始日志和 lifecycle 写入既有 `output/dev-workbench/database/`，工作台显示“采购链定向”，未执行用例保持缺失；完整 `critical-postgres` 门禁仍独立保留。

浏览器、PostgreSQL、日志关联与资源清理全部通过后，自动将冻结的步骤、原始日志、4K 截图与 SHA-256 清单发布到既有 `output/qa/business-chain-audit/purchase-e2e-<run>/`。报告逐步保留未执行分支，不把主路径通过扩大成所有采购分支或客户验收。若只需重新投影已通过且未改动的原始批次，可用 `node scripts/qa/purchase-chain-evidence.mjs --from output/qa/purchase-chain-e2e/<run>`；同名批次不可覆盖，失败或清理不完整时拒绝发布。

库存、质检、生产、出货和收付款专项入口为 `transaction-browser-isolated.mjs`；不带参数仅显示帮助，`--run` 每次建立新环境，`--out output/qa/<目录>` 可指定本轮证据目录。

订单到结清与皮套异常返工的连续案例使用同一隔离入口：

```bash
node scripts/qa/transaction-browser-isolated.mjs --run --fulfillment-chains --out output/qa/fulfillment-chains/<run>
```

两张合成订单各 2 件，分别走正常生产、皮套不合格后本厂原岗位整批返工；每单连续关联接单、BOM、工程需料生成采购、来料质检入库、裁片委外、车缝、手工、成品入库与三道检验、包装、财务放行、实际出货及应收、材料应付、加工应付三笔结清。所有业务写入经真实岗位 API，SQL 只读核对来源、数量、库存流水与核销；桌面浏览器核对订单、生产、出货、应收和异常终态，不等同逐按钮全程浏览器验收。提前生成应收、质检与库存分离、任务与过账分离、返工原证据保留、执行与核销重放均有显式断言。准备器创建的独立采购草稿不计入案例来源。

运行器沿用源码快照、专属数据库与存储、认证代理、PostgreSQL 与日志 / Trace 门禁、8 分钟场景和 15 分钟整轮上限及资源清理。全部通过后，将中文 `report.md`、冻结业务链、逐请求和数据库读回、原始测试事件、4K 终态截图及 SHA-256 清单写入现有 `output/qa/business-chain-audit/fulfillment-e2e-<run>/`，由“业务链路实测”按批次查看。清理失败、证据摘要不符、零执行或跳过不得发布成功报告；同名批次不可覆盖。

该范围只证明上述两条路径；部分交付、首款 / 预付、退货、退款、冲正、开票、换厂、重做、报废、让步、其他路线、多币种、并发容量、手机、打印和客户验收仍须分别取证。完整链路目录的未执行分支继续显示未执行，不以两案例通过将整张业务链标绿；订单生命周期与财务事实的 `SETTLED` 分别读取。

在同一批次保留两条主路径并补齐其余条件交接，使用：

```bash
node scripts/qa/transaction-browser-isolated.mjs --run --fulfillment-branches --out output/qa/fulfillment-branches/<run>
```

该范围再执行 8 个独立案例：现有成品预留与释放、销售及采购审批拒绝、人工采购与 IQC 纠正、普通委外回货及应付、出货财务拒绝与已出货撤销、首款退款及部分核销 / 冲正 / 红冲、超领批准额度与后续实际领料、生产异常拒绝 / 取消及报废。每个已登记交接须有本轮请求和来源读回，不能拼接历史批次；执行后复查原两单仍结清。补充财务及出货所需期初成品经受控库存调整与独立审批构造，不作为生产完工证据。拒绝、冲正和反向红冲按预期恢复余额或终止，不能统一套用“全部结清”。

完整批次输出到 `output/qa/business-chain-audit/fulfillment-branches-e2e-<run>/`，复用同一报告页、源码冻结、迁移、PostgreSQL、日志 / Trace、时间预算与资源清理。它证明所列 68 个交接的具体案例，不等于所有权限、参数、工艺、并发、手机、打印、开票或客户验收都已覆盖。普通委外按实际合同先回货过账，再创建质检草稿，提交检验时冻结批次，合格后解除冻结且不重复入账；原始红冲记录保留，通过新增反向记录恢复余额。

`--production-recovery` 定向验证生产跨链领料与短关闭补排：仓库分别先过账普通领料、先过账委外发料，另一条链超额时页面须明确拒绝且库存不变；通过正式 API 冲正后，再由浏览器重试过账。PMC 分别关闭零完工和部分完工的生产单，按释放数量创建并发布补排单，回读新在制批次；超额补排不得落库。部分完工前置沿用真实生产、工序质检与入库页面，其他模拟来源与排产待办通过现有正式 API 准备。该范围保留运行身份、真实代理、PostgreSQL、日志关联与资源清理门禁，截图为 1920×1080 视口、DPR 2；不代表手机、其他交易分支或客户签收。

`--source-orders` 单独选择接单、采购和委外的桌面 / 手机真实链路，仍运行相同的 PostgreSQL 与日志 / Trace 门禁；该范围不代表其他交易链路、字段页面或打印通过。

`--receiving` 单独选择第 5/6 环节到货点数与材料入库、采购退货异常分支，以及第 8/9 环节相关的委外回货质检；覆盖桌面和手机真实页面、分包差异、权限拒绝、响应丢失重试、退货冲正和复检证据，同样运行 PostgreSQL 与日志 / Trace 门禁，不代表其他浏览器或打印链路通过。默认范围保留原交易与打印链路，并追加源单和到货退货质检验证。

使用仓库锁定的 Node、已安装的 Web 依赖与 Chromium、本机 Go / Atlas / psql，以及已缓存的 `postgres:18.6` 和 `chrislusf/seaweedfs:4.46`；不自动拉取镜像。数据库运行身份与前端代理的认证读回均通过后，才操作页面；正常请求使用 Vite 的真实代理，故障注入仅在后端已成功处理后丢弃响应，不伪造业务返回。

业务夹具走正式 seed、API、审批与岗位范围设置，数据库查询使用只读会话。

`--desktop-variants` 定向验证电脑端采购及委外合同预付款、车缝 / 手工委外执行和皮套不合格处置；委外分支同时验证手机任务内的工序办理。它复用相同的隔离资源、运行身份、认证代理、PostgreSQL 与日志门禁，浏览器上限 8 分钟、整个隔离运行上限 15 分钟。完整 PostgreSQL 家族含 HTTP 接入用例，单阶段上限 10 分钟；整轮硬上限仍生效。

`advance` 分支还验证财务岗位按币种 / 用途筛选与全分页汇总、期间对账及 CSV 导出、收付款回单附件上传 / 撤销审计和重复凭据提示。全部数据为一次性模拟业务；期间对账按入账时点统计，不作为客户财务 UAT 或外部银行对账证据。

排障可用 `--desktop-case advance|outsourcing|shell` 只执行对应浏览器分支，默认 `all` 执行三类；各分支仍必须通过两组新增 PostgreSQL 回滚用例，窄范围不代表其他浏览器分支已通过。 `outsourcing` 分支通过正式 API 准备已入库材料，桌面浏览器覆盖车缝 / 手工工序入口、回货重试、验收、合同正常关闭和生成合同应付；手机覆盖从加工合同任务定位准确批次、回货重试、检验与入库，并阻断选择其他订单来源。手机跳转始终留在任务办理，未验证手机合同关闭或生成应付。独立盘点流程保留在完整分支中。

采购和委外分别核对 `ADVANCE` 的来源、金额、审批与过账分离、丢失响应恢复、幂等及冲销；委外按冻结产品规格、工序、单位和整批数量关联正式合同；皮套按让步、报废、原厂返工、换厂返工和补料重做分别保留原检验、审批、实际执行及冲正证据。原图及原始报告保存于 `browser/desktop-variants/**`。

 生产异常详情的正常取消必须匹配精确只读接口、请求、执行上下文与最新读取生命周期；独立负例要求无来源 `ERR_ABORTED` 显示错误并经真实刷新恢复，写请求、HTTP错误或无效来源仍失败。上游已确认合同和模拟厂商通过正式 API 准备，受测业务动作由真实页面发起；不将夹具准备描述为客户事实或浏览器验收。

完整范围主交易批次上限为 12 分钟，整个隔离运行上限为 25 分钟；接单或到货窄范围分别保持 8 分钟批次与 15 分钟总上限。预算覆盖真实任务入口、来源权限读取、业务办理与截图等步骤，不改变任何单步业务等待、数量 / 账本 / 权限断言或失败清理；实际预算记录在 `lifecycle.json.budget`，超时仍使整轮失败。

 前端辅助端口在实际启动前分配；后端和 Vite 均复用平台端口表回读本轮确切 PID 的监听端口，再校验认证代理身份；macOS 使用既有原生 socket 表，读取异常或出现其他 PID 仍使运行失败。其他进程页面可达不能作为本轮服务就绪证据。

接单、采购和委外通过 `transaction-source-orders-browser.mjs` 验证：浏览器打开真实草稿后，另一次正式保存造成版本冲突，页面保留未保存内容且不得覆盖；真实保存和流程提交成功后丢弃响应，再核对数据库唯一结果及重新打开后的回显。

审批覆盖必填原因、越权拒绝、阻塞、解除阻塞、通过与退回，核对源单、行和流程的终态；委外合同覆盖提交、确认、未履行时正常关闭被拒、取消和终态保护。同键重放必须返回原结果，同一源单和操作范围内，同键改变流程关联意图或源版本必须拒绝。单据和任务操作前后比较库存、采购入库、委外事实、质检、财务及出货内容摘要，防止协同审批代写事实。

证据保存在 `browser/source-orders/**`，对应 PostgreSQL 聚合中途失败、事务回滚与原版本重试测试纳入现有 `TestSourceDocumentPostgres` 门禁。

来源单据编制、工程用料准备和重提在电脑执行，手机样本先确认没有来源编制入口；报告区分编制端与审批端。用料审批覆盖两端的老板退回必填原因、审批顺序与越权拒绝，过期来源和重提仍执行正式后端守卫；财务审批真实成功后丢弃响应，重开与重放只能读到唯一生成的采购单。采购单必须关联该用料汇总及供应商，材料、单位和数量与审核结果一致，单价与金额保持待采购填写。响应丢失的保存、提交和财务审批请求同样必须匹配唯一的完成日志及 Trace，不因浏览器未收到响应而漏验。

真实 PDF 验证要求本机 `pdfinfo`、`pdffonts` 和 `pdftotext`，默认范围在启动隔离资源前检查工具。文本型业务夹具的每一页都必须非空，同时核对 A4、字体嵌入、中文提取及编辑控件隔离；下载和全文有内容不能代替逐页检查。`--source-orders`、`--receiving` 和 `--desktop-variants` 不执行打印，不要求这三个工具。

该专项保留 IQC 不合格与复检、采购入库、库存盘点过账和取消、应收应付结算、订单预收预付、客户与供应商的部分和全额退款，以及审批与资金事实分离、响应丢失恢复、幂等重放、越权拒绝、超额阻断和冲销后的余额断言。

手机入库完成后先验证批次查询与只读限制。盘点草稿、过账及取消由电脑浏览器执行，并验证响应丢失重试与独立复核。手机打开该作业的待办，确认显示电脑办理提示、没有过账入口且任务和库存不变；不从已办入库任务发起新的盘点。

采购退货分别使用电脑和手机已入库的来源样本，但退货登记、过账和取消均从电脑单据执行；手机来源样本先核对已办入库任务没有新增退货或再次入库入口。报告的来源端与实际操作端分别记录，不能将手机来源样本记为手机退货能力。

分包收货的点数、逐行质检和部分入库按两端分别办理；拒收处置与后续补价从电脑执行，应付金额通过正式 API 与数据库读回核对。报告显式标记这三项操作的端和证据类型，仍须逐项验证未入库数量、冻结到货快照、补价重试与唯一应付金额。

生产与出货另以独立 SKU 验证 PMC 创建发布、仓库委外发料、裁片回仓及检验、车缝及皮套检验、手工完工、仓库正式成品入库、成品 / 针检 / 抽检、业务确认包材、仓库包装、出货财务审批、实际出货和撤销恢复。正式入库后依次核对待检、待包装和可发货数量；待检时移交包装必须被拒绝，工序与质检重放不得重复扣料或入库，财务放行不得提前出库。

生产计划统一由电脑编制和发布；手机场景先核对任务中没有跨单据新建生产计划入口，再使用该计划完成现场工序与质检。报告明确计划准备端和后续工序实际办理端。

出货草稿编制与提交审批由电脑执行，手机先验证没有从来源单据新建出货的入口。手机实际出货完成后核对已办任务的只读边界；撤销已出货从电脑单据执行并核对反向流水，报告分别记录编制、提交、审批、执行与撤销的实际界面。

收付款回归分别核对审批、执行交接和事实入账；交接完成仍须验证款项未过账，事实动作须依据同来源流程中的待执行节点。登记、执行交接、核销入账、退款申请和冲销在电脑执行，手机单独验证老板审批、财务待办的电脑办理提示及已办只读。报告分别记录登记、审批、入账与冲销的实际界面，并拒绝把电脑操作计为手机覆盖。

样品、工程用料审批、加工合同和模拟来源跟进任务通过正式 API 准备，生产和出货主动作由浏览器完成。每个采购场景使用独立材料，并保留正式单位、库存分类、默认仓库及供应商关系，避免桌面与手机样本互相改写供应商绑定。编制草稿不计为手机现场办理；实际出货进入后端生成的出货任务。应收结算链路仍通过盘点与出货 API 独立准备来源，避免与生产回归共享库存。

字段核对复用同一隔离环境：先检查生成数据字典零漂移，再保存真实 PostgreSQL 的应用表、列、约束和索引，并逐列比对生成字典的列名、物理类型和可空性。普通 Ent `Size` / `MaxLen` 不等于数据库 `varchar(n)`，显式数据库长度、精度和可空性必须严格匹配。

应用表映射到服务端 17 环节目录；14 个关联页面和 6 个新建表单保存 DOM 表头 / 字段、盒模型及原生 3840×2160 截图（1920×1080 视口，DPR 2）。交易完成后再验证质检和收付款的默认列、开启可选列、刷新保存结果、恢复默认、详情及完整 CSV 导出。

字段证据分别保存为 `browser/field-audit/**` 和 `browser/field-results/**`；机械表结构盘点不等于所有字段都已逐一做删除迁移评审。

共享列表、筛选与打印由同一环境中的 `transaction-shared-surfaces-browser.mjs` 继续验证：质检类型切换与恢复默认采购来料、收款及付款方向实际请求后端，逐条匹配数据库记录与可见行，并恢复筛选。

采购合同、委外加工合同和作业指导书、BOM 三套工程资料从对应列表选中来源后带值打开；这些入口与五套正式模板的独立新样例分别下载真实后端 PDF，核对来源、正文快照、响应与下载字节一致、编辑提示未进入正文，并保存原生 4K 截图。新样例不得残留前面业务来源的编号。

产品作业指导书使用正式采购 API 创建的隔离模拟草稿，先确认准备过程未过账其他事实；材料合同则必须说明不适用、不打开空白窗口、不请求 PDF。下载证据绑定浏览器实际消费的 HTTP Blob 和对象 URL，逐份核对文件头、字节数、SHA-256 及服务端 request / trace / span ID，不将并发预热的首个响应当作下载。

该专项在操作前后比较 17 环节所关联事实和来源表的内容摘要，确认筛选与打印未改写业务，关闭本轮创建的打印窗口；结果保存在 `browser/shared-surfaces/**`。打印服务沿用现有 Chromium 解析与请求期限，浏览器页面级的留白定位、批量选择、分页和焦点仍由相关 Style L1 场景补充，不能用 RPC fixture PDF 替代真实输出。

手机回归使用 Chromium 的 390×844 触摸视口，进入 `/m/:roleKey/tasks` 和正式业务办理路由，实际完成审批、处理回执和上述业务表单，并检查页面横向溢出。同一任务页切换来源时通过返回控件办理，避免重新加载恢复已关闭的聚焦表单；提交使用手机底部操作区。质检更正桌面通过页面办理，手机通过正式 API 准备复检，判定均由浏览器完成。

`browser/report.json` 保存各链路、手机任务、工序和真实出货来源结果，`postgres.jsonl` 保存真实数据库测试事件，`lifecycle.json` 绑定源码身份、镜像、迁移和清理结果；共享工作区后续变化不会覆盖快照身份。它不证明手机真机 / Safari、存量数据库升级或客户验收全部完成。

请求观测复用现有服务端组件：按响应 `X-Request-Id` 核对正常、拒绝和丢失响应请求的唯一完成日志、method、code 与 outcome，并扫描本轮凭据泄漏；报告只保留关联计数与受控字段。`observability.jsonl` 保存现有 Go 日志、Trace 父子关系、异常分类、SQL 脱敏和审计 request ID 合同的实际结果。隔离服务不向共享 Jaeger 导出 Trace，不把合同测试写成目标平台已收到 Trace。

浏览器待处理 RPC 以 Chromium 网络协议的开始、完成和失败事件为准，完成数量必须等于收集的业务响应数量，不把取消的读取记成业务成功。

可解释取消的查询与作用域，以 `transaction-browser-cancellation.mjs` 的 `readOwners` 精确映射为准；同名测试覆盖正常取消、身份不符、真实失败和写入误判，不按方法名前缀放行。

原始 `canceled=true`、`net::ERR_ABORTED` 只有在请求 ID、domain / method、frame、loader 与实际页面生命周期证据一致时，才能单独计入 `navigationAborted` 或 `scopeAborted`。文档取消须有该读取的离页事件及新 loader；组件取消须有所属读取作用域的原生 `AbortError` 原因及合法代次。

质检关联的批次、材料、产品与收货单读取复用最新请求协调器；切换对象、权限范围或刷新后，旧结果不得回填。取消只统计为带准确来源证据的读取终止，不计业务成功；对应写入、无原因中断和 HTTP 错误仍失败。

Chromium 整页切换可能不发送网络终止事件，此时还必须收到旧执行上下文的原生销毁事件、匹配离页时仍在进行的读取和新 loader，单列文档取消，并明确保存 `terminalEvidence`，不伪造 `ERR_ABORTED`。迟到的网络成功或失败仍按原请求身份覆盖文档销毁分类。

只有新地址、loader、组件卸载或方法名称均不能代替这组证据；已先失败或读完、HTTP 错误、无证据取消、未知查询和写请求仍阻断。原始事件、分类和业务响应分别保留；有界历史之外仍须逐条完成计数核对。

默认批次的 `transaction-request-cancellation-browser.mjs` 使用真实来源和后端响应，验证桌面新搜索取代列表 / 详情读取、文档重载，以及 390px / 320px 手机返回任务列表时释放权限读取。

它另对当前页面的销售读取和手机权限读取各注入一次浏览器中断，要求报告保留唯一异常、页面显示必要提示、重试恢复且源单 / 事实内容不变；这些定向负例独立保存在 `requestCancellation.cases`，不会豁免主交易批次的异常。该脚本的合同测试拒绝缺场景、零执行、隐藏异常、未恢复或窄屏溢出的报告。

移动 Workflow 和采购入库真实写入浏览器脚本使用 `browser-write-target.mjs` 复核明确提供的开发 / 隔离数据库身份，并将浏览器 RPC 绑定到该后端。前端与后端均限定 loopback HTTP(S)，不通过页面代理猜测写入目标。

移动脚本必须传入 `--accept-persistent-test-data --database-name <库名>`（也可使用同名 `MOBILE_WORKFLOW_BROWSER_SMOKE_*` 环境变量）；采购入库脚本须提供 `PURCHASE_RECEIPT_E2E_DATABASE_NAME` 和现有持久测试数据确认。

采购脚本附带 seed 时还须显式提供同库的 `POSTGRES_DSN`。远程试用沿用登记的 manual acceptance 目标流程。

数据库归档清理要求一小时内、服务器匹配的完整 inventory；执行前重新扫描当前仓库引用，扫描失败或出现引用均拒绝删除。清理工具不会仅凭旧清单的空引用执行删除。

- 脱敏报告和模拟 evidence 默认写到 `output/**` 或调用方显式指定的 ignored 目录。
- 覆盖报告固定留在 `output/qa/coverage/**`，不得放入 `web/public/**`、生产构建或长期 Markdown。

  DEV 接口分别通过固定 GET `/__dev/api/qa/coverage` 和 `/__dev/api/qa/coverage/snapshot` 读取当前工作区与隔离报告；POST 只接受固定 `collect + idempotencyKey`，拒绝调用方命令、参数、路径、环境变量、profile 和 query。

  访问沿用开发工作台网络及运维身份边界，执行动作另需同源与本次 DEV 会话 CSRF token。
- 覆盖基线操作状态固定留在私有 ignored 目录 `output/dev-workbench/coverage-operations/**`；开发测试固定动作状态留在 `output/dev-workbench/testing-operations/**`。两者只公开脱敏阶段投影，不保存或返回 stdout、stderr、PID、命令、幂等 key、环境变量或凭据。

  同 key 重试复用同一操作，且共同使用 `output/dev-workbench/qa-execution.lock`；覆盖基线、fast、岗位巡检和字段联动同一时间只能有一项运行，避免争用仓库身份和 canonical evidence。
- 数据库迁移操作状态固定留在私有 ignored 目录 `output/dev-workbench/database-migration-operations/**`，备份恢复制品固定留在 `output/dev-workbench/database-migration-backups/**`。

  公开 operation 不返回底层目标 / apply / 维护确认值、PID、命令、DSN 或真实路径；CLI 与页面执行器只允许登记共享开发库，使用幂等索引和跨进程排他锁，同一计划只 apply 一次，并在 apply 前重新验证准备阶段的备份文件身份。

  进程中断或提交结果不明确时先读回而不自动重试；非交互 prepare 的 exit 0 只表示 `ready / writes=0`，execute 读回通过才表示迁移完成。
- baseline 采集器先冻结仓库 identity 与 `affected` 层级，使用仓库锁定的 Node 与 pnpm，先以 `node scripts/gen-error-codes.mjs --check` 证明错误码生成物无漂移，再直接用项目 Node 执行 Web native coverage，统计只包含当前仓库路径下的代码并保留 node_modules 排除，不把外部工具链或临时 fixture 计入项目覆盖率；这些过滤只影响统计，不减少测试执行。

  这样也避免 `pnpm test` 的 `pretest` 在采集中改写 tracked 文件。完成 Go / Web / import / field-linkage 后再次核对同一 identity 并自动聚合；字段联动 runner 也先在同目录 staging 生成 TAP 与报告，只有测试、builder 和身份复核均通过才最后提升 canonical 报告，失败时保留上一份。

  baseline evidence 和 candidate latest 同样先写 `output/qa/coverage/.staging/<uuid>/**`，候选 schema / repository / staging 泄漏检查和读回通过后，才按 evidence、字段联动和 latest 的顺序提升；latest 提升后的 identity 复核失败会恢复旧 latest。

  它不写 PostgreSQL、不运行真实业务浏览器、不探测 readiness、不部署、不做 UAT。受影响但未执行的层级必须保留 `missing`，只有未受影响层可写 `not_applicable`。
- 采集进程完成且仓库身份一致时，退出码 `0` 记为 `passed`，测试存在失败、缺失或零执行的退出码 `2` 记为 `issues` 并发布当前失败报告，避免旧绿色遮蔽当前结果；启动失败、进程/服务中断、报告读回失败或身份变化记为 `failed / not_proven`，不得替换上一份可读报告。当前版本不提供取消按钮，避免固定制品写到一半形成含糊终态；页面离开只停止轮询，不停止后台任务。
- Go 业务域与字段联动打印域使用脚本内显式 `scenario id -> package/test prefix`、`caseId` 注册表；不得以测试名、目录、退出码或文件数量推断领域完成。字段联动已声明的不适用场景排除出适用分母，不能计为执行或通过；缺失、失败、跳过和零执行仍分别报告。通用 full / strict 回执不能拆成 PostgreSQL、浏览器或目标验收通过。
- “证据与覆盖”保留两个独立来源：当前工作区按实时 commit / dirty / fingerprint 判定新鲜度，最近隔离验证保留原源码身份并始终标为 `snapshot`。默认展示当前工作区；当前报告缺失时明确显示尚未验证，历史隔离结果必须主动切换查看。两类读取独立失败，重新读取和快速切换会丢弃已取消或过期响应。

  Go 执行数按最末级用例去重，父用例独立失败、跳过或未结束时单列；本域场景全部通过但整体 Go 基线未通过时标为受阻，场景自身的失败、缺失和跳过保留，整体门禁继续阻断。Go / Web 执行计数、业务规则、失败用例与数据库 / 浏览器场景可分别展开，支持“仅看未通过场景”。专项通过不补成完整 gate、真实前后端闭环、exact-SHA CI 或 UAT 通过；来源的范围说明必须随结果保留。

Web 原生覆盖基线与 `pnpm test` 共用[源码测试入口](../../web/scripts/runUnitTests.mjs)；Linux / CI 保持 4 路文件并发，macOS 原生启动保护固定单文件并发并按共享预算排队。发现范围、产物隔离和筛选见[前端脚本说明](../../web/scripts/README.md#源码测试--unit-tests)；覆盖统计、进程检查超时及归属保护保持原合同。
- 隔离归档必须显式列出项目内的 `--artifact` JSON，且全部携带相同的完整 repository identity；不能混入当前工作区身份、裸 coverage 或 `--write`。写入器与 DEV 读取器共用 `lib/coverage-report-contract.mjs` 的 schema / 身份 / 脱敏校验；归档不参与默认当前报告扫描。

  后续业务规则变化只维护采集器原有场景登记、中文标签和对应测试，页面按统一场景结构渲染；失败明细只保留测试标识及安全诊断，不透传原始日志。
- 工程用料链路复用 Source Documents、Workflow 和 RBAC/API 的显式场景登记；公式、冻结、权限、重试与维护方式见[测试策略](../../docs/product/自动化测试策略.md#核心用料链路与测试维护--material-chain-test-maintenance)。

  `engineering_material` 与共享 `unit_quantity` 的领域改动选择现有 critical PostgreSQL gate；`TestSourceDocumentPostgresEngineeringMaterial*` 不计入无数据库 baseline，通过真实数据库的执行日志独立证明。
- 字段联动报告只能由顶层 `erp-field-linkage.mjs` runner 生成，底层 builder 要求 runner 传入完整 repository identity，不是手工入口。裸 `--go-coverprofile` / `--web-coverage` 参数没有 repository identity，聚合器只能将其作为 `stale` 诊断；要记为当前代码证据，必须提供携带当前仓库指纹的 `--artifact` JSON。
- `output-retention-preview.mjs` 只扫描登记的 managed roots，按每组最近数量、最近 passed / failed / not_proven、显式 SHA 与 operation 引用给出 `keep / review_delete`；5GiB 是复核预算，不是自动删除阈值。未登记目录、符号链接和无效 metadata 均不得成为删除授权。
- 脚本不得把真实密码、token、完整 DSN、URL userinfo、原始客户文件内容或未脱敏输出写入仓库。
- 调整 QA 脚本后，至少运行对应 `node --check` / `node --test` 和 shell 语法检查；开发期按影响面运行专题命令，不因 QA 编排自身变化机械重跑 lifecycle。

## 接口合同同步与样例执行 / RPC Contract Checks

接口改动复用 `gen-public-contracts.mjs` 的生成、`--check`、只读 `--review` / `--staged` 比较与 `--verify-examples` 执行入口。`pre-commit` 只检查精确暂存快照；fast / affected 另运行登记样例的真实服务夹具，拒绝零执行、失败和跳过。

工作台从同一链路读取差异、暂存文件和源码身份绑定的原始回执，未登记或历史结果不补成当前通过。维护步骤、命令与证明范围集中见[接口差异与执行证据](../../docs/engineering/跨层公共契约与生成规范.md#接口差异与执行证据--rpc-review)。

## 模拟系统接入验证 / Integration Consumers

模拟接入的业务场景、边界和源码入口集中见 [API 合同](../../server/docs/api.md#模拟消费者与接入验证)，不再登记一份场景状态。测试使用标准 HTTP 消费者和生成客户端访问正式路由，ERP 登录、授权、UseCase、事务和回读均运行在真实 PostgreSQL；测试数据只在本次生成的 loopback CI 数据库内准备。订单、到货、仓储与财务的业务实现不替换为 mock。

完整执行沿用既有隔离库生命周期与关键事务门禁；从仓库根运行，`DISPOSABLE_DATABASE_BASE_URL` 由已准备的本机测试运行环境提供：

```bash
node scripts/qa/disposable-database-runner.mjs \
  --profile ci --workflow critical-postgres \
  --out output/qa/integration-consumers/postgres-lifecycle.json
```

已有本轮生成、迁移就绪的 CI 隔离库时，可在 `server/` 定向复验。保留真实 Go JSON 报告，并由既有校验器拒绝零执行、失败或跳过：

```bash
set -o pipefail
mkdir -p ../output/qa/integration-consumers
PURCHASE_RECEIPT_PG_TEST=1 \
PURCHASE_RECEIPT_PG_TEST_DB_URL="${PURCHASE_RECEIPT_PG_DB_URL:?必须使用本轮生成且已迁移的 CI 隔离库}" \
  go test -json ./internal/data -run '^TestSourceDocumentPostgresIntegration' -count=1 \
  | tee ../output/qa/integration-consumers/consumer-postgres.jsonl
node ../scripts/qa/verify-go-test-json.mjs \
  --report ../output/qa/integration-consumers/consumer-postgres.jsonl \
  --require-prefix TestSourceDocumentPostgresIntegration
```

CLI 的 `critical-postgres` 运行还会在仓库根的既有 `output/dev-workbench/database/` 保留原始 Go JSON 与同名生命周期回执；从 `server/` 调用的正式门禁使用相同落点，源码身份也取当前脚本所属仓库。回执绑定报告 digest、运行前后源码身份、完成时间及清理结果；工作台从这份原始证据投影场景结果。

运行中工作区变化时只作为历史证据，不能补成当前通过。`--out` 可额外指定相对调用目录的生命周期回执位置，不改变工作台读取的 canonical 证据。

该家族已由 `critical-postgres-tests.sh` 的 `TestSourceDocumentPostgres` 范围覆盖，无需新增独立 gate、接入台账、后台任务或执行入口。普通无数据库 `go test` 的 skip 不构成接入通过；专项结果只覆盖报告内的消费者与代码，不能补成全部 RPC、合作方身份、真实第三方联调或客户验收通过。页面只关联正式合同及既有门禁，不导入手工绿色状态。

<a id="seed-business-values"></a>
<a id="scenario-generation-snapshot"></a>

## 全页面试用验收数据

按[全页面试用验收数据](../../docs/engineering/全页面试用验收数据.md)准备、执行、核对与清理模拟数据。

- [造数的业务字段和值](../../docs/engineering/全页面试用验收数据.md#seed-business-values)
- [造数执行快照](../../docs/engineering/全页面试用验收数据.md#scenario-generation-snapshot)

<a id="pressure-testing"></a>

## 核心业务压力测试 / Pressure

增长、并发与事务的选测依据见[测试策略](../../docs/product/自动化测试策略.md#growth-and-correctness)。功能增长通过设计与浏览器场景验证；快照、预算、事务及并发正确性通过既有关键规则目录关联具名测试，随服务器或 PostgreSQL 门禁执行。

修改销售导出实现、导出公共预算、工程数据配方、混合负载、规模或资源生命周期时，`affected` 同时选中压力断言与规则目录测试，并提示在规则通过后按预算运行隔离短档；不会自动启动容量档。

正式测试策略、关键规则目录或工作台证据入口变化时，选择策略解析、规则与证据合同测试，并提示运行 `dev-growth-correctness-evidence`，验证“使用指引 → 增长验证 → 关键规则”的实际入口；单纯修改说明或展示不要求重跑压测。

### 可扩展性、可伸缩性、并发与事务 / Growth Validation

功能可扩展性与数据可伸缩性的定向合同检查沿用现有入口，工作台专项检查库直接提取本节命令。以下为共享动作增长、压力断言和规则登记的本地回归；数据库规则由隔离 PostgreSQL 门禁取证，不能用普通测试的 skip 替代。

```bash
node --test web/src/erp/components/business-list/BusinessSelectionActionBar.test.mjs web/src/erp/components/business-list/BusinessSelectionDiscovery.behavior.test.mjs scripts/qa/business-rule-catalog.test.mjs scripts/qa/pressure-engineering-scenario.test.mjs
```

销售订单完整导出是工程混合负载中的独立读方法，范围为该次历史背景与当轮订单池，按日期升序、同日 ID 倒序核对全部订单 ID、单号和明细数量；无重复、无截断，响应继续遵守服务端行数与 JSON 预算。每阶段须有该方法的实际成功样本，延迟和失败进入原有分方法报告。此处验证声明范围的完整读回；并发改写期间的快照原子性与名额释放仍由具名 PostgreSQL / 用例测试证明。

岗位账号和 Core 初始化与后端使用同一本轮隔离配置，目标库仍由 lifecycle 的 loopback、库名与 run ID 检查绑定。

工作台提供同一入口：**改动验证 → 压力测试**（`/__dev/testing?view=pressure`）。先运行短档回归，代码稳定后按需要运行 10 分钟容量档；运行阶段、报告选择、阶段吞吐、单次 API 延迟、完整业务流程、竞争与重放、数据库对账、恢复和清理在同一页查看。“使用说明”直达本节。

报告选择保存在 `report` query；“重新读取报告”只读证据，切换页面或刷新不会重复启动任务。需要重启开发服务加载新的服务端插件；运维身份继续使用工作台既有认证合同。

浏览器固定动作仅为 `pressure-quick / pressure-capacity + idempotencyKey + dataScale`，`dataScale` 只接受 `baseline / growth / volume`；同一幂等请求不能更换规模，不传目标、路径或环境变量。

两档共用已有 QA 锁，与开发门禁、覆盖采集、full / strict 互斥；工作台报告固定写入 `output/qa/pressure/workbench-<operation>/`。阶段进度通过同目录 `progress.json` 原子发布，按完成阶段计数，不代表剩余时间。CLI 的同合同报告也可在页面选择；合同损坏、符号链接或超限文件被拒绝，原始文件保留。

公开投影只携带允许的指标、判定和摘要，不输出凭据、私有路径或原始诊断。

使用 `pressure-isolated-lifecycle.mjs` 复跑当前工作区的读性能和工程主链路。默认只输出计划；`--run` 创建本轮专属的 PostgreSQL、S3、后端、账号和模拟数据，结束后停止后端并移除本轮容器及卷。需要 Node、Go、Atlas、psql、Docker Compose。

当前档位专测业务 API，使用既有 `ERP_PDF_WARMUP=0` 配置，并在报告明确未验证打印/PDF；数据库 readiness 与运行身份仍必须通过。Linux root runner 使用临时目录与独立低权限 UID，避免与编辑器共用文件监听额度，不新增系统账号或修改全局额度。

```bash
node scripts/qa/pressure-isolated-lifecycle.mjs --plan --profile quick --data-scale growth
node scripts/qa/pressure-isolated-lifecycle.mjs --run --profile quick --data-scale baseline
node scripts/qa/pressure-isolated-lifecycle.mjs --run --profile quick --data-scale growth
node scripts/qa/pressure-isolated-lifecycle.mjs --run --profile capacity --data-scale growth
# 500 行整页 + 末页，在混合读写下持续 10 分钟
node scripts/qa/pressure-isolated-lifecycle.mjs --run --profile capacity --data-scale volume
```

报告默认写入 `output/qa/pressure/<run>/`；可用 `--out <directory>/lifecycle.json` 指定本轮目录。`lifecycle.json` 同时绑定隔离生命周期脚本摘要，并汇总构建、迁移、身份、实际容器镜像及资源限制、运行与清理结果；源码摘要包含迁移 SQL、Atlas 配置与校验文件，迁移变化后旧报告失效。

构建副本与指纹使用同一排除规则：本地 `.env*`、`config.local.yaml/yml` 及 `server/configs/dev/database-roles.local.json` 不复制、不计入源码身份；正式配置与迁移仍参与核验。

`read-pressure.json` 和 `engineering-pressure.json` 分开保存容量与业务正确性证据；两份 dataset 回执绑定库、批次和逻辑指纹。凭据由入口随机生成，临时配置为 `0600`，不写入报告。

业务失败的 `failureDetail / flowFailures` 保留阶段、方法、错误类别和断言键，过滤任意异常正文；生命周期失败保留阶段及私有诊断位置。清理失败使整体失败，并保留本轮目录供精确恢复。`PRESSURE_S3_IMAGE` 可显式指定附件存储镜像，`PSQL_BIN` 可指定 psql 路径；镜像选择不能当作目标生产配置。

数据规模独立于负载档位；默认 `baseline`，短档订单池仍为 42 张，容量档仍为 262 张。以下档位是有界模拟回归配方，不代表客户月订单量、保留年限或已验证生产容量。实际业务规模确定后，在同一配置中调整目标，先查看 `--plan`，再按机器预算显式运行。

| 数据规模 | 历史订单 | 查询任务下限 | 生产 / 财务草稿各自下限 | 附件下限 |
| --- | --- | --- | --- | --- |
| `baseline` 基础 | 20 | 5,000 | 2,000 | 1,000 |
| `growth` 增长 | 100 | 15,000 | 6,000 | 1,000 |
| `volume` 高量 | 500 | 50,000 | 20,000 | 1,000 |

历史订单约三分之一为复杂单，订单日期分布在此前约两年；20% 未提交、20% 待老板审批、20% 待财务审批、40% 审批完成并生成采购单。审批时间由正式 API 产生，不伪造历史审批日志。工作台同时显示历史背景与当轮订单池的实际数量、普通/复杂构成、订单明细、预计用料来源、查询数据的计划下限/实际数量和业务负载前数据库占用。附件数量保持固定，本次不验证大文件上传或对象存储容量。

销售订单列表按公共分页上限（当前 500 行）循环读取，翻页计数独立于混合操作序号；按造数输入中的日期和订单 ID 计算完整预期，逐页核对筛选范围、总数、limit/offset、精确行集合、排序、单号与明细数。每阶段每页至少 5 个成功样本，整页和末页分别使用既有 p95/p99 门限并记录有界直方图。工作台展示主段两类页面的成功/失败数与延迟；缺少该字段的历史报告不作为满页证据。

`capacity + volume` 实际构造 762 张订单，覆盖 500 行整页与 262 行末页；`quick + volume` 为 542 张，适合先验场景。基础与增长规模不足一整页，只证明其实际返回范围。此链路使用稳定的订单日期排序，写负载为工程审批及采购生成，覆盖并发读取期间业务办理；不证明订单新增/删除导致结果集移动时的跨请求快照，也不代表其他列表或浏览器渲染 500 行的容量。

1. 在“数据规模”选择基础，运行短档；再选择增长，保持相同负载运行。规模选择保存在 `scale` query。
2. 在增长报告的“比较基准报告”选择基础报告。源码、迁移、负载、当轮池、宿主机和容器资源/镜像身份一致，且两次完整通过时，显示混合操作吞吐与各 API p95/p99 变化。
3. 身份缺失、不同负载/环境、失败或同一规模时，只保留各次结果并说明不能比较；旧报告缺少规模字段时不补造数据。短档小样本与共享宿主机活动会产生波动，正式结论需稳定资源条件下复测。

工程数据库对账按当轮订单 ID 集合限定审批和采购结果；同时对集合之外的销售单/明细、用料需求/冻结来源/明细、采购单/明细以及库存、生产、财务和收货记录进行完整行内容摘要，检测历史修改、删除与意外新增。仅当本轮数量与业务断言正确、背景摘要不变时通过。数据库统计更新在计时前完成，造数、统计更新与最终摘要开销不计入业务延迟。模拟数据与压力负载仍只存在本轮一次性隔离环境。

Docker 默认地址池耗尽时，可在核对宿主机路由及 Docker 网络无冲突后，通过服务端环境 `PRESSURE_NETWORK_SUBNET` 指定一个对齐的私有 IPv4 `/28` 专属网段。该配置只用于本轮 Compose 网络，不修改 Docker 全局地址池或已有网络；生命周期结束后连同本轮容器、卷一并清理并读回。工作台运行时由开发服务进程继承该配置，浏览器不能提交网段。

需要拆分执行时，配置入口 `capacity-customer-config.mjs` 还要求 `CAPACITY_CONFIG_EXPECTED_MIGRATION`，读压力入口要求 `--commit / --migration`，都必须来自本轮实际后端。常规复跑使用上述生命周期入口，由它绑定源码快照、迁移及目标身份并传入各阶段。

| 档位 / 入口 | 负载与用途 | 可证明的范围 |
| --- | --- | --- |
| 隔离入口 `quick` | 原读基线 + 42 张工程订单池、短时升压/主阶段/恢复 | 业务场景与报告的快速回归，不证明持续忙时容量 |
| 隔离入口 `capacity` | 原读基线 + 262 张工程订单池；主阶段 4 worker、每次操作间隔 1 秒、持续 10 分钟，随后降压恢复 | 此候选版本、此隔离环境、此负载下的持续表现 |
| 读入口 `capacity` / `sustained` | 1000 次主段基线 / 10 分钟持续读；基础规模任务 5000、生产草稿 2000、财务草稿 2000、附件 1000；隔离入口按所选规模扩充 | 查询与本批催办幂等；不外推到采购审批幂等 |
| 读入口 `saturation` / `soak` | 固定高 worker 与允许的保护错误 / 至少约 30 分钟读观察 | 保护与短时稳定性；不自动证明饱和点或全天稳定性 |

工程操作按起始序号混合约 90% 查询、10% 不同单据的完整办理。两类订单分别覆盖普通 BOM 与 8 条订单明细 × 24 部位 BOM；固定独立预期用量包含船头样、损耗、材料归并、六位展示精度、目标单位取整和两个厂商。

数据经现有 API 与工程准备 helper 构造，当轮订单先确认样品并保留 `PREVIEW`，历史背景提前走到配方指定状态；计时场景再执行计算读回、提交、老板审核、财务审核、采购权威读回；采购数量、厂商、材料、单位及来源必须一致，单价、金额、到货日期保持空。压测不自动抵扣库存，不制造收货、库存或财务事实。

同单据竞争单独运行：20 路提交、老板审核、财务审核；分别检查版本不匹配、实际旧版本、错误审批顺序、无权岗位和同意图重放。明细来源必须具备有效的订单行和 BOM 明细 ID，行号与部位一一对应，材料、单位、规格、样品、单位用量、损耗和展示数量符合独立配方。未知结果检查在后端实际回复后扣留客户端响应直到超时，再权威读回并以原输入重试；这证明丢失回复恢复，不证明服务端任意超时或断电恢复。

竞争检查按当前服务端错误合同区分资源冲突（`RESOURCE_CONFLICT`）、审批顺序错误（`INVALID_PARAM`）和越权（`PERMISSION_DENIED`），分别记录失败断言；拒绝后的权威读回仍须证明没有业务变更。

数据库最终检查冻结明细、厂商分组、来源关联、数量、重复与部分采购结果，以及无意外 Fact 写入。

通过条件包括 HTTP 与 JSON-RPC 业务成功、结果结构和业务读回、各方法样本、成功吞吐、延迟、目标持续时长、恢复、采样和最终一致性。默认每个方法至少 5 个成功样本，成功操作吞吐至少 1/s，各方法成功请求 p95 ≤ 1000 ms、p99 ≤ 2000 ms；它们是初始回归门限，须结合岗位实际目标调整，不代表客户已确认的 SLA。

门限集中在 `DEFAULT_PRESSURE_LIMITS`，单方法例外使用 `level.methodLimits`，不得为了通过而临时放宽。

`requests / successfulRps` 在工程报告中统计混合操作；`rpc` 与 `methods` 统计实际 API 请求；`businessFlows` 与 `completedBusinessFlows` 只统计完成全部审批并通过采购读回的流程。延迟分别报告所有请求和成功请求。

长测使用有界直方图，以桶上界保守计算分位数（≤1s 为 1ms、≤10s 为 10ms、≤60s 为 100ms，再按秒）；不保留响应、token 或每次请求的样本。保护档的 `overloadProtectionPassed` 和正常容量的 `capacityPassed` 分开，允许限流不等于达到容量门限。

### 维护与扩展 / Maintenance

| 变更类型 | 唯一维护位置 | 数据与证据处理 |
| --- | --- | --- |
| 数据规模、分布与报告展示 | `web/src/dev-workbench/config/devPressureData.mjs` 由 CLI、造数、执行桥与页面直接共享 | 同步数据/生命周期指纹、计划与实际读回、对比合同；不复制档位常量 |
| 批次对账与背景保护 | `pressure-engineering-ledger.mjs`；登记工程验证与数据依赖 | 增加业务结果表时同时维护本轮范围和背景完整行摘要，覆盖内容变化而数量不变的反例 |
| 数据配方、前置、来源及单位/数量业务合同 | `pressure-engineering-data.mjs`、现有工程 helper；维护 `ENGINEERING_DATA_FILES` 与所属验收阶段指纹 | 数据指纹变化先重造；不复用已消耗的待审批订单池 |
| API、岗位、状态和采购读回断言 | `pressure-engineering-scenario.mjs` 的 adapter / checker；维护 `ENGINEERING_VERIFICATION_FILES` | 更新验证指纹与针对性测试；历史造数复用的 adapter / checker 及批次对账同时登记为数据依赖，触及这些共享依赖时重造；仅验证依赖变化且数据指纹一致时重验，旧报告不代表新合同已通过 |
| worker、操作间隔、时长、比例和门限 | `engineering-pressure.mjs` 的 profiles / mix、`pressure-runtime.mjs` | 更新负载指纹，保留数据语义，重新出具性能报告 |
| 环境与生命周期 | `pressure-isolated-lifecycle.mjs`；维护 `PRESSURE_LIFECYCLE_FILES` | 绑定源码快照、二进制 hash、迁移和后端身份；只清理拥有的资源 |

工程准备 helper 默认仍完成原有人工验收审批，只有明确 `materialMode: "preview"` 才停在自动送审后的待老板审核状态，不执行两级审核。新增场景先复用现有 API/helper，补独立预期和读回；登记影响数据的依赖文件，不另造通用 ERP 平台。业务口径变更时先核对正式公式、状态及权限合同，再更新配方与独立预期；不要从接口返回结果生成预期值。

相关单测登记在 `node-test-groups.mjs`；affected 会为压力页、配置、样式与浏览器场景选择 `dev-pressure-desktop`，为报告和执行 Bridge 选择同名测试及操作边界核对。持续压测必须显式运行，不加入日常 fast/CI 默认长任务。

运行前后检查逻辑指纹和实际 `/readyz/runtime-identity`，脚本加载后发生变化须重新启动入口，拒绝库、release 或 migration 不匹配；工作区存在未提交改动时，报告明确标为 dirty 候选构建，不宣称 exact-commit 发布证明。

当前模型是等待上次操作完成后再发下一次的闭合循环。需要证明固定业务到达率、梯度饱和点、数小时稳定性或目标生产容量时，按该问题补 k6 arrival-rate / 更长 soak / 同配置目标演练，并继续复用业务断言和读回；这些结果不能从本次绿色推导。

## 按影响面选择 / Affected Tests

`affected.sh` 默认收集 unstaged、staged 和未跟踪文件，也支持只看 staged、指定 Git base 或显式文件：

```bash
bash scripts/qa/affected.sh --plan
bash scripts/qa/affected.sh --staged --plan
bash scripts/qa/affected.sh --base origin/main --plan
bash scripts/qa/affected.sh --file web/src/erp/utils/dateRange.mjs --run
```

选择器优先复用同名 `*.test.mjs`；普通业务页面、共享布局和样式会提示补定向 `STYLE_L1_SCENARIOS`。

DEV 工作台页面没有同名测试时只补 DEV route/production 边界和桌面页面治理合同，`web/dev-server` 普通插件走同名测试与语法检查，migration、交付命令、凭据或安全桥接再追加 operation/security follow-up。正式代码和文档的历史 Phase/P 编号只检查本次 changed files，不由 fast 全仓扫描。

业务事实 repo/usecase 会升级到本地隔离 PostgreSQL 关键事务门禁；schema/migration 会运行只读守卫、数据层测试和数据字典零漂移检查，但不会自动执行可能改写生成文件的 `make data`；`server/docs/database/**` 与业务语义 catalog 也会直接运行数据字典检查；部署、全局入口、无独立测试的 QA 脚本和未知路径会保守升级到 `full.sh`。

工作中心设计样例及其共享身份、图片、复制和时间展示依赖改动时，`affected` 同时选中工作台边界、样例标识约束与高权限上下文渲染测试，并提示 `dev-ui-design-work-center-explanations`、`dev-ui-design-work-center-reading` 浏览器回归。它们核对首次加载、两端切换、关联清单、示例复制与返回恢复不请求业务数据；不以无权限或页面已加载后的零请求代替完整隔离证据。

`gate-profiles.mjs` 只保存 fast/full/strict 的语义层级、直接入口和可执行位合同，当前 required files 保持小而累积。下游脚本和测试是否存在由真实执行、`node-test-groups.mjs` 的唯一登记以及各领域测试发现证明，不再在 profile 中复制整条传递依赖清单。

`affected` 是开发期快速反馈和非标准目标的保守执行入口；默认 `origin/main` 的 `prepare-push` 会在 clean HEAD 和真实 aggregate range 上独立重算风险，但只签发 `server-ci` 短门禁回执，不在 Mac 执行 affected/full。

显式 `--full` 只作本地完整诊断；随后必须按准备时相同 remote/ref push，hook 复核短期回执、真实 stdin/range、clean HEAD、gate/environment/TTL，并实时运行 `git log --check` 与逐 range 严格 secrets。

推送后必须由 GitLab exact-SHA 完整 CI Gate 终态成功才能发布、提升制品或进入受保护部署；目标 migration、health/smoke、备份恢复及回滚 evidence 仍独立取得。

GitLab 的 Server lane 使用两个互斥资源组：Schema、关键 PostgreSQL 和 Go 测试/构建共享 `quality-server-heavy`，存量升级独占 `quality-server-upgrade`。

每组同时只运行一个 Job，使服务端重任务最多并行两路；各 Job 仍使用独立 checkout、数据库、随机 loopback 端口和清理读回，Go 运行及包编译并发继续限制为 4。

`quality_server_test_build` 显式等待 Schema、升级与关键 PostgreSQL 三个 Job；数据库与 Docker 网络清理完成后进入 Go 测试/构建；浏览器除读取同一 SHA 的 Web 制品，还等待 `quality_resource` 汇合，避免 Bootstrap 夹具的网络连接或拆除中断 loopback 模块请求。

该顺序由 `needs` 保证，不依赖 YAML 排列或资源锁的抢占顺序。四个 Bootstrap 资源敏感分片仍在 `quality_web` 和 `quality_server` 完成后运行，避开依赖安装、构建和数据库测试的磁盘读写峰值；夹具的进程超时、短 marker deadline、身份校验与清理断言保持独立约束。

浏览器回执按计划顺序保存每个场景的真实耗时和重试次数，执行日志可以采用场景目录顺序，但场景集合必须与计划完全一致且不得重复。

Runner 的 checkout 保留 `output/cache/gitlab/pnpm-store/`、`output/cache/gitlab/playwright-runtime/` 和 `output/cache/pdf-runtime/` 三类下载缓存，减少重复删除与下载；`node_modules`、Web 构建、临时运行目录、计划与回执仍由 Git 清理并按本次 SHA 重建。

pnpm 继续使用 frozen lockfile 和内容完整性校验，Playwright 继续校验固定文件清单、长度与 SHA-256；缓存缺失或损坏沿用正式补齐路径，不把文件存在当作验证成功。

缓存使用 Runner 内置 Fastzip 的 `fast` 级别，兼顾打包耗时和存储体积，压缩与解压各限制为 2 路；普通质量链的 pnpm / Playwright 缓存仍由 `prepare` 唯一写入；PDF 下载缓存由已串行的 `publish_release` 唯一写回，定时 monitor 只读取缓存归档，完整历史、测试范围与制品身份不变。

### CI 变更与提速 / CI Change Safety

本节用于修改 CI 依赖、分片、缓存、资源组或 Runner 并发；普通业务改动沿用 affected 与既有门禁。当前拓扑以上述合同、`.gitlab-ci.yml` 和执行器为准，历史流水线耗时只作比较样本，不作为固定达标时间。

1. **先定位等待。** 记录基准 Pipeline、SHA、Runner、Job 的 `started_at` / `finished_at`、排队、缓存恢复与实际执行耗时。分别报告 GitLab `duration` 和创建至完成的墙钟时间；并行 Job 不能简单相加。按真实依赖及最后完成的领域判断瓶颈，汇总中的 `criticalShard` 标签不能替代 Job 时间线。区分源码变化、缓存命中与资源竞争，不能只用冷热两次总耗时证明编排净收益。
2. **一次验证一个小改动。** 优先复用现有资源组、分片和缓存，说明预期缩短哪段等待以及新增的资源争用。改变隔离或并发边界时，先在独立副本与一次性资源上验证真实执行、峰值资源和失败清理；Runner 及共享环境配置仍按各自授权处理。覆盖、制品身份、数据库/浏览器隔离和清理回执不能作为提速代价。
3. **在现有门禁中守住合同。** 依赖、资源锁或缓存变化更新 GitLab 合同；执行阶段或回执变化补对应 lane/aggregate 测试；同步 Job 指南与工作台流程图。触达 `rules`、`needs`、继承或缓存 YAML 时，再通过 GitLab 原生配置校验核对受影响入口实际展开的 Job 与依赖，不能只靠正则断言。修改门禁本身时，在一次性副本植入缺依赖、错误资源锁或旧证据残留等相关反例，确认检查确实失败；不改共享 checkout 制造反例。
4. **完整 CI 成功后再评价收益。** 已授权 push 后跟进同一 SHA 的完整 CI Gate，保留全部 Job attempts、首个失败日志、lane/aggregate 回执及清理结果。失败先诊断根因，按 exact-SHA 合同修复并形成新证据，不以反复 retry 到绿色证明稳定。涉及并发或缓存、且首跑仍有未决风险时，可在首次成功后用同 SHA 再做一次正式完整复验并说明目的；不把两轮 CI 变成普通提交的固定成本。
5. **按收益收口。** 比较覆盖与首次通过情况，再比较相同口径的耗时和资源余量。收益不明确、资源余量恶化或需要新增复杂隔离设施时，缩小或撤回本轮尝试，保留现场和证据，不为追逐三四分钟继续扩大范围。单次最快值、不同源码或缓存状态不能证明长期稳定提速。

现有检查入口按影响选择，不另建 CI 治理 Job：

| 变更面 | 自动检查与证据 |
| --- | --- |
| 文档/full 路由、DAG、服务端资源锁、Go 并发与缓存保留范围 | `gitlab-ci.test.mjs`、`ci-plan.test.mjs`；GitLab 原生配置校验复核受影响入口 |
| 分片执行、身份、零 skip 与失败清理 | 对应 `ci-quality-stage-lane.test.mjs`、`ci-resource-test-lane.test.mjs`、`ci-quality-aggregate.test.mjs`，以及真实 CI 回执 |
| Job 说明与工作台 Mermaid | `ci-job-guide.test.mjs`、`web/src/dev-workbench/config/devCiWorkflow.test.mjs`；图或页面有变化时补相应渲染验证 |

例如，依赖/资源组与 Job 说明改动的定向入口为仓库根目录下的：

```bash
GIT_OPTIONAL_LOCKS=0 node --test scripts/qa/gitlab-ci.test.mjs scripts/qa/ci-job-guide.test.mjs
```

该命令不替代受影响的执行器测试或远端 CI。交接保存精确变更、比较口径、首次失败/重试、资源与清理结果、保留/撤回决定及未验证项；证据放本轮 ignored `output/`，正式文档只维护当前合同，不堆积流水线历史。

## 角色演示账号与登录核验

角色演示账号只服务开发 / 验收登录测试，不写入 `server/configs/*/config.yaml`，也不是客户配置包。脚本会先确保内置 RBAC 权限和角色已 seed，再创建或更新以下账号并绑定真实角色：

| 账号 | 角色 |
| --- | --- |
| `demo_boss` | `boss` |
| `demo_sales` | `sales` |
| `demo_purchase` | `purchase` |
| `demo_production` | `production` |
| `demo_warehouse` | `warehouse` |
| `demo_quality` | `quality` |
| `demo_finance` | `finance` |
| `demo_pmc` | `pmc` |
| `demo_engineering` | `engineering` |
| `demo_admin` | `admin` |

默认不生成 `debug_operator` 账号；如确需调试权限账号，必须显式加 `--include-debug`，此时会额外生成 `demo_debug`。

`demo_admin` 是普通演示角色账号，不是稳定超级管理员 `admin`。角色演示账号的 seed / reset 只处理 `demo_*`，不得顺带重置稳定管理员。

无显式密码时，脚本只允许连接登记的 `192.168.0.133:5432/plush_erp` 或 `plush_erp_*_dev` 本地开发库，并使用公开测试密码 `12345678` 生成十个角色演示账号（包括普通演示管理员 `demo_admin`）；不会生成 `demo_debug`，也不会重置稳定超级管理员或人工验收场景账号。

本入口及其 `demo_*` 账号不得用于 133 上其他实例、其他共享 / 试用、staging 或生产目标；`customer-trial-133` 复用相同公开密码值时只能走其独立 `uat_*` 凭据合同与受控轮换器。

独立命令行调试账号和其他人工验收账号操作仍必须通过 `--password` 或 `ERP_ROLE_DEMO_PASSWORD` 显式提供非默认密码；唯一例外是 DEV-only 测试数据中心的固定 `scenario-demo` 编排，它在精确证明本机 8300 与登记 133 开发库后，可复用本机公开测试账号约定实现页面生成，且没有通往演示、验收、staging 或生产实例的逃逸开关。

管理员和演示账号的创建、重置密码仍统一要求 8～20 个 Unicode 字符，且 UTF-8 编码后不超过 bcrypt 的 72 字节边界。

```bash
bash scripts/seed-role-demo-admins.sh
```

如需覆盖公开测试默认值，或在受控场景中生成 `demo_debug` / 重置人工验收账号，必须显式传入非默认密码：

```bash
ERP_ROLE_DEMO_PASSWORD='<explicit-demo-password>' \
  bash scripts/seed-role-demo-admins.sh
```

已有账号重跑时会恢复 `disabled=false`、`is_super_admin=false` 和对应单一角色绑定；默认不重置已有账号密码。如需统一重置演示账号密码：

```bash
bash scripts/seed-role-demo-admins.sh --reset-password
```

无输入重置只处理登记的 `192.168.0.133:5432/plush_erp` / `plush_erp_*_dev` 本地开发库中的十个角色演示账号。重置 `demo_debug` 或人工验收场景账号时必须用 `--password` 或 `ERP_ROLE_DEMO_PASSWORD` 显式提供非默认密码。

脚本默认拒绝 `configs/prod` 或 `APP_ENV / ERP_ENV / GO_ENV=prod|production`；公开测试值即使显式传入也不能离开登记的本地开发库族，`--allow-prod` 必须使用非默认密码。常规开发和验收不要对生产库执行该脚本。

生成或重置演示账号后，可执行真实账号核对。该脚本不创建账号、不改密码，只通过真实 `/rpc/auth` 的 `admin_login + me` 校验角色、`mobile.<role>.access`、`debug.*` 权限、`is_super_admin` 和 `disabled` 边界。`admin_login` 会写入正常认证会话，但脚本不调用业务写入 RPC，不写 Source Document、Workflow 或 Fact：

如果只想先核对输入和账号清单，可打印输入模板。该模式只输出所需环境变量、账号清单、可选脱敏报告路径、effective session 脱敏诊断读取计划和真实核对命令，不读密码、不登录、不调用后端、不启动浏览器、不启动 Vite、不读取客户配置脚本、不写报告、不写数据库：

```bash
node scripts/qa/trial-account-rbac.mjs --print-input-template
node web/scripts/trialDemoAccountBrowserSmoke.mjs --print-input-template
```

试用账号 RBAC 也可先写前置检查报告。该模式只探测后端健康检查、演示账号密码环境变量是否存在，并静态核对 Go seed、后端 RBAC mobile 权限、前端移动角色入口、浏览器 smoke 账号和文档入口里的试用角色投影是否一致；报告内 `preflightOnly=true`，并会列出真实 RBAC 检查前置和本报告未证明项。

不读密码、不登录、不调用 `admin_login / me`，不写数据库，也不保存 access token 或 Authorization header；也不证明真实 RBAC、customer config active revision、桌面菜单投影或岗位任务端真实可用：

```bash
node scripts/qa/trial-account-rbac.mjs \
  --preflight-report output/trial-account-rbac/preflight.json
```

浏览器 smoke 还可先写前置检查报告。

该模式只探测后端健康检查、演示账号密码环境变量是否存在、是否需要脚本托管 Vite、yoyoosun customer config 脚本是否存在，并复用 `audit:yoyoosun-entry` 做只读端口审计；如果显式传入 `TRIAL_BROWSER_SMOKE_BASE_URL`，该端口必须命中 yoyoosun config 和 yoyoosun asset，否则报告会以 `external-base-url-not-yoyoosun-entry` 阻止进入真实 smoke，避免把 Product Core、HTML fallback 或其他项目端口误当试用前端。

报告还会静态输出桌面账号菜单应见 / 禁见、客户隐藏菜单、旧入口清理、岗位任务端路径、`demo_admin` 移动端拒绝态和 effective session DEV-only 脱敏诊断读取计划；报告内 `preflightOnly=true`，并会列出真实 smoke 前置和本报告未证明项。

不读密码、不登录、不调用 JSON-RPC、不启动浏览器、不启动 Vite、不读取客户配置脚本、不创建任务、不写数据库，也不保存 access token 或 Authorization header。

真实浏览器 smoke 在脚本托管 Vite 时会在桌面账号登录后读取 `window.__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__`，确认只包含脱敏摘要、投影模式、空阻塞项和可见菜单计数；同时检查法律告知弹窗的标题、链接和确认回执。

岗位访问检查逐页独立加载，并按授权精确核对侧栏和历史记录入口；它不证明快速 SPA 连续切换或业务写入流程。

真实登录会写入认证会话，未确认的账号会写入法律告知确认回执，但脚本不调用业务办理动作，不写 Source Document、Workflow 或 Fact。

需要留下本地读回记录时，可在真实命令上追加 `--report output/trial-demo-account-browser-smoke/report.json`，报告只保存账号通过数、岗位任务端通过数、拒绝态结果、法律告知检查结果、source / projectionMode / configRevision / customerKey / 计数 / blockers 等脱敏摘要，不保存密码、token、Authorization header、raw customer package 或 action 列表，也不证明目标环境发布、真实客户导入或 release evidence 已完成。

外部 base URL 默认不强制读取该 DEV-only 变量，如外部地址确认是 Vite DEV，可设置 `TRIAL_BROWSER_SMOKE_EXPECT_EFFECTIVE_SESSION_DIAGNOSTIC=1`：

```bash
node web/scripts/trialDemoAccountBrowserSmoke.mjs \
  --preflight-report output/trial-demo-account-browser-smoke/preflight.json
```

真实登录 smoke 共享前置也可先打印输入模板，或写 no-write shared preflight 报告。

模板只输出后端健康检查 URL、前端 URL、管理员凭据来源和具体 smoke 命令，不读取配置、不校验凭据、不调用后端、不启动浏览器、不登录、不写数据库；shared preflight 只探测后端 health 和管理员凭据来源候选，不读取 config 内容、不读取密码值、不校验账号、不调用 auth JSON-RPC、不启动 Vite / Playwright、不登录、不写数据库，也不保存密码、token 或 Authorization header。

采购入库真实写入浏览器 e2e 还可以打印自己的持久化测试数据输入模板：

```bash
node web/scripts/realLoginSmokeShared.mjs --print-input-template
node web/scripts/realLoginSmokeShared.mjs \
  --preflight-report output/real-login-smoke-shared/preflight.json
node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template
node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs \
  --preflight-report output/purchase-receipt-real-write-browser-e2e/preflight.json
```

`purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template` 只输出采购入库页面真实写入 e2e 所需输入、持久测试数据确认、`PR-BROWSER-*` 记录边界和后续真实命令，不读取本地配置、不校验凭据、不调用后端、不启动 Vite、不启动 Playwright、不登录、不写数据库；`--preflight-report` 只写本地前置报告，探测后端 health、显式管理员凭据 env、持久测试数据确认和页面目标安全性，不读取本地配置、不登录、不调用 JSON-RPC、不启动 Vite / Playwright、不写数据库。

真正运行 `pnpm smoke:purchase-receipt-real-write` 会写本地 / 开发库模拟采购入库事实，只能按脚本显式参数和 README 边界执行。

```bash
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  node scripts/qa/trial-account-rbac.mjs
```

如需留下本地可审计证据，可写入脱敏报告。报告只包含后端 endpoint alias、账号名、角色、岗位权限、debug 权限数量、super admin / disabled 布尔结果和汇总，不保存密码、access token 或 Authorization header：

```bash
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  node scripts/qa/trial-account-rbac.mjs \
    --report output/trial-account-rbac/report.json
```

如需核对其他后端地址：

```bash
TRIAL_ACCOUNT_BACKEND_URL='http://127.0.0.1:8300' \
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  node scripts/qa/trial-account-rbac.mjs
```

需要用真实浏览器核对桌面菜单、岗位任务端和无岗位权限拒绝态时，先确认后端已启动，再执行：

```bash
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  pnpm --dir web smoke:trial-demo-browser
```

该浏览器回归会自动启动单端口桌面 Vite，并使用 yoyoosun 菜单配置；它会同时检查各角色应看见的桌面菜单和不应看见的菜单，例如非 admin 不应看到权限管理，`demo_admin` 不应看到业务主入口。如需核对已启动前端地址，可设置 `TRIAL_BROWSER_SMOKE_BASE_URL`。如需保存本地脱敏读回报告，直接运行脚本并追加报告路径：
该浏览器回归会自动启动单端口桌面 Vite，并使用 yoyoosun 菜单配置；它会同时检查各角色应看见的桌面菜单和不应看见的菜单，例如非 admin 不应看到权限管理，`demo_admin` 不应看到业务主入口。

每次菜单切换还会采集页面就绪耗时、RPC 数量、忽略 JSON-RPC 随机 `id` 后的语义重复、主动取消、失败和未收敛请求；语义重复、失败、未收敛非零或单页就绪超过 5 秒均阻断。Mock / Style L1 保留 React StrictMode 双挂载探针，连接真实后端的 Vite 不向后端发送演练性双请求。

如需核对已启动前端地址，可设置 `TRIAL_BROWSER_SMOKE_BASE_URL`。如需保存本地脱敏读回报告，直接运行脚本并追加报告路径：

```bash
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  node web/scripts/trialDemoAccountBrowserSmoke.mjs \
    --report output/trial-demo-account-browser-smoke/report.json
```

如只核对岗位任务端登录后回跳和生产单端口路由，执行：

如果只想先核对该 smoke 的输入、岗位角色、phone / iPad 视口和执行边界，先打印输入模板。该模式不启动 Vite、不启动浏览器、不调用真实后端、不登录、不写数据库：

```bash
node web/scripts/mobileAuthLoginRouteSmoke.mjs --print-input-template
```

如需在不启动 Vite / Playwright、不调用后端和不登录的情况下，先写一份本地前置报告核对岗位路由计划、phone / iPad 视口和 mock 覆盖口径：

```bash
node web/scripts/mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json
```

```bash
pnpm --dir web smoke:mobile-auth-login-route
```

该回归默认验证 `/m/<role>/tasks`，与当前生产 `web-desktop` 单容器主路径一致，使用 mock auth / admin / customer-config / workflow RPC 覆盖未登录拦截、`admin.me` 与 effective session 刷新、登录回跳、当前已加载任务分布 / 风险提醒 / 已办列表和 phone / iPad 布局；preflight 只写本地 JSON，不证明真实后端 RBAC、customer config active revision 或真实账号可用。

旧的 `mobile-*` 多实例 `/tasks` 路径已退出，不再作为本地兼容调试入口。

如需核对真实后端模拟任务在岗位任务端详情页可见，并可提交阻塞、退回、完成和跨角色催办动作，先确认本地后端和试用账号可用，再执行：

触达移动端任务动作、内部提醒、完成反馈、跨角色催办、任务模型或任务看板动作 helper 时，先跑本地无写入边界和模型测试：

```bash
node --test \
  scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs \
  web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs \
  web/src/erp/utils/workflowTaskBoard.test.mjs
```

如果还没有本地演示账号密码或后端地址，先打印输入模板。该模式只输出所需环境变量、模拟任务计划和真实回归命令，不登录、不调用后端、不启动浏览器、不写数据库：

```bash
node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --print-input-template
```

本地前置看起来齐全但还不确定能否跑真实浏览器 smoke 时，先写 no-write preflight 报告。

该报告只探测 backend health、演示密码 env 是否存在、是否需要脚本托管 Vite、试用 customer-config 脚本是否存在，并复用 `audit:yoyoosun-entry` 做只读端口审计；若显式传入 `MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL`，该端口必须命中 yoyoosun config 和 yoyoosun asset，否则报告会以 `external-base-url-not-yoyoosun-entry` 阻止真实 smoke，避免把 Product Core、HTML fallback 或其他项目端口误当移动端任务端运行入口。

报告还会记录模拟任务动作计划 coverage：老板阻塞、老板完成、老板退回、品质模拟完成、仓库模拟完成、跨角色催办、reason 必填、完成反馈、阻塞 / 退回原因事件、动作页证据输入已移除、新动作 evidence refs 为空和内部 `notification_type` 线索；不读取密码值、不登录、不调用 JSON-RPC、不启动 Vite / Playwright、不创建 workflow 任务、不写数据库，也不保存 token 或 Authorization header：

```bash
node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs \
  --preflight-report output/mobile-workflow-runtime-browser-smoke/preflight.json
```

```bash
MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='replace-with-local-demo-password' \
  pnpm --dir web smoke:mobile-workflow-runtime-browser
```

如需留下本地真实浏览器读回记录，直接运行脚本并追加报告路径：

```bash
MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='replace-with-local-demo-password' \
  node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs \
    --report output/mobile-workflow-runtime-browser-smoke/report.json
```

该回归会通过 JSON-RPC 在 `trial_boss_work / trial_quality_work / trial_warehouse_work` 普通协同命名空间创建唯一的老板、品质和仓库任务，并为任务 payload 保留内部提醒线索；创建幂等键由 `runId + 场景任务码` 稳定生成，同键改变意图时由服务端拒绝。

老板完成场景按正式角色合同要求 `workflow.task.approve`，其他岗位完成场景要求 `workflow.task.complete`。

随后真实浏览器登录 `demo_boss`，在 `/m/boss/tasks` 提交自有任务阻塞原因、退回原因和完成反馈，验证动作页没有自由文本证据框或文件上传入口、回执没有新增历史处理线索，以及 `owner_role_key=warehouse` 且不指定跨岗处理人的仓库任务由老板通过监督范围查看，只能催办、不能代办阻塞 / 完成；再登录 `demo_quality` 和 `demo_warehouse` 验证完成反馈和已办列表。

脚本不会占用 `order_approval / finished_goods_qc / warehouse_inbound / shipment_release` 等正式来源任务组；它只写本地 / 试用模拟 Workflow 证据，不绑定正式领域命令，不导入真实客户数据，也不写库存、采购、质检或财务事实。

`--report` 只保存任务码、状态、动作结果、模拟任务计划 coverage 摘要、未证明项和脱敏布尔值，不保存密码、token、Authorization header、raw customer package 或 action 列表，也不进入 release evidence。

## Workflow 定向验证

以下命令在 `server/` 执行，用于任务状态、原因、事件、催办、版本与幂等的定向核验：

```bash
go test ./internal/data -run 'TestWorkflowRepo_(TaskStatusReasonEventAndCompletionCleanup|CreateAndUpdateTaskStatus|UrgeWorkflowTaskWritesEventAndPayload|.*Idempotency.*)'
go test ./internal/service -run 'TestJsonrpcDispatcher_WorkflowUrgeTask|TestJsonrpcDispatcher_Workflow(CompleteTaskAction|ControlledTaskActions|.*Idempotency.*)'
```

## 打印引擎验证 · PDF Runtime

打印运行时采用“固定、验证后升级”：`server/Dockerfile` 是 Chromium、Debian snapshot 和基础镜像 digest 的唯一版本真源，禁止构建时解析浮动 latest。`pdf-runtime-policy.json` 只保存体积观察基线、允许增长和 Trivy 工具校验值。安全检查阻断有修复版本的 HIGH / CRITICAL 系统包漏洞，同时保留其余发现；上游有新稳定版本时报告需要评审，不自动修改代码或发布。

`pdf-runtime-trivy.sh` 只复用按 policy SHA-256 校验的 Trivy 工具包和扫描器漏洞库，不缓存扫描结果。缓存目录不接受符号链接；损坏工具包只从固定来源重新下载并校验后原子替换。

扫描分析仅使用内存缓存（`--cache-backend memory`）；每次都对当前 image ID 完整扫描，沿用漏洞库正常更新，不设置离线或跳过更新参数；下载、更新或扫描失败即阻断，报告只在本次扫描成功后原子替换。日志区分工具缓存命中与漏洞库已有文件，后者不表示漏洞库已经更新或检查通过。


Server 镜像切换到固定 Debian snapshot 后，先升级基础镜像已有的系统包，再安装固定 Chromium；仅安装新依赖可能保留已有包的旧漏洞版本。最终镜像的实际包清单和扫描结果决定是否可发布。

发布作业始终保留脱敏的 `release-rehearsal.json` 与 PDF 扫描产物；演练结束时必须清理当前临时工作区内由容器持有的 PostgreSQL 和附件目录，确认容器与工作区均无残留后才允许登记版本。

Trivy 工具固定版本压缩包经按需代理下载，保留重试与 SHA-256 校验并允许最多 15 分钟；漏洞库优先从官方 `ghcr.io/aquasecurity/trivy-db:2` 获取，并保留官方 `public.ecr.aws/aquasecurity/trivy-db:2` 作为后备，避免默认优先连接 Runner 不可达的 Google 镜像站。

源的优先顺序须根据同一 Runner 上全新缓存的实际下载结果调整；Trivy 只在其支持的远端错误条件下尝试后备源，慢速传输不保证触发切换。仅 Trivy 进程关闭 HTTP/2，防止长时间代理传输因 HTTP/2 流中断或提前 EOF 失败，不改变 Runner 其他下载的协议选择。

漏洞库下载与完整扫描共享 30 分钟超时预算，以容纳代理链路的带宽波动；超时、下载不完整、校验不符或扫描失败仍阻断发布。

此门禁的漏洞阻断范围为 Chromium 所在的 Debian 系统包（Trivy `Class=os-pkgs`、`Type=debian`）。Trivy 同时发现的 Go 二进制依赖问题按原分类完整保留，并单独计数；它们由既有 Go 安全检查继续判定调用路径和升级范围。打印运行时通过不代表全镜像无漏洞，也不把暂无修复版本的系统包发现当作已修复。

| 入口 | 验证与输出 |
| --- | --- |
| `node scripts/qa/pdf-runtime.mjs check-source` | 检查固定浏览器 / 包源 / base digest 及前端字体精确版本，相关测试进入普通 Node CI |
| `bash scripts/qa/pdf-runtime.sh verify IMAGE OUTPUT_DIR [FIXTURE_DIR]` | 在最终非 root + sandbox 镜像中运行 Go PDF 安全与业务快照测试；核对 A4、中文文本、字体嵌入、系统包、实际浏览器和体积，运行固定校验值的 Trivy |
| `bash scripts/qa/pdf-runtime.sh monitor IMAGE OUTPUT_DIR` | 对固定镜像重新扫描漏洞，并查询 Google Linux stable；不重建镜像、不渲染全套模板 |
| `web/scripts/printPdfFixtures.mjs STATIC_ROOT OUTPUT_DIR [TEMPLATE_KEYS]` | 用实际生产前端和脱敏模拟数据打开登记模板，采集真实下载请求的纸面 HTML；不维护第二套服务端模板 |

`verify` / `monitor` 面向 Linux amd64 Runner。宿主需有 Docker、Go、Node、pnpm；`verify` 另需 Poppler（`pdfinfo`、`pdftotext`、`pdffonts`）与已核验的 Playwright 运行包。

Poppler 在 Runner cloud-init 中声明，已有 Runner 由运维按正式流程补齐；Job 不自行安装系统包。CI 沿用已有 Chromium sandbox helper；最终镜像使用正式 Compose 的 seccomp，缺条件明确失败。输出目录每次使用唯一目录；只清理本次容器、测试二进制和本次安装的浏览器 sandbox，不清理外部镜像、缓存或卷。

正式 `release-artifact-bundle.mjs` 在源码镜像构建后复用同一 Server image，默认从该镜像提取前端，验证全部登记模板。结果必须绑定 source commit、image ID 和模板集合，真实 Debian 包清单及结果写入原有 `sbom.cdx.json`，不增加发布资产种类。PDF 样本与诊断保存在 CI artifacts；这是制品验证，目标部署的登录、权限与运行 smoke 仍由现有流程完成。

`.gitlab-ci.yml` 提供独立 `pdf_runtime_monitor` 定时入口：受保护 `main`、pipeline source 为 `schedule`，配置 `PDF_RUNTIME_MONITOR=1` 与已有固定 `PDF_RUNTIME_IMAGE`（本地 image ID 或仓库 digest）。该入口不会触发普通全量质量或发布。

仓库配置不自动创建 GitLab Schedule；启用时间与镜像由运维在既有 CI 中设置，缺失镜像 / 安全数据库 / 上游响应不会被当成通过。

本地 PDF 回归按[测试策略](../../docs/product/自动化测试策略.md#原则)依据任务范围、资源预算和副作用选择；当前目标必要的验证直接执行，明显超出范围或预算时确认。传入明确模板子集只证明该子集，不据此宣称所有模板或最终镜像通过。

体积使用专用 Runner 上同一 Docker image store 的 `image inspect Size`，不混用压缩 tar、`docker images` 或共享层磁盘数字；当前门限是旧固定制品的回归上限，不能当作本次已实现的瘦身百分比。


## PostgreSQL 领域事务验证

以下命令均在 `server/` 执行，只使用各自登记的隔离测试库。

库存事实 PostgreSQL 本地验收使用专用防呆 target，默认库名为 `plush_erp_inventory_test`：

```bash
make inventory_pg_createdb
make inventory_migrate_status
make inventory_migrate_apply
make inventory_pg_test
```

BOM + 批次库存 PostgreSQL 本地验收使用独立防呆 target，默认库名为 `plush_erp_bom_lot_test`：

```bash
make bom_lot_pg_createdb
make bom_lot_migrate_status
make bom_lot_migrate_apply
make bom_lot_pg_test
```

采购入库 PostgreSQL 本地验收使用独立防呆 target，默认库名为 `plush_erp_ci_purchase_receipt_fixture`：

```bash
make purchase_receipt_pg_createdb
make purchase_receipt_migrate_status
make purchase_receipt_migrate_apply
make purchase_receipt_pg_test
make critical_transactions_pg_test
```

`inventory_pg_test` 同时覆盖 `TestInventoryPostgres*` 与 `TestOperationalFactPostgres*`，包括 SKU grain、库存预留、出货来源数量、预留消费，以及生产 / 委外 / 财务 draft post-vs-cancel 的事实行锁与库存 / 审计串行边界。

`critical_transactions_pg_test` 复用同一隔离测试库，强制运行采购入库 / 退货 / 调整 draft post-vs-cancel、child-create-vs-parent-cancel、生产 / 委外 / 财务事实并发、Source Document 聚合保存、库存 / SKU / 预留 / 出货、ProcessRuntime 领域命令和 Workflow 终态并发测试；脚本会同时开启 purchase receipt 与 inventory 两组 PostgreSQL 测试标志。

新增 PostgreSQL 测试家族时，同步 `critical-postgres-tests.sh` 的执行正则与 `CRITICAL_POSTGRES_REQUIRED_PREFIXES`。`critical-postgres-gate.test.mjs` 扫描使用正式数据库 helper 的测试，分别阻止执行漏登和必需结果漏登；`verify-go-test-json.mjs` 再按真实执行日志拒绝缺失、失败或跳过。采购跟进日期与收货事实、销售订单号并发分配也沿用此门禁，不另设执行入口。

`full/strict` 会先创建并 apply 该测试库再执行此门禁，不把普通 `go test ./...` 中的 PostgreSQL skip 冒充事务验收。

验证证据必须分层报告：SQLite / usecase 测试证明状态、依赖、零库存与父单解除；真实 PostgreSQL 用例证明行锁和并发赢家；Web 组件与页面级浏览器回归 mock（Style L1）只证明 canonical RPC、按钮状态、文案和写后重读可达；真实后端浏览器 + 数据库读回才证明岗位操作已持久写入当前数据库；目标 release、health / ready、smoke 和客户 UAT 仍是独立关口。

任一 PostgreSQL 用例失败或被环境变量跳过，都不能用组件、mock 浏览器或普通 `go test ./...` 绿色覆盖。

销售订单导出的专项回归分为三层：`internal/biz` 的 `TestSalesOrderExport*` 验证准入名额、取消、期限与错误边界；`internal/service` 的 `TestRPCDocumentedExamples/sales_order.export_sales_orders / TestSalesOrderExport*` 验证正式调用样例、筛选、权限脱敏和无部分结果；`internal/data` 的 `TestSourceDocumentPostgresSalesOrderExport*` 在已迁移的一次性库中验证快照期间并发修改、稳定排序、5,000/5,001 行、8 MiB 存储行预算及取消后的连接释放。

这组数据库测试随现有 `TestSourceDocumentPostgres` 关键门禁运行；单独运行仍须提供隔离库的 `INVENTORY_PG_TEST=1 / INVENTORY_PG_TEST_DB_URL`，不能指向登记开发库。

浏览器复用 `STYLE_L1_SCENARIOS=sales-order-export-snapshot,sales-order-export-failure-retry,sales-order-export-exact-id,sales-order-export-history,sales-order-export-preserves-other-history`，验证超过普通分页范围的完整 CSV、重复操作阻断、失败与空结果不下载、重试、指定单据和历史销售订单，同时核对其他历史来源仍按原路径完整导出。

上述均为正确性和边界回归，不替代真实负载下的容量测试。

采购退货 PostgreSQL 本地验收使用独立防呆 target，默认库名为 `plush_erp_purchase_return_test`：

```bash
make purchase_return_pg_createdb
make purchase_return_migrate_status
make purchase_return_migrate_apply
make purchase_return_pg_test
```


## full 与 strict

- 环境阶段先校验当前 Bash 与后续子脚本解析到的 `PATH` Bash，避免 macOS Bash 3.2 在部署合同的关联数组处延迟失败
- 复用 fast 的基础守卫，按 `node-test-groups.mjs` 一次执行全部已登记 scripts Node 组；不重复稍后由 Web 全集和 server 全集覆盖的 fast Web / Go 子集
- 补充 secrets、前端 lint / css / test / build、本地 PostgreSQL 关键事务门禁和服务端 `go test ./...` / `make build`；最后运行一次固定的 govulncheck v1.6.0，避免外部网络异常先扰动本地并发测试。

  govulncheck 进程级禁止启动 Go 遥测 sidecar，单次默认限时 300 秒；仅在扫描器/官方漏洞库返回 exit 1 或扫描超时时固定重试一次。真实漏洞 exit 3、参数错误、未知状态和第二次失败仍立即阻断 strict；可用 `GOVULNCHECK_TIMEOUT_SECONDS=1..3600` 调整单次上限
- 若定义了前端 `test`，会一并执行；它仍不替代浏览器里的样式 / box 模型回归
- 始终真实执行固定门禁，不读取或签发本地推送回执；CI strict 也永不读取该回执

研发效能工作台的质量门禁页仍调用同一 full / strict 正式入口。开发服务没有显式 loopback `DISPOSABLE_DATABASE_BASE_URL` 时，会使用本机已有的固定 `postgres:18.6` 镜像自动创建本次专用容器；凭据、DSN、容器命令和本机路径不会返回浏览器。该包装不改变 full / strict 的命令或阶段顺序，容器与内部临时数据库任一清理读回缺失都会使本次结果失败。

### strict

- 先执行 strict 独有的 shellcheck、shfmt 和 yamllint，再以 strict profile 单次运行 full
- 前端零 warning、扩展浏览器视口和严格 govulncheck 都在该次 full 中完成，不二次执行同一 lint、测试或漏洞扫描

## 推送准备与回执

前端源码与测试在 pre-commit 中按实际暂存内容执行零 warning ESLint，未暂存修正不能掩盖提交中的错误。短门禁对 Markdown 改动保留文档链接检查，对共享帮助、手册源码和生成物改动保留手册同步检查；重型发布、数据库和浏览器测试继续由同一 SHA 的完整 CI 证明。

- 准备阶段在 Git 建立 receive-pack 连接前查询实际 push URL 的 ref，计算每个目标 range 和 aggregate range。只有匹配项目 GitLab 入口的默认单一 `origin/main` 执行签名短门禁；其他目标和显式 `--full` 按当次计划执行保守本地门禁。fetch URL 与 push URL 不同时从后者读基线；多个 push URL 或 hook 报告的目标不一致时阻断。

  首次把同名分支镜像到空远端时，aggregate range 和严格 secrets 仍覆盖 `empty-tree..HEAD`；只有目标恰为单个缺失同名分支、另一个已配置 upstream tracking ref 存在且为 HEAD 祖先时，数据库守卫和实时 `git log --check` 才使用该 upstream SHA 到 HEAD 的范围。

  两类范围、remote/ref/SHA 及使用模式都会进入签名回执并由 hook 重算；缺失、分叉、多 ref、改名或同远端场景保持完整聚合 / push 范围或直接失败。
- 每次远端 ref 查询受 20 秒硬超时约束；只有明确的瞬时传输失败才按固定短间隔最多重试两次，权限、仓库、ref 或响应合同错误立即失败。
- 只有选定 profile 的门禁成功，且前后 HEAD/tree、worktree、remote/ref、gate contract 和关键工具/依赖环境均未变化时，才在 `git rev-parse --git-common-dir` 下按 worktree 隔离签发 HMAC 回执；采用并发锁、私有权限、同目录临时文件和原子 rename。
- 环境指纹只归一化 Git 启动 hook 时自动添加在 `PATH` 首部的 `git --exec-path`；其他 `PATH`、工具版本、依赖元数据、数据库 / 浏览器门禁参数或代理环境变化仍会使回执失效。
- 并发 owner 仍存活、owner 信息不可读或 PID 状态不确定时锁保持 fail closed；只有带脚本 token 且 owner PID 已确认不存在的中断残留锁会被原子隔离并清理。
- hook 必须读取真实 push stdin，重算 refs/aggregate range、签名内数据库守卫、live-check 合同及定向检查清单、并发和截止时间，复核 local SHA 等于 HEAD、clean 状态、回执签名/profile/version/environment/TTL，并实时执行 `git log --check` 和严格 secrets。

  精确的首次同名镜像只把已验证 upstream..HEAD 用于提交空白检查，严格 secrets 仍扫描新 ref 暴露的完整历史；其他 ref 继续使用原 push range。纯删除/空 stdin 是 no-op，混合删除与更新 fail closed；调用者不能通过 `QA_BASE_RANGE`、`QA_DB_GUARD_RANGE` 或自定义 live range 覆盖准备合同。
- 缺失、过期、远端漂移或任何代码/依赖/migration/测试/门禁/环境变化都会拒绝复用；hook 不回退到 full，因此不会在已经打开的 SSH 连接上长时间等待。`SKIP_PRE_PUSH`、`--no-verify`、调用者指定的 range、回执路径/token/TTL 都不是常规接口。


## 定向边界检查

| 入口 | 验证范围 |
| --- | --- |
| `node --test scripts/qa/trial-role-entry-docs.test.mjs` | 核对岗位账号、入口文档与模拟登录边界，详细说明集中在本页和前端脚本 |
| `node --test scripts/qa/sales-order-field-chain-boundary.test.mjs` | 锁住销售订单字段来源、明细映射与相关输出链 |
| `node --test scripts/qa/trial-account-rbac.test.mjs` | 无后端单测拒绝多角色、多 mobile 权限、admin mobile 泄漏、debug 权限、super admin 和 disabled 账号 |

fast 保留试用账号 RBAC、浏览器 smoke 脚本语法与真实登录共享 URL 的无后端边界单测，不触发真实登录；实际分组以 `node-test-groups.mjs` 和 `fast.sh` 为准。

## 常用入口

### 日常检查与治理

| 入口 | 用途 | 建议时机 |
| --- | --- | --- |
| `bash scripts/qa/affected.sh --plan` | 读取当前工作树、staged、指定 base 或显式文件，按验证范围（内部键 T0-T8）和受影响领域输出最小必要测试；ESLint / Stylelint 配置选择对应静态检查与边界回归，默认只计划，未知路径保守升级为 `full.sh` | 开发过程中、准备验证前 |
| `bash scripts/qa/affected.sh --run` | 执行 affected 选出的安全本地命令并记录逐项耗时；页面级浏览器回归（Style L1）、`make data` 和目标环境证据仍作为 required follow-up 单列 | 完成一个可验证切片后 |
| `node --test scripts/qa/ci-job-guide.test.mjs` | 校验每个正式 push-CI Job 都有一份简短用途说明；说明源不保存依赖、状态、耗时、等待或历史，未知 Job 只标记“说明待登记”并继续投影 | 新增、删除、改名或拆分 GitLab CI Job 时 |
| `bash scripts/qa/fast.sh` | 跨模块基础检查集合，运行显式 `fast` Node 测试组，并覆盖文档清单、客户配置、菜单、Web 静态检查和 server quick；阶段编号只由 affected 扫描本次变更文件 | 需要跨模块基础验证时；小改优先 affected / 定向测试 |
| `node scripts/qa/skill-health.mjs` | 项目 validator：检查当前 YAML 子集、目录名、metadata、README 索引、Skill 指令与 references 的文件/章节链接、项目 Skill 名称及 TODO 占位；assets 输出模板不扫描正文，指向模板的入口链接仍须有效；只依赖现有 Node，见 [Skill 维护与验证](../../.agents/skills/README.md#skill-validation) | Markdown 或项目 Skill 变更时由 `affected` 选择，也检查被引用文档的章节漂移 |
| `bash scripts/qa/agents-size.sh` | 只读检查 Git 已跟踪及未忽略的 `AGENTS.md` 当前工作区字节数；包含新建的目录规则，跳过已删除文件，排除 ignored 历史副本与依赖；24 KiB 预警、32 KiB 阻断，Git 枚举失败时不报通过 | 规则调整后定向运行；回归由 fast 组的 `agents-size.test.mjs` 覆盖 |
| `node scripts/qa/test-code-governance.mjs` | 盘点测试文件、行数、测试文件直接读取，以及仓库 JS / TS 中的源码改写执行；大文件只报告不按行数阻断，既有源码改写执行使用 shrink-only 清单，新增或清单已失效都会失败 | 新增测试基础设施、源码沙箱或治理测试债务后 |
| `node scripts/qa/erp-field-linkage.mjs` | 运行字段联动专项，前后绑定同一仓库指纹，并把脱敏结构化证据写入 `output/qa/coverage/field-linkage.latest.json`；只证明该专项，不代表整仓覆盖 | 修改字段来源、映射、回显或打印链路后 |
| `node scripts/qa/test-coverage-collect.mjs --profile baseline --write` | 在同一仓库身份下运行非数据库 baseline，采集 Go / Web 代码覆盖、显式业务场景、字段联动、导入合同和受影响验证范围（内部键 T0-T8），再原子写入证据并聚合 latest；运行期身份变化即失败 | 刷新开发工作台真实覆盖证据前 |
| `node scripts/qa/test-coverage-report.mjs --write` | 聚合当前 commit / worktree 指纹、真实代码覆盖制品、业务场景、验证范围（内部键 T0-T8）与验收状态到 `output/qa/coverage/latest.json`；缺制品写 `missing`，不自动运行全量测试 | 刷新开发工作台覆盖状态前 |
| `node scripts/qa/test-coverage-report.mjs --snapshot --artifact <bound-evidence.json>` | 按显式制品共同的完整源码身份聚合到 `output/qa/coverage/snapshot.latest.json`，原子写入并读回；不覆盖当前工作区报告 | 展示已完成的隔离验证证据时 |
| `node scripts/qa/run-gate-with-managed-database.mjs --exact-sha <40sha> --main-ref HEAD --operation-id <uuid>` | 本地 clean 候选的唯一受管 exact-SHA 入口；复用固定 `postgres:18.6`、随机凭据、loopback 动态端口和精确 cleanup，再以无 shell 的固定参数执行 `exact-sha-gate.mjs`；DSN 只进入子进程环境，终态仍以 exact-SHA gate 为唯一真源 | 需要独立本地受管诊断时 |
| `run-gate-with-managed-database.mjs` | 质量门禁页面的 full / strict 内部包装器；固定使用本机 `postgres:18.6`，为每次 operation 生成随机凭据和 loopback 动态端口，执行原正式 runner 后按精确 label 删除容器并读回零残留；不接受浏览器提供命令、DSN、镜像或凭据 | DEV 页面未显式登记本机数据库 base 时 |

### 日常检查与治理（续）

| 入口 | 用途 | 建议时机 |
| --- | --- | --- |
| `node scripts/qa/exact-sha-gate.mjs --sha <40sha> [--run]` | 绑定 clean SHA、strict profile、锁文件和门禁实现形成 fingerprint；已有同 fingerprint 终态时复用，不自动新开 lifecycle | 不可变 Release workflow |
| `node scripts/qa/ci-quality-shard.mjs --shard <name>` | 只在 protected main 的 GitLab 上生成七类固定外部 strict 分片之一；Node 类聚合内部 `core / release_preflight_a / release_preflight_b / release_a / release_b / release_c`，resource-sensitive 类聚合内部 `contract_a / contract_b / runtime_a / runtime_b`，两者对外仍各自只保留一个规范回执；所有回执继续绑定同一 plan/range/exact SHA，并保留资源清理读回 | GitLab main 普通 CI；不提供本地通用入口 |
| `node scripts/qa/pnpm-audit-retry.mjs` | 对 npm 官方接口执行固定的 production/high pnpm 审计；首次强制直连，只对网络、429 和 5xx 瞬态错误重试一次，若环境已配置代理则仅第二次使用该代理；单次 100 秒、总计 205 秒封顶，合法漏洞报告不重试，高危或严重漏洞立即阻断，错误只输出有界脱敏诊断 | GitLab security 分片内部；可作本地只读诊断 |
| `node scripts/qa/ci-quality-aggregate.mjs` | 精确聚合七个分片、可信 plan 与资源清理证据，签发标准 v3 exact-SHA strict terminal 和可上传的 CI evidence manifest；缺任一分片、分类执行数或身份均失败关闭 | GitLab main 普通 CI 聚合；不证明 Release 或目标部署 |
| `node scripts/qa/database-inventory.mjs --out <report.json>` | 从环境中的固定数据库 URL 只读盘点同服务器项目库、连接数、migration、仓库引用和 disposable 分类；不授权删除 | 发布演练前后或发现临时库堆积时 |
| `node --test scripts/deploy/backup-set.test.mjs`、`node scripts/qa/backup-set-integration.mjs` | 成套备份边界测试；真实一次性 PG 18.6 / SeaweedFS、当前迁移、非空及撤回附件的加密成套恢复、失败后原应用恢复、保留新隔离资源与精确清理；本地开发模式不证明异地挂载或目标 timer | PG＋附件成套备份、恢复和 systemd 合同变化后 |
| `node scripts/qa/database-archive.mjs --database-name <name> --out <dir>` | 只接受已登记 disposable 库且要求零连接；生成归档并在临时 restore 库核对 migration、schema 与逐表计数，最后删除 restore 库并读回零残留 | 清理候选库取得可恢复证据时 |
| `node --test scripts/qa/visualization.test.mjs` | 解析正式文档与工作台静态说明图，限制单张流程图为 12 个节点、18 条关系；不改写归档 | 新增或修改 Mermaid、CI 原理或造数说明图后 |
| `node scripts/qa/docs-inventory.test.mjs` | 检查长期文档与最近归档索引登记、当前文档及 `progress.md` / 归档 README 的本地链接和真实查看器锚点合同；冻结归档正文不按当前链接规则重写 | 新增、删除、重命名 README 或长期文档，或调整标题、章节链接与归档入口后 |
| `node scripts/gen-public-contracts.mjs --check`、`node scripts/qa/public-contract-consumers.mjs`、`node --test scripts/gen-public-contracts.test.mjs` | 校验权限、业务及流程状态、附件、RPC 入口 / 信封 / 方法、数值、密码 / 打印限制、任务目录和交互稿片段；信封对照生成的消息描述，不代替 `make api`；检查 Web 绑定及发布脚本静态 RPC，只读，见[公共契约规范](../../docs/engineering/跨层公共契约与生成规范.md) | 修改公共契约真源、proto、生成消息、HTTP binding、Swagger、提取器或消费者后；已进入 fast，affected 按登记源选择同步与消费者检查 |
| `node scripts/qa/private-deployment-boundaries.mjs` | 检查客户 README 的差异 / 验收章节、三份配置和最小部署参数边界，并禁止 reference 部署目录 | 调整私有化模板或 reference 文档后 |
| `node scripts/qa/phase-label-boundaries.mjs` + `node --test scripts/qa/phase-label-boundaries.test.mjs` | fast 仓库检查扫描活跃代码、脚本和正式文档（含 HTML）；affected 只扫描本次文件。阻断阶段编号、内部目录计数及明确的模块版号前缀 / 后缀 / 路径；保留风险等级、业务修订、格式标识和外部协议。格式版本的必要性仍按[版本边界](../../docs/engineering/跨层公共契约与生成规范.md#版本边界--version-boundaries)核实 | 改脚本、API、命名或治理文档后；已进入 fast / full / strict 和 affected |

### 日常检查与治理（续）

| 入口 | 用途 | 建议时机 |
| --- | --- | --- |
| `node scripts/qa/experimental/canonical-runtime-audit.mjs` | 非阻断实验审计；宽泛 keyword 命中只作只读复核线索，不进入 fast / affected，不代表产品缺陷或发布证据；恢复阻断前必须改成逐域 status key / API field / function / runtime branch 精确合同 | 需要人工盘点历史词命中时 |
| `node scripts/qa/scenario-demo-data.mjs` | 默认只读输出当前冻结批次的长期数据计划；本地开发与 `customer-trial-133` 复用同一 canonical 业务语义和九阶段 runner，但数据库、release、migration、客户配置、账号命名、attestation 与回执独立。133 的密码值由固定公开测试凭据合同约束，不构成数据共库。精确 plan digest 和确认串匹配后才通过正式 API exact-create-or-readback；不清理、不重置，不把查询读回写成人工验收或真实客户导入 | 需要为本地或 133 长期保留固定业务场景数据时 |
| `node scripts/qa/visualization-demo-data.mjs --anchor-date <YYYY-MM-DD>` | 默认只读生成本地可视化增量计划；只接受已登记 `scenario-demo` 与当前批次 来源报告，通过正式 JSON-RPC 补齐销售交期、采购到货、生产计划和五产品工序样本，并读回既有财务、库存、PMC 任务覆盖。显式 apply 需要 plan digest 与确认串；报告写入 ignored `output/qa/visualization-demo/<run-id>/` | 开发五类业务可视化并需要紧凑、可重复的风险状态数据时 |

### 数据库、迁移与事务

| 入口 | 用途 | 建议时机 |
| --- | --- | --- |
| `make -C server migrate_check` | 检查当前未提交工作区的迁移链路、schema 状态与存量预检、实际备份脚本参数；不连接目标库。页面与 CLI 在准备迁移、停止后端前自动执行；详见 [Ent 迁移说明](../../server/docs/ent.md) | 开发中修改迁移链路或 schema 后；affected 也会选择同一检查 |
| `bash scripts/qa/unit-normalization-postgres.sh` | 使用无挂载、随机 loopback 端口的一次性 PostgreSQL，核对单位迁移 fresh / upgrade、余额合并、异常事务回滚及库存业务；结束精确删除该容器。 | 计量单位迁移和数量校验改动后；正式 full / strict 的 server upgrade lane 也执行 |
| `bash scripts/qa/data-model-integrity-postgres.sh` | 使用专用隔离 PostgreSQL 验证销售、质检和财务约束的存量升级、拒绝非法状态、事务回滚与 fresh 业务链；配套 Node 测试仅由本入口提供隔离库后执行。 | 关键数据完整性约束改动后显式运行 |
| `bash scripts/qa/data-model-integrity-postgres.sh` | 使用无挂载、随机 loopback 端口的一次性 PostgreSQL，验证空值组合、财务外键迁移的新库与存量升级、只读预检、非法存量回滚及关键业务测试；结束删除并核对本次容器。 | 数据模型完整性约束改动后；普通 Go 测试同时覆盖 SQLite，关键 PostgreSQL 门禁覆盖数据库负向场景 |
| `node scripts/qa/transaction-browser-isolated.mjs --run` | 冻结当前含未提交改动的源码副本，启动一次性 PostgreSQL / S3 / Go / Vite，执行接单与工程用料审批、采购、委外、库存、质检、生产、出货、应收应付结算及退款的桌面和手机浏览器链路、共享列表筛选及真实 PDF，以及 critical PostgreSQL gate，结束读回清理结果；`--source-orders` 只验证接单、工程用料、采购与委外；`--receiving` 只验证到货点数、采购退货与委外回货质检；两者均保留 PostgreSQL 门禁，不代表其他浏览器链路通过 | 验证页面、后端和数据库之间的业务闭环；不自动加入全量门禁 |
| `node --test scripts/qa/schema-docs.test.mjs` | 校验 Ent generated migration descriptor、业务语义 catalog 与 8 份生成数据字典零漂移；不连接数据库 | 调整 schema、catalog、生成器或数据库文档后 |

### 页面、流程与打印

| 入口 | 用途 | 建议时机 |
| --- | --- | --- |
| `node --test scripts/qa/dev-page-governance.test.mjs` | 检查 DEV 菜单 route 唯一且留在 `/__dev`，普通页面由单一模块登记 affected 桌面渲染/溢出 smoke，专属页面保留各自唯一桌面场景；full/strict 默认不运行 DEV 视觉场景，且不登记 DEV 移动端、暗色、成功截图、固定密度或通用键盘合同 | 新增菜单、页面或修改工作台可见内容时 |
| `node --test scripts/qa/dev-quality-gate-provider-boundary.test.mjs` | 检查质量工作台直接投影服务器 provider 返回的 CI Job，并只用正式流水线与终态门禁判定结果；前端不保存需随 Job 增删改名同步的第二份拓扑 | 修改 GitLab CI 证据 provider、质量工作台或 Job 编排时 |
| `node scripts/qa/output-retention-preview.mjs --protect-sha <40sha> --out output/dev-workbench/retention/previews/<name>.json` | 对登记的 managed output 生成数量与 5GiB 容量预算预览，保护最新状态、operation 引用和显式 SHA；无 `--apply`，不删除文件 | 定期检查本地证据膨胀 |
| `node scripts/qa/database-cleanup.mjs --database-name <name> --inventory <report> --manifest <manifest> --print-confirmation` | 从同一 inventory 与 archive manifest 生成精确确认串。执行时暂时关闭源库连接，逐项比较其隔离克隆与归档的逻辑内容，匹配后才删除并读回。内容变化时保留源库并恢复原连接设置。执行需具备克隆、导出和清理权限，登记 133 仍要求显式传入 `--allow-registered-development` | archive / restore 已通过后清理同一 disposable 库 |
| `node --test scripts/qa/dev-entry-boundary.test.mjs` | 锁住 `make dev_restart`先预检再停服、启动预检只读，以及 Product Core / 客户开发入口共用同一 web preflight | 调整本地启动命令、Vite 代理或 migration 预检后 |
| `node scripts/qa/exception-flow-real-write-browser.mjs ...` | 仅在精确确认的全新 browser_actions 隔离库验证三条异常流真实写链；详见下文。 | 异常流主路径完成 API / 单元验证后的本地写验收 |

### 客户、模拟数据与验收

| 入口 | 用途 | 建议时机 |
| --- | --- | --- |
| `node scripts/qa/yoyoosun-role-jsonrpc-access.mjs --report output/qa/yoyoosun-role-jsonrpc-access/report.json` | 使用九岗位演示账号真实登录，逐岗验证允许读取、越权写入被拒绝和前后任务总量不串权；凭据只从服务端进程环境读取，预期业务写入为零，不等于完整角色协同闭环 | 本地后端与演示账号凭据就绪后 |
| `sh scripts/qa/populated-upgrade-preflight.sh --audit <populated-upgrade&#124;customer-config-cutover&#124;database-constraints> ...` | 对指定数据库运行固定 allowlist 的 migration 只读审计；不执行 migration 或自动数据治理 | 跨越存量升级、客户配置切换或关键约束收紧前 |
| `node scripts/qa/customer-package-lint.mjs --all` | 从构建期客户索引校验 demo、reference-customer 和 yoyoosun raw package；不 publish/activate | 调整客户包、catalog 或 schema 后 |
| `node scripts/qa/customer-config-runtime-manifest.mjs --all --mode preview` | 以 preview 模式编译并验证全部登记 draft 客户包的不可发布 manifest；不调用后端或写事实 | 调整 manifest compiler/effective-session 输入后 |
| `node scripts/qa/test-data-isolation-boundary.mjs --json` | 只读检查 Product Core demo seed、yoyoosun 模拟数据和真实导入准备边界，并锁住 dry-run 不具备执行能力 | 改 seed、fixture、模拟数据或导入准备工具后 |
| `node scripts/qa/manual-acceptance-catalog.mjs` | 生成只读页面验收目录，默认只输出。范围与步骤见[全页面试用验收数据](../../docs/engineering/全页面试用验收数据.md)。 | 准备全页面试用验收范围时 |
| `node scripts/qa/local-acceptance-lifecycle.mjs --commit <sha> --run-id <run>` | 默认只输出计划；显式执行在按批隔离库完成技术验收并清理，详见下文。 | 对 clean exact SHA 做本地完整技术验收时 |
| `node --test scripts/qa/customer-trial-133-data.test.mjs` | 锁住 133 数据写入前的新回滚点：固定目标 SSH 脚本使用 `erp_backup` 只读角色，复核 exact release / database / migration，完成 custom dump、`pg_restore --list`、SHA-256、原子落盘和脱敏回执；不接受浏览器主机、路径、DSN 或命令输入 | 调整 133 数据准备或备份回执合同后 |
| `node scripts/qa/manual-acceptance-dataset.mjs` | 默认生成双环境计划；显式 apply 才由串行 runner 写入模拟数据并校验回执。 | 准备或重放双环境全页面模拟数据时 |
| `node scripts/qa/manual-acceptance-source-data.mjs --target local-dev --data-version 2026.11.07-v9 --run-id 20261107-V9 --json` | 生成模拟主数据和源单计划，默认只读；身份、批次与允许写入见下文。 | 写入模拟源数据前确认数量、状态和边界时 |
| `node scripts/qa/manual-acceptance-account-scenarios.mjs --json` | 生成账号异常场景计划；实际 bootstrap 与补齐沿用下文固定目标合同。 | 核对登录与入口异常场景前 |
| `node scripts/qa/manual-acceptance-task-data.mjs --source-report <report> --data-version 2026.11.07-v9 --run-id 20261107-V9` | 准备九岗位模拟列表任务及正式流程位置证据；不代表真实客户数据或 UAT。 | 准备岗位任务端数据与流程位置证据前 |

### 客户、模拟数据与验收（续）

| 入口 | 用途 | 建议时机 |
| --- | --- | --- |
| `node scripts/qa/manual-acceptance-fact-data.mjs --source-report <report> --data-version 2026.11.07-v9 --run-id 20261107-V9 --json` | 按正式来源驱动 API 生成事实准备计划，默认只读。 | 写入模拟业务事实前 |
| `node scripts/qa/manual-acceptance-readiness.mjs` | 默认生成就绪核验计划；显式 verify 才读取运行数据。 | 写入后核对页面数据是否达到手工验收门槛时 |
| `node scripts/qa/manual-acceptance-browser.mjs --plan --base-url <local-url> --backend-url <local-url>` | 默认生成浏览器计划；真实模式登录并只读检查页面，不点击业务写动作。 | 核对真实账号、页面、岗位端和打印入口时 |
| `node scripts/qa/manual-acceptance-source-retire.mjs --data-version 2026.11.07-v9 --run-id 20261107-V9` | 默认 dry-run；仅预览受控退出，不物理删除、不处理活动流程或已过账事实。 | 无流程阻断的旧批次退出前 |
| `node scripts/qa/customer-config-effective-session-probe.mjs --json` | 无 Authorization 探测本地 `customer_config.get_effective_session`，确认后端可达和 `40302 未登录` 边界 | yoyoosun 静态入口已命中、但还没有真实登录证据时 |
| `node --test scripts/qa/customer-package-preview-boundary.test.mjs` | 锁住客户配置包 businessFlows / stateMachines / processPolicies 仍为 preview-only，不写 Fact、不覆盖 usecase 生命周期 | 调整客户包流程、状态机或策略预览后 |

### CI、发布与安全

| 入口 | 用途 | 建议时机 |
| --- | --- | --- |
| `bash scripts/qa/prepare-push.sh` | 默认对单一 `origin/main` 执行 remote/ref/range、git-log、严格 secrets、源码完整性和 affected 定向 Node 检查，通过后签发 30 分钟 `server-ci` 回执；高成本测试/构建由 GitLab exact-SHA CI 执行。非标准目标保持 affected/full 保守合同 | commit 后、立即 push 前 |
| `bash scripts/qa/prepare-push.sh --full` | 经明确授权的本地完整诊断；完整执行 full，并在前后身份和容器清理读回一致后签发短期回执，不作为默认 `origin/main` 的前置步骤 | full 已明确确认、需要独立本地诊断时 |
| `bash scripts/qa/strict.sh` | full 的真实覆盖超集：先运行独有 shell / YAML 检查，再以 strict profile 单次运行 full；扩展视口、零 warning 和严格 govulncheck 各执行一次；各阶段输出统一耗时标记 | 发版前 / 大改后 |
| `bash scripts/qa/full.sh` | 完整本地检查；一次运行五个显式 Node 测试组，不复跑会由 Web / server 全集覆盖的 fast 子集；资源敏感发布合同在 shared / Web / server 汇合后单独执行；另含 secrets、Chromium、根入口浏览器 smoke、存量升级、当前 schema PostgreSQL、前后端测试 / 构建和 govulncheck；DEV 页面与共享布局桌面 smoke 由 affected 选择，不进入默认场景集 | 独立完整诊断、prepare-push 或 strict 内部 |
| `node scripts/qa/run-gate-with-receipt.mjs --gate <full&#124;strict>` | 执行正式门禁并写入同一脱敏回执；passed 必须具备完整阶段耗时、非零测试、零失败、零 skip 和运行前后仓库身份一致，工作台据此展示总耗时与瓶颈 | 需要可核验效能证据时 |
| `node scripts/qa/candidate-sha-freeze.mjs --sha <40sha> --terminal <strict-terminal.json>` | 在已通过 strict 的 clean exact HEAD 上固定执行复用/失败/公网读回/DEV 隔离合同，以及版本中心桌面真实浏览器 smoke；生成单一候选冻结回执，不建立 DEV 移动端或暗色验收承诺，也不替代远端 CI、Release 或 133 发布 | 最终候选第一次正式 push 前 |
| `.gitlab-ci.yml` | canonical `plan → prepare → 七类外部证据 DAG → aggregate → CI Gate`；Node 与 resource-sensitive 分别在内部按真实资源边界 fan-in，并保留每条 lane 的时间窗，对外仍只有七类规范回执；MR 保留 affected，main 完整 CI 签发可复用 exact-SHA 证据，纯文档只运行三个轻量 Job，受保护 release 不重跑 strict，同 SHA 只构建一次候选制品并冻结演练回执后登记 GitLab Package/Release | GitLab main、merge request、受保护 release |
| `node --test scripts/qa/github-write-boundary.test.mjs` | 检查 GitHub 只读镜像的仓库边界，包括 workflow 和交付适配器的退役 | GitHub 镜像、发布 Provider 或 release 目录变化时 |
| `node --test scripts/qa/gitlab-storage.test.mjs scripts/qa/gitlab-backup-governance.test.mjs` | 校验 GitLab 控制主机、RAID/异机挂载、加密副本、状态新鲜度、systemd timer 与 HTTPS 失败通知的 fail-closed 合同；不执行真实备份或发出网络通知 | GitLab backup、offsite、systemd 或告警入口变化时 |

`affected` 的 v2 计划协议把验证范围与本地门禁强度分开：`affectedScopes` / `maxAffectedScope` 只使用 T0-T8 稳定键，`localGate` 只取 `focused` 或 `full`。本地完整门禁命令使用独立的 `LOCAL_FULL` scope，不会因此把 T8 写入受影响范围；T8 只用于真实发布、部署、恢复或回滚证据。

普通前端 JS / JSX / MJS 的选测在每次计划中读取现有 Web 源码及测试，沿字面量文件引用反查间接调用方，支持相对路径、`@/`、目录入口和重新导出，并保留同名测试。读取源码、遍历目录或动态导入的测试及其调用方保守保留，因为静态引用不能证明它们的完整范围；不维护第二份逐页面测试清单或持久缓存。

没有可识别覆盖、文件删除、全局入口或 CSS 变更仍选择 Web 全集；页面的真实浏览器 follow-up 继续单列。纯测试文件修改只运行相关测试，不机械追加业务页面 lint 或浏览器。

`scripts/deploy/` 中已登记在现有 `release` 测试组且仍存在的 `.test.mjs` 可定向串行执行。发布执行逻辑、删除或未登记的测试以及 `resource_sensitive` 组仍走完整门禁；定向测试不等于发布或恢复验证。main 的完整 CI、发布前置证据和测试执行数检查保持原有合同。

## 业务数据一致性 / Business Data Consistency

运行 `node scripts/qa/business-data-consistency.mjs --write`，或在测试工作台运行“业务数据一致性专项”。`--plan` 仅列出登记用例对应命令。目录、结果身份与证据边界见[自动化测试策略](../../docs/product/自动化测试策略.md#业务数据一致性专项--business-data-consistency)；真实数据库仍复用 `test-critical` 隔离门禁。
