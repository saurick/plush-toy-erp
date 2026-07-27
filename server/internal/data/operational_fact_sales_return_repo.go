package data

import (
	"context"
	"fmt"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/processinstance"
	"server/internal/data/model/ent/qualityinspection"
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
	if replay, found, replayErr := r.findSalesReturnReplayWithClient(ctx, tx.client, actorID, in.IdempotencyKey, payloadHash); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
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
		existing, err := tx.client.SalesReturnItem.Query().Where(
			salesreturnitem.ShipmentItemID(source.ID),
			salesreturnitem.HasSalesReturnWith(salesreturn.StatusIn(
				biz.SalesReturnStatusDraft,
				biz.SalesReturnStatusApproved,
				biz.SalesReturnStatusReceived,
			)),
		).All(ctx)
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
	return nil, biz.ErrProcessRuntimeRequired
}
func (r *operationalFactRepo) ReceiveSalesReturn(ctx context.Context, in *biz.SalesReturnTransition, actorID int) (*biz.SalesReturn, error) {
	return nil, biz.ErrProcessRuntimeRequired
}
func (r *operationalFactRepo) CancelSalesReturn(ctx context.Context, in *biz.SalesReturnTransition, actorID int) (*biz.SalesReturn, error) {
	return r.transitionSalesReturn(ctx, in, actorID, biz.SalesReturnStatusCancelled, nil, nil)
}
func (r *operationalFactRepo) ReverseSalesReturn(ctx context.Context, in *biz.SalesReturnTransition, actorID int) (*biz.SalesReturn, error) {
	return r.transitionSalesReturn(ctx, in, actorID, biz.SalesReturnStatusReversed, nil, nil)
}

func (r *operationalFactRepo) ApproveSalesReturnForProcessCommand(
	ctx context.Context,
	id int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*biz.SalesReturn, error) {
	return r.transitionSalesReturn(ctx, &biz.SalesReturnTransition{
		ID: id, Reason: reason,
	}, actorID, biz.SalesReturnStatusApproved, command, result)
}

func (r *operationalFactRepo) RejectSalesReturnForProcessCommand(
	ctx context.Context,
	id int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*biz.SalesReturn, error) {
	return r.transitionSalesReturn(ctx, &biz.SalesReturnTransition{
		ID: id, Reason: reason,
	}, actorID, biz.SalesReturnStatusRejected, command, result)
}

func (r *operationalFactRepo) ReceiveSalesReturnForProcessCommand(
	ctx context.Context,
	id int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.SalesReturn, error) {
	return r.transitionSalesReturn(ctx, &biz.SalesReturnTransition{
		ID: id,
	}, actorID, biz.SalesReturnStatusReceived, command, result)
}

func (r *operationalFactRepo) transitionSalesReturn(
	ctx context.Context,
	in *biz.SalesReturnTransition,
	actorID int,
	target string,
	command *biz.ProcessDomainCommandInput,
	commandResult *biz.ProcessDomainCommandResult,
) (*biz.SalesReturn, error) {
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
	if command != nil {
		in.ExpectedVersion = row.Version
	}
	if row.Version != in.ExpectedVersion {
		if salesReturnTransitionReplayMatches(row, in, actorID, target) {
			return salesReturnWithItems(ctx, tx.client, row)
		}
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
		if row.CreatedBy == actorID {
			return nil, biz.ErrBadParam
		}
	case biz.SalesReturnStatusRejected:
		if row.Status != biz.SalesReturnStatusDraft || row.CreatedBy == actorID || in.Reason == "" {
			return nil, biz.ErrBadParam
		}
		for _, item := range items {
			inspection, err := getLockedQualityInspection(ctx, tx, item.QualityInspectionID)
			if err != nil || inspection.Status != biz.QualityInspectionStatusDraft {
				return nil, biz.ErrBadParam
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
	case biz.SalesReturnStatusReceived:
		if row.Status != biz.SalesReturnStatusApproved {
			return nil, biz.ErrBadParam
		}
		for _, item := range items {
			inspection, err := getLockedQualityInspection(ctx, tx, item.QualityInspectionID)
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
			if row.CancelledBy == nil || row.CancelReason == nil || *row.CancelledBy != actorID || *row.CancelReason != in.Reason {
				return nil, biz.ErrIdempotencyConflict
			}
			return salesReturnWithItems(ctx, tx.client, row)
		}
		if row.Status != biz.SalesReturnStatusDraft && row.Status != biz.SalesReturnStatusApproved {
			return nil, biz.ErrBadParam
		}
		processQuery := tx.client.ProcessInstance.Query().Where(
			processinstance.ProcessKey(biz.ProcessKeySalesReturnApproval),
			processinstance.BusinessRefType("sales_return"),
			processinstance.BusinessRefID(row.ID),
		)
		hasProcess, err := processQuery.Clone().Exist(ctx)
		if err != nil {
			return nil, err
		}
		if hasProcess {
			blocked, err := processQuery.Clone().Where(processinstance.Status(biz.ProcessStatusBlocked)).Exist(ctx)
			if err != nil {
				return nil, err
			}
			if !blocked {
				return nil, biz.ErrProcessSourceLifecycleDependency
			}
		}
		for _, item := range items {
			inspection, err := getLockedQualityInspection(ctx, tx, item.QualityInspectionID)
			if err != nil || inspection.Status != biz.QualityInspectionStatusDraft {
				return nil, biz.ErrBadParam
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
	case biz.SalesReturnStatusReversed:
		if row.Status == biz.SalesReturnStatusReversed {
			if row.ReversedBy == nil || row.ReverseReason == nil || *row.ReversedBy != actorID || *row.ReverseReason != in.Reason {
				return nil, biz.ErrIdempotencyConflict
			}
			return salesReturnWithItems(ctx, tx.client, row)
		}
		if row.Status != biz.SalesReturnStatusReceived {
			return nil, biz.ErrBadParam
		}
		for _, item := range items {
			inspection, err := currentLockedSalesReturnInspection(ctx, tx, item.QualityInspectionID, row.ID)
			if err != nil {
				return nil, err
			}
			switch inspection.Status {
			case biz.QualityInspectionStatusSubmitted:
				if err := updateQualityInspectionCancelled(ctx, tx, inspection.ID, &in.Reason); err != nil {
					return nil, err
				}
			case biz.QualityInspectionStatusPassed, biz.QualityInspectionStatusRejected:
				// Preserve the terminal inspection as immutable audit evidence.
			default:
				return nil, biz.ErrBadParam
			}
			if err := r.applySalesReturnInventory(ctx, tx, row, item, true); err != nil {
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
	case biz.SalesReturnStatusRejected:
		query = "UPDATE sales_returns SET status=" + p[0] + ", version=version+1, updated_at=" + p[1] + ", rejected_at=" + p[2] + ", rejected_by=" + p[3] + ", reject_reason=" + p[4] + " WHERE id=" + p[5] + " AND version=" + p[6]
		args = []any{target, now, now, actorID, in.Reason, row.ID, row.Version}
	case biz.SalesReturnStatusReceived:
		query = "UPDATE sales_returns SET status=" + p[0] + ", version=version+1, updated_at=" + p[1] + ", received_at=" + p[2] + ", received_by=" + p[3] + " WHERE id=" + p[4] + " AND version=" + p[5]
		args = []any{target, now, now, actorID, row.ID, row.Version}
	case biz.SalesReturnStatusCancelled:
		query = "UPDATE sales_returns SET status=" + p[0] + ", version=version+1, updated_at=" + p[1] + ", cancelled_at=" + p[2] + ", cancelled_by=" + p[3] + ", cancel_reason=" + p[4] + " WHERE id=" + p[5] + " AND version=" + p[6]
		args = []any{target, now, now, actorID, in.Reason, row.ID, row.Version}
	case biz.SalesReturnStatusReversed:
		query = "UPDATE sales_returns SET status=" + p[0] + ", version=version+1, updated_at=" + p[1] + ", reversed_at=" + p[2] + ", reversed_by=" + p[3] + ", reverse_reason=" + p[4] + " WHERE id=" + p[5] + " AND version=" + p[6]
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
	var compensatedCommands []string
	switch target {
	case biz.SalesReturnStatusCancelled:
		if row.Status == biz.SalesReturnStatusApproved {
			compensatedCommands = []string{biz.ProcessDomainCommandSalesReturnApprove}
		}
	case biz.SalesReturnStatusReversed:
		compensatedCommands = []string{
			biz.ProcessDomainCommandSalesReturnApprove,
			biz.ProcessDomainCommandSalesReturnReceive,
		}
	}
	if err := markProcessDomainCommandEffectsCompensatedWithClient(
		ctx,
		tx.client,
		compensatedCommands,
		"sales_return",
		row.ID,
		in.Reason,
		actorID,
	); err != nil {
		return nil, err
	}
	updated, err := tx.client.SalesReturn.Get(ctx, row.ID)
	if err != nil {
		return nil, err
	}
	out, err := salesReturnWithItems(ctx, tx.client, updated)
	if err != nil {
		return nil, err
	}
	if command != nil {
		if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, commandResult, actorID); err != nil {
			return nil, err
		}
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
	return r.findSalesReturnReplayWithClient(ctx, r.data.postgres, actorID, key, hash)
}

func (r *operationalFactRepo) findSalesReturnReplayWithClient(ctx context.Context, client *ent.Client, actorID int, key, hash string) (*biz.SalesReturn, bool, error) {
	row, err := client.SalesReturn.Query().Where(salesreturn.CreatedBy(actorID), salesreturn.IdempotencyKey(key)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.IdempotencyPayloadHash != hash {
		return nil, true, biz.ErrIdempotencyConflict
	}
	out, err := salesReturnWithItems(ctx, client, row)
	return out, true, err
}

func salesReturnTransitionReplayMatches(row *ent.SalesReturn, in *biz.SalesReturnTransition, actorID int, target string) bool {
	if row == nil || in == nil || row.Version != in.ExpectedVersion+1 {
		return false
	}
	switch target {
	case biz.SalesReturnStatusApproved:
		return row.Status == target && row.ApprovedBy != nil && *row.ApprovedBy == actorID
	case biz.SalesReturnStatusRejected:
		return row.Status == target && row.RejectedBy != nil && row.RejectReason != nil &&
			*row.RejectedBy == actorID && *row.RejectReason == in.Reason
	case biz.SalesReturnStatusReceived:
		return row.Status == target && row.ReceivedBy != nil && *row.ReceivedBy == actorID
	case biz.SalesReturnStatusCancelled:
		return row.Status == target && row.CancelledBy != nil && row.CancelReason != nil &&
			*row.CancelledBy == actorID && *row.CancelReason == in.Reason
	case biz.SalesReturnStatusReversed:
		return row.Status == target && row.ReversedBy != nil && row.ReverseReason != nil &&
			*row.ReversedBy == actorID && *row.ReverseReason == in.Reason
	default:
		return false
	}
}

func currentLockedSalesReturnInspection(ctx context.Context, tx *inventoryDBTx, rootID, salesReturnID int) (*ent.QualityInspection, error) {
	if rootID <= 0 || salesReturnID <= 0 {
		return nil, biz.ErrBadParam
	}
	seen := map[int]struct{}{}
	currentID := rootID
	for {
		if _, exists := seen[currentID]; exists {
			return nil, biz.ErrBadParam
		}
		seen[currentID] = struct{}{}
		current, err := getLockedQualityInspection(ctx, tx, currentID)
		if err != nil {
			return nil, err
		}
		if current.SourceType == nil || current.SourceID == nil ||
			*current.SourceType != biz.QualityInspectionSourceSalesReturn || *current.SourceID != salesReturnID {
			return nil, biz.ErrBadParam
		}
		next, err := tx.client.QualityInspection.Query().
			Where(qualityinspection.CorrectionOfInspectionID(current.ID)).
			Only(ctx)
		if ent.IsNotFound(err) {
			if current.SupersededAt != nil {
				return nil, biz.ErrBadParam
			}
			return current, nil
		}
		if err != nil {
			return nil, err
		}
		currentID = next.ID
	}
}

func salesReturnWithItems(ctx context.Context, client *ent.Client, row *ent.SalesReturn) (*biz.SalesReturn, error) {
	items, err := client.SalesReturnItem.Query().Where(salesreturnitem.SalesReturnID(row.ID)).Order(ent.Asc(salesreturnitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	out := entSalesReturnToBiz(row)
	for _, item := range items {
		current, err := currentSalesReturnInspection(ctx, client, item.QualityInspectionID, row.ID)
		if err != nil {
			return nil, err
		}
		out.Items = append(out.Items, &biz.SalesReturnItem{ID: item.ID, SalesReturnID: item.SalesReturnID, LineNo: item.LineNo, ShipmentItemID: item.ShipmentItemID, ProductID: item.ProductID, ProductSkuID: item.ProductSkuID, WarehouseID: item.WarehouseID, UnitID: item.UnitID, LotID: item.LotID, QualityInspectionID: item.QualityInspectionID, CurrentQualityInspectionID: current.ID, CurrentQualityInspectionNo: current.InspectionNo, CurrentQualityInspectionStatus: current.Status, CurrentQualityInspectionResult: current.Result, Quantity: item.Quantity, Condition: item.Condition, Note: item.Note})
	}
	return out, nil
}

func currentSalesReturnInspection(ctx context.Context, client *ent.Client, rootID, salesReturnID int) (*ent.QualityInspection, error) {
	if client == nil || rootID <= 0 || salesReturnID <= 0 {
		return nil, biz.ErrBadParam
	}
	seen := map[int]struct{}{}
	currentID := rootID
	for {
		if _, exists := seen[currentID]; exists {
			return nil, biz.ErrBadParam
		}
		seen[currentID] = struct{}{}
		current, err := client.QualityInspection.Get(ctx, currentID)
		if err != nil {
			return nil, err
		}
		if current.SourceType == nil || current.SourceID == nil ||
			*current.SourceType != biz.QualityInspectionSourceSalesReturn || *current.SourceID != salesReturnID {
			return nil, biz.ErrBadParam
		}
		next, err := client.QualityInspection.Query().
			Where(qualityinspection.CorrectionOfInspectionID(current.ID)).
			Only(ctx)
		if ent.IsNotFound(err) {
			if current.SupersededAt != nil {
				return nil, biz.ErrBadParam
			}
			return current, nil
		}
		if err != nil {
			return nil, err
		}
		currentID = next.ID
	}
}
func entSalesReturnToBiz(row *ent.SalesReturn) *biz.SalesReturn {
	if row == nil {
		return nil
	}
	return &biz.SalesReturn{ID: row.ID, ReturnNo: row.ReturnNo, ShipmentID: row.ShipmentID, CustomerID: row.CustomerID, CustomerNameSnapshot: row.CustomerNameSnapshot, Status: row.Status, Reason: row.Reason, IdempotencyKey: row.IdempotencyKey, IdempotencyPayloadHash: row.IdempotencyPayloadHash, Version: row.Version, ApprovedAt: row.ApprovedAt, ApprovedBy: row.ApprovedBy, RejectedAt: row.RejectedAt, RejectedBy: row.RejectedBy, RejectReason: row.RejectReason, ReceivedAt: row.ReceivedAt, ReceivedBy: row.ReceivedBy, CancelledAt: row.CancelledAt, CancelledBy: row.CancelledBy, CancelReason: row.CancelReason, ReversedAt: row.ReversedAt, ReversedBy: row.ReversedBy, ReverseReason: row.ReverseReason, CreatedBy: row.CreatedBy, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}
