# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-15-before-final-bom-closeout.md`：当前工作区已有归档快照，保留 BOM 收口和文档治理前的旧流水。
- `docs/archive/progress-2026-06-16-before-audit-log-readable.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录。
- `docs/archive/progress-2026-06-16-before-backup-restore-rehearsal.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录。
- `docs/archive/progress-2026-06-17-before-related-actions.md`：本轮写入关联按钮前，因 `progress.md` 超过 80KB 归档的完整过程流水快照。

## 当前活跃事项

- 当前工作区仍有大量非本轮并行改动，包含 schema / API / UI / 文档 / 原型 / 客户配置等混合现场；每轮收口必须按本轮允许路径精确说明和验证，不得回退或整理非本轮现场。
- 已接正式 V1 的销售订单、采购订单、采购入库、来料质检、库存台账、出货 / 预留和财务事实页面应保持 Workflow / Fact 边界：关联入口只提供上下文跳转或已有打印 / 生成动作，不代表下游事实自动过账。
- 移动岗位任务端 `/m/<role>/tasks` 仍是岗位协同入口；后续拆分应继续保持 Workflow 任务完成不写库存、出货、财务或付款事实。

## 2026-06-18 Formal shell 预览页语义治理

- 完成：按 `plush-page-design-governance` 复核 formal-shell 待接入页面，保持 `production-scheduling`、`production-exceptions`、`shipping-release` 只作为预览 / 接入边界页，不冒充真实业务写入、导出、删除、回收站或下游事实动作。
- 完成：从 `FormalBusinessModulePage` 清掉已接正式 V1 的 `processing-contracts` 残留打印分支和 print workspace 依赖；委外 / 加工合同打印继续由正式 `委外订单` 页面承接，不留在待接入预览页。
- 完成：补 `businessModuleNavigation` 单测，锁住 formal-shell 只剩当前 3 个待接入模块，并禁止 `加工合同打印`、`openPrintWorkspaceWindow`、`PROCESSING_CONTRACT_TEMPLATE_KEY` 等旧分支回流。
- 验证：`cd web && pnpm exec eslint --ext .jsx --ext .mjs src/erp/pages/FormalBusinessModulePage.jsx src/erp/utils/businessModuleNavigation.test.mjs` 通过；`cd web && node --test src/erp/utils/businessModuleNavigation.test.mjs` 通过，4 项；`cd web && node --check scripts/styleL1.mjs` 通过；`STYLE_L1_PORT=4189 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过，1 个场景。默认端口 `4173` 首次被占用，换端口后通过。
- 下一步：后续若要把这 3 个 formal-shell 模块推进正式 V1，需要分别接领域 usecase、API、RBAC、真实数据、菜单文案和 L1 回归；不能只改页面文案。
- 阻塞/风险：当前工作区仍有大量非本轮并行改动，`web/scripts/styleL1.mjs` 已有其他大段现场变更；本轮只确认脚本当前可解析并验证目标场景，未把该脚本的大段 diff 作为本轮功能成果，也未声明全量 `style:l1` 已通过。

## 2026-06-18 Dashboard 工作台任务入口治理

- 完成：按 `plush-page-design-governance` 复核 Dashboard 当前运行态和 `admin-command-center-v1` 原型；保持 Dashboard 作为“登录后的今日处理台 / 当前任务上下文”，不新增通用快捷入口，也不将 To Implement 原型晋级为 Current。
- 完成：将任务详情“关联记录”入口从旧首页快捷模块白名单，收口为当前 `businessModuleDefinitions` 中 `pageKind === 'formal-v1'` 的正式业务页；`shipping-release`、`production-scheduling`、`production-exceptions` 等 `formal-shell` 仍不生成真实关联记录入口，避免 UI 暗示未完成能力。
- 完成：补 `shipments` 任务来源中文回显和单测覆盖，锁住采购入库、来料质检、委外、出货单、应收等正式页可跳转，同时拒绝旧 payload 伪造入口。
- 完成：修复 `web/scripts/styleL1.mjs` 当前并行现场中阻断 L1 的语法断点，让 Dashboard L1 能恢复运行；不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置或原型状态。
- 验证：`node --test web/src/erp/utils/workflowDashboardStats.test.mjs` 通过，11 项；`STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop pnpm style:l1` 通过，3 个场景；`node --check web/scripts/styleL1.mjs` 通过；`progress.md` 修改前为 367 行、71034 字节，未达到归档阈值。
- 下一步：如果后续要让 Dashboard 首页快捷模块也覆盖更多正式业务对象，需要单独做信息密度和菜单入口评审；本轮只治理当前任务上下文的关联记录入口。
- 阻塞/风险：当前工作区仍有大量非本轮并行改动，`web/scripts/styleL1.mjs` 本身已有大段并行新增场景；本轮只修复解析断点并验证 Dashboard 目标场景，未声明全量 `style:l1` 已通过。

## 2026-06-18 大文件拆分的页面设计补强

- 完成：按 `plush-page-design-governance` 复核上一条大文件拆分治理，结论是“可用但不完美”：已有规则覆盖责任拆分和接口稳定，但缺少页面设计侧的主职责、可见模块语义、未完成能力误导、边界状态和可访问性 / 键盘回归要求。
- 完成：补强 `AGENTS.md` 和 `docs/product/模块实施治理.md`，明确触达页面或样式时，拆分前必须确认页面主职责、重复入口、空 / 长文本 / 无权限 / 错误态、焦点和键盘可访问性；不能把纯视觉拆分当成页面治理完成。
- 验证：`progress.md` 修改前为 349 行、67295 字节，未达到归档阈值；本轮继续只改现有 Markdown 正文，不新增文档、不改标题 / 用途 / 路径分类，不需要更新 `docs/文档清单.md`。
- 下一步：真正拆具体页面前，应按目标页面选择对应 runtime / prototype / L1 场景，覆盖默认态、交互态、恢复态、相邻区域、暗色和必要移动端，而不是只做静态文件拆分。
- 阻塞/风险：本轮不改 runtime、schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置、部署、原型状态或任何页面代码；当前工作区仍有大量非本轮并行改动，本轮只补治理文本。

## 2026-06-18 项目运行环境锁定

- 完成：确认截图建议适用 `plush-docs-governance`，但本轮不是 docs-only；已补 `.node-version`、`.nvmrc`，与现有 `.n-node-version` 共同锁定 Node `24.14.0`，并在 `web/package.json` 增加 `packageManager: pnpm@10.13.1` 和 engines。
- 完成：增强 `scripts/doctor.sh`，将 Node 锁文件一致性、当前 Node、pnpm packageManager、`server/go.mod` Go toolchain 检查从提示升级为必需版本校验；`scripts/bootstrap.sh` 安装前会先调用 doctor。
- 完成：同步 `README.md`、`docs/当前真源与交接顺序.md`、`web/README.md`、`server/README.md` 和 `scripts/README.md` 的本地工具版本、初始化顺序和 doctor 成功口径；不改 `AGENTS.md`、schema、migration、业务代码、RBAC、菜单、部署或 CI workflow。
- 验证：`bash -n scripts/doctor.sh && bash -n scripts/bootstrap.sh` 通过；`bash scripts/doctor.sh` 通过；`progress.md` 修改前 263 行、48941 字节，未达到归档阈值。
- 下一步：如需让远端 CI 也强制版本一致，再单独评审是否补 GitHub Actions 或等价 CI；当前个人开发主路径先由 version files + packageManager + doctor / bootstrap 守住。
- 阻塞/风险：仓库仍有大量非本轮并行改动，本轮只触达环境锁定、脚本和说明文档；未执行依赖安装、前端测试、Go 测试或 migration，因为本轮不改业务运行逻辑。

## 2026-06-18 大文件按业务责任拆分治理

- 完成：确认截图建议属于 `plush-docs-governance` 适用场景，但内容是项目级代码组织治理，不是普通文档整理；已在 `AGENTS.md` 工程原则中补充“大文件按业务责任和变更边界拆分”的长期规则。
- 完成：同步 `docs/product/模块实施治理.md` 的实施任务拆分规则，明确前端按页面壳、表格、表单、详情 / 协同入口、状态展示、数据 / action hook 拆；后端按业务域的 handler、usecase、repo、validator、types 拆；拆分必须降低真实耦合并保持 API、状态语义、测试入口和文档真源稳定。
- 验证：`progress.md` 修改前为 263 行、48941 字节，未达到归档阈值；本轮只改现有 Markdown 正文，不新增文档、不改标题 / 用途 / 路径分类，不需要更新 `docs/文档清单.md`。
- 下一步：后续真正拆大文件时，应先按本规则确认业务责任、允许路径、禁止路径和验收命令，再做代码级拆分；不要在文档治理轮顺手重构运行时代码。
- 阻塞/风险：本轮不改 runtime、schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或大文件本身；当前工作区仍有大量非本轮并行改动，本轮只触达 `AGENTS.md`、`docs/product/模块实施治理.md` 和 `progress.md`。

## 2026-06-18 销售订单事务保存核查

- 完成：按 `plush-docs-governance` 判定截图建议属于 behavior-changing 核查，不作为 docs-only；复核当前真源、后端 usecase / repo / JSON-RPC 和前端 V1 页面，确认销售订单表单保存主路径已是 `save_sales_order_with_items`，后端在单事务内创建 / 更新订单头、维护明细并取消缺失开放行，失败会整体回滚。
- 完成：补前端静态回归，锁住 `V1SalesOrdersPage` 保存表单只调用 `saveSalesOrderWithItems`，不回退为 `create/update_sales_order` 加 `add/update/remove_sales_order_item` 的前端串联流程；同步补齐 `MasterDataRepo` 新增 `ListWarehouses` 后测试 stub 缺口，避免后端相关包构建被并行现场卡住。
- 验证：`cd server && go test ./internal/biz ./internal/data ./internal/service -run 'TestSalesOrder|TestJsonrpcDispatcher_SaveSalesOrderWithItemsUsesSingleUsecase|TestJsonrpcDispatcher_SalesOrderAPIRequiresPermissionAndRejectsShipmentVerb|TestJsonrpcDispatcher_SalesOrderItemAPIUsesUsecaseProductUnitGuard' -count=1` 通过；`cd web && node --test src/erp/api/masterDataOrderApi.test.mjs` 通过，6 项；`progress.md` 更新前 263 行、48941 字节，未达到归档阈值。
- 下一步：若后续要把底层单对象销售订单 / 明细接口从公开 API 中下线，需要另做兼容性和调用方评审；本轮只锁住表单保存主路径。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、部署或客户配置；工作区仍有大量非本轮并行改动，未提交、未推送。

## 2026-06-18 工作台原型队列入口同步

- 完成：按 `plush-page-design-governance` 同步工作台 To Implement 原型资产，将 `admin-command-center-v1` 从旧的“3 个任务判断指标 / 当前处理卡”口径更新为“3 个可点击队列筛选入口 / 当前任务上下文”。
- 完成：更新 HTML 样板的队列标签为 `待我处理 / 阻塞/逾期 / 等待交接`，默认选中 `待我处理`，并同步初始右侧上下文为当前队列任务；原型仍保留 `To Implement / Core`，不晋级 `Current`。
- 完成：同步原型总索引、静态原型查看器和 dev-only 原型登记文案；不改 runtime、schema、migration、RBAC、菜单、WorkflowUsecase、Fact usecase、客户配置或部署。
- 验证：`cd web && node --test src/erp/config/devPrototypes.test.mjs` 通过，7 项；`cd web && pnpm exec eslint --ext .mjs src/erp/config/devPrototypes.mjs` 通过；`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm style:l1` 通过；`git diff --check -- docs/product/prototypes/admin-command-center-v1/README.md docs/product/prototypes/admin-command-center-v1/index.html docs/product/prototypes/README.md docs/product/prototypes/index.html web/src/erp/config/devPrototypes.mjs progress.md` 通过。
- 下一步：如需把该原型改为 `Current`，需要用户明确确认，并以当前 runtime、正式文档、测试和浏览器回归为准重新登记。
- 阻塞/风险：本轮没有重画成 runtime 截图，也没有创建新原型；HTML 样板仍是 To Implement 设计参考，静态数字和 mock 任务不是真实数据。

## 2026-06-18 信息差说明收口

- 完成：在 `docs/当前真源与交接顺序.md` 顶部职责边界中补充“信息差”的具体含义：只读本文一句摘要时，可能误以为能力已经覆盖 schema、migration、repo/usecase、API、RBAC、UI、客户可见性和验收证据；处理方式是保持本文为索引，回到对应台账、专题文档、代码和测试核对。
- 完成：在 `docs/product/产品能力进度台账.md` 的“防止信息差规则”中补充状态书写口径，明确该规则只约束能力状态怎么写，不替代当前真源索引、代码、测试、客户交付矩阵或专题设计文档。
- 验证：`git diff --check -- docs/当前真源与交接顺序.md docs/product/产品能力进度台账.md progress.md` 通过；`rg -n "信息差|不替代|完整能力台账" docs/当前真源与交接顺序.md docs/product/产品能力进度台账.md` 命中预期段落；`progress.md` 修改前为 238 行、44334 字节，未达到归档阈值。
- 下一步：后续如继续降低信息密度，应评审是否拆分长摘要和证据详情；本轮不做文档结构拆分。
- 阻塞/风险：本轮没有加重 `AGENTS.md` 规则，只读未改；不改 runtime、schema、migration、API、UI、RBAC、菜单、Workflow / Fact usecase、客户配置、原型状态或部署。

## 2026-06-18 当前真源索引信息差收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 将 `docs/当前真源与交接顺序.md` 顶部补成“当前真源索引和交接入口，不是完整能力台账 / roadmap / 测试报告 / 实现流水”的职责边界。
- 完成：新增“你要判断什么 / 先看哪里 / 本文怎么用”速查表，把运行时、能力成熟度、客户可见性、菜单入口、模块治理和历史参考分别导向代码测试、产品能力台账、客户交付矩阵 / 差异台账、正式入口计划、模块治理和 archive/reference 边界，降低只读本文单句造成的信息差。
- 完成：将“当前业务保存层真源”收窄为“当前业务保存层交接摘录”，明确该节只服务新对话快速建立上下文，不替代能力账本或代码测试。
- 验证：`git diff --check -- docs/当前真源与交接顺序.md progress.md` 通过；`rg -n "当前业务保存层真源" docs/当前真源与交接顺序.md AGENTS.md README.md docs/README.md docs/文档清单.md web/src/erp/config/devDocs.mjs web/src/erp/config/devDocs.test.mjs` 无命中；`progress.md` 修改前为 229 行、42719 字节，未达到归档阈值。
- 下一步：后续如果要继续降密度，应单独评审是否把当前业务保存层长段落拆到能力证据详情或专题文档；本轮不做大拆分。
- 阻塞/风险：本轮只改真源索引阅读路径和过程记录，不改 runtime、schema、migration、API、UI、RBAC、菜单、Workflow / Fact usecase、客户配置、原型状态或部署。

## 2026-06-18 能力层级文档漂移规则收窄

- 完成：将 `AGENTS.md` 中能力层级文档漂移规则从固定更新 `docs/当前真源与交接顺序.md` 收窄为检查“当前真源索引”；当前入口仍是该文件，后续如重命名或替换，以 `AGENTS.md` 阅读顺序登记的等价真源入口为准。
- 完成：规则从“并更新一串文档”调整为“按影响范围检查，发现旧口径时必须更新”，避免每次能力小变化都机械改所有文档。
- 验证：`git diff --check -- AGENTS.md progress.md` 通过；`progress.md` 修改前为 221 行、41699 字节，未达到归档阈值。
- 下一步：后续如正式真源入口重命名，应先更新 `AGENTS.md` 阅读顺序，再让本规则自然指向新的等价入口。
- 阻塞/风险：本轮只改项目级协作规则和过程记录，不改 README、当前真源、产品台账、客户文档、schema、migration、API、UI、RBAC、菜单、Workflow / Fact usecase、客户配置或部署。

## 2026-06-18 能力层级文档漂移规则

- 完成：在 `AGENTS.md` 工程原则中新增能力实现层级变化的文档漂移治理规则，要求从 schema-only 进入 repo / usecase / API / RBAC / UI、内部可用进入可试用或 deferred 项被部分接入时，同步清理 README、当前真源、产品能力台账、客户交付 / 差异文档和导入文档里的旧状态口径。
- 完成：规则明确要求同时写清“已接入层级”和“仍未闭环层级”，避免继续保留 `schema 已有但 API/UI 未接`、`仍需 API/UI 评审` 这类过期判断。
- 验证：`git diff --check -- AGENTS.md progress.md` 通过；`progress.md` 当前 204 行、38453 字节，未达到归档阈值。
- 下一步：后续能力推进时按此规则和既有真源链一起检查相关文档，不把历史未闭环口径当当前状态。
- 阻塞/风险：本轮只改长期协作规则和过程记录，不改 README、当前真源、产品台账、客户文档、schema、migration、API、UI、RBAC、菜单、Workflow / Fact usecase、客户配置或部署。

## 2026-06-18 编号与单号自动草稿号

- 完成：新增共享 `buildSequentialDraftCode`，正式 V1 新建弹窗对客户、供应商、材料、产品、SKU、工序、销售订单、采购订单、采购入库、来料质检、委外加工合同、出货单和内部 Operational Fact / 库存预留预填 `PREFIX-YYYYMMDD-###` 草稿号；外部来源号（客户订单号、供应商单号、来源订单号）继续为空，不自动伪造。
- 完成：表单标签统一标为“编号 / 单号（自动）”，保留可编辑；当前仍是前端草稿号，保存唯一性由后端现有唯一约束兜底。
- 验证：`node --test web/src/erp/utils/masterDataOrderView.test.mjs`、`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`STYLE_L1_PORT=4193 pnpm style:l1` 通过；完整 L1 验证 56 个场景。`pnpm style:l1` 默认端口 4173 首次因端口占用失败，换 4193 后通过。
- 下一步：如需跨会话 / 并发强一致编号器，应单独做后端事务编号器和客户编号规则配置评审；本轮不改 schema、migration、RBAC、菜单、Workflow 或 Fact usecase。
- 阻塞/风险：当前按当前列表数据生成草稿号，两个用户同时新建仍可能碰撞；后端唯一约束会拦截但不会自动重试。

## 2026-06-18 工作台队列入口重设

- 完成：按 `plush-page-design-governance` 将工作台顶部 3 个数字从静态 KPI 收口为可点击队列筛选入口，保留 `待我处理 / 阻塞/逾期 / 等待交接` 三个主队列；队列表头只显示当前队列标签，不再重复放第二套筛选控件。
- 完成：右侧上下文改为“当前任务上下文”，只展示当前队列选中的 Workflow 任务；当前队列为空时不再兜底显示其他队列任务，空态会提示可切换的非空队列或说明当前没有待处理 Workflow 任务。
- 完成：同步浅色、暗色和窄屏样式，补 `style:l1` 断言锁住 3 个队列入口、唯一当前队列、左右两栏不重叠、空态可见和页面级无横向溢出；不改 schema、migration、RBAC、菜单、WorkflowUsecase 或 Fact usecase。
- 验证：`cd web && pnpm css` 通过；`cd web && pnpm test -- workflowTaskBoard workflowDashboardStats` 通过，前端单测 348 项通过；`cd web && pnpm exec eslint --ext .jsx src/erp/pages/DashboardPage.jsx` 通过；`STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop pnpm style:l1` 通过；`git diff --check -- web/src/erp/pages/DashboardPage.jsx web/src/erp/styles/app.css web/scripts/styleL1.mjs progress.md` 通过。
- 下一步：如果后续需要进一步收敛“任务看板”独立页，应先评审工作台队列与任务看板的职责边界，不要在工作台里继续堆第二套筛选中心。
- 阻塞/风险：全量 `cd web && pnpm lint` 被既有 `web/src/erp/pages/V1QualityInspectionsPage.jsx` 未用变量和缺失导入错误卡住，本轮未处理该非工作台现场；本轮未跑后端测试和 migration，因为未触达后端、数据模型或事实写入。

## 2026-06-18 product_skus 文档漂移修正

- 完成：按当前真源修正根 `README.md` 中 `product_skus` 状态，不再写成“只有 schema、API / UI 未闭环”；当前口径改为基础维护和销售订单行选用已接入，出货 / 库存 / 预留 SKU 校验、导入受控创建和 BOM SKU 粒度仍待后续闭环。
- 完成：同步几处活跃 yoyoosun 客户导入 / 交付 / 差异文档的旧句子，把“SKU API / UI 仍需评审”改成“基础维护 API / UI 已有，导入受控创建、下游 SKU 粒度和自动建 SKU 仍需专项评审”。
- 验证：`git diff --check -- README.md docs/customers/yoyoosun/字段编号确认结果模板.md docs/customers/yoyoosun/导入策略.md docs/customers/yoyoosun/导入风险登记.md docs/customers/yoyoosun/客户交付矩阵.md docs/customers/yoyoosun/客户差异台账.md progress.md` 通过。
- 下一步：若后续要继续治理 SKU 文档口径，应优先检查 `docs/product/产品能力进度台账.md`、`docs/product/产品能力证据详情.md` 和客户导入文档，不把 reference-only 历史资料当当前真源。
- 阻塞/风险：本轮只改正式文档口径，不改 schema、migration、API、UI、RBAC、菜单、Workflow / Fact usecase、客户配置或部署；客户真实导入仍不可执行，自动创建 SKU 仍未开放。

## 2026-06-18 业务弹窗引用字段可选化

- 完成：按 `plush-page-design-governance` 全局扫描正式业务弹窗和主要业务表单中的裸 ID 输入口径，新增共享 `referenceSelectOptions`，把材料、产品、SKU、单位、客户、供应商、销售订单、采购入库、批次、出货单等可从现有真源选择的字段统一改成可搜索 `Select`。
- 完成：BOM 草稿 / 明细、产品规格、采购订单入库草稿、采购入库明细、来料质检草稿、出货单和出货明细不再要求业务人员手填 `material_id / product_id / unit_id / warehouse_id / lot_id / customer_id` 等数据库外键；可读展示优先使用编号、名称、规格、颜色、单位名称、单据号或快照，缺少字典时才 honest fallback 为 `类型 #id`。
- 完成：来料质检弹窗移除“检验员 ID”手填项；当前没有管理员 / 员工字典可供选择，继续暴露数字输入只会把内部账号 ID 交给业务人员猜。采购入库明细里的“采购订单行”也不再提供空下拉，因后端订单行查询必须按父采购订单过滤，不能伪装成全量字典。
- 完成：出货单销售订单行改为随已选销售订单加载对应 open 行；销售订单导入仍按源单真实明细带出产品、SKU、单位和数量，不在前端新造事实。BOM 产品筛选从产品 ID 数字框改为产品下拉。
- 完成：同步调整 `style:l1` 旧断言，不再要求看到“产品 ID / 仓库 ID”；正式业务页残留扫描排除 `OperationalFactsPage`、`V1InventoryLedgerPage` 和开发台账，因为这些是事实调试 / 精确过滤或开发态入口，不是业务对象新建编辑弹窗。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && pnpm style:l1` 均通过；前端单测 347 项通过，完整 L1 覆盖 56 个场景。另用 `rg` 扫描正式业务页和组件中裸 `ID` 表单 / 文案残留，排除上述事实调试边界后无命中。
- 下一步：如果要继续治理库存台账和 `OperationalFactsPage` 的事实字段，应单独做事实页读写语义评审：库存台账当前是只读事实精确筛选，`OperationalFactsPage` 是内部事实写入 / 调试入口，不能直接套基础资料弹窗的“能选就选”规则。
- 阻塞/风险：仓库当前没有独立仓库字典 API，本轮只能从库存批次、入库行和出货行等已有事实记录生成 `仓库 #id` 候选，不伪造仓库名称；未改 schema、migration、后端 usecase、RBAC、菜单、客户配置或部署。当前工作区仍有大量非本轮并行改动，本轮未提交、未推送。

## 2026-06-18 材料档案录入与默认单位可读化

- 完成：按 `plush-page-design-governance` 复核 `/erp/master/materials` 字段语义，确认 `default_unit_id` 是材料 / 产品主数据指向 `units` 的外键，不是业务人员阅读字段；材料档案、产品基础信息和产品规格同源页面统一把列名 / 导出名 / 表单字段改为“默认单位”。
- 完成：新增单位显示 helper，列表和 CSV 导出按单位真源显示 `名称（编码）`，缺少外键时显示 `-`，字典缺失时显示 `未知单位 #id`，避免把缺值伪装成有效单位；表单从数字输入改为单位选择器，保存仍提交原 `default_unit_id` 外键。
- 完成：材料新建弹窗不再要求业务人员从空白开始手填所有字段；编号打开弹窗时自动生成 `MAT-YYYYMMDD-###` 草稿号，默认单位按已有材料最常用单位或首个可用单位自动带出，分类和颜色保留可输入但接入已有值候选。
- 完成：分类 / 颜色候选从浏览器原生 `datalist` 换成项目内 Ant Design `AutoComplete`，保留“可选已有值，也可直接输入新值”的主数据语义，避免浅色表单里出现浏览器黑底候选浮层。
- 完成：补 `style:l1` 断言，材料档案页必须显示可读单位且不再出现“默认单位 ID”；材料新建弹窗必须自动带出编号、暴露分类 / 颜色候选输入、打开 Ant Design 候选浮层、验证候选浮层是浅色表面并显示已有分类 / 颜色，产品主数据弹窗同样断言不再暴露“默认单位 ID”。不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置或单位换算能力。
- 验证：`node --test web/src/erp/utils/masterDataOrderView.test.mjs`、`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`node --check web/scripts/styleL1.mjs`、`STYLE_L1_SCENARIOS=material-master-header-desktop pnpm style:l1`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 均通过。
- 下一步：采购入库、BOM、库存台账、出货和 operational fact 等事实页仍有部分 `单位 ID` 显示，本轮不顺手改；后续要按各页面源单带值、快照和事实边界单独评审。
- 阻塞/风险：当前编号是前端草稿号，保存唯一性仍以后端现有约束兜底；如需跨会话强一致全局编号器，需要后端单独评审。当前工作区已有大量非本轮并行改动，本轮未回退、未提交、未推送；`pnpm test` 仅重新生成错误码文件且无实际 diff。本轮未运行后端 Go 测试或 migration 检查，因为未改后端、schema 或数据结构。

## 2026-06-18 采购订单与材料采购命名收口

- 完成：按当前采购订单 V1 真源收口旧“辅材 / 包材采购”口径，明确 `/erp/purchase/accessories` 当前展示和语义是 `采购订单`，旧 route 与 `accessories-purchase` key 仅保留兼容；辅料、包材、面料等先进入 `materials` 主数据分类，BOM 明细和采购订单行都通过 `material_id` 引用材料，不各自维护材料真源。
- 完成：同步菜单映射、正式产品入口计划、业务主链路字段来源规则、模板打印中心配置和 To Implement 原型说明；采购合同文案从“辅材 / 包材采购”改为“采购订单 / 材料采购”，避免误读成单独页面或把 BOM 用量当作已采购。
- 验证：`cd web && pnpm lint`、`cd web && pnpm test`、`cd web && pnpm css`、`git diff --check` 均通过；前端单测 343 项通过。
- 下一步：如果要彻底迁移 URL/key，应单独评审 `/erp/purchase/orders`、旧路由重定向、`accessories-purchase` source_type 兼容、客户菜单配置和相关测试，不在本轮顺手做。
- 阻塞/风险：本轮不改 schema、migration、RBAC、后端内置菜单、Workflow / Fact usecase、客户专属配置或部署；当前工作区仍有大量非本轮并行改动，提交时必须按路径精确区分。

## 2026-06-18 本页协同背景层级收口

- 完成：共享 `本页协同` 面板改为轻微区别于主业务卡片的协同 surface，使用浅色 `#f6fbf7` 和暗色 `#14201b` 的低对比背景，只表达 Workflow 辅助层级，不把面板做成强色块或独立业务事实区。
- 完成：补充 `style:l1` 背景层级断言，在收起态和展开态都检查协同面板背景与主表卡片不同，且 RGB 最大差值保持在轻微范围内，防止后续退回纯白或改成过重装饰。
- 验证：`node --check web/scripts/styleL1.mjs`、`STYLE_L1_SCENARIOS=business-collaboration-purchase-selected-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-collaboration-supplier-desktop,business-collaboration-mobile pnpm --dir web style:l1`、`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`pnpm --dir web style:l1`、`git diff --check` 均通过；前端单测 343 项通过，完整 `style:l1` 覆盖 56 个场景。
- 下一步：如后续继续调整协同视觉重量，应继续在共享 `.erp-business-collaboration-task-panel` token 上收口，并同步浅色 / 暗色和 L1 盒模型断言。
- 阻塞/风险：本轮只改共享协同面板样式和浏览器级回归断言，不改 schema、migration、后端 usecase、RBAC、菜单、Workflow / Fact 语义、客户配置或部署；未创建或晋级原型，现有原型只作为参考。

## 2026-06-18 本页协同多任务截断回归

- 完成：共享 `本页协同` 面板保留每类最多展示前 6 条的轻量入口定位，同时 tab 计数改为真实总数；超过可见上限时在列表底部显示 `仅显示前 6 条，还有 X 条`，不在业务页内扩成完整任务中心。
- 完成：补充长任务名 / 多任务样本的换行保护和 L1 注入数据，覆盖 `本页待办12 / 当前记录2 / 阻塞异常4`、截断提示、只渲染 6 条、无横向溢出和移动 / 普通协同入口回归。
- 验证：`node --test web/src/erp/utils/businessCollaborationTasks.test.mjs`、`STYLE_L1_SCENARIOS=business-collaboration-purchase-selected-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-collaboration-supplier-desktop,business-collaboration-mobile pnpm --dir web style:l1`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web style:l1` 均通过；前端单测 343 项通过，完整 `style:l1` 覆盖 56 个场景。
- 下一步：如后续需要“查看全部任务”，应跳转到任务看板或稳定筛选页，不在本页协同内新增无限展开列表。
- 阻塞/风险：本轮只改共享协同入口展示模型、样式和 L1 断言，不改 schema、migration、后端 usecase、RBAC、菜单、Workflow / Fact 语义、客户专属配置或部署；没有新增假跳转按钮。

## 2026-06-18 本页协同展开态重复计数收口

- 完成：共享 `本页协同` 面板展开后不再在标题行重复展示 `待办 / 当前记录 / 阻塞异常` 摘要计数；收起态仍保留摘要，展开态只通过任务分类 tab 承载计数，降低视觉重复和横向挤压。
- 完成：补充 `style:l1` 断言，锁定收起态保留摘要、展开态不重复标题行计数、Workflow-only 边界短句仍可见、任务分类 tab 和无横向溢出仍正常。
- 验证：`STYLE_L1_SCENARIOS=business-collaboration-purchase-selected-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-collaboration-supplier-desktop,business-collaboration-mobile pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web style:l1` 均通过；前端单测 342 项通过，完整 `style:l1` 覆盖 56 个场景。
- 下一步：如后续要继续压低协同入口视觉重量，优先在共享 `BusinessListLayout` 上评审，不做页面私有分叉。
- 阻塞/风险：本轮只改共享协同入口布局和 L1 断言，不改 schema、migration、后端 usecase、RBAC、菜单、Workflow / Fact 语义、客户专属配置或部署；完整 `style:l1` 第一次曾在 `dev-prototypes-dark-desktop` 出现加载型失败，单跑该场景和第二次完整回归均通过。

## 2026-06-18 任务处理权限与无效入口收口

- 完成：按 `plush-page-design-governance` 复核工作台 / 任务看板的“任务处理”抽屉，确认页面主职责仍是处理 Workflow 协同任务；完成、阻塞和催办不写库存、出货、财务、应收、开票或付款事实。
- 完成：新增前端任务动作权限判断，按后端当前真源区分 `workflow.task.complete`、`workflow.task.update`、审批类 `workflow.task.approve`，并同步检查 owner 角色 / assignee / 终态；工作台表格、任务详情、任务看板泳道和抽屉只展示当前账号真实可执行的动作，权限不足时降级为只读上下文。
- 完成：收窄“关联记录 / 关联对象”入口，只有任务 payload 或 source 映射到已登记正式对象页时才显示；未接正式对象页的任务不再兜底跳业务看板，避免把普通上下文查看伪装成真实关联单据入口。
- 完成：同步 `style:l1` admin mock 的 workflow 动作权限和业务角色，并更新任务看板断言，验证无明确正式对象页时任务标题不再是伪关联按钮。
- 验证：`cd web && pnpm test -- workflowTaskBoard workflowDashboardStats` 通过（实际执行前端全量 node test，347 项通过）；`cd web && pnpm lint && pnpm css` 通过；`cd web && STYLE_L1_SCENARIOS=erp-task-board-desktop pnpm style:l1` 通过，覆盖任务看板默认态、筛选恢复态、完成 / 阻塞抽屉切换、盒模型和横向溢出。
- 下一步：如果后续要让更多 Workflow 任务进入具体业务对象页，需要先给目标正式页面登记明确 path 和查询参数读取；不要恢复业务看板兜底跳转。
- 阻塞/风险：本轮未改 schema、migration、后端 RBAC、菜单、WorkflowUsecase、Fact usecase、客户配置或部署；未跑完整 `pnpm style:l1`，目标回归限定在任务看板场景。当前工作区仍有大量非本轮并行改动，本轮未回退、未纳入成果。

## 2026-06-18 业务弹窗尺寸分级收口

- 完成：按 `plush-page-design-governance` 收口桌面 ERP 业务对象弹窗规则：业务对象新建、编辑和查看默认统一使用 Modal，不再把 Drawer 作为业务表单主路径；Drawer 只保留给岗位协同、导航侧栏或任务处理等不保存完整业务对象的上下文入口。
- 完成：新增共享 `ERP_MODAL_WIDTHS`，将销售订单、采购订单、出货单、采购入库、来料质检、BOM、委外订单和正式入口壳业务表单统一到 `businessForm` 宽弹窗；基础资料表单收口到 `masterDataForm`；来源选择器和列顺序弹窗改用局部动作尺寸。
- 完成：在共享尺寸常量之上新增 `BusinessFormModal` 轻量壳组件，只统一业务表单 Modal class、标题结构、默认宽度、居中和遮罩关闭策略；销售订单、采购订单、出货单、采购入库、来料质检、BOM、委外订单、基础资料和正式入口壳表单已迁入该组件，页面仍保留各自 Form、字段、保存和明细逻辑。
- 完成：根据采购订单截图复核 2K 桌面信息密度后，将业务单据宽弹窗上限从 `1360px` 调整为 `1720px`，避免材料 / 明细字段过早进入横向滚动；基础资料、确认弹窗和局部动作弹窗尺寸不跟随放大。
- 完成：同步项目 AGENTS、原型 README、文档清单、原型中心登记和 `plush-page-design-governance` skill，明确确认 / 删除 / 简单提示、基础资料、业务单据三档弹窗尺寸，以及目录名中历史 `drawer` 字样仅作引用兼容。
- 验证：`pnpm --dir web exec eslint --ext .jsx --ext .mjs ...`、`node --test web/src/erp/utils/modalSizes.test.mjs web/src/erp/config/devPrototypes.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`STYLE_L1_PORT=4193 STYLE_L1_SCENARIOS=mobile-tasks-dark pnpm --dir web style:l1`、`STYLE_L1_PORT=4193 STYLE_L1_SCENARIOS=dev-prototypes-dark-desktop pnpm --dir web style:l1`、`STYLE_L1_PORT=4193 pnpm --dir web style:l1`、`git diff --check` 均通过；追加复核 `ERP_MODAL_WIDTHS.businessForm=1720px` 后，`node --test web/src/erp/utils/modalSizes.test.mjs`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_PORT=4193 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`STYLE_L1_PORT=4193 pnpm --dir web style:l1` 通过；组件化后再次执行 `pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_PORT=4193 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`STYLE_L1_PORT=4193 pnpm --dir web style:l1` 通过，前端单测 343 项、完整 L1 56 个场景通过。
- 下一步：后续新增业务单据表单时直接引用 `ERP_MODAL_WIDTHS.businessForm`；如需改变某类弹窗尺寸，应先更新共享常量、原型规则和 L1 盒模型断言，不在单页私有写死宽度。
- 阻塞/风险：本轮未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置或部署；工作区仍存在并行的本页协同拖拽横杆相关改动，本轮未回退、未纳入弹窗尺寸成果。

## 2026-06-18 本页协同拖拽横杆可见性修复

- 完成：修复共享 `本页协同` 展开态拖拽横杆贴住卡片顶部后容易被裁切 / 看不见的问题；拖拽手柄改为面板 body 内稳定首行，横杆灰度对比提升，并按原型方向收口为 5px 可见握柄和 16px 命中区。
- 完成：补充 `style:l1` 协同面板断言，检查拖拽 handle 与 grip 都落在面板 body 可见范围内，避免后续只保留 DOM 但视觉被顶部裁切。
- 验证：`STYLE_L1_SCENARIOS=business-collaboration-purchase-selected-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-module-dark-customers-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-collaboration-mobile pnpm --dir web style:l1`、`pnpm --dir web css`、`node --check web/scripts/styleL1.mjs` 均通过。
- 下一步：如后续要调整协同面板拖拽视觉强度，应继续在共享 `.erp-business-collaboration-task-panel__resize-handle` 上收口，并同步 L1 盒模型断言。
- 阻塞/风险：本轮只改共享协同入口样式和浏览器级回归断言，不改 schema、migration、后端 usecase、RBAC、菜单、Workflow / Fact 语义或部署；后续再次完整 `pnpm --dir web style:l1` 已通过 56 个场景。

## 2026-06-17 加工合同日期筛选栏修复

- 完成：修复 `/erp/purchase/processing-contracts` 加工合同筛选栏日期范围控件传参，移除外层重复日期字段下拉，统一由 `DateRangeFilter` 承接日期类型、开始日期和结束日期，避免渲染空白下拉框。
- 完成：保持委外订单 / 加工合同源单边界不变；本轮只改前端筛选控件，不改 schema、migration、后端 usecase、RBAC、菜单或加工合同打印模板。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && pnpm style:l1` 均通过；`pnpm test` 342 项通过，`style:l1` 覆盖 56 个场景。
- 验证：通过真实管理员登录打开加工合同页，覆盖桌面浅色、桌面暗色和 390px 移动宽度；确认筛选栏 `emptySelectCount=0`，日期类型为“下单日期”，下拉选项包含“下单日期 / 预计回货”，开始 / 结束日期输入存在，点击日期输入后空白下拉不复现。
- 下一步：若后续要按 URL query 预置加工合同日期筛选，需要单独接入查询参数读取和回归；本轮不扩展筛选能力。
- 阻塞/风险：未运行后端 Go 测试或 migration 检查，因为本轮不涉及后端或数据结构；浏览器验证依赖当前本地 `5175` 前端和 `8300` 后端运行态。

## 2026-06-17 关联按钮全局补齐

- 完成：按 `plush-page-design-governance` 全局扫描正式业务页，在销售订单、采购入库、来料质检、库存台账和 Operational Fact 工作区补选中态 `关联` 下拉；采购订单原有关联逻辑保留。
- 完成：关联入口只导航到已有正式页面、切换库存台账视图或回到可识别来源页；不新增 schema、migration、RBAC、菜单、后端 usecase、Workflow / Fact 写入或客户专属规则。
- 完成：不在 BOM / 主数据维护页补关联按钮，原因是当前没有明确的上下游事实动作或已实现承接页面，避免把主数据页伪装成链路总控。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && pnpm style:l1` 均通过；`style:l1` 覆盖 56 个场景。
- 下一步：如要让关联入口按当前单据自动筛选目标页，需要先给目标列表补正式查询参数读取和浏览器回归；不能在按钮处做页面局部假过滤。
- 阻塞/风险：当前工作区仍有大量非本轮并行改动；本轮未提交、未推送、未改部署，也未验证后端 Go 测试或 migration 状态，因为本轮只改前端关联入口和过程记录。

## 2026-06-17 委外订单加工合同源单 V1

- 完成：将 `委外订单` 从旧 operational fact 列表收口为加工合同 / 委外源单 V1：新增 `outsourcing_orders / outsourcing_order_items` schema、migration、Ent generated code、repo/usecase、`outsourcing_order` JSON-RPC、`outsourcing.order.*` RBAC 和 `/erp/purchase/processing-contracts` 页面。页面支持状态栏统计、单选当前合同、提交 / 确认 / 关闭 / 取消、编辑弹窗、工序明细和加工合同打印带值；确认合同不写库存、质检、应付、发票、付款或 Workflow 完成。
- 完成：加工合同打印模板新增从委外订单映射合同号、来源订单、加工厂、产品、工序、单位、数量、单价、金额和备注；L1 mock 补 `outsourcing_order` 域和可委外工序，避免回归继续验证旧“委外事实”页面。
- 完成：同步 README、当前真源、正式菜单计划、实施拆分清单和产品能力台账，把“委外订单=委外发料 / 回货 facts 页面”的旧口径改为“加工合同源单已落，发料 / 回货 facts 仍在事实层”。
- 验证：`cd server && make data`、`cd server && make migrate_apply && make migrate_status` 通过，本地 dev DB 当前版本 `20260617124401`、pending 0；`cd server && go test ./internal/biz ./internal/data ./internal/service -count=1` 通过；`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test` 通过，前端单测 342 项通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过；`node --check web/scripts/styleL1.mjs`、`git diff --check` 通过。
- 下一步：评审委外发料 / 回货从加工合同明细带值、委外回货质检联动和委外应付 / 对账联动；不要在合同确认动作里直接写库存或财务事实。
- 阻塞/风险：完整 `pnpm style:l1` 本轮曾运行到工作台 / 业务看板阶段后长时间无输出，已中断并清理本轮 4173 验证进程；本轮用覆盖委外页和相邻业务页的目标 L1 收口。当前未做真实 yoyoosun Excel 导入、合同审批流、工序报价、附件留档或目标环境发布。

## 2026-06-17 委外订单页面工具层与协同收口

- 完成：补齐 `/erp/purchase/processing-contracts` 标准业务页工具层，新增 `导出当前结果`、`列顺序`、禁用态 `批量删除`、禁用态 `回收站`，列表列顺序跟随管理员 ERP 偏好保存并保留本地缓存兜底；导出按当前可读列顺序输出，不导出内部 ID。
- 完成：接入 `本页协同` 面板，按 `processing-contracts` + 当前委外订单 ID 过滤 Workflow 任务；协同完成 / 阻塞 / 催办只更新 Workflow 任务，不写库存、质检、应付、发票、付款或委外事实。
- 完成：表单去掉可见 `销售订单ID`、`单位ID` 和产品 / 工序 / 单位快照字段；新增 `list_units` 最小读取链路，明细单位改为单位主数据选择器，产品切换时同步带出默认单位和单位快照，避免页面直接暴露内部 ID。
- 完成：同步产品能力证据和业务模块 currentScope，明确委外订单页已具备标准工具层、本页协同和单位可读选择；真实发料 / 回货 / 质检 / 结算仍属后续事实联动。
- 验证：`cd server && go test ./internal/biz ./internal/data ./internal/service -count=1` 通过；`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test` 通过，前端单测 342 项通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过。
- 下一步：继续做委外发料 / 回货从加工合同明细带值、委外回货质检联动、委外应付 / 对账联动；合同审批流、工序报价、附件留档和真实客户 Excel 导入需要单独评审。
- 阻塞/风险：本轮没有做目标环境发布，也没有实现回收站 / 物理删除 API；批量删除和回收站保持禁用，避免前端假能力。当前工作区仍有非本轮并行改动，未提交、未推送。

## 2026-06-17 加工环节页面降级

- 完成：按 `plush-page-design-governance` 将 `/erp/engineering/processes` 从“工序档案”高权重表达收窄为“加工环节”小字典；保留 `processes` 工序主数据、`masterdata` JSON-RPC、`process.*` RBAC 和委外订单 `process_id` 引用，不新增工艺路线、排程、报工、库存、质检或财务写入能力。
- 完成：前端页面去掉该页摘要数字卡、导出 / 列顺序 / 禁用批量删除 / 回收站工具层，表格收窄为环节编号、名称、类别、委外、内制、需质检、状态和更新时间；委外订单页标签改为“工序来自加工环节字典”。
- 完成：同步 README、当前真源、产品入口计划、产品能力台账、字段来源规则和前端菜单断言；页面显示名为“加工环节”，技术锚点仍保留 `processes` / 工序主数据。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test` 通过，前端单测 342 项通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过；`git diff --check` 通过。
- 下一步：如果后续还要继续降低入口权重，需要单独评审菜单分组 / 客户菜单显隐 / 后端内置菜单 label，不在本轮顺手改 RBAC 或后端菜单真源。
- 阻塞/风险：本轮未运行后端 Go 测试、migration 或完整 `pnpm style:l1`，因为未改 schema、API、RBAC 或后端 usecase，浏览器回归采用正式业务页目标 L1 场景；L1 曾先后遇到遗留 4173 验证进程占端口和一次委外弹窗明细行等待超时，清理 / 复跑后同一目标场景通过。

## 2026-06-17 委外弹窗添加条目统一

- 完成：按 `plush-page-design-governance` 复核弹窗明细区语义，确认“加行”和“添加条目”都是弹窗内新增明细行动作，没有后端能力差异；将委外订单弹窗从顶部普通 `加行` 收口为底部共享 footer 的虚线 `添加条目`，统计展示统一为 `已录入 / 数量合计 / 金额合计` chip。
- 完成：更新 `style:l1` 断言，按通用 `.erp-sales-order-lines-form__list` 检查明细横向滚动、行宽一致、grid 不再各自横滚，并覆盖采购订单明细和委外订单桌面 / 窄屏弹窗；不改 schema、migration、RBAC、菜单、Workflow / Fact usecase 或客户专属配置。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test` 通过，前端单测 342 项通过；`STYLE_L1_PORT=4193 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过；`node --check web/scripts/styleL1.mjs`、`git diff --check` 通过。
- 下一步：后续如果还有弹窗明细入口使用页面私有文案或私有容器，优先继续复用 `erp-line-items-form__footer` 和同一 L1 盒模型断言，不新增第二套“添加行”样式。
- 阻塞/风险：本轮未运行后端 Go 测试、migration 或完整 `pnpm style:l1`，因为只改前端弹窗展示与目标 L1 断言；运行 targeted L1 前曾遇到默认 `4173` 端口清理抖动，最终换 `STYLE_L1_PORT=4193` 完成验证。

## 2026-06-17 采购明细弹窗整体横向滚动

- 完成：按截图中的采购订单明细弹窗修正共享 `.erp-sales-order-lines-form` 布局，将横向滚动从每行 `.erp-sales-order-lines-form__grid` 上移到整体 `.erp-sales-order-lines-form__list`；多行明细现在共享同一个横向滚动面和列宽，不再每行各自滚动。
- 完成：补充 `style:l1` 通用断言 `assertLineItemsUnifiedHorizontalScroll`，在采购订单场景通过“从材料库导入”形成至少两行明细后检查弹窗 body 不横向溢出、整体列表可横向滚动、行宽一致、每行 grid 不再单独 `overflow-x:auto/scroll`。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test` 通过，前端单测 342 项通过；`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm style:l1`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`、`STYLE_L1_SCENARIOS=dev-testing-dark-desktop pnpm style:l1`、`STYLE_L1_SCENARIOS=admin-login-mobile-source-desktop-choice pnpm style:l1` 均通过。
- 下一步：如果后续其他明细弹窗需要更细列宽，应继续在共享明细结构上调列宽预算或按页面加 scoped 变量，不恢复每行独立横向滚动。
- 阻塞/风险：完整 `pnpm style:l1` 本轮两次都在 Chromium `browserContext.close: Target page, context or browser has been closed` 处中断，且失败场景分别单独复跑通过；本轮未改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置或后端逻辑。

## 2026-06-18 来料质检页标准功能补齐

- 完成：按 `plush-page-design-governance` 将 `/erp/production/quality-inspections` 从基础质检列表补齐为标准业务页工具层：新增导出当前结果、列顺序、表头列菜单、表头排序、禁用态批量删除和禁用态回收站；删除 / 回收站明确保持禁用，不伪造当前 `quality` API 未提供的能力。
- 完成：新建质检单弹窗改为可读来源选择和共享 `BusinessFormModal`；采购入库单切换会清空入库行、材料、仓库和批次，入库行选择会带出材料、仓库和批次，批次选择可按材料批次真源回填材料，避免旧 ID 残值继续提交。新增默认质检单号仅作为前端草稿默认值，不改变后端 `quality_inspections` 真源。
- 完成：列表字段从裸 ID 回显改为采购入库、入库行、材料、仓库和批次的可读标签，导出按当前列顺序输出可读值；提交、判定、取消仍只调用现有 QualityUsecase，不写库存流水、不生成采购退货、不改 RBAC、schema、migration、菜单或 Workflow / Fact 边界。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test -- --runInBand` 通过，前端单测 348 项通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过，覆盖来料质检默认态、选中态、列顺序弹窗、新建弹窗、禁用删除 / 回收站、表头排序和横向溢出。
- 下一步：若后续要让质检页“关联”跳转时自动带筛选条件，需要先给采购入库和库存台账目标页补正式 query 读取与回归；不要在按钮处做前端假过滤。
- 阻塞/风险：本轮未运行后端 Go 测试、migration 或完整 `pnpm style:l1`，因为只改前端页面与 L1 mock；当前工作区仍有大量非本轮并行改动，未提交、未推送。

## 2026-06-18 入库表格前置控制列标识

- 完成：确认 `/erp/warehouse/inbound` 表头前的空白块来自 Ant Design 自动插入的展开明细列和单选列；入库管理同时启用 `expandable` 与 `rowSelection`，所以比普通单选表格多一个前置空表头。
- 完成：将入库管理表格前两列显式标为 `明细` / `选择`，并补业务模块表格控制列表头局部样式，使 48px 控制列居中、不裁字；不改采购入库 usecase、schema、migration、RBAC、菜单、库存事实或 Workflow / Fact 边界。
- 完成：补 `purchase-receipts-table-control-columns-desktop` L1 场景，断言入库表格前三列表头为 `明细 / 选择 / 入库单号`、控制列不裁字、横向滚动保留在表格容器内且页面不产生全局横向溢出。
- 验证：运行态脚本覆盖浅色和暗色，确认控制列宽 48px、scrollWidth 不超过 clientWidth、表格容器 `overflow-x:auto`、页面级横向溢出为 0；`STYLE_L1_BASE_URL=http://127.0.0.1:5199 STYLE_L1_SCENARIOS=purchase-receipts-table-control-columns-desktop pnpm style:l1` 通过；`cd web && pnpm css`、`cd web && pnpm test`、`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/pages/V1PurchaseReceiptsPage.jsx`、`cd web && node --check scripts/styleL1.mjs` 通过。
- 下一步：如果后续希望所有带展开行的表格都统一显示 `明细`，应抽到共享业务表格封装或统一列配置评审；本轮只修截图对应的入库管理页。
- 阻塞/风险：未执行 `cd web && pnpm lint`，因为该脚本带 `--fix` 会扫描并改写整个 `src/`，当前工作区有大量非本轮并行改动；本轮改用触达页面的非自动修复 ESLint。未运行后端 Go 测试或 migration 检查，因为本轮只改前端表格展示和 L1 回归。

## 2026-06-18 采购入库真实写入 e2e 入口

- 完成：将 MVP 下一步收窄为采购入库第一条真实写入链路；新增 `scripts/qa/purchase-receipt-real-write-e2e.mjs`，默认运行 JSON-RPC 采购入库创建草稿、加行、非法明细失败、过账、`get/list` 回显、dashboard inbound projection、库存事实、取消冲正、重复操作幂等和权限拒绝测试，并输出本地 evidence。
- 完成：补强 `server/internal/service/jsonrpc_purchase_test.go`，新增非法数量明细被拒绝和过账后 `get_purchase_receipt` 回显明细断言；同步 `scripts/qa/mvp-closure.mjs`、`scripts/README.md` 和 `docs/product/自动化测试策略.md`，明确 `mvp-closure` 仍是 no-write plan，真实写入链路走独立 QA 入口。
- 完成：不改 schema、migration、RBAC 码位、菜单、前端页面、Workflow / Fact usecase 或客户专属配置；采购入库真实写入只发生在测试隔离库 / 本地 PostgreSQL 防呆测试中，不连接生产或目标环境，不执行真实客户导入。
- 验证：`node --check scripts/qa/purchase-receipt-real-write-e2e.mjs && node --check scripts/qa/mvp-closure.mjs` 通过；`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_PurchaseReceiptAPIClosesInboundInventoryFact|TestJsonrpcDispatcher_PurchaseReceiptAPIRequiresDomainPermissions' -count=1` 通过；`node scripts/qa/purchase-receipt-real-write-e2e.mjs --out output/qa/purchase-receipt-real-write-e2e` 通过；`node scripts/qa/mvp-closure.mjs --out output/customers/yoyoosun/mvp-closure` 通过；启动本地 `plush-toy-erp-phase2c-postgres` 测试容器后，`cd server && make purchase_receipt_pg_createdb`、`cd server && make purchase_receipt_migrate_apply`、`node scripts/qa/purchase-receipt-real-write-e2e.mjs --with-postgres --out output/qa/purchase-receipt-real-write-e2e` 通过；`git diff --check` 通过。
- 下一步：补采购入库页面级浏览器写入 e2e，覆盖 `/erp/warehouse/inbound` 页面真实新建、加行、过账、列表回显和错误提示；仍需先设计登录、造数和清理边界。
- 阻塞/风险：本地 `plush-toy-erp-phase2c-postgres` 测试容器当前保持运行，供后续 `--with-postgres` 复跑；它只绑定 `127.0.0.1:55432` 并使用 `plush_erp_phase2c_test` 测试库，不是生产或目标环境。当前工作区仍有大量非本轮并行改动，本轮未提交、未推送。

## 2026-06-18 npm token 仓库侧收口

- 完成：收紧 `scripts/qa/secrets.sh`，即使本机未安装 `gitleaks`，也会继续执行内置 npm registry token 明文检查；`SECRETS_STRICT=1` 下缺少 `gitleaks` 仍阻断，保持 pre-commit / pre-push 的严格策略。
- 完成：在 `web/.npmrc` 和 `scripts/README.md` 明确入库配置只允许无密钥 pnpm 行为项，私有 registry token 只能走被忽略的 `.npmrc.local` / `web/.npmrc.local` 或环境变量；不改 GitHub CI、不重写 git 历史、不新增私有 registry 配置。
- 验证：`bash -n scripts/qa/secrets.sh` 通过；`bash scripts/qa/secrets.sh` 通过；`PATH=/usr/bin:/bin bash scripts/qa/secrets.sh` 通过，覆盖无 `gitleaks` 时的内置 npm token 检查路径；临时 git 仓库写入假 `_authToken` 后 `scripts/qa/secrets.sh` 能阻断并报告 `.npmrc:1`；`bash scripts/qa/shellcheck.sh` 通过。
- 下一步：旧 `web/.npmrc` 历史中曾出现 `_authToken=`，仍需在 Font Awesome / npm 后台撤销对应 token；若用户确认可以重写历史，再单独评审并执行历史清理。
- 阻塞/风险：本轮无法替用户后台 revoke / regenerate token；未处理 GitHub CI secret；未执行历史重写或 force push。当前工作区仍有大量非本轮并行改动，本轮只触达 secrets 脚本、npmrc 说明、脚本文档和本记录。

## 2026-06-18 前端请求主路径收口

- 完成：确认截图里的旧请求层问题不是纯文档治理，而是前端运行时边界；删除未被 `web/src` 或 `web/scripts` 引用的旧 `web/src/common/utils/request.js` axios wrapper，并从 `web/package.json` / `web/pnpm-lock.yaml` 移除 `axios` 运行时依赖。当前前端业务请求主路径保留 `JsonRpc` + `fetch`，登录态继续按既有 auth 存储方案走 localStorage，不在本轮迁移 HttpOnly Cookie。
- 完成：按 `plush-page-design-governance` 复核后补删旧 wrapper 的死代码和专属依赖：`web/src/common/utils/setData.js`、`web/src/common/consts/http.js`、`web/src/common/stores/crypto.js`、`crypto-js`、`qs`、`react-cookies` 及 lockfile 中仅由它们 / axios 带入的专属依赖块；不保留没有运行时语义的旧请求栈碎片。
- 完成：清理运行时代码中的调试 `console.log` 残留，补 `apiClientBoundary.test.mjs` 守卫旧 wrapper、旧 helper 和旧依赖不回流；补 auth 测试确认 `logout(AUTH_SCOPE.ADMIN)` 只清当前 scope 认证 key，不会 `localStorage.clear()` 清掉主题、入口选择等项目内其他缓存。
- 验证：`rg -n "axios|crypto-js|react-cookies|from ['\\\"]qs['\\\"]|\\bqs\\b|common/utils/request|common/utils/setData|common/consts/http|common/stores/crypto|request\\.js|setData\\.js|http\\.js|crypto\\.js|localStorage\\.clear\\(|console\\.log" web/src web/package.json web/pnpm-lock.yaml -g '!web/src/**/*.test.mjs' -g '!web/src/mocks/**'` 无残留；`cd web && pnpm exec node --test src/common/auth/auth.test.mjs src/common/utils/apiClientBoundary.test.mjs src/common/utils/jsonRpc.test.mjs` 通过；`cd web && pnpm exec eslint src/common/auth/auth.test.mjs src/common/utils/apiClientBoundary.test.mjs src/common/hooks/useCallbackPrompt.js src/common/hooks/useBlocker.js src/common/hooks/useClickAway.js src/common/utils/jsonRpcMock.js` 通过；`cd web && pnpm test` 通过，前端单测 355 项通过；`git diff --check` 通过。
- 下一步：HttpOnly SameSite Cookie、CSRF 边界、刷新 token 和后端 Set-Cookie 登录态迁移仍需按 `web/README.md` 单独评审；不应在本轮用前端局部改动假装完成。
- 阻塞/风险：本轮未运行后端 Go 测试、migration、`pnpm css` 或 `style:l1`，因为未改 schema、API、RBAC、页面样式或业务页面交互。当前工作区仍有大量非本轮并行改动，未提交、未推送。

## 2026-06-18 产品能力交付门禁台账收口

- 完成：按 `plush-docs-governance` 判定截图建议属于文档治理 / 能力台账问题；在 `docs/product/产品能力进度台账.md` 新增模块交付门禁表，按前端页面、后端接口、数据表 / 真源、权限、审计 / 证据、测试和可交付判断拆开，明确页面存在、菜单出现或 API 可调用不能单独证明 L8 / 已交付。
- 完成：同步 `docs/product/产品台账索引.md`、`docs/product/README.md` 和 `docs/当前真源与交接顺序.md` 的查阅路径；`docs/product/产品能力证据详情.md` 同步 `product_skus` 与 `purchase_orders` 已接 UI 后的 L7 口径。
- 验证：`git diff --check -- docs/product/产品能力进度台账.md docs/product/产品能力证据详情.md docs/product/产品台账索引.md docs/product/README.md docs/当前真源与交接顺序.md progress.md` 通过；`rg` 已复核模块交付门禁、L8 口径、`product_skus` / `purchase_orders` L7 和 yoyoosun 客户资料治理 L6。
- 下一步：后续某能力升降级时，必须同时更新快速查阅表、模块交付门禁表、证据详情和对应客户交付矩阵；不要只改页面或只改一句状态。
- 阻塞/风险：本轮只做文档治理，不重新审计每个模块 runtime 代码，也不改变 schema、migration、RBAC、菜单、部署、测试脚本或客户交付承诺。

## 2026-06-18 JSON-RPC service 文件拆分

- 完成：按 `plush-docs-governance` 先判断截图建议性质，确认它不是 docs-only，而是后端 service 层结构债；当前 JSON-RPC 已在 `service` 层分发，不再是旧 data 聚合层，本轮只收口仍混在一起的 `jsonrpc_masterdata_order.go`。
- 完成：删除原 `server/internal/service/jsonrpc_masterdata_order.go`，拆为 `jsonrpc_masterdata.go`、`jsonrpc_sales_order.go` 和 `jsonrpc_params.go`；同步 `docs/product/产品能力证据详情.md` 中正式证据路径，保留现有 URL、method、权限、错误映射、参数解析和 response shape，不改 biz/data 语义、schema、migration、RBAC、前端或部署。
- 验证：`cd server && go test ./internal/service` 通过；`gofmt` 已处理新增 Go 文件；`git diff --check -- server/internal/service/jsonrpc_masterdata_order.go` 通过；新增文件用 `git diff --no-index --check /dev/null ...` 分别检查通过。
- 下一步：如后续继续降低 JSON-RPC 入口维护成本，优先按已有 `jsonrpc_<domain>.go` 领域文件继续拆大文件或抽通用 response helper；不要引入新目录树或让入口层承接业务规则。
- 阻塞/风险：当前工作区已有大量非本轮并行改动；本轮只触达 JSON-RPC service 文件、产品能力证据路径和本记录，未运行全量 Go 测试、migration、前端测试或部署检查，因为本轮是 service 层机械拆分且不改运行时业务行为。

## 2026-06-18 formal-shell 待接入预览治理

- 完成：按 `plush-page-design-governance` 将仍为 `formal-shell` 的 `生产排程`、`生产异常` 和 `出货放行` 运行时语义降级为待接入预览页；保留筛选、列顺序、预览导出、字段预览和接入边界提示，移除“新建 / 生成 / 关联单据 / 状态变更 / 导出当前结果”等容易误导为真实业务写入的文案。
- 完成：修正生产排程页主预览按钮与选中行按钮同名导致的可访问名冲突；新增单元测试锁定当前只允许三个 `formal-shell` 页面，并从源码层面守卫 shell 页不再出现真实写入承诺文案。
- 完成：同步 `web/README.md`、`docs/当前真源与交接顺序.md`、`docs/product/正式产品入口与菜单配置计划.md` 和业务模块标准页原型 README；本轮不晋级原型状态，不改 schema、migration、RBAC、菜单、WorkflowUsecase、Fact usecase、客户配置或后端逻辑。
- 验证：`cd web && pnpm lint` 通过；`cd web && pnpm css` 通过；`cd web && pnpm test -- --runInBand` 通过，前端单测 354 项通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过，覆盖 formal-shell 页面旧文案缺失、按钮命名、禁用删除 / 回收站和横向溢出。
- 下一步：如果要让 `生产排程`、`生产异常` 或 `出货放行` 变成真实功能，应按领域 usecase、API、RBAC、审计、测试和能力台账单独实施；不要在前端预览页继续补本地状态或假写入。
- 阻塞/风险：本轮只做入口壳语义和前端 / 文档治理；未运行后端 Go 测试、migration 或全量 `pnpm style:l1`。当前工作区仍有大量非本轮并行改动，未提交、未推送。

## 2026-06-18 生产配置安全门禁收口

- 完成：按 `plush-docs-governance` 先判定截图问题不是 docs-only，而是生产运行时 / Compose / preflight / 文档同步问题；在 `server/cmd/server/main.go` 的生产启动校验中新增 SMS mock 拒绝、`ERP_DEBUG_ENV=prod` 要求，以及 `ERP_DEBUG_SEED_ENABLED=false` / `ERP_DEBUG_CLEANUP_ENABLED=false` 显式关闭要求。
- 完成：将生产 Compose 的 PostgreSQL 和 Jaeger 镜像改为 `POSTGRES_IMAGE=postgres:18.1`、`JAEGER_IMAGE=jaegertracing/all-in-one:1.76.0` 固定 tag，并显式注入 `APP_AUTH_SMS_MODE=disabled`；`production-preflight.sh` 同步检查固定镜像 tag、SMS mock、debug 写入开关、placeholder secret、Jaeger loopback 和低配部署边界。
- 完成：同步 `server/deploy/README.md`、`server/deploy/compose/prod/README.md`、`server/docs/config.md`、`docs/部署约定.md`、`scripts/README.md` 和本记录；`AGENTS.md` 只读未改，`docs/文档清单.md` 未改，因为本轮只修改既有文档正文，不改变文档标题、职责、路径或分类。
- 验证：`cd server && go test ./cmd/server` 通过；`bash scripts/deploy/production-preflight.sh --example` 通过并执行 `docker compose config -q`；基于临时生产 `.env` 的正向 preflight 通过；基于同一临时 `.env` 的 `JAEGER_IMAGE=:latest` 和 `APP_AUTH_SMS_MODE=Mock` 负向检查均被拦截；`git diff --check` 通过；`rg` 已确认 prod Compose 不再直接使用 `latest` 镜像。
- 下一步：真实发版时仍必须用目标运行时 `.env` 跑 `production-preflight.sh --env-file ...`；如升级 PostgreSQL / Jaeger 版本，需要显式改 tag、跑 preflight、记录发布证据和回滚口径。
- 阻塞/风险：本轮不执行线上部署、不运行 migration、不改 schema、RBAC、业务 usecase、菜单或前端页面；当前工作区仍有大量非本轮并行改动，未提交、未推送。

## 2026-06-18 生产 PostgreSQL loopback 绑定收口

- 完成：按 `plush-page-design-governance` 复核上轮交付语义后确认缺口在部署运行边界，不是页面 / 原型问题；将生产 Compose PostgreSQL 端口从默认宿主机全网卡映射改为 `${POSTGRES_BIND_ADDR:-127.0.0.1}:${POSTGRES_PORT:-5435}:5432`，新增 `.env.example` 中 `POSTGRES_BIND_ADDR=127.0.0.1`。
- 完成：`production-preflight.sh` 新增 `POSTGRES_BIND_ADDR` 必需变量、运行时值检查和 Compose 默认值检查，阻断 `0.0.0.0` 或其他非 loopback 绑定；同步 `server/deploy/README.md`、`server/deploy/compose/prod/README.md`、`docs/部署约定.md`、`scripts/README.md` 和本记录，明确 Atlas migration 仍走宿主机本地 `127.0.0.1:5435`。
- 验证：`bash -n scripts/deploy/production-preflight.sh` 通过；`bash scripts/deploy/production-preflight.sh --example` 通过并执行 `docker compose config -q`；基于临时生产 `.env` 的正向 preflight 通过；基于同一临时 `.env` 的 `POSTGRES_BIND_ADDR=0.0.0.0` 负向检查被拦截；`git diff --check -- ...` 通过；`rg` 已确认生产 Compose、env example、preflight 和部署文档均包含 `POSTGRES_BIND_ADDR` 口径。
- 下一步：真实发版时仍必须用目标运行时 `.env` 跑 `production-preflight.sh --env-file ...`；如果未来确实需要远程数据库管理入口，应先另行评审 VPN / SSH tunnel / bastion 方案，不直接放开 PostgreSQL 宿主机公网绑定。
- 阻塞/风险：本轮不执行线上部署、不运行 migration、不改 schema、RBAC、业务 usecase、菜单、前端页面或原型；当前工作区仍有大量非本轮并行改动，未提交、未推送。

## 2026-06-18 采购入库页面级真实写入 e2e

- 完成：新增 `web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs` 和 `pnpm smoke:purchase-receipt-real-write`，覆盖真实管理员登录、`/erp/warehouse/inbound` 页面创建草稿、维护明细、过账、库存流水校验、取消冲正和列表回显；报告输出到 `web/output/playwright/purchase-receipt-real-write-browser-e2e/`。
- 完成：补 `list_warehouses` 主数据只读接口，并让采购入库页从仓库主数据加载仓库选项；`warehouseOptionFromRecord` 同时兼容主数据 `name/code` 与事实快照 `warehouse_name/warehouse_code`，引用数据加载改为顺序短重试，避免本地限流导致表单下拉全空。
- 完成：同步 `web/README.md`、`docs/product/自动化测试策略.md` 和 `scripts/qa/mvp-closure.mjs`，明确页面级真实写入脚本只写本地 / 开发库模拟采购入库事实，不连接生产或目标客户环境，缺主数据时显式使用 `-- --seed-core-demo`。
- 验证：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_ListWarehousesUsesInventoryReadPermission|TestJsonrpcDispatcher_ListUnitsUsesMaterialReadPermission|TestJsonrpcDispatcher_PurchaseReceiptAPIClosesInboundInventoryFact|TestJsonrpcDispatcher_PurchaseReceiptAPIRequiresDomainPermissions' -count=1` 通过；`cd web && pnpm test -- src/erp/api/masterDataOrderApi.test.mjs src/erp/utils/referenceSelectOptions.test.mjs` 通过，前端单测 354 项通过；`cd web && pnpm exec eslint --ext .mjs --ext .jsx scripts/purchaseReceiptRealWriteBrowserE2E.mjs src/erp/utils/referenceSelectOptions.mjs src/erp/utils/referenceSelectOptions.test.mjs src/erp/pages/V1PurchaseReceiptsPage.jsx` 通过；`cd web && pnpm smoke:purchase-receipt-real-write` 通过，入库单 `PR-BROWSER-1781769695507` 完成页面创建、加明细、过账、取消冲正和库存流水校验。
- 下一步：可把采购入库页面级真实写入 e2e 纳入发版前人工 QA 清单，或补一个只读 preflight 检查目标环境主数据是否满足演示条件；不要把该脚本直接自动跑到生产或目标客户环境。
- 阻塞/风险：多次浏览器 e2e 调试在本地 / 开发库留下若干 `PR-BROWSER-*` 模拟入库单和一次旧自动号草稿 / 取消记录，均非生产或目标客户环境数据；当前工作区仍有大量非本轮并行改动，未提交、未推送；本轮未跑完整 `pnpm style:l1`、`scripts/qa/full.sh` 或部署检查。

## 2026-06-18 采购入库整单创建事务收口

- 完成：按“前端不要承担业务一致性”原则，新增 `create_purchase_receipt_with_items` 后端 JSON-RPC / `InventoryUsecase` / repo 事务接口；手工新建采购入库单时，单头和初始明细在后端同一事务内创建，引用或明细校验失败会回滚单头，不再由前端串联空草稿和初始明细来维持一致性。
- 完成：`/erp/warehouse/inbound` 新建弹窗改为单头 + 入库明细 Form.List 一次保存；已有草稿的“维护明细”仍保留为显式补行入口，过账 / 取消仍由后端采购入库 usecase 写库存流水或冲正，不改 schema、migration、RBAC、菜单、Workflow / Fact 边界或客户配置。
- 完成：同步页面级真实写入脚本 `web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs`，把浏览器 e2e 从“创建空草稿后再补明细”改为“新建弹窗整单创建”，避免回归脚本继续强化旧前端一致性模式。
- 完成：补 `purchaseApi` 与 `businessLineItems` 测试，并在 `jsonrpc_purchase_test.go` 覆盖整单事务创建不写库存、非法明细失败回滚单头、看板 projection 区分草稿总数和已过账数量。
- 验证：`cd web && pnpm test -- businessLineItems purchaseApi` 实际跑完整前端 node tests，355 项通过；`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_PurchaseReceipt'` 通过；`cd server && go test ./internal/data -run 'TestInventoryRepo_PurchaseReceipt|TestPhase2CPostgresPurchaseReceipt|TestPhase2CPostgresMigrationShape'` 通过；`cd web && pnpm lint`、`cd web && pnpm css` 通过；`node --check web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs` 通过；`cd web && pnpm exec eslint --ext .js --ext .jsx --ext .mjs scripts/purchaseReceiptRealWriteBrowserE2E.mjs src/erp/pages/V1PurchaseReceiptsPage.jsx src/erp/api/purchaseApi.mjs src/erp/api/purchaseApi.test.mjs src/erp/utils/businessLineItems.mjs src/erp/utils/businessLineItems.test.mjs` 通过；`STYLE_L1_SCENARIOS=purchase-receipts-table-control-columns-desktop pnpm style:l1` 通过；启动本地 server 后 `cd web && pnpm smoke:purchase-receipt-real-write -- --seed-core-demo` 通过，入库单 `PR-BROWSER-1781770027844` 完成页面整单创建、过账、取消冲正和库存流水校验。
- 下一步：若后续要把已有草稿补多行也事务化，应单独新增批量追加接口；不要在前端用多次循环调用伪装成整单保存。
- 阻塞/风险：当前工作区本轮开始前已有大量未提交并行改动，且部分与采购入库页面同文件交叉；本轮真实写入 smoke 在本地 / 开发库新增并取消了 `PR-BROWSER-1781770027844` 模拟入库单；本轮未运行全量 `pnpm style:l1`、`scripts/qa/full.sh`、migration 或部署检查。

## 2026-06-18 采购入库页面 e2e 持久测试事实防呆

- 完成：将下一步收窄为页面级采购入库 e2e 的数据隔离边界；确认 `purchase_receipts` 是不可物理删除的事实源单据，脚本不新增清表式 cleanup，改为启动前要求显式接受保留 `PR-BROWSER-*` 测试事实，并在报告中写入 `cleanup_policy`。
- 完成：`web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs` 默认只允许 localhost / 127.0.0.1 页面目标；直接 `node` 执行必须传入 `--accept-persistent-test-data` 或环境变量确认，非本地目标还必须额外传入 `--allow-external-base-url`，避免误跑生产或目标客户环境。
- 完成：`pnpm smoke:purchase-receipt-real-write` 保持可直接运行，但脚本命令中显式带上 `--accept-persistent-test-data`；同步 `web/README.md`、`docs/product/自动化测试策略.md` 和 `scripts/qa/mvp-closure.mjs` 的持久测试事实、取消冲正和非本地目标边界。
- 验证：`node --check web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs && node --check scripts/qa/mvp-closure.mjs` 通过；`cd web && pnpm exec eslint --ext .mjs scripts/purchaseReceiptRealWriteBrowserE2E.mjs` 通过；直接运行 `node web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs` 已被显式确认 guard 拦截并提示事实单据不可物理删除。
- 下一步：补采购入库页面的 targeted L1 场景，覆盖整单新建弹窗、明细长文本 / 宽数字、失败态、取消后恢复态、键盘焦点和相邻区域；仍不应把这条真实写入 e2e 自动接入生产或目标客户环境。
- 阻塞/风险：本轮不重新跑真实写入 smoke，避免为了验证 guard 再新增一张持久模拟入库单；未运行全量 `pnpm style:l1`、后端 Go 全量、migration 或部署检查。当前工作区仍有大量非本轮并行改动，未提交、未推送。

## 2026-06-18 采购入库整单弹窗 targeted L1

- 完成：新增 `purchase-receipt-create-modal-desktop` L1 场景，覆盖 `/erp/warehouse/inbound` 整单新建弹窗的必填失败态、长供应商 / 长批次 / 宽数字、明细横向滚动、添加第二条明细、关闭恢复、重新打开后只保留一条空明细，以及页面级横向溢出。
- 完成：补 style L1 mock 的 `list_warehouses` 和 `create_purchase_receipt_with_items`，让采购入库页面回归继续读取真实主数据语义和后端整单创建语义，不回退到前端串联空草稿。
- 完成：修采购入库页 `validateFields()` 校验失败未捕获导致浏览器 pageerror 的问题；校验失败现在停留在表单并展示 AntD 校验，不进入保存流程。新建入库单号输入框加 `autoFocus`，共享 `BusinessFormModal` 补打开后聚焦最新可见业务表单控件。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`cd web && pnpm exec eslint --ext .jsx src/erp/pages/V1PurchaseReceiptsPage.jsx src/erp/components/business-list/BusinessFormModal.jsx` 通过；`STYLE_L1_PORT=4205 STYLE_L1_SCENARIOS=purchase-receipt-create-modal-desktop pnpm style:l1` 通过；`cd web && pnpm test` 通过，前端单测 356 项通过；`cd web && pnpm css` 通过；`git diff --check` 通过。
- 下一步：如继续补页面治理，优先加暗色 / 移动端同类弹窗或批量追加明细事务接口；不要把已有草稿多次前端循环添加明细伪装成整单保存。
- 阻塞/风险：未运行全量 `pnpm style:l1`、后端 Go 全量、migration、真实写入 smoke 或部署检查；本轮未新增真实采购入库模拟单。当前工作区仍有大量非本轮并行改动，`web/scripts/styleL1.mjs` 和 `V1PurchaseReceiptsPage.jsx` 的 diff 规模包含既有并行现场。

## 2026-06-18 工作台原型与文档术语收口

- 完成：按 `plush-page-design-governance` / `plush-docs-governance` 复核工作台运行态、原型说明、原型总索引和文档清单；把工作台残留“当前处理卡 / 当前任务详情”统一收口为“当前任务上下文”，保留任务中心自身的“当前任务详情”语义。
- 完成：同步 `docs/product/prototypes/admin-command-center-v1/README.md`、`docs/product/prototypes/README.md` 和 `docs/文档清单.md`；工作台原型仍登记为 `To Implement`，只说明运行态已吸收低密度方向，不晋级为 `Current`。
- 完成：同步 `web/scripts/styleL1.mjs` 中工作台 L1 诊断文案，并顺手修复该脚本中阻塞语法检查的纯结构断点；未改 schema、migration、RBAC、菜单、WorkflowUsecase、Fact usecase、客户配置、部署或 AGENTS。
- 验证：`rg -n "3 个任务判断指标|当前处理卡|当前任务详情|待处理 / 风险 / 等待 / 已归档|tab-priority|tab-mine|data-filter=\"priority\"|data-filter=\"mine\"" docs/product/prototypes/admin-command-center-v1 docs/product/prototypes/README.md docs/product/prototypes/index.html docs/文档清单.md web/src/erp/config/devPrototypes.mjs web/scripts/styleL1.mjs` 仅命中任务中心条目；`node --check web/scripts/styleL1.mjs` 通过；`cd web && node --test src/erp/config/devPrototypes.test.mjs` 通过；`cd web && STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,dev-prototypes-dark-desktop pnpm style:l1` 通过；`git diff --check -- docs/product/prototypes/admin-command-center-v1/README.md docs/product/prototypes/admin-command-center-v1/index.html docs/product/prototypes/README.md docs/product/prototypes/index.html docs/文档清单.md web/src/erp/config/devPrototypes.mjs web/scripts/styleL1.mjs progress.md` 通过。
- 下一步：如果继续推进工作台，应优先让运行态和 To Implement 原型一起收口“处理任务权限不足 / 无效动作”语义，明确哪些按钮只是 Workflow 协同动作、哪些必须跳转到库存 / 出货 / 财务等事实模块。
- 阻塞/风险：当前工作区仍有大量非本轮并行改动，尤其 `web/scripts/styleL1.mjs` 已包含多项其他页面 L1 改动；本轮只按工作台术语和语法阻塞做局部处理，未运行全量 `pnpm style:l1`、`pnpm lint`、后端测试、migration 或部署检查。
