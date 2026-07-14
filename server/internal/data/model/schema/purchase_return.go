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

type PurchaseReturn struct {
	ent.Schema
}

func (PurchaseReturn) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"purchase_returns_idempotency_bundle_complete": `
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

var purchaseReturnLockedFields = map[string]struct{}{
	"return_no":                {},
	"purchase_receipt_id":      {},
	"quality_inspection_id":    {},
	"supplier_name":            {},
	"return_reason":            {},
	"status":                   {},
	"returned_at":              {},
	"posted_at":                {},
	"idempotency_key":          {},
	"idempotency_payload_hash": {},
	"idempotency_item_count":   {},
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
		field.Int("quality_inspection_id").
			Optional().
			Nillable().
			Positive(),
		// Supplier name is a return-time snapshot; Supplier remains the master truth when linked elsewhere.
		field.String("supplier_name").
			NotEmpty().
			MaxLen(255),
		field.String("return_reason").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("status").
			NotEmpty().
			Default("DRAFT").
			MaxLen(32),
		field.Time("returned_at"),
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

func (PurchaseReturn) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("purchase_receipt", PurchaseReceipt.Type).
			Ref("purchase_returns").
			Field("purchase_receipt_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("quality_inspection", QualityInspection.Type).
			Ref("purchase_returns").
			Field("quality_inspection_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("items", PurchaseReturnItem.Type),
	}
}

func (PurchaseReturn) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("return_no").Unique(),
		index.Fields("idempotency_key").Unique(),
		index.Fields("purchase_receipt_id"),
		index.Fields("quality_inspection_id"),
		index.Fields("quality_inspection_id").
			Unique().
			StorageKey("purchasereturn_quality_inspection_id_active").
			Annotations(
				entsql.IndexWhere("quality_inspection_id IS NOT NULL AND status <> 'CANCELLED'"),
			),
		index.Fields("status"),
		index.Fields("returned_at"),
	}
}
