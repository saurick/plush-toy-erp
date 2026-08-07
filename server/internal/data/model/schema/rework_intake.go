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

type ReworkIntake struct{ ent.Schema }

var reworkIntakeLockedFields = map[string]struct{}{
	"intake_no":                {},
	"source_shipment_id":       {},
	"customer_id":              {},
	"customer_snapshot":        {},
	"reason":                   {},
	"idempotency_key":          {},
	"idempotency_payload_hash": {},
	"idempotency_item_count":   {},
	"created_by":               {},
}

func (ReworkIntake) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("rework intakes are auditable source documents; cancel or reverse them instead of deleting them")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, reworkIntakeLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("rework_intake protected fields are immutable; use ReceiveReworkIntake, CancelReworkIntake or ReverseReworkIntake for lifecycle changes")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (ReworkIntake) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"rework_intakes_status_allowed":   "status IN ('DRAFT', 'RECEIVED', 'CANCELLED', 'REVERSED')",
		"rework_intakes_version_positive": "version > 0",
		"rework_intakes_intent_bundle":    "length(trim(idempotency_key)) BETWEEN 1 AND 128 AND length(idempotency_payload_hash) = 64 AND idempotency_item_count > 0",
		"rework_intakes_lifecycle_audit": `
(
  (status = 'DRAFT'
    AND received_at IS NULL AND received_by IS NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
  OR
  (status = 'RECEIVED'
    AND received_at IS NOT NULL AND received_by IS NOT NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
  OR
  (status = 'CANCELLED'
    AND received_at IS NULL AND received_by IS NULL
    AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
    AND cancel_reason IS NOT NULL AND length(trim(cancel_reason)) BETWEEN 1 AND 255
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
  OR
  (status = 'REVERSED'
    AND received_at IS NOT NULL AND received_by IS NOT NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL
    AND reverse_reason IS NOT NULL AND length(trim(reverse_reason)) BETWEEN 1 AND 255)
)`,
	}}}
}

func (ReworkIntake) Fields() []ent.Field {
	return []ent.Field{
		field.String("intake_no").NotEmpty().MaxLen(64).Immutable(),
		field.Int("source_shipment_id").Positive().Immutable(),
		field.Int("customer_id").Positive().Immutable(),
		field.String("customer_snapshot").NotEmpty().MaxLen(512).Immutable(),
		field.String("status").NotEmpty().Default("DRAFT").MaxLen(16),
		field.String("reason").NotEmpty().MaxLen(255).Immutable(),
		field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(),
		field.String("idempotency_payload_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(),
		field.Int("idempotency_item_count").Positive().Immutable(),
		field.Int("version").Default(1).Positive(),
		field.Time("received_at").Optional().Nillable(),
		field.Int("received_by").Optional().Nillable().Positive(),
		field.Time("cancelled_at").Optional().Nillable(),
		field.Int("cancelled_by").Optional().Nillable().Positive(),
		field.String("cancel_reason").Optional().Nillable().MaxLen(255),
		field.Time("reversed_at").Optional().Nillable(),
		field.Int("reversed_by").Optional().Nillable().Positive(),
		field.String("reverse_reason").Optional().Nillable().MaxLen(255),
		field.Int("created_by").Positive().Immutable(),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (ReworkIntake) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("source_shipment", Shipment.Type).
			Field("source_shipment_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("customer", Customer.Type).
			Field("customer_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("items", ReworkIntakeItem.Type),
	}
}

func (ReworkIntake) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("intake_no").Unique(),
		index.Fields("created_by", "idempotency_key").Unique(),
		index.Fields("source_shipment_id", "status"),
		index.Fields("customer_id", "status"),
	}
}
