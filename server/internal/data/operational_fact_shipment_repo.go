package data

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
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
	if in == nil {
		return nil, biz.ErrBadParam
	}
	shipmentIn, err := canonicalSalesDeliveryShipmentCreateIntent(in.Shipment)
	if err != nil {
		return nil, err
	}
	if replay, found, err := findShipmentReplay(ctx, r.data.postgres, shipmentIn, in.Items); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	shipmentIn, err = lockAndResolveShipmentSalesOrderSource(ctx, tx, shipmentIn, in.Items)
	if err != nil {
		return nil, err
	}
	sourceCurrency, err := shipmentSourceOrderCurrency(ctx, tx.client, shipmentIn.SalesOrderID)
	if err != nil {
		return nil, err
	}

	row, err := tx.client.Shipment.Create().
		SetShipmentNo(shipmentIn.ShipmentNo).
		SetNillableSalesOrderID(shipmentIn.SalesOrderID).
		SetNillableCustomerID(shipmentIn.CustomerID).
		SetNillableCustomerSnapshot(shipmentIn.CustomerSnapshot).
		SetDeliverySnapshot(shipmentIn.DeliverySnapshot).
		SetStatus(biz.ShipmentStatusDraft).
		SetIdempotencyKey(shipmentIn.IdempotencyKey).
		SetNillablePlannedShipAt(shipmentIn.PlannedShipAt).
		SetNillableTransportMethod(shipmentIn.TransportMethod).
		SetNillableCarrierName(shipmentIn.CarrierName).
		SetNillableTrackingNo(shipmentIn.TrackingNo).
		SetNillablePackageCount(shipmentIn.PackageCount).
		SetNillableGrossWeightKg(shipmentIn.GrossWeightKg).
		SetNillableVolumeM3(shipmentIn.VolumeM3).
		SetNillableShippingMark(shipmentIn.ShippingMark).
		SetNillableFreightAmount(shipmentIn.FreightAmount).
		SetNillableFreightCurrency(shipmentIn.FreightCurrency).
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
		if _, err := createShipmentItem(ctx, tx.client, row.ID, shipmentIn.SalesOrderID, sourceCurrency, item); err != nil {
			return nil, err
		}
	}
	return commitShipment(ctx, tx, row)
}

func (r *operationalFactRepo) SaveShipmentDraftWithItems(ctx context.Context, in *biz.ShipmentDraftSave) (*biz.Shipment, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || len(in.Items) == 0 {
		return nil, biz.ErrBadParam
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "shipments", in.ID, biz.ErrShipmentNotFound); err != nil {
		return nil, err
	}
	current, err := tx.client.Shipment.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentNotFound
		}
		return nil, err
	}
	if current.Version != in.ExpectedVersion {
		return nil, biz.ErrOperationalFactVersionConflict
	}
	if current.Status != biz.ShipmentStatusDraft {
		return nil, biz.ErrBadParam
	}
	if err := shipmentDraftSaveDependency(ctx, tx, current); err != nil {
		return nil, err
	}

	resolved, err := lockAndResolveShipmentSalesOrderSource(ctx, tx, &biz.ShipmentCreate{
		ShipmentNo:       in.ShipmentNo,
		SalesOrderID:     in.SalesOrderID,
		CustomerID:       in.CustomerID,
		CustomerSnapshot: in.CustomerSnapshot,
		DeliverySnapshot: in.DeliverySnapshot,
		IdempotencyKey:   current.IdempotencyKey,
		PlannedShipAt:    in.PlannedShipAt,
		TransportMethod:  in.TransportMethod,
		CarrierName:      in.CarrierName,
		TrackingNo:       in.TrackingNo,
		PackageCount:     in.PackageCount,
		GrossWeightKg:    in.GrossWeightKg,
		VolumeM3:         in.VolumeM3,
		ShippingMark:     in.ShippingMark,
		FreightAmount:    in.FreightAmount,
		FreightCurrency:  in.FreightCurrency,
		TotalNetWeightG:  in.TotalNetWeightG,
		Note:             in.Note,
	}, in.Items)
	if err != nil {
		return nil, err
	}
	sourceCurrency, err := shipmentSourceOrderCurrency(ctx, tx.client, resolved.SalesOrderID)
	if err != nil {
		return nil, err
	}
	if err := replaceShipmentDraftHeader(ctx, tx, current, resolved, in.ExpectedVersion); err != nil {
		return nil, err
	}
	if err := deleteShipmentDraftItems(ctx, tx, current.ID); err != nil {
		return nil, err
	}
	for _, item := range in.Items {
		if _, err := createShipmentItem(ctx, tx.client, current.ID, resolved.SalesOrderID, sourceCurrency, item); err != nil {
			return nil, err
		}
	}
	updated, err := tx.client.Shipment.Get(ctx, current.ID)
	if err != nil {
		return nil, err
	}
	return commitShipment(ctx, tx, updated)
}

func shipmentDraftSaveDependency(ctx context.Context, tx *inventoryDBTx, row *ent.Shipment) error {
	if tx == nil || tx.client == nil || row == nil {
		return biz.ErrBadParam
	}
	if row.FinanceReleaseStatus != biz.ShipmentFinanceReleaseStatusPending ||
		row.FinanceReleaseVersion != 1 || row.FinanceReleaseProcessInstanceID != nil ||
		row.FinanceReleaseProcessNodeID != nil || row.FinanceReleasedAt != nil {
		return biz.ErrShipmentDraftDependency
	}
	hasProcess, err := tx.client.ProcessInstance.Query().Where(
		processinstance.ProcessKey(biz.ProcessKeyFinishedGoodsDelivery),
		processinstance.BusinessRefType("shipment"),
		processinstance.BusinessRefID(row.ID),
	).Exist(ctx)
	if err != nil {
		return err
	}
	if hasProcess {
		return biz.ErrShipmentDraftDependency
	}
	hasInspection, err := tx.client.QualityInspection.Query().Where(
		qualityinspection.SourceType(biz.QualityInspectionSourceShipment),
		qualityinspection.SourceID(row.ID),
		qualityinspection.StatusNEQ(biz.QualityInspectionStatusCancelled),
	).Exist(ctx)
	if err != nil {
		return err
	}
	if hasInspection {
		return biz.ErrShipmentDraftDependency
	}
	if _, err := getSourceWorkflowTaskWithClient(ctx, tx.client, biz.WorkflowSourceTaskShipmentReleaseGroup, row.ID); err == nil {
		return biz.ErrShipmentDraftDependency
	} else if !errors.Is(err, biz.ErrWorkflowTaskNotFound) {
		return err
	}
	return nil
}

func replaceShipmentDraftHeader(
	ctx context.Context,
	tx *inventoryDBTx,
	current *ent.Shipment,
	in *biz.ShipmentCreate,
	expectedVersion int,
) error {
	if tx == nil || tx.sqlTx == nil || current == nil || in == nil {
		return biz.ErrBadParam
	}
	deliverySnapshot, err := json.Marshal(in.DeliverySnapshot)
	if err != nil {
		return biz.ErrBadParam
	}
	p := inventorySQLPlaceholders(tx.dialect, 21)
	deliverySnapshotPlaceholder := p[4]
	if tx.dialect == dialect.Postgres {
		deliverySnapshotPlaceholder = fmt.Sprintf("CAST(%s AS JSONB)", p[4])
	}
	query := fmt.Sprintf(`UPDATE shipments SET shipment_no = %s, sales_order_id = %s, customer_id = %s, customer_snapshot = %s, delivery_snapshot = %s, planned_ship_at = %s, transport_method = %s, carrier_name = %s, tracking_no = %s, package_count = %s, gross_weight_kg = %s, volume_m3 = %s, shipping_mark = %s, freight_amount = %s, freight_currency = %s, total_net_weight_g = %s, requested_total_net_weight_g = %s, note = %s, version = version + 1, updated_at = %s WHERE id = %s AND status = 'DRAFT' AND version = %s`, p[0], p[1], p[2], p[3], deliverySnapshotPlaceholder, p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13], p[14], p[15], p[16], p[17], p[18], p[19], p[20])
	result, err := tx.sqlTx.ExecContext(
		ctx,
		query,
		in.ShipmentNo,
		optionalIntSQLValue(in.SalesOrderID),
		optionalIntSQLValue(in.CustomerID),
		optionalStringSQLValue(in.CustomerSnapshot),
		string(deliverySnapshot),
		optionalTimeSQLValue(in.PlannedShipAt),
		optionalStringSQLValue(in.TransportMethod),
		optionalStringSQLValue(in.CarrierName),
		optionalStringSQLValue(in.TrackingNo),
		optionalIntSQLValue(in.PackageCount),
		optionalDecimalSQLValue(in.GrossWeightKg),
		optionalDecimalSQLValue(in.VolumeM3),
		optionalStringSQLValue(in.ShippingMark),
		optionalDecimalSQLValue(in.FreightAmount),
		optionalStringSQLValue(in.FreightCurrency),
		optionalDecimalSQLValue(in.TotalNetWeightG),
		optionalDecimalSQLValue(in.TotalNetWeightG),
		optionalStringSQLValue(in.Note),
		time.Now(),
		current.ID,
		expectedVersion,
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

func deleteShipmentDraftItems(ctx context.Context, tx *inventoryDBTx, shipmentID int) error {
	if tx == nil || tx.sqlTx == nil || shipmentID <= 0 {
		return biz.ErrBadParam
	}
	p := inventorySQLPlaceholders(tx.dialect, 1)
	_, err := tx.sqlTx.ExecContext(ctx, fmt.Sprintf(`DELETE FROM shipment_items WHERE shipment_id = %s`, p[0]), shipmentID)
	return err
}

func optionalTimeSQLValue(value *time.Time) any {
	if value == nil {
		return nil
	}
	return *value
}

func canonicalSalesDeliveryShipmentCreateIntent(in *biz.ShipmentCreate) (*biz.ShipmentCreate, error) {
	if in == nil {
		return nil, biz.ErrBadParam
	}
	canonical := *in
	return &canonical, nil
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
	if _, err := validatedShipmentSourceCurrency(order.Currency, in.FreightAmount, in.FreightCurrency); err != nil {
		return nil, err
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
	if len(resolved.DeliverySnapshot) == 0 {
		resolved.DeliverySnapshot = cloneStringAnyMap(order.DeliverySnapshot)
	}
	return &resolved, nil
}

func cloneStringAnyMap(source map[string]any) map[string]any {
	if len(source) == 0 {
		return map[string]any{}
	}
	result := make(map[string]any, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

func sameStringAnyMap(left, right map[string]any) bool {
	if len(left) != len(right) {
		return false
	}
	for key, leftValue := range left {
		rightValue, ok := right[key]
		if !ok || !reflect.DeepEqual(leftValue, rightValue) {
			return false
		}
	}
	return true
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

func shipmentSourceOrderCurrency(ctx context.Context, client *ent.Client, salesOrderID *int) (*string, error) {
	if salesOrderID == nil {
		return nil, nil
	}
	if client == nil || *salesOrderID <= 0 {
		return nil, biz.ErrShipmentSourceMismatch
	}
	order, err := client.SalesOrder.Get(ctx, *salesOrderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentSourceMismatch
		}
		return nil, err
	}
	currency, err := validatedShipmentSourceCurrency(order.Currency, nil, nil)
	if err != nil {
		return nil, err
	}
	return &currency, nil
}

func validatedShipmentSourceCurrency(orderCurrency string, freightAmount *decimal.Decimal, freightCurrency *string) (string, error) {
	currency, ok := biz.NormalizeFinanceCurrency(orderCurrency)
	if !ok || currency != orderCurrency || (freightAmount == nil) != (freightCurrency == nil) {
		return "", biz.ErrShipmentSourceMismatch
	}
	if freightCurrency == nil {
		return currency, nil
	}
	normalizedFreightCurrency, ok := biz.NormalizeFinanceCurrency(*freightCurrency)
	if !ok || normalizedFreightCurrency != *freightCurrency || normalizedFreightCurrency != currency {
		return "", biz.ErrShipmentSourceMismatch
	}
	return currency, nil
}

func createShipmentItem(ctx context.Context, client *ent.Client, shipmentID int, salesOrderID *int, sourceCurrency *string, in *biz.ShipmentItemCreate) (*ent.ShipmentItem, error) {
	if err := validateOperationalFactSKUAndLot(ctx, client, biz.InventorySubjectProduct, in.ProductID, in.ProductSkuID, in.LotID); err != nil {
		return nil, err
	}
	unitPriceSnapshot, amountSnapshot, currencySnapshot, err := shipmentItemFinanceSnapshots(ctx, client, salesOrderID, sourceCurrency, in)
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
		SetNillablePackageDescription(in.PackageDescription).
		SetNillableCaseNo(in.CaseNo).
		SetNillableNote(in.Note).
		Save(ctx)
}

func shipmentItemFinanceSnapshots(
	ctx context.Context,
	client *ent.Client,
	salesOrderID *int,
	sourceCurrency *string,
	in *biz.ShipmentItemCreate,
) (*decimal.Decimal, *decimal.Decimal, *string, error) {
	if in == nil || in.SalesOrderItemID == nil {
		return nil, nil, nil, nil
	}
	if salesOrderID == nil || *salesOrderID <= 0 || sourceCurrency == nil {
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
	return shipmentFinanceSnapshotsFromSalesOrderItem(item, in.Quantity, *sourceCurrency)
}

func shipmentFinanceSnapshotsFromSalesOrderItem(
	item *ent.SalesOrderItem,
	quantity decimal.Decimal,
	currency string,
) (*decimal.Decimal, *decimal.Decimal, *string, error) {
	if item == nil || !item.OrderedQuantity.GreaterThan(decimal.Zero) || !quantity.GreaterThan(decimal.Zero) {
		return nil, nil, nil, biz.ErrShipmentSourceMismatch
	}
	currency, ok := biz.NormalizeFinanceCurrency(currency)
	if !ok {
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
	if amountSnapshot != nil && !amountSnapshot.GreaterThan(decimal.Zero) {
		return nil, nil, nil, biz.ErrShipmentSourceMismatch
	}
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
	if len(resolved.DeliverySnapshot) == 0 {
		resolved.DeliverySnapshot = cloneStringAnyMap(order.DeliverySnapshot)
	}
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
		sameStringAnyMap(row.DeliverySnapshot, in.DeliverySnapshot) &&
		row.IdempotencyKey == in.IdempotencyKey &&
		sameOptionalTime(row.PlannedShipAt, in.PlannedShipAt) &&
		sameOptionalString(row.TransportMethod, in.TransportMethod) &&
		sameOptionalString(row.CarrierName, in.CarrierName) &&
		sameOptionalString(row.TrackingNo, in.TrackingNo) &&
		sameOptionalInt(row.PackageCount, in.PackageCount) &&
		sameOptionalDecimal(row.GrossWeightKg, in.GrossWeightKg) &&
		sameOptionalDecimal(row.VolumeM3, in.VolumeM3) &&
		sameOptionalString(row.ShippingMark, in.ShippingMark) &&
		sameOptionalDecimal(row.FreightAmount, in.FreightAmount) &&
		sameOptionalString(row.FreightCurrency, in.FreightCurrency) &&
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
			!sameOptionalString(row.PackageDescription, in.PackageDescription) ||
			!sameOptionalString(row.CaseNo, in.CaseNo) ||
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
	if row.FinanceReleaseStatus == biz.ShipmentFinanceReleaseStatusApproved {
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
	if row.FinanceReleaseStatus != biz.ShipmentFinanceReleaseStatusPending {
		return nil, biz.ErrShipmentFinanceReleaseRequired
	}
	now := time.Now().UTC()
	affected, err := tx.client.Shipment.Update().
		Where(
			shipment.ID(id),
			shipment.Status(biz.ShipmentStatusDraft),
			shipment.FinanceReleaseStatus(biz.ShipmentFinanceReleaseStatusPending),
			shipment.FinanceReleaseVersion(row.FinanceReleaseVersion),
		).
		SetFinanceReleaseStatus(biz.ShipmentFinanceReleaseStatusApproved).
		SetFinanceReleaseVersion(row.FinanceReleaseVersion + 1).
		SetFinanceReleasedAt(now).
		SetFinanceReleasedBy(actorID).
		SetFinanceReleaseProcessInstanceID(command.ProcessInstance.ID).
		SetFinanceReleaseProcessNodeID(command.Node.ID).
		SetFinanceReleaseNote("审批通过").
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrShipmentFinanceReleaseConflict
	}
	updated, err := tx.client.Shipment.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentNotFound
		}
		return nil, err
	}
	if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, result, actorID); err != nil {
		return nil, err
	}
	out, err := shipmentWithItems(ctx, tx.client, updated)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *operationalFactRepo) RecordShipmentFinanceRejectionProcessCommand(
	ctx context.Context,
	id int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
	reason string,
) (*biz.Shipment, error) {
	reason = strings.TrimSpace(reason)
	if command == nil || result == nil || actorID <= 0 || reason == "" || len([]rune(reason)) > 255 {
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
	if row.FinanceReleaseStatus == biz.ShipmentFinanceReleaseStatusRejected {
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
	if row.FinanceReleaseStatus != biz.ShipmentFinanceReleaseStatusPending {
		return nil, biz.ErrShipmentFinanceReleaseRequired
	}
	affected, err := tx.client.Shipment.Update().
		Where(
			shipment.ID(id),
			shipment.Status(biz.ShipmentStatusDraft),
			shipment.FinanceReleaseStatus(biz.ShipmentFinanceReleaseStatusPending),
			shipment.FinanceReleaseVersion(row.FinanceReleaseVersion),
		).
		SetFinanceReleaseStatus(biz.ShipmentFinanceReleaseStatusRejected).
		SetFinanceReleaseVersion(row.FinanceReleaseVersion + 1).
		ClearFinanceReleasedAt().
		ClearFinanceReleasedBy().
		SetFinanceReleaseProcessInstanceID(command.ProcessInstance.ID).
		SetFinanceReleaseProcessNodeID(command.Node.ID).
		SetFinanceReleaseNote(reason).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrShipmentFinanceReleaseConflict
	}
	updated, err := tx.client.Shipment.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentNotFound
		}
		return nil, err
	}
	if err := recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, result, actorID); err != nil {
		return nil, err
	}
	out, err := shipmentWithItems(ctx, tx.client, updated)
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
			shipment.TransportMethodContainsFold(filter.Keyword),
			shipment.CarrierNameContainsFold(filter.Keyword),
			shipment.TrackingNoContainsFold(filter.Keyword),
			shipment.ShippingMarkContainsFold(filter.Keyword),
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
		_, hasReleaseTask, err := shipmentReleaseTaskForCancellation(ctx, tx, releaseTask)
		if err != nil {
			return nil, err
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
		if parent.FinanceReleaseStatus != biz.ShipmentFinanceReleaseStatusApproved {
			return nil, biz.ErrShipmentFinanceReleaseRequired
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
	return validateShipmentFinishedGoodsQualityInspectionRows(inspections)
}

func validateShipmentFinishedGoodsQualityInspectionRows(inspections []*ent.QualityInspection) error {
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
	sourceCurrency    string
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
	sourceCurrency, err := validatedShipmentSourceCurrency(order.Currency, parent.FreightAmount, parent.FreightCurrency)
	if err != nil {
		return nil, err
	}
	state.sourceCurrency = sourceCurrency

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
	itemsBySourceLine := make(map[int][]*ent.ShipmentItem)
	lineIDs := make([]int, 0, len(items))
	for _, item := range items {
		if item == nil || item.SalesOrderItemID == nil {
			return biz.ErrShipmentSourceMismatch
		}
		lineID := *item.SalesOrderItemID
		if _, exists := itemsBySourceLine[lineID]; !exists {
			lineIDs = append(lineIDs, lineID)
		}
		itemsBySourceLine[lineID] = append(itemsBySourceLine[lineID], item)
	}
	priorAmounts, invalidPriorAmounts, err := shippedShipmentFinanceAmountsBySourceLine(ctx, tx.client, lineIDs, sourceQuantity.sourceCurrency)
	if err != nil {
		return err
	}
	sort.Ints(lineIDs)
	for _, lineID := range lineIDs {
		sourceItem := sourceQuantity.sourceItemsByLine[lineID]
		if sourceItem == nil {
			return biz.ErrShipmentSourceMismatch
		}
		lineItems := itemsBySourceLine[lineID]
		sort.Slice(lineItems, func(i, j int) bool { return lineItems[i].ID < lineItems[j].ID })

		var finalBatchAmount *decimal.Decimal
		isFinalBatch := sourceQuantity.shippedByLine[lineID].Add(sourceQuantity.currentByLine[lineID]).Equal(sourceQuantity.orderedByLine[lineID])
		if isFinalBatch {
			sourceAmount := salesOrderItemFinanceAmount(sourceItem)
			if sourceAmount != nil {
				if !sourceAmount.GreaterThan(decimal.Zero) {
					return biz.ErrShipmentSourceMismatch
				}
				if invalidPriorAmounts[lineID] {
					return biz.ErrShipmentSourceMismatch
				}
				value := sourceAmount.Sub(priorAmounts[lineID]).Round(6)
				if !value.GreaterThan(decimal.Zero) {
					return biz.ErrShipmentSourceMismatch
				}
				finalBatchAmount = &value
			}
		}

		allocated := decimal.Zero
		for index, item := range lineItems {
			unitPriceSnapshot, amountSnapshot, currencySnapshot, err := shipmentFinanceSnapshotsFromSalesOrderItem(sourceItem, item.Quantity, sourceQuantity.sourceCurrency)
			if err != nil {
				return err
			}
			if finalBatchAmount != nil && index == len(lineItems)-1 {
				value := finalBatchAmount.Sub(allocated).Round(6)
				if !value.GreaterThan(decimal.Zero) {
					return biz.ErrShipmentSourceMismatch
				}
				amountSnapshot = &value
			}
			if amountSnapshot != nil && !amountSnapshot.GreaterThan(decimal.Zero) {
				return biz.ErrShipmentSourceMismatch
			}
			if amountSnapshot != nil {
				allocated = allocated.Add(*amountSnapshot)
			}
			if err := updateShipmentItemFinanceSnapshots(ctx, tx, item.ID, unitPriceSnapshot, amountSnapshot, currencySnapshot); err != nil {
				return err
			}
		}
	}
	return nil
}

func salesOrderItemFinanceAmount(item *ent.SalesOrderItem) *decimal.Decimal {
	if item == nil {
		return nil
	}
	if item.Amount != nil {
		value := item.Amount.Round(6)
		return &value
	}
	if item.UnitPrice != nil {
		value := item.OrderedQuantity.Mul(*item.UnitPrice).Round(6)
		return &value
	}
	return nil
}

func shippedShipmentFinanceAmountsBySourceLine(
	ctx context.Context,
	client *ent.Client,
	lineIDs []int,
	expectedCurrency string,
) (map[int]decimal.Decimal, map[int]bool, error) {
	amounts := make(map[int]decimal.Decimal, len(lineIDs))
	invalid := make(map[int]bool)
	expectedCurrency, currencyOK := biz.NormalizeFinanceCurrency(expectedCurrency)
	if client == nil || !currencyOK {
		return nil, nil, biz.ErrShipmentSourceMismatch
	}
	if len(lineIDs) == 0 {
		return amounts, invalid, nil
	}
	rows, err := client.ShipmentItem.Query().Where(
		shipmentitem.SalesOrderItemIDIn(lineIDs...),
		shipmentitem.HasShipmentWith(shipment.Status(biz.ShipmentStatusShipped)),
	).All(ctx)
	if err != nil {
		return nil, nil, err
	}
	for _, row := range rows {
		if row.SalesOrderItemID == nil {
			continue
		}
		lineID := *row.SalesOrderItemID
		if row.AmountSnapshot == nil || !row.AmountSnapshot.GreaterThan(decimal.Zero) || row.CurrencySnapshot != expectedCurrency {
			invalid[lineID] = true
			continue
		}
		amounts[lineID] = amounts[lineID].Add(*row.AmountSnapshot)
	}
	return amounts, invalid, nil
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
	return &biz.Shipment{
		ID:                              row.ID,
		ShipmentNo:                      row.ShipmentNo,
		SalesOrderID:                    row.SalesOrderID,
		CustomerID:                      row.CustomerID,
		CustomerSnapshot:                row.CustomerSnapshot,
		DeliverySnapshot:                row.DeliverySnapshot,
		Status:                          row.Status,
		Version:                         row.Version,
		FinanceReleaseStatus:            row.FinanceReleaseStatus,
		FinanceReleaseVersion:           row.FinanceReleaseVersion,
		FinanceReleasedAt:               row.FinanceReleasedAt,
		FinanceReleasedBy:               row.FinanceReleasedBy,
		FinanceReleaseProcessInstanceID: row.FinanceReleaseProcessInstanceID,
		FinanceReleaseProcessNodeID:     row.FinanceReleaseProcessNodeID,
		FinanceReleaseNote:              row.FinanceReleaseNote,
		IdempotencyKey:                  row.IdempotencyKey,
		PlannedShipAt:                   row.PlannedShipAt,
		ShippedAt:                       row.ShippedAt,
		TransportMethod:                 row.TransportMethod,
		CarrierName:                     row.CarrierName,
		TrackingNo:                      row.TrackingNo,
		PackageCount:                    row.PackageCount,
		GrossWeightKg:                   row.GrossWeightKg,
		VolumeM3:                        row.VolumeM3,
		ShippingMark:                    row.ShippingMark,
		FreightAmount:                   row.FreightAmount,
		FreightCurrency:                 row.FreightCurrency,
		TotalNetWeightG:                 row.TotalNetWeightG,
		Note:                            row.Note,
		CreatedAt:                       row.CreatedAt,
		UpdatedAt:                       row.UpdatedAt,
		Items:                           items,
	}
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
	return &biz.ShipmentItem{
		ID:                     row.ID,
		ShipmentID:             row.ShipmentID,
		SalesOrderItemID:       row.SalesOrderItemID,
		ProductID:              row.ProductID,
		ProductSkuID:           row.ProductSkuID,
		WarehouseID:            row.WarehouseID,
		UnitID:                 row.UnitID,
		LotID:                  row.LotID,
		Quantity:               row.Quantity,
		UnitNetWeightGSnapshot: row.UnitNetWeightGSnapshot,
		UnitPriceSnapshot:      row.UnitPriceSnapshot,
		AmountSnapshot:         row.AmountSnapshot,
		CurrencySnapshot:       currencySnapshot,
		PackageDescription:     row.PackageDescription,
		CaseNo:                 row.CaseNo,
		Note:                   row.Note,
		CreatedAt:              row.CreatedAt,
		UpdatedAt:              row.UpdatedAt,
	}
}
