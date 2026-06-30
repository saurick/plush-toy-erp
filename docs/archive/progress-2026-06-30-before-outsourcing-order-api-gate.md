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

## 当前活跃事项

- 多甲方角色能力流程编排以 `docs/product/多甲方角色能力流程编排优先级.md` 和 `node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 的 `implementationOrder` 为本地优先级入口；GPT/reference 资料只作输入，当前真源仍回到代码、migration、测试和正式文档。
- 当前审计显示 P0-P4 本地证据为 ready；P5 测试部署 / 导入 / 第二客户验证仍为 `target-evidence-required`，第一条 blocked release action 是 `immutable-version`。
- P5 当前只允许 report-only、input template 和 checklist 准备；没有真实目标环境、镜像 digest、migration 前后版本和 backup id 时，不写 `deployments/**/evidence/**`，不执行 `--execute`，不把本地 ready 写成目标 release evidence。
- 真实客户数据导入、正式生产发布、目标环境 smoke、目标 migration、备份恢复、回滚 / 前向修复演练、客户配置激活和签收仍未执行，不能被本地 dry-run、manifest 编译、status、gate、audit 或 runner report 替代。

## 2026-06-30 P5 purchase order 采购订单 API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；`purchase_order` 普通 JSON-RPC 写入口接入 active module states 本地门禁。`create_purchase_order / update_purchase_order / save_purchase_order_with_items / add_purchase_order_item / update_purchase_order_item / remove_purchase_order_item / submit_purchase_order / approve_purchase_order / close_purchase_order / cancel_purchase_order` 现在要求 `purchase_orders=enabled`，`read_only / disabled / 缺失` 会拒绝且不调用 `PurchaseOrderUsecase` 写入或推进采购订单源单；`get/list` 历史读取继续保留。
- 完成：补齐 `TestJsonrpcDispatcher_PurchaseOrderAPIRequiresEnabledModule`，锁住 `purchase_orders=read_only` 时不能创建 / 保存采购订单、`purchase_orders=disabled` 时不能新增订单行或取消订单，并保留 `list_purchase_orders / list_purchase_order_items` 历史读取；同步 priority audit check / reference coverage / P5 phase checkIds 和 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 口径。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_PurchaseOrderAPIRequiresEnabledModule|TestJsonrpcDispatcher_PurchaseOrderAPISavesListsAndTransitions|TestJsonrpcDispatcher_PurchaseOrderAPIRequiresDomainPermissions'` 通过；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `module-disabled-readonly-purchase-order-api-gate` 纳入 P5 且为 ready/pass，P5 仍为 `target-evidence-required`；`cd server && go test ./internal/biz ./internal/service` 通过；`node scripts/qa/workflow-fact-boundary.test.mjs && node scripts/qa/workflow-ui-action-boundary.test.mjs && node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 exit 1，`blockingCategory=external-release-evidence-required`。
- 下一步：继续 P5 时，优先从剩余普通后端业务 API（例如 `outsourcing_order` 源单据）、打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；若进入 release evidence，必须先收集真实 release batch 输入并显式声明跨越边界。
- 阻塞/风险：本轮不改 schema / migration、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入；该切片只证明 purchase order 采购订单写 API 的本地门禁，不证明完整 P5 ready。

## 2026-06-30 P5 shipment 出货 API moduleStates 门禁

- 完成：`operational_fact` 的 shipment 普通 JSON-RPC 写入口接入 active module states 本地门禁；`create_shipment / create_shipment_with_items / add_shipment_item` 要求 `shipments=enabled`，`ship_shipment / cancel_shipment` 要求 `shipments=enabled` 且 `inventory=enabled`，`list_shipments` 继续保留历史读取。补充 `TestJsonrpcDispatcher_ShipmentAPIRequiresEnabledModules`，锁住 read_only 不调用 usecase、enabled 正常进入写路径、inventory read_only 阻断出货 / 取消出货。同步 priority audit、`docs/当前真源与交接顺序.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 `server/README.md`，P5 整体仍保持 guarded。
- 验证：`go test ./internal/service -run 'TestJsonrpcDispatcher_ShipmentAPIRequiresEnabledModules|TestJsonrpcDispatcher_ShipmentAPIRequiresDedicatedShipmentPermissions|TestOperationalFactShipmentFilterFromParamsParsesDateRange|TestJsonrpcDispatcher_OperationalFactListsRejectInvalid'`；`go test ./internal/biz ./internal/service`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/workflow-fact-boundary.test.mjs`；`node scripts/qa/workflow-ui-action-boundary.test.mjs`；`node --test scripts/qa/docs-inventory.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`。
- 下一步：继续按单域推进 P5 普通后端业务 API moduleStates 门禁，优先评审 finance / stock reservation / production / outsourcing 哪一块能形成最小可验证切片；仍不碰 release evidence，除非显式进入 release evidence 阶段。
- 阻塞 / 风险：该切片只证明 shipment 出货普通 JSON-RPC 写 API 本地门禁；尚未证明 finance、stock reservation、生产 / 委外事实 API、打印、定时任务、其它导入入口或目标环境 release evidence 全链路阻断。

## 2026-06-30 菜单投影诊断例外 helper reason 文档纠偏

- 完成：按 review 发现只修正文档口径，核对 `adminProfileSync` / `ERPLayout` 当前代码后，将 `docs/当前真源与交接顺序.md` 和 `web/README.md` 中“三类诊断例外”收窄为三组前端诊断例外、四个 helper reason：`local_dev_customer_config_diagnostic`、`local_dev_sync_failed_diagnostic`、`super_admin_system_diagnostic`、`super_admin_sync_failed_diagnostic`。
- 完成：补明 `resolveEffectiveSessionPageAccess` 当前先判断 local dev、再判断 super admin sync failure，因此前端 DEV 构建态 sync failure 仍落在 local dev sync failure 诊断 reason；正式客户 / 非前端 DEV 构建普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄。
- 完成：同步加固两份文档中的 helper 判断顺序说明，避免把本地 DEV sync failure 诊断 reason 误读成正式构建 super admin sync failure 例外。
- 验证：`git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：若后续 `adminProfileSync` 调整 helper reason、判断顺序、fallback 跳转或缓存复用合同，再同步更新这两处文档和对应测试说明。
- 阻塞/风险：本轮只改指定文档和 `progress.md`，不改业务逻辑、不提交、不推送、不触碰 release evidence。

## 2026-06-30 progress 归档到 P5 checklist follow-up 前

- 完成：归档前 `progress.md` 为 496 行 / 81366 bytes，接近 80KB 阈值；已将完整原文复制到 `docs/archive/progress-2026-06-30-before-p5-input-checklist-followup.md`。
- 完成：根 `progress.md` 已收敛为归档索引、当前活跃事项和最近 P5 input checklist 记录，方便后续继续按阶段追加。
- 下一步：继续 P5 时仍只在 read-only / report-only 合同范围内推进；真实 closeout 必须等目标 release batch 输入齐备后再执行。
- 阻塞/风险：本次归档只整理过程记录，不改变 runtime、schema、RBAC、发布脚本、目标环境状态、release evidence 或正式业务真源。

## 2026-06-30 P5 input checklist Markdown 敏感输入展示合同

- 完成：继续推进 P5 release closeout 输入清单合同，只补 `multi-client-role-workflow-priority-audit.test.mjs`，让 Markdown 输出测试显式锁住 `prod-env-file` 为 secret file、`SOURCE_POSTGRES_DSN` 为 secret env、`CUSTOMER_CONFIG_ADMIN_TOKEN` 为 secret env。
- 完成：补 Markdown 无泄漏断言，确认输出不包含 `SOURCE_POSTGRES_DSN=`、`CUSTOMER_CONFIG_ADMIN_TOKEN=`、Postgres DSN 或带 username / password 的 URL；report-only 命令仍不带 `--execute`、确认短语或 release evidence 目录 report 路径。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1。
- 下一步：P5 真实 closeout 仍从 `immutable-version` 开始，需要真实 target environment、operator role、server / web image ref 与 sha256 digest、migration before / after 和 backup id；其余 preflight、backup restore、target smoke、rollback / forward-fix、sign-off 与 customer config effective session 仍按 input checklist 收集。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 input checklist Markdown collection plan 顺序合同

- 完成：继续收紧 `multi-client-role-workflow-priority-audit.test.mjs` 的 Markdown 输出合同，解析 Collection Plan 表格并锁住 7 个 release closeout action 顺序：immutable-version、production-preflight、backup-restore-rehearsal、target-smoke、rollback-forward-fix、release-signoff、customer-config-effective-session。
- 完成：补每组 collection plan 的 Secret Inputs 列断言，确认 production preflight 标出 `prod-env-file`、backup restore 标出 `SOURCE_POSTGRES_DSN`、target smoke 和 customer config effective session 标出 `CUSTOMER_CONFIG_ADMIN_TOKEN`，release signoff 保持 `none`。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1。
- 下一步：继续只在本地 read-only / report-only 合同范围内补 P5 证据门禁；真实 closeout 仍必须等目标 release batch 输入齐备后再执行。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 input checklist Markdown 自定义路径只读合同

- 完成：继续收紧 `multi-client-role-workflow-priority-audit.test.mjs` 的 Markdown checklist 输出，补 `--release-evidence-dir` 与 `--runtime-env-file` 自定义路径场景。
- 完成：确认 Markdown 摘要和 collection plan 使用自定义 evidence / runtime env 路径，但生成的 report 仍落在 `output/release-evidence-closeout/<date>/`，不回写 release evidence 目录，也不出现 `--execute` 或 `RELEASE_CLOSEOUT_CONFIRM`。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1；`git diff --check -- scripts/qa/multi-client-role-workflow-priority-audit.test.mjs progress.md`。
- 下一步：继续只在本地 read-only / report-only 合同范围内补 P5 证据门禁；真实 closeout 仍必须等目标 release batch 输入齐备后再执行。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 input checklist JSON 自定义路径只读合同

- 完成：继续收紧 `multi-client-role-workflow-priority-audit.test.mjs`，补 `--input-checklist-json` 搭配自定义 `--release-evidence-dir` / `--runtime-env-file` 的只读输出合同。
- 完成：确认 JSON 输出使用自定义 evidence / runtime env 路径，基础 closeout collection plan 的 report 仍落在 `output/release-evidence-closeout/<date>/`，不回写自定义 release evidence 目录；report-only command 不带 `--execute`、确认短语或真实 secret。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 写入临时文件并可解析；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1；`git diff --check -- scripts/qa/multi-client-role-workflow-priority-audit.test.mjs progress.md`。
- 下一步：继续只在本地 read-only / report-only 合同范围内补 P5 证据门禁；真实 closeout 仍必须等目标 release batch 输入齐备后再执行。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 input checklist collection plan 去执行入口合同

- 完成：收窄 `multi-client-role-workflow-priority-audit` 的 `closeoutInputChecklist.collectionPlan`，该输入清单现在只保留每组证据的缺失输入、secret 标记、operator checklist、report path 和 report-only 命令，不再输出 `executeCommand`。
- 完成：同步 `docs/product/多甲方角色能力流程编排优先级.md`，明确 execute 模板只保留在 full audit 的 action / firstBlocked 输入合同中；`--input-checklist-json` 继续只用于输入收集和外部表单，不提供一键执行入口。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-json` 写入临时文件并确认 `collectionPlan.hasExecute=false`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 full audit 仍为 `releaseReady=false / firstBlocked=immutable-version` 且 `firstBlockedInputChecklist` 保留 execute 确认边界；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1；`git diff --check -- scripts/qa/multi-client-role-workflow-priority-audit.mjs scripts/qa/multi-client-role-workflow-priority-audit.test.mjs docs/product/多甲方角色能力流程编排优先级.md progress.md docs/archive/progress-2026-06-30-before-p5-input-checklist-followup.md`。
- 下一步：继续只在本地 read-only / report-only 合同范围内补 P5 证据门禁；真实 closeout 仍必须等目标 release batch 输入齐备后再执行。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 菜单投影文档口径纠偏

- 完成：按 review 发现只修正文档口径，核对 `adminProfileSync` 与 `ERPLayout` 当前代码后，补准 `docs/当前真源与交接顺序.md` 和 `web/README.md` 中未命中菜单定义 URL 的跳转说明，明确 `buildCurrentEntry` 默认工作台 key 只是 helper pages 判定锚点，不是菜单入口、授权入口或业务页面准入。
- 完成：保留正式客户普通账号强收窄、本地开发 / super admin / sync failure 只作为前端诊断例外的口径；未改业务逻辑、测试、部署脚本或 release evidence。
- 验证：`git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：如果后续 `adminProfileSync` 或 `ERPLayout` 行为变化，再同步更新这两处文档口径和对应测试说明。
- 阻塞/风险：本轮只更新指定文档和 `progress.md`，不提交、不推送、不触碰 `deployments/**/evidence/**`。

## 2026-06-30 P5 input checklist missingInputs 收集字段合同

- 完成：继续推进多甲方角色能力流程编排 P5，只改 `multi-client-role-workflow-priority-audit` 的 input checklist 输出合同；`missingInputs` 现在直接带出 `source/sourceHint/evidenceTarget/validation/status`，可作为外部 release batch 收集表字段来源，不需要再和 `operatorChecklist` 二次拼接。
- 完成：同步测试和 `docs/product/多甲方角色能力流程编排优先级.md`，锁住缺失输入仍为 read-only / report-only，不写 release evidence、不包含真实 secret、不提供 collection plan execute 入口。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-json` 写入临时文件并确认样例缺失输入含收集字段；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1。
- 下一步：P5 仍从 `immutable-version` 真实 release batch 输入开始；需要真实 environment、operator、server / web image ref 与 sha256 digest、migration before / after 和 backup id 后，才可进入受控 closeout 执行路径。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 菜单投影隐藏 URL 文档口径再收窄

- 完成：按 review 发现继续只修正文档口径，把 `docs/当前真源与交接顺序.md` 和 `web/README.md` 中“隐藏 URL / RBAC 未授权 URL”描述收窄为当前 `adminProfileSync` 代码实际合同：已登记菜单路径才按 RBAC 路径判定，已登记页面才按 active pages 判定；未解析出菜单权限 key 的路径不会仅因空 `currentMenuPath` 触发 RBAC 跳转。
- 完成：同步说明 `buildCurrentEntry` 对未命中菜单定义路径使用默认工作台 entry key 只作为 pages 判定锚点，不表示该 URL 成为菜单入口、授权入口或业务页面准入；local dev / super admin / sync failure 仍只是前端诊断例外，不扩大后端 RBAC、动作权限、Workflow / Fact 或 release evidence。
- 验证：`git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：若后续补测未命中菜单定义 URL 的 helper 行为，再同步更新测试覆盖说明。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不触碰 `deployments/**/evidence/**`。

## 2026-06-30 P5 collectionPlan missingInputs 分 action 收集字段合同

- 完成：继续推进多甲方角色能力流程编排 P5，只改 `multi-client-role-workflow-priority-audit` 的 input checklist 输出合同；`closeoutInputChecklist.collectionPlan[*].missingInputs` 现在与全局 `missingInputs` 同形，直接带出每个 action 缺失输入的 `source/sourceHint/evidenceTarget/validation/status/secret/actionIds`。
- 完成：同步测试和 `docs/product/多甲方角色能力流程编排优先级.md`，锁住 per-action collection plan 可直接作为分组收集表字段来源，同时仍不输出 `executeCommand`、不写 release evidence、不包含真实 secret。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-json` 写入临时文件并确认 immutable-version / target-smoke / release-signoff 的 per-action `missingInputs` 均含收集字段且无 execute 入口；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1。
- 下一步：P5 仍从 `immutable-version` 真实 release batch 输入开始；需要真实 environment、operator、server / web image ref 与 sha256 digest、migration before / after 和 backup id 后，才可进入受控 closeout 执行路径。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 菜单投影诊断例外文档再纠偏

- 完成：按 review 发现只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把菜单投影例外明确收窄为 `adminProfileSync` 当前代码写明的三类前端诊断路径：local dev 页面诊断、super admin 系统诊断页、super admin sync-failed 页面诊断。
- 完成：补明正式客户 / 非前端 DEV 构建普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄；正式 super admin 的 sync failure 例外不是正常 active revision 隐藏页授权，也不是普通账号 sync failure 兜底。
- 验证：`git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：若后续 `adminProfileSync` 或 `ERPLayout` 改变 helper reason、fallback 跳转或缓存复用合同，再同步调整这两处文档和测试说明。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不触碰 `deployments/**/evidence/**`。

## 2026-06-30 P5 input checklist Markdown 人工收集入口

- 完成：回到多甲方角色能力流程编排主线后，先用 `multi-client-role-workflow-priority-audit --json` 复核实施顺序；当前 P0-P4 本地 ready，P5 仍因目标 release evidence 缺失停在 `target-evidence-required / immutable-version`。
- 完成：只补 P5 本地可验证收口：`docs/product/多甲方角色能力流程编排优先级.md` 明确 `--input-checklist-markdown` 是人工 release batch 输入收集入口；`multi-client-role-workflow-priority-audit.test.mjs` 锁住 Markdown 的 `Collection Input Details` 逐 action 明细，不含 execute 确认入口、不写 release evidence。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-markdown` 写入临时文件并确认 25 条逐 action 输入明细、无 `--execute` / `RELEASE_CLOSEOUT_CONFIRM`、无 release evidence report path；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-json` 写入临时文件并确认轻量 JSON 不含 `releaseEvidenceProgress / checks / executeCommand`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1，第一缺口仍是 `immutable-version`。
- 下一步：P5 仍需要真实 release batch 输入和目标环境证据：environment、operator、server / web image ref 与 digest、migration before / after、backup id、生产 env 文件、source DSN、目标 smoke endpoint / backend URL / admin token、rollback target / trigger 和人工 sign-off。
- 阻塞/风险：本轮不改业务逻辑、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 input checklist README 入口自检

- 完成：继续推进 P5 本地收口，补齐 `scripts/README.md` 中 `--input-checklist-json` / `--input-checklist-markdown` 轻量输入清单入口说明，明确 Markdown 的 `Collection Input Details` 逐 action 明细、只读边界和不写 release evidence / 不输出 execute 入口。
- 完成：新增 priority audit 自检项 `priority-audit-input-checklist-docs`，同时检查产品优先级文档、`scripts/README.md` 和 CLI help 都登记输入清单入口及只读口径，避免 P5 收集入口只留在单一文档或脚本实现里。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 写入临时文件并确认 `priority-audit-input-checklist-docs` 通过且整体仍为 `target-evidence-required`；`--input-checklist-markdown` / `--input-checklist-json` 只读检查通过；`--json --fail-on-release-not-ready` 按预期 status 1，第一缺口仍是 `immutable-version`。
- 下一步：P5 仍从真实 release batch 输入和目标环境证据开始；本地 README / audit 自检只提高可发现性，不替代不可变镜像、preflight、备份恢复、目标 smoke、rollback / forward-fix 和签收证据。
- 阻塞/风险：本轮不改业务逻辑、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 input checklist 收集责任分组

- 完成：继续推进多甲方角色能力流程编排 P5，只改 `multi-client-role-workflow-priority-audit` 的只读输入清单输出；新增 `closeoutInputChecklist.collectionGroups`，按镜像 / 版本、preflight、备份恢复、目标 smoke、回滚处置、签收、客户配置读回七个收集责任面聚合 action 与缺失输入。
- 完成：同步 Markdown 输出新增 `Collection Groups` 表，保留 `Collection Input Details` 逐 action 明细；同步 `scripts/README.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`，明确分组只用于 release batch 输入收集，不写 release evidence、不输出 execute 入口。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-json` 写入临时文件并确认 7 个 `collectionGroups`、无 `executeCommand` / `--execute`、`writesReleaseEvidence=false`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-markdown` 写入临时文件并确认 `Collection Groups` / `Collection Input Details` 存在且无执行确认入口；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `priority-audit-input-checklist-docs` 通过且 P5 仍为 `target-evidence-required`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1；`node --test scripts/qa/docs-inventory.test.mjs` 当前失败，原因是工作区已有 `config/customers/demo/README.md` 和若干 `docs/archive/progress-*` 未登记到 `docs/文档清单.md`，非本轮 collection group 口径引入。
- 下一步：P5 仍从 `immutable-version` 的真实 release batch 输入开始；需要真实 environment、operator、server / web image ref 与 sha256 digest、migration before / after、backup id 等目标证据后，才可进入受控 closeout 执行路径。
- 阻塞/风险：本轮不改业务逻辑、不写仓库 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入；未修复 `docs-inventory` 既有未登记文档，避免把本轮 P5 输入清单收口扩大成文档清单治理。

## 2026-06-30 docs inventory 缺口收口

- 完成：按上一轮验证发现收口 `docs/文档清单.md`，登记既有 `config/customers/demo/README.md` 和 4 个 `docs/archive/progress-*` 归档文件，恢复当前维护 Markdown 清单完整性。
- 完成：本轮只修正文档清单路径和用途说明，不改缺失文件正文，不改业务逻辑、runtime、schema、客户配置包、部署脚本或 release evidence。
- 验证：`node --test scripts/qa/docs-inventory.test.mjs` 通过，扫描 246 个 maintained Markdown；追加前确认 `progress.md` 为 133 行 / 25136 bytes，未达到归档阈值。
- 下一步：继续回到 P5 release batch 输入和目标 evidence；后续新增 / 归档长期 Markdown 时继续同步 `docs/文档清单.md`。
- 阻塞/风险：本轮仍不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入；`docs/文档清单.md` 只是索引，不替代当前真源。

## 2026-06-30 P5 input checklist CSV 外部表格入口

- 完成：继续推进 P5 本地输入收集闭环，新增 `multi-client-role-workflow-priority-audit --input-checklist-csv`，把现有 `collectionGroups` / missing inputs 平铺成 group / action / input / source / evidence target / validation 维度 CSV，方便外部 release batch 收集表导入。
- 完成：CSV 模式只读、不写 release evidence、不输出 report command / execute command、不保存真实 DSN、token 或 secret 值；同步 `scripts/README.md`、`docs/product/多甲方角色能力流程编排优先级.md` 和 audit 自检口径。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --input-checklist-csv` 写入临时文件并确认 26 行、7 类 group、无 `--execute` / `RELEASE_CLOSEOUT_CONFIRM` / secret 赋值 / report command；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 P5 仍为 `target-evidence-required`、第一缺口仍是 `immutable-version`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1；`node --test scripts/qa/docs-inventory.test.mjs` 通过。
- 下一步：P5 仍需要真实 release batch 输入和目标环境 evidence；CSV 只降低人工收集成本，不替代不可变镜像、preflight、备份恢复、目标 smoke、rollback / forward-fix、客户配置读回和签收证据。
- 阻塞/风险：本轮不改业务逻辑、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 input checklist CSV 批次上下文

- 完成：继续收口 `--input-checklist-csv`，为每行补充 `evidence_dir / runtime_env_file / release_ready / completion_state / blocking_category`，让导出的外部表格脱离终端上下文也能识别 release batch、runtime env 和当前阻塞状态。
- 完成：补自定义 `--release-evidence-dir` / `--runtime-env-file` 的 CSV 只读合同测试；同步 `scripts/README.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；默认 `--input-checklist-csv` 写入临时文件并确认每行带默认 evidence/runtime/context、无 execute / secret 赋值 / report command；自定义路径 `--input-checklist-csv --release-evidence-dir output/test-release-evidence/releases/2099-03-01 --runtime-env-file output/test-env/prod-csv.env` 写入临时文件并确认上下文列使用自定义路径；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 P5 仍为 `target-evidence-required`、第一缺口仍是 `immutable-version`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 status 1；`node --test scripts/qa/docs-inventory.test.mjs` 通过。
- 下一步：P5 仍需要真实 release batch 输入和目标环境 evidence；CSV 上下文只改善收集表可追溯性，不替代不可变镜像、preflight、备份恢复、目标 smoke、rollback / forward-fix、客户配置读回和签收证据。

## 2026-06-30 P5 input checklist 阶段拆解上下文

- 完成：继续按多甲方角色能力流程编排主线推进 P5 只读输入收集闭环，给 `--input-checklist-json` 增加脱敏 `implementationBreakdown`，给 Markdown 增加 `Implementation Breakdown`，给 CSV 增加 `phase_id / phase_state / phase_local_state / phase_target_state / phase_next_action`，让外部收集表同时看到 P0-P5 阶段目标和当前 P5 阻塞状态。
- 完成：新增字段只来自现有 `implementationOrder`，过滤 `executeCommand` / `executeRequiresConfirm`，仍不输出 `--execute`、`RELEASE_CLOSEOUT_CONFIRM`、真实 DSN、token 或 secret 值；同步 `scripts/README.md` 和 `docs/product/多甲方角色能力流程编排优先级.md`。
- 验证：`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs` 和对应 test 通过；`--input-checklist-json` 抽检确认 6 个 `implementationBreakdown`、P5 仍为 `target-evidence-required / immutable-version` 且无 `executeCommand / --execute / RELEASE_CLOSEOUT_CONFIRM`；`--input-checklist-markdown` 抽检确认 `Implementation Breakdown / Collection Groups / Collection Input Details` 存在且无执行确认入口；`--input-checklist-csv` 抽检确认 26 行、含 `phase_*` 上下文、无执行确认和 secret 赋值；`--json --fail-on-release-not-ready` 按预期 exit 1 且第一缺口仍是 `immutable-version`；`node --test scripts/qa/docs-inventory.test.mjs` 通过；tracked `git diff --check` 与 untracked 文件 `--no-index` whitespace 检查通过。
- 下一步：P5 真实 closeout 仍从 `immutable-version` 开始，必须等真实 target environment、operator、server / web image ref 与 sha256 digest、migration before / after、backup id、目标 smoke、备份恢复、rollback / forward-fix 和签收证据齐备后才能写 release evidence。

## 2026-06-30 P0-P5 阶段执行合同

- 完成：继续推进多甲方角色能力流程编排主线，在 `multi-client-role-workflow-priority-audit` 的 P0-P5 phase 定义中补 `executionContract`，明确每阶段 allowed paths、forbidden paths、not doing 和 validation commands，覆盖后续连续实现前必须说明的边界。
- 完成：full audit 的 `implementationOrder` 和轻量 `implementationBreakdown` 均输出该执行合同；Markdown 的 `Implementation Breakdown` 表同步展示 allowed / forbidden / not doing / validation，且轻量输出仍过滤 `executeCommand`、`--execute` 和确认短语。同步 `scripts/README.md` 与 `docs/product/多甲方角色能力流程编排优先级.md`。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs` 和对应 test 通过；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`--input-checklist-json` 抽检确认 6 个 phase 均带 execution contract，P5 仍为 `target-evidence-required` 且无 `executeCommand / --execute / RELEASE_CLOSEOUT_CONFIRM`；`--input-checklist-markdown` 抽检确认 `Implementation Breakdown` 展示 allowed / forbidden / not doing / validation commands 且无执行确认入口；`--json --fail-on-release-not-ready` 按预期 exit 1，第一缺口仍是 `immutable-version`；`node --test scripts/qa/docs-inventory.test.mjs` 通过；tracked `git diff --check` 与 untracked 文件 `--no-index` whitespace 检查通过。
- 下一步：继续按执行合同推进；P5 真正写 release evidence 前仍必须等真实 release batch 输入和目标环境证据齐备，并在阶段说明中显式跨越 release evidence 边界。
- 阻塞/风险：本轮不改业务逻辑、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、migration、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 第二客户责任池差异本地证据

- 完成：继续推进多甲方角色能力流程编排 P5，不跨 release evidence；在 `demo` 客户包中新增受控 `workPoolRoleOverrides`，让同一 runtime 责任池 `order_review` 在 demo 映射到 `sales`，而 yoyoosun 仍映射到 `pmc`，证明 A/B 客户岗位差异可由客户配置 membership 表达，不需要 fork 核心代码或复制流程定义。
- 完成：`customer-config-runtime-manifest` 编译器支持受控责任池角色 override，并继续校验 role key、work pool、customer scope、workflow capability 和 forbidden payload；`multi-client-role-workflow-priority-audit` 新增 `second-customer-responsibility-pool-difference` ready check 和 `second-customer-responsibility-difference` requirement，本地 ready 但不替代目标环境证据。同步 `docs/product/多甲方角色能力流程编排优先级.md` 与 `scripts/README.md` 说明该证据边界。
- 验证：`node --check scripts/qa/customer-config-runtime-manifest.mjs`、`node --check scripts/qa/customer-config-runtime-manifest.test.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`、`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`node --test scripts/qa/customer-config-runtime-manifest.test.mjs` 14/14 通过；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/customer-package-lint.mjs --customer demo` 与 `--customer yoyoosun` 通过；`node scripts/qa/customer-config-runtime-manifest.mjs --customer demo` 与 `--customer yoyoosun` 通过；`multi-client-role-workflow-priority-audit --json` 确认新增 check 通过、P5 仍为 `evidence-required`、整体仍为 `target-evidence-required`；`--json --fail-on-release-not-ready` 按预期 exit 1，第一缺口仍是 `immutable-version`；`node --test scripts/qa/docs-inventory.test.mjs` 通过。
- 下一步：继续沿 P5 执行合同推进，真实 closeout 仍从 `immutable-version` 的 release batch 输入开始；若要继续补本地 P5 证据，可优先检查模块关闭一致阻断或 demo / yoyoosun 黄金闭环测试差异，但不得写成目标环境 release evidence。
- 阻塞/风险：本轮不改后端业务逻辑、不改 schema / migration、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入；`demo` 仍只是中性本地验证包，不是真实第二客户签收。

## 2026-06-30 adminProfileSync 菜单投影文档口径收窄

- 完成：按 review 发现只修正文档口径，不改业务逻辑；更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把菜单投影说明收敛到 `adminProfileSync` helper 与 `ERPLayout` 当前代码职责：helper 只返回过滤 / 跳转判定，session 拉取、空投影挂载、缓存复用和实际 fallback 跳转都由 `ERPLayout` 执行。
- 完成：补明正式客户 / 非前端 DEV 构建普通账号仍按 RBAC 菜单路径与 active revision pages 交集强收窄；`local dev`、`super admin`、`effective_session_sync_failed` 只保留前端诊断可见性例外，不扩大后端 RBAC、active revision、Workflow / Fact、真实导入或 release evidence。
- 验证：仅按本轮要求运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：若后续修改 `web/src/erp/utils/adminProfileSync.mjs` 或 `web/src/erp/components/ERPLayout.jsx` 的 helper reason、fallback 跳转、pages 归一化或缓存复用合同，再同步调整上述两处文档和对应测试说明。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不触碰 `deployments/**/evidence/**`，也不补跑前端测试或 release evidence gate。

## 2026-06-30 P5 模块 disabled/read_only guarded 审计合同修正

- 完成：回到多甲方角色能力模块组合流程编排主线，先修正 `multi-client-role-workflow-priority-audit` 的 P5 模块 `disabled/read_only` guarded 检查，使其匹配当前 `docs/product/多甲方角色能力流程编排优先级.md` 与 `docs/当前真源与交接顺序.md` 的实际口径；该检查现在证明“未完成边界已被机器审计显式标为 guarded”，不把模块阻断写成 ready。
- 完成：补充对应测试断言，锁住 31 个 reference coverage、2 个 guarded check、`module-disabled-readonly-gate` 的 local guarded 状态、P5 阶段仍因目标 release evidence 停在 `target-evidence-required`，以及第一条目标 evidence 缺口仍是 `immutable-version`。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `ok=true`、46/46 checks pass、`module-disabled-readonly-gate` 为 `guarded`、P5 为 `target-evidence-required`；`--json --fail-on-release-not-ready` 按预期 exit 1，第一缺口仍是 `immutable-version`。
- 下一步：继续 P5 时，应从该 guarded 项拆出真实模块门禁任务，逐步接入 disabled/read_only 对 API、能力授予、新流程、导入、打印、定时任务和 UI projection 的一致阻断；runtime count 接入在途流程 / 未完成任务 / 未结业务单据需要单独拆阶段。
- 阻塞/风险：本轮不实现真实模块阻断、不改业务 usecase、不改 schema / migration、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、目标 smoke、备份恢复、回滚演练、签收或真实客户数据导入。

## 2026-06-30 adminProfileSync 菜单投影文档口径补充校准

- 完成：按本轮 docs-only review 边界，只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的菜单投影、隐藏 URL 跳转、local dev / super admin / sync failure 诊断例外描述，使其更贴合 `adminProfileSync` 与 `ERPLayout` 当前代码分层。
- 完成：补明 `getAdminProfileSyncErrorAction` 的 `hasCachedProfile` 只影响同步失败处理动作，不等于存在客户配置投影缓存；`ERPLayout` 只复用 `adminProfileRef.current.effective_session`，无该缓存时才挂载新的 `effective_session_sync_failed` 空投影。
- 验证：按本轮要求仅运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：若后续改动 helper reason、`pages` 归一化、fallback 跳转或 effective session 缓存复用，需要同步更新上述文档与对应 helper 测试说明。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不触碰 release evidence，也不补跑前端单测、后端测试或发布门禁。

## 2026-06-30 P5 模块 runtime count 口径对齐

- 完成：继续多甲方角色能力流程编排主线，不跨 release evidence；修正 `docs/product/多甲方角色能力流程编排优先级.md` 中 P5 模块 `disabled/read_only` 的旧口径，把 `explain_module_status` 从 `runtime count not_connected` 对齐为当前代码的 `runtime_count_source=process_workflow_partial`。
- 完成：明确当前只接入 active / blocked 流程实例数和未完成 WorkflowTask 数，命中时给出 `in_flight_processes_present` / `open_workflow_tasks_present`；未结业务单据 count 和后端业务 API / 导入 / 打印 / 定时任务全链路阻断仍未完成，关闭动作继续保留 `open_business_documents_not_connected`。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/workflow-fact-boundary.test.mjs` 2/2 通过；`node scripts/qa/workflow-ui-action-boundary.test.mjs` 1/1 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `ok=true`、P5 为 `target-evidence-required`、`module-disabled-readonly-gate` 为 `guarded`；`--json --fail-on-release-not-ready` 按预期 exit 1，第一缺口仍是 `immutable-version`；`node --test scripts/qa/docs-inventory.test.mjs` 通过。
- 下一步：继续 P5 时，如果不进入真实 release evidence，应优先拆“未结业务单据 count”或“后端业务 API / 导入 / 打印 / 定时任务按模块状态阻断”的本地可验证切片；若进入 release evidence，必须先收集真实 release batch 输入。
- 阻塞/风险：本轮不改业务逻辑、不改 schema / migration、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入。

## 2026-06-30 P5 模块 disabled/read_only 本地审计恢复

- 完成：继续多甲方角色能力模块组合流程编排主线，按当前代码和正式文档恢复 `multi-client-role-workflow-priority-audit` 的 P5 `module-disabled-readonly-consistency-remains-guarded` 检查；审计脚本不再要求旧字面量“未结业务单据 count 已接入”，改为匹配当前优先级文档里的“核心业务表未结单据数”。
- 完成：清理 `module-disabled-readonly-gate` reference coverage 的旧残留，不再把 `explain_module_status` 未结业务单据 runtime count 写成未证明项；当前未证明项只保留后端业务 API、导入、打印、定时任务全链路强制阻断，以及目标环境模块关闭前置检查 / 历史只读查询。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `ok=true`、48/48 checks pass、P5 为 `target-evidence-required`、`module-disabled-readonly-gate` 为 `guarded`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/workflow-fact-boundary.test.mjs` 2/2 通过；`node scripts/qa/workflow-ui-action-boundary.test.mjs` 1/1 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 exit 1，第一缺口仍是 `immutable-version`。
- 下一步：P5 继续分两条线推进；没有正式生产环境时只能继续拆本地可验证的模块状态门禁切片，若跨入 release evidence 必须先收集真实 release batch 输入。
- 阻塞/风险：本轮只修审计合同，不实现真实模块关闭，不改业务 usecase、schema / migration、部署脚本、release evidence、客户数据或真实导入；后端业务 API、导入、打印、定时任务按 disabled/read_only 全链路强制阻断仍需另拆阶段。

## 2026-06-30 adminProfileSync local dev 诊断例外文档补齐

- 完成：按只改文档口径的 review 边界，补齐 `docs/当前真源与交接顺序.md` 和 `web/README.md` 中 `local dev` 普通账号诊断例外描述，明确第二层 pages 会放开“客户配置隐藏或 sync failure 空投影下的已登记页面”，与 `adminProfileSync` 的 `local_dev_customer_config_diagnostic / local_dev_sync_failed_diagnostic` reason 对齐。
- 验证：仅按本轮要求运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若修改 `adminProfileSync` helper reason、`ERPLayout` fallback 跳转或 effective session 缓存复用，再同步更新这两处文档和测试说明。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不触碰 release evidence，也不补跑前端单测、后端测试或发布门禁。

## 2026-06-30 P5 导入执行 moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；`customerImportExecute` 在生成 JSON-RPC 操作计划前要求 approval 声明 `moduleStates`，并按目标模块拒绝 `read_only`、`disabled` 或缺失状态，联系人按 owner type 映射客户 / 供应商模块，销售订单明细映射销售订单模块。
- 完成：补齐 report-only fixture、导入执行单测、priority audit check / reference coverage / P5 phase checkIds，并更新 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`scripts/README.md` 口径，明确该 loader 是已完成的本地门禁切片，但完整 P5 仍未证明后端业务 API、打印、定时任务和其它导入入口全链路阻断。
- 验证：`node --check scripts/import/customerImportExecute.mjs`；`node --check scripts/import/customerImportExecute.test.mjs`；`node --test scripts/import/customerImportExecute.test.mjs` 17/17 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/workflow-fact-boundary.test.mjs` 2/2 通过；`node scripts/qa/workflow-ui-action-boundary.test.mjs` 1/1 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `ok=true`、P5 仍为 `target-evidence-required`、`module-disabled-readonly-gate` 仍为 `guarded` 且包含 `module-disabled-readonly-import-execute-gate`；`--json --fail-on-release-not-ready` 按预期 exit 1；相关 tracked / untracked 文件 whitespace 检查通过。
- 下一步：继续 P5 时，优先从后端业务 API、打印、定时任务或其它导入入口拆下一个模块状态门禁切片；若跨入 release evidence，必须先收集真实 release batch 输入。
- 阻塞/风险：本轮不改 schema / migration、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入；`customerImportExecute` 仍只通过 JSON-RPC V1 API 执行，不直写数据库、不写 Workflow / Fact。

## 2026-06-30 adminProfileSync 诊断例外口径再收窄

- 完成：按 review 边界只修正文档口径，继续更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把 local dev / super admin / sync failure 诊断例外明确收口到 `adminProfileSync` 的第二层 pages 判定；普通账号仍必须先通过第一层 RBAC 菜单路径，super admin 也只在前端菜单路径层视为通过。
- 完成：补明 `ERPLayout` 负责 `get_effective_session` 拉取、`adminProfileRef.current.effective_session` 缓存复用、无客户配置投影缓存时挂载 `effective_session_sync_failed` 空投影，以及实际 fallback `navigate(..., { replace: true })`；普通 `me` profile 缓存和 `hasCachedProfile` 不等于已有客户配置投影缓存。
- 验证：按本轮要求仅运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若改 `adminProfileSync` helper reason、`ERPLayout` fallback 跳转、pages 归一化或 effective session 缓存复用，需要同步更新上述文档与对应 helper 测试说明。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不触碰 release evidence，也不补跑前端单测、后端测试或发布门禁。

## 2026-06-30 P5 customer_config execute API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；确认 `customer_config` 显式流程 execute API 已通过 `EnsureProcessDomainCommandModulesEnabled` 在执行 `ExecuteDomainCommandNode` 前按 active revision module states 校验命令引用模块，`read_only`、`disabled` 或缺失都会拒绝，避免显式 execute 绕过模块状态。
- 完成：补齐 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md` 和 `server/README.md` 口径，明确该门禁只覆盖 `customer_config.execute_*` 显式流程入口；普通后端业务 API、打印、定时任务和其它导入入口仍未全链路证明，P5 继续保持 guarded / target-evidence-required。
- 验证：`cd server && go test ./internal/biz ./internal/service` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs` 和对应 test 脚本通过语法检查；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `ok=true`、`module-disabled-readonly-customer-config-execute-gate` 为 ready/pass、`module-disabled-readonly-consistency-remains-guarded` 为 guarded/pass、P5 仍为 `target-evidence-required`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 exit 1；`node scripts/qa/workflow-fact-boundary.test.mjs` 2/2 通过；`node scripts/qa/workflow-ui-action-boundary.test.mjs` 1/1 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；相关 tracked / untracked 文件 whitespace 检查通过。
- 下一步：继续 P5 时，优先拆普通后端业务 API、打印、定时任务或其它导入入口的模块状态门禁；若进入 release evidence，必须先收集真实 release batch 输入并显式声明阶段边界。
- 阻塞/风险：本轮不改 schema / migration、不写 `deployments/**/evidence/**`，不执行 `--execute`、部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入；该切片不证明目标环境模块关闭、历史只读查询或完整生产发布。

## 2026-06-30 adminProfileSync 隐藏 URL 跳转文档口径纠偏

- 完成：按 docs-only review 边界，只更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把菜单项过滤与隐藏 URL helper 判定拆开描述；菜单项过滤仍要求普通账号命中第一层 RBAC 菜单路径，隐藏 URL 当前路径若解析不出 `currentMenuPath` 不会单独因 RBAC 触发跳转。
- 完成：补明未命中菜单定义的路径只会优先用菜单定义里的默认工作台项做 pages 判定；若连默认工作台项也不存在，空 page key 只是 helper 不因 page key 阻断，不把当前 URL 升级为菜单入口、授权入口或业务页面准入。
- 验证：按本轮要求仅运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若修改 `adminProfileSync` helper、`ERPLayout` 的 `buildCurrentEntry` / fallback 跳转、pages 归一化或 effective session 缓存复用，再同步更新这两处文档和 helper 测试说明。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不触碰 release evidence，也不补跑前端单测、后端测试或发布门禁。

## 2026-06-30 P5 purchase 采购入库 API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；新增通用 `EnsureModuleKeysEnabled` / `requireCustomerConfigModulesEnabled` 本地门禁，先接入 `purchase` 域采购入库普通 JSON-RPC 写入口。`create_purchase_receipt_draft / create_purchase_receipt_with_items / create_purchase_receipt_from_purchase_order / add_purchase_receipt_item / post_purchase_receipt / cancel_purchase_receipt` 现在要求 active revision 中 `purchase_receipts`、`purchase_orders` 或 `inventory` 为 `enabled`，`read_only / disabled / 缺失` 会拒绝且不调用领域 usecase 写采购收货或库存事实。
- 完成：补齐 `TestJsonrpcDispatcher_PurchaseReceiptAPIRequiresEnabledModules`，锁住 `purchase_receipts=read_only` 时不能创建收货、`inventory=read_only` 时不能过账库存流水，以及 `get_purchase_receipt` 历史读取仍可用；同步更新 priority audit check / reference coverage / P5 phase checkIds 和 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 口径。
- 验证：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_PurchaseReceiptAPI'` 通过；`cd server && go test ./internal/biz ./internal/service` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/workflow-fact-boundary.test.mjs` 2/2 通过；`node scripts/qa/workflow-ui-action-boundary.test.mjs` 1/1 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `ok=true`、`module-disabled-readonly-purchase-api-gate` 为 ready/pass、`module-disabled-readonly-gate` 仍为 guarded、P5 仍为 `target-evidence-required`。
- 下一步：继续 P5 时，可从其它普通后端业务 API、打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；若进入 release evidence，必须先收集真实 release batch 输入并显式声明跨越边界。
- 阻塞/风险：本轮不改 schema / migration、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入；该切片只证明 purchase 采购入库写 API 的本地门禁，不证明完整 P5 ready。

## 2026-06-30 adminProfileSync URL fallback 文档纠偏

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把隐藏 URL 未命中菜单定义时的描述改为当前代码实际的 `DEFAULT_DESKTOP_ENTRY`（`/erp/dashboard`）page key fallback；该 fallback 只用于当前 URL 判定和页头展示，不把原始 URL 升级为菜单入口、授权入口或业务页面准入。
- 验证：按本轮要求仅运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若修改 `ERPLayout` 的 `buildCurrentEntry` / fallback 跳转、`adminProfileSync` helper reason、pages 归一化或 effective session 缓存复用，再同步更新这两处文档和 helper 测试说明。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不触碰 release evidence，也不补跑前端单测、后端测试或发布门禁。

## 2026-06-30 P5 quality 质检 API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；`quality` 域普通 JSON-RPC 写入口已接入 active module states 本地门禁。`create_quality_inspection_draft / create_finished_goods_quality_inspection_draft / submit_quality_inspection / pass_quality_inspection / reject_quality_inspection / cancel_quality_inspection` 现在要求 `quality_inspections` 为 `enabled`，`read_only / disabled / 缺失` 会拒绝且不调用 `InventoryUsecase` 创建或变更质检事实；`get/list` 历史读取仍保留。
- 完成：补齐 `TestJsonrpcDispatcher_QualityInspectionAPIRequiresEnabledModules`，锁住 `quality_inspections=read_only` 时不能创建质检、不能提交草稿、不会改变质检状态，且 `get_quality_inspection` 历史读取仍可用；同步更新 priority audit check / reference coverage / P5 phase checkIds 和 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 口径。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_QualityInspectionAPI|TestJsonrpcDispatcher_FinishedGoodsQualityInspectionAPI'` 通过；`cd server && go test ./internal/biz ./internal/service` 通过；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/workflow-fact-boundary.test.mjs` 2/2 通过；`node scripts/qa/workflow-ui-action-boundary.test.mjs` 1/1 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `module-disabled-readonly-quality-api-gate` 为 ready/pass，`module-disabled-readonly-gate` 仍为 guarded，P5 仍为 `target-evidence-required`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 exit 1，`blockingCategory=external-release-evidence-required`，第一 blocked action 仍是 `immutable-version`。
- 下一步：继续 P5 时，可从其它普通后端业务 API、打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；若进入 release evidence，必须先收集真实 release batch 输入并显式声明跨越边界。
- 阻塞/风险：本轮不改 schema / migration、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入；该切片只证明 quality 质检写 API 的本地门禁，不证明完整 P5 ready。

## 2026-06-30 adminProfileSync hidden URL fallback 文档再纠偏

- 完成：按 review 发现只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`，把菜单项过滤与隐藏 URL 判定继续拆开描述；local dev 普通账号在菜单项过滤中仍先过 RBAC 菜单路径，但隐藏 URL 当前路径若解析不出 `currentMenuPath` 不会单独因 RBAC 阻断。
- 完成：把未命中菜单定义的 fallback 对齐 `ERPLayout.buildCurrentEntry` 当前代码：先回落到菜单定义里的默认工作台项做 page key 判定；若菜单定义里没有默认工作台项，才回落到无 page key 的 `DEFAULT_DESKTOP_ENTRY`，空 page key 只表示 helper 不因 page key 阻断，不把原始 URL 升级为菜单入口、授权入口或业务页面准入。
- 验证：按本轮要求仅运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若修改 `ERPLayout` 的 `buildCurrentEntry` / fallback 跳转、`adminProfileSync` helper reason、pages 归一化或 effective session 缓存复用，再同步更新这两处文档和 helper 测试说明。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不触碰 release evidence，也不补跑前端单测、后端测试或发布门禁。

## 2026-06-30 P5 stock reservation 库存预留 API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；`operational_fact` 的 stock reservation 库存预留普通 JSON-RPC 写入口接入 active module states 本地门禁。`create_stock_reservation / release_stock_reservation / consume_stock_reservation` 现在要求 `inventory=enabled`，`read_only / disabled / 缺失` 会拒绝且不调用 `OperationalFactUsecase` 写库存预留事实；`list_stock_reservations` 继续保留历史读取。
- 完成：补齐 `TestJsonrpcDispatcher_StockReservationAPIRequiresEnabledInventoryModule`，锁住 `inventory=read_only` 时不能创建库存预留、`inventory=disabled` 时不能释放 / 消耗库存预留，并保留历史 list 查询；同步 priority audit check / reference coverage / P5 phase checkIds 和 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 口径。
- 验证：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_StockReservationAPIRequiresEnabledInventoryModule|TestJsonrpcDispatcher_OperationalFactListsRejectInvalid'` 通过；`cd server && go test ./internal/biz ./internal/service` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/workflow-fact-boundary.test.mjs` 2/2 通过；`node scripts/qa/workflow-ui-action-boundary.test.mjs` 1/1 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `module-disabled-readonly-stock-reservation-api-gate` 为 ready/pass，`module-disabled-readonly-gate` 仍为 guarded，P5 仍为 `target-evidence-required`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 exit 1，`blockingCategory=external-release-evidence-required`，第一 blocked action 仍是 `immutable-version`。
- 下一步：继续 P5 时，优先从剩余普通后端业务 API、打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；若进入 release evidence，必须先收集真实 release batch 输入并显式声明跨越边界。
- 阻塞/风险：本轮不改 schema / migration、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入；该切片只证明 stock reservation 库存预留写 API 的本地门禁，不证明完整 P5 ready。

## 2026-06-30 P5 production 生产事实 API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；`operational_fact` 的 production 生产事实普通 JSON-RPC 写入口接入 active module states 本地门禁。`create_production_fact / post_production_fact / cancel_production_fact` 现在要求 `production=enabled`，`read_only / disabled / 缺失` 会拒绝且不调用 `OperationalFactUsecase` 写生产事实；`list_production_facts` 继续保留历史读取。
- 完成：补齐 `TestJsonrpcDispatcher_ProductionFactAPIRequiresEnabledModule`，锁住缺失 `production` 模块、`production=read_only`、`production=disabled` 时不能创建 / 过账 / 取消生产事实，并保留历史 list 查询；同步 priority audit check / reference coverage / P5 phase checkIds 和 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 口径。
- 验证：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_ProductionFactAPIRequiresEnabledModule|TestJsonrpcDispatcher_StockReservationAPIRequiresEnabledInventoryModule|TestJsonrpcDispatcher_OperationalFactListsRejectInvalid'` 通过；`cd server && go test ./internal/biz ./internal/service` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/workflow-fact-boundary.test.mjs` 2/2 通过；`node scripts/qa/workflow-ui-action-boundary.test.mjs` 1/1 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `module-disabled-readonly-production-api-gate` 为 ready/pass，`module-disabled-readonly-gate` 仍为 guarded，P5 仍为 `target-evidence-required`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 exit 1，`blockingCategory=external-release-evidence-required`，第一 blocked action 仍是 `immutable-version`。
- 下一步：继续 P5 时，优先从剩余普通后端业务 API、打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；若进入 release evidence，必须先收集真实 release batch 输入并显式声明跨越边界。
- 阻塞/风险：本轮不改 schema / migration、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入；该切片只证明 production 生产事实写 API 的本地门禁，不证明完整 P5 ready。

## 2026-06-30 P5 outsourcing fact 委外事实 API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；`operational_fact` 的 outsourcing fact 委外事实普通 JSON-RPC 写入口接入 active module states 本地门禁。`create_outsourcing_fact / post_outsourcing_fact / cancel_outsourcing_fact` 现在要求当前模块目录中的 `outsourcing_orders=enabled`，`read_only / disabled / 缺失` 会拒绝且不调用 `OperationalFactUsecase` 写委外事实；`list_outsourcing_facts` 继续保留历史读取。
- 完成：补齐 `TestJsonrpcDispatcher_OutsourcingFactAPIRequiresEnabledModule`，锁住缺失 `outsourcing_orders` 模块、`outsourcing_orders=read_only`、`outsourcing_orders=disabled` 时不能创建 / 过账 / 取消委外事实，并保留历史 list 查询；同步 priority audit check / reference coverage / P5 phase checkIds 和 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 口径。
- 验证：`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_OutsourcingFactAPIRequiresEnabledModule|TestJsonrpcDispatcher_ProductionFactAPIRequiresEnabledModule|TestJsonrpcDispatcher_OperationalFactListsRejectInvalid'` 通过；`cd server && go test ./internal/biz ./internal/service` 通过；`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs`；`node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/workflow-fact-boundary.test.mjs` 2/2 通过；`node scripts/qa/workflow-ui-action-boundary.test.mjs` 1/1 通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `module-disabled-readonly-outsourcing-api-gate` 为 ready/pass，`module-disabled-readonly-gate` 仍为 guarded，P5 仍为 `target-evidence-required`；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 exit 1，`blockingCategory=external-release-evidence-required`，第一 blocked action 仍是 `immutable-version`。
- 下一步：继续 P5 时，优先从剩余普通后端业务 API、打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；`outsourcing_order` 源单据 API 尚未纳入本切片。若进入 release evidence，必须先收集真实 release batch 输入并显式声明跨越边界。
- 阻塞/风险：本轮不改 schema / migration、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入；该切片只证明 outsourcing fact 委外事实写 API 的本地门禁，不证明完整 P5 ready。

## 2026-06-30 P5 sales order 销售订单 API moduleStates 门禁

- 完成：继续多甲方角色能力流程编排 P5，不跨 release evidence；`sales_order` 普通 JSON-RPC 写入口接入 active module states 本地门禁。`create_sales_order / update_sales_order / save_sales_order_with_items / add_sales_order_item / update_sales_order_item / remove_sales_order_item / submit_sales_order / activate_sales_order / close_sales_order / cancel_sales_order` 现在要求 `sales_orders=enabled`，`read_only / disabled / 缺失` 会拒绝且不调用 `SalesOrderUsecase` 写入或推进销售订单源单；`get/list` 历史读取继续保留。
- 完成：补齐 `TestJsonrpcDispatcher_SalesOrderAPIRequiresEnabledModule`，锁住 `sales_orders=read_only` 时不能创建 / 保存订单、`sales_orders=disabled` 时不能新增订单行或取消订单，并保留 `list_sales_orders / list_sales_order_items` 历史读取；同步 priority audit check / reference coverage / P5 phase checkIds 和 `docs/product/多甲方角色能力流程编排优先级.md`、`docs/当前真源与交接顺序.md`、`server/README.md` 口径。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs && node --check scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过；`cd server && go test ./internal/service -run 'TestJsonrpcDispatcher_SalesOrderAPIRequiresEnabledModule|TestJsonrpcDispatcher_SalesOrderAPIRequiresPermissionAndRejectsShipmentVerb|TestJsonrpcDispatcher_SaveSalesOrderWithItemsUsesSingleUsecase|TestJsonrpcDispatcher_SalesOrderItemAPIUsesUsecaseProductUnitGuard'` 通过；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 15/15 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 确认 `module-disabled-readonly-sales-order-api-gate` 纳入 P5 且为 ready/pass，P5 仍为 `target-evidence-required`；`cd server && go test ./internal/biz ./internal/service` 通过；`node scripts/qa/workflow-fact-boundary.test.mjs && node scripts/qa/workflow-ui-action-boundary.test.mjs && node --test scripts/qa/docs-inventory.test.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json --fail-on-release-not-ready` 按预期 exit 1，`blockingCategory=external-release-evidence-required`。
- 下一步：继续 P5 时，优先从剩余普通后端业务 API（例如 `purchase_order` / `outsourcing_order` 源单据）、打印、定时任务或除 `customerImportExecute` 外的其它导入入口拆下一个 moduleStates 门禁切片；若进入 release evidence，必须先收集真实 release batch 输入并显式声明跨越边界。
- 阻塞/风险：本轮不改 schema / migration、不写 `deployments/**/evidence/**`，不执行 closeout `--execute`、部署、target smoke、backup restore、rollback rehearsal、sign-off 或真实客户数据导入；该切片只证明 sales order 销售订单写 API 的本地门禁，不证明完整 P5 ready。

## 2026-06-30 adminProfileSync 文档口径对齐当前代码

- 完成：按 review 边界只修正文档口径，更新 `docs/当前真源与交接顺序.md` 和 `web/README.md`；把菜单投影、隐藏 URL、local dev / super admin / sync failure 诊断例外收窄到 `adminProfileSync` 与 `ERPLayout.buildCurrentEntry` 当前代码。
- 完成：明确未命中菜单定义时先回落到菜单定义里的默认工作台项做 page key 判定，若没有默认工作台项才回落到无 page key 的 `DEFAULT_DESKTOP_ENTRY`；该 fallback 只用于当前 URL 判定和页头展示，不把原始 URL 升级为菜单入口、授权入口或业务页面准入。
- 验证：按本轮要求仅运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续若修改 `adminProfileSync` helper reason、`ERPLayout` fallback、pages 归一化或 effective session 缓存复用，再同步更新这两处文档和 helper 测试说明。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不触碰 release evidence，也不补跑前端单测、后端测试或发布门禁。

## 2026-06-30 adminProfileSync super admin / sync failure 文档口径再收窄

- 完成：只改 `docs/当前真源与交接顺序.md` 和 `web/README.md` 的描述，进一步明确 `super admin` 只在第一层前端菜单路径判断中不依赖 `allowedMenuPaths`，不绕过第二层 active pages 收窄。
- 完成：补清 sync failure 诊断前提：正式构建 super admin 只有在当前 profile 已挂载 `source=effective_session_sync_failed` 空投影时才走 sync failure 诊断；普通 `me` profile 缓存和 `hasCachedProfile` 不等于客户配置投影缓存。
- 验证：按本轮要求仅运行 `git diff --check -- docs/当前真源与交接顺序.md web/README.md progress.md`。
- 下一步：后续如改 `adminProfileSync` 或 `ERPLayout` 的 helper 判定、fallback 或缓存复用，再同步更新这两份文档。
- 阻塞/风险：本轮不改业务逻辑、不提交、不推送、不触碰 release evidence，也不补跑前端 / 后端 / 发布门禁测试。
