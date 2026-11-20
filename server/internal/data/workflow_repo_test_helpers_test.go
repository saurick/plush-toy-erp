package data

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"

	"server/internal/biz"
)

func resumeWorkflowTaskForNextRound(
	t *testing.T,
	ctx context.Context,
	uc *biz.WorkflowUsecase,
	taskID int,
	expectedVersion int,
	receiptKey string,
	actorID int,
	actorRoleKey string,
) *biz.WorkflowTask {
	t.Helper()
	resumed, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:              taskID,
		ExpectedVersion: expectedVersion,
		CommandKey:      "resume_task_action",
		IdempotencyKey:  receiptKey,
		TaskStatusKey:   "ready",
		Reason:          "问题已处理，恢复任务后进入下一轮",
		Payload:         map[string]any{"resume_evidence": "data-test"},
	}, actorID, actorRoleKey)
	if err != nil {
		t.Fatalf("resume task for next round: %v", err)
	}
	return resumed
}

func workflowRepoTestStatusMutation(
	taskID int,
	expectedVersion int,
	receiptKey string,
	in *biz.WorkflowTaskStatusUpdate,
) *biz.WorkflowTaskStatusUpdate {
	if in == nil {
		in = &biz.WorkflowTaskStatusUpdate{}
	}
	if in.ID <= 0 {
		in.ID = taskID
	}
	if in.ExpectedVersion <= 0 {
		in.ExpectedVersion = expectedVersion
	}
	if strings.TrimSpace(in.CommandKey) == "" {
		in.CommandKey = "data_test_status_" + strings.TrimSpace(in.TaskStatusKey)
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = receiptKey
	}
	if strings.TrimSpace(in.IntentHash) == "" {
		sum := sha256.Sum256([]byte("workflow-data-test:" + receiptKey))
		in.IntentHash = hex.EncodeToString(sum[:])
	}
	return in
}

func workflowRepoTestUrgeMutation(
	taskID int,
	expectedVersion int,
	receiptKey string,
	in *biz.WorkflowTaskUrge,
) *biz.WorkflowTaskUrge {
	if in == nil {
		in = &biz.WorkflowTaskUrge{}
	}
	if in.ID <= 0 {
		in.ID = taskID
	}
	if in.ExpectedVersion <= 0 {
		in.ExpectedVersion = expectedVersion
	}
	if strings.TrimSpace(in.CommandKey) == "" {
		in.CommandKey = "data_test_" + strings.TrimSpace(in.Action)
	}
	if strings.TrimSpace(in.IdempotencyKey) == "" {
		in.IdempotencyKey = receiptKey
	}
	if strings.TrimSpace(in.IntentHash) == "" {
		sum := sha256.Sum256([]byte("workflow-data-test:" + receiptKey))
		in.IntentHash = hex.EncodeToString(sum[:])
	}
	return in
}
