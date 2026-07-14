package biz

import "testing"

func TestWorkflowTaskStatusAvailabilityContract(t *testing.T) {
	wantKnown := []string{"ready", "blocked", "done", "rejected"}
	states := WorkflowTaskStates()
	if len(states) != len(wantKnown) {
		t.Fatalf("workflow task status registry has %d keys, want %d", len(states), len(wantKnown))
	}

	seen := make(map[string]struct{}, len(wantKnown))
	for index, state := range states {
		if state.Key != wantKnown[index] {
			t.Errorf("workflow task status at index %d = %q, want %q", index, state.Key, wantKnown[index])
		}
		if _, duplicate := seen[state.Key]; duplicate {
			t.Fatalf("workflow task status %q is registered more than once", state.Key)
		}
		seen[state.Key] = struct{}{}
		if !IsKnownWorkflowTaskState(state.Key) {
			t.Errorf("target workflow task status %q must be known", state.Key)
		}
		if got, want := IsCreatableWorkflowTaskState(state.Key), state.Key == "ready"; got != want {
			t.Errorf("IsCreatableWorkflowTaskState(%q) = %v, want %v", state.Key, got, want)
		}
	}

	for _, status := range []string{"pending", "processing", "cancelled", "closed", "unknown", ""} {
		if IsKnownWorkflowTaskState(status) || IsCreatableWorkflowTaskState(status) {
			t.Errorf("non-target workflow task status %q must fail closed", status)
		}
	}

	wantTerminal := []string{"done", "rejected"}
	gotTerminal := WorkflowTerminalTaskStatusKeys()
	if len(gotTerminal) != len(wantTerminal) {
		t.Fatalf("terminal workflow task status registry has %d keys, want %d", len(gotTerminal), len(wantTerminal))
	}
	for index, status := range wantTerminal {
		if gotTerminal[index] != status {
			t.Errorf("terminal workflow task status at index %d = %q, want %q", index, gotTerminal[index], status)
		}
		if !IsTerminalWorkflowTaskStatus(status) {
			t.Errorf("workflow task status %q must be terminal", status)
		}
	}
	for _, status := range []string{"ready", "blocked", "pending", "processing", "cancelled", "closed", "unknown"} {
		if IsTerminalWorkflowTaskStatus(status) {
			t.Errorf("non-terminal or non-target workflow task status %q must not be terminal", status)
		}
	}
}

func TestWorkflowTaskTransitionContractIsTargetOnly(t *testing.T) {
	allowed := map[string]map[string]struct{}{
		"ready": {
			"blocked":  {},
			"done":     {},
			"rejected": {},
		},
		"blocked": {
			"ready": {},
		},
	}
	statuses := []string{
		"ready", "blocked", "done", "rejected",
		"pending", "processing", "cancelled", "closed",
		"unknown", "",
	}
	for _, from := range statuses {
		for _, to := range statuses {
			_, want := allowed[from][to]
			if got := CanTransitionWorkflowTaskStatus(from, to); got != want {
				t.Errorf("CanTransitionWorkflowTaskStatus(%q, %q) = %v, want %v", from, to, got, want)
			}
		}
	}
}

func TestWorkflowTaskBreakGlassCannotBypassTransitionContract(t *testing.T) {
	admin := &AdminUser{ID: 7, IsSuperAdmin: true}
	assigneeID := admin.ID
	for _, status := range []string{"pending", "blocked", "done", "rejected", "cancelled", "closed"} {
		task := &WorkflowTask{TaskStatusKey: status, AssigneeID: &assigneeID}
		if CanAdminHandleWorkflowTask(admin, task, "done") {
			t.Errorf("break-glass admin must not complete task from %q", status)
		}
	}

	task := &WorkflowTask{TaskStatusKey: "ready", AssigneeID: &assigneeID}
	if !CanAdminHandleWorkflowTask(admin, task, "done") {
		t.Fatal("assigned break-glass admin should still use the normal ready to done transition")
	}
}

func TestWorkflowTaskUrgeContractIsTargetOnly(t *testing.T) {
	admin := &AdminUser{ID: 7, IsSuperAdmin: true}
	assigneeID := admin.ID
	for _, status := range []string{"ready", "blocked"} {
		task := &WorkflowTask{TaskStatusKey: status, AssigneeID: &assigneeID}
		if !CanAdminUrgeWorkflowTask(admin, task) {
			t.Errorf("assigned admin should be allowed to urge task from %q", status)
		}
	}
	for _, status := range []string{"done", "rejected", "pending", "processing", "cancelled", "closed", "unknown", ""} {
		task := &WorkflowTask{TaskStatusKey: status, AssigneeID: &assigneeID}
		if CanAdminUrgeWorkflowTask(admin, task) {
			t.Errorf("admin must not urge task from terminal or non-target status %q", status)
		}
	}
}
