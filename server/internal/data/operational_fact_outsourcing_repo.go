package data

import (
	"context"
	"sort"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productionwipoutsourcingallocation"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/data/model/ent/supplier"
	"server/internal/data/model/ent/unit"
	"server/internal/data/model/ent/warehouse"

	"github.com/shopspring/decimal"
)

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
	var dependencyBatchID int
	if cancel && preview.FactType == biz.OutsourcingFactMaterialIssue {
		allocation, allocationErr := r.data.postgres.ProductionWIPOutsourcingAllocation.Query().Where(
			productionwipoutsourcingallocation.OutsourcingOrderItemID(itemID),
			productionwipoutsourcingallocation.SubjectType(biz.OutsourcingOrderSubjectMaterial),
		).Only(ctx)
		if allocationErr != nil && !ent.IsNotFound(allocationErr) {
			return nil, allocationErr
		}
		if allocationErr == nil {
			dependencyBatchID = allocation.ProductionWipBatchID
		}
	}
	tx, err := r.inv.beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	if dependencyBatchID > 0 {
		if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", dependencyBatchID, biz.ErrProductionWIPOutsourcingSourceDependency); err != nil {
			return nil, err
		}
	}
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
		if row.Status != biz.OperationalFactStatusDraft && row.Status != biz.OperationalFactStatusPosted {
			return nil, biz.ErrBadParam
		}
		if row.FactType == biz.OutsourcingFactMaterialIssue && row.Status == biz.OperationalFactStatusPosted && dependencyBatchID > 0 {
			allocation, err := tx.client.ProductionWIPOutsourcingAllocation.Query().Where(
				productionwipoutsourcingallocation.OutsourcingOrderItemID(itemID),
				productionwipoutsourcingallocation.ProductionWipBatchID(dependencyBatchID),
				productionwipoutsourcingallocation.SubjectType(biz.OutsourcingOrderSubjectMaterial),
			).Only(ctx)
			if err != nil {
				if ent.IsNotFound(err) {
					return nil, biz.ErrProductionWIPOutsourcingSourceDependency
				}
				return nil, err
			}
			batch, err := tx.client.ProductionWIPBatch.Get(ctx, dependencyBatchID)
			if err != nil {
				return nil, err
			}
			if batch.Status != biz.ProductionWIPStatusPlanned {
				remainingFacts, err := tx.client.OutsourcingFact.Query().Where(
					outsourcingfact.SourceType(biz.OutsourcingOrderSourceType),
					outsourcingfact.SourceID(orderID),
					outsourcingfact.SourceLineID(itemID),
					outsourcingfact.FactType(biz.OutsourcingFactMaterialIssue),
					outsourcingfact.Status(biz.OperationalFactStatusPosted),
					outsourcingfact.IDNEQ(row.ID),
				).All(ctx)
				if err != nil {
					return nil, err
				}
				remaining := decimal.Zero
				for _, fact := range remainingFacts {
					remaining = remaining.Add(fact.Quantity)
				}
				if remaining.LessThan(allocation.AllocatedQuantity) {
					return nil, biz.ErrProductionWIPOutsourcingSourceDependency
				}
			}
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
		if row.Status == biz.OperationalFactStatusPosted {
			if err := r.applyOutsourcingFactInventory(ctx, tx, row, true); err != nil {
				return nil, err
			}
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

func outsourcingFactInventoryDirection(factType string) (int, string) {
	if factType == biz.OutsourcingFactReturnReceipt {
		return 1, biz.InventoryTxnIn
	}
	return -1, biz.InventoryTxnOut
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

func entOutsourcingFactToBiz(row *ent.OutsourcingFact) *biz.OutsourcingFact {
	if row == nil {
		return nil
	}
	return &biz.OutsourcingFact{ID: row.ID, FactNo: row.FactNo, FactType: row.FactType, Status: row.Status, SubjectType: row.SubjectType, SubjectID: row.SubjectID, ProductSkuID: row.ProductSkuID, WarehouseID: row.WarehouseID, UnitID: row.UnitID, LotID: row.LotID, Quantity: row.Quantity, SupplierID: row.SupplierID, SupplierName: row.SupplierName, SourceType: row.SourceType, SourceID: row.SourceID, SourceLineID: row.SourceLineID, IdempotencyKey: row.IdempotencyKey, OccurredAt: row.OccurredAt, PostedAt: row.PostedAt, Note: row.Note, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}
