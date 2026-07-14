package biz

import (
	"context"
	"errors"
	"testing"
)

func TestWorkflowUsecase_OutsourceReturnQCDoneDerivesWarehouseInboundTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality"},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput == nil {
		t.Fatalf("expected repo update input")
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowWarehouseInboundPendingKey {
		t.Fatalf("expected business status %q, got %q", workflowWarehouseInboundPendingKey, repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["qc_result"] != "pass" ||
		repo.updateTaskInput.Payload["qc_type"] != "outsource_return" ||
		repo.updateTaskInput.Payload["outsource_processing"] != true {
		t.Fatalf("expected outsource QC done update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected outsource QC done side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "outsource_return_qc_done_to_outsource_warehouse_inbound" {
		t.Fatalf("expected outsource QC done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowWarehouseInboundPendingKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected outsource QC done business state %#v", effects.BusinessState)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowOutsourceWarehouseInboundTaskGroup ||
		task.TaskName != "委外回货入库" ||
		task.OwnerRoleKey != "warehouse" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected outsource warehouse inbound task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowWarehouseInboundPendingKey {
		t.Fatalf("expected warehouse_inbound_pending, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowProcessingContractsModuleKey || task.SourceID != 99 {
		t.Fatalf("expected processing contract source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["qc_task_id"] != 901 ||
		task.Payload["qc_result"] != "pass" ||
		task.Payload["qc_type"] != "outsource_return" ||
		task.Payload["outsource_processing"] != true ||
		task.Payload["inventory_balance_deferred"] != true ||
		task.Payload["notification_type"] != "task_created" ||
		task.Payload["alert_type"] != "inbound_pending" {
		t.Fatalf("expected outsource warehouse inbound payload, got %#v", task.Payload)
	}
}

func TestWorkflowUsecase_OutsourceReturnTrackingDoneDerivesReturnQCTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnTrackingWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            931,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "production"},
	}, 7, "production")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowQCPendingStatusKey {
		t.Fatalf("expected qc_pending business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["return_task_id"] != 931 ||
		repo.updateTaskInput.Payload["alert_type"] != "outsource_return_qc_pending" ||
		repo.updateTaskInput.Payload["outsource_processing"] != true {
		t.Fatalf("expected outsource return tracking update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected outsource return tracking side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "outsource_return_tracking_done_to_return_qc" {
		t.Fatalf("expected outsource return tracking rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowQCPendingStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "quality" {
		t.Fatalf("unexpected outsource return tracking business state %#v", effects.BusinessState)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowOutsourceReturnQCTaskGroup ||
		task.TaskName != "委外回货检验" ||
		task.OwnerRoleKey != "quality" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected outsource return QC task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowQCPendingStatusKey {
		t.Fatalf("expected qc_pending, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowProcessingContractsModuleKey || task.SourceID != 99 {
		t.Fatalf("expected processing contract source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["return_task_id"] != 931 ||
		task.Payload["qc_type"] != "outsource_return" ||
		task.Payload["outsource_processing"] != true ||
		task.Payload["notification_type"] != "task_created" ||
		task.Payload["alert_type"] != "outsource_return_qc_pending" {
		t.Fatalf("expected outsource return QC payload, got %#v", task.Payload)
	}
}

func TestWorkflowUsecase_OutsourceReturnTrackingRepeatedDoneUsesIdempotentDerivedTaskKey(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnTrackingWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
			ID:            931,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "production")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
	}
	if repo.derivedTaskCount != 1 {
		t.Fatalf("expected one derived outsource return QC task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_OutsourceReturnQCDoneUsesTransitionPayloadForDownstream(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "done",
		Payload:       map[string]any{"qc_result": "accepted"},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected outsource QC done side effects, got %#v", effects)
	}
	if repo.updateTaskInput.Payload["qc_result"] != "accepted" {
		t.Fatalf("expected update payload qc_result accepted, got %#v", repo.updateTaskInput.Payload)
	}
	if effects.BusinessState.Payload["qc_result"] != "accepted" {
		t.Fatalf("expected business state to keep transition qc_result, got %#v", effects.BusinessState.Payload)
	}
	if effects.DerivedTask.Payload["qc_result"] != "accepted" {
		t.Fatalf("expected derived warehouse inbound to keep transition qc_result, got %#v", effects.DerivedTask.Payload)
	}
}

func TestWorkflowUsecase_OutsourceReturnQCRepeatedDoneUsesIdempotentDerivedTaskKey(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
			ID:            901,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "quality")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
	}
	if repo.derivedTaskCount != 1 {
		t.Fatalf("expected one derived outsource warehouse inbound task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_OutsourceWarehouseInboundDoneDerivesPayableTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceWarehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            991,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowInboundDoneStatusKey {
		t.Fatalf("expected inbound_done business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["warehouse_task_id"] != 991 ||
		repo.updateTaskInput.Payload["inbound_result"] != "done" ||
		repo.updateTaskInput.Payload["payable_type"] != "outsource" ||
		repo.updateTaskInput.Payload["outsource_processing"] != true {
		t.Fatalf("expected outsource warehouse inbound update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected outsource warehouse inbound side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "outsource_warehouse_inbound_done_to_outsource_payable_registration" {
		t.Fatalf("expected outsource warehouse inbound rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowInboundDoneStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "finance" {
		t.Fatalf("unexpected outsource warehouse inbound business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["warehouse_task_id"] != 991 ||
		effects.BusinessState.Payload["alert_type"] != "payable_pending" ||
		effects.BusinessState.Payload["payable_type"] != "outsource" {
		t.Fatalf("expected finance state payload, got %#v", effects.BusinessState.Payload)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowOutsourcePayableRegistrationGroup ||
		task.TaskName != "委外应付登记" ||
		task.OwnerRoleKey != "finance" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected outsource payable task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowInboundDoneStatusKey {
		t.Fatalf("expected inbound_done, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowProcessingContractsModuleKey || task.SourceID != 99 {
		t.Fatalf("expected processing contract source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["warehouse_task_id"] != 991 ||
		task.Payload["inbound_result"] != "done" ||
		task.Payload["alert_type"] != "payable_pending" ||
		task.Payload["next_module_key"] != "payables" ||
		task.Payload["payable_type"] != "outsource" ||
		task.Payload["amount_with_tax"] != 13560 {
		t.Fatalf("expected outsource payable payload, got %#v", task.Payload)
	}
}

func TestWorkflowUsecase_OutsourceWarehouseInboundRepeatedDoneUsesIdempotentDerivedTaskKey(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceWarehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
			ID:            991,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "warehouse")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
	}
	if repo.derivedTaskCount != 1 {
		t.Fatalf("expected one derived outsource payable task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_OutsourceReturnQCBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "quality")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_OutsourceReturnQCBlockedDerivesReworkTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 回货抽检待判责 "},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "回货抽检待判责" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["transition_status"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "回货抽检待判责" ||
		repo.updateTaskInput.Payload["qc_type"] != "outsource_return" {
		t.Fatalf("expected blocked decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked transition to clear stale rejected_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected outsource QC blocked side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "outsource_return_qc_blocked_to_outsource_rework" {
		t.Fatalf("expected outsource QC blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "production" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "回货抽检待判责" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "blocked" ||
		effects.BusinessState.Payload["transition_status"] != "blocked" ||
		effects.BusinessState.Payload["blocked_reason"] != "回货抽检待判责" {
		t.Fatalf("expected blocked state payload, got %#v", effects.BusinessState.Payload)
	}
	assertOutsourceReworkTask(t, effects.DerivedTask, "blocked", "回货抽检待判责")
}

func TestWorkflowUsecase_OutsourceReturnQCBlockedOverridesStaleRejectedReason(t *testing.T) {
	task := outsourceReturnQCWorkflowTask()
	task.Payload["decision"] = "rejected"
	task.Payload["rejected_reason"] = "旧退回原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "blocked",
		Reason:        "当前阻塞原因",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "当前阻塞原因" {
		t.Fatalf("expected blocked transition to refresh stale reason fields, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked transition to clear stale rejected_reason, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.SideEffects.DerivedTask.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked rework task payload to omit stale rejected_reason, got %#v", repo.updateTaskInput.SideEffects.DerivedTask.Payload)
	}
}

func TestWorkflowUsecase_OutsourceReturnQCRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "rejected",
		Reason:        " \t ",
		Payload:       map[string]any{},
	}, 7, "quality")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_OutsourceReturnQCRejectedDerivesReworkTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReturnQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "rejected",
		Reason:        " 车缝开线 ",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "车缝开线" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["transition_status"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "车缝开线" ||
		repo.updateTaskInput.Payload["qc_type"] != "outsource_return" {
		t.Fatalf("expected rejected decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "production" {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.WorkflowRuleKey != "outsource_return_qc_rejected_to_outsource_rework" {
		t.Fatalf("expected outsource QC rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	assertOutsourceReworkTask(t, effects.DerivedTask, "rejected", "车缝开线")
}

func TestWorkflowUsecase_OutsourceReturnQCRejectedClearsStaleBlockedReason(t *testing.T) {
	task := outsourceReturnQCWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowQCFailedStatusKey)
	task.Payload["decision"] = "blocked"
	task.Payload["blocked_reason"] = "旧阻塞原因"
	task.Payload["rejected_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            901,
		TaskStatusKey: "rejected",
		Reason:        "当前退回原因",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "当前退回原因" {
		t.Fatalf("expected rejected transition payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.SideEffects.DerivedTask.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected rework task payload to omit stale blocked_reason, got %#v", repo.updateTaskInput.SideEffects.DerivedTask.Payload)
	}
}

func TestWorkflowUsecase_OutsourceReturnQCSettledBusinessStatusDoesNotTriggerSpecialRule(t *testing.T) {
	cases := []struct {
		name              string
		businessStatusKey string
	}{
		{name: "already warehouse inbound pending", businessStatusKey: workflowWarehouseInboundPendingKey},
		{name: "already blocked", businessStatusKey: workflowBlockedStatusKey},
		{name: "already inbound done", businessStatusKey: workflowInboundDoneStatusKey},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			task := outsourceReturnQCWorkflowTask()
			task.BusinessStatusKey = ptrString(tc.businessStatusKey)
			repo := &stubWorkflowRepo{currentTask: task}
			uc := NewWorkflowUsecase(repo)

			_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
				ID:            task.ID,
				TaskStatusKey: "blocked",
				Reason:        "通用阻塞验证",
				Payload:       map[string]any{},
			}, 7, "quality")
			if err != nil {
				t.Fatalf("settled outsource QC status should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("settled outsource QC status should not trigger special side effects")
			}
		})
	}
}

func TestWorkflowUsecase_OutsourceReturnQCFailedBusinessStatusStillUsesSpecialRule(t *testing.T) {
	task := outsourceReturnQCWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowQCFailedStatusKey)
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "rejected",
		Reason:        "返工后复检仍不合格",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("qc_failed outsource QC task should still use special rule, got %v", err)
	}
	if repo.updateTaskInput == nil || repo.updateTaskInput.SideEffects == nil {
		t.Fatalf("expected qc_failed outsource QC task to derive side effects")
	}
	if repo.updateTaskInput.SideEffects.DerivedTask == nil ||
		repo.updateTaskInput.SideEffects.DerivedTask.TaskGroup != workflowOutsourceReworkTaskGroup {
		t.Fatalf("expected outsource rework side effect, got %#v", repo.updateTaskInput.SideEffects)
	}
}

func TestWorkflowUsecase_OutsourceReworkDoneWritesProductionProcessingState(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReworkWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            971,
		TaskStatusKey: "done",
		Payload:       map[string]any{},
	}, 7, "production")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowProductionProcessingStatusKey {
		t.Fatalf("expected production_processing business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "done" ||
		repo.updateTaskInput.Payload["transition_status"] != "done" ||
		repo.updateTaskInput.Payload["rework_task_id"] != 971 ||
		repo.updateTaskInput.Payload["rework_result"] != "arranged" ||
		repo.updateTaskInput.Payload["outsource_processing"] != true {
		t.Fatalf("expected outsource rework done update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected outsource rework done side effects, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("outsource rework done must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "outsource_rework_done_to_production_processing" {
		t.Fatalf("expected outsource rework done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowProductionProcessingStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "production" {
		t.Fatalf("unexpected outsource rework done business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["rework_task_id"] != 971 ||
		effects.BusinessState.Payload["rework_result"] != "arranged" ||
		effects.BusinessState.Payload["outsource_processing"] != true {
		t.Fatalf("expected outsource rework done state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_OutsourceReworkBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReworkWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            971,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "production")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_OutsourceReworkBlockedWritesQCFailedState(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourceReworkWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            971,
		TaskStatusKey: "blocked",
		Reason:        "返工线等待确认",
		Payload:       map[string]any{},
	}, 7, "production")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["transition_status"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "返工线等待确认" ||
		repo.updateTaskInput.Payload["outsource_processing"] != true {
		t.Fatalf("expected outsource rework blocked update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected outsource rework blocked side effects, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("outsource rework blocked must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "outsource_rework_blocked_to_qc_failed" {
		t.Fatalf("expected outsource rework blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "production" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "返工线等待确认" {
		t.Fatalf("unexpected outsource rework blocked business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["blocked_reason"] != "返工线等待确认" ||
		effects.BusinessState.Payload["outsource_processing"] != true {
		t.Fatalf("expected outsource rework blocked state payload, got %#v", effects.BusinessState.Payload)
	}
}
