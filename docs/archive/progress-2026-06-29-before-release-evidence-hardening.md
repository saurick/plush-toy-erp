# progress archive 2026-06-29 before release evidence hardening

本文件归档 `progress.md` 中 2026-06-28 客户配置 runtime manifest、发布执行器、dev-only 页面治理、Workflow action 合同、导入与发布证据前置门禁等过程记录。归档内容只作为过程追溯，不是当前正式需求、数据模型或部署真源。

## 2026-06-28 客户配置 runtime manifest 编译门禁

- 完成：新增 `scripts/qa/customer-config-runtime-manifest.mjs`，将已跟踪的 `config/customers/yoyoosun/customerPackage.mjs` 编译为后端 `customer_config.validate_customer_config / publish_customer_config` 可验证的 JSON-RPC payload 形状。
- 完成：manifest 覆盖模块状态、角色画像、授权、责任池、责任池成员、页面投影和字段策略；锁住 `purchase -> purchasing` 后端角色 key 映射，并禁止 secret、token、password、SQL、Go、JS、raw rows / records 等 payload。
- 完成：后端 `get_effective_session` 页面投影改为后端 RBAC 菜单与 active revision `compiled_snapshot.pages` 的交集，只允许客户配置收窄页面，不允许扩大权限。
- 完成：将 runtime manifest 检查和测试接入 `scripts/qa/fast.sh` / `scripts/qa/strict.sh`，同步 `scripts/README.md`、`config/README.md`、`config/customers/yoyoosun/README.md`、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md`、`server/README.md` 和 `web/README.md`。
- 验证：`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/customer-package-lint.test.mjs`、`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun`、`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile`、`bash -n scripts/qa/fast.sh scripts/qa/strict.sh`、`go test ./internal/biz ./internal/service`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：若继续推进完整部署导入版，应进入正式 upload / import job、后端审批与审计、真实导入幂等和失败恢复、生产 preflight、备份恢复、回滚演练和目标环境 smoke 专项。
- 阻塞/风险：本轮仍不上传文件、不调用后端 publish、不 activate、不 rollback、不执行真实导入、不部署、不跑目标环境 migration；manifest 是可验证 payload 形状，不等于生产生效证据。

## 2026-06-28 客户配置 activation gate

- 完成：新增 `scripts/deploy/customer-config-activation-gate.mjs`，在客户配置 revision 激活前组合校验 runtime manifest 与 release evidence；manifest 必须匹配 `yoyoosun` 和 `yoyoosun-customer-package-v1.runtime-manifest-v1`，release evidence 必须通过发布证据门禁。
- 完成：将 activation gate 测试接入 `scripts/qa/fast.sh` / `scripts/qa/strict.sh`，并同步 `scripts/README.md`、`deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/product/自动化测试策略.md`。
- 下一步：若要真正上线激活，需要先生成本次 manifest、完成目标环境 release evidence、备份恢复演练、migration、smoke 和 sign-off，再由后端 `activate_customer_config` 执行真实激活。
- 阻塞/风险：activation gate 只做激活前证据校验，不连接后端、不 activate、不 rollback、不执行 migration、不导入业务数据、不替代目标环境发布。

## 2026-06-28 客户配置 release executor

- 完成：新增 `scripts/deploy/customer-config-release-execute.mjs`，默认只生成客户配置发布计划报告；显式 `--execute`、backend URL、管理员 token / 账号密码和确认短语后，才通过既有 `customer_config` JSON-RPC 执行 validate / publish，带 `--activate` 时先复用 activation gate 再调用 activate，publish 已完成时可用 `--activate-only` 只重试激活。
- 完成：补充 `scripts/deploy/customer-config-release-execute.test.mjs`，覆盖 help、参数解析、report-only 不访问后端、缺确认短语拒绝、activate 必须带 evidence、mock JSON-RPC 调用 validate / publish / activate 顺序，以及 `--activate-only` 只调用 activate；并接入 `scripts/qa/fast.sh` / `scripts/qa/strict.sh`。
- 完成：强化 activation gate，要求 release evidence 目录包含 `customer-config-manifest-evidence.json`，用 `manifestSha256`、revision 和脱敏审查状态把发布证据绑定到具体 runtime manifest；release executor 报告同步输出 manifest sha256。
- 完成：新增 `scripts/deploy/customer-config-manifest-evidence.mjs`，从已编译 runtime manifest 生成脱敏 fingerprint evidence，并可用 release executor report 交叉校验 hash；对应测试接入 `fast.sh` / `strict.sh`。
- 完成：同步 `scripts/README.md`、`deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/product/自动化测试策略.md`。
- 下一步：若继续推进真实部署，应在目标环境完成 production preflight、migration、smoke、备份恢复和 sign-off 后，用该执行器的 `--execute` 模式发布 / 激活；真实客户业务数据导入仍走 import dry-run / approval / execution loader 专项。
- 阻塞/风险：该执行器不上传 raw 客户文件、不直写数据库、不生成 migration、不导入业务数据、不写 Workflow / Fact runtime；没有目标后端、管理员凭据和发布证据时只能生成本地计划报告。

## 2026-06-28 /__dev 视觉语义治理

- 完成：按 `plush-page-design-governance` 将 `/__dev` 相关页的 action / summary / read 视觉语义拆开；开发导航“进入”改为明确按钮样式，治理、测试、原型列表项补 action 识别线，客户配置“决策卡”保持静态摘要，“下一步”改为蓝色操作入口。
- 完成：补充暗色主题覆盖和 `dev-ui-semantics-desktop` L1 场景，锁住按钮、可选择项、置顶图标、只读任务卡、客户配置摘要卡和操作入口的 cursor、边框、底色与识别线差异。
- 完成：针对客户配置截图里“未选中 tab 像普通文字”的问题，统一治理客户配置、能力台账、测试入口和原型查看器里的 Segmented / 筛选切换控件；未选中项也必须有按钮盒模型、边框、底色和 pointer，选中态通过蓝色底色与左侧识别线强化。
- 完成：新增 `dev-switch-controls-dark-desktop` L1 场景，覆盖客户配置视图切换、能力台账视图切换、测试文档筛选、测试阅读器切换和原型筛选的暗色 computed style 语义。
- 完成：将客户配置 `工具边界 / Tools` 改为 `导入工作台 / Import`，页面内展示可视化导入流程、测试版 UI Dry Run、写库目标和正式导入门禁；当前可执行动作只生成本地 evidence，不写数据库。
- 完成：导入工作台明确区分测试 Dry Run、客户配置 publish / activate、真实客户业务数据导入三类动作；正式写库目标展示为目标环境 ERP 应用数据库和 `customer_config_revisions` 等配置表，但不提供发布 / 激活 / 正式导入按钮。
- 完成：修正测试版 UI Dry Run 结果区只有单个按钮的问题；Dry Run 成功后提供重新运行、复制输出目录、复制报告路径、查看 / 收起报告摘要 4 个后续操作，并将报告摘要从本地 dry-run report 回显到 UI。
- 完成：修正暗色模式下 Dry Run 指标卡和输出路径卡白底浅字的问题；结果指标、路径面板和报告预览在暗色主题下统一使用深色 surface 和可读文字。
- 完成：新增客户配置测试环境应用主路径；`/__dev/customer-config` 可编译受控 runtime manifest，并用当前管理员登录态调用后端 `validate_customer_config / publish_customer_config / activate_customer_config / get_effective_session`，让后台和岗位任务端读取测试 active revision。
- 完成：测试环境应用明确只写客户配置控制面表，不上传 raw 包、不直写数据库、不提供正式发布裸按钮、不导入真实客户业务数据；同步 `docs/当前真源与交接顺序.md`、`web/README.md` 和 `config/customers/yoyoosun/README.md`。
- 验证：`/usr/local/bin/pnpm --dir web css`、`/usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx scripts/style-l1/scenarios.mjs`、`STYLE_L1_SCENARIOS=dev-hub-dark-desktop,dev-all-pages-mobile,dev-ui-semantics-desktop,dev-governance-dark-desktop,dev-prototypes-dark-desktop,dev-testing-dark-desktop,dev-customer-config-dark-desktop,dev-customer-config-mobile /usr/local/bin/pnpm --dir web style:l1`、`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test`、`git diff --check` 通过；`http://127.0.0.1:5175/__dev/customer-config?customer=yoyoosun` 抽检确认决策卡 cursor 为 default、下一步入口 cursor 为 pointer 且底色不同。
- 验证：`STYLE_L1_SCENARIOS=dev-switch-controls-dark-desktop,dev-customer-config-dark-desktop /usr/local/bin/pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=dev-hub-dark-desktop,dev-all-pages-mobile,dev-ui-semantics-desktop,dev-switch-controls-dark-desktop,dev-governance-dark-desktop,dev-prototypes-dark-desktop,dev-testing-dark-desktop,dev-customer-config-dark-desktop,dev-customer-config-mobile /usr/local/bin/pnpm --dir web style:l1`、`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test` 和 `git diff --check` 通过；`http://127.0.0.1:5175/__dev/customer-config?customer=yoyoosun` 暗色抽检确认每个切换项均为 solid 边框、非透明底色和 pointer。
- 验证：`http://127.0.0.1:5175/__dev/customer-config?customer=yoyoosun` 暗色抽检确认导入工作台存在 4 个流程步骤、4 个写库目标、4 个正式门禁，测试 Dry Run 可直接运行并生成 `output/customers/yoyoosun/ui-import-dry-run` evidence，正式写库按钮数量为 0，页面无横向溢出。
- 验证：`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/DevCustomerConfigPage.jsx scripts/style-l1/scenarios.mjs devCustomerImportDryRunPlugin.mjs`、`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web css`、`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec node --test src/erp/config/devCustomerConfig.test.mjs`、`STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop,dev-customer-config-mobile PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web style:l1` 和 `git diff --check` 通过；`http://127.0.0.1:5175/__dev/customer-config?customer=yoyoosun` 暗色抽检确认 4 个 Dry Run 后续操作均可见且可用、报告摘要已展开、指标卡和路径卡不再是白底。
- 验证：`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/DevCustomerConfigPage.jsx src/erp/config/devCustomerConfig.mjs src/erp/config/devCustomerConfig.test.mjs src/erp/api/customerConfigApi.mjs scripts/style-l1/scenarios.mjs devCustomerImportDryRunPlugin.mjs`、`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web css`、`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec node --test src/erp/config/devCustomerConfig.test.mjs`、`STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop,dev-customer-config-mobile PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web style:l1` 通过；`http://127.0.0.1:5175/__dev/customer-config?customer=yoyoosun` 暗色抽检确认测试环境应用按钮可见且未禁用、manifest 编译接口 200、流程步骤和写库目标均为 5、正式发布按钮数量为 0。
- 下一步：继续治理 dev 页时优先复用这套语义，不再把浅色卡片同时当按钮、说明、摘要和正文容器。
- 阻塞/风险：本轮只改 dev-only 前端样式和 L1 断言；不改正式菜单、seedData、后端 RBAC、schema、migration、WorkflowUsecase、Fact usecase、真实导入、发布或部署路径。

## 2026-06-28 客户配置 release readiness gate

- 完成：新增 `scripts/deploy/customer-config-release-readiness.mjs`，聚合校验 runtime manifest、manifest fingerprint evidence、release evidence、activation gate 和可选 release executor report；发布前可只验证证据包 ready，执行后可用 `--require-executed` / `--require-activated` 复核 publish / active 结果。
- 完成：补充 `scripts/deploy/customer-config-release-readiness.test.mjs`，覆盖 help、参数解析、发布前 readiness、report-only 报告、manifest hash 不匹配拒绝、require-executed、require-activated 以及 active 激活结果校验。
- 完成：接入 `scripts/qa/fast.sh` / `scripts/qa/strict.sh`，并同步 `scripts/README.md`、`deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/product/自动化测试策略.md`。
- 下一步：如果进入真实目标环境发布，仍需先生成本次 evidence 目录、完成真实备份恢复演练、migration、smoke、sign-off，再用 release executor 的显式 `--execute` 路径发布 / 激活，并用 readiness gate 做执行后复核。
- 阻塞/风险：readiness gate 只聚合脱敏证据和 report，不连接后端、不执行 migration、不恢复备份、不导入业务数据、不替代目标环境发布、恢复演练、smoke、rollback / forward-fix 判断。

## 2026-06-28 客户配置控制面审计

- 完成：`customer_config` publish / activate 在同一事务追加脱敏 `runtime_audit_events`，记录 actor、customer / revision、config hash、计数和状态；审计 payload 不保存 compiled snapshot、raw 客户配置或 secret。
- 完成：审计日志摘要支持 `customer_config.publish` / `customer_config.activate` 中文动作标签，并在没有 actor username 时回退 actor id。
- 完成：补充 `server/internal/data/customer_config_repo_test.go` 和 `server/internal/biz/admin_manage_customer_config_audit_test.go`，覆盖审计 insert payload 脱敏、actor id 回退和激活摘要。
- 下一步：若后续进入业务命令审计，应单独评审 `business_audit_events` 或等价事实审计模型，不把 runtime audit 误用为库存、出货、财务事实真源。
- 阻塞/风险：本轮只补客户配置控制面审计，不补业务动作审计查询页、不新增业务审计表、不执行真实客户配置 publish / activate。

## 2026-06-28 客户前端配置 overlay 测试

- 完成：新增 `scripts/build/apply-customer-web-config.test.mjs`，覆盖未选择客户时跳过、yoyoosun 客户配置 overlay 到 `customer-config.js`、客户 assets 复制，以及缺少客户配置文件时拒绝。
- 完成：将 overlay 脚本测试接入 `scripts/qa/fast.sh` / `scripts/qa/strict.sh`，与既有 `customer-config-boundaries` 中 Dockerfile / `.dockerignore` 字符串守卫形成双层证据。
- 完成：同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/product/自动化测试策略.md`。
- 下一步：真实客户发布仍需执行本地或 CI `docker build --build-arg ERP_CUSTOMER_KEY=yoyoosun ...`，并在目标 release evidence 中记录 image digest、health / smoke、migration 和 rollback point。
- 阻塞/风险：本轮只补 overlay 脚本级测试和 QA 接入，不构建真实 Docker 镜像、不推送镜像、不验证目标环境静态产物。

## 2026-06-28 Workflow 完成动作 API 收口

- 完成：新增 `complete_task_action` JSON-RPC 方法，完成动作由服务端固定映射为 `done`，拒绝客户端提交 raw `task_status_key` 或 `actor_role_key`，并复用现有权限、任务责任和服务端 actor role 推导。
- 完成：前端移动岗位任务端、桌面任务看板、Workflow V1 页面、采购订单 / 委外订单协同完成入口和出货放行完成入口改走 `complete_task_action`；阻塞 / 退回在下一条记录继续收口为受控 action。
- 完成：补充 JSON-RPC 合同测试，覆盖新方法成功完成、服务端推导角色、拒绝 raw status / actor role / 非完成动作。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md`、`docs/当前真源与交接顺序.md`、`web/README.md` 和 `scripts/README.md`。
- 下一步：已在下一条记录把 blocked / rejected 继续拆为受控 action contract；后续再接入 action_set / explain_action_access。
- 阻塞/风险：本轮只做 Workflow 协同完成动作 API 合同，不新增领域事实命令，不让任务完成等同库存、出货、质检或财务事实落账；旧 `update_task_status` 当时仍为兼容和阻塞 / 退回过渡入口。

## 2026-06-28 Workflow 阻塞 / 退回动作 API 收口

- 完成：新增 `block_task_action` / `reject_task_action` JSON-RPC 方法，并抽出共享任务动作 handler；完成 / 阻塞 / 退回均拒绝客户端提交 raw `task_status_key` 或 `actor_role_key`，由服务端固定映射目标状态、检查权限和推导 actor role。
- 完成：前端移动岗位任务端、桌面任务看板、Workflow V1 页面、采购订单 / 委外订单协同和出货放行阻塞入口改走受控 action；移动端退回入口改走 `reject_task_action`；模拟岗位任务闭环脚本不再调用 `update_task_status` 或提交 `actor_role_key`。
- 完成：补充 JSON-RPC 合同测试，覆盖 block / reject 成功写入、reason 必填、服务端角色推导、拒绝 raw status / actor role / 非法 action。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md`、`docs/当前真源与交接顺序.md`、`web/README.md` 和 `scripts/README.md`。
- 下一步：若继续推进 action_set，应在后端显式返回 explain_action_access / explain_task_assignment，而不是让前端猜测为什么按钮可用或不可用。
- 阻塞/风险：旧 `update_task_status` 仍保留为兼容入口和既有后端测试主路径；本轮不新增领域事实命令，不让 Workflow task done / blocked / rejected 等同库存、出货、质检或财务事实落账。

## 2026-06-28 Workflow 动作解释 API 收口

- 完成：新增 `explain_action_access` / `explain_task_assignment` JSON-RPC 只读方法，返回完成 / 阻塞 / 退回 / 催办的权限、owner / assignee / PMC / 老板 / super admin 边界、终态只读原因和服务端推导 actor role。
- 完成：前端 `workflowApi.mjs` 新增 `explainWorkflowActionAccess` / `explainWorkflowTaskAssignment` wrapper，并补静态导出断言；本轮不大面积改页面异步按钮状态，避免未验证的加载态和并发状态扩散。
- 完成：补充 JSON-RPC 合同测试，覆盖 owner 可完成、缺 reject 权限、指定处理人可处理、终态只读、PMC 可催办、任务归属解释。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 和 `web/README.md`。
- 下一步：逐页把桌面任务看板、Workflow V1 页面、业务协同面板和岗位任务端的同步按钮原因切到 explain 接口，并补对应前端加载态 / stale request 回归。
- 阻塞/风险：解释接口只读，不写 Workflow 事件、不写库存、出货、质检、财务或其他 Fact；前端页面当前仍保留本地 helper 作为即时 UI 判断，后续需要逐页接入后端解释结果。

## 2026-06-28 Workflow 动作解释前端接入

- 完成：新增 `useWorkflowTaskActionAccess` 和 `workflowTaskActionAccess` 工具，统一处理 `explain_action_access` 请求、AbortController 取消、stale response guard、后端原因优先和本地 helper fallback。
- 完成：桌面任务看板、Workflow V1 页面、业务页协同 Drawer 和岗位任务端提交前预检已开始消费后端 explain；移动端完成 / 阻塞 / 退回 / 催办写入前会先核对后端只读原因。
- 完成：mock JSON-RPC 补 `explain_action_access` / `explain_task_assignment`，并补 `workflowTaskActionAccess.test.mjs` 锁住 action alias、后端原因优先和 fallback 行为。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md`、`docs/当前真源与交接顺序.md` 和 `web/README.md`。
- 下一步：后续可继续把列表行即时按钮展示也完全切到 hook，或者在真实浏览器回归中补专门的 task-board / Workflow V1 权限原因断言。
- 阻塞/风险：本轮 explain 仍只读，不写 Workflow 事件、不写库存、出货、质检、财务或其他 Fact；列表行即时展示保留本地 helper fallback，提交前仍走受控 action 和后端 explain 预检。

## 2026-06-28 Workflow 责任池可见范围收口

- 完成：`CustomerConfigUsecase` 新增服务端可见 owner role 解析，非 super admin 会把当前账号角色、assignee 和 active customer config 中命中的 `work_pool_memberships.role_key` 合并后交给 Workflow 任务列表、动作和 explain 使用。
- 完成：`workflow.list_tasks`、完成 / 阻塞 / 退回 / 催办动作、`explain_action_access` 和 `explain_task_assignment` 改为使用同一套服务端可见 owner role 集合；请求参数不能越权扩大任务池，解释结果会返回 `visible_owner_role_keys` 和 `work_pool_role_matched`。
- 完成：补充 biz / JSON-RPC 测试，覆盖 active revision 责任池成员关系扩展可见 owner role、列表过滤和任务动作 actor role 推导。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 和 `docs/product/自动化测试策略.md`；追加前已检查 `progress.md` 为 120 行 / 21710 字节，未达归档阈值。
- 下一步：继续按优先级第 4 项推进 engineering 最小可用时，应先核对工程角色的账号分配、菜单入口、BOM / 工序资料入口和岗位任务端承接，不把客户责任池当作工程资料事实。
- 阻塞/风险：当前 `workflow_tasks` 没有 `pool_key`，责任池只通过成员命中的 `role_key` 投影到 owner role 可见性；本轮不新增 schema / migration，不写 Workflow / Fact / 库存 / 出货 / 财务事实，不执行真实客户配置发布或激活。

## 2026-06-28 engineering 最小可用闭环

- 完成：补齐工程岗位任务端入口链路：新增 `mobile-engineering` 应用注册、本地 `5194` 调试端口、`start:mobile:engineering` / `build:mobile:engineering`、`/m/engineering/tasks` 路径生成、`mobile.engineering.access` 前端权限映射、工程移动端角色标签和 mock 长列表样本。
- 完成：补齐账号和调试数据承接：默认 demo seed 新增 `demo_engineering`，`trial-account-rbac` 核对 10 个 demo 账号 / 9 个业务岗位权限，`order_approval_engineering` 调试场景中的工程资料记录、任务和状态改由 `engineering` 承接。
- 完成：补强 JSON-RPC 合同测试，覆盖老板审批通过后派生 `engineering_data` 任务，engineering 账号通过 `list_tasks` 可见并通过 `complete_task_action` 完成。
- 完成：同步 `README.md`、`web/README.md`、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/产品能力进度台账.md`、`docs/product/产品能力证据详情.md`、`docs/customers/yoyoosun/试用账号角色菜单核对清单.md` 和 `docs/customers/yoyoosun/试用环境执行手册.md`；追加前已检查 `progress.md` 为 129 行 / 23290 字节，未达归档阈值。
- 下一步：继续按优先级第 5 项评审自定义角色合法性时，应核对客户配置 active roles 与后端角色配置的关系，不把 `BuiltinRoles()` 重新当作唯一角色集合。
- 阻塞/风险：本轮只补 engineering 入口、账号、Workflow 任务承接和文档证据；不新增工程资料发布 usecase、不新增 schema / migration、不把 BOM / 工序任务完成升级成采购需求、库存、生产、成本或财务事实。

## 2026-06-28 客户配置导入工作台测试版与发布版入口

- 完成：`/__dev/customer-config` 导入工作台补齐测试版和发布版可视化入口；测试版 `应用到测试环境` 编译受控 runtime manifest 后调用后端 `validate_customer_config / publish_customer_config / activate_customer_config / get_effective_session`，发布版先跑 release readiness gate，门禁通过后才允许发布到正式版。
- 完成：新增 dev-only `release-readiness` API，页面可直接显示缺失的 release evidence；未登录 / 无权限 / 后端不可达会转成明确中文操作提示，不再把登录态问题伪装成配置包导入失败。
- 完成：暗色模式补齐发布门禁、测试应用和发布结果卡片的背景 / 边框 / 文本样式；同步 `docs/当前真源与交接顺序.md`、`web/README.md` 和 `config/customers/yoyoosun/README.md`。
- 验证：已按 `make migrate_status` 确认 pending 1 后执行 `make migrate_apply`，当前 dev DB 到 `20260628123354` 且 pending 0；用 `demo_admin / 12345678` 真实登录后跑通 runtime manifest、`validate_customer_config`、`publish_customer_config`、`activate_customer_config` 和 `get_effective_session`，返回 `active_customer_config_revision`。
- 验证：`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web lint`、`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web css`、`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test`、`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC|TestJSONRPCDispatcher'`、`STYLE_L1_SCENARIOS=dev-hub-dark-desktop,dev-all-pages-mobile,dev-ui-semantics-desktop,dev-switch-controls-dark-desktop,dev-governance-dark-desktop,dev-prototypes-dark-desktop,dev-testing-dark-desktop,dev-customer-config-dark-desktop,dev-customer-config-mobile PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web style:l1` 和 `git diff --check` 通过；浏览器暗色回归确认测试版应用成功、发布门禁 blocked、正式发布按钮禁用且无横向溢出。
- 下一步：真实正式发布仍需补齐目标环境 release evidence、manifest hash 证据、备份恢复、migration、smoke 和 sign-off；证据通过后再在页面或 release executor 中执行发布 / 激活。
- 阻塞/风险：本轮不绕过后端 RBAC，不新增 schema / migration，不导入客户、供应商、销售订单、库存、出货或财务业务数据；发布版按钮在 release readiness gate 未通过前保持禁用。

## 2026-06-28 engineering 客户配置 manifest 收口

- 完成：`customerPackageCatalog` 新增工程责任池、BOM / 工序页面投影和工程资料模块投影；`customer-config-runtime-manifest` 现在编译出 9 个 role profile / work pool，并把 `engineering` 映射到后端工程角色。
- 完成：销售订单审批配置预览增加 `engineering_data` 节点，表达老板审批后工程资料补齐责任；该节点仍是 Workflow-only 预览，不生成库存、采购、生产、成本或财务事实。
- 完成：runtime manifest 编译器新增岗位端 access entitlement 映射，确保 `mobile.engineering.access` 只授予 engineering 角色，不扩散给 boss 或其他岗位；同步 `docs/当前真源与交接顺序.md`、`config/customers/yoyoosun/README.md`、产品台账和优先级文档。
- 完成：毛绒行业模板候选新增 engineering 默认角色、工程资料岗位任务模式和产品工程字段模板，`industry-template-boundaries` 现在强制要求 engineering 并输出 `roles=9`。
- 下一步：继续按优先级第 5 项复核自定义角色合法性与 active customer config 的关系，避免后续把 `BuiltinRoles()` 重新当作唯一角色源。
- 阻塞/风险：本轮只补客户配置 manifest 投影和测试，不执行后端 publish / activate，不上传 raw 客户包，不新增 schema / migration，不改变 WorkflowUsecase 或任何 Fact usecase。

## 2026-06-28 领域命令进入条件收口

- 完成：复核自定义角色合法性代码与测试，确认 `NormalizeAdminRoleKeys` 不再按 `BuiltinRoles()` 过滤，账号分配按当前 `roles` 表有效角色校验；该优先级不需要重复实现。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`，把第 7 项明确为“边界守卫已落地，任务自动过账尚未开放”，并列出 shipment_release、warehouse_inbound、quality、engineering_data、财务登记 / 对账提醒任务的 Workflow-only 禁区。
- 下一步：若后续要推进领域命令闭环，必须先选定单个业务域任务，评审 source-of-truth 字段、幂等键、RBAC、审计、取消 / 冲正和测试范围，再由对应领域 usecase 写事实。
- 阻塞/风险：本轮不把任何 Workflow task done 改成 Fact posted，不在前端任务端或 WorkflowUsecase 里写库存、出货、质检、财务、采购或生产事实。

## 2026-06-28 客户配置回滚审计语义收口

- 完成：`rollback_customer_config` 从服务层共用 activate 调用拆出，明确走 `CustomerConfigUsecase.RollbackCustomerConfig`；data repo 复用同一条 active revision 状态切换主路径，但回滚写入独立 `customer_config.rollback` runtime audit，并记录 `rollback_target_revision`。
- 完成：审计日志摘要新增“客户配置回滚”中文动作和高风险标记；同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`web/README.md` 和 `config/customers/yoyoosun/README.md`，明确受控 revision 回滚不等于 raw 包回滚、真实导入失败恢复、备份恢复或生产回滚演练。
- 验证：`cd server && go test -count=1 ./internal/biz ./internal/data ./internal/service`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过；追加前已检查 `progress.md` 为 164 行 / 29978 字节，未达归档阈值。
- 下一步：继续按优先级第 8 项补真实导入 / 目标环境发布证据时，应另走 release / import 专项，不能用当前 revision rollback API 冒充导入恢复或生产回滚。
- 阻塞/风险：本轮不新增 schema / migration，不上传 raw 客户包，不执行真实业务数据导入，不做目标环境备份恢复或生产回滚演练；发布执行器 rollback 只覆盖受控 customer config revision 回滚，不覆盖业务数据导入失败恢复。

## 2026-06-28 客户配置发布执行器回滚路径收口

- 完成：`scripts/deploy/customer-config-release-execute.mjs` 新增显式 `--rollback` 模式，默认仍只出报告；执行时必须提供 release evidence、目标后端、管理员 token / 账号和 `ROLLBACK_YOYOOSUN_CONFIG` 确认短语，只调用 `rollback_customer_config(target_revision=manifest.revision)`。
- 完成：补 `customer-config-release-execute.test.mjs` 覆盖 rollback 参数解析、缺 evidence 拒绝、与 activate 互斥、mock JSON-RPC 只调用 rollback；同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`。
- 验证：`node --test scripts/deploy/customer-config-release-execute.test.mjs`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过；追加前已检查 `progress.md` 为 172 行 / 31416 字节，未达归档阈值。
- 下一步：真实目标环境回滚仍需在 release evidence 中有备份 / 恢复 / smoke / sign-off 证据，并按目标环境执行；当前脚本只提供受控 customer config revision 回滚调用。
- 阻塞/风险：本轮不执行真实后端 rollback、不恢复备份、不迁移数据库、不导入或回滚业务数据，不替代生产 rollback runbook。

## 2026-06-28 客户配置 readiness 回滚报告验证

- 完成：`scripts/deploy/customer-config-release-readiness.mjs` 新增 `--require-rollback`，可在执行后聚合验证 release report 里存在 `rollback_customer_config`、目标 revision 与当前 manifest 一致、结果状态为 `active`。
- 完成：补 `customer-config-release-readiness.test.mjs` 覆盖 help / 参数解析、rollback 结果失败和已回滚报告通过；同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/自动化测试策略.md`。
- 验证：`node --test scripts/deploy/customer-config-release-readiness.test.mjs`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过；追加前已检查 `progress.md` 为 180 行 / 32790 字节，未达归档阈值。
- 下一步：真实目标环境 rollback 仍需要目标环境 release evidence 和人工执行证据；readiness gate 只复核报告，不连接后端。
- 阻塞/风险：本轮不执行真实 rollback、不恢复备份、不迁移数据库、不导入或回滚业务数据，不替代生产 rollback runbook。

## 2026-06-28 密码输入框 placeholder / caret 节奏收口

- 完成：将统一登录页大尺寸账号 / 密码框纳入 `business-control-rhythm.css` 的真实 input line-height 合同，保持 56px 外框不变，内层 input 使用 54px 控件内高并取消纵向 padding，避免 placeholder、输入文字和 caret 被 affix wrapper 裁切。
- 完成：所有 `ant-input-password` 的 suffix 图标改为 `inline-flex` 且随 wrapper 拉伸居中，避免密码眼睛图标和文字基线错位；权限中心创建管理员 / 重置密码弹窗继续走共享 `erp-permission-modal` 节奏，不写单页补丁。
- 完成：`style:l1` 的单行输入垂直节奏断言取消登录页豁免，并新增 affix suffix 中心对齐扫描；后续登录页密码框、业务弹窗密码框或其它 password affix 回退到默认 22px line-height / 图标错位时会被浏览器级回归发现。
- 验证：追加前已检查 `progress.md` 为 188 行 / 33981 字节，未达归档阈值；`node --check web/scripts/styleL1.mjs`、`cd web && corepack pnpm exec eslint --no-warn-ignored scripts/styleL1.mjs`、`cd web && corepack pnpm css`、`git diff --check -- web/src/erp/styles/app/business-control-rhythm.css web/scripts/styleL1.mjs progress.md` 均通过；`STYLE_L1_PORT=4197 STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,admin-login-mobile-source-desktop-choice corepack pnpm style:l1` 通过，共 2 个场景。
- 下一步：若权限中心完整场景的自定义 `AppModal` 遮罩问题需要收口，应单独修复该交互阻塞，再复跑 `permission-center-desktop` 覆盖创建 / 重置密码弹窗完整路径。
- 阻塞/风险：`permission-center-desktop` 本轮两次稳定失败在非本轮自定义 `AppModal` 遮罩拦截“全选本组”，失败发生在创建 / 重置密码弹窗之前；本轮未改 schema、migration、JSON-RPC、RBAC、菜单真源、WorkflowUsecase、Fact usecase、客户配置、部署脚本或原型状态。

## 2026-06-28 客户配置开发页回滚命令证据收口

- 完成：`/__dev/customer-config` 导入工作台的命令兜底区补充 rollback readiness 和 rollback executor 复核命令，显式展示 `--require-rollback`、`ROLLBACK_YOYOOSUN_CONFIG` 和 `--execute --rollback`，但仍不提供页面裸回滚按钮。
- 完成：同步 `web/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`，明确 dev-only 页面只做命令复核，正式回滚仍依赖 release evidence、readiness gate 和后端受控 API。
- 验证：追加前已检查 `progress.md` 为 197 行 / 35965 字节，未达归档阈值；`cd web && node --test src/erp/config/devCustomerConfig.test.mjs`、`STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web style:l1` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按优先级文档推进真实发布 / 导入专项，但必须先补目标环境 release evidence、备份恢复、migration、smoke 和 sign-off，不能把受控 revision rollback 当生产回滚演练。
- 阻塞/风险：本轮不执行真实 rollback、不恢复备份、不迁移数据库、不导入或回滚业务数据，不替代生产 rollback runbook。

## 2026-06-28 发布 evidence 跨文件一致性门禁

- 完成：`scripts/deploy/release-evidence-gate.mjs` 新增跨文件一致性校验，要求 release / backup restore / smoke 的 `releaseVersion` 一致，release / backup / backup restore 的 `backupId` 一致，避免把不同发布批次或不同备份的 evidence 拼在一起通过门禁。
- 完成：补 `release-evidence-gate.test.mjs` 覆盖 releaseVersion 串批次和 backupId 串备份的拒绝场景；同步 `scripts/README.md`、`deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`。
- 验证：追加前已检查 `progress.md` 为 205 行 / 37288 字节，未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs`、`node --test scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：真实目标环境发布仍需生成真实 release evidence、执行恢复演练、migration、smoke 和 sign-off；该 gate 只校验脱敏 evidence 的完整性和一致性。
- 阻塞/风险：本轮不读取真实备份、不接触真实 `.env`、不执行部署、不恢复备份、不导入或回滚业务数据。

## 2026-06-28 生产 preflight 自动守卫接入

- 完成：新增 `scripts/deploy/production-preflight.test.mjs`，用临时 env / Compose / migration 脚本验证合规生产 preflight 可通过、`APP_IMAGE=:latest` 会被拒绝、生产 Compose 含 `build:` 会被拒绝；测试使用 `--skip-compose-config`，不连接 Docker 或目标服务器。
- 完成：`scripts/qa/fast.sh` 和 `scripts/qa/strict.sh` 接入 production preflight 测试；同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`。
- 验证：追加前已检查 `progress.md` 为 213 行 / 38721 字节，未达归档阈值；`node --test scripts/deploy/production-preflight.test.mjs` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：真实发布前仍必须用目标环境运行时 `.env` 单独执行 `production-preflight.sh`，并在目标环境完成 migration、smoke 和 release evidence。
- 阻塞/风险：本轮不执行真实生产 preflight、不连接生产 Docker、不执行 migration、不做目标环境 smoke、不替代备份恢复演练。

## 2026-06-28 导入执行器 fixture approval 防误执行

- 完成：`scripts/import/customerImportExecute.mjs` 在 `--execute` 模式新增 approval 来源门禁，拒绝 `scripts/import/fixtures/**` 和文件名含 sample / fixture 的 approval；样例 approval 仍可用于 report-only 自检，不连接后端。
- 完成：补 `customerImportExecute.test.mjs` 覆盖“有确认短语但使用 fixture approval 仍被拒绝”；同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`。
- 验证：追加前已检查 `progress.md` 为 221 行 / 39912 字节，未达归档阈值；`node --test scripts/import/customerImportExecute.test.mjs`、`for test_file in scripts/import/*.test.mjs; do node --test "$test_file"; done` 和 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：真实导入仍需另走客户确认、正式 approval、备份、回滚 / forward-fix 和目标环境专项；当前执行器只负责把样例批准挡在真实执行入口外。
- 阻塞/风险：本轮不执行真实导入、不连接后端、不写客户 / 供应商 / 订单业务表，不替代真实客户批准、备份、回滚或 forward-fix 方案。

## 2026-06-28 导入执行器 backup evidence 防误执行

- 完成：`scripts/import/customerImportExecute.mjs` 在 `--execute` 模式新增 approval 内容门禁和 backup evidence 来源 / 内容门禁，拒绝路径或内容含 fixture / sample / placeholder 的 approval，拒绝 fixture / sample / placeholder backup evidence 路径、空文件和样例 / 占位文本；report-only 路径仍允许本地样例 evidence 自检，不连接后端。
- 完成：补 `customerImportExecute.test.mjs` 覆盖“临时正式 approval 路径但内容仍是 sample 时被拒绝”和“临时正式 approval 路径但 backup evidence 内容仍是 sample 时被拒绝”；同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`。
- 验证：追加前已检查 `progress.md` 为 229 行 / 41207 字节，补充验证前复查为 237 行 / 42357 字节，均未达归档阈值；`node --test scripts/import/customerImportExecute.test.mjs`、`for test_file in scripts/import/*.test.mjs; do node --test "$test_file"; done`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实导入仍需客户确认、正式 approval、目标环境真实备份证据、rollback / forward-fix 方案和目标环境专项验收。
- 阻塞/风险：本轮不执行真实导入、不连接后端、不验证真实备份可恢复性，也不替代目标环境 restore / smoke / rollback 演练。

## 2026-06-28 导入执行器 dry-run package 防误执行

- 完成：`scripts/import/customerImportExecute.mjs` 在 `--execute` 模式新增 dry-run package evidence 门禁，要求存在 `dry-run-report.md`，并拒绝 dry-run report 或 source references 中含 fixture / sample / placeholder 的执行输入；report-only 路径仍可用 fixture dry-run package 做自检。
- 完成：补 `customerImportExecute.test.mjs` 覆盖 fixture dry-run package 不能进入 `--execute`；同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md`、`docs/当前真源与交接顺序.md`、`docs/customers/yoyoosun/导入策略.md`、`docs/customers/yoyoosun/导入试跑工具说明.md` 和 `docs/customers/yoyoosun/导入试跑计划.md`。
- 验证：追加前已检查 `progress.md` 为 237 行 / 42753 字节，补充验证前复查为 245 行 / 44058 字节，均未达归档阈值；`for test_file in scripts/import/*.test.mjs; do node --test "$test_file"; done`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实导入仍需非 fixture 的 reviewed dry-run report、正式 approval、目标环境真实备份证据、rollback / forward-fix 方案和目标环境专项验收。
- 阻塞/风险：本轮不执行真实导入、不连接后端、不验证真实备份可恢复性，也不替代目标环境 restore / smoke / rollback 演练。

## 2026-06-28 发布证据 rollback / forward-fix plan 门禁

- 完成：`scripts/deploy/release-evidence-gate.mjs` 新增 `rollback-forward-fix-plan.md` 必需证据，校验 `rollbackDecision`、触发条件、回滚目标、runbook、forward-fix owner、回滚后验证范围和 3 个必选确认，避免 release evidence 只有 sign-off 结论却没有处置路径。
- 完成：新增 `deployments/yoyoosun/evidence/releases/rollback-forward-fix-plan-template.md`，同步 `deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md`、`scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`。
- 验证：追加前已检查 `progress.md` 为 245 行 / 44230 字节，补充验证前复查为 253 行 / 45494 字节，均未达归档阈值；`node --test scripts/deploy/release-evidence-gate.test.mjs`、`for test_file in scripts/deploy/*.test.mjs; do node --test "$test_file"; done`、`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 和 `git diff --check` 通过。
- 下一步：真实发布仍需目标环境运行 production preflight、migration、smoke、真实备份恢复演练和实际 rollback / forward-fix 演练证据。
- 阻塞/风险：本轮不执行真实目标环境发布、不恢复真实备份、不执行生产回滚；新增 plan 门禁只证明处置路径已脱敏记录，不证明回滚已发生。

## 2026-06-28 Workflow UI action 边界守卫

- 完成：新增 `scripts/qa/workflow-ui-action-boundary.test.mjs`，扫描 `web/src/erp` 正式运行时代码，禁止页面、组件、hook 和工具直接调用 `createWorkflowTask`、`updateWorkflowTaskStatus`、`upsertWorkflowBusinessState` 或 raw `create_task` / `update_task_status` / `upsert_business_state`。
- 完成：`scripts/qa/fast.sh` 和 `scripts/qa/strict.sh` 接入该守卫；同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/product/自动化测试策略.md` 和 `docs/当前真源与交接顺序.md`。
- 验证：追加前已检查 `progress.md` 为 253 行 / 45714 字节，未达归档阈值；`node --test scripts/qa/workflow-ui-action-boundary.test.mjs` 已通过。
- 下一步：继续按优先级推进第 7 项领域命令进入条件和第 8 项真实环境证据；正式 UI 仍只能通过 action 合同处理任务动作。
- 阻塞/风险：本轮不开放任务自动过账，不改 schema、migration、RBAC、WorkflowUsecase、Fact usecase 或真实目标环境发布；API wrapper、mock、style:l1 场景和测试代码仍允许保留兼容方法。
