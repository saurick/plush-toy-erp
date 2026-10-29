package data

import (
	"context"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financecreditnote"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/purchasereceiptadjustmentitem"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/purchasereturnitem"

	"github.com/shopspring/decimal"
)

type financeAdjustmentSource struct {
	receiptID  int
	number     string
	status     string
	postedAt   *time.Time
	occurredAt time.Time
}

func readFinanceAdjustmentSource(ctx context.Context, client *ent.Client, sourceType string, sourceID int) (financeAdjustmentSource, error) {
	switch sourceType {
	case biz.PurchaseReturnSourceType:
		row, err := client.PurchaseReturn.Get(ctx, sourceID)
		if err != nil {
			return financeAdjustmentSource{}, err
		}
		if row.PurchaseReceiptID == nil {
			return financeAdjustmentSource{}, biz.ErrFinanceFactSourceInvalid
		}
		return financeAdjustmentSource{*row.PurchaseReceiptID, row.ReturnNo, row.Status, row.PostedAt, row.ReturnedAt}, nil
	case biz.PurchaseReceiptAdjustmentSourceType:
		row, err := client.PurchaseReceiptAdjustment.Get(ctx, sourceID)
		if err != nil {
			return financeAdjustmentSource{}, err
		}
		return financeAdjustmentSource{row.PurchaseReceiptID, row.AdjustmentNo, row.Status, row.PostedAt, row.AdjustedAt}, nil
	default:
		return financeAdjustmentSource{}, biz.ErrBadParam
	}
}

func activePurchasePayable(ctx context.Context, client *ent.Client, receiptID int) (*ent.FinanceFact, error) {
	row, err := client.FinanceFact.Query().Where(financefact.FactType(biz.FinanceFactPayable), financefact.SourceType(biz.PurchaseReceiptSourceType), financefact.SourceID(receiptID), financefact.StatusNEQ(biz.OperationalFactStatusCancelled)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, nil
	}
	return row, err
}

// The caller holds the receipt lock shared with payable creation. A draft freezes
// its source amount, so it must be discarded before the warehouse changes it.
func guardPurchaseFinanceSourcePosting(ctx context.Context, client *ent.Client, receiptID int) error {
	fact, err := activePurchasePayable(ctx, client, receiptID)
	if err != nil {
		return err
	}
	if fact != nil && fact.Status == biz.OperationalFactStatusDraft {
		return biz.ErrPurchaseReceiptFinanceDependency
	}
	return nil
}

func activeFinanceSourceAdjustment(ctx context.Context, client *ent.Client, factID int, sourceType string, sourceID int) (bool, error) {
	return client.FinanceCreditNote.Query().Where(financecreditnote.FinanceFactID(factID), financecreditnote.SourceType(sourceType), financecreditnote.SourceID(sourceID), financecreditnote.Status(biz.FinanceAllocationStatusPosted), financecreditnote.Not(financecreditnote.HasReversals())).Exist(ctx)
}

func guardPurchaseFinanceSourceCancellation(ctx context.Context, client *ent.Client, receiptID int, sourceType string, sourceID int, postedAt *time.Time) error {
	fact, err := activePurchasePayable(ctx, client, receiptID)
	if err != nil || fact == nil {
		return err
	}
	// Sources already included in the original payable cannot be undone behind
	// that frozen amount. Later sources can be cancelled after their credit reversal.
	if postedAt == nil || !postedAt.After(fact.CreatedAt) {
		return biz.ErrPurchaseReceiptFinanceDependency
	}
	active, err := activeFinanceSourceAdjustment(ctx, client, fact.ID, sourceType, sourceID)
	if err != nil {
		return err
	}
	if active {
		return biz.ErrPurchaseReceiptFinanceDependency
	}
	return nil
}

func financeSourceAdjustmentAmount(ctx context.Context, client *ent.Client, sourceType string, sourceID, receiptID int) (decimal.Decimal, error) {
	items, err := client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(receiptID), purchaseReceiptItemPostedPredicate()).All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	prices, err := purchaseReceiptConfirmedPrices(ctx, client, items)
	if err != nil {
		return decimal.Zero, err
	}
	byID := map[int]decimal.Decimal{}
	for _, item := range items {
		_, price, err := confirmedPurchaseReceiptItemMoney(item, prices)
		if err != nil {
			return decimal.Zero, err
		}
		byID[item.ID] = price
	}
	amount := decimal.Zero
	if sourceType == biz.PurchaseReturnSourceType {
		lines, err := client.PurchaseReturnItem.Query().Where(purchasereturnitem.ReturnID(sourceID)).All(ctx)
		if err != nil {
			return decimal.Zero, err
		}
		for _, line := range lines {
			if line.PurchaseReceiptItemID == nil {
				return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
			}
			price, ok := byID[*line.PurchaseReceiptItemID]
			if !ok {
				return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
			}
			delta := price.Mul(line.Quantity).Round(6)
			if line.Amount != nil && !line.Amount.Equal(delta) {
				return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
			}
			amount = amount.Sub(delta)
		}
	} else {
		lines, err := client.PurchaseReceiptAdjustmentItem.Query().Where(purchasereceiptadjustmentitem.AdjustmentID(sourceID)).All(ctx)
		if err != nil {
			return decimal.Zero, err
		}
		for _, line := range lines {
			price, ok := byID[line.PurchaseReceiptItemID]
			if !ok {
				return decimal.Zero, biz.ErrFinanceFactSourceAmountInvalid
			}
			delta := price.Mul(line.Quantity).Round(6)
			switch line.AdjustType {
			case biz.PurchaseReceiptAdjustmentQuantityIncrease:
				amount = amount.Add(delta)
			case biz.PurchaseReceiptAdjustmentQuantityDecrease:
				amount = amount.Sub(delta)
			}
		}
	}
	return amount, nil
}

func (r *operationalFactRepo) CreateFinanceSourceAdjustment(ctx context.Context, in *biz.FinanceSourceAdjustmentCreate, actorID int, hash string) (*biz.FinanceCreditNote, error) {
	if replay, found, err := r.findFinanceCreditReplay(ctx, actorID, in.IdempotencyKey, hash); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	// Keep the warehouse command lock order: source, receipt, then financial fact.
	table := "purchase_returns"
	if in.SourceType == biz.PurchaseReceiptAdjustmentSourceType {
		table = "purchase_receipt_adjustments"
	}
	if err := lockOperationalFactRow(ctx, tx, table, in.SourceID, biz.ErrFinanceFactSourceInvalid); err != nil {
		return nil, err
	}
	source, err := readFinanceAdjustmentSource(ctx, tx.client, in.SourceType, in.SourceID)
	if err != nil {
		return nil, err
	}
	if err := lockPurchaseReceipt(ctx, tx, source.receiptID); err != nil {
		return nil, err
	}
	if replay, found, err := r.findFinanceCreditReplayWithClient(ctx, tx.client, actorID, in.IdempotencyKey, hash); err != nil || found {
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx.sqlTx = nil
		return replay, nil
	}
	fact, err := activePurchasePayable(ctx, tx.client, source.receiptID)
	if err != nil {
		return nil, err
	}
	if fact == nil || source.status != biz.PurchaseReturnStatusPosted || source.postedAt == nil || !source.postedAt.After(fact.CreatedAt) {
		return nil, biz.ErrFinanceFactSourceInvalid
	}
	if err := lockOperationalFactRow(ctx, tx, "finance_facts", fact.ID, biz.ErrFinanceFactNotFound); err != nil {
		return nil, err
	}
	fact, err = tx.client.FinanceFact.Get(ctx, fact.ID)
	if err != nil {
		return nil, err
	}
	if fact.Status != biz.OperationalFactStatusPosted && fact.Status != biz.OperationalFactStatusSettled {
		return nil, biz.ErrBadParam
	}
	active, err := activeFinanceSourceAdjustment(ctx, tx.client, fact.ID, in.SourceType, in.SourceID)
	if err != nil {
		return nil, err
	}
	if active {
		return nil, biz.ErrIdempotencyConflict
	}
	delta, err := financeSourceAdjustmentAmount(ctx, tx.client, in.SourceType, in.SourceID, source.receiptID)
	if err != nil {
		return nil, err
	}
	if delta.IsZero() {
		return nil, biz.ErrFinanceFactSourceAmountInvalid
	}
	outstanding, err := financeFactOutstanding(ctx, tx.client, fact.ID, fact.Amount)
	if err != nil {
		return nil, err
	}
	if outstanding.Add(delta).IsNegative() {
		return nil, biz.ErrFinanceAllocationDependency
	}
	direction := biz.FinanceAdjustmentIncrease
	if delta.IsNegative() {
		direction = biz.FinanceAdjustmentDecrease
	}
	row, err := tx.client.FinanceCreditNote.Create().SetCreditNoteNo(in.CreditNoteNo).SetFinanceFactID(fact.ID).
		SetSourceType(in.SourceType).SetSourceID(in.SourceID).SetBalanceDirection(direction).
		SetAmount(delta.Abs()).SetCurrency(fact.Currency).SetStatus(biz.FinanceAllocationStatusPosted).
		SetReason(in.Reason).SetIdempotencyKey(in.IdempotencyKey).SetIdempotencyPayloadHash(hash).SetCreatedBy(actorID).Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			if rollbackErr := tx.sqlTx.Rollback(); rollbackErr != nil {
				return nil, rollbackErr
			}
			tx.sqlTx = nil
			if replay, found, replayErr := r.findFinanceCreditReplay(ctx, actorID, in.IdempotencyKey, hash); replayErr != nil || found {
				return replay, replayErr
			}
		}
		return nil, err
	}
	if err := setFinanceFactSettlement(ctx, tx, fact.ID, outstanding.Add(delta).IsZero(), actorID); err != nil {
		return nil, err
	}
	out, err := financeCreditNoteWithFact(ctx, tx.client, row)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return out, nil
}

func (r *operationalFactRepo) ListFinanceSourceAdjustments(ctx context.Context, filter biz.FinanceSourceAdjustmentFilter) ([]*biz.FinanceSourceAdjustment, int, error) {
	const candidates = `WITH sources AS (
 SELECT 'PURCHASE_RETURN' AS source_type,id AS source_id,return_no AS source_no,purchase_receipt_id,posted_at FROM purchase_returns WHERE status='POSTED'
 UNION ALL SELECT 'PURCHASE_RECEIPT_ADJUSTMENT',id,adjustment_no,purchase_receipt_id,posted_at FROM purchase_receipt_adjustments WHERE status='POSTED'
 AND EXISTS(SELECT 1 FROM purchase_receipt_adjustment_items i WHERE i.adjustment_id=purchase_receipt_adjustments.id AND i.adjust_type IN ('QUANTITY_INCREASE','QUANTITY_DECREASE'))
), candidates AS (
 SELECT s.source_type,s.source_id,f.id AS finance_fact_id FROM sources s JOIN finance_facts f ON f.source_type='PURCHASE_RECEIPT' AND f.source_id=s.purchase_receipt_id
 WHERE f.fact_type='PAYABLE' AND f.status IN ('POSTED','SETTLED') AND s.posted_at>f.created_at AND ($1=0 OR f.id=$1)
 AND NOT EXISTS(SELECT 1 FROM finance_credit_notes n WHERE n.finance_fact_id=f.id AND n.source_type=s.source_type AND n.source_id=s.source_id AND n.status='POSTED'
 AND NOT EXISTS(SELECT 1 FROM finance_credit_notes rev WHERE rev.reversal_of_credit_note_id=n.id))) `
	var total int
	if err := r.data.sqldb.QueryRowContext(ctx, candidates+"SELECT COUNT(*) FROM candidates", filter.FinanceFactID).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := r.data.sqldb.QueryContext(ctx, candidates+"SELECT source_type,source_id,finance_fact_id FROM candidates ORDER BY finance_fact_id,source_type,source_id LIMIT $2 OFFSET $3", filter.FinanceFactID, filter.Limit, filter.Offset)
	if err != nil {
		return nil, 0, err
	}
	type key struct {
		sourceType       string
		sourceID, factID int
	}
	keys := []key{}
	for rows.Next() {
		var k key
		if err := rows.Scan(&k.sourceType, &k.sourceID, &k.factID); err != nil {
			_ = rows.Close()
			return nil, 0, err
		}
		keys = append(keys, k)
	}
	err = rows.Err()
	if closeErr := rows.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.FinanceSourceAdjustment, 0, len(keys))
	for _, k := range keys {
		source, err := readFinanceAdjustmentSource(ctx, r.data.postgres, k.sourceType, k.sourceID)
		if err != nil {
			return nil, 0, err
		}
		fact, err := r.GetFinanceFact(ctx, k.factID)
		if err != nil {
			return nil, 0, err
		}
		delta, err := financeSourceAdjustmentAmount(ctx, r.data.postgres, k.sourceType, k.sourceID, source.receiptID)
		if err != nil {
			return nil, 0, err
		}
		direction := biz.FinanceAdjustmentIncrease
		if delta.IsNegative() {
			direction = biz.FinanceAdjustmentDecrease
		}
		item := &biz.FinanceSourceAdjustment{SourceType: k.sourceType, SourceID: k.sourceID, SourceNo: source.number, FinanceFactID: fact.ID, FinanceFactNo: fact.FactNo, Currency: fact.Currency, BalanceDirection: direction, Amount: delta.Abs(), OutstandingAmount: fact.OutstandingAmount, OccurredAt: source.occurredAt}
		if fact.CounterpartyID != nil {
			item.CounterpartyID = *fact.CounterpartyID
			supplier, err := r.data.postgres.Supplier.Get(ctx, item.CounterpartyID)
			if err != nil {
				return nil, 0, err
			}
			item.CounterpartyName = supplier.Name
		}
		out = append(out, item)
	}
	return out, total, nil
}
