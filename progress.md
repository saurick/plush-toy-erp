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
- `docs/archive/progress-2026-07-01-before-action-projection-l1.md`：归档 2026-06-30 outsourcing order API 门禁之后至 2026-07-01 动作投影浏览器回归扩展的过程记录。
- `docs/archive/progress-2026-07-01-before-progress-archive-and-next-no-write.md`：归档 2026-07-01 动作投影浏览器回归扩展之后至 Purchase Receipt Browser E2E 输入模板的过程记录。
- `docs/archive/progress-2026-07-01-before-readme-preflight-sync-closeout.md`：归档 2026-07-01 Purchase Receipt Browser E2E 输入模板之后至 Web README mobile preflight 口径同步的过程记录。
- `docs/archive/progress-2026-07-01-before-bom-inline-editor.md`：归档 2026-07-01 Web README preflight 口径同步之后至 BOM 明细弹窗内联编辑前的过程记录。

## 当前活跃事项

- 多甲方角色能力流程编排以 `docs/product/多甲方角色能力流程编排优先级.md` 和 `node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 的 `implementationOrder` 为本地优先级入口；GPT/reference 资料只作输入，当前真源仍回到代码、migration、测试和正式文档。
- 当前审计显示 P0-P4 本地证据为 ready；P5 测试部署 / 导入 / 第二客户验证仍为 `target-evidence-required`，第一条 blocked release action 是 `immutable-version`。
- P5 当前只允许 report-only、input template、preflight 和 checklist 准备；没有真实目标环境、镜像 digest、migration 前后版本、backup id、目标管理员凭据和用户确认时，不写 `deployments/**/evidence/**`，不执行 `--execute`，不把本地 ready 写成目标 release evidence。
- 真实客户数据导入、正式生产发布、目标环境 smoke、目标 migration、备份恢复、回滚 / 前向修复演练、客户配置激活和签收仍未执行，不能被本地 dry-run、manifest 编译、status、gate、audit、runner report、input template 或 preflight 替代。
- 当前可继续推进的本地闭环优先落在：试用账号 / 菜单 / 岗位任务端前置检查、客户配置控制台 no-write 诊断、字段链路守卫、错误提示和 README / `__dev/testing` 入口口径一致性。

## 2026-07-01 progress 归档到 BOM 明细内联编辑前

- 完成：归档前 `progress.md` 为 328 行 / 82,349 bytes，超过 80KB 阈值；已将完整原文复制到 `docs/archive/progress-2026-07-01-before-bom-inline-editor.md`。
- 完成：根 `progress.md` 收敛为归档索引、当前活跃事项、归档说明和最近 4 组记录，避免继续在超过阈值的根流水上追加。
- 下一步：本轮 BOM 明细弹窗收口完成后继续保持短记录；若再次接近 80KB 或 600 行，先归档再追加。
- 阻塞/风险：本次归档只整理过程记录，不改变 runtime、schema、RBAC、测试、发布脚本、目标环境状态、客户数据或正式业务真源。

## 2026-07-01 当前 diff 角色一致性定向收口

- 完成：按当前 diff 定向核查角色、权限、菜单、移动任务端和 Workflow 动作解释边界。修正 `workflowMethodRequiresEnabledModule` 中把只读 `explain_action_access / explain_task_assignment` 误纳入 `workflow_tasks=enabled` 写门禁的问题，保持正式文档约定的 read_only/disabled 下历史 explain 查询可读；对应测试改为断言 explain 在 read_only 下返回 OK 且不调用任务更新 usecase。同步确认工程岗位任务端是既有 `engineering` 角色和 `mobile.engineering.access` 权限的可授权入口补齐，不把 `/m/<role>/tasks` 当成真实账号岗位；移动端底部动作保留为完成 / 阻塞 / 催办 / 退回并先走后端 explain 合同，不新增本地事实写入。
- 验证：`go test ./internal/service -run 'TestJsonrpcDispatcher_WorkflowWriteAPIRequiresEnabledModule|TestJsonrpcDispatcher_WorkflowUrgeTaskRejectsEmptyReason|TestJsonrpcDispatcher_WorkflowCompleteTaskActionUsesDoneAndServerActorRole|TestJsonrpcDispatcher_WorkflowControlledTaskActionsUseServerStatusAndActorRole|TestJsonrpcDispatcher_WorkflowExplain(ActionAccess|TaskAssignment)'` 通过；`go test ./internal/biz -run 'TestNormalizeAdminMobileRolePermissionsUsesCurrentRoleKeys|TestAdminMobileRolePermissionOptionsIncludeEngineering|TestBuiltinRoleWorkflowPermissionMatrix|TestMobileRoleAccessPermissionIncludesEngineering'` 通过；`go test ./internal/data -run TestWorkflowRepo_TaskStatusReasonEventAndCompletionCleanup` 通过；`PATH=/usr/local/bin:$PATH node --test web/src/erp/config/entryConfig.test.mjs web/src/erp/config/menuPermissions.test.mjs web/src/erp/utils/adminProfileSync.test.mjs web/src/erp/utils/mobileRolePermissions.test.mjs web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs web/src/erp/utils/mobileTaskView.test.mjs web/src/erp/utils/workflowTaskActionAccess.test.mjs web/src/erp/utils/workflowTaskBoard.test.mjs` 通过，共 81 个前端用例，仍有既有 `MODULE_TYPELESS_PACKAGE_JSON` 警告；`git diff --check -- server/internal/service/jsonrpc_workflow.go server/internal/service/jsonrpc_workflow_test.go` 通过。
- 下一步：停止继续扩展 raw-id 或新主题扫描；后续若要产品化补齐工程岗位一键权限预设，应单独评审前端 preset 文案、菜单范围和测试，不混入本轮收口。
- 阻塞/风险：本轮只做当前 diff 的本地定向核查和一个 Workflow explain 门禁修复，不改 schema、migration、客户配置真源、RBAC 码表、生产部署、真实客户数据、真实账号或目标环境；本地单测和 no-write 前端测试不代表生产、目标环境或客户现场验证。当前 diff 仍包含大量其它会话/前序改动，未按本轮目标逐一重构或提交。

## 2026-07-01 永绅前端包本地预览脚本

- 完成：新增 `web/scripts/previewYoyoosun.mjs` 和 `pnpm preview:yoyoosun`，默认执行前端 `build:all`、注入 `config/customers/yoyoosun/customer-config.example.js` 与客户静态资产，并以 `APP_ID=desktop PORT=5176 API_ORIGIN=http://127.0.0.1:8300` 启动 `serve:prod`。脚本支持 `--print-plan / --skip-build / --port / --api-origin`，兼容 pnpm 传入的裸 `--`，并只做后端 `/healthz` 提示检查，不 publish / activate 后端 customer config。同步更新 `web/README.md` 和 `web/scripts/README.md` 的入口、边界和命令。
- 验证：`node --check web/scripts/previewYoyoosun.mjs` 通过；`node -e "JSON.parse(require('fs').readFileSync('web/package.json','utf8')); console.log('package json ok')"` 通过；首次 `pnpm --dir web preview:yoyoosun -- --print-plan` 命中 Codex runtime `pnpm 11.7.0` 被 engine 拦截，改用 `PATH=/usr/local/bin:$PATH` 后确认 `pnpm 10.13.1`；`PATH=/usr/local/bin:$PATH pnpm --dir web preview:yoyoosun --print-plan` 和 `PATH=/usr/local/bin:$PATH pnpm --dir web preview:yoyoosun -- --print-plan` 均通过；`PATH=/usr/local/bin:$PATH pnpm --dir web preview:yoyoosun -- --skip-build --port 5276` 成功检查后端 health、注入 yoyoosun 静态配置并启动临时静态服务；`curl http://127.0.0.1:5276/healthz` 返回 `appId=desktop`，`curl http://127.0.0.1:5276/customer-config.js` 返回 `customerKey: "yoyoosun"` 和永绅品牌配置；验证后已 Ctrl-C 停止临时 `5276` 服务；`git diff --check -- web/scripts/previewYoyoosun.mjs web/package.json web/scripts/README.md web/README.md` 通过。
- 下一步：如果后续要把 yoyoosun runtime manifest 的 validate / publish / activate 也做成执行器，应另拆任务并保留 release readiness / `/__dev/customer-config` 的显式写入门禁，不并入本地静态预览脚本。
- 阻塞/风险：本轮只新增前端本地预览脚本和文档说明，不改后端服务、schema、migration、RBAC、customer_config 控制面、真实客户数据、生产部署或数据库；验证使用既有 `web/build` 加 `--skip-build` 启动实际静态服务，未重新跑完整 `build:all`，不代表当前大量未提交工作区改动整体可构建或可发布。

## 2026-07-01 super admin 前端产品核心看全

- 完成：`adminProfileSync` 改为让 super admin 在前端不受 active pages / actions / field policy 收窄，可查看已登记业务页、按钮和字段；普通账号仍按 RBAC 与 effective session 交集收窄。同步更新 L1 场景、测试预设、优先级审计和正式文档口径。
- 验证：`node --test` 覆盖 adminProfileSync、masterDataOrderView、formal customer config boundary、priority audit、devTesting 共 57 项通过；`node --check`、`git diff --check` 通过；targeted `STYLE_L1_SCENARIOS=erp-effective-session-super-admin-product-core,erp-effective-session-action-projection-business-pages,erp-no-visible-menu-blocks-outlet pnpm --dir web style:l1` 通过 3 场景。
- 下一步：如需确认本机预览页面，应用 super admin 登录刷新后检查业务菜单和按钮；生产发布仍走既有 release gate。
- 阻塞/风险：本轮只改前端可见性和文档/测试，不绕过后端 RBAC、模块状态、Workflow / Fact usecase、幂等或审计；未改目标环境配置和真实发布证据。

## 2026-07-01 progress 归档索引补齐

- 完成：补齐 `docs/archive/README.md` 中漏登记的 `docs/archive/progress-2026-07-01-before-action-projection-l1.md`，让 7 月 1 日新增 progress 归档文件在归档索引中可查。
- 验证：更新前已检查 `progress.md` 规模为 321 行、81,606 bytes，未达到 600 行或 80 KiB 归档阈值；待跑 docs inventory 和 diff check。
- 下一步：继续保持当前 goal 收口，不再扩展 release evidence 或新主题；若后续改客户交付状态，再单独核对客户交付矩阵和真实证据。
- 阻塞/风险：本组只改归档索引和过程记录，不改代码、runtime、schema、RBAC、客户配置、测试脚本、部署或真实客户数据。

## 2026-07-01 BOM 明细弹窗流畅度收口

- 完成：参考销售订单行在主业务弹窗内编辑的模式，把 BOM 明细添加 / 编辑从二级 `BusinessFormModal` 改为 `BOMInlineItemEditor` 内联编辑区，避免叠加第二层业务弹窗、遮罩和暗色 blur；保存仍走原 `addBOMItem / updateBOMItem` API，移除仍走原 Popconfirm 与 `deleteBOMItem`。切换 / 关闭 BOM 主弹窗时会清理明细编辑状态；内联编辑器打开后焦点进入第一个可用控件。
- 完成：补充 BOM 内联编辑区 scoped CSS 和窄屏响应式布局；`business-formal-module-shells-desktop` L1 场景新增“编辑 BOM 草稿 -> 添加明细”断言，检查只有 1 个业务弹窗、1 层遮罩、焦点在内联编辑器内、编辑器不横向溢出且留在 modal body 内；BOM mock 按 id 返回草稿详情以覆盖编辑路径。
- 验证：`cd web && /usr/local/bin/pnpm exec eslint --ext .js --ext .jsx src/erp/pages/BOMVersionsPage.jsx` 通过；`/usr/local/bin/pnpm --dir web css` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test` 通过，共 453 个用例；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm --dir web style:l1` 通过，共 1 个场景。全量 `pnpm --dir web lint` 仍被既有 `web/src/erp/mobile/components/MobileTaskListScreen.jsx:587 getMobileRoleLabel is not defined` 阻塞，本轮只用 targeted eslint 验证 BOM 文件。
- 下一步：若继续优化 BOM，可再评估材料选择来源导入、长材料名 / 多单位候选的真实数据边界；当前不需要改后端合同。
- 阻塞/风险：本组只改 BOM 前端弹窗交互、scoped 样式和 L1 mock / 场景，不改 schema、migration、RBAC、菜单、Workflow / Fact、BOM JSON-RPC 合同、客户配置、真实客户数据、上传附件或部署；未执行真实后端写入，只用现有单测和浏览器 mock 回归证明本地交互与布局。

## 2026-07-01 业务明细 item 交互统一收口

- 完成：按业务表单样板统一“业务大弹窗内明细不再开第二层完整业务弹窗”的口径。BOM 内联编辑器补齐空表单校验 catch，避免校验 reject 变成页面 runtime error；采购入库从独立“添加入库明细” `BusinessFormModal` 改为选中入库草稿后的 `PurchaseReceiptInlineItemEditor`，仍逐行调用 `addPurchaseReceiptItem`，不改采购入库 header / 过账 / 库存事实合同。
- 完成：补充采购入库内联编辑区 scoped CSS、窄屏响应式布局和暗色主题 token；L1 helper / scenarios 从 `add-item-modal` 改名为 `add-item-inline`，断言不再出现业务 form modal 和 mask，焦点留在内联编辑器，长批次号、长来源行号、大数量、大金额和长备注不造成横向溢出。
- 验证：`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/V1PurchaseReceiptsPage.jsx src/erp/pages/BOMVersionsPage.jsx scripts/style-l1/purchaseReceiptAssertions.mjs scripts/style-l1/purchaseReceiptScenarios.mjs scripts/style-l1/scenarios.mjs scripts/styleL1.mjs` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web css` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test -- --runInBand` 通过，共 453 个用例；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=purchase-receipt-add-item-inline-draft-desktop,purchase-receipt-add-item-inline-dark-desktop,purchase-receipt-add-item-inline-mobile /usr/local/bin/pnpm --dir web style:l1` 通过 3 场景；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm --dir web style:l1` 通过 1 场景；`git diff --check -- web/src/erp/pages/V1PurchaseReceiptsPage.jsx web/src/erp/pages/BOMVersionsPage.jsx web/src/erp/styles/app/business-modals.css web/src/erp/styles/app/business-responsive.css web/src/erp/styles/app/theme-overrides.css web/scripts/style-l1/purchaseReceiptAssertions.mjs web/scripts/style-l1/purchaseReceiptScenarios.mjs web/scripts/style-l1/scenarios.mjs web/scripts/styleL1.mjs` 通过。
- 下一步：若要把 BOM / 采购入库进一步改成销售订单式 `Form.List + 主单一次保存`，需要另做后端批量同步 / 删除残值 / 失败回滚合同评审；本轮只统一前端层级和 item 编辑体验。
- 阻塞/风险：本组不改 schema、migration、RBAC、菜单、SourceImportPickerModal、销售 / 采购 / 委外 / 出货保存合同、Workflow / Fact usecase、客户配置、真实客户数据、上传附件或部署。当前工作区已有大量其它会话改动，同文件中非本轮 diff 未回退、未声明为本轮成果。

## 2026-07-01 业务明细 item 视觉语法统一收口

- 完成：在不改变后端保存合同的前提下，把 BOM 和采购入库补齐到销售 / 采购订单 / 委外 / 出货已使用的底部 item footer 视觉语法。BOM 明细区头部只保留标题说明，`添加明细` 和 `已录入 N 条` 移到底部 `.erp-line-items-form__footer`；采购入库从当前操作条移出 `添加明细`，选中入库记录后显示 `入库明细` 面板，底部统一放 dashed `添加明细`、`已录入` 和 `数量合计` chips。
- 完成：继续保留业务语义差异：销售 / 采购订单 / 委外 / 出货仍是 `Form.List + 主单保存`，BOM 和采购入库仍逐行调用既有 API；本轮只统一按钮位置、统计位置、内联编辑层级、暗色 / 移动端布局和 L1 断言。
- 验证：`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/V1PurchaseReceiptsPage.jsx src/erp/pages/BOMVersionsPage.jsx scripts/style-l1/purchaseReceiptAssertions.mjs scripts/style-l1/purchaseReceiptScenarios.mjs scripts/style-l1/businessFormalScenarios.mjs scripts/style-l1/scenarios.mjs scripts/styleL1.mjs` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web css` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=purchase-receipt-add-item-inline-draft-desktop,purchase-receipt-add-item-inline-dark-desktop,purchase-receipt-add-item-inline-mobile /usr/local/bin/pnpm --dir web style:l1` 通过 3 场景；`PATH=/usr/local/bin:$PATH STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm --dir web style:l1` 通过 1 场景；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test -- --runInBand` 通过，共 453 个用例；`git diff --check -- web/src/erp/pages/V1PurchaseReceiptsPage.jsx web/src/erp/pages/BOMVersionsPage.jsx web/src/erp/styles/app/business-modals.css web/src/erp/styles/app/business-responsive.css web/src/erp/styles/app/theme-overrides.css web/scripts/style-l1/purchaseReceiptAssertions.mjs web/scripts/style-l1/purchaseReceiptScenarios.mjs web/scripts/style-l1/businessFormalScenarios.mjs web/scripts/style-l1/scenarios.mjs web/scripts/styleL1.mjs progress.md` 通过。
- 下一步：如要进一步把 item footer 抽成共享 React 组件，可单独做低风险重构；当前先复用共享 CSS 语法，不引入新的保存模型。
- 阻塞/风险：不改 schema、migration、RBAC、菜单、SourceImportPickerModal、Workflow / Fact usecase、客户配置、真实数据或部署。当前工作区有大量其它会话改动，同文件非本轮差异未回退、未声明为本轮成果。

## 2026-07-01 业务明细 footer 组件化与新增方向统一

- 完成：新增 `BusinessLineItemsFooter`，统一销售订单、采购订单、委外订单、出货、BOM、采购入库和主数据联系人明细的底部添加按钮与统计 chips 调用方式；各页面只传入 `onAdd`、按钮禁用态和统计项，不再复制 footer DOM。
- 完成：BOM 明细的内联编辑器从表格上方调整到表格下方、footer 上方；点击底部 `添加明细` 后，新编辑区固定出现在 footer 正上方，和 `Form.List` 页面新增条目方向一致。同步移除 BOM 列表“当前操作”里的外部 `添加明细` 重复入口，保留“编辑草稿 / 查看版本 -> 弹窗明细区底部添加”的主路径。
- 完成：只抽可见交互壳，不抽字段表单和保存模型；销售 / 采购订单 / 委外 / 出货仍按主单表单保存，BOM / 采购入库仍走既有逐行 API。
- 验证：`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/components/business-list/BusinessLineItemsFooter.jsx src/erp/components/sales-orders/SalesOrderForm.jsx src/erp/components/purchase-orders/PurchaseOrderForm.jsx src/erp/components/outsourcing-orders/OutsourcingOrderForm.jsx src/erp/components/shipments/ShipmentBusinessModal.jsx src/erp/components/master-data/MasterDataForm.jsx src/erp/pages/BOMVersionsPage.jsx src/erp/pages/V1PurchaseReceiptsPage.jsx` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web css` 通过；`STYLE_L1_PORT=43173 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop` 通过 1 场景；`STYLE_L1_PORT=43174 STYLE_L1_SCENARIOS=purchase-receipt-add-item-inline-draft-desktop,purchase-receipt-add-item-inline-dark-desktop,purchase-receipt-add-item-inline-mobile` 通过 3 场景；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test -- --runInBand` 通过，共 453 个用例；`git diff --check` 通过。
- 下一步：如后续还要统一导入区，可在同一组件族内继续抽 `BusinessLineItemsImportRow`；当前不扩大到来源导入弹窗、字段表单或后端批量同步合同。
- 阻塞/风险：不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、真实数据或部署。当前工作区已有其它会话改动，同文件非本轮差异未回退、未声明为本轮成果。

## 2026-07-01 本地试用闭环边界收口

- 完成：按当前 goal 复核角色、菜单、岗位任务端、客户配置控制台、销售订单字段链路、错误提示、`__dev/testing`、测试入口和文档口径的本地闭环；`multi-client-role-workflow-priority-audit --json` 继续显示本地 ready 与目标环境 evidence required 分离，未把 P5 release evidence 缺口升级为本轮主任务。修正审计脚本 JSON 输出在管道读取时被 `process.exit()` 截断的问题，改为 `process.stdout.write` 与 `process.exitCode`；补齐移动端任务列表“我的”页 `getMobileRoleLabel` import，避免角色中文标签路径被 lint 阻断。
- 验证：`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 可被 `JSON.parse` 完整读取，`releaseReady=false` 且阻断类别为 `external-release-evidence-required`；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过 15 项；角色 / 菜单 / dev / 字段链路 / 错误提示脚本测试通过 49 项；前端 adminProfileSync / action / mobile task / raw id / dev config 定向测试通过 106 项；Go 定向测试覆盖 workflow repo、JSON-RPC workflow、role/admin/customer-config/process runtime；客户配置、mobile simulated closure、operational fact simulated closure 和浏览器 smoke 脚本边界测试通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web lint`、`/usr/local/bin/pnpm --dir web css`、`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test` 通过，前端共 453 项；`STYLE_L1_SCENARIOS=mobile-tasks-dark,dev-customer-config-dark-desktop,erp-effective-session-action-projection-business-pages,sales-order-acceptance-submit-action-desktop,purchase-receipt-add-item-inline-draft-desktop` 通过 5 场景。
- 下一步：继续只按本地试用闭环推进可验证缺口；真实登录 / 浏览器 smoke 需要账号密码或输入模板，目标环境发布、真实客户导入、签收、备份恢复和回滚演练仍保持低优先级 evidence gap，不写成已完成。
- 阻塞/风险：本轮未执行生产写入、目标环境 migration、真实客户数据导入、真实账号登录、customer config publish / activate / rollback、备份恢复、回滚演练、提交或推送；当前工作区仍有大量未提交改动，包含本轮前已有改动和其它会话改动，未回退、未清理、未 stash。

## 2026-07-01 试用入口 no-write preflight 与移动端路由回归

- 完成：继续当前 goal 的试用账号 / 菜单 / 岗位任务端边界，不扩大 release evidence。生成 no-write preflight 报告：`trial-account-rbac`、`trial-demo-account-browser-smoke`、`mobile-auth-login-route-smoke`、`mobile-workflow-runtime-browser-smoke`；报告均落在 ignored `output/`，不读密码、不保存 token、不调用真实登录、不写数据库。当前真实账号 / 浏览器 smoke 前置仍缺 demo password 且默认后端 health 不可达，因此只证明前置检查和输入模板边界，不证明真实 RBAC 或真实后端 customer config active revision。
- 验证：`node scripts/qa/trial-account-rbac.mjs --preflight-report output/customers/yoyoosun/trial-account-rbac/preflight.json` 输出 `ready=false`，阻断为 `missing-trial-account-password-env` 和 `backend-health-unreachable`；`node web/scripts/trialDemoAccountBrowserSmoke.mjs --preflight-report output/trial-demo-account-browser-smoke/preflight.json` 输出 `ready=false`，阻断为 `missing-demo-password-env` 和 `backend-health-unreachable`；`node web/scripts/mobileAuthLoginRouteSmoke.mjs --preflight-report output/mobile-auth-login-route-smoke/preflight.json` 输出 no-write route plan；`node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --preflight-report output/mobile-workflow-runtime-browser-smoke/preflight.json` 输出 `ready=false`，阻断为 `missing-demo-password-env` 和 `backend-health-unreachable`；四个 `--print-input-template` 均确认模板不读密码、不调用后端、不启动浏览器、不写库；`node --test scripts/qa/trial-account-rbac.test.mjs web/scripts/trialDemoAccountBrowserSmoke.test.mjs web/scripts/mobileAuthLoginRouteSmoke.test.mjs` 通过 17 项，`node --test scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs` 通过 9 项；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web smoke:mobile-auth-login-route` 通过 9 个岗位任务端角色，覆盖 boss / sales / purchase / production / warehouse / finance / pmc / quality / engineering 的 mock 路由、登录回跳、任务 UI 和布局。
- 下一步：如果提供本地后端和临时演示密码，再跑真实 `trial-account-rbac --report`、`smoke:trial-demo-browser` 和 `smoke:mobile-workflow-runtime-browser`；否则继续保留 no-write preflight / input template，不把 mock smoke 写成真实 RBAC 证据。
- 阻塞/风险：本组不执行真实登录、不读取或记录密码、不写真实客户数据、不创建 workflow 任务、不调用 JSON-RPC、不发布 / 激活客户配置、不做生产部署或 release evidence；mock `smoke:mobile-auth-login-route` 只证明前端路由与 UI 回归，不证明真实账号、真实菜单投影或后端 RBAC。

## 2026-07-01 BOM 明细原地编辑统一

- 完成：按 `plush-page-design-governance` 把 BOM 明细从只读 Table + 操作列 + 二级编辑器改为和订单页一致的 `Form.List` 行卡片原地编辑；材料、用量、单位、损耗率、部位、备注都在同一行卡片内维护，底部 `BusinessLineItemsFooter` 添加后自动滚到新增行。
- 完成：删除 BOM 明细表格的 `操作` 列和旧 `buildBOMItemColumns`；行级动作改为订单页同款行头按钮 `复制行 / 移除行`，不再占用右侧表格列。双击 BOM 草稿打开编辑时同步选中当前记录，弹窗可编辑性不再依赖列表当前操作条的旧状态。
- 完成：保存时仍复用现有 BOM item API：新行走 `addBOMItem`，已有行走 `updateBOMItem`，移除的已保存行在主弹窗保存时走 `deleteBOMItem`；不新增后端批量接口、不改 schema / RBAC / Workflow / Fact。
- 验证：`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/BOMVersionsPage.jsx src/erp/components/bom/BOMVersionColumns.jsx src/erp/components/business-list/BusinessLineItemsFooter.jsx src/erp/components/sales-orders/SalesOrderForm.jsx src/erp/components/purchase-orders/PurchaseOrderForm.jsx src/erp/components/outsourcing-orders/OutsourcingOrderForm.jsx src/erp/components/shipments/ShipmentBusinessModal.jsx src/erp/components/master-data/MasterDataForm.jsx src/erp/pages/V1PurchaseReceiptsPage.jsx scripts/style-l1/businessFormalScenarios.mjs scripts/style-l1/orderRpcMocks.mjs scripts/style-l1/purchaseReceiptAssertions.mjs scripts/style-l1/purchaseReceiptScenarios.mjs scripts/style-l1/scenarios.mjs scripts/styleL1.mjs` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web css` 通过；`STYLE_L1_PORT=43179 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop` 通过 1 场景，断言 BOM 无操作列、新增第 4 行原地出现且字段完整可见；`STYLE_L1_PORT=43180 STYLE_L1_SCENARIOS=purchase-receipt-add-item-inline-draft-desktop,purchase-receipt-add-item-inline-dark-desktop,purchase-receipt-add-item-inline-mobile` 通过 3 场景；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test -- --runInBand` 通过，共 453 个用例；`git diff --check` 通过。
- 下一步：如还要继续统一采购入库为主单式 `Form.List + 主保存`，需要单独评审采购入库过账、库存事实和失败回滚合同；本轮只修 BOM 与订单页的可见编辑模型一致性。
- 阻塞/风险：本组不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、真实数据或部署。当前工作区还有其它会话改动，同文件非本轮差异未回退、未声明为本轮成果。

## 2026-07-01 prompt skill 工程质量门禁

- 完成：补强 `plush-prompt-governance`，要求生成实现 / 设计 / 文档 / 测试 / 部署 / review 提示词时显式包含 Engineering Quality Gate：复用优先、最小必要复杂度、主路径修复、新抽象 / helper / schema / API / 权限 / 配置 / fallback 需说明理由，收口说明复杂度控制、复用点、取舍、未覆盖路径和剩余风险。同步全局 `prompt-governance` 以及 trade、webapp-template、openai-oauth 项目 prompt skill 的同类质量门禁和 UI metadata。
- 下一步：后续用 prompt skill 生成提示词时，优先把“完美 / 顶级 / 大厂 / 可维护可扩展”落成工程质量门禁和可验证约束，而不是扩大成无边界实现。
- 阻塞/风险：本组只改 skill 文档与 UI metadata，不改 runtime、schema、RBAC、Workflow / Fact、客户配置、测试脚本、部署或真实数据；当前工作区仍有大量其它会话未提交改动，本组未回退、未清理、未声明为本轮成果。

## 2026-07-01 BOM 新建草稿明细区一致性收口

- 完成：确认上一轮只抽了共享 `BusinessLineItemsFooter`，BOM 明细行本身是页面内组件；不统一的根因是旧合同残留：新建态默认先保存 header 再维护 item，所以新建弹窗隐藏了明细区，只显示提示文案。现已把 BOM 新建草稿也接入同一套 `BOMLineItemsForm`，新建、编辑都显示 `BOM 明细`、底部 `添加明细` 和统计 chips。
- 完成：补齐新建态保存链路：新建保存时先调用 `createBOMDraft` 拿到草稿 id，再用现有 `addBOMItem` 同步表单里新增的 BOM 明细；编辑态继续用 `updateBOMDraft + add/update/deleteBOMItem`，不新增后端批量接口。
- 完成：L1 场景新增新建草稿断言：新建弹窗显示 BOM 明细，`添加明细` 后原地出现第 1 行，字段包含材料、材料用量、单位、损耗率、部位、备注，且不出现表格操作列；编辑态继续断言第 4 行原地出现且无操作列。
- 验证：`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/BOMVersionsPage.jsx scripts/style-l1/businessFormalScenarios.mjs` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web css` 通过；`STYLE_L1_PORT=43181 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop` 通过 1 场景；`STYLE_L1_PORT=43182 STYLE_L1_SCENARIOS=purchase-receipt-add-item-inline-draft-desktop,purchase-receipt-add-item-inline-dark-desktop,purchase-receipt-add-item-inline-mobile` 通过 3 场景；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test -- --runInBand` 通过，共 453 个用例；`git diff --check` 通过。
- 下一步：如要进一步把采购入库也改成主单式 `Form.List + 主保存`，需单独评审过账、库存事实和失败回滚合同；本轮只收口 BOM 新建 / 编辑弹窗一致性。
- 阻塞/风险：不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、真实数据或部署。当前工作区有其它会话改动，同文件非本轮差异未回退、未声明为本轮成果。

## 2026-07-01 BOM 明细单行布局与单滚动约束

- 完成：按页面治理要求继续收口 BOM 明细行交互。`BOMLineItemsForm` 增加约束注释：BOM 行字段较少，所有输入保持在同一行，并由 modal body 负责纵向滚动；备注从 `TextArea` 改为同排 `Input`，不再单独占一整行。
- 完成：BOM 明细 list 取消内部纵向滚动，新增行后滚动目标改为 footer，确保最后一行和底部 `添加明细` 按钮同处一个可见区域，避免明细 list 和弹窗 body 双滚动导致连续添加难操作。
- 完成：L1 断言补强：BOM 新建 / 编辑新增行后，备注与材料 / 用量 / 单位 / 损耗率 / 部位在同一行，`.erp-sales-order-lines-form__list` 的 `overflow-y` 为 `visible`，最后一行和 `添加明细` footer 同时位于 modal body 可见区域内。
- 验证：`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/BOMVersionsPage.jsx src/erp/components/business-list/BusinessLineItemsFooter.jsx scripts/style-l1/businessFormalScenarios.mjs` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web css` 通过；`STYLE_L1_PORT=43184 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop` 通过 1 场景；`STYLE_L1_PORT=43185 STYLE_L1_SCENARIOS=purchase-receipt-add-item-inline-draft-desktop,purchase-receipt-add-item-inline-dark-desktop,purchase-receipt-add-item-inline-mobile` 通过 3 场景；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test -- --runInBand` 通过，共 453 个用例；`git diff --check` 通过。
- 下一步：若订单类长字段也要收口到一行，需要单独评估销售 / 采购 / 委外 / 出货字段宽度和横向滚动合同；本轮只处理 BOM 明细字段较少但换行、双滚动不合理的问题。
- 阻塞/风险：不改 schema、migration、RBAC、菜单、Workflow / Fact usecase、客户配置、真实数据或部署。当前工作区仍有其它会话改动，同文件非本轮差异未回退、未声明为本轮成果。

## 2026-07-01 Vite 本地 HMR WebSocket 地址收口

- 完成：按 `plush-runtime-diagnostics` 分层排查本地 `localhost:5175` 控制台报错；确认当前 Vite HTTP 资源、`app.css`、`localDevThemeOrigin.mjs` 和 `customer-config.js` 均可正常 200 返回，Playwright 可复现页面主路径，失败层收敛为浏览器到 Vite HMR 的本地 WebSocket。定位到本机 `localhost` 同时解析 `::1 / 127.0.0.1`，而 Vite 进程只监听 IPv4 `*:5175`，截图中的 `ws://localhost:5175` 在部分 Chrome 会话下可能先踩 IPv6。
- 完成：在 `web/vite.shared.mjs` 中保留 dev server HTTP `host: '0.0.0.0'`，仅把 Vite `server.hmr.host` 固定为 `127.0.0.1`、`clientPort` 固定为当前 app port，避免页面主地址继续用 `localhost` 时 HMR WebSocket 走不稳定的 `localhost` 解析。
- 验证：Node 断言 `desktop` dev 配置生成 `{ host: '127.0.0.1', clientPort: 5175 }`；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec eslint --ext .mjs vite.shared.mjs` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test src/common/theme/localDevThemeOrigin.test.mjs` 实际触发当前全量 web test，453 项通过；Playwright 打开 `http://localhost:5175/` 后 HMR 实际连接 `ws://127.0.0.1:5175/?token=...`，收到 Vite 帧且无 console error / warning。
- 下一步：如果用户当前 Chrome 标签仍显示旧 `ws://localhost:5175`，刷新页面或重启 `pnpm --dir web start:desktop` 后应切到 `127.0.0.1`；若还有报错，再查 Chrome 扩展、独立代理规则或 DevTools 缓存状态。
- 阻塞/风险：本轮只改本地开发 HMR 配置，不改业务代码、后端、schema、migration、RBAC、客户配置、真实数据或部署；当前工作区已有大量其它会话改动未回退、未清理、未声明为本轮成果。

## 2026-07-01 review skill 工程质量门禁

- 完成：补强 `plush-code-review-governance`，把工程质量门禁写成 review 一等检查项：可维护性、可扩展性、复杂度预算、复用优先、主路径修复、可回归、避免局部 fallback / 重复真源 / 页面私有真源 / 宽松测试。同步强化 `agents/openai.yaml` 的 `default_prompt`，让 `$plush-code-review-governance` 在会话窗口触发时默认要求质量审查，而不只是查 bug。
- 下一步：如后续确认通用 `code-review-governance` 或 trade / webapp-template / openai-oauth 的项目 review skill 也要同口径强化，可按同一模式单独扩展；本轮先收口 plush 项目 skill。
- 阻塞/风险：本组只改 skill 文档、UI metadata 和 `progress.md`；不改 runtime、schema、RBAC、Workflow / Fact、客户配置、测试脚本、部署或真实数据。当前工作区仍有大量其它会话未提交改动，本组未回退、未清理、未声明为本轮成果。

## 2026-07-01 项目治理 skills 质量门禁同步

- 完成：按 skill 职责补齐剩余项目治理 skill 的质量门禁。`plush-docs-governance`、`plush-page-design-governance`、`plush-domain-boundary-governance`、`plush-release-governance`、`plush-test-governance` 新增短正文门禁；`docs/domain/page/release/test/runtime/observability/security/seed-import` 的 `agents/openai.yaml` 默认提示词同步加入对应质量锚点，触发 `$plush-*` 时默认关注可维护性、复用优先、主路径修复、低心智负担、发布证据、测试可信度或安全/数据边界。
- 下一步：如果要把同类质量门禁同步到全局 `~/.codex/skills` 或 trade / webapp-template / openai-oauth 的项目 skill，需要另按各仓库职责评估，避免把 plush 业务事实复制过去。
- 阻塞/风险：本组只改项目 skill 文档、UI metadata 和 `progress.md`；不改 runtime、schema、RBAC、Workflow / Fact、客户配置、测试脚本、部署或真实数据。当前工作区仍有大量其它会话未提交改动，本组未回退、未清理、未声明为本轮成果。

## 2026-07-01 宽提示词产物 review 质量收口

- 完成：按 `plush-code-review-governance` 复核最近提交和当前大工作区的高风险质量问题；修正 QA 脚本、pre-commit 和 doctor 仍依赖 PATH `pnpm` 的工具链漂移问题，新增 `scripts/lib/pnpm.sh` 按 `web/package.json packageManager` 解析项目固定 pnpm，避免 Codex runtime `pnpm 11` 误伤项目 `pnpm 10.13.1` 验收。
- 完成：把移动岗位任务端和桌面任务视图重复维护的 workflow task group 文案收口到 `workflowTaskLabels.mjs`，避免同一任务分组在多个入口出现不同业务口径；同时收紧 `BusinessLineItemsFooter` 按钮 props 覆盖顺序，调用方不能覆盖核心禁用、loading 和点击守卫。
- 完成：补上 BOM 明细同步的表头 ID 前置守卫；保存明细前必须先拿到有效 BOM 草稿编号，避免出现先删旧明细、再用无效 `bom_header_id` 增改明细的半同步风险。
- 验证：`bash -n scripts/lib/pnpm.sh scripts/qa/fast.sh scripts/qa/full.sh scripts/qa/strict.sh scripts/git-hooks/pre-commit.sh scripts/doctor.sh` 通过；`node --test web/src/erp/mobile/utils/mobileRoleTaskModel.test.mjs web/src/erp/utils/mobileTaskView.test.mjs web/src/erp/utils/userVisibleTechnicalFields.test.mjs web/src/erp/utils/businessLineItems.test.mjs web/src/common/utils/errorMessage.test.mjs` 通过 53 项；`git diff --check` 通过；`bash scripts/qa/fast.sh` 完整通过。
- 下一步：如继续清理剩余大工作区，优先按业务闭环分组提交或复核，不建议把所有无关文件一次性混成一个质量修复提交。
- 阻塞/风险：本轮未执行 `qa:full`、`qa:strict`、浏览器真实页面 L1/L2/L3 或生产 / 客户环境验证；当前工作区仍包含大量本轮前已有改动和其它路径差异，本轮未回退、未 stash、未提交、未推送，也不声明这些非本轮差异已逐项 review 完成。

## 2026-07-01 958dc082 起点 review 边界收口

- 完成：按用户要求把 review 起点扩展到 `958dc082 feat: 收口客户配置与流程运行时` 的父提交，范围按 `958dc082^..HEAD` 加当前工作区继续复核；重点检查 Workflow / Fact 边界、客户配置真源、模块开关、权限解释和宽提示词引入的局部 fallback。
- 完成：修正 `workflowTaskActionAccess` 的前端权限解释边界。只要后端权限解释请求失败，或后端返回了部分动作但漏掉某个动作，前端不再回退到本地 fallback 放行动作，而是 fail-closed 禁用并给出刷新重试提示，避免页面在后端解释不完整时继续允许完成、催办或阻塞。
- 完成：修正流程运行时联动任务负责人解析的客户边界。`CreateLinkedWorkflowTask` 现在从流程实例 `ModuleContractSnapshot.customer_key` 读取客户 key 并传给客户配置解析器；旧实例缺失该字段时仍按空值兼容默认客户，不新增客户体系或多租户分支。
- 验证：`node --test web/src/erp/utils/workflowTaskActionAccess.test.mjs` 通过 6 项；`go test ./internal/biz -run 'TestProcessRuntimeUsecaseCreateLinkedWorkflowTask|TestProcessRuntimeUsecaseStartProcessInstanceActivatesFirstWaitingApprovalNode'` 通过；`go test ./internal/biz ./internal/service -run 'CustomerConfig|ProcessRuntime|FinishedGoods|MaterialSupply|SalesOrderProcess|ShipmentProcess|FinanceProcess|QualityInspectionProcess|InventoryProcess'` 通过；`git diff --check` 通过；`bash scripts/qa/fast.sh` 完整通过。
- 下一步：如果继续深挖同一大提交，优先按剩余高风险面逐组复核：客户配置发布 / 激活 / 回滚脚本、试用 seed 与客户包 lint、移动岗位任务端真实运行时、浏览器 L1/L2 样式回归。
- 阻塞/风险：本轮不是对 453 个差异文件逐行完成全量审计；未执行 `qa:full`、`qa:strict`、完整 `style:l1`、生产 / 客户环境验证或提交推送。当前工作区仍有大量本轮前已有改动，本轮未回退、未 stash、未声明所有非本轮差异已完成质量验收。

## 2026-07-01 BOM 与采购订单明细区共享组件收口

- 完成：确认 BOM 与采购订单此前并不是同一个明细区组件。采购订单使用完整 `erp-sales-order-lines-form` 段落、统一 list 滚动和 footer；BOM 只复用了部分 class 和 `BusinessLineItemsFooter`，外层仍套 `erp-master-contact-list`，并有 BOM 私有 list/grid 覆盖，所以视觉、按钮位置、统计位置和滚动行为继续漂移。
- 完成：新增 `BusinessLineItemsSection` 作为共享明细区外壳，统一标题/说明、空态、整体 list、行容器和 footer 接入；采购订单与 BOM 都改为调用该组件。字段、校验、导入和保存转换仍留在各自业务表单内，避免把采购/BOM 不同合同硬塞进一个配置化大组件。
- 完成：BOM 删除联系人列表样式包装、删除 BOM 私有 grid/list 覆盖、按钮文案统一为 `添加条目`，移除行内 `已保存/新增` 标签和确认弹层，行操作视觉与采购订单一致；新增行时同时请求新行和 footer 滚动，保留原有保存时 add/update/delete BOM item 同步合同。
- 完成：L1 断言改为检查 BOM 使用共享明细区外壳、无表格操作列、footer 按钮为 `添加条目`、list 拥有滚动、行 grid 不拥有私有滚动、材料/用量/单位/损耗率/部位/备注在同一行。
- 验证：`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/BOMVersionsPage.jsx src/erp/components/purchase-orders/PurchaseOrderForm.jsx src/erp/components/business-list/BusinessLineItemsSection.jsx scripts/style-l1/businessFormalScenarios.mjs scripts/style-l1/scenarios.mjs` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web css` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test -- --runInBand` 通过，共 453 个用例。
- 下一步：如要继续把销售、委外、出货、主数据联系人也迁到 `BusinessLineItemsSection`，应按各自字段和来源导入合同分批做；本轮先收口用户明确指出的采购订单与 BOM 不一致。
- 阻塞/风险：`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop` 和 `purchase-order-date-filter-desktop` 均尝试执行，但当前已有本项目 Vite 占用 `5175`，临时 L1 端口页面的 HMR client 仍连接 `ws://127.0.0.1:5175` 并收到 400，导致页面在进入业务表头等待阶段抖动失败；本轮未直接 kill 用户可能正在使用的 `5175` 进程。未改 schema、migration、RBAC、菜单、Workflow / Fact、客户配置、真实数据或部署。

## 2026-07-01 附件面板选择按钮文案统一

- 完成：确认 BOM 新建和编辑弹窗使用的是同一个 `BusinessAttachmentPanel`，不一致来自共享状态 helper：无 owner 的新建态显示 `选择附件`，已有 owner 的编辑态显示 `上传`。已在 `resolveBusinessAttachmentPanelState` 统一按钮文案为 `选择附件`，因为按钮的直接动作始终是打开文件选择器；“保存后上传”与“立即绑定”的差异继续通过说明、空态和待上传标签表达。
- 完成：更新 `businessAttachmentPanelState.test.mjs`，锁住新建态、页面级缺 owner 禁用态、已有 owner 编辑态都使用同一按钮文案；更新 BOM L1 断言，要求新建和编辑弹窗的 `BOM 附件` 面板按钮都为 `选择附件`。
- 验证：`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx --ext .mjs src/erp/utils/businessAttachmentPanelState.mjs src/erp/utils/businessAttachmentPanelState.test.mjs scripts/style-l1/businessFormalScenarios.mjs src/erp/components/business-list/BusinessAttachmentPanel.jsx` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web css` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web test src/erp/utils/businessAttachmentPanelState.test.mjs` 实际触发当前 web test，453 项通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web build:desktop` 通过。
- 下一步：如果后续要统一附件面板说明文案，也应继续在 `businessAttachmentPanelState` 里收口，不在 BOM、采购、销售等页面分别传不同按钮文案。
- 阻塞/风险：本轮未重新执行浏览器 `style:l1`，沿用上一轮已确认的本地阻塞：当前已有本项目 Vite 占用 `5175`，临时 L1 端口页面 HMR 会连接 `ws://127.0.0.1:5175` 并影响业务页等待；未直接 kill 用户可能正在使用的 5175 进程。未改 schema、migration、RBAC、菜单、Workflow / Fact、客户配置、真实数据或部署。

## 2026-07-01 BOM 明细备注多行输入

- 完成：按采购订单明细区的备注模式，把 BOM 明细备注从单行 `Input` 改为 `Input.TextArea`，保留 `showCount` 和 300 字限制，并使用 `autoSize={{ minRows: 1, maxRows: 3 }}`；备注仍作为横向明细行的一列，不恢复为独占整行。
- 完成：补强 `business-formal-module-shells-desktop` 的 BOM 新建 / 编辑明细断言，要求备注字段实际渲染为 textarea，同时继续校验字段标签同一行、无操作列、footer 添加条目按钮可见和新增行可见。
- 验证：`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web exec eslint --ext .js --ext .jsx --ext .mjs src/erp/pages/BOMVersionsPage.jsx scripts/style-l1/businessFormalScenarios.mjs` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web css` 通过；`PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web build:desktop` 通过；`PATH=/usr/local/bin:$PATH STYLE_L1_PORT=43196 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm --dir web style:l1` 已尝试，失败在前置 `business-v1-suppliers` 焦点回归断言，未进入本轮 BOM 备注断言。
- 下一步：若要把销售、委外、出货等其它明细备注也统一到同一套 `TextArea autoSize` 约束，应按各业务表单逐个核对最大长度、导入字段和横向滚动合同后分批处理。
- 阻塞/风险：本轮浏览器 `style:l1` 未通过，当前阻塞点是同一大场景前置供应商弹窗关闭后的焦点回归，不是 BOM 明细备注断言；未在本轮扩大修复供应商焦点问题。未改 schema、migration、RBAC、菜单、Workflow / Fact、客户配置、真实数据或部署。

## 2026-07-01 governance skills 结构质量门禁

- 完成：按“恰到好处，不要太重太轻”的口径，补强 `plush-*` 治理 skills 的结构质量检查。`code-review/docs/domain/page/prompt/release/test/runtime/observability/security/seed-import` 均明确模块化、高内聚、低耦合、单一职责；页面、文档、测试、发布、运行时、可观测性、安全和导入各用对应场景措辞，不把通用架构口号机械复制。
- 完成：同步 `agents/openai.yaml` 默认提示词，触发 `$plush-*` 时 UI prompt 会明确把工程/页面/文档/发布/测试质量门禁扩展为“含模块化、高内聚、低耦合、单一职责”。
- 验证：追加前 `progress.md` 为 207 行、49707 字节，未达到归档阈值；Ruby YAML 解析通过 88 个 `agents/openai.yaml`；结构/frontmatter 扫描通过 54 个目标 skill；`quick_validate.py` 仍因当前 Python 环境缺 `yaml`/PyYAML 失败，已按依赖缺口记录。
- 下一步：后续如果继续扩展 skill，应优先保持短门禁 + 项目事实，不把每个 skill 写成完整架构手册。
- 阻塞/风险：本组只改 skill 文档、UI metadata 和过程记录；不改 runtime、schema、RBAC、Workflow / Fact、客户配置、测试脚本、部署或真实数据。当前工作区已有其它会话改动，本组未回退、未清理、未声明为本轮成果。

## 2026-07-01 governance skills 边界清晰与合理严谨门禁

- 完成：在 `plush-*` 项目治理 skills 的结构质量检查中补入一条短门禁：边界清晰、合理严谨；要求说明本轮管什么、不管什么、依赖哪个真源，以及为什么当前拆分、抽象和验证足够但不过度。
- 完成：同步 `agents/openai.yaml` 默认提示词，让 `$plush-*` 的质量门禁显式包含边界清晰、合理严谨、模块化、高内聚、低耦合、单一职责。
- 下一步：后续 skill 继续保持短约束，不把“合理严谨”扩成额外流程或长清单。
- 阻塞/风险：追加前 `progress.md` 为 215 行、51108 字节，未达到归档阈值。本组只改 skill 文档、UI metadata 和过程记录；不改 runtime、schema、RBAC、Workflow / Fact、客户配置、测试脚本、部署或真实数据。

## 2026-07-01 全工作区提交推送收口

- 完成：按 `$git-closeout-coordination` 接管 full-worktree closeout；先 fetch 确认 `main` 相对 `origin/main` 只本地 ahead、无远端落后或分叉，再冻结当前全工作区改动范围。
- 完成：修正 `style:l1` 在临时端口运行时仍把 HMR clientPort 指向桌面开发端口的问题，`style:l1` 传入 `ERP_VITE_HMR_CLIENT_PORT`，Vite 共享配置仅在该环境变量存在时覆盖 HMR clientPort；同时把本地临时 dev-server 的 `ERR_ADDRESS_INVALID` 资源加载噪声纳入忽略范围，避免误判为页面运行时错误。
- 完成：修正 BOM 明细 L1 真实布局失败。BOM 明细继续复用共享明细区外壳，但在 `.erp-bom-modal-items` 作用域下压缩材料、数量、损耗、部位和备注列宽，并把新增行限制在 modal body 宽度内，保持同一行字段展示且不把 footer 顶出可见区域。
- 验证：`gofmt`、`git diff --check` 通过；`PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH scripts/qa/fast.sh` 通过；`PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH /usr/local/bin/pnpm --dir web test` 通过 453 项；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm --dir web style:l1` 通过；`/usr/local/bin/pnpm --dir web style:l1` 全量通过 76 个场景。
- 下一步：进入 `git add -A`、提交和 SSH push；push 前后继续 fetch/status/rev-list 校验远端同步状态。
- 阻塞/风险：本轮收口的是当前全工作区，包含多组此前已有改动；未使用 stash、未创建分支、未回退用户改动。`web/src/common/consts/errorCodes.generated.js` 在 Node 24 下仍有 module type warning，但当前测试和 L1 均未阻断。
