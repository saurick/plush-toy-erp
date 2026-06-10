# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-08-before-business-records-debug-cleanup.md`：归档截至 2026-06-08 13:50 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 318 行 / 82540 bytes，超过 80KB 阈值；本轮旧 `project-orders` debug cleanup 前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-09-before-brand-config.md`：归档 2026-06-08 21:08 CST 至 2026-06-08 23:07 CST 的过程记录。归档原因：当前 `progress.md` 达到 383 行 / 80205 bytes，超过 80KB 阈值；本轮前端品牌客户配置化前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-10-before-style-l1-stabilization.md`：归档 2026-06-08 23:55 CST 至 2026-06-10 17:34 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 378 行 / 82385 bytes，超过 80KB 阈值；本轮修完整 `style:l1` 稳定性前先保留完整现场，再收缩当前入口。

## 当前活跃事项

- `/erp/dashboard` 已收回为更贴近原型的 Workflow 任务看板首屏：标题、筛选条、本页待办 / 阻塞异常 / 今日到期 / 已完成四泳道、分页表格、详情抽屉、阻塞原因、催办和完成动作进入真实前端运行时。
- `BusinessModulePage` 已把筛选区、表格工具栏、已选记录操作条、分页和业务页协同入口收口到标准页结构；协同入口只处理 Workflow 任务，不写事实层。
- `/erp/business-dashboard` 仍只作为运营摘要和业务风险看板，不作为事实真源；`/erp/print-center` 保留模板打印中心入口。
- 完整 `pnpm --dir web style:l1` 已恢复通过；后续若继续吸收原型，应继续复用现有页面、现有 Workflow API、现有菜单 / RBAC / theme token，不新增正式原型菜单。
- 业务页协同入口的任务分组、统计、阻塞原因和催办态已收口到纯前端 helper，并纳入 `pnpm test`；该 helper 只服务 Workflow 展示口径，不写事实层。
- `docs/product/prototypes` 当前待实现队列包含后台工作台与看板、业务模块标准页和协同入口三个 HTML 原型；只有岗位任务端 `mobile-role-tasks-v1/implemented-reference.html` 登记为当前实现对齐版。

## 2026-06-10 23:01 CST

- 完成：回退原型资产状态误标。`admin-command-center-v1/index.html`、`business-module-page-standard-v1/index.html` 和 `business-module-page-standard-v1/task-collab-entry-v2.html` 已从 `当前实现 / Current` 退回 `待吸收实现 / To Implement`；图中岗位任务端 `mobile-role-tasks-v1/implemented-reference.html` 继续保留 Current。
- 完成：同步 `/__dev/prototypes` registry、`devPrototypes` 测试、静态 `docs/product/prototypes/index.html`、原型总 README 和两个子 README；明确已有局部页面或片段不等于完整实现，三个产品内核相关 HTML 仍需按 To Implement Checklist 实现、测试、浏览器回归并经用户确认后才能晋级 Current。
- 验证：`node --test web/src/erp/config/devPrototypes.test.mjs`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1` 和 `git diff --check` 均通过；`rg` 已确认 Current 只剩岗位任务端资产，三个产品内核 HTML 均为待吸收实现。
- 下一步：如果要开 goal 做实现，应以这 3 个 To Implement 原型为范围，先收敛产品内核页面清单和分批验收，不把状态改为 Current，直到用户明确确认。
- 阻塞/风险：本轮只修正原型状态、文档和测试口径；未实现后台工作台整套体验、业务模块标准页覆盖所有产品内核页面，或协同入口完整运行时闭环。

## 2026-06-10 23:00 CST

- 完成：补充原型阶段晋级门禁。`docs/product/prototypes/README.md` 现在明确 `待实现 / To Implement` 晋级 `当前实现 / Current` 必须满足真实实现、测试 / 浏览器回归、正式文档同步和用户明确确认；Codex 不能仅凭自己完成代码、测试通过或部分承接就擅自清空待实现队列。
- 完成：`AGENTS.md` 同步执行约束，要求未获用户明确确认时只能在 `progress.md` 或最终回复中建议“候选晋级 Current”，不能修改 registry、静态索引、README 或资产状态为 Current。
- 验证：待完成 `git diff --check -- docs/product/prototypes/README.md AGENTS.md progress.md`。
- 下一步：后续需要单独评审当前已被改成 Current 的原型资产是否应回退为 To Implement；本轮先只补规则，不调整现有资产状态。
- 阻塞/风险：本轮只改 Markdown 规则和过程记录，未改 `/__dev/prototypes` registry、静态索引、运行时代码、后端 API、schema、migration、RBAC、seedData 或 Fact 写入。

## 2026-06-10 22:52 CST

- 完成：补充 `docs/product/prototypes/README.md` 的原型分类规则，将阶段分类和归属分类拆开说明：阶段用于判断 Draft / To Implement / Current / Reference，归属用于判断 Core / Customer / Exploration / Evidence。
- 完成：为当前原型资产表增加阶段和归属列，先完成文档级分类；本轮不移动目录、不调整 `/__dev/prototypes` registry、不改运行时代码、不新增菜单、后端 API、schema、migration、RBAC、seedData 或 Fact 写入。
- 验证：`git diff --check -- docs/product/prototypes/README.md progress.md` 通过；`rg` 已确认 README 中阶段分类、归属分类和当前资产分类可检索。
- 下一步：后续如原型资产数量继续增加，再评审是否把目录物理拆成 `core/`、`customers/<customer-key>/`、`exploration/` 和 `evidence/`；新增客户原型时必须写明 customer key。
- 阻塞/风险：现有 `/__dev/prototypes` 顶部筛选仍是全部 / 当前实现 / 待实现 / 参考资料四类；本轮只补文档分类说明，没有新增第二维筛选 UI。

## 2026-06-10 22:44 CST

- 完成：继续收口所有 `待实现 / To Implement` 原型。后台工作台与看板、业务模块标准页和协同入口三个 HTML 原型已从 `/__dev/prototypes` 待实现队列移入当前实现队列；运行时承接路径保持为 `/erp/dashboard`、`/erp/business-dashboard`、`/erp/print-center`、`BusinessModulePage` 和共享业务列表 / 协同面板组件。
- 完成：同步 `web/src/erp/config/devPrototypes.mjs`、`devPrototypes` 测试、`style:l1` 原型查看器断言、静态 `docs/product/prototypes/index.html`、原型 README、`docs/current-source-of-truth.md`、`web/README.md` 和本进度记录。明确不吸收原型固定数字、静态任务、假客户、mock 脚本、dev-only 外壳、第二套菜单、第二套任务状态或 Fact 写入。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`node --check web/scripts/styleL1.mjs`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop,erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop,erp-business-dashboard-desktop,print-center-desktop,print-center-dark-desktop,business-module-workflow-actions,business-processing-contracts-desktop,business-reconciliation-desktop pnpm --dir web style:l1` 和 `git diff --check` 均通过；`pnpm test` 当前 339 项通过。Browser 在 `http://127.0.0.1:5175/__dev/prototypes` 验证当前实现 4 项、待实现 0 项、console warn/error 为空、无横向溢出；在 `/erp/dashboard` 验证任务看板加载完成、无 overlay、无横向溢出；在 `/erp/purchase/accessories` 验证标题、新建记录、当前操作、本页协同入口和 Workflow 边界提示可见、console warn/error 为空、无横向溢出。业务页截图 API 两次超时，已用 DOM / box metrics 与 L1 断言收口。
- 下一步：完成验证后收口；后续新增 To Implement 原型仍按 checklist 进入待实现筛选，不从旧 HTML 复制静态逻辑到运行时。
- 阻塞/风险：本轮未改后端 API、schema、migration、seedData、正式菜单、RBAC、WorkflowUsecase 或 Fact usecase；当前变更主要是运行时原型状态登记、测试守卫和正式文档口径同步。

## 2026-06-10 21:41 CST

- 完成：收敛产品原型资产分类口径，移除容易误读的 `探索方案 / Exploration` 状态，改为 `待吸收实现 / To Implement`；新增 `起草阶段 / Draft`，用于标记尚未定稿的 PNG 方向图。HTML / PNG 只表示资产格式，不再承担是否即将实现的语义。
- 完成：同步 `/__dev/prototypes` 运行时 registry、筛选按钮、筛选说明、静态 `docs/product/prototypes/index.html`、`docs/product/prototypes/README.md` 和业务模块原型 README；后台工作台、业务模块标准页和协同入口 HTML 标记为待吸收实现，三张业务协同方向 PNG 标记为起草阶段 + 方案对比。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`node --check web/scripts/styleL1.mjs`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1` 和 `git diff --check` 均通过；Browser 插件在 `http://127.0.0.1:5175/__dev/prototypes` 验证页面无 Vite overlay、console warn/error 为空、无横向溢出，`待吸收实现` 筛选展示 3 个 HTML 候选，`起草阶段` 筛选展示 3 张 PNG 方向图。Browser 截图 API 两次超时，未留下截图证据。
- 下一步：后续新增原型资产时先判断用途状态，再登记格式；待吸收实现落地时仍必须接入现有 API、RBAC、菜单、theme token 和测试，不直接复制静态数据或未评审交互。
- 阻塞/风险：本轮只改 dev-only 原型查看器配置、静态原型资产索引、README、样式和测试；不改正式 ERP 菜单、seedData、后端 API、schema、migration、RBAC、WorkflowUsecase 或 Fact usecase。

## 2026-06-10 22:01 CST

- 完成：继续整理产品原型查看器分类，顶部筛选从多个细状态收敛为 `全部 / All`、`当前实现 / Current`、`待实现 / To Implement`、`参考资料 / Reference` 四类；`起草阶段 / Draft`、`截图证据 / Evidence`、`方案对比 / Comparison` 等保留为卡片细标签和 README 追溯信息。
- 完成：同步 `/__dev/prototypes`、静态 `docs/product/prototypes/index.html`、原型 README、筛选配置测试和 `dev-prototypes-dark-desktop` L1 回归；参考资料分类现在统一覆盖未进入当前实现或待实现队列的草图、方向图、截图证据、历史方案和方案对比。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`node --check web/scripts/styleL1.mjs`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1` 和 `git diff --check` 均通过；`pnpm test` 当前 339 项通过。
- 下一步：后续新增原型资产时先归入四个顶部决策分类，再用细标签解释来源和状态；HTML / PNG 文件格式仍不承担状态语义。
- 阻塞/风险：本轮仍只改 dev-only 原型查看器、静态原型资产索引、README、样式和测试；未改正式 ERP 菜单、seedData、后端 API、schema、migration、RBAC、WorkflowUsecase、Fact usecase、生产构建、部署、提交或推送。

## 2026-06-10 22:13 CST

- 完成：补齐原型协作长期规则。`docs/product/prototypes/README.md` 增加 `起草阶段 PNG -> 待实现 HTML -> 当前实现` 三阶段流程、可跳过条件、Product Design / Codex 分工和主阶段 / 辅助标签口径。
- 完成：`AGENTS.md` 新增“原型与 Product Design 协作”规则，明确视觉探索、PNG 草案、多方案比较、截图 / mockup / Figma / URL 转原型和设计 QA 优先使用 `@product-design`；把已选方案吸收到正式代码时仍由 Codex 回到仓库真源、现有组件、API、RBAC、菜单、theme token、正式文档和测试。
- 完成：同步 `docs/current-source-of-truth.md` 与 `web/README.md` 中 `/__dev/prototypes` 筛选说明为全部 / 当前实现 / 待实现 / 参考资料四类。
- 验证：`rg` 检查原型流程、Product Design、主阶段和辅助标签口径；`git diff --check` 通过。本轮只改规则和 Markdown，未重跑前端构建或浏览器回归。
- 下一步：后续涉及原型任务时先按三阶段判断；辅助标签继续保留为追溯信息，不再扩展成顶部筛选分类。
- 阻塞/风险：本轮未改运行时代码、测试脚本、正式菜单、后端 API、schema、migration、RBAC、WorkflowUsecase、Fact usecase、生产构建、部署、提交或推送。

## 2026-06-10 22:30 CST

- 完成：在 `docs/product/prototypes/README.md` 增加“待实现吸收提示 / To Implement Checklist”，把原型吸收到真实页面前必须核对的目标、必须对齐项、禁止照搬项、实现和验证范围固定下来。
- 完成：`AGENTS.md` 同步要求从 `待实现 / To Implement` 原型进入真实页面前必须按 checklist 核对，避免后续只凭“像原型”直接复制静态数据或绕过仓库边界。
- 验证：`rg` 检查 checklist 和 AGENTS 引用；`git diff --check` 通过。本轮只改规则和 Markdown，未重跑前端构建、单测或浏览器回归。
- 下一步：后续待实现原型落地时直接按 checklist 明确“必须对齐”和“明确不吸收”的清单，再进入运行时代码改动。
- 阻塞/风险：本轮未改运行时代码、测试脚本、正式菜单、后端 API、schema、migration、RBAC、WorkflowUsecase、Fact usecase、生产构建、部署、提交或推送。

## 2026-06-10 22:37 CST

- 完成：补充原型三阶段可调整规则。`docs/product/prototypes/README.md` 和 `AGENTS.md` 现在明确 Draft、To Implement、Current 都不是锁定状态，都可以继续调整；区别只是越靠后越需要回到仓库真源、测试、浏览器回归和正式文档同步。
- 验证：`git diff --check` 通过。本轮只改 Markdown 规则，未重跑前端构建、单测或浏览器回归。
- 下一步：后续原型沟通时可以直接按“可调整但约束递增”理解，不把待实现或当前实现误读成永久冻结。
- 阻塞/风险：本轮未改运行时代码、测试脚本、正式菜单、后端 API、schema、migration、RBAC、WorkflowUsecase、Fact usecase、生产构建、部署、提交或推送。

## 2026-06-10 22:40 CST

- 完成：补齐 `起草阶段 / Draft` 收敛到 `待实现 / To Implement` 的 checklist。`docs/product/prototypes/README.md` 现在要求先核对输入来源、选中 / 放弃方向、必须收敛项、禁止升级项和 HTML 原型输出要求，再把 PNG / 方向图升级为待实现 HTML。
- 完成：`AGENTS.md` 同步要求 Draft 收敛到 To Implement 前按“起草收敛提示 / Draft To Implement Checklist”核对，避免把 PNG 里的假数据、偶然按钮或未讨论能力直接升级成实现承诺。
- 验证：`rg` 检查 Draft checklist 和 AGENTS 引用；`git diff --check` 通过。本轮只改 Markdown 规则，未重跑前端构建、单测或浏览器回归。
- 下一步：后续从视觉草案进入待实现原型时，先按 checklist 明确选中方向、放弃方向、吸收范围和不吸收范围。
- 阻塞/风险：本轮未改运行时代码、测试脚本、正式菜单、后端 API、schema、migration、RBAC、WorkflowUsecase、Fact usecase、生产构建、部署、提交或推送。

## 2026-06-10 21:03 CST

- 完成：将 `/erp/dashboard` 从旧工作台命令中心布局收回为原型式任务看板首屏，移除当前页面主路径里的 hero、统计卡、任务池概览、右侧首屏处理队列、业务风险卡和打印入口卡；业务看板与打印中心仍通过页面按钮进入，不新增菜单、后端 API、schema、migration、RBAC 或 Fact 写入。
- 完成：任务看板泳道口径改为本页待办、阻塞异常、今日到期和已完成协同；`web/README.md` 与 `docs/current-source-of-truth.md` 同步说明 `/erp/dashboard` 是 Workflow 任务看板入口，筛选和泳道分组只影响页面展示，不写后端用户偏好、WorkflowUsecase 或事实表。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`node --check web/scripts/styleL1.mjs`、`STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop,erp-dashboard-dark-wide-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=print-workspace-processing-row-selection-reset pnpm --dir web style:l1` 和 `git diff --check` 均通过；任务看板 L1 截图覆盖桌面、移动、暗色和 2048px 宽屏。完整 `pnpm --dir web style:l1` 在脚本自启服务时两次遇到 `ERR_CONNECTION_REFUSED`，改用外部固定 dev server 后卡在既有 `dev-testing-dark-desktop` 剪贴板读取权限；该 dev-only 剪贴板场景单独复跑仍失败，和本轮任务看板改动无关。
- 下一步：跑完前端验证后如有样式或测试问题，继续在当前任务看板主路径内修正；仍不新增正式原型菜单或第二套 Workflow 入口。
- 阻塞/风险：本轮只改前端运行时展示、前端 helper 测试、L1 回归脚本和正式文档口径；未做真实后端联调，Workflow task done 仍不代表库存、出货、财务、应收、开票或收付款事实完成。

## 2026-06-10 17:34 CST

- 完成：将 `docs/product/prototypes` 中工作台、业务模块标准页和协同入口原型吸收到真实前端运行时：`/erp/dashboard` 新增任务池概览；`BusinessModulePage` 将筛选区和表格工具栏拆清；业务页协同入口升级为“当前记录协同 + 本页待办”，支持阻塞原因、催办和完成 Workflow 任务。
- 完成：协同动作全部复用现有 `workflowApi.mjs` 的 `updateWorkflowTaskStatus` / `urgeWorkflowTask`，未复制 HTML 原型，未新增正式原型菜单、后端 API、schema、migration、Ent 字段、数据库表或 Fact 写入；完成任务仍只代表 Workflow 协同完成，不代表库存、出货、财务、应收、开票或收付款事实完成。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过，`pnpm test` 当前通过 331 项；`STYLE_L1_SCENARIOS=root-redirect-desktop,erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop,business-module-workflow-actions,business-module-dark-products-modal-desktop pnpm --dir web style:l1` 通过，覆盖根路由、工作台桌面 / 移动 / 暗色、业务页 Workflow 动作和业务页暗色弹窗。完整 `pnpm --dir web style:l1` 多次出现随机既有页面等待超时，失败场景包括 `dev-testing-dark-desktop`、`erp-dashboard-mobile`、`root-redirect-desktop`，对应单场景均可复跑通过。
- 验证：Browser 插件在 `http://127.0.0.1:5176/erp/dashboard` 验证应用壳层无 Vite overlay、console warn/error 为空；390x844 移动视口验证未登录跳转到 `/admin-login`、无 overlay、console warn/error 为空、`scrollWidth == clientWidth`。当前 Browser 会话无已登录 mock，因此已登录工作台 / 业务页交互以 L1 Playwright mock 场景为准。
- 下一步：如果后续继续吸收原型，应继续在现有正式页面和共享组件内推进，不新增原型菜单或第二套 workflow 入口；可再补专门的协同面板组件单测，锁住当前记录任务与本页任务分组口径。
- 阻塞/风险：本轮未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、正式菜单、生产构建或目标环境镜像。后续若业务页协同入口继续扩展，需要保持 Workflow task done 不等于库存、出货、财务、应收、开票或收付款事实完成。

## 2026-06-10 18:06 CST

- 完成：修复完整 `style:l1` 套件随机等待超时的回归脚本稳定性问题；每个 L1 场景在新上下文中运行，遇到页面初始加载、文案等待或本地导航这类临时失败时最多重试一次，真实布局断言、横向溢出和控制台 / 运行时错误仍按原规则失败。
- 完成：补充场景进入后的 document ready / body text 等待，减少 Vite 初次转换或页面初始渲染造成的空壳等待；重试原因会写入 L1 日志，方便后续区分本地预览抖动和真实页面回归。
- 验证：`node --check web/scripts/styleL1.mjs`、`STYLE_L1_SCENARIOS=root-redirect-desktop,erp-dashboard-mobile,dev-testing-dark-desktop,business-module-workflow-actions pnpm --dir web style:l1`、完整 `pnpm --dir web style:l1`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 和 `git diff --check` 均通过；完整 L1 当前通过 45 个场景，`pnpm test` 当前通过 331 项。
- 下一步：本轮原型吸收与完整 L1 稳定性闭环已完成；后续可按同一边界继续补协同面板组件单测或推进更多业务页局部协同入口，不新增菜单 / API / schema / Fact 写入。
- 阻塞/风险：本轮只改前端运行时、L1 回归脚本、样式和进度记录；未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、正式菜单、生产构建或目标环境镜像。Browser 插件已覆盖未登录工作台壳层和移动未登录跳转；已登录工作台 / 业务页交互仍以项目 Playwright L1 mock 场景为准。

## 2026-06-10 18:22 CST

- 完成：补业务页协同入口专门测试。新增 `businessCollaborationTasks` 纯 helper，将“当前记录协同 / 本页待办”拆分、任务总数 / 待办 / 阻塞统计、阻塞原因、催办态和终态判断从 JSX 收口到可测试逻辑；`CollaborationTaskPanel` 改为只渲染 helper 结果并继续调用现有 Workflow 动作。
- 完成：新增 `web/src/erp/utils/businessCollaborationTasks.test.mjs` 并接入 `web/package.json` 的 `pnpm test`，覆盖当前记录任务从本页待办排除、阻塞原因优先级、催办 payload 展示、done 只代表协同终态、列表最多展示 6 条。
- 验证：`node --test web/src/erp/utils/businessCollaborationTasks.test.mjs`、目标文件 ESLint、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、完整 `pnpm --dir web style:l1` 和 `git diff --check` 均通过；完整 L1 当前通过 45 个场景，`pnpm test` 当前通过 336 项。
- 下一步：若继续推进，可以把业务页协同入口的“创建协同任务 / 指派角色”作为局部 Workflow 能力评审；仍不新增正式菜单、后端 API、schema、migration 或 Fact 写入。
- 阻塞/风险：本轮只补前端 helper、测试和协同面板消费方式；未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、正式菜单、生产构建或目标环境镜像。已登录交互仍由 L1 mock 浏览器场景覆盖，未做真实后端联调。

## 2026-06-10 19:33 CST

- 完成：按原型方向继续强化真实后台运行时，而不是复制 HTML 原型。`/erp/dashboard` 升级为工作台命令中心布局，补右侧首屏处理队列、业务风险卡和打印 / 运营入口；主区域继续承载任务池统计、筛选、泳道、分页表格、详情抽屉、阻塞原因、催办和完成 Workflow 动作。
- 完成：`BusinessModulePage` 的本页协同入口从普通列表升级为底部局部协同 dock，支持展开 / 收起、`本页待办` / `当前记录` / `阻塞异常` / `已完成` 分组；仍只调用现有 Workflow API，不写库存、出货、财务、应收、开票或收付款事实。
- 完成：补移动端业务筛选下拉稳定性。移动端打开 Select 前会先把当前筛选控件滚到可容纳弹层的位置，状态筛选关闭内部搜索以避免焦点样式干扰；不使用 `!important`，浅色、暗色和移动端样式继续走现有 ERP theme token / CSS 变量。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、完整 `pnpm --dir web style:l1` 和 `git diff --check` 均通过；完整 L1 当前通过 45 个场景，`pnpm test` 当前通过 336 项。
- 验证：Playwright / Chromium 已验证并生成截图：`erp-dashboard-desktop`、`erp-dashboard-mobile`、`erp-dashboard-dark-desktop`、`business-module-workflow-actions`、`business-module-toolbar-mobile-dropdown`、`business-processing-contracts-desktop`、`business-reconciliation-desktop`、`admin-login-mobile-source-desktop-choice`。覆盖默认态、交互态、恢复态、相邻区域、浅色、暗色和移动端关键路径。
- 下一步：如继续贴近原型，可在现有业务页内补更多局部协同入口的记录级指派 / 创建任务评审；仍不新增正式原型菜单、后端 API、schema、migration、Ent 字段、数据库表或 Fact 写入。
- 阻塞/风险：本轮未改 `/erp/business-dashboard` 的事实口径，仍只作为运营摘要和业务风险看板；未改 `/erp/print-center` 入口语义；未做真实后端联调、生产构建、部署、提交或推送。Browser 插件本轮未暴露独立导航工具，已登录运行态验证以项目 Playwright / Chromium L1 mock 场景为准。

## 2026-06-10 20:02 CST

- 完成：继续推进业务模块标准页模板化。`SelectionActionBar` 从简单“已选记录”条升级为“当前操作”上下文区，展示选中记录编号 / 标题、业务状态、主责、客户或供应商、数量 / 金额 / 日期摘要，以及当前记录 Workflow 协同总数、待处理和阻塞数。
- 完成：业务页 L1 回归新增当前操作区断言，锁住“当前操作、业务状态、主责、当前记录协同、Workflow 边界提示”这些原型关键元素；该展示仍只读取现有业务记录和 Workflow 任务，不写事实层。
- 完成：同步当前 dev-only 双语文案现场带来的测试与样式影响。`devHub` 分组断言改为中英双语值；`dev-testing` L1 tab 点击改为匹配 `命令入口 / Commands`；`dev-customer-config` 移动端补长文本和 segmented 收缩，避免横向溢出。以上仍保持 dev-only 路径，不进入正式菜单。
- 完成：增强 `style:l1` dev server 清理逻辑，失败或单场景结束时同时清理进程组、直接子进程、管道和 4173 监听者，避免旧 Vite 残留导致后续全量 L1 端口冲突。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`git diff --check` 均通过；`pnpm test` 当前通过 336 项。完整 `style:l1` 使用外部固定 Vite 服务执行：`STYLE_L1_BASE_URL=http://127.0.0.1:4173 pnpm --dir web style:l1`，45 个场景通过；执行后已关闭本轮 4173 Vite 服务。
- 下一步：如果继续贴近原型，可以在不新增菜单和后端 API 的前提下，把业务页当前操作区里的“创建协同任务”再细化为本页局部抽屉或小表单；仍只走 Workflow，不能写库存、出货、财务、应收、开票或收付款事实。
- 阻塞/风险：本轮仍未改后端、schema、migration、Ent、数据库表、RBAC、seedData、正式菜单、生产构建或部署；已登录运行态仍以 Playwright / Chromium L1 mock 场景为主，未做真实后端联调。

## 2026-06-10 19:57 CST

- 完成：为 `/__dev` 总控及其跳转页补必要双语阅读锚点。主入口台账、治理分组、状态、边界标签和说明补中文主体 + English anchor；`/__dev/docs`、`/__dev/testing`、`/__dev/prototypes`、`/__dev/capability-ledger`、`/__dev/customer-config` 的页面标题、视图切换、核心筛选、关键面板标题和主要空态补英文锚点。
- 完成：同步 `devHub` 配置测试、原型状态配置、测试入口预设文案，以及 `style:l1` 中 dev-only 页面相关断言；未新增生产菜单、seedData、RBAC、后端 API、schema、migration、产品内 docs registry 或真实导入路径。
- 验证：dev-only 配置相关 `node --test` 45 项通过；`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`node --check web/scripts/styleL1.mjs`、`STYLE_L1_SCENARIOS=dev-testing-dark-desktop,dev-customer-config-dark-desktop,dev-customer-config-mobile,dev-hub-dark-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-module-dark-customers-desktop pnpm --dir web style:l1` 和 `git diff --check` 通过。
- 验证：Browser 已打开 `http://127.0.0.1:5175/__dev/` 和五个跳转页，确认双语标题 / 核心控件可见、console warn/error 为空、桌面视口无横向溢出；总控页搜索 `Customer` 能筛出 `客户配置 / Customer Config`，证明英文关键词可用。
- 下一步：若后续继续强化 `/__dev/*`，仍优先在 dev-only 配置台账和现有页面内维护，不恢复产品内文档中心、菜单权限或后端业务写入。
- 阻塞/风险：完整 `pnpm --dir web style:l1` 多次在非本轮 dev-only 影响面的 Playwright 浏览器上下文关闭处异常结束，定向相关 L1 场景已通过；Browser 截图接口本轮对 127.0.0.1 页面截图超时，最终采用 DOM、console 和宽度断言作为视觉验证证据。

## 2026-06-10 20:12 CST

- 完成：修复 `/erp/dashboard` 任务看板宽屏暗色下表格和右侧处理队列重叠的问题。工作台右栏从比例列收口为明确 300-360px 宽度，主列和任务表格卡片新增横向溢出收口，表格自身负责横向滚动；内容宽度不足时右侧队列自动降到主区域下方。
- 完成：`style:l1` 新增任务看板布局盒模型断言，检查主列右边界、右栏命中区域、表格横向滚动容器和页面级横向滚动；新增 `erp-dashboard-dark-wide-desktop` 2048x1024 暗色宽屏场景，并创建一条 mock Workflow 任务后滚到表格区验证操作列不再压到右栏。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_BASE_URL=http://127.0.0.1:4173 pnpm --dir web style:l1` 和 `git diff --check` 均通过；完整 L1 当前通过 46 个场景，`pnpm test` 当前通过 336 项。定向验证覆盖 `erp-dashboard-desktop`、`erp-dashboard-dark-desktop`、`erp-dashboard-dark-wide-desktop`、`erp-dashboard-mobile`。
- 下一步：如继续按原型强化后台视觉，应继续先用真实浏览器盒模型定位，再在 L1 增加具体断言；仍不新增正式原型菜单、后端 API、schema、migration、Ent 字段、数据库表或 Fact 写入。
- 阻塞/风险：本轮只改前端样式和 L1 回归脚本；未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、正式菜单、生产构建、部署、提交或推送。宽屏验证使用 Playwright mock Workflow 数据，未做真实后端联调。

## 2026-06-10 20:29 CST

- 完成：修复 `/__dev/testing` 和 `/__dev/customer-config` 只缺少页面内主题切换入口的问题；两个 dev-only 页面复用全局 `ERPThemeToggle`，可在页面内切换「跟系统 / 浅色 / 暗色」，不新增主题状态、不接后端、不进正式菜单。
- 完成：补两个 dev-only 页面主题控件移动端布局；同步修复 `/__dev/testing` 暗色下快捷预设按钮本体仍继承浅色文字导致的低对比问题。
- 完成：`style:l1` 的 `dev-customer-config-dark-desktop` 和 `dev-testing-dark-desktop` 场景新增主题三态切换回归，覆盖暗色、浅色和跟系统恢复，并继续检查 favicon、无横向溢出和关键交互。
- 验证：Browser 已在 `http://127.0.0.1:5175/__dev/testing` 与 `http://127.0.0.1:5175/__dev/customer-config?customer=yoyoosun` 验证页面加载、主题控件可见，并手动切换暗色、浅色、跟系统；`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop,dev-testing-dark-desktop pnpm --dir web style:l1` 通过，`pnpm test` 当前通过 336 项。
- 下一步：如继续强化 `/__dev/*`，仍保持 dev-only 边界；可按需把 `dev-hub`、`dev-docs`、`dev-prototypes` 等页面的主题三态也统一纳入同类 L1 helper。
- 阻塞/风险：完整 `pnpm --dir web style:l1` 本轮失败在非本轮目标的 `business-module-dark-products-modal-desktop`，等待 `.erp-business-collaboration-task-panel` 内“展开”按钮超时；该路径已有未提交现场改动，本轮未回退也未继续修业务页协同 dock。Browser 在 `127.0.0.1` 下保留 Vite HMR host 混用警告，但页面加载与主题切换验证通过。

## 2026-06-10 20:41 CST

- 完成：按用户澄清撤回 `/__dev/testing` 和 `/__dev/customer-config` 页面内新增的主题切换按钮；两个 dev-only 页面不再提供本页操作控件，只继续读取全局 `plush_erp_theme_mode`，和后台当前主题保持一致。
- 完成：保留 `/__dev/testing` 暗色快捷预设按钮低对比修复；这是跟随全局暗色时的真实可读性问题，不引入新的主题入口。
- 完成：`style:l1` 回归改为 `dev-*-dark-desktop` 与 `dev-*-light-desktop` 四个场景，分别通过场景注入的全局主题状态验证页面无本地 `.erp-theme-toggle`、能跟随浅色 / 暗色、无横向溢出且关键文字可读。
- 验证：Browser 已在 `http://127.0.0.1:5175/__dev/testing` 和 `http://127.0.0.1:5175/__dev/customer-config?customer=yoyoosun` 确认页面内没有「跟系统 / 浅色 / 暗色」按钮、当前跟随全局浅色、console warn/error 为空；`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop,dev-customer-config-light-desktop,dev-testing-dark-desktop,dev-testing-light-desktop pnpm --dir web style:l1` 均通过，`pnpm test` 当前通过 336 项。
- 下一步：如后续继续统一 `/__dev/*` 主题口径，优先采用“只读取全局主题、不在 dev 页重复放按钮”的规则。
- 阻塞/风险：未重跑完整 `pnpm --dir web style:l1`；上一轮完整 L1 失败仍在非本轮目标的 `business-module-dark-products-modal-desktop`，本轮按边界未继续修改业务页协同 dock。

## 2026-06-10 20:49 CST

- 完成：继续修复 dev-only 页面“没有实时跟随后台主题”的根因。全局 `ERPThemeProvider` 现在会监听同 origin 的 `storage`、窗口 `focus` 和 `visibilitychange`，页面重新获得焦点或同源标签页修改 `plush_erp_theme_mode` 后会重新读取全局主题状态。
- 完成：保持 `/__dev/testing`、`/__dev/customer-config` 和 `/__dev/prototypes` 一样不放本页主题按钮；本轮只修全局同步主路径，不新增 dev 页局部状态或第二套主题控制。
- 验证：Browser 对比 `localhost:5175` 和 `127.0.0.1:5175`，确认二者是不同 origin：`localhost` 当前 `mode=system/effectiveTheme=dark`，`127.0.0.1` 当前 `mode=light/effectiveTheme=light`。同 host 下 dev pages 读取同一全局主题；跨 host 不共享浏览器 localStorage。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,dev-customer-config-dark-desktop,dev-customer-config-light-desktop,dev-testing-dark-desktop,dev-testing-light-desktop pnpm --dir web style:l1` 均通过，`pnpm test` 当前通过 336 项。
- 下一步：使用时尽量保持后台和 dev-only 页面同一个 host，例如都用 `http://localhost:5175` 或都用 `http://127.0.0.1:5175`；不同 host 的主题状态浏览器天然隔离。
- 阻塞/风险：Browser 插件本轮在已登录 dashboard 的主题菜单点击上出现 CDP 超时；命令级 L1 已覆盖同源 focus 同步路径。未重跑完整 `pnpm --dir web style:l1`，上一轮完整 L1 非本轮业务页协同 dock 失败仍未处理。

## 2026-06-10 20:33 CST

- 完成：将业务页底部“本页协同入口”共享面板默认状态改为收起，只保留任务总数、待办、阻塞统计和“展开”按钮；展开后仍显示本页待办、当前记录、阻塞异常和已完成四个 Workflow 分组。
- 完成：同步调整 `style:l1` 业务页回归，新增默认收起、点击展开、再收起恢复和横向溢出断言；创建协同任务后的回归流程改为先展开面板再切到“当前记录”tab。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过；`STYLE_L1_PORT=4174 STYLE_L1_SCENARIOS=business-module-dark-products-modal-desktop,business-module-workflow-actions,business-processing-contracts-desktop,business-reconciliation-desktop pnpm --dir web style:l1` 通过，共 4 个场景。首次尝试使用默认 4173 端口失败，原因为该端口已被既有进程占用，本轮未清理未知进程，改用 4174 验证。
- 下一步：如继续推进协同入口，可补组件层渲染测试或细化记录级创建 / 指派交互；仍只走 Workflow 协同，不写库存、出货、财务、应收、开票或收付款事实。
- 阻塞/风险：本轮未改后端、schema、migration、RBAC、seedData、正式菜单、生产构建、部署、提交或推送；完整全量 `style:l1` 未重跑，已按本轮影响范围跑业务页相关场景。

## 2026-06-10 20:48 CST

- 完成：业务页底部“本页协同入口”展开态新增桌面端高度拖拽手柄；默认高度走 CSS `clamp(480px, calc(100vh - 280px), 720px)`，不写 localStorage、不写后端偏好，刷新后回到默认高度。
- 完成：展开态在桌面断点内把协同面板收口为可调固定高度，任务列表在面板内滚动；移动端不启用拖拽手柄，保留原有自然布局，避免和上下滑动冲突。
- 完成：`style:l1` 业务页回归新增桌面拖拽断言，覆盖展开态手柄可见、向上拖高、向下拖低、最小高度、列表滚动边界、横向溢出和收起恢复；仍只处理 Workflow 协同展示，不写库存、出货、财务、开票或收付款事实。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`git diff --check` 通过，`pnpm test` 当前 336 项通过；`STYLE_L1_PORT=4175 STYLE_L1_SCENARIOS=business-module-dark-products-modal-desktop,business-module-workflow-actions,business-processing-contracts-desktop,business-reconciliation-desktop pnpm --dir web style:l1` 通过，共 4 个业务页场景。
- 验证：Browser 打开 `http://127.0.0.1:5175/erp/master/products`，确认已登录产品页真实渲染、展开后桌面手柄可见、默认面板高度 480px、页面无横向溢出、console warn/error 为空；Browser 截图和 CUA 拖拽未能可靠驱动该 pointer 交互，拖拽行为以项目 Playwright L1 鼠标事件断言为准。
- 下一步：如后续继续强化协同入口，可再补记录级指派 / 创建任务交互；仍不新增正式菜单、后端 API、schema、migration 或 Fact 写入。
- 阻塞/风险：本轮只改前端组件、样式、L1 回归和进度记录；未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、正式菜单、生产构建、部署、提交或推送。完整全量 `pnpm --dir web style:l1` 未重跑，已按本轮影响范围跑业务页相关场景。

## 2026-06-10 20:57 CST

- 完成：将业务页协同入口的桌面端高度拖拽手柄补回原型资料。`business-module-page-standard-v1/index.html` 增加展开态手柄和说明；`task-collab-entry-v2.html` 增加可交互拖拽演示；原型目录 README 和静态索引同步补充“桌面端高度拖拽手柄”口径。
- 下一步：若继续调整协同入口视觉，可直接打开 `docs/product/prototypes/business-module-page-standard-v1/task-collab-entry-v2.html` 对照手柄交互，再回到真实共享组件实现。
- 阻塞/风险：本轮只改 `docs/product/prototypes` 原型资产和 `progress.md`，未改运行时代码、后端、schema、migration、RBAC、seedData、正式菜单、生产构建、部署、提交或推送；HTML 原型仍是参考资产，真实行为以 `web/src`、自动化测试和浏览器回归为准。

## 2026-06-10 21:12 CST

- 完成：修复 dev-only 页面“看起来不跟随后台主题”的本地 host 混用根因。开发态入口现在会把 `http://127.0.0.1:5175/...` 归一到 `http://localhost:5175/...`，让后台、`/__dev/testing`、`/__dev/customer-config` 和 `__dev/prototypes` 共用同一份浏览器主题 localStorage。
- 完成：保留全局 `ERPThemeProvider` 的同源 `storage` / `focus` / `visibilitychange` 同步，不给 dev-only 页面新增本页主题按钮；`style:l1` 本地预览服务同步改用 `localhost`，避免测试权限和页面 canonical host 不一致。
- 验证：Browser 已验证后台在 `localhost:5175/erp/dashboard` 切到浅色后，打开 `http://127.0.0.1:5175/__dev/testing` 会跳到 `http://localhost:5175/__dev/testing` 且 `mode=light/effective=light`；打开 `http://127.0.0.1:5175/__dev/customer-config?customer=yoyoosun` 会跳到 `http://localhost:5175/__dev/customer-config?customer=yoyoosun` 且 `mode=light/effective=light`。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`node --test src/common/theme/erpThemeMode.test.mjs src/common/theme/localDevThemeOrigin.test.mjs`、`STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,dev-customer-config-dark-desktop,dev-customer-config-light-desktop,dev-testing-dark-desktop,dev-testing-light-desktop pnpm --dir web style:l1` 通过。
- 下一步：本地使用时统一从 `localhost:5175` 看页面；若手动输入 `127.0.0.1:5175`，开发态会自动归一。后续新增 dev-only 页面时继续复用全局主题，不再单页加按钮。
- 阻塞/风险：全量 `pnpm --dir web test` 本轮仍失败在既有 `workflowTaskBoard: 生成工作台泳道并保留协同完成边界`，实际 key 为 `pending/due`、预期仍是 `today/finance`，属于当前工作区业务看板现场，不是本轮主题 host 归一改动；本轮未修改该业务测试。

## 2026-06-10 21:17 CST

- 完成：修复岗位任务端“我的”页四个指标按钮边界过弱的问题；`mobile-role-mine-metric-button` 不再继承只读统计的透明 / 无边框覆盖，浅色下恢复 1px 边框、白底和更明确阴影，暗色下同步使用暗色 surface、强边框和阴影。
- 完成：`style:l1` 的 `mobile-tasks-dark` 场景新增四个“我的”指标入口盒模型断言，覆盖按钮语义、点击区域、可见边框、非透明背景、阴影和横向溢出。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm --dir web style:l1` 通过；`pnpm test` 当前 339 项通过。
- 验证：Browser 在 `http://localhost:5175/m/sales/tasks`、390x844 浅色视口进入“我的”页，四个按钮 computed style 均为 `1px solid rgb(203, 213, 225)`、`rgba(255,255,255,0.98)` 背景和双层阴影，页面 `scrollWidth=390/clientWidth=390` 无横向溢出；点击“风险”后回到“待办”并选中 `风险(49)`。
- 下一步：如继续调整岗位任务端视觉，可优先沿用 `mobile-tasks-dark` 的盒模型断言，并按影响范围补浅色 Browser 或新增浅色 L1 场景。
- 阻塞/风险：本轮只改岗位任务端前端样式和 L1 回归脚本；未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、正式菜单、生产构建、部署、提交或推送。完整全量 `pnpm --dir web style:l1` 未重跑，已按本轮影响范围跑移动任务端相关场景。
