// 只登记需要持续保护的业务约束及其测试，不在这里重新实现业务公式或状态机。
export const BUSINESS_RULE_CATEGORIES = Object.freeze([
  { value: 'transaction', label: '事务与回滚' },
  { value: 'quantity', label: '数量与金额' },
  { value: 'concurrency', label: '并发与幂等' },
  { value: 'boundary', label: '权限与事实边界' },
])

const source = (file, name, gate = 'postgres') => Object.freeze({
  file: `server/internal/${file}`,
  package: `server/internal/${file.slice(0, file.lastIndexOf('/'))}`,
  name,
  gate,
})
const rule = (id, label, category, domain, standard, tests) => Object.freeze({
  id, label, category, domain, standard, tests: Object.freeze(tests),
})

export const BUSINESS_RULES = Object.freeze([
  rule('unit-quantity', '单位精度与应需取整', 'quantity', 'master-data',
    '录入数量不静默舍入；应需量按单位精度向上取整，越界拒绝。', [
      source('biz/unit_quantity_test.go', 'TestValidateUnitQuantity', 'server'),
      source('biz/unit_quantity_test.go', 'TestRoundRequiredUnitQuantity', 'server'),
      source('biz/unit_quantity_test.go', 'FuzzRoundRequiredUnitQuantity', 'server'),
    ]),
  rule('material-demand', '算料归并与冻结数量', 'quantity', 'source-documents',
    '先归并再取整，库存和在途只作参考；大数与六位精度持久化保持一致。', [
      source('data/engineering_material_calculation_test.go', 'TestEngineeringMaterialCalculationGroupsBeforeRounding', 'server'),
      source('data/engineering_material_calculation_test.go', 'TestEngineeringMaterialCalculationRejectsGroupedOverflow', 'server'),
      source('data/engineering_material_calculation_test.go', 'TestEngineeringMaterialInventoryDoesNotReduceDemand', 'server'),
      source('data/engineering_material_calculation_test.go', 'TestSourceDocumentPostgresEngineeringMaterialQuantities'),
    ]),
  rule('money-precision', '金额精度与分配输入', 'quantity', 'fact-finance',
    '金额按精确十进制保存；分配金额须为正且不越界，非法输入不进入存储。', [
      source('core/value/value_test.go', 'TestMoney', 'server'),
      source('biz/finance_payment_usecase_behavior_test.go', 'TestFinancePaymentUsecaseAllocationRejectsInvalidAmountsBeforeStorage', 'server'),
    ]),
  rule('inventory-atomicity', '库存多行写入与失败重试', 'transaction', 'fact-inventory',
    '任一行失败时余额、流水和单据共同回滚；重试只产生一组事实。', [
      source('data/inventory_postgres_operation_recovery_test.go', 'TestInventoryPostgresOperationMultiLineRollbackAndRetry'),
      source('data/inventory_postgres_operation_concurrency_test.go', 'TestInventoryPostgresOperationFirstBalanceAndRollback'),
    ]),
  rule('stock-capacity', '库存扣减与预留竞争', 'concurrency', 'fact-inventory',
    '并发扣减与预留不得超用同粒度可用库存；余额与流水一致。', [
      source('data/inventory_postgres_test.go', 'TestInventoryPostgresConcurrentOutbound'),
      source('data/inventory_postgres_test.go', 'TestInventoryPostgresConcurrentReservationAndOutboundPreserveAvailableStock'),
      source('data/inventory_postgres_lot_bom_test.go', 'TestInventoryLotPostgresConcurrentOutbound'),
    ]),
  rule('purchase-replay', '采购入库过账、取消与重放', 'concurrency', 'fact-purchase',
    '相同意图返回原结果，不同内容冲突；过账、调整与取消串行保持有效依赖。', [
      source('data/purchase_receipt_lifecycle_concurrency_test.go', 'TestPurchaseReceiptPostgresConcurrentCommandReplayReturnsOneFactSet'),
      source('data/purchase_receipt_lifecycle_concurrency_test.go', 'TestPurchaseReceiptPostgresConcurrentCommandPayloadConflictPersistsOneFactSet'),
      source('data/purchase_receipt_lifecycle_concurrency_test.go', 'TestPurchaseReceiptPostgresAdjustmentPostAndReceiptCancelSerialize'),
    ]),
  rule('receipt-adjustment', '入库调整累计与并发上限', 'quantity', 'fact-purchase',
    '调整后的有效数量不得被并发超扣；草稿改动不能穿透过账冻结。', [
      source('data/inventory_postgres_purchase_adjustment_test.go', 'TestPurchaseReceiptAdjustmentPostgresEffectiveReceiptQuantityAndConcurrentAdjustOut'),
      source('data/inventory_postgres_purchase_adjustment_test.go', 'TestPurchaseReceiptAdjustmentPostgresAddItemVsPostConcurrency'),
    ]),
  rule('source-freeze', '来源单据提交冻结', 'concurrency', 'source-documents',
    '提交后拒绝旧版本保存，保留已提交的表头、明细与数量。', [
      source('data/source_document_postgres_concurrency_test.go', 'TestSourceDocumentPostgresSaveSubmitConcurrency'),
    ]),
  rule('engineering-approval', '用料审批与采购生成原子性', 'transaction', 'source-documents',
    '审批、采购结果与审计共同提交；中途失败整批回滚，同一意图可安全重试。', [
      source('data/engineering_material_request_repo_test.go', 'TestSourceDocumentPostgresEngineeringMaterialConcurrentApproval'),
      source('data/engineering_material_workflow_test.go', 'TestSourceDocumentPostgresEngineeringMaterialFinanceFailureAndRetry'),
    ]),
  rule('production-capacity', '生产领料与获批超领上限', 'quantity', 'fact-production',
    '并发领料不得超过计划量与有效超领批准量，同一命令重放不重复扣料。', [
      source('data/production_order_postgres_concurrency_test.go', 'TestProductionMaterialIssuePostgresConcurrentReplayAndQuantityWinner'),
      source('data/production_order_postgres_concurrency_test.go', 'TestProductionMaterialIssuePostgresConcurrentOverIssueAllowanceHasOneWinnerAndExactReadback'),
    ]),
  rule('outsourcing-capacity', '委外来源数量与在制分配', 'transaction', 'fact-outsourcing',
    '委外事实不得超来源行，WIP 分配与订单结算保持原子性。', [
      source('data/operational_fact_outsourcing_source_postgres_test.go', 'TestOutsourcingFactFromOrderPostgresConcurrentPostsDoNotExceedSourceLine'),
      source('data/outsourcing_order_wip_postgres_concurrency_test.go', 'TestOutsourcingFactFromOrderPostgresWIPAllocationAndLifecycleSettlementStayAtomic'),
    ]),
  rule('quality-correction', '质检更正与不可变重试', 'transaction', 'fact-quality',
    '更正、关联事实与审计保持原子性；完成后重试按原意图恢复。', [
      source('data/quality_inspection_correction_postgres_test.go', 'TestQualityInspectionPostgresCorrectionAtomicityAndConcurrency'),
      source('data/quality_inspection_correction_postgres_test.go', 'TestQualityInspectionPostgresCompletedCorrectionReplayUsesImmutableIntent'),
    ]),
  rule('shipment-capacity', '出货累计与来源取消竞争', 'quantity', 'fact-shipment',
    '并发出货不得超过订单行；取消出货与下游质检创建必须保持来源有效。', [
      source('data/inventory_postgres_test.go', 'TestOperationalFactPostgresConcurrentShipmentsDoNotExceedSalesOrderLine'),
      source('data/shipment_cancellation_postgres_concurrency_test.go', 'TestOperationalFactPostgresShipmentCancelVsFinishedGoodsQualityCreateUsesOneSourceLock'),
    ]),
  rule('finance-atomicity', '收付款分配、取消与补偿', 'transaction', 'fact-finance',
    '并发分配不得超过未结金额；取消和补偿失败完整回滚，审计只记一次。', [
      source('data/operational_fact_finance_payment_postgres_test.go', 'TestOperationalFactRepoFinancePaymentPostgresAllocationRollbackAndRecovery'),
      source('data/operational_fact_finance_payment_postgres_test.go', 'TestOperationalFactRepoFinancePaymentPostgresConcurrentOutstanding'),
      source('data/finance_fact_cancel_audit_postgres_test.go', 'TestFinanceFactCancelAuditPostgresRollsBackWhenCompensationFails'),
      source('data/finance_fact_cancel_audit_postgres_test.go', 'TestFinanceFactCancelAuditPostgresConcurrentExactReplayReturnsOneAudit'),
    ]),
  rule('workflow-boundary', '协同终态、幂等与事实边界', 'boundary', 'workflow',
    '协同完成不代写库存或财务事实；并发终态只执行一次约定副作用。', [
      source('biz/workflow_production_source_task_transition_test.go', 'TestWorkflowUsecase_ProductionSchedulingDoneConvergesBusinessProjectionWithoutFactWrite', 'server'),
      source('data/workflow_repo_postgres_concurrency_test.go', 'TestWorkflowPostgresConflictingTerminalUpdatesApplySideEffectsOnce'),
      source('data/workflow_repo_postgres_concurrency_test.go', 'TestWorkflowPostgresConcurrentDifferentIntentSameKeyConflicts'),
      source('data/process_runtime_postgres_concurrency_test.go', 'TestProcessRuntimePostgresConcurrentSameIntentExecutionReconcilesOneTerminalResult'),
    ]),
  rule('permission-boundary', '仓库权限与角色聚合写入', 'boundary', 'rbac-api',
    '越权仓库写入在 repository 前拒绝；并发角色设置保留一组完整权限。', [
      source('biz/inventory_usecase_behavior_test.go', 'TestInventoryUsecaseWarehouseScopeRejectsWritesBeforeRepository', 'server'),
      source('data/admin_manage_postgres_concurrency_test.go', 'TestAdminManagePostgresConcurrentRoleSettingsKeepsOneCompleteAggregate'),
    ]),
])

export const businessTestKey = (test) => `${test.package}:${test.name}`

export function businessRuleTests(gate) {
  if (!['server', 'postgres'].includes(gate)) throw new Error('unknown business rule gate')
  return [...new Map(BUSINESS_RULES.flatMap((entry) => entry.tests)
    .filter((test) => test.gate === gate)
    .map((test) => [businessTestKey(test), test])).values()]
}

export const BUSINESS_RULE_DIAGRAMS = Object.freeze({
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
