package service

import (
	"testing"
	"time"
)

func TestWorkflowRoleTaskCursorBindsOrderingAndStatus(t *testing.T) {
	anchor := time.Date(2026, 9, 1, 9, 0, 0, 123456000, time.UTC)
	cursor := encodeWorkflowRoleTaskViewCursor(workflowRoleTaskViewCursor{
		Method: "list_role_tasks", ViewKey: "todo", RoleKey: "sales", Keyword: "SO-1",
		SortKey: "due", StatusKey: "blocked", BeforeTime: &anchor, BeforeID: 17,
		SnapshotUnix: anchor.Unix(), ExpectedTotal: 4, SeenTotal: 2, RiskScope: "role",
	})
	params := map[string]any{"view_key": "todo", "role_key": "sales", "keyword": "SO-1", "sort_key": "due", "status_key": "blocked", "cursor": cursor}
	request, res := parseWorkflowRoleTaskViewRequest(params, "list_role_tasks")
	if res != nil || request.BeforeTime == nil || !request.BeforeTime.Equal(anchor) || request.BeforeID != 17 {
		t.Fatalf("cursor lost timestamp precision or query: %#v, %#v", request, res)
	}
	for _, key := range []string{"sort_key", "status_key"} {
		saved := params[key]
		delete(params, key)
		if _, res := parseWorkflowRoleTaskViewRequest(params, "list_role_tasks"); res == nil {
			t.Fatalf("cursor reused after clearing %s", key)
		}
		params[key] = saved
	}
	params["sort_key"] = "oldest"
	if _, res := parseWorkflowRoleTaskViewRequest(params, "list_role_tasks"); res == nil {
		t.Fatal("cursor reused across sort order")
	}
}

func TestWorkflowRoleTaskRejectsInvalidListOptions(t *testing.T) {
	for _, options := range []map[string]any{
		{"sort_key": "updated_at"}, {"sort_key": ""}, {"sort_key": 1},
		{"status_key": "done"}, {"status_key": " blocked "}, {"status_key": true},
		{"view_key": "history", "status_key": "blocked"},
	} {
		params := map[string]any{"view_key": "todo", "role_key": "sales"}
		for key, value := range options {
			params[key] = value
		}
		if _, res := parseWorkflowRoleTaskViewRequest(params, "list_role_tasks"); res == nil {
			t.Fatalf("accepted invalid options: %#v", options)
		}
	}
}
