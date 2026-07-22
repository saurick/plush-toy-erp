package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"time"
)

type OutsourcingReturnDisposition struct{ ent.Schema }

func (OutsourcingReturnDisposition) Hooks() []ent.Hook {
	return []ent.Hook{rejectMutationOps(ent.OpDelete|ent.OpDeleteOne, "outsourcing return dispositions are auditable and cannot be deleted")}
}
func (OutsourcingReturnDisposition) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"outsourcing_return_dispositions_type_allowed":      "disposition_type IN ('RETURN_TO_VENDOR', 'REWORK')",
		"outsourcing_return_dispositions_status_allowed":    "status IN ('DRAFT', 'POSTED', 'CANCELLED')",
		"outsourcing_return_dispositions_quantity_positive": "quantity > 0",
		"outsourcing_return_dispositions_intent_bundle":     "length(trim(idempotency_key)) BETWEEN 1 AND 128 AND length(idempotency_payload_hash) = 64",
		"outsourcing_return_dispositions_version_positive":  "version > 0",
	}}}
}
func (OutsourcingReturnDisposition) Fields() []ent.Field {
	return []ent.Field{
		field.String("disposition_no").NotEmpty().MaxLen(64).Immutable(),
		field.Int("quality_inspection_id").Positive().Immutable(),
		field.Int("outsourcing_return_fact_id").Positive().Immutable(),
		field.String("disposition_type").NotEmpty().MaxLen(32).Immutable(),
		field.String("status").NotEmpty().Default("DRAFT").MaxLen(16),
		immutableDecimalQuantityField("quantity"),
		field.Int("production_wip_batch_id").Optional().Nillable().Positive().Immutable(),
		field.String("reason").NotEmpty().MaxLen(255).Immutable(),
		field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(),
		field.String("idempotency_payload_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(),
		field.Int("version").Default(1).Positive(),
		field.Time("posted_at").Optional().Nillable(), field.Int("posted_by").Optional().Nillable().Positive(),
		field.Time("cancelled_at").Optional().Nillable(), field.Int("cancelled_by").Optional().Nillable().Positive(), field.String("cancel_reason").Optional().Nillable().MaxLen(255),
		field.Int("created_by").Positive().Immutable(), field.Time("created_at").Default(time.Now).Immutable(),
	}
}
func (OutsourcingReturnDisposition) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("disposition_no").Unique(), index.Fields("created_by", "idempotency_key").Unique(),
		index.Fields("quality_inspection_id").Unique().Annotations(entsql.IndexWhere("status <> 'CANCELLED'")),
		index.Fields("outsourcing_return_fact_id", "status"),
	}
}
