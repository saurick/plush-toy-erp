package data

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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
