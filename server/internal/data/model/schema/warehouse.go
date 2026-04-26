package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type Warehouse struct {
	ent.Schema
}

func (Warehouse) Fields() []ent.Field {
	return []ent.Field{
		field.String("code").
			NotEmpty().
			MaxLen(64),
		field.String("name").
			NotEmpty().
			MaxLen(128),
		field.String("type").
			NotEmpty().
			MaxLen(32),
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

func (Warehouse) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("inventory_txns", InventoryTxn.Type),
		edge.To("inventory_balances", InventoryBalance.Type),
		edge.To("purchase_receipt_items", PurchaseReceiptItem.Type),
		edge.To("purchase_return_items", PurchaseReturnItem.Type),
		edge.To("purchase_receipt_adjustment_items", PurchaseReceiptAdjustmentItem.Type),
		edge.To("quality_inspections", QualityInspection.Type),
	}
}

func (Warehouse) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("code").Unique(),
		index.Fields("type"),
	}
}
