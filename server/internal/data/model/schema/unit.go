package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type Unit struct {
	ent.Schema
}

func (Unit) Fields() []ent.Field {
	return []ent.Field{
		field.String("code").
			NotEmpty().
			MaxLen(32),
		field.String("name").
			NotEmpty().
			MaxLen(64),
		field.Int("precision").
			Default(0).
			NonNegative(),
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

func (Unit) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("materials", Material.Type),
		edge.To("products", Product.Type),
		edge.To("inventory_txns", InventoryTxn.Type),
		edge.To("inventory_balances", InventoryBalance.Type),
		edge.To("bom_items", BOMItem.Type),
		edge.To("purchase_receipt_items", PurchaseReceiptItem.Type),
		edge.To("purchase_return_items", PurchaseReturnItem.Type),
	}
}

func (Unit) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("code").Unique(),
	}
}
