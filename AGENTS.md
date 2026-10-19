# plush-toy-erp 个人开发约定

项目特例沿用全局规则；事实核对本仓 docs、代码、migration 与测试。

## AGENTS 体积治理

以 16 KiB 为建议目标，达到 24 KiB 预警，达到 32 KiB 阻断。运行 `bash scripts/qa/agents-size.sh`；治理顺序及只检查不改写的边界沿用全局 AGENTS，项目安全和业务约束必须保留。

## 按需读取与当前真源

入口不明时读 `README.md` 与 `docs/当前真源与交接顺序.md`，否则直达相关真源。

关键边界：

- `docs/product/产品完成路线图.md` 管长期路线，不替代当前实现真源。
- 仓库不保存其他项目或 GPT/ChatGPT 导出的参考原文；有价值结论必须先按本项目真源复核，再转化为正式 docs、代码或测试。`docs/archive/**` 和 `progress.md` 只保留本项目历史/过程证据。
- 当前客户稳定 key 为 `yoyoosun`；不要恢复 `current` 客户目录或旧工作区别名。

## 个人开发方式与工作区

- 本项目个人开发，普通改动在当前工作区单任务、单 writer 完成实现、最小充分验证和必要文档；分支、PR、并行 Agent 或 Worktree 仅按用户明确授权使用，PR CI 仅作按需验证入口。
- 甲方可在其他聊天软件提出需求或反复校对；只有项目负责人带回本任务并标注“甲方提出 / 要求 / 反馈 / 确认”的摘要、截图或资料才算甲方输入。外部聊天不是项目真源；未标注内容归项目负责人和 Codex 判断。裸“甲方”现指 `yoyoosun`。
- 会话中收到符合上述来源规则的 yoyoosun 意见时，Codex 自动更新完整仓库内的 `docs/customers/yoyoosun/甲方反馈记录.md`（不随源码包分发），只记收到日期、来源、事项、脱敏摘要及可用附件引用；同一意见去重补充，实质变化保留前后记录，无新意见不更新。原件沿用客户 Private 存储。该文件仅作输入备忘，不是需求、业务、实现、发布或验收真源，也不产生实施、Git 或发布授权；不增加处理状态、需求编号或每会话文件。
- 甲方只确认业务目标、关键岗位责任、高风险选择和实际使用结果，不必阅读代码或逐级确认架构层、产品状态、验证内部键和测试形态。对外只沟通业务范围、固定版本、是否发布、已知边界和反馈结果。
- 甲方未列出技术细节时，补齐当前目标必要的真源、状态、权限、异常恢复、验证和基础易用性；模型推断不升级为需求，任务外发现只报告，新增复杂度说明业务或正确性收益。
- 默认循环是“甲方目标或痛点 → Codex 实现与验证 → 固定版本发布 → 甲方使用反馈 → 缺陷、细化或新需求”。每次完成一个可验证切片，不建需求编号或多阶段计划；正式代码和文档不用历史 Phase/P 编号，`P0/P1/P2` 只表示风险优先级。
- 存在待提交或需交接改动时，在最终回复保留一份被动 `Git handoff record`：精确文件 / hunk、提交分组及中文意图、验证与盲区、外部脏文件、commit / push 授权。简单改动可融入交付摘要；该记录不产生授权或跨会话调度状态。
- Local 首次写入前和收口时，按全局只读 Git 规则核对实时 HEAD、index、`index.lock`、status 和 scoped diff，保留其他任务改动；共享 Local 不运行普通 `git status`。真实并发、混合 hunk 或索引冲突只阻断相关路径/动作，锁恢复遵循全局规则；不建立跨会话调度、租约、registry、daemon、轮询、定时唤醒或广播。
- 本仓库不恢复单独执行规格目录、短任务模板或本地审查报告目录。

## 过程记录

- 仅在工作需要跨会话继续、存在阻塞或显著风险、涉及 schema / migration、发布 / 回滚、形成重大产品或架构决策，或用户明确要求时更新 `progress.md`。普通且已闭环的小改动由 Git diff / commit 与测试结果留痕，不再重复写过程记录；仅讨论可跳过。
- 更新前检查规模；达到 600 行或 80KiB 时先显式归档，保留活跃事项、风险、最近事项和归档索引。
- `progress.md` 不自动清空，也不由 hook 静默改写；它不是正式需求或运行真源。

## 项目 Skills

- 项目 skills 位于 `.agents/skills/` 并随仓库管理；只承载 plush 专项 SOP。
- `.agents/skills/README.md` 管项目路由；按全局规则选择当前目标需要的分支和验证，切换 skill 后继续已授权工作。
- 运行诊断、可观测/错误、安全隐私、发布和回滚统一使用 `$plush-operations-governance`。
- Git 复杂收口在普通任务或 Goal 已授权 commit / push 时使用全局 `$git-closeout-coordination`；不保留项目级重复 Skill。
- 修改 skill 后运行 `node scripts/qa/skill-health.mjs`、validator 与 `git diff --check`；仅在适用范围、入口或元数据变化时同步 README / metadata / 引用。

## Product Core 与客户差异

- 当前形态是单仓库、单客户私有化部署；同一套 Product Core 通过客户配置、菜单开关、RBAC、角色模板和 Workflow 责任投影不同岗位界面。
- 产品运行边界保持单客户私有化：customer key 只选择客户配置和部署，不承担 runtime tenant 语义。只有用户明确提出并完成专项评审后，才扩展 SaaS 多租户、license、计费或客户工单能力。
- 客户差异优先放在 config、feature flag、初始化/角色/权限模板、打印模板、字段显示/必填、编号规则、菜单开关或 customer extension。
- 不把客户公司名、logo、特殊流程、字段、报表或资料硬编码进核心 usecase。
- 经审查、可进入产品仓的客户资料只保留脱敏业务分类、配置、seed/demo、打印模板或导入适配；真实 Excel、PDF、图片、私密 manifest 和评审信息进入每客户专属 Private 仓库或经客户确认的等价受控存储。永绅原件与 manifest 的当前真源是 `plush-toy-erp-customer-yoyoosun-private`。
- Product Core 的普通构建、测试、CI、源码包和镜像不得依赖客户私有仓库、客户访问凭据或真实原件；客户私有仓库通过固定产品版本在兄弟目录或 CI multi-checkout 中校验，不作为 Product Core 的 submodule / subtree。
- 移动现有客户资料前先评审引用、入口、测试、备份和回滚；未完成目标私有仓提交推送、远端回读、完整性校验和私有 manifest 验证时，不得宣称原件已完成外置。
- 权限码表达业务能力和敏感动作，不扩成字段/文案配置系统；字段显示和低风险称谓差异优先使用配置。

## 系统分层与 Workflow / Fact

长期保持：

- Workflow：协同任务、事件、角色流转和业务状态。
- MasterData：单位、材料、产品、仓库、客户、供应商、BOM。
- Fact：采购、库存、质检、生产、出货、财务事实。
- RBAC：权限码、角色、owner/assignee 和敏感动作边界。
- API/UI、Help/QA、Productization/Delivery、Reporting/Audit/Integration 各自负责对应层。

硬边界：

- Workflow task done 不等于 Fact posted；workflow payload 是展示快照，不是事实真源。
- `warehouse_inbound done` 不自动等于采购/库存入账。
- `shipment_release done` 只能表示 `shipping_released`，不等于 `shipped`。
- 应收/开票至少在真实 shipped 后再评审；质检任务 done 不等于质检事实完成。
- `WorkflowUsecase` 不写库存、出货、财务、应收、应付、发票或收付款事实。
- 已迁入后端的 Workflow 动作，前端不得保留真实运行时派生或双写。

## 已有真源与新增对象门禁

不得无评审重复设计下列真源：

- 主数据：`units`、`materials`、`products`、`warehouses`
- 库存：`inventory_txns`、`inventory_balances`、`inventory_lots`
- BOM：`bom_headers`、`bom_items`
- 采购：`purchase_receipts/items`、`purchase_returns/items`、`purchase_receipt_adjustments/items`
- 质检：`quality_inspections`
- RBAC：`roles`、`permissions`、`role_permissions`、`admin_user_roles`、`admin_users.is_super_admin`

新增相近表、字段或配置前检查：能否复用、是否只是别名、应否扩展现有真源、migration 是否在范围、文档/测试/API/UI 会否形成双轨。

## 字段与主路径修复

- 正式业务写入只能经过受控的 Go repository/usecase；不得通过临时 SQL、页面脚本或其他服务旁路写业务表。
- 遵循全局字段残值/缺值规则，并额外检查 Workflow 快照、Fact 真源、客户配置、打印和导入边界。
- 不为单页硬编码特殊判断，不在前端补造后端业务事实，不以 workflow payload 替代事实表。
- 不为测试放宽识别、权限、状态、幂等或命名条件。
- 主路径反复不稳时修正真源/usecase/统一算法，删除或失效化误导性的旧锚点、动态层和后处理 bandage。
- 临时方案必须有正式文档边界、测试和替换/退出路径。

## 生命周期与删除语义

- 业务列表不提供通用删除/回收站壳。只有后端 usecase、RBAC、审计、引用检查和测试闭环后才允许删除/恢复。
- 主数据默认启用/停用；Source Document 取消/关闭/归档；Fact/Ledger 取消、冲正、调整或只读；Workflow 使用任务状态和事件。
- 草稿明细移除不等于业务对象删除。已生效、过账或被引用对象不得物理删除。
- 归档不是回收站：归档对象仍可查、可引用、可审计；只有真实软删除且有恢复 usecase 才设计回收站。

## 测试与验收

验证范围与证据按 `$plush-test-governance`；测试层级见 `docs/product/自动化测试策略.md`。

- 实现授权含最小充分验证与复验；显著超出范围或资源预算时说明影响并确认。共享配置、真实数据、Git、发布分别授权；涉及 push / exact-SHA CI 才读 `scripts/qa/README.md`，非标准目标和本地 `--full` 不得静默升级。
- 新增或修改代码须同步检查维护日志与 Trace，复用统一组件，按影响验证链路关联、结果分类、脱敏和异常恢复；已有覆盖不重复埋点，技术观测不替代业务审计，遵循[观测规范](docs/observability/日志链路追踪与审计.md)。

自动化通过不等于完整验收，缺失测试须说明。

## 试用模拟与数据

- 当前没有可直接执行的 yoyoosun 真实数据导入；试用只使用 seed、fixture 或手工模拟客户、供应商、联系人、订单和岗位数据。
- 不拆字母子阶段，不把真实导入作为隐藏目标或完成条件。
- 模拟数据不得描述为真实客户确认、出货、库存或财务事实。
- 自动 seed/fixture/Workflow 名称复用服务端 implementation naming validator；普通主数据不套开发阶段命名规则。

## 文档与目录同步

- 目录、长期子系统或 Markdown 增删、改名、重分类时同步相关 README、文档清单、引用、入口与测试；仅改正文通常不动清单。`docs/` 长期易误读目录须有 README。
- 文档与工作台图示遵循[可视化规范](docs/engineering/可视化表达规范.md)：总览、专题和证据分层，同源生成，控制单图复杂度。
- 长期文档默认中文文件名和中文主体 + English anchor；README/AGENTS/CHANGELOG、archive、生成/外部稳定路径除外。
- 能力台账仅随产品能力边界、状态或关键阻塞变化更新；客户矩阵仅随客户启用、发布或验收状态变化更新；当前真源索引仅随入口或主路径变化更新。普通修复、重构、测试、样式及文案不更新能力台账。

## 部署、迁移与收口

- 当前 Compose 真源是 `server/deploy/compose/prod`；低配目标机不构建，只 load 制品、migration、启动和检查。
- 发布前确认 commit/image、migration、config、rollback；线上 Atlas 使用项目文档指定的宿主机工具和串行锁。
- 镜像清理先保留当前及项目要求的回滚版本，再按 `$plush-operations-governance` 和发布文档执行。
- 修改 `server/internal/data/model/schema/**` 后，本轮收口前必须在 `server/` 执行 `make data`，审查并纳入由此产生的 Ent 生成物、新 Atlas migration 与 `atlas.sum`，再运行 `bash scripts/qa/db-guard.sh`；结构变更缺 migration 或生成零漂移证据时只能报告 `incomplete`。Git hook 只做 check-only，不自动生成或改写 migration。
- 数据库改动（含精度、枚举 / 状态约束与数据转换）收口前，在登记开发库运行 `make migrate_check` 与 `make migrate_audit`，并检查 seed / fixture 是否仍会生成违规数据。涉及存量转换须用现库备份在隔离库验证升级，覆盖已过账事实、冻结快照和历史缺值；空库通过不能代替现库升级。审计失败或缺少证据时报告 `incomplete`，由修改会话处理或明确交接，不能留到用户重启才发现；真实 apply 仍按下条授权与流程执行。
- 登记共享开发库使用迁移页或 `make migrate`；非交互环境先 `make migrate_prepare`，再按同一次 ready 输出执行 `make migrate_execute`；`migrate_status` 只读，低层入口边界见 `scripts/README.md`。隔离库走对应 lifecycle，测试、生产或归属不明数据库走正式目标流程；未 apply 必须明确报告。
- 本地开发入口运行当前工作区：前端使用 Vite 源码与热更新，后端重启先核对工作区迁移、编译最新代码，再验证并切换。预检或编译失败保留原进程，但不得报告最新代码已启动；固定制品不得覆盖开发页面。数据库及数量规则变更仍须经现有迁移准备链路验证实际存量升级、附件恢复和候选业务，明确确认后才 apply；启动不得自动迁移。入口与证据边界见 `server/README.md` 和工作台设计文档。
- 本地启动与迁移修复必须实测 `pnpm start`、故障下迁移页可达和恢复后业务入口。数据库预检失败或超时只阻断业务，须保留恢复页；不得以跳过检查、自动 apply 或自动重试换取启动成功。相关回归由启动与迁移同名测试守住。

## 前端、原型与错误

- 页面须简洁、高效、实用、直观；ERP 桌面与手机同权限下的核心信息、动作、追踪和结果一致，布局按设备适配。按 `$plush-page-design-governance` 执行。
- 手机只做任务办理，不跳来源单据；完整单据在电脑查看，仅“切换工作入口”可换端。其余导航保持手机界面，复用 `useBusinessNavigate` / `BusinessLink` 与路由边界。
- 原型只作设计输入；Draft/To Implement/Current 与代码、测试及 runtime 分别核对。
- Ant Design 动态表单使用所属 form 实例，不以警告或隐藏实例兜底。
- 错误码保持一码一义，复用真源、生成码表、wrapper 与同步守卫。
- 跨层权限、状态、RPC 标识及公开约束复用领域真源及生成器/共享数据，更新消费者与生成物并做只读检查；授权、流转与事实归后端，见[公共契约规范](docs/engineering/跨层公共契约与生成规范.md)。
- API 新增、删除、改名或调用合同变更时，同轮同步正式合同、模拟样例、消费者和“接口与集成”的同源生成物，清理失效关联并通过只读检查；按[接口维护步骤](docs/engineering/跨层公共契约与生成规范.md#修改步骤--maintenance)执行，不另维护工作台接口清单。

## 项目设计边界

- 本项目是新系统，以当前正式设计、代码和测试为准；未采用的草稿、实验、schema、API、状态、字段、别名、mock / fixture 不产生兼容义务。
- 普通模块不独立编号，修订由 Git / 发布身份追踪。配置内容身份、启动边界及必要格式与业务版本按[版本边界](docs/engineering/跨层公共契约与生成规范.md#版本边界--version-boundaries)核实，并通过 `phase-label-boundaries`；已有编号或持久化引用不构成保留理由。
- 未进入正式目标设计的旧路径必须从代码、目标 Schema、seed/fixture、API、UI、文档和测试全链删除；已落库的 schema 或数据残留通过新的正式 migration 一次性清理，不改写已执行 migration。禁止保留 alias、fallback、双写、兼容读取、退出路径或仅为旧测试继续通过的分支。
- 一次性 migration / 清理、正式事实与审计留存、网络重试和幂等 receipt replay 属于正确性要求；禁止兼容不豁免数据完整性、事务、迁移追溯和审计边界。
