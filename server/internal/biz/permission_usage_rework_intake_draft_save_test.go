package biz

import "testing"

func TestReworkIntakeDraftPermissionUsageCoversCandidateAndSaveHandlers(t *testing.T) {
	tests := []struct {
		methodName     string
		permissionKeys []string
	}{
		{
			methodName: "list_rework_intake_source_candidates",
			permissionKeys: []string{
				PermissionReworkIntakeCreate,
				PermissionReworkIntakeUpdate,
				PermissionShipmentRead,
				PermissionProductionWIPRead,
			},
		},
		{
			methodName: "save_rework_intake_draft",
			permissionKeys: []string{
				PermissionReworkIntakeUpdate,
				PermissionShipmentRead,
				PermissionProductionWIPRead,
			},
		},
	}
	for _, tt := range tests {
		for _, permissionKey := range tt.permissionKeys {
			usage, ok := PermissionUsageFor(permissionKey)
			if !ok {
				t.Fatalf("permission usage missing for %s", permissionKey)
			}
			found := false
			for _, surface := range usage.Surfaces {
				for _, method := range surface.BackendMethods {
					if method.Domain == "operational_fact" && method.Method == tt.methodName {
						found = true
					}
				}
			}
			if !found {
				t.Errorf("permission %s does not describe %s", permissionKey, tt.methodName)
			}
		}
	}
}
