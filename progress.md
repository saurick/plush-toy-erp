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

| 事项 | 当前结论 | 详细证据 |
| --- | --- | --- |
| 共享开发库迁移终态回执 | 本地共享开发库六个入口在成功、no-op、ready、需人工动作、阻断、失败和结果未知时统一输出完整脱敏摘要；真实只读 status 为 `107 / 107`、pending `0` | 下方独立小节 |
| 共享开发库迁移主路径可操作性 | 裸旧命令已安全兼容到高层编排；登记共享库已由 `105 / 107` 一次升级到 `107 / 107`、pending `0`，备份恢复、schema / 数据 / 权限和后端运行读回均通过 | 下方独立小节 |
| 开发测试固定动作 | 固定入口与证据 staging 已收口；本次发布候选的确定性门禁漂移已最小修正，完整门禁仍待最新 clean SHA 重跑 | 下方独立小节 |
| 全局业务记录动作可发现性 | 14 类业务页面与九岗位动作入口已按“可做但未选时置灰、无权或终态隐藏”收口；保持 `hold` | 本轮完整 progress 归档 |
| V1 主链验收计划口径修正 | 文档、脚本、报告、DEV 预设和清单已统一为 V1 计划边界；保持 `hold` | 本轮完整 progress 归档 |
| 开发工作台主题切换 | 共享主题三态、刷新保持、窄屏入口与暗色 / 浅色浏览器回归已完成 | 本轮完整 progress 归档 |
| 页面与移动岗位近期收口 | 页面刷新、任务看板、移动任务文案 / 计数 / 标签、角色进度等各批次的精确结论与盲区已归档 | 本轮完整 progress 归档 |

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
