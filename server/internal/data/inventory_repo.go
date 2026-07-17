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
	"server/internal/data/model/ent/bomheader"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/inventorylot"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/stockreservation"
	"server/internal/data/model/ent/supplier"
	"server/internal/data/model/ent/unit"
	"server/internal/data/model/ent/warehouse"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type inventoryRepo struct {
	data *Data
	log  *log.Helper
}

type inventoryDBTx struct {
	sqlTx   *stdsql.Tx
	client  *ent.Client
	dialect string
}

func NewInventoryRepo(d *Data, logger log.Logger) *inventoryRepo {
	return &inventoryRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.inventory_repo")),
	}
}

var _ biz.InventoryRepo = (*inventoryRepo)(nil)
var _ biz.PurchaseReceiptCancellationActorRepo = (*inventoryRepo)(nil)
var _ biz.PurchaseReceiptCreateProcessCommandRepo = (*inventoryRepo)(nil)
var _ biz.InventoryPostInboundProcessCommandRepo = (*inventoryRepo)(nil)
var _ biz.QualityInspectionProcessCommandRepo = (*inventoryRepo)(nil)

func (r *inventoryRepo) GetSupplier(ctx context.Context, id int) (*biz.Supplier, error) {
	row, err := r.data.postgres.Supplier.Query().
		Where(supplier.ID(id)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSupplierNotFound
		}
		return nil, err
	}
	return entSupplierToBiz(row), nil
}

func (r *inventoryRepo) MaterialIsActive(ctx context.Context, id int) (bool, error) {
	row, err := r.data.postgres.Material.Query().
		Where(material.ID(id)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrMaterialNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (r *inventoryRepo) ProductIsActive(ctx context.Context, id int) (bool, error) {
	row, err := r.data.postgres.Product.Query().
		Where(product.ID(id)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrProductNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (r *inventoryRepo) UnitIsActive(ctx context.Context, id int) (bool, error) {
	row, err := r.data.postgres.Unit.Query().
		Where(unit.ID(id)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrUnitNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (r *inventoryRepo) WarehouseIsActive(ctx context.Context, id int) (bool, error) {
	row, err := r.data.postgres.Warehouse.Query().
		Where(warehouse.ID(id)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrWarehouseNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (r *inventoryRepo) CreateInventoryLot(ctx context.Context, in *biz.InventoryLotCreate) (*biz.InventoryLot, error) {
	if err := validateInventorySubjectSKU(ctx, r.data.postgres, in.SubjectType, in.SubjectID, in.ProductSkuID); err != nil {
		return nil, err
	}
	row, err := r.data.postgres.InventoryLot.Create().
		SetSubjectType(in.SubjectType).
		SetSubjectID(in.SubjectID).
		SetNillableProductSkuID(in.ProductSkuID).
		SetLotNo(in.LotNo).
		SetNillableSupplierLotNo(in.SupplierLotNo).
		SetNillableColorNo(in.ColorNo).
		SetNillableDyeLotNo(in.DyeLotNo).
		SetNillableProductionLotNo(in.ProductionLotNo).
		SetStatus(in.Status).
		SetNillableReceivedAt(in.ReceivedAt).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entInventoryLotToBiz(row), nil
}

func (r *inventoryRepo) GetInventoryLot(ctx context.Context, id int) (*biz.InventoryLot, error) {
	row, err := r.data.postgres.InventoryLot.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrInventoryLotNotFound
		}
		return nil, err
	}
	return entInventoryLotToBiz(row), nil
}

func (r *inventoryRepo) ChangeInventoryLotStatus(ctx context.Context, lotID int, newStatus string, reason string) (*biz.InventoryLot, error) {
	_ = reason
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if err := lockInventoryLot(ctx, tx, lotID); err != nil {
		return nil, err
	}
	lot, err := tx.client.InventoryLot.Get(ctx, lotID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrInventoryLotNotFound
		}
		return nil, err
	}
	hasBalance, err := inventoryLotHasPositiveBalance(ctx, tx.client, lotID)
	if err != nil {
		return nil, err
	}
	if !corestatus.CanChangeInventoryLotStatus(lot.Status, newStatus, hasBalance) {
		return nil, biz.ErrBadParam
	}
	if lot.Status != newStatus {
		if err := updateInventoryLotStatus(ctx, tx, lotID, newStatus); err != nil {
			return nil, err
		}
		lot, err = tx.client.InventoryLot.Get(ctx, lotID)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrInventoryLotNotFound
			}
			return nil, err
		}
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entInventoryLotToBiz(lot), nil
}

func (r *inventoryRepo) CreateInventoryTxn(ctx context.Context, in *biz.InventoryTxnCreate) (*biz.InventoryTxn, error) {
	existing, err := r.data.postgres.InventoryTxn.Query().
		Where(inventorytxn.IdempotencyKey(in.IdempotencyKey)).
		Only(ctx)
	if err == nil {
		if !inventoryTxnMatchesCreate(existing, in) {
			return nil, biz.ErrIdempotencyConflict
		}
		return entInventoryTxnToBiz(existing), nil
	}
	if err != nil && !ent.IsNotFound(err) {
		return nil, err
	}
	if err := validateInventoryTxnReferences(ctx, r.data.postgres, in); err != nil {
		return nil, err
	}

	row, err := createInventoryTxn(ctx, r.data.postgres.InventoryTxn.Create(), in)
	if err != nil {
		if ent.IsConstraintError(err) {
			existing, lookupErr := r.data.postgres.InventoryTxn.Query().
				Where(inventorytxn.IdempotencyKey(in.IdempotencyKey)).
				Only(ctx)
			if lookupErr == nil {
				if !inventoryTxnMatchesCreate(existing, in) {
					return nil, biz.ErrIdempotencyConflict
				}
				return entInventoryTxnToBiz(existing), nil
			}
			if reversed, lookupErr := inventoryTxnAlreadyReversed(ctx, r.data.postgres, in); lookupErr != nil {
				return nil, lookupErr
			} else if reversed {
				return nil, biz.ErrInventoryTxnAlreadyReversed
			}
		}
		return nil, err
	}
	return entInventoryTxnToBiz(row), nil
}

func (r *inventoryRepo) ApplyInventoryTxnAndUpdateBalance(ctx context.Context, in *biz.InventoryTxnCreate) (*biz.InventoryTxnApplyResult, error) {
	tx, err := r.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	existing, err := tx.client.InventoryTxn.Query().
		Where(inventorytxn.IdempotencyKey(in.IdempotencyKey)).
		Only(ctx)
	if err == nil {
		if !inventoryTxnMatchesCreate(existing, in) {
			return nil, biz.ErrIdempotencyConflict
		}
		balance, balanceErr := getInventoryBalance(ctx, tx.client.InventoryBalance.Query(), inventoryBalanceKeyFromEntTxn(existing))
		if balanceErr != nil && !ent.IsNotFound(balanceErr) {
			return nil, balanceErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return &biz.InventoryTxnApplyResult{
			Txn:              entInventoryTxnToBiz(existing),
			Balance:          entInventoryBalanceToBiz(balance),
			IdempotentReplay: true,
		}, nil
	}
	if err != nil && !ent.IsNotFound(err) {
		return nil, err
	}
	if err := validateInventoryTxnReferences(ctx, tx.client, in); err != nil {
		return nil, err
	}

	row, err := createInventoryTxn(ctx, tx.client.InventoryTxn.Create(), in)
	if err != nil {
		if ent.IsConstraintError(err) {
			if rollbackErr := tx.sqlTx.Rollback(); rollbackErr != nil {
				r.log.WithContext(ctx).Warnf("rollback inventory txn conflict failed err=%v", rollbackErr)
			}
			tx = nil
			existing, lookupErr := r.data.postgres.InventoryTxn.Query().
				Where(inventorytxn.IdempotencyKey(in.IdempotencyKey)).
				Only(ctx)
			if lookupErr == nil {
				if !inventoryTxnMatchesCreate(existing, in) {
					return nil, biz.ErrIdempotencyConflict
				}
				balance, balanceErr := r.GetInventoryBalance(ctx, inventoryBalanceKeyFromEntTxn(existing))
				if balanceErr != nil && !errors.Is(balanceErr, biz.ErrInventoryBalanceNotFound) {
					return nil, balanceErr
				}
				return &biz.InventoryTxnApplyResult{
					Txn:              entInventoryTxnToBiz(existing),
					Balance:          balance,
					IdempotentReplay: true,
				}, nil
			}
			if reversed, lookupErr := inventoryTxnAlreadyReversed(ctx, r.data.postgres, in); lookupErr != nil {
				return nil, lookupErr
			} else if reversed {
				return nil, biz.ErrInventoryTxnAlreadyReversed
			}
			return nil, biz.ErrBadParam
		}
		return nil, err
	}
	balance, err := applyInventoryBalanceDelta(ctx, tx, in)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return &biz.InventoryTxnApplyResult{
		Txn:     entInventoryTxnToBiz(row),
		Balance: entInventoryBalanceToBiz(balance),
	}, nil
}

func (r *inventoryRepo) GetInventoryBalance(ctx context.Context, key biz.InventoryBalanceKey) (*biz.InventoryBalance, error) {
	row, err := getInventoryBalance(ctx, r.data.postgres.InventoryBalance.Query(), key)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrInventoryBalanceNotFound
		}
		return nil, err
	}
	return entInventoryBalanceToBiz(row), nil
}

func (r *inventoryRepo) ListInventoryBalances(ctx context.Context, filter biz.InventoryBalanceFilter) ([]*biz.InventoryBalance, int, error) {
	query := r.data.postgres.InventoryBalance.Query()
	if filter.SubjectType != "" {
		query = query.Where(inventorybalance.SubjectTypeEQ(filter.SubjectType))
	}
	if filter.SubjectID > 0 {
		query = query.Where(inventorybalance.SubjectIDEQ(filter.SubjectID))
	}
	if filter.ProductSkuID > 0 {
		query = query.Where(inventorybalance.ProductSkuID(filter.ProductSkuID))
	}
	if filter.WarehouseID > 0 {
		query = query.Where(inventorybalance.WarehouseIDEQ(filter.WarehouseID))
	}
	if filter.LotID > 0 {
		query = query.Where(inventorybalance.LotIDEQ(filter.LotID))
	}
	if filter.Keyword != "" {
		query = query.Where(inventorybalance.Or(
			inventorybalance.SubjectTypeContainsFold(filter.Keyword),
			inventorybalance.IDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorybalance.SubjectIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorybalance.ProductSkuIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorybalance.WarehouseIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorybalance.LotIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorybalance.UnitIDEQ(parsePositiveIntOrZero(filter.Keyword)),
		))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.
		Order(ent.Desc(inventorybalance.FieldUpdatedAt), ent.Desc(inventorybalance.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.InventoryBalance, 0, len(rows))
	for _, row := range rows {
		item := entInventoryBalanceToBiz(row)
		activeReserved, err := activeReservedQuantityForBalance(ctx, r.data.postgres, row)
		if err != nil {
			return nil, 0, err
		}
		item.ActiveReservedQuantity = activeReserved
		item.AvailableQuantity = calc.InventoryAvailableQuantity(item.Quantity, activeReserved)
		out = append(out, item)
	}
	return out, total, nil
}

func activeReservedQuantityForBalance(ctx context.Context, client *ent.Client, row *ent.InventoryBalance) (decimal.Decimal, error) {
	if row == nil {
		return decimal.Zero, nil
	}
	return activeReservedQuantityForInventoryKey(ctx, client, biz.InventoryBalanceKey{
		SubjectType:  row.SubjectType,
		SubjectID:    row.SubjectID,
		ProductSkuID: row.ProductSkuID,
		WarehouseID:  row.WarehouseID,
		LotID:        row.LotID,
		UnitID:       row.UnitID,
	})
}

func (r *inventoryRepo) ListInventoryLots(ctx context.Context, filter biz.InventoryLotFilter) ([]*biz.InventoryLot, int, error) {
	query := r.data.postgres.InventoryLot.Query()
	if filter.SubjectType != "" {
		query = query.Where(inventorylot.SubjectTypeEQ(filter.SubjectType))
	}
	if filter.SubjectID > 0 {
		query = query.Where(inventorylot.SubjectIDEQ(filter.SubjectID))
	}
	if filter.ProductSkuID > 0 {
		query = query.Where(inventorylot.ProductSkuID(filter.ProductSkuID))
	}
	if filter.Status != "" {
		query = query.Where(inventorylot.StatusEQ(filter.Status))
	}
	if filter.WarehouseID > 0 {
		query = query.Where(inventorylot.HasInventoryBalancesWith(
			inventorybalance.WarehouseID(filter.WarehouseID),
			inventorybalance.QuantityGT(decimal.Zero),
		))
	}
	if filter.Keyword != "" {
		query = query.Where(inventorylot.Or(
			inventorylot.SubjectTypeContainsFold(filter.Keyword),
			inventorylot.LotNoContainsFold(filter.Keyword),
			inventorylot.SupplierLotNoContainsFold(filter.Keyword),
			inventorylot.ColorNoContainsFold(filter.Keyword),
			inventorylot.DyeLotNoContainsFold(filter.Keyword),
			inventorylot.ProductionLotNoContainsFold(filter.Keyword),
			inventorylot.StatusContainsFold(filter.Keyword),
			inventorylot.IDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorylot.SubjectIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorylot.ProductSkuIDEQ(parsePositiveIntOrZero(filter.Keyword)),
		))
	}
	if filter.DateFrom != nil {
		query = query.Where(inventorylot.ReceivedAtGTE(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		query = query.Where(inventorylot.ReceivedAtLTE(endOfDateFilter(*filter.DateTo)))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.
		Order(ent.Desc(inventorylot.FieldUpdatedAt), ent.Desc(inventorylot.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.InventoryLot, 0, len(rows))
	for _, row := range rows {
		out = append(out, entInventoryLotToBiz(row))
	}
	return out, total, nil
}

func (r *inventoryRepo) ListInventoryTxns(ctx context.Context, filter biz.InventoryTxnFilter) ([]*biz.InventoryTxn, int, error) {
	query := r.data.postgres.InventoryTxn.Query()
	if filter.SubjectType != "" {
		query = query.Where(inventorytxn.SubjectTypeEQ(filter.SubjectType))
	}
	if filter.SubjectID > 0 {
		query = query.Where(inventorytxn.SubjectIDEQ(filter.SubjectID))
	}
	if filter.ProductSkuID > 0 {
		query = query.Where(inventorytxn.ProductSkuID(filter.ProductSkuID))
	}
	if filter.WarehouseID > 0 {
		query = query.Where(inventorytxn.WarehouseIDEQ(filter.WarehouseID))
	}
	if filter.LotID > 0 {
		query = query.Where(inventorytxn.LotIDEQ(filter.LotID))
	}
	if filter.TxnType != "" {
		query = query.Where(inventorytxn.TxnType(filter.TxnType))
	}
	if filter.SourceType != "" {
		query = query.Where(inventorytxn.SourceType(filter.SourceType))
	}
	if filter.SourceID > 0 {
		query = query.Where(inventorytxn.SourceIDEQ(filter.SourceID))
	}
	if filter.Keyword != "" {
		query = query.Where(inventorytxn.Or(
			inventorytxn.SubjectTypeContainsFold(filter.Keyword),
			inventorytxn.TxnTypeContainsFold(filter.Keyword),
			inventorytxn.SourceTypeContainsFold(filter.Keyword),
			inventorytxn.IdempotencyKeyContainsFold(filter.Keyword),
			inventorytxn.NoteContainsFold(filter.Keyword),
			inventorytxn.IDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorytxn.SubjectIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorytxn.ProductSkuIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorytxn.WarehouseIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorytxn.LotIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorytxn.UnitIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorytxn.SourceIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorytxn.SourceLineIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			inventorytxn.ReversalOfTxnIDEQ(parsePositiveIntOrZero(filter.Keyword)),
		))
	}
	if filter.DateFrom != nil {
		query = query.Where(inventorytxn.OccurredAtGTE(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		query = query.Where(inventorytxn.OccurredAtLTE(endOfDateFilter(*filter.DateTo)))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.
		Order(ent.Desc(inventorytxn.FieldOccurredAt), ent.Desc(inventorytxn.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.InventoryTxn, 0, len(rows))
	for _, row := range rows {
		out = append(out, entInventoryTxnToBiz(row))
	}
	return out, total, nil
}

func (r *inventoryRepo) beginInventoryDBTx(ctx context.Context) (*inventoryDBTx, error) {
	if r == nil || r.data == nil || r.data.sqldb == nil {
		return nil, biz.ErrBadParam
	}
	sqlTx, err := r.data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	sqlDialect := r.data.sqlDialect
	if sqlDialect == "" {
		sqlDialect = dialect.Postgres
	}
	client := ent.NewClient(ent.Driver(entsql.NewDriver(sqlDialect, entsql.Conn{ExecQuerier: sqlTx})))
	return &inventoryDBTx{
		sqlTx:   sqlTx,
		client:  client,
		dialect: sqlDialect,
	}, nil
}

func createInventoryTxn(ctx context.Context, builder *ent.InventoryTxnCreate, in *biz.InventoryTxnCreate) (*ent.InventoryTxn, error) {
	create := builder.
		SetSubjectType(in.SubjectType).
		SetSubjectID(in.SubjectID).
		SetNillableProductSkuID(in.ProductSkuID).
		SetWarehouseID(in.WarehouseID).
		SetNillableLotID(in.LotID).
		SetTxnType(in.TxnType).
		SetDirection(in.Direction).
		SetQuantity(in.Quantity).
		SetUnitID(in.UnitID).
		SetSourceType(in.SourceType).
		SetNillableSourceID(in.SourceID).
		SetNillableSourceLineID(in.SourceLineID).
		SetIdempotencyKey(in.IdempotencyKey).
		SetNillableReversalOfTxnID(in.ReversalOfTxnID).
		SetOccurredAt(in.OccurredAt).
		SetOccurredAtSpecified(in.OccurredAtSpecified).
		SetNillableCreatedBy(in.CreatedBy).
		SetNillableNote(in.Note)
	return create.Save(ctx)
}

func applyInventoryBalanceDelta(ctx context.Context, tx *inventoryDBTx, in *biz.InventoryTxnCreate) (*ent.InventoryBalance, error) {
	key := inventoryBalanceKeyFromTxn(in)
	delta := in.Quantity
	if in.Direction < 0 {
		delta = delta.Neg()
	}

	if delta.Cmp(decimal.Zero) >= 0 {
		if err := upsertInventoryBalanceDelta(ctx, tx, key, delta); err != nil {
			return nil, err
		}
	} else {
		minimumRemaining := decimal.Zero
		if key.SubjectType == biz.InventorySubjectProduct {
			if err := lockInventoryBalanceRow(ctx, tx, key); err != nil {
				return nil, err
			}
			var err error
			minimumRemaining, err = activeReservedQuantityForInventoryKey(ctx, tx.client, key)
			if err != nil {
				return nil, err
			}
		}
		affected, err := updateInventoryBalanceDelta(ctx, tx, key, delta, minimumRemaining)
		if err != nil {
			return nil, err
		}
		if affected == 0 {
			return nil, biz.ErrInventoryInsufficientStock
		}
	}
	return getInventoryBalance(ctx, tx.client.InventoryBalance.Query(), key)
}

func activeReservedQuantityForInventoryKey(ctx context.Context, client *ent.Client, key biz.InventoryBalanceKey) (decimal.Decimal, error) {
	if key.SubjectType != biz.InventorySubjectProduct {
		return decimal.Zero, nil
	}
	query := client.StockReservation.Query().Where(
		stockreservation.Status(biz.StockReservationStatusActive),
		stockreservation.ProductID(key.SubjectID),
		stockreservation.WarehouseID(key.WarehouseID),
		stockreservation.UnitID(key.UnitID),
	)
	if key.ProductSkuID == nil {
		query = query.Where(stockreservation.ProductSkuIDIsNil())
	} else {
		query = query.Where(stockreservation.ProductSkuID(*key.ProductSkuID))
	}
	if key.LotID == nil {
		query = query.Where(stockreservation.LotIDIsNil())
	} else {
		query = query.Where(stockreservation.LotID(*key.LotID))
	}
	rows, err := query.All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	total := decimal.Zero
	for _, row := range rows {
		total = total.Add(row.Quantity)
	}
	return total, nil
}

func lockInventoryBalanceRow(ctx context.Context, tx *inventoryDBTx, key biz.InventoryBalanceKey) error {
	if tx == nil || tx.dialect != dialect.Postgres {
		return nil
	}
	var id int
	query := `
SELECT id
FROM inventory_balances
WHERE subject_type = $1
  AND subject_id = $2
  AND warehouse_id = $3
	  AND unit_id = $4`
	args := []any{key.SubjectType, key.SubjectID, key.WarehouseID, key.UnitID}
	if key.ProductSkuID == nil {
		query += " AND product_sku_id IS NULL"
	} else {
		query += fmt.Sprintf(" AND product_sku_id = $%d", len(args)+1)
		args = append(args, *key.ProductSkuID)
	}
	if key.LotID == nil {
		query += " AND lot_id IS NULL"
	} else {
		query += fmt.Sprintf(" AND lot_id = $%d", len(args)+1)
		args = append(args, *key.LotID)
	}
	query += " FOR UPDATE"
	err := tx.sqlTx.QueryRowContext(ctx, query, args...).Scan(&id)
	if errors.Is(err, stdsql.ErrNoRows) {
		return biz.ErrInventoryInsufficientStock
	}
	return err
}

func inventoryBalanceKeyFromTxn(in *biz.InventoryTxnCreate) biz.InventoryBalanceKey {
	return biz.InventoryBalanceKey{
		SubjectType:  in.SubjectType,
		SubjectID:    in.SubjectID,
		ProductSkuID: in.ProductSkuID,
		WarehouseID:  in.WarehouseID,
		LotID:        in.LotID,
		UnitID:       in.UnitID,
	}
}

func inventoryBalanceKeyFromEntTxn(row *ent.InventoryTxn) biz.InventoryBalanceKey {
	if row == nil {
		return biz.InventoryBalanceKey{}
	}
	return biz.InventoryBalanceKey{
		SubjectType:  row.SubjectType,
		SubjectID:    row.SubjectID,
		ProductSkuID: row.ProductSkuID,
		WarehouseID:  row.WarehouseID,
		LotID:        row.LotID,
		UnitID:       row.UnitID,
	}
}

func inventoryTxnMatchesCreate(row *ent.InventoryTxn, in *biz.InventoryTxnCreate) bool {
	if row == nil || in == nil {
		return false
	}
	return row.SubjectType == in.SubjectType &&
		row.SubjectID == in.SubjectID &&
		sameOptionalInt(row.ProductSkuID, in.ProductSkuID) &&
		row.WarehouseID == in.WarehouseID &&
		sameOptionalInt(row.LotID, in.LotID) &&
		row.TxnType == in.TxnType &&
		row.Direction == in.Direction &&
		row.Quantity.Cmp(in.Quantity) == 0 &&
		row.UnitID == in.UnitID &&
		row.SourceType == in.SourceType &&
		sameOptionalInt(row.SourceID, in.SourceID) &&
		sameOptionalInt(row.SourceLineID, in.SourceLineID) &&
		sameOptionalInt(row.ReversalOfTxnID, in.ReversalOfTxnID) &&
		sameIdempotencyIntentTime(row.OccurredAtSpecified, row.OccurredAt, in.OccurredAtSpecified, in.OccurredAt) &&
		sameOptionalInt(row.CreatedBy, in.CreatedBy) &&
		sameOptionalString(row.Note, in.Note)
}

func getInventoryBalance(ctx context.Context, query *ent.InventoryBalanceQuery, key biz.InventoryBalanceKey) (*ent.InventoryBalance, error) {
	predicates := []predicate.InventoryBalance{
		inventorybalance.SubjectType(key.SubjectType),
		inventorybalance.SubjectID(key.SubjectID),
		inventorybalance.WarehouseID(key.WarehouseID),
		inventorybalance.UnitID(key.UnitID),
	}
	if key.ProductSkuID == nil {
		predicates = append(predicates, inventorybalance.ProductSkuIDIsNil())
	} else {
		predicates = append(predicates, inventorybalance.ProductSkuID(*key.ProductSkuID))
	}
	if key.LotID == nil {
		predicates = append(predicates, inventorybalance.LotIDIsNil())
	} else {
		predicates = append(predicates, inventorybalance.LotID(*key.LotID))
	}
	return query.Where(predicates...).Only(ctx)
}

func validateInventoryTxnReferences(ctx context.Context, client *ent.Client, in *biz.InventoryTxnCreate) error {
	if err := validateInventorySubject(ctx, client, in); err != nil {
		return err
	}
	if err := validateInventoryReversal(ctx, client, in); err != nil {
		return err
	}
	return validateInventoryLotForTxn(ctx, client, in)
}

func validateInventorySubject(ctx context.Context, client *ent.Client, in *biz.InventoryTxnCreate) error {
	return validateInventorySubjectSKU(ctx, client, in.SubjectType, in.SubjectID, in.ProductSkuID)
}

func validateInventorySubjectSKU(ctx context.Context, client *ent.Client, subjectType string, subjectID int, productSkuID *int) error {
	if err := validateInventoryLotSubject(ctx, client, subjectType, subjectID); err != nil {
		return err
	}
	if productSkuID == nil {
		return nil
	}
	if subjectType != biz.InventorySubjectProduct {
		return biz.ErrBadParam
	}
	sku, err := client.ProductSKU.Query().Where(productsku.ID(*productSkuID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrProductSKUNotFound
		}
		return err
	}
	if sku.ProductID != subjectID {
		return biz.ErrBadParam
	}
	return nil
}

func validateInventoryLotSubject(ctx context.Context, client *ent.Client, subjectType string, subjectID int) error {
	switch subjectType {
	case biz.InventorySubjectMaterial:
		if _, err := client.Material.Get(ctx, subjectID); err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrBadParam
			}
			return err
		}
	case biz.InventorySubjectProduct:
		if _, err := client.Product.Get(ctx, subjectID); err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrBadParam
			}
			return err
		}
	default:
		return biz.ErrBadParam
	}
	return nil
}

func validateInventoryLotForTxn(ctx context.Context, client *ent.Client, in *biz.InventoryTxnCreate) error {
	if in.LotID == nil {
		return nil
	}
	lot, err := client.InventoryLot.Get(ctx, *in.LotID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrInventoryLotNotFound
		}
		return err
	}
	if lot.SubjectType != in.SubjectType || lot.SubjectID != in.SubjectID || !sameOptionalInt(lot.ProductSkuID, in.ProductSkuID) {
		return biz.ErrBadParam
	}
	allowBlockedLotDisposition, err := isProductionReworkDispositionTxn(ctx, client, in)
	if err != nil {
		return err
	}
	if err := validateInventoryLotStatusForTxn(lot.Status, in, allowBlockedLotDisposition); err != nil {
		return err
	}
	return nil
}

func isProductionReworkDispositionTxn(ctx context.Context, client *ent.Client, in *biz.InventoryTxnCreate) (bool, error) {
	if in.Direction >= 0 || in.TxnType != biz.InventoryTxnOut || in.SourceType != biz.ProductionFactSourceType || in.SourceID == nil {
		return false, nil
	}
	row, err := client.ProductionFact.Query().
		Where(productionfact.ID(*in.SourceID)).
		Select(productionfact.FieldFactType).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, nil
		}
		return false, err
	}
	return row.FactType == biz.ProductionFactRework, nil
}

func validateInventoryLotStatusForTxn(status string, in *biz.InventoryTxnCreate, allowBlockedLotDisposition bool) error {
	if in.TxnType == biz.InventoryTxnReversal || in.Direction >= 0 {
		return nil
	}
	if allowBlockedLotDisposition && in.TxnType == biz.InventoryTxnOut {
		switch status {
		case biz.InventoryLotActive, biz.InventoryLotHold, biz.InventoryLotRejected:
			return nil
		default:
			return biz.ErrInventoryLotStatusBlocked
		}
	}
	if in.SourceType == biz.PurchaseReturnSourceType && in.TxnType == biz.InventoryTxnOut {
		switch status {
		case biz.InventoryLotActive, biz.InventoryLotHold, biz.InventoryLotRejected:
			return nil
		default:
			return biz.ErrInventoryLotStatusBlocked
		}
	}
	if status != biz.InventoryLotActive {
		return biz.ErrInventoryLotStatusBlocked
	}
	return nil
}

func validateInventoryReversal(ctx context.Context, client *ent.Client, in *biz.InventoryTxnCreate) error {
	if in.TxnType != biz.InventoryTxnReversal {
		return nil
	}
	if in.ReversalOfTxnID == nil {
		return biz.ErrBadParam
	}
	original, err := client.InventoryTxn.Get(ctx, *in.ReversalOfTxnID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrInventoryTxnNotFound
		}
		return err
	}
	if original.TxnType == biz.InventoryTxnReversal ||
		original.SubjectType != in.SubjectType ||
		original.SubjectID != in.SubjectID ||
		!sameOptionalInt(original.ProductSkuID, in.ProductSkuID) ||
		original.WarehouseID != in.WarehouseID ||
		original.UnitID != in.UnitID ||
		original.Direction != -in.Direction ||
		original.Quantity.Cmp(in.Quantity) != 0 {
		return biz.ErrBadParam
	}
	if !sameOptionalInt(original.LotID, in.LotID) {
		if in.LotID == nil && original.LotID != nil {
			in.LotID = original.LotID
		} else {
			return biz.ErrBadParam
		}
	}
	exists, err := client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(*in.ReversalOfTxnID)).
		Exist(ctx)
	if err != nil {
		return err
	}
	if exists {
		return biz.ErrInventoryTxnAlreadyReversed
	}
	return nil
}

func inventoryTxnAlreadyReversed(ctx context.Context, client *ent.Client, in *biz.InventoryTxnCreate) (bool, error) {
	if in.TxnType != biz.InventoryTxnReversal || in.ReversalOfTxnID == nil {
		return false, nil
	}
	return client.InventoryTxn.Query().
		Where(inventorytxn.ReversalOfTxnID(*in.ReversalOfTxnID)).
		Exist(ctx)
}

func inventoryLotHasPositiveBalance(ctx context.Context, client *ent.Client, lotID int) (bool, error) {
	return client.InventoryBalance.Query().
		Where(
			inventorybalance.LotID(lotID),
			inventorybalance.QuantityGT(decimal.Zero),
		).
		Exist(ctx)
}

func lockInventoryLot(ctx context.Context, tx *inventoryDBTx, lotID int) error {
	if tx.dialect != dialect.Postgres {
		return nil
	}
	var id int
	if err := tx.sqlTx.QueryRowContext(ctx, `SELECT id FROM inventory_lots WHERE id = $1 FOR UPDATE`, lotID).Scan(&id); err != nil {
		if errors.Is(err, stdsql.ErrNoRows) {
			return biz.ErrInventoryLotNotFound
		}
		return err
	}
	return nil
}

func updateInventoryLotStatus(ctx context.Context, tx *inventoryDBTx, lotID int, status string) error {
	p := inventorySQLPlaceholders(tx.dialect, 3)
	query := fmt.Sprintf(`UPDATE inventory_lots SET status = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2])
	result, err := tx.sqlTx.ExecContext(ctx, query, status, time.Now(), lotID)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return biz.ErrInventoryLotNotFound
	}
	return nil
}

func upsertInventoryBalanceDelta(ctx context.Context, tx *inventoryDBTx, key biz.InventoryBalanceKey, delta decimal.Decimal) error {
	now := time.Now()
	var query string
	var args []any
	switch {
	case key.ProductSkuID == nil && key.LotID == nil:
		p := inventorySQLPlaceholders(tx.dialect, 6)
		query = fmt.Sprintf(
			`INSERT INTO inventory_balances (subject_type, subject_id, product_sku_id, warehouse_id, lot_id, unit_id, quantity, updated_at)
VALUES (%s, %s, NULL, %s, NULL, %s, %s, %s)
ON CONFLICT (subject_type, subject_id, warehouse_id, unit_id) WHERE product_sku_id IS NULL AND lot_id IS NULL
DO UPDATE SET quantity = inventory_balances.quantity + EXCLUDED.quantity, updated_at = EXCLUDED.updated_at`,
			p[0], p[1], p[2], p[3], p[4], p[5],
		)
		args = []any{key.SubjectType, key.SubjectID, key.WarehouseID, key.UnitID, delta, now}
	case key.ProductSkuID == nil && key.LotID != nil:
		p := inventorySQLPlaceholders(tx.dialect, 7)
		query = fmt.Sprintf(
			`INSERT INTO inventory_balances (subject_type, subject_id, product_sku_id, warehouse_id, lot_id, unit_id, quantity, updated_at)
VALUES (%s, %s, NULL, %s, %s, %s, %s, %s)
ON CONFLICT (subject_type, subject_id, warehouse_id, unit_id, lot_id) WHERE product_sku_id IS NULL AND lot_id IS NOT NULL
DO UPDATE SET quantity = inventory_balances.quantity + EXCLUDED.quantity, updated_at = EXCLUDED.updated_at`,
			p[0], p[1], p[2], p[3], p[4], p[5], p[6],
		)
		args = []any{key.SubjectType, key.SubjectID, key.WarehouseID, *key.LotID, key.UnitID, delta, now}
	case key.ProductSkuID != nil && key.LotID == nil:
		p := inventorySQLPlaceholders(tx.dialect, 7)
		query = fmt.Sprintf(
			`INSERT INTO inventory_balances (subject_type, subject_id, product_sku_id, warehouse_id, lot_id, unit_id, quantity, updated_at)
VALUES (%s, %s, %s, %s, NULL, %s, %s, %s)
ON CONFLICT (subject_type, subject_id, product_sku_id, warehouse_id, unit_id) WHERE product_sku_id IS NOT NULL AND lot_id IS NULL
DO UPDATE SET quantity = inventory_balances.quantity + EXCLUDED.quantity, updated_at = EXCLUDED.updated_at`,
			p[0], p[1], p[2], p[3], p[4], p[5], p[6],
		)
		args = []any{key.SubjectType, key.SubjectID, *key.ProductSkuID, key.WarehouseID, key.UnitID, delta, now}
	default:
		p := inventorySQLPlaceholders(tx.dialect, 8)
		query = fmt.Sprintf(
			`INSERT INTO inventory_balances (subject_type, subject_id, product_sku_id, warehouse_id, lot_id, unit_id, quantity, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (subject_type, subject_id, product_sku_id, warehouse_id, unit_id, lot_id) WHERE product_sku_id IS NOT NULL AND lot_id IS NOT NULL
DO UPDATE SET quantity = inventory_balances.quantity + EXCLUDED.quantity, updated_at = EXCLUDED.updated_at`,
			p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7],
		)
		args = []any{key.SubjectType, key.SubjectID, *key.ProductSkuID, key.WarehouseID, *key.LotID, key.UnitID, delta, now}
	}
	_, err := tx.sqlTx.ExecContext(ctx, query, args...)
	return err
}

func updateInventoryBalanceDelta(ctx context.Context, tx *inventoryDBTx, key biz.InventoryBalanceKey, delta decimal.Decimal, minimumRemaining decimal.Decimal) (int64, error) {
	now := time.Now()
	p := inventorySQLPlaceholders(tx.dialect, 6)
	query := fmt.Sprintf(
		`UPDATE inventory_balances
SET quantity = quantity + %s, updated_at = %s
WHERE subject_type = %s AND subject_id = %s AND warehouse_id = %s AND unit_id = %s`,
		p[0], p[1], p[2], p[3], p[4], p[5],
	)
	args := []any{delta, now, key.SubjectType, key.SubjectID, key.WarehouseID, key.UnitID}
	if key.ProductSkuID == nil {
		query += " AND product_sku_id IS NULL"
	} else {
		p = inventorySQLPlaceholders(tx.dialect, len(args)+1)
		query += fmt.Sprintf(" AND product_sku_id = %s", p[len(args)])
		args = append(args, *key.ProductSkuID)
	}
	if key.LotID == nil {
		query += " AND lot_id IS NULL"
	} else {
		p = inventorySQLPlaceholders(tx.dialect, len(args)+1)
		query += fmt.Sprintf(" AND lot_id = %s", p[len(args)])
		args = append(args, *key.LotID)
	}
	p = inventorySQLPlaceholders(tx.dialect, len(args)+2)
	query += fmt.Sprintf(" AND quantity + %s >= CAST(%s AS DECIMAL)", p[len(args)], p[len(args)+1])
	args = append(args, delta, minimumRemaining.String())
	result, err := tx.sqlTx.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (r *inventoryRepo) CreateBOMHeader(ctx context.Context, in *biz.BOMHeaderCreate) (*biz.BOMHeader, error) {
	if in == nil || !biz.IsCreatableBOMStatus(in.Status) {
		return nil, biz.ErrBadParam
	}
	if _, err := r.data.postgres.Product.Get(ctx, in.ProductID); err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBadParam
		}
		return nil, err
	}
	row, err := r.data.postgres.BOMHeader.Create().
		SetProductID(in.ProductID).
		SetVersion(in.Version).
		SetStatus(in.Status).
		SetNillableEffectiveFrom(in.EffectiveFrom).
		SetNillableEffectiveTo(in.EffectiveTo).
		SetNillableSourceOrderNo(in.SourceOrderNo).
		SetNillableQuantityText(in.QuantityText).
		SetNillableSpareText(in.SpareText).
		SetNillablePrintDate(in.PrintDate).
		SetNillableDesigner(in.Designer).
		SetNillableMaker(in.Maker).
		SetNillableAuditor(in.Auditor).
		SetNillableHairDirection(in.HairDirection).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entBOMHeaderToBiz(row), nil
}

func (r *inventoryRepo) CreateBOMItem(ctx context.Context, in *biz.BOMItemCreate) (*biz.BOMItem, error) {
	header, err := r.data.postgres.BOMHeader.Get(ctx, in.BOMHeaderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBOMHeaderNotFound
		}
		return nil, err
	}
	if header.Status != biz.BOMStatusDraft {
		return nil, biz.ErrBOMActiveImmutable
	}
	if _, err := r.data.postgres.Material.Get(ctx, in.MaterialID); err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBadParam
		}
		return nil, err
	}
	if _, err := r.data.postgres.Unit.Get(ctx, in.UnitID); err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBadParam
		}
		return nil, err
	}
	row, err := r.data.postgres.BOMItem.Create().
		SetBomHeaderID(in.BOMHeaderID).
		SetMaterialID(in.MaterialID).
		SetQuantity(in.Quantity).
		SetUnitID(in.UnitID).
		SetLossRate(in.LossRate).
		SetNillablePosition(in.Position).
		SetNillablePieceCount(in.PieceCount).
		SetNillableTotalUsageSnapshot(in.TotalUsageSnapshot).
		SetNillableProcessBase(in.ProcessBase).
		SetNillableProcessMethod(in.ProcessMethod).
		SetNillableProductionOperationCode(in.ProductionOperationCode).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entBOMItemToBiz(row), nil
}

func (r *inventoryRepo) UpdateBOMDraftHeader(ctx context.Context, id int, in *biz.BOMHeaderUpdate) (*biz.BOMHeader, error) {
	header, err := r.data.postgres.BOMHeader.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBOMHeaderNotFound
		}
		return nil, err
	}
	if header.Status != biz.BOMStatusDraft {
		return nil, biz.ErrBOMActiveImmutable
	}
	update := r.data.postgres.BOMHeader.UpdateOneID(id).
		SetVersion(in.Version)
	if in.EffectiveFrom == nil {
		update.ClearEffectiveFrom()
	} else {
		update.SetEffectiveFrom(*in.EffectiveFrom)
	}
	if in.EffectiveTo == nil {
		update.ClearEffectiveTo()
	} else {
		update.SetEffectiveTo(*in.EffectiveTo)
	}
	if in.SourceOrderNo == nil {
		update.ClearSourceOrderNo()
	} else {
		update.SetSourceOrderNo(*in.SourceOrderNo)
	}
	if in.QuantityText == nil {
		update.ClearQuantityText()
	} else {
		update.SetQuantityText(*in.QuantityText)
	}
	if in.SpareText == nil {
		update.ClearSpareText()
	} else {
		update.SetSpareText(*in.SpareText)
	}
	if in.PrintDate == nil {
		update.ClearPrintDate()
	} else {
		update.SetPrintDate(*in.PrintDate)
	}
	if in.Designer == nil {
		update.ClearDesigner()
	} else {
		update.SetDesigner(*in.Designer)
	}
	if in.Maker == nil {
		update.ClearMaker()
	} else {
		update.SetMaker(*in.Maker)
	}
	if in.Auditor == nil {
		update.ClearAuditor()
	} else {
		update.SetAuditor(*in.Auditor)
	}
	if in.HairDirection == nil {
		update.ClearHairDirection()
	} else {
		update.SetHairDirection(*in.HairDirection)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	return entBOMHeaderToBiz(row), nil
}

func (r *inventoryRepo) UpdateBOMDraftItem(ctx context.Context, id int, in *biz.BOMItemUpdate) (*biz.BOMItem, error) {
	item, err := r.data.postgres.BOMItem.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBOMItemNotFound
		}
		return nil, err
	}
	header, err := r.data.postgres.BOMHeader.Get(ctx, item.BomHeaderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBOMHeaderNotFound
		}
		return nil, err
	}
	if header.Status != biz.BOMStatusDraft {
		return nil, biz.ErrBOMActiveImmutable
	}
	if _, err := r.data.postgres.Material.Get(ctx, in.MaterialID); err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBadParam
		}
		return nil, err
	}
	if _, err := r.data.postgres.Unit.Get(ctx, in.UnitID); err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBadParam
		}
		return nil, err
	}
	update := r.data.postgres.BOMItem.UpdateOneID(id).
		SetMaterialID(in.MaterialID).
		SetQuantity(in.Quantity).
		SetUnitID(in.UnitID).
		SetLossRate(in.LossRate)
	if in.Position == nil {
		update.ClearPosition()
	} else {
		update.SetPosition(*in.Position)
	}
	if in.PieceCount == nil {
		update.ClearPieceCount()
	} else {
		update.SetPieceCount(*in.PieceCount)
	}
	if in.TotalUsageSnapshot == nil {
		update.ClearTotalUsageSnapshot()
	} else {
		update.SetTotalUsageSnapshot(*in.TotalUsageSnapshot)
	}
	if in.ProcessBase == nil {
		update.ClearProcessBase()
	} else {
		update.SetProcessBase(*in.ProcessBase)
	}
	if in.ProcessMethod == nil {
		update.ClearProcessMethod()
	} else {
		update.SetProcessMethod(*in.ProcessMethod)
	}
	if in.ProductionOperationCode == nil {
		update.ClearProductionOperationCode()
	} else {
		update.SetProductionOperationCode(*in.ProductionOperationCode)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		return nil, err
	}
	return entBOMItemToBiz(row), nil
}

func (r *inventoryRepo) DeleteBOMDraftItem(ctx context.Context, id int) error {
	item, err := r.data.postgres.BOMItem.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrBOMItemNotFound
		}
		return err
	}
	header, err := r.data.postgres.BOMHeader.Get(ctx, item.BomHeaderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrBOMHeaderNotFound
		}
		return err
	}
	if header.Status != biz.BOMStatusDraft {
		return biz.ErrBOMActiveImmutable
	}
	if err := r.data.postgres.BOMItem.DeleteOneID(id).Exec(ctx); err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrBOMItemNotFound
		}
		return err
	}
	return nil
}

func (r *inventoryRepo) ListBOMHeaders(ctx context.Context, filter biz.BOMHeaderFilter) ([]*biz.BOMHeader, int, error) {
	query := r.data.postgres.BOMHeader.Query()
	if filter.ProductID > 0 {
		query = query.Where(bomheader.ProductID(filter.ProductID))
	}
	if filter.Status != "" {
		query = query.Where(bomheader.Status(filter.Status))
	}
	if filter.Keyword != "" {
		query = query.Where(bomheader.VersionContainsFold(filter.Keyword))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.
		Order(ent.Desc(bomheader.FieldUpdatedAt), ent.Desc(bomheader.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	headerIDs := make([]int, 0, len(rows))
	for _, row := range rows {
		headerIDs = append(headerIDs, row.ID)
	}
	itemCounts := make(map[int]int, len(headerIDs))
	if len(headerIDs) > 0 {
		var groupedCounts []struct {
			BOMHeaderID int `json:"bom_header_id"`
			Count       int `json:"count"`
		}
		if err := r.data.postgres.BOMItem.Query().
			Where(bomitem.BomHeaderIDIn(headerIDs...)).
			GroupBy(bomitem.FieldBomHeaderID).
			Aggregate(ent.Count()).
			Scan(ctx, &groupedCounts); err != nil {
			return nil, 0, err
		}
		for _, grouped := range groupedCounts {
			itemCounts[grouped.BOMHeaderID] = grouped.Count
		}
	}
	out := make([]*biz.BOMHeader, 0, len(rows))
	for _, row := range rows {
		item := entBOMHeaderToBiz(row)
		itemCount := itemCounts[row.ID]
		item.ItemCount = &itemCount
		out = append(out, item)
	}
	return out, total, nil
}

func (r *inventoryRepo) GetBOMHeader(ctx context.Context, id int) (*biz.BOMHeader, error) {
	row, err := r.data.postgres.BOMHeader.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBOMHeaderNotFound
		}
		return nil, err
	}
	return entBOMHeaderToBiz(row), nil
}

func (r *inventoryRepo) ListBOMItemsByHeader(ctx context.Context, bomHeaderID int) ([]*biz.BOMItem, error) {
	rows, err := r.data.postgres.BOMItem.Query().
		Where(bomitem.BomHeaderID(bomHeaderID)).
		Order(ent.Asc(bomitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]*biz.BOMItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, entBOMItemToBiz(row))
	}
	return out, nil
}

func (r *inventoryRepo) ListBOMItemsByProduct(ctx context.Context, productID int) ([]*biz.BOMItem, error) {
	header, err := r.GetActiveBOMByProduct(ctx, productID)
	if err != nil {
		return nil, err
	}
	rows, err := r.data.postgres.BOMItem.Query().
		Where(bomitem.BomHeaderID(header.ID)).
		Order(ent.Asc(bomitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]*biz.BOMItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, entBOMItemToBiz(row))
	}
	return out, nil
}

func (r *inventoryRepo) GetActiveBOMByProduct(ctx context.Context, productID int) (*biz.BOMHeader, error) {
	row, err := r.data.postgres.BOMHeader.Query().
		Where(
			bomheader.ProductID(productID),
			bomheader.Status(biz.BOMStatusActive),
		).
		Order(ent.Desc(bomheader.FieldID)).
		First(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBOMHeaderNotFound
		}
		return nil, err
	}
	return entBOMHeaderToBiz(row), nil
}

func (r *inventoryRepo) CopyBOMVersion(ctx context.Context, sourceHeaderID int, in *biz.BOMHeaderCreate) (*biz.BOMVersionDetail, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

	source, err := tx.BOMHeader.Get(ctx, sourceHeaderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBOMHeaderNotFound
		}
		return nil, err
	}
	if !biz.IsKnownBOMStatus(source.Status) {
		return nil, biz.ErrBadParam
	}
	if in == nil || !biz.IsCreatableBOMStatus(in.Status) {
		return nil, biz.ErrBadParam
	}
	if in.ProductID != source.ProductID {
		return nil, biz.ErrBadParam
	}
	sourceOrderNo := source.SourceOrderNo
	if in.SourceOrderNo != nil {
		sourceOrderNo = in.SourceOrderNo
	}
	quantityText := source.QuantityText
	if in.QuantityText != nil {
		quantityText = in.QuantityText
	}
	spareText := source.SpareText
	if in.SpareText != nil {
		spareText = in.SpareText
	}
	printDate := source.PrintDate
	if in.PrintDate != nil {
		printDate = in.PrintDate
	}
	designer := source.Designer
	if in.Designer != nil {
		designer = in.Designer
	}
	maker := source.Maker
	if in.Maker != nil {
		maker = in.Maker
	}
	auditor := source.Auditor
	if in.Auditor != nil {
		auditor = in.Auditor
	}
	hairDirection := source.HairDirection
	if in.HairDirection != nil {
		hairDirection = in.HairDirection
	}
	sourceItems, err := tx.BOMItem.Query().
		Where(bomitem.BomHeaderID(sourceHeaderID)).
		Order(ent.Asc(bomitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	target, err := tx.BOMHeader.Create().
		SetProductID(source.ProductID).
		SetVersion(in.Version).
		SetStatus(biz.BOMStatusDraft).
		SetNillableEffectiveFrom(in.EffectiveFrom).
		SetNillableEffectiveTo(in.EffectiveTo).
		SetNillableSourceOrderNo(sourceOrderNo).
		SetNillableQuantityText(quantityText).
		SetNillableSpareText(spareText).
		SetNillablePrintDate(printDate).
		SetNillableDesigner(designer).
		SetNillableMaker(maker).
		SetNillableAuditor(auditor).
		SetNillableHairDirection(hairDirection).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	copiedItems := make([]*biz.BOMItem, 0, len(sourceItems))
	for _, sourceItem := range sourceItems {
		item, err := tx.BOMItem.Create().
			SetBomHeaderID(target.ID).
			SetMaterialID(sourceItem.MaterialID).
			SetQuantity(sourceItem.Quantity).
			SetUnitID(sourceItem.UnitID).
			SetLossRate(sourceItem.LossRate).
			SetNillablePosition(sourceItem.Position).
			SetNillablePieceCount(sourceItem.PieceCount).
			SetNillableTotalUsageSnapshot(sourceItem.TotalUsageSnapshot).
			SetNillableProcessBase(sourceItem.ProcessBase).
			SetNillableProcessMethod(sourceItem.ProcessMethod).
			SetNillableProductionOperationCode(sourceItem.ProductionOperationCode).
			SetNillableNote(sourceItem.Note).
			Save(ctx)
		if err != nil {
			return nil, err
		}
		copiedItems = append(copiedItems, entBOMItemToBiz(item))
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return &biz.BOMVersionDetail{Header: entBOMHeaderToBiz(target), Items: copiedItems}, nil
}

func (r *inventoryRepo) ActivateBOMVersion(ctx context.Context, id int) (*biz.BOMVersionDetail, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)

	target, err := tx.BOMHeader.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBOMHeaderNotFound
		}
		return nil, err
	}
	if target.Status != biz.BOMStatusActive && !biz.CanTransitionBOMStatus(target.Status, biz.BOMStatusActive) {
		return nil, biz.ErrBadParam
	}
	items, err := tx.BOMItem.Query().
		Where(bomitem.BomHeaderID(id)).
		Order(ent.Asc(bomitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, biz.ErrBadParam
	}
	if target.Status != biz.BOMStatusActive {
		if _, err := tx.BOMHeader.Update().
			Where(
				bomheader.ProductID(target.ProductID),
				bomheader.Status(biz.BOMStatusActive),
				bomheader.IDNEQ(id),
			).
			SetStatus(biz.BOMStatusArchived).
			Save(ctx); err != nil {
			return nil, err
		}
		target, err = tx.BOMHeader.UpdateOneID(id).
			SetStatus(biz.BOMStatusActive).
			Save(ctx)
		if err != nil {
			if ent.IsConstraintError(err) {
				return nil, biz.ErrBOMActiveConflict
			}
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		if ent.IsConstraintError(err) {
			return nil, biz.ErrBOMActiveConflict
		}
		return nil, err
	}
	tx = nil
	outItems := make([]*biz.BOMItem, 0, len(items))
	for _, item := range items {
		outItems = append(outItems, entBOMItemToBiz(item))
	}
	return &biz.BOMVersionDetail{Header: entBOMHeaderToBiz(target), Items: outItems}, nil
}

func (r *inventoryRepo) ArchiveBOMVersion(ctx context.Context, id int) (*biz.BOMHeader, error) {
	row, err := r.data.postgres.BOMHeader.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBOMHeaderNotFound
		}
		return nil, err
	}
	if row.Status == biz.BOMStatusArchived {
		return entBOMHeaderToBiz(row), nil
	}
	if !biz.CanTransitionBOMStatus(row.Status, biz.BOMStatusArchived) {
		return nil, biz.ErrBadParam
	}
	row, err = r.data.postgres.BOMHeader.UpdateOneID(id).
		SetStatus(biz.BOMStatusArchived).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entBOMHeaderToBiz(row), nil
}

func inventorySQLPlaceholders(sqlDialect string, count int) []string {
	out := make([]string, count)
	for i := 0; i < count; i++ {
		if sqlDialect == dialect.Postgres {
			out[i] = fmt.Sprintf("$%d", i+1)
		} else {
			out[i] = "?"
		}
	}
	return out
}

func rollbackInventoryDBTx(ctx context.Context, tx *inventoryDBTx, logger *log.Helper) {
	if tx == nil || tx.sqlTx == nil {
		return
	}
	if err := tx.sqlTx.Rollback(); err != nil && logger != nil && !errors.Is(err, stdsql.ErrTxDone) {
		logger.WithContext(ctx).Warnf("rollback inventory sql tx failed err=%v", err)
	}
}

func sameOptionalInt(a, b *int) bool {
	switch {
	case a == nil && b == nil:
		return true
	case a == nil || b == nil:
		return false
	default:
		return *a == *b
	}
}

func sameOptionalString(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func sameOptionalDecimal(a, b *decimal.Decimal) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return a.Equal(*b)
}

func sameOptionalTime(a, b *time.Time) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return a.Equal(*b)
}

func sameIdempotencyIntentTime(rowSpecified bool, rowTime time.Time, inputSpecified bool, inputTime time.Time) bool {
	if rowSpecified != inputSpecified {
		return false
	}
	return !rowSpecified || rowTime.Equal(inputTime)
}

func entInventoryLotToBiz(row *ent.InventoryLot) *biz.InventoryLot {
	if row == nil {
		return nil
	}
	return &biz.InventoryLot{
		ID:              row.ID,
		SubjectType:     row.SubjectType,
		SubjectID:       row.SubjectID,
		ProductSkuID:    row.ProductSkuID,
		LotNo:           row.LotNo,
		SupplierLotNo:   row.SupplierLotNo,
		ColorNo:         row.ColorNo,
		DyeLotNo:        row.DyeLotNo,
		ProductionLotNo: row.ProductionLotNo,
		Status:          row.Status,
		ReceivedAt:      row.ReceivedAt,
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
	}
}

func entInventoryTxnToBiz(row *ent.InventoryTxn) *biz.InventoryTxn {
	if row == nil {
		return nil
	}
	return &biz.InventoryTxn{
		ID:              row.ID,
		SubjectType:     row.SubjectType,
		SubjectID:       row.SubjectID,
		ProductSkuID:    row.ProductSkuID,
		WarehouseID:     row.WarehouseID,
		LotID:           row.LotID,
		TxnType:         row.TxnType,
		Direction:       row.Direction,
		Quantity:        row.Quantity,
		UnitID:          row.UnitID,
		SourceType:      row.SourceType,
		SourceID:        row.SourceID,
		SourceLineID:    row.SourceLineID,
		IdempotencyKey:  row.IdempotencyKey,
		ReversalOfTxnID: row.ReversalOfTxnID,
		OccurredAt:      row.OccurredAt,
		CreatedAt:       row.CreatedAt,
		CreatedBy:       row.CreatedBy,
		Note:            row.Note,
	}
}

func entInventoryBalanceToBiz(row *ent.InventoryBalance) *biz.InventoryBalance {
	if row == nil {
		return nil
	}
	return &biz.InventoryBalance{
		ID:           row.ID,
		SubjectType:  row.SubjectType,
		SubjectID:    row.SubjectID,
		ProductSkuID: row.ProductSkuID,
		WarehouseID:  row.WarehouseID,
		LotID:        row.LotID,
		UnitID:       row.UnitID,
		Quantity:     row.Quantity,
		UpdatedAt:    row.UpdatedAt,
	}
}

func entBOMHeaderToBiz(row *ent.BOMHeader) *biz.BOMHeader {
	if row == nil {
		return nil
	}
	return &biz.BOMHeader{
		ID:            row.ID,
		ProductID:     row.ProductID,
		Version:       row.Version,
		Status:        row.Status,
		EffectiveFrom: row.EffectiveFrom,
		EffectiveTo:   row.EffectiveTo,
		SourceOrderNo: row.SourceOrderNo,
		QuantityText:  row.QuantityText,
		SpareText:     row.SpareText,
		PrintDate:     row.PrintDate,
		Designer:      row.Designer,
		Maker:         row.Maker,
		Auditor:       row.Auditor,
		HairDirection: row.HairDirection,
		Note:          row.Note,
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
		EditVersion:   bomEditVersion(row.UpdatedAt),
	}
}

func bomEditVersion(updatedAt time.Time) int64 {
	version := updatedAt.UnixMicro()
	if version <= 0 {
		return 1
	}
	return version
}

func entBOMItemToBiz(row *ent.BOMItem) *biz.BOMItem {
	if row == nil {
		return nil
	}
	return &biz.BOMItem{
		ID:                      row.ID,
		BOMHeaderID:             row.BomHeaderID,
		MaterialID:              row.MaterialID,
		Quantity:                row.Quantity,
		UnitID:                  row.UnitID,
		LossRate:                row.LossRate,
		Position:                row.Position,
		PieceCount:              row.PieceCount,
		TotalUsageSnapshot:      row.TotalUsageSnapshot,
		ProcessBase:             row.ProcessBase,
		ProcessMethod:           row.ProcessMethod,
		ProductionOperationCode: row.ProductionOperationCode,
		Note:                    row.Note,
		CreatedAt:               row.CreatedAt,
		UpdatedAt:               row.UpdatedAt,
	}
}
