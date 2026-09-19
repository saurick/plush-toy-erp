package biz

import (
	"fmt"
	"strings"
)

// Fulfillment tasks are projections of source records. Only the source usecase
// may settle them; the workflow service never performs the underlying work.
const FulfillmentTaskProducer = "fulfillment.source"

type FulfillmentTaskSpec struct {
	Name, SourceType, Role, Capability, ReadCapability, EntryPath string
}

var fulfillmentTaskSpecs = map[string]FulfillmentTaskSpec{
	"production_return":     {"登记工序回货", "production_wip_batch", WarehouseRoleKey, PermissionOutsourcingReturnReceiptCreate, PermissionProductionWIPRead, ""},
	"purchase_arrival":      {"登记采购到货", "purchase_order", QualityRoleKey, PermissionPurchaseReceiptCreate, PermissionPurchaseOrderRead, "/erp/purchase/accessories?purchase_order_id=%d"},
	"receipt_quality":       {"办理来料检验", "quality_inspection", QualityRoleKey, PermissionQualityInspectionUpdate, PermissionQualityInspectionRead, "/erp/production/quality-inspections?quality_inspection_id=%d"},
	"receipt_inbound":       {"确认材料入库", "purchase_receipt", WarehouseRoleKey, PermissionWarehouseInboundConfirm, PermissionPurchaseReceiptRead, "/erp/warehouse/inbound?receipt_id=%d"},
	"receipt_exception":     {"处理来料不合格", "purchase_receipt", PurchaseRoleKey, PermissionPurchaseReturnCreate, PermissionQualityInspectionRead, "/erp/production/quality-inspections?purchase_receipt_id=%d"},
	"outsourcing_contract":  {"补价并确认加工合同", "outsourcing_order", FinanceRoleKey, PermissionOutsourcingOrderConfirm, PermissionOutsourcingOrderRead, "/erp/purchase/processing-contracts?outsourcing_order_id=%d"},
	"outsourcing_issue":     {"办理加工发料", "outsourcing_order", WarehouseRoleKey, PermissionOutsourcingMaterialIssueCreate, PermissionOutsourcingOrderRead, "/erp/purchase/processing-contracts?outsourcing_order_id=%d"},
	"outsourcing_return":    {"登记加工回货", "outsourcing_order", WarehouseRoleKey, PermissionOutsourcingReturnReceiptCreate, PermissionOutsourcingOrderRead, "/erp/purchase/processing-contracts?outsourcing_order_id=%d"},
	"outsourcing_quality":   {"办理加工回货检验", "quality_inspection", QualityRoleKey, PermissionQualityInspectionUpdate, PermissionQualityInspectionRead, "/erp/production/quality-inspections?quality_inspection_id=%d"},
	"outsourcing_inbound":   {"确认加工回货入库", "outsourcing_fact", WarehouseRoleKey, PermissionOutsourcingFactPost, PermissionOutsourcingFactRead, ""},
	"production_execute":    {"安排并办理本工序", "production_wip_batch", ProductionRoleKey, PermissionProductionWIPExecute, PermissionProductionWIPRead, ""},
	"production_quality":    {"办理工序检验", "quality_inspection", QualityRoleKey, PermissionQualityInspectionUpdate, PermissionQualityInspectionRead, "/erp/production/quality-inspections?quality_inspection_id=%d"},
	"production_transfer":   {"移交下一工序", "production_wip_batch", ProductionRoleKey, PermissionProductionWIPExecute, PermissionProductionWIPRead, ""},
	"production_exception":  {"处理工序不合格", "production_wip_batch", ProductionRoleKey, PermissionProductionWIPRework, PermissionProductionWIPRead, ""},
	"production_packaging":  {"确认包装版本", "production_packaging_confirmation", SalesRoleKey, PermissionPackagingMaterialConfirm, PermissionProductionWIPRead, ""},
	"production_completion": {"登记成品完工", "production_wip_batch", ProductionRoleKey, PermissionProductionCompletionCreate, PermissionProductionWIPRead, ""},
	"production_inbound":    {"确认成品入库", "production_fact", WarehouseRoleKey, PermissionWarehouseInboundConfirm, PermissionProductionFactRead, "/erp/production/progress?fact_id=%d"},
}

func FulfillmentTaskSpecFor(group string) (FulfillmentTaskSpec, bool) {
	spec, ok := fulfillmentTaskSpecs[strings.TrimPrefix(group, "handoff_")]
	return spec, ok && strings.HasPrefix(group, "handoff_")
}

func IsFulfillmentTaskGroup(group string) bool {
	_, ok := FulfillmentTaskSpecFor(group)
	return ok
}

func BuildFulfillmentTask(kind string, id int, sourceNo, entryPath string) (*WorkflowTaskCreate, error) {
	group := "handoff_" + kind
	spec, ok := FulfillmentTaskSpecFor(group)
	if !ok || id <= 0 {
		return nil, ErrBadParam
	}
	if spec.EntryPath != "" {
		entryPath = fmt.Sprintf(spec.EntryPath, id)
	}
	if entryPath == "" {
		return nil, ErrBadParam
	}
	return &WorkflowTaskCreate{
		TaskCode: WorkflowSourceTaskCode(group, id), TaskGroup: group,
		TaskName: spec.Name, SourceType: spec.SourceType, SourceID: id, SourceNo: &sourceNo,
		OwnerRoleKey: spec.Role, OwnerPoolKey: &spec.Role, RequiredCapabilityKey: &spec.Capability,
		TaskStatusKey: "ready", Priority: 0,
		Payload: map[string]any{"source_task_contract": WorkflowSourceTaskContractV1,
			"source_task_producer": FulfillmentTaskProducer, "source_record_id": id,
			"entry_path": entryPath, "complete_condition": "办理来源单据后自动更新待办"},
	}, nil
}

func IsTrustedFulfillmentTask(task *WorkflowTask) bool {
	if task == nil {
		return false
	}
	spec, ok := FulfillmentTaskSpecFor(task.TaskGroup)
	sourceID, err := processPositiveIntFromAny(task.Payload["source_record_id"])
	return err == nil && sourceID == task.SourceID && ok && task.SourceID > 0 && task.SourceType == spec.SourceType &&
		task.TaskCode == WorkflowSourceTaskCode(task.TaskGroup, task.SourceID) &&
		task.OwnerRoleKey == spec.Role && task.RequiredCapabilityKey != nil && *task.RequiredCapabilityKey == spec.Capability &&
		task.Payload["source_task_contract"] == WorkflowSourceTaskContractV1 &&
		task.Payload["source_task_producer"] == FulfillmentTaskProducer && workflowSourceTaskIntentMarkerValid(task.Payload)
}
