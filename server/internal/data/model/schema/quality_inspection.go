package schema

import (
	"context"
	"errors"
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type QualityInspection struct {
	ent.Schema
}

var qualityInspectionLockedFields = map[string]struct{}{
	"inspection_no":            {},
	"purchase_receipt_id":      {},
	"purchase_receipt_item_id": {},
	"inventory_lot_id":         {},
	"material_id":              {},
	"warehouse_id":             {},
	"status":                   {},
	"result":                   {},
	"original_lot_status":      {},
	"inspected_at":             {},
	"inspector_id":             {},
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

func (QualityInspection) Fields() []ent.Field {
	return []ent.Field{
		field.String("inspection_no").
			NotEmpty().
			MaxLen(64),
		field.Int("purchase_receipt_id").
			Positive(),
		field.Int("purchase_receipt_item_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("inventory_lot_id").
			Positive(),
		field.Int("material_id").
			Positive(),
		field.Int("warehouse_id").
			Positive(),
		field.String("status").
			NotEmpty().
			Default("DRAFT").
			MaxLen(32),
		field.String("result").
			Optional().
			Nillable().
			MaxLen(32),
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
			Required().
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
			Required().
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("material", Material.Type).
			Ref("quality_inspections").
			Field("material_id").
			Required().
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("warehouse", Warehouse.Type).
			Ref("quality_inspections").
			Field("warehouse_id").
			Required().
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (QualityInspection) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("inspection_no").Unique(),
		index.Fields("purchase_receipt_id"),
		index.Fields("purchase_receipt_item_id"),
		index.Fields("inventory_lot_id"),
		index.Fields("material_id"),
		index.Fields("warehouse_id"),
		index.Fields("status"),
		index.Fields("inspected_at"),
		index.Fields("inventory_lot_id").
			Unique().
			StorageKey("qualityinspection_inventory_lot_id_submitted").
			Annotations(
				entsql.IndexWhere("status = 'SUBMITTED'"),
			),
	}
}
