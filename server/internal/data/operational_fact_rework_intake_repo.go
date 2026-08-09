package data

import (
	"context"
	"fmt"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/productionorderoperation"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/reworkintake"
	"server/internal/data/model/ent/reworkintakeitem"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/shipmentitem"

	"github.com/shopspring/decimal"
)

var _ biz.ReworkIntakeRepo = (*operationalFactRepo)(nil)

func (r *operationalFactRepo) CreateReworkIntake(
	ctx context.Context,
	in *biz.ReworkIntakeCreate,
	actorID int,
	payloadHash string,
) (*biz.ReworkIntake, error) {
	if in == nil || actorID <= 0 || payloadHash == "" {
		return nil, biz.ErrBadParam
	}
	if replay, found, err := findReworkIntakeReplay(ctx, r.data.postgres, actorID, in.IdempotencyKey, payloadHash); err != nil || found {
		return replay, err
	}

	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	sourceShipment, err := lockAndValidateReworkIntakeSourceShipment(ctx, tx, in.SourceShipmentID)
	if err != nil {
		return nil, err
	}
	if replay, found, err := findReworkIntakeReplay(ctx, tx.client, actorID, in.IdempotencyKey, payloadHash); err != nil || found {
		if err != nil {
			return nil, err
		}
		return commitReworkIntake(ctx, tx, replay)
	}

	row, err := tx.client.ReworkIntake.Create().
		SetIntakeNo(in.IntakeNo).
		SetSourceShipmentID(sourceShipment.ID).
		SetCustomerID(*sourceShipment.CustomerID).
		SetCustomerSnapshot(strings.TrimSpace(*sourceShipment.CustomerSnapshot)).
		SetStatus(biz.ReworkIntakeStatusDraft).
		SetReason(in.Reason).
		SetIdempotencyKey(in.IdempotencyKey).
		SetIdempotencyPayloadHash(payloadHash).
		SetIdempotencyItemCount(len(in.Items)).
		SetCreatedBy(actorID).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			rollbackInventoryDBTx(ctx, tx, r.log)
			tx = nil
			if replay, found, replayErr := findReworkIntakeReplay(ctx, r.data.postgres, actorID, in.IdempotencyKey, payloadHash); replayErr != nil || found {
				return replay, replayErr
			}
		}
		return nil, err
	}

	if err := createReworkIntakeDraftItems(ctx, tx, row.ID, sourceShipment, in.Items); err != nil {
		return nil, err
	}
	out, err := reworkIntakeWithItems(ctx, tx.client, row)
	if err != nil {
		return nil, err
	}
	return commitReworkIntake(ctx, tx, out)
}

func (r *operationalFactRepo) SaveReworkIntakeDraft(
	ctx context.Context,
	in *biz.ReworkIntakeDraftSave,
) (*biz.ReworkIntake, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || len(in.Items) == 0 {
		return nil, biz.ErrBadParam
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "rework_intakes", in.ID, biz.ErrReworkIntakeNotFound); err != nil {
		return nil, err
	}
	current, err := tx.client.ReworkIntake.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrReworkIntakeNotFound
		}
		return nil, err
	}
	if current.Version != in.ExpectedVersion {
		return nil, biz.ErrOperationalFactVersionConflict
	}
	if current.Status != biz.ReworkIntakeStatusDraft {
		return nil, biz.ErrReworkIntakeSourceState
	}
	sourceShipment, err := lockAndValidateReworkIntakeSourceShipment(ctx, tx, in.SourceShipmentID)
	if err != nil {
		return nil, err
	}
	if err := replaceReworkIntakeDraftHeader(ctx, tx, current, sourceShipment, in); err != nil {
		return nil, err
	}
	if err := deleteReworkIntakeDraftItems(ctx, tx, current.ID); err != nil {
		return nil, err
	}
	if err := createReworkIntakeDraftItems(ctx, tx, current.ID, sourceShipment, in.Items); err != nil {
		return nil, err
	}
	updated, err := tx.client.ReworkIntake.Get(ctx, current.ID)
	if err != nil {
		return nil, err
	}
	out, err := reworkIntakeWithItems(ctx, tx.client, updated)
	if err != nil {
		return nil, err
	}
	return commitReworkIntake(ctx, tx, out)
}

func replaceReworkIntakeDraftHeader(
	ctx context.Context,
	tx *inventoryDBTx,
	current *ent.ReworkIntake,
	sourceShipment *ent.Shipment,
	in *biz.ReworkIntakeDraftSave,
) error {
	if tx == nil || tx.sqlTx == nil || current == nil || sourceShipment == nil || sourceShipment.CustomerID == nil ||
		sourceShipment.CustomerSnapshot == nil || in == nil {
		return biz.ErrBadParam
	}
	p := inventorySQLPlaceholders(tx.dialect, 8)
	query := fmt.Sprintf(`UPDATE rework_intakes SET intake_no = %s, source_shipment_id = %s, customer_id = %s, customer_snapshot = %s, reason = %s, version = version + 1, updated_at = %s WHERE id = %s AND status = 'DRAFT' AND version = %s`, p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7])
	result, err := tx.sqlTx.ExecContext(
		ctx,
		query,
		in.IntakeNo,
		sourceShipment.ID,
		*sourceShipment.CustomerID,
		strings.TrimSpace(*sourceShipment.CustomerSnapshot),
		in.Reason,
		time.Now(),
		current.ID,
		in.ExpectedVersion,
	)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return biz.ErrOperationalFactVersionConflict
	}
	return nil
}

func deleteReworkIntakeDraftItems(ctx context.Context, tx *inventoryDBTx, reworkIntakeID int) error {
	if tx == nil || tx.sqlTx == nil || reworkIntakeID <= 0 {
		return biz.ErrBadParam
	}
	p := inventorySQLPlaceholders(tx.dialect, 1)
	_, err := tx.sqlTx.ExecContext(ctx, fmt.Sprintf(`DELETE FROM rework_intake_items WHERE rework_intake_id = %s`, p[0]), reworkIntakeID)
	return err
}

func lockAndValidateReworkIntakeSourceShipment(
	ctx context.Context,
	tx *inventoryDBTx,
	sourceShipmentID int,
) (*ent.Shipment, error) {
	if tx == nil || tx.client == nil || sourceShipmentID <= 0 {
		return nil, biz.ErrReworkIntakeSourceInvalid
	}
	if err := lockOperationalFactRow(ctx, tx, "shipments", sourceShipmentID, biz.ErrReworkIntakeSourceInvalid); err != nil {
		return nil, err
	}
	sourceShipment, err := tx.client.Shipment.Get(ctx, sourceShipmentID)
	if err != nil || sourceShipment.Status != biz.ShipmentStatusShipped || sourceShipment.Purpose != biz.ShipmentPurposeSalesDelivery ||
		sourceShipment.CustomerID == nil || sourceShipment.CustomerSnapshot == nil || strings.TrimSpace(*sourceShipment.CustomerSnapshot) == "" {
		return nil, biz.ErrReworkIntakeSourceInvalid
	}
	return sourceShipment, nil
}

func createReworkIntakeDraftItems(
	ctx context.Context,
	tx *inventoryDBTx,
	reworkIntakeID int,
	sourceShipment *ent.Shipment,
	items []biz.ReworkIntakeItemCreate,
) error {
	if tx == nil || tx.client == nil || reworkIntakeID <= 0 || sourceShipment == nil || len(items) == 0 {
		return biz.ErrBadParam
	}
	for index, requested := range items {
		if err := lockOperationalFactRow(ctx, tx, "shipment_items", requested.SourceShipmentItemID, biz.ErrReworkIntakeSourceInvalid); err != nil {
			return err
		}
		if err := lockOperationalFactRow(ctx, tx, "production_order_items", requested.TargetProductionOrderItemID, biz.ErrReworkIntakeSourceInvalid); err != nil {
			return err
		}
		sourceItem, err := tx.client.ShipmentItem.Get(ctx, requested.SourceShipmentItemID)
		if err != nil || sourceItem.ShipmentID != sourceShipment.ID || sourceItem.SalesOrderItemID == nil {
			return biz.ErrReworkIntakeSourceInvalid
		}
		targetItem, targetOrder, err := validateReworkIntakeTarget(ctx, tx.client, sourceItem, requested.TargetProductionOrderItemID)
		if err != nil {
			return err
		}
		if err := lockOperationalFactRow(ctx, tx, "production_orders", targetOrder.ID, biz.ErrReworkIntakeSourceInvalid); err != nil {
			return err
		}
		active, err := activeReworkIntakeQuantity(ctx, tx.client, sourceItem.ID)
		if err != nil {
			return err
		}
		if active.Add(requested.Quantity).GreaterThan(sourceItem.Quantity) {
			return biz.ErrReworkIntakeQuantityExceeded
		}
		_, err = tx.client.ReworkIntakeItem.Create().
			SetReworkIntakeID(reworkIntakeID).
			SetLineNo(fmt.Sprintf("%d", index+1)).
			SetSourceShipmentItemID(sourceItem.ID).
			SetTargetProductionOrderItemID(targetItem.ID).
			SetProductID(sourceItem.ProductID).
			SetNillableProductSkuID(sourceItem.ProductSkuID).
			SetReceivingWarehouseID(sourceItem.WarehouseID).
			SetUnitID(sourceItem.UnitID).
			SetQuantity(requested.Quantity).
			SetNillableNote(requested.Note).
			Save(ctx)
		if err != nil {
			return err
		}
	}
	return nil
}

func validateReworkIntakeTarget(
	ctx context.Context,
	client *ent.Client,
	sourceItem *ent.ShipmentItem,
	targetItemID int,
) (*ent.ProductionOrderItem, *ent.ProductionOrder, error) {
	if client == nil || sourceItem == nil || sourceItem.SalesOrderItemID == nil || targetItemID <= 0 {
		return nil, nil, biz.ErrReworkIntakeSourceInvalid
	}
	target, err := client.ProductionOrderItem.Get(ctx, targetItemID)
	if err != nil || target.SalesOrderItemID == nil || *target.SalesOrderItemID != *sourceItem.SalesOrderItemID ||
		target.ProductID != sourceItem.ProductID || target.UnitID != sourceItem.UnitID ||
		!sameOptionalInt(target.ProductSkuID, sourceItem.ProductSkuID) || target.RouteCode == nil ||
		strings.TrimSpace(*target.RouteCode) != biz.ProductionWIPRoutePlushSewHandV1 {
		return nil, nil, biz.ErrReworkIntakeSourceInvalid
	}
	order, err := client.ProductionOrder.Get(ctx, target.ProductionOrderID)
	if err != nil || (order.Status != biz.ProductionOrderStatusReleased && order.Status != biz.ProductionOrderStatusClosed) {
		return nil, nil, biz.ErrReworkIntakeSourceInvalid
	}
	hasHandwork, err := client.ProductionOrderOperation.Query().Where(
		productionorderoperation.ProductionOrderID(order.ID),
		productionorderoperation.ProductionOrderItemID(target.ID),
		productionorderoperation.RouteCode(biz.ProductionWIPRoutePlushSewHandV1),
		productionorderoperation.RouteVersion(biz.ProductionWIPRoutePlushSewHandV1Version),
		productionorderoperation.OperationCode(biz.ProductionWIPOperationHandwork),
	).Exist(ctx)
	if err != nil || !hasHandwork {
		return nil, nil, biz.ErrProductionWIPInvalidRoute
	}
	return target, order, nil
}

func activeReworkIntakeQuantity(ctx context.Context, client *ent.Client, sourceShipmentItemID int) (decimal.Decimal, error) {
	return activeReworkIntakeQuantityExcludingDraft(ctx, client, sourceShipmentItemID, 0)
}

func activeReworkIntakeQuantityExcludingDraft(
	ctx context.Context,
	client *ent.Client,
	sourceShipmentItemID int,
	excludedDraftID int,
) (decimal.Decimal, error) {
	rows, err := client.ReworkIntakeItem.Query().Where(
		reworkintakeitem.SourceShipmentItemID(sourceShipmentItemID),
		reworkintakeitem.HasReworkIntakeWith(reworkintake.StatusIn(
			biz.ReworkIntakeStatusDraft,
			biz.ReworkIntakeStatusReceived,
		)),
	).All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	total := decimal.Zero
	for _, row := range rows {
		if excludedDraftID > 0 && row.ReworkIntakeID == excludedDraftID {
			continue
		}
		total = total.Add(row.Quantity)
	}
	return total, nil
}

func (r *operationalFactRepo) ReceiveReworkIntake(ctx context.Context, in *biz.ReworkIntakeTransition, actorID int) (*biz.ReworkIntake, error) {
	return r.transitionReworkIntake(ctx, in, actorID, biz.ReworkIntakeStatusReceived)
}

func (r *operationalFactRepo) CancelReworkIntake(ctx context.Context, in *biz.ReworkIntakeTransition, actorID int) (*biz.ReworkIntake, error) {
	return r.transitionReworkIntake(ctx, in, actorID, biz.ReworkIntakeStatusCancelled)
}

func (r *operationalFactRepo) ReverseReworkIntake(ctx context.Context, in *biz.ReworkIntakeTransition, actorID int) (*biz.ReworkIntake, error) {
	return r.transitionReworkIntake(ctx, in, actorID, biz.ReworkIntakeStatusReversed)
}

func (r *operationalFactRepo) transitionReworkIntake(
	ctx context.Context,
	in *biz.ReworkIntakeTransition,
	actorID int,
	target string,
) (*biz.ReworkIntake, error) {
	if in == nil || actorID <= 0 {
		return nil, biz.ErrBadParam
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "rework_intakes", in.ID, biz.ErrReworkIntakeNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.ReworkIntake.Get(ctx, in.ID)
	if err != nil {
		return nil, biz.ErrReworkIntakeNotFound
	}
	if row.Version != in.ExpectedVersion {
		if reworkIntakeTransitionReplayMatches(row, in, actorID, target) {
			out, err := reworkIntakeWithItems(ctx, tx.client, row)
			if err != nil {
				return nil, err
			}
			return commitReworkIntake(ctx, tx, out)
		}
		return nil, biz.ErrIdempotencyConflict
	}
	items, err := tx.client.ReworkIntakeItem.Query().Where(reworkintakeitem.ReworkIntakeID(row.ID)).Order(ent.Asc(reworkintakeitem.FieldID)).All(ctx)
	if err != nil || len(items) == 0 {
		return nil, biz.ErrReworkIntakeSourceInvalid
	}
	now := time.Now()
	switch target {
	case biz.ReworkIntakeStatusReceived:
		if row.Status != biz.ReworkIntakeStatusDraft || strings.TrimSpace(in.Reason) != "" {
			return nil, biz.ErrReworkIntakeSourceState
		}
		for _, item := range items {
			if item.ReceivedLotID != nil {
				return nil, biz.ErrReworkIntakeSourceInvalid
			}
			lot, err := tx.client.InventoryLot.Create().
				SetSubjectType(biz.InventorySubjectProduct).
				SetSubjectID(item.ProductID).
				SetNillableProductSkuID(item.ProductSkuID).
				SetLotNo(fmt.Sprintf("RWI-%d-%s", row.ID, item.LineNo)).
				SetStatus(biz.InventoryLotHold).
				SetReceivedAt(now).
				Save(ctx)
			if err != nil {
				return nil, err
			}
			lotID := lot.ID
			if err := r.applyOperationalFactInventory(ctx, tx, operationalFactInventoryArgs{
				sourceType: biz.ReworkIntakeSourceType, sourceID: row.ID, sourceLineID: item.ID,
				subjectType: biz.InventorySubjectProduct, subjectID: item.ProductID, productSkuID: item.ProductSkuID,
				warehouseID: item.ReceivingWarehouseID, lotID: &lotID, unitID: item.UnitID,
				quantity: item.Quantity, direction: 1, txnType: biz.InventoryTxnIn, occurredAt: now, actorID: actorID,
			}); err != nil {
				return nil, err
			}
			if err := bindReworkIntakeReceivedLot(ctx, tx, item.ID, lot.ID); err != nil {
				return nil, err
			}
		}
	case biz.ReworkIntakeStatusCancelled:
		if row.Status != biz.ReworkIntakeStatusDraft || strings.TrimSpace(in.Reason) == "" {
			return nil, biz.ErrReworkIntakeSourceState
		}
	case biz.ReworkIntakeStatusReversed:
		if row.Status != biz.ReworkIntakeStatusReceived || strings.TrimSpace(in.Reason) == "" {
			return nil, biz.ErrReworkIntakeSourceState
		}
		hasProduction, err := tx.client.ProductionFact.Query().Where(
			productionfact.SourceType(biz.ReworkIntakeSourceType),
			productionfact.SourceID(row.ID),
			productionfact.StatusNEQ(biz.OperationalFactStatusCancelled),
		).Exist(ctx)
		if err != nil {
			return nil, err
		}
		if hasProduction {
			return nil, biz.ErrReworkIntakeProductionDependency
		}
		for _, item := range items {
			if item.ReceivedLotID == nil {
				return nil, biz.ErrReworkIntakeSourceInvalid
			}
			if err := r.applyOperationalFactInventory(ctx, tx, operationalFactInventoryArgs{
				sourceType: biz.ReworkIntakeSourceType, sourceID: row.ID, sourceLineID: item.ID,
				subjectType: biz.InventorySubjectProduct, subjectID: item.ProductID, productSkuID: item.ProductSkuID,
				warehouseID: item.ReceivingWarehouseID, lotID: item.ReceivedLotID, unitID: item.UnitID,
				quantity: item.Quantity, direction: 1, txnType: biz.InventoryTxnIn, occurredAt: now,
				actorID: actorID, reason: in.Reason, cancel: true,
			}); err != nil {
				return nil, err
			}
			if err := updateInventoryLotStatus(ctx, tx, *item.ReceivedLotID, biz.InventoryLotDisabled); err != nil {
				return nil, err
			}
		}
	default:
		return nil, biz.ErrBadParam
	}
	if err := updateReworkIntakeLifecycle(ctx, tx, row, in, actorID, target, now); err != nil {
		return nil, err
	}
	updated, err := tx.client.ReworkIntake.Get(ctx, row.ID)
	if err != nil {
		return nil, err
	}
	out, err := reworkIntakeWithItems(ctx, tx.client, updated)
	if err != nil {
		return nil, err
	}
	return commitReworkIntake(ctx, tx, out)
}

// received_lot_id is a lifecycle binding created by the receive transaction,
// not an editable source-line field. The nil guard makes the transition write-once.
func bindReworkIntakeReceivedLot(ctx context.Context, tx *inventoryDBTx, itemID, lotID int) error {
	if tx == nil || tx.sqlTx == nil || itemID <= 0 || lotID <= 0 {
		return biz.ErrBadParam
	}
	p := inventorySQLPlaceholders(tx.dialect, 2)
	query := "UPDATE rework_intake_items SET received_lot_id=" + p[0] +
		" WHERE id=" + p[1] + " AND received_lot_id IS NULL"
	result, err := tx.sqlTx.ExecContext(ctx, query, lotID, itemID)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return biz.ErrReworkIntakeSourceInvalid
	}
	return nil
}

func updateReworkIntakeLifecycle(
	ctx context.Context,
	tx *inventoryDBTx,
	row *ent.ReworkIntake,
	in *biz.ReworkIntakeTransition,
	actorID int,
	target string,
	now time.Time,
) error {
	p := inventorySQLPlaceholders(tx.dialect, 7)
	var query string
	var args []any
	switch target {
	case biz.ReworkIntakeStatusReceived:
		query = "UPDATE rework_intakes SET status=" + p[0] + ", version=version+1, received_at=" + p[1] + ", received_by=" + p[2] + ", updated_at=" + p[3] + " WHERE id=" + p[4] + " AND status=" + p[5] + " AND version=" + p[6]
		args = []any{target, now, actorID, now, row.ID, biz.ReworkIntakeStatusDraft, row.Version}
	case biz.ReworkIntakeStatusCancelled:
		query = "UPDATE rework_intakes SET status=" + p[0] + ", version=version+1, cancelled_at=" + p[1] + ", cancelled_by=" + p[2] + ", cancel_reason=" + p[3] + ", updated_at=" + p[4] + " WHERE id=" + p[5] + " AND version=" + p[6]
		args = []any{target, now, actorID, in.Reason, now, row.ID, row.Version}
	case biz.ReworkIntakeStatusReversed:
		query = "UPDATE rework_intakes SET status=" + p[0] + ", version=version+1, reversed_at=" + p[1] + ", reversed_by=" + p[2] + ", reverse_reason=" + p[3] + ", updated_at=" + p[4] + " WHERE id=" + p[5] + " AND version=" + p[6]
		args = []any{target, now, actorID, in.Reason, now, row.ID, row.Version}
	default:
		return biz.ErrBadParam
	}
	result, err := tx.sqlTx.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return biz.ErrIdempotencyConflict
	}
	return nil
}

func reworkIntakeTransitionReplayMatches(row *ent.ReworkIntake, in *biz.ReworkIntakeTransition, actorID int, target string) bool {
	if row == nil || in == nil || row.Status != target || row.Version != in.ExpectedVersion+1 {
		return false
	}
	switch target {
	case biz.ReworkIntakeStatusReceived:
		return row.ReceivedBy != nil && *row.ReceivedBy == actorID
	case biz.ReworkIntakeStatusCancelled:
		return row.CancelledBy != nil && row.CancelReason != nil && *row.CancelledBy == actorID && *row.CancelReason == in.Reason
	case biz.ReworkIntakeStatusReversed:
		return row.ReversedBy != nil && row.ReverseReason != nil && *row.ReversedBy == actorID && *row.ReverseReason == in.Reason
	default:
		return false
	}
}

func (r *operationalFactRepo) GetReworkIntake(ctx context.Context, id int) (*biz.ReworkIntake, error) {
	row, err := r.data.postgres.ReworkIntake.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrReworkIntakeNotFound
		}
		return nil, err
	}
	return reworkIntakeWithItems(ctx, r.data.postgres, row)
}

func (r *operationalFactRepo) ListReworkIntakes(ctx context.Context, filter biz.ReworkIntakeFilter) ([]*biz.ReworkIntake, int, error) {
	q := r.data.postgres.ReworkIntake.Query()
	if filter.Status != "" {
		q = q.Where(reworkintake.Status(filter.Status))
	}
	if filter.SourceShipmentID > 0 {
		q = q.Where(reworkintake.SourceShipmentID(filter.SourceShipmentID))
	}
	if filter.CustomerID > 0 {
		q = q.Where(reworkintake.CustomerID(filter.CustomerID))
	}
	if filter.Keyword != "" {
		q = q.Where(reworkintake.Or(
			reworkintake.IntakeNoContainsFold(filter.Keyword),
			reworkintake.CustomerSnapshotContainsFold(filter.Keyword),
			reworkintake.ReasonContainsFold(filter.Keyword),
		))
	}
	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.Order(ent.Desc(reworkintake.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.ReworkIntake, 0, len(rows))
	for _, row := range rows {
		item, err := reworkIntakeWithItems(ctx, r.data.postgres, row)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, item)
	}
	return out, total, nil
}

func (r *operationalFactRepo) ListReworkIntakeSourceCandidates(
	ctx context.Context,
	filter biz.ReworkIntakeSourceCandidateFilter,
) ([]*biz.ReworkIntakeSourceCandidate, int, error) {
	if filter.EditingReworkIntakeDraftID > 0 {
		draft, err := r.data.postgres.ReworkIntake.Get(ctx, filter.EditingReworkIntakeDraftID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, 0, biz.ErrReworkIntakeNotFound
			}
			return nil, 0, err
		}
		if draft.Status != biz.ReworkIntakeStatusDraft {
			return nil, 0, biz.ErrReworkIntakeSourceState
		}
	}
	q := r.data.postgres.ShipmentItem.Query().Where(
		shipmentitem.SalesOrderItemIDNotNil(),
		shipmentitem.HasShipmentWith(
			shipment.Status(biz.ShipmentStatusShipped),
			shipment.Purpose(biz.ShipmentPurposeSalesDelivery),
		),
	)
	if filter.SourceShipmentID > 0 {
		q = q.Where(shipmentitem.ShipmentID(filter.SourceShipmentID))
	}
	sourceItems, err := q.Order(ent.Desc(shipmentitem.FieldID)).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows := make([]*biz.ReworkIntakeSourceCandidate, 0)
	for _, sourceItem := range sourceItems {
		header, err := r.data.postgres.Shipment.Get(ctx, sourceItem.ShipmentID)
		if err != nil || header.CustomerID == nil || header.CustomerSnapshot == nil {
			return nil, 0, biz.ErrReworkIntakeSourceInvalid
		}
		active, err := activeReworkIntakeQuantityExcludingDraft(
			ctx,
			r.data.postgres,
			sourceItem.ID,
			filter.EditingReworkIntakeDraftID,
		)
		if err != nil {
			return nil, 0, err
		}
		remaining := sourceItem.Quantity.Sub(active)
		targets, err := r.data.postgres.ProductionOrderItem.Query().Where(
			productionorderitem.SalesOrderItemID(*sourceItem.SalesOrderItemID),
			productionorderitem.ProductID(sourceItem.ProductID),
			productionorderitem.UnitID(sourceItem.UnitID),
			productionorderitem.RouteCode(biz.ProductionWIPRoutePlushSewHandV1),
			productionorderitem.HasProductionOrderWith(productionorder.StatusIn(
				biz.ProductionOrderStatusReleased,
				biz.ProductionOrderStatusClosed,
			)),
		).Order(ent.Desc(productionorderitem.FieldID)).All(ctx)
		if err != nil {
			return nil, 0, err
		}
		if len(targets) == 0 {
			candidate, err := reworkIntakeCandidateProjection(ctx, r.data.postgres, header, sourceItem, nil, active, remaining)
			if err != nil {
				return nil, 0, err
			}
			reason := "未找到可复用的原生产订单行"
			candidate.Selectable = false
			candidate.DisabledReason = &reason
			rows = append(rows, candidate)
			continue
		}
		for _, target := range targets {
			if !sameOptionalInt(target.ProductSkuID, sourceItem.ProductSkuID) {
				continue
			}
			candidate, err := reworkIntakeCandidateProjection(ctx, r.data.postgres, header, sourceItem, target, active, remaining)
			if err != nil {
				return nil, 0, err
			}
			if !remaining.GreaterThan(decimal.Zero) {
				reason := "该出货行已全部登记返工回厂"
				candidate.Selectable = false
				candidate.DisabledReason = &reason
			}
			rows = append(rows, candidate)
		}
	}
	if filter.Keyword != "" {
		keyword := strings.ToLower(filter.Keyword)
		filtered := rows[:0]
		for _, row := range rows {
			haystack := strings.ToLower(strings.Join([]string{
				row.SourceShipmentNo, row.CustomerSnapshot, row.ProductCode, row.ProductName,
				row.TargetProductionOrderNo, optionalStringValueOrEmpty(row.ProductSkuCode),
			}, " "))
			if strings.Contains(haystack, keyword) {
				filtered = append(filtered, row)
			}
		}
		rows = filtered
	}
	total := len(rows)
	if filter.Offset >= total {
		return []*biz.ReworkIntakeSourceCandidate{}, total, nil
	}
	end := filter.Offset + filter.Limit
	if end > total {
		end = total
	}
	return rows[filter.Offset:end], total, nil
}

func reworkIntakeCandidateProjection(
	ctx context.Context,
	client *ent.Client,
	header *ent.Shipment,
	sourceItem *ent.ShipmentItem,
	target *ent.ProductionOrderItem,
	active, remaining decimal.Decimal,
) (*biz.ReworkIntakeSourceCandidate, error) {
	productRow, err := client.Product.Get(ctx, sourceItem.ProductID)
	if err != nil {
		return nil, err
	}
	warehouseRow, err := client.Warehouse.Get(ctx, sourceItem.WarehouseID)
	if err != nil {
		return nil, err
	}
	unitRow, err := client.Unit.Get(ctx, sourceItem.UnitID)
	if err != nil {
		return nil, err
	}
	var skuCode, skuName *string
	if sourceItem.ProductSkuID != nil {
		sku, err := client.ProductSKU.Get(ctx, *sourceItem.ProductSkuID)
		if err != nil {
			return nil, err
		}
		code := sku.SkuCode
		skuCode = &code
		skuName = sku.SkuName
	}
	row := &biz.ReworkIntakeSourceCandidate{
		SourceShipmentID: header.ID, SourceShipmentNo: header.ShipmentNo,
		CustomerID: *header.CustomerID, CustomerSnapshot: *header.CustomerSnapshot,
		SourceShipmentItemID: sourceItem.ID, SalesOrderItemID: *sourceItem.SalesOrderItemID,
		ProductID: sourceItem.ProductID, ProductCode: productRow.Code, ProductName: productRow.Name,
		ProductSkuID: sourceItem.ProductSkuID, ProductSkuCode: skuCode, ProductSkuName: skuName,
		WarehouseID: sourceItem.WarehouseID, WarehouseCode: warehouseRow.Code, WarehouseName: warehouseRow.Name,
		UnitID: sourceItem.UnitID, UnitCode: unitRow.Code, UnitName: unitRow.Name,
		ShippedQuantity: sourceItem.Quantity, ActiveIntakeQuantity: active, RemainingIntakeQuantity: remaining,
		Selectable: target != nil && remaining.GreaterThan(decimal.Zero),
	}
	if target != nil {
		order, err := client.ProductionOrder.Get(ctx, target.ProductionOrderID)
		if err != nil {
			return nil, err
		}
		row.TargetProductionOrderID = order.ID
		row.TargetProductionOrderNo = order.OrderNo
		row.TargetProductionOrderItemID = target.ID
	}
	return row, nil
}

func (r *operationalFactRepo) CreateProductionReworkFromIntake(
	ctx context.Context,
	in *biz.ProductionReworkFromIntakeCreate,
) (*biz.ProductionFact, error) {
	if replay, found, err := findProductionReworkFromIntakeReplay(ctx, r.data.postgres, in); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "rework_intake_items", in.ReworkIntakeItemID, biz.ErrReworkIntakeSourceInvalid); err != nil {
		return nil, err
	}
	item, err := tx.client.ReworkIntakeItem.Get(ctx, in.ReworkIntakeItemID)
	if err != nil {
		return nil, biz.ErrReworkIntakeSourceInvalid
	}
	if err := lockOperationalFactRow(ctx, tx, "rework_intakes", item.ReworkIntakeID, biz.ErrReworkIntakeNotFound); err != nil {
		return nil, err
	}
	parent, err := tx.client.ReworkIntake.Get(ctx, item.ReworkIntakeID)
	if err != nil || parent.Status != biz.ReworkIntakeStatusReceived || item.ReceivedLotID == nil {
		return nil, biz.ErrReworkIntakeSourceState
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_items", item.TargetProductionOrderItemID, biz.ErrReworkIntakeSourceInvalid); err != nil {
		return nil, err
	}
	target, err := tx.client.ProductionOrderItem.Get(ctx, item.TargetProductionOrderItemID)
	if err != nil {
		return nil, biz.ErrReworkIntakeSourceInvalid
	}
	if err := lockOperationalFactRow(ctx, tx, "production_orders", target.ProductionOrderID, biz.ErrProductionOrderNotFound); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "inventory_lots", *item.ReceivedLotID, biz.ErrInventoryLotNotFound); err != nil {
		return nil, err
	}
	lot, err := tx.client.InventoryLot.Get(ctx, *item.ReceivedLotID)
	if err != nil || lot.Status != biz.InventoryLotHold || lot.SubjectType != biz.InventorySubjectProduct ||
		lot.SubjectID != item.ProductID || !sameOptionalInt(lot.ProductSkuID, item.ProductSkuID) {
		return nil, biz.ErrReworkIntakeSourceInvalid
	}
	active, err := activeProductionReworkFromIntakeQuantity(ctx, tx.client, parent.ID, item.ID, 0)
	if err != nil {
		return nil, err
	}
	if active.Add(in.Quantity).GreaterThan(item.Quantity) {
		return nil, biz.ErrProductionReworkQuantityExceeded
	}
	if replay, found, err := findProductionReworkFromIntakeReplay(ctx, tx.client, in); err != nil || found {
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	sourceType := biz.ReworkIntakeSourceType
	sourceID := parent.ID
	sourceLineID := item.ID
	reason := in.Reason
	created, err := createProductionFactDraftWithClient(ctx, tx.client, &biz.OperationalFactMutation{
		FactNo: in.FactNo, FactType: biz.ProductionFactRework,
		SubjectType: biz.InventorySubjectProduct, SubjectID: item.ProductID, ProductSkuID: item.ProductSkuID,
		WarehouseID: item.ReceivingWarehouseID, UnitID: item.UnitID, LotID: item.ReceivedLotID,
		Quantity: in.Quantity, SourceType: &sourceType, SourceID: &sourceID, SourceLineID: &sourceLineID,
		IdempotencyKey: in.IdempotencyKey, OccurredAt: in.OccurredAt, OccurredAtSpecified: in.OccurredAtSpecified,
		Note: &reason,
	})
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return created, nil
}

func activeProductionReworkFromIntakeQuantity(ctx context.Context, client *ent.Client, intakeID, itemID, excludeFactID int) (decimal.Decimal, error) {
	q := client.ProductionFact.Query().Where(
		productionfact.FactType(biz.ProductionFactRework),
		productionfact.SourceType(biz.ReworkIntakeSourceType),
		productionfact.SourceID(intakeID),
		productionfact.SourceLineID(itemID),
		productionfact.StatusIn(biz.OperationalFactStatusDraft, biz.OperationalFactStatusPosted),
	)
	if excludeFactID > 0 {
		q = q.Where(productionfact.IDNEQ(excludeFactID))
	}
	rows, err := q.All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	total := decimal.Zero
	for _, row := range rows {
		total = total.Add(row.Quantity)
	}
	return total, nil
}

func findProductionReworkFromIntakeReplay(ctx context.Context, client *ent.Client, in *biz.ProductionReworkFromIntakeCreate) (*biz.ProductionFact, bool, error) {
	if client == nil || in == nil {
		return nil, false, biz.ErrBadParam
	}
	row, err := client.ProductionFact.Query().Where(productionfact.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.FactNo != in.FactNo || row.FactType != biz.ProductionFactRework || row.SourceType == nil || *row.SourceType != biz.ReworkIntakeSourceType ||
		row.SourceLineID == nil || *row.SourceLineID != in.ReworkIntakeItemID || row.Quantity.Cmp(in.Quantity) != 0 ||
		!sameIdempotencyIntentTime(row.OccurredAtSpecified, row.OccurredAt, in.OccurredAtSpecified, in.OccurredAt) ||
		row.Note == nil || *row.Note != in.Reason {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entProductionFactToBiz(row), true, nil
}

func (r *operationalFactRepo) CreateReworkReshipment(ctx context.Context, in *biz.ReworkReshipmentCreate) (*biz.Shipment, error) {
	if replay, found, err := findReworkReshipmentReplay(ctx, r.data.postgres, in); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "rework_intakes", in.ReworkIntakeID, biz.ErrReworkIntakeNotFound); err != nil {
		return nil, err
	}
	parent, err := tx.client.ReworkIntake.Get(ctx, in.ReworkIntakeID)
	if err != nil || parent.Status != biz.ReworkIntakeStatusReceived {
		return nil, biz.ErrReworkIntakeSourceState
	}
	resolved := make([]*ent.ProductionFact, 0, len(in.Items))
	for _, requested := range in.Items {
		if err := lockOperationalFactRow(ctx, tx, "production_facts", requested.ReworkCompletionFactID, biz.ErrReworkReshipmentSourceInvalid); err != nil {
			return nil, err
		}
		completion, err := tx.client.ProductionFact.Get(ctx, requested.ReworkCompletionFactID)
		if err != nil {
			return nil, biz.ErrReworkReshipmentSourceInvalid
		}
		if err := validateReworkCompletionForIntake(ctx, tx.client, completion, parent.ID); err != nil {
			return nil, err
		}
		active, err := activeReworkReshipmentQuantity(ctx, tx.client, completion.ID)
		if err != nil {
			return nil, err
		}
		if active.Add(requested.Quantity).GreaterThan(completion.Quantity) {
			return nil, biz.ErrReworkReshipmentQuantityExceeded
		}
		resolved = append(resolved, completion)
	}
	row, err := tx.client.Shipment.Create().
		SetShipmentNo(in.ShipmentNo).
		SetPurpose(biz.ShipmentPurposeReworkReshipment).
		SetReworkIntakeID(parent.ID).
		SetCustomerID(parent.CustomerID).
		SetCustomerSnapshot(parent.CustomerSnapshot).
		SetStatus(biz.ShipmentStatusDraft).
		SetFinanceReleaseStatus(biz.ShipmentFinanceReleaseStatusNotRequired).
		SetIdempotencyKey(in.IdempotencyKey).
		SetNillablePlannedShipAt(in.PlannedShipAt).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	for index, completion := range resolved {
		requested := in.Items[index]
		_, err := tx.client.ShipmentItem.Create().
			SetShipmentID(row.ID).
			SetReworkCompletionFactID(completion.ID).
			SetProductID(completion.SubjectID).
			SetNillableProductSkuID(completion.ProductSkuID).
			SetWarehouseID(completion.WarehouseID).
			SetUnitID(completion.UnitID).
			SetNillableLotID(completion.LotID).
			SetQuantity(requested.Quantity).
			SetNillableNote(requested.Note).
			Save(ctx)
		if err != nil {
			return nil, err
		}
	}
	return commitShipment(ctx, tx, row)
}

func validateReworkCompletionForIntake(ctx context.Context, client *ent.Client, completion *ent.ProductionFact, intakeID int) error {
	if client == nil || completion == nil || intakeID <= 0 || completion.FactType != biz.ProductionFactFinishedGoodsReceipt ||
		completion.Status != biz.OperationalFactStatusPosted || completion.ProductionWipBatchID == nil || completion.LotID == nil ||
		completion.SourceType == nil || *completion.SourceType != biz.ProductionOrderSourceType {
		return biz.ErrReworkReshipmentSourceInvalid
	}
	batch, err := client.ProductionWIPBatch.Get(ctx, *completion.ProductionWipBatchID)
	if err != nil || batch.OriginReworkFactID == nil || batch.Status != biz.ProductionWIPStatusAccepted {
		return biz.ErrReworkReshipmentSourceInvalid
	}
	origin, err := client.ProductionFact.Get(ctx, *batch.OriginReworkFactID)
	if err != nil || origin.FactType != biz.ProductionFactRework || origin.Status != biz.OperationalFactStatusPosted ||
		origin.SourceType == nil || *origin.SourceType != biz.ReworkIntakeSourceType || origin.SourceID == nil || *origin.SourceID != intakeID ||
		origin.SourceLineID == nil || *origin.SourceLineID <= 0 || origin.SubjectID != completion.SubjectID ||
		origin.UnitID != completion.UnitID || !sameOptionalInt(origin.ProductSkuID, completion.ProductSkuID) {
		return biz.ErrReworkReshipmentSourceInvalid
	}
	item, err := client.ReworkIntakeItem.Get(ctx, *origin.SourceLineID)
	if err != nil || item.ReworkIntakeID != intakeID || item.TargetProductionOrderItemID != batch.ProductionOrderItemID {
		return biz.ErrReworkReshipmentSourceInvalid
	}
	return nil
}

func activeReworkReshipmentQuantity(ctx context.Context, client *ent.Client, completionFactID int) (decimal.Decimal, error) {
	rows, err := client.ShipmentItem.Query().Where(
		shipmentitem.ReworkCompletionFactID(completionFactID),
		shipmentitem.HasShipmentWith(
			shipment.Purpose(biz.ShipmentPurposeReworkReshipment),
			shipment.StatusIn(biz.ShipmentStatusDraft, biz.ShipmentStatusShipped),
		),
	).All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	total := decimal.Zero
	for _, row := range rows {
		total = total.Add(row.Quantity)
	}
	return total, nil
}

func findReworkReshipmentReplay(ctx context.Context, client *ent.Client, in *biz.ReworkReshipmentCreate) (*biz.Shipment, bool, error) {
	if client == nil || in == nil {
		return nil, false, biz.ErrBadParam
	}
	row, err := client.Shipment.Query().Where(shipment.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.ShipmentNo != in.ShipmentNo || row.Purpose != biz.ShipmentPurposeReworkReshipment ||
		row.ReworkIntakeID == nil || *row.ReworkIntakeID != in.ReworkIntakeID || row.SalesOrderID != nil ||
		!sameOptionalTime(row.PlannedShipAt, in.PlannedShipAt) || !sameOptionalString(row.Note, in.Note) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	items, err := client.ShipmentItem.Query().Where(shipmentitem.ShipmentID(row.ID)).Order(ent.Asc(shipmentitem.FieldReworkCompletionFactID)).All(ctx)
	if err != nil || len(items) != len(in.Items) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	for index, item := range items {
		requested := in.Items[index]
		if item.ReworkCompletionFactID == nil || *item.ReworkCompletionFactID != requested.ReworkCompletionFactID ||
			item.Quantity.Cmp(requested.Quantity) != 0 || !sameOptionalString(item.Note, requested.Note) {
			return nil, true, biz.ErrIdempotencyConflict
		}
	}
	out, err := shipmentWithItems(ctx, client, row)
	return out, true, err
}

func findReworkIntakeReplay(ctx context.Context, client *ent.Client, actorID int, key, payloadHash string) (*biz.ReworkIntake, bool, error) {
	row, err := client.ReworkIntake.Query().Where(reworkintake.CreatedBy(actorID), reworkintake.IdempotencyKey(key)).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if row.IdempotencyPayloadHash != payloadHash {
		return nil, true, biz.ErrIdempotencyConflict
	}
	out, err := reworkIntakeWithItems(ctx, client, row)
	return out, true, err
}

func reworkIntakeWithItems(ctx context.Context, client *ent.Client, row *ent.ReworkIntake) (*biz.ReworkIntake, error) {
	if client == nil || row == nil {
		return nil, biz.ErrBadParam
	}
	sourceShipment, err := client.Shipment.Get(ctx, row.SourceShipmentID)
	if err != nil {
		return nil, err
	}
	itemRows, err := client.ReworkIntakeItem.Query().Where(reworkintakeitem.ReworkIntakeID(row.ID)).Order(ent.Asc(reworkintakeitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	out := entReworkIntakeToBiz(row)
	out.SourceShipmentNo = sourceShipment.ShipmentNo
	out.ProgressStage = biz.ReworkIntakeStageClosed
	for _, item := range itemRows {
		projected, err := reworkIntakeItemProjection(ctx, client, row, item)
		if err != nil {
			return nil, err
		}
		out.Items = append(out.Items, projected)
		out.ProgressStage = earlierReworkIntakeStage(out.ProgressStage, projected.ProgressStage)
	}
	if len(out.Items) == 0 {
		return nil, biz.ErrReworkIntakeSourceInvalid
	}
	return out, nil
}

func reworkIntakeItemProjection(ctx context.Context, client *ent.Client, parent *ent.ReworkIntake, item *ent.ReworkIntakeItem) (*biz.ReworkIntakeItem, error) {
	source, err := client.ShipmentItem.Get(ctx, item.SourceShipmentItemID)
	if err != nil {
		return nil, err
	}
	target, err := client.ProductionOrderItem.Get(ctx, item.TargetProductionOrderItemID)
	if err != nil {
		return nil, err
	}
	order, err := client.ProductionOrder.Get(ctx, target.ProductionOrderID)
	if err != nil {
		return nil, err
	}
	productRow, err := client.Product.Get(ctx, item.ProductID)
	if err != nil {
		return nil, err
	}
	warehouseRow, err := client.Warehouse.Get(ctx, item.ReceivingWarehouseID)
	if err != nil {
		return nil, err
	}
	unitRow, err := client.Unit.Get(ctx, item.UnitID)
	if err != nil {
		return nil, err
	}
	activeIntake, err := activeReworkIntakeQuantity(ctx, client, source.ID)
	if err != nil {
		return nil, err
	}
	activeRework, err := activeProductionReworkFromIntakeQuantity(ctx, client, parent.ID, item.ID, 0)
	if err != nil {
		return nil, err
	}
	result := &biz.ReworkIntakeItem{
		ID: item.ID, ReworkIntakeID: item.ReworkIntakeID, LineNo: item.LineNo,
		SourceShipmentItemID:    source.ID,
		TargetProductionOrderID: order.ID, TargetProductionOrderNo: order.OrderNo, TargetProductionOrderItemID: target.ID,
		ProductID: item.ProductID, ProductCode: productRow.Code, ProductName: productRow.Name, ProductSkuID: item.ProductSkuID,
		ReceivingWarehouseID: item.ReceivingWarehouseID, ReceivingWarehouseCode: warehouseRow.Code, ReceivingWarehouseName: warehouseRow.Name,
		UnitID: item.UnitID, UnitCode: unitRow.Code, UnitName: unitRow.Name,
		ReceivedLotID: item.ReceivedLotID, Quantity: item.Quantity, SourceShippedQuantity: source.Quantity,
		ActiveIntakeQuantity: activeIntake, RemainingIntakeQuantity: source.Quantity.Sub(activeIntake),
		ActiveReworkQuantity: activeRework, Note: item.Note,
	}
	if result.RemainingIntakeQuantity.IsNegative() {
		return nil, biz.ErrReworkIntakeQuantityExceeded
	}
	if item.ProductSkuID != nil {
		sku, err := client.ProductSKU.Get(ctx, *item.ProductSkuID)
		if err != nil {
			return nil, err
		}
		code := sku.SkuCode
		result.ProductSkuCode = &code
		result.ProductSkuName = sku.SkuName
	}
	if item.ReceivedLotID != nil {
		lot, err := client.InventoryLot.Get(ctx, *item.ReceivedLotID)
		if err != nil {
			return nil, err
		}
		lotNo := lot.LotNo
		result.ReceivedLotNo = &lotNo
	}
	reworks, err := client.ProductionFact.Query().Where(
		productionfact.FactType(biz.ProductionFactRework),
		productionfact.SourceType(biz.ReworkIntakeSourceType),
		productionfact.SourceID(parent.ID),
		productionfact.SourceLineID(item.ID),
		productionfact.Status(biz.OperationalFactStatusPosted),
	).All(ctx)
	if err != nil {
		return nil, err
	}
	reworkIDs := make([]int, 0, len(reworks))
	for _, rework := range reworks {
		reworkIDs = append(reworkIDs, rework.ID)
	}
	if len(reworkIDs) > 0 {
		batches, err := client.ProductionWIPBatch.Query().Where(productionwipbatch.OriginReworkFactIDIn(reworkIDs...)).All(ctx)
		if err != nil {
			return nil, err
		}
		batchIDs := make([]int, 0, len(batches))
		for _, batch := range batches {
			batchIDs = append(batchIDs, batch.ID)
		}
		if len(batchIDs) > 0 {
			completions, err := client.ProductionFact.Query().Where(
				productionfact.FactType(biz.ProductionFactFinishedGoodsReceipt),
				productionfact.Status(biz.OperationalFactStatusPosted),
				productionfact.ProductionWipBatchIDIn(batchIDs...),
			).Order(ent.Asc(productionfact.FieldID)).All(ctx)
			if err != nil {
				return nil, err
			}
			for _, completion := range completions {
				activeReship, err := activeReworkReshipmentQuantity(ctx, client, completion.ID)
				if err != nil {
					return nil, err
				}
				shippedRows, err := client.ShipmentItem.Query().Where(
					shipmentitem.ReworkCompletionFactID(completion.ID),
					shipmentitem.HasShipmentWith(shipment.Status(biz.ShipmentStatusShipped)),
				).All(ctx)
				if err != nil {
					return nil, err
				}
				shipped := decimal.Zero
				for _, shippedRow := range shippedRows {
					shipped = shipped.Add(shippedRow.Quantity)
				}
				remaining := completion.Quantity.Sub(activeReship)
				candidate := &biz.ReworkCompletionCandidate{
					ProductionFactID: completion.ID, ProductionFactNo: completion.FactNo,
					WarehouseID: completion.WarehouseID, LotID: *completion.LotID,
					CompletedQuantity: completion.Quantity, ActiveReshipQuantity: activeReship,
					RemainingQuantity: remaining, Selectable: remaining.GreaterThan(decimal.Zero),
				}
				lot, err := client.InventoryLot.Get(ctx, *completion.LotID)
				if err != nil {
					return nil, err
				}
				candidate.LotNo = lot.LotNo
				if !candidate.Selectable {
					reason := "该返工完工量已全部进入补发单"
					candidate.DisabledReason = &reason
				}
				result.CompletionCandidates = append(result.CompletionCandidates, candidate)
				result.CompletedQuantity = result.CompletedQuantity.Add(completion.Quantity)
				result.ActiveReshipmentQuantity = result.ActiveReshipmentQuantity.Add(activeReship)
				result.ReshippedQuantity = result.ReshippedQuantity.Add(shipped)
			}
		}
	}
	result.ProgressStage = deriveReworkIntakeItemStage(parent.Status, result)
	return result, nil
}

func deriveReworkIntakeItemStage(status string, item *biz.ReworkIntakeItem) string {
	if status == biz.ReworkIntakeStatusCancelled || status == biz.ReworkIntakeStatusReversed {
		return biz.ReworkIntakeStageClosed
	}
	if status == biz.ReworkIntakeStatusDraft {
		return biz.ReworkIntakeStageWaitingReceive
	}
	if item == nil || item.ActiveReworkQuantity.LessThan(item.Quantity) {
		return biz.ReworkIntakeStageWaitingRework
	}
	if item.CompletedQuantity.LessThan(item.Quantity) {
		return biz.ReworkIntakeStageReworking
	}
	if item.ActiveReshipmentQuantity.LessThan(item.Quantity) {
		return biz.ReworkIntakeStageWaitingReship
	}
	if item.ReshippedQuantity.LessThan(item.Quantity) {
		return biz.ReworkIntakeStageReshipped
	}
	return biz.ReworkIntakeStageClosed
}

func earlierReworkIntakeStage(current, candidate string) string {
	order := map[string]int{
		biz.ReworkIntakeStageWaitingReceive: 0,
		biz.ReworkIntakeStageWaitingRework:  1,
		biz.ReworkIntakeStageReworking:      2,
		biz.ReworkIntakeStageWaitingReship:  3,
		biz.ReworkIntakeStageReshipped:      4,
		biz.ReworkIntakeStageClosed:         5,
	}
	if order[candidate] < order[current] {
		return candidate
	}
	return current
}

func entReworkIntakeToBiz(row *ent.ReworkIntake) *biz.ReworkIntake {
	if row == nil {
		return nil
	}
	return &biz.ReworkIntake{
		ID: row.ID, IntakeNo: row.IntakeNo, SourceShipmentID: row.SourceShipmentID,
		CustomerID: row.CustomerID, CustomerSnapshot: row.CustomerSnapshot,
		Status: row.Status, Reason: row.Reason, IdempotencyKey: row.IdempotencyKey,
		IdempotencyPayloadHash: row.IdempotencyPayloadHash, Version: row.Version,
		ReceivedAt: row.ReceivedAt, ReceivedBy: row.ReceivedBy,
		CancelledAt: row.CancelledAt, CancelledBy: row.CancelledBy, CancelReason: row.CancelReason,
		ReversedAt: row.ReversedAt, ReversedBy: row.ReversedBy, ReverseReason: row.ReverseReason,
		CreatedBy: row.CreatedBy, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
	}
}

func commitReworkIntake(ctx context.Context, tx *inventoryDBTx, item *biz.ReworkIntake) (*biz.ReworkIntake, error) {
	if tx == nil || tx.sqlTx == nil || item == nil {
		return nil, biz.ErrBadParam
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return item, nil
}
