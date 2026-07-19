package data

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/process"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/productionwipoutsourcingallocation"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/supplier"
	"server/internal/data/model/ent/unit"

	"entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
)

type outsourcingOrderRepo struct {
	data *Data
	log  *log.Helper
}

func NewOutsourcingOrderRepo(d *Data, logger log.Logger) *outsourcingOrderRepo {
	return &outsourcingOrderRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.outsourcing_order_repo")),
	}
}

var _ biz.OutsourcingOrderRepo = (*outsourcingOrderRepo)(nil)

func (r *outsourcingOrderRepo) GetOutsourcingOrder(ctx context.Context, id int) (*biz.OutsourcingOrder, error) {
	row, err := r.data.postgres.OutsourcingOrder.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrOutsourcingOrderNotFound
		}
		return nil, err
	}
	return entOutsourcingOrderToBiz(row), nil
}

func (r *outsourcingOrderRepo) ListOutsourcingOrders(ctx context.Context, filter biz.OutsourcingOrderFilter) ([]*biz.OutsourcingOrder, int, error) {
	query := r.data.postgres.OutsourcingOrder.Query()
	if filter.Keyword != "" {
		query = query.Where(outsourcingorder.Or(
			outsourcingorder.OutsourcingOrderNoContains(filter.Keyword),
			outsourcingorder.SourceOrderNoContains(filter.Keyword),
		))
	}
	if filter.SupplierID > 0 {
		query = query.Where(outsourcingorder.SupplierID(filter.SupplierID))
	}
	if filter.LifecycleStatus != "" {
		query = query.Where(outsourcingorder.LifecycleStatus(filter.LifecycleStatus))
	}
	if filter.DateField != "" {
		query = applyOutsourcingOrderDateRange(query, filter)
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(outsourcingOrderSortOrder(filter), outsourcingorder.ByID(sql.OrderDesc())).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	orders := entOutsourcingOrdersToBiz(rows)
	if err := r.populateOutsourcingOrderItemCounts(ctx, orders); err != nil {
		return nil, 0, err
	}
	return orders, total, nil
}

func (r *outsourcingOrderRepo) populateOutsourcingOrderItemCounts(ctx context.Context, orders []*biz.OutsourcingOrder) error {
	orderIDs := make([]int, 0, len(orders))
	byID := make(map[int]*biz.OutsourcingOrder, len(orders))
	for _, order := range orders {
		if order == nil {
			continue
		}
		count := 0
		order.ItemCount = &count
		orderIDs = append(orderIDs, order.ID)
		byID[order.ID] = order
	}
	if len(orderIDs) == 0 {
		return nil
	}

	var counts []struct {
		OutsourcingOrderID int `json:"outsourcing_order_id,omitempty"`
		Count              int `json:"count,omitempty"`
	}
	if err := r.data.postgres.OutsourcingOrderItem.Query().
		Where(outsourcingorderitem.OutsourcingOrderIDIn(orderIDs...)).
		GroupBy(outsourcingorderitem.FieldOutsourcingOrderID).
		Aggregate(ent.Count()).
		Scan(ctx, &counts); err != nil {
		return err
	}
	for _, count := range counts {
		if order := byID[count.OutsourcingOrderID]; order != nil {
			itemCount := count.Count
			order.ItemCount = &itemCount
		}
	}
	return nil
}

func applyOutsourcingOrderDateRange(query *ent.OutsourcingOrderQuery, filter biz.OutsourcingOrderFilter) *ent.OutsourcingOrderQuery {
	switch filter.DateField {
	case "expected_return_date":
		if filter.DateFrom != nil {
			query = query.Where(outsourcingorder.ExpectedReturnDateGTE(*filter.DateFrom))
		}
		if filter.DateTo != nil {
			query = query.Where(outsourcingorder.ExpectedReturnDateLTE(*filter.DateTo))
		}
	default:
		if filter.DateFrom != nil {
			query = query.Where(outsourcingorder.OrderDateGTE(*filter.DateFrom))
		}
		if filter.DateTo != nil {
			query = query.Where(outsourcingorder.OrderDateLTE(*filter.DateTo))
		}
	}
	return query
}

func outsourcingOrderSortOrder(filter biz.OutsourcingOrderFilter) outsourcingorder.OrderOption {
	options := []sql.OrderTermOption{}
	if filter.SortDirection == "desc" {
		options = append(options, sql.OrderDesc())
	}

	switch filter.SortBy {
	case "order_date":
		return outsourcingorder.ByOrderDate(options...)
	case "expected_return_date":
		return outsourcingorder.ByExpectedReturnDate(options...)
	}
	return outsourcingorder.ByUpdatedAt(options...)
}

func (r *outsourcingOrderRepo) UpdateOutsourcingOrderLifecycle(ctx context.Context, id int, lifecycleStatus string) (*biz.OutsourcingOrder, error) {
	if id <= 0 || !biz.IsValidOutsourcingOrderStatus(lifecycleStatus) {
		return nil, biz.ErrBadParam
	}
	dependencyBatchIDs, err := outsourcingOrderWIPDependencyBatchIDs(ctx, r.data.postgres, id)
	if err != nil {
		return nil, err
	}
	tx, err := (&inventoryRepo{data: r.data, log: r.log}).beginInventoryDBTx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackInventoryDBTx(ctx, tx, r.log)
	for _, batchID := range dependencyBatchIDs {
		if err := lockOperationalFactRow(ctx, tx, "production_wip_batches", batchID, biz.ErrProductionWIPOutsourcingSourceDependency); err != nil {
			return nil, err
		}
	}
	if err := lockOperationalFactRow(ctx, tx, "outsourcing_orders", id, biz.ErrOutsourcingOrderNotFound); err != nil {
		return nil, err
	}
	row, err := tx.client.OutsourcingOrder.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrOutsourcingOrderNotFound
		}
		return nil, err
	}
	// WIP assignment owns the batch -> outsourcing order lock order. Lifecycle
	// settlement therefore locks the preflight batch set first, then the parent,
	// and must fail closed if another batch dependency appeared in between. Do
	// not lock newly discovered batches here: doing so after the parent would
	// invert the authoritative lock order and can deadlock with assignment.
	if err := requireStableOutsourcingOrderWIPDependencySet(ctx, tx.client, id, dependencyBatchIDs); err != nil {
		return nil, err
	}
	if row.LifecycleStatus == lifecycleStatus {
		if err := tx.sqlTx.Commit(); err != nil {
			return nil, err
		}
		tx = nil
		return entOutsourcingOrderToBiz(row), nil
	}
	if !biz.IsOutsourcingOrderLifecycleTransitionAllowed(row.LifecycleStatus, lifecycleStatus) {
		return nil, biz.ErrBadParam
	}
	if lifecycleStatus == biz.OutsourcingOrderStatusCanceled && len(dependencyBatchIDs) > 0 {
		return nil, biz.ErrProductionWIPOutsourcingSourceDependency
	}
	if lifecycleStatus == biz.OutsourcingOrderStatusClosed && len(dependencyBatchIDs) > 0 {
		batches, err := tx.client.ProductionWIPBatch.Query().Where(productionwipbatch.IDIn(dependencyBatchIDs...)).All(ctx)
		if err != nil {
			return nil, err
		}
		if len(batches) != len(dependencyBatchIDs) {
			return nil, biz.ErrProductionWIPOutsourcingSourceDependency
		}
		for _, batch := range batches {
			if batch.Status != biz.ProductionWIPStatusAccepted && batch.Status != biz.ProductionWIPStatusRejected && batch.Status != biz.ProductionWIPStatusCancelled {
				return nil, biz.ErrProductionWIPOutsourcingSourceDependency
			}
		}
	}
	if lifecycleStatus == biz.OutsourcingOrderStatusClosed {
		hasUnsettledFacts, err := tx.client.OutsourcingFact.Query().Where(
			outsourcingfact.SourceType(biz.OutsourcingOrderSourceType),
			outsourcingfact.SourceID(id),
			outsourcingfact.StatusNotIn(
				biz.OperationalFactStatusPosted,
				biz.OperationalFactStatusCancelled,
			),
		).Exist(ctx)
		if err != nil {
			return nil, err
		}
		if hasUnsettledFacts {
			return nil, biz.ErrOutsourcingOrderFactDependency
		}
	}
	if lifecycleStatus == biz.OutsourcingOrderStatusCanceled {
		hasActiveFacts, err := tx.client.OutsourcingFact.Query().Where(
			outsourcingfact.SourceType(biz.OutsourcingOrderSourceType),
			outsourcingfact.SourceID(id),
			outsourcingfact.StatusNEQ(biz.OperationalFactStatusCancelled),
		).Exist(ctx)
		if err != nil {
			return nil, err
		}
		if hasActiveFacts {
			return nil, biz.ErrOutsourcingOrderFactDependency
		}
	}
	p := inventorySQLPlaceholders(tx.dialect, 3)
	query := fmt.Sprintf(`UPDATE outsourcing_orders SET lifecycle_status = %s, updated_at = %s WHERE id = %s`, p[0], p[1], p[2])
	result, err := tx.sqlTx.ExecContext(ctx, query, lifecycleStatus, time.Now(), id)
	if err != nil {
		return nil, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return nil, err
	}
	if affected != 1 {
		return nil, biz.ErrOutsourcingOrderNotFound
	}
	row, err = tx.client.OutsourcingOrder.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := tx.sqlTx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entOutsourcingOrderToBiz(row), nil
}

func (r *outsourcingOrderRepo) SaveOutsourcingOrderWithItems(ctx context.Context, id int, in *biz.OutsourcingOrderMutation, items []*biz.OutsourcingOrderItemSaveMutation) (*biz.OutsourcingOrderWithItems, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() {
		if tx != nil {
			rollbackEntTx(ctx, tx, r.log)
		}
	}()

	var orderRow *ent.OutsourcingOrder
	if id > 0 {
		dependencyBatchIDs, err := outsourcingOrderWIPDependencyBatchIDs(ctx, tx.Client(), id)
		if err != nil {
			return nil, err
		}
		if len(dependencyBatchIDs) > 0 {
			return nil, biz.ErrProductionWIPOutsourcingSourceDependency
		}
		update := tx.OutsourcingOrder.Update().
			Where(
				outsourcingorder.ID(id),
				outsourcingorder.LifecycleStatus(biz.OutsourcingOrderStatusDraft),
				outsourcingorder.Version(in.ExpectedVersion),
			).
			SetOutsourcingOrderNo(in.OutsourcingOrderNo).
			SetSupplierID(in.SupplierID).
			SetSupplierSnapshot(in.SupplierSnapshot).
			SetContractPartySnapshot(in.ContractPartySnapshot).
			SetOrderDate(in.OrderDate).
			SetVersion(in.ExpectedVersion + 1)
		if in.SourceOrderNo == nil {
			update.ClearSourceOrderNo()
		} else {
			update.SetSourceOrderNo(*in.SourceOrderNo)
		}
		if in.ExpectedReturnDate == nil {
			update.ClearExpectedReturnDate()
		} else {
			update.SetExpectedReturnDate(*in.ExpectedReturnDate)
		}
		if in.Note == nil {
			update.ClearNote()
		} else {
			update.SetNote(*in.Note)
		}
		affected, err := update.Save(ctx)
		if err != nil {
			return nil, err
		}
		if affected == 0 {
			current, err := tx.OutsourcingOrder.Get(ctx, id)
			if err != nil {
				if ent.IsNotFound(err) {
					return nil, biz.ErrOutsourcingOrderNotFound
				}
				return nil, err
			}
			if current.LifecycleStatus != biz.OutsourcingOrderStatusDraft {
				return nil, biz.ErrBadParam
			}
			if current.Version != in.ExpectedVersion {
				return nil, biz.ErrOutsourcingOrderConflict
			}
			return nil, biz.ErrOutsourcingOrderConflict
		}
		orderRow, err = tx.OutsourcingOrder.Get(ctx, id)
		if err != nil {
			return nil, err
		}
	} else {
		orderRow, err = tx.OutsourcingOrder.Create().
			SetOutsourcingOrderNo(in.OutsourcingOrderNo).
			SetSupplierID(in.SupplierID).
			SetSupplierSnapshot(in.SupplierSnapshot).
			SetContractPartySnapshot(in.ContractPartySnapshot).
			SetNillableSourceOrderNo(in.SourceOrderNo).
			SetOrderDate(in.OrderDate).
			SetNillableExpectedReturnDate(in.ExpectedReturnDate).
			SetLifecycleStatus(biz.OutsourcingOrderStatusDraft).
			SetNillableNote(in.Note).
			Save(ctx)
		if err != nil {
			return nil, err
		}
	}

	existingOpenItems, err := tx.OutsourcingOrderItem.Query().
		Where(
			outsourcingorderitem.OutsourcingOrderID(orderRow.ID),
			outsourcingorderitem.LineStatus(biz.OutsourcingOrderItemStatusOpen),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	submittedIDs := map[int]struct{}{}
	for _, item := range items {
		mutation := item.OutsourcingOrderItemMutation
		mutation.OutsourcingOrderID = orderRow.ID
		if item.ID > 0 {
			current, err := tx.OutsourcingOrderItem.Query().
				Where(outsourcingorderitem.ID(item.ID), outsourcingorderitem.OutsourcingOrderID(orderRow.ID)).
				Only(ctx)
			if err != nil {
				if ent.IsNotFound(err) {
					return nil, biz.ErrOutsourcingOrderItemNotFound
				}
				return nil, err
			}
			if current.LineStatus != biz.OutsourcingOrderItemStatusOpen {
				return nil, biz.ErrBadParam
			}
		}
		if err := setCanonicalOutsourcingOrderItemSnapshots(ctx, tx, &mutation); err != nil {
			return nil, err
		}
		if item.ID > 0 {
			if _, err := saveOutsourcingOrderItemUpdate(ctx, tx, item.ID, &mutation); err != nil {
				return nil, err
			}
			submittedIDs[item.ID] = struct{}{}
			continue
		}
		if _, err := tx.OutsourcingOrderItem.Create().
			SetOutsourcingOrderID(mutation.OutsourcingOrderID).
			SetLineNo(mutation.LineNo).
			SetSubjectType(mutation.SubjectType).
			SetNillableProductID(mutation.ProductID).
			SetNillableProductSkuID(mutation.ProductSKUID).
			SetNillableMaterialID(mutation.MaterialID).
			SetProcessID(mutation.ProcessID).
			SetUnitID(mutation.UnitID).
			SetNillableProductNoSnapshot(mutation.ProductNoSnapshot).
			SetNillableSkuCodeSnapshot(mutation.SKUCodeSnapshot).
			SetNillableProductOrderNoSnapshot(mutation.ProductOrderNoSnapshot).
			SetNillableProductNameSnapshot(mutation.ProductNameSnapshot).
			SetNillableMaterialCodeSnapshot(mutation.MaterialCodeSnapshot).
			SetNillableMaterialNameSnapshot(mutation.MaterialNameSnapshot).
			SetNillableProcessingItem(mutation.ProcessingItem).
			SetNillableProcessNameSnapshot(mutation.ProcessNameSnapshot).
			SetNillableProcessCategorySnapshot(mutation.ProcessCategorySnapshot).
			SetNillableUnitNameSnapshot(mutation.UnitNameSnapshot).
			SetOutsourcingQuantity(mutation.OutsourcingQuantity).
			SetNillableUnitPrice(mutation.UnitPrice).
			SetNillableAmount(mutation.Amount).
			SetNillableExpectedReturnDate(mutation.ExpectedReturnDate).
			SetLineStatus(biz.OutsourcingOrderItemStatusOpen).
			SetNillableNote(mutation.Note).
			Save(ctx); err != nil {
			return nil, err
		}
	}

	for _, existing := range existingOpenItems {
		if _, ok := submittedIDs[existing.ID]; ok {
			continue
		}
		if _, err := tx.OutsourcingOrderItem.UpdateOneID(existing.ID).
			SetLineStatus(biz.OutsourcingOrderItemStatusCanceled).
			Save(ctx); err != nil {
			return nil, err
		}
	}

	itemRows, err := tx.OutsourcingOrderItem.Query().
		Where(outsourcingorderitem.OutsourcingOrderID(orderRow.ID)).
		Order(ent.Asc(outsourcingorderitem.FieldLineNo), ent.Asc(outsourcingorderitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return &biz.OutsourcingOrderWithItems{
		Order: entOutsourcingOrderToBiz(orderRow),
		Items: entOutsourcingOrderItemsToBiz(itemRows),
	}, nil
}

func outsourcingOrderWIPDependencyBatchIDs(ctx context.Context, client *ent.Client, orderID int) ([]int, error) {
	if client == nil || orderID <= 0 {
		return nil, biz.ErrBadParam
	}
	itemIDs, err := client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.OutsourcingOrderID(orderID)).IDs(ctx)
	if err != nil || len(itemIDs) == 0 {
		return nil, err
	}
	rows, err := client.ProductionWIPOutsourcingAllocation.Query().Where(
		productionwipoutsourcingallocation.OutsourcingOrderItemIDIn(itemIDs...),
	).All(ctx)
	if err != nil {
		return nil, err
	}
	unique := make(map[int]struct{}, len(rows))
	batchIDs := make([]int, 0, len(rows))
	for _, row := range rows {
		if _, exists := unique[row.ProductionWipBatchID]; exists {
			continue
		}
		unique[row.ProductionWipBatchID] = struct{}{}
		batchIDs = append(batchIDs, row.ProductionWipBatchID)
	}
	sort.Ints(batchIDs)
	return batchIDs, nil
}

func requireStableOutsourcingOrderWIPDependencySet(ctx context.Context, client *ent.Client, orderID int, lockedBatchIDs []int) error {
	currentBatchIDs, err := outsourcingOrderWIPDependencyBatchIDs(ctx, client, orderID)
	if err != nil {
		return err
	}
	if len(currentBatchIDs) != len(lockedBatchIDs) {
		return biz.ErrProductionWIPOutsourcingSourceDependency
	}
	for index := range currentBatchIDs {
		if currentBatchIDs[index] != lockedBatchIDs[index] {
			return biz.ErrProductionWIPOutsourcingSourceDependency
		}
	}
	return nil
}

func outsourcingOrderLifecyclePredecessors(next string) []string {
	statuses := []string{
		biz.OutsourcingOrderStatusDraft,
		biz.OutsourcingOrderStatusSubmitted,
		biz.OutsourcingOrderStatusConfirmed,
		biz.OutsourcingOrderStatusClosed,
		biz.OutsourcingOrderStatusCanceled,
	}
	allowed := make([]string, 0, len(statuses))
	for _, current := range statuses {
		if biz.IsOutsourcingOrderLifecycleTransitionAllowed(current, next) {
			allowed = append(allowed, current)
		}
	}
	return allowed
}

func setCanonicalOutsourcingOrderItemSnapshots(ctx context.Context, tx *ent.Tx, in *biz.OutsourcingOrderItemMutation) error {
	processRow, err := tx.Process.Query().Where(process.ID(in.ProcessID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrProcessNotFound
		}
		return err
	}
	if !processRow.IsActive {
		return biz.ErrProcessInactive
	}
	if !processRow.OutsourcingEnabled {
		return biz.ErrProcessNotOutsourcingEnabled
	}
	unitRow, err := tx.Unit.Query().Where(unit.ID(in.UnitID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return biz.ErrUnitNotFound
		}
		return err
	}
	if !unitRow.IsActive {
		return biz.ErrUnitInactive
	}

	in.ProcessNameSnapshot = outsourcingSnapshotString(processRow.Name)
	in.ProcessCategorySnapshot = processRow.Category
	in.UnitNameSnapshot = outsourcingSnapshotString(unitRow.Name)

	switch in.SubjectType {
	case biz.OutsourcingOrderSubjectProduct:
		if in.ProductID == nil {
			return biz.ErrBadParam
		}
		productRow, err := tx.Product.Query().Where(product.ID(*in.ProductID)).Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrProductNotFound
			}
			return err
		}
		if !productRow.IsActive {
			return biz.ErrProductInactive
		}
		in.ProductNoSnapshot = outsourcingProductNoSnapshot(productRow)
		in.ProductNameSnapshot = outsourcingSnapshotString(productRow.Name)
		if in.ProductSKUID == nil {
			in.SKUCodeSnapshot = nil
		} else {
			skuRow, err := tx.ProductSKU.Query().Where(productsku.ID(*in.ProductSKUID)).Only(ctx)
			if err != nil {
				if ent.IsNotFound(err) {
					return biz.ErrProductSKUNotFound
				}
				return err
			}
			if !skuRow.IsActive {
				return biz.ErrProductSKUInactive
			}
			if skuRow.ProductID != productRow.ID || skuRow.DefaultUnitID == nil || *skuRow.DefaultUnitID != unitRow.ID {
				return biz.ErrProductSKUNotFound
			}
			in.SKUCodeSnapshot = outsourcingSnapshotString(skuRow.SkuCode)
		}
		in.MaterialCodeSnapshot = nil
		in.MaterialNameSnapshot = nil
	case biz.OutsourcingOrderSubjectMaterial:
		if in.MaterialID == nil {
			return biz.ErrBadParam
		}
		materialRow, err := tx.Material.Query().Where(material.ID(*in.MaterialID)).Only(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return biz.ErrMaterialNotFound
			}
			return err
		}
		if !materialRow.IsActive {
			return biz.ErrMaterialInactive
		}
		in.ProductNoSnapshot = nil
		in.ProductSKUID = nil
		in.SKUCodeSnapshot = nil
		in.ProductNameSnapshot = nil
		in.MaterialCodeSnapshot = outsourcingSnapshotString(materialRow.Code)
		in.MaterialNameSnapshot = outsourcingSnapshotString(materialRow.Name)
	default:
		return biz.ErrBadParam
	}
	return nil
}

func outsourcingSnapshotString(value string) *string {
	return &value
}

func outsourcingProductNoSnapshot(productRow *ent.Product) *string {
	if productRow != nil && productRow.StyleNo != nil {
		if styleNo := strings.TrimSpace(*productRow.StyleNo); styleNo != "" {
			return outsourcingSnapshotString(styleNo)
		}
	}
	if productRow == nil {
		return nil
	}
	return outsourcingSnapshotString(productRow.Code)
}

func (r *outsourcingOrderRepo) ListOutsourcingOrderItems(ctx context.Context, filter biz.OutsourcingOrderItemFilter) ([]*biz.OutsourcingOrderItem, int, error) {
	query := r.data.postgres.OutsourcingOrderItem.Query().
		Where(outsourcingorderitem.OutsourcingOrderID(filter.OutsourcingOrderID))
	if filter.LineStatus != "" {
		query = query.Where(outsourcingorderitem.LineStatus(filter.LineStatus))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Asc(outsourcingorderitem.FieldLineNo)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entOutsourcingOrderItemsToBiz(rows), total, nil
}

func (r *outsourcingOrderRepo) GetOutsourcingOrderItem(ctx context.Context, id int) (*biz.OutsourcingOrderItem, error) {
	row, err := r.data.postgres.OutsourcingOrderItem.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrOutsourcingOrderItemNotFound
		}
		return nil, err
	}
	return entOutsourcingOrderItemToBiz(row), nil
}

func (r *outsourcingOrderRepo) SupplierIsActive(ctx context.Context, id int) (bool, error) {
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

func (r *outsourcingOrderRepo) ProductIsActive(ctx context.Context, id int) (bool, error) {
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

func (r *outsourcingOrderRepo) ProductSKUIsActiveForProductAndUnit(ctx context.Context, id, productID, unitID int) (bool, error) {
	row, err := r.data.postgres.ProductSKU.Query().Where(productsku.ID(id)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrProductSKUNotFound
		}
		return false, err
	}
	if row.ProductID != productID || row.DefaultUnitID == nil || *row.DefaultUnitID != unitID {
		return false, biz.ErrProductSKUNotFound
	}
	return row.IsActive, nil
}

func (r *outsourcingOrderRepo) MaterialIsActive(ctx context.Context, id int) (bool, error) {
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

func (r *outsourcingOrderRepo) UnitIsActive(ctx context.Context, id int) (bool, error) {
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

func (r *outsourcingOrderRepo) ProcessIsUsableForOutsourcing(ctx context.Context, id int) (bool, bool, error) {
	row, err := r.data.postgres.Process.Query().
		Where(process.ID(id)).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, false, biz.ErrProcessNotFound
		}
		return false, false, err
	}
	return row.IsActive, row.OutsourcingEnabled, nil
}

func saveOutsourcingOrderItemUpdate(ctx context.Context, tx *ent.Tx, id int, in *biz.OutsourcingOrderItemMutation) (*ent.OutsourcingOrderItem, error) {
	update := tx.OutsourcingOrderItem.UpdateOneID(id).
		SetOutsourcingOrderID(in.OutsourcingOrderID).
		SetLineNo(in.LineNo).
		SetSubjectType(in.SubjectType).
		SetProcessID(in.ProcessID).
		SetUnitID(in.UnitID).
		SetOutsourcingQuantity(in.OutsourcingQuantity)
	if in.ProductID == nil {
		update.ClearProductID()
	} else {
		update.SetProductID(*in.ProductID)
	}
	if in.ProductSKUID == nil {
		update.ClearProductSkuID()
	} else {
		update.SetProductSkuID(*in.ProductSKUID)
	}
	if in.MaterialID == nil {
		update.ClearMaterialID()
	} else {
		update.SetMaterialID(*in.MaterialID)
	}
	if in.ProductNoSnapshot == nil {
		update.ClearProductNoSnapshot()
	} else {
		update.SetProductNoSnapshot(*in.ProductNoSnapshot)
	}
	if in.SKUCodeSnapshot == nil {
		update.ClearSkuCodeSnapshot()
	} else {
		update.SetSkuCodeSnapshot(*in.SKUCodeSnapshot)
	}
	if in.ProductOrderNoSnapshot == nil {
		update.ClearProductOrderNoSnapshot()
	} else {
		update.SetProductOrderNoSnapshot(*in.ProductOrderNoSnapshot)
	}
	if in.ProductNameSnapshot == nil {
		update.ClearProductNameSnapshot()
	} else {
		update.SetProductNameSnapshot(*in.ProductNameSnapshot)
	}
	if in.MaterialCodeSnapshot == nil {
		update.ClearMaterialCodeSnapshot()
	} else {
		update.SetMaterialCodeSnapshot(*in.MaterialCodeSnapshot)
	}
	if in.MaterialNameSnapshot == nil {
		update.ClearMaterialNameSnapshot()
	} else {
		update.SetMaterialNameSnapshot(*in.MaterialNameSnapshot)
	}
	if in.ProcessingItem == nil {
		update.ClearProcessingItem()
	} else {
		update.SetProcessingItem(*in.ProcessingItem)
	}
	if in.ProcessNameSnapshot == nil {
		update.ClearProcessNameSnapshot()
	} else {
		update.SetProcessNameSnapshot(*in.ProcessNameSnapshot)
	}
	if in.ProcessCategorySnapshot == nil {
		update.ClearProcessCategorySnapshot()
	} else {
		update.SetProcessCategorySnapshot(*in.ProcessCategorySnapshot)
	}
	if in.UnitNameSnapshot == nil {
		update.ClearUnitNameSnapshot()
	} else {
		update.SetUnitNameSnapshot(*in.UnitNameSnapshot)
	}
	if in.UnitPrice == nil {
		update.ClearUnitPrice()
	} else {
		update.SetUnitPrice(*in.UnitPrice)
	}
	if in.Amount == nil {
		update.ClearAmount()
	} else {
		update.SetAmount(*in.Amount)
	}
	if in.ExpectedReturnDate == nil {
		update.ClearExpectedReturnDate()
	} else {
		update.SetExpectedReturnDate(*in.ExpectedReturnDate)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrOutsourcingOrderItemNotFound
		}
		return nil, err
	}
	return row, nil
}

func entOutsourcingOrderToBiz(row *ent.OutsourcingOrder) *biz.OutsourcingOrder {
	if row == nil {
		return nil
	}
	return &biz.OutsourcingOrder{
		ID:                    row.ID,
		OutsourcingOrderNo:    row.OutsourcingOrderNo,
		SupplierID:            row.SupplierID,
		SupplierSnapshot:      row.SupplierSnapshot,
		ContractPartySnapshot: row.ContractPartySnapshot,
		SourceOrderNo:         row.SourceOrderNo,
		OrderDate:             row.OrderDate,
		ExpectedReturnDate:    row.ExpectedReturnDate,
		LifecycleStatus:       row.LifecycleStatus,
		Version:               row.Version,
		Note:                  row.Note,
		CreatedAt:             row.CreatedAt,
		UpdatedAt:             row.UpdatedAt,
	}
}

func entOutsourcingOrdersToBiz(rows []*ent.OutsourcingOrder) []*biz.OutsourcingOrder {
	out := make([]*biz.OutsourcingOrder, 0, len(rows))
	for _, row := range rows {
		out = append(out, entOutsourcingOrderToBiz(row))
	}
	return out
}

func entOutsourcingOrderItemToBiz(row *ent.OutsourcingOrderItem) *biz.OutsourcingOrderItem {
	if row == nil {
		return nil
	}
	return &biz.OutsourcingOrderItem{
		ID:                      row.ID,
		OutsourcingOrderID:      row.OutsourcingOrderID,
		LineNo:                  row.LineNo,
		SubjectType:             row.SubjectType,
		ProductID:               row.ProductID,
		ProductSKUID:            row.ProductSkuID,
		MaterialID:              row.MaterialID,
		ProcessID:               row.ProcessID,
		UnitID:                  row.UnitID,
		ProductNoSnapshot:       row.ProductNoSnapshot,
		SKUCodeSnapshot:         row.SkuCodeSnapshot,
		ProductOrderNoSnapshot:  row.ProductOrderNoSnapshot,
		ProductNameSnapshot:     row.ProductNameSnapshot,
		MaterialCodeSnapshot:    row.MaterialCodeSnapshot,
		MaterialNameSnapshot:    row.MaterialNameSnapshot,
		ProcessingItem:          row.ProcessingItem,
		ProcessNameSnapshot:     row.ProcessNameSnapshot,
		ProcessCategorySnapshot: row.ProcessCategorySnapshot,
		UnitNameSnapshot:        row.UnitNameSnapshot,
		OutsourcingQuantity:     row.OutsourcingQuantity,
		UnitPrice:               row.UnitPrice,
		Amount:                  row.Amount,
		ExpectedReturnDate:      row.ExpectedReturnDate,
		LineStatus:              row.LineStatus,
		Note:                    row.Note,
		CreatedAt:               row.CreatedAt,
		UpdatedAt:               row.UpdatedAt,
	}
}

func entOutsourcingOrderItemsToBiz(rows []*ent.OutsourcingOrderItem) []*biz.OutsourcingOrderItem {
	out := make([]*biz.OutsourcingOrderItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, entOutsourcingOrderItemToBiz(row))
	}
	return out
}
