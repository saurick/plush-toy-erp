package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/customer"
	"server/internal/data/model/ent/inventorylot"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/supplier"
	"server/internal/data/model/ent/unit"
	"server/internal/data/model/ent/warehouse"

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
var _ biz.ShipmentProcessCommandRepo = (*operationalFactRepo)(nil)
var _ biz.FinanceReceivableLeadProcessCommandRepo = (*operationalFactRepo)(nil)
var _ biz.OperationalFactCancellationActorRepo = (*operationalFactRepo)(nil)
var _ biz.ProductionCompletionSourceRepo = (*operationalFactRepo)(nil)
var _ biz.ProductionMaterialIssueFromOrderRepo = (*operationalFactRepo)(nil)
var _ biz.ProductionReworkFromCompletionRepo = (*operationalFactRepo)(nil)
var _ biz.FinanceFactFromShipmentRepo = (*operationalFactRepo)(nil)
var _ biz.OutsourcingFactFromOrderRepo = (*operationalFactRepo)(nil)

func (r *operationalFactRepo) CustomerIsActive(ctx context.Context, id int) (bool, error) {
	row, err := r.data.postgres.Customer.Query().
		Where(customer.ID(id)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrCustomerNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (r *operationalFactRepo) MaterialIsActive(ctx context.Context, id int) (bool, error) {
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

func (r *operationalFactRepo) ProductIsActive(ctx context.Context, id int) (bool, error) {
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

func (r *operationalFactRepo) ProductSKUIsActive(ctx context.Context, id int) (bool, error) {
	row, err := r.data.postgres.ProductSKU.Query().
		Where(productsku.ID(id)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrProductSKUNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (r *operationalFactRepo) SupplierIsActive(ctx context.Context, id int) (bool, error) {
	row, err := r.data.postgres.Supplier.Query().
		Where(supplier.ID(id)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrSupplierNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (r *operationalFactRepo) UnitIsActive(ctx context.Context, id int) (bool, error) {
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

func (r *operationalFactRepo) WarehouseIsActive(ctx context.Context, id int) (bool, error) {
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

func validateOperationalFactSKUAndLot(ctx context.Context, client *ent.Client, subjectType string, subjectID int, productSkuID, lotID *int) error {
	if err := validateInventorySubjectSKU(ctx, client, subjectType, subjectID, productSkuID); err != nil {
		return err
	}
	if lotID == nil {
		return nil
	}
	lot, err := client.InventoryLot.Get(ctx, *lotID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrInventoryLotNotFound
		}
		return err
	}
	if lot.SubjectType != subjectType || lot.SubjectID != subjectID || !sameOptionalInt(lot.ProductSkuID, productSkuID) {
		return biz.ErrBadParam
	}
	return nil
}

// resolveOrCreateSourceInboundLot owns the only user-entered batch attribute
// of a source-driven inbound command. The subject and optional SKU come from
// the locked source document, so a caller cannot create a batch for another
// product/material. Existing exact batches are reused; a new batch is created
// in the same transaction as the draft fact.
func resolveOrCreateSourceInboundLot(ctx context.Context, tx *inventoryDBTx, in *biz.OperationalFactMutation) error {
	if tx == nil || tx.client == nil || in == nil {
		return biz.ErrBadParam
	}
	if in.NewLotNo == nil {
		return nil
	}
	if in.LotID != nil || strings.TrimSpace(*in.NewLotNo) == "" {
		return biz.ErrBadParam
	}
	if in.FactType != biz.ProductionFactFinishedGoodsReceipt && in.FactType != biz.OutsourcingFactReturnReceipt {
		return biz.ErrBadParam
	}

	switch in.SubjectType {
	case biz.InventorySubjectProduct:
		if err := lockOperationalFactRow(ctx, tx, "products", in.SubjectID, biz.ErrProductNotFound); err != nil {
			return err
		}
	case biz.InventorySubjectMaterial:
		if err := lockOperationalFactRow(ctx, tx, "materials", in.SubjectID, biz.ErrMaterialNotFound); err != nil {
			return err
		}
	default:
		return biz.ErrBadParam
	}

	lotNo := strings.TrimSpace(*in.NewLotNo)
	lot, err := tx.client.InventoryLot.Query().Where(
		inventorylot.SubjectType(in.SubjectType),
		inventorylot.SubjectID(in.SubjectID),
		inventorylot.LotNo(lotNo),
	).Only(ctx)
	if err != nil && !ent.IsNotFound(err) {
		return err
	}
	if ent.IsNotFound(err) {
		builder := tx.client.InventoryLot.Create().
			SetSubjectType(in.SubjectType).
			SetSubjectID(in.SubjectID).
			SetNillableProductSkuID(in.ProductSkuID).
			SetLotNo(lotNo).
			SetStatus(biz.InventoryLotActive).
			SetReceivedAt(in.OccurredAt)
		if in.FactType == biz.ProductionFactFinishedGoodsReceipt {
			builder.SetProductionLotNo(lotNo)
		} else {
			builder.SetSupplierLotNo(lotNo)
		}
		lot, err = builder.Save(ctx)
		if err != nil {
			return err
		}
	}
	if lot.SubjectType != in.SubjectType || lot.SubjectID != in.SubjectID || !sameOptionalInt(lot.ProductSkuID, in.ProductSkuID) {
		return biz.ErrBadParam
	}
	if lot.Status != biz.InventoryLotActive {
		return biz.ErrInventoryLotStatusBlocked
	}
	lotID := lot.ID
	in.LotID = &lotID
	return nil
}

type operationalFactInventoryArgs struct {
	sourceType   string
	sourceID     int
	sourceLineID int
	subjectType  string
	subjectID    int
	productSkuID *int
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
			ProductSkuID:    original.ProductSkuID,
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
		ProductSkuID:   in.productSkuID,
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
