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

type PurchaseReceiptAdjustmentItem struct {
	ent.Schema
}

var purchaseReceiptAdjustmentItemLockedFields = map[string]struct{}{
	"adjustment_id":            {},
	"purchase_receipt_item_id": {},
	"adjust_type":              {},
	"material_id":              {},
	"warehouse_id":             {},
	"unit_id":                  {},
	"lot_id":                   {},
	"quantity":                 {},
	"source_line_no":           {},
	"correction_group":         {},
}

func (PurchaseReceiptAdjustmentItem) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("purchase_receipt_adjustment_items are immutable source lines; cancel posted adjustments with reversal instead of deleting lines")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, purchaseReceiptAdjustmentItemLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("purchase_receipt_adjustment_item protected fields are immutable after creation")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (PurchaseReceiptAdjustmentItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"purchase_receipt_adjustment_items_quantity_positive": "quantity > 0",
			},
		},
	}
}

func (PurchaseReceiptAdjustmentItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("adjustment_id").
			Positive(),
		field.Int("purchase_receipt_item_id").
			Positive(),
		field.String("adjust_type").
			NotEmpty().
			MaxLen(32),
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
		decimalQuantityField("quantity"),
		field.String("source_line_no").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("correction_group").
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

func (PurchaseReceiptAdjustmentItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("purchase_receipt_adjustment", PurchaseReceiptAdjustment.Type).
			Ref("items").
			Field("adjustment_id").
			Required().
			Unique(),
		edge.From("purchase_receipt_item", PurchaseReceiptItem.Type).
			Ref("purchase_receipt_adjustment_items").
			Field("purchase_receipt_item_id").
			Required().
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("material", Material.Type).
			Ref("purchase_receipt_adjustment_items").
			Field("material_id").
			Required().
			Unique(),
		edge.From("warehouse", Warehouse.Type).
			Ref("purchase_receipt_adjustment_items").
			Field("warehouse_id").
			Required().
			Unique(),
		edge.From("unit", Unit.Type).
			Ref("purchase_receipt_adjustment_items").
			Field("unit_id").
			Required().
			Unique(),
		edge.From("inventory_lot", InventoryLot.Type).
			Ref("purchase_receipt_adjustment_items").
			Field("lot_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (PurchaseReceiptAdjustmentItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("adjustment_id"),
		index.Fields("purchase_receipt_item_id"),
		index.Fields("material_id"),
		index.Fields("warehouse_id"),
		index.Fields("lot_id"),
		index.Fields("adjustment_id", "source_line_no").
			Unique().
			Annotations(
				entsql.IndexWhere("source_line_no IS NOT NULL AND source_line_no <> ''"),
			),
	}
}
