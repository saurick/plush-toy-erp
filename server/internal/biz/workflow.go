package biz

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

func (uc *WorkflowUsecase) Metadata() (taskStates, businessStates []WorkflowStateOption) {
	return WorkflowTaskStates(), WorkflowBusinessStates()
}

func (uc *WorkflowUsecase) ListTasks(ctx context.Context, filter WorkflowTaskFilter) ([]*WorkflowTask, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	filter = normalizeWorkflowTaskFilter(filter)
	if filter.TaskStatusKey != "" && !IsKnownWorkflowTaskState(filter.TaskStatusKey) {
		return nil, 0, ErrBadParam
	}
	if utf8.RuneCountInString(filter.Keyword) > 200 ||
		(filter.DueFrom != nil && filter.DueFrom.IsZero()) ||
		(filter.DueTo != nil && filter.DueTo.IsZero()) ||
		(filter.DueFrom != nil && filter.DueTo != nil && filter.DueFrom.After(*filter.DueTo)) {
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

func (uc *WorkflowUsecase) ListTaskEvents(ctx context.Context, taskID int, limit int) ([]*WorkflowTaskEvent, error) {
	if uc == nil || uc.repo == nil || taskID <= 0 || limit < 1 || limit > 100 {
		return nil, ErrBadParam
	}
	reader, ok := uc.repo.(WorkflowTaskEventReader)
	if !ok {
		return nil, ErrBadParam
	}
	return reader.ListWorkflowTaskEvents(ctx, taskID, limit)
}

func (uc *WorkflowUsecase) CreateTask(ctx context.Context, in *WorkflowTaskCreate, actorID int) (*WorkflowTask, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeWorkflowTaskCreate(*in)
	if err != nil {
		return nil, err
	}
	if err := ValidateWorkflowSourceTaskReservedNamespace(normalized.TaskGroup, normalized.TaskCode); err != nil {
		return nil, err
	}
	return uc.repo.CreateWorkflowTask(ctx, &normalized, actorID)
}

func (uc *WorkflowUsecase) UpdateTaskStatus(ctx context.Context, in *WorkflowTaskStatusUpdate, actorID int, actorRoleKey string) (*WorkflowTask, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	if err := prepareWorkflowTaskStatusMutation(in, actorID); err != nil {
		return nil, err
	}
	if replayed, found, err := uc.repo.ResolveWorkflowTaskMutation(ctx, in.ID, in.IdempotencyKey, in.IntentHash, in.CommandKey, actorID); err != nil || found {
		return replayed, err
	}
	current, err := uc.repo.GetWorkflowTask(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if IsTerminalWorkflowTaskStatus(current.TaskStatusKey) {
		return nil, ErrWorkflowTaskSettled
	}
	if in.ExpectedVersion != current.Version {
		return nil, ErrWorkflowTaskConflict
	}
	if !CanTransitionWorkflowTaskStatus(current.TaskStatusKey, in.TaskStatusKey) {
		return nil, ErrBadParam
	}
	if in.TaskStatusKey == "blocked" || in.TaskStatusKey == "rejected" {
		in.Reason = workflowTransitionReason(in, in.TaskStatusKey)
		if in.Reason == "" {
			return nil, ErrBadParam
		}
	}
	in.Payload = mergeWorkflowPayload(current.Payload, in.Payload)
	switch in.TaskStatusKey {
	case "blocked", "rejected":
		setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, in.Reason)
	default:
		clearWorkflowTransitionReasonPayload(in.Payload)
	}
	handler, err := selectWorkflowTaskTransitionHandler(current)
	if err != nil {
		return nil, err
	}
	if handler != nil {
		if err := handler.Apply(uc, current, in); err != nil {
			return nil, err
		}
	}
	if err := normalizeWorkflowDerivedTaskRuntimeAnchors(current, in); err != nil {
		return nil, err
	}
	if workflowStatusUpdateHasNumberedPhaseLabel(in) {
		return nil, ErrNumberedImplementationStageLabel
	}
	return uc.repo.UpdateWorkflowTaskStatus(ctx, in, actorID, strings.TrimSpace(actorRoleKey))
}

type workflowTaskTransitionHandler struct {
	Key   string
	Match func(*WorkflowTask) bool
	Apply func(*WorkflowUsecase, *WorkflowTask, *WorkflowTaskStatusUpdate) error
}

var workflowTaskTransitionHandlers = []workflowTaskTransitionHandler{
	{Key: "boss_order_approval", Match: isBossOrderApprovalTask, Apply: (*WorkflowUsecase).applyBossApprovalTransition},
	{Key: "purchase_iqc", Match: isPurchaseIQCTask, Apply: (*WorkflowUsecase).applyPurchaseIQCTransition},
	{Key: "purchase_warehouse_inbound", Match: isPurchaseWarehouseInboundTask, Apply: (*WorkflowUsecase).applyPurchaseWarehouseInboundTransition},
	{Key: "outsource_return_tracking", Match: isOutsourceReturnTrackingTask, Apply: (*WorkflowUsecase).applyOutsourceReturnTrackingTransition},
	{Key: "outsource_return_qc", Match: isOutsourceReturnQCTask, Apply: (*WorkflowUsecase).applyOutsourceReturnQCTransition},
	{Key: "outsource_warehouse_inbound", Match: isOutsourceWarehouseInboundTask, Apply: (*WorkflowUsecase).applyOutsourceWarehouseInboundTransition},
	{Key: "outsource_rework", Match: isOutsourceReworkTask, Apply: (*WorkflowUsecase).applyOutsourceReworkTransition},
	{Key: "finished_goods_qc", Match: isFinishedGoodsQCTask, Apply: (*WorkflowUsecase).applyFinishedGoodsQCTransition},
	{Key: "finished_goods_inbound", Match: isFinishedGoodsInboundTask, Apply: (*WorkflowUsecase).applyFinishedGoodsInboundTransition},
	{Key: "finished_goods_rework", Match: isFinishedGoodsReworkTask, Apply: (*WorkflowUsecase).applyFinishedGoodsReworkTransition},
	{Key: "production_scheduling", Match: isProductionSchedulingSourceTask, Apply: (*WorkflowUsecase).applyProductionSchedulingSourceTaskTransition},
	{Key: "production_exception", Match: isProductionExceptionSourceTask, Apply: (*WorkflowUsecase).applyProductionExceptionSourceTaskTransition},
	{Key: "shipment_release", Match: isShipmentReleaseTask, Apply: (*WorkflowUsecase).applyShipmentReleaseTransition},
	{Key: "receivable_registration", Match: isReceivableRegistrationTask, Apply: (*WorkflowUsecase).applyReceivableRegistrationTransition},
	{Key: "invoice_registration", Match: isInvoiceRegistrationTask, Apply: (*WorkflowUsecase).applyInvoiceRegistrationTransition},
	{Key: "payable_registration", Match: isPayableRegistrationTask, Apply: (*WorkflowUsecase).applyPayableRegistrationTransition},
	{Key: "payable_reconciliation", Match: isPayableReconciliationTask, Apply: (*WorkflowUsecase).applyPayableReconciliationTransition},
}

func selectWorkflowTaskTransitionHandler(current *WorkflowTask) (*workflowTaskTransitionHandler, error) {
	return selectWorkflowTaskTransitionHandlerFrom(workflowTaskTransitionHandlers, current)
}

func selectWorkflowTaskTransitionHandlerFrom(handlers []workflowTaskTransitionHandler, current *WorkflowTask) (*workflowTaskTransitionHandler, error) {
	var matched *workflowTaskTransitionHandler
	keys := make(map[string]struct{}, len(handlers))
	for index := range handlers {
		handler := &handlers[index]
		key := strings.TrimSpace(handler.Key)
		if key == "" || handler.Match == nil || handler.Apply == nil {
			return nil, fmt.Errorf("%w: invalid workflow transition handler registration", ErrBadParam)
		}
		if _, exists := keys[key]; exists {
			return nil, fmt.Errorf("%w: duplicate workflow transition handler %s", ErrBadParam, key)
		}
		keys[key] = struct{}{}
		if !handler.Match(current) {
			continue
		}
		if matched != nil {
			return nil, fmt.Errorf("%w: workflow transition handlers %s and %s both matched", ErrBadParam, matched.Key, handler.Key)
		}
		matched = handler
	}
	return matched, nil
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

func (uc *WorkflowUsecase) applyProductionSchedulingSourceTaskTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowProductionProcessingStatusKey
		in.Payload["scheduling_task_id"] = current.ID
		in.Payload["scheduling_result"] = "confirmed"
		in.Payload["production_execution_required"] = true
		in.Payload["production_fact_deferred"] = true
		in.Payload["critical_path"] = true
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.SideEffects = buildProductionSchedulingDoneSideEffects(workflowTaskWithPayload(current, in.Payload))
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		in.BusinessStatusKey = workflowBlockedStatusKey
		in.Payload["scheduling_task_id"] = current.ID
		in.Payload["scheduling_result"] = in.TaskStatusKey
		in.Payload["critical_path"] = true
		in.Payload["decision"] = in.TaskStatusKey
		in.Payload["transition_status"] = in.TaskStatusKey
		setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, reason)
		in.SideEffects = buildProductionSchedulingBlockedSideEffects(workflowTaskWithPayload(current, in.Payload), in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyProductionExceptionSourceTaskTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	productionOrderID, found, err := processCommandPositiveIntFromPayload(current.Payload, "production_order_id")
	if err != nil || !found {
		return ErrBadParam
	}
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowProductionProcessingStatusKey
		in.Payload["production_exception_task_id"] = current.ID
		in.Payload["production_exception_result"] = "handled"
		in.Payload["production_fact_correction_deferred"] = true
		in.Payload["inventory_adjustment_deferred"] = true
		in.Payload["quality_followup_deferred"] = true
		in.Payload["critical_path"] = true
		in.Payload["decision"] = "done"
		in.Payload["transition_status"] = "done"
		in.SideEffects = buildProductionExceptionDoneSideEffects(workflowTaskWithPayload(current, in.Payload), productionOrderID)
	case "blocked", "rejected":
		reason := workflowTransitionReason(in, in.TaskStatusKey)
		if reason == "" {
			return ErrBadParam
		}
		in.Reason = reason
		in.BusinessStatusKey = workflowBlockedStatusKey
		in.Payload["production_exception_task_id"] = current.ID
		in.Payload["production_exception_result"] = in.TaskStatusKey
		in.Payload["critical_path"] = true
		in.Payload["decision"] = in.TaskStatusKey
		in.Payload["transition_status"] = in.TaskStatusKey
		setWorkflowTransitionReasonPayload(in.Payload, in.TaskStatusKey, reason)
		in.SideEffects = buildProductionExceptionBlockedSideEffects(workflowTaskWithPayload(current, in.Payload), productionOrderID, in.TaskStatusKey, reason)
	default:
		return nil
	}
	return nil
}

func (uc *WorkflowUsecase) applyShipmentReleaseTransition(current *WorkflowTask, in *WorkflowTaskStatusUpdate) error {
	switch in.TaskStatusKey {
	case "done":
		in.BusinessStatusKey = workflowShippingReleasedStatusKey
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
	if err := prepareWorkflowTaskUrgeMutation(in, actorID); err != nil {
		return nil, err
	}
	if replayed, found, err := uc.repo.ResolveWorkflowTaskMutation(ctx, in.ID, in.IdempotencyKey, in.IntentHash, in.CommandKey, actorID); err != nil || found {
		return replayed, err
	}
	current, err := uc.repo.GetWorkflowTask(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if IsTerminalWorkflowTaskStatus(current.TaskStatusKey) {
		return nil, ErrWorkflowTaskSettled
	}
	if in.ExpectedVersion != current.Version {
		return nil, ErrWorkflowTaskConflict
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
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.OwnerRoleKey = NormalizeRoleKey(filter.OwnerRoleKey)
	filter.VisibleOwnerRoleKeys = normalizeWorkflowVisibleOwnerRoleKeys(filter.VisibleOwnerRoleKeys)
	filter.VisibilityScope = NormalizeWorkflowTaskVisibilityScope(filter.VisibilityScope)
	filter.TaskStatusKey = strings.TrimSpace(filter.TaskStatusKey)
	filter.TaskGroup = strings.TrimSpace(filter.TaskGroup)
	filter.SourceType = strings.TrimSpace(filter.SourceType)
	filter.DueFrom = normalizeWorkflowFilterTime(filter.DueFrom)
	filter.DueTo = normalizeWorkflowFilterTime(filter.DueTo)
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

func normalizeWorkflowFilterTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	normalized := time.Unix(value.Unix(), 0).UTC()
	return &normalized
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
		in.TaskStatusKey = "ready"
	}
	if in.Payload == nil {
		in.Payload = map[string]any{}
	}
	in.CriticalPath = in.CriticalPath || workflowPayloadBool(in.Payload, "critical_path")
	if workflowCreateHasNumberedPhaseLabel(in) {
		return WorkflowTaskCreate{}, ErrNumberedImplementationStageLabel
	}
	if in.TaskCode == "" || in.TaskGroup == "" || in.TaskName == "" || in.SourceType == "" || in.SourceID <= 0 || in.OwnerRoleKey == "" {
		return WorkflowTaskCreate{}, ErrBadParam
	}
	if !IsCreatableWorkflowTaskState(in.TaskStatusKey) || in.BlockedReason != nil {
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
	return containsNumberedImplementationStageLabel(values...)
}

func workflowValueHasNumberedPhaseLabel(value any) bool {
	return valueContainsNumberedImplementationStageLabel(value)
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
