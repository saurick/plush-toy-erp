//go:build attachmentintegration

package attachmentmigration

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
	"server/internal/attachmentstore"
)

func TestMigrationIntegration(t *testing.T) {
	if os.Getenv("ATTACHMENT_STORAGE_INTEGRATION") != "1" {
		t.Fatal("requires isolated PostgreSQL and S3")
	}
	dsn := os.Getenv("ATTACHMENT_MIGRATION_TEST_DSN")
	u, err := url.Parse(dsn)
	if err != nil || u.Hostname() != "127.0.0.1" || u.Path != "/plush_erp_attachment_drill" {
		t.Fatal("isolated drill database required")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	paths, err := filepath.Glob("../data/model/migrate/*.sql")
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(paths)
	previous := ""
	for _, p := range paths {
		v := strings.Split(filepath.Base(p), "_")[0]
		if v < "20260911062305" {
			previous = v
		}
	}
	migrationDir, err := filepath.Abs("../data/model/migrate")
	if err != nil {
		t.Fatal(err)
	}
	apply := func(target, version, proof string) error {
		args := []string{"migrate", "apply", "--dir", "file://" + migrationDir, "--url", target, "--tx-mode", "all"}
		if version != "" {
			args = append(args, "--to-version", version)
		}
		cmd := exec.CommandContext(ctx, "atlas", args...)
		cmd.Env = append(os.Environ(), "PGOPTIONS="+proof, "GIT_OPTIONAL_LOCKS=0")
		out, err := cmd.CombinedOutput()
		if err != nil && !strings.Contains(string(out), "division by zero") {
			t.Log(string(out))
		}
		return err
	}
	if err := apply(dsn, previous, ""); err != nil {
		t.Fatal("old schema migration:", err)
	}
	content := []byte("migration fixture with private evidence")
	sum := sha256.Sum256(content)
	digest := hex.EncodeToString(sum[:])
	insert := func() {
		_, err := db.ExecContext(ctx, `INSERT INTO business_attachments (owner_type,owner_id,attachment_type,file_name,mime_type,file_size,sha256,content,created_at) VALUES ('workflow_task',1,'evidence','fixture.pdf','application/pdf',$1,$2,$3,now())`, len(content), digest, content)
		if err != nil {
			t.Fatal(err)
		}
	}
	insert()
	if err := apply(dsn, "", ""); err == nil {
		t.Fatal("migration removed content without export proof")
	}
	c := attachmentstore.ConfigFromEnv()
	store, err := attachmentstore.New(c)
	if err != nil {
		t.Fatal(err)
	}
	inspect := func() Manifest {
		m, err := Inspect(ctx, db, "plush_erp_attachment_drill")
		if err != nil {
			t.Fatal(err)
		}
		return m
	}
	m := inspect()
	if !m.HasDatabaseContent || len(m.Files) != 1 {
		t.Fatal("failed migration did not preserve source")
	}
	m.StorageIdentity = StorageIdentity(c)
	m, err = Export(ctx, db, store, m)
	if err != nil {
		t.Fatal(err)
	}
	receipt := filepath.Join(t.TempDir(), "receipt.json")
	if err := WriteManifest(receipt, m); err != nil {
		t.Fatal(err)
	}
	proof := "-c plush.attachment_export_sha256=" + m.Fingerprint
	insert()
	if err := apply(dsn, "", proof); err == nil {
		t.Fatal("stale export proof accepted")
	}
	m = inspect()
	if !m.HasDatabaseContent || len(m.Files) != 2 {
		t.Fatal("stale proof did not retain bytes")
	}
	// Include withdrawn evidence in the export and preserve its audit columns.
	if _, err := db.ExecContext(ctx, `UPDATE business_attachments SET withdrawn_at=now(),withdrawn_by=1,withdrawal_reason='fixture withdrawal' WHERE id=$1`, m.Files[1].ID); err != nil {
		t.Fatal(err)
	}
	m, err = Export(ctx, db, store, m)
	if err != nil {
		t.Fatal(err)
	}
	m, err = Export(ctx, db, store, m)
	if err != nil {
		t.Fatal("replay:", err)
	}
	if err := apply(dsn, "", "-c plush.attachment_export_sha256="+m.Fingerprint); err != nil {
		t.Fatal("verified upgrade:", err)
	}
	after := inspect()
	if after.HasDatabaseContent || !SameFiles(m, after) {
		t.Fatal("migration changed identity or retained database bytes")
	}
	if err := Verify(ctx, store, after); err != nil {
		t.Fatal(err)
	}
	var withdrawn int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM business_attachments WHERE withdrawn_at IS NOT NULL AND withdrawal_reason='fixture withdrawal'`).Scan(&withdrawn); err != nil || withdrawn != 1 {
		t.Fatal("withdrawal audit lost")
	}
	// Restore portable files into an empty bucket; keys remain valid for the same metadata.
	backupDir := filepath.Join(t.TempDir(), "backup")
	if err := Backup(ctx, store, after, backupDir); err != nil {
		t.Fatal(err)
	}
	c.Bucket = "plush-attachment-restore"
	destination, err := attachmentstore.New(c)
	if err != nil {
		t.Fatal(err)
	}
	if err := Restore(ctx, destination, after, backupDir); err != nil {
		t.Fatal(err)
	}
	if err := Verify(ctx, destination, after); err != nil {
		t.Fatal(err)
	}
	// A new environment applies the entire chain without requiring an export receipt.
	if _, err := db.ExecContext(ctx, `CREATE DATABASE plush_erp_attachment_fresh`); err != nil {
		t.Fatal(err)
	}
	freshURL := *u
	freshURL.Path = "/plush_erp_attachment_fresh"
	if err := apply(freshURL.String(), "", ""); err != nil {
		t.Fatal("fresh migration:", err)
	}
	t.Log("fresh schema, upgrade guard, stale receipt rejection, immutable export replay, withdrawal audit and cross-bucket restore passed")
}
