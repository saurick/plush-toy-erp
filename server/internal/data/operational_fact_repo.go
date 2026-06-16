package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"time"

	"server/internal/biz"
	"server/internal/core/calc"
	corestatus "server/internal/core/status"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/shipmentitem"
	"server/internal/data/model/ent/stockreservation"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type operationalFactRepo struct {
	data *Data
	log  *log.Helper
	inv  *inventoryRepo
}

func NewOperationalFactRepo(d *Data, logger log.Logger) *operationalFactRepo {
	return &operationalFactRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.operational_fact_repo")),
		inv:  NewInventoryRepo(d, logger),
	}
}

var _ biz.OperationalFactRepo = (*operationalFactRepo)(nil)

func (r *operationalFactRepo) CreateProductionFactDraft(ctx context.Context, in *biz.OperationalFactMutation) (*biz.ProductionFact, error) {
	row, err := r.data.postgres.ProductionFact.Create().
		SetFactNo(in.FactNo).
		SetFactType(in.FactType).
		SetStatus(biz.OperationalFactStatusDraft).
		SetSubjectType(in.SubjectType).
		SetSubjectID(in.SubjectID).
		SetWarehouseID(in.WarehouseID).
		SetUnitID(in.UnitID).
		SetNillableLotID(in.LotID).
		SetQuantity(in.Quantity).
		SetNillableSourceType(in.SourceType).
		SetNillableSourceID(in.SourceID).
		SetNillableSourceLineID(in.SourceLineID).
		SetIdempotencyKey(in.IdempotencyKey).
		SetOccurredAt(in.OccurredAt).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entProductionFactToBiz(row), nil
}

func (r *operationalFactRepo) PostProductionFact(ctx context.Context, id int) (*biz.ProductionFact, error) {
	return r.postProductionFact(ctx, id, false)
}

func (r *operationalFactRepo) CancelPostedProductionFact(ctx context.Context, id int) (*biz.ProductionFact, error) {
	return r.postProductionFact(ctx, id, true)
}

func (r *operationalFactRepo) ListProductionFacts(ctx context.Context, filter biz.OperationalFactFilter) ([]*biz.ProductionFact, int, error) {
	q := r.data.postgres.ProductionFact.Query()
	if filter.Status != "" {
		q = q.Where(productionfact.Status(filter.Status))
	}
	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.Order(ent.Desc(productionfact.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.ProductionFact, 0, len(rows))
	for _, row := range rows {
		out = append(out, entProductionFactToBiz(row))
	}
	return out, total, nil
}

func (r *operationalFactRepo) CreateOutsourcingFactDraft(ctx context.Context, in *biz.OperationalFactMutation) (*biz.OutsourcingFact, error) {
	row, err := r.data.postgres.OutsourcingFact.Create().
		SetFactNo(in.FactNo).
		SetFactType(in.FactType).
		SetStatus(biz.OperationalFactStatusDraft).
		SetSubjectType(in.SubjectType).
		SetSubjectID(in.SubjectID).
		SetWarehouseID(in.WarehouseID).
		SetUnitID(in.UnitID).
		SetNillableLotID(in.LotID).
		SetQuantity(in.Quantity).
		SetNillableSupplierID(in.SupplierID).
		SetNillableSupplierName(in.SupplierName).
		SetNillableSourceType(in.SourceType).
		SetNillableSourceID(in.SourceID).
		SetNillableSourceLineID(in.SourceLineID).
		SetIdempotencyKey(in.IdempotencyKey).
		SetOccurredAt(in.OccurredAt).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entOutsourcingFactToBiz(row), nil
}

func (r *operationalFactRepo) PostOutsourcingFact(ctx context.Context, id int) (*biz.OutsourcingFact, error) {
	return r.postOutsourcingFact(ctx, id, false)
}

func (r *operationalFactRepo) CancelPostedOutsourcingFact(ctx context.Context, id int) (*biz.OutsourcingFact, error) {
	return r.postOutsourcingFact(ctx, id, true)
}

func (r *operationalFactRepo) ListOutsourcingFacts(ctx context.Context, filter biz.OperationalFactFilter) ([]*biz.OutsourcingFact, int, error) {
	q := r.data.postgres.OutsourcingFact.Query()
	if filter.Status != "" {
		q = q.Where(outsourcingfact.Status(filter.Status))
	}
	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.Order(ent.Desc(outsourcingfact.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.OutsourcingFact, 0, len(rows))
	for _, row := range rows {
		out = append(out, entOutsourcingFactToBiz(row))
	}
	return out, total, nil
}

func (r *operationalFactRepo) CreateShipmentDraft(ctx context.Context, in *biz.ShipmentCreate) (*biz.Shipment, error) {
	row, err := r.data.postgres.Shipment.Create().
		SetShipmentNo(in.ShipmentNo).
		SetNillableSalesOrderID(in.SalesOrderID).
		SetNillableCustomerID(in.CustomerID).
		SetNillableCustomerSnapshot(in.CustomerSnapshot).
		SetStatus(biz.ShipmentStatusDraft).
		SetIdempotencyKey(in.IdempotencyKey).
		SetNillablePlannedShipAt(in.PlannedShipAt).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return shipmentWithItems(ctx, r.data.postgres, row)
}

func (r *operationalFactRepo) CreateShipmentDraftWithItems(ctx context.Context, in *biz.ShipmentCreateWithItems) (*biz.Shipment, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	row, err := tx.client.Shipment.Create().
		SetShipmentNo(in.Shipment.ShipmentNo).
		SetNillableSalesOrderID(in.Shipment.SalesOrderID).
		SetNillableCustomerID(in.Shipment.CustomerID).
		SetNillableCustomerSnapshot(in.Shipment.CustomerSnapshot).
		SetStatus(biz.ShipmentStatusDraft).
		SetIdempotencyKey(in.Shipment.IdempotencyKey).
		SetNillablePlannedShipAt(in.Shipment.PlannedShipAt).
		SetNillableNote(in.Shipment.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	for _, item := range in.Items {
		if _, err := createShipmentItem(ctx, tx.client, row.ID, item); err != nil {
			return nil, err
		}
	}
	return commitShipment(ctx, tx, row)
}

func (r *operationalFactRepo) AddShipmentItem(ctx context.Context, in *biz.ShipmentItemCreate) (*biz.ShipmentItem, error) {
	parent, err := r.data.postgres.Shipment.Get(ctx, in.ShipmentID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentNotFound
		}
		return nil, err
	}
	if !corestatus.CanAddShipmentItem(parent.Status) {
		return nil, biz.ErrBadParam
	}
	row, err := createShipmentItem(ctx, r.data.postgres, in.ShipmentID, in)
	if err != nil {
		return nil, err
	}
	return entShipmentItemToBiz(row), nil
}

func createShipmentItem(ctx context.Context, client *ent.Client, shipmentID int, in *biz.ShipmentItemCreate) (*ent.ShipmentItem, error) {
	return client.ShipmentItem.Create().
		SetShipmentID(shipmentID).
		SetNillableSalesOrderItemID(in.SalesOrderItemID).
		SetProductID(in.ProductID).
		SetWarehouseID(in.WarehouseID).
		SetUnitID(in.UnitID).
		SetNillableLotID(in.LotID).
		SetQuantity(in.Quantity).
		SetNillableNote(in.Note).
		Save(ctx)
}

func (r *operationalFactRepo) ShipShipment(ctx context.Context, id int) (*biz.Shipment, error) {
	return r.shipShipment(ctx, id, false)
}

func (r *operationalFactRepo) CancelShippedShipment(ctx context.Context, id int) (*biz.Shipment, error) {
	return r.shipShipment(ctx, id, true)
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
			query = query.Where(shipment.ShippedAtLTE(*filter.DateTo))
		}
	default:
		if filter.DateFrom != nil {
			query = query.Where(shipment.PlannedShipAtGTE(*filter.DateFrom))
		}
		if filter.DateTo != nil {
			query = query.Where(shipment.PlannedShipAtLTE(*filter.DateTo))
		}
	}
	return query
}

func (r *operationalFactRepo) CreateStockReservation(ctx context.Context, in *biz.StockReservationCreate) (*biz.StockReservation, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := ensureStockAvailableForReservation(ctx, tx.client, in); err != nil {
		return nil, err
	}
	row, err := tx.client.StockReservation.Create().
		SetReservationNo(in.ReservationNo).
		SetStatus(biz.StockReservationStatusActive).
		SetNillableSalesOrderID(in.SalesOrderID).
		SetNillableSalesOrderItemID(in.SalesOrderItemID).
		SetProductID(in.ProductID).
		SetWarehouseID(in.WarehouseID).
		SetUnitID(in.UnitID).
		SetNillableLotID(in.LotID).
		SetQuantity(in.Quantity).
		SetIdempotencyKey(in.IdempotencyKey).
		SetReservedAt(in.ReservedAt).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entStockReservationToBiz(row), nil
}

func (r *operationalFactRepo) ReleaseStockReservation(ctx context.Context, id int) (*biz.StockReservation, error) {
	return r.changeStockReservationStatus(ctx, id, biz.StockReservationStatusReleased)
}

func (r *operationalFactRepo) ConsumeStockReservation(ctx context.Context, id int) (*biz.StockReservation, error) {
	return r.changeStockReservationStatus(ctx, id, biz.StockReservationStatusConsumed)
}

func (r *operationalFactRepo) ListStockReservations(ctx context.Context, filter biz.OperationalFactFilter) ([]*biz.StockReservation, int, error) {
	q := r.data.postgres.StockReservation.Query()
	if filter.Status != "" {
		q = q.Where(stockreservation.Status(filter.Status))
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

func (r *operationalFactRepo) CreateFinanceFactDraft(ctx context.Context, in *biz.FinanceFactCreate) (*biz.FinanceFact, error) {
	row, err := r.data.postgres.FinanceFact.Create().
		SetFactNo(in.FactNo).
		SetFactType(in.FactType).
		SetStatus(biz.OperationalFactStatusDraft).
		SetCounterpartyType(in.CounterpartyType).
		SetNillableCounterpartyID(in.CounterpartyID).
		SetAmount(in.Amount).
		SetCurrency(in.Currency).
		SetNillableSourceType(in.SourceType).
		SetNillableSourceID(in.SourceID).
		SetNillableSourceLineID(in.SourceLineID).
		SetIdempotencyKey(in.IdempotencyKey).
		SetOccurredAt(in.OccurredAt).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entFinanceFactToBiz(row), nil
}

func (r *operationalFactRepo) PostFinanceFact(ctx context.Context, id int) (*biz.FinanceFact, error) {
	return r.changeFinanceFactStatus(ctx, id, biz.OperationalFactStatusPosted)
}

func (r *operationalFactRepo) SettleFinanceFact(ctx context.Context, id int) (*biz.FinanceFact, error) {
	return r.changeFinanceFactStatus(ctx, id, biz.OperationalFactStatusSettled)
}

func (r *operationalFactRepo) CancelPostedFinanceFact(ctx context.Context, id int) (*biz.FinanceFact, error) {
	return r.changeFinanceFactStatus(ctx, id, biz.OperationalFactStatusCancelled)
}

func (r *operationalFactRepo) ListFinanceFacts(ctx context.Context, filter biz.OperationalFactFilter) ([]*biz.FinanceFact, int, error) {
	q := r.data.postgres.FinanceFact.Query()
	if filter.Status != "" {
		q = q.Where(financefact.Status(filter.Status))
	}
	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.Order(ent.Desc(financefact.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.FinanceFact, 0, len(rows))
	for _, row := range rows {
		out = append(out, entFinanceFactToBiz(row))
	}
	return out, total, nil
}

func (r *operationalFactRepo) postProductionFact(ctx context.Context, id int, cancel bool) (*biz.ProductionFact, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "production_facts", id, biz.ErrProductionFactNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.ProductionFact.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionFactNotFound
		}
		return nil, err
	}
	if cancel {
		if row.Status == biz.OperationalFactStatusCancelled {
			return commitProductionFact(ctx, tx, row)
		}
		if row.Status != biz.OperationalFactStatusPosted {
			return nil, biz.ErrBadParam
		}
		if err := r.applyProductionFactInventory(ctx, tx, row, true); err != nil {
			return nil, err
		}
		if err := updateOperationalFactStatus(ctx, tx, "production_facts", id, biz.OperationalFactStatusCancelled, "posted_at", nil); err != nil {
			return nil, err
		}
	} else {
		if row.Status == biz.OperationalFactStatusPosted {
			return commitProductionFact(ctx, tx, row)
		}
		if row.Status != biz.OperationalFactStatusDraft {
			return nil, biz.ErrBadParam
		}
		if err := r.applyProductionFactInventory(ctx, tx, row, false); err != nil {
			return nil, err
		}
		now := time.Now()
		if err := updateOperationalFactStatus(ctx, tx, "production_facts", id, biz.OperationalFactStatusPosted, "posted_at", &now); err != nil {
			return nil, err
		}
	}
	row, err = tx.client.ProductionFact.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	return commitProductionFact(ctx, tx, row)
}

func (r *operationalFactRepo) postOutsourcingFact(ctx context.Context, id int, cancel bool) (*biz.OutsourcingFact, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_facts", id, biz.ErrOutsourcingFactNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.OutsourcingFact.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrOutsourcingFactNotFound
		}
		return nil, err
	}
	if cancel {
		if row.Status == biz.OperationalFactStatusCancelled {
			return commitOutsourcingFact(ctx, tx, row)
		}
		if row.Status != biz.OperationalFactStatusPosted {
			return nil, biz.ErrBadParam
		}
		if err := r.applyOutsourcingFactInventory(ctx, tx, row, true); err != nil {
			return nil, err
		}
		if err := updateOperationalFactStatus(ctx, tx, "outsourcing_facts", id, biz.OperationalFactStatusCancelled, "posted_at", nil); err != nil {
			return nil, err
		}
	} else {
		if row.Status == biz.OperationalFactStatusPosted {
			return commitOutsourcingFact(ctx, tx, row)
		}
		if row.Status != biz.OperationalFactStatusDraft {
			return nil, biz.ErrBadParam
		}
		if err := r.applyOutsourcingFactInventory(ctx, tx, row, false); err != nil {
			return nil, err
		}
		now := time.Now()
		if err := updateOperationalFactStatus(ctx, tx, "outsourcing_facts", id, biz.OperationalFactStatusPosted, "posted_at", &now); err != nil {
			return nil, err
		}
	}
	row, err = tx.client.OutsourcingFact.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	return commitOutsourcingFact(ctx, tx, row)
}

func (r *operationalFactRepo) shipShipment(ctx context.Context, id int, cancel bool) (*biz.Shipment, error) {
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
	if cancel {
		transition, ok := corestatus.CancelShippedShipment(parent.Status)
		if !ok {
			return nil, biz.ErrBadParam
		}
		if !transition.Changed {
			return commitShipment(ctx, tx, parent)
		}
		for _, item := range items {
			if err := r.applyShipmentItemInventory(ctx, tx, parent, item, true); err != nil {
				return nil, err
			}
		}
		if err := updateOperationalFactStatus(ctx, tx, "shipments", id, transition.Target, "shipped_at", nil); err != nil {
			return nil, err
		}
	} else {
		transition, ok := corestatus.ShipShipment(parent.Status)
		if !ok {
			return nil, biz.ErrBadParam
		}
		if !transition.Changed {
			return commitShipment(ctx, tx, parent)
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
	return commitShipment(ctx, tx, parent)
}

func (r *operationalFactRepo) changeStockReservationStatus(ctx context.Context, id int, status string) (*biz.StockReservation, error) {
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
	if row.Status != biz.StockReservationStatusActive && row.Status != status {
		return nil, biz.ErrBadParam
	}
	tsField := "released_at"
	if status == biz.StockReservationStatusConsumed {
		tsField = "consumed_at"
	}
	now := time.Now()
	if row.Status != status {
		if err := updateOperationalFactStatus(ctx, tx, "stock_reservations", id, status, tsField, &now); err != nil {
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

func (r *operationalFactRepo) changeFinanceFactStatus(ctx context.Context, id int, status string) (*biz.FinanceFact, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "finance_facts", id, biz.ErrFinanceFactNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.FinanceFact.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrFinanceFactNotFound
		}
		return nil, err
	}
	switch status {
	case biz.OperationalFactStatusPosted:
		if row.Status != biz.OperationalFactStatusDraft && row.Status != biz.OperationalFactStatusPosted {
			return nil, biz.ErrBadParam
		}
	case biz.OperationalFactStatusSettled:
		if row.Status != biz.OperationalFactStatusPosted && row.Status != biz.OperationalFactStatusSettled {
			return nil, biz.ErrBadParam
		}
	case biz.OperationalFactStatusCancelled:
		if row.Status != biz.OperationalFactStatusPosted && row.Status != biz.OperationalFactStatusCancelled {
			return nil, biz.ErrBadParam
		}
	default:
		return nil, biz.ErrBadParam
	}
	if row.Status != status {
		tsField := "posted_at"
		if status == biz.OperationalFactStatusSettled {
			tsField = "settled_at"
		}
		now := time.Now()
		if err := updateOperationalFactStatus(ctx, tx, "finance_facts", id, status, tsField, &now); err != nil {
			return nil, err
		}
		row, err = tx.client.FinanceFact.Get(ctx, id)
		if err != nil {
			return nil, err
		}
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entFinanceFactToBiz(row), nil
}

func (r *operationalFactRepo) applyProductionFactInventory(ctx context.Context, tx *inventoryDBTx, row *ent.ProductionFact, cancel bool) error {
	direction, txnType := productionFactInventoryDirection(row.FactType)
	return r.applyOperationalFactInventory(ctx, tx, operationalFactInventoryArgs{
		sourceType:   biz.ProductionFactSourceType,
		sourceID:     row.ID,
		sourceLineID: row.ID,
		subjectType:  row.SubjectType,
		subjectID:    row.SubjectID,
		warehouseID:  row.WarehouseID,
		lotID:        row.LotID,
		unitID:       row.UnitID,
		quantity:     row.Quantity,
		direction:    direction,
		txnType:      txnType,
		occurredAt:   row.OccurredAt,
		cancel:       cancel,
	})
}

func (r *operationalFactRepo) applyOutsourcingFactInventory(ctx context.Context, tx *inventoryDBTx, row *ent.OutsourcingFact, cancel bool) error {
	direction, txnType := outsourcingFactInventoryDirection(row.FactType)
	return r.applyOperationalFactInventory(ctx, tx, operationalFactInventoryArgs{
		sourceType:   biz.OutsourcingFactSourceType,
		sourceID:     row.ID,
		sourceLineID: row.ID,
		subjectType:  row.SubjectType,
		subjectID:    row.SubjectID,
		warehouseID:  row.WarehouseID,
		lotID:        row.LotID,
		unitID:       row.UnitID,
		quantity:     row.Quantity,
		direction:    direction,
		txnType:      txnType,
		occurredAt:   row.OccurredAt,
		cancel:       cancel,
	})
}

func (r *operationalFactRepo) applyShipmentItemInventory(ctx context.Context, tx *inventoryDBTx, parent *ent.Shipment, item *ent.ShipmentItem, cancel bool) error {
	return r.applyOperationalFactInventory(ctx, tx, operationalFactInventoryArgs{
		sourceType:   biz.ShipmentSourceType,
		sourceID:     parent.ID,
		sourceLineID: item.ID,
		subjectType:  biz.InventorySubjectProduct,
		subjectID:    item.ProductID,
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

type operationalFactInventoryArgs struct {
	sourceType   string
	sourceID     int
	sourceLineID int
	subjectType  string
	subjectID    int
	warehouseID  int
	lotID        *int
	unitID       int
	quantity     decimal.Decimal
	direction    int
	txnType      string
	occurredAt   time.Time
	cancel       bool
}

func (r *operationalFactRepo) applyOperationalFactInventory(ctx context.Context, tx *inventoryDBTx, in operationalFactInventoryArgs) error {
	sourceID := in.sourceID
	sourceLineID := in.sourceLineID
	if in.cancel {
		original, err := tx.client.InventoryTxn.Query().
			Where(inventorytxn.IdempotencyKey(biz.OperationalFactInventoryIdempotencyKey(in.sourceType, sourceID, sourceLineID, "POST"))).
			Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrInventoryTxnNotFound
			}
			return err
		}
		reversalOf := original.ID
		_, err = r.inv.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, &biz.InventoryTxnCreate{
			SubjectType:     original.SubjectType,
			SubjectID:       original.SubjectID,
			WarehouseID:     original.WarehouseID,
			LotID:           original.LotID,
			TxnType:         biz.InventoryTxnReversal,
			Direction:       -original.Direction,
			Quantity:        original.Quantity,
			UnitID:          original.UnitID,
			SourceType:      in.sourceType,
			SourceID:        &sourceID,
			SourceLineID:    &sourceLineID,
			IdempotencyKey:  biz.OperationalFactInventoryIdempotencyKey(in.sourceType, sourceID, sourceLineID, "REVERSAL"),
			ReversalOfTxnID: &reversalOf,
			OccurredAt:      time.Now(),
		})
		return err
	}
	_, err := r.inv.applyInventoryTxnAndUpdateBalanceInTx(ctx, tx, &biz.InventoryTxnCreate{
		SubjectType:    in.subjectType,
		SubjectID:      in.subjectID,
		WarehouseID:    in.warehouseID,
		LotID:          in.lotID,
		TxnType:        in.txnType,
		Direction:      in.direction,
		Quantity:       in.quantity,
		UnitID:         in.unitID,
		SourceType:     in.sourceType,
		SourceID:       &sourceID,
		SourceLineID:   &sourceLineID,
		IdempotencyKey: biz.OperationalFactInventoryIdempotencyKey(in.sourceType, sourceID, sourceLineID, "POST"),
		OccurredAt:     in.occurredAt,
	})
	return err
}

func productionFactInventoryDirection(factType string) (int, string) {
	if factType == biz.ProductionFactFinishedGoodsReceipt {
		return 1, biz.InventoryTxnIn
	}
	return -1, biz.InventoryTxnOut
}

func outsourcingFactInventoryDirection(factType string) (int, string) {
	if factType == biz.OutsourcingFactReturnReceipt {
		return 1, biz.InventoryTxnIn
	}
	return -1, biz.InventoryTxnOut
}

func ensureStockAvailableForReservation(ctx context.Context, client *ent.Client, in *biz.StockReservationCreate) error {
	balance, err := getInventoryBalance(ctx, client.InventoryBalance.Query(), biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectProduct,
		SubjectID:   in.ProductID,
		WarehouseID: in.WarehouseID,
		LotID:       in.LotID,
		UnitID:      in.UnitID,
	})
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrInventoryInsufficientStock
		}
		return err
	}
	var active []*ent.StockReservation
	if in.LotID == nil {
		active, err = client.StockReservation.Query().
			Where(
				stockreservation.Status(biz.StockReservationStatusActive),
				stockreservation.ProductID(in.ProductID),
				stockreservation.WarehouseID(in.WarehouseID),
				stockreservation.UnitID(in.UnitID),
				stockreservation.LotIDIsNil(),
			).
			All(ctx)
	} else {
		active, err = client.StockReservation.Query().
			Where(
				stockreservation.Status(biz.StockReservationStatusActive),
				stockreservation.ProductID(in.ProductID),
				stockreservation.WarehouseID(in.WarehouseID),
				stockreservation.UnitID(in.UnitID),
				stockreservation.LotID(*in.LotID),
			).
			All(ctx)
	}
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

func lockOperationalFactRow(ctx context.Context, tx *inventoryDBTx, table string, id int, notFound error) error {
	if tx.dialect != dialect.Postgres {
		return nil
	}
	var got int
	query := fmt.Sprintf(`SELECT id FROM %s WHERE id = $1 FOR UPDATE`, table)
	if err := tx.sqlTx.QueryRowContext(ctx, query, id).Scan(&got); err != nil {
		if errors.Is(err, stdsql.ErrNoRows) {
			return notFound
		}
		return err
	}
	return nil
}

func updateOperationalFactStatus(ctx context.Context, tx *inventoryDBTx, table string, id int, status string, timeField string, timeValue *time.Time) error {
	p := inventorySQLPlaceholders(tx.dialect, 4)
	if timeValue == nil {
		query := fmt.Sprintf(`UPDATE %s SET status = %s, updated_at = %s WHERE id = %s`, table, p[0], p[1], p[2])
		_, err := tx.sqlTx.ExecContext(ctx, query, status, time.Now(), id)
		return err
	}
	query := fmt.Sprintf(`UPDATE %s SET status = %s, %s = %s, updated_at = %s WHERE id = %s`, table, p[0], timeField, p[1], p[2], p[3])
	_, err := tx.sqlTx.ExecContext(ctx, query, status, *timeValue, time.Now(), id)
	return err
}

func commitProductionFact(ctx context.Context, tx *inventoryDBTx, row *ent.ProductionFact) (*biz.ProductionFact, error) {
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return entProductionFactToBiz(row), nil
}

func commitOutsourcingFact(ctx context.Context, tx *inventoryDBTx, row *ent.OutsourcingFact) (*biz.OutsourcingFact, error) {
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return entOutsourcingFactToBiz(row), nil
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

func entProductionFactToBiz(row *ent.ProductionFact) *biz.ProductionFact {
	if row == nil {
		return nil
	}
	return &biz.ProductionFact{ID: row.ID, FactNo: row.FactNo, FactType: row.FactType, Status: row.Status, SubjectType: row.SubjectType, SubjectID: row.SubjectID, WarehouseID: row.WarehouseID, UnitID: row.UnitID, LotID: row.LotID, Quantity: row.Quantity, SourceType: row.SourceType, SourceID: row.SourceID, SourceLineID: row.SourceLineID, IdempotencyKey: row.IdempotencyKey, OccurredAt: row.OccurredAt, PostedAt: row.PostedAt, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}

func entOutsourcingFactToBiz(row *ent.OutsourcingFact) *biz.OutsourcingFact {
	if row == nil {
		return nil
	}
	return &biz.OutsourcingFact{ID: row.ID, FactNo: row.FactNo, FactType: row.FactType, Status: row.Status, SubjectType: row.SubjectType, SubjectID: row.SubjectID, WarehouseID: row.WarehouseID, UnitID: row.UnitID, LotID: row.LotID, Quantity: row.Quantity, SupplierID: row.SupplierID, SupplierName: row.SupplierName, SourceType: row.SourceType, SourceID: row.SourceID, SourceLineID: row.SourceLineID, IdempotencyKey: row.IdempotencyKey, OccurredAt: row.OccurredAt, PostedAt: row.PostedAt, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}

func entShipmentToBiz(row *ent.Shipment, itemRows []*ent.ShipmentItem) *biz.Shipment {
	if row == nil {
		return nil
	}
	items := make([]*biz.ShipmentItem, 0, len(itemRows))
	for _, item := range itemRows {
		items = append(items, entShipmentItemToBiz(item))
	}
	return &biz.Shipment{ID: row.ID, ShipmentNo: row.ShipmentNo, SalesOrderID: row.SalesOrderID, CustomerID: row.CustomerID, CustomerSnapshot: row.CustomerSnapshot, Status: row.Status, IdempotencyKey: row.IdempotencyKey, PlannedShipAt: row.PlannedShipAt, ShippedAt: row.ShippedAt, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt, Items: items}
}

func entShipmentItemToBiz(row *ent.ShipmentItem) *biz.ShipmentItem {
	if row == nil {
		return nil
	}
	return &biz.ShipmentItem{ID: row.ID, ShipmentID: row.ShipmentID, SalesOrderItemID: row.SalesOrderItemID, ProductID: row.ProductID, WarehouseID: row.WarehouseID, UnitID: row.UnitID, LotID: row.LotID, Quantity: row.Quantity, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}

func entStockReservationToBiz(row *ent.StockReservation) *biz.StockReservation {
	if row == nil {
		return nil
	}
	return &biz.StockReservation{ID: row.ID, ReservationNo: row.ReservationNo, Status: row.Status, SalesOrderID: row.SalesOrderID, SalesOrderItemID: row.SalesOrderItemID, ProductID: row.ProductID, WarehouseID: row.WarehouseID, UnitID: row.UnitID, LotID: row.LotID, Quantity: row.Quantity, IdempotencyKey: row.IdempotencyKey, ReservedAt: row.ReservedAt, ReleasedAt: row.ReleasedAt, ConsumedAt: row.ConsumedAt, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}

func entFinanceFactToBiz(row *ent.FinanceFact) *biz.FinanceFact {
	if row == nil {
		return nil
	}
	return &biz.FinanceFact{ID: row.ID, FactNo: row.FactNo, FactType: row.FactType, Status: row.Status, CounterpartyType: row.CounterpartyType, CounterpartyID: row.CounterpartyID, Amount: row.Amount, Currency: row.Currency, SourceType: row.SourceType, SourceID: row.SourceID, SourceLineID: row.SourceLineID, IdempotencyKey: row.IdempotencyKey, OccurredAt: row.OccurredAt, PostedAt: row.PostedAt, SettledAt: row.SettledAt, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}
