package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/supplier"
	"server/internal/data/model/ent/unit"

	"entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
)

type purchaseOrderRepo struct {
	data *Data
	log  *log.Helper
}

func NewPurchaseOrderRepo(d *Data, logger log.Logger) *purchaseOrderRepo {
	return &purchaseOrderRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.purchase_order_repo")),
	}
}

var _ biz.PurchaseOrderRepo = (*purchaseOrderRepo)(nil)

func (r *purchaseOrderRepo) CreatePurchaseOrder(ctx context.Context, in *biz.PurchaseOrderMutation) (*biz.PurchaseOrder, error) {
	row, err := r.data.postgres.PurchaseOrder.Create().
		SetPurchaseOrderNo(in.PurchaseOrderNo).
		SetSupplierID(in.SupplierID).
		SetNillableSupplierPurchaseOrderNo(in.SupplierPurchaseOrderNo).
		SetSupplierSnapshot(in.SupplierSnapshot).
		SetPurchaseDate(in.PurchaseDate).
		SetNillableExpectedArrivalDate(in.ExpectedArrivalDate).
		SetLifecycleStatus(biz.PurchaseOrderStatusDraft).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entPurchaseOrderToBiz(row), nil
}

func (r *purchaseOrderRepo) UpdatePurchaseOrder(ctx context.Context, id int, in *biz.PurchaseOrderMutation) (*biz.PurchaseOrder, error) {
	update := r.data.postgres.PurchaseOrder.UpdateOneID(id).
		SetPurchaseOrderNo(in.PurchaseOrderNo).
		SetSupplierID(in.SupplierID).
		SetSupplierSnapshot(in.SupplierSnapshot).
		SetPurchaseDate(in.PurchaseDate)
	if in.SupplierPurchaseOrderNo == nil {
		update.ClearSupplierPurchaseOrderNo()
	} else {
		update.SetSupplierPurchaseOrderNo(*in.SupplierPurchaseOrderNo)
	}
	if in.ExpectedArrivalDate == nil {
		update.ClearExpectedArrivalDate()
	} else {
		update.SetExpectedArrivalDate(*in.ExpectedArrivalDate)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseOrderNotFound
		}
		return nil, err
	}
	return entPurchaseOrderToBiz(row), nil
}

func (r *purchaseOrderRepo) GetPurchaseOrder(ctx context.Context, id int) (*biz.PurchaseOrder, error) {
	row, err := r.data.postgres.PurchaseOrder.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseOrderNotFound
		}
		return nil, err
	}
	return entPurchaseOrderToBiz(row), nil
}

func (r *purchaseOrderRepo) ListPurchaseOrders(ctx context.Context, filter biz.PurchaseOrderFilter) ([]*biz.PurchaseOrder, int, error) {
	query := r.data.postgres.PurchaseOrder.Query()
	if filter.Keyword != "" {
		query = query.Where(purchaseorder.Or(
			purchaseorder.PurchaseOrderNoContains(filter.Keyword),
			purchaseorder.SupplierPurchaseOrderNoContains(filter.Keyword),
		))
	}
	if filter.SupplierID > 0 {
		query = query.Where(purchaseorder.SupplierID(filter.SupplierID))
	}
	if filter.LifecycleStatus != "" {
		query = query.Where(purchaseorder.LifecycleStatus(filter.LifecycleStatus))
	}
	if filter.DateField != "" {
		query = applyPurchaseOrderDateRange(query, filter)
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(purchaseOrderSortOrder(filter), purchaseorder.ByID(sql.OrderDesc())).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entPurchaseOrdersToBiz(rows), total, nil
}

func applyPurchaseOrderDateRange(query *ent.PurchaseOrderQuery, filter biz.PurchaseOrderFilter) *ent.PurchaseOrderQuery {
	switch filter.DateField {
	case "expected_arrival_date":
		if filter.DateFrom != nil {
			query = query.Where(purchaseorder.ExpectedArrivalDateGTE(*filter.DateFrom))
		}
		if filter.DateTo != nil {
			query = query.Where(purchaseorder.ExpectedArrivalDateLTE(*filter.DateTo))
		}
	default:
		if filter.DateFrom != nil {
			query = query.Where(purchaseorder.PurchaseDateGTE(*filter.DateFrom))
		}
		if filter.DateTo != nil {
			query = query.Where(purchaseorder.PurchaseDateLTE(*filter.DateTo))
		}
	}
	return query
}

func purchaseOrderSortOrder(filter biz.PurchaseOrderFilter) purchaseorder.OrderOption {
	options := []sql.OrderTermOption{}
	if filter.SortDirection == "desc" {
		options = append(options, sql.OrderDesc())
	}

	switch filter.SortBy {
	case "purchase_date":
		return purchaseorder.ByPurchaseDate(options...)
	case "expected_arrival_date":
		return purchaseorder.ByExpectedArrivalDate(options...)
	}
	return purchaseorder.ByUpdatedAt(options...)
}

func (r *purchaseOrderRepo) UpdatePurchaseOrderLifecycle(ctx context.Context, id int, lifecycleStatus string) (*biz.PurchaseOrder, error) {
	row, err := r.data.postgres.PurchaseOrder.UpdateOneID(id).
		SetLifecycleStatus(lifecycleStatus).
		Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseOrderNotFound
		}
		return nil, err
	}
	return entPurchaseOrderToBiz(row), nil
}

func (r *purchaseOrderRepo) AddPurchaseOrderItem(ctx context.Context, in *biz.PurchaseOrderItemMutation) (*biz.PurchaseOrderItem, error) {
	row, err := r.data.postgres.PurchaseOrderItem.Create().
		SetPurchaseOrderID(in.PurchaseOrderID).
		SetLineNo(in.LineNo).
		SetMaterialID(in.MaterialID).
		SetUnitID(in.UnitID).
		SetNillableMaterialCodeSnapshot(in.MaterialCodeSnapshot).
		SetNillableMaterialNameSnapshot(in.MaterialNameSnapshot).
		SetNillableColorSnapshot(in.ColorSnapshot).
		SetNillableProductOrderNoSnapshot(in.ProductOrderNoSnapshot).
		SetNillableProductNoSnapshot(in.ProductNoSnapshot).
		SetNillableProductNameSnapshot(in.ProductNameSnapshot).
		SetPurchasedQuantity(in.PurchasedQuantity).
		SetNillableUnitPrice(in.UnitPrice).
		SetNillableAmount(in.Amount).
		SetNillableExpectedArrivalDate(in.ExpectedArrivalDate).
		SetLineStatus(biz.PurchaseOrderItemStatusOpen).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entPurchaseOrderItemToBiz(row), nil
}

func (r *purchaseOrderRepo) UpdatePurchaseOrderItem(ctx context.Context, id int, in *biz.PurchaseOrderItemMutation) (*biz.PurchaseOrderItem, error) {
	update := r.data.postgres.PurchaseOrderItem.UpdateOneID(id).
		SetPurchaseOrderID(in.PurchaseOrderID).
		SetLineNo(in.LineNo).
		SetMaterialID(in.MaterialID).
		SetUnitID(in.UnitID).
		SetPurchasedQuantity(in.PurchasedQuantity)
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
	if in.ColorSnapshot == nil {
		update.ClearColorSnapshot()
	} else {
		update.SetColorSnapshot(*in.ColorSnapshot)
	}
	if in.ProductOrderNoSnapshot == nil {
		update.ClearProductOrderNoSnapshot()
	} else {
		update.SetProductOrderNoSnapshot(*in.ProductOrderNoSnapshot)
	}
	if in.ProductNoSnapshot == nil {
		update.ClearProductNoSnapshot()
	} else {
		update.SetProductNoSnapshot(*in.ProductNoSnapshot)
	}
	if in.ProductNameSnapshot == nil {
		update.ClearProductNameSnapshot()
	} else {
		update.SetProductNameSnapshot(*in.ProductNameSnapshot)
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
	if in.ExpectedArrivalDate == nil {
		update.ClearExpectedArrivalDate()
	} else {
		update.SetExpectedArrivalDate(*in.ExpectedArrivalDate)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseOrderItemNotFound
		}
		return nil, err
	}
	return entPurchaseOrderItemToBiz(row), nil
}

func (r *purchaseOrderRepo) GetPurchaseOrderItem(ctx context.Context, id int) (*biz.PurchaseOrderItem, error) {
	row, err := r.data.postgres.PurchaseOrderItem.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseOrderItemNotFound
		}
		return nil, err
	}
	return entPurchaseOrderItemToBiz(row), nil
}

func (r *purchaseOrderRepo) UpdatePurchaseOrderItemStatus(ctx context.Context, id int, lineStatus string) (*biz.PurchaseOrderItem, error) {
	row, err := r.data.postgres.PurchaseOrderItem.UpdateOneID(id).
		SetLineStatus(lineStatus).
		Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseOrderItemNotFound
		}
		return nil, err
	}
	return entPurchaseOrderItemToBiz(row), nil
}

func (r *purchaseOrderRepo) ListPurchaseOrderItems(ctx context.Context, filter biz.PurchaseOrderItemFilter) ([]*biz.PurchaseOrderItem, int, error) {
	query := r.data.postgres.PurchaseOrderItem.Query().
		Where(purchaseorderitem.PurchaseOrderID(filter.PurchaseOrderID))
	if filter.LineStatus != "" {
		query = query.Where(purchaseorderitem.LineStatus(filter.LineStatus))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Asc(purchaseorderitem.FieldLineNo)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entPurchaseOrderItemsToBiz(rows), total, nil
}

func (r *purchaseOrderRepo) SavePurchaseOrderWithItems(ctx context.Context, id int, in *biz.PurchaseOrderMutation, items []*biz.PurchaseOrderItemSaveMutation) (*biz.PurchaseOrderWithItems, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() {
		if tx != nil {
			rollbackEntTx(ctx, tx, r.log)
		}
	}()

	var orderRow *ent.PurchaseOrder
	if id > 0 {
		update := tx.PurchaseOrder.UpdateOneID(id).
			SetPurchaseOrderNo(in.PurchaseOrderNo).
			SetSupplierID(in.SupplierID).
			SetSupplierSnapshot(in.SupplierSnapshot).
			SetPurchaseDate(in.PurchaseDate)
		if in.SupplierPurchaseOrderNo == nil {
			update.ClearSupplierPurchaseOrderNo()
		} else {
			update.SetSupplierPurchaseOrderNo(*in.SupplierPurchaseOrderNo)
		}
		if in.ExpectedArrivalDate == nil {
			update.ClearExpectedArrivalDate()
		} else {
			update.SetExpectedArrivalDate(*in.ExpectedArrivalDate)
		}
		if in.Note == nil {
			update.ClearNote()
		} else {
			update.SetNote(*in.Note)
		}
		orderRow, err = update.Save(ctx)
		if err != nil {
			if ent.IsNotFound(err) {
				return nil, biz.ErrPurchaseOrderNotFound
			}
			return nil, err
		}
	} else {
		orderRow, err = tx.PurchaseOrder.Create().
			SetPurchaseOrderNo(in.PurchaseOrderNo).
			SetSupplierID(in.SupplierID).
			SetNillableSupplierPurchaseOrderNo(in.SupplierPurchaseOrderNo).
			SetSupplierSnapshot(in.SupplierSnapshot).
			SetPurchaseDate(in.PurchaseDate).
			SetNillableExpectedArrivalDate(in.ExpectedArrivalDate).
			SetLifecycleStatus(biz.PurchaseOrderStatusDraft).
			SetNillableNote(in.Note).
			Save(ctx)
		if err != nil {
			return nil, err
		}
	}

	existingOpenItems, err := tx.PurchaseOrderItem.Query().
		Where(
			purchaseorderitem.PurchaseOrderID(orderRow.ID),
			purchaseorderitem.LineStatus(biz.PurchaseOrderItemStatusOpen),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	submittedIDs := map[int]struct{}{}
	for _, item := range items {
		mutation := item.PurchaseOrderItemMutation
		mutation.PurchaseOrderID = orderRow.ID
		if item.ID > 0 {
			current, err := tx.PurchaseOrderItem.Query().
				Where(purchaseorderitem.ID(item.ID), purchaseorderitem.PurchaseOrderID(orderRow.ID)).
				Only(ctx)
			if err != nil {
				if ent.IsNotFound(err) {
					return nil, biz.ErrPurchaseOrderItemNotFound
				}
				return nil, err
			}
			if current.LineStatus == biz.PurchaseOrderItemStatusCanceled || current.LineStatus == biz.PurchaseOrderItemStatusClosed {
				return nil, biz.ErrBadParam
			}
			if _, err := savePurchaseOrderItemUpdate(ctx, tx, item.ID, &mutation); err != nil {
				return nil, err
			}
			submittedIDs[item.ID] = struct{}{}
			continue
		}
		if _, err := tx.PurchaseOrderItem.Create().
			SetPurchaseOrderID(mutation.PurchaseOrderID).
			SetLineNo(mutation.LineNo).
			SetMaterialID(mutation.MaterialID).
			SetUnitID(mutation.UnitID).
			SetNillableMaterialCodeSnapshot(mutation.MaterialCodeSnapshot).
			SetNillableMaterialNameSnapshot(mutation.MaterialNameSnapshot).
			SetNillableColorSnapshot(mutation.ColorSnapshot).
			SetNillableProductOrderNoSnapshot(mutation.ProductOrderNoSnapshot).
			SetNillableProductNoSnapshot(mutation.ProductNoSnapshot).
			SetNillableProductNameSnapshot(mutation.ProductNameSnapshot).
			SetPurchasedQuantity(mutation.PurchasedQuantity).
			SetNillableUnitPrice(mutation.UnitPrice).
			SetNillableAmount(mutation.Amount).
			SetNillableExpectedArrivalDate(mutation.ExpectedArrivalDate).
			SetLineStatus(biz.PurchaseOrderItemStatusOpen).
			SetNillableNote(mutation.Note).
			Save(ctx); err != nil {
			return nil, err
		}
	}

	for _, existing := range existingOpenItems {
		if _, ok := submittedIDs[existing.ID]; ok {
			continue
		}
		if _, err := tx.PurchaseOrderItem.UpdateOneID(existing.ID).
			SetLineStatus(biz.PurchaseOrderItemStatusCanceled).
			Save(ctx); err != nil {
			return nil, err
		}
	}

	itemRows, err := tx.PurchaseOrderItem.Query().
		Where(purchaseorderitem.PurchaseOrderID(orderRow.ID)).
		Order(ent.Asc(purchaseorderitem.FieldLineNo), ent.Asc(purchaseorderitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return &biz.PurchaseOrderWithItems{
		Order: entPurchaseOrderToBiz(orderRow),
		Items: entPurchaseOrderItemsToBiz(itemRows),
	}, nil
}

func (r *purchaseOrderRepo) SupplierIsActive(ctx context.Context, id int) (bool, error) {
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

func (r *purchaseOrderRepo) MaterialIsActive(ctx context.Context, id int) (bool, error) {
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

func (r *purchaseOrderRepo) UnitIsActive(ctx context.Context, id int) (bool, error) {
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

func savePurchaseOrderItemUpdate(ctx context.Context, tx *ent.Tx, id int, in *biz.PurchaseOrderItemMutation) (*ent.PurchaseOrderItem, error) {
	update := tx.PurchaseOrderItem.UpdateOneID(id).
		SetPurchaseOrderID(in.PurchaseOrderID).
		SetLineNo(in.LineNo).
		SetMaterialID(in.MaterialID).
		SetUnitID(in.UnitID).
		SetPurchasedQuantity(in.PurchasedQuantity)
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
	if in.ColorSnapshot == nil {
		update.ClearColorSnapshot()
	} else {
		update.SetColorSnapshot(*in.ColorSnapshot)
	}
	if in.ProductOrderNoSnapshot == nil {
		update.ClearProductOrderNoSnapshot()
	} else {
		update.SetProductOrderNoSnapshot(*in.ProductOrderNoSnapshot)
	}
	if in.ProductNoSnapshot == nil {
		update.ClearProductNoSnapshot()
	} else {
		update.SetProductNoSnapshot(*in.ProductNoSnapshot)
	}
	if in.ProductNameSnapshot == nil {
		update.ClearProductNameSnapshot()
	} else {
		update.SetProductNameSnapshot(*in.ProductNameSnapshot)
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
	if in.ExpectedArrivalDate == nil {
		update.ClearExpectedArrivalDate()
	} else {
		update.SetExpectedArrivalDate(*in.ExpectedArrivalDate)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseOrderItemNotFound
		}
		return nil, err
	}
	return row, nil
}

func entPurchaseOrderToBiz(row *ent.PurchaseOrder) *biz.PurchaseOrder {
	if row == nil {
		return nil
	}
	return &biz.PurchaseOrder{
		ID:                      row.ID,
		PurchaseOrderNo:         row.PurchaseOrderNo,
		SupplierID:              row.SupplierID,
		SupplierPurchaseOrderNo: row.SupplierPurchaseOrderNo,
		SupplierSnapshot:        row.SupplierSnapshot,
		PurchaseDate:            row.PurchaseDate,
		ExpectedArrivalDate:     row.ExpectedArrivalDate,
		LifecycleStatus:         row.LifecycleStatus,
		Note:                    row.Note,
		CreatedAt:               row.CreatedAt,
		UpdatedAt:               row.UpdatedAt,
	}
}

func entPurchaseOrdersToBiz(rows []*ent.PurchaseOrder) []*biz.PurchaseOrder {
	out := make([]*biz.PurchaseOrder, 0, len(rows))
	for _, row := range rows {
		out = append(out, entPurchaseOrderToBiz(row))
	}
	return out
}

func entPurchaseOrderItemToBiz(row *ent.PurchaseOrderItem) *biz.PurchaseOrderItem {
	if row == nil {
		return nil
	}
	return &biz.PurchaseOrderItem{
		ID:                     row.ID,
		PurchaseOrderID:        row.PurchaseOrderID,
		LineNo:                 row.LineNo,
		MaterialID:             row.MaterialID,
		UnitID:                 row.UnitID,
		MaterialCodeSnapshot:   row.MaterialCodeSnapshot,
		MaterialNameSnapshot:   row.MaterialNameSnapshot,
		ColorSnapshot:          row.ColorSnapshot,
		ProductOrderNoSnapshot: row.ProductOrderNoSnapshot,
		ProductNoSnapshot:      row.ProductNoSnapshot,
		ProductNameSnapshot:    row.ProductNameSnapshot,
		PurchasedQuantity:      row.PurchasedQuantity,
		UnitPrice:              row.UnitPrice,
		Amount:                 row.Amount,
		ExpectedArrivalDate:    row.ExpectedArrivalDate,
		LineStatus:             row.LineStatus,
		Note:                   row.Note,
		CreatedAt:              row.CreatedAt,
		UpdatedAt:              row.UpdatedAt,
	}
}

func entPurchaseOrderItemsToBiz(rows []*ent.PurchaseOrderItem) []*biz.PurchaseOrderItem {
	out := make([]*biz.PurchaseOrderItem, 0, len(rows))
	for _, row := range rows {
		out = append(out, entPurchaseOrderItemToBiz(row))
	}
	return out
}
