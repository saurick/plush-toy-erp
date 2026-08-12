package data

import (
	"strings"
	"testing"

	"entgo.io/ent/dialect/entsql"

	modelschema "server/internal/data/model/schema"
)

func TestFinanceFactDueAtBundleCheckRemainsCrossDialect(t *testing.T) {
	annotations := (modelschema.FinanceFact{}).Annotations()
	var dueAtCheck string
	for _, annotation := range annotations {
		sqlAnnotation, ok := annotation.(entsql.Annotation)
		if !ok {
			continue
		}
		dueAtCheck = sqlAnnotation.Checks["finance_facts_due_at_bundle"]
		if dueAtCheck != "" {
			break
		}
	}
	if dueAtCheck == "" {
		t.Fatal("finance fact schema must define the due-at bundle check")
	}

	compact := strings.Join(strings.Fields(dueAtCheck), " ")
	for _, fragment := range []string{
		"fact_type IN ('RECEIVABLE', 'PAYABLE')",
		"(payment_term = 'DUE_ON_OCCURRENCE' AND payment_term_days = 0 AND due_at = occurred_at)",
		"(payment_term = 'EOM_DAYS' AND payment_term_days > 0 AND due_at > occurred_at)",
		"fact_type NOT IN ('RECEIVABLE', 'PAYABLE')",
		"payment_term IS NULL AND payment_term_days IS NULL AND due_at IS NULL",
	} {
		if !strings.Contains(compact, fragment) {
			t.Fatalf("due-at bundle check must contain %q, got %s", fragment, compact)
		}
	}

	upper := strings.ToUpper(dueAtCheck)
	for _, forbidden := range []string{
		"INTERVAL",
		"::",
		"JULIANDAY(",
		"STRFTIME(",
		"DATETIME(",
		"NET_DAYS",
		"CASH_ON_SHIPMENT",
		"EOM_30",
		"EOM_45",
	} {
		if strings.Contains(upper, forbidden) {
			t.Fatalf("due-at bundle check must remain portable and not contain %q, got %s", forbidden, dueAtCheck)
		}
	}
}
