package data

import (
	"context"
	"errors"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/productionorderoperation"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/warehouse"

	"github.com/shopspring/decimal"
)

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
	if err := validateProductionWIPFinishedGoodsAvailability(ctx, r.data.postgres, item, decimal.Zero); err != nil {
		return nil, err
	}
	return entProductionOrderItemToBiz(item), nil
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
	if requireReleased {
		if err := validateProductionWIPFinishedGoodsAvailability(ctx, client, item, in.Quantity); err != nil {
			return nil, err
		}
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
	if err := validateProductionWIPFinishedGoodsAvailability(ctx, client, item, additional); err != nil {
		return err
	}
	return nil
}

// validateProductionWIPFinishedGoodsAvailability preserves the legacy
// completion path for route_code=NULL. Explicit route lines may create or post
// finished-goods facts only within the quantity already ACCEPTED by the frozen
// final packaging operation.
func validateProductionWIPFinishedGoodsAvailability(
	ctx context.Context,
	client *ent.Client,
	item *ent.ProductionOrderItem,
	additional decimal.Decimal,
) error {
	if client == nil || item == nil {
		return biz.ErrProductionOrderFactSourceInvalid
	}
	if item.RouteCode == nil {
		return nil
	}
	if strings.TrimSpace(*item.RouteCode) != biz.ProductionWIPRoutePlushSewHandV1 {
		return biz.ErrProductionWIPInvalidRoute
	}
	finalOperation, err := client.ProductionOrderOperation.Query().Where(
		productionorderoperation.ProductionOrderID(item.ProductionOrderID),
		productionorderoperation.ProductionOrderItemID(item.ID),
		productionorderoperation.RouteCode(biz.ProductionWIPRoutePlushSewHandV1),
		productionorderoperation.RouteVersion(biz.ProductionWIPRoutePlushSewHandV1Version),
		productionorderoperation.OperationCode(biz.ProductionWIPOperationPackaging),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrProductionWIPInvalidRoute
		}
		return err
	}
	acceptedRows, err := client.ProductionWIPBatch.Query().Where(
		productionwipbatch.ProductionOrderID(item.ProductionOrderID),
		productionwipbatch.ProductionOrderItemID(item.ID),
		productionwipbatch.ProductionOrderOperationID(finalOperation.ID),
		productionwipbatch.Status(biz.ProductionWIPStatusAccepted),
	).All(ctx)
	if err != nil {
		return err
	}
	accepted := decimal.Zero
	for _, row := range acceptedRows {
		accepted = accepted.Add(row.Quantity)
	}
	effective, err := productionOrderEffectiveCompletedQuantity(ctx, client, item)
	if err != nil {
		return err
	}
	if additional.IsNegative() {
		return biz.ErrProductionOrderFactSourceInvalid
	}
	if additional.IsZero() {
		if !accepted.GreaterThan(effective) {
			return biz.ErrProductionWIPInvalidTransition
		}
		return nil
	}
	if effective.Add(additional).GreaterThan(accepted) {
		return biz.ErrProductionWIPQuantityExceeded
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
	return r.postProductionFact(ctx, id, false, 0)
}

func (r *operationalFactRepo) CancelPostedProductionFact(ctx context.Context, id int) (*biz.ProductionFact, error) {
	return r.postProductionFact(ctx, id, true, 0)
}

func (r *operationalFactRepo) PostProductionFactWithActor(ctx context.Context, id int, actorID int) (*biz.ProductionFact, error) {
	if actorID <= 0 {
		return nil, biz.ErrBadParam
	}
	return r.postProductionFact(ctx, id, false, actorID)
}

func (r *operationalFactRepo) ProductionFactRequiresSourceTask(ctx context.Context, id int) (bool, error) {
	if id <= 0 {
		return false, biz.ErrBadParam
	}
	row, err := r.data.postgres.ProductionFact.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrProductionFactNotFound
		}
		return false, err
	}
	return isProductionReworkLinkedFactRow(row), nil
}

func (r *operationalFactRepo) CancelPostedProductionFactWithActor(ctx context.Context, id int, actorID int) (*biz.ProductionFact, error) {
	if actorID <= 0 {
		return nil, biz.ErrBadParam
	}
	return r.postProductionFact(ctx, id, true, actorID)
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

func (r *operationalFactRepo) postProductionFact(ctx context.Context, id int, cancel bool, actorID int) (*biz.ProductionFact, error) {
	preview, err := r.data.postgres.ProductionFact.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionFactNotFound
		}
		return nil, err
	}
	if isProductionReworkLinkedFactRow(preview) {
		return r.postProductionReworkFact(ctx, id, cancel, actorID)
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

func (r *operationalFactRepo) postProductionReworkFact(ctx context.Context, id int, cancel bool, actorID int) (*biz.ProductionFact, error) {
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
	item, err := tx.client.ProductionOrderItem.Get(ctx, itemID)
	if err != nil {
		return nil, err
	}
	task, state, err := buildProductionExceptionSourceTaskFromFact(ctx, tx.client, row)
	if err != nil {
		return nil, err
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
		currentTask, taskErr := getSourceWorkflowTaskWithClient(ctx, tx.client, task.TaskGroup, task.SourceID)
		if taskErr != nil {
			if errors.Is(taskErr, biz.ErrWorkflowTaskNotFound) {
				return nil, biz.ErrProductionExceptionTaskRequired
			}
			return nil, taskErr
		}
		if !workflowSourceTaskMatchesExpectedIntent(currentTask, task) {
			return nil, biz.ErrIdempotencyConflict
		}
		if err := lockOperationalFactRow(ctx, tx, "workflow_tasks", currentTask.ID, biz.ErrProductionExceptionTaskRequired); err != nil {
			return nil, err
		}
		currentTask, err = getSourceWorkflowTaskWithClient(ctx, tx.client, task.TaskGroup, task.SourceID)
		if err != nil {
			return nil, err
		}
		if currentTask.TaskStatusKey != "done" && currentTask.TaskStatusKey != "rejected" {
			return nil, biz.ErrProductionExceptionTaskActive
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
		if err := transitionSourceWorkflowProjection(
			ctx, tx.client, task, "cancelled", biz.ProductionRoleKey, actorID,
			"production_rework.cancel", map[string]any{
				"source_document_status": biz.OperationalFactStatusCancelled,
				"cancelled_at":           time.Now().UTC().Unix(),
			},
		); err != nil {
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
	if !cancel {
		if _, _, err := ensureSourceWorkflowTaskWithClient(ctx, tx.client, task, state, actorID); err != nil {
			return nil, err
		}
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
		if row.Status != biz.OperationalFactStatusDraft && row.Status != biz.OperationalFactStatusPosted {
			return nil, biz.ErrBadParam
		}
		switch row.FactType {
		case biz.ProductionFactFinishedGoodsReceipt:
			if _, err := validateProductionOrderFactRowSource(ctx, tx.client, row, false); err != nil {
				return nil, err
			}
			if row.Status == biz.OperationalFactStatusPosted {
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
			}
		case biz.ProductionFactMaterialIssue:
			if _, err := validateProductionOrderMaterialIssueFactRowSource(ctx, tx.client, row, false); err != nil {
				return nil, err
			}
		default:
			return nil, biz.ErrProductionOrderFactSourceInvalid
		}
		if row.Status == biz.OperationalFactStatusPosted {
			if err := r.applyProductionFactInventory(ctx, tx, row, true); err != nil {
				return nil, err
			}
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

func productionFactInventoryDirection(factType string) (int, string) {
	if factType == biz.ProductionFactFinishedGoodsReceipt {
		return 1, biz.InventoryTxnIn
	}
	return -1, biz.InventoryTxnOut
}

func commitProductionFact(ctx context.Context, tx *inventoryDBTx, row *ent.ProductionFact) (*biz.ProductionFact, error) {
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx.sqlTx = nil
	return entProductionFactToBiz(row), nil
}

func entProductionFactToBiz(row *ent.ProductionFact) *biz.ProductionFact {
	if row == nil {
		return nil
	}
	return &biz.ProductionFact{ID: row.ID, FactNo: row.FactNo, FactType: row.FactType, Status: row.Status, SubjectType: row.SubjectType, SubjectID: row.SubjectID, ProductSkuID: row.ProductSkuID, WarehouseID: row.WarehouseID, UnitID: row.UnitID, LotID: row.LotID, Quantity: row.Quantity, SourceType: row.SourceType, SourceID: row.SourceID, SourceLineID: row.SourceLineID, IdempotencyKey: row.IdempotencyKey, OccurredAt: row.OccurredAt, PostedAt: row.PostedAt, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}
