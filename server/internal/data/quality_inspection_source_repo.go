package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/qualityinspection"
)

var _ biz.QualityInspectionSourceRepo = (*inventoryRepo)(nil)

func (r *inventoryRepo) CreateQualityInspectionFromPurchaseReceipt(
	ctx context.Context,
	in *biz.QualityInspectionFromPurchaseReceiptCreate,
) (*biz.QualityInspection, error) {
	if in == nil || in.PurchaseReceiptID <= 0 || in.PurchaseReceiptItemID <= 0 {
		return nil, biz.ErrBadParam
	}
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockPurchaseReceipt(ctx, tx, in.PurchaseReceiptID); err != nil {
		return nil, err
	}
	if err := lockPurchaseReceiptItems(ctx, tx, []int{in.PurchaseReceiptItemID}); err != nil {
		return nil, err
	}
	receipt, err := tx.client.PurchaseReceipt.Get(ctx, in.PurchaseReceiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	item, err := tx.client.PurchaseReceiptItem.Get(ctx, in.PurchaseReceiptItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptItemNotFound
		}
		return nil, err
	}
	if item.ReceiptID != receipt.ID || item.LotID == nil {
		return nil, biz.ErrQualityInspectionSourceInvalid
	}
	derived := &biz.QualityInspectionCreate{
		InspectionNo:          in.InspectionNo,
		PurchaseReceiptID:     receipt.ID,
		PurchaseReceiptItemID: &item.ID,
		InventoryLotID:        *item.LotID,
		MaterialID:            item.MaterialID,
		WarehouseID:           item.WarehouseID,
		SourceType:            biz.QualityInspectionSourcePurchaseReceipt,
		SourceID:              receipt.ID,
		InspectionType:        biz.QualityInspectionTypeIncoming,
		SubjectType:           biz.QualityInspectionSubjectMaterial,
		SubjectID:             item.MaterialID,
		DecisionNote:          in.DecisionNote,
	}
	if err := validateIncomingQualityInspectionReferences(ctx, tx.client, derived); err != nil {
		return nil, err
	}
	if replay, found, err := findQualityInspectionCreateReplay(ctx, tx.client, derived); err != nil || found {
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return entQualityInspectionToBiz(replay), nil
	}
	row, err := createQualityInspectionDraftRow(ctx, tx.client, derived)
	if err != nil {
		originalErr := err
		rollbackInventoryDBTx(ctx, tx, r.log)
		tx = nil
		if replay, found, replayErr := findQualityInspectionCreateReplay(ctx, r.data.postgres, derived); replayErr != nil {
			return nil, replayErr
		} else if found {
			return entQualityInspectionToBiz(replay), nil
		}
		return nil, originalErr
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entQualityInspectionToBiz(row), nil
}

func (r *inventoryRepo) CreateQualityInspectionFromOutsourcingReturn(
	ctx context.Context,
	in *biz.QualityInspectionFromOutsourcingReturnCreate,
) (*biz.QualityInspection, error) {
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
		return nil, biz.ErrQualityInspectionSourceInvalid
	}

	tx, err := r.beginInventoryDBTx(ctx)
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
	fact, err := tx.client.OutsourcingFact.Get(ctx, in.OutsourcingFactID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrOutsourcingFactNotFound
		}
		return nil, err
	}
	derived, err := qualityInspectionCreateFromOutsourcingReturn(ctx, tx.client, fact, orderID, itemID, in)
	if err != nil {
		return nil, err
	}
	if replay, found, err := findQualityInspectionCreateReplay(ctx, tx.client, derived); err != nil || found {
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return entQualityInspectionToBiz(replay), nil
	}
	active, err := tx.client.QualityInspection.Query().Where(
		qualityinspection.SourceType(biz.QualityInspectionSourceOutsourcingFact),
		qualityinspection.SourceID(fact.ID),
		qualityinspection.StatusNEQ(biz.QualityInspectionStatusCancelled),
	).Order(ent.Asc(qualityinspection.FieldID)).First(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return nil, err
	}
	if err == nil {
		if qualityInspectionMatchesCreate(active, derived) {
			if err := tx.sqlTx.Commit(); err != nil {
				return nil, err
			}
			tx = nil
			return entQualityInspectionToBiz(active), nil
		}
		return nil, biz.ErrQualityInspectionSourceConflict
	}
	row, err := createQualityInspectionDraftRow(ctx, tx.client, derived)
	if err != nil {
		originalErr := err
		rollbackInventoryDBTx(ctx, tx, r.log)
		tx = nil
		if replay, found, replayErr := findQualityInspectionCreateReplay(ctx, r.data.postgres, derived); replayErr != nil {
			return nil, replayErr
		} else if found {
			return entQualityInspectionToBiz(replay), nil
		}
		return nil, originalErr
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entQualityInspectionToBiz(row), nil
}

func qualityInspectionCreateFromOutsourcingReturn(
	ctx context.Context,
	client *ent.Client,
	fact *ent.OutsourcingFact,
	orderID int,
	itemID int,
	in *biz.QualityInspectionFromOutsourcingReturnCreate,
) (*biz.QualityInspectionCreate, error) {
	if client == nil || fact == nil || in == nil || fact.ID != in.OutsourcingFactID {
		return nil, biz.ErrBadParam
	}
	if fact.Status != biz.OperationalFactStatusPosted {
		return nil, biz.ErrQualityInspectionSourceState
	}
	if fact.FactType != biz.OutsourcingFactReturnReceipt ||
		fact.SubjectType != biz.QualityInspectionSubjectProduct ||
		fact.LotID == nil || *fact.LotID <= 0 ||
		fact.SourceType == nil || *fact.SourceType != biz.OutsourcingOrderSourceType ||
		fact.SourceID == nil || *fact.SourceID != orderID ||
		fact.SourceLineID == nil || *fact.SourceLineID != itemID {
		return nil, biz.ErrQualityInspectionSourceInvalid
	}
	resolved, _, err := resolveOutsourcingOrderFactMutation(
		ctx,
		client,
		fact.FactType,
		outsourcingOrderFactCreateFromRow(fact, orderID, itemID),
		false,
	)
	if err != nil || !operationalFactMutationMatchesOutsourcing(fact, resolved) {
		return nil, biz.ErrQualityInspectionSourceInvalid
	}
	derived := &biz.QualityInspectionCreate{
		InspectionNo:   in.InspectionNo,
		InventoryLotID: *fact.LotID,
		WarehouseID:    fact.WarehouseID,
		SourceType:     biz.QualityInspectionSourceOutsourcingFact,
		SourceID:       fact.ID,
		InspectionType: biz.QualityInspectionTypeOutsourcingReturn,
		SubjectType:    biz.QualityInspectionSubjectProduct,
		SubjectID:      fact.SubjectID,
		DecisionNote:   in.DecisionNote,
	}
	lot, err := client.InventoryLot.Get(ctx, derived.InventoryLotID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrInventoryLotNotFound
		}
		return nil, err
	}
	if err := validateFinishedGoodsQualityInspectionLot(lot, derived.SubjectID); err != nil || !sameOptionalInt(lot.ProductSkuID, fact.ProductSkuID) {
		return nil, biz.ErrQualityInspectionSourceInvalid
	}
	return derived, nil
}

func validateOutsourcingReturnQualityInspectionReferences(ctx context.Context, client *ent.Client, in *biz.QualityInspectionCreate) error {
	if client == nil || in == nil ||
		in.SourceType != biz.QualityInspectionSourceOutsourcingFact ||
		in.SourceID <= 0 ||
		in.InspectionType != biz.QualityInspectionTypeOutsourcingReturn ||
		in.SubjectType != biz.QualityInspectionSubjectProduct ||
		in.SubjectID <= 0 ||
		in.InventoryLotID <= 0 ||
		in.WarehouseID <= 0 ||
		in.PurchaseReceiptID != 0 || in.PurchaseReceiptItemID != nil || in.MaterialID != 0 {
		return biz.ErrQualityInspectionSourceInvalid
	}
	fact, err := client.OutsourcingFact.Get(ctx, in.SourceID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrOutsourcingFactNotFound
		}
		return err
	}
	if fact.Status != biz.OperationalFactStatusPosted {
		return biz.ErrQualityInspectionSourceState
	}
	orderID, itemID, err := outsourcingOrderSourceIDsFromFact(fact)
	if err != nil {
		return biz.ErrQualityInspectionSourceInvalid
	}
	derived, err := qualityInspectionCreateFromOutsourcingReturn(ctx, client, fact, orderID, itemID, &biz.QualityInspectionFromOutsourcingReturnCreate{
		InspectionNo:      in.InspectionNo,
		OutsourcingFactID: fact.ID,
		DecisionNote:      in.DecisionNote,
	})
	if err != nil {
		return err
	}
	if derived.InventoryLotID != in.InventoryLotID || derived.WarehouseID != in.WarehouseID || derived.SubjectID != in.SubjectID {
		return biz.ErrQualityInspectionSourceInvalid
	}
	lot, err := client.InventoryLot.Get(ctx, in.InventoryLotID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrInventoryLotNotFound
		}
		return err
	}
	if err := validateFinishedGoodsQualityInspectionLot(lot, in.SubjectID); err != nil {
		return biz.ErrQualityInspectionSourceInvalid
	}
	if !sameOptionalInt(lot.ProductSkuID, fact.ProductSkuID) {
		return biz.ErrQualityInspectionSourceInvalid
	}
	return nil
}

func findQualityInspectionCreateReplay(
	ctx context.Context,
	client *ent.Client,
	in *biz.QualityInspectionCreate,
) (*ent.QualityInspection, bool, error) {
	row, err := client.QualityInspection.Query().Where(qualityinspection.InspectionNo(in.InspectionNo)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if !qualityInspectionMatchesCreate(row, in) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return row, true, nil
}

func qualityInspectionMatchesCreate(row *ent.QualityInspection, in *biz.QualityInspectionCreate) bool {
	if row == nil || in == nil {
		return false
	}
	return row.InspectionNo == in.InspectionNo &&
		optionalIntValueOrZero(row.PurchaseReceiptID) == in.PurchaseReceiptID &&
		sameOptionalInt(row.PurchaseReceiptItemID, in.PurchaseReceiptItemID) &&
		optionalIntValueOrZero(row.InventoryLotID) == in.InventoryLotID &&
		optionalIntValueOrZero(row.MaterialID) == in.MaterialID &&
		optionalIntValueOrZero(row.WarehouseID) == in.WarehouseID &&
		optionalStringValueOrEmpty(row.SourceType) == in.SourceType &&
		optionalIntValueOrZero(row.SourceID) == in.SourceID &&
		optionalStringValueOrEmpty(row.InspectionType) == in.InspectionType &&
		optionalStringValueOrEmpty(row.SubjectType) == in.SubjectType &&
		optionalIntValueOrZero(row.SubjectID) == in.SubjectID &&
		sameOptionalInt(row.InspectorID, in.InspectorID) &&
		sameOptionalString(row.DecisionNote, in.DecisionNote)
}

func createQualityInspectionDraftRow(ctx context.Context, client *ent.Client, in *biz.QualityInspectionCreate) (*ent.QualityInspection, error) {
	return client.QualityInspection.Create().
		SetInspectionNo(in.InspectionNo).
		SetNillablePurchaseReceiptID(positiveIntPtr(in.PurchaseReceiptID)).
		SetNillablePurchaseReceiptItemID(in.PurchaseReceiptItemID).
		SetInventoryLotID(in.InventoryLotID).
		SetNillableMaterialID(positiveIntPtr(in.MaterialID)).
		SetWarehouseID(in.WarehouseID).
		SetSourceType(in.SourceType).
		SetSourceID(in.SourceID).
		SetInspectionType(in.InspectionType).
		SetSubjectType(in.SubjectType).
		SetSubjectID(in.SubjectID).
		SetStatus(biz.QualityInspectionStatusDraft).
		SetNillableInspectorID(in.InspectorID).
		SetNillableDecisionNote(in.DecisionNote).
		Save(ctx)
}
