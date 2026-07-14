package service

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func (s *stubWorkflowJSONRPCRepo) GetWorkflowTaskBoard(_ context.Context, query biz.WorkflowTaskBoardQuery) (*biz.WorkflowTaskBoard, error) {
	return &biz.WorkflowTaskBoard{SnapshotAt: query.SnapshotAt}, nil
}

func (r *serviceWorkflowRepo) GetWorkflowTaskBoard(_ context.Context, query biz.WorkflowTaskBoardQuery) (*biz.WorkflowTaskBoard, error) {
	return &biz.WorkflowTaskBoard{SnapshotAt: query.SnapshotAt}, nil
}

type recordingWorkflowTaskBoardJSONRPCRepo struct {
	stubWorkflowJSONRPCRepo
	query  biz.WorkflowTaskBoardQuery
	result *biz.WorkflowTaskBoard
}

func (r *recordingWorkflowTaskBoardJSONRPCRepo) GetWorkflowTaskBoard(_ context.Context, query biz.WorkflowTaskBoardQuery) (*biz.WorkflowTaskBoard, error) {
	r.query = query
	if r.result != nil {
		return r.result, nil
	}
	return &biz.WorkflowTaskBoard{SnapshotAt: query.SnapshotAt}, nil
}

func TestJsonrpcDispatcher_WorkflowGetTaskBoardReturnsScopedOverview(t *testing.T) {
	snapshotAt := time.Date(2026, 7, 13, 12, 0, 0, 0, time.UTC)
	repo := &recordingWorkflowTaskBoardJSONRPCRepo{
		result: &biz.WorkflowTaskBoard{
			SnapshotAt: snapshotAt,
			Total:      478,
			Counts:     biz.WorkflowTaskBoardCounts{Actionable: 144, Exception: 110, Due: 143, Finished: 81},
			Lanes: []biz.WorkflowTaskBoardLane{
				{Key: biz.WorkflowTaskBoardLaneActionable, Total: 144, Limit: 5, Tasks: []*biz.WorkflowTask{{ID: 1, TaskStatusKey: "ready", Payload: map[string]any{}}}},
				{Key: biz.WorkflowTaskBoardLaneException, Total: 110, Limit: 5, Tasks: []*biz.WorkflowTask{{ID: 2, TaskStatusKey: "blocked", Payload: map[string]any{}}}},
				{Key: biz.WorkflowTaskBoardLaneDue, Total: 143, Limit: 5, Tasks: []*biz.WorkflowTask{{ID: 3, TaskStatusKey: "ready", Payload: map[string]any{}}}},
				{Key: biz.WorkflowTaskBoardLaneFinished, Total: 81, Limit: 5, Tasks: []*biz.WorkflowTask{{ID: 4, TaskStatusKey: "rejected", Payload: map[string]any{}}}},
			},
			SourceTypes: []string{"project-orders", "shipping-release"},
		},
	}
	dispatcher := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_task_board_test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead)},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}

	_, res, err := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(),
		"get_task_board",
		"board-overview",
		mustJSONRPCStruct(t, map[string]any{
			"keyword":        " 工程 ",
			"status":         "ready",
			"owner_role_key": biz.SalesRoleKey,
			"due":            "noDue",
			"source_type":    "project-orders",
			"limit":          float64(5),
		}),
	)
	if err != nil {
		t.Fatalf("get task board transport error: %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("get task board response=%#v", res)
	}
	if repo.query.Keyword != "工程" || repo.query.Status != "ready" || repo.query.OwnerRoleKey != biz.SalesRoleKey || repo.query.Due != "noDue" || repo.query.SourceType != "project-orders" {
		t.Fatalf("unexpected board query %#v", repo.query)
	}
	visibilityScope := repo.query.VisibilityScope
	if visibilityScope == nil || len(visibilityScope.StandaloneVisibleOwnerRoleKeys) != 1 || visibilityScope.StandaloneVisibleOwnerRoleKeys[0] != biz.SalesRoleKey {
		t.Fatalf("board must reuse visible owner role scope, got %#v", visibilityScope)
	}
	if visibilityScope.VisibleAssigneeID == nil || *visibilityScope.VisibleAssigneeID != 7 {
		t.Fatalf("board must include self-assignee scope, got %#v", visibilityScope.VisibleAssigneeID)
	}
	data := res.Data.AsMap()
	if data["snapshot_at"] != float64(snapshotAt.Unix()) || data["total"] != float64(478) {
		t.Fatalf("unexpected board summary %#v", data)
	}
	counts, ok := data["counts"].(map[string]any)
	if !ok || counts["actionable"] != float64(144) || counts["exception"] != float64(110) || counts["due"] != float64(143) || counts["finished"] != float64(81) {
		t.Fatalf("unexpected board counts %#v", data["counts"])
	}
	lanes, ok := data["lanes"].([]any)
	if !ok || len(lanes) != 4 {
		t.Fatalf("overview must return four lanes, got %#v", data["lanes"])
	}
	sourceTypes, ok := data["source_types"].([]any)
	if !ok || len(sourceTypes) != 2 || sourceTypes[0] != "project-orders" || sourceTypes[1] != "shipping-release" {
		t.Fatalf("filtered board must retain the complete scoped source facets, got %#v", data["source_types"])
	}
}

func TestJsonrpcDispatcher_WorkflowGetTaskBoardReturnsFocusedPageAndCapsLimit(t *testing.T) {
	snapshotAt := time.Date(2026, 7, 13, 12, 0, 0, 0, time.UTC)
	repo := &recordingWorkflowTaskBoardJSONRPCRepo{
		result: &biz.WorkflowTaskBoard{
			SnapshotAt: snapshotAt,
			Total:      60,
			Counts:     biz.WorkflowTaskBoardCounts{Exception: 60},
			Lanes: []biz.WorkflowTaskBoardLane{{
				Key:    biz.WorkflowTaskBoardLaneException,
				Total:  60,
				Limit:  50,
				Offset: 20,
				Tasks:  []*biz.WorkflowTask{},
			}},
		},
	}
	admin := workflowJSONRPCAdmin([]string{biz.AdminRoleKey}, biz.PermissionWorkflowTaskRead)
	admin.IsSuperAdmin = true
	dispatcher := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_task_board_test")),
		adminReader: stubAdminAccountReader{admin: admin},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}

	_, res, err := dispatcher.handleWorkflow(
		workflowJSONRPCAdminContext(),
		"get_task_board",
		"board-focused",
		mustJSONRPCStruct(t, map[string]any{
			"lane_key": biz.WorkflowTaskBoardLaneException,
			"limit":    float64(200),
			"offset":   float64(20),
		}),
	)
	if err != nil || res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("focused board response=%#v err=%v", res, err)
	}
	if repo.query.LaneKey != biz.WorkflowTaskBoardLaneException || repo.query.Limit != 50 || repo.query.Offset != 20 {
		t.Fatalf("unexpected focused board query %#v", repo.query)
	}
	if repo.query.VisibilityScope == nil || !repo.query.VisibilityScope.StandaloneAllowAllOwnerRoles || repo.query.VisibilityScope.VisibleAssigneeID != nil {
		t.Fatalf("super admin board must receive strict valid-anchor scope %#v", repo.query)
	}
	lanes, ok := res.Data.AsMap()["lanes"].([]any)
	if !ok || len(lanes) != 1 {
		t.Fatalf("focused board must return one lane, got %#v", res.Data.AsMap()["lanes"])
	}
}

func TestJsonrpcDispatcher_WorkflowGetTaskBoardRejectsInvalidContract(t *testing.T) {
	tests := []struct {
		name   string
		params map[string]any
	}{
		{name: "unknown field", params: map[string]any{"unexpected": true}},
		{name: "non string keyword", params: map[string]any{"keyword": float64(1)}},
		{name: "oversized keyword", params: map[string]any{"keyword": strings.Repeat("长", 201)}},
		{name: "invalid status", params: map[string]any{"status": "unknown"}},
		{name: "non target pending status", params: map[string]any{"status": "pending"}},
		{name: "non target processing status", params: map[string]any{"status": "processing"}},
		{name: "non target cancelled status", params: map[string]any{"status": "cancelled"}},
		{name: "non target closed status", params: map[string]any{"status": "closed"}},
		{name: "invalid owner role", params: map[string]any{"owner_role_key": "unknown"}},
		{name: "invalid due", params: map[string]any{"due": "tomorrow"}},
		{name: "invalid lane", params: map[string]any{"lane_key": "unknown"}},
		{name: "zero limit", params: map[string]any{"limit": float64(0)}},
		{name: "fractional limit", params: map[string]any{"limit": float64(1.5)}},
		{name: "negative offset", params: map[string]any{"offset": float64(-1)}},
		{name: "extreme offset", params: map[string]any{"offset": float64(2_147_483_648)}},
		{name: "string offset", params: map[string]any{"offset": "0"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &recordingWorkflowTaskBoardJSONRPCRepo{}
			dispatcher := &jsonrpcDispatcher{
				log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_task_board_test")),
				adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionWorkflowTaskRead)},
				workflowUC:  biz.NewWorkflowUsecase(repo),
			}
			_, res, err := dispatcher.handleWorkflow(workflowJSONRPCAdminContext(), "get_task_board", "invalid", mustJSONRPCStruct(t, tt.params))
			if err != nil {
				t.Fatalf("unexpected transport error: %v", err)
			}
			if res == nil || res.Code != errcode.InvalidParam.Code {
				t.Fatalf("invalid board contract must fail, got %#v", res)
			}
			if !repo.query.SnapshotAt.IsZero() {
				t.Fatalf("invalid params must not reach repo, query=%#v", repo.query)
			}
		})
	}
}

func TestJsonrpcDispatcher_WorkflowGetTaskBoardRequiresReadPermission(t *testing.T) {
	repo := &recordingWorkflowTaskBoardJSONRPCRepo{}
	dispatcher := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.workflow_task_board_test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.SalesRoleKey})},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	_, res, err := dispatcher.handleWorkflow(workflowJSONRPCAdminContext(), "get_task_board", "denied", nil)
	if err != nil {
		t.Fatalf("unexpected transport error: %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("missing workflow.task.read must be denied, got %#v", res)
	}
	if !repo.query.SnapshotAt.IsZero() {
		t.Fatalf("permission denial must not reach repo, query=%#v", repo.query)
	}
}
