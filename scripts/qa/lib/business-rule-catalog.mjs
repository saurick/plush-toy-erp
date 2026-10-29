// 只登记需要持续保护的业务约束及其测试，不在这里重新实现业务公式或状态机。
export const BUSINESS_RULE_CATEGORIES = Object.freeze([
  { value: "transaction", label: "事务与回滚" },
  { value: "quantity", label: "数量与金额" },
  { value: "consistency", label: "业务数据一致性" },
  { value: "concurrency", label: "并发与幂等" },
  { value: "boundary", label: "权限与事实边界" },
  { value: "growth", label: "数据增长与资源边界" },
]);

const source = (file, name, gate = "postgres") =>
  Object.freeze({
    file: `server/internal/${file}`,
    package: `server/internal/${file.slice(0, file.lastIndexOf("/"))}`,
    name,
    gate,
  });
const rule = (id, label, category, domain, standard, tests) =>
  Object.freeze({
    id,
    label,
    category,
    domain,
    standard,
    tests: Object.freeze(tests),
  });
const web = (file, name) =>
  Object.freeze({
    file: `web/src/erp/utils/${file}`,
    package: `web/src/erp/utils/${file}`,
    name,
    gate: "web",
  });

export const BUSINESS_RULES = Object.freeze([
  rule(
    "purchase-source-permissions", "采购来源读取与岗位权限", "boundary", "fact-purchase",
    "按岗位授予来源只读和本岗办理权限；不附带上游编辑、审批权。仓库与品质无采购价格权限仍可带入数量和来源关联；缺少来源权限时提示，撤权后清理窗口，后端再次校验且禁止越权写入。",
    [
      source("biz/rbac_test.go", "TestBuiltinPurchaseChainSourcePermissionsKeepJobBoundaries", "server"),
      source("service/jsonrpc_sensitive_fields_test.go", "TestPurchaseSourceReadPolicyKeepsRoleQuantitiesWithoutLeakingPrices", "server"),
      source("service/jsonrpc_purchase_test.go", "TestJsonrpcDispatcher_PurchaseReceiptSourceMethodsRequirePurchaseOrderRead", "server"),
      source("service/jsonrpc_source_action_permission_test.go", "TestSourceActionReadPermissionGuardsDenyEveryMissingSourceCapabilityBeforeWrite", "server"),
      web("sourceActionAccess.test.mjs", "采购带入权限同时检查本岗、来源和敏感字段，读取不授予写入"),
      web("sourceActionAccess.test.mjs", "采购来源撤权按当前有效会话收紧，超级管理员也不能绕过客户动作限制"),
      web("sourceActionAccess.test.mjs", "采购退货调整与两类不合格处置分别检查来源，准备资料不能扩大办理权限"),
    ],
  ),
  rule(
    "purchase-approval", "采购审批任务与拒绝终点", "boundary", "workflow",
    "审批节点由流程运行时创建；批准与拒绝按各自分支结束，审批任务完成不等于入库或应付过账。",
    [
      source("biz/process_runtime_test.go", "TestProcessRuntimeUsecaseStartProcessInstanceActivatesFirstWaitingApprovalNode", "server"),
      source("biz/process_runtime_test.go", "TestProcessRuntimeUsecaseStandardApprovalRejectionCompletesTerminalBranch", "server"),
      source("data/process_runtime_source_order_postgres_test.go", "TestProcessRuntimePostgresPurchaseApprovalRejectionTerminatesSourceAndProcess"),
    ],
  ),
  rule(
    "purchase-source-order", "采购批准与订单快照", "boundary", "source-documents",
    "订单按来源和生命周期办理；收货引用已批准订单，币种与付款条件保持订单快照。",
    [
      source("biz/purchase_order_test.go", "TestPurchaseOrderUsecaseLifecycleGuards", "server"),
      source("biz/purchase_order_test.go", "TestPurchaseOrderCurrencyAndPaymentTermSnapshotContract", "server"),
    ],
  ),
  rule(
    "purchase-arrival", "分批收货与到货回滚", "transaction", "fact-purchase",
    "按采购订单行登记实收；数量进度由服务端汇总，到货失败不得遗留收货或检验事实。",
    [
      source("data/purchase_order_receipt_progress_repo_test.go", "TestPurchaseOrderReceiptProgressProjectsExactServerOwnedQuantities", "server"),
      source("data/receiving_quality_atomic_retry_postgres_test.go", "TestPurchaseReceiptPostgresArrivalFailureRollsBackAndRetries"),
    ],
  ),
  rule(
    "purchase-quality-handoff", "逐行检验与待入库交接", "boundary", "fact-quality",
    "到货生成逐行待检记录；通过与不合格分别保留，品质结论不代替仓库入库。",
    [
      source("biz/incoming_acceptance_test.go", "TestIncomingAcceptanceExplicitQuantitiesAndIntent", "server"),
      source("data/incoming_acceptance_test.go", "TestPurchaseReceiptPostgresIncomingAcceptance"),
      source("data/purchase_receipt_handoff_guards_postgres_test.go", "TestPurchaseReceiptPostgresMixedQualityPreservesAggregateOutcome"),
    ],
  ),
  rule(
    "purchase-inbound", "合格行入库与异常收尾", "transaction", "fact-purchase",
    "本次仅入库已通过的未过账行；多行失败一并回滚，可重试。不合格行处置后才完成收货收尾。",
    [
      source("data/purchase_receipt_partial_inbound_test.go", "TestPurchaseReceiptMixedQualityPostsOnlyPassedLinesAndSettlesIndependently", "server"),
      source("data/purchase_receipt_partial_inbound_test.go", "TestPurchaseReceiptReadyLinesRollbackTogetherAndRetry", "server"),
      source("data/purchase_receipt_partial_inbound_test.go", "TestPurchaseReceiptPendingLineCanPassAndPostAfterPartialInbound", "server"),
      source("data/purchase_receipt_handoff_guards_postgres_test.go", "TestPurchaseReceiptPostgresInboundCommandCompletesWithDisposedRejection"),
    ],
  ),
  rule(
    "purchase-payable-source", "采购应付来源、计价与过账", "boundary", "fact-finance",
    "应付草稿读取已入库来源及冻结结算快照；缺值或来源冲突拒绝，重复请求返回同一草稿；财务确认后独立过账。",
    [
      source("data/operational_fact_finance_business_source_test.go", "TestPurchaseReceiptPayableRejectsMissingOrMixedOrderSnapshot", "server"),
      source("data/operational_fact_finance_business_source_test.go", "TestFinanceBusinessSourcesSQLite", "server"),
      source("data/operational_fact_finance_business_source_test.go", "TestFinanceBusinessSourcesPostgres"),
    ],
  ),
  rule(
    "consistency-money",
    "单价、金额精度与缺值",
    "consistency",
    "fact-finance",
    "录入与派生金额保持六位精度；清空单价清空派生金额，溢出拒绝，未知金额不得补零。",
    [
      source(
        "biz/line_amount_test.go",
        "TestCalculatedLineAmountStorageBoundary",
        "server",
      ),
      web(
        "sourceOrderAmounts.test.mjs",
        "business data consistency: clearing prices clears submitted and displayed amounts",
      ),
      web(
        "sourceOrderAmounts.test.mjs",
        "business data consistency: amount preview rejects derived and aggregate overflow",
      ),
      web(
        "outsourcingContractReadiness.test.mjs",
        "business data consistency: outsourcing confirmation preserves exact money and unknown price",
      ),
    ],
  ),
  rule(
    "consistency-ratios",
    "损耗率与不良比例",
    "consistency",
    "fact-quality",
    "百分数、比例和 Excel 百分比格式分别解释；超精度输入不可静默舍入，品质比例保留六位小数。",
    [
      web(
        "bomXlsxImport.test.mjs",
        "business data consistency: BOM percentage headers and excess precision retain their meaning",
      ),
      web(
        "qualityDefectRate.test.mjs",
        "business data consistency: backend precision survives quality display and edit",
      ),
    ],
  ),
  rule(
    "consistency-weights",
    "毛净重与物理单位",
    "consistency",
    "fact-shipment",
    "净重以克、毛重以千克核对，保存和过账均不得毛重小于净重；缺失重量不虚构。",
    [
      source(
        "biz/net_weight_test.go",
        "TestShipmentGrossNetWeightConsistency",
        "server",
      ),
      web(
        "shipmentWeight.test.mjs",
        "business data consistency: gross kilograms cannot be below net grams",
      ),
    ],
  ),
  rule(
    "consistency-dates",
    "业务日期与时间边界",
    "consistency",
    "rbac-api",
    "仅日期筛选覆盖上海时区整天；显式时间戳保持原瞬间，付款到期日按中国自然月月末加约定天数。",
    [
      source("biz/operational_fact_finance_source_test.go", "TestFinanceFactDueAtFromDaysUsesCanonicalMonthEnd", "server"),
      source("data/finance_china_month_end_migration_postgres_test.go", "TestFinanceChinaMonthEndMigrationPostgres"),
      source(
        "service/jsonrpc_date_filter_test.go",
        "TestBusinessDateFilterBoundaries",
        "server",
      ),
    ],
  ),
  rule(
    "consistency-snapshots",
    "币种、打印与来源快照",
    "consistency",
    "source-documents",
    "币种贯穿单据和打印；普通编辑保留快照，来源切换覆盖残值，历史缺值不得取当前主数据冒充。",
    [
      web(
        "purchaseOrderPrintDraft.test.mjs",
        "business data consistency: contract currency and source snapshots survive printing",
      ),
      source(
        "data/business_data_consistency_test.go",
        "TestBusinessDataConsistency",
        "server",
      ),
      source(
        "data/business_data_consistency_test.go",
        "TestSourceDocumentPostgresBusinessDataConsistency",
      ),
    ],
  ),
  rule(
    "consistency-allocation",
    "分批税费、应收应付与尾差",
    "consistency",
    "fact-finance",
    "税额和另计报价运费按货款占比分摊、末批结清；委外分批应付结清尾差；取消释放额度，重试保留原快照。",
    [
      source(
        "biz/commercial_allocation_test.go",
        "TestCommercialAllocationRemainder",
        "server",
      ),
      source(
        "data/business_consistency_migration_postgres_test.go",
        "TestSourceDocumentPostgresCommercialSnapshotMigration",
      ),
      source(
        "data/business_data_consistency_test.go",
        "TestBusinessDataConsistency",
        "server",
      ),
      source(
        "data/business_data_consistency_test.go",
        "TestSourceDocumentPostgresBusinessDataConsistency",
      ),
    ],
  ),
  rule(
    "sales-export-snapshot",
    "销售导出快照与完整结果",
    "growth",
    "source-documents",
    "订单集合、表头、明细数量和工程状态属于同一只读快照，稳定排序且不截断结果。",
    [
      source(
        "data/sales_order_export_postgres_test.go",
        "TestSourceDocumentPostgresSalesOrderExportSnapshot",
      ),
    ],
  ),
  rule(
    "sales-export-budget",
    "销售导出预算、准入与取消释放",
    "growth",
    "source-documents",
    "行数和未压缩数据超限时整次拒绝；准备名额与期限有界，取消或失败后释放连接并允许重试。",
    [
      source(
        "biz/sales_order_export_test.go",
        "TestSalesOrderExportAdmissionCancellationAndPreparation",
        "server",
      ),
      source(
        "biz/sales_order_export_test.go",
        "TestSalesOrderExportFailureAndDeadline",
        "server",
      ),
      source(
        "service/jsonrpc_sales_order_export_test.go",
        "TestSalesOrderExportServiceReleasesAdmissionAfterFailure",
        "server",
      ),
      source(
        "data/sales_order_export_postgres_test.go",
        "TestSourceDocumentPostgresSalesOrderExportBudgets",
      ),
      source(
        "data/sales_order_export_postgres_test.go",
        "TestSourceDocumentPostgresSalesOrderExportCancelReleasesConnection",
      ),
    ],
  ),
  rule(
    "unit-quantity",
    "单位精度与应需取整",
    "quantity",
    "master-data",
    "录入数量不静默舍入；应需量按单位精度向上取整，越界拒绝。",
    [
      source("biz/unit_quantity_test.go", "TestValidateUnitQuantity", "server"),
      source(
        "biz/unit_quantity_test.go",
        "TestRoundRequiredUnitQuantity",
        "server",
      ),
      source(
        "biz/unit_quantity_test.go",
        "FuzzRoundRequiredUnitQuantity",
        "server",
      ),
    ],
  ),
  rule(
    "material-demand",
    "算料归并与冻结数量",
    "quantity",
    "source-documents",
    "先归并再取整，库存和在途只作参考；大数与六位精度持久化保持一致。",
    [
      source(
        "data/engineering_material_calculation_test.go",
        "TestEngineeringMaterialCalculationGroupsBeforeRounding",
        "server",
      ),
      source(
        "data/engineering_material_calculation_test.go",
        "TestEngineeringMaterialCalculationRejectsGroupedOverflow",
        "server",
      ),
      source(
        "data/engineering_material_calculation_test.go",
        "TestEngineeringMaterialInventoryDoesNotReduceDemand",
        "server",
      ),
      source(
        "data/engineering_material_calculation_test.go",
        "TestSourceDocumentPostgresEngineeringMaterialQuantities",
      ),
    ],
  ),
  rule(
    "money-precision",
    "金额精度与分配输入",
    "quantity",
    "fact-finance",
    "金额按精确十进制保存；分配金额须为正且不越界，非法输入不进入存储。",
    [
      source("core/value/value_test.go", "TestMoney", "server"),
      source(
        "biz/finance_payment_usecase_behavior_test.go",
        "TestFinancePaymentUsecaseAllocationRejectsInvalidAmountsBeforeStorage",
        "server",
      ),
    ],
  ),
  rule(
    "inventory-atomicity",
    "库存多行写入与失败重试",
    "transaction",
    "fact-inventory",
    "任一行失败时余额、流水和单据共同回滚；重试只产生一组事实。",
    [
      source(
        "data/inventory_postgres_operation_recovery_test.go",
        "TestInventoryPostgresOperationMultiLineRollbackAndRetry",
      ),
      source(
        "data/inventory_postgres_operation_concurrency_test.go",
        "TestInventoryPostgresOperationFirstBalanceAndRollback",
      ),
    ],
  ),
  rule(
    "stock-capacity",
    "库存扣减与预留竞争",
    "concurrency",
    "fact-inventory",
    "并发扣减与预留不得超用同粒度可用库存；余额与流水一致。",
    [
      source(
        "data/inventory_postgres_test.go",
        "TestInventoryPostgresConcurrentOutbound",
      ),
      source(
        "data/inventory_postgres_test.go",
        "TestInventoryPostgresConcurrentReservationAndOutboundPreserveAvailableStock",
      ),
      source(
        "data/inventory_postgres_lot_bom_test.go",
        "TestInventoryLotPostgresConcurrentOutbound",
      ),
    ],
  ),
  rule(
    "purchase-replay",
    "采购入库过账、取消与重放",
    "concurrency",
    "fact-purchase",
    "相同意图返回原结果，不同内容冲突；过账、调整与取消串行保持有效依赖。",
    [
      source(
        "data/purchase_receipt_lifecycle_concurrency_test.go",
        "TestPurchaseReceiptPostgresConcurrentCommandReplayReturnsOneFactSet",
      ),
      source(
        "data/purchase_receipt_lifecycle_concurrency_test.go",
        "TestPurchaseReceiptPostgresConcurrentCommandPayloadConflictPersistsOneFactSet",
      ),
      source(
        "data/purchase_receipt_lifecycle_concurrency_test.go",
        "TestPurchaseReceiptPostgresAdjustmentPostAndReceiptCancelSerialize",
      ),
    ],
  ),
  rule(
    "receipt-adjustment",
    "入库调整累计与并发上限",
    "quantity",
    "fact-purchase",
    "调整后的有效数量不得被并发超扣；草稿改动不能穿透过账冻结。",
    [
      source(
        "data/inventory_postgres_purchase_adjustment_test.go",
        "TestPurchaseReceiptAdjustmentPostgresEffectiveReceiptQuantityAndConcurrentAdjustOut",
      ),
      source(
        "data/inventory_postgres_purchase_adjustment_test.go",
        "TestPurchaseReceiptAdjustmentPostgresAddItemVsPostConcurrency",
      ),
    ],
  ),
  rule(
    "source-freeze",
    "来源单据提交冻结",
    "concurrency",
    "source-documents",
    "提交后拒绝旧版本保存，保留已提交的表头、明细与数量。",
    [
      source(
        "data/source_document_postgres_concurrency_test.go",
        "TestSourceDocumentPostgresSaveSubmitConcurrency",
      ),
    ],
  ),
  rule(
    "engineering-approval",
    "用料审批与采购生成原子性",
    "transaction",
    "source-documents",
    "审批、采购结果与审计共同提交；查询保持同一快照，中途失败整批回滚，同一意图可安全重试。",
    [
      source(
        "data/engineering_material_request_repo_test.go",
        "TestSourceDocumentPostgresEngineeringMaterialConcurrentApproval",
      ),
      source(
        "data/engineering_material_workflow_test.go",
        "TestSourceDocumentPostgresEngineeringMaterialFinanceFailureAndRetry",
      ),
      source(
        "data/engineering_material_snapshot_postgres_test.go",
        "TestSourceDocumentPostgresEngineeringMaterialReadSnapshot",
      ),
    ],
  ),
  rule(
    "production-capacity",
    "生产领料与获批超领上限",
    "quantity",
    "fact-production",
    "并发领料不得超过计划量与有效超领批准量，同一命令重放不重复扣料。",
    [
      source(
        "data/production_order_postgres_concurrency_test.go",
        "TestProductionMaterialIssuePostgresConcurrentReplayAndQuantityWinner",
      ),
      source(
        "data/production_order_postgres_concurrency_test.go",
        "TestProductionMaterialIssuePostgresConcurrentOverIssueAllowanceHasOneWinnerAndExactReadback",
      ),
    ],
  ),
  rule(
    "outsourcing-capacity",
    "委外来源数量与在制分配",
    "transaction",
    "fact-outsourcing",
    "委外事实不得超来源行，WIP 分配与订单结算保持原子性。",
    [
      source(
        "data/operational_fact_outsourcing_source_postgres_test.go",
        "TestOutsourcingFactFromOrderPostgresConcurrentPostsDoNotExceedSourceLine",
      ),
      source(
        "data/outsourcing_order_wip_postgres_concurrency_test.go",
        "TestOutsourcingFactFromOrderPostgresWIPAllocationAndLifecycleSettlementStayAtomic",
      ),
    ],
  ),
  rule(
    "quality-correction",
    "质检更正与不可变重试",
    "transaction",
    "fact-quality",
    "更正、关联事实与审计保持原子性；完成后重试按原意图恢复。",
    [
      source(
        "data/quality_inspection_correction_postgres_test.go",
        "TestQualityInspectionPostgresCorrectionAtomicityAndConcurrency",
      ),
      source(
        "data/quality_inspection_correction_postgres_test.go",
        "TestQualityInspectionPostgresCompletedCorrectionReplayUsesImmutableIntent",
      ),
    ],
  ),
  rule(
    "shipment-capacity",
    "出货累计与来源取消竞争",
    "quantity",
    "fact-shipment",
    "并发出货不得超过订单行；取消出货与下游质检创建必须保持来源有效。",
    [
      source(
        "data/inventory_postgres_test.go",
        "TestOperationalFactPostgresConcurrentShipmentsDoNotExceedSalesOrderLine",
      ),
      source(
        "data/shipment_cancellation_postgres_concurrency_test.go",
        "TestOperationalFactPostgresShipmentCancelVsFinishedGoodsQualityCreateUsesOneSourceLock",
      ),
    ],
  ),
  rule(
    "finance-atomicity",
    "收付款分配、取消与补偿",
    "transaction",
    "fact-finance",
    "并发分配不得超过未结金额；取消和补偿失败完整回滚，审计只记一次。",
    [
      source(
        "data/operational_fact_finance_payment_postgres_test.go",
        "TestOperationalFactRepoFinancePaymentPostgresAllocationRollbackAndRecovery",
      ),
      source(
        "data/operational_fact_finance_payment_postgres_test.go",
        "TestOperationalFactRepoFinancePaymentPostgresConcurrentOutstanding",
      ),
      source(
        "data/finance_fact_cancel_audit_postgres_test.go",
        "TestFinanceFactCancelAuditPostgresRollsBackWhenCompensationFails",
      ),
      source(
        "data/finance_fact_cancel_audit_postgres_test.go",
        "TestFinanceFactCancelAuditPostgresConcurrentExactReplayReturnsOneAudit",
      ),
    ],
  ),
  rule(
    "finance-read-trace",
    "财务读取权限与逐笔关联",
    "boundary",
    "fact-finance",
    "账款按所属类型授权；收付关联另需收付款读取权限。关联分页保留已冲回核销，不混入其他账款，不把读取失败当作无记录。",
    [
      source("service/jsonrpc_finance_trace_test.go", "TestFinanceTraceReadPermissionsAndFilters", "server"),
      source("service/jsonrpc_finance_trace_test.go", "TestFinanceTraceRejectsInvalidOrMissingRecord", "server"),
      source("data/finance_trace_repo_test.go", "TestFinanceTraceRelationshipSQLite", "server"),
      source("data/finance_trace_repo_test.go", "TestOperationalFactRepoFinanceTracePostgres"),
    ],
  ),
  rule(
    "finance-period-statement",
    "期间对账与资金口径",
    "consistency",
    "fact-finance",
    "期间对账按中国日期和入账、冲回时间取数，期初与期末可核对；预收预付不遗漏，核销不重复计入资金。",
    [source("data/finance_statement_repo_test.go", "TestFinanceStatementPostgres")],
  ),
  rule(
    "workflow-boundary",
    "协同终态、幂等与事实边界",
    "boundary",
    "workflow",
    "协同完成不代写库存或财务事实；并发终态只执行一次约定副作用。",
    [
      source(
        "biz/workflow_production_source_task_transition_test.go",
        "TestWorkflowUsecase_ProductionSchedulingDoneConvergesBusinessProjectionWithoutFactWrite",
        "server",
      ),
      source(
        "data/workflow_repo_postgres_concurrency_test.go",
        "TestWorkflowPostgresConflictingTerminalUpdatesApplySideEffectsOnce",
      ),
      source(
        "data/workflow_repo_postgres_concurrency_test.go",
        "TestWorkflowPostgresConcurrentDifferentIntentSameKeyConflicts",
      ),
      source(
        "data/process_runtime_postgres_concurrency_test.go",
        "TestProcessRuntimePostgresConcurrentSameIntentExecutionReconcilesOneTerminalResult",
      ),
    ],
  ),
  rule(
    "permission-boundary",
    "业务链路岗位权限与仓库范围",
    "boundary",
    "rbac-api",
    "业务链路按职责区分质量方案、超领、仓库领料与合同办理；仓库范围同时约束查询、计数、写入及重放，来源只读不授予办理权；迁移保留自定义岗位、停用状态和历史，角色设置并发保持完整。",
    [
      source("biz/role_flow_permissions_test.go", "TestRoleFlowEveryFulfillmentOwnerCanReadAndPerformSourceAction", "server"),
      source("service/jsonrpc_role_flow_permissions_test.go", "TestRoleFlowExceptionSubmissionAndWithdrawalByDecisionType", "server"),
      source("service/jsonrpc_role_flow_permissions_test.go", "TestRoleFlowMaterialIssuePostCancelRequiresWarehouseOutbound", "server"),
      source("service/jsonrpc_role_flow_permissions_test.go", "TestRoleFlowQuantityCommandsDoNotRequireCommercialRead", "server"),
      source("service/jsonrpc_role_flow_permissions_test.go", "TestRoleFlowQualityDetailRequiresItsActualSourceRead", "server"),
      source("data/role_flow_data_scope_test.go", "TestRoleFlowWIPQualityDoesNotInventWarehouseOwnership", "server"),
      source("data/role_flow_data_scope_test.go", "TestOperationalFactPostgresRoleFlowWarehouseScope"),
      source("data/role_flow_permissions_migration_postgres_test.go", "TestAdminManagePostgresRoleFlowPermissionMigration"),
      source("data/role_flow_http_postgres_test.go", "TestSourceDocumentPostgresIntegrationEveryRolePermissionBoundary"),
      source(
        "biz/inventory_usecase_behavior_test.go",
        "TestInventoryUsecaseWarehouseScopeRejectsWritesBeforeRepository",
        "server",
      ),
      source(
        "data/admin_manage_postgres_concurrency_test.go",
        "TestAdminManagePostgresConcurrentRoleSettingsKeepsOneCompleteAggregate",
      ),
    ],
  ),
]);

export const businessTestKey = (test) => `${test.package}:${test.name}`;

export function businessRuleTests(gate) {
  if (!["web", "server", "postgres"].includes(gate))
    throw new Error("unknown business rule gate");
  return [
    ...new Map(
      BUSINESS_RULES.flatMap((entry) => entry.tests)
        .filter((test) => test.gate === gate)
        .map((test) => [businessTestKey(test), test]),
    ).values(),
  ];
}

export function businessConsistencyTests(gate) {
  const ids = new Set(
    BUSINESS_RULES.filter(
      (entry) =>
        entry.category === "consistency" ||
        ["unit-quantity", "money-precision"].includes(entry.id),
    )
      .flatMap((entry) => entry.tests)
      .map(businessTestKey),
  );
  return businessRuleTests(gate).filter((entry) =>
    ids.has(businessTestKey(entry)),
  );
}

export const BUSINESS_RULE_DIAGRAMS = Object.freeze({
  consistency: {
    label: "业务数据从录入到冻结输出",
    chart: `flowchart TD
  source["唯一来源与明确单位"] --> input["精度、缺值与范围校验"]
  input --> calculate["按统一口径计算与分摊"]
  calculate --> freeze["事务内保存事实和快照"]
  freeze --> output["页面、打印和导出读取快照"]
  output --> reconcile["分批总额、清空与历史缺值回归"]`,
  },
  growth: {
    label: "有界读取与完整快照",
    chart: `flowchart TD
  request["筛选范围与稳定排序"] --> admission["有界准入与准备期限"]
  admission --> snapshot["同一只读快照核对集合与预算"]
  snapshot --> limit{"行数与数据体积在预算内"}
  limit -->|是| complete["读取完整结果与派生数量"]
  limit -->|否| reject["整次拒绝，不返回部分结果"]
  complete --> release["关闭事务并释放名额"]
  reject --> release`,
  },
  boundary: {
    label: '协同办理与事实过账边界',
    chart: `flowchart TD
  request["办理请求"] --> type{"动作归属"}
  type -->|协同任务| workflow["校验职责、权限、版本与幂等"]
  workflow --> event["记录任务状态与事件"]
  event --> done["协同完成"]
  type -->|领域命令| domain["校验业务权限、来源与状态"]
  domain --> transaction["领域事务写入事实与审计"]
  transaction --> posted["事实过账"]`,
  },
  transaction: {
    label: '原子写入与失败恢复',
    chart: `flowchart TD
  request["受控业务操作"] --> tx["开启事务并校验来源"]
  tx --> write["写入约定事实与审计"]
  write --> result{"全部成功"}
  result -->|是| commit["提交事务"]
  result -->|否| rollback["完整回滚"]
  commit --> response["返回固定结果"]
  rollback --> retry["核对原因后用同一意图重试"]
  retry --> request`,
  },
  quantity: {
    label: '数量真源与最终对账',
    chart: `flowchart TD
  input["来源数量与单位精度"] --> rule["按正式业务口径计算"]
  rule --> check{"精度与累计上限有效"}
  check -->|否| reject["拒绝并保持原事实"]
  check -->|是| lock["事务内锁定并重读来源"]
  lock --> validate{"重算后仍满足约束"}
  validate -->|否| reject
  validate -->|是| post["写入事实与数量快照"]
  post --> reconcile["读回余额、流水与累计量"]`,
  },
  concurrency: {
    label: '并发、版本冲突与幂等重放',
    chart: `flowchart TD
  intent["请求身份与业务意图"] --> guard["锁、版本及唯一约束"]
  guard --> replay{"已有同键结果"}
  replay -->|同意图| original["返回原结果"]
  replay -->|不同意图| conflict["拒绝冲突"]
  replay -->|无结果| validate["重读状态、权限与数量"]
  validate --> write["原子写入并记录重放结果"]
  write --> commit["提交后返回"]
  write -->|失败| rollback["回滚后允许显式重试"]`,
  },
})
