package data

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/workflowtaskevent"
	modelschema "server/internal/data/model/schema"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"github.com/go-kratos/kratos/v2/log"
)

func TestWorkflowRepo_StatusReceiptReplaysOriginalResultAndAuditOnce(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_status_receipt?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	uc := biz.NewWorkflowUsecase(repo)
	task := createWorkflowIdempotencyTestTask(t, ctx, repo, "STATUS")

	update := &biz.WorkflowTaskStatusUpdate{
		ID:              task.ID,
		ExpectedVersion: task.Version,
		CommandKey:      "block_task_action",
		IdempotencyKey:  "workflow-status-receipt",
		TaskStatusKey:   "blocked",
		Reason:          "等待客户确认",
		Payload:         map[string]any{"workflow_page_scope": "quality", "decision": "wait"},
		AuditEvent: &biz.RuntimeAuditEventCreate{
			EventType: "workflow_break_glass",
			EventKey:  "workflow_task.break_glass",
			Source:    "workflow",
			Payload:   map[string]any{"task_id": task.ID},
		},
	}
	first, err := uc.UpdateTaskStatus(ctx, update, 7, biz.QualityRoleKey)
	if err != nil || first.Version != task.Version+1 || first.TaskStatusKey != "blocked" {
		t.Fatalf("first status mutation failed: task=%#v err=%v", first, err)
	}
	if count, countErr := client.RuntimeAuditEvent.Query().Count(ctx); countErr != nil || count != 1 {
		t.Fatalf("first mutation must write one audit in the same transaction, count=%d err=%v", count, countErr)
	}

	urged, err := uc.UrgeTask(ctx, &biz.WorkflowTaskUrge{
		ID:              task.ID,
		ExpectedVersion: first.Version,
		CommandKey:      "urge_task",
		IdempotencyKey:  "workflow-status-receipt-follow-up",
		Action:          "urge_task",
		Reason:          "请继续确认",
		Payload:         map[string]any{},
	}, 7, biz.QualityRoleKey)
	if err != nil || urged.Version != first.Version+1 {
		t.Fatalf("follow-up mutation failed: task=%#v err=%v", urged, err)
	}

	replayed, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:              update.ID,
		ExpectedVersion: 99,
		CommandKey:      update.CommandKey,
		IdempotencyKey:  update.IdempotencyKey,
		TaskStatusKey:   update.TaskStatusKey,
		Reason:          update.Reason,
		Payload:         map[string]any{"desktop_task_board_action": "block", "decision": "wait"},
		AuditEvent:      update.AuditEvent,
	}, 7, biz.QualityRoleKey)
	if err != nil || replayed.Version != first.Version || replayed.TaskStatusKey != first.TaskStatusKey {
		t.Fatalf("receipt must replay the original result snapshot after later mutation, task=%#v err=%v", replayed, err)
	}
	persisted, err := repo.GetWorkflowTask(ctx, task.ID)
	if err != nil || persisted.Version != urged.Version {
		t.Fatalf("replay must not roll current task back, task=%#v err=%v", persisted, err)
	}
	if count, countErr := client.RuntimeAuditEvent.Query().Count(ctx); countErr != nil || count != 1 {
		t.Fatalf("status replay must not duplicate audit, count=%d err=%v", count, countErr)
	}

	changed := *update
	changed.Reason = "另一个原因"
	changed.Payload = map[string]any{"decision": "another"}
	if _, err := uc.UpdateTaskStatus(ctx, &changed, 7, biz.QualityRoleKey); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("same key with changed status intent must conflict, got %v", err)
	}
}

func TestWorkflowRepo_ReceiptAndTaskRollbackWhenAuditFails(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_receipt_audit_rollback?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	uc := biz.NewWorkflowUsecase(repo)
	task := createWorkflowIdempotencyTestTask(t, ctx, repo, "AUDIT-ROLLBACK")
	update := &biz.WorkflowTaskStatusUpdate{
		ID:              task.ID,
		ExpectedVersion: task.Version,
		CommandKey:      "block_task_action",
		IdempotencyKey:  "workflow-audit-rollback",
		TaskStatusKey:   "blocked",
		Reason:          "等待资料",
		Payload:         map[string]any{},
		AuditEvent:      &biz.RuntimeAuditEventCreate{Source: "workflow"},
	}
	if _, err := uc.UpdateTaskStatus(ctx, update, 7, biz.QualityRoleKey); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("invalid audit must fail the whole mutation, got %v", err)
	}
	persisted, err := repo.GetWorkflowTask(ctx, task.ID)
	if err != nil || persisted.Version != task.Version || persisted.TaskStatusKey != "ready" {
		t.Fatalf("audit failure must roll task back, task=%#v err=%v", persisted, err)
	}
	statusEvents, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("status_changed")).
		Count(ctx)
	if err != nil || statusEvents != 0 {
		t.Fatalf("audit failure must roll receipt back, count=%d err=%v", statusEvents, err)
	}

	update.AuditEvent = &biz.RuntimeAuditEventCreate{
		EventType: "workflow_break_glass",
		EventKey:  "workflow_task.break_glass",
		Source:    "workflow",
		Payload:   map[string]any{"task_id": task.ID},
	}
	updated, err := uc.UpdateTaskStatus(ctx, update, 7, biz.QualityRoleKey)
	if err != nil || updated.Version != task.Version+1 {
		t.Fatalf("same key must remain usable after full rollback, task=%#v err=%v", updated, err)
	}
}

func TestWorkflowRepo_MutationReceiptCorruptionFailsClosed(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_receipt_corruption?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	uc := biz.NewWorkflowUsecase(repo)
	task := createWorkflowIdempotencyTestTask(t, ctx, repo, "CORRUPTION")
	update := &biz.WorkflowTaskStatusUpdate{
		ID:              task.ID,
		ExpectedVersion: task.Version,
		CommandKey:      "block_task_action",
		IdempotencyKey:  "workflow-receipt-corruption",
		TaskStatusKey:   "blocked",
		Reason:          "等待资料",
		Payload:         map[string]any{"decision": "wait"},
	}
	if _, err := uc.UpdateTaskStatus(ctx, update, 7, biz.QualityRoleKey); err != nil {
		t.Fatalf("create keyed receipt: %v", err)
	}
	event, err := client.WorkflowTaskEvent.Query().
		Where(
			workflowtaskevent.TaskID(task.ID),
			workflowtaskevent.IdempotencyKey(update.IdempotencyKey),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("query keyed receipt: %v", err)
	}
	if replayed, found, replayErr := workflowTaskMutationReceiptResult(event, update.IntentHash, update.CommandKey, 7); replayErr != nil || !found || replayed == nil {
		t.Fatalf("valid receipt must replay before corruption checks, task=%#v found=%v err=%v", replayed, found, replayErr)
	}
	if event.MutationResult["contract"] != workflowTaskMutationResultContractV1 {
		t.Fatalf("receipt must persist the V1 contract, got %#v", event.MutationResult)
	}
	taskResult := workflowReceiptTaskResult(t, event.MutationResult)
	if taskResult["task_code"] != task.TaskCode || taskResult["task_status_key"] != "blocked" {
		t.Fatalf("receipt task must use the stable snake_case V1 DTO, got %#v", taskResult)
	}
	if _, exists := event.MutationResult["TaskCode"]; exists {
		t.Fatalf("receipt must not serialize biz struct field names, got %#v", event.MutationResult)
	}

	cloneReceipt := func() *ent.WorkflowTaskEvent {
		clone := *event
		encoded, marshalErr := json.Marshal(event.MutationResult)
		if marshalErr != nil {
			t.Fatalf("marshal receipt clone: %v", marshalErr)
		}
		clone.MutationResult = nil
		if unmarshalErr := json.Unmarshal(encoded, &clone.MutationResult); unmarshalErr != nil {
			t.Fatalf("unmarshal receipt clone: %v", unmarshalErr)
		}
		return &clone
	}
	cases := []struct {
		name   string
		mutate func(*ent.WorkflowTaskEvent)
	}{
		{
			name: "unsupported result contract",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				receipt.MutationResult["contract"] = "workflow.task-mutation-result/v2"
			},
		},
		{
			name: "missing result contract",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				delete(receipt.MutationResult, "contract")
			},
		},
		{
			name: "missing task envelope",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				delete(receipt.MutationResult, "task")
			},
		},
		{
			name: "actor mismatch",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				actorID := 8
				receipt.ActorID = &actorID
			},
		},
		{
			name: "command mismatch",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				commandKey := "reject_task_action"
				receipt.CommandKey = &commandKey
			},
		},
		{
			name: "padded idempotency key",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				key := " " + update.IdempotencyKey + " "
				receipt.IdempotencyKey = &key
			},
		},
		{
			name: "padded command key",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				commandKey := " " + update.CommandKey + " "
				receipt.CommandKey = &commandKey
			},
		},
		{
			name: "event status mismatch",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				status := "done"
				receipt.ToStatusKey = &status
			},
		},
		{
			name: "padded status pair",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				status := " blocked "
				receipt.ToStatusKey = &status
				workflowReceiptTaskResult(t, receipt.MutationResult)["task_status_key"] = status
			},
		},
		{
			name: "invalid status pair",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				status := "bogus"
				receipt.ToStatusKey = &status
				workflowReceiptTaskResult(t, receipt.MutationResult)["task_status_key"] = status
			},
		},
		{
			name: "snapshot status mismatch",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				workflowReceiptTaskResult(t, receipt.MutationResult)["task_status_key"] = "done"
			},
		},
		{
			name: "snapshot invalid business status",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				workflowReceiptTaskResult(t, receipt.MutationResult)["business_status_key"] = "bogus"
			},
		},
		{
			name: "snapshot reminder type used as business status",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				workflowReceiptTaskResult(t, receipt.MutationResult)["business_status_key"] = "shipment_release_pending"
			},
		},
		{
			name: "snapshot empty business status",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				workflowReceiptTaskResult(t, receipt.MutationResult)["business_status_key"] = ""
			},
		},
		{
			name: "notification type used as business status",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				workflowReceiptTaskResult(t, receipt.MutationResult)["business_status_key"] = "shipment_release_pending"
			},
		},
		{
			name: "snapshot missing task code",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				delete(workflowReceiptTaskResult(t, receipt.MutationResult), "task_code")
			},
		},
		{
			name: "receipt uppercase intent hash",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				upper := strings.ToUpper(update.IntentHash)
				receipt.IntentHash = &upper
			},
		},
		{
			name: "receipt non hex intent hash",
			mutate: func(receipt *ent.WorkflowTaskEvent) {
				nonHex := strings.Repeat("g", 64)
				receipt.IntentHash = &nonHex
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			receipt := cloneReceipt()
			tc.mutate(receipt)
			if replayed, found, replayErr := workflowTaskMutationReceiptResult(receipt, update.IntentHash, update.CommandKey, 7); replayErr == nil || found || replayed != nil {
				t.Fatalf("corrupt receipt must fail closed, task=%#v found=%v err=%v", replayed, found, replayErr)
			}
		})
	}
}

func TestWorkflowTaskEventSchemaRequiresCompleteV1Receipt(t *testing.T) {
	t.Parallel()
	annotations := (modelschema.WorkflowTaskEvent{}).Annotations()
	var receiptCheck string
	for _, annotation := range annotations {
		sqlAnnotation, ok := annotation.(entsql.Annotation)
		if !ok {
			continue
		}
		receiptCheck = sqlAnnotation.Checks["workflow_task_events_receipt_v1_complete"]
		if receiptCheck != "" {
			break
		}
	}
	if receiptCheck == "" {
		t.Fatal("workflow task event schema must define the V1 receipt completeness check")
	}
	for _, fragment := range []string{
		"idempotency_key IS NULL",
		"intent_hash IS NULL",
		"command_key IS NULL",
		"mutation_result IS NULL",
		"idempotency_key IS NOT NULL",
		"intent_hash IS NOT NULL",
		"command_key IS NOT NULL",
		"mutation_result IS NOT NULL",
		"length(intent_hash) = 64",
		"task_version IS NOT NULL",
		"actor_id IS NOT NULL",
		"to_status_key IS NOT NULL",
	} {
		if !strings.Contains(receiptCheck, fragment) {
			t.Fatalf("receipt check must contain %q, got %s", fragment, receiptCheck)
		}
	}
	for _, forbidden := range []string{"jsonb_typeof", "mutation_result ?", "->", " ~ "} {
		if strings.Contains(receiptCheck, forbidden) {
			t.Fatalf("receipt check must remain cross-dialect and not contain %q, got %s", forbidden, receiptCheck)
		}
	}
}

func TestWorkflowTaskMutationIdentityRequiresLowercaseHexHash(t *testing.T) {
	t.Parallel()
	validHash := strings.Repeat("0a", 32)
	for _, tc := range []struct {
		name string
		hash string
		want bool
	}{
		{name: "lowercase hex", hash: validHash, want: true},
		{name: "uppercase hex", hash: strings.ToUpper(validHash)},
		{name: "non hex", hash: strings.Repeat("g", 64)},
		{name: "short", hash: strings.Repeat("a", 63)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := workflowTaskMutationIdentityValid("complete_task", "identity-test", tc.hash); got != tc.want {
				t.Fatalf("identity validation = %v, want %v for hash %q", got, tc.want, tc.hash)
			}
		})
	}
}

func TestWorkflowRepo_ResolveRejectsNonLowercaseHexIntentHash(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_resolve_hash_validation?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	task := createWorkflowIdempotencyTestTask(t, ctx, repo, "RESOLVE-HASH")

	for _, tc := range []struct {
		name string
		hash string
	}{
		{name: "uppercase hex", hash: strings.Repeat("A", 64)},
		{name: "non hex", hash: strings.Repeat("g", 64)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			replayed, found, err := repo.ResolveWorkflowTaskMutation(ctx, task.ID, "resolve-hash-test", tc.hash, "complete_task", 7)
			if !errors.Is(err, biz.ErrBadParam) || found || replayed != nil {
				t.Fatalf("invalid intent hash must fail before receipt lookup, task=%#v found=%v err=%v", replayed, found, err)
			}
		})
	}
}

func workflowReceiptTaskResult(t *testing.T, result map[string]any) map[string]any {
	t.Helper()
	task, ok := result["task"].(map[string]any)
	if !ok {
		t.Fatalf("receipt must contain a task object, got %#v", result)
	}
	return task
}

func TestWorkflowRepo_UrgeReceiptIncrementsOnceAndSurvivesTerminalAdvance(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_urge_receipt?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	uc := biz.NewWorkflowUsecase(repo)
	task := createWorkflowIdempotencyTestTask(t, ctx, repo, "URGE")
	urge := &biz.WorkflowTaskUrge{
		ID:              task.ID,
		ExpectedVersion: task.Version,
		CommandKey:      "urge_task",
		IdempotencyKey:  "workflow-urge-receipt",
		Action:          "urge_task",
		Reason:          "请今天确认",
		Payload:         map[string]any{"entry": "mobile"},
	}
	first, err := uc.UrgeTask(ctx, urge, 7, biz.PMCRoleKey)
	if err != nil || first.Version != task.Version+1 || workflowPayloadInt(first.Payload, "urge_count") != 1 {
		t.Fatalf("first urge failed: task=%#v err=%v", first, err)
	}
	replayed, err := uc.UrgeTask(ctx, urge, 7, biz.PMCRoleKey)
	if err != nil || replayed.Version != first.Version || workflowPayloadInt(replayed.Payload, "urge_count") != 1 {
		t.Fatalf("exact urge replay must return first result, task=%#v err=%v", replayed, err)
	}

	completed, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:              task.ID,
		ExpectedVersion: first.Version,
		CommandKey:      "complete_task_action",
		IdempotencyKey:  "workflow-urge-follow-up-complete",
		TaskStatusKey:   "done",
		Payload:         map[string]any{},
	}, 7, biz.QualityRoleKey)
	if err != nil || completed.TaskStatusKey != "done" {
		t.Fatalf("complete after urge failed: task=%#v err=%v", completed, err)
	}
	replayedAfterTerminal, err := uc.UrgeTask(ctx, urge, 7, biz.PMCRoleKey)
	if err != nil || replayedAfterTerminal.Version != first.Version || replayedAfterTerminal.TaskStatusKey != "ready" {
		t.Fatalf("urge receipt must replay before terminal validation, task=%#v err=%v", replayedAfterTerminal, err)
	}
	if count, countErr := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("urge_task")).
		Count(ctx); countErr != nil || count != 1 {
		t.Fatalf("urge replay must keep one event, count=%d err=%v", count, countErr)
	}
}

func createWorkflowIdempotencyTestTask(t *testing.T, ctx context.Context, repo *workflowRepo, suffix string) *biz.WorkflowTask {
	t.Helper()
	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:      "WORKFLOW-IDEMPOTENCY-" + suffix,
		TaskGroup:     "workflow_idempotency",
		TaskName:      "Workflow 幂等验证",
		SourceType:    "workflow-idempotency",
		SourceID:      len(suffix) + 1,
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.QualityRoleKey,
		Payload:       map[string]any{"record_title": suffix},
	}, 7)
	if err != nil {
		t.Fatalf("create Workflow idempotency task: %v", err)
	}
	return task
}
