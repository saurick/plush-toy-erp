package data

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"

	modelschema "server/internal/data/model/schema"
)

const financeCurrencyCheck = "currency IN ('USD', 'CNY', 'HKD')"

const paymentTermDaysNonnegativeCheck = "payment_term_days IS NULL OR payment_term_days >= 0"

func TestFinanceSchemasAllowOnlySupportedCurrencies(t *testing.T) {
	tests := []struct {
		name      string
		schema    ent.Interface
		checkName string
	}{
		{name: "finance fact", schema: modelschema.FinanceFact{}, checkName: "finance_facts_currency_allowed"},
		{name: "finance payment", schema: modelschema.FinancePayment{}, checkName: "finance_payments_currency_allowed"},
		{name: "finance allocation", schema: modelschema.FinanceAllocation{}, checkName: "finance_allocations_currency_allowed"},
		{name: "finance credit note", schema: modelschema.FinanceCreditNote{}, checkName: "finance_credit_notes_currency_allowed"},
		{name: "sales order", schema: modelschema.SalesOrder{}, checkName: "sales_orders_currency_allowed"},
		{name: "purchase order", schema: modelschema.PurchaseOrder{}, checkName: "purchase_orders_currency_allowed"},
		{name: "outsourcing order", schema: modelschema.OutsourcingOrder{}, checkName: "outsourcing_orders_currency_allowed"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := schemaCheck(tt.schema, tt.checkName); got != financeCurrencyCheck {
				t.Fatalf("currency check=%q want %q", got, financeCurrencyCheck)
			}
		})
	}
}

func TestCommercialSourceOrdersPersistCurrencyWithCNYDefault(t *testing.T) {
	tests := []struct {
		name   string
		fields []ent.Field
	}{
		{name: "sales order", fields: (modelschema.SalesOrder{}).Fields()},
		{name: "purchase order", fields: (modelschema.PurchaseOrder{}).Fields()},
		{name: "outsourcing order", fields: (modelschema.OutsourcingOrder{}).Fields()},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, schemaField := range tt.fields {
				descriptor := schemaField.Descriptor()
				if descriptor.Name != "currency" {
					continue
				}
				if descriptor.Optional || descriptor.Nillable || descriptor.Default != "CNY" || descriptor.Size != 16 {
					t.Fatalf("currency descriptor=%#v", descriptor)
				}
				return
			}
			t.Fatal("required currency field is missing")
		})
	}
}

func TestPayableSourceOrdersPersistOptionalNonNegativePaymentTermSnapshot(t *testing.T) {
	tests := []struct {
		name      string
		schema    ent.Interface
		fields    []ent.Field
		checkName string
	}{
		{
			name:      "purchase order",
			schema:    modelschema.PurchaseOrder{},
			fields:    (modelschema.PurchaseOrder{}).Fields(),
			checkName: "purchase_orders_payment_term_days_nonnegative",
		},
		{
			name:      "outsourcing order",
			schema:    modelschema.OutsourcingOrder{},
			fields:    (modelschema.OutsourcingOrder{}).Fields(),
			checkName: "outsourcing_orders_payment_term_days_nonnegative",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := schemaCheck(tt.schema, tt.checkName); got != paymentTermDaysNonnegativeCheck {
				t.Fatalf("payment_term_days check=%q want %q", got, paymentTermDaysNonnegativeCheck)
			}
			for _, schemaField := range tt.fields {
				descriptor := schemaField.Descriptor()
				if descriptor.Name != "payment_term_days" {
					continue
				}
				if !descriptor.Optional || !descriptor.Nillable || descriptor.Default != nil || len(descriptor.Validators) != 1 {
					t.Fatalf("payment_term_days descriptor=%#v", descriptor)
				}
				validate, ok := descriptor.Validators[0].(func(int) error)
				if !ok {
					t.Fatalf("payment_term_days validator type=%T", descriptor.Validators[0])
				}
				if validate(-1) == nil || validate(0) != nil || validate(30) != nil {
					t.Fatal("payment_term_days must reject negative values and accept zero/positive snapshots")
				}
				return
			}
			t.Fatal("payment_term_days field is missing")
		})
	}
}

func TestUnpublishedFinanceCurrencyNarrowingIsAbsent(t *testing.T) {
	migration, err := os.ReadFile(filepath.Join("model", "migrate", "20260811145822_migrate.sql"))
	if err != nil {
		t.Fatalf("read unpublished finance migration: %v", err)
	}
	content := string(migration)
	for _, constraint := range []string{
		"finance_facts_currency_allowed",
		"finance_payments_currency_allowed",
		"finance_allocations_currency_allowed",
		"finance_credit_notes_currency_allowed",
	} {
		if strings.Contains(content, constraint) {
			t.Fatalf("unpublished migration must not narrow %s", constraint)
		}
	}
}

func TestFinanceCurrencyPreflightAllowsOnlySupportedSet(t *testing.T) {
	preflight, err := os.ReadFile(filepath.Join("..", "..", "..", "scripts", "qa", "finance-fact-due-at-preflight.sql"))
	if err != nil {
		t.Fatalf("read finance preflight: %v", err)
	}
	content := string(preflight)
	allowedSetPredicate := "currency IS NULL OR currency NOT IN ('CNY', 'USD', 'HKD')"
	if got := strings.Count(content, allowedSetPredicate); got != 4 {
		t.Fatalf("supported-currency fail-closed predicates=%d want 4", got)
	}
	for _, stale := range []string{"currency IS DISTINCT FROM 'CNY'", "CNY-only contract"} {
		if strings.Contains(content, stale) {
			t.Fatalf("finance preflight retains stale CNY-only contract %q", stale)
		}
	}
	for _, evidence := range []string{
		"finance_facts=%",
		"finance_payments=%",
		"finance_allocations=%",
		"finance_credit_notes=%",
	} {
		if !strings.Contains(content, evidence) {
			t.Fatalf("finance preflight missing per-table evidence %q", evidence)
		}
	}
}

func TestFinanceDueAtPreflightKeepsLegacyInputsReadOnlyAndTargetsCanonicalEOM(t *testing.T) {
	preflight, err := os.ReadFile(filepath.Join("..", "..", "..", "scripts", "qa", "finance-fact-due-at-preflight.sql"))
	if err != nil {
		t.Fatalf("read finance preflight: %v", err)
	}
	content := string(preflight)
	compact := strings.Join(strings.Fields(content), " ")
	for _, fragment := range []string{
		"payment_term IN ('CASH_ON_SHIPMENT', 'DUE_ON_OCCURRENCE')",
		"payment_term = 'EOM_30'",
		"payment_term = 'EOM_45'",
		"payment_term = 'NET_DAYS' AND payment_term_days >= 0",
		"payment_term = 'EOM_DAYS' AND payment_term_days > 0",
		"date_trunc('month', occurred_at AT TIME ZONE 'UTC')",
		"occurred_at AT TIME ZONE 'UTC' - date_trunc('day', occurred_at AT TIME ZONE 'UTC')",
		"due_at IS DISTINCT FROM canonical_due_at",
	} {
		if !strings.Contains(compact, fragment) {
			t.Fatalf("finance preflight missing canonical due-date fragment %q", fragment)
		}
	}
	upper := strings.ToUpper(content)
	for _, forbidden := range []string{
		"UPDATE FINANCE_FACTS",
		"DELETE FROM FINANCE_FACTS",
		"INSERT INTO FINANCE_FACTS",
	} {
		if strings.Contains(upper, forbidden) {
			t.Fatalf("finance preflight must remain read-only and not contain %q", forbidden)
		}
	}
}

func TestSimulatedOutsourcingPayableMigrationKeepsHistoricalFallbackNarrow(t *testing.T) {
	migration, err := os.ReadFile(filepath.Join("model", "migrate", "20260811000000_reconcile_simulated_outsourcing_payable_terms.sql"))
	if err != nil {
		t.Fatalf("read simulated outsourcing payable migration: %v", err)
	}
	content := strings.Join(strings.Fields(string(migration)), " ")
	for _, fragment := range []string{
		"target.fact_type = 'PAYABLE'",
		"target.source_type = 'OUTSOURCING_FACT'",
		"target.counterparty_type = 'SUPPLIER'",
		"source_fact.source_type = 'OUTSOURCING_ORDER'",
		"source_fact.supplier_id = source_order.supplier_id",
		"source_order.supplier_snapshot ->> 'simulated_only' = 'true'",
		"target.payment_term IS NULL",
		"target.payment_term_days IS NULL",
		"payment_term = 'CASH_ON_SHIPMENT'",
		"payment_term_days = 0",
	} {
		if !strings.Contains(content, fragment) {
			t.Fatalf("simulated payable migration missing narrow lineage fragment %q", fragment)
		}
	}
	for _, forbidden := range []string{
		"default_payment_term_days",
		"FROM suppliers",
		"JOIN suppliers",
	} {
		if strings.Contains(content, forbidden) {
			t.Fatalf("simulated payable migration must not infer historical terms from current supplier defaults: %q", forbidden)
		}
	}

	preflight, err := os.ReadFile(filepath.Join("..", "..", "..", "scripts", "qa", "finance-fact-due-at-preflight.sql"))
	if err != nil {
		t.Fatalf("read finance preflight: %v", err)
	}
	preflightContent := strings.Join(strings.Fields(string(preflight)), " ")
	for _, fragment := range []string{
		"fact_type = 'PAYABLE'",
		"source_type = 'OUTSOURCING_FACT'",
		"source_fact.source_type = 'OUTSOURCING_ORDER'",
		"finance_facts.counterparty_id = source_order.supplier_id",
		"source_order.supplier_snapshot ->> 'simulated_only' = 'true'",
	} {
		if !strings.Contains(preflightContent, fragment) {
			t.Fatalf("finance preflight missing simulated payable lineage fragment %q", fragment)
		}
	}
}

func schemaCheck(target ent.Interface, name string) string {
	for _, annotation := range target.Annotations() {
		if sqlAnnotation, ok := annotation.(entsql.Annotation); ok {
			return sqlAnnotation.Checks[name]
		}
	}
	return ""
}
