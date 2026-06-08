# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-08-before-business-records-debug-cleanup.md`：归档截至 2026-06-08 13:50 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 318 行 / 82540 bytes，超过 80KB 阈值；本轮旧 `project-orders` debug cleanup 前先保留完整现场，再收缩当前入口。

## 2026-06-08 14:35 CST
- 完成：复核新增永绅 yoyoosun 原始图片对需求目标和文档的影响。结论是不改产品路线、能力成熟度或交付承诺；岗位职责流程图和合同订单照片只增强客户资料治理、需求线索和人工复核输入，不升级为 Product Core、runtime、schema、migration、API、UI、seedData 或采购 / 库存 / 出货 / 财务事实。
- 完成：补充 `docs/customers/yoyoosun/import-source-inventory.md`，显式登记“岗位职责流程图截图”和“合同订单照片”两个来源，避免后续 dry-run / 人工复核只看到泛化的“图片 / 截图”而漏掉具体线索。
- 验证：人工复核 `docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`、`docs/customers/yoyoosun/import-source-inventory.md`、`docs/customers/yoyoosun/requirement-clues.md` 和 `progress.md`；本轮仅补 customer import source inventory 和过程记录，未触达 runtime。
- 下一步：后续如果要从流程图或合同照片推进正式能力，先进入人工字段复核、问题确认和 Workflow / Fact 边界评审，再拆独立实现任务。
- 阻塞/风险：仓库为内部使用，合同照片中的联系人、电话、地址和订单内容按现有客户原件政策保留；当前不额外引入脱敏或对象存储。工作区已有多处非本轮既有改动，本轮只在上述文档上追加最小登记。

## 2026-06-07 22:32 CST
- 完成：按“开发阶段不保留旧兼容”的口径删除 `partners / project-orders` 旧产品入口本身。`businessModules.mjs` 不再保留旧模块定义或 `legacyRouteDisabled` 标记，正式 `客户档案 / 供应商档案 / 销售订单` V1 入口改为按 section 直接注入菜单；旧 `/erp/master/partners`、`/erp/sales/project-orders` 不再有旧页面、只读兼容页、前端重定向或权限别名。
- 完成：同步清理 `router.jsx`、`ERPLayout.jsx`、`menuPermissions.mjs`、相关配置测试和 `style:l1` 旧 redirect 场景；同步更新 `docs/current-source-of-truth.md`、`docs/product/formal-menu-entry-plan.md`、`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`、`docs/product/business-records-cutover-plan.md`、`docs/product/business-records-reference-audit.md`、`docs/product/business-records-risk-register.md`，明确旧产品入口已删除，`business_records` 表和历史数据不在本轮删除。
- 验证：`pnpm --dir web exec node --test src/erp/config/seedData.test.mjs src/erp/config/menuPermissions.test.mjs` 通过，13 条测试通过；`pnpm --dir web lint` 通过；`pnpm --dir web exec prettier --check scripts/styleL1.mjs src/erp/config/businessModules.mjs src/erp/router.jsx src/erp/config/menuPermissions.mjs src/erp/components/ERPLayout.jsx src/erp/config/menuPermissions.test.mjs src/erp/config/seedData.test.mjs` 通过；`STYLE_L1_SCENARIOS=business-module-dark-customers-desktop,business-menu-groups-desktop pnpm --dir web style:l1` 通过；`git diff --check` 覆盖本轮触达文件通过；旧 `/erp/master/partners`、`/erp/sales/project-orders` 登录后不再跳到正式 V1 路由，未授权状态按当前入口守卫回到 `/entry`。
- 下一步：如果要删除或归档 `business_records` 表 / 数据，需要另开数据迁移、归档和回滚边界评审；`products` 及其他仍使用 `BusinessModulePage` 的通用旧模块也应按各自正式模型成熟度单独评审。
- 阻塞/风险：本轮未改 schema、migration、后端 API、RBAC 真正权限守卫、seedData 业务数据、WorkflowUsecase、库存 / 出货 / 财务事实层，也未删除 `business_records`、历史 source key 或通用业务记录 API。追加前 `progress.md` 为 296 行 / 75986 bytes，未达到归档阈值；工作区存在多处本轮外的既有未提交改动，收口和提交时需按路径精确隔离。

## 2026-06-08 13:26 CST
- 完成：继续收口 `partners / project-orders` 旧入口兼容残留。后端 `NormalizeAdminMenuPermissions` 不再把旧 `/erp/master/partners`、`/erp/sales/project-orders` 归一到正式 V1 路径；对应 RBAC 测试改为旧路径被丢弃。
- 完成：冻结已由 V1 替代的旧 `business_records` 模块写入。`partners / project-orders` 仍可作为历史记录查询和审计线索，但普通 `business` JSON-RPC 的 create / update / delete / restore 均返回“旧业务记录入口已停用，请使用正式 V1 入口”；repo 层也阻断对现有旧模块记录的 update / delete / restore，避免绕过 usecase。
- 完成：同步更新 `docs/current-source-of-truth.md`、`docs/product/business-records-cutover-plan.md`、`docs/product/business-records-risk-register.md`、`docs/product/business-records-reference-audit.md`、`docs/product/formal-menu-entry-plan.md`、`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`，明确当前只冻结旧重叠模块普通写入，不删除 `business_records` 表、数据、schema 或其他通用模块。
- 验证：`cd server && go test ./internal/biz ./internal/data` 通过；旧路径 alias / 旧重定向口径 `rg` 扫描无残留；`git diff --check` 覆盖本轮触达文件通过。
- 下一步：对真实库按 `business_records.module_key`、`business_record_items`、`business_record_events`、`workflow_tasks.source_type`、采购 `business_record_id` 做统计，形成 `partners / project-orders` 历史数据迁移 / 归档 / 删除决策；其他仍使用 `BusinessModulePage` 的模块继续按各自专表成熟度单独评审。
- 阻塞/风险：本轮未改 schema、migration、真实数据、采购事实外键、debug seed、seedData、前端路由、WorkflowUsecase、库存 / 出货 / 财务事实层，也未删除 `business_records` API 或表。追加前 `progress.md` 为 303 行 / 78459 bytes，未达到归档阈值；工作区仍存在多处本轮外既有未提交改动，提交时需按路径精确隔离。

## 2026-06-08 13:50 CST
- 完成：对当前 dev DB `plush_erp` 执行 `business_records` 退出只读统计。migration status 为 latest / `20260530161152`；`partners` 旧记录为 0；`project-orders` 旧记录为 4，全部带 `DBG-*` / `debug_run_id` 标记；`project-orders` 明细为 0、事件为 4；`workflow_tasks.source_type=project-orders` 为 432，全部 debug 标记且无 missing source record；`workflow_business_states.source_type=project-orders` 为 4；采购入库 / 退货 / 调整的 `business_record_id` 引用为 0；V1 `customers / suppliers / contacts / sales_orders / sales_order_items` 均为 0；明细和事件孤儿数为 0。
- 完成：同步更新 `docs/product/business-records-cutover-plan.md`、`docs/product/business-records-reference-audit.md`、`docs/product/business-records-risk-register.md`、`docs/product/product-delivery-ledgers.md`，把“未读取真实数据库”的缺口改为当前 dev DB 统计结果，并明确当前不需要把 `partners / project-orders` 旧记录迁移到 V1。
- 验证：`cd server && make print_db_url` 确认当前 DB；`cd server && make migrate_status` 通过且无 pending migration；只读 SQL 统计通过；未执行 INSERT / UPDATE / DELETE / migration；本轮文档 `git diff --check` 通过。
- 下一步：如需清理当前 dev DB 的 4 条 `project-orders` debug 记录和 432 条 debug workflow task，应先确认不影响当前 L1 / 手工验收，再走 debug cleanup / 受控 cleanup；正式数据层面下一步可转向客户菜单 runtime config loader 或其他仍使用 `BusinessModulePage` 的模块退出评审。
- 阻塞/风险：本轮统计只覆盖当前 dev DB，不代表未来客户库或生产库；未清理 debug 数据，未删除表 / schema / API / seedData / debug seed / workflow / 采购事实外键。追加前 `progress.md` 为 311 行 / 80548 bytes，未达到归档阈值；工作区仍有多处本轮外既有改动，提交时需按路径精确隔离。

## 2026-06-08 14:18 CST
- 完成：对当前 dev DB `plush_erp` 执行受控 `project-orders` debug cleanup。先确认现有 `clear_business_chain_scenario` debug API 按 run / scenario 匹配范围过宽，会命中同一 run 下其他模块，因此本轮改用只针对 `business_records.module_key = project-orders`、`DBG-*` 单号和 debug payload 的事务清理。
- 完成：4 条 `project-orders` debug business record 已软归档并追加 `debug_cleanup_archived` 事件；432 条 `workflow_tasks.source_type=project-orders`、432 条对应 `workflow_task_events` 和 4 条 `workflow_business_states.source_type=project-orders` 已删除。清理后 `partners / project-orders` active 旧记录为 0，相关 workflow task / business state 为 0；采购事实 `business_record_id` 引用仍为 0。
- 完成：同步更新 `docs/product/business-records-cutover-plan.md`、`docs/product/business-records-reference-audit.md`、`docs/product/business-records-risk-register.md` 和 `docs/product/product-delivery-ledgers.md`，并按阈值把旧 `progress.md` 归档到 `docs/archive/progress-2026-06-08-before-business-records-debug-cleanup.md`。
- 验证：cleanup 前 dry-run 命中 4 条 business record、432 条 workflow task、432 条 workflow event、4 条 business state；cleanup 后 SQL 复核 active 旧记录为 0、workflow task 为 0、workflow business state 为 0、`debug_cleanup_archived` 事件为 4。本轮未执行 migration，未删除 `business_records` 表 / schema / 通用 API。
- 下一步：可以转向客户菜单 runtime config loader / 客户培训说明，或继续评审其他仍使用 `BusinessModulePage` 的旧通用模块；客户库或生产库如果将来出现旧数据，仍需按库重新统计和评审，不能套用当前 dev DB 结论。
- 阻塞/风险：本轮只清理当前 dev DB 的 debug seed 残留；未迁移或导入 V1 正式数据，未清理其他旧模块，未提交或推送。归档前 `progress.md` 为 318 行 / 82540 bytes，已超过 80KB 阈值；归档后当前文件只保留最近活跃记录。

## 2026-06-08 14:29 CST
- 完成：接入客户菜单 runtime config loader。新增 `web/src/erp/config/customerMenuConfig.mjs`，桌面菜单可读取构建环境 `VITE_ERP_CUSTOMER_KEY`、页面预置 `window.__PLUSH_ERP_CUSTOMER_KEY__` 或 `window.__PLUSH_ERP_CUSTOMER_CONFIG__`；`seedData.mjs` 统一通过该 loader 生成桌面导航，前端菜单权限选项继续复用同一导航真源。
- 完成：新增 `config/customers/yoyoosun/menuConfig.mjs` 作为永绅 yoyoosun 桌面菜单配置；同步更新 `config/customers/yoyoosun/README.md`、`README.md`、`web/README.md`、`docs/current-source-of-truth.md`、`docs/product/formal-menu-entry-plan.md`、`docs/product/product-delivery-ledgers.md` 和 `docs/document-inventory.md`。前端 Dockerfile 已补 `COPY config ./config`，避免镜像构建阶段丢失客户配置包。
- 完成：修正 `linkedNavigation.test.mjs` 的旧入口断言，采购 / 加工记录不再期待回跳已退出的 `project-orders` 旧入口，和当前“开发阶段不保留旧兼容”口径一致。
- 验证：`pnpm --dir web exec node --test src/erp/config/seedData.test.mjs src/erp/config/menuPermissions.test.mjs` 通过；`pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/config/customerMenuConfig.mjs src/erp/config/seedData.mjs src/erp/config/seedData.test.mjs src/erp/utils/linkedNavigation.test.mjs` 通过；`pnpm --dir web test` 通过，275 条测试通过；`pnpm --dir web css` 通过；`STYLE_L1_SCENARIOS=business-menu-groups-desktop pnpm --dir web style:l1` 通过；`pnpm --dir web exec vite build --config vite.config.mjs --outDir /tmp/plush-toy-erp-vite-build-check --emptyOutDir` 通过；`git diff --check` 通过。
- 下一步：补客户培训说明，明确正式入口、旧路径退出、客户菜单配置只影响入口可见性，以及销售订单不是出货 / 库存 / 财务闭环；或继续做字段显示 / 编号规则这类低风险 customer config。
- 阻塞/风险：本轮未新增 `tenant_id`，未改 schema、migration、后端 RBAC 真源、Workflow / Fact usecase、真实导入、角色模板 runtime、字段配置 runtime、编号规则 runtime 或通用打印模板引擎。客户菜单隐藏不是安全边界，后端动作权限和业务 usecase 仍是最终保护层。追加前 `progress.md` 为 39 行 / 9671 bytes，未达到归档阈值。

## 2026-06-08 14:34 CST
- 完成：新增 `docs/customers/yoyoosun/trial-training-note.md` 作为永绅 yoyoosun 试用培训说明草案，明确正式入口、旧 `partners / project-orders` 退出、客户菜单配置边界、销售订单不等于出货 / 库存 / 财务，以及试用前培训和验收清单。
- 完成：同步更新 `docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/current-source-of-truth.md`、`docs/product/formal-menu-entry-plan.md`、`docs/product/business-records-cutover-plan.md`、`docs/product/business-records-risk-register.md` 和 `docs/product/product-delivery-ledgers.md`，把“后续补客户培训说明”的旧口径改为“培训说明草案已补，后续按真实试用反馈复核”。
- 验证：`rg` 扫描未再发现“客户培训说明未做 / 后续补客户培训”等旧口径；`git diff --check` 通过。本轮为 docs-only，未运行前端 / 后端测试。
- 下一步：可继续做字段显示 / 编号规则这类低风险 customer config，或开始按试用培训说明准备真实试用账号 / 角色菜单核对清单。
- 阻塞/风险：培训说明仍是草案，不是产品内帮助中心，也不是客户正式签收材料；未改 runtime、schema、migration、API、RBAC、菜单配置代码、真实导入、库存 / 出货 / 财务事实或部署。追加前 `progress.md` 为 47 行 / 12036 bytes，未达到归档阈值。

## 2026-06-08 14:43 CST
- 完成：新增 `docs/customers/yoyoosun/trial-account-role-menu-checklist.md` 作为永绅 yoyoosun 试用账号、角色、桌面菜单和岗位任务端核对清单，明确普通试用账号不使用 super admin、不分配 `debug_operator`、不在文档记录真实密码或 token，岗位任务端只认 `mobile.<role>.access`。
- 完成：同步更新 `docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/current-source-of-truth.md` 和 `docs/product/product-delivery-ledgers.md`，把试用培训说明后的下一步从“待准备账号核对”推进到“账号角色菜单核对清单已补，真实账号仍待运行环境配置”。
- 验证：本轮为 docs-only；后续已执行 Markdown 尾随空白扫描和 `git diff --check`。未运行前端 / 后端测试。
- 下一步：按清单在真实试用环境创建或核对账号、绑定角色和权限，并做一次登录 / 菜单 / 岗位任务端手工回归；也可先继续做字段显示 / 编号规则这类低风险 customer config。
- 阻塞/风险：本轮未创建真实账号、未写密码、未改 runtime、schema、migration、API、RBAC 真源、菜单配置代码、真实导入、库存 / 出货 / 财务事实或部署。追加前 `progress.md` 为 61 行 / 14922 bytes，未达到归档阈值。

## 2026-06-08 14:52 CST
- 完成：执行试用前入口回归。桌面菜单使用 `VITE_ERP_CUSTOMER_KEY=yoyoosun` 跑 `business-menu-groups-desktop`，验证 yoyoosun 菜单配置下正式 `客户档案`、`供应商档案`、`销售订单` 和业务分组可见，旧“客户/供应商”“订单/款式立项”、帮助中心、开发与验收和高级文档分组不再作为侧栏入口出现。
- 完成：执行岗位任务端 8 角色登录路由烟测，覆盖 boss / sales / purchase / production / warehouse / finance / pmc / quality 的未登录拦截、旧登录态回登录页、密码登录后回跳 `/m/<role>/tasks`、任务页展示和退出登录。
- 验证：`STYLE_L1_SCENARIOS=business-menu-groups-desktop VITE_ERP_CUSTOMER_KEY=yoyoosun pnpm --dir web style:l1` 通过；`pnpm --dir web smoke:mobile-auth-login-route` 通过，已验证 8 个岗位任务端角色。本轮未跑后端测试，未执行真实账号 seed。
- 下一步：如要进入真实试用环境，需要按 `trial-account-role-menu-checklist.md` 创建或核对真实试用账号、绑定角色和权限，再用真实账号逐个登录复核；或者继续推进字段显示 / 编号规则 customer config。
- 阻塞/风险：本轮是前端自动化回归和 mock 角色链路验证，不代表真实试用账号已创建，也不代表客户库 / 生产库权限已核对。未改 runtime、schema、migration、API、RBAC 真源、菜单配置代码、真实导入、库存 / 出货 / 财务事实或部署。追加前 `progress.md` 为 68 行 / 16264 bytes，未达到归档阈值。
