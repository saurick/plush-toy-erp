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

type ProductionFact struct {
	ent.Schema
}

var productionFactLockedFields = map[string]struct{}{
	"fact_no":               {},
	"fact_type":             {},
	"status":                {},
	"subject_type":          {},
	"subject_id":            {},
	"product_sku_id":        {},
	"warehouse_id":          {},
	"unit_id":               {},
	"lot_id":                {},
	"quantity":              {},
	"source_type":           {},
	"source_id":             {},
	"source_line_id":        {},
	"idempotency_key":       {},
	"occurred_at":           {},
	"occurred_at_specified": {},
	"posted_at":             {},
}

func (ProductionFact) Hooks() []ent.Hook {
	return []ent.Hook{
		func(next ent.Mutator) ent.Mutator {
			return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
				if m.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
					return nil, errors.New("production_facts are immutable facts; cancel posted facts with reversal instead of deleting them")
				}
				if m.Op().Is(ent.OpUpdate|ent.OpUpdateOne) &&
					(mutationTouchesAny(m, productionFactLockedFields) || mutationTouchesEdges(m)) {
					return nil, errors.New("production_fact protected fields are immutable; use PostProductionFact or CancelPostedProductionFact for status changes")
				}
				return next.Mutate(ctx, m)
			})
		},
	}
}

func (ProductionFact) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"production_facts_type_allowed":        "fact_type IN ('MATERIAL_ISSUE', 'FINISHED_GOODS_RECEIPT', 'REWORK', 'SCRAP')",
				"production_facts_status_allowed":      "status IN ('DRAFT', 'POSTED', 'CANCELLED')",
				"production_facts_subject_allowed":     "subject_type IN ('MATERIAL', 'PRODUCT')",
				"production_facts_sku_subject_allowed": "product_sku_id IS NULL OR subject_type = 'PRODUCT'",
				"production_facts_quantity_positive":   "quantity > 0",
			},
		},
	}
}

func (ProductionFact) Fields() []ent.Field {
	return []ent.Field{
		// Operational facts are domain facts that may post inventory_txns through usecase actions.
		field.String("fact_no").NotEmpty().MaxLen(64),
		field.String("fact_type").NotEmpty().MaxLen(32),
		field.String("status").NotEmpty().Default("DRAFT").MaxLen(32),
		field.String("subject_type").NotEmpty().MaxLen(16),
		field.Int("subject_id").Positive(),
		field.Int("product_sku_id").Optional().Nillable().Positive(),
		field.Int("warehouse_id").Positive(),
		field.Int("unit_id").Positive(),
		field.Int("lot_id").Optional().Nillable().Positive(),
		decimalQuantityField("quantity"),
		// source_* keeps source-document traceability; it is not a replacement for business_records.
		field.String("source_type").Optional().Nillable().MaxLen(64),
		field.Int("source_id").Optional().Nillable().Positive(),
		field.Int("source_line_id").Optional().Nillable().Positive(),
		field.String("idempotency_key").NotEmpty().MaxLen(128),
		field.Time("occurred_at").Default(time.Now),
		field.Bool("occurred_at_specified").Default(false),
		field.Time("posted_at").Optional().Nillable(),
		field.String("note").Optional().Nillable().MaxLen(255),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (ProductionFact) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("warehouse", Warehouse.Type).Ref("production_facts").Field("warehouse_id").Required().Unique(),
		edge.From("unit", Unit.Type).Ref("production_facts").Field("unit_id").Required().Unique(),
		edge.From("product_sku", ProductSKU.Type).Ref("production_facts").Field("product_sku_id").Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("inventory_lot", InventoryLot.Type).Ref("production_facts").Field("lot_id").Unique().Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ProductionFact) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("fact_no").Unique(),
		index.Fields("idempotency_key").Unique(),
		index.Fields("fact_type", "status"),
		index.Fields("product_sku_id"),
		index.Fields("source_type", "source_id", "source_line_id"),
		index.Fields("subject_type", "subject_id", "warehouse_id", "lot_id"),
	}
}
