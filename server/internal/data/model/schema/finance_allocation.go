package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"time"
)

type FinanceAllocation struct{ ent.Schema }

func (FinanceAllocation) Hooks() []ent.Hook {
	return []ent.Hook{rejectMutationOps(ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne, "finance allocations are append-only; create a reversing allocation instead")}
}
func (FinanceAllocation) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"finance_allocations_amount_positive": "amount > 0", "finance_allocations_status_allowed": "status IN ('POSTED', 'REVERSED')",
		"finance_allocations_currency_allowed": "currency IN ('USD', 'CNY', 'HKD')", "finance_allocations_reversal_not_self": "reversal_of_allocation_id IS NULL OR reversal_of_allocation_id <> id",
	}}}
}
func (FinanceAllocation) Fields() []ent.Field {
	return []ent.Field{
		field.Int("payment_id").Positive().Immutable(), field.Int("finance_fact_id").Positive().Immutable(), immutableDecimalQuantityField("amount"),
		field.String("currency").NotEmpty().MaxLen(16).Immutable(), field.String("status").NotEmpty().Default("POSTED").MaxLen(16).Immutable(),
		field.Int("reversal_of_allocation_id").Optional().Nillable().Positive().Immutable(), field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(),
		field.Int("created_by").Positive().Immutable(), field.Time("created_at").Default(time.Now).Immutable(),
	}
}
func (FinanceAllocation) Edges() []ent.Edge {
	return []ent.Edge{edge.From("payment", FinancePayment.Type).Ref("allocations").Field("payment_id").Required().Unique().Immutable()}
}
func (FinanceAllocation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("idempotency_key").Unique(), index.Fields("payment_id", "finance_fact_id", "status"),
		index.Fields("reversal_of_allocation_id").Unique().Annotations(entsql.IndexWhere("reversal_of_allocation_id IS NOT NULL")),
	}
}
