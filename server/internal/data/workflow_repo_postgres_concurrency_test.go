package data

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestWorkflowPostgresPublicCreateTaskConcurrentSingleWinner(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	uc := biz.NewWorkflowUsecase(NewWorkflowRepo(data, log.NewStdLogger(io.Discard)))
	suffix := postgresTestSuffix()
	create := biz.WorkflowTaskCreate{
		IdempotencyKey: "workflow-public-create-" + suffix,
		TaskCode:       "WF-PUBLIC-CREATE-" + suffix,
		TaskGroup:      "generic",
		TaskName:       "并发创建",
		SourceType:     "generic-source",
		SourceID:       workflowPostgresSourceID(),
		OwnerRoleKey:   biz.SalesRoleKey,
		Payload:        map[string]any{},
	}

	const workers = 8
	results := make([]*biz.WorkflowTask, workers)
	errs := make([]error, workers)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for index := 0; index < workers; index++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			input := create
			results[index], errs[index] = uc.CreateTask(ctx, &input, 7)
		}(index)
	}
	close(start)
	wg.Wait()

	firstID := 0
	for index, err := range errs {
		if err != nil {
			t.Fatalf("concurrent create %d: %v", index, err)
		}
		if results[index] == nil || results[index].ID <= 0 {
			t.Fatalf("concurrent create %d returned %#v", index, results[index])
		}
		if firstID == 0 {
			firstID = results[index].ID
		} else if results[index].ID != firstID {
			t.Fatalf("concurrent create returned ids %d and %d", firstID, results[index].ID)
		}
	}
	if count := client.WorkflowTask.Query().Where(workflowtask.TaskCode(create.TaskCode)).CountX(ctx); count != 1 {
		t.Fatalf("concurrent create persisted %d tasks", count)
	}
}

func TestWorkflowPostgresConflictingTerminalUpdatesApplySideEffectsOnce(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	sourceID := workflowPostgresSourceID()
	sourceNo := "WF-PG-CONFLICT-" + suffix
	initialBusinessStatus := "project_pending"

	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "WF-PG-CONFLICT-" + suffix,
		TaskGroup:         "terminal_concurrency",
		TaskName:          "并发终态门禁验证",
		SourceType:        "project-orders",
		SourceID:          sourceID,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &initialBusinessStatus,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      biz.BossRoleKey,
		Payload:           map[string]any{"record_title": "并发终态门禁验证"},
	}, 7)
	if err != nil {
		t.Fatalf("create workflow task: %v", err)
	}

	type updateResult struct {
		requestedStatus string
		task            *biz.WorkflowTask
		err             error
	}
	start := make(chan struct{})
	results := make(chan updateResult, 2)
	var wg sync.WaitGroup
	for _, status := range []string{"done", "rejected"} {
		status := status
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			updated, updateErr := repo.UpdateWorkflowTaskStatus(ctx, workflowPostgresTerminalUpdate(
				task,
				sourceID,
				sourceNo,
				suffix,
				status,
			), 8, biz.BossRoleKey)
			results <- updateResult{requestedStatus: status, task: updated, err: updateErr}
		}()
	}
	close(start)
	wg.Wait()
	close(results)

	successes := 0
	settled := 0
	winnerStatus := ""
	for result := range results {
		switch {
		case result.err == nil:
			successes++
			winnerStatus = result.requestedStatus
			if result.task == nil || result.task.TaskStatusKey != result.requestedStatus {
				t.Fatalf("winner result mismatch: requested=%s task=%#v", result.requestedStatus, result.task)
			}
		case errors.Is(result.err, biz.ErrWorkflowTaskSettled):
			settled++
		default:
			t.Fatalf("unexpected concurrent terminal update error: %v", result.err)
		}
	}
	if successes != 1 || settled != 1 {
		t.Fatalf("expected one winner and one settled loser, successes=%d settled=%d", successes, settled)
	}

	persisted, err := client.WorkflowTask.Get(ctx, task.ID)
	if err != nil {
		t.Fatalf("reload workflow task: %v", err)
	}
	if persisted.TaskStatusKey != winnerStatus {
		t.Fatalf("persisted terminal status=%s, winner=%s", persisted.TaskStatusKey, winnerStatus)
	}
	statusEventCount, err := client.WorkflowTaskEvent.Query().
		Where(
			workflowtaskevent.TaskID(task.ID),
			workflowtaskevent.EventType("status_changed"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count status events: %v", err)
	}
	if statusEventCount != 1 {
		t.Fatalf("terminal race must append one status event, got %d", statusEventCount)
	}
	businessStateCount, err := client.WorkflowBusinessState.Query().
		Where(
			workflowbusinessstate.SourceType("project-orders"),
			workflowbusinessstate.SourceID(sourceID),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count workflow business states: %v", err)
	}
	if businessStateCount != 1 {
		t.Fatalf("terminal race must apply one business-state side effect, got %d", businessStateCount)
	}
	derivedTaskCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("project-orders"),
			workflowtask.SourceID(sourceID),
			workflowtask.TaskGroup("terminal_concurrency_downstream"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count derived workflow tasks: %v", err)
	}
	if derivedTaskCount != 1 {
		t.Fatalf("terminal race must create one derived task, got %d", derivedTaskCount)
	}
}

func TestWorkflowPostgresAttachmentUploadRechecksTaskAfterConcurrentMutation(t *testing.T) {
	for _, tc := range []struct {
		name       string
		updateSQL  string
		updateArgs []any
		wantErr    error
	}{
		{name: "completion", updateSQL: "UPDATE workflow_tasks SET task_status_key = 'done', version = version + 1 WHERE id = $1", wantErr: biz.ErrWorkflowTaskConflict},
		{name: "reassignment", updateSQL: "UPDATE workflow_tasks SET assignee_id = $2 WHERE id = $1", updateArgs: []any{99}, wantErr: biz.ErrForbidden},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			data, client := openPurchaseReceiptPostgresTestData(t)
			workflowRepo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
			attachmentRepo := NewBusinessAttachmentRepo(data, log.NewStdLogger(io.Discard))
			suffix := postgresTestSuffix()
			task, err := workflowRepo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
				TaskCode:      "WF-ATTACHMENT-" + suffix,
				TaskGroup:     "attachment_concurrency",
				TaskName:      "附件并发门禁",
				SourceType:    "generic-source",
				SourceID:      workflowPostgresSourceID(),
				TaskStatusKey: "ready",
				OwnerRoleKey:  biz.WarehouseRoleKey,
				Payload:       map[string]any{},
			}, 7)
			if err != nil {
				t.Fatalf("create workflow task: %v", err)
			}

			mutationTx, err := data.sqldb.BeginTx(ctx, nil)
			if err != nil {
				t.Fatalf("begin task mutation: %v", err)
			}
			defer func() { _ = mutationTx.Rollback() }()
			var lockedID int
			if err := mutationTx.QueryRowContext(ctx, "SELECT id FROM workflow_tasks WHERE id = $1 FOR UPDATE", task.ID).Scan(&lockedID); err != nil {
				t.Fatalf("lock task: %v", err)
			}

			result := make(chan error, 1)
			go func() {
				_, uploadErr := attachmentRepo.CreateBusinessAttachment(ctx, workflowAttachmentCreate(task.ID, task.Version, 7, biz.WarehouseRoleKey))
				result <- uploadErr
			}()
			select {
			case early := <-result:
				t.Fatalf("upload must wait for the task mutation lock, returned early: %v", early)
			case <-time.After(100 * time.Millisecond):
			}

			args := []any{task.ID}
			args = append(args, tc.updateArgs...)
			if _, err := mutationTx.ExecContext(ctx, tc.updateSQL, args...); err != nil {
				t.Fatalf("mutate locked task: %v", err)
			}
			if err := mutationTx.Commit(); err != nil {
				t.Fatalf("commit task mutation: %v", err)
			}
			select {
			case uploadErr := <-result:
				if !errors.Is(uploadErr, tc.wantErr) {
					t.Fatalf("expected %v after concurrent mutation, got %v", tc.wantErr, uploadErr)
				}
			case <-ctx.Done():
				t.Fatalf("wait for guarded upload: %v", ctx.Err())
			}
			count, err := client.BusinessAttachment.Query().Count(ctx)
			if err != nil || count != 0 {
				t.Fatalf("stale authorized upload must insert zero rows: count=%d err=%v", count, err)
			}
		})
	}
}

func TestWorkflowPostgresConcurrentSameApprovalRetryIsIdempotentWithoutDomainSideEffects(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	sourceID := workflowPostgresSourceID()
	sourceNo := "WF-PG-SAME-" + suffix
	businessStatus := "project_pending"
	approvalCapability := biz.PermissionWorkflowTaskApprove

	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:              "WF-PG-SAME-" + suffix,
		TaskGroup:             "order_approval",
		TaskName:              "老板审批订单",
		SourceType:            "project-orders",
		SourceID:              sourceID,
		SourceNo:              &sourceNo,
		BusinessStatusKey:     &businessStatus,
		TaskStatusKey:         "ready",
		OwnerRoleKey:          biz.BossRoleKey,
		RequiredCapabilityKey: &approvalCapability,
		Payload: map[string]any{
			"record_title":  "同终态并发幂等验证",
			"customer_name": "模拟客户",
		},
	}, 7)
	if err != nil {
		t.Fatalf("create approval task: %v", err)
	}

	barrierRepo := &workflowGetBarrierRepo{
		WorkflowRepo: repo,
		targetID:     task.ID,
		ready:        make(chan struct{}, 2),
		release:      make(chan struct{}),
	}
	uc := biz.NewWorkflowUsecase(barrierRepo)
	start := make(chan struct{})
	results := make(chan updateResultForWorkflowPostgres, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			updated, updateErr := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:              task.ID,
				ExpectedVersion: task.Version,
				CommandKey:      "complete_task_action",
				IdempotencyKey:  "wf-pg-same-intent-" + suffix,
				TaskStatusKey:   "done",
				Payload:         map[string]any{"approval_result": "approved"},
			}, 8, biz.BossRoleKey)
			results <- updateResultForWorkflowPostgres{task: updated, err: updateErr}
		}()
	}
	close(start)
	for i := 0; i < 2; i++ {
		select {
		case <-barrierRepo.ready:
		case <-ctx.Done():
			t.Fatalf("wait for both stale pre-update reads: %v", ctx.Err())
		}
	}
	close(barrierRepo.release)
	wg.Wait()
	close(results)

	for result := range results {
		if result.err != nil {
			t.Fatalf("same-terminal concurrent retry must be an idempotent success: %v", result.err)
		}
		if result.task == nil || result.task.TaskStatusKey != "done" {
			t.Fatalf("same-terminal retry returned unexpected task: %#v", result.task)
		}
	}

	statusEventCount, err := client.WorkflowTaskEvent.Query().
		Where(
			workflowtaskevent.TaskID(task.ID),
			workflowtaskevent.EventType("status_changed"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count same-terminal status events: %v", err)
	}
	if statusEventCount != 1 {
		t.Fatalf("same-terminal retry must append one status event, got %d", statusEventCount)
	}
	businessStateCount, err := client.WorkflowBusinessState.Query().
		Where(
			workflowbusinessstate.SourceType("project-orders"),
			workflowbusinessstate.SourceID(sourceID),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count same-terminal business states: %v", err)
	}
	if businessStateCount != 0 {
		t.Fatalf("approval retry must not write a sales-specific business-state side effect, got %d", businessStateCount)
	}
	derivedTaskCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("project-orders"),
			workflowtask.SourceID(sourceID),
			workflowtask.TaskGroup("engineering_data"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count same-terminal derived tasks: %v", err)
	}
	if derivedTaskCount != 0 {
		t.Fatalf("approval retry must not create the retired sales-specific engineering task, got %d", derivedTaskCount)
	}
}

func TestWorkflowPostgresConcurrentDifferentIntentSameKeyConflicts(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	task := createWorkflowPostgresConcurrencyTask(t, ctx, repo, "IDEMPOTENCY-CONFLICT", suffix, workflowPostgresSourceID())
	barrierRepo := &workflowGetBarrierRepo{
		WorkflowRepo: repo,
		targetID:     task.ID,
		ready:        make(chan struct{}, 2),
		release:      make(chan struct{}),
	}
	uc := biz.NewWorkflowUsecase(barrierRepo)
	start := make(chan struct{})
	results := make(chan updateResultForWorkflowPostgres, 2)
	var wg sync.WaitGroup
	for _, reason := range []string{"等待客户确认 A", "等待客户确认 B"} {
		reason := reason
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			updated, updateErr := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:              task.ID,
				ExpectedVersion: task.Version,
				CommandKey:      "block_task_action",
				IdempotencyKey:  "wf-pg-conflicting-intent-" + suffix,
				TaskStatusKey:   "blocked",
				Reason:          reason,
				Payload:         map[string]any{"decision": reason},
			}, 8, biz.BossRoleKey)
			results <- updateResultForWorkflowPostgres{task: updated, err: updateErr}
		}()
	}
	close(start)
	for i := 0; i < 2; i++ {
		select {
		case <-barrierRepo.ready:
		case <-ctx.Done():
			t.Fatalf("wait for conflicting intent reads: %v", ctx.Err())
		}
	}
	close(barrierRepo.release)
	wg.Wait()
	close(results)

	successes := 0
	conflicts := 0
	for result := range results {
		switch {
		case result.err == nil:
			successes++
		case errors.Is(result.err, biz.ErrIdempotencyConflict):
			conflicts++
		default:
			t.Fatalf("unexpected same-key conflict result: %v", result.err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("same key with different intent must produce one winner and one idempotency conflict, successes=%d conflicts=%d", successes, conflicts)
	}
	eventCount, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("status_changed")).
		Count(ctx)
	if err != nil || eventCount != 1 {
		t.Fatalf("conflicting intent race must append one event, count=%d err=%v", eventCount, err)
	}
}

func TestWorkflowPostgresConcurrentSameUrgeKeyIncrementsOnce(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	task := createWorkflowPostgresConcurrencyTask(t, ctx, repo, "IDEMPOTENT-URGE", suffix, workflowPostgresSourceID())
	barrierRepo := &workflowGetBarrierRepo{
		WorkflowRepo: repo,
		targetID:     task.ID,
		ready:        make(chan struct{}, 2),
		release:      make(chan struct{}),
	}
	uc := biz.NewWorkflowUsecase(barrierRepo)
	start := make(chan struct{})
	results := make(chan updateResultForWorkflowPostgres, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			updated, urgeErr := uc.UrgeTask(ctx, &biz.WorkflowTaskUrge{
				ID:              task.ID,
				ExpectedVersion: task.Version,
				CommandKey:      "urge_task",
				IdempotencyKey:  "wf-pg-same-urge-" + suffix,
				Action:          "urge_task",
				Reason:          "请立即确认",
				Payload:         map[string]any{"entry": "task_board"},
			}, 8, biz.PMCRoleKey)
			results <- updateResultForWorkflowPostgres{task: updated, err: urgeErr}
		}()
	}
	close(start)
	for i := 0; i < 2; i++ {
		select {
		case <-barrierRepo.ready:
		case <-ctx.Done():
			t.Fatalf("wait for same urge reads: %v", ctx.Err())
		}
	}
	close(barrierRepo.release)
	wg.Wait()
	close(results)
	for result := range results {
		if result.err != nil || result.task == nil || result.task.Version != task.Version+1 || workflowPayloadInt(result.task.Payload, "urge_count") != 1 {
			t.Fatalf("same urge key must replay the first result, task=%#v err=%v", result.task, result.err)
		}
	}
	persisted, err := repo.GetWorkflowTask(ctx, task.ID)
	if err != nil || persisted.Version != task.Version+1 || workflowPayloadInt(persisted.Payload, "urge_count") != 1 {
		t.Fatalf("same urge key must increment once, task=%#v err=%v", persisted, err)
	}
	events, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("urge_task")).
		All(ctx)
	if err != nil || len(events) != 1 || events[0].IdempotencyKey == nil || events[0].MutationResult == nil {
		t.Fatalf("same urge key must persist one complete receipt, events=%#v err=%v", events, err)
	}
}

func TestWorkflowPostgresMigrationShape(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)

	var nullable, defaultValue string
	if err := data.sqldb.QueryRowContext(ctx, `
		SELECT is_nullable, COALESCE(column_default, '')
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'workflow_tasks' AND column_name = 'version'
	`).Scan(&nullable, &defaultValue); err != nil {
		t.Fatalf("query workflow task version column: %v", err)
	}
	if nullable != "NO" || !strings.Contains(defaultValue, "1") {
		t.Fatalf("workflow_tasks.version must be NOT NULL DEFAULT 1, nullable=%s default=%q", nullable, defaultValue)
	}
	if err := data.sqldb.QueryRowContext(ctx, `
		SELECT is_nullable
		FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'workflow_task_events' AND column_name = 'task_version'
	`).Scan(&nullable); err != nil {
		t.Fatalf("query workflow task event version column: %v", err)
	}
	if nullable != "YES" {
		t.Fatalf("pre-migration events created by this project require nullable task_version, got %s", nullable)
	}
	for _, columnName := range []string{"idempotency_key", "intent_hash", "command_key", "mutation_result"} {
		if err := data.sqldb.QueryRowContext(ctx, `
			SELECT is_nullable
			FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'workflow_task_events' AND column_name = $1
		`, columnName).Scan(&nullable); err != nil {
			t.Fatalf("query workflow receipt column %s: %v", columnName, err)
		}
		if nullable != "YES" {
			t.Fatalf("pre-receipt-migration events created by this project require nullable %s, got %s", columnName, nullable)
		}
	}
	var indexDefinition string
	if err := data.sqldb.QueryRowContext(ctx, `
		SELECT indexdef
		FROM pg_indexes
		WHERE schemaname = 'public' AND indexname = 'workflowtaskevent_task_id_task_version'
	`).Scan(&indexDefinition); err != nil {
		t.Fatalf("query workflow event version index: %v", err)
	}
	if !strings.Contains(indexDefinition, "UNIQUE") ||
		!strings.Contains(indexDefinition, "(task_id, task_version)") {
		t.Fatalf("unexpected workflow event version index: %s", indexDefinition)
	}
	if err := data.sqldb.QueryRowContext(ctx, `
		SELECT indexdef
		FROM pg_indexes
		WHERE schemaname = 'public' AND indexname = 'workflowtaskevent_task_id_idempotency_key'
	`).Scan(&indexDefinition); err != nil {
		t.Fatalf("query workflow receipt unique index: %v", err)
	}
	if !strings.Contains(indexDefinition, "UNIQUE") || !strings.Contains(indexDefinition, "(task_id, idempotency_key)") {
		t.Fatalf("unexpected workflow receipt index: %s", indexDefinition)
	}

	const receiptConstraint = "workflow_task_events_receipt_v1_complete"
	var constraintDefinition string
	if err := data.sqldb.QueryRowContext(ctx, `
		SELECT pg_get_constraintdef(oid)
		FROM pg_constraint
		WHERE conrelid = 'public.workflow_task_events'::regclass AND conname = $1
	`, receiptConstraint).Scan(&constraintDefinition); err != nil {
		t.Fatalf("query workflow receipt constraint: %v", err)
	}
	if !strings.HasPrefix(constraintDefinition, "CHECK") {
		t.Fatalf("workflow receipt constraint must be a CHECK, got %s", constraintDefinition)
	}

	for constraintName, requiredParts := range map[string][]string{
		"workflow_tasks_status_allowed": {
			"ready", "blocked", "done", "rejected",
		},
		"workflow_tasks_process_anchors_paired": {
			"process_instance_id", "process_node_instance_id",
		},
	} {
		if err := data.sqldb.QueryRowContext(ctx, `
			SELECT pg_get_constraintdef(oid)
			FROM pg_constraint
			WHERE conrelid = 'public.workflow_tasks'::regclass AND conname = $1
		`, constraintName).Scan(&constraintDefinition); err != nil {
			t.Fatalf("query workflow task constraint %s: %v", constraintName, err)
		}
		for _, part := range requiredParts {
			if !strings.Contains(constraintDefinition, part) {
				t.Fatalf("workflow task constraint %s missing %q: %s", constraintName, part, constraintDefinition)
			}
		}
		if constraintName == "workflow_tasks_status_allowed" &&
			(strings.Contains(constraintDefinition, "pending") || strings.Contains(constraintDefinition, "processing")) {
			t.Fatalf("workflow task status CHECK must be target-only: %s", constraintDefinition)
		}
	}

	for _, constraintName := range []string{
		"workflow_tasks_process_instances_workflow_tasks",
		"workflow_tasks_process_node_instances_workflow_tasks",
	} {
		var foreignConstraintCount int
		if err := data.sqldb.QueryRowContext(ctx, `
			SELECT count(*)
			FROM pg_constraint
			WHERE conrelid = 'public.workflow_tasks'::regclass
			  AND conname = $1
			  AND contype = 'f'
		`, constraintName).Scan(&foreignConstraintCount); err != nil {
			t.Fatalf("query workflow task FK %s: %v", constraintName, err)
		}
		if foreignConstraintCount != 1 {
			t.Fatalf("workflow task FK %s count=%d, want 1", constraintName, foreignConstraintCount)
		}
	}

	var anchorTriggerCount int
	if err := data.sqldb.QueryRowContext(ctx, `
		SELECT count(*)
		FROM pg_trigger
		WHERE tgrelid = 'public.workflow_tasks'::regclass
		  AND tgname = 'workflow_task_process_anchor_match'
		  AND NOT tgisinternal
	`).Scan(&anchorTriggerCount); err != nil {
		t.Fatalf("query workflow task anchor trigger: %v", err)
	}
	if anchorTriggerCount != 1 {
		t.Fatalf("workflow task anchor trigger count=%d, want 1", anchorTriggerCount)
	}

	processSuffix := strings.ToLower(postgresTestSuffix())
	var processA, processB, nodeB int
	for processKey, target := range map[string]*int{
		"anchor-a-" + processSuffix: &processA,
		"anchor-b-" + processSuffix: &processB,
	} {
		if err := data.sqldb.QueryRowContext(ctx, `
			INSERT INTO process_instances (
				process_key, process_version, definition_hash, config_revision,
				business_ref_type, business_ref_id, status, idempotency_key,
				started_at, created_at, updated_at
			)
			VALUES ($1, 'v1', $2, 'config-test', 'workflow-anchor-test', $3, 'active', $4, NOW(), NOW(), NOW())
			RETURNING id
		`, processKey, strings.Repeat("a", 64), workflowPostgresSourceID(), "idem-"+processKey).Scan(target); err != nil {
			t.Fatalf("create process anchor fixture %s: %v", processKey, err)
		}
	}
	if err := data.sqldb.QueryRowContext(ctx, `
		INSERT INTO process_node_instances (
			process_instance_id, node_key, node_type, attempt, status,
			created_at, updated_at
		)
		VALUES ($1, 'node-b', 'human_task', 1, 'waiting', NOW(), NOW())
		RETURNING id
	`, processB).Scan(&nodeB); err != nil {
		t.Fatalf("create process node anchor fixture: %v", err)
	}
	_, anchorInsertErr := data.sqldb.ExecContext(ctx, `
		INSERT INTO workflow_tasks (
			task_code, task_group, task_name, source_type, source_id,
			task_status_key, owner_role_key, process_instance_id,
			process_node_instance_id, created_at, updated_at
		)
		VALUES ($1, 'anchor_contract', '跨流程锚点负例', 'workflow-anchor-test', $2,
			'ready', 'boss', $3, $4, NOW(), NOW())
	`, "WF-ANCHOR-MISMATCH-"+processSuffix, workflowPostgresSourceID(), processA, nodeB)
	var anchorErr *pgconn.PgError
	if !errors.As(anchorInsertErr, &anchorErr) || anchorErr.Code != "23514" ||
		!strings.Contains(anchorErr.Message, "does not belong") {
		t.Fatalf("cross-process workflow anchors must be rejected, err=%v", anchorInsertErr)
	}

	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	task := createWorkflowPostgresConcurrencyTask(t, ctx, repo, "RECEIPT-CHECK", suffix, workflowPostgresSourceID())
	validHash := strings.Repeat("a", 64)
	_, err := data.sqldb.ExecContext(ctx, `
		INSERT INTO workflow_task_events (
			task_id, task_version, event_type, to_status_key, actor_id, payload,
			idempotency_key, intent_hash, command_key, mutation_result, created_at
		)
		VALUES ($1, $2, 'status_changed', 'done', 7, '{}'::jsonb, $3, NULL, NULL, NULL, NOW())
	`, task.ID, task.Version+99, "pg-receipt-partial-"+suffix)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" || pgErr.ConstraintName != receiptConstraint {
		t.Fatalf("partial receipt must be rejected by %s, err=%v", receiptConstraint, err)
	}

	type receiptConstraintRow struct {
		taskVersion    int
		toStatusKey    string
		actorID        int
		idempotencyKey string
		intentHash     string
		commandKey     string
	}
	invalidReceiptRows := []struct {
		name   string
		mutate func(*receiptConstraintRow)
	}{
		{
			name: "empty idempotency key",
			mutate: func(row *receiptConstraintRow) {
				row.idempotencyKey = ""
			},
		},
		{
			name: "whitespace idempotency key",
			mutate: func(row *receiptConstraintRow) {
				row.idempotencyKey = "   "
			},
		},
		{
			name: "overlong idempotency key",
			mutate: func(row *receiptConstraintRow) {
				row.idempotencyKey = strings.Repeat("i", 129)
			},
		},
		{
			name: "short intent hash",
			mutate: func(row *receiptConstraintRow) {
				row.intentHash = strings.Repeat("a", 63)
			},
		},
		{
			name: "long intent hash",
			mutate: func(row *receiptConstraintRow) {
				row.intentHash = strings.Repeat("a", 65)
			},
		},
		{
			name: "empty command key",
			mutate: func(row *receiptConstraintRow) {
				row.commandKey = ""
			},
		},
		{
			name: "whitespace command key",
			mutate: func(row *receiptConstraintRow) {
				row.commandKey = "   "
			},
		},
		{
			name: "overlong command key",
			mutate: func(row *receiptConstraintRow) {
				row.commandKey = strings.Repeat("c", 129)
			},
		},
		{
			name: "zero task version",
			mutate: func(row *receiptConstraintRow) {
				row.taskVersion = 0
			},
		},
		{
			name: "negative task version",
			mutate: func(row *receiptConstraintRow) {
				row.taskVersion = -1
			},
		},
		{
			name: "zero actor id",
			mutate: func(row *receiptConstraintRow) {
				row.actorID = 0
			},
		},
		{
			name: "negative actor id",
			mutate: func(row *receiptConstraintRow) {
				row.actorID = -1
			},
		},
		{
			name: "empty target status",
			mutate: func(row *receiptConstraintRow) {
				row.toStatusKey = ""
			},
		},
		{
			name: "whitespace target status",
			mutate: func(row *receiptConstraintRow) {
				row.toStatusKey = "   "
			},
		},
	}
	for index, tc := range invalidReceiptRows {
		t.Run(tc.name, func(t *testing.T) {
			row := receiptConstraintRow{
				taskVersion:    task.Version + 1_000 + index,
				toStatusKey:    "done",
				actorID:        7,
				idempotencyKey: "pg-receipt-invalid-scalar-" + postgresTestSuffix(),
				intentHash:     validHash,
				commandKey:     "pg_receipt_invalid_scalar",
			}
			tc.mutate(&row)
			_, insertErr := data.sqldb.ExecContext(ctx, `
				INSERT INTO workflow_task_events (
					task_id, task_version, event_type, to_status_key, actor_id, payload,
					idempotency_key, intent_hash, command_key, mutation_result, created_at
				)
				VALUES ($1, $2, 'status_changed', $3, $4, '{}'::jsonb, $5, $6, $7, '{}'::jsonb, NOW())
			`, task.ID, row.taskVersion, row.toStatusKey, row.actorID, row.idempotencyKey, row.intentHash, row.commandKey)
			var constraintErr *pgconn.PgError
			if !errors.As(insertErr, &constraintErr) || constraintErr.Code != "23514" || constraintErr.ConstraintName != receiptConstraint {
				t.Fatalf("invalid receipt scalar must be rejected by %s, err=%v", receiptConstraint, insertErr)
			}
		})
	}

	invalidStatusTask := *task
	invalidStatusTask.Version = task.Version + 109
	invalidStatusTask.TaskStatusKey = "done"
	invalidStatusResult, err := workflowTaskMutationResultMap(&invalidStatusTask)
	if err != nil {
		t.Fatalf("build canonical receipt before corruption: %v", err)
	}
	workflowReceiptTaskResult(t, invalidStatusResult)["task_status_key"] = "bogus"
	invalidStatusJSON, err := json.Marshal(invalidStatusResult)
	if err != nil {
		t.Fatalf("encode corrupt status receipt: %v", err)
	}

	corruptReceipts := []struct {
		name           string
		taskVersion    int
		idempotencyKey string
		storedHash     string
		commandKey     string
		toStatusKey    string
		mutationResult string
	}{
		{
			name:           "missing contract",
			idempotencyKey: "pg-receipt-missing-contract-" + suffix,
			storedHash:     validHash,
			commandKey:     "pg_receipt_missing_contract",
			mutationResult: `{"task": {}}`,
		},
		{
			name:           "unsupported contract",
			idempotencyKey: "pg-receipt-unsupported-contract-" + suffix,
			storedHash:     validHash,
			commandKey:     "pg_receipt_unsupported_contract",
			mutationResult: `{"contract": "workflow.task-mutation-result/v2", "task": {}}`,
		},
		{
			name:           "non object",
			idempotencyKey: "pg-receipt-non-object-" + suffix,
			storedHash:     validHash,
			commandKey:     "pg_receipt_non_object",
			mutationResult: `"not-an-object"`,
		},
		{
			name:           "uppercase hash",
			idempotencyKey: "pg-receipt-uppercase-hash-" + suffix,
			storedHash:     strings.Repeat("A", 64),
			commandKey:     "pg_receipt_uppercase_hash",
			mutationResult: `{"contract": "` + workflowTaskMutationResultContractV1 + `", "task": {}}`,
		},
		{
			name:           "non hex hash",
			idempotencyKey: "pg-receipt-non-hex-hash-" + suffix,
			storedHash:     strings.Repeat("g", 64),
			commandKey:     "pg_receipt_non_hex_hash",
			mutationResult: `{"contract": "` + workflowTaskMutationResultContractV1 + `", "task": {}}`,
		},
		{
			name:           "missing task",
			idempotencyKey: "pg-receipt-missing-task-" + suffix,
			storedHash:     validHash,
			commandKey:     "pg_receipt_missing_task",
			mutationResult: `{"contract": "` + workflowTaskMutationResultContractV1 + `"}`,
		},
		{
			name:           "null task",
			idempotencyKey: "pg-receipt-null-task-" + suffix,
			storedHash:     validHash,
			commandKey:     "pg_receipt_null_task",
			mutationResult: `{"contract": "` + workflowTaskMutationResultContractV1 + `", "task": null}`,
		},
		{
			name:           "non object task",
			idempotencyKey: "pg-receipt-non-object-task-" + suffix,
			storedHash:     validHash,
			commandKey:     "pg_receipt_non_object_task",
			mutationResult: `{"contract": "` + workflowTaskMutationResultContractV1 + `", "task": []}`,
		},
		{
			name:           "invalid task snapshot",
			idempotencyKey: "pg-receipt-invalid-task-snapshot-" + suffix,
			storedHash:     validHash,
			commandKey:     "pg_receipt_invalid_task_snapshot",
			mutationResult: `{"contract": "` + workflowTaskMutationResultContractV1 + `", "task": {}}`,
		},
		{
			name:           "internally consistent invalid status",
			taskVersion:    invalidStatusTask.Version,
			idempotencyKey: "pg-receipt-invalid-status-" + suffix,
			storedHash:     validHash,
			commandKey:     "pg_receipt_invalid_status",
			toStatusKey:    "bogus",
			mutationResult: string(invalidStatusJSON),
		},
	}
	for index, tc := range corruptReceipts {
		t.Run(tc.name, func(t *testing.T) {
			taskVersion := tc.taskVersion
			if taskVersion == 0 {
				taskVersion = task.Version + 100 + index
			}
			toStatusKey := tc.toStatusKey
			if toStatusKey == "" {
				toStatusKey = "done"
			}
			if _, err := data.sqldb.ExecContext(ctx, `
				INSERT INTO workflow_task_events (
					task_id, task_version, event_type, to_status_key, actor_id, payload,
					idempotency_key, intent_hash, command_key, mutation_result, created_at
				)
				VALUES ($1, $2, 'status_changed', $3, 7, '{}'::jsonb, $4, $5, $6, $7::jsonb, NOW())
			`, task.ID, taskVersion, toStatusKey, tc.idempotencyKey, tc.storedHash, tc.commandKey, tc.mutationResult); err != nil {
				t.Fatalf("insert complete but corrupt receipt: %v", err)
			}
			replayed, found, resolveErr := repo.ResolveWorkflowTaskMutation(ctx, task.ID, tc.idempotencyKey, validHash, tc.commandKey, 7)
			if resolveErr == nil || found || replayed != nil {
				t.Fatalf("corrupt receipt must fail closed after lookup, task=%#v found=%v err=%v", replayed, found, resolveErr)
			}
		})
	}
}

func TestWorkflowPostgresBusinessStateRejectsRemovedShipmentReleasePendingStatus(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	sourceID := workflowPostgresSourceID()
	state, err := client.WorkflowBusinessState.Create().
		SetSourceType("shipping-release").
		SetSourceID(sourceID).
		SetBusinessStatusKey("shipment_pending").
		SetPayload(map[string]any{}).
		Save(ctx)
	if err != nil {
		t.Fatalf("create current workflow business state: %v", err)
	}
	_, err = data.sqldb.ExecContext(ctx, `UPDATE workflow_business_states SET business_status_key = 'shipment_release_pending' WHERE id = $1`, state.ID)
	var constraintErr *pgconn.PgError
	if !errors.As(err, &constraintErr) || constraintErr.Code != "23514" || constraintErr.ConstraintName != "workflow_business_states_status_allowed" {
		t.Fatalf("removed business status must fail closed with target-only CHECK, got %v", err)
	}
	var stateStatus string
	if err := data.sqldb.QueryRowContext(ctx, `SELECT business_status_key FROM workflow_business_states WHERE id = $1`, state.ID).Scan(&stateStatus); err != nil {
		t.Fatalf("read current workflow business state: %v", err)
	}
	if stateStatus != "shipment_pending" {
		t.Fatalf("failed legacy write must preserve canonical status, got %q", stateStatus)
	}
}

func TestWorkflowPostgresConcurrentBlockedCommandsAllowOneWinner(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	sourceID := workflowPostgresSourceID()
	task := createWorkflowPostgresConcurrencyTask(t, ctx, repo, "BLOCK", suffix, sourceID)

	updates := []*biz.WorkflowTaskStatusUpdate{
		workflowPostgresConcurrentStatusUpdate(task, suffix, "blocked", "blocked-a", "等待客户确认 A"),
		workflowPostgresConcurrentStatusUpdate(task, suffix, "blocked", "blocked-b", "等待客户确认 B"),
	}
	results := runWorkflowPostgresStatusRace(ctx, repo, updates)
	winner := assertWorkflowPostgresSingleCASWinner(t, results)
	if winner.task == nil || winner.task.Version != task.Version+1 {
		t.Fatalf("blocked winner must increment version once, got %#v", winner.task)
	}
	assertWorkflowPostgresWinnerProjection(t, ctx, client, task, sourceID, winner.task.Payload["decision"])
}

func TestWorkflowPostgresConcurrentBlockedAndDoneAllowOneWinner(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	sourceID := workflowPostgresSourceID()
	task := createWorkflowPostgresConcurrencyTask(t, ctx, repo, "BLOCK-DONE", suffix, sourceID)

	updates := []*biz.WorkflowTaskStatusUpdate{
		workflowPostgresConcurrentStatusUpdate(task, suffix, "blocked", "blocked", "等待资料确认"),
		workflowPostgresConcurrentStatusUpdate(task, suffix, "done", "done", ""),
	}
	results := runWorkflowPostgresStatusRace(ctx, repo, updates)
	winner := assertWorkflowPostgresSingleCASWinner(t, results)
	for _, result := range results {
		if result.err != nil &&
			!errors.Is(result.err, biz.ErrWorkflowTaskConflict) &&
			!errors.Is(result.err, biz.ErrWorkflowTaskSettled) {
			t.Fatalf("unexpected blocked/done loser error: %v", result.err)
		}
	}
	if winner.task == nil || winner.task.Version != task.Version+1 {
		t.Fatalf("blocked/done winner must increment version once, got %#v", winner.task)
	}
	assertWorkflowPostgresWinnerProjection(t, ctx, client, task, sourceID, winner.task.Payload["decision"])
}

func TestWorkflowPostgresConcurrentUrgesDoNotLoseCount(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	task := createWorkflowPostgresConcurrencyTask(t, ctx, repo, "URGE", suffix, workflowPostgresSourceID())

	start := make(chan struct{})
	results := make(chan updateResultForWorkflowPostgres, 2)
	var wg sync.WaitGroup
	for _, reason := range []string{"催办 A", "催办 B"} {
		reason := reason
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			updated, err := repo.UrgeWorkflowTask(ctx, workflowRepoTestUrgeMutation(task.ID, task.Version, "postgres-concurrent-urge-"+suffix+"-"+reason, &biz.WorkflowTaskUrge{
				ID:              task.ID,
				ExpectedVersion: task.Version,
				Action:          "urge_task",
				Reason:          reason,
				Payload:         map[string]any{"urge_source": reason},
			}), 8, biz.PMCRoleKey)
			results <- updateResultForWorkflowPostgres{task: updated, err: err}
		}()
	}
	close(start)
	wg.Wait()
	close(results)

	collected := make([]updateResultForWorkflowPostgres, 0, 2)
	for result := range results {
		collected = append(collected, result)
	}
	winner := assertWorkflowPostgresSingleCASWinner(t, collected)
	if winner.task.Version != task.Version+1 || workflowPayloadInt(winner.task.Payload, "urge_count") != 1 {
		t.Fatalf("urge race must persist one increment, got %#v", winner.task)
	}
	events, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("urge_task")).
		All(ctx)
	if err != nil {
		t.Fatalf("query urge events: %v", err)
	}
	if len(events) != 1 || events[0].TaskVersion == nil || *events[0].TaskVersion != task.Version+1 {
		t.Fatalf("urge race must append one versioned event, got %#v", events)
	}
}

func TestWorkflowPostgresUrgeAndTerminalAllowOneWinner(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	task := createWorkflowPostgresConcurrencyTask(t, ctx, repo, "URGE-DONE", suffix, workflowPostgresSourceID())

	start := make(chan struct{})
	results := make(chan updateResultForWorkflowPostgres, 2)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		<-start
		updated, err := repo.UrgeWorkflowTask(ctx, workflowRepoTestUrgeMutation(task.ID, task.Version, "postgres-urge-terminal-urge-"+suffix, &biz.WorkflowTaskUrge{
			ID:              task.ID,
			ExpectedVersion: task.Version,
			Action:          "urge_task",
			Reason:          "请立即处理",
			Payload:         map[string]any{},
		}), 8, biz.PMCRoleKey)
		results <- updateResultForWorkflowPostgres{task: updated, err: err}
	}()
	go func() {
		defer wg.Done()
		<-start
		updated, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, task.Version, "postgres-urge-terminal-done-"+suffix, &biz.WorkflowTaskStatusUpdate{
			ID:              task.ID,
			ExpectedVersion: task.Version,
			TaskStatusKey:   "done",
			Payload:         map[string]any{"decision": "done"},
		}), 9, biz.BossRoleKey)
		results <- updateResultForWorkflowPostgres{task: updated, err: err}
	}()
	close(start)
	wg.Wait()
	close(results)
	collected := make([]updateResultForWorkflowPostgres, 0, 2)
	for result := range results {
		collected = append(collected, result)
	}
	assertWorkflowPostgresSingleCASWinner(t, collected)

	persisted, err := repo.GetWorkflowTask(ctx, task.ID)
	if err != nil {
		t.Fatalf("reload urge/terminal task: %v", err)
	}
	if persisted.TaskStatusKey == "done" {
		urgeEvents, countErr := client.WorkflowTaskEvent.Query().
			Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("urge_task")).
			Count(ctx)
		if countErr != nil || urgeEvents != 0 {
			t.Fatalf("terminal winner must prevent urge event, count=%d err=%v", urgeEvents, countErr)
		}
		return
	}
	if workflowPayloadInt(persisted.Payload, "urge_count") != 1 || persisted.Version != task.Version+1 {
		t.Fatalf("urge winner must persist one urge before refreshed completion, got %#v", persisted)
	}
	completed, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, persisted.Version, "postgres-urge-terminal-refreshed-done-"+suffix, &biz.WorkflowTaskStatusUpdate{
		ID:              task.ID,
		ExpectedVersion: persisted.Version,
		TaskStatusKey:   "done",
		Payload:         map[string]any{"decision": "done-after-refresh"},
	}), 9, biz.BossRoleKey)
	if err != nil || completed.Version != task.Version+2 || completed.TaskStatusKey != "done" {
		t.Fatalf("refreshed terminal retry after urge must succeed, task=%#v err=%v", completed, err)
	}
}

func TestWorkflowPostgresRejectsStaleVersionWithoutSideEffects(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	sourceID := workflowPostgresSourceID()
	task := createWorkflowPostgresConcurrencyTask(t, ctx, repo, "STALE", suffix, sourceID)

	blocked, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(task.ID, task.Version, "postgres-stale-prepare-"+suffix, &biz.WorkflowTaskStatusUpdate{
		ID:              task.ID,
		ExpectedVersion: task.Version,
		TaskStatusKey:   "blocked",
		Reason:          "先落地的阻塞",
		Payload:         map[string]any{"decision": "first"},
	}), 8, biz.BossRoleKey)
	if err != nil || blocked.Version != task.Version+1 {
		t.Fatalf("prepare stale version task: task=%#v err=%v", blocked, err)
	}
	stale := workflowPostgresConcurrentStatusUpdate(task, suffix, "done", "stale-done", "")
	_, err = repo.UpdateWorkflowTaskStatus(ctx, stale, 9, biz.BossRoleKey)
	if !errors.Is(err, biz.ErrWorkflowTaskConflict) {
		t.Fatalf("stale nonterminal mutation must conflict, got %v", err)
	}
	persisted, err := repo.GetWorkflowTask(ctx, task.ID)
	if err != nil || persisted.Version != blocked.Version || persisted.TaskStatusKey != "blocked" {
		t.Fatalf("stale mutation changed task: task=%#v err=%v", persisted, err)
	}
	statusEvents, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("status_changed")).
		Count(ctx)
	if err != nil || statusEvents != 1 {
		t.Fatalf("stale mutation must not append event, count=%d err=%v", statusEvents, err)
	}
	stateCount, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("project-orders"), workflowbusinessstate.SourceID(sourceID)).
		Count(ctx)
	if err != nil || stateCount != 0 {
		t.Fatalf("stale mutation must not write business state, count=%d err=%v", stateCount, err)
	}
	derivedCount, err := client.WorkflowTask.Query().
		Where(workflowtask.SourceType("project-orders"), workflowtask.SourceID(sourceID), workflowtask.TaskGroup("workflow_concurrency_downstream")).
		Count(ctx)
	if err != nil || derivedCount != 0 {
		t.Fatalf("stale mutation must not create derived task, count=%d err=%v", derivedCount, err)
	}
}

type updateResultForWorkflowPostgres struct {
	task *biz.WorkflowTask
	err  error
}

func createWorkflowPostgresConcurrencyTask(t *testing.T, ctx context.Context, repo *workflowRepo, label, suffix string, sourceID int) *biz.WorkflowTask {
	t.Helper()
	sourceNo := "WF-PG-" + label + "-" + suffix
	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:      sourceNo,
		TaskGroup:     "workflow_concurrency",
		TaskName:      "Workflow 并发一致性验证",
		SourceType:    "project-orders",
		SourceID:      sourceID,
		SourceNo:      &sourceNo,
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.BossRoleKey,
		Payload:       map[string]any{"record_title": label},
	}, 7)
	if err != nil {
		t.Fatalf("create workflow concurrency task: %v", err)
	}
	if task.Version != 1 {
		t.Fatalf("new workflow task version must start at 1, got %d", task.Version)
	}
	return task
}

func workflowPostgresConcurrentStatusUpdate(task *biz.WorkflowTask, suffix, status, decision, reason string) *biz.WorkflowTaskStatusUpdate {
	businessStatus := "project_approved"
	if status == "blocked" {
		businessStatus = "blocked"
	}
	ownerRole := biz.SalesRoleKey
	return workflowRepoTestStatusMutation(task.ID, task.Version, "postgres-concurrent-status-"+suffix+"-"+decision, &biz.WorkflowTaskStatusUpdate{
		ID:                task.ID,
		ExpectedVersion:   task.Version,
		TaskStatusKey:     status,
		BusinessStatusKey: businessStatus,
		Reason:            reason,
		Payload:           map[string]any{"decision": decision},
		SideEffects: &biz.WorkflowTaskStatusSideEffects{
			BusinessState: &biz.WorkflowBusinessStateUpsert{
				SourceType:        task.SourceType,
				SourceID:          task.SourceID,
				SourceNo:          task.SourceNo,
				BusinessStatusKey: businessStatus,
				OwnerRoleKey:      &ownerRole,
				Payload:           map[string]any{"decision": decision},
			},
			DerivedTask: &biz.WorkflowTaskCreate{
				TaskCode:          "WF-PG-DERIVED-" + decision + "-" + suffix,
				TaskGroup:         "workflow_concurrency_downstream",
				TaskName:          "Workflow 并发派生任务",
				SourceType:        task.SourceType,
				SourceID:          task.SourceID,
				SourceNo:          task.SourceNo,
				BusinessStatusKey: &businessStatus,
				TaskStatusKey:     "ready",
				OwnerRoleKey:      ownerRole,
				Payload:           map[string]any{"decision": decision},
			},
			DerivedFromTaskID: task.ID,
			WorkflowRuleKey:   "workflow_concurrency_" + decision,
		},
	})
}

func runWorkflowPostgresStatusRace(ctx context.Context, repo *workflowRepo, updates []*biz.WorkflowTaskStatusUpdate) []updateResultForWorkflowPostgres {
	start := make(chan struct{})
	results := make(chan updateResultForWorkflowPostgres, len(updates))
	var wg sync.WaitGroup
	for _, update := range updates {
		update := update
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			task, err := repo.UpdateWorkflowTaskStatus(ctx, update, 8, biz.BossRoleKey)
			results <- updateResultForWorkflowPostgres{task: task, err: err}
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	out := make([]updateResultForWorkflowPostgres, 0, len(updates))
	for result := range results {
		out = append(out, result)
	}
	return out
}

func assertWorkflowPostgresSingleCASWinner(t *testing.T, results []updateResultForWorkflowPostgres) updateResultForWorkflowPostgres {
	t.Helper()
	var winner updateResultForWorkflowPostgres
	successes := 0
	conflicts := 0
	for _, result := range results {
		if result.err == nil {
			successes++
			winner = result
			continue
		}
		if errors.Is(result.err, biz.ErrWorkflowTaskConflict) || errors.Is(result.err, biz.ErrWorkflowTaskSettled) {
			conflicts++
			continue
		}
		t.Fatalf("unexpected Workflow CAS race error: %v", result.err)
	}
	if successes != 1 || conflicts != len(results)-1 {
		t.Fatalf("expected one CAS winner, successes=%d conflicts=%d results=%#v", successes, conflicts, results)
	}
	return winner
}

func assertWorkflowPostgresWinnerProjection(t *testing.T, ctx context.Context, client *ent.Client, task *biz.WorkflowTask, sourceID int, decision any) {
	t.Helper()
	persisted, err := client.WorkflowTask.Get(ctx, task.ID)
	if err != nil {
		t.Fatalf("reload Workflow CAS winner: %v", err)
	}
	if persisted.Version != task.Version+1 || persisted.Payload["decision"] != decision {
		t.Fatalf("persisted task does not match winner decision=%#v task=%#v", decision, persisted)
	}
	events, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("status_changed")).
		All(ctx)
	if err != nil || len(events) != 1 || events[0].TaskVersion == nil || *events[0].TaskVersion != persisted.Version || events[0].Payload["decision"] != decision {
		t.Fatalf("winner event mismatch decision=%#v events=%#v err=%v", decision, events, err)
	}
	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType(task.SourceType), workflowbusinessstate.SourceID(sourceID)).
		Only(ctx)
	if err != nil || state.Payload["decision"] != decision {
		t.Fatalf("winner business state mismatch decision=%#v state=%#v err=%v", decision, state, err)
	}
	derived, err := client.WorkflowTask.Query().
		Where(workflowtask.SourceType(task.SourceType), workflowtask.SourceID(sourceID), workflowtask.TaskGroup("workflow_concurrency_downstream")).
		All(ctx)
	if err != nil || len(derived) != 1 || derived[0].Payload["decision"] != decision {
		t.Fatalf("winner derived task mismatch decision=%#v tasks=%#v err=%v", decision, derived, err)
	}
}

type workflowGetBarrierRepo struct {
	biz.WorkflowRepo
	targetID int
	ready    chan struct{}
	release  chan struct{}

	mu          sync.Mutex
	barrierRead int
}

func (r *workflowGetBarrierRepo) GetWorkflowTask(ctx context.Context, id int) (*biz.WorkflowTask, error) {
	task, err := r.WorkflowRepo.GetWorkflowTask(ctx, id)
	if err != nil || id != r.targetID {
		return task, err
	}
	r.mu.Lock()
	r.barrierRead++
	shouldWait := r.barrierRead <= 2
	r.mu.Unlock()
	if !shouldWait {
		return task, nil
	}
	select {
	case r.ready <- struct{}{}:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	select {
	case <-r.release:
		return task, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func workflowPostgresTerminalUpdate(task *biz.WorkflowTask, sourceID int, sourceNo string, suffix string, status string) *biz.WorkflowTaskStatusUpdate {
	businessStatus := "project_approved"
	ownerRole := biz.EngineeringRoleKey
	if status == "rejected" {
		businessStatus = "project_pending"
		ownerRole = biz.SalesRoleKey
	}
	derivedStatus := businessStatus
	reason := ""
	payload := map[string]any{"decision": status}
	if status == "rejected" {
		reason = "并发拒绝验证"
		payload["rejected_reason"] = reason
	}
	return workflowRepoTestStatusMutation(task.ID, task.Version, "postgres-terminal-"+suffix+"-"+status, &biz.WorkflowTaskStatusUpdate{
		ID:                task.ID,
		TaskStatusKey:     status,
		BusinessStatusKey: businessStatus,
		Reason:            reason,
		Payload:           payload,
		SideEffects: &biz.WorkflowTaskStatusSideEffects{
			BusinessState: &biz.WorkflowBusinessStateUpsert{
				SourceType:        "project-orders",
				SourceID:          sourceID,
				SourceNo:          &sourceNo,
				BusinessStatusKey: businessStatus,
				OwnerRoleKey:      &ownerRole,
				Payload:           map[string]any{"decision": status},
			},
			DerivedTask: &biz.WorkflowTaskCreate{
				TaskCode:          "WF-PG-DERIVED-" + status + "-" + suffix,
				TaskGroup:         "terminal_concurrency_downstream",
				TaskName:          "并发终态派生任务",
				SourceType:        "project-orders",
				SourceID:          sourceID,
				SourceNo:          &sourceNo,
				BusinessStatusKey: &derivedStatus,
				TaskStatusKey:     "ready",
				OwnerRoleKey:      ownerRole,
				Payload:           map[string]any{"decision": status},
			},
			DerivedFromTaskID: task.ID,
			WorkflowRuleKey:   "terminal_concurrency_" + status,
		},
	})
}

func workflowPostgresSourceID() int {
	return 1 + int(time.Now().UnixNano()%1_500_000_000)
}
