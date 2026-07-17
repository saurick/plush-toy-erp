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

type Supplier struct {
	ent.Schema
}

func (Supplier) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"suppliers_supplier_type_allowed": "supplier_type IS NULL OR supplier_type IN ('material', 'outsourcing', 'service', 'mixed')",
			},
		},
	}
}

func (Supplier) Fields() []ent.Field {
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
		field.String("supplier_type").
			Optional().
			Nillable().
			MaxLen(32),
		field.String("address").
			Optional().
			Nillable().
			MaxLen(512),
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

func (Supplier) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("purchase_orders", PurchaseOrder.Type),
		edge.To("purchase_receipts", PurchaseReceipt.Type),
		edge.To("outsourcing_orders", OutsourcingOrder.Type),
		edge.To("process_capabilities", Process.Type).
			StorageKey(edge.Table("supplier_process_capabilities"), edge.Columns("supplier_id", "process_id")),
	}
}

func (Supplier) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("code").Unique(),
		index.Fields("name"),
		index.Fields("short_name"),
		index.Fields("supplier_type"),
		index.Fields("is_active"),
	}
}
