# plush-toy-erp 协作约定

## 过程记录与归档

- 每次完成代码或正式文档改动后，Codex 必须更新 `/Users/simon/projects/plush-toy-erp/progress.md`。
- 更新最少包含：完成、下一步、阻塞/风险（可空）。
- 若本次仅讨论或无文件改动，可跳过更新。
- `progress.md` 只作为过程流水和交接线索，不作为当前正式需求、数据模型或部署真源。
- 每次需要更新 `progress.md` 前，必须先检查文件规模；若达到或超过 `600` 行，或文件大小达到或超过 `80KB`，必须先归档旧记录，再追加本轮记录。
- `progress.md` 不应定时自动清空，也不允许通过 pre-commit、pre-push 或后台脚本静默自动改写；归档动作必须由当前执行者显式完成。
- 当阶段完成或历史内容影响查找时，即使尚未达到阈值，也可以进行人工归档。
- 归档时应优先保留当前活跃事项、未完成事项、阻塞/风险和最近完成事项；已完成且已同步到正式文档的旧流水，可移动到 `docs/archive/progress-YYYY-MM.md` 等归档文件。
- 归档后应在 `progress.md` 保留归档索引或摘要，方便后续追溯。

## 阅读顺序

遇到新任务时，优先按下面顺序收敛真源：

1. `/Users/simon/projects/plush-toy-erp/README.md`
2. `/Users/simon/projects/plush-toy-erp/docs/current-source-of-truth.md`
3. `/Users/simon/projects/plush-toy-erp/server/README.md`
4. `/Users/simon/projects/plush-toy-erp/server/deploy/README.md`
5. `/Users/simon/projects/plush-toy-erp/scripts/README.md`

如果任务已经明确落在某个子系统，再继续读对应专题文档，不要先凭印象补丁。

常见专题文档包括但不限于：

- Workflow 协同层：`docs/architecture/workflow-usecase-review.md`
- Shipment / 出货边界：`docs/architecture/shipment-release-workflow-review.md`、`docs/architecture/shipment-inventory-boundary-review.md`、`docs/architecture/shipment-usecase-review.md`
- Inventory / Purchase / BOM / Quality 事实层：`docs/changes/phase-2a-inventory-fact-schema.md`、`docs/changes/phase-2b-bom-lot-schema.md`、`docs/changes/phase-2c-purchase-receipt-schema.md`、`docs/changes/phase-2d-purchase-return-schema.md`、`docs/changes/phase-2d-purchase-receipt-adjustment-schema.md`、`docs/changes/phase-2d-lot-status-guard.md`、`docs/changes/phase-2d-quality-inspection-schema.md`
- 开发与验收 / 帮助文档：`web/src/erp/docs/acceptance-overview.md`、`web/src/erp/docs/qa-reports.md`、`web/src/erp/docs/current-boundaries.md`

如果后续新增 `web/src/erp/docs/system-layer-progress.md`、`web/src/erp/docs/productization-delivery.md`、`docs/architecture/project-boundary-map.md` 或等价文档，涉及系统层级、产品化、客户差异、部署交付、下一步规划时必须同步阅读。

## 工程原则

- 先理解现状、确认当前真源与主路径，再决定改动范围。
- 改动应完整解决当前问题，并优先选择“完整且最简洁”的主路径修复；最小化的是无关影响、额外复杂度和无收益改动，不是靠局部最小补丁、临时兜底或 fallback 式修补蒙混过关。
- 优先保留稳定、可维护、可观测的实现。
- 能复用现有能力就不要额外造层。
- 注释只写设计意图、边界条件和兼容性兜底，避免补丁口吻。
- 代码行为、部署方式、配置字段或正式文档口径变化时，同轮更新相关文档。
- 自动化测试通过是必要条件，不是充分条件；还必须确认架构边界、业务真源、权限边界、文档口径和产品化约束没有被破坏。
- 不要为了让当前页面或当前测试通过而引入长期不可维护的特殊分支、局部兜底、重复真源或隐藏兼容路径。

## 反局部兜底与主路径修复约束

本项目禁止为了让当前测试或当前页面“看起来通过”而引入局部兜底、临时 fallback、重复派生、双轨兼容或只服务单个场景的特殊分支。

修复问题时必须优先定位真实主路径：

- 数据来源是否正确。
- usecase 边界是否正确。
- 权限边界是否正确。
- 状态机是否正确。
- 幂等键和重复提交边界是否正确。
- 前端是否只是展示和提交动作，而不是偷偷承接后端事实逻辑。
- 当前修复是否复用了已有真源，而不是又造了一份语义相近的字段、配置、表或文档。

只有在存在明确历史兼容需求、正式文档记录兼容边界、且有测试覆盖时，才允许保留 fallback 或兼容路径。否则不允许用 fallback 掩盖缺失的数据、错误的状态、未完成的 usecase 或不完整的 API。

禁止模式：

- 为单个页面硬编码特殊判断。
- 在前端本地补造后端应该返回的业务事实。
- 在 WorkflowUsecase 中直接写库存、出货、财务事实。
- 已迁入后端的 workflow 又在前端保留真实运行时派生。
- 为通过测试而放宽识别条件、权限条件或状态边界。
- 新增与既有真源表语义重复的表、字段或配置。
- 把当前甲方专属字段、名称、流程、报表写死进通用核心 usecase。
- 把 workflow payload 当成库存、出货、财务事实真源。

如果确实需要临时方案，必须同时满足：

1. 在最终回复说明为什么是临时方案。
2. 在正式文档记录边界和后续替换路径。
3. 加测试锁住当前行为，避免临时方案扩散成长期主路径。

## 测试与验收约束

自动化测试通过是必要条件，不是充分条件。每轮改动必须根据改动类型补充或确认对应测试。

Workflow 规则改动必须覆盖：

- done / blocked / rejected。
- reason 必填。
- 空字符串 / 全空格 reason 无效。
- blocked_reason / rejected_reason 旧原因清理。
- 重复提交幂等。
- 同名但非目标任务不触发。
- settled 状态不再触发特殊 rule。
- 前端真实运行时不再双写或本地派生。
- JSON-RPC / RBAC / owner_role_key / assignee_id / task_status_key 边界。

Fact / Inventory / Purchase / Quality / Shipment / Finance 改动必须覆盖：

- happy path。
- 非法状态。
- 重复提交。
- 取消 / 冲正 / REVERSAL。
- 幂等。
- 防负数或越界。
- 事务失败边界。
- 已过账单据不可直接修改或物理删除。
- 事实表与查询加速表的一致性边界。

RBAC / API 改动必须覆盖：

- 未登录。
- disabled 管理员。
- 非管理员。
- 无权限。
- 角色不匹配。
- owner_role_key / assignee_id / task_status_key 边界。
- super_admin 边界。
- 前端隐藏菜单不是安全边界。

前端菜单 / docs / seed 改动必须覆盖：

- docs registry。
- 导航 seed。
- 对应测试断言。
- 帮助中心主入口和开发与验收入口不混淆。
- 默认态、交互态、恢复态。
- style:l1 相关场景。
- 移动端角色 smoke 不破坏。

产品化 / 私有化交付改动必须覆盖：

- 产品化与交付文档同步。
- 没有写死当前甲方。
- 客户差异优先配置、模板、feature flag 或扩展隔离。
- 不引入每客户一套核心 schema 或核心 usecase 分叉。
- 不提前实现复杂 SaaS、多租户、license server、套餐计费或客户工单系统，除非任务明确要求并有正式方案文档。

如果某类测试暂时缺失，不允许在最终回复中只写“已通过测试”来暗示已完整验收；必须明确写出未覆盖项、原因和后续建议。

## 项目进度、分层边界与产品化约束

本项目长期目标是面向毛绒玩具及相近轻工制造企业的可私有化部署 ERP 产品。当前甲方是第一个标杆客户 / 种子客户，后续可能作为 SaaS / 私有化部署产品卖给同行，并按年收维护费。

开发时必须优先沉淀通用行业能力，避免把当前甲方的名称、流程、字段、报表或特殊习惯硬编码进核心 usecase。客户差异应优先通过 tenant config、feature flag、初始化模板、打印模板、字段显示配置、菜单开关或客户扩展层处理。

项目长期分层包括：

- Workflow 协同层：任务状态、角色流转、业务状态、下游协同任务派生。
- MasterData 主数据层：单位、材料、产品、仓库、客户、供应商、BOM 等。
- Fact 事实层：采购、库存、质检、生产、出货、财务等真实业务事实。
- RBAC 权限层：权限码、角色、owner_role_key、assignee_id、任务处理边界。
- API / UI 层：JSON-RPC/API、Web 页面、移动端页面。
- Help / Debug / QA 层：帮助中心、业务链路调试、验收报告、测试说明。
- Productization / Delivery 层：SaaS、私有化部署、客户定制、通用产品能力、维护费交付。
- Reporting / Audit / Integration 层：报表、审计、附件、导入导出、条码扫码、外部系统集成、数据归档与压测。

当改动以下内容时，必须同步检查并按需更新：

- `docs/current-source-of-truth.md`
- `docs/architecture/project-boundary-map.md` 或等价边界文档
- `docs/architecture/system-layer-progress.md` 或等价分层进度文档
- `web/src/erp/docs/system-layer-progress.md`
- `web/src/erp/docs/productization-delivery.md`

必须同步检查的改动包括：

- 新增或修改 WorkflowUsecase 规则。
- 新增或修改 InventoryUsecase、PurchaseUsecase、QualityUsecase、ShipmentUsecase、FinanceUsecase 行为。
- 新增或修改 Ent schema、migration、repo、usecase。
- 新增或修改 RBAC 权限码、角色矩阵、JSON-RPC 权限守卫。
- 新增或修改菜单入口、开发与验收页面、帮助中心页面。
- 新增或修改 SaaS、私有化部署、产品化交付相关设计。
- 改变“已完成 / 已评审 / 未开始 / 暂停 / 禁止事项 / 下一步建议”等项目状态。
- 改变客户差异隔离方式、部署方式、初始化模板、打印模板、字段显示配置、菜单开关或 feature flag 规则。

纯样式修复、局部文案修正、测试断言小修，如果不改变业务能力、架构边界、菜单入口或交付状态，可以不更新进度文档，但必须确认不影响上述真源。

## 产品化与客户差异隔离约束

当前代码库应优先作为通用 ERP 产品内核演进。当前甲方是第一个标杆客户，不应成为硬编码在核心 usecase 中的永久定制分支。

推荐产品化路线：

1. 第一阶段：单仓库、单租户、单客户私有化部署，通过 env、config、seed template、菜单开关和初始化模板区分客户。
2. 第二阶段：多客户私有化部署，每个客户一套数据库 / 对象存储 / 配置，代码版本统一。
3. 第三阶段：SaaS 多租户，再评审 tenant_id、租户隔离、套餐计费、license、统一升级等能力。

当前阶段不要提前实现复杂 SaaS 多租户、license server、套餐计费、客户工单系统或多租户管理后台，除非任务明确要求并有正式方案文档。

客户差异优先通过以下方式隔离：

- tenant config
- feature flag
- 初始化模板
- 打印模板
- 字段显示 / 必填配置
- 菜单开关 / 模块开关
- 编号规则
- 角色模板 / 权限模板
- 客户扩展层
- customer-specific 文档或配置目录

客户差异不应污染以下核心规则：

- 库存流水语义。
- 入库 / 出库 / 冲正 / 防负库存规则。
- 出货事实规则。
- 财务事实规则。
- 核心状态含义。
- 数据库迁移主路径。
- Workflow 与 Fact 的边界。

不建议每个客户复制一份完整代码仓库长期分叉维护。确需客户专属逻辑时，应放在明确的 customer-specific、extension、tenant config 或部署配置边界，并在产品化与交付文档中记录。

## 当前甲方资料与通用产品资料边界

当前仓库内已经存在与当前甲方深度耦合的文档、样本、截图、字段口径或业务说明时，不要在无明确任务时大规模移动、删除或重命名。

处理原则：

- 当前甲方资料可以作为种子客户样本，但不能自动升级为通用产品真源。
- 通用产品规则必须沉淀到正式架构文档、usecase、schema、测试和帮助中心通用口径中。
- 当前甲方专属资料后续应逐步隔离到明确目录或配置边界，例如 `docs/customers/<customer-key>/`、`deployments/<customer-key>/`、`config/tenants/<tenant-key>/` 或等价结构。
- 本轮若只是补总控页面或 AGENTS 约束，不要顺手重构目录。
- 若任务明确要求做客户资料隔离，必须先做目录隔离评审，列出要迁移的文件、引用关系、docs registry、测试断言和回滚风险，再执行移动。
- 移动文档或目录时，必须同步修复所有引用、导航注册、测试断言和帮助中心入口。
- 不要把当前甲方公司名、logo、特殊流程、特殊报表、特殊字段硬编码进通用核心 usecase。
- 当前甲方专属说明若仍在普通业务帮助中心出现，必须确认它是否确实是通用业务规则；如果不是，应迁移到产品化 / 客户交付 / customer-specific 文档边界。

## Workflow 与 Fact 边界

本项目必须长期保持 Workflow 协同层与 Fact 事实层的边界。

核心原则：

- Workflow task done 不等于 Fact posted。
- Business status 不等于 Inventory balance。
- warehouse_inbound done 不等于 purchase_receipt posted，除非后续明确 usecase 对接。
- shipment_release done 不等于 shipped。
- shipped 后才评审 receivable / invoice。
- workflow payload 是展示快照，不是库存、出货、财务事实真源。
- WorkflowUsecase 只负责协同任务、事件、业务状态和必要的协同任务派生。
- InventoryUsecase / PurchaseUsecase / QualityUsecase / ShipmentUsecase / FinanceUsecase 负责真实业务事实。
- 不要在 WorkflowUsecase 中直接写库存、出货、财务事实，除非对应边界文档明确允许。
- 已迁入后端 WorkflowUsecase 的真实业务动作，前端不得继续保留运行时本地派生或双写路径。

当前已明确的边界示例：

- 采购入库任务 done 只是协同任务完成，不自动等同 purchase_receipt posted。
- 成品入库任务 done 只是协同状态 inbound_done，不自动等同库存入账。
- shipment_release done 只是 shipping_released，不等于 shipped。
- 应收 / 开票至少应在真实 shipped 后再评审。
- 质检任务 done 不等于 quality_inspections 事实完成，后续需要 QualityUsecase 对接。

## 已有事实真源禁止重复设计

当前项目已经存在或已形成真源的能力，不要重复设计一套语义相近的新表、新配置或新字段，除非任务明确要求做重构评审。

禁止重复设计的典型真源包括：

- `units`
- `materials`
- `products`
- `warehouses`
- `inventory_txns`
- `inventory_balances`
- `inventory_lots`
- `bom_headers`
- `bom_items`
- `purchase_receipts`
- `purchase_receipt_items`
- `purchase_returns`
- `purchase_return_items`
- `purchase_receipt_adjustments`
- `purchase_receipt_adjustment_items`
- `quality_inspections`
- RBAC 相关的 `roles`、`permissions`、`role_permissions`、`admin_user_roles`、`admin_users.is_super_admin`

如果发现当前任务似乎需要新增与上述对象语义相近的表或配置，必须先做边界评审：

1. 现有真源是否可复用。
2. 新增对象是否只是别名或重复。
3. 是否应该扩展现有表，而不是新建表。
4. 是否会破坏文档、测试、菜单或帮助中心口径。
5. 是否需要 migration，以及 migration 是否属于当前任务范围。

## 旧项目迁移边界

- 当前项目的唯一业务真源是 `plush-toy-erp` 自身的代码、正式文档和真实业务样本；旧项目只能作为迁移背景或经验来源，不能作为当前业务字段、流程、页面命名、测试基线或文案真源。
- 运行时页面、帮助中心、业务配置、种子数据、测试断言、错误信息和用户可见文案中默认不出现旧项目名，也不要用“对齐旧项目”“沿用旧项目”这类表述解释当前行为。
- 若确实需要说明历史迁移背景，只允许集中写在正式真源文档的“迁移背景 / 禁止照搬旧模型”小节里，并且必须同时写清当前项目自己的主路径和不应照搬的旧语义。
- 从旧项目复用过来的通用结构可以保留，但应改写成当前项目自己的命名、说明和验收口径；不要因为来源旧就删除已经稳定承接当前业务的通用实现。

## 目录结构文档同步约定

- 当本仓库新增、删除、重命名仓库一级目录，或新增/调整需要长期维护的关键子系统目录时，必须同步检查并按需更新相关目录说明文档，避免代码结构已变化而 `README / docs` 仍停留在旧口径。
- 根 `README.md` 只维护仓库级目录导航；`web/README.md`、`server/README.md` 等子目录 `README` 维护各自内部目录职责，不在多处重复展开同一份内部目录树。
- 生成产物、缓存、依赖目录或临时目录（如 `build/`、`output/`、`tmp/`、`node_modules/`、`bin/`）默认不要求更新目录说明，除非它们已经成为正式入口或长期维护对象。
- 若本轮调整了目录结构但判断无需更新 `README / docs`，最终回复中必须明确说明未更新的原因与边界。
- 不要在补文档、补菜单入口、补 AGENTS 约束的同轮顺手大规模重构目录；目录隔离必须作为单独任务评审。

## 当前部署边界

- 当前唯一部署真源：`/Users/simon/projects/plush-toy-erp/server/deploy/compose/prod`
- 当前仓库没有初始化 `lab-ha`、Kubernetes 清单和 dashboard；未获明确需求前，不要补回第二套部署主路径。
- Compose 基线默认保留 PostgreSQL、Jaeger、`/healthz`、`/readyz` 和 `depends_on: service_healthy`。
- 如果后续确实要引入 Kubernetes 或其他部署方式，必须先补正式文档，再落代码和脚本。
- 私有化部署相关能力应优先沉淀到产品化与交付文档、部署配置和初始化模板中，不要散落在业务 usecase 中。

## 初始化与收口

- 首次收口或大规模改名后，执行 `bash /Users/simon/projects/plush-toy-erp/scripts/project-scan.sh --strict`
- 该脚本用于扫出项目名、服务名、默认密钥、远端发布地址和首页文案残留。
- 不需要的目录、脚本和部署物默认移动到系统回收站，不做不可恢复删除。

## 数据库与迁移

- 结构变更走 Ent + Atlas，禁止手改 schema SQL。
- 迁移前先确认命中的数据库：`cd /Users/simon/projects/plush-toy-erp/server && make print_db_url`
- 生成迁移后执行：`cd /Users/simon/projects/plush-toy-erp/server && make data && make migrate_status`
- 若服务逻辑依赖新表/新列，发布前先确认目标库 migration 已落地。
- 不要因为文档、前端导航、帮助中心、开发验收总控页面改动而运行或生成 migration。
- 不要把与当前任务无关的 Phase 2A / 2B / 2C / 2D 现场文件清理、回退或纳入本轮，除非任务明确要求。

## 前端与样式

- 样式和布局问题优先在真实浏览器中定位，不靠静态代码猜。
- 前端样式改动至少执行：
  - `cd /Users/simon/projects/plush-toy-erp/web && pnpm lint && pnpm css && pnpm test`
  - `cd /Users/simon/projects/plush-toy-erp/web && pnpm style:l1`
- 需要验证的状态至少包括默认态、交互态、恢复态和相邻区域。
- 新增开发与验收入口时，必须同步 docs registry、seed navigation、对应测试断言，且确认普通帮助中心主入口没有被误加入开发内部文档。
- 新增文档页优先复用现有 docs registry 和页面渲染机制，不要为了静态说明页新建复杂状态管理或后端 API。

## Ant Design 表单实例约定

- 只要未来在 `plush-toy-erp` 前端创建了 `const [form] = Form.useForm()`，同一渲染树里就必须存在对应的 `<Form form={form}>` 真正承接该实例；禁止创建 form instance 后只在按钮、`onOk`、`submit()`、`resetFields()` 或其他 helper 里使用，却没有实际绑定到 `Form`。
- `Modal`、`Drawer`、条件渲染表单默认把“表单是否已经真实挂载”当成必查项。凡是会在 `useEffect`、打开弹窗、关闭弹窗、切换编辑态时调用 `setFieldsValue`、`resetFields`、`validateFields`、`submit` 的链路，必须保证调用发生在表单挂载之后；必要时使用 `forceRender` 或保持稳定挂载，禁止在未挂载态访问 form instance。
- 表单拆分成父子组件时，`form` 必须作为显式 prop 透传到最终的 `<Form form={form}>`；禁止父组件 `useForm()`、子组件忽略这份实例后又自己新建一份，造成父子各拿一份 form 或出现悬空实例。若只是表单内部子组件读取当前实例，优先使用 `Form.useFormInstance()`，不要额外创建新的 `useForm`。
- 后续新增或重构 Ant Design 表单时，至少回归 `1)` 页面默认态初次渲染，`2)` 首次打开新建/编辑弹窗，`3)` 关闭后再次打开 这三种状态，确认浏览器控制台不出现 `Instance created by \`useForm\` is not connected to any Form element` 告警；如果该表单会长期存在，默认同步补一条最小回归测试，不要只做人工点按。
- 这类问题按运行时回归缺陷处理，不能因为“功能表面还能用”或“只是 console warning”就忽略。当前仓库还没有 `useForm` 告警的既有示例文件；未来首个 Ant Design 表单接入点必须同时沉淀最小测试或浏览器回归脚本，避免同类错误重复出现。

## 可观测性

- 新增或修改服务端链路时，同时检查日志、trace 和健康检查。
- 日志优先结构化字段，禁止输出密码、密钥、完整 token 等敏感明文。
- `/readyz` 默认只检查 PostgreSQL 这一项通用硬依赖，项目特有依赖按真实需要再加。

## 错误码与错误提示

- 服务端错误码唯一来源：`server/internal/errcode/catalog.go`
- 前端生成码表：`web/src/common/consts/errorCodes.generated.js`
- 前端消费层：`web/src/common/consts/errorCodes.js`
- 提交前如涉及错误码，执行：
  - `bash /Users/simon/projects/plush-toy-erp/scripts/qa/error-code-sync.sh`
  - `bash /Users/simon/projects/plush-toy-erp/scripts/qa/error-codes.sh`
- 用户可见错误提示不要直接透传原始英文异常。

## Git 约定

- 提交信息默认使用简体中文。
- 个人开发场景默认不要主动创建分支。
- 用户明确要求提交时可直接 `git commit`。
- 用户明确要求推送时可直接 `git push`。
- 未经用户在当前轮明确要求，禁止把主工作区现场改动临时塞进 `git stash` 作为“为了提交 / 推送 / 切换上下文先藏起来”的默认手段。若需要隔离脏工作区，优先使用 `git worktree`、按路径精确提交 / 检查，或直接说明现场冲突。
- 若已经误用 `git stash`，必须在同一轮继续完成：`1)` 列出 stash 内容；`2)` 判断哪些改动已落在当前代码树 / 提交里、哪些仍是唯一现场；`3)` 恢复仍有价值的唯一内容；`4)` 再删除不再需要的 stash。禁止把“待确认现场”长期沉在 stash 里。
- 强制推送、重写历史、硬重置前必须先说明风险并获得同意。
