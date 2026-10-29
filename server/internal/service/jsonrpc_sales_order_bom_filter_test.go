package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

func TestSalesOrderBOMTaskSourceFilterContract(t *testing.T) {
	for _, tc := range []struct {
		name   string
		params map[string]any
		valid  bool
		wantID int
	}{
		{"exact BOM", map[string]any{"bom_id": 27, "lifecycle_scope": "all"}, true, 27},
		{"ordinary list", map[string]any{}, true, 0},
		{"zero", map[string]any{"bom_id": 0}, false, 0},
		{"negative", map[string]any{"bom_id": -1}, false, 0},
		{"fraction", map[string]any{"bom_id": 1.5}, false, 0},
		{"text", map[string]any{"bom_id": "27"}, false, 0},
		{"null", map[string]any{"bom_id": nil}, false, 0},
		{"boolean", map[string]any{"bom_id": true}, false, 0},
		{"unsafe integer", map[string]any{"bom_id": 9007199254740992.0}, false, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &stubSalesOrderJSONRPCRepo{}
			admin := workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionSalesOrderRead)
			d := newSalesOrderJSONRPCTestData(t, repo, admin)
			_, result, err := d.handleSalesOrder(workflowJSONRPCAdminContext(), "list_sales_orders", "bom-sources", mustJSONRPCStruct(t, tc.params))
			if err != nil || (result.Code == errcode.OK.Code) != tc.valid || (repo.lastSalesOrderFilter.Limit > 0) != tc.valid {
				t.Fatalf("invalid BOM filter must never become an unfiltered list: result=%+v query=%+v err=%v", result, repo.lastSalesOrderFilter, err)
			}
			if tc.valid && repo.lastSalesOrderFilter.BOMID != tc.wantID {
				t.Fatalf("lost BOM filter: %+v", repo.lastSalesOrderFilter)
			}
		})
	}
}

func TestSalesOrderBOMTaskSourceReadPermissions(t *testing.T) {
	for _, mode := range []string{"no permission", "disabled", "anonymous"} {
		t.Run(mode, func(t *testing.T) {
			repo := &stubSalesOrderJSONRPCRepo{}
			admin := workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionSalesOrderRead)
			ctx := workflowJSONRPCAdminContext()
			switch mode {
			case "no permission":
				admin = workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, biz.PermissionBOMRead)
			case "disabled":
				admin.Disabled = true
			case "anonymous":
				ctx = context.Background()
			}
			d := newSalesOrderJSONRPCTestData(t, repo, admin)
			_, result, err := d.handleSalesOrder(ctx, "list_sales_orders", "bom-sources", mustJSONRPCStruct(t, map[string]any{"bom_id": 27}))
			if err != nil || result.Code == errcode.OK.Code || repo.lastSalesOrderFilter.Limit != 0 {
				t.Fatalf("unauthorized source read: result=%+v err=%v", result, err)
			}
		})
	}
}
