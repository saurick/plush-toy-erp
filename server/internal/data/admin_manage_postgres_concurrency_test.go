package data

import (
	"context"
	"errors"
	"io"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/permission"

	"github.com/go-kratos/kratos/v2/log"
)

func TestAdminManagePostgresConcurrentRoleSettingsKeepsOneCompleteAggregate(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := &adminManageRepo{
		data: data,
		log:  log.NewHelper(log.NewStdLogger(io.Discard)),
	}
	suffix := strings.ToLower(postgresTestSuffix())
	roleKey := "role-settings-race-" + suffix
	operatorUsername := "role_settings_root_" + suffix

	operator, err := client.AdminUser.Create().
		SetUsername(operatorUsername).
		SetPasswordHash("role-settings-test-hash").
		SetIsSuperAdmin(true).
		Save(ctx)
	if err != nil {
		t.Fatalf("create operator: %v", err)
	}
	roleRow, err := client.Role.Create().
		SetRoleKey(roleKey).
		SetName("岗位设置并发验证").
		Save(ctx)
	if err != nil {
		t.Fatalf("create role: %v", err)
	}

	permissionKeys := []string{
		biz.PermissionCustomerRead,
		biz.PermissionSupplierRead,
	}
	createdPermissionIDs := make([]int, 0, len(permissionKeys))
	for _, permissionKey := range permissionKeys {
		if _, queryErr := client.Permission.Query().
			Where(permission.PermissionKey(permissionKey)).
			Only(ctx); queryErr == nil {
			continue
		} else if !ent.IsNotFound(queryErr) {
			t.Fatalf("query permission %s: %v", permissionKey, queryErr)
		}
		definition, ok := biz.PermissionDefinitionByKey(permissionKey)
		if !ok {
			t.Fatalf("permission definition %s missing", permissionKey)
		}
		created, createErr := client.Permission.Create().
			SetPermissionKey(permissionKey).
			SetName(definition.Name).
			SetModule(definition.Module).
			SetAction(definition.Action).
			Save(ctx)
		if createErr != nil {
			t.Fatalf("create permission %s: %v", permissionKey, createErr)
		}
		createdPermissionIDs = append(createdPermissionIDs, created.ID)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cleanupCancel()
		statements := []struct {
			query string
			args  []any
		}{
			{
				query: `DELETE FROM runtime_audit_events
WHERE event_key = 'role.settings.set'
  AND payload::jsonb->'target'->>'key' = $1`,
				args: []any{roleKey},
			},
			{query: `DELETE FROM role_permissions WHERE role_id = $1`, args: []any{roleRow.ID}},
			{query: `DELETE FROM role_data_scopes WHERE role_id = $1`, args: []any{roleRow.ID}},
			{query: `DELETE FROM roles WHERE id = $1`, args: []any{roleRow.ID}},
			{query: `DELETE FROM admin_users WHERE id = $1`, args: []any{operator.ID}},
		}
		for _, statement := range statements {
			if _, cleanupErr := data.sqldb.ExecContext(cleanupCtx, statement.query, statement.args...); cleanupErr != nil {
				t.Errorf("cleanup role settings fixture: %v", cleanupErr)
			}
		}
		for _, permissionID := range createdPermissionIDs {
			if _, cleanupErr := data.sqldb.ExecContext(
				cleanupCtx,
				`DELETE FROM permissions WHERE id = $1`,
				permissionID,
			); cleanupErr != nil {
				t.Errorf("cleanup permission %d: %v", permissionID, cleanupErr)
			}
		}
	})

	changes := []*biz.RoleSettingsChangeCommand{
		{
			RoleKey:         roleKey,
			OperatorID:      operator.ID,
			ExpectedVersion: roleRow.Version,
			PermissionKeys:  []string{biz.PermissionCustomerRead},
			Scopes: []biz.RoleDataScope{{
				ResourceType: biz.DataScopeResourceWarehouse,
				Mode:         biz.DataScopeModeNone,
			}},
			Mode:               biz.RoleNavigationModeCustom,
			PrimaryMenuPaths:   []string{"/erp/master/partners/customers"},
			SecondaryMenuPaths: []string{"/erp/sales/project-orders/sales-orders"},
		},
		{
			RoleKey:         roleKey,
			OperatorID:      operator.ID,
			ExpectedVersion: roleRow.Version,
			PermissionKeys:  []string{biz.PermissionSupplierRead},
			Scopes: []biz.RoleDataScope{{
				ResourceType: biz.DataScopeResourceWarehouse,
				Mode:         biz.DataScopeModeAll,
			}},
			Mode: biz.RoleNavigationModeRecommended,
		},
	}

	type saveResult struct {
		index int
		role  *biz.AdminRole
		err   error
	}
	start := make(chan struct{})
	results := make(chan saveResult, len(changes))
	var wg sync.WaitGroup
	for index, change := range changes {
		index, change := index, change
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			updated, updateErr := repo.SetRoleSettingsWithAudit(ctx, change)
			results <- saveResult{index: index, role: updated, err: updateErr}
		}()
	}
	close(start)
	wg.Wait()
	close(results)

	successCount := 0
	conflictCount := 0
	winnerIndex := -1
	for result := range results {
		switch {
		case result.err == nil:
			successCount++
			winnerIndex = result.index
			if result.role == nil || result.role.Version != roleRow.Version+1 {
				t.Fatalf("winner role = %#v", result.role)
			}
		case errors.Is(result.err, biz.ErrRoleVersionConflict):
			conflictCount++
		default:
			t.Fatalf("concurrent role settings save: %v", result.err)
		}
	}
	if successCount != 1 || conflictCount != 1 || winnerIndex < 0 {
		t.Fatalf(
			"role settings success/conflict/winner = %d/%d/%d, want 1/1/non-negative",
			successCount,
			conflictCount,
			winnerIndex,
		)
	}

	persisted, err := repo.GetRoleByKey(ctx, roleKey)
	if err != nil {
		t.Fatalf("read persisted role settings: %v", err)
	}
	winner := changes[winnerIndex]
	if persisted.Version != roleRow.Version+1 ||
		!slices.Equal(persisted.Permissions, winner.PermissionKeys) ||
		len(persisted.DataScopes) != 1 ||
		persisted.DataScopes[0].Mode != winner.Scopes[0].Mode ||
		persisted.NavigationMode != winner.Mode ||
		!slices.Equal(persisted.PrimaryMenuPaths, winner.PrimaryMenuPaths) ||
		!slices.Equal(persisted.SecondaryMenuPaths, winner.SecondaryMenuPaths) {
		t.Fatalf("persisted role settings mixed across writers: %#v; winner=%#v", persisted, winner)
	}

	var auditCount int
	if err := data.sqldb.QueryRowContext(ctx, `
SELECT count(*)
FROM runtime_audit_events
WHERE event_key = 'role.settings.set'
  AND payload::jsonb->'target'->>'key' = $1`, roleKey).Scan(&auditCount); err != nil {
		t.Fatalf("count role settings audit events: %v", err)
	}
	if auditCount != 1 {
		t.Fatalf("role settings audit count = %d, want 1", auditCount)
	}

	t.Logf("role settings aggregate winner = writer-%d", winnerIndex+1)
}
