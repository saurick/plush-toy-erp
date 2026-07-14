package data

import (
	"context"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func TestWorkflowTaskRevisionVisibilityScopesApplyBeforeListBoardAndRolePagination(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_task_revision_visibility?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	assigneeID := 42
	scope := &biz.WorkflowTaskVisibilityScope{
		StandaloneVisibleOwnerRoleKeys: []string{biz.SalesRoleKey},
		VisibleAssigneeID:              &assigneeID,
		RevisionRoleScopes: []biz.WorkflowTaskRevisionRoleScope{
			{
				ConfigRevision:       "rev-a",
				Status:               biz.CustomerConfigStatusSuperseded,
				VisibleOwnerRoleKeys: []string{biz.SalesRoleKey},
			},
			{
				ConfigRevision: "rev-b",
				Status:         biz.CustomerConfigStatusActive,
			},
			{
				ConfigRevision:       "published-only",
				Status:               biz.CustomerConfigStatusPublished,
				VisibleOwnerRoleKeys: []string{biz.SalesRoleKey},
			},
		},
	}

	fixtures := []struct {
		code       string
		ownerRole  string
		assigneeID *int
		revision   *string
		processID  *int
		nodeID     *int
		visible    bool
	}{
		{code: "STANDALONE-ROLE", ownerRole: biz.SalesRoleKey, visible: true},
		{code: "STANDALONE-ASSIGNEE", ownerRole: biz.FinanceRoleKey, assigneeID: &assigneeID, visible: true},
		{code: "REV-A-ROLE", ownerRole: biz.SalesRoleKey, revision: revisionPtr("rev-a"), visible: true},
		{code: "REV-B-HIDDEN-ROLE", ownerRole: biz.SalesRoleKey, revision: revisionPtr("rev-b")},
		{code: "REV-B-ASSIGNEE", ownerRole: biz.FinanceRoleKey, assigneeID: &assigneeID, revision: revisionPtr("rev-b"), visible: true},
		{code: "PUBLISHED-HIDDEN", ownerRole: biz.SalesRoleKey, assigneeID: &assigneeID, revision: revisionPtr("published-only")},
		{code: "UNKNOWN-HIDDEN", ownerRole: biz.SalesRoleKey, assigneeID: &assigneeID, revision: revisionPtr("unknown")},
	}
	visibleCodes := map[string]struct{}{}
	for index, fixture := range fixtures {
		processID := fixture.processID
		nodeID := fixture.nodeID
		if fixture.revision != nil {
			createdProcessID, createdNodeID := createWorkflowTaskRuntimeAnchorFixture(
				t, ctx, client, fmt.Sprintf("revision-visibility-%d", index), index+1,
			)
			processID = &createdProcessID
			nodeID = &createdNodeID
		}
		created, err := repo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
			TaskCode:              fixture.code,
			TaskGroup:             "revision-visibility",
			TaskName:              fixture.code,
			SourceType:            "revision-visibility",
			SourceID:              index + 1,
			TaskStatusKey:         "ready",
			OwnerRoleKey:          fixture.ownerRole,
			AssigneeID:            fixture.assigneeID,
			ConfigRevision:        fixture.revision,
			ProcessInstanceID:     processID,
			ProcessNodeInstanceID: nodeID,
			Payload:               map[string]any{},
		}, 7)
		if err != nil {
			t.Fatalf("create %s: %v", fixture.code, err)
		}
		if fixture.visible {
			visibleCodes[created.TaskCode] = struct{}{}
		}
	}

	page, total, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{
		Limit:           2,
		Offset:          1,
		VisibilityScope: scope,
	})
	if err != nil {
		t.Fatalf("list tasks: %v", err)
	}
	if total != len(visibleCodes) || len(page) != 2 {
		t.Fatalf("list count/page total=%d page=%d visible=%d", total, len(page), len(visibleCodes))
	}
	for _, task := range page {
		if _, ok := visibleCodes[task.TaskCode]; !ok {
			t.Fatalf("list returned unauthorized task %s", task.TaskCode)
		}
	}

	snapshotAt := time.Date(2026, 7, 14, 8, 0, 0, 0, time.UTC)
	board, err := repo.GetWorkflowTaskBoard(ctx, biz.WorkflowTaskBoardQuery{
		Limit:           2,
		VisibilityScope: scope,
		SnapshotAt:      snapshotAt,
	})
	if err != nil {
		t.Fatalf("task board: %v", err)
	}
	if board.Total != len(visibleCodes) || board.Counts.Actionable != len(visibleCodes) {
		t.Fatalf("board totals total=%d counts=%#v", board.Total, board.Counts)
	}
	if got := fmt.Sprint(board.SourceTypes); got != "[revision-visibility]" {
		t.Fatalf("board source facets = %s", got)
	}
	for _, lane := range board.Lanes {
		for _, task := range lane.Tasks {
			if _, ok := visibleCodes[task.TaskCode]; !ok {
				t.Fatalf("board returned unauthorized task %s", task.TaskCode)
			}
		}
	}

	roleCodes := map[string]struct{}{}
	beforeID := 0
	for {
		page, err := repo.ListWorkflowRoleTaskView(ctx, biz.WorkflowRoleTaskViewQuery{
			ViewKey:         biz.WorkflowRoleTaskViewTodo,
			RoleKey:         biz.SalesRoleKey,
			Limit:           1,
			BeforeID:        beforeID,
			SnapshotAt:      snapshotAt,
			VisibilityScope: scope,
		})
		if err != nil {
			t.Fatalf("role view page before_id=%d: %v", beforeID, err)
		}
		if len(page.Items) != 1 {
			t.Fatalf("role view page before_id=%d = %#v", beforeID, page)
		}
		roleCodes[page.Items[0].TaskCode] = struct{}{}
		if !page.HasMore {
			break
		}
		if page.NextID <= 0 || page.NextID == beforeID {
			t.Fatalf("role view cursor did not advance: before=%d page=%#v", beforeID, page)
		}
		beforeID = page.NextID
	}
	if len(roleCodes) != len(visibleCodes) {
		t.Fatalf("role view visible tasks = %#v, want %#v", roleCodes, visibleCodes)
	}
	for code := range visibleCodes {
		if _, ok := roleCodes[code]; !ok {
			t.Fatalf("role view omitted authorized task %s: %#v", code, roleCodes)
		}
	}
}

func TestWorkflowTaskRevisionVisibilityPredicateIsAppliedBeforeCountAndOffset(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_task_revision_visibility_count?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	builders := make([]*ent.WorkflowTaskCreate, 0, 12)
	for index := 0; index < 12; index++ {
		revision := "rev-a"
		if index%2 == 1 {
			revision = "rev-b"
		}
		processID, nodeID := createWorkflowTaskRuntimeAnchorFixture(
			t, ctx, client, fmt.Sprintf("revision-count-%d", index), index+1,
		)
		builders = append(builders, client.WorkflowTask.Create().
			SetTaskCode(fmt.Sprintf("COUNT-%02d", index)).
			SetTaskGroup("revision-count").
			SetTaskName("revision count").
			SetSourceType("revision-count").
			SetSourceID(index+1).
			SetTaskStatusKey("ready").
			SetOwnerRoleKey(biz.SalesRoleKey).
			SetConfigRevision(revision).
			SetProcessInstanceID(processID).
			SetProcessNodeInstanceID(nodeID).
			SetPayload(map[string]any{}))
	}
	if _, err := client.WorkflowTask.CreateBulk(builders...).Save(ctx); err != nil {
		t.Fatalf("create count fixtures: %v", err)
	}
	scope := &biz.WorkflowTaskVisibilityScope{RevisionRoleScopes: []biz.WorkflowTaskRevisionRoleScope{{
		ConfigRevision:       "rev-a",
		Status:               biz.CustomerConfigStatusSuperseded,
		VisibleOwnerRoleKeys: []string{biz.SalesRoleKey},
	}}}
	page, total, err := repo.ListWorkflowTasks(ctx, biz.WorkflowTaskFilter{Limit: 2, Offset: 4, VisibilityScope: scope})
	if err != nil {
		t.Fatalf("list count slice: %v", err)
	}
	if total != 6 || len(page) != 2 {
		t.Fatalf("visibility must apply before count/offset, total=%d page=%d", total, len(page))
	}
	for _, task := range page {
		if task.ConfigRevision == nil || *task.ConfigRevision != "rev-a" {
			t.Fatalf("cross-revision task leaked after offset: %#v", task)
		}
	}
}

func createWorkflowTaskRuntimeAnchorFixture(
	t *testing.T,
	ctx context.Context,
	client *ent.Client,
	key string,
	businessRefID int,
) (int, int) {
	t.Helper()
	instance, err := client.ProcessInstance.Create().
		SetProcessKey(key).
		SetProcessVersion("v1").
		SetConfigRevision("revision-visibility-fixture").
		SetDefinitionHash("sha256:" + key).
		SetBusinessRefType("revision-visibility").
		SetBusinessRefID(businessRefID).
		SetIdempotencyKey(key + ":v1").
		SetStatus(biz.ProcessStatusActive).
		Save(ctx)
	if err != nil {
		t.Fatalf("create process anchor %s: %v", key, err)
	}
	node, err := client.ProcessNodeInstance.Create().
		SetProcessInstanceID(instance.ID).
		SetNodeKey("workflow-task").
		SetNodeType(biz.ProcessNodeTypeHumanTask).
		SetAttempt(1).
		SetStatus(biz.ProcessNodeStatusWaiting).
		SetPolicySnapshot(map[string]any{}).
		Save(ctx)
	if err != nil {
		t.Fatalf("create process node anchor %s: %v", key, err)
	}
	return instance.ID, node.ID
}

func revisionPtr(value string) *string {
	return &value
}
