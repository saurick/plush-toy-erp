package data

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/workflowbusinessstate"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func TestWorkflowRepo_FinishedGoodsQCDoneCreatesInboundIdempotently(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_finished_goods_qc_done?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewWorkflowUsecase(repo)

	qcTask := createFinishedGoodsQCTask(t, ctx, repo, 4501)

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            qcTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality", "qc_result": "accepted"},
	}, 8, "quality"); err != nil {
		t.Fatalf("done update failed: %v", err)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(4501)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query finished goods QC business state failed: %v", err)
	}
	if state.BusinessStatusKey != "warehouse_inbound_pending" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected finished goods QC done business state %#v", state)
	}
	if state.Payload["qc_task_id"] != float64(qcTask.ID) && state.Payload["qc_task_id"] != qcTask.ID {
		t.Fatalf("expected QC task id in state payload, got %#v", state.Payload)
	}
	if state.Payload["qc_result"] != "accepted" ||
		state.Payload["finished_goods"] != true ||
		state.Payload["inventory_balance_deferred"] != true ||
		state.Payload["alert_type"] != "finished_goods_inbound_pending" {
		t.Fatalf("expected finished goods QC state payload, got %#v", state.Payload)
	}

	downstreamTasks, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(4501),
			workflowtask.TaskGroup("finished_goods_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query finished goods inbound tasks failed: %v", err)
	}
	if len(downstreamTasks) != 1 {
		t.Fatalf("expected one finished goods inbound task, got %d", len(downstreamTasks))
	}
	if downstreamTasks[0].Payload["qc_task_id"] != float64(qcTask.ID) && downstreamTasks[0].Payload["qc_task_id"] != qcTask.ID {
		t.Fatalf("expected QC task id in downstream payload, got %#v", downstreamTasks[0].Payload)
	}
	if downstreamTasks[0].Payload["qc_result"] != "accepted" ||
		downstreamTasks[0].Payload["finished_goods"] != true ||
		downstreamTasks[0].Payload["inventory_balance_deferred"] != true ||
		downstreamTasks[0].Payload["alert_type"] != "finished_goods_inbound_pending" ||
		downstreamTasks[0].Payload["shipment_date"] != "2026-04-30" {
		t.Fatalf("unexpected finished goods inbound payload %#v", downstreamTasks[0].Payload)
	}

	shipmentCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(4501),
			workflowtask.TaskGroup("shipment_release"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count shipment release tasks failed: %v", err)
	}
	if shipmentCount != 0 {
		t.Fatalf("finished goods QC done must not derive shipment release, got %d", shipmentCount)
	}
	inventoryTxnCount, err := client.InventoryTxn.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count inventory txns failed: %v", err)
	}
	inventoryBalanceCount, err := client.InventoryBalance.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count inventory balances failed: %v", err)
	}
	inventoryLotCount, err := client.InventoryLot.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count inventory lots failed: %v", err)
	}
	if inventoryTxnCount != 0 || inventoryBalanceCount != 0 || inventoryLotCount != 0 {
		t.Fatalf("finished goods QC must not write inventory facts, got txns=%d balances=%d lots=%d", inventoryTxnCount, inventoryBalanceCount, inventoryLotCount)
	}

	events, err := client.WorkflowTaskEvent.Query().Order(ent.Asc(workflowtaskevent.FieldID)).All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 3 {
		t.Fatalf("expected QC created + status + inbound created events, got %d", len(events))
	}
	if events[1].EventType != "status_changed" ||
		events[1].FromStatusKey == nil ||
		*events[1].FromStatusKey != "ready" ||
		events[1].ToStatusKey == nil ||
		*events[1].ToStatusKey != "done" {
		t.Fatalf("expected finished goods QC status event ready -> done, got %#v", events[1])
	}
	if events[2].TaskID != downstreamTasks[0].ID ||
		events[2].Payload["workflow_rule_key"] != "finished_goods_qc_done_to_finished_goods_inbound" {
		t.Fatalf("expected inbound created event with rule payload, got %#v", events[2])
	}

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            qcTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "quality"},
	}, 8, "quality"); err != nil {
		t.Fatalf("repeat done update failed: %v", err)
	}
	count, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(4501),
			workflowtask.TaskGroup("finished_goods_inbound"),
			workflowtask.OwnerRoleKey("warehouse"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count finished goods inbound tasks failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected idempotent finished goods inbound task count 1, got %d", count)
	}
}

func TestWorkflowRepo_FinishedGoodsQCReworkIdempotencyHonorsRejectedTerminalState(t *testing.T) {
	cases := []struct {
		status     string
		reasonKey  string
		sourceID   int
		wantRounds int
	}{
		{status: "blocked", reasonKey: "blocked_reason", sourceID: 4601, wantRounds: 2},
		{status: "rejected", reasonKey: "rejected_reason", sourceID: 4602, wantRounds: 1},
	}

	for _, tc := range cases {
		t.Run(tc.status, func(t *testing.T) {
			ctx := context.Background()
			client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_finished_goods_qc_"+tc.status+"?mode=memory&cache=shared&_fk=1")
			defer mustCloseEntClient(t, client)

			repo := NewWorkflowRepo(
				&Data{postgres: client},
				log.NewStdLogger(io.Discard),
			)
			uc := biz.NewWorkflowUsecase(repo)
			qcTask := createFinishedGoodsQCTask(t, ctx, repo, tc.sourceID)

			reason := "成品抽检不合格"
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            qcTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "quality"); err != nil {
				t.Fatalf("first %s update failed: %v", tc.status, err)
			}
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            qcTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "quality"); err != nil {
				t.Fatalf("repeat %s update failed: %v", tc.status, err)
			}

			state, err := client.WorkflowBusinessState.Query().
				Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(tc.sourceID)).
				Only(ctx)
			if err != nil {
				t.Fatalf("query finished goods rework business state failed: %v", err)
			}
			if state.BusinessStatusKey != "qc_failed" ||
				state.OwnerRoleKey == nil ||
				*state.OwnerRoleKey != "production" ||
				state.BlockedReason == nil ||
				*state.BlockedReason != reason {
				t.Fatalf("unexpected finished goods rework business state %#v", state)
			}
			if state.Payload["decision"] != tc.status ||
				state.Payload["transition_status"] != tc.status ||
				state.Payload[tc.reasonKey] != reason ||
				state.Payload["finished_goods"] != true {
				t.Fatalf("expected decision payload on business state, got %#v", state.Payload)
			}

			reworkTasks, err := client.WorkflowTask.Query().
				Where(
					workflowtask.SourceType("production-progress"),
					workflowtask.SourceID(tc.sourceID),
					workflowtask.TaskGroup("finished_goods_rework"),
					workflowtask.OwnerRoleKey("production"),
				).
				All(ctx)
			if err != nil {
				t.Fatalf("query finished goods rework tasks failed: %v", err)
			}
			if len(reworkTasks) != 1 {
				t.Fatalf("expected one active rework task after repeated %s, got %d", tc.status, len(reworkTasks))
			}
			if reworkTasks[0].Payload["decision"] != tc.status ||
				reworkTasks[0].Payload["transition_status"] != tc.status ||
				reworkTasks[0].Payload[tc.reasonKey] != reason ||
				reworkTasks[0].Payload["finished_goods"] != true {
				t.Fatalf("expected decision payload on rework task, got %#v", reworkTasks[0].Payload)
			}

			createdEvents, err := client.WorkflowTaskEvent.Query().
				Where(workflowtaskevent.TaskID(reworkTasks[0].ID), workflowtaskevent.EventType("created")).
				All(ctx)
			if err != nil {
				t.Fatalf("query rework task events failed: %v", err)
			}
			if len(createdEvents) != 1 ||
				createdEvents[0].Payload["workflow_rule_key"] == "" {
				t.Fatalf("expected one rework created event with workflow rule payload, got %#v", createdEvents)
			}

			if _, err := repo.UpdateWorkflowTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            reworkTasks[0].ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{"done_by": "production"},
			}, 9, "production"); err != nil {
				t.Fatalf("complete rework task failed: %v", err)
			}

			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            qcTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "quality"); err != nil {
				t.Fatalf("next-round %s update failed: %v", tc.status, err)
			}

			count, err := client.WorkflowTask.Query().
				Where(
					workflowtask.SourceType("production-progress"),
					workflowtask.SourceID(tc.sourceID),
					workflowtask.TaskGroup("finished_goods_rework"),
					workflowtask.OwnerRoleKey("production"),
				).
				Count(ctx)
			if err != nil {
				t.Fatalf("count rework tasks failed: %v", err)
			}
			if count != tc.wantRounds {
				t.Fatalf("expected %s source task to produce %d rework round(s), got %d", tc.status, tc.wantRounds, count)
			}
		})
	}
}

func TestWorkflowRepo_FinishedGoodsQCBlockedThenRejectedReusesActiveReworkAndRefreshesPayload(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_finished_goods_qc_blocked_then_rejected?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewWorkflowUsecase(repo)
	qcTask := createFinishedGoodsQCTask(t, ctx, repo, 4701)

	blockedReason := "车缝开线待判责"
	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            qcTask.ID,
		TaskStatusKey: "blocked",
		Reason:        blockedReason,
		Payload:       map[string]any{},
	}, 8, "quality"); err != nil {
		t.Fatalf("blocked update failed: %v", err)
	}

	reworkTasks, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(4701),
			workflowtask.TaskGroup("finished_goods_rework"),
			workflowtask.OwnerRoleKey("production"),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query rework tasks failed: %v", err)
	}
	if len(reworkTasks) != 1 {
		t.Fatalf("expected one rework task after blocked, got %d", len(reworkTasks))
	}
	reworkTaskID := reworkTasks[0].ID

	rejectedReason := "复检尺寸偏差"
	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            qcTask.ID,
		TaskStatusKey: "rejected",
		Reason:        rejectedReason,
		Payload:       map[string]any{},
	}, 8, "quality"); err != nil {
		t.Fatalf("rejected update failed: %v", err)
	}

	reworkTasks, err = client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(4701),
			workflowtask.TaskGroup("finished_goods_rework"),
			workflowtask.OwnerRoleKey("production"),
		).
		All(ctx)
	if err != nil {
		t.Fatalf("query rework tasks after rejected failed: %v", err)
	}
	if len(reworkTasks) != 1 || reworkTasks[0].ID != reworkTaskID {
		t.Fatalf("expected active rework task to be reused, got %#v", reworkTasks)
	}
	if reworkTasks[0].Payload["decision"] != "rejected" ||
		reworkTasks[0].Payload["transition_status"] != "rejected" ||
		reworkTasks[0].Payload["rejected_reason"] != rejectedReason {
		t.Fatalf("expected reused active rework task to refresh rejected payload, got %#v", reworkTasks[0].Payload)
	}
	if _, ok := reworkTasks[0].Payload["blocked_reason"]; ok {
		t.Fatalf("expected reused active rework task to clear blocked_reason, got %#v", reworkTasks[0].Payload)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(4701)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query business state failed: %v", err)
	}
	if state.BusinessStatusKey != "qc_failed" ||
		state.Payload["decision"] != "rejected" ||
		state.Payload["transition_status"] != "rejected" ||
		state.Payload["rejected_reason"] != rejectedReason {
		t.Fatalf("expected latest rejected decision on business state, got %#v", state)
	}
	if _, ok := state.Payload["blocked_reason"]; ok {
		t.Fatalf("expected business state to clear blocked_reason, got %#v", state.Payload)
	}

	updatedQCTask, err := client.WorkflowTask.Get(ctx, qcTask.ID)
	if err != nil {
		t.Fatalf("query updated QC task failed: %v", err)
	}
	if updatedQCTask.TaskStatusKey != "rejected" ||
		updatedQCTask.Payload["decision"] != "rejected" ||
		updatedQCTask.Payload["rejected_reason"] != rejectedReason {
		t.Fatalf("expected latest rejected decision on QC task, got %#v", updatedQCTask)
	}
	if _, ok := updatedQCTask.Payload["blocked_reason"]; ok {
		t.Fatalf("expected rejected QC task payload to clear stale blocked_reason, got %#v", updatedQCTask.Payload)
	}

	createdEvents, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(reworkTaskID), workflowtaskevent.EventType("created")).
		All(ctx)
	if err != nil {
		t.Fatalf("query rework created events failed: %v", err)
	}
	if len(createdEvents) != 1 {
		t.Fatalf("expected one created event for reused active rework task, got %d", len(createdEvents))
	}
}

func TestWorkflowRepo_FinishedGoodsInboundDoneUpsertsBusinessStateOnly(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_finished_goods_inbound_done?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewWorkflowRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	uc := biz.NewWorkflowUsecase(repo)
	inboundTask := createFinishedGoodsInboundTask(t, ctx, repo, 4801, map[string]any{})

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            inboundTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
	}, 8, "warehouse"); err != nil {
		t.Fatalf("done update failed: %v", err)
	}

	state, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(4801)).
		Only(ctx)
	if err != nil {
		t.Fatalf("query finished goods inbound business state failed: %v", err)
	}
	if state.BusinessStatusKey != "inbound_done" ||
		state.OwnerRoleKey == nil ||
		*state.OwnerRoleKey != "warehouse" {
		t.Fatalf("unexpected finished goods inbound state %#v", state)
	}
	if state.Payload["inbound_task_id"] != float64(inboundTask.ID) && state.Payload["inbound_task_id"] != inboundTask.ID {
		t.Fatalf("expected inbound task id in state payload, got %#v", state.Payload)
	}
	if state.Payload["inbound_result"] != "done" ||
		state.Payload["finished_goods"] != true ||
		state.Payload["inventory_balance_deferred"] != true ||
		state.Payload["shipment_release_deferred"] != true ||
		state.Payload["decision"] != "done" ||
		state.Payload["transition_status"] != "done" {
		t.Fatalf("expected finished goods inbound done payload, got %#v", state.Payload)
	}

	taskCount, err := client.WorkflowTask.Query().
		Where(workflowtask.SourceType("production-progress"), workflowtask.SourceID(4801)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("finished goods inbound done must not create downstream tasks, got %d tasks", taskCount)
	}
	shipmentCount, err := client.WorkflowTask.Query().
		Where(
			workflowtask.SourceType("production-progress"),
			workflowtask.SourceID(4801),
			workflowtask.TaskGroup("shipment_release"),
		).
		Count(ctx)
	if err != nil {
		t.Fatalf("count shipment release tasks failed: %v", err)
	}
	if shipmentCount != 0 {
		t.Fatalf("finished goods inbound done must not derive shipment release, got %d", shipmentCount)
	}
	inventoryTxnCount, err := client.InventoryTxn.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count inventory txns failed: %v", err)
	}
	inventoryBalanceCount, err := client.InventoryBalance.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count inventory balances failed: %v", err)
	}
	inventoryLotCount, err := client.InventoryLot.Query().Count(ctx)
	if err != nil {
		t.Fatalf("count inventory lots failed: %v", err)
	}
	if inventoryTxnCount != 0 || inventoryBalanceCount != 0 || inventoryLotCount != 0 {
		t.Fatalf("finished goods inbound must not write inventory facts, got txns=%d balances=%d lots=%d", inventoryTxnCount, inventoryBalanceCount, inventoryLotCount)
	}

	events, err := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(inboundTask.ID)).
		Order(ent.Asc(workflowtaskevent.FieldID)).
		All(ctx)
	if err != nil {
		t.Fatalf("query events failed: %v", err)
	}
	if len(events) != 2 ||
		events[1].EventType != "status_changed" ||
		events[1].FromStatusKey == nil ||
		*events[1].FromStatusKey != "ready" ||
		events[1].ToStatusKey == nil ||
		*events[1].ToStatusKey != "done" ||
		events[1].Payload["shipment_release_deferred"] != true {
		t.Fatalf("expected finished goods inbound status event ready -> done, got %#v", events)
	}

	if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
		ID:            inboundTask.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"mobile_role_key": "warehouse"},
	}, 8, "warehouse"); err != nil {
		t.Fatalf("repeat done update failed: %v", err)
	}
	stateCount, err := client.WorkflowBusinessState.Query().
		Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(4801)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count business states failed: %v", err)
	}
	if stateCount != 1 {
		t.Fatalf("expected business state upsert to keep one row, got %d", stateCount)
	}
	taskCount, err = client.WorkflowTask.Query().
		Where(workflowtask.SourceType("production-progress"), workflowtask.SourceID(4801)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count repeated workflow tasks failed: %v", err)
	}
	if taskCount != 1 {
		t.Fatalf("repeated finished goods inbound done must not create downstream tasks, got %d tasks", taskCount)
	}
}

func TestWorkflowRepo_FinishedGoodsInboundBlockedAndRejectedPreserveReasonPayload(t *testing.T) {
	cases := []struct {
		status       string
		reasonKey    string
		staleKey     string
		sourceID     int
		initialState string
	}{
		{status: "blocked", reasonKey: "blocked_reason", staleKey: "rejected_reason", sourceID: 4901, initialState: "warehouse_inbound_pending"},
		{status: "rejected", reasonKey: "rejected_reason", staleKey: "blocked_reason", sourceID: 4902, initialState: "blocked"},
	}

	for _, tc := range cases {
		t.Run(tc.status, func(t *testing.T) {
			ctx := context.Background()
			client := enttest.Open(t, dialect.SQLite, "file:workflow_repo_finished_goods_inbound_"+tc.status+"?mode=memory&cache=shared&_fk=1")
			defer mustCloseEntClient(t, client)

			repo := NewWorkflowRepo(
				&Data{postgres: client},
				log.NewStdLogger(io.Discard),
			)
			uc := biz.NewWorkflowUsecase(repo)
			inboundTask := createFinishedGoodsInboundTask(t, ctx, repo, tc.sourceID, map[string]any{
				tc.staleKey: "旧原因",
			})
			if inboundTask.BusinessStatusKey == nil || *inboundTask.BusinessStatusKey != tc.initialState {
				_, err := client.WorkflowTask.UpdateOneID(inboundTask.ID).
					SetBusinessStatusKey(tc.initialState).
					Save(ctx)
				if err != nil {
					t.Fatalf("prepare initial status failed: %v", err)
				}
			}

			reason := "成品入库数量待复核"
			if _, err := uc.UpdateTaskStatus(ctx, &biz.WorkflowTaskStatusUpdate{
				ID:            inboundTask.ID,
				TaskStatusKey: tc.status,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 8, "warehouse"); err != nil {
				t.Fatalf("%s update failed: %v", tc.status, err)
			}

			updatedTask, err := client.WorkflowTask.Get(ctx, inboundTask.ID)
			if err != nil {
				t.Fatalf("query updated inbound task failed: %v", err)
			}
			if updatedTask.TaskStatusKey != tc.status ||
				updatedTask.BlockedReason == nil ||
				*updatedTask.BlockedReason != reason {
				t.Fatalf("unexpected updated finished goods inbound task %#v", updatedTask)
			}
			if updatedTask.Payload["decision"] != tc.status ||
				updatedTask.Payload["transition_status"] != tc.status ||
				updatedTask.Payload[tc.reasonKey] != reason ||
				updatedTask.Payload["finished_goods"] != true {
				t.Fatalf("expected decision payload on inbound task, got %#v", updatedTask.Payload)
			}
			if _, ok := updatedTask.Payload[tc.staleKey]; ok {
				t.Fatalf("expected stale %s to be cleared, got %#v", tc.staleKey, updatedTask.Payload)
			}

			state, err := client.WorkflowBusinessState.Query().
				Where(workflowbusinessstate.SourceType("production-progress"), workflowbusinessstate.SourceID(tc.sourceID)).
				Only(ctx)
			if err != nil {
				t.Fatalf("query finished goods inbound business state failed: %v", err)
			}
			if state.BusinessStatusKey != "blocked" ||
				state.OwnerRoleKey == nil ||
				*state.OwnerRoleKey != "warehouse" ||
				state.BlockedReason == nil ||
				*state.BlockedReason != reason {
				t.Fatalf("unexpected finished goods inbound blocked state %#v", state)
			}
			if state.Payload["decision"] != tc.status ||
				state.Payload["transition_status"] != tc.status ||
				state.Payload[tc.reasonKey] != reason {
				t.Fatalf("expected reason payload on business state, got %#v", state.Payload)
			}
			if _, ok := state.Payload[tc.staleKey]; ok {
				t.Fatalf("expected business state stale %s to be cleared, got %#v", tc.staleKey, state.Payload)
			}

			taskCount, err := client.WorkflowTask.Query().
				Where(workflowtask.SourceType("production-progress"), workflowtask.SourceID(tc.sourceID)).
				Count(ctx)
			if err != nil {
				t.Fatalf("count workflow tasks failed: %v", err)
			}
			if taskCount != 1 {
				t.Fatalf("finished goods inbound %s must not create downstream tasks, got %d tasks", tc.status, taskCount)
			}

			events, err := client.WorkflowTaskEvent.Query().
				Where(workflowtaskevent.TaskID(inboundTask.ID)).
				Order(ent.Asc(workflowtaskevent.FieldID)).
				All(ctx)
			if err != nil {
				t.Fatalf("query finished goods inbound task events failed: %v", err)
			}
			if len(events) != 2 ||
				events[1].EventType != "status_changed" ||
				events[1].Reason == nil ||
				*events[1].Reason != reason ||
				events[1].Payload[tc.reasonKey] != reason {
				t.Fatalf("expected status event with reason payload, got %#v", events)
			}
		})
	}
}
