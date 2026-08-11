package schema

import (
	"context"
	"errors"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/shopspring/decimal"

	"server/internal/data/model/factguard"
)

type FinanceFact struct {
	ent.Schema
}

var financeFactLockedFields = map[string]struct{}{
	"fact_no":               {},
	"fact_type":             {},
	"status":                {},
	"version":               {},
	"counterparty_type":     {},
	"counterparty_id":       {},
	"amount":                {},
	"fee_amount":            {},
	"currency":              {},
	"collection_type":       {},
	"payment_term":          {},
	"payment_term_days":     {},
	"due_at":                {},
	"invoice_category":      {},
	"source_type":           {},
	"source_id":             {},
	"source_line_id":        {},
	"idempotency_key":       {},
	"occurred_at":           {},
	"occurred_at_specified": {},
	"posted_at":             {},
	"posted_by":             {},
	"settled_at":            {},
	"settled_by":            {},
	"cancelled_at":          {},
	"cancelled_by":          {},
	"cancel_reason":         {},
}

func (FinanceFact) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if err := factguard.RejectCreateBypass(
					m,
					"finance_fact",
					[]string{
						"posted_at",
						"posted_by",
						"settled_at",
						"settled_by",
						"cancelled_at",
						"cancelled_by",
						"cancel_reason",
					},
				); err != nil {
					return nil, err
				}
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("finance_facts are immutable accounting facts; cancel or settle instead of deleting them")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, financeFactLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("finance_fact protected fields are immutable; use PostFinanceFact, SettleFinanceFact or CancelPostedFinanceFact for status changes")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (FinanceFact) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"finance_facts_type_allowed":             "fact_type IN ('RECEIVABLE', 'PAYABLE', 'INVOICE', 'RECONCILIATION')",
				"finance_facts_status_allowed":           "status IN ('DRAFT', 'POSTED', 'SETTLED', 'CANCELLED')",
				"finance_facts_counterparty_allowed":     "counterparty_type IN ('CUSTOMER', 'SUPPLIER')",
				"finance_facts_amount_positive":          "amount > 0",
				"finance_facts_fee_amount_nonnegative":   "fee_amount >= 0",
				"finance_facts_currency_allowed":         "currency = 'CNY'",
				"finance_facts_collection_type_allowed":  "collection_type IS NULL OR collection_type = 'ACCOUNTS_RECEIVABLE'",
				"finance_facts_payment_term_allowed":     "payment_term IS NULL OR payment_term IN ('DUE_ON_OCCURRENCE', 'NET_DAYS')",
				"finance_facts_payment_term_days_check":  "payment_term_days IS NULL OR payment_term_days >= 0",
				"finance_facts_invoice_category_allowed": "invoice_category IS NULL OR invoice_category IN ('NONE', 'EXPORT_GENERAL', 'VAT_GENERAL_1', 'VAT_SPECIAL_3', 'VAT_SPECIAL_13')",
				"finance_facts_version_positive":         "version > 0",
				"finance_facts_due_at_bundle": `
(
  (fact_type IN ('RECEIVABLE', 'PAYABLE')
    AND payment_term IS NOT NULL
    AND payment_term_days IS NOT NULL
    AND due_at IS NOT NULL
    AND ((payment_term = 'DUE_ON_OCCURRENCE' AND payment_term_days = 0 AND due_at = occurred_at)
      OR (payment_term = 'NET_DAYS' AND payment_term_days > 0 AND due_at > occurred_at)))
  OR
  (fact_type NOT IN ('RECEIVABLE', 'PAYABLE')
    AND payment_term IS NULL
    AND payment_term_days IS NULL
    AND due_at IS NULL)
)`,
				"finance_facts_status_audit_bundle": `
(
  (status = 'DRAFT'
    AND posted_at IS NULL AND posted_by IS NULL
    AND settled_at IS NULL AND settled_by IS NULL)
  OR
  (status = 'POSTED'
    AND posted_at IS NOT NULL AND posted_by IS NOT NULL
    AND settled_at IS NULL AND settled_by IS NULL)
  OR
  (status = 'SETTLED'
    AND posted_at IS NOT NULL AND posted_by IS NOT NULL
    AND settled_at IS NOT NULL AND settled_by IS NOT NULL)
  OR
  (status = 'CANCELLED'
    AND settled_at IS NULL AND settled_by IS NULL
    AND ((posted_at IS NULL AND posted_by IS NULL)
      OR (posted_at IS NOT NULL AND posted_by IS NOT NULL)))
)`,
				"finance_facts_cancel_audit_bundle": `
(
  (status = 'CANCELLED'
    AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
    AND cancel_reason IS NOT NULL AND length(trim(cancel_reason)) BETWEEN 1 AND 255)
  OR
  (status <> 'CANCELLED'
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)
)`,
			},
		},
	}
}

func (FinanceFact) Fields() []ent.Field {
	return []ent.Field{
		// Finance facts are posted by finance usecases; Workflow state does not create accounting truth.
		field.String("fact_no").NotEmpty().MaxLen(64),
		field.String("fact_type").NotEmpty().MaxLen(32),
		field.String("status").NotEmpty().Default("DRAFT").MaxLen(32),
		field.Int("version").Default(1).Positive(),
		field.String("counterparty_type").NotEmpty().MaxLen(16),
		field.Int("counterparty_id").Optional().Nillable().Positive(),
		decimalQuantityField("amount"),
		decimalQuantityFieldWithDefault("fee_amount", decimal.Zero),
		field.String("currency").NotEmpty().Default("CNY").MaxLen(16),
		field.String("collection_type").Optional().Nillable().MaxLen(32),
		field.String("payment_term").Optional().Nillable().MaxLen(32),
		field.Int("payment_term_days").Optional().Nillable().NonNegative(),
		field.Time("due_at").Optional().Nillable(),
		field.String("invoice_category").Optional().Nillable().MaxLen(32),
		// source_* keeps source-document traceability for the posted fact.
		field.String("source_type").Optional().Nillable().MaxLen(64),
		field.Int("source_id").Optional().Nillable().Positive(),
		field.Int("source_line_id").Optional().Nillable().Positive(),
		field.String("idempotency_key").NotEmpty().MaxLen(128),
		field.Time("occurred_at").Default(time.Now),
		field.Bool("occurred_at_specified").Default(false),
		field.Time("posted_at").Optional().Nillable(),
		field.Int("posted_by").Optional().Nillable().Positive(),
		field.Time("settled_at").Optional().Nillable(),
		field.Int("settled_by").Optional().Nillable().Positive(),
		field.Time("cancelled_at").Optional().Nillable(),
		field.Int("cancelled_by").Optional().Nillable().Positive(),
		field.String("cancel_reason").Optional().Nillable().MaxLen(255),
		field.String("note").Optional().Nillable().MaxLen(255),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (FinanceFact) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("poster", AdminUser.Type).
			Field("posted_by").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("settler", AdminUser.Type).
			Field("settled_by").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("canceller", AdminUser.Type).
			Field("cancelled_by").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (FinanceFact) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("fact_no").Unique(),
		index.Fields("idempotency_key").Unique(),
		index.Fields("fact_type", "status"),
		index.Fields("counterparty_type", "counterparty_id"),
		index.Fields("source_type", "source_id", "source_line_id"),
		index.Fields("fact_type", "source_type", "source_id").
			Unique().
			Annotations(entsql.IndexWhere("source_type IS NOT NULL AND source_id IS NOT NULL AND status <> 'CANCELLED'")),
	}
}
