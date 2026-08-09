package biz

import "testing"

func TestProductionAndOutsourcingDraftSavePermissionUsageCoversHandlerContracts(t *testing.T) {
	tests := []struct {
		method      string
		permissions []string
	}{
		{"save_production_material_issue_draft", []string{PermissionProductionMaterialIssueCreate, PermissionPMCPlanRead}},
		{"save_production_completion_draft", []string{PermissionProductionCompletionCreate, PermissionPMCPlanRead}},
		{"save_production_rework_from_completion_draft", []string{PermissionProductionReworkCreate, PermissionProductionFactRead, PermissionPMCPlanRead}},
		{"save_production_rework_from_intake_draft", []string{PermissionProductionReworkCreate, PermissionReworkIntakeRead, PermissionPMCPlanRead}},
		{"save_outsourcing_material_issue_draft", []string{PermissionOutsourcingMaterialIssueCreate, PermissionOutsourcingOrderRead}},
		{"save_outsourcing_return_receipt_draft", []string{PermissionOutsourcingReturnReceiptCreate, PermissionOutsourcingOrderRead}},
	}
	for _, tt := range tests {
		for _, permission := range tt.permissions {
			usage, ok := PermissionUsageFor(permission)
			if !ok {
				t.Fatalf("permission usage missing for %s", permission)
			}
			found := false
			for _, surface := range usage.Surfaces {
				for _, method := range surface.BackendMethods {
					found = found || (method.Domain == "operational_fact" && method.Method == tt.method)
				}
			}
			if !found {
				t.Errorf("permission %s does not describe %s", permission, tt.method)
			}
		}
	}
}
