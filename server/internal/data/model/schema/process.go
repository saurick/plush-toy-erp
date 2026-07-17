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

type Process struct {
	ent.Schema
}

func (Process) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"processes_sort_order_non_negative": "sort_order >= 0",
			},
		},
	}
}

func (Process) Fields() []ent.Field {
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
		field.Bool("outsourcing_enabled").
			Default(false),
		field.Bool("inhouse_enabled").
			Default(true),
		field.Bool("quality_required").
			Default(false),
		field.Int("sort_order").
			Default(0).
			NonNegative(),
		field.String("note").
			Optional().
			Nillable().
			MaxLen(255),
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

func (Process) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("outsourcing_order_items", OutsourcingOrderItem.Type),
		edge.From("capable_suppliers", Supplier.Type).
			Ref("process_capabilities"),
	}
}

func (Process) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("code").Unique(),
		index.Fields("category"),
		index.Fields("outsourcing_enabled"),
		index.Fields("inhouse_enabled"),
		index.Fields("is_active"),
		index.Fields("sort_order", "id"),
	}
}
