package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/customer"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
	"server/internal/data/model/ent/unit"

	"github.com/go-kratos/kratos/v2/log"
)

type salesOrderRepo struct {
	data *Data
	log  *log.Helper
}

func NewSalesOrderRepo(d *Data, logger log.Logger) *salesOrderRepo {
	return &salesOrderRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.sales_order_repo")),
	}
}

var _ biz.SalesOrderRepo = (*salesOrderRepo)(nil)

func (r *salesOrderRepo) CreateSalesOrder(ctx context.Context, in *biz.SalesOrderMutation) (*biz.SalesOrder, error) {
	row, err := r.data.postgres.SalesOrder.Create().
		SetOrderNo(in.OrderNo).
		SetCustomerID(in.CustomerID).
		SetNillableCustomerOrderNo(in.CustomerOrderNo).
		SetCustomerSnapshot(in.CustomerSnapshot).
		SetOrderDate(in.OrderDate).
		SetNillablePlannedDeliveryDate(in.PlannedDeliveryDate).
		SetLifecycleStatus(biz.SalesOrderStatusDraft).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entSalesOrderToBiz(row), nil
}

func (r *salesOrderRepo) UpdateSalesOrder(ctx context.Context, id int, in *biz.SalesOrderMutation) (*biz.SalesOrder, error) {
	update := r.data.postgres.SalesOrder.UpdateOneID(id).
		SetOrderNo(in.OrderNo).
		SetCustomerID(in.CustomerID).
		SetCustomerSnapshot(in.CustomerSnapshot).
		SetOrderDate(in.OrderDate)
	if in.CustomerOrderNo == nil {
		update.ClearCustomerOrderNo()
	} else {
		update.SetCustomerOrderNo(*in.CustomerOrderNo)
	}
	if in.PlannedDeliveryDate == nil {
		update.ClearPlannedDeliveryDate()
	} else {
		update.SetPlannedDeliveryDate(*in.PlannedDeliveryDate)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSalesOrderNotFound
		}
		return nil, err
	}
	return entSalesOrderToBiz(row), nil
}

func (r *salesOrderRepo) GetSalesOrder(ctx context.Context, id int) (*biz.SalesOrder, error) {
	row, err := r.data.postgres.SalesOrder.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSalesOrderNotFound
		}
		return nil, err
	}
	return entSalesOrderToBiz(row), nil
}

func (r *salesOrderRepo) ListSalesOrders(ctx context.Context, filter biz.SalesOrderFilter) ([]*biz.SalesOrder, int, error) {
	query := r.data.postgres.SalesOrder.Query()
	if filter.Keyword != "" {
		query = query.Where(salesorder.Or(
			salesorder.OrderNoContains(filter.Keyword),
			salesorder.CustomerOrderNoContains(filter.Keyword),
		))
	}
	if filter.CustomerID > 0 {
		query = query.Where(salesorder.CustomerID(filter.CustomerID))
	}
	if filter.LifecycleStatus != "" {
		query = query.Where(salesorder.LifecycleStatus(filter.LifecycleStatus))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Asc(salesorder.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entSalesOrdersToBiz(rows), total, nil
}

func (r *salesOrderRepo) UpdateSalesOrderLifecycle(ctx context.Context, id int, lifecycleStatus string) (*biz.SalesOrder, error) {
	row, err := r.data.postgres.SalesOrder.UpdateOneID(id).
		SetLifecycleStatus(lifecycleStatus).
		Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSalesOrderNotFound
		}
		return nil, err
	}
	return entSalesOrderToBiz(row), nil
}

func (r *salesOrderRepo) AddSalesOrderItem(ctx context.Context, in *biz.SalesOrderItemMutation) (*biz.SalesOrderItem, error) {
	row, err := r.data.postgres.SalesOrderItem.Create().
		SetSalesOrderID(in.SalesOrderID).
		SetLineNo(in.LineNo).
		SetProductID(in.ProductID).
		SetUnitID(in.UnitID).
		SetNillableProductCodeSnapshot(in.ProductCodeSnapshot).
		SetNillableProductNameSnapshot(in.ProductNameSnapshot).
		SetNillableColorSnapshot(in.ColorSnapshot).
		SetOrderedQuantity(in.OrderedQuantity).
		SetNillableUnitPrice(in.UnitPrice).
		SetNillableAmount(in.Amount).
		SetNillablePlannedDeliveryDate(in.PlannedDeliveryDate).
		SetLineStatus(biz.SalesOrderItemStatusOpen).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entSalesOrderItemToBiz(row), nil
}

func (r *salesOrderRepo) UpdateSalesOrderItem(ctx context.Context, id int, in *biz.SalesOrderItemMutation) (*biz.SalesOrderItem, error) {
	update := r.data.postgres.SalesOrderItem.UpdateOneID(id).
		SetSalesOrderID(in.SalesOrderID).
		SetLineNo(in.LineNo).
		SetProductID(in.ProductID).
		SetUnitID(in.UnitID).
		SetOrderedQuantity(in.OrderedQuantity)
	if in.ProductCodeSnapshot == nil {
		update.ClearProductCodeSnapshot()
	} else {
		update.SetProductCodeSnapshot(*in.ProductCodeSnapshot)
	}
	if in.ProductNameSnapshot == nil {
		update.ClearProductNameSnapshot()
	} else {
		update.SetProductNameSnapshot(*in.ProductNameSnapshot)
	}
	if in.ColorSnapshot == nil {
		update.ClearColorSnapshot()
	} else {
		update.SetColorSnapshot(*in.ColorSnapshot)
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
	if in.PlannedDeliveryDate == nil {
		update.ClearPlannedDeliveryDate()
	} else {
		update.SetPlannedDeliveryDate(*in.PlannedDeliveryDate)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSalesOrderItemNotFound
		}
		return nil, err
	}
	return entSalesOrderItemToBiz(row), nil
}

func (r *salesOrderRepo) GetSalesOrderItem(ctx context.Context, id int) (*biz.SalesOrderItem, error) {
	row, err := r.data.postgres.SalesOrderItem.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSalesOrderItemNotFound
		}
		return nil, err
	}
	return entSalesOrderItemToBiz(row), nil
}

func (r *salesOrderRepo) UpdateSalesOrderItemStatus(ctx context.Context, id int, lineStatus string) (*biz.SalesOrderItem, error) {
	row, err := r.data.postgres.SalesOrderItem.UpdateOneID(id).
		SetLineStatus(lineStatus).
		Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSalesOrderItemNotFound
		}
		return nil, err
	}
	return entSalesOrderItemToBiz(row), nil
}

func (r *salesOrderRepo) ListSalesOrderItems(ctx context.Context, filter biz.SalesOrderItemFilter) ([]*biz.SalesOrderItem, int, error) {
	query := r.data.postgres.SalesOrderItem.Query().
		Where(salesorderitem.SalesOrderID(filter.SalesOrderID))
	if filter.LineStatus != "" {
		query = query.Where(salesorderitem.LineStatus(filter.LineStatus))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Asc(salesorderitem.FieldLineNo)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entSalesOrderItemsToBiz(rows), total, nil
}

func (r *salesOrderRepo) CustomerIsActive(ctx context.Context, id int) (bool, error) {
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

func (r *salesOrderRepo) ProductIsActive(ctx context.Context, id int) (bool, error) {
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

func (r *salesOrderRepo) UnitIsActive(ctx context.Context, id int) (bool, error) {
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

func entSalesOrderToBiz(row *ent.SalesOrder) *biz.SalesOrder {
	if row == nil {
		return nil
	}
	return &biz.SalesOrder{
		ID:                  row.ID,
		OrderNo:             row.OrderNo,
		CustomerID:          row.CustomerID,
		CustomerOrderNo:     row.CustomerOrderNo,
		CustomerSnapshot:    row.CustomerSnapshot,
		OrderDate:           row.OrderDate,
		PlannedDeliveryDate: row.PlannedDeliveryDate,
		LifecycleStatus:     row.LifecycleStatus,
		Note:                row.Note,
		CreatedAt:           row.CreatedAt,
		UpdatedAt:           row.UpdatedAt,
	}
}

func entSalesOrdersToBiz(rows []*ent.SalesOrder) []*biz.SalesOrder {
	out := make([]*biz.SalesOrder, 0, len(rows))
	for _, row := range rows {
		out = append(out, entSalesOrderToBiz(row))
	}
	return out
}

func entSalesOrderItemToBiz(row *ent.SalesOrderItem) *biz.SalesOrderItem {
	if row == nil {
		return nil
	}
	return &biz.SalesOrderItem{
		ID:                  row.ID,
		SalesOrderID:        row.SalesOrderID,
		LineNo:              row.LineNo,
		ProductID:           row.ProductID,
		UnitID:              row.UnitID,
		ProductCodeSnapshot: row.ProductCodeSnapshot,
		ProductNameSnapshot: row.ProductNameSnapshot,
		ColorSnapshot:       row.ColorSnapshot,
		OrderedQuantity:     row.OrderedQuantity,
		UnitPrice:           row.UnitPrice,
		Amount:              row.Amount,
		PlannedDeliveryDate: row.PlannedDeliveryDate,
		LineStatus:          row.LineStatus,
		Note:                row.Note,
		CreatedAt:           row.CreatedAt,
		UpdatedAt:           row.UpdatedAt,
	}
}

func entSalesOrderItemsToBiz(rows []*ent.SalesOrderItem) []*biz.SalesOrderItem {
	out := make([]*biz.SalesOrderItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, entSalesOrderItemToBiz(row))
	}
	return out
}
