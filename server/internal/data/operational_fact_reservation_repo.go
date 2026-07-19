package data

import (
	"context"
	"time"

	"server/internal/biz"
	"server/internal/core/calc"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/shipmentitem"
	"server/internal/data/model/ent/stockreservation"

	"github.com/shopspring/decimal"
)

func (r *operationalFactRepo) CreateStockReservationFromSalesOrder(ctx context.Context, in *biz.StockReservationFromSalesOrderCreate) (*biz.StockReservation, error) {
	if in == nil {
		return nil, biz.ErrBadParam
	}
	if replay, found, err := findStockReservationFromSalesOrderReplay(ctx, r.data.postgres, in); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	resolved, err := lockAndResolveStockReservationSalesOrderSource(ctx, tx, in)
	if err != nil {
		return nil, err
	}
	if replay, found, err := findStockReservationFromSalesOrderReplay(ctx, tx.client, in); err != nil || found {
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	if err := validateOperationalFactSKUAndLot(ctx, tx.client, biz.InventorySubjectProduct, resolved.ProductID, resolved.ProductSkuID, resolved.LotID); err != nil {
		return nil, err
	}
	if err := validateStockReservationSourceQuantity(ctx, tx.client, resolved); err != nil {
		return nil, err
	}
	if err := lockInventoryBalanceForReservation(ctx, tx, resolved); err != nil {
		return nil, err
	}
	if err := ensureStockAvailableForReservation(ctx, tx.client, resolved); err != nil {
		return nil, err
	}
	row, err := createStockReservationRow(ctx, tx.client, resolved)
	if err != nil {
		if ent.IsConstraintError(err) {
			if rollbackErr := tx.sqlTx.Rollback(); rollbackErr != nil {
				r.log.WithContext(ctx).Warnf("rollback sourced reservation idempotency conflict failed err=%v", rollbackErr)
			}
			tx = nil
			if replay, found, replayErr := findStockReservationFromSalesOrderReplay(ctx, r.data.postgres, in); replayErr != nil || found {
				return replay, replayErr
			}
		}
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entStockReservationToBiz(row), nil
}

func (r *operationalFactRepo) CreateStockReservation(ctx context.Context, in *biz.StockReservationCreate) (*biz.StockReservation, error) {
	if err := validateOperationalFactSKUAndLot(ctx, r.data.postgres, biz.InventorySubjectProduct, in.ProductID, in.ProductSkuID, in.LotID); err != nil {
		return nil, err
	}
	if replay, found, err := findStockReservationReplay(ctx, r.data.postgres, in); err != nil || found {
		return replay, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if replay, found, err := findStockReservationReplay(ctx, tx.client, in); err != nil || found {
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	if err := lockAndValidateStockReservationSource(ctx, tx, in); err != nil {
		return nil, err
	}
	if replay, found, err := findStockReservationReplay(ctx, tx.client, in); err != nil || found {
		if err != nil {
			return nil, err
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	if err := validateStockReservationSourceQuantity(ctx, tx.client, in); err != nil {
		return nil, err
	}
	if err := lockInventoryBalanceForReservation(ctx, tx, in); err != nil {
		return nil, err
	}
	if err := ensureStockAvailableForReservation(ctx, tx.client, in); err != nil {
		return nil, err
	}
	row, err := createStockReservationRow(ctx, tx.client, in)
	if err != nil {
		if ent.IsConstraintError(err) {
			if rollbackErr := tx.sqlTx.Rollback(); rollbackErr != nil {
				r.log.WithContext(ctx).Warnf("rollback reservation idempotency conflict failed err=%v", rollbackErr)
			}
			tx = nil
			if replay, found, replayErr := findStockReservationReplay(ctx, r.data.postgres, in); replayErr != nil || found {
				return replay, replayErr
			}
		}
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entStockReservationToBiz(row), nil
}

func findStockReservationReplay(ctx context.Context, client *ent.Client, in *biz.StockReservationCreate) (*biz.StockReservation, bool, error) {
	row, err := client.StockReservation.Query().
		Where(stockreservation.IdempotencyKey(in.IdempotencyKey)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if !stockReservationMatchesCreate(row, in) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entStockReservationToBiz(row), true, nil
}

func stockReservationMatchesCreate(row *ent.StockReservation, in *biz.StockReservationCreate) bool {
	if row == nil || in == nil {
		return false
	}
	return row.ReservationNo == in.ReservationNo &&
		sameOptionalInt(row.SalesOrderID, in.SalesOrderID) &&
		sameOptionalInt(row.SalesOrderItemID, in.SalesOrderItemID) &&
		row.ProductID == in.ProductID &&
		sameOptionalInt(row.ProductSkuID, in.ProductSkuID) &&
		row.WarehouseID == in.WarehouseID &&
		row.UnitID == in.UnitID &&
		sameOptionalInt(row.LotID, in.LotID) &&
		row.Quantity.Cmp(in.Quantity) == 0 &&
		row.IdempotencyKey == in.IdempotencyKey &&
		sameIdempotencyIntentTime(row.ReservedAtSpecified, row.ReservedAt, in.ReservedAtSpecified, in.ReservedAt) &&
		sameOptionalString(row.Note, in.Note)
}

func findStockReservationFromSalesOrderReplay(ctx context.Context, client *ent.Client, in *biz.StockReservationFromSalesOrderCreate) (*biz.StockReservation, bool, error) {
	if client == nil || in == nil {
		return nil, false, biz.ErrBadParam
	}
	row, err := client.StockReservation.Query().
		Where(stockreservation.IdempotencyKey(in.IdempotencyKey)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if !stockReservationMatchesFromSalesOrderCreate(row, in) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entStockReservationToBiz(row), true, nil
}

func stockReservationMatchesFromSalesOrderCreate(row *ent.StockReservation, in *biz.StockReservationFromSalesOrderCreate) bool {
	if row == nil || in == nil || row.SalesOrderID == nil || row.SalesOrderItemID == nil {
		return false
	}
	return row.ReservationNo == in.ReservationNo &&
		*row.SalesOrderID == in.SalesOrderID &&
		*row.SalesOrderItemID == in.SalesOrderItemID &&
		row.WarehouseID == in.WarehouseID &&
		sameOptionalInt(row.LotID, in.LotID) &&
		row.Quantity.Cmp(in.Quantity) == 0 &&
		row.IdempotencyKey == in.IdempotencyKey &&
		sameIdempotencyIntentTime(row.ReservedAtSpecified, row.ReservedAt, in.ReservedAtSpecified, in.ReservedAt) &&
		sameOptionalString(row.Note, in.Note)
}

func createStockReservationRow(ctx context.Context, client *ent.Client, in *biz.StockReservationCreate) (*ent.StockReservation, error) {
	return client.StockReservation.Create().
		SetReservationNo(in.ReservationNo).
		SetStatus(biz.StockReservationStatusActive).
		SetNillableSalesOrderID(in.SalesOrderID).
		SetNillableSalesOrderItemID(in.SalesOrderItemID).
		SetProductID(in.ProductID).
		SetNillableProductSkuID(in.ProductSkuID).
		SetWarehouseID(in.WarehouseID).
		SetUnitID(in.UnitID).
		SetNillableLotID(in.LotID).
		SetQuantity(in.Quantity).
		SetIdempotencyKey(in.IdempotencyKey).
		SetReservedAt(in.ReservedAt).
		SetReservedAtSpecified(in.ReservedAtSpecified).
		SetNillableNote(in.Note).
		Save(ctx)
}

func lockInventoryBalanceForReservation(ctx context.Context, tx *inventoryDBTx, in *biz.StockReservationCreate) error {
	if tx == nil || in == nil {
		return nil
	}
	return lockInventoryBalanceRow(ctx, tx, biz.InventoryBalanceKey{
		SubjectType:  biz.InventorySubjectProduct,
		SubjectID:    in.ProductID,
		ProductSkuID: in.ProductSkuID,
		WarehouseID:  in.WarehouseID,
		LotID:        in.LotID,
		UnitID:       in.UnitID,
	})
}

func lockAndValidateStockReservationSource(ctx context.Context, tx *inventoryDBTx, in *biz.StockReservationCreate) error {
	if in.SalesOrderID == nil && in.SalesOrderItemID == nil {
		return nil
	}
	if in.SalesOrderID == nil || in.SalesOrderItemID == nil {
		return biz.ErrStockReservationSourceMismatch
	}
	if err := lockOperationalFactRow(ctx, tx, "sales_orders", *in.SalesOrderID, biz.ErrStockReservationSourceMismatch); err != nil {
		return err
	}
	if err := lockOperationalFactRow(ctx, tx, "sales_order_items", *in.SalesOrderItemID, biz.ErrStockReservationSourceMismatch); err != nil {
		return err
	}
	order, err := tx.client.SalesOrder.Get(ctx, *in.SalesOrderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrStockReservationSourceMismatch
		}
		return err
	}
	if order.LifecycleStatus != biz.SalesOrderStatusActive {
		return biz.ErrShipmentOrderNotActive
	}
	item, err := tx.client.SalesOrderItem.Get(ctx, *in.SalesOrderItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrStockReservationSourceMismatch
		}
		return err
	}
	if item.SalesOrderID != order.ID ||
		item.LineStatus != biz.SalesOrderItemStatusOpen ||
		item.ProductID != in.ProductID ||
		!sameOptionalInt(item.ProductSkuID, in.ProductSkuID) ||
		item.UnitID != in.UnitID {
		return biz.ErrStockReservationSourceMismatch
	}
	return nil
}

func lockAndResolveStockReservationSalesOrderSource(ctx context.Context, tx *inventoryDBTx, in *biz.StockReservationFromSalesOrderCreate) (*biz.StockReservationCreate, error) {
	if tx == nil || in == nil || in.SalesOrderID <= 0 || in.SalesOrderItemID <= 0 {
		return nil, biz.ErrStockReservationSourceMismatch
	}
	if err := lockOperationalFactRow(ctx, tx, "sales_orders", in.SalesOrderID, biz.ErrStockReservationSourceMismatch); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "sales_order_items", in.SalesOrderItemID, biz.ErrStockReservationSourceMismatch); err != nil {
		return nil, err
	}
	order, err := tx.client.SalesOrder.Get(ctx, in.SalesOrderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrStockReservationSourceMismatch
		}
		return nil, err
	}
	if order.LifecycleStatus != biz.SalesOrderStatusActive {
		return nil, biz.ErrShipmentOrderNotActive
	}
	item, err := tx.client.SalesOrderItem.Get(ctx, in.SalesOrderItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrStockReservationSourceMismatch
		}
		return nil, err
	}
	if item.SalesOrderID != order.ID || item.LineStatus != biz.SalesOrderItemStatusOpen {
		return nil, biz.ErrStockReservationSourceMismatch
	}
	orderID := order.ID
	itemID := item.ID
	return &biz.StockReservationCreate{
		ReservationNo:       in.ReservationNo,
		SalesOrderID:        &orderID,
		SalesOrderItemID:    &itemID,
		ProductID:           item.ProductID,
		ProductSkuID:        item.ProductSkuID,
		WarehouseID:         in.WarehouseID,
		UnitID:              item.UnitID,
		LotID:               in.LotID,
		Quantity:            in.Quantity,
		IdempotencyKey:      in.IdempotencyKey,
		ReservedAt:          in.ReservedAt,
		ReservedAtSpecified: in.ReservedAtSpecified,
		Note:                in.Note,
	}, nil
}

func validateStockReservationSourceQuantity(ctx context.Context, client *ent.Client, in *biz.StockReservationCreate) error {
	if in.SalesOrderItemID == nil {
		return nil
	}
	item, err := client.SalesOrderItem.Get(ctx, *in.SalesOrderItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrStockReservationSourceMismatch
		}
		return err
	}
	active, err := client.StockReservation.Query().
		Where(
			stockreservation.SalesOrderItemID(item.ID),
			stockreservation.Status(biz.StockReservationStatusActive),
		).
		All(ctx)
	if err != nil {
		return err
	}
	shipped, err := client.ShipmentItem.Query().
		Where(
			shipmentitem.SalesOrderItemID(item.ID),
			shipmentitem.HasShipmentWith(shipment.Status(biz.ShipmentStatusShipped)),
		).
		All(ctx)
	if err != nil {
		return err
	}
	committed := decimal.Zero
	for _, reservation := range active {
		committed = committed.Add(reservation.Quantity)
	}
	for _, shipmentLine := range shipped {
		committed = committed.Add(shipmentLine.Quantity)
	}
	if committed.Add(in.Quantity).GreaterThan(item.OrderedQuantity) {
		return biz.ErrStockReservationQuantityExceeded
	}
	return nil
}

func (r *operationalFactRepo) ReleaseStockReservation(ctx context.Context, id int) (*biz.StockReservation, error) {
	return r.releaseStockReservation(ctx, id)
}

func (r *operationalFactRepo) ListStockReservations(ctx context.Context, filter biz.OperationalFactFilter) ([]*biz.StockReservation, int, error) {
	q := r.data.postgres.StockReservation.Query()
	if filter.Status != "" {
		q = q.Where(stockreservation.Status(filter.Status))
	}
	if filter.ProductID > 0 {
		q = q.Where(stockreservation.ProductID(filter.ProductID))
	}
	if filter.ProductSkuID > 0 {
		q = q.Where(stockreservation.ProductSkuID(filter.ProductSkuID))
	}
	if filter.WarehouseID > 0 {
		q = q.Where(stockreservation.WarehouseID(filter.WarehouseID))
	}
	if filter.LotID > 0 {
		q = q.Where(stockreservation.LotID(filter.LotID))
	}
	if filter.SourceID > 0 {
		q = q.Where(stockreservation.SalesOrderID(filter.SourceID))
	}
	if filter.Keyword != "" {
		q = q.Where(stockreservation.Or(
			stockreservation.ReservationNoContainsFold(filter.Keyword),
			stockreservation.StatusContainsFold(filter.Keyword),
			stockreservation.IdempotencyKeyContainsFold(filter.Keyword),
			stockreservation.NoteContainsFold(filter.Keyword),
			stockreservation.IDEQ(parsePositiveIntOrZero(filter.Keyword)),
			stockreservation.SalesOrderIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			stockreservation.SalesOrderItemIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			stockreservation.ProductIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			stockreservation.ProductSkuIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			stockreservation.WarehouseIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			stockreservation.LotIDEQ(parsePositiveIntOrZero(filter.Keyword)),
		))
	}
	if filter.DateFrom != nil {
		q = q.Where(stockreservation.ReservedAtGTE(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		q = q.Where(stockreservation.ReservedAtLTE(endOfDateFilter(*filter.DateTo)))
	}
	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.Order(ent.Desc(stockreservation.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.StockReservation, 0, len(rows))
	for _, row := range rows {
		out = append(out, entStockReservationToBiz(row))
	}
	return out, total, nil
}

func (r *operationalFactRepo) releaseStockReservation(ctx context.Context, id int) (*biz.StockReservation, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "stock_reservations", id, biz.ErrStockReservationNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.StockReservation.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrStockReservationNotFound
		}
		return nil, err
	}
	if row.Status != biz.StockReservationStatusActive && row.Status != biz.StockReservationStatusReleased {
		return nil, biz.ErrBadParam
	}
	now := time.Now()
	if row.Status != biz.StockReservationStatusReleased {
		if err := updateOperationalFactStatus(ctx, tx, "stock_reservations", id, biz.StockReservationStatusReleased, "released_at", &now); err != nil {
			return nil, err
		}
		row, err = tx.client.StockReservation.Get(ctx, id)
		if err != nil {
			return nil, err
		}
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entStockReservationToBiz(row), nil
}

func ensureStockAvailableForReservation(ctx context.Context, client *ent.Client, in *biz.StockReservationCreate) error {
	balance, err := getInventoryBalance(ctx, client.InventoryBalance.Query(), biz.InventoryBalanceKey{
		SubjectType:  biz.InventorySubjectProduct,
		SubjectID:    in.ProductID,
		ProductSkuID: in.ProductSkuID,
		WarehouseID:  in.WarehouseID,
		LotID:        in.LotID,
		UnitID:       in.UnitID,
	})
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrInventoryInsufficientStock
		}
		return err
	}
	active, err := queryActiveStockReservations(ctx, client, in.ProductID, in.ProductSkuID, in.WarehouseID, in.UnitID, in.LotID)
	if err != nil {
		return err
	}
	reserved := decimal.Zero
	for _, row := range active {
		reserved = reserved.Add(row.Quantity)
	}
	if !calc.HasInventoryAvailableQuantity(balance.Quantity, reserved, in.Quantity) {
		return biz.ErrInventoryInsufficientStock
	}
	return nil
}

func queryActiveStockReservations(ctx context.Context, client *ent.Client, productID int, productSkuID *int, warehouseID, unitID int, lotID *int) ([]*ent.StockReservation, error) {
	query := client.StockReservation.Query().
		Where(
			stockreservation.Status(biz.StockReservationStatusActive),
			stockreservation.ProductID(productID),
			stockreservation.WarehouseID(warehouseID),
			stockreservation.UnitID(unitID),
		)
	if productSkuID == nil {
		query = query.Where(stockreservation.ProductSkuIDIsNil())
	} else {
		query = query.Where(stockreservation.ProductSkuID(*productSkuID))
	}
	if lotID == nil {
		query = query.Where(stockreservation.LotIDIsNil())
	} else {
		query = query.Where(stockreservation.LotID(*lotID))
	}
	return query.Order(ent.Asc(stockreservation.FieldID)).All(ctx)
}

func entStockReservationToBiz(row *ent.StockReservation) *biz.StockReservation {
	if row == nil {
		return nil
	}
	return &biz.StockReservation{ID: row.ID, ReservationNo: row.ReservationNo, Status: row.Status, SalesOrderID: row.SalesOrderID, SalesOrderItemID: row.SalesOrderItemID, ProductID: row.ProductID, ProductSkuID: row.ProductSkuID, WarehouseID: row.WarehouseID, UnitID: row.UnitID, LotID: row.LotID, Quantity: row.Quantity, IdempotencyKey: row.IdempotencyKey, ReservedAt: row.ReservedAt, ReleasedAt: row.ReleasedAt, ConsumedAt: row.ConsumedAt, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}
