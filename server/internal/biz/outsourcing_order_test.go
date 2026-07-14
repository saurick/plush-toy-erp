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
	productSKUActive   map[int]bool
	productSKUProduct  map[int]int
	productSKUUnit     map[int]int
	materialActive     map[int]bool
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
		Items: []*OutsourcingOrderItem{{ID: 1, OutsourcingOrderID: 1, LineNo: items[0].LineNo, ProductID: items[0].ProductID, ProductSKUID: items[0].ProductSKUID, ProcessID: items[0].ProcessID, UnitID: items[0].UnitID, OutsourcingQuantity: items[0].OutsourcingQuantity, LineStatus: OutsourcingOrderItemStatusOpen}},
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

func (s *outsourcingOrderRepoStub) ProductSKUIsActiveForProductAndUnit(_ context.Context, id, productID, unitID int) (bool, error) {
	active, ok := s.productSKUActive[id]
	if !ok || s.productSKUProduct[id] != productID || s.productSKUUnit[id] != unitID {
		return false, ErrProductSKUNotFound
	}
	return active, nil
}

func (s *outsourcingOrderRepoStub) MaterialIsActive(_ context.Context, id int) (bool, error) {
	active, ok := s.materialActive[id]
	if !ok {
		return false, ErrMaterialNotFound
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

func TestOutsourcingOrderUsecaseSaveGuardsSupplierSubjectProcessAndUnit(t *testing.T) {
	ctx := context.Background()
	repo := &outsourcingOrderRepoStub{
		supplierActive:     map[int]bool{1: true, 2: false},
		productActive:      map[int]bool{10: true, 11: false},
		productSKUActive:   map[int]bool{50: true, 51: false, 52: true, 53: true},
		productSKUProduct:  map[int]int{50: 10, 51: 10, 52: 99, 53: 10},
		productSKUUnit:     map[int]int{50: 20, 51: 20, 52: 20, 53: 99},
		materialActive:     map[int]bool{40: true, 41: false},
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
	productID := 10
	productSKUID := 50
	inactiveProductID := 11
	materialID := 40
	inactiveMaterialID := 41

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
				SubjectType:            OutsourcingOrderSubjectProduct,
				ProductID:              &productID,
				ProductSKUID:           &productSKUID,
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
	if repo.savedItems[0].SubjectType != OutsourcingOrderSubjectProduct || repo.savedItems[0].ProductID == nil || *repo.savedItems[0].ProductID != productID || repo.savedItems[0].ProductSKUID == nil || *repo.savedItems[0].ProductSKUID != productSKUID || repo.savedItems[0].MaterialID != nil {
		t.Fatalf("expected product subject to remain exactly-one, got %#v", repo.savedItems[0].OutsourcingOrderItemMutation)
	}
	inactiveSKUID := 51
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-INACTIVE-SKU", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, SubjectType: OutsourcingOrderSubjectProduct, ProductID: &productID, ProductSKUID: &inactiveSKUID, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrProductSKUInactive) {
		t.Fatalf("expected inactive SKU rejected, got %v", err)
	}
	wrongProductSKUID := 52
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-WRONG-SKU-PRODUCT", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, SubjectType: OutsourcingOrderSubjectProduct, ProductID: &productID, ProductSKUID: &wrongProductSKUID, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrProductSKUNotFound) {
		t.Fatalf("expected cross-product SKU rejected, got %v", err)
	}
	wrongUnitSKUID := 53
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-WRONG-SKU-UNIT", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, SubjectType: OutsourcingOrderSubjectProduct, ProductID: &productID, ProductSKUID: &wrongUnitSKUID, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrProductSKUNotFound) {
		t.Fatalf("expected cross-unit SKU rejected, got %v", err)
	}

	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-002", SupplierID: 2, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, SubjectType: OutsourcingOrderSubjectProduct, ProductID: &productID, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrSupplierInactive) {
		t.Fatalf("expected inactive supplier rejected, got %v", err)
	}
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-003", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, SubjectType: OutsourcingOrderSubjectProduct, ProductID: &inactiveProductID, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrProductInactive) {
		t.Fatalf("expected inactive product rejected, got %v", err)
	}
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-004", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, SubjectType: OutsourcingOrderSubjectProduct, ProductID: &productID, ProcessID: 31, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrProcessInactive) {
		t.Fatalf("expected inactive process rejected, got %v", err)
	}
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-005", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, SubjectType: OutsourcingOrderSubjectProduct, ProductID: &productID, ProcessID: 32, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrProcessNotOutsourcingEnabled) {
		t.Fatalf("expected non-outsourcing process rejected, got %v", err)
	}
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-006", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, SubjectType: OutsourcingOrderSubjectProduct, ProductID: &productID, ProcessID: 30, UnitID: 21, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrUnitInactive) {
		t.Fatalf("expected inactive unit rejected, got %v", err)
	}
	beforeOrderDate := orderDate.AddDate(0, 0, -1)
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-BAD-DATE", SupplierID: 1, OrderDate: orderDate, ExpectedReturnDate: &beforeOrderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, SubjectType: OutsourcingOrderSubjectProduct, ProductID: &productID, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected expected return before order date rejected, got %v", err)
	}
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-BAD-LINE-DATE", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, SubjectType: OutsourcingOrderSubjectProduct, ProductID: &productID, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty, ExpectedReturnDate: &beforeOrderDate}}}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected line expected return before order date rejected, got %v", err)
	}

	materialCode := " MAT-FABRIC-01 "
	materialName := " 短毛绒布料 "
	staleProductName := "不应残留的产品名"
	staleSKUCode := "不应残留的规格编号"
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-MATERIAL", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{
		LineNo:               1,
		SubjectType:          " material ",
		MaterialID:           &materialID,
		ProcessID:            30,
		UnitID:               20,
		ProductNameSnapshot:  &staleProductName,
		ProductSKUID:         &productSKUID,
		SKUCodeSnapshot:      &staleSKUCode,
		MaterialCodeSnapshot: &materialCode,
		MaterialNameSnapshot: &materialName,
		OutsourcingQuantity:  qty,
	}}}); err != nil {
		t.Fatalf("expected material outsourcing line accepted, got %v", err)
	}
	materialItem := repo.savedItems[0]
	if materialItem.SubjectType != OutsourcingOrderSubjectMaterial || materialItem.MaterialID == nil || *materialItem.MaterialID != materialID || materialItem.ProductID != nil || materialItem.ProductSKUID != nil || materialItem.SKUCodeSnapshot != nil {
		t.Fatalf("expected normalized material subject exactly-one, got %#v", materialItem.OutsourcingOrderItemMutation)
	}
	if materialItem.MaterialCodeSnapshot == nil || *materialItem.MaterialCodeSnapshot != "MAT-FABRIC-01" || materialItem.MaterialNameSnapshot == nil || *materialItem.MaterialNameSnapshot != "短毛绒布料" || materialItem.ProductNameSnapshot != nil {
		t.Fatalf("expected material snapshots normalized and product snapshots cleared, got %#v", materialItem.OutsourcingOrderItemMutation)
	}
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-MATERIAL-INACTIVE", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: OutsourcingOrderItemMutation{LineNo: 1, SubjectType: OutsourcingOrderSubjectMaterial, MaterialID: &inactiveMaterialID, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty}}}); !errors.Is(err, ErrMaterialInactive) {
		t.Fatalf("expected inactive material rejected, got %v", err)
	}
	for name, invalid := range map[string]OutsourcingOrderItemMutation{
		"missing subject type": {LineNo: 1, ProductID: &productID, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty},
		"product without id":   {LineNo: 1, SubjectType: OutsourcingOrderSubjectProduct, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty},
		"material without id":  {LineNo: 1, SubjectType: OutsourcingOrderSubjectMaterial, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty},
		"both subject ids":     {LineNo: 1, SubjectType: OutsourcingOrderSubjectProduct, ProductID: &productID, MaterialID: &materialID, ProcessID: 30, UnitID: 20, OutsourcingQuantity: qty},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 0, &OutsourcingOrderMutation{OutsourcingOrderNo: "OUT-INVALID-SUBJECT", SupplierID: 1, OrderDate: orderDate}, []*OutsourcingOrderItemSaveMutation{{OutsourcingOrderItemMutation: invalid}}); !errors.Is(err, ErrBadParam) {
				t.Fatalf("expected invalid subject rejected, got %v", err)
			}
		})
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
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 1, &OutsourcingOrderMutation{}, nil); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected missing version rejected, got %v", err)
	}
	if _, err := uc.SaveOutsourcingOrderWithItems(ctx, 2, &OutsourcingOrderMutation{ExpectedVersion: 1}, nil); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected submitted outsourcing contract to be frozen, got %v", err)
	}
}
