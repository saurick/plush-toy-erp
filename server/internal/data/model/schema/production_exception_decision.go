package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"time"
)

type ProductionExceptionDecision struct{ ent.Schema }

func (ProductionExceptionDecision) Hooks() []ent.Hook {
	return []ent.Hook{rejectMutationOps(ent.OpDelete|ent.OpDeleteOne, "production exception decisions are auditable and cannot be deleted")}
}
func (ProductionExceptionDecision) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"production_exception_decisions_type_allowed":      "decision_type IN ('SCRAP', 'OVER_ISSUE', 'WIP_CONCESSION')",
		"production_exception_decisions_status_allowed":    "status IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED')",
		"production_exception_decisions_quantity_positive": "requested_quantity > 0 AND (approved_quantity IS NULL OR approved_quantity > 0)",
		"production_exception_decisions_version_positive":  "version > 0",
		"production_exception_decisions_intent_bundle":     "length(trim(idempotency_key)) BETWEEN 1 AND 128 AND length(idempotency_payload_hash) = 64",
	}}}
}
func (ProductionExceptionDecision) Fields() []ent.Field {
	return []ent.Field{
		field.String("decision_no").NotEmpty().MaxLen(64).Immutable(), field.String("decision_type").NotEmpty().MaxLen(32).Immutable(),
		field.String("status").NotEmpty().Default("SUBMITTED").MaxLen(16),
		field.Int("production_order_id").Positive().Immutable(), field.Int("production_order_item_id").Positive().Immutable(),
		field.Int("production_material_requirement_id").Optional().Nillable().Positive().Immutable(),
		field.Int("production_wip_batch_id").Optional().Nillable().Positive().Immutable(),
		field.Int("quality_inspection_id").Optional().Nillable().Positive().Immutable(),
		immutableDecimalQuantityField("requested_quantity"), optionalDecimalField("approved_quantity"),
		field.String("reason").NotEmpty().MaxLen(255).Immutable(),
		field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(), field.String("idempotency_payload_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(),
		field.Int("version").Default(1).Positive(), field.Int("requested_by").Positive().Immutable(), field.Time("requested_at").Default(time.Now).Immutable(),
		field.Int("decided_by").Optional().Nillable().Positive(), field.Time("decided_at").Optional().Nillable(), field.String("decision_reason").Optional().Nillable().MaxLen(255),
	}
}
func (ProductionExceptionDecision) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("decision_no").Unique(), index.Fields("requested_by", "idempotency_key").Unique(),
		index.Fields("decision_type", "status", "requested_at"), index.Fields("production_order_id", "production_order_item_id"),
		index.Fields("quality_inspection_id").Unique().Annotations(entsql.IndexWhere("decision_type = 'WIP_CONCESSION' AND (status = 'SUBMITTED' OR status = 'APPROVED')")),
	}
}
