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
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/data/model/ent/shipmentitem"

	"entgo.io/ent/dialect"
)

func (r *inventoryRepo) CreateQualityInspectionDraft(ctx context.Context, in *biz.QualityInspectionCreate) (*biz.QualityInspection, error) {
	if err := validateQualityInspectionReferences(ctx, r.data.postgres, in); err != nil {
		return nil, err
	}
	row, err := r.data.postgres.QualityInspection.Create().
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
	if err != nil {
		return nil, err
	}
	return entQualityInspectionToBiz(row), nil
}

func (r *inventoryRepo) CreateFinishedGoodsQualityInspectionDraft(ctx context.Context, in *biz.QualityInspectionCreate) (*biz.QualityInspection, error) {
	if err := validateQualityInspectionReferences(ctx, r.data.postgres, in); err != nil {
		return nil, err
	}
	row, err := r.data.postgres.QualityInspection.Create().
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
	if err != nil {
		return nil, err
	}
	return entQualityInspectionToBiz(row), nil
}

func (r *inventoryRepo) SubmitQualityInspection(ctx context.Context, inspectionID int) (*biz.QualityInspection, error) {
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
	if err := lockInventoryLot(ctx, tx, row.InventoryLotID); err != nil {
		return nil, err
	}
	lot, err := tx.client.InventoryLot.Get(ctx, row.InventoryLotID)
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
			qualityinspection.InventoryLotID(row.InventoryLotID),
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
		if err := updateInventoryLotStatus(ctx, tx, row.InventoryLotID, biz.InventoryLotHold); err != nil {
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
		if err := lockInventoryLot(ctx, tx, row.InventoryLotID); err != nil {
			return nil, err
		}
		lot, err := tx.client.InventoryLot.Get(ctx, row.InventoryLotID)
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
			if err := updateInventoryLotStatus(ctx, tx, row.InventoryLotID, originalLotStatus); err != nil {
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
	row, err := r.data.postgres.QualityInspection.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrQualityInspectionNotFound
		}
		return nil, err
	}
	return entQualityInspectionToBiz(row), nil
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
	rows, err := query.
		Order(ent.Desc(qualityinspection.FieldCreatedAt), ent.Desc(qualityinspection.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.QualityInspection, 0, len(rows))
	for _, row := range rows {
		out = append(out, entQualityInspectionToBiz(row))
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
				inspection.InventoryLotID != *item.LotID ||
				inspection.MaterialID == nil || *inspection.MaterialID != item.MaterialID ||
				inspection.WarehouseID != item.WarehouseID {
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
	if err := lockInventoryLot(ctx, tx, row.InventoryLotID); err != nil {
		return nil, err
	}
	lot, err := tx.client.InventoryLot.Get(ctx, row.InventoryLotID)
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
	if err := updateQualityInspectionDecision(ctx, tx, row.ID, targetInspectionStatus, in.Result, in.InspectedAt, inspectorID, decisionNote); err != nil {
		return nil, err
	}
	if targetLotStatus != lot.Status {
		if err := updateInventoryLotStatus(ctx, tx, row.InventoryLotID, targetLotStatus); err != nil {
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
		row.InspectedAt == nil || (!in.InspectedAtDefaulted && !row.InspectedAt.Equal(in.InspectedAt)) {
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

func validateQualityInspectionReferences(ctx context.Context, client *ent.Client, in *biz.QualityInspectionCreate) error {
	if in == nil {
		return biz.ErrBadParam
	}
	switch in.SourceType {
	case biz.QualityInspectionSourcePurchaseReceipt:
		return validateIncomingQualityInspectionReferences(ctx, client, in)
	case biz.QualityInspectionSourceShipment:
		return validateFinishedGoodsQualityInspectionReferences(ctx, client, in)
	default:
		return biz.ErrBadParam
	}
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

func updateQualityInspectionDecision(ctx context.Context, tx *inventoryDBTx, inspectionID int, status string, result string, inspectedAt time.Time, inspectorID *int, decisionNote *string) error {
	p := inventorySQLPlaceholders(tx.dialect, 8)
	query := fmt.Sprintf(
		`UPDATE quality_inspections SET status = %s, result = %s, inspected_at = %s, inspector_id = %s, decision_note = %s, updated_at = %s WHERE id = %s AND status = %s`,
		p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7],
	)
	resultRow, err := tx.sqlTx.ExecContext(ctx, query,
		status,
		result,
		inspectedAt,
		optionalIntSQLValue(inspectorID),
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

func qualityInspectionCreateFromEnt(row *ent.QualityInspection) *biz.QualityInspectionCreate {
	if row == nil {
		return nil
	}
	return &biz.QualityInspectionCreate{
		InspectionNo:          row.InspectionNo,
		PurchaseReceiptID:     optionalIntValueOrZero(row.PurchaseReceiptID),
		PurchaseReceiptItemID: row.PurchaseReceiptItemID,
		InventoryLotID:        row.InventoryLotID,
		MaterialID:            optionalIntValueOrZero(row.MaterialID),
		WarehouseID:           row.WarehouseID,
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
		ID:                    row.ID,
		InspectionNo:          row.InspectionNo,
		PurchaseReceiptID:     optionalIntValueOrZero(row.PurchaseReceiptID),
		PurchaseReceiptItemID: row.PurchaseReceiptItemID,
		InventoryLotID:        row.InventoryLotID,
		MaterialID:            optionalIntValueOrZero(row.MaterialID),
		WarehouseID:           row.WarehouseID,
		SourceType:            row.SourceType,
		SourceID:              row.SourceID,
		InspectionType:        row.InspectionType,
		SubjectType:           row.SubjectType,
		SubjectID:             row.SubjectID,
		Status:                row.Status,
		Result:                row.Result,
		OriginalLotStatus:     row.OriginalLotStatus,
		InspectedAt:           row.InspectedAt,
		InspectorID:           row.InspectorID,
		DecisionNote:          row.DecisionNote,
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}
}
