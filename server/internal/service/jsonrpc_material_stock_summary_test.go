package service

import (
	"context"
	"errors"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"testing"
)

type materialStockJSONRPCRepo struct {
	biz.InventoryRepo
	calls int
	fail  bool
}

func (r *materialStockJSONRPCRepo) SummarizeMaterialStockForAccess(_ context.Context, _ []int, _ biz.WarehouseDataScope) ([]biz.MaterialStockSummary, error) {
	r.calls++
	if r.fail {
		return nil, errors.New("stock unavailable")
	}
	return []biz.MaterialStockSummary{{MaterialID: 1, UnitID: 2, Quantity: decimal.RequireFromString("5.000001")}}, nil
}

func TestEngineeringMaterialStockReferenceRespectsAccessAndCanSerialize(t *testing.T) {
	for _, tc := range []struct {
		name                            string
		permission, scope, module, fail bool
		state                           string
		calls                           int
	}{
		{"available", true, true, true, false, "AVAILABLE", 1},
		{"permission denied", false, true, true, false, "FORBIDDEN", 0},
		{"warehouse scope missing", true, false, true, false, "FORBIDDEN", 0},
		{"module disabled", true, true, false, false, "DISABLED", 0},
		{"query failed", true, true, true, true, "UNAVAILABLE", 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			permissions := []string{}
			if tc.permission {
				permissions = append(permissions, biz.PermissionWarehouseInventoryRead)
			}
			d := newSalesOrderJSONRPCTestData(t, &stubSalesOrderJSONRPCRepo{}, workflowJSONRPCAdmin([]string{biz.FinanceRoleKey}, permissions...))
			if tc.scope {
				d.adminManageUC = newAllWarehouseScopeAdminUsecase()
			}
			if !tc.module {
				d.customerConfigUC = nil
			}
			repo := &materialStockJSONRPCRepo{fail: tc.fail}
			d.inventoryUC = biz.NewInventoryUsecase(repo)
			value := d.engineeringMaterialInventoryReference(workflowJSONRPCAdminContext(), map[string]any{}, &biz.EngineeringMaterialRequest{SalesOrderID: 3, Items: []*biz.EngineeringMaterialRequestItem{{MaterialID: 1, UnitID: 2}}})
			if value["status"] != tc.state || repo.calls != tc.calls {
				t.Fatalf("unexpected state/calls: %+v %d", value, repo.calls)
			}
			if newDataStruct(map[string]any{"inventory_reference": value}) == nil {
				t.Fatal("stock response failed JSON-RPC serialization")
			}
			if tc.state != "AVAILABLE" && value["items"] != nil {
				t.Fatal("unavailable inventory leaked quantities")
			}
		})
	}
}
