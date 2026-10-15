package biz

import (
	"context"
	"errors"
	"testing"
	"time"
)

type recordingWorkflowWorkbenchRepo struct {
	stubWorkflowRepo
	query WorkflowWorkbenchQuery
}

func (r *recordingWorkflowWorkbenchRepo) GetWorkflowWorkbench(_ context.Context, query WorkflowWorkbenchQuery) (*WorkflowWorkbenchPage, error) {
	r.query = query
	return &WorkflowWorkbenchPage{SnapshotAt: query.SnapshotAt, QueueKey: query.QueueKey}, nil
}

func TestWorkflowUsecaseGetWorkflowWorkbenchNormalizesBoundedRead(t *testing.T) {
	repo := &recordingWorkflowWorkbenchRepo{}
	uc := NewWorkflowUsecase(repo)
	page, err := uc.GetWorkflowWorkbench(context.Background(), WorkflowWorkbenchQuery{
		QueueKey: " actionable ",
		Limit:    500,
		Offset:   16,
		VisibilityScope: &WorkflowTaskVisibilityScope{
			StandaloneVisibleOwnerRoleKeys: []string{SalesRoleKey, SalesRoleKey},
		},
	})
	if err != nil || page == nil {
		t.Fatalf("get workflow workbench page=%#v err=%v", page, err)
	}
	if repo.query.QueueKey != WorkflowWorkbenchQueueActionable || repo.query.Limit != 50 || repo.query.Offset != 16 {
		t.Fatalf("normalized query=%#v", repo.query)
	}
	if repo.query.SnapshotAt.IsZero() || repo.query.SnapshotAt.Nanosecond() != 0 || repo.query.SnapshotAt.Location() != time.UTC {
		t.Fatalf("snapshot=%s, want whole UTC second", repo.query.SnapshotAt)
	}
	if scope := repo.query.VisibilityScope; scope == nil || len(scope.StandaloneVisibleOwnerRoleKeys) != 1 || scope.StandaloneVisibleOwnerRoleKeys[0] != SalesRoleKey {
		t.Fatalf("normalized visibility scope=%#v", scope)
	}
}

func TestWorkflowUsecaseGetWorkflowWorkbenchRejectsInvalidQueueAndOffset(t *testing.T) {
	uc := NewWorkflowUsecase(&recordingWorkflowWorkbenchRepo{})
	for _, query := range []WorkflowWorkbenchQuery{
		{QueueKey: "unknown", Limit: 8},
		{QueueKey: WorkflowWorkbenchQueueRisk, Limit: 8, Offset: -1},
	} {
		if _, err := uc.GetWorkflowWorkbench(context.Background(), query); !errors.Is(err, ErrBadParam) {
			t.Fatalf("query=%#v err=%v, want ErrBadParam", query, err)
		}
	}
}
