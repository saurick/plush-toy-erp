package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type InventoryOperation struct{ ent.Schema }

func (InventoryOperation) Hooks() []ent.Hook {
	return []ent.Hook{rejectMutationOps(ent.OpDelete|ent.OpDeleteOne, "inventory_operations are auditable source documents; cancel them instead of deleting them")}
}

func (InventoryOperation) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"inventory_operations_type_allowed":     "operation_type IN ('CYCLE_COUNT', 'TRANSFER', 'MANUAL_ADJUSTMENT')",
		"inventory_operations_status_allowed":   "status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED', 'CANCELLED')",
		"inventory_operations_version_positive": "version > 0",
		"inventory_operations_intent_bundle":    "length(trim(idempotency_key)) BETWEEN 1 AND 128 AND length(idempotency_payload_hash) = 64 AND idempotency_item_count > 0",
		"inventory_operations_approval_bundle":  "((operation_type <> 'MANUAL_ADJUSTMENT' AND submitted_at IS NULL AND submitted_by IS NULL AND approved_at IS NULL AND approved_by IS NULL AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL) OR (operation_type = 'MANUAL_ADJUSTMENT' AND ((status = 'DRAFT' AND submitted_at IS NULL AND submitted_by IS NULL AND approved_at IS NULL AND approved_by IS NULL AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL) OR (status = 'SUBMITTED' AND submitted_at IS NOT NULL AND submitted_by IS NOT NULL AND approved_at IS NULL AND approved_by IS NULL AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL) OR (status IN ('APPROVED', 'POSTED') AND submitted_at IS NOT NULL AND submitted_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND approved_by <> created_by AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL) OR (status = 'REJECTED' AND submitted_at IS NOT NULL AND submitted_by IS NOT NULL AND approved_at IS NULL AND approved_by IS NULL AND rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND rejected_by <> created_by AND reject_reason IS NOT NULL AND length(trim(reject_reason)) > 0) OR (status = 'CANCELLED' AND ((submitted_at IS NULL AND submitted_by IS NULL AND approved_at IS NULL AND approved_by IS NULL AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL) OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL AND approved_at IS NULL AND approved_by IS NULL AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL) OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by IS NOT NULL AND approved_by <> created_by AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL))))))",
		"inventory_operations_post_bundle":      "((status = 'POSTED' AND posted_at IS NOT NULL AND posted_by IS NOT NULL) OR (status <> 'POSTED' AND posted_at IS NULL AND posted_by IS NULL) OR (status = 'CANCELLED' AND posted_at IS NOT NULL AND posted_by IS NOT NULL))",
		"inventory_operations_cancel_bundle":    "((status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL AND length(trim(cancel_reason)) > 0) OR (status <> 'CANCELLED' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL))",
	}}}
}

func (InventoryOperation) Fields() []ent.Field {
	return []ent.Field{
		field.String("operation_no").NotEmpty().MaxLen(64).Immutable(),
		field.String("operation_type").NotEmpty().MaxLen(32).Immutable(),
		field.String("status").NotEmpty().Default("DRAFT").MaxLen(16),
		field.String("reason").NotEmpty().MaxLen(255).Immutable(),
		field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(),
		field.String("idempotency_payload_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(),
		field.Int("idempotency_item_count").Positive().Immutable(),
		field.Int("version").Default(1).Positive(),
		field.Time("submitted_at").Optional().Nillable(),
		field.Int("submitted_by").Optional().Nillable().Positive(),
		field.Time("approved_at").Optional().Nillable(),
		field.Int("approved_by").Optional().Nillable().Positive(),
		field.Time("rejected_at").Optional().Nillable(),
		field.Int("rejected_by").Optional().Nillable().Positive(),
		field.String("reject_reason").Optional().Nillable().MaxLen(255),
		field.Time("posted_at").Optional().Nillable(),
		field.Int("posted_by").Optional().Nillable().Positive(),
		field.Time("cancelled_at").Optional().Nillable(),
		field.Int("cancelled_by").Optional().Nillable().Positive(),
		field.String("cancel_reason").Optional().Nillable().MaxLen(255),
		field.Int("created_by").Positive().Immutable(),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (InventoryOperation) Edges() []ent.Edge {
	return []ent.Edge{edge.To("items", InventoryOperationItem.Type)}
}

func (InventoryOperation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("operation_no").Unique(),
		index.Fields("created_by", "idempotency_key").Unique(),
		index.Fields("operation_type", "status", "created_at"),
	}
}
