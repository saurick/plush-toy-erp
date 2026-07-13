package biz

import (
	"context"
	"errors"
	"testing"
)

func TestWorkflowUsecase_WarehouseInboundDoneUpsertsInboundDoneOnly(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            701,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput == nil {
		t.Fatalf("expected repo update input")
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowInboundDoneStatusKey {
		t.Fatalf("expected business status %q, got %q", workflowInboundDoneStatusKey, repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "done" ||
		repo.updateTaskInput.Payload["transition_status"] != "done" ||
		repo.updateTaskInput.Payload["inbound_result"] != "done" ||
		repo.updateTaskInput.Payload["warehouse_task_id"] != 701 ||
		repo.updateTaskInput.Payload["inventory_balance_deferred"] != true {
		t.Fatalf("expected warehouse inbound done update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected warehouse inbound business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("warehouse inbound done must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "warehouse_inbound_done_to_inbound_done" {
		t.Fatalf("expected warehouse inbound done rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowInboundDoneStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected warehouse inbound done business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["inbound_result"] != "done" ||
		effects.BusinessState.Payload["inventory_balance_deferred"] != true ||
		effects.BusinessState.Payload["decision"] != "done" ||
		effects.BusinessState.Payload["transition_status"] != "done" {
		t.Fatalf("expected inbound_done state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_WarehouseInboundRepeatedDoneDoesNotDeriveDownstreamTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
			ID:            701,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "warehouse")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
		if repo.updateTaskInput.SideEffects == nil ||
			repo.updateTaskInput.SideEffects.DerivedTask != nil {
			t.Fatalf("warehouse inbound done should only upsert business state")
		}
	}
	if repo.derivedTaskCount != 0 {
		t.Fatalf("expected no derived downstream task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_WarehouseInboundBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            701,
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

func TestWorkflowUsecase_WarehouseInboundBlockedUpsertsBlockedState(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            701,
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
		repo.updateTaskInput.Payload["blocked_reason"] != "库位未确认" {
		t.Fatalf("expected blocked decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected warehouse inbound blocked business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("warehouse inbound blocked must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "warehouse_inbound_blocked_to_blocked" {
		t.Fatalf("expected warehouse inbound blocked rule key, got %q", effects.WorkflowRuleKey)
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

func TestWorkflowUsecase_WarehouseInboundRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            701,
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

func TestWorkflowUsecase_WarehouseInboundRejectedUpsertsBlockedState(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            701,
		TaskStatusKey: "rejected",
		Reason:        " 到货数量与单据不符 ",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "到货数量与单据不符" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["transition_status"] != "rejected" ||
		repo.updateTaskInput.Payload["rejected_reason"] != "到货数量与单据不符" {
		t.Fatalf("expected rejected decision update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil {
		t.Fatalf("expected warehouse inbound rejected business state side effect, got %#v", effects)
	}
	if effects.DerivedTask != nil {
		t.Fatalf("warehouse inbound rejected must not derive downstream task, got %#v", effects.DerivedTask)
	}
	if effects.WorkflowRuleKey != "warehouse_inbound_rejected_to_blocked" {
		t.Fatalf("expected warehouse inbound rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "rejected" ||
		effects.BusinessState.Payload["transition_status"] != "rejected" ||
		effects.BusinessState.Payload["rejected_reason"] != "到货数量与单据不符" {
		t.Fatalf("expected rejected state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_WarehouseInboundSettledBusinessStatusDoesNotTriggerSpecialRule(t *testing.T) {
	cases := []struct {
		name              string
		businessStatusKey string
	}{
		{name: "already inbound done", businessStatusKey: workflowInboundDoneStatusKey},
		{name: "already blocked", businessStatusKey: workflowBlockedStatusKey},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			task := warehouseInboundWorkflowTask()
			task.BusinessStatusKey = ptrString(tc.businessStatusKey)
			repo := &stubWorkflowRepo{currentTask: task}
			uc := NewWorkflowUsecase(repo)

			_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
				ID:            task.ID,
				TaskStatusKey: "blocked",
				Reason:        "通用阻塞验证",
				Payload:       map[string]any{},
			}, 7, "warehouse")
			if err != nil {
				t.Fatalf("settled warehouse inbound status should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("settled warehouse inbound status should not trigger special side effects")
			}
		})
	}
}

func TestWorkflowUsecase_WarehouseInboundNonDerivedStatusKeepsOriginalBehavior(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: warehouseInboundWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            701,
		TaskStatusKey: "processing",
		Payload:       map[string]any{},
	}, 7, "warehouse")
	if err != nil {
		t.Fatalf("processing should keep original behavior, got %v", err)
	}
	if repo.updateTaskInput.SideEffects != nil {
		t.Fatalf("processing should not derive side effects")
	}
}
