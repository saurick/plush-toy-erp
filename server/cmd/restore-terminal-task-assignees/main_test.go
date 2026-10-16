package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"server/internal/devdbguard"
)

func TestTerminalAssigneeRecoveryTargetBoundaries(t *testing.T) {
	history := "postgres://postgres@127.0.0.1:55499/plush_erp_ci_history?sslmode=disable"
	shared := "postgres://plush_dev_migrator@" + devdbguard.CustomerConfigLocalTestHost + ":5432/plush_erp?sslmode=disable"
	for _, tc := range []struct {
		name, target, historical string
		allow                    bool
	}{
		{"shared", shared, history, true},
		{"rehearsal", "postgres://postgres@127.0.0.1:55499/plush_erp_ci_target?sslmode=disable", history, true},
		{"customer test", "postgres://postgres@" + devdbguard.CustomerConfigLocalTestHost + ":5435/plush_erp?sslmode=disable", history, false},
		{"another database", "postgres://postgres@" + devdbguard.CustomerConfigLocalTestHost + ":5432/another?sslmode=disable", history, false},
		{"same database", history, history, false},
		{"shared as history", shared, shared, false},
		{"target override", shared + "&host=127.0.0.1", history, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := validateTargets(tc.target, tc.historical)
			if (err == nil) != tc.allow {
				t.Fatalf("allow=%v err=%v", tc.allow, err)
			}
		})
	}
}

func TestTerminalAssigneeRecoveryBackupEvidence(t *testing.T) {
	for _, mutation := range []string{"valid", "dump changed", "wrong target", "failed operation", "post migration", "wrong report"} {
		t.Run(mutation, func(t *testing.T) {
			dir := t.TempDir()
			dump := []byte("immutable backup fixture")
			sum := sha256.Sum256(dump)
			digest := hex.EncodeToString(sum[:])
			op := backupOperation{ID: "original-operation", Status: "passed"}
			op.Target.Key = "shared-dev"
			op.Target.SafeTarget = "expected-target"
			op.Backup.ID = "br-test-20261011"
			op.Backup.SHA256 = digest
			op.Backup.SizeBytes = int64(len(dump))
			op.Backup.RestoreVerified = true
			op.Backup.MigrationBefore = "20261006155051"
			op.Backup.MigrationAfter = "20261010185222"
			op.Backup.VerifiedAt = time.Date(2026, 10, 11, 1, 10, 47, 0, time.UTC)
			report := map[string]any{"environment": "shared-dev", "releaseId": "migration-" + op.ID, "backupId": op.Backup.ID, "backup": map[string]any{"databaseBackupHash": digest, "databaseBackupSize": len(dump), "migrationVersion": op.Backup.MigrationBefore}, "restore": map[string]any{"restoreTestStatus": "passed-temp-container"}}
			switch mutation {
			case "dump changed":
				dump = []byte("corrupted backup fixture")
			case "wrong target":
				op.Target.SafeTarget = "other-target"
			case "failed operation":
				op.Status = "failed"
			case "post migration":
				op.Backup.MigrationBefore = "20261010185222"
			case "wrong report":
				report["environment"] = "customer-test"
			}
			write := func(name string, v any) {
				t.Helper()
				b, err := json.Marshal(v)
				if err != nil {
					t.Fatal(err)
				}
				if err = os.WriteFile(filepath.Join(dir, name), b, 0600); err != nil {
					t.Fatal(err)
				}
			}
			write("operation.json", op)
			write("backup-restore-report.json", report)
			if err := os.WriteFile(filepath.Join(dir, "database.dump"), dump, 0600); err != nil {
				t.Fatal(err)
			}
			_, err := verifiedBackup(dir, filepath.Join(dir, "operation.json"), "expected-target")
			if (err == nil) != (mutation == "valid") {
				t.Fatalf("evidence accepted=%v err=%v", err == nil, err)
			}
		})
	}
}
