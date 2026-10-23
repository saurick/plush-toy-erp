package data

import (
	"context"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/salesorderitem"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/shipmentitem"
)

func frozenShipmentGoods(items []*ent.ShipmentItem, currency string) (decimal.Decimal, error) {
	total := decimal.Zero
	if len(items) == 0 {
		return total, biz.ErrShipmentSourceMismatch
	}
	for _, item := range items {
		if item.SalesOrderItemID == nil || item.AmountSnapshot == nil || !item.AmountSnapshot.IsPositive() || item.CurrencySnapshot != currency {
			return decimal.Zero, biz.ErrShipmentSourceMismatch
		}
		total = total.Add(*item.AmountSnapshot)
	}
	return total, nil
}

func shipmentCommercialTotal(parent *ent.Shipment, goods decimal.Decimal) (decimal.Decimal, error) {
	if parent == nil || parent.ReceivableAmountSnapshot == nil || parent.QuotedFreightAmountSnapshot == nil || parent.TaxAmountSnapshot == nil || parent.TaxModeSnapshot == nil {
		return decimal.Zero, biz.ErrFinanceFactShipmentAmountInvalid
	}
	freight, tax := *parent.QuotedFreightAmountSnapshot, *parent.TaxAmountSnapshot
	if freight.IsNegative() || tax.IsNegative() {
		return decimal.Zero, biz.ErrFinanceFactShipmentAmountInvalid
	}
	total := goods.Add(freight)
	switch *parent.TaxModeSnapshot {
	case biz.SalesOrderTaxModeExclusive:
		total = total.Add(tax)
	case biz.SalesOrderTaxModeInclusive:
	case biz.SalesOrderTaxModeNone:
		if !tax.IsZero() {
			return decimal.Zero, biz.ErrFinanceFactShipmentAmountInvalid
		}
	default:
		return decimal.Zero, biz.ErrFinanceFactShipmentAmountInvalid
	}
	if !total.IsPositive() || !total.Equal(*parent.ReceivableAmountSnapshot) {
		return decimal.Zero, biz.ErrFinanceFactShipmentAmountInvalid
	}
	return total, nil
}

// The source order is locked before this function. Shipment goods and commercial
// amounts freeze in the same transaction as stock posting and the shipped state.
func freezeShipmentCommercialSnapshot(ctx context.Context, tx *inventoryDBTx, parent *ent.Shipment, order *ent.SalesOrder) error {
	if order == nil {
		return biz.ErrShipmentSourceMismatch
	}
	lines, err := tx.client.SalesOrderItem.Query().Where(salesorderitem.SalesOrderID(order.ID), salesorderitem.LineStatusNEQ(biz.SalesOrderItemStatusCanceled)).All(ctx)
	if err != nil {
		return err
	}
	amounts := make([]*decimal.Decimal, 0, len(lines))
	for _, line := range lines {
		amounts = append(amounts, salesOrderItemFinanceAmount(line))
	}
	goods, tax, total, err := biz.CalculateSalesOrderAmounts(order.TaxMode, order.TaxRate, order.FreightTerms, order.QuotedFreightAmount, amounts)
	if err != nil || goods == nil || tax == nil || total == nil || !goods.IsPositive() {
		return biz.ErrShipmentSourceMismatch
	}
	// Recomputed input must agree with the frozen order header whenever recorded.
	for _, pair := range [][2]*decimal.Decimal{{order.GoodsAmount, goods}, {order.TaxAmount, tax}, {order.OrderTotal, total}} {
		if pair[0] != nil && !pair[0].Equal(*pair[1]) {
			return biz.ErrShipmentSourceMismatch
		}
	}
	currentItems, err := tx.client.ShipmentItem.Query().Where(shipmentitem.ShipmentID(parent.ID)).All(ctx)
	if err != nil {
		return err
	}
	currentGoods, err := frozenShipmentGoods(currentItems, order.Currency)
	if err != nil {
		return err
	}
	prior, err := tx.client.Shipment.Query().Where(shipment.SalesOrderID(order.ID), shipment.Status(biz.ShipmentStatusShipped), shipment.IDNEQ(parent.ID)).WithItems().All(ctx)
	if err != nil {
		return err
	}
	priorGoods, priorTax, priorFreight := decimal.Zero, decimal.Zero, decimal.Zero
	for _, batch := range prior {
		batchGoods, err := frozenShipmentGoods(batch.Edges.Items, order.Currency)
		if err != nil {
			return err
		}
		if _, err := shipmentCommercialTotal(batch, batchGoods); err != nil {
			return err
		}
		if *batch.TaxModeSnapshot != *order.TaxMode {
			return biz.ErrShipmentSourceMismatch
		}
		priorGoods = priorGoods.Add(batchGoods)
		priorTax = priorTax.Add(*batch.TaxAmountSnapshot)
		priorFreight = priorFreight.Add(*batch.QuotedFreightAmountSnapshot)
	}
	quoted := decimal.Zero
	if *order.FreightTerms == biz.SalesOrderFreightTermsExcluded {
		quoted = *order.QuotedFreightAmount
	}
	freightShare, err := biz.AllocateProportionalAmount(quoted, *goods, currentGoods, priorGoods, priorFreight)
	if err != nil {
		return err
	}
	taxShare, err := biz.AllocateProportionalAmount(*tax, *goods, currentGoods, priorGoods, priorTax)
	if err != nil {
		return err
	}
	payable := currentGoods.Add(freightShare)
	if *order.TaxMode == biz.SalesOrderTaxModeExclusive {
		payable = payable.Add(taxShare)
	}
	p := inventorySQLPlaceholders(tx.dialect, 5)
	_, err = tx.sqlTx.ExecContext(ctx, "UPDATE shipments SET receivable_amount_snapshot = "+p[0]+", quoted_freight_amount_snapshot = "+p[1]+", tax_amount_snapshot = "+p[2]+", tax_mode_snapshot = "+p[3]+" WHERE id = "+p[4], payable.String(), freightShare.String(), taxShare.String(), *order.TaxMode, parent.ID)
	return err
}
