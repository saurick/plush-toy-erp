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

// InventoryLotStatusEvent is the immutable evidence behind a named lot action.
type InventoryLotStatusEvent struct{ ent.Schema }

func (InventoryLotStatusEvent) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"inventory_lot_status_events_version_positive": "lot_version > 0",
		"inventory_lot_status_events_hash_length":      "length(intent_hash) = 64",
	}}}
}

func (InventoryLotStatusEvent) Fields() []ent.Field {
	return []ent.Field{
		field.Int("inventory_lot_id").Positive().Immutable(),
		field.Int("quality_inspection_id").Optional().Nillable().Positive().Immutable(),
		field.Int("lot_version").Positive().Immutable(),
		field.String("action_key").NotEmpty().MaxLen(64).Immutable(),
		field.String("from_status").NotEmpty().MaxLen(32).Immutable(),
		field.String("to_status").NotEmpty().MaxLen(32).Immutable(),
		field.String("reason").NotEmpty().MaxLen(255).Immutable(),
		field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(),
		field.String("intent_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(),
		field.Int("actor_id").Optional().Nillable().Positive().Immutable(),
		field.Time("created_at").Default(time.Now).Immutable(),
	}
}

func (InventoryLotStatusEvent) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("inventory_lot", InventoryLot.Type).
			Ref("status_events").
			Field("inventory_lot_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("quality_inspection", QualityInspection.Type).
			Ref("inventory_lot_status_events").
			Field("quality_inspection_id").
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (InventoryLotStatusEvent) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("inventory_lot_id", "idempotency_key").Unique(),
		index.Fields("inventory_lot_id", "lot_version").Unique(),
		index.Fields("actor_id", "created_at"),
	}
}
