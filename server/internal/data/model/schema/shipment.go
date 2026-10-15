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

type Shipment struct {
	ent.Schema
}

var shipmentLockedFields = map[string]struct{}{
	"shipment_no":                  {},
	"sales_order_id":               {},
	"customer_id":                  {},
	"status":                       {},
	"version":                      {},
	"idempotency_key":              {},
	"shipped_at":                   {},
	"total_net_weight_g":           {},
	"requested_total_net_weight_g": {},
	"delivery_snapshot":            {},
	"transport_method":             {},
	"carrier_name":                 {},
	"tracking_no":                  {},
	"package_count":                {},
	"gross_weight_kg":              {},
	"volume_m3":                    {},
	"shipping_mark":                {},
	"freight_amount":               {},
	"freight_currency":             {},
}

func (Shipment) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("shipments are immutable source documents; cancel shipped shipments with reversal instead of deleting them")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, shipmentLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("shipment protected fields are immutable; use ShipShipment or CancelShippedShipment for status changes")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (Shipment) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"shipments_status_allowed":                        "status IN ('DRAFT', 'SHIPPED', 'CANCELLED')",
				"shipments_finance_release_status_allowed":        "finance_release_status IN ('PENDING', 'APPROVED', 'REJECTED')",
				"shipments_finance_release_version_positive":      "finance_release_version > 0",
				"shipments_version_positive":                      "version > 0",
				"shipments_total_net_weight_g_positive":           "total_net_weight_g IS NULL OR total_net_weight_g > 0",
				"shipments_requested_total_net_weight_g_positive": "requested_total_net_weight_g IS NULL OR requested_total_net_weight_g > 0",
				"shipments_package_count_positive":                "package_count IS NULL OR package_count > 0",
				"shipments_gross_weight_kg_positive":              "gross_weight_kg IS NULL OR gross_weight_kg > 0",
				"shipments_volume_m3_positive":                    "volume_m3 IS NULL OR volume_m3 > 0",
				"shipments_freight_amount_nonnegative":            "freight_amount IS NULL OR freight_amount >= 0",
				"shipments_freight_currency_allowed":              "freight_currency IS NULL OR freight_currency IN ('USD', 'CNY', 'HKD')",
				"shipments_freight_pair_valid":                    "((freight_amount IS NULL AND freight_currency IS NULL) OR (freight_amount IS NOT NULL AND freight_currency IS NOT NULL))",
			},
		},
	}
}

func (Shipment) Fields() []ent.Field {
	return []ent.Field{
		field.String("shipment_no").NotEmpty().MaxLen(64),
		field.Int("sales_order_id").Optional().Nillable().Positive(),
		field.Int("customer_id").Optional().Nillable().Positive(),
		// Snapshot preserves shipment-time display data; Customer remains the master truth.
		field.String("customer_snapshot").Optional().Nillable().MaxLen(512),
		field.JSON("delivery_snapshot", map[string]any{}).Optional(),
		field.String("status").NotEmpty().Default("DRAFT").MaxLen(32),
		field.Int("version").Positive().Default(1),
		field.String("finance_release_status").NotEmpty().Default("PENDING").MaxLen(32),
		field.Int("finance_release_version").Positive().Default(1),
		field.Time("finance_released_at").Optional().Nillable(),
		field.Int("finance_released_by").Optional().Nillable().Positive(),
		field.Int("finance_release_process_instance_id").Optional().Nillable().Positive(),
		field.Int("finance_release_process_node_id").Optional().Nillable().Positive(),
		field.String("finance_release_note").Optional().Nillable().MaxLen(255),
		field.String("idempotency_key").NotEmpty().MaxLen(128),
		field.Time("planned_ship_at").Optional().Nillable(),
		field.Time("shipped_at").Optional().Nillable(),
		field.String("transport_method").Optional().Nillable().MaxLen(64),
		field.String("carrier_name").Optional().Nillable().MaxLen(128),
		field.String("tracking_no").Optional().Nillable().MaxLen(128),
		field.Int("package_count").Optional().Nillable().Positive(),
		optionalDecimalField("gross_weight_kg"),
		optionalDecimalField("volume_m3"),
		field.String("shipping_mark").Optional().Nillable().MaxLen(255),
		optionalDecimalField("freight_amount"),
		field.String("freight_currency").Optional().Nillable().MaxLen(16),
		optionalDecimalField("total_net_weight_g"),
		// Internal immutable create-intent snapshot used only for idempotency comparison.
		optionalDecimalField("requested_total_net_weight_g"),
		field.String("note").Optional().Nillable().MaxLen(255),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (Shipment) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("sales_order", SalesOrder.Type).Ref("shipments").Field("sales_order_id").Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("customer", Customer.Type).Ref("shipments").Field("customer_id").Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("items", ShipmentItem.Type),
	}
}

func (Shipment) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("shipment_no").Unique(),
		index.Fields("idempotency_key").Unique(),
		index.Fields("sales_order_id"),
		index.Fields("customer_id"),
		index.Fields("status"),
	}
}
