package data

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"github.com/go-kratos/kratos/v2/log"
)

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
				task.ID,
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

func TestWorkflowPostgresConcurrentSameTerminalRetryIsIdempotent(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	sourceID := workflowPostgresSourceID()
	sourceNo := "WF-PG-SAME-" + suffix
	businessStatus := "project_pending"

	task, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:          "WF-PG-SAME-" + suffix,
		TaskGroup:         "order_approval",
		TaskName:          "老板审批订单",
		SourceType:        "project-orders",
		SourceID:          sourceID,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &businessStatus,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      biz.BossRoleKey,
		Payload: map[string]any{
			"record_title":  "同终态并发幂等验证",
			"customer_name": "模拟客户",
		},
	}, 7)
	if err != nil {
		t.Fatalf("create boss approval task: %v", err)
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
				ID:            task.ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{"approval_result": "approved"},
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
	if businessStateCount != 1 {
		t.Fatalf("same-terminal retry must apply one business-state side effect, got %d", businessStateCount)
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
	if derivedTaskCount != 1 {
		t.Fatalf("same-terminal retry must create one engineering task, got %d", derivedTaskCount)
	}
}

type updateResultForWorkflowPostgres struct {
	task *biz.WorkflowTask
	err  error
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

func workflowPostgresTerminalUpdate(taskID int, sourceID int, sourceNo string, suffix string, status string) *biz.WorkflowTaskStatusUpdate {
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
	return &biz.WorkflowTaskStatusUpdate{
		ID:                taskID,
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
			DerivedFromTaskID: taskID,
			WorkflowRuleKey:   "terminal_concurrency_" + status,
		},
	}
}

func workflowPostgresSourceID() int {
	return 1 + int(time.Now().UnixNano()%1_500_000_000)
}
