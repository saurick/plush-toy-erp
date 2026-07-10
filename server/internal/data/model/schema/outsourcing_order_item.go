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

type OutsourcingOrderItem struct {
	ent.Schema
}

func (OutsourcingOrderItem) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"outsourcing_order_items_line_no_positive":        "line_no > 0",
				"outsourcing_order_items_quantity_positive":       "outsourcing_quantity > 0",
				"outsourcing_order_items_unit_price_non_negative": "unit_price IS NULL OR unit_price >= 0",
				"outsourcing_order_items_amount_non_negative":     "amount IS NULL OR amount >= 0",
				"outsourcing_order_items_line_status_allowed":     "line_status IN ('open', 'closed', 'canceled')",
				"outsourcing_order_items_subject_type_allowed":    "subject_type IN ('PRODUCT', 'MATERIAL')",
				"outsourcing_order_items_subject_exactly_one":     "((subject_type = 'PRODUCT' AND product_id IS NOT NULL AND material_id IS NULL) OR (subject_type = 'MATERIAL' AND product_id IS NULL AND material_id IS NOT NULL))",
				"outsourcing_order_items_product_id_positive":     "product_id IS NULL OR product_id > 0",
				"outsourcing_order_items_material_id_positive":    "material_id IS NULL OR material_id > 0",
			},
		},
	}
}

func (OutsourcingOrderItem) Fields() []ent.Field {
	return []ent.Field{
		field.Int("outsourcing_order_id").
			Positive(),
		field.Int("line_no").
			Positive(),
		field.String("subject_type").
			NotEmpty().
			MaxLen(16),
		field.Int("product_id").
			Positive().
			Optional().
			Nillable(),
		field.Int("material_id").
			Positive().
			Optional().
			Nillable(),
		field.Int("process_id").
			Positive(),
		field.Int("unit_id").
			Positive(),
		// Snapshots preserve contract-time print fields; master data remains the truth for future edits.
		field.String("product_no_snapshot").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("product_order_no_snapshot").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("product_name_snapshot").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("material_code_snapshot").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("material_name_snapshot").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("process_name_snapshot").
			Optional().
			Nillable().
			MaxLen(255),
		field.String("process_category_snapshot").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("unit_name_snapshot").
			Optional().
			Nillable().
			MaxLen(64),
		decimalQuantityField("outsourcing_quantity"),
		optionalDecimalField("unit_price"),
		optionalDecimalField("amount"),
		field.Time("expected_return_date").
			Optional().
			Nillable(),
		field.String("line_status").
			NotEmpty().
			Default("open").
			MaxLen(32),
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

func (OutsourcingOrderItem) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("outsourcing_order", OutsourcingOrder.Type).
			Ref("items").
			Field("outsourcing_order_id").
			Required().
			Unique(),
		edge.From("product", Product.Type).
			Ref("outsourcing_order_items").
			Field("product_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("material", Material.Type).
			Ref("outsourcing_order_items").
			Field("material_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("process", Process.Type).
			Ref("outsourcing_order_items").
			Field("process_id").
			Required().
			Unique(),
		edge.From("unit", Unit.Type).
			Ref("outsourcing_order_items").
			Field("unit_id").
			Required().
			Unique(),
	}
}

func (OutsourcingOrderItem) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("outsourcing_order_id", "line_no").Unique(),
		index.Fields("subject_type"),
		index.Fields("product_id"),
		index.Fields("material_id"),
		index.Fields("process_id"),
		index.Fields("unit_id"),
		index.Fields("line_status"),
		index.Fields("expected_return_date"),
	}
}
