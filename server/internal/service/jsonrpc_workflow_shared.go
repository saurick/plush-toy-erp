package service

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func unknownWorkflowResult(method string) *v1.JsonrpcResult {
	return &v1.JsonrpcResult{
		Code:    errcode.UnknownMethod.Code,
		Message: fmt.Sprintf("未知 workflow 接口 method=%s", method),
	}
}

func (d *jsonrpcDispatcher) mapWorkflowError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)

	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[workflow] invalid param err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	case errors.Is(err, biz.ErrWorkflowTaskNotFound):
		l.Warnf("[workflow] task not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务不存在"}
	case errors.Is(err, biz.ErrWorkflowTaskExists):
		l.Warnf("[workflow] task exists err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务编码已存在"}
	case errors.Is(err, biz.ErrWorkflowTaskSettled):
		l.Warnf("[workflow] task settled err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "任务已结束，不能再次变更状态"}
	case errors.Is(err, biz.ErrProcessInstanceSettled),
		errors.Is(err, biz.ErrProcessNodeInstanceConflict),
		errors.Is(err, biz.ErrProcessNodeInstanceSettled),
		errors.Is(err, biz.ErrProcessNodeInstanceNotActive):
		l.Warnf("[workflow] linked process state conflict err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "关联流程状态冲突，请刷新后重试"}
	case errors.Is(err, biz.ErrWorkflowBusinessStateFound):
		l.Warnf("[workflow] business state exists err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "业务状态快照已存在"}
	default:
		l.Errorf("[workflow] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func workflowStateOptionsToAny(items []biz.WorkflowStateOption) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"key":     item.Key,
			"label":   item.Label,
			"summary": item.Summary,
		})
	}
	return out
}

func workflowTasksToAny(items []*biz.WorkflowTask) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, workflowTaskToMap(item))
	}
	return out
}

func workflowTaskToMap(task *biz.WorkflowTask) map[string]any {
	if task == nil {
		return nil
	}
	return map[string]any{
		"id":                       task.ID,
		"task_code":                task.TaskCode,
		"task_group":               task.TaskGroup,
		"task_name":                task.TaskName,
		"source_type":              task.SourceType,
		"source_id":                task.SourceID,
		"source_no":                workflowStringValue(task.SourceNo),
		"business_status_key":      workflowStringValue(task.BusinessStatusKey),
		"task_status_key":          task.TaskStatusKey,
		"owner_role_key":           task.OwnerRoleKey,
		"owner_pool_key":           workflowStringValue(task.OwnerPoolKey),
		"required_capability_key":  workflowStringValue(task.RequiredCapabilityKey),
		"config_revision":          workflowStringValue(task.ConfigRevision),
		"process_instance_id":      workflowIntValue(task.ProcessInstanceID),
		"process_node_instance_id": workflowIntValue(task.ProcessNodeInstanceID),
		"assignee_id":              workflowIntValue(task.AssigneeID),
		"priority":                 int(task.Priority),
		"blocked_reason":           workflowStringValue(task.BlockedReason),
		"due_at":                   workflowUnixValue(task.DueAt),
		"started_at":               workflowUnixValue(task.StartedAt),
		"completed_at":             workflowUnixValue(task.CompletedAt),
		"closed_at":                workflowUnixValue(task.ClosedAt),
		"payload":                  workflowMapValue(task.Payload),
		"created_by":               workflowIntValue(task.CreatedBy),
		"updated_by":               workflowIntValue(task.UpdatedBy),
		"created_at":               task.CreatedAt.Unix(),
		"updated_at":               task.UpdatedAt.Unix(),
	}
}

func workflowBusinessStatesToAny(items []*biz.WorkflowBusinessState) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, workflowBusinessStateToMap(item))
	}
	return out
}

func workflowBusinessStateToMap(state *biz.WorkflowBusinessState) map[string]any {
	if state == nil {
		return nil
	}
	return map[string]any{
		"id":                  state.ID,
		"source_type":         state.SourceType,
		"source_id":           state.SourceID,
		"source_no":           workflowStringValue(state.SourceNo),
		"order_id":            workflowIntValue(state.OrderID),
		"batch_id":            workflowIntValue(state.BatchID),
		"business_status_key": state.BusinessStatusKey,
		"owner_role_key":      workflowStringValue(state.OwnerRoleKey),
		"blocked_reason":      workflowStringValue(state.BlockedReason),
		"status_changed_at":   state.StatusChangedAt.Unix(),
		"payload":             workflowMapValue(state.Payload),
		"created_at":          state.CreatedAt.Unix(),
		"updated_at":          state.UpdatedAt.Unix(),
	}
}

func workflowStringValue(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func workflowIntValue(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func workflowUnixValue(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.Unix()
}

func workflowMapValue(value map[string]any) map[string]any {
	if value == nil {
		return map[string]any{}
	}
	return value
}

func getWorkflowStringPtr(m map[string]any, key string) *string {
	if _, ok := m[key]; !ok {
		return nil
	}
	value := strings.TrimSpace(getString(m, key))
	if value == "" {
		return nil
	}
	return &value
}

func getWorkflowPositiveIntPtr(m map[string]any, key string) *int {
	if _, ok := m[key]; !ok {
		return nil
	}
	value := getInt(m, key, 0)
	if value <= 0 {
		return nil
	}
	return &value
}

func getWorkflowPayload(m map[string]any, key string) (map[string]any, bool) {
	raw, ok := m[key]
	if !ok || raw == nil {
		return map[string]any{}, true
	}
	payload, ok := raw.(map[string]any)
	if !ok {
		return nil, false
	}
	return payload, true
}

func getWorkflowPriority(m map[string]any) (int16, bool) {
	value := getInt(m, "priority", 0)
	if value < -32768 || value > 32767 {
		return 0, false
	}
	return int16(value), true
}

func getWorkflowLimit(m map[string]any) int {
	limit := getInt(m, "limit", 50)
	if limit <= 0 {
		return 50
	}
	if limit > 200 {
		return 200
	}
	return limit
}

func getWorkflowOffset(m map[string]any) int {
	offset := getInt(m, "offset", 0)
	if offset < 0 {
		return 0
	}
	return offset
}

func getWorkflowUnixTimePtr(m map[string]any, key string) (*time.Time, bool) {
	raw, ok := m[key]
	if !ok || raw == nil {
		return nil, true
	}

	var unix int64
	switch value := raw.(type) {
	case float64:
		unix = int64(value)
	case int:
		unix = int64(value)
	case int64:
		unix = value
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return nil, true
		}
		parsed, err := strconv.ParseInt(trimmed, 10, 64)
		if err != nil {
			return nil, false
		}
		unix = parsed
	default:
		return nil, false
	}

	if unix <= 0 {
		return nil, true
	}
	value := time.Unix(unix, 0)
	return &value, true
}
