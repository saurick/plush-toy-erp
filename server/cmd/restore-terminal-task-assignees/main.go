package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"server/internal/data"
	"server/internal/devdbguard"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type backupOperation struct {
	ID, Status string
	Target     struct{ Key, SafeTarget string }
	Backup     struct {
		ID, SHA256, MigrationBefore, MigrationAfter string
		SizeBytes                                   int64
		RestoreVerified                             bool
		VerifiedAt                                  time.Time
	}
}

func verifiedBackup(directory, operationFile, safeTarget string) (data.TerminalAssigneeBackup, error) {
	var proof data.TerminalAssigneeBackup
	var op backupOperation
	contents, err := os.ReadFile(operationFile)
	if err != nil {
		return proof, fmt.Errorf("cannot read original migration operation")
	}
	if err = json.Unmarshal(contents, &op); err != nil {
		return proof, fmt.Errorf("invalid original migration operation")
	}
	if op.ID == "" || op.Status != "passed" || op.Target.Key != "shared-dev" || op.Target.SafeTarget != safeTarget ||
		!op.Backup.RestoreVerified || op.Backup.MigrationBefore >= "20261010185222" || op.Backup.MigrationAfter != "20261010185222" ||
		op.Backup.SizeBytes <= 0 || len(op.Backup.SHA256) != 64 || op.Backup.VerifiedAt.IsZero() {
		return proof, fmt.Errorf("operation must prove this target's verified backup before the responsibility migration")
	}
	var report struct {
		Environment, ReleaseID, BackupID string
		Backup                           struct {
			DatabaseBackupHash, MigrationVersion string
			DatabaseBackupSize                   int64
		}
		Restore struct{ RestoreTestStatus string }
	}
	contents, err = os.ReadFile(filepath.Join(directory, "backup-restore-report.json"))
	if err != nil {
		return proof, err
	}
	if err = json.Unmarshal(contents, &report); err != nil {
		return proof, err
	}
	if report.Environment != "shared-dev" || report.ReleaseID != "migration-"+op.ID || report.BackupID != op.Backup.ID ||
		report.Backup.DatabaseBackupHash != op.Backup.SHA256 || report.Backup.DatabaseBackupSize != op.Backup.SizeBytes ||
		report.Backup.MigrationVersion != op.Backup.MigrationBefore || report.Restore.RestoreTestStatus != "passed-temp-container" {
		return proof, fmt.Errorf("backup report does not match the original migration operation")
	}
	file := filepath.Join(directory, "database.dump")
	info, err := os.Lstat(file)
	if err != nil {
		return proof, err
	}
	if !info.Mode().IsRegular() || info.Size() != op.Backup.SizeBytes {
		return proof, fmt.Errorf("backup file size or type differs")
	}
	f, err := os.Open(file)
	if err != nil {
		return proof, err
	}
	hash := sha256.New()
	_, copyErr := io.Copy(hash, f)
	closeErr := f.Close()
	if copyErr != nil {
		return proof, copyErr
	}
	if closeErr != nil {
		return proof, closeErr
	}
	if hex.EncodeToString(hash.Sum(nil)) != op.Backup.SHA256 {
		return proof, fmt.Errorf("backup file checksum differs")
	}
	return data.TerminalAssigneeBackup{ID: op.Backup.ID, SHA256: op.Backup.SHA256, MigrationVersion: op.Backup.MigrationBefore, VerifiedAt: op.Backup.VerifiedAt}, nil
}

func validateTargets(targetDSN, historicalDSN string) (string, error) {
	if err := devdbguard.RequireLocalDevDSN("configs/dev", targetDSN, func(string) string { return "" }); err != nil {
		return "", err
	}
	t, err := pgconn.ParseConfig(targetDSN)
	if err != nil {
		return "", fmt.Errorf("invalid target connection")
	}
	h, err := pgconn.ParseConfig(historicalDSN)
	if err != nil {
		return "", fmt.Errorf("invalid restored backup connection")
	}
	shared := t.Host == devdbguard.CustomerConfigLocalTestHost && t.Port == devdbguard.CustomerConfigLocalTestPort && t.Database == "plush_erp"
	isolated := t.Host == "127.0.0.1" && strings.HasPrefix(t.Database, "plush_erp_ci_") && len(t.Fallbacks) == 0
	if !shared && !isolated {
		return "", fmt.Errorf("recovery only accepts the registered shared development database or a loopback disposable rehearsal")
	}
	if err = devdbguard.RequireLocalDevDSN("configs/dev", historicalDSN, func(string) string { return "" }); err != nil {
		return "", err
	}
	if h.Host != "127.0.0.1" || !strings.HasPrefix(h.Database, "plush_erp_ci_") || len(h.Fallbacks) != 0 {
		return "", fmt.Errorf("restore the original dump into a separate loopback disposable database")
	}
	if t.Host == h.Host && t.Port == h.Port && t.Database == h.Database {
		return "", fmt.Errorf("target and historical database must differ")
	}
	return fmt.Sprintf("host=%s port=%d database=%s", t.Host, t.Port, t.Database), nil
}

func run(ctx context.Context, args []string, out io.Writer, getenv func(string) string) error {
	flags := flag.NewFlagSet("restore-terminal-task-assignees", flag.ContinueOnError)
	directory := flags.String("backup-dir", "", "directory containing original database.dump and backup-restore-report.json")
	operation := flags.String("operation", "", "original passed migration operation JSON")
	apply := flags.Bool("apply", false, "commit verified assignment recovery; default rolls back")
	confirm := flags.String("confirm-backup-sha256", "", "exact original dump SHA-256 required for apply")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected positional arguments")
	}
	targetDSN, historicalDSN := getenv("POSTGRES_DSN"), getenv("RECOVERY_BACKUP_DSN")
	safeTarget, err := validateTargets(targetDSN, historicalDSN)
	if err != nil {
		return err
	}
	originalTarget := fmt.Sprintf("host=%s port=%d database=plush_erp", devdbguard.CustomerConfigLocalTestHost, devdbguard.CustomerConfigLocalTestPort)
	proof, err := verifiedBackup(*directory, *operation, originalTarget)
	if err != nil {
		return err
	}
	if *apply && *confirm != proof.SHA256 {
		return fmt.Errorf("apply requires exact --confirm-backup-sha256")
	}
	target, err := sql.Open("pgx", targetDSN)
	if err != nil {
		return fmt.Errorf("cannot open target")
	}
	defer func() { _ = target.Close() }()
	historical, err := sql.Open("pgx", historicalDSN)
	if err != nil {
		return fmt.Errorf("cannot open restored backup")
	}
	defer func() { _ = historical.Close() }()
	var database, identity, historicalIdentity string
	if err = target.QueryRowContext(ctx, `SELECT current_database(),system_identifier::text FROM pg_control_system()`).Scan(&database, &identity); err != nil {
		return fmt.Errorf("cannot verify target identity")
	}
	cfg, _ := pgconn.ParseConfig(targetDSN)
	if cfg.Host == devdbguard.CustomerConfigLocalTestHost {
		if err = devdbguard.RequireCustomerConfigLocalTestRuntime(targetDSN, database, identity); err != nil {
			return err
		}
	} else if database != cfg.Database || identity == devdbguard.CustomerConfigLocalTestSystemIdentifier {
		return fmt.Errorf("disposable target identity mismatch")
	}
	if err = historical.QueryRowContext(ctx, `SELECT system_identifier::text FROM pg_control_system()`).Scan(&historicalIdentity); err != nil || historicalIdentity == devdbguard.CustomerConfigLocalTestSystemIdentifier {
		return fmt.Errorf("restored backup must have an independent cluster identity")
	}
	result, err := data.RestoreTerminalTaskAssignees(ctx, target, historical, proof, *apply)
	if err != nil {
		return err
	}
	return json.NewEncoder(out).Encode(map[string]any{"target": safeTarget, "backup_id": proof.ID, "backup_sha256": proof.SHA256, "result": result})
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := run(ctx, os.Args[1:], os.Stdout, os.Getenv); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
