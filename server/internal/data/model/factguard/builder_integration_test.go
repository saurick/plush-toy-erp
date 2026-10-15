package factguard_test

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	"github.com/shopspring/decimal"

	modelent "server/internal/data/model/ent"
	_ "server/internal/data/model/ent/runtime"
)

type noSQLDriver struct {
	executions atomic.Int32
}

func (d *noSQLDriver) Exec(context.Context, string, any, any) error {
	d.executions.Add(1)
	return errors.New("unexpected SQL execution")
}

func (d *noSQLDriver) Query(context.Context, string, any, any) error {
	d.executions.Add(1)
	return errors.New("unexpected SQL query")
}

func (d *noSQLDriver) Tx(context.Context) (dialect.Tx, error) {
	return dialect.NopTx(d), nil
}

func (d *noSQLDriver) Close() error {
	return nil
}

func (d *noSQLDriver) Dialect() string {
	return dialect.Postgres
}

func newProductionFactCreate(client *modelent.Client, suffix, status string) *modelent.ProductionFactCreate {
	return client.ProductionFact.Create().
		SetFactNo("PF-GUARD-" + suffix).
		SetFactType("MATERIAL_ISSUE").
		SetStatus(status).
		SetSubjectType("MATERIAL").
		SetSubjectID(1).
		SetWarehouseID(1).
		SetUnitID(1).
		SetQuantity(decimal.NewFromInt(1)).
		SetIdempotencyKey("pf-guard-" + suffix)
}

func newOutsourcingFactCreate(client *modelent.Client, suffix, status string) *modelent.OutsourcingFactCreate {
	return client.OutsourcingFact.Create().
		SetFactNo("OF-GUARD-" + suffix).
		SetFactType("MATERIAL_ISSUE").
		SetStatus(status).
		SetSubjectType("MATERIAL").
		SetSubjectID(1).
		SetWarehouseID(1).
		SetUnitID(1).
		SetQuantity(decimal.NewFromInt(1)).
		SetIdempotencyKey("of-guard-" + suffix)
}

func newFinanceFactCreate(client *modelent.Client, suffix, status string) *modelent.FinanceFactCreate {
	return client.FinanceFact.Create().
		SetFactNo("FF-GUARD-" + suffix).
		SetFactType("RECEIVABLE").
		SetStatus(status).
		SetCounterpartyType("CUSTOMER").
		SetCounterpartyID(1).
		SetAmount(decimal.NewFromInt(1)).
		SetIdempotencyKey("ff-guard-" + suffix)
}

func TestOperationalFactCreateBuildersRejectLifecycleBypass(t *testing.T) {
	t.Parallel()

	t.Run("production direct posted", func(t *testing.T) {
		driver := &noSQLDriver{}
		client := modelent.NewClient(modelent.Driver(driver))
		_, err := newProductionFactCreate(client, "direct-posted", "POSTED").Save(context.Background())
		assertCreateGuardRejected(t, driver, err, "must be created as DRAFT")
	})

	t.Run("outsourcing direct posted_at", func(t *testing.T) {
		driver := &noSQLDriver{}
		client := modelent.NewClient(modelent.Driver(driver))
		_, err := newOutsourcingFactCreate(client, "direct-posted-at", "DRAFT").
			SetPostedAt(time.Now()).
			Save(context.Background())
		assertCreateGuardRejected(t, driver, err, "must be created without posted_at")
	})

	t.Run("production bulk later posted", func(t *testing.T) {
		driver := &noSQLDriver{}
		client := modelent.NewClient(modelent.Driver(driver))
		_, err := client.ProductionFact.CreateBulk(
			newProductionFactCreate(client, "bulk-draft", "DRAFT"),
			newProductionFactCreate(client, "bulk-posted", "POSTED"),
		).Save(context.Background())
		assertCreateGuardRejected(t, driver, err, "must be created as DRAFT")
	})

	t.Run("outsourcing bulk later cancelled", func(t *testing.T) {
		driver := &noSQLDriver{}
		client := modelent.NewClient(modelent.Driver(driver))
		_, err := client.OutsourcingFact.CreateBulk(
			newOutsourcingFactCreate(client, "bulk-draft", "DRAFT"),
			newOutsourcingFactCreate(client, "bulk-cancelled", "CANCELLED"),
		).Save(context.Background())
		assertCreateGuardRejected(t, driver, err, "must be created as DRAFT")
	})

	t.Run("finance direct settled_at", func(t *testing.T) {
		driver := &noSQLDriver{}
		client := modelent.NewClient(modelent.Driver(driver))
		_, err := newFinanceFactCreate(client, "direct-settled-at", "DRAFT").
			SetSettledAt(time.Now()).
			Save(context.Background())
		assertCreateGuardRejected(t, driver, err, "must be created without settled_at")
	})

	t.Run("finance direct cancellation bundle", func(t *testing.T) {
		driver := &noSQLDriver{}
		client := modelent.NewClient(modelent.Driver(driver))
		_, err := newFinanceFactCreate(client, "direct-cancelled", "DRAFT").
			SetCancelledAt(time.Now()).
			SetCancelledBy(1).
			SetCancelReason("forged").
			Save(context.Background())
		assertCreateGuardRejected(t, driver, err, "must be created without cancelled_at")
	})

	t.Run("finance bulk later settled", func(t *testing.T) {
		driver := &noSQLDriver{}
		client := modelent.NewClient(modelent.Driver(driver))
		_, err := client.FinanceFact.CreateBulk(
			newFinanceFactCreate(client, "bulk-draft", "DRAFT"),
			newFinanceFactCreate(client, "bulk-settled", "SETTLED"),
		).Save(context.Background())
		assertCreateGuardRejected(t, driver, err, "must be created as DRAFT")
	})
}

func assertCreateGuardRejected(t *testing.T, driver *noSQLDriver, err error, want string) {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("create err=%v, want substring %q", err, want)
	}
	if got := driver.executions.Load(); got != 0 {
		t.Fatalf("rejected create reached SQL driver %d times", got)
	}
}
