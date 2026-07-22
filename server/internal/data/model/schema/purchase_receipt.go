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

type PurchaseReceipt struct {
	ent.Schema
}

func (PurchaseReceipt) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"purchase_receipts_idempotency_bundle_complete": `
(
  (
    idempotency_key IS NULL
    AND idempotency_payload_hash IS NULL
    AND idempotency_item_count IS NULL
  )
  OR
  (
    idempotency_key IS NOT NULL
    AND length(trim(idempotency_key)) BETWEEN 1 AND 128
    AND idempotency_payload_hash IS NOT NULL
    AND length(idempotency_payload_hash) = 64
    AND idempotency_item_count IS NOT NULL
    AND idempotency_item_count > 0
  )
)`,
		}},
	}
}

var purchaseReceiptLockedFields = map[string]struct{}{
	"receipt_no":               {},
	"supplier_id":              {},
	"supplier_name":            {},
	"status":                   {},
	"received_at":              {},
	"posted_at":                {},
	"idempotency_key":          {},
	"idempotency_payload_hash": {},
	"idempotency_item_count":   {},
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
		field.Int("supplier_id").
			Optional().
			Nillable().
			Positive(),
		// Supplier name is a receipt-time snapshot; Supplier remains the master truth when linked elsewhere.
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
		field.String("idempotency_key").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("idempotency_payload_hash").
			Optional().
			Nillable().
			MaxLen(64),
		field.Int("idempotency_item_count").
			Optional().
			Nillable().
			Positive(),
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
		edge.From("supplier", Supplier.Type).
			Ref("purchase_receipts").
			Field("supplier_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("purchase_returns", PurchaseReturn.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("purchase_receipt_adjustments", PurchaseReceiptAdjustment.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("quality_inspections", QualityInspection.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("replacement_dispositions", PurchaseRejectionDisposition.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("items", PurchaseReceiptItem.Type),
	}
}

func (PurchaseReceipt) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("receipt_no").Unique(),
		index.Fields("idempotency_key").Unique(),
		index.Fields("supplier_id"),
		index.Fields("supplier_name"),
		index.Fields("status"),
		index.Fields("received_at"),
	}
}
