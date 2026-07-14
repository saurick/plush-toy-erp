package data

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/adminsession"
	"server/internal/data/model/ent/adminuser"
	"server/internal/data/model/ent/adminuserrole"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/rolepermission"
	"server/internal/data/model/ent/runtimeauditevent"

	"entgo.io/ent/dialect"
	_ "github.com/mattn/go-sqlite3"
)

type adminManageAtomicFixture struct {
	ctx              context.Context
	client           *ent.Client
	sqldb            *sql.DB
	repo             *adminManageRepo
	operator         *ent.AdminUser
	target           *ent.AdminUser
	salesRole        *ent.Role
	purchaseRole     *ent.Role
	readPermission   *ent.Permission
	createPermission *ent.Permission
}

func newAdminManageAtomicFixture(t *testing.T) adminManageAtomicFixture {
	t.Helper()
	ctx := context.Background()
	name := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	dsn := "file:" + name + "?mode=memory&cache=shared&_fk=1"
	client := enttest.Open(t, dialect.SQLite, dsn)
	sqldb, err := sql.Open("sqlite3", dsn)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = sqldb.Close() })

	operator := client.AdminUser.Create().
		SetUsername("atomic_root").
		SetPasswordHash("root-hash").
		SetIsSuperAdmin(true).
		SaveX(ctx)
	target := client.AdminUser.Create().
		SetUsername("atomic_target").
		SetPasswordHash("target-hash").
		SaveX(ctx)
	salesRole := client.Role.Create().
		SetRoleKey(biz.SalesRoleKey).
		SetName("业务").
		SaveX(ctx)
	purchaseRole := client.Role.Create().
		SetRoleKey(biz.PurchaseRoleKey).
		SetName("采购").
		SaveX(ctx)
	readPermission := client.Permission.Create().
		SetPermissionKey(biz.PermissionCustomerRead).
		SetName("查看客户").
		SetModule("masterdata").
		SetAction("read").
		SaveX(ctx)
	createPermission := client.Permission.Create().
		SetPermissionKey(biz.PermissionCustomerCreate).
		SetName("创建客户").
		SetModule("masterdata").
		SetAction("create").
		SaveX(ctx)
	client.AdminUserRole.Create().
		SetAdminUserID(target.ID).
		SetRoleID(salesRole.ID).
		SaveX(ctx)
	client.RolePermission.Create().
		SetRoleID(salesRole.ID).
		SetPermissionID(readPermission.ID).
		SaveX(ctx)

	return adminManageAtomicFixture{
		ctx:              ctx,
		client:           client,
		sqldb:            sqldb,
		repo:             &adminManageRepo{data: &Data{postgres: client, sqldb: sqldb, sqlDialect: dialect.SQLite}},
		operator:         operator,
		target:           target,
		salesRole:        salesRole,
		purchaseRole:     purchaseRole,
		readPermission:   readPermission,
		createPermission: createPermission,
	}
}

func TestAdminManageRepoControlPlaneMutationsCommitWithAudit(t *testing.T) {
	fx := newAdminManageAtomicFixture(t)
	if _, err := fx.repo.SetAdminRolesWithAudit(fx.ctx, &biz.AdminRolesChange{
		AdminID: fx.operator.ID, OperatorID: fx.operator.ID, RoleKeys: []string{biz.SalesRoleKey},
	}); !errors.Is(err, biz.ErrAdminSelfRoleChangeForbidden) {
		t.Fatalf("super self role change error = %v, want ErrAdminSelfRoleChangeForbidden", err)
	}
	limitedOperator := fx.client.AdminUser.Create().
		SetUsername("atomic_limited_operator").
		SetPasswordHash("limited-hash").
		SaveX(fx.ctx)
	fx.client.AdminUserRole.Create().
		SetAdminUserID(limitedOperator.ID).
		SetRoleID(fx.salesRole.ID).
		SaveX(fx.ctx)
	if _, err := fx.repo.SetRolePermissionsWithAudit(fx.ctx, &biz.RolePermissionsChange{
		RoleKey: biz.SalesRoleKey, OperatorID: limitedOperator.ID, ExpectedVersion: fx.salesRole.Version,
		PermissionKeys: []string{biz.PermissionCustomerCreate},
	}); !errors.Is(err, biz.ErrAdminSelfRolePermissionForbidden) {
		t.Fatalf("own business role permission change error = %v, want ErrAdminSelfRolePermissionForbidden", err)
	}

	created, err := fx.repo.CreateAdminWithAudit(fx.ctx, &biz.AdminCreateCommand{
		OperatorID: fx.operator.ID,
		Admin: &biz.AdminCreate{
			Username: "atomic_created", PasswordHash: "created-hash", RoleKeys: []string{biz.SalesRoleKey},
		},
	})
	if err != nil {
		t.Fatalf("CreateAdminWithAudit() error = %v", err)
	}
	assertAdminRoleKeys(t, created, []string{biz.SalesRoleKey})

	created, err = fx.repo.SetAdminRolesWithAudit(fx.ctx, &biz.AdminRolesChange{
		AdminID: created.ID, OperatorID: fx.operator.ID, RoleKeys: []string{biz.PurchaseRoleKey},
	})
	if err != nil {
		t.Fatalf("SetAdminRolesWithAudit() error = %v", err)
	}
	assertAdminRoleKeys(t, created, []string{biz.PurchaseRoleKey})

	updatedRole, err := fx.repo.SetRolePermissionsWithAudit(fx.ctx, &biz.RolePermissionsChange{
		RoleKey: biz.PurchaseRoleKey, OperatorID: fx.operator.ID, ExpectedVersion: fx.purchaseRole.Version,
		PermissionKeys: []string{biz.PermissionCustomerRead},
	})
	if err != nil {
		t.Fatalf("SetRolePermissionsWithAudit() error = %v", err)
	}
	if updatedRole.Version != fx.purchaseRole.Version+1 || len(updatedRole.Permissions) != 1 || updatedRole.Permissions[0] != biz.PermissionCustomerRead {
		t.Fatalf("unexpected updated role: %#v", updatedRole)
	}
	if _, err := fx.repo.SetRolePermissionsWithAudit(fx.ctx, &biz.RolePermissionsChange{
		RoleKey: biz.PurchaseRoleKey, OperatorID: fx.operator.ID, ExpectedVersion: fx.purchaseRole.Version,
		PermissionKeys: []string{biz.PermissionCustomerCreate},
	}); !errors.Is(err, biz.ErrRoleVersionConflict) {
		t.Fatalf("stale role version error = %v, want ErrRoleVersionConflict", err)
	}

	created, err = fx.repo.SetAdminPhoneWithAudit(fx.ctx, &biz.AdminPhoneChange{
		AdminID: created.ID, OperatorID: fx.operator.ID, Phone: "13800138000",
	})
	if err != nil {
		t.Fatalf("SetAdminPhoneWithAudit() error = %v", err)
	}
	if created.Phone != "13800138000" {
		t.Fatalf("phone = %q, want 13800138000", created.Phone)
	}
	phoneAudit := fx.client.RuntimeAuditEvent.Query().
		Where(runtimeauditevent.EventKey("admin_user.phone.set")).
		OnlyX(fx.ctx)
	if strings.Contains(phoneAudit.Payload, "13800138000") || !strings.Contains(phoneAudit.Payload, "138****8000") {
		t.Fatalf("phone audit must contain only masked phone: %s", phoneAudit.Payload)
	}

	now := time.Now()
	for _, sessionKey := range []string{"reset-active-1", "reset-active-2"} {
		fx.client.AdminSession.Create().
			SetSessionKey(sessionKey).
			SetAdminUserID(created.ID).
			SetAuthVersion(created.AuthVersion).
			SetIssuedAt(now.Add(-time.Minute)).
			SetExpiresAt(now.Add(time.Hour)).
			SaveX(fx.ctx)
	}
	expiredSession := fx.client.AdminSession.Create().
		SetSessionKey("reset-expired").
		SetAdminUserID(created.ID).
		SetAuthVersion(created.AuthVersion).
		SetIssuedAt(now.Add(-2 * time.Hour)).
		SetExpiresAt(now.Add(-time.Hour)).
		SaveX(fx.ctx)

	beforeResetVersion := created.AuthVersion
	created, err = fx.repo.ResetAdminPasswordWithAudit(fx.ctx, &biz.AdminPasswordReset{
		AdminID: created.ID, OperatorID: fx.operator.ID, PasswordHash: "created-hash-v2",
	})
	if err != nil {
		t.Fatalf("ResetAdminPasswordWithAudit() error = %v", err)
	}
	if created.AuthVersion != beforeResetVersion+1 {
		t.Fatalf("auth version after reset = %d, want %d", created.AuthVersion, beforeResetVersion+1)
	}
	for _, sessionKey := range []string{"reset-active-1", "reset-active-2"} {
		session := fx.client.AdminSession.Query().Where(adminsession.SessionKey(sessionKey)).OnlyX(fx.ctx)
		if session.RevokedAt == nil || session.RevokeReason == nil || *session.RevokeReason != adminSessionRevokeReasonPasswordReset {
			t.Fatalf("active session %q was not revoked by password reset: %#v", sessionKey, session)
		}
	}
	if session := fx.client.AdminSession.GetX(fx.ctx, expiredSession.ID); session.RevokedAt != nil || session.RevokeReason != nil {
		t.Fatalf("expired session must not be counted as active: %#v", session)
	}
	assertAdminAuditSessionRevocation(
		t,
		fx.client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey("admin_user.password.reset")).OnlyX(fx.ctx),
		2,
		adminSessionRevokeReasonPasswordReset,
		[]string{"reset-active-1", "reset-active-2", "reset-expired"},
	)

	disableSession := fx.client.AdminSession.Create().
		SetSessionKey("disable-active").
		SetAdminUserID(created.ID).
		SetAuthVersion(created.AuthVersion).
		SetIssuedAt(time.Now().Add(-time.Minute)).
		SetExpiresAt(time.Now().Add(time.Hour)).
		SaveX(fx.ctx)

	if _, _, err := fx.repo.ChangeAdminLifecycle(fx.ctx, &biz.AdminLifecycleChange{
		AdminID: created.ID, OperatorID: fx.operator.ID, Disabled: true, Reason: "临时停用",
	}); err != nil {
		t.Fatalf("ChangeAdminLifecycle() error = %v", err)
	}
	disabled := fx.client.AdminUser.GetX(fx.ctx, created.ID)
	if !disabled.Disabled || disabled.AuthVersion != created.AuthVersion+1 {
		t.Fatalf("unexpected disabled account: %#v", disabled)
	}
	revokedDisableSession := fx.client.AdminSession.GetX(fx.ctx, disableSession.ID)
	if revokedDisableSession.RevokedAt == nil || revokedDisableSession.RevokeReason == nil || *revokedDisableSession.RevokeReason != adminSessionRevokeReasonAccountDisabled {
		t.Fatalf("active session was not revoked by account disable: %#v", revokedDisableSession)
	}
	assertAdminAuditSessionRevocation(
		t,
		fx.client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey("admin_user.disabled.set")).OnlyX(fx.ctx),
		1,
		adminSessionRevokeReasonAccountDisabled,
		[]string{"disable-active"},
	)

	disableAuditCount := fx.client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey("admin_user.disabled.set")).CountX(fx.ctx)
	idempotentSnapshot, idempotentReleased, err := fx.repo.ChangeAdminLifecycle(fx.ctx, &biz.AdminLifecycleChange{
		AdminID: created.ID, OperatorID: fx.operator.ID, Disabled: true, Reason: "重复请求不应覆盖",
	})
	if err != nil {
		t.Fatalf("idempotent ChangeAdminLifecycle() error = %v", err)
	}
	idempotentDisabled := fx.client.AdminUser.GetX(fx.ctx, created.ID)
	if idempotentSnapshot == nil || !idempotentSnapshot.Disabled || idempotentSnapshot.StatusReason != "临时停用" || idempotentReleased != 0 {
		t.Fatalf("idempotent lifecycle result = admin=%#v released=%d", idempotentSnapshot, idempotentReleased)
	}
	if idempotentDisabled.AuthVersion != disabled.AuthVersion {
		t.Fatalf("idempotent disable auth version = %d, want %d", idempotentDisabled.AuthVersion, disabled.AuthVersion)
	}
	if count := fx.client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey("admin_user.disabled.set")).CountX(fx.ctx); count != disableAuditCount {
		t.Fatalf("idempotent disable audit count = %d, want %d", count, disableAuditCount)
	}

	for _, eventKey := range []string{
		"admin_user.create",
		"admin_user.roles.set",
		"role.permissions.set",
		"admin_user.phone.set",
		"admin_user.password.reset",
		"admin_user.disabled.set",
	} {
		if count := fx.client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey(eventKey)).CountX(fx.ctx); count != 1 {
			t.Fatalf("audit event %q count = %d, want 1", eventKey, count)
		}
	}
}

func TestAdminManageRepoRevokeCommitsSessionAuditAndTaskRelease(t *testing.T) {
	fx := newAdminManageAtomicFixture(t)
	now := time.Now()
	activeSessionKeys := []string{"revoke-active-1", "revoke-active-2"}
	for _, sessionKey := range activeSessionKeys {
		fx.client.AdminSession.Create().
			SetSessionKey(sessionKey).
			SetAdminUserID(fx.target.ID).
			SetAuthVersion(fx.target.AuthVersion).
			SetIssuedAt(now.Add(-time.Minute)).
			SetExpiresAt(now.Add(time.Hour)).
			SaveX(fx.ctx)
	}

	unfinishedTasks := []*ent.WorkflowTask{
		fx.client.WorkflowTask.Create().
			SetTaskCode("ATOMIC-REVOKE-READY").
			SetTaskGroup("sales").
			SetTaskName("待处理任务").
			SetSourceType("sales_order").
			SetSourceID(11).
			SetTaskStatusKey("ready").
			SetOwnerRoleKey(biz.SalesRoleKey).
			SetAssigneeID(fx.target.ID).
			SaveX(fx.ctx),
		fx.client.WorkflowTask.Create().
			SetTaskCode("ATOMIC-REVOKE-BLOCKED").
			SetTaskGroup("sales").
			SetTaskName("阻塞任务").
			SetSourceType("sales_order").
			SetSourceID(12).
			SetTaskStatusKey("blocked").
			SetOwnerRoleKey(biz.SalesRoleKey).
			SetAssigneeID(fx.target.ID).
			SaveX(fx.ctx),
	}
	terminalTask := fx.client.WorkflowTask.Create().
		SetTaskCode("ATOMIC-REVOKE-DONE").
		SetTaskGroup("sales").
		SetTaskName("已完成任务").
		SetSourceType("sales_order").
		SetSourceID(13).
		SetTaskStatusKey("done").
		SetOwnerRoleKey(biz.SalesRoleKey).
		SetAssigneeID(fx.target.ID).
		SaveX(fx.ctx)

	beforeAuthVersion := fx.target.AuthVersion
	updated, releasedTaskCount, err := fx.repo.ChangeAdminLifecycle(fx.ctx, &biz.AdminLifecycleChange{
		AdminID: fx.target.ID, OperatorID: fx.operator.ID, Disabled: true, Revoke: true, Reason: "员工离职",
	})
	if err != nil {
		t.Fatalf("ChangeAdminLifecycle(revoke) error = %v", err)
	}
	if updated == nil || updated.RevokedAt == nil || !updated.Disabled || updated.AuthVersion != beforeAuthVersion+1 {
		t.Fatalf("unexpected revoked account snapshot: %#v", updated)
	}
	if releasedTaskCount != len(unfinishedTasks) {
		t.Fatalf("released task count = %d, want %d", releasedTaskCount, len(unfinishedTasks))
	}

	for _, sessionKey := range activeSessionKeys {
		session := fx.client.AdminSession.Query().Where(adminsession.SessionKey(sessionKey)).OnlyX(fx.ctx)
		if session.RevokedAt == nil || session.RevokeReason == nil || *session.RevokeReason != adminSessionRevokeReasonAccountRevoked {
			t.Fatalf("active session %q was not revoked by account revoke: %#v", sessionKey, session)
		}
	}
	assertAdminAuditSessionRevocation(
		t,
		fx.client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey("admin_user.revoked")).OnlyX(fx.ctx),
		float64(len(activeSessionKeys)),
		adminSessionRevokeReasonAccountRevoked,
		activeSessionKeys,
	)

	for _, before := range unfinishedTasks {
		after := fx.client.WorkflowTask.GetX(fx.ctx, before.ID)
		if after.AssigneeID != nil || after.OwnerRoleKey != before.OwnerRoleKey || after.TaskStatusKey != before.TaskStatusKey || after.Version != before.Version+1 {
			t.Fatalf("unfinished task was not returned to its role pool: before=%#v after=%#v", before, after)
		}
	}
	terminalAfter := fx.client.WorkflowTask.GetX(fx.ctx, terminalTask.ID)
	if terminalAfter.AssigneeID == nil || *terminalAfter.AssigneeID != fx.target.ID || terminalAfter.Version != terminalTask.Version {
		t.Fatalf("terminal task must remain assigned and unchanged: before=%#v after=%#v", terminalTask, terminalAfter)
	}
}

func TestAdminManageRepoControlPlaneMutationsRollBackWhenAuditWriteFails(t *testing.T) {
	fx := newAdminManageAtomicFixture(t)
	rollbackSession := fx.client.AdminSession.Create().
		SetSessionKey("rollback-active").
		SetAdminUserID(fx.target.ID).
		SetAuthVersion(fx.target.AuthVersion).
		SetIssuedAt(time.Now().Add(-time.Minute)).
		SetExpiresAt(time.Now().Add(time.Hour)).
		SaveX(fx.ctx)
	task := fx.client.WorkflowTask.Create().
		SetTaskCode("ATOMIC-ROLLBACK-001").
		SetTaskGroup("sales").
		SetTaskName("待处理任务").
		SetSourceType("sales_order").
		SetSourceID(1).
		SetTaskStatusKey("ready").
		SetOwnerRoleKey(biz.SalesRoleKey).
		SetAssigneeID(fx.target.ID).
		SaveX(fx.ctx)
	if _, err := fx.sqldb.ExecContext(fx.ctx, `
CREATE TRIGGER reject_admin_control_audit
BEFORE INSERT ON runtime_audit_events
BEGIN
  SELECT RAISE(ABORT, 'forced audit failure');
END`); err != nil {
		t.Fatalf("create audit failure trigger: %v", err)
	}

	if _, err := fx.repo.CreateAdminWithAudit(fx.ctx, &biz.AdminCreateCommand{
		OperatorID: fx.operator.ID,
		Admin: &biz.AdminCreate{
			Username: "atomic_rolled_back", PasswordHash: "hash", RoleKeys: []string{biz.SalesRoleKey},
		},
	}); err == nil {
		t.Fatal("CreateAdminWithAudit() must fail when audit insert fails")
	}
	if exists := fx.client.AdminUser.Query().Where(adminuser.Username("atomic_rolled_back")).ExistX(fx.ctx); exists {
		t.Fatal("created account survived audit rollback")
	}

	if _, err := fx.repo.SetAdminRolesWithAudit(fx.ctx, &biz.AdminRolesChange{
		AdminID: fx.target.ID, OperatorID: fx.operator.ID, RoleKeys: []string{biz.PurchaseRoleKey},
	}); err == nil {
		t.Fatal("SetAdminRolesWithAudit() must fail when audit insert fails")
	}
	assignments := fx.client.AdminUserRole.Query().Where(adminuserrole.AdminUserID(fx.target.ID)).AllX(fx.ctx)
	if len(assignments) != 1 || assignments[0].RoleID != fx.salesRole.ID {
		t.Fatalf("role assignments survived failed transaction: %#v", assignments)
	}

	if _, err := fx.repo.SetRolePermissionsWithAudit(fx.ctx, &biz.RolePermissionsChange{
		RoleKey: biz.SalesRoleKey, OperatorID: fx.operator.ID, ExpectedVersion: fx.salesRole.Version,
		PermissionKeys: []string{biz.PermissionCustomerCreate},
	}); err == nil {
		t.Fatal("SetRolePermissionsWithAudit() must fail when audit insert fails")
	}
	roleAfterFailure := fx.client.Role.GetX(fx.ctx, fx.salesRole.ID)
	links := fx.client.RolePermission.Query().Where(rolepermission.RoleID(fx.salesRole.ID)).AllX(fx.ctx)
	if roleAfterFailure.Version != fx.salesRole.Version || len(links) != 1 || links[0].PermissionID != fx.readPermission.ID {
		t.Fatalf("role permission mutation survived audit rollback: role=%#v links=%#v", roleAfterFailure, links)
	}

	if _, err := fx.repo.SetAdminPhoneWithAudit(fx.ctx, &biz.AdminPhoneChange{
		AdminID: fx.target.ID, OperatorID: fx.operator.ID, Phone: "13900139000",
	}); err == nil {
		t.Fatal("SetAdminPhoneWithAudit() must fail when audit insert fails")
	}
	if phone := fx.client.AdminUser.GetX(fx.ctx, fx.target.ID).Phone; phone != nil {
		t.Fatalf("phone survived audit rollback: %q", *phone)
	}

	if _, err := fx.repo.ResetAdminPasswordWithAudit(fx.ctx, &biz.AdminPasswordReset{
		AdminID: fx.target.ID, OperatorID: fx.operator.ID, PasswordHash: "target-hash-v2",
	}); err == nil {
		t.Fatal("ResetAdminPasswordWithAudit() must fail when audit insert fails")
	}
	passwordAfterFailure := fx.client.AdminUser.GetX(fx.ctx, fx.target.ID)
	if passwordAfterFailure.PasswordHash != "target-hash" || passwordAfterFailure.AuthVersion != fx.target.AuthVersion {
		t.Fatalf("password reset survived audit rollback: %#v", passwordAfterFailure)
	}
	if sessionAfterFailure := fx.client.AdminSession.GetX(fx.ctx, rollbackSession.ID); sessionAfterFailure.RevokedAt != nil || sessionAfterFailure.RevokeReason != nil {
		t.Fatalf("session revocation survived failed password reset transaction: %#v", sessionAfterFailure)
	}

	if _, _, err := fx.repo.ChangeAdminLifecycle(fx.ctx, &biz.AdminLifecycleChange{
		AdminID: fx.target.ID, OperatorID: fx.operator.ID, Disabled: true, Revoke: true, Reason: "员工离职",
	}); err == nil {
		t.Fatal("ChangeAdminLifecycle() must fail when audit insert fails")
	}
	lifecycleAfterFailure := fx.client.AdminUser.GetX(fx.ctx, fx.target.ID)
	taskAfterFailure := fx.client.WorkflowTask.GetX(fx.ctx, task.ID)
	if lifecycleAfterFailure.Disabled || lifecycleAfterFailure.RevokedAt != nil || lifecycleAfterFailure.AuthVersion != fx.target.AuthVersion {
		t.Fatalf("lifecycle mutation survived audit rollback: %#v", lifecycleAfterFailure)
	}
	if taskAfterFailure.AssigneeID == nil || *taskAfterFailure.AssigneeID != fx.target.ID {
		t.Fatalf("task release survived audit rollback: %#v", taskAfterFailure)
	}
	if sessionAfterFailure := fx.client.AdminSession.GetX(fx.ctx, rollbackSession.ID); sessionAfterFailure.RevokedAt != nil || sessionAfterFailure.RevokeReason != nil {
		t.Fatalf("session revocation survived failed lifecycle transaction: %#v", sessionAfterFailure)
	}
	if count := fx.client.RuntimeAuditEvent.Query().CountX(fx.ctx); count != 0 {
		t.Fatalf("audit count = %d, want 0", count)
	}
}

func TestAdminManageRepoRejectsNonSuperMutationOfSystemRoleTargetAfterLock(t *testing.T) {
	fx := newAdminManageAtomicFixture(t)
	systemRole := fx.client.Role.Create().
		SetRoleKey(biz.AdminRoleKey).
		SetName("系统管理员").
		SaveX(fx.ctx)
	operator := fx.client.AdminUser.Create().
		SetUsername("atomic_system_operator").
		SetPasswordHash("operator-hash").
		SaveX(fx.ctx)
	for _, adminID := range []int{operator.ID, fx.target.ID} {
		fx.client.AdminUserRole.Create().
			SetAdminUserID(adminID).
			SetRoleID(systemRole.ID).
			SaveX(fx.ctx)
	}

	tests := []struct {
		name string
		run  func() error
	}{
		{
			name: "roles",
			run: func() error {
				_, err := fx.repo.SetAdminRolesWithAudit(fx.ctx, &biz.AdminRolesChange{
					AdminID: fx.target.ID, OperatorID: operator.ID, RoleKeys: []string{biz.PurchaseRoleKey},
				})
				return err
			},
		},
		{
			name: "phone",
			run: func() error {
				_, err := fx.repo.SetAdminPhoneWithAudit(fx.ctx, &biz.AdminPhoneChange{
					AdminID: fx.target.ID, OperatorID: operator.ID, Phone: "13800138000",
				})
				return err
			},
		},
		{
			name: "disable",
			run: func() error {
				_, _, err := fx.repo.ChangeAdminLifecycle(fx.ctx, &biz.AdminLifecycleChange{
					AdminID: fx.target.ID, OperatorID: operator.ID, Disabled: true, Reason: "临时停用",
				})
				return err
			},
		},
		{
			name: "revoke",
			run: func() error {
				_, _, err := fx.repo.ChangeAdminLifecycle(fx.ctx, &biz.AdminLifecycleChange{
					AdminID: fx.target.ID, OperatorID: operator.ID, Disabled: true, Revoke: true, Reason: "员工离职",
				})
				return err
			},
		},
		{
			name: "password",
			run: func() error {
				_, err := fx.repo.ResetAdminPasswordWithAudit(fx.ctx, &biz.AdminPasswordReset{
					AdminID: fx.target.ID, OperatorID: operator.ID, PasswordHash: "target-hash-v2",
				})
				return err
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.run(); !errors.Is(err, biz.ErrPrivilegedAdminTargetForbidden) {
				t.Fatalf("mutation error = %v, want ErrPrivilegedAdminTargetForbidden", err)
			}
		})
	}

	unchanged := fx.client.AdminUser.GetX(fx.ctx, fx.target.ID)
	if unchanged.Disabled || unchanged.RevokedAt != nil || unchanged.Phone != nil || unchanged.PasswordHash != "target-hash" {
		t.Fatalf("rejected system target mutation changed account: %#v", unchanged)
	}
	if count := fx.client.RuntimeAuditEvent.Query().CountX(fx.ctx); count != 0 {
		t.Fatalf("rejected system target mutations wrote %d audit events", count)
	}
}

func assertAdminAuditSessionRevocation(
	t *testing.T,
	event *ent.RuntimeAuditEvent,
	wantCount float64,
	wantReason string,
	forbiddenSessionKeys []string,
) {
	t.Helper()
	if event == nil {
		t.Fatal("missing runtime audit event")
	}
	if strings.Contains(event.Payload, "session_key") {
		t.Fatalf("audit payload exposes session_key: %s", event.Payload)
	}
	for _, sessionKey := range forbiddenSessionKeys {
		if strings.Contains(event.Payload, sessionKey) {
			t.Fatalf("audit payload exposes session key %q: %s", sessionKey, event.Payload)
		}
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(event.Payload), &payload); err != nil {
		t.Fatalf("decode audit payload: %v", err)
	}
	after, ok := payload["after"].(map[string]any)
	if !ok {
		t.Fatalf("audit payload missing after snapshot: %#v", payload)
	}
	if got := after["revoked_session_count"]; got != wantCount {
		t.Fatalf("revoked_session_count = %#v, want %v", got, wantCount)
	}
	if got := after["session_revoke_reason"]; got != wantReason {
		t.Fatalf("session_revoke_reason = %#v, want %q", got, wantReason)
	}
}

func TestAdminManageRepoListAdminsReturnsRBACLoadError(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:admin_list_rbac_error?mode=memory&cache=shared&_fk=1")
	client.AdminUser.Create().SetUsername("list_admin").SetPasswordHash("hash").SaveX(ctx)
	rbacDB, err := sql.Open("sqlite3", "file:admin_list_missing_rbac?mode=memory&cache=shared&_fk=1")
	if err != nil {
		t.Fatalf("open rbac sqlite: %v", err)
	}
	t.Cleanup(func() { _ = rbacDB.Close() })
	repo := &adminManageRepo{data: &Data{postgres: client, sqldb: rbacDB, sqlDialect: dialect.SQLite}}

	admins, err := repo.ListAdmins(ctx)
	if err == nil {
		t.Fatal("ListAdmins() must return RBAC load error")
	}
	if admins != nil {
		t.Fatalf("ListAdmins() returned partial identities: %#v", admins)
	}
}

func assertAdminRoleKeys(t *testing.T, admin *biz.AdminUser, want []string) {
	t.Helper()
	got := biz.AdminRoleKeys(admin)
	if len(got) != len(want) {
		t.Fatalf("role keys = %v, want %v", got, want)
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("role keys = %v, want %v", got, want)
		}
	}
}
