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

type PurchaseReceiptAdjustment struct {
	ent.Schema
}

var purchaseReceiptAdjustmentLockedFields = map[string]struct{}{
	"adjustment_no":       {},
	"purchase_receipt_id": {},
	"business_record_id":  {},
	"status":              {},
	"adjusted_at":         {},
	"posted_at":           {},
}

func (PurchaseReceiptAdjustment) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("purchase_receipt_adjustments are immutable source documents; cancel posted adjustments with reversal instead of deleting them")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, purchaseReceiptAdjustmentLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("purchase_receipt_adjustment protected fields are immutable; use PostPurchaseReceiptAdjustment or CancelPostedPurchaseReceiptAdjustment for status changes")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (PurchaseReceiptAdjustment) Fields() []ent.Field {
	return []ent.Field{
		field.String("adjustment_no").
			NotEmpty().
			MaxLen(64),
		field.Int("purchase_receipt_id").
			Positive(),
		field.Int("business_record_id").
			Optional().
			Nillable().
			Positive(),
		field.String("reason").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("status").
			NotEmpty().
			Default("DRAFT").
			MaxLen(32),
		field.Time("adjusted_at"),
		field.Time("posted_at").
			Optional().
			Nillable(),
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

func (PurchaseReceiptAdjustment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("purchase_receipt", PurchaseReceipt.Type).
			Ref("purchase_receipt_adjustments").
			Field("purchase_receipt_id").
			Required().
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("business_record", BusinessRecord.Type).
			Ref("purchase_receipt_adjustments").
			Field("business_record_id").
			Unique(),
		edge.To("items", PurchaseReceiptAdjustmentItem.Type),
	}
}

func (PurchaseReceiptAdjustment) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("adjustment_no").Unique(),
		index.Fields("purchase_receipt_id"),
		index.Fields("business_record_id"),
		index.Fields("status"),
		index.Fields("adjusted_at"),
	}
}
