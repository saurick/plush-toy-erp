package schema

import (
	"context"
	"errors"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type InventoryTxn struct {
	ent.Schema
}

func (InventoryTxn) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpUpdate | ent.OpUpdateOne | ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("inventory_txns are immutable facts; create a reversal txn instead")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (InventoryTxn) Fields() []ent.Field {
	return []ent.Field{
		field.String("subject_type").
			NotEmpty().
			MaxLen(16).
			Immutable(),
		field.Int("subject_id").
			Positive().
			Immutable(),
		field.Int("warehouse_id").
			Positive().
			Immutable(),
		field.Int("lot_id").
			Optional().
			Nillable().
			Positive().
			Immutable(),
		field.String("txn_type").
			NotEmpty().
			MaxLen(32).
			Immutable(),
		field.Int("direction").
			Immutable(),
		immutableDecimalQuantityField("quantity"),
		field.Int("unit_id").
			Positive().
			Immutable(),
		field.String("source_type").
			NotEmpty().
			MaxLen(64).
			Immutable(),
		field.Int("source_id").
			Optional().
			Nillable().
			Positive().
			Immutable(),
		field.Int("source_line_id").
			Optional().
			Nillable().
			Positive().
			Immutable(),
		field.String("idempotency_key").
			NotEmpty().
			MaxLen(128).
			Immutable(),
		field.Int("reversal_of_txn_id").
			Optional().
			Nillable().
			Positive().
			Immutable(),
		field.Time("occurred_at").
			Default(time.Now).
			Immutable(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Int("created_by").
			Optional().
			Nillable().
			Positive().
			Immutable(),
		field.String("note").
			Optional().
			Nillable().
			MaxLen(255).
			Immutable(),
	}
}

func (InventoryTxn) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("warehouse", Warehouse.Type).
			Ref("inventory_txns").
			Field("warehouse_id").
			Required().
			Unique().
			Immutable(),
		edge.From("unit", Unit.Type).
			Ref("inventory_txns").
			Field("unit_id").
			Required().
			Unique().
			Immutable(),
		edge.From("inventory_lot", InventoryLot.Type).
			Ref("inventory_txns").
			Field("lot_id").
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (InventoryTxn) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("idempotency_key").Unique(),
		index.Fields("subject_type", "subject_id", "warehouse_id", "lot_id", "occurred_at"),
		index.Fields("source_type", "source_id", "source_line_id"),
		index.Fields("reversal_of_txn_id").Unique(),
	}
}
