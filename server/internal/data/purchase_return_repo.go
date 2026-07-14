package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"server/internal/biz"
	corestatus "server/internal/core/status"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/purchasereturn"
	"server/internal/data/model/ent/purchasereturnitem"

	"entgo.io/ent/dialect"
	"github.com/shopspring/decimal"
)

func (r *inventoryRepo) CreatePurchaseReturnDraft(ctx context.Context, in *biz.PurchaseReturnCreate) (*biz.PurchaseReturn, error) {
	if in.PurchaseReceiptID != nil {
		receipt, err := r.data.postgres.PurchaseReceipt.Get(ctx, *in.PurchaseReceiptID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrPurchaseReceiptNotFound
			}
			return nil, err
		}
		if !corestatus.IsPurchaseReceiptPosted(receipt.Status) {
			return nil, biz.ErrBadParam
		}
	}
	row, err := r.data.postgres.PurchaseReturn.Create().
		SetReturnNo(in.ReturnNo).
		SetNillablePurchaseReceiptID(in.PurchaseReceiptID).
		SetNillableQualityInspectionID(in.QualityInspectionID).
		SetSupplierName(in.SupplierName).
		SetNillableReturnReason(in.ReturnReason).
		SetStatus(biz.PurchaseReturnStatusDraft).
		SetReturnedAt(in.ReturnedAt).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entPurchaseReturnToBiz(row, nil), nil
}

func (r *inventoryRepo) ResolvePurchaseReturnReplay(ctx context.Context, in *biz.PurchaseReturnCreate) (*biz.PurchaseReturn, bool, error) {
	if r == nil || r.data == nil || r.data.postgres == nil || in == nil || in.IdempotencyKey == "" || in.IdempotencyPayloadHash == "" {
		return nil, false, biz.ErrBadParam
	}
	return resolvePurchaseReturnReplay(ctx, r.data.postgres, in)
}

func (r *inventoryRepo) CreatePurchaseReturnWithItems(ctx context.Context, in *biz.PurchaseReturnCreate, items []*biz.PurchaseReturnItemCreate) (*biz.PurchaseReturn, error) {
	if in == nil || in.PurchaseReceiptID == nil || *in.PurchaseReceiptID <= 0 || len(items) == 0 || in.IdempotencyKey == "" || in.IdempotencyPayloadHash == "" {
		return nil, biz.ErrBadParam
	}
	if replayed, found, err := resolvePurchaseReturnReplay(ctx, r.data.postgres, in); err != nil || found {
		return replayed, err
	}
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockPurchaseReceipt(ctx, tx, *in.PurchaseReceiptID); err != nil {
		return nil, err
	}
	if replayed, found, err := resolvePurchaseReturnReplay(ctx, tx.client, in); err != nil || found {
		return replayed, err
	}
	receipt, err := tx.client.PurchaseReceipt.Get(ctx, *in.PurchaseReceiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	if !corestatus.IsPurchaseReceiptPosted(receipt.Status) || receipt.SupplierName != in.SupplierName {
		return nil, biz.ErrBadParam
	}
	row, err := tx.client.PurchaseReturn.Create().
		SetReturnNo(in.ReturnNo).
		SetPurchaseReceiptID(*in.PurchaseReceiptID).
		SetNillableQualityInspectionID(in.QualityInspectionID).
		SetSupplierName(receipt.SupplierName).
		SetNillableReturnReason(in.ReturnReason).
		SetStatus(biz.PurchaseReturnStatusDraft).
		SetReturnedAt(in.ReturnedAt).
		SetIdempotencyKey(in.IdempotencyKey).
		SetIdempotencyPayloadHash(in.IdempotencyPayloadHash).
		SetIdempotencyItemCount(len(items)).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		originalErr := err
		rollbackInventoryDBTx(ctx, tx, r.log)
		tx = nil
		if replayed, found, replayErr := resolvePurchaseReturnReplay(ctx, r.data.postgres, in); replayErr != nil {
			return nil, replayErr
		} else if found {
			return replayed, nil
		}
		return nil, originalErr
	}
	for _, requested := range items {
		if requested == nil {
			return nil, biz.ErrBadParam
		}
		item := *requested
		item.ReturnID = row.ID
		if err := validatePurchaseReturnItemReferences(ctx, tx.client, row.PurchaseReceiptID, &item); err != nil {
			return nil, err
		}
		if _, err := tx.client.PurchaseReturnItem.Create().
			SetReturnID(row.ID).
			SetNillablePurchaseReceiptItemID(item.PurchaseReceiptItemID).
			SetMaterialID(item.MaterialID).
			SetWarehouseID(item.WarehouseID).
			SetUnitID(item.UnitID).
			SetNillableLotID(item.LotID).
			SetQuantity(item.Quantity).
			SetNillableUnitPrice(item.UnitPrice).
			SetNillableAmount(item.Amount).
			SetNillableSourceLineNo(item.SourceLineNo).
			SetNillableNote(item.Note).
			Save(ctx); err != nil {
			return nil, err
		}
	}
	out, err := purchaseReturnWithItems(ctx, tx.client, row)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		commitErr := err
		rollbackInventoryDBTx(ctx, tx, r.log)
		tx = nil
		if replayed, found, replayErr := resolvePurchaseReturnReplay(ctx, r.data.postgres, in); replayErr != nil {
			return nil, replayErr
		} else if found {
			return replayed, nil
		}
		return nil, commitErr
	}
	tx = nil
	return out, nil
}

func (r *inventoryRepo) AddPurchaseReturnItem(ctx context.Context, in *biz.PurchaseReturnItemCreate) (*biz.PurchaseReturnItem, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockPurchaseReturn(ctx, tx, in.ReturnID); err != nil {
		return nil, err
	}
	purchaseReturn, err := tx.client.PurchaseReturn.Get(ctx, in.ReturnID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReturnNotFound
		}
		return nil, err
	}
	if !corestatus.CanAddPurchaseReturnItem(purchaseReturn.Status) {
		return nil, biz.ErrBadParam
	}
	if err := validatePurchaseReturnItemReferences(ctx, tx.client, purchaseReturn.PurchaseReceiptID, in); err != nil {
		return nil, err
	}
	row, err := tx.client.PurchaseReturnItem.Create().
		SetReturnID(in.ReturnID).
		SetNillablePurchaseReceiptItemID(in.PurchaseReceiptItemID).
		SetMaterialID(in.MaterialID).
		SetWarehouseID(in.WarehouseID).
		SetUnitID(in.UnitID).
		SetNillableLotID(in.LotID).
		SetQuantity(in.Quantity).
		SetNillableUnitPrice(in.UnitPrice).
		SetNillableAmount(in.Amount).
		SetNillableSourceLineNo(in.SourceLineNo).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	out := entPurchaseReturnItemToBiz(row)
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *inventoryRepo) PostPurchaseReturn(ctx context.Context, returnID int) (*biz.PurchaseReturn, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockPurchaseReturn(ctx, tx, returnID); err != nil {
		return nil, err
	}
	purchaseReturn, err := tx.client.PurchaseReturn.Get(ctx, returnID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReturnNotFound
		}
		return nil, err
	}
	// Source receipt cancellation and purchase return posting share this parent
	// lock. Re-read the receipt after acquiring it so a return cannot post from a
	// stale POSTED snapshot while the source receipt is being cancelled.
	if purchaseReturn.PurchaseReceiptID != nil {
		if err := lockPurchaseReceipt(ctx, tx, *purchaseReturn.PurchaseReceiptID); err != nil {
			return nil, err
		}
		receipt, err := tx.client.PurchaseReceipt.Get(ctx, *purchaseReturn.PurchaseReceiptID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrPurchaseReceiptNotFound
			}
			return nil, err
		}
		if !corestatus.IsPurchaseReceiptPosted(receipt.Status) {
			return nil, biz.ErrBadParam
		}
	}
	transition, ok := corestatus.PostPurchaseReturn(purchaseReturn.Status)
	if !ok {
		return nil, biz.ErrBadParam
	}
	if !transition.Changed {
		out, err := purchaseReturnWithItems(ctx, tx.client, purchaseReturn)
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return out, nil
	}
	if purchaseReturn.PurchaseReceiptID != nil {
		hasActivePayable, err := hasActiveFinanceFactForSource(ctx, tx.client, biz.FinanceFactPayable, biz.PurchaseReceiptSourceType, *purchaseReturn.PurchaseReceiptID)
		if err != nil {
			return nil, err
		}
		if hasActivePayable {
			return nil, biz.ErrPurchaseReceiptFinanceDependency
		}
	}

	items, err := tx.client.PurchaseReturnItem.Query().
		Where(purchasereturnitem.ReturnID(purchaseReturn.ID)).
		Order(ent.Asc(purchasereturnitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, biz.ErrBadParam
	}
	for _, item := range items {
		if err := validatePurchaseReturnItemReferences(ctx, tx.client, purchaseReturn.PurchaseReceiptID, entPurchaseReturnItemToCreate(item)); err != nil {
			return nil, err
		}
	}
	if err := validatePurchaseReturnReceiptItemQuantities(ctx, tx, purchaseReturn.ID, items); err != nil {
		return nil, err
	}
	for _, item := range items {
		sourceID := purchaseReturn.ID
		sourceLineID := item.ID
		_, err = r.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, &biz.InventoryTxnCreate{
			SubjectType:    biz.InventorySubjectMaterial,
			SubjectID:      item.MaterialID,
			WarehouseID:    item.WarehouseID,
			LotID:          item.LotID,
			TxnType:        biz.InventoryTxnOut,
			Direction:      -1,
			Quantity:       item.Quantity,
			UnitID:         item.UnitID,
			SourceType:     biz.PurchaseReturnSourceType,
			SourceID:       &sourceID,
			SourceLineID:   &sourceLineID,
			IdempotencyKey: biz.PurchaseReturnOutboundIdempotencyKey(purchaseReturn.ID, item.ID),
			OccurredAt:     purchaseReturn.ReturnedAt,
		})
		if err != nil {
			return nil, err
		}
	}
	now := time.Now()
	if err := updatePurchaseReturnPosted(ctx, tx, purchaseReturn.ID, now); err != nil {
		return nil, err
	}
	purchaseReturn, err = tx.client.PurchaseReturn.Get(ctx, purchaseReturn.ID)
	if err != nil {
		return nil, err
	}
	out, err := purchaseReturnWithItems(ctx, tx.client, purchaseReturn)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *inventoryRepo) CancelPostedPurchaseReturn(ctx context.Context, returnID int) (*biz.PurchaseReturn, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockPurchaseReturn(ctx, tx, returnID); err != nil {
		return nil, err
	}
	purchaseReturn, err := tx.client.PurchaseReturn.Get(ctx, returnID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReturnNotFound
		}
		return nil, err
	}
	transition, ok := corestatus.CancelPurchaseReturn(purchaseReturn.Status)
	if !ok {
		return nil, biz.ErrBadParam
	}
	if !transition.Changed {
		out, err := purchaseReturnWithItems(ctx, tx.client, purchaseReturn)
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return out, nil
	}
	if purchaseReturn.PurchaseReceiptID != nil {
		if err := lockPurchaseReceipt(ctx, tx, *purchaseReturn.PurchaseReceiptID); err != nil {
			return nil, err
		}
		hasActivePayable, err := hasActiveFinanceFactForSource(ctx, tx.client, biz.FinanceFactPayable, biz.PurchaseReceiptSourceType, *purchaseReturn.PurchaseReceiptID)
		if err != nil {
			return nil, err
		}
		if hasActivePayable {
			return nil, biz.ErrPurchaseReceiptFinanceDependency
		}
	}

	items, err := tx.client.PurchaseReturnItem.Query().
		Where(purchasereturnitem.ReturnID(purchaseReturn.ID)).
		Order(ent.Asc(purchasereturnitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		original, err := tx.client.InventoryTxn.Query().
			Where(inventorytxn.IdempotencyKey(biz.PurchaseReturnOutboundIdempotencyKey(purchaseReturn.ID, item.ID))).
			Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrInventoryTxnNotFound
			}
			return nil, err
		}
		sourceID := purchaseReturn.ID
		sourceLineID := item.ID
		reversalOf := original.ID
		_, err = r.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, &biz.InventoryTxnCreate{
			SubjectType:     original.SubjectType,
			SubjectID:       original.SubjectID,
			WarehouseID:     original.WarehouseID,
			LotID:           original.LotID,
			TxnType:         biz.InventoryTxnReversal,
			Direction:       -original.Direction,
			Quantity:        original.Quantity,
			UnitID:          original.UnitID,
			SourceType:      biz.PurchaseReturnSourceType,
			SourceID:        &sourceID,
			SourceLineID:    &sourceLineID,
			IdempotencyKey:  biz.PurchaseReturnReversalIdempotencyKey(purchaseReturn.ID, item.ID),
			ReversalOfTxnID: &reversalOf,
			OccurredAt:      time.Now(),
		})
		if err != nil {
			return nil, err
		}
	}
	if err := updatePurchaseReturnCancelled(ctx, tx, purchaseReturn.ID); err != nil {
		return nil, err
	}
	purchaseReturn, err = tx.client.PurchaseReturn.Get(ctx, purchaseReturn.ID)
	if err != nil {
		return nil, err
	}
	out, err := purchaseReturnWithItems(ctx, tx.client, purchaseReturn)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *inventoryRepo) GetPurchaseReturn(ctx context.Context, id int) (*biz.PurchaseReturn, error) {
	purchaseReturn, err := r.data.postgres.PurchaseReturn.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReturnNotFound
		}
		return nil, err
	}
	return purchaseReturnWithItems(ctx, r.data.postgres, purchaseReturn)
}

func (r *inventoryRepo) ListPurchaseReturns(ctx context.Context, filter biz.PurchaseReturnFilter) ([]*biz.PurchaseReturn, int, error) {
	query := r.data.postgres.PurchaseReturn.Query()
	if filter.Status != "" {
		query = query.Where(purchasereturn.Status(filter.Status))
	}
	if filter.Keyword != "" {
		query = query.Where(purchasereturn.Or(
			purchasereturn.ReturnNoContainsFold(filter.Keyword),
			purchasereturn.SupplierNameContainsFold(filter.Keyword),
		))
	}
	if filter.SupplierName != "" {
		query = query.Where(purchasereturn.SupplierNameContainsFold(filter.SupplierName))
	}
	if filter.PurchaseReceiptID > 0 {
		query = query.Where(purchasereturn.PurchaseReceiptID(filter.PurchaseReceiptID))
	}
	if filter.QualityInspectionID > 0 {
		query = query.Where(purchasereturn.QualityInspectionID(filter.QualityInspectionID))
	}
	if filter.DateFrom != nil {
		query = query.Where(purchasereturn.ReturnedAtGTE(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		query = query.Where(purchasereturn.ReturnedAtLTE(endOfDateFilter(*filter.DateTo)))
	}
	itemPredicates := []predicate.PurchaseReturnItem{}
	if filter.MaterialID > 0 {
		itemPredicates = append(itemPredicates, purchasereturnitem.MaterialID(filter.MaterialID))
	}
	if filter.WarehouseID > 0 {
		itemPredicates = append(itemPredicates, purchasereturnitem.WarehouseID(filter.WarehouseID))
	}
	if filter.LotID > 0 {
		itemPredicates = append(itemPredicates, purchasereturnitem.LotID(filter.LotID))
	}
	if len(itemPredicates) > 0 {
		query = query.Where(purchasereturn.HasItemsWith(itemPredicates...))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.
		Order(ent.Desc(purchasereturn.FieldReturnedAt), ent.Desc(purchasereturn.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.PurchaseReturn, 0, len(rows))
	for _, row := range rows {
		item, err := purchaseReturnWithItems(ctx, r.data.postgres, row)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, item)
	}
	return out, total, nil
}

func resolvePurchaseReturnReplay(ctx context.Context, client *ent.Client, in *biz.PurchaseReturnCreate) (*biz.PurchaseReturn, bool, error) {
	if client == nil || in == nil || in.IdempotencyKey == "" || in.IdempotencyPayloadHash == "" {
		return nil, false, biz.ErrBadParam
	}
	row, err := client.PurchaseReturn.Query().
		Where(purchasereturn.IdempotencyKey(in.IdempotencyKey)).
		Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.IdempotencyPayloadHash == nil || *row.IdempotencyPayloadHash != in.IdempotencyPayloadHash {
		return nil, true, biz.ErrIdempotencyConflict
	}
	if row.IdempotencyItemCount == nil || *row.IdempotencyItemCount <= 0 {
		return nil, true, fmt.Errorf("purchase return %d idempotency result boundary is missing", row.ID)
	}
	items, err := client.PurchaseReturnItem.Query().
		Where(purchasereturnitem.ReturnID(row.ID)).
		Order(ent.Asc(purchasereturnitem.FieldID)).
		Limit(*row.IdempotencyItemCount).
		All(ctx)
	if err != nil {
		return nil, true, err
	}
	if len(items) != *row.IdempotencyItemCount {
		return nil, true, fmt.Errorf("purchase return %d idempotency result item set is incomplete", row.ID)
	}
	return entPurchaseReturnToBiz(row, items), true, nil
}

func validatePurchaseReturnItemReferences(ctx context.Context, client *ent.Client, returnReceiptID *int, in *biz.PurchaseReturnItemCreate) error {
	if _, err := client.Material.Get(ctx, in.MaterialID); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrBadParam
		}
		return err
	}
	if _, err := client.Warehouse.Get(ctx, in.WarehouseID); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrBadParam
		}
		return err
	}
	if _, err := client.Unit.Get(ctx, in.UnitID); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrBadParam
		}
		return err
	}
	if in.LotID != nil {
		lot, err := client.InventoryLot.Get(ctx, *in.LotID)
		if err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrInventoryLotNotFound
			}
			return err
		}
		if lot.SubjectType != biz.InventorySubjectMaterial || lot.SubjectID != in.MaterialID {
			return biz.ErrBadParam
		}
	}
	if in.PurchaseReceiptItemID == nil {
		return nil
	}
	receiptItem, err := client.PurchaseReceiptItem.Get(ctx, *in.PurchaseReceiptItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrPurchaseReceiptItemNotFound
		}
		return err
	}
	if returnReceiptID != nil && receiptItem.ReceiptID != *returnReceiptID {
		return biz.ErrBadParam
	}
	receipt, err := client.PurchaseReceipt.Get(ctx, receiptItem.ReceiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrPurchaseReceiptNotFound
		}
		return err
	}
	if !corestatus.IsPurchaseReceiptPosted(receipt.Status) ||
		receiptItem.MaterialID != in.MaterialID ||
		receiptItem.WarehouseID != in.WarehouseID ||
		receiptItem.UnitID != in.UnitID ||
		!sameOptionalInt(receiptItem.LotID, in.LotID) {
		return biz.ErrBadParam
	}
	return nil
}

func validatePurchaseReturnReceiptItemQuantities(ctx context.Context, tx *inventoryDBTx, returnID int, items []*ent.PurchaseReturnItem) error {
	currentByReceiptItem := make(map[int]decimal.Decimal)
	for _, item := range items {
		if item.PurchaseReceiptItemID == nil {
			continue
		}
		receiptItemID := *item.PurchaseReceiptItemID
		currentByReceiptItem[receiptItemID] = currentByReceiptItem[receiptItemID].Add(item.Quantity)
	}
	if len(currentByReceiptItem) == 0 {
		return nil
	}

	receiptItemIDs := make([]int, 0, len(currentByReceiptItem))
	for receiptItemID := range currentByReceiptItem {
		receiptItemIDs = append(receiptItemIDs, receiptItemID)
	}
	sort.Ints(receiptItemIDs)
	if err := lockPurchaseReceiptItems(ctx, tx, receiptItemIDs); err != nil {
		return err
	}

	for _, receiptItemID := range receiptItemIDs {
		effectiveQty, err := effectivePurchaseReceiptItemQuantity(ctx, tx.client, receiptItemID, 0, decimal.Zero)
		if err != nil {
			return err
		}
		alreadyReturned, err := postedPurchaseReturnQuantityByReceiptItem(ctx, tx.client, returnID, receiptItemID)
		if err != nil {
			return err
		}
		if alreadyReturned.Add(currentByReceiptItem[receiptItemID]).Cmp(effectiveQty) > 0 {
			return biz.ErrBadParam
		}
	}
	return nil
}

func lockPurchaseReceiptItems(ctx context.Context, tx *inventoryDBTx, receiptItemIDs []int) error {
	if tx.dialect != dialect.Postgres || len(receiptItemIDs) == 0 {
		return nil
	}
	placeholders := inventorySQLPlaceholders(tx.dialect, len(receiptItemIDs))
	args := make([]any, 0, len(receiptItemIDs))
	for _, id := range receiptItemIDs {
		args = append(args, id)
	}
	query := fmt.Sprintf(
		`SELECT id FROM purchase_receipt_items WHERE id IN (%s) ORDER BY id FOR UPDATE`,
		strings.Join(placeholders, ", "),
	)
	rows, err := tx.sqlTx.QueryContext(ctx, query, args...)
	if err != nil {
		return err
	}
	defer func() {
		_ = rows.Close()
	}()

	locked := 0
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return err
		}
		locked++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if locked != len(receiptItemIDs) {
		return biz.ErrPurchaseReceiptItemNotFound
	}
	return nil
}

func entPurchaseReturnItemToCreate(row *ent.PurchaseReturnItem) *biz.PurchaseReturnItemCreate {
	if row == nil {
		return nil
	}
	return &biz.PurchaseReturnItemCreate{
		ReturnID:              row.ReturnID,
		PurchaseReceiptItemID: row.PurchaseReceiptItemID,
		MaterialID:            row.MaterialID,
		WarehouseID:           row.WarehouseID,
		UnitID:                row.UnitID,
		LotID:                 row.LotID,
		Quantity:              row.Quantity,
		UnitPrice:             row.UnitPrice,
		Amount:                row.Amount,
		SourceLineNo:          row.SourceLineNo,
		Note:                  row.Note,
	}
}

func updatePurchaseReturnPosted(ctx context.Context, tx *inventoryDBTx, returnID int, postedAt time.Time) error {
	p := inventorySQLPlaceholders(tx.dialect, 4)
	query := fmt.Sprintf(`UPDATE purchase_returns SET status = %s, posted_at = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2], p[3])
	_, err := tx.sqlTx.ExecContext(ctx, query, biz.PurchaseReturnStatusPosted, postedAt, time.Now(), returnID)
	return err
}

func updatePurchaseReturnCancelled(ctx context.Context, tx *inventoryDBTx, returnID int) error {
	p := inventorySQLPlaceholders(tx.dialect, 3)
	query := fmt.Sprintf(`UPDATE purchase_returns SET status = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2])
	_, err := tx.sqlTx.ExecContext(ctx, query, biz.PurchaseReturnStatusCancelled, time.Now(), returnID)
	return err
}

func lockPurchaseReturn(ctx context.Context, tx *inventoryDBTx, returnID int) error {
	if tx.dialect != dialect.Postgres {
		return nil
	}
	var id int
	if err := tx.sqlTx.QueryRowContext(ctx, `SELECT id FROM purchase_returns WHERE id = $1 FOR UPDATE`, returnID).Scan(&id); err != nil {
		if errors.Is(err, stdsql.ErrNoRows) {
			return biz.ErrPurchaseReturnNotFound
		}
		return err
	}
	return nil
}

func purchaseReturnWithItems(ctx context.Context, client *ent.Client, purchaseReturn *ent.PurchaseReturn) (*biz.PurchaseReturn, error) {
	items, err := client.PurchaseReturnItem.Query().
		Where(purchasereturnitem.ReturnID(purchaseReturn.ID)).
		Order(ent.Asc(purchasereturnitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	return entPurchaseReturnToBiz(purchaseReturn, items), nil
}

func entPurchaseReturnToBiz(row *ent.PurchaseReturn, items []*ent.PurchaseReturnItem) *biz.PurchaseReturn {
	if row == nil {
		return nil
	}
	out := &biz.PurchaseReturn{
		ID:                  row.ID,
		ReturnNo:            row.ReturnNo,
		PurchaseReceiptID:   row.PurchaseReceiptID,
		QualityInspectionID: row.QualityInspectionID,
		SupplierName:        row.SupplierName,
		ReturnReason:        row.ReturnReason,
		Status:              row.Status,
		ReturnedAt:          row.ReturnedAt,
		PostedAt:            row.PostedAt,
		Note:                row.Note,
		CreatedAt:           row.CreatedAt,
		UpdatedAt:           row.UpdatedAt,
	}
	if len(items) > 0 {
		out.Items = make([]*biz.PurchaseReturnItem, 0, len(items))
		for _, item := range items {
			out.Items = append(out.Items, entPurchaseReturnItemToBiz(item))
		}
	}
	return out
}

func entPurchaseReturnItemToBiz(row *ent.PurchaseReturnItem) *biz.PurchaseReturnItem {
	if row == nil {
		return nil
	}
	return &biz.PurchaseReturnItem{
		ID:                    row.ID,
		ReturnID:              row.ReturnID,
		PurchaseReceiptItemID: row.PurchaseReceiptItemID,
		MaterialID:            row.MaterialID,
		WarehouseID:           row.WarehouseID,
		UnitID:                row.UnitID,
		LotID:                 row.LotID,
		Quantity:              row.Quantity,
		UnitPrice:             row.UnitPrice,
		Amount:                row.Amount,
		SourceLineNo:          row.SourceLineNo,
		Note:                  row.Note,
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}
}
