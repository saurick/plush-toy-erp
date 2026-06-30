package biz

import (
	"context"
	"errors"
	"testing"
)

func TestWorkflowUsecase_ReceivableRegistrationDoneDerivesInvoiceTask(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: receivableRegistrationWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1401,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "finance"},
	}, 7, "finance")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowReconcilingStatusKey {
		t.Fatalf("expected reconciling business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["receivable_task_id"] != 1401 ||
		repo.updateTaskInput.Payload["receivable_result"] != "registered" ||
		repo.updateTaskInput.Payload["alert_type"] != "invoice_pending" {
		t.Fatalf("expected receivable registration update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask == nil {
		t.Fatalf("expected receivable registration side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "receivable_registration_done_to_invoice_registration" {
		t.Fatalf("expected receivable registration rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowReconcilingStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "finance" {
		t.Fatalf("unexpected receivable business state %#v", effects.BusinessState)
	}
	task := effects.DerivedTask
	if task.TaskGroup != workflowInvoiceRegistrationTaskGroup ||
		task.TaskName != "开票登记" ||
		task.OwnerRoleKey != "finance" ||
		task.TaskStatusKey != "ready" {
		t.Fatalf("unexpected invoice task %#v", task)
	}
	if task.BusinessStatusKey == nil || *task.BusinessStatusKey != workflowReconcilingStatusKey {
		t.Fatalf("expected reconciling, got %#v", task.BusinessStatusKey)
	}
	if task.SourceType != workflowOutboundModuleKey || task.SourceID != 56 {
		t.Fatalf("expected outbound source, got %s/%d", task.SourceType, task.SourceID)
	}
	if task.Payload["receivable_task_id"] != 1401 ||
		task.Payload["receivable_result"] != "registered" ||
		task.Payload["alert_type"] != "invoice_pending" ||
		task.Payload["next_module_key"] != workflowInvoicesModuleKey ||
		task.Payload["customer_name"] != "联调客户" ||
		task.Payload["amount_with_tax"] != 36000 {
		t.Fatalf("expected invoice task payload, got %#v", task.Payload)
	}
}

func TestWorkflowUsecase_ReceivableRegistrationRepeatedDoneUsesIdempotentDerivedTaskKey(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: receivableRegistrationWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	for i := 0; i < 2; i++ {
		_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
			ID:            1401,
			TaskStatusKey: "done",
			Payload:       map[string]any{},
		}, 7, "finance")
		if err != nil {
			t.Fatalf("update #%d failed: %v", i+1, err)
		}
	}
	if repo.derivedTaskCount != 1 {
		t.Fatalf("expected one derived invoice task intent, got %d", repo.derivedTaskCount)
	}
}

func TestWorkflowUsecase_InvoiceRegistrationDoneWritesReconcilingState(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: invoiceRegistrationWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1501,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "finance"},
	}, 7, "finance")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowReconcilingStatusKey {
		t.Fatalf("expected reconciling business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["invoice_task_id"] != 1501 ||
		repo.updateTaskInput.Payload["invoice_result"] != "registered" ||
		repo.updateTaskInput.Payload["next_module_key"] != "reconciliation" {
		t.Fatalf("expected invoice registration update payload, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask != nil {
		t.Fatalf("expected invoice registration state-only side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "invoice_registration_done_to_reconciling" {
		t.Fatalf("expected invoice registration rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowReconcilingStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "finance" {
		t.Fatalf("unexpected invoice business state %#v", effects.BusinessState)
	}
	if effects.BusinessState.Payload["invoice_task_id"] != 1501 ||
		effects.BusinessState.Payload["invoice_result"] != "registered" {
		t.Fatalf("expected invoice state payload, got %#v", effects.BusinessState.Payload)
	}
}

func TestWorkflowUsecase_ShipmentFinanceBlockedRequiresReason(t *testing.T) {
	repo := &stubWorkflowRepo{currentTask: receivableRegistrationWorkflowTask()}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1401,
		TaskStatusKey: "blocked",
		Payload:       map[string]any{"blocked_reason": "   "},
	}, 7, "finance")
	if !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected ErrBadParam, got %v", err)
	}
	if repo.updateTaskInput != nil {
		t.Fatalf("repo update should not be called without reason")
	}
}

func TestWorkflowUsecase_ShipmentFinanceRejectedWritesBlockedState(t *testing.T) {
	task := invoiceRegistrationWorkflowTask()
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := uc.UpdateTaskStatus(context.Background(), &WorkflowTaskStatusUpdate{
		ID:            1501,
		TaskStatusKey: "rejected",
		Reason:        "客户发票资料缺失",
		Payload:       map[string]any{},
	}, 7, "finance")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if repo.updateTaskInput.BusinessStatusKey != workflowBlockedStatusKey {
		t.Fatalf("expected blocked business status, got %q", repo.updateTaskInput.BusinessStatusKey)
	}
	if repo.updateTaskInput.Payload["rejected_reason"] != "客户发票资料缺失" ||
		repo.updateTaskInput.Payload["decision"] != "rejected" ||
		repo.updateTaskInput.Payload["finance_task_id"] != 1501 {
		t.Fatalf("expected finance rejected payload, got %#v", repo.updateTaskInput.Payload)
	}
	if _, ok := repo.updateTaskInput.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected transition to clear stale blocked_reason, got %#v", repo.updateTaskInput.Payload)
	}
	effects := repo.updateTaskInput.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask != nil {
		t.Fatalf("expected finance blocked state-only side effects, got %#v", effects)
	}
	if effects.WorkflowRuleKey != "shipment_finance_rejected_to_blocked" {
		t.Fatalf("expected finance rejected rule key, got %q", effects.WorkflowRuleKey)
	}
	if effects.BusinessState.BusinessStatusKey != workflowBlockedStatusKey ||
		effects.BusinessState.OwnerRoleKey == nil ||
		*effects.BusinessState.OwnerRoleKey != "finance" ||
		effects.BusinessState.BlockedReason == nil ||
		*effects.BusinessState.BlockedReason != "客户发票资料缺失" {
		t.Fatalf("unexpected finance blocked business state %#v", effects.BusinessState)
	}
}

func TestWorkflowUsecase_SameNameNonShipmentFinanceTaskDoesNotDerive(t *testing.T) {
	cases := []struct {
		name string
		task *WorkflowTask
	}{
		{
			name: "wrong owner",
			task: &WorkflowTask{
				ID:            1601,
				TaskGroup:     workflowReceivableRegistrationTaskGroup,
				TaskName:      "应收登记",
				SourceType:    workflowOutboundModuleKey,
				SourceID:      56,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "warehouse",
				Payload:       map[string]any{},
			},
		},
		{
			name: "wrong source",
			task: &WorkflowTask{
				ID:            1602,
				TaskGroup:     workflowReceivableRegistrationTaskGroup,
				TaskName:      "应收登记",
				SourceType:    workflowAccessoriesPurchaseModuleKey,
				SourceID:      56,
				TaskStatusKey: "ready",
				OwnerRoleKey:  "finance",
				Payload:       map[string]any{},
			},
		},
		{
			name: "wrong business status",
			task: &WorkflowTask{
				ID:                1603,
				TaskGroup:         workflowInvoiceRegistrationTaskGroup,
				TaskName:          "开票登记",
				SourceType:        workflowInvoicesModuleKey,
				SourceID:          56,
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
				t.Fatalf("expected no shipment finance side effects, got %#v", repo.updateTaskInput.SideEffects)
			}
		})
	}
}

func receivableRegistrationWorkflowTask() *WorkflowTask {
	sourceNo := "OUT-056"
	businessStatusKey := workflowShippingReleasedStatusKey
	return &WorkflowTask{
		ID:                1401,
		TaskGroup:         workflowReceivableRegistrationTaskGroup,
		TaskName:          "应收登记",
		SourceType:        workflowOutboundModuleKey,
		SourceID:          56,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &businessStatusKey,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      "finance",
		Priority:          3,
		Payload: map[string]any{
			"record_title":       "小熊公仔出货",
			"source_no":          "SO-2026-056",
			"customer_name":      "联调客户",
			"product_name":       "小熊公仔",
			"quantity":           600,
			"unit":               "只",
			"amount":             36000,
			"tax_rate":           "13%",
			"tax_amount":         4141.59,
			"amount_with_tax":    36000,
			"amount_without_tax": 31858.41,
			"payment_due_date":   "2026-04-30",
			"invoice_due_date":   "2026-05-02",
			"shipment_date":      "2026-04-25",
			"contract_no":        "CT-056",
		},
	}
}

func invoiceRegistrationWorkflowTask() *WorkflowTask {
	task := receivableRegistrationWorkflowTask()
	task.ID = 1501
	task.TaskGroup = workflowInvoiceRegistrationTaskGroup
	task.TaskName = "开票登记"
	task.BusinessStatusKey = ptrString(workflowReconcilingStatusKey)
	task.Payload["receivable_task_id"] = 1401
	task.Payload["receivable_result"] = "registered"
	return task
}
