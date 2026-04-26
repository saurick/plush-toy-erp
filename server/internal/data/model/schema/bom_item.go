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

type BOMItem struct {
	ent.Schema
}

func (BOMItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"bom_items_quantity_positive":      "quantity > 0",
				"bom_items_loss_rate_non_negative": "loss_rate >= 0",
			},
		},
	}
}

func (BOMItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("bom_header_id").
			Positive(),
		field.Int("material_id").
			Positive(),
		decimalQuantityField("quantity"),
		field.Int("unit_id").
			Positive(),
		decimalRateField("loss_rate"),
		field.String("position").
			Optional().
			Nillable().
			MaxLen(128),
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

func (BOMItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("bom_header", BOMHeader.Type).
			Ref("items").
			Field("bom_header_id").
			Required().
			Unique(),
		edge.From("material", Material.Type).
			Ref("bom_items").
			Field("material_id").
			Required().
			Unique(),
		edge.From("unit", Unit.Type).
			Ref("bom_items").
			Field("unit_id").
			Required().
			Unique(),
	}
}

func (BOMItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("bom_header_id", "material_id"),
	}
}
