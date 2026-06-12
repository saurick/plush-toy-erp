# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-08-before-business-records-debug-cleanup.md`：归档截至 2026-06-08 13:50 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 318 行 / 82540 bytes，超过 80KB 阈值；本轮旧 `project-orders` debug cleanup 前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-09-before-brand-config.md`：归档 2026-06-08 21:08 CST 至 2026-06-08 23:07 CST 的过程记录。归档原因：当前 `progress.md` 达到 383 行 / 80205 bytes，超过 80KB 阈值；本轮前端品牌客户配置化前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-10-before-style-l1-stabilization.md`：归档 2026-06-08 23:55 CST 至 2026-06-10 17:34 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 378 行 / 82385 bytes，超过 80KB 阈值；本轮修完整 `style:l1` 稳定性前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-11-before-ui-simplification-rules.md`：归档截至 2026-06-11 14:06 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 395 行 / 80005 bytes，接近并按项目约定视为达到 80KB 归档边界；本轮补 UI 极简不改语义规则前先保留完整现场，再收缩当前入口。

## 当前活跃事项

- `/erp/dashboard` 已作为后台首页 / 工作台首屏：聚合今日焦点、业务状态摘要、常用入口、角色提醒和运营工具，不写事实层；`/erp/task-board` 独立承接 Workflow 任务看板。
- `BusinessModulePage` 已把筛选区、表格工具栏、已选记录操作条、分页和业务页协同入口收口到标准页结构；协同入口只处理 Workflow 任务，不写事实层。`材料 BOM`、`入库通知/检验/入库`、`库存` 和 `出库` 已补只读特殊变体区，强调 BOM、质检 / 入库、库存和出库事实边界。
- `/erp/business-dashboard` 仍只作为运营摘要和业务风险看板，不作为事实真源；`/erp/print-center` 保留模板目录、纸面预览和可编辑打印窗口入口；字段编辑、明细确认和纸面微调回到独立打印窗口；`/erp/operations/exceptions` 作为异常 / 阻塞闭环入口。
- 完整 `pnpm --dir web style:l1` 已恢复通过；后续若继续吸收或评审原型，应继续复用现有页面、现有 Workflow API、现有菜单 / RBAC / theme token，不新增未评审后端 API、schema、migration、权限码或 Fact 写入。
- 业务页协同入口的任务分组、统计、阻塞原因和催办态已收口到纯前端 helper，并纳入 `pnpm test`；该 helper 只服务 Workflow 展示口径，不写事实层。
- `docs/product/prototypes` 当前待实现队列包含工作台 / 总控页、业务模块列表页、业务详情页、新建 / 编辑表单、业务页协同入口组件和弹窗 / 抽屉动作六个 HTML 标准样板；只有岗位任务端 `mobile-role-tasks-v1/implemented-reference.html` 登记为当前实现参考。
- 原型查看器和原型 README 已补“参照范围”口径：参照范围只说明可借鉴的页面 / 菜单类型，不是正式菜单、路由、权限或 seedData 映射表；真正对应关系必须在进入真实实现任务时回到代码、菜单配置和 RBAC 重新核对。

## 2026-06-11 18:38 CST

- 完成：修复采购 / 加工打印编辑页在浏览器 localStorage 满额时白屏的问题。根因是工作台 effect 直接 `localStorage.setItem` 保存草稿，遇到 `QuotaExceededError` 会抛到 React 渲染链路并卸载页面。
- 完成：新增 `persistPrintWorkspaceDraftSnapshot` 作为打印草稿安全写入 helper；采购合同和加工合同编辑页都改为尽力保存，写入失败时不抛异常、不阻断页面显示。读取草稿仍沿用现有 try/catch 兜底。
- 验证：`node --test web/src/erp/utils/printWorkspace.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=print-workspace-material,print-workspace-processing pnpm --dir web style:l1`、`git diff --check` 均通过。Playwright 模拟打印草稿 key 写入抛 `QuotaExceededError`，采购合同编辑页仍显示，未再出现该异常导致的白屏。
- 下一步：如要进一步降低浏览器存储压力，可单独评审旧打印窗口 state / draft 的清理策略；当前先保证满额时页面可用。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、seedData、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送；localStorage 满额时最新草稿可能无法持久化到浏览器，但当前页面内容和打印操作不应因此崩溃。

## 2026-06-11 18:32 CST

- 完成：修复独立打印编辑页在无同源 admin 登录态时被 `/admin-login` 拦截导致“无法显示”的问题。新增打印窗口本地状态守卫：仅当 URL 带 `state`，且本机 localStorage 中存在未过期、templateKey 匹配、带 workspaceURL 的打印窗口状态时，允许 `/erp/print-workspace/:templateKey` 绕过 admin 登录守卫并恢复编辑页。
- 完成：保持普通裸访问安全边界。没有 `state`、state 缺失 / 过期、或 templateKey 不匹配时，仍走原有 `AuthGuard requireAdmin`，直接访问打印编辑路由会回到 `/admin-login`。
- 验证：`node --test web/src/erp/utils/printWorkspace.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=print-workspace-processing pnpm --dir web style:l1`、`git diff --check` 均通过。Playwright 验证无 admin token 但有合法本地 `state` 时加工合同编辑页可显示，普通无 `state` 直接访问仍跳 `/admin-login`。
- 下一步：如后续要让远端分享链接也能打开打印快照，应另做权限和快照签名设计；当前能力只面向同一浏览器本地打印窗口恢复，不是公开分享入口。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、seedData、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送；仅调整前端打印窗口路由守卫与本地窗口状态判断。

## 2026-06-11 18:20 CST

- 完成：重新复核 `docs/product/prototypes/admin-command-center-v1/` 和原型 README。当前没有独立完整打印中心原型，`admin-command-center-v1` 仍是 To Implement 的工作台 / 总控页参考，不应继续让运行时打印中心保留无真实配置能力的静态 `字段映射` 右栏。
- 完成：移除打印中心 `字段映射` 整栏、静态 `buildPrintMappingRows`、对应 Ant Tag import 和暗色 / 响应式 CSS 覆盖；打印中心收回为两栏：左侧模板导航，右侧纸面预览，顶部保留 `打印当前模板`。
- 完成：同步 `README.md`、`web/README.md`、`docs/current-source-of-truth.md`、`docs/erp-print-template-field-behavior.md` 和 `commandCenter` 文案；`style:l1` 打印中心浅色 / 暗色场景改为断言字段映射不存在且页面保持两栏。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=print-center-desktop,print-center-dark-desktop pnpm --dir web style:l1` 和 `git diff --check` 均通过。Browser 打开 `http://localhost:5175/erp/print-center`，确认页面 title 为 `毛绒 ERP 桌面后台`、console warn/error 为空、默认态只有模板导航和纸面预览两栏、`字段映射` 不存在、点击 `加工合同` 后 URL 更新为 `?template=processing-contract` 且纸面标题切换；390x844 移动视口下两栏收为单列且 `scrollWidth=clientWidth=390`。
- 下一步：如果后续需要真正的字段映射配置，应先做独立打印模板配置设计和字段真源评审，不在打印中心用静态标签冒充配置能力。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、seedData、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送。

## 2026-06-11 18:19 CST

- 完成：修复加工合同编辑 / 打印纸面签名栏空值。根因是纸面签章区只渲染甲乙双方日期，没有渲染 `buyerSigner` / `supplierSigner`；现已在纸面预览和左侧字段面板补齐甲方签名、乙方签名，默认样例显示中性 `签字人` / `受托方签字人`。
- 完成：调整 `style:l1` 加工合同可编辑表格断言。默认样例现在不再为了测试保留空白可编辑格；回归脚本改为在默认值填满时临时使用零宽探针验证空值布局，继续覆盖用户手动清空后的居中和光标位置。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=print-workspace-processing pnpm --dir web style:l1`、`git diff --check` 均通过；Browser 验证加工合同工作台签名栏显示 `签字人` / `受托方签字人`，不出现永绅或旧手机号，console warn/error 为空。
- 下一步：如后续要接真实签署人，应从业务记录、企业资料配置或客户打印模板带值，不在 Product Core 默认样例写客户真实姓名。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送；业务页带值路径缺少真实签署人时仍保持空白，避免把默认样例残值写入真实业务打印。

## 2026-06-11 18:18 CST

- 完成：压缩 `business-module-page-standard-v1/index.html` 待实现标准页首屏高度。保留标题摘要、筛选、结果工具条、当前操作条和分页，但降低 hero、指标卡、筛选控件、按钮、当前操作条和分页控件高度，让表格在低高度桌面视口中露出。
- 完成：同步 `docs/product/prototypes/business-module-page-standard-v1/README.md`，明确标题、筛选、工具条和当前操作区默认使用紧凑首屏密度，避免常见低高度屏幕把表格完全挤出首屏。
- 验证：内联脚本语法检查通过；`git diff --check -- docs/product/prototypes/business-module-page-standard-v1/index.html docs/product/prototypes/business-module-page-standard-v1/README.md progress.md` 通过；Playwright 静态服务验证 2048x536 视口下表格首行可见、页面级无横向溢出，点击首行后动作启用，清空已选恢复 0 选中，390x844 移动视口页面级 `scrollWidth === clientWidth`。静态服务仅有 favicon 404，不是脚本错误。
- 下一步：如后续要继续压缩，应优先评审是否把摘要或筛选设为折叠，而不是删除 Workflow / Fact 边界提示。
- 阻塞/风险：本轮只改原型 HTML、原型说明和 progress；未改正式运行时代码、正式菜单、后端 API、RBAC、schema / migration、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送。移动端因筛选项纵向堆叠，首屏不强制露出表格。

## 2026-06-11 18:17 CST

- 完成：移除打印中心顶部 `字段核对` 按钮；该按钮只跳转到 `/erp/print-center/:templateKey` 兼容入口，当前主动作已是独立编辑打印窗口，字段口径已在打印中心右侧字段映射和模板工作台左侧字段面板内展示。
- 完成：同步 `README.md`、`web/README.md`、`docs/current-source-of-truth.md` 和 `docs/erp-print-template-field-behavior.md`，不再写“模板核对入口 / 字段核对”作为打印中心主入口；`style:l1` 打印中心场景改为断言 `字段核对` 不出现。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=print-center-desktop,print-center-dark-desktop pnpm --dir web style:l1`、`git diff --check` 均通过；关键字扫描确认运行时代码和正式说明中只剩 `style:l1` 的 `字段核对` 不存在断言与本条 progress 记录。
- 下一步：保留 `/erp/print-center/:templateKey` 兼容路由和既有直接路径回归；如后续确认旧直达路径也不再需要，应单独评审路由、权限归属和兼容风险后移除。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、seedData、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送。

## 2026-06-11 18:16 CST

- 完成：继续补齐打印模板编辑页里可见空白。采购合同明细补厂商料号、规格、单价、金额、备注和乙方签字日期；加工合同明细补加工厂商、备注和乙方签字日期。附件上传位仍保持空白，不伪造文件附件。
- 完成：同步 `printTemplates` 和 `processingContractTemplate` 测试断言，确保默认样例的明细字段不再留空；业务页带值草稿测试仍覆盖缺少真实字段时不沿用默认样例残值。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、关键字扫描均通过；Browser 验证采购合同和加工合同工作台可见空 input、空 contenteditable 与纸面 `&nbsp;` 空白块均为 0，console warn/error 为空。
- 下一步：如还要补真实附件或企业真实电话 / 地址，应走客户配置包、客户打印模板或企业资料配置，不在 Product Core 默认样例中伪造真实文件和客户信息。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送；附件位没有补样例文件，因为当前没有通用附件真源。

## 2026-06-11 18:11 CST

- 完成：补齐打印模板中心默认样例字段。采购合同默认样例新增 `示例供应商`、供应商联系人 / 电话 / 地址、`采购负责人`、公司联系电话 / 地址、签字人和供应商签字人；加工合同默认样例新增 `示例加工厂`、加工厂联系人 / 电话 / 地址、`委外负责人`、公司联系电话 / 地址。
- 完成：修正业务页带值打印草稿边界。业务记录缺少真实联系人、电话、地址、签字人时保持空白，不沿用打印中心中性样例；只保留 `本公司` 作为公司侧通用占位。同步字段链路 catalog 和正式打印模板行为文档。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、关键字扫描均通过；Browser 验证 `/erp/print-center`、采购合同编辑工作台和加工合同编辑工作台左侧字段面板 / 右侧纸面均显示中性样例值，不出现永绅、旧联系人或旧手机号，console warn/error 为空。
- 下一步：如后续要把 `本公司`、公司电话或地址接成真实企业信息，应走客户配置包 / 客户打印模板或企业资料配置，不在 Product Core 默认样例里写真实客户信息。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送；业务页带值路径仍依赖现有业务记录 payload，缺值不会自动补造真实信息。

## 2026-06-11 18:10 CST

- 完成：修正 `business-module-page-standard-v1/index.html` 待实现标准页漏项，以辅材 / 包材采购为代表样例补回当前真实业务页骨架：标题摘要、独立筛选条、结果工具条、空选中当前操作区、点击行后动作启用、主表分页和底部轻量协同入口。
- 完成：同步 `docs/product/prototypes/README.md`、`docs/product/prototypes/business-module-page-standard-v1/README.md` 和静态 `docs/product/prototypes/index.html` 的登记口径，明确业务模块标准页不再额外放置菜单侧栏，避免把菜单示意误读为新的正式菜单。
- 验证：内联脚本语法检查通过；`git diff --check -- docs/product/prototypes/business-module-page-standard-v1/index.html docs/product/prototypes/business-module-page-standard-v1/README.md docs/product/prototypes/README.md docs/product/prototypes/index.html progress.md` 通过；Playwright 静态服务验证默认态 0 选中、点击首行后动作启用、清空已选恢复禁用、分页显示 `共 3 条 / 8 条/页`，390px 移动视口页面级 `scrollWidth === clientWidth`。静态服务仅有 favicon 404，不是脚本错误。
- 下一步：如后续要把该样板吸收到真实页面，仍需按 To Implement Checklist 回到运行时代码、共享组件、正式菜单、RBAC、theme token、API 和测试边界核对。
- 阻塞/风险：本轮只改原型 HTML、原型说明和 progress；未改正式运行时代码、正式菜单、后端 API、RBAC、schema / migration、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送。

## 2026-06-11 18:08 CST

- 完成：移除打印中心左侧 `样品确认单` 禁用候选模板入口；运行时模板导航只展示 `采购合同` 和 `加工合同` 两套已启用正式模板，说明文案改为当前仅开放正式模板。
- 完成：同步 `style:l1` 打印中心浅色 / 暗色场景断言，要求页面不再出现 `样品确认单` 和 `候选模板 / 未启用`；同步 `docs/current-source-of-truth.md` 的打印中心口径，明确样品确认单暂不作为运行时候选入口、正式模板目录、模板引擎或后端事实。
- 验证：关键字扫描确认运行时代码不再包含候选模板常量；`pnpm --dir web lint`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=print-center-desktop,print-center-dark-desktop pnpm --dir web style:l1` 和 `git diff --check` 通过。`pnpm --dir web test` 仍有 1 个既有字段联动目录期望失败：真实测试 case 是 `FL_print_templates_sample__uses_generic_sample_values_without_customer_identity`，latest/catalog 期望仍是旧名 `FL_print_templates_sample__keeps_supplier_snapshot_fields_blank_by_default`，不属于本轮样品确认单入口移除。
- 下一步：如后续确实要做样品确认单，应先补正式模板样本、字段真源和模板目录设计，再按正式模板接入。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、seedData、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送。

## 2026-06-11 18:04 CST

- 完成：清理产品核心打印模板默认样例里的永绅客户信息。采购合同和加工合同默认买方 / 委托方公司改为中性 `本公司`，联系人、电话、地址、签字人默认留空；sourceFiles 不再暴露本机永绅原始资料路径。
- 完成：补 `printTemplates`、`processingContractTemplate` 和采购合同编辑器单测，锁住核心默认样例不包含客户专属公司名、本机路径、旧联系人和旧手机号；同步 `docs/erp-print-template-field-behavior.md` 说明客户专属信息只能来自业务草稿、客户配置包、客户打印模板或客户交付资料边界。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、相关单测、关键字扫描和 `git diff --check` 均通过；Browser 验证 `/erp/print-center`、采购合同编辑工作台和加工合同编辑工作台默认显示 `本公司`，不再出现永绅、旧联系人或旧手机号，console warn/error 为空。
- 下一步：如后续需要 yoyoosun 正式交付模板默认带公司信息，应通过客户配置包 / 客户打印模板边界单独接入，不回写 Product Core 默认模板。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送；工作区仍有本轮开始前已存在的原型 / 样式相关未提交改动，未纳入本轮成果。

## 2026-06-11 18:02 CST

- 完成：开始吸收 To Implement 的业务模块列表页 / 业务页协同入口样板到真实运行时共享组件。`CollaborationTaskPanel` 收起态新增当前记录、本页待办和阻塞异常摘要；展开态任务分类补 `tablist / tab / tabpanel`、`aria-selected`、`aria-controls` 和方向键 / Home / End 切换，保持默认收起、展开、桌面拖拽和 Workflow-only 边界。
- 完成：同步 `web/src/erp/styles/app.css` 浅色 / 暗色摘要样式，并在 `web/scripts/styleL1.mjs` 的业务模块回归里锁住收起摘要、tab 语义、tabpanel 绑定、展开 / 收起、拖拽和无横向溢出。
- 验证：`node --test web/src/erp/utils/businessCollaborationTasks.test.mjs web/src/erp/config/devPrototypes.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=business-module-workflow-actions,business-menu-groups-desktop pnpm --dir web style:l1`、`git diff --check` 均通过。
- 下一步：继续吸收时可转向业务详情页或表单页样板；若要把任一 To Implement 资产改成 Current，仍需用户明确确认，并按 README 的 To Implement -> Current 门禁同步登记。
- 阻塞/风险：本轮未改正式菜单、seedData、RBAC、后端 API、schema / migration、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送；协同入口仍只展示和处理 Workflow 任务，不写库存、出货、财务、开票或收付款事实。

## 2026-06-11 17:54 CST

- 完成：在 `docs/product/prototypes/README.md` 的“原型作用与布局准确度”下补充“原型重点关注项”，将大致布局、交互路径、信息层级、状态表达、视觉密度和实现边界收口为评审维度。
- 验证：`git diff --check -- docs/product/prototypes/README.md progress.md` 通过。
- 下一步：继续新增或评审原型时，优先按这些维度判断是否足够清楚；不要把它扩展成字段全集、菜单全集或新业务真源。
- 阻塞/风险：本轮只补原型 README 和 progress 说明；未改运行时代码、正式菜单、后端 API、RBAC、schema / migration、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送。

## 2026-06-11 17:29 CST

- 完成：为 `/__dev/docs` Mermaid 图表补当前页面全屏查看按钮；打开后图表卡片变为深色 fixed overlay，默认 140% 放大，保留适配宽度、缩小、放大、重置和退出全屏控件，退出后回到原页面内 100% 状态。
- 完成：同步 `docs/current-source-of-truth.md` 和 `web/README.md` 的 `/__dev/docs` Mermaid 控件说明，并在 `dev-docs-dark-desktop` L1 场景增加全屏打开 / 退出 / 盒模型断言。
- 验证：`git diff --check`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm --dir web style:l1`、`pnpm --dir web style:l1` 均通过；Browser 在 `http://localhost:5175/__dev/docs` 的 `docs/product/implementation-governance.md` 实测全屏前 100% 宽 838，打开后 fixed dialog、140%、画布宽 1738.8 / 视口宽 1244、退出后回到 100%，console warn/error 为 0，并已截取全屏态截图。
- 下一步：如后续需要拖拽平移、导出 SVG/PNG 或新标签独立查看，应继续保持在 dev-only Mermaid 图表容器内单独评审。
- 阻塞/风险：本轮未新增独立路由，避免图表源码 / 渲染状态跨页面传递带来的额外复杂度；不接 ERP 菜单、seedData、RBAC、后端 API、schema / migration、生产构建、部署、提交或推送。

## 2026-06-11 17:13 CST

- 完成：为 `/__dev/docs` 右侧章节导航新增展开 / 收起按钮。默认展开为自动换行、不横向滚动；收起后变为单行横向滚动，便于节省纵向空间；展开 / 收起状态写浏览器本地偏好，刷新后恢复。
- 完成：同步 `docs/current-source-of-truth.md` 和 `web/README.md` 的 `/__dev/docs` 行为说明，新增 `plush_erp_dev_docs_toc_expanded` 本地偏好 key，并补 `dev-docs-dark-desktop` L1 场景对默认展开、收起滚动、刷新恢复和重新展开的 DOM / box 模型断言。
- 验证：`git diff --check`、`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web exec node --test src/erp/config/devDocs.test.mjs`、`STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm --dir web style:l1`、`pnpm --dir web test`、`STYLE_L1_PORT=4441 pnpm --dir web style:l1` 均通过；Browser 打开 `http://localhost:5175/__dev/docs` 选择 `docs/product/implementation-governance.md`，实测展开态 `flexWrap=wrap`、`scrollWidth=clientWidth=908`、16 个标签换为 6 行且无标签溢出，收起态 `flexWrap=nowrap`、`overflowX=auto`、`scrollWidth=3565 > clientWidth=908`、刷新后保持收起，再展开恢复无横向溢出，console warn/error 为空。
- 下一步：若后续觉得按钮文案太长，可只收敛为图标 + tooltip，但仍应保留 L1 的展开 / 收起 / 刷新恢复断言。
- 阻塞/风险：本轮仍只改 `/__dev/docs` 本地开发查看器，不接 ERP 菜单、seedData、RBAC、后端 API、schema / migration、生产构建、部署、提交或推送；当前工作区仍包含相邻 Mermaid 缩放控件改动，已在同一轮验证但不是章节导航展开 / 收起方案的核心改动。

## 2026-06-11 17:11 CST

- 完成：收口 `/__dev/docs` Mermaid 图表缩放工具条验证；缩小现在会真实减少画布宽度，放大和重置也同步更新百分比标签与 `data-mermaid-zoom` 状态。
- 验证：`git diff --check`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm --dir web style:l1`、`pnpm --dir web style:l1` 均通过；Browser 在 `http://localhost:5175/__dev/docs` 的 `docs/product/implementation-governance.md` 实测 Mermaid 图表 100% 宽 838、缩小 80% 宽 670.4、重置 100% 宽 838、放大 120% 宽 1005.6，console warn/error 为 0。
- 下一步：如后续需要拖拽平移或独立全屏预览，应继续保持在 dev-only Mermaid 图表容器内评审。
- 阻塞/风险：Browser 截图捕获曾在最终复核时超时，已改用 DOM / box 模型读数和 console 检查收口；本轮不接 ERP 菜单、seedData、RBAC、后端 API、schema / migration、生产构建、部署、提交或推送。

## 2026-06-11 16:55 CST

- 完成：将 `/__dev/docs` 右侧章节导航从横向滚动改为自动换行展示；章节按钮按可用宽度排布，长标题在按钮内部换行，不再依赖 `overflow-x: auto` 或省略裁切。
- 完成：同步 `docs/current-source-of-truth.md` 和 `web/README.md` 的 `/__dev/docs` 章节标签行为说明，并在 `dev-docs-dark-desktop` L1 场景补章节导航盒模型断言，防止退回横向滚动。
- 验证：`git diff --check`、`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm --dir web style:l1`、`STYLE_L1_PORT=4439 pnpm --dir web style:l1` 均通过；Browser 打开 `http://localhost:5175/__dev/docs` 选择 `docs/product/implementation-governance.md`，实测 16 个章节标签换为 6 行，`scrollWidth=clientWidth=908`，标签溢出 / 裁切数量为 0，页面无横向溢出且 console warn/error 为空。
- 下一步：如后续继续调整章节导航，可继续在 `dev-docs-dark-desktop` 场景补对应 DOM / box 模型断言。
- 阻塞/风险：本轮不接 ERP 菜单、seedData、RBAC、后端 API、schema / migration、生产构建、部署、提交或推送；当前工作区还包含相邻 Mermaid 缩放控件改动，已在同一轮验证但不是本次章节导航问题的核心改动。

## 2026-06-11 16:49 CST

- 完成：为 `/__dev/docs` Mermaid 图表补本地临时缩放工具条，提供适配宽度、缩小、放大和重置 100% 四个图标按钮；缩放只作用于当前图表容器，不写 localStorage、不改 Markdown 源码、不进入正式菜单或后端。
- 完成：同步 `docs/current-source-of-truth.md` 和 `web/README.md` 的 `/__dev/docs` 行为说明，并补 `style:l1` 对 Mermaid 缩放按钮和放大 / 重置效果的 DOM 断言。
- 验证：`git diff --check`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm --dir web style:l1`、`STYLE_L1_PORT=4439 pnpm --dir web style:l1` 均通过。
- 下一步：若后续需要拖拽平移或全屏预览，应继续保持在 dev-only Mermaid 图表容器内评审，不恢复产品内 docs registry。
- 阻塞/风险：本轮不接 ERP 菜单、seedData、RBAC、后端 API、schema / migration、生产构建、部署、提交或推送。

## 2026-06-11 15:51 CST

- 完成：为 `/__dev/docs` Markdown 查看器补 Mermaid 图表渲染。`mermaid` fenced code block 现在会在只读 dev-only 查看器中渲染为 SVG；普通代码块仍走原有 `<pre><code>` 展示，Mermaid 渲染失败时保留源码兜底。
- 完成：同步 `docs/current-source-of-truth.md` 和 `web/README.md` 的 `/__dev/docs` 行为说明，并补 `style:l1` 对 `docs/product/implementation-governance.md` Mermaid 图表的 SVG 渲染断言。
- 验证：`git diff --check`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-docs-dark-desktop pnpm --dir web style:l1`、`pnpm --dir web style:l1` 均通过；in-app Browser 打开 `http://localhost:5175/__dev/docs` 验证 `docs/product/implementation-governance.md` 已渲染 Mermaid SVG，普通源码块不再显示 `flowchart LR`，console warn/error 为空。
- 下一步：如后续要支持更多 Markdown 扩展，仍应只在 dev-only 查看器或共享 Markdown 渲染层评审，不恢复产品内 docs registry。
- 阻塞/风险：本轮不接 ERP 菜单、seedData、RBAC、后端 API、schema / migration、生产构建、部署、提交或推送；当前工作区仍有一批非本轮原型相关未提交改动，未回退。

## 2026-06-11 15:46 CST

- 完成：按 Product Design review 修正 To Implement 样板质量问题：表单底部动作区改为不覆盖字段的静态尾部确认区，动作抽屉打开时锁定背景滚动，工作台和详情页 tab 补 `tablist / tab / tabpanel` 与 `aria-selected` 同步，Core 样板里的 yoyoosun 客户锚点收敛为中性样例数据。
- 完成：同步 `docs/product/prototypes/README.md`、工作台 / 详情页 / 表单页 / 动作浮层 README 的验收口径；六个 HTML 仍保持 To Implement，不晋级 Current。
- 验证：`git diff --check`、6 个 HTML 内联脚本语法检查、关键字扫描、Playwright 静态服务验证 1280px / 390px 无横向溢出；表单 footer overlap 为 0，移动抽屉 `bodyOverflow=hidden`，工作台 / 详情页 tab aria 状态随点击更新。`node --test web/src/erp/config/devPrototypes.test.mjs` 通过。验证截图保存在 `output/playwright/product-design-next-step-20260611/`。
- 下一步：若要进入真实页面吸收，仍需按 To Implement Checklist 回到当前运行时代码、共享组件、正式菜单、RBAC、theme token、API 和测试边界；不得直接复制静态原型。
- 阻塞/风险：本轮只改 To Implement 原型和说明文档；未改正式运行时代码、正式菜单业务语义、后端 API、schema / migration、RBAC、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送。静态服务下 console 仅有 favicon 404，不作为原型脚本错误。

## 2026-06-11 15:45 CST

- 完成：在 `docs/product/prototypes/README.md` 补“参照关系 / 对应关系”规则，明确 To Implement 原型只说明页面骨架、信息层级和交互参照，不是正式菜单映射表；真正对应到菜单、路由、权限和 seedData 只能在进入真实实现任务时重新核对。
- 完成：为 `/__dev/prototypes` 的 `devPrototypes` registry 补 `appliesTo` 参照范围字段，并在左侧卡片、右侧详情和搜索里展示 / 使用；协同入口明确是页内组件，不是独立菜单、路由或权限入口。
- 完成：同步静态 `docs/product/prototypes/index.html`、`web/README.md` 和 `docs/current-source-of-truth.md` 的 dev-only 边界说明，强调参照范围不是正式菜单中心。
- 验证：`node --test web/src/erp/config/devPrototypes.test.mjs`、`git diff --check`、静态 `docs/product/prototypes/index.html` 内联脚本语法检查、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web style:l1` 均通过；in-app Browser 打开 `http://localhost:5175/__dev/prototypes` 验证桌面 1280px 和移动 390px 无横向溢出，13 张卡片均有参照范围，待实现筛选为 6 张卡片，协同入口右侧显示“不是独立菜单、路由或权限入口”。
- 下一步：如后续要把某个原型吸收到真实页面，先按 To Implement Checklist 指定目标页面 / 共享组件 / 路由，再核对当前代码、正式菜单、客户菜单配置、RBAC、theme token、API 和测试边界。
- 阻塞/风险：本轮没有把原型查看器接入正式菜单、seedData、RBAC、后端 API、schema / migration、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送；工作区还保留同一批原型 HTML 的相邻未提交改动，未在本轮回退。

## 2026-06-11 15:28 CST

- 完成：在 `docs/product/prototypes/README.md` 新增“原型作用与布局准确度”说明，明确原型是正式开发前的设计决策工具，用于确认页面骨架、信息层级、关键交互、视觉密度和 Workflow / Fact 边界。
- 完成：补充原型不是第二套系统，也不是完整需求、字段全集、API、权限、菜单、schema、migration 或测试真源；真实实现仍必须回到正式文档、代码、API、RBAC、theme token、migration 和测试。
- 完成：明确原型不要求像素级完美，但 Draft / To Implement / Current 三个阶段分别有不同布局准确度要求；默认按页面类型和关键差异做原型，不逐菜单复制设计。
- 验证：`git diff --check -- docs/product/prototypes/README.md progress.md` 通过。
- 下一步：如后续继续新增原型资产，应按本说明写清阶段、归属、吸收范围和不吸收范围；同类页面优先复用标准样板。
- 阻塞/风险：本轮只补原型 README 和 progress 说明；未改运行时代码、正式菜单、后端 API、RBAC、schema / migration、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送。

## 2026-06-11 15:28 CST（文案清理）

- 完成：全局检查 `/__dev/prototypes` 和 `docs/product/prototypes/index.html` 的当前可见文案，把阶段标签统一为“待实现 / 当前实现”，把当前卡片标题收敛为“样板 / 参考”，移除当前卡片里的“待吸收实现”“候选”“方案对比”和开发文档 registry 口径。
- 完成：同步 `devPrototypes` registry、静态查看器、相关 README、`task-collab-entry-v2.html`、岗位任务端当前实现参考页和 `style:l1` 断言；保留历史流水中的旧词作为演进记录，不再作为当前口径。
- 验证：`node --test web/src/erp/config/devPrototypes.test.mjs`、`git diff --check`、8 个相关 HTML 内联脚本语法检查、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1` 均通过；Playwright 打开 `/__dev/prototypes` 验证 1280px 与 390px 视口无横向溢出、关键文案可见、13 张卡片正常；关键字扫描确认当前原型查看器和样板资产不再出现“待吸收实现”“候选”“当前实现对齐版”等旧口径。
- 下一步：若还要继续压缩可见中英混排，可单独评审是否保留顶部英文标签；当前先保持筛选标签和 Dev Only 标识不变。
- 阻塞/风险：本轮只改原型资产、dev-only 原型查看器页面 / 登记、静态查看器、说明文档和断言；未改正式运行时代码、正式菜单业务语义、后端 API、schema / migration、RBAC、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送。

## 2026-06-11 15:20 CST

- 完成：修正 To Implement 原型查看器里的标题口径，把用户可见的“极简后台工作台原型”“极简业务模块标准页原型”改为“后台工作台样板”“业务模块标准页样板”；同步 HTML `<title>`、静态 `docs/product/prototypes/index.html`、`devPrototypes` registry、单测和 `style:l1` 断言。
- 完成：保留 `docs/product/prototypes/README.md` 中“极简不等于简陋”的设计原则说明，但不再把“极简”作为当前资产标题或卡片标题，避免误读为另起一套后台设计。
- 验证：`node --test web/src/erp/config/devPrototypes.test.mjs`、`git diff --check`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1` 均通过；`rg` 确认当前资产标题和 viewer 卡片标题不再包含“极简”。
- 下一步：如需要把本次标题修正提交推送，可按当前差异单独提交；若继续调整原型文案，应优先使用“标准样板 / 参照规则 / 常用入口”这类中性口径。
- 阻塞/风险：本轮只改标题和说明口径；未改正式运行时代码、正式菜单业务语义、后端 API、schema / migration、RBAC、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送。

## 2026-06-11 15:08 CST

- 完成：继续完善 To Implement 原型体系。保留并修正 `admin-command-center-v1/index.html`、`business-module-page-standard-v1/index.html` 和 `task-collab-entry-v2.html`，让侧栏和少量入口回到 seedData / yoyoosun 客户菜单的常用入口 / 快捷入口表达，不再像另一套正式菜单；三个资产仍保持 To Implement，不晋级 Current。
- 完成：新增三个后台标准样板：`business-detail-page-standard-v1/index.html` 覆盖基础信息、业务状态、关联单据、操作记录、附件区和 Workflow / Fact 动作分区；`business-form-page-standard-v1/index.html` 覆盖字段分组、必填校验、保存 / 取消 / 重置、来源带值、切换清值和缺值 / 残值防护；`action-modal-drawer-standard-v1/index.html` 覆盖审批、驳回、阻塞、冲正、关闭任务、reason 必填和危险确认。
- 完成：同步 `docs/product/prototypes/README.md`、相关子 README、静态 `docs/product/prototypes/index.html`、`devPrototypes` registry / tests 和 `style:l1` 原型查看器断言；明确同类菜单默认参照标准样板，不逐菜单单独设计，打印 / 导入 / 导出等辅助动作本轮只写参照规则。
- 验证：`node --test web/src/erp/config/devPrototypes.test.mjs`、HTML 内联脚本语法抽取检查、`git diff --check`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1` 均通过；Browser 静态验证 `docs/product/prototypes` 下 7 个相关 HTML 在 1280px 和 390px 视口无横向溢出、非空、无错误 overlay、console warn/error 为空，并验证工作台筛选、业务模块协同入口收起 / 展开、协同组件收起 / 展开、详情页 Workflow / Fact 动作区切换、表单校验错误、弹窗 / 抽屉打开关闭和危险确认。
- 下一步：如要吸收到真实页面，必须先按 To Implement Checklist 回到当前运行时代码、共享组件、正式菜单、RBAC、theme token、API 和测试边界；如要减少正式菜单入口，需要另做菜单评审。
- 阻塞/风险：本轮只改原型资产、dev-only 原型登记、style:l1 断言和说明文档；未改正式运行时代码、正式菜单业务语义、后端 API、schema / migration、RBAC、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送。Browser 截图捕获在 CDP `Page.captureScreenshot` 超时，已用 DOM/控制台/视口指标和交互状态作为主要验证证据。

## 2026-06-11 14:59 CST

- 完成：为 `/__dev/prototypes` 左侧筛选和当前打开资产补浏览器本地缓存。刷新后会恢复上次筛选、当前选中的原型资产；无效或已删除的缓存 key 会回落到当前 registry 的第一个有效资产。置顶和目录展开仍沿用原有本地偏好。
- 完成：同步 `docs/current-source-of-truth.md`、`web/README.md` 和 `docs/product/prototypes/README.md` 的 dev-only 行为说明，并补 `devPrototypes` 单元测试与 `style:l1` 刷新恢复断言。
- 验证：`node --test web/src/erp/config/devPrototypes.test.mjs`、`git diff --check -- web/src/erp/config/devPrototypes.mjs web/src/erp/config/devPrototypes.test.mjs web/src/erp/pages/DevPrototypesPage.jsx web/scripts/styleL1.mjs web/README.md docs/current-source-of-truth.md docs/product/prototypes/README.md progress.md`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 均通过；浏览器实测 `/__dev/prototypes` 选择 `business-task-collab-entry` 后刷新，左侧筛选、当前卡片和右侧预览路径均保持。
- 下一步：如后续继续调整原型查看器，可继续复用浏览器本地偏好；若要把偏好变成团队共享配置，需另做正式设计，不应从 `/__dev` 页面直接写后端配置。
- 阻塞/风险：本轮只改 dev-only 原型查看器前端状态和说明文档；未改正式菜单、RBAC、后端 API、schema、migration、WorkflowUsecase、Fact usecase、生产构建、部署、提交或推送。

## 2026-06-11 14:31 CST

- 完成：补充 UI / 原型简化规则。`AGENTS.md` 和 `docs/product/prototypes/README.md` 现在明确“简约、易用、尽量好看”只允许简化信息呈现和交互路径，不能擅自改变正式菜单、客户菜单配置、权限、路由、Workflow / Fact 边界、字段口径或后端能力真源。
- 完成：继续补充“极简不等于简陋”的视觉完成度要求，明确好看、布局均衡、层级清楚、间距合理、对齐稳定也是验收条件；难看、拥挤、空洞、比例失衡、文字层级混乱、按钮过多、卡片堆叠、对齐不齐或移动端横向溢出不能因为“极简”被接受。
- 完成：明确原型里少量高频入口必须标为“快捷入口 / 常用入口”，不能写成替代正式菜单的新结构；如果目标是减少正式入口，必须单独做菜单评审，明确隐藏、排序、改名或合并依据。
- 完成：因 `progress.md` 达到归档边界，已将旧过程记录完整归档到 `docs/archive/progress-2026-06-11-before-ui-simplification-rules.md`，并收缩当前 `progress.md`。
- 验证：待执行 `git diff --check -- AGENTS.md docs/product/prototypes/README.md progress.md docs/archive/progress-2026-06-11-before-ui-simplification-rules.md`。
- 下一步：按新规则修正当前三个待实现极简原型，让原型侧栏 / 菜单回到真实菜单或明确标注为快捷入口，不凭空换一套菜单。
- 阻塞/风险：本轮只改规则、原型 README 和 progress 归档；未改待实现 HTML、运行时代码、正式菜单、后端 API、schema、migration、RBAC、WorkflowUsecase、Fact usecase、生产构建、部署、提交或推送。

## 2026-06-11 14:06 CST

- 完成：按 Product Design 方向重做三个待实现 HTML 原型。`admin-command-center-v1/index.html` 从“工作台 / 任务看板 / 业务看板 / 打印 / 异常”五视图演示收敛为极简今日处理台；`business-module-page-standard-v1/index.html` 收敛为标题摘要、少量筛选、表格、当前记录操作条和底部轻量协同入口；`task-collab-entry-v2.html` 从独立候选页面改为业务页内轻量协同组件候选。
- 完成：同步 `/__dev/prototypes` registry、静态 `docs/product/prototypes/index.html`、原型总 README、两个子 README、`devPrototypes` 测试和 `style:l1` 原型查看器断言；三个 HTML 仍保持 `To Implement`，不晋级 Current。
- 验证：`node --test web/src/erp/config/devPrototypes.test.mjs`、HTML 内联脚本语法抽取检查、`git diff --check -- docs/product/prototypes web/src/erp/config/devPrototypes.mjs web/src/erp/config/devPrototypes.test.mjs web/scripts/styleL1.mjs`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 均通过；浏览器验证 `/__dev/prototypes` 新标题可见、旧标题不再出现、无横向溢出，三个静态 HTML 在 1280px 和 390px 视口均无横向溢出，基础交互可切换且 console warn/error 为空。
- 下一步：如果继续推进正式 UI，应先评审客户首版菜单是否进一步隐藏独立任务看板 / 业务看板 / 异常入口，并把工作台运行时按极简原型吸收；吸收前仍需回到正式菜单、RBAC、theme token、测试和浏览器回归。
- 阻塞/风险：本轮只改原型资产、dev-only 原型登记和说明文档；未改正式菜单、运行时代码、后端 API、schema、migration、RBAC、WorkflowUsecase、Fact usecase、生产构建、部署、提交或推送。

## 2026-06-11 19:19 CST

- 完成：按 Product Design brief 补齐 `docs/product/prototypes/print-template-center-v1/` 待实现原型。新 HTML 样板保持模板打印中心的轻量两栏方向：左侧采购合同 / 加工合同模板导航，右侧固定浅色纸面预览，打印窗口入口负责字段编辑和明细确认；不恢复字段映射栏，不新增样品确认单候选。
- 完成：同步 `/__dev/prototypes` registry、`devPrototypes` 测试、`style:l1` 待实现数量断言、静态原型查看器、原型总 README、`docs/current-source-of-truth.md`、`web/README.md` 和 `docs/document-inventory.md`；`print-template-center-v1` 登记为 `To Implement / Core`，未晋级 Current。
- 验证：`node --test web/src/erp/config/devPrototypes.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1`、`git diff --check -- docs/product/prototypes docs/current-source-of-truth.md docs/document-inventory.md web/README.md web/src/erp/config/devPrototypes.mjs web/src/erp/config/devPrototypes.test.mjs web/scripts/styleL1.mjs progress.md` 均通过；浏览器验证 `/__dev/prototypes` 待实现筛选展示 7 个样板、新卡片可选中、iframe 中模板切换到加工合同后纸面标题和来源状态更新、打印当前模板后出现独立打印窗口提示，桌面和 390px 移动视口查看器无横向溢出。
- 下一步：若要吸收到真实 `/erp/print-center`，需单独按 To Implement 吸收流程核对现有 `printTemplates`、独立打印窗口、主题 token、浅色 / 暗色和浏览器回归；未获用户确认前不把该原型改为 Current。
- 阻塞/风险：本轮只新增原型资产、dev-only 原型登记和正式文档口径；未改正式 ERP 菜单、后端 API、RBAC、schema、migration、模板引擎、字段配置能力、Fact 写入、生产构建、部署、提交或推送。浏览器移动回归中出现一条 Vite HMR WebSocket 连接失败日志，属于当前本地 dev server 连接噪声，不影响原型脚本和页面渲染判断。

## 2026-06-11 19:33 CST

- 完成：采购合同和加工合同独立打印编辑窗口新增 `空白模板` 按钮。点击前会确认；确认后只清空当前窗口草稿里的字段值、明细值和合并状态，保留模板结构与合同条款；加工合同同时清空纸样 / 图样附件快照。
- 完成：新增采购 / 加工空白模板 helper 和单测，锁住“清值但保留条款”的边界；同步 `docs/erp-print-template-field-behavior.md` 说明该动作不修改业务记录、模板配置、后端事实或其他窗口草稿。
- 验证：`node --test web/src/erp/utils/materialPurchaseContractEditor.test.mjs web/src/erp/data/processingContractTemplate.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=print-workspace-material,print-workspace-processing pnpm --dir web style:l1`、`git diff --check` 均通过；Browser 在 `http://localhost:5175` 验证采购合同和加工合同 `空白模板` 确认后字段 / 明细清空、条款保留、无横向溢出、console warn/error 为空。
- 下一步：若后续要做更细的“只清当前字段但保留明细”或“按业务类型清空部分字段”，应单独做字段分组评审，不把本按钮扩成隐式规则。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、seedData、WorkflowUsecase / Fact usecase、生产构建、部署、提交或推送；`空白模板` 在业务记录带值窗口中也会清当前草稿值，但不会反写业务记录。

## 2026-06-11 20:02 CST

- 完成：收口加工合同独立打印编辑窗口的成功反馈。纸样 / 图样附件上传、清空附件位、恢复样例和空白模板生成不再触发全局 `message.success`，改由当前打印窗口工具栏状态和附件上传条自身状态承接，避免成功提示在页面顶部堆叠遮挡。
- 完成：保留错误和非法操作的全局 `message.error` / `message.warning`，确保 PDF 生成失败、附件处理失败、插删行或合并拆分非法时仍有明显反馈；未改采购合同、打印中心入口、PDF / 打印输出、草稿真源、后端 API、schema、migration、RBAC、WorkflowUsecase 或 Fact usecase。
- 验证：`rg -n "message\\.success|已同步\\$\\{slot\\.title\\}|已清空\\$\\{slot\\.title\\}|已恢复默认加工合同样例|已生成空白加工合同" web/src/erp/pages/ProcessingContractPrintWorkspacePage.jsx` 确认本页只剩工具栏状态文本；`pnpm exec stylelint "src/erp/styles/app.css"`、`pnpm test`、`STYLE_L1_SCENARIOS=print-workspace-processing ERP_STYLE_L1_SYNC_PUBLIC_QA=0 pnpm style:l1` 均通过。
- 下一步：如后续要统一采购合同或其他业务页的成功反馈，应按具体页面评估哪些是全局反馈、哪些是窗口内状态，不要一刀切删除错误 / 阻塞提示。
- 阻塞/风险：本轮未运行会自动 `--fix` 全目录的 `pnpm lint`，因为当前工作区已有大量非本轮未提交改动；已用针对文件的静态搜索、stylelint、全量前端单测和加工合同 L1 场景覆盖本次改动。

## 2026-06-11 20:30 CST

- 完成：打印模板独立编辑窗口 favicon 改为按模板标题首字生成动态 SVG。`/erp/print-workspace/material-purchase-contract` 使用 `采`，`/erp/print-workspace/processing-contract` 使用 `加`；打印中心、后台、任务端和 dev-only 页面继续沿用原有 route-aware favicon 规则。
- 完成：新增 favicon 单测，锁住打印工作台在客户品牌 favicon 存在时仍优先显示模板字图标，避免独立编辑窗口退回通用后台或客户品牌图标。
- 验证：`node --test src/common/consts/favicon.test.mjs`、`pnpm exec eslint --ext .js --ext .jsx src/common/consts/favicon.mjs src/common/consts/favicon.test.mjs`、`pnpm test`、`git diff --check -- web/src/common/consts/favicon.mjs web/src/common/consts/favicon.test.mjs` 均通过；Browser 验证采购 / 加工独立编辑窗口的 `link[rel~="icon"]` 分别包含 `采` / `加` 的 SVG data URL，页面 title 分别为 `采购合同打印窗口` / `加工合同打印窗口`，console warn/error 为空。
- 下一步：若后续新增更多正式打印模板，只要登记进 `printTemplateCatalog` 并使用 `/erp/print-workspace/:templateKey`，favicon 会按模板 `shortTitle/title` 首字自动生成。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、seedData、WorkflowUsecase / Fact usecase、打印模板字段、PDF 输出、生产构建、部署、提交或推送；未运行 `pnpm lint` 全目录脚本，因为该脚本会 `--fix src/`，当前工作区已有大量非本轮未提交改动。

## 2026-06-11 20:31 CST

- 完成：完善 `business-form-page-standard-v1` 待实现表单样板。首屏新增首个落地对象、字段真源、状态覆盖和不吸收内容四项确认；页面支持新增、编辑、只读三种状态；只读状态会关闭保存按钮并禁用可编辑字段；无来源切换会清空客户、订单、产品、数量、交期和附件，避免旧来源残值。
- 完成：同步 `business-form-page-standard-v1/README.md`、静态原型查看器、`/__dev/prototypes` registry、`devPrototypes` 单测、原型总 README 和 `style:l1` 待实现筛选断言。该资产仍保持 `To Implement / Core`，未晋级 Current。
- 验证：`pnpm --dir web test -- --runInBand web/src/erp/config/devPrototypes.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web style:l1` 均通过；Playwright 直接打开静态 HTML 验证桌面无横向溢出、只读状态关闭两个保存按钮、无来源保存触发 5 个必填错误、390px 移动视口无横向溢出。
- 下一步：若要吸收到真实页面，应先选定一个目标页面，建议从销售订单新建 / 编辑开始；吸收前必须回到真实 React / AntD 组件、API、RBAC、theme token、字段真源和浏览器回归。
- 阻塞/风险：本轮只改原型资产、dev-only 原型登记、说明文档和测试断言；未改正式 ERP 页面、正式菜单、后端 API、schema / migration、RBAC、WorkflowUsecase、Fact usecase、生产构建、部署、提交或推送。当前工作区已有多处非本轮未提交改动，本轮未回退或整理。

## 2026-06-11 21:16 CST

- 完成：将 `docs/reference/imported-notes/` 下 3 个 imported note 正文 Markdown 文件改为中文文件名，并同步更新 imported-notes README、文档清单和两处活跃产品文档引用；保留 `README.md` 原名。
- 验证：`rg --files docs/reference/imported-notes` 确认目录内正文文件已是中文文件名；按旧英文正文文件名扫描活跃文档后，仅剩原文档里的 Desktop 来源路径，不是仓库内断链。
- 下一步：如后续要继续把文档 H1 或内部标题统一为中文主体 + English anchor，可单独做正文口径整理。
- 阻塞/风险：本轮只改文档文件名和活跃引用；未改 runtime、schema、migration、API、UI、菜单、RBAC、WorkflowUsecase、Fact usecase、部署、提交或推送；历史归档里的旧路径保留原样，不改写历史记录。

## 2026-06-11 21:49 CST

- 完成：按空目录审计结果清理不再保留的占位目录和本地空目录，已将 `docs/assets/`、`web/src/erp/mobile/roles/`、`web/src/erp/modules/`、`web/src/erp/docs/`、旧空页目录 `web/src/pages/AdminGuide|AdminHierarchy|AdminMenu/`、`tmp/spreadsheets/template_material_contract/` 和 `web/output/playwright/*` 空输出目录移动到系统废纸篓；保留 `server/internal/core/` 和 `deployments/` 作为仍需正式评审或客户部署资料边界的目录。
- 完成：同步更新 `docs/document-inventory.md`，删除已清理的 `docs/assets/mobile-role-tasks/README.md`、`web/src/erp/mobile/roles/README.md` 和 `web/src/erp/modules/README.md` 索引。
- 下一步：如果要把未来架构规划交给 GPT，只应提供 `server/internal/core/`、`web/src/erp/mobile/roles/` 和 `web/src/erp/modules/` 这类“未来分层是否还需要”的问题；不要把已下线的 `web/src/erp/docs/`、旧 Admin 空页或本地输出目录作为规划输入。
- 阻塞/风险：本轮只做目录清理和文档清单同步；未迁移 `core` 代码、未改变 runtime、路由、菜单、RBAC、后端 API、schema、migration、WorkflowUsecase、Fact usecase、生产构建、部署、提交或推送。当前工作区已有非本轮文档重命名和修改，本轮未回退或整理。

## 2026-06-11 22:18 CST

- 完成：排查在线预览卡顿并对齐 `trade-erp` 的更轻主路径。移除采购合同和加工合同打印工作台打开 / 草稿变化后的自动 PDF 预热，不再在页面启动 450ms 后后台克隆 DOM、内联样式 / 图片并请求 `/templates/render-pdf`；在线 PDF 改为用户点击“在线预览 PDF”时按需生成。
- 完成：清理无调用方的 `warmupPdfPreviewFromElement` 和对应单测，避免后台预热重新变成隐藏主路径；同时将 Vite 构建拆包策略对齐 `trade-erp`，取消手工 `vendor` 聚合 chunk，交给 Rollup 自动拆包并保留 1200KB chunk warning 阈值。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web build`、`STYLE_L1_SCENARIOS=print-workspace-material,print-workspace-processing pnpm --dir web style:l1` 均通过；本地 preview `http://127.0.0.1:4173/admin-login` 通过 Browser 检查，页面身份正确、DOM 非空、console warn/error 为空。
- 下一步：如仍觉得点击“在线预览 PDF”后的服务端生成时间偏长，应单独排查 `/templates/render-pdf` 后端渲染、模板图片体积和 Chromium 队列；不要重新加页面打开阶段的后台自动预热。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、seedData、WorkflowUsecase / Fact usecase、PDF 服务端渲染逻辑、生产部署、提交或推送；Browser 截图 API 在本环境超时，已改用 DOM / console / L1 回归作为证据。当前工作区已有非本轮文档改动，本轮未回退或整理。

## 2026-06-11 22:35 CST

- 完成：将 `/Users/simon/Desktop/gpt给出的一些方案` 下两批 GPT 参考资料复制归档到 `docs/reference/第一次20260519/` 和 `docs/reference/第二次20260611/`；跳过 `.DS_Store`，并按用户纠正确认桌面原路径仍保留一份副本。
- 完成：按“重复资料不保留”的要求，将旧 `docs/reference/imported-notes/` 移到系统废纸篓；同步更新 `README.md`、`docs/current-source-of-truth.md`、`docs/reference/README.md` 和 `docs/document-inventory.md`，撤掉旧 imported-notes 入口，保留 Reference Only 边界。
- 验证：`find docs/reference -maxdepth 3 -type f | sort` 确认 17 个实际资料文件已归档；桌面 `/Users/simon/Desktop/gpt给出的一些方案` 已恢复同批次副本；`rg -n "docs/reference/imported-notes|reference/imported|Imported Design Notes|imported design notes|imported note" README.md docs/current-source-of-truth.md docs/document-inventory.md docs/reference/README.md` 无匹配；`git diff --check -- README.md docs/current-source-of-truth.md docs/reference/README.md docs/document-inventory.md progress.md docs/reference` 通过。
- 下一步：如后续要把某份 GPT 方案吸收到正式路线、架构或实现任务，必须先按当前仓库真源复核，不能直接把 `docs/reference/*` 当执行规格。
- 阻塞/风险：本轮只做参考资料归档、重复目录删除和索引同步；未改 runtime、schema、migration、API、UI、菜单、RBAC、WorkflowUsecase、Fact usecase、生产构建、部署、提交或推送。当前工作区已有其他非本轮未提交改动，本轮未回退或整理。

## 2026-06-11 23:10 CST

- 完成：继续排查在线预览和浏览器启动卡顿。保留上一轮移除 PDF 自动预热的主路径修复，并进一步将 `App.jsx` 的桌面 / 岗位任务端 router 改为按当前 app 类型懒加载，避免桌面预览首屏静态拉取 `src/erp/mobile/router.jsx` 和移动端入口代码。
- 完成：修正真实登录 smoke 的当前页面断言：登录成功等待标题改为当前 `后台首页 / 工作台`；采购合同示例保留两行材料，金额联动 smoke 的合计期望同步为 `483.45` 和 `2360.00`。
- 验证：桌面登录页资源检查确认不再请求 `src/erp/mobile/*`；`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web build`、`pnpm --dir web build:mobile:boss` 均通过；L1 覆盖 `root-redirect-desktop`、`admin-login-theme-modes-desktop`、`print-workspace-material`、`print-workspace-processing`、`print-workspace-material-preview-popup`、`print-workspace-processing-preview-popup` 均通过；真实 5175 登录 smoke 中采购合同在线预览约 `1399ms`、加工合同在线预览约 `1390ms`，均低于 `10000ms` 阈值。
- 下一步：如后续还要继续压首屏体积，可评审 `antd` / `mobileRolePermissions` 等共享依赖拆包；当前不再把移动端入口放进桌面首屏，也不再恢复页面打开时的 PDF 后台预热。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、seedData、WorkflowUsecase / Fact usecase、PDF 服务端渲染逻辑、部署、提交或推送；当前工作区仍有非本轮文档 / 目录清理改动，本轮未回退或整理。

## 2026-06-12 16:15 CST

- 完成：按 `docs/reference/第二次20260611/server:internal:core 分层、保留与迁移规范.md` 的 CORE-01 收口 `server/internal/core` 边界。`server/internal/core/README.md` 明确 core 只放无 IO 纯产品规则，不作为第二套 `biz/data`、JSON-RPC 或 runtime；新增最小 `doc.go` 让 `go test ./internal/core/...` 成为稳定可执行入口。
- 完成：新增 `scripts/qa/core-boundary.test.mjs`，扫描 core import 和源码危险模式，阻止 `internal/biz`、`internal/data`、`internal/service`、Ent、SQL、HTTP、Kratos transport、配置、环境变量和文件系统依赖进入 core；并接入 `scripts/qa/fast.sh`、`full.sh`、`strict.sh`。
- 完成：同步 `scripts/README.md`、`docs/product/test-strategy.md`、`server/README.md` 和 `docs/current-source-of-truth.md`，明确 core 当前只是边界 / 骨架 / guard，不迁移业务逻辑、不改 schema / migration、不改变 `biz/data` 主路径。
- 验证：`node --test scripts/qa/core-boundary.test.mjs` 通过；`cd server && go test ./internal/core/...` 通过；`bash -n scripts/qa/fast.sh scripts/qa/full.sh scripts/qa/strict.sh` 通过；`find scripts -name '*.test.mjs' -print0 | xargs -0 node --test` 通过 56 项；本轮触达文件 `git diff --check` 通过。
- 下一步：后续如继续 CORE-02，应只迁移已被 `biz` 实际消费的值对象 / 领域错误，并同步删除重复校验，避免把未使用抽象提前塞进 core。
- 阻塞/风险：本轮不迁移状态机、计算器或 usecase，不接 JSON-RPC / API / DB / customer config，不新增 Ent schema 或 Atlas migration；未运行完整 `scripts/qa/fast.sh`，因为该脚本会执行前端 `pnpm lint --fix`，当前工作区已有非本轮前端未提交改动。

## 2026-06-12 16:34 CST

- 完成：继续 CORE-02，但按用户要求只迁移当前 `biz` 已明确重复且可测试覆盖的纯校验。新增 `server/internal/core/errors` 和 `server/internal/core/value`，当前只包含正数数量、非负 / 正数金额、幂等键及对应领域错误。
- 完成：将 `sales_order`、`purchase_receipt`、`purchase_return`、`purchase_receipt_adjustment`、`inventory` 和 Phase 8 事实 / 出货 / 预留 / 财务输入里的重复 quantity / money / idempotency 校验改为调用 `core/value`；对外仍保持 `ErrBadParam`，不改变 JSON-RPC 错误口径。
- 完成：同步 `server/internal/core/README.md`、`docs/current-source-of-truth.md` 和 `server/README.md`，明确 core 已有第一批值对象 / 领域错误，但仍不承载状态机、计算器、应用编排、runtime、schema 或 migration。
- 验证：`node --test scripts/qa/core-boundary.test.mjs` 通过；`cd server && go test ./internal/core/...` 通过；`cd server && go test ./internal/biz` 通过；本轮 core / biz 触达文件 `git diff --check` 通过。
- 下一步：如果继续迁移，应先找 `biz` 中已重复且已有测试或能补测试的具体规则；`SourceRef` 和 `Percentage` 暂未迁移，因为当前 source id 清理和 loss_rate 口径还不是多处一致的独立纯规则。
- 阻塞/风险：本轮没有迁移状态机、库存可用量计算、BOM 展开、采购收货状态计算、schema、migration、JSON-RPC、service、data repo 或前端；没有运行完整 `scripts/qa/fast.sh`，因为当前工作区已有大量非本轮未提交改动且 fast 会执行前端 `pnpm lint --fix`。

## 2026-06-12 16:20 CST

- 完成：继续排查本地 Chrome 在线预览停在“正在等待 PDF 预览结果...”的问题。定位为预览壳页和结果写入之间存在竞态：PDF 生成完成后若 Chrome 仍在完成壳页导航，直接写入窗口可能被后续壳页覆盖；旧持久化顺序又先等待 IndexedDB，导致 localStorage 兜底没有及时写入，壳页只能继续等待。
- 完成：调整 `printPdf.mjs` 的 PDF 预览结果持久化顺序，先同步写入 localStorage，再后台写 IndexedDB；即使窗口被壳页导航覆盖，壳页也能立刻从同源 localStorage 恢复 PDF 结果。新增单测覆盖 IndexedDB 未返回时 localStorage 仍先有结果。
- 完成：加强采购合同和加工合同真实登录 smoke：弹窗出现 iframe 后继续等待并断言窗口不再包含“正在等待 PDF 预览结果...”或过期提示，且 iframe 指向 `blob:` PDF，避免测试过早通过。
- 验证：`pnpm --dir web exec node --test src/erp/utils/printPdf.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web build` 均通过；`STYLE_L1_SCENARIOS=print-workspace-material,print-workspace-processing,print-workspace-material-preview-popup,print-workspace-processing-preview-popup pnpm --dir web style:l1` 通过；真实 5175 smoke 中采购合同在线预览约 `1917ms`、加工合同在线预览约 `2431ms`，并通过新增的非等待壳页断言。
- 下一步：本地 Chrome 已经停在旧的等待壳页时，需要关闭该旧预览页并从工作台重新点“在线预览 PDF”，让新代码重新打开预览窗口；不要在旧等待页上刷新验证。
- 阻塞/风险：Chrome 插件当前只暴露到 ChatGPT 标签，AppleScript 又被本机 Chrome 禁止执行页面 JS，因此未直接读取用户截图页的 localStorage；已通过当前代码路径、壳页文案、真实 5175 smoke 和新增断言复现并锁住对应竞态。未改后端 API、schema / migration、RBAC、seedData、WorkflowUsecase / Fact usecase、PDF 服务端渲染逻辑、部署、提交或推送。

## 2026-06-12 16:27 CST

- 完成：按用户无痕 Chrome 仍停在“正在等待 PDF 预览结果...”继续对照 `trade-erp`。确认 `trade-erp` 的 PDF 预览不是直接 `document.write` 弹窗，而是先把 PDF iframe HTML 写入 state，再驱动 `/pdf-preview-shell.html?state=...` 壳页恢复。
- 完成：将本项目 `printPdf.mjs` 对齐为同一主路径：不再依赖直接写入弹窗；PDF 生成成功或失败后先持久化预览 HTML，localStorage 成功即立即返回并后台补写 IndexedDB，然后调用壳页恢复函数并 `location.replace(previewShellURL)`。这样无痕 / 本地 Chrome 即使壳页导航较慢，也会从 state 恢复，不会被直接写窗口竞态覆盖回等待页。
- 完成：更新 `printPdf` 单测，把旧“直接写入当前预览窗口”断言改为“先写 state 再驱动壳页恢复”，并断言不会调用 `document.write`；保留 localStorage 先行、IndexedDB 兜底、生成失败错误页等覆盖。真实登录 smoke 继续断言弹窗最终不是等待壳页且 iframe 为 `blob:`。
- 验证：`pnpm --dir web exec node --test src/erp/utils/printPdf.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web build` 均通过；合同预览 L1 四场景通过；真实 5175 smoke 中采购合同在线预览约 `1897ms`、加工合同在线预览约 `1901ms`；`cd server && go test ./internal/server -run 'TemplatePDF|RenderPDF|PDF'` 通过，确认本轮不需要改服务端 PDF 渲染代码。
- 下一步：验证本地 Chrome / 无痕时，必须关闭旧等待页并重新从工作台点击“在线预览 PDF”；旧等待页本身没有新 state，刷新它仍不是有效验证。
- 阻塞/风险：本轮未改后端 API、schema / migration、RBAC、seedData、WorkflowUsecase / Fact usecase、PDF 服务端渲染逻辑、部署、提交或推送；当前工作区有其他非本轮部署 / core / 文档现场，本轮未回退或整理。

## 2026-06-12 16:40 CST

- 完成：按 `docs/reference/第二次20260611/` 的部署资料包参考稿，并以仓库当前真源复核后，补齐 `deployments/yoyoosun/` 私有化部署资料包：env / server / web 配置样例、Compose / Nginx 样例、首次部署 / 升级 / 回滚 / 备份恢复 / migration / 导入边界 / 故障处理 / 日常运维 runbook、部署 / smoke / 安全 / 备份恢复 / 升级 / 回滚 / 周月巡检清单、发布 / migration / 备份 / smoke evidence 模板和薄脚本。
- 完成：新增 `scripts/deploy/deployment-package-lint.mjs` 与单测，并接入 `scripts/qa/fast.sh`、`scripts/qa/full.sh`、`scripts/qa/strict.sh`；同步 `deployments/README.md`、`scripts/README.md`、`docs/document-inventory.md`、`docs/current-source-of-truth.md`、`docs/product/private-deployment-package-review.md` 和 `config/private-deployment-template/templateConfig.mjs`，明确 yoyoosun 资料包已落地但不替代 `server/deploy/compose/prod`。
- 验证：`node scripts/deploy/deployment-package-lint.mjs --customer yoyoosun`、`node --test scripts/deploy/deployment-package-lint.test.mjs`、`bash deployments/yoyoosun/scripts/verify-env.sh --example`、`bash deployments/yoyoosun/scripts/verify-backup-restore.sh --evidence deployments/yoyoosun/evidence/backups/backup-evidence-template.md`、`bash -n deployments/yoyoosun/scripts/verify-env.sh deployments/yoyoosun/scripts/run-smoke.sh deployments/yoyoosun/scripts/collect-evidence.sh deployments/yoyoosun/scripts/verify-backup-restore.sh scripts/qa/fast.sh scripts/qa/full.sh scripts/qa/strict.sh`、`node scripts/qa/private-deployment-boundaries.mjs`、`node --test scripts/qa/phase11-private-deployment-closure.test.mjs`、`node scripts/qa/phase11-private-deployment-closure.mjs --out output/customers/yoyoosun/phase11-private-deployment-closure`、本轮路径 `git diff --check` 均通过；`find deployments/yoyoosun` 确认未出现真实 `.env`、证书、dump、备份或客户 raw 文件。
- 下一步：如要进入真实客户试用发布，应另行执行受控 `.env` 校验、目标机 `docker load`、host Atlas migration、health / RBAC / 浏览器 smoke 和发布后清理；真实客户数据导入仍需单独数据治理任务和客户审批。
- 阻塞/风险：本轮只做部署资料包、文档和本地 lint；未改后端 API、schema / migration、RBAC、WorkflowUsecase、Fact usecase、生产部署主路径、真实 `.env`、真实备份、客户 raw files、真实导入、提交或推送。当前工作区已有非本轮前端、core 和 `progress.md` 改动，本轮未回退或整理。

## 2026-06-12 16:31 CST

- 完成：读取 `docs/reference/第二次20260611/产品核心菜单与页面功能规格.md` 及同目录路线图、客户配置、测试、部署和 core 边界参考稿，并按仓库当前真源复核后，新增 `docs/product/prototypes/core-menu-coverage-v1/` 待实现原型：把 20260611 参考规格中的 15 个一级菜单、51 个二级菜单收口为可筛选内容矩阵，逐菜单标注页面类型、事实源、关键字段、核心动作和 Workflow / Fact / RBAC / 导入边界。
- 完成：同步原型目录说明、静态原型索引、`/__dev/prototypes` 资产登记、dev prototype 单测、L1 场景和 `docs/document-inventory.md`；新增原型目录级 favicon，避免静态浏览器回归出现 `/favicon.ico` 404 噪音。新增样板保持 To Implement，不升级 Current，也不替代当前 `seedData.mjs`、客户菜单配置、路由、RBAC、schema、API 或正式产品真源。
- 验证：`rg -o "\{ group:" docs/product/prototypes/core-menu-coverage-v1/index.html | wc -l` 确认为 51；`cd web && node --test src/erp/config/devPrototypes.test.mjs` 通过；`cd web && pnpm test -- --run src/erp/config/devPrototypes.test.mjs` 实际按当前脚本跑完整前端测试，347 项通过；`cd web && pnpm lint`、`cd web && pnpm css`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm style:l1` 通过；临时静态服务 + Playwright 断言通过静态索引、新原型页、51 卡片、库存分组、Legacy 搜索、空状态恢复和 1440 / 390 视口横向溢出检查；本轮路径 `git diff --check` 通过。
- 下一步：后续如要把某个菜单从覆盖矩阵推进到真实页面，应按该菜单对应的 schema / API / RBAC / seedData / 客户菜单配置单独立项，并复用列表页、详情页、表单页、动作浮层、工作台、报表、导入或移动任务标准样板，不把参考稿直接当正式菜单实现规格。
- 阻塞/风险：本轮只做 Reference Only 的 To Implement 原型覆盖、登记、静态文档和 dev-only 验证；未改后端 API、schema / migration、RBAC、WorkflowUsecase、Fact usecase、正式运行时菜单、客户菜单、生产构建、部署、提交或推送。当前工作区已有非本轮部署资料包、core、PDF 预览和其他文档 / 前端改动，本轮未回退、整理或纳入成果。

## 2026-06-12 16:43 CST

- 完成：按用户指定入口 `http://localhost:5175/erp/print-center?template=processing-contract` 继续排查打印中心到 PDF 预览全过程。定位到前端壳页恢复仍先等待 IndexedDB：即使 PDF 结果已经同步写入 localStorage，`pdf-preview-shell.html` 也会先卡在 IndexedDB；`print-window-shell.html` 同类恢复顺序也会拖慢打印中心打开工作台。
- 完成：调整 `/pdf-preview-shell.html` 和 `/print-window-shell.html` 的恢复主路径为先读同源 localStorage，缺失时再回退 IndexedDB；同步让 `persistPrintWorkspaceWindowHTML` 在 localStorage 写入成功后立即返回，后台补写 IndexedDB，避免本地 Chrome / 无痕窗口被 IndexedDB 阻塞。
- 完成：新增 `style:l1` 场景 `print-center-processing-preview-popup`，覆盖 `print-center?template=processing-contract -> 打印当前模板 -> 在线预览 PDF -> PDF 壳页 iframe blob`，明确断言弹窗不再停留在“正在等待 PDF 预览结果...”或“PDF 预览不存在或已过期”。
- 验证：Browser 插件可打开 `localhost:5175` 指定入口并确认页面身份 / DOM / console；插件弹窗捕获能力不足，已用 Playwright exact-flow 回归兜底。`pnpm --dir web exec node --test src/erp/utils/printPdf.test.mjs src/erp/utils/printWorkspace.test.mjs`、`STYLE_L1_BASE_URL=http://localhost:5175 STYLE_L1_SCENARIOS=print-center-processing-preview-popup pnpm --dir web style:l1`、`pnpm --dir web lint && pnpm --dir web css && pnpm --dir web test && pnpm --dir web build`、`cd server && go test ./internal/server -run 'TemplatePDF|RenderPDF|PDF'` 均通过。
- 下一步：本地 Chrome / 无痕验证时必须关闭旧的等待 / 过期 PDF 标签页，再从打印中心重新点“打印当前模板”和“在线预览 PDF”；旧标签页没有新的 state 写入，刷新旧页不算有效验证。
- 阻塞/风险：本轮不需要改后端 PDF 渲染代码、API、schema / migration、RBAC、seedData、WorkflowUsecase / Fact usecase、部署、提交或推送；当前工作区已有非本轮部署资料包、core、原型和文档现场，本轮未回退或整理。

## 2026-06-12 17:22 CST

- 完成：继续 CORE-03，但只按当前仓库真实状态迁移出货状态机。新增 `server/internal/core/status`，当前只定义 `DRAFT / SHIPPED / CANCELLED`，合法迁移为 `DRAFT -> SHIPPED` 和 `SHIPPED -> CANCELLED`；重复发货在 `SHIPPED` 上幂等返回，重复取消在 `CANCELLED` 上幂等返回，`DRAFT` 取消和 `CANCELLED` 再发货仍拒绝。
- 完成：`biz` 的出货状态常量改为引用 `core/status`，`data` 事务内的出货状态判断改为调用 `core/status` 纯判断；库存流水、冲正、行锁、事务、Ent 查询和对外 `ErrBadParam` 仍保留在 `data/biz` 主路径，`core` 不 import `data/ent/sql`。
- 完成：补 `core/status` 单测和 Phase 8 repo 重复动作测试；同步 `server/internal/core/README.md`、`server/README.md` 和 `docs/current-source-of-truth.md`，明确本轮未新增 READY / CLOSED / CANCELLED_AFTER_SHIPPED，未改 schema / migration / JSON-RPC / 前端。
- 验证：`node --test scripts/qa/core-boundary.test.mjs` 通过；`cd server && go test ./internal/core/... ./internal/biz ./internal/data` 通过；本轮触达文件 `git diff --check` 通过。
- 下一步：如继续 CORE 状态机迁移，应先选当前代码中已稳定、已测试且没有 schema/API 语义扩展的单一状态机，不能顺手引入未来状态或改 JSON-RPC。
- 阻塞/风险：当前仍有部署资料包、PDF 预览和原型等并行现场未收口；本轮未提交、未推送，也未整理这些非 CORE-03 改动。
