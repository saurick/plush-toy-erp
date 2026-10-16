package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func testTarget() targetDefinition {
	var t targetDefinition
	t.Key = "demo-133"
	t.Enabled = true
	t.Purpose = "project-demo-simulated"
	t.SSH.User = "root"
	t.SSH.ExpectedHostname = "fixture-host"
	t.Filesystem.Root = "/fixture/demo"
	t.Database.Name = "plush_erp_demo_v1"
	t.Database.MigrationLock = "/fixture/demo/run/atlas-migrate.lock"
	t.Runtime.Postgres.BindAddress = "127.0.0.1"
	t.Runtime.Postgres.HostPort = 55436
	return t
}

func TestCheckpointConnectionBoundaries(t *testing.T) {
	target := testTarget()
	dsn := "postgres://postgres@127.0.0.1:55436/plush_erp_demo_v1?sslmode=disable"
	history := "postgres://postgres@127.0.0.1:55499/plush_erp_ci_checkpoint?sslmode=disable"
	if _, _, err := validateDSNs(target, dsn, history); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ name, dsn, history string }{
		{"production", "postgres://postgres@127.0.0.1:55438/plush_erp_production?sslmode=disable", history},
		{"external", "postgres://postgres@192.0.2.1:55436/plush_erp_demo_v1?sslmode=disable", history},
		{"wrong user", "postgres://erp_app@127.0.0.1:55436/plush_erp_demo_v1?sslmode=disable", history},
		{"TLS fallback", "postgres://postgres@127.0.0.1:55436/plush_erp_demo_v1", history},
		{"non disposable backup", dsn, "postgres://postgres@127.0.0.1:55499/plush_erp?sslmode=disable"},
		{"same cluster port", dsn, "postgres://postgres@127.0.0.1:55436/plush_erp_ci_checkpoint?sslmode=disable"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, err := validateDSNs(target, tc.dsn, tc.history); err == nil {
				t.Fatal("unsafe target accepted")
			}
		})
	}
}

func TestCheckpointReadsRegisteredDemoOnly(t *testing.T) {
	target := testTarget()
	file := filepath.Join(t.TempDir(), "targets.json")
	for _, tc := range []struct {
		name      string
		targets   []targetDefinition
		wantError bool
	}{
		{"registered", []targetDefinition{target}, false},
		{"missing", nil, true},
		{"duplicate", []targetDefinition{target, target}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b, err := json.Marshal(map[string]any{"schemaVersion": "plush.deployment-target-registry/v1", "targets": tc.targets})
			if err != nil {
				t.Fatal(err)
			}
			if err = os.WriteFile(file, b, 0o600); err != nil {
				t.Fatal(err)
			}
			_, err = readTarget(file)
			if (err != nil) != tc.wantError {
				t.Fatalf("%v", err)
			}
		})
	}
}

func TestCheckpointRequiresOriginalVerifiedPreApplyBackup(t *testing.T) {
	target := testTarget()
	target.Filesystem.Root = t.TempDir()
	id := "ab1a3c42-b1bb-4133-ace2-8a1092cb08b5"
	alias := "pre-migration-f2cd0286ab29-" + id
	operationDir := filepath.Join(target.Filesystem.Root, "operations", id)
	backups := filepath.Join(target.Filesystem.Root, "backups")
	if err := os.MkdirAll(operationDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(backups, 0o700); err != nil {
		t.Fatal(err)
	}
	dump := []byte("synthetic checksum fixture")
	sum := sha256.Sum256(dump)
	hash := hex.EncodeToString(sum[:])
	file := filepath.Join(backups, alias+".dump")
	if err := os.WriteFile(file, dump, 0o600); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name            string
		apply, restored bool
		target, stage   string
		hash            string
		wantError       bool
	}{
		{"verified preapply failure", false, true, "demo-133", "migration_plan", hash, false},
		{"migration started", true, true, "demo-133", "migration_plan", hash, true},
		{"restore unproven", false, false, "demo-133", "migration_plan", hash, true},
		{"different target", false, true, "production-133", "migration_plan", hash, true},
		{"later failure", false, true, "demo-133", "compose_start", hash, true},
		{"checksum differs", false, true, "demo-133", "migration_plan", hex.EncodeToString(make([]byte, 32)), true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			value := map[string]any{"schemaVersion": "plush.remote-promotion-receipt/v5", "status": "not_proven", "operationId": id, "target": tc.target, "stage": tc.stage, "finishedAt": "2026-10-16T22:46:02Z", "migration": map[string]any{"applyStarted": tc.apply}, "rollbackPoint": map[string]any{"backupAlias": alias, "backupSha256": tc.hash, "backupSizeBytes": len(dump), "restoreChecked": tc.restored}}
			content, err := json.Marshal(value)
			if err != nil {
				t.Fatal(err)
			}
			if err = os.WriteFile(filepath.Join(operationDir, "receipt.json"), content, 0o600); err != nil {
				t.Fatal(err)
			}
			_, err = verifiedBackup(target, id)
			if (err != nil) != tc.wantError {
				t.Fatalf("%v", err)
			}
		})
	}
}

func TestCheckpointSerializesWithTheRegisteredMigrationLock(t *testing.T) {
	target := testTarget()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	directory := filepath.Join(root, "run")
	if err := os.Mkdir(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	target.Database.MigrationLock = filepath.Join(directory, "atlas-migrate.lock")
	first, err := lockMigration(target)
	if err != nil {
		t.Fatal(err)
	}
	if second, err := lockMigration(target); err == nil {
		_ = second.Close()
		t.Fatal("held migration lock accepted")
	}
	if err := first.Close(); err != nil {
		t.Fatal(err)
	}
	second, err := lockMigration(target)
	if err != nil {
		t.Fatal(err)
	}
	if err := second.Close(); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "linked-run")
	if err := os.Symlink(directory, link); err != nil {
		t.Fatal(err)
	}
	target.Database.MigrationLock = filepath.Join(link, "atlas-migrate.lock")
	if file, err := lockMigration(target); err == nil {
		_ = file.Close()
		t.Fatal("symbolic-link lock directory accepted")
	}
}
