package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/qualityinspection"

	"entgo.io/ent/dialect"
)

func (r *inventoryRepo) CreateQualityInspectionDraft(ctx context.Context, in *biz.QualityInspectionCreate) (*biz.QualityInspection, error) {
	if err := validateQualityInspectionReferences(ctx, r.data.postgres, in); err != nil {
		return nil, err
	}
	row, err := r.data.postgres.QualityInspection.Create().
		SetInspectionNo(in.InspectionNo).
		SetPurchaseReceiptID(in.PurchaseReceiptID).
		SetNillablePurchaseReceiptItemID(in.PurchaseReceiptItemID).
		SetInventoryLotID(in.InventoryLotID).
		SetMaterialID(in.MaterialID).
		SetWarehouseID(in.WarehouseID).
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
	if row.Status == biz.QualityInspectionStatusSubmitted {
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return entQualityInspectionToBiz(row), nil
	}
	if row.Status != biz.QualityInspectionStatusDraft {
		return nil, biz.ErrBadParam
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
	if err := validateQualityInspectionLot(lot, row.MaterialID); err != nil {
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
	return r.decideSubmittedQualityInspection(ctx, in, biz.QualityInspectionStatusPassed, biz.InventoryLotActive)
}

func (r *inventoryRepo) RejectQualityInspection(ctx context.Context, in *biz.QualityInspectionDecision) (*biz.QualityInspection, error) {
	return r.decideSubmittedQualityInspection(ctx, in, biz.QualityInspectionStatusRejected, biz.InventoryLotRejected)
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
	if row.Status == biz.QualityInspectionStatusCancelled {
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
	default:
		return nil, biz.ErrBadParam
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

func (r *inventoryRepo) decideSubmittedQualityInspection(ctx context.Context, in *biz.QualityInspectionDecision, targetInspectionStatus, targetLotStatus string) (*biz.QualityInspection, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	row, err := getLockedQualityInspection(ctx, tx, in.InspectionID)
	if err != nil {
		return nil, err
	}
	if row.Status == targetInspectionStatus {
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return entQualityInspectionToBiz(row), nil
	}
	if row.Status != biz.QualityInspectionStatusSubmitted {
		return nil, biz.ErrBadParam
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
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entQualityInspectionToBiz(row), nil
}

func validateQualityInspectionReferences(ctx context.Context, client *ent.Client, in *biz.QualityInspectionCreate) error {
	receipt, err := client.PurchaseReceipt.Get(ctx, in.PurchaseReceiptID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrPurchaseReceiptNotFound
		}
		return err
	}
	if receipt.Status != biz.PurchaseReceiptStatusPosted {
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

func validateQualityInspectionLot(lot *ent.InventoryLot, materialID int) error {
	if lot.SubjectType != biz.InventorySubjectMaterial || lot.SubjectID != materialID {
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

func qualityInspectionCreateFromEnt(row *ent.QualityInspection) *biz.QualityInspectionCreate {
	if row == nil {
		return nil
	}
	return &biz.QualityInspectionCreate{
		InspectionNo:          row.InspectionNo,
		PurchaseReceiptID:     row.PurchaseReceiptID,
		PurchaseReceiptItemID: row.PurchaseReceiptItemID,
		InventoryLotID:        row.InventoryLotID,
		MaterialID:            row.MaterialID,
		WarehouseID:           row.WarehouseID,
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
		PurchaseReceiptID:     row.PurchaseReceiptID,
		PurchaseReceiptItemID: row.PurchaseReceiptItemID,
		InventoryLotID:        row.InventoryLotID,
		MaterialID:            row.MaterialID,
		WarehouseID:           row.WarehouseID,
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
