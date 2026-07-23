package biz

import (
	"context"
	"errors"
	"testing"
)

type workflowAssignmentUsecaseRepo struct {
	*stubWorkflowRepo
	input *WorkflowTaskAssignment
}

func (r *workflowAssignmentUsecaseRepo) ReassignWorkflowTask(
	_ context.Context,
	in *WorkflowTaskAssignment,
	_ int,
	_ string,
) (*WorkflowTask, error) {
	r.input = in
	current := *r.currentTask
	current.AssigneeID = in.TargetAssigneeID
	current.Version = in.ExpectedVersion + 1
	return &current, nil
}

type workflowAssignmentReplayRepo struct {
	*workflowAssignmentUsecaseRepo
	replay *WorkflowTask
}

func (r *workflowAssignmentReplayRepo) ResolveWorkflowTaskMutation(
	context.Context,
	int,
	string,
	string,
	string,
	int,
) (*WorkflowTask, bool, error) {
	return r.replay, true, nil
}

func TestWorkflowUsecase_ReassignTaskPreservesTaskState(t *testing.T) {
	for _, statusKey := range []string{"ready", "blocked"} {
		t.Run(statusKey, func(t *testing.T) {
			targetID := 42
			current := &WorkflowTask{
				ID:            9,
				TaskCode:      "ASSIGN-9",
				TaskGroup:     "quality",
				TaskName:      "复核任务",
				SourceType:    "quality_inspection",
				SourceID:      18,
				TaskStatusKey: statusKey,
				OwnerRoleKey:  QualityRoleKey,
				Payload:       map[string]any{"evidence": "kept"},
				Version:       3,
			}
			repo := &workflowAssignmentUsecaseRepo{
				stubWorkflowRepo: &stubWorkflowRepo{currentTask: current},
			}
			uc := NewWorkflowUsecase(repo)
			updated, err := uc.ReassignTask(context.Background(), &WorkflowTaskAssignment{
				ID:                     current.ID,
				ExpectedVersion:        current.Version,
				CommandKey:             "reassign_task",
				IdempotencyKey:         "assignment-usecase-" + statusKey,
				TargetAssigneeID:       &targetID,
				Reason:                 "原处理人请假",
				RequiredOwnerRoleKey:   QualityRoleKey,
				RequiredPermissionKeys: []string{PermissionWorkflowTaskRead, PermissionWorkflowTaskComplete},
			}, 7, BossRoleKey)
			if err != nil {
				t.Fatalf("ReassignTask() error = %v", err)
			}
			if updated.AssigneeID == nil || *updated.AssigneeID != targetID {
				t.Fatalf("assignee = %#v, want %d", updated.AssigneeID, targetID)
			}
			if updated.TaskStatusKey != statusKey ||
				updated.OwnerRoleKey != current.OwnerRoleKey ||
				updated.Payload["evidence"] != "kept" ||
				updated.Version != current.Version+1 {
				t.Fatalf("reassignment changed task semantics: %#v", updated)
			}
			if repo.input == nil || repo.input.IntentHash == "" {
				t.Fatal("repository must receive a prepared assignment intent")
			}
		})
	}
}

func TestWorkflowUsecase_ReassignTaskRejectsTerminalAndNoop(t *testing.T) {
	targetID := 42
	cases := []struct {
		name    string
		current *WorkflowTask
		input   *WorkflowTaskAssignment
		wantErr error
	}{
		{
			name: "terminal",
			current: &WorkflowTask{
				ID: 9, TaskStatusKey: "done", OwnerRoleKey: QualityRoleKey, Version: 3,
			},
			input: &WorkflowTaskAssignment{
				TargetAssigneeID: &targetID,
			},
			wantErr: ErrWorkflowTaskSettled,
		},
		{
			name: "same assignee",
			current: &WorkflowTask{
				ID: 9, TaskStatusKey: "ready", OwnerRoleKey: QualityRoleKey, AssigneeID: &targetID, Version: 3,
			},
			input: &WorkflowTaskAssignment{
				TargetAssigneeID: &targetID,
			},
			wantErr: ErrWorkflowTaskAssignmentNoop,
		},
		{
			name: "already pooled",
			current: &WorkflowTask{
				ID: 9, TaskStatusKey: "blocked", OwnerRoleKey: QualityRoleKey, Version: 3,
			},
			input: &WorkflowTaskAssignment{
				ReleaseToPool: true,
			},
			wantErr: ErrWorkflowTaskAssignmentNoop,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &workflowAssignmentUsecaseRepo{
				stubWorkflowRepo: &stubWorkflowRepo{currentTask: tc.current},
			}
			uc := NewWorkflowUsecase(repo)
			tc.input.ID = tc.current.ID
			tc.input.ExpectedVersion = tc.current.Version
			tc.input.CommandKey = "reassign_task"
			tc.input.IdempotencyKey = "assignment-" + tc.name
			tc.input.Reason = "人员调整"
			tc.input.RequiredOwnerRoleKey = QualityRoleKey
			tc.input.RequiredPermissionKeys = []string{PermissionWorkflowTaskRead}
			if _, err := uc.ReassignTask(context.Background(), tc.input, 7, BossRoleKey); !errors.Is(err, tc.wantErr) {
				t.Fatalf("ReassignTask() error = %v, want %v", err, tc.wantErr)
			}
			if repo.input != nil {
				t.Fatal("invalid assignment must not reach repository mutation")
			}
		})
	}
}

func TestWorkflowTaskAssignmentIntentIncludesTargetPoolModeAndReason(t *testing.T) {
	firstTarget := 42
	secondTarget := 43
	base := WorkflowTaskAssignment{
		ID:                     9,
		ExpectedVersion:        3,
		CommandKey:             "reassign_task",
		IdempotencyKey:         "assignment-intent",
		TargetAssigneeID:       &firstTarget,
		Reason:                 "原处理人请假",
		RequiredOwnerRoleKey:   QualityRoleKey,
		RequiredPermissionKeys: []string{PermissionWorkflowTaskRead},
	}
	if err := prepareWorkflowTaskAssignmentMutation(&base, 7); err != nil {
		t.Fatalf("prepare base intent: %v", err)
	}
	differentVersion := base
	differentVersion.ExpectedVersion = 99
	if err := prepareWorkflowTaskAssignmentMutation(&differentVersion, 7); err != nil {
		t.Fatalf("prepare version intent: %v", err)
	}
	if differentVersion.IntentHash != base.IntentHash {
		t.Fatal("expected_version must not alter the business intent hash")
	}
	differentTarget := base
	differentTarget.TargetAssigneeID = &secondTarget
	if err := prepareWorkflowTaskAssignmentMutation(&differentTarget, 7); err != nil {
		t.Fatalf("prepare target intent: %v", err)
	}
	if differentTarget.IntentHash == base.IntentHash {
		t.Fatal("target change must alter the assignment intent hash")
	}
	release := base
	release.TargetAssigneeID = nil
	release.ReleaseToPool = true
	if err := prepareWorkflowTaskAssignmentMutation(&release, 7); err != nil {
		t.Fatalf("prepare pool intent: %v", err)
	}
	if release.IntentHash == base.IntentHash {
		t.Fatal("return-to-pool mode must alter the assignment intent hash")
	}
	differentReason := base
	differentReason.Reason = "岗位轮换"
	if err := prepareWorkflowTaskAssignmentMutation(&differentReason, 7); err != nil {
		t.Fatalf("prepare reason intent: %v", err)
	}
	if differentReason.IntentHash == base.IntentHash {
		t.Fatal("reason change must alter the assignment intent hash")
	}
}

func TestWorkflowUsecase_ReassignTaskReplaysBeforeCurrentStateValidation(t *testing.T) {
	targetID := 42
	replay := &WorkflowTask{ID: 9, TaskStatusKey: "ready", OwnerRoleKey: QualityRoleKey, AssigneeID: &targetID, Version: 4}
	repo := &workflowAssignmentReplayRepo{
		workflowAssignmentUsecaseRepo: &workflowAssignmentUsecaseRepo{
			stubWorkflowRepo: &stubWorkflowRepo{
				currentTask: &WorkflowTask{ID: 9, TaskStatusKey: "done", OwnerRoleKey: QualityRoleKey, Version: 99},
			},
		},
		replay: replay,
	}
	uc := NewWorkflowUsecase(repo)
	got, err := uc.ReassignTask(context.Background(), &WorkflowTaskAssignment{
		ID:                     9,
		ExpectedVersion:        3,
		CommandKey:             "reassign_task",
		IdempotencyKey:         "assignment-replay",
		TargetAssigneeID:       &targetID,
		Reason:                 "原处理人请假",
		RequiredOwnerRoleKey:   QualityRoleKey,
		RequiredPermissionKeys: []string{PermissionWorkflowTaskRead},
	}, 7, BossRoleKey)
	if err != nil || got != replay {
		t.Fatalf("receipt replay = %#v, err=%v", got, err)
	}
	if repo.getTaskCalled || repo.input != nil {
		t.Fatal("receipt replay must not read or mutate current task state")
	}
}
