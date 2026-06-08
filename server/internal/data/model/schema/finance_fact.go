package schema

import (
	"context"
	"errors"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type FinanceFact struct {
	ent.Schema
}

var financeFactLockedFields = map[string]struct{}{
	"fact_no":           {},
	"fact_type":         {},
	"status":            {},
	"counterparty_type": {},
	"counterparty_id":   {},
	"amount":            {},
	"currency":          {},
	"source_type":       {},
	"source_id":         {},
	"source_line_id":    {},
	"idempotency_key":   {},
	"posted_at":         {},
	"settled_at":        {},
}

func (FinanceFact) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
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
				"finance_facts_type_allowed":         "fact_type IN ('RECEIVABLE', 'PAYABLE', 'INVOICE', 'PAYMENT', 'RECONCILIATION')",
				"finance_facts_status_allowed":       "status IN ('DRAFT', 'POSTED', 'SETTLED', 'CANCELLED')",
				"finance_facts_counterparty_allowed": "counterparty_type IN ('CUSTOMER', 'SUPPLIER', 'OTHER')",
				"finance_facts_amount_positive":      "amount > 0",
			},
		},
	}
}

func (FinanceFact) Fields() []ent.Field {
	return []ent.Field{
		field.String("fact_no").NotEmpty().MaxLen(64),
		field.String("fact_type").NotEmpty().MaxLen(32),
		field.String("status").NotEmpty().Default("DRAFT").MaxLen(32),
		field.String("counterparty_type").NotEmpty().MaxLen(16),
		field.Int("counterparty_id").Optional().Nillable().Positive(),
		decimalQuantityField("amount"),
		field.String("currency").NotEmpty().Default("CNY").MaxLen(16),
		field.String("source_type").Optional().Nillable().MaxLen(64),
		field.Int("source_id").Optional().Nillable().Positive(),
		field.Int("source_line_id").Optional().Nillable().Positive(),
		field.String("idempotency_key").NotEmpty().MaxLen(128),
		field.Time("occurred_at").Default(time.Now),
		field.Time("posted_at").Optional().Nillable(),
		field.Time("settled_at").Optional().Nillable(),
		field.String("note").Optional().Nillable().MaxLen(255),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (FinanceFact) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("fact_no").Unique(),
		index.Fields("idempotency_key").Unique(),
		index.Fields("fact_type", "status"),
		index.Fields("counterparty_type", "counterparty_id"),
		index.Fields("source_type", "source_id", "source_line_id"),
	}
}
