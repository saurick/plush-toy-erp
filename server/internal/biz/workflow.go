package biz

import (
	"context"
	"regexp"
	"strings"
)

var workflowNumberedPhasePattern = regexp.MustCompile(`(?i)\b` + `phase` + `\s*[0-9]+[a-z0-9_-]*`)

func (uc *WorkflowUsecase) Metadata() (taskStates, businessStates, planningPhases []WorkflowStateOption) {
	return WorkflowTaskStates(), WorkflowBusinessStates(), WorkflowPlanningPhases()
}

func (uc *WorkflowUsecase) ListTasks(ctx context.Context, filter WorkflowTaskFilter) ([]*WorkflowTask, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	filter = normalizeWorkflowTaskFilter(filter)
	if filter.TaskStatusKey != "" && !IsValidWorkflowTaskState(filter.TaskStatusKey) {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListWorkflowTasks(ctx, filter)
}

func (uc *WorkflowUsecase) GetTask(ctx context.Context, id int) (*WorkflowTask, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetWorkflowTask(ctx, id)
}

func (uc *WorkflowUsecase) CreateTask(ctx context.Context, in *WorkflowTaskCreate, actorID int) (*WorkflowTask, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeWorkflowTaskCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateWorkflowTask(ctx, &normalized, actorID)
}

func (uc *WorkflowUsecase) UpdateTaskStatus(ctx context.Context, in *WorkflowTaskStatusUpdate, actorID int, actorRoleKey string) (*WorkflowTask, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	in.TaskStatusKey = strings.TrimSpace(in.TaskStatusKey)
	in.BusinessStatusKey = strings.TrimSpace(in.BusinessStatusKey)
	in.Reason = strings.TrimSpace(in.Reason)
	if in.ID <= 0 || !IsValidWorkflowTaskState(in.TaskStatusKey) {
		return nil, ErrBadParam
	}
	if in.BusinessStatusKey != "" && !IsValidWorkflowBusinessState(in.BusinessStatusKey) {
		return nil, ErrBadParam
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	current, err := uc.repo.GetWorkflowTask(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if isBossOrderApprovalTask(current) {
		if err := uc.applyBossApprovalTransition(current, in); err != nil {
			return nil, err
		}
	} else if isPurchaseIQCTask(current) {
		if err := uc.applyPurchaseIQCTransition(current, in); err != nil {
			return nil, err
		}
	} else if isPurchaseWarehouseInboundTask(current) {
		if err := uc.applyPurchaseWarehouseInboundTransition(current, in); err != nil {
			return nil, err
		}
	} else if isOutsourceReturnQCTask(current) {
		if err := uc.applyOutsourceReturnQCTransition(current, in); err != nil {
			return nil, err
		}
	} else if isFinishedGoodsQCTask(current) {
		if err := uc.applyFinishedGoodsQCTransition(current, in); err != nil {
			return nil, err
		}
	} else if isFinishedGoodsInboundTask(current) {
		if err := uc.applyFinishedGoodsInboundTransition(current, in); err != nil {
			return nil, err
		}
	} else if isShipmentReleaseTask(current) {
		if err := uc.applyShipmentReleaseTransition(current, in); err != nil {
			return nil, err
		}
	}
	if workflowStatusUpdateHasNumberedPhaseLabel(in) {
		return nil, ErrBadParam
	}
	return uc.repo.UpdateWorkflowTaskStatus(ctx, in, actorID, strings.TrimSpace(actorRoleKey))
}

func (uc *WorkflowUsecase) applyBossApprovalTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowOrderApprovedStatusKey
		in.SideEffects = buildBossApprovalDoneSideEffects(current)
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		if in.TaskStatusKey == "blocked" {
			in.BusinessStatusKey = "blocked"
		} else {
			in.BusinessStatusKey = workflowOrderApprovalStatusKey
		}
		in.SideEffects = buildBossApprovalRevisionSideEffects(current, in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func buildBossApprovalDoneSideEffects(current *WorkflowTask) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := "engineering"
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        workflowProjectOrderModuleKey,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: workflowOrderApprovedStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			Payload: map[string]any{
				"record_title":     workflowOrderRecordTitle(current),
				"approval_task_id": current.ID,
				"approval_result":  "approved",
				"critical_path":    true,
			},
		},
		DerivedTask:       buildEngineeringTaskFromApprovedOrder(current),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   "boss_approval_done_to_engineering_data",
	}
}

func buildBossApprovalRevisionSideEffects(current *WorkflowTask, taskStatusKey string, reason string) *WorkflowTaskStatusSideEffects {
	ownerRoleKey := BusinessRoleKey
	businessStatusKey := workflowOrderApprovalStatusKey
	workflowRuleKey := "boss_approval_rejected_to_order_revision"
	if taskStatusKey == "blocked" {
		businessStatusKey = "blocked"
		workflowRuleKey = "boss_approval_blocked_to_order_revision"
	}
	statePayload := map[string]any{
		"record_title":      workflowOrderRecordTitle(current),
		"approval_task_id":  current.ID,
		"approval_result":   "rejected",
		"decision":          taskStatusKey,
		"transition_status": taskStatusKey,
		"rejected_reason":   reason,
		"critical_path":     true,
	}
	if taskStatusKey == "blocked" {
		statePayload["blocked_reason"] = reason
	}
	return &WorkflowTaskStatusSideEffects{
		BusinessState: &WorkflowBusinessStateUpsert{
			SourceType:        workflowProjectOrderModuleKey,
			SourceID:          current.SourceID,
			SourceNo:          workflowTaskSourceNo(current),
			BusinessStatusKey: businessStatusKey,
			OwnerRoleKey:      &ownerRoleKey,
			BlockedReason:     &reason,
			Payload:           statePayload,
		},
		DerivedTask:       buildRevisionTaskFromRejectedOrder(current, taskStatusKey, reason),
		DerivedFromTaskID: current.ID,
		WorkflowRuleKey:   workflowRuleKey,
	}
}

func (uc *WorkflowUsecase) applyPurchaseIQCTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowWarehouseInboundPendingKey
		ensureWorkflowPayload(&in.Payload)
		if workflowPayloadString(in.Payload, "qc_result") == "" {
			in.Payload["qc_result"] = "pass"
		}
		in.SideEffects = buildPurchaseIQCDoneSideEffects(current)
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		in.BusinessStatusKey = workflowQCFailedStatusKey
		ensureWorkflowPayload(&in.Payload)
		in.Payload["decision"] = in.TaskStatusKey
		in.Payload["transition_status"] = in.TaskStatusKey
		if in.TaskStatusKey == "blocked" {
			in.Payload["blocked_reason"] = reason
			if workflowPayloadString(in.Payload, "rejected_reason") == "" {
				in.Payload["rejected_reason"] = reason
			}
		} else {
			in.Payload["rejected_reason"] = reason
		}
		in.SideEffects = buildPurchaseIQCExceptionSideEffects(current, in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyPurchaseWarehouseInboundTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowInboundDoneStatusKey
		ensureWorkflowPayload(&in.Payload)
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.Payload["warehouse_task_id"] = current.ID
		in.Payload["inbound_result"] = "done"
		in.Payload["inventory_balance_deferred"] = true
		in.Payload["critical_path"] = true
		in.SideEffects = buildPurchaseWarehouseInboundDoneSideEffects(current)
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		in.BusinessStatusKey = workflowBlockedStatusKey
		ensureWorkflowPayload(&in.Payload)
		in.Payload["decision"] = in.TaskStatusKey
		in.Payload["transition_status"] = in.TaskStatusKey
		in.Payload["warehouse_task_id"] = current.ID
		in.Payload["critical_path"] = true
		if in.TaskStatusKey == "blocked" {
			in.Payload["blocked_reason"] = reason
		} else {
			in.Payload["rejected_reason"] = reason
		}
		in.SideEffects = buildPurchaseWarehouseInboundBlockedSideEffects(current, in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyOutsourceReturnQCTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowWarehouseInboundPendingKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		if workflowPayloadString(in.Payload, "qc_result") == "" {
			in.Payload["qc_result"] = "pass"
		}
		in.Payload["qc_type"] = "outsource_return"
		in.Payload["outsource_processing"] = true
		in.SideEffects = buildOutsourceReturnQCDoneSideEffects(workflowTaskWithPayload(current, in.Payload))
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		in.BusinessStatusKey = workflowQCFailedStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		in.Payload["decision"] = in.TaskStatusKey
		in.Payload["transition_status"] = in.TaskStatusKey
		in.Payload["qc_type"] = "outsource_return"
		in.Payload["outsource_processing"] = true
		if in.TaskStatusKey == "blocked" {
			in.Payload["blocked_reason"] = reason
			in.Payload["rejected_reason"] = reason
		} else {
			delete(in.Payload, "blocked_reason")
			in.Payload["rejected_reason"] = reason
		}
		in.SideEffects = buildOutsourceReturnQCReworkSideEffects(workflowTaskWithPayload(current, in.Payload), in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyFinishedGoodsQCTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowWarehouseInboundPendingKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		delete(in.Payload, "blocked_reason")
		delete(in.Payload, "rejected_reason")
		delete(in.Payload, "decision")
		delete(in.Payload, "transition_status")
		if workflowPayloadString(in.Payload, "qc_result") == "" {
			in.Payload["qc_result"] = "pass"
		}
		in.Payload["qc_task_id"] = current.ID
		in.Payload["finished_goods"] = true
		in.Payload["alert_type"] = "finished_goods_inbound_pending"
		in.Payload["critical_path"] = true
		in.Payload["inventory_balance_deferred"] = true
		in.SideEffects = buildFinishedGoodsQCDoneSideEffects(workflowTaskWithPayload(current, in.Payload))
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		in.BusinessStatusKey = workflowQCFailedStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		in.Payload["decision"] = in.TaskStatusKey
		in.Payload["transition_status"] = in.TaskStatusKey
		in.Payload["qc_task_id"] = current.ID
		in.Payload["finished_goods"] = true
		in.Payload["alert_type"] = "qc_failed"
		in.Payload["critical_path"] = true
		if in.TaskStatusKey == "blocked" {
			in.Payload["qc_result"] = "blocked"
			in.Payload["blocked_reason"] = reason
			delete(in.Payload, "rejected_reason")
		} else {
			in.Payload["qc_result"] = "rejected"
			in.Payload["rejected_reason"] = reason
			delete(in.Payload, "blocked_reason")
		}
		in.SideEffects = buildFinishedGoodsQCReworkSideEffects(workflowTaskWithPayload(current, in.Payload), in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyFinishedGoodsInboundTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowInboundDoneStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		delete(in.Payload, "blocked_reason")
		delete(in.Payload, "rejected_reason")
		in.Payload["inbound_task_id"] = current.ID
		in.Payload["inbound_result"] = "done"
		in.Payload["finished_goods"] = true
		in.Payload["inventory_balance_deferred"] = true
		in.Payload["shipment_release_deferred"] = true
		in.Payload["critical_path"] = true
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.SideEffects = buildFinishedGoodsInboundDoneSideEffects(workflowTaskWithPayload(current, in.Payload))
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		in.BusinessStatusKey = workflowBlockedStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		in.Payload["inbound_task_id"] = current.ID
		in.Payload["finished_goods"] = true
		in.Payload["critical_path"] = true
		in.Payload["decision"] = in.TaskStatusKey
		in.Payload["transition_status"] = in.TaskStatusKey
		if in.TaskStatusKey == "blocked" {
			in.Payload["blocked_reason"] = reason
			delete(in.Payload, "rejected_reason")
		} else {
			in.Payload["rejected_reason"] = reason
			delete(in.Payload, "blocked_reason")
		}
		in.SideEffects = buildFinishedGoodsInboundBlockedSideEffects(workflowTaskWithPayload(current, in.Payload), in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyShipmentReleaseTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowShippingReleasedStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		delete(in.Payload, "blocked_reason")
		delete(in.Payload, "rejected_reason")
		in.Payload["shipment_release_task_id"] = current.ID
		in.Payload["shipment_release_result"] = "done"
		in.Payload["shipment_release_deferred_inventory"] = true
		in.Payload["shipment_execution_required"] = true
		in.Payload["inventory_out_deferred"] = true
		in.Payload["receivable_deferred"] = true
		in.Payload["invoice_deferred"] = true
		in.Payload["critical_path"] = true
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.SideEffects = buildShipmentReleaseDoneSideEffects(workflowTaskWithPayload(current, in.Payload))
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		in.BusinessStatusKey = workflowBlockedStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		in.Payload["shipment_release_task_id"] = current.ID
		in.Payload["critical_path"] = true
		in.Payload["decision"] = in.TaskStatusKey
		in.Payload["transition_status"] = in.TaskStatusKey
		if in.TaskStatusKey == "blocked" {
			in.Payload["blocked_reason"] = reason
			delete(in.Payload, "rejected_reason")
		} else {
			in.Payload["rejected_reason"] = reason
			delete(in.Payload, "blocked_reason")
		}
		in.SideEffects = buildShipmentReleaseBlockedSideEffects(workflowTaskWithPayload(current, in.Payload), in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) UrgeTask(ctx context.Context, in *WorkflowTaskUrge, actorID int, actorRoleKey string) (*WorkflowTask, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	in.Action = strings.TrimSpace(in.Action)
	in.Reason = strings.TrimSpace(in.Reason)
	if in.ID <= 0 || !IsValidWorkflowTaskUrgeAction(in.Action) || in.Reason == "" {
		return nil, ErrBadParam
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	return uc.repo.UrgeWorkflowTask(ctx, in, actorID, strings.TrimSpace(actorRoleKey))
}

func (uc *WorkflowUsecase) ListBusinessStates(ctx context.Context, filter WorkflowBusinessStateFilter) ([]*WorkflowBusinessState, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	filter = normalizeWorkflowBusinessStateFilter(filter)
	if filter.BusinessStatusKey != "" && !IsValidWorkflowBusinessState(filter.BusinessStatusKey) {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListWorkflowBusinessStates(ctx, filter)
}

func (uc *WorkflowUsecase) UpsertBusinessState(ctx context.Context, in *WorkflowBusinessStateUpsert, actorID int) (*WorkflowBusinessState, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeWorkflowBusinessStateUpsert(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.UpsertWorkflowBusinessState(ctx, &normalized, actorID)
}

func normalizeWorkflowTaskFilter(filter WorkflowTaskFilter) WorkflowTaskFilter {
	filter.OwnerRoleKey = NormalizeRoleKey(filter.OwnerRoleKey)
	filter.TaskStatusKey = strings.TrimSpace(filter.TaskStatusKey)
	filter.TaskGroup = strings.TrimSpace(filter.TaskGroup)
	filter.SourceType = strings.TrimSpace(filter.SourceType)
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 200 {
		filter.Limit = 200
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	return filter
}

func normalizeWorkflowTaskCreate(in WorkflowTaskCreate) (WorkflowTaskCreate, error) {
	in.TaskCode = strings.TrimSpace(in.TaskCode)
	in.TaskGroup = strings.TrimSpace(in.TaskGroup)
	in.TaskName = strings.TrimSpace(in.TaskName)
	in.SourceType = strings.TrimSpace(in.SourceType)
	in.TaskStatusKey = strings.TrimSpace(in.TaskStatusKey)
	in.OwnerRoleKey = NormalizeRoleKey(in.OwnerRoleKey)
	if in.TaskStatusKey == "" {
		in.TaskStatusKey = "pending"
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	if workflowCreateHasNumberedPhaseLabel(in) {
		return WorkflowTaskCreate{}, ErrBadParam
	}
	if in.TaskCode == "" || in.TaskGroup == "" || in.TaskName == "" || in.SourceType == "" || in.SourceID <= 0 || in.OwnerRoleKey == "" {
		return WorkflowTaskCreate{}, ErrBadParam
	}
	if !IsValidWorkflowTaskState(in.TaskStatusKey) {
		return WorkflowTaskCreate{}, ErrBadParam
	}
	if in.BusinessStatusKey != nil {
		normalized := strings.TrimSpace(*in.BusinessStatusKey)
		if normalized == "" {
			in.BusinessStatusKey = nil
		} else if !IsValidWorkflowBusinessState(normalized) {
			return WorkflowTaskCreate{}, ErrBadParam
		} else {
			in.BusinessStatusKey = &normalized
		}
	}
	return in, nil
}

func workflowCreateHasNumberedPhaseLabel(in WorkflowTaskCreate) bool {
	return workflowTextHasNumberedPhaseLabel(
		in.TaskCode,
		in.TaskName,
		workflowStringPtrValue(in.SourceNo),
		workflowStringPtrValue(in.BlockedReason),
	) || workflowValueHasNumberedPhaseLabel(in.Payload)
}

func workflowStatusUpdateHasNumberedPhaseLabel(in *WorkflowTaskStatusUpdate) bool {
	if in == nil {
		return false
	}
	if workflowTextHasNumberedPhaseLabel(in.BusinessStatusKey, in.Reason) ||
		workflowValueHasNumberedPhaseLabel(in.Payload) {
		return true
	}
	if in.SideEffects == nil {
		return false
	}
	if in.SideEffects.DerivedTask != nil &&
		workflowCreateHasNumberedPhaseLabel(*in.SideEffects.DerivedTask) {
		return true
	}
	state := in.SideEffects.BusinessState
	if state == nil {
		return false
	}
	return workflowTextHasNumberedPhaseLabel(
		state.SourceType,
		workflowStringPtrValue(state.SourceNo),
		state.BusinessStatusKey,
		workflowStringPtrValue(state.OwnerRoleKey),
		workflowStringPtrValue(state.BlockedReason),
	) || workflowValueHasNumberedPhaseLabel(state.Payload)
}

func workflowStringPtrValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func workflowTextHasNumberedPhaseLabel(values ...string) bool {
	for _, value := range values {
		if workflowNumberedPhasePattern.MatchString(value) {
			return true
		}
	}
	return false
}

func workflowValueHasNumberedPhaseLabel(value any) bool {
	switch v := value.(type) {
	case nil:
		return false
	case string:
		return workflowNumberedPhasePattern.MatchString(v)
	case map[string]any:
		for key, item := range v {
			if workflowNumberedPhasePattern.MatchString(key) ||
				workflowValueHasNumberedPhaseLabel(item) {
				return true
			}
		}
	case []any:
		for _, item := range v {
			if workflowValueHasNumberedPhaseLabel(item) {
				return true
			}
		}
	}
	return false
}

func normalizeWorkflowBusinessStateFilter(filter WorkflowBusinessStateFilter) WorkflowBusinessStateFilter {
	filter.SourceType = strings.TrimSpace(filter.SourceType)
	filter.BusinessStatusKey = strings.TrimSpace(filter.BusinessStatusKey)
	filter.OwnerRoleKey = NormalizeRoleKey(filter.OwnerRoleKey)
	if filter.Limit <= 0 {
		filter.Limit = 50
	}
	if filter.Limit > 200 {
		filter.Limit = 200
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	return filter
}

func normalizeWorkflowBusinessStateUpsert(in WorkflowBusinessStateUpsert) (WorkflowBusinessStateUpsert, error) {
	in.SourceType = strings.TrimSpace(in.SourceType)
	in.BusinessStatusKey = strings.TrimSpace(in.BusinessStatusKey)
	in.OwnerRoleKey = NormalizeOptionalRoleKey(in.OwnerRoleKey)
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	if in.SourceType == "" || in.SourceID <= 0 || !IsValidWorkflowBusinessState(in.BusinessStatusKey) {
		return WorkflowBusinessStateUpsert{}, ErrBadParam
	}
	return in, nil
}
