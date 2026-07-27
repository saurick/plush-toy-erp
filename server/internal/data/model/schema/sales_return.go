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

type SalesReturn struct{ ent.Schema }

func (SalesReturn) Hooks() []ent.Hook {
	return []ent.Hook{rejectMutationOps(ent.OpDelete|ent.OpDeleteOne, "sales returns are auditable source documents; cancel them instead of deleting them")}
}
func (SalesReturn) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"sales_returns_status_allowed":   "status IN ('DRAFT', 'APPROVED', 'REJECTED', 'RECEIVED', 'CANCELLED', 'REVERSED')",
		"sales_returns_version_positive": "version > 0",
		"sales_returns_intent_bundle":    "length(trim(idempotency_key)) BETWEEN 1 AND 128 AND length(idempotency_payload_hash) = 64 AND idempotency_item_count > 0",
		"sales_returns_maker_checker":    "((approved_by IS NULL OR approved_by <> created_by) AND (rejected_by IS NULL OR rejected_by <> created_by))",
		"sales_returns_lifecycle_audit": `
(
  (status = 'DRAFT'
    AND approved_at IS NULL AND approved_by IS NULL
    AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL
    AND received_at IS NULL AND received_by IS NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
  OR
  (status = 'APPROVED'
    AND approved_at IS NOT NULL AND approved_by IS NOT NULL
    AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL
    AND received_at IS NULL AND received_by IS NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
  OR
  (status = 'REJECTED'
    AND approved_at IS NULL AND approved_by IS NULL
    AND rejected_at IS NOT NULL AND rejected_by IS NOT NULL
    AND reject_reason IS NOT NULL AND length(trim(reject_reason)) BETWEEN 1 AND 255
    AND received_at IS NULL AND received_by IS NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
  OR
  (status = 'RECEIVED'
    AND approved_at IS NOT NULL AND approved_by IS NOT NULL
    AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL
    AND received_at IS NOT NULL AND received_by IS NOT NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
  OR
  (status = 'CANCELLED'
    AND ((approved_at IS NULL AND approved_by IS NULL)
      OR (approved_at IS NOT NULL AND approved_by IS NOT NULL))
    AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL
    AND received_at IS NULL AND received_by IS NULL
    AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
    AND cancel_reason IS NOT NULL AND length(trim(cancel_reason)) BETWEEN 1 AND 255
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
  OR
  (status = 'REVERSED'
    AND approved_at IS NOT NULL AND approved_by IS NOT NULL
    AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL
    AND received_at IS NOT NULL AND received_by IS NOT NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL
    AND reverse_reason IS NOT NULL AND length(trim(reverse_reason)) BETWEEN 1 AND 255)
)`,
	}}}
}
func (SalesReturn) Fields() []ent.Field {
	return []ent.Field{
		field.String("return_no").NotEmpty().MaxLen(64).Immutable(), field.Int("shipment_id").Positive().Immutable(),
		field.Int("customer_id").Positive().Immutable(), field.String("customer_name_snapshot").NotEmpty().MaxLen(255).Immutable(),
		field.String("status").NotEmpty().Default("DRAFT").MaxLen(16), field.String("reason").NotEmpty().MaxLen(255).Immutable(),
		field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(), field.String("idempotency_payload_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(), field.Int("idempotency_item_count").Positive().Immutable(),
		field.Int("version").Default(1).Positive(), field.Time("approved_at").Optional().Nillable(), field.Int("approved_by").Optional().Nillable().Positive(),
		field.Time("rejected_at").Optional().Nillable(), field.Int("rejected_by").Optional().Nillable().Positive(), field.String("reject_reason").Optional().Nillable().MaxLen(255),
		field.Time("received_at").Optional().Nillable(), field.Int("received_by").Optional().Nillable().Positive(),
		field.Time("cancelled_at").Optional().Nillable(), field.Int("cancelled_by").Optional().Nillable().Positive(), field.String("cancel_reason").Optional().Nillable().MaxLen(255),
		field.Time("reversed_at").Optional().Nillable(), field.Int("reversed_by").Optional().Nillable().Positive(), field.String("reverse_reason").Optional().Nillable().MaxLen(255),
		field.Int("created_by").Positive().Immutable(), field.Time("created_at").Default(time.Now).Immutable(), field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}
func (SalesReturn) Edges() []ent.Edge { return []ent.Edge{edge.To("items", SalesReturnItem.Type)} }
func (SalesReturn) Indexes() []ent.Index {
	return []ent.Index{index.Fields("return_no").Unique(), index.Fields("created_by", "idempotency_key").Unique(), index.Fields("shipment_id", "status")}
}
