package data

import (
	"context"
	"fmt"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/salesreturn"
	"server/internal/data/model/ent/salesreturnitem"

	"github.com/shopspring/decimal"
)

var _ biz.SalesReturnRepo = (*operationalFactRepo)(nil)

func (r *operationalFactRepo) CreateSalesReturn(ctx context.Context, in *biz.SalesReturnCreate, actorID int, payloadHash string) (*biz.SalesReturn, error) {
	if in == nil || actorID <= 0 || len(payloadHash) != 64 {
		return nil, biz.ErrBadParam
	}
	if replay, found, err := r.findSalesReturnReplay(ctx, actorID, in.IdempotencyKey, payloadHash); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "shipments", in.ShipmentID, biz.ErrBadParam); err != nil {
		return nil, err
	}
	shipment, err := tx.client.Shipment.Get(ctx, in.ShipmentID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBadParam
		}
		return nil, err
	}
	if shipment.Status != biz.ShipmentStatusShipped || shipment.CustomerID == nil || shipment.CustomerSnapshot == nil {
		return nil, biz.ErrBadParam
	}
	row, err := tx.client.SalesReturn.Create().SetReturnNo(in.ReturnNo).SetShipmentID(shipment.ID).SetCustomerID(*shipment.CustomerID).SetCustomerNameSnapshot(*shipment.CustomerSnapshot).SetReason(in.Reason).SetIdempotencyKey(in.IdempotencyKey).SetIdempotencyPayloadHash(payloadHash).SetIdempotencyItemCount(len(in.Items)).SetCreatedBy(actorID).Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			_ = tx.sqlTx.Rollback()
			tx = nil
			if replay, found, replayErr := r.findSalesReturnReplay(ctx, actorID, in.IdempotencyKey, payloadHash); replayErr != nil || found {
				return replay, replayErr
			}
		}
		return nil, err
	}
	for index, requested := range in.Items {
		if err := lockOperationalFactRow(ctx, tx, "shipment_items", requested.ShipmentItemID, biz.ErrBadParam); err != nil {
			return nil, err
		}
		source, err := tx.client.ShipmentItem.Get(ctx, requested.ShipmentItemID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrBadParam
			}
			return nil, err
		}
		if source.ShipmentID != shipment.ID {
			return nil, biz.ErrBadParam
		}
		existing, err := tx.client.SalesReturnItem.Query().Where(salesreturnitem.ShipmentItemID(source.ID), salesreturnitem.HasSalesReturnWith(salesreturn.StatusNEQ(biz.SalesReturnStatusCancelled))).All(ctx)
		if err != nil {
			return nil, err
		}
		used := decimal.Zero
		for _, item := range existing {
			used = used.Add(item.Quantity)
		}
		if used.Add(requested.Quantity).GreaterThan(source.Quantity) {
			return nil, biz.ErrBadParam
		}
		lineNo := decimal.NewFromInt(int64(index + 1)).String()
		lot, err := tx.client.InventoryLot.Create().SetSubjectType(biz.InventorySubjectProduct).SetSubjectID(source.ProductID).SetNillableProductSkuID(source.ProductSkuID).SetLotNo(fmt.Sprintf("RMA-%d-%s", row.ID, lineNo)).SetStatus(biz.InventoryLotHold).Save(ctx)
		if err != nil {
			return nil, err
		}
		inspection, err := tx.client.QualityInspection.Create().SetInspectionNo(fmt.Sprintf("RMA-QI-%d-%s", row.ID, lineNo)).SetInventoryLotID(lot.ID).SetWarehouseID(source.WarehouseID).SetSourceType(biz.QualityInspectionSourceSalesReturn).SetSourceID(row.ID).SetInspectionType(biz.QualityInspectionTypeCustomerReturn).SetSubjectType(biz.QualityInspectionSubjectProduct).SetSubjectID(source.ProductID).SetStatus(biz.QualityInspectionStatusDraft).Save(ctx)
		if err != nil {
			return nil, err
		}
		_, err = tx.client.SalesReturnItem.Create().SetSalesReturnID(row.ID).SetLineNo(lineNo).SetShipmentItemID(source.ID).SetProductID(source.ProductID).SetNillableProductSkuID(source.ProductSkuID).SetWarehouseID(source.WarehouseID).SetUnitID(source.UnitID).SetLotID(lot.ID).SetQualityInspectionID(inspection.ID).SetQuantity(requested.Quantity).SetCondition("PENDING_INSPECTION").SetNillableNote(requested.Note).Save(ctx)
		if err != nil {
			return nil, err
		}
	}
	out, err := salesReturnWithItems(ctx, tx.client, row)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return out, nil
}

func (r *operationalFactRepo) ApproveSalesReturn(ctx context.Context, in *biz.SalesReturnTransition, actorID int) (*biz.SalesReturn, error) {
	return r.transitionSalesReturn(ctx, in, actorID, biz.SalesReturnStatusApproved)
}
func (r *operationalFactRepo) ReceiveSalesReturn(ctx context.Context, in *biz.SalesReturnTransition, actorID int) (*biz.SalesReturn, error) {
	return r.transitionSalesReturn(ctx, in, actorID, biz.SalesReturnStatusReceived)
}
func (r *operationalFactRepo) CancelSalesReturn(ctx context.Context, in *biz.SalesReturnTransition, actorID int) (*biz.SalesReturn, error) {
	return r.transitionSalesReturn(ctx, in, actorID, biz.SalesReturnStatusCancelled)
}

func (r *operationalFactRepo) transitionSalesReturn(ctx context.Context, in *biz.SalesReturnTransition, actorID int, target string) (*biz.SalesReturn, error) {
	if in == nil {
		return nil, biz.ErrBadParam
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "sales_returns", in.ID, biz.ErrBadParam); err != nil {
		return nil, err
	}
	row, err := tx.client.SalesReturn.Get(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if row.Version != in.ExpectedVersion {
		return nil, biz.ErrIdempotencyConflict
	}
	items, err := tx.client.SalesReturnItem.Query().Where(salesreturnitem.SalesReturnID(row.ID)).Order(ent.Asc(salesreturnitem.FieldID)).All(ctx)
	if err != nil || len(items) == 0 {
		if err != nil {
			return nil, err
		}
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	switch target {
	case biz.SalesReturnStatusApproved:
		if row.Status != biz.SalesReturnStatusDraft {
			return nil, biz.ErrBadParam
		}
	case biz.SalesReturnStatusReceived:
		if row.Status != biz.SalesReturnStatusApproved {
			return nil, biz.ErrBadParam
		}
		for _, item := range items {
			inspection, err := tx.client.QualityInspection.Get(ctx, item.QualityInspectionID)
			if err != nil || inspection.Status != biz.QualityInspectionStatusDraft {
				return nil, biz.ErrBadParam
			}
			if err := r.applySalesReturnInventory(ctx, tx, row, item, false); err != nil {
				return nil, err
			}
			if err := updateQualityInspectionSubmitted(ctx, tx, item.QualityInspectionID, biz.InventoryLotHold); err != nil {
				return nil, err
			}
			if item.LotID != nil {
				p := inventorySQLPlaceholders(tx.dialect, 3)
				if _, err := tx.sqlTx.ExecContext(ctx, "UPDATE inventory_lots SET received_at="+p[0]+", updated_at="+p[1]+" WHERE id="+p[2], now, now, *item.LotID); err != nil {
					return nil, err
				}
			}
		}
	case biz.SalesReturnStatusCancelled:
		if row.Status == biz.SalesReturnStatusCancelled {
			return salesReturnWithItems(ctx, tx.client, row)
		}
		for _, item := range items {
			inspection, err := tx.client.QualityInspection.Get(ctx, item.QualityInspectionID)
			if err != nil || (inspection.Status != biz.QualityInspectionStatusDraft && inspection.Status != biz.QualityInspectionStatusSubmitted) {
				return nil, biz.ErrBadParam
			}
			if row.Status == biz.SalesReturnStatusReceived {
				if err := r.applySalesReturnInventory(ctx, tx, row, item, true); err != nil {
					return nil, err
				}
			}
			if err := updateQualityInspectionCancelled(ctx, tx, item.QualityInspectionID, &in.Reason); err != nil {
				return nil, err
			}
			if item.LotID == nil {
				return nil, biz.ErrBadParam
			}
			if err := updateInventoryLotStatus(ctx, tx, *item.LotID, biz.InventoryLotDisabled); err != nil {
				return nil, err
			}
		}
	default:
		return nil, biz.ErrBadParam
	}
	p := inventorySQLPlaceholders(tx.dialect, 7)
	query := "UPDATE sales_returns SET status=" + p[0] + ", version=version+1, updated_at=" + p[1] + " WHERE id=" + p[2] + " AND version=" + p[3]
	args := []any{target, now, row.ID, row.Version}
	switch target {
	case biz.SalesReturnStatusApproved:
		query = "UPDATE sales_returns SET status=" + p[0] + ", version=version+1, updated_at=" + p[1] + ", approved_at=" + p[2] + ", approved_by=" + p[3] + " WHERE id=" + p[4] + " AND version=" + p[5]
		args = []any{target, now, now, actorID, row.ID, row.Version}
	case biz.SalesReturnStatusReceived:
		query = "UPDATE sales_returns SET status=" + p[0] + ", version=version+1, updated_at=" + p[1] + ", received_at=" + p[2] + ", received_by=" + p[3] + " WHERE id=" + p[4] + " AND version=" + p[5]
		args = []any{target, now, now, actorID, row.ID, row.Version}
	case biz.SalesReturnStatusCancelled:
		query = "UPDATE sales_returns SET status=" + p[0] + ", version=version+1, updated_at=" + p[1] + ", cancelled_at=" + p[2] + ", cancelled_by=" + p[3] + ", cancel_reason=" + p[4] + " WHERE id=" + p[5] + " AND version=" + p[6]
		args = []any{target, now, now, actorID, in.Reason, row.ID, row.Version}
	}
	result, err := tx.sqlTx.ExecContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrIdempotencyConflict
	}
	updated, err := tx.client.SalesReturn.Get(ctx, row.ID)
	if err != nil {
		return nil, err
	}
	out, err := salesReturnWithItems(ctx, tx.client, updated)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return out, nil
}

func (r *operationalFactRepo) applySalesReturnInventory(ctx context.Context, tx *inventoryDBTx, parent *ent.SalesReturn, item *ent.SalesReturnItem, cancel bool) error {
	return r.applyOperationalFactInventory(ctx, tx, operationalFactInventoryArgs{sourceType: biz.SalesReturnSourceType, sourceID: parent.ID, sourceLineID: item.ID, subjectType: biz.InventorySubjectProduct, subjectID: item.ProductID, productSkuID: item.ProductSkuID, warehouseID: item.WarehouseID, lotID: item.LotID, unitID: item.UnitID, quantity: item.Quantity, direction: 1, txnType: biz.InventoryTxnIn, occurredAt: time.Now(), cancel: cancel})
}

func (r *operationalFactRepo) GetSalesReturn(ctx context.Context, id int) (*biz.SalesReturn, error) {
	row, err := r.data.postgres.SalesReturn.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	return salesReturnWithItems(ctx, r.data.postgres, row)
}
func (r *operationalFactRepo) ListSalesReturns(ctx context.Context, filter biz.SalesReturnFilter) ([]*biz.SalesReturn, int, error) {
	query := r.data.postgres.SalesReturn.Query()
	if filter.Status != "" {
		query = query.Where(salesreturn.Status(filter.Status))
	}
	if filter.ShipmentID > 0 {
		query = query.Where(salesreturn.ShipmentID(filter.ShipmentID))
	}
	if filter.CustomerID > 0 {
		query = query.Where(salesreturn.CustomerID(filter.CustomerID))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(salesreturn.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.SalesReturn, 0, len(rows))
	for _, row := range rows {
		item, err := salesReturnWithItems(ctx, r.data.postgres, row)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, item)
	}
	return out, total, nil
}

func (r *operationalFactRepo) findSalesReturnReplay(ctx context.Context, actorID int, key, hash string) (*biz.SalesReturn, bool, error) {
	row, err := r.data.postgres.SalesReturn.Query().Where(salesreturn.CreatedBy(actorID), salesreturn.IdempotencyKey(key)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.IdempotencyPayloadHash != hash {
		return nil, true, biz.ErrIdempotencyConflict
	}
	out, err := salesReturnWithItems(ctx, r.data.postgres, row)
	return out, true, err
}

func salesReturnWithItems(ctx context.Context, client *ent.Client, row *ent.SalesReturn) (*biz.SalesReturn, error) {
	items, err := client.SalesReturnItem.Query().Where(salesreturnitem.SalesReturnID(row.ID)).Order(ent.Asc(salesreturnitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	out := entSalesReturnToBiz(row)
	for _, item := range items {
		out.Items = append(out.Items, &biz.SalesReturnItem{ID: item.ID, SalesReturnID: item.SalesReturnID, LineNo: item.LineNo, ShipmentItemID: item.ShipmentItemID, ProductID: item.ProductID, ProductSkuID: item.ProductSkuID, WarehouseID: item.WarehouseID, UnitID: item.UnitID, LotID: item.LotID, QualityInspectionID: item.QualityInspectionID, Quantity: item.Quantity, Condition: item.Condition, Note: item.Note})
	}
	return out, nil
}
func entSalesReturnToBiz(row *ent.SalesReturn) *biz.SalesReturn {
	if row == nil {
		return nil
	}
	return &biz.SalesReturn{ID: row.ID, ReturnNo: row.ReturnNo, ShipmentID: row.ShipmentID, CustomerID: row.CustomerID, CustomerNameSnapshot: row.CustomerNameSnapshot, Status: row.Status, Reason: row.Reason, IdempotencyKey: row.IdempotencyKey, IdempotencyPayloadHash: row.IdempotencyPayloadHash, Version: row.Version, ApprovedAt: row.ApprovedAt, ApprovedBy: row.ApprovedBy, ReceivedAt: row.ReceivedAt, ReceivedBy: row.ReceivedBy, CancelledAt: row.CancelledAt, CancelledBy: row.CancelledBy, CancelReason: row.CancelReason, CreatedBy: row.CreatedBy, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}
