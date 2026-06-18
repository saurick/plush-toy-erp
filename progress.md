# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-15-before-final-bom-closeout.md`：当前工作区已有归档快照，保留 BOM 收口和文档治理前的旧流水。
- `docs/archive/progress-2026-06-16-before-audit-log-readable.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录。
- `docs/archive/progress-2026-06-16-before-backup-restore-rehearsal.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录。
- `docs/archive/progress-2026-06-17-before-related-actions.md`：本轮写入关联按钮前，因 `progress.md` 超过 80KB 归档的完整过程流水快照。
- `docs/archive/progress-2026-06-18-before-formal-preview-action-cleanup.md`：本轮清理 formal-shell 预览页假动作前，因 `progress.md` 超过 80KB 归档的完整过程流水快照。

## 当前活跃事项

- 当前工作区仍有大量非本轮并行改动，包含 schema / API / UI / 文档 / 原型 / 客户配置等混合现场；每轮收口必须按本轮允许路径精确说明和验证，不得回退或整理非本轮现场。
- 已接正式 V1 的销售订单、采购订单、采购入库、来料质检、库存台账、出货 / 预留和财务事实页面应保持 Workflow / Fact 边界：关联入口只提供上下文跳转或已有打印 / 生成动作，不代表下游事实自动过账。
- 移动岗位任务端 `/m/<role>/tasks` 仍是岗位协同入口；后续拆分应继续保持 Workflow 任务完成不写库存、出货、财务或付款事实。

## 2026-06-18 销售订单业务弹窗键盘焦点治理

- 完成：按 `plush-page-design-governance` 继续收口销售订单页面设计验收盲区；共享 `BusinessFormModal` 在打开后主动把焦点送入最新可见业务表单弹窗，避免键盘 Enter 打开后焦点仍停在外部触发按钮。
- 完成：补 `style:l1` 业务弹窗键盘回归 helper，并接入 `business-v1-sales-orders`：验证 Enter 打开 `新建销售订单`、弹窗声明 `aria-modal=true`、焦点进入弹窗、Tab 能到达可见控件、Escape 关闭后焦点回到 `新建订单`。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`cd web && pnpm exec eslint --ext .jsx src/erp/components/business-list/BusinessFormModal.jsx` 通过；默认端口 `4173` 被占用导致首次目标 L1 未启动，改用 `STYLE_L1_PORT=4178 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 后通过，1 个场景；`git diff --check -- web/src/erp/components/business-list/BusinessFormModal.jsx web/scripts/styleL1.mjs` 通过。
- 下一步：如要宣称全部业务表单弹窗“完美”，还需要按共享组件影响面逐页补或复用键盘 / 焦点 / 暗色 / 移动端目标场景；本轮只把销售订单目标闭环和共享主路径焦点行为锁住。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态；当前工作区仍有大量非本轮并行改动，`BusinessFormModal.jsx` 在当前现场为未跟踪共享组件但已被多个 V1 页面引用，本轮不回退该并行结构。

## 2026-06-18 Formal shell 预览页假动作清理

- 完成：按 `plush-page-design-governance` 继续收口 `production-scheduling`、`production-exceptions`、`shipping-release` 三个 formal-shell 待接入预览页；移除页面工具条和选中操作区里的禁用态 `批量删除`、`回收站`、`删除`，避免禁用按钮继续暗示物理删除、回收站或真实业务对象生命周期已接入。
- 完成：补 `businessModuleNavigation` 静态守卫，禁止 formal-shell 页面源码重新出现 `批量删除` / `回收站`；目标 L1 helper 从“删除 / 回收站按钮必须禁用”改为“这些动作不应出现”，并继续覆盖三条待接入预览页、刷新待接入提示、字段预览弹窗和横向溢出。
- 验证：`node --test web/src/erp/utils/businessModuleNavigation.test.mjs` 通过，4 项；`cd web && pnpm exec eslint --ext .jsx src/erp/pages/FormalBusinessModulePage.jsx` 通过；`node --check web/scripts/styleL1.mjs` 通过；`git diff --check -- web/src/erp/pages/FormalBusinessModulePage.jsx web/src/erp/utils/businessModuleNavigation.test.mjs web/scripts/styleL1.mjs` 通过；默认端口 `4173` 被占用导致首次 `style:l1` 未启动，改用 `STYLE_L1_PORT=4193 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 后通过，1 个场景。
- 下一步：若要让这三页进入正式 V1，需要分别接领域 usecase、API、RBAC、真实数据、菜单文案、导出 / 删除 / 回收站语义和 L1 回归；不能只靠禁用按钮或页面文案包装成已完成能力。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、WorkflowUsecase、Fact usecase、客户配置、部署或原型状态；当前工作区仍有大量非本轮并行改动，尤其 `web/scripts/styleL1.mjs` 包含其他页面回归改动，本轮只声明目标 formal-shell 语义和目标场景已验证。

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
- 验证：`node --test web/src/erp/utils/workflowDashboardStats.test.mjs` 通过，11 项；`pnpm exec eslint --ext .mjs scripts/styleL1.mjs src/erp/utils/dashboardTaskDisplay.mjs src/erp/utils/workflowDashboardStats.test.mjs` 通过；`STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop pnpm style:l1` 通过，3 个场景；`node --check web/scripts/styleL1.mjs` 通过；`progress.md` 修改前为 367 行、71034 字节，未达到归档阈值。
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

## 2026-06-18 formal-shell 只读预览页收口

- 完成：按 `plush-page-design-governance` 继续收口 `生产排程`、`生产异常` 和 `出货放行` 三个仍为 `formal-shell` 的页面；运行时不再展示删除、回收站、打印或可点击导出业务数据入口，导出按钮改为禁用态 `预览导出待接入`，并明确当前待接入预览页不导出业务数据。
- 完成：扩展 `business-formal-module-shells-desktop` L1 回归，覆盖三个 formal-shell 页面的预览字段按钮、接入边界动作、旧“新建 / 生成 / 导出当前结果 / 删除 / 回收站 / 打印”文案缺失、刷新不伪造远端成功、字段预览弹窗、暗色生产异常和移动端出货放行横向溢出。
- 完成：同步 `web/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/正式产品入口与菜单配置计划.md`，将 formal-shell 口径从“预览导出”改为“导出待接入提示 / 不提供业务数据导出”。
- 验证：`cd web && pnpm test -- --runInBand` 通过，355 项；`cd web && pnpm css` 通过；`cd web && pnpm exec eslint --ext .js --ext .jsx src/erp/pages/FormalBusinessModulePage.jsx src/erp/utils/businessModuleNavigation.test.mjs` 通过；`node --check web/scripts/styleL1.mjs` 通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop STYLE_L1_PORT=4175 pnpm style:l1` 通过；`git diff --check` 覆盖本轮文件通过。
- 下一步：如需进一步从产品上消除误解，可以评审是否把三个 formal-shell 菜单默认隐藏或加全局模块状态徽标；这属于菜单 / 产品能力状态调整，不在本轮只读预览页收口范围。
- 阻塞/风险：`cd web && pnpm lint` 全量命令仍被非本轮 `web/src/erp/pages/V1MasterDataPage.jsx:965` 的未使用 `contacts` 变量阻塞；本轮未改该并行现场。未改 schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置或部署。

## 2026-06-18 主数据联系人聚合保存事务收口

- 完成：按 `plush-page-design-governance` 和“前端不承担业务一致性”继续做下一步收口；确认销售 / 采购 / 委外订单保存、采购入库新建和出货单新建已有后端事务主路径，本轮选择主数据页面中“客户 / 供应商主体 + 联系人列表”前端串写作为明确缺口处理。
- 完成：新增后端 `save_customer_with_contacts` / `save_supplier_with_contacts` JSON-RPC 聚合接口，复用现有 customer / supplier / contact 权限，在单个 MasterData repo 事务内完成主体创建 / 更新、联系人新增 / 更新以及遗漏联系人停用；任一联系人写入失败时主体一并回滚。不改 schema、migration、RBAC 权限码、菜单、Workflow / Fact usecase、客户配置或原型状态。
- 完成：V1 主数据客户 / 供应商页面保存联系人时改为调用聚合接口，不再从页面串联 `createContact / updateContact / disableContact`；L1 masterdata mock 同步支持聚合接口。上一条记录中的 `V1MasterDataPage.jsx` unused `contacts` lint 阻塞已随本轮删除前端串写状态而消除。
- 完成：同步 `server/README.md` 的 masterdata JSON-RPC 域说明，记录主数据主体 + 联系人页面保存应走聚合事务接口；`docs/当前真源与交接顺序.md` 仍作为索引，不复制接口清单。
- 验证：`cd server && go test ./internal/data -run 'TestMasterDataRepo'` 通过；`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_(SaveCustomerWithContacts|MasterData|ContactAPI)'` 通过；`cd web && pnpm test -- masterDataOrderApi` 通过（脚本实际执行全量 node test，356 项）；`cd web && pnpm css` 通过；`cd web && pnpm lint` 通过；`cd web && STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过，覆盖供应商 / 客户主数据页表单 Modal、联系人区域、编辑 Modal 和无横向溢出。首次 L1 与 lint 并行时因 Vite 重启出现 `ERR_CONNECTION_REFUSED`，单独重跑通过。
- 下一步：继续扫描并分批处理仍可能存在的“前端维护同一业务对象多写一致性”的路径，优先级是已有草稿明细批量维护、BOM 草稿头和明细、以及内部 Operational Fact 页面；每个点先区分显式单行维护和真正整单保存。
- 阻塞/风险：本轮没有做全仓库端到端人工点击保存，也没有新增真实浏览器写库 smoke；未覆盖移动端，因为改动页面是桌面 ERP 主数据页。仓库仍有大量非本轮并行改动，本轮未提交、未推送。

## 2026-06-18 采购入库整单弹窗暗色和移动端 L1

- 完成：在 `purchase-receipt-create-modal-desktop` 之外新增 `purchase-receipt-create-modal-dark-desktop` 和 `purchase-receipt-create-modal-mobile`，覆盖整单新建弹窗暗色 token、可读性、长文本 / 宽数字、移动端视口、底部按钮、body 纵向滚动、明细 grid 内部横向滚动和关闭恢复。
- 完成：复用采购入库整单新建弹窗 helper，不新增真实写入、不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置或原型状态；暗色场景只检查实际存在的节点，移动端断言在读取首字段前将明细横向滚动归零，避免把滚动末端误判成字段被裁。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`STYLE_L1_PORT=4209 STYLE_L1_SCENARIOS=purchase-receipt-create-modal-dark-desktop,purchase-receipt-create-modal-mobile pnpm style:l1` 通过；`STYLE_L1_PORT=4210 STYLE_L1_SCENARIOS=purchase-receipt-create-modal-desktop,purchase-receipt-create-modal-dark-desktop,purchase-receipt-create-modal-mobile pnpm style:l1` 通过；`git diff --check` 通过。
- 下一步：如果继续按页面设计治理推进，优先补已有草稿“维护明细”的批量追加 / 多行体验和 L1，区分单行维护与真正整单保存；不要把前端循环多次 add item 伪装成事务。
- 阻塞/风险：本轮只补 L1 场景，没有重跑 `pnpm test`、`pnpm css`、真实写入 smoke、后端 Go、migration 或部署检查；未新增 `PR-BROWSER-*` 测试单据。当前工作区仍有大量并行改动，未提交、未推送。

## 2026-06-18 页面治理 L1 断言债清理

- 完成：按 `plush-page-design-governance` 收口当前页面回归工具链，清理 `web/scripts/styleL1.mjs` 中已经没有任何场景调用的悬空断言 helper，避免未接入检查继续制造“看起来有覆盖”的误导；保留真实被场景调用的 L1 检查。
- 完成：修复 `V1MasterDataPage.jsx` 中只写不读的 `contacts` state lint 阻塞，当前联系人回显仍由 `selectedRecord` 和表单值承接，不改变客户 / 供应商联系人聚合保存语义。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`pnpm --dir web exec eslint --ext .js --ext .jsx src/erp scripts/styleL1.mjs` 通过；`pnpm --dir web css` 通过；`pnpm --dir web test` 通过，356 项；默认 `4173` 端口被占用导致首次目标 L1 未启动，改用 `STYLE_L1_PORT=4273 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 后通过，1 个场景；`git diff --check -- web/scripts/styleL1.mjs web/src/erp/pages/V1MasterDataPage.jsx web/src/erp/pages/FormalBusinessModulePage.jsx progress.md` 通过。
- 下一步：继续按页面语义优先级补真实被场景调用的 L1 覆盖；不要把未挂接的 helper 当作页面已验收证据。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态；当前工作区仍有大量非本轮并行改动，未提交、未推送。

## 2026-06-18 formal-shell 刷新语义与业务弹窗焦点

- 完成：按 `plush-page-design-governance` 继续收口 formal-shell 待接入预览页语义；`FormalBusinessModulePage` 的页面刷新不再返回成功态，改为提示当前暂无远端数据刷新，避免 ERP shell 误报“当前页面数据已刷新”。
- 完成：补 `businessModuleNavigation` 静态断言和 `business-formal-module-shells-desktop` L1 断言，锁住 formal-shell 页面刷新不伪造远端成功；同时将 formal-shell 双击字段预览弹窗关闭路径复用现有 `closeBusinessFormModal`，避免脚本和真实 Modal 行为分叉。
- 完成：修正共享 `BusinessFormModal` 打开后的初始焦点选择器，优先聚焦真实可操作的 input / textarea / AntD select search input / picker input / button，不再把不可聚焦 selector 当作焦点入口；L1 发现的销售订单新建 Modal 焦点未进入弹窗问题已覆盖。
- 验证：`cd web && pnpm exec node --test src/erp/utils/businessModuleNavigation.test.mjs` 通过，4 项；`cd web && pnpm exec eslint --ext .jsx --ext .mjs src/erp/components/business-list/BusinessFormModal.jsx src/erp/pages/FormalBusinessModulePage.jsx src/erp/utils/businessModuleNavigation.test.mjs` 通过；`node --check web/scripts/styleL1.mjs` 通过；`STYLE_L1_PORT=4198 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景；`pnpm --dir web test` 通过，356 项；`git diff --check` 通过。
- 下一步：继续按页面语义优先级处理真实用户会误解的入口，例如待接入页面是否需要更显眼的模块状态标识或默认隐藏策略；这会触达菜单 / 产品能力状态，应单独评审。
- 阻塞/风险：本轮不改 schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态；当前工作区仍有大量非本轮并行改动，未提交、未推送。

## 2026-06-18 采购入库草稿添加明细 L1

- 完成：按 `plush-page-design-governance` 继续收口采购入库页面；将选中草稿后的操作按钮从“维护明细”改为“添加明细”，避免当前只支持 `add_purchase_receipt_item` 单行追加时误导用户以为可编辑 / 批量维护已有明细。
- 完成：扩展 `style:l1` 采购入库 mock 为 DRAFT / POSTED / CANCELLED 三种单据，并让 `add_purchase_receipt_item` 写回 mock 草稿单据；新增 `purchase-receipt-add-item-modal-draft-desktop`，覆盖 POSTED / CANCELLED 禁用、DRAFT 启用、弹窗打开焦点和关闭恢复、必填校验、长文本 / 宽数字、无横向溢出、提交后明细行数从 1 变 2。
- 完成：本轮不做批量追加，不前端循环伪造事务，不新增真实写入，不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态；现有标准原型仍是 To Implement 参考，未晋级 Current。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`STYLE_L1_PORT=4214 STYLE_L1_SCENARIOS=purchase-receipt-add-item-modal-draft-desktop pnpm style:l1` 通过；`STYLE_L1_PORT=4215 STYLE_L1_SCENARIOS=purchase-receipt-create-modal-desktop,purchase-receipt-create-modal-dark-desktop,purchase-receipt-create-modal-mobile,purchase-receipt-add-item-modal-draft-desktop pnpm style:l1` 通过；`pnpm exec eslint --ext .jsx src/erp/pages/V1PurchaseReceiptsPage.jsx` 通过；`git diff --check -- web/src/erp/pages/V1PurchaseReceiptsPage.jsx web/scripts/styleL1.mjs` 通过。
- 下一步：如果继续推进采购入库页面治理，优先评审“已保存草稿明细”的编辑 / 删除 / 批量追加是否应该进入后端事务接口；在没有对应 usecase 前，页面只表达单行添加，不把它说成整单维护。
- 阻塞/风险：本轮没有重跑 `pnpm test`、`pnpm css`、后端 Go、migration、部署检查或真实写入 smoke；未新增 `PR-BROWSER-*` 持久测试单据。当前工作区仍有大量并行改动，未提交、未推送。

## 2026-06-18 采购入库添加明细暗色和移动端 L1

- 完成：按 `plush-page-design-governance` 补齐 `purchase-receipt-add-item-modal-dark-desktop` 和 `purchase-receipt-add-item-modal-mobile`；覆盖草稿添加明细弹窗在暗色主题下的 token / 可读性，以及移动视口内的弹窗边界、body 纵向滚动、表单无横向溢出、底部按钮尺寸、首字段不被裁切和关闭恢复。
- 完成：本轮只扩展 L1 断言和截图，不改运行时页面语义、不新增真实写入、不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态；标准业务原型仍为 To Implement 参考，未晋级 Current。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`STYLE_L1_PORT=4216 STYLE_L1_SCENARIOS=purchase-receipt-add-item-modal-dark-desktop,purchase-receipt-add-item-modal-mobile pnpm style:l1` 通过；`STYLE_L1_PORT=4217 STYLE_L1_SCENARIOS=purchase-receipt-add-item-modal-draft-desktop,purchase-receipt-add-item-modal-dark-desktop,purchase-receipt-add-item-modal-mobile pnpm style:l1` 通过；`git diff --check -- web/scripts/styleL1.mjs` 通过。
- 下一步：采购入库页面治理可以继续补“整单创建”和“添加明细”两组场景的无权限 / 失败请求 / stale selected row 行为；真正编辑、删除或批量追加草稿明细仍应先评审后端 usecase，而不是在前端循环调用单行 add。
- 阻塞/风险：本轮没有重跑 `pnpm test`、`pnpm css`、后端 Go、migration、部署检查或真实写入 smoke；未新增 `PR-BROWSER-*` 持久测试单据。当前工作区仍有大量并行改动，未提交、未推送。

## 2026-06-18 打印合同手签留白动作

- 完成：按 `plush-page-design-governance` 在采购合同和加工合同独立打印窗口增加 `手签留白` 动作，只清空当前窗口草稿里的甲方签名和乙方签名，保留双方日期、甲乙方签字区版式、合同主体、明细、条款和附件，便于打印后手写签字。
- 完成：新增采购合同 / 加工合同 editor helper 和单元测试；扩展打印工作台 L1 弹窗刷新场景，覆盖按钮可见、点击后纸面签字人清空、日期保留、工具栏无横向溢出；同步 `docs/打印模板字段与编辑行为清单.md` 的行为口径。
- 验证：`pnpm --dir web exec node --test src/erp/utils/materialPurchaseContractEditor.test.mjs src/erp/utils/processingContractEditor.test.mjs` 通过，20 项；`node --check web/scripts/styleL1.mjs` 通过；`pnpm --dir web exec eslint --ext .mjs --ext .jsx src/erp/utils/materialPurchaseContractEditor.mjs src/erp/utils/processingContractEditor.mjs src/erp/components/print/MaterialPurchaseContractWorkbench.jsx src/erp/pages/ProcessingContractPrintWorkspacePage.jsx scripts/styleL1.mjs` 通过；`STYLE_L1_PORT=4282 STYLE_L1_SCENARIOS=print-workspace-material-shell-refresh,print-workspace-processing-shell-refresh pnpm --dir web style:l1` 通过，2 个场景，覆盖签字人清空且日期保留；`pnpm --dir web lint` 通过；`pnpm --dir web css` 通过；`pnpm --dir web test` 通过，358 项。
- 下一步：如后续需要客户专属电子签章，应作为客户配置 / 打印模板扩展单独评审，不把电子签署状态写进当前 Product Core 打印草稿。
- 阻塞/风险：本轮不改 schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态；`手签留白` 只是当前窗口打印草稿动作，不代表电子签署、审批或业务事实过账。
