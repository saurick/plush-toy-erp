package biz

import (
	"fmt"
	"strings"
)

const (
	workflowTaskAssignmentAuditEventType = "workflow_task_assignment"
	workflowTaskAssignmentAuditEventKey  = "workflow_task.reassign"
	workflowTaskAssignmentAuditSource    = "workflow"
)

func BuildWorkflowTaskAssignmentAuditEvent(
	operator *AdminUser,
	task *WorkflowTask,
	targetAssignee *AdminUser,
	releaseToPool bool,
	reason string,
) (*RuntimeAuditEventCreate, error) {
	if operator == nil || task == nil {
		return nil, ErrBadParam
	}
	reason = strings.TrimSpace(reason)
	if reason == "" || releaseToPool == (targetAssignee != nil) {
		return nil, ErrBadParam
	}
	targetKey := strings.TrimSpace(task.TaskCode)
	if targetKey == "" {
		targetKey = fmt.Sprintf("workflow_task/%d", task.ID)
	}
	var nextAssignee map[string]any
	if targetAssignee != nil {
		nextAssignee = map[string]any{
			"id":        targetAssignee.ID,
			"username":  targetAssignee.Username,
			"role_keys": AdminRoleKeys(targetAssignee),
		}
	}
	payload := map[string]any{
		"action": workflowTaskAssignmentAuditEventKey,
		"actor": map[string]any{
			"id":             operator.ID,
			"username":       operator.Username,
			"role_keys":      AdminRoleKeys(operator),
			"is_super_admin": operator.IsSuperAdmin,
		},
		"target": map[string]any{
			"type": "workflow_task",
			"id":   task.ID,
			"key":  targetKey,
		},
		"before": map[string]any{
			"assignee_id": task.AssigneeID,
		},
		"after": map[string]any{
			"assignee":        nextAssignee,
			"release_to_pool": releaseToPool,
		},
		"reason": reason,
		"task": map[string]any{
			"task_group":      task.TaskGroup,
			"source_type":     task.SourceType,
			"source_id":       task.SourceID,
			"owner_role_key":  task.OwnerRoleKey,
			"task_status_key": task.TaskStatusKey,
		},
	}
	return &RuntimeAuditEventCreate{
		EventType: workflowTaskAssignmentAuditEventType,
		EventKey:  workflowTaskAssignmentAuditEventKey,
		Source:    workflowTaskAssignmentAuditSource,
		Payload:   payload,
	}, nil
}
