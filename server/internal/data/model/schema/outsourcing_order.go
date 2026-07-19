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

type OutsourcingOrder struct {
	ent.Schema
}

func (OutsourcingOrder) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"outsourcing_orders_lifecycle_status_allowed": "lifecycle_status IN ('draft', 'submitted', 'confirmed', 'closed', 'canceled')",
				"outsourcing_orders_version_positive":         "version > 0",
			},
		},
	}
}

func (OutsourcingOrder) Fields() []ent.Field {
	return []ent.Field{
		field.String("outsourcing_order_no").
			NotEmpty().
			MaxLen(64),
		field.Int("supplier_id").
			Positive(),
		// Snapshot preserves contract-time display data; Supplier remains the master truth.
		field.JSON("supplier_snapshot", map[string]any{}).
			Optional(),
		field.JSON("contract_party_snapshot", map[string]any{}).
			Optional(),
		field.String("source_order_no").
			Optional().
			Nillable().
			MaxLen(128),
		field.Time("order_date"),
		field.Time("expected_return_date").
			Optional().
			Nillable(),
		field.String("lifecycle_status").
			NotEmpty().
			Default("draft").
			MaxLen(32),
		field.Int("version").
			Positive().
			Default(1),
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

func (OutsourcingOrder) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("supplier", Supplier.Type).
			Ref("outsourcing_orders").
			Field("supplier_id").
			Required().
			Unique(),
		edge.To("items", OutsourcingOrderItem.Type),
	}
}

func (OutsourcingOrder) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("outsourcing_order_no").Unique(),
		index.Fields("supplier_id"),
		index.Fields("source_order_no"),
		index.Fields("lifecycle_status"),
		index.Fields("order_date"),
		index.Fields("expected_return_date"),
	}
}
