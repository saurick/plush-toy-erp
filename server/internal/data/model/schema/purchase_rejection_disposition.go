package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"time"
)

type PurchaseRejectionDisposition struct{ ent.Schema }

func (PurchaseRejectionDisposition) Hooks() []ent.Hook {
	return []ent.Hook{rejectMutationOps(ent.OpDelete|ent.OpDeleteOne, "purchase rejection dispositions are auditable and cannot be deleted")}
}
func (PurchaseRejectionDisposition) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"purchase_rejection_dispositions_type_allowed":      "disposition_type IN ('RETURN_TO_VENDOR', 'REPLACE')",
		"purchase_rejection_dispositions_status_allowed":    "status IN ('DRAFT', 'POSTED', 'CANCELLED')",
		"purchase_rejection_dispositions_quantity_positive": "quantity > 0",
		"purchase_rejection_dispositions_intent_bundle":     "length(trim(idempotency_key)) BETWEEN 1 AND 128 AND length(idempotency_payload_hash) = 64",
		"purchase_rejection_dispositions_version_positive":  "version > 0",
	}}}
}
func (PurchaseRejectionDisposition) Fields() []ent.Field {
	return []ent.Field{
		field.String("disposition_no").NotEmpty().MaxLen(64).Immutable(),
		field.Int("quality_inspection_id").Positive().Immutable(),
		field.Int("purchase_receipt_id").Positive().Immutable(),
		field.Int("purchase_receipt_item_id").Positive().Immutable(),
		field.String("disposition_type").NotEmpty().MaxLen(32).Immutable(),
		field.String("status").NotEmpty().Default("DRAFT").MaxLen(16),
		immutableDecimalQuantityField("quantity"),
		field.Int("supplier_id").Optional().Nillable().Positive().Immutable(),
		field.String("supplier_name").NotEmpty().MaxLen(255).Immutable(),
		field.String("reason").NotEmpty().MaxLen(255).Immutable(),
		field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(),
		field.String("idempotency_payload_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(),
		field.Int("version").Default(1).Positive(),
		field.Time("posted_at").Optional().Nillable(), field.Int("posted_by").Optional().Nillable().Positive(),
		field.Time("cancelled_at").Optional().Nillable(), field.Int("cancelled_by").Optional().Nillable().Positive(),
		field.String("cancel_reason").Optional().Nillable().MaxLen(255),
		field.Int("created_by").Positive().Immutable(), field.Time("created_at").Default(time.Now).Immutable(),
	}
}
func (PurchaseRejectionDisposition) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("disposition_no").Unique(), index.Fields("created_by", "idempotency_key").Unique(),
		index.Fields("quality_inspection_id").Unique().Annotations(entsql.IndexWhere("status <> 'CANCELLED'")),
	}
}
