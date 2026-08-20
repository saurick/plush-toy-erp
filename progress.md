# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引。它是过程交接线索，不是需求、schema、migration、运行态或客户签收真源；当前事实仍须从 `docs/当前真源与交接顺序.md`、正式专题文档、代码、目标环境和绑定 exact SHA 的回执重新核对。

## 当前活跃事项

### V6 测试数据、研发工作台与双环境交付（2026-08-21 新候选检查点）

- 数据与目标检查点：Core Demo 与 Scenario V6 继续使用稳定业务编码，当前 canonical `dataVersion=2026.08.15-v6`、`runId=20260815-V6`、`semanticDigest=97c7dfca12092f91a2e6b254b05f938acaa51e27ec9a4fcf14d7adfa5b24c632`。`d5d16d3e2732e1da321da37ff39d22783cb108da` 曾完成本地门禁并部署到登记的 `customer-trial-133`，但本地长期 Scenario 续跑暴露新的历史 ProcessRuntime 幂等问题，后续源码修改已使该 SHA 的测试、制品和目标报告失去最终候选资格，只保留为可回滚历史证据。
- 根因与修复：长期销售单 `YS6-XD-001` 已存在由旧客户配置 revision 创建的 `sales_order_acceptance` 实例；runner 在当前 revision 下用同一 request id 再次启动时，被服务端正确判定为“同一幂等键内容变化”。现在新增受 `sales_order.read`、客户键、来源单据和业务引用共同约束的只读查询，页面与 Scenario runner 先读取并严格校验既有 ProcessRuntime，只在不存在时启动；旧 revision 的流程按自身快照继续办理，不放宽幂等冲突、不直接改库，也不把 Workflow 完成冒充 Fact 写入。续跑还暴露任务组件虽已从持久批次恢复 schedule anchor，随后的旧样例退休却重新使用当前计划时间；现在退休入口自身先完成同一批次 preflight 和 anchor 回绑，再校验保留批次，避免把合法历史到期时间误报为漂移。备份恢复脚本、正式帮助和发布证据建议命令同时显式携带 `--environment`，避免目标恢复回执被默认标成 `local-dev`。
- 当前验证：新候选的 Go 业务 / 服务、Scenario runner、Web API / lineage、备份恢复与 release evidence 定向合同均通过；随后由受管 PostgreSQL wrapper 完整执行 dirty-tree `full`，共 `6012 / 6012`、0 fail / 0 skip，覆盖 Web `2432`、Server `3578`、真实 PostgreSQL `2`、浏览器 `2`、安全 `2`，实际 Chromium Style L1 八场景和 `govulncheck` 同轮通过，临时数据库、容器与卷清理为零。该回执绑定未提交工作树，不能替代 clean exact SHA 的最终发布门禁。
- 后续与边界：仍须提交当前预期源代码，重启本地后端并完成 Core / Scenario 两次幂等读回；在 clean exact SHA 上只运行一轮 `prepare-push.sh --full`、独立 Full Acceptance、全部登记 Style L1 / 页面 / PDF / 真实 PostgreSQL / 角色回归和 release-grade strict，再普通 push、核对远端 SHA、生成不可变制品并重新执行 133 的备份恢复、promotion、V8 配置、Scenario V6 首次 / resume、浏览器 / PDF 和运行读回。生产、真实客户数据导入和客户人工 UAT 均不在自动化完成声明内；最终发布事实只以绑定 exact SHA、数据库、配置和当前运行态的最新回执为准。

### ProcessRuntime 状态机与来源单据强动作收口（2026-08-11）

- 完成：ProcessRuntime 已收口实例 / 节点结论、阻塞 / 恢复、路由回执与有界 reconciliation；销售、采购和委外来源单据的关闭 / 取消统一使用版本与幂等门禁，存在履约或过账事实时继续失败关闭。
- 正确性与复杂度：保留实例 / 节点双层真相、CAS、事务、幂等回执、独立恢复游标和失败关闭恢复；移除可选 runner、重复默认值及静默兼容，不引入第二套工作流、BPMN、消息队列或通用配置引擎。
- 提交 / 边界：已本地提交 `fdbbf8013054018481a8d5487ec7f4cd5dc7ea09`；隔离索引树格式、Node 契约、聚焦 Go 与 pre-commit 门禁通过。未推送、部署、连接或 apply 共享数据库，未做目标岗位 smoke 或客户 UAT。

### 生产完工报告与仓库成品入库分权（2026-08-11）

- 完成：继续复用 `production_facts`，生产岗位只登记或作废 `FINISHED_GOODS_RECEIPT / DRAFT` 完工报告，仓库岗位核对仓库、批次和数量后过账；库存只在仓库过账时增加，已入库撤销也只由仓库办理。没有新增表、第二套工作流、扫码或订单阶段。
- 权限与页面：复用 `warehouse.inbound.confirm` 作为仓库成品入库权限，并向默认仓库角色增量授予生产记录与在制进度读取权限；自定义角色保持不动。生产与仓库页面动作、帮助说明、客户角色矩阵和正式边界文档已同步为同一口径。
- 验证：原批 Go 领域、数据和 JSON-RPC 定向测试及锁定 Node `24.14.0` 的前端、客户配置、文档合同测试 `165 / 165` 通过，桌面生产 / 仓库分权和移动暗色帮助共三个 Style L1 场景通过；复杂度收敛后又通过 Go biz / service 的 11 个定向用例及其缺权限子用例、客户配置与前端合同 `90 / 90`。新增 migration 的一次性 PostgreSQL 18 populated upgrade 读回 `pending=0`；固定 Atlas `v0.38.0` 的 `atlas_check / migrate validate`、`db-guard` 和精确静态检查均通过。
- 边界 / 风险：未连接或升级共享开发库、test-133 或生产，未部署，也未代做真实岗位 UAT。本次复杂度收敛不改变用户可见行为，因此没有重复占用浏览器；既有三个 Style L1 场景仍只作为本地浏览器证据。尚未 stage、commit 或 push。

### CI/CD 效能优化与最新代码部署到 test-133（2026-08-08）

- 基线：GitHub 最近四次 CI 总耗时中位数为 `538.5s`，最近一次 `539s`，最长 quality job `501s`、主门禁 step `399s`；最近四次 Immutable Release 中位数为 `896.5s`，最近一次 `927s`，其中 strict job `542s`、publish job `362s`、镜像与制品阶段约 `264s`。当前公开 Release `2026.08.08-5 / 0e1dba7f8442e57ad59c11a3ce5541811e6c8f5d` 的 Server / Web tar 分别为 `1,029,740,032 / 235,604,992 bytes`。历史同正式 promotion 的 `1,328,210,048 bytes` 操作窗口约 `66.5s`，只作为旧口径传输下限参考；新实现改为计量实际 rsync 调用。
- 当前实现：保持 Exact-SHA、strict provenance、六项 Release 与 promotion 门禁不变；CI / strict 增加 checksum 后可复用的 gitleaks、固定 Go 工具、pnpm store 和 Playwright Chromium cache；Release 以一次 Buildx Bake 共享图并行调度 Server / Web、按 target 使用 GHA cache，并把 pnpm / APT / 固定 Chromium 置于稳定 Docker 层。Release artifact、GitHub Provider、promotion operation 与 DEV-only 版本中心贯通构建命中、归档大小、digest、实际传输耗时 / 速率、观测关键路径、版本和失败原因。
- 数据库边界：本轮基线 inventory 只发现长期 `plush_erp`；先前 disposable `plush_erp_ci_populated_6974_17055` 已按 archive / restore / drop 流程清理并读回零残留。后续 cold / hot 与本地 release rehearsal 继续复用统一隔离 lifecycle，临时库必须绑定 run ID 并在成功或失败后精确清理，不触碰长期库、133 逻辑库、当前版本或回滚数据代。
- 当前状态：代码和合同测试正在当前 writer 范围内收口，尚未 stage、commit、push、生成新 immutable Release 或修改 133。当前 133 只读预检仍通过，但运行 Server / Web SHA 均为旧远端 `0e1dba7f8442e57ad59c11a3ce5541811e6c8f5d`；只有完成本地 cold + 三次 hot + 同 SHA 幂等演练、独立取得 Git 授权、正式 CI / Release、promotion、真实浏览器、新旧版本回滚 / 前滚和临时库零残留后才能改写为完成。

### 夜间发布门禁与 test-133

- 完成：`acc4538e8374e6ff94cb06d892e2994e8f59f7ec` 已普通推送并完成 exact-SHA `prepare-push 5387 / 5387`、GitHub CI run `30602758373` 和 Immutable Release run `30603201549`；release `2026.07.31-2` / tag `artifact-acc4538e8374e6ff94cb06d892e2994e8f59f7ec` 的 Server / Web 不可变制品已按正式 promotion 流程部署到 `customer-trial-133`。operation `f6de0aa4-c9b4-441c-a6d0-45d418546ab8` 在 fresh backup、restore rehearsal、串行 Atlas 锁和已授权 trigger / function 移除后通过，目标读回 current migration `20260730161955`、pending `0`、runtime SHA 与 OCI image ID 精确匹配；基础 Web / health / ready、`11 / 11` 登录矩阵、SMS、active config 和 PDF 技术 smoke 共 `9 / 9` 通过。
- 当前阻断与根因：目标专用 `customer-trial-133` V7 manifest 已完成离线变换和服务端 validate，但 publish 确定性返回 `40010 所选岗位当前未开启审批功能`，未进入 activate，V5 继续保持 active。目标 `rbac_options` 权威读回显示固定审批池主办岗位 `sales`、`purchase`、`finance` 仍缺少持久化 `workflow.task.approve`；当前代码的 builtin role 定义已向业务岗位附加该权限，但启动 seed 按治理约定保留旧库已选择的业务权限，且既有 migration 只前向补过 `workflow.task.reject`，因此老数据库不会自动收敛。
- 修复与当前门禁：additive / idempotent migration 已提交、以一次性 PostgreSQL 升级夹具验证精确三岗位、已有绑定不升版、无关岗位不受影响、重复执行幂等，并由 `9e77aed7189c0d79c74a1576392487920d1841ea` 的完整本地门禁 `5388 / 5388`、GitHub CI run `30605780213` 全绿。Immutable Release run `30606218045` 的 Ent / Atlas 零漂移已通过，但 strict Web `2070` 项唯一失败：隐私单测在 Node 文件并发执行时读取共享真实 checkout，仓库 identity 在两次快照间变化而按生产合同 fail closed。该用例的目标只是证明 `runContext` 不含本机路径、用户名、remote 或 token，现改用同文件已有 canonical synthetic repository 输入；生产 `readRepositoryIdentity`、identity 漂移阻断和各自专门测试均不变，不通过 rerun、删除测试或放宽门禁掩盖失败。
- 下一步 / 风险：release run `30606218045` 未进入镜像构建，没有生成新 tag、GitHub Release 或 assets。本测试隔离修复由唯一 Git 收口队列提交后，必须绑定新 clean SHA 从头重跑完整本地门禁、普通非强制 push、同 SHA CI / 新 release，并只用新的不可变制品再次 promotion 到 `customer-trial-133`；fresh backup、migration plan / apply / status、V7 publish / activate / 权威读回和规定 smoke 必须全部重新取证。任何目标漂移、备份 / restore rehearsal 失败、migration 非预期、远端并发或 digest 不匹配均 fail closed。生产保持 `NOT_RUN`，客户 UAT 保持 `NOT_CLAIMED`，`4 / 4 / 3` 场景业务造数保持 `NOT_RUN`。

### 库存预留与采购入库权威投影

- 完成：库存预留列表在同一服务端读快照中统一计数、分页、筛选和当前可读引用，按既有权限分别投影来源销售订单 / 行与产品 / SKU、仓库、单位、批次；出库管理页只展示业务可读字段，继续保留不可变“预留数量”，不增加独立消费动作。采购订单行新增无持久化余额的入库进度权威投影，按采购承诺、已过账入库 / 调整和 DRAFT 草稿占用返回剩余可收、剩余可生成及失败关闭原因；页面只消费服务端六位小数字符串，保存时仍由写事务重验。
- 验证：Go 的 biz / data / service 定向测试通过；前端 API、页面配置、lineage、mock 和可见技术字段合同分别 `93 / 93`、`77 / 77` 通过；文档清单、Workflow / Fact 与页面动作守卫 `32 / 32` 通过。采购入库弹窗正式 Style L1 场景通过；出库管理定向 Chromium 读回库存预留业务字段、无技术 ID、无控制台错误，1440px 下 `scrollWidth = clientWidth = 1440`。Go 格式、Node 语法、触达 ESLint、tracked 与四个新增文件的 whitespace check 均通过。
- 下一步：如取得明确归属的隔离 PostgreSQL 测试库，补跑库存预留 / 释放 / 出货竞争专项；目标环境仍须另行执行对应版本的 migration 状态 / 结构读回、当前客户 revision 发布激活与 effective-session 读回、真实岗位账号和移动端 smoke，再由客户完成 UAT / 签收。
- 阻塞 / 风险：本批没有 schema / migration 变更，也未连接 PostgreSQL、部署或代做 UAT。BOM item 显式 SKU、采购需求来源与 grain、已采购 / 在途 / 剩余采购量扣减合同仍无法从正式真源唯一确定；库存预留的原始 / 已消费 / 剩余三数量、单条部分消费、消费 Shipment 链接、取消 / 恢复、单行可用量和仓库数据范围同样未冻结，继续 `blocked / deferred`，不擅自建立第二套事实或余额。

### 收付款场景数据补齐

- 当前状态：代码与正式文档已完成写入，目标为 30 个桌面页 / 51 个验收目标，以及 4 条收付款和 3 条红冲固定矩阵；完整实现与原验证计划见本轮完整 progress 归档。
- 下一步：执行静态与定向合同后，才可对登记的本地 8300 场景库运行带计划摘要的幂等补数并权威读回 `4 / 3` 矩阵和 51 个页面目标。任何正式接口、状态或关联不满足时 fail closed，不用 fixture 或页面 mock 冒充运行态。
- 阻塞 / 风险：本地场景数据和自动化即使绿色，也不等于已部署、真实岗位 smoke 或客户 UAT。

### 已阻塞任务附件写权限

- 当前状态：代码、T3 / T4 / T5 定向合同和独立 Chromium 已覆盖 `ready / blocked` 合法责任人补附件、终态和越权拒绝，以及上传账号 / 时间审计投影；完整测试数量、截图和边界见本轮完整 progress 归档。
- 下一步：取得提交授权并完成本地提交后，按项目流程预检、重建并重启当前 8300 后端，再以 demo boss 对已阻塞任务补附件做本地运行态读写验证。
- 阻塞 / 风险：当前 8300 后端仍是修复前制品；尚未执行真实附件写入、PostgreSQL 并发门禁、目标发布或客户 UAT。

### 成品返工补制闭环

- 当前状态：完工已绑定确切包装 WIP 批次；REWORK 过账原子创建来源根批次、事件和异常任务；CLOSED 仅允许该来源链办理和补完工。Go 核心包、Node 121 项、文档 17 项、db-guard、build 与 4 个生产 Style L1 场景已有本地绿色记录。登记共享开发库已应用 `20260730161955_migrate.sql`，新增 WIP 关联列、两个 CHECK、两个 FK 和三个索引均完成结构与存量数据读回。
- 下一步：目标发布前仍须对对应不可变版本重做 migration / 配置 / 运行态门禁，再由真实岗位完成 smoke 与 UAT；共享开发库绿色不替代 133 或生产证据。
- 阻塞 / 风险：本轮没有部署、生产变更或客户 UAT；真实高并发业务竞争仍按 T8 专项另行验证。

## 最近完成

| 事项                         | 当前结论                                                                                                                                         | 详细证据               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| 共享开发库迁移终态回执       | 本地共享开发库六个入口在成功、no-op、ready、需人工动作、阻断、失败和结果未知时统一输出完整脱敏摘要；真实只读 status 为 `107 / 107`、pending `0`  | 下方独立小节           |
| 共享开发库迁移主路径可操作性 | 裸旧命令已安全兼容到高层编排；登记共享库已由 `105 / 107` 一次升级到 `107 / 107`、pending `0`，备份恢复、schema / 数据 / 权限和后端运行读回均通过 | 下方独立小节           |
| 开发测试固定动作             | 固定入口与证据 staging 已收口；本次发布候选的确定性门禁漂移已最小修正，完整门禁仍待最新 clean SHA 重跑                                           | 下方独立小节           |
| 全局业务记录动作可发现性     | 14 类业务页面与九岗位动作入口已按“可做但未选时置灰、无权或终态隐藏”收口；保持 `hold`                                                             | 本轮完整 progress 归档 |
| V1 主链验收计划口径修正      | 文档、脚本、报告、DEV 预设和清单已统一为 V1 计划边界；保持 `hold`                                                                                | 本轮完整 progress 归档 |
| 开发工作台主题切换           | 共享主题三态、刷新保持、窄屏入口与暗色 / 浅色浏览器回归已完成                                                                                    | 本轮完整 progress 归档 |
| 页面与移动岗位近期收口       | 页面刷新、任务看板、移动任务文案 / 计数 / 标签、角色进度等各批次的精确结论与盲区已归档                                                           | 本轮完整 progress 归档 |

### 共享开发库迁移主路径可操作性

- 根因与修复：截图中的 Makefile 报错行由 `158` 漂移到 `181`，证明同一 Local checkout 在用户两次命令间被活动 writer 改写，而非 shell 缓存；旧 Makefile 又把公开的裸 `migrate_plan / migrate_apply` 直接接到必须携带内部 HMAC / 维护确认的低层 recipe，因此旧操作习惯必然走进缺 token 的死路。`.env` 在 include 前已捕获命令环境，本轮 shell 也没有 `MIGRATE_* / DB_URL / POSTGRES_DSN` 残值，不是缺确认根因。现在裸 `make migrate_plan` 安全进入高层 prepare，裸 TTY `make migrate_apply` 恢复唯一 ready operation；找不到可恢复 operation 时重新准备并等待确认，只有完整内部确认才进入低层 plan / apply。
- 安全边界：CLI 与 `/__dev/database-migration` 继续复用同一 operation service、登记目标身份、0600 原子状态、幂等键、串行锁、其它 client / writer 拒绝、源码与 revision 指纹、真实备份和隔离恢复。非交互裸 apply 在构造 service 前固定以 `ACTION_REQUIRED` / exit 2 停止，明确引导同一次 `migrate_prepare / migrate_execute`，不会静默写库；备份缺失或身份变化、源码漂移、外部客户端、目标变化和结果未知仍 fail closed。133、测试、生产、任意 DSN / SQL / shell 和归属不明数据库均未放开。
- 真实执行：源码冻结为 commit `72a60f8783fb290c983338316d65ab28b1e3abae`、fingerprint `cb704a3ace8d1f13f3a6563a88bc54ec2380c1cae14d1064e60788846c84d7b8`；裸非交互 `make migrate_plan` 完成零写 plan、事务回滚预演、PG18 备份 `br-yoyoosun-20260801T212920+0800` 和临时 PostgreSQL 18 恢复升级验证。随后裸 TTY `make migrate_apply` 只执行 operation `3b0a4b00-bb5e-43e2-bd35-b5fdcf7fe368` 一次，登记共享库 `192.168.0.106:5432/plush_erp` 由 `20260729043852`、`105 / 107`、pending `2` 升到 `20260731124000`、`107 / 107`、pending `0`；operation 最终 `passed` 且 health / ready 均为 HTTP 200。
- 数据读回：`20260730161955` 与 `20260731124000` 的 Atlas revision 分别完整执行 `7 / 7`、`1 / 1` 且 error 为空；两个新增 bigint 列、两个 CHECK、两个已验证 FK 和三个索引全部存在。WIP source CHECK、rework bundle CHECK、两个 FK orphan 和局部唯一重复共五类存量违规均为 `0`。`workflow.task.approve` 在 `sales / purchase / finance` 三个 `business_default` 角色上恰好 `3 / 3`、重复 `0`；非系统 schema 的 function / procedure / 非内部 trigger 为 `0 / 0 / 0`。最终后端 `server/bin/server-dev` 从本仓库 cwd 监听 `8300 / 9300`，运行配置脱敏读回仍为同一共享目标，`/healthz=ok`、`/readyz=ready`。
- 验证：迁移 workflow、低层守卫、启动预检和 Makefile 合同定向 Node `37 / 37`，审批权限 migration Go 定向测试通过；`db-guard`、Atlas validate、Node 语法、AGENTS `15925 bytes`、文档清单 `5 / 5` 和 `git diff --check` 通过。真实 smoke 同时覆盖非交互裸 plan 成功停在 ready、TTY 裸 apply 成功到 pending `0`，以及非交互裸 apply exit `2` 且 no-apply 后 status 仍为 `107 / 107`。
- 未做 / 风险：本轮未部署、未修改 133 / 生产、未代做客户岗位 UAT，也未 stage、commit 或 push。备份和 operation 回执保留在本机 `output/dev-workbench`；后续目标发布仍须绑定对应不可变版本重新执行目标门禁，不能复用共享开发库证据冒充发布完成。

### 共享开发库迁移终态回执

- 完成：`make migrate / migrate_prepare / migrate_execute / migrate_status` 以及裸兼容 `migrate_plan / migrate_apply` 的高低层终态统一追加七行 `[migration-summary]`。回执固定包含 command / mode / phase、安全 target、current / latest、applied / pending、result、writes、apply、auto_retry、operation、runtime、error_code 和 next_action；状态尚不可读时明确使用 `unavailable / unknown`，不沉默也不复用旧输出。
- 安全边界：回执只接受结构化安全目标和稳定枚举，不接收原始错误、DSN、路径或确认值；stderr 继续统一脱敏数据库 URL、环境变量密码和高低层确认值。旧 `[migration]` parser 行、显式 prepare continuation、HMAC、目标 identity、真实备份与隔离恢复、停写、source fingerprint、单次 apply 和同目标读回均保留。`not_proven / writes=unknown` 固定 `auto_retry=false` 且下一步只允许 status，不把错误包装成成功。
- 真实只读 smoke：登记目标 `192.168.0.106:5432/plush_erp` 当前为 `20260731124000 / 20260731124000`、`107 / 107`、pending `0`；`make migrate_status` 回执为 `result=passed / writes=0 / apply=not_requested`。非交互 `make migrate` 与裸 `make migrate_apply` 均在 service 构造前以 exit 2 / `ACTION_REQUIRED` 停止，并分别输出 `target=unavailable / result=action_required / writes=0 / apply=not_started`；没有 plan、备份、停后端或写库。
- 验证：低层 formatter / redactor、高层 workflow、operation store、runtime parser、DEV plugin、启动 preflight、Makefile 和文档合同共 `65 / 65` 通过；Node 语法、`db-guard`、文档清单 `5 / 5` 和触达路径 `git diff --check` 通过。额外 Prettier check 仅报告 `local-migration.mjs` 中本批之前保留的 rollback rehearsal 单行换行差异，本批新增 hunk 已符合 formatter 输出且未越权改写旧 hunk。
- 边界 / 下一步：本批只覆盖登记共享开发库六个入口，不改变隔离业务库脚本或生产 `migrate_online.sh` 的专用合同；没有执行真实 apply、修改 schema / migration SQL、部署、stage、commit 或 push。后续本地开发仍以交互 `make migrate` 为主，非交互使用同一次 `migrate_prepare → migrate_execute`；提交与 push 需用户另行授权。

### 业务列表列顺序与全筛选导出

- 完成：生产订单补齐“导出筛选结果 / 列顺序”；主数据、销售订单、采购订单、采购入库、质量检验、库存台账、物料清单、出货单、委外订单和业务记录等既有入口统一改为按当前筛选读取全部严格分页结果后导出，不再把当前 20 条页面数据误称为筛选结果。导出沿用当前可见列顺序、业务可读状态 / 日期 / 引用值，并提供单飞、取消、空结果和失败反馈。
- 边界：收付款与核销原本已使用完整分页导出，保持不重复改造；生产异常处置继续只提供列顺序，不开放缺少独立业务数据边界的导出。看板、权限 / 配置、系统操作记录和纯 Workflow 任务页不机械套用该工具。
- 验证：锁定 Node `24.14.0` 下，本批 API、页面、可见字段、请求生命周期和 12 页全局合同定向执行 `250 / 250` 通过；Web 全量为 `2060 / 2064`，剩余 4 项仅来自并行中的字段联动 QA wrapper 与开发页导航 / 英文标签批次。Web 全量 ESLint、CSS stylelint 和 overall `git diff --check` 通过。
- 浏览器：复用当前外部 Style L1 服务执行生产订单刷新手机布局场景 `1 / 1`；另以真实 Chromium 打开生产订单列顺序弹窗并实际下载 CSV，读回生产订单业务内容，1440px 下页面 `scrollWidth = clientWidth = 1440`。
- 阻塞 / 风险：Vite build 当前被任务外 `devQaTestingPlugin.mjs` 静态导入带 shebang CLI 的配置打包问题阻断；责任批次已定位并排队修复，本批未越权修改或等待。当前仍未部署、未做目标岗位 smoke / 客户 UAT，也未 stage、commit 或 push。
- 下一步：待 dev-testing 批次修复并释放热点后复跑 Vite build 与全量测试摘要；如用户授权，再由统一 Git 收口队列按本批精确路径处理本地提交，push 仍需单独授权。

### 开发测试固定动作

- 完成：在 `/__dev/testing` 的验证层级视图新增 P0「生成本轮验证计划」、P0「运行开发门禁」、P1「岗位权限与任务可见性巡检」和 P1「字段联动专项」，覆盖视图保留并改名为「采集本地覆盖基线」。计划只读冻结生成前后 repository identity；浏览器只提交固定 action 与幂等键，不能提供命令、参数、路径、环境变量、URL 或凭据。三项执行结果与覆盖报告各自展示，不合成“全系统已通过”。
- 完成：新增 testing operation store 和覆盖 / 固定动作共用的全局 QA 锁；Vite development-only Bridge 固定映射 `fast.sh` 带回执门禁、九岗位 JSON-RPC 权限巡检和字段联动 runner，并在执行前后复核仓库身份。岗位巡检缺少本地后端或演示账号凭据时明确为 `blocked`，预期业务写入为零，不等于完整角色协同闭环；生产 build 不注册这些接口。
- 完成：`run-gate-with-receipt.mjs` 增加 repository identity 前后复核；baseline 在 Web coverage 前先执行 error-code `--check`，再直接使用项目 Node native coverage，避免 package `pretest` 自行改写 tracked 生成物。字段联动 TAP 与报告改为 staging 生成并在测试、builder 和身份复核均通过后提升 canonical 报告，失败时保留上一份证据。
- 完成：新测试登记到 fast Node 分组和 `fast.sh` Web 固定清单，fast profile required files 同步覆盖 operation store、全局锁、runner、插件、client 和页面；`scripts/qa/README.md`、`web/README.md` 与自动化测试策略同步五项优先级、全局串行边界、11 个 coverage 阶段及证据不互相替代的口径。
- 修正：writer 释放后的真实 Chromium 读回确认桌面、390px 移动端与暗色页面布局可读且无页面级横向溢出，同时暴露旧 Vite 进程未注册 testing API，以及 Vite / esbuild 配置打包会把带 shebang 的 `affected.mjs` 静态内联到非首位置。testing Bridge 已改为仅在 plan 请求时通过非字面量 file URL 动态导入，并新增 `loadConfigFromFile` development serve 回归；固定动作在 summary 尚未成功读回或读取失败时也改为 fail closed 禁用，避免告警与按钮状态相反。
- 验证：全局锁、testing store、门禁回执、collector、字段联动、fast profile、两个 operation client、两个 Vite Bridge、插件注册、清单完整性与页面合同最终定向执行 `96 / 96` 通过；fast profile 读回 `13` 个 gates / `186` 个 required files，文档清单 `5 / 5` 通过，触达 ESLint、Prettier、全量 Stylelint、Vite development config 加载和 overall `git diff --check` 通过。
- 验证边界：独立 `15201` 开发服务的真实 Chromium 已生成当时 `237` 个改动文件的验证计划，建议 T0 / T1 / T2 / T3 / T4 / T5 / T7 / T8；testing summary 成功读回前 P0 / P1 固定动作全部 fail closed 禁用。九岗位巡检在本地 `8300/healthz=200` 但演示凭据缺失时正确保持 `blocked`，字段联动动作通过并原子发布报告；1600px、390px 与暗色页面可读，390px 下 `scrollWidth = clientWidth = 390`，控制台 error 为 0。夜间发布初始 fast 为 `524 / 530`、Web full 为 `2066 / 2070`；已定位并最小修正全部确定性失败，当前只完成相关定向回归，尚未把它们描述为 full 全绿。
- 下一步：旧 coverage baseline 绑定旧 fingerprint，结果原本即为 `issues`，不能复用为本次 clean SHA 证据。收口队列产生新提交后重跑 fast、Web full 与 `prepare-push`；演示凭据可用后才执行九岗位真实登录，并按 T2 / T7 / T8 分别补 migration、业务集成 / 浏览器和发布证据。
- 阻塞 / 风险：本轮尚未连接 PostgreSQL、运行真实业务浏览器写链或目标环境部署 / smoke；后续任何代码变化都会使当前定向证据过期。本批由唯一 writer grant 管理，尚未 stage、commit 或 push。

### 业务写入唯一入口治理

- 完成：在项目长期协作约定中明确，正式业务写入只能经过受控的 Go repository/usecase，禁止临时 SQL、页面脚本或其他服务旁路写业务表。
- 下一步：后续新增或修改业务写链时，继续由既有 usecase、事务、权限、幂等与数据库声明式约束共同守住一致性，不为同一规则增加数据库 function / trigger 双轨实现。
- 阻塞 / 风险：本批仅收口治理规则；没有恢复或新增数据库 function / trigger，没有修改业务代码、schema、migration、测试或运行环境。

### 夜间发布收口

- 当前：`539e9c041ff049afa690cc24710f00a84155c408` 已普通推送并完成同 SHA GitHub CI；Immutable Release run `30601143215` 的 exact-SHA strict terminal 已通过并持久化，但最终 Server 镜像构建在加载 `vite.shared.mjs` 时无法解析 `./dev-server/devWorkbenchPlugins.mjs`，因此 release 整体仍为失败。
- 修复：Server Dockerfile 的临时 Web builder 补齐 `web/dev-server` 构建依赖，最终运行镜像仍只复制生成后的静态 `build`；客户配置边界与 release artifact 合同同步阻断遗漏该嵌套依赖的构建上下文。
- 下一步 / 风险：本次失败没有生成 GitHub Release、tag 或 assets。修复提交后必须从新 clean SHA 重走完整本地门禁、普通 push、同 SHA CI 和 release，不能复用 `539e9c04` 的部分绿色或失败制品；133 migration、部署、岗位 smoke 与客户 UAT 均未运行。

## 下一步与停止条件

1. 本次一次性夜间任务已获最小门禁修复、本地提交、普通 push `main`、GitHub CI / release 和仅部署 test-133 的明确授权；生产、客户 UAT、force / 历史改写、CI 放宽及破坏性 migration / data change仍未授权。
2. writer 释放后由唯一 Git 收口队列精确本地提交；重新核对 clean worktree、index、lock 和 latest SHA，只有该 SHA 才运行 `bash scripts/qa/prepare-push.sh`。
3. push 前 fetch 并比对远端 OID；有远端并发漂移即 fail closed，禁止覆盖。CI / release 任一确定性失败只允许最小修复并从新 SHA 全链重走。
4. promotion 前必须再次确认 target 身份、fresh backup / rollback point、Atlas status / plan、migration 性质和锁；任何受禁 pending migration、身份不明、备份失败或 digest / runtime 漂移都停止，不进入生产。

## 长期边界

- 当前稳定客户 key 为 `yoyoosun`。Product Core、客户 Private 仓和目标部署必须各自固定版本并独立读回；真实客户资料、导入批准和 UAT 不由本地或 CI 绿色替代。
- 133 上较早固定 V5 的技术试用证据不能证明当前 Product Core HEAD。客户配置 V7、V5 → V7 激活边界、目标 migration 和岗位 smoke 都必须以本次 promotion 后的目标读回为准。
- Workflow task 完成不等于 Fact posted；Source Document、ProcessRuntime、Fact、RBAC 和客户配置继续遵守正式文档与领域 usecase 边界。
- Git、CI、Release、promotion 和部署只允许一个收口 owner 串行推进。

## 归档索引

- `docs/archive/progress-2026-08-09-before-active-page-compaction.md`：2026-08-03 至 2026-08-05 的非当前页面、移动任务、附件与协作治理过程摘要；已退出的旧业务分支不作为历史兼容保留。

- `docs/archive/progress-2026-07-30-before-dev-testing-oneclick.md`：本活跃页收缩前的完整过程记录；原始快照为 348 行 / 81,671 bytes，SHA-256 `67b2f47e2af9a3eedcd5fb3ea6a1c737fe38667a14b41feb49f474d587c5ed2e`。
- `docs/archive/progress-2026-07-29-before-cicd-portable-image-identity.md`：OCI 镜像身份与 promotion 回执前向修复前的完整过程记录。
- `docs/archive/progress-2026-07-29-before-recent-task-closeout.md`：近期产品、业务页面、数据库与 DEV-only 工作台统一 Git 收口前的完整过程记录。
- `docs/archive/progress-2026-07-28-before-login-style-recovery.md`：登录页样式回归修正前的完整过程记录。
- 更早记录见 `docs/archive/README.md` 与 `docs/文档清单.md`。

### 九岗位任务数量守恒闭环（2026-08-06）

- 完成：岗位任务状态统一由 `workflow_tasks` 权威投影，固定满足 `todo = ready + blocked`、`history = done + rejected`、`total = todo + history`；审批、风险和超时是可重叠关注项，不参与状态相加，且 `overdue <= risk`。后端 repository、JSON-RPC 和前端 wrapper 均对完整计数合同 fail closed；风险范围按有效 `workflow.task.supervise` 权限投影为当前岗位或可监督跨岗范围，不再按老板、PMC 等角色名硬编码。
- 一致性 / 页面：首屏计数与列表在既有 PostgreSQL 只读 `REPEATABLE READ` 快照内读取，版本化游标绑定方法、岗位、视图、风险范围、快照和累计数量，普通分页漂移直接拒绝；浏览器按岗位与视图分别保存权威计数快照，任务变更后统一失效。移动端“当前岗位任务状态”、全部 / 审批 / 风险 / 超时和已办均读取服务端口径，主管显示“跨岗风险”，超时使用服务端时间，未知或不可信时显示“—”而不是已加载数组长度。
- 自动约束：新增九岗位状态矩阵、350 条以上分页、状态守恒、重复任务、分页闭合、游标越界 / 漂移、权限风险范围和只读快照并发测试；affected 现有门禁会把数量合同相关后端、前端和浏览器路径升级到 PostgreSQL 与真实浏览器验证，没有新增一套 Git hook。锁定 Node `24.14.0` 下定向 Node `153 / 153`、Web 全量 `2100 / 2100`、ESLint、CSS stylelint、Prettier、Vite production build（`3352` modules）、affected `31 / 31`、九岗位手机 / iPad 登录 smoke 和 Style L1 `2 / 2` 通过；人工复核 390px 暗色与 430px 岗位截图无数量矛盾、截断或横向溢出。
- 文档 / 边界：现有《业务公式与计算口径》《自动化测试策略》《业务主链路数据流向与字段来源规则》、能力台账、Web README 和 Current 原型说明已同步，没有另建重复文档。未引入 schema、migration、数据库 trigger、投影 revision 表、长生命周期游标会话或新的 hook 架构；严格跨请求 MVCC / 物化 ID 会显著增加复杂度，本批按约定不做。
- 后续状态：隔离 strict 回执 `f6d6b0db-3c7a-4e75-8e5f-9aa211c34742` 在当时为 `passed`。本节未连接或 apply 目标数据库、未部署、未完成客户岗位 UAT，也未 stage、commit 或 push。

### Codex 输入归属、客户范围与变更追溯治理（2026-08-06）

- 来源 / 客户：只有项目负责人在 Codex 会话中明确标注甲方提出、要求、反馈或确认时才记为客户输入；未标注内容归产品 / 研发与 AI。当前裸“甲方”指 `yoyoosun`，明确客户名称或 key 时仅归该客户，多客户歧义不得跨会话猜测。
- 闭环 / 易用性：模糊输入仍由产品 / 研发主动形成可修改的最小完整闭环，基础业务文案、可信自动带值、合理默认、错误恢复和响应式等易用性随主链完成；会改变业务行为或引入持续运行成本的批量动作、提醒、定时及自动分配 / 放行 / 生成事实单独过复杂度门禁。
- 追溯 / 复杂度：复用需求线索、问题待办、假设登记、决策日志和正式实现真源，明确区分甲方初始输入、产品 / 研发闭环和甲方后续修改。普通正确性、易用性和纯技术修复不逐项留档；只有重要长期选择或已确认 / 已实施行为变化才追加决策、替代关系、客户范围、生效范围和历史处理，不新增 Change 模块、每会话文档、配置引擎或平行台账。
- 验证 / 边界：AGENTS 体积门禁（`16278 bytes`）、Phase 标签边界、角色手册合同和精确 `git diff --check` 通过。本批只修改治理文档，不改 runtime、schema、migration、API、RBAC、数据库、部署或客户 UAT，也未 stage、commit 或 push。

### 移动端返工生产安排最小闭环（2026-08-06）

- 完成：只有正式 `production_rework.post` 生成、来源任务合同 / producer / intent hash / source id 与生产订单锚点完整一致，且当前经办人仍可办理任务并同时具备 `production.wip.read + production.wip.assign` 时，手机任务详情才显示“安排本厂 / 外发”。手工仿造、来源缺失、任务不可办或权限不足均失败关闭；外发继续要求 `outsourcing.order.read` 和现有已确认加工合同来源。
- 领域边界：入口复用现有生产 WIP 查询、安排、版本、幂等和读回合同，只筛选 `origin_rework_fact_id` 精确匹配的返工批次，并只开放一次“安排加工”。保存后回到任务详情，重新打开可见安排按钮已按服务端读回禁用；Workflow 任务仍须在独立处理页记录结论，不因 WIP 安排自动完成，也不登记完工、回仓、质检或库存。
- 页面 / 复杂度：移动安排模式隐藏桌面端的拆分、取消、开工、完工、回仓、转序、包材、返工和完整四工序路线，只保留生产订单、当前返工批次、当前工序与本厂 / 外发选择。Current 移动原型的“查看任务 → 处理任务 → 结果回执”结构未改变，因此未机械修改原型文件。
- 验证：锁定 Node `24.14.0` 下，相关 Node `75 / 75`、目标 ESLint、Prettier、Vite production build（`3353` modules）通过。真实 Chromium 390px 完成“可信返工任务 → 打开安排 → 选择本厂 → 保存 → 回到任务详情 → 重开读回禁用”；入口和弹窗横向溢出均为 `0`，弹窗宽 `358px`、高约 `535px`，人工复核入口、安排、成功回详情和读回四张截图无遮挡或信息过载。
- 边界 / 下一步：本批未新增或修改 schema、migration、API、权限码、菜单、Workflow、后台任务、配置层或客户分支，也未触碰 `plush-toy-erp-customer-yoyoosun-private` 的甲方需求翻译。当前仅覆盖正式返工过账产生的生产异常任务，不扩成所有生产决策；目标发布、真实生产账号 smoke 和客户 UAT 仍待独立执行。当前未 stage、commit 或 push。

### 文档编号可读性全面治理（2026-08-06）

- 完成：正式文档与项目 Skill 统一采用“业务名称优先、内部编号括注”。产品成熟度写成“正式页面已接（L7）”，验证范围写成“领域逻辑（T3）”，客户流程写成“销售订单受理（流程 F02）”；定义表和追溯表保留独立编号列，正文不再要求读者先背编号对照表。
- 分层：产品成熟度（L0-L8）、验证范围机器键（T0-T8）、页面级浏览器回归（Style L1）、风险优先级（P0-P2）、公式 / 页面预览编号及客户流程 / 签认编号已明确区分。公式与客户流程即使同号，也分别写明“公式 Fxx”“页面预览 Pxx”“流程 Fxx”；客户确认表的 R / A / P / H / X / C 编号继续作为稳定追溯键，表内和正文同时给出岗位、节点、流程、交接、异常或待决事项名称。
- 兼容边界：开发工作台解析依赖的 `## 验证层级 T0-T8` 标题和表格首列机器键、客户签认表的稳定 ID 与签认范围、命令 / 路径 / 环境变量 / JSON 键 / fixture ID / archive 文件名均未改号。没有新增术语表或第二套编号真源，也未修改 `docs/文档清单.md`，因为本批没有新增、删除、重命名或重分类文档。
- 验证：`git diff --check`、开发测试文档解析 `20 / 20`、永绅角色与流程手册合同 `10 / 10`、阶段编号边界测试 `3 / 3` 与全仓扫描、项目 Skill health（11 个 Skill）通过。文档清单确认 303 份 Markdown 均已登记；当时的跨批次链接阻断现已解除，当前 Schema 文档检查一致。本批未越权改写业务迁移现场。
- 下一步 / 风险：后续新增或修改普通正文继续遵守名称优先规则；稳定编号只负责精确追溯，不能替代读者可理解的业务文案。本批仅治理文档表达，不改变 runtime、schema、migration、API、RBAC、数据库、部署或客户 UAT；当前未 stage、commit 或 push。

### 个人 ToB Codex 交付循环与文档降复杂度（2026-08-06）

- 开发模式：项目规则明确“外部聊天中的甲方目标 / 痛点 / 反馈由项目负责人带回 Codex → Codex 在当前真源上补成最小完整实现并验证 → 经明确授权部署固定版本 → 甲方实际使用后继续反馈”。甲方不需要阅读代码、理解实现过程或逐级确认架构层、产品状态、验证内部键和测试形态；只有关键业务责任、高风险选择与实际业务结果由甲方确认。
- 复杂度：项目负责人和 Codex主动补齐与本次需求相关的真源、权限、异常、恢复、测试和基础易用性，但不为未来可能性预造表 / 字段、状态、配置、后台任务、通用引擎或兼容分支；新增复杂度必须能对应当前需求或正确性、安全、数据完整性和可运维性。
- 文档收敛：《产品完成路线图》从 `581` 行降为 `84` 行，只保留长期方向、进入条件和不变边界，不再复制能力现状、历史发布证据和分阶段实施清单；《模块实施治理》从 `106` 行降为 `86` 行，直接描述个人 ToB 闭环、职责、复杂度和反馈分类。没有新增文档、metadata、frontmatter 或 Mermaid，文档清单和当前真源入口不需调整。
- 台账 / 源码包：能力台账继续只保留一张产品主表，并补充甲方只看固定版本、发布、可用边界和反馈结果的对外口径；上一批删除重复 `/__dev/capability-ledger`、隔离客户文档 / 专属测试及源码包 Markdown 断链检查的结论继续有效，候选镜像不冒充正式 clean HEAD 发布证据。
- 验证：`AGENTS.md` 体积门禁通过（`15651 bytes`）；文档清单、链接、Workflow / Fact 与阶段编号合同 `14 / 14`，开发文档入口 `8 / 8`，全仓阶段编号扫描和精确 `git diff --check` 通过。路线图、实施治理、能力台账和产品 README 合计由 `808` 行降为 `291` 行。
- 后续候选 / 边界：只读审查还发现《多甲方角色能力与流程编排》`391` 行、研发效能工作台设计 / 实施计划合计 `529` 行、菜单计划 / 映射 / 拆分清单合计 `473` 行；前两组存在并发在制修改，且都含运行时合同，本轮不越权重写。测试策略 `292` 行中的内部机器键仍有真实消费者，不能仅为变短删除。本批未修改 runtime、schema、migration、数据库，也未部署、客户 UAT、stage、commit 或 push。

### ProcessRuntime 收窄一致性修正（2026-08-06）

- 恢复边界：补偿恢复的查询与写入改为共用同一范围，只接受收付款、库存人工调整和生产异常的正确业务引用及 `attempt=1` 线性冻结快照；branch、fan-out、join、returnTo 和已完成实例继续失败关闭，页面先读取服务端验证后的恢复上下文，不再自行推断可恢复范围。
- 拒绝与持久化：销售、采购和出货审批增加命名拒绝分支。销售 / 采购拒绝分别进入专用 end，不再错误执行激活 / 批准命令，源单后续按自身门禁取消并重新建单；出货拒绝由 `shipment.finance_reject` 原子写 `REJECTED`、原因、actor、流程锚点和 durable result。三类新实例必须使用带拒绝分支的当前图，旧 active revision 缺少拒绝终点时等待重新发布；销售 submit 缺少 durable transaction repo 时直接失败，不再降级普通更新。
- 最终一致性 / 状态：服务启动后立即并每 30 秒有界扫描“终态 linked WorkflowTask + active 人工 / 审批节点”，使用任务原处理人调用既有幂等结算路径，单条失败不阻断同批；批次按 WorkflowTask ID 的进程内游标推进并在尾部回绕，即使固定首批全部失败也不会永久挡住后续任务，服务重启则安全地从头扫描。不重放领域副作用，也不扩成通用 outbox。财务目录补齐仅应收 / 应付由正式冲销触发的 `SETTLED → POSTED`，`SETTLED` 不再登记为通用终态。
- 验证 / 边界：Go `internal/data` 恢复 / 游标定向测试、`internal/biz`、`cmd/server` 和完整 `internal/service` 通过；客户配置、Workflow / Fact 与文档清单合同 `68 / 68`、精确 `git diff --check` 通过。模块闭包红项已通过收窄测试 helper 的传播范围消除，没有放宽正式发布校验。扩圈发现的返工入库失败已按下一节独立修正，不能倒推为 ProcessRuntime 本身的完成证据。本批未连接或 apply 数据库，未部署、未做客户 UAT，也未 stage、commit 或 push。

### 返工收货批次一次性绑定修正（2026-08-06）

- 根因 / 真源：返工收货事务创建 HOLD 批次后需要把 `received_lot_id` 回写到返工来源明细，但 Ent 会把该外键更新解释成唯一边变更；通用不可变钩子先前直接拒绝，放开后又会在现有 SQL 事务里尝试嵌套事务。该字段不是可编辑来源值，而是收货动作生成的生命周期引用。
- 修正边界：沿用采购收货的受控 repository 模式，在同一收货事务内用 `received_lot_id IS NULL` 条件完成一次性绑定；影响行数不是 `1` 时失败关闭。Ent 通用更新继续禁止该字段及全部来源字段 / 边的修改，补测 repository 重绑、Ent 改绑和清空均被拒绝。没有改 Workflow / ProcessRuntime、API、RBAC、前端、迁移 SQL 或数据库数据。
- 验证：返工相关 `internal/biz` / `internal/data`、完整 `internal/biz` / `internal/data` / `internal/service` / `cmd/server`、`make data`、`scripts/qa/db-guard.sh` 和精确 `git diff --check` 通过；Atlas 报告 migration 目录与目标 schema 同步，未生成新 DDL。服务端全包 `go test ./...` 仅剩独立的数据字典门禁红项：`cmd/schema-doc` 的旧指标快照仍期待 `74 / 1148 / 141 / 333 / 30 / 249`，当前生成 schema 为 `74 / 1144 / 152 / 338 / 30 / 250`，需在下一切片完成人工数据字典审查后同步，不能在本修正里盲改数字。尚未连接或 apply 数据库，未部署、未做客户 UAT，也未 stage、commit 或 push。

### CI/CD 精确发布、效能观测与 133 恢复演练（2026-08-08）

- 完成：继续以 GitHub Actions 为唯一 CI / Release 真源，可信 plan 决定 affected / full 范围，稳定 `CI Gate` 作为分支保护入口；正式 Release 只接受当前 `main` 的 exact SHA，复用或执行同一 strict 终态，以共享构建图各构建一次 Server / Web，并发布固定六件制品、checksums、SBOM 和不可变 manifest。133 仍只 load 制品、串行 migration、启动与检查，不在低配目标机构建，也没有新增第二套流水线、时序数据库或自动重试控制面。
- 效能工作台：版本中心直接读取 GitHub run / job / step 与本地质量、promotion、rollback 脱敏回执，首屏展示最近完整运行、样本中位数、最长瓶颈和优化提示，全部阶段按需展开。真实 390px 浏览器检查发现展开入口点击区过小后，将流水线与 operation 耗时入口统一提升到至少 `44px`，阶段和瓶颈长名称在移动端换行并保留桌面悬停全文；桌面 / 移动均无页面级横向溢出。
- 演练：同一不可变候选完成两次独立本地 release rehearsal，均覆盖 migration、管理员引导、health / ready、11 账号登录、V7 effective session、PDF、备份恢复、稳态重启和零残留清理。133 完成“升级 → 代码 / 镜像回滚 → 回滚后深度 smoke → 重新升级”，回滚不执行 down migration 或数据库 restore；远端 promotion / rollback 总耗时与 ISO 墙钟绑定，拒绝历史脚本或异常数量级计时。本轮最终版本目标为 `2026.08.08-5`，exact SHA、run、制品 digest 与 operation 以 GitHub Release 和 ignored delivery evidence 为准。
- 数据库 / 边界：本地 full 与 rehearsal 结束后 disposable 数据库、演练容器和卷均为零；133 promotion 的临时恢复库已清理，正式数据库保持 `plush_erp_uat_20260716_v5`。另有迁移停在 `20260715161753` 的历史前身库，零连接但 schema 与当前不同，现有治理工具按长生命周期目标库拒绝删除；它作为受保护回滚资产保留，只有单独完成归档、恢复证明与唯一数据复核后才允许受控删除。发布与恢复演练不等于客户岗位 UAT 或签收。
- 本轮续办：把先前独立维护的 `admin.yoyoosun.net` 入口正式纳入固定 `test-133` registry、只读 preflight、promotion 和 rollback 阶段，要求公网容器、健康、Provider 能力与 Compose `GIT_SHA` 一致；回滚控制器固定取当前 live exact SHA，旧版本只提供源码和制品。工作台改为四列环境摘要，分开比较完整发布、相同 SHA 复用与 CI，中文主标签覆盖阶段和状态事件，重复发布当前完整 SHA 时给出可执行引导。仍不新增流水线、数据库、指标服务或服务器构建路径。

### Writer turn 租约与漏释放恢复（2026-08-06）

- 根因：共享 Local 中曾有任务完成文件写入并结束 turn，却漏发 `WRITER_RELEASED`；队列继续把旧 grant 当作活动 writer，造成后续任务错误等待。现场 index 为空、无 `index.lock`，因此不是 Git 锁故障。
- 修正：writer grant 只绑定收到授权的当前 `inProgress` turn 与连续写入阶段；进入只读验证、最终回复或 turn 结束前必须释放，恢复任务、验证后补写或新 turn 必须重新申请。队列在同一 wake 复核 owner；`idle`、`notLoaded`、completed、error、cancelled 或 turn 不匹配时按 `TURN_ENDED` 失效并继续放行。漏报写入记为 `UNREPORTED_WRITES`、保留现场但不续租；只有重叠归属无法隔离时才进入 `WAIT_HOT_FILE`。
- 门禁 / 验证：AGENTS 合同、队列 Skill 生命周期和 `skill-health` 静态守卫已同步；项目 Skill health、回归测试 `5 / 5`、文档合同 `20 / 20`、affected、AGENTS 体积与 `git diff --check` 通过。系统 Python quick validator 因环境缺少 `PyYAML` 未运行，仓库内 YAML、metadata、引用与 Skill validator 已通过。
- 边界：本批只修改协调规则、Skill、静态门禁和本节过程记录；不改变业务、schema、migration、数据库或发布。规则只有精确批次提交进入 HEAD 后才正式生效；当前未 stage、commit 或 push。

### 个人信息告知与系统使用规则（2026-08-11）

- 产品闭环：后台登录、短信验证码登录、桌面端账号菜单与移动端“入口与安全”均提供隐私告知和系统使用规则入口；登录后的当前账号按“版本 + 内容指纹”完成“已阅读并知悉”，规则变化后需要重新阅读。
- 证据边界：知悉回执复用追加式运行审计事件，不新增业务表；只记录账号标识、规则版本、内容指纹和时间，不记录密码、验证码、令牌、手机号或业务个人信息。“已阅读并知悉”不替代具体业务场景所需的单独同意或客户与实施方之间的合同。
- 配置边界：个人信息处理者、联系渠道、部署区域、跨境状态、保存期限和第三方处理者均由客户运行配置提供，Product Core 不硬编码客户事实。
- 交付材料：新增正式治理说明、客户配置合同、安全清单要求和《个人信息委托处理协议》空白模板；模板不是已签署合同或上线证明。
- 验证边界：代码、自动化、真实浏览器、本地运行、目标发布和客户验收分别取证；本节仅登记当前实现合同，不把本地验证结果表述为已发布或已由客户确认。
