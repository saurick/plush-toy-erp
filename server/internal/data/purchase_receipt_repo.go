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
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/inventorylot"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptadjustment"
	"server/internal/data/model/ent/purchasereceiptadjustmentitem"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/qualityinspection"

	"entgo.io/ent/dialect"
	"github.com/shopspring/decimal"
)

func (r *inventoryRepo) CreatePurchaseReceiptDraft(ctx context.Context, in *biz.PurchaseReceiptCreate) (*biz.PurchaseReceipt, error) {
	row, err := r.data.postgres.PurchaseReceipt.Create().
		SetReceiptNo(in.ReceiptNo).
		SetSupplierName(in.SupplierName).
		SetStatus(biz.PurchaseReceiptStatusDraft).
		SetReceivedAt(in.ReceivedAt).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entPurchaseReceiptToBiz(row, nil), nil
}

func (r *inventoryRepo) CreatePurchaseReceiptWithItems(ctx context.Context, in *biz.PurchaseReceiptCreate, items []*biz.PurchaseReceiptItemCreate) (*biz.PurchaseReceipt, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	receipt, err := tx.client.PurchaseReceipt.Create().
		SetReceiptNo(in.ReceiptNo).
		SetSupplierName(in.SupplierName).
		SetStatus(biz.PurchaseReceiptStatusDraft).
		SetReceivedAt(in.ReceivedAt).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	for index, item := range items {
		nextItem := *item
		nextItem.ReceiptID = receipt.ID
		if _, _, err := createPreparedPurchaseReceiptItem(ctx, tx, receipt, &nextItem, index+1); err != nil {
			return nil, err
		}
	}
	out, err := purchaseReceiptWithItems(ctx, tx.client, receipt)
	if err != nil {
		return nil, err
	}
	out.QualityInspections, err = purchaseReceiptIncomingQualityInspections(ctx, tx.client, receipt.ID)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *inventoryRepo) ResolvePurchaseReceiptFromPurchaseOrderReplay(ctx context.Context, in *biz.PurchaseReceiptFromPurchaseOrderCreate) (*biz.PurchaseReceipt, bool, error) {
	if r == nil || r.data == nil || r.data.postgres == nil || in == nil || in.IdempotencyKey == "" || in.IdempotencyPayloadHash == "" {
		return nil, false, biz.ErrBadParam
	}
	return resolvePurchaseReceiptFromPurchaseOrderReplay(ctx, r.data.postgres, in)
}

// ValidatePurchaseReceiptFromPurchaseOrder is the read-only preflight used by
// Process Runtime before it binds an immutable command fingerprint. The create
// transaction repeats every check under locks and remains the final authority.
func (r *inventoryRepo) ValidatePurchaseReceiptFromPurchaseOrder(ctx context.Context, in *biz.PurchaseReceiptFromPurchaseOrderCreate) error {
	if r == nil || r.data == nil || r.data.postgres == nil || in == nil {
		return biz.ErrBadParam
	}
	exists, err := r.data.postgres.PurchaseReceipt.Query().Where(purchasereceipt.ReceiptNo(in.ReceiptNo)).Exist(ctx)
	if err != nil {
		return err
	}
	if exists {
		return biz.ErrIdempotencyConflict
	}
	order, err := r.data.postgres.PurchaseOrder.Get(ctx, in.PurchaseOrderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrPurchaseOrderNotFound
		}
		return err
	}
	if order.LifecycleStatus != biz.PurchaseOrderStatusApproved || supplierNameFromSnapshot(order.SupplierSnapshot) == "" {
		return biz.ErrBadParam
	}
	if _, err := r.data.postgres.Warehouse.Get(ctx, in.WarehouseID); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrBadParam
		}
		return err
	}
	items, err := r.data.postgres.PurchaseOrderItem.Query().Where(
		purchaseorderitem.PurchaseOrderID(order.ID),
		purchaseorderitem.LineStatus(biz.PurchaseOrderItemStatusOpen),
	).All(ctx)
	if err != nil {
		return err
	}
	if len(items) == 0 {
		return biz.ErrBadParam
	}
	remainingByItemID, err := purchaseOrderItemRemainingQuantities(ctx, r.data.postgres, items)
	if err != nil {
		return err
	}
	for _, item := range items {
		if remainingByItemID[item.ID].IsPositive() {
			return nil
		}
	}
	return biz.ErrBadParam
}

func (r *inventoryRepo) CreatePurchaseReceiptFromPurchaseOrder(ctx context.Context, in *biz.PurchaseReceiptFromPurchaseOrderCreate) (*biz.PurchaseReceipt, error) {
	return r.createPurchaseReceiptFromPurchaseOrder(ctx, in, nil, 0)
}

func (r *inventoryRepo) CreatePurchaseReceiptFromPurchaseOrderForProcessCommand(
	ctx context.Context,
	in *biz.PurchaseReceiptFromPurchaseOrderCreate,
	command *biz.ProcessDomainCommandInput,
	actorID int,
) (*biz.PurchaseReceipt, error) {
	if command == nil {
		return nil, biz.ErrBadParam
	}
	return r.createPurchaseReceiptFromPurchaseOrder(ctx, in, command, actorID)
}

func (r *inventoryRepo) createPurchaseReceiptFromPurchaseOrder(
	ctx context.Context,
	in *biz.PurchaseReceiptFromPurchaseOrderCreate,
	command *biz.ProcessDomainCommandInput,
	actorID int,
) (*biz.PurchaseReceipt, error) {
	if in == nil {
		return nil, biz.ErrBadParam
	}
	if command == nil && in.IdempotencyKey != "" {
		if replayed, found, err := resolvePurchaseReceiptFromPurchaseOrderReplay(ctx, r.data.postgres, in); err != nil {
			return nil, err
		} else if found {
			return replayed, nil
		}
	}
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	// Serialize automatic draft generation for one purchase order. Draft lines
	// reserve the remaining quantity, so two generators must not both read the
	// same pre-draft snapshot.
	if err := lockPurchaseOrderForReceipt(ctx, tx, in.PurchaseOrderID); err != nil {
		return nil, err
	}
	if in.IdempotencyKey != "" {
		if replayed, found, err := resolvePurchaseReceiptFromPurchaseOrderReplay(ctx, tx.client, in); err != nil {
			return nil, err
		} else if found {
			if command != nil {
				if err := recordPurchaseReceiptProcessCommandResultInTx(ctx, tx, replayed, command, actorID); err != nil {
					return nil, err
				}
				if err := tx.sqlTx.Commit(); err != nil {
					return nil, err
				}
				tx = nil
			}
			return replayed, nil
		}
	}

	order, err := tx.client.PurchaseOrder.Query().
		Where(purchaseorder.ID(in.PurchaseOrderID)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseOrderNotFound
		}
		return nil, err
	}
	if order.LifecycleStatus != biz.PurchaseOrderStatusApproved {
		return nil, biz.ErrBadParam
	}
	warehouseRow, err := tx.client.Warehouse.Get(ctx, in.WarehouseID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBadParam
		}
		return nil, err
	}
	if !warehouseRow.IsActive {
		return nil, biz.ErrWarehouseInactive
	}

	orderItems, err := tx.client.PurchaseOrderItem.Query().
		Where(
			purchaseorderitem.PurchaseOrderID(order.ID),
			purchaseorderitem.LineStatus(biz.PurchaseOrderItemStatusOpen),
		).
		Order(ent.Asc(purchaseorderitem.FieldLineNo), ent.Asc(purchaseorderitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(orderItems) == 0 {
		return nil, biz.ErrBadParam
	}
	orderItemIDs := make([]int, 0, len(orderItems))
	for _, item := range orderItems {
		orderItemIDs = append(orderItemIDs, item.ID)
	}
	if err := lockPurchaseOrderItems(ctx, tx, orderItemIDs); err != nil {
		return nil, err
	}
	orderItems, err = tx.client.PurchaseOrderItem.Query().
		Where(
			purchaseorderitem.IDIn(orderItemIDs...),
			purchaseorderitem.PurchaseOrderID(order.ID),
			purchaseorderitem.LineStatus(biz.PurchaseOrderItemStatusOpen),
		).
		Order(ent.Asc(purchaseorderitem.FieldLineNo), ent.Asc(purchaseorderitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(orderItems) != len(orderItemIDs) {
		return nil, biz.ErrBadParam
	}
	remainingByItemID, err := purchaseOrderItemRemainingQuantities(ctx, tx.client, orderItems)
	if err != nil {
		return nil, err
	}
	plannedLineCount := 0
	for _, item := range orderItems {
		if remainingByItemID[item.ID].IsPositive() {
			plannedLineCount++
		}
	}
	if plannedLineCount == 0 {
		return nil, biz.ErrBadParam
	}

	supplierName := supplierNameFromSnapshot(order.SupplierSnapshot)
	if supplierName == "" {
		return nil, biz.ErrBadParam
	}
	receiptCreate := tx.client.PurchaseReceipt.Create().
		SetReceiptNo(in.ReceiptNo).
		SetSupplierName(supplierName).
		SetStatus(biz.PurchaseReceiptStatusDraft).
		SetReceivedAt(in.ReceivedAt).
		SetNillableNote(in.Note)
	if in.IdempotencyKey != "" {
		receiptCreate.
			SetIdempotencyKey(in.IdempotencyKey).
			SetIdempotencyPayloadHash(in.IdempotencyPayloadHash).
			SetIdempotencyItemCount(plannedLineCount)
	}
	receipt, err := receiptCreate.Save(ctx)
	if err != nil {
		if in.IdempotencyKey != "" {
			originalErr := err
			if rollbackErr := tx.sqlTx.Rollback(); rollbackErr != nil && !errors.Is(rollbackErr, stdsql.ErrTxDone) {
				r.log.WithContext(ctx).Warnf("rollback purchase receipt idempotency conflict failed err=%v", rollbackErr)
			}
			tx = nil
			if replayed, found, replayErr := resolvePurchaseReceiptFromPurchaseOrderReplay(ctx, r.data.postgres, in); replayErr != nil {
				return nil, replayErr
			} else if found {
				if command != nil {
					return r.createPurchaseReceiptFromPurchaseOrder(ctx, in, command, actorID)
				}
				return replayed, nil
			}
			return nil, originalErr
		}
		return nil, err
	}

	createdLineCount := 0
	for _, item := range orderItems {
		remaining := remainingByItemID[item.ID]
		if !remaining.IsPositive() {
			continue
		}
		unitPrice, amount := purchaseReceiptPriceAndAmount(item, remaining)
		orderItemID := item.ID
		sourceLineNo := fmt.Sprintf("%d", item.LineNo)
		if _, _, err := createPreparedPurchaseReceiptItem(ctx, tx, receipt, &biz.PurchaseReceiptItemCreate{
			ReceiptID:           receipt.ID,
			MaterialID:          item.MaterialID,
			WarehouseID:         in.WarehouseID,
			UnitID:              item.UnitID,
			PurchaseOrderItemID: &orderItemID,
			Quantity:            remaining,
			UnitPrice:           unitPrice,
			Amount:              amount,
			SourceLineNo:        &sourceLineNo,
			Note:                item.Note,
		}, createdLineCount+1); err != nil {
			return nil, err
		}
		createdLineCount++
	}
	if createdLineCount != plannedLineCount {
		return nil, fmt.Errorf("purchase receipt planned line count %d does not match created line count %d", plannedLineCount, createdLineCount)
	}

	out, err := purchaseReceiptWithItems(ctx, tx.client, receipt)
	if err != nil {
		return nil, err
	}
	out.QualityInspections, err = purchaseReceiptIncomingQualityInspections(ctx, tx.client, receipt.ID)
	if err != nil {
		return nil, err
	}
	if command != nil {
		if err := recordPurchaseReceiptProcessCommandResultInTx(ctx, tx, out, command, actorID); err != nil {
			return nil, err
		}
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func recordPurchaseReceiptProcessCommandResultInTx(
	ctx context.Context,
	tx *inventoryDBTx,
	receipt *biz.PurchaseReceipt,
	command *biz.ProcessDomainCommandInput,
	actorID int,
) error {
	if tx == nil || tx.client == nil || command == nil {
		return biz.ErrBadParam
	}
	result, err := biz.PurchaseReceiptProcessCommandResult(receipt)
	if err != nil {
		return err
	}
	record, err := biz.BuildProcessNodeDomainCommandResultRecord(command, result)
	if err != nil {
		return err
	}
	_, err = recordProcessNodeDomainCommandResultWithClient(ctx, tx.client, record, actorID)
	return err
}

func (r *inventoryRepo) AddPurchaseReceiptItem(ctx context.Context, in *biz.PurchaseReceiptItemCreate) (*biz.PurchaseReceiptItem, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockPurchaseReceipt(ctx, tx, in.ReceiptID); err != nil {
		return nil, err
	}
	receipt, err := tx.client.PurchaseReceipt.Get(ctx, in.ReceiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	if !corestatus.CanAddPurchaseReceiptItem(receipt.Status) {
		return nil, biz.ErrBadParam
	}
	sequence, err := tx.client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(receipt.ID)).Count(ctx)
	if err != nil {
		return nil, err
	}
	row, _, err := createPreparedPurchaseReceiptItem(ctx, tx, receipt, in, sequence+1)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entPurchaseReceiptItemToBiz(row), nil
}

func (r *inventoryRepo) PostPurchaseReceipt(ctx context.Context, receiptID int) (*biz.PurchaseReceipt, error) {
	return r.postPurchaseReceipt(ctx, receiptID, nil, nil, 0)
}

func (r *inventoryRepo) PostPurchaseReceiptForProcessCommand(
	ctx context.Context,
	receiptID int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.PurchaseReceipt, error) {
	if command == nil || result == nil {
		return nil, biz.ErrBadParam
	}
	return r.postPurchaseReceipt(ctx, receiptID, command, result, actorID)
}

func (r *inventoryRepo) postPurchaseReceipt(
	ctx context.Context,
	receiptID int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.PurchaseReceipt, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockPurchaseReceipt(ctx, tx, receiptID); err != nil {
		return nil, err
	}
	receipt, err := tx.client.PurchaseReceipt.Get(ctx, receiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	transition, ok := corestatus.PostPurchaseReceipt(receipt.Status)
	if !ok {
		return nil, biz.ErrBadParam
	}
	if !transition.Changed {
		out, err := purchaseReceiptWithItems(ctx, tx.client, receipt)
		if err != nil {
			return nil, err
		}
		if command != nil {
			if err := verifyPurchaseReceiptInboundEvidence(ctx, tx, receipt); err != nil {
				return nil, err
			}
			if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, result, actorID); err != nil {
				return nil, err
			}
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return out, nil
	}

	items, err := tx.client.PurchaseReceiptItem.Query().
		Where(purchasereceiptitem.ReceiptID(receipt.ID)).
		Order(ent.Asc(purchasereceiptitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, biz.ErrBadParam
	}
	if err := validatePurchaseOrderReceiptQuantities(ctx, tx, receipt.ID, items); err != nil {
		return nil, err
	}
	qualityGate, err := evaluatePurchaseReceiptQualityGateInTx(ctx, tx, receipt, items, true)
	if err != nil {
		return nil, err
	}
	switch qualityGate.Outcome {
	case biz.PurchaseReceiptQualityGatePending:
		return nil, biz.ErrPurchaseReceiptQualityPending
	case biz.PurchaseReceiptQualityGateRejected:
		return nil, biz.ErrPurchaseReceiptQualityRejected
	case biz.PurchaseReceiptQualityGateReady:
	default:
		return nil, biz.ErrBadParam
	}
	for _, item := range items {
		lotID := item.LotID
		sourceID := receipt.ID
		sourceLineID := item.ID
		_, err = r.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, &biz.InventoryTxnCreate{
			SubjectType:    biz.InventorySubjectMaterial,
			SubjectID:      item.MaterialID,
			WarehouseID:    item.WarehouseID,
			LotID:          lotID,
			TxnType:        biz.InventoryTxnIn,
			Direction:      1,
			Quantity:       item.Quantity,
			UnitID:         item.UnitID,
			SourceType:     biz.PurchaseReceiptSourceType,
			SourceID:       &sourceID,
			SourceLineID:   &sourceLineID,
			IdempotencyKey: biz.PurchaseReceiptInboundIdempotencyKey(receipt.ID, item.ID),
			OccurredAt:     receipt.ReceivedAt,
		})
		if err != nil {
			return nil, err
		}
	}
	now := time.Now()
	if err := updatePurchaseReceiptPosted(ctx, tx, receipt.ID, now); err != nil {
		return nil, err
	}
	receipt, err = tx.client.PurchaseReceipt.Get(ctx, receipt.ID)
	if err != nil {
		return nil, err
	}
	out, err := purchaseReceiptWithItems(ctx, tx.client, receipt)
	if err != nil {
		return nil, err
	}
	if command != nil {
		if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, result, actorID); err != nil {
			return nil, err
		}
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func recordProcessDomainCommandResultInInventoryTx(
	ctx context.Context,
	tx *inventoryDBTx,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) error {
	if tx == nil || tx.client == nil || command == nil || result == nil {
		return biz.ErrBadParam
	}
	record, err := biz.BuildProcessNodeDomainCommandResultRecord(command, result)
	if err != nil {
		return err
	}
	_, err = recordProcessNodeDomainCommandResultWithClient(ctx, tx.client, record, actorID)
	return err
}

func verifyPurchaseReceiptInboundEvidence(ctx context.Context, tx *inventoryDBTx, receipt *ent.PurchaseReceipt) error {
	if tx == nil || tx.client == nil || receipt == nil || receipt.Status != biz.PurchaseReceiptStatusPosted {
		return biz.ErrProcessDomainCommandRecoveryRequired
	}
	items, err := tx.client.PurchaseReceiptItem.Query().
		Where(purchasereceiptitem.ReceiptID(receipt.ID)).
		Order(ent.Asc(purchasereceiptitem.FieldID)).
		All(ctx)
	if err != nil {
		return err
	}
	if len(items) == 0 {
		return biz.ErrProcessDomainCommandRecoveryRequired
	}
	for _, item := range items {
		row, err := tx.client.InventoryTxn.Query().
			Where(inventorytxn.IdempotencyKey(biz.PurchaseReceiptInboundIdempotencyKey(receipt.ID, item.ID))).
			Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrProcessDomainCommandRecoveryRequired
			}
			return err
		}
		sourceID := receipt.ID
		sourceLineID := item.ID
		expected := &biz.InventoryTxnCreate{
			SubjectType:    biz.InventorySubjectMaterial,
			SubjectID:      item.MaterialID,
			WarehouseID:    item.WarehouseID,
			LotID:          item.LotID,
			TxnType:        biz.InventoryTxnIn,
			Direction:      1,
			Quantity:       item.Quantity,
			UnitID:         item.UnitID,
			SourceType:     biz.PurchaseReceiptSourceType,
			SourceID:       &sourceID,
			SourceLineID:   &sourceLineID,
			IdempotencyKey: biz.PurchaseReceiptInboundIdempotencyKey(receipt.ID, item.ID),
			OccurredAt:     receipt.ReceivedAt,
		}
		if !inventoryTxnMatchesCreate(row, expected) {
			return biz.ErrIdempotencyConflict
		}
	}
	return nil
}

func (r *inventoryRepo) CancelPostedPurchaseReceipt(ctx context.Context, receiptID int) (*biz.PurchaseReceipt, error) {
	return r.cancelPostedPurchaseReceipt(ctx, receiptID, 0)
}

func (r *inventoryRepo) CancelPostedPurchaseReceiptWithActor(ctx context.Context, receiptID int, actorID int) (*biz.PurchaseReceipt, error) {
	if actorID <= 0 {
		return nil, biz.ErrBadParam
	}
	return r.cancelPostedPurchaseReceipt(ctx, receiptID, actorID)
}

func (r *inventoryRepo) cancelPostedPurchaseReceipt(ctx context.Context, receiptID int, actorID int) (*biz.PurchaseReceipt, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockPurchaseReceipt(ctx, tx, receiptID); err != nil {
		return nil, err
	}
	receipt, err := tx.client.PurchaseReceipt.Get(ctx, receiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	transition, ok := corestatus.CancelPurchaseReceipt(receipt.Status)
	if !ok {
		return nil, biz.ErrBadParam
	}
	if !transition.Changed {
		out, err := purchaseReceiptWithItems(ctx, tx.client, receipt)
		if err != nil {
			return nil, err
		}
		if err := markProcessDomainCommandEffectCompensatedWithClient(
			ctx,
			tx.client,
			biz.ProcessDomainCommandInventoryPostInbound,
			"purchase_receipt",
			receipt.ID,
			"采购收货已取消并完成库存冲正，原入库流程结果需要核对",
			actorID,
		); err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return out, nil
	}
	hasPostedAdjustment, err := tx.client.PurchaseReceiptAdjustment.Query().
		Where(
			purchasereceiptadjustment.PurchaseReceiptID(receipt.ID),
			purchasereceiptadjustment.Status(biz.PurchaseReceiptAdjustmentStatusPosted),
		).
		Exist(ctx)
	if err != nil {
		return nil, err
	}
	if hasPostedAdjustment {
		return nil, biz.ErrBadParam
	}
	items, err := tx.client.PurchaseReceiptItem.Query().
		Where(purchasereceiptitem.ReceiptID(receipt.ID)).
		Order(ent.Asc(purchasereceiptitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range items {
		original, err := tx.client.InventoryTxn.Query().
			Where(inventorytxn.IdempotencyKey(biz.PurchaseReceiptInboundIdempotencyKey(receipt.ID, item.ID))).
			Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrInventoryTxnNotFound
			}
			return nil, err
		}
		sourceID := receipt.ID
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
			SourceType:      biz.PurchaseReceiptSourceType,
			SourceID:        &sourceID,
			SourceLineID:    &sourceLineID,
			IdempotencyKey:  biz.PurchaseReceiptReversalIdempotencyKey(receipt.ID, item.ID),
			ReversalOfTxnID: &reversalOf,
			OccurredAt:      time.Now(),
		})
		if err != nil {
			return nil, err
		}
	}
	if err := updatePurchaseReceiptCancelled(ctx, tx, receipt.ID); err != nil {
		return nil, err
	}
	receipt, err = tx.client.PurchaseReceipt.Get(ctx, receipt.ID)
	if err != nil {
		return nil, err
	}
	out, err := purchaseReceiptWithItems(ctx, tx.client, receipt)
	if err != nil {
		return nil, err
	}
	if err := markProcessDomainCommandEffectCompensatedWithClient(
		ctx,
		tx.client,
		biz.ProcessDomainCommandInventoryPostInbound,
		"purchase_receipt",
		receipt.ID,
		"采购收货已取消并完成库存冲正，原入库流程结果需要核对",
		actorID,
	); err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *inventoryRepo) GetPurchaseReceipt(ctx context.Context, id int) (*biz.PurchaseReceipt, error) {
	receipt, err := r.data.postgres.PurchaseReceipt.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	return purchaseReceiptWithItems(ctx, r.data.postgres, receipt)
}

func (r *inventoryRepo) ListPurchaseReceipts(ctx context.Context, filter biz.PurchaseReceiptFilter) ([]*biz.PurchaseReceipt, int, error) {
	query := r.data.postgres.PurchaseReceipt.Query()
	if filter.Status != "" {
		query = query.Where(purchasereceipt.Status(filter.Status))
	}
	if filter.Keyword != "" {
		query = query.Where(purchasereceipt.Or(
			purchasereceipt.ReceiptNoContainsFold(filter.Keyword),
			purchasereceipt.SupplierNameContainsFold(filter.Keyword),
		))
	}
	if filter.SupplierName != "" {
		query = query.Where(purchasereceipt.SupplierNameContainsFold(filter.SupplierName))
	}
	if filter.DateFrom != nil {
		query = query.Where(purchasereceipt.ReceivedAtGTE(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		query = query.Where(purchasereceipt.ReceivedAtLTE(endOfDateFilter(*filter.DateTo)))
	}
	itemPredicates := []predicate.PurchaseReceiptItem{}
	if filter.MaterialID > 0 {
		itemPredicates = append(itemPredicates, purchasereceiptitem.MaterialID(filter.MaterialID))
	}
	if filter.WarehouseID > 0 {
		itemPredicates = append(itemPredicates, purchasereceiptitem.WarehouseID(filter.WarehouseID))
	}
	if filter.LotID > 0 {
		itemPredicates = append(itemPredicates, purchasereceiptitem.LotID(filter.LotID))
	}
	if filter.PurchaseOrderID > 0 {
		itemPredicates = append(
			itemPredicates,
			purchasereceiptitem.HasPurchaseOrderItemWith(
				purchaseorderitem.PurchaseOrderID(filter.PurchaseOrderID),
			),
		)
	}
	if filter.PurchaseOrderItemID > 0 {
		itemPredicates = append(itemPredicates, purchasereceiptitem.PurchaseOrderItemID(filter.PurchaseOrderItemID))
	}
	if len(itemPredicates) > 0 {
		query = query.Where(purchasereceipt.HasItemsWith(itemPredicates...))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.
		Order(ent.Desc(purchasereceipt.FieldReceivedAt), ent.Desc(purchasereceipt.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.PurchaseReceipt, 0, len(rows))
	for _, row := range rows {
		item, err := purchaseReceiptWithItems(ctx, r.data.postgres, row)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, item)
	}
	return out, total, nil
}

func purchaseOrderItemRemainingQuantities(ctx context.Context, client *ent.Client, orderItems []*ent.PurchaseOrderItem) (map[int]decimal.Decimal, error) {
	remaining := make(map[int]decimal.Decimal, len(orderItems))
	itemIDs := make([]int, 0, len(orderItems))
	for _, item := range orderItems {
		remaining[item.ID] = item.PurchasedQuantity
		itemIDs = append(itemIDs, item.ID)
	}
	receivedByItemID, err := purchaseOrderEffectiveReceivedQuantities(ctx, client, itemIDs, 0, 0)
	if err != nil {
		return nil, err
	}
	draftItems, err := client.PurchaseReceiptItem.Query().
		Where(
			purchasereceiptitem.PurchaseOrderItemIDIn(itemIDs...),
			purchasereceiptitem.HasReceiptWith(
				purchasereceipt.Status(biz.PurchaseReceiptStatusDraft),
			),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, draftItem := range draftItems {
		if draftItem.PurchaseOrderItemID == nil {
			continue
		}
		itemID := *draftItem.PurchaseOrderItemID
		receivedByItemID[itemID] = receivedByItemID[itemID].Add(draftItem.Quantity)
	}
	for itemID, received := range receivedByItemID {
		remaining[itemID] = remaining[itemID].Sub(received)
	}
	return remaining, nil
}

func validatePurchaseOrderReceiptQuantities(ctx context.Context, tx *inventoryDBTx, receiptID int, items []*ent.PurchaseReceiptItem) error {
	currentByOrderItemID := make(map[int]decimal.Decimal)
	for _, item := range items {
		if item.PurchaseOrderItemID == nil {
			continue
		}
		orderItemID := *item.PurchaseOrderItemID
		currentByOrderItemID[orderItemID] = currentByOrderItemID[orderItemID].Add(item.Quantity)
	}
	if len(currentByOrderItemID) == 0 {
		return nil
	}

	return validatePurchaseOrderReceivedQuantityDeltas(ctx, tx, receiptID, 0, currentByOrderItemID, true)
}

func validatePurchaseOrderReceivedQuantityDeltas(
	ctx context.Context,
	tx *inventoryDBTx,
	excludeReceiptID int,
	excludeAdjustmentID int,
	deltaByOrderItemID map[int]decimal.Decimal,
	requireReceivableSource bool,
) error {
	if len(deltaByOrderItemID) == 0 {
		return nil
	}
	orderItemIDs := make([]int, 0, len(deltaByOrderItemID))
	for orderItemID := range deltaByOrderItemID {
		orderItemIDs = append(orderItemIDs, orderItemID)
	}
	sort.Ints(orderItemIDs)
	if err := lockPurchaseOrderItems(ctx, tx, orderItemIDs); err != nil {
		return err
	}

	orderItems, err := tx.client.PurchaseOrderItem.Query().
		Where(purchaseorderitem.IDIn(orderItemIDs...)).
		WithPurchaseOrder().
		All(ctx)
	if err != nil {
		return err
	}
	if len(orderItems) != len(orderItemIDs) {
		return biz.ErrPurchaseOrderItemNotFound
	}
	purchasedByOrderItemID := make(map[int]decimal.Decimal, len(orderItems))
	for _, orderItem := range orderItems {
		if requireReceivableSource {
			order, edgeErr := orderItem.Edges.PurchaseOrderOrErr()
			if edgeErr != nil {
				return edgeErr
			}
			if order.LifecycleStatus != biz.PurchaseOrderStatusApproved || orderItem.LineStatus != biz.PurchaseOrderItemStatusOpen {
				return biz.ErrBadParam
			}
		}
		purchasedByOrderItemID[orderItem.ID] = orderItem.PurchasedQuantity
	}

	receivedByOrderItemID, err := purchaseOrderEffectiveReceivedQuantities(
		ctx,
		tx.client,
		orderItemIDs,
		excludeReceiptID,
		excludeAdjustmentID,
	)
	if err != nil {
		return err
	}
	for _, orderItemID := range orderItemIDs {
		effectiveReceived := receivedByOrderItemID[orderItemID].Add(deltaByOrderItemID[orderItemID])
		if effectiveReceived.Cmp(purchasedByOrderItemID[orderItemID]) > 0 {
			return fmt.Errorf("%w: purchase order item %d received quantity exceeds purchased quantity", biz.ErrBadParam, orderItemID)
		}
	}
	return nil
}

func purchaseOrderEffectiveReceivedQuantities(
	ctx context.Context,
	client *ent.Client,
	orderItemIDs []int,
	excludeReceiptID int,
	excludeAdjustmentID int,
) (map[int]decimal.Decimal, error) {
	receivedByOrderItemID := make(map[int]decimal.Decimal, len(orderItemIDs))
	if len(orderItemIDs) == 0 {
		return receivedByOrderItemID, nil
	}
	receiptPredicates := []predicate.PurchaseReceiptItem{
		purchasereceiptitem.PurchaseOrderItemIDIn(orderItemIDs...),
		purchasereceiptitem.HasReceiptWith(
			purchasereceipt.Status(biz.PurchaseReceiptStatusPosted),
		),
	}
	if excludeReceiptID > 0 {
		receiptPredicates = append(receiptPredicates, purchasereceiptitem.ReceiptIDNEQ(excludeReceiptID))
	}
	receiptItems, err := client.PurchaseReceiptItem.Query().
		Where(receiptPredicates...).
		All(ctx)
	if err != nil {
		return nil, err
	}
	receiptItemToOrderItemID := make(map[int]int, len(receiptItems))
	receiptItemIDs := make([]int, 0, len(receiptItems))
	for _, item := range receiptItems {
		if item.PurchaseOrderItemID == nil {
			continue
		}
		orderItemID := *item.PurchaseOrderItemID
		receiptItemToOrderItemID[item.ID] = orderItemID
		receiptItemIDs = append(receiptItemIDs, item.ID)
		receivedByOrderItemID[orderItemID] = receivedByOrderItemID[orderItemID].Add(item.Quantity)
	}
	if len(receiptItemIDs) == 0 {
		return receivedByOrderItemID, nil
	}

	adjustmentPredicates := []predicate.PurchaseReceiptAdjustmentItem{
		purchasereceiptadjustmentitem.PurchaseReceiptItemIDIn(receiptItemIDs...),
		purchasereceiptadjustmentitem.HasPurchaseReceiptAdjustmentWith(
			purchasereceiptadjustment.Status(biz.PurchaseReceiptAdjustmentStatusPosted),
		),
	}
	if excludeAdjustmentID > 0 {
		adjustmentPredicates = append(adjustmentPredicates, purchasereceiptadjustmentitem.AdjustmentIDNEQ(excludeAdjustmentID))
	}
	adjustmentItems, err := client.PurchaseReceiptAdjustmentItem.Query().
		Where(adjustmentPredicates...).
		All(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range adjustmentItems {
		orderItemID, ok := receiptItemToOrderItemID[item.PurchaseReceiptItemID]
		if !ok {
			continue
		}
		switch item.AdjustType {
		case biz.PurchaseReceiptAdjustmentQuantityIncrease:
			receivedByOrderItemID[orderItemID] = receivedByOrderItemID[orderItemID].Add(item.Quantity)
		case biz.PurchaseReceiptAdjustmentQuantityDecrease:
			receivedByOrderItemID[orderItemID] = receivedByOrderItemID[orderItemID].Sub(item.Quantity)
		}
	}
	return receivedByOrderItemID, nil
}

func lockPurchaseOrderItems(ctx context.Context, tx *inventoryDBTx, orderItemIDs []int) error {
	if tx.dialect != dialect.Postgres || len(orderItemIDs) == 0 {
		return nil
	}
	placeholders := inventorySQLPlaceholders(tx.dialect, len(orderItemIDs))
	args := make([]any, 0, len(orderItemIDs))
	for _, id := range orderItemIDs {
		args = append(args, id)
	}
	query := fmt.Sprintf(
		`SELECT id FROM purchase_order_items WHERE id IN (%s) ORDER BY id FOR UPDATE`,
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
	if locked != len(orderItemIDs) {
		return biz.ErrPurchaseOrderItemNotFound
	}
	return nil
}

func lockPurchaseOrderForReceipt(ctx context.Context, tx *inventoryDBTx, purchaseOrderID int) error {
	if tx.dialect != dialect.Postgres {
		return nil
	}
	var id int
	if err := tx.sqlTx.QueryRowContext(ctx, `SELECT id FROM purchase_orders WHERE id = $1 FOR UPDATE`, purchaseOrderID).Scan(&id); err != nil {
		if errors.Is(err, stdsql.ErrNoRows) {
			return biz.ErrPurchaseOrderNotFound
		}
		return err
	}
	return nil
}

func purchaseReceiptPriceAndAmount(item *ent.PurchaseOrderItem, quantity decimal.Decimal) (*decimal.Decimal, *decimal.Decimal) {
	if item.UnitPrice != nil {
		amount := item.UnitPrice.Mul(quantity)
		return item.UnitPrice, &amount
	}
	if item.Amount != nil && quantity.Equal(item.PurchasedQuantity) {
		return nil, item.Amount
	}
	return nil, nil
}

func resolvePurchaseReceiptFromPurchaseOrderReplay(
	ctx context.Context,
	client *ent.Client,
	in *biz.PurchaseReceiptFromPurchaseOrderCreate,
) (*biz.PurchaseReceipt, bool, error) {
	if client == nil || in == nil || in.IdempotencyKey == "" || in.IdempotencyPayloadHash == "" {
		return nil, false, biz.ErrBadParam
	}
	receipt, err := client.PurchaseReceipt.Query().
		Where(purchasereceipt.IdempotencyKey(in.IdempotencyKey)).
		Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if receipt.IdempotencyPayloadHash == nil || *receipt.IdempotencyPayloadHash != in.IdempotencyPayloadHash {
		return nil, true, biz.ErrIdempotencyConflict
	}
	if receipt.IdempotencyItemCount == nil || *receipt.IdempotencyItemCount <= 0 {
		return nil, true, fmt.Errorf("purchase receipt %d idempotency result boundary is missing", receipt.ID)
	}
	items, err := client.PurchaseReceiptItem.Query().
		Where(purchasereceiptitem.ReceiptID(receipt.ID)).
		Order(ent.Asc(purchasereceiptitem.FieldID)).
		Limit(*receipt.IdempotencyItemCount).
		All(ctx)
	if err != nil {
		return nil, true, err
	}
	if len(items) != *receipt.IdempotencyItemCount {
		return nil, true, fmt.Errorf("purchase receipt %d idempotency result item set is incomplete", receipt.ID)
	}
	out := entPurchaseReceiptToBiz(receipt, items)
	out.QualityInspections, err = purchaseReceiptInitialQualityInspectionsForItems(ctx, client, receipt.ID, items)
	if err != nil {
		return nil, true, err
	}
	return out, true, nil
}

func supplierNameFromSnapshot(snapshot map[string]any) string {
	if snapshot == nil {
		return ""
	}
	for _, key := range []string{"name", "short_name", "code"} {
		if value, ok := snapshot[key].(string); ok && value != "" {
			return value
		}
	}
	return ""
}

func (r *inventoryRepo) applyInventoryTxnAndUpdateBalanceInTx(ctx context.Context, tx *inventoryDBTx, in *biz.InventoryTxnCreate) (*biz.InventoryTxnApplyResult, error) {
	existing, err := tx.client.InventoryTxn.Query().
		Where(inventorytxn.IdempotencyKey(in.IdempotencyKey)).
		Only(ctx)
	if err == nil {
		if !inventoryTxnMatchesCreate(existing, in) {
			return nil, biz.ErrIdempotencyConflict
		}
		balance, balanceErr := getInventoryBalance(ctx, tx.client.InventoryBalance.Query(), inventoryBalanceKeyFromEntTxn(existing))
		if balanceErr != nil && !ent.IsNotFound(balanceErr) {
			return nil, balanceErr
		}
		return &biz.InventoryTxnApplyResult{
			Txn:              entInventoryTxnToBiz(existing),
			Balance:          entInventoryBalanceToBiz(balance),
			IdempotentReplay: true,
		}, nil
	}
	if err != nil && !ent.IsNotFound(err) {
		return nil, err
	}
	if err := validateInventoryTxnReferences(ctx, tx.client, in); err != nil {
		return nil, err
	}
	row, err := createInventoryTxn(ctx, tx.client.InventoryTxn.Create(), in)
	if err != nil {
		return nil, err
	}
	balance, err := applyInventoryBalanceDelta(ctx, tx, in)
	if err != nil {
		return nil, err
	}
	return &biz.InventoryTxnApplyResult{
		Txn:     entInventoryTxnToBiz(row),
		Balance: entInventoryBalanceToBiz(balance),
	}, nil
}

func validatePurchaseReceiptItemReferences(ctx context.Context, client *ent.Client, in *biz.PurchaseReceiptItemCreate) error {
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
	if in.PurchaseOrderItemID != nil {
		item, err := client.PurchaseOrderItem.Query().
			Where(purchaseorderitem.ID(*in.PurchaseOrderItemID)).
			Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrPurchaseOrderItemNotFound
			}
			return err
		}
		if item.LineStatus != biz.PurchaseOrderItemStatusOpen || item.MaterialID != in.MaterialID || item.UnitID != in.UnitID {
			return biz.ErrBadParam
		}
		sourceLineNo := fmt.Sprintf("%d", item.LineNo)
		in.SourceLineNo = &sourceLineNo
	}
	if in.LotID == nil {
		return nil
	}
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
	return nil
}

// createPreparedPurchaseReceiptItem owns the pre-inbound identity lifecycle:
// every receipt line gets a zero-balance HOLD lot and one submitted incoming
// inspection before the draft can ever be posted.
func createPreparedPurchaseReceiptItem(
	ctx context.Context,
	tx *inventoryDBTx,
	receipt *ent.PurchaseReceipt,
	in *biz.PurchaseReceiptItemCreate,
	sequence int,
) (*ent.PurchaseReceiptItem, *ent.QualityInspection, error) {
	if tx == nil || receipt == nil || in == nil || sequence <= 0 || receipt.Status != biz.PurchaseReceiptStatusDraft {
		return nil, nil, biz.ErrBadParam
	}
	if err := validatePurchaseReceiptItemReferences(ctx, tx.client, in); err != nil {
		return nil, nil, err
	}

	lotID := in.LotID
	supplierLotNo := ""
	if in.LotNo != nil {
		supplierLotNo = strings.TrimSpace(*in.LotNo)
	}
	if lotID == nil {
		identityLotNo := fmt.Sprintf("PR-%d-LINE-%d", receipt.ID, sequence)
		lot, err := tx.client.InventoryLot.Create().
			SetSubjectType(biz.InventorySubjectMaterial).
			SetSubjectID(in.MaterialID).
			SetLotNo(identityLotNo).
			SetNillableSupplierLotNo(in.LotNo).
			SetStatus(biz.InventoryLotHold).
			SetReceivedAt(receipt.ReceivedAt).
			Save(ctx)
		if err != nil {
			return nil, nil, err
		}
		lotID = &lot.ID
		in.LotID = lotID
		if supplierLotNo == "" {
			in.LotNo = &identityLotNo
		}
	} else {
		if err := lockInventoryLot(ctx, tx, *lotID); err != nil {
			return nil, nil, err
		}
		lot, err := tx.client.InventoryLot.Get(ctx, *lotID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, nil, biz.ErrInventoryLotNotFound
			}
			return nil, nil, err
		}
		if lot.SubjectType != biz.InventorySubjectMaterial || lot.SubjectID != in.MaterialID || lot.Status != biz.InventoryLotHold {
			return nil, nil, biz.ErrBadParam
		}
		nonZeroBalance, err := tx.client.InventoryBalance.Query().Where(
			inventorybalance.LotID(*lotID),
			inventorybalance.QuantityNEQ(decimal.Zero),
		).Exist(ctx)
		if err != nil {
			return nil, nil, err
		}
		alreadyLinked, err := tx.client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.LotID(*lotID)).Exist(ctx)
		if err != nil {
			return nil, nil, err
		}
		if nonZeroBalance || alreadyLinked {
			return nil, nil, biz.ErrBadParam
		}
		if supplierLotNo == "" {
			identityLotNo := lot.LotNo
			in.LotNo = &identityLotNo
		}
	}

	item, err := tx.client.PurchaseReceiptItem.Create().
		SetReceiptID(receipt.ID).
		SetMaterialID(in.MaterialID).
		SetWarehouseID(in.WarehouseID).
		SetUnitID(in.UnitID).
		SetLotID(*lotID).
		SetNillablePurchaseOrderItemID(in.PurchaseOrderItemID).
		SetNillableLotNo(in.LotNo).
		SetQuantity(in.Quantity).
		SetNillableUnitPrice(in.UnitPrice).
		SetNillableAmount(in.Amount).
		SetNillableSourceLineNo(in.SourceLineNo).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, nil, err
	}

	inspectionNo := fmt.Sprintf("IQC-PR-%d-ITEM-%d", receipt.ID, item.ID)
	inspection, err := tx.client.QualityInspection.Create().
		SetInspectionNo(inspectionNo).
		SetPurchaseReceiptID(receipt.ID).
		SetPurchaseReceiptItemID(item.ID).
		SetInventoryLotID(*lotID).
		SetMaterialID(item.MaterialID).
		SetWarehouseID(item.WarehouseID).
		SetSourceType(biz.QualityInspectionSourcePurchaseReceipt).
		SetSourceID(receipt.ID).
		SetInspectionType(biz.QualityInspectionTypeIncoming).
		SetSubjectType(biz.QualityInspectionSubjectMaterial).
		SetSubjectID(item.MaterialID).
		SetStatus(biz.QualityInspectionStatusSubmitted).
		SetOriginalLotStatus(biz.InventoryLotHold).
		Save(ctx)
	if err != nil {
		return nil, nil, err
	}
	return item, inspection, nil
}

func purchaseReceiptIncomingQualityInspections(ctx context.Context, client *ent.Client, receiptID int) ([]*biz.QualityInspection, error) {
	items, err := client.PurchaseReceiptItem.Query().Where(
		purchasereceiptitem.ReceiptID(receiptID),
	).Order(ent.Asc(purchasereceiptitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	return purchaseReceiptInitialQualityInspectionsForItems(ctx, client, receiptID, items)
}

func purchaseReceiptInitialQualityInspectionsForItems(ctx context.Context, client *ent.Client, receiptID int, items []*ent.PurchaseReceiptItem) ([]*biz.QualityInspection, error) {
	if len(items) == 0 {
		return []*biz.QualityInspection{}, nil
	}
	expectedNos := make([]string, 0, len(items))
	for _, item := range items {
		expectedNos = append(expectedNos, fmt.Sprintf("IQC-PR-%d-ITEM-%d", receiptID, item.ID))
	}
	rows, err := client.QualityInspection.Query().Where(
		qualityinspection.PurchaseReceiptID(receiptID),
		qualityinspection.SourceType(biz.QualityInspectionSourcePurchaseReceipt),
		qualityinspection.InspectionType(biz.QualityInspectionTypeIncoming),
		qualityinspection.InspectionNoIn(expectedNos...),
	).Order(ent.Asc(qualityinspection.FieldPurchaseReceiptItemID), ent.Asc(qualityinspection.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	if len(rows) != len(items) {
		return nil, fmt.Errorf("purchase receipt %d initial quality inspection set is incomplete", receiptID)
	}
	out := make([]*biz.QualityInspection, 0, len(rows))
	for index, row := range rows {
		if row.PurchaseReceiptItemID == nil || *row.PurchaseReceiptItemID != items[index].ID || row.InspectionNo != expectedNos[index] {
			return nil, fmt.Errorf("purchase receipt %d initial quality inspection set is inconsistent", receiptID)
		}
		out = append(out, entQualityInspectionToBiz(row))
	}
	return out, nil
}

func ensurePurchaseReceiptItemLot(ctx context.Context, tx *inventoryDBTx, receipt *ent.PurchaseReceipt, item *ent.PurchaseReceiptItem) (*int, error) {
	client := tx.client
	if item.LotID != nil {
		lot, err := client.InventoryLot.Get(ctx, *item.LotID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrInventoryLotNotFound
			}
			return nil, err
		}
		if lot.SubjectType != biz.InventorySubjectMaterial || lot.SubjectID != item.MaterialID {
			return nil, biz.ErrBadParam
		}
		return item.LotID, nil
	}
	if item.LotNo == nil || *item.LotNo == "" {
		return nil, nil
	}
	lot, err := client.InventoryLot.Query().
		Where(
			inventorylot.SubjectType(biz.InventorySubjectMaterial),
			inventorylot.SubjectID(item.MaterialID),
			inventorylot.LotNo(*item.LotNo),
		).
		Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return nil, err
	}
	if ent.IsNotFound(err) {
		if err := insertMaterialLotIgnoreConflict(ctx, tx, item.MaterialID, *item.LotNo, receipt.ReceivedAt); err != nil {
			return nil, err
		}
		lot, err = client.InventoryLot.Query().
			Where(
				inventorylot.SubjectType(biz.InventorySubjectMaterial),
				inventorylot.SubjectID(item.MaterialID),
				inventorylot.LotNo(*item.LotNo),
			).
			Only(ctx)
		if err != nil {
			return nil, err
		}
	}
	if item.LotID == nil || *item.LotID != lot.ID {
		if err := updatePurchaseReceiptItemLotID(ctx, tx, item.ID, lot.ID); err != nil {
			return nil, err
		}
		item.LotID = &lot.ID
	}
	return &lot.ID, nil
}

func insertMaterialLotIgnoreConflict(ctx context.Context, tx *inventoryDBTx, materialID int, lotNo string, receivedAt time.Time) error {
	now := time.Now()
	p := inventorySQLPlaceholders(tx.dialect, 7)
	query := fmt.Sprintf(
		`INSERT INTO inventory_lots (subject_type, subject_id, lot_no, status, received_at, created_at, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (subject_type, subject_id, lot_no) DO NOTHING`,
		p[0], p[1], p[2], p[3], p[4], p[5], p[6],
	)
	_, err := tx.sqlTx.ExecContext(ctx, query, biz.InventorySubjectMaterial, materialID, lotNo, biz.InventoryLotActive, receivedAt, now, now)
	return err
}

func updatePurchaseReceiptItemLotID(ctx context.Context, tx *inventoryDBTx, itemID, lotID int) error {
	p := inventorySQLPlaceholders(tx.dialect, 3)
	query := fmt.Sprintf(`UPDATE purchase_receipt_items SET lot_id = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2])
	_, err := tx.sqlTx.ExecContext(ctx, query, lotID, time.Now(), itemID)
	return err
}

func updatePurchaseReceiptPosted(ctx context.Context, tx *inventoryDBTx, receiptID int, postedAt time.Time) error {
	p := inventorySQLPlaceholders(tx.dialect, 4)
	query := fmt.Sprintf(`UPDATE purchase_receipts SET status = %s, posted_at = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2], p[3])
	_, err := tx.sqlTx.ExecContext(ctx, query, biz.PurchaseReceiptStatusPosted, postedAt, time.Now(), receiptID)
	return err
}

func updatePurchaseReceiptCancelled(ctx context.Context, tx *inventoryDBTx, receiptID int) error {
	p := inventorySQLPlaceholders(tx.dialect, 3)
	query := fmt.Sprintf(`UPDATE purchase_receipts SET status = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2])
	_, err := tx.sqlTx.ExecContext(ctx, query, biz.PurchaseReceiptStatusCancelled, time.Now(), receiptID)
	return err
}

func lockPurchaseReceipt(ctx context.Context, tx *inventoryDBTx, receiptID int) error {
	if tx.dialect != dialect.Postgres {
		return nil
	}
	var id int
	if err := tx.sqlTx.QueryRowContext(ctx, `SELECT id FROM purchase_receipts WHERE id = $1 FOR UPDATE`, receiptID).Scan(&id); err != nil {
		if errors.Is(err, stdsql.ErrNoRows) {
			return biz.ErrPurchaseReceiptNotFound
		}
		return err
	}
	return nil
}

func purchaseReceiptWithItems(ctx context.Context, client *ent.Client, receipt *ent.PurchaseReceipt) (*biz.PurchaseReceipt, error) {
	items, err := client.PurchaseReceiptItem.Query().
		Where(purchasereceiptitem.ReceiptID(receipt.ID)).
		Order(ent.Asc(purchasereceiptitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	return entPurchaseReceiptToBiz(receipt, items), nil
}

func entPurchaseReceiptToBiz(row *ent.PurchaseReceipt, items []*ent.PurchaseReceiptItem) *biz.PurchaseReceipt {
	if row == nil {
		return nil
	}
	out := &biz.PurchaseReceipt{
		ID:           row.ID,
		ReceiptNo:    row.ReceiptNo,
		SupplierName: row.SupplierName,
		Status:       row.Status,
		ReceivedAt:   row.ReceivedAt,
		PostedAt:     row.PostedAt,
		Note:         row.Note,
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
	}
	if len(items) > 0 {
		out.Items = make([]*biz.PurchaseReceiptItem, 0, len(items))
		for _, item := range items {
			out.Items = append(out.Items, entPurchaseReceiptItemToBiz(item))
		}
	}
	return out
}

func entPurchaseReceiptItemToBiz(row *ent.PurchaseReceiptItem) *biz.PurchaseReceiptItem {
	if row == nil {
		return nil
	}
	return &biz.PurchaseReceiptItem{
		ID:                  row.ID,
		ReceiptID:           row.ReceiptID,
		MaterialID:          row.MaterialID,
		WarehouseID:         row.WarehouseID,
		UnitID:              row.UnitID,
		LotID:               row.LotID,
		PurchaseOrderItemID: row.PurchaseOrderItemID,
		LotNo:               row.LotNo,
		Quantity:            row.Quantity,
		UnitPrice:           row.UnitPrice,
		Amount:              row.Amount,
		SourceLineNo:        row.SourceLineNo,
		Note:                row.Note,
		CreatedAt:           row.CreatedAt,
		UpdatedAt:           row.UpdatedAt,
	}
}
