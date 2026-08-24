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
				"purchase_orders_lifecycle_status_allowed":      "lifecycle_status IN ('draft', 'submitted', 'approved', 'closed', 'canceled')",
				"purchase_orders_version_positive":              "version > 0",
				"purchase_orders_currency_allowed":              "currency IN ('USD', 'CNY', 'HKD')",
				"purchase_orders_payment_term_days_nonnegative": "payment_term_days IS NULL OR payment_term_days >= 0",
				"purchase_orders_invoice_category_allowed":      "invoice_category IS NULL OR invoice_category IN ('EXPORT_GENERAL', 'VAT_GENERAL_1', 'VAT_SPECIAL_3', 'VAT_SPECIAL_13')",
				"purchase_orders_invoice_pair_valid":            "((invoice_required IS NULL AND invoice_category IS NULL) OR (invoice_required = false AND invoice_category IS NULL) OR (invoice_required = true AND invoice_category IS NOT NULL))",
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
		field.String("currency").
			NotEmpty().
			Default("CNY").
			MaxLen(16),
		field.Int("payment_term_days").
			Optional().
			Nillable().
			NonNegative(),
		field.String("payment_method").Optional().Nillable().MaxLen(128),
		field.Bool("invoice_required").Optional().Nillable(),
		field.String("invoice_category").Optional().Nillable().MaxLen(32),
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
		field.Time("supplier_confirmed_arrival_date").
			Optional().
			Nillable(),
		field.String("delivery_address").Optional().Nillable().MaxLen(512),
		field.String("lifecycle_status").
			NotEmpty().
			Default("draft").
			MaxLen(32),
		field.Int("version").
			Positive().
			Default(1),
		field.String("settlement_action").Optional().Nillable().MaxLen(32),
		field.String("settlement_mode").Optional().Nillable().MaxLen(32),
		field.String("settlement_reason").Optional().Nillable().MaxLen(255),
		field.Time("settled_at").Optional().Nillable(),
		field.Int("settled_by").Optional().Nillable().Positive(),
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
