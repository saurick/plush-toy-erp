package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type BusinessAttachment struct {
	ent.Schema
}

func (BusinessAttachment) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"business_attachments_owner_type_allowed":     "owner_type IN ('sales_order', 'purchase_order', 'outsourcing_order', 'purchase_receipt', 'quality_inspection', 'shipment', 'finance_fact', 'production_fact', 'outsourcing_fact', 'product', 'product_sku', 'bom_header', 'workflow_task')",
				"business_attachments_file_size_positive":     "file_size > 0",
				"business_attachments_product_image_contract": "((owner_type = 'product' AND attachment_type = 'product_image' AND slot_key IS NOT NULL AND slot_key IN ('primary', 'secondary') AND mime_type IN ('image/png', 'image/jpeg', 'image/webp')) OR (owner_type <> 'product' AND attachment_type <> 'product_image'))",
			},
		},
	}
}

func (BusinessAttachment) Fields() []ent.Field {
	return []ent.Field{
		field.String("owner_type").
			NotEmpty().
			MaxLen(64),
		field.Int("owner_id").
			Positive(),
		field.String("attachment_type").
			NotEmpty().
			Default("evidence").
			MaxLen(64),
		field.String("slot_key").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("file_name").
			NotEmpty().
			MaxLen(255),
		field.String("mime_type").
			NotEmpty().
			MaxLen(128),
		field.Int("file_size").
			Positive(),
		field.String("sha256").
			NotEmpty().
			MaxLen(64),
		field.Bytes("content"),
		field.Int("uploaded_by").
			Optional().
			Nillable().
			Positive(),
		field.String("note").
			Optional().
			Nillable().
			MaxLen(255),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

func (BusinessAttachment) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("owner_type", "owner_id"),
		index.Fields("owner_type", "owner_id", "created_at"),
		index.Fields("owner_type", "owner_id", "attachment_type", "slot_key").
			Unique().
			Annotations(entsql.IndexWhere("owner_type = 'product' AND attachment_type = 'product_image'")),
		index.Fields("sha256"),
		index.Fields("uploaded_by"),
	}
}
