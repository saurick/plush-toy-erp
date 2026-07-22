package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"time"
)

type FinanceCreditNote struct{ ent.Schema }

func (FinanceCreditNote) Hooks() []ent.Hook {
	return []ent.Hook{rejectMutationOps(ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne, "finance credit notes are immutable red-entry facts")}
}
func (FinanceCreditNote) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"finance_credit_notes_amount_positive": "amount > 0", "finance_credit_notes_currency_allowed": "currency IN ('USD', 'CNY', 'HKD')",
		"finance_credit_notes_status_allowed": "status IN ('POSTED', 'REVERSED')", "finance_credit_notes_intent_bundle": "length(trim(idempotency_key)) BETWEEN 1 AND 128 AND length(idempotency_payload_hash) = 64",
	}}}
}
func (FinanceCreditNote) Fields() []ent.Field {
	return []ent.Field{
		field.String("credit_note_no").NotEmpty().MaxLen(64).Immutable(), field.Int("finance_fact_id").Positive().Immutable(), field.Int("reversal_of_credit_note_id").Optional().Nillable().Positive().Immutable(),
		immutableDecimalQuantityField("amount"), field.String("currency").NotEmpty().MaxLen(16).Immutable(), field.String("status").NotEmpty().Default("POSTED").MaxLen(16).Immutable(),
		field.String("reason").NotEmpty().MaxLen(255).Immutable(), field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(), field.String("idempotency_payload_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(),
		field.Int("created_by").Positive().Immutable(), field.Time("created_at").Default(time.Now).Immutable(),
	}
}
func (FinanceCreditNote) Indexes() []ent.Index {
	return []ent.Index{index.Fields("credit_note_no").Unique(), index.Fields("created_by", "idempotency_key").Unique(), index.Fields("finance_fact_id", "status"), index.Fields("reversal_of_credit_note_id").Unique().Annotations(entsql.IndexWhere("reversal_of_credit_note_id IS NOT NULL"))}
}
