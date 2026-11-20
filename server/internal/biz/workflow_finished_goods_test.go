package biz

import (
	"context"
	"errors"
	"testing"
)

func TestWorkflowUsecase_FinishedGoodsQCDoneDerivesInboundTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1001,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality"},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowWarehouseInboundPendingKey {
		t.Fatalf("expected warehouse inbound pending, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["qc_result"] != "pass" ||
		repo.updateTaskInput.Payload["finished_goods"] != true ||
		repo.updateTaskInput.Payload["inventory_balance_deferred"] != true ||
		repo.updateTaskInput.Payload["alert_type"] != "finished_goods_inbound_pending" {
		t.Fatalf("expected finished goods QC done update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected finished goods QC done side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "finished_goods_qc_done_to_finished_goods_inbound" {
		t.Fatalf("expected finished goods QC done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowWarehouseInboundPendingKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected finished goods QC business state %#v", effects.BusinessState)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowFinishedGoodsInboundTaskGroup ||
		task.TaskName != "成品入库" ||
		task.OwnerRoleKey != "warehouse" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected finished goods inbound task %#v", task)
	}
	if task.Payload["qc_task_id"] != 1001 ||
		task.Payload["qc_result"] != "pass" ||
		task.Payload["finished_goods"] != true ||
		task.Payload["inventory_balance_deferred"] != true ||
		task.Payload["alert_type"] != "finished_goods_inbound_pending" ||
		task.Payload["customer_name"] != "成慧怡" ||
		task.Payload["style_no"] != "ST-001" ||
		task.Payload["shipment_date"] != "2026-04-30" {
		t.Fatalf("expected finished goods inbound payload, got %#v", task.Payload)
	}
	if task.TaskGroup == "shipment_release" {
		t.Fatalf("finished goods QC done must not derive shipment release")
	}
}

func TestWorkflowUsecase_FinishedGoodsQCDoneUsesTransitionPayloadForDownstream(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1001,
		TaskStatusKey: "done",
		Payload: map[string]any{
			"qc_result": "accepted",
			"quantity":  1180,
		},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected finished goods QC done side effects, got %#v", effects)
	}
	if repo.updateTaskInput.Payload["qc_result"] != "accepted" ||
		effects.BusinessState.Payload["qc_result"] != "accepted" ||
		effects.DerivedTask.Payload["qc_result"] != "accepted" {
		t.Fatalf("expected transition qc_result in update, state and downstream, got update=%#v state=%#v task=%#v", repo.updateTaskInput.Payload, effects.BusinessState.Payload, effects.DerivedTask.Payload)
	}
	if effects.DerivedTask.Payload["quantity"] != 1180 {
		t.Fatalf("expected downstream to use transition quantity, got %#v", effects.DerivedTask.Payload)
	}
}

func TestWorkflowUsecase_FinishedGoodsQCRepeatedDoneUsesIdempotentDerivedTaskKey(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
			ID:            1001,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "quality")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
	}
	if repo.derivedTaskCount != 1 {
		t.Fatalf("expected one derived finished goods inbound task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_FinishedGoodsQCBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1001,
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

func TestWorkflowUsecase_FinishedGoodsQCBlockedDerivesReworkTask(t *testing.T) {
	task := finishedGoodsQCWorkflowTask()
	task.Payload["rejected_reason"] = "旧退回原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1001,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 车缝开线 "},
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
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["transition_status"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "车缝开线" ||
		repo.updateTaskInput.Payload["qc_result"] != "blocked" ||
		repo.updateTaskInput.Payload["finished_goods"] != true {
		t.Fatalf("expected blocked decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked transition to clear stale rejected_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected finished goods QC blocked side effects, got %#v", effects)
	}
	if !effects.RefreshExistingDerivedTaskPayload {
		t.Fatalf("expected finished goods rework reuse to refresh payload")
	}
	if effects.WorkflowRuleKey != "finished_goods_qc_blocked_to_finished_goods_rework" {
		t.Fatalf("expected finished goods QC blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "production" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "车缝开线" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "blocked" ||
		effects.BusinessState.Payload["transition_status"] != "blocked" ||
		effects.BusinessState.Payload["blocked_reason"] != "车缝开线" {
		t.Fatalf("expected blocked state payload, got %#v", effects.BusinessState.Payload)
	}
	assertFinishedGoodsReworkTask(t, effects.DerivedTask, "blocked", "车缝开线")
	if _, ok := effects.DerivedTask.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked rework payload to omit stale rejected_reason, got %#v", effects.DerivedTask.Payload)
	}
}

func TestWorkflowUsecase_FinishedGoodsQCRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsQCWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1001,
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

func TestWorkflowUsecase_FinishedGoodsQCRejectedDerivesReworkTask(t *testing.T) {
	task := finishedGoodsQCWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowQCFailedStatusKey)
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1001,
		TaskStatusKey: "rejected",
		Reason:        "尺寸偏差",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "尺寸偏差" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["transition_status"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "尺寸偏差" ||
		repo.updateTaskInput.Payload["qc_result"] != "rejected" {
		t.Fatalf("expected rejected decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "production" {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.WorkflowRuleKey != "finished_goods_qc_rejected_to_finished_goods_rework" {
		t.Fatalf("expected finished goods QC rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	assertFinishedGoodsReworkTask(t, effects.DerivedTask, "rejected", "尺寸偏差")
	if _, ok := effects.DerivedTask.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected rework payload to omit stale blocked_reason, got %#v", effects.DerivedTask.Payload)
	}
}

func TestWorkflowUsecase_SameNameNonFinishedGoodsQCTaskDoesNotDerive(t *testing.T) {
	cases := []struct {
		name string
		task *WorkflowTask
	}{
		{
			name: "wrong owner",
			task: &WorkflowTask{
				ID:            1101,
				TaskGroup:     workflowFinishedGoodsQCTaskGroup,
				TaskName:      "成品抽检",
				SourceType:    workflowProductionProgressModuleKey,
				SourceID:      101,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "warehouse",
				Payload:       map[string]any{"finished_goods": true},
			},
		},
		{
			name: "wrong source",
			task: &WorkflowTask{
				ID:            1102,
				TaskGroup:     workflowFinishedGoodsQCTaskGroup,
				TaskName:      "成品抽检",
				SourceType:    workflowInboundModuleKey,
				SourceID:      101,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "quality",
				Payload:       map[string]any{"finished_goods": true},
			},
		},
		{
			name: "missing finished goods marker",
			task: &WorkflowTask{
				ID:            1103,
				TaskGroup:     workflowFinishedGoodsQCTaskGroup,
				TaskName:      "成品抽检",
				SourceType:    workflowProductionProgressModuleKey,
				SourceID:      101,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "quality",
				Payload:       map[string]any{},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubWorkflowRepo{currentTask: tc.task}
			uc := NewWorkflowUsecase(repo)

			_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
				ID:            tc.task.ID,
				TaskStatusKey: "blocked",
				Reason:        "通用阻塞验证",
				Payload:       map[string]any{},
			}, 7, tc.task.OwnerRoleKey)
			if err != nil {
				t.Fatalf("same-name non-finished-goods-QC task should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("same-name non-finished-goods-QC task should not derive side effects")
			}
		})
	}
}

func TestWorkflowUsecase_FinishedGoodsQCSettledBusinessStatusDoesNotTriggerSpecialRule(t *testing.T) {
	cases := []struct {
		name              string
		businessStatusKey string
	}{
		{name: "already warehouse inbound pending", businessStatusKey: workflowWarehouseInboundPendingKey},
		{name: "already inbound done", businessStatusKey: workflowInboundDoneStatusKey},
		{name: "already shipped", businessStatusKey: "shipped"},
		{name: "already blocked", businessStatusKey: workflowBlockedStatusKey},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			task := finishedGoodsQCWorkflowTask()
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
				t.Fatalf("settled finished goods QC status should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("settled finished goods QC status should not trigger special side effects")
			}
		})
	}
}

func TestWorkflowUsecase_FinishedGoodsQCFailedBusinessStatusStillUsesSpecialRule(t *testing.T) {
	task := finishedGoodsQCWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowQCFailedStatusKey)
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "blocked",
		Reason:        "返工后复检仍不合格",
		Payload:       map[string]any{},
	}, 7, "quality")
	if err != nil {
		t.Fatalf("qc_failed finished goods QC task should still use special rule, got %v", err)
	}
	if repo.updateTaskInput == nil || repo.updateTaskInput.SideEffects == nil {
		t.Fatalf("expected qc_failed finished goods QC task to derive side effects")
	}
	if repo.updateTaskInput.SideEffects.DerivedTask == nil ||
		repo.updateTaskInput.SideEffects.DerivedTask.TaskGroup != workflowFinishedGoodsReworkTaskGroup {
		t.Fatalf("expected finished goods rework side effect, got %#v", repo.updateTaskInput.SideEffects)
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundDoneUpsertsInboundDoneOnly(t *testing.T) {
	task := finishedGoodsInboundWorkflowTask()
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowInboundDoneStatusKey {
		t.Fatalf("expected inbound_done, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["inbound_task_id"] != task.ID ||
		repo.updateTaskInput.Payload["inbound_result"] != "done" ||
		repo.updateTaskInput.Payload["finished_goods"] != true ||
		repo.updateTaskInput.Payload["inventory_balance_deferred"] != true ||
		repo.updateTaskInput.Payload["shipment_release_deferred"] != true ||
		repo.updateTaskInput.Payload["decision"] != "done" ||
		repo.updateTaskInput.Payload["transition_status"] != "done" {
		t.Fatalf("expected finished goods inbound done payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected done transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected finished goods inbound business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("finished goods inbound done must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "finished_goods_inbound_done_to_inbound_done" {
		t.Fatalf("expected finished goods inbound done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowInboundDoneStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected finished goods inbound business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["inbound_task_id"] != task.ID ||
		effects.BusinessState.Payload["inbound_result"] != "done" ||
		effects.BusinessState.Payload["inventory_balance_deferred"] != true ||
		effects.BusinessState.Payload["shipment_release_deferred"] != true ||
		effects.BusinessState.Payload["decision"] != "done" {
		t.Fatalf("expected inbound_done state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundRepeatedDoneDoesNotDeriveDownstreamTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
			ID:            1201,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "warehouse")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
		if repo.updateTaskInput.SideEffects == nil ||
			repo.updateTaskInput.SideEffects.DerivedTask != nil {
			t.Fatalf("finished goods inbound done should only upsert business state")
		}
	}
	if repo.derivedTaskCount != 0 {
		t.Fatalf("expected no derived downstream task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1201,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "warehouse")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundBlockedUpsertsBlockedState(t *testing.T) {
	task := finishedGoodsInboundWorkflowTask()
	task.Payload["rejected_reason"] = "旧退回原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 库位未确认 "},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "库位未确认" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["transition_status"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "库位未确认" ||
		repo.updateTaskInput.Payload["finished_goods"] != true {
		t.Fatalf("expected blocked decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked transition to clear stale rejected_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected finished goods inbound blocked business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("finished goods inbound blocked must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "finished_goods_inbound_blocked_to_blocked" {
		t.Fatalf("expected finished goods inbound blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "库位未确认" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "blocked" ||
		effects.BusinessState.Payload["transition_status"] != "blocked" ||
		effects.BusinessState.Payload["blocked_reason"] != "库位未确认" {
		t.Fatalf("expected blocked state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1201,
		TaskStatusKey: "rejected",
		Reason:        " \t ",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundRejectedUpsertsBlockedState(t *testing.T) {
	task := finishedGoodsInboundWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowBlockedStatusKey)
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "rejected",
		Reason:        "数量与完工单不符",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["transition_status"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "数量与完工单不符" {
		t.Fatalf("expected rejected decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.WorkflowRuleKey != "finished_goods_inbound_rejected_to_blocked" {
		t.Fatalf("expected finished goods inbound rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("finished goods inbound rejected must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if _, ok := effects.BusinessState.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected business state to omit stale blocked_reason, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_SameNameNonFinishedGoodsInboundTaskDoesNotDerive(t *testing.T) {
	cases := []struct {
		name string
		task *WorkflowTask
	}{
		{
			name: "wrong owner",
			task: &WorkflowTask{
				ID:                1301,
				TaskGroup:         workflowFinishedGoodsInboundTaskGroup,
				TaskName:          "成品入库",
				SourceType:        workflowProductionProgressModuleKey,
				SourceID:          101,
				BusinessStatusKey: ptrString(workflowWarehouseInboundPendingKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "quality",
				Payload:           map[string]any{"finished_goods": true},
			},
		},
		{
			name: "wrong source",
			task: &WorkflowTask{
				ID:                1302,
				TaskGroup:         workflowFinishedGoodsInboundTaskGroup,
				TaskName:          "成品入库",
				SourceType:        workflowInboundModuleKey,
				SourceID:          101,
				BusinessStatusKey: ptrString(workflowWarehouseInboundPendingKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "warehouse",
				Payload:           map[string]any{"finished_goods": true},
			},
		},
		{
			name: "missing finished goods marker",
			task: &WorkflowTask{
				ID:                1303,
				TaskGroup:         workflowFinishedGoodsInboundTaskGroup,
				TaskName:          "成品入库",
				SourceType:        workflowProductionProgressModuleKey,
				SourceID:          101,
				BusinessStatusKey: ptrString(workflowWarehouseInboundPendingKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "warehouse",
				Payload:           map[string]any{},
			},
		},
		{
			name: "settled business status",
			task: &WorkflowTask{
				ID:                1304,
				TaskGroup:         workflowFinishedGoodsInboundTaskGroup,
				TaskName:          "成品入库",
				SourceType:        workflowProductionProgressModuleKey,
				SourceID:          101,
				BusinessStatusKey: ptrString(workflowInboundDoneStatusKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "warehouse",
				Payload:           map[string]any{"finished_goods": true},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubWorkflowRepo{currentTask: tc.task}
			uc := NewWorkflowUsecase(repo)

			_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
				ID:            tc.task.ID,
				TaskStatusKey: "blocked",
				Reason:        "通用阻塞验证",
				Payload:       map[string]any{},
			}, 7, tc.task.OwnerRoleKey)
			if err != nil {
				t.Fatalf("same-name non-finished-goods-inbound task should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("same-name non-finished-goods-inbound task should not derive side effects")
			}
		})
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundSettledBusinessStatusDoesNotTriggerSpecialRule(t *testing.T) {
	cases := []struct {
		name              string
		businessStatusKey string
	}{
		{name: "already inbound done", businessStatusKey: workflowInboundDoneStatusKey},
		{name: "already shipment pending", businessStatusKey: "shipment_pending"},
		{name: "already shipping released", businessStatusKey: "shipping_released"},
		{name: "already shipped", businessStatusKey: "shipped"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			task := finishedGoodsInboundWorkflowTask()
			task.BusinessStatusKey = ptrString(tc.businessStatusKey)
			repo := &stubWorkflowRepo{currentTask: task}
			uc := NewWorkflowUsecase(repo)

			_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
				ID:            task.ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{},
			}, 7, "warehouse")
			if err != nil {
				t.Fatalf("settled finished goods inbound status should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("settled finished goods inbound status should not trigger special side effects")
			}
		})
	}
}

func TestWorkflowUsecase_FinishedGoodsInboundBlockedBusinessStatusStillUsesSpecialRule(t *testing.T) {
	task := finishedGoodsInboundWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowBlockedStatusKey)
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "blocked",
		Reason:        "重复确认仍卡库位",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("blocked finished goods inbound task should still use special rule, got %v", err)
	}
	if repo.updateTaskInput == nil || repo.updateTaskInput.SideEffects == nil {
		t.Fatalf("expected blocked finished goods inbound task to upsert business state")
	}
	if repo.updateTaskInput.SideEffects.DerivedTask != nil {
		t.Fatalf("blocked finished goods inbound task must not derive downstream task")
	}
	if repo.updateTaskInput.SideEffects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business state, got %#v", repo.updateTaskInput.SideEffects.BusinessState)
	}
}

func TestWorkflowUsecase_FinishedGoodsReworkDoneWritesProductionProcessingState(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsReworkWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1301,
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
		repo.updateTaskInput.Payload["rework_task_id"] != 1301 ||
		repo.updateTaskInput.Payload["rework_result"] != "arranged" ||
		repo.updateTaskInput.Payload["finished_goods"] != true {
		t.Fatalf("expected rework done update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected finished goods rework done side effects, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("finished goods rework done must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "finished_goods_rework_done_to_production_processing" {
		t.Fatalf("expected finished goods rework done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowProductionProcessingStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "production" {
		t.Fatalf("unexpected rework done business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["rework_task_id"] != 1301 ||
		effects.BusinessState.Payload["rework_result"] != "arranged" ||
		effects.BusinessState.Payload["finished_goods"] != true {
		t.Fatalf("expected rework done state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_FinishedGoodsReworkBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsReworkWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1301,
		TaskStatusKey: "blocked",
		Reason:        " ",
		Payload:       map[string]any{},
	}, 7, "production")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_FinishedGoodsReworkBlockedWritesQCFailedState(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsReworkWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1301,
		TaskStatusKey: "blocked",
		Reason:        "返工线等待确认",
		Payload:       map[string]any{"rejected_reason": "旧退回原因"},
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
		repo.updateTaskInput.Payload["finished_goods"] != true {
		t.Fatalf("expected rework blocked update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked transition to clear stale rejected_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected finished goods rework blocked side effects, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("finished goods rework blocked must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "finished_goods_rework_blocked_to_qc_failed" {
		t.Fatalf("expected finished goods rework blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowQCFailedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "production" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "返工线等待确认" {
		t.Fatalf("unexpected rework blocked business state %#v", effects.BusinessState)
	}
}

func TestWorkflowUsecase_FinishedGoodsReworkRejectedClearsBlockedReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: finishedGoodsReworkWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1301,
		TaskStatusKey: "rejected",
		Reason:        "返工后仍未达标",
		Payload:       map[string]any{"blocked_reason": "旧阻塞原因"},
	}, 7, "production")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowQCFailedStatusKey {
		t.Fatalf("expected qc_failed business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["transition_status"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "返工后仍未达标" ||
		repo.updateTaskInput.Payload["finished_goods"] != true {
		t.Fatalf("expected rework rejected update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected finished goods rework rejected side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "finished_goods_rework_rejected_to_qc_failed" {
		t.Fatalf("expected finished goods rework rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.Payload["rejected_reason"] != "返工后仍未达标" {
		t.Fatalf("expected rejected business state reason, got %#v", effects.BusinessState.Payload)
	}
	if _, ok := effects.BusinessState.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected business state to omit stale blocked_reason, got %#v", effects.BusinessState.Payload)
	}
}
