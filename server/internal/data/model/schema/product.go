package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type Product struct {
	ent.Schema
}

func (Product) Fields() []ent.Field {
	return []ent.Field{
		field.String("code").
			NotEmpty().
			MaxLen(64),
		field.String("name").
			NotEmpty().
			MaxLen(255),
		field.String("style_no").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("customer_style_no").
			Optional().
			Nillable().
			MaxLen(128),
		field.Int("default_unit_id").
			Positive(),
		field.Bool("is_active").
			Default(true),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (Product) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("default_unit", Unit.Type).
			Ref("products").
			Field("default_unit_id").
			Required().
			Unique(),
		edge.To("bom_headers", BOMHeader.Type),
	}
}

func (Product) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("code").Unique(),
		index.Fields("style_no"),
		index.Fields("customer_style_no"),
		index.Fields("name"),
	}
}
