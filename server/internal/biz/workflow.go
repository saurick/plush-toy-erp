package biz

import (
	"context"
	"errors"
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
	if IsTerminalWorkflowTaskStatus(current.TaskStatusKey) {
		if strings.TrimSpace(current.TaskStatusKey) == in.TaskStatusKey && workflowTerminalRetryMatches(current, in) {
			return current, nil
		}
		return nil, ErrWorkflowTaskSettled
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
	} else if isOutsourceReturnTrackingTask(current) {
		if err := uc.applyOutsourceReturnTrackingTransition(current, in); err != nil {
			return nil, err
		}
	} else if isOutsourceReturnQCTask(current) {
		if err := uc.applyOutsourceReturnQCTransition(current, in); err != nil {
			return nil, err
		}
	} else if isOutsourceWarehouseInboundTask(current) {
		if err := uc.applyOutsourceWarehouseInboundTransition(current, in); err != nil {
			return nil, err
		}
	} else if isOutsourceReworkTask(current) {
		if err := uc.applyOutsourceReworkTransition(current, in); err != nil {
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
	} else if isFinishedGoodsReworkTask(current) {
		if err := uc.applyFinishedGoodsReworkTransition(current, in); err != nil {
			return nil, err
		}
	} else if isShipmentReleaseTask(current) {
		if err := uc.applyShipmentReleaseTransition(current, in); err != nil {
			return nil, err
		}
	} else if isReceivableRegistrationTask(current) {
		if err := uc.applyReceivableRegistrationTransition(current, in); err != nil {
			return nil, err
		}
	} else if isInvoiceRegistrationTask(current) {
		if err := uc.applyInvoiceRegistrationTransition(current, in); err != nil {
			return nil, err
		}
	} else if isPayableRegistrationTask(current) {
		if err := uc.applyPayableRegistrationTransition(current, in); err != nil {
			return nil, err
		}
	} else if isPayableReconciliationTask(current) {
		if err := uc.applyPayableReconciliationTransition(current, in); err != nil {
			return nil, err
		}
	}
	if err := normalizeWorkflowDerivedTaskRuntimeAnchors(current, in); err != nil {
		return nil, err
	}
	if workflowStatusUpdateHasNumberedPhaseLabel(in) {
		return nil, ErrBadParam
	}
	updated, err := uc.repo.UpdateWorkflowTaskStatus(ctx, in, actorID, strings.TrimSpace(actorRoleKey))
	if !errors.Is(err, ErrWorkflowTaskSettled) {
		return updated, err
	}
	// Another request may have settled the task after the read above. Preserve
	// same-terminal retries as idempotent reads without replaying side effects.
	latest, getErr := uc.repo.GetWorkflowTask(ctx, in.ID)
	if getErr != nil {
		return nil, getErr
	}
	if workflowTerminalRetryMatches(latest, in) {
		return latest, nil
	}
	return nil, ErrWorkflowTaskSettled
}

func workflowTerminalRetryMatches(current *WorkflowTask, in *WorkflowTaskStatusUpdate) bool {
	if current == nil || in == nil || strings.TrimSpace(current.TaskStatusKey) != strings.TrimSpace(in.TaskStatusKey) {
		return false
	}
	if strings.TrimSpace(current.TaskStatusKey) != "rejected" {
		return true
	}
	return workflowTaskRejectionReason(current) != "" && workflowTaskRejectionReason(current) == strings.TrimSpace(in.Reason)
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

func setWorkflowTransitionReasonPayload(payload map[string]any, taskStatusKey string, reason string) {
	if payload == nil {
		return
	}
	switch strings.TrimSpace(taskStatusKey) {
	case "blocked":
		payload["blocked_reason"] = reason
		delete(payload, "rejected_reason")
	case "rejected":
		payload["rejected_reason"] = reason
		delete(payload, "blocked_reason")
	}
}

func clearWorkflowTransitionReasonPayload(payload map[string]any) {
	if payload == nil {
		return
	}
	delete(payload, "blocked_reason")
	delete(payload, "rejected_reason")
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
		"critical_path":     true,
	}
	setWorkflowTransitionReasonPayload(statePayload, taskStatusKey, reason)
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
		clearWorkflowTransitionReasonPayload(in.Payload)
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
		setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, reason)
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
		setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, reason)
		in.SideEffects = buildPurchaseWarehouseInboundBlockedSideEffects(current, in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyOutsourceReturnTrackingTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowQCPendingStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		delete(in.Payload, "blocked_reason")
		delete(in.Payload, "rejected_reason")
		in.Payload["return_task_id"] = current.ID
		in.Payload["notification_type"] = "task_created"
		in.Payload["alert_type"] = "outsource_return_qc_pending"
		in.Payload["critical_path"] = true
		in.Payload["outsource_processing"] = true
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.SideEffects = buildOutsourceReturnTrackingDoneSideEffects(workflowTaskWithPayload(current, in.Payload))
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
		clearWorkflowTransitionReasonPayload(in.Payload)
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
		setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, reason)
		in.SideEffects = buildOutsourceReturnQCReworkSideEffects(workflowTaskWithPayload(current, in.Payload), in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyOutsourceWarehouseInboundTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowInboundDoneStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		delete(in.Payload, "blocked_reason")
		delete(in.Payload, "rejected_reason")
		in.Payload["warehouse_task_id"] = current.ID
		in.Payload["inbound_result"] = "done"
		in.Payload["inventory_balance_deferred"] = true
		in.Payload["critical_path"] = true
		in.Payload["outsource_processing"] = true
		in.Payload["payable_type"] = "outsource"
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.SideEffects = buildOutsourceWarehouseInboundDoneSideEffects(workflowTaskWithPayload(current, in.Payload))
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyOutsourceReworkTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowProductionProcessingStatusKey
		ensureWorkflowPayload(&in.Payload)
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.Payload["rework_task_id"] = current.ID
		in.Payload["rework_result"] = "arranged"
		in.Payload["critical_path"] = true
		in.Payload["outsource_processing"] = true
		in.SideEffects = buildOutsourceReworkDoneSideEffects(current)
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
		in.Payload["rework_task_id"] = current.ID
		in.Payload["critical_path"] = true
		in.Payload["outsource_processing"] = true
		setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, reason)
		in.SideEffects = buildOutsourceReworkBlockedSideEffects(current, in.TaskStatusKey, reason)
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
		} else {
			in.Payload["qc_result"] = "rejected"
		}
		setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, reason)
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
		setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, reason)
		in.SideEffects = buildFinishedGoodsInboundBlockedSideEffects(workflowTaskWithPayload(current, in.Payload), in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyFinishedGoodsReworkTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowProductionProcessingStatusKey
		ensureWorkflowPayload(&in.Payload)
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.Payload["rework_task_id"] = current.ID
		in.Payload["rework_result"] = "arranged"
		in.Payload["critical_path"] = true
		in.Payload["finished_goods"] = true
		in.SideEffects = buildFinishedGoodsReworkDoneSideEffects(current)
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
		in.Payload["rework_task_id"] = current.ID
		in.Payload["critical_path"] = true
		in.Payload["finished_goods"] = true
		setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, reason)
		in.SideEffects = buildFinishedGoodsReworkBlockedSideEffects(current, in.TaskStatusKey, reason)
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
		setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, reason)
		in.SideEffects = buildShipmentReleaseBlockedSideEffects(workflowTaskWithPayload(current, in.Payload), in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyReceivableRegistrationTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowReconcilingStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		delete(in.Payload, "blocked_reason")
		delete(in.Payload, "rejected_reason")
		in.Payload["receivable_task_id"] = current.ID
		in.Payload["receivable_result"] = "registered"
		in.Payload["notification_type"] = "finance_pending"
		in.Payload["alert_type"] = "invoice_pending"
		in.Payload["critical_path"] = false
		in.Payload["next_module_key"] = workflowInvoicesModuleKey
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.SideEffects = buildReceivableRegistrationDoneSideEffects(workflowTaskWithPayload(current, in.Payload))
	case "blocked", "rejected":
		if err := applyShipmentFinanceBlockedTransition(current, in); err != nil {
			return err
		}
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyInvoiceRegistrationTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowReconcilingStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		delete(in.Payload, "blocked_reason")
		delete(in.Payload, "rejected_reason")
		in.Payload["invoice_task_id"] = current.ID
		in.Payload["invoice_result"] = "registered"
		in.Payload["critical_path"] = false
		in.Payload["next_module_key"] = "reconciliation"
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.SideEffects = buildInvoiceRegistrationDoneSideEffects(workflowTaskWithPayload(current, in.Payload))
	case "blocked", "rejected":
		if err := applyShipmentFinanceBlockedTransition(current, in); err != nil {
			return err
		}
	default:
		return nil
	}
	return nil
}

func applyShipmentFinanceBlockedTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	reason := workflowTransitionReason(in, in.TaskStatusKey)
	if reason == "" {
		return ErrBadParam
	}
	in.Reason = reason
	in.BusinessStatusKey = workflowBlockedStatusKey
	in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
	in.Payload["finance_task_id"] = current.ID
	in.Payload["notification_type"] = "finance_pending"
	in.Payload["alert_type"] = "finance_pending"
	in.Payload["critical_path"] = true
	in.Payload["decision"] = in.TaskStatusKey
	in.Payload["transition_status"] = in.TaskStatusKey
	setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, reason)
	in.SideEffects = buildShipmentFinanceBlockedSideEffects(workflowTaskWithPayload(current, in.Payload), in.TaskStatusKey, reason)
	return nil
}

func (uc *WorkflowUsecase) applyPayableRegistrationTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		payableType := workflowPayableType(current)
		in.BusinessStatusKey = workflowReconcilingStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		delete(in.Payload, "blocked_reason")
		delete(in.Payload, "rejected_reason")
		in.Payload["payable_task_id"] = current.ID
		in.Payload["payable_result"] = "registered"
		in.Payload["notification_type"] = "finance_pending"
		in.Payload["alert_type"] = "reconciliation_pending"
		in.Payload["critical_path"] = false
		in.Payload["next_module_key"] = workflowReconciliationModuleKey
		in.Payload["payable_type"] = payableType
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.SideEffects = buildPayableRegistrationDoneSideEffects(workflowTaskWithPayload(current, in.Payload))
	case "blocked", "rejected":
		if err := applyPayableFinanceBlockedTransition(current, in); err != nil {
			return err
		}
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyPayableReconciliationTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		payableType := workflowPayableType(current)
		in.BusinessStatusKey = workflowSettledStatusKey
		in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
		delete(in.Payload, "blocked_reason")
		delete(in.Payload, "rejected_reason")
		in.Payload["reconciliation_task_id"] = current.ID
		in.Payload["reconciliation_result"] = "settled"
		in.Payload["payable_type"] = payableType
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.SideEffects = buildPayableReconciliationDoneSideEffects(workflowTaskWithPayload(current, in.Payload))
	case "blocked", "rejected":
		if err := applyPayableFinanceBlockedTransition(current, in); err != nil {
			return err
		}
	default:
		return nil
	}
	return nil
}

func applyPayableFinanceBlockedTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	reason := workflowTransitionReason(in, in.TaskStatusKey)
	if reason == "" {
		return ErrBadParam
	}
	payableType := workflowPayableType(current)
	in.Reason = reason
	in.BusinessStatusKey = workflowBlockedStatusKey
	in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
	in.Payload["finance_task_id"] = current.ID
	in.Payload["notification_type"] = "finance_pending"
	in.Payload["alert_type"] = "finance_pending"
	in.Payload["critical_path"] = true
	in.Payload["payable_type"] = payableType
	in.Payload["decision"] = in.TaskStatusKey
	in.Payload["transition_status"] = in.TaskStatusKey
	setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, reason)
	in.SideEffects = buildPayableFinanceBlockedSideEffects(workflowTaskWithPayload(current, in.Payload), in.TaskStatusKey, reason)
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
	filter.VisibleOwnerRoleKeys = normalizeWorkflowVisibleOwnerRoleKeys(filter.VisibleOwnerRoleKeys)
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

func normalizeWorkflowVisibleOwnerRoleKeys(roleKeys []string) []string {
	if len(roleKeys) == 0 {
		return nil
	}
	out := make([]string, 0, len(roleKeys))
	seen := map[string]struct{}{}
	for _, raw := range roleKeys {
		key := NormalizeRoleKey(raw)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, key)
	}
	return out
}

func normalizeWorkflowTaskCreate(in WorkflowTaskCreate) (WorkflowTaskCreate, error) {
	in.TaskCode = strings.TrimSpace(in.TaskCode)
	in.TaskGroup = strings.TrimSpace(in.TaskGroup)
	in.TaskName = strings.TrimSpace(in.TaskName)
	in.SourceType = strings.TrimSpace(in.SourceType)
	in.TaskStatusKey = strings.TrimSpace(in.TaskStatusKey)
	in.OwnerRoleKey = NormalizeRoleKey(in.OwnerRoleKey)
	in.OwnerPoolKey = normalizeWorkflowOptionalStringPtr(in.OwnerPoolKey)
	if in.OwnerPoolKey == nil && in.OwnerRoleKey != "" {
		ownerPoolKey := in.OwnerRoleKey
		in.OwnerPoolKey = &ownerPoolKey
	}
	in.RequiredCapabilityKey = normalizeWorkflowOptionalStringPtr(in.RequiredCapabilityKey)
	if in.RequiredCapabilityKey == nil {
		requiredCapabilityKey := workflowTaskDefaultRequiredCapability(in)
		if requiredCapabilityKey != "" {
			in.RequiredCapabilityKey = &requiredCapabilityKey
		}
	}
	in.ConfigRevision = normalizeWorkflowOptionalStringPtr(in.ConfigRevision)
	var err error
	in.ProcessInstanceID, err = normalizeWorkflowOptionalPositiveIntPtr(in.ProcessInstanceID)
	if err != nil {
		return WorkflowTaskCreate{}, err
	}
	in.ProcessNodeInstanceID, err = normalizeWorkflowOptionalPositiveIntPtr(in.ProcessNodeInstanceID)
	if err != nil {
		return WorkflowTaskCreate{}, err
	}
	if in.ProcessNodeInstanceID != nil && in.ProcessInstanceID == nil {
		return WorkflowTaskCreate{}, ErrBadParam
	}
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

func normalizeWorkflowOptionalStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	normalized := strings.TrimSpace(*value)
	if normalized == "" {
		return nil
	}
	return &normalized
}

func normalizeWorkflowOptionalPositiveIntPtr(value *int) (*int, error) {
	if value == nil {
		return nil, nil
	}
	if *value <= 0 {
		return nil, ErrBadParam
	}
	normalized := *value
	return &normalized, nil
}

func workflowTaskDefaultRequiredCapability(in WorkflowTaskCreate) string {
	task := &WorkflowTask{
		TaskGroup:    in.TaskGroup,
		SourceType:   in.SourceType,
		OwnerRoleKey: in.OwnerRoleKey,
	}
	return WorkflowStatusActionPermission("done", task)
}

func normalizeWorkflowDerivedTaskRuntimeAnchors(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	if current == nil || in == nil || in.SideEffects == nil || in.SideEffects.DerivedTask == nil {
		return nil
	}
	derived := *in.SideEffects.DerivedTask
	if derived.ConfigRevision == nil && current.ConfigRevision != nil {
		derived.ConfigRevision = normalizeWorkflowOptionalStringPtr(current.ConfigRevision)
	}
	normalized, err := normalizeWorkflowTaskCreate(derived)
	if err != nil {
		return err
	}
	in.SideEffects.DerivedTask = &normalized
	return nil
}

func workflowCreateHasNumberedPhaseLabel(in WorkflowTaskCreate) bool {
	return workflowTextHasNumberedPhaseLabel(
		in.TaskCode,
		in.TaskName,
		workflowStringPtrValue(in.SourceNo),
		workflowStringPtrValue(in.BlockedReason),
		workflowStringPtrValue(in.OwnerPoolKey),
		workflowStringPtrValue(in.RequiredCapabilityKey),
		workflowStringPtrValue(in.ConfigRevision),
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
