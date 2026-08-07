package biz

import (
	"reflect"
	"testing"
)

func TestWorkflowApprovalCapabilityKeysReturnsCompleteCopy(t *testing.T) {
	want := []string{
		PermissionWorkflowTaskApprove,
		PermissionFinancePaymentApprove,
		PermissionWarehouseAdjustmentApprove,
		PermissionProductionExceptionApprove,
	}
	got := WorkflowApprovalCapabilityKeys()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("approval capabilities=%v want=%v", got, want)
	}
	got[0] = "mutated"
	if next := WorkflowApprovalCapabilityKeys(); !reflect.DeepEqual(next, want) {
		t.Fatalf("approval capability registry must return a copy, got=%v", next)
	}
	for _, capabilityKey := range want {
		if !IsWorkflowApprovalCapabilityKey(capabilityKey) {
			t.Fatalf("registered approval capability %q was rejected", capabilityKey)
		}
	}
	if IsWorkflowApprovalCapabilityKey("workflow.task.complete") {
		t.Fatal("ordinary workflow completion must not enter the approval registry")
	}
}
