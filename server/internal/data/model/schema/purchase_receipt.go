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

type PurchaseReceipt struct {
	ent.Schema
}

var purchaseReceiptLockedFields = map[string]struct{}{
	"receipt_no":         {},
	"business_record_id": {},
	"supplier_name":      {},
	"status":             {},
	"received_at":        {},
	"posted_at":          {},
}

func (PurchaseReceipt) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("purchase_receipts are immutable source documents; cancel posted receipts with reversal instead of deleting them")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, purchaseReceiptLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("purchase_receipt protected fields are immutable; use PostPurchaseReceipt or CancelPostedPurchaseReceipt for status changes")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (PurchaseReceipt) Fields() []ent.Field {
	return []ent.Field{
		field.String("receipt_no").
			NotEmpty().
			MaxLen(64),
		field.Int("business_record_id").
			Optional().
			Nillable().
			Positive(),
		field.String("supplier_name").
			NotEmpty().
			MaxLen(255),
		field.String("status").
			NotEmpty().
			Default("DRAFT").
			MaxLen(32),
		field.Time("received_at"),
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

func (PurchaseReceipt) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("business_record", BusinessRecord.Type).
			Ref("purchase_receipts").
			Field("business_record_id").
			Unique(),
		edge.To("purchase_returns", PurchaseReturn.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("items", PurchaseReceiptItem.Type),
	}
}

func (PurchaseReceipt) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("receipt_no").Unique(),
		index.Fields("business_record_id"),
		index.Fields("supplier_name"),
		index.Fields("status"),
		index.Fields("received_at"),
	}
}
