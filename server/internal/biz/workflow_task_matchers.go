package biz

import (
	"strings"
)

func isBossOrderApprovalTask(task *WorkflowTask) bool {
	if task == nil {
		return false
	}
	return strings.TrimSpace(task.SourceType) == workflowProjectOrderModuleKey &&
		strings.TrimSpace(task.TaskGroup) == workflowOrderApprovalTaskGroup &&
		strings.TrimSpace(task.OwnerRoleKey) == "boss"
}

func isPurchaseIQCTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	sourceType := strings.TrimSpace(task.SourceType)
	if sourceType != workflowAccessoriesPurchaseModuleKey && sourceType != workflowInboundModuleKey {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowPurchaseIQCTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "quality" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowIQCPendingStatusKey, workflowWarehouseInboundPendingKey, workflowQCFailedStatusKey:
		return true
	default:
		return false
	}
}

func isPurchaseWarehouseInboundTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	sourceType := strings.TrimSpace(task.SourceType)
	if sourceType != workflowAccessoriesPurchaseModuleKey && sourceType != workflowInboundModuleKey {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowWarehouseInboundTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "warehouse" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowWarehouseInboundPendingKey:
		return true
	default:
		return false
	}
}

func isOutsourceReturnQCTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	sourceType := strings.TrimSpace(task.SourceType)
	if sourceType != workflowProcessingContractsModuleKey && sourceType != workflowInboundModuleKey {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowOutsourceReturnQCTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "quality" {
		return false
	}
	if workflowPayloadString(task.Payload, "qc_type") != "outsource_return" &&
		workflowPayloadString(task.Payload, "outsource_processing") != "true" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowQCPendingStatusKey, workflowQCFailedStatusKey:
		return true
	default:
		return false
	}
}

func isFinishedGoodsQCTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	if strings.TrimSpace(task.SourceType) != workflowProductionProgressModuleKey {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowFinishedGoodsQCTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "quality" {
		return false
	}
	if workflowPayloadString(task.Payload, "finished_goods") != "true" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowQCPendingStatusKey, workflowQCFailedStatusKey:
		return true
	default:
		return false
	}
}

func isFinishedGoodsInboundTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	if strings.TrimSpace(task.SourceType) != workflowProductionProgressModuleKey {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowFinishedGoodsInboundTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "warehouse" {
		return false
	}
	if workflowPayloadString(task.Payload, "finished_goods") != "true" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowWarehouseInboundPendingKey, workflowBlockedStatusKey:
		return true
	default:
		return false
	}
}

func isShipmentReleaseTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	switch strings.TrimSpace(task.SourceType) {
	case workflowShippingReleaseModuleKey, workflowProductionProgressModuleKey, workflowInboundModuleKey:
	default:
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowShipmentReleaseTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "warehouse" {
		return false
	}
	if workflowPayloadString(task.Payload, "shipment_release") != "true" &&
		workflowPayloadString(task.Payload, "finished_goods") != "true" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowShipmentReleasePendingStatusKey, workflowShipmentPendingStatusKey, workflowBlockedStatusKey:
		return true
	default:
		return false
	}
}

func workflowTransitionReason(in *WorkflowTaskStatusUpdate, taskStatusKey string) string {
	if in == nil {
		return ""
	}
	if reason := strings.TrimSpace(in.Reason); reason != "" {
		return reason
	}
	if reason := workflowPayloadString(in.Payload, "reason"); reason != "" {
		return reason
	}
	switch taskStatusKey {
	case "blocked":
		if reason := workflowPayloadString(in.Payload, "blocked_reason"); reason != "" {
			return reason
		}
	case "rejected":
		if reason := workflowPayloadString(in.Payload, "rejected_reason"); reason != "" {
			return reason
		}
	}
	return ""
}
