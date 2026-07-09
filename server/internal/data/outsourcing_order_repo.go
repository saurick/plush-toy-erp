package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/process"
	"server/internal/data/model/ent/product"
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
	return entOutsourcingOrdersToBiz(rows), total, nil
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
	row, err := r.data.postgres.OutsourcingOrder.UpdateOneID(id).
		SetLifecycleStatus(lifecycleStatus).
		Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrOutsourcingOrderNotFound
		}
		return nil, err
	}
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
		update := tx.OutsourcingOrder.UpdateOneID(id).
			SetOutsourcingOrderNo(in.OutsourcingOrderNo).
			SetSupplierID(in.SupplierID).
			SetSupplierSnapshot(in.SupplierSnapshot).
			SetContractPartySnapshot(in.ContractPartySnapshot).
			SetOrderDate(in.OrderDate)
		if in.SourceOrderNo == nil {
			update.ClearSourceOrderNo()
		} else {
			update.SetSourceOrderNo(*in.SourceOrderNo)
		}
		if in.SourceSalesOrderID == nil {
			update.ClearSourceSalesOrderID()
		} else {
			update.SetSourceSalesOrderID(*in.SourceSalesOrderID)
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
		orderRow, err = update.Save(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrOutsourcingOrderNotFound
			}
			return nil, err
		}
	} else {
		orderRow, err = tx.OutsourcingOrder.Create().
			SetOutsourcingOrderNo(in.OutsourcingOrderNo).
			SetSupplierID(in.SupplierID).
			SetSupplierSnapshot(in.SupplierSnapshot).
			SetContractPartySnapshot(in.ContractPartySnapshot).
			SetNillableSourceOrderNo(in.SourceOrderNo).
			SetNillableSourceSalesOrderID(in.SourceSalesOrderID).
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
			if _, err := saveOutsourcingOrderItemUpdate(ctx, tx, item.ID, &mutation); err != nil {
				return nil, err
			}
			submittedIDs[item.ID] = struct{}{}
			continue
		}
		if _, err := tx.OutsourcingOrderItem.Create().
			SetOutsourcingOrderID(mutation.OutsourcingOrderID).
			SetLineNo(mutation.LineNo).
			SetProductID(mutation.ProductID).
			SetProcessID(mutation.ProcessID).
			SetUnitID(mutation.UnitID).
			SetNillableProductNoSnapshot(mutation.ProductNoSnapshot).
			SetNillableProductOrderNoSnapshot(mutation.ProductOrderNoSnapshot).
			SetNillableProductNameSnapshot(mutation.ProductNameSnapshot).
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
		SetProductID(in.ProductID).
		SetProcessID(in.ProcessID).
		SetUnitID(in.UnitID).
		SetOutsourcingQuantity(in.OutsourcingQuantity)
	if in.ProductNoSnapshot == nil {
		update.ClearProductNoSnapshot()
	} else {
		update.SetProductNoSnapshot(*in.ProductNoSnapshot)
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
		SourceSalesOrderID:    row.SourceSalesOrderID,
		OrderDate:             row.OrderDate,
		ExpectedReturnDate:    row.ExpectedReturnDate,
		LifecycleStatus:       row.LifecycleStatus,
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
		ProductID:               row.ProductID,
		ProcessID:               row.ProcessID,
		UnitID:                  row.UnitID,
		ProductNoSnapshot:       row.ProductNoSnapshot,
		ProductOrderNoSnapshot:  row.ProductOrderNoSnapshot,
		ProductNameSnapshot:     row.ProductNameSnapshot,
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
