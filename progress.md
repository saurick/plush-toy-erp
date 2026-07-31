# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引。它是过程交接线索，不是需求、schema、migration、运行态或客户签收真源；当前事实仍须从 `docs/当前真源与交接顺序.md`、正式专题文档、代码、目标环境和绑定 exact SHA 的回执重新核对。

## 当前活跃事项

### 夜间发布门禁与 test-133

- 完成：`acc4538e8374e6ff94cb06d892e2994e8f59f7ec` 已普通推送并完成 exact-SHA `prepare-push 5387 / 5387`、GitHub CI run `30602758373` 和 Immutable Release run `30603201549`；release `2026.07.31-2` / tag `artifact-acc4538e8374e6ff94cb06d892e2994e8f59f7ec` 的 Server / Web 不可变制品已按正式 promotion 流程部署到 `customer-trial-133`。operation `f6de0aa4-c9b4-441c-a6d0-45d418546ab8` 在 fresh backup、restore rehearsal、串行 Atlas 锁和已授权 trigger / function 移除后通过，目标读回 current migration `20260730161955`、pending `0`、runtime SHA 与 OCI image ID 精确匹配；基础 Web / health / ready、`11 / 11` 登录矩阵、SMS、active config 和 PDF 技术 smoke 共 `9 / 9` 通过。
- 当前阻断与根因：目标专用 `customer-trial-133` V7 manifest 已完成离线变换和服务端 validate，但 publish 确定性返回 `40010 所选岗位当前未开启审批功能`，未进入 activate，V5 继续保持 active。目标 `rbac_options` 权威读回显示固定审批池主办岗位 `sales`、`purchase`、`finance` 仍缺少持久化 `workflow.task.approve`；当前代码的 builtin role 定义已向业务岗位附加该权限，但启动 seed 按治理约定保留旧库已选择的业务权限，且既有 migration 只前向补过 `workflow.task.reject`，因此老数据库不会自动收敛。
- 修复边界：新增一份 additive / idempotent 前向 migration，仅为已有 `business_default` 的 `sales`、`purchase`、`finance` 插入现有 `workflow.task.approve` 绑定，冲突时不写；仅对本次实际新增绑定的 role bump version / updated_at。该变更不改 schema，不删除、重写或模拟业务数据，不创建 function / trigger，也不绕过客户 entitlement、责任池、owner / assignee、任务状态 / 版本及领域动作门禁。migration SQL 与 canonical Atlas hash 已生成，但本地门禁、CI、target apply 及读回尚未完成，不能复用 `acc4538e` 的绿色或制品作最终结果。
- 下一步 / 风险：本批由唯一 Git 收口队列精确本地提交后，绑定新 clean SHA 从头重跑完整门禁、普通非强制 push、同 SHA CI / release，并只用新的不可变制品再次 promotion 到 `customer-trial-133`；fresh backup、migration plan / apply / status、V7 publish / activate / 权威读回和规定 smoke 必须全部重新取证。任何目标漂移、备份 / restore rehearsal 失败、migration 非预期、远端并发或 digest 不匹配均 fail closed。生产保持 `NOT_RUN`，客户 UAT 保持 `NOT_CLAIMED`，`4 / 4 / 3` 场景业务造数保持 `NOT_RUN`。

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

- 当前状态：完工已绑定确切包装 WIP 批次；REWORK 过账原子创建来源根批次、事件和异常任务；CLOSED 仅允许该来源链办理和补完工。Go 核心包、Node 121 项、文档 17 项、db-guard、build 与 4 个生产 Style L1 场景已有本地绿色记录。
- 下一步：先在明确授权的隔离 PostgreSQL 测试库验证，再评审 migration apply、发布和岗位 UAT。
- 阻塞 / 风险：当前没有 opt-in PostgreSQL 测试库证据；migration 未 apply，未部署、未 UAT。

## 最近完成

| 事项 | 当前结论 | 详细证据 |
| --- | --- | --- |
| 开发测试固定动作 | 固定入口与证据 staging 已收口；本次发布候选的确定性门禁漂移已最小修正，完整门禁仍待最新 clean SHA 重跑 | 下方独立小节 |
| 全局业务记录动作可发现性 | 14 类业务页面与九岗位动作入口已按“可做但未选时置灰、无权或终态隐藏”收口；保持 `hold` | 本轮完整 progress 归档 |
| V1 主链验收计划口径修正 | 文档、脚本、报告、DEV 预设和清单已统一为 V1 计划边界；保持 `hold` | 本轮完整 progress 归档 |
| 开发工作台主题切换 | 共享主题三态、刷新保持、窄屏入口与暗色 / 浅色浏览器回归已完成 | 本轮完整 progress 归档 |
| 页面与移动岗位近期收口 | 页面刷新、任务看板、移动任务文案 / 计数 / 标签、角色进度等各批次的精确结论与盲区已归档 | 本轮完整 progress 归档 |

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
