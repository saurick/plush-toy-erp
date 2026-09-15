package biz

import (
	"fmt"
	"sort"
	"strings"
)

const (
	WorkflowMaterialBossReviewGroup    = "engineering_material_boss_review"
	WorkflowMaterialFinanceReviewGroup = "engineering_material_finance_review"
	WorkflowMaterialRevisionGroup      = "engineering_material_revision"
	WorkflowMaterialRequestSourceType  = "engineering_material_request"
	workflowMaterialRequestProducer    = "engineering_material_request.approval"
)

func IsEngineeringMaterialTaskGroup(group string) bool {
	switch strings.TrimSpace(group) {
	case WorkflowMaterialBossReviewGroup, WorkflowMaterialFinanceReviewGroup, WorkflowMaterialRevisionGroup:
		return true
	default:
		return false
	}
}

func materialTaskResponsibility(group string) (string, string, string) {
	switch group {
	case WorkflowMaterialBossReviewGroup:
		return BossRoleKey, PermissionEngineeringMaterialBossApprove, "审核工程用料"
	case WorkflowMaterialFinanceReviewGroup:
		return FinanceRoleKey, PermissionEngineeringMaterialFinanceApprove, "核价并批准采购用料"
	case WorkflowMaterialRevisionGroup:
		return EngineeringRoleKey, PermissionEngineeringMaterialSubmit, "修改用料并重新提交"
	default:
		return "", "", ""
	}
}

// The request owns approval and purchase generation. Tasks only carry the
// source identity and the human handoff, and never duplicate its material rows.
func BuildEngineeringMaterialTask(request *EngineeringMaterialRequest) (*WorkflowTaskCreate, error) {
	if request == nil || request.ID <= 0 || request.SalesOrderID <= 0 || strings.TrimSpace(request.OrderNo) == "" {
		return nil, ErrBadParam
	}
	group := ""
	switch request.Status {
	case MaterialRequestSubmitted:
		group = WorkflowMaterialBossReviewGroup
	case MaterialRequestBossApproved:
		group = WorkflowMaterialFinanceReviewGroup
	case MaterialRequestRejected:
		group = WorkflowMaterialRevisionGroup
	default:
		return nil, ErrBadParam
	}
	role, capability, name := materialTaskResponsibility(group)
	products := map[string]bool{}
	for _, source := range request.Sources {
		name := ""
		switch value := source["product_name"].(type) {
		case string:
			name = value
		case *string:
			if value != nil {
				name = *value
			}
		}
		if name = strings.TrimSpace(name); name != "" {
			products[name] = true
		}
	}
	productNames := make([]string, 0, len(products))
	for name := range products {
		productNames = append(productNames, name)
	}
	sort.Strings(productNames)
	payload := map[string]any{
		"source_task_contract":            WorkflowSourceTaskContractV1,
		"source_task_producer":            workflowMaterialRequestProducer,
		"engineering_material_request_id": request.ID,
		"sales_order_id":                  request.SalesOrderID,
		"order_no":                        request.OrderNo,
		"product_names":                   productNames,
		"record_title":                    "工程用料 · " + request.OrderNo,
		"entry_path":                      fmt.Sprintf("/erp/sales/project-orders/sales-orders?material_request_id=%d&sales_order_id=%d", request.ID, request.SalesOrderID),
		"complete_condition":              "打开材料汇总表核对用料，并在表内提交或审批。",
	}
	if group == WorkflowMaterialRevisionGroup && request.ReviewNote != nil {
		payload["business_status_reason"] = *request.ReviewNote
	}
	return &WorkflowTaskCreate{
		TaskCode: WorkflowSourceTaskCode(group, request.ID), TaskGroup: group,
		TaskName: name, SourceType: WorkflowMaterialRequestSourceType, SourceID: request.ID,
		SourceNo: stringPointer(request.OrderNo), TaskStatusKey: "ready", OwnerRoleKey: role,
		OwnerPoolKey: stringPointer(role), RequiredCapabilityKey: stringPointer(capability),
		Priority: 2, Payload: payload,
	}, nil
}

func IsTrustedEngineeringMaterialTask(task *WorkflowTask) bool {
	if task == nil || !IsEngineeringMaterialTaskGroup(task.TaskGroup) || task.SourceID <= 0 {
		return false
	}
	role, capability, _ := materialTaskResponsibility(task.TaskGroup)
	requestID, found, err := processCommandPositiveIntFromPayload(task.Payload, "engineering_material_request_id")
	orderID, orderFound, orderErr := processCommandPositiveIntFromPayload(task.Payload, "sales_order_id")
	return err == nil && found && requestID == task.SourceID && orderErr == nil && orderFound && orderID > 0 &&
		task.SourceType == WorkflowMaterialRequestSourceType && task.TaskCode == WorkflowSourceTaskCode(task.TaskGroup, task.SourceID) &&
		task.OwnerRoleKey == role && task.RequiredCapabilityKey != nil && *task.RequiredCapabilityKey == capability &&
		workflowPayloadString(task.Payload, "source_task_contract") == WorkflowSourceTaskContractV1 &&
		workflowPayloadString(task.Payload, "source_task_producer") == workflowMaterialRequestProducer && workflowSourceTaskIntentMarkerValid(task.Payload)
}
