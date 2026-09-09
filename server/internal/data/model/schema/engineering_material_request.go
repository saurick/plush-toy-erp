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

// EngineeringMaterialRequest records the reviewed order-specific material demand.
// Its immutable source snapshot is evidence, not an inventory or purchase ledger.
type EngineeringMaterialRequest struct{ ent.Schema }

func (EngineeringMaterialRequest) Fields() []ent.Field {
	return []ent.Field{
		field.Int("sales_order_id").Positive(),
		field.Int("source_order_version").Positive(),
		field.String("order_no_snapshot").NotEmpty().MaxLen(64),
		field.String("status").Default("SUBMITTED").MaxLen(24),
		field.Int("version").Default(1).Positive(),
		field.JSON("source_snapshot", []map[string]any{}),
		field.Int("submitted_by").Positive(),
		field.Time("submitted_at").Default(time.Now).Immutable(),
		field.Int("boss_reviewed_by").Optional().Nillable().Positive(),
		field.Time("boss_reviewed_at").Optional().Nillable(),
		field.Int("finance_reviewed_by").Optional().Nillable().Positive(),
		field.Time("finance_reviewed_at").Optional().Nillable(),
		field.Int("rejected_by").Optional().Nillable().Positive(),
		field.Time("rejected_at").Optional().Nillable(),
		field.String("review_note").Optional().Nillable().MaxLen(255),
		field.String("boss_review_note").Optional().Nillable().MaxLen(255),
		field.String("finance_review_note").Optional().Nillable().MaxLen(255),
	}
}
func (EngineeringMaterialRequest) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("sales_order", SalesOrder.Type).Field("sales_order_id").Required().Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("items", EngineeringMaterialRequestItem.Type),
	}
}
func (EngineeringMaterialRequest) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("sales_order_id").Unique().Annotations(entsql.IndexWhere("status <> 'REJECTED'")),
		index.Fields("status", "submitted_at"),
	}
}
func (EngineeringMaterialRequest) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"engineering_material_requests_status_allowed":     "status IN ('SUBMITTED', 'BOSS_APPROVED', 'APPROVED', 'REJECTED')",
		"engineering_material_requests_boss_evidence":      "status NOT IN ('BOSS_APPROVED', 'APPROVED') OR (boss_reviewed_by IS NOT NULL AND boss_reviewed_at IS NOT NULL)",
		"engineering_material_requests_finance_evidence":   "status <> 'APPROVED' OR (finance_reviewed_by IS NOT NULL AND finance_reviewed_at IS NOT NULL)",
		"engineering_material_requests_rejection_evidence": "status <> 'REJECTED' OR (rejected_by IS NOT NULL AND rejected_at IS NOT NULL AND review_note IS NOT NULL)",
	}}}
}
