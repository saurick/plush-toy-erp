package data

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"

	"server/internal/biz"
)

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
