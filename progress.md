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
