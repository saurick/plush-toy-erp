package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type BusinessRecordItem struct {
	ent.Schema
}

func (BusinessRecordItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("record_id").
			Positive(),
		field.String("module_key").
			NotEmpty().
			MaxLen(64),
		field.Int("line_no").
			Default(1).
			Positive(),
		field.String("item_name").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("material_name").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("spec").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("unit").
			Optional().
			Nillable().
			MaxLen(32),
		field.Float("quantity").
			Optional().
			Nillable(),
		field.Float("unit_price").
			Optional().
			Nillable(),
		field.Float("amount").
			Optional().
			Nillable(),
		field.String("supplier_name").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("warehouse_location").
			Optional().
			Nillable().
			MaxLen(255),
		field.JSON("payload", map[string]any{}).
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (BusinessRecordItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("record_id"),
		index.Fields("module_key"),
		index.Fields("record_id", "line_no"),
	}
}
