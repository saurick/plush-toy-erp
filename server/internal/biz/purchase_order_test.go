package biz

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

type purchaseOrderRepoStub struct {
	orders         map[int]*PurchaseOrder
	items          map[int]*PurchaseOrderItem
	supplierActive map[int]bool
	materialActive map[int]bool
	unitActive     map[int]bool
	createdOrder   *PurchaseOrderMutation
	createdItem    *PurchaseOrderItemMutation
	savedOrderID   int
	savedItems     []*PurchaseOrderItemSaveMutation
	nextStatus     string
}

func (s *purchaseOrderRepoStub) CreatePurchaseOrder(_ context.Context, in *PurchaseOrderMutation) (*PurchaseOrder, error) {
	cp := *in
	s.createdOrder = &cp
	return &PurchaseOrder{ID: 1, PurchaseOrderNo: in.PurchaseOrderNo, SupplierID: in.SupplierID, LifecycleStatus: PurchaseOrderStatusDraft}, nil
}

func (s *purchaseOrderRepoStub) UpdatePurchaseOrder(context.Context, int, *PurchaseOrderMutation) (*PurchaseOrder, error) {
	return nil, nil
}

func (s *purchaseOrderRepoStub) GetPurchaseOrder(_ context.Context, id int) (*PurchaseOrder, error) {
	order, ok := s.orders[id]
	if !ok {
		return nil, ErrPurchaseOrderNotFound
	}
	return order, nil
}

func (s *purchaseOrderRepoStub) ListPurchaseOrders(context.Context, PurchaseOrderFilter) ([]*PurchaseOrder, int, error) {
	return nil, 0, nil
}

func (s *purchaseOrderRepoStub) UpdatePurchaseOrderLifecycle(_ context.Context, id int, lifecycleStatus string) (*PurchaseOrder, error) {
	s.nextStatus = lifecycleStatus
	return &PurchaseOrder{ID: id, LifecycleStatus: lifecycleStatus}, nil
}

func (s *purchaseOrderRepoStub) AddPurchaseOrderItem(_ context.Context, in *PurchaseOrderItemMutation) (*PurchaseOrderItem, error) {
	cp := *in
	s.createdItem = &cp
	return &PurchaseOrderItem{ID: 1, PurchaseOrderID: in.PurchaseOrderID, LineNo: in.LineNo, MaterialID: in.MaterialID, UnitID: in.UnitID, PurchasedQuantity: in.PurchasedQuantity, LineStatus: PurchaseOrderItemStatusOpen}, nil
}

func (s *purchaseOrderRepoStub) UpdatePurchaseOrderItem(context.Context, int, *PurchaseOrderItemMutation) (*PurchaseOrderItem, error) {
	return nil, nil
}

func (s *purchaseOrderRepoStub) GetPurchaseOrderItem(_ context.Context, id int) (*PurchaseOrderItem, error) {
	item, ok := s.items[id]
	if !ok {
		return nil, ErrPurchaseOrderItemNotFound
	}
	return item, nil
}

func (s *purchaseOrderRepoStub) UpdatePurchaseOrderItemStatus(_ context.Context, id int, lineStatus string) (*PurchaseOrderItem, error) {
	item := *s.items[id]
	item.LineStatus = lineStatus
	return &item, nil
}

func (s *purchaseOrderRepoStub) ListPurchaseOrderItems(context.Context, PurchaseOrderItemFilter) ([]*PurchaseOrderItem, int, error) {
	return nil, 0, nil
}

func (s *purchaseOrderRepoStub) SavePurchaseOrderWithItems(_ context.Context, id int, order *PurchaseOrderMutation, items []*PurchaseOrderItemSaveMutation) (*PurchaseOrderWithItems, error) {
	s.savedOrderID = id
	cp := *order
	s.createdOrder = &cp
	s.savedItems = items
	return &PurchaseOrderWithItems{
		Order: &PurchaseOrder{ID: 1, PurchaseOrderNo: order.PurchaseOrderNo, SupplierID: order.SupplierID, LifecycleStatus: PurchaseOrderStatusDraft},
		Items: []*PurchaseOrderItem{{ID: 1, PurchaseOrderID: 1, LineNo: items[0].LineNo, MaterialID: items[0].MaterialID, UnitID: items[0].UnitID, PurchasedQuantity: items[0].PurchasedQuantity, LineStatus: PurchaseOrderItemStatusOpen}},
	}, nil
}

func (s *purchaseOrderRepoStub) SupplierIsActive(_ context.Context, id int) (bool, error) {
	approved, ok := s.supplierActive[id]
	if !ok {
		return false, ErrSupplierNotFound
	}
	return approved, nil
}

func (s *purchaseOrderRepoStub) MaterialIsActive(_ context.Context, id int) (bool, error) {
	approved, ok := s.materialActive[id]
	if !ok {
		return false, ErrMaterialNotFound
	}
	return approved, nil
}

func (s *purchaseOrderRepoStub) UnitIsActive(_ context.Context, id int) (bool, error) {
	approved, ok := s.unitActive[id]
	if !ok {
		return false, ErrUnitNotFound
	}
	return approved, nil
}

func TestPurchaseOrderUsecaseCreateGuardsSupplier(t *testing.T) {
	ctx := context.Background()
	repo := &purchaseOrderRepoStub{supplierActive: map[int]bool{10: true, 11: false}}
	uc := NewPurchaseOrderUsecase(repo)
	orderDate := time.Date(2026, 5, 31, 0, 0, 0, 0, time.UTC)
	supplierPurchaseOrderNo := "  PO-001 "
	expectedArrivalDate := orderDate.AddDate(0, 0, 1)

	order, err := uc.CreatePurchaseOrder(ctx, &PurchaseOrderMutation{
		PurchaseOrderNo:         " PO-001 ",
		SupplierID:              10,
		SupplierPurchaseOrderNo: &supplierPurchaseOrderNo,
		PurchaseDate:            orderDate,
		ExpectedArrivalDate:     &expectedArrivalDate,
	})
	if err != nil {
		t.Fatalf("create purchase order failed: %v", err)
	}
	if order.LifecycleStatus != PurchaseOrderStatusDraft {
		t.Fatalf("expected draft purchase order, got %#v", order)
	}
	if repo.createdOrder.PurchaseOrderNo != "PO-001" || repo.createdOrder.SupplierPurchaseOrderNo == nil || *repo.createdOrder.SupplierPurchaseOrderNo != "PO-001" {
		t.Fatalf("expected normalized order mutation, got %#v", repo.createdOrder)
	}

	if _, err := uc.CreatePurchaseOrder(ctx, &PurchaseOrderMutation{PurchaseOrderNo: "PO-002", SupplierID: 999, PurchaseDate: orderDate}); !errors.Is(err, ErrSupplierNotFound) {
		t.Fatalf("expected missing supplier rejected, got %v", err)
	}
	if _, err := uc.CreatePurchaseOrder(ctx, &PurchaseOrderMutation{PurchaseOrderNo: "PO-003", SupplierID: 11, PurchaseDate: orderDate}); !errors.Is(err, ErrSupplierInactive) {
		t.Fatalf("expected inactive supplier rejected, got %v", err)
	}
	beforePurchaseDate := orderDate.AddDate(0, 0, -1)
	if _, err := uc.CreatePurchaseOrder(ctx, &PurchaseOrderMutation{PurchaseOrderNo: "PO-BAD-DATE", SupplierID: 10, PurchaseDate: orderDate, ExpectedArrivalDate: &beforePurchaseDate}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected expected arrival before purchase date rejected, got %v", err)
	}
}

func TestPurchaseOrderUsecaseLifecycleGuards(t *testing.T) {
	ctx := context.Background()
	repo := &purchaseOrderRepoStub{
		orders: map[int]*PurchaseOrder{
			1: {ID: 1, LifecycleStatus: PurchaseOrderStatusDraft},
			2: {ID: 2, LifecycleStatus: PurchaseOrderStatusSubmitted},
			3: {ID: 3, LifecycleStatus: PurchaseOrderStatusApproved},
			4: {ID: 4, LifecycleStatus: PurchaseOrderStatusClosed},
		},
	}
	uc := NewPurchaseOrderUsecase(repo)

	if _, err := uc.SubmitPurchaseOrder(ctx, 1); err != nil || repo.nextStatus != PurchaseOrderStatusSubmitted {
		t.Fatalf("expected draft -> submitted allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if _, err := uc.ApprovePurchaseOrder(ctx, 2); err != nil || repo.nextStatus != PurchaseOrderStatusApproved {
		t.Fatalf("expected submitted -> approved allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if _, err := uc.ClosePurchaseOrder(ctx, 3); err != nil || repo.nextStatus != PurchaseOrderStatusClosed {
		t.Fatalf("expected approved -> closed allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if _, err := uc.ApprovePurchaseOrder(ctx, 1); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected draft -> approved rejected, got %v", err)
	}
	if _, err := uc.CancelPurchaseOrder(ctx, 1); err != nil || repo.nextStatus != PurchaseOrderStatusCanceled {
		t.Fatalf("expected draft -> canceled allowed, status=%s err=%v", repo.nextStatus, err)
	}
	if IsValidPurchaseOrderStatus("shipped") || IsPurchaseOrderLifecycleTransitionAllowed(PurchaseOrderStatusApproved, "shipped") {
		t.Fatalf("shipped must not be a purchase order lifecycle status")
	}
	if _, err := uc.CancelPurchaseOrder(ctx, 4); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected settled order transition rejected, got %v", err)
	}
}

func TestPurchaseOrderUsecaseItemGuards(t *testing.T) {
	ctx := context.Background()
	repo := &purchaseOrderRepoStub{
		orders: map[int]*PurchaseOrder{
			1: {ID: 1, LifecycleStatus: PurchaseOrderStatusDraft},
			2: {ID: 2, LifecycleStatus: PurchaseOrderStatusClosed},
			3: {ID: 3, LifecycleStatus: PurchaseOrderStatusSubmitted},
		},
		items: map[int]*PurchaseOrderItem{
			10: {ID: 10, PurchaseOrderID: 1, LineStatus: PurchaseOrderItemStatusOpen},
		},
		supplierActive: map[int]bool{1: true},
		materialActive: map[int]bool{100: true, 101: false},
		unitActive:     map[int]bool{200: true, 201: false},
	}
	uc := NewPurchaseOrderUsecase(repo)

	qty := decimal.NewFromInt(12)
	price := decimal.NewFromInt(3)
	if _, err := uc.AddPurchaseOrderItem(ctx, &PurchaseOrderItemMutation{
		PurchaseOrderID:   1,
		LineNo:            1,
		MaterialID:        100,
		UnitID:            200,
		PurchasedQuantity: qty,
		UnitPrice:         &price,
	}); err != nil {
		t.Fatalf("add purchase order item failed: %v", err)
	}
	if !repo.createdItem.PurchasedQuantity.Equal(qty) {
		t.Fatalf("expected purchased quantity retained, got %s", repo.createdItem.PurchasedQuantity)
	}

	if _, err := uc.AddPurchaseOrderItem(ctx, &PurchaseOrderItemMutation{PurchaseOrderID: 2, LineNo: 1, MaterialID: 100, UnitID: 200, PurchasedQuantity: qty}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected closed order item add rejected, got %v", err)
	}
	if _, err := uc.AddPurchaseOrderItem(ctx, &PurchaseOrderItemMutation{PurchaseOrderID: 1, LineNo: 1, MaterialID: 999, UnitID: 200, PurchasedQuantity: qty}); !errors.Is(err, ErrMaterialNotFound) {
		t.Fatalf("expected missing material rejected, got %v", err)
	}
	if _, err := uc.AddPurchaseOrderItem(ctx, &PurchaseOrderItemMutation{PurchaseOrderID: 1, LineNo: 1, MaterialID: 101, UnitID: 200, PurchasedQuantity: qty}); !errors.Is(err, ErrMaterialInactive) {
		t.Fatalf("expected inactive material rejected, got %v", err)
	}
	if _, err := uc.AddPurchaseOrderItem(ctx, &PurchaseOrderItemMutation{PurchaseOrderID: 1, LineNo: 1, MaterialID: 100, UnitID: 999, PurchasedQuantity: qty}); !errors.Is(err, ErrUnitNotFound) {
		t.Fatalf("expected missing unit rejected, got %v", err)
	}
	if _, err := uc.AddPurchaseOrderItem(ctx, &PurchaseOrderItemMutation{PurchaseOrderID: 1, LineNo: 1, MaterialID: 100, UnitID: 201, PurchasedQuantity: qty}); !errors.Is(err, ErrUnitInactive) {
		t.Fatalf("expected inactive unit rejected, got %v", err)
	}
	if _, err := uc.AddPurchaseOrderItem(ctx, &PurchaseOrderItemMutation{PurchaseOrderID: 1, LineNo: 1, MaterialID: 100, UnitID: 200, PurchasedQuantity: decimal.Zero}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected zero purchased quantity rejected, got %v", err)
	}

	removed, err := uc.RemovePurchaseOrderItem(ctx, 10)
	if err != nil {
		t.Fatalf("remove purchase order item failed: %v", err)
	}
	if removed.LineStatus != PurchaseOrderItemStatusCanceled {
		t.Fatalf("expected removed item canceled, got %#v", removed)
	}
}

func TestPurchaseOrderUsecaseSaveWithItemsGuardsAndNormalizes(t *testing.T) {
	ctx := context.Background()
	repo := &purchaseOrderRepoStub{
		orders: map[int]*PurchaseOrder{
			1: {ID: 1, LifecycleStatus: PurchaseOrderStatusDraft},
			2: {ID: 2, LifecycleStatus: PurchaseOrderStatusClosed},
			3: {ID: 3, LifecycleStatus: PurchaseOrderStatusSubmitted},
		},
		items: map[int]*PurchaseOrderItem{
			10: {ID: 10, PurchaseOrderID: 1, LineStatus: PurchaseOrderItemStatusOpen},
			20: {ID: 20, PurchaseOrderID: 2, LineStatus: PurchaseOrderItemStatusOpen},
		},
		supplierActive: map[int]bool{1000: true},
		materialActive: map[int]bool{100: true},
		unitActive:     map[int]bool{200: true},
	}
	uc := NewPurchaseOrderUsecase(repo)
	orderDate := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	qty := decimal.NewFromInt(6)
	productOrderNo := " SO-26001 "
	productNo := " P-001 "
	productName := " 坐姿小熊 "

	result, err := uc.SavePurchaseOrderWithItems(ctx, 1, &PurchaseOrderMutation{
		PurchaseOrderNo: " PO-TX-001 ",
		SupplierID:      1000,
		PurchaseDate:    orderDate,
	}, []*PurchaseOrderItemSaveMutation{
		{ID: 10, PurchaseOrderItemMutation: PurchaseOrderItemMutation{
			LineNo:                 1,
			MaterialID:             100,
			UnitID:                 200,
			ProductOrderNoSnapshot: &productOrderNo,
			ProductNoSnapshot:      &productNo,
			ProductNameSnapshot:    &productName,
			PurchasedQuantity:      qty,
		}},
	})
	if err != nil {
		t.Fatalf("save purchase order with items failed: %v", err)
	}
	if result.Order.PurchaseOrderNo != "PO-TX-001" || repo.createdOrder.PurchaseOrderNo != "PO-TX-001" {
		t.Fatalf("expected normalized order, got result=%#v mutation=%#v", result.Order, repo.createdOrder)
	}
	if len(repo.savedItems) != 1 || repo.savedItems[0].PurchaseOrderID != 1 {
		t.Fatalf("expected item bound to order 1, got %#v", repo.savedItems)
	}
	savedItem := repo.savedItems[0]
	if savedItem.ProductOrderNoSnapshot == nil || *savedItem.ProductOrderNoSnapshot != "SO-26001" ||
		savedItem.ProductNoSnapshot == nil || *savedItem.ProductNoSnapshot != "P-001" ||
		savedItem.ProductNameSnapshot == nil || *savedItem.ProductNameSnapshot != "坐姿小熊" {
		t.Fatalf("expected normalized product snapshots, got %#v", savedItem)
	}

	if _, err := uc.SavePurchaseOrderWithItems(ctx, 2, &PurchaseOrderMutation{PurchaseOrderNo: "PO-CLOSED", SupplierID: 1000, PurchaseDate: orderDate}, nil); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected closed order save rejected, got %v", err)
	}
	if _, err := uc.SavePurchaseOrderWithItems(ctx, 3, &PurchaseOrderMutation{PurchaseOrderNo: "PO-SUBMITTED", SupplierID: 1000, PurchaseDate: orderDate}, nil); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected submitted purchase contract to be frozen, got %v", err)
	}
	if _, err := uc.SavePurchaseOrderWithItems(ctx, 1, &PurchaseOrderMutation{PurchaseOrderNo: "PO-WRONG-ITEM", SupplierID: 1000, PurchaseDate: orderDate}, []*PurchaseOrderItemSaveMutation{
		{ID: 20, PurchaseOrderItemMutation: PurchaseOrderItemMutation{LineNo: 1, MaterialID: 100, UnitID: 200, PurchasedQuantity: qty}},
	}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected foreign order item rejected, got %v", err)
	}
	if _, err := uc.SavePurchaseOrderWithItems(ctx, 0, &PurchaseOrderMutation{PurchaseOrderNo: "PO-NEW", SupplierID: 1000, PurchaseDate: orderDate}, []*PurchaseOrderItemSaveMutation{
		{ID: 10, PurchaseOrderItemMutation: PurchaseOrderItemMutation{LineNo: 1, MaterialID: 100, UnitID: 200, PurchasedQuantity: qty}},
	}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected existing item on new order rejected, got %v", err)
	}
	beforePurchaseDate := orderDate.AddDate(0, 0, -1)
	if _, err := uc.SavePurchaseOrderWithItems(ctx, 1, &PurchaseOrderMutation{PurchaseOrderNo: "PO-BAD-LINE-DATE", SupplierID: 1000, PurchaseDate: orderDate}, []*PurchaseOrderItemSaveMutation{
		{ID: 10, PurchaseOrderItemMutation: PurchaseOrderItemMutation{LineNo: 1, MaterialID: 100, UnitID: 200, PurchasedQuantity: qty, ExpectedArrivalDate: &beforePurchaseDate}},
	}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected line expected arrival before purchase date rejected, got %v", err)
	}
}
