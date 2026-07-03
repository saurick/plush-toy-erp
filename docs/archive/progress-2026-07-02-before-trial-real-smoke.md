# progress 2026-07-02 trial real smoke 前归档

本文件归档自 `progress.md`。归档内容只用于追溯历史过程，不作为当前正式需求、runtime、schema、migration、API、UI、部署或产品路线真源。当前状态仍以仓库正式文档、代码和测试为准。

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

## 2026-07-01 本地全量 QA 与 pgx 可达漏洞收口

- 完成：确认上一轮 `business-formal-module-shells-desktop` 阻断已由当前工作区记录和本轮状态复核覆盖，未继续扩大 release evidence；`multi-client-role-workflow-priority-audit` 仍为本地 ready、目标环境 evidence-required。随后执行本地 `qa:full`，并把其中 `govulncheck` 提示的可达 `github.com/jackc/pgx/v5` 漏洞从 `v5.8.0` 升级到修复版 `v5.9.2`。
- 验证：`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 通过，本地 69/69 ready，`releaseReady=false` 仅保留目标环境证据缺口；`PATH="/usr/local/bin:$PATH" bash scripts/qa/full.sh` 通过；升级后 `cd server && go test ./...` 通过；`env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u http_proxy -u https_proxy -u all_proxy bash scripts/qa/govulncheck.sh` 通过，当前代码可达漏洞为 0。
- 下一步：如继续推进本地闭环，优先按用户目标选择真实账号 / 浏览器 smoke 的 no-write preflight 或下一个本地可复现页面阻断；目标环境 release evidence、真实客户导入、签收、备份恢复和回滚演练仍只保留受控入口与缺口说明。
- 阻塞/风险：本轮没有真实登录密码、未执行真实浏览器登录 smoke、未部署目标环境、未导入真实客户数据、未提交或推送。`go get` 首次因当前 shell 指向失效本机代理 `127.0.0.1:7897` 失败，随后仅对单次命令清空代理环境变量完成依赖下载，未切换系统代理、节点或订阅线路。`govulncheck` 仍提示依赖树存在不可达漏洞，当前代码不受其影响。

## 2026-07-01 ProcessRuntime 启动幂等本地阻断收口

- 完成：复核 `business-formal-module-shells-desktop` 后确认供应商弹窗焦点和 BOM 明细备注 TextArea 断言当前已通过；随后处理现场新增的 ProcessRuntime 本地阻断。当前流程实例按 `process_key + business_ref_type + business_ref_id` 建唯一索引，同业务引用 + 同 idempotency 重试返回已有实例和节点，不同 idempotency 仍拒绝；`StartProcessInstance` 对已 active 首节点按幂等返回处理，blocked 首节点仍冲突。只补测试 stub clone 和 blocked 冲突断言，未改 Workflow / Fact 自动落账边界。
- 验证：`PATH=/usr/local/bin:$PATH STYLE_L1_PORT=43210 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop /usr/local/bin/pnpm --dir web style:l1` 通过 1 个场景；`make data` 通过且 Atlas 显示 migration 目录已同步；`go test ./internal/biz ./internal/data ./internal/service -run 'ProcessRuntime|ProcessInstance|CustomerConfigJSONRPCStartSalesOrderAcceptanceProcess'` 通过；`go test ./internal/biz ./internal/data ./internal/service` 通过；`make migrate_status` 只读检查显示本地开发库 pending `20260701152057`。
- 下一步：若继续该 ProcessRuntime 切片，应先决定是否对本地开发库执行 `make migrate_apply` 并做迁移后回归；若不碰数据库，下一轮优先回到真实账号 / 浏览器 smoke 的 no-write preflight 或下一个本地页面阻断。
- 阻塞/风险：本轮不执行本地或目标库 migration apply，不做生产部署、真实客户导入、release evidence、备份恢复、回滚演练、提交或推送。执行过程中工作区出现 release evidence 相关并发改动，本轮未扩大、未验证、未声明为本轮成果。

## 2026-07-01 永绅前端预览端口自动顺延

- 完成：`web/scripts/previewYoyoosun.mjs` 改为从请求端口开始探测可用端口，默认从 `5176` 起，遇占用自动顺延并在终端输出实际 `url=http://localhost:<port>/erp`。同步更新 `web/README.md` 和 `web/scripts/README.md`，明确该脚本只做永绅前端静态包预览，不 publish / activate 后端 customer config。
- 验证：`node --check web/scripts/previewYoyoosun.mjs` 通过；当前本机 `5176` 被其它服务占用时，`PATH=/usr/local/bin:$PATH pnpm --dir web preview:yoyoosun --print-plan` 输出 `requested port 5176 is occupied; using 5177`；`git diff --check -- web/scripts/previewYoyoosun.mjs web/README.md web/scripts/README.md` 通过。
- 下一步：日常本地直接执行 `pnpm preview:yoyoosun`，按终端输出 URL 打开；若需要后端 yoyoosun effective session，则仍走 `/__dev/customer-config` 的受控 validate / publish / activate。
- 阻塞/风险：本轮不启动长驻预览服务、不执行完整 build、不改后端、schema、migration、RBAC、customer_config 控制面、真实客户数据或部署；只验证端口选择和计划输出。

## 2026-07-01 永绅前端热更新开发入口

- 完成：新增 `pnpm start:yoyoosun`，通过 `web/scripts/startYoyoosunDev.mjs` 自动从 `5176` 起选择可用端口，启动 Vite dev server 并保留 HMR。新增 `web/devCustomerConfigPlugin.mjs`，在开发态按 `ERP_DEV_CUSTOMER_KEY=yoyoosun` 从 `config/customers/yoyoosun/customer-config.example.js` 和 `assets/` 提供 `/customer-config.js` 与 `/customer-assets/yoyoosun/*`；抽出 `web/scripts/localPort.mjs` 复用端口探测逻辑。`preview:yoyoosun` 保持生产包预览语义，只复用端口工具。同步更新 `web/README.md` 和 `web/scripts/README.md` 区分热更新开发态与静态包预览。
- 验证：`node --check web/scripts/localPort.mjs && node --check web/devCustomerConfigPlugin.mjs && node --check web/scripts/startYoyoosunDev.mjs && node --check web/scripts/previewYoyoosun.mjs && node --check web/vite.shared.mjs` 通过；`web/package.json` JSON 解析通过；`PATH=/usr/local/bin:$PATH pnpm --dir web start:yoyoosun --print-plan` 在本机 `5176 / 5177` 占用时顺延到 `5178` 并输出 HMR dev URL；短暂启动 `PATH=/usr/local/bin:$PATH pnpm --dir web start:yoyoosun` 后，`curl http://127.0.0.1:5178/customer-config.js` 返回 `customerKey: "yoyoosun"`，`curl http://127.0.0.1:5178/customer-assets/yoyoosun/favicon-yoyoosun.svg` 返回永绅 favicon，`curl http://127.0.0.1:5178/erp` 返回 Vite HMR HTML；验证后已 Ctrl-C 停止临时服务；`git diff --check -- web/scripts/localPort.mjs web/devCustomerConfigPlugin.mjs web/scripts/startYoyoosunDev.mjs web/scripts/previewYoyoosun.mjs web/vite.shared.mjs web/package.json web/README.md web/scripts/README.md` 通过。
- 下一步：本地调试永绅外观和菜单展示使用 `pnpm start:yoyoosun`；验证生产静态包仍使用 `pnpm preview:yoyoosun`；后端 effective session 仍需通过 `/__dev/customer-config` 受控 validate / publish / activate。
- 阻塞/风险：本轮只改前端本地 dev server 配置注入和脚本，不改后端、schema、migration、RBAC、customer_config 控制面、真实客户数据、部署或 release evidence；未跑完整 `build:all`、前端全量测试或浏览器 L1。

## 2026-07-01 958dc082 大提交 review 修复收口

- 完成：确认最近两天的大提交为 `958dc082 feat: 收口客户配置与流程运行时`，规模为 375 个文件、137661 行新增、28108 行删除；review 范围按 `958dc082^..HEAD` 加当前工作区继续复核。
- 完成：修复 ProcessRuntime 启动幂等合同。流程实例现在按 `process_key + business_ref_type + business_ref_id` 建唯一约束；同业务引用 + 同 idempotency 重试返回已有实例和节点；同业务引用 + 不同 idempotency 拒绝，避免前端重试或换 key 造成重复流程实例。`StartProcessInstance` 对已 active 的首节点按幂等返回处理，不再把成功后的网络重试误报为“流程实例已存在”。
- 完成：修正 release manifest evidence 的本机路径和审批口径。生成脚本输出 repo-relative 路径，并拒绝 repo 外路径；仍含草稿 release/smoke/signoff 证据的目录保持 `reviewStatus=draft`，不再把未完成发布证据标成 approved。
- 完成：同步 `server/README.md`、`docs/当前真源与交接顺序.md`、`deployments/yoyoosun/evidence/**/README.md`，把 ProcessRuntime 幂等真源和 release evidence 路径 / 审批边界写回正式口径。
- 验证：`PATH="/usr/local/bin:$PATH" make data` 通过并生成 migration；`go test ./internal/biz ./internal/data ./internal/service -count=1` 通过；`node --test scripts/deploy/customer-config-manifest-evidence.test.mjs scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/release-evidence-gate.test.mjs` 通过 67 项；`node --test scripts/qa/docs-inventory.test.mjs scripts/qa/workflow-fact-boundary.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs` 通过 16 项；`node --test web/src/erp/utils/workflowTaskActionAccess.test.mjs` 通过 6 项；`git diff --check` 通过。
- 下一步：若继续深挖该大提交，优先看移动岗位任务端真实浏览器流、客户配置发布 / 激活 / 回滚的目标环境 evidence、以及本地数据库应用 `20260701152057` migration 后的回归。
- 阻塞/风险：本轮不执行本地或目标库 `migrate_apply`，不做生产部署、真实客户导入、备份恢复、回滚演练、提交或推送。若已有环境在历史上已经写入同一业务引用的重复流程实例，应用新增唯一索引前需要先清理重复数据；当前只完成代码、migration 和测试层收口。

## 2026-07-01 priority audit ProcessRuntime 锚点收口

- 完成：按当前 ProcessRuntime 幂等合同同步 `multi-client-role-workflow-priority-audit` 静态证据锚点。最小运行时检查改为识别 `TestProcessRuntimeRepoReturnsExistingProcessForSameIdempotency`；启动首节点检查改为识别 blocked 首节点冲突测试。该改动只修正本地 priority audit 的证据漂移，不改变运行时代码、Workflow / Fact 边界或 release evidence。
- 验证：`node --check scripts/qa/multi-client-role-workflow-priority-audit.mjs` 通过；`node scripts/qa/multi-client-role-workflow-priority-audit.mjs --json` 通过，`ok=true`、无 failed checks / failed coverage，`releaseReady=false` 仍保留目标环境证据缺口；`node --test scripts/qa/multi-client-role-workflow-priority-audit.test.mjs` 通过 15 项；`go test ./internal/biz ./internal/data ./internal/service -run 'ProcessRuntime|ProcessInstance|CustomerConfigJSONRPCStartSalesOrderAcceptanceProcess'` 通过；`git diff --check -- scripts/qa/multi-client-role-workflow-priority-audit.mjs` 通过。
- 下一步：继续本地闭环时，优先在“不写生产、不扩 release evidence”的前提下看真实账号 / 浏览器 smoke 的 no-write preflight、移动岗位任务端真实体验或本地开发库是否执行 `20260701152057` migration apply 后回归。
- 阻塞/风险：本轮不执行本地或目标库 migration apply，不做生产部署、真实客户导入、备份恢复、回滚演练、release sign-off、提交或推送；`releaseReady=false` 是目标环境证据缺口，不是本轮本地阻断。工作区仍有多组既有未提交改动，本轮只新增 audit 脚本锚点和本条进度记录。

## 2026-07-01 客户差异侵入 Product Core 守卫

- 完成：在 `scripts/qa/customer-config-boundaries.mjs` 增加后端 Product Core 运行时代码扫描，覆盖 `server/internal/biz`、`server/internal/core`、`server/internal/data`、`server/internal/service` 的非测试 Go 文件，并排除 Ent 生成物和 migration；除当前单客户私有化默认锚点 `DefaultCustomerKey = "yoyoosun"` 外，禁止后端运行时代码出现 `yoyoosun`、`永绅` 或直接引用 `config/customers/`，避免客户规则侵入通用 usecase / repo / JSON-RPC 主路径。
- 完成：同步 `scripts/README.md`，把 `customer-config-boundaries` 的职责从只查客户配置草案扩展为同时守住后端 Product Core 客户差异边界。
- 验证：`node --check scripts/qa/customer-config-boundaries.mjs` 通过；`node scripts/qa/customer-config-boundaries.mjs` 通过，扫描后端运行时 Go 文件 204 个；`node scripts/qa/customer-package-lint.mjs --customer yoyoosun` 通过；`go test ./internal/biz ./internal/data ./internal/service -run 'TestProcessRuntimeUsecaseStartProcessInstanceReturnsActiveFirstNode|TestProcessRuntimeRepoReturnsExistingProcessForSameIdempotency|TestCustomerConfigJSONRPCStartSalesOrderAcceptanceProcess'` 通过；`git diff --check` 通过。
- 下一步：如果后续新增客户包或客户差异 runtime，应继续先落在 `config/customers/<customer-key>`、manifest 编译、受控后端 `customer_config` 投影和正式 release evidence；需要进入 Product Core 的规则必须单独评审并补对应 usecase / repo / API / RBAC / 测试。
- 阻塞/风险：本轮不重构现有客户配置架构，不执行本地或目标库 migration apply，不做生产部署、真实客户导入、备份恢复、回滚演练、提交或推送。当前工作区仍有多组既有未提交改动，本条只声明本轮新增守卫、脚本文档和过程记录。

## 2026-07-01 manifest evidence 显式审批状态收口

- 完成：第二轮 review 发现 `customer-config-manifest-evidence.mjs` 虽然已输出仓库相对路径，但仍默认写 `reviewStatus=approved`，后续重跑脚本会把草稿目录重新误生成 approved。已改为默认 `draft`，只有显式传 `--review-status approved` 才生成可通过 activation gate 的审查状态。
- 完成：同步 `scripts/README.md`、`deployments/yoyoosun/evidence/README.md`、`deployments/yoyoosun/evidence/releases/README.md` 的命令示例和边界说明，明确默认 draft、人工 review 后才写 approved。
- 验证：`node --test scripts/deploy/customer-config-manifest-evidence.test.mjs scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/release-evidence-gate.test.mjs` 通过 68 项，覆盖默认 draft 不通过 activation gate、显式 approved 可通过；`node --test scripts/qa/docs-inventory.test.mjs` 通过；`git diff --check` 通过。
- 下一步：继续 review 该大提交时，优先对目标环境 evidence closeout runner、release status next command 和客户配置实际 smoke 读回链路做同类“是否默认误批准 / 是否证据只读”的收口检查。
- 阻塞/风险：本轮不执行真实 release、activation、rollback、smoke 或目标环境写入；只收口 manifest evidence 生成与本地门禁测试。

## 2026-07-01 release report 路径脱敏收口

- 完成：继续沿 manifest evidence 同类风险复核，发现 `customer-config-release-execute.mjs` 的 release report JSON / Markdown 会把 `manifest` 写成本机绝对路径，`customer-config-release-readiness.mjs` 聚合结果也返回绝对 manifest 路径。已改为只输出仓库相对路径，绝对路径仅用于本地读文件和计算 hash。
- 完成：补测试锁住 release execute report JSON、Markdown 和 release readiness 返回对象的 `manifest` 字段均为 `output/customers/yoyoosun/customer-config-runtime-manifest.json`，不包含临时 repo root 或本机路径。
- 验证：`node --test scripts/deploy/customer-config-release-execute.test.mjs scripts/deploy/customer-config-release-readiness.test.mjs scripts/deploy/customer-config-manifest-evidence.test.mjs scripts/deploy/customer-config-activation-gate.test.mjs scripts/deploy/release-evidence-gate.test.mjs` 通过 112 项；`git diff --check` 通过。
- 下一步：继续 review release evidence 相关脚本时，应按“证据文件只保存 repo-relative / alias / hash，不保存本机绝对路径、完整 URL 凭据或原始客户文件路径”的口径扫描其它 generator。
- 阻塞/风险：本轮不重新生成 output 目录里的历史 release report，不执行真实发布或目标环境验证；只修脚本后续生成口径和测试。

## 2026-07-01 yoyoosun dev customer key 路径边界收口

- 完成：review 当前工作区并发出现的 `start:yoyoosun` / dev middleware 改动，发现 `ERP_DEV_CUSTOMER_KEY`、`--customer` 会直接参与 `config/customers/<key>` 路径拼接。已新增 `normalizeDevCustomerKey`，只允许稳定 customer key 字符集，并在 `devCustomerConfigPlugin`、`previewYoyoosun`、`startYoyoosunDev` 三个入口复用，阻止 `../` 或 `customers/yoyoosun` 这类路径式 key。
- 完成：新增 `web/devCustomerConfigPlugin.test.mjs`，覆盖合法 key、路径逃逸 key 和中文客户名误用。该修复只影响 dev-only 前端静态客户配置注入，不改变后端 `customer_config` revision、RBAC、Workflow / Fact 或真实发布链路。
- 验证：`node --test web/devCustomerConfigPlugin.test.mjs` 通过 2 项；`node --check web/devCustomerConfigPlugin.mjs web/devCustomerConfigPlugin.test.mjs web/scripts/previewYoyoosun.mjs web/scripts/startYoyoosunDev.mjs web/scripts/localPort.mjs` 等价语法检查通过；`node web/scripts/previewYoyoosun.mjs --customer ../x --print-plan` 和 `node web/scripts/startYoyoosunDev.mjs --customer customers/yoyoosun --print-plan` 均按预期拒绝非法 key。
- 下一步：如果继续收口 dev-server 改动，应再跑实际 `pnpm start:yoyoosun --print-plan` / `pnpm preview:yoyoosun --print-plan` 的正常路径和必要的 Vite config 测试。
- 阻塞/风险：本轮不启动长驻 Vite、不构建生产包、不执行浏览器回归、不激活后端客户配置；只修 dev-only 路径边界和最小单测。

## 2026-07-01 web package scripts 治理

- 完成：按当前 README、hooks、Dockerfile、web scripts README 和维护中 docs 扫描 `web/package.json` scripts 引用，保留构建 / 启动 / QA / smoke / yoyoosun 入口，删除当前维护面无引用且容易形成重复入口的 `preview`、`playwright:install` 和 `report:field-linkage:erp`。字段联动报告继续以仓库根入口 `node scripts/qa/erp-field-linkage.mjs` 为真源，不再从 web package 包一层。
- 验证：`node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('web/package.json','utf8')); console.log('web package json ok')"` 通过；`rg -n "playwright:install|report:field-linkage:erp|pnpm preview(\\s|$)|pnpm --dir web preview(\\s|$)|npm run preview(\\s|$)|yarn preview(\\s|$)" . -g '!node_modules' -g '!web/node_modules' -g '!docs/archive/**' -g '!docs/reference/**' -g '!progress.md' -g '!web/pnpm-lock.yaml'` 无命中；`git diff --check -- web/package.json progress.md` 通过。
- 下一步：若后续要继续收口脚本数量，优先评审多端口岗位任务端构建 / 启动矩阵是否仍需要作为本地调试入口，而不是直接删除已登记角色命令。
- 阻塞/风险：本轮只改 `web/package.json` 脚本清单和过程记录，不改前端运行时代码、后端、schema、migration、RBAC、Dockerfile、部署、真实登录 smoke 或字段联动报告生成脚本。

## 2026-07-01 mobile 独立静态构建退出

- 完成：确认 `/m/<role>/tasks` 岗位任务端仍是当前正式运行时，`start:mobile:*` 仍作为本地按角色多端口调试入口保留；退出的是旧 `build:mobile:*` 独立静态产物路径。`web/package.json` 的 `build:all` 收窄为 `gen:error-codes + build:desktop`，`serveStaticApp.mjs` 只接受 `APP_ID=desktop`，`web/Dockerfile` 只暴露 5175，并同步 `web/README.md`、`web/scripts/README.md` 的构建说明。
- 验证：`PATH=/usr/local/bin:$PATH pnpm --dir web build:all` 通过，产物仍包含 `MobileRoleTasksPage` chunk；临时 `APP_ID=desktop PORT=5288 STATIC_ROOT=web/build node web/scripts/serveStaticApp.mjs` 后，`curl -i http://127.0.0.1:5288/healthz` 返回 200，`curl -I http://127.0.0.1:5288/m/warehouse/tasks` 返回 200；`APP_ID=mobile-boss ... node web/scripts/serveStaticApp.mjs` 按预期拒绝；`node --check web/scripts/serveStaticApp.mjs && node --check web/scripts/previewYoyoosun.mjs` 通过；当前维护面扫描旧 `build:mobile` / `APP_ID=mobile` / 旧端口只剩明确禁止或退出说明；`git diff --check` 通过。
- 下一步：若后续要进一步简化本地调试，可单独评审是否删除 `start:mobile:*` 和 `vite.mobile-*.config.mjs`；本轮不动，因为 README、appRegistry、试用角色文档测试和本地调试仍登记这些入口。
- 阻塞/风险：本轮不删除 `src/erp/mobile`、不删除 `/m/<role>/tasks`、不删除 mobile smoke / style:l1 场景、不改后端 RBAC 或 customer config；没有跑完整 `pnpm test` / `style:l1`，本轮用构建 + 静态服务 HTTP 回归覆盖构建脚本和生产静态入口风险。

## 2026-07-01 scripts 子目录 README 路由补齐

- 完成：按 `plush-docs-governance` 文档治理口径补齐 `scripts/qa/README.md`、`scripts/deploy/README.md`、`scripts/import/README.md` 三个薄路由 README，并在 `scripts/README.md` 增加子目录入口表。同步更新 `docs/文档清单.md`，把三个新增长期维护 Markdown 登记到脚本说明清单。
- 验证：追加前检查 `progress.md` 为 322 行、74156 bytes，未达到 600 行或 80KB 归档阈值；`node scripts/qa/docs-inventory.test.mjs` 通过，扫描 254 个 Markdown；`git diff --check -- scripts/README.md scripts/qa/README.md scripts/deploy/README.md scripts/import/README.md docs/文档清单.md` 通过。
- 下一步：后续继续治理脚本说明时，优先把 `scripts/README.md` 进一步收缩为仓库级路由和推荐顺序，把 deploy / import / qa 的细节逐步迁入对应子目录 README，避免重复命令真源。
- 阻塞/风险：本轮只改文档，不改运行时代码、脚本行为、部署流程、导入执行、RBAC、schema、migration 或 release evidence；当前工作区仍有多组既有未提交改动，本条只声明新增 README、索引和过程记录。

## 2026-07-01 start:desktop 别名退出

- 完成：删除 `web/package.json` 中与 `start` 完全重复的 `start:desktop`，桌面开发入口统一为 `pnpm start`；同步 `README.md`、`web/README.md`、`web/src/erp/config/appRegistry.mjs` 和 `web/scripts/startYoyoosunDev.mjs`，`start:yoyoosun --print-plan` 也输出 `pnpm start`。
- 验证：`rg -n "start:desktop|pnpm start(\\s|$)|pnpm --dir web start(\\s|$)" ...` 确认当前维护面只剩 README 的 `pnpm start`；`node -e` 确认 `scripts.start` 存在且 `scripts["start:desktop"]` 不存在；`node --check web/scripts/startYoyoosunDev.mjs && node --check web/src/erp/config/appRegistry.mjs` 通过；`PATH=/usr/local/bin:$PATH pnpm --dir web start:yoyoosun --print-plan` 通过并输出 `pnpm start`。
- 下一步：无。
- 阻塞/风险：本轮只删除重复 npm script 别名并同步引用，不启动长驻 Vite、不改运行时代码路径、不跑浏览器回归。

## 2026-07-01 mobile auth route smoke 稳定性收口

- 完成：修复 `web/scripts/mobileAuthLoginRouteSmoke.mjs` 在本地 Vite / SPA 导航过程中偶发失败的问题。脚本现在对岗位路径跳转和 local/sessionStorage 读写使用带导航重试的 helper，并把底部主 tab 切换收口为“点击后等待 active tab 与目标文案”的稳定断言；已办面板断言改为验证用户可见任务名“完成进度样本”，不再要求已办卡片必须显示 `source_no`。
- 验证：`PATH=/usr/local/bin:$PATH pnpm --dir web smoke:mobile-auth-login-route` 通过，验证 9 个岗位任务端角色；`node --test scripts/qa/mobile-workflow-runtime-browser-smoke.test.mjs scripts/qa/mobile-workflow-simulated-closure.test.mjs scripts/qa/workflow-ui-action-boundary.test.mjs web/scripts/mobileAuthLoginRouteSmoke.test.mjs` 通过 35 项；本轮此前还通过 `go test ./internal/biz ./internal/data ./internal/service`、客户配置 release / readiness 脚本测试、`customer-config-boundaries`、前端 adminProfileSync / menu / mobile task / errorMessage / technical field 守卫、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`。
- 下一步：若继续本地试用闭环，优先补真实演示账号密码后的 trial-account / mobile workflow 真实登录 smoke；没有密码时继续只跑 no-write preflight 和 mock smoke。
- 阻塞/风险：本轮仍不证明真实账号 RBAC、真实后端 active customer_config revision、真实客户导入、生产部署、release sign-off、备份恢复或回滚演练；`releaseReady=false` 仍是目标环境证据缺口，不作为本轮本地阻断。当前工作区仍有多组既有未提交改动，本轮新增修改集中在 mobile auth route smoke 脚本和本条进度记录。

## 2026-07-01 qa:full pnpm 生命周期收口

- 完成：继续当前长期 goal 的本地验证闭环，先跑 `bash scripts/qa/full.sh` 暴露真实本地门禁失败：`web` 的 `pretest` lifecycle 通过裸 `pnpm gen:error-codes` 命中 PATH 中 `pnpm 11.7.0`，与项目锁定 `pnpm 10.13.x` 冲突。已把 `web/package.json` 的 `build:all`、`prebuild`、`pretest` 改为直接执行 `node ../scripts/gen-error-codes.mjs` 和 `vite build --config vite.config.mjs`，避免 QA 脚本已经解析出的固定 pnpm 被嵌套 lifecycle 绕开。
- 验证：`node -e "JSON.parse(require('fs').readFileSync('web/package.json','utf8'))"` 通过；`rg -n '"(build:all|prebuild|pretest)"|pnpm gen:error-codes|pnpm build:desktop' web/package.json README.md web/README.md web/scripts/README.md scripts/README.md` 确认关键 lifecycle 不再调用裸 pnpm；第一次 `bash scripts/qa/full.sh` 失败在 `pretest` 的 pnpm 版本；修复后第二次 `bash scripts/qa/full.sh` 全部通过，覆盖 fast、secrets、govulncheck、web test 453 项、web build、server `go test ./...` 和 `make build`；`git diff --check` 通过。
- 下一步：继续本地闭环时，若不具备演示账号密码，优先跑 no-write preflight / mock smoke；具备密码后再补真实 `trial-account-rbac --report`、`smoke:trial-demo-browser` 和 `smoke:mobile-workflow-runtime-browser`。
- 阻塞/风险：本轮不改业务运行时代码、不改后端、schema、migration、RBAC、Workflow / Fact、客户配置发布 / 激活 / 回滚、真实客户数据、生产部署或 release evidence；当前工作区仍有多组既有未提交改动，本条只声明 `web/package.json` lifecycle 修复和本地 `qa:full` 验证。
