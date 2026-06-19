package biz

import (
	"context"
	"errors"
	"testing"
)

func TestWorkflowUsecase_ShipmentReleaseDoneUpsertsShippingReleasedOnly(t *testing.T) {
	task := shipmentReleaseWorkflowTask()
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowShippingReleasedStatusKey {
		t.Fatalf("expected shipping_released, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["shipment_release_task_id"] != task.ID ||
		repo.updateTaskInput.Payload["shipment_release_result"] != "done" ||
		repo.updateTaskInput.Payload["shipment_release_deferred_inventory"] != true ||
		repo.updateTaskInput.Payload["shipment_execution_required"] != true ||
		repo.updateTaskInput.Payload["inventory_out_deferred"] != true ||
		repo.updateTaskInput.Payload["receivable_deferred"] != true ||
		repo.updateTaskInput.Payload["invoice_deferred"] != true ||
		repo.updateTaskInput.Payload["decision"] != "done" ||
		repo.updateTaskInput.Payload["transition_status"] != "done" {
		t.Fatalf("expected shipment release done payload, got %#v", repo.updateTaskInput.Payload)
	}
	if repo.updateTaskInput.Payload["shipment_result"] == "shipped" {
		t.Fatalf("shipment_release done must not be marked as shipped, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected done transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected shipment release business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("shipment release done must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "shipment_release_done_to_shipping_released" {
		t.Fatalf("expected shipment release done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowShippingReleasedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected shipment release business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["shipment_release_task_id"] != task.ID ||
		effects.BusinessState.Payload["shipment_release_result"] != "done" ||
		effects.BusinessState.Payload["inventory_out_deferred"] != true ||
		effects.BusinessState.Payload["receivable_deferred"] != true ||
		effects.BusinessState.Payload["invoice_deferred"] != true ||
		effects.BusinessState.Payload["decision"] != "done" {
		t.Fatalf("expected shipping_released state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_ShipmentReleaseRepeatedDoneDoesNotDeriveDownstreamTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: shipmentReleaseWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
			ID:            1401,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "warehouse")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
		if repo.updateTaskInput.SideEffects == nil ||
			repo.updateTaskInput.SideEffects.DerivedTask != nil {
			t.Fatalf("shipment release done should only upsert business state")
		}
	}
	if repo.derivedTaskCount != 0 {
		t.Fatalf("expected no derived downstream task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_ShipmentReleaseBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: shipmentReleaseWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1401,
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

func TestWorkflowUsecase_ShipmentReleaseBlockedUpsertsBlockedState(t *testing.T) {
	task := shipmentReleaseWorkflowTask()
	task.Payload["rejected_reason"] = "旧退回原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 客户资料未确认 "},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "客户资料未确认" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["transition_status"] != "blocked" ||
		repo.updateTaskInput.Payload["blocked_reason"] != "客户资料未确认" ||
		repo.updateTaskInput.Payload["shipment_release_task_id"] != task.ID {
		t.Fatalf("expected blocked decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked transition to clear stale rejected_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected shipment release blocked business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("shipment release blocked must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "shipment_release_blocked_to_blocked" {
		t.Fatalf("expected shipment release blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "客户资料未确认" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "blocked" ||
		effects.BusinessState.Payload["transition_status"] != "blocked" ||
		effects.BusinessState.Payload["blocked_reason"] != "客户资料未确认" {
		t.Fatalf("expected blocked state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_ShipmentReleaseRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: shipmentReleaseWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1401,
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

func TestWorkflowUsecase_ShipmentReleaseRejectedUpsertsBlockedState(t *testing.T) {
	task := shipmentReleaseWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowBlockedStatusKey)
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "rejected",
		Reason:        "客户取消本次放行",
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
		repo.updateTaskInput.Payload["rejected_reason"] != "客户取消本次放行" {
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
	if effects.WorkflowRuleKey != "shipment_release_rejected_to_blocked" {
		t.Fatalf("expected shipment release rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("shipment release rejected must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if _, ok := effects.BusinessState.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected business state to omit stale blocked_reason, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_ShipmentReleaseSettledBusinessStatusDoesNotTriggerSpecialRule(t *testing.T) {
	cases := []struct {
		name              string
		businessStatusKey string
	}{
		{name: "already shipping released", businessStatusKey: workflowShippingReleasedStatusKey},
		{name: "already shipped", businessStatusKey: "shipped"},
		{name: "already receivable pending", businessStatusKey: "receivable_pending"},
		{name: "already invoice pending", businessStatusKey: "invoice_pending"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			task := shipmentReleaseWorkflowTask()
			task.BusinessStatusKey = ptrString(tc.businessStatusKey)
			repo := &stubWorkflowRepo{currentTask: task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            task.ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{},
			}, 7, "warehouse")
			if err != nil {
				t.Fatalf("settled shipment release status should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("settled shipment release status should not trigger special side effects")
			}
		})
	}
}

func TestWorkflowUsecase_ShipmentReleaseBlockedBusinessStatusStillUsesSpecialRule(t *testing.T) {
	task := shipmentReleaseWorkflowTask()
	task.BusinessStatusKey = ptrString(workflowBlockedStatusKey)
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "blocked",
		Reason:        "重复确认仍不能放行",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("blocked shipment release task should still use special rule, got %v", err)
	}
	if repo.updateTaskInput == nil || repo.updateTaskInput.SideEffects == nil {
		t.Fatalf("expected blocked shipment release task to upsert business state")
	}
	if repo.updateTaskInput.SideEffects.DerivedTask != nil {
		t.Fatalf("blocked shipment release task must not derive downstream task")
	}
	if repo.updateTaskInput.SideEffects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business state, got %#v", repo.updateTaskInput.SideEffects.BusinessState)
	}
}
