package data

import (
	"context"
	"errors"
	"io"
	"reflect"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/permission"
	"server/internal/data/model/ent/role"
	"server/internal/data/model/ent/workflowtaskevent"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
)

func TestWorkflowRepo_ReassignsAndReturnsTaskToPoolWithReceipts(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_assignment_repo?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client, sqlDialect: dialect.SQLite}, log.NewStdLogger(io.Discard))
	uc := biz.NewWorkflowUsecase(repo)
	task := createWorkflowIdempotencyTestTask(t, ctx, repo, "ASSIGNMENT")
	target := createWorkflowAssignmentTarget(t, ctx, client, biz.QualityRoleKey, "quality_target", false)
	beforePayload := map[string]any{"record_title": "ASSIGNMENT"}

	assign := &biz.WorkflowTaskAssignment{
		ID:                     task.ID,
		ExpectedVersion:        task.Version,
		CommandKey:             "reassign_task",
		IdempotencyKey:         "workflow-assignment-receipt",
		TargetAssigneeID:       &target,
		Reason:                 "原处理人请假",
		RequiredOwnerRoleKey:   biz.QualityRoleKey,
		RequiredPermissionKeys: workflowAssignmentRequiredPermissions(),
		AuditEvent: &biz.RuntimeAuditEventCreate{
			EventType: "workflow_task_assignment",
			EventKey:  "workflow_task.reassign",
			Source:    "workflow",
			Payload:   map[string]any{"task_id": task.ID},
		},
	}
	assigned, err := uc.ReassignTask(ctx, assign, 7, biz.BossRoleKey)
	if err != nil {
		t.Fatalf("reassign task: %v", err)
	}
	if assigned.AssigneeID == nil || *assigned.AssigneeID != target {
		t.Fatalf("assigned target = %#v, want %d", assigned.AssigneeID, target)
	}
	if assigned.Version != task.Version+1 ||
		assigned.TaskStatusKey != task.TaskStatusKey ||
		assigned.OwnerRoleKey != task.OwnerRoleKey ||
		!reflect.DeepEqual(assigned.Payload, beforePayload) {
		t.Fatalf("assignment changed non-assignee fields: before=%#v after=%#v", task, assigned)
	}
	event, err := client.WorkflowTaskEvent.Query().
		Where(
			workflowtaskevent.TaskID(task.ID),
			workflowtaskevent.IdempotencyKey(assign.IdempotencyKey),
		).
		Only(ctx)
	if err != nil {
		t.Fatalf("read reassignment event: %v", err)
	}
	if event.EventType != "reassigned" ||
		event.FromStatusKey == nil ||
		event.ToStatusKey == nil ||
		*event.FromStatusKey != task.TaskStatusKey ||
		*event.ToStatusKey != task.TaskStatusKey ||
		event.Reason == nil ||
		*event.Reason != assign.Reason {
		t.Fatalf("unexpected reassignment event: %#v", event)
	}
	if count := client.RuntimeAuditEvent.Query().CountX(ctx); count != 1 {
		t.Fatalf("runtime audit count = %d, want 1", count)
	}

	replayedInput := *assign
	replayedInput.ExpectedVersion = 99
	replayed, err := uc.ReassignTask(ctx, &replayedInput, 7, biz.BossRoleKey)
	if err != nil || replayed.Version != assigned.Version {
		t.Fatalf("assignment receipt replay failed: task=%#v err=%v", replayed, err)
	}
	if count := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("reassigned")).
		CountX(ctx); count != 1 {
		t.Fatalf("replay wrote duplicate reassignment event, count=%d", count)
	}

	wrongPool := &biz.WorkflowTaskAssignment{
		ID:                     task.ID,
		ExpectedVersion:        assigned.Version,
		CommandKey:             "reassign_task",
		IdempotencyKey:         "workflow-assignment-wrong-pool",
		ReleaseToPool:          true,
		Reason:                 "错误岗位池不得接管",
		RequiredOwnerRoleKey:   biz.WarehouseRoleKey,
		RequiredPermissionKeys: workflowAssignmentRequiredPermissions(),
	}
	if _, err := uc.ReassignTask(ctx, wrongPool, 7, biz.BossRoleKey); !errors.Is(err, biz.ErrWorkflowAssigneeIneligible) {
		t.Fatalf("wrong owner pool error = %v, want ineligible", err)
	}

	release := &biz.WorkflowTaskAssignment{
		ID:                     task.ID,
		ExpectedVersion:        assigned.Version,
		CommandKey:             "reassign_task",
		IdempotencyKey:         "workflow-assignment-release-receipt",
		ReleaseToPool:          true,
		Reason:                 "改由岗位池重新认领",
		RequiredOwnerRoleKey:   biz.QualityRoleKey,
		RequiredPermissionKeys: workflowAssignmentRequiredPermissions(),
	}
	released, err := uc.ReassignTask(ctx, release, 7, biz.BossRoleKey)
	if err != nil {
		t.Fatalf("release assignment to pool: %v", err)
	}
	if released.AssigneeID != nil ||
		released.Version != assigned.Version+1 ||
		released.TaskStatusKey != task.TaskStatusKey ||
		released.OwnerRoleKey != task.OwnerRoleKey ||
		!reflect.DeepEqual(released.Payload, beforePayload) {
		t.Fatalf("release changed non-assignee fields: %#v", released)
	}
	if count := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("unassigned")).
		CountX(ctx); count != 1 {
		t.Fatalf("release event count = %d, want 1", count)
	}
}

func TestWorkflowRepo_ReassignmentRejectsIneligibleTargetAndRollsBackAuditFailure(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_assignment_rollback?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client, sqlDialect: dialect.SQLite}, log.NewStdLogger(io.Discard))
	uc := biz.NewWorkflowUsecase(repo)
	task := createWorkflowIdempotencyTestTask(t, ctx, repo, "ASSIGNMENT-ROLLBACK")
	disabledTarget := createWorkflowAssignmentTarget(t, ctx, client, biz.QualityRoleKey, "disabled_quality_target", true)
	in := &biz.WorkflowTaskAssignment{
		ID:                     task.ID,
		ExpectedVersion:        task.Version,
		CommandKey:             "reassign_task",
		IdempotencyKey:         "workflow-assignment-disabled",
		TargetAssigneeID:       &disabledTarget,
		Reason:                 "人员调整",
		RequiredOwnerRoleKey:   biz.QualityRoleKey,
		RequiredPermissionKeys: workflowAssignmentRequiredPermissions(),
	}
	if _, err := uc.ReassignTask(ctx, in, 7, biz.BossRoleKey); !errors.Is(err, biz.ErrWorkflowAssigneeIneligible) {
		t.Fatalf("disabled target error = %v, want ineligible", err)
	}
	persisted, err := repo.GetWorkflowTask(ctx, task.ID)
	if err != nil || persisted.AssigneeID != nil || persisted.Version != task.Version {
		t.Fatalf("ineligible target changed task: task=%#v err=%v", persisted, err)
	}

	activeTarget := createWorkflowAssignmentTarget(t, ctx, client, biz.QualityRoleKey, "active_quality_target", false)
	in.IdempotencyKey = "workflow-assignment-audit-rollback"
	in.TargetAssigneeID = &activeTarget
	in.AuditEvent = &biz.RuntimeAuditEventCreate{Source: "workflow"}
	if _, err := uc.ReassignTask(ctx, in, 7, biz.BossRoleKey); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("invalid audit error = %v, want bad param", err)
	}
	persisted, err = repo.GetWorkflowTask(ctx, task.ID)
	if err != nil || persisted.AssigneeID != nil || persisted.Version != task.Version {
		t.Fatalf("audit failure must roll back task: task=%#v err=%v", persisted, err)
	}
	if count := client.WorkflowTaskEvent.Query().
		Where(workflowtaskevent.TaskID(task.ID)).
		CountX(ctx); count != 1 {
		t.Fatalf("only the create event may remain after rollback, count=%d", count)
	}
}

func TestWorkflowRepo_ReassignmentRejectsPermissionsStitchedAcrossRoles(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:workflow_assignment_role_stitching?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewWorkflowRepo(&Data{postgres: client, sqlDialect: dialect.SQLite}, log.NewStdLogger(io.Discard))
	uc := biz.NewWorkflowUsecase(repo)
	task := createWorkflowIdempotencyTestTask(t, ctx, repo, "ASSIGNMENT-ROLE-STITCHING")

	ownerRole := createWorkflowAssignmentRoleWithPermissions(
		t,
		ctx,
		client,
		biz.QualityRoleKey,
		biz.PermissionWorkflowTaskRead,
	)
	otherRole := createWorkflowAssignmentRoleWithPermissions(
		t,
		ctx,
		client,
		biz.FinanceRoleKey,
		biz.PermissionWorkflowTaskUpdate,
		biz.PermissionWorkflowTaskComplete,
	)
	target, err := client.AdminUser.Create().
		SetUsername("cross_role_permission_target").
		SetPasswordHash("hash").
		Save(ctx)
	if err != nil {
		t.Fatalf("create cross-role assignment target: %v", err)
	}
	for _, roleID := range []int{ownerRole, otherRole} {
		if _, err := client.AdminUserRole.Create().
			SetAdminUserID(target.ID).
			SetRoleID(roleID).
			Save(ctx); err != nil {
			t.Fatalf("link cross-role assignment target role %d: %v", roleID, err)
		}
	}
	in := &biz.WorkflowTaskAssignment{
		ID:                     task.ID,
		ExpectedVersion:        task.Version,
		CommandKey:             "reassign_task",
		IdempotencyKey:         "workflow-assignment-role-stitching",
		TargetAssigneeID:       &target.ID,
		Reason:                 "不得跨岗位拼接办理资格",
		RequiredOwnerRoleKey:   biz.QualityRoleKey,
		RequiredPermissionKeys: workflowAssignmentRequiredPermissions(),
	}
	if _, err := uc.ReassignTask(ctx, in, 7, biz.BossRoleKey); !errors.Is(err, biz.ErrWorkflowAssigneeIneligible) {
		t.Fatalf("cross-role permission stitching error = %v, want ineligible", err)
	}
	persisted, err := repo.GetWorkflowTask(ctx, task.ID)
	if err != nil || persisted.AssigneeID != nil || persisted.Version != task.Version {
		t.Fatalf("cross-role permission stitching changed task: task=%#v err=%v", persisted, err)
	}
}

func createWorkflowAssignmentTarget(
	t *testing.T,
	ctx context.Context,
	client *ent.Client,
	roleKey string,
	username string,
	disabled bool,
) int {
	t.Helper()
	roleRow, err := client.Role.Query().Where(role.RoleKey(roleKey)).Only(ctx)
	var roleID int
	if ent.IsNotFound(err) {
		roleID = createWorkflowAssignmentRoleWithPermissions(
			t,
			ctx,
			client,
			roleKey,
			workflowAssignmentRequiredPermissions()...,
		)
	} else if err != nil {
		t.Fatalf("query assignment role: %v", err)
	} else {
		roleID = roleRow.ID
	}
	admin, err := client.AdminUser.Create().
		SetUsername(username).
		SetPasswordHash("hash").
		SetDisabled(disabled).
		Save(ctx)
	if err != nil {
		t.Fatalf("create assignment target: %v", err)
	}
	if _, err := client.AdminUserRole.Create().
		SetAdminUserID(admin.ID).
		SetRoleID(roleID).
		Save(ctx); err != nil {
		t.Fatalf("link assignment target role: %v", err)
	}
	return admin.ID
}

func createWorkflowAssignmentRoleWithPermissions(
	t *testing.T,
	ctx context.Context,
	client *ent.Client,
	roleKey string,
	permissionKeys ...string,
) int {
	t.Helper()
	roleRow, err := client.Role.Create().
		SetRoleKey(roleKey).
		SetName(roleKey).
		SetRoleType("business_default").
		Save(ctx)
	if err != nil {
		t.Fatalf("create assignment role %s: %v", roleKey, err)
	}
	for _, permissionKey := range permissionKeys {
		permissionRow, permissionErr := client.Permission.Query().
			Where(permission.PermissionKey(permissionKey)).
			Only(ctx)
		if ent.IsNotFound(permissionErr) {
			permissionRow, permissionErr = client.Permission.Create().
				SetPermissionKey(permissionKey).
				SetName(permissionKey).
				SetModule("workflow").
				SetAction("test").
				SetResource("task").
				Save(ctx)
		}
		if permissionErr != nil {
			t.Fatalf("ensure assignment permission %s: %v", permissionKey, permissionErr)
		}
		if _, linkErr := client.RolePermission.Create().
			SetRoleID(roleRow.ID).
			SetPermissionID(permissionRow.ID).
			Save(ctx); linkErr != nil {
			t.Fatalf("link assignment permission %s: %v", permissionKey, linkErr)
		}
	}
	return roleRow.ID
}

func workflowAssignmentRequiredPermissions() []string {
	return []string{
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskUpdate,
		biz.PermissionWorkflowTaskComplete,
	}
}
