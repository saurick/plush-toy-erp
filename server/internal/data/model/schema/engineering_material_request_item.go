package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type EngineeringMaterialRequestItem struct{ ent.Schema }

func (EngineeringMaterialRequestItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("request_id").Positive(), field.Int("material_id").Positive(), field.Int("unit_id").Positive(), field.Int("supplier_id").Positive(),
		field.String("material_code").MaxLen(64), field.String("material_name").MaxLen(255), field.String("supplier_name").MaxLen(255),
		field.String("supplier_item_no").Optional().Nillable().MaxLen(255), field.String("color").Optional().Nillable().MaxLen(64),
		field.String("spec").Optional().Nillable().MaxLen(255), field.String("unit_name").MaxLen(64),
		decimalQuantityField("required_quantity"), optionalDecimalField("purchase_quantity"), optionalDecimalField("unit_price"),
		field.Time("expected_arrival_date").Optional().Nillable(), field.String("note").Optional().Nillable().MaxLen(255),
	}
}
func (EngineeringMaterialRequestItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("request", EngineeringMaterialRequest.Type).Ref("items").Field("request_id").Required().Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("material", Material.Type).Field("material_id").Required().Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("unit", Unit.Type).Field("unit_id").Required().Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.To("supplier", Supplier.Type).Field("supplier_id").Required().Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}
func (EngineeringMaterialRequestItem) Indexes() []ent.Index {
	return []ent.Index{index.Fields("request_id", "material_id", "unit_id").Unique()}
}
func (EngineeringMaterialRequestItem) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"engineering_material_request_items_quantity_valid": "required_quantity > 0 AND (purchase_quantity IS NULL OR purchase_quantity >= 0)",
		"engineering_material_request_items_price_valid":    "unit_price IS NULL OR unit_price >= 0",
	}}}
}
