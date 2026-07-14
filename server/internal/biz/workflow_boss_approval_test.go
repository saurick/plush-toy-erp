package biz

import (
	"context"
	"errors"
	"testing"
)

func TestWorkflowUsecase_BossApprovalDoneDerivesEngineeringTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            101,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "boss"},
	}, 7, "boss")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput == nil {
		t.Fatalf("expected repo update input")
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowOrderApprovedStatusKey {
		t.Fatalf("expected business status %q, got %q", workflowOrderApprovedStatusKey, repo.updateTaskInput.BusinessStatusKey)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected boss approval side effects, got %#v", effects)
	}
	if effects.BusinessState.BusinessStatusKey != workflowOrderApprovedStatusKey {
		t.Fatalf("expected project approved state, got %q", effects.BusinessState.BusinessStatusKey)
	}
	if effects.BusinessState.OwnerRoleKey == nil || *effects.BusinessState.OwnerRoleKey != "engineering" {
		t.Fatalf("expected engineering state owner, got %#v", effects.BusinessState.OwnerRoleKey)
	}
	if effects.BusinessState.Payload["approval_result"] != "approved" {
		t.Fatalf("expected approved payload, got %#v", effects.BusinessState.Payload)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowEngineeringDataTaskGroup ||
		task.TaskName != "准备 BOM / 色卡 / 作业指导书" ||
		task.OwnerRoleKey != "engineering" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected engineering task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowEngineeringPreparingStatusKey {
		t.Fatalf("expected engineering_preparing, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowProjectOrderModuleKey || task.SourceID != 88 {
		t.Fatalf("expected project order source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["next_module_key"] != workflowMaterialBOMModuleKey ||
		task.Payload["entry_path"] != "/erp/business-dashboard" {
		t.Fatalf("expected engineering task entry payload, got %#v", task.Payload)
	}
}

func TestWorkflowUsecase_BossApprovalRepeatedDoneUsesIdempotentDerivedTaskKey(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
			ID:            101,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "boss")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
	}
	if repo.derivedTaskCount != 1 {
		t.Fatalf("expected one derived engineering task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_BossApprovalBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            101,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "boss")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_BossApprovalBlockedDerivesRevisionTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            101,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": " 缺少款图 "},
	}, 7, "boss")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "缺少款图" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != "blocked" {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected blocked side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "boss_approval_blocked_to_order_revision" {
		t.Fatalf("expected blocked workflow rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != "blocked" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "缺少款图" {
		t.Fatalf("unexpected blocked business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["decision"] != "blocked" ||
		effects.BusinessState.Payload["transition_status"] != "blocked" ||
		effects.BusinessState.Payload["blocked_reason"] != "缺少款图" {
		t.Fatalf("expected blocked decision payload, got %#v", effects.BusinessState.Payload)
	}
	assertRevisionTask(t, effects.DerivedTask, "blocked", "缺少款图")
}

func TestWorkflowUsecase_BossApprovalRejectedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            101,
		TaskStatusKey: "rejected",
		Reason:        " \t ",
		Payload:       map[string]any{},
	}, 7, "boss")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_BossApprovalRejectedDerivesRevisionTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: bossApprovalWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            101,
		TaskStatusKey: "rejected",
		Reason:        " 交期和款图缺失 ",
		Payload:       map[string]any{},
	}, 7, "boss")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.Reason != "交期和款图缺失" {
		t.Fatalf("expected trimmed reason, got %q", repo.updateTaskInput.Reason)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowOrderApprovalStatusKey {
		t.Fatalf("expected project_pending, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects.BusinessState.BusinessStatusKey != workflowOrderApprovalStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != SalesRoleKey {
		t.Fatalf("unexpected rejected business state %#v", effects.BusinessState)
	}
	if effects.WorkflowRuleKey != "boss_approval_rejected_to_order_revision" {
		t.Fatalf("expected rejected workflow rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.Payload["decision"] != "rejected" ||
		effects.BusinessState.Payload["transition_status"] != "rejected" ||
		effects.BusinessState.Payload["rejected_reason"] != "交期和款图缺失" {
		t.Fatalf("expected rejected decision payload, got %#v", effects.BusinessState.Payload)
	}
	assertRevisionTask(t, effects.DerivedTask, "rejected", "交期和款图缺失")
}

func TestWorkflowUsecase_NonBossApprovalTaskKeepsOriginalUpdateBehavior(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: &WorkflowTask{
		ID:            201,
		TaskGroup:     workflowOrderApprovalTaskGroup,
		SourceType:    workflowProjectOrderModuleKey,
		SourceID:      88,
		TaskStatusKey: "ready",
		OwnerRoleKey:  SalesRoleKey,
		Payload:       map[string]any{},
	}}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            201,
		TaskStatusKey: "blocked",
		Reason:        "通用阻塞验证",
		Payload:       map[string]any{},
	}, 7, SalesRoleKey)
	if err != nil {
		t.Fatalf("non-boss task should keep original behavior, got %v", err)
	}
	if repo.updateTaskInput.SideEffects != nil {
		t.Fatalf("non-boss task should not derive side effects")
	}
}

func TestWorkflowUsecase_SameNameNonBossApprovalTaskDoesNotDerive(t *testing.T) {
	cases := []struct {
		name string
		task *WorkflowTask
	}{
		{
			name: "business order approval",
			task: &WorkflowTask{
				ID:            301,
				TaskGroup:     workflowOrderApprovalTaskGroup,
				TaskName:      "老板审批订单",
				SourceType:    workflowProjectOrderModuleKey,
				SourceID:      88,
				TaskStatusKey: "ready",
				OwnerRoleKey:  SalesRoleKey,
				Payload:       map[string]any{},
			},
		},
		{
			name: "boss task from another source",
			task: &WorkflowTask{
				ID:            302,
				TaskGroup:     workflowOrderApprovalTaskGroup,
				TaskName:      "老板审批订单",
				SourceType:    "shipping-release",
				SourceID:      88,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "boss",
				Payload:       map[string]any{},
			},
		},
		{
			name: "boss project task from another group",
			task: &WorkflowTask{
				ID:            303,
				TaskGroup:     "warehouse_inbound",
				TaskName:      "老板审批订单",
				SourceType:    workflowProjectOrderModuleKey,
				SourceID:      88,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "boss",
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
				t.Fatalf("same-name non-boss approval task should keep original behavior, got %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatalf("expected repo update")
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("same-name non-boss approval task should not derive side effects")
			}
		})
	}
}
