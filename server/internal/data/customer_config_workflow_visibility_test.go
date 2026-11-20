package data

import (
	"context"
	"fmt"
	"io"
	"testing"

	"server/internal/biz"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/go-kratos/kratos/v2/log"
)

func TestCustomerConfigRepoListWorkflowTaskAuthorizationRevisionsUsesBoundedBulkQueries(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	defer func() { _ = db.Close() }()
	repo := NewCustomerConfigRepo(&Data{sqldb: db}, log.NewStdLogger(io.Discard))

	mock.ExpectQuery(`(?s)SELECT customer_key, revision, status.*FROM customer_config_revisions.*status IN`).
		WithArgs(biz.DefaultCustomerKey, biz.CustomerConfigStatusActive, biz.CustomerConfigStatusSuperseded).
		WillReturnRows(sqlmock.NewRows([]string{"customer_key", "revision", "status"}).
			AddRow(biz.DefaultCustomerKey, "rev-b", biz.CustomerConfigStatusActive).
			AddRow(biz.DefaultCustomerKey, "rev-a", biz.CustomerConfigStatusSuperseded))
	mock.ExpectQuery(`(?s)SELECT config_revision, role_key, display_name, disabled, bundle_keys, revokes.*FROM role_profiles`).
		WithArgs(biz.DefaultCustomerKey).
		WillReturnRows(sqlmock.NewRows([]string{"config_revision", "role_key", "display_name", "disabled", "bundle_keys", "revokes"}).
			AddRow("rev-a", biz.WarehouseRoleKey, "仓库", false, []byte(`[]`), []byte(`[]`)).
			AddRow("rev-b", biz.WarehouseRoleKey, "仓库", false, []byte(`[]`), []byte(`[]`)).
			AddRow("published-only", biz.WarehouseRoleKey, "仓库", false, []byte(`[]`), []byte(`[]`)))
	mock.ExpectQuery(`(?s)SELECT config_revision, role_key, capability_key, scope_type, scope_value, constraints, enabled.*FROM access_entitlements`).
		WithArgs(biz.DefaultCustomerKey).
		WillReturnRows(sqlmock.NewRows([]string{"config_revision", "role_key", "capability_key", "scope_type", "scope_value", "constraints", "enabled"}).
			AddRow("rev-a", biz.WarehouseRoleKey, biz.PermissionWorkflowTaskRead, "customer", biz.DefaultCustomerKey, []byte(`{}`), true).
			AddRow("published-only", biz.WarehouseRoleKey, biz.PermissionWorkflowTaskRead, "customer", biz.DefaultCustomerKey, []byte(`{}`), true))
	mock.ExpectQuery(`(?s)SELECT config_revision, pool_key, role_key, user_id, strategy, priority, enabled.*FROM work_pool_memberships`).
		WithArgs(biz.DefaultCustomerKey).
		WillReturnRows(sqlmock.NewRows([]string{"config_revision", "pool_key", "role_key", "user_id", "strategy", "priority", "enabled"}).
			AddRow("rev-a", "warehouse", biz.WarehouseRoleKey, 7, "direct_user_pool", 0, true).
			AddRow("published-only", "warehouse", biz.WarehouseRoleKey, 7, "direct_user_pool", 0, true))

	revisions, err := repo.ListWorkflowTaskAuthorizationRevisions(context.Background(), biz.DefaultCustomerKey)
	if err != nil {
		t.Fatalf("list workflow authorization revisions: %v", err)
	}
	if len(revisions) != 2 || fmt.Sprint([]string{revisions[0].Revision, revisions[1].Revision}) != "[rev-a rev-b]" {
		t.Fatalf("revisions=%#v", revisions)
	}
	if len(revisions[0].RoleProfiles) != 1 || len(revisions[0].AccessEntitlements) != 1 || len(revisions[0].WorkPoolMemberships) != 1 {
		t.Fatalf("rev-a projection=%#v", revisions[0])
	}
	if len(revisions[1].RoleProfiles) != 1 || len(revisions[1].AccessEntitlements) != 0 || len(revisions[1].WorkPoolMemberships) != 0 {
		t.Fatalf("rev-b projection=%#v", revisions[1])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("bulk query expectations: %v", err)
	}
}
