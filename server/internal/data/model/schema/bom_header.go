package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type BOMHeader struct {
	ent.Schema
}

func (BOMHeader) Fields() []ent.Field {
	return []ent.Field{
		field.Int("product_id").
			Positive(),
		field.String("version").
			NotEmpty().
			MaxLen(64),
		field.String("status").
			NotEmpty().
			Default("DRAFT").
			MaxLen(32),
		field.Time("effective_from").
			Optional().
			Nillable(),
		field.Time("effective_to").
			Optional().
			Nillable(),
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

func (BOMHeader) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("product", Product.Type).
			Ref("bom_headers").
			Field("product_id").
			Required().
			Unique(),
		edge.To("items", BOMItem.Type),
	}
}

func (BOMHeader) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("product_id", "version").Unique(),
		index.Fields("product_id").
			Unique().
			Annotations(
				entsql.IndexWhere("status = 'ACTIVE'"),
			),
		index.Fields("product_id", "status"),
	}
}
