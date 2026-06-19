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

## 2026-06-19 业务列表空结果选中态回归

- 完成：按 `plush-page-design-governance` 继续推进无数据 / 空结果盲区；修复采购入库、来料质检、出货单、库存台账在重新加载列表后继续保留已不在当前结果集里的旧选中记录问题，当前记录不再匹配时改为当前结果第一条或清空，避免当前操作条显示 stale record。
- 完成：在 `style:l1` 的采购入库创建弹窗场景中新增空搜索回归：先选中 `PR-STYLE-L1`，再搜索无匹配，断言表格显示 `暂无采购入库单`、数据行清空、当前操作条回到未选中态、旧单号不留在操作条或表格里、空态不横向溢出且不覆盖相邻区域。
- 完成：按 `plush-docs-governance` 保持文档变更只落在 `progress.md`；本轮未新增 / 删除 / 重命名长期 Markdown，未改变文档标题、用途、分类或路径，不更新 `docs/文档清单.md`，`AGENTS.md` 只读未改。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`cd web && pnpm exec eslint --ext .mjs scripts/styleL1.mjs` 通过；`cd web && pnpm exec eslint --ext .jsx src/erp/pages/V1PurchaseReceiptsPage.jsx src/erp/pages/V1QualityInspectionsPage.jsx src/erp/pages/ShipmentsPage.jsx src/erp/pages/V1InventoryLedgerPage.jsx` 通过；`STYLE_L1_PORT=4191 STYLE_L1_SCENARIOS=purchase-receipt-create-modal-desktop pnpm style:l1` 通过，1 个场景；限定路径 `git diff --check` 通过；`progress.md` 更新前为 291 行、58313 字节，未达到归档阈值。
- 下一步：继续页面治理时，应先处理当前工作区 CSS 语法现场，再补来料质检、出货单、库存台账各自的空搜索 / 空筛选浏览器回归；不要把 stale selection 修复和菜单、RBAC、Workflow / Fact 或部署混做。
- 阻塞/风险：`STYLE_L1_PORT=4192 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 在进入业务页面前被非本轮 CSS 现场阻断，`pnpm css` 当前也因 `web/src/erp/styles/app/*.css` 的 `Unexpected } / Unclosed block` 失败；本轮不回退或整理这些非本轮样式拆分改动，也不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态。

## 2026-06-19 认证安全待办口径收窄

- 完成：按 `plush-docs-governance` 和 `plush-page-design-governance` 复核当前前端认证主路径，确认现状是浏览器侧 token 存储 + `Authorization: Bearer` JSON-RPC 请求，不是浏览器自动携带 Cookie 的登录态模型。
- 完成：更新 `web/README.md` 的主题 / 登录态说明，把 CSRF 从近期安全待办中移出；当前内部系统优先守住 token 不进日志 / trace / 文档 / 截图 / QA 报告、旧请求 wrapper 不回流、logout 不清空整个项目 localStorage。只有未来明确迁移到 HttpOnly Cookie 登录态时，才把 SameSite / CSRF、刷新机制和 API client 改造合并成专项评审。
- 验证：`rg -n -i "csrf|httponly|xss|localstorage\\.clear|axios request|request wrapper|react-cookies|旧请求|旧 wrapper|axios" --glob '*.md' --glob '!docs/reference/**' --glob '!docs/archive/**' --glob '!progress.md' .` 只命中 `web/README.md` 当前口径；`progress.md` 更新前为 275 行、55252 字节，未达到归档阈值。
- 下一步：旧请求清理不用继续扩成安全大专项；若要继续收口，优先做提交前工作区归属清理和目标 QA，而不是提前实现 Cookie / CSRF 体系。
- 阻塞/风险：本轮只改正式文档和过程记录，不改认证代码、schema、migration、RBAC、菜单、Workflow / Fact、部署、原型或安全架构；当前仍保留 localStorage token 的 XSS 风险面，但这是已知现状，不是本轮要一次性重构的内容。

## 2026-06-18 业务弹窗暗色移动端与来源导入焦点回归

- 完成：按 `plush-page-design-governance` 继续补上一轮共享业务表单弹窗治理的下一层盲区；采购入库创建弹窗的暗色桌面和移动端场景现在都会先验证键盘 Enter 打开、焦点进入弹窗、关闭后回到触发按钮，再继续验证边界值、滚动、暗色 token 和移动布局。
- 完成：按 `plush-docs-governance` 保持当前变更只落在既有回归脚本和过程记录；未新增长期文档、未改文档标题 / 路径 / 分类，不需要更新 `docs/文档清单.md`，也不修改 `business-form-page-standard-v1` 的 To Implement 原型状态。
- 完成：来源导入选择器作为业务表单内的 action modal，现在在 `style:l1` 中通过键盘打开，并断言 `aria-modal=true`、焦点进入选择器、导入完成后焦点回到父业务弹窗，取消关闭后焦点回到来源导入触发按钮；覆盖采购订单、销售订单和出货单中的来源导入路径。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`cd web && pnpm exec eslint --ext .mjs scripts/styleL1.mjs` 通过；`STYLE_L1_PORT=4185 STYLE_L1_SCENARIOS=purchase-receipt-create-modal-dark-desktop,purchase-receipt-create-modal-mobile pnpm style:l1` 通过，2 个场景；`STYLE_L1_PORT=4186 STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop,business-formal-module-shells-desktop pnpm style:l1` 通过，2 个场景；`git diff --check -- web/scripts/styleL1.mjs progress.md` 通过；`progress.md` 更新前为 223 行、43979 字节，未达到归档阈值。
- 下一步：如果继续推进“完美”级页面治理，下一块应选无权限 / 错误态 / 空态中的一个真实页面场景补浏览器级回归；不要和 schema、RBAC、Workflow / Fact 或部署改动混做。
- 阻塞/风险：本轮不改业务实现、schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态；当前工作区仍有大量非本轮并行改动，本轮只声明 `web/scripts/styleL1.mjs` 中上述目标断言和 `progress.md` 过程记录。

## 2026-06-18 共享业务表单弹窗键盘恢复治理

- 完成：按 `plush-page-design-governance` 继续推进上一轮销售订单弹窗后的共享影响面治理；`BusinessFormModal` 改为只聚焦可见控件，并在打开时记录触发元素、关闭后恢复焦点，避免部分复杂业务弹窗关闭后焦点掉到页面根部。
- 完成：扩展 `style:l1` 业务弹窗键盘回归，覆盖供应商、客户、产品、BOM、销售订单、来料质检、出货单、委外加工合同、采购订单以及采购入库创建弹窗；断言 Enter 打开、焦点进入弹窗、Tab 到达可操作控件、关闭后焦点回到触发按钮。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`cd web && pnpm exec eslint --ext .jsx src/erp/components/business-list/BusinessFormModal.jsx` 通过；`STYLE_L1_PORT=4284 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-order-date-filter-desktop,purchase-receipt-create-modal-desktop pnpm style:l1` 通过，3 个场景；`git diff --check -- web/src/erp/components/business-list/BusinessFormModal.jsx web/scripts/styleL1.mjs` 通过；`progress.md` 更新前为 190 行、37439 字节，未达到归档阈值。
- 下一步：如需进一步宣称全站业务弹窗完成，还应补移动端、暗色和更多非主路径 action modal 的目标场景；本轮优先锁住共享业务表单主路径。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态；`business-form-page-standard-v1` 仍是 To Implement 参照，未获明确确认不晋级 Current。当前工作区仍有部署 / 产品文档和 Dashboard L1 的并行改动，本轮只声明共享业务表单弹窗治理。

## 2026-06-18 Dashboard 关联记录浏览器回归

- 完成：按 `plush-page-design-governance` 的下一步，将 Dashboard 工作台“关联记录”从 helper 单测升级为真实浏览器回归；在 `erp-dashboard-desktop` 场景中创建正式销售订单来源任务和 `shipping-release` formal-shell 来源任务。
- 完成：验证正式来源任务在当前任务上下文中显示 `关联记录`，点击后进入 `/erp/sales/project-orders/sales-orders`，并带上 `link_keyword=SO-STYLE-L1`；验证 formal-shell 来源任务可见但不显示 `关联记录`，避免待接入预览页被伪装成真实业务入口。
- 完成：不新增 Dashboard 快捷入口，不改 `admin-command-center-v1` 原型状态，不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置或部署。
- 验证：`node --check web/scripts/styleL1.mjs` 通过；`cd web && pnpm exec eslint --ext .mjs scripts/styleL1.mjs` 通过；`STYLE_L1_SCENARIOS=erp-dashboard-desktop pnpm style:l1` 通过，1 个场景；`STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop pnpm style:l1` 通过，3 个场景；`node --test web/src/erp/utils/workflowDashboardStats.test.mjs` 通过，11 项；`progress.md` 修改前为 181 行、35638 字节，未达到归档阈值。
- 下一步：若继续推进页面治理，应选择下一个具体盲区，例如业务表单弹窗全量键盘 / 焦点回归、Dashboard 无权限 / 失败态，或 formal-shell 晋级正式 V1 前的领域 usecase / API / RBAC 接入评审；不要把这些合并成一次大改。
- 阻塞/风险：当前工作区仍有部署 / 文档类并行改动，本轮只触达 Dashboard L1 回归脚本和过程记录；未声明全量 `style:l1` 或全站页面治理完成。

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

## 2026-06-18 业务表单弹窗焦点标准同步

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 将运行时已验证的业务表单 Modal 焦点标准同步到 `business-form-page-standard-v1` 原型 README：打开后焦点进入第一个真实可操作控件，Tab 进入弹窗内控件，Escape / 关闭后焦点回到触发按钮，不把装饰节点或选择器外壳当焦点入口。
- 完成：同步 `docs/product/prototypes/README.md` 的“新建 / 编辑业务弹窗”参照范围，明确业务对象创建、编辑、查看统一走 Modal，并保留打开焦点、Tab、Escape / 关闭和焦点返回路径；未更改原型阶段，仍保持 To Implement。
- 验证：修改前 `progress.md` 为 198 行、39196 字节，未达到归档阈值；`cd web && pnpm exec node --test src/erp/config/devPrototypes.test.mjs` 通过，7 项；`rg -n "打开焦点|焦点回到触发按钮|Tab|Escape|业务表单" docs/product/prototypes/business-form-page-standard-v1/README.md docs/product/prototypes/README.md progress.md` 命中文档同步位置；`git diff --check` 通过。本轮只改现有 Markdown 正文和用途说明，不新增 / 删除 / 重命名长期文档，不改变标题、分类、路径或入口状态，因此不更新 `docs/文档清单.md`。
- 下一步：后续若继续推进业务表单弹窗，应优先把同一焦点标准挂到真实被调用的 L1 场景，而不是只在文档里扩散说明。
- 阻塞/风险：本轮不改运行时代码、schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或客户原始资料；AGENTS.md 只读取未修改。

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

## 2026-06-18 生产后端端口 loopback 收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 继续复核生产端口语义，确认当前主路径是外部业务流量进入前端 `5175`，前端容器通过 `/rpc` 反代到 Docker 网络内 `app-server:8300`；后端 HTTP / gRPC 宿主机端口不应默认对公网或办公网开放。
- 完成：生产 Compose 新增 `APP_HTTP_BIND_ADDR=127.0.0.1`、`APP_GRPC_BIND_ADDR=127.0.0.1`，并将 app-server 端口改为 `${APP_HTTP_BIND_ADDR:-127.0.0.1}:${APP_HTTP_PORT:-8300}:8300` 与 `${APP_GRPC_BIND_ADDR:-127.0.0.1}:${APP_GRPC_PORT:-9300}:9300`；`production-preflight.sh` 同步把两个 bind addr 列为必需变量并阻断非 loopback。
- 完成：同步 `README.md`、`docs/当前真源与交接顺序.md`、`docs/部署约定.md`、`server/deploy/README.md`、`server/deploy/compose/prod/README.md`、`scripts/README.md` 和本记录；`AGENTS.md` 只读未改，`docs/文档清单.md` 未改，因为没有新增、删除、重命名或重分类长期 Markdown。
- 验证：`bash -n scripts/deploy/production-preflight.sh` 通过；`bash scripts/deploy/production-preflight.sh --example` 通过并执行 `docker compose config -q`；`docker compose --env-file server/deploy/compose/prod/.env.example -f server/deploy/compose/prod/compose.yml config` 显示 app-server、PostgreSQL 和 Jaeger 的 `host_ip: 127.0.0.1`，前端 `5175` 仍作为外部入口；基于临时生产 `.env` 的正向 preflight 通过；`APP_HTTP_BIND_ADDR=0.0.0.0` 和 `APP_GRPC_BIND_ADDR=0.0.0.0` 负向检查均被拦截；限定路径 `git diff --check` 通过；`rg` 已确认新增端口口径。
- 下一步：真实发布仍必须用目标运行时 `.env` 跑 `production-preflight.sh --env-file ...`；如果后续确实需要远程直连后端 HTTP / gRPC，应先评审 VPN、SSH tunnel、内网网关或反代策略，不直接放开宿主机公网绑定。
- 阻塞/风险：本轮不执行线上部署、不运行 migration、不改 schema、RBAC、菜单、Workflow / Fact usecase、客户配置、前端页面或原型状态；当前工作区仍有大量非本轮并行改动，未提交、未推送。

## 2026-06-18 库存闭环验收口径

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 将截图里的“打通库存闭环”建议收口到正式能力证据，而不是新增页面或照抄流程图；新增 `docs/product/产品能力证据详情.md` 的 `库存闭环验收口径 / Inventory Closure Acceptance` 小节，明确库存闭环必须看入库 / 出库 / 冲正流水、余额 / 可用量、批次 / 质检状态和来源单据引用。
- 完成：补 Mermaid 主路径图，修正“采购需求”和“出货放行”误读：当前可用主路径是采购订单 / 采购入库来源 -> 采购入库过账 -> `inventory_txns.IN` / `inventory_balances` / `inventory_lots` -> 质检批次状态 -> 出货单 `SHIPPED` -> `inventory_txns.OUT` / `REVERSAL`；质检只改批次状态，不额外写库存增加流水。
- 完成：同步 `docs/product/产品能力进度台账.md` 的 Workflow / Fact 边界口诀，补充“页面存在或菜单可见不能单独证明库存闭环完成”。
- 验证：`progress.md` 更新前 172 行、33934 字节，未达到归档阈值；本轮只改既有 Markdown 正文和 progress，不新增、删除、重命名或重分类长期文档，不需要更新 `docs/文档清单.md`。
- 下一步：若要进入 runtime 验收，应按真实链路跑采购入库过账、质检判定、出货单 SHIPPED、库存台账回显和冲正路径；不要先做新的静态库存闭环页。
- 阻塞/风险：本轮不改 runtime、schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态；当前工作区仍有非本轮部署 / README 相关改动，未纳入本轮成果。

## 2026-06-18 业务弹窗焦点 L1 断言校准

- 完成：按 `plush-page-design-governance` 继续推进下一步，将 `business-formal-module-shells-desktop` 的 formal-shell 刷新提示断言从宽泛后半句改为默认匹配完整真实提示 `${heading}当前为待接入预览页，暂无远端数据刷新`；页面运行时未改。
- 完成：复核销售订单等正式业务页仍通过共享 `assertBusinessFormModalKeyboardRecovery` 覆盖打开焦点、Tab、Escape 关闭和焦点返回；不新增重复断言、不改原型阶段、不改 schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置或部署。
- 验证：本轮追加前 `progress.md` 为 206 行、40865 字节，未达到归档阈值；`node --check web/scripts/styleL1.mjs` 通过；`pnpm --dir web exec eslint --ext .mjs scripts/styleL1.mjs` 通过；`pnpm --dir web exec eslint --ext .mjs --ext .jsx scripts/styleL1.mjs src/erp/components/business-list/BusinessFormModal.jsx` 通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景；限定路径 `git diff --check` 通过。
- 下一步：若继续推进页面治理，优先选择真实缺口明确的场景，例如业务弹窗失败请求 / stale selected row 或 Dashboard 无权限 / 失败态；不要在已有共享焦点断言上重复堆测试。
- 阻塞/风险：本轮未跑全量 `pnpm lint`、`pnpm css`、`pnpm test` 或全量 `pnpm style:l1`；当前工作区仍有多组并行改动，未提交、未推送。

## 2026-06-18 出货放行协同任务接入

- 完成：按 `plush-page-design-governance` 将 `/erp/warehouse/shipping-release` 从纯字段预览推进到读取和处理 `source_type=shipping-release` 的 Workflow `shipment_release` 协同任务；完成 / 阻塞 / 催办只调用现有 `workflow` JSON-RPC 更新任务和业务状态投影，不写 shipment、库存、财务、发票或收付款事实。
- 完成：修复共享 `CollaborationTaskPanel` 动作抽屉的 `allowedActionModes` 传递，避免面板按钮可见但抽屉内无法提交；同步 `docs/当前真源与交接顺序.md`、`web/README.md` 和 `docs/product/产品能力证据详情.md` 的 Workflow 已接 / 事实未接边界。
- 完成：保留 `生产排程`、`生产异常` 为待接入预览页；不改 schema、migration、RBAC、菜单、WorkflowUsecase、Fact usecase、客户配置、部署或原型状态，`business-form-page-standard-v1` 仍是 To Implement 参考。
- 验证：本轮追加前 `progress.md` 为 206 行、40865 字节，未达到归档阈值；`pnpm --dir web exec node --test src/erp/utils/businessModuleNavigation.test.mjs` 通过，4 项；`node --check web/scripts/styleL1.mjs` 通过；`pnpm --dir web exec eslint --ext .jsx --ext .mjs src/erp/pages/FormalBusinessModulePage.jsx src/erp/components/business-list/BusinessListLayout.jsx src/erp/utils/businessModuleNavigation.test.mjs scripts/styleL1.mjs` 通过；`STYLE_L1_PORT=4293 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景；`git diff --check` 通过。
- 下一步：若继续推进，优先单独评审 `生产排程` 或 `生产异常` 的真实 source document / workflow 边界，不把它们和出货事实、库存事实合并。
- 阻塞/风险：出货放行本页任务完成仍不等于 `SHIPPED`；当前工作区仍有多组并行改动，未提交、未推送。

## 2026-06-18 正式菜单 R0 真源一致性收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 复核正式菜单下一步，确认 R0 前后端菜单真源一致性在代码中已经收敛；补 `TestBuiltinAdminMenusAlignCurrentRuntimeNavigation` 锁住后端 `BuiltinAdminMenus()` 的 `工作台`、`任务看板`、`业务看板`、`异常 / 阻塞闭环`、`应收管理` 和 `发票管理` label / path / required permission。
- 完成：同步 `docs/product/正式菜单运行时实施拆分清单.md`，将 R0 从“建议第一批真实代码任务”改为“已完成”，并明确后续应从 R1 低风险命名清理、R2 客户显隐决策或 R3 页面内 tab / 动作吸收中单独选择，不重复执行 R0。
- 验证：本轮追加前 `progress.md` 为 223 行、43979 字节，未达到归档阈值；`go test ./internal/biz ./internal/data` 通过；`pnpm --dir web exec node --test src/erp/config/seedData.test.mjs src/erp/config/menuPermissions.test.mjs` 通过，14 项；`rg` 未扫到 R0 旧待办 / 旧标签残留；限定路径 `git diff --check` 通过。
- 下一步：若继续推进正式菜单治理，优先单独评审 R1 命名清理或 R2 客户显隐，不把隐藏 formal-shell、改名、页面 tab 吸收混在同一轮。
- 阻塞/风险：本轮不改前端导航、客户菜单、路由、权限码、schema、migration、Workflow / Fact usecase、页面结构或原型状态；前后端跨语言菜单快照比对仍未建立。

## 2026-06-18 加工页业务页一致性收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 将 `/erp/purchase/processing-contracts` 加工页继续向正式业务页共享模式收口；搜索和排序变更会回到第一页，排序控件接入共享 toolbar class，主按钮接入共享 primary action class，选中条增加明细摘要和清空动作，行双击进入编辑弹窗。
- 完成：把状态动作从多枚横排按钮收口为“主动作 + 更多”模式，减少页面私有按钮噪音；保留“加工合同打印”为高频独立动作，不改变 Source Document / 加工合同源单语义，也不让确认下单写库存、质检、应付、发票、收付款或 Workflow 完成事实。
- 完成：补加工页 L1 断言，覆盖禁用的批量删除 / 回收站、列顺序弹窗、表头排序入口、状态动作收口、新建弹窗键盘恢复、双击编辑弹窗和加工明细入口；后端 JSON-RPC 测试补 `sort_by` / `sort_direction` 映射断言；共享列顺序表头下拉收口 popup 容器，并对 L1 shadow-root 环境下的 Ant 已知 trigger/popup root 警告做精确白名单。
- 验证：本轮追加前 `progress.md` 为 231 行、45840 字节，未达到归档阈值；`node --check web/scripts/styleL1.mjs` 通过；`pnpm --dir web exec eslint --ext .jsx --ext .mjs src/erp/pages/V1OutsourcingOrdersPage.jsx src/erp/components/business-list/ColumnOrderModal.jsx scripts/styleL1.mjs` 通过；`go test ./internal/service -run TestJsonrpcDispatcher_OutsourcingOrderAPISavesListsAndTransitions` 通过；`STYLE_L1_PORT=4300 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景；限定路径 `git diff --check` 通过。
- 下一步：若继续治理加工页，优先按真实使用频率评审导入来源、加工明细字段残值 / 缺值和失败请求恢复态，不把加工合同直接扩展成库存、质检或财务事实入口。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态；当前工作区仍有多组非本轮并行改动，未提交、未推送。

## 2026-06-18 毛绒默认工序候选收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 将甲方确认的 `查货 / 手工 / 车缝 / 包装` 收口为毛绒玩具行业默认工序候选；`processes` 仍是可扩展主数据，不把这些候选写成不可改枚举，也不把客户资料硬编码进 Product Core usecase。
- 完成：工序主数据页的环节名称和环节类别改为可选可输候选输入；core demo seed 增加带 `SIM-PLUSH-CORE` 前缀的默认候选工序，并保留可委外 / 可内制 / 需质检标记；加工合同 L1 验证工序下拉能看到这些可委外候选。
- 完成：同步当前真源、产品能力证据、业务主链路字段来源、正式菜单计划、脚本说明和业务页 / 业务弹窗原型 README；不新增文档、不改文档标题 / 路径 / 分类，不更新 `docs/文档清单.md`。
- 验证：本轮追加前 `progress.md` 为 249 行、50171 字节，未达到归档阈值；`node --check web/scripts/styleL1.mjs` 通过；`pnpm --dir web exec eslint --ext .jsx --ext .mjs src/erp/pages/V1MasterDataPage.jsx scripts/styleL1.mjs` 通过；`go test ./internal/data -run 'TestDefaultCoreDemoSeedDatasetIsSimulatedAndComplete|TestSeedCoreDemoDataUpsertsMinimalDataset'` 通过；`STYLE_L1_PORT=4301 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景；限定路径 `git diff --check` 通过。
- 下一步：如要继续补后端业务闭环，应单独评审生产路线、委外发料 / 回货、工序质检和结算，不把工序主数据候选直接扩展成事实写入。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置 loader、部署或真实客户导入；未跑全量 `pnpm test`、`pnpm css` 或全量 `style:l1`。

## 2026-06-19 来料质检列表表头降密度

- 完成：按 `plush-page-design-governance` 将 `/erp/production/quality-inspections` 默认列表从全字段平铺收口为可扫读列：保留质检单号、状态、判定、采购来源、物料批次、检验信息、更新时间和判定备注；采购入库单 / 入库行、材料 / 批次 / 仓库 / 原批次状态、检验时间 / 检验员改为组合展示，减少表头省略号。
- 完成：CSV 导出保留完整原始字段清单，避免屏幕列降密度导致追溯字段丢失；选中摘要改为显示批次可读标签；不改 schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置、部署或原型状态。
- 完成：补 `business-formal-module-shells-desktop` L1 断言，检查来料质检默认表头列名为合并后的业务列，且表头文字没有裁切；`progress.md` 更新前为 258 行、52024 字节，未达到归档阈值。
- 验证：`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景；`pnpm --dir web lint` 通过；`pnpm --dir web css` 通过；`pnpm --dir web test` 通过，358 项；限定路径 `git diff --check -- web/src/erp/pages/V1QualityInspectionsPage.jsx web/scripts/styleL1.mjs` 通过。
- 下一步：如果继续治理来料质检，优先评审真实详情 / 追溯浮层、失败请求恢复态、无权限态和长备注 / 多批次边界；不要把不合格处理直接扩展成采购退货或库存流水。
- 阻塞/风险：本轮只做前端展示降密度和回归断言；未跑后端 Go、migration、部署检查、真实写入 smoke 或全量 `pnpm style:l1`。当前工作区仍有多组非本轮并行改动，未提交、未推送。

## 2026-06-19 正式菜单 R1 命名清理收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 继续正式菜单治理，确认运行时已经使用 `产品档案` 和 `BOM 管理`；扩展 `TestBuiltinAdminMenusAlignCurrentRuntimeNavigation`，锁住后端内置菜单的 `products` / `material-bom` label、path 和 required permission。
- 完成：同步 `docs/product/正式菜单运行时实施拆分清单.md`，将 R1 从“低风险命名清理待办”改为“已完成”；同步 `docs/product/菜单映射评审表.md`、`docs/product/prototypes/business-module-page-standard-v1/README.md` 和 `docs/customers/yoyoosun/试用培训说明.md`，避免继续把 `产品` / `材料 BOM` 写成当前可见菜单名。
- 验证：本轮追加前 `progress.md` 为 267 行、53778 字节，未达到归档阈值；`go test ./internal/biz` 通过；`pnpm --dir web exec node --test src/erp/config/seedData.test.mjs src/erp/config/menuPermissions.test.mjs` 通过，14 项；目标文档 `rg` 未扫到 `产品` / `材料 BOM` 旧可见菜单口径；限定路径 `git diff --check` 通过。
- 下一步：正式菜单治理剩余项转入 R3 页面内 tab / 动作吸收；不把客户菜单隐藏、页面结构和事实 usecase 混在同一轮。
- 阻塞/风险：本轮不改 route、客户菜单显隐、权限码、schema、migration、Workflow / Fact usecase、页面结构、部署或原型状态；`material-bom` 作为稳定 route / key 继续保留，不等于可见菜单仍叫“材料 BOM”。

## 2026-06-19 正式菜单 R2 客户显隐收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 继续正式菜单治理，确认当前 yoyoosun 客户菜单已经保留 `任务看板` 和 `异常 / 阻塞闭环`；补 `seedData.test.mjs` 断言 yoyoosun 配置生成的桌面菜单包含 `/erp/task-board` 和 `/erp/operations/exceptions`。
- 完成：同步 `docs/product/正式菜单运行时实施拆分清单.md` 和 `docs/product/菜单映射评审表.md`，将 R2 从“恢复或隐藏待决策”改为“已显示”；后续若要隐藏，必须单独确认工作台、岗位任务端、任务看板和异常处理替代路径。
- 验证：本轮追加前 `progress.md` 为 283 行、56906 字节，未达到归档阈值；`pnpm --dir web exec node --test src/erp/config/seedData.test.mjs src/erp/config/menuPermissions.test.mjs` 通过，15 项；`go test ./internal/biz` 通过；目标文档 `rg` 未扫到客户显隐旧口径或旧可见菜单名残留；限定路径 `git diff --check` 通过。
- 下一步：正式菜单治理剩余项转入 R3 页面内 tab / 动作吸收，但必须按具体页面单独闭环，不把多个事实域一次性塞进同一轮。
- 阻塞/风险：本轮不改后端 RBAC、route、权限码、schema、migration、Workflow / Fact usecase、页面结构、部署或原型状态；菜单显隐仍只是前端入口配置，不是安全边界。

## 2026-06-19 加工模块单一职责收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 将 `查货 / 手工 / 车缝 / 包装` 明确为工序候选，不作为质检结果；加工合同页只保留加工合同源单、工序明细、状态流转和打印，不在当前操作区承接质检、库存或应付跨模块处理入口。
- 完成：工序档案表单补“需质检只是后续质检提示”的字段说明；加工合同页头、选中操作条、表单描述和工序字段说明补“查货只是加工环节，判定结果回质检模块”；同步业务主链路字段来源、当前真源、产品能力证据、正式菜单计划和业务页 / 业务弹窗原型 README。
- 完成：L1 回归断言加工合同页展示查货边界、选中记录后不出现跨模块“关联”下拉、工序档案和加工合同弹窗都显示对应边界说明；不新增文档、不改标题 / 路径 / 分类，不更新 `docs/文档清单.md`。
- 验证：本轮追加前 `progress.md` 为 300 行、60531 字节，未达到归档阈值；`node --check web/scripts/styleL1.mjs` 通过；`pnpm --dir web exec eslint --ext .jsx --ext .mjs src/erp/pages/V1OutsourcingOrdersPage.jsx src/erp/pages/V1MasterDataPage.jsx scripts/styleL1.mjs` 通过；`STYLE_L1_PORT=4302 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1` 通过，1 个场景；`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过，前端 test 359 项；限定路径 `git diff --check` 通过。
- 下一步：如要继续补加工业务闭环，单独评审委外发料 / 回货、工序质检联动和结算，不把这些事实写进加工合同源单页。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置 loader、部署或真实客户导入；后端 seed 候选已存在，本轮只补模块边界和页面语义。

## 2026-06-19 前端大文件职责拆分

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 收口大文件职责，将 `web/src/erp/styles/app.css` 拆成 5 行 import 入口和 `src/erp/styles/app/` 下的 `shell-dashboard.css`、`dev-surfaces.css`、`print-surfaces.css`、`business-surfaces.css`、`theme-overrides.css`；拆分按顶层 CSS 规则闭合点生成，保留原加载顺序。
- 完成：将 `web/scripts/styleL1.mjs` 的 admin/auth/masterdata/purchase/quality/inventory/workflow/PDF mock 安装层抽到 `web/scripts/style-l1/adminRpcMocks.mjs`；主脚本保留场景、断言和执行器入口，`pnpm style:l1`、场景名称和现有页面断言不改。
- 完成：同步 `web/README.md` 的样式入口说明；顺手修正加工合同 L1 工序下拉断言，改为按 AntD label 定位表单项，避免 `extra` 说明让 `.ant-form-item` 文本不可能严格等于 `工序`。
- 验证：本轮追加前 `progress.md` 为 309 行、62128 字节，未达到归档阈值；`node --check web/scripts/styleL1.mjs`、`node --check web/scripts/style-l1/adminRpcMocks.mjs`、`pnpm --dir web exec eslint --ext .mjs scripts/styleL1.mjs scripts/style-l1/adminRpcMocks.mjs`、`pnpm --dir web css` 均通过；`STYLE_L1_PORT=4312 STYLE_L1_SCENARIOS=erp-dashboard-desktop,business-formal-module-shells-desktop,print-center-desktop,purchase-receipt-create-modal-desktop pnpm --dir web style:l1` 通过，4 个场景。首次使用 4302 端口时因端口占用失败，已换端口复跑通过。
- 下一步：如继续处理大文件，优先单独拆 `styleL1.mjs` 的场景索引 / 断言 helper，或按业务域继续拆仍超过 3k 行的 CSS partial；不要把后端 usecase、schema、部署和页面结构重构混在同一轮。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置 loader、部署、后端 JSON-RPC 或真实业务写入；未跑全量 `pnpm style:l1`、全量 `pnpm test`、后端 Go 测试或部署检查。当前工作区仍有多组非本轮并行改动，未提交、未推送。

## 2026-06-19 全局大文件职责拆分续做

- 完成：继续按 `plush-page-design-governance` 和 `plush-docs-governance` 做全局大文件治理；`V1MasterDataPage.jsx` 抽出 `components/master-data/MasterDataForm.jsx`，表单字段、联系人行、单位选择和文本候选输入从页面壳分离，页面保留数据流、弹窗状态和操作编排。
- 完成：将 `business-surfaces.css`、`dev-surfaces.css`、`print-surfaces.css`、`shell-dashboard.css` 按页面职责继续拆成 app CSS partial；保留 `theme-overrides.css` 单文件，因为暗色覆盖依赖一组跨文件 stylelint disable/enable 与原始层叠顺序，机械切分会提高风险。
- 完成：将 `inventory_repo_test.go`、`inventory_postgres_test.go`、`workflow_repo_test.go`、`workflow_test.go` 按采购入库 / 退货 / 调整 / 质检 / workflow 场景拆为多文件测试；共享 fixture/helper 留在原包内复用，不改 repo/usecase 行为。
- 完成：将 `styleL1.mjs` 的颜色识别、对比度和 focus ring 断言抽到 `web/scripts/style-l1/colorAssertions.mjs`；场景数组、浏览器 runner、mock 行为和 `style:l1` 命令入口保持不变。
- 验证：本轮追加前 `progress.md` 为 318 行、64586 字节，未达到归档阈值；`pnpm --dir web exec eslint --ext .jsx src/erp/pages/V1MasterDataPage.jsx src/erp/components/master-data/MasterDataForm.jsx` 通过；`pnpm --dir web css` 通过；`node --check web/scripts/styleL1.mjs` 和 `node --check web/scripts/style-l1/colorAssertions.mjs` 通过；`go test ./internal/data -run 'TestInventory(MasterDataCodeUnique|Repo_|TxnRejectsHistoricalDelete|QuantityGeneratedTypeIsDecimal)|TestPhase2(Postgres|A|B|C|D|DB|DC2)|TestOperationalFactPostgres|TestWorkflowRepo_(Create|Get|Update|OrderRevision|PurchaseIQC|WarehouseInbound|OutsourceReturnQC|FinishedGoods|ShipmentRelease|Upsert|Urge)'` 通过；`go test ./internal/biz -run 'TestWorkflowUsecase_(PurchaseIQC|WarehouseInbound|OutsourceReturnQC|FinishedGoods|ShipmentRelease|SameNameNonPurchaseIQCTask|SameNameNonWarehouseInboundTask|SameNameNonOutsourceReturnQCTask|SameNameNonFinishedGoods|SameNameNonShipmentReleaseTask)'` 通过；`STYLE_L1_PORT=4189 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,print-center-desktop,dev-hub-dark-desktop pnpm --dir web style:l1` 通过，3 个场景；`git diff --check` 通过。
- 下一步：剩余大文件优先按业务风险单独拆，例如 `V1SalesOrdersPage.jsx`、`V1PurchaseOrdersPage.jsx`、`OperationalFactsPage.jsx`、导入脚本和核心 usecase；这些文件包含真实状态编排或业务边界，不应在同一轮继续做无测试支撑的机械切分。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署、正式文档入口或真实业务写入；未跑全量 `pnpm test`、全量 `pnpm style:l1`、全量 Go 测试或部署检查。

## 2026-06-19 全局大文件复查与 Boss approval 测试拆分

- 完成：再次按 `plush-page-design-governance` 和 `plush-docs-governance` 复查大文件治理状态，确认上一轮已完成多处安全拆分，但“全局所有大文件一次做完”仍未完全达成。
- 完成：将 `server/internal/biz/workflow_test.go` 中 Boss approval 规则测试迁出到 `server/internal/biz/workflow_boss_approval_test.go`，保留原有 helper / stub 复用，不改 `WorkflowUsecase` 行为、不改断言语义；`workflow_test.go` 从 1480 行降到 1191 行。
- 完成：复查 `web/scripts/style-l1/adminRpcMocks.mjs`，确认它是 L1 的多 RPC route mock 真源，直接拆分会牵涉共享 mock 数据、页面回归契约和大量 route 安装器；本轮不为降行数继续打散。
- 验证：本轮追加前 `progress.md` 为 328 行、67510 字节，未达到归档阈值；`go test ./internal/biz -run 'TestWorkflowUsecase_(BossApproval|NonBossApproval|SameNameNonBossApproval|PurchaseIQC|WarehouseInbound|OutsourceReturnQC|FinishedGoods|ShipmentRelease|SameNameNonPurchaseIQCTask|SameNameNonWarehouseInboundTask|SameNameNonOutsourceReturnQCTask|SameNameNonFinishedGoods|SameNameNonShipmentReleaseTask)'` 通过；`git diff --check` 通过。
- 下一步：剩余大文件应按单独业务闭环继续拆：`styleL1.mjs` / `adminRpcMocks.mjs` 需要先定义 mock route 分层，销售 / 采购 / 运营事实页面需要对应页面 L1 回归，`workflow.go` 和导入脚本需要先做 usecase / 导入链路边界评审。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、页面结构、Workflow / Fact usecase、客户配置、部署或正式文档入口；未跑全量 `pnpm test`、全量 `pnpm style:l1`、全量 Go 测试或部署检查。

## 2026-06-19 全局大文件职责拆分收口

- 完成：继续按 `plush-page-design-governance` 和 `plush-docs-governance` 收口本批大文件；`styleL1.mjs` 继续拆出 `style-l1/scenarios.mjs`、`style-l1/mobileTaskAssertions.mjs` 和 `style-l1/printAssertions.mjs`，`adminRpcMocks.mjs` 拆成 system / masterData / order / fact route mock 安装器，主 L1 脚本保留 runner、通用断言和少量跨场景 helper。
- 完成：销售、采购、运营事实页面按页面职责拆分：销售订单表单迁入 `components/sales-orders/SalesOrderForm.jsx`，采购订单表单迁入 `components/purchase-orders/PurchaseOrderForm.jsx`，运营事实动作表单和建参 helper 迁入 `components/operational-facts/OperationalFactForms.jsx`；页面壳保留列表、选择、弹窗状态、保存和业务动作编排。
- 完成：`workflow.go` 按 Workflow 规则边界拆出 `workflow_task_matchers.go`、`workflow_derived_tasks.go`、`workflow_side_effects.go`、`workflow_downstream_tasks.go`、`workflow_payload_helpers.go`；主文件保留状态字典、类型、repo 接口和 usecase 编排，不改 Workflow / Fact 边界。
- 完成：修正 L1 工序候选断言的 AutoComplete 弹层读取方式，先打开候选列表再按需过滤，避免 AntD popup 时序导致默认候选误判；不改变页面候选数据来源。
- 验证：本轮追加前 `progress.md` 为 337 行、69309 字节，未达到归档阈值；`node --check` 覆盖 `styleL1.mjs`、`scenarios.mjs`、`mobileTaskAssertions.mjs`；脚本与页面定向 ESLint 通过；`pnpm --dir web css` 通过；`pnpm --dir web test` 通过，359 项；`go test ./...` 通过；`STYLE_L1_PORT=4332 STYLE_L1_SCENARIOS=erp-dashboard-desktop,business-formal-module-shells-desktop,mobile-tasks-dark,print-center-desktop pnpm --dir web style:l1` 通过，4 个场景；`git diff --check` 通过。
- 下一步：本批已按职责完成高风险大文件收口；剩余仍较大的运行文件如 `theme-overrides.css`、`V1OutsourcingOrdersPage.jsx`、`V1QualityInspectionsPage.jsx`、`MaterialPurchaseContractWorkbench.jsx`、`printPdf.mjs` 等应按后续具体业务 / 样式回归单独拆，不建议为了行数继续硬切。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、客户配置、部署或真实业务写入；`style-l1/scenarios.mjs` 仍是 4600 行级场景注册表，属于 L1 场景索引职责，后续若继续拆应按场景域分组并补对应 smoke。

## 2026-06-19 业务看板核心链路健康收口

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 将 `/erp/business-dashboard` 的表格从 3 个基础对象扩展为低密度对象族：客户/供应商、产品/BOM、销售订单、采购/入库、质检/库存、出货/出库、生产/委外、财务事实；表格标题改为“核心链路健康”，列名改为“对象族”。
- 完成：保留 `dashboardModules` 作为 Workflow 任务来源解析的单对象入口，新增 `dashboardHealthModules` 供业务看板聚合展示；`buildDashboardModuleRows` 支持按 `sourceKeys` 汇总后端已有 `dashboard_stats` projection，不新增 API、RBAC、schema、migration 或事实写入。
- 完成：同步业务管理中心原型 README 的当前运行时口径，说明运行时按后端已有 projection keys 聚合为对象族，不是只显示 3 个基础对象，也不是铺满完整菜单；不新增文档、不改标题 / 路径 / 分类，不更新 `docs/文档清单.md`。
- 验证：本轮追加前 `progress.md` 为 337 行、69309 字节，未达到归档阈值；`pnpm --dir web exec node --test src/erp/utils/dashboardStats.test.mjs src/erp/utils/workflowDashboardStats.test.mjs` 通过，12 项；`pnpm --dir web test` 通过，360 项；`pnpm --dir web css` 通过；定向 ESLint 覆盖业务看板页面、配置、聚合工具、测试和 L1 脚本通过；`STYLE_L1_PORT=4337 STYLE_L1_SCENARIOS=erp-business-dashboard-desktop,erp-business-dashboard-dark-desktop,erp-business-dashboard-mobile pnpm --dir web style:l1` 通过，3 个场景；`git diff --check` 通过。
- 下一步：如要继续增强业务看板，应先评审后端各 projection 的统计口径，尤其库存 / 财务 / 质检是否需要独立只读 read model；不要在前端伪造未返回的业务事实数量。
- 阻塞/风险：本轮只改业务看板前端聚合、L1 断言和原型说明；不改正式菜单、客户菜单、权限码、后端 usecase、Workflow / Fact 边界、部署或真实业务写入。

## 2026-06-19 中高收益大文件继续拆分

- 完成：继续按 `plush-page-design-governance` 和 `plush-docs-governance` 收口大文件职责；`styleL1.mjs` 新增采购入库断言模块，委外订单页抽出 `OutsourcingOrderForm`，来料质检页抽出创建 / 判定表单和提交参数 helper。
- 完成：页面仍保留 API 编排、权限、筛选、表格、弹窗状态和生命周期动作；表单组件只承接字段、明细行、快照带值、行汇总和提交参数边界，不改变 JSON-RPC、Workflow / Fact 或真实业务写入。
- 验证：本轮追加前 `progress.md` 为 356 行、73864 字节，未达到归档阈值；定向 ESLint 覆盖委外订单、质检页面和新表单组件通过；`node --check` 与定向 ESLint 覆盖 `styleL1.mjs`、`purchaseReceiptAssertions.mjs`、`scenarios.mjs` 通过；`pnpm --dir web css` 通过；`pnpm --dir web test` 通过，360 项；`go test ./...` 通过；`STYLE_L1_PORT=4343 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-receipt-create-modal-desktop,purchase-receipt-add-item-modal-desktop pnpm --dir web style:l1` 匹配并通过 2 个真实场景，随后用实际场景名 `STYLE_L1_PORT=4344 STYLE_L1_SCENARIOS=purchase-receipt-add-item-modal-draft-desktop pnpm --dir web style:l1` 补跑添加明细弹窗通过；`git diff --check` 通过。
- 下一步：`style-l1/scenarios.mjs` 和 `theme-overrides.css` 仍偏大，但前者是 L1 场景注册表、后者是全局主题覆盖真源；下一轮应按场景组 / token 分区配合真实视觉回归拆，不建议只为行数硬切。`V1MasterDataPage.jsx` 仍可按主数据域继续拆。
- 阻塞/风险：未提交；本轮只改手写前端页面、表单组件、L1 断言和进度记录，不触碰生成代码、schema、migration、RBAC、菜单、部署或真实客户资料。

## 2026-06-19 业务页初始选择清空修复

- 完成：按 `plush-page-design-governance` 和 `plush-docs-governance` 定位业务页进入后默认勾选第一条的原因；`V1MasterDataPage` 和 `V1SalesOrdersPage` 的加载保持逻辑在空选择时回退到第一条记录，已改为只有当前显式选择仍存在于新结果时才保留，否则清空。
- 完成：同步收口采购入库、出货、来料质检和库存台账的“当前记录消失后回退第一条”逻辑，筛选 / 分页后原选择不在当前结果时不再替用户选中新结果第一条；新增 `assertBusinessMainTableInitialSelectionEmpty` L1 断言，锁住材料、销售订单、采购入库、采购订单和出货单初始无选中态。
- 验证：本轮追加前 `progress.md` 为 364 行、75726 字节，未达到归档阈值；临时 Playwright 探针确认材料、销售订单、采购入库、采购订单和出货单初始 `checked=0`、选中行数为 0、当前操作区为空态；定向 ESLint 覆盖本轮页面文件通过；全量只读 `pnpm --dir web exec eslint --ext .js --ext .jsx src/` 通过；`pnpm --dir web css` 通过；`pnpm --dir web test` 通过，360 项；`STYLE_L1_SCENARIOS=material-master-header-desktop,business-formal-module-shells-desktop,purchase-receipts-table-control-columns-desktop,purchase-order-date-filter-desktop,shipment-date-filter-desktop pnpm --dir web style:l1` 通过，5 个场景；`git diff --check` 通过。
- 下一步：如还有其他具体页面出现“进入即选中”，先按同一口径检查是否存在本地默认选中、数据加载回退第一条或第三方控件视觉焦点误判，不在前端补造业务事实。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署、正式文档口径或真实业务写入；未跑全量 `pnpm style:l1`、后端 Go 测试或部署检查。

## 2026-06-19 PostgreSQL 测试拆分命名收口

- 完成：推送前置 `phase-label-boundaries` 拦截新拆出的 PostgreSQL 测试文件继续使用历史 `phase2*` 标签；已将 `inventory_postgres_phase2b_test.go` 改名为 `inventory_postgres_lot_bom_test.go`，并把拆出测试中的函数名、source_type 与幂等 key 收口为库存批次、BOM、采购入库、采购退货、采购调整和来料质检业务场景命名。
- 完成：旧 `phase2*` PostgreSQL helper 仍保留在允许的兼容入口 `inventory_postgres_test.go`，新增业务名 wrapper 供拆分后的活跃测试调用；不扩大边界检查白名单，不改脚本外部兼容入口。
- 验证：本轮追加前 `progress.md` 为 372 行、77655 字节，未达到归档阈值；`node scripts/qa/phase-label-boundaries.mjs` 通过；`go test ./internal/data` 通过。
- 下一步：后续若继续迁移历史 PostgreSQL 脚本，应作为单独任务评审脚本名、环境变量和文档兼容边界。
- 阻塞/风险：本轮只修复活跃测试命名和 wrapper，不改 schema、migration、真实数据源、库存 / 采购 / 质检 usecase 语义或部署脚本。

## 2026-06-19 L1 场景过滤与场景组拆分

- 完成：修复 `STYLE_L1_SCENARIOS` 拼错场景名时静默漏跑的问题，缺失场景现在直接失败并列出可用场景；抽出 `businessFormModalAssertions.mjs`，通用业务弹窗键盘 / 焦点恢复断言不再归属采购入库模块。
- 完成：按清晰边界拆出 `purchaseReceiptScenarios.mjs` 和 `businessFormalScenarios.mjs`；`scenarios.mjs` 从 4610 行降到 3564 行，保留场景注册和组装职责。
- 验证：追加前 `progress.md` 为 380 行、78826 字节，未达到归档阈值；脚本 `node --check`、定向 ESLint、`pnpm --dir web css`、`pnpm --dir web test`、`git diff --check` 通过；采购入库 3 个核心 L1 场景和 `business-formal-module-shells-desktop` 通过；故意传入不存在的 `purchase-receipt-add-item-modal-desktop` 已按预期失败并列出可用场景。
- 下一步：低优先级大文件只要职责边界清楚可暂不拆；若继续拆，优先评审 `theme-overrides.css` 的主题 token / AntD 覆盖分区，或按主数据域拆 `V1MasterDataPage.jsx`。
- 阻塞/风险：未提交；不改页面运行时、schema、migration、RBAC、菜单、Workflow / Fact、客户配置或正式 Markdown 文档。

## 2026-06-19 工作台队列筛选视觉降级

- 完成：将 `/erp/dashboard` 工作台「待我处理 / 阻塞/逾期 / 等待交接」从三等分大 tab / 指标卡视觉降级为紧凑筛选 chip；保留队列筛选、计数、active 态和 `aria-pressed`，把原 hint 收口到按钮 `aria-label`。
- 完成：同步浅色、暗色和移动端样式；暗色 active 计数徽标改为深色文字，避免亮色背景白字低对比。
- 验证：本轮追加前 `progress.md` 为 388 行、80076 字节，未达到归档阈值；`pnpm --dir web exec eslint --ext .jsx src/erp/pages/DashboardPage.jsx` 通过；`pnpm --dir web css` 通过；`STYLE_L1_PORT=4352 STYLE_L1_SCENARIOS=erp-dashboard-desktop,erp-dashboard-dark-desktop,erp-dashboard-mobile pnpm --dir web style:l1` 通过，3 个场景；首次 L1 暗色场景暴露低对比后已修复并复跑通过。
- 下一步：如继续调整工作台首屏，应优先按队列、当前任务上下文和关联记录三层信息关系评审，不把队列筛选重新做成页面级 tab。
- 阻塞/风险：本轮只改前端可见样式和可访问标签，不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、部署、正式原型状态或业务事实写入。
