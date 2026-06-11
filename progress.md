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
- `docs/product/prototypes` 当前待实现队列包含工作台 / 总控页、业务模块列表页、业务详情页、新建 / 编辑表单、业务页协同入口组件和弹窗 / 抽屉动作六个 HTML 标准样板；只有岗位任务端 `mobile-role-tasks-v1/implemented-reference.html` 登记为当前实现参考。
- 原型查看器和原型 README 已补“参照范围”口径：参照范围只说明可借鉴的页面 / 菜单类型，不是正式菜单、路由、权限或 seedData 映射表；真正对应关系必须在进入真实实现任务时回到代码、菜单配置和 RBAC 重新核对。

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
