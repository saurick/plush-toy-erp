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
				"sales_orders_version_positive":         "version > 0",
				"sales_orders_currency_allowed":         "currency IN ('USD', 'CNY', 'HKD')",
				"sales_orders_tax_mode_allowed":         "tax_mode IS NULL OR tax_mode IN ('INCLUSIVE', 'EXCLUSIVE', 'NONE')",
				"sales_orders_tax_rate_valid":           "tax_rate IS NULL OR (tax_rate > 0 AND tax_rate <= 100)",
				"sales_orders_tax_pair_valid":           "((tax_mode IS NULL AND tax_rate IS NULL) OR (tax_mode = 'NONE' AND tax_rate IS NULL) OR (tax_mode IN ('INCLUSIVE', 'EXCLUSIVE') AND tax_rate IS NOT NULL))",
				"sales_orders_freight_terms_allowed":    "freight_terms IS NULL OR freight_terms IN ('INCLUDED', 'EXCLUDED')",
				"sales_orders_goods_amount_nonnegative": "goods_amount IS NULL OR goods_amount >= 0",
				"sales_orders_tax_amount_nonnegative":   "tax_amount IS NULL OR tax_amount >= 0",
				"sales_orders_order_total_nonnegative":  "order_total IS NULL OR order_total >= 0",
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
		field.String("currency").
			NotEmpty().
			Default("CNY").
			MaxLen(16),
		field.String("customer_order_no").
			Optional().
			Nillable().
			MaxLen(128),
		// Snapshot preserves order-time display data; Customer remains the master truth.
		field.JSON("customer_snapshot", map[string]any{}).
			Optional(),
		field.String("sales_owner").
			Optional().
			Nillable().
			MaxLen(128),
		field.JSON("contact_snapshot", map[string]any{}).
			Optional(),
		field.JSON("delivery_snapshot", map[string]any{}).
			Optional(),
		field.String("payment_method").
			Optional().
			Nillable().
			MaxLen(128),
		field.Int("payment_term_days").
			Optional().
			Nillable().
			NonNegative(),
		field.String("price_condition_note").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("tax_mode").Optional().Nillable().MaxLen(32),
		optionalDecimalField("tax_rate"),
		field.String("freight_terms").Optional().Nillable().MaxLen(32),
		optionalDecimalField("goods_amount"),
		optionalDecimalField("tax_amount"),
		optionalDecimalField("order_total"),
		field.Time("order_date"),
		field.Time("planned_delivery_date").
			Optional().
			Nillable(),
		field.String("lifecycle_status").
			NotEmpty().
			Default("draft").
			MaxLen(32),
		field.Int("version").
			Positive().
			Default(1),
		field.String("settlement_action").Optional().Nillable().MaxLen(32),
		field.String("settlement_mode").Optional().Nillable().MaxLen(32),
		field.String("settlement_reason").Optional().Nillable().MaxLen(255),
		field.Time("settled_at").Optional().Nillable(),
		field.Int("settled_by").Optional().Nillable().Positive(),
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
		index.Fields("sales_owner"),
		index.Fields("payment_method"),
		index.Fields("lifecycle_status"),
		index.Fields("order_date"),
		index.Fields("planned_delivery_date"),
	}
}
