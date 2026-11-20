package biz

import (
	"context"
	"errors"
	"testing"
)

func TestNormalizeProcessLinkedWorkflowTaskCreateRejectsReservedSourceTaskNamespace(t *testing.T) {
	inputs := []ProcessLinkedWorkflowTaskCreate{
		{
			ProcessInstanceID:     10,
			ProcessNodeInstanceID: 20,
			ExpectedVersion:       1,
			TaskGroup:             WorkflowSourceTaskProductionSchedulingGroup,
		},
		{
			ProcessInstanceID:     10,
			ProcessNodeInstanceID: 20,
			ExpectedVersion:       1,
			TaskCode:              WorkflowSourceTaskCode(WorkflowSourceTaskProductionExceptionGroup, 31),
		},
	}
	for _, input := range inputs {
		if _, err := normalizeProcessLinkedWorkflowTaskCreate(input); !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) {
			t.Fatalf("normalize error = %v, want ErrWorkflowTaskSourceGeneratedOnly", err)
		}
	}
}

func TestProcessRuntimeCreateLinkedWorkflowTaskRejectsReservedNodeKeyFallback(t *testing.T) {
	processRepo := &memProcessRuntimeRepo{
		process: &ProcessInstance{
			ID:              10,
			ConfigRevision:  "yoyoosun-rev-1",
			BusinessRefType: "shipment",
			BusinessRefID:   23,
		},
		node: &ProcessNodeInstance{
			ID:                20,
			ProcessInstanceID: 10,
			NodeKey:           WorkflowSourceTaskShipmentReleaseGroup,
			NodeType:          ProcessNodeTypeHumanTask,
			Attempt:           1,
			Status:            ProcessNodeStatusActive,
			Version:           1,
		},
	}
	workflowRepo := &stubWorkflowRepo{}
	uc := NewProcessRuntimeUsecase(processRepo, workflowRepo)

	_, err := uc.CreateLinkedWorkflowTask(context.Background(), &ProcessLinkedWorkflowTaskCreate{
		ProcessInstanceID:     10,
		ProcessNodeInstanceID: 20,
		ExpectedVersion:       1,
		OwnerRoleKey:          WarehouseRoleKey,
	}, 7)
	if !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) {
		t.Fatalf("CreateLinkedWorkflowTask error = %v, want ErrWorkflowTaskSourceGeneratedOnly", err)
	}
	if workflowRepo.createTaskInput != nil {
		t.Fatal("reserved node-key fallback must not create a workflow task")
	}
}
