package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"server/internal/data"

	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	dsnFlag := flag.String("dsn", "", "PostgreSQL DSN; defaults to POSTGRES_DSN")
	apply := flag.Bool("apply", false, "commit missing source-task bundles; default is transactional dry-run")
	confirmDatabase := flag.String("confirm-database", "", "exact database name required together with --apply")
	timeout := flag.Duration("timeout", 5*time.Minute, "repair timeout")
	flag.Parse()

	dsn := strings.TrimSpace(*dsnFlag)
	if dsn == "" {
		dsn = strings.TrimSpace(os.Getenv("POSTGRES_DSN"))
	}
	if dsn == "" {
		fail("PostgreSQL DSN is required through --dsn or POSTGRES_DSN")
	}
	databaseName, err := postgresDatabaseName(dsn)
	if err != nil {
		fail("invalid PostgreSQL DSN: %v", err)
	}
	if *apply && strings.TrimSpace(*confirmDatabase) != databaseName {
		fail("--apply requires --confirm-database=%s", databaseName)
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		fail("open PostgreSQL: %v", err)
	}
	defer func() { _ = db.Close() }()
	ctx, cancel := context.WithTimeout(context.Background(), *timeout)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		fail("ping PostgreSQL: %v", err)
	}
	result, err := data.BackfillMissingWorkflowSourceTasks(ctx, db, *apply)
	if err != nil {
		fail("workflow source-task backfill failed: %v", err)
	}
	payload := map[string]any{
		"contract": "workflow.source-task-backfill/v1",
		"database": databaseName,
		"mode":     map[bool]string{true: "apply", false: "dry-run"}[*apply],
		"result":   result,
		"notes": []string{
			"only active RELEASED production orders and POSTED REWORK facts are reconciled",
			"created tasks stay ready for real owners; no done or rejected outcome is inferred",
			"DRAFT shipments still require an explicit submit action from the shipment page",
		},
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(payload); err != nil {
		fail("encode result: %v", err)
	}
}

func postgresDatabaseName(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", err
	}
	if parsed.Scheme != "postgres" && parsed.Scheme != "postgresql" {
		return "", fmt.Errorf("unsupported scheme %q", parsed.Scheme)
	}
	name := strings.Trim(strings.TrimSpace(parsed.Path), "/")
	if name == "" || strings.Contains(name, "/") {
		return "", fmt.Errorf("database name is missing")
	}
	return name, nil
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
