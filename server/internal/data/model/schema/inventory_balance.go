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

type InventoryBalance struct {
	ent.Schema
}

func (InventoryBalance) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"inventory_balances_sku_subject_allowed": "product_sku_id IS NULL OR subject_type = 'PRODUCT'",
		}},
	}
}

func (InventoryBalance) Fields() []ent.Field {
	return []ent.Field{
		// Balances are query projections derived from inventory_txns, not editable stock facts.
		field.String("subject_type").
			NotEmpty().
			MaxLen(16),
		field.Int("subject_id").
			Positive(),
		field.Int("product_sku_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("warehouse_id").
			Positive(),
		field.Int("lot_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("unit_id").
			Positive(),
		decimalQuantityField("quantity"),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (InventoryBalance) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("warehouse", Warehouse.Type).
			Ref("inventory_balances").
			Field("warehouse_id").
			Required().
			Unique(),
		edge.From("unit", Unit.Type).
			Ref("inventory_balances").
			Field("unit_id").
			Required().
			Unique(),
		edge.From("product_sku", ProductSKU.Type).
			Ref("inventory_balances").
			Field("product_sku_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("inventory_lot", InventoryLot.Type).
			Ref("inventory_balances").
			Field("lot_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (InventoryBalance) Indexes() []ent.Index {
	return []ent.Index{
		// PostgreSQL treats NULLs as distinct, so SKU/lot combinations need explicit guards.
		index.Fields("subject_type", "subject_id", "warehouse_id", "unit_id").
			Unique().
			StorageKey("inventorybalance_subject_type_subject_id_warehouse_id_unit_id").
			Annotations(
				entsql.IndexWhere("product_sku_id IS NULL AND lot_id IS NULL"),
			),
		index.Fields("subject_type", "subject_id", "warehouse_id", "unit_id", "lot_id").
			Unique().
			StorageKey("inventorybalance_subject_type_subject_id_warehouse_id_unit_id_l").
			Annotations(
				entsql.IndexWhere("product_sku_id IS NULL AND lot_id IS NOT NULL"),
			),
		index.Fields("subject_type", "subject_id", "product_sku_id", "warehouse_id", "unit_id").
			Unique().
			StorageKey("inventorybalance_sku_no_lot").
			Annotations(
				entsql.IndexWhere("product_sku_id IS NOT NULL AND lot_id IS NULL"),
			),
		index.Fields("subject_type", "subject_id", "product_sku_id", "warehouse_id", "unit_id", "lot_id").
			Unique().
			StorageKey("inventorybalance_sku_lot").
			Annotations(
				entsql.IndexWhere("product_sku_id IS NOT NULL AND lot_id IS NOT NULL"),
			),
	}
}
