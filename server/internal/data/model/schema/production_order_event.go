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

type ProductionOrderEvent struct {
	ent.Schema
}

func (ProductionOrderEvent) Hooks() []ent.Hook {
	return []ent.Hook{
		rejectMutationOps(
			ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne,
			"production_order_events are append-only command receipts",
		),
	}
}

func (ProductionOrderEvent) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"production_order_events_command_allowed":     "command_key IN ('CREATE', 'SAVE', 'RELEASE', 'CLOSE', 'CANCEL')",
				"production_order_events_key_present":         "length(trim(idempotency_key)) BETWEEN 1 AND 128",
				"production_order_events_hash_length":         "length(intent_hash) = 64",
				"production_order_events_contract_v1":         "result_contract = 'production.order-mutation-result/v1'",
				"production_order_events_version_positive":    "order_version > 0",
				"production_order_events_to_status_allowed":   "to_status IN ('DRAFT', 'RELEASED', 'CLOSED', 'CANCELLED')",
				"production_order_events_from_status_allowed": "from_status IS NULL OR from_status IN ('DRAFT', 'RELEASED', 'CLOSED', 'CANCELLED')",
				"production_order_events_create_shape": `
(
  (command_key = 'CREATE' AND from_status IS NULL AND to_status = 'DRAFT' AND order_version = 1)
  OR
  (command_key <> 'CREATE' AND from_status IS NOT NULL)
)`,
				"production_order_events_reason_scope": `
(
  (
  command_key NOT IN ('CLOSE', 'CANCEL') AND reason IS NULL
)
OR
(
  command_key = 'CLOSE'
)
OR
(
  command_key = 'CANCEL' AND reason IS NOT NULL AND length(trim(reason)) BETWEEN 1 AND 255
  )
)`,
			},
		},
	}
}

func (ProductionOrderEvent) Fields() []ent.Field {
	return []ent.Field{
		field.Int("production_order_id").
			Positive().
			Immutable(),
		field.Int("actor_id").
			Positive().
			Immutable(),
		field.String("command_key").
			NotEmpty().
			MaxLen(16).
			Immutable(),
		field.String("from_status").
			Optional().
			Nillable().
			MaxLen(16).
			Immutable(),
		field.String("to_status").
			NotEmpty().
			MaxLen(16).
			Immutable(),
		field.Int("order_version").
			Positive().
			Immutable(),
		field.String("idempotency_key").
			NotEmpty().
			MaxLen(128).
			Immutable(),
		field.String("intent_hash").
			NotEmpty().
			MinLen(64).
			MaxLen(64).
			Immutable(),
		field.String("result_contract").
			NotEmpty().
			MaxLen(64).
			Immutable(),
		field.JSON("mutation_result", map[string]any{}).
			Immutable(),
		field.String("reason").
			Optional().
			Nillable().
			MaxLen(255).
			Immutable(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

func (ProductionOrderEvent) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("production_order", ProductionOrder.Type).
			Ref("events").
			Field("production_order_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("actor", AdminUser.Type).
			Field("actor_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ProductionOrderEvent) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("actor_id", "command_key", "idempotency_key").
			Unique().
			Annotations(entsql.IndexWhere("command_key = 'CREATE'")),
		index.Fields("production_order_id", "actor_id", "command_key", "idempotency_key").
			Unique().
			Annotations(entsql.IndexWhere("command_key <> 'CREATE'")),
		index.Fields("production_order_id", "order_version").Unique(),
		index.Fields("production_order_id", "created_at"),
	}
}
