package biz

import (
	"context"
	"strings"
	"time"
)

const (
	WorkflowTaskBoardLaneActionable = "actionable"
	WorkflowTaskBoardLaneException  = "exception"
	WorkflowTaskBoardLaneDue        = "due"
	WorkflowTaskBoardLaneFinished   = "finished"

	WorkflowTaskBoardDueWindow    = 24 * time.Hour
	workflowTaskBoardDefaultLimit = 5
	workflowTaskBoardMaxLimit     = 50
)

var workflowTaskBoardLaneKeys = []string{
	WorkflowTaskBoardLaneActionable,
	WorkflowTaskBoardLaneException,
	WorkflowTaskBoardLaneDue,
	WorkflowTaskBoardLaneFinished,
}

var workflowTaskBoardFilterStatuses = map[string]struct{}{
	"":         {},
	"all":      {},
	"ready":    {},
	"blocked":  {},
	"rejected": {},
	"done":     {},
	"overdue":  {},
	"dueSoon":  {},
}

var workflowTaskBoardDueFilters = map[string]struct{}{
	"":        {},
	"all":     {},
	"overdue": {},
	"dueSoon": {},
	"noDue":   {},
}

func WorkflowTaskBoardLaneKeys() []string {
	out := make([]string, len(workflowTaskBoardLaneKeys))
	copy(out, workflowTaskBoardLaneKeys)
	return out
}

func ClassifyWorkflowTaskBoardLane(task *WorkflowTask, snapshotAt time.Time) (string, error) {
	if task == nil || snapshotAt.IsZero() {
		return "", ErrBadParam
	}
	status := strings.TrimSpace(task.TaskStatusKey)
	switch status {
	case "blocked":
		return WorkflowTaskBoardLaneException, nil
	case "done", "rejected":
		return WorkflowTaskBoardLaneFinished, nil
	case "ready":
		if task.DueAt != nil && !task.DueAt.After(snapshotAt.Add(WorkflowTaskBoardDueWindow)) {
			return WorkflowTaskBoardLaneDue, nil
		}
		return WorkflowTaskBoardLaneActionable, nil
	default:
		return "", ErrWorkflowTaskBoardStatus
	}
}

func (uc *WorkflowUsecase) GetTaskBoard(ctx context.Context, query WorkflowTaskBoardQuery) (*WorkflowTaskBoard, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeWorkflowTaskBoardQuery(query)
	if err != nil {
		return nil, err
	}
	return uc.repo.GetWorkflowTaskBoard(ctx, normalized)
}

func normalizeWorkflowTaskBoardQuery(query WorkflowTaskBoardQuery) (WorkflowTaskBoardQuery, error) {
	query.Keyword = strings.TrimSpace(query.Keyword)
	query.Status = strings.TrimSpace(query.Status)
	query.OwnerRoleKey = strings.ToLower(NormalizeRoleKey(query.OwnerRoleKey))
	query.Due = strings.TrimSpace(query.Due)
	query.SourceType = strings.TrimSpace(query.SourceType)
	query.LaneKey = strings.TrimSpace(query.LaneKey)
	query.VisibleOwnerRoleKeys = normalizeWorkflowVisibleOwnerRoleKeys(query.VisibleOwnerRoleKeys)
	query.VisibilityScope = NormalizeWorkflowTaskVisibilityScope(query.VisibilityScope)

	if query.OwnerRoleKey == "all" {
		query.OwnerRoleKey = ""
	}
	if query.OwnerRoleKey != "" && !isWorkflowTaskBoardOwnerRoleKey(query.OwnerRoleKey) {
		return WorkflowTaskBoardQuery{}, ErrBadParam
	}
	if query.SourceType == "all" {
		query.SourceType = ""
	}
	if query.Status == "" {
		query.Status = "all"
	}
	if query.Due == "" {
		query.Due = "all"
	}
	if query.LaneKey == "all" {
		query.LaneKey = ""
	}
	if _, ok := workflowTaskBoardFilterStatuses[query.Status]; !ok {
		return WorkflowTaskBoardQuery{}, ErrBadParam
	}
	if _, ok := workflowTaskBoardDueFilters[query.Due]; !ok {
		return WorkflowTaskBoardQuery{}, ErrBadParam
	}
	if query.LaneKey != "" && !isWorkflowTaskBoardLaneKey(query.LaneKey) {
		return WorkflowTaskBoardQuery{}, ErrBadParam
	}
	if query.Limit <= 0 {
		query.Limit = workflowTaskBoardDefaultLimit
	}
	if query.Limit > workflowTaskBoardMaxLimit {
		query.Limit = workflowTaskBoardMaxLimit
	}
	if query.Offset < 0 {
		query.Offset = 0
	}
	if query.SnapshotAt.IsZero() {
		query.SnapshotAt = time.Now()
	}
	query.SnapshotAt = time.Unix(query.SnapshotAt.Unix(), 0).UTC()
	return query, nil
}

func isWorkflowTaskBoardOwnerRoleKey(key string) bool {
	for _, role := range BuiltinRoles() {
		if role.Key == key {
			return true
		}
	}
	return false
}

func isWorkflowTaskBoardLaneKey(key string) bool {
	for _, candidate := range workflowTaskBoardLaneKeys {
		if key == candidate {
			return true
		}
	}
	return false
}
