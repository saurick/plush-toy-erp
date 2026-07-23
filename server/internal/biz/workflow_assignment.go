package biz

import (
	"context"
	"strings"
	"unicode/utf8"
)

const workflowTaskAssignmentIntentContractV1 = "workflow.task-assignment/v1"

type workflowTaskAssignmentIntent struct {
	Contract         string `json:"contract"`
	CommandKey       string `json:"command_key"`
	TaskID           int    `json:"task_id"`
	ActorID          int    `json:"actor_id"`
	TargetAssigneeID *int   `json:"target_assignee_id"`
	ReleaseToPool    bool   `json:"release_to_pool"`
	Reason           string `json:"reason"`
}

func (uc *WorkflowUsecase) ResolveTaskAssignmentMutationReplay(
	ctx context.Context,
	in *WorkflowTaskAssignment,
	actorID int,
) (*WorkflowTask, bool, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, false, ErrBadParam
	}
	if err := prepareWorkflowTaskAssignmentMutation(in, actorID); err != nil {
		return nil, false, err
	}
	return uc.repo.ResolveWorkflowTaskMutation(
		ctx,
		in.ID,
		in.IdempotencyKey,
		in.IntentHash,
		in.CommandKey,
		actorID,
	)
}

func (uc *WorkflowUsecase) ReassignTask(
	ctx context.Context,
	in *WorkflowTaskAssignment,
	actorID int,
	actorRoleKey string,
) (*WorkflowTask, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	if err := prepareWorkflowTaskAssignmentMutation(in, actorID); err != nil {
		return nil, err
	}
	if replayed, found, err := uc.repo.ResolveWorkflowTaskMutation(
		ctx,
		in.ID,
		in.IdempotencyKey,
		in.IntentHash,
		in.CommandKey,
		actorID,
	); err != nil || found {
		return replayed, err
	}
	current, err := uc.repo.GetWorkflowTask(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if IsTerminalWorkflowTaskStatus(current.TaskStatusKey) {
		return nil, ErrWorkflowTaskSettled
	}
	if in.ExpectedVersion != current.Version {
		return nil, ErrWorkflowTaskConflict
	}
	if workflowTaskAssignmentUnchanged(current.AssigneeID, in) {
		return nil, ErrWorkflowTaskAssignmentNoop
	}
	repo, ok := uc.repo.(WorkflowTaskAssignmentRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.ReassignWorkflowTask(
		ctx,
		in,
		actorID,
		NormalizeRoleKey(actorRoleKey),
	)
}

func prepareWorkflowTaskAssignmentMutation(in *WorkflowTaskAssignment, actorID int) error {
	if in == nil {
		return ErrBadParam
	}
	in.CommandKey = strings.TrimSpace(in.CommandKey)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.Reason = strings.TrimSpace(in.Reason)
	in.RequiredOwnerRoleKey = NormalizeRoleKey(in.RequiredOwnerRoleKey)
	in.RequiredPermissionKeys = NormalizePermissionKeys(in.RequiredPermissionKeys)
	if in.ID <= 0 ||
		in.ExpectedVersion <= 0 ||
		actorID <= 0 ||
		in.CommandKey == "" ||
		in.IdempotencyKey == "" ||
		in.Reason == "" ||
		in.RequiredOwnerRoleKey == "" ||
		len(in.RequiredPermissionKeys) == 0 ||
		utf8.RuneCountInString(in.CommandKey) > workflowTaskCommandKeyMaxLength ||
		utf8.RuneCountInString(in.IdempotencyKey) > workflowTaskIdempotencyKeyMaxLength ||
		utf8.RuneCountInString(in.Reason) > 255 {
		return ErrBadParam
	}
	if in.ReleaseToPool {
		if in.TargetAssigneeID != nil {
			return ErrBadParam
		}
	} else if in.TargetAssigneeID == nil || *in.TargetAssigneeID <= 0 {
		return ErrBadParam
	}
	hash, err := workflowTaskIntentHash(workflowTaskAssignmentIntent{
		Contract:         workflowTaskAssignmentIntentContractV1,
		CommandKey:       in.CommandKey,
		TaskID:           in.ID,
		ActorID:          actorID,
		TargetAssigneeID: in.TargetAssigneeID,
		ReleaseToPool:    in.ReleaseToPool,
		Reason:           in.Reason,
	})
	if err != nil {
		return err
	}
	in.IntentHash = hash
	return nil
}

func workflowTaskAssignmentUnchanged(currentAssigneeID *int, in *WorkflowTaskAssignment) bool {
	if in == nil {
		return false
	}
	if in.ReleaseToPool {
		return currentAssigneeID == nil
	}
	return currentAssigneeID != nil &&
		in.TargetAssigneeID != nil &&
		*currentAssigneeID == *in.TargetAssigneeID
}
