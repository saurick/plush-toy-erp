package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"server/internal/attachmentmigration"
	"server/internal/attachmentstore"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "attachment-storage:", err)
		os.Exit(1)
	}
}

func run() error {
	mode := flag.String("mode", "inventory", "inventory, check, export, verify, backup, restore")
	database := flag.String("database", "", "required exact connected database name")
	receipt := flag.String("receipt", "", "private export receipt path")
	dir := flag.String("dir", "", "private backup directory")
	execute := flag.Bool("execute", false, "perform the requested object writes")
	confirm := flag.String("confirm", "", "ATTACHMENT_<MODE>:<database>, after stopping related writers")
	pgOptions := flag.Bool("pg-options", false, "verify: output only the fresh Atlas export proof as PGOPTIONS")
	flag.Parse()
	if *mode != "inventory" && *mode != "check" && *mode != "export" && *mode != "verify" && *mode != "backup" && *mode != "restore" {
		return errors.New("invalid mode")
	}
	if *pgOptions && *mode != "verify" {
		return errors.New("-pg-options requires verify")
	}
	dsn := os.Getenv("POSTGRES_DSN")
	if dsn == "" || *database == "" {
		return errors.New("POSTGRES_DSN and -database are required")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return errors.New("cannot configure PostgreSQL")
	}
	defer func() { _ = db.Close() }()
	db.SetMaxOpenConns(2)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()
	m, err := attachmentmigration.Inspect(ctx, db, *database)
	if err != nil {
		return err
	}
	writeMode := *mode == "export" || *mode == "backup" || *mode == "restore"
	if *mode == "inventory" || (writeMode && !*execute) {
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"mode": *mode, "writes": 0, "database": m.Database, "count": len(m.Files), "bytes": m.Bytes, "hasDatabaseContent": m.HasDatabaseContent})
	}
	confirmations := map[string]string{"export": "ATTACHMENT_EXPORT:", "backup": "ATTACHMENT_BACKUP:", "restore": "ATTACHMENT_RESTORE:"}
	if writeMode && *confirm != confirmations[*mode]+m.Database {
		return errors.New("exact operation confirmation required; stop related writers first")
	}
	c := attachmentstore.ConfigFromEnv()
	objects, err := attachmentstore.New(c)
	if err != nil {
		return err
	}
	if err := objects.Check(ctx); err != nil {
		return err
	}
	m.StorageIdentity = attachmentmigration.StorageIdentity(c)
	switch *mode {
	case "export":
		if *receipt == "" {
			return errors.New("-receipt is required")
		}
		if _, err := os.Lstat(*receipt); !os.IsNotExist(err) {
			return errors.New("receipt must be a new file")
		}
		m, err = attachmentmigration.Export(ctx, db, objects, m)
		if err != nil {
			return err
		}
		if err := attachmentmigration.WriteManifest(*receipt, m); err != nil {
			return err
		}
	case "verify":
		if *receipt != "" {
			previous, err := attachmentmigration.ReadManifest(*receipt)
			if err != nil {
				return err
			}
			if previous.Database != m.Database || previous.StorageIdentity != m.StorageIdentity || !attachmentmigration.SameFiles(previous, m) {
				return errors.New("receipt does not match the current database, attachment set or object store")
			}
		} else if *pgOptions {
			return errors.New("-pg-options requires the original export receipt")
		}
		if err := attachmentmigration.Verify(ctx, objects, m); err != nil {
			return err
		}
		current, err := attachmentmigration.Inspect(ctx, db, m.Database)
		if err != nil || !attachmentmigration.SameFiles(m, current) {
			return errors.New("attachment set changed while verifying")
		}
		if *pgOptions {
			if !m.HasDatabaseContent {
				return errors.New("database already uses object storage")
			}
			fmt.Println("-c plush.attachment_export_sha256=" + m.Fingerprint)
			return nil
		}
	case "backup":
		if *dir == "" {
			return errors.New("-dir is required")
		}
		if err := attachmentmigration.Backup(ctx, objects, m, *dir); err != nil {
			return err
		}
	case "restore":
		if *dir == "" {
			return errors.New("-dir is required")
		}
		backup, err := attachmentmigration.ReadManifest(filepath.Join(*dir, "manifest.json"))
		if err != nil {
			return err
		}
		if !attachmentmigration.SameFiles(backup, m) {
			return errors.New("restore database does not match the object backup; restore its paired database first")
		}
		if err := attachmentmigration.Restore(ctx, objects, backup, *dir); err != nil {
			return err
		}
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]any{"mode": *mode, "result": "passed", "database": m.Database, "count": len(m.Files), "bytes": m.Bytes, "databaseWrites": 0})
}
