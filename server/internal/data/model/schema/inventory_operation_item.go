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

type InventoryOperationItem struct{ ent.Schema }

func (InventoryOperationItem) Hooks() []ent.Hook {
	return []ent.Hook{rejectMutationOps(ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne, "inventory_operation_items are immutable source lines")}
}

func (InventoryOperationItem) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"inventory_operation_items_subject_allowed":    "subject_type IN ('MATERIAL', 'PRODUCT')",
		"inventory_operation_items_sku_allowed":        "product_sku_id IS NULL OR subject_type = 'PRODUCT'",
		"inventory_operation_items_quantity_shape":     "expected_quantity IS NULL OR expected_quantity >= 0",
		"inventory_operation_items_counted_shape":      "counted_quantity IS NULL OR counted_quantity >= 0",
		"inventory_operation_items_nonzero_adjustment": "adjustment_quantity <> 0",
	}}}
}

func (InventoryOperationItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("operation_id").Positive().Immutable(),
		field.String("line_no").NotEmpty().MaxLen(32).Immutable(),
		field.String("subject_type").NotEmpty().MaxLen(16).Immutable(),
		field.Int("subject_id").Positive().Immutable(),
		field.Int("product_sku_id").Optional().Nillable().Positive().Immutable(),
		field.Int("from_warehouse_id").Positive().Immutable(),
		field.Int("from_lot_id").Optional().Nillable().Positive().Immutable(),
		field.Int("to_warehouse_id").Optional().Nillable().Positive().Immutable(),
		field.Int("to_lot_id").Optional().Nillable().Positive().Immutable(),
		field.Int("unit_id").Positive().Immutable(),
		optionalDecimalField("expected_quantity"),
		optionalDecimalField("counted_quantity"),
		immutableDecimalQuantityField("adjustment_quantity"),
		field.String("note").Optional().Nillable().MaxLen(255).Immutable(),
		field.Time("created_at").Default(time.Now).Immutable(),
	}
}

func (InventoryOperationItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("operation", InventoryOperation.Type).Ref("items").Field("operation_id").Required().Unique().Immutable(),
	}
}

func (InventoryOperationItem) Indexes() []ent.Index {
	return []ent.Index{index.Fields("operation_id", "line_no").Unique(), index.Fields("subject_type", "subject_id", "from_warehouse_id", "from_lot_id")}
}
