package biz

import (
	"context"
	"errors"
	"testing"
)

func TestWorkflowUsecase_PayableRegistrationDoneDerivesPurchaseReconciliationTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchasePayableRegistrationWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1701,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "finance"},
	}, 7, "finance")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowReconcilingStatusKey {
		t.Fatalf("expected reconciling business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["payable_task_id"] != 1701 ||
		repo.updateTaskInput.Payload["payable_result"] != "registered" ||
		repo.updateTaskInput.Payload["payable_type"] != "purchase" {
		t.Fatalf("expected purchase payable update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected payable registration side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "payable_registration_done_to_reconciliation" {
		t.Fatalf("expected payable registration rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowReconcilingStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "finance" {
		t.Fatalf("unexpected payable business state %#v", effects.BusinessState)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowPurchaseReconciliationGroup ||
		task.TaskName != "采购对账" ||
		task.OwnerRoleKey != "finance" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected purchase reconciliation task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowReconcilingStatusKey {
		t.Fatalf("expected reconciling, got %#v", task.BusinessStatusKey)
	}
	if task.Payload["payable_task_id"] != 1701 ||
		task.Payload["alert_type"] != "reconciliation_pending" ||
		task.Payload["next_module_key"] != workflowReconciliationModuleKey ||
		task.Payload["payable_type"] != "purchase" ||
		task.Payload["supplier_name"] != "联调供应商" {
		t.Fatalf("expected purchase reconciliation payload, got %#v", task.Payload)
	}
}

func TestWorkflowUsecase_PayableRegistrationDoneDerivesOutsourceReconciliationTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: outsourcePayableRegistrationWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1801,
		TaskStatusKey: "done",
		Payload:       map[string]any{},
	}, 7, "finance")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.DerivedTask == nil {
		t.Fatalf("expected outsource payable side effects, got %#v", effects)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowOutsourceReconciliationGroup ||
		task.TaskName != "委外对账" ||
		task.Payload["payable_type"] != "outsource" {
		t.Fatalf("unexpected outsource reconciliation task %#v", task)
	}
}

func TestWorkflowUsecase_PayableRegistrationRepeatedDoneUsesIdempotentDerivedTaskKey(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchasePayableRegistrationWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
			ID:            1701,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "finance")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
	}
	if repo.derivedTaskCount != 1 {
		t.Fatalf("expected one derived reconciliation task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_PayableReconciliationDoneWritesSettledState(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchaseReconciliationWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1901,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "finance"},
	}, 7, "finance")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowSettledStatusKey {
		t.Fatalf("expected settled business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["reconciliation_task_id"] != 1901 ||
		repo.updateTaskInput.Payload["reconciliation_result"] != "settled" ||
		repo.updateTaskInput.Payload["payable_type"] != "purchase" {
		t.Fatalf("expected reconciliation update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask != nil {
		t.Fatalf("expected reconciliation state-only side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "payable_reconciliation_done_to_settled" {
		t.Fatalf("expected reconciliation rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowSettledStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "finance" {
		t.Fatalf("unexpected reconciliation business state %#v", effects.BusinessState)
	}
}

func TestWorkflowUsecase_PayableFinanceBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: purchasePayableRegistrationWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1701,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "\t"},
	}, 7, "finance")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_PayableFinanceBlockedWritesBlockedState(t *testing.T) {
	task := purchaseReconciliationWorkflowTask()
	task.Payload["rejected_reason"] = "旧退回原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1901,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "供应商账单未到"},
	}, 7, "finance")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["blocked_reason"] != "供应商账单未到" ||
		repo.updateTaskInput.Payload["decision"] != "blocked" ||
		repo.updateTaskInput.Payload["finance_task_id"] != 1901 ||
		repo.updateTaskInput.Payload["payable_type"] != "purchase" {
		t.Fatalf("expected payable blocked payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["rejected_reason"]; ok {
		t.Fatalf("expected blocked transition to clear stale rejected_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask != nil {
		t.Fatalf("expected payable blocked state-only side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "payable_finance_blocked_to_blocked" {
		t.Fatalf("expected payable blocked rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "finance" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "供应商账单未到" {
		t.Fatalf("unexpected payable blocked business state %#v", effects.BusinessState)
	}
}

func TestWorkflowUsecase_SameNameNonPayableTaskDoesNotDerive(t *testing.T) {
	cases := []struct {
		name string
		task *WorkflowTask
	}{
		{
			name: "wrong owner",
			task: &WorkflowTask{
				ID:            2001,
				TaskGroup:     workflowPurchasePayableRegistrationGroup,
				TaskName:      "采购应付登记",
				SourceType:    workflowAccessoriesPurchaseModuleKey,
				SourceID:      71,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "purchase",
				Payload:       map[string]any{},
			},
		},
		{
			name: "wrong source",
			task: &WorkflowTask{
				ID:            2002,
				TaskGroup:     workflowPurchasePayableRegistrationGroup,
				TaskName:      "采购应付登记",
				SourceType:    workflowProjectOrderModuleKey,
				SourceID:      71,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "finance",
				Payload:       map[string]any{},
			},
		},
		{
			name: "wrong business status",
			task: &WorkflowTask{
				ID:                2003,
				TaskGroup:         workflowPurchaseReconciliationGroup,
				TaskName:          "采购对账",
				SourceType:        workflowReconciliationModuleKey,
				SourceID:          71,
				BusinessStatusKey: ptrString(workflowInboundDoneStatusKey),
				TaskStatusKey:     "ready",
				OwnerRoleKey:      "finance",
				Payload:           map[string]any{},
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubWorkflowRepo{currentTask: tc.task}
			uc := NewWorkflowUsecase(repo)

			_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
				ID:            tc.task.ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{},
			}, 7, "finance")
			if err != nil {
				t.Fatalf("expected nil err, got %v", err)
			}
			if repo.updateTaskInput.SideEffects != nil {
				t.Fatalf("expected no payable side effects, got %#v", repo.updateTaskInput.SideEffects)
			}
		})
	}
}

func purchasePayableRegistrationWorkflowTask() *WorkflowTask {
	sourceNo := "AP-071"
	businessStatusKey := workflowInboundDoneStatusKey
	return &WorkflowTask{
		ID:                1701,
		TaskGroup:         workflowPurchasePayableRegistrationGroup,
		TaskName:          "采购应付登记",
		SourceType:        workflowAccessoriesPurchaseModuleKey,
		SourceID:          71,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "finance",
		Priority:          3,
		Payload: map[string]any{
			"record_title":       "辅料采购入库",
			"source_no":          "PO-071",
			"supplier_name":      "联调供应商",
			"material_name":      "PP 棉",
			"quantity":           120,
			"unit":               "kg",
			"amount":             9600,
			"tax_rate":           "13%",
			"tax_amount":         1104.42,
			"amount_with_tax":    9600,
			"amount_without_tax": 8495.58,
			"payment_due_date":   "2026-04-30",
			"inbound_date":       "2026-04-24",
			"iqc_result":         "pass",
			"payable_type":       "purchase",
		},
	}
}

func outsourcePayableRegistrationWorkflowTask() *WorkflowTask {
	sourceNo := "PC-072"
	businessStatusKey := workflowInboundDoneStatusKey
	return &WorkflowTask{
		ID:                1801,
		TaskGroup:         workflowOutsourcePayableRegistrationGroup,
		TaskName:          "委外应付登记",
		SourceType:        workflowProcessingContractsModuleKey,
		SourceID:          72,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "finance",
		Priority:          2,
		Payload: map[string]any{
			"record_title":         "委外加工入库",
			"source_no":            "SO-072",
			"supplier_name":        "联调加工厂",
			"product_name":         "兔子挂件",
			"quantity":             300,
			"unit":                 "只",
			"amount":               15000,
			"tax_rate":             "6%",
			"tax_amount":           849.06,
			"amount_with_tax":      15000,
			"amount_without_tax":   14150.94,
			"payment_due_date":     "2026-05-05",
			"inbound_date":         "2026-04-24",
			"qc_result":            "pass",
			"outsource_processing": true,
			"payable_type":         "outsource",
		},
	}
}

func purchaseReconciliationWorkflowTask() *WorkflowTask {
	task := purchasePayableRegistrationWorkflowTask()
	task.ID = 1901
	task.TaskGroup = workflowPurchaseReconciliationGroup
	task.TaskName = "采购对账"
	task.BusinessStatusKey = ptrString(workflowReconcilingStatusKey)
	task.Payload["payable_task_id"] = 1701
	task.Payload["payable_result"] = "registered"
	return task
}
