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

type PurchaseOrderItem struct {
	ent.Schema
}

func (PurchaseOrderItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"purchase_order_items_line_no_positive":        "line_no > 0",
				"purchase_order_items_purchased_qty_positive":  "purchased_quantity > 0",
				"purchase_order_items_unit_price_non_negative": "unit_price IS NULL OR unit_price >= 0",
				"purchase_order_items_amount_non_negative":     "amount IS NULL OR amount >= 0",
				"purchase_order_items_line_status_allowed":     "line_status IN ('open', 'closed', 'canceled')",
			},
		},
	}
}

func (PurchaseOrderItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("purchase_order_id").
			Positive(),
		field.Int("line_no").
			Positive(),
		field.Int("material_id").
			Positive(),
		field.Int("unit_id").
			Positive(),
		// Snapshots preserve order-time display values; Material remains the master truth.
		field.String("material_code_snapshot").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("material_name_snapshot").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("color_snapshot").
			Optional().
			Nillable().
			MaxLen(64),
		decimalQuantityField("purchased_quantity"),
		optionalDecimalField("unit_price"),
		optionalDecimalField("amount"),
		field.Time("expected_arrival_date").
			Optional().
			Nillable(),
		field.String("line_status").
			NotEmpty().
			Default("open").
			MaxLen(32),
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

func (PurchaseOrderItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("purchase_order", PurchaseOrder.Type).
			Ref("items").
			Field("purchase_order_id").
			Required().
			Unique(),
		edge.From("material", Material.Type).
			Ref("purchase_order_items").
			Field("material_id").
			Required().
			Unique(),
		edge.From("unit", Unit.Type).
			Ref("purchase_order_items").
			Field("unit_id").
			Required().
			Unique(),
		edge.To("purchase_receipt_items", PurchaseReceiptItem.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (PurchaseOrderItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("purchase_order_id", "line_no").Unique(),
		index.Fields("material_id"),
		index.Fields("unit_id"),
		index.Fields("line_status"),
		index.Fields("expected_arrival_date"),
	}
}
