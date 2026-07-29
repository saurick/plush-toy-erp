package biz

import "testing"

func TestApprovalSettingsApplyUsageRequiresPublishAndActivatePermissions(
	t *testing.T,
) {
	const method = "apply_approval_settings"
	for _, permissionKey := range []string{
		PermissionCustomerConfigPublish,
		PermissionCustomerConfigActivate,
	} {
		usage, ok := PermissionUsageFor(permissionKey)
		if !ok {
			t.Fatalf("permission usage %q is missing", permissionKey)
		}
		found := false
		for _, surface := range usage.Surfaces {
			for _, backendMethod := range surface.BackendMethods {
				if backendMethod.Domain == "customer_config" &&
					backendMethod.Method == method {
					found = true
				}
			}
		}
		if !found {
			t.Fatalf(
				"permission %q does not project customer_config.%s",
				permissionKey,
				method,
			)
		}
	}
}
