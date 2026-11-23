package service

import (
	"context"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
)

func (d *jsonrpcDispatcher) handleWorkflowTracking(ctx context.Context, method, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminRBACPermission(ctx, biz.PermissionWorkflowTaskRead); res != nil {
		return id, res, nil
	}
	admin, res := d.CurrentAdmin(ctx)
	if res != nil {
		return id, res, nil
	}
	visibility, res := d.workflowTaskReadVisibilityScope(ctx, admin)
	if res != nil {
		return id, res, nil
	}
	q := biz.WorkflowTrackingQuery{ActorID: admin.ID, Scope: "visible", Limit: 20, VisibilityScope: visibility}
	if method == "get_tracking" {
		if res := rejectUnknownWorkflowTaskParams(pm, method, "kind", "id", "before_event_id"); res != nil {
			return id, res, nil
		}
		refID, valid := getRequiredJSONRPCPositiveInt(pm, "id")
		before, validBefore := getOptionalWorkflowTaskBoardInteger(pm, "before_event_id", 0, 0)
		kind, res := getOptionalWorkflowTaskBoardString(pm, "kind", 16)
		if !valid || !validBefore || res != nil || (kind != "process" && kind != "task" && kind != biz.WorkflowTrackingMaterialReviewKind) {
			return id, invalidParamResult(), nil
		}
		entry, err := d.workflowUC.GetTracking(ctx, q, biz.WorkflowTrackingRef{Kind: kind, ID: refID}, before)
		if err != nil {
			return id, d.mapWorkflowError(ctx, err), nil
		}
		return id, okData(map[string]any{"tracking": d.workflowTrackingDetail(ctx, admin, entry)}), nil
	}
	if res := rejectUnknownWorkflowTaskParams(pm, method, "scope", "keyword", "status", "record_type", "owner_role_key", "attention", "source_type", "source_id", "date_from", "date_to", "sort_direction", "limit", "offset"); res != nil {
		return id, res, nil
	}
	var errResult *v1.JsonrpcResult
	q.Scope, errResult = getOptionalWorkflowTaskBoardString(pm, "scope", 16)
	if errResult != nil {
		return id, errResult, nil
	}
	if q.Scope == "" {
		q.Scope = "visible"
	}
	q.Keyword, errResult = getOptionalWorkflowTaskBoardString(pm, "keyword", 128)
	if errResult != nil {
		return id, errResult, nil
	}
	q.SourceType, errResult = getOptionalWorkflowTaskBoardString(pm, "source_type", 64)
	if errResult != nil {
		return id, errResult, nil
	}
	for key, target := range map[string]*string{"status": &q.Status, "record_type": &q.RecordType, "owner_role_key": &q.OwnerRoleKey, "attention": &q.Attention, "sort_direction": &q.SortDirection} {
		*target, errResult = getOptionalWorkflowTaskBoardString(pm, key, 64)
		if errResult != nil {
			return id, errResult, nil
		}
	}
	for key, target := range map[string]**time.Time{"date_from": &q.DateFrom, "date_to": &q.DateTo} {
		value, res := getOptionalWorkflowTaskBoardString(pm, key, 10)
		if res != nil {
			return id, res, nil
		}
		if value != "" {
			date, ok := getOptionalJSONRPCDateFilter(pm, key)
			if !ok {
				return id, invalidParamResult(), nil
			}
			*target = date
		}
	}
	var valid bool
	q.SourceID, valid = getOptionalWorkflowTaskBoardInteger(pm, "source_id", 0, 0)
	if !valid {
		return id, invalidParamResult(), nil
	}
	q.Limit, valid = getOptionalWorkflowTaskBoardInteger(pm, "limit", biz.WorkCenterDefaultLimit, 1)
	if !valid {
		return id, invalidParamResult(), nil
	}
	q.Offset, valid = getOptionalWorkflowTaskBoardInteger(pm, "offset", 0, 0)
	if !valid {
		return id, invalidParamResult(), nil
	}
	page, err := d.workflowUC.ListTracking(ctx, q)
	if err != nil {
		return id, d.mapWorkflowError(ctx, err), nil
	}
	items := make([]any, 0, len(page.Items))
	for _, entry := range page.Items {
		items = append(items, workflowTrackingSummary(entry))
	}
	return id, okData(map[string]any{"items": items, "total": page.Total, "status_counts": businessStatusCountsToAny(page.StatusCounts), "limit": q.Limit, "offset": q.Offset}), nil
}

func workflowTrackingPerson(entry *biz.WorkflowTrackingEntry, id *int) string {
	if id == nil {
		return ""
	}
	if name := entry.People[*id]; name != "" {
		return name
	}
	return "人员信息未记录"
}

func workflowTrackingTask(task *biz.WorkflowTask, entry *biz.WorkflowTrackingEntry) map[string]any {
	result := map[string]any{"task_id": task.ID, "task_name": task.TaskName, "node_instance_id": workflowIntValue(task.ProcessNodeInstanceID), "owner_role_key": task.OwnerRoleKey, "assignee_name": workflowTrackingPerson(entry, task.AssigneeID), "required_capability_key": workflowStringValue(task.RequiredCapabilityKey), "status": task.TaskStatusKey, "created_at": task.CreatedAt.Unix(), "completed_at": optionalTimeUnix(task.CompletedAt), "due_at": optionalTimeUnix(task.DueAt)}
	if entry.MaterialRequest != nil {
		result["task_group"] = task.TaskGroup
	}
	return result
}

func workflowTrackingCurrentTasks(entry *biz.WorkflowTrackingEntry) []*biz.WorkflowTask {
	if request := entry.MaterialRequest; request != nil {
		current := []*biz.WorkflowTask{}
		if request.OrderStatus == biz.SalesOrderStatusActive {
			group := biz.EngineeringMaterialTaskGroup(request.Status)
			for _, task := range entry.Tasks {
				if task.TaskGroup == group && !biz.IsTerminalWorkflowTaskStatus(task.TaskStatusKey) {
					current = append(current, task)
				}
			}
		}
		return current
	}
	activeNodes := map[int]bool{}
	for _, n := range entry.Nodes {
		if n.Status == biz.ProcessNodeStatusActive || n.Status == biz.ProcessNodeStatusBlocked {
			activeNodes[n.ID] = true
		}
	}
	current := []*biz.WorkflowTask{}
	for _, t := range entry.Tasks {
		if !biz.IsTerminalWorkflowTaskStatus(t.TaskStatusKey) && (entry.Instance == nil || t.ProcessNodeInstanceID != nil && activeNodes[*t.ProcessNodeInstanceID]) {
			current = append(current, t)
		}
	}
	return current
}

func workflowTrackingSummary(entry *biz.WorkflowTrackingEntry) map[string]any {
	result := map[string]any{"kind": entry.Ref.Kind, "id": entry.Ref.ID, "started_at": entry.StartedAt().Unix(), "display_context": workflowTaskDisplayContextToMap(entry.DisplayContext)}
	result["initiator_role_key"] = entry.InitiatorRoleKey
	current := []any{}
	currentTasks := workflowTrackingCurrentTasks(entry)
	if p := entry.Instance; p != nil {
		result["process_key"], result["title"] = p.ProcessKey, ""
		result["source_type"], result["source_id"], result["source_no"] = p.BusinessRefType, p.BusinessRefID, workflowStringValue(p.BusinessRefNo)
		result["status"], result["resolution_kind"] = p.Status, workflowStringValue(p.ResolutionKind)
		result["updated_at"], result["completed_at"] = p.UpdatedAt.Unix(), optionalTimeUnix(p.CompletedAt)
		result["initiator_name"] = workflowTrackingPerson(entry, p.CreatedBy)
	} else if request := entry.MaterialRequest; request != nil {
		status, resolution, updateTime, completedAt := workflowTrackingMaterialStatus(entry, currentTasks)
		result["process_key"], result["title"] = "", "本次用料审批"
		result["source_type"], result["source_id"], result["source_no"] = biz.WorkflowMaterialRequestSourceType, request.ID, request.OrderNo
		result["status"], result["resolution_kind"] = status, resolution
		result["updated_at"], result["completed_at"] = updateTime.Unix(), optionalTimeUnix(completedAt)
		result["initiator_name"] = workflowTrackingPerson(entry, &request.SubmittedBy)
	} else {
		t := entry.Task
		result["process_key"], result["title"] = "", t.TaskName
		result["source_type"], result["source_id"], result["source_no"] = t.SourceType, t.SourceID, workflowStringValue(t.SourceNo)
		result["status"], result["resolution_kind"] = t.TaskStatusKey, nil
		result["updated_at"], result["completed_at"] = t.UpdatedAt.Unix(), optionalTimeUnix(t.CompletedAt)
		result["initiator_name"] = workflowTrackingPerson(entry, t.CreatedBy)
	}
	for _, t := range currentTasks {
		current = append(current, workflowTrackingTask(t, entry))
	}
	result["current_tasks"] = current
	return result
}

func workflowTrackingMaterialStatus(entry *biz.WorkflowTrackingEntry, current []*biz.WorkflowTask) (string, any, time.Time, *time.Time) {
	request := entry.MaterialRequest
	updated := *request.SubmittedAt
	var revisionCompleted, withdrawnAt *time.Time
	for _, reviewedAt := range []*time.Time{request.BossReviewedAt, request.FinanceReviewedAt, request.RejectedAt} {
		if reviewedAt != nil && reviewedAt.After(updated) {
			updated = *reviewedAt
		}
	}
	for _, t := range entry.Tasks {
		if t.UpdatedAt.After(updated) {
			updated = t.UpdatedAt
		}
		if t.TaskGroup == biz.WorkflowMaterialRevisionGroup && t.TaskStatusKey == "done" {
			revisionCompleted = t.CompletedAt
		}
		if t.TaskStatusKey == "withdrawn" && t.CompletedAt != nil && (withdrawnAt == nil || t.CompletedAt.After(*withdrawnAt)) {
			withdrawnAt = t.CompletedAt
		}
	}
	if request.Status == biz.MaterialRequestApproved {
		return biz.ProcessStatusCompleted, biz.ProcessResolutionSucceeded, updated, request.FinanceReviewedAt
	}
	for _, t := range current {
		if t.TaskStatusKey == "blocked" {
			return biz.ProcessStatusBlocked, nil, updated, nil
		}
	}
	if request.Status == biz.MaterialRequestRejected && len(current) == 0 {
		if revisionCompleted == nil {
			revisionCompleted = request.RejectedAt
		}
		return biz.ProcessStatusCompleted, biz.ProcessResolutionRejected, updated, revisionCompleted
	}
	if request.OrderStatus != biz.SalesOrderStatusActive {
		return biz.ProcessStatusCompleted, biz.ProcessResolutionCancelled, updated, withdrawnAt
	}
	return biz.ProcessStatusActive, nil, updated, nil
}

func (d *jsonrpcDispatcher) workflowTrackingTaskAccess(ctx context.Context, admin *biz.AdminUser, task *biz.WorkflowTask) map[string]any {
	visibility := d.workflowTaskRoleVisibilityForTask(ctx, admin, task, biz.PermissionWorkflowTaskRead)
	canRead := visibility.Valid && workflowAdminCanViewTask(admin, task, visibility.RoleKeys)
	canHandle := false
	if canRead {
		sourceAccess := d.workflowTaskSourceAccess(ctx, task)
		for _, contract := range workflowTaskActionExplainContracts(task) {
			if !contract.Urge && d.workflowTaskActionAccessToMapWithSource(ctx, admin, task, contract, sourceAccess)["allowed"] == true {
				canHandle = true
				break
			}
		}
	}
	return map[string]any{"task_id": task.ID, "can_read": canRead, "can_handle": canHandle}
}

func (d *jsonrpcDispatcher) workflowTrackingDetail(ctx context.Context, admin *biz.AdminUser, entry *biz.WorkflowTrackingEntry) map[string]any {
	access := []any{}
	// Summary access is broader than task access. Reuse the get_task and
	// explain_action_access decisions without exposing full tasks or receipts.
	for _, task := range workflowTrackingCurrentTasks(entry) {
		access = append(access, d.workflowTrackingTaskAccess(ctx, admin, task))
	}
	tasks := []any{}
	for _, t := range entry.Tasks {
		tasks = append(tasks, workflowTrackingTask(t, entry))
	}
	nodes := []any{}
	for _, node := range entry.Nodes {
		value := workflowProcessNodeToMap(node)
		value["completed_by_name"] = workflowTrackingPerson(entry, node.DomainCommandResultRecordedBy)
		nodes = append(nodes, value)
	}
	// This endpoint grants summary access to participants, so it must not use
	// the task-event serializer that exposes mutation receipts and snapshots.
	events := []any{}
	for _, event := range entry.Events {
		events = append(events, map[string]any{
			"id": event.ID, "task_id": event.TaskID, "event_type": event.EventType,
			"from_status_key": workflowStringValue(event.FromStatusKey), "to_status_key": workflowStringValue(event.ToStatusKey),
			"actor_role_key": workflowStringValue(event.ActorRoleKey), "actor_display_name": event.ActorDisplayName,
			"reason": workflowStringValue(event.Reason), "created_at": event.CreatedAt.Unix(),
		})
	}
	nextEvent := 0
	if entry.EventsTruncated && len(entry.Events) > 0 {
		nextEvent = entry.Events[len(entry.Events)-1].ID
	}
	result := map[string]any{"summary": workflowTrackingSummary(entry), "current_task_access": access, "nodes": nodes, "tasks": tasks, "events": events, "events_truncated": entry.EventsTruncated, "next_event_id": nextEvent}
	if request := entry.MaterialRequest; request != nil {
		result["material_review"] = map[string]any{
			"status": request.Status, "order_status": request.OrderStatus,
			"submitted_at": optionalTimeUnix(request.SubmittedAt), "submitted_by_name": workflowTrackingPerson(entry, &request.SubmittedBy),
			"boss_reviewed_at": optionalTimeUnix(request.BossReviewedAt), "boss_reviewed_by_name": workflowTrackingPerson(entry, request.BossReviewedBy),
			"finance_reviewed_at": optionalTimeUnix(request.FinanceReviewedAt), "finance_reviewed_by_name": workflowTrackingPerson(entry, request.FinanceReviewedBy),
			"rejected_at": optionalTimeUnix(request.RejectedAt), "rejected_by_name": workflowTrackingPerson(entry, request.RejectedBy),
		}
	}
	return result
}
