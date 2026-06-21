# plush-toy-erp 过程记录 / Progress

`progress.md` 只记录最近活跃事项和交接线索，不作为当前正式需求、数据模型或部署真源。当前能力判断仍回到 `docs/当前真源与交接顺序.md`、正式产品 / 架构文档、代码和测试。

## 归档索引

| 归档文件 | 范围 |
| --- | --- |
| `docs/archive/progress-2026-06-20-before-lifecycle-ui-policy.md` | 截至 2026-06-20 业务数据生命周期页面治理前的完整过程流水，包含 debug 清表、删除 / 回收站边界、项目 skills 迁入和加工环节页面收口等记录。 |

## 最近活跃事项

- 库存台账筛选已移除业务用户不可理解的内部 ID 输入；后续若要显示物料 / 成品、仓库、批次的可读名称，应补后端 read model 或关联查询，不在前端伪造名称。
- 加工环节页面已收口重复页头并恢复共享列顺序能力；后续同类工程页继续复用自包含页头和共享列表工具，不再按页面类型绕开列顺序。
- 业务列表删除 / 回收站边界已写入仓库级规则和当前真源；后续若某对象确需删除，先补后端 usecase、RBAC、审计、引用检查和测试，再单独开放入口。
- `.agents/skills/plush-docs-governance` 与 `.agents/skills/plush-page-design-governance` 已作为项目内 canonical，后续修改以仓库内 skill 为准。

## 2026-06-20 库存台账筛选摘要重构

- 完成：库存台账页头摘要从表名说明改为余额、批次、流水三种只读追溯视图；统计区改为只读页面模式，继续明确本页不写库存事实。
- 完成：主筛选区只保留业务用户可理解的对象类型、批次状态、流水类型和来源类型；余额视图隐藏主要落到内部引用的关键词搜索，批次 / 流水视图保留批次号、来源、备注、幂等键等可见文本搜索。
- 完成：移除 `subject_id / warehouse_id / lot_id` 的页面筛选输入、清空入口、前端状态和请求参数；内部 ID 不再作为库存台账业务筛选控件暴露。
- 完成：库存余额 / 批次 / 流水表格中的裸引用列改为“对象内部引用 / 仓库内部引用 / 批次内部引用”，保留审计追溯能力但不冒充业务名称。
- 完成：同步 `business-formal-module-shells-desktop` L1 断言，覆盖新的库存台账摘要文案和余额视图空态刷新路径。
- 下一步：若要进一步把筛选升级为真正业务选择器，应让后端库存 read model 返回或支持查询物料 / 成品编号名称、仓库名称和批次号，再接入对应选择器。
- 阻塞/风险：本轮不改后端 inventory JSON-RPC、schema、RBAC、菜单、库存流水 / 余额 / 批次事实写入，也不新增物料 / 仓库联查；当前不提供按内部引用精确筛选的用户入口。

## 2026-06-20 业务数据生命周期页面治理

- 完成：新增 `docs/product/业务数据生命周期与页面动作规则.md`，把 `docs/reference/第二次20260611/ERP 数据生命周期与删除策略规范.md` 中可落地部分收口成当前页面动作矩阵、删除进入条件、决策路径和验收清单；明确 reference 仍是输入资料，不新增通用删除 API、RBAC、schema、migration 或 Fact 写入。
- 完成：同步 `docs/product/README.md`、`docs/文档清单.md`、`docs/当前真源与交接顺序.md` 和 `docs/reference/README.md`，补齐正式文档入口、reference 文件登记和旧英文真源路径修正。
- 完成：同步 `docs/product/prototypes/README.md`、`business-module-page-standard-v1`、`business-form-page-standard-v1`、`action-modal-drawer-standard-v1` 和 `docs/product/prototypes/index.html`，将标准业务页和局部动作弹窗从“通用回收站 / 删除确认”改为“生命周期动作说明 / 危险动作确认”。
- 完成：同步 `web/src/erp/config/devPrototypes.mjs` 和测试，避免 dev-only 原型登记重新把回收站或删除确认写成通用覆盖项。
- 完成：将运行时表单、采购 / 委外 / 出货 / 入库 / BOM 明细、打印工作台的行级“删除”文案收口为“移除行 / 移除明细 / 移除当前行”，避免误解为业务对象列表级删除；未改后端 API、RBAC、schema、migration、菜单或事实写入。
- 下一步：若后续某个对象确需删除 / 恢复，按对象专项补后端状态检查、引用检查、RBAC、审计、前端错误提示、测试和文档后再设计入口。
- 阻塞/风险：本轮不实现通用删除、恢复、软删除字段、回收站或冻结 / 合并 / 替代等 future lifecycle；原型仍保持 To Implement，未晋级 Current。

## 2026-06-20 BOM 历史版本文案收口

- 完成：将 BOM Version 页面上的 `ARCHIVED` 用户可见语义从“归档”收口为“历史版本 / 设为历史版本”，并更新激活提示，避免误解为删除、回收站或不可恢复封存。
- 完成：同步 server README、当前真源、BOM 边界评审、产品能力证据、客户交付矩阵、生命周期页面规则和菜单覆盖原型；底层 `ARCHIVED` 状态、`archive_bom_version` 方法、RBAC、schema 和 usecase 均未改变。
- 下一步：若未来需要不可恢复封存或真正软删除，应作为独立生命周期能力评审，先补后端状态 / 引用 / 审计 / 恢复边界。
- 阻塞/风险：本轮只改文案和正式口径，不改变运行时数据状态语义；此前完整 `business-formal-module-shells-desktop` L1 被 BOM 弹窗点击建议时的 AntD circular warning 卡住，已在 2026-06-20 BOM 版本建议优化中改为 `setFieldsValue` 并复跑通过。

## 2026-06-20 BOM 版本建议优化

- 完成：BOM 管理页新建 / 复制版本仍保留可填写版本号；选定产品后按同产品现有版本建议下一个 `Vn`，并提供“一键采用”，避免把工程版本误做成固定枚举下拉。
- 完成：新增 `web/src/erp/utils/bomVersionSuggestion.mjs` 与单测，按 `product_id` 真源过滤版本，不依赖当前列表分页 / 筛选结果；后端 `(product_id, version)` 唯一约束仍是最终防重复边界。
- 完成：更新 `business-formal-module-shells-desktop` L1 场景，覆盖 BOM 弹窗默认提示、选择产品后的建议、显式关闭恢复和无横向溢出。
- 下一步：后续若生产 / 委外 / 工单等业务单据接入 BOM 引用，应新增真正的 BOM Version 下拉选择并保存 BOM 内部关联，不把业务引用写成手填版本字符串。
- 阻塞/风险：本轮不新增业务单据 BOM 引用字段，不改 schema、RBAC、菜单、Workflow / Fact 或后端 usecase；复制弹窗的建议仍是前端辅助，重复版本最终由后端唯一约束兜底。

## 2026-06-20 业务主表选择列单选收口

- 完成：共享 `BusinessDataTable` 的 radio 选择列不再显示“选择”列表头；库存台账移除页面私有的“选择”列名，采购入库 L1 断言同步改为前置选择列空表头。
- 完成：销售订单、主数据、采购订单和 formal 壳页的当前操作选择从 checkbox 收口为 radio；这些页面动作区只处理当前单条记录，不再展示可多选但没有批量动作的误导状态。
- 完成：保留 BOM 管理多选能力，因为当前存在“所选设为历史版本”的真实批量语义；来源导入选择器也保留按 `multiple` 控制的 checkbox/radio 行为。
- 下一步：若后续某页新增真实批量动作，再按后端 usecase、RBAC、审计和测试评审是否恢复 checkbox 多选。
- 阻塞/风险：本轮不改 schema、RBAC、菜单、Workflow / Fact 或删除 / 回收站能力；未把“请选择”类表单校验和来源选择器文案纳入本次“选择列表头”清理范围。

## 2026-06-20 业务主表省略列收口

- 完成：全局移除业务页主表列定义中的 `ellipsis: true`，覆盖出货单、Operational Fact、Workflow 协同页、入库管理、来料质检和库存台账；共享业务表格默认列宽从 132 提升到 160，最小列宽从 72 提升到 88。
- 完成：出货单、Operational Fact、Workflow 原因 / 备注、库存幂等键 / 备注、质检判定备注、入库备注等长文本或长编号列补足列宽，改为通过业务表格横向滚动和完整文本展示承载，不再在单元格内裁成省略号。
- 完成：共享业务表头的列设置标题文本不再 `text-overflow: ellipsis`，并在 `style:l1` 业务主表排序断言中新增表头不裁切、数据单元格不出现 `.ant-table-cell-ellipsis` 的守卫。
- 下一步：若某个业务页仍因字段太多影响扫读，优先按业务语义合并列或缩短表头，不恢复 AntD 省略列。
- 阻塞/风险：完整 `pnpm style:l1` 当前被无关的 `print-workspace-material-row-selection-reset` 场景阻塞在“删除当前行”按钮定位；本轮已补跑业务列表相关 7 个定向 L1 场景通过，未改 schema、RBAC、菜单、Workflow / Fact、客户配置或打印工作台逻辑。

## 2026-06-20 业务表格省略号强制规则

- 完成：共享 `BusinessDataTable` 和来源导入选择弹窗在运行时剥离列配置中的 `ellipsis`，避免后续页面私有列定义重新把业务列裁成省略号。
- 完成：新增 `moduleTableColumns` 静态测试，扫描 `web/src/erp` 非测试源码中的列配置；出现 `ellipsis:` 即让 `pnpm test` 失败。
- 完成：同步 `AGENTS.md` 和 `docs/product/自动化测试策略.md`，把业务主表、正式业务列表、导入选择弹窗和明细表格列禁止省略号写成项目规则和 T5 验收硬失败项。
- 下一步：若后续发现某页字段过长，优先调整业务列宽、横向滚动、换行、语义合并或详情入口，不恢复 AntD 省略列。
- 阻塞/风险：本轮不改变 schema、RBAC、菜单、Workflow / Fact、后端事实写入或文档清单分类；非表格列的小标签、导航项、下拉项仍可在不影响业务记录识别时使用省略。

## 2026-06-20 停用主数据引用后端治理

- 完成：新增 biz 层小型 active reference guard，并在采购入库手工新增行、BOM 新建 / 明细 / 激活、生产事实新建、手工出货 / 手工出货行和手工库存预留显式接入启用态校验；历史来源链路、取消、冲正、归档不按当前主数据启用态粗暴拦截。
- 完成：Inventory / OperationalFact data repo 补充材料、产品、SKU、单位、仓库、客户的 `is_active` 查询；JSON-RPC 错误映射改为中文业务提示，不直接透传 Go error。
- 完成：补充采购入库、BOM、OperationalFact 相关测试用例，覆盖停用主数据新增引用被拒绝，以及历史取消、释放、归档路径不被误伤；同步 `docs/当前真源与交接顺序.md` 的当前口径。
- 下一步：采购退货、来料质检、采购入库调整继续按来源链路和事实状态治理；若后续要拦截无来源的手工退货 / 调整，应先单独评审业务语义和测试样本。
- 阻塞/风险：当前工作区已有与本轮无关的 `server/internal/data/model/schema/user.go`、`server/internal/biz/user_admin.go` 等删除，导致 data/service 包构建被 Ent 旧生成物阻塞；本轮未恢复、未重生成 Ent、未跑 migration，也未改前端候选 helper。

## 2026-06-20 普通 users 账号链路退出

- 完成：移除旧 `/login` 普通用户登录页和 `/admin-accounts` / `/admin-users` 普通账号管理页入口；`/login` 兼容重定向到 `/admin-login`，旧账号管理 URL 兼容重定向到权限中心。
- 完成：移除普通 `auth.login`、`sms_login scope=user`、`user` JSON-RPC 域、`AuthUsecase`、`UserAdminUsecase`、旧 data repo、旧 token generator 和相关测试隐藏真源；管理员登录、岗位任务端、RBAC 和审计继续走 `admin_users`。
- 完成：删除 `User` Ent schema，执行 `make data` 生成 Ent 代码和 Atlas migration `20260620142942_migrate.sql`，并对当前 dev DB 执行 `make migrate_apply` drop `users`；`make migrate_status` 已 pending 0，`to_regclass('public.users')` 返回空。
- 完成：同步 README、`docs/当前真源与交接顺序.md`、`server/docs/api.md`、`server/internal/service/README.md`、`web/README.md` 和前端 mock，明确旧普通账号链路已退出，账号和岗位任务端统一使用 `admin_users`、角色和权限码。
- 下一步：若后续需要非管理员协作账号，必须重新评审账号模型、RBAC、审计、岗位入口和 schema，不复用旧 `users` / `user` JSON-RPC 隐藏链路。
- 阻塞/风险：当前工作区仍有多处本轮之外的脏改动未归并，本轮未回退；已验证 `go test ./...`、`pnpm test -- --run src/common/utils/jsonRpc.test.mjs`、`pnpm build`、`make migrate_status`。

## 2026-06-20 停用主数据引用 guard 续补

- 完成：`OperationalFactUsecase` 补齐委外事实新建的材料 / 成品、仓库、单位、可选供应商启用态校验；已过账委外事实取消仍按历史事实链路处理，不因当前主数据停用被阻断。
- 完成：手工财务事实新增客户 / 供应商 counterparty 启用态校验；从已出货 shipment 派生的应收 / 发票保留来源链路语义，不按当前 counterparty 启用态粗暴拦截。
- 完成：补充采购订单来源入库、销售订单来源出货 / 预留、手工出货停用 SKU、inventory 内部写入原语等测试；同步当前真源文档说明 inventory 直接写 usecase 是内部事实 / 来源 / 冲正原语，不作为手工新增入口加 active guard。
- 下一步：若后续开放库存写入、盘点调整、批次状态变更或无来源退货 / 调整的外部 JSON-RPC，必须在对应业务 usecase 单独评审 active guard、RBAC、审计和来源链路测试。
- 阻塞/风险：本轮不改 schema、不跑 migration、不新增 tenant_id / 多租户 / license / 删除 / 回收站；当前工作区仍有其他会话的普通 users 退出和前端页面治理脏改动，本轮未回退也未归并。

## 2026-06-20 Codex 代码审查 skill 补充

- 完成：新增 `.agents/skills/plush-code-review-governance/`，作为 plush 项目独立代码审查入口，覆盖任意会话中的 worktree / staged diff / commit review；审查重点收口到 Workflow / Fact、RBAC、字段残值 / 缺值、删除 / 回收站、客户差异、文档漂移和验证盲区。
- 完成：同步根 `README.md` 中 `.agents/skills/` 职责，从文档治理 / 页面治理扩展为文档治理、页面治理和代码审查；本轮未更新 docs 清单，因为未新增或调整 `docs/` 长期文档。
- 验证：追加前 `progress.md` 为 100 行、14075 字节，未达到归档阈值；已执行 `quick_validate.py`（通过临时 PyYAML 路径）验证 `code-review-governance` 与 `plush-code-review-governance` 均通过；已执行 Ruby YAML 解析、TODO / 默认提示扫描、`git diff --check -- .agents/skills/plush-code-review-governance README.md progress.md`，通过。
- 下一步：后续 review 可直接在独立会话或当前会话使用 `$plush-code-review-governance`；如同时涉及页面或文档治理，可再并用对应项目 skill。
- 阻塞/风险：本轮只新增 Codex skill 和入口说明，不改运行时代码、schema、migration、RBAC、菜单、Workflow / Fact、部署或正式产品能力。

## 2026-06-20 Codex skill UI 名称英文化

- 完成：将 `.agents/skills/plush-code-review-governance/agents/openai.yaml` 的 `display_name` 改为英文 `Plush Code Review Governance`；项目内 docs/page governance 的 `display_name` 已是英文，无需改动。
- 验证：追加前 `progress.md` 为 108 行、15407 字节，未达到归档阈值；已扫描相关 skills 的 `display_name`，确认无中文命中；后续以 skill 正文保持中英结合，UI chip 名称保持英文。
- 下一步：如 Codex UI 仍显示旧名称，重新打开会话或等待 skill metadata 刷新。
- 阻塞/风险：本轮只改 skill UI metadata，不改 `SKILL.md` 规则正文、运行时代码、schema、RBAC、菜单或文档真源。

## 2026-06-20 业务列表筛选补齐

- 完成：销售订单、采购订单、委外订单补齐客户 / 供应商等引用筛选；出货单补齐搜索、客户、产品、仓库筛选；采购入库、来料质检、库存台账和 Operational Fact 页补齐日期、状态、搜索或业务引用筛选，并统一走后端 JSON-RPC 参数和 repo 查询。
- 完成：服务端为采购入库、来料质检、库存批次 / 流水、生产 / 委外 / 出货 / 库存预留 / 财务事实补齐筛选参数解析和 Ent 查询；新增日期上限归一化，避免 `date_to` 只命中当天 00:00 导致漏数据。
- 验证：追加前 `progress.md` 为 115 行、16153 字节，未达到归档阈值；已执行 `go test ./...`、`pnpm lint`、`pnpm css`、`pnpm test`、目标 `STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-order-date-filter-desktop,shipment-date-filter-desktop,shipment-date-filter-mobile,purchase-receipts-table-control-columns-desktop,purchase-receipt-create-modal-desktop pnpm style:l1`、`git diff --check`，均通过。
- 下一步：如要继续扩大筛选语义，应优先补后端真源字段和列表查询测试，再接页面控件；不要在前端做页面私有假过滤。
- 阻塞/风险：完整 `pnpm style:l1` 仍被本轮无关的 `print-workspace-material-row-selection-reset` 场景阻塞在“删除当前行”按钮定位；本轮未改 schema、migration、RBAC、菜单、Workflow / Fact 写入语义、原型状态或 docs 清单。

## 2026-06-21 权限中心主次 tab 收口

- 完成：权限管理页改为“角色模板 / 管理员账号”页内 tab，默认打开“角色模板”，让角色权限维护成为首屏主路径；“管理员账号”承接账号搜索、创建管理员、分配角色和重置密码。
- 完成：补齐权限中心 tab 浅色 / 暗色样式和窄屏 tab 宽度规则；L1 回归从旧的“管理员模块在前”改为默认角色模板、切换管理员账号后再验证搜索、刷新、创建弹窗和重置密码焦点。
- 验证：追加前 `progress.md` 为 115 行、16153 字节，未达到归档阈值；已执行目标 ESLint（`PermissionCenterPage.jsx`、`styleL1.mjs`、`scenarios.mjs`）、`pnpm --dir web css`、权限工具定向单测、`STYLE_L1_SCENARIOS=permission-center-loading-state,permission-center-desktop pnpm --dir web style:l1`、`pnpm --dir web test`、目标 `git diff --check`，均通过。
- 下一步：后续真正接客户角色模板 runtime loader 时，继续复用当前角色模板 tab，不新增前端本地权限真源。
- 阻塞/风险：本轮只改权限中心前端信息架构、样式、L1 回归和过程记录；未改后端 RBAC、权限码、schema、migration、菜单入口、客户配置 loader、Workflow / Fact、部署或原型状态。当前工作区仍有其他会话 / 既有后端和业务页脏改动，本轮未回退、未归并。

## 2026-06-21 权限中心 tab 后顶部色条降级

- 完成：移除权限管理页“角色模板 / 管理员账号”卡片顶部蓝 / 绿强调线；tab 已承担当前视图识别，卡片保留中性边框和背景，暗色模式同步改为中性卡片面。
- 完成：L1 增加权限中心默认角色模板模块“不再显示顶部强调线”的断言，防止后续样式回退。
- 验证：追加前 `progress.md` 为 131 行、19084 字节，未达到归档阈值；已执行目标 ESLint（`styleL1.mjs`）、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=permission-center-loading-state,permission-center-desktop pnpm --dir web style:l1`，均通过。
- 下一步：如后续继续压缩权限中心视觉层级，优先围绕 tab、表格和角色详情区域做局部回归，不新增原型或菜单语义。
- 阻塞/风险：本轮只改权限中心局部样式和 L1 断言；未改 RBAC、权限码、schema、migration、菜单入口、客户配置、Workflow / Fact、部署或原型状态。当前工作区仍有其他会话 / 既有后端和业务页脏改动，本轮未回退、未归并。

## 2026-06-21 权限中心旧权限清理与权限项排版

- 完成：后端权限列表只返回 `server/internal/biz/rbac.go` 当前内置权限；RBAC seed 会清理已退出的旧内置 `permissions` 行和对应 `role_permissions` 绑定，避免 `business.record.*`、`erp.help_center.read` 等历史残留继续出现在权限中心。
- 完成：权限中心权限项改为“中文名称 + 单独权限码”两行展示，并补齐 `outsourcing`、`shipment` 模块中文标题；L1 增加权限项不横向溢出、不显示旧权限码的浏览器断言。
- 完成：`docs/roles/角色权限矩阵第一版.md` 同步权限中心只展示当前 RBAC 真源、旧内置权限由 seed 和列表接口收口的口径。
- 验证：追加前 `progress.md` 为 139 行、20207 字节，未达到归档阈值；已执行 `go test ./internal/data -run 'TestSeedBuiltinRBACPrunesStaleBuiltinPermissions|TestListPermissionsHidesRowsOutsideRBACSource|TestLoadAdminRBAC'`、`go test ./internal/biz ./internal/data ./internal/service`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=permission-center-loading-state,permission-center-desktop pnpm --dir web style:l1`、`git diff --check`，均通过。
- 下一步：后续如继续调整角色模板，应优先保持后端 RBAC 真源、seed、列表 API 和权限中心展示一致，不在前端恢复旧权限码兼容。
- 阻塞/风险：本轮未直接修改本地开发库数据；旧内置权限行会在新代码 seed 执行时被清理，即使尚未清理，列表接口也不会继续返回。当前工作区仍有本轮前已有的权限中心样式 / progress 改动，本轮未回退、未归并。

## 2026-06-21 权限中心查看与操作体验优化

- 完成：权限中心角色模板页增加权限搜索工具栏、“只看已选”、分组全选 / 清空和未保存状态提示；保存按钮只在权限组合实际变更后可用，避免无差别重复保存。
- 完成：重整角色模板区域视觉层级，角色列表、角色详情头部、权限矩阵工具栏和底部保存区改为更清晰的中性卡片层级；暗色模式和窄屏响应式同步覆盖。
- 完成：账号权限不足提示改为按缺失能力精确说明，区分创建管理员、更新管理员和管理角色权限，不再只给笼统的“部分权限结果”提示。
- 验证：追加前 `progress.md` 为 148 行、21921 字节，未达到归档阈值；已执行 `pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=permission-center-loading-state,permission-center-desktop pnpm --dir web style:l1`、`git diff --check`，均通过。
- 下一步：如继续优化，可补权限中心窄屏专用 L1 断言，或进一步收敛管理员账号 tab 的批量操作体验；仍应保持后端 RBAC 真源，不在前端新增权限码真源。
- 阻塞/风险：本轮只改权限中心页面、局部样式、L1 回归和过程记录；未改后端 RBAC、权限码、schema、migration、菜单入口、客户配置、Workflow / Fact、部署或原型状态。当前工作区仍有其他会话 / 既有后端和业务页脏改动，本轮未回退、未归并。

## 2026-06-21 权限中心语义与权限守卫修复

- 完成：修正创建管理员时分配角色的权限边界；后端 `admin.create` 只有在同时具备 `system.user.update` 时才接受非空 `role_keys`，前端缺少更新管理员权限时只能创建无角色账号并给出说明。
- 完成：启停管理员改按 `system.user.disable` 单独判断，更新管理员权限只负责分配角色、手机号和重置密码；页面受限提示按查看、创建、更新、启停和角色权限管理分别说明。
- 完成：角色模板加载按当前账号权限分层读取管理员列表和 RBAC 选项；角色切换会在存在未保存权限调整时确认放弃，停用角色详情只读；“关键入口 / 高风险能力”纳入 debug 和高风险业务动作。
- 完成：权限中心 L1 回归补充未保存切换角色确认断言；服务端补充创建管理员带角色需要更新权限的 JSON-RPC 单测。
- 验证：追加前 `progress.md` 为 157 行、23434 字节，未达到归档阈值；已执行 `go test ./internal/service -run 'TestJsonrpcDispatcher_AdminCreateWithRolesRequiresUpdatePermission|TestJsonrpcDispatcher_AdminResetPassword'`、`go test ./internal/service`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=permission-center-loading-state,permission-center-desktop pnpm --dir web style:l1`、`git diff --check`，均通过。
- 下一步：如后续继续细分系统权限，可评审是否单独拆出“重置密码”权限码；当前仍复用 `system.user.update`，不在本轮新增权限码。
- 阻塞/风险：本轮未改 schema、migration、菜单结构、Workflow / Fact、客户配置、部署或原型资产；`AGENTS.md` 和原型 README 只读不改。当前工作区仍有其他会话 / 既有采购、质检、出货等脏改动，本轮未回退、未归并。

## 2026-06-21 岗位任务端状态语义色

- 完成：岗位任务端已办页进度摘要增加待处理 / 处理中 / 卡住 / 完成 tone class，数字和标签按轻量语义色显示，仍保持只读摘要语义。
- 完成：“我的”页待办 / 已办 / 超时 / 风险快捷入口增加左侧语义色条、同色数字和箭头，并同步浅色 / 暗色变量；入口仍只做任务筛选 / 跳转，不新增 Workflow / Fact 或权限语义。
- 完成：`style:l1` 岗位任务端断言补充语义色校验，覆盖进度摘要 tone class、快捷入口左侧色条、数字 / 箭头色彩一致性、待办页风险摘要原有橙 / 红状态色和横向溢出。
- 验证：追加前 `progress.md` 为 167 行、25327 字节，未达到归档阈值；已执行 `pnpm --dir web css`、`pnpm --dir web test`、`node --check web/scripts/style-l1/mobileTaskAssertions.mjs`、`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm --dir web style:l1`，均通过。
- 下一步：如继续优化岗位任务端视觉，可再补浅色专用 L1 截图断言或扩展到消息卡片 tone，但仍应保持颜色只表达任务状态和动作入口优先级。
- 阻塞/风险：本轮只改岗位任务端前端展示、L1 回归和过程记录；未改后端、RBAC、权限码、schema、migration、菜单、客户配置、Workflow / Fact、部署或原型状态。当前工作区仍有其他会话 / 既有后端和业务页脏改动，本轮未回退、未归并。

## 2026-06-21 业务页筛选与跳转闭环收口

- 完成：采购入库补齐供应商、采购订单来源和入库单上下文筛选；来料质检补齐采购订单 / 入库单上下文筛选并改为仓库主数据选项；出货单、库存台账、Operational Fact、采购订单、销售订单之间的相关操作统一携带 route query，并去掉没有直接逻辑闭环的销售订单财务 / 库存、采购订单库存直达入口。
- 完成：后端采购入库和来料质检 JSON-RPC / usecase / repo 补齐 `supplier_name`、`purchase_order_id` 等筛选参数；Workflow V1 页面增加到期日期筛选；单日期类型的 `DateRangeFilter` 改为只读日期类型标签，避免无意义下拉。
- 完成：修正打印工作台 L1 场景按钮文案锚点，从旧“删除当前行”同步为当前“移除当前行”，不改变打印工作台运行时行为。
- 验证：追加前 `progress.md` 为 176 行、26756 字节，未达到归档阈值；已执行 `gofmt`、`git diff --check`、`go test ./internal/service ./internal/biz ./internal/data`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、定向 `STYLE_L1_SCENARIOS=print-workspace-material-row-selection-reset,print-workspace-processing-row-selection-reset pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=dev-testing-light-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-collaboration-purchase-selected-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=shipment-date-filter-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=shipment-date-filter-mobile pnpm --dir web style:l1`，均通过。
- 下一步：如继续扩展搜索和筛选，仍应优先补后端参数和 repo 查询测试；生产 / 委外事实从库存流水反跳目标事实页仍需先评审事实 ID 与 source_id 语义，避免用前端 query 伪造闭环。
- 阻塞/风险：完整 `pnpm --dir web style:l1` 曾在全量长跑中出现 dev server `ERR_CONNECTION_REFUSED`，换端口后长时间无输出已手动中断；本轮已用直接相关单场景覆盖。未改 schema、migration、RBAC、菜单结构、客户配置、部署或原型资产；当前工作区仍有权限中心、岗位任务端等其他会话脏改动，本轮未回退、未归并。

## 2026-06-21 岗位任务端详情操作体验收口

- 完成：岗位任务端详情页移除没有真实结果的“编辑查看详情 / 查看全部”按钮和关联单据箭头，降级为“摘要 / 来源 / 最近一条”只读元信息，避免现场用户误以为可进入未接通页面。
- 完成：跨岗位可见任务在动作栏增加不可代办提示，说明当前岗位只能查看 / 催办，处理、阻塞和完成仍由任务 owner 岗位负责；保留按钮禁用态，不改变后端 RBAC、Workflow 或 Fact 语义。
- 完成：清理已办页进度摘要里遗留的旧点击元数据；同步 `mobile-role-tasks-v1/implemented-reference.html` 当前实现参考，并扩展 `mobile-tasks-dark` L1 断言覆盖无假按钮、跨岗位提示、暗色可读性和横向溢出。
- 验证：追加前 `progress.md` 为 185 行、29172 字节，未达到归档阈值；已执行 `node --check web/scripts/style-l1/mobileTaskAssertions.mjs`、`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`node --test src/erp/config/devPrototypes.test.mjs`、`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm --dir web style:l1` 和目标 `git diff --check`，均通过。
- 下一步：如后续要从任务详情跳转到真实业务单据，应先评审目标路由、RBAC、source_type 到正式页面的映射和不可见 / 无权限状态，再恢复可点击入口。
- 阻塞/风险：本轮未改 schema、migration、后端 RBAC、菜单入口、WorkflowUsecase、Fact usecase、客户配置、部署或 PNG 历史参考；`AGENTS.md`、当前真源和原型 README 只读不改。当前工作区仍有其他会话 / 既有后端、权限中心和业务页脏改动，本轮未回退、未归并。

## 2026-06-21 阿里云 PNVS 短信登录接入

- 完成：短信登录 `provider` 模式接入阿里云号码认证 PNVS，后端通过 `SendSmsVerifyCode` 发送验证码、`CheckSmsVerifyCode` 核验验证码；`auth.capabilities` 在 provider 模式返回可用且不暴露 `mock_code`。
- 完成：`AdminAuthUsecase` 改为注入 `SMSLoginCodeProvider`，发送前仍先校验 `admin_users.phone` 绑定、管理员启用态和岗位任务端 `mobile.<role>.access` 权限；本轮不新增注册、账号模型、schema、migration、菜单或 Workflow / Fact 逻辑。
- 完成：生产启动校验、部署 preflight、Compose 环境透传和部署 / API / 配置 / 当前真源文档同步 provider 口径；阿里云 AK 只允许通过运行时 env / 密钥管理注入，不写入仓库。
- 验证：追加前 `progress.md` 为 194 行、30913 字节，未达到归档阈值；已执行临时 SDK 向已授权手机号实发 PNVS 验证码、`go test ./...`、`go test ./cmd/server ./internal/data ./internal/service ./internal/biz`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test -- authCapabilities`、`bash scripts/deploy/production-preflight.sh --example --skip-compose-config`、provider 临时 env 的 `bash scripts/deploy/production-preflight.sh --env-file <tmp> --skip-compose-config`、`git diff --check`，均通过。
- 下一步：将目标环境 `.env` 设置为 `APP_AUTH_SMS_MODE=provider` 并注入 `APP_AUTH_SMS_ALIYUN_ACCESS_KEY_ID`、`APP_AUTH_SMS_ALIYUN_ACCESS_KEY_SECRET`、`APP_AUTH_SMS_ALIYUN_SIGN_NAME=速通互联验证码`、`APP_AUTH_SMS_ALIYUN_TEMPLATE_CODE=100001` 后重启服务，再用已绑定手机号的管理员账号做一次登录页端到端回归。
- 阻塞/风险：本轮未把真实 AK 写入仓库，也未在项目后端长期运行态中用真实 `.env` 直连实发；已完成的真实短信验证来自临时 SDK 和同一 PNVS 参数。当前工作区仍有本轮前已有的权限中心、岗位任务端、采购 / 质检和业务页等脏改动，本轮未回退、未归并。

## 2026-06-21 登录页短信提示视觉降级

- 完成：短信验证码发送成功提示从 AntD 默认满宽 info alert 降级为登录页专用轻量状态胶囊，保留“验证码已发送”反馈语义，但不再和主登录按钮争抢视觉层级；暗色主题同步使用低饱和绿色状态面。
- 完成：`style:l1` 登录页主题场景补充短信发送 mock 和短信提示盒模型断言，覆盖浅色 / 暗色下提示宽度、高度、按钮间距、文字溢出和对比度。
- 验证：追加前 `progress.md` 为 203 行、32983 字节，未达到归档阈值；已执行 `node --check web/scripts/styleL1.mjs web/scripts/style-l1/scenarios.mjs web/scripts/style-l1/systemRpcMocks.mjs`、`STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop pnpm --dir web style:l1`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、Playwright 桌面 provider 提示盒模型抽查和移动端长 mock 文案盒模型抽查，均通过。
- 下一步：如后续继续优化登录页，可单独评审是否降低入口 segmented 高度或压缩卡片垂直间距；本轮不改变登录方式、入口选择或认证流程。
- 阻塞/风险：本轮未改后端、schema、migration、RBAC、菜单、Workflow / Fact、客户配置或原型资产；`styleL1.mjs`、`scenarios.mjs`、`theme-overrides.css` 当前仍包含本轮前已有的权限中心等未提交改动，本轮只追加登录页短信提示相关逻辑。

## 2026-06-21 登录页刷新状态保持

- 完成：统一登录页手动选择的“后台管理 / 岗位任务端”和“密码登录 / 短信登录”刷新后保持；从具体后台或岗位任务端路径回登录页时仍优先尊重来源路径语义。
- 完成：短信验证码发送后的手机号、提示和前端倒计时写入当前标签页 sessionStorage，刷新后继续显示剩余等待时间并禁用“获取验证码”；真实重发频控和验证码校验仍以后端为准。
- 完成：修正 `useAuthCapabilities` 对被 `JsonRpc` 包装的 AbortError 误判为能力失败的问题，避免 React 开发模式刷新时把短信能力短暂判成 disabled 并覆盖回密码登录。
- 完成：`adminLoginState` 增加登录方式偏好和短信倒计时状态单测，登录页 L1 增加刷新后入口 tab、短信 tab、手机号和倒计时禁用态断言；`web/README.md` 与 `docs/当前真源与交接顺序.md` 同步刷新保持口径。
- 验证：追加前 `progress.md` 为 211 行、34447 字节，未达到归档阈值；已执行目标 Playwright 探针、`node --test src/common/auth/authCapabilities.test.mjs src/pages/AdminLogin/adminLoginState.test.mjs src/pages/AdminLogin/adminLoginRouting.test.mjs`、`pnpm --dir web lint`、`STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop pnpm --dir web style:l1`、`pnpm --dir web test`、`pnpm --dir web css`、`git diff --check`，均通过。
- 下一步：如后续继续增强短信登录，可补真实 provider 模式下的端到端登录回归；当前前端刷新保持不替代后端频控、手机号绑定和岗位权限校验。
- 阻塞/风险：本轮只改登录页状态保持、认证能力加载 abort 识别、相关测试和文档口径；未改 schema、migration、RBAC、菜单、Workflow / Fact、短信 provider 后端实现或账号数据。当前工作区仍有其他会话 / 既有短信 provider、权限中心、业务页和岗位任务端脏改动，本轮未回退、未归并。

## 2026-06-21 短信 provider 运行态与不可用提示

- 完成：本地后端已用阿里云 PNVS env 启动到 `provider` 模式，`auth.capabilities` 经 `8300` 和前端代理 `5175` 均返回 `mode=provider`、`mock_delivery=false`；已向 `13794566255` 实发一次验证码，返回不包含 `mock_code`。
- 完成：阿里云发送失败、套餐余量不足或服务商拒绝发送时，provider 错误统一包裹为 `ErrSMSServiceUnavailable`，JSON-RPC 返回 `AuthSMSServiceUnavailable`，前端统一提示“短信服务暂不可用，请稍后再试或联系管理员”。
- 完成：登录页在 provider 能力加载后会清理旧 mock 模式残留的“临时验证码”提示和倒计时；provider 模式下真实发送成功仍保留手机号、提示和倒计时刷新状态。
- 完成：同步 `server/docs/api.md`、`server/docs/config.md`、`web/README.md` 和 `docs/当前真源与交接顺序.md` 的短信 provider 失败口径；`docs/文档清单.md` 未改，因为没有新增、删除、重命名或改变长期文档分类。
- 验证：追加前 `progress.md` 为 221 行、36458 字节，未达到归档阈值；已执行 `go test ./internal/errcode ./internal/biz ./internal/data ./internal/service`、`pnpm --dir web test`、`pnpm --dir web lint`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop pnpm --dir web style:l1`，均通过；运行态已用 `curl` 确认 provider 能力。
- 下一步：如果要把目标服务器也切到 provider，需要把同一组阿里云 PNVS env 注入目标环境 `.env` 并按部署流程重启，再用已绑定手机号管理员做一次端到端登录回归。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact、客户配置、部署脚本或生产 `.env`；真实 AK 只在本地运行进程 env 中使用，未写入仓库、日志、trace 或文档。

## 2026-06-21 短信错误提示矩阵

- 完成：短信 provider 错误从单一不可用提示拆成频控、额度耗尽和服务不可用三类；阿里云 `BUSINESS_LIMIT` / 频繁类错误返回 `AuthSMSCodeTooFrequent`，套餐 / 余额 / 额度不足返回 `AuthSMSServiceQuotaExceeded`，服务异常、网络超时或服务商拒绝发送 / 核验返回 `AuthSMSServiceUnavailable`。
- 完成：验证码核验阶段同步收口 provider 错误，验证码过期返回 `AuthSMSCodeExpired`，验证码错误返回 `AuthInvalidSMSCode`，阿里云核验接口异常返回 `AuthSMSServiceUnavailable`；前端错误消费层补齐精确中文提示，不透传阿里云原始错误。
- 完成：补齐 fake provider / mock 单测，覆盖发送太频繁、额度不足、服务异常、核验异常、验证码过期和验证码错误；本轮未反复调用真实阿里云发送接口，避免额外扣量。
- 完成：同步 `server/docs/api.md`、`server/docs/config.md`、`web/README.md` 和 `docs/当前真源与交接顺序.md` 的短信错误提示口径；`docs/文档清单.md` 未改，因为没有新增、删除、重命名或改变长期文档分类。
- 验证：追加前 `progress.md` 为 231 行、38368 字节，未达到归档阈值；已执行 `go test ./internal/errcode ./internal/biz ./internal/data ./internal/service`、`bash scripts/qa/error-code-sync.sh && bash scripts/qa/error-codes.sh`、`pnpm --dir web test`、`pnpm --dir web lint`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop pnpm --dir web style:l1`、`make build`、`git diff --check`，均通过；已重启本地后端，`8300` 和 `5175` 均确认 `mode=provider`、`mock_delivery=false`。
- 下一步：如后续拿到阿里云更细错误码样本，可继续补充分类 helper 的关键字和单测；目标服务器切换 provider 仍需单独走部署 `.env` 注入、重启和端到端登录回归。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact、客户配置或生产 `.env`；错误分类来自阿里云响应形态的 mock 覆盖，不包含所有未来未知服务商错误码，未知错误会保守落到“短信服务暂不可用”。

## 2026-06-21 登录页短信提示与验证码错误间距

- 完成：修正登录页短信提示胶囊对上一行的负外边距，避免“请输入验证码”校验文案和短信提示互相遮挡；页面主语义不变，短信提示仍作为发送验证码后的操作反馈。
- 完成：`style:l1` 登录页主题场景新增验证码为空错误态断言，覆盖短信提示和验证码错误文案的盒模型边界，避免提示压住字段校验反馈。
- 验证：追加前 `progress.md` 为 241 行、40593 字节，未达到归档阈值；已执行 `STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop pnpm --dir web style:l1`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`，均通过。
- 下一步：如后续继续压缩登录页垂直密度，应同时保留字段错误文案、短信提示和主按钮之间的独立占位，并扩展 L1 盒模型断言。
- 阻塞/风险：本轮只改登录页局部样式和浏览器级回归断言；未改后端短信 provider、schema、migration、RBAC、菜单、Workflow / Fact、客户配置或原型资产。

## 2026-06-21 岗位端退出后后台返回隔离

- 完成：修正桌面统一入口里的岗位端返回守卫；同一 SPA 会话中当前入口已明确选择后台时，浏览器 POP 回旧 `/m/<role>/tasks` 会被替换到后台看板，避免退出岗位端后重新登录后台仍可通过浏览器返回看到岗位任务端首页。
- 完成：`smoke:mobile-auth-login-route` 新增恢复态覆盖：岗位端登录、退出、选择后台管理重新登录、浏览器返回后不得恢复旧岗位任务端；同时为后台看板 workflow 请求补独立 mock，避免把后台请求误判成岗位端请求。
- 验证：追加前 `progress.md` 为 249 行、41701 字节，未达到归档阈值；已执行 `pnpm --dir web css`、`MOBILE_AUTH_SMOKE_APP_ID=mobile-warehouse pnpm --dir web smoke:mobile-auth-login-route`、`pnpm --dir web lint`、`pnpm --dir web test`、`git diff --check -- web/src/erp/router.jsx web/scripts/mobileAuthLoginRouteSmoke.mjs`，均通过；`pnpm --dir web test` 共 380 个前端单测通过。
- 下一步：如后续要把浏览器返回从 `/admin-login` 进一步统一替换回 `/erp/dashboard`，应作为登录页历史栈体验专项处理，并覆盖后台登录页 BFCache / history 恢复态。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact、客户配置或后端认证；定向浏览器回归覆盖仓库岗位端，未机械全跑 8 个岗位角色。

## 2026-06-21 后台与岗位端双向历史隔离

- 完成：把入口历史守卫从浏览器 `POP` 事件判断改为当前入口选择与当前路径合法性判断；当前入口为岗位任务端时，访问或返回到 `/erp/*` 会被替换回当前可用岗位任务端，当前入口为后台时，访问或返回到 `/m/<role>/tasks` 会替换回后台看板。
- 完成：修正登录页刷新后的反向串入口；`smoke:mobile-auth-login-route` 新增“后台登录历史存在 -> 清登录态进入登录页 -> 刷新登录页 -> 选择岗位任务端登录 -> 浏览器返回仍停留岗位任务端”的断言。
- 验证：追加前 `progress.md` 为 257 行、43153 字节，未达到归档阈值；已执行 `MOBILE_AUTH_SMOKE_APP_ID=mobile-warehouse pnpm --dir web smoke:mobile-auth-login-route`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`，均通过；`pnpm --dir web test` 共 380 个前端单测通过。
- 下一步：如后续仍要允许同一登录态下从岗位端直接切后台，应走 `/entry` 显式切换入口并更新入口选择，不应依赖浏览器后退穿透旧历史。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact、客户配置或后端认证；浏览器回归仍按影响面覆盖仓库岗位端，未全量跑 8 个岗位角色。

## 2026-06-21 入口返回无闪烁隔离

- 完成：将后台 / 岗位端入口隔离从全局 `useLayoutEffect` 事后跳转改为 `/erp` 与 `/m/:roleKey` 路由壳同步判断；当前入口不匹配时直接返回 `Navigate replace`，不挂载错误入口页面，避免浏览器返回时先短暂渲染串页内容。
- 完成：保留岗位端最近路径记录用于后台误入时回到当前可用岗位；若当前入口为后台，岗位端路由壳会在渲染任务页前直接回后台看板。未新增页面文案、按钮、菜单、RBAC 或业务事实能力。
- 验证：追加前 `progress.md` 为 265 行、44506 字节，未达到归档阈值；已执行 `pnpm --dir web lint`、`MOBILE_AUTH_SMOKE_APP_ID=mobile-warehouse pnpm --dir web smoke:mobile-auth-login-route`、`pnpm --dir web css`、`pnpm --dir web test`、`git diff --check`，均通过；smoke 增加返回后 700ms 正文采样，确认未短暂出现旧岗位端“登录与安全”或后台“看板中心 / 今日工作台”文案。
- 下一步：如后续要支持同一已登录状态下主动跨入口，应提供明确的“切换入口”动作并同步更新入口选择，不应让浏览器后退承担入口切换。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact、客户配置、后端认证或原型资产；浏览器回归按影响面覆盖仓库岗位端，未全量跑 8 个岗位角色。

## 2026-06-21 登录页入口标签降噪

- 完成：去掉统一登录页入口切换控件上方重复可见的“登录入口”表单标签，保留“后台管理 / 岗位任务端”真实入口选项和登录页主标题；入口选择语义通过 `aria-label="登录入口"` 保留给键盘和读屏。
- 完成：`style:l1` 登录页 Segmented 断言补充可见标签移除和入口控件可访问名称检查，避免后续把重复文案加回或丢失无障碍名称。
- 验证：追加前 `progress.md` 为 273 行、45943 字节，未达到归档阈值；已执行 `pnpm --dir web lint`、`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=admin-login-mobile pnpm --dir web style:l1`、`git diff --check -- web/src/pages/AdminLogin/index.jsx web/scripts/styleL1.mjs web/src/common/consts/errorCodes.generated.js`，均通过；`pnpm --dir web test` 共 380 个前端单测通过。
- 下一步：如后续继续压缩登录页密度，可单独评审入口 segmented 高度、登录方式 segmented 和卡片垂直间距，并继续覆盖桌面 / 移动端盒模型。
- 阻塞/风险：本轮未改 schema、migration、后端认证、RBAC、菜单、Workflow / Fact、客户配置、路由、短信登录逻辑或原型资产；当前工作区仍有本轮前已有的 `progress.md`、`web/scripts/mobileAuthLoginRouteSmoke.mjs`、`web/src/erp/router.jsx` 脏改动，本轮未回退、未归并。

## 2026-06-21 Codex 测试治理 skill 补充

- 完成：新增 `.agents/skills/plush-test-governance/`，作为 plush 项目专属测试治理入口，覆盖 T0-T8 测试分层、Workflow / Fact / RBAC / 页面 / import / real-write / release 验证选择和汇报标准；同步根 `README.md` 中 `.agents/skills/` 职责为文档治理、页面治理、代码审查和测试治理。
- 完成：同步新增通用 `~/.codex/skills/test-governance/`，用于跨项目测试分类和验证范围选择；项目内仍以 `.agents/skills/plush-test-governance/` 承载 plush 专属命令与边界。
- 验证：追加前 `progress.md` 为 281 行、47497 字节，未达到归档阈值；已执行 `quick_validate.py` 验证通用 `test-governance` 与项目 `plush-test-governance` 均通过；已执行 Ruby YAML 解析、TODO 扫描、中文 `display_name` 扫描、默认提示扫描和 `git diff --check`，均通过。
- 下一步：后续涉及测试选择、测试补齐、验证范围说明或“是否测试充分”时优先使用 `$plush-test-governance`；只需要通用测试分类时可用 `$test-governance`。
- 阻塞/风险：本轮只新增 Codex skill、README 入口和过程记录，不改运行时代码、schema、migration、RBAC、菜单、Workflow / Fact、页面样式或真实测试脚本；因此未运行前后端业务测试、`style:l1` 或 real-write E2E。

## 2026-06-21 自动化测试策略术语边界补充

- 完成：补充 `docs/product/自动化测试策略.md` 的术语边界，把“架构层级 / 验证层级 T0-T8 / 测试形态 / 证据环境”拆开说明，避免把单元测试、集成测试、smoke、E2E、浏览器回归和部署验证混成同一种测试层级。
- 完成：同步更新 `.agents/skills/plush-test-governance/SKILL.md`，将 T0-T8 口径收敛为验证层级，补充测试形态表和最终回复里的证据环境要求；轻量更新 `.agents/skills/plush-docs-governance/SKILL.md`，要求文档分类矩阵分清架构层级、验证层级、测试形态和证据环境。
- 验证：追加前 `progress.md` 为 289 行、48893 字节，未达到归档阈值；已执行 `git diff --check -- docs/product/自动化测试策略.md .agents/skills/plush-test-governance/SKILL.md .agents/skills/plush-docs-governance/SKILL.md`、Ruby YAML 解析、两个项目 skill 的 `quick_validate.py`，均通过；`rg "项目层级|项目分层|T 级测试|测试层级"` 对本轮三处文件无命中。
- 下一步：后续在最终回复或验收记录里同时说明验证层级、测试形态、证据环境和跳过原因，避免只写“测试通过”；如果要把该口径提升为强制仓库级规则，再单独评审是否改 `AGENTS.md`。
- 阻塞/风险：本轮只改测试策略文档、Codex skills 和过程记录，不改运行时代码、schema、migration、RBAC、菜单、Workflow / Fact、页面样式或真实测试脚本；未新增自动化 runner，未运行 Go、pnpm、`style:l1`、migration 或 real-write E2E。

## 2026-06-21 项目治理口径中心导航

- 完成：在 `docs/当前真源与交接顺序.md` 新增“项目治理口径 / Governance Axes”导航表，集中说明架构责任层级、验证层级 T0-T8、测试形态、证据环境、文档真源层级、原型状态、产品化层级、数据语义层级和交付运行层级分别应该看哪里。
- 完成：在 `docs/product/README.md` 的 reader paths 增加治理口径入口，指向当前真源文档的中心导航，并链接模块边界、自动化测试策略、原型 README 和 `AGENTS.md`，避免在每篇产品文档重复解释。
- 完成：同步 `docs/文档清单.md` 中当前真源文档的当前用途，标明它包含项目治理口径导航，方便从清单层面发现入口。
- 验证：更新前 `progress.md` 为 305 行、51727 字节，未达到归档阈值；已执行 `git diff --check`、治理口径关键词扫描、文档清单命中扫描和目标文档 diff 检查，均通过。
- 下一步：后续新增新的“层级 / 状态 / 形态”口径时，优先更新中心导航和对应专题文档，不在所有文档复制说明。
- 阻塞/风险：本轮只改正式文档和过程记录，不改 runtime、schema、migration、RBAC、菜单、Workflow / Fact、页面样式、测试脚本或 Codex skill；因此未运行 Go、pnpm、`style:l1`、migration 或 real-write E2E。

## 2026-06-21 当前真源索引瘦身

- 完成：将 `docs/当前真源与交接顺序.md` 的“当前业务保存层交接摘录”从长流水改为 10 行摘要表，保留旧 `business_records` 退出、MasterData / Source Document、Inventory / Purchase / Quality / BOM / Outsourcing、Operational Fact、Workflow、生命周期动作、删除 / 归档引用检查边界、RBAC / 菜单、yoyoosun 导入和产品化交付等高风险判断，并把详情导向产品能力台账、证据详情、模块边界和对应专题文档。
- 完成：将“前端文档与开发验收入口”改为 dev-only 入口路由表，集中说明仓库正式文档、旧产品内 docs 退出、正式 ERP 菜单、`/__dev/docs`、`/__dev/testing`、`/__dev/prototypes`、`/__dev/capability-ledger`、`/__dev/customer-config` 和主题 / 打印预览边界；未新增文档、metadata、frontmatter 或 Mermaid 图。
- 验证：追加前 `progress.md` 为 306 行、51913 字节，未达到归档阈值；`docs/当前真源与交接顺序.md` 瘦身后为 159 行、18956 字节；已执行 `git diff --check`、旧长流水关键词反查、目标标题 / dev-only 入口 / 台账链接扫描、目标链接文件存在性检查和 `cd web && node --test src/erp/utils/businessModuleNavigation.test.mjs`，均通过。
- 下一步：后续能力细节、运行时证据和长条目继续写入 `docs/product/产品能力进度台账.md`、`docs/product/产品能力证据详情.md`、`web/README.md` 或专题文档；当前真源索引只保留阅读顺序、禁区和高风险摘要。
- 阻塞/风险：本轮只做正式文档瘦身和过程记录，不改 runtime、schema、migration、API、RBAC、菜单、Workflow / Fact、页面样式、测试脚本、客户原始资料、archive/reference 或目录结构；因此未运行 Go、pnpm、`style:l1`、migration、真实浏览器回归或 real-write E2E。
