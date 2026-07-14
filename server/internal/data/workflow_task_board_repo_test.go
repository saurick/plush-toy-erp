package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/workflowtask"
	"server/internal/data/model/ent/workflowtaskevent"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func TestWorkflowRepo_GetWorkflowTaskBoardReturnsBoundedExclusiveLanes(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_task_board?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	snapshotAt := time.Date(2026, 7, 13, 12, 0, 0, 0, time.UTC)
	overdue := snapshotAt.Add(-time.Hour)
	dueSoon := snapshotAt.Add(time.Hour)
	dueBoundary := snapshotAt.Add(biz.WorkflowTaskBoardDueWindow)
	future := dueBoundary.Add(time.Hour)
	staleReason := "不应泄露的历史原因"

	fixtures := []biz.WorkflowTaskCreate{
		{TaskCode: "BOARD-A-1", TaskName: "常规待办一", SourceType: "alpha", TaskStatusKey: "ready", OwnerRoleKey: biz.SalesRoleKey, Payload: map[string]any{"record_title": "客户特殊款"}},
		{TaskCode: "BOARD-A-2", TaskName: "常规待办二", SourceType: "beta", TaskStatusKey: "ready", OwnerRoleKey: biz.SalesRoleKey, DueAt: &future},
		{TaskCode: "BOARD-A-3", TaskName: "常规待办三", SourceType: "gamma", TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, DueAt: &future},
		{TaskCode: "BOARD-E-1", TaskName: "阻塞任务", SourceType: "alpha", TaskStatusKey: "blocked", OwnerRoleKey: biz.SalesRoleKey, DueAt: &overdue, BlockedReason: &staleReason},
		{TaskCode: "BOARD-E-2", TaskName: "退回任务", SourceType: "beta", TaskStatusKey: "rejected", OwnerRoleKey: biz.SalesRoleKey, DueAt: &overdue, BlockedReason: &staleReason},
		{TaskCode: "BOARD-D-1", TaskName: "逾期待办", SourceType: "alpha", TaskStatusKey: "ready", OwnerRoleKey: biz.SalesRoleKey, DueAt: &overdue},
		{TaskCode: "BOARD-D-2", TaskName: "即将到期待办", SourceType: "beta", TaskStatusKey: "ready", OwnerRoleKey: biz.SalesRoleKey, DueAt: &dueSoon},
		{TaskCode: "BOARD-D-3", TaskName: "边界到期待办", SourceType: "gamma", TaskStatusKey: "ready", OwnerRoleKey: biz.QualityRoleKey, DueAt: &dueBoundary},
		{TaskCode: "BOARD-F-1", TaskName: "已完成任务", SourceType: "alpha", TaskStatusKey: "done", OwnerRoleKey: biz.SalesRoleKey, DueAt: &overdue, BlockedReason: &staleReason, Payload: map[string]any{"blocked_reason": staleReason, "rejected_reason": staleReason}},
		{TaskCode: "BOARD-F-2", TaskName: "已完成任务二", SourceType: "beta", TaskStatusKey: "done", OwnerRoleKey: biz.SalesRoleKey},
		{TaskCode: "BOARD-F-3", TaskName: "已完成任务三", SourceType: "gamma", TaskStatusKey: "done", OwnerRoleKey: biz.QualityRoleKey},
	}
	createdIDs := make(map[string]int, len(fixtures))
	for index := range fixtures {
		fixture := fixtures[index]
		fixture.TaskGroup = "board-test"
		fixture.SourceID = index + 1
		if fixture.Payload == nil {
			fixture.Payload = map[string]any{}
		}
		created, err := client.WorkflowTask.Create().
			SetTaskCode(fixture.TaskCode).
			SetTaskGroup(fixture.TaskGroup).
			SetTaskName(fixture.TaskName).
			SetSourceType(fixture.SourceType).
			SetSourceID(fixture.SourceID).
			SetTaskStatusKey(fixture.TaskStatusKey).
			SetOwnerRoleKey(fixture.OwnerRoleKey).
			SetNillableDueAt(fixture.DueAt).
			SetNillableBlockedReason(fixture.BlockedReason).
			SetPayload(fixture.Payload).
			Save(ctx)
		if err != nil {
			t.Fatalf("persist board fixture %s: %v", fixture.TaskCode, err)
		}
		createdIDs[fixture.TaskCode] = created.ID
	}

	board, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Limit: 2, SnapshotAt: snapshotAt})
	if err != nil {
		t.Fatalf("get board: %v", err)
	}
	if board.Total != 11 || board.Counts != (biz.WorkflowTaskBoardCounts{Actionable: 3, Exception: 1, Due: 3, Finished: 4}) {
		t.Fatalf("unexpected board total/counts total=%d counts=%#v", board.Total, board.Counts)
	}
	if len(board.Lanes) != 4 {
		t.Fatalf("overview must return four lanes, got %d", len(board.Lanes))
	}
	returned := 0
	for _, lane := range board.Lanes {
		if len(lane.Tasks) > 2 || lane.Limit != 2 || lane.Offset != 0 {
			t.Fatalf("lane %s is not bounded: %#v", lane.Key, lane)
		}
		returned += len(lane.Tasks)
		for _, task := range lane.Tasks {
			classified, classifyErr := biz.ClassifyWorkflowTaskBoardLane(task, snapshotAt)
			if classifyErr != nil || classified != lane.Key {
				t.Fatalf("task %s returned in lane %s, classified=%s err=%v", task.TaskCode, lane.Key, classified, classifyErr)
			}
			if task.TaskCode == "BOARD-F-1" {
				if task.BlockedReason != nil {
					t.Fatalf("finished projection leaked blocked reason %#v", task.BlockedReason)
				}
				if _, exists := task.Payload["blocked_reason"]; exists {
					t.Fatalf("finished projection leaked payload blocked reason %#v", task.Payload)
				}
				if _, exists := task.Payload["rejected_reason"]; exists {
					t.Fatalf("finished projection leaked payload rejected reason %#v", task.Payload)
				}
			}
		}
	}
	if returned > 8 {
		t.Fatalf("overview must not load all tasks, returned=%d", returned)
	}
	if got, want := board.SourceTypes, []string{"alpha", "beta", "gamma"}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("source types=%v, want %v", got, want)
	}
	historicalDone, err := repo.GetWorkflowTask(ctx, createdIDs["BOARD-F-1"])
	if err != nil {
		t.Fatalf("get historical done task: %v", err)
	}
	if historicalDone.BlockedReason != nil {
		t.Fatalf("historical done projection leaked blocked reason %#v", historicalDone.BlockedReason)
	}
	if _, exists := historicalDone.Payload["blocked_reason"]; exists {
		t.Fatalf("historical done projection leaked payload blocked reason %#v", historicalDone.Payload)
	}
	if _, exists := historicalDone.Payload["rejected_reason"]; exists {
		t.Fatalf("historical done projection leaked payload rejected reason %#v", historicalDone.Payload)
	}

	filtered, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Status: "ready", Limit: 5, SnapshotAt: snapshotAt})
	if err != nil {
		t.Fatalf("get filtered board: %v", err)
	}
	if filtered.Total != 6 || filtered.Counts.Actionable != 3 || filtered.Counts.Due != 3 {
		t.Fatalf("ready filter must apply before classification, total=%d counts=%#v", filtered.Total, filtered.Counts)
	}
	if fmt.Sprint(filtered.SourceTypes) != "[alpha beta gamma]" {
		t.Fatalf("status filter must not collapse visible source facets, got %v", filtered.SourceTypes)
	}
	keywordBoard, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Keyword: "客户特殊款", Limit: 5, SnapshotAt: snapshotAt})
	if err != nil || keywordBoard.Total != 1 || keywordBoard.Counts.Actionable != 1 {
		t.Fatalf("payload record title must remain searchable, board=%#v err=%v", keywordBoard, err)
	}
	facetFiltered, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Keyword: "客户特殊款", Status: "ready", Due: "noDue", SourceType: "alpha", Limit: 5, SnapshotAt: snapshotAt})
	if err != nil || facetFiltered.Total != 1 {
		t.Fatalf("get fully filtered board: board=%#v err=%v", facetFiltered, err)
	}
	if fmt.Sprint(facetFiltered.SourceTypes) != "[alpha beta gamma]" {
		t.Fatalf("keyword/status/due/source filters must not collapse visible source facets, got %v", facetFiltered.SourceTypes)
	}
	reasonBoard, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Keyword: staleReason, Limit: 5, SnapshotAt: snapshotAt})
	if err != nil || reasonBoard.Total != 2 || reasonBoard.Counts.Exception != 1 || reasonBoard.Counts.Finished != 1 {
		t.Fatalf("historical finished reasons must not affect search, board=%#v err=%v", reasonBoard, err)
	}

	focused, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{LaneKey: biz.WorkflowTaskBoardLaneFinished, Limit: 1, Offset: 1, SnapshotAt: snapshotAt})
	if err != nil {
		t.Fatalf("get focused board: %v", err)
	}
	if len(focused.Lanes) != 1 || focused.Lanes[0].Key != biz.WorkflowTaskBoardLaneFinished || focused.Lanes[0].Total != 4 || len(focused.Lanes[0].Tasks) != 1 {
		t.Fatalf("unexpected focused lane %#v", focused.Lanes)
	}
	if focused.Total != board.Total || focused.Counts != board.Counts || fmt.Sprint(focused.SourceTypes) != fmt.Sprint(board.SourceTypes) {
		t.Fatalf("focused page must retain complete summary, got %#v", focused)
	}
}

func TestWorkflowRepo_GetWorkflowTaskBoardAppliesVisibilityAndRejectsRemovedStatuses(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_task_board_visibility?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	snapshotAt := time.Date(2026, 7, 13, 12, 0, 0, 0, time.UTC)
	assigneeID := 42

	fixtures := []biz.WorkflowTaskCreate{
		{TaskCode: "BOARD-VISIBLE-ROLE", TaskName: "销售可见", SourceType: "sales-source", SourceID: 1, TaskStatusKey: "ready", OwnerRoleKey: biz.SalesRoleKey, Payload: map[string]any{}},
		{TaskCode: "BOARD-VISIBLE-ASSIGNEE", TaskName: "指派可见", SourceType: "assigned-source", SourceID: 2, TaskStatusKey: "ready", OwnerRoleKey: biz.FinanceRoleKey, AssigneeID: &assigneeID, Payload: map[string]any{}},
		{TaskCode: "BOARD-HIDDEN", TaskName: "不可见", SourceType: "hidden-source", SourceID: 3, TaskStatusKey: "ready", OwnerRoleKey: biz.FinanceRoleKey, Payload: map[string]any{}},
	}
	for index := range fixtures {
		fixture := fixtures[index]
		fixture.TaskGroup = "board-visibility"
		if _, err := repo.CreateWorkflowTask(ctx, &fixture, 7); err != nil {
			t.Fatalf("create fixture %s: %v", fixture.TaskCode, err)
		}
	}

	board, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{
		Limit:                5,
		VisibleOwnerRoleKeys: []string{biz.SalesRoleKey},
		VisibleAssigneeID:    &assigneeID,
		SnapshotAt:           snapshotAt,
	})
	if err != nil {
		t.Fatalf("get visible board: %v", err)
	}
	if board.Total != 2 || board.Counts.Actionable != 2 || fmt.Sprint(board.SourceTypes) != "[assigned-source sales-source]" {
		t.Fatalf("unexpected visible board total=%d counts=%#v sources=%v", board.Total, board.Counts, board.SourceTypes)
	}
	ownerFiltered, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{
		OwnerRoleKey:         biz.FinanceRoleKey,
		Limit:                5,
		VisibleOwnerRoleKeys: []string{biz.SalesRoleKey},
		VisibleAssigneeID:    &assigneeID,
		SnapshotAt:           snapshotAt,
	})
	if err != nil {
		t.Fatalf("get owner-filtered board: %v", err)
	}
	if ownerFiltered.Total != 1 || len(ownerFiltered.Lanes[0].Tasks) != 1 || ownerFiltered.Lanes[0].Tasks[0].TaskCode != "BOARD-VISIBLE-ASSIGNEE" {
		t.Fatalf("explicit owner filter must retain only self-assigned finance task, got %#v", ownerFiltered)
	}
	if fmt.Sprint(ownerFiltered.SourceTypes) != "[assigned-source]" {
		t.Fatalf("source facets must honor owner and self-assignee scope, got %v", ownerFiltered.SourceTypes)
	}

	for _, status := range []string{"pending", "processing", "cancelled", "closed"} {
		if _, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Status: status, Limit: 5, SnapshotAt: snapshotAt}); !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("removed status filter %q must be rejected, got %v", status, err)
		}
	}

	if _, err := client.WorkflowTask.Create().
		SetTaskCode("BOARD-UNKNOWN").
		SetTaskGroup("board-visibility").
		SetTaskName("未知状态").
		SetSourceType("sales-source").
		SetSourceID(4).
		SetTaskStatusKey("unknown").
		SetOwnerRoleKey(biz.SalesRoleKey).
		SetPayload(map[string]any{}).
		Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("unknown workflow task status must be rejected by schema, got %v", err)
	}
}

func TestWorkflowRepo_GetWorkflowTaskBoardCountsAllTasksBeyondPageLimit(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_task_board_478?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	snapshotAt := time.Date(2026, 7, 13, 12, 0, 0, 0, time.UTC)
	overdue := snapshotAt.Add(-time.Hour)
	future := snapshotAt.Add(biz.WorkflowTaskBoardDueWindow + time.Hour)

	type laneFixture struct {
		count  int
		status string
		dueAt  *time.Time
	}
	fixtures := []laneFixture{
		{count: 144, status: "ready", dueAt: &future},
		{count: 110, status: "blocked", dueAt: &overdue},
		{count: 143, status: "ready", dueAt: &overdue},
		{count: 80, status: "done", dueAt: &overdue},
		{count: 1, status: "rejected", dueAt: &overdue},
	}
	builders := make([]*ent.WorkflowTaskCreate, 0, 478)
	sequence := 0
	for _, fixture := range fixtures {
		for range fixture.count {
			sequence++
			builders = append(builders, client.WorkflowTask.Create().
				SetTaskCode(fmt.Sprintf("BOARD-478-%03d", sequence)).
				SetTaskGroup("board-capacity").
				SetTaskName(fmt.Sprintf("容量任务 %03d", sequence)).
				SetSourceType("capacity-source").
				SetSourceID(sequence).
				SetTaskStatusKey(fixture.status).
				SetOwnerRoleKey(biz.SalesRoleKey).
				SetNillableDueAt(fixture.dueAt).
				SetPayload(map[string]any{}))
		}
	}
	if _, err := client.WorkflowTask.CreateBulk(builders...).Save(ctx); err != nil {
		t.Fatalf("create 478 tasks: %v", err)
	}

	board, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Limit: 5, SnapshotAt: snapshotAt})
	if err != nil {
		t.Fatalf("get 478-task board: %v", err)
	}
	wantCounts := biz.WorkflowTaskBoardCounts{Actionable: 144, Exception: 110, Due: 143, Finished: 81}
	if board.Total != 478 || board.Counts != wantCounts {
		t.Fatalf("page limit must not cap board totals, total=%d counts=%#v", board.Total, board.Counts)
	}
	if board.Counts.Actionable+board.Counts.Exception+board.Counts.Due+board.Counts.Finished != board.Total {
		t.Fatalf("lane totals must exhaust total, board=%#v", board)
	}
	seen := map[int]struct{}{}
	returned := 0
	for _, lane := range board.Lanes {
		if len(lane.Tasks) != 5 {
			t.Fatalf("lane %s must return only its first five tasks, got %d", lane.Key, len(lane.Tasks))
		}
		lastID := int(^uint(0) >> 1)
		for _, task := range lane.Tasks {
			if task.ID >= lastID {
				t.Fatalf("lane %s paging order is not stable ID DESC: %d after %d", lane.Key, task.ID, lastID)
			}
			lastID = task.ID
			if _, exists := seen[task.ID]; exists {
				t.Fatalf("task id %d appeared in multiple lanes", task.ID)
			}
			seen[task.ID] = struct{}{}
			returned++
		}
	}
	if returned != 20 {
		t.Fatalf("overview must return 20 bounded tasks, got %d", returned)
	}
}

func TestWorkflowRepo_GetWorkflowTaskBoardUsesDistinctFacetAndBoundedQueries(t *testing.T) {
	ctx := context.Background()
	var (
		logMu sync.Mutex
		logs  []string
	)
	client := enttest.Open(
		t,
		dialect.SQLite,
		"file:workflow_task_board_query_shape?mode=memory&cache=shared&_fk=1",
		enttest.WithOptions(
			ent.Debug(),
			ent.Log(func(args ...any) {
				logMu.Lock()
				logs = append(logs, fmt.Sprint(args...))
				logMu.Unlock()
			}),
		),
	)
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	snapshotAt := time.Date(2026, 7, 13, 12, 0, 0, 0, time.UTC)
	overdue := snapshotAt.Add(-time.Hour)
	builders := []*ent.WorkflowTaskCreate{
		client.WorkflowTask.Create().SetTaskCode("BOARD-SHAPE-A").SetTaskGroup("shape").SetTaskName("常规").SetSourceType("same-source").SetSourceID(1).SetTaskStatusKey("ready").SetOwnerRoleKey(biz.SalesRoleKey).SetPayload(map[string]any{}),
		client.WorkflowTask.Create().SetTaskCode("BOARD-SHAPE-E").SetTaskGroup("shape").SetTaskName("异常").SetSourceType("same-source").SetSourceID(2).SetTaskStatusKey("blocked").SetOwnerRoleKey(biz.SalesRoleKey).SetPayload(map[string]any{}),
		client.WorkflowTask.Create().SetTaskCode("BOARD-SHAPE-D").SetTaskGroup("shape").SetTaskName("到期").SetSourceType("same-source").SetSourceID(3).SetTaskStatusKey("ready").SetOwnerRoleKey(biz.SalesRoleKey).SetDueAt(overdue).SetPayload(map[string]any{}),
		client.WorkflowTask.Create().SetTaskCode("BOARD-SHAPE-F").SetTaskGroup("shape").SetTaskName("结束").SetSourceType("same-source").SetSourceID(4).SetTaskStatusKey("done").SetOwnerRoleKey(biz.SalesRoleKey).SetPayload(map[string]any{}),
	}
	if _, err := client.WorkflowTask.CreateBulk(builders...).Save(ctx); err != nil {
		t.Fatalf("create query-shape fixtures: %v", err)
	}

	resetLogs := func() {
		logMu.Lock()
		logs = nil
		logMu.Unlock()
	}
	readLogs := func() []string {
		logMu.Lock()
		defer logMu.Unlock()
		return append([]string(nil), logs...)
	}
	assertQueryShape := func(t *testing.T, captured []string, maxSelects int) {
		t.Helper()
		selects := 0
		distinctSourceFacet := false
		for _, line := range captured {
			upper := strings.ToUpper(line)
			if strings.Contains(upper, "DRIVER.QUERY") && strings.Contains(upper, "SELECT") {
				selects++
			}
			if strings.Contains(upper, "SELECT DISTINCT") && strings.Contains(upper, "SOURCE_TYPE") {
				distinctSourceFacet = true
			}
		}
		if !distinctSourceFacet {
			t.Fatalf("source facet query must use SELECT DISTINCT, logs=%v", captured)
		}
		if selects > maxSelects {
			t.Fatalf("task board exceeded bounded SELECT count: got=%d max=%d logs=%v", selects, maxSelects, captured)
		}
	}

	resetLogs()
	if _, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{Limit: 5, SnapshotAt: snapshotAt}); err != nil {
		t.Fatalf("get overview query shape: %v", err)
	}
	assertQueryShape(t, readLogs(), 10)

	resetLogs()
	if _, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{LaneKey: biz.WorkflowTaskBoardLaneException, Limit: 20, SnapshotAt: snapshotAt}); err != nil {
		t.Fatalf("get focused query shape: %v", err)
	}
	assertQueryShape(t, readLogs(), 8)
}

func TestWorkflowPostgresTaskBoardCounts478AndKeepsCompletionReasonOnlyInEvent(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	snapshotAt := time.Date(2026, 7, 13, 12, 0, 0, 0, time.UTC)
	overdue := snapshotAt.Add(-time.Hour)
	future := snapshotAt.Add(biz.WorkflowTaskBoardDueWindow + time.Hour)
	suffix := postgresTestSuffix()
	sourceType := "board-capacity-" + strings.ToLower(suffix)
	reasonSource := sourceType + "-reason"
	projectionSource := sourceType + "-projection"
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		_, _ = data.sqldb.ExecContext(cleanupCtx, `DELETE FROM workflow_task_events WHERE task_id IN (SELECT id FROM workflow_tasks WHERE source_type IN ($1, $2, $3))`, sourceType, reasonSource, projectionSource)
		_, _ = data.sqldb.ExecContext(cleanupCtx, `DELETE FROM workflow_tasks WHERE source_type IN ($1, $2, $3)`, sourceType, reasonSource, projectionSource)
	})

	type laneFixture struct {
		count  int
		status string
		dueAt  *time.Time
	}
	fixtures := []laneFixture{
		{count: 144, status: "ready", dueAt: &future},
		{count: 110, status: "blocked", dueAt: &overdue},
		{count: 143, status: "ready", dueAt: &overdue},
		{count: 80, status: "done", dueAt: &overdue},
		{count: 1, status: "rejected", dueAt: &overdue},
	}
	builders := make([]*ent.WorkflowTaskCreate, 0, 478)
	sequence := 0
	for _, fixture := range fixtures {
		for range fixture.count {
			sequence++
			builders = append(builders, client.WorkflowTask.Create().
				SetTaskCode(fmt.Sprintf("WF-BOARD-%s-%03d", suffix, sequence)).
				SetTaskGroup("board-capacity").
				SetTaskName(fmt.Sprintf("PostgreSQL 容量任务 %03d", sequence)).
				SetSourceType(sourceType).
				SetSourceID(sequence).
				SetTaskStatusKey(fixture.status).
				SetOwnerRoleKey(biz.DebugOperatorRoleKey).
				SetNillableDueAt(fixture.dueAt).
				SetPayload(map[string]any{"record_title": "PostgreSQL 任务看板容量"}))
		}
	}
	if _, err := client.WorkflowTask.CreateBulk(builders...).Save(ctx); err != nil {
		t.Fatalf("create postgres 478-task fixture: %v", err)
	}

	board, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{OwnerRoleKey: biz.DebugOperatorRoleKey, SourceType: sourceType, Limit: 5, SnapshotAt: snapshotAt})
	if err != nil {
		t.Fatalf("get postgres task board: %v", err)
	}
	wantCounts := biz.WorkflowTaskBoardCounts{Actionable: 144, Exception: 110, Due: 143, Finished: 81}
	if board.Total != 478 || board.Counts != wantCounts {
		t.Fatalf("postgres board total/counts mismatch total=%d counts=%#v", board.Total, board.Counts)
	}
	if board.Counts.Actionable+board.Counts.Exception+board.Counts.Due+board.Counts.Finished != board.Total {
		t.Fatalf("postgres board lanes must exhaust total, board=%#v", board)
	}
	returned := 0
	for _, lane := range board.Lanes {
		returned += len(lane.Tasks)
	}
	if returned != 20 {
		t.Fatalf("postgres overview must stay bounded to 20 tasks, got %d", returned)
	}
	if len(board.SourceTypes) != 1 || board.SourceTypes[0] != sourceType {
		t.Fatalf("postgres source types must be SELECT DISTINCT, got %#v", board.SourceTypes)
	}

	projectionReason := "状态原因-" + suffix
	projectionBuilders := make([]*ent.WorkflowTaskCreate, 0, 5)
	for index, status := range []string{"done", "done", "done", "blocked", "rejected"} {
		projectionBuilders = append(projectionBuilders, client.WorkflowTask.Create().
			SetTaskCode(fmt.Sprintf("WF-BOARD-PROJECTION-%s-%d", suffix, index)).
			SetTaskGroup("board-status-reason-projection").
			SetTaskName("状态原因投影验证").
			SetSourceType(projectionSource).
			SetSourceID(index+1).
			SetTaskStatusKey(status).
			SetOwnerRoleKey(biz.AdminRoleKey).
			SetBlockedReason(projectionReason).
			SetPayload(map[string]any{"blocked_reason": projectionReason, "rejected_reason": projectionReason}))
	}
	if _, err := client.WorkflowTask.CreateBulk(projectionBuilders...).Save(ctx); err != nil {
		t.Fatalf("create postgres status reason fixtures: %v", err)
	}
	projectionBoard, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{SourceType: projectionSource, Limit: 5, SnapshotAt: snapshotAt})
	if err != nil {
		t.Fatalf("get postgres status projection board: %v", err)
	}
	if projectionBoard.Total != 5 || projectionBoard.Counts.Exception != 1 || projectionBoard.Counts.Finished != 4 {
		t.Fatalf("status reasons must not change lane classification, total=%d counts=%#v", projectionBoard.Total, projectionBoard.Counts)
	}
	projectionReasonBoard, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{SourceType: projectionSource, Keyword: projectionReason, Limit: 5, SnapshotAt: snapshotAt})
	if err != nil {
		t.Fatalf("search postgres status reason: %v", err)
	}
	if projectionReasonBoard.Total != 2 || projectionReasonBoard.Counts.Exception != 1 || projectionReasonBoard.Counts.Finished != 1 {
		t.Fatalf("status reason search must only match blocked/rejected tasks, total=%d counts=%#v", projectionReasonBoard.Total, projectionReasonBoard.Counts)
	}
	for _, lane := range projectionBoard.Lanes {
		for _, task := range lane.Tasks {
			if lane.Key == biz.WorkflowTaskBoardLaneFinished {
				if task.BlockedReason != nil {
					t.Fatalf("finished projection leaked blocked reason %#v", task.BlockedReason)
				}
				if _, exists := task.Payload["blocked_reason"]; exists {
					t.Fatalf("finished projection leaked payload blocked reason %#v", task.Payload)
				}
				if _, exists := task.Payload["rejected_reason"]; exists {
					t.Fatalf("finished projection leaked payload rejected reason %#v", task.Payload)
				}
			}
		}
	}

	reasonTask, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode:      "WF-BOARD-REASON-" + suffix,
		TaskGroup:     "board-completion-reason",
		TaskName:      "完成说明清理验证",
		SourceType:    reasonSource,
		SourceID:      workflowPostgresSourceID(),
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.SalesRoleKey,
		Payload:       map[string]any{},
	}, 7)
	if err != nil {
		t.Fatalf("create postgres completion task: %v", err)
	}
	completionReason := "资料已核对并完成"
	updated, err := repo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(reasonTask.ID, reasonTask.Version, "board-postgres-complete-"+suffix, &biz.WorkflowTaskStatusUpdate{
		ID:            reasonTask.ID,
		TaskStatusKey: "done",
		Reason:        completionReason,
		Payload: map[string]any{
			"blocked_reason":  "历史阻塞原因",
			"rejected_reason": "历史退回原因",
		},
	}), 8, biz.SalesRoleKey)
	if err != nil {
		t.Fatalf("complete postgres task: %v", err)
	}
	if updated.BlockedReason != nil {
		t.Fatalf("postgres completion projection leaked blocked reason %#v", updated.BlockedReason)
	}
	var persistedReason *string
	if err := data.sqldb.QueryRowContext(ctx, "SELECT blocked_reason FROM workflow_tasks WHERE id = $1", reasonTask.ID).Scan(&persistedReason); err != nil {
		t.Fatalf("read postgres blocked reason: %v", err)
	}
	if persistedReason != nil {
		t.Fatalf("postgres completion must clear blocked_reason, got %#v", persistedReason)
	}
	event, err := client.WorkflowTaskEvent.Query().
		Where(
			workflowtaskevent.TaskID(reasonTask.ID),
			workflowtaskevent.EventType("status_changed"),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("read postgres completion event: %v", err)
	}
	if event.Reason == nil || *event.Reason != completionReason {
		t.Fatalf("postgres status event must retain completion reason, got %#v", event.Reason)
	}
	stored, err := client.WorkflowTask.Query().Where(workflowtask.ID(reasonTask.ID)).Only(ctx)
	if err != nil {
		t.Fatalf("read postgres completion payload: %v", err)
	}
	projected := entWorkflowTaskToBiz(stored)
	if _, exists := projected.Payload["blocked_reason"]; exists {
		t.Fatalf("postgres completion projection leaked payload blocked reason %#v", projected.Payload)
	}
	if _, exists := projected.Payload["rejected_reason"]; exists {
		t.Fatalf("postgres completion projection leaked payload rejected reason %#v", projected.Payload)
	}
}
