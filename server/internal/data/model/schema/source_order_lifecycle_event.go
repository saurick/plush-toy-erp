package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// SourceOrderLifecycleEvent is an append-only command receipt shared by the
// three source-order aggregates. Current lifecycle state remains on each
// owning order table; this record only proves the exact authenticated action.
type SourceOrderLifecycleEvent struct{ ent.Schema }

func (SourceOrderLifecycleEvent) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"source_order_lifecycle_events_source_allowed":   "source_type IN ('sales_order', 'purchase_order', 'outsourcing_order')",
		"source_order_lifecycle_events_version_positive": "source_version > 0",
		"source_order_lifecycle_events_hash_length":      "length(intent_hash) = 64",
		"source_order_lifecycle_events_contract_v1":      "result_contract = 'source-order-lifecycle-result/v1'",
	}}}
}

func (SourceOrderLifecycleEvent) Fields() []ent.Field {
	return []ent.Field{
		field.String("source_type").NotEmpty().MaxLen(32).Immutable(),
		field.Int("source_id").Positive().Immutable(),
		field.Int("source_version").Positive().Immutable(),
		field.String("action_key").NotEmpty().MaxLen(32).Immutable(),
		field.String("from_status").NotEmpty().MaxLen(32).Immutable(),
		field.String("to_status").NotEmpty().MaxLen(32).Immutable(),
		field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(),
		field.String("intent_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(),
		field.String("reason").Optional().Nillable().MaxLen(255).Immutable(),
		field.String("close_mode").Optional().Nillable().MaxLen(32).Immutable(),
		field.String("result_contract").NotEmpty().MaxLen(64).Immutable(),
		field.JSON("mutation_result", map[string]any{}).Immutable(),
		field.Int("actor_id").Positive().Immutable(),
		field.Time("created_at").Default(time.Now).Immutable(),
	}
}

func (SourceOrderLifecycleEvent) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("source_type", "source_id", "idempotency_key").Unique(),
		index.Fields("source_type", "source_id", "source_version").Unique(),
		index.Fields("actor_id", "created_at"),
	}
}
