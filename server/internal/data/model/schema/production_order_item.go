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

type ProductionOrderItem struct {
	ent.Schema
}

func (ProductionOrderItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"production_order_items_line_no_positive":    "line_no > 0",
				"production_order_items_quantity_positive":   "planned_quantity > 0",
				"production_order_items_product_id_positive": "product_id > 0",
				"production_order_items_sku_id_positive":     "product_sku_id IS NULL OR product_sku_id > 0",
				"production_order_items_sales_line_positive": "sales_order_item_id IS NULL OR sales_order_item_id > 0",
				"production_order_items_bom_header_positive": "bom_header_id IS NULL OR bom_header_id > 0",
				"production_order_items_route_allowed":       "route_code IS NULL OR route_code = 'PLUSH_SEW_HAND_V1'",
				"production_order_items_customer_gate_route": "NOT customer_inspection_required OR route_code IS NOT NULL",
			},
		},
	}
}

func (ProductionOrderItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("production_order_id").
			Positive(),
		field.Int("line_no").
			Positive(),
		field.Int("product_id").
			Positive(),
		field.Int("product_sku_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("unit_id").
			Positive(),
		decimalQuantityField("planned_quantity"),
		field.Int("sales_order_item_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("bom_header_id").
			Optional().
			Nillable().
			Positive(),
		field.String("route_code").
			Optional().
			Nillable().
			MaxLen(64),
		field.Bool("customer_inspection_required").
			Default(false),
		field.String("product_code_snapshot").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("product_name_snapshot").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("sku_code_snapshot").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("unit_name_snapshot").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("bom_version_snapshot").
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

func (ProductionOrderItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("production_order", ProductionOrder.Type).
			Ref("items").
			Field("production_order_id").
			Required().
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("material_requirements", ProductionOrderMaterialRequirement.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("operations", ProductionOrderOperation.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("wip_batches", ProductionWIPBatch.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("packaging_confirmation", ProductionPackagingConfirmation.Type).
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("product", Product.Type).
			Field("product_id").
			Required().
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("product_sku", ProductSKU.Type).
			Field("product_sku_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("unit", Unit.Type).
			Field("unit_id").
			Required().
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("sales_order_item", SalesOrderItem.Type).
			Field("sales_order_item_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("bom_header", BOMHeader.Type).
			Field("bom_header_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ProductionOrderItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("production_order_id", "line_no").Unique(),
		index.Fields("product_id", "product_sku_id"),
		index.Fields("sales_order_item_id"),
		index.Fields("bom_header_id"),
		index.Fields("route_code"),
	}
}
