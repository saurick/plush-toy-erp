package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/customer"
	"server/internal/data/model/ent/processinstance"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/productionorderitem"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/stockreservation"
	"server/internal/data/model/ent/unit"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
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
var _ biz.SalesOrderSubmitProcessCommandRepo = (*salesOrderRepo)(nil)
var _ biz.SalesOrderCancellationActorRepo = (*salesOrderRepo)(nil)

func (r *salesOrderRepo) CreateSalesOrder(ctx context.Context, in *biz.SalesOrderMutation) (*biz.SalesOrder, error) {
	row, err := r.data.postgres.SalesOrder.Create().
		SetOrderNo(in.OrderNo).
		SetCustomerID(in.CustomerID).
		SetNillableCustomerOrderNo(in.CustomerOrderNo).
		SetCustomerSnapshot(in.CustomerSnapshot).
		SetNillableSalesOwner(in.SalesOwner).
		SetContactSnapshot(in.ContactSnapshot).
		SetNillablePaymentMethod(in.PaymentMethod).
		SetNillablePaymentTermDays(in.PaymentTermDays).
		SetNillablePriceConditionNote(in.PriceConditionNote).
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
		SetContactSnapshot(in.ContactSnapshot).
		SetOrderDate(in.OrderDate)
	if in.CustomerOrderNo == nil {
		update.ClearCustomerOrderNo()
	} else {
		update.SetCustomerOrderNo(*in.CustomerOrderNo)
	}
	if in.SalesOwner == nil {
		update.ClearSalesOwner()
	} else {
		update.SetSalesOwner(*in.SalesOwner)
	}
	if in.PaymentMethod == nil {
		update.ClearPaymentMethod()
	} else {
		update.SetPaymentMethod(*in.PaymentMethod)
	}
	if in.PaymentTermDays == nil {
		update.ClearPaymentTermDays()
	} else {
		update.SetPaymentTermDays(*in.PaymentTermDays)
	}
	if in.PriceConditionNote == nil {
		update.ClearPriceConditionNote()
	} else {
		update.SetPriceConditionNote(*in.PriceConditionNote)
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
			salesorder.SalesOwnerContains(filter.Keyword),
			salesorder.PaymentMethodContains(filter.Keyword),
		))
	}
	if filter.CustomerID > 0 {
		query = query.Where(salesorder.CustomerID(filter.CustomerID))
	}
	if filter.LifecycleStatus != "" {
		query = query.Where(salesorder.LifecycleStatus(filter.LifecycleStatus))
	}
	if filter.DateField != "" {
		query = applySalesOrderDateRange(query, filter)
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(salesOrderSortOrder(filter), salesorder.ByID(sql.OrderDesc())).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	orders := entSalesOrdersToBiz(rows)
	if err := r.populateSalesOrderItemCounts(ctx, orders); err != nil {
		return nil, 0, err
	}
	return orders, total, nil
}

func (r *salesOrderRepo) populateSalesOrderItemCounts(ctx context.Context, orders []*biz.SalesOrder) error {
	orderIDs := make([]int, 0, len(orders))
	byID := make(map[int]*biz.SalesOrder, len(orders))
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
		SalesOrderID int `json:"sales_order_id,omitempty"`
		Count        int `json:"count,omitempty"`
	}
	if err := r.data.postgres.SalesOrderItem.Query().
		Where(salesorderitem.SalesOrderIDIn(orderIDs...)).
		GroupBy(salesorderitem.FieldSalesOrderID).
		Aggregate(ent.Count()).
		Scan(ctx, &counts); err != nil {
		return err
	}
	for _, count := range counts {
		if order := byID[count.SalesOrderID]; order != nil {
			itemCount := count.Count
			order.ItemCount = &itemCount
		}
	}
	return nil
}

func applySalesOrderDateRange(query *ent.SalesOrderQuery, filter biz.SalesOrderFilter) *ent.SalesOrderQuery {
	switch filter.DateField {
	case "planned_delivery_date":
		if filter.DateFrom != nil {
			query = query.Where(salesorder.PlannedDeliveryDateGTE(*filter.DateFrom))
		}
		if filter.DateTo != nil {
			query = query.Where(salesorder.PlannedDeliveryDateLTE(*filter.DateTo))
		}
	default:
		if filter.DateFrom != nil {
			query = query.Where(salesorder.OrderDateGTE(*filter.DateFrom))
		}
		if filter.DateTo != nil {
			query = query.Where(salesorder.OrderDateLTE(*filter.DateTo))
		}
	}
	return query
}

func salesOrderSortOrder(filter biz.SalesOrderFilter) salesorder.OrderOption {
	options := []sql.OrderTermOption{}
	if filter.SortDirection == "desc" {
		options = append(options, sql.OrderDesc())
	}

	switch filter.SortBy {
	case "order_date":
		return salesorder.ByOrderDate(options...)
	case "planned_delivery_date":
		return salesorder.ByPlannedDeliveryDate(options...)
	}
	return salesorder.ByUpdatedAt(options...)
}

func (r *salesOrderRepo) UpdateSalesOrderLifecycle(ctx context.Context, id int, lifecycleStatus string) (*biz.SalesOrder, error) {
	if lifecycleStatus == biz.SalesOrderStatusCanceled {
		return r.cancelSalesOrderLifecycle(ctx, id, 0)
	}
	allowedCurrent := salesOrderLifecyclePredecessors(lifecycleStatus)
	if len(allowedCurrent) == 0 {
		return nil, biz.ErrBadParam
	}
	affected, err := r.data.postgres.SalesOrder.Update().
		Where(
			salesorder.ID(id),
			salesorder.LifecycleStatusIn(allowedCurrent...),
		).
		SetLifecycleStatus(lifecycleStatus).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	row, err := r.data.postgres.SalesOrder.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSalesOrderNotFound
		}
		return nil, err
	}
	if affected == 0 && row.LifecycleStatus != lifecycleStatus {
		return nil, biz.ErrBadParam
	}
	return entSalesOrderToBiz(row), nil
}

func (r *salesOrderRepo) CancelSalesOrderWithActor(ctx context.Context, id int, actorID int) (*biz.SalesOrder, error) {
	if actorID <= 0 {
		return nil, biz.ErrBadParam
	}
	return r.cancelSalesOrderLifecycle(ctx, id, actorID)
}

func (r *salesOrderRepo) SubmitSalesOrderForProcessCommand(
	ctx context.Context,
	salesOrderID int,
	command *biz.ProcessDomainCommandInput,
	result *biz.ProcessDomainCommandResult,
	actorID int,
) (*biz.SalesOrder, error) {
	if r == nil || r.data == nil || r.data.postgres == nil || salesOrderID <= 0 || command == nil || result == nil {
		return nil, biz.ErrBadParam
	}
	record, err := biz.BuildProcessNodeDomainCommandResultRecord(command, result)
	if err != nil {
		return nil, err
	}
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)
	affected, err := tx.SalesOrder.Update().
		Where(salesorder.ID(salesOrderID), salesorder.LifecycleStatus(biz.SalesOrderStatusDraft)).
		SetLifecycleStatus(biz.SalesOrderStatusSubmitted).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	row, err := tx.SalesOrder.Get(ctx, salesOrderID)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSalesOrderNotFound
		}
		return nil, err
	}
	if affected == 0 {
		if row.LifecycleStatus != biz.SalesOrderStatusSubmitted {
			return nil, biz.ErrBadParam
		}
		node, err := getProcessNodeInstanceWithClient(ctx, tx.Client(), record.ProcessNodeInstanceID)
		if err != nil {
			return nil, err
		}
		if node.DomainCommandResultHash == nil {
			// A submitted order alone cannot prove that this exact command caused
			// the transition; result-missing rows require explicit review.
			return nil, biz.ErrProcessDomainCommandRecoveryRequired
		}
	}
	if _, err := recordProcessNodeDomainCommandResultWithClient(ctx, tx.Client(), record, actorID); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return entSalesOrderToBiz(row), nil
}

func (r *salesOrderRepo) cancelSalesOrderLifecycle(ctx context.Context, id int, actorID int) (*biz.SalesOrder, error) {
	allowedCurrent := salesOrderLifecyclePredecessors(biz.SalesOrderStatusCanceled)
	if len(allowedCurrent) == 0 {
		return nil, biz.ErrBadParam
	}
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackEntTx(ctx, tx, r.log)
	query := tx.SalesOrder.Query().Where(salesorder.ID(id))
	if r.data.sqlDialect == dialect.Postgres {
		query = query.Where(func(selector *sql.Selector) { selector.ForUpdate() })
	}
	row, err := query.Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSalesOrderNotFound
		}
		return nil, err
	}
	if row.LifecycleStatus == biz.SalesOrderStatusCanceled {
		return entSalesOrderToBiz(row), nil
	}
	if !containsString(allowedCurrent, row.LifecycleStatus) {
		return nil, biz.ErrBadParam
	}
	if err := validateSalesOrderCancellationDependencies(ctx, tx, id); err != nil {
		return nil, err
	}
	row, err = tx.SalesOrder.UpdateOneID(id).
		SetLifecycleStatus(biz.SalesOrderStatusCanceled).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	if err := markProcessDomainCommandEffectCompensatedWithClient(
		ctx,
		tx.Client(),
		biz.ProcessDomainCommandSalesOrderSubmit,
		"sales_order",
		id,
		"销售订单已取消，原提交流程结果需要核对",
		actorID,
	); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return entSalesOrderToBiz(row), nil
}

func validateSalesOrderCancellationDependencies(ctx context.Context, tx *ent.Tx, salesOrderID int) error {
	hasShipment, err := tx.Shipment.Query().Where(
		shipment.SalesOrderID(salesOrderID),
		shipment.StatusNEQ(biz.ShipmentStatusCancelled),
	).Exist(ctx)
	if err != nil {
		return err
	}
	if hasShipment {
		return biz.ErrSalesOrderCancellationShipmentDependency
	}
	hasReservation, err := tx.StockReservation.Query().Where(
		stockreservation.SalesOrderID(salesOrderID),
		stockreservation.Status(biz.StockReservationStatusActive),
	).Exist(ctx)
	if err != nil {
		return err
	}
	if hasReservation {
		return biz.ErrSalesOrderCancellationReservationDependency
	}
	hasProduction, err := tx.ProductionOrder.Query().Where(
		productionorder.StatusNEQ(biz.ProductionOrderStatusCancelled),
		productionorder.HasItemsWith(
			productionorderitem.HasSalesOrderItemWith(salesorderitem.SalesOrderID(salesOrderID)),
		),
	).Exist(ctx)
	if err != nil {
		return err
	}
	if hasProduction {
		return biz.ErrSalesOrderCancellationProductionDependency
	}
	hasActiveProcess, err := tx.ProcessInstance.Query().Where(
		processinstance.ProcessKey(biz.ProcessKeySalesOrderAcceptance),
		processinstance.BusinessRefType("sales_order"),
		processinstance.BusinessRefID(salesOrderID),
		processinstance.Status(biz.ProcessStatusActive),
	).Exist(ctx)
	if err != nil {
		return err
	}
	if hasActiveProcess {
		return biz.ErrSalesOrderCancellationProcessDependency
	}
	return nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func (r *salesOrderRepo) AddSalesOrderItem(ctx context.Context, in *biz.SalesOrderItemMutation) (*biz.SalesOrderItem, error) {
	row, err := r.data.postgres.SalesOrderItem.Create().
		SetSalesOrderID(in.SalesOrderID).
		SetLineNo(in.LineNo).
		SetProductID(in.ProductID).
		SetNillableProductSkuID(in.ProductSkuID).
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
	if in.ProductSkuID == nil {
		update.ClearProductSkuID()
	} else {
		update.SetProductSkuID(*in.ProductSkuID)
	}
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

func (r *salesOrderRepo) SaveSalesOrderWithItems(ctx context.Context, id int, in *biz.SalesOrderMutation, items []*biz.SalesOrderItemSaveMutation) (*biz.SalesOrderWithItems, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() {
		if tx != nil {
			rollbackEntTx(ctx, tx, r.log)
		}
	}()

	var orderRow *ent.SalesOrder
	if id > 0 {
		update := tx.SalesOrder.Update().
			Where(
				salesorder.ID(id),
				salesorder.LifecycleStatus(biz.SalesOrderStatusDraft),
				salesorder.Version(in.ExpectedVersion),
			).
			SetOrderNo(in.OrderNo).
			SetCustomerID(in.CustomerID).
			SetCustomerSnapshot(in.CustomerSnapshot).
			SetContactSnapshot(in.ContactSnapshot).
			SetOrderDate(in.OrderDate).
			SetVersion(in.ExpectedVersion + 1)
		if in.CustomerOrderNo == nil {
			update.ClearCustomerOrderNo()
		} else {
			update.SetCustomerOrderNo(*in.CustomerOrderNo)
		}
		if in.SalesOwner == nil {
			update.ClearSalesOwner()
		} else {
			update.SetSalesOwner(*in.SalesOwner)
		}
		if in.PaymentMethod == nil {
			update.ClearPaymentMethod()
		} else {
			update.SetPaymentMethod(*in.PaymentMethod)
		}
		if in.PaymentTermDays == nil {
			update.ClearPaymentTermDays()
		} else {
			update.SetPaymentTermDays(*in.PaymentTermDays)
		}
		if in.PriceConditionNote == nil {
			update.ClearPriceConditionNote()
		} else {
			update.SetPriceConditionNote(*in.PriceConditionNote)
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
		affected, err := update.Save(ctx)
		if err != nil {
			return nil, err
		}
		if affected == 0 {
			current, err := tx.SalesOrder.Get(ctx, id)
			if err != nil {
				if ent.IsNotFound(err) {
					return nil, biz.ErrSalesOrderNotFound
				}
				return nil, err
			}
			if current.LifecycleStatus != biz.SalesOrderStatusDraft {
				return nil, biz.ErrBadParam
			}
			if current.Version != in.ExpectedVersion {
				return nil, biz.ErrSalesOrderConflict
			}
			return nil, biz.ErrSalesOrderConflict
		}
		orderRow, err = tx.SalesOrder.Get(ctx, id)
		if err != nil {
			return nil, err
		}
	} else {
		orderRow, err = tx.SalesOrder.Create().
			SetOrderNo(in.OrderNo).
			SetCustomerID(in.CustomerID).
			SetNillableCustomerOrderNo(in.CustomerOrderNo).
			SetCustomerSnapshot(in.CustomerSnapshot).
			SetNillableSalesOwner(in.SalesOwner).
			SetContactSnapshot(in.ContactSnapshot).
			SetNillablePaymentMethod(in.PaymentMethod).
			SetNillablePaymentTermDays(in.PaymentTermDays).
			SetNillablePriceConditionNote(in.PriceConditionNote).
			SetOrderDate(in.OrderDate).
			SetNillablePlannedDeliveryDate(in.PlannedDeliveryDate).
			SetLifecycleStatus(biz.SalesOrderStatusDraft).
			SetNillableNote(in.Note).
			Save(ctx)
		if err != nil {
			return nil, err
		}
	}

	existingOpenItems, err := tx.SalesOrderItem.Query().
		Where(
			salesorderitem.SalesOrderID(orderRow.ID),
			salesorderitem.LineStatus(biz.SalesOrderItemStatusOpen),
		).
		All(ctx)
	if err != nil {
		return nil, err
	}
	submittedIDs := map[int]struct{}{}
	for _, item := range items {
		mutation := item.SalesOrderItemMutation
		mutation.SalesOrderID = orderRow.ID
		if item.ID > 0 {
			current, err := tx.SalesOrderItem.Query().
				Where(salesorderitem.ID(item.ID), salesorderitem.SalesOrderID(orderRow.ID)).
				Only(ctx)
			if err != nil {
				if ent.IsNotFound(err) {
					return nil, biz.ErrSalesOrderItemNotFound
				}
				return nil, err
			}
			if current.LineStatus == biz.SalesOrderItemStatusCanceled || current.LineStatus == biz.SalesOrderItemStatusClosed {
				return nil, biz.ErrBadParam
			}
			if _, err := saveSalesOrderItemUpdate(ctx, tx, item.ID, &mutation); err != nil {
				return nil, err
			}
			submittedIDs[item.ID] = struct{}{}
			continue
		}
		if _, err := tx.SalesOrderItem.Create().
			SetSalesOrderID(mutation.SalesOrderID).
			SetLineNo(mutation.LineNo).
			SetProductID(mutation.ProductID).
			SetNillableProductSkuID(mutation.ProductSkuID).
			SetUnitID(mutation.UnitID).
			SetNillableProductCodeSnapshot(mutation.ProductCodeSnapshot).
			SetNillableProductNameSnapshot(mutation.ProductNameSnapshot).
			SetNillableColorSnapshot(mutation.ColorSnapshot).
			SetOrderedQuantity(mutation.OrderedQuantity).
			SetNillableUnitPrice(mutation.UnitPrice).
			SetNillableAmount(mutation.Amount).
			SetNillablePlannedDeliveryDate(mutation.PlannedDeliveryDate).
			SetLineStatus(biz.SalesOrderItemStatusOpen).
			SetNillableNote(mutation.Note).
			Save(ctx); err != nil {
			return nil, err
		}
	}

	for _, existing := range existingOpenItems {
		if _, ok := submittedIDs[existing.ID]; ok {
			continue
		}
		if _, err := tx.SalesOrderItem.UpdateOneID(existing.ID).
			SetLineStatus(biz.SalesOrderItemStatusCanceled).
			Save(ctx); err != nil {
			return nil, err
		}
	}

	itemRows, err := tx.SalesOrderItem.Query().
		Where(salesorderitem.SalesOrderID(orderRow.ID)).
		Order(ent.Asc(salesorderitem.FieldLineNo), ent.Asc(salesorderitem.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return &biz.SalesOrderWithItems{
		Order: entSalesOrderToBiz(orderRow),
		Items: entSalesOrderItemsToBiz(itemRows),
	}, nil
}

func salesOrderLifecyclePredecessors(next string) []string {
	statuses := []string{
		biz.SalesOrderStatusDraft,
		biz.SalesOrderStatusSubmitted,
		biz.SalesOrderStatusActive,
		biz.SalesOrderStatusClosed,
		biz.SalesOrderStatusCanceled,
	}
	allowed := make([]string, 0, len(statuses))
	for _, current := range statuses {
		if biz.IsSalesOrderLifecycleTransitionAllowed(current, next) {
			allowed = append(allowed, current)
		}
	}
	return allowed
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

func (r *salesOrderRepo) ProductSKUIsActiveForProduct(ctx context.Context, skuID int, productID int) (bool, error) {
	row, err := r.data.postgres.ProductSKU.Query().Where(productsku.ID(skuID), productsku.ProductID(productID)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrProductSKUNotFound
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

func saveSalesOrderItemUpdate(ctx context.Context, tx *ent.Tx, id int, in *biz.SalesOrderItemMutation) (*ent.SalesOrderItem, error) {
	update := tx.SalesOrderItem.UpdateOneID(id).
		SetSalesOrderID(in.SalesOrderID).
		SetLineNo(in.LineNo).
		SetProductID(in.ProductID).
		SetUnitID(in.UnitID).
		SetOrderedQuantity(in.OrderedQuantity)
	if in.ProductSkuID == nil {
		update.ClearProductSkuID()
	} else {
		update.SetProductSkuID(*in.ProductSkuID)
	}
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
	return row, nil
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
		SalesOwner:          row.SalesOwner,
		ContactSnapshot:     row.ContactSnapshot,
		PaymentMethod:       row.PaymentMethod,
		PaymentTermDays:     row.PaymentTermDays,
		PriceConditionNote:  row.PriceConditionNote,
		OrderDate:           row.OrderDate,
		PlannedDeliveryDate: row.PlannedDeliveryDate,
		LifecycleStatus:     row.LifecycleStatus,
		Version:             row.Version,
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
		ProductSkuID:        row.ProductSkuID,
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
