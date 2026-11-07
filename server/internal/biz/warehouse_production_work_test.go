package biz

import (
	"testing"
)

func TestWarehouseProductionWorkFilterBoundaries(t *testing.T) {
	valid, err := NormalizeWarehouseProductionWorkFilter(WarehouseProductionWorkFilter{Kind: WarehouseProductionKindReceipt})
	if err != nil || valid.Limit != 20 {
		t.Fatalf("default page: %#v %v", valid, err)
	}
	for _, filter := range []WarehouseProductionWorkFilter{
		{Kind: "UNKNOWN"}, {Kind: WarehouseProductionKindReturn, Stage: WarehouseProductionStageInbound},
		{Kind: WarehouseProductionKindReceipt, Stage: WarehouseProductionStageReturn},
		{Kind: WarehouseProductionKindReceipt, Limit: 101}, {Kind: WarehouseProductionKindReturn, Offset: -1},
	} {
		if _, err := NormalizeWarehouseProductionWorkFilter(filter); err == nil {
			t.Fatalf("accepted invalid filter %#v", filter)
		}
	}
}

func TestWarehousePackagingAssignmentDoesNotGrantProductionAssignment(t *testing.T) {
	aggregate := &ProductionWIPAggregate{Batches: []*ProductionWIPBatch{{ID: 1, ProductionOrderOperationID: 11}, {ID: 2, ProductionOrderOperationID: 12}}, Operations: []*ProductionOrderOperation{{ID: 11, OperationCode: ProductionWIPOperationPackaging}, {ID: 12, OperationCode: ProductionWIPOperationSewing}}}
	for _, test := range []struct {
		action string
		batch  int
		want   string
	}{
		{ProductionWIPActionAssignExecution, 1, PermissionWarehousePackagingExecute},
		{ProductionWIPActionAssignExecution, 2, PermissionProductionWIPAssign},
		{ProductionWIPActionSplitBatch, 1, PermissionProductionWIPAssign},
		{ProductionWIPActionCancelBatch, 1, PermissionProductionWIPAssign},
	} {
		got := ProductionWIPActionPermission(&ProductionWIPAction{Action: test.action, BatchID: test.batch}, aggregate, PermissionProductionWIPAssign)
		if got != test.want {
			t.Fatalf("%s batch %d: %s want %s", test.action, test.batch, got, test.want)
		}
	}
}
