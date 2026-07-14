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

// ProductionOrderMaterialRequirement is the immutable BOM demand snapshot
// frozen when a production order is released. Posted production material
// issues remain the issued-quantity truth; this table does not duplicate that
// mutable projection.
type ProductionOrderMaterialRequirement struct {
	ent.Schema
}

func (ProductionOrderMaterialRequirement) Hooks() []ent.Hook {
	return []ent.Hook{
		rejectMutationOps(
			ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne,
			"production order material requirements are immutable release snapshots",
		),
	}
}

func (ProductionOrderMaterialRequirement) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"production_order_material_requirements_unit_quantity_positive":    "unit_quantity_snapshot > 0",
			"production_order_material_requirements_loss_rate_non_negative":    "loss_rate_snapshot >= 0",
			"production_order_material_requirements_planned_quantity_positive": "planned_quantity > 0",
		}},
	}
}

func (ProductionOrderMaterialRequirement) Fields() []ent.Field {
	return []ent.Field{
		field.Int("production_order_id").Positive().Immutable(),
		field.Int("production_order_item_id").Positive().Immutable(),
		field.Int("bom_header_id").Positive().Immutable(),
		field.Int("bom_item_id").Positive().Immutable(),
		field.Int("material_id").Positive().Immutable(),
		field.Int("unit_id").Positive().Immutable(),
		immutableDecimalQuantityField("unit_quantity_snapshot"),
		immutableDecimalRateField("loss_rate_snapshot"),
		immutableDecimalQuantityField("planned_quantity"),
		field.String("material_code_snapshot").NotEmpty().MaxLen(64).Immutable(),
		field.String("material_name_snapshot").NotEmpty().MaxLen(255).Immutable(),
		field.String("unit_code_snapshot").NotEmpty().MaxLen(32).Immutable(),
		field.String("unit_name_snapshot").NotEmpty().MaxLen(64).Immutable(),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (ProductionOrderMaterialRequirement) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("production_order", ProductionOrder.Type).
			Ref("material_requirements").
			Field("production_order_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("production_order_item", ProductionOrderItem.Type).
			Ref("material_requirements").
			Field("production_order_item_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("bom_header", BOMHeader.Type).
			Ref("production_order_material_requirements").
			Field("bom_header_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("bom_item", BOMItem.Type).
			Ref("production_order_material_requirements").
			Field("bom_item_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("material", Material.Type).
			Ref("production_order_material_requirements").
			Field("material_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("unit", Unit.Type).
			Ref("production_order_material_requirements").
			Field("unit_id").
			Required().
			Unique().
			Immutable().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ProductionOrderMaterialRequirement) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("production_order_item_id", "bom_item_id").Unique(),
		index.Fields("production_order_id", "production_order_item_id"),
		index.Fields("material_id", "unit_id"),
	}
}
