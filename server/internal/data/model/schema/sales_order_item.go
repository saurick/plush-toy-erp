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

type SalesOrderItem struct {
	ent.Schema
}

func (SalesOrderItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"sales_order_items_line_no_positive":        "line_no > 0",
				"sales_order_items_ordered_qty_positive":    "ordered_quantity > 0",
				"sales_order_items_unit_price_non_negative": "unit_price IS NULL OR unit_price >= 0",
				"sales_order_items_amount_non_negative":     "amount IS NULL OR amount >= 0",
				"sales_order_items_line_status_allowed":     "line_status IN ('open', 'closed', 'canceled')",
			},
		},
	}
}

func (SalesOrderItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("sales_order_id").
			Positive(),
		field.Int("line_no").
			Positive(),
		field.Int("product_id").
			Positive(),
		field.Int("unit_id").
			Positive(),
		field.String("product_code_snapshot").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("product_name_snapshot").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("color_snapshot").
			Optional().
			Nillable().
			MaxLen(64),
		decimalQuantityField("ordered_quantity"),
		optionalDecimalField("unit_price"),
		optionalDecimalField("amount"),
		field.Time("planned_delivery_date").
			Optional().
			Nillable(),
		field.String("line_status").
			NotEmpty().
			Default("open").
			MaxLen(32),
		field.String("note").
			Optional().
			Nillable().
			MaxLen(255),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (SalesOrderItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("sales_order", SalesOrder.Type).
			Ref("items").
			Field("sales_order_id").
			Required().
			Unique(),
		edge.To("product", Product.Type).
			Field("product_id").
			Required().
			Unique(),
		edge.To("unit", Unit.Type).
			Field("unit_id").
			Required().
			Unique(),
		edge.To("shipment_items", ShipmentItem.Type),
		edge.To("stock_reservations", StockReservation.Type),
	}
}

func (SalesOrderItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("sales_order_id", "line_no").Unique(),
		index.Fields("product_id"),
		index.Fields("unit_id"),
		index.Fields("line_status"),
		index.Fields("planned_delivery_date"),
	}
}
