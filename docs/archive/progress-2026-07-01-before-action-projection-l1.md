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
- `docs/archive/progress-2026-06-30-before-p5-release-input-checklist.md`：归档 2026-06-30 P4-2 / P4-3、adminProfileSync 文档纠偏和进入 P5 release closeout 输入清单前的过程记录。
- `docs/archive/progress-2026-06-30-before-p5-input-checklist-followup.md`：归档 2026-06-30 P5 release closeout report-only、release evidence hardening、菜单投影纠偏和 input checklist JSON 自定义路径只读合同之前的过程记录。
- `docs/archive/progress-2026-06-30-before-outsourcing-order-api-gate.md`：归档 2026-06-30 P5 input checklist、adminProfileSync 文档纠偏、purchase / quality / shipment / stock reservation / production / outsourcing fact / sales / purchase order moduleStates 门禁等过程记录。

## 当前活跃事项

- 多甲方角色能力流程编排以 `docs/product/多甲方角色能力流程编排优先级.md` 和 `node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 的 `implementationOrder` 为本地优先级入口；GPT/reference 资料只作输入，当前真源仍回到代码、migration、测试和正式文档。
- 当前审计显示 P0-P4 本地证据为 ready；P5 测试部署 / 导入 / 第二客户验证仍为 `target-evidence-required`，第一条 blocked release action 是 `immutable-version`。
- P5 当前只允许 report-only、input template 和 checklist 准备；没有真实目标环境、镜像 digest、migration 前后版本和 backup id 时，不写 `deployments/**/evidence/**`，不执行 `--execute`，不把本地 ready 写成目标 release evidence。
- 真实客户数据导入、正式生产发布、目标环境 smoke、目标 migration、备份恢复、回滚 / 前向修复演练、客户配置激活和签收仍未执行，不能被本地 dry-run、manifest 编译、status、gate、audit 或 runner report 替代。

## 2026-06-30 progress 归档到 outsourcing order API 门禁前

- 完成：归档前 `progress.md` 为 361 行 / 80299 bytes，达到 80KB 阈值；已将完整原文复制到 `docs/archive/progress-2026-06-30-before-outsourcing-order-api-gate.md`。
- 完成：根 `progress.md` 已收敛为归档索引、当前活跃事项和本轮后续记录入口，避免继续在超过阈值的根流水上追加。
- 下一步：继续 P5 时仍按单域可验证切片推进；若进入 release evidence、真实导入、部署或目标环境 smoke，必须先显式声明跨越边界。
- 阻塞/风险：本次归档只整理过程记录，不改变 runtime、schema、RBAC、发布脚本、目标环境状态、release evidence 或正式业务真源。

## 2026-06-30 P5 outsourcing order 委外订单 API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；核对现有 `outsourcing_order` Source Document 写入口已经接入 active module states 本地门禁，并补齐正式文档口径。`save_outsourcing_order_with_items / submit_outsourcing_order / confirm_outsourcing_order / close_outsourcing_order / cancel_outsourcing_order` 要求 `outsourcing_orders=enabled`，`read_only / disabled / 缺失` 会拒绝且不调用 `OutsourcingOrderUsecase` 写入或推进委外订单；`get/list` 历史读取继续保留。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md`、`docs/文档清单.md` 和 progress 归档索引，使 priority audit 的 `module-disabled-readonly-outsourcing-order-api-gate` 与正式文档一致；未改业务逻辑、schema、migration、发布脚本或 release evidence。
- 验证：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_OutsourcingOrderAPIRequiresEnabledModule|TestJsonrpcDispatcher_OutsourcingOrderAPISavesListsAndTransitions'` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs && node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`cd server && go test ./internal/biz ./internal/service` 通过；`node --test scripts/qa/docs-inventory.test.mjs && node scripts/qa/workflow-fact-boundary.test.mjs && node scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `ok=true`，P5 仍为 `target-evidence-required`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 exit 1，`releaseReady=false`。
- 下一步：继续 P5 时，可从剩余普通后端业务 API、打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；若进入 release evidence，必须先收集真实 release batch 输入并显式声明跨越边界。
- 阻塞/风险：该切片只证明 outsourcing order 委外订单 Source Document 写 API 的本地门禁，不证明完整 P5 ready；本轮未执行部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 material BOM 工程资料 API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；`bom` JSON-RPC 写入口接入 active module states 本地门禁。`create_bom_draft / update_bom_draft / copy_bom_version / activate_bom_version / archive_bom_version / add_bom_item / update_bom_item / delete_bom_item` 现在要求 `material_bom=enabled`，`read_only / disabled / 缺失` 会拒绝且不调用 `InventoryUsecase` 写 BOM 头或明细；`list_bom_versions / get_bom_version` 历史读取继续保留。
- 完成：补齐 `TestJsonrpcDispatcher_BOMAPIRequiresEnabledModule`，锁住 `material_bom=read_only` 时不能创建 BOM、`material_bom=enabled` 时可创建并新增明细、`material_bom=disabled` 时不能激活 BOM，且历史 list/get 仍可用；同步 priority audit、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md` 口径。
- 验证：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_BOMAPIRequiresEnabledModule|TestJsonrpcDispatcher_BOMVersionLifecycle|TestJsonrpcDispatcher_BOMAPIRequiresDedicatedPermissions'` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs && node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `module-disabled-readonly-material-bom-api-gate` 为 ready/pass，P5 仍为 `target-evidence-required`；`cd server && go test ./internal/biz ./internal/service` 通过；`node --test scripts/qa/docs-inventory.test.mjs && node scripts/qa/workflow-fact-boundary.test.mjs && node scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 exit 1，`releaseReady=false`。
- 下一步：继续 P5 时，可从剩余普通后端业务 API、打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；若进入 release evidence，必须先收集真实 release batch 输入并显式声明跨越边界。
- 阻塞/风险：该切片只证明 material BOM 工程资料写 API 的本地门禁，不证明完整 P5 ready；本轮未执行部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入，也未改变 BOM 与库存 / 采购 / 生产 / 成本 / 财务 Fact 的边界。

## 2026-06-30 adminProfileSync 菜单投影文档口径纠偏

- 完成：按 review 发现只修正文档口径，不改业务逻辑、不提交、不推送、不碰 release evidence；同步 `docs/当前真源与交接顺序.md` 和 `web/README.md` 中菜单投影、隐藏 URL 跳转、local dev / super admin / sync failure 诊断例外描述，使其回到 `adminProfileSync` 与 `ERPLayout` 当前代码：helper 只判定菜单过滤和当前 URL 是否应跳转，`ERPLayout` 承担 effective session 拉取、缓存复用、空投影挂载和实际 fallback 跳转。
- 完成：补清 `super admin` sync failure 例外的边界：正式构建下正常 active revision 仍按 active pages 收窄，仅系统诊断页额外放开；sync failure 空投影时 helper 放开当前传入的 page key，菜单项范围由导航定义决定，隐藏 URL 仍按 `buildCurrentEntry` 解析或 fallback 后的 page key 判定；`hasCachedProfile` 不等于已有客户配置投影缓存。
- 下一步：后续若继续调整菜单投影，应先改 `adminProfileSync` / `ERPLayout` 测试或实现，再同步文档；本轮只做文档纠偏。
- 阻塞/风险：本轮未运行业务测试、浏览器回归、目标环境 smoke、release readiness 或 release evidence 检查；只按用户指定执行 diff whitespace 检查。

## 2026-06-30 P5 processes 加工环节主数据 API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；`masterdata` 的 processes 加工环节主数据写入口接入 active module states 本地门禁。`create_process / update_process / set_process_active` 现在要求 `processes=enabled`，`read_only / disabled / 缺失` 会拒绝且不调用 `MasterDataUsecase` 写加工环节主数据；`get_process / list_processes` 历史读取继续保留。
- 完成：补齐 `TestJsonrpcDispatcher_ProcessAPIRequiresEnabledModule`，锁住 `processes=read_only` 时不能创建工序、`processes=enabled` 时可创建和更新、`processes=disabled` 时不能启停，且历史 get/list 仍可用；同步 priority audit、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md` 口径。
- 验证：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_ProcessAPIRequiresEnabledModule|TestJsonrpcDispatcher_ProcessAPIRequiresPermissionAndKeepsFlexibleFlags'` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs && node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `module-disabled-readonly-process-masterdata-api-gate` 为 ready/pass，P5 仍为 `target-evidence-required`；`cd server && go test ./internal/biz ./internal/service` 通过；`node --test scripts/qa/docs-inventory.test.mjs && node scripts/qa/workflow-fact-boundary.test.mjs && node scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 exit 1，`releaseReady=false`。
- 下一步：继续 P5 时，可从剩余普通后端业务 API、打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；若进入 release evidence，必须先收集真实 release batch 输入并显式声明跨越边界。
- 阻塞/风险：该切片只证明 processes 加工环节主数据写 API 的本地门禁，不证明完整 P5 ready；本轮未执行部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入，也未改变工序与 BOM / 采购 / 生产 / 成本 / 财务 Fact 的边界。

## 2026-06-30 P5 MasterData 基础档案 API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；`masterdata` 基础档案写入口接入 active module states 本地门禁。客户主体 / 聚合保存要求 `customers=enabled`，供应商主体 / 聚合保存要求 `suppliers=enabled`，联系人创建 / 更新按 `owner_type` 映射到客户或供应商模块，联系人设主 / 停用会先读取现有 owner 再按对应模块要求 `enabled`，材料写入口要求 `materials=enabled`，产品和 SKU 写入口要求 `products=enabled`；`read_only / disabled / 缺失` 会拒绝且不调用 `MasterDataUsecase` 写基础档案，历史 get/list 读取继续保留。
- 完成：补齐 `TestJsonrpcDispatcher_MasterDataCoreAPIRequiresEnabledModules`，锁住 customers / suppliers / materials / products 非 enabled 时代表写入口不进入 usecase，供应商联系人创建和 id-only 停用按 owner 模块阻断，历史 list 仍可用；同步 priority audit、`docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md` 口径。
- 验证：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_MasterDataCoreAPIRequiresEnabledModules|TestJsonrpcDispatcher_ProcessAPIRequiresEnabledModule|TestJsonrpcDispatcher_MasterDataCreateCustomerRequiresAdminAndPermission|TestJsonrpcDispatcher_ContactAPIUsesUsecaseOwnerGuard|TestJsonrpcDispatcher_MaterialAPIRequiresPermissionAndValidUnit|TestJsonrpcDispatcher_ProductAPIRequiresPermissionAndValidUnit|TestJsonrpcDispatcher_ProductSKUAPIRequiresPermissionAndValidRefs'` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs && node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `module-disabled-readonly-masterdata-core-api-gate` ready/pass，P5 仍为 `target-evidence-required`；`cd server && go test ./internal/biz ./internal/service` 通过；`node --test scripts/qa/docs-inventory.test.mjs && node scripts/qa/workflow-fact-boundary.test.mjs && node scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 exit 1，`releaseReady=false`。
- 下一步：验证通过后继续 P5，可从打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；若进入 release evidence，必须先收集真实 release batch 输入并显式声明跨越边界。
- 阻塞/风险：该切片只证明 MasterData 基础档案普通写 API 的本地门禁，不证明完整 P5 ready；本轮未执行部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入，也未改变客户 / 供应商 / 材料 / 产品 / SKU 与订单、库存、BOM、生产、出货或财务 Fact 的边界。

## 2026-06-30 adminProfileSync 菜单投影文档口径二次纠偏

- 完成：按 review 发现只修正文档口径，不改业务逻辑、不提交、不推送、不碰 release evidence；同步 `docs/当前真源与交接顺序.md` 和 `web/README.md`，补清普通 `me` profile 缓存不等于客户配置投影缓存，也不会触发 super admin sync failure 诊断。
- 完成：补清 `adminProfileSync.test.mjs` 覆盖边界：正式普通账号 sync failure 不退回 RBAC-only、本地开发 pages 诊断、正式 super admin sync failure / 系统诊断例外、当前页面被 active pages 隐藏时的跳转判定和 `ERPLayout` fallback 合同；这些测试只锁住前端 helper / 页面壳边界，不替代后端 RBAC、目标环境 smoke 或 release evidence。
- 下一步：后续若继续调整菜单投影，应先改 `adminProfileSync` / `ERPLayout` 测试或实现，再同步文档；本轮只做文档纠偏。
- 阻塞/风险：本轮未运行业务测试、浏览器回归、目标环境 smoke、release readiness 或 release evidence 检查；只按用户指定执行 diff whitespace 检查。

## 2026-06-30 adminProfileSync 菜单投影文档口径三次纠偏

- 完成：按 review 发现继续只修正文档口径，不改业务逻辑、不提交、不推送、不碰 release evidence；同步 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 sync failure 诊断例外进一步收窄为非 local dev 正式构建下仅 super admin 且当前 profile 已挂载 `effective_session_sync_failed` 空投影时才放开当前传入 helper 的 page key。
- 完成：补清该例外仍只影响 `adminProfileSync` pages 判定和 `ERPLayout` fallback 跳转判定；菜单项过滤范围仍来自导航定义，隐藏 URL 仍按 `buildCurrentEntry` 解析或 fallback 后的 page key 判定，不能解释为正式 active revision 隐藏页授权、普通账号兜底或后端 RBAC / release evidence 放宽。
- 下一步：后续若继续调整菜单投影，应先改 `adminProfileSync` / `ERPLayout` 测试或实现，再同步文档；本轮只做文档纠偏。
- 阻塞/风险：本轮未运行业务测试、浏览器回归、目标环境 smoke、release readiness 或 release evidence 检查；只按用户指定执行 diff whitespace 检查。

## 2026-06-30 P5 attachment 证据写 API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；`attachment` 证据写入口接入 active module states 本地门禁。`upload_attachment / delete_attachment` 现在按 `owner_type` 映射到 `sales_orders / purchase_orders / outsourcing_orders / purchase_receipts / quality_inspections / shipments / finance / production / products / material_bom / workflow_tasks` 等所属模块，要求对应模块为 `enabled`；`read_only / disabled / 缺失` 会拒绝且不调用附件创建或删除。`list_attachments / download_attachment` 历史读取继续保留。
- 完成：补齐 `TestJsonrpcDispatcher_AttachmentWriteAPIRequiresOwnerModuleEnabled` 和 `TestBusinessAttachmentOwnerModuleKeys`，锁住 owner 模块 `read_only` 时不能上传、`enabled` 时可上传、`disabled` 时不能删除且历史 list/download 仍可用；同步 priority audit、`server/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md` 口径。
- 验证：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_AttachmentWriteAPIRequiresOwnerModuleEnabled|TestBusinessAttachmentOwnerModuleKeys'` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs && node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`cd server && go test ./internal/service` 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `module-disabled-readonly-attachment-api-gate` 为 ready/pass，P5 仍为 guarded，`blockingCategory=external-release-evidence-required`；`cd server && go test ./internal/biz ./internal/service` 通过。
- 下一步：继续 P5 时，可从剩余普通后端业务 API、打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；若进入 release evidence、真实导入、部署或客户数据写入，必须先显式声明边界和证据路径。
- 阻塞/风险：该切片只证明 attachment 证据写 API 的本地门禁，不证明完整 P5 ready；本轮未执行部署、target smoke、backup restore、rollback rehearsal、sign-off、真实客户数据导入或 release evidence 写入，也未改变附件作为证据、不写 Source Document / Fact / Workflow / 库存 / 财务状态的边界。

## 2026-06-30 adminProfileSync 菜单投影文档口径四次纠偏

- 完成：按 review 发现只修正文档口径，不改业务逻辑、不提交、不推送、不碰 release evidence；同步 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 local dev、super admin 和 sync failure 诊断例外重新对齐到 `adminProfileSync` 当前 helper 行为。
- 完成：补清 helper 本身只判断传入 page key，不校验页面登记状态；菜单过滤的页面范围来自导航定义，隐藏 URL 判定来自 `ERPLayout.buildCurrentEntry` 解析或 fallback 后的 page key。local dev 普通账号若解析出未授权菜单权限路径仍会被 RBAC 层判定跳转，只有空 `currentMenuPath` 不会单独触发 RBAC 阻断。
- 下一步：后续若继续调整菜单投影，应先改 `adminProfileSync` / `ERPLayout` 测试或实现，再同步文档；本轮只做文档纠偏。
- 阻塞/风险：本轮未运行业务测试、浏览器回归、目标环境 smoke、release readiness 或 release evidence 检查；只按用户指定执行 diff whitespace 检查。

## 2026-06-30 adminProfileSync 菜单投影文档口径五次纠偏

- 完成：按 review 发现继续只修正文档口径，不改业务逻辑、不提交、不推送、不碰 release evidence；同步 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 `visibleSections[0].items[0].path` fallback、无可见菜单时阻止业务 `Outlet`、以及未知 URL fallback 仅服务 URL 判定和页头展示的边界写清。
- 完成：补清 local dev 诊断例外只放开第二层 pages 判定，普通账号菜单项过滤仍先通过 RBAC 菜单路径；正式 / 非前端 DEV 构建 super admin 正常 active revision 只额外放开系统诊断页，sync failure 诊断必须已有 `effective_session_sync_failed` 空投影。
- 下一步：后续若继续调整菜单投影，应先改 `adminProfileSync` / `ERPLayout` 测试或实现，再同步文档；本轮只做文档纠偏。
- 阻塞/风险：本轮未运行业务测试、浏览器回归、目标环境 smoke、release readiness 或 release evidence 检查；只按用户指定执行 diff whitespace 检查。

## 2026-06-30 P5 workflow 写 API moduleStates 门禁审计闭环

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；复核当前代码中 `workflow` JSON-RPC 写入口门禁，`create_task / update_task_status / complete_task_action / block_task_action / reject_task_action / urge_task / upsert_business_state` 要求 `workflow_tasks=enabled`，`read_only / disabled / 缺失` 会拒绝且不调用 Workflow usecase 写任务、事件或业务状态；`metadata / list_tasks / list_business_states / explain_action_access / explain_task_assignment` 历史 list/explain/metadata 查询继续保留。
- 完成：补齐 `multi-client-role-workflow-priority-audit` 的 P5 队列和测试断言，把 `module-disabled-readonly-workflow-api-gate` 纳入模块 disabled/read_only 覆盖清单；同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md` 口径，明确该切片不改变 Workflow / Fact 边界。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `module-disabled-readonly-workflow-api-gate` 为 ready/pass，P5 仍为 `target-evidence-required` 且 `releaseReady=false`；`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_WorkflowWriteAPIRequiresEnabledModule|TestJsonrpcDispatcher_Workflow'` 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过。
- 下一步：继续 P5 时，可从打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；若进入 release evidence、真实导入、部署或客户数据写入，必须先显式声明边界、风险和验证方式。
- 阻塞/风险：该切片只证明 workflow 写 API 的本地门禁，不证明完整 P5 ready；本轮未执行部署、target smoke、backup restore、rollback rehearsal、sign-off、真实客户数据导入或 release evidence 写入，也未让 Workflow task done 自动过账。

## 2026-06-30 adminProfileSync 菜单投影文档口径六次纠偏

- 完成：按 review 发现只修正文档口径，不改业务逻辑、不提交、不推送、不碰 release evidence；同步 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 helper 不登记页面、不校验原始 URL 是否为正式入口、页面范围由调用方传入的边界写清。
- 完成：补清 local dev 只指前端 DEV 构建态；正式客户 / 非前端 DEV 构建普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄；正式 super admin 正常 active revision 只额外保留系统诊断页，sync failure 诊断必须已有 `effective_session_sync_failed` 空投影。
- 下一步：后续若继续调整菜单投影，应先改 `adminProfileSync` / `ERPLayout` 测试或实现，再同步文档；本轮只做文档纠偏。
- 阻塞/风险：本轮未运行业务测试、浏览器回归、目标环境 smoke、release readiness 或 release evidence 检查；只按用户指定执行 diff whitespace 检查。

## 2026-06-30 P5 导入准备入口 no-real-import 审计闭环

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence、不执行真实导入；新增 `module-disabled-readonly-import-prep-no-execute-gate`，把 `customerImportExecute` 以外的当前导入准备入口收口为 no-real-import 本地证据切片。`customerSourceManifestCheck / customerSourceExtract / customerSourceSnapshotFreezeCheck / customerImportDryRun` 均无 `--execute`，不连接数据库，不写正式 V1 表，不写 `business_records`，不生成 SQL / migration，不执行真实导入。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md`，明确这些准备入口只产出 manifest check、source extract、freeze evidence 和 dry-run 预览 / 风险报告；`canExecuteRealImport=false / noRealImport=true / executesImport=false` 只证明本地准备链路不具备真实执行能力，不代表真实客户数据已批准、已导入或目标环境已验证。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`node --test scripts/import/customerSourceManifestCheck.test.mjs scripts/import/customerSourceExtract.test.mjs scripts/import/customerSourceSnapshotFreezeCheck.test.mjs scripts/import/customerImportDryRun.test.mjs` 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 摘要确认新 check 为 ready/pass，P5 仍为 `target-evidence-required` 且 `releaseReady=false`。
- 下一步：继续 P5 时，可从其它普通后端业务 API、打印或定时任务拆下一个 moduleStates 门禁切片；若进入 release evidence、真实导入、部署或客户数据写入，必须先显式声明边界、风险和验证方式。
- 阻塞/风险：该切片只证明当前导入准备 tooling 不具备真实执行能力，不证明真实导入批准 / 执行、目标环境验证、完整 P5 ready、其它后端业务 API、打印、定时任务或 release evidence。

## 2026-06-30 adminProfileSync 菜单投影文档口径七次纠偏

- 完成：按 review 发现只修正文档口径，不改业务逻辑、不提交、不推送、不碰 release evidence；同步 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 local dev super admin 的“可查看页面路径”表述收窄为调用方传入 helper 的 page key 判定。
- 完成：补清菜单项过滤只会放开导航定义传入 helper 的页面；隐藏 URL 仍按 `buildCurrentEntry` 解析或 fallback 后的 page key 判定，不证明原始 URL 已登记、已授权或可渲染业务内容。
- 下一步：后续若继续调整菜单投影，应先改 `adminProfileSync` / `ERPLayout` 测试或实现，再同步文档；本轮只做文档纠偏。
- 阻塞/风险：本轮未运行业务测试、浏览器回归、目标环境 smoke、release readiness 或 release evidence 检查；只按用户指定执行 diff whitespace 检查。

## 2026-06-30 P5 active business scheduler 缺口审计闭环

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence、不改业务 runtime；新增 `module-disabled-readonly-no-active-business-scheduler-gate`，把“定时任务”缺口收敛为当前服务端 runtime 未发现 active business scheduler / timer 写入口的本地静态证据。审计只扫描服务端非测试 Go runtime 文件，并排除 generated gateway、通用 `taskgroup` 生命周期工具、server bootstrap 和 `template_pdf` 的 PDF warmup / Chrome WebSocket 等待。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md`，明确这些后台任务不按客户配置启动流程、导入、打印或过账，也不执行业务模块写入；后续若新增业务 scheduler、cron、outbox worker 或自动 overdue 扫描，必须另拆阶段接入 active module states、RBAC、幂等、审计和测试。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 摘要确认新 check 为 ready/pass、`scanFindings=[]`，P5 仍为 `target-evidence-required` 且 `releaseReady=false`。
- 下一步：继续 P5 时，剩余本地缺口主要是打印和其它尚未覆盖的普通后端业务 API；目标环境 release evidence 仍需真实 release batch 输入和 target smoke / backup restore / rollback rehearsal 等证据，不能用本地审计替代。
- 阻塞/风险：该切片只证明当前没有 active business scheduler / timer 写入口，不证明未来 scheduler 门禁、打印 moduleStates 门禁、完整 P5 ready、真实导入、目标环境验证或 release evidence。

## 2026-06-30 adminProfileSync 菜单投影文档口径八次纠偏

- 完成：按 review 发现只修正文档口径，不改业务逻辑、不提交、不推送、不碰 release evidence；同步 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把隐藏 URL 的 `buildCurrentEntry` fallback 口径对齐到当前默认导航定义：未知 URL 通常按 `global-dashboard` page key 参与 pages 判定，只有调用方最终传入空 page key 时才不因 page key 阻断。
- 完成：补清 `getAdminProfileSyncErrorAction` 的 `hasCachedProfile` 只做同步失败动作分类；客户配置同步失败时是否复用投影仍由 `ERPLayout` 检查 `adminProfileRef.current.effective_session` 决定，普通 `me` profile 缓存不等于客户配置投影缓存。
- 下一步：后续若继续调整菜单投影，应先改 `adminProfileSync` / `ERPLayout` 测试或实现，再同步文档；本轮只做文档纠偏。
- 阻塞/风险：本轮未改业务代码、未运行业务测试、浏览器回归、目标环境 smoke、release readiness 或 release evidence 检查；只按用户指定执行 diff whitespace 检查。

## 2026-06-30 adminProfileSync 菜单投影文档口径九次纠偏

- 完成：按 review 发现只修正文档口径，不改业务逻辑、不提交、不推送、不碰 release evidence；同步 `docs/当前真源与交接顺序.md` 和 `web/README.md`，前置说明正式客户 / 非前端 DEV 构建普通账号仍必须同时命中 RBAC 菜单路径和 active revision pages，sync failure 无客户配置投影缓存时挂载空投影并阻止业务 Outlet，不退回 RBAC-only。
- 完成：补清 `resolveEffectiveSessionPageAccess` 当前先判断 local dev 再判断 super admin sync failure / system diagnostic；前端 DEV 构建态下的 sync failure reason 仍是 `local_dev_sync_failed_diagnostic`，正式构建 super admin 只有在挂载 `effective_session_sync_failed` 空投影时才进入 sync failure 诊断例外。
- 下一步：后续若继续调整菜单投影，应先改 `adminProfileSync` / `ERPLayout` 测试或实现，再同步文档；本轮只做文档纠偏。
- 阻塞/风险：本轮未改业务代码、未运行业务测试、浏览器回归、目标环境 smoke、release readiness 或 release evidence 检查；只按用户指定执行 diff whitespace 检查。

## 2026-06-30 P5 打印 PDF moduleStates 门禁切片

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence、不执行部署、不写真实客户数据；把 `/templates/render-pdf` 模板 PDF 生成入口接入 active module states 本地门禁。已登记 `template_key` 中，`material-purchase-contract` 要求 `purchase_orders=enabled`，`processing-contract` 要求 `outsourcing_orders=enabled`；`read_only / disabled / 缺失` 会拒绝生成 PDF。未知模板 key 不扩展成通用打印 registry，仍按旧兼容路径不做模块归属推断。
- 完成：补齐 `module-disabled-readonly-print-api-gate` 到 priority audit 和测试，并同步 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md`。P5 guarded 口径从“其它 API + 打印”收窄为“其它普通后端业务 API 全链路仍未证明”；打印切片只覆盖两个正式 PDF 模板生成入口。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`cd server && go test ./internal/server -run 'TestParseRenderTemplatePDFRequest|TestTemplatePDFReferencedModuleKeys|TestEnforceTemplatePDFModulesEnabled|TestAdminRequestVerifierAcceptsAdminClaimsAndBearerToken'` 通过；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 摘要确认 `module-disabled-readonly-print-api-gate` 为 ready/pass，P5 仍为 `target-evidence-required` 且 `releaseReady=false`。
- 下一步：继续 P5 时，剩余本地缺口主要是其它尚未覆盖的普通后端业务 API；目标环境 release evidence 仍需真实 release batch 输入和 target smoke / backup restore / rollback rehearsal 等证据，不能用本地审计替代。
- 阻塞/风险：该切片不证明打印留档回写、Excel 母版回写、其它普通后端业务 API、目标环境 smoke、真实导入、部署或 release evidence。

## 2026-06-30 adminProfileSync 菜单投影测试覆盖口径纠偏

- 完成：按 review 发现只修正文档口径，不改业务逻辑、不提交、不推送、不碰 release evidence；同步 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 `adminProfileSync.test.mjs` 的覆盖范围收窄为 helper 判定，不再写成已独立覆盖 `ERPLayout` 的 `buildCurrentEntry` fallback 和实际 `navigate` 行为。
- 完成：补清 `formal-frontend-customer-config-boundary.test.mjs` 当前只是静态锁住 `ERPLayout` 空入口提示和 sync-failed helper anchor；`buildCurrentEntry` fallback、可见 fallback 路径和业务 `Outlet` 渲染边界仍以当前 `ERPLayout` 代码和既有 L1 / 静态守卫为准。
- 下一步：后续若要把隐藏 URL fallback 作为更强回归，应另拆测试任务补 `ERPLayout` 级别测试或浏览器场景；本轮只做文档纠偏。
- 阻塞/风险：本轮未改业务代码、未运行业务测试、浏览器回归、目标环境 smoke、release readiness 或 release evidence 检查；只按用户指定执行 diff whitespace 检查。

## 2026-06-30 客户配置包 workflow preview 断言收口

- 完成：修正 `devCustomerConfig` 客户配置包 preview 测试，按当前 `customerPackage.mjs` 的 4 条 workflow / 18 个节点断言，并显式锁住新增 `finished_goods_delivery` 仍为 `workflow_only`；同步客户配置草案的 workflow 清单。
- 下一步：继续全量 closeout，跑完前端测试、L1 样式回归、Git diff 检查后提交并推送。
- 阻塞/风险：新增流程仍只属于 preview-only 配置包，不接 WorkflowUsecase、Fact usecase、真实导入、发布激活或目标环境 release evidence。

## 2026-06-30 priority audit JSON-RPC inventory anchor 补齐

- 完成：补齐 `docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/当前真源与交接顺序.md` 中普通 JSON-RPC 写入口 inventory 的审计 anchor，明确 debug/admin/system 控制面不计入普通业务 API，避免 priority audit 文档锚点缺失导致 P5 本地门禁误判失败。
- 下一步：重跑 `multi-client-role-workflow-priority-audit` 单测并 amend 到当前提交，再继续 push 的 `qa:full`。
- 阻塞/风险：该修正只同步本地审计口径，不新增目标环境模块关闭验证，也不证明 release evidence 已闭环。

## 2026-07-01 试用角色入口文档与 QA 口径同步

- 完成：按最新已提交推送代码重新盘点后，先修本地试用可信度缺口；同步 `web/README.md` 的单端口岗位任务端路径，补上 `/m/engineering/tasks`；同步 `scripts/README.md` 的角色演示账号表，补上 `demo_engineering / engineering`；新增 `scripts/qa/trial-role-entry-docs.test.mjs`，锁住当前 9 个业务岗位在 seed、RBAC 权限、试用账号核对脚本、脚本说明和前端 README 中一致，并把该测试接入 `scripts/qa/fast.sh` 与 `scripts/qa/strict.sh`。
- 验证：`node --test scripts/qa/trial-role-entry-docs.test.mjs` 通过；`git diff --check -- web/README.md scripts/README.md scripts/qa/fast.sh scripts/qa/strict.sh scripts/qa/trial-role-entry-docs.test.mjs` 通过；`bash -n scripts/qa/fast.sh scripts/qa/strict.sh` 通过；直接 `bash scripts/qa/fast.sh` 首次失败在 PATH 命中的 pnpm 11.7.0 与仓库要求 10.13.x 不一致，随后使用 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过，覆盖新增试用角色入口文档测试、web lint/css 和 server 快速测试。
- 下一步：继续本轮目标时，优先从销售订单受理最小业务闭环或客户配置包导入控制台的本地验收体验继续收口；若触达页面交互，应补浏览器级回归。
- 阻塞/风险：本轮不改 runtime、schema、migration、RBAC、客户配置包、真实客户数据、部署或 release evidence；只修正文档 / QA 入口口径。目标环境试用账号、真实客户导入、客户配置目标环境激活 / 回滚和 release evidence 仍未在本轮验证。

## 2026-07-01 销售订单受理字段链路边界

- 完成：补充 `docs/打印模板字段与编辑行为清单.md` 的“销售订单受理字段链路”矩阵，明确销售订单列表 / 导出共用 `sales_orders.default` 字段策略，当前不接销售订单打印模板，`sales_order_items.default` 明细字段策略未发布；新增 `scripts/qa/sales-order-field-chain-boundary.test.mjs` 并接入 `fast.sh` / `strict.sh`，防止后续把销售订单试用闭环误写成打印全链路已接通。
- 验证：`node --test scripts/qa/trial-role-entry-docs.test.mjs scripts/qa/sales-order-field-chain-boundary.test.mjs` 通过；`node --test web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/api/customerConfigApi.test.mjs scripts/qa/customer-config-runtime-manifest.test.mjs` 通过；`node --test web/src/erp/config/devCustomerConfig.test.mjs web/src/erp/config/devHub.test.mjs web/src/erp/config/devTesting.test.mjs web/src/erp/config/menuPermissions.test.mjs web/src/erp/config/seedData.test.mjs` 通过；`node --test web/src/erp/config/entryConfig.test.mjs web/src/erp/utils/mobileRolePermissions.test.mjs web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs web/src/erp/utils/mobileTaskView.test.mjs` 通过；`node --test web/src/erp/utils/orderApprovalFlow.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs scripts/qa/workflow-fact-boundary.test.mjs` 通过；`cd server && go test ./internal/biz -run 'TestWorkflowUsecase_BossApprovalDoneDerivesEngineeringTask|TestSalesOrderAcceptance'` 通过；`bash -n scripts/qa/fast.sh scripts/qa/strict.sh` 通过；`git diff --check -- docs/打印模板字段与编辑行为清单.md scripts/README.md scripts/qa/fast.sh scripts/qa/strict.sh scripts/qa/trial-role-entry-docs.test.mjs scripts/qa/sales-order-field-chain-boundary.test.mjs progress.md` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过，新增销售订单字段链路测试已在 fast 中执行。
- 下一步：继续收口销售订单受理真实后端 / 页面 / 移动任务端的本地试用回归；如果后续要做销售订单打印，先实现领域模型到打印草稿 mapper，再补采集、保存、回显、导出、打印和历史缺值测试。
- 阻塞/风险：本轮未新增打印模板、未改 schema / RBAC / usecase、未发布销售订单明细字段策略、未执行真实客户导入或目标环境验证。

## 2026-07-01 开发验收入口边界守卫

- 完成：新增 `scripts/qa/dev-entry-boundary.test.mjs`，复用前端 dev config 真源锁住 `/__dev` 入口只在开发态、测试入口只索引当前维护文档、不索引 `docs/reference/**` / `docs/archive/**` 命令、`/__dev/customer-config` 未登记客户不 fallback 到 yoyoosun，且客户配置控制台只允许 dry-run / 测试应用 / release gate 后的受控客户配置写入，不把真实业务导入写成已接通；同步接入 `fast.sh` / `strict.sh` 和 `scripts/README.md`。
- 验证：`node --test scripts/qa/dev-entry-boundary.test.mjs` 通过；`node --test web/src/erp/config/devCustomerConfig.test.mjs web/src/erp/config/devHub.test.mjs web/src/erp/config/devTesting.test.mjs web/src/erp/config/menuPermissions.test.mjs web/src/erp/config/seedData.test.mjs` 通过；`bash -n scripts/qa/fast.sh scripts/qa/strict.sh` 通过；`git diff --check -- scripts/qa/dev-entry-boundary.test.mjs scripts/README.md scripts/qa/fast.sh scripts/qa/strict.sh progress.md` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过，新增开发验收入口边界测试已在 fast 中执行。
- 下一步：继续补销售订单受理页面 / 移动任务端的浏览器级本地试用回归，或按同一方式收口客户配置控制台的页面 DOM / 文案回归。
- 阻塞/风险：该守卫是配置和文档级静态 / 单元证据，不启动浏览器、不执行真实 shell、不调用后端、不写数据库，也不替代后续 `style:l1` 或真实后端 smoke。

## 2026-07-01 正式前端错误提示边界

- 完成：修正采购合同打印工作台的 PDF 预览 / 下载错误提示，统一改用 `getActionErrorMessage`，避免直接展示底层 `error.message`；新增 `scripts/qa/frontend-error-message-boundary.test.mjs`，扫描正式前端页面、组件和岗位任务端，不把 dev-only 诊断页纳入正式用户可见错误提示边界，并接入 `fast.sh` / `strict.sh` 和 `scripts/README.md`。
- 下一步：若继续触达错误提示，应按同一口径补具体场景 fallback；后端审计和 runtime audit 仍需按具体业务动作逐条评估。
- 阻塞/风险：本轮只改正式前端用户提示边界，不改变后端错误码、RPC 协议、审计表或 PDF 生成逻辑；未做浏览器 PDF 预览 / 下载实测。

## 2026-07-01 工程岗位入口与移动任务动作阻断项

- 完成：补齐 `engineering` 在后端 `AdminMobileRolePermissionOptions` / legacy normalize 路径中的岗位任务端选项，并加测试锁住工程岗位选项；该修正属于 Product Core 既有 RBAC / mobile role registry 一致性，不是 yoyoosun 客户专属配置。
- 完成：移除移动任务详情底部动作栏的 `processing` 假按钮，避免点击“处理”后触发未接后端合同的 unsupported action；保留已接合同的阻塞、完成、催办和按任务类型开放的退回，并在 `workflow-ui-action-boundary` 加静态守卫。
- 验证：`cd server && go test ./internal/biz -run 'TestNormalizeAdminMobileRolePermissionsUsesCurrentRoleKeys|TestAdminMobileRolePermissionOptionsIncludeEngineering|TestMobileRoleAccessPermissionIncludesEngineering'` 通过；`node --test scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`node --test web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs web/src/erp/utils/mobileRolePermissions.test.mjs` 通过；`bash -n scripts/qa/fast.sh scripts/qa/strict.sh` 通过；`git diff --check -- server/internal/biz/admin_mobile_role_permission.go server/internal/biz/role_key_test.go web/src/erp/mobile/components/MobileTaskDetailScreen.jsx scripts/qa/workflow-ui-action-boundary.test.mjs scripts/qa/fast.sh scripts/qa/strict.sh web/README.md scripts/README.md progress.md` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过；`cd web && PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=mobile-tasks-dark STYLE_L1_PORT=5197 /usr/local/bin/pnpm style:l1` 通过，覆盖移动任务端列表、详情动作栏、跨岗位不可代办提示和深色可读性；`cd web && PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm smoke:mobile-auth-login-route` 通过，实际验证 9 个岗位任务端角色入口可登录路由。
- 下一步：继续围绕销售订单受理 / 移动任务端的本地试用回归，优先补浏览器级页面状态、无权限 / 模块关闭 / sync failure 和客户配置控制台的 DOM / 文案回归。
- 阻塞/风险：本轮未改 schema、migration、真实 usecase、客户配置包、真实客户导入、部署或 release evidence；浏览器回归覆盖 `mobile-tasks-dark` 受影响场景和 mock 登录路由 smoke，未跑全量 `style:l1`、真实账号密码登录 smoke 或目标环境移动端验收。

## 2026-07-01 试用账号浏览器回归口径同步

- 完成：用本地 seed/demo 边界重置 10 个角色演示账号密码，未生成 `demo_debug`；通过真实 `/rpc/auth` 核对 10 个 demo 账号的角色、`mobile.<role>.access`、`debug.*`、`is_super_admin=false`、`disabled=false`。该数据只属于本地开发 / 试用模拟 seed，不是 yoyoosun 真实客户导入。
- 完成：修正 `trialDemoAccountBrowserSmoke` 的桌面菜单期望，按 yoyoosun customer config 的 `hiddenItemKeys` 区分当前客户隐藏菜单、当前客户可见菜单和真正旧入口；同步 `processes` 当前菜单文案为“加工环节”，避免把客户菜单投影和当前模块命名误判成浏览器 smoke 失败。
- 验证：`ERP_ROLE_DEMO_PASSWORD='<local-demo-password>' bash scripts/seed-role-demo-admins.sh --reset-password` 通过；`TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' node scripts/qa/trial-account-rbac.mjs` 通过；`node --check web/scripts/trialDemoAccountBrowserSmoke.mjs` 通过；`cd web && TRIAL_ACCOUNT_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm smoke:trial-demo-browser` 通过，覆盖桌面账号 10 个、岗位任务端 9 个和移动端拒绝态 1 个；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；`git diff --check` 通过。
- 下一步：继续检查客户配置导入控制台、模块关闭 / sync failure 页面态和销售订单受理页面 / 任务端的字段与状态一致性。
- 阻塞/风险：本轮重置的是本地 dev/demo 账号密码，不是生产凭据；浏览器 smoke 使用 yoyoosun 菜单配置脚本和本地后端，不代表目标环境账号、真实客户数据导入、发布激活 / 回滚或 release evidence 已完成。

## 2026-07-01 客户配置控制台 L1 回归补验

- 完成：复用现有 `style:l1` 场景补验 `/__dev/customer-config` 控制台，覆盖桌面暗色、桌面亮色和移动端布局；该入口仍只属于本地开发 / 验收 / 配置诊断，不进入正式客户菜单，也不代表真实客户数据导入完成。
- 验证：`cd web && PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-customer-config-mobile STYLE_L1_PORT=5198 /usr/local/bin/pnpm style:l1` 通过；`cd web && PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop,dev-customer-config-light-desktop STYLE_L1_PORT=5199 /usr/local/bin/pnpm style:l1` 通过；`node --test web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/config/menuPermissions.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/customer-config-runtime-manifest.test.mjs` 通过；`node scripts/qa/customer-config-runtime-manifest.mjs --customer yoyoosun --mode validate` 通过，校验 manifest 为 15 个 module states、9 个 role profiles、346 个 entitlements。
- 下一步：继续检查模块关闭 / sync failure 页面态，以及销售订单受理页面 / 任务端的字段、状态和错误提示一致性。
- 阻塞/风险：本轮只跑本地 Playwright L1，不调用真实导入 API、不执行 publish / activate / rollback、不验证目标环境 release evidence。

## 2026-07-01 销售订单受理本地闭环回归

- 完成：补验销售订单正式页面和提交动作，确认销售订单页仍通过统一业务页壳、表单字段 / 明细行 / SKU 导入、生命周期动作收口；提交动作走 `sales_order_acceptance` 显式 start + domain command，不回退旧 `submit_sales_order`，并显示“销售订单已提交，已进入老板审批”。
- 完成：修正 `style:l1` 共享日期顺序守卫，改为从当前打开的日期面板读取同月可见日期，不再硬编码 2026-06 日期，避免测试随当前月份漂移；该修改只影响浏览器回归脚本，不改变运行时代码。
- 验证：`cd web && PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,sales-order-acceptance-submit-action-desktop STYLE_L1_PORT=5200 /usr/local/bin/pnpm style:l1` 通过；`cd server && go test ./internal/biz -run 'TestSalesOrderAcceptance|TestSalesOrderProcessDomainCommandSubmit|TestWorkflowUsecase_BossApprovalDoneDerivesEngineeringTask'` 通过；`cd server && go test ./internal/service -run 'TestCustomerConfigJSONRPCStartSalesOrderAcceptanceProcess|TestCustomerConfigJSONRPCExecuteSalesOrderAcceptanceSubmit|TestJsonrpcDispatcher_SalesOrderAPIRequiresEnabledModule'` 通过；`node --test web/src/erp/utils/orderApprovalFlow.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs scripts/qa/workflow-fact-boundary.test.mjs scripts/qa/sales-order-field-chain-boundary.test.mjs` 通过。
- 下一步：继续补移动任务端老板审批 / PMC 评审的真实任务端回归，或检查模块关闭 / sync failure 对销售订单入口的页面态。
- 阻塞/风险：本轮证明的是本地 mock/L1 与后端单元 / service 合同，不执行真实客户导入、真实销售订单目标环境提交、Fact 落账、出货 / 应收后续闭环或 release evidence。

## 2026-07-01 移动 workflow 模拟闭环与迁移漂移诊断

- 完成：定位 `mobile-workflow-simulated-closure --apply` 首次失败根因不是脚本合同，而是当前 dev DB Atlas migration 停在 `20260628123354`，缺少仓库已有的 `workflow_tasks.owner_pool_key / required_capability_key / config_revision / process_instance_id / process_node_instance_id` 等列，导致 `workflow.create_task` 在写当前 Ent 模型时返回 500。按项目迁移主路径对当前 dev DB 应用 5 个 pending migrations 至 `20260630020907`，未新增 migration、未手写 SQL 改结构。
- 完成：重跑本地模拟移动 workflow apply，生成 `output/customers/yoyoosun/mobile-workflow-simulated-closure-local/` 报告；4 条模拟任务完成 JSON-RPC create/update，其中审批、质检、仓库入库为 done，出货放行为 blocked 且带 `mobile_exception_report`。该写入只属于本地 dev/demo workflow simulated evidence，不是真实客户数据导入、客户验收签字或生产事实落账。
- 验证：`atlas migrate status --dir "file://internal/data/model/migrate" --url "$URL"` 通过，状态为 OK / pending=0；`psql` 只读检查确认 `workflow_tasks` 5 个当前字段已存在；`MOBILE_WORKFLOW_SIM_CONFIRM=APPLY_SIMULATED_MOBILE_WORKFLOW_TASKS MOBILE_WORKFLOW_SIM_PASSWORD='<local-demo-password>' node scripts/qa/mobile-workflow-simulated-closure.mjs --apply --backend-url http://127.0.0.1:8300 --run-id 20260701-MOBILE --out output/customers/yoyoosun/mobile-workflow-simulated-closure-local` 通过；只读查询确认 4 条 `SIM-YOYOOSUN-MOBILE-WORKFLOW-20260701-MOBILE-*` 任务带 `mobile_action`，出货异常带 `mobile_exception_report`；近 15 分钟 `inventory_txns / purchase_receipts / quality_inspections` 新增数均为 0；`node --test scripts/qa/mobile-workflow-simulated-closure.test.mjs` 通过。
- 下一步：继续按影响面做最终 diff/status、空白检查和受影响 QA 收口；若继续扩展移动端验收，应补真实浏览器岗位任务端对这些模拟任务的窄屏详情 / 动作区 / reason 输入回归。
- 阻塞/风险：本轮对 dev DB 执行的是仓库已有 migration，不代表生产 / 目标环境已迁移；未执行真实客户导入、目标环境写入、外部通知、Fact 落账、发布激活 / 回滚或 release evidence。

## 2026-07-01 岗位任务端真实浏览器模拟任务回归

- 完成：新增并扩展 `web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs` 和 `pnpm --dir web smoke:mobile-workflow-runtime-browser`，脚本用 JSON-RPC 创建唯一 `simulated_only` 老板审批任务和仓库放行任务，再启动真实浏览器登录 `demo_boss`，进入 `/m/boss/tasks` 验证自有任务可填写现场留痕、提交阻塞原因并回读 `blocked / mobile_action / mobile_exception_report`；同时验证 `owner_role_key=warehouse` 且 `assignee_id=demo_boss` 的跨角色任务在移动端只可查看并催办，阻塞 / 完成按钮保持不可代办，催办后回读 `last_urge_action=escalate_to_boss`、`last_urge_actor_role_key=boss` 和 evidence refs。
- 完成：同步 `scripts/README.md`、`web/README.md`、`web/package.json`、`fast.sh`、`strict.sh`，新增 `scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs`，静态锁住该 smoke 只能创建模拟 Workflow 任务、不能变成真实导入或 Fact 写入口；真实浏览器回归保存老板阻塞和跨角色催办截图到 `web/output/playwright/mobile-workflow-runtime-browser-smoke/`。
- 验证：`node --check web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs` 通过；`node --test scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs` 通过；`MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='<local-demo-password>' MOBILE_WORKFLOW_BROWSER_SMOKE_RUN_ID=20260701BROWSER8 PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web smoke:mobile-workflow-runtime-browser` 通过，输出 `blocked=SIM-YOYOOSUN-MOBILE-BROWSER-20260701BROWSER8-BOSS urged=SIM-YOYOOSUN-MOBILE-BROWSER-20260701BROWSER8-WAREHOUSE`；只读读回确认 BROWSER8 老板任务为 `blocked`，仓库任务仍为 `ready` 且带 `escalate_to_boss` 催办 payload；近 30 分钟 `inventory_txns / purchase_receipts / quality_inspections / finance_facts` 新增数均为 0；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh`、`git diff --check`、本地密码落盘扫描均通过。
- 下一步：继续移动端验收时，可扩展同类浏览器 smoke 覆盖质检 / 仓库 / 财务角色的 done、rejected 和业务任务详情边界；若需要保持本地待办池干净，应另评审一个专用测试账号或后端受控测试清理入口，而不是绕过 RBAC 改表。
- 阻塞/风险：该回归只写本地 dev/demo 模拟 workflow 任务，不代表真实客户数据导入、目标环境移动端验收、外部通知、生产部署、Fact 落账、发布激活 / 回滚或 release evidence；BROWSER6 / BROWSER7 调试留下的 warehouse ready 模拟任务因当前 RBAC 正确拒绝非 owner 普通阻塞收口，未使用 break-glass 或直接 SQL 清理。

## 2026-07-01 前端菜单投影 sync failure 边界守卫

- 完成：补齐 `web/src/erp/utils/adminProfileSync.test.mjs` 中 active revision 空 pages 不回退 RBAC-only、正式 super admin 在正常 active revision 下不放开任意隐藏业务页的断言；同步 `scripts/qa/fast.sh` / `strict.sh`，让前端菜单投影、sync failure 和 super admin 诊断边界进入主门禁。
- 验证：`node --test web/src/erp/utils/adminProfileSync.test.mjs` 通过；`bash -n scripts/qa/fast.sh scripts/qa/strict.sh` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过，新增 `adminProfileSync` 测试已在 fast 中执行。
- 下一步：若继续补模块关闭 / sync failure，可优先做真实浏览器页面态回归，覆盖正式普通账号无可见入口、local dev 诊断入口和 super admin 系统诊断入口。
- 阻塞/风险：本轮只补前端 helper 测试和 QA 入口，不改运行时代码、不调用后端、不写数据库，也不证明目标环境 customer config 已激活或 release evidence 已闭环。

## 2026-07-01 菜单投影 L1 口径校正与 sync failure 诊断修复

- 完成：修复 `adminProfileSync` 中 `import.meta?.env?.DEV` 未被 Vite 注入导致本地 DEV 诊断路径实际失效的问题，改为 `import.meta.env?.DEV`；同时纠正上一轮 `style:l1` 口径，DEV 浏览器回归不再伪装成正式客户 active revision 收窄证据。正式普通账号隐藏 URL 跳转、active revision 空页面清单不回退 RBAC-only 由 `adminProfileSync.test.mjs` 和正式前端客户配置边界测试证明；`style:l1` 只锁住 super admin 系统诊断、本地 DEV 直接 URL 诊断、sync failure 诊断、空 pages 诊断和无可见菜单空态。
- 完成：更新 `web/scripts/style-l1/scenarios.mjs`，新增 / 调整 `erp-effective-session-direct-url-local-dev-diagnostic`、`erp-effective-session-sync-failure-local-dev-diagnostic`、`erp-effective-session-empty-pages-local-dev-diagnostic` 和 `erp-no-visible-menu-blocks-outlet`；同步 `scripts/README.md`、`scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`docs/product/多甲方角色能力流程编排优先级.md` 与 `docs/当前真源与交接顺序.md` 的证据分层口径。
- 验证：`node --test scripts/qa/formal-frontend-customer-config-boundary.test.mjs web/src/erp/utils/adminProfileSync.test.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=erp-effective-session-super-admin-system-diagnostic,erp-effective-session-direct-url-local-dev-diagnostic,erp-effective-session-sync-failure-local-dev-diagnostic,erp-effective-session-empty-pages-local-dev-diagnostic,erp-no-visible-menu-blocks-outlet STYLE_L1_PORT=5221 pnpm --dir web style:l1` 通过；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`git diff --check` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过。
- 下一步：继续收口模块关闭 / sync failure 与销售订单受理 / 移动任务端的更多真实页面边界。
- 阻塞/风险：本轮不调用真实目标环境 `customer_config`，不证明目标环境客户配置已 publish / activate / rollback；正式客户收窄证明来自 helper / 静态边界和单测，浏览器级证明限定在本地 DEV 构建态页面渲染。

## 2026-07-01 诊断入口不扩大动作权限守卫

- 完成：补齐 `adminProfileSync.test.mjs` 与 `masterDataOrderView.test.mjs` 的动作投影守卫，明确 local dev / super admin / sync failure 诊断只影响前端页面可见性，不扩大 `effective_session.actions` 或 `hasActionPermission`；即使页面诊断入口可见，`sales_order.create`、`workflow.task.complete` 等未被 active session 投影的动作仍不可执行。
- 验证：`node --test web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/utils/masterDataOrderView.test.mjs scripts/qa/formal-frontend-customer-config-boundary.test.mjs` 通过。
- 下一步：继续收口模块关闭 / sync failure 与销售订单受理 / 移动任务端的更多真实页面边界，优先覆盖动作按钮禁用 / 隐藏的浏览器态。
- 阻塞/风险：本轮只补前端 helper / wrapper 测试，不改后端 RBAC、JSON-RPC、usecase、schema、migration 或目标环境配置；页面级按钮态仍需按具体业务页继续补 `style:l1` 或真实浏览器回归。

## 2026-07-01 销售订单页面动作按钮投影守卫

- 完成：在 `workflow-ui-action-boundary.test.mjs` 补销售订单页面级守卫，锁住销售订单新建主按钮必须由 `hasActionPermission(adminProfile, 'sales_order.create')` 投影后才显示，生命周期动作必须同时满足 action 投影和销售订单状态机，弹窗附件与订单行导入 / 复制 / 删除继续使用 `canCreateOrder`、`canUpdateOrder`、`canCreateItem`、`canUpdateItem`、`canCancelItem`，避免后续页面改动绕开 customer config / RBAC / effective session 收窄。
- 验证：`node --test scripts/qa/workflow-ui-action-boundary.test.mjs web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/utils/masterDataOrderView.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按影响面补模块关闭 / sync failure 的页面态，或把同类页面级动作投影守卫扩展到采购、出货、质检等业务页。
- 阻塞/风险：本组是静态页面接线守卫，不启动浏览器、不点击真实销售订单页面、不调用后端、不写数据库；浏览器级按钮可见 / 禁用态仍需 `style:l1` 或 Playwright 场景继续覆盖。

## 2026-07-01 正式业务动作 super_admin 旁路收口

- 完成：修正出货、采购入库、质检和运营事实表单中的局部 `is_super_admin || hasActionPermission(...)` 写法，统一回到 `hasActionPermission` / `hasActionPermission` 聚合判断，避免 super admin 在 active effective session 或 sync failure 场景下绕过 action 投影；`workflow-ui-action-boundary.test.mjs` 新增正式业务动作扫描，排除布局、审计展示和权限中心后，禁止业务动作层继续写 `is_super_admin || hasActionPermission` 旁路。
- 验证：`node --test scripts/qa/workflow-ui-action-boundary.test.mjs web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/utils/masterDataOrderView.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补模块关闭 / sync failure 页面态，或按同一 action 投影规则检查采购、出货、质检页面的浏览器级按钮禁用 / 隐藏状态。
- 阻塞/风险：本组只修前端动作按钮权限投影，不改变后端 RBAC、JSON-RPC、usecase、状态机、schema、migration、审计或目标环境 customer config；后端仍是最终安全边界。

## 2026-07-01 业务页动作投影 L1 负向回归

- 完成：新增 `erp-effective-session-action-projection-business-pages` L1 场景，构造 super admin、出货 / 质检 / 采购入库页面在 active pages 清单内、但 `effective_session.actions=[]` 的浏览器态，验证页面仍可见但出货新建 / 维护明细 / 确认出货、质检生成草稿 / 提交 / 判定 / 取消、采购入库添加明细 / 过账入库均保持禁用；同步 `scripts/README.md`、`multi-client-role-workflow-priority-audit`、`docs/当前真源与交接顺序.md` 和 `docs/product/多甲方角色能力流程编排优先级.md` 的证据口径。
- 验证：`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=erp-effective-session-action-projection-business-pages STYLE_L1_PORT=5226 pnpm --dir web style:l1` 通过；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/utils/masterDataOrderView.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续补模块关闭 / sync failure 页面态，或把同类负向浏览器回归扩展到更多业务页和移动端任务动作。
- 阻塞/风险：该场景运行在本地 DEV + Playwright mock，不调用真实后端、不写数据库、不证明目标环境 customer config 已激活；前端按钮禁用仍不替代后端 RBAC、JSON-RPC 和 usecase 授权。

## 2026-07-01 模块 disabled 正式前端投影守卫

- 完成：在 `adminProfileSync.test.mjs` 补“模块 disabled 后端投影隐藏业务页时正式账号需要跳转”断言，模拟 `modules.shipments=disabled`、active pages 只剩 `global-dashboard`、RBAC 菜单仍含出货页，证明正式构建态普通账号导航只保留工作台，直达 `/erp/warehouse/shipments` 需要跳转；同步 `multi-client-role-workflow-priority-audit`、`scripts/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`，明确该正式收窄由 helper 单测证明，`style:l1` 因运行在前端 DEV 构建态只证明本地诊断和按钮禁用页面态。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/utils/masterDataOrderView.test.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=erp-effective-session-action-projection-business-pages STYLE_L1_PORT=5228 pnpm --dir web style:l1` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过。
- 下一步：继续按同一分层收口其它模块状态页面态；若要做正式构建浏览器级模块关闭回归，需要新增 production-build/preview 类验收脚本，不能复用 DEV `style:l1` 伪装正式客户证据。
- 阻塞/风险：本轮不调用真实后端、不 publish / activate customer config、不写数据库、不验证目标环境 release evidence；前端跳转 helper 不替代后端 RBAC、JSON-RPC、usecase 或模块状态写 API 门禁。

## 2026-07-01 客户包 moduleStates 编译守卫

- 完成：`customer-package-lint` 新增可选 `moduleStates` 校验，只允许 catalog 内模块声明 `enabled / read_only / disabled`，非 `enabled` 必须填写 reason，重复或未知模块会拒绝；`customer-config-runtime-manifest` 编译器开始消费该声明并输出后端 `module_states`，默认没有声明时仍保持 catalog 全部 `enabled`，不改变现有 demo / yoyoosun manifest 默认结果；`multi-client-role-workflow-priority-audit` 同步加入 moduleStates lint / manifest 编译锚点。
- 完成：同步 `config/customers/yoyoosun/README.md`、`config/customers/demo/README.md`、`scripts/README.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`，明确 `moduleStates` 只是受控 manifest 输入，不提供运行时模块安装 / 卸载，也不证明完整模块关闭已 ready。
- 验证：`node --test scripts/qa/customer-package-lint.test.mjs scripts/qa/customer-config-runtime-manifest.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs web/src/erp/utils/adminProfileSync.test.mjs` 通过；`node scripts/qa/customer-config-runtime-manifest.mjs --customer demo --mode compile` 和 `--customer yoyoosun --mode compile` 均通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 通过；补 audit 锚点后重跑 `node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs scripts/qa/customer-package-lint.test.mjs scripts/qa/customer-config-runtime-manifest.test.mjs` 与 `git diff --check` 均通过。
- 下一步：如要在真实客户包里把某模块置为 `read_only / disabled`，应先评审该模块的页面投影、后端写 API 门禁、历史读取和导入 / 打印边界，再把具体 moduleStates 写入客户包并走 manifest / publish / activate 门禁。
- 阻塞/风险：本轮只改本地编译器、lint 和文档，不发布客户配置、不激活 revision、不写数据库、不触发真实导入或目标环境 smoke；完整模块关闭仍不能由该编译入口单独证明。

## 2026-07-01 客户配置控制台 moduleStates 预览

- 完成：`/__dev/customer-config` 的 dev-only 控制台补齐 moduleStates 模块状态预览，默认显示 catalog 模块将编译为 enabled；若客户包声明 `read_only / disabled`，控制台会显示 override、状态和 reason，并在测试应用 / 发布结果中回显 manifest `moduleStateCount`。该显示只服务预检和人工评审，不安装 / 卸载模块，也不证明完整模块关闭已 ready。
- 完成：`devCustomerConfig` summary、页面、`dev-entry-boundary` 和 `multi-client-role-workflow-priority-audit` 均加入 moduleStates 锚点；同步 `web/README.md`、`docs/当前真源与交接顺序.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`。
- 验证：`node --test web/src/erp/config/devCustomerConfig.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop STYLE_L1_PORT=5230 pnpm --dir web style:l1` 通过，覆盖 moduleStates 区块、15 个默认 enabled catalog 模块、导入工作台和暗色页面态。
- 下一步：如后续在真实客户包配置具体模块为 `read_only / disabled`，应继续补对应页面投影、后端写 API、导入执行、打印入口和历史只读回归。
- 阻塞/风险：本轮只改 dev-only 控制台和静态 / 单元测试，不调用后端、不 publish / activate customer config、不写数据库、不执行真实客户导入或目标环境 smoke。

## 2026-07-01 客户配置控制台打印模板字段预检

- 完成：`/__dev/customer-config` 的 dev-only 控制台补齐打印模板字段只读预检，从 `printTemplates` catalog 汇总当前正式采购合同和加工合同的 `fieldTruth`、source file 和 readiness；控制台、summary、dev hub 入口、`dev-entry-boundary` 与 `multi-client-role-workflow-priority-audit` 均加入打印模板字段锚点。
- 完成：同步 `web/README.md`、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `docs/product/自动化测试策略.md`，明确销售订单受理当前未接打印模板，客户抬头、签章和固定文案仍属于客户配置或模板边界，不进入 Product Core 表单，并记录触达 `__dev/customer-config` 打印字段时的最小验证组合。
- 验证：`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/devCustomerConfig.test.mjs scripts/qa/dev-entry-boundary.test.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs web/src/erp/config/printTemplates.test.mjs web/src/erp/config/devHub.test.mjs` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop STYLE_L1_PORT=5231 pnpm --dir web style:l1` 通过，覆盖 Assets 页打印模板字段面板、销售订单未接边界、Product Core 表单边界、暗色页面态和面板宽度。
- 下一步：若要继续销售订单打印，应先补 sales order print mapper / view model / 字段采集与回显测试，再评审是否进入正式模板；不能直接把客户抬头或固定文案硬编码进 Product Core 表单。
- 阻塞/风险：本轮只改 dev-only 控制台、前端 summary、文档和本地测试，不调用后端、不 publish / activate customer config、不写数据库、不执行真实客户导入、打印留档回写、销售订单打印或目标环境 smoke。

## 2026-07-01 正式前端错误提示守卫

- 完成：确认 `frontend-error-message-boundary.test.mjs` 已锁住正式页面、业务组件和岗位任务端不得直接透传底层 `error.message`，采购合同打印工作台已走 `getActionErrorMessage`；`fast.sh`、`strict.sh` 和 `scripts/README.md` 已条件接入该守卫。
- 完成：同步 `docs/product/自动化测试策略.md` 的 T5 口径，把正式前端错误提示纳入前端 UI / 样式验证层级：用户可见错误必须走中文场景化 helper，不直接透传 raw exception。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/frontend-error-message-boundary.test.mjs` 通过。
- 下一步：若后续改错误码、错误翻译或后端审计，应继续补 `errorMessage` helper 单测、错误码同步测试和对应 API / audit 证据。
- 阻塞/风险：本组只收口前端用户可见错误提示守卫和测试策略文档，不改变后端错误码、结构化日志、runtime audit、request_id / trace_id 或目标环境诊断链路。

## 2026-07-01 试用角色入口文档守卫补齐

- 完成：修正 `server/docs/config.md` 的角色演示账号说明，补上当前已接入的 `demo_engineering`；扩展 `trial-role-entry-docs.test.mjs`，让试用角色文档守卫同时扫描 server 配置文档、scripts README、web README、真实 seed、RBAC permission registry 和 trial account audit。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/trial-role-entry-docs.test.mjs` 通过，覆盖当前 9 个业务岗位、10 个 demo 账号、`mobile.<role>.access` 权限和 `/m/<role>/tasks` 单端口任务端路径。
- 下一步：若后续新增 / 改名角色、岗位任务端路径、演示账号或移动端权限码，应先更新 seed / RBAC / README，再由该守卫锁住一致性。
- 阻塞/风险：本组只修文档和静态守卫，不创建账号、不重置密码、不登录真实后端、不执行浏览器 smoke，也不证明目标环境试用账号已生成或客户验收完成。

## 2026-07-01 销售订单字段链路守卫确认

- 完成：确认 `sales-order-field-chain-boundary.test.mjs` 已锁住销售订单字段策略、列表可见列、CSV 导出和打印未接边界：列表 / 导出同受 `sales_orders.default` 控制，`sales_order_items.default` 在明细和打印链路完成前不发布为 active field policy，销售订单受理当前仍不是正式打印模板。
- 完成：同步 `docs/product/自动化测试策略.md` 的 T5 口径，把销售订单字段策略、导出列和打印字段链路纳入前端验证命令和边界说明。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/sales-order-field-chain-boundary.test.mjs` 通过；补跑 `PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过，确认试用角色入口、销售订单字段链路、dev 入口、错误提示、客户配置 manifest 和 web/server 快速检查均在主门禁内执行。
- 下一步：若后续实现销售订单确认单或出货前确认单，应先补 mapper / view model、表单采集、保存回显、列表 / 详情 / 导出 / 打印和历史缺值回补测试，再发布明细字段策略。
- 阻塞/风险：本组只确认并记录静态边界守卫，不新增销售订单打印模板、不写打印留档、不改变后端 customer_config validator、不执行真实客户导入或目标环境 smoke。

## 2026-07-01 移动端任务提醒与催办反馈守卫

- 完成：补强 `mobile-workflow-runtime-browser-smoke.test.mjs`，锁住真实浏览器模拟任务必须保留 `notification_type` 内部提醒线索、阻塞 / 催办页面反馈文案和跨角色“当前岗位可查看并催办”边界；同步 `scripts/README.md`，明确该 smoke 覆盖阻塞反馈、催办反馈和 evidence refs。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs` 通过。
- 下一步：如继续扩展移动端验收，应补真实浏览器脚本覆盖质检 / 仓库 / 财务角色的 done、rejected、blocked 和消息分区通知切换。
- 阻塞/风险：本组只加强静态边界和 README 说明，不登录真实后端、不创建新模拟任务、不执行浏览器 smoke；不能证明目标环境移动端、真实客户任务或外部通知平台已验收。

## 2026-07-01 源单生命周期事实边界提示

- 完成：调整销售订单、采购订单和加工合同关闭 / 取消确认文案，明确 Source Document / 源单生命周期动作只停止后续推进或终止源单，不自动写入、取消或冲正已生成 / 已登记的出货、入库、质检、发料、回货、库存、财务或 Workflow 事实。补充 `workflow-ui-action-boundary.test.mjs` 静态守卫，锁住三个源单页面关闭 / 取消确认必须暴露事实边界，避免页面动作误导用户以为源单生命周期等于下游事实写入或回滚。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过。
- 下一步：继续检查正式业务页生命周期动作是否存在类似“作废 / 冲正 / 归档”口径模糊，必要时优先补文案和静态守卫，不改后端事实语义。
- 阻塞/风险：本组不改 schema / RBAC / usecase / JSON-RPC / 菜单，不新增事实写入或冲正能力，也不验证真实页面点击；只收口用户可见确认文案和静态边界测试。

## 2026-07-01 采购与委外动作投影守卫

- 完成：扩展 `workflow-ui-action-boundary.test.mjs`，在销售订单动作投影守卫之外，新增采购订单和加工合同页面守卫，锁住创建、编辑、生命周期动作、采购入库草稿生成、附件上传 / 删除和协同任务动作都必须经过 `hasActionPermission` / Workflow action 投影与状态机判断，避免 super_admin、普通 admin 或 active customer config 场景下绕开动作收窄。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过，新增采购 / 委外守卫已在 fast 中执行。
- 下一步：继续把同类动作投影守卫扩展到出货、采购入库、质检等 Fact 页面，或补对应浏览器级按钮禁用 / 隐藏回归。
- 阻塞/风险：本组只补静态接线守卫，不改页面行为、后端 RBAC、JSON-RPC、usecase、schema 或 migration；不调用真实后端、不写数据库、不证明目标环境 customer config 已激活。

## 2026-07-01 事实页动作投影守卫

- 完成：继续扩展 `workflow-ui-action-boundary.test.mjs`，锁住出货、采购入库和来料质检页面的创建、维护明细、过账 / 确认、取消 / 冲正、质检提交 / 判定以及附件动作必须同时受 action 投影和状态 guard 控制，并保留前端不本地写库存 / 批次事实的边界文案。
- 验证：`PATH=/usr/local/bin:$PATH node --test scripts/qa/workflow-ui-action-boundary.test.mjs` 通过；`PATH=/usr/local/bin:$PATH bash scripts/qa/fast.sh` 完整通过。
- 下一步：如继续页面动作验收，优先补浏览器级 disabled / hidden 状态回归，而不是继续只加静态字符串守卫。
- 阻塞/风险：本组不改 UI 行为、后端 usecase、RBAC、JSON-RPC、schema 或 migration；不写数据库、不证明目标环境激活。

## 2026-07-01 动作投影浏览器回归扩展

- 完成：扩展 `erp-effective-session-action-projection-business-pages` L1 场景，在既有出货 / 质检 / 入库按钮禁用回归之外，加入销售订单、采购订单和加工合同页面，验证 active customer config 页面可见但 `actions=[]` 时，源单创建 / 编辑 / 生命周期 / 生成入库动作保持隐藏或禁用。
- 验证：`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=erp-effective-session-action-projection-business-pages STYLE_L1_PORT=5232 pnpm --dir web style:l1` 通过。
- 下一步：若继续改动作投影，先归档或压缩 `progress.md` 后再追加记录；后续可补移动端任务动作的同类浏览器回归。
- 阻塞/风险：本组运行在本地 DEV + Playwright mock，不调用真实后端、不写数据库、不证明目标环境 customer config 已激活。
