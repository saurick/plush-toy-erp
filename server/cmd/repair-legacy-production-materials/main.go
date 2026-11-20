package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"net"
	"os"
	"time"

	"server/internal/data"

	"github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
)

func run() error {
	database := flag.String("database", "", "exact disposable restored database name")
	apply := flag.Bool("apply", false, "apply changes to the named restored copy")
	flag.Parse()
	if flag.NArg() != 0 || *database == "" {
		return fmt.Errorf("supply the exact disposable restored database with --database")
	}
	dsn := os.Getenv("POSTGRES_DSN")
	config, err := pgx.ParseConfig(dsn)
	if err != nil || dsn == "" || !net.ParseIP(config.Host).IsLoopback() || config.Database != *database {
		return fmt.Errorf("POSTGRES_DSN must use a numeric loopback address and match --database")
	}
	for _, fallback := range config.Fallbacks {
		if !net.ParseIP(fallback.Host).IsLoopback() {
			return fmt.Errorf("POSTGRES_DSN must only use loopback hosts")
		}
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return fmt.Errorf("could not open disposable database")
	}
	defer func() { _ = db.Close() }()
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	repairs, err := data.RepairLegacyProductionMaterialRequirements(ctx, db, *database, *apply)
	if err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]any{
		"database": *database, "applied": *apply, "requirements": repairs,
		"migration": data.LegacyProductionMaterialRecoveryVersion,
	})
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
