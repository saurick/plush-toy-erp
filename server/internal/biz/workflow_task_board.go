package biz

import (
	"context"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	WorkflowTaskBoardLaneAll        = "all"
	WorkflowTaskBoardLaneActionable = "actionable"
	WorkflowTaskBoardLaneException  = "exception"
	WorkflowTaskBoardLaneDue        = "due"
	WorkflowTaskBoardLaneFinished   = "finished"
	WorkflowTaskBoardSortSmart      = "smart"
	WorkflowTaskBoardSortDueSoon    = "due_soon"
	WorkflowTaskBoardSortNewest     = "newest"

	WorkflowTaskBoardDueWindow    = 24 * time.Hour
	workflowTaskBoardDefaultLimit = WorkCenterDefaultLimit
	workflowTaskBoardMaxLimit     = WorkCenterMaxLimit
)

var workflowTaskBoardLaneKeys = []string{
	WorkflowTaskBoardLaneActionable,
	WorkflowTaskBoardLaneException,
	WorkflowTaskBoardLaneDue,
	WorkflowTaskBoardLaneFinished,
}

var workflowTaskBoardFilterStatuses = map[string]struct{}{
	"":          {},
	"all":       {},
	"ready":     {},
	"blocked":   {},
	"rejected":  {},
	"withdrawn": {},
	"done":      {},
	"overdue":   {},
	"dueSoon":   {},
}

var workflowTaskBoardDueFilters = map[string]struct{}{
	"":        {},
	"all":     {},
	"overdue": {},
	"dueSoon": {},
	"noDue":   {},
}

// Extra list filters use the same contract in the board and role-task views.
func ValidWorkflowTaskListFilters(due, sourceType string) bool {
	_, ok := workflowTaskBoardDueFilters[due]
	return ok && utf8.ValidString(sourceType) && utf8.RuneCountInString(sourceType) <= WorkflowTaskSourceTypeMaxLength && sourceType == strings.TrimSpace(sourceType)
}

var workflowTaskBoardSortKeys = map[string]struct{}{
	WorkflowTaskBoardSortSmart:   {},
	WorkflowTaskBoardSortDueSoon: {},
	WorkflowTaskBoardSortNewest:  {},
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
	case "done", "rejected", "withdrawn":
		return WorkflowTaskBoardLaneFinished, nil
	case "ready":
		if IsWorkflowExceptionTask(task) {
			return WorkflowTaskBoardLaneException, nil
		}
		if task.DueAt != nil && !task.DueAt.After(snapshotAt.Add(WorkflowTaskBoardDueWindow)) {
			return WorkflowTaskBoardLaneDue, nil
		}
		return WorkflowTaskBoardLaneActionable, nil
	default:
		return "", ErrWorkflowTaskBoardStatus
	}
}

func WorkflowExceptionTaskGroups() []string {
	return []string{"handoff_production_exception", "handoff_receipt_exception"}
}

func WorkflowExceptionSourceTypes() []string {
	return []string{"production_exception_decision", "outsourcing_return_disposition", "purchase_rejection_disposition"}
}

func IsWorkflowExceptionTask(task *WorkflowTask) bool {
	if task == nil {
		return false
	}
	for _, group := range WorkflowExceptionTaskGroups() {
		if task.TaskGroup == group {
			return true
		}
	}
	for _, source := range WorkflowExceptionSourceTypes() {
		if task.SourceType == source {
			return true
		}
	}
	return false
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
	if query.Calendar != nil {
		if _, _, err := query.Calendar.Bounds(); err != nil || !query.TodoOnly || query.ApprovalOnly || query.LaneKey != "" || query.Offset != 0 {
			return WorkflowTaskBoardQuery{}, ErrBadParam
		}
	}
	if query.TodoOnly && query.ApprovalOnly {
		return WorkflowTaskBoardQuery{}, ErrBadParam
	}
	if !ValidWorkflowTaskDiscoveryFilter(query.WorkflowTaskDiscoveryFilter) {
		return WorkflowTaskBoardQuery{}, ErrBadParam
	}
	query.Keyword = strings.TrimSpace(query.Keyword)
	query.Status = strings.TrimSpace(query.Status)
	query.OwnerRoleKey = strings.ToLower(NormalizeRoleKey(query.OwnerRoleKey))
	query.Due = strings.TrimSpace(query.Due)
	query.SourceType = strings.TrimSpace(query.SourceType)
	query.LaneKey = strings.TrimSpace(query.LaneKey)
	query.Sort = strings.TrimSpace(query.Sort)
	query.VisibleOwnerRoleKeys = normalizeWorkflowVisibleOwnerRoleKeys(query.VisibleOwnerRoleKeys)
	query.VisibilityScope = NormalizeWorkflowTaskVisibilityScope(query.VisibilityScope)
	query.ApprovalVisibilityScopes = NormalizeWorkflowApprovalVisibilityScopes(query.ApprovalVisibilityScopes)

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
	if query.Sort == "" {
		query.Sort = WorkflowTaskBoardSortSmart
	}
	if _, ok := workflowTaskBoardFilterStatuses[query.Status]; !ok {
		return WorkflowTaskBoardQuery{}, ErrBadParam
	}
	if !ValidWorkflowTaskListFilters(query.Due, query.SourceType) {
		return WorkflowTaskBoardQuery{}, ErrBadParam
	}
	if query.LaneKey != "" && query.LaneKey != WorkflowTaskBoardLaneAll && !isWorkflowTaskBoardLaneKey(query.LaneKey) {
		return WorkflowTaskBoardQuery{}, ErrBadParam
	}
	if _, ok := workflowTaskBoardSortKeys[query.Sort]; !ok {
		return WorkflowTaskBoardQuery{}, ErrBadParam
	}
	if query.LaneKey == "" && query.Sort != WorkflowTaskBoardSortSmart {
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
	if query.Period != "" || query.DateFrom != "" || query.DateTo != "" {
		if query.LaneKey != WorkflowTaskBoardLaneFinished || query.TodoOnly || query.ApprovalOnly {
			return WorkflowTaskBoardQuery{}, ErrBadParam
		}
	}
	var dateErr error
	query.CompletedFrom, query.CompletedBefore, dateErr = WorkflowRoleTaskHistoryDateBounds(query.Period, query.DateFrom, query.DateTo, query.SnapshotAt)
	if dateErr != nil {
		return WorkflowTaskBoardQuery{}, dateErr
	}
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
