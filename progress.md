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
