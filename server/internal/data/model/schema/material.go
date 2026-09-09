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
		field.Int("supplier_id").Optional().Nillable().Positive(),
		field.String("supplier_item_no").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("category").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("stock_category").Default("UNCLASSIFIED").MaxLen(32),
		field.Int("default_warehouse_id").Optional().Nillable().Positive(),
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
		edge.To("default_warehouse", Warehouse.Type).Field("default_warehouse_id").Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("supplier", Supplier.Type).Field("supplier_id").Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("default_unit", Unit.Type).
			Ref("materials").
			Field("default_unit_id").
			Required().
			Unique(),
		edge.To("bom_items", BOMItem.Type),
		edge.To("production_order_material_requirements", ProductionOrderMaterialRequirement.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("purchase_order_items", PurchaseOrderItem.Type),
		edge.To("purchase_receipt_items", PurchaseReceiptItem.Type),
		edge.To("purchase_return_items", PurchaseReturnItem.Type),
		edge.To("purchase_receipt_adjustment_items", PurchaseReceiptAdjustmentItem.Type),
		edge.To("quality_inspections", QualityInspection.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("outsourcing_order_items", OutsourcingOrderItem.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (Material) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("code").Unique(),
		index.Fields("supplier_id", "supplier_item_no", "color").Unique().
			Annotations(entsql.IndexWhere("supplier_id IS NOT NULL AND supplier_item_no IS NOT NULL AND color IS NOT NULL")),
		index.Fields("supplier_id", "supplier_item_no").Unique().
			Annotations(entsql.IndexWhere("supplier_id IS NOT NULL AND supplier_item_no IS NOT NULL AND color IS NULL")),
		index.Fields("category"),
		index.Fields("stock_category"),
		index.Fields("name"),
	}
}

func (Material) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"materials_stock_category_check": "stock_category IN ('MAIN', 'AUXILIARY', 'PACKAGING', 'OTHER', 'UNCLASSIFIED')",
	}}}
}
