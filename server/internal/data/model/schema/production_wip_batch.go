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

// ProductionWIPBatch is a quantity-bearing work-in-process batch. It is not
// material or finished-goods inventory. source_batch_id records an explicit
// split/transfer lineage; origin_rework_fact_id keeps finished-goods rework
// descendants attached to the immutable rework fact that created their root.
type ProductionWIPBatch struct {
	ent.Schema
}

func (ProductionWIPBatch) Hooks() []ent.Hook {
	return []ent.Hook{
		rejectMutationOps(
			ent.OpDelete|ent.OpDeleteOne,
			"production WIP batches are lifecycle records; cancel them instead of deleting them",
		),
	}
}

func (ProductionWIPBatch) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"production_wip_batches_order_positive":    "production_order_id > 0",
			"production_wip_batches_quantity_positive": "quantity > 0",
			"production_wip_batches_version_positive":  "version > 0",
			"production_wip_batches_flow_type_allowed": "flow_type IN ('NORMAL', 'REWORK')",
			"production_wip_batches_execution_allowed": "execution_mode IS NULL OR execution_mode IN ('IN_HOUSE', 'OUTSOURCED')",
			"production_wip_batches_status_allowed":    "status IN ('PLANNED', 'SPLIT', 'IN_PROGRESS', 'OUTSOURCED', 'WAITING_QUALITY', 'ACCEPTED', 'REJECTED', 'CANCELLED')",
			"production_wip_batches_rework_bundle":     "((flow_type = 'NORMAL' AND rework_reason IS NULL) OR (flow_type = 'REWORK' AND rework_reason IS NOT NULL AND length(trim(rework_reason)) BETWEEN 1 AND 255 AND (source_batch_id IS NOT NULL OR origin_rework_fact_id IS NOT NULL)))",
		}},
	}
}

func (ProductionWIPBatch) Fields() []ent.Field {
	return []ent.Field{
		field.Int("production_order_id").Positive().Immutable(),
		field.Int("production_order_item_id").Positive().Immutable(),
		field.Int("production_order_operation_id").Positive().Immutable(),
		field.Int("source_batch_id").Optional().Nillable().Positive().Immutable(),
		field.Int("origin_rework_fact_id").Optional().Nillable().Positive().Immutable(),
		field.String("batch_no").NotEmpty().MaxLen(64).Immutable(),
		field.String("flow_type").NotEmpty().Default("NORMAL").MaxLen(16).Immutable(),
		field.String("execution_mode").Optional().Nillable().MaxLen(16),
		field.String("status").NotEmpty().Default("PLANNED").MaxLen(32),
		field.Int("version").Positive().Default(1),
		immutableDecimalQuantityField("quantity"),
		field.String("rework_reason").Optional().Nillable().MaxLen(255).Immutable(),
		field.Int("created_by").Positive().Immutable(),
		field.Time("started_at").Optional().Nillable(),
		field.Time("completed_at").Optional().Nillable(),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (ProductionWIPBatch) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("production_order", ProductionOrder.Type).
			Ref("wip_batches").
			Field("production_order_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("production_order_item", ProductionOrderItem.Type).
			Ref("wip_batches").
			Field("production_order_item_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("production_order_operation", ProductionOrderOperation.Type).
			Ref("wip_batches").
			Field("production_order_operation_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("child_batches", ProductionWIPBatch.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("source_batch", ProductionWIPBatch.Type).
			Ref("child_batches").
			Field("source_batch_id").
			Unique().
			Immutable(),
		edge.From("origin_rework_fact", ProductionFact.Type).
			Ref("origin_rework_batches").
			Field("origin_rework_fact_id").
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("completion_facts", ProductionFact.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("events", ProductionWIPEvent.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("quality_inspections", QualityInspection.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("outsourcing_allocations", ProductionWIPOutsourcingAllocation.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("creator", AdminUser.Type).
			Field("created_by").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ProductionWIPBatch) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("batch_no").Unique(),
		index.Fields("production_order_item_id", "production_order_operation_id"),
		index.Fields("source_batch_id"),
		index.Fields("origin_rework_fact_id").
			Unique().
			Annotations(entsql.IndexWhere("origin_rework_fact_id IS NOT NULL AND source_batch_id IS NULL")),
		index.Fields("origin_rework_fact_id", "status"),
		index.Fields("status", "execution_mode"),
	}
}
