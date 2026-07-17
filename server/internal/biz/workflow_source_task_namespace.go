package biz

import "strings"

var workflowSourceTaskGroups = [...]string{
	WorkflowSourceTaskProductionSchedulingGroup,
	WorkflowSourceTaskProductionExceptionGroup,
	WorkflowSourceTaskShipmentReleaseGroup,
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

func ValidateWorkflowSourceTaskReservedNamespace(taskGroup, taskCode string) error {
	if IsReservedWorkflowSourceTaskNamespace(taskGroup, taskCode) {
		return ErrWorkflowTaskSourceGeneratedOnly
	}
	return nil
}
