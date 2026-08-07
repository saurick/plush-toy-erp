# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引。它是过程交接线索，不是需求、schema、migration、运行态或客户签收真源；当前事实仍须从 `docs/当前真源与交接顺序.md`、正式专题文档、代码、目标环境和绑定 exact SHA 的回执重新核对。

## 当前活跃事项

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

### 客户退货与收付款场景数据补齐

- 当前状态：代码与正式文档已完成写入，目标仍是 31 个桌面页 / 52 个验收目标，以及 4 条客户退货、4 条收付款和 3 条红冲固定矩阵；完整实现与原验证计划见本轮完整 progress 归档。
- 下一步：执行静态与定向合同后，才可对登记的本地 8300 场景库运行带计划摘要的幂等补数并权威读回 `4 / 4 / 3` 矩阵和 52 个页面目标。任何正式接口、状态或关联不满足时 fail closed，不用 fixture 或页面 mock 冒充运行态。
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

- 完成：客户退货和生产订单补齐“导出筛选结果 / 列顺序”；主数据、销售订单、采购订单、采购入库、质量检验、库存台账、物料清单、出货单、委外订单和业务记录等既有入口统一改为按当前筛选读取全部严格分页结果后导出，不再把当前 20 条页面数据误称为筛选结果。导出沿用当前可见列顺序、业务可读状态 / 日期 / 引用值，并提供单飞、取消、空结果和失败反馈。
- 边界：收付款与核销原本已使用完整分页导出，保持不重复改造；生产异常处置继续只提供列顺序，不开放缺少独立业务数据边界的导出。看板、权限 / 配置、系统操作记录和纯 Workflow 任务页不机械套用该工具。
- 验证：锁定 Node `24.14.0` 下，本批 API、页面、可见字段、请求生命周期和 12 页全局合同定向执行 `250 / 250` 通过；Web 全量为 `2060 / 2064`，剩余 4 项仅来自并行中的字段联动 QA wrapper 与开发页导航 / 英文标签批次。Web 全量 ESLint、CSS stylelint 和 overall `git diff --check` 通过。
- 浏览器：复用当前外部 Style L1 服务执行生产订单刷新与客户退货手机布局场景 `2 / 2`；另以真实 Chromium 打开两个列顺序弹窗并实际下载 CSV，分别读回 `RMA-STYLE-L1` 与 `MO-STYLE-L1-20260713` 等业务内容，1440px 下页面 `scrollWidth = clientWidth = 1440`。
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

- `docs/archive/progress-2026-07-30-before-dev-testing-oneclick.md`：本活跃页收缩前的完整过程记录；原始快照为 348 行 / 81,671 bytes，SHA-256 `67b2f47e2af9a3eedcd5fb3ea6a1c737fe38667a14b41feb49f474d587c5ed2e`。
- `docs/archive/progress-2026-07-29-before-cicd-portable-image-identity.md`：OCI 镜像身份与 promotion 回执前向修复前的完整过程记录。
- `docs/archive/progress-2026-07-29-before-recent-task-closeout.md`：近期产品、业务页面、数据库与 DEV-only 工作台统一 Git 收口前的完整过程记录。
- `docs/archive/progress-2026-07-28-before-login-style-recovery.md`：登录页样式回归修正前的完整过程记录。
- 更早记录见 `docs/archive/README.md` 与 `docs/文档清单.md`。

### 本地与 133 验收数据重建闭环

- 完成：本地与 `customer-trial-133` 继续复用同一套 source-driven 验收数据实现；为两个固定生产样本补齐 `PLUSH_SEW_HAND_V1` 四工序路线、工序主数据映射、在制批次办理、逐级质检、包装确认和完工批次引用，使返工样本来自正式关联 WIP 的完工事实。无路线普通完工仍保留，但不能作为返工来源；没有放宽后端路线、质检、包装、权限、幂等或事实过账合同。
- 完成：新增固定 `test-133` 同逻辑库物理重建 controller / executor / remote lifecycle。执行前绑定已 promotion 的不可变 release、即时只读预检、逻辑库和 operation；目标端先做 fresh dump 与恢复校验，再保存旧 PostgreSQL 数据目录、初始化 fresh 物理数据代、执行 migration、一次性管理员 bootstrap、空业务基线及运行态读回。旧数据代和 backup 均保留，不自动删库、清表、down migration 或重试未知结果；migration 前恢复旧运行态须被证明，否则统一冻结为 `not_proven`。
- 完成：一次性管理员 secret 不进入 checksum、回执、日志或 steady env；目标端校验后立即读入内存并删除，传输不完整或 SSH 结果不明时执行器仍尝试固定 secret-only 清理，清理无法证明时 operation 必须为 `not_proven`。部署与客户试用手册同步区分数据库重建、造数、浏览器/PDF、岗位 smoke 和客户 UAT 证据。
- 验证：release Node 组 `945 / 945`、造数定向 `79 / 79`、数据库重建定向 `29 / 29`、pre-push receipt `16 / 16`、文档清单 `5 / 5` 通过；WIP / 返工相关 Go biz、service、data 包通过，`bash -n`、ShellCheck、严格秘密扫描（range 40 files）和 `git diff --check` 通过。`govulncheck -version` 仅获得 15 秒专用探针窗口，真实版本、可用状态、仓库或环境身份漂移仍 fail closed。
- 下一步：当前修复尚未形成 clean exact commit，因此还未重跑修复后的本地 fresh lifecycle、52 项真实浏览器/PDF 与 4 条真实写链，也未生成不可变 release。取得提交与 push 授权后，先由唯一收口 owner 精确提交，再以该 clean SHA 重跑本地生命周期；随后才允许 CI / release、133 promotion、fresh backup / 物理重建、同源造数、readiness、52 项浏览器/PDF、凭据轮换和 11 账号 smoke 串行闭环。
- 阻塞 / 风险：本批没有修改 133、没有部署、没有 stage / commit / push；现有 133 运行态和数据仍是旧版本事实。数据库重建 `passed` 也只证明 fresh 物理库、首个管理员、空业务基线和基础运行态，不证明造数、页面验收或客户签收；真实岗位客户 UAT 必须继续由人工执行并签收。

### 业务列表动作入口全局稳定性（2026-08-03）

- 完成：本小节记录当前动作稳定性口径，并替代上方“终态隐藏”的旧过程摘要。14 类正式业务选择页、生产异常子面板和共享生命周期组件统一为：同一页面 / 页签、同一角色权限下，已授权动作的目录、顺序与主动作槽位不因未选择、记录结构、业务状态、已完成、终态或保存中增删换位；不可执行项保留置灰并给出业务原因，窄屏“更多操作”可继续打开查看各动作原因。只有未授权动作，或不属于当前页面 / 页签 / 模块的动作隐藏；没有修改后端 RBAC、Workflow / Fact、schema、migration 或数据库。
- 覆盖：正式选择页清单守卫覆盖 BOM、收付款、业务记录、客户退货、出货、库存台账、主数据、委外订单、生产订单、采购订单、采购入库、质量检验、销售订单和 Workflow 业务页；九个实际岗位能力投影验证空选择、可执行记录和终态记录始终保持各自固定的已授权动作目录。生产订单截图所示的编辑、登记完工、工序、生产记录、发布、关闭和取消等入口现在在空选择时即可看见，选择不同记录只改变启用状态与原因。
- 自动验证：Web 全量 Node `2083 / 2083`、本批定向 Node `114 / 114`、全量 `src` ESLint、Vite build、文档清单 `5 / 5`、岗位投影 / 帮助手册 `14 / 14`、场景脚本语法和精确 `git diff --check` 通过。build 经 `pnpm` 运行时报告 Node `v26.5.0`，高于项目声明的 `24.14.x`，因此构建绿色不替代锁定版本发布门禁。
- 浏览器：动作稳定性 Style L1 定向 `8 / 8` 通过，覆盖销售五状态与无能力账号、采购 / 入库 / 质检代表状态、收付款普通与超级管理员收窄权限、退货 / 出货、生产异常，以及手机暗色抽屉；已实际核对销售关闭、采购关闭、财务已过账与手机抽屉截图，选择、清空选择和终态切换均不再丢失已授权入口，页面无横向溢出。
- 阻塞 / 风险：全量 Style L1 在任务外共享改动的 `dev-flow-state-observatory-workflow-graph-dark` 旧文案断言处提前失败，本批未越权修改；额外 `production-order-source-material-issue-desktop` 场景等待“生产领料”弹窗超时，但该链路使用本页第 790 行附近的领料加载和第 2055 行附近的弹窗挂载，本批生产订单改动仅位于第 1636 行之后的当前操作栏，未触碰该处理链，需作为独立浏览器盲区复核。`affected --plan` 还因共享 dirty worktree 纳入多个任务的 T8 范围，本批没有将其他任务现场包装为自身验证。
- 下一步：待相关 writer 收口后，在锁定 Node 与干净 exact SHA 上补跑全量 Style L1，并独立复核生产领料场景；当前没有 stage、commit、push、部署或客户 UAT。若用户授权提交 / 推送，仍由唯一 Git 收口 owner 按本批精确路径处理，push 前重新 fetch 并核对远端。

### 客户退货创建弹窗布局修复（2026-08-05）

- 完成：重排“新建客户退货”信息层级，桌面端将来源出货与退货单号同排，核对提示、退货原因和退货明细横跨内容区；退货明细改为有标题的分组卡片，去除所有固定像素字段宽度，桌面使用 12 列业务网格，手机使用 2 列并让产品、退货数量和备注独占整行。来源切换期间仅在当前出货核对成功后展示对应明细，避免旧来源明细短暂残留。
- 验证：锁定 Node `24.14.0` 下 Web 全量 Node `2083 / 2083`、全量 ESLint、全量 CSS stylelint、错误码同步检查、Vite production build、场景脚本语法和 `git diff --check` 通过；`affected --plan` 判定为 T0 / T5。真实 Chromium Style L1 的 1280 × 800 桌面与 390 × 844 手机场景 `2 / 2` 通过，盒模型断言覆盖同排 / 单列、全宽区块、明细无非必要横向滚动、长内容正文滚动、末项可见、固定底栏与键盘焦点恢复，并人工复核最新顶部和滚动边界截图。
- 边界 / 风险：本批只修 Web 运行态布局和回归合同，没有修改后端、schema、migration、RBAC、Workflow / Fact、原型状态或目标部署；自动化和本地浏览器证据不替代客户岗位 UAT。当前尚未 stage、commit 或 push，提交与推送等待用户确认。

### 任务详情信息精简与来源可读化（2026-08-05）

- 完成：任务详情抽屉收敛为单一“任务详情 / 审批详情”标题和来源单据、负责人、截止时间三项摘要；隐藏 `PROC-*` 技术任务号，将已知 ProcessRuntime 节点 key 转为岗位可读名称，未知技术 key 使用中性业务名称。来源统一显示为“业务类型 · 单号”，内部 ID 仍不作为单号回显。
- 完成：保留顶部状态、三步办理、相关单据入口、业务进度和本任务处理记录；桌面记录区不再重复负责人，手机端原有责任摘要保持不变。业务进度读取失败改为抽屉内短提示和“重新读取”，成功后仍只读取服务端 ProcessRuntime，不根据任务文案猜测上游节点；有正式流程的任务继续展示进度，无流程任务不强行补造上游。
- 验证：锁定 Node `24.14.0` 下 Web 全量 Node `2085 / 2085`、定向契约 `25 / 25`、全量 ESLint、全量 CSS stylelint、Vite production build、Prettier、脚本语法和精确 `git diff --check` 通过。真实 Chromium 的任务看板桌面、手机与暗色 Style L1 `3 / 3` 通过，最终桌面 / 手机回归 `2 / 2` 通过；已人工复核业务进度失败重试、成功进度、暗色处理步骤和 390px 手机端截图，无横向溢出。
- 下一步：等待用户确认是否本地提交；只有用户同时明确授权推送后，唯一 Git 收口 owner 才能在 fetch 与远端核对后推送。本轮没有 stage、commit、push、部署或客户 UAT。
- 边界 / 风险：本批未修改 API、RBAC、Workflow / Fact、schema、migration、数据库或部署；原型仍保持 `To Implement`，本轮运行态修正遵循其既有三步办理合同，没有把原型状态包装为正式验收。

### 任务业务进度读取合同修复（2026-08-05）

- 完成：修正 `get_task_process_context` 的 JSON-RPC 响应合同。普通人工任务和普通审批任务在没有正式审批表单时明确返回 `approval_form: null`，不再因 Go typed nil map 经 `structpb` 序列化为 `{}`；客户退货、财务付款、库存调整和生产异常四类正式决策审批仍返回各自审批表单对象。前端继续严格拒绝 `{}`，并以不含任务、来源或响应正文的静态信息记录“响应合同校验失败”，页面仍只显示岗位可理解的通俗提示。
- 完成：删除“只代表当前任务，不是来源单据的完整审批链”常驻说明及截断状态中的同义警告；任务处理记录只保留标题、数量、事件和必要的“更早记录未加载”提示。没有根据任务名称猜测流程节点，也没有改变 Workflow、ProcessRuntime 或 Fact 边界。
- 验证：后端真实 `protojson` 序列化测试覆盖普通人工、普通审批和四类正式决策审批；Web 定向 Node `61 / 61` 通过。共享 dirty worktree 的 affected T0 / T1 / T4 / T5 门禁通过，其中文档 `15 / 15`、Web Node `2087 / 2087`，服务端相关包、ESLint、CSS、Vite build、场景脚本语法和 `git diff --check` 均通过；任务看板桌面与手机 Style L1 `2 / 2` 通过。
- 运行态：已重建并重启本地后端，`healthz` / `readyz` 均为 HTTP 200；启动按项目既有流程执行幂等 RBAC / 管理员初始化，没有执行 migration 或人工业务数据写入。真实 Chromium 已分别复核工程资料普通人工任务、订单普通审批和客户退货正式决策审批：重新读取后均显示服务端业务进度，页面不再出现合同错误或“完整审批链”常驻文案，且未提交任何任务处理动作。
- 下一步 / 风险：当前证据仅覆盖本地 `yoyoosun` 配置和 admin 登录下的真实页面，其中四类正式审批已做后端合同覆盖、浏览器抽查客户退货一类；未部署、未做其他岗位或客户 UAT。当前没有 stage、commit 或 push，等待用户明确授权后再由唯一 Git 收口 owner 处理。

### 执行轨迹连接线布局修复（2026-08-05）

- 完成：修正任务业务进度中“执行轨迹”的桌面布局。节点圆点与连接线保留在同一行，标题和状态整体移到下一行，连接线不再穿过文字形成删除线错觉；手机端继续使用圆点在左、内容在右的竖向轨迹，没有改变节点状态、当前步骤、本任务锚点或 ProcessRuntime 展示语义。
- 回归：任务看板桌面场景新增真实盒模型断言，逐节点确认连接线与圆点中心对齐、完全位于内容上方且标题处于圆点下方；手机岗位任务端继续覆盖 390px / 430px 竖向轨迹。真实 Chromium 的任务看板桌面、响应式抽屉和手机岗位任务端 `3 / 3` 通过，并人工复核最新桌面与手机截图，无文字穿线、错位或横向溢出。
- 自动验证：定向组件 Node `9 / 9`、CSS stylelint、Prettier、场景脚本语法和 `git diff --check` 通过；共享 dirty worktree 的 affected T0 / T1 / T4 / T5 门禁通过，其中文档 `15 / 15`、服务端相关包和 Web Node `2087 / 2087` 均通过，Vite production build 完成 `3352` 个模块。
- 边界 / 风险：本批只改共享轨迹 CSS、对应 Style L1 几何回归和过程记录；没有修改组件业务结构、API、RBAC、Workflow / Fact、schema、migration 或数据库。`workflow-task-action-flow-v1` 原型仍为 `To Implement`，此次是运行态局部样式纠正，不改原型承诺或状态；未部署、未做客户 UAT，且当前没有 stage、commit 或 push。

### 移动任务三步页面信息精简（2026-08-05）

- 完成：三步条只保留“查看任务 / 处理任务 / 结果回执”单行名称。详情页把状态、责任岗位和截止时间集中到任务摘要，“业务信息”只显示有值的独立业务字段，单数末项横跨整行；主来源不再复制成关联卡，只有额外单据存在时才显示“相关单据”，处理记录不重复责任摘要，只读页不再保留底部“返回列表”。
- 完成：处理页只保留防止办错所需的任务名和来源；多动作保留原生单选，单动作只显示“本次操作”，移除选择说明、重复返回入口和长边界说明，底部只保留本次提交命令。回执页只展示可信结果、任务身份和必要留痕，步骤条负责回看任务，底部只保留“返回列表”；Current 原型和三步测试合同已同步。
- 验证：定向 Node `118 / 118`、Web 全量 Node `2088 / 2088`、全量 ESLint / CSS stylelint、精确 Prettier、Vite production build（`3352` modules）和 `git diff --check` 通过。真实 Chromium Style L1 的九岗位投影、仅催办、只读和暗色 `4 / 4` 通过，覆盖 390 / 430、单动作 / 多动作、单数业务字段、底部唯一动作和暗色按钮宽度；已人工复核详情、处理、回执及暗色截图，无半格空白、按钮截断或横向溢出。
- 边界 / 风险：本批未修改后端 API、RBAC、Workflow / Fact、schema、migration、数据库或部署；本地浏览器证据不替代客户岗位 UAT。构建使用本机 Node `v26.5.0`，高于项目声明的 `24.14.x`，绿色结果不替代锁定版本发布门禁；当前没有 stage、commit 或 push，等待用户明确授权。

### 手机与电脑工作入口对称切换（2026-08-05）

- 完成：移动端“我的”将笼统的“可用范围 / 按岗位开放”改为当前账号真实可用的工作入口；同时具备两类入口时显示“电脑端 / 手机待办”，仅有手机待办时显示“手机待办”。有电脑端权限的账号只在“入口与安全”保留一个带文字的“切换工作入口”，统一返回 `/entry` 选择页；页头重复的图标快捷方式和直达电脑端分支已删除。
- 完成：电脑端页头对已获手机岗位入口权限的账号新增同名“切换工作入口”，复用既有离页保护后进入统一选择页；没有手机岗位入口权限时不显示无效按钮。Current 移动岗位原型说明与可直接打开的实现参考已同步同一口径，入口资格仍由现有菜单投影、岗位权限和运行配置决定，没有在前端放宽 RBAC。
- 验证：锁定 Node `24.14.0` 下，入口配置 / 会话 / Current 原型定向 Node `37 / 37`、Web 全量 Node `2088 / 2088`、全量 ESLint、全量 CSS stylelint、Vite production build（`3352` modules）、场景脚本语法和 `git diff --check` 通过。真实 Chromium 的对称切换与暗色移动端场景 `2 / 2` 通过，实际完成“手机待办 → 统一选择页 → 电脑端 → 统一选择页 → 手机待办”往返；人工复核 390 × 844 移动端、1440 × 900 电脑端和暗色截图，无重复入口按钮、横向溢出或文字截断。
- 边界 / 风险：affected 计划因全局电脑端壳判定为 T0 / T1 / T5 / T8；T0 已通过，相关 T5 已完成，但 T8 完整门禁在执行测试前因未配置隔离数据库基地址 `DISPOSABLE_DATABASE_BASE_URL` 按设计 fail closed，因此未形成完整发布回执。本批没有 schema、migration、数据库、部署或客户 UAT，也没有 stage、commit 或 push；提交与推送等待用户明确确认。

### 电脑端工作入口收进账号菜单（2026-08-05）

- 完成：电脑端页头移除常驻的“切换工作入口”和独立退出按钮，保留可识别当前账号的账号按钮；点击后统一展示低频的“切换工作入口”和“退出登录”。只有确实拥有手机岗位入口的账号才显示切换项，切换仍复用离页保护并返回 `/entry`，没有改变入口资格或 RBAC。
- 交互：账号菜单支持点击与键盘 Enter 打开、Escape 关闭并把焦点还给触发按钮；1440 × 900 下菜单和账号按钮均在视口内且页面无横向溢出。移动端保持“我的 → 入口与安全”的完整文字按钮，不新增页头快捷切换，也不把低频功能缩成语义不清的单独图标。
- 验证：锁定 Node `24.14.0` 下，本次四个受影响非过程文件的 T0 / T1 / T5 affected 门禁全部通过，其中文档合同 `15 / 15`、Web 全量 Node `2088 / 2088`；全量 ESLint、CSS stylelint、精确 Prettier、Vite production build（`3352` modules）、场景脚本语法和 `git diff --check` 通过。真实 Chromium 定向场景完成“手机待办 → 选择页 → 电脑端账号菜单 → 选择页 → 手机待办”往返，并人工复核最新桌面菜单展开态和 390 × 844 移动端截图。
- 边界 / 风险：本次只调整电脑端入口呈现及其回归合同和 Current 原型说明，未修改移动端既有切换逻辑、后端、schema、migration、数据库、部署或客户 UAT；当前没有 stage、commit 或 push，提交与推送等待用户明确确认。

### 任务附件入口统一与信息降噪（2026-08-05）

- 完成：电脑端任务 / 审批详情抽屉补齐任务附件次要动作，移动端将独立“任务附件”大卡收进任务摘要。两端共用同一附件弹窗和权限入口：已有附件显示“附件（N）”，可上传空态显示“添加附件”，只读空态显示“查看附件”；附件更新后关闭弹窗会刷新数量，过期请求不会覆盖当前任务。
- 降噪：弹窗外层保留“任务附件”，内层改为“附件内容”，说明只保留“上传 / 查看照片、异常截图或处理凭证”，删除重复标题和长边界文案。旧 `evidence_refs` 仍只作为“历史处理线索”单独只读展示，不与真实附件混称；Current 移动任务 v2 原型和人工评审路径已同步。
- 验证：本批定向 Node `35 / 35`、Web 全量 Node `2090 / 2090`、全量 ESLint / CSS stylelint、Vite production build（`3352` modules）、原型内联脚本语法、场景脚本语法和 `git diff --check` 通过。真实 Chromium Style L1 的电脑任务看板、移动端仅催办只读角色和移动端暗色可上传任务 `3 / 3` 通过，已人工复核数量入口、桌面弹窗、移动只读弹窗和暗色上传弹窗，无重复标题、横向溢出或不可见交互。本机 Node `v26.5.0` 高于项目声明的 `24.14.x`，绿色结果不替代锁定版本发布门禁。
- 存储边界：本批没有改变附件存储架构。当前任务附件仍以 `owner_type = workflow_task` / `owner_id = task.id` 绑定，元数据和文件字节共同保存在 PostgreSQL `business_attachments`，前端上传上限保持 5 MB；没有改为本地目录、NAS 或对象存储，也没有修改 schema / migration。
- 阻塞 / 风险：额外执行的 `scripts/qa/workflow-fact-boundary.test.mjs` 为 `5 / 6`，唯一失败是既有守卫仍期待已按上一批需求删除的“请勿将本视图当作完整审批链”文案，不在本批精确路径内，本批未越权改写。当前未 stage、commit、push、部署或客户 UAT；提交与推送等待用户明确授权。

### 任务看板空搜索框焦点边界修复（2026-08-05）

- 完成：定位到 Ant Design 组合搜索框获得焦点时，左侧 affix 单独绘制 `2px inset` 焦点阴影，造成空值占位态出现矩形绿框和内部绿竖线。共享 `control-focus.css` 现在由整个 Search 外框绘制连续圆角焦点环，左侧 affix 不再单独绘制阴影或焦点色分隔；普通输入框继续沿用原有共享焦点规则。
- 回归：任务看板 Style L1 新增空值聚焦 DOM / 盒模型 / 计算样式断言，以及空值聚焦和有值聚焦相邻筛选区截图；共享焦点扫描改为把 `.ant-input-search` 视为组合控件 owner，并读取其真实外层焦点环。真实 Chromium 的桌面、390px 移动端和暗色任务看板 `3 / 3` 通过，人工复核空值截图为完整圆角绿环、正常灰色按钮分隔，无内部绿竖线；输入内容后清空图标、搜索按钮和相邻筛选无错位。
- 验证：锁定 Node `24.14.0` 下 Web 全量 Node `2090 / 2090`、全量源码 ESLint、全量 CSS stylelint、受影响 L1 脚本 ESLint、Prettier、脚本语法和精确 `git diff --check` 通过。修复前同一浏览器断言按预期失败，并明确读回左侧 affix 的独立 inset 阴影；修复后同场景通过。
- 下一步 / 边界：本批只调整共享 Search 焦点呈现和浏览器回归，不修改页面业务语义、API、RBAC、菜单、Workflow / Fact、schema、migration、数据库或部署。`task-command-center-v1` 原型仍为 `To Implement`，本次局部焦点修复不改变其结构、交互承诺或状态，因此未改原型文件；当前未 stage、commit、push 或客户 UAT，等待用户明确确认后再处理提交或推送。

### 任务看板搜索框共享控件纠正（2026-08-05）

- 纠正：本节替代上一节关于“继续保留组合搜索框并给完整外框叠加焦点伪层”的结论。真实浏览器对照确认，任务看板是正式业务搜索中唯一直接使用 `Input.Search` 的页面，而其他业务列表统一使用共享 `SearchInput`：普通 `Input`、搜索前缀和单一 affix wrapper。上一版为 `.ant-input-search` 增加 `z-index: 2` 的 `::after` 覆盖层会遮到空值输入区域，已完整撤销；共享焦点扫描也恢复由 affix wrapper 作为 owner，不再为组合搜索框读取伪层。
- 完成：任务筛选行改用现有 `SearchInput / SelectFilter / ToolbarButton`，可见占位缩短为“搜索任务”，完整范围保留在 `aria-label` 与 `title` 的“可搜索：任务、单号、来源、处理原因”；输入草稿、清空、Enter 搜索、URL 筛选和禁用状态保持原行为。搜索框不再生成右侧搜索按钮，并为不在 `.erp-business-page-layout` 内的任务筛选区映射现有业务控件变量，使搜索、下拉和清空按钮统一为 36px，桌面两行与手机整行布局均保持对齐。
- 浏览器：锁定 Node `24.14.0` 下真实 Chromium 的任务看板桌面、单岗位桌面、390px 手机和暗色宽屏 `4 / 4` 通过，桌面空值场景随后单独复跑 `1 / 1`。断言确认输入为当前 active element、选区起点为 0、caret color 非透明，搜索前缀位于输入起点之前；DOM 不含 `.ant-input-search` 或搜索按钮，affix wrapper 直接绘制 inset 焦点环且没有 `::after` 内容，六个筛选控件均为 36px。已人工复核空值聚焦、输入后相邻筛选和手机筛选截图，无内部竖线、遮挡、错位或横向溢出。
- 验证 / 边界：Web 全量 Node `2095 / 2095`、全量 ESLint、全量 CSS stylelint、Prettier、场景脚本语法和精确 `git diff --check` 通过；测试前置错误码生成没有内容差异。本批未修改后端、API、RBAC、菜单、Workflow / Fact、schema、migration、数据库、部署或原型文件；`task-command-center-v1` 仍为 `To Implement`。当前没有 stage、commit 或 push，提交与推送等待用户分别明确确认。

### 移动待办筛选局部加载修复（2026-08-05）

- 根因 / 完成：移动端“全部、审批、风险、超时”分别读取独立的服务端游标视图；旧实现却把每个未加载视图都当作整页首次加载，导致切换冷筛选时用全屏骨架替换概览、筛选栏和列表。现在仅真正首次进入页面使用整页骨架；任一视图已加载后，切换冷筛选会保留概览、筛选栏和底栏，只在任务列表框内显示对应加载提示与 `aria-busy`，切回已加载视图直接复用缓存。
- 回归：新增源合同锁定首次加载与局部加载的分层，并在 `mobile-tasks-dark` 的 1300ms 延迟窗口内断言筛选立即选中、稳定 DOM 节点未重建、路径 / history / navigation entry 未变化、整页骨架未出现、仅任务列表忙碌、审批请求仅一次；审批完成后切回“全部”不重复请求 todo。真实 Chromium 的 390px 暗色与 430px 岗位投影 `2 / 2` 通过，人工复核加载中与完成截图无布局跳动、横向溢出或底栏遮挡。
- 验证：锁定 Node `24.14.0` 下定向 Node `60 / 60`、受影响 T0 / T5、Web 全量 ESLint、Web 全量 Node `2097 / 2097`、Prettier、场景语法和 `git diff --check` 通过；测试前置错误码生成没有内容差异。Current 移动岗位原型已核对且本次行为修正符合既有局部更新合同，因此未改原型文件。
- 边界 / 风险：本批只修移动端列表加载层级和回归合同，保留既有服务端独立视图、RBAC 与缓存语义；未修改 API、Workflow / Fact、schema、migration、数据库或部署，本地自动化和浏览器证据不替代客户岗位 UAT。当前没有 stage、commit 或 push，提交与推送等待用户分别明确确认。

### 附件上传者文案业务化（2026-08-05）

- 完成：附件审计元数据将“上传账号”统一改为“上传人”，有记录时显示服务端返回的真实账号（例如 `上传人：demo_boss`），历史缺失身份显示“上传人：未记录”；不根据账号推断角色，也未改变 `uploaded_by` / `uploaded_by_username`、上传时间或撤销审计字段。
- 验证：锁定 Node `24.14.0` 下展示函数定向 Node `2 / 2`、共享浏览器断言语法、Prettier、精确 `git diff --check` 和“上传账号”残留扫描通过；附件撤销批次改写共享断言后已按最新 SHA 重跑同组静态验证。真实 Chromium 的任务看板桌面场景 `erp-task-board-desktop` 为 `1 / 1`，最新附件弹窗截图确认已保存的 `style-l1-evidence.txt` 显示“上传人：demo_boss”。
- 边界 / 风险：`business-core-pages-desktop` 额外回归在进入附件步骤前因既有 Workflow 页面找不到“待办任务”而失败，未作为本批附件证据；本批已有更聚焦的任务附件场景和截图。未修改后端、API、RBAC、Workflow / Fact、schema、migration、数据库或角色语义，也未 stage、commit、push、部署或完成客户 UAT；提交与推送等待用户明确确认。

### Git 收口队列锁域与等待治理（2026-08-05）

- 完成：Git 收口队列升级为 protocol 3，明确 Local 文件 writer、Git index / commit 与 push 为独立锁域；孤立 `index.lock` 默认只冻结 Git lane，不再自动暂停或撤销文件 writer。独立顶层写任务需要真并行时使用 Worktree，共享 Local 仍保持单 writer，避免热点文件互相覆盖。
- 恢复：新增 optional-lock-free 只读快照脚本，统一以 `GIT_OPTIONAL_LOCKS=0` 报告 HEAD、worktree、index 和锁身份；worker 只上报一次 `INDEX_LOCK_OBSERVED` 并结束当前 turn，队列按 lock path / inode / mtime 去重，集中复核、询问一次并恢复原 owner 与队序。收到 `WAIT_*` 后不再轮询或持续播报，由 release / cancelled / ready 事件唤醒。
- 验证：真实仓库无锁快照与隔离临时仓库锁存在合同通过，后者正确读回 inode、零字节大小和无 holder；`bash -n`、ShellCheck、affected T0 / T1、文档合同 `15 / 15`、Skill 合同 `4 / 4`、项目 Skill health、AGENTS 体积门禁和 `git diff --check` 全部通过。系统 Skill Creator 的 Python validator 因当前解释器缺少 PyYAML 未能启动，仓库自己的 metadata、索引和引用门禁已通过。
- 边界 / 下一步：本批只修改协作规则、Git 收口 Skill、只读脚本、metadata、回归合同和本过程记录，不改业务代码、schema、migration、数据库或部署；protocol 3 只有精确本地提交进入 HEAD 后才正式生效。当前没有 stage、commit 或 push，提交与推送等待用户分别明确确认。

### 业务附件受控撤销闭环（2026-08-05）

- 完成：统一全部业务附件入口的纠错语义。尚未上传的本地文件继续使用“移除”，产品图片继续使用“替换 / 清空”；普通已保存证据统一提供必须填写原因的单向“撤销附件”，撤销后保留文件名、上传人 / 时间及首次撤销账号 / 时间 / 原因，不提供物理删除、恢复、预览或下载。桌面业务弹窗、Workflow 抽屉、手机任务及业务列表入口已按各自 RBAC 和业务状态接入，只有无权限时隐藏动作，已撤销时保持置灰。
- 后端：`business_attachments` 新增 `withdrawn_at / withdrawn_by / withdrawal_reason` 字段束、约束和索引；受控 repository 事务锁定 owner 与附件，Workflow 撤销会复核任务版本、终态、责任岗位 / 经办人，精确同操作者同原因重试返回首次回执，其他重复撤销冲突。JSON-RPC 仅开放 `withdraw_attachment`，旧 `delete_attachment` 继续按未知方法拒绝；撤销内容读取 fail closed。已执行一次 `make data`，纳入 Ent 生成物、Atlas migration `20260805100506_migrate.sql`、`atlas.sum` 与 Schema 文档投影，没有 apply 数据库。
- 验证：锁定 Node `24.14.0` 下 Web 全量 Node `2098 / 2098`、定向附件 Node `10 / 10`、全量 ESLint、Prettier、脚本语法和 `git diff --check` 通过；Go `internal/biz`、`internal/data`、`internal/service` 通过，`db-guard`、Schema 文档零漂移、Schema 测试和 Atlas migration validate 通过。真实 Chromium 定向完成“打开任务附件 → 填写原因 → 撤销 → 核对审计与禁用动作”，并人工复核撤销前、确认和撤销后三张截图；关联的移动任务、采购入库列控制及产品图片桌面 / 手机 / BOM 打印 Style L1 `5 / 5` 通过。
- 下一步 / 边界：共享 `affected --run` 的 T0 检查均通过，但 T8 full 在测试前因缺少隔离库基地址 `DISPOSABLE_DATABASE_BASE_URL` 按设计 fail closed；四个 PostgreSQL 并发子测也因未配置 `PURCHASE_RECEIPT_PG_TEST=1` 与 `PURCHASE_RECEIPT_PG_TEST_DB_URL` 跳过。完整 `business-core` 与出货无权限共享场景在附件步骤前被既有“待办任务”文案断言阻断，不作为本批附件证据；定向真实浏览器链路已通过。后续需在隔离数据库补跑 full / PostgreSQL 并发测试并完成客户岗位 UAT；本批未连接或 apply 目标数据库、未部署，也未 stage、commit 或 push。

### 移动待办筛选首屏总数修复（2026-08-05）

- 根因 / 完成：旧页面把“全部 / 审批 / 风险 / 超时”显示值绑定到四个独立游标视图的本地已加载数组，未点击的冷页签因此被误报为 0，“全部”也只是首批已加载数量。现在首次无游标 `list_role_tasks` 响应会在同一只读一致性快照中返回当前账号、岗位、客户配置版本与审批能力范围内的四项服务端总数；后续游标页和电脑工作台接口不重复返回总数，审批权限缺失时审批总数为 0，主管风险总数继续遵循既有跨岗位可见性。
- 页面 / 交互：首屏读取成功即显示完整总数，不再等待逐个点击页签；总数未知或响应不可信时显示“—”而不是伪装成 0，并为筛选按钮提供“共 N 条”的可访问名称。顶部“已加载任务分布”继续只汇总浏览器已加载任务。任务处理成功后会失效旧请求、立即合并服务端返回的任务结果，再重新读取首屏总数并恢复原已加载分页深度，避免本地加减造成长期漂移。
- 验证：定向 Node `96 / 96`、Web 全量 Node `2101 / 2101`、Go `internal/core/...`、`internal/biz`、`internal/data`、`internal/service`、`internal/server`、全量 ESLint、前后端 production build、affected 文档 `15 / 15`、direct `41 / 41` 和 `git diff --check` 通过。真实 Chromium 的九岗位手机 / iPad 登录路由 smoke 全部通过；暗色移动待办与无审批工程岗位 Style L1 `2 / 2` 通过，截图确认首屏总数可大于当前渲染卡片数、切换审批仅局部加载且总数保持不变，390 / 430px 无横向溢出。
- 下一步 / 边界：T7 PostgreSQL 门禁因未配置明确的隔离库基地址 `DISPOSABLE_DATABASE_BASE_URL` 而未启动，没有连接、创建、迁移或写入任何数据库；后续取得隔离库地址后应补跑该门禁。本批没有 schema / migration、部署或客户岗位 UAT，也没有 stage、commit 或 push；本地提交与推送继续分别等待用户明确授权。

### 需求主动闭环与复杂度治理（2026-08-05）

- 完成：在项目规则和《模块实施治理》中明确“甲方需求是业务输入，不是完整软件规格”；研发负责补齐真源、生命周期、权限、异常恢复和验证，产品负责低风险可逆默认，只有客户业务、岗位 / 权限与数据隔离、财务税务、真实数据 / 外部参与者及合同合规 / 不可逆选择留给甲方决定。未确认项必须带推荐方案、安全行为、精确阻塞范围、跟进角色和触发点，只阻塞对应高风险或偏离分支。
- 复杂度：闭环定义为“当前承诺范围内最小但完整”，不等于一次做完整 ERP。新增表 / 字段、状态、配置层、后台任务、动态流程、规则引擎、客户分支、fallback、alias、双写或中间层前，必须证明现有能力不足、比较更简单可逆方案、说明维护与验证成本和退出条件；不为未来可能需求预埋兼容。
- 台账：产品能力成熟度与客户发布 / UAT 分轴记账；未闭环原因拆成产品决策、甲方决策、实现缺口、环境证据、客户验收、外部输入和范围外。永绅 16 个待决问题已按剩余拍板责任重写为 1 个产品决定、6 个甲方决定、9 个混合项，并逐项给出产品基线、未确认时行为、仅阻塞范围和跟进触发；假设登记与决策日志同步同一转化规则。
- 验证 / 边界：AGENTS 体积门禁、文档清单 / 链接、受影响文档测试和精确 `git diff --check` 通过；`workflow-fact-boundary` 本批相关的台账状态合同已恢复，剩余 1 项失败来自并行任务删除旧“完整审批链”提示的未收口断言，不在本批路径。本批只改治理与台账，不修改 runtime、schema、migration、API、RBAC、数据库、部署或客户 UAT，也未 stage、commit 或 push。

### 移动待办已加载分布布局微调（2026-08-05）

- 根因 / 完成：顶部“已加载任务分布”的四个只读统计项原先只有 `66px` 最小高度，没有垂直居中约束，数字与标签整体偏上并在下方留下更多空白；现在收紧为 `56px`，并使用纵向 flex 居中，让四列的上下留白均衡且整体更紧凑，保留原有标签、语义色和已加载数量口径。
- 回归：共享移动任务浏览器断言新增 computed style 与盒模型读回，锁定 column flex、水平 / 垂直居中、`56px` 高度、上下留白差、标签单行完整和无横向溢出，防止后续样式调整重新造成偏移或松散。
- 验证：锁定 Node `24.14.0`、pnpm `10.13.1` 下，目标 Prettier、脚本语法、目标及全量 ESLint、全量 CSS stylelint 和 Web 全量 Node `2101 / 2101` 通过；真实 Chromium 的 `mobile-yoyo-role-task-projection` 与 `mobile-tasks-dark` Style L1 `2 / 2` 通过，人工复核 430px 亮色和 390px 暗色截图，统计区、大数字、筛选区与相邻任务列表均无错位或横向溢出。
- 下一步 / 边界：Current `mobile-role-tasks-v1` 原型的结构和业务语义仍然准确，因此未机械修改原型；本批没有修改 API、RBAC、菜单、Workflow / Fact、schema、migration、客户逻辑、数据库或部署，也未完成客户岗位 UAT，未 stage、commit 或 push。

### 九岗位任务数量守恒闭环（2026-08-06）

- 完成：岗位任务状态统一由 `workflow_tasks` 权威投影，固定满足 `todo = ready + blocked`、`history = done + rejected`、`total = todo + history`；审批、风险和超时是可重叠关注项，不参与状态相加，且 `overdue <= risk`。后端 repository、JSON-RPC 和前端 wrapper 均对完整计数合同 fail closed；风险范围按有效 `workflow.task.supervise` 权限投影为当前岗位或可监督跨岗范围，不再按老板、PMC 等角色名硬编码。
- 一致性 / 页面：首屏计数与列表在既有 PostgreSQL 只读 `REPEATABLE READ` 快照内读取，版本化游标绑定方法、岗位、视图、风险范围、快照和累计数量，普通分页漂移直接拒绝；浏览器按岗位与视图分别保存权威计数快照，任务变更后统一失效。移动端“当前岗位任务状态”、全部 / 审批 / 风险 / 超时和已办均读取服务端口径，主管显示“跨岗风险”，超时使用服务端时间，未知或不可信时显示“—”而不是已加载数组长度。
- 自动约束：新增九岗位状态矩阵、350 条以上分页、状态守恒、重复任务、分页闭合、游标越界 / 漂移、权限风险范围和只读快照并发测试；affected 现有门禁会把数量合同相关后端、前端和浏览器路径升级到 PostgreSQL 与真实浏览器验证，没有新增一套 Git hook。锁定 Node `24.14.0` 下定向 Node `153 / 153`、Web 全量 `2100 / 2100`、ESLint、CSS stylelint、Prettier、Vite production build（`3352` modules）、affected `31 / 31`、九岗位手机 / iPad 登录 smoke 和 Style L1 `2 / 2` 通过；人工复核 390px 暗色与 430px 岗位截图无数量矛盾、截断或横向溢出。
- 文档 / 边界：现有《业务公式与计算口径》《自动化测试策略》《业务主链路数据流向与字段来源规则》、能力台账、Web README 和 Current 原型说明已同步，没有另建重复文档。未引入 schema、migration、数据库 trigger、投影 revision 表、长生命周期游标会话或新的 hook 架构；严格跨请求 MVCC / 物化 ID 会显著增加复杂度，本批按约定不做。
- 阻塞 / 下一步：`internal/biz` 可编译，但 `internal/data` 与 `internal/service` 的 Go / PostgreSQL 数量测试在编译前被共享现场另一批次尚未生成的 `ent/reworkintake`、`ent/reworkintakeitem` 包阻断，因此 PostgreSQL T7 不能记为通过；待该批完成 `make data` 后应重跑 Go 定向和隔离 PostgreSQL 门禁。文档清单测试本批相关合同通过，整库链接检查另被同一并行删除 `sales_return` schema 后尚未同步的两条链接阻断。本批未连接或 apply 数据库、未部署、未完成客户岗位 UAT，也未 stage、commit 或 push。

### Codex 输入归属、客户范围与变更追溯治理（2026-08-06）

- 来源 / 客户：只有项目负责人在 Codex 会话中明确标注甲方提出、要求、反馈或确认时才记为客户输入；未标注内容归产品 / 研发与 AI。当前裸“甲方”指 `yoyoosun`，明确客户名称或 key 时仅归该客户，多客户歧义不得跨会话猜测。
- 闭环 / 易用性：模糊输入仍由产品 / 研发主动形成可修改的最小完整闭环，基础业务文案、可信自动带值、合理默认、错误恢复和响应式等易用性随主链完成；会改变业务行为或引入持续运行成本的批量动作、提醒、定时及自动分配 / 放行 / 生成事实单独过复杂度门禁。
- 追溯 / 复杂度：复用需求线索、问题待办、假设登记、决策日志和正式实现真源，明确区分甲方初始输入、产品 / 研发闭环和甲方后续修改。普通正确性、易用性和纯技术修复不逐项留档；只有重要长期选择或已确认 / 已实施行为变化才追加决策、替代关系、客户范围、生效范围和历史处理，不新增 Change 模块、每会话文档、配置引擎或平行台账。
- 验证 / 边界：AGENTS 体积门禁（`16278 bytes`）、Phase 标签边界、角色手册合同和精确 `git diff --check` 通过；文档链接门禁本批目标链接通过，整库仍被并行删除 `sales_return` schema 后未同步的两条既有链接阻断。本批只修改治理文档，不改 runtime、schema、migration、API、RBAC、数据库、部署或客户 UAT，也未 stage、commit 或 push。

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
- 验证：`git diff --check`、开发测试文档解析 `20 / 20`、永绅角色与流程手册合同 `10 / 10`、阶段编号边界测试 `3 / 3` 与全仓扫描、项目 Skill health（11 个 Skill）通过。文档清单确认 303 份 Markdown 均已登记；整库链接检查仍被并行删除 `sales_return` schema 后未同步的两条既有链接阻断，本批未越权改写对应业务迁移现场。
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

### Writer turn 租约与漏释放恢复（2026-08-06）

- 根因：共享 Local 中曾有任务完成文件写入并结束 turn，却漏发 `WRITER_RELEASED`；队列继续把旧 grant 当作活动 writer，造成后续任务错误等待。现场 index 为空、无 `index.lock`，因此不是 Git 锁故障。
- 修正：writer grant 只绑定收到授权的当前 `inProgress` turn 与连续写入阶段；进入只读验证、最终回复或 turn 结束前必须释放，恢复任务、验证后补写或新 turn 必须重新申请。队列在同一 wake 复核 owner；`idle`、`notLoaded`、completed、error、cancelled 或 turn 不匹配时按 `TURN_ENDED` 失效并继续放行。漏报写入记为 `UNREPORTED_WRITES`、保留现场但不续租；只有重叠归属无法隔离时才进入 `WAIT_HOT_FILE`。
- 门禁 / 验证：AGENTS 合同、队列 Skill 生命周期和 `skill-health` 静态守卫已同步；项目 Skill health、回归测试 `5 / 5`、文档合同 `20 / 20`、affected、AGENTS 体积与 `git diff --check` 通过。系统 Python quick validator 因环境缺少 `PyYAML` 未运行，仓库内 YAML、metadata、引用与 Skill validator 已通过。
- 边界：本批只修改协调规则、Skill、静态门禁和本节过程记录；不改变业务、schema、migration、数据库或发布。规则只有精确批次提交进入 HEAD 后才正式生效；当前未 stage、commit 或 push。
