# QA 脚本 / QA Scripts

本文是 `scripts/qa/` 的目录入口。仓库级脚本总览仍在 [scripts/README.md](../README.md)；测试选择和验证层级真源仍在 [docs/product/自动化测试策略.md](../../docs/product/自动化测试策略.md)。

## 目录职责

`scripts/qa/` 只放本地验收、静态守卫、边界扫描和测试编排脚本。它可以读取代码、配置、文档和本地输出，必要时生成 ignored evidence；它不负责生产发布、不直接导入真实客户数据、不替代后端 RBAC / Workflow / Fact usecase。

## 常用入口

| 入口                                                                                                                                | 用途                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 建议时机                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `bash scripts/qa/affected.sh --plan`                                                                                                | 读取当前工作树、staged、指定 base 或显式文件，按验证范围（内部键 T0-T8）和受影响领域输出最小必要测试；默认只计划，未知路径保守升级为 `full.sh`                                                                                                                                                                                                                                                                                                                                                                                                                                               | 开发过程中、准备验证前                           |
| `bash scripts/qa/affected.sh --run`                                                                                                 | 执行 affected 选出的安全本地命令并记录逐项耗时；页面级浏览器回归（Style L1）、`make data` 和目标环境证据仍作为 required follow-up 单列                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 完成一个可验证切片后                             |
| `node --test scripts/qa/dev-page-governance.test.mjs`                                                                               | 检查 DEV 菜单 route 唯一且留在 `/__dev`，普通页面由单一模块登记 affected 桌面渲染/溢出 smoke，专属页面保留各自唯一桌面场景；full/strict 默认不运行 DEV 视觉场景，且不登记 DEV 移动端、暗色、成功截图、固定密度或通用键盘合同                                                                                                                                                   | 新增菜单、页面或修改工作台可见内容时                |
| `node --test scripts/qa/dev-quality-gate-provider-boundary.test.mjs`                                                                | 检查质量工作台直接投影服务器 provider 返回的 CI Job，并只用正式流水线与终态门禁判定结果；前端不保存需随 Job 增删改名同步的第二份拓扑                                                                                                                                                                                                                                           | 修改 R640 CI 证据 provider、质量工作台或 Job 编排时 |
| `bash scripts/qa/fast.sh`                                                                                                           | 高频快速检查，只运行显式 `fast` Node 测试组，并覆盖文档清单、客户配置、菜单、Web 静态检查和 server quick；阶段编号只由 affected 扫描本次变更文件                                                                                                                                                                                                                               | 日常开发后                                          |
| `node scripts/qa/yoyoosun-role-jsonrpc-access.mjs --report output/qa/yoyoosun-role-jsonrpc-access/report.json`                      | 使用九岗位演示账号真实登录，逐岗验证允许读取、越权写入被拒绝和前后任务总量不串权；凭据只从服务端进程环境读取，预期业务写入为零，不等于完整角色协同闭环                                                                                                                                                                                                                                                                                                                                                                                                                                       | 本地后端与演示账号凭据就绪后                     |
| `bash scripts/qa/prepare-push.sh`                                                                                                   | 默认仅对单一 `origin/main` 签发 30 分钟 `server-ci` 回执：复算 affected 风险，但本地只运行 remote/ref/range、git-log、严格 secrets 与源码完整性短门禁；高成本测试/构建由 R640 exact-SHA CI 执行。非标准目标保持 affected/full 保守合同                                                                                                                                                                                                                                                                                                                                                         | commit 后、立即 push 前                          |
| `bash scripts/qa/prepare-push.sh --full`                                                                                            | 经明确授权后处理 high-risk 计划或发布候选；完整执行 full，并在前后身份和容器清理读回一致后签发同类短期回执                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | full 已明确确认、发布候选准备时                  |
| `bash scripts/qa/prepare-push.sh --review --remote github`                                                                         | 为网页 GPT / GitHub 审查签发独立 review-only 回执；固定 GitHub clean `main -> review/gpt` 且只允许 fast-forward，只跑提交格式与逐范围严格 secrets，并记录正式推送建议但不执行 affected/full                                                                                                                                                                                                                                                                                                                                                                                             | 获得 Git 授权后、只更新审查快照时                |
| `node scripts/qa/skill-health.mjs`                                                                                                  | 检查项目 Skill frontmatter、目录名、metadata、README 索引和相对引用；`affected` 对 Skill 变更会直接执行，不再只提示 follow-up                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 修改 `.agents/skills/**` 后                      |
| `node scripts/qa/erp-field-linkage.mjs`                                                                                             | 运行字段联动专项，前后绑定同一仓库指纹，并把脱敏结构化证据写入 `output/qa/coverage/field-linkage.latest.json`；只证明该专项，不代表整仓覆盖                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 修改字段来源、映射、回显或打印链路后             |
| `node scripts/qa/test-coverage-collect.mjs --profile baseline --write`                                                              | 在同一仓库身份下运行非数据库 baseline，采集 Go / Web 代码覆盖、显式业务场景、字段联动、导入合同和受影响验证范围（内部键 T0-T8），再原子写入证据并聚合 latest；运行期身份变化即失败                                                                                                                                                                                                                                                                                                                                                                                                           | 刷新开发工作台真实覆盖证据前                     |
| `node scripts/qa/test-coverage-report.mjs --write`                                                                                  | 聚合当前 commit / worktree 指纹、真实代码覆盖制品、业务场景、验证范围（内部键 T0-T8）与验收状态到 `output/qa/coverage/latest.json`；缺制品写 `missing`，不自动运行全量测试                                                                                                                                                                                                                                                                                                                                                                                                                   | 刷新开发工作台覆盖状态前                         |
| `bash scripts/qa/strict.sh`                                                                                                         | full 的真实覆盖超集：先运行独有 shell / YAML 检查，再以 strict profile 单次运行 full；扩展视口、零 warning 和严格 govulncheck 各执行一次；各阶段输出统一耗时标记                                                                                                                                                                                                                                                                                                                                                                                                                             | 发版前 / 大改后                                  |
| `bash scripts/qa/full.sh`                                                                                                           | 完整本地检查；一次运行五个显式 Node 测试组，不复跑会由 Web / server 全集覆盖的 fast 子集；资源敏感发布合同在 shared / Web / server 汇合后单独执行；另含 secrets、Chromium、根入口浏览器 smoke、存量升级、当前 schema PostgreSQL、前后端测试 / 构建和 govulncheck；DEV 页面与共享布局桌面 smoke 由 affected 选择，不进入默认场景集                                              | 独立完整诊断、prepare-push 或 strict 内部           |
| `node scripts/qa/run-gate-with-receipt.mjs --gate <full\|strict>`                                                                   | 执行正式门禁并写入同一脱敏回执；passed 必须具备完整阶段耗时、非零测试、零失败、零 skip 和运行前后仓库身份一致，工作台据此展示总耗时与瓶颈                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 需要可核验效能证据时                             |
| `node scripts/qa/run-gate-with-managed-database.mjs --exact-sha <40sha> --main-ref HEAD --operation-id <uuid>`                      | 本地 clean 候选的唯一受管 exact-SHA 入口；复用固定 `postgres:18.1`、随机凭据、loopback 动态端口和精确 cleanup，再以无 shell 的固定参数执行 `exact-sha-gate.mjs`；DSN 只进入子进程环境，终态仍以 exact-SHA gate 为唯一真源                                                                                                                                                                                                                                                                                                                                                                    | 本地候选提交后、prepare-push 前                  |
| `run-gate-with-managed-database.mjs`                                                                                                | 质量门禁页面的 full / strict 内部包装器；固定使用本机 `postgres:18.1`，为每次 operation 生成随机凭据和 loopback 动态端口，执行原正式 runner 后按精确 label 删除容器并读回零残留；不接受浏览器提供命令、DSN、镜像或凭据                                                                                                                                                                                                                                                                                                                                                                       | DEV 页面未显式登记本机数据库 base 时             |
| `node scripts/qa/exact-sha-gate.mjs --sha <40sha> [--run]`                                                                          | 绑定 clean SHA、strict profile、锁文件和门禁实现形成 fingerprint；已有同 fingerprint 终态时复用，不自动新开 lifecycle                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 不可变 Release workflow                          |
| `node scripts/qa/ci-quality-shard.mjs --shard <name>`                                                                               | 只在 protected main 的 R640 GitLab 上生成七类固定外部 strict 分片之一；Node 类聚合内部 `core / release_preflight / release_a / release_b`，resource-sensitive 类聚合内部 `contract / runtime`，两者对外仍各自只保留一个规范回执；所有回执继续绑定同一 plan/range/exact SHA，并保留资源清理读回                                                                                                                                                                                                                              | GitLab main 普通 CI；不提供本地通用入口              |
| `node scripts/qa/ci-quality-aggregate.mjs`                                                                                           | 精确聚合七个分片、可信 plan 与资源清理证据，签发标准 v3 exact-SHA strict terminal 和可上传的 CI evidence manifest；缺任一分片、分类执行数或身份均失败关闭                                                                                                                                                                                                                                                                    | GitLab main 普通 CI 聚合；不证明 Release 或目标部署 |
| `node scripts/qa/candidate-sha-freeze.mjs --sha <40sha> --terminal <strict-terminal.json>`                                          | 在已通过 strict 的 clean exact HEAD 上固定执行复用/失败/公网读回/DEV 隔离合同，以及版本中心桌面真实浏览器 smoke；生成单一候选冻结回执，不建立 DEV 移动端或暗色验收承诺，也不替代远端 CI、Release 或 133 发布                                                                                                                                                                   | 最终候选第一次正式 push 前                          |
| `node scripts/qa/output-retention-preview.mjs --protect-sha <40sha> --out output/dev-workbench/retention/previews/<name>.json`      | 对登记的 managed output 生成数量与 5GiB 容量预算预览，保护最新状态、operation 引用和显式 SHA；无 `--apply`，不删除文件                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 定期检查本地证据膨胀                             |
| `node scripts/qa/database-inventory.mjs --out <report.json>`                                                                        | 从环境中的固定数据库 URL 只读盘点同服务器项目库、连接数、migration、仓库引用和 disposable 分类；不授权删除                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 发布演练前后或发现临时库堆积时                   |
| `node scripts/qa/database-archive.mjs --database-name <name> --out <dir>`                                                           | 只接受已登记 disposable 库且要求零连接；生成归档并在临时 restore 库核对 migration、schema 与逐表计数，最后删除 restore 库并读回零残留                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 清理候选库取得可恢复证据时                       |
| `node scripts/qa/database-cleanup.mjs --database-name <name> --inventory <report> --manifest <manifest> --print-confirmation`       | 从同一 inventory 与 archive manifest 生成精确确认串；正式 cleanup 还需通过环境提供 admin URL、传入确认串和输出报告，成功后读回源库已不存在。登记 106 仅在三个命令均显式加 `--allow-registered-development` 时开放；长期或未分类库始终拒绝                                                                                                                                                                                                                                                                                                                                                    | archive / restore 已通过后清理同一 disposable 库 |
| `sh scripts/qa/populated-upgrade-preflight.sh --audit <populated-upgrade\|customer-config-cutover\|database-constraints> ...`       | 对指定数据库运行固定 allowlist 的 migration 只读审计；不执行 migration 或自动数据治理                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 跨越存量升级、客户配置切换或关键约束收紧前       |
| `.gitlab-ci.yml`                                                                                                                    | canonical `plan → prepare → 七类外部证据 DAG → aggregate → CI Gate`；Node 与 resource-sensitive 分别在内部按真实资源边界 fan-in，并保留每条 lane 的时间窗，对外仍只有七类规范回执；MR 保留 affected，main 普通 CI 签发可复用 exact-SHA 证据，受保护 release 不重跑 strict，同 SHA 只构建一次候选制品并冻结演练回执后登记 GitLab Package/Release                                                                                                                                                                                      | GitLab main、merge request、受保护 release       |
| `.github/workflows/ci.yml`                                                                                                          | GitHub Review Mirror CI；只响应 PR、精确 `review/gpt`、`review/gpt/**` 与手工运行，不响应镜像 main，也不签发 canonical exact-SHA 回执                                                                                                                                                                                                                                    | GPT Review 镜像审查                              |
| `.github/workflows/release.yml`                                                                                                     | GitHub 应急发布保护壳；在 canonical v2 七资产与同一演练回执完整接入前，于 checkout、登录、构建或上传前固定失败关闭，禁止六资产部分发布                                                                                                                                                                                                                                  | 应急发布合同回归                                 |
| `node scripts/qa/docs-inventory.test.mjs`                                                                                           | 检查当前维护 Markdown 是否登记到 `docs/文档清单.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 新增、删除、重命名 README 或长期文档后           |
| `node --test scripts/qa/schema-docs.test.mjs`                                                                                       | 校验 Ent generated migration descriptor、74 表业务语义 catalog 与 8 份生成数据字典零漂移；不连接数据库                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 调整 schema、catalog、生成器或数据库文档后       |
| `node --test scripts/qa/dev-entry-boundary.test.mjs`                                                                                | 锁住 `make dev_restart`先预检再停服、启动预检只读，以及 Product Core / 客户开发入口共用同一 web preflight                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 调整本地启动命令、Vite 代理或 migration 预检后   |
| `node scripts/qa/customer-package-lint.mjs --all`                                                                                   | 从构建期客户索引校验 demo、reference-customer 和 yoyoosun raw package；不 publish/activate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 调整客户包、catalog 或 schema 后                 |
| `node scripts/qa/customer-config-runtime-manifest.mjs --all --mode preview`                                                         | 以 preview 模式编译并验证全部登记 draft 客户包的不可发布 manifest；不调用后端或写事实                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 调整 manifest compiler/effective-session 输入后  |
| `node scripts/qa/private-deployment-boundaries.mjs`                                                                                 | 检查三份客户文档、三份配置和最小部署参数边界，并禁止 reference 部署目录                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 调整私有化模板或 reference 文档后                |
| `node scripts/qa/phase-label-boundaries.mjs` + `node --test scripts/qa/phase-label-boundaries.test.mjs`                             | 全仓扫描活跃代码、脚本和正式文档中的编号阶段命名，并验证完整 Phase 编号、P 子阶段编号和 P 编号发布目标会被拒绝；P0/P1 风险等级、p95 百分位和产品编码不受影响                                                                                                                                                                                                                                                                                                                                                                                                                                 | 改脚本、API、命名或治理文档后                    |
| `node scripts/qa/experimental/canonical-runtime-audit.mjs`                                                                          | 非阻断实验审计；宽泛 keyword 命中只作只读复核线索，不进入 fast / affected，不代表产品缺陷或发布证据；恢复阻断前必须改成逐域 status key / API field / function / runtime branch 精确合同                                                                                                                                                                                                                                                                                                                                                                                                      | 需要人工盘点历史词命中时                         |
| `node scripts/qa/test-data-isolation-boundary.mjs --json`                                                                           | 只读检查 Product Core demo seed、yoyoosun 模拟数据和真实导入准备边界，并锁住 dry-run 不具备执行能力                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 改 seed、fixture、模拟数据或导入准备工具后       |
| `node scripts/qa/manual-acceptance-catalog.mjs`                                                                                     | 生成 51 项只读基线验收目录，覆盖登录入口、30 个电脑业务页、九岗位任务端、打印预览与打印工作台；默认只输出、不连接后端                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 准备全页面试用验收范围时                         |
| `node scripts/qa/local-acceptance-lifecycle.mjs --commit <sha> --run-id <run>`                                                      | 默认输出本地统一生命周期 plan；显式 `--execute` 后在两个按批隔离库串行完成 migration、九岗位数据、51 项只读浏览器与三条真实写异常流，并在成功或失败后停服、删库和读回残留                                                                                                                                                                                                                                                                                                                                                                                                                    | 对 clean exact SHA 做本地完整技术验收时          |
| `node scripts/qa/scenario-demo-data.mjs`                                                                                            | 默认只读输出固定 V6 长期数据计划；本地开发与 `customer-trial-133` 复用同一 canonical 业务语义和九阶段 runner，但数据库、release、migration、客户配置、账号命名、attestation 与回执独立。133 的密码值由固定公开测试凭据合同约束，不构成数据共库。精确 plan digest 和确认串匹配后才通过正式 API exact-create-or-readback；不清理、不重置，不把查询读回写成人工验收或真实客户导入                                                                                              | 需要为本地或 133 长期保留固定业务场景数据时      |
| `node --test scripts/qa/customer-trial-133-data.test.mjs`                                                                           | 锁住 133 数据写入前的新回滚点：固定目标 SSH 脚本使用 `erp_backup` 只读角色，复核 exact release / database / migration，完成 custom dump、`pg_restore --list`、SHA-256、原子落盘和脱敏回执；不接受浏览器主机、路径、DSN 或命令输入                                                                                                                                                                                                                                                                                         | 调整 133 数据准备或备份回执合同后               |
| `node scripts/qa/manual-acceptance-dataset.mjs`                                                                                     | 默认生成 local 与 133 同语义计划；显式 `--apply --target` 后由唯一串行 runner 调用同一组正式 API 入口并校验严格阶段回执                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 准备或重放双环境全页面模拟数据时                 |
| `node scripts/qa/manual-acceptance-source-data.mjs --target local-dev --data-version 2026.08.15-v6 --run-id 20260815-V6 --json`     | 生成带稳定批次前缀的客户、供应商、产品规格、材料、加工环节及销售 / 采购 / 委外 / BOM 源数据计划；默认只读                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 写入模拟源数据前确认数量、状态和边界时           |
| `node scripts/qa/manual-acceptance-account-scenarios.mjs --json`                                                                    | 生成停用、多岗位和无业务入口三种补充账号计划；在已完成首个管理员 bootstrap 的 fresh 本地 / 133 验收库中，创建或精确核对十个正式岗位账号，再调和三类场景账号                                                                                                                                                                                                                                                                                                                                                                                                                                  | 核对登录与入口异常场景前                         |
| `node scripts/qa/manual-acceptance-task-data.mjs --source-report <report> --data-version 2026.08.15-v6 --run-id 20260815-V6`        | 生成九岗位各 20 条、共 180 条仅供列表 / 办理交互的模拟任务；apply 时另从同批 source report 选择 5 张模拟销售订单，走正式 ProcessRuntime 路径形成已启动、待办、阻塞、退回和完成证据。整批仍为 `simulatedOnly`，不代表真实客户数据或 UAT                                                                                                                                                                                                                                                                                                                                                       | 准备岗位任务端数据与流程位置证据前               |
| `node scripts/qa/manual-acceptance-fact-data.mjs --source-report <report> --data-version 2026.08.15-v6 --run-id 20260815-V6 --json` | 复用已核验源数据，按正式来源驱动 API 统一准备采购、质检、库存、生产、出货和财务事实；默认只读                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 写入模拟业务事实前                               |
| `node scripts/qa/manual-acceptance-readiness.mjs`                                                                                   | 生成 51 项只读就绪核验计划，并校验每页只引用共享 role / source / task / facts / catalog 阶段；显式 `--verify --backend-url` 才查询运行数据                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 写入后核对页面数据是否达到手工验收门槛时         |
| `node scripts/qa/manual-acceptance-browser.mjs --plan --base-url <local-url> --backend-url <local-url>`                             | 生成 51 项本机浏览器验收计划；真实模式只登录、逐页读取和切换只读任务页签，列表及两个数据看板都必须取得当前页面数据证据，不点击业务写动作                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 核对真实账号、页面、岗位端和打印入口时           |
| `node scripts/qa/exception-flow-real-write-browser.mjs ...`                                                                         | 仅在显式确认的全新本地 `browser_actions` 隔离库中，用真实 Chromium 和真实后端办理 Finance Payment、Inventory Adjustment、Production OVER_ISSUE 三条业务写链；它补充 51 项只读页面检查中的真实写动作证据，不是长期场景数据来源或客户 UAT                                                                                                                                                                                                                                                                                                                                                      | 异常流主路径完成 API / 单元验证后的本地写验收    |
| `node scripts/qa/manual-acceptance-source-retire.mjs --data-version 2026.08.15-v6 --run-id 20260815-V6`                             | 默认 dry-run，预览无活动流程阻断的源单取消 / 归档与主数据停用；不处理 active / blocked ProcessRuntime、已过账事实或物理删除。上一固定 V5 批次的流程位置证据要完整清理时必须重建专用验收库                                                                                                                                                                                                                                                                                                                                                                                                        | 无流程阻断的旧批次退出前                         |
| `node scripts/qa/customer-config-effective-session-probe.mjs --json`                                                                | 无 Authorization 探测本地 `customer_config.get_effective_session`，确认后端可达和 `40302 未登录` 边界                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | yoyoosun 静态入口已命中、但还没有真实登录证据时  |
| `node --test scripts/qa/customer-package-preview-boundary.test.mjs`                                                                 | 锁住客户配置包 businessFlows / stateMachines / processPolicies 仍为 preview-only，不写 Fact、不覆盖 usecase 生命周期                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 调整客户包流程、状态机或策略预览后               |

`affected` 的 v2 计划协议把验证范围与本地门禁强度分开：`affectedScopes` / `maxAffectedScope` 只使用 T0-T8 稳定键，`localGate` 只取 `focused` 或 `full`。本地完整门禁命令使用独立的 `LOCAL_FULL` scope，不会因此把 T8 写入受影响范围；T8 只用于真实发布、部署、恢复或回滚证据。

## 主要脚本分组

| 分组                 | 典型脚本                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 边界                                                                                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 编排入口             | `fast.sh`、`strict.sh`、`full.sh`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 只编排本地检查，不代表目标环境 release evidence 已完成                                                                                                                                                       |
| 文档、命名与真源守卫 | `docs-inventory.test.mjs`、`schema-docs.test.mjs`、`phase-label-boundaries.mjs`、`experimental/canonical-runtime-audit.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 前三者阻断 Product Core 路径、数据字典和命名漂移；canonical broad scan 仅为显式非阻断实验审计，不进入 fast / affected，不能替代逐域合同、migration、目标结构读回或 runtime 验证                              |
| 客户交付文档专项     | `yoyoosun-role-flow-handbook.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 只在包含受控永绅文档的完整 checkout 中显式运行；由 `affected` 在客户资料变化时选择，不进入 Core fast / full / strict 或源码包                                                                                |
| 开发测试固定动作     | `dev-testing-operation-store.mjs`、`dev-qa-execution-lock.mjs`、`run-gate-with-receipt.mjs`、`yoyoosun-role-jsonrpc-access.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                   | DEV 入口只接受 `fast / role-access / field-linkage` 固定意图；计划只读，三项结果独立，浏览器不能提供命令、参数、路径、环境变量或凭据                                                                         |
| 质量门禁运行与治理   | `run-gate-with-receipt.mjs`、`run-gate-with-managed-database.mjs`、`dev-quality-gate-operation-store.mjs`、`quality-gate-catalog.mjs`、`../../web/dev-server/devQualityGatePlugin.mjs`                                                                                                                                                                                                                                                                                                                                                                                            | DEV 页面只接受 `full / strict` 固定动作；正式 runner 与回执仍是唯一执行和结果真源，托管数据库包装器只负责本机隔离环境生命周期，本地 operation 只保存有界脱敏状态                                             |
| 覆盖证据             | `erp-field-linkage.mjs`、`test-coverage-collect.mjs`、`test-coverage-report.mjs`、`dev-coverage-operation-store.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                              | baseline 只执行明确列出的非数据库本地测试；DEV 入口只接受固定 collect intent，以幂等索引和全局 QA 锁串行执行；业务域只按显式场景 ID 计数，未采集、过期、跳过、阻塞和零执行必须单列，不把历史绿色换算成覆盖率 |
| 本地开发库迁移       | `../local-migration-workflow.mjs`、`dev-database-migration-operation-store.mjs`、`../../web/dev-server/devDatabaseMigrationPlugin.mjs`、`../../web/dev-server/devDatabaseMigrationRuntime.mjs`                                                                                                                                                                                                                                                                                                                                                                                    | CLI 与 DEV 页面复用登记共享开发库的 status / plan / backup-restore / apply / readback / restart 服务；固定意图、幂等、单执行锁、执行前复核备份、无自动重试，不接受任意目标、命令、SQL 或凭据                 |
| 客户配置与私有化边界 | `config/customers/index.test.mjs`、`scripts/build/apply-customer-web-config.test.mjs`、`customer-config-boundaries.mjs`、`customer-config-effective-session-probe.mjs`、`customer-package-lint.mjs`、`customer-package-preview-boundary.test.mjs`、`customer-config-runtime-manifest.mjs`、`private-deployment-boundaries.mjs`、`private-deployment-package-closure.test.mjs`                                                                                                                                                                                                     | 只做构建期索引、overlay、lint / preview / manifest 编译、无凭据读回探针和模板边界检查；`boundariesSatisfied` 不等于交付、evidence 或签收完成，不写 Fact                                                      |
| Workflow / Fact 边界 | `workflow-fact-boundary.test.mjs`、`workflow-ui-action-boundary.test.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 防止协同任务路径越界写入事实层                                                                                                                                                                               |
| 测试数据隔离         | `test-data-isolation-boundary.mjs`、`local-acceptance-lifecycle.mjs`、`manual-acceptance-dataset.mjs`、`manual-acceptance-dataset-runner.mjs`、`manual-acceptance-page-data-contract.mjs`、`manual-acceptance-catalog.mjs`、`manual-acceptance-account-scenarios.mjs`、`manual-acceptance-source-data.mjs`、`manual-acceptance-task-data.mjs`、`manual-acceptance-fact-data.mjs`、`manual-acceptance-source-driven-facts.mjs`、`manual-acceptance-attachment-data.mjs`、`manual-acceptance-readiness.mjs`、`manual-acceptance-browser.mjs`、`manual-acceptance-source-retire.mjs` | Product Core、本地 / 133 同版模拟数据、页面归属、真实导入准备和执行门禁分桶检查；本地完整入口按批建库并自动回收，当前事实只走正式来源驱动 API，旧通用写入器不得回流                                          |
| 代码质量和安全       | `secrets.sh`、`error-codes.sh`、`go-vet.sh`、`govulncheck.sh`、`shellcheck.sh`、`shfmt.sh`、`yamllint.sh`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 按对应语言 / 配置类型补充检查，不替代业务回归                                                                                                                                                                |

## 门禁完整性与 CI 边界

`/__dev/quality-gates` 通过 development-only Bridge 异步调用固定的 full / strict 正式 runner。若开发服务已有合规的 loopback `DISPOSABLE_DATABASE_BASE_URL`，继续直接使用；未显式登记时，Bridge 会先核对本机 Docker 和固定 `postgres:18.1` 镜像，再由 `run-gate-with-managed-database.mjs` 为本次 operation 创建随机凭据、`127.0.0.1` 动态端口和精确标签的独立容器。默认 `origin/main` 的 `prepare-push.sh` 不进入该托管生命周期，只签发 `server-ci` 短门禁回执；显式 `--full` 或非标准 remote/ref 需要完整本地门禁时仍使用原受管路径，失败或清理读回不完整即形成终态失败。浏览器不能提交命令、参数、路径、数据库、镜像、环境变量、Git ref、DSN、凭据或 SSH 目标；服务端固定校验 loopback、same-origin、CSRF、JSON 合同和请求大小，并与 coverage / testing 共用唯一 QA 执行锁。

运行、取消和超时均按精确进程组收口。托管模式只有正式 receipt、门禁内部一次性数据库 cleanup、托管容器删除及不存在读回、进程组消失全部成立时才能标为通过；清理只允许当前 operation 且 repository label 同时匹配的容器，不处理外部容器或监听。浏览器关闭、开发服务中断、进程被强杀或任一清理事件缺失都会 fail closed，不会伪造绿色结果。

页面的最近记录保存在 ignored `output/dev-workbench/quality-gate-operations/**`，每个 profile 只保留最近 20 个已结束 operation；记录不保存日志、DSN、密码、token 或私有路径。`quality-gate-catalog.mjs` 只登记门禁职责、风险、正式来源引用、证据与退出条件，当前改动映射继续复用 `affected` 真源，阶段与最终结果继续读取同一正式 receipt。dirty / clean、full / strict 和不同 environment fingerprint 不混算；少于 3 个可比样本时明确报告样本不足，不生成健康分数，也不会自动禁用或删除门禁。

`node-test-groups.mjs` 将 scripts Node 测试显式登记为 `fast / database / browser / release / resource_sensitive`，新增 tracked 测试未登记、重复登记或路径失效都会阻断。`fast.sh` 只跑高频组；本地 `full.sh` 保持 shared / Web / server 三路并行，再串行资源敏感、关键 PostgreSQL、browser 和 govulncheck，用于独立诊断。R640 普通 main CI 对外仍固定为 static、Node contracts、Web、Server/PostgreSQL、resource-sensitive、browser 和 security 七类：Node contracts 内部将 `fast + database + browser` 合并为 `core` lane；原有 89 个 `release` 测试按实测长尾锚点拆为 `release_preflight` 1 项、`release_a` 44 项和 `release_b` 44 项，余项排序后交替分配，新测试仍只进入一条 lane。`production-preflight` 保持单独长尾，另外三项较慢合同固定分散到 A/B；三条 release lane 都保持 `--test-concurrency=1`，不拆测试文件内部逻辑。资源敏感合同把 39 个顶层测试按唯一 registry 分为 `contract` 21 项与 `runtime` 18 项，后者继续串行持有一次性容器、file/advisory lock、并发、timeout 和异常清理场景；Web 内部把 lint/stylelint/测试与 production build 拆为 `checks` / `build`；Server/PostgreSQL 内部把 environment/server core 与 critical PostgreSQL 拆为 `core` / `critical_postgres`，两条 lane 各自持有并清理独立 PostgreSQL，只有 core 需要 Chromium sandbox、runtime 和 `make data`。这十条 Node/resource/Web/Server 内部 lane 的每个 Job 都按 exact SHA、plan/range、完整清单、zero-skip 和清理读回 fan-in 为唯一 `node.json`、`web.json`、`server.json` / `resource.json`。Browser 另按场景与资源边界拆成三条 Job 内串行 lane，只读复用同一 SHA 的唯一 Web build digest，并按 pipeline/job/lane 隔离端口、Chromium、临时目录、lock 和输出；场景穷尽/互斥、取消/超时清理及 fan-in 仍只产出规范 `browser.json`。外部七类合同不变。每个可进入 Core CI 的分组 Node 测试因此恰好归属一次；客户交付文档专项仍只按 affected 或显式入口运行，不进入 Core CI。缺少、重复、额外、身份漂移或新 fixture 残留都会阻断，既存 fixture 现场不会被清理。每个 strict 阶段仍只归属一个外部分片，聚合后仍要满足完整分类执行数、零 skip、source integrity、`make data`、依赖审计和资源清理读回，不以并行代替覆盖。Node runner 失败时只在 ignored `output/qa/node-tests/<profile>-latest-failure.json` 写入有上限、已脱敏的结构化失败身份和耗时；不持久化原始 TAP、环境变量、参数、stdout / stderr、DSN、密码或 token，成功重跑会删除同 profile 的旧失败诊断。

R640 的 Playwright 运行包固定为 `playwright 1.58.2 / Chromium 145.0.7632.6 / revision 1208 / FFmpeg 1011`。`ci-playwright-runtime.mjs` 只接受三个固定 ZIP 的精确长度与 SHA-256，普通 job 只读取同项目 GitLab Generic Package 中的 `runtime.tar` 并再次校验内层 ZIP；仅当该 package 返回 404 时，protected main 的 push `prepare` job 才能消费一次已由运维 owner 在 CI 外下载、校验并通过受信 SSH 放入精确私有目录的 Runner 本地冷种子。脚本再次检查当前 uid、真实目录/普通文件、`0700/0600`、精确 inventory、长度和 SHA-256，随后上传 package、读回同一内容，并只删除已完整接受的种子；缺失或歧义不回退到 Runner 公网下载。Runner cache 只保存已校验的原始 ZIP，不信任已解压目录；需要 Chromium 的 job 在自己的 `output/runtime/gitlab/playwright-$CI_JOB_ID` 解压，校验可执行文件后使用，并在成功或失败时精确清理。不得回退到普通 job 的 live `playwright install`、备用 URL、浮动版本或未校验缓存。

本地 clean 提交需要 exact-SHA 终态时，只使用上表的受管命令；`--exact-sha` 只接受 40 位小写 SHA，`--main-ref` 只接受 `HEAD`，不能混入 full / strict 或任意命令参数。包装器只负责一次性数据库和进程清理，`exact-sha-gate.mjs` 仍是 terminal / receipt 的唯一真源。失败终态是该 SHA 与 fingerprint 的最终证据，不得删除、覆盖或重试；修复必须产生新提交和新 SHA 后再运行。

`full.sh` 默认拒绝继承的 `STYLE_L1_BASE_URL`，仅在本项目 `15200-15299` AUX 段为本轮选择空闲端口，并只清理自身启动的 Vite 进程。同一 worktree 的浏览器证据使用原子 PID 锁串行运行；活动锁直接阻断，stale lock 也保守失败且保留现场，只能在确认 owner 已不存在且没有门禁运行后手工清理。外部 base URL 只能用于显式单项 browser smoke，不能替代 full 的当前 worktree 证据。Server 阶段在唯一临时数据库中从历史 checkpoint 装载合成存量行，验证 055504 / 055825 两项只读 blocker、克重 kg→g 非空/NULL 存量转换和 latest pending=0；关键 PostgreSQL 矩阵使用同一 R640 Server 分片中的另一座唯一临时库，完成 migration、测试和 fail-closed 清理，不复用固定开发测试库。Server 阶段还启用真实 Chromium PDF 安全集成，本机自动发现 Chrome/Chromium，CI 则传入本 job 从已校验运行包解压出的精确可执行路径。安全集成未执行会以 Go skip 阻断 full。fast / full 的固定 Node 与 Go 测试除子进程退出码外，还要求可解析结果、实际执行数大于 0、失败数与跳过数均为 0；缺 summary、零执行或 skip 一律阻断。R640 CI 的 Web / Server 测试仍在进程内解析完整 TAP / Go JSON，但 job 只输出有界汇总，避免原始逐测试 trace 超过 GitLab 日志上限；本地 full 保留完整诊断输出。

`populated-upgrade-preflight.sh` 只接受 `populated-upgrade`、`customer-config-cutover` 和 `database-constraints` 三个 audit key，并把 DSN 仅从调用方指定的环境变量传给 `psql`。第一项检查 20260714055504 的状态、生命周期、取消审计束、流程锚点、版本和待删除时间字段，同时检查 WIP `20260717035245 -> 20260717043625` 委外关联切换：旧列仍有链接时阻断删除，切换后活动外发批次缺少 durable allocation 时也阻断；第二项检查 20260714055825 前必须显式治理的流程运行态与任务配置锚点；第三项在关键数据库约束收紧前只读核对现有约束和存量数据，任何不满足项都 fail closed。三项都使用 read-only 事务，不能修复或清理生产数据；出现 blocker 后必须停止 apply，由单独评审的治理动作处理，完成后重跑审计。

直接运行 full / strict 时，任何 `SKIP_*`、`STRICT_SKIP_*` 或调用者提供的旧 coverage 变量都会得到 `incomplete` 并失败；full 始终真实执行 secrets 与 govulncheck，不接受普通调用者自签 JSON 作为前序成功证明。默认单一 `origin/main` 的普通 `prepare-push` 只签发 `server-ci` 回执：保留聚合范围风险计划、数据库 guard、remote URL、live checks 和 gate-tree 指纹，但只执行 git-log 与严格 secrets；pre-push hook 在连接后按真实 stdin 重算并再执行同一短门禁。其他 remote/ref、多 ref 与显式 `--full` 保持 affected/full 保守合同。普通新 remote ref 的聚合范围固定为 `empty-tree..HEAD`，仍实际进入 affected / DB guard，不能消费 `server-ci` 回执。

`prepare-push --review` 是唯一例外：目标固定为 `refs/heads/main:refs/heads/review/gpt`，要求远端 main 与已有 review ref 都是当前 clean HEAD 的祖先。首次创建 review ref 时只检查 `remote-main..HEAD`，之后检查 `remote-review..HEAD`；准备和 hook 都运行 `git log --check` 与严格 secrets。review 回执使用独立文件，标明 `review-only / deliveryEligible=false`，普通 main、tag、其他 ref、多 ref 混推和非 fast-forward 都不能消费它。它不运行 affected/full、不证明代码可执行，也不替代 PR CI、正式推送或发布证据。任一步失败，外层都不能输出完整结果。

同一次 `prepare-push` 的远端 ref 读回每次尝试都受 20 秒硬超时约束，只对明确的超时、断连、拒绝连接、网络不可达和临时 DNS 失败做最多两次短间隔重试；权限、仓库、ref、响应合同及其他错误立即失败。三次尝试仍不可读时形成该次调用的终态失败，不补跑同一 SHA 的 affected/full，也不得绕过 pre-push hook。

开发阶段只跑 affected、同名测试和受影响单链浏览器。用户未指定分支而说“推送代码”时，默认先更新 `review/gpt`，网页 GPT 审查与 Codex 核对无有效阻断后，再把同一最终 HEAD 正式推到 `main`，不得连续双推；明确指定 `main`、`review/gpt` 或“让 GPT 分析”时只执行指定目标。候选变化后先重新更新 review ref，最终 main 成功后不再重复推 review ref。用户明确说“提交推送代码让 GPT 分析”即同时授权本轮精确相关改动的 stage/commit 和固定 `review/gpt` push，不再重复确认；该授权不包含无关脏路径、正式 `main`、发布或部署。所有 writer 收口且 clean `main` 只做必要的 fast-forward-only 上游同步后，用 `prepare-push --review` 更新远端固定审查 ref；分叉、范围不清、GPT 结果无法读回或检查失败时停止。网页分析产生的 findings、TODO 和规划仍须回到仓库核对。clean exact SHA 冻结并正式进入 main 前，默认 `origin/main` 只签发一次 `server-ci` 短门禁回执，高成本 affected/full/strict 由 R640 对推送后的 exact SHA 执行；显式本地 `--full` 仍可用于独立诊断，非标准目标继续保守执行本地计划。只有影响生产正确性、安全、数据完整性、权限或可恢复发布的缺陷才允许改候选并重新进入 affected。fixture、mock、选择器、测试文案、开发工作台或证据展示问题若不使生产结论失效，记录为后续事项，不扩展当前 QA 或重新跑全套。真实 CI / 目标阻塞只报告精确阻塞、清理状态和回滚点，不再新造一层门禁。

GitLab Runner 工具链读取 `.n-node-version`、`web/package.json#packageManager` 和 `server/go.mod`。`.gitlab-ci.yml` 的唯一 cache writer 是 `prepare`；它在下载或写入 cache 前先核对 Chromium sandbox 清理 helper 的 root 身份、mode 和当前 job 的精确无交互 sudo policy。四条 Node 内部 lane、Node fan-in 与 Web 分片只从同一 pnpm store 离线安装精确锁定的 Web 依赖，不写 cache；两条 resource 内部 lane 不消费该缓存。Server/PostgreSQL 和三条 Browser lane 另需消费同 key 的 Playwright ZIP，其他分片与 aggregate 不重复下载、解压无用缓存。三条 Browser lane 只读消费 `quality_web_build` 的同一 digest；动态 PostgreSQL 端口、job 唯一 Chromium sandbox、浏览器锁与输出目录都按 pipeline/job/lane 隔离。main 普通 push 聚合后的 exact-SHA terminal 绑定 repository、40 位 SHA、source archive、policy / workflow / toolchain / migration / lock / 客户配置指纹、分类执行数和真实 `gitlab-ci` push provenance，`CI Gate` 再将 terminal、receipt 和 manifest 固化到 exact pipeline/job/SHA 的 Generic Package。release 只接受 `CI_COMMIT_SHA == RELEASE_SHA` 的 protected main，服务器端回读该普通 CI 证据而不重跑 strict；同 SHA 候选制品只构建一次，以 `candidate.tar` 冻结后复用同一 bytes 做 migration、health/ready、smoke、备份恢复和重启演练，最后生成含同一 `release-rehearsal.json` 的 v2 七资产 Release。v1 六资产只允许精确读取、目录展示、校验和既有回滚，不能补传、重封装或 promotion；GitHub emergency 在完整接入 v2 七资产前于任何副作用前失败关闭。缓存只能缩短安装，不能跳过 checksum、依赖合同或门禁。`db-guard` 仍只是提前阻断的静态启发式，不能替代 Ent / Atlas 零漂移、冻结树 fresh / upgrade 验证或目标环境 evidence。

仓库内 workflow 只能证明 CI 定义存在。本地 hook 可被 `--no-verify` 绕过；GitLab protected branch、required `CI Gate`、protected variables/environment、Runner locked/tags 和 GitHub push mirror 是否启用必须另取远端设置证据，不能用本地 full / strict 或 workflow 文件存在来替代。

## 输出与写入边界

- 脱敏报告和模拟 evidence 默认写到 `output/**` 或调用方显式指定的 ignored 目录。
- 覆盖报告固定留在 `output/qa/coverage/**`，不得放入 `web/public/**`、生产构建或长期 Markdown。DEV 接口的 GET 只返固定 latest，POST 只接受固定 `collect + idempotencyKey`，拒绝调用方命令、参数、路径、环境变量、profile 和 query；接口仅本机、同源且带本次 DEV 会话 CSRF token。
- 覆盖基线操作状态固定留在私有 ignored 目录 `output/dev-workbench/coverage-operations/**`；开发测试固定动作状态留在 `output/dev-workbench/testing-operations/**`。两者只公开脱敏阶段投影，不保存或返回 stdout、stderr、PID、命令、幂等 key、环境变量或凭据。同 key 重试复用同一操作，且共同使用 `output/dev-workbench/qa-execution.lock`；覆盖基线、fast、岗位巡检和字段联动同一时间只能有一项运行，避免争用仓库身份和 canonical evidence。
- 数据库迁移操作状态固定留在私有 ignored 目录 `output/dev-workbench/database-migration-operations/**`，备份恢复制品固定留在 `output/dev-workbench/database-migration-backups/**`。公开 operation 不返回底层目标 / apply / 维护确认值、PID、命令、DSN 或真实路径；CLI 与页面执行器只允许登记共享开发库，使用幂等索引和跨进程排他锁，同一计划只 apply 一次，并在 apply 前重新验证准备阶段的备份文件身份。进程中断或提交结果不明确时先读回而不自动重试；非交互 prepare 的 exit 0 只表示 `ready / writes=0`，execute 读回通过才表示迁移完成。
- baseline 采集器先冻结仓库 identity 与 `affected` 层级，使用仓库锁定的 Node 与 pnpm，先以 `node scripts/gen-error-codes.mjs --check` 证明错误码生成物无漂移，再直接用项目 Node 执行 Web native coverage，避免 `pnpm test` 的 `pretest` 在采集中改写 tracked 文件。完成 Go / Web / import / field-linkage 后再次核对同一 identity 并自动聚合；字段联动 runner 也先在同目录 staging 生成 TAP 与报告，只有测试、builder 和身份复核均通过才最后提升 canonical 报告，失败时保留上一份。baseline evidence 和 candidate latest 同样先写 `output/qa/coverage/.staging/<uuid>/**`，候选 schema / repository / staging 泄漏检查和读回通过后，才按 evidence、字段联动和 latest 的顺序提升；latest 提升后的 identity 复核失败会恢复旧 latest。它不写 PostgreSQL、不运行真实业务浏览器、不探测 readiness、不部署、不做 UAT。受影响但未执行的层级必须保留 `missing`，只有未受影响层可写 `not_applicable`。
- 采集进程完成且仓库身份一致时，退出码 `0` 记为 `passed`，测试存在失败、缺失或零执行的退出码 `2` 记为 `issues` 并发布当前失败报告，避免旧绿色遮蔽当前结果；启动失败、进程/服务中断、报告读回失败或身份变化记为 `failed / not_proven`，不得替换上一份可读报告。当前版本不提供取消按钮，避免固定制品写到一半形成含糊终态；页面离开只停止轮询，不停止后台任务。
- Go 业务域与字段联动打印域使用脚本内显式 `scenario id -> package/test prefix`、`caseId` 注册表；不得以测试名、目录、退出码或文件数量推断领域完成。通用 full / strict 回执不能拆成 PostgreSQL、浏览器或目标验收通过。
- 字段联动报告只能由顶层 `erp-field-linkage.mjs` runner 生成，底层 builder 要求 runner 传入完整 repository identity，不是手工入口。裸 `--go-coverprofile` / `--web-coverage` 参数没有 repository identity，聚合器只能将其作为 `stale` 诊断；要记为当前代码证据，必须提供携带当前仓库指纹的 `--artifact` JSON。
- `output-retention-preview.mjs` 只扫描登记的 managed roots，按每组最近数量、最近 passed / failed / not_proven、显式 SHA 与 operation 引用给出 `keep / review_delete`；5GiB 是复核预算，不是自动删除阈值。未登记目录、符号链接和无效 metadata 均不得成为删除授权。
- 脚本不得把真实密码、token、完整 DSN、URL userinfo、原始客户文件内容或未脱敏输出写入仓库。
- 调整 QA 脚本后，至少运行对应 `node --check` / `node --test` 和 shell 语法检查；开发期按影响面运行专题命令，不因 QA 编排自身变化机械重跑 lifecycle。

## 全页面试用验收数据

当前唯一整批合同是 `2026.08.15-v6 / 20260815-V6`。本地隔离库和 `demo-133` 使用同一套业务含义、数量与状态矩阵，但数据库 ID 各自独立，不能复制表行或用“编号相同”代替读回证明。正式部署默认不执行这套数据；`customer-test-133` 是甲方干净测试/验收环境，禁止重放本合同。

`dataVersion` 表示一轮可重复、可验收的冻结模拟数据基线，不是 Git commit、代码版本或 operation 版本。纯样式、重构、性能优化及不改变数据结果的修复继续使用当前 V6；每次开发反馈仍以新的 operation / batch、隔离库和 exact commit 留证。只有单位含义、记录结构、生命周期 / 状态、业务链映射、稳定编码或数量合同发生不兼容变化，才集中升级 `dataVersion`。已持久落到本地或 demo 的冻结版本不得静默改写；旧基线保留用于说明当时测试内容。

`demo-133` 使用独立 Compose project `plush-toy-erp-demo-v1`、数据库 `plush_erp_demo_v1`、根目录 `/home/simon/plush-toy-erp-demo-v1`，PostgreSQL / API / Web 端口为 `55436 / 8325 / 5195`。所有精确路径、锁、Jaeger 端口和公网入口以 `scripts/deploy/deployment-targets.json` 为真源；正常整批造数只走后端 API。

demo 造数前必须先在固定 release 上完成登记 target 的 migration、preflight 和 runtime identity 读回。精确命令以 [Compose 迁移脚本](../../server/deploy/compose/prod/README.md#迁移脚本) 为唯一运维入口。运行 env 必须由当前用户持有、精确 `0600` 且无符号链接父路径；启动后必须以 `production-preflight.sh --runtime --expected-release <40sha>` 证明服务 image/content identity 与 app/web `GIT_SHA` 都绑定同一 release，才能进入配置激活与整批造数。

51 个正式验收目标统一登记在 `manual-acceptance-page-data-contract.mjs`。每页只能引用共享的 `role / source / task / facts / catalog` 阶段，不允许页面自带 builder、脚本或另一套 fixture；业务看板可以同时消费多个共享阶段，但不能另造页面数据。`manual-acceptance-dataset-runner.mjs` 直接消费相同的阶段入口。新增页面、probe 或入口发生漏登、重复或分叉时，readiness 合同测试会 fail closed。

业务链回归统一从 `manual-acceptance-business-chain-contract.mjs` 读取观察台的同一份步骤目录：先选择业务链，再展开步骤绑定的责任、前置状态、动作、结果状态和 Fact，最后只把已登记的合法场景投影到现有阶段。当前 11 条业务链共登记 67 个步骤和 66 个场景；每条链固定包含正常主路径、阻塞 / 退回 / 恢复、无权限、错误状态、取消 / 调整 / 冲正、重复提交 / 幂等六类。无权限和错误状态等非法结果只由合同测试或受控浏览器动作证明，不会为了覆盖而写入非法数据库状态。这个合同不新增 writer，顶层 `manual-acceptance-dataset.mjs` 和现有串行 runner 仍是唯一整批造数入口。

`/__dev/data-preparation` 直接读取该合同的可读投影，当前同时显示 11 条业务链、67 个步骤、66 个合法场景、9 个现有造数阶段和 51 个页面目标。页面里的业务链选择只用于展开核对，不创建局部 writer；“按最新业务链完整回归”每次都使用现有 lifecycle 建立新隔离批次，执行全部已登记合法场景，成功或失败后自动清理。规范 apply 回执记录造数总 `startedAt / completedAt / durationMs`，并对 9 个阶段分别记录同样的真实耗时；未开始的阶段保持空值，不能冒充 `0 ms`。

计划和规范总回执同时保存 `chainDataDigest` 与 `chainVerificationDigest`。代码变化后按下表处理，不需要 Codex 定时同步平行清单：

| 摘要比较                                   | 旧数据结论   | 现在做什么                                                                                       |
| ------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------ |
| 两个摘要都相同                             | 仍可用       | 保持当前 `dataVersion`，以新 operation / batch 绑定 exact commit 后继续回归                      |
| 数据摘要相同，验证摘要变化或旧验证摘要缺失 | 只需重新核验 | 保持当前 `dataVersion` 和长期数据，以新 operation / batch 重跑合同、readiness 与受影响浏览器场景 |
| 数据摘要变化或旧数据摘要缺失               | 必须重新造数 | 先在新隔离批次修正；仅语义不兼容或冻结下一轮 UAT 基线时升级 `dataVersion`，不覆盖旧回执          |

上述三类判断适用于需要保留的同批数据；完整回归本身默认每次新建隔离批次，因此不会把旧数据库继续当作本次回归输入。旧回执仍保留用于比较对应旧计划和耗时，但不能证明最新代码已经回归。

模拟数据沿用永绅原文件的简短习惯，例如款号与品名分开、规格写成“米白·小号”、材料写成“米白短毛绒”、环节写成“裁片 / 车缝 / 电绣”，备注用“分两批交货”“颜色按样板”这类日常说法。用户可见来源编号使用 `YS6-*`，岗位任务使用 `YS-V6-*`；模拟身份还由 `datasetKey / dataVersion / runId` 和报告统一证明。原文件只用于理解字段和用词，不直接导入真实行。

| 阶段                                                     | 本地                                                                                                    | demo-133 演练造数库                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| fresh 前置与基础资料                                     | 全新专用库 migration 后显式应用 local-test 配置并只创建 1 个单位、4 个仓库；runner 先做空业务库基线门禁 | 全新独立库先 bootstrap 管理员、应用 customer-trial 配置，再运行镜像内受控 core bootstrap；禁止通用远程 seed |
| 岗位账号                                                 | runner 在空库基线通过后创建或精确核对十个岗位账号，并调和三类场景账号                                   | 同一入口、同一规则；不得复用本地账号行或数据库 ID                                                           |
| 客户、供应商、产品、材料、工序、销售 / 采购 / 委外 / BOM | 按稳定编号写入并读回                                                                                    | 通过已登记目标、精确确认和带外证明写入并读回                                                                |
| 采购收货、质检、库存、生产、预留、出货、财务             | 统一由 `manual-acceptance-fact-data.mjs` 调用正式来源驱动 API                                           | 同一入口；不得复制本地报告或数据库 ID                                                                       |
| 附件与就绪核对                                           | 绑定同批源单、事实和任务报告                                                                            | 额外绑定 release、migration 和全部 debug=false 证明                                                         |

先生成当前双环境计划。以下命令只输出计划，不连接后端：

```bash
node scripts/qa/manual-acceptance-dataset.mjs

node scripts/qa/manual-acceptance-dataset.mjs \
  --chain delivery_to_settlement

node scripts/qa/manual-acceptance-catalog.mjs \
  --out output/qa/manual-acceptance/catalog

node scripts/qa/manual-acceptance-source-data.mjs \
  --target local-dev \
  --data-version 2026.08.15-v6 \
  --run-id 20260815-V6 \
  --json

node scripts/qa/manual-acceptance-data-depth.mjs
```

正常整批写入只使用顶层 runner。它按 `core → baseline → role → source → task → facts → purchase-quality → attachments → readiness` 串行执行；两端 handler 身份和 target-free 业务输入相同，目标适配层只提供 endpoint、数据库身份、凭据、确认、带外证明和报告目录。`core` 在登录前先调用只读 `/readyz/runtime-identity`，用摘要同时绑定实际数据库、完整 40 位 release commit 和 14 位 Atlas revision；探针只返回匹配 marker，不返回数据库名或连接信息。随后登录 admin 读取真实 `debug.capabilities`，再次核对数据库、运行环境和六个 debug=false，只读证明后续阶段依赖的 1 个稳定单位和 4 个仓库。`baseline` 再逐类读回客户、供应商、材料、产品、SKU、工序、BOM、来源单、Workflow 和全部 Fact 都为 0；任何已有业务记录都会阻断，不能用历史数据凑页面数量。`role` 在已注册的 local 与 133 验收目标中读取岗位当前完整设置，再统一通过带版本校验和审计的 `admin.set_role_settings` 整包回写原权限、原菜单布局和新的仓库范围，把 `warehouse / quality` 精确绑定到这 4 个核心仓库；不得分拆写入、丢失导航顺序或用脚本直写 RBAC 表。材料、产品、工序、BOM 与业务源单数量随后由 `source` 阶段独立写入并读回。密码创建与重置统一要求 8～20 位且 UTF-8 编码后不超过 72 字节；本地从环境变量读取，133 从固定测试凭据合同读取，报告均不保存密码。

`local-acceptance-lifecycle.mjs` 是本地完整验收的统一入口：它只接受登记的 `192.168.0.106:5432` 开发 PostgreSQL、clean exact commit、按批生成的 `plush_erp_acceptance_<run-id>_dev` 与 `plush_erp_acceptance_<run-id>_browser_actions_dev`，并使用隔离端口完成建库、migration、后端、十个正式模拟岗位账号的受控预配置 bootstrap、客户配置、core、九岗位数据、51 项只读浏览器和三条真实写异常流。预配置 bootstrap 只在 runtime identity、精确数据库、环境、super admin、目标确认和账号确认均通过后走 `admin.create`，不直写账号表；它先满足客户配置审批责任岗位的“有可办理员工”发布门禁，dataset role 阶段仍会重新核对账号并补齐正式岗位权限和仓库范围。浏览器启动前会重新扫描规范辅助端口，并在健康检查后复核本轮 Vite 子进程仍存活，不能把并发任务占用端口上的外部页面误认成本轮服务。只读验收完成并停后端后才克隆 `browser_actions` 库；无论成功失败都会停服务、逐库强制删除和读回残留，清理失败返回非零并报告精确库名。默认只打印 plan；真实执行必须传入 exact commit、run id、由 plan 生成的确认串和 `LOCAL_ACCEPTANCE_DATABASE_BASE_URL`，回执不保存 DSN、密码或 token：

```bash
node scripts/qa/local-acceptance-lifecycle.mjs \
  --commit '<clean-40-character-commit>' \
  --run-id 20260728-delivery

LOCAL_ACCEPTANCE_DATABASE_BASE_URL='postgres://<user>:<password>@192.168.0.106:5432/postgres?sslmode=disable' \
  node scripts/qa/local-acceptance-lifecycle.mjs \
    --execute \
    --commit '<clean-40-character-commit>' \
    --run-id 20260728-delivery \
    --confirm 'RUN_LOCAL_ACCEPTANCE_LIFECYCLE:plush_erp_acceptance_20260728_delivery_dev:plush_erp_acceptance_20260728_delivery_browser_actions_dev:<clean-40-character-commit>'
```

下面的组件命令只用于分段诊断；它们不替代统一生命周期和自动清理。两端完整顺序固定为 `fresh database → migration → first admin → exact formal account bootstrap → customer config apply/readback → exact core bootstrap → dataset runner → browser`。formal account bootstrap 必须先于带审批责任岗位的客户配置发布，并由后续 role stage 再次读回；133 使用镜像内 `/app/bootstrap-manual-acceptance-core`，详见 [Compose 部署说明](../../server/deploy/compose/prod/README.md)。

两端配置都从当前 tracked yoyoosun 包生成同一份 preview 输入；这一步只写 ignored 报告，不连接后端：

```bash
node scripts/qa/customer-config-runtime-manifest.mjs \
  --customer yoyoosun \
  --mode preview \
  --out output/qa/manual-acceptance-dataset/yoyoosun-runtime-manifest-preview.json
```

本地隔离库通过本地专用 gate 应用配置，不能携带远端 attestation：

```bash
MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.08.15-v6:20260815-V6:plush_erp_acceptance_20260728_delivery_dev \
MANUAL_ACCEPTANCE_ADMIN_USERNAME=admin \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<isolated-local-admin-password>' \
MANUAL_ACCEPTANCE_PASSWORD='<different-demo-password>' \
  node scripts/qa/manual-acceptance-customer-config.mjs \
    --apply \
    --preview-manifest output/qa/manual-acceptance-dataset/yoyoosun-runtime-manifest-preview.json \
    --target local-dev \
    --backend-url http://127.0.0.1:8310 \
    --database-name plush_erp_acceptance_20260728_delivery_dev \
    --data-version 2026.08.15-v6 \
    --run-id 20260815-V6 \
    --out output/qa/manual-acceptance/datasets/2026.08.15-v6/local/customer-config
```

```bash
POSTGRES_DSN='postgres://<user>:<password>@192.168.0.106:5432/plush_erp_acceptance_20260728_delivery_dev?sslmode=disable' \
  bash scripts/seed-core-demo-data.sh \
    --references-only \
    --expected-database plush_erp_acceptance_20260728_delivery_dev \
    --confirm SEED_MANUAL_ACCEPTANCE_CORE_REFERENCES:local-dev:plush_erp_acceptance_20260728_delivery_dev:2026.08.15-v6:20260815-V6
```

本地命令必须指向明确绑定专用验收数据库的后端；当前共享开发端口不能因为地址是本机就当作验收库：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<8-to-20-character-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<8-to-20-character-admin-password>' \
  node scripts/qa/manual-acceptance-dataset.mjs \
    --apply \
    --target local \
    --data-version 2026.08.15-v6 \
    --run-id 20260815-V6 \
    --backend-url '<dedicated-local-acceptance-backend-url-not-port-8300>' \
    --database-name plush_erp_acceptance_20260728_delivery_dev \
    --confirm APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.08.15-v6:20260815-V6:plush_erp_acceptance_20260728_delivery_dev
```

本地 `--apply` 同时要求显式后端、`plush_erp_acceptance_*` 数据库名和数据库绑定确认串；端口 `8300` 在参数解析阶段直接拒绝。运行态数据库摘要不匹配时，runner 在认证前停止，不会创建登录会话，也不会进入 `role` 或任何业务写阶段。

`demo-133` 仍使用同一命令和 runner，但部署 target 与内部数据 target 必须严格分层：远端 target 是 `demo-133`，内部模拟数据合同仍是 `customer-trial-133`。执行时必须额外传入 dry-run 计划给出的精确确认串，并绑定当前 40 位小写 commit、至少 `20260714165115` 的 14 位 migration、数据库 `plush_erp_demo_v1` 和全部 debug=false 的 attestation。探针会把声明与当前容器 `GIT_SHA`、实际连接库和 Atlas 最新 revision 做只读核对；未冻结并部署同一代码版本时不得写入。

远端执行顺序固定为：

1. 通过 `demo-133` 的受控 preflight 与 runtime identity 证明 Compose、端口、数据库、release、migration 和公网入口。
2. 若要求 fresh，先完成 `demo-133` database rebuild，并取得原子保存的 passed receipt；receipt 必须绑定备份恢复、旧/新 PostgreSQL generation 与 rollback point。
3. 用内部 `customer-trial-133` target 依次完成正式账号、客户配置、镜像内 core bootstrap 和唯一顶层 dataset runner。
4. runner 仍在任何业务写入前通过正式 API 证明受管业务对象为零，并核对当前 release、migration、逻辑数据库与物理 generation。
5. 总回执固定保存于 `output/qa/manual-acceptance/datasets/2026.08.15-v6/customer-trial-133/dataset/apply-report.json`；不得跳过总回执拼接分阶段报告。

客户配置必须先独立应用并读回为 active；凭据和完整 attestation 只从受控进程环境传入，不写入命令或回执：

```bash
MANUAL_ACCEPTANCE_TARGET_CONFIRM='APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:customer-trial-133:2026.08.15-v6:20260815-V6' \
MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON='<fixed-safe-attestation-json>' \
MANUAL_ACCEPTANCE_ADMIN_USERNAME=admin \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<fresh-bootstrap-admin-password>' \
MANUAL_ACCEPTANCE_UAT_PASSWORD='<different-demo-password>' \
  node scripts/qa/manual-acceptance-customer-config.mjs \
    --apply \
    --target customer-trial-133 \
    --preview-manifest output/qa/manual-acceptance-dataset/yoyoosun-runtime-manifest-preview.json \
    --backend-url '<controlled-demo-backend>' \
    --database-name plush_erp_demo_v1 \
    --data-version 2026.08.15-v6 \
    --run-id 20260815-V6 \
    --out output/qa/manual-acceptance/datasets/2026.08.15-v6/customer-trial-133/customer-config
```

```bash
node scripts/qa/manual-acceptance-dataset.mjs \
  --apply \
  --target customer-trial-133 \
  --backend-url '<controlled-demo-backend>' \
  --data-version 2026.08.15-v6 \
  --run-id 20260815-V6 \
  --confirm APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:customer-trial-133:2026.08.15-v6:20260815-V6 \
  --target-attestation-json '<fixed-safe-attestation-json>' \
  --database-rebuild-receipt output/dev-workbench/delivery-operations/receipts/<database-rebuild-operation-id>.database-rebuild.json
```

登录输入只从受控进程环境或凭据合同进入，不写进命令示例、仓库或回执。历史回执、错误 SHA、相同 system identifier 或当前非空都会停止。长期 scenario-demo 可按其既有长期库语义保留历史，但不能冒充 fresh full acceptance。

首次执行前，该目标的规范总回执必须不存在。若某阶段失败，或完整成功后需要证明同批幂等重放，保留原回执，并在完全相同的目标、版本、批次、后端和带外证明参数后追加 `--resume-report output/qa/manual-acceptance/datasets/2026.08.15-v6/<target>/dataset/apply-report.json`。禁止删除回执后重新冒充 fresh apply；resume 会重验 core、客户配置、数据库、release / migration、连续阶段和各组件 digest。

fresh apply 会在开始时捕获一次岗位任务时间锚点并写入总回执；同批 resume 必须校验并复用该锚点，不能按当前时间重排到期日。业务数据版本中的日期只用于来源单业务日期，不再充当任务到期锚点。本地和 133 共享同一时间策略与语义 digest，但分别在自己的 fresh 回执中绑定执行锚点。浏览器必须在回执记录的有效期内同时看到出货放行的“即将到期”和“已超时”；锚点过期后不得继续沿用旧报告宣称通过，应换新数据版本并从 fresh 空库重放。

role 阶段只有正式账号场景 API 一个写入口；V5 计划不登记 `seed-role-demo-admins.sh --reset-password`，避免宽泛 dev DSN 或 override 绕过 exact V5 验收库绑定。

fresh 和 resume 都会原子占用同目录的 `dataset/.apply.lock`，同一目标同一版本的第二个进程会在任何 RPC 前停止。若进程异常退出并留下锁，不得直接删除；先确认锁内 PID 已退出，再按错误提示把原锁重命名为带 owner 标识的 .stale-\* 归档，随后重跑完全相同的命令。

下面的分阶段入口只用于定位单个阶段问题，不是另一套页面数据生成流程。直接运行时仍必须显式使用当前版本和批次，密码只从环境变量提供，不写进报告或仓库：

```bash
MANUAL_ACCEPTANCE_SIM_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA \
MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.08.15-v6:20260815-V6:plush_erp_acceptance_20260728_delivery_dev \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-source-data.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.08.15-v6 \
    --run-id 20260815-V6 \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --database-name plush_erp_acceptance_20260728_delivery_dev \
    --out output/qa/manual-acceptance/datasets/2026.08.15-v6/local/source
```

随后按同一 `dataVersion / runId` 准备九岗位任务和统一事实链。采购收货与质检已经归入事实入口，不再单独调用 `purchase-quality-simulated-matrix.mjs`；旧 `operational-fact-simulated-closure.mjs` 只保留历史 report-only 守卫，不能作为当前数据入口。

```bash
node scripts/qa/manual-acceptance-task-data.mjs \
  --target local-dev \
  --data-version 2026.08.15-v6 \
  --run-id 20260815-V6

MANUAL_ACCEPTANCE_ACCOUNT_CONFIRM=APPLY_SIMULATED_ACCOUNT_SCENARIOS \
MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.08.15-v6:20260815-V6:plush_erp_acceptance_20260728_delivery_dev \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-account-scenarios.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.08.15-v6 \
    --run-id 20260815-V6 \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --database-name plush_erp_acceptance_20260728_delivery_dev \
    --json

MANUAL_ACCEPTANCE_TASK_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_TASKS \
MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.08.15-v6:20260815-V6:plush_erp_acceptance_20260728_delivery_dev \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-task-data.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.08.15-v6 \
    --run-id 20260815-V6 \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --database-name plush_erp_acceptance_20260728_delivery_dev \
    --out output/qa/manual-acceptance/datasets/2026.08.15-v6/local/task
```

`manual-acceptance-fact-data.mjs` 必须输出 `source-driven-operational-facts-v1` 报告，记录本批采购收货、质检、库存、生产、预留、出货与财务对象的精确 ID、业务编号和状态。重复执行只能完整复用或继续同一批次；发现部分冲突或报告身份不一致时必须停止。Readiness、附件和浏览器入口都会拒绝旧通用事实报告。

```bash
MANUAL_ACCEPTANCE_SIM_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA \
MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.08.15-v6:20260815-V6:plush_erp_acceptance_20260728_delivery_dev \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-fact-data.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.08.15-v6 \
    --run-id 20260815-V6 \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --database-name plush_erp_acceptance_20260728_delivery_dev \
    --source-report output/qa/manual-acceptance/datasets/2026.08.15-v6/local/source/apply-report.json \
    --out output/qa/manual-acceptance/datasets/2026.08.15-v6/local/facts
```

需要分段排障时，`--phase purchase-quality` 只准备采购、收货、质检和材料库存；`--phase facts` 会先核对或复用这批采购前置，再继续生产、委外、出货和财务，不是绕过采购前置的独立入口。最终验收仍必须执行完整模式并生成一份同时包含全部精确引用的事实报告。

写入后只读核对 51 项验收目标：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-readiness.mjs \
    --verify \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --database-name plush_erp_acceptance_20260728_delivery_dev \
    --source-report output/qa/manual-acceptance/datasets/2026.08.15-v6/local/source/apply-report.json \
    --fact-report output/qa/manual-acceptance/datasets/2026.08.15-v6/local/facts/apply-report.json \
    --task-report output/qa/manual-acceptance/datasets/2026.08.15-v6/local/task/apply-report.json \
    --out output/qa/manual-acceptance/datasets/2026.08.15-v6/local/readiness
```

`readiness` 独立命令保持严格非绿：41 项可查询数据全部通过、5 项模板预览与 5 项打印工作台仍待浏览器时，报告为 `queryChecksPassed=true / queryEvidenceComplete=false` 并退出 1。顶层 dataset runner 只在“0 项查询失败、恰好这 10 项打印目标 `not_proven`、其余 41 项全过”时把数据底座记为已证明，同时明确写入 `browserEvidencePending=true`；任意其他缺口仍立即阻断。浏览器还必须为 5 个预览各证明至少 1 份可见数据，并为每个打印工作台证明本批来源至少 5 条，再打开精确 25 行单据和真实 PDF。最终只有同批浏览器报告的 `acceptancePassed=true` 才能宣称 51 项自动化验收完成。

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
    --dataset-report output/qa/manual-acceptance/datasets/2026.08.15-v6/local/dataset/apply-report.json \
    --source-report output/qa/manual-acceptance/datasets/2026.08.15-v6/local/source/apply-report.json \
    --fact-report output/qa/manual-acceptance/datasets/2026.08.15-v6/local/facts/apply-report.json \
    --readiness-report output/qa/manual-acceptance/datasets/2026.08.15-v6/local/readiness/verify-report.json \
    --report output/qa/manual-acceptance/datasets/2026.08.15-v6/local/browser/report.json
```

`customer-trial-133` 的浏览器报告必须写到当前版本与目标的规范路径 `output/qa/manual-acceptance/datasets/<dataVersion>/customer-trial-133/browser/report.json`，并同时提供同批 `dataset/apply-report.json`、`readiness/verify-report.json` 与 `MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON`。浏览器启动前会重新调用 `/readyz/runtime-identity`，把当前数据库、完整 release commit、Atlas migration、fresh baseline、attachments、source / fact / task / readiness 批次身份原子绑定；readiness 只参与身份闭合，列表数量仍必须由当前页面 DOM 重新证明，打印仍必须由当前 5 份 PDF 证明。

本地 Kratos BBR 若在逐页读取期间返回纯 HTTP 429，浏览器验收会按 10 / 20 / 30 秒递增等待，最多执行四次，并在报告保留每次失败事件与截图。只要混入其他运行时错误、最终页面数据不足，或第四次仍被限流，整轮验收仍失败；该重试不能把持续过载或业务错误改写成绿色。

三条异常流真实写浏览器验收必须单独使用名称和归属明确、可回收的全新本地隔离库。数据库名必须由 `database-target.mjs` 的 `browser-actions` 生命周期生成并匹配 `plush_erp_acceptance_<run-id>_browser_actions_dev`，后端必须是 loopback 且不能使用共享端口 `8300`，显式确认串必须同时绑定数据库名与后端 origin；runner 启动后还会用 `/readyz/runtime-identity` 复核同一数据库身份。禁止指向共享开发库、133、客户试用或生产数据库。

```bash
MANUAL_ACCEPTANCE_DEMO_PASSWORD='<local-demo-password>' \
EXCEPTION_FLOW_BROWSER_CONFIRM='RUN_ISOLATED_EXCEPTION_FLOW_BROWSER_ACTIONS:plush_erp_acceptance_exception_example_browser_actions_dev:http://127.0.0.1:8323' \
  node scripts/qa/exception-flow-real-write-browser.mjs \
    --base-url http://127.0.0.1:15214 \
    --backend-url http://127.0.0.1:8323 \
    --database-name plush_erp_acceptance_exception_example_browser_actions_dev \
    --report output/qa/manual-acceptance/local-business-actions/report.json
```

该 companion 登录后先停在轻量工作入口，等待账号、客户配置和知悉状态稳定，再开始业务读回；任一页面响应出现 HTTP 4xx / 5xx 都会保留脱敏路径和方法并使验收失败。主业务 mutation 由真实产品 UI 点击触发；直接浏览器上下文 RPC 只用于结构合法的无权角色负例、权威读回和重复 / 旧 version 重试。未知结果场景是在后端已经返回成功后丢弃浏览器响应，再由页面权威读回确认，不 mock 业务成功。报告会明确记录 `admin_users.last_login_at` 的 `auth-write`、三条业务写、三个服务端 `40304`、三个 simulated transport fault、终态 Fact / 库存 / 核销读回及 `40920` CAS 拒绝。Finance Payment 使用隔离数据集中已经批准的来源，Inventory Adjustment 由浏览器新建并办理老板审批与仓库执行任务，Production OVER_ISSUE 使用已批准额度并由真实领料 Fact 消费后取消恢复。它不证明其他岗位、IQC / 委外写动作、打印工作台、部署、客户账号或客户 UAT；这些证据继续按各自验收层级单列。

133 前端隧道为 `18376` 时，最终浏览器命令为：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<different-demo-password>' \
  node scripts/qa/manual-acceptance-browser.mjs \
    --base-url http://127.0.0.1:18376 \
    --backend-url http://127.0.0.1:18375 \
    --dataset-report output/qa/manual-acceptance/datasets/2026.08.15-v6/customer-trial-133/dataset/apply-report.json \
    --source-report output/qa/manual-acceptance/datasets/2026.08.15-v6/customer-trial-133/source/apply-report.json \
    --fact-report output/qa/manual-acceptance/datasets/2026.08.15-v6/customer-trial-133/facts/apply-report.json \
    --readiness-report output/qa/manual-acceptance/datasets/2026.08.15-v6/customer-trial-133/readiness/verify-report.json \
    --target-attestation-json "$MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON" \
    --report output/qa/manual-acceptance/datasets/2026.08.15-v6/customer-trial-133/browser/report.json
```

打印工作台必须从同批采购订单、委外订单和 BOM 选择真实模拟记录。PDF 出现 4xx / 5xx、空文件、非 PDF 或缺少 `request_id` 都要失败，不能用页面打开代替带值打印证据。

退出批次前必须先 dry-run。该入口只处理没有 active / blocked ProcessRuntime 阻断的源单；上一固定 V5 批次特意保留已启动、待办、阻塞和退回流程证据，不能用业务取消伪造流程撤销。需要连同这些流程证据完整清理时，本地应重建专用验收库，133 必须走受控数据库重建 / 恢复流程；不得让本脚本部分执行后冒充整批已退出。其余可处理源单进入取消 / 归档状态，主数据转为停用；已过账库存、出货和财务历史继续保留，不做物理删除。本地和 133 都走同一 target policy，133 仍要求精确确认和带外证明：

```bash
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
  node scripts/qa/manual-acceptance-source-retire.mjs \
    --target local-dev \
    --data-version 2026.08.15-v6 \
    --run-id 20260815-V6

MANUAL_ACCEPTANCE_RETIRE_CONFIRM=RETIRE_SIMULATED_MANUAL_ACCEPTANCE_SOURCE_DATA \
MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.08.15-v6:20260815-V6:plush_erp_acceptance_20260728_delivery_dev \
MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \
MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \
  node scripts/qa/manual-acceptance-source-retire.mjs \
    --apply \
    --target local-dev \
    --data-version 2026.08.15-v6 \
    --run-id 20260815-V6 \
    --backend-url '<dedicated-local-acceptance-backend-url>' \
    --database-name plush_erp_acceptance_20260728_delivery_dev
```

手工验收数据不是压测数据。容量和压力入口只能使用一次性隔离数据库；共享开发库与 demo-133 演练造数库都不得拿来压测。容量幂等探针必须通过 `--task-source-type / --task-source-id` 绑定同批 `trial_pmc_work` 模拟任务，并校验 `simulated_only / trial_task` 标记；不得借用正式来源生成任务。ignored 本地报告也不等于目标服务器的发布证据。

## 按影响面选择 / Affected Tests

`affected.sh` 默认收集 unstaged、staged 和未跟踪文件，也支持只看 staged、指定 Git base 或显式文件：

```bash
bash scripts/qa/affected.sh --plan
bash scripts/qa/affected.sh --staged --plan
bash scripts/qa/affected.sh --base origin/main --plan
bash scripts/qa/affected.sh --file web/src/erp/utils/dateRange.mjs --run
```

选择器优先复用同名 `*.test.mjs`；普通业务页面、共享布局和样式会提示补定向 `STYLE_L1_SCENARIOS`。DEV 工作台页面没有同名测试时只补 DEV route/production 边界和桌面页面治理合同，`web/dev-server` 普通插件走同名测试与语法检查，migration、交付命令、凭据或安全桥接再追加 operation/security follow-up。正式代码和文档的历史 Phase/P 编号只检查本次 changed files，不由 fast 全仓扫描。业务事实 repo/usecase 会升级到本地隔离 PostgreSQL 关键事务门禁；schema/migration 会运行只读守卫、数据层测试和数据字典零漂移检查，但不会自动执行可能改写生成文件的 `make data`；`server/docs/database/**` 与业务语义 catalog 也会直接运行数据字典检查；部署、全局入口、无独立测试的 QA 脚本和未知路径会保守升级到 `full.sh`。

`gate-profiles.mjs` 只保存 fast/full/strict 的语义层级、直接入口和可执行位合同，当前 required files 保持小而累积。下游脚本和测试是否存在由真实执行、`node-test-groups.mjs` 的唯一登记以及各领域测试发现证明，不再在 profile 中复制整条传递依赖清单。

`affected` 是开发期快速反馈和非标准目标的保守执行入口；默认 `origin/main` 的 `prepare-push` 会在 clean HEAD 和真实 aggregate range 上独立重算风险，但只签发 `server-ci` 短门禁回执，不在 Mac 执行 affected/full。`--review` 只更新固定远端审查 ref，显式 `--full` 只作本地完整诊断；随后必须按准备时相同 remote/ref push，hook 复核短期回执、真实 stdin/range、clean HEAD、gate/environment/TTL，并实时运行 `git log --check` 与逐 range 严格 secrets。推送后必须由 R640 exact-SHA CI Gate 终态成功才能发布、提升制品或进入受保护部署；目标 migration、health/smoke、备份恢复及回滚 evidence 仍独立取得。
