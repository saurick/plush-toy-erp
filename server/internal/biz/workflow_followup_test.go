package biz

import (
	"errors"
	"testing"
	"time"
)

func TestWorkflowFollowupInputAndNamespace(t *testing.T) {
	input := WorkflowFollowupCreate{SourceType: "sales_order", SourceID: 9, TaskName: "补齐资料", Description: "请提供包装尺寸", OwnerRoleKey: SalesRoleKey, DueAt: time.Now().Add(time.Hour), IdempotencyKey: "followup-test"}
	task, err := PrepareWorkflowFollowupCreate(input, 7)
	if err != nil {
		t.Fatal(err)
	}
	if task.RequiredCapabilityKey == nil || *task.RequiredCapabilityKey != PermissionWorkflowTaskComplete || task.ConfigRevision != nil || task.ProcessInstanceID != nil || task.TaskStatusKey != "ready" {
		t.Fatalf("ordinary task contract=%#v", task)
	}
	if !errors.Is(ValidatePublicWorkflowTaskNamespace(task.TaskGroup, task.TaskCode), ErrWorkflowTaskSourceGeneratedOnly) || !errors.Is(ValidatePublicWorkflowTaskNamespace("custom", task.TaskCode), ErrWorkflowTaskSourceGeneratedOnly) {
		t.Fatal("raw creation can occupy followup identity")
	}
	for _, mutate := range []func(*WorkflowFollowupCreate){
		func(in *WorkflowFollowupCreate) { in.IdempotencyKey = " " },
		func(in *WorkflowFollowupCreate) { in.SourceType = "inventory_txn" },
		func(in *WorkflowFollowupCreate) { in.Description = " " },
		func(in *WorkflowFollowupCreate) { in.Priority = 1 },
	} {
		invalid := input
		mutate(&invalid)
		if _, err := PrepareWorkflowFollowupCreate(invalid, 7); !errors.Is(err, ErrBadParam) {
			t.Fatalf("invalid input accepted: %#v err=%v", invalid, err)
		}
	}
	for _, sourceType := range []string{"sales_order", "purchase_order", "outsourcing_order", "production_order", "shipment"} {
		spec, ok := WorkflowFollowupSourceSpecFor(sourceType)
		if !ok || spec.CanCreate("closed") || spec.CanCreate("CANCELLED") || spec.CanCreate("unknown") {
			t.Fatalf("unsafe source contract: %s", sourceType)
		}
	}
}
