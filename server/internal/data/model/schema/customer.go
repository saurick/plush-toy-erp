package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type Customer struct {
	ent.Schema
}

func (Customer) Fields() []ent.Field {
	return []ent.Field{
		field.String("code").
			NotEmpty().
			MaxLen(64),
		field.String("name").
			NotEmpty().
			MaxLen(255),
		field.String("short_name").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("default_payment_method").
			Optional().
			Nillable().
			MaxLen(128),
		field.Int("default_payment_term_days").
			Optional().
			Nillable().
			NonNegative(),
		field.String("tax_no").
			Optional().
			Nillable().
			MaxLen(64),
		field.Bool("is_active").
			Default(true),
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

func (Customer) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("sales_orders", SalesOrder.Type),
		edge.To("shipments", Shipment.Type),
	}
}

func (Customer) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("code").Unique(),
		index.Fields("name"),
		index.Fields("short_name"),
		index.Fields("default_payment_method"),
		index.Fields("is_active"),
	}
}
