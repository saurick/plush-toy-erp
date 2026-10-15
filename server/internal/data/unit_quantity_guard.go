package data

import (
	"context"
	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/shopspring/decimal"
)

// Every business client, including clients backed by an existing SQL
// transaction, installs the same guards. BOM coefficients retain scale six;
// executable quantities use the persisted unit scale.
func newBusinessEntClient(options ...ent.Option) *ent.Client {
	client := ent.NewClient(options...)
	client.Use(unitQuantityGuard)
	return client
}

var unitQuantityFields = map[string][]string{
	"SalesOrderItem":                     {"ordered_quantity", "pre_shipment_sample_quantity"},
	"PurchaseOrderItem":                  {"purchased_quantity"},
	"OutsourcingOrderItem":               {"outsourcing_quantity"},
	"ProductionOrderItem":                {"planned_quantity"},
	"PurchaseReceiptItem":                {"quantity", "declared_quantity"},
	"PurchaseReturnItem":                 {"quantity"},
	"PurchaseReceiptAdjustmentItem":      {"quantity"},
	"ShipmentItem":                       {"quantity"},
	"ProductionFact":                     {"quantity"},
	"OutsourcingFact":                    {"quantity"},
	"InventoryTxn":                       {"quantity"},
	"InventoryOperationItem":             {"counted_quantity", "adjustment_quantity"},
	"StockReservation":                   {"quantity"},
	"EngineeringMaterialRequestItem":     {"required_quantity"},
	"ProductionWIPBatch":                 {"quantity"},
	"ProductionWIPEvent":                 {"quantity"},
	"ProductionWIPOutsourcingAllocation": {"allocated_quantity"},
	"ProductionExceptionDecision":        {"requested_quantity", "approved_quantity"},
	"PurchaseRejectionDisposition":       {"quantity"},
	"OutsourcingReturnDisposition":       {"quantity"},
	"ProductionOrderMaterialRequirement": {"planned_quantity"},
	"ProductionOrderOperation":           {"planned_quantity"},
}

func unitQuantityGuard(next ent.Mutator) ent.Mutator {
	return ent.MutateFunc(func(ctx context.Context, mutation ent.Mutation) (ent.Value, error) {
		if mutation.Op().Is(ent.OpDelete | ent.OpDeleteOne) {
			return next.Mutate(ctx, mutation)
		}
		if mutation.Type() == "BOMItem" {
			if raw, changed := mutation.Field("quantity"); changed {
				if err := biz.ValidateUnitQuantity(raw.(decimal.Decimal), 6); err != nil {
					return nil, err
				}
			}
			return next.Mutate(ctx, mutation)
		}
		fields := unitQuantityFields[mutation.Type()]
		_, unitChanged := mutation.Field("unit_id")
		for _, field := range []string{"production_order_item_id", "production_material_requirement_id", "production_wip_batch_id", "purchase_receipt_item_id", "outsourcing_return_fact_id"} {
			_, changed := mutation.Field(field)
			unitChanged = unitChanged || changed || mutation.FieldCleared(field)
		}
		quantities := make([]decimal.Decimal, 0, len(fields))
		for _, field := range fields {
			if mutation.FieldCleared(field) {
				continue
			}
			raw, changed := mutation.Field(field)
			if !changed && !unitChanged {
				continue
			}
			if !changed && unitChanged && mutation.Op().Is(ent.OpUpdateOne) {
				var err error
				raw, err = mutation.OldField(ctx, field)
				if err != nil {
					return nil, err
				}
			}
			if quantity, ok := raw.(decimal.Decimal); ok {
				quantities = append(quantities, quantity)
			}
			if quantity, ok := raw.(*decimal.Decimal); ok && quantity != nil {
				quantities = append(quantities, *quantity)
			}
		}
		if len(quantities) == 0 {
			return next.Mutate(ctx, mutation)
		}
		if mutation.Type() == "InventoryTxn" {
			if kind, _ := mutation.Field("txn_type"); kind == biz.InventoryTxnReversal {
				for _, quantity := range quantities {
					if err := biz.ValidateUnitQuantity(quantity, 6); err != nil {
						return nil, err
					}
				}
				return next.Mutate(ctx, mutation)
			}
		}
		client := mutation.(interface{ Client() *ent.Client }).Client()
		if mutation.Op().Is(ent.OpUpdate) {
			// Exception approvals use a version/status predicate for CAS. Validate
			// the matched source while preserving that predicate and its row count.
			if mutation.Type() != "ProductionExceptionDecision" {
				return nil, biz.ErrBadParam
			}
			ids, err := mutation.(interface {
				IDs(context.Context) ([]int, error)
			}).IDs(ctx)
			if err != nil {
				return nil, err
			}
			for _, id := range ids {
				unitID, err := quantityMutationUnitID(ctx, client, client.ProductionExceptionDecision.UpdateOneID(id).Mutation())
				if err != nil {
					return nil, err
				}
				if err := validateUnitQuantities(ctx, client, unitID, quantities...); err != nil {
					return nil, err
				}
			}
			return next.Mutate(ctx, mutation)
		}
		unitID, err := quantityMutationUnitID(ctx, client, mutation)
		if err != nil {
			return nil, err
		}
		if err := validateUnitQuantities(ctx, client, unitID, quantities...); err != nil {
			return nil, err
		}
		return next.Mutate(ctx, mutation)
	})
}

func mutationReferenceID(ctx context.Context, mutation ent.Mutation, field string) (int, error) {
	if mutation.FieldCleared(field) {
		return 0, nil
	}
	value, exists := mutation.Field(field)
	if !exists && mutation.Op().Is(ent.OpUpdateOne) {
		var err error
		value, err = mutation.OldField(ctx, field)
		if err != nil {
			return 0, err
		}
	}
	switch id := value.(type) {
	case int:
		return id, nil
	case *int:
		if id != nil {
			return *id, nil
		}
	}
	return 0, nil
}

func quantityMutationUnitID(ctx context.Context, client *ent.Client, mutation ent.Mutation) (int, error) {
	switch mutation.Type() {
	case "PurchaseRejectionDisposition":
		id, err := mutationReferenceID(ctx, mutation, "purchase_receipt_item_id")
		if err != nil {
			return 0, err
		}
		row, err := client.PurchaseReceiptItem.Get(ctx, id)
		if err != nil {
			return 0, err
		}
		return row.UnitID, nil
	case "OutsourcingReturnDisposition":
		id, err := mutationReferenceID(ctx, mutation, "outsourcing_return_fact_id")
		if err != nil {
			return 0, err
		}
		row, err := client.OutsourcingFact.Get(ctx, id)
		if err != nil {
			return 0, err
		}
		return row.UnitID, nil
	case "ProductionWIPBatch", "ProductionExceptionDecision", "ProductionOrderOperation":
		if mutation.Type() == "ProductionExceptionDecision" {
			id, err := mutationReferenceID(ctx, mutation, "production_material_requirement_id")
			if err != nil {
				return 0, err
			}
			if id > 0 {
				row, err := client.ProductionOrderMaterialRequirement.Get(ctx, id)
				if err != nil {
					return 0, err
				}
				return row.UnitID, nil
			}
		}
		id, err := mutationReferenceID(ctx, mutation, "production_order_item_id")
		if err != nil {
			return 0, err
		}
		row, err := client.ProductionOrderItem.Get(ctx, id)
		if err != nil {
			return 0, err
		}
		return row.UnitID, nil
	case "ProductionWIPEvent":
		id, err := mutationReferenceID(ctx, mutation, "production_wip_batch_id")
		if err != nil {
			return 0, err
		}
		batch, err := client.ProductionWIPBatch.Get(ctx, id)
		if err != nil {
			return 0, err
		}
		row, err := client.ProductionOrderItem.Get(ctx, batch.ProductionOrderItemID)
		if err != nil {
			return 0, err
		}
		return row.UnitID, nil
	default:
		return mutationReferenceID(ctx, mutation, "unit_id")
	}
}

func validateUnitQuantities(ctx context.Context, client *ent.Client, unitID int, quantities ...decimal.Decimal) error {
	if unitID <= 0 {
		return biz.ErrBadParam
	}
	unit, err := client.Unit.Get(ctx, unitID)
	if err != nil {
		return err
	}
	for _, quantity := range quantities {
		if err := biz.ValidateUnitQuantity(quantity, unit.Precision); err != nil {
			return err
		}
	}
	return nil
}
