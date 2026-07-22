package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"server/internal/biz"
	corestatus "server/internal/core/status"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/productionorderoperation"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/data/model/ent/salesreturnitem"
	"server/internal/data/model/ent/shipmentitem"

	"entgo.io/ent/dialect"
	"github.com/shopspring/decimal"
)

func (r *inventoryRepo) CreateQualityInspectionDraft(ctx context.Context, in *biz.QualityInspectionCreate) (*biz.QualityInspection, error) {
	if err := validateQualityInspectionReferences(ctx, r.data.postgres, in); err != nil {
		return nil, err
	}
	row, err := r.data.postgres.QualityInspection.Create().
		SetInspectionNo(in.InspectionNo).
		SetNillablePurchaseReceiptID(positiveIntPtr(in.PurchaseReceiptID)).
		SetNillablePurchaseReceiptItemID(in.PurchaseReceiptItemID).
		SetNillableInventoryLotID(positiveIntPtr(in.InventoryLotID)).
		SetNillableProductionWipBatchID(positiveIntPtr(in.ProductionWIPBatchID)).
		SetNillableGateCode(nonEmptyStringPtr(in.GateCode)).
		SetNillableMaterialID(positiveIntPtr(in.MaterialID)).
		SetNillableWarehouseID(positiveIntPtr(in.WarehouseID)).
		SetNillableSourceType(nonEmptyStringPtr(in.SourceType)).
		SetNillableSourceID(positiveIntPtr(in.SourceID)).
		SetNillableInspectionType(nonEmptyStringPtr(in.InspectionType)).
		SetNillableSubjectType(nonEmptyStringPtr(in.SubjectType)).
		SetNillableSubjectID(positiveIntPtr(in.SubjectID)).
		SetStatus(biz.QualityInspectionStatusDraft).
		SetNillableInspectorID(in.InspectorID).
		SetNillableDecisionNote(in.DecisionNote).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entQualityInspectionToBiz(row), nil
}

func (r *inventoryRepo) CreateFinishedGoodsQualityInspectionDraft(ctx context.Context, in *biz.QualityInspectionCreate) (*biz.QualityInspection, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockOperationalFactRow(ctx, tx, "shipments", in.SourceID, biz.ErrShipmentNotFound); err != nil {
		return nil, err
	}
	if err := validateQualityInspectionReferences(ctx, tx.client, in); err != nil {
		return nil, err
	}
	if replay, found, err := findQualityInspectionCreateReplay(ctx, tx.client, in); err != nil || found {
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return entQualityInspectionToBiz(replay), nil
	}
	if _, err := getSourceWorkflowTaskWithClient(ctx, tx.client, biz.WorkflowSourceTaskShipmentReleaseGroup, in.SourceID); err == nil {
		return nil, biz.ErrShipmentReleaseAlreadySubmitted
	} else if !errors.Is(err, biz.ErrWorkflowTaskNotFound) {
		return nil, err
	}
	activeExists, err := tx.client.QualityInspection.Query().Where(
		qualityinspection.SourceType(biz.QualityInspectionSourceShipment),
		qualityinspection.SourceID(in.SourceID),
		qualityinspection.InspectionType(biz.QualityInspectionTypeFinishedGoods),
		qualityinspection.SubjectType(biz.QualityInspectionSubjectProduct),
		qualityinspection.SubjectID(in.SubjectID),
		qualityinspection.InventoryLotID(in.InventoryLotID),
		qualityinspection.WarehouseID(in.WarehouseID),
		qualityinspection.StatusNEQ(biz.QualityInspectionStatusCancelled),
	).Exist(ctx)
	if err != nil {
		return nil, err
	}
	if activeExists {
		return nil, biz.ErrQualityInspectionSourceConflict
	}
	row, err := createQualityInspectionDraftRow(ctx, tx.client, in)
	if err != nil {
		originalErr := err
		rollbackInventoryDBTx(ctx, tx, r.log)
		tx = nil
		if replay, found, replayErr := findQualityInspectionCreateReplay(ctx, r.data.postgres, in); replayErr != nil {
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

func (r *inventoryRepo) SubmitQualityInspection(ctx context.Context, inspectionID int) (*biz.QualityInspection, error) {
	preview, err := r.data.postgres.QualityInspection.Get(ctx, inspectionID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrQualityInspectionNotFound
		}
		return nil, err
	}
	if isProductionWIPQualityInspection(preview) {
		return r.submitProductionWIPQualityInspection(ctx, preview)
	}

	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	row, err := getLockedQualityInspection(ctx, tx, inspectionID)
	if err != nil {
		return nil, err
	}
	transition, ok := corestatus.SubmitQualityInspection(row.Status)
	if !ok {
		return nil, biz.ErrBadParam
	}
	if !transition.Changed {
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return entQualityInspectionToBiz(row), nil
	}
	if err := validateQualityInspectionReferences(ctx, tx.client, qualityInspectionCreateFromEnt(row)); err != nil {
		return nil, err
	}
	lotID := optionalIntValueOrZero(row.InventoryLotID)
	if lotID <= 0 {
		return nil, biz.ErrBadParam
	}
	if err := lockInventoryLot(ctx, tx, lotID); err != nil {
		return nil, err
	}
	lot, err := tx.client.InventoryLot.Get(ctx, lotID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrInventoryLotNotFound
		}
		return nil, err
	}
	if err := validateSubmittedQualityInspectionLot(lot, row); err != nil {
		return nil, err
	}
	if lot.Status == biz.InventoryLotDisabled || lot.Status == biz.InventoryLotRejected {
		return nil, biz.ErrInventoryLotStatusBlocked
	}
	submittedExists, err := tx.client.QualityInspection.Query().
		Where(
			qualityinspection.InventoryLotID(lotID),
			qualityinspection.Status(biz.QualityInspectionStatusSubmitted),
			qualityinspection.IDNEQ(row.ID),
		).
		Exist(ctx)
	if err != nil {
		return nil, err
	}
	if submittedExists {
		return nil, biz.ErrBadParam
	}
	originalLotStatus := row.OriginalLotStatus
	if originalLotStatus == "" {
		originalLotStatus = lot.Status
	}
	if !biz.IsValidInventoryLotStatus(originalLotStatus) {
		return nil, biz.ErrBadParam
	}
	if err := updateQualityInspectionSubmitted(ctx, tx, row.ID, originalLotStatus); err != nil {
		if ent.IsConstraintError(err) {
			return nil, biz.ErrBadParam
		}
		return nil, err
	}
	if lot.Status != biz.InventoryLotHold {
		if err := updateInventoryLotStatus(ctx, tx, lotID, biz.InventoryLotHold); err != nil {
			return nil, err
		}
	}
	row, err = tx.client.QualityInspection.Get(ctx, row.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrQualityInspectionNotFound
		}
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entQualityInspectionToBiz(row), nil
}

func (r *inventoryRepo) PassQualityInspection(ctx context.Context, in *biz.QualityInspectionDecision) (*biz.QualityInspection, error) {
	return r.decideSubmittedQualityInspection(ctx, in, biz.QualityInspectionStatusPassed, biz.InventoryLotActive, nil, nil, 0)
}

func (r *inventoryRepo) RejectQualityInspection(ctx context.Context, in *biz.QualityInspectionDecision) (*biz.QualityInspection, error) {
	return r.decideSubmittedQualityInspection(ctx, in, biz.QualityInspectionStatusRejected, biz.InventoryLotRejected, nil, nil, 0)
}

func (r *inventoryRepo) PassQualityInspectionForProcessCommand(
	ctx context.Context,
	in *biz.QualityInspectionDecision,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.QualityInspection, error) {
	return r.decideSubmittedQualityInspection(ctx, in, biz.QualityInspectionStatusPassed, biz.InventoryLotActive, command, result, actorID)
}

func (r *inventoryRepo) RejectQualityInspectionForProcessCommand(
	ctx context.Context,
	in *biz.QualityInspectionDecision,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.QualityInspection, error) {
	return r.decideSubmittedQualityInspection(ctx, in, biz.QualityInspectionStatusRejected, biz.InventoryLotRejected, command, result, actorID)
}

func (r *inventoryRepo) CancelQualityInspection(ctx context.Context, inspectionID int, decisionNote *string) (*biz.QualityInspection, error) {
	preview, err := r.data.postgres.QualityInspection.Get(ctx, inspectionID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrQualityInspectionNotFound
		}
		return nil, err
	}
	if isProductionWIPQualityInspection(preview) {
		return r.cancelProductionWIPQualityInspection(ctx, preview, decisionNote)
	}

	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	row, err := getLockedQualityInspection(ctx, tx, inspectionID)
	if err != nil {
		return nil, err
	}
	transition, ok := corestatus.CancelQualityInspection(row.Status)
	if !ok {
		return nil, biz.ErrBadParam
	}
	if !transition.Changed {
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return entQualityInspectionToBiz(row), nil
	}
	note := decisionNote
	if note == nil {
		note = row.DecisionNote
	}
	switch row.Status {
	case biz.QualityInspectionStatusDraft:
		if err := updateQualityInspectionCancelled(ctx, tx, row.ID, note); err != nil {
			return nil, err
		}
	case biz.QualityInspectionStatusSubmitted:
		lotID := optionalIntValueOrZero(row.InventoryLotID)
		if lotID <= 0 {
			return nil, biz.ErrBadParam
		}
		if err := lockInventoryLot(ctx, tx, lotID); err != nil {
			return nil, err
		}
		lot, err := tx.client.InventoryLot.Get(ctx, lotID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrInventoryLotNotFound
			}
			return nil, err
		}
		if lot.Status != biz.InventoryLotHold {
			return nil, biz.ErrBadParam
		}
		originalLotStatus := row.OriginalLotStatus
		if originalLotStatus == "" {
			originalLotStatus = lot.Status
		}
		if !biz.IsValidInventoryLotStatus(originalLotStatus) || originalLotStatus == biz.InventoryLotDisabled {
			return nil, biz.ErrBadParam
		}
		if err := updateQualityInspectionCancelled(ctx, tx, row.ID, note); err != nil {
			return nil, err
		}
		if originalLotStatus != lot.Status {
			if err := updateInventoryLotStatus(ctx, tx, lotID, originalLotStatus); err != nil {
				return nil, err
			}
		}
	}
	row, err = tx.client.QualityInspection.Get(ctx, row.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrQualityInspectionNotFound
		}
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entQualityInspectionToBiz(row), nil
}

func (r *inventoryRepo) GetQualityInspection(ctx context.Context, id int) (*biz.QualityInspection, error) {
	row, err := withProductionWIPQualityContext(
		r.data.postgres.QualityInspection.Query().Where(qualityinspection.ID(id)),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrQualityInspectionNotFound
		}
		return nil, err
	}
	if err := validateProductionWIPQualityInspectionRead(row); err != nil {
		return nil, err
	}
	item := entQualityInspectionToBiz(row)
	sourceNos, err := resolveBusinessSourceNos(ctx, r.data.postgres, []businessSourceReference{{sourceType: row.SourceType, sourceID: row.SourceID}})
	if err != nil {
		return nil, err
	}
	item.SourceNo = businessSourceNo(sourceNos, row.SourceType, row.SourceID)
	enrichProductionWIPQualityInspection(item, row)
	return item, nil
}

func (r *inventoryRepo) ListQualityInspections(ctx context.Context, filter biz.QualityInspectionFilter) ([]*biz.QualityInspection, int, error) {
	query := r.data.postgres.QualityInspection.Query()
	if filter.Status != "" {
		query = query.Where(qualityinspection.Status(filter.Status))
	}
	if filter.Result != "" {
		query = query.Where(qualityinspection.Result(filter.Result))
	}
	if filter.Keyword != "" {
		query = query.Where(qualityinspection.Or(
			qualityinspection.InspectionNoContainsFold(filter.Keyword),
			qualityinspection.PurchaseReceiptIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			qualityinspection.PurchaseReceiptItemIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			qualityinspection.InventoryLotIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			qualityinspection.HasProductionWipBatchWith(
				productionwipbatch.Or(
					productionwipbatch.BatchNoContainsFold(filter.Keyword),
					productionwipbatch.HasProductionOrderWith(productionorder.OrderNoContainsFold(filter.Keyword)),
					productionwipbatch.HasProductionOrderItemWith(
						productionorderitem.Or(
							productionorderitem.ProductCodeSnapshotContainsFold(filter.Keyword),
							productionorderitem.ProductNameSnapshotContainsFold(filter.Keyword),
							productionorderitem.HasProductWith(product.Or(
								product.CodeContainsFold(filter.Keyword),
								product.NameContainsFold(filter.Keyword),
							)),
						),
					),
					productionwipbatch.HasProductionOrderOperationWith(
						productionorderoperation.Or(
							productionorderoperation.OperationCodeContainsFold(filter.Keyword),
							productionorderoperation.ProcessCodeSnapshotContainsFold(filter.Keyword),
							productionorderoperation.ProcessNameSnapshotContainsFold(filter.Keyword),
						),
					),
				),
			),
		))
	}
	if filter.DateFrom != nil {
		query = query.Where(qualityinspection.InspectedAtGTE(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		query = query.Where(qualityinspection.InspectedAtLTE(endOfDateFilter(*filter.DateTo)))
	}
	if filter.PurchaseReceiptID > 0 {
		query = query.Where(qualityinspection.PurchaseReceiptID(filter.PurchaseReceiptID))
	}
	if filter.PurchaseReceiptItemID > 0 {
		query = query.Where(qualityinspection.PurchaseReceiptItemID(filter.PurchaseReceiptItemID))
	}
	if filter.PurchaseOrderID > 0 {
		query = query.Where(
			qualityinspection.HasPurchaseReceiptWith(
				purchasereceipt.HasItemsWith(
					purchasereceiptitem.HasPurchaseOrderItemWith(
						purchaseorderitem.PurchaseOrderID(filter.PurchaseOrderID),
					),
				),
			),
		)
	}
	if filter.InventoryLotID > 0 {
		query = query.Where(qualityinspection.InventoryLotID(filter.InventoryLotID))
	}
	if filter.ProductionWIPBatchID > 0 {
		query = query.Where(qualityinspection.ProductionWipBatchID(filter.ProductionWIPBatchID))
	}
	if filter.GateCode != "" {
		query = query.Where(qualityinspection.GateCode(filter.GateCode))
	}
	if filter.MaterialID > 0 {
		query = query.Where(qualityinspection.MaterialID(filter.MaterialID))
	}
	if filter.WarehouseID > 0 {
		query = query.Where(qualityinspection.WarehouseID(filter.WarehouseID))
	}
	if filter.SourceType != "" {
		query = query.Where(qualityinspection.SourceType(filter.SourceType))
	}
	if filter.SourceID > 0 {
		query = query.Where(qualityinspection.SourceID(filter.SourceID))
	}
	if filter.InspectionType != "" {
		query = query.Where(qualityinspection.InspectionType(filter.InspectionType))
	}
	if filter.SubjectType != "" {
		query = query.Where(qualityinspection.SubjectType(filter.SubjectType))
	}
	if filter.SubjectID > 0 {
		query = query.Where(qualityinspection.SubjectID(filter.SubjectID))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := withProductionWIPQualityContext(query).
		Order(ent.Desc(qualityinspection.FieldCreatedAt), ent.Desc(qualityinspection.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	for _, row := range rows {
		if err := validateProductionWIPQualityInspectionRead(row); err != nil {
			return nil, 0, err
		}
	}
	references := make([]businessSourceReference, 0, len(rows))
	for _, row := range rows {
		references = append(references, businessSourceReference{sourceType: row.SourceType, sourceID: row.SourceID})
	}
	sourceNos, err := resolveBusinessSourceNos(ctx, r.data.postgres, references)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.QualityInspection, 0, len(rows))
	for _, row := range rows {
		item := entQualityInspectionToBiz(row)
		item.SourceNo = businessSourceNo(sourceNos, row.SourceType, row.SourceID)
		enrichProductionWIPQualityInspection(item, row)
		out = append(out, item)
	}
	return out, total, nil
}

func (r *inventoryRepo) EvaluatePurchaseReceiptQualityGate(ctx context.Context, receiptID int) (*biz.PurchaseReceiptQualityGate, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	receipt, err := tx.client.PurchaseReceipt.Get(ctx, receiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseReceiptNotFound
		}
		return nil, err
	}
	items, err := tx.client.PurchaseReceiptItem.Query().Where(
		purchasereceiptitem.ReceiptID(receipt.ID),
	).Order(ent.Asc(purchasereceiptitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	gate, err := evaluatePurchaseReceiptQualityGateInTx(ctx, tx, receipt, items, false)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return gate, nil
}

func (r *inventoryRepo) EvaluatePurchaseReceiptQualityGateForProcessCommand(
	ctx context.Context,
	receiptID int,
	command *biz.ProcessDomainCommandInput,
	actorID int,
) (*biz.PurchaseReceiptQualityGate, error) {
	if command == nil {
		return nil, biz.ErrBadParam
	}
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
	items, err := tx.client.PurchaseReceiptItem.Query().
		Where(purchasereceiptitem.ReceiptID(receipt.ID)).
		Order(ent.Asc(purchasereceiptitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	gate, err := evaluatePurchaseReceiptQualityGateInTx(ctx, tx, receipt, items, true)
	if err != nil {
		return nil, err
	}
	result, err := biz.IncomingQualityGateProcessCommandResult(gate)
	if err != nil {
		return nil, err
	}
	if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, result, actorID); err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return gate, nil
}

func evaluatePurchaseReceiptQualityGateInTx(
	ctx context.Context,
	tx *inventoryDBTx,
	receipt *ent.PurchaseReceipt,
	items []*ent.PurchaseReceiptItem,
	lockRows bool,
) (*biz.PurchaseReceiptQualityGate, error) {
	if tx == nil || receipt == nil || receipt.ID <= 0 || len(items) == 0 {
		return nil, biz.ErrBadParam
	}
	if receipt.Status != biz.PurchaseReceiptStatusDraft && receipt.Status != biz.PurchaseReceiptStatusPosted {
		return nil, biz.ErrBadParam
	}
	if lockRows {
		if err := lockPurchaseReceiptIncomingQualityInspections(ctx, tx, receipt.ID); err != nil {
			return nil, err
		}
		lotIDs := make([]int, 0, len(items))
		for _, item := range items {
			if item != nil && item.LotID != nil {
				lotIDs = append(lotIDs, *item.LotID)
			}
		}
		if err := lockInventoryLots(ctx, tx, lotIDs); err != nil {
			return nil, err
		}
	}

	inspections, err := tx.client.QualityInspection.Query().Where(
		qualityinspection.PurchaseReceiptID(receipt.ID),
		qualityinspection.SourceType(biz.QualityInspectionSourcePurchaseReceipt),
		qualityinspection.InspectionType(biz.QualityInspectionTypeIncoming),
	).Order(ent.Asc(qualityinspection.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	byItemID := make(map[int][]*ent.QualityInspection, len(items))
	for _, inspection := range inspections {
		if inspection.PurchaseReceiptItemID == nil {
			return nil, biz.ErrBadParam
		}
		byItemID[*inspection.PurchaseReceiptItemID] = append(byItemID[*inspection.PurchaseReceiptItemID], inspection)
	}

	gate := &biz.PurchaseReceiptQualityGate{
		PurchaseReceiptID: receipt.ID,
		Outcome:           biz.PurchaseReceiptQualityGateReady,
		TotalLines:        len(items),
		PendingLineIDs:    []int{},
		RejectedLineIDs:   []int{},
	}
	for _, item := range items {
		if item == nil || item.ReceiptID != receipt.ID || item.LotID == nil {
			gate.PendingLineIDs = append(gate.PendingLineIDs, itemIDOrZero(item))
			continue
		}
		lot, err := tx.client.InventoryLot.Get(ctx, *item.LotID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrInventoryLotNotFound
			}
			return nil, err
		}
		if lot.SubjectType != biz.InventorySubjectMaterial || lot.SubjectID != item.MaterialID {
			return nil, biz.ErrBadParam
		}

		linePassed := false
		linePending := false
		lineRejected := false
		for _, inspection := range byItemID[item.ID] {
			if inspection.PurchaseReceiptID == nil || *inspection.PurchaseReceiptID != receipt.ID ||
				inspection.InventoryLotID == nil || *inspection.InventoryLotID != *item.LotID ||
				inspection.MaterialID == nil || *inspection.MaterialID != item.MaterialID ||
				inspection.WarehouseID == nil || *inspection.WarehouseID != item.WarehouseID {
				return nil, biz.ErrBadParam
			}
			switch inspection.Status {
			case biz.QualityInspectionStatusPassed:
				if inspection.Result == nil || (*inspection.Result != biz.QualityInspectionResultPass && *inspection.Result != biz.QualityInspectionResultConcession) {
					return nil, biz.ErrBadParam
				}
				linePassed = true
			case biz.QualityInspectionStatusRejected:
				if inspection.Result == nil || *inspection.Result != biz.QualityInspectionResultReject {
					return nil, biz.ErrBadParam
				}
				lineRejected = true
			case biz.QualityInspectionStatusDraft, biz.QualityInspectionStatusSubmitted:
				linePending = true
			case biz.QualityInspectionStatusCancelled:
				// Cancelled inspections are historical attempts. A replacement
				// submitted/passed inspection on the same receipt line owns the gate.
			default:
				return nil, biz.ErrBadParam
			}
		}
		switch {
		case lineRejected:
			gate.RejectedLineIDs = append(gate.RejectedLineIDs, item.ID)
		case linePending || !linePassed || lot.Status != biz.InventoryLotActive:
			gate.PendingLineIDs = append(gate.PendingLineIDs, item.ID)
		default:
			gate.PassedLines++
		}
	}
	switch {
	case len(gate.RejectedLineIDs) > 0:
		gate.Outcome = biz.PurchaseReceiptQualityGateRejected
	case len(gate.PendingLineIDs) > 0:
		gate.Outcome = biz.PurchaseReceiptQualityGatePending
	default:
		gate.Outcome = biz.PurchaseReceiptQualityGateReady
	}
	return gate, nil
}

func itemIDOrZero(item *ent.PurchaseReceiptItem) int {
	if item == nil {
		return 0
	}
	return item.ID
}

func lockPurchaseReceiptIncomingQualityInspections(ctx context.Context, tx *inventoryDBTx, receiptID int) error {
	if tx.dialect != dialect.Postgres {
		return nil
	}
	rows, err := tx.sqlTx.QueryContext(ctx, `
SELECT id
FROM quality_inspections
WHERE purchase_receipt_id = $1
  AND source_type = $2
  AND inspection_type = $3
ORDER BY id
FOR UPDATE`, receiptID, biz.QualityInspectionSourcePurchaseReceipt, biz.QualityInspectionTypeIncoming)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return err
		}
	}
	return rows.Err()
}

func lockInventoryLots(ctx context.Context, tx *inventoryDBTx, lotIDs []int) error {
	if tx.dialect != dialect.Postgres || len(lotIDs) == 0 {
		return nil
	}
	unique := make(map[int]struct{}, len(lotIDs))
	for _, id := range lotIDs {
		if id > 0 {
			unique[id] = struct{}{}
		}
	}
	ordered := make([]int, 0, len(unique))
	for id := range unique {
		ordered = append(ordered, id)
	}
	sort.Ints(ordered)
	placeholders := inventorySQLPlaceholders(tx.dialect, len(ordered))
	args := make([]any, 0, len(ordered))
	for _, id := range ordered {
		args = append(args, id)
	}
	rows, err := tx.sqlTx.QueryContext(ctx, fmt.Sprintf(
		`SELECT id FROM inventory_lots WHERE id IN (%s) ORDER BY id FOR UPDATE`,
		strings.Join(placeholders, ", "),
	), args...)
	if err != nil {
		return err
	}
	defer func() { _ = rows.Close() }()
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
	if locked != len(ordered) {
		return biz.ErrInventoryLotNotFound
	}
	return nil
}

func (r *inventoryRepo) decideSubmittedQualityInspection(
	ctx context.Context,
	in *biz.QualityInspectionDecision,
	targetInspectionStatus string,
	targetLotStatus string,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.QualityInspection, error) {
	if in == nil || in.InspectionID <= 0 {
		return nil, biz.ErrBadParam
	}
	preview, err := r.data.postgres.QualityInspection.Get(ctx, in.InspectionID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrQualityInspectionNotFound
		}
		return nil, err
	}
	if isProductionWIPQualityInspection(preview) {
		if command != nil {
			return nil, biz.ErrBadParam
		}
		return r.decideProductionWIPQualityInspection(ctx, preview, in, targetInspectionStatus)
	}

	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	row, err := getLockedQualityInspection(ctx, tx, in.InspectionID)
	if err != nil {
		return nil, err
	}
	transition, ok := corestatus.DecideQualityInspection(row.Status, targetInspectionStatus)
	if !ok {
		return nil, biz.ErrBadParam
	}
	if !transition.Changed {
		if !qualityInspectionDefectRateMatches(row, in) {
			return nil, biz.ErrIdempotencyConflict
		}
		if command != nil {
			if !qualityInspectionDecisionMatches(row, in, targetInspectionStatus) {
				return nil, biz.ErrIdempotencyConflict
			}
			if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, result, actorID); err != nil {
				return nil, err
			}
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return entQualityInspectionToBiz(row), nil
	}
	defectRateOperator, defectRatePercent, err := biz.NormalizeQualityInspectionDefectRate(in.DefectRateOperator, in.DefectRatePercent, true)
	if err != nil {
		return nil, err
	}
	lotID := optionalIntValueOrZero(row.InventoryLotID)
	if lotID <= 0 {
		return nil, biz.ErrBadParam
	}
	if err := lockInventoryLot(ctx, tx, lotID); err != nil {
		return nil, err
	}
	lot, err := tx.client.InventoryLot.Get(ctx, lotID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrInventoryLotNotFound
		}
		return nil, err
	}
	if lot.Status != biz.InventoryLotHold {
		return nil, biz.ErrBadParam
	}
	inspectorID := in.InspectorID
	if inspectorID == nil {
		inspectorID = row.InspectorID
	}
	decisionNote := in.DecisionNote
	if decisionNote == nil {
		decisionNote = row.DecisionNote
	}
	if err := updateQualityInspectionDecision(ctx, tx, row.ID, targetInspectionStatus, in.Result, in.InspectedAt, inspectorID, defectRateOperator, defectRatePercent, decisionNote); err != nil {
		return nil, err
	}
	if targetLotStatus != lot.Status {
		if err := updateInventoryLotStatus(ctx, tx, lotID, targetLotStatus); err != nil {
			return nil, err
		}
	}
	row, err = tx.client.QualityInspection.Get(ctx, row.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrQualityInspectionNotFound
		}
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
	return entQualityInspectionToBiz(row), nil
}

func qualityInspectionDecisionMatches(row *ent.QualityInspection, in *biz.QualityInspectionDecision, targetStatus string) bool {
	if row == nil || in == nil || row.Status != targetStatus || row.Result == nil || *row.Result != in.Result ||
		row.InspectedAt == nil || (!in.InspectedAtDefaulted && !row.InspectedAt.Equal(in.InspectedAt)) ||
		!qualityInspectionDefectRateMatches(row, in) {
		return false
	}
	inspectorID := in.InspectorID
	if inspectorID == nil {
		inspectorID = row.InspectorID
	}
	if !sameOptionalInt(row.InspectorID, inspectorID) {
		return false
	}
	decisionNote := in.DecisionNote
	if decisionNote == nil {
		decisionNote = row.DecisionNote
	}
	return sameOptionalString(row.DecisionNote, decisionNote)
}

func qualityInspectionDefectRateMatches(row *ent.QualityInspection, in *biz.QualityInspectionDecision) bool {
	if row == nil || in == nil || !sameOptionalString(row.DefectRateOperator, in.DefectRateOperator) {
		return false
	}
	if row.DefectRatePercent == nil || in.DefectRatePercent == nil {
		return row.DefectRatePercent == nil && in.DefectRatePercent == nil
	}
	return row.DefectRatePercent.Equal(*in.DefectRatePercent)
}

type productionWIPQualityActionContext struct {
	batch      *ent.ProductionWIPBatch
	operation  *ent.ProductionOrderOperation
	inspection *ent.QualityInspection
	rows       []*ent.QualityInspection
	gateIndex  int
}

func isProductionWIPQualityInspection(row *ent.QualityInspection) bool {
	if row == nil {
		return false
	}
	return row.ProductionWipBatchID != nil || optionalStringValueOrEmpty(row.SourceType) == biz.QualityInspectionSourceProductionWIP
}

func validateProductionWIPQualityInspectionRead(row *ent.QualityInspection) error {
	if !isProductionWIPQualityInspection(row) {
		return nil
	}
	batch := row.Edges.ProductionWipBatch
	if batch == nil {
		return biz.ErrProductionWIPInvalidRoute
	}
	if err := validateProductionWIPQualityInspectionRow(row, batch); err != nil {
		return err
	}
	return biz.ValidateProductionWIPQualityDecision(biz.ProductionWIPQualityDecision{
		GateCode: optionalStringValueOrEmpty(row.GateCode),
		Status:   row.Status,
		Result:   row.Result,
	})
}

func (r *inventoryRepo) submitProductionWIPQualityInspection(ctx context.Context, preview *ent.QualityInspection) (*biz.QualityInspection, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	action, err := getProductionWIPQualityActionContext(ctx, tx, preview)
	if err != nil {
		return nil, err
	}
	if action.inspection.Status != biz.QualityInspectionStatusDraft {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	if err := updateProductionWIPQualityInspectionSubmitted(ctx, tx, action.inspection.ID); err != nil {
		return nil, err
	}
	row, err := tx.client.QualityInspection.Get(ctx, action.inspection.ID)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entQualityInspectionToBiz(row), nil
}

func (r *inventoryRepo) decideProductionWIPQualityInspection(
	ctx context.Context,
	preview *ent.QualityInspection,
	in *biz.QualityInspectionDecision,
	targetStatus string,
) (*biz.QualityInspection, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	action, err := getProductionWIPQualityActionContext(ctx, tx, preview)
	if err != nil {
		return nil, err
	}
	if action.inspection.Status != biz.QualityInspectionStatusSubmitted {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	switch targetStatus {
	case biz.QualityInspectionStatusPassed:
		// Production-stage concession needs a gate-specific approval policy and
		// audit trail. Until that policy exists, fail closed instead of letting
		// the generic quality update permission waive a frozen route gate.
		if in.Result != biz.QualityInspectionResultPass {
			return nil, biz.ErrProductionWIPInvalidTransition
		}
	case biz.QualityInspectionStatusRejected:
		if in.Result != biz.QualityInspectionResultReject {
			return nil, biz.ErrProductionWIPInvalidTransition
		}
	default:
		return nil, biz.ErrBadParam
	}
	defectRateOperator, defectRatePercent, err := biz.NormalizeQualityInspectionDefectRate(in.DefectRateOperator, in.DefectRatePercent, true)
	if err != nil {
		return nil, err
	}
	inspectorID := in.InspectorID
	if inspectorID == nil {
		inspectorID = action.inspection.InspectorID
	}
	decisionNote := in.DecisionNote
	if decisionNote == nil {
		decisionNote = action.inspection.DecisionNote
	}
	if err := updateQualityInspectionDecision(
		ctx,
		tx,
		action.inspection.ID,
		targetStatus,
		in.Result,
		in.InspectedAt,
		inspectorID,
		defectRateOperator,
		defectRatePercent,
		decisionNote,
	); err != nil {
		return nil, err
	}

	if targetStatus == biz.QualityInspectionStatusRejected {
		if err := updateProductionWIPBatchQualityStatus(ctx, tx, action.batch, biz.ProductionWIPStatusRejected); err != nil {
			return nil, err
		}
	} else if action.gateIndex+1 < len(action.operation.RequiredQualityGates) {
		nextGate := action.operation.RequiredQualityGates[action.gateIndex+1]
		if _, err := createProductionWIPQualityGateDraft(ctx, tx.client, action.batch.ID, nextGate, false); err != nil {
			return nil, err
		}
	} else if err := updateProductionWIPBatchQualityStatus(ctx, tx, action.batch, biz.ProductionWIPStatusAccepted); err != nil {
		return nil, err
	}

	row, err := tx.client.QualityInspection.Get(ctx, action.inspection.ID)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entQualityInspectionToBiz(row), nil
}

func (r *inventoryRepo) cancelProductionWIPQualityInspection(
	ctx context.Context,
	preview *ent.QualityInspection,
	decisionNote *string,
) (*biz.QualityInspection, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	action, err := getProductionWIPQualityActionContext(ctx, tx, preview)
	if err != nil {
		return nil, err
	}
	if action.inspection.Status != biz.QualityInspectionStatusDraft && action.inspection.Status != biz.QualityInspectionStatusSubmitted {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	note := decisionNote
	if note == nil {
		note = action.inspection.DecisionNote
	}
	if err := updateQualityInspectionCancelled(ctx, tx, action.inspection.ID, note); err != nil {
		return nil, err
	}
	if _, err := createProductionWIPQualityGateDraft(
		ctx,
		tx.client,
		action.batch.ID,
		action.operation.RequiredQualityGates[action.gateIndex],
		true,
	); err != nil {
		return nil, err
	}
	row, err := tx.client.QualityInspection.Get(ctx, action.inspection.ID)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entQualityInspectionToBiz(row), nil
}

// WIP quality actions participate in the same lock order as production route
// completion: batch first, then inspection. The initial unlocked read is only
// a routing hint; every source anchor and lifecycle state is checked again
// after both rows are locked.
func getProductionWIPQualityActionContext(
	ctx context.Context,
	tx *inventoryDBTx,
	preview *ent.QualityInspection,
) (*productionWIPQualityActionContext, error) {
	if tx == nil || preview == nil || preview.ID <= 0 || preview.ProductionWipBatchID == nil || *preview.ProductionWipBatchID <= 0 {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	batchID := *preview.ProductionWipBatchID
	if err := lockProductionWIPBatchForQuality(ctx, tx, batchID); err != nil {
		return nil, err
	}
	batch, err := tx.client.ProductionWIPBatch.Get(ctx, batchID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionWIPInvalidTransition
		}
		return nil, err
	}
	inspection, err := getLockedQualityInspection(ctx, tx, preview.ID)
	if err != nil {
		return nil, err
	}
	if inspection.ProductionWipBatchID == nil || *inspection.ProductionWipBatchID != batch.ID ||
		preview.ProductionWipBatchID == nil || *preview.ProductionWipBatchID != *inspection.ProductionWipBatchID {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	operation, err := tx.client.ProductionOrderOperation.Get(ctx, batch.ProductionOrderOperationID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionWIPInvalidRoute
		}
		return nil, err
	}
	if batch.Status != biz.ProductionWIPStatusWaitingQuality ||
		operation.ID != batch.ProductionOrderOperationID ||
		operation.ProductionOrderID != batch.ProductionOrderID ||
		operation.ProductionOrderItemID != batch.ProductionOrderItemID ||
		len(operation.RequiredQualityGates) == 0 {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	rows, err := tx.client.QualityInspection.Query().
		Where(qualityinspection.ProductionWipBatchID(batch.ID)).
		Order(ent.Asc(qualityinspection.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	gateIndex, currentID, err := currentProductionWIPQualityGate(batch, operation, rows)
	if err != nil {
		return nil, err
	}
	if currentID != inspection.ID {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	return &productionWIPQualityActionContext{
		batch: batch, operation: operation, inspection: inspection, rows: rows, gateIndex: gateIndex,
	}, nil
}

func currentProductionWIPQualityGate(
	batch *ent.ProductionWIPBatch,
	operation *ent.ProductionOrderOperation,
	rows []*ent.QualityInspection,
) (int, int, error) {
	if batch == nil || operation == nil || len(operation.RequiredQualityGates) == 0 {
		return -1, 0, biz.ErrProductionWIPInvalidRoute
	}
	activeByGate := make(map[string]*ent.QualityInspection, len(operation.RequiredQualityGates))
	requiredIndexes := make(map[string]int, len(operation.RequiredQualityGates))
	for index, rawGate := range operation.RequiredQualityGates {
		gate := strings.ToUpper(strings.TrimSpace(rawGate))
		if !isKnownProductionWIPQualityGate(gate) {
			return -1, 0, biz.ErrProductionWIPInvalidRoute
		}
		if _, duplicate := requiredIndexes[gate]; duplicate {
			return -1, 0, biz.ErrProductionWIPInvalidRoute
		}
		requiredIndexes[gate] = index
	}
	for _, row := range rows {
		if err := validateProductionWIPQualityInspectionRow(row, batch); err != nil {
			return -1, 0, err
		}
		gate := optionalStringValueOrEmpty(row.GateCode)
		if err := biz.ValidateProductionWIPQualityDecision(biz.ProductionWIPQualityDecision{
			GateCode: gate,
			Status:   row.Status,
			Result:   row.Result,
		}); err != nil {
			return -1, 0, err
		}
		if row.Status == biz.QualityInspectionStatusCancelled {
			continue
		}
		if _, required := requiredIndexes[gate]; !required {
			return -1, 0, biz.ErrProductionWIPInvalidRoute
		}
		if _, duplicate := activeByGate[gate]; duplicate {
			return -1, 0, biz.ErrProductionWIPInvalidTransition
		}
		activeByGate[gate] = row
	}
	for index, rawGate := range operation.RequiredQualityGates {
		gate := strings.ToUpper(strings.TrimSpace(rawGate))
		row := activeByGate[gate]
		if row == nil {
			return -1, 0, biz.ErrProductionWIPQualityGateIncomplete
		}
		switch row.Status {
		case biz.QualityInspectionStatusPassed:
		case biz.QualityInspectionStatusDraft, biz.QualityInspectionStatusSubmitted:
			for laterIndex := index + 1; laterIndex < len(operation.RequiredQualityGates); laterIndex++ {
				laterGate := strings.ToUpper(strings.TrimSpace(operation.RequiredQualityGates[laterIndex]))
				if activeByGate[laterGate] != nil {
					return -1, 0, biz.ErrProductionWIPInvalidTransition
				}
			}
			return index, row.ID, nil
		case biz.QualityInspectionStatusRejected:
			return -1, 0, biz.ErrProductionWIPInvalidTransition
		default:
			return -1, 0, biz.ErrProductionWIPInvalidTransition
		}
	}
	return -1, 0, biz.ErrProductionWIPInvalidTransition
}

func validateProductionWIPQualityInspectionRow(row *ent.QualityInspection, batch *ent.ProductionWIPBatch) error {
	if row == nil || batch == nil || row.ProductionWipBatchID == nil || *row.ProductionWipBatchID != batch.ID ||
		row.GateCode == nil || strings.TrimSpace(*row.GateCode) == "" ||
		optionalStringValueOrEmpty(row.SourceType) != biz.QualityInspectionSourceProductionWIP ||
		optionalIntValueOrZero(row.SourceID) != batch.ID ||
		optionalStringValueOrEmpty(row.InspectionType) != biz.QualityInspectionTypeProductionStage ||
		optionalStringValueOrEmpty(row.SubjectType) != biz.QualityInspectionSubjectWIP ||
		optionalIntValueOrZero(row.SubjectID) != batch.ID ||
		row.InventoryLotID != nil || row.WarehouseID != nil || row.MaterialID != nil ||
		row.PurchaseReceiptID != nil || row.PurchaseReceiptItemID != nil {
		return biz.ErrProductionWIPInvalidRoute
	}
	return nil
}

func lockProductionWIPBatchForQuality(ctx context.Context, tx *inventoryDBTx, batchID int) error {
	if tx == nil || batchID <= 0 {
		return biz.ErrBadParam
	}
	if tx.dialect != dialect.Postgres {
		return nil
	}
	var lockedID int
	if err := tx.sqlTx.QueryRowContext(ctx, `SELECT id FROM production_wip_batches WHERE id = $1 FOR UPDATE`, batchID).Scan(&lockedID); err != nil {
		if errors.Is(err, stdsql.ErrNoRows) {
			return biz.ErrProductionWIPInvalidTransition
		}
		return err
	}
	return nil
}

func updateProductionWIPQualityInspectionSubmitted(ctx context.Context, tx *inventoryDBTx, inspectionID int) error {
	p := inventorySQLPlaceholders(tx.dialect, 4)
	query := fmt.Sprintf(
		`UPDATE quality_inspections SET status = %s, updated_at = %s WHERE id = %s AND status = %s`,
		p[0], p[1], p[2], p[3],
	)
	result, err := tx.sqlTx.ExecContext(
		ctx,
		query,
		biz.QualityInspectionStatusSubmitted,
		time.Now(),
		inspectionID,
		biz.QualityInspectionStatusDraft,
	)
	if err != nil {
		return err
	}
	return requireQualityInspectionRowsAffected(result)
}

func updateProductionWIPBatchQualityStatus(
	ctx context.Context,
	tx *inventoryDBTx,
	batch *ent.ProductionWIPBatch,
	targetStatus string,
) error {
	if batch == nil || (targetStatus != biz.ProductionWIPStatusAccepted && targetStatus != biz.ProductionWIPStatusRejected) {
		return biz.ErrBadParam
	}
	p := inventorySQLPlaceholders(tx.dialect, 5)
	query := fmt.Sprintf(
		`UPDATE production_wip_batches SET status = %s, version = version + 1, updated_at = %s WHERE id = %s AND status = %s AND version = %s`,
		p[0], p[1], p[2], p[3], p[4],
	)
	result, err := tx.sqlTx.ExecContext(
		ctx,
		query,
		targetStatus,
		time.Now(),
		batch.ID,
		biz.ProductionWIPStatusWaitingQuality,
		batch.Version,
	)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return biz.ErrProductionWIPInvalidTransition
	}
	return nil
}

func createProductionWIPQualityGateDraft(
	ctx context.Context,
	client *ent.Client,
	batchID int,
	gateCode string,
	replacement bool,
) (*ent.QualityInspection, error) {
	gateCode = strings.ToUpper(strings.TrimSpace(gateCode))
	if client == nil || batchID <= 0 || !isKnownProductionWIPQualityGate(gateCode) {
		return nil, biz.ErrBadParam
	}
	inspectionNo := fmt.Sprintf("WIP-%d-%s", batchID, gateCode)
	count, err := client.QualityInspection.Query().Where(
		qualityinspection.ProductionWipBatchID(batchID),
		qualityinspection.GateCode(gateCode),
	).Count(ctx)
	if err != nil {
		return nil, err
	}
	if replacement || count > 0 {
		inspectionNo = fmt.Sprintf("WIP-%d-%s-R%02d", batchID, gateCode, count+1)
	}
	return client.QualityInspection.Create().
		SetInspectionNo(inspectionNo).
		SetProductionWipBatchID(batchID).
		SetGateCode(gateCode).
		SetSourceType(biz.QualityInspectionSourceProductionWIP).
		SetSourceID(batchID).
		SetInspectionType(biz.QualityInspectionTypeProductionStage).
		SetSubjectType(biz.QualityInspectionSubjectWIP).
		SetSubjectID(batchID).
		SetStatus(biz.QualityInspectionStatusDraft).
		Save(ctx)
}

func isKnownProductionWIPQualityGate(gate string) bool {
	switch gate {
	case biz.ProductionWIPQualityGateCutPiece,
		biz.ProductionWIPQualityGateShell,
		biz.ProductionWIPQualityGateFinishedGoods,
		biz.ProductionWIPQualityGateNeedle,
		biz.ProductionWIPQualityGateSampling,
		biz.ProductionWIPQualityGateCustomerAcceptance:
		return true
	default:
		return false
	}
}

func validateQualityInspectionReferences(ctx context.Context, client *ent.Client, in *biz.QualityInspectionCreate) error {
	if in == nil {
		return biz.ErrBadParam
	}
	switch in.SourceType {
	case biz.QualityInspectionSourcePurchaseReceipt:
		return validateIncomingQualityInspectionReferences(ctx, client, in)
	case biz.QualityInspectionSourceShipment:
		return validateFinishedGoodsQualityInspectionReferences(ctx, client, in)
	case biz.QualityInspectionSourceOutsourcingFact:
		return validateOutsourcingReturnQualityInspectionReferences(ctx, client, in)
	case biz.QualityInspectionSourceProductionWIP:
		return validateProductionWIPQualityInspectionReferences(ctx, client, in)
	case biz.QualityInspectionSourceSalesReturn:
		return validateSalesReturnQualityInspectionReferences(ctx, client, in)
	default:
		return biz.ErrBadParam
	}
}

func validateSalesReturnQualityInspectionReferences(ctx context.Context, client *ent.Client, in *biz.QualityInspectionCreate) error {
	if client == nil || in == nil || in.SourceID <= 0 || in.InventoryLotID <= 0 || in.WarehouseID <= 0 || in.SubjectID <= 0 ||
		in.SourceType != biz.QualityInspectionSourceSalesReturn || in.InspectionType != biz.QualityInspectionTypeCustomerReturn ||
		in.SubjectType != biz.QualityInspectionSubjectProduct || in.MaterialID != 0 || in.PurchaseReceiptID != 0 || in.PurchaseReceiptItemID != nil || in.ProductionWIPBatchID != 0 {
		return biz.ErrBadParam
	}
	parent, err := client.SalesReturn.Get(ctx, in.SourceID)
	if err != nil || (parent.Status != biz.SalesReturnStatusApproved && parent.Status != biz.SalesReturnStatusReceived) {
		return biz.ErrBadParam
	}
	matched, err := client.SalesReturnItem.Query().Where(salesreturnitem.SalesReturnID(in.SourceID), salesreturnitem.LotID(in.InventoryLotID), salesreturnitem.ProductID(in.SubjectID), salesreturnitem.WarehouseID(in.WarehouseID)).Exist(ctx)
	if err != nil || !matched {
		return biz.ErrBadParam
	}
	return nil
}

func validateProductionWIPQualityInspectionReferences(ctx context.Context, client *ent.Client, in *biz.QualityInspectionCreate) error {
	if client == nil || in == nil || strings.TrimSpace(in.InspectionNo) == "" ||
		in.ProductionWIPBatchID <= 0 || strings.TrimSpace(in.GateCode) == "" ||
		in.SourceType != biz.QualityInspectionSourceProductionWIP || in.SourceID != in.ProductionWIPBatchID ||
		in.InspectionType != biz.QualityInspectionTypeProductionStage ||
		in.SubjectType != biz.QualityInspectionSubjectWIP || in.SubjectID != in.ProductionWIPBatchID ||
		in.InventoryLotID != 0 || in.WarehouseID != 0 || in.MaterialID != 0 ||
		in.PurchaseReceiptID != 0 || in.PurchaseReceiptItemID != nil {
		return biz.ErrProductionWIPInvalidRoute
	}
	batch, err := client.ProductionWIPBatch.Get(ctx, in.ProductionWIPBatchID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrProductionWIPInvalidTransition
		}
		return err
	}
	operation, err := client.ProductionOrderOperation.Get(ctx, batch.ProductionOrderOperationID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrProductionWIPInvalidRoute
		}
		return err
	}
	if batch.Status != biz.ProductionWIPStatusWaitingQuality ||
		operation.ProductionOrderID != batch.ProductionOrderID ||
		operation.ProductionOrderItemID != batch.ProductionOrderItemID {
		return biz.ErrProductionWIPInvalidTransition
	}
	gateCode := strings.ToUpper(strings.TrimSpace(in.GateCode))
	if !isKnownProductionWIPQualityGate(gateCode) {
		return biz.ErrProductionWIPInvalidRoute
	}
	for _, rawGate := range operation.RequiredQualityGates {
		if strings.ToUpper(strings.TrimSpace(rawGate)) == gateCode {
			return nil
		}
	}
	return biz.ErrProductionWIPInvalidRoute
}

func validateIncomingQualityInspectionReferences(ctx context.Context, client *ent.Client, in *biz.QualityInspectionCreate) error {
	receipt, err := client.PurchaseReceipt.Get(ctx, in.PurchaseReceiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrPurchaseReceiptNotFound
		}
		return err
	}
	if receipt.Status != biz.PurchaseReceiptStatusDraft && !corestatus.IsPurchaseReceiptPosted(receipt.Status) {
		return biz.ErrBadParam
	}
	lot, err := client.InventoryLot.Get(ctx, in.InventoryLotID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrInventoryLotNotFound
		}
		return err
	}
	if err := validateQualityInspectionLot(lot, in.MaterialID); err != nil {
		return err
	}
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
	if in.PurchaseReceiptItemID == nil {
		return nil
	}
	item, err := client.PurchaseReceiptItem.Get(ctx, *in.PurchaseReceiptItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrPurchaseReceiptItemNotFound
		}
		return err
	}
	if item.ReceiptID != in.PurchaseReceiptID ||
		item.MaterialID != in.MaterialID ||
		item.WarehouseID != in.WarehouseID ||
		item.LotID == nil ||
		*item.LotID != in.InventoryLotID {
		return biz.ErrBadParam
	}
	return nil
}

func validateFinishedGoodsQualityInspectionReferences(ctx context.Context, client *ent.Client, in *biz.QualityInspectionCreate) error {
	parent, err := client.Shipment.Get(ctx, in.SourceID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrShipmentNotFound
		}
		return err
	}
	if parent.Status != biz.ShipmentStatusDraft {
		return biz.ErrBadParam
	}
	if _, err := client.Product.Get(ctx, in.SubjectID); err != nil {
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
	lot, err := client.InventoryLot.Get(ctx, in.InventoryLotID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrInventoryLotNotFound
		}
		return err
	}
	if err := validateFinishedGoodsQualityInspectionLot(lot, in.SubjectID); err != nil {
		return err
	}
	if err := validateInventorySubjectSKU(ctx, client, biz.InventorySubjectProduct, in.SubjectID, lot.ProductSkuID); err != nil {
		return err
	}
	predicates := []predicate.ShipmentItem{
		shipmentitem.ShipmentID(in.SourceID),
		shipmentitem.ProductID(in.SubjectID),
		shipmentitem.WarehouseID(in.WarehouseID),
		shipmentitem.LotID(in.InventoryLotID),
	}
	if lot.ProductSkuID == nil {
		predicates = append(predicates, shipmentitem.ProductSkuIDIsNil())
	} else {
		predicates = append(predicates, shipmentitem.ProductSkuID(*lot.ProductSkuID))
	}
	matched, err := client.ShipmentItem.Query().Where(predicates...).Exist(ctx)
	if err != nil {
		return err
	}
	if !matched {
		return biz.ErrBadParam
	}
	return nil
}

func validateSubmittedQualityInspectionLot(lot *ent.InventoryLot, row *ent.QualityInspection) error {
	if row == nil {
		return biz.ErrBadParam
	}
	switch optionalStringValueOrEmpty(row.SourceType) {
	case biz.QualityInspectionSourcePurchaseReceipt:
		return validateQualityInspectionLot(lot, optionalIntValueOrZero(row.MaterialID))
	case biz.QualityInspectionSourceShipment:
		if optionalStringValueOrEmpty(row.InspectionType) != biz.QualityInspectionTypeFinishedGoods {
			return biz.ErrBadParam
		}
		return validateFinishedGoodsQualityInspectionLot(lot, optionalIntValueOrZero(row.SubjectID))
	case biz.QualityInspectionSourceOutsourcingFact:
		if optionalStringValueOrEmpty(row.InspectionType) != biz.QualityInspectionTypeOutsourcingReturn {
			return biz.ErrBadParam
		}
		return validateFinishedGoodsQualityInspectionLot(lot, optionalIntValueOrZero(row.SubjectID))
	case biz.QualityInspectionSourceSalesReturn:
		if optionalStringValueOrEmpty(row.InspectionType) != biz.QualityInspectionTypeCustomerReturn {
			return biz.ErrBadParam
		}
		return validateFinishedGoodsQualityInspectionLot(lot, optionalIntValueOrZero(row.SubjectID))
	default:
		return biz.ErrBadParam
	}
}

func validateQualityInspectionLot(lot *ent.InventoryLot, materialID int) error {
	if lot.SubjectType != biz.InventorySubjectMaterial || lot.SubjectID != materialID {
		return biz.ErrBadParam
	}
	return nil
}

func validateFinishedGoodsQualityInspectionLot(lot *ent.InventoryLot, productID int) error {
	if lot.SubjectType != biz.InventorySubjectProduct || lot.SubjectID != productID {
		return biz.ErrBadParam
	}
	return nil
}

func getLockedQualityInspection(ctx context.Context, tx *inventoryDBTx, inspectionID int) (*ent.QualityInspection, error) {
	if tx.dialect == dialect.Postgres {
		var id int
		if err := tx.sqlTx.QueryRowContext(ctx, `SELECT id FROM quality_inspections WHERE id = $1 FOR UPDATE`, inspectionID).Scan(&id); err != nil {
			if errors.Is(err, stdsql.ErrNoRows) {
				return nil, biz.ErrQualityInspectionNotFound
			}
			return nil, err
		}
	}
	row, err := tx.client.QualityInspection.Get(ctx, inspectionID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrQualityInspectionNotFound
		}
		return nil, err
	}
	return row, nil
}

func updateQualityInspectionSubmitted(ctx context.Context, tx *inventoryDBTx, inspectionID int, originalLotStatus string) error {
	p := inventorySQLPlaceholders(tx.dialect, 4)
	query := fmt.Sprintf(
		`UPDATE quality_inspections SET status = %s, original_lot_status = %s, updated_at = %s WHERE id = %s`,
		p[0], p[1], p[2], p[3],
	)
	result, err := tx.sqlTx.ExecContext(ctx, query, biz.QualityInspectionStatusSubmitted, originalLotStatus, time.Now(), inspectionID)
	if err != nil {
		return err
	}
	return requireQualityInspectionRowsAffected(result)
}

func updateQualityInspectionDecision(ctx context.Context, tx *inventoryDBTx, inspectionID int, status string, result string, inspectedAt time.Time, inspectorID *int, defectRateOperator *string, defectRatePercent *decimal.Decimal, decisionNote *string) error {
	p := inventorySQLPlaceholders(tx.dialect, 10)
	query := fmt.Sprintf(
		`UPDATE quality_inspections SET status = %s, result = %s, inspected_at = %s, inspector_id = %s, defect_rate_operator = %s, defect_rate_percent = %s, decision_note = %s, updated_at = %s WHERE id = %s AND status = %s`,
		p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9],
	)
	resultRow, err := tx.sqlTx.ExecContext(ctx, query,
		status,
		result,
		inspectedAt,
		optionalIntSQLValue(inspectorID),
		optionalStringSQLValue(defectRateOperator),
		optionalDecimalSQLValue(defectRatePercent),
		optionalStringSQLValue(decisionNote),
		time.Now(),
		inspectionID,
		biz.QualityInspectionStatusSubmitted,
	)
	if err != nil {
		return err
	}
	return requireQualityInspectionRowsAffected(resultRow)
}

func updateQualityInspectionCancelled(ctx context.Context, tx *inventoryDBTx, inspectionID int, decisionNote *string) error {
	p := inventorySQLPlaceholders(tx.dialect, 6)
	query := fmt.Sprintf(
		`UPDATE quality_inspections SET status = %s, decision_note = %s, updated_at = %s WHERE id = %s AND status IN (%s, %s)`,
		p[0], p[1], p[2], p[3], p[4], p[5],
	)
	result, err := tx.sqlTx.ExecContext(ctx, query,
		biz.QualityInspectionStatusCancelled,
		optionalStringSQLValue(decisionNote),
		time.Now(),
		inspectionID,
		biz.QualityInspectionStatusDraft,
		biz.QualityInspectionStatusSubmitted,
	)
	if err != nil {
		return err
	}
	return requireQualityInspectionRowsAffected(result)
}

func requireQualityInspectionRowsAffected(result stdsql.Result) error {
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return biz.ErrBadParam
	}
	return nil
}

func parsePositiveIntOrZero(value string) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || parsed <= 0 {
		return 0
	}
	return parsed
}

func optionalIntSQLValue(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

func optionalStringSQLValue(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

func optionalDecimalSQLValue(value *decimal.Decimal) any {
	if value == nil {
		return nil
	}
	return *value
}

func optionalStringValueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func optionalIntValueOrZero(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

func positiveIntPtr(value int) *int {
	if value <= 0 {
		return nil
	}
	return &value
}

func nonEmptyStringPtr(value string) *string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	return &value
}

func withProductionWIPQualityContext(query *ent.QualityInspectionQuery) *ent.QualityInspectionQuery {
	return query.WithProductionWipBatch(func(batchQuery *ent.ProductionWIPBatchQuery) {
		batchQuery.
			WithProductionOrder().
			WithProductionOrderItem(func(itemQuery *ent.ProductionOrderItemQuery) {
				itemQuery.WithProduct()
			}).
			WithProductionOrderOperation()
	})
}

func enrichProductionWIPQualityInspection(item *biz.QualityInspection, row *ent.QualityInspection) {
	if item == nil || row == nil || row.Edges.ProductionWipBatch == nil {
		return
	}
	batch := row.Edges.ProductionWipBatch
	batchNo := batch.BatchNo
	batchQuantity := batch.Quantity
	productionOrderItemID := batch.ProductionOrderItemID
	item.WIPBatchNo = &batchNo
	item.BatchQuantity = &batchQuantity
	item.ProductionOrderItemID = &productionOrderItemID
	if batch.Edges.ProductionOrder != nil {
		orderNo := batch.Edges.ProductionOrder.OrderNo
		item.ProductionOrderNo = &orderNo
		item.SourceNo = &orderNo
	}
	if batch.Edges.ProductionOrderOperation != nil {
		operationCode := batch.Edges.ProductionOrderOperation.OperationCode
		operationName := batch.Edges.ProductionOrderOperation.ProcessNameSnapshot
		item.OperationCode = &operationCode
		item.OperationName = &operationName
	}
	if batch.Edges.ProductionOrderItem == nil {
		return
	}
	orderItem := batch.Edges.ProductionOrderItem
	if orderItem.ProductCodeSnapshot != nil && strings.TrimSpace(*orderItem.ProductCodeSnapshot) != "" {
		value := *orderItem.ProductCodeSnapshot
		item.ProductCode = &value
	} else if orderItem.Edges.Product != nil {
		value := orderItem.Edges.Product.Code
		item.ProductCode = &value
	}
	if orderItem.ProductNameSnapshot != nil && strings.TrimSpace(*orderItem.ProductNameSnapshot) != "" {
		value := *orderItem.ProductNameSnapshot
		item.ProductName = &value
	} else if orderItem.Edges.Product != nil {
		value := orderItem.Edges.Product.Name
		item.ProductName = &value
	}
}

func qualityInspectionCreateFromEnt(row *ent.QualityInspection) *biz.QualityInspectionCreate {
	if row == nil {
		return nil
	}
	return &biz.QualityInspectionCreate{
		InspectionNo:          row.InspectionNo,
		PurchaseReceiptID:     optionalIntValueOrZero(row.PurchaseReceiptID),
		PurchaseReceiptItemID: row.PurchaseReceiptItemID,
		InventoryLotID:        optionalIntValueOrZero(row.InventoryLotID),
		ProductionWIPBatchID:  optionalIntValueOrZero(row.ProductionWipBatchID),
		GateCode:              optionalStringValueOrEmpty(row.GateCode),
		MaterialID:            optionalIntValueOrZero(row.MaterialID),
		WarehouseID:           optionalIntValueOrZero(row.WarehouseID),
		SourceType:            optionalStringValueOrEmpty(row.SourceType),
		SourceID:              optionalIntValueOrZero(row.SourceID),
		InspectionType:        optionalStringValueOrEmpty(row.InspectionType),
		SubjectType:           optionalStringValueOrEmpty(row.SubjectType),
		SubjectID:             optionalIntValueOrZero(row.SubjectID),
		InspectorID:           row.InspectorID,
		DecisionNote:          row.DecisionNote,
	}
}

func entQualityInspectionToBiz(row *ent.QualityInspection) *biz.QualityInspection {
	if row == nil {
		return nil
	}
	return &biz.QualityInspection{
		ID:                       row.ID,
		InspectionNo:             row.InspectionNo,
		PurchaseReceiptID:        optionalIntValueOrZero(row.PurchaseReceiptID),
		PurchaseReceiptItemID:    row.PurchaseReceiptItemID,
		InventoryLotID:           optionalIntValueOrZero(row.InventoryLotID),
		ProductionWIPBatchID:     row.ProductionWipBatchID,
		GateCode:                 row.GateCode,
		MaterialID:               optionalIntValueOrZero(row.MaterialID),
		WarehouseID:              optionalIntValueOrZero(row.WarehouseID),
		SourceType:               row.SourceType,
		SourceID:                 row.SourceID,
		InspectionType:           row.InspectionType,
		SubjectType:              row.SubjectType,
		SubjectID:                row.SubjectID,
		Status:                   row.Status,
		Result:                   row.Result,
		OriginalLotStatus:        row.OriginalLotStatus,
		InspectedAt:              row.InspectedAt,
		InspectorID:              row.InspectorID,
		DefectRateOperator:       row.DefectRateOperator,
		DefectRatePercent:        row.DefectRatePercent,
		DecisionNote:             row.DecisionNote,
		CorrectionOfInspectionID: row.CorrectionOfInspectionID,
		SupersededAt:             row.SupersededAt,
		SupersededBy:             row.SupersededBy,
		SupersededReason:         row.SupersededReason,
		CreatedAt:                row.CreatedAt,
		UpdatedAt:                row.UpdatedAt,
	}
}
