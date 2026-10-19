package data

import (
	"context"
	"entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/adminuser"
	"server/internal/data/model/ent/customer"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
	"server/internal/data/model/ent/supplier"
)

type partnerReadRepo struct{ data *Data }

func NewPartnerReadRepo(data *Data) biz.PartnerReadRepo { return &partnerReadRepo{data: data} }

func (r *partnerReadRepo) ListPurchaseOrders(ctx context.Context, supplierID int, f biz.PartnerOrderFilter) ([]*biz.PurchaseOrder, int, error) {
	if supplierID <= 0 {
		return nil, 0, biz.ErrNoPermission
	}
	repo := &purchaseOrderRepo{data: r.data}
	q := repo.purchaseOrderListQuery(biz.PurchaseOrderFilter{SupplierID: supplierID, LifecycleStatus: biz.PurchaseOrderStatusApproved}).Where(purchaseorder.HasSupplierWith(supplier.IsActive(true)))
	if f.Keyword != "" {
		q.Where(purchaseorder.Or(purchaseorder.PurchaseOrderNoContains(f.Keyword), purchaseorder.SupplierPurchaseOrderNoContains(f.Keyword)))
	}
	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.Order(purchaseorder.ByID(sql.OrderDesc())).Limit(f.Limit).Offset(f.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.PurchaseOrder, 0, len(rows))
	for _, row := range rows {
		out = append(out, entPurchaseOrderToBiz(row))
	}
	return out, total, nil
}

func (r *partnerReadRepo) GetPurchaseOrder(ctx context.Context, supplierID, id int) (*biz.PurchaseOrderWithItems, error) {
	if supplierID <= 0 || id <= 0 {
		return nil, biz.ErrPurchaseOrderNotFound
	}
	row, err := r.data.postgres.PurchaseOrder.Query().Where(purchaseorder.ID(id), purchaseorder.SupplierID(supplierID), purchaseorder.LifecycleStatus(biz.PurchaseOrderStatusApproved), purchaseorder.HasSupplierWith(supplier.IsActive(true))).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, biz.ErrPurchaseOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	items, err := r.data.postgres.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(row.ID)).Order(purchaseorderitem.ByLineNo()).All(ctx)
	if err != nil {
		return nil, err
	}
	out := &biz.PurchaseOrderWithItems{Order: entPurchaseOrderToBiz(row)}
	for _, item := range items {
		out.Items = append(out.Items, entPurchaseOrderItemToBiz(item))
	}
	return out, nil
}

func (r *partnerReadRepo) ListSalesOrders(ctx context.Context, customerID int, f biz.PartnerOrderFilter) ([]*biz.SalesOrder, int, error) {
	if customerID <= 0 {
		return nil, 0, biz.ErrNoPermission
	}
	repo := &salesOrderRepo{data: r.data}
	q := repo.salesOrderListQuery(biz.SalesOrderFilter{CustomerID: customerID, LifecycleStatus: biz.SalesOrderStatusActive}).Where(salesorder.HasCustomerWith(customer.IsActive(true)))
	if f.Keyword != "" {
		q.Where(salesorder.Or(salesorder.OrderNoContains(f.Keyword), salesorder.CustomerOrderNoContains(f.Keyword)))
	}
	total, err := q.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := q.Order(salesorder.ByID(sql.OrderDesc())).Limit(f.Limit).Offset(f.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	out := make([]*biz.SalesOrder, 0, len(rows))
	for _, row := range rows {
		out = append(out, entSalesOrderToBiz(row))
	}
	return out, total, nil
}

func (r *partnerReadRepo) GetSalesOrder(ctx context.Context, customerID, id int) (*biz.SalesOrderWithItems, error) {
	if customerID <= 0 || id <= 0 {
		return nil, biz.ErrSalesOrderNotFound
	}
	row, err := r.data.postgres.SalesOrder.Query().Where(salesorder.ID(id), salesorder.CustomerID(customerID), salesorder.LifecycleStatus(biz.SalesOrderStatusActive), salesorder.HasCustomerWith(customer.IsActive(true))).Only(ctx)
	if ent.IsNotFound(err) {
		return nil, biz.ErrSalesOrderNotFound
	}
	if err != nil {
		return nil, err
	}
	items, err := r.data.postgres.SalesOrderItem.Query().Where(salesorderitem.SalesOrderID(row.ID)).Order(salesorderitem.ByLineNo()).All(ctx)
	if err != nil {
		return nil, err
	}
	out := &biz.SalesOrderWithItems{Order: entSalesOrderToBiz(row)}
	for _, item := range items {
		out.Items = append(out.Items, entSalesOrderItemToBiz(item))
	}
	return out, nil
}

func (r *partnerReadRepo) ListAccounts(ctx context.Context) ([]*biz.AdminUser, error) {
	rows, err := r.data.postgres.AdminUser.Query().Where(adminuser.AccountKindNEQ(int(biz.AccountKindEmployee))).Order(adminuser.ByID()).All(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]*biz.AdminUser, 0, len(rows))
	for _, row := range rows {
		out = append(out, mapEntAdminUser(row))
	}
	return out, nil
}
