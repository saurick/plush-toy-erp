# QA 脚本说明

本文档只说明当前仓库仍在使用的本地脚本和推荐执行顺序。

## 总览

| 脚本                                                   | 主要作用                                                                                                          | 建议时机                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `scripts/bootstrap.sh`                                 | 安装依赖、启用 hooks、跑快速自检                                                                                  | 新机器 / 首次拉仓库                                        |
| `scripts/project-scan.sh`                              | 扫描项目名、默认密钥、部署地址和页面文案残留                                                                      | 改名后 / 配置收口后                                        |
| `scripts/build/apply-customer-web-config.mjs`          | 本地 / CI 构建后按 `ERP_CUSTOMER_KEY` 把客户 `customer-config.js` 和 assets overlay 到前端静态产物，并带脚本测试锁定复制行为 | 构建客户私有化前端或服务端镜像时                            |
| `scripts/seed-role-demo-admins.sh`                     | 显式生成 dev/test/demo 角色演示管理员账号，绑定真实 RBAC 角色                                                     | 需要多角色登录 / 岗位任务端验收                            |
| `scripts/seed-core-demo-data.sh`                       | 显式生成核心产品模拟基础资料：单位、材料、产品、仓库和 BOM，并输出试用模拟 / 业务事实模拟可复用 ID                | 需要产品主数据、BOM 或业务事实前置 ID 的本地 / 试用演练前 |
| `scripts/seed-trial-sim-masterdata.sh`                | 显式生成试用模拟产品 / 单位主数据，供模拟销售订单行引用                                                          | 试用环境模拟演练前                                         |
| `scripts/import/customerSourceManifestCheck.mjs`       | 校验永绅 yoyoosun tracked source manifest、原始文件 sha256 / 大小和未登记来源文件                                | yoyoosun 原始文件进入导入前 evidence 前                    |
| `scripts/import/customerSourceExtract.mjs`             | 按永绅 yoyoosun source manifest 只读提取允许结构化的原始 Excel，生成本地 source snapshot、空 existing preview、配置候选和报告 | yoyoosun 原始文件整理成导入前 evidence                     |
| `scripts/import/customerSourceSnapshotFreezeCheck.mjs` | customer source snapshot freeze checker，只读取 JSON snapshot 并生成 freeze evidence                              | yoyoosun 导入前 source freeze / 人工 review evidence       |
| `scripts/import/customerImportDryRun.mjs`              | 永绅 yoyoosun 客户导入 dry-run CLI，只读取 JSON snapshot 并生成预览包                                             | yoyoosun 导入前人工 review / 数据映射检查                  |
| `scripts/import/customerImportExecute.mjs`             | 永绅 yoyoosun 导入 execution loader 报告 / 门禁工具；真实 `--execute` 额外要求结构化 backup evidence 与 reviewed recovery plan 绑定同一 `backupId`，当前没有可执行客户真实数据时不执行真实导入 | import tooling 自检 / 单独数据治理评审                    |
| `scripts/qa/trial-simulated-data.mjs`           | 模拟试用数据入口，支持 `--print-input-template` 只读输出前置；真实执行只创建标记为模拟的 V1 客户 / 供应商 / 联系人 / 销售订单数据 | 试用环境演练                                               |
| `scripts/qa/operational-fact-simulated-closure.mjs`    | 业务事实模拟闭环入口，支持 `--print-input-template` 只读输出前置；真实执行只使用显式模拟主数据覆盖生产 / 预留 / 委外 / 出货 / 财务链路 | 业务事实内部模拟验收 / 目标环境事实回归                  |
| `scripts/qa/mobile-workflow-simulated-closure.mjs`       | 模拟岗位任务闭环入口，支持 `--print-input-template` 只读输出前置；真实执行只创建和更新显式模拟 workflow 任务，覆盖审批 / 质检 / 入库 / 出货放行异常和现场留痕 | 岗位任务端回归 / 目标环境移动任务闭环验收                  |
| `web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs`      | 真实浏览器岗位任务端模拟任务回归，创建 `simulated_only` 老板审批 / 退回 / 完成 / 仓库放行任务，在 `/m/boss/tasks` 验证阻塞、退回、完成、催办反馈和内部提醒线索 | 本地 / 试用岗位任务端真实页面验收                         |
| `scripts/qa/mvp-closure.mjs`                    | ERP MVP 闭环验收入口，默认只生成计划和本地 evidence，可选运行现有 no-write report-only 工具                     | MVP 主链路验收口径收口 / 试用前证据整理                  |
| `scripts/qa/purchase-receipt-real-write-e2e.mjs` | 采购入库真实写入链路验收入口，支持 `--print-input-template` 只读输出前置和 `--preflight-report <path>` 本地脱敏前置报告；真实命令默认跑 JSON-RPC 创建 / 加行 / 过账 / 回显 / 库存事实 / 权限测试，可选追加本地 PostgreSQL 防呆测试 | MVP 第一条真实写入链路回归 / 采购入库事实验收 |
| `scripts/qa/industry-template-boundaries.mjs`          | 行业模板候选边界检查，确保模板不变成 tenant、runtime loader、真实导入或事实写入入口                              | 行业模板调整后                                             |
| `scripts/qa/industry-template-closure.mjs`      | 行业模板模拟闭环入口，只读取候选配置并生成 evidence 报告                                                        | 行业模板回归 / 目标环境发布前                              |
| `scripts/qa/private-deployment-boundaries.mjs`         | 多客户私有化复制边界检查，确保客户包模板不变成 SaaS、tenant、代码分叉或真实导入入口                             | 私有化客户包模板调整后                                     |
| `scripts/qa/private-deployment-package-closure.mjs`     | 多客户私有化复制模拟闭环入口，只读取模板并生成 evidence 报告                                                   | 私有化客户包回归 / 目标环境发布前                          |
| `scripts/deploy/deployment-package-lint.mjs`           | 客户私有化部署资料包检查，确保 `deployments/yoyoosun` 必需文件齐全且不含真实 env、备份、raw files 或 secret       | 调整客户部署资料包后                                       |
| `scripts/deploy/image-digests-evidence.mjs`            | 生成 `image-digests.txt`，并在同目录 release evidence 已填 digest 时校验 server / web digest 一致，不构建镜像或访问 registry | 发布 evidence 填充 image digest 时                         |
| `scripts/deploy/immutable-version-evidence.mjs`        | 用显式 release batch 输入更新 `release-evidence.md` 的不可变版本字段，并写入匹配的 `image-digests.txt`；支持 `--print-input-template` 只读输出同批次输入模板；不构建镜像、不访问 registry、不读 `.env`、不执行目标动作 | 补 immutable-version evidence 时                           |
| `scripts/deploy/release-evidence-gate.mjs`             | yoyoosun 发布证据门禁，检查本次 release evidence 的 Git commit 和 image digest 可追溯、`image-digests.txt` 与 release evidence 的 server / web digest 一致、production preflight report、绑定本次 releaseVersion / environment / backupId 且 `migrationVersion=migrationBefore` 的 pre-migration backup、ISO backupTime、正数 backup size、通过态 restore / smoke、带恢复目标 / 命令摘要 / 备份 hash / pre-apply migration artifact / post-apply migration artifact / 无 pending migration 且 restore migration version 匹配 `migrationAfter` 的 backup restore、migration status、非空且全通过 smoke、客户配置 smoke 对应的 `customer-config-manifest-evidence.json`、rollback / forward-fix plan、rollback rehearsal report 和绑定本次 releaseVersion / environment / backupId 的 sign-off 已脱敏填齐，并强制 releaseVersion、environment、backupId、databaseBackupHash、migration version 和客户配置 revision 跨证据一致；支持 `--json` 输出 evidence-only scope，明确 gate 只校验证据、不执行目标动作 | 客户试用或交付前                                           |
| `scripts/deploy/release-evidence-status.mjs`           | 只读检查 release evidence 目录，输出 `missing / incomplete / draft / attention / ready`、closeout evidence checklist / summary / next actions、按证据组归类的 gate error / warning 摘要、缺失 artifact、gate 错误数量、warning 和下一步命令；不执行发布、恢复、migration、smoke 或回滚 | 填 evidence 过程中判断下一步                               |
| `scripts/deploy/release-evidence-closeout-plan.mjs`    | 只读读取 release evidence status 的 `closeoutNextActions` 和 `closeoutGateSummary`，检查每组下一步是否具备本机执行前置条件，并把该证据组当前 gate error / warning 摘要、input template 和字段级 operator checklist 挂到 action；`SMOKE_ENDPOINT` / `SMOKE_BACKEND_URL` 必须是无 URL 账号密码的 http(s) 地址；不写 evidence、不执行目标动作 | 按 next actions 执行前确认缺哪些输入和证据错误             |
| `scripts/deploy/release-evidence-closeout-runner.mjs`  | 基于 closeout plan materialize next actions；默认 report-only，可直接为 runnable / blocked / manual action 写入脱敏 runner 报告并保留 action 的 input template 命令、缺失前置和字段级 operator checklist；显式 `--execute` 且 `RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT` 后才按顺序执行选中的可运行机器步骤；不执行 blocked action 或人工签收 | 给齐真实输入后按证据组受控执行                             |
| `scripts/deploy/backup-restore-rehearsal-script.test.mjs` | 备份恢复演练脚本轻量测试，锁住 CLI、安全防呆和 release evidence gate 需要的 JSON 字段，不执行 Docker / DB 恢复 | 调整 `run-backup-restore-rehearsal.sh` 后                  |
| `scripts/deploy/rollback-rehearsal-report.mjs`         | 从真实 rollback / forward-fix 演练步骤和非空全通过 post-smoke report 生成脱敏 `rollback-rehearsal-report.json` | 发布回滚 / 前向修复演练后                                  |
| `scripts/deploy/customer-config-manifest-evidence.mjs` | 生成客户配置 runtime manifest fingerprint evidence，写入已有 release evidence 目录                              | 客户配置 revision 激活前                                   |
| `scripts/deploy/customer-config-activation-gate.mjs`   | 客户配置激活前门禁，组合检查 runtime manifest 与 release evidence；支持 `--json` 输出 evidence-only scope，失败时会带 release evidence status / closeout next actions；不执行后端激活、migration 或导入 | 客户配置 revision 准备激活前                               |
| `scripts/deploy/customer-config-release-execute.mjs`   | 客户配置发布执行器，默认只出报告；支持 `--print-input-template` 输出 publish / activate / get_effective_session 读回输入模板；显式确认后才通过 JSON-RPC validate / publish / activate / rollback | 客户配置 revision 发布 / 激活 / 受控回滚执行前              |
| `scripts/deploy/customer-config-release-readiness.mjs` | 客户配置发布就绪聚合门禁，复核 manifest、manifest evidence、release evidence、activation gate 和可选执行报告；支持 `--print-input-template` 输出 active revision 读回证据前置清单，支持 `--readback-preflight-report` 写 no-write 读回缺口报告，支持 `--json` 输出 evidence-only scope，失败时会带 release evidence status / closeout next actions，明确 readiness 只聚合证据、不执行发布或后端写入 | 客户配置 revision 发布前或执行后声明 ready 前              |
| `scripts/deploy/production-preflight.sh`                | 产品级生产发布前门禁，检查运行时 env、一次性 admin bootstrap、固定镜像 tag、SMS mock、debug 写入开关、Compose、migration 脚本、PostgreSQL / 后端 / Jaeger loopback 和低配部署边界；对应测试已接入 fast / strict | 每次生产发布 / 部署后运行态复核前                          |
| `scripts/qa/core-boundary.test.mjs`                    | 自动扫描 `server/internal/core`，防止纯产品规则层 import `biz/data/service`、Ent、SQL、HTTP、配置或文件系统依赖 | 调整 `server/internal/core` 后                              |
| `scripts/qa/workflow-fact-boundary.test.mjs`           | 自动扫描 Workflow runtime，防止任务完成链路直接引用 Operational Fact、库存、出货或财务事实写入口               | 调整 Workflow usecase、repo 或 JSON-RPC 后                  |
| `scripts/qa/multi-client-role-workflow-priority-audit.mjs` | 只读审计 `多甲方角色能力流程编排优先级` 的可执行证据，区分已落地、必须 guarded 和仍需目标环境 evidence 的项；支持 `--json`、`--release-evidence-dir`、`--fail-on-release-not-ready` 和 `--fail-on-completion-not-ready` 输出 read-only scope / 强门禁，并摘出指定 release evidence status、blockers、next actions、completion blocking category 和第一缺口输入清单；明确 audit 不执行目标环境动作或真实导入 | 按参考文档继续实现或收口前                                  |
| `scripts/qa/formal-frontend-customer-config-boundary.test.mjs` | 自动扫描正式前端 runtime，防止业务页面直接消费 raw 客户配置包，并锁住页面 / 动作 / 字段策略必须来自 `get_effective_session` 投影 | 调整客户配置运行时投影、正式菜单、字段策略或业务页面动作权限后 |
| `web/src/erp/config/entryConfig.test.mjs` + `menuPermissions.test.mjs` + `seedData.test.mjs` + `workflowStatus.test.mjs` | 锁住角色菜单、岗位任务端入口、桌面 seedData、正式菜单权限和前端业务状态配置合同；已纳入 fast / strict，不替代后端 RBAC 或真实登录 | 调整角色入口、菜单权限、seedData、试用角色入口或前端状态流转配置后 |
| `web/src/erp/config/devHub.test.mjs` + dev-only config tests | 锁住 `/__dev` 导航、测试入口、文档查看器、治理地图、原型查看器、能力台账、客户配置控制台和打印模板字段预检配置合同；已纳入 fast / strict，不进入正式菜单 | 调整 `/__dev` 页面、测试入口、原型 / 文档 / 台账查看器、客户配置控制台或打印模板字段预检后 |
| `scripts/qa/trial-role-entry-docs.test.mjs`             | 锁住试用角色演示账号、单端口岗位路径和前端说明必须覆盖当前 9 个业务岗位，避免 README / 脚本口径落后真实 seed / RBAC | 调整试用账号、岗位任务端入口或角色权限模板后 |
| `scripts/qa/trial-account-rbac.test.mjs`                | 无后端单测锁住试用账号 RBAC 检查脚本必须拒绝多角色、多 mobile 权限、admin mobile 泄漏、debug 权限、super admin 和 disabled 账号，并确认 Go seed / RBAC / 前端移动入口 / 浏览器 smoke / 文档里的试用角色投影未漂移 | 调整试用账号 RBAC 检查脚本后 |
| `scripts/qa/sales-order-field-chain-boundary.test.mjs`  | 锁住销售订单受理本地试用字段链路：列表 / 导出同受 `sales_orders.default` 字段策略控制，销售订单打印未接通前不得绕过 mapper 或发布明细字段策略 | 调整销售订单字段策略、导出列、打印字段链路或试用闭环文档后 |
| `scripts/qa/dev-entry-boundary.test.mjs`                 | 锁住 `/__dev`、测试入口和客户配置预检控制台仍是开发态入口：不进正式菜单、不索引 reference/archive 命令、不把 dry-run / 测试应用写成真实导入 | 调整开发验收入口、测试入口、客户配置预检控制台或正式菜单边界后 |
| `scripts/qa/frontend-error-message-boundary.test.mjs`    | 扫描正式前端页面、组件、岗位任务端和共享 PDF 预览工具，防止用户可见错误提示直接透传 `error.message`，要求走统一中文错误 helper | 调整正式页面错误提示、打印工作台、移动端动作或错误 helper 后 |
| `scripts/qa/phase-label-boundaries.mjs`                | 自动扫描活跃实现路径，阻止 runtime 阶段编号命名进入脚本、API、运行时代码、测试和正式文档入口                      | 调整命名、脚本、API、运行时代码或治理文档后                 |
| `scripts/qa/docs-inventory.test.mjs`                   | 自动扫描当前维护 Markdown，确认已登记到 `docs/文档清单.md`                                                     | 新增、删除、重命名或调整长期维护 Markdown 后                |
| `scripts/inventory-pg.sh`                              | 库存事实本地 PostgreSQL migration / 集成测试防呆入口                                                             | 验证库存流水、余额、冲正和防负库存                         |
| `scripts/bom-lot-pg.sh`                                | BOM 与批次库存本地 PostgreSQL migration / 集成测试防呆入口                                                       | 验证 BOM schema 和批次库存行为                            |
| `scripts/purchase-receipt-pg.sh`                       | 采购入库本地 PostgreSQL migration / 集成测试防呆入口                                                             | 验证采购入库 schema、IN 入库、REVERSAL 取消和批次追溯      |
| `scripts/purchase-return-pg.sh`                        | 采购退货本地 PostgreSQL migration / 集成测试防呆入口                                                             | 验证采购退货 schema、OUT 扣减、REVERSAL 回补和批次并发扣减 |
| `scripts/doctor.sh`                                    | 检查本机依赖和 hooks 是否齐全                                                                                     | 环境初始化 / 异常排查                                      |
| `scripts/qa/fast.sh`                                   | 高频快速检查，包含多甲方角色能力优先级审计、正式前端客户配置投影边界、角色菜单 / seedData 配置合同、开发入口配置合同、试用账号 RBAC 单测 / 浏览器 smoke 输入模板边界测试、真实登录 smoke 共享 URL 边界、客户导入、客户配置运行时 manifest、文档清单、模拟数据工具和阶段编号命名边界守卫 | 日常开发                                                   |
| `scripts/qa/trial-account-rbac.mjs`                    | 只读验证角色演示账号的真实登录、角色、岗位任务端入口权限和 debug 权限边界；`--preflight-report` 会先写本地 no-write 前置报告，核对后端健康、密码 env 和静态角色投影；真实运行可选 `--report` 写本地脱敏报告，不保存密码或 token | 生成试用 / 演示账号后                                      |
| `scripts/qa/customer-config-boundaries.mjs`            | 只读验证 customer config 草案仍是 draft，未放开 runtime / schema / import / RBAC 边界                             | 调整客户配置草案后                                         |
| `scripts/qa/customer-package-lint.mjs`                 | 验证客户配置包结构、流程预览、状态机预览和策略预览仍只做 lint / preview，不接 Workflow / Fact runtime             | 调整 `config/catalog`、`config/schemas` 或客户包流程结构后 |
| `scripts/qa/customer-config-runtime-manifest.mjs`      | 将已跟踪客户包编译为后端 `customer_config` 可验证的 runtime manifest，检查 moduleStates、role key 映射、页面 / 字段投影、`sales_order_acceptance` 受控 `runtime_loader_ready` 流程定义和 forbidden payload；只允许白名单 ProcessRuntime 读取，不写 Fact | 调整客户包 catalog、模块状态、角色池、页面投影、字段策略、流程定义证据或 runtime 发布输入后 |
| `scripts/qa/erp-field-linkage.mjs`                     | 字段联动专项测试并刷新 latest 覆盖报告                                                                            | 改字段真源、保存转换、合同金额、打印快照后                 |
| `scripts/qa/full.sh`                                   | 推送前全量检查，先执行 `fast.sh`，再补 secrets / govulncheck、前端 test / build 和服务端 `go test ./...` / `make build` | 提交前 / 推送前                                            |
| `scripts/qa/strict.sh`                                 | 严格检查，包含多甲方角色能力优先级审计、正式前端客户配置投影边界、角色菜单 / seedData 配置合同、开发入口配置合同、试用账号 RBAC 单测 / 浏览器 smoke 输入模板边界测试、真实登录 smoke 共享 URL 边界、客户导入、客户配置运行时 manifest、文档清单、模拟数据工具和阶段编号命名边界守卫 | 发版前                                                     |
| `scripts/qa/db-guard.sh`                               | 约束 schema 变更必须带 migration                                                                                  | 改数据模型后                                               |
| `scripts/qa/error-code-sync.sh`                        | 校验前后端错误码同步                                                                                              | 改错误码后                                                 |
| `scripts/qa/error-codes.sh`                            | 阻止业务代码裸写已注册错误码                                                                                      | 改接口 / 鉴权 / 前端错误处理后                             |
| `scripts/qa/shellcheck.sh`                             | 检查 shell 脚本                                                                                                   | 调整脚本后                                                 |
| `scripts/qa/shfmt.sh`                                  | 统一 shell 格式                                                                                                   | 调整脚本后                                                 |
| `scripts/qa/go-vet.sh`                                 | 执行 Go vet                                                                                                       | 改 Go 代码后                                               |
| `scripts/qa/golangci-lint.sh`                          | 执行 golangci-lint                                                                                                | 改 Go 代码后                                               |
| `scripts/qa/yamllint.sh`                               | 检查 YAML 语法与风格                                                                                              | 改 YAML 后                                                 |
| `scripts/qa/govulncheck.sh`                            | 扫描 Go 可达漏洞                                                                                                  | 推送前 / 发版前                                            |

前端浏览器级样式回归不在 `scripts/qa` 下，统一执行：

```bash
cd /Users/simon/projects/plush-toy-erp/web
pnpm style:l1
```

如需按真实管理员登录流程回归合同编辑与在线预览时延，再执行：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make run

cd /Users/simon/projects/plush-toy-erp/web
pnpm smoke:purchase-contract-real-login
pnpm smoke:processing-contract-real-login
```

## 推荐顺序

### 0. 导入冻结与 dry-run 工具 / Import freeze and dry-run tooling

customer source manifest checker 只使用 tracked manifest 和本地原始文件，校验 `docs/customers/yoyoosun/source-manifest.json` 中的 path、sha256、size、可结构化提取标记与 `docs/customers/yoyoosun/raw-source-files/` 下的原件一致；不解析 PDF/OCR，不连接数据库、不读取 server config、不调用 web runtime、不写正式表、不写 `business_records`，也不执行真实导入。

```bash
node scripts/import/customerSourceManifestCheck.mjs \
  --manifest docs/customers/yoyoosun/source-manifest.json \
  --raw-dir docs/customers/yoyoosun/raw-source-files
```

customer source extractor 只按 source manifest 中 `structuredExtract.enabled=true` 的 Excel 来源提取本地 evidence；PDF / 图片仍只是人工来源引用，不做 OCR，不从 `raw-source-files/*.xlsx` 直接 glob 作为正式主路径。

```bash
node scripts/import/customerSourceExtract.mjs \
  --manifest docs/customers/yoyoosun/source-manifest.json \
  --out output/customers/yoyoosun/source-extract
```

输出目录会生成：

```text
source-snapshot.extracted.json
existing-v1.empty-preview.json
customer-import-config.candidate.json
extraction-summary.json
extraction-report.md
```

`source-snapshot.extracted.json` 会记录本次使用的 `sourceManifest.path` 和 `sourceManifest.sha256`。`existing-v1.empty-preview.json` 只是本地空快照，方便先跑 dry-run preview；真实 sign-off 前必须替换为已 review 的 V1 / formal model existing snapshot。该提取输出仍是本地 evidence，不纳入 git，不是真实 import approval。人工收口后的 tracked 客户配置草案是 `config/customers/yoyoosun/importConfig.mjs`，它只记录统计、字段分组、review queue 和 forbidden targets，不嵌入 raw rows，也不接 runtime loader。

提取后可直接接 dry-run preview 和 freeze check：

```bash
node scripts/import/customerImportDryRun.mjs \
  --source output/customers/yoyoosun/source-extract/source-snapshot.extracted.json \
  --existing output/customers/yoyoosun/source-extract/existing-v1.empty-preview.json \
  --out output/customers/yoyoosun/source-extract/dry-run-preview \
  --format json,md

node scripts/import/customerSourceSnapshotFreezeCheck.mjs \
  --source output/customers/yoyoosun/source-extract/source-snapshot.extracted.json \
  --existing output/customers/yoyoosun/source-extract/existing-v1.empty-preview.json \
  --out output/customers/yoyoosun/source-extract/freeze-check
```

customer source snapshot freeze checker 只使用 Node.js 内置模块，不连接数据库、不读取 server config、不调用 web runtime、不写正式表、不写 `business_records`，也不执行真实导入。

```bash
node scripts/import/customerSourceSnapshotFreezeCheck.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \
  --out output/customers/yoyoosun/source-snapshot-freeze
```

输出目录会生成：

```text
freeze-metadata.json
freeze-check-summary.json
freeze-check-report.md
```

`freeze-metadata.json` 中 `noRealImport` 必须为 `true`，`canExecuteRealImport` 必须为 `false`。该脚本是 freeze evidence tooling，不是 runtime loader，不是 import approval。

永绅 yoyoosun 客户导入 dry-run 只使用 Node.js 内置模块，不连接数据库、不读取 server config、不调用 web runtime、不写正式表、不写 `business_records`。

```bash
node scripts/import/customerImportDryRun.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.sample.json \
  --out output/customers/yoyoosun/import-dry-run \
  --format json,md
```

输出目录会生成：

```text
source-references.json
normalized-rows.json
candidates.json
unresolved-queue.json
duplicates.json
conflicts.json
forbidden-auto-import.json
validation-summary.json
dry-run-report.md
```

`validation-summary.json` 中 `canExecuteRealImport` 永远为 `false`。该脚本是 import QA / preview tooling，不是 runtime loader。

real dry-run evidence 使用 freeze fixtures：

```bash
node scripts/import/customerImportDryRun.mjs \
  --source scripts/import/fixtures/customers/yoyoosun/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/customers/yoyoosun/existing-v1.freeze.sample.json \
  --out output/customers/yoyoosun/real-dry-run-evidence \
  --format json,md
```

`output/customers/yoyoosun/source-snapshot-freeze/` 和 `output/customers/yoyoosun/real-dry-run-evidence/` 是本地 evidence 输出，不纳入 git；它们仍不是 import approval。由 fixture / sample 生成的 dry-run package 只允许用于 report-only 自检，不能进入 `--execute`。

真实执行器已提供受控报告模式，默认不调用后端：

```bash
node scripts/import/customerImportExecute.mjs \
  --dry-run-package output/customers/yoyoosun/real-dry-run-evidence \
  --approval scripts/import/fixtures/customers/yoyoosun/import-approval.sample.json \
  --backup-evidence output/customers/yoyoosun/backup-evidence.txt \
  --recovery-plan output/customers/yoyoosun/import-recovery-plan.json \
  --out output/customers/yoyoosun/import-execution
```

该命令会生成 `import-execution-report.json` 和 `import-execution-report.md`，并校验 approval、backup evidence、unresolved block、forbidden auto-import、supported target 和 approval.moduleStates。approval 必须声明每个目标模块状态，只有 `enabled` 模块才会进入 JSON-RPC 操作计划，`read_only`、`disabled` 或缺失都会拒绝；联系人会按 owner type 映射到客户或供应商模块，销售订单明细映射到销售订单模块。没有 `--execute` 时不会连接数据库或后端；`scripts/import/fixtures/**` 下的 sample approval 只允许 report-only 自检，进入 `--execute` 会被脚本拒绝。

当前 yoyoosun 没有可执行客户真实数据，不使用该 loader 执行真实导入。即使未来另开数据治理评审，真实写入也只能显式开启，并且只走 JSON-RPC V1 API，不直接写表、不写 `business_records`、不生成 schema / migration，也不创建出货、库存或财务事实：

```bash
CUSTOMER_IMPORT_CONFIRM=EXECUTE_YOYOOSUN_IMPORT \
CUSTOMER_IMPORT_ADMIN_USERNAME='admin' \
CUSTOMER_IMPORT_ADMIN_PASSWORD='replace-with-password' \
  node scripts/import/customerImportExecute.mjs \
    --dry-run-package output/customers/yoyoosun/real-dry-run-evidence \
    --approval output/customers/yoyoosun/import-approval.json \
    --backup-evidence output/customers/yoyoosun/backup-evidence.txt \
    --recovery-plan output/customers/yoyoosun/import-recovery-plan.json \
    --out output/customers/yoyoosun/import-execution \
    --backend-url http://127.0.0.1:8300 \
    --execute
```

执行前必须已有客户确认、数据库备份、reviewed recovery plan 和目标环境信息；`--backend-url` / `CUSTOMER_IMPORT_BACKEND_URL` 不得包含 URL 账号密码；`--backup-evidence` 必须是结构化 key/value 文本，至少包含 `backupId`、`releaseVersion`、`databaseSnapshot`、ISO `backupTime`、正数 `databaseBackupSize`、合法 `databaseBackupHash` 和 `operator`；`--recovery-plan` 必须是 JSON，并包含 `recoveryPlanApproved=true`、owner、backup evidence、rollback target、forward-fix path、failure triggers、post-recovery verification 和脱敏声明，且 `recoveryPlan.backupEvidence` 必须等于 `backupEvidence.backupId`。不要把 fixture approval 当真实客户批准，脚本层也会拒绝路径或内容含 fixture / sample / placeholder 的 approval、dry-run report、backup evidence 或 recovery plan 进入 `--execute`。当前 yoyoosun 不满足这些条件，不能执行该真实写入命令。

试用数据入口只允许模拟数据试用。先生成报告，确认模拟数据边界：

```bash
node scripts/qa/trial-simulated-data.mjs --print-input-template

node scripts/qa/trial-simulated-data.mjs \
  --out output/customers/yoyoosun/trial-simulated-data
```

`--print-input-template` 只输出 report-only / apply simulated data 所需的 `--out`、`--backend-url`、产品 / 单位 ID、演示账号密码来源、核心 demo seed 和后续真实命令，不登录、不调用后端、不写报告、不写数据库，也不证明试用数据已经写入。

若要把模拟数据写入本地或目标试用环境，只能显式 `--apply`，并提供已有活跃产品和单位 ID。该脚本会先按稳定模拟编号查找已有记录，缺失才通过 V1 JSON-RPC 创建；它不执行真实 import，不写 `business_records`，不生成 schema / migration，也不创建出货、库存或财务事实：

如果当前环境缺少核心演示基础资料，优先使用 core demo seed。该 seed 只写 `units`、`materials`、`products`、`warehouses`、`processes`、`bom_headers` 和 `bom_items`，编码固定带 `SIM-PLUSH-CORE` 前缀；其中 `processes` 会提供 `查货 / 手工 / 车缝 / 包装` 等毛绒玩具行业默认候选，并仍允许后续按实际工厂扩展。该 seed 不写客户、供应商、联系人、销售订单、`business_records`、库存流水、生产、出货或财务事实；输出中的 `trial_sim_args` 和 `operational_fact_args` 可直接传给后续模拟脚本：

```bash
bash scripts/seed-core-demo-data.sh
```

如果只需要最小产品 / 单位前置数据，也可使用试用模拟 seed。该 seed 只写 `units` 和 `products` 两个 MasterData 表，编码固定带 `SIM-YOYOOSUN-TRIAL` 前缀，不写客户、供应商、联系人、销售订单、`business_records`、库存、出货或财务事实：

```bash
bash scripts/seed-trial-sim-masterdata.sh
```

输出中的 `unit_id` 和 `product_id` 可传给后续模拟数据脚本。

```bash
TRIAL_SIM_CONFIRM=APPLY_SIMULATED_TRIAL_DATA \
TRIAL_SIM_PASSWORD='replace-with-demo-password' \
  node scripts/qa/trial-simulated-data.mjs \
    --apply \
    --backend-url http://127.0.0.1:8300 \
    --product-id 1 \
    --unit-id 1 \
    --out output/customers/yoyoosun/trial-simulated-data
```

默认岗位账号模式会用 `demo_sales` 写客户、联系人和销售订单，用 `demo_purchase` 写供应商和供应商联系人。若目标环境提供了具备全部 V1 权限的账号，也可以改用 `TRIAL_SIM_ADMIN_TOKEN` 或 `TRIAL_SIM_ADMIN_USERNAME` / `TRIAL_SIM_ADMIN_PASSWORD`。

业务事实模拟脚本只允许模拟事实闭环验收，不执行真实客户数据导入。先生成报告，确认模拟范围：

```bash
node scripts/qa/operational-fact-simulated-closure.mjs --print-input-template

node scripts/qa/operational-fact-simulated-closure.mjs \
  --product-id 1 \
  --unit-id 1 \
  --warehouse-id 1 \
  --out output/customers/yoyoosun/operational-fact-simulated-closure
```

`--print-input-template` 只输出 report-only / apply simulated operational facts 所需的产品、单位、仓库 ID、演示账号密码来源、核心 demo seed 和后续真实命令，不登录、不调用后端、不写报告、不写数据库，也不证明业务事实模拟闭环已写入。

若要写入本地或目标试用环境，只能显式 `--apply`，并提供已有模拟产品、单位和仓库 ID。缺少这些前置 ID 时先执行 `bash scripts/seed-core-demo-data.sh`，并复用输出中的 `operational_fact_args`。该脚本使用 `demo_pmc`、`demo_purchase`、`demo_warehouse` 和 `demo_finance` 角色账号覆盖生产、库存预留、委外、出货和财务五条最小事实链；所有编号固定带 `SIM-YOYOOSUN-OPFACT` 前缀，不写真实客户数据，不执行 import，不绕过 `OperationalFactUsecase` 直接写事实表：

```bash
OPERATIONAL_FACT_SIM_CONFIRM=APPLY_SIMULATED_OPERATIONAL_FACTS \
OPERATIONAL_FACT_SIM_PASSWORD='replace-with-demo-password' \
  node scripts/qa/operational-fact-simulated-closure.mjs \
    --apply \
    --backend-url http://127.0.0.1:8300 \
    --product-id 1 \
    --unit-id 1 \
    --warehouse-id 1 \
    --run-id target-yyyymmdd-closure \
    --out output/customers/yoyoosun/operational-fact-simulated-closure-target
```

岗位任务闭环只允许模拟验收，不执行真实客户数据导入，也不写生产、出货、库存、预留或财务事实。先生成报告，确认模拟范围：

```bash
node scripts/qa/mobile-workflow-simulated-closure.mjs --print-input-template

node scripts/qa/mobile-workflow-simulated-closure.mjs \
  --out output/customers/yoyoosun/mobile-workflow-simulated-closure
```

`--print-input-template` 只输出 report-only / apply simulated mobile workflow tasks 所需的 runId、演示账号密码来源、岗位角色账号、模拟任务组和后续真实命令，不登录、不调用后端、不写报告、不写数据库、不创建 workflow 任务，也不写任何业务事实。

若要写入本地或目标试用环境，只能显式 `--apply`。该脚本使用 `demo_pmc` 创建 `SIM-YOYOOSUN-MOBILE-WORKFLOW` 模拟 workflow 任务，再用 `demo_boss`、`demo_quality` 和 `demo_warehouse` 分别处理老板审批、成品抽检、仓库入库确认、出货放行异常上报和现场留痕 evidence；它不执行真实 import，不写 `business_records`，不生成 schema / migration，也不绕过 `WorkflowUsecase` 或 operational fact usecase：

```bash
MOBILE_WORKFLOW_SIM_CONFIRM=APPLY_SIMULATED_MOBILE_WORKFLOW_TASKS \
MOBILE_WORKFLOW_SIM_PASSWORD='replace-with-demo-password' \
  node scripts/qa/mobile-workflow-simulated-closure.mjs \
    --apply \
    --backend-url http://127.0.0.1:8300 \
    --run-id target-yyyymmdd-mobile \
    --out output/customers/yoyoosun/mobile-workflow-simulated-closure-target
```

`--run-id` 会参与生成 `workflow_tasks.task_code`，当前最多 26 个安全字符，避免超过后端任务编码 64 字符上限。

ERP MVP 闭环验收入口用于把上述试用数据、业务事实、岗位任务端和前端回归串成同一份验收计划。默认只生成本地 evidence，不连接数据库、不调用后端、不写库，也不替代领域测试、浏览器回归或部署 smoke：

```bash
node scripts/qa/mvp-closure.mjs \
  --out output/customers/yoyoosun/mvp-closure
```

如需同时运行现有 no-write report-only 子工具，显式传入模拟产品、单位和仓库 ID。该模式仍不传递 `--apply`，不会写入模拟数据：

```bash
node scripts/qa/mvp-closure.mjs \
  --run-report-tools \
  --product-id 1 \
  --unit-id 1 \
  --warehouse-id 1 \
  --out output/customers/yoyoosun/mvp-closure
```

真正写入本地或目标试用环境时，仍必须分别调用 `trial-simulated-data.mjs`、`operational-fact-simulated-closure.mjs` 或 `mobile-workflow-simulated-closure.mjs` 的 `--apply` 路径，并提供对应确认环境变量。

采购入库真实写入链路验收入口用于把 MVP 第一条事实写入链路固定下来。默认运行 JSON-RPC 服务层测试，覆盖创建入库草稿、添加明细、非法明细失败、过账、查询回显、列表、看板 projection、取消冲正、重复过账 / 取消幂等和权限拒绝：

```bash
node scripts/qa/purchase-receipt-real-write-e2e.mjs --print-input-template
node scripts/qa/purchase-receipt-real-write-e2e.mjs \
  --preflight-report output/qa/purchase-receipt-real-write-e2e/preflight.json
node scripts/qa/purchase-receipt-real-write-e2e.mjs \
  --out output/qa/purchase-receipt-real-write-e2e
```

`--print-input-template` 只输出 `--out`、`--with-postgres`、本地 PostgreSQL 测试库边界和后续真实命令，不运行 Go test、不调用 `make`、不连接 PostgreSQL、不写报告、不写数据库。

`--preflight-report` 只写本地脱敏 JSON 前置报告，确认 Go 命令、服务层测试锚点、PostgreSQL guard 脚本和 Make target 是否存在；请求 `--with-postgres` 时还会用 `pg_isready` 对脱敏后的本地 host / port 做无凭据可达性检查。本模式不运行 Go test、不调用 `make`、不使用凭据连接 PostgreSQL、不保存 `PURCHASE_RECEIPT_PG_DB_URL` 值、不写业务报告、不写数据库，也不证明采购入库事实链已通过。

如需追加本地 PostgreSQL 防呆测试，先确认本地测试库连接配置命中隔离测试库，再显式开启：

```bash
node scripts/qa/purchase-receipt-real-write-e2e.mjs \
  --with-postgres \
  --out output/qa/purchase-receipt-real-write-e2e
```

该入口只运行测试隔离库 / 本地 PostgreSQL 防呆测试，不连接生产或目标环境，不执行真实客户导入，也不把 Workflow task done 当成采购入库过账。

行业模板候选只允许模拟闭环验收，不执行真实客户数据导入，不写业务表，不把单客户样本直接升成行业默认。先运行边界守卫：

```bash
node scripts/qa/industry-template-boundaries.mjs
```

再生成本地 evidence 报告：

```bash
node scripts/qa/industry-template-closure.mjs \
  --out output/customers/yoyoosun/industry-template-closure
```

多客户私有化复制包只允许模拟闭环验收，不创建真实客户目录，不执行真实客户数据导入，不复制核心 schema / migration / usecase / RBAC，也不在目标服务器构建。先运行边界守卫：

```bash
node scripts/qa/private-deployment-boundaries.mjs
```

如果调整了 `deployments/yoyoosun` 部署资料包，还要运行资料包 lint：

```bash
node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun
node --test scripts/deploy/deployment-package-lint.test.mjs
```

再生成本地 evidence 报告：

```bash
node scripts/qa/private-deployment-package-closure.mjs \
  --out output/customers/yoyoosun/private-deployment-package-closure
```

`SIM-PRIVATE-DEPLOYMENT` 只是模拟 customer key，不得创建为正式 `docs/customers/`、`config/customers/` 或 `deployments/` 目录。真实新增客户前必须先确认稳定 customer key、客户资料入仓边界、导入 dry-run / unresolved queue、部署地址、备份恢复和验收清单。

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

角色演示账号只服务开发 / 验收登录测试，不写入 `server/configs/*/config.yaml`，也不是客户配置包。脚本会先确保内置 RBAC 权限和角色已 seed，再创建或更新以下账号并绑定真实角色：

| 账号              | 角色         |
| ----------------- | ------------ |
| `demo_boss`       | `boss`       |
| `demo_sales`      | `sales`      |
| `demo_purchase`   | `purchase`   |
| `demo_production` | `production` |
| `demo_warehouse`  | `warehouse`  |
| `demo_quality`    | `quality`    |
| `demo_finance`    | `finance`    |
| `demo_pmc`        | `pmc`        |
| `demo_engineering` | `engineering` |
| `demo_admin`      | `admin`      |

默认不生成 `debug_operator` 账号；如确需调试权限账号，必须显式加 `--include-debug`，此时会额外生成 `demo_debug`。

```bash
ERP_ROLE_DEMO_PASSWORD='replace-with-local-demo-password' \
  bash /Users/simon/projects/plush-toy-erp/scripts/seed-role-demo-admins.sh
```

已有账号重跑时会恢复 `disabled=false`、`is_super_admin=false` 和对应单一角色绑定；默认不重置已有账号密码。如需统一重置演示账号密码：

```bash
ERP_ROLE_DEMO_PASSWORD='replace-with-local-demo-password' \
  bash /Users/simon/projects/plush-toy-erp/scripts/seed-role-demo-admins.sh --reset-password
```

脚本默认拒绝 `configs/prod` 或 `APP_ENV / ERP_ENV / GO_ENV=prod|production`，除非显式传 `--allow-prod`。常规开发和验收不要对生产库执行该脚本。

生成或重置演示账号后，可执行只读核对。该脚本不创建账号、不改密码、不写数据库，只通过真实 `/rpc/auth` 登录和 `me` 返回校验角色、`mobile.<role>.access`、`debug.*` 权限、`is_super_admin` 和 `disabled` 边界：

如果还没有本地演示账号密码，先打印输入模板。该模式只输出所需环境变量、账号清单、可选脱敏报告路径和真实核对命令，不读密码、不登录、不调用后端、不启动浏览器、不启动 Vite、不读取客户配置脚本、不写报告、不写数据库：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/qa/trial-account-rbac.mjs --print-input-template
node /Users/simon/projects/plush-toy-erp/web/scripts/trialDemoAccountBrowserSmoke.mjs --print-input-template
```

试用账号 RBAC 也可先写前置检查报告。该模式只探测后端健康检查、演示账号密码环境变量是否存在，并静态核对 Go seed、后端 RBAC mobile 权限、前端移动角色入口、浏览器 smoke 账号和文档入口里的试用角色投影是否一致；不读密码、不登录、不调用 `admin_login / me`，不写数据库，也不保存 access token 或 Authorization header：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/qa/trial-account-rbac.mjs \
  --preflight-report output/trial-account-rbac/preflight.json
```

浏览器 smoke 还可先写前置检查报告。该模式只探测后端健康检查、演示账号密码环境变量是否存在、是否需要脚本托管 Vite、yoyoosun customer config 脚本是否存在，并静态输出桌面账号菜单应见 / 禁见、客户隐藏菜单、旧入口清理、岗位任务端路径和 `demo_admin` 移动端拒绝态的菜单投影覆盖计划；不读密码、不登录、不调用 JSON-RPC、不启动浏览器、不启动 Vite、不读取客户配置脚本、不创建任务、不写数据库，也不保存 access token 或 Authorization header：

```bash
node /Users/simon/projects/plush-toy-erp/web/scripts/trialDemoAccountBrowserSmoke.mjs \
  --preflight-report output/trial-demo-account-browser-smoke/preflight.json
```

真实登录 smoke 共享前置也可先打印输入模板，或写 no-write shared preflight 报告。模板只输出后端健康检查 URL、前端 URL、管理员凭据来源和具体 smoke 命令，不读取配置、不校验凭据、不调用后端、不启动浏览器、不登录、不写数据库；shared preflight 只探测后端 health 和管理员凭据来源候选，不读取 config 内容、不读取密码值、不校验账号、不调用 auth JSON-RPC、不启动 Vite / Playwright、不登录、不写数据库，也不保存密码、token 或 Authorization header。采购入库真实写入浏览器 e2e 还可以打印自己的持久化测试数据输入模板：

```bash
node /Users/simon/projects/plush-toy-erp/web/scripts/realLoginSmokeShared.mjs --print-input-template
node /Users/simon/projects/plush-toy-erp/web/scripts/realLoginSmokeShared.mjs \
  --preflight-report output/real-login-smoke-shared/preflight.json
node /Users/simon/projects/plush-toy-erp/web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template
node /Users/simon/projects/plush-toy-erp/web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs \
  --preflight-report output/purchase-receipt-real-write-browser-e2e/preflight.json
```

`purchaseReceiptRealWriteBrowserE2E.mjs --print-input-template` 只输出采购入库页面真实写入 e2e 所需输入、持久测试数据确认、`PR-BROWSER-*` 记录边界和后续真实命令，不读取本地配置、不校验凭据、不调用后端、不启动 Vite、不启动 Playwright、不登录、不写数据库；`--preflight-report` 只写本地前置报告，探测后端 health、显式管理员凭据 env、持久测试数据确认和页面目标安全性，不读取本地配置、不登录、不调用 JSON-RPC、不启动 Vite / Playwright、不写数据库。真正运行 `pnpm smoke:purchase-receipt-real-write` 会写本地 / 开发库模拟采购入库事实，只能按脚本显式参数和 README 边界执行。

```bash
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  node /Users/simon/projects/plush-toy-erp/scripts/qa/trial-account-rbac.mjs
```

如需留下本地可审计证据，可写入脱敏报告。报告只包含后端 endpoint alias、账号名、角色、岗位权限、debug 权限数量、super admin / disabled 布尔结果和汇总，不保存密码、access token 或 Authorization header：

```bash
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  node /Users/simon/projects/plush-toy-erp/scripts/qa/trial-account-rbac.mjs \
    --report output/trial-account-rbac/report.json
```

如需核对其他后端地址：

```bash
TRIAL_ACCOUNT_BACKEND_URL='http://127.0.0.1:8300' \
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  node /Users/simon/projects/plush-toy-erp/scripts/qa/trial-account-rbac.mjs
```

需要用真实浏览器核对桌面菜单、岗位任务端和无岗位权限拒绝态时，先确认后端已启动，再执行：

```bash
TRIAL_ACCOUNT_PASSWORD='replace-with-local-demo-password' \
  pnpm --dir /Users/simon/projects/plush-toy-erp/web smoke:trial-demo-browser
```

该浏览器回归会自动启动单端口桌面 Vite，并使用 yoyoosun 菜单配置；它会同时检查各角色应看见的桌面菜单和不应看见的菜单，例如非 admin 不应看到权限管理，`demo_admin` 不应看到业务主入口。如需核对已启动前端地址，可设置 `TRIAL_BROWSER_SMOKE_BASE_URL`。

如只核对岗位任务端登录后回跳和生产单端口路由，执行：

如果只想先核对该 smoke 的输入、岗位角色、phone / iPad 视口和执行边界，先打印输入模板。该模式不启动 Vite、不启动浏览器、不调用真实后端、不登录、不写数据库：

```bash
node /Users/simon/projects/plush-toy-erp/web/scripts/mobileAuthLoginRouteSmoke.mjs --print-input-template
```

如需在不启动 Vite / Playwright、不调用后端和不登录的情况下，先写一份本地前置报告核对岗位路由计划、phone / iPad 视口和 mock 覆盖口径：

```bash
node /Users/simon/projects/plush-toy-erp/web/scripts/mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json
```

```bash
pnpm --dir /Users/simon/projects/plush-toy-erp/web smoke:mobile-auth-login-route
```

该回归默认验证 `/m/<role>/tasks`，与当前生产 `web-desktop` 单容器主路径一致，使用 mock auth / workflow RPC 覆盖未登录拦截、登录回跳、通知 / 预警展示和 phone / iPad 布局；preflight 只写本地 JSON，不证明真实后端 RBAC、customer config active revision 或真实账号可用。旧的 `mobile-*` 多实例 `/tasks` 路径仅用于本地兼容调试，需要显式设置 `MOBILE_AUTH_SMOKE_LEGACY_MULTI_APP=1`。

如需核对真实后端模拟任务在岗位任务端详情页可见，并可提交阻塞、退回、完成和跨角色催办动作，先确认本地后端和试用账号可用，再执行：

如果还没有本地演示账号密码或后端地址，先打印输入模板。该模式只输出所需环境变量、模拟任务计划和真实回归命令，不登录、不调用后端、不启动浏览器、不写数据库：

```bash
node /Users/simon/projects/plush-toy-erp/web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --print-input-template
```

本地前置看起来齐全但还不确定能否跑真实浏览器 smoke 时，先写 no-write preflight 报告。该报告只探测 backend health、演示密码 env 是否存在、是否需要脚本托管 Vite、试用 customer-config 脚本是否存在，并记录模拟任务动作计划 coverage：老板阻塞、老板完成、老板退回、跨角色催办、reason 必填、完成反馈、异常上报、evidence refs 和内部 `notification_type` 线索；不读取密码值、不登录、不调用 JSON-RPC、不启动 Vite / Playwright、不创建 workflow 任务、不写数据库，也不保存 token 或 Authorization header：

```bash
node /Users/simon/projects/plush-toy-erp/web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs \
  --preflight-report output/mobile-workflow-runtime-browser-smoke/preflight.json
```

```bash
MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='replace-with-local-demo-password' \
  pnpm --dir /Users/simon/projects/plush-toy-erp/web smoke:mobile-workflow-runtime-browser
```

该回归会通过 JSON-RPC 创建唯一的 `simulated_only` 老板审批任务、老板退回任务、老板完成任务和仓库放行任务，并为任务 payload 保留 `notification_type` 内部提醒线索；再用真实浏览器登录 `demo_boss`，在 `/m/boss/tasks` 打开详情、填写现场留痕、提交自有任务阻塞原因、退回原因，点击自有任务完成并在已办列表看到完成反馈，再验证 `owner_role_key=warehouse` 且 `assignee_id=demo_boss` 的跨角色任务只能催办、不能代办阻塞 / 完成，页面会显示催办反馈、催办原因和 evidence refs。它只写本地/试用模拟 workflow 证据，不导入真实客户数据，也不写库存、采购、质检或财务事实。

### 2B. Customer Config 草案边界检查

调整 yoyoosun 字段显示、编号规则或其他 customer config 草案后，执行：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-config-boundaries.mjs
```

该脚本只读取 `config/customers/yoyoosun/fieldNumberingConfig.mjs`、`config/customers/yoyoosun/importConfig.mjs` 和前端客户配置 loader 源码，验证草案仍为 draft，`runtimeEnabled=false`，且不放开 tenant、schema、migration、后端 RBAC、Workflow / Fact、真实导入或默认产品前端静态打包客户配置边界。脚本不连接数据库、不调用后端、不写配置。

调整客户配置包目录、schema、catalog、流程预览、业务流转、状态机或策略预览后，执行：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-package-lint.mjs --customer demo
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-package-lint.mjs --customer demo --mode compile
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-package-lint.mjs --customer yoyoosun
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode compile
```

如需生成人工 review 用的本地预览：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode preview --out output/customers/yoyoosun/customer-package-preview.json
```

该脚本只读取 `config/catalog/customerPackageCatalog.mjs`、`config/schemas/customerPackageSchema.mjs` 和受控 `config/customers/<customer>/customerPackage.mjs`，当前登记 `demo` 与 `yoyoosun` 两个包；其中 `demo` 只证明配置包编译不是单客户硬编码，`yoyoosun` 承接永绅资料边界。脚本验证客户包仍为 `runtimeEnabled=false`、`previewOnly=true`，且不 publish、不 activate、不 rollback、不写 DB、不改 RBAC、schema、migration、Workflow / Fact。`activate` / `rollback` 模式当前会直接失败；`--out` 只能在 `--mode preview` 下写入 `output/`，报告不纳入 git。

从已跟踪客户包生成后端 `customer_config.validate_customer_config / publish_customer_config` 可接收的 runtime manifest 时，执行：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-config-runtime-manifest.mjs --customer demo
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-config-runtime-manifest.mjs --customer demo --mode compile
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile
```

如需生成人工 review 用的本地 manifest JSON：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode preview --out output/customers/yoyoosun/customer-config-runtime-manifest.json
```

该脚本不读取 raw 客户文件、不上传文件、不调用后端、不 activate、不 rollback、不导入业务数据，也不写 Workflow / Fact runtime；它只把 tracked catalog / schema / package 编译为受控 JSON-RPC payload 形状，锁住 `purchase -> purchasing` 等后端角色 key 映射、模块状态、页面投影、字段策略、授权和责任池输入。客户包可选 `moduleStates` 只允许 catalog 内模块和 `enabled / read_only / disabled`，非 `enabled` 必须写 reason；编译器会把它转成后端 `module_states`，但不提供运行时安装 / 卸载模块，也不证明完整模块关闭已 ready。`demo` manifest 的 entitlement `scope_value` 必须保持 `demo`，不能串到 `yoyoosun`；`yoyoosun` manifest 仍用于永绅受控发布链路。`demo` 包可以通过受控 `workPoolRoleOverrides` 证明同一 runtime 责任池在不同客户配置中映射给不同角色，例如 `order_review -> sales`，而 yoyoosun 仍保持 `order_review -> pmc`；流程定义仍引用同一个 `owner_pool_key`，差异只落在编译后的 `work_pool_memberships`，不 fork 核心代码、不复制流程、不扩大后端 RBAC。页面投影必须来自已登记正式菜单 key，manifest 编译器和后端 `validate_customer_config / publish_customer_config` 都会拒绝缺失、空列表或未知 page key 的 `compiled_snapshot.pages`，`get_effective_session` 对旧 revision 缺 pages 或无有效 pages 不回退 RBAC 全量页面。字段策略只发布当前前端已消费的 `customers.default`、`suppliers.default` 和 `sales_orders.default`；`sales_order_items` 的产品 / 款式 / 颜色尺码候选仍是导入 / 客户评审草案，不进入 active field policy。后端 `validate_customer_config / publish_customer_config` 也会拒绝未登记 surface / field key，`get_effective_session` 会过滤旧 revision 中的非法字段策略。

客户配置 revision 进入 release evidence 前，先生成 manifest fingerprint evidence：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-manifest-evidence.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --reviewer <reviewer-name>
```

如果已经生成 `customer-config-release-report.json`，可以追加交叉校验，确保 report 里的 `manifestSha256` 与当前 manifest 一致：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-manifest-evidence.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --reviewer <reviewer-name>
```

该生成器只向已存在的 release evidence 目录写入脱敏 `customer-config-manifest-evidence.json`，不创建发布目录、不上传 raw 客户文件、不调用后端、不执行 migration、不导入业务数据。

客户配置 revision 准备激活前，先用 runtime manifest 叠加本次发布 evidence 做门禁：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-activation-gate.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --json
```

该 gate 会复核 manifest 是否仍是受控客户配置 payload、客户 key / revision 是否匹配，并复用 release evidence gate 确认 production preflight、带恢复目标 / 命令摘要 / 备份 hash / 无 pending migration 的备份恢复、migration、非空且全通过 smoke、rollback / forward-fix plan、rollback rehearsal report 和 sign-off 证据已填齐。release evidence 目录必须额外包含 `customer-config-manifest-evidence.json`，把 `revision`、`manifestSha256` 和脱敏审查状态绑定到当前 manifest。需要机器读取时使用 `--json`：成功输出 `ok=true` 和 `scope.evidenceOnly`，失败输出 `ok=false`、错误列表和 `releaseEvidenceStatus.closeoutSummary / closeoutNextActions`，可继续按证据组补齐 release evidence。它不调用后端、不 activate、不 rollback、不执行 migration、不导入业务数据，也不替代真实目标环境发布。

发布前声明“证据就绪”时，使用聚合 readiness gate，把 runtime manifest、manifest evidence、release evidence 和 activation gate 汇总为一条可复跑检查：

还没有 manifest、release evidence 或执行器报告时，先打印 readiness 输入模板。该模式只输出发布前 / 执行后 / 激活后 / 回滚后的证据要求，不读取 manifest、不检查 release evidence、不调用后端、不写数据库，也不证明 active revision 已读回：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-release-readiness.mjs --print-input-template
```

需要在不调用目标后端、不读取 token 的前提下留下 active revision 读回缺口报告时，可写 no-write preflight 报告。该报告只读取本地 manifest、执行器报告和目标 smoke 脱敏报告的结构，汇总 `effectiveSessionVerification`、`customer-config-effective-session`、revision、backend endpoint alias 和 `responseBodyStored=false` 是否匹配；若执行器报告或目标 smoke report 的 `backendEndpointAlias` 带 URL 账号密码，preflight 只写脱敏 alias 并记录 blocker；不调用后端、不读取管理员 token、不写 release evidence、不导入业务数据、不证明 active revision 已读回：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/qa/customer-config-runtime-manifest.mjs \
  --customer yoyoosun \
  --mode preview \
  --out output/customers/yoyoosun/customer-config-runtime-manifest.json

node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-release-readiness.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json \
  --readback-preflight-report output/customers/yoyoosun/customer-config-readback-preflight.json
```

```bash
node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-release-readiness.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>
```

如果已经生成执行器报告，追加 `--release-report`，确保 report 中的 `manifestSha256`、revision、客户 key、evidence dir 和无 raw upload / 无直写 DB 等声明仍与当前证据匹配：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-release-readiness.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
  --release-report output/customers/yoyoosun/customer-config-release/customer-config-release-report.json
```

执行后声明 publish 已完成时追加 `--require-executed`；声明 active revision 已生效时追加 `--require-activated`；声明受控 revision rollback 已完成时追加 `--require-rollback`。`--require-activated` 和 `--require-rollback` 会同时要求两类证据：执行器报告中包含 `get_effective_session` 读回投影验证，确认 active revision、非空页面投影和字段策略 surface 与 manifest 对齐；release evidence 的 `smoke-test-report.json` 包含目标环境 `customer-config-effective-session` 检查，且 `expectedRevision` 等于当前 manifest revision、`target=jsonrpc:customer_config.get_effective_session`、`responseBodyStored=false`。执行器报告的 `backendEndpointAlias` 还必须与目标 smoke report 的 `backendEndpointAlias` 一致，避免用本地执行报告拼接目标环境 smoke。该 readiness gate 只聚合证据，不调用后端、不执行 migration、不恢复备份、不导入业务数据，也不能替代目标环境真实发布、恢复演练和 smoke；需要机器读取时使用 `--json`，成功输出会包含 `ok=true`、`scope.evidenceOnly`、`readyMeaning` 和 `notProvenByThisGate`，失败输出会包含 `ok=false`、错误列表和 `releaseEvidenceStatus`，其中可读取 `closeoutSummary` / `closeoutNextActions` 继续补证据。目标环境发布后如果本次包含客户配置激活，`deployments/yoyoosun/scripts/run-smoke.sh` 还应追加 `--customer-config-revision <revision> --admin-token-env <token-env>`，用目标后端 `customer_config.get_effective_session` 再读回 active revision 投影；报告只保存检查目标、期望 revision、token 来源 env 名和 `responseBodyStored=false`，不保存 token 或响应正文；执行器报告的 `backendEndpointAlias`、目标 smoke report 的 `backendEndpointAlias`、`--endpoint` / `--backend-url` 和写入 smoke report 的 endpoint alias / check target 均不得包含 URL 账号密码。

发布或激活受控 revision 时，使用默认 report-only 的执行器先生成计划；报告会输出 `manifestSha256`，应写入本次 `customer-config-manifest-evidence.json`：

还没有 manifest、evidence、目标后端或管理员凭据时，先打印输入模板。该模式只输出所需输入、确认短语和后续命令，不读取 manifest、不检查 release evidence、不调用后端、不写数据库，也不证明 active revision 已读回：

```bash
node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-release-execute.mjs --print-input-template
```

```bash
node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-release-execute.mjs \
  --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
  --out output/customers/yoyoosun/customer-config-release
```

确认计划、管理员 token 和目标后端后，才允许显式执行 publish：

```bash
CUSTOMER_CONFIG_CONFIRM=PUBLISH_YOYOOSUN_CONFIG \
CUSTOMER_CONFIG_ADMIN_TOKEN='<admin-token>' \
  node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-release-execute.mjs \
    --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
    --out output/customers/yoyoosun/customer-config-release \
    --backend-url http://127.0.0.1:8300 \
    --execute
```

激活同一 revision 还必须带 release evidence 并使用更强确认短语：

```bash
CUSTOMER_CONFIG_CONFIRM=ACTIVATE_YOYOOSUN_CONFIG \
CUSTOMER_CONFIG_ADMIN_TOKEN='<admin-token>' \
  node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-release-execute.mjs \
    --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
    --out output/customers/yoyoosun/customer-config-release \
    --backend-url http://127.0.0.1:8300 \
    --execute \
    --activate
```

如果 publish 已成功、只需要补跑或重试激活，使用 `--activate-only`，避免再次 publish 已发布 / 已激活 revision：

```bash
CUSTOMER_CONFIG_CONFIRM=ACTIVATE_YOYOOSUN_CONFIG \
CUSTOMER_CONFIG_ADMIN_TOKEN='<admin-token>' \
  node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-release-execute.mjs \
    --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
    --out output/customers/yoyoosun/customer-config-release \
    --backend-url http://127.0.0.1:8300 \
    --execute \
    --activate-only
```

如果需要把 active customer config 回滚到当前 manifest 指向的已发布 revision，使用单独的 `--rollback` 模式。回滚仍必须带 release evidence、管理员 token、目标后端和专用确认短语；它只调用 `rollback_customer_config(target_revision=manifest.revision)`，不执行 raw 包回滚、真实导入失败恢复、备份恢复或生产回滚演练：

```bash
CUSTOMER_CONFIG_CONFIRM=ROLLBACK_YOYOOSUN_CONFIG \
CUSTOMER_CONFIG_ADMIN_TOKEN='<admin-token>' \
  node /Users/simon/projects/plush-toy-erp/scripts/deploy/customer-config-release-execute.mjs \
    --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json \
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
    --out output/customers/yoyoosun/customer-config-release \
    --backend-url http://127.0.0.1:8300 \
    --execute \
    --rollback
```

该执行器只调用已有 `customer_config` JSON-RPC usecase，不上传 raw 客户文件、不直写数据库、不生成 migration、不导入业务数据、不写 Workflow / Fact runtime；没有 `--execute` 时不会访问后端。执行器会拒绝带账号密码的 `--backend-url`，并在 `customer-config-release-report.json` 写入脱敏 `backendEndpointAlias`；`--execute --activate`、`--execute --activate-only` 或 `--execute --rollback` 成功后会继续调用 `get_effective_session`，写入 `effectiveSessionVerification`，用于后续 readiness gate 判断“active revision 已能被正式前端投影消费”。

### 2C. Core 产品规则层边界检查

调整 `server/internal/core` 后，执行：

```bash
node --test /Users/simon/projects/plush-toy-erp/scripts/qa/core-boundary.test.mjs
```

该测试只扫描 `server/internal/core` 源码和 README，确认 core 仍只作为纯产品规则层，不 import `internal/biz`、`internal/data`、`internal/service`、Ent、SQL、HTTP、Kratos transport、配置或文件系统相关依赖。它不连接数据库、不调用后端、不读取客户配置。

调整 Workflow usecase、repo 或 JSON-RPC 后，执行：

```bash
node --test /Users/simon/projects/plush-toy-erp/scripts/qa/workflow-fact-boundary.test.mjs
```

该测试只扫描 Workflow runtime 源码，确认 `update_task_status`、`complete_task_action`、`block_task_action` 和 `reject_task_action` 链路不会直接引用 Operational Fact、库存、出货或财务事实写入口。Workflow 可以写协同状态和派生协同任务；真实库存、出货和财务事实必须从对应领域 usecase 显式入口执行。

如本轮触达任务动作合同、reason、事件 / actor role、payload 或岗位任务端后端读回，再补跑：

```bash
cd /Users/simon/projects/plush-toy-erp/server
go test ./internal/data -run 'TestWorkflowRepo_(TaskStatusReasonEventAndCompletionCleanup|CreateAndUpdateTaskStatus|UrgeWorkflowTaskWritesEventAndPayload)'
go test ./internal/service -run 'TestJsonrpcDispatcher_WorkflowUrgeTask|TestJsonrpcDispatcher_Workflow(CompleteTaskAction|ControlledTaskActions)'
```

这组命令只验证本地后端 Workflow action 合同，不连接真实客户环境，不执行真实导入，也不把 Workflow task done 解释为 Fact 过账。

调整正式前端任务动作入口后，执行：

```bash
node --test \
  /Users/simon/projects/plush-toy-erp/web/src/erp/utils/workflowTaskActionAccess.test.mjs \
  /Users/simon/projects/plush-toy-erp/scripts/qa/workflow-ui-action-boundary.test.mjs
```

这组测试覆盖前端 Workflow action access helper 和正式运行时代码：`workflowTaskActionAccess.test.mjs` 锁住后端 explain 优先、本地 fallback、失败态禁用动作和 stale / abort request 处理；`workflow-ui-action-boundary.test.mjs` 扫描 `web/src/erp` 正式运行时代码，确认页面、组件、hook 和工具不直接调用 `createWorkflowTask`、`updateWorkflowTaskStatus`、`upsertWorkflowBusinessState` 或对应 raw JSON-RPC 方法。`web/src/erp/api/workflowApi.mjs` 仍可保留兼容 wrapper，mock、style:l1 场景和测试代码不作为正式 UI 主路径。

调整客户配置运行时投影、正式菜单、字段策略或业务页面动作权限后，执行：

```bash
node --test /Users/simon/projects/plush-toy-erp/scripts/qa/formal-frontend-customer-config-boundary.test.mjs
```

该测试扫描 `web/src/erp` 正式运行时代码，确认业务页面、layout、组件和工具不直接 import `config/customers/<customer-key>` raw 客户包；raw 客户包只允许 dev-only 客户配置预检页和 QA 脚本读取。正式前端必须通过 `customer_config.get_effective_session` 投影页面、动作和字段策略，再与 RBAC 菜单和权限取交集；测试同时锁住 `ERPLayout`、`adminProfileSync`、`hasActionPermission`、客户 / 供应商 / 销售订单列过滤仍接在这条投影链路上。

若改动影响正式菜单重定向、空页面清单拦截或 ERP shell 渲染，先跑 helper / 静态边界测试证明正式收窄，再跑本地浏览器级诊断回归：

```bash
node --test /Users/simon/projects/plush-toy-erp/web/src/erp/utils/adminProfileSync.test.mjs
node --test /Users/simon/projects/plush-toy-erp/scripts/qa/formal-frontend-customer-config-boundary.test.mjs

cd /Users/simon/projects/plush-toy-erp/web
STYLE_L1_SCENARIOS=erp-effective-session-super-admin-product-core,erp-effective-session-direct-url-local-dev-diagnostic,erp-effective-session-sync-failure-local-dev-diagnostic,erp-effective-session-empty-pages-local-dev-diagnostic,erp-no-visible-menu-blocks-outlet,erp-effective-session-action-projection-business-pages pnpm style:l1
```

`adminProfileSync` 测试负责证明正式普通账号按 RBAC 菜单与 active revision 页面清单交集收窄，隐藏 URL 需要跳转，active revision 空页面清单不回退 RBAC-only，以及模块 disabled 后端投影隐藏业务页时正式账号需要跳转。`style:l1` 运行在前端 DEV 构建态，只证明本地开发诊断、super admin 产品核心看全、sync failure 诊断、无可见菜单空态，以及普通账号页面可见但 `effective_session.actions=[]` 时出货 / 质检 / 采购入库写按钮禁用的真实页面渲染；不要把本地 DEV 诊断场景当成正式客户放开证据，也不要把前端 helper 跳转或按钮禁用当成后端 RBAC / usecase 授权边界。

按 `docs/product/多甲方角色能力流程编排优先级.md` 继续实现或收口前，执行：

```bash
node --test /Users/simon/projects/plush-toy-erp/scripts/qa/multi-client-role-workflow-priority-audit.test.mjs
```

该测试只读审计优先级文档的可执行证据，确认 Workflow action 合同、任务责任池、engineering 最小入口、客户配置 schema / migration、usecase / repo / JSON-RPC / RBAC / 审计测试、正式前端 `get_effective_session` 投影、客户配置 `sales_order_acceptance` 受控 `runtime_loader_ready` 流程定义和后端 `ProcessInstanceCreate` 构造 helper、Workflow / Fact guarded 边界、release evidence target 盲区和 production preflight fast / strict 门禁仍与当前仓库一致；它不调用后端、不执行 migration、不发布客户配置、不导入真实数据、不自动启动 ProcessInstance、不跑目标环境 smoke，也不把领域事实过账或目标环境发布证据伪造成完成。需要机器读取时可执行脚本本体并追加 `--json`，输出中的 `scope.readOnly`、`scope.executableEvidenceOnly`、`readyMeaning` 和 `notProvenByThisAudit` 会明确 audit 只证明当前仓库可执行证据仍对齐，不证明目标环境发布、migration、smoke、恢复 / 回滚演练、客户配置激活 / 回滚或真实客户导入已发生；`referenceCoverage` 会把参考图里的 schema / migration、usecase / repo / API / RBAC、正式前端 effective session 投影、release preflight / 目标 evidence 四类要求映射到具体 check ids、证据路径和 release action ids，并用 `localState` / `targetState` 拆开本地代码测试证据与目标环境证据，避免只看 `10/10 passed` 就误以为目标环境证据也已完成；`completionAudit` 则把 `referenceCoverage` 和 release closeout 队列汇总为“是否可按优先级执行、是否可在本机完成、当前 blocking category / reason、哪些本地要求已 ready、哪些目标 evidence 仍缺、第一条 blocked release action（含已解析输入、完整缺失项、env 模板、gate 摘要、runner report / execute 命令）、`firstBlockedInputChecklist` 下一步输入清单、剩余前置按 env / file / manual / evidence 分组、gate error / warning 总数和第一组未验证 gate 详情”，用于回答当前是否能收口以及下一组真实证据该补什么。`releaseEvidenceProgress` 默认摘出当前 `deployments/yoyoosun/evidence/releases/2026-06-29` 的 status、ready、closeoutSummary、blockers 和 closeoutNextActions，并给出 `release-evidence-closeout-plan.mjs` 的只读执行前置检查命令、`release-evidence-closeout-runner.mjs` 的 report-only 检查命令、`priorityAuditCommands` 中的 JSON 审计 / release evidence 强门禁 / 整体闭环强门禁命令，以及 `closeoutGateSummary`、`closeoutPlanSummary` / `closeoutActionQueue`。`closeoutGateSummary` 按证据组列出 gate error / warning 数量和样例，帮助定位已经 present 但仍 unverified 的文件字段；`closeoutActionQueue` 按 release closeout 顺序列出每个证据组的 `runnable / blocked / manual` 状态、缺失 env / file / manual 前置、env 模板、人工核对项和该组 runner report-only / execute 命令；`closeoutPlanSummary.firstBlockedAction` 和 `completionAudit.firstBlockedReleaseAction` 都保留第一条 blocked action，方便终端文本和 JSON 快速定位，且 `completionAudit.firstBlockedReleaseAction` 会透出该 action 的 `resolvedInputs` 和 `missingPrerequisites`。`firstBlockedInputChecklist` 会把同一 action 的 `resolvedInputIds`、`missingInputIds`、`missingInputIdsByKind`、`missingInputEnvTemplate`、下一条 runner report / execute 命令拆成稳定 JSON 字段，方便执行者先补真实输入再重跑 report-only。`completionAudit.remainingPrerequisites` 会保留每个缺口的 `kind / id / message / actionIds`，`remainingPrerequisitesByKind` 会把缺口按 `env / file / manual / evidence` 分组，避免把本机文件、环境变量和人工签收混成同一种外部输入。execute 命令仍需要真实 env 值和 `RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT`，且只执行 closeout plan 判定可运行的机器步骤。真实发布批次应追加 `--release-evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>` 指向对应 evidence 目录；如生产 runtime env 不是默认路径，再追加 `--runtime-env-file <path>`。默认 audit 即使 release evidence 未 ready 也仍可用于优先级证据审计；作为 release evidence 强门禁时追加 `--fail-on-release-not-ready`，作为“参考实现整体闭环”强门禁时追加 `--fail-on-completion-not-ready`，此时 `completionAudit.canCompleteLocally=false` 会返回非 0，但 JSON 中仍保留 `ok=true` 表示优先级文档证据本身对齐。该字段仍来自只读 status / closeout plan / closeout runner，不执行任何目标动作，也不输出真实 env 值、token、DSN 或命令原始输出。

补充：`firstBlockedInputChecklist.nextInputTemplateCommand` 与 runner report 中的 `inputTemplateCommand` 都会保留同一条只读输入模板命令，用于先核对真实 release batch 输入；它们不是 execute 命令，也不会写 evidence。`operatorChecklist` 由 `release-evidence-closeout-plan.mjs` 统一生成，priority audit 的 `firstBlockedInputChecklist.operatorChecklist` / `closeoutActionQueue[*].operatorChecklist` 和 runner report 只透传同一份字段级清单。该清单会把同一 action 的 resolved / missing 输入拆成真实来源、证据落点、校验规则和 secret 标记，说明真实值应从 release batch、镜像构建 / registry、Atlas migration 状态、备份证据、目标 endpoint 或人工签收取得；其中 DSN、admin token 和 runtime env file 只标记为 secret 输入来源，不保存真实值。

补充：priority audit 会为每组 closeout action 生成默认脱敏报告路径 `output/release-evidence-closeout/<release>/<action-id>-runner-report.json`，并在 `closeoutRunnerReportFileCommand` / `firstBlockedInputChecklist.nextRunnerReportFileCommand` 中给出带 `--report` 的 report-only 命令。该命令不拼接待填写 env 模板，可直接落盘当前 blocked / manual / runnable 状态、缺失输入和字段级 checklist；真实 env 只出现在 `missingInputEnvTemplate` 和 execute 模板里，由执行者在后续写 evidence 或执行可运行 action 时提供。这个路径用于保存操作前审计报告，不属于 release evidence gate 的目标证据目录；只有对应 evidence 文件、目标 smoke、恢复 / 回滚演练和签收证据通过 gate 后，才算该 release action 完成。

如果只需要收集 P5 release batch 输入，不需要完整审计 JSON，可用 priority audit 的轻量输入清单模式。`--input-checklist-json` 输出机器可读 `implementationBreakdown` 和 `closeoutInputChecklist`，适合接外部收集表；前者给出 P0-P5 阶段目标、本地状态、目标证据状态、下一条只读 closeout action 和阶段执行合同（allowed paths / forbidden paths / not doing / validation commands），后者给出具体 release closeout 输入。`collectionGroups` 会按镜像 / 版本、preflight、备份恢复、目标 smoke、客户配置读回、回滚处置和签收等收集责任面聚合 action 与缺失输入。`--input-checklist-markdown` 输出人工可读表格，并包含 `Implementation Breakdown`、`Collection Groups` 分组表和 `Collection Input Details` 逐 action 明细，列出每个阶段的执行合同和每个 closeout action 的 input、source、evidence target 和 validation。`--input-checklist-csv` 输出可导入电子表格的平铺行，字段包含 `evidence_dir / runtime_env_file / release_ready / completion_state / blocking_category` 和 `phase_*` 上下文，以及 group / action / input / source / evidence target / validation，只用于外部 release batch 收集，不包含 report command、execute command、真实 DSN、token 或任何 secret 值。三种模式都只读、不写 release evidence、不输出 `executeCommand`、不包含 `--execute` 或 `RELEASE_CLOSEOUT_CONFIRM`；真实目标证据仍必须由对应 closeout action 在具备真实输入后受控执行并重新通过 release evidence gate。

调整长期维护 Markdown 后，执行：

```bash
node --test /Users/simon/projects/plush-toy-erp/scripts/qa/docs-inventory.test.mjs
```

该测试扫描 tracked 和未跟踪但未被 ignore 的 Markdown，确认仓库根文档、`docs/`、`deployments/`、`config/`、`scripts/`、`server/` 和 `web/` 下的当前维护文档都已登记到 `docs/文档清单.md`。它不判断文档内容真伪，文档当前口径仍以 `docs/当前真源与交接顺序.md`、正式产品 / 架构文档、代码和测试为准。

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

### 4. 提交前检查

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/full.sh
```

### 5. 发版前检查

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/strict.sh
```

生产发布还必须使用准备好的运行时 `.env` 执行产品级 preflight；该命令不执行 migration，只确认发布前门禁是否满足，包括 secret 占位、固定镜像 tag、SMS mock、debug seed / cleanup、PostgreSQL / 后端 HTTP / gRPC / Jaeger loopback 和低配部署边界：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/deploy/production-preflight.sh \
  --env-file /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod/.env
```

写入 release evidence 时只保存脱敏检查输出，不保存真实 `.env`：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/deploy/production-preflight.sh \
  --env-file /Users/simon/projects/plush-toy-erp/server/deploy/compose/prod/.env \
  --out /Users/simon/projects/plush-toy-erp/deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/production-preflight-report.txt
```

发布完成后可追加 `--runtime`，检查 Compose 服务和 `/healthz` / `/readyz`。
`scripts/deploy/deployment-package-lint.test.mjs` 会锁住 yoyoosun 部署资料包结构、敏感文件排除，以及 release evidence 模板必须包含 gate 需要的 `backupId`、`image-digests.txt`、preflight / backup / pre-apply migration / migration / smoke / restore / rollback evidence 文件名和 backup restore artifact 字段；同时锁住 backup evidence 模板必须包含 backup id / 时间 / release / migration version / 备份大小 / hash / 恢复与 smoke 状态，migration evidence 模板必须包含 `migrationBefore` / `migrationAfter`、`Current Version:`、`Pending Files:` 和脱敏边界，release sign-off 模板必须包含结论字段和必选确认，rollback / forward-fix plan 模板必须包含处置字段、runbook 和必选确认，smoke report example 必须保持非空 checks、必填 `endpointAlias`、可选且脱敏的 `backendEndpointAlias`、summary 数量一致、全通过状态、每项 target、URL / path 检查的 httpCode、无 URL 账号密码和脱敏声明，避免长期模板或样例落后于实际 release gate。
`scripts/deploy/run-smoke-script.test.mjs` 会用本地 fake curl 锁住 `deployments/yoyoosun/scripts/run-smoke.sh` 的 CLI、`--print-input-template` 和输出结构。输入模板只打印目标 smoke 所需 endpoint、backend URL、releaseVersion、environment、report、客户配置 revision 和 token env 名，不触网、不读取 token、不写 `smoke-test-report.json`、不证明 active revision 已读回。真实 smoke report 必须带 `releaseVersion` / `environment`、必填 endpoint alias、可选 backend endpoint alias、非空全通过 checks、URL target 的 httpCode、summary 数量一致和脱敏声明，并提前拒绝带 URL 账号密码的 `--endpoint` / `--backend-url`，避免凭据进入 endpoint alias 或 check target；当提供 `--backend-url` 时，会生成 `server-healthz` / `server-readyz` 检查；当提供 `--customer-config-revision` 时，还会锁住 `customer-config-effective-session` 检查的 `jsonrpc:customer_config.get_effective_session` target、期望 revision、token 来源 env 名和 `responseBodyStored=false`，可进入 release evidence gate 的跨文件一致性校验。
`scripts/deploy/production-preflight.test.mjs` 已接入 `fast.sh` / `strict.sh`，用于锁住合规 env 可通过、浮动镜像 tag 被拒绝、生产 Compose 不允许 `build:`、`--out` 只写脱敏检查报告且要求输出目录已存在的基础门禁；该测试不连接 Docker 或目标服务器。
`scripts/deploy/collect-evidence-script.test.mjs` 已接入 `fast.sh`，用于锁住 `collect-evidence.sh` 生成的 release evidence 草稿包含 `command-summary.txt`、`image-digests.txt` 和 `migration-status-before-apply.txt`，且 `backup-restore-report.json` 的 artifact 相对路径结构不会因为文件缺失或跳出 evidence 目录而被 release gate 拒绝；草稿内的占位字段仍必须由真实 image digest、preflight、恢复演练、smoke、rollback rehearsal 和 sign-off evidence 替换后才能通过 gate。
`scripts/deploy/release-evidence-status.test.mjs` 已接入 `fast.sh` / `strict.sh`，用于锁住 release evidence status 的缺目录、缺 artifact、草稿 evidence、closeout evidence checklist / summary / next actions、JSON 输出、`--fail-on-not-ready` 行为，以及 `scope.evidenceOnly / readyMeaning / notProvenByThisHelper` 范围声明；status 脚本只读当前 evidence 目录，状态包括 `missing / incomplete / draft / attention / ready`，其中 `attention` 表示 release evidence gate 已通过但 status 发现额外 warning，`ready=false`，`--fail-on-not-ready` 会返回非 0。closeout checklist 会按不可变版本、production preflight、备份恢复 / migration 演练、目标 smoke、回滚 / 前向修复、签收，以及需要时的客户配置 active revision 读回分组，输出 `missing / present-unverified / attention / gate-verified`；`closeoutSummary` 会同步统计总项、gate-verified 项、各类 blocker 数和 ready 布尔值，方便机器和人工直接定位目标证据缺口；`closeoutNextActions` 会为每个未 gate-verified 的证据组列出下一条命令和人工核对项，草稿 evidence 全部文件已存在但仍未通过 gate 时也会提示 image digest、production preflight、备份恢复 / migration 演练、目标 smoke、rollback / forward-fix、sign-off 和客户配置读回各自下一步；它仍只读取 evidence 文件，不执行目标动作。除 release gate 主文件外，status 也会把恢复演练支撑 artifact `migration-status-before-apply.txt` 和 `command-summary.txt` 计入缺失判断，缺少这些文件时下一步命令会指向显式 `--backup-purpose pre-migration` 的恢复演练脚本；缺少 `release-evidence.md`、`rollback-forward-fix-plan.md` 或 `release-signoff-checklist.md` 时会提示从对应模板复制草稿，但复制后仍必须人工填真实 release、environment、git commit、image digest、migration、backupId、处置计划、签收结论和勾选项。若同目录已存在 `customer-config-manifest-evidence.json` 且可读到 revision，缺少 `smoke-test-report.json`，或已有 smoke 但缺少 `customer-config-effective-session` 时，status 会输出 warning，并把 `--customer-config-revision <revision>`、`--backend-url <backend-endpoint>` 和 `--admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN` 加入 smoke next command，提醒目标环境 smoke 必须读回 `customer_config.get_effective_session`；如果该 manifest evidence 文件损坏或缺少 revision，status 会输出 warning 并提示重新运行 `customer-config-manifest-evidence.mjs`，不会静默把客户配置发布降级成普通 smoke。若 `smoke-test-report.json` 已经包含 `customer-config-effective-session`，status 还会反查同目录 manifest evidence 是否存在且 revision 与 smoke `expectedRevision` 一致；缺失或不一致时会 warning 并给出重新生成 manifest evidence 的命令，release evidence gate 本身也会拒绝缺失、不匹配或未脱敏审查通过的 `customer-config-manifest-evidence.json`。`ready` 只表示 release evidence gate 已对该目录通过、status 没有发现 warning 且 closeout checklist 已进入 gate-verified，不替代真实目标环境 preflight、恢复演练、smoke、rollback / forward-fix 演练或最终发布执行证据。
`scripts/deploy/release-evidence-closeout-plan.test.mjs` 已接入 `fast.sh`，用于锁住 `release-evidence-closeout-plan.mjs` 的 read-only scope、JSON 输出、文本 gate 摘要、`--fail-on-blocked` 行为，以及每组 closeout next action 的执行前置条件。该 plan 脚本复用 `release-evidence-status.mjs` 的 `closeoutNextActions` 和 `closeoutGateSummary`，每个 action 会同时带出 `gateSummary.errorCount / warningCount / sampleErrors / sampleWarnings` 和字段级 `operatorChecklist`，让执行者在同一队列里看到“还缺哪些执行输入”“真实值应从哪里取、写到哪里、怎么校验”和“当前 evidence 文件为什么仍未过 gate”。它只判断当前本机是否具备执行命令的输入：不可变版本需要 `RELEASE_VERSION / RELEASE_ENVIRONMENT / OPERATOR_ROLE / GIT_COMMIT / SERVER_IMAGE / SERVER_IMAGE_DIGEST / WEB_IMAGE / WEB_IMAGE_DIGEST / MIGRATION_BEFORE / MIGRATION_AFTER / BACKUP_ID`，其中 `release-evidence.md` 已有的非占位 `releaseVersion / environment / gitCommit / backupId / migrationBefore / migrationAfter / image ref / digest` 会作为后续 closeout action 的只读输入复用，环境变量只补仍缺的 release batch 字段；`immutable-version` action 会额外带出 `inputTemplateCommand`，文本输出也会显示 `input template:`，指向 `immutable-version-evidence.mjs --print-input-template`，方便先拿只读输入模板再填真实值；production preflight 需要真实 `--runtime-env-file` 存在且不是 example，备份恢复需要 `SOURCE_POSTGRES_DSN`，目标 smoke 需要 `SMOKE_ENDPOINT`，客户配置读回还需要 `SMOKE_BACKEND_URL` 和 `CUSTOMER_CONFIG_ADMIN_TOKEN`，rollback / forward-fix 需要 `ROLLBACK_TARGET_RELEASE`、`ROLLBACK_TRIGGER_SCENARIO` 和 post-smoke report。`SMOKE_ENDPOINT` / `SMOKE_BACKEND_URL` 必须是无 URL 账号密码的 http(s) 地址，否则对应 action 保持 blocked，避免凭据进入命令、alias 或 evidence。它不写 evidence、不执行 preflight、不恢复备份、不跑 migration、不调用后端、不跑 smoke、不执行 rollback / forward-fix，也不能替代人工 sign-off；CLI 文档使用 `--runtime-env-file`，避免 Node 24 把 `--env-file` 当作 Node 自身参数提前拦截。
`scripts/deploy/release-evidence-closeout-runner.test.mjs` 已接入 `fast.sh`，用于锁住 `release-evidence-closeout-runner.mjs` 的 report-only 默认行为、`--only <action-id>` 选择、`--report` 脱敏报告落盘且拒绝写入 `deployments/<customer>/evidence/**`、显式确认短语、execute 模式拒绝 blocked action、可运行 action 的实际执行路径，以及 report / 文本输出保留 action 的 `inputTemplateCommand` 和 `operatorChecklist`。不带 `--execute` 时只输出计划，不写 evidence，可报告 blocked / manual action 的缺失前置；带 `--execute` 时必须设置 `RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT`，且只 materialize closeout plan 已判定 `canRun=true` 且非人工的 action。runner JSON / report 会输出 display command、env key 名、非敏感 release batch `resolvedInputs`、只读 input template 命令、字段级 operator checklist 和 stdout / stderr 行数，不输出 `SOURCE_POSTGRES_DSN`、`CUSTOMER_CONFIG_ADMIN_TOKEN` 或命令原始输出。即使执行模式开启，runner 也不会执行 `release-signoff` 这种人工步骤，不会绕过 release evidence gate，也不会把 blocked action 当成可执行。
`scripts/deploy/image-digests-evidence.test.mjs` 已接入 `fast.sh`，用于锁住 `image-digests-evidence.mjs` 的 CLI、digest 格式、`image-digests.txt` key-value 输出和与已填 `release-evidence.md` 的 digest 一致性；该生成器只写脱敏 artifact，不构建镜像、不访问 registry、不读取 `.env`。

`scripts/deploy/immutable-version-evidence.test.mjs` 已接入 `fast.sh` 和 `strict.sh`，用于锁住 `immutable-version-evidence.mjs` 的 CLI、release batch 字段校验、Atlas migration version 格式、只更新 `release-evidence.md` 第一组基本信息字段，以及同步写入 `image-digests.txt`。该写入器只消费显式传入的 releaseVersion、environment、operatorRole、gitCommit、server / web image ref、sha256 digest、migrationBefore、migrationAfter 和 backupId；`--print-input-template` 只打印这些输入的 shell 模板和写入命令，不要求 evidence 目录存在，也不写 `release-evidence.md` 或 `image-digests.txt`。priority audit 的 `firstBlockedInputChecklist.nextInputTemplateCommand` 会指向该只读模板命令，方便从第一缺口跳到专用输入清单。它不构建镜像、不访问 registry、不读取 `.env`、不执行 migration、不跑 smoke、不恢复备份、不接触目标环境。
`scripts/deploy/backup-restore-rehearsal-script.test.mjs` 也已接入 `fast.sh` / `strict.sh`，用于锁住恢复演练脚本的 help、缺少 source DSN 时提前拒绝、目标库 DSN 默认防呆、`--backup-purpose` 必须是 pre-migration / pre-deploy / 发布前 / migration 前语义、`--evidence-dir` 必须指向已存在 release evidence 目录、恢复后会先记录 `migration-status-before-apply.txt`、执行 `atlas migrate apply`，以及 `backup-restore-report.json` 中 release evidence gate 需要的脱敏字段；提供 `--evidence-dir` 时脚本只会复制 `backup-evidence.md`、`migration-status-before-apply.txt`、`migration-status.txt`、`command-summary.txt` 和 `backup-restore-report.json`，不会复制 dump。release evidence gate 会进一步要求 `backup-restore-report.json` 里的 `artifacts.backupEvidence`、`artifacts.preMigrationStatus`、`artifacts.migrationStatus` 和 `artifacts.commandSummary` 是当前 evidence 目录内真实存在的相对路径且文件内容不含完整 DSN / secret，并会解析 pre / post migration artifact 的 `Current Version` 和 `Pending Files`，以及 command summary 的 `backupId / releaseVersion / sourceAlias / restoreTarget / steps`，避免引用外部目录、绝对路径、完整 DSN、不存在的命令摘要、不同批次或不同恢复目标的命令摘要、缺少 pg_dump / restore / atlas / smoke 步骤，或与 release migration 不一致的 artifact；该测试不启动 Docker、不执行 `pg_dump`、不恢复数据库。
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
  --customer-config-revision yoyoosun-customer-package-v1.runtime-manifest-v1 \
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

- 检查 `git`、`node`、`pnpm`、`go`
- 检查 Node 版本锁文件 `.n-node-version`、`.node-version`、`.nvmrc` 是否一致，并要求当前 Node 等于锁定版本
- 检查 `web/package.json` 的 `packageManager` 是否固定为 `pnpm@x.y.z`，并要求当前 pnpm 与之一致
- 在 `server/` 模块内检查 Go toolchain，要求当前 Go 满足 `server/go.mod` 的 `toolchain` / `go` 版本
- 检查 `gitleaks`、`shellcheck`、`golangci-lint`、`yamllint`、`shfmt`、`govulncheck`
- 检查 hooks 和关键脚本是否可执行

### `fast.sh`

- 前端：`pnpm lint && pnpm css`
- 后端：优先执行 `go test ./internal/... ./pkg/...`
- 试用账号真实 RBAC 无后端边界单测、RBAC / 浏览器 smoke 脚本语法检查、真实登录 smoke 共享 URL 边界单测；不触发真实登录
- 错误码同步、魔法数字检查和文档清单登记检查

### `full.sh`

- 包含 `fast.sh`
- 补充 secrets / govulncheck、前端 test / build 和服务端 `go test ./...` / `make build`
- 若定义了前端 `test`，会一并执行；它仍不替代浏览器里的样式 / box 模型回归

### npm registry token 边界

- 入库的 `web/.npmrc` 只保留无密钥的 pnpm 行为配置，不写 `_authToken`、`npmAuthToken`、`NPM_TOKEN` 或 `NODE_AUTH_TOKEN`。
- 本机私有 registry token 放在被 `.gitignore` 忽略的 `.npmrc.local`、`web/.npmrc.local`，或通过 shell 环境变量注入。
- `scripts/qa/secrets.sh` 在 git 仓库内扫描 diff / staged 候选文件，并始终检查候选 `.npmrc` / `.npmrc.local` / `.yarnrc.yml` 中的 npm token 明文；安装 `gitleaks` 后会继续执行通用密钥扫描。
- 源码包没有 `.git` 时，`scripts/qa/secrets.sh` 会按脚本所在目录推导项目根目录并扫描包内文件；该模式不支持 `SECRETS_STAGED_ONLY=1` 或 git diff range。

## Hook 对应关系

- `pre-commit` -> `scripts/git-hooks/pre-commit.sh`
- `pre-push` -> `scripts/git-hooks/pre-push.sh`
- `commit-msg` -> `scripts/git-hooks/commit-msg.sh`

## 版本锁定

- 根目录 `.n-node-version`、`.node-version`、`.nvmrc` 都锁定为 `24.14.0`，分别服务 `n`、通用 Node 版本管理器和 `nvm`。
- `web/package.json` 用 `packageManager: pnpm@10.13.1` 固定 pnpm 版本；建议先执行 `corepack enable`，再进入 `web/` 跑 `pnpm install`。
- `server/go.mod` 当前使用 `toolchain go1.26.4`；后端命令应在 `server/` 模块内执行，或通过 `scripts/doctor.sh` 先确认实际 toolchain。
- 建议执行：切换 Node / pnpm / Go 后先运行 `bash scripts/doctor.sh`，再运行 QA 脚本。

## `-h/--help`

上述脚本均支持 `-h/--help`，可直接在终端查看脚本说明。

示例：

```bash
bash /Users/simon/projects/plush-toy-erp/scripts/qa/strict.sh --help
```
