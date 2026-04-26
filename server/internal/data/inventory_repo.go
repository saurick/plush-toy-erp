package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomheader"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/predicate"

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

func (r *inventoryRepo) CreateInventoryLot(ctx context.Context, in *biz.InventoryLotCreate) (*biz.InventoryLot, error) {
	if err := validateInventoryLotSubject(ctx, r.data.postgres, in.SubjectType, in.SubjectID); err != nil {
		return nil, err
	}
	row, err := r.data.postgres.InventoryLot.Create().
		SetSubjectType(in.SubjectType).
		SetSubjectID(in.SubjectID).
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
	if !biz.IsInventoryLotStatusTransitionAllowed(lot.Status, newStatus, hasBalance) {
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
		affected, err := updateInventoryBalanceDelta(ctx, tx, key, delta, true)
		if err != nil {
			return nil, err
		}
		if affected == 0 {
			return nil, biz.ErrInventoryInsufficientStock
		}
	}
	return getInventoryBalance(ctx, tx.client.InventoryBalance.Query(), key)
}

func inventoryBalanceKeyFromTxn(in *biz.InventoryTxnCreate) biz.InventoryBalanceKey {
	return biz.InventoryBalanceKey{
		SubjectType: in.SubjectType,
		SubjectID:   in.SubjectID,
		WarehouseID: in.WarehouseID,
		LotID:       in.LotID,
		UnitID:      in.UnitID,
	}
}

func inventoryBalanceKeyFromEntTxn(row *ent.InventoryTxn) biz.InventoryBalanceKey {
	if row == nil {
		return biz.InventoryBalanceKey{}
	}
	return biz.InventoryBalanceKey{
		SubjectType: row.SubjectType,
		SubjectID:   row.SubjectID,
		WarehouseID: row.WarehouseID,
		LotID:       row.LotID,
		UnitID:      row.UnitID,
	}
}

func getInventoryBalance(ctx context.Context, query *ent.InventoryBalanceQuery, key biz.InventoryBalanceKey) (*ent.InventoryBalance, error) {
	predicates := []predicate.InventoryBalance{
		inventorybalance.SubjectType(key.SubjectType),
		inventorybalance.SubjectID(key.SubjectID),
		inventorybalance.WarehouseID(key.WarehouseID),
		inventorybalance.UnitID(key.UnitID),
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
	return validateInventoryLotSubject(ctx, client, in.SubjectType, in.SubjectID)
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
	if lot.SubjectType != in.SubjectType || lot.SubjectID != in.SubjectID {
		return biz.ErrBadParam
	}
	if err := validateInventoryLotStatusForTxn(lot.Status, in); err != nil {
		return err
	}
	return nil
}

func validateInventoryLotStatusForTxn(status string, in *biz.InventoryTxnCreate) error {
	if in.TxnType == biz.InventoryTxnReversal || in.Direction >= 0 {
		return nil
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
	if key.LotID == nil {
		p := inventorySQLPlaceholders(tx.dialect, 6)
		query = fmt.Sprintf(
			`INSERT INTO inventory_balances (subject_type, subject_id, warehouse_id, lot_id, unit_id, quantity, updated_at)
VALUES (%s, %s, %s, NULL, %s, %s, %s)
ON CONFLICT (subject_type, subject_id, warehouse_id, unit_id) WHERE lot_id IS NULL
DO UPDATE SET quantity = inventory_balances.quantity + EXCLUDED.quantity, updated_at = EXCLUDED.updated_at`,
			p[0], p[1], p[2], p[3], p[4], p[5],
		)
		args = []any{key.SubjectType, key.SubjectID, key.WarehouseID, key.UnitID, delta, now}
	} else {
		p := inventorySQLPlaceholders(tx.dialect, 7)
		query = fmt.Sprintf(
			`INSERT INTO inventory_balances (subject_type, subject_id, warehouse_id, lot_id, unit_id, quantity, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (subject_type, subject_id, warehouse_id, unit_id, lot_id) WHERE lot_id IS NOT NULL
DO UPDATE SET quantity = inventory_balances.quantity + EXCLUDED.quantity, updated_at = EXCLUDED.updated_at`,
			p[0], p[1], p[2], p[3], p[4], p[5], p[6],
		)
		args = []any{key.SubjectType, key.SubjectID, key.WarehouseID, *key.LotID, key.UnitID, delta, now}
	}
	_, err := tx.sqlTx.ExecContext(ctx, query, args...)
	return err
}

func updateInventoryBalanceDelta(ctx context.Context, tx *inventoryDBTx, key biz.InventoryBalanceKey, delta decimal.Decimal, preventNegative bool) (int64, error) {
	now := time.Now()
	p := inventorySQLPlaceholders(tx.dialect, 8)
	query := fmt.Sprintf(
		`UPDATE inventory_balances
SET quantity = quantity + %s, updated_at = %s
WHERE subject_type = %s AND subject_id = %s AND warehouse_id = %s AND unit_id = %s`,
		p[0], p[1], p[2], p[3], p[4], p[5],
	)
	args := []any{delta, now, key.SubjectType, key.SubjectID, key.WarehouseID, key.UnitID}
	if key.LotID == nil {
		query += " AND lot_id IS NULL"
	} else {
		query += fmt.Sprintf(" AND lot_id = %s", p[6])
		args = append(args, *key.LotID)
	}
	if preventNegative {
		query += fmt.Sprintf(" AND quantity + %s >= 0", p[7])
		args = append(args, delta)
	}
	result, err := tx.sqlTx.ExecContext(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (r *inventoryRepo) CreateBOMHeader(ctx context.Context, in *biz.BOMHeaderCreate) (*biz.BOMHeader, error) {
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
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entBOMHeaderToBiz(row), nil
}

func (r *inventoryRepo) CreateBOMItem(ctx context.Context, in *biz.BOMItemCreate) (*biz.BOMItem, error) {
	if _, err := r.data.postgres.BOMHeader.Get(ctx, in.BOMHeaderID); err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrBOMHeaderNotFound
		}
		return nil, err
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
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entBOMItemToBiz(row), nil
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

func entInventoryLotToBiz(row *ent.InventoryLot) *biz.InventoryLot {
	if row == nil {
		return nil
	}
	return &biz.InventoryLot{
		ID:              row.ID,
		SubjectType:     row.SubjectType,
		SubjectID:       row.SubjectID,
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
		ID:          row.ID,
		SubjectType: row.SubjectType,
		SubjectID:   row.SubjectID,
		WarehouseID: row.WarehouseID,
		LotID:       row.LotID,
		UnitID:      row.UnitID,
		Quantity:    row.Quantity,
		UpdatedAt:   row.UpdatedAt,
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
		Note:          row.Note,
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	}
}

func entBOMItemToBiz(row *ent.BOMItem) *biz.BOMItem {
	if row == nil {
		return nil
	}
	return &biz.BOMItem{
		ID:          row.ID,
		BOMHeaderID: row.BomHeaderID,
		MaterialID:  row.MaterialID,
		Quantity:    row.Quantity,
		UnitID:      row.UnitID,
		LossRate:    row.LossRate,
		Position:    row.Position,
		Note:        row.Note,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
	}
}
