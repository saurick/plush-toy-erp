package biz

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

type workflowReplayRepo struct {
	*stubWorkflowRepo
	replayKey  string
	replayHash string
	replayTask *WorkflowTask
}

type workflowTaskMutationIntentGoldenFile struct {
	Contract  string                                     `json:"contract"`
	Vectors   []workflowTaskMutationIntentGoldenVector   `json:"vectors"`
	Relations []workflowTaskMutationIntentGoldenRelation `json:"relations"`
}

type workflowTaskMutationIntentGoldenVector struct {
	Name            string                                 `json:"name"`
	Operation       string                                 `json:"operation"`
	Params          workflowTaskMutationIntentGoldenParams `json:"params"`
	ExpectedPayload map[string]any                         `json:"expected_payload"`
}

type workflowTaskMutationIntentGoldenParams struct {
	TaskID          int            `json:"task_id"`
	ExpectedVersion int            `json:"expected_version"`
	ActionKey       string         `json:"action_key"`
	Action          string         `json:"action"`
	Reason          string         `json:"reason"`
	Payload         map[string]any `json:"payload"`
}

type workflowTaskMutationIntentGoldenRelation struct {
	Name  string `json:"name"`
	Left  string `json:"left"`
	Right string `json:"right"`
	Equal bool   `json:"equal"`
}

func (r *workflowReplayRepo) ResolveWorkflowTaskMutation(_ context.Context, _ int, idempotencyKey string, intentHash string, _ string, _ int) (*WorkflowTask, bool, error) {
	if idempotencyKey != r.replayKey {
		return nil, false, nil
	}
	if r.replayHash != "" && r.replayHash != intentHash {
		return nil, false, ErrIdempotencyConflict
	}
	r.replayHash = intentHash
	return r.replayTask, true, nil
}

func TestWorkflowTaskMutationIntentGoldenVectors(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate workflow idempotency test source")
	}
	vectorsPath := filepath.Clean(filepath.Join(
		filepath.Dir(currentFile),
		"..", "..", "..", "scripts", "qa", "workflow-task-mutation-intent-v1.vectors.json",
	))
	encoded, err := os.ReadFile(vectorsPath)
	if err != nil {
		t.Fatalf("read shared workflow intent vectors: %v", err)
	}
	var golden workflowTaskMutationIntentGoldenFile
	if err := json.Unmarshal(encoded, &golden); err != nil {
		t.Fatalf("decode shared workflow intent vectors: %v", err)
	}
	if golden.Contract != workflowTaskMutationIntentContractV1 {
		t.Fatalf("shared workflow intent contract = %q, want %q", golden.Contract, workflowTaskMutationIntentContractV1)
	}
	if len(golden.Vectors) == 0 || len(golden.Relations) == 0 {
		t.Fatal("shared workflow intent vectors and relations must not be empty")
	}

	semanticByName := make(map[string]map[string]any, len(golden.Vectors))
	hashByName := make(map[string]string, len(golden.Vectors))
	for _, vector := range golden.Vectors {
		vector := vector
		t.Run("vector/"+vector.Name, func(t *testing.T) {
			if strings.TrimSpace(vector.Name) == "" {
				t.Fatal("shared workflow intent vector name is required")
			}
			if _, duplicated := semanticByName[vector.Name]; duplicated {
				t.Fatalf("duplicate shared workflow intent vector %q", vector.Name)
			}
			semantic, err := workflowTaskSemanticPayload(vector.Params.Payload)
			if err != nil {
				t.Fatalf("canonicalize shared workflow intent payload: %v", err)
			}
			if !reflect.DeepEqual(semantic, vector.ExpectedPayload) {
				t.Fatalf("semantic payload mismatch\n got: %#v\nwant: %#v", semantic, vector.ExpectedPayload)
			}
			hash, err := workflowTaskMutationIntentGoldenHash(vector)
			if err != nil {
				t.Fatalf("hash shared workflow intent vector: %v", err)
			}
			semanticByName[vector.Name] = semantic
			hashByName[vector.Name] = hash
		})
	}

	for _, relation := range golden.Relations {
		relation := relation
		t.Run("relation/"+relation.Name, func(t *testing.T) {
			leftPayload, leftFound := semanticByName[relation.Left]
			rightPayload, rightFound := semanticByName[relation.Right]
			leftHash, leftHashFound := hashByName[relation.Left]
			rightHash, rightHashFound := hashByName[relation.Right]
			if !leftFound || !rightFound || !leftHashFound || !rightHashFound {
				t.Fatalf("relation references missing vectors: left=%q right=%q", relation.Left, relation.Right)
			}
			payloadEqual := reflect.DeepEqual(leftPayload, rightPayload)
			hashEqual := leftHash == rightHash
			if payloadEqual != relation.Equal || hashEqual != relation.Equal {
				t.Fatalf("relation equal=%v, payload_equal=%v hash_equal=%v", relation.Equal, payloadEqual, hashEqual)
			}
		})
	}
}

func workflowTaskMutationIntentGoldenHash(vector workflowTaskMutationIntentGoldenVector) (string, error) {
	switch vector.Operation {
	case "complete", "block", "reject":
		statusKey := map[string]string{
			"complete": "done",
			"block":    "blocked",
			"reject":   "rejected",
		}[vector.Operation]
		commandKey := map[string]string{
			"complete": "complete_task_action",
			"block":    "block_task_action",
			"reject":   "reject_task_action",
		}[vector.Operation]
		if vector.Params.ActionKey != vector.Operation {
			return "", ErrBadParam
		}
		in := &WorkflowTaskStatusUpdate{
			ID:              vector.Params.TaskID,
			ExpectedVersion: vector.Params.ExpectedVersion,
			CommandKey:      commandKey,
			IdempotencyKey:  "golden-" + vector.Name,
			TaskStatusKey:   statusKey,
			Reason:          vector.Params.Reason,
			Payload:         vector.Params.Payload,
		}
		if err := prepareWorkflowTaskStatusMutation(in, 7); err != nil {
			return "", err
		}
		return in.IntentHash, nil
	case "urge":
		in := &WorkflowTaskUrge{
			ID:              vector.Params.TaskID,
			ExpectedVersion: vector.Params.ExpectedVersion,
			CommandKey:      "urge_task",
			IdempotencyKey:  "golden-" + vector.Name,
			Action:          vector.Params.Action,
			Reason:          vector.Params.Reason,
			Payload:         vector.Params.Payload,
		}
		if err := prepareWorkflowTaskUrgeMutation(in, 7); err != nil {
			return "", err
		}
		return in.IntentHash, nil
	default:
		return "", ErrBadParam
	}
}

func TestWorkflowTaskMutationIntentHashNormalizesTransportOnlyPayload(t *testing.T) {
	first := &WorkflowTaskStatusUpdate{
		ID:              9,
		ExpectedVersion: 3,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  "workflow-intent-9",
		TaskStatusKey:   "done",
		Payload: map[string]any{
			"workflow_page_scope": "quality",
			"qc_result":           "pass",
			"mobile_action": map[string]any{
				"action_key":   "done",
				"action_label": "完成",
				"role_key":     "quality",
				"recorded_at":  float64(100),
				"evidence_refs": []any{
					" photo-b ",
					"photo-a",
					"photo-a",
				},
				"simulated_only": false,
			},
		},
	}
	second := &WorkflowTaskStatusUpdate{
		ID:              9,
		ExpectedVersion: 99,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  "workflow-intent-9",
		TaskStatusKey:   "done",
		Payload: map[string]any{
			"mobile_action": map[string]any{
				"simulated_only": false,
				"evidence_refs":  []any{"photo-a", "photo-b"},
				"recorded_at":    float64(999),
				"role_key":       "another-ui-role-copy",
				"action_label":   "另一个界面标签",
				"action_key":     "complete",
			},
			"qc_result":                 "pass",
			"desktop_task_board_action": "complete",
		},
	}
	if err := prepareWorkflowTaskStatusMutation(first, 7); err != nil {
		t.Fatalf("prepare first intent: %v", err)
	}
	if err := prepareWorkflowTaskStatusMutation(second, 7); err != nil {
		t.Fatalf("prepare second intent: %v", err)
	}
	if first.IntentHash != second.IntentHash {
		t.Fatalf("transport-only UI fields, timestamps, map order, evidence order, and expected_version must not change intent hash: %s != %s", first.IntentHash, second.IntentHash)
	}

	changed := *second
	changed.Payload = map[string]any{"qc_result": "reject"}
	if err := prepareWorkflowTaskStatusMutation(&changed, 7); err != nil {
		t.Fatalf("prepare changed intent: %v", err)
	}
	if changed.IntentHash == first.IntentHash {
		t.Fatal("meaningful QC decision change must alter intent hash")
	}
	otherActor := *second
	if err := prepareWorkflowTaskStatusMutation(&otherActor, 8); err != nil {
		t.Fatalf("prepare other actor intent: %v", err)
	}
	if otherActor.IntentHash == first.IntentHash {
		t.Fatal("actor change must alter intent hash")
	}
	rawKeyChanged := *second
	rawKeyChanged.Payload = map[string]any{" qc_result ": "pass"}
	if err := prepareWorkflowTaskStatusMutation(&rawKeyChanged, 7); err != nil {
		t.Fatalf("prepare raw-key change: %v", err)
	}
	if rawKeyChanged.IntentHash == first.IntentHash {
		t.Fatal("unknown payload key spelling must remain part of the persisted intent")
	}
}

func TestWorkflowTaskCreateIntentHashUsesNormalizedDTOAndActor(t *testing.T) {
	repo := &stubWorkflowRepo{}
	uc := NewWorkflowUsecase(repo)
	base := WorkflowTaskCreate{
		IdempotencyKey: "  create-task-key-1  ",
		TaskCode:       "  FOLLOW-UP-201  ",
		TaskGroup:      "  customer_follow_up  ",
		TaskName:       "  跟进客户确认  ",
		SourceType:     "  project-orders  ",
		SourceID:       201,
		OwnerRoleKey:   "  sales  ",
		Payload:        map[string]any{"note": "保持原始业务文本"},
	}
	if _, err := uc.CreateTask(context.Background(), &base, 7); err != nil {
		t.Fatalf("create normalized task: %v", err)
	}
	first := *repo.createTaskInput
	if first.IdempotencyKey != "create-task-key-1" || len(first.IntentHash) != 64 {
		t.Fatalf("unexpected create identity key=%q hash=%q", first.IdempotencyKey, first.IntentHash)
	}

	normalized := base
	normalized.IdempotencyKey = "create-task-key-1"
	normalized.TaskCode = "FOLLOW-UP-201"
	normalized.TaskGroup = "customer_follow_up"
	normalized.TaskName = "跟进客户确认"
	normalized.SourceType = "project-orders"
	normalized.OwnerRoleKey = SalesRoleKey
	if _, err := uc.CreateTask(context.Background(), &normalized, 7); err != nil {
		t.Fatalf("create equivalent normalized task: %v", err)
	}
	if repo.createTaskInput.IntentHash != first.IntentHash {
		t.Fatalf("equivalent normalized DTO changed hash: %s != %s", repo.createTaskInput.IntentHash, first.IntentHash)
	}

	changed := normalized
	changed.Payload = map[string]any{"note": "另一业务意图"}
	if _, err := uc.CreateTask(context.Background(), &changed, 7); err != nil {
		t.Fatalf("prepare changed task: %v", err)
	}
	if repo.createTaskInput.IntentHash == first.IntentHash {
		t.Fatal("changed create payload must change intent hash")
	}

	if _, err := uc.CreateTask(context.Background(), &normalized, 8); err != nil {
		t.Fatalf("prepare other actor task: %v", err)
	}
	if repo.createTaskInput.IntentHash == first.IntentHash {
		t.Fatal("create actor must participate in intent hash")
	}
}

func TestWorkflowTaskMutationIntentHashIncludesUrgeAndBreakGlassSemantics(t *testing.T) {
	baseUrge := &WorkflowTaskUrge{
		ID:              10,
		ExpectedVersion: 4,
		CommandKey:      "urge_task",
		IdempotencyKey:  "workflow-urge-10",
		Action:          "urge_task",
		Reason:          "请今天完成",
		Payload:         map[string]any{},
	}
	escalated := *baseUrge
	escalated.Action = "escalate_to_boss"
	if err := prepareWorkflowTaskUrgeMutation(baseUrge, 7); err != nil {
		t.Fatalf("prepare urge: %v", err)
	}
	if err := prepareWorkflowTaskUrgeMutation(&escalated, 7); err != nil {
		t.Fatalf("prepare escalation: %v", err)
	}
	if baseUrge.IntentHash == escalated.IntentHash {
		t.Fatal("urge escalation action must alter intent hash")
	}

	expiresAt := time.Date(2026, 7, 11, 12, 0, 0, 0, time.UTC)
	first := &WorkflowTaskStatusUpdate{
		ID:              11,
		ExpectedVersion: 1,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  "workflow-break-glass-11",
		TaskStatusKey:   "done",
		Payload:         map[string]any{},
		BreakGlass: &WorkflowTaskBreakGlassIntent{
			ActionKey: "complete",
			Reason:    "紧急排障",
			ExpiresAt: expiresAt,
		},
	}
	second := *first
	second.BreakGlass = &WorkflowTaskBreakGlassIntent{
		ActionKey: "complete",
		Reason:    "紧急排障",
		ExpiresAt: expiresAt.Add(time.Minute),
	}
	if err := prepareWorkflowTaskStatusMutation(first, 7); err != nil {
		t.Fatalf("prepare first break glass: %v", err)
	}
	if err := prepareWorkflowTaskStatusMutation(&second, 7); err != nil {
		t.Fatalf("prepare second break glass: %v", err)
	}
	if first.IntentHash == second.IntentHash {
		t.Fatal("break-glass expiry change must alter intent hash")
	}
}

func TestWorkflowTaskMutationReplayPrecedesTerminalValidation(t *testing.T) {
	terminal := &WorkflowTask{
		ID:            12,
		TaskStatusKey: "done",
		OwnerRoleKey:  QualityRoleKey,
		Payload:       map[string]any{"qc_result": "pass"},
		Version:       2,
	}
	base := &stubWorkflowRepo{currentTask: terminal}
	repo := &workflowReplayRepo{
		stubWorkflowRepo: base,
		replayKey:        "workflow-terminal-replay-12",
		replayTask:       terminal,
	}
	uc := NewWorkflowUsecase(repo)
	input := &WorkflowTaskStatusUpdate{
		ID:              12,
		ExpectedVersion: 1,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  repo.replayKey,
		TaskStatusKey:   "done",
		Payload:         map[string]any{"qc_result": "pass"},
	}
	replayed, err := uc.UpdateTaskStatus(context.Background(), input, 7, QualityRoleKey)
	if err != nil || replayed != terminal {
		t.Fatalf("exact receipt must replay before terminal validation, task=%#v err=%v", replayed, err)
	}
	if base.getTaskCalled || base.updateTaskInput != nil {
		t.Fatalf("exact receipt must not reload or rewrite the task")
	}

	newCommand := *input
	newCommand.IdempotencyKey = "workflow-terminal-new-command-12"
	_, err = uc.UpdateTaskStatus(context.Background(), &newCommand, 7, QualityRoleKey)
	if !errors.Is(err, ErrWorkflowTaskSettled) {
		t.Fatalf("new key against terminal task must be settled, got %v", err)
	}

	changed := *input
	changed.Payload = map[string]any{"qc_result": "reject"}
	_, err = uc.UpdateTaskStatus(context.Background(), &changed, 7, QualityRoleKey)
	if !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("same key with changed intent must conflict, got %v", err)
	}
}

func TestWorkflowTaskMutationRejectsOversizedKey(t *testing.T) {
	in := &WorkflowTaskUrge{
		ID:              1,
		ExpectedVersion: 1,
		CommandKey:      "urge_task",
		IdempotencyKey:  strings.Repeat("x", 129),
		Action:          "urge_task",
		Reason:          "请处理",
		Payload:         map[string]any{},
	}
	if err := prepareWorkflowTaskUrgeMutation(in, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("oversized key must fail closed, got %v", err)
	}
}

func TestWorkflowTaskMutationRequiresCompleteReceiptIdentity(t *testing.T) {
	validStatus := WorkflowTaskStatusUpdate{
		ID:              1,
		ExpectedVersion: 1,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  "workflow-required-status",
		TaskStatusKey:   "done",
		Payload:         map[string]any{},
	}
	statusCases := []struct {
		name    string
		mutate  func(*WorkflowTaskStatusUpdate)
		actorID int
	}{
		{name: "missing expected version", mutate: func(in *WorkflowTaskStatusUpdate) { in.ExpectedVersion = 0 }, actorID: 7},
		{name: "missing idempotency key", mutate: func(in *WorkflowTaskStatusUpdate) { in.IdempotencyKey = "" }, actorID: 7},
		{name: "missing command key", mutate: func(in *WorkflowTaskStatusUpdate) { in.CommandKey = "" }, actorID: 7},
		{name: "missing actor", mutate: func(*WorkflowTaskStatusUpdate) {}, actorID: 0},
	}
	for _, tc := range statusCases {
		t.Run("status "+tc.name, func(t *testing.T) {
			in := validStatus
			tc.mutate(&in)
			if err := prepareWorkflowTaskStatusMutation(&in, tc.actorID); !errors.Is(err, ErrBadParam) {
				t.Fatalf("incomplete status receipt identity must fail closed, got %v", err)
			}
		})
	}

	validUrge := WorkflowTaskUrge{
		ID:              1,
		ExpectedVersion: 1,
		CommandKey:      "urge_task",
		IdempotencyKey:  "workflow-required-urge",
		Action:          "urge_task",
		Reason:          "请处理",
		Payload:         map[string]any{},
	}
	urgeCases := []struct {
		name    string
		mutate  func(*WorkflowTaskUrge)
		actorID int
	}{
		{name: "missing expected version", mutate: func(in *WorkflowTaskUrge) { in.ExpectedVersion = 0 }, actorID: 7},
		{name: "missing idempotency key", mutate: func(in *WorkflowTaskUrge) { in.IdempotencyKey = "" }, actorID: 7},
		{name: "missing command key", mutate: func(in *WorkflowTaskUrge) { in.CommandKey = "" }, actorID: 7},
		{name: "missing actor", mutate: func(*WorkflowTaskUrge) {}, actorID: 0},
	}
	for _, tc := range urgeCases {
		t.Run("urge "+tc.name, func(t *testing.T) {
			in := validUrge
			tc.mutate(&in)
			if err := prepareWorkflowTaskUrgeMutation(&in, tc.actorID); !errors.Is(err, ErrBadParam) {
				t.Fatalf("incomplete urge receipt identity must fail closed, got %v", err)
			}
		})
	}
}

func TestWorkflowTaskMutationRejectsNonCanonicalizablePayload(t *testing.T) {
	in := &WorkflowTaskStatusUpdate{
		ID:              1,
		ExpectedVersion: 1,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  "workflow-invalid-payload",
		TaskStatusKey:   "done",
		Payload:         map[string]any{"unsupported": make(chan int)},
	}
	if err := prepareWorkflowTaskStatusMutation(in, 7); !errors.Is(err, ErrBadParam) {
		t.Fatalf("non-canonicalizable payload must fail closed, got %v", err)
	}
	if in.IntentHash != "" {
		t.Fatalf("invalid payload must not produce a colliding intent hash, got %q", in.IntentHash)
	}
}
