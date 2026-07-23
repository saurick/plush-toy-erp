package biz

import (
	"context"
	"errors"
	"testing"
)

func TestValidatePublicWorkflowTaskNamespaceRejectsEveryTransitionMatcherIdentity(t *testing.T) {
	outsourceReconciliation := purchaseReconciliationWorkflowTask()
	outsourceReconciliation.TaskCode = "outsource-reconciliation-99"
	outsourceReconciliation.TaskGroup = workflowOutsourceReconciliationGroup
	outsourceReconciliation.SourceType = workflowProcessingContractsModuleKey
	outsourceReconciliation.SourceID = 99

	fixtures := []struct {
		key  string
		task *WorkflowTask
	}{
		{key: "purchase_iqc", task: purchaseIQCWorkflowTask()},
		{key: "purchase_warehouse_inbound", task: warehouseInboundWorkflowTask()},
		{key: "outsource_return_tracking", task: outsourceReturnTrackingWorkflowTask()},
		{key: "outsource_return_qc", task: outsourceReturnQCWorkflowTask()},
		{key: "outsource_warehouse_inbound", task: outsourceWarehouseInboundWorkflowTask()},
		{key: "outsource_rework", task: outsourceReworkWorkflowTask()},
		{key: "finished_goods_qc", task: finishedGoodsQCWorkflowTask()},
		{key: "finished_goods_inbound", task: finishedGoodsInboundWorkflowTask()},
		{key: "finished_goods_rework", task: finishedGoodsReworkWorkflowTask()},
		{key: "production_scheduling", task: productionSchedulingSourceWorkflowTask()},
		{key: "production_exception", task: productionExceptionSourceWorkflowTask()},
		{key: "shipment_release", task: shipmentReleaseWorkflowTask()},
		{key: "receivable_registration", task: receivableRegistrationWorkflowTask()},
		{key: "invoice_registration", task: invoiceRegistrationWorkflowTask()},
		{key: "payable_registration", task: purchasePayableRegistrationWorkflowTask()},
		{key: "payable_reconciliation", task: outsourceReconciliation},
	}

	if len(fixtures) != len(workflowTaskTransitionHandlers) {
		t.Fatalf("fixture count = %d, transition handler count = %d", len(fixtures), len(workflowTaskTransitionHandlers))
	}
	for _, fixture := range fixtures {
		t.Run(fixture.key, func(t *testing.T) {
			handler, err := selectWorkflowTaskTransitionHandler(fixture.task)
			if err != nil {
				t.Fatalf("select transition handler: %v", err)
			}
			if handler == nil || handler.Key != fixture.key {
				t.Fatalf("matched handler = %#v, want %q", handler, fixture.key)
			}
			if !IsReservedPublicWorkflowTransitionTaskGroup(fixture.task.TaskGroup) {
				t.Fatalf("transition-driving group %q is not reserved", fixture.task.TaskGroup)
			}

			create := workflowTaskCreateFromFixture(fixture.task)
			err = ValidatePublicWorkflowTaskNamespace(create.TaskGroup, create.TaskCode)
			if !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) {
				t.Fatalf("public namespace error = %v, want ErrWorkflowTaskSourceGeneratedOnly", err)
			}

			// A caller must not be able to reserve a transition-driving group with
			// harmless-looking mutable fields and turn it into a matcher later.
			bypass := workflowTaskCreateFromFixture(fixture.task)
			closedStatus := "closed"
			bypass.BusinessStatusKey = &closedStatus
			bypass.Payload = map[string]any{}
			err = ValidatePublicWorkflowTaskNamespace(bypass.TaskGroup, bypass.TaskCode)
			if !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) {
				t.Fatalf("mutable-field bypass error = %v, want ErrWorkflowTaskSourceGeneratedOnly", err)
			}
		})
	}
}

func TestWorkflowUsecaseCreateTaskKeepsInternalTransitionProducerOpen(t *testing.T) {
	repo := &stubWorkflowRepo{}
	uc := NewWorkflowUsecase(repo)
	create := workflowTaskCreateFromFixture(purchaseIQCWorkflowTask())
	task, err := uc.CreateTask(context.Background(), &create, 7)
	if err != nil {
		t.Fatalf("CreateTask internal transition producer: %v", err)
	}
	if task == nil || repo.createTaskInput == nil {
		t.Fatal("internal transition producer must reach the workflow repo")
	}
}

func TestWorkflowUsecaseCreateTaskKeepsOrdinaryCollaborationOpen(t *testing.T) {
	repo := &stubWorkflowRepo{}
	uc := NewWorkflowUsecase(repo)
	task, err := uc.CreateTask(context.Background(), &WorkflowTaskCreate{
		TaskCode:     "FOLLOW-UP-101",
		TaskGroup:    "customer_follow_up",
		TaskName:     "跟进客户确认",
		SourceType:   workflowProjectOrderModuleKey,
		SourceID:     101,
		OwnerRoleKey: SalesRoleKey,
		Payload:      map[string]any{"note": "普通协同记录"},
	}, 7)
	if err != nil {
		t.Fatalf("CreateTask ordinary collaboration: %v", err)
	}
	if task == nil || repo.createTaskInput == nil {
		t.Fatal("ordinary collaboration task must reach the workflow repo")
	}
}

func workflowTaskCreateFromFixture(task *WorkflowTask) WorkflowTaskCreate {
	taskCode := task.TaskCode
	if taskCode == "" {
		taskCode = "SPOOF-" + task.TaskGroup
	}
	return WorkflowTaskCreate{
		TaskCode:              taskCode,
		TaskGroup:             task.TaskGroup,
		TaskName:              task.TaskName,
		SourceType:            task.SourceType,
		SourceID:              task.SourceID,
		SourceNo:              task.SourceNo,
		BusinessStatusKey:     task.BusinessStatusKey,
		TaskStatusKey:         task.TaskStatusKey,
		OwnerRoleKey:          task.OwnerRoleKey,
		OwnerPoolKey:          task.OwnerPoolKey,
		RequiredCapabilityKey: task.RequiredCapabilityKey,
		AssigneeID:            task.AssigneeID,
		Priority:              task.Priority,
		CriticalPath:          task.CriticalPath,
		DueAt:                 task.DueAt,
		Payload:               task.Payload,
	}
}
