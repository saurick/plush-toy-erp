package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/salesorderitem"

	"github.com/shopspring/decimal"
)

// Production plans consume sales-line capacity until cancelled, including
// drafts and closed orders. Read exact decimals once for all requested lines.
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
	rows, err := query.Select(productionorderitem.FieldSalesOrderItemID, productionorderitem.FieldPlannedQuantity).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		if row.SalesOrderItemID != nil {
			id := *row.SalesOrderItemID
			totals[id] = totals[id].Add(row.PlannedQuantity)
		}
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
		if planned[line.ID].Add(requested[line.ID]).GreaterThan(line.OrderedQuantity) {
			return biz.ErrProductionOrderPlannedQuantityExceeded
		}
	}
	return nil
}
