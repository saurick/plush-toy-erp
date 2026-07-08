package biz

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

type outsourcingOrderRepoStub struct {
	orders             map[int]*OutsourcingOrder
	items              map[int]*OutsourcingOrderItem
	supplierActive     map[int]bool
	productActive      map[int]bool
	unitActive         map[int]bool
	processActive      map[int]bool
	processOutsourcing map[int]bool
	savedOrderID       int
	savedOrder         *OutsourcingOrderMutation
	savedItems         []*OutsourcingOrderItemSaveMutation
	nextStatus         string
}

func (s *outsourcingOrderRepoStub) GetOutsourcingOrder(_ context.Context, id int) (*OutsourcingOrder, error) {
	order, ok := s.orders[id]
	if !ok {
		return nil, ErrOutsourcingOrderNotFound
	}
	return order, nil
}

func (s *outsourcingOrderRepoStub) ListOutsourcingOrders(context.Context, OutsourcingOrderFilter) ([]*OutsourcingOrder, int, error) {
	return nil, 0, nil
}

func (s *outsourcingOrderRepoStub) UpdateOutsourcingOrderLifecycle(_ context.Context, id int, lifecycleStatus string) (*OutsourcingOrder, error) {
	s.nextStatus = lifecycleStatus
	return &OutsourcingOrder{ID: id, LifecycleStatus: lifecycleStatus}, nil
}

func (s *outsourcingOrderRepoStub) SaveOutsourcingOrderWithItems(_ context.Context, id int, order *OutsourcingOrderMutation, items []*OutsourcingOrderItemSaveMutation) (*OutsourcingOrderWithItems, error) {
	s.savedOrderID = id
	cp := *order
	s.savedOrder = &cp
	s.savedItems = items
	return &OutsourcingOrderWithItems{
		Order: &OutsourcingOrder{ID: 1, OutsourcingOrderNo: order.OutsourcingOrderNo, SupplierID: order.SupplierID, LifecycleStatus: OutsourcingOrderStatusDraft},
		Items: []*OutsourcingOrderItem{{ID: 1, OutsourcingOrderID: 1, LineNo: items[0].LineNo, ProductID: items[0].ProductID, ProcessID: items[0].ProcessID, UnitID: items[0].UnitID, OutsourcingQuantity: items[0].OutsourcingQuantity, LineStatus: OutsourcingOrderItemStatusOpen}},
	}, nil
}

func (s *outsourcingOrderRepoStub) ListOutsourcingOrderItems(context.Context, OutsourcingOrderItemFilter) ([]*OutsourcingOrderItem, int, error) {
	return nil, 0, nil
}

func (s *outsourcingOrderRepoStub) GetOutsourcingOrderItem(_ context.Context, id int) (*OutsourcingOrderItem, error) {
	item, ok := s.items[id]
	if !ok {
		return nil, ErrOutsourcingOrderItemNotFound
	}
	return item, nil
}

func (s *outsourcingOrderRepoStub) SupplierIsActive(_ context.Context, id int) (bool, error) {
	active, ok := s.supplierActive[id]
	if !ok {
		return false, ErrSupplierNotFound
	}
	return active, nil
}

func (s *outsourcingOrderRepoStub) ProductIsActive(_ context.Context, id int) (bool, error) {
	active, ok := s.productActive[id]
	if !ok {
		return false, ErrProductNotFound
	}
	return active, nil
}

func (s *outsourcingOrderRepoStub) UnitIsActive(_ context.Context, id int) (bool, error) {
	active, ok := s.unitActive[id]
	if !ok {
		return false, ErrUnitNotFound
	}
	return active, nil
}

func (s *outsourcingOrderRepoStub) ProcessIsUsableForOutsourcing(_ context.Context, id int) (bool, bool, error) {
	active, ok := s.processActive[id]
	if !ok {
		return false, false, ErrProcessInactive
	}
	return active, s.processOutsourcing[id], nil
}

func TestOutsourcingOrderUsecaseSaveGuardsSupplierProductProcessAndUnit(t *testing.T) {
	ctx := context.Background()
	repo := &outsourcingOrderRepoStub{
		supplierActive:     map[int]bool{1: true, 2: false},
		productActive:      map[int]bool{10: true, 11: false},
		unitActive:         map[int]bool{20: true, 21: false},
		processActive:      map[int]bool{30: true, 31: false, 32: true},
		processOutsourcing: map[int]bool{30: true, 32: false},
	}
	uc := NewOutsourcingOrderUsecase(repo)
	orderDate := time.Date(2026, 6, 17, 0, 0, 0, 0, time.UTC)
	expectedReturnDate := orderDate.AddDate(0, 0, 1)
	qty := decimal.NewFromInt(12)
	price := decimal.NewFromFloat(3.2)
	productOrderNo := " SO-26001 "

	result, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{
		OutsourcingOrderNo: " OUT-001 ",
		SupplierID:         1,
		SupplierSnapshot:   map[string]any{"name": "加工厂 A"},
		OrderDate:          orderDate,
		ExpectedReturnDate: &expectedReturnDate,
	}, []*OutsourcingOrderItemSaveMutation{
		{
			OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{
				LineNo:                 1,
				ProductID:              10,
				ProcessID:              30,
				UnitID:                 20,
				ProductOrderNoSnapshot: &productOrderNo,
				OutsourcingQuantity:    qty,
				UnitPrice:              &price,
			},
		},
	})
	if err != nil {
		t.Fatalf("save outsourcing order failed: %v", err)
	}
	if result.Order.LifecycleStatus != OutsourcingOrderStatusDraft || len(result.Items) != 1 {
		t.Fatalf("expected draft outsourcing order with one line, got %#v", result)
	}
	if repo.savedOrder.OutsourcingOrderNo != "OUT-001" || !repo.savedItems[0].OutsourcingQuantity.Equal(qty) {
		t.Fatalf("expected normalized saved mutation, got order=%#v items=%#v", repo.savedOrder, repo.savedItems)
	}
	if repo.savedItems[0].ProductOrderNoSnapshot == nil || *repo.savedItems[0].ProductOrderNoSnapshot != "SO-26001" {
		t.Fatalf("expected normalized product order no snapshot, got %#v", repo.savedItems[0].ProductOrderNoSnapshot)
	}

	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-002", SupplierID: 2, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, ProductID: 10, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrSupplierInactive) {
		t.Fatalf("expected inactive supplier rejected, got %v", err)
	}
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-003", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, ProductID: 11, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrProductInactive) {
		t.Fatalf("expected inactive product rejected, got %v", err)
	}
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-004", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, ProductID: 10, ProcessID: 31, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrProcessInactive) {
		t.Fatalf("expected inactive process rejected, got %v", err)
	}
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-005", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, ProductID: 10, ProcessID: 32, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrProcessNotOutsourcingEnabled) {
		t.Fatalf("expected non-outsourcing process rejected, got %v", err)
	}
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-006", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, ProductID: 10, ProcessID: 30, UnitID: 21, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrUnitInactive) {
		t.Fatalf("expected inactive unit rejected, got %v", err)
	}
	beforeOrderDate := orderDate.AddDate(0, 0, -1)
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-BAD-DATE", SupplierID: 1, OrderDate: orderDate, ExpectedReturnDate: &beforeOrderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, ProductID: 10, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected expected return before order date rejected, got %v", err)
	}
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-BAD-LINE-DATE", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, ProductID: 10, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty, ExpectedReturnDate: &beforeOrderDate}}}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected line expected return before order date rejected, got %v", err)
	}
}

func TestOutsourcingOrderUsecaseLifecycleGuards(t *testing.T) {
	ctx := context.Background()
	repo := &outsourcingOrderRepoStub{
		orders: map[int]*OutsourcingOrder{
			1: {ID: 1, LifecycleStatus: OutsourcingOrderStatusDraft},
			2: {ID: 2, LifecycleStatus: OutsourcingOrderStatusSubmitted},
			3: {ID: 3, LifecycleStatus: OutsourcingOrderStatusConfirmed},
			4: {ID: 4, LifecycleStatus: OutsourcingOrderStatusClosed},
		},
	}
	uc := NewOutsourcingOrderUsecase(repo)

	if _, err := uc.SubmitOutsourcingOrder(ctx, 1); err != nil || repo.nextStatus != OutsourcingOrderStatusSubmitted {
		t.Fatalf("expected draft -> submitted allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if _, err := uc.ConfirmOutsourcingOrder(ctx, 2); err != nil || repo.nextStatus != OutsourcingOrderStatusConfirmed {
		t.Fatalf("expected submitted -> confirmed allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if _, err := uc.CloseOutsourcingOrder(ctx, 3); err != nil || repo.nextStatus != OutsourcingOrderStatusClosed {
		t.Fatalf("expected confirmed -> closed allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if _, err := uc.ConfirmOutsourcingOrder(ctx, 1); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected draft -> confirmed rejected, got %v", err)
	}
	if _, err := uc.CancelOutsourcingOrder(ctx, 1); err != nil || repo.nextStatus != OutsourcingOrderStatusCanceled {
		t.Fatalf("expected draft -> canceled allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if IsValidOutsourcingOrderStatus("posted") || IsOutsourcingOrderLifecycleTransitionAllowed(OutsourcingOrderStatusConfirmed, "posted") {
		t.Fatalf("posted must not be an outsourcing order lifecycle status")
	}
	if _, err := uc.CancelOutsourcingOrder(ctx, 4); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected settled order transition rejected, got %v", err)
	}
}
