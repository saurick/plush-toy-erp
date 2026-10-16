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
	"regexp"
	"strings"
	"syscall"
	"time"

	"server/internal/data"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type targetDefinition struct {
	Key, Purpose string
	Enabled      bool
	SSH          struct{ ExpectedHostname, User string }
	Filesystem   struct{ Root string }
	Database     struct{ Name, MigrationLock string }
	Runtime      struct {
		Postgres struct {
			BindAddress string
			HostPort    uint16
		}
	}
}

func readTarget(registry string) (targetDefinition, error) {
	var document struct {
		SchemaVersion string
		Targets       []targetDefinition
	}
	var target targetDefinition
	content, err := os.ReadFile(registry)
	if err != nil {
		return target, fmt.Errorf("cannot read deployment registry")
	}
	if err = json.Unmarshal(content, &document); err != nil || document.SchemaVersion != "plush.deployment-target-registry/v1" {
		return target, fmt.Errorf("invalid deployment registry")
	}
	for _, candidate := range document.Targets {
		if candidate.Key == "demo-133" {
			if target.Key != "" {
				return target, fmt.Errorf("duplicate demo target")
			}
			target = candidate
		}
	}
	if !target.Enabled || target.Purpose != "project-demo-simulated" || target.SSH.User != "root" || target.Runtime.Postgres.BindAddress != "127.0.0.1" || !filepath.IsAbs(target.Filesystem.Root) || target.Database.Name == "" || target.Runtime.Postgres.HostPort == 0 || target.Database.MigrationLock != filepath.Join(target.Filesystem.Root, "run", "atlas-migrate.lock") {
		return target, fmt.Errorf("registered simulated demo target is required")
	}
	return target, nil
}

func lockMigration(target targetDefinition) (*os.File, error) {
	parent := filepath.Dir(target.Database.MigrationLock)
	resolved, err := filepath.EvalSymlinks(parent)
	if err != nil || resolved != parent {
		return nil, fmt.Errorf("migration lock directory is unavailable or contains a symbolic link")
	}
	file, err := os.OpenFile(target.Database.MigrationLock, os.O_CREATE|os.O_RDWR|syscall.O_NOFOLLOW, 0o600)
	if err != nil {
		return nil, fmt.Errorf("cannot open registered migration lock")
	}
	info, statErr := file.Stat()
	if statErr != nil || !info.Mode().IsRegular() {
		_ = file.Close()
		return nil, fmt.Errorf("invalid migration lock file")
	}
	if err = syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("registered target migration lock is held")
	}
	return file, nil
}

func validateDSNs(target targetDefinition, targetDSN, historicalDSN string) (*pgconn.Config, *pgconn.Config, error) {
	t, err := pgconn.ParseConfig(targetDSN)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid target connection")
	}
	h, err := pgconn.ParseConfig(historicalDSN)
	if err != nil {
		return nil, nil, fmt.Errorf("invalid restored backup connection")
	}
	if t.Host != target.Runtime.Postgres.BindAddress || t.Port != target.Runtime.Postgres.HostPort || t.Database != target.Database.Name || t.User != "postgres" || len(t.Fallbacks) != 0 || t.TLSConfig != nil {
		return nil, nil, fmt.Errorf("target connection does not match the registered demo")
	}
	if h.Host != "127.0.0.1" || !strings.HasPrefix(h.Database, "plush_erp_ci_") || len(h.Fallbacks) != 0 || h.TLSConfig != nil || h.Port == t.Port {
		return nil, nil, fmt.Errorf("backup must be restored in an independent loopback disposable cluster")
	}
	return t, h, nil
}

func verifiedBackup(target targetDefinition, operationID string) (data.TerminalAssigneeBackup, error) {
	var proof data.TerminalAssigneeBackup
	if !regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$`).MatchString(operationID) {
		return proof, fmt.Errorf("valid promotion operation ID is required")
	}
	var receipt struct {
		SchemaVersion, Status, OperationID, Target, Stage string
		FinishedAt                                        time.Time
		Migration                                         struct{ ApplyStarted bool }
		RollbackPoint                                     struct {
			BackupAlias, BackupSHA256 string
			BackupSizeBytes           int64
			RestoreChecked            bool
		}
	}
	content, err := os.ReadFile(filepath.Join(target.Filesystem.Root, "operations", operationID, "receipt.json"))
	if err != nil {
		return proof, fmt.Errorf("cannot read original demo promotion receipt")
	}
	if err = json.Unmarshal(content, &receipt); err != nil {
		return proof, fmt.Errorf("invalid original promotion receipt")
	}
	backup := receipt.RollbackPoint
	if receipt.SchemaVersion != "plush.remote-promotion-receipt/v5" || receipt.OperationID != operationID || receipt.Target != target.Key || receipt.Status != "not_proven" || receipt.Stage != "migration_plan" || receipt.Migration.ApplyStarted || !backup.RestoreChecked || backup.BackupSizeBytes <= 0 || receipt.FinishedAt.IsZero() || !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(backup.BackupSHA256) || !regexp.MustCompile(`^pre-migration-[a-f0-9]{12}-`+regexp.QuoteMeta(operationID)+`$`).MatchString(backup.BackupAlias) {
		return proof, fmt.Errorf("receipt must prove a restored demo backup before migration apply")
	}
	file := filepath.Join(target.Filesystem.Root, "backups", backup.BackupAlias+".dump")
	info, err := os.Lstat(file)
	if err != nil || !info.Mode().IsRegular() || info.Size() != backup.BackupSizeBytes {
		return proof, fmt.Errorf("verified backup size or type differs")
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
	if hex.EncodeToString(hash.Sum(nil)) != backup.BackupSHA256 {
		return proof, fmt.Errorf("verified backup checksum differs")
	}
	return data.TerminalAssigneeBackup{ID: backup.BackupAlias, SHA256: backup.BackupSHA256, VerifiedAt: receipt.FinishedAt}, nil
}

func run(ctx context.Context, args []string, out io.Writer, getenv func(string) string) error {
	flags := flag.NewFlagSet("checkpoint-terminal-task-assignees", flag.ContinueOnError)
	registry := flags.String("registry", "", "immutable release deployment registry")
	operation := flags.String("operation-id", "", "demo promotion that proved backup restore before migration apply")
	actor := flags.Int("actor-id", 0, "enabled super administrator authorizing the maintenance receipt")
	apply := flags.Bool("apply", false, "commit checkpoints; default exercises writes and rolls back")
	confirm := flags.String("confirm-backup-sha256", "", "exact verified backup hash required for apply")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected arguments")
	}
	target, err := readTarget(*registry)
	if err != nil {
		return err
	}
	host, err := os.Hostname()
	if err != nil || host != target.SSH.ExpectedHostname || os.Geteuid() != 0 {
		return fmt.Errorf("run on the registered demo host as root")
	}
	targetDSN, historicalDSN := getenv("POSTGRES_DSN"), getenv("RECOVERY_BACKUP_DSN")
	tcfg, hcfg, err := validateDSNs(target, targetDSN, historicalDSN)
	if err != nil {
		return err
	}
	proof, err := verifiedBackup(target, *operation)
	if err != nil {
		return err
	}
	if *apply && *confirm != proof.SHA256 {
		return fmt.Errorf("apply requires exact --confirm-backup-sha256")
	}
	lock, err := lockMigration(target)
	if err != nil {
		return err
	}
	defer func() { _ = lock.Close() }()
	db, err := sql.Open("pgx", targetDSN)
	if err != nil {
		return fmt.Errorf("cannot open target")
	}
	defer func() { _ = db.Close() }()
	history, err := sql.Open("pgx", historicalDSN)
	if err != nil {
		return fmt.Errorf("cannot open restored backup")
	}
	defer func() { _ = history.Close() }()
	var targetName, historyName, targetIdentity, historyIdentity string
	if err = db.QueryRowContext(ctx, `SELECT current_database(),system_identifier::text FROM pg_control_system()`).Scan(&targetName, &targetIdentity); err != nil || targetName != tcfg.Database {
		return fmt.Errorf("cannot verify target runtime identity")
	}
	if err = history.QueryRowContext(ctx, `SELECT current_database(),system_identifier::text FROM pg_control_system()`).Scan(&historyName, &historyIdentity); err != nil || historyName != hcfg.Database || historyIdentity == targetIdentity {
		return fmt.Errorf("restored backup requires an independent cluster identity")
	}
	if err = history.QueryRowContext(ctx, `SELECT max(version) FROM atlas_schema_revisions.atlas_schema_revisions`).Scan(&proof.MigrationVersion); err != nil {
		return fmt.Errorf("cannot read restored backup migration")
	}
	result, err := data.CheckpointTerminalTaskAssignees(ctx, db, history, proof, *actor, *apply)
	if err != nil {
		return err
	}
	return json.NewEncoder(out).Encode(map[string]any{"target": target.Key, "backup_id": proof.ID, "backup_sha256": proof.SHA256, "migration_version": proof.MigrationVersion, "result": result})
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := run(ctx, os.Args[1:], os.Stdout, os.Getenv); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
