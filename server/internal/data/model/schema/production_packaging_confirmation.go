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

// ProductionPackagingConfirmation records the business confirmation of the
// packaging artwork/version for one production-order line. Packaging-material
// IQC remains a purchase/quality fact and must not be written here.
type ProductionPackagingConfirmation struct {
	ent.Schema
}

func (ProductionPackagingConfirmation) Hooks() []ent.Hook {
	return []ent.Hook{
		rejectMutationOps(
			ent.OpDelete|ent.OpDeleteOne,
			"production packaging confirmations are lifecycle records",
		),
	}
}

func (ProductionPackagingConfirmation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"production_packaging_confirmations_order_positive":   "production_order_id > 0",
			"production_packaging_confirmations_version_positive": "version > 0",
			"production_packaging_confirmations_status_allowed":   "status IN ('PENDING', 'CONFIRMED')",
			"production_packaging_confirmations_actor_bundle": `
(
  (
    status = 'PENDING'
    AND confirmed_by IS NULL
    AND confirmed_at IS NULL
    AND packaging_version_snapshot IS NULL
    AND confirmation_idempotency_key IS NULL
    AND confirmation_intent_hash IS NULL
  )
  OR
  (
    status = 'CONFIRMED'
    AND confirmed_by IS NOT NULL
    AND confirmed_at IS NOT NULL
    AND packaging_version_snapshot IS NOT NULL
    AND length(trim(packaging_version_snapshot)) BETWEEN 1 AND 128
    AND confirmation_idempotency_key IS NOT NULL
    AND length(trim(confirmation_idempotency_key)) BETWEEN 1 AND 128
    AND confirmation_intent_hash IS NOT NULL
    AND length(confirmation_intent_hash) = 64
  )
)`,
		}},
	}
}

func (ProductionPackagingConfirmation) Fields() []ent.Field {
	return []ent.Field{
		field.Int("production_order_id").Positive().Immutable(),
		field.Int("production_order_item_id").Positive().Immutable(),
		field.String("status").NotEmpty().Default("PENDING").MaxLen(16),
		field.Int("version").Positive().Default(1),
		field.String("packaging_version_snapshot").Optional().Nillable().MaxLen(128),
		field.Int("confirmed_by").Optional().Nillable().Positive(),
		field.Time("confirmed_at").Optional().Nillable(),
		field.String("confirmation_idempotency_key").Optional().Nillable().MaxLen(128),
		field.String("confirmation_intent_hash").Optional().Nillable().MinLen(64).MaxLen(64),
		field.String("note").Optional().Nillable().MaxLen(255),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (ProductionPackagingConfirmation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("production_order", ProductionOrder.Type).
			Ref("packaging_confirmations").
			Field("production_order_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("production_order_item", ProductionOrderItem.Type).
			Ref("packaging_confirmation").
			Field("production_order_item_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("confirmer", AdminUser.Type).
			Field("confirmed_by").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ProductionPackagingConfirmation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("production_order_id", "status"),
		index.Fields("production_order_item_id", "confirmation_idempotency_key").
			Unique().
			Annotations(entsql.IndexWhere("confirmation_idempotency_key IS NOT NULL")),
	}
}
