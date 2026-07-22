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
		"inventory_operations_status_allowed":   "status IN ('DRAFT', 'POSTED', 'CANCELLED')",
		"inventory_operations_version_positive": "version > 0",
		"inventory_operations_intent_bundle":    "length(trim(idempotency_key)) BETWEEN 1 AND 128 AND length(idempotency_payload_hash) = 64 AND idempotency_item_count > 0",
		"inventory_operations_cancel_bundle":    "((status = 'CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL AND length(trim(cancel_reason)) > 0) OR (status <> 'CANCELLED' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL))",
	}}}
}

func (InventoryOperation) Fields() []ent.Field {
	return []ent.Field{
		field.String("operation_no").NotEmpty().MaxLen(64).Immutable(),
		field.String("operation_type").NotEmpty().MaxLen(32).Immutable(),
		field.String("status").NotEmpty().Default("DRAFT").MaxLen(16),
		field.String("reason").NotEmpty().MaxLen(255).Immutable(),
		field.String("approval_ref").Optional().Nillable().MaxLen(128).Immutable(),
		field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(),
		field.String("idempotency_payload_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(),
		field.Int("idempotency_item_count").Positive().Immutable(),
		field.Int("version").Default(1).Positive(),
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
