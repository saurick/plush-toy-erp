package data

import (
	"context"
	"crypto/sha256"
	stdsql "database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/productionexceptiondecision"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/productionorderoperation"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/productionwipevent"
	"server/internal/data/model/ent/productionwipoutsourcingallocation"
	"server/internal/data/model/ent/qualityinspection"
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
		sameOptionalInt(row.ProductionWipBatchID, in.ProductionWIPBatchID) &&
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
	if source.LotID == nil || source.ProductionWipBatchID == nil ||
		source.SubjectType != biz.InventorySubjectProduct || source.SubjectID <= 0 || source.WarehouseID <= 0 || source.UnitID <= 0 {
		return nil, nil, biz.ErrProductionReworkSourceInvalid
	}
	item, err := client.ProductionOrderItem.Get(ctx, itemID)
	if err != nil {
		return nil, nil, biz.ErrProductionReworkSourceInvalid
	}
	if _, err := resolveProductionCompletionWIPBatch(ctx, client, item, source.ProductionWipBatchID); err != nil {
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

func productionReworkWIPEventIdempotencyKey(factID int, action string) string {
	return fmt.Sprintf("production-rework:%d:wip-%s", factID, strings.ToLower(strings.TrimSpace(action)))
}

func productionReworkWIPEventIntentHash(
	action string,
	factID, batchID, actorID int,
	quantity decimal.Decimal,
	reason string,
) string {
	intent := fmt.Sprintf(
		"%s|%d|%d|%d|%s|%s",
		strings.ToUpper(strings.TrimSpace(action)),
		factID,
		batchID,
		actorID,
		quantity.String(),
		strings.TrimSpace(reason),
	)
	sum := sha256.Sum256([]byte(intent))
	return hex.EncodeToString(sum[:])
}

func loadProductionReworkRootWIP(
	ctx context.Context,
	client *ent.Client,
	factID int,
) (*ent.ProductionWIPBatch, error) {
	if client == nil || factID <= 0 {
		return nil, biz.ErrProductionReworkSourceInvalid
	}
	row, err := client.ProductionWIPBatch.Query().Where(
		productionwipbatch.OriginReworkFactID(factID),
		productionwipbatch.SourceBatchIDIsNil(),
	).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionReworkExecutionDependency
		}
		return nil, err
	}
	operation, err := client.ProductionOrderOperation.Get(ctx, row.ProductionOrderOperationID)
	if err != nil {
		return nil, biz.ErrProductionReworkExecutionDependency
	}
	if row.OriginReworkFactID == nil || *row.OriginReworkFactID != factID ||
		row.SourceBatchID != nil || row.FlowType != biz.ProductionWIPFlowRework ||
		row.ReworkReason == nil || strings.TrimSpace(*row.ReworkReason) == "" ||
		operation.ProductionOrderID != row.ProductionOrderID ||
		operation.ProductionOrderItemID != row.ProductionOrderItemID ||
		operation.RouteCode != biz.ProductionWIPRoutePlushSewHandV1 ||
		operation.RouteVersion != biz.ProductionWIPRoutePlushSewHandV1Version ||
		operation.OperationCode != biz.ProductionWIPOperationHandwork {
		return nil, biz.ErrProductionReworkExecutionDependency
	}
	return row, nil
}

func appendProductionReworkWIPEvent(
	ctx context.Context,
	client *ent.Client,
	root *ent.ProductionWIPBatch,
	factID, actorID int,
	action string,
	fromStatus *string,
	toStatus string,
	batchVersion int,
	reason string,
) error {
	if client == nil || root == nil || factID <= 0 || actorID <= 0 ||
		batchVersion <= 0 || !root.Quantity.GreaterThan(decimal.Zero) {
		return biz.ErrBadParam
	}
	aggregate, err := loadProductionWIPAggregate(ctx, client, root.ProductionOrderID)
	if err != nil {
		return err
	}
	result, err := productionWIPMutationResultMap(aggregate)
	if err != nil {
		return err
	}
	_, err = client.ProductionWIPEvent.Create().
		SetProductionWipBatchID(root.ID).
		SetActorID(actorID).
		SetAction(action).
		SetNillableFromStatus(fromStatus).
		SetToStatus(toStatus).
		SetBatchVersion(batchVersion).
		SetQuantity(root.Quantity).
		SetIdempotencyKey(productionReworkWIPEventIdempotencyKey(factID, action)).
		SetIntentHash(productionReworkWIPEventIntentHash(action, factID, root.ID, actorID, root.Quantity, reason)).
		SetResultContract(biz.ProductionWIPMutationResultV1).
		SetMutationResult(result).
		SetReason(strings.TrimSpace(reason)).
		Save(ctx)
	return err
}

func createProductionReworkRootWIP(
	ctx context.Context,
	tx *inventoryDBTx,
	row *ent.ProductionFact,
	orderID, itemID, actorID int,
	reason string,
) (*ent.ProductionWIPBatch, error) {
	if tx == nil || tx.client == nil || row == nil || orderID <= 0 || itemID <= 0 || actorID <= 0 ||
		strings.TrimSpace(reason) == "" {
		return nil, biz.ErrBadParam
	}
	operation, err := tx.client.ProductionOrderOperation.Query().Where(
		productionorderoperation.ProductionOrderID(orderID),
		productionorderoperation.ProductionOrderItemID(itemID),
		productionorderoperation.RouteCode(biz.ProductionWIPRoutePlushSewHandV1),
		productionorderoperation.RouteVersion(biz.ProductionWIPRoutePlushSewHandV1Version),
		productionorderoperation.OperationCode(biz.ProductionWIPOperationHandwork),
	).Only(ctx)
	if err != nil {
		return nil, biz.ErrProductionWIPInvalidRoute
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_operations", operation.ID, biz.ErrProductionWIPInvalidRoute); err != nil {
		return nil, err
	}
	if exists, err := tx.client.ProductionWIPBatch.Query().Where(
		productionwipbatch.OriginReworkFactID(row.ID),
		productionwipbatch.SourceBatchIDIsNil(),
	).Exist(ctx); err != nil {
		return nil, err
	} else if exists {
		return nil, biz.ErrIdempotencyConflict
	}
	root, err := tx.client.ProductionWIPBatch.Create().
		SetProductionOrderID(orderID).
		SetProductionOrderItemID(itemID).
		SetProductionOrderOperationID(operation.ID).
		SetOriginReworkFactID(row.ID).
		SetBatchNo(fmt.Sprintf("WIP-RW-%d", row.ID)).
		SetFlowType(biz.ProductionWIPFlowRework).
		SetStatus(biz.ProductionWIPStatusPlanned).
		SetVersion(1).
		SetQuantity(row.Quantity).
		SetReworkReason(strings.TrimSpace(reason)).
		SetCreatedBy(actorID).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if err := appendProductionReworkWIPEvent(
		ctx,
		tx.client,
		root,
		row.ID,
		actorID,
		biz.ProductionWIPActionRework,
		nil,
		biz.ProductionWIPStatusPlanned,
		root.Version,
		reason,
	); err != nil {
		return nil, err
	}
	return root, nil
}

func validateProductionReworkRootCreationReceipt(
	ctx context.Context,
	client *ent.Client,
	row *ent.ProductionFact,
) (*ent.ProductionWIPBatch, error) {
	if client == nil || row == nil || row.PostedBy == nil {
		return nil, biz.ErrProductionReworkExecutionDependency
	}
	root, err := loadProductionReworkRootWIP(ctx, client, row.ID)
	if err != nil {
		return nil, err
	}
	event, err := client.ProductionWIPEvent.Query().Where(
		productionwipevent.ProductionWipBatchID(root.ID),
		productionwipevent.Action(biz.ProductionWIPActionRework),
		productionwipevent.BatchVersion(1),
	).Only(ctx)
	if err != nil ||
		event.ActorID != *row.PostedBy ||
		event.FromStatus != nil ||
		event.ToStatus != biz.ProductionWIPStatusPlanned ||
		!event.Quantity.Equal(root.Quantity) ||
		event.IdempotencyKey != productionReworkWIPEventIdempotencyKey(row.ID, biz.ProductionWIPActionRework) ||
		event.IntentHash != productionReworkWIPEventIntentHash(biz.ProductionWIPActionRework, row.ID, root.ID, *row.PostedBy, root.Quantity, *root.ReworkReason) {
		return nil, biz.ErrProductionReworkExecutionDependency
	}
	return root, nil
}

func validateProductionReworkRootCancellable(
	ctx context.Context,
	client *ent.Client,
	row *ent.ProductionFact,
) (*ent.ProductionWIPBatch, error) {
	root, err := validateProductionReworkRootCreationReceipt(ctx, client, row)
	if err != nil {
		return nil, err
	}
	if root.Status != biz.ProductionWIPStatusPlanned || root.Version != 1 ||
		root.ExecutionMode != nil || root.StartedAt != nil || root.CompletedAt != nil {
		return nil, biz.ErrProductionReworkExecutionDependency
	}
	children, err := client.ProductionWIPBatch.Query().
		Where(productionwipbatch.SourceBatchID(root.ID)).
		Exist(ctx)
	if err != nil {
		return nil, err
	}
	inspections, err := client.QualityInspection.Query().
		Where(qualityinspection.ProductionWipBatchID(root.ID)).
		Exist(ctx)
	if err != nil {
		return nil, err
	}
	allocations, err := client.ProductionWIPOutsourcingAllocation.Query().
		Where(productionwipoutsourcingallocation.ProductionWipBatchID(root.ID)).
		Exist(ctx)
	if err != nil {
		return nil, err
	}
	completions, err := client.ProductionFact.Query().
		Where(productionfact.ProductionWipBatchID(root.ID)).
		Exist(ctx)
	if err != nil {
		return nil, err
	}
	if children || inspections || allocations || completions {
		return nil, biz.ErrProductionReworkExecutionDependency
	}
	return root, nil
}

func validateProductionReworkRootCancellationReceipt(
	ctx context.Context,
	client *ent.Client,
	row *ent.ProductionFact,
) error {
	if client == nil || row == nil || row.CancelledBy == nil || row.CancelReason == nil {
		return biz.ErrProductionReworkExecutionDependency
	}
	root, err := validateProductionReworkRootCreationReceipt(ctx, client, row)
	if err != nil {
		return err
	}
	if root.Status != biz.ProductionWIPStatusCancelled || root.Version != 2 {
		return biz.ErrProductionReworkExecutionDependency
	}
	event, err := client.ProductionWIPEvent.Query().Where(
		productionwipevent.ProductionWipBatchID(root.ID),
		productionwipevent.Action(biz.ProductionWIPEventActionCancel),
		productionwipevent.BatchVersion(2),
	).Only(ctx)
	if err != nil ||
		event.ActorID != *row.CancelledBy ||
		event.FromStatus == nil || *event.FromStatus != biz.ProductionWIPStatusPlanned ||
		event.ToStatus != biz.ProductionWIPStatusCancelled ||
		!event.Quantity.Equal(root.Quantity) ||
		event.IdempotencyKey != productionReworkWIPEventIdempotencyKey(row.ID, biz.ProductionWIPEventActionCancel) ||
		event.IntentHash != productionReworkWIPEventIntentHash(biz.ProductionWIPEventActionCancel, row.ID, root.ID, *row.CancelledBy, root.Quantity, *row.CancelReason) {
		return biz.ErrProductionReworkExecutionDependency
	}
	return nil
}

func cancelProductionReworkRootWIP(
	ctx context.Context,
	client *ent.Client,
	root *ent.ProductionWIPBatch,
	factID, actorID int,
	reason string,
) error {
	if client == nil || root == nil {
		return biz.ErrBadParam
	}
	affected, err := client.ProductionWIPBatch.Update().Where(
		productionwipbatch.ID(root.ID),
		productionwipbatch.Version(1),
		productionwipbatch.Status(biz.ProductionWIPStatusPlanned),
	).SetStatus(biz.ProductionWIPStatusCancelled).AddVersion(1).Save(ctx)
	if err != nil {
		return err
	}
	if affected != 1 {
		return biz.ErrProductionReworkExecutionDependency
	}
	updated, err := client.ProductionWIPBatch.Get(ctx, root.ID)
	if err != nil {
		return err
	}
	fromStatus := biz.ProductionWIPStatusPlanned
	return appendProductionReworkWIPEvent(
		ctx,
		client,
		updated,
		factID,
		actorID,
		biz.ProductionWIPEventActionCancel,
		&fromStatus,
		biz.ProductionWIPStatusCancelled,
		updated.Version,
		reason,
	)
}

func (r *operationalFactRepo) ListProductionOrderMaterialRequirements(ctx context.Context, productionOrderID int) ([]*biz.ProductionOrderMaterialRequirement, error) {
	if r == nil || r.data == nil || r.data.sqldb == nil || productionOrderID <= 0 {
		return nil, biz.ErrBadParam
	}
	sqlTx, err := r.data.sqldb.BeginTx(ctx, &stdsql.TxOptions{
		Isolation: stdsql.LevelRepeatableRead,
		ReadOnly:  true,
	})
	if err != nil {
		return nil, err
	}
	defer func() { _ = sqlTx.Rollback() }()
	client := productionWIPClientForSQLTx(r.data, sqlTx)
	if _, err := client.ProductionOrder.Get(ctx, productionOrderID); err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderNotFound
		}
		return nil, err
	}
	items, err := loadProductionOrderMaterialRequirements(ctx, client, productionOrderID)
	if err != nil {
		return nil, err
	}
	if err := sqlTx.Commit(); err != nil {
		return nil, err
	}
	return items, nil
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
		SetNillableProductionWipBatchID(in.ProductionWIPBatchID).
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

func validateProductionOrderFactSource(
	ctx context.Context,
	client *ent.Client,
	in *biz.OperationalFactMutation,
	requireActive bool,
	excludeFactID int,
) (*ent.ProductionOrderItem, error) {
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
	batch, err := resolveProductionCompletionWIPBatch(ctx, client, item, in.ProductionWIPBatchID)
	if err != nil {
		return nil, err
	}
	if requireActive {
		if item.RouteCode == nil {
			if orderRow.Status != biz.ProductionOrderStatusReleased {
				return nil, biz.ErrProductionOrderInvalidState
			}
		} else if orderRow.Status != biz.ProductionOrderStatusReleased &&
			(orderRow.Status != biz.ProductionOrderStatusClosed || batch == nil || batch.OriginReworkFactID == nil) {
			return nil, biz.ErrProductionOrderInvalidState
		}
		if err := validateProductionWIPFinishedGoodsAvailability(ctx, client, item, batch, in.Quantity, excludeFactID); err != nil {
			return nil, err
		}
	}
	return item, nil
}

func validateProductionOrderFactRowSource(
	ctx context.Context,
	client *ent.Client,
	row *ent.ProductionFact,
	requireActive bool,
) (*ent.ProductionOrderItem, error) {
	if row == nil {
		return nil, biz.ErrProductionOrderFactSourceInvalid
	}
	return validateProductionOrderFactSource(ctx, client, &biz.OperationalFactMutation{
		FactType: row.FactType, SubjectType: row.SubjectType, SubjectID: row.SubjectID,
		ProductSkuID: row.ProductSkuID, UnitID: row.UnitID, SourceType: row.SourceType,
		SourceID: row.SourceID, SourceLineID: row.SourceLineID, ProductionWIPBatchID: row.ProductionWipBatchID,
		Quantity: row.Quantity,
	}, requireActive, row.ID)
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

func resolveProductionCompletionWIPBatch(
	ctx context.Context,
	client *ent.Client,
	item *ent.ProductionOrderItem,
	batchID *int,
) (*ent.ProductionWIPBatch, error) {
	if client == nil || item == nil {
		return nil, biz.ErrProductionOrderFactSourceInvalid
	}
	if item.RouteCode == nil {
		if batchID != nil {
			return nil, biz.ErrProductionOrderFactSourceInvalid
		}
		return nil, nil
	}
	if strings.TrimSpace(*item.RouteCode) != biz.ProductionWIPRoutePlushSewHandV1 {
		return nil, biz.ErrProductionWIPInvalidRoute
	}
	if batchID == nil || *batchID <= 0 {
		return nil, biz.ErrProductionOrderFactSourceInvalid
	}
	batch, err := client.ProductionWIPBatch.Get(ctx, *batchID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionOrderFactSourceInvalid
		}
		return nil, err
	}
	operation, err := client.ProductionOrderOperation.Get(ctx, batch.ProductionOrderOperationID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionWIPInvalidRoute
		}
		return nil, err
	}
	if batch.ProductionOrderID != item.ProductionOrderID ||
		batch.ProductionOrderItemID != item.ID ||
		batch.Status != biz.ProductionWIPStatusAccepted ||
		operation.ProductionOrderID != item.ProductionOrderID ||
		operation.ProductionOrderItemID != item.ID ||
		operation.RouteCode != biz.ProductionWIPRoutePlushSewHandV1 ||
		operation.RouteVersion != biz.ProductionWIPRoutePlushSewHandV1Version ||
		operation.OperationCode != biz.ProductionWIPOperationPackaging {
		return nil, biz.ErrProductionWIPInvalidTransition
	}
	if batch.OriginReworkFactID != nil {
		if err := validateProductionReworkOriginForBatch(ctx, client, batch); err != nil {
			return nil, err
		}
	}
	return batch, nil
}

func validateProductionReworkOriginForBatch(ctx context.Context, client *ent.Client, batch *ent.ProductionWIPBatch) error {
	if client == nil || batch == nil || batch.OriginReworkFactID == nil || *batch.OriginReworkFactID <= 0 {
		return biz.ErrProductionReworkSourceInvalid
	}
	origin, err := client.ProductionFact.Get(ctx, *batch.OriginReworkFactID)
	if err != nil {
		return biz.ErrProductionReworkSourceInvalid
	}
	if origin.FactType != biz.ProductionFactRework || origin.Status != biz.OperationalFactStatusPosted ||
		origin.SourceType == nil || *origin.SourceType != biz.ProductionFactSourceType ||
		origin.SourceID == nil || *origin.SourceID <= 0 {
		return biz.ErrProductionReworkSourceInvalid
	}
	source, err := client.ProductionFact.Get(ctx, *origin.SourceID)
	if err != nil {
		return biz.ErrProductionReworkSourceInvalid
	}
	orderID, itemID, err := productionCompletionSourceCoordinates(source)
	if err != nil || orderID != batch.ProductionOrderID || itemID != batch.ProductionOrderItemID {
		return biz.ErrProductionReworkSourceInvalid
	}
	return nil
}

// validateProductionWIPFinishedGoodsAvailability keeps legacy route-less
// completions independent from WIP. Explicit routes reserve capacity on one
// accepted packaging batch; DRAFT and POSTED facts both consume that batch.
func validateProductionWIPFinishedGoodsAvailability(
	ctx context.Context,
	client *ent.Client,
	item *ent.ProductionOrderItem,
	batch *ent.ProductionWIPBatch,
	additional decimal.Decimal,
	excludeFactID int,
) error {
	if client == nil || item == nil {
		return biz.ErrProductionOrderFactSourceInvalid
	}
	if item.RouteCode == nil {
		if batch != nil {
			return biz.ErrProductionOrderFactSourceInvalid
		}
		return nil
	}
	if batch == nil || additional.IsNegative() {
		return biz.ErrProductionOrderFactSourceInvalid
	}
	query := client.ProductionFact.Query().Where(
		productionfact.ProductionWipBatchID(batch.ID),
		productionfact.FactType(biz.ProductionFactFinishedGoodsReceipt),
		productionfact.StatusIn(biz.OperationalFactStatusDraft, biz.OperationalFactStatusPosted),
	)
	if excludeFactID > 0 {
		query = query.Where(productionfact.IDNEQ(excludeFactID))
	}
	rows, err := query.All(ctx)
	if err != nil {
		return err
	}
	reserved := additional
	for _, row := range rows {
		orderID, itemID, err := productionCompletionSourceCoordinates(row)
		if err != nil || orderID != item.ProductionOrderID || itemID != item.ID {
			return biz.ErrProductionOrderFactSourceInvalid
		}
		reserved = reserved.Add(row.Quantity)
	}
	if reserved.GreaterThan(batch.Quantity) {
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
	allowancePredicates := append(
		activeProductionOverIssuePredicates(),
		productionexceptiondecision.ProductionMaterialRequirementID(requirement.ID),
	)
	approvedRows, err := client.ProductionExceptionDecision.Query().
		Where(allowancePredicates...).
		All(ctx)
	if err != nil {
		return err
	}
	approved := decimal.Zero
	for _, row := range approvedRows {
		if row.ProductionOrderID != requirement.ProductionOrderID || row.ProductionOrderItemID != requirement.ProductionOrderItemID || row.ApprovedQuantity == nil {
			return biz.ErrProductionExceptionSourceInvalid
		}
		approved = approved.Add(*row.ApprovedQuantity)
	}
	if issued.Add(additional).GreaterThan(requirement.PlannedQuantity.Add(approved)) {
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

func lockProductionOrderCompletionSource(
	ctx context.Context,
	tx *inventoryDBTx,
	factType string,
	sourceLineID, productionWIPBatchID *int,
) error {
	if factType != biz.ProductionFactFinishedGoodsReceipt {
		return nil
	}
	if sourceLineID == nil || *sourceLineID <= 0 {
		return biz.ErrProductionOrderFactSourceInvalid
	}
	if err := lockOperationalFactRow(ctx, tx, "production_order_items", *sourceLineID, biz.ErrProductionOrderFactSourceInvalid); err != nil {
		return err
	}
	if productionWIPBatchID == nil {
		return nil
	}
	return lockOperationalFactRow(ctx, tx, "production_wip_batches", *productionWIPBatchID, biz.ErrProductionOrderFactSourceInvalid)
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
	if err := lockProductionOrderCompletionSource(ctx, tx, in.FactType, in.SourceLineID, in.ProductionWIPBatchID); err != nil {
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
	if _, err := validateProductionOrderFactSource(ctx, tx.client, in, true, 0); err != nil {
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

func (r *operationalFactRepo) PostProductionFact(ctx context.Context, in *biz.OperationalFactStatusMutation) (*biz.ProductionFact, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 || in.Reason != "" {
		return nil, biz.ErrBadParam
	}
	return r.postProductionFact(ctx, in, false)
}

func (r *operationalFactRepo) CancelPostedProductionFact(ctx context.Context, in *biz.OperationalFactStatusMutation) (*biz.ProductionFact, error) {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 ||
		in.Reason == "" || len([]rune(in.Reason)) > 255 {
		return nil, biz.ErrBadParam
	}
	return r.postProductionFact(ctx, in, true)
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
	rows, err := q.WithPoster().WithCanceller().Order(ent.Desc(productionfact.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
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
	reworkSourceIDs := make([]int, 0)
	for _, row := range rows {
		if isProductionReworkLinkedFactRow(row) {
			reworkSourceIDs = append(reworkSourceIDs, *row.SourceID)
		}
	}
	reworkSourceByID := make(map[int]*ent.ProductionFact, len(reworkSourceIDs))
	if len(reworkSourceIDs) > 0 {
		sourceRows, err := r.data.postgres.ProductionFact.Query().
			Where(productionfact.IDIn(reworkSourceIDs...)).
			All(ctx)
		if err != nil {
			return nil, 0, err
		}
		for _, source := range sourceRows {
			reworkSourceByID[source.ID] = source
		}
	}
	out := make([]*biz.ProductionFact, 0, len(rows))
	for _, row := range rows {
		item := entProductionFactToBiz(row)
		item.SourceNo = businessSourceNo(sourceNos, row.SourceType, row.SourceID)
		source := row
		if isProductionReworkLinkedFactRow(row) {
			source = reworkSourceByID[*row.SourceID]
		}
		if source != nil && source.FactType == biz.ProductionFactFinishedGoodsReceipt &&
			source.SourceType != nil && *source.SourceType == biz.ProductionOrderSourceType &&
			source.SourceID != nil && *source.SourceID > 0 &&
			source.SourceLineID != nil && *source.SourceLineID > 0 {
			orderID := *source.SourceID
			orderItemID := *source.SourceLineID
			item.ProductionOrderID = &orderID
			item.ProductionOrderItemID = &orderItemID
		}
		out = append(out, item)
	}
	return out, total, nil
}

func (r *operationalFactRepo) postProductionFact(ctx context.Context, in *biz.OperationalFactStatusMutation, cancel bool) (*biz.ProductionFact, error) {
	preview, err := r.data.postgres.ProductionFact.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionFactNotFound
		}
		return nil, err
	}
	if isProductionReworkLinkedFactRow(preview) {
		return r.postProductionReworkFact(ctx, in, cancel)
	}
	if isProductionOrderLinkedFactRow(preview) {
		return r.postProductionOrderLinkedFact(ctx, in, cancel)
	}
	if !cancel {
		return nil, biz.ErrProductionOrderFactSourceInvalid
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if err := lockOperationalFactRow(ctx, tx, "production_facts", in.ID, biz.ErrProductionFactNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.ProductionFact.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionFactNotFound
		}
		return nil, err
	}
	if cancel {
		replay, err := versionedOperationalFactCancellationReplay(
			row.Status,
			row.Version,
			row.CancelledBy,
			row.CancelReason,
			in,
		)
		if err != nil {
			return nil, err
		}
		if replay {
			return commitProductionFact(ctx, tx, row)
		}
		if row.Status != biz.OperationalFactStatusPosted {
			return nil, biz.ErrBadParam
		}
		if err := r.applyProductionFactInventory(ctx, tx, row, in, true); err != nil {
			return nil, err
		}
		if err := updateVersionedOperationalFactCancellation(
			ctx, tx, "production_facts", in.ID, in.ExpectedVersion, row.Status,
			in.ActorID, in.Reason, time.Now(),
		); err != nil {
			return nil, err
		}
	} else {
		replay, err := versionedOperationalFactTransitionReplay(
			row.Status,
			row.Version,
			in.ExpectedVersion,
			biz.OperationalFactStatusPosted,
			row.PostedBy,
			in.ActorID,
		)
		if err != nil {
			return nil, err
		}
		if replay {
			return commitProductionFact(ctx, tx, row)
		}
		if row.Status != biz.OperationalFactStatusDraft {
			return nil, biz.ErrBadParam
		}
		if err := r.applyProductionFactInventory(ctx, tx, row, in, false); err != nil {
			return nil, err
		}
		now := time.Now()
		if err := updateVersionedOperationalFactStatus(
			ctx, tx, "production_facts", in.ID, in.ExpectedVersion,
			biz.OperationalFactStatusDraft, biz.OperationalFactStatusPosted, "posted_at", now,
			"posted_by", in.ActorID,
		); err != nil {
			return nil, err
		}
	}
	row, err = tx.client.ProductionFact.Query().Where(productionfact.ID(in.ID)).WithPoster().WithCanceller().Only(ctx)
	if err != nil {
		return nil, err
	}
	return commitProductionFact(ctx, tx, row)
}

func (r *operationalFactRepo) postProductionReworkFact(ctx context.Context, in *biz.OperationalFactStatusMutation, cancel bool) (*biz.ProductionFact, error) {
	preview, err := r.data.postgres.ProductionFact.Get(ctx, in.ID)
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
	if sourcePreview.ProductionWipBatchID == nil {
		return nil, biz.ErrProductionReworkSourceInvalid
	}
	if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", *sourcePreview.ProductionWipBatchID, biz.ErrProductionReworkSourceInvalid); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_facts", sourcePreview.ID, biz.ErrProductionFactNotFound); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_facts", in.ID, biz.ErrProductionFactNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.ProductionFact.Get(ctx, in.ID)
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
		replay, err := versionedOperationalFactCancellationReplay(
			row.Status,
			row.Version,
			row.CancelledBy,
			row.CancelReason,
			in,
		)
		if err != nil {
			return nil, err
		}
		if replay {
			if err := validateProductionReworkRootCancellationReceipt(ctx, tx.client, row); err != nil {
				return nil, err
			}
			currentTask, taskErr := getSourceWorkflowTaskWithClient(ctx, tx.client, task.TaskGroup, task.SourceID)
			if taskErr != nil || !workflowSourceTaskMatchesExpectedIntent(currentTask, task) {
				return nil, biz.ErrProductionReworkExecutionDependency
			}
			return commitProductionFact(ctx, tx, row)
		}
		if row.Status == biz.OperationalFactStatusDraft {
			hasRoot, err := tx.client.ProductionWIPBatch.Query().Where(
				productionwipbatch.OriginReworkFactID(row.ID),
				productionwipbatch.SourceBatchIDIsNil(),
			).Exist(ctx)
			if err != nil {
				return nil, err
			}
			if hasRoot {
				return nil, biz.ErrProductionReworkExecutionDependency
			}
			if err := updateVersionedOperationalFactCancellation(
				ctx, tx, "production_facts", in.ID, in.ExpectedVersion,
				row.Status, in.ActorID, in.Reason, time.Now(),
			); err != nil {
				return nil, err
			}
			row, err = tx.client.ProductionFact.Query().Where(productionfact.ID(in.ID)).WithPoster().WithCanceller().Only(ctx)
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
		rootPreview, err := loadProductionReworkRootWIP(ctx, tx.client, row.ID)
		if err != nil {
			return nil, err
		}
		if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", rootPreview.ID, biz.ErrProductionReworkExecutionDependency); err != nil {
			return nil, err
		}
		root, err := validateProductionReworkRootCancellable(ctx, tx.client, row)
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
		if err := cancelProductionReworkRootWIP(ctx, tx.client, root, row.ID, in.ActorID, in.Reason); err != nil {
			return nil, err
		}
		if err := r.applyProductionFactInventory(ctx, tx, row, in, true); err != nil {
			return nil, err
		}
		cancelledAt := time.Now()
		if err := updateVersionedOperationalFactCancellation(
			ctx, tx, "production_facts", in.ID, in.ExpectedVersion,
			row.Status, in.ActorID, in.Reason, cancelledAt,
		); err != nil {
			return nil, err
		}
		if err := transitionSourceWorkflowProjection(
			ctx, tx.client, task, "cancelled", biz.ProductionRoleKey, in.ActorID,
			"production_rework.cancel", map[string]any{
				"source_document_status": biz.OperationalFactStatusCancelled,
				"cancelled_at":           cancelledAt.UTC().Unix(),
				"cancel_reason":          in.Reason,
			},
		); err != nil {
			return nil, err
		}
	} else {
		replay, err := versionedOperationalFactTransitionReplay(
			row.Status,
			row.Version,
			in.ExpectedVersion,
			biz.OperationalFactStatusPosted,
			row.PostedBy,
			in.ActorID,
		)
		if err != nil {
			return nil, err
		}
		if replay {
			if _, err := validateProductionReworkRootCreationReceipt(ctx, tx.client, row); err != nil {
				return nil, err
			}
			currentTask, taskErr := getSourceWorkflowTaskWithClient(ctx, tx.client, task.TaskGroup, task.SourceID)
			if taskErr != nil || !workflowSourceTaskMatchesExpectedIntent(currentTask, task) {
				return nil, biz.ErrProductionReworkExecutionDependency
			}
			return commitProductionFact(ctx, tx, row)
		}
		if row.Status != biz.OperationalFactStatusDraft {
			return nil, biz.ErrBadParam
		}
		if err := validateProductionReworkQuantity(ctx, tx.client, source, row.Quantity, row.ID); err != nil {
			return nil, err
		}
		if err := r.applyProductionFactInventory(ctx, tx, row, in, false); err != nil {
			return nil, err
		}
		now := time.Now()
		if err := updateVersionedOperationalFactStatus(
			ctx, tx, "production_facts", in.ID, in.ExpectedVersion,
			biz.OperationalFactStatusDraft, biz.OperationalFactStatusPosted, "posted_at", now,
			"posted_by", in.ActorID,
		); err != nil {
			return nil, err
		}
		if _, err := createProductionReworkRootWIP(ctx, tx, row, orderID, itemID, in.ActorID, reason); err != nil {
			return nil, err
		}
	}
	row, err = tx.client.ProductionFact.Query().Where(productionfact.ID(in.ID)).WithPoster().WithCanceller().Only(ctx)
	if err != nil {
		return nil, err
	}
	if !cancel {
		if _, _, err := ensureSourceWorkflowTaskWithClient(ctx, tx.client, task, state, in.ActorID); err != nil {
			return nil, err
		}
	}
	return commitProductionFact(ctx, tx, row)
}

func (r *operationalFactRepo) postProductionOrderLinkedFact(ctx context.Context, in *biz.OperationalFactStatusMutation, cancel bool) (*biz.ProductionFact, error) {
	preview, err := r.data.postgres.ProductionFact.Get(ctx, in.ID)
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
	if err := lockProductionOrderCompletionSource(ctx, tx, preview.FactType, preview.SourceLineID, preview.ProductionWipBatchID); err != nil {
		return nil, err
	}
	if err := lockOperationalFactRow(ctx, tx, "production_facts", in.ID, biz.ErrProductionFactNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.ProductionFact.Get(ctx, in.ID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductionFactNotFound
		}
		return nil, err
	}
	if cancel {
		replay, err := versionedOperationalFactCancellationReplay(
			row.Status,
			row.Version,
			row.CancelledBy,
			row.CancelReason,
			in,
		)
		if err != nil {
			return nil, err
		}
		if replay {
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
			if err := r.applyProductionFactInventory(ctx, tx, row, in, true); err != nil {
				return nil, err
			}
		}
		if err := updateVersionedOperationalFactCancellation(
			ctx, tx, "production_facts", in.ID, in.ExpectedVersion,
			row.Status, in.ActorID, in.Reason, time.Now(),
		); err != nil {
			return nil, err
		}
	} else {
		replay, err := versionedOperationalFactTransitionReplay(
			row.Status,
			row.Version,
			in.ExpectedVersion,
			biz.OperationalFactStatusPosted,
			row.PostedBy,
			in.ActorID,
		)
		if err != nil {
			return nil, err
		}
		if replay {
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
		if err := r.applyProductionFactInventory(ctx, tx, row, in, false); err != nil {
			return nil, err
		}
		now := time.Now()
		if err := updateVersionedOperationalFactStatus(
			ctx, tx, "production_facts", in.ID, in.ExpectedVersion,
			biz.OperationalFactStatusDraft, biz.OperationalFactStatusPosted, "posted_at", now,
			"posted_by", in.ActorID,
		); err != nil {
			return nil, err
		}
	}
	row, err = tx.client.ProductionFact.Query().Where(productionfact.ID(in.ID)).WithPoster().WithCanceller().Only(ctx)
	if err != nil {
		return nil, err
	}
	return commitProductionFact(ctx, tx, row)
}

func (r *operationalFactRepo) applyProductionFactInventory(ctx context.Context, tx *inventoryDBTx, row *ent.ProductionFact, in *biz.OperationalFactStatusMutation, cancel bool) error {
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
		actorID:      in.ActorID,
		reason:       in.Reason,
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
	var cancellerName *string
	var posterName *string
	if poster, err := row.Edges.PosterOrErr(); err == nil && poster != nil {
		name := poster.Username
		posterName = &name
	}
	if canceller, err := row.Edges.CancellerOrErr(); err == nil && canceller != nil {
		name := canceller.Username
		cancellerName = &name
	}
	return &biz.ProductionFact{ID: row.ID, FactNo: row.FactNo, FactType: row.FactType, Status: row.Status, Version: row.Version, SubjectType: row.SubjectType, SubjectID: row.SubjectID, ProductSkuID: row.ProductSkuID, WarehouseID: row.WarehouseID, UnitID: row.UnitID, LotID: row.LotID, Quantity: row.Quantity, SourceType: row.SourceType, SourceID: row.SourceID, SourceLineID: row.SourceLineID, ProductionWIPBatchID: row.ProductionWipBatchID, IdempotencyKey: row.IdempotencyKey, OccurredAt: row.OccurredAt, PostedAt: row.PostedAt, PostedBy: row.PostedBy, PostedByName: posterName, CancelledAt: row.CancelledAt, CancelledBy: row.CancelledBy, CancelledByName: cancellerName, CancelReason: row.CancelReason, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}
