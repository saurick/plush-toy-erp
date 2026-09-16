package data

import (
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func TestFinancePurchaseReadMigrationPreservesRoleBoundaries(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("model", "migrate", "20260915160215_grant_finance_purchase_order_read.sql"))
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name           string
		roleType       string
		alreadyGranted bool
		disabled       bool
	}{
		{name: "existing default finance", roleType: "business_default"},
		{name: "already granted", roleType: "business_default", alreadyGranted: true},
		{name: "custom role is preserved", roleType: "custom"},
		{name: "disabled role stays disabled", roleType: "business_default", disabled: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db, err := sql.Open("sqlite3", ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				if err := db.Close(); err != nil {
					t.Errorf("close test database: %v", err)
				}
			})
			db.SetMaxOpenConns(1)
			_, err = db.Exec(`
CREATE TABLE roles (id integer PRIMARY KEY, role_key text UNIQUE, role_type text, version integer, disabled boolean, updated_at text);
CREATE TABLE permissions (id integer PRIMARY KEY, permission_key text UNIQUE);
CREATE TABLE role_permissions (role_id integer, permission_id integer, created_at text, PRIMARY KEY (role_id, permission_id));
INSERT INTO permissions VALUES (1, 'purchase.order.read'), (2, 'purchase.order.update'), (3, 'finance.payable.read');
INSERT INTO roles VALUES (2, 'finance_custom', 'custom', 11, false, 'unchanged'), (3, 'sales', 'business_default', 13, false, 'unchanged');
INSERT INTO role_permissions VALUES (1, 3, 'unchanged'), (2, 3, 'unchanged'), (3, 1, 'unchanged');`)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(`INSERT INTO roles VALUES (1, 'finance', ?, 7, ?, 'unchanged')`, tc.roleType, tc.disabled); err != nil {
				t.Fatal(err)
			}
			if tc.alreadyGranted {
				if _, err := db.Exec(`INSERT INTO role_permissions VALUES (1, 1, 'unchanged')`); err != nil {
					t.Fatal(err)
				}
			}
			for replay := 0; replay < 2; replay++ {
				if _, err := db.Exec(string(content)); err != nil {
					t.Fatalf("execute migration: %v", err)
				}
				wantVersion, wantBindings := 7, 3
				if tc.roleType == "business_default" && !tc.alreadyGranted {
					wantVersion++
				}
				if tc.roleType == "business_default" || tc.alreadyGranted {
					wantBindings++
				}
				var version, bindings, invalidBindings, changedOtherRoles int
				var disabled bool
				if err := db.QueryRow(`SELECT version, disabled FROM roles WHERE id = 1`).Scan(&version, &disabled); err != nil {
					t.Fatal(err)
				}
				if err := db.QueryRow(`SELECT count(*) FROM role_permissions`).Scan(&bindings); err != nil {
					t.Fatal(err)
				}
				if err := db.QueryRow(`SELECT count(*) FROM role_permissions WHERE permission_id = 2 OR (role_id = 2 AND permission_id = 1)`).Scan(&invalidBindings); err != nil {
					t.Fatal(err)
				}
				if err := db.QueryRow(`SELECT count(*) FROM roles WHERE id <> 1 AND updated_at <> 'unchanged'`).Scan(&changedOtherRoles); err != nil {
					t.Fatal(err)
				}
				if version != wantVersion || bindings != wantBindings || disabled != tc.disabled || invalidBindings != 0 || changedOtherRoles != 0 {
					t.Fatalf("replay %d: version=%d bindings=%d disabled=%t invalid=%d changedOtherRoles=%d", replay, version, bindings, disabled, invalidBindings, changedOtherRoles)
				}
			}
		})
	}
}

func TestPermissionBoundaryMigrationRemovesProcessRecoveryFromBusinessRoles(t *testing.T) {
	migrationPath := filepath.Join(
		"model",
		"migrate",
		"20260723155358_reconcile_permission_assignment_boundaries.sql",
	)
	content, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("read permission boundary migration: %v", err)
	}
	sql := string(content)
	for _, required := range []string{
		"permission_record.\"permission_key\" = 'process_runtime.recover'",
		"role_record.\"role_type\" <> 'system'",
		"DELETE FROM \"role_permissions\"",
		"EXISTS",
		"role_record.\"role_type\" = 'business_default'",
		"role_record.\"role_key\" = 'boss'",
		"\"version\" = role_record.\"version\" + 1",
	} {
		if !strings.Contains(sql, required) {
			t.Errorf("permission boundary migration missing %q", required)
		}
	}
	versionUpdateIndex := strings.Index(sql, "UPDATE \"roles\" AS role_record")
	bindingDeleteIndex := strings.Index(sql, "DELETE FROM \"role_permissions\" AS role_binding")
	if versionUpdateIndex < 0 || bindingDeleteIndex < 0 || versionUpdateIndex >= bindingDeleteIndex {
		t.Error("permission boundary migration must identify and version affected roles before deleting legacy bindings")
	}
}

func TestApprovalResponsibilityPermissionMigrationGrantsPersistedCandidates(t *testing.T) {
	migrationPath := filepath.Join(
		"model",
		"migrate",
		"20260731124000_grant_approval_responsibility_permissions.sql",
	)
	content, err := os.ReadFile(migrationPath)
	if err != nil {
		t.Fatalf("read approval responsibility permission migration: %v", err)
	}
	sql := string(content)
	for _, required := range []string{
		"role_record.\"role_type\" = 'business_default'",
		"permission_record.\"permission_key\" = 'workflow.task.approve'",
		"ON CONFLICT (\"role_id\", \"permission_id\") DO NOTHING",
		"RETURNING \"role_id\"",
		"\"version\" = \"version\" + 1",
		"WHERE \"id\" IN (SELECT \"role_id\" FROM inserted)",
	} {
		if !strings.Contains(sql, required) {
			t.Errorf("approval responsibility permission migration missing %q", required)
		}
	}

	rolesStart := strings.Index(sql, "WITH desired_roles(role_key) AS (")
	insertStart := strings.Index(sql, "inserted AS (")
	if rolesStart < 0 || insertStart < 0 || rolesStart >= insertStart {
		t.Fatal("approval responsibility permission migration must declare desired roles before inserting bindings")
	}
	desiredRoles := sql[rolesStart:insertStart]
	for _, roleKey := range []string{"sales", "purchase", "finance"} {
		if !strings.Contains(desiredRoles, "('"+roleKey+"')") {
			t.Errorf("approval responsibility permission migration missing role %q", roleKey)
		}
	}
	for _, roleKey := range []string{
		"boss",
		"warehouse",
		"quality",
		"pmc",
		"production",
		"engineering",
		"admin",
		"debug_operator",
	} {
		if strings.Contains(desiredRoles, "('"+roleKey+"')") {
			t.Errorf("approval responsibility permission migration must not broaden to role %q", roleKey)
		}
	}
	for _, forbidden := range []string{
		"DELETE FROM",
		"CREATE FUNCTION",
		"CREATE TRIGGER",
		"DROP ",
	} {
		if strings.Contains(sql, forbidden) {
			t.Errorf("approval responsibility permission migration contains forbidden operation %q", forbidden)
		}
	}
}
