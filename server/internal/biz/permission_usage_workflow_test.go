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
