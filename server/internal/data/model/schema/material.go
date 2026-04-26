package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type Material struct {
	ent.Schema
}

func (Material) Fields() []ent.Field {
	return []ent.Field{
		field.String("code").
			NotEmpty().
			MaxLen(64),
		field.String("name").
			NotEmpty().
			MaxLen(255),
		field.String("category").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("spec").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("color").
			Optional().
			Nillable().
			MaxLen(64),
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

func (Material) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("default_unit", Unit.Type).
			Ref("materials").
			Field("default_unit_id").
			Required().
			Unique(),
		edge.To("bom_items", BOMItem.Type),
		edge.To("purchase_receipt_items", PurchaseReceiptItem.Type),
		edge.To("purchase_return_items", PurchaseReturnItem.Type),
	}
}

func (Material) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("code").Unique(),
		index.Fields("category"),
		index.Fields("name"),
	}
}
