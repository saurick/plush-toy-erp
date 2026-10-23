package data

import (
	"context"
	"entgo.io/ent/dialect/sql"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorderoperation"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/stockreservation"
)

type productInventoryGrain [5]int

func inventoryProductGrain(key biz.InventoryBalanceKey) productInventoryGrain {
	g := productInventoryGrain{key.SubjectID, 0, key.WarehouseID, 0, key.UnitID}
	if key.ProductSkuID != nil {
		g[1] = *key.ProductSkuID
	}
	if key.LotID != nil {
		g[3] = *key.LotID
	}
	return g
}

func productInventoryGrainFilter(s *sql.Selector, subjectColumn string, keys []biz.InventoryBalanceKey) {
	matches := []*sql.Predicate{}
	for _, key := range keys {
		if key.SubjectType != biz.InventorySubjectProduct {
			continue
		}
		parts := []*sql.Predicate{sql.EQ(s.C(subjectColumn), key.SubjectID), sql.EQ(s.C("warehouse_id"), key.WarehouseID), sql.EQ(s.C("unit_id"), key.UnitID)}
		for _, column := range []struct {
			name string
			id   *int
		}{{"product_sku_id", key.ProductSkuID}, {"lot_id", key.LotID}} {
			if column.id == nil {
				parts = append(parts, sql.IsNull(s.C(column.name)))
			} else {
				parts = append(parts, sql.EQ(s.C(column.name), *column.id))
			}
		}
		matches = append(matches, sql.And(parts...))
	}
	if len(matches) == 0 {
		s.Where(sql.False())
	} else {
		s.Where(sql.Or(matches...))
	}
}

func activeReservedQuantitiesForInventoryKeys(ctx context.Context, client *ent.Client, keys []biz.InventoryBalanceKey) (map[productInventoryGrain]decimal.Decimal, error) {
	result := map[productInventoryGrain]decimal.Decimal{}
	rows, err := client.StockReservation.Query().Where(stockreservation.Status(biz.StockReservationStatusActive), func(s *sql.Selector) { productInventoryGrainFilter(s, "product_id", keys) }).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		key := inventoryProductGrain(biz.InventoryBalanceKey{SubjectID: row.ProductID, ProductSkuID: row.ProductSkuID, WarehouseID: row.WarehouseID, LotID: row.LotID, UnitID: row.UnitID})
		result[key] = result[key].Add(row.Quantity)
	}
	return result, nil
}

// Fetch each relation once for the page. The same exact inventory grain and
// posted-fact rules are used by both list projections and shipment checks.
func productionFinishedGoodsReadinessForKeys(ctx context.Context, client *ent.Client, keys []biz.InventoryBalanceKey) (map[productInventoryGrain]finishedGoodsReadiness, error) {
	result := map[productInventoryGrain]finishedGoodsReadiness{}
	receipts, err := client.ProductionFact.Query().Where(productionfact.FactType(biz.ProductionFactFinishedGoodsReceipt), productionfact.Status(biz.OperationalFactStatusPosted), productionfact.ProductionWipBatchIDNotNil(), func(s *sql.Selector) { productInventoryGrainFilter(s, "subject_id", keys) }).WithProductionWipBatch(func(q *ent.ProductionWIPBatchQuery) { q.WithProductionOrderOperation() }).All(ctx)
	if err != nil || len(receipts) == 0 {
		return result, err
	}
	ids := make([]int, 0, len(receipts))
	for _, receipt := range receipts {
		ids = append(ids, receipt.ID)
	}
	packaging, err := client.ProductionWIPBatch.Query().Where(productionwipbatch.FinishedGoodsReceiptIDIn(ids...), productionwipbatch.Status(biz.ProductionWIPStatusAccepted), productionwipbatch.HasProductionOrderOperationWith(productionorderoperation.OperationCode(biz.ProductionWIPOperationPackaging))).All(ctx)
	if err != nil {
		return nil, err
	}
	packed := map[int]decimal.Decimal{}
	for _, batch := range packaging {
		packed[*batch.FinishedGoodsReceiptID] = packed[*batch.FinishedGoodsReceiptID].Add(batch.Quantity)
	}
	disposed, err := productionReceiptReworkedQuantities(ctx, client, ids)
	if err != nil {
		return nil, err
	}
	for _, receipt := range receipts {
		batch := receipt.Edges.ProductionWipBatch
		if batch == nil || batch.Edges.ProductionOrderOperation == nil {
			return nil, biz.ErrProductionOrderFactSourceInvalid
		}
		if batch.Edges.ProductionOrderOperation.OperationCode == biz.ProductionWIPOperationPackaging && batch.Status == biz.ProductionWIPStatusAccepted {
			continue
		}
		key := inventoryProductGrain(biz.InventoryBalanceKey{SubjectID: receipt.SubjectID, ProductSkuID: receipt.ProductSkuID, WarehouseID: receipt.WarehouseID, LotID: receipt.LotID, UnitID: receipt.UnitID})
		value := result[key]
		remaining := decimal.Max(decimal.Zero, receipt.Quantity.Sub(disposed[receipt.ID]))
		if batch.Status != biz.ProductionWIPStatusAccepted {
			value.PendingInspection = value.PendingInspection.Add(remaining)
		} else {
			value.PendingPackaging = value.PendingPackaging.Add(decimal.Max(decimal.Zero, remaining.Sub(packed[receipt.ID])))
		}
		result[key] = value
	}
	return result, nil
}
