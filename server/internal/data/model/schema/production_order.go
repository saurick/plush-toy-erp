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

type ProductionOrder struct {
	ent.Schema
}

func (ProductionOrder) Hooks() []ent.Hook {
	return []ent.Hook{
		rejectMutationOps(
			ent.OpDelete|ent.OpDeleteOne,
			"production_orders are lifecycle source documents; cancel them instead of deleting them",
		),
	}
}

func (ProductionOrder) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"production_orders_order_no_present":      "length(trim(order_no)) BETWEEN 1 AND 64",
				"production_orders_status_allowed":        "status IN ('DRAFT', 'RELEASED', 'CLOSED', 'CANCELLED')",
				"production_orders_version_positive":      "version > 0",
				"production_orders_planned_dates_ordered": "planned_start_at IS NULL OR planned_end_at IS NULL OR planned_end_at >= planned_start_at",
				"production_orders_release_actor_pair":    "((released_by IS NULL AND released_at IS NULL) OR (released_by IS NOT NULL AND released_at IS NOT NULL))",
				"production_orders_close_actor_pair":      "((closed_by IS NULL AND closed_at IS NULL) OR (closed_by IS NOT NULL AND closed_at IS NOT NULL))",
				"production_orders_cancel_actor_pair":     "((cancelled_by IS NULL AND cancelled_at IS NULL) OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL))",
				"production_orders_close_reason_scope":    "close_reason IS NULL OR status = 'CLOSED'",
				"production_orders_cancel_reason_scope":   "cancel_reason IS NULL OR status = 'CANCELLED'",
				"production_orders_cancel_reason_present": "status <> 'CANCELLED' OR (cancel_reason IS NOT NULL AND length(trim(cancel_reason)) BETWEEN 1 AND 255)",
				"production_orders_lifecycle_bundle": `
(
  (status = 'DRAFT'
    AND released_by IS NULL AND released_at IS NULL
    AND closed_by IS NULL AND closed_at IS NULL
    AND cancelled_by IS NULL AND cancelled_at IS NULL)
  OR
  (status = 'RELEASED'
    AND released_by IS NOT NULL AND released_at IS NOT NULL
    AND closed_by IS NULL AND closed_at IS NULL
    AND cancelled_by IS NULL AND cancelled_at IS NULL)
  OR
  (status = 'CLOSED'
    AND released_by IS NOT NULL AND released_at IS NOT NULL
    AND closed_by IS NOT NULL AND closed_at IS NOT NULL
    AND cancelled_by IS NULL AND cancelled_at IS NULL)
  OR
  (status = 'CANCELLED'
    AND closed_by IS NULL AND closed_at IS NULL
    AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
)`,
			},
		},
	}
}

func (ProductionOrder) Fields() []ent.Field {
	return []ent.Field{
		field.String("order_no").
			NotEmpty().
			MaxLen(64),
		field.String("status").
			NotEmpty().
			Default("DRAFT").
			MaxLen(16),
		field.Int("version").
			Positive().
			Default(1),
		field.Time("planned_start_at").
			Optional().
			Nillable(),
		field.Time("planned_end_at").
			Optional().
			Nillable(),
		field.String("note").
			Optional().
			Nillable().
			MaxLen(255),
		field.Int("created_by").
			Positive().
			Immutable(),
		field.Int("released_by").
			Optional().
			Nillable().
			Positive(),
		field.Time("released_at").
			Optional().
			Nillable(),
		field.Int("closed_by").
			Optional().
			Nillable().
			Positive(),
		field.Time("closed_at").
			Optional().
			Nillable(),
		field.String("close_reason").
			Optional().
			Nillable().
			MaxLen(255),
		field.Int("cancelled_by").
			Optional().
			Nillable().
			Positive(),
		field.Time("cancelled_at").
			Optional().
			Nillable(),
		field.String("cancel_reason").
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

func (ProductionOrder) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("items", ProductionOrderItem.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("events", ProductionOrderEvent.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("creator", AdminUser.Type).
			Field("created_by").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("releaser", AdminUser.Type).
			Field("released_by").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("closer", AdminUser.Type).
			Field("closed_by").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("canceller", AdminUser.Type).
			Field("cancelled_by").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ProductionOrder) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("order_no").Unique(),
		index.Fields("status", "planned_start_at"),
		index.Fields("planned_end_at"),
		index.Fields("created_by", "created_at"),
	}
}
