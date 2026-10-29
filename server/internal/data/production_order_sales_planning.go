package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/salesorderitem"

	"github.com/shopspring/decimal"
)

// Open plans reserve their planned quantity. Closed plans retain only original
// posted output, net of exception disposal. Finished-goods rework keeps that
// original claim until its source receipt is reversed; replacement receipts
// do not consume the sales demand a second time.
func readProductionOrderSalesPlanning(ctx context.Context, client *ent.Client, salesItemIDs []int, excludeOrderID int) (map[int]decimal.Decimal, error) {
	totals := make(map[int]decimal.Decimal, len(salesItemIDs))
	if len(salesItemIDs) == 0 {
		return totals, nil
	}
	query := client.ProductionOrderItem.Query().Where(
		productionorderitem.SalesOrderItemIDIn(salesItemIDs...),
		productionorderitem.HasProductionOrderWith(productionorder.StatusNEQ(biz.ProductionOrderStatusCancelled)),
	)
	if excludeOrderID > 0 {
		query = query.Where(productionorderitem.ProductionOrderIDNEQ(excludeOrderID))
	}
	rows, err := query.WithProductionOrder().All(ctx)
	if err != nil {
		return nil, err
	}
	closedIDs := make([]int, 0)
	for _, row := range rows {
		if row.Edges.ProductionOrder.Status == biz.ProductionOrderStatusClosed {
			closedIDs = append(closedIDs, row.ID)
		}
	}
	closed, err := closedProductionSalesQuantities(ctx, client, closedIDs)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		if row.SalesOrderItemID != nil {
			id := *row.SalesOrderItemID
			quantity := row.PlannedQuantity
			if row.Edges.ProductionOrder.Status == biz.ProductionOrderStatusClosed {
				quantity = closed[row.ID]
				if quantity.IsNegative() || quantity.GreaterThan(row.PlannedQuantity) {
					return nil, biz.ErrProductionOrderQuantityExceeded
				}
			}
			totals[id] = totals[id].Add(quantity)
		}
	}
	return totals, nil
}

func closedProductionSalesQuantities(ctx context.Context, client *ent.Client, itemIDs []int) (map[int]decimal.Decimal, error) {
	totals := make(map[int]decimal.Decimal, len(itemIDs))
	if len(itemIDs) == 0 {
		return totals, nil
	}
	facts, err := client.ProductionFact.Query().Where(
		productionfact.SourceType(biz.ProductionOrderSourceType), productionfact.SourceLineIDIn(itemIDs...),
		productionfact.FactType(biz.ProductionFactFinishedGoodsReceipt), productionfact.Status(biz.OperationalFactStatusPosted),
	).WithProductionWipBatch().All(ctx)
	if err != nil {
		return nil, err
	}
	receiptItems := make(map[int]int, len(facts))
	ids := make([]int, 0, len(facts))
	for _, fact := range facts {
		batch := fact.Edges.ProductionWipBatch
		if batch == nil || fact.SourceID == nil || *fact.SourceID != batch.ProductionOrderID || *fact.SourceLineID != batch.ProductionOrderItemID {
			return nil, biz.ErrProductionOrderFactSourceInvalid
		}
		if batch.OriginReworkFactID != nil {
			continue
		}
		receiptItems[fact.ID] = *fact.SourceLineID
		ids = append(ids, fact.ID)
		totals[*fact.SourceLineID] = totals[*fact.SourceLineID].Add(fact.Quantity)
	}
	if len(ids) == 0 {
		return totals, nil
	}
	disposals, err := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ProductionExceptionSourceType), inventorytxn.SourceLineIDIn(ids...)).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, txn := range disposals {
		itemID := receiptItems[*txn.SourceLineID]
		totals[itemID] = totals[itemID].Add(txn.Quantity.Mul(decimal.NewFromInt(int64(txn.Direction))))
	}
	return totals, nil
}

// Call only after the sales sources are locked and references validated in the
// command transaction. Editing replaces this order's old plan, not adds to it.
func validateProductionOrderSalesPlanning(ctx context.Context, client *ent.Client, orderID int, items []biz.ProductionOrderDraftItem) error {
	requested := make(map[int]decimal.Decimal)
	for _, item := range items {
		if item.SalesOrderItemID != nil {
			id := *item.SalesOrderItemID
			requested[id] = requested[id].Add(item.PlannedQuantity)
		}
	}
	ids := make([]int, 0, len(requested))
	for id := range requested {
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return nil
	}
	planned, err := readProductionOrderSalesPlanning(ctx, client, ids, orderID)
	if err != nil {
		return err
	}
	lines, err := client.SalesOrderItem.Query().Where(salesorderitem.IDIn(ids...)).All(ctx)
	if err != nil {
		return err
	}
	if len(lines) != len(ids) {
		return biz.ErrProductionOrderReferenceInvalid
	}
	for _, line := range lines {
		productionQuantity := biz.SalesOrderProductionQuantity(line.OrderedQuantity, line.PreShipmentSampleQuantity)
		if planned[line.ID].Add(requested[line.ID]).GreaterThan(productionQuantity) {
			return biz.ErrProductionOrderPlannedQuantityExceeded
		}
	}
	return nil
}
