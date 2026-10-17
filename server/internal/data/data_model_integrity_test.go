package data

import (
	"errors"
	"strings"
	"testing"
	"time"

	"server/internal/data/model/ent"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/mattn/go-sqlite3"
	"github.com/shopspring/decimal"
)

func TestDataModelIntegrity(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "data_model_integrity")
	assertDataModelIntegrity(t, data, client)
}

func TestDatabaseGovernancePostgresDataModelIntegrity(t *testing.T) {
	data, client := openPurchaseReceiptPostgresTestData(t)
	assertDataModelIntegrity(t, data, client)
}

func assertDataModelIntegrity(t *testing.T, data *Data, client *ent.Client) {
	t.Helper()
	ctx := t.Context()
	suffix := postgresTestSuffix()
	f := createInventoryPostgresFixtures(t, ctx, client)
	customer := client.Customer.Create().SetCode("INTEGRITY-" + suffix).SetName("模型约束测试客户").SaveX(ctx)
	order := client.SalesOrder.Create().SetOrderNo("INTEGRITY-" + suffix).SetCustomerID(customer.ID).SetOrderDate(time.Now()).SaveX(ctx)
	lot := client.InventoryLot.Create().SetSubjectType("MATERIAL").SetSubjectID(f.materialID).SetLotNo("INTEGRITY-" + suffix).SaveX(ctx)
	quality := client.QualityInspection.Create().SetInspectionNo("INTEGRITY-" + suffix).SetInventoryLotID(lot.ID).SetWarehouseID(f.warehouseID).SaveX(ctx)

	for _, tc := range []struct {
		name string
		mode any
		rate any
	}{
		{"rate without mode", nil, "5"},
		{"inclusive without rate", "INCLUSIVE", nil},
		{"exclusive without rate", "EXCLUSIVE", nil},
		{"no-tax with rate", "NONE", "5"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := inventorySQLPlaceholders(data.sqlDialect, 3)
			_, err := data.sqldb.ExecContext(ctx, "UPDATE sales_orders SET tax_mode="+p[0]+", tax_rate="+p[1]+" WHERE id="+p[2], tc.mode, tc.rate, order.ID)
			assertModelConstraintError(t, err, "23514", "sales_orders_tax_pair_valid")
		})
	}
	for _, terms := range []any{nil, "INCLUDED"} {
		p := inventorySQLPlaceholders(data.sqlDialect, 2)
		_, err := data.sqldb.ExecContext(ctx, "UPDATE sales_orders SET quoted_freight_amount=10, freight_terms="+p[0]+" WHERE id="+p[1], terms, order.ID)
		assertModelConstraintError(t, err, "23514", "sales_orders_quoted_freight_terms_valid")
	}
	for _, status := range []string{"PASSED", "REJECTED"} {
		p := inventorySQLPlaceholders(data.sqlDialect, 3)
		_, err := data.sqldb.ExecContext(ctx, "UPDATE quality_inspections SET status="+p[0]+", inspected_at="+p[1]+" WHERE id="+p[2], status, time.Now(), quality.ID)
		assertModelConstraintError(t, err, "23514", "quality_inspections_lifecycle_shape")
	}

	// Valid nullable and completed states remain representable after tightening.
	for _, mode := range []string{"NONE", "INCLUSIVE", "EXCLUSIVE"} {
		var rate any
		if mode != "NONE" {
			rate = "5"
		}
		p := inventorySQLPlaceholders(data.sqlDialect, 3)
		if _, err := data.sqldb.ExecContext(ctx, "UPDATE sales_orders SET tax_mode="+p[0]+", tax_rate="+p[1]+" WHERE id="+p[2], mode, rate, order.ID); err != nil {
			t.Fatalf("valid tax pair %s: %v", mode, err)
		}
	}
	for _, result := range []string{"PASS", "CONCESSION", "REJECT"} {
		status := "PASSED"
		if result == "REJECT" {
			status = "REJECTED"
		}
		p := inventorySQLPlaceholders(data.sqlDialect, 4)
		if _, err := data.sqldb.ExecContext(ctx, "UPDATE quality_inspections SET status="+p[0]+", result="+p[1]+", inspected_at="+p[2]+" WHERE id="+p[3], status, result, time.Now(), quality.ID); err != nil {
			t.Fatalf("valid quality decision %s: %v", result, err)
		}
	}

	fact := client.FinanceFact.Create().SetFactNo("INTEGRITY-" + suffix).SetFactType("INVOICE").SetCounterpartyType("CUSTOMER").SetCounterpartyID(customer.ID).SetAmount(decimal.NewFromInt(100)).SetIdempotencyKey("integrity:" + suffix).SaveX(ctx)
	payment := client.FinancePayment.Create().SetPaymentNo("INTEGRITY-" + suffix).SetDirection("RECEIPT").SetCounterpartyType("CUSTOMER").SetCounterpartyID(customer.ID).SetAmount(decimal.NewFromInt(100)).SetCurrency("CNY").SetAccountRef("测试账户").SetEvidenceRef("测试回单").SetCreatedBy(1).SetIdempotencyKey("integrity:" + suffix).SetIdempotencyPayloadHash(strings.Repeat("a", 64)).SaveX(ctx)
	newCredit := func(key string) *ent.FinanceCreditNoteCreate {
		return client.FinanceCreditNote.Create().SetCreditNoteNo("INTEGRITY-" + key + suffix).SetFinanceFactID(fact.ID).SetAmount(decimal.NewFromInt(1)).SetCurrency("CNY").SetReason("约束回归").SetIdempotencyKey("integrity:" + key + suffix).SetIdempotencyPayloadHash(strings.Repeat("b", 64)).SetCreatedBy(1)
	}
	newAllocation := func(key string) *ent.FinanceAllocationCreate {
		return client.FinanceAllocation.Create().SetPaymentID(payment.ID).SetFinanceFactID(fact.ID).SetAmount(decimal.NewFromInt(1)).SetCurrency("CNY").SetIdempotencyKey("integrity:" + key + suffix).SetCreatedBy(1)
	}
	credit := newCredit("valid").SaveX(ctx)
	allocation := newAllocation("valid").SaveX(ctx)
	newCredit("valid-reversal").SetStatus("REVERSED").SetReversalOfCreditNoteID(credit.ID).SaveX(ctx)
	newAllocation("valid-reversal").SetStatus("REVERSED").SetReversalOfAllocationID(allocation.ID).SaveX(ctx)
	for _, tc := range []struct {
		name string
		save func() error
	}{
		{"orphan credit fact", func() error { _, err := newCredit("orphan-fact").SetFinanceFactID(2147483000).Save(ctx); return err }},
		{"orphan allocation fact", func() error {
			_, err := newAllocation("orphan-fact").SetFinanceFactID(2147483000).Save(ctx)
			return err
		}},
		{"orphan credit reversal", func() error {
			_, err := newCredit("orphan-reversal").SetStatus("REVERSED").SetReversalOfCreditNoteID(2147483000).Save(ctx)
			return err
		}},
		{"orphan allocation reversal", func() error {
			_, err := newAllocation("orphan-reversal").SetStatus("REVERSED").SetReversalOfAllocationID(2147483000).Save(ctx)
			return err
		}},
		{"allocation reversal without original", func() error { _, err := newAllocation("missing-reversal").SetStatus("REVERSED").Save(ctx); return err }},
		{"posted allocation with reversal", func() error {
			_, err := newAllocation("posted-reversal").SetReversalOfAllocationID(allocation.ID).Save(ctx)
			return err
		}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := tc.save(); !ent.IsConstraintError(err) {
				t.Fatalf("expected a database constraint error, got %v", err)
			}
		})
	}
	p := inventorySQLPlaceholders(data.sqlDialect, 1)
	self := newCredit("self-reversal").SaveX(ctx)
	_, err := data.sqldb.ExecContext(ctx, "UPDATE finance_credit_notes SET status='REVERSED', reversal_of_credit_note_id=id WHERE id="+p[0], self.ID)
	assertModelConstraintError(t, err, "23514", "finance_credit_notes_reversal_not_self")
	_, err = data.sqldb.ExecContext(ctx, "DELETE FROM finance_facts WHERE id="+p[0], fact.ID)
	assertModelConstraintError(t, err, "23503", "")

}

func assertModelConstraintError(t *testing.T, err error, code, constraint string) {
	t.Helper()
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) {
		if postgresError.Code != code || constraint != "" && postgresError.ConstraintName != constraint {
			t.Fatalf("database error=%v, want SQLSTATE=%s constraint=%s", err, code, constraint)
		}
		return
	}
	var sqliteError sqlite3.Error
	if errors.As(err, &sqliteError) {
		expected := sqlite3.ErrConstraintCheck
		if code == "23503" {
			expected = sqlite3.ErrConstraintForeignKey
		}
		if sqliteError.ExtendedCode != expected {
			t.Fatalf("SQLite error=%v, want constraint code=%d", err, expected)
		}
		return
	}
	t.Fatalf("expected database constraint %s (%s), got %v", constraint, code, err)
}
