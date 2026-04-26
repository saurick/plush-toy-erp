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

type PurchaseReturn struct {
	ent.Schema
}

var purchaseReturnLockedFields = map[string]struct{}{
	"return_no":           {},
	"purchase_receipt_id": {},
	"business_record_id":  {},
	"supplier_name":       {},
	"status":              {},
	"returned_at":         {},
	"posted_at":           {},
}

func (PurchaseReturn) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("purchase_returns are immutable source documents; cancel posted returns with reversal instead of deleting them")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, purchaseReturnLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("purchase_return protected fields are immutable; use PostPurchaseReturn or CancelPostedPurchaseReturn for status changes")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (PurchaseReturn) Fields() []ent.Field {
	return []ent.Field{
		field.String("return_no").
			NotEmpty().
			MaxLen(64),
		field.Int("purchase_receipt_id").
			Optional().
			Nillable().
			Positive(),
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
		field.Time("returned_at"),
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

func (PurchaseReturn) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("purchase_receipt", PurchaseReceipt.Type).
			Ref("purchase_returns").
			Field("purchase_receipt_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("business_record", BusinessRecord.Type).
			Ref("purchase_returns").
			Field("business_record_id").
			Unique(),
		edge.To("items", PurchaseReturnItem.Type),
	}
}

func (PurchaseReturn) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("return_no").Unique(),
		index.Fields("purchase_receipt_id"),
		index.Fields("business_record_id"),
		index.Fields("status"),
		index.Fields("returned_at"),
	}
}
