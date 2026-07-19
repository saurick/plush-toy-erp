package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/customer"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/shipmentitem"
	"server/internal/data/model/ent/unit"

	"github.com/shopspring/decimal"
)

var _ biz.ShipmentSourceCandidateRepo = (*operationalFactRepo)(nil)

type shipmentSourceLineQuantity struct {
	shipped        decimal.Decimal
	sourceMismatch bool
}

func (r *operationalFactRepo) ListShipmentSourceCandidates(
	ctx context.Context,
	filter biz.ShipmentSourceCandidateFilter,
) ([]*biz.ShipmentSourceCandidate, int, error) {
	if r == nil || r.data == nil || r.data.postgres == nil ||
		filter.SalesOrderID < 0 || filter.Limit <= 0 || filter.Limit > 200 || filter.Offset < 0 {
		return nil, 0, biz.ErrBadParam
	}

	query := r.data.postgres.SalesOrderItem.Query().
		Where(salesorderitem.HasSalesOrderWith(salesorder.LifecycleStatus(biz.SalesOrderStatusActive)))
	if filter.SalesOrderID > 0 {
		query = query.Where(salesorderitem.SalesOrderID(filter.SalesOrderID))
	}
	if filter.Keyword != "" {
		keyword := filter.Keyword
		numericID := parsePositiveIntOrZero(keyword)
		query = query.Where(salesorderitem.Or(
			salesorderitem.ProductCodeSnapshotContainsFold(keyword),
			salesorderitem.ProductNameSnapshotContainsFold(keyword),
			salesorderitem.ColorSnapshotContainsFold(keyword),
			salesorderitem.HasSalesOrderWith(salesorder.Or(
				salesorder.OrderNoContainsFold(keyword),
				salesorder.CustomerOrderNoContainsFold(keyword),
				salesorder.HasCustomerWith(customer.Or(
					customer.CodeContainsFold(keyword),
					customer.NameContainsFold(keyword),
					customer.ShortNameContainsFold(keyword),
				)),
			)),
			salesorderitem.HasProductWith(product.Or(
				product.CodeContainsFold(keyword),
				product.NameContainsFold(keyword),
				product.StyleNoContainsFold(keyword),
				product.CustomerStyleNoContainsFold(keyword),
			)),
			salesorderitem.HasProductSkuWith(productsku.Or(
				productsku.SkuCodeContainsFold(keyword),
				productsku.SkuNameContainsFold(keyword),
				productsku.CustomerSkuContainsFold(keyword),
				productsku.ColorContainsFold(keyword),
			)),
			salesorderitem.HasUnitWith(unit.Or(
				unit.CodeContainsFold(keyword),
				unit.NameContainsFold(keyword),
			)),
			salesorderitem.IDEQ(numericID),
			salesorderitem.SalesOrderIDEQ(numericID),
			salesorderitem.LineNoEQ(numericID),
		))
	}

	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.
		WithSalesOrder(func(orderQuery *ent.SalesOrderQuery) {
			orderQuery.WithCustomer()
		}).
		WithProduct().
		WithProductSku().
		WithUnit().
		Order(
			ent.Desc(salesorderitem.FieldSalesOrderID),
			ent.Asc(salesorderitem.FieldLineNo),
			ent.Asc(salesorderitem.FieldID),
		).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}

	sourceOrderByLine := make(map[int]int, len(rows))
	for _, row := range rows {
		sourceOrderByLine[row.ID] = row.SalesOrderID
	}
	quantities, err := loadShipmentSourceLineQuantities(ctx, r.data.postgres, sourceOrderByLine)
	if err != nil {
		return nil, 0, err
	}

	out := make([]*biz.ShipmentSourceCandidate, 0, len(rows))
	for _, row := range rows {
		candidate, err := shipmentSourceCandidateFromEnt(row, quantities[row.ID])
		if err != nil {
			return nil, 0, err
		}
		out = append(out, candidate)
	}
	return out, total, nil
}

func shipmentSourceCandidateFromEnt(
	row *ent.SalesOrderItem,
	quantity shipmentSourceLineQuantity,
) (*biz.ShipmentSourceCandidate, error) {
	if row == nil {
		return nil, biz.ErrBadParam
	}
	order, err := row.Edges.SalesOrderOrErr()
	if err != nil {
		return nil, err
	}
	customerRow, err := order.Edges.CustomerOrErr()
	if err != nil {
		return nil, err
	}
	unitRow, err := row.Edges.UnitOrErr()
	if err != nil {
		return nil, err
	}
	productRow, err := row.Edges.ProductOrErr()
	if err != nil {
		return nil, err
	}

	remaining := row.OrderedQuantity.Sub(quantity.shipped)
	if remaining.IsNegative() {
		remaining = decimal.Zero
	}
	disabledReason := ""
	switch {
	case row.LineStatus != biz.SalesOrderItemStatusOpen:
		disabledReason = biz.ShipmentSourceCandidateDisabledLineNotOpen
	case quantity.sourceMismatch:
		disabledReason = biz.ShipmentSourceCandidateDisabledSourceMismatch
	case quantity.shipped.GreaterThan(row.OrderedQuantity):
		disabledReason = biz.ShipmentSourceCandidateDisabledShippedQuantityExceeded
	case !remaining.GreaterThan(decimal.Zero):
		disabledReason = biz.ShipmentSourceCandidateDisabledFullyShipped
	}
	customerSnapshot := order.CustomerSnapshot
	if customerSnapshot == nil {
		customerSnapshot = map[string]any{}
	}

	candidate := &biz.ShipmentSourceCandidate{
		SalesOrderID:        order.ID,
		OrderNo:             order.OrderNo,
		OrderStatus:         order.LifecycleStatus,
		OrderVersion:        order.Version,
		CustomerID:          order.CustomerID,
		CustomerSnapshot:    customerSnapshot,
		CustomerName:        customerRow.Name,
		SalesOrderItemID:    row.ID,
		LineNo:              row.LineNo,
		LineStatus:          row.LineStatus,
		ProductID:           row.ProductID,
		ProductSkuID:        row.ProductSkuID,
		ProductCode:         productRow.Code,
		ProductName:         productRow.Name,
		ProductCodeSnapshot: row.ProductCodeSnapshot,
		ProductNameSnapshot: row.ProductNameSnapshot,
		ColorSnapshot:       row.ColorSnapshot,
		UnitID:              row.UnitID,
		UnitCode:            unitRow.Code,
		UnitName:            unitRow.Name,
		OrderedQuantity:     row.OrderedQuantity,
		ShippedQuantity:     quantity.shipped,
		RemainingQuantity:   remaining,
		Selectable:          disabledReason == "",
		DisabledReason:      disabledReason,
	}
	if row.ProductSkuID != nil {
		skuRow, edgeErr := row.Edges.ProductSkuOrErr()
		if edgeErr != nil {
			return nil, edgeErr
		}
		skuCode := skuRow.SkuCode
		candidate.SKUCode = &skuCode
		candidate.SKUName = skuRow.SkuName
	}
	return candidate, nil
}

// loadShipmentSourceLineQuantities is shared by the candidate projection and
// the authoritative SHIPPED transition. It counts only SHIPPED facts and marks
// a persisted header/line source mismatch so callers fail closed.
func loadShipmentSourceLineQuantities(
	ctx context.Context,
	client *ent.Client,
	sourceOrderByLine map[int]int,
) (map[int]shipmentSourceLineQuantity, error) {
	result := make(map[int]shipmentSourceLineQuantity, len(sourceOrderByLine))
	if len(sourceOrderByLine) == 0 {
		return result, nil
	}
	lineIDs := make([]int, 0, len(sourceOrderByLine))
	lineIDsByOrder := make(map[int][]int)
	orderIDSet := make(map[int]struct{})
	for lineID := range sourceOrderByLine {
		lineIDs = append(lineIDs, lineID)
		orderID := sourceOrderByLine[lineID]
		lineIDsByOrder[orderID] = append(lineIDsByOrder[orderID], lineID)
		orderIDSet[orderID] = struct{}{}
	}
	orderIDs := make([]int, 0, len(orderIDSet))
	for orderID := range orderIDSet {
		orderIDs = append(orderIDs, orderID)
	}
	rows, err := client.ShipmentItem.Query().
		Where(
			shipmentitem.HasShipmentWith(shipment.Status(biz.ShipmentStatusShipped)),
			shipmentitem.Or(
				shipmentitem.SalesOrderItemIDIn(lineIDs...),
				shipmentitem.HasShipmentWith(shipment.SalesOrderIDIn(orderIDs...)),
			),
		).
		WithShipment().
		WithSalesOrderItem().
		All(ctx)
	if err != nil {
		return nil, err
	}
	markOrderMismatch := func(orderID int) {
		for _, lineID := range lineIDsByOrder[orderID] {
			state := result[lineID]
			state.sourceMismatch = true
			result[lineID] = state
		}
	}
	for _, row := range rows {
		parent, edgeErr := row.Edges.ShipmentOrErr()
		if edgeErr != nil {
			return nil, edgeErr
		}
		parentOrderID := 0
		if parent.SalesOrderID != nil {
			parentOrderID = *parent.SalesOrderID
		}
		if row.SalesOrderItemID == nil {
			markOrderMismatch(parentOrderID)
			continue
		}
		lineID := *row.SalesOrderItemID
		sourceItem, edgeErr := row.Edges.SalesOrderItemOrErr()
		if edgeErr != nil {
			return nil, edgeErr
		}
		expectedOrderID, tracked := sourceOrderByLine[lineID]
		if tracked {
			state := result[lineID]
			state.shipped = state.shipped.Add(row.Quantity)
			if parentOrderID != expectedOrderID || sourceItem.SalesOrderID != expectedOrderID {
				state.sourceMismatch = true
			}
			result[lineID] = state
		}
		if parentOrderID == 0 || sourceItem.SalesOrderID != parentOrderID {
			markOrderMismatch(parentOrderID)
			state := result[lineID]
			state.sourceMismatch = true
			result[lineID] = state
		}
	}
	return result, nil
}
