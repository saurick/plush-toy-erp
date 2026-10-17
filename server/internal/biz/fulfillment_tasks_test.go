package biz

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestFulfillmentTasksAreSourceOwned(t *testing.T) {
	for kind := range fulfillmentTaskSpecs {
		group := "handoff_" + kind
		for _, status := range []string{"done", "rejected", "blocked", "ready"} {
			repo := &stubWorkflowRepo{currentTask: &WorkflowTask{ID: 1, Version: 1, TaskGroup: group, TaskStatusKey: "ready", OwnerRoleKey: WarehouseRoleKey}}
			_, err := updateWorkflowTaskStatusForTest(t, NewWorkflowUsecase(repo), context.Background(), &WorkflowTaskStatusUpdate{ID: 1, TaskStatusKey: status, Reason: "核对来源单据"}, 22, WarehouseRoleKey)
			if !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) || repo.updateTaskInput != nil {
				t.Fatalf("workflow changed %s without a source action: %v", group, err)
			}
		}
		if err := ValidatePublicWorkflowTaskNamespace(group, "manual"); !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) {
			t.Fatal(err)
		}
		if err := ValidatePublicWorkflowTaskNamespace("manual", WorkflowSourceTaskCode(group, 3)); !errors.Is(err, ErrWorkflowTaskSourceGeneratedOnly) {
			t.Fatal(err)
		}
	}
}

func TestFulfillmentTaskAccessFailsClosed(t *testing.T) {
	input, err := BuildFulfillmentTask("receipt_inbound", 7, "PR-TEST", "")
	if err != nil {
		t.Fatal(err)
	}
	task := &WorkflowTask{TaskGroup: input.TaskGroup, TaskCode: input.TaskCode, SourceID: input.SourceID, SourceType: input.SourceType, OwnerRoleKey: input.OwnerRoleKey, RequiredCapabilityKey: input.RequiredCapabilityKey, Payload: input.Payload}
	if access := ResolveWorkflowTaskSourceAccessContract(task); !access.Applicable || access.Resolved {
		t.Fatal("unsigned source task was accepted")
	}
	task.Payload["source_task_intent_hash"] = strings.Repeat("a", 64)
	if access := ResolveWorkflowTaskSourceAccessContract(task); !access.Resolved || len(access.RequiredAll) != 1 || access.RequiredAll[0] != PermissionPurchaseReceiptRead {
		t.Fatalf("source access: %+v", access)
	}
	task.OwnerRoleKey = PurchaseRoleKey
	if ResolveWorkflowTaskSourceAccessContract(task).Resolved {
		t.Fatal("altered owner was accepted")
	}
}

func TestFulfillmentDefaultResponsibilities(t *testing.T) {
	warehouse := builtinRolePermissionSet(t, WarehouseRoleKey)
	assertPermissionSetContains(t, warehouse, PermissionPurchaseReceiptCreate, PermissionWarehouseInboundConfirm, PermissionOutsourcingOrderRead, PermissionOutsourcingMaterialIssueCreate, PermissionOutsourcingReturnReceiptCreate)
	assertPermissionSetOmits(t, builtinRolePermissionSet(t, PurchaseRoleKey), PermissionPurchaseReceiptCreate)
	assertPermissionSetOmits(t, builtinRolePermissionSet(t, ProductionRoleKey), PermissionOutsourcingOrderUpdate, PermissionOutsourcingOrderConfirm, PermissionOutsourcingFactPost, PermissionOutsourcingReturnReceiptCreate)
	assertPermissionSetContains(t, builtinRolePermissionSet(t, PurchaseRoleKey), PermissionOutsourcingOrderUpdate, PermissionOutsourcingOrderConfirm)
	assertPermissionSetContains(t, builtinRolePermissionSet(t, QualityRoleKey), PermissionQualityInspectionCreate, PermissionOutsourcingFactRead, PermissionOutsourcingOrderRead)
}

func TestOutsourcingQualityRequestRequiresItsActualReturnSource(t *testing.T) {
	in, err := BuildFulfillmentTask("outsourcing_quality_request", 71, "OUT-RETURN-71", "/erp/purchase/processing-contracts?outsourcing_order_id=51&outsourcing_fact_id=71")
	if err != nil {
		t.Fatal(err)
	}
	task := &WorkflowTask{TaskGroup: in.TaskGroup, TaskCode: in.TaskCode, SourceID: in.SourceID, SourceType: in.SourceType, OwnerRoleKey: in.OwnerRoleKey, RequiredCapabilityKey: in.RequiredCapabilityKey, Payload: in.Payload}
	task.Payload["source_task_intent_hash"] = strings.Repeat("a", 64)
	access := ResolveWorkflowTaskSourceAccessContract(task)
	if task.OwnerRoleKey != QualityRoleKey || *task.RequiredCapabilityKey != PermissionQualityInspectionCreate || !access.Applicable || !access.Resolved || len(access.RequiredAll) != 1 || access.RequiredAll[0] != PermissionOutsourcingFactRead {
		t.Fatalf("quality preparation must retain the actual return read boundary: task=%#v access=%#v", task, access)
	}
	task.SourceType = "quality_inspection"
	if ResolveWorkflowTaskSourceAccessContract(task).Resolved {
		t.Fatal("a request task must not substitute an inspection that does not yet exist")
	}
}
