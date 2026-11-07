package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

type warehouseProductionWorkRPCRepo struct {
	productionWIPJSONRPCRepo
	filter *biz.WarehouseProductionWorkFilter
}

func (r *warehouseProductionWorkRPCRepo) ListWarehouseProductionWork(_ context.Context, filter biz.WarehouseProductionWorkFilter) (*biz.WarehouseProductionWorkPage, error) {
	r.filter = &filter
	return &biz.WarehouseProductionWorkPage{Items: []*biz.WarehouseProductionWork{}, Counts: map[string]int{}}, nil
}

func TestWarehouseProductionWorkJSONRPCReadPermissionsAndStrictParams(t *testing.T) {
	for _, tc := range []struct {
		name, kind, permission string
		params                 map[string]any
		code                   int32
	}{
		{"receipt", biz.WarehouseProductionKindReceipt, biz.PermissionProductionFactRead, nil, errcode.OK.Code},
		{"return", biz.WarehouseProductionKindReturn, biz.PermissionProductionWIPRead, nil, errcode.OK.Code},
		{"receipt denied", biz.WarehouseProductionKindReceipt, biz.PermissionProductionWIPRead, nil, errcode.PermissionDenied.Code},
		{"return denied", biz.WarehouseProductionKindReturn, biz.PermissionProductionFactRead, nil, errcode.PermissionDenied.Code},
		{"unknown field", biz.WarehouseProductionKindReceipt, biz.PermissionProductionFactRead, map[string]any{"warehouse_id": 1}, errcode.InvalidParam.Code},
		{"typed stage", biz.WarehouseProductionKindReceipt, biz.PermissionProductionFactRead, map[string]any{"stage": 1}, errcode.InvalidParam.Code},
		{"limit", biz.WarehouseProductionKindReceipt, biz.PermissionProductionFactRead, map[string]any{"limit": 101}, errcode.InvalidParam.Code},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &warehouseProductionWorkRPCRepo{}
			d := newProductionWIPJSONRPCTestDispatcher(t, &repo.productionWIPJSONRPCRepo, workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, tc.permission))
			d.productionOrderUC = biz.NewProductionOrderUsecase(repo)
			d.adminManageUC = newAllWarehouseScopeAdminUsecase()
			params := map[string]any{"kind": tc.kind}
			for k, v := range tc.params {
				params[k] = v
			}
			_, result, _ := d.handleProductionWIP(workflowJSONRPCAdminContext(), "list_warehouse_production_work", "warehouse-work", mustJSONRPCStruct(t, params))
			if result.Code != tc.code {
				t.Fatalf("code=%d want=%d: %s", result.Code, tc.code, result.Message)
			}
			if tc.code != errcode.OK.Code && repo.filter != nil {
				t.Fatal("rejected request reached repository")
			}
		})
	}
}

func TestWarehousePackagingJSONRPCAssignmentStaysOnPackaging(t *testing.T) {
	for _, operation := range []string{biz.ProductionWIPOperationPackaging, biz.ProductionWIPOperationSewing} {
		t.Run(operation, func(t *testing.T) {
			aggregate := productionWIPJSONRPCAggregate()
			aggregate.Operations[0].OperationCode = operation
			repo := &productionWIPJSONRPCRepo{aggregate: aggregate}
			d := newProductionWIPJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionProductionWIPRead, biz.PermissionWarehousePackagingExecute))
			_, result, _ := d.handleProductionWIP(workflowJSONRPCAdminContext(), "execute_production_wip_action", "warehouse-pack-assign", mustJSONRPCStruct(t, map[string]any{"action": biz.ProductionWIPActionAssignExecution, "production_order_id": 1, "production_wip_batch_id": 201, "expected_version": 3, "execution_mode": biz.ProductionWIPExecutionInHouse, "idempotency_key": "warehouse-pack-assignment"}))
			if operation == biz.ProductionWIPOperationPackaging {
				if result.Code != errcode.OK.Code || repo.actionCall == nil {
					t.Fatalf("packaging assignment rejected: %d %s", result.Code, result.Message)
				}
			} else if result.Code != errcode.PermissionDenied.Code || repo.actionCall != nil {
				t.Fatalf("production assignment leaked: %d", result.Code)
			}
		})
	}
}
