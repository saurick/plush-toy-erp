package data

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"server/internal/biz"
	corestatus "server/internal/core/status"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/processinstance"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/shipmentitem"
	"server/internal/data/model/ent/stockreservation"

	"entgo.io/ent/dialect"
	"github.com/shopspring/decimal"
)

func (r *operationalFactRepo) CreateShipmentDraftWithItems(ctx context.Context, in *biz.ShipmentCreateWithItems) (*biz.Shipment, error) {
	if replay, found, err := findShipmentReplay(ctx, r.data.postgres, in.Shipment, in.Items); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	shipmentIn, err := lockAndResolveShipmentSalesOrderSource(ctx, tx, in.Shipment, in.Items)
	if err != nil {
		return nil, err
	}

	row, err := tx.client.Shipment.Create().
		SetShipmentNo(shipmentIn.ShipmentNo).
		SetNillableSalesOrderID(shipmentIn.SalesOrderID).
		SetNillableCustomerID(shipmentIn.CustomerID).
		SetNillableCustomerSnapshot(shipmentIn.CustomerSnapshot).
		SetStatus(biz.ShipmentStatusDraft).
		SetIdempotencyKey(shipmentIn.IdempotencyKey).
		SetNillablePlannedShipAt(shipmentIn.PlannedShipAt).
		SetNillableTotalNetWeightG(shipmentIn.TotalNetWeightG).
		SetNillableRequestedTotalNetWeightG(shipmentIn.TotalNetWeightG).
		SetNillableNote(shipmentIn.Note).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			if rollbackErr := tx.sqlTx.Rollback(); rollbackErr != nil {
				r.log.WithContext(ctx).Warnf("rollback shipment idempotency conflict failed err=%v", rollbackErr)
			}
			tx = nil
			if replay, found, replayErr := findShipmentReplay(ctx, r.data.postgres, shipmentIn, in.Items); replayErr != nil || found {
				return replay, replayErr
			}
		}
		return nil, err
	}
	for _, item := range in.Items {
		if _, err := createShipmentItem(ctx, tx.client, row.ID, shipmentIn.SalesOrderID, item); err != nil {
			return nil, err
		}
	}
	return commitShipment(ctx, tx, row)
}

func lockAndResolveShipmentSalesOrderSource(
	ctx context.Context,
	tx *inventoryDBTx,
	in *biz.ShipmentCreate,
	items []*biz.ShipmentItemCreate,
) (*biz.ShipmentCreate, error) {
	if tx == nil || in == nil {
		return nil, biz.ErrBadParam
	}
	if in.SalesOrderID == nil {
		for _, item := range items {
			if item == nil || item.SalesOrderItemID != nil {
				return nil, biz.ErrShipmentSourceMismatch
			}
		}
		return in, nil
	}
	if *in.SalesOrderID <= 0 {
		return nil, biz.ErrShipmentSourceMismatch
	}
	if err := lockOperationalFactRow(ctx, tx, "sales_orders", *in.SalesOrderID, biz.ErrShipmentSourceMismatch); err != nil {
		return nil, err
	}
	order, err := tx.client.SalesOrder.Get(ctx, *in.SalesOrderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentSourceMismatch
		}
		return nil, err
	}
	if order.LifecycleStatus != biz.SalesOrderStatusActive {
		return nil, biz.ErrShipmentOrderNotActive
	}
	if in.CustomerID == nil || *in.CustomerID != order.CustomerID {
		return nil, biz.ErrShipmentSourceMismatch
	}

	quantityBySourceLine := make(map[int]decimal.Decimal, len(items))
	inputsBySourceLine := make(map[int][]*biz.ShipmentItemCreate, len(items))
	for _, item := range items {
		if item == nil || item.SalesOrderItemID == nil || *item.SalesOrderItemID <= 0 {
			return nil, biz.ErrShipmentSourceMismatch
		}
		lineID := *item.SalesOrderItemID
		quantityBySourceLine[lineID] = quantityBySourceLine[lineID].Add(item.Quantity)
		inputsBySourceLine[lineID] = append(inputsBySourceLine[lineID], item)
	}
	lineIDs := make([]int, 0, len(quantityBySourceLine))
	for lineID := range quantityBySourceLine {
		lineIDs = append(lineIDs, lineID)
	}
	sort.Ints(lineIDs)

	sourceItemsByLine := make(map[int]*ent.SalesOrderItem, len(lineIDs))
	sourceOrderByLine := make(map[int]int, len(lineIDs))
	for _, lineID := range lineIDs {
		if err := lockOperationalFactRow(ctx, tx, "sales_order_items", lineID, biz.ErrShipmentSourceMismatch); err != nil {
			return nil, err
		}
		orderItem, err := tx.client.SalesOrderItem.Get(ctx, lineID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrShipmentSourceMismatch
			}
			return nil, err
		}
		if orderItem.SalesOrderID != order.ID || orderItem.LineStatus != biz.SalesOrderItemStatusOpen {
			return nil, biz.ErrShipmentSourceMismatch
		}
		for _, item := range inputsBySourceLine[lineID] {
			if orderItem.ProductID != item.ProductID ||
				!sameOptionalInt(orderItem.ProductSkuID, item.ProductSkuID) ||
				orderItem.UnitID != item.UnitID {
				return nil, biz.ErrShipmentSourceMismatch
			}
		}
		sourceItemsByLine[lineID] = orderItem
		sourceOrderByLine[lineID] = order.ID
	}
	quantities, err := loadShipmentSourceLineQuantities(ctx, tx.client, sourceOrderByLine)
	if err != nil {
		return nil, err
	}
	for _, lineID := range lineIDs {
		quantityState := quantities[lineID]
		if quantityState.sourceMismatch {
			return nil, biz.ErrShipmentSourceMismatch
		}
		if quantityState.shipped.Add(quantityBySourceLine[lineID]).GreaterThan(sourceItemsByLine[lineID].OrderedQuantity) {
			return nil, biz.ErrShipmentQuantityExceeded
		}
	}

	resolved := *in
	resolved.CustomerSnapshot = shipmentCustomerNameFromSalesOrderSnapshot(order.CustomerSnapshot)
	return &resolved, nil
}

func shipmentCustomerNameFromSalesOrderSnapshot(snapshot map[string]any) *string {
	for _, key := range []string{"name", "short_name", "code"} {
		value, ok := snapshot[key].(string)
		if !ok {
			continue
		}
		value = strings.TrimSpace(value)
		if value != "" {
			return &value
		}
	}
	return nil
}

func (r *operationalFactRepo) SubmitShipmentRelease(ctx context.Context, id int, actorID int) (*biz.WorkflowTask, bool, error) {
	if id <= 0 || actorID <= 0 {
		return nil, false, biz.ErrBadParam
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, false, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "shipments", id, biz.ErrShipmentNotFound); err != nil {
		return nil, false, err
	}
	row, err := tx.client.Shipment.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, biz.ErrShipmentNotFound
		}
		return nil, false, err
	}
	if row.Status != biz.ShipmentStatusDraft {
		return nil, false, biz.ErrBadParam
	}
	shipmentSource, err := shipmentWithItems(ctx, tx.client, row)
	if err != nil {
		return nil, false, err
	}
	if len(shipmentSource.Items) == 0 {
		return nil, false, biz.ErrBadParam
	}
	if err := validateShipmentFinishedGoodsQualityGate(ctx, tx, id); err != nil {
		return nil, false, err
	}
	taskCreate, state, err := biz.BuildShipmentReleaseSourceTask(shipmentSource)
	if err != nil {
		return nil, false, err
	}
	task, created, err := ensureSourceWorkflowTaskWithClient(ctx, tx.client, taskCreate, state, actorID)
	if err != nil {
		return nil, false, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, false, err
	}
	tx.sqlTx = nil
	return task, created, nil
}

func (r *operationalFactRepo) ValidateShipmentReleaseForShipping(ctx context.Context, id int) error {
	if id <= 0 {
		return biz.ErrBadParam
	}
	shipmentSource, err := r.GetShipment(ctx, id)
	if err != nil {
		return err
	}
	if shipmentSource.Status == biz.ShipmentStatusShipped {
		// Shipping is already an immutable fact for this call. Preserve the
		// existing idempotent replay without trying to rebuild a DRAFT contract.
		return nil
	}
	expected, _, err := biz.BuildShipmentReleaseSourceTask(shipmentSource)
	if err != nil {
		return err
	}
	current, err := getSourceWorkflowTaskWithClient(ctx, r.data.postgres, expected.TaskGroup, expected.SourceID)
	if err != nil {
		if errors.Is(err, biz.ErrWorkflowTaskNotFound) {
			return biz.ErrShipmentReleaseRequired
		}
		return err
	}
	if !workflowSourceTaskMatchesExpectedIntent(current, expected) {
		return biz.ErrIdempotencyConflict
	}
	switch current.TaskStatusKey {
	case "done":
		return nil
	case "rejected":
		return biz.ErrShipmentReleaseRejected
	default:
		return biz.ErrShipmentReleasePending
	}
}

func createShipmentItem(ctx context.Context, client *ent.Client, shipmentID int, salesOrderID *int, in *biz.ShipmentItemCreate) (*ent.ShipmentItem, error) {
	if err := validateOperationalFactSKUAndLot(ctx, client, biz.InventorySubjectProduct, in.ProductID, in.ProductSkuID, in.LotID); err != nil {
		return nil, err
	}
	unitPriceSnapshot, amountSnapshot, currencySnapshot, err := shipmentItemFinanceSnapshots(ctx, client, salesOrderID, in)
	if err != nil {
		return nil, err
	}
	return client.ShipmentItem.Create().
		SetShipmentID(shipmentID).
		SetNillableSalesOrderItemID(in.SalesOrderItemID).
		SetProductID(in.ProductID).
		SetNillableProductSkuID(in.ProductSkuID).
		SetWarehouseID(in.WarehouseID).
		SetUnitID(in.UnitID).
		SetNillableLotID(in.LotID).
		SetQuantity(in.Quantity).
		SetNillableUnitPriceSnapshot(unitPriceSnapshot).
		SetNillableAmountSnapshot(amountSnapshot).
		SetNillableCurrencySnapshot(currencySnapshot).
		SetNillableNote(in.Note).
		Save(ctx)
}

func shipmentItemFinanceSnapshots(
	ctx context.Context,
	client *ent.Client,
	salesOrderID *int,
	in *biz.ShipmentItemCreate,
) (*decimal.Decimal, *decimal.Decimal, *string, error) {
	if in == nil || in.SalesOrderItemID == nil {
		return nil, nil, nil, nil
	}
	if salesOrderID == nil || *salesOrderID <= 0 {
		return nil, nil, nil, biz.ErrShipmentSourceMismatch
	}
	item, err := client.SalesOrderItem.Get(ctx, *in.SalesOrderItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, nil, nil, biz.ErrShipmentSourceMismatch
		}
		return nil, nil, nil, err
	}
	if item.SalesOrderID != *salesOrderID || item.ProductID != in.ProductID ||
		!sameOptionalInt(item.ProductSkuID, in.ProductSkuID) || item.UnitID != in.UnitID ||
		!item.OrderedQuantity.GreaterThan(decimal.Zero) {
		return nil, nil, nil, biz.ErrShipmentSourceMismatch
	}
	return shipmentFinanceSnapshotsFromSalesOrderItem(item, in.Quantity)
}

func shipmentFinanceSnapshotsFromSalesOrderItem(
	item *ent.SalesOrderItem,
	quantity decimal.Decimal,
) (*decimal.Decimal, *decimal.Decimal, *string, error) {
	if item == nil || !item.OrderedQuantity.GreaterThan(decimal.Zero) || !quantity.GreaterThan(decimal.Zero) {
		return nil, nil, nil, biz.ErrShipmentSourceMismatch
	}
	var unitPriceSnapshot *decimal.Decimal
	if item.UnitPrice != nil {
		value := item.UnitPrice.Round(6)
		unitPriceSnapshot = &value
	} else if item.Amount != nil {
		value := item.Amount.Div(item.OrderedQuantity).Round(6)
		unitPriceSnapshot = &value
	}

	var amountSnapshot *decimal.Decimal
	if item.Amount != nil {
		value := item.Amount.Mul(quantity).Div(item.OrderedQuantity).Round(6)
		amountSnapshot = &value
	} else if item.UnitPrice != nil {
		value := item.UnitPrice.Mul(quantity).Round(6)
		amountSnapshot = &value
	}
	currency := biz.FinanceCurrencyCNY
	return unitPriceSnapshot, amountSnapshot, &currency, nil
}

func findShipmentReplay(ctx context.Context, client *ent.Client, shipmentIn *biz.ShipmentCreate, itemInputs []*biz.ShipmentItemCreate) (*biz.Shipment, bool, error) {
	row, err := client.Shipment.Query().
		Where(shipment.IdempotencyKey(shipmentIn.IdempotencyKey)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	expected, err := resolveShipmentReplayCustomerSnapshot(ctx, client, row, shipmentIn)
	if err != nil {
		return nil, true, err
	}
	if !shipmentMatchesCreate(row, expected) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	replay, err := shipmentWithItems(ctx, client, row)
	if err != nil {
		return nil, true, err
	}
	if itemInputs != nil && !shipmentItemsMatchCreate(replay.Items, itemInputs) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return replay, true, nil
}

func resolveShipmentReplayCustomerSnapshot(
	ctx context.Context,
	client *ent.Client,
	row *ent.Shipment,
	in *biz.ShipmentCreate,
) (*biz.ShipmentCreate, error) {
	if row == nil || in == nil || row.SalesOrderID == nil || in.SalesOrderID == nil || *row.SalesOrderID != *in.SalesOrderID {
		return in, nil
	}
	order, err := client.SalesOrder.Get(ctx, *in.SalesOrderID)
	if err != nil {
		return nil, err
	}
	resolved := *in
	resolved.CustomerSnapshot = shipmentCustomerNameFromSalesOrderSnapshot(order.CustomerSnapshot)
	return &resolved, nil
}

func shipmentMatchesCreate(row *ent.Shipment, in *biz.ShipmentCreate) bool {
	if row == nil || in == nil {
		return false
	}
	return row.ShipmentNo == in.ShipmentNo &&
		sameOptionalInt(row.SalesOrderID, in.SalesOrderID) &&
		sameOptionalInt(row.CustomerID, in.CustomerID) &&
		sameOptionalString(row.CustomerSnapshot, in.CustomerSnapshot) &&
		row.IdempotencyKey == in.IdempotencyKey &&
		sameOptionalTime(row.PlannedShipAt, in.PlannedShipAt) &&
		sameOptionalDecimal(row.RequestedTotalNetWeightG, in.TotalNetWeightG) &&
		sameOptionalString(row.Note, in.Note)
}

func shipmentItemsMatchCreate(rows []*biz.ShipmentItem, inputs []*biz.ShipmentItemCreate) bool {
	if len(rows) != len(inputs) {
		return false
	}
	for index, row := range rows {
		in := inputs[index]
		if row == nil || in == nil ||
			!sameOptionalInt(row.SalesOrderItemID, in.SalesOrderItemID) ||
			row.ProductID != in.ProductID ||
			!sameOptionalInt(row.ProductSkuID, in.ProductSkuID) ||
			row.WarehouseID != in.WarehouseID ||
			row.UnitID != in.UnitID ||
			!sameOptionalInt(row.LotID, in.LotID) ||
			row.Quantity.Cmp(in.Quantity) != 0 ||
			!sameOptionalString(row.Note, in.Note) {
			return false
		}
	}
	return true
}

func (r *operationalFactRepo) ShipShipment(ctx context.Context, id int) (*biz.Shipment, error) {
	return r.shipShipment(ctx, id, false, nil, nil, 0)
}

func (r *operationalFactRepo) ShipShipmentWithActor(ctx context.Context, id int, actorID int) (*biz.Shipment, error) {
	if actorID <= 0 {
		return nil, biz.ErrBadParam
	}
	return r.shipShipment(ctx, id, false, nil, nil, actorID)
}

func (r *operationalFactRepo) CancelShippedShipment(ctx context.Context, id int) (*biz.Shipment, error) {
	return r.shipShipment(ctx, id, true, nil, nil, 0)
}

func (r *operationalFactRepo) CancelShippedShipmentWithActor(ctx context.Context, id int, actorID int) (*biz.Shipment, error) {
	if actorID <= 0 {
		return nil, biz.ErrBadParam
	}
	return r.shipShipment(ctx, id, true, nil, nil, actorID)
}

func (r *operationalFactRepo) ShipShipmentForProcessCommand(
	ctx context.Context,
	id int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.Shipment, error) {
	if command == nil || result == nil {
		return nil, biz.ErrBadParam
	}
	return r.shipShipment(ctx, id, false, command, result, actorID)
}

func (r *operationalFactRepo) RecordShipmentFinanceReleaseProcessCommand(
	ctx context.Context,
	id int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.Shipment, error) {
	if command == nil || result == nil {
		return nil, biz.ErrBadParam
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "shipments", id, biz.ErrShipmentNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.Shipment.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentNotFound
		}
		return nil, err
	}
	if row.Status != biz.ShipmentStatusDraft {
		return nil, biz.ErrBadParam
	}
	if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, result, actorID); err != nil {
		return nil, err
	}
	out, err := shipmentWithItems(ctx, tx.client, row)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *operationalFactRepo) GetShipment(ctx context.Context, id int) (*biz.Shipment, error) {
	row, err := r.data.postgres.Shipment.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentNotFound
		}
		return nil, err
	}
	return shipmentWithItems(ctx, r.data.postgres, row)
}

func (r *operationalFactRepo) ListShipments(ctx context.Context, filter biz.OperationalFactFilter) ([]*biz.Shipment, int, error) {
	q := r.data.postgres.Shipment.Query()
	if filter.Status != "" {
		q = q.Where(shipment.Status(filter.Status))
	}
	if filter.CustomerID > 0 {
		q = q.Where(shipment.CustomerID(filter.CustomerID))
	}
	if filter.SourceID > 0 {
		q = q.Where(shipment.SalesOrderID(filter.SourceID))
	}
	itemPredicates := []predicate.ShipmentItem{}
	if filter.ProductID > 0 {
		itemPredicates = append(itemPredicates, shipmentitem.ProductID(filter.ProductID))
	}
	if filter.ProductSkuID > 0 {
		itemPredicates = append(itemPredicates, shipmentitem.ProductSkuID(filter.ProductSkuID))
	}
	if filter.WarehouseID > 0 {
		itemPredicates = append(itemPredicates, shipmentitem.WarehouseID(filter.WarehouseID))
	}
	if filter.LotID > 0 {
		itemPredicates = append(itemPredicates, shipmentitem.LotID(filter.LotID))
	}
	if len(itemPredicates) > 0 {
		q = q.Where(shipment.HasItemsWith(itemPredicates...))
	}
	if filter.Keyword != "" {
		q = q.Where(shipment.Or(
			shipment.ShipmentNoContainsFold(filter.Keyword),
			shipment.CustomerSnapshotContainsFold(filter.Keyword),
			shipment.StatusContainsFold(filter.Keyword),
			shipment.IdempotencyKeyContainsFold(filter.Keyword),
			shipment.NoteContainsFold(filter.Keyword),
			shipment.IDEQ(parsePositiveIntOrZero(filter.Keyword)),
			shipment.SalesOrderIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			shipment.CustomerIDEQ(parsePositiveIntOrZero(filter.Keyword)),
		))
	}
	q = applyShipmentDateRange(q, filter)
	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.Order(ent.Desc(shipment.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.Shipment, 0, len(rows))
	for _, row := range rows {
		item, err := shipmentWithItems(ctx, r.data.postgres, row)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, item)
	}
	return out, total, nil
}

func applyShipmentDateRange(query *ent.ShipmentQuery, filter biz.OperationalFactFilter) *ent.ShipmentQuery {
	switch filter.DateField {
	case "shipped_at":
		if filter.DateFrom != nil {
			query = query.Where(shipment.ShippedAtGTE(*filter.DateFrom))
		}
		if filter.DateTo != nil {
			query = query.Where(shipment.ShippedAtLTE(endOfDateFilter(*filter.DateTo)))
		}
	default:
		if filter.DateFrom != nil {
			query = query.Where(shipment.PlannedShipAtGTE(*filter.DateFrom))
		}
		if filter.DateTo != nil {
			query = query.Where(shipment.PlannedShipAtLTE(endOfDateFilter(*filter.DateTo)))
		}
	}
	return query
}

func (r *operationalFactRepo) shipShipment(
	ctx context.Context,
	id int,
	cancel bool,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.Shipment, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "shipments", id, biz.ErrShipmentNotFound); err != nil {
		return nil, err
	}
	parent, err := tx.client.Shipment.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentNotFound
		}
		return nil, err
	}
	items, err := tx.client.ShipmentItem.Query().Where(shipmentitem.ShipmentID(id)).Order(ent.Asc(shipmentitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, biz.ErrBadParam
	}
	cancelledShippedFact := false
	if cancel {
		transition, ok := corestatus.CancelShipment(parent.Status)
		if !ok {
			return nil, biz.ErrBadParam
		}
		if !transition.Changed {
			if parent.ShippedAt != nil {
				if err := markProcessDomainCommandEffectCompensatedWithClient(
					ctx,
					tx.client,
					biz.ProcessDomainCommandShipmentShip,
					"shipment",
					parent.ID,
					"出货单已取消并完成库存冲正，原出货流程结果需要核对",
					actorID,
				); err != nil {
					return nil, err
				}
			}
			return commitShipment(ctx, tx, parent)
		}
		cancelledShippedFact = parent.Status == biz.ShipmentStatusShipped
		if err := validateShipmentCancellationDependencies(ctx, tx, parent.ID); err != nil {
			return nil, err
		}
		hasFinanceDependency, err := tx.client.FinanceFact.Query().Where(
			financefact.SourceType(biz.ShipmentSourceType),
			financefact.SourceID(parent.ID),
			financefact.FactTypeIn(biz.FinanceFactReceivable, biz.FinanceFactInvoice),
			financefact.StatusNEQ(biz.OperationalFactStatusCancelled),
		).Exist(ctx)
		if err != nil {
			return nil, err
		}
		if hasFinanceDependency {
			return nil, biz.ErrShipmentFinanceDependency
		}
		releaseSource := entShipmentToBiz(parent, items)
		if cancelledShippedFact {
			releaseSource.Status = biz.ShipmentStatusDraft
		}
		releaseTask, _, err := biz.BuildShipmentReleaseSourceTask(releaseSource)
		if err != nil {
			return nil, err
		}
		hasReleaseTask := true
		if cancelledShippedFact {
			if err := requireShipmentReleaseTaskDone(ctx, tx, releaseTask); err != nil {
				return nil, err
			}
		} else {
			_, hasReleaseTask, err = shipmentReleaseTaskForCancellation(ctx, tx, releaseTask)
			if err != nil {
				return nil, err
			}
		}
		if cancelledShippedFact {
			for _, item := range items {
				if err := r.applyShipmentItemInventory(ctx, tx, parent, item, true); err != nil {
					return nil, err
				}
			}
		}
		if err := updateOperationalFactStatus(ctx, tx, "shipments", id, transition.Target, "shipped_at", nil); err != nil {
			return nil, err
		}
		if hasReleaseTask {
			if err := transitionSourceWorkflowProjection(
				ctx, tx.client, releaseTask, "cancelled", biz.WarehouseRoleKey, actorID,
				"shipment.cancel", map[string]any{
					"source_document_status": biz.ShipmentStatusCancelled,
					"cancelled_at":           time.Now().UTC().Unix(),
					"inventory_out_reversed": cancelledShippedFact,
				},
			); err != nil {
				return nil, err
			}
		}
	} else {
		transition, ok := corestatus.ShipShipment(parent.Status)
		if !ok {
			return nil, biz.ErrBadParam
		}
		if !transition.Changed {
			if command != nil {
				if err := verifyShipmentInventoryEvidence(ctx, tx, parent, items); err != nil {
					return nil, err
				}
				if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, result, actorID); err != nil {
					return nil, err
				}
			}
			return commitShipment(ctx, tx, parent)
		}
		releaseSource := entShipmentToBiz(parent, items)
		releaseTask, _, err := biz.BuildShipmentReleaseSourceTask(releaseSource)
		if err != nil {
			return nil, err
		}
		if err := requireShipmentReleaseTaskDone(ctx, tx, releaseTask); err != nil {
			return nil, err
		}
		if err := validateShipmentFinishedGoodsQualityGate(ctx, tx, parent.ID); err != nil {
			return nil, err
		}
		sourceQuantity, err := validateShipmentSourceAndQuantity(ctx, tx, parent, items)
		if err != nil {
			return nil, err
		}
		if err := freezeShipmentFinanceSnapshots(ctx, tx, parent, items, sourceQuantity); err != nil {
			return nil, err
		}
		if err := freezeShipmentNetWeights(ctx, tx, items); err != nil {
			return nil, err
		}
		if err := prepareShipmentReservationsAndAvailability(ctx, tx, parent, items, sourceQuantity); err != nil {
			return nil, err
		}
		for _, item := range items {
			if err := r.applyShipmentItemInventory(ctx, tx, parent, item, false); err != nil {
				return nil, err
			}
		}
		now := time.Now()
		if err := updateOperationalFactStatus(ctx, tx, "shipments", id, transition.Target, "shipped_at", &now); err != nil {
			return nil, err
		}
		if err := transitionSourceWorkflowProjection(
			ctx, tx.client, releaseTask, "shipped", biz.WarehouseRoleKey, actorID,
			"shipment.ship", map[string]any{
				"source_document_status": biz.ShipmentStatusShipped,
				"shipped_at":             now.UTC().Unix(),
				"inventory_out_posted":   true,
			},
		); err != nil {
			return nil, err
		}
	}
	parent, err = tx.client.Shipment.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if cancel && cancelledShippedFact {
		if err := markProcessDomainCommandEffectCompensatedWithClient(
			ctx,
			tx.client,
			biz.ProcessDomainCommandShipmentShip,
			"shipment",
			parent.ID,
			"出货单已取消并完成库存冲正，原出货流程结果需要核对",
			actorID,
		); err != nil {
			return nil, err
		}
	} else if command != nil {
		if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, result, actorID); err != nil {
			return nil, err
		}
	}
	return commitShipment(ctx, tx, parent)
}

func validateShipmentCancellationDependencies(ctx context.Context, tx *inventoryDBTx, shipmentID int) error {
	if tx == nil || tx.client == nil || shipmentID <= 0 {
		return biz.ErrBadParam
	}
	hasActiveProcess, err := tx.client.ProcessInstance.Query().Where(
		processinstance.ProcessKey(biz.ProcessKeyFinishedGoodsDelivery),
		processinstance.BusinessRefType("shipment"),
		processinstance.BusinessRefID(shipmentID),
		processinstance.Status(biz.ProcessStatusActive),
	).Exist(ctx)
	if err != nil {
		return err
	}
	if hasActiveProcess {
		return biz.ErrShipmentCancellationProcessActive
	}
	hasPendingQuality, err := tx.client.QualityInspection.Query().Where(
		qualityinspection.SourceType(biz.QualityInspectionSourceShipment),
		qualityinspection.SourceID(shipmentID),
		qualityinspection.InspectionType(biz.QualityInspectionTypeFinishedGoods),
		qualityinspection.StatusIn(
			biz.QualityInspectionStatusDraft,
			biz.QualityInspectionStatusSubmitted,
		),
	).Exist(ctx)
	if err != nil {
		return err
	}
	if hasPendingQuality {
		return biz.ErrShipmentQualityPending
	}
	return nil
}

// validateShipmentFinishedGoodsQualityGate keeps the optional inspection side
// flow internally consistent. A shipment with no inspection remains shippable;
// once an active inspection exists, shipping waits for a PASS or CONCESSION.
// The caller already owns the shipment row lock, which also serializes source
// creation against shipping.
func validateShipmentFinishedGoodsQualityGate(ctx context.Context, tx *inventoryDBTx, shipmentID int) error {
	if tx == nil || tx.client == nil || shipmentID <= 0 {
		return biz.ErrBadParam
	}
	inspections, err := tx.client.QualityInspection.Query().Where(
		qualityinspection.SourceType(biz.QualityInspectionSourceShipment),
		qualityinspection.SourceID(shipmentID),
		qualityinspection.InspectionType(biz.QualityInspectionTypeFinishedGoods),
		qualityinspection.StatusNEQ(biz.QualityInspectionStatusCancelled),
	).All(ctx)
	if err != nil {
		return err
	}
	pending := false
	rejected := false
	for _, inspection := range inspections {
		switch inspection.Status {
		case biz.QualityInspectionStatusDraft, biz.QualityInspectionStatusSubmitted:
			pending = true
		case biz.QualityInspectionStatusRejected:
			if inspection.Result == nil || *inspection.Result != biz.QualityInspectionResultReject {
				return biz.ErrBadParam
			}
			rejected = true
		case biz.QualityInspectionStatusPassed:
			if inspection.Result == nil || (*inspection.Result != biz.QualityInspectionResultPass && *inspection.Result != biz.QualityInspectionResultConcession) {
				return biz.ErrBadParam
			}
		default:
			return biz.ErrBadParam
		}
	}
	if rejected {
		return biz.ErrShipmentQualityRejected
	}
	if pending {
		return biz.ErrShipmentQualityPending
	}
	return nil
}

func freezeShipmentNetWeights(ctx context.Context, tx *inventoryDBTx, items []*ent.ShipmentItem) error {
	if tx == nil || tx.client == nil || tx.sqlTx == nil || len(items) == 0 {
		return biz.ErrBadParam
	}

	productIDs := make([]int, 0, len(items))
	productSkuIDs := make([]int, 0, len(items))
	seenProducts := make(map[int]struct{}, len(items))
	seenProductSKUs := make(map[int]struct{}, len(items))
	for _, item := range items {
		if item == nil || item.ProductID <= 0 || item.UnitID <= 0 || !item.Quantity.IsPositive() {
			return biz.ErrBadParam
		}
		if _, ok := seenProducts[item.ProductID]; !ok {
			seenProducts[item.ProductID] = struct{}{}
			productIDs = append(productIDs, item.ProductID)
		}
		if item.ProductSkuID != nil {
			if *item.ProductSkuID <= 0 {
				return biz.ErrBadParam
			}
			if _, ok := seenProductSKUs[*item.ProductSkuID]; !ok {
				seenProductSKUs[*item.ProductSkuID] = struct{}{}
				productSkuIDs = append(productSkuIDs, *item.ProductSkuID)
			}
		}
	}
	sort.Ints(productIDs)
	sort.Ints(productSkuIDs)

	productsByID := make(map[int]*biz.Product, len(productIDs))
	for _, productID := range productIDs {
		if err := lockOperationalFactRow(ctx, tx, "products", productID, biz.ErrBadParam); err != nil {
			return err
		}
		row, err := tx.client.Product.Get(ctx, productID)
		if err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrBadParam
			}
			return err
		}
		productsByID[productID] = entProductToBiz(row)
	}

	productSKUsByID := make(map[int]*biz.ProductSKU, len(productSkuIDs))
	for _, productSkuID := range productSkuIDs {
		if err := lockOperationalFactRow(ctx, tx, "product_skus", productSkuID, biz.ErrBadParam); err != nil {
			return err
		}
		row, err := tx.client.ProductSKU.Get(ctx, productSkuID)
		if err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrBadParam
			}
			return err
		}
		productSKUsByID[productSkuID] = entProductSKUToBiz(row)
	}

	type resolvedShipmentItemNetWeight struct {
		itemID         int
		unitNetWeightG *decimal.Decimal
	}
	resolved := make([]resolvedShipmentItemNetWeight, 0, len(items))
	lines := make([]biz.ShipmentNetWeightLine, 0, len(items))
	for _, item := range items {
		var sku *biz.ProductSKU
		if item.ProductSkuID != nil {
			sku = productSKUsByID[*item.ProductSkuID]
		}
		unitNetWeightG, err := biz.ResolveShipmentItemUnitNetWeightG(item.UnitID, productsByID[item.ProductID], sku)
		if err != nil {
			return err
		}
		resolved = append(resolved, resolvedShipmentItemNetWeight{itemID: item.ID, unitNetWeightG: unitNetWeightG})
		lines = append(lines, biz.ShipmentNetWeightLine{Quantity: item.Quantity, UnitNetWeightG: unitNetWeightG})
	}

	totalNetWeightG, complete, err := biz.CalculateShipmentTotalNetWeightG(lines)
	if err != nil {
		return err
	}
	for _, item := range resolved {
		if item.unitNetWeightG == nil {
			continue
		}
		if err := updateShipmentItemNetWeightSnapshot(ctx, tx, item.itemID, *item.unitNetWeightG); err != nil {
			return err
		}
	}
	if complete {
		return updateShipmentTotalNetWeight(ctx, tx, items[0].ShipmentID, *totalNetWeightG)
	}
	return nil
}

func updateShipmentItemNetWeightSnapshot(ctx context.Context, tx *inventoryDBTx, itemID int, unitNetWeightG decimal.Decimal) error {
	p := inventorySQLPlaceholders(tx.dialect, 3)
	query := fmt.Sprintf(`UPDATE shipment_items SET unit_net_weight_g_snapshot = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2])
	result, err := tx.sqlTx.ExecContext(ctx, query, unitNetWeightG, time.Now(), itemID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return biz.ErrBadParam
	}
	return nil
}

func updateShipmentTotalNetWeight(ctx context.Context, tx *inventoryDBTx, shipmentID int, totalNetWeightG decimal.Decimal) error {
	p := inventorySQLPlaceholders(tx.dialect, 3)
	query := fmt.Sprintf(`UPDATE shipments SET total_net_weight_g = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2])
	result, err := tx.sqlTx.ExecContext(ctx, query, totalNetWeightG, time.Now(), shipmentID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return biz.ErrBadParam
	}
	return nil
}

func verifyShipmentInventoryEvidence(
	ctx context.Context,
	tx *inventoryDBTx,
	parent *ent.Shipment,
	items []*ent.ShipmentItem,
) error {
	if tx == nil || tx.client == nil || parent == nil || parent.Status != biz.ShipmentStatusShipped || len(items) == 0 {
		return biz.ErrProcessDomainCommandRecoveryRequired
	}
	for _, item := range items {
		row, err := tx.client.InventoryTxn.Query().
			Where(inventorytxn.IdempotencyKey(biz.OperationalFactInventoryIdempotencyKey(biz.ShipmentSourceType, parent.ID, item.ID, "POST"))).
			Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrProcessDomainCommandRecoveryRequired
			}
			return err
		}
		sourceID := parent.ID
		sourceLineID := item.ID
		expected := &biz.InventoryTxnCreate{
			SubjectType:    biz.InventorySubjectProduct,
			SubjectID:      item.ProductID,
			ProductSkuID:   item.ProductSkuID,
			WarehouseID:    item.WarehouseID,
			LotID:          item.LotID,
			TxnType:        biz.InventoryTxnOut,
			Direction:      -1,
			Quantity:       item.Quantity,
			UnitID:         item.UnitID,
			SourceType:     biz.ShipmentSourceType,
			SourceID:       &sourceID,
			SourceLineID:   &sourceLineID,
			IdempotencyKey: biz.OperationalFactInventoryIdempotencyKey(biz.ShipmentSourceType, parent.ID, item.ID, "POST"),
		}
		if !inventoryTxnMatchesCreate(row, expected) {
			return biz.ErrIdempotencyConflict
		}
	}
	return nil
}

type shipmentSourceQuantityState struct {
	orderedByLine     map[int]decimal.Decimal
	shippedByLine     map[int]decimal.Decimal
	currentByLine     map[int]decimal.Decimal
	sourceItemsByLine map[int]*ent.SalesOrderItem
}

func newShipmentSourceQuantityState() *shipmentSourceQuantityState {
	return &shipmentSourceQuantityState{
		orderedByLine:     make(map[int]decimal.Decimal),
		shippedByLine:     make(map[int]decimal.Decimal),
		currentByLine:     make(map[int]decimal.Decimal),
		sourceItemsByLine: make(map[int]*ent.SalesOrderItem),
	}
}

func validateShipmentSourceAndQuantity(ctx context.Context, tx *inventoryDBTx, parent *ent.Shipment, items []*ent.ShipmentItem) (*shipmentSourceQuantityState, error) {
	if parent == nil {
		return nil, biz.ErrShipmentNotFound
	}
	state := newShipmentSourceQuantityState()
	if parent.SalesOrderID == nil {
		for _, item := range items {
			if item.SalesOrderItemID != nil {
				return nil, biz.ErrShipmentSourceMismatch
			}
		}
		return state, nil
	}
	if err := lockOperationalFactRow(ctx, tx, "sales_orders", *parent.SalesOrderID, biz.ErrShipmentSourceMismatch); err != nil {
		return nil, err
	}
	order, err := tx.client.SalesOrder.Get(ctx, *parent.SalesOrderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentSourceMismatch
		}
		return nil, err
	}
	if order.LifecycleStatus != biz.SalesOrderStatusActive {
		return nil, biz.ErrShipmentOrderNotActive
	}
	if parent.CustomerID == nil || *parent.CustomerID != order.CustomerID {
		return nil, biz.ErrShipmentSourceMismatch
	}

	quantityBySourceLine := make(map[int]decimal.Decimal, len(items))
	for _, item := range items {
		if item.SalesOrderItemID == nil {
			return nil, biz.ErrShipmentSourceMismatch
		}
		lineID := *item.SalesOrderItemID
		quantityBySourceLine[lineID] = quantityBySourceLine[lineID].Add(item.Quantity)
	}
	lineIDs := make([]int, 0, len(quantityBySourceLine))
	sourceOrderByLine := make(map[int]int, len(quantityBySourceLine))
	for lineID := range quantityBySourceLine {
		lineIDs = append(lineIDs, lineID)
		sourceOrderByLine[lineID] = order.ID
	}
	sort.Ints(lineIDs)

	for _, lineID := range lineIDs {
		if err := lockOperationalFactRow(ctx, tx, "sales_order_items", lineID, biz.ErrShipmentSourceMismatch); err != nil {
			return nil, err
		}
		orderItem, err := tx.client.SalesOrderItem.Get(ctx, lineID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrShipmentSourceMismatch
			}
			return nil, err
		}
		if orderItem.SalesOrderID != order.ID || orderItem.LineStatus != biz.SalesOrderItemStatusOpen {
			return nil, biz.ErrShipmentSourceMismatch
		}
		for _, shipmentItem := range items {
			if shipmentItem.SalesOrderItemID == nil || *shipmentItem.SalesOrderItemID != lineID {
				continue
			}
			if orderItem.ProductID != shipmentItem.ProductID ||
				!sameOptionalInt(orderItem.ProductSkuID, shipmentItem.ProductSkuID) ||
				orderItem.UnitID != shipmentItem.UnitID {
				return nil, biz.ErrShipmentSourceMismatch
			}
		}
		state.orderedByLine[lineID] = orderItem.OrderedQuantity
		state.currentByLine[lineID] = quantityBySourceLine[lineID]
		state.sourceItemsByLine[lineID] = orderItem
	}
	quantities, err := loadShipmentSourceLineQuantities(ctx, tx.client, sourceOrderByLine)
	if err != nil {
		return nil, err
	}
	for _, lineID := range lineIDs {
		quantityState := quantities[lineID]
		if quantityState.sourceMismatch {
			return nil, biz.ErrShipmentSourceMismatch
		}
		if quantityState.shipped.Add(state.currentByLine[lineID]).GreaterThan(state.orderedByLine[lineID]) {
			return nil, biz.ErrShipmentQuantityExceeded
		}
		state.shippedByLine[lineID] = quantityState.shipped
	}
	return state, nil
}

func freezeShipmentFinanceSnapshots(
	ctx context.Context,
	tx *inventoryDBTx,
	parent *ent.Shipment,
	items []*ent.ShipmentItem,
	sourceQuantity *shipmentSourceQuantityState,
) error {
	if tx == nil || tx.client == nil || tx.sqlTx == nil || parent == nil || sourceQuantity == nil || len(items) == 0 {
		return biz.ErrBadParam
	}
	if parent.SalesOrderID == nil {
		return nil
	}
	for _, item := range items {
		if item == nil || item.SalesOrderItemID == nil {
			return biz.ErrShipmentSourceMismatch
		}
		sourceItem := sourceQuantity.sourceItemsByLine[*item.SalesOrderItemID]
		if sourceItem == nil {
			return biz.ErrShipmentSourceMismatch
		}
		unitPriceSnapshot, amountSnapshot, currencySnapshot, err := shipmentFinanceSnapshotsFromSalesOrderItem(sourceItem, item.Quantity)
		if err != nil {
			return err
		}
		if err := updateShipmentItemFinanceSnapshots(ctx, tx, item.ID, unitPriceSnapshot, amountSnapshot, currencySnapshot); err != nil {
			return err
		}
	}
	return nil
}

func updateShipmentItemFinanceSnapshots(
	ctx context.Context,
	tx *inventoryDBTx,
	itemID int,
	unitPriceSnapshot, amountSnapshot *decimal.Decimal,
	currencySnapshot *string,
) error {
	if tx == nil || tx.sqlTx == nil || itemID <= 0 || currencySnapshot == nil {
		return biz.ErrBadParam
	}
	p := inventorySQLPlaceholders(tx.dialect, 5)
	query := fmt.Sprintf(
		`UPDATE shipment_items SET unit_price_snapshot = %s, amount_snapshot = %s, currency_snapshot = %s, updated_at = %s WHERE id = %s`,
		p[0], p[1], p[2], p[3], p[4],
	)
	result, err := tx.sqlTx.ExecContext(ctx, query, unitPriceSnapshot, amountSnapshot, *currencySnapshot, time.Now(), itemID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows != 1 {
		return biz.ErrBadParam
	}
	return nil
}

type shipmentInventoryGrain struct {
	productID    int
	productSkuID int
	warehouseID  int
	unitID       int
	lotID        int
}

type shipmentReservationDemand struct {
	salesOrderID     int
	salesOrderItemID int
	productSkuID     int
}

func prepareShipmentReservationsAndAvailability(ctx context.Context, tx *inventoryDBTx, parent *ent.Shipment, items []*ent.ShipmentItem, sourceQuantity *shipmentSourceQuantityState) error {
	itemsByGrain := make(map[shipmentInventoryGrain][]*ent.ShipmentItem)
	for _, item := range items {
		grain := shipmentInventoryGrain{
			productID:    item.ProductID,
			productSkuID: optionalIntValue(item.ProductSkuID),
			warehouseID:  item.WarehouseID,
			unitID:       item.UnitID,
			lotID:        optionalIntValue(item.LotID),
		}
		itemsByGrain[grain] = append(itemsByGrain[grain], item)
	}
	grains := make([]shipmentInventoryGrain, 0, len(itemsByGrain))
	for grain := range itemsByGrain {
		grains = append(grains, grain)
	}
	sort.Slice(grains, func(i, j int) bool {
		left, right := grains[i], grains[j]
		if left.productID != right.productID {
			return left.productID < right.productID
		}
		if left.productSkuID != right.productSkuID {
			return left.productSkuID < right.productSkuID
		}
		if left.warehouseID != right.warehouseID {
			return left.warehouseID < right.warehouseID
		}
		if left.unitID != right.unitID {
			return left.unitID < right.unitID
		}
		return left.lotID < right.lotID
	})

	// Lock all inventory grains before reservation rows. Reservation creation uses
	// sales order -> line -> balance, while release only locks a reservation row,
	// so this keeps shipment locking deterministic without introducing a cycle.
	for _, grain := range grains {
		lotID := optionalPositiveInt(grain.lotID)
		lockInput := &biz.StockReservationCreate{
			ProductID:    grain.productID,
			ProductSkuID: optionalPositiveInt(grain.productSkuID),
			WarehouseID:  grain.warehouseID,
			UnitID:       grain.unitID,
			LotID:        lotID,
		}
		if err := lockInventoryBalanceForReservation(ctx, tx, lockInput); err != nil {
			return err
		}
	}

	sourceLineIDs := shipmentSourceLineIDs(sourceQuantity)
	if err := lockActiveStockReservationsForSourceLines(ctx, tx, sourceLineIDs); err != nil {
		return err
	}
	sourceReservations, err := queryActiveStockReservationsForSourceLines(ctx, tx.client, sourceLineIDs)
	if err != nil {
		return err
	}

	consumeByID := make(map[int]*ent.StockReservation)
	for _, grain := range grains {
		lotID := optionalPositiveInt(grain.lotID)
		balance, err := getInventoryBalance(ctx, tx.client.InventoryBalance.Query(), biz.InventoryBalanceKey{
			SubjectType:  biz.InventorySubjectProduct,
			SubjectID:    grain.productID,
			ProductSkuID: optionalPositiveInt(grain.productSkuID),
			WarehouseID:  grain.warehouseID,
			LotID:        lotID,
			UnitID:       grain.unitID,
		})
		if err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrInventoryInsufficientStock
			}
			return err
		}
		active, err := queryActiveStockReservations(ctx, tx.client, grain.productID, optionalPositiveInt(grain.productSkuID), grain.warehouseID, grain.unitID, lotID)
		if err != nil {
			return err
		}
		activeTotal := decimal.Zero
		for _, reservation := range active {
			activeTotal = activeTotal.Add(reservation.Quantity)
		}
		freeQuantity := balance.Quantity.Sub(activeTotal)
		demandQuantities := make(map[shipmentReservationDemand]decimal.Decimal)
		for _, item := range itemsByGrain[grain] {
			demand := shipmentReservationDemand{
				salesOrderID:     optionalIntValue(parent.SalesOrderID),
				salesOrderItemID: optionalIntValue(item.SalesOrderItemID),
				productSkuID:     optionalIntValue(item.ProductSkuID),
			}
			demandQuantities[demand] = demandQuantities[demand].Add(item.Quantity)
		}
		neededFromFree := decimal.Zero
		for demand, quantity := range demandQuantities {
			matching := make([]*ent.StockReservation, 0)
			matchingTotal := decimal.Zero
			if demand.salesOrderID > 0 && demand.salesOrderItemID > 0 {
				for _, reservation := range active {
					if optionalIntValue(reservation.SalesOrderID) == demand.salesOrderID &&
						optionalIntValue(reservation.SalesOrderItemID) == demand.salesOrderItemID &&
						optionalIntValue(reservation.ProductSkuID) == demand.productSkuID {
						matching = append(matching, reservation)
						matchingTotal = matchingTotal.Add(reservation.Quantity)
					}
				}
			}
			if matchingTotal.GreaterThan(quantity) {
				return biz.ErrShipmentReservationSplit
			}
			for _, reservation := range matching {
				consumeByID[reservation.ID] = reservation
			}
			neededFromFree = neededFromFree.Add(quantity.Sub(matchingTotal))
		}
		if freeQuantity.LessThan(neededFromFree) {
			return biz.ErrInventoryInsufficientStock
		}
	}

	if err := validateShipmentRemainingReservationQuantity(sourceQuantity, sourceReservations, consumeByID); err != nil {
		return err
	}
	consumeIDs := make([]int, 0, len(consumeByID))
	for id := range consumeByID {
		consumeIDs = append(consumeIDs, id)
	}
	sort.Ints(consumeIDs)
	now := time.Now()
	for _, id := range consumeIDs {
		if err := consumeActiveStockReservation(ctx, tx, id, now); err != nil {
			return err
		}
	}
	return nil
}

func shipmentSourceLineIDs(state *shipmentSourceQuantityState) []int {
	if state == nil {
		return nil
	}
	lineIDs := make([]int, 0, len(state.currentByLine))
	for lineID := range state.currentByLine {
		lineIDs = append(lineIDs, lineID)
	}
	sort.Ints(lineIDs)
	return lineIDs
}

func lockActiveStockReservationsForSourceLines(ctx context.Context, tx *inventoryDBTx, lineIDs []int) error {
	if tx == nil || tx.dialect != dialect.Postgres || len(lineIDs) == 0 {
		return nil
	}
	placeholders := make([]string, len(lineIDs))
	args := make([]any, 0, len(lineIDs)+1)
	args = append(args, biz.StockReservationStatusActive)
	for index, lineID := range lineIDs {
		placeholders[index] = fmt.Sprintf("$%d", index+2)
		args = append(args, lineID)
	}
	rows, err := tx.sqlTx.QueryContext(ctx, fmt.Sprintf(`
SELECT id
FROM stock_reservations
WHERE status = $1
  AND sales_order_item_id IN (%s)
ORDER BY id
FOR UPDATE`, strings.Join(placeholders, ", ")), args...)
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

func queryActiveStockReservationsForSourceLines(ctx context.Context, client *ent.Client, lineIDs []int) ([]*ent.StockReservation, error) {
	if len(lineIDs) == 0 {
		return []*ent.StockReservation{}, nil
	}
	return client.StockReservation.Query().
		Where(
			stockreservation.Status(biz.StockReservationStatusActive),
			stockreservation.SalesOrderItemIDIn(lineIDs...),
		).
		Order(ent.Asc(stockreservation.FieldID)).
		All(ctx)
}

func validateShipmentRemainingReservationQuantity(state *shipmentSourceQuantityState, active []*ent.StockReservation, consumed map[int]*ent.StockReservation) error {
	if state == nil || len(state.currentByLine) == 0 {
		return nil
	}
	remainingByLine := make(map[int]decimal.Decimal, len(state.currentByLine))
	for _, reservation := range active {
		if reservation.SalesOrderItemID != nil {
			lineID := *reservation.SalesOrderItemID
			remainingByLine[lineID] = remainingByLine[lineID].Add(reservation.Quantity)
		}
	}
	for _, reservation := range consumed {
		if reservation.SalesOrderItemID != nil {
			lineID := *reservation.SalesOrderItemID
			remainingByLine[lineID] = remainingByLine[lineID].Sub(reservation.Quantity)
		}
	}
	for lineID, currentQuantity := range state.currentByLine {
		remaining := remainingByLine[lineID]
		if remaining.IsNegative() {
			return biz.ErrBadParam
		}
		committed := state.shippedByLine[lineID].Add(currentQuantity).Add(remaining)
		if committed.GreaterThan(state.orderedByLine[lineID]) {
			return biz.ErrShipmentQuantityExceeded
		}
	}
	return nil
}

func consumeActiveStockReservation(ctx context.Context, tx *inventoryDBTx, id int, now time.Time) error {
	if tx == nil || id <= 0 {
		return biz.ErrBadParam
	}
	p := inventorySQLPlaceholders(tx.dialect, 5)
	result, err := tx.sqlTx.ExecContext(ctx, fmt.Sprintf(`
UPDATE stock_reservations
SET status = %s, consumed_at = %s, updated_at = %s
WHERE id = %s AND status = %s`, p[0], p[1], p[2], p[3], p[4]),
		biz.StockReservationStatusConsumed, now, now, id, biz.StockReservationStatusActive)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected != 1 {
		return biz.ErrBadParam
	}
	return nil
}

func optionalIntValue(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

func optionalPositiveInt(value int) *int {
	if value <= 0 {
		return nil
	}
	return &value
}

func (r *operationalFactRepo) applyShipmentItemInventory(ctx context.Context, tx *inventoryDBTx, parent *ent.Shipment, item *ent.ShipmentItem, cancel bool) error {
	return r.applyOperationalFactInventory(ctx, tx, operationalFactInventoryArgs{
		sourceType:   biz.ShipmentSourceType,
		sourceID:     parent.ID,
		sourceLineID: item.ID,
		subjectType:  biz.InventorySubjectProduct,
		subjectID:    item.ProductID,
		productSkuID: item.ProductSkuID,
		warehouseID:  item.WarehouseID,
		lotID:        item.LotID,
		unitID:       item.UnitID,
		quantity:     item.Quantity,
		direction:    -1,
		txnType:      biz.InventoryTxnOut,
		occurredAt:   time.Now(),
		cancel:       cancel,
	})
}

func commitShipment(ctx context.Context, tx *inventoryDBTx, row *ent.Shipment) (*biz.Shipment, error) {
	out, err := shipmentWithItems(ctx, tx.client, row)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return out, nil
}

func shipmentWithItems(ctx context.Context, client *ent.Client, row *ent.Shipment) (*biz.Shipment, error) {
	items, err := client.ShipmentItem.Query().Where(shipmentitem.ShipmentID(row.ID)).Order(ent.Asc(shipmentitem.FieldID)).All(ctx)
	if err != nil {
		return nil, err
	}
	return entShipmentToBiz(row, items), nil
}

func entShipmentToBiz(row *ent.Shipment, itemRows []*ent.ShipmentItem) *biz.Shipment {
	if row == nil {
		return nil
	}
	items := make([]*biz.ShipmentItem, 0, len(itemRows))
	for _, item := range itemRows {
		items = append(items, entShipmentItemToBiz(item))
	}
	return &biz.Shipment{ID: row.ID, ShipmentNo: row.ShipmentNo, SalesOrderID: row.SalesOrderID, CustomerID: row.CustomerID, CustomerSnapshot: row.CustomerSnapshot, Status: row.Status, IdempotencyKey: row.IdempotencyKey, PlannedShipAt: row.PlannedShipAt, ShippedAt: row.ShippedAt, TotalNetWeightG: row.TotalNetWeightG, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, Items: items}
}

func entShipmentItemToBiz(row *ent.ShipmentItem) *biz.ShipmentItem {
	if row == nil {
		return nil
	}
	var currencySnapshot *string
	if row.SalesOrderItemID != nil {
		currency := row.CurrencySnapshot
		currencySnapshot = &currency
	}
	return &biz.ShipmentItem{ID: row.ID, ShipmentID: row.ShipmentID, SalesOrderItemID: row.SalesOrderItemID, ProductID: row.ProductID, ProductSkuID: row.ProductSkuID, WarehouseID: row.WarehouseID, UnitID: row.UnitID, LotID: row.LotID, Quantity: row.Quantity, UnitNetWeightGSnapshot: row.UnitNetWeightGSnapshot, UnitPriceSnapshot: row.UnitPriceSnapshot, AmountSnapshot: row.AmountSnapshot, CurrencySnapshot: currencySnapshot, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}
