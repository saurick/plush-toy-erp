# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md`：归档 2026-06-28 之前至客户配置版本运行时最小闭环、`/__dev` 页面治理等过程记录。
- `docs/archive/progress-2026-06-29-before-release-evidence-hardening.md`：归档 2026-06-28 客户配置 runtime manifest、发布执行器、dev-only 页面治理、Workflow action 合同、导入与发布证据前置门禁等过程记录。
- `docs/archive/progress-2026-06-29-before-target-evidence-binding.md`：归档 2026-06-29 release evidence、真实导入 recovery plan、文档清单、备份恢复和回滚演练门禁早期硬化过程记录。
- `docs/archive/progress-2026-06-29-before-priority-audit-closeout.md`：归档 2026-06-29 target evidence binding 之后到 release evidence runner 脱敏报告与 URL 前置拦截的过程记录。
- `docs/archive/progress-2026-06-29-before-process-runtime-minimum.md`：归档 2026-06-29 adminProfileSync 菜单投影文档纠偏、P2 explain / entitlement / break-glass 中段过程记录。
- `docs/archive/progress-2026-06-29-before-linked-task-idempotency.md`：归档 2026-06-29 P3 ProcessRuntime expected_version 守卫之前至 linked task 幂等闭环前的过程记录。
- `docs/archive/progress-2026-06-30-before-inventory-post-inbound.md`：归档 2026-06-30 P3 / P4 前段、adminProfileSync 菜单投影文档多轮纠偏、sales_order_acceptance、material_supply definition evidence、`purchase_receipt.create` 和 `quality_inspection.decide` 领域命令 handler 过程记录。

## 当前活跃事项

- 多甲方角色能力流程编排以 `docs/product/多甲方角色能力流程编排优先级.md` 为本地优先级入口；GPT/reference 资料只作输入，当前真源仍回到代码、migration、测试和正式文档。
- P4 第一条销售订单接单闭环已进入本地最小 runtime：`sales_order_acceptance` 可从 active customer config 受控构造流程实例，正式销售订单页已走显式 start / execute submit command；目标环境 release evidence 仍未完成。
- P4-2 第二条 `material_supply` 仍保持 `definition_evidence_only` 和 `runtime_loader_enabled=false`；当前只完成 `purchase_receipt.create`、`quality_inspection.decide`、`inventory.post_inbound` 三个 ProcessRuntime domain command handler 的单命令绑定，不代表整条采购收货 -> 来料质检 -> 仓库入库目标环境闭环已完成。
- 当前仍不启用 `material_supply` runtime loader，不提供 material_supply start / execute API，不让 Workflow task done 自动调用采购、质检或库存 usecase。
- 真实客户数据导入、任意文件 upload、生产发布 preflight、真实备份恢复、目标环境 smoke、目标 migration、回滚 / 前向修复演练和签收仍未执行，不能被本地 dry-run、manifest 编译、status、gate、audit 或 runner report 替代。

## 2026-06-30 P4-3 finished_goods_delivery 本地黄金链路证据

- 完成：继续多甲方角色能力模块组合流程编排主线 P4-3，本阶段不改业务逻辑，只补本地 golden-chain 测试证据。新增 `TestFinishedGoodsDeliveryProcessRunsLocalGoldenChain`，用同一 ProcessInstance 顺序执行 `finished_goods_quality.decide -> shipment.finance_release -> shipment.ship -> finance.receivable_lead -> end`，锁住节点版本推进、end 节点完成和 ProcessInstance completed。
- 完成：测试同时锁住边界：成品质检只消费 shipment-linked 已提交质检并调用 `InventoryUsecase.PassQualityInspection`，财务放行只校验 DRAFT shipment 且不调用出货，显式出货才调用 `ShipShipment`，应收线索只创建 `RECEIVABLE` 草稿并记录 linked finance fact，不 post / settle / cancel finance fact。同步 `multi-client-role-workflow-priority-audit`、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `server/README.md`，把 P4-3 本地黄金链路 evidence 纳入当前口径。
- 验证：`cd server && go test ./internal/biz -run 'TestFinishedGoodsDeliveryProcessRunsLocalGoldenChain|TestFinishedGoodsQualityProcessDomainCommandDecide|TestShipmentProcessDomainCommand|TestFinanceProcessDomainCommandReceivableLead'`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `ok=true / releaseReady=false / p43State=ready / p43HasGoldenTest=true`。
- 下一步：P4-3 本地链路已比单命令 handler 更完整；继续升级时应另拆目标环境 release evidence，或单独设计独立财务放行状态、取消 / 撤销策略及相应 usecase / RBAC / 审计 / 测试。
- 阻塞/风险：本轮未改 schema / migration、业务实现、release evidence、部署脚本、真实导入或客户数据；目标环境 evidence 仍未闭环，不能写成正式上线或正式生产数据完成。

## 2026-06-30 adminProfileSync 隐藏 URL 诊断口径再纠偏

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把隐藏 URL 判定改到当前 `adminProfileSync` / `ERPLayout` 代码口径：`currentMenuPath` 来自 `resolveMenuPermissionKey(location.pathname)`，`currentEntry?.key` 来自前端菜单定义，未命中菜单定义时当前会回退默认工作台 entry key 作为 pages 判定锚点。
- 完成：补清 local dev / super admin / sync failure 诊断例外只影响前端菜单 / URL 排障可见性；普通账号 local dev 只放开 pages 层，已登记菜单路径仍先过 RBAC；正式 / 非前端 DEV 构建 super admin 正常 active revision 下只额外保留系统诊断页，只有 `effective_session_sync_failed` 空投影下才保留前端菜单诊断路径。
- 验证：按本轮边界只跑 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如需改变实际跳转、fallback 或诊断放开范围，应另起业务逻辑任务并同步 `adminProfileSync`、`ERPLayout` 和测试。
- 阻塞/风险：不改业务逻辑、不提交、不推送、不触碰 release evidence；当前工作区仍有其他既有未提交改动。

## 2026-06-30 progress 超阈值归档

- 完成：归档前 `progress.md` 为 367 行 / 82205 bytes，已达到 80KB 阈值；已将完整原文复制到 `docs/archive/progress-2026-06-30-before-inventory-post-inbound.md`。
- 完成：根 `progress.md` 已收敛为归档索引、当前活跃事项和本轮 P4-2 记录，保留 material_supply loader / API / 目标 evidence 的剩余边界。
- 下一步：继续 P4-2 时应先做 material_supply start / execute API 或 loader 启用评审；启用前必须明确 API/RBAC/幂等/审计/重复提交/目标 evidence 范围。
- 阻塞/风险：本次归档只整理过程记录，不改变 runtime、schema、RBAC、发布脚本、目标环境状态或正式业务真源。

## 2026-06-30 P4-2 inventory.post_inbound 领域命令 handler

- 完成：继续多甲方角色能力流程编排主线 P4-2，本阶段只实现 `inventory.post_inbound` 单命令闭环；新增 ProcessRuntime domain command handler，要求流程实例业务引用为 `purchase_receipt`，payload 必须提供 `purchase_receipt_id` 或兼容 `id`，且与流程业务引用一致。
- 完成：`inventory.post_inbound` 调用 `InventoryUsecase.PostPurchaseReceipt`，返回 `inventory.inbound_posted` outcome；显式执行该 handler 时复用现有采购入库过账 usecase 写库存流水、余额和批次事实。同步在 JSON-RPC dispatcher 构造时注册 handler。
- 完成：同步 `customer-config-runtime-manifest` 和 `multi-client-role-workflow-priority-audit`，把 `warehouse_inbound` 的 `runtime_binding_status` 调整为 `process_runtime_handler_registered`，并把剩余 blocker 收窄为 material_supply runtime API / loader、任务自动触发和目标环境 evidence；同步 `docs/product/多甲方角色能力流程编排优先级.md` 与 `docs/当前真源与交接顺序.md`。
- 验证：`cd server && go test ./internal/biz -run 'Test(InventoryProcessDomainCommand|QualityInspectionProcessDomainCommand|PurchaseReceiptProcessDomainCommand|SalesOrderProcessDomainCommand|SalesOrderAcceptanceProcessSubmit)'`；`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_(PurchaseReceiptAPIClosesInboundInventoryFact|CreatePurchaseReceiptFromPurchaseOrderCreatesDraftOnly|PurchaseReceiptAPIRequiresDomainPermissions|QualityInspectionAPIChangesLotStatusWithoutInventoryTxn|QualityInspectionAPIRequiresDomainPermissions|SalesOrderAcceptance)'`；`node --check scripts/qa/customer-config-runtime-manifest.mjs && node --check scripts/qa/customer-config-runtime-manifest.test.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。priority audit 为 `ok=true`、`releaseReady=false`，`material-supply-domain-command-contract-preflight` 为 ready/pass，剩余未证明项为 material_supply loader、material_supply start / execute API、任务完成自动写 Fact 和目标环境黄金闭环。
- 下一步：P4-2 下一阶段不应再补单个领域 handler，而应单独评审 material_supply start / execute API 或 loader 启用；必须先明确流程实例业务引用、节点类型从 human_task 到 domain_command 的转换策略、API/RBAC、幂等键、审计、重复提交、任务动作是否自动触发、以及目标环境 evidence。
- 阻塞/风险：本轮未改 schema / migration、release evidence、真实导入、部署、正式前端 UI、material_supply runtime loader 或 material_supply JSON-RPC start / execute API；未提交、未推送。新 handler 会在未来显式执行入口下写库存事实，但本轮没有启用自动流程调用，也没有向本地/dev/test 库写入真实业务数据。

## 2026-06-30 adminProfileSync 菜单投影文档口径纠偏

- 完成：按 review 发现只修正文档口径，明确 `local dev` 普通账号仍必须先通过 RBAC 菜单路径，只是在第二层 pages 诊断例外下可看到 RBAC 已授权页面，其中包括被客户配置隐藏的页面；同步 `docs/当前真源与交接顺序.md` 和 `web/README.md`。
- 验证：只按本轮要求运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：若后续继续改菜单投影行为，应另起实现任务并补 `adminProfileSync.test.mjs`，不能在文档口径里替代代码或测试。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交、不推送、不触碰 release evidence；当前工作区仍有多组既有未提交改动，本轮只在允许文档路径内追加纠偏。

## 2026-06-30 P4-2 material_supply 窄版显式运行时 API

- 完成：继续 P4-2，但未直接启用完整 `material_supply` loader；先按仓库真源收窄为“已有采购入库单 -> 来料质检 -> 仓库入库”闭环，新增 `ProcessKeyMaterialSupply`、active customer config 到 `purchase_receipt` ProcessInstance 的受控构造，以及 `start_material_supply_process` / `execute_material_supply_quality_decide` / `execute_material_supply_post_inbound` 三个 `customer_config` JSON-RPC 入口。
- 完成：`start` 只创建并启动流程实例，不执行领域命令、不写 Fact；质检 execute 要求 `quality.inspection.update`，显式调用 `quality_inspection.decide`；入库 execute 要求 `warehouse.inbound.confirm`，显式调用 `inventory.post_inbound`。同步 QA audit 与正式文档，把“窄版 API 已有”和“完整采购订单到采购入库单 loader 未启用”拆开。
- 验证：`cd server && go test ./internal/biz ./internal/service -run 'TestCustomerConfig|Test.*ProcessDomainCommand'`。
- 下一步：完整 P4-2 loader 仍需单独设计 `purchase_order -> purchase_receipt -> quality -> inbound` 的业务引用链路；在解决同一 ProcessInstance 只能持有一个 `business_ref_type / business_ref_id` 前，不应把 `purchase_receipt.create` 放进当前 `purchase_receipt` 流程实例。
- 阻塞/风险：本轮未改 schema / migration、release evidence、真实导入、部署、正式前端 UI，也未让 Workflow task done 自动调用采购、质检或库存 usecase；未提交、未推送。

## 2026-06-30 P4-2 quality_inspection.decide 领域命令 handler

- 完成：实现 `quality_inspection.decide` 单命令闭环；handler 要求流程实例业务引用为 `purchase_receipt`，payload 必须提供 `quality_inspection_id` 或兼容 `id`，可选 `purchase_receipt_id / inventory_lot_id` 必须与当前质检单一致，并按 `PASS / CONCESSION / REJECT` 分流到 `InventoryUsecase.PassQualityInspection / RejectQualityInspection`。
- 完成：同步 manifest / audit / 当前真源 / 优先级文档，剩余缺口收窄到 inventory handler、material_supply API / loader 和目标环境 evidence；后续已由 `inventory.post_inbound` 阶段继续推进。
- 阻塞/风险：该阶段不启用 material_supply loader，不新增 API，不让 Workflow task done 自动调用领域 usecase，不触碰 release evidence、部署或真实导入。

## 2026-06-30 P4-2 purchase_receipt.create 领域命令 handler

- 完成：实现 `purchase_receipt.create` 单命令闭环；handler 要求流程实例业务引用为 `purchase_order`，payload `purchase_order_id` 如存在必须一致，并要求 `receipt_no / warehouse_id`，成功后调用 `InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder` 创建采购收货草稿。
- 完成：同步 manifest / audit / 当前真源 / 优先级文档，`purchase_receipt_source.runtime_binding_status=process_runtime_handler_registered`；后续已由 `quality_inspection.decide` 与 `inventory.post_inbound` 阶段继续推进。
- 阻塞/风险：该阶段不调用 `PostPurchaseReceipt`，不写库存过账，不启用 material_supply loader，不新增 API，不触碰 release evidence、部署或真实导入。

## 2026-06-30 adminProfileSync 菜单投影文档口径二次校准

- 完成：只按当前 `adminProfileSync` / `ERPLayout` 代码校准文档口径，明确静态客户菜单配置不是最终授权边界，正式运行态普通账号在已挂载 pages 数组的 active session 下仍按 RBAC 菜单路径与 active revision pages 交集强收窄。
- 完成：补清隐藏 URL 跳转和诊断例外描述：`adminProfileSync` 只返回跳转判定，`ERPLayout` 只有存在已过滤 fallback 时才 `replace`；`local dev` 只放开第二层 pages 诊断，普通账号仍要先过 RBAC；正式 / 非本地 `super admin` 正常 active revision 下只额外保留系统诊断页，sync failure 空投影下才保留全后台前端诊断路径。
- 完成：把 sync failure 缓存语义改成当前实现口径：`ERPLayout` 同步失败时先复用 `adminProfileRef.current.effective_session`，没有该缓存时才挂载新的 `effective_session_sync_failed` 空投影；普通管理员 `me` profile 缓存不等于客户配置投影缓存。
- 下一步：若后续要改变菜单投影行为，应另起实现任务并同步 `adminProfileSync.test.mjs`，本轮只做文档校准。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交、不推送、不触碰 release evidence；当前工作区仍有多组既有未提交改动，本轮只触碰 `docs/当前真源与交接顺序.md`、`web/README.md` 和 `progress.md`。

## 2026-06-30 P4-2 material_supply 采购订单显式运行时 API

- 完成：把 P4-2 从“已有采购入库单 -> 来料质检 -> 仓库入库”的窄版 API，推进到“采购订单 -> 采购收货草稿 -> 来料质检 -> 仓库入库”的显式 JSON-RPC 链路。新增 / 校准 `start_material_supply_purchase_order_process` 和 `execute_material_supply_purchase_receipt_create`，主流程实例业务引用保持 `purchase_order`，`purchase_receipt.create` 成功后把生成的 `purchase_receipt` 写入 `module_contract_snapshot.linked_business_refs`，后续 `quality_inspection.decide` / `inventory.post_inbound` 通过 linked ref 继续执行。
- 完成：补测试锁住 linked ref 合同和服务层闭环：业务层 `purchase_receipt.create` 测试断言 `RecordProcessInstanceLinkedBusinessRef` 记录生成的采购入库单；服务层测试覆盖 start purchase order process、execute purchase receipt create、quality decide、inbound post 到 end 节点。同步 `multi-client-role-workflow-priority-audit` 新增 `p4-material-supply-purchase-order-explicit-runtime-api` 覆盖项，并修正文档 / README 中旧的“同一实例只能一个业务引用所以完整链路未启用”口径。
- 验证：`cd server && go test ./internal/biz ./internal/service -run 'TestCustomerConfig|Test.*ProcessDomainCommand'`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs scripts/qa/customer-config-runtime-manifest.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。审计结果 `ok=true`、`releaseReady=false`，新增采购订单显式运行时 API 覆盖项为 ready，仍明确不证明 runtime manifest loader、任务自动过账或目标环境黄金闭环。
- 下一步：继续 P4-2 时应优先评审 `material_supply` runtime manifest 是否从 `definition_evidence_only` 升级为受控 loader，还是先补真实后端 / 本地试用环境的端到端 smoke；无论哪条，都必须单独说明 loader、RBAC、幂等、审计、目标 evidence 和回滚边界。
- 阻塞/风险：本轮未改 schema / migration、release evidence、部署、真实导入、正式前端 UI，也未让 Workflow task done 自动调用采购、质检或库存 usecase；未提交、未推送。`material_supply` manifest 仍保持 `runtime_loader_enabled=false`，目标环境尚未证明采购收货、来料质检或仓库入库闭环。

## 2026-06-30 adminProfileSync 菜单投影文档口径补充纠偏

- 完成：只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把菜单投影写成当前代码口径：`super admin` 在第一层 RBAC 菜单路径视为通过，第二层 `effective_session.pages` 默认仍收窄，只有 `adminProfileSync` 明确返回的 local dev / system diagnostic / sync failure 诊断例外才放开。
- 完成：补清隐藏 URL 跳转口径：helper 只返回是否应跳转，`ERPLayout` 仅在存在已过滤 fallback 时执行 `replace`；无 fallback 时阻止业务 `Outlet`，不退回隐藏页、RBAC-only 或默认全量后台。
- 下一步：如后续要改变 `adminProfileSync` 运行时行为，应另起实现任务并同步测试；本轮只修正式文档口径。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；当前工作区仍有多组既有未提交改动，本轮只处理允许的文档路径。

## 2026-06-30 P4-2 material_supply runtime manifest loader 定义收口

- 完成：把 `multi-client-role-workflow-priority-audit` 中 P4-2 material_supply 的旧 loader-disabled 口径改为当前 `runtime_loader_ready / runtime_loader_enabled=true / business_ref_type=purchase_order` 口径；四个覆盖项现在分别证明 runtime loader 定义、领域命令合同、已有采购入库单显式 API、采购订单显式 API，剩余盲区保留为任务自动过账和目标环境黄金闭环。
- 完成：`customer-config-runtime-manifest.test.mjs` 已覆盖 `material_supply` 三个 `domain_command` 节点、policy command、handler 注册、`runtime_loader_blockers=[]`、责任池 membership 和不宣称 manifest 层自动过账；priority audit 测试同步断言新 check id 和剩余未证明项。
- 验证：`node --check scripts/qa/customer-config-runtime-manifest.mjs && node --check scripts/qa/customer-config-runtime-manifest.test.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode compile`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；`cd server && go test ./internal/biz ./internal/service -run 'TestCustomerConfig|Test.*ProcessDomainCommand'`。
- 下一步：P4-2 继续推进时应选择本地/dev/test effective active revision 下的 start + execute 端到端 smoke，或继续收口第三条黄金闭环；任何目标环境 release evidence、真实导入、部署或客户数据写入仍需单独阶段说明。
- 阻塞/风险：本轮未改 schema / migration、release evidence、部署、真实导入或正式前端业务逻辑；`releaseReady=false` 仍然保留，目标环境尚未证明 material_supply 黄金闭环。

## 2026-06-30 adminProfileSync local dev 诊断口径补充

- 完成：按 review 只修正文档口径，补充 `local dev` 诊断例外只放开 `effective_session.pages` 第二层；普通账号仍由 `filterNavigationSectionsByAdminProfile` / `shouldRedirectFromCurrentNavigation` 先检查 RBAC 菜单路径，不会因为本地开发态看到 RBAC 未授权 URL。
- 完成：同步 `docs/当前真源与交接顺序.md` 和 `web/README.md`；未改业务逻辑、测试、release evidence、部署或真实导入。
- 下一步：如需改变菜单投影行为，应另起实现任务并同步 `web/src/erp/utils/adminProfileSync.test.mjs`。
- 阻塞/风险：当前工作区仍有多组既有未提交改动；本轮只处理用户允许的文档路径，不提交、不推送。

## 2026-06-30 P4-3 shipment / finance 合同预检

- 完成：把 P4-3 `成品质检 -> 财务放行 -> 仓库出货 -> 应收线索` 收口为合同预检，而不是运行时执行链。优先级文档、当前真源和 `server/README.md` 已同步说明：出货事实锚点是 `create_shipment_with_items / ship_shipment / cancel_shipment`，财务事实锚点是 `create_finance_fact / post_finance_fact / settle_finance_fact / cancel_finance_fact`；只有显式 `ship_shipment` 才推进 `SHIPPED` 并写库存 `OUT`，`shipment_release` 仍是 Workflow-only。
- 完成：`multi-client-role-workflow-priority-audit` 新增 `p4-finished-goods-shipment-finance-contract-preflight` 覆盖项，锁住 shipment / finance JSON-RPC 锚点、shipment_release deferred 边界和“不自动出货 / 扣库存 / 生成应收 / 开票”的未证明项；release evidence 仍保持 `evidence-required`，没有改成 ready。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；`cd server && go test ./internal/biz ./internal/service -run 'Test(WorkflowUsecase_ShipmentRelease|JsonrpcDispatcher_WorkflowUpdateTaskStatusTriggersShipmentReleaseBusinessState|JsonrpcDispatcher_ShipmentAPIRequiresDedicatedShipmentPermissions|FinanceFactCreateFromParamsParsesFeeAndCurrency)'`。
- 下一步：若继续 P4-3，应另拆阶段设计具体 runtime domain command contract、RBAC、幂等、审计、取消 / 冲正、manifest loader 和目标环境 evidence；不能从本次合同预检直接跳到 release 或真实客户数据闭环。
- 阻塞/风险：本轮未改 schema / migration、业务 usecase、正式前端 UI、部署、真实导入或 release evidence；未注册 `finished_goods_quality / finance_release / shipment.ship / receivable_lead` handler，未让 Workflow task done 自动写任何出货、库存、应收、发票或财务事实，未提交、未推送。

## 2026-06-30 P4-3 finished_goods_delivery manifest 定义证据

- 完成：把 P4-3 从 shipment / finance 合同预检推进到客户配置 runtime manifest 的 `definition_evidence_only` 定义证据。`demo` 和 `yoyoosun` 客户包都新增成品交付预览 workflow，catalog 白名单登记 `finished_goods_quality_decide / release_shipment_finance / ship_shipment / create_receivable_lead`，并保持 `runtimeEnabled=false`。
- 完成：`customer-config-runtime-manifest` 现在编译 `finished_goods_delivery / quality_finance_ship_receivable`，固定 `finished_goods_quality -> shipment_finance_release -> shipment_execution -> receivable_lead -> end`。四个前置节点都是 `domain_command` 合同候选，但 `runtime_loader_enabled=false`，`runtime_binding_status=contract_preflight_only`，`process_runtime_handler_registered=false`，并保留 `domain_command_handler_not_registered / explicit_runtime_api_not_implemented / target_evidence_missing` blocker。
- 完成：`multi-client-role-workflow-priority-audit` 新增 `p4-finished-goods-delivery-definition-evidence` 覆盖项；优先级文档、当前真源和 `server/README.md` 已同步说明“有定义证据，但没有 loader / handler / start-execute API / 目标 evidence”。
- 验证：`node --check scripts/qa/customer-config-runtime-manifest.mjs && node --check scripts/qa/customer-config-runtime-manifest.test.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/customer-package-lint.test.mjs scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-package-lint.mjs --customer yoyoosun --mode validate && node scripts/qa/customer-package-lint.mjs --customer demo --mode validate && node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode validate && node scripts/qa/customer-config-runtime-manifest.mjs --customer demo --mode validate`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；`cd server && go test ./internal/biz ./internal/service -run 'Test(WorkflowUsecase_ShipmentRelease|JsonrpcDispatcher_WorkflowUpdateTaskStatusTriggersShipmentReleaseBusinessState|JsonrpcDispatcher_ShipmentAPIRequiresDedicatedShipmentPermissions|FinanceFactCreateFromParamsParsesFeeAndCurrency)'`。
- 下一步：若继续 P4-3，应先评审是补 `finished_goods_delivery` 的显式 start/execute API，还是先补本地/dev/test smoke；任何 handler 注册、出货执行、应收创建、目标 release evidence 或真实客户数据写入都必须另拆阶段说明边界和回滚。
- 阻塞/风险：本轮未改 schema / migration、业务 usecase、JSON-RPC 行为、正式前端 UI、部署、真实导入或 release evidence；未让 Workflow task done 自动写质检、出货、库存、应收、发票或财务事实，未提交、未推送。

## 2026-06-30 adminProfileSync DEV 构建诊断口径收敛

- 完成：按 review 只修正文档口径，`docs/当前真源与交接顺序.md` 和 `web/README.md` 把菜单投影诊断例外从笼统“非本地运行态”收敛为当前代码实际使用的前端 `import.meta.env.DEV` / 非前端 DEV 构建判断。
- 完成：补清正常 active revision、local dev、super admin 和 sync failure 空投影的区别：正式普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄；sync failure 全后台诊断只属于挂载 `effective_session_sync_failed` 空投影后的 super admin 前端排障路径。
- 下一步：如需改变 `adminProfileSync` 或 `ERPLayout` 行为，应另起实现任务并同步测试。
- 阻塞/风险：未改业务逻辑、未改测试、未提交、未推送、未触碰 release evidence；本轮只处理允许的文档路径和按 AGENTS 追加的 `progress.md`。

## 2026-06-30 P4-3 finished_goods_delivery 只读定义解释

- 完成：新增 `customer_config.explain_process_definition` 只读解释接口，可从 active customer config revision 读取 `finished_goods_delivery / quality_finance_ship_receivable` 的 manifest 状态、loader 状态、节点命令合同、runtime blocker 和 `can_start_runtime=false`；该接口不创建 ProcessInstance、不执行 domain command、不写 Fact。
- 完成：P4-3 仍保持 `definition_evidence_only / runtime_loader_enabled=false`，并显式返回 `runtime_loader_disabled / manifest_status_not_runtime_loader_ready / runtime_builder_not_registered / domain_command_handler_not_registered / explicit_runtime_api_not_implemented / target_evidence_missing` 等不可启动原因；未注册成品质检、财务放行、仓库出货或应收线索 handler，也没有 customer_config start/execute API。
- 验证：`cd server && go test ./internal/biz -run 'TestCustomerConfigUsecaseExplainProcessDefinitionFinishedGoodsDeliveryDefinitionEvidence|TestCustomerConfigUsecaseExplainModuleStatus'`；`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPCExplainProcessDefinition|TestCustomerConfigJSONRPCExplainModuleStatus'`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。
- 下一步：若继续 P4-3，应先评审显式 start/execute API 的最小闭环，或先补本地/dev/test 只读 smoke；任何 handler 注册、出货执行、应收创建、目标 release evidence、部署或真实客户数据写入都必须另拆阶段。
- 阻塞/风险：本轮未改 schema / migration、业务 fact usecase、正式前端 UI、部署、真实导入或 release evidence；未提交、未推送，当前工作区仍有多组既有未提交改动。

## 2026-06-30 adminProfileSync 文档口径复核修正

- 完成：只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的菜单投影描述，按当前 `adminProfileSync` / `ERPLayout` 代码把隐藏 URL 诊断例外写清为 local dev pages 诊断、正常 active revision 下的 super admin 系统诊断页，以及已挂载 `effective_session_sync_failed` 空投影后的 super admin 全后台前端诊断路径。
- 完成：把 effective session 同步失败缓存语义校准为当前实现：只要存在 `adminProfileRef.current.effective_session` 对象就复用；没有任何 effective session 缓存时才新挂 `effective_session_sync_failed` 空投影。普通管理员 `me` profile 缓存不等于客户配置投影缓存。
- 下一步：如需改变正式客户收窄、local dev 诊断或 super admin 例外行为，应另起业务逻辑任务并同步 `web/src/erp/utils/adminProfileSync.test.mjs`。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交、不推送、不触碰 release evidence；当前工作区仍有多组既有未提交改动。

## 2026-06-30 P4-3 start-only loader QA 守卫纠偏

- 完成：复核 P4-3 `finished_goods_delivery` start-only loader 当前代码与文档口径，Go 侧 `BuildFinishedGoodsDeliveryStartOnlyProcess`、`ExplainProcessDefinitionFinishedGoodsDeliveryStartReady` 和 JSON-RPC start 权限用例通过。
- 完成：修正 `customer-config-runtime-manifest.test.mjs` 的负例断言，从旧 `runtime_loader_blockers` 改为当前 start-only 语义下的 `runtime_execute_blockers`；修正 priority audit 对 `server/README.md` 的 P4-3 证据匹配，并把测试中的旧 “loader / start API 未证明” 断言改成当前真实缺口：handler、execute API 和目标环境黄金闭环仍未证明。
- 验证：`cd server && go test ./internal/biz -run 'TestCustomerConfigUsecase(BuildFinishedGoodsDeliveryStartOnlyProcess|ExplainProcessDefinitionFinishedGoodsDeliveryStartReady|ExplainModuleStatus|RejectsUnsafeActiveProcessDefinitionLoader)'`；`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(ExplainProcessDefinition|StartFinishedGoodsDelivery|ExplainModuleStatus)'`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode validate && node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。
- 下一步：继续 P4-3 时不要直接写出货 / 财务 / 库存 / 应收事实；应先评审 `finished_goods_quality` 是否已有可复用质量事实 usecase，若没有，只能先补显式 execute 拒绝 / 合同解释或另拆质量事实模型阶段。
- 阻塞/风险：本轮未改 schema / migration、业务 fact usecase、正式前端 UI、部署、真实导入或 release evidence；priority audit 仍显示 `releaseReady=false`、`blockingCategory=external-release-evidence-required`，目标环境未证明黄金闭环。

## 2026-06-30 adminProfileSync 菜单投影文档措辞收紧

- 完成：按 review 只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的文档口径，把 `super admin` “第一层 RBAC 菜单路径视为通过”限定为仅第一层，并明确正式 / 非前端 DEV 构建下正常 active revision 仍受 `effective_session.pages` 强收窄。
- 完成：补强隐藏 URL 和诊断例外措辞：正常 active revision 下的 `super admin` 除 active pages 外只额外保留 `permission-center` / `system-audit-logs` 系统诊断页；只有挂载 `effective_session_sync_failed` 空投影后才保留全后台前端诊断路径。
- 下一步：如需改变 `adminProfileSync` / `ERPLayout` 行为或扩大诊断例外，应另起业务逻辑任务并同步测试。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交、不推送、不触碰 release evidence；当前工作区仍有多组既有未提交改动。

## 2026-06-30 adminProfileSync sync failure 文档口径再收紧

- 完成：按 review 只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把隐藏 URL 诊断例外统一成当前 helper 分支顺序：local dev pages 诊断、非前端 DEV 构建正常 active revision 下的 super admin 系统诊断页，以及已挂载 `source=effective_session_sync_failed` 空投影后的 super admin 全后台诊断路径。
- 完成：把 effective session 同步失败和管理员 `me` 接口同步失败拆开描述：前者由 `ERPLayout` 复用 `adminProfileRef.current.effective_session` 或挂载 sync-failed 空投影；后者才走外层 `getAdminProfileSyncErrorAction` 的缓存 profile / 重新登录 / 静默或提示处理，不由 `adminProfileSync` 额外生成客户配置投影。
- 下一步：如需改变菜单投影、隐藏 URL 跳转或 sync failure 诊断行为，应另起业务逻辑任务并同步 `web/src/erp/utils/adminProfileSync.test.mjs`。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交、不推送、不触碰 release evidence；当前工作区仍有多组既有未提交改动。

## 2026-06-30 P4-3 finished_goods_quality execute guard

- 完成：按多甲方角色能力流程编排主线推进 P4-3 的最小可验证闭环，新增 `customer_config.execute_finished_goods_delivery_quality_decide` guard-only API；该入口要求 `quality.inspection.update`，显式传入 active 节点、expected version、shipment ref 和幂等键后进入 ProcessRuntime 校验，当前因 `finished_goods_quality.decide` handler 未注册而返回“流程领域命令处理器不存在”，节点保持 active、后续节点不推进。
- 完成：同步 runtime manifest、priority audit 和正式文档口径：首个成品质检节点已不再保留 `explicit_runtime_execute_api_not_implemented` blocker，但仍保留 `domain_command_handler_not_registered / target_evidence_missing`；财务放行、仓库出货和应收线索仍保留 explicit execute API blocker。
- 验证：`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(ExplainProcessDefinitionFinishedGoodsDelivery|StartFinishedGoodsDelivery|ExecuteFinishedGoodsDelivery|StartFinishedGoodsDeliveryRequiresShipmentPermission)'`；`cd server && go test ./internal/biz -run 'TestCustomerConfigUsecase(ExplainProcessDefinitionFinishedGoodsDeliveryStartReady|BuildFinishedGoodsDeliveryStartOnlyProcess)'`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode validate && node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。
- 下一步：继续 P4-3 时仍不能直接注册成品质检、财务放行、仓库出货或应收 handler；应先评审成品质检真实 Fact 真源和 usecase，再逐个拆分 handler / execute API / RBAC / 幂等 / 审计 / 取消冲正测试。
- 阻塞/风险：本轮未改 schema / migration、业务 fact usecase、正式前端 UI、部署、真实导入或 release evidence；未写质检、出货、库存、应收、开票或财务 Fact；priority audit 仍显示 `releaseReady=false`，目标环境未证明黄金闭环。

## 2026-06-30 adminProfileSync 菜单投影文档职责口径

- 完成：按 review 只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 `adminProfileSync` 明确为 profile 投影、菜单过滤和当前 URL 是否跳转的 helper；`ERPLayout` 才负责拉取 / 复用 effective session、挂载 `effective_session_sync_failed` 空投影、fallback `replace` 和无入口时阻止业务 `Outlet` 渲染。
- 完成：同步收紧正式客户、local dev、super admin 和 sync failure 例外描述：正式普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄；local dev 只放开 pages 层诊断；正式 / 非前端 DEV 构建 super admin 仅保留系统诊断页或 sync-failed 空投影后的全后台前端诊断路径。
- 下一步：如需改变菜单投影、隐藏 URL 跳转、local dev 或 super admin 诊断行为，应另起业务逻辑任务并同步 `web/src/erp/utils/adminProfileSync.test.mjs`。
- 阻塞/风险：本轮不改业务逻辑、不改测试、不提交、不推送、不触碰 release evidence；当前工作区仍有多组既有未提交改动。

## 2026-06-30 P4-3 shipment_finance_release execute guard

- 完成：继续多甲方角色能力流程编排主线，新增 `customer_config.execute_finished_goods_delivery_finance_release` guard-only API；该入口要求 `finance.receivable.confirm`，显式传入 active `shipment_finance_release` 节点、expected version、shipment ref 和幂等键后进入 ProcessRuntime 校验。
- 完成：当前 `shipment.finance_release` handler 未注册时安全返回“流程领域命令处理器不存在”，财务放行节点保持 active，仓库出货节点保持 waiting；同步 runtime manifest、priority audit、`server/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`，去掉财务放行节点的 explicit execute API blocker，但保留 handler / target evidence blocker。
- 验证：`cd server && go test ./internal/biz -run 'TestCustomerConfigUsecase(ExplainProcessDefinitionFinishedGoodsDeliveryStartReady|BuildFinishedGoodsDeliveryStartOnlyProcess)'`；`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(ExplainProcessDefinitionFinishedGoodsDelivery|StartFinishedGoodsDelivery|ExecuteFinishedGoodsDelivery|StartFinishedGoodsDeliveryRequiresShipmentPermission)'`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode validate`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。
- 下一步：继续 P4-3 时优先补 `shipment_execution` guard-only execute API，仍只证明 RBAC、active node、expected version、幂等和 missing handler 安全失败；不要直接注册 shipment / finance / receivable handler。
- 阻塞/风险：本轮未改 schema / migration、Shipment / Finance / Inventory usecase、正式前端 UI、部署、真实导入或 release evidence；未写质检、出货、库存、应收、开票或财务 Fact；priority audit 仍显示 `releaseReady=false`、目标环境证据未闭环。

## 2026-06-30 P4-3 shipment_execution execute guard

- 完成：继续多甲方角色能力流程编排主线，新增 `customer_config.execute_finished_goods_delivery_shipment_ship` guard-only API；该入口要求 `shipment.ship`，显式传入 active `shipment_execution` 节点、expected version、shipment ref 和幂等键后进入 ProcessRuntime 校验。
- 完成：当前 `shipment.ship` handler 未注册时安全返回“流程领域命令处理器不存在”，仓库出货节点保持 active，应收线索节点保持 waiting；同步 runtime manifest、priority audit、`server/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`，去掉仓库出货节点的 explicit execute API blocker，但保留 handler / target evidence blocker。
- 验证：`cd server && go test ./internal/biz -run 'TestCustomerConfigUsecase(ExplainProcessDefinitionFinishedGoodsDeliveryStartReady|BuildFinishedGoodsDeliveryStartOnlyProcess)'`；`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(ExplainProcessDefinitionFinishedGoodsDelivery|StartFinishedGoodsDelivery|ExecuteFinishedGoodsDelivery|StartFinishedGoodsDeliveryRequiresShipmentPermission)'`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode validate`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。
- 下一步：继续 P4-3 时优先补 `receivable_lead` guard-only execute API；仍不能注册成品质检、财务放行、仓库出货或应收 handler，也不能把 `shipment_execution` guard-only API 当成实际 `ship_shipment`。
- 阻塞/风险：本轮未改 schema / migration、Shipment / Finance / Inventory usecase、正式前端 UI、部署、真实导入或 release evidence；未调用 `operational_fact.ship_shipment`，未写出货、库存 OUT、应收、开票或财务 Fact；priority audit 仍显示 `releaseReady=false`、`blockingCategory=external-release-evidence-required`，目标环境证据未闭环。

## 2026-06-30 P4-3 receivable_lead execute guard

- 完成：继续多甲方角色能力流程编排主线，新增 `customer_config.execute_finished_goods_delivery_receivable_lead` guard-only API；该入口要求 `finance.receivable.confirm`，显式传入 active `receivable_lead` 节点、expected version、shipment ref 和幂等键后进入 ProcessRuntime 校验。
- 完成：当前 `finance.receivable_lead` handler 未注册时安全返回“流程领域命令处理器不存在”，应收线索节点保持 active，end 节点保持 waiting；同步 runtime manifest、priority audit、`server/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`，P4-3 四个节点都不再保留 explicit execute API blocker，但 handler / target evidence blocker 仍保留。
- 验证：`cd server && go test ./internal/biz -run 'TestCustomerConfigUsecase(ExplainProcessDefinitionFinishedGoodsDeliveryStartReady|BuildFinishedGoodsDeliveryStartOnlyProcess)'`；`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(ExplainProcessDefinitionFinishedGoodsDelivery|StartFinishedGoodsDelivery|ExecuteFinishedGoodsDelivery|StartFinishedGoodsDeliveryRequiresShipmentPermission)'`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode validate`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。
- 下一步：若继续 P4-3，应另拆阶段评审真实 domain command handler 的 source-of-truth、RBAC、幂等、审计、重复提交、取消 / 冲正和目标环境 evidence；不要直接把 guard-only API 升级成 `ship_shipment` 或 `create_finance_fact`。
- 阻塞/风险：本轮未改 schema / migration、Shipment / Finance / Inventory usecase、正式前端 UI、部署、真实导入或 release evidence；未调用 `operational_fact.create_finance_fact`，未写应收、发票、财务 Fact，也未完成流程 end 节点；priority audit 仍显示 `releaseReady=false`、`blockingCategory=external-release-evidence-required`，目标环境证据未闭环。

## 2026-06-30 adminProfileSync 菜单投影文档口径复核

- 完成：按 review 继续只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 中的 `adminProfileSync` 描述，明确诊断例外只是在 `effective_session.pages` 层对当前 page key 返回 allowed，不是新的授权来源。
- 完成：补强正式客户 / 非前端 DEV 构建普通账号仍强收窄、local dev 普通账号仍先过 RBAC 菜单路径、super admin 全后台诊断只在 local dev 或 `effective_session_sync_failed` 空投影下成立的描述。
- 验证：按本轮边界只跑 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如需改变这些行为，应另起业务逻辑任务并同步 `web/src/erp/utils/adminProfileSync.mjs`、`ERPLayout` 和对应测试；本轮不改代码。
- 阻塞/风险：不改业务逻辑、不提交、不推送、不触碰 release evidence；当前工作区仍有多组既有未提交改动，本轮只认上述三份文件的文档口径修正。

## 2026-06-30 P4-3 shipment.ship ProcessRuntime handler

- 完成：继续多甲方角色能力流程编排主线，把 P4-3 `shipment_execution` 从 guard-only execute API 升级为显式 `shipment.ship` ProcessRuntime handler；handler 校验流程实例 shipment 业务引用与 payload `shipment_id` 一致，要求 active node / expected version / 幂等键由 ProcessRuntime 负责，并调用既有 `OperationalFactUsecase.ShipShipment`。
- 完成：`customer_config.execute_finished_goods_delivery_shipment_ship` 成功后完成 `shipment_execution`、激活 `receivable_lead`，复用现有 `ship_shipment` 领域逻辑推进出货单 `SHIPPED` 并写库存 `OUT`；它仍不是 Workflow task done 自动过账，不写 finance / receivable / invoice Fact。成品质检、财务放行和应收线索仍保持 missing handler guard-only。
- 完成：同步 `customer-config-runtime-manifest`、priority audit、`server/README.md`、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和服务端测试 fixture：`shipment_execution` 当前为 `process_runtime_handler_registered=true`，execute blocker 只剩 `target_evidence_missing`；其余三个 P4-3 节点仍保留 `domain_command_handler_not_registered / target_evidence_missing`。
- 验证：`cd server && go test ./internal/biz -run 'TestShipmentProcessDomainCommandShip|TestCustomerConfigUsecase(ExplainProcessDefinitionFinishedGoodsDeliveryStartReady|BuildFinishedGoodsDeliveryStartOnlyProcess)'`；`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(ExplainProcessDefinitionFinishedGoodsDelivery|StartFinishedGoodsDelivery|ExecuteFinishedGoodsDelivery|StartFinishedGoodsDeliveryRequiresShipmentPermission)'`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode validate`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。
- 下一步：继续 P4-3 时应另拆成品质检、财务放行或应收线索 handler 的真实 Fact 真源、RBAC、幂等、审计、重复提交、取消 / 冲正和目标环境 evidence；不要把 `shipment_release done` 或普通 Workflow task done 解释为自动出货 / 自动应收。
- 阻塞/风险：本轮未改 schema / migration、正式前端 UI、部署、真实导入或 release evidence；priority audit 仍显示 `releaseReady=false`，目标环境 release / smoke / backup / rollback / signoff 证据缺失。

## 2026-06-30 P4-3 finished_goods_quality 防误接边界

- 完成：继续多甲方角色能力流程编排主线，复核 P4-3 首个剩余缺口 `finished_goods_quality.decide`。结论是当前不能把 P4-2 已注册的 `quality_inspection.decide` 直接复用为 P4-3 成品质检 handler；现有 handler 明确要求流程实例拥有 `purchase_receipt` 主引用或 linked ref，并按 `quality_inspection_id / purchase_receipt_id / inventory_lot_id` 校验来料质检单，不证明该质检事实属于 shipment。
- 完成：修正 `server/internal/biz/customer_config_test.go` 中 P4-3 start-ready fixture 的旧口径：`shipment_execution` 已是 `process_runtime_handler_registered=true`，execute blocker 只剩 `target_evidence_missing`；P4-3 剩余 missing handler 为 `finished_goods_quality / shipment_finance_release / receivable_lead`。
- 完成：同步 `server/README.md`、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md`、`customer-config-runtime-manifest` 和 priority audit，明确 P4-2 来料质检 handler 是 purchase-receipt-bound，不能在未评审 shipment linked quality fact 前复用到 P4-3。
- 验证：`cd server && go test ./internal/biz -run 'TestCustomerConfigUsecase(ExplainProcessDefinitionFinishedGoodsDeliveryStartReady|BuildFinishedGoodsDeliveryStartOnlyProcess)|TestQualityInspectionProcessDomainCommandDecide'`；`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(ExplainProcessDefinitionFinishedGoodsDelivery|ExecuteFinishedGoodsDeliveryQualityDecide|ExecuteFinishedGoodsDeliveryShipmentShip|StartFinishedGoodsDelivery)'`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode validate`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。
- 下一步：若继续 P4-3，应先补“shipment 成品质检事实来源 / linked quality ref”评审或实现，再注册 `finished_goods_quality.decide`；财务放行和应收线索也必须另拆，不要绕过链路顺序直接写 finance fact。
- 阻塞/风险：本轮未新增 handler、未写质检 / 出货 / 库存 / 应收 / 开票 / 财务 Fact，未改 schema / migration、正式前端 UI、部署、真实导入或 release evidence；priority audit 仍显示 `releaseReady=false`，目标环境证据未闭环。

## 2026-06-30 adminProfileSync 菜单投影诊断例外文档收敛

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把菜单投影拆清为 RBAC 菜单路径层与 `effective_session.pages` 层，并明确 `adminProfileSync` 只返回过滤 / 跳转 helper 判定，实际拉取、缓存、空投影挂载和 fallback `replace` 由 `ERPLayout` 执行。
- 完成：补清隐藏 URL、local dev、super admin 和 sync failure 诊断例外：正式普通账号仍强收窄；local dev 只放开 pages 层诊断；已登记菜单路径仍先过 RBAC；正式 / 非前端 DEV 构建 super admin 只在系统诊断页或 `effective_session_sync_failed` 空投影下获得前端诊断例外。
- 验证：按本轮边界只跑 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如需改变行为，应另起业务逻辑任务并同步 `adminProfileSync`、`ERPLayout` 和测试；本轮不改代码。
- 阻塞/风险：不改业务逻辑、不提交、不推送、不触碰 release evidence；当前工作区仍有其他既有未提交改动。

## 2026-06-30 priority audit P4-3 本地 guarded 缺口纠偏

- 完成：回到多甲方角色能力流程编排主线，修正 `multi-client-role-workflow-priority-audit` 的 P4-3 分类；新增 `p4-finished-goods-remaining-domain-handlers` 覆盖项，把 `finished_goods_quality / shipment_finance_release / receivable_lead` 剩余未注册 handler 明确列为本地 guarded 缺口。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，说明该缺口会进入执行队列，避免误读为只剩 release evidence；未改业务 usecase、schema、migration、前端页面、release evidence 或客户真实数据。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `localGuardedRequirementIds` 包含 `p4-finished-goods-remaining-domain-handlers`。
- 下一步：继续 P4-3 时优先拆 `finished_goods_quality.decide` 的 shipment-linked quality fact / ref 合同，不能复用 P4-2 purchase-receipt-bound `quality_inspection.decide`。
- 阻塞/风险：当前没有目标环境 release evidence，也没有真实客户数据闭环；本轮只修正执行队列和文档口径，不注册新 handler、不执行导入或部署。

## 2026-06-30 adminProfileSync 菜单投影诊断例外文档再收窄

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 `super admin`、local dev 和 sync failure 的“全后台”表述收窄为前端已登记页面 key 对应的诊断可见性。
- 完成：明确隐藏 URL 仍先经过 RBAC 菜单路径判断；普通账号 local dev 只在 RBAC 已允许后放开 `effective_session.pages` 层诊断，正式普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄。
- 验证：按本轮边界只跑 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如需改变菜单投影或跳转行为，应另起业务逻辑任务并同步 `web/src/erp/utils/adminProfileSync.mjs`、`ERPLayout` 和测试。
- 阻塞/风险：不改业务逻辑、不提交、不推送、不触碰 release evidence；当前工作区仍有其他既有未提交改动。

## 2026-06-30 adminProfileSync 隐藏 URL 口径补充

- 完成：继续按 review 发现只修正文档口径，补清 `shouldRedirectFromCurrentNavigation` 的当前 URL 判定来源：RBAC 层来自 `resolveMenuPermissionKey(location.pathname)`，pages 层来自 `ERPLayout` 从当前前端菜单定义解析出的 `currentEntry?.key`。
- 完成：同步 `docs/当前真源与交接顺序.md` 和 `web/README.md`，明确未映射成菜单权限 key 或未登记成当前页面 key 的 URL 不会因为诊断例外获得新的后端授权；普通账号 local dev 只保留 RBAC 已授权但被客户配置隐藏的已登记页面诊断入口。
- 验证：按本轮边界只跑 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如需调整实际跳转、fallback 或诊断放开范围，应另起业务逻辑任务并同步 `adminProfileSync`、`ERPLayout` 和测试。
- 阻塞/风险：不改业务逻辑、不提交、不推送、不触碰 release evidence；当前工作区仍有其他既有未提交改动。

## 2026-06-30 P4-3 receivable_lead 证据一致性收口

- 完成：回到多甲方角色能力流程编排主线，先收口当前已打开的 P4-3 `finance.receivable_lead` 闭环；修正 `server/internal/service/jsonrpc_customer_config_test.go` 中 finished goods delivery publish fixture，把 `receivable_lead` 合同改为 `process_runtime_handler_registered=true` 且 execute blocker 只保留 `target_evidence_missing`，与当前 handler、manifest 和正式文档一致。
- 完成：修正 `TestCustomerConfigJSONRPCExecuteFinishedGoodsDeliveryReceivableLeadCreatesDraft` 的管理员上下文为 finance 账号，避免测试 fixture 用户与权限上下文不一致；同步 priority audit 锚点，把应收线索从旧 guarded 测试名改为当前 creates-draft 测试名，并补 `OperationalFactUsecase.CreateFinanceFactDraft` 证据。
- 完成：本阶段确认 `finished_goods_quality` 与 `shipment_finance_release` 仍不能静默升级：前者没有 shipment-linked quality fact 真源，后者当前没有正式 shipment finance release fact / status 字段，`shipping_released` 仍只是 Workflow 协同状态。
- 验证：`cd server && go test ./internal/biz -run 'TestFinanceProcessDomainCommandReceivableLead|TestShipmentProcessDomainCommandShip|TestCustomerConfigUsecase(ExplainProcessDefinitionFinishedGoodsDeliveryStartReady|BuildFinishedGoodsDeliveryStartOnlyProcess)'`；`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(ExecuteFinishedGoodsDeliveryReceivableLead|ExecuteFinishedGoodsDeliveryShipmentShip|ExecuteFinishedGoodsDeliveryFinanceRelease|ExplainProcessDefinitionFinishedGoodsDelivery|StartFinishedGoodsDelivery)'`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode validate`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；限定 `git diff --check` 均通过。
- 下一步：继续 P4-3 时应先单独评审并实现 `finished_goods_quality.decide` 的 shipment-linked quality fact / ref 合同，或为 `shipment.finance_release` 新增正式领域事实 / 状态模型；不能复用 P4-2 purchase-receipt-bound 质检 handler，也不能把 Workflow `shipping_released` 当财务放行事实。
- 阻塞/风险：本轮未改 schema / migration、未注册成品质检或财务放行 handler、未改前端页面、未执行真实导入、未触碰 release evidence、未提交未推送；priority audit 仍显示 `releaseReady=false`，目标环境 evidence 缺失。

## 2026-06-30 adminProfileSync 隐藏 URL RBAC 空 key 文档纠偏

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把未解析出菜单权限 key 的 URL 说明改为与当前 `shouldRedirectFromCurrentNavigation` 一致：空 `currentMenuPath` 不触发 helper 的 RBAC 跳转，后续仍由 `currentEntry?.key`、pages 投影、router 和 `ERPLayout` fallback 决定。
- 完成：同步清理正式文档里的“全后台”诊断表述，收窄为前端菜单定义可解析出的页面路径诊断可见性；正式普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄，local dev / super admin / sync failure 仍只是前端诊断例外，不扩大后端授权。
- 验证：按本轮边界只跑 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如需改变实际跳转、fallback、菜单投影或诊断放开范围，应另起业务逻辑任务并同步 `adminProfileSync`、`ERPLayout` 和测试。
- 阻塞/风险：不改业务逻辑、不提交、不推送、不触碰 release evidence；当前工作区仍有其他既有未提交改动。

## 2026-06-30 P4-3 quality source anchor foundation

- 完成：回到多甲方角色能力模块组合流程编排主线，先补 P4-3 `finished_goods_quality.decide` 前置事实基础；为 `quality_inspections` 增加 nullable `source_type / source_id / inspection_type / subject_type / subject_id`，并通过 Ent + Atlas 生成 `20260630010102_migrate.sql`，只生成不 apply 数据库。
- 完成：现有来料质检创建仍保持 purchase-receipt-bound 主路径，新建草稿默认写入 `source_type=PURCHASE_RECEIPT`、`inspection_type=INCOMING`、`subject_type=MATERIAL`，并校验 source / subject 与 `purchase_receipt_id / material_id` 一致；显式 `source_type=SHIPMENT` 仍被拒绝，避免把 shipment 成品质检误接到 P4-2 来料质检 handler。
- 完成：同步 `server/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`，明确该锚点只是 shipment-linked 成品质检事实兼容基础，不代表已注册 `finished_goods_quality.decide`。
- 验证：`cd server && make data`；`cd server && go test ./internal/data -run 'TestInventoryRepo_QualityInspection|TestQualityInspectionPostgresShapeAndFlow'`；`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_QualityInspection|TestQualityInspectionFilterFromParams'`；`cd server && go test ./internal/biz -run 'TestQualityInspectionProcessDomainCommandDecide|TestCustomerConfigUsecase(ExplainProcessDefinitionFinishedGoodsDeliveryStartReady|BuildFinishedGoodsDeliveryStartOnlyProcess)'`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。
- 下一步：继续 P4-3 时应基于该 source/type/subject 锚点另拆 `finished_goods_quality.decide` 的 shipment-linked quality fact / ref 合同，或先实现 `shipment.finance_release` 的正式 release fact/status；不能复用 P4-2 `quality_inspection.decide`，也不能把 Workflow `shipping_released` 当财务放行事实。
- 阻塞/风险：本轮未注册成品质检或财务放行 handler，未写 shipment 质检事实、出货、库存、应收、开票或财务 Fact，未 apply migration，未改前端页面，未执行真实导入、部署或 release evidence；priority audit 仍显示 `releaseReady=false`，目标环境 evidence 缺失。

## 2026-06-30 adminProfileSync 文档口径按代码再对齐

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 local dev pages 诊断明确限定在第一层 RBAC 已通过之后，避免误读为普通账号可绕过 RBAC 菜单路径。
- 完成：补清 active revision 正常返回空页面清单不属于 sync failure，而是空 active pages 投影；sync failure 诊断例外只来自 `effective_session_sync_failed` 空投影或已有缓存投影路径，不扩大后端授权、动作权限或 release evidence 判断。
- 验证：按本轮边界只跑 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如需改变实际投影、跳转或诊断放开范围，应另起业务逻辑任务并同步 `adminProfileSync`、`ERPLayout` 和测试。
- 阻塞/风险：不改业务逻辑、不提交、不推送、不触碰 release evidence；当前工作区仍有其他既有未提交改动。

## 2026-06-30 P4-3 finished_goods_quality handler

- 完成：继续多甲方角色能力模块组合流程编排 P4-3 主线，注册 `finished_goods_quality.decide` ProcessRuntime handler；handler 只接受 shipment 业务引用，并要求 `quality_inspection_id` 指向 `source_type=SHIPMENT / source_id=<shipment_id> / inspection_type=FINISHED_GOODS` 的已提交质检事实。
- 完成：成品质检 handler 成功后调用 `InventoryUsecase.PassQualityInspection / RejectQualityInspection` 完成质检判定并推进流程节点；不复用 P4-2 purchase-receipt-bound `quality_inspection.decide`，不调用采购入库过账，不写出货、库存流水、应收、开票或财务 Fact。
- 完成：同步 `customer_config.execute_finished_goods_delivery_quality_decide` runtime boundary、runtime manifest、priority audit、`server/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`；剩余本地 guarded 缺口收窄为 `shipment.finance_release`，target release evidence 仍保持未闭环。
- 验证：`cd server && go test ./internal/biz -run 'Test(QualityInspectionProcessDomainCommandDecide|FinishedGoodsQualityProcessDomainCommandDecide|CustomerConfigUsecase(ExplainProcessDefinitionFinishedGoodsDeliveryStartReady|BuildFinishedGoodsDeliveryStartOnlyProcess))'`；`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(ExecuteFinishedGoodsDeliveryQualityDecide|StartFinishedGoodsDelivery|ExplainProcessDefinitionFinishedGoodsDelivery)'`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `ok=true / releaseReady=false` 且剩余未证明项为 `shipment.finance_release` 与目标环境闭环。
- 下一步：继续 P4-3 时优先实现 `shipment.finance_release` 的正式放行事实 / 状态模型与 handler，且不得把 Workflow `shipping_released` 当财务放行事实；shipment 成品质检创建 / 列表路径也需单独评审，不应混进财务放行阶段。
- 阻塞/风险：本轮未新增 shipment 质检创建入口，未改 schema / migration，未写出货、库存流水、应收、开票或财务 Fact，未执行真实导入、部署或 release evidence；当前工作区仍有其他既有未提交改动。

## 2026-06-30 adminProfileSync 文档口径收敛

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，使菜单投影、隐藏 URL 跳转、local dev / super admin / sync failure 诊断例外与当前 `adminProfileSync` 和 `ERPLayout` 代码一致。
- 完成：将正式普通账号口径明确为 RBAC 菜单路径与 active revision pages 的交集强收窄；隐藏 URL 只由 helper 返回跳转判定，真实 fallback 仍由 `ERPLayout` 在存在已过滤可见入口时执行。
- 完成：收敛重复说明，明确 local dev 只放开第二层 pages 诊断，普通账号仍受已登记菜单路径 RBAC 约束；正式 super admin 正常 active revision 仅额外保留系统诊断页，只有 sync-failed 空投影才放开前端菜单定义可解析页面路径诊断可见性。
- 验证：按本轮边界只跑 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如需改变实际投影、跳转或诊断放开范围，应另起业务逻辑任务并同步 `adminProfileSync`、`ERPLayout` 和测试。
- 阻塞/风险：不改业务逻辑、不提交、不推送、不触碰 release evidence；当前工作区仍有其他既有未提交改动。

## 2026-06-30 Skill 自动选择规则补充

- 完成：更新 `AGENTS.md`，新增“Skill 自动选择规则”，明确用户未指定 skill 时先评估明显匹配；项目专属 skill 优先；通用 skill 只在任务明确匹配时使用；无明显匹配或会引入不必要复杂度时可以不选 skill。
- 完成：规则同时要求开始工作前用一句话说明选择或不选择 skill 的原因，并禁止为了“必须使用 skill”机械套用不相关 skill。
- 验证：`progress.md` 更新前已检查规模为 320 行、65KB，低于归档阈值；按 docs-only 边界执行 `git diff --check -- AGENTS.md progress.md`。
- 下一步：后续如新增、删除、重命名或调整项目 skill 职责，再按项目专属 skill 维护约定运行 validator、YAML 解析和 metadata 扫描。
- 阻塞/风险：本轮只改项目级协作规则和进度记录，不改运行时代码、schema、测试脚本、部署流程、skill 内容或 `docs/文档清单.md`。

## 2026-06-30 P4-3 shipment.finance_release handler

- 完成：继续多甲方角色能力模块组合流程编排 P4-3 主线，将 `shipment.finance_release` 从 guard-only 升级为显式 ProcessRuntime handler；handler 通过 `OperationalFactUsecase.GetShipment` 校验流程 shipment ref 存在且仍为 `DRAFT`，成功后只完成 `shipment_finance_release` 节点并激活 `shipment_execution`。
- 完成：同步 `customer_config.execute_finished_goods_delivery_finance_release` runtime boundary、runtime manifest、priority audit、`server/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`；本地 P4-3 四个 execute handler 均进入 `process_runtime_handler_registered=true`，priority audit 本地 guarded 清零。
- 完成：本阶段未新增 schema / migration，未写 shipment 独立 release 状态，未调用 `ShipShipment`，未写库存流水、应收、开票或 finance fact，未触碰 release evidence、真实导入、部署或客户原始资料。
- 验证：`cd server && go test ./internal/biz -run 'TestShipmentProcessDomainCommand|TestFinanceProcessDomainCommand|TestCustomerConfigUsecase(ExplainProcessDefinitionFinishedGoodsDeliveryStartReady|BuildFinishedGoodsDeliveryStartOnlyProcess)'`；`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPC(ExecuteFinishedGoodsDeliveryFinanceRelease|ExecuteFinishedGoodsDeliveryShipmentShip|ExecuteFinishedGoodsDeliveryReceivableLead|StartFinishedGoodsDelivery|ExplainProcessDefinitionFinishedGoodsDelivery)'`；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `ok=true / releaseReady=false / localGuarded=none`。
- 下一步：继续 P4-3 时优先评审 shipment 成品质检创建 / 列表路径，或另拆独立财务放行状态、取消 / 撤销策略；目标环境 release evidence 仍需按发布证据闭环单独推进。
- 阻塞/风险：当前没有正式生产环境，目标环境 smoke / release evidence 未闭环；本阶段只证明本地代码、合同和测试，不代表真实客户数据导入、正式上线或目标环境黄金链路已执行。

## 2026-06-30 adminProfileSync 诊断例外文档微调

- 完成：按 review 发现只修正文档口径，微调 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 local dev 诊断例外明确为 helper 第二层 `effective_session.pages` 页面 key 判定，不改业务逻辑。
- 完成：同步说明 `super admin` 在第一层只是前端菜单路径判断视为通过，正式 / 非前端 DEV 构建仍受 active revision pages 收窄，sync-failed 空投影只保留诊断可见性，不扩大后端授权或 release evidence。
- 验证：按本轮边界只跑 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如需改变实际菜单投影、URL 跳转或诊断放开范围，应另起业务逻辑任务并同步 `adminProfileSync`、`ERPLayout` 和测试。
- 阻塞/风险：不改业务逻辑、不提交、不推送、不触碰 release evidence；当前工作区仍有其他既有未提交改动。

## 2026-06-30 P4-3 shipment 成品质检 create/list 证据收口

- 完成：继续多甲方角色能力模块组合流程编排 P4-3A，将现有 `create_finished_goods_quality_inspection_draft` / `list_finished_goods_quality_inspections` shipment 成品质检入口写入 `server/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/多甲方角色能力流程编排优先级.md` 当前口径，明确它只允许从 `DRAFT` shipment、匹配 shipment item、产品批次和产品 subject 创建 / 查询 shipment-linked 成品质检草稿。
- 完成：同步 `multi-client-role-workflow-priority-audit`，把 `jsonrpc_quality.go`、`quality_inspection.go`、`quality_inspection_repo.go`、repo 测试和 JSON-RPC 测试纳入 P4-3 definition evidence；审计测试新增断言，避免后续只证明流程 handler 而漏掉成品质检 create/list。
- 验证：`cd server && go test ./internal/data -run 'TestInventoryRepo_(FinishedGoodsQualityInspectionReferenceValidation|QualityInspectionReferenceValidation|QualityInspectionLifecycleAndLotStatus|QualityInspectionSubmittedUniquenessAndProtection)'`；`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_(FinishedGoodsQualityInspectionAPIBindsShipmentFact|QualityInspectionAPIChangesLotStatusWithoutInventoryTxn)'`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `ok=true / releaseReady=false`。
- 下一步：继续 P4-3 时优先补本地黄金链路证据：shipment draft -> shipment-linked 成品质检 create/submit/decide -> finance release -> ship -> receivable draft；独立财务放行状态、取消 / 撤销策略和目标环境 release evidence 仍需另拆阶段。
- 阻塞/风险：本阶段不改业务逻辑、不新增 schema / migration、不写 release evidence、不执行真实导入或部署；shipment 成品质检 submit 只把产品批次置为 `HOLD`，不会写出货、库存流水、应收、开票或财务 Fact。

## 2026-06-30 adminProfileSync review 文档口径复核

- 完成：按 review 发现继续只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，明确 `super admin` 只在第一层前端菜单路径判断中视为通过，不代表第二层 pages 或后端授权放开。
- 完成：同步 `web/README.md` 的测试覆盖说明，把正式 / 非前端 DEV 构建 super admin 的 sync-failed 例外表述为“保留前端菜单定义可解析出的页面路径诊断可见性”，避免误读为正式授权或 release evidence。
- 验证：按本轮边界只跑 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如需改变实际菜单投影、URL 跳转或诊断放开范围，应另起业务逻辑任务并同步 `adminProfileSync`、`ERPLayout` 和测试。
- 阻塞/风险：不改业务逻辑、不提交、不推送、不触碰 release evidence；当前工作区仍有其他既有未提交改动。

## 归档说明

- 本归档保存根 `progress.md` 在继续 P5 release input checklist 前的旧流水。
- 根 `progress.md` 仅保留当前活跃事项、归档索引和 P5 最近记录。
