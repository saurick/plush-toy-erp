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

type StockReservation struct {
	ent.Schema
}

var stockReservationLockedFields = map[string]struct{}{
	"reservation_no":      {},
	"status":              {},
	"sales_order_id":      {},
	"sales_order_item_id": {},
	"product_id":          {},
	"warehouse_id":        {},
	"unit_id":             {},
	"lot_id":              {},
	"quantity":            {},
	"idempotency_key":     {},
	"reserved_at":         {},
	"released_at":         {},
	"consumed_at":         {},
}

func (StockReservation) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("stock_reservations are immutable allocation facts; release or consume reservations instead of deleting them")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, stockReservationLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("stock_reservation protected fields are immutable; use ReleaseStockReservation or ConsumeStockReservation for status changes")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (StockReservation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"stock_reservations_status_allowed":    "status IN ('ACTIVE', 'RELEASED', 'CONSUMED', 'CANCELLED')",
				"stock_reservations_quantity_positive": "quantity > 0",
			},
		},
	}
}

func (StockReservation) Fields() []ent.Field {
	return []ent.Field{
		field.String("reservation_no").NotEmpty().MaxLen(64),
		field.String("status").NotEmpty().Default("ACTIVE").MaxLen(32),
		field.Int("sales_order_id").Optional().Nillable().Positive(),
		field.Int("sales_order_item_id").Optional().Nillable().Positive(),
		field.Int("product_id").Positive(),
		field.Int("warehouse_id").Positive(),
		field.Int("unit_id").Positive(),
		field.Int("lot_id").Optional().Nillable().Positive(),
		decimalQuantityField("quantity"),
		field.String("idempotency_key").NotEmpty().MaxLen(128),
		field.Time("reserved_at").Default(time.Now),
		field.Time("released_at").Optional().Nillable(),
		field.Time("consumed_at").Optional().Nillable(),
		field.String("note").Optional().Nillable().MaxLen(255),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (StockReservation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("sales_order", SalesOrder.Type).Ref("stock_reservations").Field("sales_order_id").Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("sales_order_item", SalesOrderItem.Type).Ref("stock_reservations").Field("sales_order_item_id").Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("product", Product.Type).Ref("stock_reservations").Field("product_id").Required().Unique(),
		edge.From("warehouse", Warehouse.Type).Ref("stock_reservations").Field("warehouse_id").Required().Unique(),
		edge.From("unit", Unit.Type).Ref("stock_reservations").Field("unit_id").Required().Unique(),
		edge.From("inventory_lot", InventoryLot.Type).Ref("stock_reservations").Field("lot_id").Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (StockReservation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("reservation_no").Unique(),
		index.Fields("idempotency_key").Unique(),
		index.Fields("status"),
		index.Fields("sales_order_id"),
		index.Fields("sales_order_item_id"),
		index.Fields("product_id", "warehouse_id", "lot_id"),
	}
}
