package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/jackc/pgx/v5/pgconn"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/unit"
)

func TestSourceDocumentPostgresEngineeringMaterialReadSnapshot(t *testing.T) {
	t.Run("read_only_and_release", func(t *testing.T) {
		data, _ := openPurchaseReceiptPostgresTestData(t)
		data.sqldb.SetMaxOpenConns(1)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		snapshot, err := beginClientReadSnapshot(ctx, data)
		if err != nil {
			t.Fatal(err)
		}
		defer snapshot.Rollback()
		// An empty mutation verifies PostgreSQL read-only enforcement without
		// changing fixtures even if transaction configuration regresses.
		_, err = snapshot.client.Unit.Delete().Where(unit.ID(-1)).Exec(ctx)
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "25006" {
			t.Fatalf("expected read_only_sql_transaction, got %v", err)
		}
		snapshot.Rollback()
		if err := data.sqldb.PingContext(ctx); err != nil {
			t.Fatalf("snapshot did not release the sole connection: %v", err)
		}
	})
	for _, byID := range []bool{false, true} {
		name := "latest"
		if byID {
			name = "by_id"
		}
		t.Run(name, func(t *testing.T) {
			data, _ := openPurchaseReceiptPostgresTestData(t)
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			f := prepareMaterialRequestFixture(t, ctx, data, "PG-MR-SNAP-"+postgresTestSuffix())
			request := submitMaterialRequestFixture(t, ctx, f)
			boss, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE"})
			if err != nil {
				t.Fatal(err)
			}
			read := func() (*biz.EngineeringMaterialRequest, error) {
				if byID {
					return f.uc.GetEngineeringMaterialRequestByID(ctx, f.order.ID, request.ID)
				}
				return f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, false)
			}
			writerTx, err := data.sqldb.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer func() {
				if err := writerTx.Rollback(); err != nil && !errors.Is(err, stdsql.ErrTxDone) {
					t.Errorf("rollback snapshot writer: %v", err)
				}
			}()
			if _, err := writerTx.ExecContext(ctx, "LOCK TABLE engineering_material_request_items IN ACCESS EXCLUSIVE MODE"); err != nil {
				t.Fatal(err)
			}
			var blocker int
			if err := writerTx.QueryRowContext(ctx, "SELECT pg_backend_pid()").Scan(&blocker); err != nil {
				t.Fatal(err)
			}
			type outcome struct {
				request *biz.EngineeringMaterialRequest
				err     error
			}
			completed := make(chan outcome, 1)
			go func() { result, err := read(); completed <- outcome{result, err} }()
			waitForPostgresSessionBlockedByPID(t, ctx, data.sqldb, blocker)
			// The reader has consumed the header. Commit the finance header and its
			// real purchase-generation result together before allowing detail reads.
			writer := newBusinessEntClient(ent.Driver(entsql.NewDriver(dialect.Postgres, entsql.Conn{ExecQuerier: writerTx})))
			if err := f.repo.generateMaterialPurchaseOrders(ctx, writer, boss); err != nil {
				t.Fatal(err)
			}
			if _, err := writerTx.ExecContext(ctx, `UPDATE engineering_material_requests SET status='APPROVED',version=version+1,finance_reviewed_by=33,finance_reviewed_at=now() WHERE id=$1`, request.ID); err != nil {
				t.Fatal(err)
			}
			if err := writerTx.Commit(); err != nil {
				t.Fatal(err)
			}
			select {
			case got := <-completed:
				if got.err != nil {
					t.Fatal(got.err)
				}
				if got.request.Status != boss.Status || got.request.Version != boss.Version || got.request.FinanceReviewedBy != nil || len(got.request.PurchaseOrders) != 0 || got.request.SourceHash != boss.SourceHash {
					t.Fatalf("mixed approval snapshot: status=%s version=%d purchases=%d", got.request.Status, got.request.Version, len(got.request.PurchaseOrders))
				}
			case <-ctx.Done():
				t.Fatal(ctx.Err())
			}
			after, err := read()
			if err != nil {
				t.Fatal(err)
			}
			if after.Status != biz.MaterialRequestApproved || after.Version != boss.Version+1 || after.FinanceReviewedBy == nil || len(after.PurchaseOrders) != 2 || after.SourceHash != boss.SourceHash {
				t.Fatal("next read did not observe the complete finance result")
			}
		})
	}
}
