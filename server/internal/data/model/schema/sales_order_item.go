package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"github.com/shopspring/decimal"
)

type SalesOrderItem struct {
	ent.Schema
}

func (SalesOrderItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"sales_order_items_line_no_positive":            "line_no > 0",
				"sales_order_items_display_order_positive":      "display_order IS NULL OR display_order > 0",
				"sales_order_items_ordered_qty_positive":        "ordered_quantity > 0",
				"sales_order_items_unit_price_non_negative":     "unit_price IS NULL OR unit_price >= 0",
				"sales_order_items_amount_non_negative":         "amount IS NULL OR amount >= 0",
				"sales_order_items_line_status_allowed":         "line_status IN ('open', 'closed', 'canceled')",
				"sales_order_items_category_allowed":            "order_category IN ('NEW', 'REPEAT')",
				"sales_order_items_sample_quantity_nonnegative": "pre_shipment_sample_quantity >= 0",
				"sales_order_items_sku_requires_product":        "product_sku_id IS NULL OR product_id IS NOT NULL",
				"sales_order_items_engineering_status_allowed":  "engineering_status IN ('PREPARING', 'SAMPLING', 'CONFIRMED')",
				"sales_order_items_sampling_requires_sources":   "engineering_status = 'PREPARING' OR (product_id IS NOT NULL AND sample_bom_id IS NOT NULL)",
			},
		},
	}
}

func (SalesOrderItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("sales_order_id").
			Positive(),
		field.Int("line_no").
			Positive(),
		field.Int("display_order").
			Optional().
			Nillable().
			Positive(),
		// Sales can accept a requirement before engineering creates the product.
		field.Int("product_id").
			Optional().
			Positive(),
		field.String("requested_product_name").Optional().Nillable().MaxLen(255),
		field.String("customer_product_no").Optional().Nillable().MaxLen(128),
		field.String("order_category").Default("NEW").MaxLen(16),
		decimalQuantityFieldWithDefault("pre_shipment_sample_quantity", decimal.Zero),
		field.String("process_requirement").Optional().Nillable().MaxLen(255),
		// Import evidence remains separate from editable demand and engineering facts.
		field.JSON("import_source", map[string]any{}).Optional().Immutable(),
		field.Int("sample_bom_id").Optional().Nillable().Positive(),
		field.String("sample_bom_fingerprint").Optional().Nillable().MaxLen(64),
		field.Int("sample_reused_from_item_id").Optional().Nillable().Positive(),
		field.Int("sample_image_attachment_id").Optional().Nillable().Positive(),
		field.String("engineering_status").Default("PREPARING").MaxLen(16),
		field.String("sample_note").Optional().Nillable().MaxLen(255),
		field.Time("sample_confirmed_at").Optional().Nillable(),
		field.Int("sample_confirmed_by").Optional().Nillable().Positive(),
		field.Int("product_sku_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("unit_id").
			Positive(),
		// Snapshots preserve order-time display values; Product/ProductSKU stay the master truth.
		field.String("product_code_snapshot").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("product_name_snapshot").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("color_snapshot").
			Optional().
			Nillable().
			MaxLen(64),
		decimalQuantityField("ordered_quantity"),
		optionalDecimalField("unit_price"),
		optionalDecimalField("amount"),
		field.Time("planned_delivery_date").
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

func (SalesOrderItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("sample_reused_from_item", SalesOrderItem.Type).Field("sample_reused_from_item_id").Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("sales_order", SalesOrder.Type).
			Ref("items").
			Field("sales_order_id").
			Required().
			Unique(),
		edge.To("product", Product.Type).
			Field("product_id").
			Annotations(entsql.OnDelete(entsql.NoAction)).
			Unique(),
		edge.To("sample_bom", BOMHeader.Type).
			Field("sample_bom_id").
			Annotations(entsql.OnDelete(entsql.NoAction)).
			Unique(),
		edge.From("product_sku", ProductSKU.Type).
			Ref("sales_order_items").
			Field("product_sku_id").
			Unique(),
		edge.To("unit", Unit.Type).
			Field("unit_id").
			Required().
			Unique(),
		edge.To("shipment_items", ShipmentItem.Type),
		edge.To("stock_reservations", StockReservation.Type),
	}
}

func (SalesOrderItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("sales_order_id", "line_no").Unique(),
		index.Fields("product_id"),
		index.Fields("product_sku_id"),
		index.Fields("unit_id"),
		index.Fields("line_status"),
		index.Fields("planned_delivery_date"),
	}
}
