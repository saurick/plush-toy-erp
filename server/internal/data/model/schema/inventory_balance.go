package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type InventoryBalance struct {
	ent.Schema
}

func (InventoryBalance) Fields() []ent.Field {
	return []ent.Field{
		field.String("subject_type").
			NotEmpty().
			MaxLen(16),
		field.Int("subject_id").
			Positive(),
		field.Int("warehouse_id").
			Positive(),
		field.Int("lot_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("unit_id").
			Positive(),
		decimalQuantityField("quantity"),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (InventoryBalance) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("warehouse", Warehouse.Type).
			Ref("inventory_balances").
			Field("warehouse_id").
			Required().
			Unique(),
		edge.From("unit", Unit.Type).
			Ref("inventory_balances").
			Field("unit_id").
			Required().
			Unique(),
		edge.From("inventory_lot", InventoryLot.Type).
			Ref("inventory_balances").
			Field("lot_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (InventoryBalance) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("subject_type", "subject_id", "warehouse_id", "unit_id").
			Unique().
			Annotations(
				entsql.IndexWhere("lot_id IS NULL"),
			),
		index.Fields("subject_type", "subject_id", "warehouse_id", "unit_id", "lot_id").
			Unique().
			Annotations(
				entsql.IndexWhere("lot_id IS NOT NULL"),
			),
	}
}
