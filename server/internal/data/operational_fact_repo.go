package data

import (
	"context"
	stdsql "database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/core/calc"
	corestatus "server/internal/core/status"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/customer"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/inventorylot"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/shipmentitem"
	"server/internal/data/model/ent/stockreservation"
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

func (r *operationalFactRepo) ResolveProductionCompletionSource(ctx context.Context, productionOrderID, productionOrderItemID int) (*biz.ProductionOrderItem, error) {
	if productionOrderID <= 0 || productionOrderItemID <= 0 {
		return nil, biz.ErrBadParam
	}
	if _, err := r.data.postgres.ProductionOrder.Get(ctx, productionOrderID); err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderNotFound
		}
		return nil, err
	}
	item, err := r.data.postgres.ProductionOrderItem.Get(ctx, productionOrderItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderFactSourceInvalid
		}
		return nil, err
	}
	if item.ProductionOrderID != productionOrderID {
		return nil, biz.ErrProductionOrderFactSourceInvalid
	}
	return entProductionOrderItemToBiz(item), nil
}

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

func findProductionFactReplay(ctx context.Context, client *ent.Client, in *biz.OperationalFactMutation) (*biz.ProductionFact, bool, error) {
	row, err := client.ProductionFact.Query().Where(productionfact.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	comparison := *in
	if in.NewLotNo != nil {
		if row.LotID == nil {
			return nil, true, biz.ErrIdempotencyConflict
		}
		lot, lotErr := client.InventoryLot.Get(ctx, *row.LotID)
		if lotErr != nil {
			return nil, true, lotErr
		}
		if lot.LotNo != *in.NewLotNo || lot.SubjectType != in.SubjectType || lot.SubjectID != in.SubjectID || !sameOptionalInt(lot.ProductSkuID, in.ProductSkuID) {
			return nil, true, biz.ErrIdempotencyConflict
		}
		comparison.LotID = row.LotID
	}
	if !operationalFactMutationMatchesProduction(row, &comparison) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entProductionFactToBiz(row), true, nil
}

func operationalFactMutationMatchesProduction(row *ent.ProductionFact, in *biz.OperationalFactMutation) bool {
	if row == nil || in == nil {
		return false
	}
	return row.FactNo == in.FactNo &&
		row.FactType == in.FactType &&
		row.SubjectType == in.SubjectType &&
		row.SubjectID == in.SubjectID &&
		sameOptionalInt(row.ProductSkuID, in.ProductSkuID) &&
		row.WarehouseID == in.WarehouseID &&
		row.UnitID == in.UnitID &&
		sameOptionalInt(row.LotID, in.LotID) &&
		row.Quantity.Cmp(in.Quantity) == 0 &&
		sameOptionalString(row.SourceType, in.SourceType) &&
		sameOptionalInt(row.SourceID, in.SourceID) &&
		sameOptionalInt(row.SourceLineID, in.SourceLineID) &&
		sameIdempotencyIntentTime(row.OccurredAtSpecified, row.OccurredAt, in.OccurredAtSpecified, in.OccurredAt) &&
		sameOptionalString(row.Note, in.Note)
}

func findOutsourcingFactReplay(ctx context.Context, client *ent.Client, in *biz.OperationalFactMutation) (*biz.OutsourcingFact, bool, error) {
	row, err := client.OutsourcingFact.Query().Where(outsourcingfact.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if !operationalFactMutationMatchesOutsourcing(row, in) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entOutsourcingFactToBiz(row), true, nil
}

func operationalFactMutationMatchesOutsourcing(row *ent.OutsourcingFact, in *biz.OperationalFactMutation) bool {
	if row == nil || in == nil {
		return false
	}
	return row.FactNo == in.FactNo &&
		row.FactType == in.FactType &&
		row.SubjectType == in.SubjectType &&
		row.SubjectID == in.SubjectID &&
		sameOptionalInt(row.ProductSkuID, in.ProductSkuID) &&
		row.WarehouseID == in.WarehouseID &&
		row.UnitID == in.UnitID &&
		sameOptionalInt(row.LotID, in.LotID) &&
		row.Quantity.Cmp(in.Quantity) == 0 &&
		sameOptionalInt(row.SupplierID, in.SupplierID) &&
		sameOptionalString(row.SupplierName, in.SupplierName) &&
		sameOptionalString(row.SourceType, in.SourceType) &&
		sameOptionalInt(row.SourceID, in.SourceID) &&
		sameOptionalInt(row.SourceLineID, in.SourceLineID) &&
		sameIdempotencyIntentTime(row.OccurredAtSpecified, row.OccurredAt, in.OccurredAtSpecified, in.OccurredAt) &&
		sameOptionalString(row.Note, in.Note)
}

func findOutsourcingFactFromOrderIntent(ctx context.Context, client *ent.Client, factType string, in *biz.OutsourcingFactFromOrderCreate) (*ent.OutsourcingFact, bool, error) {
	if client == nil || in == nil {
		return nil, false, biz.ErrBadParam
	}
	row, err := client.OutsourcingFact.Query().Where(outsourcingfact.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if in.NewLotNo != nil {
		if row.LotID == nil {
			return nil, true, biz.ErrIdempotencyConflict
		}
		lot, lotErr := client.InventoryLot.Get(ctx, *row.LotID)
		if lotErr != nil {
			return nil, true, lotErr
		}
		if lot.LotNo != *in.NewLotNo {
			return nil, true, biz.ErrIdempotencyConflict
		}
	}
	if row.FactNo != in.FactNo ||
		row.FactType != factType ||
		row.SourceType == nil || *row.SourceType != biz.OutsourcingOrderSourceType ||
		row.SourceID == nil || *row.SourceID != in.OutsourcingOrderID ||
		row.SourceLineID == nil || *row.SourceLineID != in.OutsourcingOrderItemID ||
		row.WarehouseID != in.WarehouseID ||
		(in.NewLotNo == nil && !sameOptionalInt(row.LotID, in.LotID)) ||
		row.Quantity.Cmp(in.Quantity) != 0 ||
		!sameIdempotencyIntentTime(row.OccurredAtSpecified, row.OccurredAt, in.OccurredAtSpecified, in.OccurredAt) ||
		!sameOptionalString(row.Note, in.Note) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return row, true, nil
}

func findFinanceFactReplay(ctx context.Context, client *ent.Client, in *biz.FinanceFactCreate) (*biz.FinanceFact, bool, error) {
	row, err := client.FinanceFact.Query().Where(financefact.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if !financeFactMatchesCreate(row, in) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entFinanceFactToBiz(row), true, nil
}

func findActiveFinanceFactBySource(ctx context.Context, client *ent.Client, in *biz.FinanceFactCreate) (*biz.FinanceFact, bool, error) {
	if in == nil || in.SourceType == nil || in.SourceID == nil {
		return nil, false, nil
	}
	row, err := client.FinanceFact.Query().Where(
		financefact.FactType(in.FactType),
		financefact.SourceType(*in.SourceType),
		financefact.SourceID(*in.SourceID),
		financefact.StatusNEQ(biz.OperationalFactStatusCancelled),
	).First(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return entFinanceFactToBiz(row), true, nil
}

func findFinanceFactFromShipmentReplay(
	ctx context.Context,
	client *ent.Client,
	factType string,
	in *biz.FinanceFactFromShipmentCreate,
) (*biz.FinanceFact, bool, error) {
	row, err := client.FinanceFact.Query().Where(financefact.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if row.FactNo != in.FactNo || row.FactType != factType ||
		row.CounterpartyType != biz.FinanceCounterpartyCustomer || row.CounterpartyID == nil ||
		!row.Amount.GreaterThan(decimal.Zero) || !row.FeeAmount.IsZero() || row.Currency != biz.FinanceCurrencyCNY ||
		row.SourceType == nil || *row.SourceType != biz.ShipmentSourceType || row.SourceID == nil || *row.SourceID != in.ShipmentID || row.SourceLineID != nil ||
		!sameOptionalString(row.InvoiceCategory, in.InvoiceCategory) ||
		!sameIdempotencyIntentTime(row.OccurredAtSpecified, row.OccurredAt, in.OccurredAtSpecified, in.OccurredAt) ||
		!sameOptionalString(row.Note, in.Note) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entFinanceFactToBiz(row), true, nil
}

func financeFactMatchesCreate(row *ent.FinanceFact, in *biz.FinanceFactCreate) bool {
	if row == nil || in == nil {
		return false
	}
	return row.FactNo == in.FactNo &&
		row.FactType == in.FactType &&
		row.CounterpartyType == in.CounterpartyType &&
		sameOptionalInt(row.CounterpartyID, in.CounterpartyID) &&
		row.Amount.Cmp(in.Amount) == 0 &&
		row.FeeAmount.Cmp(in.FeeAmount) == 0 &&
		row.Currency == in.Currency &&
		sameOptionalString(row.CollectionType, in.CollectionType) &&
		sameOptionalString(row.PaymentTerm, in.PaymentTerm) &&
		sameOptionalInt(row.PaymentTermDays, in.PaymentTermDays) &&
		sameOptionalString(row.InvoiceCategory, in.InvoiceCategory) &&
		sameOptionalString(row.SourceType, in.SourceType) &&
		sameOptionalInt(row.SourceID, in.SourceID) &&
		sameOptionalInt(row.SourceLineID, in.SourceLineID) &&
		sameIdempotencyIntentTime(row.OccurredAtSpecified, row.OccurredAt, in.OccurredAtSpecified, in.OccurredAt) &&
		sameOptionalString(row.Note, in.Note)
}

func financeFactCanRecoverAppliedProcessResult(status string) bool {
	switch status {
	case biz.OperationalFactStatusDraft, biz.OperationalFactStatusPosted, biz.OperationalFactStatusSettled:
		return true
	default:
		return false
	}
}

func (r *operationalFactRepo) CreateProductionFactDraft(ctx context.Context, in *biz.OperationalFactMutation) (*biz.ProductionFact, error) {
	if replay, found, err := findProductionFactReplay(ctx, r.data.postgres, in); err != nil || found {
		return replay, err
	}
	if isProductionOrderLinkedFact(in) {
		return r.createProductionOrderLinkedFactDraft(ctx, in)
	}
	if err := validateOperationalFactSKUAndLot(ctx, r.data.postgres, in.SubjectType, in.SubjectID, in.ProductSkuID, in.LotID); err != nil {
		return nil, err
	}
	row, err := createProductionFactDraftWithClient(ctx, r.data.postgres, in)
	if err != nil && ent.IsConstraintError(err) {
		if replay, found, replayErr := findProductionFactReplay(ctx, r.data.postgres, in); replayErr != nil || found {
			return replay, replayErr
		}
	}
	return row, err
}

func (r *operationalFactRepo) CreateProductionMaterialIssueFromOrder(
	ctx context.Context,
	in *biz.ProductionMaterialIssueFromOrderCreate,
) (*biz.ProductionFact, error) {
	if in == nil {
		return nil, biz.ErrBadParam
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "production_orders", in.ProductionOrderID, biz.ErrProductionOrderNotFound); err != nil {
		return nil, err
	}
	orderRow, err := tx.client.ProductionOrder.Get(ctx, in.ProductionOrderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderNotFound
		}
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_items", in.ProductionOrderItemID, biz.ErrProductionOrderFactSourceInvalid); err != nil {
		return nil, err
	}
	orderItem, err := tx.client.ProductionOrderItem.Get(ctx, in.ProductionOrderItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderFactSourceInvalid
		}
		return nil, err
	}
	if orderItem.ProductionOrderID != orderRow.ID {
		return nil, biz.ErrProductionOrderFactSourceInvalid
	}
	orderItems, err := tx.client.ProductionOrderItem.Query().
		Where(productionorderitem.ProductionOrderID(orderRow.ID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	requirementRows, err := loadProductionOrderMaterialRequirements(ctx, tx.client, orderRow.ID)
	if err != nil {
		return nil, err
	}
	requirementsState, err := resolveProductionOrderMaterialRequirementsState(ctx, tx.client, orderItems, requirementRows)
	if err != nil {
		return nil, err
	}
	if requirementsState == biz.ProductionOrderMaterialRequirementsNeedsReview {
		return nil, biz.ErrProductionOrderMaterialRequirementsNeedReview
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_material_requirements", in.ProductionOrderMaterialRequirementID, biz.ErrProductionOrderMaterialRequirementNotFound); err != nil {
		return nil, err
	}
	requirement, err := tx.client.ProductionOrderMaterialRequirement.Get(ctx, in.ProductionOrderMaterialRequirementID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderMaterialRequirementNotFound
		}
		return nil, err
	}
	if requirement.ProductionOrderID != orderRow.ID || requirement.ProductionOrderItemID != orderItem.ID {
		return nil, biz.ErrProductionOrderMaterialRequirementInvalid
	}
	sourceType := biz.ProductionOrderSourceType
	sourceID := orderRow.ID
	sourceLineID := requirement.ID
	mutation := &biz.OperationalFactMutation{
		FactNo:              in.FactNo,
		FactType:            biz.ProductionFactMaterialIssue,
		SubjectType:         biz.InventorySubjectMaterial,
		SubjectID:           requirement.MaterialID,
		WarehouseID:         in.WarehouseID,
		UnitID:              requirement.UnitID,
		LotID:               in.LotID,
		Quantity:            in.Quantity,
		SourceType:          &sourceType,
		SourceID:            &sourceID,
		SourceLineID:        &sourceLineID,
		IdempotencyKey:      in.IdempotencyKey,
		OccurredAt:          in.OccurredAt,
		OccurredAtSpecified: in.OccurredAtSpecified,
		Note:                in.Note,
	}
	if replay, found, replayErr := findProductionFactReplay(ctx, tx.client, mutation); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx.sqlTx = nil
		return replay, nil
	}
	if orderRow.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrProductionOrderInvalidState
	}
	if err := validateProductionOrderMaterialRequirementReferences(ctx, tx.client, requirement); err != nil {
		return nil, err
	}
	if err := validateProductionOrderMaterialIssueQuantity(ctx, tx.client, requirement, in.Quantity); err != nil {
		return nil, err
	}
	activeWarehouse, err := tx.client.Warehouse.Query().Where(warehouse.ID(in.WarehouseID), warehouse.IsActive(true)).Exist(ctx)
	if err != nil {
		return nil, err
	}
	if !activeWarehouse {
		return nil, biz.ErrWarehouseInactive
	}
	if in.LotID != nil {
		if err := lockInventoryLot(ctx, tx, *in.LotID); err != nil {
			return nil, err
		}
	}
	inventoryIntent := &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectMaterial, SubjectID: requirement.MaterialID,
		WarehouseID: in.WarehouseID, LotID: in.LotID, UnitID: requirement.UnitID,
		TxnType: biz.InventoryTxnOut, Direction: -1, Quantity: in.Quantity,
		SourceType: biz.ProductionFactSourceType, OccurredAt: in.OccurredAt,
	}
	if err := validateInventoryTxnReferences(ctx, tx.client, inventoryIntent); err != nil {
		return nil, err
	}
	key := biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectMaterial, SubjectID: requirement.MaterialID,
		WarehouseID: in.WarehouseID, LotID: in.LotID, UnitID: requirement.UnitID,
	}
	if err := lockInventoryBalanceRow(ctx, tx, key); err != nil {
		return nil, err
	}
	balance, err := getInventoryBalance(ctx, tx.client.InventoryBalance.Query(), key)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrInventoryInsufficientStock
		}
		return nil, err
	}
	if balance.Quantity.LessThan(in.Quantity) {
		return nil, biz.ErrInventoryInsufficientStock
	}
	created, err := createProductionFactDraftWithClient(ctx, tx.client, mutation)
	if err != nil {
		if ent.IsConstraintError(err) {
			rollbackInventoryDBTx(ctx, tx, r.log)
			tx = nil
			if replay, found, replayErr := findProductionFactReplay(ctx, r.data.postgres, mutation); replayErr != nil || found {
				return replay, replayErr
			}
		}
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return created, nil
}

func (r *operationalFactRepo) CreateProductionReworkFromCompletion(
	ctx context.Context,
	in *biz.ProductionReworkFromCompletionCreate,
) (*biz.ProductionFact, error) {
	if in == nil {
		return nil, biz.ErrBadParam
	}
	if replay, found, err := findProductionReworkIntent(ctx, r.data.postgres, in); err != nil || found {
		return replay, err
	}
	sourcePreview, err := r.data.postgres.ProductionFact.Get(ctx, in.SourceCompletionFactID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionReworkSourceInvalid
		}
		return nil, err
	}
	orderID, itemID, err := productionCompletionSourceCoordinates(sourcePreview)
	if err != nil {
		return nil, err
	}

	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "production_orders", orderID, biz.ErrProductionOrderNotFound); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_items", itemID, biz.ErrProductionOrderFactSourceInvalid); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_facts", in.SourceCompletionFactID, biz.ErrProductionFactNotFound); err != nil {
		return nil, err
	}
	if replay, found, replayErr := findProductionReworkIntent(ctx, tx.client, in); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	resolved, source, err := resolveProductionReworkMutation(ctx, tx.client, in, true)
	if err != nil {
		return nil, err
	}
	if err := validateProductionReworkQuantity(ctx, tx.client, source, resolved.Quantity, 0); err != nil {
		return nil, err
	}
	row, err := createProductionFactDraftWithClient(ctx, tx.client, resolved)
	if err != nil {
		if ent.IsConstraintError(err) {
			rollbackInventoryDBTx(ctx, tx, r.log)
			tx = nil
			if replay, found, replayErr := findProductionReworkIntent(ctx, r.data.postgres, in); replayErr != nil || found {
				return replay, replayErr
			}
		}
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return row, nil
}

func findProductionReworkIntent(ctx context.Context, client *ent.Client, in *biz.ProductionReworkFromCompletionCreate) (*biz.ProductionFact, bool, error) {
	if client == nil || in == nil {
		return nil, false, biz.ErrBadParam
	}
	row, err := client.ProductionFact.Query().Where(productionfact.IdempotencyKey(in.IdempotencyKey)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if row.FactNo != in.FactNo || row.FactType != biz.ProductionFactRework ||
		row.SourceType == nil || *row.SourceType != biz.ProductionFactSourceType ||
		row.SourceID == nil || *row.SourceID != in.SourceCompletionFactID ||
		row.Quantity.Cmp(in.Quantity) != 0 ||
		!sameIdempotencyIntentTime(row.OccurredAtSpecified, row.OccurredAt, in.OccurredAtSpecified, in.OccurredAt) ||
		row.Note == nil || *row.Note != in.Reason {
		return nil, true, biz.ErrIdempotencyConflict
	}
	return entProductionFactToBiz(row), true, nil
}

func resolveProductionReworkMutation(
	ctx context.Context,
	client *ent.Client,
	in *biz.ProductionReworkFromCompletionCreate,
	requirePosted bool,
) (*biz.OperationalFactMutation, *ent.ProductionFact, error) {
	if client == nil || in == nil {
		return nil, nil, biz.ErrBadParam
	}
	source, err := client.ProductionFact.Get(ctx, in.SourceCompletionFactID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, nil, biz.ErrProductionReworkSourceInvalid
		}
		return nil, nil, err
	}
	_, itemID, err := productionCompletionSourceCoordinates(source)
	if err != nil {
		return nil, nil, err
	}
	if requirePosted && source.Status != biz.OperationalFactStatusPosted {
		return nil, nil, biz.ErrProductionReworkSourceState
	}
	if source.LotID == nil || source.SubjectType != biz.InventorySubjectProduct || source.SubjectID <= 0 || source.WarehouseID <= 0 || source.UnitID <= 0 {
		return nil, nil, biz.ErrProductionReworkSourceInvalid
	}
	sourceType := biz.ProductionFactSourceType
	sourceID := source.ID
	sourceLineID := itemID
	reason := in.Reason
	return &biz.OperationalFactMutation{
		FactNo: in.FactNo, FactType: biz.ProductionFactRework,
		SubjectType: source.SubjectType, SubjectID: source.SubjectID, ProductSkuID: source.ProductSkuID,
		WarehouseID: source.WarehouseID, UnitID: source.UnitID, LotID: source.LotID,
		Quantity: in.Quantity, SourceType: &sourceType, SourceID: &sourceID, SourceLineID: &sourceLineID,
		IdempotencyKey: in.IdempotencyKey, OccurredAt: in.OccurredAt, OccurredAtSpecified: in.OccurredAtSpecified,
		Note: &reason,
	}, source, nil
}

func productionCompletionSourceCoordinates(row *ent.ProductionFact) (int, int, error) {
	if row == nil || row.FactType != biz.ProductionFactFinishedGoodsReceipt ||
		row.SourceType == nil || *row.SourceType != biz.ProductionOrderSourceType ||
		row.SourceID == nil || *row.SourceID <= 0 || row.SourceLineID == nil || *row.SourceLineID <= 0 {
		return 0, 0, biz.ErrProductionReworkSourceInvalid
	}
	return *row.SourceID, *row.SourceLineID, nil
}

func validateProductionReworkQuantity(ctx context.Context, client *ent.Client, source *ent.ProductionFact, additional decimal.Decimal, excludeID int) error {
	if client == nil || source == nil || !additional.GreaterThan(decimal.Zero) {
		return biz.ErrProductionReworkSourceInvalid
	}
	query := client.ProductionFact.Query().Where(
		productionfact.FactType(biz.ProductionFactRework),
		productionfact.SourceType(biz.ProductionFactSourceType),
		productionfact.SourceID(source.ID),
		productionfact.Status(biz.OperationalFactStatusPosted),
	)
	if excludeID > 0 {
		query = query.Where(productionfact.IDNEQ(excludeID))
	}
	rows, err := query.All(ctx)
	if err != nil {
		return err
	}
	total := additional
	for _, row := range rows {
		total = total.Add(row.Quantity)
	}
	if total.GreaterThan(source.Quantity) {
		return biz.ErrProductionReworkQuantityExceeded
	}
	return nil
}

func (r *operationalFactRepo) ListProductionOrderMaterialRequirements(ctx context.Context, productionOrderID int) ([]*biz.ProductionOrderMaterialRequirement, error) {
	if productionOrderID <= 0 {
		return nil, biz.ErrBadParam
	}
	if _, err := r.data.postgres.ProductionOrder.Get(ctx, productionOrderID); err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderNotFound
		}
		return nil, err
	}
	return loadProductionOrderMaterialRequirements(ctx, r.data.postgres, productionOrderID)
}

func createProductionFactDraftWithClient(ctx context.Context, client *ent.Client, in *biz.OperationalFactMutation) (*biz.ProductionFact, error) {
	row, err := client.ProductionFact.Create().
		SetFactNo(in.FactNo).
		SetFactType(in.FactType).
		SetStatus(biz.OperationalFactStatusDraft).
		SetSubjectType(in.SubjectType).
		SetSubjectID(in.SubjectID).
		SetNillableProductSkuID(in.ProductSkuID).
		SetWarehouseID(in.WarehouseID).
		SetUnitID(in.UnitID).
		SetNillableLotID(in.LotID).
		SetQuantity(in.Quantity).
		SetNillableSourceType(in.SourceType).
		SetNillableSourceID(in.SourceID).
		SetNillableSourceLineID(in.SourceLineID).
		SetIdempotencyKey(in.IdempotencyKey).
		SetOccurredAt(in.OccurredAt).
		SetOccurredAtSpecified(in.OccurredAtSpecified).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entProductionFactToBiz(row), nil
}

func isProductionOrderLinkedFact(in *biz.OperationalFactMutation) bool {
	return in != nil && in.SourceType != nil && *in.SourceType == biz.ProductionOrderSourceType
}

func isProductionOrderLinkedFactRow(row *ent.ProductionFact) bool {
	return row != nil && row.SourceType != nil && *row.SourceType == biz.ProductionOrderSourceType
}

func isProductionReworkLinkedFactRow(row *ent.ProductionFact) bool {
	return row != nil && row.FactType == biz.ProductionFactRework && row.SourceType != nil && *row.SourceType == biz.ProductionFactSourceType && row.SourceID != nil && *row.SourceID > 0
}

func productionOrderSourceID(in *biz.OperationalFactMutation) (int, error) {
	if !isProductionOrderLinkedFact(in) || in.SourceID == nil || *in.SourceID <= 0 || in.SourceLineID == nil || *in.SourceLineID <= 0 {
		return 0, biz.ErrProductionOrderFactSourceInvalid
	}
	return *in.SourceID, nil
}

func productionOrderSourceIDFromRow(row *ent.ProductionFact) (int, error) {
	if !isProductionOrderLinkedFactRow(row) || row.SourceID == nil || *row.SourceID <= 0 || row.SourceLineID == nil || *row.SourceLineID <= 0 {
		return 0, biz.ErrProductionOrderFactSourceInvalid
	}
	return *row.SourceID, nil
}

func validateProductionOrderFactSource(ctx context.Context, client *ent.Client, in *biz.OperationalFactMutation, requireReleased bool) (*ent.ProductionOrderItem, error) {
	orderID, err := productionOrderSourceID(in)
	if err != nil {
		return nil, err
	}
	if in.FactType != biz.ProductionFactFinishedGoodsReceipt || in.SubjectType != biz.InventorySubjectProduct {
		return nil, biz.ErrProductionOrderFactSourceInvalid
	}
	orderRow, err := client.ProductionOrder.Get(ctx, orderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderNotFound
		}
		return nil, err
	}
	if requireReleased && orderRow.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrProductionOrderInvalidState
	}
	item, err := client.ProductionOrderItem.Get(ctx, *in.SourceLineID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderFactSourceInvalid
		}
		return nil, err
	}
	if item.ProductionOrderID != orderID || item.ProductID != in.SubjectID || item.UnitID != in.UnitID || !sameOptionalInt(item.ProductSkuID, in.ProductSkuID) {
		return nil, biz.ErrProductionOrderFactSourceInvalid
	}
	return item, nil
}

func validateProductionOrderFactRowSource(ctx context.Context, client *ent.Client, row *ent.ProductionFact, requireReleased bool) (*ent.ProductionOrderItem, error) {
	if row == nil {
		return nil, biz.ErrProductionOrderFactSourceInvalid
	}
	return validateProductionOrderFactSource(ctx, client, &biz.OperationalFactMutation{
		FactType: row.FactType, SubjectType: row.SubjectType, SubjectID: row.SubjectID,
		ProductSkuID: row.ProductSkuID, UnitID: row.UnitID, SourceType: row.SourceType,
		SourceID: row.SourceID, SourceLineID: row.SourceLineID,
	}, requireReleased)
}

func validateProductionOrderFinishedQuantity(ctx context.Context, client *ent.Client, item *ent.ProductionOrderItem, additional decimal.Decimal) error {
	if item == nil || !additional.GreaterThan(decimal.Zero) {
		return biz.ErrProductionOrderFactSourceInvalid
	}
	effective, err := productionOrderEffectiveCompletedQuantity(ctx, client, item)
	if err != nil {
		return err
	}
	if effective.Add(additional).GreaterThan(item.PlannedQuantity) {
		return biz.ErrProductionOrderQuantityExceeded
	}
	return nil
}

func productionOrderEffectiveCompletedQuantity(ctx context.Context, client *ent.Client, item *ent.ProductionOrderItem) (decimal.Decimal, error) {
	if client == nil || item == nil {
		return decimal.Zero, biz.ErrProductionOrderFactSourceInvalid
	}
	rows, err := client.ProductionFact.Query().Where(
		productionfact.SourceType(biz.ProductionOrderSourceType),
		productionfact.SourceID(item.ProductionOrderID),
		productionfact.SourceLineID(item.ID),
		productionfact.FactType(biz.ProductionFactFinishedGoodsReceipt),
		productionfact.Status(biz.OperationalFactStatusPosted),
	).All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	effective := decimal.Zero
	completionIDs := make([]int, 0, len(rows))
	for _, row := range rows {
		effective = effective.Add(row.Quantity)
		completionIDs = append(completionIDs, row.ID)
	}
	if len(completionIDs) == 0 {
		return effective, nil
	}
	reworks, err := client.ProductionFact.Query().Where(
		productionfact.FactType(biz.ProductionFactRework),
		productionfact.Status(biz.OperationalFactStatusPosted),
		productionfact.SourceType(biz.ProductionFactSourceType),
		productionfact.SourceIDIn(completionIDs...),
	).All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	for _, row := range reworks {
		if row.SourceLineID == nil || *row.SourceLineID != item.ID || row.SubjectType != biz.InventorySubjectProduct || row.UnitID != item.UnitID {
			return decimal.Zero, biz.ErrProductionReworkSourceInvalid
		}
		effective = effective.Sub(row.Quantity)
	}
	if effective.IsNegative() {
		return decimal.Zero, biz.ErrProductionReworkQuantityExceeded
	}
	return effective, nil
}

func validateProductionOrderMaterialRequirementReferences(ctx context.Context, client *ent.Client, requirement *ent.ProductionOrderMaterialRequirement) error {
	if requirement == nil {
		return biz.ErrProductionOrderMaterialRequirementInvalid
	}
	item, err := client.ProductionOrderItem.Get(ctx, requirement.ProductionOrderItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrProductionOrderMaterialRequirementInvalid
		}
		return err
	}
	if item.ProductionOrderID != requirement.ProductionOrderID || item.BomHeaderID == nil || *item.BomHeaderID != requirement.BomHeaderID {
		return biz.ErrProductionOrderMaterialRequirementInvalid
	}
	bomRow, err := client.BOMItem.Get(ctx, requirement.BomItemID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrProductionOrderMaterialRequirementInvalid
		}
		return err
	}
	if bomRow.BomHeaderID != requirement.BomHeaderID || bomRow.MaterialID != requirement.MaterialID || bomRow.UnitID != requirement.UnitID {
		return biz.ErrProductionOrderMaterialRequirementInvalid
	}
	return nil
}

func validateProductionOrderMaterialIssueQuantity(
	ctx context.Context,
	client *ent.Client,
	requirement *ent.ProductionOrderMaterialRequirement,
	additional decimal.Decimal,
) error {
	if requirement == nil || !additional.GreaterThan(decimal.Zero) {
		return biz.ErrProductionOrderMaterialRequirementInvalid
	}
	rows, err := client.ProductionFact.Query().Where(
		productionfact.SourceType(biz.ProductionOrderSourceType),
		productionfact.SourceID(requirement.ProductionOrderID),
		productionfact.SourceLineID(requirement.ID),
		productionfact.FactType(biz.ProductionFactMaterialIssue),
		productionfact.Status(biz.OperationalFactStatusPosted),
	).All(ctx)
	if err != nil {
		return err
	}
	issued := decimal.Zero
	for _, row := range rows {
		if row.SubjectType != biz.InventorySubjectMaterial || row.SubjectID != requirement.MaterialID || row.ProductSkuID != nil || row.UnitID != requirement.UnitID {
			return biz.ErrProductionOrderMaterialRequirementInvalid
		}
		issued = issued.Add(row.Quantity)
	}
	if issued.Add(additional).GreaterThan(requirement.PlannedQuantity) {
		return biz.ErrProductionOrderMaterialIssueQuantityExceeded
	}
	return nil
}

func validateProductionOrderMaterialIssueFactRowSource(
	ctx context.Context,
	client *ent.Client,
	row *ent.ProductionFact,
	requireReleased bool,
) (*ent.ProductionOrderMaterialRequirement, error) {
	orderID, err := productionOrderSourceIDFromRow(row)
	if err != nil {
		return nil, err
	}
	if row.FactType != biz.ProductionFactMaterialIssue || row.SubjectType != biz.InventorySubjectMaterial || row.ProductSkuID != nil {
		return nil, biz.ErrProductionOrderMaterialRequirementInvalid
	}
	orderRow, err := client.ProductionOrder.Get(ctx, orderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderNotFound
		}
		return nil, err
	}
	if requireReleased && orderRow.Status != biz.ProductionOrderStatusReleased {
		return nil, biz.ErrProductionOrderInvalidState
	}
	requirement, err := client.ProductionOrderMaterialRequirement.Get(ctx, *row.SourceLineID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderMaterialRequirementNotFound
		}
		return nil, err
	}
	if requirement.ProductionOrderID != orderID || requirement.MaterialID != row.SubjectID || requirement.UnitID != row.UnitID {
		return nil, biz.ErrProductionOrderMaterialRequirementInvalid
	}
	if err := validateProductionOrderMaterialRequirementReferences(ctx, client, requirement); err != nil {
		return nil, err
	}
	return requirement, nil
}

func lockProductionOrderMaterialIssueSource(ctx context.Context, tx *inventoryDBTx, row *ent.ProductionFact, orderID int) error {
	if row == nil || row.FactType != biz.ProductionFactMaterialIssue {
		return nil
	}
	if row.SourceLineID == nil || *row.SourceLineID <= 0 {
		return biz.ErrProductionOrderMaterialRequirementInvalid
	}
	requirement, err := tx.client.ProductionOrderMaterialRequirement.Get(ctx, *row.SourceLineID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrProductionOrderMaterialRequirementNotFound
		}
		return err
	}
	if requirement.ProductionOrderID != orderID {
		return biz.ErrProductionOrderMaterialRequirementInvalid
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_items", requirement.ProductionOrderItemID, biz.ErrProductionOrderFactSourceInvalid); err != nil {
		return err
	}
	return lockOperationalFactRow(ctx, tx, "production_order_material_requirements", requirement.ID, biz.ErrProductionOrderMaterialRequirementNotFound)
}

func (r *operationalFactRepo) createProductionOrderLinkedFactDraft(ctx context.Context, in *biz.OperationalFactMutation) (*biz.ProductionFact, error) {
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if replay, found, replayErr := findProductionFactReplay(ctx, tx.client, in); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx.sqlTx = nil
		return replay, nil
	}
	orderID, err := productionOrderSourceID(in)
	if err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_orders", orderID, biz.ErrProductionOrderNotFound); err != nil {
		return nil, err
	}
	if replay, found, replayErr := findProductionFactReplay(ctx, tx.client, in); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx.sqlTx = nil
		return replay, nil
	}
	if _, err := validateProductionOrderFactSource(ctx, tx.client, in, true); err != nil {
		return nil, err
	}
	if err := resolveOrCreateSourceInboundLot(ctx, tx, in); err != nil {
		return nil, err
	}
	if err := validateOperationalFactSKUAndLot(ctx, tx.client, in.SubjectType, in.SubjectID, in.ProductSkuID, in.LotID); err != nil {
		return nil, err
	}
	row, err := createProductionFactDraftWithClient(ctx, tx.client, in)
	if err != nil {
		if ent.IsConstraintError(err) {
			rollbackInventoryDBTx(ctx, tx, r.log)
			tx = nil
			if replay, found, replayErr := findProductionFactReplay(ctx, r.data.postgres, in); replayErr != nil || found {
				return replay, replayErr
			}
		}
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return row, nil
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
	if filter.FactType != "" {
		q = q.Where(productionfact.FactType(filter.FactType))
	}
	if filter.SubjectType != "" {
		q = q.Where(productionfact.SubjectType(filter.SubjectType))
	}
	if filter.SubjectID > 0 {
		q = q.Where(productionfact.SubjectID(filter.SubjectID))
	}
	if filter.ProductSkuID > 0 {
		q = q.Where(productionfact.ProductSkuID(filter.ProductSkuID))
	}
	if filter.WarehouseID > 0 {
		q = q.Where(productionfact.WarehouseID(filter.WarehouseID))
	}
	if filter.LotID > 0 {
		q = q.Where(productionfact.LotID(filter.LotID))
	}
	if filter.SourceType != "" {
		q = q.Where(productionfact.SourceType(filter.SourceType))
	}
	if filter.SourceID > 0 {
		q = q.Where(productionfact.SourceID(filter.SourceID))
	}
	if filter.Keyword != "" {
		q = q.Where(productionfact.Or(
			productionfact.FactNoContainsFold(filter.Keyword),
			productionfact.FactTypeContainsFold(filter.Keyword),
			productionfact.SubjectTypeContainsFold(filter.Keyword),
			productionfact.SourceTypeContainsFold(filter.Keyword),
			productionfact.IdempotencyKeyContainsFold(filter.Keyword),
			productionfact.NoteContainsFold(filter.Keyword),
			productionfact.IDEQ(parsePositiveIntOrZero(filter.Keyword)),
			productionfact.SubjectIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			productionfact.ProductSkuIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			productionfact.WarehouseIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			productionfact.LotIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			productionfact.SourceIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			productionfact.SourceLineIDEQ(parsePositiveIntOrZero(filter.Keyword)),
		))
	}
	if filter.DateFrom != nil {
		q = q.Where(productionfact.OccurredAtGTE(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		q = q.Where(productionfact.OccurredAtLTE(endOfDateFilter(*filter.DateTo)))
	}
	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.Order(ent.Desc(productionfact.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	references := make([]businessSourceReference, 0, len(rows))
	for _, row := range rows {
		references = append(references, businessSourceReference{sourceType: row.SourceType, sourceID: row.SourceID})
	}
	sourceNos, err := resolveBusinessSourceNos(ctx, r.data.postgres, references)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.ProductionFact, 0, len(rows))
	for _, row := range rows {
		item := entProductionFactToBiz(row)
		item.SourceNo = businessSourceNo(sourceNos, row.SourceType, row.SourceID)
		out = append(out, item)
	}
	return out, total, nil
}

func (r *operationalFactRepo) CreateOutsourcingMaterialIssueFromOrder(ctx context.Context, in *biz.OutsourcingFactFromOrderCreate) (*biz.OutsourcingFact, error) {
	return r.createOutsourcingFactFromOrder(ctx, biz.OutsourcingFactMaterialIssue, in)
}

func (r *operationalFactRepo) CreateOutsourcingReturnReceiptFromOrder(ctx context.Context, in *biz.OutsourcingFactFromOrderCreate) (*biz.OutsourcingFact, error) {
	return r.createOutsourcingFactFromOrder(ctx, biz.OutsourcingFactReturnReceipt, in)
}

func (r *operationalFactRepo) createOutsourcingFactFromOrder(ctx context.Context, factType string, in *biz.OutsourcingFactFromOrderCreate) (*biz.OutsourcingFact, error) {
	if in == nil {
		return nil, biz.ErrBadParam
	}
	preview, found, err := findOutsourcingFactFromOrderIntent(ctx, r.data.postgres, factType, in)
	if err != nil {
		return nil, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_orders", in.OutsourcingOrderID, biz.ErrOutsourcingOrderNotFound); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_order_items", in.OutsourcingOrderItemID, biz.ErrOutsourcingOrderItemNotFound); err != nil {
		return nil, err
	}
	resolved, item, err := resolveOutsourcingOrderFactMutation(ctx, tx.client, factType, in, !found)
	if err != nil {
		return nil, err
	}
	if found {
		if in.NewLotNo != nil {
			resolved.LotID = preview.LotID
		}
		if err := lockOperationalFactRow(ctx, tx, "outsourcing_facts", preview.ID, biz.ErrOutsourcingFactNotFound); err != nil {
			return nil, err
		}
		current, err := tx.client.OutsourcingFact.Get(ctx, preview.ID)
		if err != nil {
			return nil, err
		}
		if !operationalFactMutationMatchesOutsourcing(current, resolved) {
			return nil, biz.ErrIdempotencyConflict
		}
		return commitOutsourcingFact(ctx, tx, current)
	}
	if raced, racedFound, replayErr := findOutsourcingFactFromOrderIntent(ctx, tx.client, factType, in); replayErr != nil || racedFound {
		if replayErr != nil {
			return nil, replayErr
		}
		if in.NewLotNo != nil {
			resolved.LotID = raced.LotID
		}
		if err := lockOperationalFactRow(ctx, tx, "outsourcing_facts", raced.ID, biz.ErrOutsourcingFactNotFound); err != nil {
			return nil, err
		}
		current, err := tx.client.OutsourcingFact.Get(ctx, raced.ID)
		if err != nil {
			return nil, err
		}
		if !operationalFactMutationMatchesOutsourcing(current, resolved) {
			return nil, biz.ErrIdempotencyConflict
		}
		return commitOutsourcingFact(ctx, tx, current)
	}
	if err := validateOutsourcingOrderFactQuantity(ctx, tx.client, item, factType, resolved.Quantity); err != nil {
		return nil, err
	}
	if err := resolveOrCreateSourceInboundLot(ctx, tx, resolved); err != nil {
		return nil, err
	}
	if err := validateOperationalFactSKUAndLot(ctx, tx.client, resolved.SubjectType, resolved.SubjectID, resolved.ProductSkuID, resolved.LotID); err != nil {
		return nil, err
	}
	row, err := createOutsourcingFactDraftWithClient(ctx, tx.client, resolved)
	if err != nil {
		if ent.IsConstraintError(err) {
			rollbackInventoryDBTx(ctx, tx, r.log)
			tx = nil
			if replay, replayFound, replayErr := findOutsourcingFactFromOrderIntent(ctx, r.data.postgres, factType, in); replayErr != nil || replayFound {
				if replayErr != nil {
					return nil, replayErr
				}
				if !operationalFactMutationMatchesOutsourcing(replay, resolved) {
					return nil, biz.ErrIdempotencyConflict
				}
				return outsourcingFactWithSourceSKUProjection(ctx, r.data.postgres, replay)
			}
		}
		return nil, err
	}
	return commitOutsourcingFact(ctx, tx, row)
}

func resolveOutsourcingOrderFactMutation(ctx context.Context, client *ent.Client, factType string, in *biz.OutsourcingFactFromOrderCreate, requireActive bool) (*biz.OperationalFactMutation, *ent.OutsourcingOrderItem, error) {
	if client == nil || in == nil {
		return nil, nil, biz.ErrBadParam
	}
	order, err := client.OutsourcingOrder.Query().Where(outsourcingorder.ID(in.OutsourcingOrderID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, nil, biz.ErrOutsourcingOrderNotFound
		}
		return nil, nil, err
	}
	item, err := client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.ID(in.OutsourcingOrderItemID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, nil, biz.ErrOutsourcingOrderItemNotFound
		}
		return nil, nil, err
	}
	if item.OutsourcingOrderID != order.ID {
		return nil, nil, biz.ErrOutsourcingOrderFactSourceInvalid
	}
	if requireActive && (order.LifecycleStatus != biz.OutsourcingOrderStatusConfirmed || item.LineStatus != biz.OutsourcingOrderItemStatusOpen) {
		return nil, nil, biz.ErrOutsourcingOrderFactInvalidState
	}

	var subjectID int
	switch factType {
	case biz.OutsourcingFactMaterialIssue:
		if item.SubjectType != biz.OutsourcingOrderSubjectMaterial || item.MaterialID == nil || item.ProductID != nil {
			return nil, nil, biz.ErrOutsourcingOrderFactSourceInvalid
		}
		subjectID = *item.MaterialID
	case biz.OutsourcingFactReturnReceipt:
		if item.SubjectType != biz.OutsourcingOrderSubjectProduct || item.ProductID == nil || item.MaterialID != nil {
			return nil, nil, biz.ErrOutsourcingOrderFactSourceInvalid
		}
		subjectID = *item.ProductID
	default:
		return nil, nil, biz.ErrBadParam
	}
	if subjectID <= 0 || order.SupplierID <= 0 || item.UnitID <= 0 {
		return nil, nil, biz.ErrOutsourcingOrderFactSourceInvalid
	}
	if requireActive {
		if err := validateOutsourcingOrderFactActiveReferences(ctx, client, factType, subjectID, item.ProductSkuID, order.SupplierID, item.UnitID, in.WarehouseID); err != nil {
			return nil, nil, err
		}
	}
	sourceType := biz.OutsourcingOrderSourceType
	sourceID := order.ID
	sourceLineID := item.ID
	supplierID := order.SupplierID
	var supplierName *string
	if name := strings.TrimSpace(supplierNameFromSnapshot(order.SupplierSnapshot)); name != "" {
		supplierName = &name
	}
	subjectType := item.SubjectType
	return &biz.OperationalFactMutation{
		FactNo:              in.FactNo,
		FactType:            factType,
		SubjectType:         subjectType,
		SubjectID:           subjectID,
		ProductSkuID:        item.ProductSkuID,
		WarehouseID:         in.WarehouseID,
		UnitID:              item.UnitID,
		LotID:               in.LotID,
		NewLotNo:            in.NewLotNo,
		Quantity:            in.Quantity,
		SupplierID:          &supplierID,
		SupplierName:        supplierName,
		SourceType:          &sourceType,
		SourceID:            &sourceID,
		SourceLineID:        &sourceLineID,
		IdempotencyKey:      in.IdempotencyKey,
		OccurredAt:          in.OccurredAt,
		OccurredAtSpecified: in.OccurredAtSpecified,
		Note:                in.Note,
	}, item, nil
}

func validateOutsourcingOrderFactActiveReferences(ctx context.Context, client *ent.Client, factType string, subjectID int, productSkuID *int, supplierID, unitID, warehouseID int) error {
	active, err := client.Supplier.Query().Where(supplier.ID(supplierID), supplier.IsActive(true)).Exist(ctx)
	if err != nil {
		return err
	}
	if !active {
		return biz.ErrSupplierInactive
	}
	active, err = client.Unit.Query().Where(unit.ID(unitID), unit.IsActive(true)).Exist(ctx)
	if err != nil {
		return err
	}
	if !active {
		return biz.ErrUnitInactive
	}
	active, err = client.Warehouse.Query().Where(warehouse.ID(warehouseID), warehouse.IsActive(true)).Exist(ctx)
	if err != nil {
		return err
	}
	if !active {
		return biz.ErrWarehouseInactive
	}
	switch factType {
	case biz.OutsourcingFactMaterialIssue:
		if productSkuID != nil {
			return biz.ErrOutsourcingOrderFactSourceInvalid
		}
		active, err = client.Material.Query().Where(material.ID(subjectID), material.IsActive(true)).Exist(ctx)
		if err != nil {
			return err
		}
		if !active {
			return biz.ErrMaterialInactive
		}
	case biz.OutsourcingFactReturnReceipt:
		active, err = client.Product.Query().Where(product.ID(subjectID), product.IsActive(true)).Exist(ctx)
		if err != nil {
			return err
		}
		if !active {
			return biz.ErrProductInactive
		}
		if productSkuID != nil {
			skuRow, skuErr := client.ProductSKU.Query().Where(productsku.ID(*productSkuID)).Only(ctx)
			if skuErr != nil {
				if ent.IsNotFound(skuErr) {
					return biz.ErrProductSKUNotFound
				}
				return skuErr
			}
			if !skuRow.IsActive {
				return biz.ErrProductSKUInactive
			}
			if skuRow.ProductID != subjectID || skuRow.DefaultUnitID == nil || *skuRow.DefaultUnitID != unitID {
				return biz.ErrOutsourcingOrderFactSourceInvalid
			}
		}
	default:
		return biz.ErrBadParam
	}
	return nil
}

func validateOutsourcingOrderFactQuantity(ctx context.Context, client *ent.Client, item *ent.OutsourcingOrderItem, factType string, additional decimal.Decimal) error {
	if client == nil || item == nil || !additional.GreaterThan(decimal.Zero) {
		return biz.ErrOutsourcingOrderFactSourceInvalid
	}
	rows, err := client.OutsourcingFact.Query().Where(
		outsourcingfact.SourceType(biz.OutsourcingOrderSourceType),
		outsourcingfact.SourceID(item.OutsourcingOrderID),
		outsourcingfact.SourceLineID(item.ID),
		outsourcingfact.FactType(factType),
		outsourcingfact.Status(biz.OperationalFactStatusPosted),
	).All(ctx)
	if err != nil {
		return err
	}
	effective := decimal.Zero
	for _, row := range rows {
		effective = effective.Add(row.Quantity)
	}
	if effective.Add(additional).GreaterThan(item.OutsourcingQuantity) {
		return biz.ErrOutsourcingOrderFactQuantityExceeded
	}
	return nil
}

func createOutsourcingFactDraftWithClient(ctx context.Context, client *ent.Client, in *biz.OperationalFactMutation) (*ent.OutsourcingFact, error) {
	return client.OutsourcingFact.Create().
		SetFactNo(in.FactNo).
		SetFactType(in.FactType).
		SetStatus(biz.OperationalFactStatusDraft).
		SetSubjectType(in.SubjectType).
		SetSubjectID(in.SubjectID).
		SetNillableProductSkuID(in.ProductSkuID).
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
		SetOccurredAtSpecified(in.OccurredAtSpecified).
		SetNillableNote(in.Note).
		Save(ctx)
}

func (r *operationalFactRepo) CreateOutsourcingFactDraft(ctx context.Context, in *biz.OperationalFactMutation) (*biz.OutsourcingFact, error) {
	if err := validateOperationalFactSKUAndLot(ctx, r.data.postgres, in.SubjectType, in.SubjectID, in.ProductSkuID, in.LotID); err != nil {
		return nil, err
	}
	if replay, found, err := findOutsourcingFactReplay(ctx, r.data.postgres, in); err != nil {
		return nil, err
	} else if found {
		if err := hydrateOutsourcingFactSourceSKUProjections(ctx, r.data.postgres, []*biz.OutsourcingFact{replay}); err != nil {
			return nil, err
		}
		return replay, nil
	}
	row, err := createOutsourcingFactDraftWithClient(ctx, r.data.postgres, in)
	if err != nil {
		if ent.IsConstraintError(err) {
			if replay, found, replayErr := findOutsourcingFactReplay(ctx, r.data.postgres, in); replayErr != nil {
				return nil, replayErr
			} else if found {
				if hydrateErr := hydrateOutsourcingFactSourceSKUProjections(ctx, r.data.postgres, []*biz.OutsourcingFact{replay}); hydrateErr != nil {
					return nil, hydrateErr
				}
				return replay, nil
			}
		}
		return nil, err
	}
	return outsourcingFactWithSourceSKUProjection(ctx, r.data.postgres, row)
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
	if filter.FactType != "" {
		q = q.Where(outsourcingfact.FactType(filter.FactType))
	}
	if filter.SubjectType != "" {
		q = q.Where(outsourcingfact.SubjectType(filter.SubjectType))
	}
	if filter.SubjectID > 0 {
		q = q.Where(outsourcingfact.SubjectID(filter.SubjectID))
	}
	if filter.ProductSkuID > 0 {
		q = q.Where(outsourcingfact.ProductSkuID(filter.ProductSkuID))
	}
	if filter.WarehouseID > 0 {
		q = q.Where(outsourcingfact.WarehouseID(filter.WarehouseID))
	}
	if filter.LotID > 0 {
		q = q.Where(outsourcingfact.LotID(filter.LotID))
	}
	if filter.SourceType != "" {
		q = q.Where(outsourcingfact.SourceType(filter.SourceType))
	}
	if filter.SourceID > 0 {
		q = q.Where(outsourcingfact.SourceID(filter.SourceID))
	}
	if filter.CounterpartyID > 0 {
		q = q.Where(outsourcingfact.SupplierID(filter.CounterpartyID))
	}
	if filter.Keyword != "" {
		q = q.Where(outsourcingfact.Or(
			outsourcingfact.FactNoContainsFold(filter.Keyword),
			outsourcingfact.FactTypeContainsFold(filter.Keyword),
			outsourcingfact.SubjectTypeContainsFold(filter.Keyword),
			outsourcingfact.SupplierNameContainsFold(filter.Keyword),
			outsourcingfact.SourceTypeContainsFold(filter.Keyword),
			outsourcingfact.IdempotencyKeyContainsFold(filter.Keyword),
			outsourcingfact.NoteContainsFold(filter.Keyword),
			outsourcingfact.IDEQ(parsePositiveIntOrZero(filter.Keyword)),
			outsourcingfact.SubjectIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			outsourcingfact.ProductSkuIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			outsourcingfact.WarehouseIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			outsourcingfact.LotIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			outsourcingfact.SupplierIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			outsourcingfact.SourceIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			outsourcingfact.SourceLineIDEQ(parsePositiveIntOrZero(filter.Keyword)),
		))
	}
	if filter.DateFrom != nil {
		q = q.Where(outsourcingfact.OccurredAtGTE(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		q = q.Where(outsourcingfact.OccurredAtLTE(endOfDateFilter(*filter.DateTo)))
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
	if err := hydrateOutsourcingFactSourceSKUProjections(ctx, r.data.postgres, out); err != nil {
		return nil, 0, err
	}
	references := make([]businessSourceReference, 0, len(rows))
	for _, row := range rows {
		references = append(references, businessSourceReference{sourceType: row.SourceType, sourceID: row.SourceID})
	}
	sourceNos, err := resolveBusinessSourceNos(ctx, r.data.postgres, references)
	if err != nil {
		return nil, 0, err
	}
	for index, row := range rows {
		item := out[index]
		item.SourceNo = businessSourceNo(sourceNos, row.SourceType, row.SourceID)
	}
	return out, total, nil
}

type outsourcingFactSourceSKUKey struct {
	sourceID     int
	sourceLineID int
	productSkuID int
}

type outsourcingFactSourceSKUProjection struct {
	skuCodeSnapshot *string
}

func hydrateOutsourcingFactSourceSKUProjections(
	ctx context.Context,
	client *ent.Client,
	items []*biz.OutsourcingFact,
) error {
	projections, err := resolveOutsourcingFactSourceSKUSnapshots(ctx, client, items)
	if err != nil {
		return err
	}
	for _, item := range items {
		if item == nil {
			continue
		}
		item.SKUCodeSnapshot = nil
		key, ok := outsourcingFactSourceSKUKeyFromFact(item)
		if !ok {
			continue
		}
		if projection, found := projections[key]; found {
			item.SKUCodeSnapshot = projection.skuCodeSnapshot
		}
	}
	return nil
}

func outsourcingFactSourceSKUKeyFromFact(item *biz.OutsourcingFact) (outsourcingFactSourceSKUKey, bool) {
	if item == nil || item.SourceType == nil || *item.SourceType != biz.OutsourcingOrderSourceType ||
		item.SourceID == nil || *item.SourceID <= 0 || item.SourceLineID == nil || *item.SourceLineID <= 0 ||
		item.ProductSkuID == nil || *item.ProductSkuID <= 0 {
		return outsourcingFactSourceSKUKey{}, false
	}
	return outsourcingFactSourceSKUKey{
		sourceID:     *item.SourceID,
		sourceLineID: *item.SourceLineID,
		productSkuID: *item.ProductSkuID,
	}, true
}

func resolveOutsourcingFactSourceSKUSnapshots(
	ctx context.Context,
	client *ent.Client,
	items []*biz.OutsourcingFact,
) (map[outsourcingFactSourceSKUKey]outsourcingFactSourceSKUProjection, error) {
	sourceLineIDs := make(map[int]struct{})
	for _, item := range items {
		key, ok := outsourcingFactSourceSKUKeyFromFact(item)
		if !ok {
			continue
		}
		sourceLineIDs[key.sourceLineID] = struct{}{}
	}
	if len(sourceLineIDs) == 0 {
		return map[outsourcingFactSourceSKUKey]outsourcingFactSourceSKUProjection{}, nil
	}

	ids := make([]int, 0, len(sourceLineIDs))
	for id := range sourceLineIDs {
		ids = append(ids, id)
	}
	sort.Ints(ids)
	sourceRows, err := client.OutsourcingOrderItem.Query().
		Where(outsourcingorderitem.IDIn(ids...)).
		Select(
			outsourcingorderitem.FieldID,
			outsourcingorderitem.FieldOutsourcingOrderID,
			outsourcingorderitem.FieldProductSkuID,
			outsourcingorderitem.FieldSkuCodeSnapshot,
		).
		All(ctx)
	if err != nil {
		return nil, err
	}

	resolved := make(map[outsourcingFactSourceSKUKey]outsourcingFactSourceSKUProjection, len(sourceRows))
	for _, row := range sourceRows {
		if row.ProductSkuID == nil || row.SkuCodeSnapshot == nil || strings.TrimSpace(*row.SkuCodeSnapshot) == "" {
			continue
		}
		key := outsourcingFactSourceSKUKey{
			sourceID:     row.OutsourcingOrderID,
			sourceLineID: row.ID,
			productSkuID: *row.ProductSkuID,
		}
		resolved[key] = outsourcingFactSourceSKUProjection{
			skuCodeSnapshot: row.SkuCodeSnapshot,
		}
	}
	return resolved, nil
}

func (r *operationalFactRepo) CreateShipmentDraftWithItems(ctx context.Context, in *biz.ShipmentCreateWithItems) (*biz.Shipment, error) {
	if replay, found, err := findShipmentReplay(ctx, r.data.postgres, in.Shipment, in.Items); err != nil || found {
		return replay, err
	}
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
		SetNillableTotalNetWeightG(in.Shipment.TotalNetWeightG).
		SetNillableRequestedTotalNetWeightG(in.Shipment.TotalNetWeightG).
		SetNillableNote(in.Shipment.Note).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			if rollbackErr := tx.sqlTx.Rollback(); rollbackErr != nil {
				r.log.WithContext(ctx).Warnf("rollback shipment idempotency conflict failed err=%v", rollbackErr)
			}
			tx = nil
			if replay, found, replayErr := findShipmentReplay(ctx, r.data.postgres, in.Shipment, in.Items); replayErr != nil || found {
				return replay, replayErr
			}
		}
		return nil, err
	}
	for _, item := range in.Items {
		if _, err := createShipmentItem(ctx, tx.client, row.ID, in.Shipment.SalesOrderID, item); err != nil {
			return nil, err
		}
	}
	return commitShipment(ctx, tx, row)
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
	if !shipmentMatchesCreate(row, shipmentIn) {
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

func (r *operationalFactRepo) CreateFinanceFactDraft(ctx context.Context, in *biz.FinanceFactCreate) (*biz.FinanceFact, error) {
	if replay, found, err := findFinanceFactReplay(ctx, r.data.postgres, in); err != nil || found {
		return replay, err
	}
	if _, found, err := findActiveFinanceFactBySource(ctx, r.data.postgres, in); err != nil {
		return nil, err
	} else if found {
		return nil, biz.ErrFinanceFactSourceConflict
	}
	row, err := r.data.postgres.FinanceFact.Create().
		SetFactNo(in.FactNo).
		SetFactType(in.FactType).
		SetStatus(biz.OperationalFactStatusDraft).
		SetCounterpartyType(in.CounterpartyType).
		SetNillableCounterpartyID(in.CounterpartyID).
		SetAmount(in.Amount).
		SetFeeAmount(in.FeeAmount).
		SetCurrency(in.Currency).
		SetNillableCollectionType(in.CollectionType).
		SetNillablePaymentTerm(in.PaymentTerm).
		SetNillablePaymentTermDays(in.PaymentTermDays).
		SetNillableInvoiceCategory(in.InvoiceCategory).
		SetNillableSourceType(in.SourceType).
		SetNillableSourceID(in.SourceID).
		SetNillableSourceLineID(in.SourceLineID).
		SetIdempotencyKey(in.IdempotencyKey).
		SetOccurredAt(in.OccurredAt).
		SetOccurredAtSpecified(in.OccurredAtSpecified).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			if replay, found, replayErr := findFinanceFactReplay(ctx, r.data.postgres, in); replayErr != nil || found {
				return replay, replayErr
			}
			if _, found, sourceErr := findActiveFinanceFactBySource(ctx, r.data.postgres, in); sourceErr != nil {
				return nil, sourceErr
			} else if found {
				return nil, biz.ErrFinanceFactSourceConflict
			}
		}
		return nil, err
	}
	return entFinanceFactToBiz(row), nil
}

func (r *operationalFactRepo) CreateFinanceFactDraftFromShipment(
	ctx context.Context,
	factType string,
	in *biz.FinanceFactFromShipmentCreate,
) (*biz.FinanceFact, error) {
	if in == nil || in.ShipmentID <= 0 || (factType != biz.FinanceFactReceivable && factType != biz.FinanceFactInvoice) ||
		(factType == biz.FinanceFactReceivable && in.InvoiceCategory != nil) {
		return nil, biz.ErrBadParam
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)

	if replay, found, replayErr := findFinanceFactFromShipmentReplay(ctx, tx.client, factType, in); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	if err := lockOperationalFactRow(ctx, tx, "shipments", in.ShipmentID, biz.ErrShipmentNotFound); err != nil {
		return nil, err
	}
	// A concurrent exact-key request may have committed while this transaction
	// waited for the shipment lock. Replay it before classifying the existing
	// active source as a different-key conflict.
	if replay, found, replayErr := findFinanceFactFromShipmentReplay(ctx, tx.client, factType, in); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	parent, err := tx.client.Shipment.Get(ctx, in.ShipmentID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrShipmentNotFound
		}
		return nil, err
	}
	if parent.Status != biz.ShipmentStatusShipped || parent.CustomerID == nil || *parent.CustomerID <= 0 {
		return nil, biz.ErrBadParam
	}
	amount, err := shipmentFinanceAmountFromSnapshots(ctx, tx.client, parent.ID)
	if err != nil {
		return nil, err
	}

	sourceType := biz.ShipmentSourceType
	shipmentID := parent.ID
	customerID := *parent.CustomerID
	create := &biz.FinanceFactCreate{
		FactNo:              in.FactNo,
		FactType:            factType,
		CounterpartyType:    biz.FinanceCounterpartyCustomer,
		CounterpartyID:      &customerID,
		Amount:              amount,
		FeeAmount:           decimal.Zero,
		Currency:            biz.FinanceCurrencyCNY,
		InvoiceCategory:     in.InvoiceCategory,
		SourceType:          &sourceType,
		SourceID:            &shipmentID,
		IdempotencyKey:      in.IdempotencyKey,
		OccurredAt:          in.OccurredAt,
		OccurredAtSpecified: in.OccurredAtSpecified,
		Note:                in.Note,
	}
	if _, found, sourceErr := findActiveFinanceFactBySource(ctx, tx.client, create); sourceErr != nil {
		return nil, sourceErr
	} else if found {
		return nil, biz.ErrFinanceFactSourceConflict
	}
	row, err := tx.client.FinanceFact.Create().
		SetFactNo(create.FactNo).
		SetFactType(create.FactType).
		SetStatus(biz.OperationalFactStatusDraft).
		SetCounterpartyType(create.CounterpartyType).
		SetNillableCounterpartyID(create.CounterpartyID).
		SetAmount(create.Amount).
		SetFeeAmount(create.FeeAmount).
		SetCurrency(create.Currency).
		SetNillableInvoiceCategory(create.InvoiceCategory).
		SetNillableSourceType(create.SourceType).
		SetNillableSourceID(create.SourceID).
		SetIdempotencyKey(create.IdempotencyKey).
		SetOccurredAt(create.OccurredAt).
		SetOccurredAtSpecified(create.OccurredAtSpecified).
		SetNillableNote(create.Note).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			if rollbackErr := tx.sqlTx.Rollback(); rollbackErr != nil && !errors.Is(rollbackErr, stdsql.ErrTxDone) {
				r.log.WithContext(ctx).Warnf("rollback shipment finance conflict failed err=%v", rollbackErr)
			}
			tx = nil
			if replay, found, replayErr := findFinanceFactFromShipmentReplay(ctx, r.data.postgres, factType, in); replayErr != nil || found {
				return replay, replayErr
			}
			if _, found, sourceErr := findActiveFinanceFactBySource(ctx, r.data.postgres, create); sourceErr != nil {
				return nil, sourceErr
			} else if found {
				return nil, biz.ErrFinanceFactSourceConflict
			}
		}
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entFinanceFactToBiz(row), nil
}

func (r *operationalFactRepo) CreateFinanceFactDraftForProcessCommand(
	ctx context.Context,
	in *biz.FinanceFactCreate,
	command *biz.ProcessDomainCommandInput,
	actorID int,
) (*biz.FinanceFact, error) {
	if in == nil || command == nil {
		return nil, biz.ErrBadParam
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if replay, found, replayErr := r.recoverFinanceFactProcessCommandReplayInTx(ctx, tx, in, command, actorID); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	if err := lockAndValidateFinanceFactShipmentSource(ctx, tx, in); err != nil {
		return nil, err
	}
	// A concurrent exact command may have committed while this transaction
	// waited for the shipment parent lock. Rebind its result instead of
	// misclassifying the retry as a different-key source conflict.
	if replay, found, replayErr := r.recoverFinanceFactProcessCommandReplayInTx(ctx, tx, in, command, actorID); replayErr != nil || found {
		if replayErr != nil {
			return nil, replayErr
		}
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return replay, nil
	}
	if _, found, err := findActiveFinanceFactBySource(ctx, tx.client, in); err != nil {
		return nil, err
	} else if found {
		return nil, biz.ErrFinanceFactSourceConflict
	}
	row, err := tx.client.FinanceFact.Create().
		SetFactNo(in.FactNo).
		SetFactType(in.FactType).
		SetStatus(biz.OperationalFactStatusDraft).
		SetCounterpartyType(in.CounterpartyType).
		SetNillableCounterpartyID(in.CounterpartyID).
		SetAmount(in.Amount).
		SetFeeAmount(in.FeeAmount).
		SetCurrency(in.Currency).
		SetNillableCollectionType(in.CollectionType).
		SetNillablePaymentTerm(in.PaymentTerm).
		SetNillablePaymentTermDays(in.PaymentTermDays).
		SetNillableInvoiceCategory(in.InvoiceCategory).
		SetNillableSourceType(in.SourceType).
		SetNillableSourceID(in.SourceID).
		SetNillableSourceLineID(in.SourceLineID).
		SetIdempotencyKey(in.IdempotencyKey).
		SetOccurredAt(in.OccurredAt).
		SetOccurredAtSpecified(in.OccurredAtSpecified).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		if ent.IsConstraintError(err) {
			if rollbackErr := tx.sqlTx.Rollback(); rollbackErr != nil && !errors.Is(rollbackErr, stdsql.ErrTxDone) {
				r.log.WithContext(ctx).Warnf("rollback finance process command idempotency conflict failed err=%v", rollbackErr)
			}
			tx = nil
			if _, found, replayErr := findFinanceFactReplay(ctx, r.data.postgres, in); replayErr != nil {
				return nil, replayErr
			} else if found {
				return r.CreateFinanceFactDraftForProcessCommand(ctx, in, command, actorID)
			}
			if _, found, sourceErr := findActiveFinanceFactBySource(ctx, r.data.postgres, in); sourceErr != nil {
				return nil, sourceErr
			} else if found {
				return nil, biz.ErrFinanceFactSourceConflict
			}
		}
		return nil, err
	}
	out := entFinanceFactToBiz(row)
	if err := recordFinanceFactProcessCommandResultInTx(ctx, tx, out, command, actorID); err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *operationalFactRepo) recoverFinanceFactProcessCommandReplayInTx(
	ctx context.Context,
	tx *inventoryDBTx,
	in *biz.FinanceFactCreate,
	command *biz.ProcessDomainCommandInput,
	actorID int,
) (*biz.FinanceFact, bool, error) {
	replay, found, err := findFinanceFactReplay(ctx, tx.client, in)
	if err != nil || !found {
		return replay, found, err
	}
	if err := lockOperationalFactRow(ctx, tx, "finance_facts", replay.ID, biz.ErrFinanceFactNotFound); err != nil {
		return nil, true, err
	}
	locked, err := tx.client.FinanceFact.Get(ctx, replay.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, true, biz.ErrFinanceFactNotFound
		}
		return nil, true, err
	}
	if !financeFactMatchesCreate(locked, in) {
		return nil, true, biz.ErrIdempotencyConflict
	}
	if !financeFactCanRecoverAppliedProcessResult(locked.Status) {
		return nil, true, biz.ErrProcessDomainCommandRecoveryRequired
	}
	replay = entFinanceFactToBiz(locked)
	if err := recordFinanceFactProcessCommandResultInTx(ctx, tx, replay, command, actorID); err != nil {
		return nil, true, err
	}
	return replay, true, nil
}

func lockAndValidateFinanceFactShipmentSource(ctx context.Context, tx *inventoryDBTx, in *biz.FinanceFactCreate) error {
	if in == nil || (in.FactType != biz.FinanceFactReceivable && in.FactType != biz.FinanceFactInvoice) {
		return nil
	}
	if in.SourceType == nil && in.SourceID == nil {
		// Historical unlinked process-command recovery remains supported. New
		// source-linked commands are validated by the business usecase first.
		return nil
	}
	if in.SourceType == nil || *in.SourceType != biz.ShipmentSourceType || in.SourceID == nil || *in.SourceID <= 0 {
		return biz.ErrBadParam
	}
	if err := lockOperationalFactRow(ctx, tx, "shipments", *in.SourceID, biz.ErrShipmentNotFound); err != nil {
		return err
	}
	parent, err := tx.client.Shipment.Get(ctx, *in.SourceID)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrShipmentNotFound
		}
		return err
	}
	if parent.Status != biz.ShipmentStatusShipped || parent.CustomerID == nil || *parent.CustomerID <= 0 ||
		in.CounterpartyType != biz.FinanceCounterpartyCustomer || in.CounterpartyID == nil || *in.CounterpartyID != *parent.CustomerID {
		return biz.ErrBadParam
	}
	if in.SourceLineID != nil || in.Currency != biz.FinanceCurrencyCNY {
		return biz.ErrFinanceFactShipmentAmountInvalid
	}
	amount, err := shipmentFinanceAmountFromSnapshots(ctx, tx.client, parent.ID)
	if err != nil {
		return err
	}
	if !in.Amount.Equal(amount) {
		return biz.ErrFinanceFactShipmentAmountInvalid
	}
	return nil
}

func shipmentFinanceAmountFromSnapshots(ctx context.Context, client *ent.Client, shipmentID int) (decimal.Decimal, error) {
	items, err := client.ShipmentItem.Query().
		Where(shipmentitem.ShipmentID(shipmentID)).
		Order(ent.Asc(shipmentitem.FieldID)).
		All(ctx)
	if err != nil {
		return decimal.Zero, err
	}
	if len(items) == 0 {
		return decimal.Zero, biz.ErrFinanceFactShipmentAmountInvalid
	}
	amount := decimal.Zero
	for _, item := range items {
		if item.SalesOrderItemID == nil || item.AmountSnapshot == nil || !item.AmountSnapshot.GreaterThan(decimal.Zero) || item.CurrencySnapshot != biz.FinanceCurrencyCNY {
			return decimal.Zero, biz.ErrFinanceFactShipmentAmountInvalid
		}
		amount = amount.Add(*item.AmountSnapshot)
	}
	if !amount.GreaterThan(decimal.Zero) {
		return decimal.Zero, biz.ErrFinanceFactShipmentAmountInvalid
	}
	return amount, nil
}

func recordFinanceFactProcessCommandResultInTx(
	ctx context.Context,
	tx *inventoryDBTx,
	fact *biz.FinanceFact,
	command *biz.ProcessDomainCommandInput,
	actorID int,
) error {
	result, err := biz.FinanceReceivableLeadProcessCommandResult(fact)
	if err != nil {
		return err
	}
	return recordProcessDomainCommandResultInInventoryTx(ctx, tx, command, result, actorID)
}

// ValidateFinanceFactCreateReplay performs the read-only exact-key and
// recoverable-status check used before Process Runtime binds its command
// fingerprint. Creation still repeats both checks and owns the unique-key race.
func (r *operationalFactRepo) ValidateFinanceFactCreateReplay(ctx context.Context, in *biz.FinanceFactCreate) error {
	if r == nil || r.data == nil || r.data.postgres == nil || in == nil {
		return biz.ErrBadParam
	}
	replay, found, err := findFinanceFactReplay(ctx, r.data.postgres, in)
	if err != nil {
		return err
	}
	if found && !financeFactCanRecoverAppliedProcessResult(replay.Status) {
		return biz.ErrProcessDomainCommandRecoveryRequired
	}
	return nil
}

func (r *operationalFactRepo) PostFinanceFact(ctx context.Context, id int) (*biz.FinanceFact, error) {
	return r.changeFinanceFactStatus(ctx, id, biz.OperationalFactStatusPosted)
}

func (r *operationalFactRepo) SettleFinanceFact(ctx context.Context, id int) (*biz.FinanceFact, error) {
	return r.changeFinanceFactStatus(ctx, id, biz.OperationalFactStatusSettled)
}

func (r *operationalFactRepo) CancelPostedFinanceFact(ctx context.Context, id int, actorID int, reason string) (*biz.FinanceFact, error) {
	if id <= 0 || actorID <= 0 || reason == "" || len([]rune(reason)) > 255 {
		return nil, biz.ErrBadParam
	}
	return r.cancelPostedFinanceFact(ctx, id, actorID, reason)
}

func (r *operationalFactRepo) GetFinanceFact(ctx context.Context, id int) (*biz.FinanceFact, error) {
	if id <= 0 {
		return nil, biz.ErrBadParam
	}
	row, err := r.data.postgres.FinanceFact.Query().
		Where(financefact.ID(id)).
		WithCanceller().
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrFinanceFactNotFound
		}
		return nil, err
	}
	return entFinanceFactToBiz(row), nil
}

func (r *operationalFactRepo) ListFinanceFacts(ctx context.Context, filter biz.OperationalFactFilter) ([]*biz.FinanceFact, int, error) {
	return r.listFinanceFacts(ctx, filter, nil)
}

func (r *operationalFactRepo) ListFinanceFactsForAccess(
	ctx context.Context,
	filter biz.OperationalFactFilter,
	scope biz.FinanceFactAccessScope,
) ([]*biz.FinanceFact, int, error) {
	if scope.Empty() {
		return []*biz.FinanceFact{}, 0, nil
	}
	return r.listFinanceFacts(ctx, filter, &scope)
}

func (r *operationalFactRepo) listFinanceFacts(
	ctx context.Context,
	filter biz.OperationalFactFilter,
	scope *biz.FinanceFactAccessScope,
) ([]*biz.FinanceFact, int, error) {
	q := r.data.postgres.FinanceFact.Query()
	if scope != nil {
		q = q.Where(financefact.FactTypeIn(scope.AllowedTypes()...))
	}
	if filter.Status != "" {
		q = q.Where(financefact.Status(filter.Status))
	}
	if filter.FactType != "" {
		q = q.Where(financefact.FactType(filter.FactType))
	}
	if filter.CounterpartyID > 0 {
		q = q.Where(financefact.CounterpartyID(filter.CounterpartyID))
	}
	if filter.SourceType != "" {
		q = q.Where(financefact.SourceType(filter.SourceType))
	}
	if filter.SourceID > 0 {
		q = q.Where(financefact.SourceID(filter.SourceID))
	}
	if filter.Keyword != "" {
		q = q.Where(financefact.Or(
			financefact.FactNoContainsFold(filter.Keyword),
			financefact.FactTypeContainsFold(filter.Keyword),
			financefact.StatusContainsFold(filter.Keyword),
			financefact.CounterpartyTypeContainsFold(filter.Keyword),
			financefact.CurrencyContainsFold(filter.Keyword),
			financefact.CollectionTypeContainsFold(filter.Keyword),
			financefact.PaymentTermContainsFold(filter.Keyword),
			financefact.InvoiceCategoryContainsFold(filter.Keyword),
			financefact.SourceTypeContainsFold(filter.Keyword),
			financefact.IdempotencyKeyContainsFold(filter.Keyword),
			financefact.NoteContainsFold(filter.Keyword),
			financefact.IDEQ(parsePositiveIntOrZero(filter.Keyword)),
			financefact.CounterpartyIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			financefact.SourceIDEQ(parsePositiveIntOrZero(filter.Keyword)),
			financefact.SourceLineIDEQ(parsePositiveIntOrZero(filter.Keyword)),
		))
	}
	if filter.DateFrom != nil {
		q = q.Where(financefact.OccurredAtGTE(*filter.DateFrom))
	}
	if filter.DateTo != nil {
		q = q.Where(financefact.OccurredAtLTE(endOfDateFilter(*filter.DateTo)))
	}
	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.WithCanceller().Order(ent.Desc(financefact.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	references := make([]businessSourceReference, 0, len(rows))
	for _, row := range rows {
		references = append(references, businessSourceReference{sourceType: row.SourceType, sourceID: row.SourceID})
	}
	sourceNos, err := resolveBusinessSourceNos(ctx, r.data.postgres, references)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.FinanceFact, 0, len(rows))
	for _, row := range rows {
		item := entFinanceFactToBiz(row)
		item.SourceNo = businessSourceNo(sourceNos, row.SourceType, row.SourceID)
		out = append(out, item)
	}
	return out, total, nil
}

func (r *operationalFactRepo) postProductionFact(ctx context.Context, id int, cancel bool) (*biz.ProductionFact, error) {
	preview, err := r.data.postgres.ProductionFact.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionFactNotFound
		}
		return nil, err
	}
	if isProductionReworkLinkedFactRow(preview) {
		return r.postProductionReworkFact(ctx, id, cancel)
	}
	if isProductionOrderLinkedFactRow(preview) {
		return r.postProductionOrderLinkedFact(ctx, id, cancel)
	}
	if !cancel {
		return nil, biz.ErrProductionOrderFactSourceInvalid
	}
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

func (r *operationalFactRepo) postProductionReworkFact(ctx context.Context, id int, cancel bool) (*biz.ProductionFact, error) {
	preview, err := r.data.postgres.ProductionFact.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionFactNotFound
		}
		return nil, err
	}
	if !isProductionReworkLinkedFactRow(preview) {
		return nil, biz.ErrProductionReworkSourceInvalid
	}
	sourcePreview, err := r.data.postgres.ProductionFact.Get(ctx, *preview.SourceID)
	if err != nil {
		return nil, biz.ErrProductionReworkSourceInvalid
	}
	orderID, itemID, err := productionCompletionSourceCoordinates(sourcePreview)
	if err != nil {
		return nil, err
	}

	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "production_orders", orderID, biz.ErrProductionOrderNotFound); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_items", itemID, biz.ErrProductionOrderFactSourceInvalid); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_facts", sourcePreview.ID, biz.ErrProductionFactNotFound); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_facts", id, biz.ErrProductionFactNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.ProductionFact.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	reason := ""
	if row.Note != nil {
		reason = *row.Note
	}
	resolved, source, err := resolveProductionReworkMutation(ctx, tx.client, &biz.ProductionReworkFromCompletionCreate{
		FactNo: row.FactNo, SourceCompletionFactID: sourcePreview.ID, Quantity: row.Quantity,
		IdempotencyKey: row.IdempotencyKey, OccurredAt: row.OccurredAt, OccurredAtSpecified: row.OccurredAtSpecified,
		Reason: reason,
	}, !cancel)
	if err != nil {
		return nil, err
	}
	if !operationalFactMutationMatchesProduction(row, resolved) {
		return nil, biz.ErrProductionReworkSourceInvalid
	}
	if cancel {
		if row.Status == biz.OperationalFactStatusCancelled {
			return commitProductionFact(ctx, tx, row)
		}
		if row.Status == biz.OperationalFactStatusDraft {
			if err := updateOperationalFactStatus(ctx, tx, "production_facts", id, biz.OperationalFactStatusCancelled, "posted_at", nil); err != nil {
				return nil, err
			}
			row, err = tx.client.ProductionFact.Get(ctx, id)
			if err != nil {
				return nil, err
			}
			return commitProductionFact(ctx, tx, row)
		}
		if row.Status != biz.OperationalFactStatusPosted {
			return nil, biz.ErrBadParam
		}
		item, err := tx.client.ProductionOrderItem.Get(ctx, itemID)
		if err != nil {
			return nil, err
		}
		effective, err := productionOrderEffectiveCompletedQuantity(ctx, tx.client, item)
		if err != nil {
			return nil, err
		}
		if effective.Add(row.Quantity).GreaterThan(item.PlannedQuantity) {
			return nil, biz.ErrProductionOrderQuantityExceeded
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
		if err := validateProductionReworkQuantity(ctx, tx.client, source, row.Quantity, row.ID); err != nil {
			return nil, err
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

func (r *operationalFactRepo) postProductionOrderLinkedFact(ctx context.Context, id int, cancel bool) (*biz.ProductionFact, error) {
	preview, err := r.data.postgres.ProductionFact.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionFactNotFound
		}
		return nil, err
	}
	orderID, err := productionOrderSourceIDFromRow(preview)
	if err != nil {
		return nil, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "production_orders", orderID, biz.ErrProductionOrderNotFound); err != nil {
		return nil, err
	}
	if err := lockProductionOrderMaterialIssueSource(ctx, tx, preview, orderID); err != nil {
		return nil, err
	}
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
		switch row.FactType {
		case biz.ProductionFactFinishedGoodsReceipt:
			if _, err := validateProductionOrderFactRowSource(ctx, tx.client, row, false); err != nil {
				return nil, err
			}
			hasActiveRework, err := tx.client.ProductionFact.Query().Where(
				productionfact.FactType(biz.ProductionFactRework),
				productionfact.StatusNEQ(biz.OperationalFactStatusCancelled),
				productionfact.SourceType(biz.ProductionFactSourceType),
				productionfact.SourceID(row.ID),
			).Exist(ctx)
			if err != nil {
				return nil, err
			}
			if hasActiveRework {
				return nil, biz.ErrProductionReworkDependency
			}
		case biz.ProductionFactMaterialIssue:
			if _, err := validateProductionOrderMaterialIssueFactRowSource(ctx, tx.client, row, false); err != nil {
				return nil, err
			}
		default:
			return nil, biz.ErrProductionOrderFactSourceInvalid
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
		switch row.FactType {
		case biz.ProductionFactFinishedGoodsReceipt:
			item, err := validateProductionOrderFactRowSource(ctx, tx.client, row, true)
			if err != nil {
				return nil, err
			}
			if err := validateProductionOrderFinishedQuantity(ctx, tx.client, item, row.Quantity); err != nil {
				return nil, err
			}
		case biz.ProductionFactMaterialIssue:
			requirement, err := validateProductionOrderMaterialIssueFactRowSource(ctx, tx.client, row, true)
			if err != nil {
				return nil, err
			}
			if err := validateProductionOrderMaterialIssueQuantity(ctx, tx.client, requirement, row.Quantity); err != nil {
				return nil, err
			}
		default:
			return nil, biz.ErrProductionOrderFactSourceInvalid
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
	preview, err := r.data.postgres.OutsourcingFact.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrOutsourcingFactNotFound
		}
		return nil, err
	}
	if preview.SourceType == nil || *preview.SourceType != biz.OutsourcingOrderSourceType {
		if !cancel {
			return nil, biz.ErrOutsourcingOrderFactSourceInvalid
		}
		return r.postLegacyOutsourcingFact(ctx, id, cancel)
	}
	orderID, itemID, err := outsourcingOrderSourceIDsFromFact(preview)
	if err != nil {
		return nil, err
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_orders", orderID, biz.ErrOutsourcingOrderNotFound); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_order_items", itemID, biz.ErrOutsourcingOrderItemNotFound); err != nil {
		return nil, err
	}
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
	if row.SourceID == nil || *row.SourceID != orderID || row.SourceLineID == nil || *row.SourceLineID != itemID {
		return nil, biz.ErrOutsourcingOrderFactSourceInvalid
	}
	requireActive := !cancel && row.Status == biz.OperationalFactStatusDraft
	resolved, item, err := resolveOutsourcingOrderFactMutation(ctx, tx.client, row.FactType, outsourcingOrderFactCreateFromRow(row, orderID, itemID), requireActive)
	if err != nil {
		return nil, err
	}
	if !operationalFactMutationMatchesOutsourcing(row, resolved) {
		return nil, biz.ErrOutsourcingOrderFactSourceInvalid
	}
	if cancel {
		if row.Status == biz.OperationalFactStatusCancelled {
			return commitOutsourcingFact(ctx, tx, row)
		}
		if row.Status != biz.OperationalFactStatusPosted {
			return nil, biz.ErrBadParam
		}
		if row.FactType == biz.OutsourcingFactReturnReceipt {
			activeInspection, err := tx.client.QualityInspection.Query().Where(
				qualityinspection.SourceType(biz.QualityInspectionSourceOutsourcingFact),
				qualityinspection.SourceID(row.ID),
				qualityinspection.StatusNEQ(biz.QualityInspectionStatusCancelled),
			).Exist(ctx)
			if err != nil {
				return nil, err
			}
			if activeInspection {
				return nil, biz.ErrOutsourcingReturnQualityDependency
			}
			activePayable, err := hasActiveFinanceFactForSource(ctx, tx.client, biz.FinanceFactPayable, biz.OutsourcingFactSourceType, row.ID)
			if err != nil {
				return nil, err
			}
			if activePayable {
				return nil, biz.ErrOutsourcingReturnFinanceDependency
			}
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
		if err := validateOutsourcingOrderFactQuantity(ctx, tx.client, item, row.FactType, row.Quantity); err != nil {
			return nil, err
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

// postLegacyOutsourcingFact only reverses historical posted rows that predate
// source-driven creation. New source-less drafts fail closed before this path.
func (r *operationalFactRepo) postLegacyOutsourcingFact(ctx context.Context, id int, cancel bool) (*biz.OutsourcingFact, error) {
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

func outsourcingOrderSourceIDsFromFact(row *ent.OutsourcingFact) (int, int, error) {
	if row == nil || row.SourceType == nil || *row.SourceType != biz.OutsourcingOrderSourceType ||
		row.SourceID == nil || *row.SourceID <= 0 || row.SourceLineID == nil || *row.SourceLineID <= 0 {
		return 0, 0, biz.ErrOutsourcingOrderFactSourceInvalid
	}
	if row.FactType != biz.OutsourcingFactMaterialIssue && row.FactType != biz.OutsourcingFactReturnReceipt {
		return 0, 0, biz.ErrOutsourcingOrderFactSourceInvalid
	}
	return *row.SourceID, *row.SourceLineID, nil
}

func outsourcingOrderFactCreateFromRow(row *ent.OutsourcingFact, orderID, itemID int) *biz.OutsourcingFactFromOrderCreate {
	if row == nil {
		return nil
	}
	return &biz.OutsourcingFactFromOrderCreate{
		FactNo:                 row.FactNo,
		OutsourcingOrderID:     orderID,
		OutsourcingOrderItemID: itemID,
		WarehouseID:            row.WarehouseID,
		LotID:                  row.LotID,
		Quantity:               row.Quantity,
		IdempotencyKey:         row.IdempotencyKey,
		OccurredAt:             row.OccurredAt,
		OccurredAtSpecified:    row.OccurredAtSpecified,
		Note:                   row.Note,
	}
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
	if cancel {
		transition, ok := corestatus.CancelShippedShipment(parent.Status)
		if !ok {
			return nil, biz.ErrBadParam
		}
		if !transition.Changed {
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
			return commitShipment(ctx, tx, parent)
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
	if cancel {
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
	for lineID := range quantityBySourceLine {
		lineIDs = append(lineIDs, lineID)
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
		existing, err := tx.client.ShipmentItem.Query().
			Where(
				shipmentitem.SalesOrderItemID(lineID),
				shipmentitem.HasShipmentWith(shipment.Status(biz.ShipmentStatusShipped)),
			).
			All(ctx)
		if err != nil {
			return nil, err
		}
		shippedQuantity := decimal.Zero
		for _, row := range existing {
			shippedQuantity = shippedQuantity.Add(row.Quantity)
		}
		if shippedQuantity.Add(quantityBySourceLine[lineID]).GreaterThan(orderItem.OrderedQuantity) {
			return nil, biz.ErrShipmentQuantityExceeded
		}
		state.orderedByLine[lineID] = orderItem.OrderedQuantity
		state.shippedByLine[lineID] = shippedQuantity
		state.currentByLine[lineID] = quantityBySourceLine[lineID]
		state.sourceItemsByLine[lineID] = orderItem
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
		if row.Status == biz.OperationalFactStatusDraft {
			if err := validateFinanceFactTransitionSource(row); err != nil {
				return nil, err
			}
		}
	case biz.OperationalFactStatusSettled:
		if row.FactType != biz.FinanceFactReceivable && row.FactType != biz.FinanceFactPayable && row.FactType != biz.FinanceFactReconciliation {
			return nil, biz.ErrFinanceFactSettlementNotAllowed
		}
		if row.Status != biz.OperationalFactStatusPosted && row.Status != biz.OperationalFactStatusSettled {
			return nil, biz.ErrBadParam
		}
		if row.Status == biz.OperationalFactStatusPosted {
			if err := validateFinanceFactTransitionSource(row); err != nil {
				return nil, err
			}
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

func validateFinanceFactTransitionSource(row *ent.FinanceFact) error {
	if row == nil || row.SourceType == nil || row.SourceID == nil || *row.SourceID <= 0 {
		return biz.ErrFinanceFactSourceInvalid
	}
	switch row.FactType {
	case biz.FinanceFactReceivable, biz.FinanceFactInvoice:
		if *row.SourceType != biz.ShipmentSourceType {
			return biz.ErrFinanceFactSourceInvalid
		}
	case biz.FinanceFactPayable:
		if *row.SourceType != biz.PurchaseReceiptSourceType && *row.SourceType != biz.OutsourcingFactSourceType {
			return biz.ErrFinanceFactSourceInvalid
		}
	case biz.FinanceFactReconciliation:
		if *row.SourceType != biz.FinanceFactSourceType {
			return biz.ErrFinanceFactSourceInvalid
		}
	default:
		return biz.ErrFinanceFactSourceInvalid
	}
	return nil
}

func (r *operationalFactRepo) cancelPostedFinanceFact(ctx context.Context, id int, actorID int, reason string) (*biz.FinanceFact, error) {
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
	if row.Status == biz.OperationalFactStatusCancelled {
		if row.CancelledBy == nil || row.CancelReason == nil ||
			*row.CancelledBy != actorID || *row.CancelReason != reason {
			return nil, biz.ErrIdempotencyConflict
		}
	} else {
		if row.Status != biz.OperationalFactStatusPosted {
			return nil, biz.ErrBadParam
		}
		activeReconciliation, err := hasActiveFinanceFactForSource(ctx, tx.client, biz.FinanceFactReconciliation, biz.FinanceFactSourceType, row.ID)
		if err != nil {
			return nil, err
		}
		if activeReconciliation {
			return nil, biz.ErrFinanceReconciliationDependency
		}
		now := time.Now()
		if err := updateFinanceFactCancellation(ctx, tx, id, actorID, reason, now); err != nil {
			return nil, err
		}
		if err := markProcessDomainCommandEffectCompensatedWithClient(
			ctx,
			tx.client,
			biz.ProcessDomainCommandFinanceReceivableLead,
			"finance_fact",
			row.ID,
			reason,
			actorID,
		); err != nil {
			return nil, err
		}
	}
	row, err = tx.client.FinanceFact.Query().Where(financefact.ID(id)).WithCanceller().Only(ctx)
	if err != nil {
		return nil, err
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
		productSkuID: row.ProductSkuID,
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
		productSkuID: row.ProductSkuID,
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

func updateFinanceFactCancellation(ctx context.Context, tx *inventoryDBTx, id int, actorID int, reason string, cancelledAt time.Time) error {
	p := inventorySQLPlaceholders(tx.dialect, 6)
	query := fmt.Sprintf(`UPDATE finance_facts
SET status = %s, cancelled_at = %s, cancelled_by = %s, cancel_reason = %s,
    updated_at = %s
WHERE id = %s AND status = 'POSTED'`, p[0], p[1], p[2], p[3], p[4], p[5])
	result, err := tx.sqlTx.ExecContext(ctx, query, biz.OperationalFactStatusCancelled, cancelledAt, actorID, reason, time.Now(), id)
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

func commitProductionFact(ctx context.Context, tx *inventoryDBTx, row *ent.ProductionFact) (*biz.ProductionFact, error) {
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return entProductionFactToBiz(row), nil
}

func commitOutsourcingFact(ctx context.Context, tx *inventoryDBTx, row *ent.OutsourcingFact) (*biz.OutsourcingFact, error) {
	item, err := outsourcingFactWithSourceSKUProjection(ctx, tx.client, row)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return item, nil
}

func outsourcingFactWithSourceSKUProjection(ctx context.Context, client *ent.Client, row *ent.OutsourcingFact) (*biz.OutsourcingFact, error) {
	item := entOutsourcingFactToBiz(row)
	if item == nil {
		return nil, nil
	}
	if err := hydrateOutsourcingFactSourceSKUProjections(ctx, client, []*biz.OutsourcingFact{item}); err != nil {
		return nil, err
	}
	return item, nil
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
	return &biz.ProductionFact{ID: row.ID, FactNo: row.FactNo, FactType: row.FactType, Status: row.Status, SubjectType: row.SubjectType, SubjectID: row.SubjectID, ProductSkuID: row.ProductSkuID, WarehouseID: row.WarehouseID, UnitID: row.UnitID, LotID: row.LotID, Quantity: row.Quantity, SourceType: row.SourceType, SourceID: row.SourceID, SourceLineID: row.SourceLineID, IdempotencyKey: row.IdempotencyKey, OccurredAt: row.OccurredAt, PostedAt: row.PostedAt, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}

func entOutsourcingFactToBiz(row *ent.OutsourcingFact) *biz.OutsourcingFact {
	if row == nil {
		return nil
	}
	return &biz.OutsourcingFact{ID: row.ID, FactNo: row.FactNo, FactType: row.FactType, Status: row.Status, SubjectType: row.SubjectType, SubjectID: row.SubjectID, ProductSkuID: row.ProductSkuID, WarehouseID: row.WarehouseID, UnitID: row.UnitID, LotID: row.LotID, Quantity: row.Quantity, SupplierID: row.SupplierID, SupplierName: row.SupplierName, SourceType: row.SourceType, SourceID: row.SourceID, SourceLineID: row.SourceLineID, IdempotencyKey: row.IdempotencyKey, OccurredAt: row.OccurredAt, PostedAt: row.PostedAt, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
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

func entStockReservationToBiz(row *ent.StockReservation) *biz.StockReservation {
	if row == nil {
		return nil
	}
	return &biz.StockReservation{ID: row.ID, ReservationNo: row.ReservationNo, Status: row.Status, SalesOrderID: row.SalesOrderID, SalesOrderItemID: row.SalesOrderItemID, ProductID: row.ProductID, ProductSkuID: row.ProductSkuID, WarehouseID: row.WarehouseID, UnitID: row.UnitID, LotID: row.LotID, Quantity: row.Quantity, IdempotencyKey: row.IdempotencyKey, ReservedAt: row.ReservedAt, ReleasedAt: row.ReleasedAt, ConsumedAt: row.ConsumedAt, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}

func entFinanceFactToBiz(row *ent.FinanceFact) *biz.FinanceFact {
	if row == nil {
		return nil
	}
	var cancellerName *string
	if canceller, err := row.Edges.CancellerOrErr(); err == nil && canceller != nil {
		name := canceller.Username
		cancellerName = &name
	}
	return &biz.FinanceFact{ID: row.ID, FactNo: row.FactNo, FactType: row.FactType, Status: row.Status, CounterpartyType: row.CounterpartyType, CounterpartyID: row.CounterpartyID, Amount: row.Amount, FeeAmount: row.FeeAmount, Currency: row.Currency, CollectionType: row.CollectionType, PaymentTerm: row.PaymentTerm, PaymentTermDays: row.PaymentTermDays, InvoiceCategory: row.InvoiceCategory, SourceType: row.SourceType, SourceID: row.SourceID, SourceLineID: row.SourceLineID, IdempotencyKey: row.IdempotencyKey, OccurredAt: row.OccurredAt, PostedAt: row.PostedAt, SettledAt: row.SettledAt, CancelledAt: row.CancelledAt, CancelledBy: row.CancelledBy, CancelledByName: cancellerName, CancelReason: row.CancelReason, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}
