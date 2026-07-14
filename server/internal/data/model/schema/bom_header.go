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

type BOMHeader struct {
	ent.Schema
}

func (BOMHeader) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"bom_headers_status_allowed":          "status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')",
			"bom_headers_effective_dates_ordered": "effective_from IS NULL OR effective_to IS NULL OR effective_to > effective_from",
		}},
	}
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
		field.String("source_order_no").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("quantity_text").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("spare_text").
			Optional().
			Nillable().
			MaxLen(64),
		field.Time("print_date").
			Optional().
			Nillable(),
		field.String("designer").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("maker").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("auditor").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("hair_direction").
			Optional().
			Nillable().
			MaxLen(64),
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
