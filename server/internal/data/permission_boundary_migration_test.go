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
