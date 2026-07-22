package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"time"
)

type SalesReturnItem struct{ ent.Schema }

func (SalesReturnItem) Hooks() []ent.Hook {
	return []ent.Hook{rejectMutationOps(ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne, "sales return items are immutable source lines")}
}
func (SalesReturnItem) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"sales_return_items_subject_allowed": "subject_type = 'PRODUCT'", "sales_return_items_quantity_positive": "quantity > 0",
	}}}
}
func (SalesReturnItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("sales_return_id").Positive().Immutable(), field.String("line_no").NotEmpty().MaxLen(32).Immutable(), field.Int("shipment_item_id").Positive().Immutable(),
		field.String("subject_type").NotEmpty().Default("PRODUCT").MaxLen(16).Immutable(), field.Int("product_id").Positive().Immutable(), field.Int("product_sku_id").Optional().Nillable().Positive().Immutable(),
		field.Int("warehouse_id").Positive().Immutable(), field.Int("unit_id").Positive().Immutable(), field.Int("lot_id").Optional().Nillable().Positive().Immutable(),
		field.Int("quality_inspection_id").Positive().Immutable(),
		immutableDecimalQuantityField("quantity"), field.String("condition").NotEmpty().Default("PENDING_INSPECTION").MaxLen(32).Immutable(),
		field.String("note").Optional().Nillable().MaxLen(255).Immutable(), field.Time("created_at").Default(time.Now).Immutable(),
	}
}
func (SalesReturnItem) Edges() []ent.Edge {
	return []ent.Edge{edge.From("sales_return", SalesReturn.Type).Ref("items").Field("sales_return_id").Required().Unique().Immutable()}
}
func (SalesReturnItem) Indexes() []ent.Index {
	return []ent.Index{index.Fields("sales_return_id", "line_no").Unique(), index.Fields("shipment_item_id"), index.Fields("quality_inspection_id").Unique(), index.Fields("product_id", "product_sku_id", "warehouse_id", "lot_id")}
}
