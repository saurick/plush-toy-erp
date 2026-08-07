package schema

import (
	"context"
	"errors"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type ReworkIntakeItem struct{ ent.Schema }

var reworkIntakeItemLockedFields = map[string]struct{}{
	"rework_intake_id":                {},
	"line_no":                         {},
	"source_shipment_item_id":         {},
	"target_production_order_item_id": {},
	"product_id":                      {},
	"product_sku_id":                  {},
	"receiving_warehouse_id":          {},
	"unit_id":                         {},
	"received_lot_id":                 {},
	"quantity":                        {},
	"note":                            {},
}

func (ReworkIntakeItem) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("rework intake items are immutable source lines")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, reworkIntakeItemLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("rework_intake_item source fields are immutable after creation")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (ReworkIntakeItem) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"rework_intake_items_quantity_positive": "quantity > 0",
	}}}
}

func (ReworkIntakeItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("rework_intake_id").Positive().Immutable(),
		field.String("line_no").NotEmpty().MaxLen(32).Immutable(),
		field.Int("source_shipment_item_id").Positive().Immutable(),
		field.Int("target_production_order_item_id").Positive().Immutable(),
		field.Int("product_id").Positive().Immutable(),
		field.Int("product_sku_id").Optional().Nillable().Positive().Immutable(),
		field.Int("receiving_warehouse_id").Positive().Immutable(),
		field.Int("unit_id").Positive().Immutable(),
		field.Int("received_lot_id").Optional().Nillable().Positive(),
		immutableDecimalQuantityField("quantity"),
		field.String("note").Optional().Nillable().MaxLen(255).Immutable(),
		field.Time("created_at").Default(time.Now).Immutable(),
	}
}

func (ReworkIntakeItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("rework_intake", ReworkIntake.Type).
			Ref("items").
			Field("rework_intake_id").
			Required().
			Unique().
			Immutable(),
		edge.To("source_shipment_item", ShipmentItem.Type).
			Field("source_shipment_item_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("target_production_order_item", ProductionOrderItem.Type).
			Field("target_production_order_item_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("product", Product.Type).
			Field("product_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("product_sku", ProductSKU.Type).
			Field("product_sku_id").
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("receiving_warehouse", Warehouse.Type).
			Field("receiving_warehouse_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("unit", Unit.Type).
			Field("unit_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("received_lot", InventoryLot.Type).
			Field("received_lot_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ReworkIntakeItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("rework_intake_id", "line_no").Unique(),
		index.Fields("source_shipment_item_id"),
		index.Fields("target_production_order_item_id"),
		index.Fields("received_lot_id").Unique(),
		index.Fields("product_id", "product_sku_id", "receiving_warehouse_id"),
	}
}
