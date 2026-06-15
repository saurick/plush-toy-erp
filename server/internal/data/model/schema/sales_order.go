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

type SalesOrder struct {
	ent.Schema
}

func (SalesOrder) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"sales_orders_lifecycle_status_allowed": "lifecycle_status IN ('draft', 'submitted', 'active', 'closed', 'canceled')",
			},
		},
	}
}

func (SalesOrder) Fields() []ent.Field {
	return []ent.Field{
		field.String("order_no").
			NotEmpty().
			MaxLen(64),
		field.Int("customer_id").
			Positive(),
		field.String("customer_order_no").
			Optional().
			Nillable().
			MaxLen(128),
		// Snapshot preserves order-time display data; Customer remains the master truth.
		field.JSON("customer_snapshot", map[string]any{}).
			Optional(),
		field.Time("order_date"),
		field.Time("planned_delivery_date").
			Optional().
			Nillable(),
		field.String("lifecycle_status").
			NotEmpty().
			Default("draft").
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

func (SalesOrder) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("customer", Customer.Type).
			Ref("sales_orders").
			Field("customer_id").
			Required().
			Unique(),
		edge.To("items", SalesOrderItem.Type),
		edge.To("shipments", Shipment.Type),
		edge.To("stock_reservations", StockReservation.Type),
	}
}

func (SalesOrder) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("order_no").Unique(),
		index.Fields("customer_id"),
		index.Fields("customer_order_no"),
		index.Fields("lifecycle_status"),
		index.Fields("order_date"),
		index.Fields("planned_delivery_date"),
	}
}
