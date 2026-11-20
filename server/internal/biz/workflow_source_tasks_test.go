package biz

import (
	"testing"
	"time"
)

func TestBuildProductionSchedulingSourceTaskUsesReleasedOrderAsTruth(t *testing.T) {
	productName := "小熊公仔"
	plannedStart := time.Date(2026, 7, 21, 1, 0, 0, 0, time.UTC)
	task, state, err := BuildProductionSchedulingSourceTask(&ProductionOrderAggregate{
		Order: &ProductionOrder{
			ID:             41,
			OrderNo:        "PO-202607-041",
			Status:         ProductionOrderStatusReleased,
			PlannedStartAt: &plannedStart,
		},
		Items:                     []*ProductionOrderItem{{ID: 411, ProductNameSnapshot: &productName}},
		MaterialRequirementsState: ProductionOrderMaterialRequirementsReady,
	})
	if err != nil {
		t.Fatalf("BuildProductionSchedulingSourceTask() error = %v", err)
	}
	if task.TaskCode != "source-production-scheduling-41" || task.TaskGroup != WorkflowSourceTaskProductionSchedulingGroup {
		t.Fatalf("unexpected scheduling task %#v", task)
	}
	if task.SourceType != WorkflowSourceTaskProductionOrderSourceType || task.SourceID != 41 || task.OwnerRoleKey != PMCRoleKey {
		t.Fatalf("unexpected scheduling lineage %#v", task)
	}
	if task.Payload["source_task_contract"] != WorkflowSourceTaskContractV1 ||
		task.Payload["source_task_producer"] != WorkflowSourceTaskProductionOrderReleaseProducer ||
		task.Payload["notification_type"] != "task_created" ||
		task.Payload["alert_type"] != "production_scheduling_pending" {
		t.Fatalf("unexpected scheduling source contract %#v", task.Payload)
	}
	if state == nil || state.BusinessStatusKey != workflowProductionReadyStatusKey {
		t.Fatalf("unexpected scheduling business state %#v", state)
	}
}

func TestBuildProductionExceptionSourceTaskKeepsReworkReasonAsSnapshot(t *testing.T) {
	task, state, err := BuildProductionExceptionSourceTask(ProductionExceptionSourceTaskInput{
		FactID:                 52,
		FactNo:                 "RW-202607-052",
		SourceCompletionFactID: 51,
		ProductionOrderID:      41,
		ProductionOrderNo:      "PO-202607-041",
		ProductionOrderItemID:  411,
		ProductName:            "小熊公仔",
		UnitName:               "只",
		Quantity:               "12",
		Reason:                 "车缝开线，返工复检",
		OccurredAt:             time.Date(2026, 7, 22, 2, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("BuildProductionExceptionSourceTask() error = %v", err)
	}
	if task.TaskCode != "source-production-exception-52" || task.SourceID != 52 || task.OwnerRoleKey != ProductionRoleKey {
		t.Fatalf("unexpected exception task %#v", task)
	}
	if task.Payload["handling_note"] != "车缝开线，返工复检" ||
		task.Payload["source_task_producer"] != WorkflowSourceTaskProductionReworkPostProducer ||
		task.Payload["notification_type"] != "task_created" ||
		task.Payload["alert_type"] != "rework_pending" {
		t.Fatalf("unexpected exception source snapshot %#v", task.Payload)
	}
	if state == nil || state.BlockedReason == nil || *state.BlockedReason != "车缝开线，返工复检" {
		t.Fatalf("unexpected exception business state %#v", state)
	}
}

func TestBuildShipmentReleaseSourceTaskDoesNotClaimShipmentPosted(t *testing.T) {
	plannedShip := time.Date(2026, 7, 23, 3, 0, 0, 0, time.UTC)
	task, state, err := BuildShipmentReleaseSourceTask(&Shipment{
		ID:            63,
		ShipmentNo:    "SHIP-202607-063",
		Status:        ShipmentStatusDraft,
		PlannedShipAt: &plannedShip,
		Items:         []*ShipmentItem{{ID: 631, ProductID: 9}},
	})
	if err != nil {
		t.Fatalf("BuildShipmentReleaseSourceTask() error = %v", err)
	}
	if !IsTrustedShipmentReleaseSourceTask(&WorkflowTask{
		TaskCode:   task.TaskCode,
		TaskGroup:  task.TaskGroup,
		SourceType: task.SourceType,
		SourceID:   task.SourceID,
		Payload:    task.Payload,
	}) {
		t.Fatalf("shipment task should satisfy trusted source contract %#v", task)
	}
	if task.Payload["shipment_execution_required"] != true || task.Payload["inventory_out_deferred"] != true ||
		task.Payload["notification_type"] != "task_created" || task.Payload["alert_type"] != "shipment_pending" {
		t.Fatalf("shipment release must defer fact execution %#v", task.Payload)
	}
	if state == nil || state.BusinessStatusKey != workflowShipmentPendingStatusKey {
		t.Fatalf("unexpected shipment business state %#v", state)
	}
}
