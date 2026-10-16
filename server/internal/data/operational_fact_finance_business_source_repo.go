package data

import (
	"context"
	"sort"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/purchasereceiptadjustment"
	"server/internal/data/model/ent/purchasereceiptadjustmentitem"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/purchasereturn"
	"server/internal/data/model/ent/purchasereturnitem"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/data/model/ent/supplier"

	"github.com/shopspring/decimal"
)

var _ biz.FinanceFactFromBusinessSourceRepo = (*operationalFactRepo)(nil)

func (r *operationalFactRepo) CreatePayableFromPurchaseReceipt(
	ctx context.Context,
	in *biz.FinanceFactFromPurchaseReceiptCreate,
) (*biz.FinanceFact, error) {
	if in == nil || in.PurchaseReceiptID <= 0 {
		return nil, biz.ErrBadParam
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockPurchaseReceipt(ctx, tx, in.PurchaseReceiptID); err != nil {
		return nil, err
	}
	receipt, err := tx.client.PurchaseReceipt.Get(ctx, in.PurchaseReceiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	if receipt.Status != biz.PurchaseReceiptStatusPosted || receipt.SupplierID == nil || *receipt.SupplierID <= 0 {
		return nil, biz.ErrBadParam
	}
	sourceSnapshot, err := lockAndReadPurchaseReceiptPayableSource(ctx, tx, receipt)
	if err != nil {
		return nil, err
	}
	if _, err := lockAndReadFinanceSupplier(ctx, tx, *receipt.SupplierID); err != nil {
		return nil, err
	}
	amount, err := purchaseReceiptPayableAmount(ctx, tx.client, receipt.ID)
	if err != nil {
		return nil, err
	}
	sourceType := biz.PurchaseReceiptSourceType
	sourceID := receipt.ID
	supplierID := *receipt.SupplierID
	paymentTerm, paymentTermDays, err := biz.FinancePaymentTermSnapshotFromDays(sourceSnapshot.paymentTermDays)
	if err != nil {
		return nil, err
	}
	occurredAt := receipt.ReceivedAt.UTC().Truncate(time.Microsecond)
	dueAt, err := biz.FinanceFactDueAtFromDays(occurredAt, paymentTermDays)
	if err != nil {
		return nil, err
	}
	create := &biz.FinanceFactCreate{
		FactNo:              in.FactNo,
		FactType:            biz.FinanceFactPayable,
		CounterpartyType:    biz.FinanceCounterpartySupplier,
		CounterpartyID:      &supplierID,
		Amount:              amount,
		FeeAmount:           decimal.Zero,
		Currency:            sourceSnapshot.currency,
		PaymentTerm:         paymentTerm,
		PaymentTermDays:     paymentTermDays,
		DueAt:               dueAt,
		SourceType:          &sourceType,
		SourceID:            &sourceID,
		IdempotencyKey:      in.IdempotencyKey,
		OccurredAt:          occurredAt,
		OccurredAtSpecified: true,
		Note:                in.Note,
	}
	return r.insertDerivedFinanceFactAndCommit(ctx, tx, create)
}

func (r *operationalFactRepo) CreatePayableFromOutsourcingReturn(
	ctx context.Context,
	in *biz.FinanceFactFromOutsourcingReturnCreate,
) (*biz.FinanceFact, error) {
	if in == nil || in.OutsourcingFactID <= 0 {
		return nil, biz.ErrBadParam
	}
	preview, err := r.data.postgres.OutsourcingFact.Get(ctx, in.OutsourcingFactID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrOutsourcingFactNotFound
		}
		return nil, err
	}
	orderID, itemID, err := outsourcingOrderSourceIDsFromFact(preview)
	if err != nil {
		return nil, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_orders", orderID, biz.ErrOutsourcingOrderNotFound); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_order_items", itemID, biz.ErrOutsourcingOrderItemNotFound); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_facts", in.OutsourcingFactID, biz.ErrOutsourcingFactNotFound); err != nil {
		return nil, err
	}
	order, err := tx.client.OutsourcingOrder.Query().Where(outsourcingorder.ID(orderID)).Only(ctx)
	if err != nil {
		return nil, err
	}
	item, err := tx.client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.ID(itemID)).Only(ctx)
	if err != nil {
		return nil, err
	}
	fact, err := tx.client.OutsourcingFact.Query().Where(outsourcingfact.ID(in.OutsourcingFactID)).Only(ctx)
	if err != nil {
		return nil, err
	}
	if fact.Status != biz.OperationalFactStatusPosted || fact.FactType != biz.OutsourcingFactReturnReceipt ||
		fact.SourceType == nil || *fact.SourceType != biz.OutsourcingOrderSourceType ||
		fact.SourceID == nil || *fact.SourceID != order.ID || fact.SourceLineID == nil || *fact.SourceLineID != item.ID ||
		fact.SupplierID == nil || *fact.SupplierID != order.SupplierID || item.OutsourcingOrderID != order.ID ||
		item.SubjectType != biz.OutsourcingOrderSubjectProduct || item.ProductID == nil ||
		fact.SubjectType != biz.InventorySubjectProduct || fact.SubjectID != *item.ProductID ||
		!sameOptionalInt(fact.ProductSkuID, item.ProductSkuID) || fact.UnitID != item.UnitID {
		return nil, biz.ErrOutsourcingOrderFactSourceInvalid
	}
	if err := requireAcceptedOutsourcingReturnQuality(ctx, tx.client, fact.ID); err != nil {
		return nil, err
	}
	if _, err := lockAndReadFinanceSupplier(ctx, tx, order.SupplierID); err != nil {
		return nil, err
	}
	currency, paymentTermDays, err := financePayableOrderSnapshot(order.Currency, order.PaymentTermDays)
	if err != nil {
		return nil, err
	}
	amount, err := outsourcingReturnPayableAmount(item, fact.Quantity)
	if err != nil {
		return nil, err
	}
	sourceType := biz.OutsourcingFactSourceType
	sourceID := fact.ID
	supplierID := order.SupplierID
	paymentTerm, paymentTermDays, err := biz.FinancePaymentTermSnapshotFromDays(paymentTermDays)
	if err != nil {
		return nil, err
	}
	occurredAt := fact.OccurredAt.UTC().Truncate(time.Microsecond)
	dueAt, err := biz.FinanceFactDueAtFromDays(occurredAt, paymentTermDays)
	if err != nil {
		return nil, err
	}
	create := &biz.FinanceFactCreate{
		FactNo:              in.FactNo,
		FactType:            biz.FinanceFactPayable,
		CounterpartyType:    biz.FinanceCounterpartySupplier,
		CounterpartyID:      &supplierID,
		Amount:              amount,
		FeeAmount:           decimal.Zero,
		Currency:            currency,
		PaymentTerm:         paymentTerm,
		PaymentTermDays:     paymentTermDays,
		DueAt:               dueAt,
		SourceType:          &sourceType,
		SourceID:            &sourceID,
		IdempotencyKey:      in.IdempotencyKey,
		OccurredAt:          occurredAt,
		OccurredAtSpecified: true,
		Note:                in.Note,
	}
	return r.insertDerivedFinanceFactAndCommit(ctx, tx, create)
}

func lockAndReadFinanceSupplier(ctx context.Context, tx *inventoryDBTx, supplierID int) (*ent.Supplier, error) {
	if tx == nil || tx.client == nil || supplierID <= 0 {
		return nil, biz.ErrBadParam
	}
	if err := lockOperationalFactRow(ctx, tx, "suppliers", supplierID, biz.ErrSupplierNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.Supplier.Query().Where(supplier.ID(supplierID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSupplierNotFound
		}
		return nil, err
	}
	if !row.IsActive {
		return nil, biz.ErrSupplierInactive
	}
	return row, nil
}

type financePayableSourceSnapshot struct {
	currency        string
	paymentTermDays *int
}

func lockAndReadPurchaseReceiptPayableSource(
	ctx context.Context,
	tx *inventoryDBTx,
	receipt *ent.PurchaseReceipt,
) (*financePayableSourceSnapshot, error) {
	if tx == nil || tx.client == nil || receipt == nil || receipt.ID <= 0 || receipt.SupplierID == nil || *receipt.SupplierID <= 0 {
		return nil, biz.ErrFinanceFactSourceInvalid
	}
	receiptItems, err := tx.client.PurchaseReceiptItem.Query().
		Where(purchasereceiptitem.ReceiptID(receipt.ID)).
		Order(ent.Asc(purchasereceiptitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(receiptItems) == 0 {
		return nil, biz.ErrFinanceFactSourceInvalid
	}
	itemIDs := make([]int, 0, len(receiptItems))
	receiptItemsBySourceID := make(map[int][]*ent.PurchaseReceiptItem, len(receiptItems))
	for _, receiptItem := range receiptItems {
		if receiptItem.PurchaseOrderItemID == nil || *receiptItem.PurchaseOrderItemID <= 0 {
			return nil, biz.ErrFinanceFactSourceInvalid
		}
		itemID := *receiptItem.PurchaseOrderItemID
		if _, exists := receiptItemsBySourceID[itemID]; !exists {
			itemIDs = append(itemIDs, itemID)
		}
		receiptItemsBySourceID[itemID] = append(receiptItemsBySourceID[itemID], receiptItem)
	}
	sort.Ints(itemIDs)

	orderIDs := make([]int, 0, len(itemIDs))
	orderIDSet := make(map[int]struct{}, len(itemIDs))
	for _, itemID := range itemIDs {
		if err := lockOperationalFactRow(ctx, tx, "purchase_order_items", itemID, biz.ErrFinanceFactSourceInvalid); err != nil {
			return nil, err
		}
		orderItem, err := tx.client.PurchaseOrderItem.Query().Where(purchaseorderitem.ID(itemID)).Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrFinanceFactSourceInvalid
			}
			return nil, err
		}
		if orderItem.PurchaseOrderID <= 0 {
			return nil, biz.ErrFinanceFactSourceInvalid
		}
		for _, receiptItem := range receiptItemsBySourceID[itemID] {
			if receiptItem.MaterialID != orderItem.MaterialID || receiptItem.UnitID != orderItem.UnitID {
				return nil, biz.ErrFinanceFactSourceInvalid
			}
		}
		if _, exists := orderIDSet[orderItem.PurchaseOrderID]; !exists {
			orderIDSet[orderItem.PurchaseOrderID] = struct{}{}
			orderIDs = append(orderIDs, orderItem.PurchaseOrderID)
		}
	}
	sort.Ints(orderIDs)

	var snapshot *financePayableSourceSnapshot
	for _, orderID := range orderIDs {
		if err := lockOperationalFactRow(ctx, tx, "purchase_orders", orderID, biz.ErrFinanceFactSourceInvalid); err != nil {
			return nil, err
		}
		order, err := tx.client.PurchaseOrder.Query().Where(purchaseorder.ID(orderID)).Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrFinanceFactSourceInvalid
			}
			return nil, err
		}
		if order.SupplierID != *receipt.SupplierID {
			return nil, biz.ErrFinanceFactSourceInvalid
		}
		currency, paymentTermDays, err := financePayableOrderSnapshot(order.Currency, order.PaymentTermDays)
		if err != nil {
			return nil, err
		}
		if snapshot == nil {
			snapshot = &financePayableSourceSnapshot{currency: currency, paymentTermDays: paymentTermDays}
			continue
		}
		if snapshot.currency != currency || !sameOptionalInt(snapshot.paymentTermDays, paymentTermDays) {
			return nil, biz.ErrFinanceFactSourceInvalid
		}
	}
	if snapshot == nil {
		return nil, biz.ErrFinanceFactSourceInvalid
	}
	return snapshot, nil
}

func financePayableOrderSnapshot(currency string, paymentTermDays *int) (string, *int, error) {
	normalizedCurrency, currencyOK := biz.NormalizeFinanceCurrency(currency)
	if !currencyOK || normalizedCurrency != currency || paymentTermDays == nil || *paymentTermDays < 0 {
		return "", nil, biz.ErrFinanceFactSourceInvalid
	}
	days := *paymentTermDays
	return normalizedCurrency, &days, nil
}

func requireAcceptedOutsourcingReturnQuality(ctx context.Context, client *ent.Client, outsourcingFactID int) error {
	if client == nil || outsourcingFactID <= 0 {
		return biz.ErrBadParam
	}
	rows, err := client.QualityInspection.Query().Where(
		qualityinspection.SourceType(biz.QualityInspectionSourceOutsourcingFact),
		qualityinspection.SourceID(outsourcingFactID),
		qualityinspection.InspectionType(biz.QualityInspectionTypeOutsourcingReturn),
		qualityinspection.StatusNEQ(biz.QualityInspectionStatusCancelled),
	).Order(ent.Asc(qualityinspection.FieldID)).Limit(2).All(ctx)
	if err != nil {
		return err
	}
	if len(rows) != 1 {
		return biz.ErrOutsourcingReturnQualityPending
	}
	inspection := rows[0]
	if inspection.Status == biz.QualityInspectionStatusRejected ||
		(inspection.Result != nil && *inspection.Result == biz.QualityInspectionResultReject) {
		return biz.ErrOutsourcingReturnQualityRejected
	}
	if inspection.Status != biz.QualityInspectionStatusPassed || inspection.Result == nil {
		return biz.ErrOutsourcingReturnQualityPending
	}
	switch *inspection.Result {
	case biz.QualityInspectionResultPass, biz.QualityInspectionResultConcession:
		return nil
	default:
		return biz.ErrOutsourcingReturnQualityPending
	}
}

func (r *operationalFactRepo) CreateReconciliationFromFinanceFact(
	ctx context.Context,
	in *biz.FinanceReconciliationFromFactCreate,
) (*biz.FinanceFact, error) {
	if in == nil || in.FinanceFactID <= 0 {
		return nil, biz.ErrBadParam
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "finance_facts", in.FinanceFactID, biz.ErrFinanceFactNotFound); err != nil {
		return nil, err
	}
	source, err := tx.client.FinanceFact.Get(ctx, in.FinanceFactID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrFinanceFactNotFound
		}
		return nil, err
	}
	if source.Status != biz.OperationalFactStatusPosted || source.CounterpartyID == nil || *source.CounterpartyID <= 0 || !source.Amount.GreaterThan(decimal.Zero) {
		return nil, biz.ErrFinanceReconciliationSourceInvalid
	}
	switch source.FactType {
	case biz.FinanceFactReceivable, biz.FinanceFactPayable, biz.FinanceFactInvoice:
	default:
		return nil, biz.ErrFinanceReconciliationSourceInvalid
	}
	sourceType := biz.FinanceFactSourceType
	sourceID := source.ID
	counterpartyID := *source.CounterpartyID
	create := &biz.FinanceFactCreate{
		FactNo:              in.FactNo,
		FactType:            biz.FinanceFactReconciliation,
		CounterpartyType:    source.CounterpartyType,
		CounterpartyID:      &counterpartyID,
		Amount:              source.Amount,
		FeeAmount:           decimal.Zero,
		Currency:            source.Currency,
		SourceType:          &sourceType,
		SourceID:            &sourceID,
		IdempotencyKey:      in.IdempotencyKey,
		OccurredAt:          in.OccurredAt,
		OccurredAtSpecified: in.OccurredAtSpecified,
		Note:                in.Note,
	}
	return r.insertDerivedFinanceFactAndCommit(ctx, tx, create)
}

func (r *operationalFactRepo) insertDerivedFinanceFactAndCommit(
	ctx context.Context,
	tx *inventoryDBTx,
	in *biz.FinanceFactCreate,
) (*biz.FinanceFact, error) {
	if tx == nil || tx.client == nil || tx.sqlTx == nil || in == nil {
		return nil, biz.ErrBadParam
	}
	if replay, found, err := findFinanceFactReplay(ctx, tx.client, in); err != nil || found {
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx.sqlTx = nil
		return replay, nil
	}
	if _, found, err := findActiveFinanceFactBySource(ctx, tx.client, in); err != nil {
		return nil, err
	} else if found {
		return nil, biz.ErrFinanceFactSourceConflict
	}
	row, err := tx.client.FinanceFact.Create().
		SetFactNo(in.FactNo).
		SetFactType(in.FactType).
		SetStatus(biz.OperationalFactStatusDraft).
		SetCounterpartyType(in.CounterpartyType).
		SetNillableCounterpartyID(in.CounterpartyID).
		SetAmount(in.Amount).
		SetFeeAmount(in.FeeAmount).
		SetCurrency(in.Currency).
		SetNillablePaymentTerm(in.PaymentTerm).
		SetNillablePaymentTermDays(in.PaymentTermDays).
		SetNillableDueAt(in.DueAt).
		SetNillableSourceType(in.SourceType).
		SetNillableSourceID(in.SourceID).
		SetIdempotencyKey(in.IdempotencyKey).
		SetOccurredAt(in.OccurredAt).
		SetOccurredAtSpecified(in.OccurredAtSpecified).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			rollbackInventoryDBTx(ctx, tx, r.log)
			tx.sqlTx = nil
			if replay, found, replayErr := findFinanceFactReplay(ctx, r.data.postgres, in); replayErr != nil || found {
				return replay, replayErr
			}
			if _, found, sourceErr := findActiveFinanceFactBySource(ctx, r.data.postgres, in); sourceErr != nil {
				return nil, sourceErr
			} else if found {
				return nil, biz.ErrFinanceFactSourceConflict
			}
		}
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return entFinanceFactToBiz(row), nil
}

func purchaseReceiptPayableAmount(ctx context.Context, client *ent.Client, receiptID int) (decimal.Decimal, error) {
	items, err := client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(receiptID)).All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	if len(items) == 0 {
		return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
	}
	itemByID := make(map[int]*ent.PurchaseReceiptItem, len(items))
	unitPriceByID := make(map[int]decimal.Decimal, len(items))
	total := decimal.Zero
	for _, item := range items {
		amount, unitPrice, err := purchaseReceiptItemMoney(item)
		if err != nil {
			return decimal.Zero, err
		}
		itemByID[item.ID] = item
		unitPriceByID[item.ID] = unitPrice
		total = total.Add(amount)
	}
	returnItems, err := client.PurchaseReturnItem.Query().Where(
		purchasereturnitem.PurchaseReceiptItemIDNotNil(),
		purchasereturnitem.HasPurchaseReturnWith(
			purchasereturn.PurchaseReceiptID(receiptID),
			purchasereturn.Status(biz.PurchaseReturnStatusPosted),
		),
	).All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	for _, item := range returnItems {
		if item.PurchaseReceiptItemID == nil || itemByID[*item.PurchaseReceiptItemID] == nil {
			return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
		}
		amount := unitPriceByID[*item.PurchaseReceiptItemID].Mul(item.Quantity).Round(6)
		if item.Amount != nil && !item.Amount.Equal(amount) {
			return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
		}
		total = total.Sub(amount)
	}
	adjustments, err := client.PurchaseReceiptAdjustmentItem.Query().Where(
		purchasereceiptadjustmentitem.HasPurchaseReceiptAdjustmentWith(
			purchasereceiptadjustment.PurchaseReceiptID(receiptID),
			purchasereceiptadjustment.Status(biz.PurchaseReceiptAdjustmentStatusPosted),
		),
	).All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	for _, item := range adjustments {
		price, ok := unitPriceByID[item.PurchaseReceiptItemID]
		if !ok {
			return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
		}
		delta := price.Mul(item.Quantity).Round(6)
		switch item.AdjustType {
		case biz.PurchaseReceiptAdjustmentQuantityIncrease:
			total = total.Add(delta)
		case biz.PurchaseReceiptAdjustmentQuantityDecrease:
			total = total.Sub(delta)
		case biz.PurchaseReceiptAdjustmentLotCorrectionOut,
			biz.PurchaseReceiptAdjustmentLotCorrectionIn,
			biz.PurchaseReceiptAdjustmentWarehouseCorrectionOut,
			biz.PurchaseReceiptAdjustmentWarehouseCorrectionIn:
		default:
			return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
		}
	}
	if !total.GreaterThan(decimal.Zero) {
		return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
	}
	return total, nil
}

func purchaseReceiptItemMoney(item *ent.PurchaseReceiptItem) (decimal.Decimal, decimal.Decimal, error) {
	if item == nil || !item.Quantity.GreaterThan(decimal.Zero) {
		return decimal.Zero, decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
	}
	if item.UnitPrice != nil {
		amount := item.Quantity.Mul(*item.UnitPrice).Round(6)
		if item.Amount != nil && !item.Amount.Equal(amount) {
			return decimal.Zero, decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
		}
		return amount, *item.UnitPrice, nil
	}
	if item.Amount != nil {
		return *item.Amount, item.Amount.Div(item.Quantity), nil
	}
	return decimal.Zero, decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
}

func outsourcingReturnPayableAmount(item *ent.OutsourcingOrderItem, quantity decimal.Decimal) (decimal.Decimal, error) {
	if item == nil || !quantity.GreaterThan(decimal.Zero) || !item.OutsourcingQuantity.GreaterThan(decimal.Zero) {
		return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
	}
	var amount decimal.Decimal
	switch {
	case item.UnitPrice != nil:
		amount = item.UnitPrice.Mul(quantity)
	case item.Amount != nil:
		amount = item.Amount.Div(item.OutsourcingQuantity).Mul(quantity)
	default:
		return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
	}
	if !amount.GreaterThan(decimal.Zero) {
		return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
	}
	return amount, nil
}

func hasActiveFinanceFactForSource(
	ctx context.Context,
	client *ent.Client,
	factType, sourceType string,
	sourceID int,
) (bool, error) {
	if client == nil || factType == "" || sourceType == "" || sourceID <= 0 {
		return false, biz.ErrBadParam
	}
	return client.FinanceFact.Query().Where(
		financefact.FactType(factType),
		financefact.SourceType(sourceType),
		financefact.SourceID(sourceID),
		financefact.StatusNEQ(biz.OperationalFactStatusCancelled),
	).Exist(ctx)
}
