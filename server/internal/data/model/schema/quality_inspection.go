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

type QualityInspection struct {
	ent.Schema
}

var qualityInspectionLockedFields = map[string]struct{}{
	"inspection_no":               {},
	"purchase_receipt_id":         {},
	"purchase_receipt_item_id":    {},
	"inventory_lot_id":            {},
	"production_wip_batch_id":     {},
	"gate_code":                   {},
	"material_id":                 {},
	"warehouse_id":                {},
	"source_type":                 {},
	"source_id":                   {},
	"inspection_type":             {},
	"subject_type":                {},
	"subject_id":                  {},
	"status":                      {},
	"result":                      {},
	"original_lot_status":         {},
	"inspected_at":                {},
	"inspector_id":                {},
	"defect_rate_operator":        {},
	"defect_rate_percent":         {},
	"correction_of_inspection_id": {},
}

func (QualityInspection) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("quality_inspections are quality decision facts; cancel inspections instead of deleting them")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, qualityInspectionLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("quality_inspection protected fields are immutable; use quality inspection status actions instead")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (QualityInspection) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"quality_inspections_source_shape": `
(
  (
    production_wip_batch_id IS NULL
    AND gate_code IS NULL
    AND inventory_lot_id IS NOT NULL
    AND warehouse_id IS NOT NULL
  )
  OR
  (
    production_wip_batch_id IS NOT NULL
    AND gate_code IS NOT NULL
    AND source_type IS NOT NULL
    AND source_type = 'PRODUCTION_WIP'
    AND source_id IS NOT NULL
    AND source_id = production_wip_batch_id
    AND inspection_type IS NOT NULL
    AND inspection_type = 'PRODUCTION_STAGE'
    AND subject_type IS NOT NULL
    AND subject_type = 'WIP'
    AND subject_id IS NOT NULL
    AND subject_id = production_wip_batch_id
    AND inventory_lot_id IS NULL
    AND warehouse_id IS NULL
    AND purchase_receipt_id IS NULL
    AND purchase_receipt_item_id IS NULL
    AND material_id IS NULL
  )
)`,
				"quality_inspections_production_gate_allowed": "gate_code IS NULL OR gate_code IN ('CUT_PIECE', 'SHELL', 'FINISHED_GOODS', 'NEEDLE', 'SAMPLING', 'CUSTOMER_ACCEPTANCE')",
				"quality_inspections_defect_rate_bundle_complete": `
(
  (
    defect_rate_operator IS NULL
    AND defect_rate_percent IS NULL
  )
  OR
  (
    defect_rate_operator IS NOT NULL
    AND defect_rate_percent IS NOT NULL
  )
)`,
				"quality_inspections_defect_rate_operator_valid": "defect_rate_operator IS NULL OR defect_rate_operator IN ('APPROX', 'GT')",
				"quality_inspections_defect_rate_percent_range":  "defect_rate_percent IS NULL OR (defect_rate_percent >= 0 AND defect_rate_percent <= 100)",
				"quality_inspections_defect_rate_gt_below_100":   "defect_rate_operator IS NULL OR defect_rate_operator <> 'GT' OR defect_rate_percent < 100",
				"quality_inspections_superseded_bundle":          "((superseded_at IS NULL AND superseded_by IS NULL AND superseded_reason IS NULL) OR (superseded_at IS NOT NULL AND superseded_by IS NOT NULL AND superseded_reason IS NOT NULL AND length(trim(superseded_reason)) > 0))",
			},
		},
	}
}

func (QualityInspection) Fields() []ent.Field {
	return []ent.Field{
		field.String("inspection_no").
			NotEmpty().
			MaxLen(64),
		field.Int("purchase_receipt_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("purchase_receipt_item_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("inventory_lot_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("production_wip_batch_id").
			Optional().
			Nillable().
			Positive(),
		field.String("gate_code").
			Optional().
			Nillable().
			MaxLen(64),
		field.Int("material_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("warehouse_id").
			Optional().
			Nillable().
			Positive(),
		field.String("source_type").
			Optional().
			Nillable().
			MaxLen(64),
		field.Int("source_id").
			Optional().
			Nillable().
			Positive(),
		field.String("inspection_type").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("subject_type").
			Optional().
			Nillable().
			MaxLen(64),
		field.Int("subject_id").
			Optional().
			Nillable().
			Positive(),
		field.String("status").
			NotEmpty().
			Default("DRAFT").
			MaxLen(32),
		field.String("result").
			Optional().
			Nillable().
			MaxLen(32),
		// Used only to restore a lot when cancelling SUBMITTED inspection; quality decisions do not write stock txns.
		field.String("original_lot_status").
			Default("").
			MaxLen(32),
		field.Time("inspected_at").
			Optional().
			Nillable(),
		field.Int("inspector_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("correction_of_inspection_id").
			Optional().
			Nillable().
			Positive().
			Immutable(),
		field.Time("superseded_at").
			Optional().
			Nillable(),
		field.Int("superseded_by").
			Optional().
			Nillable().
			Positive(),
		field.String("superseded_reason").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("defect_rate_operator").
			Optional().
			Nillable().
			MaxLen(16),
		optionalDecimalField("defect_rate_percent"),
		field.String("decision_note").
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

func (QualityInspection) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("purchase_receipt", PurchaseReceipt.Type).
			Ref("quality_inspections").
			Field("purchase_receipt_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("purchase_receipt_item", PurchaseReceiptItem.Type).
			Ref("quality_inspections").
			Field("purchase_receipt_item_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("inventory_lot", InventoryLot.Type).
			Ref("quality_inspections").
			Field("inventory_lot_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("production_wip_batch", ProductionWIPBatch.Type).
			Ref("quality_inspections").
			Field("production_wip_batch_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("material", Material.Type).
			Ref("quality_inspections").
			Field("material_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("warehouse", Warehouse.Type).
			Ref("quality_inspections").
			Field("warehouse_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("purchase_returns", PurchaseReturn.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (QualityInspection) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("inspection_no").Unique(),
		index.Fields("purchase_receipt_id"),
		index.Fields("purchase_receipt_item_id"),
		index.Fields("inventory_lot_id"),
		index.Fields("production_wip_batch_id", "gate_code"),
		index.Fields("material_id"),
		index.Fields("warehouse_id"),
		index.Fields("source_type", "source_id"),
		index.Fields("inspection_type"),
		index.Fields("subject_type", "subject_id"),
		index.Fields("status"),
		index.Fields("inspected_at"),
		index.Fields("correction_of_inspection_id").
			Unique().
			Annotations(entsql.IndexWhere("correction_of_inspection_id IS NOT NULL")),
		// Only one in-flight inspection may hold the same lot at SUBMITTED status.
		index.Fields("inventory_lot_id").
			Unique().
			StorageKey("qualityinspection_inventory_lot_id_submitted").
			Annotations(
				entsql.IndexWhere("status = 'SUBMITTED'"),
			),
		index.Fields("production_wip_batch_id", "gate_code").
			Unique().
			StorageKey("qualityinspection_wip_batch_gate_active").
			Annotations(
				entsql.IndexWhere("production_wip_batch_id IS NOT NULL AND gate_code IS NOT NULL AND status <> 'CANCELLED'"),
			),
	}
}
