# QA 脚本说明

本文档只说明当前仓库仍在使用的本地脚本和推荐执行顺序。

## 子目录入口

`scripts/README.md` 保留仓库级脚本总览、推荐顺序和跨目录边界；高频子目录的局部说明在各自 README 维护，避免把所有命令细节继续堆到一个入口里。

| 子目录 | 先看哪里 | 主要用途 |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `scripts/qa/` | [scripts/qa/README.md](qa/README.md) | fast / strict / full、边界守卫、测试选择和本地验收入口 |
| `scripts/deploy/` | [scripts/deploy/README.md](deploy/README.md) | 生产 preflight、release evidence、closeout、客户配置发布和部署证据工具 |
| `scripts/import/` | [scripts/import/README.md](import/README.md) | 客户来源 manifest、只读提取、freeze 和 dry-run 准备边界 |

当前 CI/CD 入口已经收敛为：GitLab main / MR 主链按变更运行 `affected` 或 `full`；不可变 Release 从 protected main 的同一 exact SHA 普通 push pipeline 恢复完整 `CI Gate` 证据，不重跑 strict，再只构建一次 Server/Web 候选。正式版本由 Bridge 服务端按上海日历日和 live Release catalog 唯一推导，工作台只读展示，GitLab 在首次候选构建前再校验同一版本及调度时刻。正式 v2 Release 固定发布七资产、同一演练回执及独立 source Package；同版本中断后只允许校验并续传内容完全一致的缺失资产，随后必须整包读回。Mac 只发送显式 operation 与小型控制包，R640 目标经固定同机内网 GitLab TLS 入口直接取得、校验和缓存七资产与 `source.tar`；promotion、smoke 与 rollback 复用相同 digest，不允许回退到 Mac 大文件中转。GitHub 仅接收 protected main 的单向只读镜像并保留显式应急 workflow，不运行仓库 CI；GPT 审查读取已镜像的目标提交范围。固定 133 目标、GitLab/GitHub provider、operation、部署与回滚命令见 [scripts/deploy/README.md](deploy/README.md)，测试分组、exact-SHA gate 与只预览的 output 保留策略见 [scripts/qa/README.md](qa/README.md)。目标机不执行源码构建。

## 总览

| 脚本 | 主要作用 | 建议时机 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `scripts/bootstrap.sh` | 安装依赖、启用 hooks、跑快速自检 | 新机器 / 首次拉仓库 |
| `scripts/project-scan.sh` | 扫描项目名、默认密钥、部署地址和页面文案残留 | 改名后 / 配置收口后 |
| `scripts/dev-ports.mjs` / `scripts/dev-listener-stop.sh` | 校验本地固定端口组，并只停止 cwd 属于本仓库的已登记后端 listener；拒绝对陌生进程按端口强杀 | `make run / dev / dev_stop / dev_restart` 与本机端口覆盖时 |
| `scripts/local-runtime-preflight.mjs` | 只读核对工作区 schema / versioned migration、当前 dev 库 Atlas status 与后端 health / ready；被 `make run / dev_restart`、`pnpm start / start:yoyoosun` 共用，不自动 apply migration | 启动本地后端或需要登录 / RPC 的前端前 |
| `scripts/local-migration-workflow.mjs` / `scripts/local-migration.mjs` 及对应测试 | 登记共享开发库的高层 prepare / execute 编排，以及底层脱敏 status、事务回滚预演、apply 和同目标读回；高层入口统一加入真实备份恢复、执行前备份身份复核与后端重启；所有终态统一输出脱敏的 `[migration-summary]` 回执 | 交互 `make migrate`；非交互 `make migrate_prepare / migrate_execute`；底层目标仅用于诊断 |
| `scripts/build/apply-customer-web-config.mjs` | 本地 / CI 构建后按 `ERP_CUSTOMER_KEY` 发布经过审查的 `customer-config.js`，并且只复制客户 `public-assets/` 到前端静态产物 | 构建客户私有化前端或服务端镜像时 |
| `scripts/seed-role-demo-admins.sh` | 显式生成 dev/test/demo 角色演示管理员账号，绑定真实 RBAC 角色 | 需要多角色登录 / 岗位任务端验收 |
| `scripts/seed-core-demo-data.sh` | 显式生成核心产品模拟基础资料：单位、材料、产品、仓库和 BOM，并输出试用模拟 / 业务事实模拟可复用 ID | 需要产品主数据、BOM 或业务事实前置 ID 的本地 / 试用演练前 |
| `scripts/seed-trial-sim-masterdata.sh` | 显式生成试用模拟产品 / 单位主数据，供模拟销售订单行引用 | 试用环境模拟演练前 |
| `scripts/import/customerSourceManifestCheck.mjs` | 显式读取外部客户 manifest 与 raw dir，校验 customer、相对路径、sha256 / 大小、重复项、未登记文件和目录逃逸 | 客户私有工作区进入导入前 evidence 前 |
| `scripts/import/customerSourceExtract.mjs` | 按显式客户 manifest 只读提取允许结构化的 Excel，生成 ignored source snapshot、空 existing preview、配置候选和报告 | 客户私有工作区整理导入前 evidence |
| `scripts/import/customerSourceSnapshotFreezeCheck.mjs` | customer source snapshot freeze checker，只读取 JSON snapshot 并生成 freeze evidence | yoyoosun 导入前 source freeze / 人工 review evidence |
| `scripts/import/customerImportDryRun.mjs` | 永绅 yoyoosun 客户导入 dry-run CLI，只读取 JSON snapshot 并生成预览包 | yoyoosun 导入前人工 review / 数据映射检查 |
| `scripts/qa/test-data-isolation-boundary.mjs` | 只读检查 Product Core demo seed、yoyoosun 模拟数据和真实导入准备是否分桶隔离，并锁住 dry-run 不具备执行能力 | 调整 seed、fixture、模拟数据或导入准备工具后 |
| `scripts/qa/manual-regression-data-plan.mjs` | 只读汇总 Product Core 中性 seed、yoyoosun preview fixture、试用模拟数据、业务事实模拟和岗位任务模拟的手动回归数据入口；不连接后端、不写库、不执行真实导入 | 手动回归前梳理应准备哪些模拟数据和命令 |
| `scripts/qa/local-acceptance-lifecycle.mjs` | clean exact SHA 的本地完整技术验收入口：在登记开发 PostgreSQL 上按批创建人工验收库，完成 migration、受控正式模拟账号预配置 bootstrap、客户配置、core、九岗位数据和 51 项只读浏览器；账号 bootstrap 只走带目标与数据库身份门禁的 admin RPC，先满足审批责任岗位发布检查，后续 role stage 再次读回并补齐权限 / 仓库范围。停后端后检查 429 与已提交事务 rollback 告警均为 0，再克隆同批 `browser_actions` 库执行三条真实写异常流并复查日志，最终停服务、逐库删除并读回残留。默认只输出 plan，回执不保存凭据，也不代表 133 发布或客户 UAT | 提交后执行可回收的本地完整质量验收 |
| `scripts/qa/scenario-demo-data.mjs` | 固定 V6 长期场景数据控制器：只允许 106 登记长期开发库和 `127.0.0.1:8300`，默认零认证、零写入地输出绑定仓库、migration、runtime identity、当前跟踪客户配置和组件 digest 的不可变计划；精确确认后按 core reference、岗位账号与至少 30 条真实控制面审计样例、客户配置 validate / publish / transition check / activate or rollback / effective-session、Source、ProcessRuntime、九岗位 `long-lived-workbench / WORKBENCH2` 模拟任务、旧 `WORKBENCH1 / PLAIN5 / PLAIN6` 任务正式终态化、来源驱动 Fact、readiness 串行执行。每个岗位固定 20 条，其中 12 条无到期日、低风险且长期留在“待我处理”；隔离 Full Acceptance 仍使用 `acceptance-snapshot`，两类任务不共用批次；不物理删除旧批次，不把模拟任务当作 Fact。固定补齐 4 条收付款与 3 条红冲记录；查询读回只证明数据前置，不替代浏览器与人工验收 | 需要在共享开发库长期保留可复用业务场景数据时 |
| `scripts/qa/manual-acceptance-*.mjs` | 全页面手工验收入口组：用唯一 runner、页面归属合同和业务链步骤合同为 local / 133 生成同语义模拟数据；先选业务链并展开已登记步骤，再把合法场景投影到现有 `role / source / task / facts / readiness` 阶段，不做角色、状态与动作的笛卡尔积。覆盖 51 项目录、账号、源数据、九岗位任务、事实矩阵和只读就绪核验；数据摘要变化必须重造，只有验证摘要变化则保留数据重验。180 条长列表任务仍只证明展示交互，真实 ProcessRuntime 和业务动作另按原入口验证；详细命令见 `scripts/qa/README.md` | 准备全页面模拟验收数据与脱敏证据 |
| `scripts/qa/exception-flow-real-write-browser.mjs` | 三条异常流的本地真实写浏览器 companion：只接受 loopback、非 8300、名称匹配 `browser_actions` 的显式隔离库，绑定 runtime identity 后验证业务 UI、Workflow task、Fact / 库存 / 核销读回、反向、CAS 与服务端 RBAC；登录会写 `last_login_at`，传输故障为后端成功后丢弃响应，不是 mock 业务结果，也不等于 51 项只读基线验收或客户 UAT | 在可回收的全新本地隔离库验收异常流写主路径 |
| `scripts/qa/purchase-order-approval-process.mjs` | 采购订单 ProcessRuntime 共享执行器：从 DRAFT 启动流程、执行唯一提交命令、按流程锚点读取并完成审批任务，再读回 authoritative `APPROVED`；不调用已退出的直提 / 直批 API | 采购模拟矩阵、手工验收和真实浏览器造数需要统一采购审批主路径时 |
| `scripts/qa/purchase-quality-simulated-matrix.mjs` | 通过正式 JSON-RPC 和岗位演示账号生成带 `SIM-YOYOOSUN-PQ` 前缀的采购单、采购入库与质检多状态矩阵；显式确认后才写入，不执行真实客户导入 | 本机 local / dev 覆盖草稿、提交、审批、关闭、取消、检验通过 / 拒收、入库过账 / 取消等人工回归状态 |
| `scripts/qa/trial-simulated-data.mjs` | 模拟试用数据入口，支持 `--print-input-template` 只读输出前置；真实执行只创建标记为模拟的 V1 客户 / 供应商 / 联系人 / 销售订单数据 | 试用环境演练 |
| `scripts/qa/operational-fact-simulated-closure.mjs` | 旧业务事实模拟矩阵的只读输入 / 计划入口；`--apply` 已 fail-closed 退役，待生产订单、委外订单、销售订单、出货、采购入库和财务事实来源驱动 fixture 重建后才能恢复写入 | 审查旧模拟范围和来源驱动重建前置 |
| `scripts/qa/mobile-workflow-simulated-closure.mjs` | 模拟岗位任务闭环入口，支持 `--print-input-template` 只读输出前置；真实执行只创建和更新显式 `trial_*` 模拟 workflow 任务，覆盖审批完成 / 退回、质检完成、入库完成、仓库出货异常、跨角色催办及反馈 / 原因，并验证新动作不生成历史证据引用，不占用 `production_scheduling / production_exception / shipment_release` 保留组 | 岗位任务端回归 / 目标环境移动任务闭环验收 |
| `web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs` | 真实浏览器岗位任务端模拟任务回归，只在现有 `trial_boss_work / trial_quality_work / trial_warehouse_work` 普通协同命名空间创建 `simulated_only` 任务，分别登录 boss / quality / warehouse 岗位端验证完成、阻塞、退回、催办反馈和内部提醒线索；不占用正式来源任务组，不创建正式 `shipment_release`，也不把 Workflow 办理写成业务 Fact | 本地 / 试用岗位任务端真实页面验收 |
| `scripts/qa/v1-acceptance-plan.mjs` | ERP V1 主链验收计划入口，默认只生成本地计划 evidence，可选运行现有 no-write report-only 工具；不证明本地完整技术验收、目标发布或客户 UAT | V1 主链验收计划与证据边界整理 |
| `scripts/qa/purchase-receipt-real-write-e2e.mjs` | 采购入库真实写入链路验收入口，支持 `--print-input-template` 只读输出前置和 `--preflight-report <path>` 本地脱敏前置报告；真实命令默认跑 JSON-RPC 创建 / 加行 / 过账 / 回显 / 库存事实 / 权限测试，可选追加本地 PostgreSQL 防呆测试 | V1 采购入库真实写入链路回归 / 采购入库事实验收 |
| `scripts/qa/industry-template-boundaries.mjs` | 行业模板候选边界检查，确保模板不变成 tenant、runtime loader、真实导入或事实写入入口 | 行业模板调整后 |
| `scripts/qa/industry-template-closure.mjs` | 行业模板模拟闭环入口，只读取候选配置并生成 evidence 报告 | 行业模板回归 / 目标环境发布前 |
| `scripts/qa/private-deployment-boundaries.mjs` | 多客户私有化复制边界检查，确保客户包模板不变成 SaaS、tenant、代码分叉或真实导入入口 | 私有化客户包模板调整后 |
| `scripts/qa/private-deployment-package-closure.mjs` | 多客户私有化模板边界报告入口；只读取模板并明确 delivery / evidence / acceptance 仍未完成 | 私有化客户包模板调整后 |
| `scripts/deploy/deployment-package-lint.mjs` | 客户私有化部署资料包检查，确保 `deployments/yoyoosun` 必需文件齐全且不含真实 env、备份、raw files 或 secret | 调整客户部署资料包后 |
| `scripts/deploy/source-archive-release-check.mjs` | 从 committed Git ref 生成临时源码包并检查完整构建输入；默认 plan、`--light` 验证解包后的活跃 Markdown 本地链接与客户 Web overlay，`--execute` 仅在 clean worktree 通过仓库锁定工具链运行独立的发布、恢复与回滚验证（T8）source-package check；`--docker` 固定构建 `linux/amd64` 并把同一 40 位 SHA 写入 Server / Web 镜像 | 调整源码包、构建输入、文档链接或客户 Web overlay 后 |
| `scripts/deploy/release-artifact-bundle.mjs` | 从 clean current HEAD 的 committed archive 构建固定 Server / Web 镜像，保存 image tar，并写入 content ID、checksum、CycloneDX 依赖 SBOM、migration 序列、客户配置源指纹和脱敏 manifest；不联系目标环境 | exact-SHA CI 后生成可 promotion 制品时 |
| `scripts/deploy/release-artifact-verify.mjs` | 校验制品 manifest / SBOM / image tar；`--load` 还会加载镜像并读回 content ID、`linux/amd64` 与内置 `GIT_SHA` | 本地演练或目标传输前 |
| `scripts/deploy/local-release-rehearsal.mjs` | 使用同一不可变制品和唯一生产 Compose，在一次性 `plush_erp_release_<run-id>` 完成 migration、运行身份、登录、local-test 客户配置、PDF、备份恢复、移除 bootstrap secret 后的重启恢复与精确清理，并输出工作台回执 | 目标 promotion 前的本地发布、恢复与回滚验证（T8）演练 |
| `scripts/deploy/image-digests-evidence.mjs` | 生成 `image-digests.txt`，并在同目录 release evidence 已填 digest 时校验 server / web digest 一致，不构建镜像或访问 registry | 发布 evidence 填充 image digest 时 |
| `scripts/deploy/immutable-version-evidence.mjs` | 用显式 release batch 输入更新 `release-evidence.md` 的不可变版本字段，并写入匹配的 `image-digests.txt`；支持 `--print-input-template` 只读输出同批次输入模板；不构建镜像、不访问 registry、不读 `.env`、不执行目标动作 | 补 immutable-version evidence 时 |
| `scripts/deploy/release-evidence-gate.mjs` | yoyoosun 发布证据门禁，检查本次 release evidence 的 Git commit 和 image digest 可追溯、`image-digests.txt` 与 release evidence 的 server / web digest 一致、production preflight report、绑定本次 releaseVersion / environment / backupId 且 `migrationVersion=migrationBefore` 的 pre-migration backup、ISO backupTime、正数 backup size、通过态 restore / smoke、带恢复目标 / 命令摘要 / 备份 hash / pre-apply migration artifact / post-apply migration artifact / 无 pending migration 且 restore migration version 匹配 `migrationAfter` 的 backup restore、migration status、非空且全通过 smoke、客户配置 smoke 对应的 `customer-config-manifest-evidence.json`、rollback / forward-fix plan、rollback rehearsal report 和绑定本次 releaseVersion / environment / backupId 的 sign-off 已脱敏填齐，并强制 releaseVersion、environment、backupId、databaseBackupHash、migration version 和客户配置 revision 跨证据一致；支持 `--json` 输出 evidence-only scope，明确 gate 只校验证据、不执行目标动作 | 客户试用或交付前 |
| `scripts/deploy/release-evidence-status.mjs` | 只读检查 release evidence 目录，输出 `missing / incomplete / draft / attention / ready`、closeout evidence checklist / summary / next actions、按证据组归类的 gate error / warning 摘要、缺失 artifact、gate 错误数量、warning 和下一步命令；不执行发布、恢复、migration、smoke 或回滚 | 填 evidence 过程中判断下一步 |
| `scripts/deploy/release-evidence-closeout-plan.mjs` | 只读读取 release evidence status 的 `closeoutNextActions` 和 `closeoutGateSummary`，检查每组下一步是否具备本机执行前置条件，并把该证据组当前 gate error / warning 摘要、input template 和字段级 operator checklist 挂到 action；`SMOKE_ENDPOINT` / `SMOKE_BACKEND_URL` 必须是无 URL 账号密码的 http(s) 地址；不写 evidence、不执行目标动作 | 按 next actions 执行前确认缺哪些输入和证据错误 |
| `scripts/deploy/release-evidence-closeout-runner.mjs` | 基于 closeout plan materialize next actions；默认 report-only，可直接为 runnable / blocked / manual action 写入脱敏 runner 报告并保留 action 的 input template 命令、缺失前置和字段级 operator checklist；显式 `--execute` 且 `RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT` 后才按顺序执行选中的可运行机器步骤；不执行 blocked action 或人工签收 | 给齐真实输入后按证据组受控执行 |
| `scripts/deploy/backup-restore-rehearsal-script.test.mjs` | 备份恢复演练脚本轻量测试，锁住 CLI、安全防呆和 release evidence gate 需要的 JSON 字段，不执行 Docker / DB 恢复 | 调整 `run-backup-restore-rehearsal.sh` 后 |
| `scripts/deploy/rollback-rehearsal-report.mjs` | 从真实 rollback / forward-fix 演练步骤和非空全通过 post-smoke report 生成脱敏 `rollback-rehearsal-report.json` | 发布回滚 / 前向修复演练后 |
| `scripts/deploy/customer-config-manifest-evidence.mjs` | 生成客户配置 runtime manifest fingerprint evidence，写入已有 release evidence 目录 | 客户配置 revision 激活前 |
| `scripts/deploy/customer-config-activation-gate.mjs` | 客户配置激活前门禁，组合检查 runtime manifest 与 release evidence；支持 `--json` 输出 evidence-only scope，失败时会带 release evidence status / closeout next actions；不执行后端激活、migration 或导入 | 客户配置 revision 准备激活前 |
| `scripts/deploy/customer-config-release-execute.mjs` | 客户配置发布执行器，默认只出报告；支持 `--print-input-template` 输出 validate / publish / transition check / activate 或 rollback / effective-session 读回输入模板；显式确认后才执行；activate / rollback 在管理员凭据与首次 JSON-RPC 前先用 release evidence 的目标数据库、完整 SHA 和 migration 校验同一后端 `/readyz/runtime-identity`，切换 mutation 再复用后端校验 hash、产品版本和观测 active revision 的 CAS identity | 客户配置 revision 发布 / 激活 / 受控回滚执行前 |
| `scripts/deploy/customer-config-release-readiness.mjs` | 客户配置发布就绪聚合门禁，复核 manifest、manifest evidence、release evidence、activation gate 和可选执行报告；支持 `--print-input-template` 输出 active revision 读回证据前置清单，支持 `--readback-preflight-report` 写 no-write 读回缺口报告，支持 `--json` 输出 evidence-only scope，失败时会带 release evidence status / closeout next actions，明确 readiness 只聚合证据、不执行发布或后端写入 | 客户配置 revision 发布前或执行后声明 ready 前 |
| `scripts/deploy/production-preflight.sh` | 产品级生产发布前门禁，检查运行时 env、一次性 admin bootstrap、固定镜像 tag、SMS mock、debug 写入开关、PDF async warmup / 固定 Chromium、Compose、migration 脚本、PostgreSQL / 后端 / Jaeger loopback 和低配部署边界；对应测试已接入 fast / strict | 每次生产发布 / 部署后运行态复核前 |
| `scripts/qa/populated-upgrade-preflight.sh` | 以固定 `--audit` allowlist 选择 `20260714055504` populated upgrade 或 `20260714055825` customer config cutover read-only 审计；不执行 migration、不自动 DML、不输出 DSN | 现存数据库升级或 restored DB 演练 apply 前 |
| `scripts/deploy/migrate-online.test.mjs` | 用 fake Docker / psql / Atlas 锁住线上 migration 的 `status -> populated upgrade 审计 -> customer config cutover 审计 -> dry-run -> apply` 顺序、任一审计或 dry-run 失败不 apply 和整段 `flock` 串行；本机无 `flock` 时仅跳过并发行为断言 | 调整 `migrate_online.sh` 后 |
| `scripts/qa/core-boundary.test.mjs` | 自动扫描 `server/internal/core`，防止纯产品规则层 import `biz/data/service`、Ent、SQL、HTTP、配置或文件系统依赖 | 调整 `server/internal/core` 后 |
| `scripts/qa/workflow-fact-boundary.test.mjs` | 自动扫描 Workflow runtime，防止任务完成链路直接引用 Operational Fact、库存、出货或财务事实写入口 | 调整 Workflow usecase、repo 或 JSON-RPC 后 |
| `scripts/qa/formal-frontend-customer-config-boundary.test.mjs` | 自动扫描正式前端 runtime，防止业务页面直接消费 raw 客户配置包，并锁住页面 / 动作 / 字段策略必须来自 `get_effective_session` 投影 | 调整客户配置运行时投影、正式菜单、字段策略或业务页面动作权限后 |
| `web/src/erp/config/entryConfig.test.mjs` + `menuPermissions.test.mjs` + `seedData.test.mjs` + `workflowStatus.test.mjs` | 锁住角色菜单、岗位任务端入口、桌面 seedData、正式菜单权限和前端业务状态配置合同；已纳入 fast / strict，不替代后端 RBAC 或真实登录 | 调整角色入口、菜单权限、seedData、试用角色入口或前端状态流转配置后 |
| `web/src/dev-workbench/config/devHub.test.mjs` + dev-only config tests | 锁住 `/__dev` 导航、测试入口、文档查看器、治理地图、原型查看器、能力真源入口、客户配置控制台和打印模板字段预检配置合同；已纳入 fast / strict，不进入正式菜单 | 调整 `/__dev` 页面、测试入口、原型 / 文档 / 能力真源入口、客户配置控制台或打印模板字段预检后 |
| `scripts/qa/trial-role-entry-docs.test.mjs` | 锁住试用角色演示账号、单端口岗位路径和前端说明必须覆盖当前 9 个业务岗位，避免 README / 脚本口径落后真实 seed / RBAC | 调整试用账号、岗位任务端入口或角色权限模板后 |
| `scripts/qa/trial-account-rbac.test.mjs` | 无后端单测锁住试用账号 RBAC 检查脚本必须拒绝多角色、多 mobile 权限、admin mobile 泄漏、debug 权限、super admin 和 disabled 账号，并确认 Go seed / RBAC / 前端移动入口 / 浏览器 smoke / 文档里的试用角色投影未漂移 | 调整试用账号 RBAC 检查脚本后 |
| `scripts/qa/sales-order-field-chain-boundary.test.mjs` + `web/src/erp/config/printTemplates.test.mjs` | 锁住销售订单受理本地试用字段链路和打印 catalog 边界：列表 / 导出同受 `sales_orders.default` 字段策略控制，销售订单打印未接通前不得绕过 mapper、注册模板或发布明细字段策略 | 调整销售订单字段策略、导出列、打印字段链路、打印 catalog 或试用闭环文档后 |
| `scripts/qa/dev-entry-boundary.test.mjs` | 锁住 `/__dev`、测试入口和客户配置预检控制台仍是开发态入口：不进正式菜单、不索引 reference/archive 命令、不把 dry-run / 测试应用写成真实导入 | 调整开发验收入口、测试入口、客户配置预检控制台或正式菜单边界后 |
| `scripts/qa/frontend-error-message-boundary.test.mjs` + `web/src/common/utils/errorMessage.test.mjs` + `web/src/erp/utils/userVisibleTechnicalFields.test.mjs` + `web/src/erp/utils/dashboardTaskDisplay.test.mjs` | 扫描正式前端页面、组件、岗位任务端和共享 PDF 预览工具，防止用户可见错误提示直接透传 `error.message`；同时锁住统一中文错误 helper、业务界面不展示 raw id / 内部字段，以及任务来源筛选不展示 `source_type` 原始 key | 调整正式页面错误提示、打印工作台、移动端动作、错误 helper、业务字段回显、任务来源展示或技术字段可见性后 |
| `scripts/qa/phase-label-boundaries.mjs` + `.test.mjs` | 全仓扫描活跃代码、脚本和正式文档，阻止完整 Phase 编号、紧凑 phase 编号、P 子阶段编号和 P 编号发布目标等阶段命名；允许 P0/P1 风险等级、p95 百分位和产品编码，跳过归档、外部资料、发布证据、生成产物及机器维护的历史 Gitleaks 指纹基线 | 调整命名、脚本、API、运行时代码或治理文档后 |
| `scripts/qa/docs-inventory.test.mjs` | 自动扫描当前维护 Markdown，确认已登记到 `docs/文档清单.md`，并阻止外部参考原文目录或退役相邻项目名重新进入活跃文档 | 新增、删除、重命名或调整长期维护 Markdown 后 |
| `scripts/qa/yoyoosun-role-flow-handbook.test.mjs` | 完整客户 checkout 中的永绅交付文档专项；锁住甲方确认表、角色手册、验收清单、执行手册和客户矩阵，不属于 Product Core 普通门禁或源码包 | 调整永绅岗位、权限、流程、客户包或客户交付文档后显式运行 |
| `scripts/inventory-pg.sh` | 库存事实本地 PostgreSQL migration / 集成测试防呆入口 | 验证库存流水、余额、SKU、预留、出货、冲正和并发边界 |
| `scripts/bom-lot-pg.sh` | BOM 与批次库存本地 PostgreSQL migration / 集成测试防呆入口 | 验证 BOM schema 和批次库存行为 |
| `scripts/purchase-receipt-pg.sh` | 采购入库本地 PostgreSQL migration / 全链关键事务并发测试防呆入口；full 通过该入口创建同批唯一临时库，并在历史升级库验证 kg→g 存量转换 | 验证采购、库存/出货、ProcessRuntime、源单、Workflow CAS / receipt 并发及迁移数据保持 |
| `scripts/purchase-return-pg.sh` | 采购退货当前完整 PostgreSQL migration / 集成测试防呆入口；使用与关键事务矩阵一致的 schema，不保留旧 migration 上限兼容分支 | 验证采购退货 schema、OUT 扣减、REVERSAL 回补和批次并发扣减 |
| `scripts/doctor.sh` | 检查本机依赖和 hooks 是否齐全 | 环境初始化 / 异常排查 |
| `scripts/qa/fast.sh` | 高频快速检查；scripts Node 测试使用显式 `fast / database / browser / release` 清单，本入口只运行 fast 组，并覆盖正式前端客户配置投影、角色菜单 / seedData、开发入口、试用账号、客户导入、运行时 manifest、文档清单、Web 静态检查和 server quick | 日常开发 |
| `scripts/qa/trial-account-rbac.mjs` | 只读验证角色演示账号的真实登录、角色、电脑端菜单、岗位任务端入口权限和 debug 权限边界；老板必须同时保有工作台与业务看板；`--preflight-report` 会先写本地 no-write 前置报告，真实运行可选 `--report` 写脱敏报告，不保存密码或 token | 生成试用 / 演示账号后 |
| `scripts/qa/yoyoosun-role-jsonrpc-access.mjs` | 九岗位真实登录访问门禁：每个账号执行一条允许读取、一个预期 `PermissionDenied` 的安全写探针及前后总数核对；只允许本机后端，不保存密码或 token，登录会产生正常认证会话但预期业务写入为零 | 调整永绅岗位 RBAC、协作只读权限或演示账号后 |
| `scripts/qa/customer-config-boundaries.mjs` | 只读验证 customer config 草案仍是 draft，未放开 runtime / schema / import / RBAC 边界，并扫描后端 Product Core 运行时代码没有嵌入 yoyoosun / 永绅客户专属规则 | 调整客户配置草案、客户配置 runtime 或后端客户差异边界后 |
| `scripts/qa/customer-config-effective-session-probe.mjs` | 无 Authorization 的 `customer_config.get_effective_session` 本地只读探针；可写 `output/customers/yoyoosun/customer-config-effective-session-probe/current.json`，确认本地后端可达和 `40302 未登录` / 缺真实登录证据边界，不读取 token、不证明 active revision | yoyoosun 本地入口已命中但还没有演示密码 / token，需要解释为什么不能证明后端 active revision 时 |
| `scripts/qa/customer-package-lint.mjs` | 验证客户配置包结构、流程预览、状态机预览、策略预览和 preview-only 打印 party defaults 仍只做 lint / preview，不接 Workflow / Fact runtime，不覆盖供应商业务快照 | 调整 `config/catalog`、`config/schemas` 或客户包流程 / 打印配置草案后 |
| `scripts/qa/customer-package-preview-boundary.test.mjs` | 锁住 yoyoosun 客户包 `businessFlows / stateMachines / processPolicies` 仍为 preview-only，不执行 runtime command、不写 Fact、不覆盖 usecase 生命周期 | 调整客户包流程、状态机或策略预览后 |
| `scripts/qa/customer-config-runtime-manifest.mjs` | 将已跟踪客户包编译为后端 `customer_config` 可验证的 runtime manifest，检查 moduleStates、role key 映射、页面 / 字段投影、受控流程定义、打印 snapshot 和 forbidden payload；正式编译与 `local_test_apply` 分开校验，revision 长度不超过 64，只允许白名单 ProcessRuntime 读取，不写 Fact | 调整客户包 catalog、模块状态、角色池、页面投影、字段策略、打印配置草案、流程定义证据或 runtime 发布输入后 |
| `scripts/qa/erp-field-linkage.mjs` | 字段联动专项测试并刷新 latest 覆盖报告 | 改字段真源、保存转换、合同金额、打印快照后 |
| `scripts/qa/test-coverage-collect.mjs` | 绑定当前 commit / worktree 指纹运行非数据库 baseline，采集 Go / Web 覆盖、显式业务场景、字段联动、导入合同和受影响门禁状态，并刷新开发测试入口 latest 报告 | 需要刷新开发工作台真实覆盖证据时 |
| `scripts/qa/prepare-push.sh` | 最终 clean HEAD 推送准备；默认 `origin/main` 只执行签名的 remote/ref/range、git-log、严格 secrets 与源码完整性检查，高成本门禁交给 R640 exact-SHA CI；显式 `--full` 保留为本地完整诊断，非标准远端或 ref 保持保守门禁 | commit 后、立即 push 前 |
| `scripts/qa/full.sh` | 完整本地检查；复用 fast 基础守卫但不复跑稍后由 Web / server 全集覆盖的合同和 quick 子集，一次运行四个显式 scripts Node 组、secrets、前端 test / build、历史 populated upgrade、同批唯一 PostgreSQL、Chromium / PDF、安全集成、服务端 test / build和 govulncheck | 独立完整诊断、`prepare-push --full` / strict 内部 |
| `scripts/qa/run-gate-with-managed-database.mjs` | DEV 质量门禁的本机隔离数据库生命周期包装器；固定 `postgres:18.1`、随机运行凭据、`127.0.0.1` 动态端口和 operation label，容器内部 healthy 后还要求宿主回环 `SELECT 1` 连续三次通过，再原样调用正式 full / strict 回执入口，并要求精确容器清理读回 | 质量门禁页没有显式 loopback database base 时 |
| `scripts/qa/strict.sh` | 严格检查；先运行独有 shell / YAML 静态检查，再以 strict profile 单次复用 full，扩展视口、前端零 warning 与严格 govulncheck 均只执行一次 | 发版前 |
| `scripts/qa/db-guard.sh` | 约束 schema 变更必须带 migration | 改数据模型后 |
| `scripts/qa/agents-size.sh` | 扫描全部 AGENTS.md；16 KiB 预警、超过 24 KiB 阻断，不自动改写 | 修改长期协作规则后 |
| `scripts/qa/skill-health.mjs` | 检查项目 Skill frontmatter、目录名、metadata、README 索引和相对引用；不依赖 PyYAML | 修改 `.agents/skills/**` 后 |
| `scripts/qa/error-code-sync.sh` | 校验前后端错误码同步 | 改错误码后 |
| `scripts/qa/error-codes.sh` | 阻止业务代码裸写已注册错误码 | 改接口 / 鉴权 / 前端错误处理后 |
| `scripts/qa/shellcheck.sh` | 检查 shell 脚本 | 调整脚本后 |
| `scripts/qa/shfmt.sh` | 统一 shell 格式 | 调整脚本后 |
| `scripts/qa/go-vet.sh` | 执行 Go vet | 改 Go 代码后 |
| `scripts/qa/golangci-lint.sh` | 执行 golangci-lint | 改 Go 代码后 |
| `scripts/qa/yamllint.sh` | 检查 YAML 语法与风格 | 改 YAML 后 |
| `scripts/qa/govulncheck.sh` | 扫描 Go 可达漏洞 | 推送前 / 发版前 |

前端浏览器级样式回归不在 `scripts/qa` 下，统一执行：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm style:l1
```

如需按真实管理员登录流程回归合同编辑、在线预览时延、下载 PDF 和浏览器打印入口，再执行：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make run

cd /Users/simon/projects/plush-toy-erp/web
pnpm smoke:purchase-contract-real-login
pnpm smoke:processing-contract-real-login
```

## 推荐顺序

### 0. 导入冻结与 dry-run 工具 / Import freeze and dry-run tooling

导入准备的命令、参数、产物和客户私有验证统一见 [导入准备脚本](import/README.md)。

主路径是来源清单校验、结构化提取、快照冻结和 dry-run。Product Core 只使用脱敏样本；这些工具不连接后端或数据库，不执行真实业务导入。运行参数以各脚本的 `--help` 为准。

### 1. 初始化环境

先确认本机工具链满足仓库锁定版本，再安装依赖和启用 hooks：

```bash
cd /Users/simon/projects/plush-toy-erp
corepack enable
bash /Users/simon/projects/plush-toy-erp/scripts/doctor.sh
bash /Users/simon/projects/plush-toy-erp/scripts/bootstrap.sh
```

### 2. 收口默认占位和配置

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh
bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict
```

### 2A. 生成角色演示账号

角色演示账号、岗位种子、模拟数据和相关验证统一见 [QA 脚本](qa/README.md) 与 [服务端说明](../server/README.md)。

使用正式 seed 入口准备模拟账号；账号权限、客户配置和业务事实分别核验。模拟账号及其数据不代表客户验收，不在文档中记录真实密码。

### 2B. Customer Config 草案边界检查

客户配置的校验、发布、激活与有效会话读回见 [客户配置目录](../config/README.md)、[QA 脚本](qa/README.md) 和 [服务端业务层](../server/internal/biz/README.md)。

配置只能投影 Product Core 已有能力；草案校验通过不等于已激活、已部署或已完成客户验收。

### 2C. Core 产品规则层边界检查

Core、Workflow 与 Fact 的职责见 [Core 目录](../server/internal/core/README.md) 和 [业务层目录](../server/internal/biz/README.md)。自动守卫及运行方式见 [QA 脚本](qa/README.md)。

Workflow 完成与业务事实过账分别核验，规则和代码以各领域正式真源为准。

### 3. 日常开发检查

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/fast.sh
```

前端样式任务额外执行：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```

字段联动、残值、缺值或打印快照字段改动后额外执行：

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/erp-field-linkage.mjs
```

刷新开发测试入口的代码覆盖、显式业务场景和验证范围状态（内部键 T0-T8）：

```bash
cd /Users/simon/projects/plush-toy-erp
node scripts/qa/test-coverage-collect.mjs --profile baseline --write
```

本地开发服务的「开发测试入口 → 覆盖状态」提供同一固定 baseline 的「一键采集覆盖率」：页面先取得本机 DEV 会话令牌，再只提交 `collect + idempotencyKey` 意图；服务端解析项目锁定的 Node / pnpm、持久化阶段、持有跨进程互斥锁并自动运行上面的固定命令，调用方不能传命令、参数、路径、环境变量或 profile。测试证据和聚合报告先写入 ignored operation staging，完整候选读回和仓库身份核对通过后才按“证据先、latest 报告最后”原子提升；最终提升后的身份复核失败会恢复上一份 latest。页面切换不会中断后台任务，重新进入后会从 `output/dev-workbench/coverage-operations/**` 读回状态；启动失败、服务中断或采集期间仓库身份变化均不能伪造完成，上一份报告继续保留。

该 baseline 不写 PostgreSQL、不执行真实业务浏览器、目标部署或 UAT；测试真实执行完但存在失败、缺失或零执行时，会生成绑定当前仓库身份的 issues 报告，不能沿用旧绿色。只重新聚合已有制品时使用 `node scripts/qa/test-coverage-report.mjs --write`；页面保留 baseline 命令仅作开发接口不可用时的备用入口。

### 4. 最终推送准备

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/prepare-push.sh
git push
```

切换 GitLab 主链后，本地 remote 固定为 `origin=GitLab`、`github=GitHub`，普通 `git push` 只更新 GitLab。先完成 commit 并确认 worktree clean。默认且仅限单一 `origin refs/heads/main:refs/heads/main` 时，准备脚本按真实 aggregate range 复算 affected 风险，但不在 Mac 重复执行 affected/full/托管数据库；它执行并签名 HEAD/tree、remote/ref/range、git-log、逐范围严格 secrets、源码完整性、gate/environment 指纹与 30 分钟 TTL，hook 按真实 push stdin 重新计算。高成本测试和构建由推送后 R640 GitLab Runner 对 exact SHA 执行，`server-ci` 回执只授权普通非强制 push，不代表流水线已成功。其他 remote/ref、多 ref 和显式 `--full` 保持保守本地行为；代码、测试、依赖、migration、门禁、关键环境或远端 ref 变化后必须重新准备。

GitHub `main` 只由 GitLab protected-main push mirror 更新，不从本地直接推送，也不运行仓库 CI。需要网页 GPT 审查时，先完成已授权的 GitLab 正式推送并等待 `CI Gate`，再读回 GitHub `main` 已镜像到相同 SHA；GPT 按本次推送前的 base SHA 到该 head SHA 比较。审查意见只是外部输入，发现有效问题后回到当前仓库形成新提交并重新走 GitLab 门禁。

产品范围冻结后，同一 clean exact SHA 只执行一轮匹配的 `prepare-push`；默认 `origin/main` 不在本地重复高成本门禁。最终门禁只有发现会影响生产正确性、安全、数据完整性、权限
或可恢复发布的缺陷时才允许改候选并重新进入 affected；fixture、mock、选择器、
测试文案、开发工作台或证据展示问题若不使生产结论失效，登记后续事项，不在
当前候选继续扩展 QA 或从头重跑。真实 CI / 目标阻塞只报告精确阻塞、清理状态
和回滚点，不新增另一层门禁。

只想独立诊断完整本地门禁、不准备 push 时运行：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/full.sh
```

### 5. 发版前检查

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/strict.sh
```

开发库 migration 不由启动命令自动执行。登记共享开发库在人机终端进入 `server/`
后只运行：

```bash
make migrate
```

CI / Codex 等非交互环境显式使用两阶段；准备成功只表示 `writes=0 / ready`，
不表示 migration 已完成：

```bash
make migrate_prepare
MIGRATE_OPERATION_ID='<同一次 ready 输出>' \
MIGRATE_OPERATION_CONFIRM='<同一次 ready 输出>' \
make migrate_execute
```

裸 `make migrate` 在非交互环境以 exit 2 / `ACTION_REQUIRED` 停止且没有准备
副作用。高层服务固定执行 status、停后端、冻结 migration 快照、存量只读审计、
Atlas validate / `tx-mode=all` dry-run、全部 pending SQL 的同事务真实预演并
`ROLLBACK`、真实备份与隔离恢复。execute 在写入前再次核对 source、目标状态和
备份文件身份，再 apply 一次并读回 `pending=0`、Ent / PostgreSQL schema 零差异、
后端 health / ready。结果未知时先读回且不自动重试。`migrate_status` 是只读诊断；
裸 `migrate_plan` 兼容路由到同一高层 prepare；裸 TTY `migrate_apply` 会恢复
唯一 ready operation，找不到时重新准备并等待完整确认。只有携带完整内部确认
的调用才进入高层服务复用的低层 plan / apply 合同，因此旧命令不再因缺 token
必然失败，也没有放宽目标、备份、停写或一次 apply 边界。环境变量覆盖的远程库、
133 上其他实例、生产或归属不明目标仍使用正式发布流程。

高层 `make migrate` 停止本项目后端后，会按数据库会话的实际状态判断风险，不按
客户端名称判断。没有事务、没有快照或 advisory lock、状态为 `idle / ClientRead`
的普通连接（包括 DbGate）只输出脱敏的 `[migration-client]` 诊断并直接放行，不要求
关闭，也不会调用 `pg_terminate_backend`。活动查询、打开事务、持有快照 / advisory
lock 或状态不明的连接仍以 `database_clients_active` 阻断，并显示客户端 PID、应用名、
状态、来源和阻断原因。plan 预演后与正式 apply 前会再次复核；Atlas 正式 apply 使用
`tx-mode=all`，同时限制 advisory lock 等待为 10 秒、表锁等待为 5 秒、整批语句为
120 秒，冲突时停止且不自动重试。交互与非交互入口使用同一会话安全边界。

#### 共享开发库终端回执（Migration terminal receipt）

上述六个共享开发库入口在成功、无需执行、等待确认、前置阻断、执行失败或结果无法证明时，都会在终端末尾输出恰好一组 `[migration-summary]`。旧的 `[migration]` / `[migration-workflow]` 进度与机器解析行暂时保留，新的稳定终态字段如下：

| 字段 | 口径 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `command / mode / phase` | 本次入口、运行模式和停止阶段。 |
| `target` | 仅输出 scope、host、port、database；目标尚未安全解析时明确为 `unavailable`。 |
| `current / latest / applied / pending` | 已安全读到的同目标 Atlas 状态；读不到时明确为 `unknown`，不拿旧状态补造。 |
| `result` | `passed / up_to_date / ready / action_required / blocked / failed / not_proven / already_applied`。 |
| `writes` | `0` 表示已证明本次未写库；`committed` 表示一次正式 apply 已提交并完成读回；`unknown` 表示提交结果无法证明。 |
| `apply` | `not_requested / not_started / skipped / attempted_once / executed_once / already_executed`，描述本次调用与正式 apply 的关系。 |
| `operation` | 高层 operation UUID；尚未创建时为 `none`。 |
| `runtime` | health / ready 状态；未检查或读不到时为 `unknown`。 |
| `error_code / next_action` | 稳定错误分类和下一动作 token；成功时 `error_code=none`。 |

`auto_retry=false` 是固定安全边界。尤其看到 `result=not_proven`、`writes=unknown` 或 `next_action=run_status_no_auto_retry` 时，只能重新运行只读 `make migrate_status` 并核对 operation，不得自动重试 apply 或执行 `migrate_set`。`make` 自身可能把子进程的 exit 1 / 2 都表现为 recipe 失败，自动化应同时读取 `result`，不能只看最外层 exit code。

回执不会包含用户名、密码、完整 DSN、原始错误或确认值；原始人类可读错误另行脱敏输出到 stderr。为了让显式 `migrate_prepare → migrate_execute` 仍可操作，prepare 的受控 continuation 会在回执前单独给出本次 operation 的确认变量；低层 `migrate_status / plan` 为现有服务端 parser 保留的旧机器行也可能在回执前给出内部确认。它们都不是通用回执字段，不应复制进日志、工单或聊天。终端回执也不替代备份、隔离恢复、停写、目标 identity、一次 apply 和同目标读回证据。

普通本地开发可从
`http://127.0.0.1:5175/__dev/database-migration` 使用同一底层合同，不必手工
复制 status / plan / apply 的临时确认值。普通 `pnpm start` 遇到 pending migration
或其它本地数据库 / 后端预检失败时会保留该受限恢复页；预检最多等待 15 秒，超时取消检查后仍启动 Vite；
恢复期间普通 ERP 页面、其它 DEV API 与 RPC 保持阻断。页面只支持 application config 已
登记的 `192.168.0.133:5432/plush_erp`：先点“检查并准备”，Bridge 固定完成
status、停止后端、plan、备份恢复演练与身份复核；再输入页面给出的完整确认串，
execute 写入前还会重新核对备份文件身份，
同一 operation 只执行一次 apply、`pending=0` 读回、后端重启和 health /
ready，并重新通过完整启动检查。旧 ready 计划可显式重新检查并准备，旧确认随之失效。migration / schema / guard / 备份编排真源或目标状态变化后旧计划失效，
结果不明确时标记 `not_proven` 并先读回，不自动重试。

工作台 operation 使用跨进程排他锁、幂等键和 `0600` 原子状态文件。完全相同的
迁移真源与目标状态可以复用已通过且 dump 大小 / SHA-256 读回一致的备份恢复
报告，避免非写入阻断后反复备份；它不会运行 `fast`、`full`、`strict`、完整
验收 lifecycle 或发布构建。数据库已到 head 时不要求备份工具，只显示状态，不重新 apply 或
重建。该入口不是任意数据库控制台，也不能替代演示、验收或生产发布流程。

生产发布还必须使用准备好的运行时 `.env` 执行产品级 preflight；该命令不执行 migration，只确认发布前门禁是否满足，包括 secret 占位、固定镜像 tag、SMS mock、debug seed / cleanup、PostgreSQL / 后端 HTTP / Jaeger loopback 和低配部署边界：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/deploy/production-preflight.sh \
  --deployment-target <demo-133|customer-test-133> \
  --env-file /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod/.env
```

写入 release evidence 时只保存脱敏检查输出，不保存真实 `.env`：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/deploy/production-preflight.sh \
  --deployment-target <demo-133|customer-test-133> \
  --env-file /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod/.env \
  --runtime \
  --out /Users/simon/projects/plush-toy-erp/deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/production-preflight-report.txt
```

不写 evidence 的发布前 env-only 预检可以不带 `--runtime`；但正式 release evidence 必须在部署后带 `--runtime`，同时记录 Compose 服务、容器实际 `ERP_PDF_WARMUP=async`、Chromium / chromium-common exact pin 和 `/healthz` / `/readyz`。

产品级 production preflight 只核配置与部署边界，不读取业务行。现存数据库升级链在 apply 前必须依次完成两项独立只读审计：`populated-upgrade` 同时覆盖 `20260714055504_migrate.sql` 的存量边界和 WIP `20260717035245 -> 20260717043625` 委外关联切换，`customer-config-cutover` 覆盖 `20260714055825_customer_config_append_only_and_role_backfill.sql` 的切换边界。`migrate_online.sh` 的非 `--status-only` 路径会在 Atlas status 后按此顺序调用；任一失败都不会进入 dry-run 或 apply。需要单独复核时，使用固定 `--audit` 值，并通过容器模式或环境变量名传入 DSN，不能把连接串直接写进命令或报告：

```bash
sh /Users/simon/projects/plush-toy-erp/scripts/qa/populated-upgrade-preflight.sh \
  --audit populated-upgrade \
  --docker-container <postgres-container> \
  --database <database> \
  --username <username>

sh /Users/simon/projects/plush-toy-erp/scripts/qa/populated-upgrade-preflight.sh \
  --audit customer-config-cutover \
  --docker-container <postgres-container> \
  --database <database> \
  --username <username>

# POPULATED_UPGRADE_DATABASE_URL 先由受控运行环境注入，不在命令行赋值或输出
sh /Users/simon/projects/plush-toy-erp/scripts/qa/populated-upgrade-preflight.sh \
  --audit populated-upgrade \
  --database-url-env POPULATED_UPGRADE_DATABASE_URL

sh /Users/simon/projects/plush-toy-erp/scripts/qa/populated-upgrade-preflight.sh \
  --audit customer-config-cutover \
  --database-url-env POPULATED_UPGRADE_DATABASE_URL
```

两项审计都以 `BEGIN TRANSACTION READ ONLY` 执行，只报告 blocker。发现不兼容存量行、WIP 旧委外链接、切换后缺失 allocation、遗留流程实例或任务配置 revision 锚点后应停止 apply，由人工治理任务明确数据映射、审计、备份与回滚点；不得向审计、migration 或发布脚本补自动 `INSERT / UPDATE / DELETE`。fresh schema、静态 DDL、Ent 零漂移、Atlas validate 或空库迁移不能替代存量升级证明。备份恢复演练同样先恢复 dump、记录 pre-apply status、依次运行两项审计，再允许 Atlas apply。

`scripts/deploy/deployment-package-lint.test.mjs` 会锁住 yoyoosun 部署资料包结构、敏感文件排除，以及 release evidence 模板必须包含 gate 需要的 `backupId`、`image-digests.txt`、preflight / backup / pre-apply migration / migration / smoke / restore / rollback evidence 文件名和 backup restore artifact 字段；同时锁住 backup evidence 模板必须包含 backup id / 时间 / release / migration version / 备份大小 / hash / 恢复与 smoke 状态，migration evidence 模板必须包含 `migrationBefore` / `migrationAfter`、`Current Version:`、`Pending Files:` 和脱敏边界，release sign-off 模板必须包含结论字段和必选确认，rollback / forward-fix plan 模板必须包含处置字段、runbook 和必选确认，smoke report example 必须保持非空 checks、必填 `endpointAlias`、可选且脱敏的 `backendEndpointAlias`、summary 数量一致、全通过状态、每项 target、URL / path 检查的 httpCode、无 URL 账号密码和脱敏声明，避免长期模板或样例落后于实际 release gate。
`scripts/deploy/run-smoke-script.test.mjs` 会用本地 fake curl 锁住 `deployments/yoyoosun/scripts/run-smoke.sh` 的 CLI、`--print-input-template` 和输出结构。输入模板只打印目标 smoke 所需 endpoint、backend URL、releaseVersion、environment、report、客户配置 revision 和 token env 名，不触网、不读取 token、不写 `smoke-test-report.json`、不证明 active revision 已读回。真实 smoke report 必须带 `releaseVersion` / `environment`、必填 endpoint alias、可选 backend endpoint alias、非空全通过 checks、URL target 的 httpCode、summary 数量一致和脱敏声明，并提前拒绝带 URL 账号密码的 `--endpoint` / `--backend-url`，避免凭据进入 endpoint alias 或 check target；当提供 `--backend-url` 时，会生成 `server-healthz` / `server-readyz` 检查；当提供 `--customer-config-revision` 时，还会锁住 `customer-config-effective-session` 和真实 `template-pdf-render` 检查。web-only 报告仍可用于诊断，但 release gate 必须看到 PDF 的 `200`、`application/pdf`、64 位 hex SHA-256、正数 `sizeBytes` 和 `responseBodyStored=false` 才会接受。
`scripts/deploy/production-preflight.test.mjs` 已接入 `fast.sh` / `strict.sh`，用于锁住合规 env 可通过、浮动镜像 tag 被拒绝、生产 Compose 不允许 `build:`、`--out` 只写脱敏检查报告且要求输出目录已存在，以及 `--runtime` 从容器实际 env 拒绝 `ERP_PDF_WARMUP=off`、校验 Chromium exact pin 和 health / ready 的门禁；测试通过 fake Docker / curl 锁定结构，不连接目标服务器。
`scripts/deploy/collect-evidence-script.test.mjs` 已接入 `fast.sh`，用于锁住 `collect-evidence.sh` 生成的 release evidence 草稿包含 `command-summary.txt`、`image-digests.txt` 和 `migration-status-before-apply.txt`，且 `backup-restore-report.json` 的 artifact 相对路径结构不会因为文件缺失或跳出 evidence 目录而被 release gate 拒绝；草稿内的占位字段仍必须由真实 image digest、preflight、恢复演练、smoke、rollback rehearsal 和 sign-off evidence 替换后才能通过 gate。
`scripts/deploy/release-evidence-status.test.mjs` 已接入 `fast.sh` / `strict.sh`，用于锁住 release evidence status 的缺目录、缺 artifact、草稿 evidence、closeout evidence checklist / summary / next actions、JSON 输出、`--fail-on-not-ready` 行为，以及 `scope.evidenceOnly / readyMeaning / notProvenByThisHelper` 范围声明；status 脚本只读当前 evidence 目录，状态包括 `missing / incomplete / draft / attention / ready`，其中 `attention` 表示 release evidence gate 已通过但 status 发现额外 warning，`ready=false`，`--fail-on-not-ready` 会返回非 0。closeout checklist 会按不可变版本、production preflight、备份恢复 / migration 演练、目标 smoke、回滚 / 前向修复、签收，以及需要时的客户配置 active revision 读回分组，输出 `missing / present-unverified / attention / gate-verified`；`closeoutSummary` 会同步统计总项、gate-verified 项、各类 blocker 数和 ready 布尔值，方便机器和人工直接定位目标证据缺口；`closeoutNextActions` 会为每个未 gate-verified 的证据组列出下一条命令和人工核对项，草稿 evidence 全部文件已存在但仍未通过 gate 时也会提示 image digest、production preflight、备份恢复 / migration 演练、目标 smoke、rollback / forward-fix、sign-off 和客户配置读回各自下一步；它仍只读取 evidence 文件，不执行目标动作。除 release gate 主文件外，status 也会把恢复演练支撑 artifact `migration-status-before-apply.txt` 和 `command-summary.txt` 计入缺失判断，缺少这些文件时下一步命令会指向显式 `--backup-purpose pre-migration` 的恢复演练脚本；缺少 `release-evidence.md`、`rollback-forward-fix-plan.md` 或 `release-signoff-checklist.md` 时会提示从对应模板复制草稿，但复制后仍必须人工填真实 release、environment、git commit、image digest、migration、backupId、处置计划、签收结论和勾选项。若同目录已存在 `customer-config-manifest-evidence.json` 且可读到 revision，缺少 `smoke-test-report.json`，或已有 smoke 但缺少 `customer-config-effective-session` 时，status 会输出 warning，并把 `--customer-config-revision <revision>`、`--backend-url <backend-endpoint>` 和 `--admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN` 加入 smoke next command，提醒目标环境 smoke 必须读回 `customer_config.get_effective_session`；如果该 manifest evidence 文件损坏或缺少 revision，status 会输出 warning 并提示重新运行 `customer-config-manifest-evidence.mjs`，不会静默把客户配置发布降级成普通 smoke。若 `smoke-test-report.json` 已经包含 `customer-config-effective-session`，status 还会反查同目录 manifest evidence 是否存在且 revision 与 smoke `expectedRevision` 一致；缺失或不一致时会 warning 并给出重新生成 manifest evidence 的命令，release evidence gate 本身也会拒绝缺失、不匹配或未脱敏审查通过的 `customer-config-manifest-evidence.json`。`ready` 只表示 release evidence gate 已对该目录通过、status 没有发现 warning 且 closeout checklist 已进入 gate-verified，不替代真实目标环境 preflight、恢复演练、smoke、rollback / forward-fix 演练或最终发布执行证据。
`scripts/deploy/release-evidence-closeout-plan.test.mjs` 已接入 `fast.sh`，用于锁住 `release-evidence-closeout-plan.mjs` 的 read-only scope、JSON 输出、文本 gate 摘要、`--fail-on-blocked` 行为，以及每组 closeout next action 的执行前置条件。该 plan 脚本复用 `release-evidence-status.mjs` 的 `closeoutNextActions` 和 `closeoutGateSummary`，每个 action 会同时带出 `gateSummary.errorCount / warningCount / sampleErrors / sampleWarnings` 和字段级 `operatorChecklist`，让执行者在同一队列里看到“还缺哪些执行输入”“真实值应从哪里取、写到哪里、怎么校验”和“当前 evidence 文件为什么仍未过 gate”。它只判断当前本机是否具备执行命令的输入：不可变版本需要 `RELEASE_VERSION / RELEASE_ENVIRONMENT / OPERATOR_ROLE / GIT_COMMIT / SERVER_IMAGE / SERVER_IMAGE_DIGEST / WEB_IMAGE / WEB_IMAGE_DIGEST / MIGRATION_BEFORE / MIGRATION_AFTER / BACKUP_ID`，其中 `release-evidence.md` 已有的非占位 `releaseVersion / environment / gitCommit / backupId / migrationBefore / migrationAfter / image ref / digest` 会作为后续 closeout action 的只读输入复用，环境变量只补仍缺的 release batch 字段；`immutable-version` action 会额外带出 `inputTemplateCommand`，文本输出也会显示 `input template:`，指向 `immutable-version-evidence.mjs --print-input-template`，方便先拿只读输入模板再填真实值；production preflight 需要真实 `--runtime-env-file` 存在且不是 example，备份恢复需要 `SOURCE_POSTGRES_DSN`，目标 smoke 需要 `SMOKE_ENDPOINT`，客户配置读回还需要 `SMOKE_BACKEND_URL` 和 `CUSTOMER_CONFIG_ADMIN_TOKEN`，rollback / forward-fix 需要 `ROLLBACK_TARGET_RELEASE`、`ROLLBACK_TRIGGER_SCENARIO` 和 post-smoke report。`SMOKE_ENDPOINT` / `SMOKE_BACKEND_URL` 必须是无 URL 账号密码的 http(s) 地址，否则对应 action 保持 blocked，避免凭据进入命令、alias 或 evidence。它不写 evidence、不执行 preflight、不恢复备份、不跑 migration、不调用后端、不跑 smoke、不执行 rollback / forward-fix，也不能替代人工 sign-off；CLI 文档使用 `--runtime-env-file`，避免 Node 24 把 `--env-file` 当作 Node 自身参数提前拦截。
`scripts/deploy/release-evidence-closeout-runner.test.mjs` 已接入 `fast.sh`，用于锁住 `release-evidence-closeout-runner.mjs` 的 report-only 默认行为、`--only <action-id>` 选择、`--report` 脱敏报告落盘且拒绝写入 `deployments/<customer>/evidence/**`、显式确认短语、execute 模式拒绝 blocked action、可运行 action 的实际执行路径，以及 report / 文本输出保留 action 的 `inputTemplateCommand` 和 `operatorChecklist`。不带 `--execute` 时只输出计划，不写 evidence，可报告 blocked / manual action 的缺失前置；带 `--execute` 时必须设置 `RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT`，且只 materialize closeout plan 已判定 `canRun=true` 且非人工的 action。runner JSON / report 会输出 display command、env key 名、非敏感 release batch `resolvedInputs`、只读 input template 命令、字段级 operator checklist 和 stdout / stderr 行数，不输出 `SOURCE_POSTGRES_DSN`、`CUSTOMER_CONFIG_ADMIN_TOKEN` 或命令原始输出。即使执行模式开启，runner 也不会执行 `release-signoff` 这种人工步骤，不会绕过 release evidence gate，也不会把 blocked action 当成可执行。
`scripts/deploy/image-digests-evidence.test.mjs` 已接入 `fast.sh`，用于锁住 `image-digests-evidence.mjs` 的 CLI、digest 格式、`image-digests.txt` key-value 输出和与已填 `release-evidence.md` 的 digest 一致性；该生成器只写脱敏 artifact，不构建镜像、不访问 registry、不读取 `.env`。

`scripts/deploy/immutable-version-evidence.test.mjs` 已接入 `fast.sh` 和 `strict.sh`，用于锁住 `immutable-version-evidence.mjs` 的 CLI、release batch 字段校验、Atlas migration version 格式、只更新 `release-evidence.md` 第一组基本信息字段，以及同步写入 `image-digests.txt`。该写入器只消费显式传入的 releaseVersion、environment、operatorRole、gitCommit、server / web image ref、sha256 digest、migrationBefore、migrationAfter 和 backupId；`--print-input-template` 只打印这些输入的 shell 模板和写入命令，不要求 evidence 目录存在，也不写 evidence。它不构建镜像、不访问 registry、不读取 `.env`、不执行 migration、不跑 smoke、不恢复备份、不接触目标环境。
`scripts/qa/populated-upgrade-preflight.test.mjs` 会锁住两份审计 SQL 使用 read-only 事务、固定 audit allowlist、`20260714055504` 数据边界、WIP `20260717035245 -> 20260717043625` 委外关联切换和 `20260714055825` cutover 前置条件，并禁止 DDL / DML；同时覆盖容器、命名 DSN 环境变量、缺输入和审计失败传播。`scripts/deploy/backup-restore-rehearsal-script.test.mjs` 也已接入 `fast.sh` / `strict.sh`，用于锁住恢复演练脚本的 help、缺少 source DSN 时提前拒绝、目标库 DSN 默认防呆、`--backup-purpose` 必须是 pre-migration / pre-deploy / 发布前 / migration 前语义、`--evidence-dir` 必须指向已存在 release evidence 目录、恢复后会先记录 `migration-status-before-apply.txt`、依次运行两项只读审计、全部通过才执行 `atlas migrate apply`，以及 `backup-restore-report.json` 中 release evidence gate 需要的脱敏字段；提供 `--evidence-dir` 时脚本只会复制 `backup-evidence.md`、`migration-status-before-apply.txt`、`migration-status.txt`、`command-summary.txt` 和 `backup-restore-report.json`，不会复制 dump。release evidence gate 会进一步要求 `backup-restore-report.json` 里的 `artifacts.backupEvidence`、`artifacts.preMigrationStatus`、`artifacts.migrationStatus` 和 `artifacts.commandSummary` 是当前 evidence 目录内真实存在的相对路径且文件内容不含完整 DSN / secret，并会解析 pre / post migration artifact 的 `Current Version` 和 `Pending Files`，以及 command summary 的 `backupId / releaseVersion / sourceAlias / restoreTarget / steps`。恢复链跨越 `20260714055504` 或 WIP 委外关联切换时，四处必须记录 `populatedUpgradeAuditStatus=passed`；跨越 `20260714055825` 时，四处必须记录 `customerConfigCutoverAuditStatus=passed`；command summary 步骤必须包含对应 read-only audit。任一缺失都不能形成完整发布证据。静态测试不启动 Docker、不执行 `pg_dump`、不恢复数据库，真实通过仍须来自本次恢复库上的实际审计和 apply。
rollback / forward-fix 演练完成并取得 post-smoke report 后，用报告生成器收口 release gate 需要的 JSON：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/deploy/rollback-rehearsal-report.mjs \
  --environment customer-trial \
  --release-version <release-version> \
  --rehearsal-type rollback-forward-fix \
  --trigger-scenario "smoke failed after activation" \
  --rollback-target-release <previous-release-version> \
  --step "identify rollback target=pass" \
  --step "verify rollback command path=pass" \
  --step "verify forward-fix owner path=pass" \
  --post-smoke-report deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/smoke-test-report.json \
  --customer-config-revision yoyoosun-customer-package-v3.runtime-manifest-v1 \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

该生成器要求步骤非空且全部 `pass / passed / ok`，post-smoke report 的 checks 非空且全部通过，并声明不含 secret / raw customer rows；提供 `--evidence-dir` 时默认写入同目录 `rollback-rehearsal-report.json`。生成的 `postCheck` 会记录 `smokeReport` 和 `smokeCheckCount`，release gate 会要求 `smokeReport` 指向同一 release evidence 目录内的 `smoke-test-report.json`，且 `smokeCheckCount` 与该文件 checks 数量一致，避免只手写 `smokeStatus=passed` 或引用其他批次 smoke。生成器本身也会拒绝绝对路径、非 `smoke-test-report.json` 文件名，或无法解析到输出目录同层 `smoke-test-report.json` 的路径；使用仓库相对路径或 `smoke-test-report.json`。如果提供 `--customer-config-revision`，还会要求 post-smoke report 包含 `customer-config-effective-session`，且 `target=jsonrpc:customer_config.get_effective_session`、`expectedRevision` 匹配传入 revision、记录 token 来源 env 名并声明 `responseBodyStored=false`，生成的 `postCheck.customerConfigEffectiveSession` 才能作为回滚 / 前向修复后读回 active revision 的脱敏证据。它不执行回滚、不恢复备份、不跑 migration、不调用后端。

## 关键说明

### `bootstrap.sh`

- 安装 `web` 和 `server` 依赖
- 安装 Git hooks
- 默认执行一次 `scripts/qa/fast.sh`
- 安装前会先调用 `scripts/doctor.sh`，版本不匹配时直接中止

### `project-scan.sh`

- 检查项目名、服务名、镜像名和页面标题占位
- 检查默认密码、JWT 密钥、数据库名、远端主机等示例值
- 检查文档里是否重新引入初始化占位措辞
- 检查当前仓库是否误引入不需要的部署目录

### `doctor.sh`

- 检查 `git`、`bash`、`node`、`pnpm`、`go`；Bash 当前解释器与 `PATH` 子进程均要求 major >= 4
- 检查 Node 版本锁文件 `.n-node-version`、`.node-version`、`.nvmrc` 是否一致，并要求当前 Node 等于锁定版本
- 检查 `web/package.json` 的 `packageManager` 是否固定为 `pnpm@x.y.z`，并要求当前 pnpm 与之一致
- 在 `server/` 模块内检查 Go toolchain，要求当前 Go 满足 `server/go.mod` 的 `toolchain` / `go` 版本
- 检查 `gitleaks`、`shellcheck`、`golangci-lint`、`yamllint`、`shfmt`、`govulncheck`
- 检查 hooks 和关键脚本是否可执行

### `affected.sh`

- 默认只打印当前 unstaged、staged、未跟踪文件对应的验证计划（内部键 T0-T8），`--run` 才执行。
- 支持 `--staged`、`--base <ref-or-range>`、重复 `--file <path>` 和 `--json`，适合开发过程中按影响面取得快速反馈。
- 优先运行同名 Node 测试；前端、服务端 API、业务事实 PostgreSQL、客户配置 / 导入、schema 和发布路径按风险逐级升级。
- 页面级浏览器回归（Style L1）、`make data` 和目标环境证据作为 required follow-up 明示；未知路径保守升级到 `full.sh`。
- 不修改 hooks；最终 clean HEAD 仍由 `prepare-push.sh` 复算风险并签发短期回执。默认 `origin/main` 的高成本验证由 R640 exact-SHA CI Gate 执行，显式本地 `--full` 仅作独立诊断。

### `fast.sh`

- scripts Node 测试由 `node-test-groups.mjs` 显式登记；只运行 `fast` 高频组，新增 tracked 测试未分组或重复分组会失败
- 前端：`pnpm lint && pnpm css`
- 后端：优先执行 `go test ./internal/... ./pkg/...`
- 试用账号真实 RBAC 无后端边界单测、RBAC / 浏览器 smoke 脚本语法检查、真实登录 smoke 共享 URL 边界单测；不触发真实登录
- 错误码同步、魔法数字检查和文档清单登记检查

### `full.sh`

- 环境阶段先校验当前 Bash 与后续子脚本解析到的 `PATH` Bash，避免 macOS Bash 3.2 在部署合同的关联数组处延迟失败
- 复用 fast 的基础守卫，一次执行 `fast / database / browser / release` 四个 scripts Node 组；不重复稍后由 Web 全集和 server 全集覆盖的 fast Web / Go 子集
- 补充 secrets、前端 lint / css / test / build、本地 PostgreSQL 关键事务门禁和服务端 `go test ./...` / `make build`；最后运行一次固定的 govulncheck v1.6.0，避免外部网络异常先扰动本地并发测试。govulncheck 进程级禁止启动 Go 遥测 sidecar，单次默认限时 300 秒；仅在扫描器/官方漏洞库返回 exit 1 或扫描超时时固定重试一次。真实漏洞 exit 3、参数错误、未知状态和第二次失败仍立即阻断 strict；可用 `GOVULNCHECK_TIMEOUT_SECONDS=1..3600` 调整单次上限
- 若定义了前端 `test`，会一并执行；它仍不替代浏览器里的样式 / box 模型回归
- 始终真实执行固定门禁，不读取或签发本地推送回执；CI strict 也永不读取该回执

研发效能工作台的质量门禁页仍调用同一 full / strict 正式入口。开发服务没有显式 loopback `DISPOSABLE_DATABASE_BASE_URL` 时，会使用本机已有的固定 `postgres:18.1` 镜像自动创建本次专用容器；凭据、DSN、容器命令和本机路径不会返回浏览器。该包装不改变 full / strict 的命令或阶段顺序，容器与内部临时数据库任一清理读回缺失都会使本次结果失败。

### `strict.sh`

- 先执行 strict 独有的 shellcheck、shfmt 和 yamllint，再以 strict profile 单次运行 full
- 前端零 warning、扩展浏览器视口和严格 govulncheck 都在该次 full 中完成，不二次执行同一 lint、测试或漏洞扫描

### `prepare-push.sh` 与 pre-push 回执

- 准备阶段在 Git 建立 receive-pack 连接前查询远端 ref，计算每个目标 range 和 aggregate range，并按目标与选项选择 `server-ci`、`affected` 或 `full`。默认单一 `origin/main` 只执行上文约定的签名短门禁；非标准目标和显式 `--full` 按当次计划执行保守本地门禁。首次把同名分支镜像到空远端时，aggregate range 和严格 secrets 仍覆盖 `empty-tree..HEAD`；只有目标恰为单个缺失同名分支、另一个已配置 upstream tracking ref 存在且为 HEAD 祖先时，数据库守卫和实时 `git log --check` 才使用该 upstream SHA 到 HEAD 的范围。两类范围、remote/ref/SHA 及使用模式都会进入签名回执并由 hook 重算；缺失、分叉、多 ref、改名或同远端场景保持完整聚合 / push 范围或直接失败。
- 每次远端 ref 查询受 20 秒硬超时约束；只有明确的瞬时传输失败才按固定短间隔最多重试两次，权限、仓库、ref 或响应合同错误立即失败。
- 只有选定 profile 的门禁成功，且前后 HEAD/tree、worktree、remote/ref、gate contract 和关键工具/依赖环境均未变化时，才在 `git rev-parse --git-common-dir` 下按 worktree 隔离签发 HMAC 回执；采用并发锁、私有权限、同目录临时文件和原子 rename。
- 环境指纹只归一化 Git 启动 hook 时自动添加在 `PATH` 首部的 `git --exec-path`；其他 `PATH`、工具版本、依赖元数据、数据库 / 浏览器门禁参数或代理环境变化仍会使回执失效。
- 并发 owner 仍存活、owner 信息不可读或 PID 状态不确定时锁保持 fail closed；只有带脚本 token 且 owner PID 已确认不存在的中断残留锁会被原子隔离并清理。
- hook 必须读取真实 push stdin，重算 refs/aggregate range、签名内数据库守卫及 live-check 合同，复核 local SHA 等于 HEAD、clean 状态、回执签名/profile/version/environment/TTL，并实时执行 `git log --check` 和严格 secrets。精确的首次同名镜像只把已验证 upstream..HEAD 用于提交空白检查，严格 secrets 仍扫描新 ref 暴露的完整历史；其他 ref 继续使用原 push range。纯删除/空 stdin 是 no-op，混合删除与更新 fail closed；调用者不能通过 `QA_BASE_RANGE`、`QA_DB_GUARD_RANGE` 或自定义 live range 覆盖准备合同。
- 缺失、过期、远端漂移或任何代码/依赖/migration/测试/门禁/环境变化都会拒绝复用；hook 不回退到 full，因此不会在已经打开的 SSH 连接上长时间等待。`SKIP_PRE_PUSH`、`--no-verify`、调用者指定的 range、回执路径/token/TTL 都不是常规接口。

### npm registry token 边界

- 入库的 `web/.npmrc` 只保留无密钥的 pnpm 行为配置，并将公共依赖安装固定到 `https://registry.npmmirror.com`；CI 安装还会清除通用代理环境，优先直连该镜像。依赖审计不走镜像，固定直连 npm 官方接口，只有瞬时失败且环境已经配置代理时才在最后一次重试使用代理。
- `web/.npmrc` 不写 `_authToken`、`npmAuthToken`、`NPM_TOKEN` 或 `NODE_AUTH_TOKEN`。
- 本机私有 registry token 放在被 `.gitignore` 忽略的 `.npmrc.local`、`web/.npmrc.local`，或通过 shell 环境变量注入。
- `scripts/qa/secrets.sh` 在 git 仓库内扫描 diff / staged 候选文件，并始终检查候选 `.npmrc` / `.npmrc.local` / `.yarnrc.yml` 中的 npm token 明文；安装 `gitleaks` 后会继续执行通用密钥扫描。
- 源码包没有 `.git` 时，`scripts/qa/secrets.sh` 会按脚本所在目录推导项目根目录并扫描包内文件；该模式不支持 `SECRETS_STAGED_ONLY=1` 或 git diff range。

`.gitleaksignore` 只登记 30 条精确到 commit、文件、规则和行号的历史指纹：其中 28 条来自测试、示例配置或文档假值，另 2 条是同一个旧 npm classic token 在历史 `.npmrc` 与 `.yarnrc.yml` 中的重复记录。npm 已于 2025-12-09 永久吊销全部 classic token，因此该旧值不能继续认证，也不能恢复或重新创建。

该基线不是路径、规则或提交级 allowlist；任何新提交、新文件、新行号或新规则命中仍会阻断 secrets 门禁。新增历史指纹必须先完成逐条证据复核，并同步精确清单回归测试，不能用扩大忽略范围代替根因判断。

## Hook 对应关系

- `pre-commit` -> `scripts/git-hooks/pre-commit.sh`
- `pre-push` -> `scripts/git-hooks/pre-push.sh`
- `commit-msg` -> `scripts/git-hooks/commit-msg.sh`

`pre-commit` 只读取当前 staged index 快照，并通过 `db-guard` 拒绝缺少 versioned migration 或 `atlas.sum` 的 Ent schema 结构变更；它保持 check-only，不执行 `make data`、`migrate_apply` 或重新暂存文件。

`db-guard` 同时扫描正式 migration、服务端与测试 SQL，除冻结且不可改写的
`20260714055825_customer_config_append_only_and_role_backfill.sql` 外，拒绝
任何新 Function、Procedure、Trigger 或 `EXECUTE FUNCTION/PROCEDURE`；冻结
历史对象必须由更晚的 forward migration 逐项 `DROP`。运行态由
`scripts/qa/database-programmability.mjs` 读取全部非系统 schema 并要求
Function=0、Procedure=0、非内部 Trigger=0。`make dev_restart`、本地
migration apply 和各隔离 PostgreSQL apply 入口都会执行该读回；外键生成的
`tgisinternal=true` 内部 Trigger 保留。

`pre-push` 在 Git 已打开远端 receive-pack 连接后运行，因此只执行回执与真实 push range 的短门禁。默认 `origin/main` 的 `prepare-push.sh` 同样只做签名的短门禁，不在 Mac 重复 affected/full；显式 `--full` 或非标准 remote/ref 仍按原保守合同处理。回执不改变 Git 原生 hook 可被显式绕过的事实，远端 protected main 与 exact-SHA `CI Gate` 才是高成本验证的独立安全边界。发布、制品提升或受保护部署必须读回该 SHA 的不可变终态成功证据；生产目标只加载 CI 构建的不可变制品或镜像，不现场重建。

## 版本锁定

- QA 与部署合同使用 Bash 关联数组；当前解释器和 `PATH` 中供子脚本调用的 Bash 均要求 major >= 4。
- 根目录 `.n-node-version`、`.node-version`、`.nvmrc` 都锁定为 `24.14.0`，分别服务 `n`、通用 Node 版本管理器和 `nvm`。
- `web/package.json` 用 `packageManager: pnpm@10.13.1` 固定 pnpm 版本；建议先执行 `corepack enable`，再进入 `web/` 跑 `pnpm install`。
- `server/go.mod` 当前使用 `toolchain go1.26.6`；后端命令应在 `server/` 模块内执行，或通过 `scripts/doctor.sh` 先确认实际 toolchain。
- 建议执行：切换 Node / pnpm / Go 后先运行 `bash scripts/doctor.sh`，再运行 QA 脚本。

## `-h/--help`

上述脚本均支持 `-h/--help`，可直接在终端查看脚本说明。

示例：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/strict.sh --help
```
