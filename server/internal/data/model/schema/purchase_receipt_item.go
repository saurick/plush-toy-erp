package schema

import (
	"context"
	"errors"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type PurchaseReceiptItem struct {
	ent.Schema
}

var purchaseReceiptItemLockedFields = map[string]struct{}{
	"receipt_id":     {},
	"material_id":    {},
	"warehouse_id":   {},
	"unit_id":        {},
	"lot_id":         {},
	"lot_no":         {},
	"quantity":       {},
	"unit_price":     {},
	"amount":         {},
	"source_line_no": {},
}

func (PurchaseReceiptItem) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("purchase_receipt_items are immutable source lines; cancel posted receipts with reversal instead of deleting lines")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, purchaseReceiptItemLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("purchase_receipt_item protected fields are immutable after creation")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (PurchaseReceiptItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"purchase_receipt_items_quantity_positive":       "quantity > 0",
				"purchase_receipt_items_unit_price_non_negative": "unit_price IS NULL OR unit_price >= 0",
				"purchase_receipt_items_amount_non_negative":     "amount IS NULL OR amount >= 0",
			},
		},
	}
}

func (PurchaseReceiptItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("receipt_id").
			Positive(),
		field.Int("material_id").
			Positive(),
		field.Int("warehouse_id").
			Positive(),
		field.Int("unit_id").
			Positive(),
		field.Int("lot_id").
			Optional().
			Nillable().
			Positive(),
		field.String("lot_no").
			Optional().
			Nillable().
			MaxLen(64),
		decimalQuantityField("quantity"),
		optionalDecimalField("unit_price"),
		optionalDecimalField("amount"),
		field.String("source_line_no").
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

func (PurchaseReceiptItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("receipt", PurchaseReceipt.Type).
			Ref("items").
			Field("receipt_id").
			Required().
			Unique(),
		edge.From("material", Material.Type).
			Ref("purchase_receipt_items").
			Field("material_id").
			Required().
			Unique(),
		edge.From("warehouse", Warehouse.Type).
			Ref("purchase_receipt_items").
			Field("warehouse_id").
			Required().
			Unique(),
		edge.From("unit", Unit.Type).
			Ref("purchase_receipt_items").
			Field("unit_id").
			Required().
			Unique(),
		edge.From("inventory_lot", InventoryLot.Type).
			Ref("purchase_receipt_items").
			Field("lot_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("purchase_return_items", PurchaseReturnItem.Type),
	}
}

func (PurchaseReceiptItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("receipt_id"),
		index.Fields("material_id"),
		index.Fields("warehouse_id"),
		index.Fields("lot_id"),
		index.Fields("receipt_id", "source_line_no").
			Unique().
			Annotations(
				entsql.IndexWhere("source_line_no IS NOT NULL AND source_line_no <> ''"),
			),
	}
}
