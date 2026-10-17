package data

import (
	"context"
	"time"

	"server/internal/biz"
	"server/internal/core/value"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/sourceorderlifecycleevent"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/shopspring/decimal"
)

var _ biz.PurchaseOrderTermsRepo = (*purchaseOrderRepo)(nil)

func (r *purchaseOrderRepo) CompletePurchaseOrderTerms(ctx context.Context, in *biz.PurchaseOrderTermsCompletion) (*biz.PurchaseOrder, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { rollbackEntTx(ctx, tx, r.log) }()
	action := &biz.SourceOrderLifecycleAction{ID: in.ID, ExpectedVersion: in.ExpectedVersion, ActorID: in.ActorID,
		ActionKey: biz.PurchaseOrderActionCompleteTerms, IdempotencyKey: in.IdempotencyKey, IntentHash: in.IntentHash}
	query := tx.PurchaseOrder.Query().Where(purchaseorder.ID(in.ID))
	if r.data.sqlDialect == dialect.Postgres {
		query.Where(func(s *sql.Selector) { s.ForUpdate() })
	}
	order, err := query.Only(ctx)
	if ent.IsNotFound(err) {
		return nil, biz.ErrPurchaseOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	if replay, err := resolveSourceOrderLifecycleActionReplay(ctx, tx.Client(), "purchase_order", action); err != nil {
		return nil, err
	} else if replay {
		if err := tx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return entPurchaseOrderToBiz(order), nil
	}
	if order.Version != in.ExpectedVersion {
		return nil, biz.ErrPurchaseOrderConflict
	}
	if order.LifecycleStatus != biz.PurchaseOrderStatusApproved && order.LifecycleStatus != biz.PurchaseOrderStatusClosed {
		return nil, biz.ErrBadParam
	}
	if order.LifecycleStatus == biz.PurchaseOrderStatusClosed && (!samePurchaseTermsDate(order.ExpectedArrivalDate, in.ExpectedArrivalDate) || !samePurchaseTermsDate(order.SupplierConfirmedArrivalDate, in.SupplierConfirmedArrivalDate)) {
		return nil, biz.ErrBadParam
	}
	for _, date := range []*time.Time{in.ExpectedArrivalDate, in.SupplierConfirmedArrivalDate} {
		if date != nil && date.Before(order.PurchaseDate.UTC().Truncate(24*time.Hour)) {
			return nil, biz.ErrBadParam
		}
	}
	items, err := tx.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(order.ID), purchaseorderitem.LineStatusNEQ(biz.PurchaseOrderItemStatusCanceled)).Order(ent.Asc(purchaseorderitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	if len(items) != len(in.Items) {
		return nil, biz.ErrBadParam
	}
	if order.LifecycleStatus == biz.PurchaseOrderStatusClosed {
		missingPrice := false
		for _, item := range items {
			missingPrice = missingPrice || item.UnitPrice == nil
		}
		if !missingPrice {
			return nil, biz.ErrBadParam
		}
	}
	lines := make([]map[string]any, 0, len(items))
	for i, item := range items {
		input := in.Items[i]
		if input.ID != item.ID || input.UnitPrice == nil {
			return nil, biz.ErrBadParam
		}
		if input.ExpectedArrivalDate != nil && input.ExpectedArrivalDate.Before(order.PurchaseDate.UTC().Truncate(24*time.Hour)) {
			return nil, biz.ErrBadParam
		}
		if order.LifecycleStatus == biz.PurchaseOrderStatusClosed && !samePurchaseTermsDate(item.ExpectedArrivalDate, input.ExpectedArrivalDate) {
			return nil, biz.ErrBadParam
		}
		amount := item.PurchasedQuantity.Mul(*input.UnitPrice).Round(6)
		if err := value.ValidateOptionalNonNegativeMoney(&amount); err != nil {
			return nil, biz.ErrBadParam
		}
		if (item.UnitPrice != nil && !item.UnitPrice.Equal(*input.UnitPrice)) || (item.Amount != nil && !item.Amount.Equal(amount)) {
			return nil, biz.ErrPurchaseOrderPriceFrozen
		}
		update := tx.PurchaseOrderItem.UpdateOneID(item.ID).SetUnitPrice(*input.UnitPrice).SetAmount(amount)
		if input.ExpectedArrivalDate == nil {
			update.ClearExpectedArrivalDate()
		} else {
			update.SetExpectedArrivalDate(*input.ExpectedArrivalDate)
		}
		if _, err := update.Save(ctx); err != nil {
			return nil, err
		}
		lines = append(lines, map[string]any{"line_id": item.ID, "material_id": item.MaterialID, "unit_id": item.UnitID,
			"purchased_quantity": item.PurchasedQuantity.String(), "unit_price": input.UnitPrice.String(), "amount": amount.String(),
			"expected_arrival_date": input.ExpectedArrivalDate, "order_expected_arrival_date": in.ExpectedArrivalDate, "supplier_confirmed_arrival_date": in.SupplierConfirmedArrivalDate})
	}
	update := tx.PurchaseOrder.Update().Where(purchaseorder.ID(order.ID), purchaseorder.Version(in.ExpectedVersion)).AddVersion(1)
	if in.ExpectedArrivalDate == nil {
		update.ClearExpectedArrivalDate()
	} else {
		update.SetExpectedArrivalDate(*in.ExpectedArrivalDate)
	}
	if in.SupplierConfirmedArrivalDate == nil {
		update.ClearSupplierConfirmedArrivalDate()
	} else {
		update.SetSupplierConfirmedArrivalDate(*in.SupplierConfirmedArrivalDate)
	}
	affected, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrPurchaseOrderConflict
	}
	if err := createSourceOrderLifecycleActionReceipt(ctx, tx.Client(), "purchase_order", order.LifecycleStatus, order.LifecycleStatus, action, lines); err != nil {
		return nil, err
	}
	row, err := tx.PurchaseOrder.Get(ctx, order.ID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entPurchaseOrderToBiz(row), nil
}

func samePurchaseTermsDate(a, b *time.Time) bool {
	return (a == nil && b == nil) || (a != nil && b != nil && a.Equal(*b))
}

// Load explicit terms receipts once for the requested lines. Current order
// prices cannot fill missing receipt snapshots without this confirmation.
func purchaseReceiptConfirmedPrices(ctx context.Context, client *ent.Client, items []*ent.PurchaseReceiptItem) (map[int]decimal.Decimal, error) {
	sourceIDs := map[int]bool{}
	for _, item := range items {
		if item.UnitPrice == nil && item.Amount == nil && item.PurchaseOrderItemID != nil {
			sourceIDs[*item.PurchaseOrderItemID] = true
		}
	}
	prices := map[int]decimal.Decimal{}
	if len(sourceIDs) == 0 {
		return prices, nil
	}
	ids := make([]int, 0, len(sourceIDs))
	for id := range sourceIDs {
		ids = append(ids, id)
	}
	sources, err := client.PurchaseOrderItem.Query().Where(purchaseorderitem.IDIn(ids...)).All(ctx)
	if err != nil {
		return nil, err
	}
	byID := make(map[int]*ent.PurchaseOrderItem, len(sources))
	orderIDs := map[int]bool{}
	for _, source := range sources {
		byID[source.ID] = source
		orderIDs[source.PurchaseOrderID] = true
	}
	for _, item := range items {
		if item.UnitPrice != nil || item.Amount != nil || item.PurchaseOrderItemID == nil {
			continue
		}
		source := byID[*item.PurchaseOrderItemID]
		if source == nil || source.MaterialID != item.MaterialID || source.UnitID != item.UnitID {
			return nil, biz.ErrFinanceFactSourceInvalid
		}
	}
	ids = ids[:0]
	for id := range orderIDs {
		ids = append(ids, id)
	}
	events, err := client.SourceOrderLifecycleEvent.Query().Where(sourceorderlifecycleevent.SourceType("purchase_order"), sourceorderlifecycleevent.SourceIDIn(ids...), sourceorderlifecycleevent.ActionKey(biz.PurchaseOrderActionCompleteTerms)).Order(ent.Asc(sourceorderlifecycleevent.FieldSourceVersion)).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, event := range events {
		if event.ResultContract != sourceOrderLifecycleResultContract {
			return nil, biz.ErrFinanceFactSourceInvalid
		}
		lines, ok := event.MutationResult["lines"].([]any)
		if !ok {
			return nil, biz.ErrFinanceFactSourceInvalid
		}
		for _, raw := range lines {
			line, ok := raw.(map[string]any)
			if !ok {
				return nil, biz.ErrFinanceFactSourceInvalid
			}
			id, ok := line["line_id"].(float64)
			if !ok || id != float64(int(id)) {
				return nil, biz.ErrFinanceFactSourceInvalid
			}
			source := byID[int(id)]
			if source == nil {
				continue
			}
			if source.PurchaseOrderID != event.SourceID {
				return nil, biz.ErrFinanceFactSourceInvalid
			}
			if _, confirmed := prices[source.ID]; confirmed {
				continue
			}
			priceString, ok := line["unit_price"].(string)
			if !ok {
				return nil, biz.ErrFinanceFactSourceInvalid
			}
			price, err := decimal.NewFromString(priceString)
			if err != nil || value.ValidateOptionalNonNegativeMoney(&price) != nil {
				return nil, biz.ErrFinanceFactSourceAmountInvalid
			}
			prices[source.ID] = price
		}
	}
	return prices, nil
}

func confirmedPurchaseReceiptItemMoney(item *ent.PurchaseReceiptItem, prices map[int]decimal.Decimal) (decimal.Decimal, decimal.Decimal, error) {
	if item == nil || !item.Quantity.GreaterThan(decimal.Zero) {
		return decimal.Zero, decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
	}
	if item.UnitPrice != nil || item.Amount != nil {
		return purchaseReceiptItemMoney(item)
	}
	if item.PurchaseOrderItemID == nil {
		return decimal.Zero, decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
	}
	price, ok := prices[*item.PurchaseOrderItemID]
	if !ok {
		return decimal.Zero, decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
	}
	amount := item.Quantity.Mul(price).Round(6)
	if value.ValidateOptionalNonNegativeMoney(&amount) != nil {
		return decimal.Zero, decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
	}
	return amount, price, nil
}
