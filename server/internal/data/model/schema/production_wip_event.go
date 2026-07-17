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

// ProductionWIPEvent is an append-only command receipt. Internal movement is
// WIP_TRANSFER; only an external processing return is OUTSOURCE_RETURN.
type ProductionWIPEvent struct {
	ent.Schema
}

func (ProductionWIPEvent) Hooks() []ent.Hook {
	return []ent.Hook{
		rejectMutationOps(
			ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne,
			"production WIP events are append-only command receipts",
		),
	}
}

func (ProductionWIPEvent) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"production_wip_events_action_allowed":    "action IN ('INITIALIZE', 'SPLIT_BATCH', 'ASSIGN_EXECUTION', 'START_OPERATION', 'COMPLETE_OPERATION', 'WIP_TRANSFER', 'OUTSOURCE_RETURN', 'REWORK', 'CANCEL')",
			"production_wip_events_status_allowed":    "((from_status IS NULL OR from_status IN ('PLANNED', 'SPLIT', 'IN_PROGRESS', 'OUTSOURCED', 'WAITING_QUALITY', 'ACCEPTED', 'REJECTED', 'CANCELLED')) AND (to_status IN ('PLANNED', 'SPLIT', 'IN_PROGRESS', 'OUTSOURCED', 'WAITING_QUALITY', 'ACCEPTED', 'REJECTED', 'CANCELLED')))",
			"production_wip_events_version_positive":  "batch_version > 0",
			"production_wip_events_quantity_positive": "quantity > 0",
			"production_wip_events_key_present":       "length(trim(idempotency_key)) BETWEEN 1 AND 128",
			"production_wip_events_hash_length":       "length(intent_hash) = 64",
			"production_wip_events_contract_v1":       "result_contract = 'production.wip-mutation-result/v1'",
		}},
	}
}

func (ProductionWIPEvent) Fields() []ent.Field {
	return []ent.Field{
		field.Int("production_wip_batch_id").Positive().Immutable(),
		field.Int("actor_id").Positive().Immutable(),
		field.String("action").NotEmpty().MaxLen(40).Immutable(),
		field.String("from_status").Optional().Nillable().MaxLen(32).Immutable(),
		field.String("to_status").NotEmpty().MaxLen(32).Immutable(),
		field.Int("batch_version").Positive().Immutable(),
		immutableDecimalQuantityField("quantity"),
		field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(),
		field.String("intent_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(),
		field.String("result_contract").NotEmpty().MaxLen(64).Immutable(),
		field.JSON("mutation_result", map[string]any{}).Immutable(),
		field.String("reason").Optional().Nillable().MaxLen(255).Immutable(),
		field.Time("created_at").Default(time.Now).Immutable(),
	}
}

func (ProductionWIPEvent) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("production_wip_batch", ProductionWIPBatch.Type).
			Ref("events").
			Field("production_wip_batch_id").
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

func (ProductionWIPEvent) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("production_wip_batch_id", "actor_id", "action", "idempotency_key").Unique(),
		index.Fields("production_wip_batch_id", "batch_version").Unique(),
		index.Fields("production_wip_batch_id", "created_at"),
	}
}
