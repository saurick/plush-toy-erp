package biz

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

type salesOrderRepoStub struct {
	orders         map[int]*SalesOrder
	items          map[int]*SalesOrderItem
	customerActive map[int]bool
	productActive  map[int]bool
	unitActive     map[int]bool
	createdOrder   *SalesOrderMutation
	createdItem    *SalesOrderItemMutation
	nextStatus     string
}

func (s *salesOrderRepoStub) CreateSalesOrder(_ context.Context, in *SalesOrderMutation) (*SalesOrder, error) {
	cp := *in
	s.createdOrder = &cp
	return &SalesOrder{ID: 1, OrderNo: in.OrderNo, CustomerID: in.CustomerID, LifecycleStatus: SalesOrderStatusDraft}, nil
}

func (s *salesOrderRepoStub) UpdateSalesOrder(context.Context, int, *SalesOrderMutation) (*SalesOrder, error) {
	return nil, nil
}

func (s *salesOrderRepoStub) GetSalesOrder(_ context.Context, id int) (*SalesOrder, error) {
	order, ok := s.orders[id]
	if !ok {
		return nil, ErrSalesOrderNotFound
	}
	return order, nil
}

func (s *salesOrderRepoStub) ListSalesOrders(context.Context, SalesOrderFilter) ([]*SalesOrder, int, error) {
	return nil, 0, nil
}

func (s *salesOrderRepoStub) UpdateSalesOrderLifecycle(_ context.Context, id int, lifecycleStatus string) (*SalesOrder, error) {
	s.nextStatus = lifecycleStatus
	return &SalesOrder{ID: id, LifecycleStatus: lifecycleStatus}, nil
}

func (s *salesOrderRepoStub) AddSalesOrderItem(_ context.Context, in *SalesOrderItemMutation) (*SalesOrderItem, error) {
	cp := *in
	s.createdItem = &cp
	return &SalesOrderItem{ID: 1, SalesOrderID: in.SalesOrderID, LineNo: in.LineNo, ProductID: in.ProductID, UnitID: in.UnitID, OrderedQuantity: in.OrderedQuantity, LineStatus: SalesOrderItemStatusOpen}, nil
}

func (s *salesOrderRepoStub) UpdateSalesOrderItem(context.Context, int, *SalesOrderItemMutation) (*SalesOrderItem, error) {
	return nil, nil
}

func (s *salesOrderRepoStub) GetSalesOrderItem(_ context.Context, id int) (*SalesOrderItem, error) {
	item, ok := s.items[id]
	if !ok {
		return nil, ErrSalesOrderItemNotFound
	}
	return item, nil
}

func (s *salesOrderRepoStub) UpdateSalesOrderItemStatus(_ context.Context, id int, lineStatus string) (*SalesOrderItem, error) {
	item := *s.items[id]
	item.LineStatus = lineStatus
	return &item, nil
}

func (s *salesOrderRepoStub) ListSalesOrderItems(context.Context, SalesOrderItemFilter) ([]*SalesOrderItem, int, error) {
	return nil, 0, nil
}

func (s *salesOrderRepoStub) CustomerIsActive(_ context.Context, id int) (bool, error) {
	active, ok := s.customerActive[id]
	if !ok {
		return false, ErrCustomerNotFound
	}
	return active, nil
}

func (s *salesOrderRepoStub) ProductIsActive(_ context.Context, id int) (bool, error) {
	active, ok := s.productActive[id]
	if !ok {
		return false, ErrProductNotFound
	}
	return active, nil
}

func (s *salesOrderRepoStub) UnitIsActive(_ context.Context, id int) (bool, error) {
	active, ok := s.unitActive[id]
	if !ok {
		return false, ErrUnitNotFound
	}
	return active, nil
}

func TestSalesOrderUsecaseCreateGuardsCustomer(t *testing.T) {
	ctx := context.Background()
	repo := &salesOrderRepoStub{customerActive: map[int]bool{10: true, 11: false}}
	uc := NewSalesOrderUsecase(repo)
	orderDate := time.Date(2026, 5, 31, 0, 0, 0, 0, time.UTC)
	customerOrderNo := "  PO-001 "

	order, err := uc.CreateSalesOrder(ctx, &SalesOrderMutation{
		OrderNo:         " SO-001 ",
		CustomerID:      10,
		CustomerOrderNo: &customerOrderNo,
		OrderDate:       orderDate,
	})
	if err != nil {
		t.Fatalf("create sales order failed: %v", err)
	}
	if order.LifecycleStatus != SalesOrderStatusDraft {
		t.Fatalf("expected draft sales order, got %#v", order)
	}
	if repo.createdOrder.OrderNo != "SO-001" || repo.createdOrder.CustomerOrderNo == nil || *repo.createdOrder.CustomerOrderNo != "PO-001" {
		t.Fatalf("expected normalized order mutation, got %#v", repo.createdOrder)
	}

	if _, err := uc.CreateSalesOrder(ctx, &SalesOrderMutation{OrderNo: "SO-002", CustomerID: 999, OrderDate: orderDate}); !errors.Is(err, ErrCustomerNotFound) {
		t.Fatalf("expected missing customer rejected, got %v", err)
	}
	if _, err := uc.CreateSalesOrder(ctx, &SalesOrderMutation{OrderNo: "SO-003", CustomerID: 11, OrderDate: orderDate}); !errors.Is(err, ErrCustomerInactive) {
		t.Fatalf("expected inactive customer rejected, got %v", err)
	}
}

func TestSalesOrderUsecaseLifecycleGuards(t *testing.T) {
	ctx := context.Background()
	repo := &salesOrderRepoStub{
		orders: map[int]*SalesOrder{
			1: {ID: 1, LifecycleStatus: SalesOrderStatusDraft},
			2: {ID: 2, LifecycleStatus: SalesOrderStatusSubmitted},
			3: {ID: 3, LifecycleStatus: SalesOrderStatusActive},
			4: {ID: 4, LifecycleStatus: SalesOrderStatusClosed},
		},
	}
	uc := NewSalesOrderUsecase(repo)

	if _, err := uc.SubmitSalesOrder(ctx, 1); err != nil || repo.nextStatus != SalesOrderStatusSubmitted {
		t.Fatalf("expected draft -> submitted allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if _, err := uc.ActivateSalesOrder(ctx, 2); err != nil || repo.nextStatus != SalesOrderStatusActive {
		t.Fatalf("expected submitted -> active allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if _, err := uc.CloseSalesOrder(ctx, 3); err != nil || repo.nextStatus != SalesOrderStatusClosed {
		t.Fatalf("expected active -> closed allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if _, err := uc.ActivateSalesOrder(ctx, 1); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected draft -> active rejected, got %v", err)
	}
	if _, err := uc.CancelSalesOrder(ctx, 1); err != nil || repo.nextStatus != SalesOrderStatusCanceled {
		t.Fatalf("expected draft -> canceled allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if IsValidSalesOrderStatus("shipped") || IsSalesOrderLifecycleTransitionAllowed(SalesOrderStatusActive, "shipped") {
		t.Fatalf("shipped must not be a sales order lifecycle status")
	}
	if _, err := uc.CancelSalesOrder(ctx, 4); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected settled order transition rejected, got %v", err)
	}
}

func TestSalesOrderUsecaseItemGuards(t *testing.T) {
	ctx := context.Background()
	repo := &salesOrderRepoStub{
		orders: map[int]*SalesOrder{
			1: {ID: 1, LifecycleStatus: SalesOrderStatusDraft},
			2: {ID: 2, LifecycleStatus: SalesOrderStatusClosed},
		},
		items: map[int]*SalesOrderItem{
			10: {ID: 10, SalesOrderID: 1, LineStatus: SalesOrderItemStatusOpen},
		},
		customerActive: map[int]bool{1: true},
		productActive:  map[int]bool{100: true, 101: false},
		unitActive:     map[int]bool{200: true, 201: false},
	}
	uc := NewSalesOrderUsecase(repo)

	qty := decimal.NewFromInt(12)
	price := decimal.NewFromInt(3)
	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{
		SalesOrderID:    1,
		LineNo:          1,
		ProductID:       100,
		UnitID:          200,
		OrderedQuantity: qty,
		UnitPrice:       &price,
	}); err != nil {
		t.Fatalf("add sales order item failed: %v", err)
	}
	if !repo.createdItem.OrderedQuantity.Equal(qty) {
		t.Fatalf("expected ordered quantity retained, got %s", repo.createdItem.OrderedQuantity)
	}

	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{SalesOrderID: 2, LineNo: 1, ProductID: 100, UnitID: 200, OrderedQuantity: qty}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected closed order item add rejected, got %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{SalesOrderID: 1, LineNo: 1, ProductID: 999, UnitID: 200, OrderedQuantity: qty}); !errors.Is(err, ErrProductNotFound) {
		t.Fatalf("expected missing product rejected, got %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{SalesOrderID: 1, LineNo: 1, ProductID: 101, UnitID: 200, OrderedQuantity: qty}); !errors.Is(err, ErrProductInactive) {
		t.Fatalf("expected inactive product rejected, got %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{SalesOrderID: 1, LineNo: 1, ProductID: 100, UnitID: 999, OrderedQuantity: qty}); !errors.Is(err, ErrUnitNotFound) {
		t.Fatalf("expected missing unit rejected, got %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{SalesOrderID: 1, LineNo: 1, ProductID: 100, UnitID: 201, OrderedQuantity: qty}); !errors.Is(err, ErrUnitInactive) {
		t.Fatalf("expected inactive unit rejected, got %v", err)
	}
	if _, err := uc.AddSalesOrderItem(ctx, &SalesOrderItemMutation{SalesOrderID: 1, LineNo: 1, ProductID: 100, UnitID: 200, OrderedQuantity: decimal.Zero}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero ordered quantity rejected, got %v", err)
	}

	removed, err := uc.RemoveSalesOrderItem(ctx, 10)
	if err != nil {
		t.Fatalf("remove sales order item failed: %v", err)
	}
	if removed.LineStatus != SalesOrderItemStatusCanceled {
		t.Fatalf("expected removed item canceled, got %#v", removed)
	}
}
