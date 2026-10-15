package data

import (
	"context"

	"github.com/shopspring/decimal"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorderoperation"
	"server/internal/data/model/ent/productionwipbatch"
)

// Historical posted receipts keep their original packaging source. Count that
// evidence against the ancestor handwork capacity without rewriting the fact.
func productionReceiptReservationBatchIDs(ctx context.Context, client *ent.Client, batch *ent.ProductionWIPBatch) ([]int, error) {
	ids := []int{batch.ID}
	operation, err := client.ProductionOrderOperation.Get(ctx, batch.ProductionOrderOperationID)
	if err != nil || operation.OperationCode != biz.ProductionWIPOperationHandwork {
		return ids, err
	}
	rows, err := client.ProductionWIPBatch.Query().Where(productionwipbatch.ProductionOrderItemID(batch.ProductionOrderItemID), productionwipbatch.FinishedGoodsReceiptIDIsNil(), productionwipbatch.HasProductionOrderOperationWith(productionorderoperation.OperationCode(biz.ProductionWIPOperationPackaging))).All(ctx)
	if err != nil {
		return nil, err
	}
	ancestors := map[int]bool{batch.ID: true}
	for changed := true; changed; {
		changed = false
		for _, row := range rows {
			if row.SourceBatchID != nil && ancestors[*row.SourceBatchID] && !ancestors[row.ID] {
				ancestors[row.ID] = true
				ids = append(ids, row.ID)
				changed = true
			}
		}
	}
	return ids, nil
}

// The production order lock serializes receipt allocation with WIP changes.
// Packing must name the posted receipt: a batch alone cannot identify its lot
// and warehouse when the same handwork batch is received in multiple portions.
func validateProductionPackagingReceipt(ctx context.Context, client *ent.Client, source *ent.ProductionWIPBatch, target *ent.ProductionOrderOperation, receiptID int, quantity decimal.Decimal) error {
	if target.OperationCode != biz.ProductionWIPOperationPackaging {
		if receiptID != 0 {
			return biz.ErrProductionOrderFactSourceInvalid
		}
		return nil
	}
	if receiptID <= 0 {
		return biz.ErrProductionOrderFactSourceInvalid
	}
	receipt, err := client.ProductionFact.Get(ctx, receiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrProductionOrderFactSourceInvalid
		}
		return err
	}
	if receipt.Status != biz.OperationalFactStatusPosted || receipt.FactType != biz.ProductionFactFinishedGoodsReceipt || receipt.ProductionWipBatchID == nil || *receipt.ProductionWipBatchID != source.ID {
		return biz.ErrProductionOrderFactSourceInvalid
	}
	allocated, err := productionReceiptPackagingBatches(ctx, client, receiptID)
	if err != nil {
		return err
	}
	reworked, err := productionReceiptReworkedQuantity(ctx, client, receiptID)
	if err != nil {
		return err
	}
	if sumProductionWIPBatchQuantity(allocated).Add(reworked).Add(quantity).GreaterThan(receipt.Quantity) {
		return biz.ErrProductionWIPQuantityExceeded
	}
	return nil
}

func productionReceiptPackagingBatches(ctx context.Context, client *ent.Client, receiptID int) ([]*ent.ProductionWIPBatch, error) {
	return client.ProductionWIPBatch.Query().Where(
		productionwipbatch.FinishedGoodsReceiptID(receiptID),
		productionwipbatch.StatusNotIn(biz.ProductionWIPStatusCancelled, biz.ProductionWIPStatusSplit),
		productionwipbatch.HasProductionOrderOperationWith(productionorderoperation.OperationCode(biz.ProductionWIPOperationPackaging)),
	).All(ctx)
}

func productionReceiptReworkedQuantity(ctx context.Context, client *ent.Client, receiptID int) (decimal.Decimal, error) {
	rows, err := client.ProductionFact.Query().Where(productionfact.FactType(biz.ProductionFactRework), productionfact.SourceType(biz.ProductionFactSourceType), productionfact.SourceID(receiptID), productionfact.Status(biz.OperationalFactStatusPosted)).All(ctx)
	total := decimal.Zero
	for _, row := range rows {
		total = total.Add(row.Quantity)
	}
	if err != nil {
		return total, err
	}
	disposed, err := productionReceiptExceptionDisposedQuantity(ctx, client, receiptID)
	return total.Add(disposed), err
}

type finishedGoodsReadiness struct {
	PendingInspection decimal.Decimal
	PendingPackaging  decimal.Decimal
}

func (r finishedGoodsReadiness) blocked() decimal.Decimal {
	return r.PendingInspection.Add(r.PendingPackaging)
}

// Readiness is a projection of posted receipts and actual packing results.
// Completing a workflow task never adds stock or releases goods for shipment.
func productionFinishedGoodsReadiness(ctx context.Context, client *ent.Client, key biz.InventoryBalanceKey) (finishedGoodsReadiness, error) {
	if key.SubjectType != biz.InventorySubjectProduct {
		return finishedGoodsReadiness{}, nil
	}
	values, err := productionFinishedGoodsReadinessForKeys(ctx, client, []biz.InventoryBalanceKey{key})
	return values[inventoryProductGrain(key)], err
}
