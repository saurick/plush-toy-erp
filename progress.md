# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-08-before-business-records-debug-cleanup.md`：归档截至 2026-06-08 13:50 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 318 行 / 82540 bytes，超过 80KB 阈值；本轮旧 `project-orders` debug cleanup 前先保留完整现场，再收缩当前入口。

## 2026-06-08 21:08 CST

- 完成：按“继续 Phase 8、一次完成、不要分子阶段”的口径，将 `docs/architecture/phase8-fact-expansion-review.md` 从评审准备改为 Phase 8 统一 docs-only review 已完成；同一文档一次性覆盖生产事实、委外事实、出货事实、库存预留和财务事实五条事实链的真源、边界、状态、冲正、幂等、RBAC、API、UI、测试和停止条件。
- 完成：同步更新 `docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md`、`docs/product/implementation-governance.md`、`docs/product/product-delivery-ledgers.md` 和 `docs/architecture/README.md`，明确 Phase 8 不拆字母子阶段，CAP-019 至 CAP-024 推进到 L2 Reviewed / 实现候选，但 yoyoosun 交付矩阵仍保持 Planned，不写成 runtime、schema、API、UI、客户试用或 Delivery Ready。
- 验证：后续执行 Phase 8 口径扫描、`git diff --check` 和 Markdown 表格解析检查；本轮只改正式文档和过程记录，不触发 migration、server build 或前端回归。
- 下一步：可以在同一 Phase 8 内进入第一个实现闭环；进入实现前仍需按 `docs/product/implementation-governance.md` 明确允许路径、禁止路径、验收命令和停止条件。
- 阻塞/风险：本轮未新增 schema、migration、runtime API、RBAC、UI、库存出库、出货事实、生产事实、委外事实、应收、应付、发票、收付款或对账能力；不能把 Phase 8 统一 review 已完成误读为事实层已经可用。

## 2026-06-08 22:03 CST

- 完成：按“继续阶段 8，一次完成，不要分子阶段”的口径完成 Phase 8 本地最小实现闭环。新增生产事实、委外事实、出货单、出货行、库存预留和财务事实 Ent schema、Atlas migration、后端 `Phase8Usecase` / repo、`phase8` JSON-RPC、前端 `/erp/phase8/facts` 统一事实闭环页面、桌面菜单 / 客户菜单 / 后端内置菜单和菜单权限测试。
- 完成：库存影响收口到后端 usecase：生产领料 / 返工写 OUT、成品入库写 IN、委外发料写 OUT、委外回料写 IN、出货发货写 OUT，取消已过账 / 已发货事实写 REVERSAL；库存预留只检查并占用可用量，不写库存流水；财务事实只维护 AR/AP/invoice/payment/reconciliation 状态，不从 workflow task 或 `shipping_released` 自动派生。
- 完成：同步更新 `docs/current-source-of-truth.md`、`docs/architecture/phase8-fact-expansion-review.md`、`docs/product/product-completion-roadmap.md`、`docs/product/implementation-governance.md` 和 `docs/product/product-delivery-ledgers.md`，把 CAP-019 至 CAP-024 从 L2 review 推进到 L6 / Internal Ready，同时明确目标环境未 migration / 未上线 / 未客户验收，不写成 Delivery Ready。
- 验证：`cd server && make data`、`cd server && go test ./internal/biz ./internal/data`、`cd server && go test ./...`、`cd server && make migrate_apply && make migrate_status` 通过；当前 dev DB migration status 为 OK / pending 0。`cd web && pnpm lint && pnpm css && pnpm test && pnpm style:l1` 通过，前端单测 275 条、style:l1 41 个场景通过；`git diff --check` 通过。Browser 回归覆盖 `http://127.0.0.1:5175/erp/phase8/facts` 桌面浅色、财务事实 tab 切换、刷新交互、移动宽度暗色版面和 console health。
- 下一步：如果要进入目标客户环境，需要按发布流程构建 / 发布、执行目标库 migration、做目标账号 RBAC / 菜单 / 页面回归；若继续扩展，应单独评审打印、报表、核销、自动派生、并发扣减压力、生产订单 / 委外订单专表和移动端岗位任务投影。
- 阻塞/风险：本轮是本地最小事实闭环，不包含真实客户数据导入、目标环境正式验收、完整打印 / 报表 / 发票明细 / 收付款核销 / 对账单 / 总账、物流 / 退货、并发锁升级或自动派生；委外结算明确不写入 `outsourcing_facts` 库存事实，进入 `finance_facts`。

## 2026-06-08 16:53 CST

- 完成：将永绅 yoyoosun 原始图片从微信默认文件名改为语义化文件名：岗位职责流程图、移动端汇报截图、合同订单照片主 `.jpeg` 和合同订单照片 `source-copy` `.jpg`。本轮只重命名文件，不压缩、不改写图片内容。
- 完成：同步更新 `docs/customers/yoyoosun/raw-source-files/README.md` 和 `docs/customers/yoyoosun/raw-source-file-archive-review.md`，把文件清单、checksum 文件名和“保留原始文件名 / 不改名”的旧口径调整为“Excel / PDF 保留来源文件名，微信图片按语义命名并用 hash 追溯来源版本”。
- 验证：后续执行 `rg` 确认旧 `Weixin Image_202604*` 引用无残留；执行 `shasum -a 256` 确认重命名前后的 hash 对应不变；执行 `git diff --check` 覆盖本轮文档通过。
- 下一步：如后续继续新增微信或截图类原件，优先按 `yoyoosun-<content>-<date>.<ext>` 命名，避免继续堆微信默认文件名。
- 阻塞/风险：本轮未改 customer import 语义、runtime、schema、migration、API、UI、seedData、真实导入、库存 / 出货 / 财务事实或部署。工作区仍有多处非本轮既有改动，本轮只隔离处理图片文件名和相关归档文档。

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

## 2026-06-08 16:22 CST

- 完成：在当前 dev DB `plush_erp` 上按 `scripts/seed-role-demo-admins.sh` 受控生成 / 更新 9 个角色演示管理员账号，并统一重置本地 dev 密码；账号包括 `demo_boss`、`demo_sales`、`demo_purchase`、`demo_production`、`demo_warehouse`、`demo_quality`、`demo_finance`、`demo_pmc` 和 `demo_admin`。本轮未生成 `demo_debug`，未分配 `debug_operator`。
- 完成：只读 SQL 复核 9 个账号均为 `is_super_admin=false`、`disabled=false`、单一角色绑定；8 个业务岗位账号具备对应 `mobile.<role>.access`，`demo_admin` 不具备岗位任务端入口权限，全部 demo 账号 debug 权限数为 0。
- 验证：`cd server && make migrate_status` 通过且无 pending migration；`cd server && go test ./internal/data -run 'TestSeedRoleDemo|TestJsonrpcAdmin|TestJsonrpcAuth'` 通过；真实后端 `/rpc/auth` 覆盖 9 个 demo 账号 `admin_login` + `me`，角色、mobile 权限、debug 权限、super admin 和 disabled 边界均通过；`STYLE_L1_SCENARIOS=business-menu-groups-desktop VITE_ERP_CUSTOMER_KEY=yoyoosun pnpm --dir web style:l1` 通过。
- 下一步：如要进入客户试用环境，需要把本轮 dev DB 演示账号核对动作迁移到目标试用环境的授权账号流程，再用真实人员账号或正式试用账号做桌面菜单和岗位任务端手工回归；也可继续推进字段显示 / 编号规则 customer config。
- 阻塞/风险：本轮只影响当前 dev DB 账号数据，不代表客户库 / 生产库账号已创建；未记录真实密码、token 或验证码，未改 runtime、schema、migration、API、RBAC 真源、菜单配置代码、真实导入、库存 / 出货 / 财务事实或部署。追加前 `progress.md` 为 75 行 / 17856 bytes，未达到归档阈值。

## 2026-06-08 16:26 CST

- 完成：新增 `scripts/qa/trial-account-rbac.mjs`，把本轮试用 / 演示账号核对从一次性 Node 命令收口成可重复 QA 入口。脚本只通过真实 `/rpc/auth` 执行 `admin_login` + `me`，校验 9 个 `demo_*` 账号的预期角色、`mobile.<role>.access`、无 `debug.*` 权限、非 super admin 和未禁用；不创建账号、不改密码、不写数据库。
- 完成：同步更新 `scripts/README.md`，在角色演示账号生成说明后补充只读核对命令、密码环境变量和目标后端地址用法。
- 验证：`TRIAL_ACCOUNT_PASSWORD=... node scripts/qa/trial-account-rbac.mjs` 通过，已验证 9 个 demo 账号；`node --check scripts/qa/trial-account-rbac.mjs` 通过；`pnpm --dir web exec prettier --check ../scripts/qa/trial-account-rbac.mjs` 通过；`git diff --check` 通过。
- 下一步：如进入目标试用环境，先在该环境按授权流程 seed / 创建账号，再用 `TRIAL_ACCOUNT_BACKEND_URL` 和 `TRIAL_ACCOUNT_PASSWORD` 运行该核对脚本；之后再做真实浏览器登录、桌面菜单和岗位任务端手工回归。
- 阻塞/风险：本轮只新增只读 QA 脚本和脚本说明，未改 schema、migration、API、RBAC 真源、菜单配置代码、真实账号流程、真实导入、库存 / 出货 / 财务事实或部署。`scripts/README.md` 整篇 Prettier 检查对既有 Markdown 风格仍有格式意见，本轮未做整篇重排以避免无关 diff；使用 `git diff --check` 约束本轮空白问题。

## 2026-06-08 16:33 CST

- 完成：新增 `web/scripts/trialDemoAccountBrowserSmoke.mjs` 并接入 `web/package.json` 的 `smoke:trial-demo-browser`。该浏览器回归使用单端口桌面 Vite 和 yoyoosun 菜单配置，覆盖 9 个 `demo_*` 账号桌面登录 / 菜单可见性 / 旧入口不可见，8 个岗位账号 `/m/<role>/tasks` 授权进入，以及 `demo_admin` 访问岗位任务端时被登录页拒绝。
- 完成：同步更新 `scripts/README.md`，在演示账号核对说明后补充真实浏览器回归命令和 `TRIAL_BROWSER_SMOKE_BASE_URL` 用法。
- 验证：`TRIAL_ACCOUNT_PASSWORD=... pnpm --dir web smoke:trial-demo-browser` 通过，已验证桌面账号 9 个、岗位任务端 8 个、拒绝态 1 个；`pnpm --dir web exec prettier --check scripts/trialDemoAccountBrowserSmoke.mjs package.json ../scripts/qa/trial-account-rbac.mjs ../scripts/README.md` 通过；`node --check web/scripts/trialDemoAccountBrowserSmoke.mjs && node --check scripts/qa/trial-account-rbac.mjs` 通过；`git diff --check` 通过。
- 下一步：目标试用环境准备好后，先运行 `trial-account-rbac.mjs` 确认账号 / RBAC，再运行 `smoke:trial-demo-browser` 确认真实页面入口；如果两者都通过，就可以按 `trial-training-note.md` 做人工试用培训和反馈记录。
- 阻塞/风险：本轮仍只覆盖当前 dev DB 和本机后端 / 前端，不代表客户库 / 生产库账号已创建或权限已核对；未改 schema、migration、后端 RBAC 真源、真实导入、库存 / 出货 / 财务事实或部署。截图输出位于 `web/output/playwright/trial-demo-account-browser-smoke/`，仅作本地验证 evidence，不纳入 git。

## 2026-06-08 16:39 CST

- 完成：新增 `docs/customers/yoyoosun/trial-environment-runbook.md`，把目标试用环境的账号 / RBAC / 桌面菜单 / 岗位任务端核对步骤收口成正式客户手册；手册要求通过环境变量传入目标地址和密码，禁止记录真实密码、token、验证码、密钥、DSN 或客户敏感信息。
- 完成：同步更新 `docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/current-source-of-truth.md` 和 `docs/product/product-delivery-ledgers.md`，把试用培训说明、账号角色菜单核对清单与目标试用环境执行手册挂到同一交付链路。
- 验证：本轮文档索引更新后继续执行脚本语法、Prettier 检查和 `git diff --check`。未重新跑后端测试或真实浏览器回归，因为本轮未改 runtime / API / RBAC / UI 行为。
- 下一步：需要目标试用环境的后端地址、前端地址和授权试用账号密码后，按 `trial-environment-runbook.md` 运行 `trial-account-rbac.mjs` 与 `smoke:trial-demo-browser`；通过后再进入人工培训和试用反馈记录。
- 阻塞/风险：当前仍只有本地 dev DB / 本机页面验证结果，不代表目标客户环境已创建账号、已完成 RBAC 核对或已通过真实浏览器回归。追加前 `progress.md` 为 96 行 / 22895 bytes，未达到归档阈值。

## 2026-06-08 16:42 CST

- 完成：新增 `config/customers/yoyoosun/fieldNumberingConfig.mjs`，把 yoyoosun 字段显示和编号规则收口成 Customer Config 评审草案；文件显式标记 `runtimeEnabled=false`，并记录不新增 tenant、不改 schema、不改 migration、不改后端 RBAC、不改 Workflow / Fact、不执行真实导入。
- 完成：同步更新 `config/customers/yoyoosun/README.md`、`docs/customers/yoyoosun/customer-config-draft.md`、`docs/current-source-of-truth.md` 和 `docs/product/product-delivery-ledgers.md`，明确字段 / 编号当前只是评审清单，不是已生效 runtime 规则。
- 验证：`node --check config/customers/yoyoosun/fieldNumberingConfig.mjs && node --check web/scripts/trialDemoAccountBrowserSmoke.mjs && node --check scripts/qa/trial-account-rbac.mjs` 通过；`fieldNumberingConfig.mjs` 边界断言通过，确认 `runtimeEnabled=false` 且不改 schema / import；`pnpm --dir web exec prettier --check ...` 通过；`git diff --check` 通过。本轮未跑前端 / 后端测试，因为没有接入运行时、API、RBAC、schema 或 UI。
- 下一步：字段 / 编号需要客户确认后，才能决定是否进入前端字段显示配置、导入 loader 设计或后续 schema/runtime 评审；未确认前不应把款式、颜色、尺寸、采购订单号等字段落成 Product Core。
- 阻塞/风险：草案中列出的字段和编号仍来自样本、导入分类和问题待办，不能当客户已签字口径或行业默认模板。追加前 `progress.md` 为 103 行 / 24264 bytes，未达到归档阈值。

## 2026-06-08 16:51 CST

- 完成：新增 `docs/customers/yoyoosun/field-numbering-confirmation-checklist.md`，把字段显示、字段必填和编号规则拆成可给客户确认的问题清单，覆盖客户、供应商、销售订单、销售订单明细、产品 / SKU、采购和合同编号。
- 完成：同步更新 `docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/current-source-of-truth.md` 和 `docs/product/product-delivery-ledgers.md`，明确该清单是客户确认材料，不是已生效 runtime 配置、schema、导入或行业默认模板。
- 验证：`git diff --check` 通过；`node --check config/customers/yoyoosun/fieldNumberingConfig.mjs && node --check web/scripts/trialDemoAccountBrowserSmoke.mjs && node --check scripts/qa/trial-account-rbac.mjs` 通过；`pnpm --dir web exec prettier --check ...` 通过；`fieldNumberingConfig.mjs` 边界断言通过，确认 `runtimeEnabled=false` 且不改 schema / import / 后端 RBAC。本轮未跑前端 / 后端测试，因为没有接入运行时、API、RBAC、schema 或 UI。
- 下一步：拿该确认清单和客户逐项确认；确认后只把非敏感结论写回 `customer-config-draft.md`、`fieldNumberingConfig.mjs`、`question-backlog.md` 或 `delta-register.md`，再决定是否进入 runtime / schema / import loader 任务。
- 阻塞/风险：清单仍是 Draft，不能替代客户签字确认；未确认前不能把客户字段、款式、颜色、尺寸、采购订单号或合同样式落成 Product Core。追加前 `progress.md` 为 110 行 / 25864 bytes，未达到归档阈值。

## 2026-06-08 17:09 CST

- 完成：新增 `scripts/qa/customer-config-boundaries.mjs`，只读校验 yoyoosun 字段 / 编号 Customer Config 草案仍为 draft，`runtimeEnabled=false`，且不放开 tenant、schema、migration、后端 RBAC、Workflow / Fact 或真实导入边界；同时校验字段候选和编号候选的必填说明完整。
- 完成：同步更新 `scripts/README.md`，把 customer config 草案边界检查加入 QA 脚本总览和推荐执行顺序。
- 验证：`node --check scripts/qa/customer-config-boundaries.mjs && node scripts/qa/customer-config-boundaries.mjs` 通过；`node --check scripts/qa/trial-account-rbac.mjs && node --check web/scripts/trialDemoAccountBrowserSmoke.mjs` 通过；`pnpm --dir web exec prettier --check ...` 通过；`git diff --check` 通过。
- 下一步：后续只要调整 yoyoosun 字段 / 编号草案，先跑 `node scripts/qa/customer-config-boundaries.mjs`；客户确认后再决定是否把已确认项推进到 runtime、schema、导入 loader 或行业模板评审。
- 阻塞/风险：QA 守卫只能防草案边界被误改，不能替代客户确认，也不证明字段 / 编号已经适合进入 Product Core。追加前 `progress.md` 为 124 行 / 28755 bytes，未达到归档阈值。

## 2026-06-08 17:11 CST

- 完成：将 `scripts/qa/customer-config-boundaries.mjs` 接入 `scripts/qa/fast.sh`、`scripts/qa/full.sh` 和 `scripts/qa/strict.sh`，让日常、提交前和严格 QA 都会自动检查 yoyoosun Customer Config 草案边界。
- 验证：`bash -n scripts/qa/fast.sh scripts/qa/full.sh scripts/qa/strict.sh` 通过；`node scripts/qa/customer-config-boundaries.mjs` 通过；目标 `pnpm --dir web exec prettier --check ...` 通过；`git diff --check` 通过。未跑完整 `fast/full/strict`，因为会触发较重的 web/server 测试；本轮改动已覆盖 shell 语法和新增守卫主路径。
- 下一步：如果继续不接目标试用环境，可以把客户确认后的结论回写流程做成小型模板；如果已有客户确认或环境地址，则转入对应实跑。
- 阻塞/风险：QA 主路径会防止草案边界漂移，但仍不能替代客户确认或目标环境验证。追加前 `progress.md` 为 131 行 / 30025 bytes，未达到归档阈值。

## 2026-06-08 17:12 CST

- 完成：执行 `bash scripts/qa/fast.sh`，验证新接入的 customer config 草案边界检查能随 fast 主路径运行。
- 验证：`scripts/qa/fast.sh` 通过，覆盖 `db-guard`、`error-code-sync`、`error-codes`、`customer-config-boundaries`、web `pnpm lint` / `pnpm css`、server `go test ./internal/... ./pkg/...`。
- 下一步：继续不接目标环境时，可把客户确认后的结论回写流程模板化；若需要提交，则先按当前工作区区分本轮改动和已有 raw-source 重命名现场。
- 阻塞/风险：本轮 fast 验证不包含完整 web build、前端 test、全量 Go `go test ./...`、真实浏览器回归或目标试用环境验证。追加前 `progress.md` 为 137 行 / 31035 bytes，未达到归档阈值。

## 2026-06-08 17:14 CST

- 完成：执行 `bash scripts/qa/full.sh`，验证新接入的 customer config 草案边界检查能随提交前全量 QA 主路径运行。
- 验证：`scripts/qa/full.sh` 通过，覆盖 `db-guard`、`error-code-sync`、`error-codes`、`customer-config-boundaries`、`secrets`、`govulncheck`、web `lint/css/test/build`、server `go test ./...` 和 `make build`；随后 `git diff --check` 通过。
- 下一步：如继续本地闭环，可执行 `scripts/qa/strict.sh` 或补客户确认结论回写模板；如要提交，需要先明确是否把已有 raw-source 文件重命名现场纳入同一次提交。
- 阻塞/风险：`govulncheck` 报告当前代码可达漏洞为 0，但依赖树仍有未被当前代码调用的漏洞提示；web test/build 仍有既有 Node module type warning 和 Vite chunk warning。本轮仍未做真实浏览器回归或目标试用环境验证。追加前 `progress.md` 为 143 行 / 31826 bytes，未达到归档阈值。

## 2026-06-08 17:27 CST

- 完成：执行 `bash scripts/qa/strict.sh`，验证新接入的 customer config 草案边界检查能随严格 QA 主路径运行。
- 验证：`scripts/qa/strict.sh` 通过，覆盖 `db-guard`、`secrets`、`customer-config-boundaries`、`shellcheck`、`shfmt`、`govulncheck`、web 严格 eslint / stylelint / test / build、server `go test ./...` 和 `make build`；随后 `git diff --check` 通过。
- 下一步：本地 QA 闭环已覆盖 fast / full / strict。若要提交，需要先确认是否把已有 raw-source 文件重命名现场纳入同一次提交；若不提交，可以继续补客户确认结论回写模板或等待目标试用环境信息。
- 阻塞/风险：`govulncheck` 报告当前代码可达漏洞为 0，但依赖树仍有未被当前代码调用的漏洞提示；web test/build 仍有既有 Node module type warning 和 Vite chunk warning。本轮仍未做真实浏览器回归或目标试用环境验证。追加前 `progress.md` 为 149 行 / 32820 bytes，未达到归档阈值。

## 2026-06-08 17:29 CST

- 完成：新增 `docs/customers/yoyoosun/field-numbering-confirmation-result-template.md`，把字段 / 编号客户确认结果的回写方式模板化，明确结论应写入 `customer-config-draft.md`、`fieldNumberingConfig.mjs`、`question-backlog.md`、`delta-register.md` 或后续产品评审任务。
- 完成：同步更新 `docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/current-source-of-truth.md` 和 `docs/product/product-delivery-ledgers.md`，把确认清单和结果回写模板挂到 Customer Config 交付链路。
- 验证：`git diff --check` 通过；`node scripts/qa/customer-config-boundaries.mjs` 通过。本轮是 docs-only，没有重跑 fast / full / strict。
- 下一步：等待客户确认后，按该模板回写非敏感结论；若要提交，需要先确认是否把已有 raw-source 文件重命名现场纳入同一次提交。
- 阻塞/风险：模板不能替代客户签字确认；即使客户确认，也不能直接把 SKU、采购订单、出货、库存、财务或打印模板内核结论接入 runtime。追加前 `progress.md` 为 155 行 / 33866 bytes，未达到归档阈值。

## 2026-06-08 17:47 CST

- 完成：新增 `scripts/import/customerImportExecute.mjs` 作为 yoyoosun 受控真实导入执行器；默认只校验 dry-run package、approval、backup evidence、unresolved block、forbidden auto-import 和 supported target，并输出 execution report。真实执行必须显式 `--execute`、`CUSTOMER_IMPORT_CONFIRM=EXECUTE_YOYOOSUN_IMPORT`、目标后端和管理员凭据，且只走 V1 JSON-RPC API。
- 完成：新增 `scripts/import/customerImportExecute.test.mjs` 和 sample approval fixture，覆盖 help、参数解析、报告模式、备份证据缺失、forbidden source、unresolved block 和执行确认短语门禁；同步更新 `scripts/README.md`、`docs/customers/yoyoosun/import-strategy.md`、`docs/customers/yoyoosun/import-dry-run-plan.md`、`docs/customers/yoyoosun/import-acceptance-checklist.md`、`docs/current-source-of-truth.md` 和 `docs/product/product-delivery-ledgers.md`。
- 验证：`node --check scripts/import/customerImportExecute.mjs && node --check scripts/import/customerImportExecute.test.mjs` 通过；`node --test scripts/import/customerImportExecute.test.mjs` 通过。后续还需跑格式、import 相关测试和 fast / full / strict 后再提交推送。
- 下一步：执行格式检查、导入工具专项测试、customer config 守卫和仓库 QA；通过后按本轮用户要求提交并推送所有代码。
- 阻塞/风险：本轮完成 execution loader 和门禁，不代表已对客户库真实导入；该历史记录中的真实导入门禁说明已被 19:20 CST 的 Phase 7 当前规则收口为“只能模拟、不可执行真实导入”。执行器拒绝 product_skus、purchase_orders、shipments、stock reservations、inventory facts 和 finance facts。追加前 `progress.md` 为 162 行 / 35050 bytes，未达到归档阈值。

## 2026-06-08 17:50 CST

- 完成：将 `scripts/import/*.test.mjs` 接入 `scripts/qa/fast.sh`、`scripts/qa/full.sh` 和 `scripts/qa/strict.sh`，确保 dry-run、freeze 和 execution loader 进入日常、提交前和严格 QA 主路径；同步更新 `scripts/README.md`。
- 验证：`node --test scripts/import/customerImportDryRun.test.mjs scripts/import/customerSourceSnapshotFreezeCheck.test.mjs scripts/import/customerImportExecute.test.mjs` 通过，覆盖 36 条 import 工具测试；`bash scripts/qa/fast.sh`、`bash scripts/qa/full.sh`、`bash scripts/qa/strict.sh` 均通过；`git diff --check` 通过。
- 下一步：按用户要求提交并推送当前所有代码。
- 阻塞/风险：`govulncheck` 仍报告当前代码可达漏洞为 0，但依赖树存在未被当前代码调用的漏洞提示；web test/build 仍有既有 Node module type warning 和 Vite chunk warning。真实客户库导入仍未执行，需等客户 sign-off、备份证据、目标环境和导入后对账。追加前 `progress.md` 为 192 行 / 36896 bytes，未达到归档阈值。

## 2026-06-08 17:59 CST

- 完成：133 部署本地构建时发现 `server/Dockerfile` 的 web-builder 阶段未复制根目录 `config/`，导致服务端镜像内置前端构建无法解析 `config/customers/yoyoosun/menuConfig.mjs`；已补 `COPY config /config`，与独立 `web/Dockerfile` 的 customer config 构建边界对齐。
- 验证：`node --test web/src/erp/config/menuPermissions.test.mjs` 通过；`git diff --check` 通过。后续将提交推送该构建修复，并用新提交重新构建 server/web 镜像部署到 `192.168.0.133`。
- 下一步：提交推送 Dockerfile 修复，重新本地构建镜像，上传到 133，远端 `docker load`、更新 `.env` 镜像标签、执行 migration、重启 Compose、健康检查和 smoke。
- 阻塞/风险：这是 Docker 镜像构建主路径修复，不涉及 schema、migration、runtime API 语义或真实客户导入；真实部署仍需等待新镜像构建、远端加载和健康检查。追加前 `progress.md` 为 199 行 / 37981 bytes，未达到归档阈值。

## 2026-06-08 19:13 CST

- 完成：同步收口 Phase 7 目标口径，明确当前 yoyoosun 没有可直接执行的客户真实数据，Phase 7 先用 seed、fixture 或手工构造的模拟客户、供应商、联系人和销售订单数据做试用环境、账号、RBAC、菜单、V1 页面、岗位任务端和培训口径演练；不拆子阶段，也不把模拟数据写成真实导入。
- 完成：更新 `docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`、`docs/current-source-of-truth.md`、`docs/customers/yoyoosun/README.md`、`docs/customers/yoyoosun/trial-training-note.md`、`docs/customers/yoyoosun/trial-environment-runbook.md` 和 `docs/customers/yoyoosun/import-acceptance-checklist.md`，把模拟数据、真实导入、客户字段确认、出货 / 库存 / 财务事实边界同步到 roadmap、台账、真源索引和客户试用文档。
- 验证：子阶段拆分关键词扫描无残留；`git diff --check` 通过；`node scripts/qa/customer-config-boundaries.mjs` 通过。
- 下一步：准备或选择模拟数据集，在目标试用环境或本地等价环境跑账号 / RBAC / 菜单 / V1 页面 / 岗位任务端回归；当前不进入真实 import。
- 阻塞/风险：本轮为 docs-only，未新增 seed / fixture，未执行真实导入，未改 schema、migration、runtime API、RBAC 真源、Workflow / Fact usecase、库存 / 出货 / 财务事实或部署。追加前 `progress.md` 为 206 行 / 39026 bytes，未达到归档阈值。

## 2026-06-08 19:20 CST

- 完成：按“不要拆 A/B/C/D 子阶段、一次性做完 Phase 7、真实数据无法导入只能模拟”的口径继续收口规则层。`AGENTS.md` 新增 Phase 7 规则；`docs/product/implementation-governance.md` 新增 Phase 7 不拆字母子阶段、不可执行真实导入、只能用模拟数据一次性验收的治理要求。
- 完成：继续更新 `docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`、`docs/current-source-of-truth.md`、`docs/customers/yoyoosun/README.md`、`docs/customers/yoyoosun/trial-training-note.md`、`docs/customers/yoyoosun/trial-environment-runbook.md` 和 `docs/customers/yoyoosun/import-acceptance-checklist.md`，移除旧的真实导入延续口径，改为当前 Phase 7 只做模拟数据试点部署与验收。
- 验证：后续执行子阶段和后续真实导入口径扫描、`git diff --check`、`node scripts/qa/customer-config-boundaries.mjs`。
- 下一步：准备或选择模拟数据集，在目标试用环境或本地等价环境一次性跑完账号 / RBAC / 菜单 / V1 页面 / 岗位任务端 / 培训验收；不进入真实 import。
- 阻塞/风险：本轮仍为 docs-only，未新增 seed / fixture，未执行真实导入，未改 schema、migration、runtime API、RBAC 真源、Workflow / Fact usecase、库存 / 出货 / 财务事实或部署。追加前 `progress.md` 为 214 行 / 40633 bytes，未达到归档阈值。

## 2026-06-08 19:36 CST

- 完成：新增 `scripts/qa/phase7-simulated-trial-data.mjs` 和测试，作为 Phase 7 模拟试用数据入口；默认只生成报告，显式 `--apply` 且 `PHASE7_SIM_CONFIRM=APPLY_SIMULATED_PHASE7_DATA` 后才通过 V1 JSON-RPC 创建 / 复用带 `SIM-YOYOOSUN-PHASE7` 前缀的模拟客户、供应商、联系人、销售订单和销售订单行。
- 完成：将 Phase 7 模拟数据工具测试接入 `scripts/qa/fast.sh`、`scripts/qa/full.sh` 和 `scripts/qa/strict.sh`；同步更新 `scripts/README.md`、`docs/customers/yoyoosun/trial-environment-runbook.md`、`docs/customers/yoyoosun/README.md`、`docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md` 和 `docs/product/product-delivery-ledgers.md`，明确该脚本不执行真实 import，不写 `business_records`，不生成 schema / migration，也不创建出货、库存、财务、发票、付款、应收或应付事实。
- 验证：`node --check scripts/qa/phase7-simulated-trial-data.mjs && node --check scripts/qa/phase7-simulated-trial-data.test.mjs` 通过；`node --test scripts/qa/phase7-simulated-trial-data.test.mjs` 通过；`bash -n scripts/qa/fast.sh scripts/qa/full.sh scripts/qa/strict.sh` 通过；报告模式 `node scripts/qa/phase7-simulated-trial-data.mjs --out output/customers/yoyoosun/phase7-simulated-trial` 通过；`bash scripts/qa/fast.sh` 通过；`git diff --check` 通过。
- 下一步：在本地或目标试用环境准备一个活跃 product ID 和 unit ID 后，用 `--apply` 写入模拟数据，再按 runbook 一次性跑账号 / RBAC / 菜单 / V1 页面 / 岗位任务端 / 培训验收；仍不进入真实 import。
- 阻塞/风险：本轮没有实际连接目标后端写入模拟数据，因为缺少目标环境凭据和可用 product/unit ID；未改 schema、migration、runtime API 语义、RBAC 真源、Workflow / Fact usecase、库存 / 出货 / 财务事实或部署。追加前 `progress.md` 为 222 行 / 42037 bytes，未达到归档阈值。

## 2026-06-08 19:42 CST

- 完成：新增 `scripts/seed-phase7-sim-masterdata.sh` 和 `server/cmd/seed-phase7-sim-masterdata`，用于 Phase 7 试用前 seed 带 `SIM-YOYOOSUN-PHASE7` 前缀的模拟单位 / 产品主数据；本地 dev DB 已执行一次，得到 `unit_id=1`、`product_id=1`。
- 完成：同步更新 `scripts/README.md`、`docs/customers/yoyoosun/trial-environment-runbook.md`、`docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md` 和 `docs/product/product-delivery-ledgers.md`，明确该 seed 只写 `units` / `products` 主数据，不写客户、供应商、联系人、销售订单、`business_records`、库存、出货或财务事实。
- 验证：`cd server && go test ./cmd/seed-phase7-sim-masterdata` 通过；`bash -n scripts/seed-phase7-sim-masterdata.sh` 通过；`cd server && go run ./cmd/seed-phase7-sim-masterdata --help` 通过；`bash scripts/seed-phase7-sim-masterdata.sh` 通过；DB 只读查询确认模拟产品 / 单位活跃；`node scripts/qa/phase7-simulated-trial-data.mjs --product-id 1 --unit-id 1 --out output/customers/yoyoosun/phase7-simulated-trial` 通过；`git diff --check` 通过。
- 下一步：拿到本地或目标环境管理员 token/password 后，执行 `PHASE7_SIM_CONFIRM=APPLY_SIMULATED_PHASE7_DATA ... phase7-simulated-trial-data.mjs --apply --product-id 1 --unit-id 1`，再跑账号 / RBAC / 浏览器入口回归；仍不执行真实 import。
- 阻塞/风险：当前 shell 没有 `PHASE7_SIM_ADMIN_TOKEN`、`PHASE7_SIM_ADMIN_PASSWORD`、`TRIAL_ACCOUNT_PASSWORD` 或 `ERP_ROLE_DEMO_PASSWORD`，dev 配置内置 admin 密码也不匹配，因此本轮未写入模拟客户 / 供应商 / 联系人 / 销售订单；未重置现有 demo 密码。追加前 `progress.md` 为 230 行 / 44066 bytes，未达到归档阈值。

## 2026-06-08 19:44 CST

- 完成：将 `scripts/qa/fast.sh`、`scripts/qa/full.sh` 和 `scripts/qa/strict.sh` 中的 import 工具测试从单次 glob 并行执行改为逐文件顺序执行，避免多个会 spawn CLI 子进程的 import 测试在同一 `node --test` 进程里偶发假红。
- 验证：单独 `node --test scripts/import/customerSourceSnapshotFreezeCheck.test.mjs` 通过；`bash -n scripts/qa/fast.sh scripts/qa/full.sh scripts/qa/strict.sh scripts/seed-phase7-sim-masterdata.sh` 通过；`bash scripts/qa/fast.sh` 通过；`git diff --check` 通过。
- 下一步：仍是等待可用管理员凭据后执行 Phase 7 模拟客户 / 供应商 / 联系人 / 销售订单 `--apply`，再跑账号 / RBAC / 浏览器入口回归。
- 阻塞/风险：本轮修复 QA 假红和准备模拟 product/unit，但仍未写入模拟客户 / 订单数据；未提交、未推送。追加前 `progress.md` 为 238 行 / 45894 bytes，未达到归档阈值。

## 2026-06-08 19:50 CST

- 完成：按用户确认的演示密码口径，将 9 个 `demo_*` 账号重置为 `12345678`，并把 Phase 7 模拟数据脚本改成默认岗位账号模式：`demo_sales` 写客户、联系人和销售订单，`demo_purchase` 写供应商和供应商联系人；修正模拟供应商 `supplier_type=material`，符合 schema 约束。
- 完成：本地执行 Phase 7 模拟数据 `--apply` 成功，报告为 `output/customers/yoyoosun/phase7-simulated-trial/phase7-simulated-trial-report.json`，`mode=apply-simulated-data`、`simulatedOnly=true`、`realCustomerImport=false`；DB 只读核对确认模拟客户、供应商、联系人、销售订单和销售订单行均已存在。
- 验证：`TRIAL_ACCOUNT_PASSWORD=12345678 node scripts/qa/trial-account-rbac.mjs` 通过，覆盖 9 个 demo 账号角色、岗位权限、debug 权限、super admin 和 disabled 边界；`pnpm --dir web smoke:trial-demo-browser` 通过，覆盖桌面账号 9 个、岗位任务端 8 个、拒绝态 1 个；`bash scripts/qa/fast.sh` 通过；`git diff --check` 通过。
- 下一步：可按当前本地 evidence 继续整理 Phase 7 验收记录；若要提交推送，需要用户明确确认提交推送。
- 阻塞/风险：本轮只在本地 dev DB 写入模拟数据，不代表目标客户环境已写入或客户已验收；未执行真实 import，未写 `business_records`，未创建出货、库存、财务、发票、付款、应收或应付事实。追加前 `progress.md` 为 245 行 / 46862 bytes，未达到归档阈值。

## 2026-06-08 20:20 CST

- 完成：新增 `docs/customers/yoyoosun/phase7-simulated-trial-acceptance.md`，正式记录 Phase 7 本地模拟数据试用验收结果：本地 dev DB 已完成模拟主数据、模拟客户 / 供应商 / 联系人 / 销售订单写入，账号 RBAC、浏览器入口 smoke 和 `fast.sh` 均已通过。
- 完成：同步更新 `docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md` 和 `docs/product/product-delivery-ledgers.md`，明确 Phase 7 不拆 A/B/C/D 或字母子阶段，真实客户数据当前不可导入，只能模拟；本地通过不等于目标客户环境正式验收，也不代表进入 Phase 8。
- 验证：`git diff --check` 通过；`node scripts/qa/customer-config-boundaries.mjs` 通过；`node --test scripts/qa/phase7-simulated-trial-data.test.mjs` 通过。
- 下一步：若用户确认以本地模拟试用作为当前 Phase 7 完成口径，可记录 Phase 7 closure decision；若要客户正式试用验收，需要在目标环境复跑账号、RBAC、菜单、V1 页面和岗位任务端验证并追加 evidence。
- 阻塞/风险：本轮只做正式文档记录和台账同步，未改 schema、migration、runtime、API、RBAC 真源、Workflow / Fact usecase、部署脚本或 DB；目标客户环境和客户正式验收仍未完成。追加前 `progress.md` 为 253 行 / 48422 bytes，未达到归档阈值。

## 2026-06-08 20:25 CST

- 完成：按用户继续指令，将“本地模拟试用通过”正式写为当前 Phase 7 关闭口径；更新 `docs/customers/yoyoosun/phase7-simulated-trial-acceptance.md`、`docs/customers/yoyoosun/decision-log.md`、`docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md` 和 `docs/product/product-delivery-ledgers.md`。
- 完成：明确 Phase 7 关闭不等于目标客户环境正式验收、不等于真实客户数据导入、不等于 Phase 8 事实层能力已实现；目标环境验收保留为交付后续项，Phase 8 只能先进入事实层评审准备。
- 验证：`git diff --check` 通过；`node scripts/qa/customer-config-boundaries.mjs` 通过；`node --test scripts/qa/phase7-simulated-trial-data.test.mjs` 通过。
- 下一步：开始 Phase 8 前，应先做事实层评审准备，优先确认生产、委外、出货、库存预留、财务哪条链路先开，不直接写 runtime / migration。
- 阻塞/风险：本轮只做 Phase 7 closure 文档口径更新，未改 schema、migration、runtime、API、RBAC 真源、Workflow / Fact usecase、部署脚本或 DB。追加前 `progress.md` 为 261 行 / 49904 bytes，未达到归档阈值。

## 2026-06-08 20:36 CST

- 完成：按“开启 Phase 8，但不拆任何字母子阶段”的口径新增 `docs/architecture/phase8-fact-expansion-review.md`，正式登记生产事实、委外事实、出货事实、库存预留和财务事实五条范围项的总评审入口、门禁、停止条件和禁止项。
- 完成：同步更新 `docs/architecture/README.md`、`docs/document-inventory.md`、`docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md`、`docs/product/implementation-governance.md` 和 `docs/product/product-delivery-ledgers.md`。台账中 Phase 8 相关能力和 yoyoosun 出货 / 预留 / 财务 / 生产 / 委外条目只推进到 Planned / 总评审范围，不写成 runtime、schema、API、UI 或 Delivery Ready。
- 验证：`git diff --check` 通过；`node scripts/qa/customer-config-boundaries.mjs` 通过；Phase 8 口径扫描仅命中“不拆字母子阶段”“未实现 / 不写成 Delivery Ready”等正确边界说明，未再出现字母子阶段编号。
- 下一步：已被 2026-06-08 21:08 CST 记录更新为 Phase 8 统一 docs-only review 一次覆盖五条事实链；后续按实现门禁进入具体实现闭环。
- 阻塞/风险：本轮只开启 Phase 8 评审层，未改 schema、migration、runtime、API、RBAC 真源、Workflow / Fact usecase、部署脚本或 DB；不能把 Phase 8 开启误读为生产、委外、出货、库存预留或财务事实已实现。追加前 `progress.md` 为 269 行 / 51139 bytes，未达到归档阈值。

## 2026-06-08 22:26 CST

- 完成：按“下一步先做目标环境发布与客户验收闭环，不继续扩大 Phase 8 功能”的口径，新增 `docs/customers/yoyoosun/phase8-target-release-acceptance.md`，收口目标环境发布、镜像加载、Atlas migration、健康检查、Phase 8 五页签只读验收、权限验收、受控写入验收、evidence 模板和停止条件。
- 完成：同步更新 `docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`、`docs/architecture/phase8-fact-expansion-review.md` 和 `deployments/yoyoosun/README.md`，明确该手册是 Draft / Runbook Draft，不代表目标环境已发布、migration 已执行或客户已签收；CAP-019 到 CAP-024 仍不能写成 Delivery Ready。
- 验证：`git diff --check` 通过；`node scripts/qa/customer-config-boundaries.mjs` 通过；Phase 8 / Delivery Ready 口径扫描只命中“手册草案、不代表发布 / 验收、不得写成 Delivery Ready”等正确边界说明。
- 下一步：执行文档格式 / 链接 / 关键口径扫描；若用户确认进入真实发布，再按手册准备镜像、目标服务器备份、migration 和验收 evidence。
- 阻塞/风险：本轮为 docs-only，未改 schema、migration、runtime、API、RBAC、部署脚本、客户配置 runtime 或目标环境；未执行真实发布、未连接目标服务器、未导入真实客户数据。追加前 `progress.md` 为 294 行 / 56727 bytes，未达到归档阈值。

## 2026-06-08 22:53 CST

- 完成：按低配 Docker 发布主路径将 Phase 8 `a490b92` 发布到当前目标环境 `192.168.0.133`；本地构建 `linux/amd64` 镜像 `plush-toy-erp-server:20260608T2230-a490b92-phase8-amd64` 和 `plush-toy-erp-web:20260608T2230-a490b92-phase8-amd64`，上传到 `/opt/plush-toy-erp/releases/20260608T2230-a490b92-phase8-amd64`，远端只执行 `docker load`、migration、Compose 重建和 smoke。
- 完成：同步远端 migration 目录，执行 `migrate_online.sh --apply`，远端 Atlas migration 从 `20260530161152` 到 `20260608134530`，pending 0；备份 `.env` 后只重建 `app-server` 和 `web-desktop`；生成 post-deploy 逻辑备份 `plush_erp-postdeploy-20260608T2230-a490b92-phase8-amd64.dump`。
- 完成：新增 `docs/customers/yoyoosun/phase8-target-release-evidence-2026-06-08.md`，并同步 README、document inventory、current source、roadmap、Phase 8 review、deployment README 和 product-delivery-ledgers；台账更新为 Target Deployed / Acceptance Pending，不写 Delivery Ready。
- 验证：目标环境 `app-server` 和 `web-desktop` 运行新镜像；`/healthz=ok`、`/readyz=ready`、`/erp/phase8/facts` HTTP 200；未登录 `phase8.list_finance_facts` 返回 `40302 未登录` 且 `unknownUrl=false`；server logs 近 5 分钟无 `panic` / `fatal`。
- 下一步：准备或创建目标环境试用账号与权限后，执行登录态 Phase 8 只读 API / 浏览器验收；如需受控写入验收，必须先准备模拟数据、冲正方案和客户确认。
- 阻塞/风险：目标环境没有 `demo_boss`，登录态 JSON-RPC smoke 未完成；本次执行前未记录明确 pre-migration 备份 evidence，已补 post-deploy 备份；为保留上一版回滚镜像且可回收空间较小，本轮未执行 `docker image prune -a -f`。真实客户数据导入、完整打印、报表、发票明细、收付款核销、对账单、物流退货、并发锁升级和自动派生仍未做。追加前 `progress.md` 为 302 行 / 58332 bytes，未达到归档阈值。

## 2026-06-08 23:07 CST

- 完成：补齐目标环境 Phase 8 账号和登录态 smoke blocker。通过受控 seed 命令在目标数据库创建 / 更新 9 个 `demo_*` 角色试用账号，未创建 `demo_debug`，未分配 `debug_operator`；密码只通过本地环境变量传入，未写入仓库文档。
- 完成：同步更新 `docs/customers/yoyoosun/phase8-target-release-evidence-2026-06-08.md`、`docs/customers/yoyoosun/phase8-target-release-acceptance.md`、`docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md`、`docs/architecture/phase8-fact-expansion-review.md`、`docs/product/product-delivery-ledgers.md`、`deployments/yoyoosun/README.md` 和 `docs/customers/yoyoosun/README.md`；把“目标环境没有 demo_boss / 登录态 smoke 未完成”更新为“目标账号 RBAC 和登录态只读 API smoke 已通过”，同时把 pre-migration 备份 evidence 加为后续 migration apply 的硬门槛。
- 验证：`TRIAL_ACCOUNT_PASSWORD=... TRIAL_ACCOUNT_BACKEND_URL=http://192.168.0.133:8300 node scripts/qa/trial-account-rbac.mjs` 通过，覆盖 9 个 demo 账号角色、岗位权限、debug 权限、super admin 和 disabled 边界；`demo_boss` 登录后 `phase8.list_finance_facts` 返回 code `0`、`total=0`，确认登录态只读 handler 和权限生效。
- 下一步：进入客户正式业务验收；如需受控写入验收，必须先准备模拟数据、冲正方案和客户授权。后续任何目标环境 migration apply 前，必须先记录 pre-migration 备份 evidence。
- 阻塞/风险：客户正式验收和受控写入验收仍未做；本次执行前缺 pre-migration 备份 evidence 不能倒补，只能保留为发布风险记录并用 post-deploy 备份作为当前状态恢复点；旧镜像仍保留用于回滚，未执行镜像清理。真实客户数据导入、完整打印、报表、发票明细、收付款核销、对账单、物流退货、并发锁升级和自动派生仍未做。追加前 `progress.md` 为 311 行 / 60388 bytes，未达到归档阈值。

## 2026-06-08 23:55 CST

- 完成：按“一步做完 Phase 8、客户验收不作为阶段阻塞、真实数据只能模拟”的口径完成 Phase 8 目标环境内部模拟事实闭环。新增 `scripts/qa/phase8-simulated-fact-closure.mjs` 及测试，并接入 `scripts/qa/fast.sh`、`full.sh`、`strict.sh`；脚本只接受 `SIM-YOYOOSUN-PHASE8` 模拟数据和显式确认，覆盖生产 create/post/cancel、预留 release/consume、委外 create/post/cancel、出货 create/add/ship/cancel、财务 post/settle/cancel。
- 完成：修复无批次库存余额扣减路径中的 PostgreSQL placeholder 间隙问题，补充本地 repo 测试和 PostgreSQL gated 集成测试；本地构建并发布 `plush-toy-erp-server:20260608T2345-phase8-closure-amd64` 到目标环境，保留 web 镜像 `plush-toy-erp-web:20260608T2230-a490b92-phase8-amd64` 不动。
- 完成：目标环境已用模拟主数据 `SIM-YOYOOSUN-PHASE8-PCS` / `SIM-YOYOOSUN-PHASE8-PRODUCT` / `SIM-YOYOOSUN-PHASE8-WH` 执行内部模拟事实闭环；旧失败留下的生产事实已冲正为 `CANCELLED`，旧委外 `DRAFT` 无库存流水影响。
- 完成：同步更新 `docs/current-source-of-truth.md`、`docs/architecture/phase8-fact-expansion-review.md`、`docs/customers/yoyoosun/phase8-target-release-acceptance.md`、`docs/customers/yoyoosun/phase8-target-release-evidence-2026-06-08.md`、`docs/customers/yoyoosun/README.md`、`deployments/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md` 和 `scripts/README.md`，把 Phase 8 状态更新为目标环境内部模拟事实闭环通过；客户使用确认改为交付后业务确认，不再作为 Phase 8 完成阻塞。
- 验证：目标环境 `/healthz` 返回 `ok`、`/readyz` 返回 `ready`，Atlas status pending 0；`trial-account-rbac.mjs` 验证 9 个 demo 账号通过；`phase8-simulated-fact-closure.mjs --apply` 生成 `TARGET-20260608-CLOSURE-V2` evidence；目标数据库核对生产、委外、出货、财务状态和 production / outsourcing / shipment 正反库存流水通过；服务端日志未发现 `ERROR` / `panic` / `fatal` / placeholder 错误。
- 下一步：进入 Phase 9 或后续增强评审；打印、报表、核销、物流退货、自动派生、并发锁升级、生产订单专表、委外订单专表和岗位任务端都不作为 Phase 8 补尾。
- 阻塞/风险：Phase 8 内部闭环不等于客户已签收、真实客户数据导入、完整打印、完整报表、发票明细、收付款核销或对账单已交付；首次目标发布前仍缺 pre-migration 备份 evidence，只能保留为历史发布风险，后续发布必须先记录 pre-migration 备份 evidence。目标机执行了 `docker builder prune -f`，为保留上一版回滚镜像且可回收空间很小，未执行 `docker image prune -a -f`。追加前 `progress.md` 为 319 行 / 62448 bytes，未达到归档阈值。

## 2026-06-09

- 完成：撤掉客户侧栏和默认桌面菜单中的 `Phase 8 事实闭环` / `事实闭环` 工程入口；同步从 yoyoosun 客户菜单、前端默认导航、前端菜单权限选项 / 预设和后端内置菜单移除 `phase8-facts`。保留 `/erp/phase8/facts` 内部直达页面、Phase 8 JSON-RPC、RBAC 动作权限和后端事实 usecase，不影响内部验证和脚本闭环。
- 完成：同步更新 `docs/current-source-of-truth.md`、`docs/architecture/phase8-fact-expansion-review.md`、`docs/customers/yoyoosun/phase8-target-release-acceptance.md` 和 `docs/product/product-delivery-ledgers.md`，明确客户菜单不展示 `Phase 8` 或 `事实闭环` 这类内部工程入口，菜单隐藏不替代后端 RBAC。
- 下一步：如后续要把 Phase 8 能力产品化给客户用，应分别并入生产、委外、出货、库存和财务对应业务菜单，而不是恢复统一的 Phase 编号菜单。
- 阻塞/风险：本轮只改菜单曝光和文档口径，未改 schema、migration、Phase8Usecase、JSON-RPC handler、目标环境镜像或部署配置。追加前 `progress.md` 为 340 行 / 69042 bytes，未达到归档阈值。

## 2026-06-09 11:05 CST

- 完成：按“下一步、不分子阶段、真实导入只能模拟”的口径一次性完成 Phase 9 岗位任务端与岗位协同闭环。新增 `scripts/qa/phase9-simulated-mobile-closure.mjs` 及测试，并接入 `scripts/qa/fast.sh`、`full.sh`、`strict.sh`；脚本只创建和更新 `SIM-YOYOOSUN-PHASE9` 模拟 workflow 任务，覆盖老板审批、成品抽检、仓库入库确认、出货放行异常上报和现场留痕，不写真实客户数据、`business_records` 或任何事实表。
- 完成：岗位任务端详情页新增现场留痕、最近动作、保存 evidence 和异常报告展示；完成 / 催办动作会提交 mobile action evidence；修复 `/m/<role>/guide` wildcard 兼容入口，避免跳到 `tasks/tasks`；`smoke:mobile-auth-login-route` 默认验证当前生产单端口 `/m/<role>/tasks` 主路径。
- 完成：本地构建 `linux/amd64` Web 镜像 `plush-toy-erp-web:20260609T1053-9173b13-phase9-mobile-amd64`，上传到目标环境 `192.168.0.133`，远端只执行 `docker load`、Compose 重建、健康检查、目标 smoke 和发布后清理；server 镜像、schema、migration 和 Phase 8 fact usecase 未变。
- 完成：新增 `docs/customers/yoyoosun/phase9-target-release-evidence-2026-06-09.md`，并同步 `docs/current-source-of-truth.md`、`docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md` 和 `scripts/README.md`，把 Phase 9 状态更新为目标环境内部模拟 workflow 闭环通过。
- 验证：本地通过 `node --test web/src/erp/utils/mobileTaskView.test.mjs`、`node --test scripts/qa/phase9-simulated-mobile-closure.test.mjs`、report-only Phase 9 脚本、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`bash scripts/qa/fast.sh`、`pnpm --dir web style:l1`、`TRIAL_ACCOUNT_PASSWORD=12345678 node scripts/qa/trial-account-rbac.mjs`、`TRIAL_ACCOUNT_PASSWORD=12345678 pnpm --dir web smoke:mobile-auth-login-route` 和本地 `PHASE9_SIM_CONFIRM=APPLY_SIMULATED_PHASE9_MOBILE_TASKS ... --run-id LOCAL-20260609-PHASE9-V3`。
- 验证：目标环境通过 `curl http://192.168.0.133:5175/healthz`、`curl http://192.168.0.133:8300/healthz`、`curl http://192.168.0.133:8300/readyz`、`MOBILE_AUTH_SMOKE_BASE_URL=http://192.168.0.133:5175 MOBILE_AUTH_SMOKE_APP_ID=mobile-warehouse TRIAL_ACCOUNT_PASSWORD=12345678 pnpm --dir web smoke:mobile-auth-login-route`、`TRIAL_ACCOUNT_PASSWORD=12345678 TRIAL_ACCOUNT_BACKEND_URL=http://192.168.0.133:8300 node scripts/qa/trial-account-rbac.mjs` 和目标 `PHASE9_SIM_CONFIRM=APPLY_SIMULATED_PHASE9_MOBILE_TASKS ... --run-id TARGET-20260609-PHASE9`；目标日志近 10 分钟无 `panic|fatal|error` 命中。
- 下一步：进入 Phase 10 行业模板沉淀，先把 yoyoosun 已验证的角色、菜单、字段、编号、导入模板和岗位任务模式区分为行业共性候选、客户样本和 deferred 输入；不要把单客户样本直接写成行业默认。
- 阻塞/风险：Phase 9 内部模拟 workflow 闭环不等于客户已签收、真实客户数据导入、拍照上传 / 附件服务、扫码、完整打印、报表、核销、物流退货、自动派生或出货 / 库存 / 财务事实自动过账已交付。目标机执行了 `docker builder prune -f` 和 `docker image prune -f`；磁盘空间充足且可回收空间极小，为保留当前运行镜像和相邻项目回滚镜像，未执行 `docker image prune -a -f`。追加前 `progress.md` 为 329 行 / 65430 bytes，未达到归档阈值。

## 2026-06-09 11:27 CST

- 完成：将撤掉 `Phase 8 事实闭环` / `事实闭环` 客户菜单入口的补丁发布到目标环境；从干净临时 worktree 构建并加载 `plush-toy-erp-web:20260609Tphase8-menu-hide-amd64` 和 `plush-toy-erp-server:20260609Tphase8-menu-hide-amd64`，只替换 `app-server` 与 `web-desktop`，未在目标服务器构建。
- 完成：目标环境 `.env` 已备份为 `.env.bak.20260609Tphase8-menu-hide-amd64`，`APP_IMAGE` 和 `WEB_IMAGE` 均切到本次新 tag；本轮没有 schema 变更，Atlas status 显示 pending 0。
- 验证：目标环境 `plush-toy-erp-web-desktop` healthy，`plush-toy-erp-server` 运行新镜像；`/healthz=ok`、`/readyz=ready`、桌面前端 `/healthz` 返回 `{"status":"ok","appId":"desktop","title":"桌面后台"}`，首页 HTTP 200；前端静态资源和服务端二进制中均未检出 `phase8-facts`，服务端二进制中未检出 `Phase 8 事实闭环`；近 5 分钟 server logs 无 `error|panic|fatal|phase8-facts`。
- 下一步：如后续需要给客户暴露 Phase 8 相关能力，应拆入生产、委外、出货、库存和财务对应业务菜单，而不是恢复 `Phase` 编号工程菜单。
- 阻塞/风险：本轮只发布菜单曝光修正，未改 Phase 8 内部直达页、JSON-RPC handler、RBAC 动作权限、事实 usecase、schema 或 migration。远端磁盘 `/` 为 98G/22G used/72G avail；已执行 `docker builder prune -f`，实际 0B；为保留上一版镜像回滚且磁盘充足，未执行 `docker image prune -a -f`。追加前 `progress.md` 为 347 行 / 70227 bytes，未达到归档阈值。

## 2026-06-09 11:45 CST

- 完成：按“进入 Phase 10，一步完成，不拆子阶段，真实导入只能本地模拟”的口径完成行业模板沉淀闭环。新增 `config/industry-templates/plush/templateConfig.mjs`，将 yoyoosun 已验证的角色、菜单、字段显示、编号、导入模板和岗位任务模式沉淀为毛绒玩具行业候选模板；模板状态为 `candidate`，`runtimeEnabled=false`，不作为运行时 loader 或多客户默认。
- 完成：新增 `scripts/qa/industry-template-boundaries.mjs`、`scripts/qa/phase10-industry-template-closure.mjs` 及测试，并接入 `scripts/qa/fast.sh`、`full.sh`、`strict.sh`；脚本只生成 Phase 10 本地模拟 evidence，不连接数据库、不执行真实客户数据导入、不写 `business_records` 或事实表。
- 完成：同步更新 `config/industry-templates/plush/README.md`、`scripts/README.md`、`docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`、`docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/architecture/phase8-fact-expansion-review.md` 和 `docs/customers/yoyoosun/phase8-target-release-acceptance.md`；新增 `docs/customers/yoyoosun/phase10-target-release-evidence-2026-06-09.md`。
- 完成：本地构建 `linux/amd64` 镜像 `plush-toy-erp-server:20260609T1125-dd845a4-phase10-industry-amd64` 和 `plush-toy-erp-web:20260609T1125-dd845a4-phase10-industry-amd64`，上传到目标环境 `192.168.0.133` 的 `/home/simon/plush-toy-erp-releases/20260609T1125-dd845a4-phase10-industry-amd64/images.tar.gz`，远端只执行 `docker load`、Compose 切换、migration status、健康检查、浏览器回归和发布后清理；未在目标服务器构建。
- 验证：本地通过 `node scripts/qa/industry-template-boundaries.mjs`、`node --test scripts/qa/phase10-industry-template-closure.test.mjs`、`node scripts/qa/phase10-industry-template-closure.mjs --out output/customers/yoyoosun/phase10-industry-template-closure-local`、`node scripts/qa/customer-config-boundaries.mjs`、`node --test web/src/erp/config/seedData.test.mjs web/src/erp/config/menuPermissions.test.mjs`、`bash scripts/qa/fast.sh`、`pnpm --dir web test`、`pnpm --dir web style:l1`、`bash scripts/qa/full.sh` 和 `git diff --check`。
- 验证：目标环境 Atlas status OK、pending 0；`/healthz=ok`、`/readyz=ready`、桌面前端 `/healthz` 返回 `{"status":"ok","appId":"desktop","title":"桌面后台"}`，`/erp/dashboard` HTTP 200；`TRIAL_ACCOUNT_PASSWORD=12345678 TRIAL_ACCOUNT_BACKEND_URL=http://192.168.0.133:8300 node scripts/qa/trial-account-rbac.mjs` 通过 9 个 demo 账号；`TRIAL_ACCOUNT_PASSWORD=12345678 TRIAL_BROWSER_SMOKE_BASE_URL=http://192.168.0.133:5175 TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL=http://192.168.0.133:8300/healthz pnpm --dir web smoke:trial-demo-browser` 通过桌面账号 9 个、岗位任务端 8 个、拒绝态 1 个；目标日志近 10 分钟无 `panic|fatal|error`。
- 下一步：Phase 10 已按内部模拟和目标环境发布口径关闭。后续若要把行业模板从 `candidate` 升为正式默认，必须先有第二客户或更完整业务样本验证，并单独评审 runtime loader、客户差异隔离和回滚路径。
- 阻塞/风险：Phase 10 行业模板不是真实客户数据导入、客户已签收、多客户默认、SaaS、多租户、license、通用打印模板引擎、正式报表、扫码、附件服务或事实自动过账交付；客户使用确认属于交付后业务确认。目标机执行 `docker builder prune -f` 和 `docker image prune -f`，回收 0B；为保留当前运行镜像和相邻项目回滚镜像，未执行 `docker image prune -a -f`。追加前 `progress.md` 为 355 行 / 71849 bytes，未达到归档阈值。

## 2026-06-09 13:25 CST

- 完成：按“Phase 11 一步完成、不拆子阶段、真实导入只能本地模拟”的口径完成多客户私有化复制闭环。新增 `config/private-deployment-template/templateConfig.mjs`、`config/private-deployment-template/README.md`、`docs/product/private-deployment-package-review.md`、`deployments/README.md`、`scripts/qa/private-deployment-boundaries.mjs`、`scripts/qa/phase11-private-deployment-closure.mjs` 和测试；模板状态为 `template_candidate`，`runtimeEnabled=false`，`SIM-PRIVATE-PHASE11` 只用于本地 evidence，不创建正式客户目录。
- 完成：同步更新 `README.md`、`docs/current-source-of-truth.md`、`docs/customers/README.md`、`docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`、`deployments/yoyoosun/README.md`、`scripts/README.md`、`scripts/qa/fast.sh`、`full.sh` 和 `strict.sh`；新增 `docs/customers/yoyoosun/phase11-target-release-evidence-2026-06-09.md`。
- 验证：本地通过 `node scripts/qa/private-deployment-boundaries.mjs`、`node --test scripts/qa/phase11-private-deployment-closure.test.mjs`、`node scripts/qa/phase11-private-deployment-closure.mjs --out output/customers/yoyoosun/phase11-private-deployment-closure-local`、`bash scripts/qa/fast.sh`、`bash scripts/qa/full.sh` 和 `git diff --check`。
- 验证：本地构建并上传 `plush-toy-erp-server:20260609T1320-phase11-private-amd64` 与 `plush-toy-erp-web:20260609T1320-phase11-private-amd64` 到目标环境 `192.168.0.133`；远端只执行 `docker load`、`.env` 镜像切换、migration status、Compose 重建、健康检查、账号 RBAC、浏览器 smoke 和发布后清理，未在目标服务器构建。目标环境 migration pending 0，`/healthz=ok`、`/readyz=ready`、前端 `/healthz` 正常、`/erp/dashboard` HTTP 200，`trial-account-rbac.mjs` 通过 9 个 demo 账号，`smoke:trial-demo-browser` 通过桌面账号 9 个、岗位任务端 8 个、拒绝态 1 个，近 10 分钟 server logs 无 `panic|fatal|error`。
- 下一步：Phase 11 已按模板、模拟闭环和目标环境发布口径关闭。真实新增客户前必须先评审稳定 customer key、资料入仓边界、导入 dry-run / unresolved queue、部署地址、备份恢复、验收清单和是否存在客户专属 extension；Phase 12 SaaS 仍只在多客户私有化成熟后单独评审。
- 阻塞/风险：Phase 11 不代表真实第二客户已创建、真实客户数据导入已批准、多客户 runtime 已生效、SaaS、多租户、license、billing、客户工单系统或客户已签收；本轮未改 schema、migration、RBAC、WorkflowUsecase、Fact usecase、客户菜单 runtime loader 或真实导入 loader 写库语义。目标机执行 `docker builder prune -f` 和 `docker image prune -f`，回收 0B；为保留当前运行镜像和上一版回滚镜像，未执行 `docker image prune -a -f`。追加前 `progress.md` 为 366 行 / 75669 bytes，未达到归档阈值。
