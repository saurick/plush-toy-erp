package data

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"sort"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financeallocation"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/financepayment"
	"server/internal/data/model/ent/purchasereceiptitem"

	"github.com/shopspring/decimal"
)

// All mutations that spend or restore a payment balance serialize on its row.
// Refund mutations lock the original payment before the refund itself.
func lockFinancePaymentBalance(ctx context.Context, tx *inventoryDBTx, id int) (*ent.FinancePayment, error) {
	row, err := tx.client.FinancePayment.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if row.RefundOfPaymentID != nil {
		if err := lockOperationalFactRow(ctx, tx, "finance_payments", *row.RefundOfPaymentID, biz.ErrBadParam); err != nil {
			return nil, err
		}
	}
	if err := lockOperationalFactRow(ctx, tx, "finance_payments", id, biz.ErrBadParam); err != nil {
		return nil, err
	}
	return tx.client.FinancePayment.Get(ctx, id)
}

func financePaymentOrder(ctx context.Context, client *ent.Client, sourceType string, sourceID int) (partyID int, currency, number, status string, err error) {
	switch sourceType {
	case "sales_order":
		var order *ent.SalesOrder
		order, err = client.SalesOrder.Get(ctx, sourceID)
		if err == nil {
			partyID, currency, number, status = order.CustomerID, order.Currency, order.OrderNo, order.LifecycleStatus
		}
	case "purchase_order":
		var order *ent.PurchaseOrder
		order, err = client.PurchaseOrder.Get(ctx, sourceID)
		if err == nil {
			partyID, currency, number, status = order.SupplierID, order.Currency, order.PurchaseOrderNo, order.LifecycleStatus
		}
	case "outsourcing_order":
		var order *ent.OutsourcingOrder
		order, err = client.OutsourcingOrder.Get(ctx, sourceID)
		if err == nil {
			partyID, currency, number, status = order.SupplierID, order.Currency, order.OutsourcingOrderNo, order.LifecycleStatus
		}
	default:
		err = biz.ErrFinanceFactSourceInvalid
	}
	return
}

func validateFinanceCashSource(ctx context.Context, tx *inventoryDBTx, kind, sourceType string, sourceID, refundID, partyID int, partyType, currency, direction string, amount decimal.Decimal) error {
	switch kind {
	case biz.FinancePaymentKindAdvance:
		tables := map[string]string{"sales_order": "sales_orders", "purchase_order": "purchase_orders", "outsourcing_order": "outsourcing_orders"}
		if tables[sourceType] == "" {
			return biz.ErrFinanceFactSourceInvalid
		}
		if err := lockOperationalFactRow(ctx, tx, tables[sourceType], sourceID, biz.ErrFinanceFactSourceInvalid); err != nil {
			return err
		}
		actualParty, actualCurrency, _, status, err := financePaymentOrder(ctx, tx.client, sourceType, sourceID)
		if err != nil {
			return err
		}
		expected := map[string]string{"sales_order": biz.SalesOrderStatusActive, "purchase_order": biz.PurchaseOrderStatusApproved, "outsourcing_order": biz.OutsourcingOrderStatusConfirmed}[sourceType]
		if actualParty != partyID || actualCurrency != currency || status != expected {
			return biz.ErrFinanceFactSourceInvalid
		}
	case biz.FinancePaymentKindRefund:
		if err := lockOperationalFactRow(ctx, tx, "finance_payments", refundID, biz.ErrBadParam); err != nil {
			return err
		}
		original, err := tx.client.FinancePayment.Get(ctx, refundID)
		if err != nil {
			return err
		}
		if original.Kind == biz.FinancePaymentKindRefund || original.Status != biz.FinancePaymentStatusPosted ||
			original.CounterpartyID != partyID || original.CounterpartyType != partyType || original.Currency != currency || original.Direction == direction {
			return biz.ErrBadParam
		}
		balance, err := financePaymentWithAllocations(ctx, tx.client, original)
		if err != nil {
			return err
		}
		if amount.GreaterThan(balance.AvailableAmount) {
			return biz.ErrBadParam
		}
	}
	return nil
}

func validateFinancePaymentCashSource(ctx context.Context, tx *inventoryDBTx, row *ent.FinancePayment) error {
	sourceType, sourceID, refundID := "", 0, 0
	if row.SourceType != nil {
		sourceType = *row.SourceType
	}
	if row.SourceID != nil {
		sourceID = *row.SourceID
	}
	if row.RefundOfPaymentID != nil {
		refundID = *row.RefundOfPaymentID
	}
	return validateFinanceCashSource(ctx, tx, row.Kind, sourceType, sourceID, refundID, row.CounterpartyID, row.CounterpartyType, row.Currency, row.Direction, row.Amount)
}

// Order matching is derived from the original business source, never a UI hint.
func financeFactOrderRef(ctx context.Context, client *ent.Client, fact *ent.FinanceFact) (string, int, error) {
	if fact.SourceType == nil || fact.SourceID == nil {
		return "", 0, biz.ErrFinanceFactSourceInvalid
	}
	switch *fact.SourceType {
	case biz.ShipmentSourceType:
		shipment, err := client.Shipment.Get(ctx, *fact.SourceID)
		if err != nil {
			return "", 0, err
		}
		order, err := shipmentFinanceSourceOrder(ctx, client, shipment)
		if err != nil {
			return "", 0, err
		}
		return "sales_order", order.ID, nil
	case biz.PurchaseReceiptSourceType:
		items, err := client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(*fact.SourceID)).All(ctx)
		if err != nil {
			return "", 0, err
		}
		id := 0
		for _, item := range items {
			if item.PurchaseOrderItemID == nil {
				return "", 0, biz.ErrFinanceFactSourceInvalid
			}
			line, err := client.PurchaseOrderItem.Get(ctx, *item.PurchaseOrderItemID)
			if err != nil {
				return "", 0, err
			}
			if id != 0 && id != line.PurchaseOrderID {
				return "", 0, biz.ErrFinanceFactSourceInvalid
			}
			id = line.PurchaseOrderID
		}
		if id > 0 {
			return "purchase_order", id, nil
		}
	case biz.OutsourcingFactSourceType:
		item, err := client.OutsourcingFact.Get(ctx, *fact.SourceID)
		if err != nil {
			return "", 0, err
		}
		if item.SourceType != nil && *item.SourceType == biz.OutsourcingOrderSourceType && item.SourceID != nil {
			return "outsourcing_order", *item.SourceID, nil
		}
	}
	return "", 0, biz.ErrFinanceFactSourceInvalid
}

func validatePaymentOrderAllocation(ctx context.Context, client *ent.Client, payment *ent.FinancePayment, fact *ent.FinanceFact) error {
	if payment.Kind != biz.FinancePaymentKindAdvance {
		return nil
	}
	typ, id, err := financeFactOrderRef(ctx, client, fact)
	if err != nil {
		return err
	}
	if payment.SourceType == nil || payment.SourceID == nil || typ != *payment.SourceType || id != *payment.SourceID {
		return biz.ErrFinanceFactSourceInvalid
	}
	return nil
}

func (r *operationalFactRepo) AllocateFinancePayment(ctx context.Context, in *biz.FinancePaymentAllocate, actorID int) (*biz.FinancePayment, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	payment, err := lockFinancePaymentBalance(ctx, tx, in.ID)
	if err != nil {
		return nil, err
	}
	prefix := fmt.Sprintf("FIN_ALLOC:%d:%x:", payment.ID, sha256.Sum256([]byte(fmt.Sprintf("%d:%s", actorID, in.IdempotencyKey))))
	previous, err := tx.client.FinanceAllocation.Query().Where(financeallocation.IdempotencyKeyHasPrefix(prefix)).All(ctx)
	if err != nil {
		return nil, err
	}
	if len(previous) > 0 {
		if len(previous) != len(in.Allocations) {
			return nil, biz.ErrIdempotencyConflict
		}
		for _, a := range previous {
			matched := false
			for _, expected := range in.Allocations {
				if a.FinanceFactID == expected.FinanceFactID && a.Amount.Equal(expected.Amount) {
					matched = true
				}
			}
			if !matched {
				return nil, biz.ErrIdempotencyConflict
			}
		}
		return financePaymentWithAllocations(ctx, tx.client, payment)
	}
	if payment.Version != in.ExpectedVersion {
		return nil, biz.ErrIdempotencyConflict
	}
	if payment.Status != biz.FinancePaymentStatusPosted || payment.Kind == biz.FinancePaymentKindRefund {
		return nil, biz.ErrBadParam
	}
	balance, err := financePaymentWithAllocations(ctx, tx.client, payment)
	if err != nil {
		return nil, err
	}
	total := decimal.Zero
	for _, a := range in.Allocations {
		total = total.Add(a.Amount)
	}
	if !total.IsPositive() || total.GreaterThan(balance.AvailableAmount) {
		return nil, biz.ErrBadParam
	}
	sort.Slice(in.Allocations, func(i, j int) bool { return in.Allocations[i].FinanceFactID < in.Allocations[j].FinanceFactID })
	for _, a := range in.Allocations {
		if err := lockOperationalFactRow(ctx, tx, "finance_facts", a.FinanceFactID, biz.ErrBadParam); err != nil {
			return nil, err
		}
		fact, err := tx.client.FinanceFact.Get(ctx, a.FinanceFactID)
		if err != nil {
			return nil, err
		}
		if err := validateFinancePaymentTarget(payment, fact); err != nil {
			return nil, err
		}
		if err := validatePaymentOrderAllocation(ctx, tx.client, payment, fact); err != nil {
			return nil, err
		}
		outstanding, err := financeFactOutstanding(ctx, tx.client, fact.ID, fact.Amount)
		if err != nil {
			return nil, err
		}
		if a.Amount.GreaterThan(outstanding) {
			return nil, biz.ErrBadParam
		}
		if _, err := tx.client.FinanceAllocation.Create().SetPaymentID(payment.ID).SetFinanceFactID(fact.ID).SetAmount(a.Amount).SetCurrency(payment.Currency).SetIdempotencyKey(fmt.Sprintf("%s%d", prefix, fact.ID)).SetCreatedBy(actorID).Save(ctx); err != nil {
			return nil, err
		}
		if err := setFinanceFactSettlement(ctx, tx, fact.ID, outstanding.Equal(a.Amount), actorID); err != nil {
			return nil, err
		}
	}
	_, err = tx.client.FinancePayment.Update().Where(financepayment.ID(payment.ID)).AddVersion(1).SetUpdatedAt(time.Now()).Save(ctx)
	if err != nil {
		return nil, err
	}
	updated, err := tx.client.FinancePayment.Get(ctx, payment.ID)
	if err != nil {
		return nil, err
	}
	out, err := financePaymentWithAllocations(ctx, tx.client, updated)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return out, nil
}

func reversePaymentAllocation(ctx context.Context, tx *inventoryDBTx, a *ent.FinanceAllocation, actorID int, reason string) error {
	if err := lockOperationalFactRow(ctx, tx, "finance_facts", a.FinanceFactID, biz.ErrBadParam); err != nil {
		return err
	}
	fact, err := tx.client.FinanceFact.Get(ctx, a.FinanceFactID)
	if err != nil {
		return err
	}
	_, err = tx.client.FinanceAllocation.Create().SetPaymentID(a.PaymentID).SetFinanceFactID(a.FinanceFactID).SetAmount(a.Amount).SetCurrency(a.Currency).SetStatus(biz.FinanceAllocationStatusReversed).SetReversalOfAllocationID(a.ID).SetReason(reason).SetIdempotencyKey(fmt.Sprintf("FINANCE_PAYMENT:%d:%d:REVERSE", a.PaymentID, a.ID)).SetCreatedBy(actorID).Save(ctx)
	if err != nil {
		return err
	}
	remaining, err := financeFactOutstanding(ctx, tx.client, fact.ID, fact.Amount)
	if err != nil {
		return err
	}
	return setFinanceFactSettlement(ctx, tx, fact.ID, remaining.IsZero(), actorID)
}

func (r *operationalFactRepo) ReverseFinanceAllocation(ctx context.Context, in *biz.FinanceAllocationReverse, actorID int) (*biz.FinancePayment, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	payment, err := lockFinancePaymentBalance(ctx, tx, in.PaymentID)
	if err != nil {
		return nil, err
	}
	a, err := tx.client.FinanceAllocation.Get(ctx, in.AllocationID)
	if err != nil {
		return nil, err
	}
	if a.PaymentID != payment.ID || a.Status != biz.FinanceAllocationStatusPosted {
		return nil, biz.ErrBadParam
	}
	previous, err := tx.client.FinanceAllocation.Query().Where(financeallocation.ReversalOfAllocationID(a.ID)).Only(ctx)
	if err == nil {
		if previous.CreatedBy != actorID || previous.Reason == nil || *previous.Reason != in.Reason {
			return nil, biz.ErrIdempotencyConflict
		}
		return financePaymentWithAllocations(ctx, tx.client, payment)
	}
	if !ent.IsNotFound(err) {
		return nil, err
	}
	if payment.Version != in.ExpectedVersion {
		return nil, biz.ErrIdempotencyConflict
	}
	if payment.Status != biz.FinancePaymentStatusPosted {
		return nil, biz.ErrBadParam
	}
	if err := reversePaymentAllocation(ctx, tx, a, actorID, in.Reason); err != nil {
		return nil, err
	}
	_, err = tx.client.FinancePayment.Update().Where(financepayment.ID(payment.ID)).AddVersion(1).Save(ctx)
	if err != nil {
		return nil, err
	}
	updated, err := tx.client.FinancePayment.Get(ctx, payment.ID)
	if err != nil {
		return nil, err
	}
	out, err := financePaymentWithAllocations(ctx, tx.client, updated)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return out, nil
}

func populateFinancePaymentBalances(ctx context.Context, client *ent.Client, payments []*biz.FinancePayment, ids []int) error {
	refunds, err := client.FinancePayment.Query().Where(financepayment.RefundOfPaymentIDIn(ids...), financepayment.Status(biz.FinancePaymentStatusPosted)).All(ctx)
	if err != nil {
		return err
	}
	refunded := map[int]decimal.Decimal{}
	for _, refund := range refunds {
		refunded[*refund.RefundOfPaymentID] = refunded[*refund.RefundOfPaymentID].Add(refund.Amount)
	}
	sourceNames := map[string]string{}
	for _, payment := range payments {
		payment.RefundedAmount = refunded[payment.ID]
		for _, a := range payment.Allocations {
			if a.Status == biz.FinanceAllocationStatusReversed {
				payment.AllocatedAmount = payment.AllocatedAmount.Sub(a.Amount)
			} else {
				payment.AllocatedAmount = payment.AllocatedAmount.Add(a.Amount)
			}
		}
		if payment.Status == biz.FinancePaymentStatusPosted && payment.Kind != biz.FinancePaymentKindRefund {
			payment.AvailableAmount = payment.Amount.Sub(payment.AllocatedAmount).Sub(payment.RefundedAmount)
		}
		if payment.SourceType != nil && payment.SourceID != nil {
			key := fmt.Sprintf("%s:%d", *payment.SourceType, *payment.SourceID)
			number, ok := sourceNames[key]
			if !ok {
				_, _, number, _, err = financePaymentOrder(ctx, client, *payment.SourceType, *payment.SourceID)
				if err != nil {
					return err
				}
				sourceNames[key] = number
			}
			payment.SourceNo = number
		}
		if payment.RefundOfPaymentID != nil {
			original, err := client.FinancePayment.Get(ctx, *payment.RefundOfPaymentID)
			if err != nil {
				return err
			}
			payment.RefundOfPaymentNo = original.PaymentNo
		}
	}
	return nil
}

func (r *operationalFactRepo) FinancePaymentAllocationCandidates(ctx context.Context, id int) ([]*biz.FinanceFact, error) {
	payment, err := r.data.postgres.FinancePayment.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if payment.Kind == biz.FinancePaymentKindRefund {
		return []*biz.FinanceFact{}, nil
	}
	factType := biz.FinanceFactPayable
	if payment.Direction == biz.FinancePaymentDirectionReceipt {
		factType = biz.FinanceFactReceivable
	}
	rows, err := r.data.postgres.FinanceFact.Query().Where(financefact.Status(biz.OperationalFactStatusPosted), financefact.FactType(factType), financefact.CounterpartyType(payment.CounterpartyType), financefact.CounterpartyID(payment.CounterpartyID), financefact.Currency(payment.Currency)).Order(ent.Asc(financefact.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	balances, err := financeFactOutstandingAmounts(ctx, r.data.postgres, rows)
	if err != nil {
		return nil, err
	}
	out := []*biz.FinanceFact{}
	for _, row := range rows {
		if !balances[row.ID].IsPositive() {
			continue
		}
		if payment.Kind == biz.FinancePaymentKindAdvance {
			typ, id, err := financeFactOrderRef(ctx, r.data.postgres, row)
			if errors.Is(err, biz.ErrFinanceFactSourceInvalid) {
				continue
			}
			if err != nil {
				return nil, err
			}
			if payment.SourceType == nil || payment.SourceID == nil || typ != *payment.SourceType || id != *payment.SourceID {
				continue
			}
		}
		item := entFinanceFactToBiz(row)
		item.OutstandingAmount = balances[row.ID]
		out = append(out, item)
	}
	return out, nil
}
