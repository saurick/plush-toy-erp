package data

import (
	"context"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/outsourcingreturndisposition"
	"server/internal/data/model/ent/purchaserejectiondisposition"
	"server/internal/data/model/ent/qualityinspection"
)

var _ biz.QualityInspectionCorrectionRepo = (*inventoryRepo)(nil)

func (r *inventoryRepo) CreateQualityInspectionCorrection(ctx context.Context, in *biz.QualityInspectionCorrectionCreate, actorID int) (*biz.QualityInspection, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	original, err := getLockedQualityInspection(ctx, tx, in.InspectionID)
	if err != nil {
		return nil, err
	}
	if original.SupersededAt != nil {
		existing, err := tx.client.QualityInspection.Query().Where(qualityinspection.CorrectionOfInspectionID(original.ID)).Only(ctx)
		if err != nil {
			return nil, err
		}
		if existing.InspectionNo != in.CorrectionInspectionNo || existing.DecisionNote == nil || *existing.DecisionNote != in.Reason {
			return nil, biz.ErrIdempotencyConflict
		}
		return entQualityInspectionToBiz(existing), nil
	}
	if (original.Status != biz.QualityInspectionStatusPassed && original.Status != biz.QualityInspectionStatusRejected) || original.ProductionWipBatchID != nil {
		return nil, biz.ErrBadParam
	}
	if err := validateQualityCorrectionDependencies(ctx, tx, original); err != nil {
		return nil, err
	}
	originalLotStatus := ""
	if original.InventoryLotID != nil {
		if err := lockInventoryLot(ctx, tx, *original.InventoryLotID); err != nil {
			return nil, err
		}
		lot, err := tx.client.InventoryLot.Get(ctx, *original.InventoryLotID)
		if err != nil {
			return nil, err
		}
		originalLotStatus = lot.Status
		if err := updateInventoryLotStatus(ctx, tx, lot.ID, biz.InventoryLotHold); err != nil {
			return nil, err
		}
	}
	row, err := tx.client.QualityInspection.Create().SetInspectionNo(in.CorrectionInspectionNo).SetNillablePurchaseReceiptID(original.PurchaseReceiptID).SetNillablePurchaseReceiptItemID(original.PurchaseReceiptItemID).SetNillableInventoryLotID(original.InventoryLotID).SetNillableMaterialID(original.MaterialID).SetNillableWarehouseID(original.WarehouseID).SetNillableSourceType(original.SourceType).SetNillableSourceID(original.SourceID).SetNillableInspectionType(original.InspectionType).SetNillableSubjectType(original.SubjectType).SetNillableSubjectID(original.SubjectID).SetStatus(biz.QualityInspectionStatusSubmitted).SetOriginalLotStatus(originalLotStatus).SetCorrectionOfInspectionID(original.ID).SetDecisionNote(in.Reason).Save(ctx)
	if err != nil {
		return nil, err
	}
	p := inventorySQLPlaceholders(tx.dialect, 5)
	now := time.Now()
	result, err := tx.sqlTx.ExecContext(ctx, "UPDATE quality_inspections SET superseded_at="+p[0]+", superseded_by="+p[1]+", superseded_reason="+p[2]+", updated_at="+p[3]+" WHERE id="+p[4]+" AND superseded_at IS NULL", now, actorID, in.Reason, now, original.ID)
	if err != nil {
		return nil, err
	}
	n, _ := result.RowsAffected()
	if n != 1 {
		return nil, biz.ErrIdempotencyConflict
	}
	if err := markProcessDomainCommandEffectCompensatedWithClient(
		ctx,
		tx.client,
		biz.ProcessDomainCommandFinishedGoodsQualityDecide,
		"quality_inspection",
		original.ID,
		"原质检判定已撤销并进入重新检验，原流程结果需要确定性恢复",
		actorID,
	); err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return entQualityInspectionToBiz(row), nil
}

func validateQualityCorrectionDependencies(ctx context.Context, tx *inventoryDBTx, row *ent.QualityInspection) error {
	if row.SourceType != nil && *row.SourceType == biz.QualityInspectionSourceSalesReturn {
		return biz.ErrBadParam
	}
	if row.PurchaseReceiptID != nil {
		receipt, err := tx.client.PurchaseReceipt.Get(ctx, *row.PurchaseReceiptID)
		if err != nil {
			return err
		}
		if receipt.Status != biz.PurchaseReceiptStatusDraft {
			return biz.ErrBadParam
		}
		blocked, err := tx.client.PurchaseRejectionDisposition.Query().Where(purchaserejectiondisposition.QualityInspectionID(row.ID), purchaserejectiondisposition.StatusNEQ("CANCELLED")).Exist(ctx)
		if err != nil || blocked {
			if err != nil {
				return err
			}
			return biz.ErrBadParam
		}
	}
	if row.SourceType != nil && row.SourceID != nil && *row.SourceType == biz.QualityInspectionSourceOutsourcingFact {
		blocked, err := tx.client.OutsourcingReturnDisposition.Query().Where(outsourcingreturndisposition.QualityInspectionID(row.ID), outsourcingreturndisposition.StatusNEQ("CANCELLED")).Exist(ctx)
		if err != nil || blocked {
			if err != nil {
				return err
			}
			return biz.ErrBadParam
		}
		finance, err := tx.client.FinanceFact.Query().Where(financefact.SourceType(biz.OutsourcingFactSourceType), financefact.SourceID(*row.SourceID), financefact.StatusNEQ(biz.OperationalFactStatusCancelled)).Exist(ctx)
		if err != nil || finance {
			if err != nil {
				return err
			}
			return biz.ErrBadParam
		}
	}
	if row.SourceType != nil && row.SourceID != nil && *row.SourceType == biz.QualityInspectionSourceShipment {
		shipment, err := tx.client.Shipment.Get(ctx, *row.SourceID)
		if err != nil {
			return err
		}
		if shipment.Status != biz.ShipmentStatusDraft {
			return biz.ErrBadParam
		}
	}
	return nil
}
