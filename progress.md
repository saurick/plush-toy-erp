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
- `/erp/business-dashboard` 仍只作为运营摘要和业务风险看板，不作为事实真源；`/erp/print-center` 保留模板目录、纸面预览、字段映射和可编辑打印窗口入口；`/erp/operations/exceptions` 作为异常 / 阻塞闭环入口。
- 完整 `pnpm --dir web style:l1` 已恢复通过；后续若继续吸收或评审原型，应继续复用现有页面、现有 Workflow API、现有菜单 / RBAC / theme token，不新增未评审后端 API、schema、migration、权限码或 Fact 写入。
- 业务页协同入口的任务分组、统计、阻塞原因和催办态已收口到纯前端 helper，并纳入 `pnpm test`；该 helper 只服务 Workflow 展示口径，不写事实层。
- `docs/product/prototypes` 当前待实现队列包含工作台 / 总控页、业务模块列表页、业务详情页、新建 / 编辑表单、业务页轻量协同入口和弹窗 / 抽屉动作六个 HTML 标准样板；只有岗位任务端 `mobile-role-tasks-v1/implemented-reference.html` 登记为当前实现对齐版。

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
