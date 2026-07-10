package biz

import "strings"

const (
	workflowProjectOrderModuleKey              = "project-orders"
	workflowMaterialBOMModuleKey               = "material-bom"
	workflowAccessoriesPurchaseModuleKey       = "accessories-purchase"
	workflowInboundModuleKey                   = "inbound"
	workflowProcessingContractsModuleKey       = "processing-contracts"
	workflowProductionProgressModuleKey        = "production-progress"
	workflowShippingReleaseModuleKey           = "shipping-release"
	workflowOutboundModuleKey                  = "outbound"
	workflowReceivablesModuleKey               = "receivables"
	workflowInvoicesModuleKey                  = "invoices"
	workflowPayablesModuleKey                  = "payables"
	workflowReconciliationModuleKey            = "reconciliation"
	workflowOrderApprovalTaskGroup             = "order_approval"
	workflowEngineeringDataTaskGroup           = "engineering_data"
	workflowOrderRevisionTaskGroup             = "order_revision"
	workflowPurchaseIQCTaskGroup               = "purchase_iqc"
	workflowWarehouseInboundTaskGroup          = "warehouse_inbound"
	workflowPurchaseQualityExceptionGroup      = "purchase_quality_exception"
	workflowOutsourceReturnTrackingTaskGroup   = "outsource_return_tracking"
	workflowOutsourceReturnQCTaskGroup         = "outsource_return_qc"
	workflowOutsourceWarehouseInboundTaskGroup = "outsource_warehouse_inbound"
	workflowOutsourceReworkTaskGroup           = "outsource_rework"
	workflowPurchasePayableRegistrationGroup   = "purchase_payable_registration"
	workflowOutsourcePayableRegistrationGroup  = "outsource_payable_registration"
	workflowPurchaseReconciliationGroup        = "purchase_reconciliation"
	workflowOutsourceReconciliationGroup       = "outsource_reconciliation"
	workflowFinishedGoodsQCTaskGroup           = "finished_goods_qc"
	workflowFinishedGoodsInboundTaskGroup      = "finished_goods_inbound"
	workflowFinishedGoodsReworkTaskGroup       = "finished_goods_rework"
	workflowShipmentReleaseTaskGroup           = "shipment_release"
	workflowReceivableRegistrationTaskGroup    = "receivable_registration"
	workflowInvoiceRegistrationTaskGroup       = "invoice_registration"
	workflowOrderApprovalStatusKey             = "project_pending"
	workflowOrderApprovedStatusKey             = "project_approved"
	workflowEngineeringPreparingStatusKey      = "engineering_preparing"
	workflowProductionProcessingStatusKey      = "production_processing"
	workflowQCPendingStatusKey                 = "qc_pending"
	workflowIQCPendingStatusKey                = "iqc_pending"
	workflowQCFailedStatusKey                  = "qc_failed"
	workflowWarehouseInboundPendingKey         = "warehouse_inbound_pending"
	workflowInboundDoneStatusKey               = "inbound_done"
	workflowShipmentPendingStatusKey           = "shipment_pending"
	workflowShipmentReleasePendingStatusKey    = "shipment_release_pending"
	workflowShippingReleasedStatusKey          = "shipping_released"
	workflowReconcilingStatusKey               = "reconciling"
	workflowSettledStatusKey                   = "settled"
	workflowBlockedStatusKey                   = "blocked"
)

type WorkflowStateOption struct {
	Key     string
	Label   string
	Summary string
}

var workflowTaskStates = []WorkflowStateOption{
	{Key: "pending", Label: "待开始", Summary: "任务已创建，但前置条件还没齐，暂时不能开工。"},
	{Key: "ready", Label: "可执行", Summary: "上游单据、资料或齐套条件已满足，可以正式开始。"},
	{Key: "processing", Label: "处理中", Summary: "已有责任人接手，当前任务正在推进。"},
	{Key: "blocked", Label: "阻塞", Summary: "被缺料、缺资料、未放行或异常等外部条件卡住。"},
	{Key: "done", Label: "已完成", Summary: "当前任务的完成条件已经达到，可进入下游节点。"},
	{Key: "rejected", Label: "已退回", Summary: "审批、检验或确认动作未通过，需要回退上一责任人。"},
	{Key: "cancelled", Label: "已取消", Summary: "因订单取消、方案切换或需求撤销而失效。"},
	{Key: "closed", Label: "已关闭", Summary: "主链闭环后归档关闭，不再继续推进。"},
}

var workflowBusinessStates = []WorkflowStateOption{
	{Key: "project_pending", Label: "立项待确认", Summary: "客户、编号、交期和资料前置条件正在收口。"},
	{Key: "project_approved", Label: "立项已放行", Summary: "已通过老板或管理层审批，允许进入资料与采购准备。"},
	{Key: "engineering_preparing", Label: "资料准备中", Summary: "BOM、色卡、作业指导书和包装要求正在补齐。"},
	{Key: "material_preparing", Label: "齐套准备中", Summary: "主料、辅包材、委外和关键资料仍在确认或催办。"},
	{Key: "production_ready", Label: "待排产", Summary: "齐套条件已满足，等待生产经理做排单决策。"},
	{Key: "production_processing", Label: "生产中", Summary: "已进入裁切、车缝、手工、组装或外发执行。"},
	{Key: "qc_pending", Label: "待检验", Summary: "待做 IQC、过程检验、返工复检或出货前质量确认。"},
	{Key: "iqc_pending", Label: "IQC 待检", Summary: "采购到货或入库通知已形成，等待品质做来料检验。"},
	{Key: "qc_failed", Label: "质检不合格", Summary: "来料、回货或成品检验未通过，等待责任角色处理退货、返工、补做或让步接收。"},
	{Key: "warehouse_processing", Label: "待入库 / 待出货", Summary: "仓库正在做回仓、入库、备货和待出货准备。"},
	{Key: "warehouse_inbound_pending", Label: "待确认入库", Summary: "品质已放行，等待仓库确认入库数量、库位和经手人。"},
	{Key: "inbound_done", Label: "入库协同已完成", Summary: "相关交接任务已经完成；实际库存以入库单过账结果为准。"},
	{Key: "shipment_pending", Label: "待出货", Summary: "成品已入库或放行，等待出货准备、装箱、唛头和出库确认。"},
	{Key: "shipping_released", Label: "已放行待出库", Summary: "业务确认和财务放行已完成，等待仓库出库执行。"},
	{Key: "shipped", Label: "出货协同已完成", Summary: "出货链路已完成；实际出货数量和库存扣减以出货单为准。"},
	{Key: "reconciling", Label: "对账中", Summary: "加工费、辅包材费用和异常费用正在核对。"},
	{Key: "settled", Label: "结算协同已完成", Summary: "对账交接已经完成；实际应收应付和收付款以业务财务记录为准。"},
	{Key: "blocked", Label: "业务阻塞", Summary: "主链被缺料、延期、未放行、数量差异或异常问题卡住。"},
	{Key: "cancelled", Label: "业务取消", Summary: "订单或批次被整体取消，不再继续推进。"},
	{Key: "closed", Label: "业务归档", Summary: "主链已完成并归档，保留历史快照与追溯记录。"},
}

var workflowPlanningPhases = []WorkflowStateOption{
	{Key: "source_locked", Label: "真源已收口", Summary: "先明确当前唯一真源字段、单据和业务节点。"},
	{Key: "page_defined", Label: "页面已收口", Summary: "菜单、角色入口和工作台卡片范围已确定。"},
	{Key: "status_defined", Label: "状态已统一", Summary: "任务状态、业务状态和阻塞原因已形成统一字典。"},
	{Key: "schema_v1_ready", Label: "Schema v1 已落地", Summary: "workflow、V1 主数据和事实层表已通过 Ent + Atlas 管理；旧通用业务记录表族已删除。"},
	{Key: "api_v1_ready", Label: "API v1 已接通", Summary: "workflow 与 business JSON-RPC 已支持当前表格、弹窗和任务池主路径。"},
	{Key: "save_link_v1_ready", Label: "保存链路 v1 已接通", Summary: "正式 V1 页面写对应领域表；Workflow 只写协同任务和状态投影，不再写旧通用业务记录。"},
}

var (
	workflowTaskStateSet      = buildWorkflowStateSet(workflowTaskStates)
	workflowBusinessStateSet  = buildWorkflowStateSet(workflowBusinessStates)
	workflowTaskUrgeActionSet = map[string]struct{}{
		"urge_task":        {},
		"urge_role":        {},
		"urge_assignee":    {},
		"escalate_to_pmc":  {},
		"escalate_to_boss": {},
	}
)

func buildWorkflowStateSet(items []WorkflowStateOption) map[string]struct{} {
	out := make(map[string]struct{}, len(items))
	for _, item := range items {
		out[item.Key] = struct{}{}
	}
	return out
}

func WorkflowTaskStates() []WorkflowStateOption {
	out := make([]WorkflowStateOption, len(workflowTaskStates))
	copy(out, workflowTaskStates)
	return out
}

func WorkflowBusinessStates() []WorkflowStateOption {
	out := make([]WorkflowStateOption, len(workflowBusinessStates))
	copy(out, workflowBusinessStates)
	return out
}

func WorkflowPlanningPhases() []WorkflowStateOption {
	out := make([]WorkflowStateOption, len(workflowPlanningPhases))
	copy(out, workflowPlanningPhases)
	return out
}

func IsValidWorkflowTaskState(key string) bool {
	_, ok := workflowTaskStateSet[strings.TrimSpace(key)]
	return ok
}

func IsValidWorkflowBusinessState(key string) bool {
	_, ok := workflowBusinessStateSet[strings.TrimSpace(key)]
	return ok
}

func IsValidWorkflowTaskUrgeAction(action string) bool {
	_, ok := workflowTaskUrgeActionSet[strings.TrimSpace(action)]
	return ok
}

func IsTerminalWorkflowTaskStatus(statusKey string) bool {
	switch strings.TrimSpace(statusKey) {
	case "done", "rejected", "cancelled", "closed":
		return true
	default:
		return false
	}
}

func WorkflowStatusActionPermission(nextStatusKey string, current *WorkflowTask) string {
	switch strings.TrimSpace(nextStatusKey) {
	case "done":
		if isBossOrderApprovalTask(current) {
			return PermissionWorkflowTaskApprove
		}
		return PermissionWorkflowTaskComplete
	case "rejected":
		return PermissionWorkflowTaskReject
	default:
		return PermissionWorkflowTaskUpdate
	}
}

func CanAdminHandleWorkflowTask(admin *AdminUser, task *WorkflowTask, nextStatusKey string) bool {
	if admin == nil || admin.Disabled || task == nil {
		return false
	}
	if IsTerminalWorkflowTaskStatus(task.TaskStatusKey) {
		return false
	}
	nextStatusKey = strings.TrimSpace(nextStatusKey)
	if nextStatusKey == "" || !IsValidWorkflowTaskState(nextStatusKey) {
		return false
	}
	if task.AssigneeID != nil {
		return *task.AssigneeID == admin.ID
	}
	return AdminHasRole(admin, task.OwnerRoleKey)
}

func CanAdminUrgeWorkflowTask(admin *AdminUser, task *WorkflowTask) bool {
	if admin == nil || admin.Disabled || task == nil {
		return false
	}
	if IsTerminalWorkflowTaskStatus(task.TaskStatusKey) {
		return false
	}
	if admin.IsSuperAdmin || AdminHasRole(admin, PMCRoleKey) || AdminHasRole(admin, BossRoleKey) {
		return true
	}
	if task.AssigneeID != nil {
		return *task.AssigneeID == admin.ID
	}
	return AdminHasRole(admin, task.OwnerRoleKey)
}
