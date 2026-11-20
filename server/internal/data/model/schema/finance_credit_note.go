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

type FinanceCreditNote struct{ ent.Schema }

func (FinanceCreditNote) Hooks() []ent.Hook {
	return []ent.Hook{rejectMutationOps(ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne, "finance credit notes are immutable red-entry facts")}
}
func (FinanceCreditNote) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"finance_credit_notes_amount_positive": "amount > 0", "finance_credit_notes_currency_allowed": "currency IN ('USD', 'CNY', 'HKD')",
		"finance_credit_notes_status_allowed": "status IN ('POSTED', 'REVERSED')", "finance_credit_notes_intent_bundle": "length(trim(idempotency_key)) BETWEEN 1 AND 128 AND length(idempotency_payload_hash) = 64",
		"finance_credit_notes_reversal_bundle":   "((status = 'POSTED' AND reversal_of_credit_note_id IS NULL) OR (status = 'REVERSED' AND reversal_of_credit_note_id IS NOT NULL))",
		"finance_credit_notes_reversal_not_self": "reversal_of_credit_note_id IS NULL OR reversal_of_credit_note_id <> id",
		"finance_credit_notes_direction_allowed": "balance_direction IN ('DECREASE', 'INCREASE')",
		"finance_credit_notes_source_bundle":     "((source_type IS NULL AND source_id IS NULL AND balance_direction = 'DECREASE') OR (source_type IS NOT NULL AND source_type IN ('PURCHASE_RETURN', 'PURCHASE_RECEIPT_ADJUSTMENT') AND source_id IS NOT NULL AND source_id > 0))",
	}}}
}
func (FinanceCreditNote) Fields() []ent.Field {
	return []ent.Field{
		field.String("balance_direction").NotEmpty().Default("DECREASE").MaxLen(16).Immutable(),
		field.String("source_type").Optional().Nillable().MaxLen(64).Immutable(),
		field.Int("source_id").Optional().Nillable().Positive().Immutable(),
		field.String("credit_note_no").NotEmpty().MaxLen(64).Immutable(), field.Int("finance_fact_id").Positive().Immutable(), field.Int("reversal_of_credit_note_id").Optional().Nillable().Positive().Immutable(),
		immutableDecimalQuantityField("amount"), field.String("currency").NotEmpty().MaxLen(16).Immutable(), field.String("status").NotEmpty().Default("POSTED").MaxLen(16).Immutable(),
		field.String("reason").NotEmpty().MaxLen(255).Immutable(), field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(), field.String("idempotency_payload_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(),
		field.Int("created_by").Positive().Immutable(), field.Time("created_at").Default(time.Now).Immutable(),
	}
}
func (FinanceCreditNote) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("finance_fact", FinanceFact.Type).Ref("credit_notes").Field("finance_fact_id").Required().Unique().Immutable().Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("reversals", FinanceCreditNote.Type).Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("reversal_of", FinanceCreditNote.Type).Ref("reversals").Field("reversal_of_credit_note_id").Unique().Immutable().Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}
func (FinanceCreditNote) Indexes() []ent.Index {
	return []ent.Index{index.Fields("credit_note_no").Unique(), index.Fields("created_by", "idempotency_key").Unique(), index.Fields("finance_fact_id", "status"), index.Fields("source_type", "source_id"), index.Fields("reversal_of_credit_note_id").Unique().Annotations(entsql.IndexWhere("reversal_of_credit_note_id IS NOT NULL"))}
}
