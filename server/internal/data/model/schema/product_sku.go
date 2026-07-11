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

type ProductSKU struct {
	ent.Schema
}

func (ProductSKU) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Table: "product_skus"},
	}
}

func (ProductSKU) Fields() []ent.Field {
	return []ent.Field{
		// Product remains required; an explicit SKU is the exact specification grain for downstream inventory facts.
		field.Int("product_id").
			Positive().
			Immutable(),
		field.String("sku_code").
			NotEmpty().
			MaxLen(64),
		field.String("sku_name").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("barcode").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("customer_sku").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("color").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("color_no").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("size").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("packaging_version").
			Optional().
			Nillable().
			MaxLen(64),
		field.Int("default_unit_id").
			Optional().
			Nillable().
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

func (ProductSKU) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("product", Product.Type).
			Ref("product_skus").
			Field("product_id").
			Required().
			Unique().
			Immutable(),
		edge.From("default_unit", Unit.Type).
			Ref("product_skus").
			Field("default_unit_id").
			Unique(),
		edge.To("sales_order_items", SalesOrderItem.Type),
		edge.To("inventory_lots", InventoryLot.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("inventory_txns", InventoryTxn.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("inventory_balances", InventoryBalance.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("production_facts", ProductionFact.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("outsourcing_facts", OutsourcingFact.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("shipment_items", ShipmentItem.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("stock_reservations", StockReservation.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ProductSKU) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("sku_code").Unique(),
		index.Fields("product_id", "sku_code").Unique(),
		index.Fields("barcode").
			Unique().
			Annotations(entsql.IndexWhere("barcode IS NOT NULL AND barcode <> ''")),
		index.Fields("product_id", "is_active"),
		index.Fields("customer_sku"),
		index.Fields("color"),
		index.Fields("color_no"),
		index.Fields("size"),
	}
}
