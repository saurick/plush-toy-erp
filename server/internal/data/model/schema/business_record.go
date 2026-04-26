package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type BusinessRecord struct {
	ent.Schema
}

func (BusinessRecord) Fields() []ent.Field {
	return []ent.Field{
		field.String("module_key").
			NotEmpty().
			MaxLen(64),
		field.String("document_no").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("title").
			NotEmpty().
			MaxLen(255),
		field.String("business_status_key").
			NotEmpty().
			MaxLen(64),
		field.String("owner_role_key").
			NotEmpty().
			MaxLen(32),
		field.String("source_no").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("customer_name").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("supplier_name").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("style_no").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("product_no").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("product_name").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("material_name").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("warehouse_location").
			Optional().
			Nillable().
			MaxLen(255),
		field.Float("quantity").
			Optional().
			Nillable(),
		field.String("unit").
			Optional().
			Nillable().
			MaxLen(32),
		field.Float("amount").
			Optional().
			Nillable(),
		field.String("document_date").
			Optional().
			Nillable().
			MaxLen(32),
		field.String("due_date").
			Optional().
			Nillable().
			MaxLen(32),
		field.JSON("payload", map[string]any{}).
			Optional(),
		field.Int64("row_version").
			Default(1),
		field.Int("created_by").
			Optional().
			Nillable().
			Positive(),
		field.Int("updated_by").
			Optional().
			Nillable().
			Positive(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
		field.Time("deleted_at").
			Optional().
			Nillable(),
		field.Int("deleted_by").
			Optional().
			Nillable().
			Positive(),
		field.String("delete_reason").
			Optional().
			Nillable().
			MaxLen(255),
	}
}

func (BusinessRecord) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("module_key"),
		index.Fields("module_key", "business_status_key"),
		index.Fields("module_key", "owner_role_key"),
		index.Fields("module_key", "deleted_at"),
		index.Fields("module_key", "document_no").
			Unique().
			Annotations(
				entsql.IndexWhere("deleted_at IS NULL AND document_no IS NOT NULL AND document_no <> ''"),
			),
	}
}

func (BusinessRecord) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("purchase_receipts", PurchaseReceipt.Type),
		edge.To("purchase_returns", PurchaseReturn.Type),
	}
}
