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

// ProductionWIPOutsourcingAllocation binds one immutable outsourcing contract
// line to one WIP batch. Product operations require exactly one PRODUCT row;
// fabric processing may require multiple MATERIAL rows, one for every frozen
// BOM requirement explicitly owned by FABRIC_PROCESSING.
type ProductionWIPOutsourcingAllocation struct {
	ent.Schema
}

func (ProductionWIPOutsourcingAllocation) Hooks() []ent.Hook {
	return []ent.Hook{
		rejectMutationOps(
			ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne,
			"production WIP outsourcing allocations are immutable source links",
		),
	}
}

func (ProductionWIPOutsourcingAllocation) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"production_wip_outsourcing_allocations_subject_allowed":   "subject_type IN ('PRODUCT', 'MATERIAL')",
			"production_wip_outsourcing_allocations_quantity_positive": "allocated_quantity > 0",
			"production_wip_outsourcing_allocations_subject_bundle": `
(
  (subject_type = 'PRODUCT' AND production_order_material_requirement_id IS NULL)
  OR
  (subject_type = 'MATERIAL' AND production_order_material_requirement_id IS NOT NULL)
)`,
		}},
	}
}

func (ProductionWIPOutsourcingAllocation) Fields() []ent.Field {
	return []ent.Field{
		field.Int("production_wip_batch_id").Positive().Immutable(),
		field.Int("outsourcing_order_item_id").Positive().Immutable(),
		field.Int("production_order_material_requirement_id").Optional().Nillable().Positive().Immutable(),
		field.String("subject_type").NotEmpty().MaxLen(16).Immutable(),
		immutableDecimalQuantityField("allocated_quantity"),
		field.Int("unit_id").Positive().Immutable(),
		field.Int("created_by").Positive().Immutable(),
		field.Time("created_at").Default(time.Now).Immutable(),
	}
}

func (ProductionWIPOutsourcingAllocation) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("production_wip_batch", ProductionWIPBatch.Type).
			Ref("outsourcing_allocations").
			Field("production_wip_batch_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("outsourcing_order_item", OutsourcingOrderItem.Type).
			Ref("production_wip_outsourcing_allocations").
			Field("outsourcing_order_item_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("production_order_material_requirement", ProductionOrderMaterialRequirement.Type).
			Ref("production_wip_outsourcing_allocations").
			Field("production_order_material_requirement_id").
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("unit", Unit.Type).
			Field("unit_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("creator", AdminUser.Type).
			Field("created_by").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ProductionWIPOutsourcingAllocation) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("outsourcing_order_item_id").Unique(),
		index.Fields("production_wip_batch_id", "outsourcing_order_item_id").Unique(),
		index.Fields("production_wip_batch_id", "production_order_material_requirement_id").
			Unique().
			Annotations(entsql.IndexWhere("production_order_material_requirement_id IS NOT NULL")),
		index.Fields("production_wip_batch_id"),
	}
}
