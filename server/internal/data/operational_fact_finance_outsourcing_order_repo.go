package data

import (
	"context"
	"errors"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/productionwipoutsourcingallocation"

	"github.com/shopspring/decimal"
)

func (r *operationalFactRepo) CreatePayableFromOutsourcingOrder(ctx context.Context, in *biz.FinanceFactFromOutsourcingOrderCreate) (*biz.FinanceFact, error) {
	if in == nil || in.OutsourcingOrderID <= 0 {
		return nil, biz.ErrBadParam
	}
	ids, err := outsourcingOrderWIPDependencyBatchIDs(ctx, r.data.postgres, in.OutsourcingOrderID)
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, biz.ErrOutsourcingOrderFactSourceInvalid
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	// Assignment and lifecycle settlement use the same batch -> contract order.
	for _, id := range ids {
		if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", id, biz.ErrProductionWIPOutsourcingSourceDependency); err != nil {
			return nil, err
		}
	}
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_orders", in.OutsourcingOrderID, biz.ErrOutsourcingOrderNotFound); err != nil {
		return nil, err
	}
	if err := requireStableOutsourcingOrderWIPDependencySet(ctx, tx.client, in.OutsourcingOrderID, ids); err != nil {
		return nil, err
	}
	order, err := tx.client.OutsourcingOrder.Get(ctx, in.OutsourcingOrderID)
	if err != nil {
		return nil, err
	}
	if order.LifecycleStatus != biz.OutsourcingOrderStatusConfirmed && order.LifecycleStatus != biz.OutsourcingOrderStatusClosed {
		return nil, biz.ErrOutsourcingOrderFactInvalidState
	}
	items, err := tx.client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.OutsourcingOrderID(order.ID), outsourcingorderitem.LineStatusNEQ(biz.OutsourcingOrderItemStatusCanceled)).All(ctx)
	if err != nil {
		return nil, err
	}
	if err := biz.ValidateOutsourcingContractPrices(entOutsourcingOrderItemsToBiz(items)); err != nil {
		return nil, biz.ErrFinanceFactSourceAmountInvalid
	}
	if err := validateOutsourcingOrderFullySettled(ctx, tx.client, order.ID); err != nil {
		if errors.Is(err, biz.ErrSourceOrderNormalCloseIncomplete) {
			return nil, biz.ErrOutsourcingStageNotAccepted
		}
		return nil, err
	}
	itemIDs := make([]int, 0, len(items))
	amount := decimal.Zero
	for _, item := range items {
		itemIDs = append(itemIDs, item.ID)
		amount = amount.Add(*item.Amount)
	}
	if !amount.IsPositive() {
		return nil, biz.ErrBadParam
	}
	allocations, err := tx.client.ProductionWIPOutsourcingAllocation.Query().Where(productionwipoutsourcingallocation.OutsourcingOrderItemIDIn(itemIDs...)).WithProductionWipBatch().All(ctx)
	if err != nil {
		return nil, err
	}
	if len(allocations) != len(items) {
		return nil, biz.ErrOutsourcingOrderFactSourceInvalid
	}
	occurredAt := time.Time{}
	for _, allocation := range allocations {
		batch := allocation.Edges.ProductionWipBatch
		if batch == nil || batch.Status != biz.ProductionWIPStatusAccepted || batch.CompletedAt == nil {
			return nil, biz.ErrOutsourcingStageNotAccepted
		}
		if batch.CompletedAt.After(occurredAt) {
			occurredAt = *batch.CompletedAt
		}
	}
	// A contract with an earlier receipt-based payable must not be billed again.
	receipts, err := tx.client.OutsourcingFact.Query().Where(outsourcingfact.SourceType(biz.OutsourcingOrderSourceType), outsourcingfact.SourceID(order.ID)).IDs(ctx)
	if err != nil {
		return nil, err
	}
	if len(receipts) > 0 {
		exists, err := tx.client.FinanceFact.Query().Where(financefact.FactType(biz.FinanceFactPayable), financefact.SourceType(biz.OutsourcingFactSourceType), financefact.SourceIDIn(receipts...), financefact.StatusNEQ(biz.OperationalFactStatusCancelled)).Exist(ctx)
		if err != nil {
			return nil, err
		}
		if exists {
			return nil, biz.ErrOutsourcingReturnFinanceDependency
		}
	}
	if _, err := lockAndReadFinanceSupplier(ctx, tx, order.SupplierID); err != nil {
		return nil, err
	}
	currency, days, err := financePayableOrderSnapshot(order.Currency, order.PaymentTermDays)
	if err != nil {
		return nil, err
	}
	term, days, err := biz.FinancePaymentTermSnapshotFromDays(days)
	if err != nil {
		return nil, err
	}
	occurredAt = occurredAt.UTC().Truncate(time.Microsecond)
	dueAt, err := biz.FinanceFactDueAtFromDays(occurredAt, days)
	if err != nil {
		return nil, err
	}
	sourceType := biz.OutsourcingOrderSourceType
	return r.insertDerivedFinanceFactAndCommit(ctx, tx, &biz.FinanceFactCreate{
		FactNo: in.FactNo, FactType: biz.FinanceFactPayable, CounterpartyType: biz.FinanceCounterpartySupplier, CounterpartyID: &order.SupplierID,
		Amount: amount, FeeAmount: decimal.Zero, Currency: currency, PaymentTerm: term, PaymentTermDays: days, DueAt: dueAt,
		SourceType: &sourceType, SourceID: &order.ID, IdempotencyKey: in.IdempotencyKey, OccurredAt: occurredAt, OccurredAtSpecified: true, Note: in.Note,
	})
}
