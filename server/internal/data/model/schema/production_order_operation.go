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

// ProductionOrderOperation is the immutable operation route snapshot frozen
// for one production-order line. The master process display order is not a
// route and later process edits must not rewrite this snapshot.
type ProductionOrderOperation struct {
	ent.Schema
}

func (ProductionOrderOperation) Hooks() []ent.Hook {
	return []ent.Hook{
		rejectMutationOps(
			ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne,
			"production order operations are immutable release snapshots",
		),
	}
}

func (ProductionOrderOperation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"production_order_operations_order_positive":       "production_order_id > 0",
			"production_order_operations_step_positive":        "step_no > 0",
			"production_order_operations_process_positive":     "process_id > 0",
			"production_order_operations_quantity_positive":    "planned_quantity > 0",
			"production_order_operations_execution_supported":  "inhouse_allowed OR outsourcing_allowed",
			"production_order_operations_route_fixed":          "route_code = 'PLUSH_SEW_HAND_V1' AND route_version = 1",
			"production_order_operations_operation_present":    "length(trim(operation_code)) BETWEEN 1 AND 64",
			"production_order_operations_process_name_present": "length(trim(process_name_snapshot)) BETWEEN 1 AND 255",
			"production_order_operations_output_code_present":  "length(trim(output_code)) BETWEEN 1 AND 64",
			"production_order_operations_business_confirmation_scope": `
(
  (operation_code = 'PACKAGING' AND business_confirmation_code = 'PACKAGING_MATERIAL')
  OR (operation_code <> 'PACKAGING' AND business_confirmation_code IS NULL)
)`,
			"production_order_operations_route_step_fixed": `
(
  (step_no = 10 AND operation_code = 'FABRIC_PROCESSING' AND output_code = 'CUT_PIECE' AND NOT inhouse_allowed AND outsourcing_allowed)
  OR (step_no = 20 AND operation_code = 'SEWING' AND output_code = 'SHELL' AND inhouse_allowed AND outsourcing_allowed)
  OR (step_no = 30 AND operation_code = 'HANDWORK' AND output_code = 'FINISHED_GOODS' AND inhouse_allowed AND outsourcing_allowed)
  OR (step_no = 40 AND operation_code = 'PACKAGING' AND output_code = 'PACKED_GOODS' AND inhouse_allowed AND NOT outsourcing_allowed)
)`,
		}},
	}
}

func (ProductionOrderOperation) Fields() []ent.Field {
	return []ent.Field{
		field.Int("production_order_id").Positive().Immutable(),
		field.Int("production_order_item_id").Positive().Immutable(),
		field.String("route_code").NotEmpty().MaxLen(64).Immutable(),
		field.Int("route_version").Positive().Immutable(),
		field.Int("step_no").Positive().Immutable(),
		field.String("operation_code").NotEmpty().MaxLen(64).Immutable(),
		field.Int("process_id").Positive().Immutable(),
		field.String("process_code_snapshot").NotEmpty().MaxLen(64).Immutable(),
		field.String("process_name_snapshot").NotEmpty().MaxLen(255).Immutable(),
		field.String("output_code").NotEmpty().MaxLen(64).Immutable(),
		field.Bool("inhouse_allowed").Default(false).Immutable(),
		field.Bool("outsourcing_allowed").Default(false).Immutable(),
		immutableDecimalQuantityField("planned_quantity"),
		field.JSON("required_quality_gates", []string{}).Default([]string{}).Immutable(),
		field.String("business_confirmation_code").Optional().Nillable().MaxLen(64).Immutable(),
		field.Time("created_at").Default(time.Now).Immutable(),
	}
}

func (ProductionOrderOperation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("production_order", ProductionOrder.Type).
			Ref("operations").
			Field("production_order_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("production_order_item", ProductionOrderItem.Type).
			Ref("operations").
			Field("production_order_item_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("process", Process.Type).
			Field("process_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("wip_batches", ProductionWIPBatch.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ProductionOrderOperation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("production_order_item_id", "step_no").Unique(),
		index.Fields("production_order_id", "step_no"),
		index.Fields("process_id"),
		index.Fields("operation_code"),
	}
}
