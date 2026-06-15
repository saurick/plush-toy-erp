package schema

import (
	"context"
	"errors"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type InventoryLot struct {
	ent.Schema
}

func (InventoryLot) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("inventory_lots are batch identity facts; disable the lot instead of deleting it")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (InventoryLot) Fields() []ent.Field {
	return []ent.Field{
		// subject_* is the batch identity truth; product_sku_id only adds optional specification traceability.
		field.String("subject_type").
			NotEmpty().
			MaxLen(16),
		field.Int("subject_id").
			Positive(),
		field.Int("product_sku_id").
			Optional().
			Nillable().
			Positive(),
		field.String("lot_no").
			NotEmpty().
			MaxLen(64),
		field.String("supplier_lot_no").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("color_no").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("dye_lot_no").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("production_lot_no").
			Optional().
			Nillable().
			MaxLen(64),
		// Lot status controls batch availability; quality actions change it without writing inventory_txns.
		field.String("status").
			NotEmpty().
			Default("ACTIVE").
			MaxLen(32),
		field.Time("received_at").
			Optional().
			Nillable(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (InventoryLot) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("inventory_txns", InventoryTxn.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("inventory_balances", InventoryBalance.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("product_sku", ProductSKU.Type).
			Ref("inventory_lots").
			Field("product_sku_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("purchase_receipt_items", PurchaseReceiptItem.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("purchase_return_items", PurchaseReturnItem.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("purchase_receipt_adjustment_items", PurchaseReceiptAdjustmentItem.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("quality_inspections", QualityInspection.Type).
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

func (InventoryLot) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("subject_type", "subject_id", "lot_no").Unique(),
		index.Fields("product_sku_id"),
		index.Fields("supplier_lot_no"),
		index.Fields("color_no"),
		index.Fields("dye_lot_no"),
	}
}
