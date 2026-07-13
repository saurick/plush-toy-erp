package biz

import (
	"strings"
)

func isShipmentFinanceSourceType(sourceType string) bool {
	switch strings.TrimSpace(sourceType) {
	case workflowShippingReleaseModuleKey,
		workflowOutboundModuleKey,
		workflowProductionProgressModuleKey,
		workflowReceivablesModuleKey,
		workflowInvoicesModuleKey:
		return true
	default:
		return false
	}
}

func isPayableSourceType(sourceType string) bool {
	switch strings.TrimSpace(sourceType) {
	case workflowAccessoriesPurchaseModuleKey,
		workflowProcessingContractsModuleKey,
		workflowInboundModuleKey,
		workflowPayablesModuleKey,
		workflowReconciliationModuleKey:
		return true
	default:
		return false
	}
}

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

func isOutsourceReturnTrackingTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	if strings.TrimSpace(task.SourceType) != workflowProcessingContractsModuleKey {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowOutsourceReturnTrackingTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "production" {
		return false
	}
	if workflowPayloadString(task.Payload, "outsource_processing") != "true" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowProductionProcessingStatusKey:
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

func isOutsourceWarehouseInboundTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	sourceType := strings.TrimSpace(task.SourceType)
	if sourceType != workflowProcessingContractsModuleKey && sourceType != workflowInboundModuleKey {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowOutsourceWarehouseInboundTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "warehouse" {
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
	case "", workflowWarehouseInboundPendingKey:
		return true
	default:
		return false
	}
}

func isOutsourceReworkTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	sourceType := strings.TrimSpace(task.SourceType)
	if sourceType != workflowProcessingContractsModuleKey && sourceType != workflowInboundModuleKey {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowOutsourceReworkTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "production" {
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
	case "", workflowQCFailedStatusKey:
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

func isFinishedGoodsReworkTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	if strings.TrimSpace(task.SourceType) != workflowProductionProgressModuleKey {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowFinishedGoodsReworkTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "production" {
		return false
	}
	if workflowPayloadString(task.Payload, "finished_goods") != "true" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowQCFailedStatusKey:
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
	case "", workflowShipmentPendingStatusKey, workflowBlockedStatusKey:
		return true
	default:
		return false
	}
}

func isReceivableRegistrationTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	if !isShipmentFinanceSourceType(task.SourceType) {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowReceivableRegistrationTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "finance" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowShippingReleasedStatusKey, workflowReconcilingStatusKey:
		return true
	default:
		return false
	}
}

func isInvoiceRegistrationTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	if !isShipmentFinanceSourceType(task.SourceType) {
		return false
	}
	if strings.TrimSpace(task.TaskGroup) != workflowInvoiceRegistrationTaskGroup ||
		strings.TrimSpace(task.OwnerRoleKey) != "finance" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowReconcilingStatusKey:
		return true
	default:
		return false
	}
}

func isPayableRegistrationTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	if !isPayableSourceType(task.SourceType) {
		return false
	}
	taskGroup := strings.TrimSpace(task.TaskGroup)
	if taskGroup != workflowPurchasePayableRegistrationGroup &&
		taskGroup != workflowOutsourcePayableRegistrationGroup {
		return false
	}
	if strings.TrimSpace(task.OwnerRoleKey) != "finance" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowInboundDoneStatusKey, workflowReconcilingStatusKey:
		return true
	default:
		return false
	}
}

func isPayableReconciliationTask(task *WorkflowTask) bool {
	if task == nil || task.SourceID <= 0 {
		return false
	}
	if !isPayableSourceType(task.SourceType) {
		return false
	}
	taskGroup := strings.TrimSpace(task.TaskGroup)
	if taskGroup != workflowPurchaseReconciliationGroup &&
		taskGroup != workflowOutsourceReconciliationGroup {
		return false
	}
	if strings.TrimSpace(task.OwnerRoleKey) != "finance" {
		return false
	}
	if task.BusinessStatusKey == nil {
		return true
	}
	switch strings.TrimSpace(*task.BusinessStatusKey) {
	case "", workflowReconcilingStatusKey, workflowSettledStatusKey:
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
