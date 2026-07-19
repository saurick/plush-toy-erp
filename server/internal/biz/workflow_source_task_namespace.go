package biz

import "strings"

var workflowSourceTaskGroups = [...]string{
	WorkflowSourceTaskProductionSchedulingGroup,
	WorkflowSourceTaskProductionExceptionGroup,
	WorkflowSourceTaskShipmentReleaseGroup,
}

// workflowTransitionTaskGroups contains every task group whose status update can
// drive a domain transition or create a downstream task. Public create_task
// callers must never be able to occupy one of these identities, even when they
// initially choose payload or status fields that do not yet match a handler.
var workflowTransitionTaskGroups = [...]string{
	workflowOrderApprovalTaskGroup,
	workflowPurchaseIQCTaskGroup,
	workflowWarehouseInboundTaskGroup,
	workflowOutsourceReturnTrackingTaskGroup,
	workflowOutsourceReturnQCTaskGroup,
	workflowOutsourceWarehouseInboundTaskGroup,
	workflowOutsourceReworkTaskGroup,
	workflowFinishedGoodsQCTaskGroup,
	workflowFinishedGoodsInboundTaskGroup,
	workflowFinishedGoodsReworkTaskGroup,
	WorkflowSourceTaskProductionSchedulingGroup,
	WorkflowSourceTaskProductionExceptionGroup,
	WorkflowSourceTaskShipmentReleaseGroup,
	workflowReceivableRegistrationTaskGroup,
	workflowInvoiceRegistrationTaskGroup,
	workflowPurchasePayableRegistrationGroup,
	workflowOutsourcePayableRegistrationGroup,
	workflowPurchaseReconciliationGroup,
	workflowOutsourceReconciliationGroup,
}

// IsReservedWorkflowSourceTaskNamespace reports whether a task identity belongs
// to the source-generated namespace. The task-code prefixes are derived from
// WorkflowSourceTaskCode so producers and namespace guards cannot drift.
func IsReservedWorkflowSourceTaskNamespace(taskGroup, taskCode string) bool {
	if IsSourceProducedWorkflowTaskGroup(taskGroup) {
		return true
	}
	taskCode = strings.TrimSpace(taskCode)
	if taskCode == "" {
		return false
	}
	for _, sourceTaskGroup := range workflowSourceTaskGroups {
		prefix := strings.TrimSuffix(WorkflowSourceTaskCode(sourceTaskGroup, 0), "0")
		if prefix != "" && strings.HasPrefix(taskCode, prefix) {
			return true
		}
	}
	return false
}

// IsReservedPublicWorkflowTransitionTaskGroup reports whether a task group is
// owned by an internal domain or ProcessRuntime producer. Internal producers
// may use these groups; the public workflow.create_task endpoint may not.
func IsReservedPublicWorkflowTransitionTaskGroup(taskGroup string) bool {
	taskGroup = strings.TrimSpace(taskGroup)
	for _, transitionTaskGroup := range workflowTransitionTaskGroups {
		if taskGroup == transitionTaskGroup {
			return true
		}
	}
	return false
}

// ValidatePublicWorkflowTaskNamespace keeps public task creation in the
// ordinary-collaboration boundary without blocking trusted internal producers.
func ValidatePublicWorkflowTaskNamespace(taskGroup, taskCode string) error {
	if IsReservedWorkflowSourceTaskNamespace(taskGroup, taskCode) ||
		IsReservedPublicWorkflowTransitionTaskGroup(taskGroup) {
		return ErrWorkflowTaskSourceGeneratedOnly
	}
	return nil
}

func ValidateWorkflowSourceTaskReservedNamespace(taskGroup, taskCode string) error {
	if IsReservedWorkflowSourceTaskNamespace(taskGroup, taskCode) {
		return ErrWorkflowTaskSourceGeneratedOnly
	}
	return nil
}
