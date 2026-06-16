# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-15-before-final-bom-closeout.md`：归档截至 2026-06-15 22:42 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 428 行 / 83344 bytes，超过 80KB 阈值；本轮 BOM Version、JSON-RPC service 迁移和全量验收提交前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-08-before-business-records-debug-cleanup.md`：归档截至 2026-06-08 13:50 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 318 行 / 82540 bytes，超过 80KB 阈值；本轮旧 `project-orders` debug cleanup 前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-09-before-brand-config.md`：归档 2026-06-08 21:08 CST 至 2026-06-08 23:07 CST 的过程记录。归档原因：当前 `progress.md` 达到 383 行 / 80205 bytes，超过 80KB 阈值；本轮前端品牌客户配置化前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-10-before-style-l1-stabilization.md`：归档 2026-06-08 23:55 CST 至 2026-06-10 17:34 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 378 行 / 82385 bytes，超过 80KB 阈值；本轮修完整 `style:l1` 稳定性前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-11-before-ui-simplification-rules.md`：归档截至 2026-06-11 14:06 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 395 行 / 80005 bytes，接近并按项目约定视为达到 80KB 归档边界；本轮补 UI 极简不改语义规则前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-12-before-formal-menu-candidate-prototype.md`：归档截至 2026-06-12 18:29 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 425 行 / 81740 bytes，超过 80KB 阈值；本轮补正式菜单候选原型前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-13-before-workbench-prototype-redesign.md`：归档截至 2026-06-13 19:59 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 385 行 / 81720 bytes，达到 80KB 归档边界；本轮重做工作台原型前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-14-before-business-modal-alignment.md`：归档截至 2026-06-14 18:20 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 369 行 / 80362 bytes，达到 80KB 归档边界；本轮继续统一业务新建 / 编辑弹窗前先保留完整现场，再收缩当前入口。

## 当前活跃事项

- `/erp/dashboard` 已作为后台首页 / 工作台首屏：聚合今日必须处理、跨角色阻塞、业务对象、完成率、当前处理、今日焦点、业务状态摘要、业务对象分布、角色提醒和阻塞交接，不再内嵌“看板中心 / 运营工具”卡片导航，也不把核心区域做成跳转入口集合；`/erp/task-board` 独立承接 Workflow 任务看板。
- `BusinessListLayout` 已承接正式业务页共享骨架；`客户档案`、`供应商档案` 和 `销售订单` 使用 V1 页面，`产品档案`、`BOM 管理`、采购、入库、质检、库存、委外、生产、出货和财务等 16 个 `formal-shell` 菜单统一使用 `FormalBusinessModulePage`。共享骨架已收口紧凑筛选、列表统计、列顺序、列排序、导出、批量删除、回收站、行点击选中、双击进入编辑 / 主操作弹窗、当前操作和协同入口；业务对象查看、新建和编辑统一进入业务表单弹窗，formal-shell 真实保存仍待领域 usecase / API / RBAC 接入；协同入口只处理 Workflow 任务，不写事实层。
- `/erp/business-dashboard` 仍只作为运营摘要和业务风险看板，不作为事实真源；`/erp/print-center` 保留模板目录、纸面预览和可编辑打印窗口入口；字段编辑、明细确认和纸面微调回到独立打印窗口；`/erp/operations/exceptions` 作为异常 / 阻塞闭环入口。
- 完整 `pnpm --dir web style:l1` 已恢复通过；后续若继续吸收或评审原型，应继续复用现有页面、现有 Workflow API、现有菜单 / RBAC / theme token，不新增未评审后端 API、schema、migration、权限码或 Fact 写入。
- 业务页协同入口的任务分组、统计、阻塞原因和催办态已收口到纯前端 helper，并纳入 `pnpm test`；该 helper 只服务 Workflow 展示口径，不写事实层。
- `docs/product/prototypes` 当前待实现队列包含工作台 / 总控页、任务中心、业务管理中心、产品核心菜单覆盖矩阵、正式菜单候选导航、业务模块列表页、业务详情页、新建 / 编辑业务表单弹窗、业务页协同入口组件、局部动作弹窗和模板打印中心十一个 HTML 标准样板；只有岗位任务端 `mobile-role-tasks-v1/implemented-reference.html` 登记为当前实现参考。
- 原型查看器和原型 README 已补“参照范围”口径：`admin-command-center-v1` 是判断型工作台样板，`core-menu-coverage-v1` 是内部覆盖矩阵，`formal-menu-candidate-v1` 是正式菜单候选原型；它们都不是正式菜单、路由、权限或 seedData 映射表，真正对应关系必须在进入真实实现任务时回到代码、菜单配置和 RBAC 重新核对。

## 2026-06-16 16:59 CST

- 完成：按 Product Design 原型口径收口业务弹窗控件高度，业务页筛选输入 / 下拉 / 日期输入统一到 36px；业务表单弹窗单行控件统一 36px，textarea 按 3 倍行高，多明细 item 内 textarea 保持单行高度并横向滚动。
- 完成：销售订单和采购订单新建 / 编辑弹窗补“从 SKU / 材料库导入”、已录入条数、数量合计和金额合计；销售新建默认带 1 条空订单行，采购顶部字段改用共享业务表单网格，采购明细数字输入撑满 item 列宽。
- 完成：`style:l1` 新增采购订单新建弹窗断言和截图，覆盖表单弹窗、采购明细、导入入口、录入 / 数量 / 金额统计和控件尺寸。
- 下一步：后续若继续扩展 BOM / 出货等特殊明细弹窗，应按各自真实来源库和字段口径接入导入与统计，不要无脑套 SKU / 材料口径。
- 阻塞/风险：本轮只改前端业务页交互和样式，不改 schema、migration、后端 API、RBAC 或事实层语义；全量 `pnpm --dir web style:l1` 仍受本地 Vite 连接被拒影响未完整收口，目标销售 / 采购业务场景已单独通过。

## 2026-06-16 16:50 CST

- 完成：新增 `create_shipment_with_items` JSON-RPC 方法，复用 `shipment.create` 权限，在后端事务内一次创建出货单头和明细；任一明细保存失败会整体回滚，不留下半成品草稿。
- 完成：出货单页面新建弹窗改用组合接口保存，已存在草稿的加行仍保留 `add_shipment_item` 增量接口；同步 `server/README.md` 和当前真源文档出货单口径。
- 完成：补后端事务回滚、组合接口权限 / 分发测试；为跑通全量相关测试，顺手收口当前工作区已有 admin bootstrap 测试 / env helper 命名冲突和若干前端 lint 未使用变量问题。
- 下一步：出货单新建事务化已完成；后续若继续推进出货能力，应单独评审经手人审计、库位、冻结、装箱 / 物流 / 签收 / 退货或完整财务闭环，不把 `shipment_release done` 当事实入口。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、`shipment_release` workflow 规则、库存出库 / 冲正语义或财务事实门禁；lint 仍保留 4 个既有 hooks warning。

## 2026-06-16 16:47 CST

- 完成：新增 `docs/product/业务主链路数据流向与字段来源规则.md`，把订单到产品 / BOM / 材料 / 仓库 / 出货 / 财务的数据流向收口为 MasterData -> Source Document -> Domain Usecase -> Fact -> Derived 的主路径。
- 完成：明确新建 / 编辑、来源导入、列表、打印和导出字段的来源分级：主数据选择、来源单据带值、动作事实输入、派生展示、客户配置显示、导入候选和人工备注；同步 `docs/product/README.md`、`docs/文档清单.md` 和 `docs/当前真源与交接顺序.md`。
- 下一步：后续进入 runtime 前，先选一个可验证闭环落地，例如销售订单行产品 / SKU / 单位选择、采购订单到采购入库来源带值，或出货单到销售订单来源带值。
- 阻塞/风险：本轮只做正式文档治理，不改 schema、migration、repo/usecase、API、RBAC、前端页面或测试；工作区已有大量非本轮改动，本轮未回退、整理或纳入这些改动。

## 2026-06-16 16:49 CST

- 完成：收紧前端 ESLint 基线，打开 `no-unused-vars`，并将 `react-hooks/exhaustive-deps` 从关闭改为 warning；清理现有 unused import / catch 绑定 / 死变量，修正 BOM、采购订单、权限中心、打印预热、共享业务协同面板和后台账号页的 hooks 依赖声明。
- 完成：验证通过 `pnpm exec eslint --no-fix --ext .js --ext .jsx src/`、`pnpm lint`、`pnpm css`、`pnpm test`、`git diff --check`，并串行补跑 `style:l1` 关键场景：`permission-center-desktop`、`purchase-order-date-filter-desktop`、`business-formal-module-shells-desktop`、`business-module-dark-customers-desktop`、`print-center-desktop`、`print-workspace-material`、`print-workspace-processing`。
- 下一步：如果后续继续提升质量门禁，可在一段时间 warning 清零稳定后再评审是否把 `react-hooks/exhaustive-deps` 升级为 error。
- 阻塞/风险：本轮只处理 ESLint 收紧，不改业务字段、schema、migration、RBAC、菜单或部署；当前工作区已有大量非本轮改动，本轮未回退、整理或纳入这些改动。

## 2026-06-16 16:47 CST

- 完成：收口生产 bootstrap 管理员安全闭环，新增 `runtime_markers` 与 `runtime_audit_events` Ent schema / Atlas migration，用于记录一次性 admin bootstrap marker 和启动审计事件。
- 完成：生产环境只允许在 `BOOTSTRAP_ADMIN_ONCE=true` 且临时注入 `APP_ADMIN_PASSWORD` 时创建初始 super admin；成功后重复 bootstrap 会被 marker 拒绝，已有同名管理员不再被启动逻辑自动提权。
- 完成：同步生产 Compose、preflight、server config 文档、yoyoosun 部署 env 样例 / 校验脚本和当前真源文档；`production-preflight` 会拦截长期保留 `APP_ADMIN_PASSWORD` 或只开 once flag 不给密码的配置。
- 验证：`make data` 通过并生成 `20260616084340_migrate.sql`；`go test ./cmd/server ./internal/data -run 'TestValidateProductionBootstrapConfig|TestInitAdminUsersIfNeeded'` 通过；`go test ./cmd/server ./internal/data` 通过；`bash scripts/deploy/production-preflight.sh --example` 通过；`bash deployments/yoyoosun/scripts/verify-env.sh --example` 通过；`bash -n scripts/deploy/production-preflight.sh deployments/yoyoosun/scripts/verify-env.sh` 通过；补充两组负向 preflight 临时 env 检查通过。
- 下一步：发布前必须先 apply 新 migration，再按首次初始化窗口短暂设置 `BOOTSTRAP_ADMIN_ONCE=true` 与 `APP_ADMIN_PASSWORD`；初始化成功后立即移除密码并恢复 `BOOTSTRAP_ADMIN_ONCE=false`。
- 阻塞/风险：本轮未对任何真实库执行 migration apply、未构建镜像、未部署目标环境；`make data` 在当前脏工作区生成 Ent 代码，生成产物反映了当时所有 schema 现场，新迁移文件本身只包含两个 runtime 表。

## 2026-06-16 16:39 CST

- 完成：继续扫描当前 dev DB 所有 public 表的 text / varchar / json / jsonb 字段，发现并收口 `Phase 7` 试用模拟主数据残留：客户、供应商、联系人、单位、产品、销售订单、销售订单行和订单快照统一改为 `SIM-YOYOOSUN-TRIAL` / `Trial` 口径。
- 完成：补清 `workflow_task_events.reason` 中旧 `Phase 9` 原因文本，并将 `output/customers/yoyoosun/phase*` 历史本地 evidence 目录移动到系统回收站；`output/customers/yoyoosun` 当前不再命中编号 Phase 标签。
- 下一步：如后续需要把 DB 数据扫描变成固定 QA，可单独补一个只读数据边界脚本；当前 `phase-label-boundaries` 仍只负责仓库活跃文件扫描。
- 阻塞/风险：本轮只处理当前 `192.168.0.106:5432/plush_erp` dev DB 和本机 git-ignored output；其他目标环境、其他开发库或已归档历史 evidence 不在本轮扫描范围。

## 2026-06-16 16:38 CST

- 完成：采购订单页复用共享 `DateRangeFilter`，按已有 `purchase_order` JSON-RPC 查询主路径接入采购日期 / 预计到货日期范围筛选；筛选变化会重置分页并传递 `date_field/date_from/date_to`。
- 完成：在模块实施治理中补业务列表筛选规则，明确日期筛选按真实业务日期字段和后端支持接入，桌面端日期类型、开始日期和结束日期作为整体控件展示，不逐页机械复制。
- 完成：`style:l1` 新增 `purchase-order-date-filter-desktop` 场景，验证采购订单页日期筛选整体控件、起止日期同一行、输入不裁切和筛选控件高度对齐；完整 `pnpm --dir web style:l1` 当前 49 个场景通过。
- 下一步：如后续继续补日期筛选，优先评估出货单、采购入库 / 退货 / 调整、质检单和任务看板；客户、供应商、材料、BOM 等主数据页默认不把日期作为首要筛选。
- 阻塞/风险：本轮不改 schema、migration、后端 usecase 或其他业务页；采购订单余额、在途统计、采购需求和应付 / 发票联动仍未实现。

## 2026-06-16 16:36 CST

- 完成：继续按参考图修业务表单弹窗 item 形态，联系人、订单明细、出货明细等条目内部字段不再自动换行；条目内容超出时由 item 区域横向滚动承接。
- 完成：业务弹窗普通输入框从上一轮偏高的 42px 收回到 36px，item 内 textarea 也压回单行高度，避免明细条目被备注字段撑高。
- 下一步：如后续要进一步压缩主表字段密度，可单独评审主表区列宽和 textarea 高度；本轮只改 item 横向滚动与输入高度。
- 阻塞/风险：全量 `style:l1` 当前仍被无关 `print-workspace-material` 采购合同头部 pairCount=0 阻塞；目标业务弹窗场景已通过过滤回归。

## 2026-06-16 16:29 CST

- 完成：复核出货幂等当前状态，确认 `operational_fact_repo_test.go` 已覆盖出货单、出货明细、发货、取消冲正、重复发货和重复取消，状态机与 repo 主路径均保持重复动作无副作用。
- 完成：同步更新 `docs/architecture/出货事实与库存边界评审.md`，移除“shipment 取消还没有专用用例 / 没有正式 shipment 专表”等旧口径，改为当前 `shipments / shipment_items` + `OperationalFactUsecase` + `operational_fact` JSON-RPC 真源。
- 下一步：出货幂等本身无需继续补；后续若要推进，应聚焦库位、独立冻结、经手人审计、装箱 / 物流 / 签收 / 退货和完整财务闭环，不能回到 `shipment_release done` 直接写事实。
- 阻塞/风险：本轮只同步正式文档并跑后端相关包测试，不改 runtime、schema、migration、RBAC、菜单或前端样式；当前工作区仍有其他未提交改动，本轮不接管、不回退。

## 2026-06-16 16:26 CST

- 完成：按参考弹窗视觉修补共享业务表单弹窗样式，增强标题栏、输入框边界、焦点态、明细 / 联系人条目区块、底部操作栏和按钮可见性；客户 / 供应商、销售订单、采购订单、BOM、出货单等复用 `erp-business-action-modal` 的页面同步受益。
- 完成：补齐暗色主题变量和窄屏断点，避免浅色修好后暗色或小屏业务弹窗失真。
- 下一步：如要继续逼近外部 ERP 参考图，可再单独做一轮字段密度和业务表单排版评审；本轮不改业务字段、后端 API 或权限。
- 阻塞/风险：工作区中已有多份文档和服务端文件处于修改状态，本轮不接管、不回退；本轮仅验证前端共享弹窗样式相关路径。

## 2026-06-16 16:20 CST

- 完成：定位任务看板仍出现编号 Phase 的原因是 dev DB 中 2026-06-09 旧模拟 workflow 数据残留，而不是当前 `scripts/qa/phase-label-boundaries.mjs` 漏扫代码；已将 `workflow_tasks`、`workflow_business_states` 和 `workflow_task_events` 中旧 `SIM-YOYOOSUN-PHASE9...` / `Phase 9...` / `phase9_mobile_task` 收口为 `SIM-YOYOOSUN-MOBILE-WORKFLOW...`、`Mobile workflow...` 和 `mobile_workflow_task`。
- 完成：后端 Workflow 创建 / 更新入口增加编号 Phase 标签守卫，拒绝在任务字段、阻塞原因、payload、派生任务或业务状态 payload 中写入新的编号 Phase 标签；同步当前真源文档口径。
- 下一步：如目标环境或其他 dev DB 仍有同类旧模拟数据，需要在对应库单独执行同样的只针对模拟 workflow 数据的改名收口。
- 阻塞/风险：本轮不删除任务、不改 schema、migration、RBAC、Workflow / Fact 边界或事实表；页面是否即时消失取决于当前浏览器和接口缓存，刷新任务看板后应读取到已改名数据。

## 2026-06-16 16:20 CST

- 完成：复核 JSON-RPC 分层迁移收口状态，确认 `server/internal/data/jsonrpc*.go` 已不存在，运行时 JSON-RPC dispatch、权限守卫和错误映射位于 `server/internal/service`。
- 完成：同步修正当前正式文档中的旧 `server/internal/data/jsonrpc_*` 路径和“handler 位于 data 层历史架构”风险口径；`docs/reference` 与 `docs/archive` 作为历史资料不改。
- 下一步：如后续继续扩展 JSON-RPC 域，按 `service -> biz -> data repo` 主路径新增 service 测试，不恢复 `data.JsonrpcData` 入口。
- 阻塞/风险：本轮不改 runtime、schema、migration、RBAC 或前端；当前工作区仍有出货单弹窗和 workflow phase-label guard 相关未提交改动。

## 2026-06-16 15:56 CST

- 完成：出货单继续按现有业务弹窗原型修补，`新建草稿` 改为同一弹窗内上方维护出货单主表字段、下方维护出货明细条目；草稿 `加行` 也复用同一弹窗，上方只读回显主表和已保存明细，下方新增明细。
- 完成：出货单查看改为同一弹窗只读回显，不再保留业务对象抽屉路径；`style:l1` 增加 `/erp/warehouse/shipments` 新建弹窗和加行弹窗断言。
- 下一步：如后续要把前端 `createShipment` 后顺序 `addShipmentItem` 升级为后端单请求事务保存，需要单独评审 ShipmentUsecase/API 合约。
- 阻塞/风险：本轮不改 schema、migration、RBAC、Workflow / Fact 边界或后端 usecase；当前后端没有把“创建出货单 + 明细”包成同一个事务请求，明细保存失败时仍按现有 API 失败提示处理。

## 2026-06-16 14:36 CST

- 完成：全局收口业务对象新建 / 编辑 / 查看交互，移除销售订单、采购订单、BOM、出货单和 formal-shell 入口壳的业务对象详情抽屉路径；销售订单、采购订单继续在同一业务弹窗内维护主表字段和订单 / 采购明细，BOM 查看 / 编辑弹窗下方展示 BOM 明细，出货单详情 / 新建 / 加行改为统一 Modal。
- 完成：同步原型口径，把 `business-form-page-standard-v1` 改为“新建 / 编辑业务弹窗标准样板”，明确上方主表字段、下方明细 items；`action-modal-drawer-standard-v1` 改为局部动作弹窗口径，并同步原型中心、业务模块标准页 README、当前真源文档和 `style:l1` 断言。
- 下一步：出货单同一弹窗内维护主表和明细已在 15:56 CST 继续补齐；若要进一步改成后端单请求事务保存，需要单独评审 ShipmentUsecase/API 合约。
- 阻塞/风险：本轮不改 schema、migration、RBAC、Workflow / Fact 边界或后端 usecase；Dashboard 任务详情 Drawer 属于 Workflow 任务处理，不是业务对象表单，本轮按边界保留。

## 2026-06-16 16:49 CST

- 完成：为 yoyoosun 私有化发布补 release evidence gate，新增 `scripts/deploy/release-evidence-gate.mjs` 与单测，检查本次 release evidence、pre-migration backup evidence、migration status、smoke report 和 sign-off checklist 是否脱敏且填齐；草稿 evidence 会被明确拒绝，避免把模板误当真实签收。
- 完成：补 `release-signoff-checklist` 模板，扩展 `collect-evidence.sh` 生成的 evidence 草稿目录，并同步 yoyoosun 部署资料包 README、evidence README、首次部署 / 升级 runbook、部署前后 checklist、`scripts/README.md` 和 fast/full/strict QA 测试接线。
- 验证：`node --test scripts/deploy/release-evidence-gate.test.mjs scripts/deploy/deployment-package-lint.test.mjs` 通过；`node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun` 通过；`bash -n deployments/yoyoosun/scripts/collect-evidence.sh deployments/yoyoosun/scripts/verify-backup-restore.sh scripts/qa/fast.sh scripts/qa/full.sh scripts/qa/strict.sh` 通过；临时草稿 evidence 运行 gate 被拒绝，符合预期。
- 下一步：真实 yoyoosun 发布或客户试用交付前，先填写 `deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>/` 下真实脱敏证据，再运行 `node scripts/deploy/release-evidence-gate.mjs --customer yoyoosun --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>`。
- 阻塞/风险：本轮不生成真实 release evidence、不接触目标服务器、不读取真实 `.env`、不处理真实备份文件、不改变 `server/deploy/compose/prod` 部署主路径；当前仍不能写成客户已签收或 Delivery Ready。

## 2026-06-16 14:02 CST

- 完成：按 `trade-erp` 的大弹窗交互收口 V1 客户 / 供应商页，删除“查看详情”抽屉和独立联系人弹窗；客户 / 供应商新增、编辑统一在一个业务表单弹窗里维护主体字段和联系人条目。
- 完成：联系人保存从同一弹窗主路径同步：先保存客户 / 供应商主体，再创建 / 更新联系人；编辑时从弹窗移除的旧联系人按停用处理，避免旧联系人残留继续挂在当前主体下。
- 完成：补联系人条目局部样式和 `style:l1` 断言，客户 / 供应商回归从“详情抽屉联系人入口”改为“编辑弹窗内联系人条目”；13:08 CST 的抽屉方案已被本条记录替代。
- 下一步：如后续要支持联系人只读详情、单条联系人停用确认或更细的联系人权限 UI，需要另起联系人明细交互任务，不恢复主页面第二张常驻表。
- 阻塞/风险：本轮不改后端 schema、migration、菜单、RBAC 或客户 / 供应商分表真源；联系人仍是当前客户 / 供应商从属明细，不作为独立业务对象。

## 2026-06-16 12:52 CST

- 完成：重排 `docs/product/产品能力进度台账.md`，取消快速查阅表第一列内部编号，改为按“能力 / 所属层 / 成熟度 / 客户可见性 / 下一步”给人查阅。
- 完成：新增 `docs/product/产品能力证据详情.md`，把原宽表中的当前结果、当前不包含、证据、风险和客户边界拆到按能力名称索引的详情文档；可见正文只按能力名称查阅。
- 完成：同步 `docs/product/产品台账索引.md`、`docs/product/README.md`、`docs/文档清单.md`，并修正台账内和客户差异台账内 SKU 示例，避免继续写成“只落 schema 未接 API / UI”。
- 下一步：后续维护台账时先更新主台账的人可读状态，再按需补证据详情；如证据详情继续变大，再按业务域拆分详情。
- 阻塞/风险：本轮只改正式文档呈现和 SKU 示例口径，不改 runtime、schema、migration、测试、部署或客户交付矩阵。

## 2026-06-16 12:53 CST

- 完成：收口 V1 主数据客户 / 供应商页面的前端称呼，保留客户与供应商作为不同业务入口和后端真源，但不再在按钮、统计和联系人面板里统一显示成泛化“主体”，避免误读为两套重复表单。
- 下一步：如后续要把客户与供应商进一步合成“往来单位 / 交易主体”单入口，需要单独评审 schema、RBAC、销售 / 采购外键、联系人 owner_type、菜单和迁移，不在本轮文案收口范围内。
- 阻塞/风险：此条仅记录早先称呼收口；同轮后续已在 14:02 CST 继续按大弹窗交互完成单页结构收口和 `style:l1` 回归，最终风险以 14:02 CST 记录为准。

## 2026-06-16 13:55 CST

- 完成：新增 `docs/customers/yoyoosun/source-manifest.json` 作为永绅原始来源文件导入前主清单，记录 path、sha256、size、用途、domain、敏感复查和 `structuredExtract` 策略；新增 `scripts/import/customerSourceManifestCheck.mjs` 与测试，校验 manifest、raw source 文件一致性和 checksum 漂移。
- 完成：`customerSourceExtract.mjs` 默认改为 manifest 驱动，只提取 manifest 中允许结构化的 Excel；source snapshot、extract summary、freeze metadata、dry-run validation summary 和 source references 保留 manifest 追溯信息，文档命令从 raw-dir glob 主路径同步为 manifest-first。
- 下一步：真实导入仍必须另行补齐已 review 的 existing V1/formal model snapshot、unresolved 清理、客户 sign-off、备份/回滚、幂等、审计和 post-import reconciliation 后再评审是否执行。
- 阻塞/风险：本轮仍不执行真实客户数据导入，不写 DB、不改 schema/migration/API/UI/seedData，不对 PDF/图片做 OCR；`canExecuteRealImport` 继续保持 `false`。

## 2026-06-16 13:08 CST

- 完成：进一步收口 V1 客户 / 供应商页单页结构，删除页面底部常驻联系人明细表，把联系人列表和新建联系人入口移入“查看详情”抽屉；主页面只保留一张客户 / 供应商主数据表。
- 完成：清理已失效的联系人面板 CSS，并同步 `style:l1` 客户 / 供应商场景断言，按“新建客户 / 新建供应商”和详情抽屉联系人入口验证新结构。
- 下一步：联系人编辑、设为主联系人和停用仍需后续按 masterdata 联系人能力单独补 UI 动作，不回到主页面常驻第二张表。
- 阻塞/风险：本轮未改后端 schema、API、RBAC、菜单、migration 或真实数据；联系人仍是当前客户 / 供应商的从属明细，不作为独立业务对象。

## 2026-06-16 12:16 CST

- 完成：关闭 P0/P1 硬缺口主路径：生产配置移除 token 形态 Telegram 注释块；个人开发阶段不落 GitHub CI，继续以本地 QA / hooks 为主；后端 HTTP 增加 CSP、Referrer-Policy、X-Content-Type-Options、X-Frame-Options 和 Permissions-Policy 基础安全响应头。
- 完成：公开自助注册从“生产关闭”改为“运行时删除”：后端移除 `auth.register` 分发和 `AuthUsecase.Register`，`auth.capabilities` 不再返回 `public_register`，生产 Compose / preflight 不再使用 `APP_PUBLIC_REGISTER_ENABLED`，前端删除 `/register` 路由和注册页，登录页不再展示注册链接，正式 API / 配置 / 部署 / 前端 README 同步为不提供公开自助注册。
- 下一步：SKU 继续只按已修正台账推进；如要进一步降低 token 风险，应单独评审 HttpOnly SameSite Cookie、CSRF、刷新 token 和前端 API client 改造；如要补普通协作账号创建入口，应单独评审受控 `user.create` 权限、流程、审计和测试。
- 阻塞/风险：本轮未做 SKU API/UI、真实 MVP runner、目标环境部署、生产镜像构建或线上 smoke；后端 CSP 仍保留 inline script/style 兼容现有构建和模板渲染，后续收紧需要前端构建和 PDF 回归。

## 2026-06-16 12:50 CST

- 完成：按用户确认删除公开注册入口，清理后端 register 方法、前端注册路由 / 页面、公开注册 capability、公开注册错误码消费、生产部署开关、preflight 检查和相关正式文档口径；保留测试断言 `register` 返回 UnknownMethod，避免后续误恢复。
- 下一步：如需要新增普通协作账号，另起受控账号创建任务，不从公开注册入口恢复。
- 阻塞/风险：未新增普通协作账号创建 API；当前普通用户新增仍依赖既有初始化 / 数据准备路径或后续账号管理能力设计。

## 2026-06-16 12:33 CST

- 完成：按个人开发边界撤回 GitHub CI 落地，删除 `.github/workflows/ci.yml`，并把 `docs/product/自动化测试策略.md` 改回“当前不配置 GitHub CI，后续协作扩大时再评审”的口径。
- 下一步：继续保留本地 `scripts/qa/fast.sh`、`full.sh`、`strict.sh`、preflight 和 hooks 作为当前质量主路径。
- 阻塞/风险：未改生产注册关闭、安全响应头、错误码、前端 capabilities 或部署 preflight 收口；后续若需要远端门禁再重新评审 CI。

## 2026-06-16 12:08 CST

- 完成：修正 `docs/product/产品能力进度台账.md` 中 `product_skus` 口径，补齐 masterdata JSON-RPC、`product_sku.*` RBAC 和 `/erp/master/products` SKU 最小维护页面已接入的状态，避免继续被误读为只落 schema。
- 完成：保留 SKU 当前边界：订单、出货、库存和预留运行时主路径仍未切 SKU；销售订单行 SKU 选择、出货 / 库存 / 预留 SKU 校验、BOM SKU 粒度和导入受控创建 SKU 仍待单独评审。
- 下一步：后续推进 SKU 时优先评审销售订单行 SKU 选择与快照带值，再评审 BOM SKU 粒度和事实链路 SKU 校验。
- 阻塞/风险：本轮只修正式产品能力台账口径，不改运行时代码、schema、migration、测试脚本、部署或 git 提交。

## 2026-06-15 22:59 CST

- 完成：BOM Version 已完成 runtime 闭环并通过最终收口验证：后端 BOM lifecycle / repo / service JSON-RPC / RBAC、前端 BOM API / V1 页面 / 路由、`style:l1` BOM 页面 mock 与断言、正式文档和客户交付矩阵均已同步；BOM 仍只维护产品物料清单版本，不写库存、采购、生产、成本或财务事实。
- 完成：收口 JSON-RPC service/data 分层迁移现场，修复 Product SKU L1 暗色客户场景空记录崩溃，并补齐 `style:l1` 对 Product SKU、BOM Version 和当前业务页表头 / 回收站列的断言口径。
- 验证：`go test ./...` 通过；`pnpm --dir web lint && pnpm --dir web css && pnpm --dir web test && pnpm --dir web build` 通过，前端单测 312 项通过；`node --test scripts/qa/mvp-closure.test.mjs && node scripts/qa/mvp-closure.mjs --out output/customers/yoyoosun/mvp-closure-smoke` 通过；`pnpm --dir web style:l1` 全量 48 个场景通过；本轮提交前还将执行 `git diff --check`。
- 下一步：按用户要求全量 stage、提交并推送当前工作区。
- 阻塞/风险：未执行目标服务器 migration、部署或线上 smoke；BOM SKU 粒度、采购需求生成、MRP / 替代料、成本核算、订单 / 采购需求版本快照和客户真实数据验收仍需后续单独评审。
