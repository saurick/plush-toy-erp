package biz

import (
	"context"
	"errors"
	"testing"
	"time"
)

func (s *stubWorkflowRepo) GetWorkflowTaskBoard(_ context.Context, query WorkflowTaskBoardQuery) (*WorkflowTaskBoard, error) {
	return &WorkflowTaskBoard{SnapshotAt: query.SnapshotAt}, nil
}

type recordingWorkflowTaskBoardRepo struct {
	stubWorkflowRepo
	query  WorkflowTaskBoardQuery
	result *WorkflowTaskBoard
}

func (r *recordingWorkflowTaskBoardRepo) GetWorkflowTaskBoard(_ context.Context, query WorkflowTaskBoardQuery) (*WorkflowTaskBoard, error) {
	r.query = query
	if r.result != nil {
		return r.result, nil
	}
	return &WorkflowTaskBoard{SnapshotAt: query.SnapshotAt}, nil
}

func TestClassifyWorkflowTaskBoardLaneIsMutuallyExclusive(t *testing.T) {
	snapshotAt := time.Date(2026, 7, 13, 12, 0, 0, 0, time.UTC)
	overdue := snapshotAt.Add(-time.Minute)
	dueSoon := snapshotAt.Add(WorkflowTaskBoardDueWindow)
	normalDue := dueSoon.Add(time.Second)

	tests := []struct {
		name   string
		status string
		dueAt  *time.Time
		want   string
	}{
		{name: "pending without due", status: "pending", want: WorkflowTaskBoardLaneActionable},
		{name: "ready after due window", status: "ready", dueAt: &normalDue, want: WorkflowTaskBoardLaneActionable},
		{name: "processing overdue", status: "processing", dueAt: &overdue, want: WorkflowTaskBoardLaneDue},
		{name: "ready at due boundary", status: "ready", dueAt: &dueSoon, want: WorkflowTaskBoardLaneDue},
		{name: "blocked overdue stays exception", status: "blocked", dueAt: &overdue, want: WorkflowTaskBoardLaneException},
		{name: "rejected is settled but stays exception", status: "rejected", dueAt: &overdue, want: WorkflowTaskBoardLaneException},
		{name: "done overdue stays finished", status: "done", dueAt: &overdue, want: WorkflowTaskBoardLaneFinished},
		{name: "closed", status: "closed", want: WorkflowTaskBoardLaneFinished},
		{name: "cancelled", status: "cancelled", want: WorkflowTaskBoardLaneFinished},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ClassifyWorkflowTaskBoardLane(&WorkflowTask{TaskStatusKey: tt.status, DueAt: tt.dueAt}, snapshotAt)
			if err != nil {
				t.Fatalf("classify task: %v", err)
			}
			if got != tt.want {
				t.Fatalf("lane = %q, want %q", got, tt.want)
			}
		})
	}
	if !IsTerminalWorkflowTaskStatus("rejected") {
		t.Fatal("rejected must remain a terminal workflow status")
	}
	if _, err := ClassifyWorkflowTaskBoardLane(&WorkflowTask{TaskStatusKey: "unknown"}, snapshotAt); !errors.Is(err, ErrWorkflowTaskBoardStatus) {
		t.Fatalf("unknown task status must fail closed, got %v", err)
	}
}

func TestWorkflowUsecase_GetTaskBoardNormalizesReadContract(t *testing.T) {
	repo := &recordingWorkflowTaskBoardRepo{}
	uc := NewWorkflowUsecase(repo)
	snapshotAt := time.Date(2026, 7, 13, 12, 0, 0, 456, time.FixedZone("CST", 8*60*60))

	if _, err := uc.GetTaskBoard(context.Background(), WorkflowTaskBoardQuery{
		Keyword:              "  工程任务  ",
		Status:               "",
		OwnerRoleKey:         " SALES ",
		Due:                  "",
		SourceType:           "all",
		LaneKey:              "all",
		Limit:                200,
		Offset:               -1,
		VisibleOwnerRoleKeys: []string{" sales ", "sales"},
		SnapshotAt:           snapshotAt,
	}); err != nil {
		t.Fatalf("get task board: %v", err)
	}
	got := repo.query
	if got.Keyword != "工程任务" || got.Status != "all" || got.OwnerRoleKey != SalesRoleKey || got.Due != "all" || got.SourceType != "" || got.LaneKey != "" {
		t.Fatalf("unexpected normalized query %#v", got)
	}
	if got.Limit != 50 || got.Offset != 0 {
		t.Fatalf("unexpected pagination limit=%d offset=%d", got.Limit, got.Offset)
	}
	if len(got.VisibleOwnerRoleKeys) != 1 || got.VisibleOwnerRoleKeys[0] != SalesRoleKey {
		t.Fatalf("unexpected visibility roles %#v", got.VisibleOwnerRoleKeys)
	}
	if got.SnapshotAt.Nanosecond() != 0 || got.SnapshotAt.Location() != time.UTC {
		t.Fatalf("snapshot must be normalized to UTC unix seconds, got %v", got.SnapshotAt)
	}

	for _, query := range []WorkflowTaskBoardQuery{
		{Status: "unknown"},
		{Due: "tomorrow"},
		{LaneKey: "unknown"},
	} {
		if _, err := uc.GetTaskBoard(context.Background(), query); !errors.Is(err, ErrBadParam) {
			t.Fatalf("invalid board query %#v must fail, got %v", query, err)
		}
	}
}
