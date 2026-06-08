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

type ShipmentItem struct {
	ent.Schema
}

var shipmentItemLockedFields = map[string]struct{}{
	"shipment_id":         {},
	"sales_order_item_id": {},
	"product_id":          {},
	"warehouse_id":        {},
	"unit_id":             {},
	"lot_id":              {},
	"quantity":            {},
}

func (ShipmentItem) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("shipment_items are immutable source lines; cancel shipped shipments with reversal instead of deleting lines")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, shipmentItemLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("shipment_item protected fields are immutable after creation")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (ShipmentItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"shipment_items_quantity_positive": "quantity > 0",
			},
		},
	}
}

func (ShipmentItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("shipment_id").Positive(),
		field.Int("sales_order_item_id").Optional().Nillable().Positive(),
		field.Int("product_id").Positive(),
		field.Int("warehouse_id").Positive(),
		field.Int("unit_id").Positive(),
		field.Int("lot_id").Optional().Nillable().Positive(),
		decimalQuantityField("quantity"),
		field.String("note").Optional().Nillable().MaxLen(255),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (ShipmentItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("shipment", Shipment.Type).Ref("items").Field("shipment_id").Required().Unique(),
		edge.From("sales_order_item", SalesOrderItem.Type).Ref("shipment_items").Field("sales_order_item_id").Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("product", Product.Type).Ref("shipment_items").Field("product_id").Required().Unique(),
		edge.From("warehouse", Warehouse.Type).Ref("shipment_items").Field("warehouse_id").Required().Unique(),
		edge.From("unit", Unit.Type).Ref("shipment_items").Field("unit_id").Required().Unique(),
		edge.From("inventory_lot", InventoryLot.Type).Ref("shipment_items").Field("lot_id").Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ShipmentItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("shipment_id"),
		index.Fields("sales_order_item_id"),
		index.Fields("product_id", "warehouse_id", "lot_id"),
	}
}
