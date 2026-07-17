package biz

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	WorkflowSourceTaskContractV1 = "workflow.source-task/v1"

	WorkflowSourceTaskProductionSchedulingGroup = "production_scheduling"
	WorkflowSourceTaskProductionExceptionGroup  = "production_exception"
	WorkflowSourceTaskShipmentReleaseGroup      = "shipment_release"

	WorkflowSourceTaskProductionOrderReleaseProducer = "production_order.release"
	WorkflowSourceTaskProductionReworkPostProducer   = "production_rework.post"
	WorkflowSourceTaskShipmentSubmitReleaseProducer  = "shipment.submit_release"

	WorkflowSourceTaskProductionOrderSourceType = "production-orders"
	WorkflowSourceTaskProductionFactSourceType  = "production-progress"
	WorkflowSourceTaskShipmentSourceType        = "shipments"
)

var ErrWorkflowTaskSourceGeneratedOnly = errors.New("workflow task group is source generated only")

// ProductionExceptionSourceTaskInput carries immutable source snapshots used
// to render a production-rework exception task. The production fact remains
// the source of truth; these fields are never read back as posted facts.
type ProductionExceptionSourceTaskInput struct {
	FactID                 int
	FactNo                 string
	SourceCompletionFactID int
	ProductionOrderID      int
	ProductionOrderNo      string
	ProductionOrderItemID  int
	ProductName            string
	UnitName               string
	Quantity               string
	Reason                 string
	OccurredAt             time.Time
}

func IsSourceProducedWorkflowTaskGroup(taskGroup string) bool {
	switch strings.TrimSpace(taskGroup) {
	case WorkflowSourceTaskProductionSchedulingGroup,
		WorkflowSourceTaskProductionExceptionGroup,
		WorkflowSourceTaskShipmentReleaseGroup:
		return true
	default:
		return false
	}
}

func WorkflowSourceTaskCode(taskGroup string, sourceID int) string {
	switch strings.TrimSpace(taskGroup) {
	case WorkflowSourceTaskProductionSchedulingGroup:
		return fmt.Sprintf("source-production-scheduling-%d", sourceID)
	case WorkflowSourceTaskProductionExceptionGroup:
		return fmt.Sprintf("source-production-exception-%d", sourceID)
	case WorkflowSourceTaskShipmentReleaseGroup:
		return fmt.Sprintf("source-shipment-release-%d", sourceID)
	default:
		return ""
	}
}

func BuildProductionSchedulingSourceTask(source *ProductionOrderAggregate) (*WorkflowTaskCreate, *WorkflowBusinessStateUpsert, error) {
	if source == nil || source.Order == nil || source.Order.ID <= 0 ||
		strings.TrimSpace(source.Order.OrderNo) == "" || source.Order.Status != ProductionOrderStatusReleased || len(source.Items) == 0 {
		return nil, nil, ErrBadParam
	}
	sourceNo := strings.TrimSpace(source.Order.OrderNo)
	businessStatus := workflowProductionReadyStatusKey
	ownerPool := PMCRoleKey
	requiredCapability := PermissionWorkflowTaskComplete
	productNames := make([]string, 0, len(source.Items))
	seenProducts := make(map[string]struct{}, len(source.Items))
	for _, item := range source.Items {
		if item == nil {
			continue
		}
		name := ""
		if item.ProductNameSnapshot != nil {
			name = strings.TrimSpace(*item.ProductNameSnapshot)
		}
		if name == "" {
			continue
		}
		if _, exists := seenProducts[name]; exists {
			continue
		}
		seenProducts[name] = struct{}{}
		productNames = append(productNames, name)
	}
	sort.Strings(productNames)
	payload := map[string]any{
		"source_task_contract":        WorkflowSourceTaskContractV1,
		"source_task_producer":        WorkflowSourceTaskProductionOrderReleaseProducer,
		"record_title":                "生产订单 " + sourceNo,
		"production_order_id":         source.Order.ID,
		"production_order_no":         sourceNo,
		"line_count":                  len(source.Items),
		"product_names":               productNames,
		"material_requirements_state": source.MaterialRequirementsState,
		"business_status_reason":      "生产订单已下达，等待 PMC 完成排产确认。",
		"complete_condition":          "确认计划开工、计划完工、责任产线和生产先后顺序。",
		"entry_path":                  "/erp/production/orders",
		"notification_type":           "task_created",
		"alert_type":                  "production_scheduling_pending",
		"critical_path":               true,
	}
	if source.Order.PlannedStartAt != nil {
		payload["planned_start_at"] = source.Order.PlannedStartAt.UTC().Unix()
	}
	if source.Order.PlannedEndAt != nil {
		payload["planned_end_at"] = source.Order.PlannedEndAt.UTC().Unix()
	}
	task := &WorkflowTaskCreate{
		TaskCode:              WorkflowSourceTaskCode(WorkflowSourceTaskProductionSchedulingGroup, source.Order.ID),
		TaskGroup:             WorkflowSourceTaskProductionSchedulingGroup,
		TaskName:              "安排生产订单 " + sourceNo,
		SourceType:            WorkflowSourceTaskProductionOrderSourceType,
		SourceID:              source.Order.ID,
		SourceNo:              &sourceNo,
		BusinessStatusKey:     &businessStatus,
		TaskStatusKey:         "ready",
		OwnerRoleKey:          PMCRoleKey,
		OwnerPoolKey:          &ownerPool,
		RequiredCapabilityKey: &requiredCapability,
		Priority:              2,
		CriticalPath:          true,
		DueAt:                 source.Order.PlannedStartAt,
		Payload:               payload,
	}
	state := &WorkflowBusinessStateUpsert{
		SourceType:        task.SourceType,
		SourceID:          task.SourceID,
		SourceNo:          task.SourceNo,
		OrderID:           intPointer(source.Order.ID),
		BusinessStatusKey: businessStatus,
		OwnerRoleKey:      stringPointer(PMCRoleKey),
		Payload:           cloneWorkflowSourceTaskPayload(payload),
	}
	return task, state, nil
}

func BuildProductionExceptionSourceTask(source ProductionExceptionSourceTaskInput) (*WorkflowTaskCreate, *WorkflowBusinessStateUpsert, error) {
	source.FactNo = strings.TrimSpace(source.FactNo)
	source.ProductionOrderNo = strings.TrimSpace(source.ProductionOrderNo)
	source.ProductName = strings.TrimSpace(source.ProductName)
	source.UnitName = strings.TrimSpace(source.UnitName)
	source.Quantity = strings.TrimSpace(source.Quantity)
	source.Reason = strings.TrimSpace(source.Reason)
	if source.FactID <= 0 || source.SourceCompletionFactID <= 0 || source.ProductionOrderID <= 0 ||
		source.ProductionOrderItemID <= 0 || source.FactNo == "" || source.ProductionOrderNo == "" ||
		source.Quantity == "" || source.Reason == "" || source.OccurredAt.IsZero() {
		return nil, nil, ErrBadParam
	}
	businessStatus := workflowBlockedStatusKey
	ownerPool := ProductionRoleKey
	requiredCapability := PermissionWorkflowTaskComplete
	payload := map[string]any{
		"source_task_contract":      WorkflowSourceTaskContractV1,
		"source_task_producer":      WorkflowSourceTaskProductionReworkPostProducer,
		"record_title":              "返工记录 " + source.FactNo,
		"production_fact_id":        source.FactID,
		"production_fact_no":        source.FactNo,
		"source_completion_fact_id": source.SourceCompletionFactID,
		"production_order_id":       source.ProductionOrderID,
		"production_order_no":       source.ProductionOrderNo,
		"production_order_item_id":  source.ProductionOrderItemID,
		"product_name":              source.ProductName,
		"quantity":                  source.Quantity,
		"unit":                      source.UnitName,
		"occurred_at":               source.OccurredAt.UTC().Unix(),
		"handling_note":             source.Reason,
		"business_status_reason":    source.Reason,
		"complete_condition":        "记录异常处理结论；返工、报废或库存调整仍须在对应业务页面办理。",
		"entry_path":                "/erp/production/progress",
		"notification_type":         "task_created",
		"alert_type":                "rework_pending",
		"critical_path":             true,
	}
	task := &WorkflowTaskCreate{
		TaskCode:              WorkflowSourceTaskCode(WorkflowSourceTaskProductionExceptionGroup, source.FactID),
		TaskGroup:             WorkflowSourceTaskProductionExceptionGroup,
		TaskName:              "处理返工异常 " + source.FactNo,
		SourceType:            WorkflowSourceTaskProductionFactSourceType,
		SourceID:              source.FactID,
		SourceNo:              &source.FactNo,
		BusinessStatusKey:     &businessStatus,
		TaskStatusKey:         "ready",
		OwnerRoleKey:          ProductionRoleKey,
		OwnerPoolKey:          &ownerPool,
		RequiredCapabilityKey: &requiredCapability,
		Priority:              2,
		CriticalPath:          true,
		Payload:               payload,
	}
	state := &WorkflowBusinessStateUpsert{
		SourceType:        task.SourceType,
		SourceID:          task.SourceID,
		SourceNo:          task.SourceNo,
		OrderID:           intPointer(source.ProductionOrderID),
		BusinessStatusKey: businessStatus,
		OwnerRoleKey:      stringPointer(ProductionRoleKey),
		BlockedReason:     stringPointer(source.Reason),
		Payload:           cloneWorkflowSourceTaskPayload(payload),
	}
	return task, state, nil
}

func BuildShipmentReleaseSourceTask(source *Shipment) (*WorkflowTaskCreate, *WorkflowBusinessStateUpsert, error) {
	if source == nil || source.ID <= 0 || strings.TrimSpace(source.ShipmentNo) == "" ||
		source.Status != ShipmentStatusDraft || len(source.Items) == 0 {
		return nil, nil, ErrBadParam
	}
	sourceNo := strings.TrimSpace(source.ShipmentNo)
	businessStatus := workflowShipmentPendingStatusKey
	ownerPool := WarehouseRoleKey
	requiredCapability := PermissionWorkflowTaskComplete
	payload := map[string]any{
		"source_task_contract":        WorkflowSourceTaskContractV1,
		"source_task_producer":        WorkflowSourceTaskShipmentSubmitReleaseProducer,
		"record_title":                "出货单 " + sourceNo,
		"shipment_id":                 source.ID,
		"shipment_no":                 sourceNo,
		"line_count":                  len(source.Items),
		"business_status_reason":      "出货单已提交放行，等待仓库确认出货条件。",
		"complete_condition":          "确认出货资料、装箱唛头和放行条件；完成任务不等于实际出货。",
		"entry_path":                  "/erp/warehouse/shipments",
		"notification_type":           "task_created",
		"alert_type":                  "shipment_pending",
		"shipment_release":            true,
		"shipment_execution_required": true,
		"inventory_out_deferred":      true,
		"critical_path":               true,
	}
	if source.CustomerSnapshot != nil && strings.TrimSpace(*source.CustomerSnapshot) != "" {
		payload["customer_name"] = strings.TrimSpace(*source.CustomerSnapshot)
	}
	if source.PlannedShipAt != nil {
		payload["planned_ship_at"] = source.PlannedShipAt.UTC().Unix()
	}
	task := &WorkflowTaskCreate{
		TaskCode:              WorkflowSourceTaskCode(WorkflowSourceTaskShipmentReleaseGroup, source.ID),
		TaskGroup:             WorkflowSourceTaskShipmentReleaseGroup,
		TaskName:              "确认出货放行 " + sourceNo,
		SourceType:            WorkflowSourceTaskShipmentSourceType,
		SourceID:              source.ID,
		SourceNo:              &sourceNo,
		BusinessStatusKey:     &businessStatus,
		TaskStatusKey:         "ready",
		OwnerRoleKey:          WarehouseRoleKey,
		OwnerPoolKey:          &ownerPool,
		RequiredCapabilityKey: &requiredCapability,
		Priority:              2,
		CriticalPath:          true,
		DueAt:                 source.PlannedShipAt,
		Payload:               payload,
	}
	state := &WorkflowBusinessStateUpsert{
		SourceType:        task.SourceType,
		SourceID:          task.SourceID,
		SourceNo:          task.SourceNo,
		BusinessStatusKey: businessStatus,
		OwnerRoleKey:      stringPointer(WarehouseRoleKey),
		Payload:           cloneWorkflowSourceTaskPayload(payload),
	}
	return task, state, nil
}

func WorkflowTaskMatchesSourceProducer(current *WorkflowTask, expected *WorkflowTaskCreate) bool {
	if current == nil || expected == nil {
		return false
	}
	return current.TaskCode == expected.TaskCode &&
		current.TaskGroup == expected.TaskGroup &&
		current.SourceType == expected.SourceType &&
		current.SourceID == expected.SourceID &&
		current.OwnerRoleKey == expected.OwnerRoleKey &&
		workflowPayloadString(current.Payload, "source_task_contract") == WorkflowSourceTaskContractV1 &&
		workflowPayloadString(current.Payload, "source_task_producer") == workflowPayloadString(expected.Payload, "source_task_producer")
}

func IsTrustedShipmentReleaseSourceTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	return strings.TrimSpace(task.TaskGroup) == WorkflowSourceTaskShipmentReleaseGroup &&
		strings.TrimSpace(task.SourceType) == WorkflowSourceTaskShipmentSourceType &&
		strings.TrimSpace(task.TaskCode) == WorkflowSourceTaskCode(WorkflowSourceTaskShipmentReleaseGroup, task.SourceID) &&
		workflowPayloadString(task.Payload, "source_task_contract") == WorkflowSourceTaskContractV1 &&
		workflowPayloadString(task.Payload, "source_task_producer") == WorkflowSourceTaskShipmentSubmitReleaseProducer
}

func IsTrustedProductionSchedulingSourceTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	return strings.TrimSpace(task.TaskGroup) == WorkflowSourceTaskProductionSchedulingGroup &&
		strings.TrimSpace(task.SourceType) == WorkflowSourceTaskProductionOrderSourceType &&
		strings.TrimSpace(task.TaskCode) == WorkflowSourceTaskCode(WorkflowSourceTaskProductionSchedulingGroup, task.SourceID) &&
		workflowPayloadString(task.Payload, "source_task_contract") == WorkflowSourceTaskContractV1 &&
		workflowPayloadString(task.Payload, "source_task_producer") == WorkflowSourceTaskProductionOrderReleaseProducer
}

func IsTrustedProductionExceptionSourceTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	return strings.TrimSpace(task.TaskGroup) == WorkflowSourceTaskProductionExceptionGroup &&
		strings.TrimSpace(task.SourceType) == WorkflowSourceTaskProductionFactSourceType &&
		strings.TrimSpace(task.TaskCode) == WorkflowSourceTaskCode(WorkflowSourceTaskProductionExceptionGroup, task.SourceID) &&
		workflowPayloadString(task.Payload, "source_task_contract") == WorkflowSourceTaskContractV1 &&
		workflowPayloadString(task.Payload, "source_task_producer") == WorkflowSourceTaskProductionReworkPostProducer
}

func cloneWorkflowSourceTaskPayload(payload map[string]any) map[string]any {
	out := make(map[string]any, len(payload))
	for key, value := range payload {
		out[key] = value
	}
	return out
}

func intPointer(value int) *int { return &value }

func stringPointer(value string) *string { return &value }
