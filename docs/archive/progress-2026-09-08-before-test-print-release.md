# 打印修复测试环境发布前历史过程归档 / Progress Archive Before Print Test Release

本页保存从 `progress.md` 移出的 2026-08-06 至 2026-08-29 已完成事项。内容用于历史追溯，不能替代当前代码、CI 或目标环境证据。

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

### 被动 Git handoff record 治理（2026-08-30）

- 完成：项目内 Goal、实现、文档、测试、诊断、运行与发布准备任务统一各自完成业务切片、验证和必要回滚；只要留下仓库改动，收口时只输出一份被动 `Git handoff record`，不登记或调度其他任务。
- 记录：只交接精确文件 / hunk、建议 commit 分组、简体中文提交意图、已完成与未完成验证、外部脏文件排除项及 commit / push 授权状态；它不保存跨会话状态，也不等于 Git 授权。
- 安全：首次写入和收口都读取实时 HEAD、index、`index.lock`、status 与 scoped diff；普通单 writer 直接按精确范围工作，真实并发、混合 hunk 或 index 冲突只临时串行当前动作，无法证明安全即停止并报告。
- 边界：旧的任务调度与租约机制及其项目 / 全局 Skill、脚本、metadata 和测试已移除；全局 Git 收口只在用户明确要求 commit 或 push 时一次性读取实时现场。本批未处理业务、schema、migration、数据库、运行资源或发布，也未 stage、commit 或 push。

### 个人信息告知与系统使用规则（2026-08-11）

- 产品闭环：后台登录、短信验证码登录、桌面端账号菜单与移动端“入口与安全”均提供隐私告知和系统使用规则入口；登录后的当前账号按“版本 + 内容指纹”完成“已阅读并知悉”，规则变化后需要重新阅读。
- 证据边界：知悉回执复用追加式运行审计事件，不新增业务表；只记录账号标识、规则版本、内容指纹和时间，不记录密码、验证码、令牌、手机号或业务个人信息。“已阅读并知悉”不替代具体业务场景所需的单独同意或客户与实施方之间的合同。
- 配置边界：个人信息处理者、联系渠道、部署区域、跨境状态、保存期限和第三方处理者均由客户运行配置提供，Product Core 不硬编码客户事实。
- 交付材料：新增正式治理说明、客户配置合同、安全清单要求和《个人信息委托处理协议》空白模板；模板不是已签署合同或上线证明。
- 验证边界：代码、自动化、真实浏览器、本地运行、目标发布和客户验收分别取证；本节仅登记当前实现合同，不把本地验证结果表述为已发布或已由客户确认。

### 133 试用环境固定公开测试凭据（2026-08-24）

- 根因：`customer-trial-133` 的凭据合同曾从固定公开测试密码改为本机 Keychain 外部秘密，发布后的受控轮换因此把目标库内 `admin` 和 10 个 `uat_*` 账号改成了只有部署机知道的随机值；这是部署凭据真源漂移，不是数据库自行改密。
- 当前合同：133 作为甲方反复测试的公开试用目标，固定使用 `admin / adminadmin` 与全部 `uat_* / 12345678`。两类密码由版本化合同唯一提供，部署、轮换、smoke、场景数据和人工验收账号清单不得再从环境变量或 Keychain 覆盖；生产目标仍禁止使用该简单密码合同。
- 防复发：133 轮换器只接受合同中的精确固定值，并继续绑定 exact release、migration、操作 UUID、预轮换备份及确认串；Go 侧再次校验目标、账号集合与固定值，避免旧脚本、外部秘密或误配置静默改写 11 个账号。
- 验证边界：已完成凭据轮换命令、release evidence、smoke、账号投影和浏览器入口的定向自动化验证；正式发布仍必须把同一 clean exact SHA 部署到 133，再以目标 `health / ready` 和 11 账号脱敏登录矩阵证明运行态，不能用本地绿色代替目标证据。当前仍处开发测试期，该读回不等于甲方 UAT 或签收。

### 订单商业条件与交付物流字段最小闭环（2026-08-24）

- 页面 / 字段：在既有客户、供应商、产品、销售订单、采购订单和出货页面补齐订单数量、单价、行金额、税费、报价运费条件、收货快照、采购结算与发票偏好，以及出货运输、包装、唛头和实际运费字段；继续使用原菜单、权限和“单头 → 附件 → 明细”弹窗结构，没有新增菜单、页面或第二套流程。
- 真源 / 逻辑：客户和供应商档案只提供新单默认值，订单与出货保存各自冻结快照；销售金额由后端按明细唯一计算，草稿允许价格暂缺但提交 / 生效前必须完整；实际运费只属于出货事实，不自动生成应付、付款或其他财务事实。来源切换、取消税率和不需要发票时同步清理依赖残值，历史记录缺值保持未填写，不猜测回填。
- Schema / 文档：新增一条仅增加可空列与约束的 Atlas migration，完成 Ent 生成、`atlas.sum`、数据字典、业务公式、订单采购与主数据边界文档同步；migration 尚未连接或 apply 任何数据库，也未发布或部署。
- 验证 / 边界：Go `internal/biz`、`internal/service`、`internal/data` 定向包，前端 Node `130 / 130`、目标 ESLint、Schema / 文档 `7 / 7`、Vite production build（`3391` modules）、`make data`、`scripts/qa/db-guard.sh` 与 `git diff --check` 通过。当前无可复用本地运行服务，未做真实浏览器回归；高成本 full / strict、Style L1、PostgreSQL migration smoke、客户 UAT 均未执行，也未 stage、commit 或 push。

### R640 CI DAG 与不可变发布复用收口（2026-08-29）

- 性能根因：优化前 R640 普通 main pipeline 的关键路径是单个 `quality` job，两个连续样本约为 13.5 分钟，其中 quality 约 13.1–13.4 分钟；Node contracts、resource-sensitive、Server/PostgreSQL、Web 和 browser 虽有独立资源边界，仍被单 job 串行包装。
- CI 合同：main push 改为 `plan → prepare → 七分片 DAG → quality_aggregate → CI Gate`。七个分片精确覆盖 static、Node、Web、Server/PostgreSQL、resource-sensitive、browser 和 security；仍要求全阶段并集、非零执行、零 skip、source archive、依赖审计、`make data`、Web build digest 和 PostgreSQL/Chromium/browser 清理读回。MR 保留 affected，不为提速减少测试。
- 资源与缓存：Runner 重建合同固定 12 vCPU、24 GiB、`concurrent=4` 与单 runner `limit=4`；`prepare` 是唯一 cache writer，分片只 pull。PostgreSQL 使用 pipeline/job 唯一容器与动态 loopback 端口，Chromium sandbox 按 job 唯一并通过固定 root helper 清理，browser 仍使用跨 checkout 锁。任一资源读回失败都不生成绿色 aggregate。
- 性能停止条件：7–9 分钟普通 CI 与 10–15 分钟热缓存提交到部署只作为稳健阶段目标；后续实测必须区分 R640 宿主和 Runner guest，覆盖冷/热缓存、job、关键路径、CPU/内存/IO 峰值、p50、波动和近似 p95。若资源仍有余量就继续冲刺 6–8 分钟与 8–12 分钟；只有饱和、排队/IO 争用、OOM、flaky、波动扩大或复杂度收益失衡才停，不以减测、放宽门禁或伪缓存换速度。
- 发布去重：普通 push `CI Gate` 将 terminal、receipt 和 manifest 固化到 exact pipeline/job/SHA 的 `plush-ci-evidence` Package；release 服务器端重新校验 protected main 和全部 DAG jobs 后直接复用，不重跑 strict。同 SHA 仅首次构建五件候选制品并冻结为 `candidate.tar`；演练复用同一 bytes，回执另行冻结，最后的 v2 Release manifest 同时绑定 CI、artifact、rehearsal 和 GHCR digest。promotion、rollback 和 database rebuild 不回到测试或构建。
- 七资产兼容：新 publication 与新 promotion 固定为 `plush.release-manifest/v2` 七资产，必须校验、传递并在目标归档 manifest 绑定的同一 `release-rehearsal.json`；目标只验证、load 和运行检查，不重建。旧 v1 六资产只保留精确读取、展示、校验和既有回滚点兼容，`promotionEligible=false`，不得补传、重封装或进入新 promotion；GitHub emergency 在完整接线前于任何副作用前失败关闭。
- 工作台与边界：质量工程页面单独展示当前 committed SHA 的 R640 普通 push CI 和 job 耗时，Local dirty/本地回执仍分层；版本中心仍只读取真实 GitLab pipeline、不可变 Release/Package 和 target operation。`test-133` 仍只是 customer-trial，不能冒充正式生产；当前 pipeline 耗时、版本、制品 digest、演练、目标部署和 UAT 必须从各自回执读取，不由本过程记录宣称。
- 当前目标边界：固定只读 `target-preflight --target test-133` 的最近证据是远端目标身份与合同不匹配，因此在重新读回并定位 config、数据库、版本或目标身份漂移前，不对 133 seed、reset 或 promotion。该阻断不把 133 升格为生产，也不替代继续从正式 registry 识别独立生产 target。
- 安全处置：运行态诊断期间对 Runner 认证信息可能进入工具输出的情形按泄露处理，旧 token 已失效并完成无回显轮换。后续诊断只读取脱敏身份和状态，不输出 token 值。
