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

type PurchaseOrder struct {
	ent.Schema
}

func (PurchaseOrder) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"purchase_orders_lifecycle_status_allowed": "lifecycle_status IN ('draft', 'submitted', 'approved', 'closed', 'canceled')",
			},
		},
	}
}

func (PurchaseOrder) Fields() []ent.Field {
	return []ent.Field{
		field.String("purchase_order_no").
			NotEmpty().
			MaxLen(64),
		field.Int("supplier_id").
			Positive(),
		field.String("supplier_purchase_order_no").
			Optional().
			Nillable().
			MaxLen(128),
		// Snapshot preserves order-time display data; Supplier remains the master truth.
		field.JSON("supplier_snapshot", map[string]any{}).
			Optional(),
		field.JSON("contract_party_snapshot", map[string]any{}).
			Optional(),
		field.Time("purchase_date"),
		field.Time("expected_arrival_date").
			Optional().
			Nillable(),
		field.String("lifecycle_status").
			NotEmpty().
			Default("draft").
			MaxLen(32),
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

func (PurchaseOrder) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("supplier", Supplier.Type).
			Ref("purchase_orders").
			Field("supplier_id").
			Required().
			Unique(),
		edge.To("items", PurchaseOrderItem.Type),
	}
}

func (PurchaseOrder) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("purchase_order_no").Unique(),
		index.Fields("supplier_id"),
		index.Fields("supplier_purchase_order_no"),
		index.Fields("lifecycle_status"),
		index.Fields("purchase_date"),
		index.Fields("expected_arrival_date"),
	}
}
