package biz

import "testing"

func TestEffectiveWarehouseDataScopeFailClosedAndUnionsRoles(t *testing.T) {
	tests := []struct {
		name       string
		superAdmin bool
		scopes     []RoleDataScope
		wantMode   string
		wantIDs    []int
	}{
		{name: "missing", wantMode: DataScopeModeNone, wantIDs: []int{}},
		{name: "empty assigned", scopes: []RoleDataScope{{ResourceType: DataScopeResourceWarehouse, Mode: DataScopeModeAssigned}}, wantMode: DataScopeModeNone, wantIDs: []int{}},
		{name: "assigned union", scopes: []RoleDataScope{{ResourceType: DataScopeResourceWarehouse, Mode: DataScopeModeAssigned, ResourceIDs: []int{3, 1}}, {ResourceType: DataScopeResourceWarehouse, Mode: DataScopeModeAssigned, ResourceIDs: []int{2, 3}}}, wantMode: DataScopeModeAssigned, wantIDs: []int{1, 2, 3}},
		{name: "all wins", scopes: []RoleDataScope{{ResourceType: DataScopeResourceWarehouse, Mode: DataScopeModeAssigned, ResourceIDs: []int{1}}, {ResourceType: DataScopeResourceWarehouse, Mode: DataScopeModeAll}}, wantMode: DataScopeModeAll, wantIDs: []int{}},
		{name: "super admin", superAdmin: true, wantMode: DataScopeModeAll, wantIDs: []int{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := EffectiveWarehouseDataScope(tt.superAdmin, tt.scopes)
			if got.Mode != tt.wantMode || len(got.WarehouseIDs) != len(tt.wantIDs) {
				t.Fatalf("scope=%#v want mode=%s ids=%v", got, tt.wantMode, tt.wantIDs)
			}
			for index := range tt.wantIDs {
				if got.WarehouseIDs[index] != tt.wantIDs[index] {
					t.Fatalf("scope ids=%v want=%v", got.WarehouseIDs, tt.wantIDs)
				}
			}
		})
	}
}

func TestWarehouseDataScopeAllows(t *testing.T) {
	assigned := WarehouseDataScope{Mode: DataScopeModeAssigned, WarehouseIDs: []int{1, 3}}
	if !assigned.Allows(3) || assigned.Allows(2) || assigned.Allows(0) {
		t.Fatalf("assigned scope did not enforce exact warehouse ids")
	}
	if !(WarehouseDataScope{Mode: DataScopeModeAll}).Allows(999) {
		t.Fatalf("ALL scope must allow positive warehouse ids")
	}
	if (WarehouseDataScope{}).Allows(1) {
		t.Fatalf("missing scope must fail closed")
	}
}
