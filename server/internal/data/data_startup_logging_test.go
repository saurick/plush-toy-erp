package data

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/jackc/pgx/v5"
	"server/internal/conf"
)

func TestPostgresLogTargetUsesDriverConfiguration(t *testing.T) {
	for _, tc := range []struct{ dsn, address, policy string }{
		{"postgres://user:private-password@db.example:5434/erp?sslmode=disable", "db.example:5434", "disabled"},
		{"host=db.example port=5434 dbname=erp user=private-user password='private password' sslmode=require", "db.example:5434", "required"},
		{"postgres://user:private-password@db.example/erp?sslmode=prefer", "db.example:5432", "prefer"},
		{"host=db.example dbname=erp sslmode=allow", "db.example:5432", "allow"},
		{"host=db.example dbname=erp sslmode=verify-full", "db.example:5432", "verify-full"},
		{"host=db1.example,db2.example port=5434,5435 dbname=erp sslmode=disable", "db1.example:5434,db2.example:5435", "disabled"},
	} {
		t.Run(tc.policy+tc.address, func(t *testing.T) {
			c, err := pgx.ParseConfig(tc.dsn)
			if err != nil {
				t.Fatal(err)
			}
			address, policy := postgresLogTarget(c)
			if address != tc.address || policy != tc.policy || c.Database != "erp" {
				t.Fatalf("target=%s policy=%s database=%s", address, policy, c.Database)
			}
		})
	}
}

func TestInvalidPostgresConfigDoesNotExposeDSN(t *testing.T) {
	var output bytes.Buffer
	_, _, err := NewData(&conf.Data{Postgres: &conf.Data_Postgres{Dsn: "postgres://private-user:private-password@db.example:invalid/erp"}}, log.NewStdLogger(&output))
	if err == nil || strings.Contains(err.Error()+output.String(), "private-") {
		t.Fatalf("unsafe config failure: %v %s", err, output.String())
	}
}

func TestLocalSMSStartupReportsResolvedMode(t *testing.T) {
	var output bytes.Buffer
	provider, err := NewSMSLoginCodeProvider(&conf.Data{}, log.NewStdLogger(&output))
	if err != nil || provider == nil || !strings.Contains(output.String(), "mode=local") {
		t.Fatalf("local SMS startup log missing: %v %s", err, output.String())
	}
}

func TestPostgresRetriesLogStateChangesWithoutRepeatingEveryAttempt(t *testing.T) {
	var output bytes.Buffer
	pinger := &seqPinger{sequence: []error{errors.New("connection refused"), errors.New("connection refused"), errors.New("starting up"), errors.New("starting up"), nil}}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := waitForPostgresReady(ctx, pinger, time.Millisecond, log.NewHelper(log.NewStdLogger(&output))); err != nil {
		t.Fatal(err)
	}
	text := output.String()
	if strings.Count(text, "not ready yet") != 2 || !strings.Contains(text, "ready after retry, attempt=5") {
		t.Fatalf("unexpected retry logs: %s", text)
	}
}
