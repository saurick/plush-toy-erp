# plush-toy-erp 个人开发约定

本文件只记录 plush-toy-erp 的长期项目特例。通用工程、Git、删除、浏览器和文档规则使用全局 AGENTS；当前能力与业务事实必须回到正式 docs、代码、migration 和测试核对。

## AGENTS 体积治理

- 本仓库所有 `AGENTS.md` 目标小于 16 KiB；达到 16 KiB 先去重，超过 24 KiB 必须按全局治理顺序精简，`bash scripts/qa/agents-size.sh` 负责预警和阻断。
- 检查脚本不得自动截断、删除、拆分或重写规则；安全、权限、Workflow/Fact、客户资料和真源边界不得为过门禁被弱化。

## 阅读顺序与当前真源

新任务按相关性读取：

1. `README.md`
2. `docs/当前真源与交接顺序.md`
3. `server/README.md`
4. `server/deploy/README.md`
5. `scripts/README.md`
6. 对应产品/架构专题、代码和测试

关键边界：

- `docs/product/产品完成路线图.md` 管长期路线，不替代当前实现真源。
- 仓库不保存其他项目或 GPT/ChatGPT 导出的参考原文；有价值结论必须先按本项目真源复核，再转化为正式 docs、代码或测试。`docs/archive/**` 和 `progress.md` 只保留本项目历史/过程证据。
- 历史 changes、外部规划、截图和客户样本不能单独证明当前 schema/API/UI/RBAC/部署能力。
- 当前客户稳定 key 为 `yoyoosun`；不要恢复 `current` 客户目录或旧工作区别名。

## 个人开发方式与工作区

- 本项目由个人主导，当前以 Codex 讨论、实现和测试；部署逐次明确授权。默认单任务、单 writer、最小充分验证和按需文档；普通改动不引入团队审批、多人 ownership、并行 Agent、Worktree、多份状态记录、强制分支或阶段汇报。
- 甲方可在其他聊天软件提出需求或反复校对；只有项目负责人带回本任务并标注“甲方提出 / 要求 / 反馈 / 确认”的摘要、截图或资料才算甲方输入。外部聊天不是项目真源；未标注内容归项目负责人和 Codex 判断。裸“甲方”现指 `yoyoosun`。
- 甲方只确认业务目标、关键岗位责任、高风险选择和实际使用结果，不必阅读代码或逐级确认架构层、产品状态、验证内部键和测试形态。对外只沟通业务范围、固定版本、是否发布、已知边界和反馈结果。
- 项目负责人和 Codex 把不完整需求补成最小完整闭环，主动补齐必要的真源、状态、权限、异常、恢复、测试和基础易用性。优先复用和简单方案；只有当前需求或正确性、安全、数据完整性、可运维性确实需要时才增加复杂度，并说明理由。
- 默认循环是“甲方目标或痛点 → Codex 实现与验证 → 经明确授权发布固定版本 → 甲方使用反馈 → 缺陷、细化或新需求”。按一个可验证业务切片完成，不建需求编号或多阶段计划；正式代码和文档不用历史 Phase/P 编号，`P0/P1/P2` 只表示风险优先级。
- 开始和收口检查 worktree，保留其他任务或用户已有改动，不回退、格式化、删除、stage 或宣称为本轮成果。
- Local 任务首次写文件前，一次性记录 HEAD、index、`index.lock` 与 status。worktree 干净，或全部脏 hunk 都可证明由当前任务创建时，才可跳过队列；否则既有脏路径视为共享/归属不明，加载 `$plush-git-closeout-queue`，取得“精确路径 + 可能派生路径”writer lease 后再写。不得轮询或新建 registry / daemon，也不得回退、格式化、stage 外部脏路径；闭包无重叠和全仓连带写入的 grant 可并行，同一文件、派生目标或归属不明必须串行，高风险事项仍按专项治理。
- writer request / grant 声明精确路径、派生写入、禁用的全仓命令和开始身份；grant 只覆盖匹配 `inProgress` turn 的连续写入，release 回报实际路径与结束身份。最后写入后立即 release；只读验证、远端等待、额度中断或 turn 结束不占租约。越界只暂停越界任务。Git index / stage / commit / stash / rebase 保持全仓唯一 owner；浏览器、Vite、数据库和端口使用独立资源租约，仅在资源冲突或读取热点与 writer 重叠时等待。
- stage、commit 和 push 是独立动作，均先询问用户；完成实现或验证不自动取得 Git 授权。
- 本仓库不恢复单独执行规格目录、短任务模板或本地审查报告目录。

## 过程记录

- 仅在工作需要跨会话继续、存在阻塞或显著风险、涉及 schema / migration、发布 / 回滚、形成重大产品或架构决策，或用户明确要求时更新 `progress.md`。普通且已闭环的小改动由 Git diff / commit 与测试结果留痕，不再重复写过程记录；仅讨论可跳过。
- 更新前检查规模；达到 600 行或 80KiB 时先显式归档，保留活跃事项、风险、最近事项和归档索引。
- `progress.md` 不自动清空，也不由 hook 静默改写；它不是正式需求或运行真源。

## 项目 Skills

- 项目 skills 位于 `.agents/skills/` 并随仓库管理；只承载 plush 专项 SOP。
- 当前入口见 `.agents/skills/README.md`。默认只选一个主 skill，真实跨领域/页面/打印/测试/operations 时再组合。
- 运行诊断、可观测/错误、安全隐私、发布和回滚统一使用 `$plush-operations-governance`。
- 提示词整理仅在明确需要时显式使用全局 `$prompt-governance`。
- 只有真实并发 writer、混合 hunk、Git 锁或遗留现场需要协调时才使用 `$plush-git-closeout-queue`；普通个人开发不加载它。真正执行复杂提交或推送时再使用全局 `$git-closeout-coordination`。
- 修改 skill 时同步 README/metadata/引用，运行 validator、YAML/metadata 扫描和 `git diff --check`。

## Product Core 与客户差异

- 当前形态是单仓库、单客户私有化部署；同一套 Product Core 通过客户配置、菜单开关、RBAC、角色模板和 Workflow 责任投影不同岗位界面。
- 当前不实现 `tenant_id`、SaaS 多租户、license server、套餐计费或客户工单系统，除非用户明确要求且先完成正式评审。
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

按 `docs/product/自动化测试策略.md` 和 `$plush-test-governance` 选择 T0-T8 与测试形态。

- Workflow：done/blocked/rejected、reason、旧原因清理、幂等、任务匹配、settled、JSON-RPC/RBAC/owner/assignee/status。
- Fact：happy path、非法状态、重复提交、取消/冲正、幂等、防负数、事务失败、过账不可改删和查询表一致性。
- RBAC/API：未登录、disabled、非管理员、无权限、角色/owner/assignee/status、super_admin；前端隐藏不是安全边界。
- 前端/menu/seed：菜单真源、默认/交互/恢复态、style:l1、移动角色 smoke 和旧开发入口边界。
- 产品化：不写死客户，不分叉核心 schema/usecase，不把模拟数据说成真实事实。

自动化通过不代表完整验收；缺失测试必须明确说明。

## 试用模拟与数据

- 当前没有可直接执行的 yoyoosun 真实数据导入；试用只使用 seed、fixture 或手工模拟客户、供应商、联系人、订单和岗位数据。
- 不拆字母子阶段，不把真实导入作为隐藏目标或完成条件。
- 模拟数据不得描述为真实客户确认、出货、库存或财务事实。
- 自动 seed/fixture/Workflow 名称复用服务端 implementation naming validator；普通主数据不套开发阶段命名规则。

## 文档与目录同步

- 新增/删除/重命名一级目录或长期关键子系统时同步相关 README。
- `docs/` 长期且易误读的目录应有 README；新增、删除、重命名或重分类长期 Markdown 时同步 `docs/文档清单.md`、目录 README、引用、入口和测试。
- 仅改正文且标题/职责/分类不变时通常不更新文档清单。
- 长期文档默认中文文件名和中文主体 + English anchor；README/AGENTS/CHANGELOG、archive、生成/外部稳定路径除外。
- 根 README 只管仓库导航，子目录 README 管内部职责。
- 普通缺陷修复、重构、测试补强、样式和文案不更新能力台账。只有产品能力边界、产品状态或关键阻塞发生实质变化时才更新产品能力台账；只有客户启用、发布或验收状态变化时才更新客户矩阵；当前真源索引只在入口或主路径变化时更新。

## 部署、迁移与收口

- 当前 Compose 真源是 `server/deploy/compose/prod`；低配目标机不构建，只 load 制品、migration、启动和检查。
- 发布前确认 commit/image、migration、config、rollback；线上 Atlas 使用项目文档指定的宿主机工具和串行锁。
- 镜像清理先保留当前及项目要求的回滚版本，再按 `$plush-operations-governance` 和发布文档执行。
- 修改 `server/internal/data/model/schema/**` 后，本轮收口前必须在 `server/` 执行 `make data`，审查并纳入由此产生的 Ent 生成物、新 Atlas migration 与 `atlas.sum`，再运行 `bash scripts/qa/db-guard.sh`；结构变更缺 migration 或生成零漂移证据时只能报告 `incomplete`。Git hook 只做 check-only，不自动生成或改写 migration。
- 登记共享开发库的日常升级只走高层入口：交互终端使用 `make migrate`，非交互环境使用 `make migrate_prepare` 后按同一次 ready 输出执行 `make migrate_execute`；`migrate_status` 只读。为避免旧习惯落入缺 token 的死路，裸 `make migrate_plan` 安全路由到 prepare，裸 TTY `make migrate_apply` 恢复唯一 ready operation 或重新准备后确认；只有携带完整内部确认的调用才进入底层 plan / apply 守卫。隔离库继续使用对应 lifecycle；测试、生产或归属不明数据库必须走正式目标流程，未 execute / apply 必须明确报告。
- 命中“过程记录”的条件时才更新 `progress.md`；stage、commit 和 push 继续分别先询问用户，获准后只处理本轮精确范围，push 前 fetch 并确认 upstream。

## 前端、原型与错误

- 页面遵循现有设计系统和 `$plush-page-design-governance`；用户可见文案使用岗位语言，不暴露 schema/usecase/RBAC/API 等无必要术语。
- 原型是设计输入，不自动证明 runtime；Draft/To Implement/Current 状态与代码、测试分别核对。
- Ant Design 动态表单必须正确使用所属 form 实例，不依赖警告兜底或隐藏实例。
- 错误码真源、生成前端码表、消费 wrapper 和同步守卫按项目现有实现维护；保持一码一义。
- 前端错误通过统一 helper 翻译，调用点提供场景 fallback，不透传原始英文异常。

## 旧项目与外部规划

- 旧项目只能作迁移背景，不是 plush 字段、流程、页面、测试或文案真源；运行时用户界面不出现旧项目名或“对齐旧项目”说明。
- 旧项目、GPT/ChatGPT 会话和其他外部规划只作任务输入，不把原文或来源名称带入仓库。被采纳的结论必须改写为 plush 自有合同，并由本文件、README、正式 docs、代码、migration、测试和 worktree 复核。
- 本项目是新系统。以前 AI 草稿、本地实验、未发布的 schema、API、状态、字段、别名、mock 或 fixture 都不是兼容对象，不能因代码、常量或测试曾经存在就进入正式设计。
- 未进入正式目标设计的旧路径必须从代码、目标 Schema、seed/fixture、API、UI、文档和测试全链删除；已落库的 schema 或数据残留通过新的正式 migration 一次性清理，不改写已执行 migration。禁止保留 alias、fallback、双写、兼容读取、退出路径或仅为旧测试继续通过的分支。
- 一次性 migration 或数据清理、正式业务事实与审计记录留存、网络重试和幂等 receipt replay 是当前系统正确性要求，不属于历史兼容；不得借“禁止兼容”绕过数据完整性、事务、迁移可追溯性和审计边界。
