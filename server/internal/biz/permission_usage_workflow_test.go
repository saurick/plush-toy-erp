package biz

import "testing"

func TestWorkflowTaskUpdateUsageIncludesEveryUpdateAction(t *testing.T) {
	usage, ok := PermissionUsageFor(PermissionWorkflowTaskUpdate)
	if !ok {
		t.Fatal("workflow task update usage is missing")
	}

	wantMethods := map[string]bool{
		"block_task_action":  false,
		"resume_task_action": false,
		"urge_task":          false,
	}
	for _, surface := range usage.Surfaces {
		gotMethods := make(map[string]struct{}, len(surface.BackendMethods))
		for _, method := range surface.BackendMethods {
			if method.Domain != "workflow" {
				t.Fatalf("workflow update surface %q references unexpected domain %q", surface.ControlKey, method.Domain)
			}
			gotMethods[method.Method] = struct{}{}
		}
		if len(gotMethods) != len(wantMethods) {
			t.Fatalf("workflow update surface %q methods = %v, want block/resume/urge", surface.ControlKey, gotMethods)
		}
		for method := range wantMethods {
			if _, ok := gotMethods[method]; !ok {
				t.Errorf("workflow update surface %q is missing %q", surface.ControlKey, method)
			}
		}
	}
}

func TestWorkflowWorkbenchRoleTaskUsageRequiresBothReadPermissions(t *testing.T) {
	const method = "list_workbench_role_tasks"
	for _, permissionKey := range []string{
		PermissionERPWorkbenchRead,
		PermissionWorkflowTaskRead,
	} {
		usage, ok := PermissionUsageFor(permissionKey)
		if !ok {
			t.Fatalf("permission usage %q is missing", permissionKey)
		}
		found := false
		for _, surface := range usage.Surfaces {
			for _, backendMethod := range surface.BackendMethods {
				if backendMethod.Domain != "workflow" || backendMethod.Method != method {
					continue
				}
				if surface.PageKey != "global-dashboard" {
					t.Fatalf("%q is attached to unexpected page %q for %q", method, surface.PageKey, permissionKey)
				}
				found = true
			}
		}
		if !found {
			t.Fatalf("permission %q does not project workflow.%s", permissionKey, method)
		}
	}
}
