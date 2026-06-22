package service

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

type stubOutsourcingOrderJSONRPCRepo struct {
	orders             map[int]*biz.OutsourcingOrder
	items              map[int]*biz.OutsourcingOrderItem
	nextOrderID        int
	nextItemID         int
	supplierActive     bool
	productActive      bool
	unitActive         bool
	processActive      bool
	processOutsourcing bool
	lastFilter         biz.OutsourcingOrderFilter
	lastItemFilter     biz.OutsourcingOrderItemFilter
}

func newStubOutsourcingOrderJSONRPCRepo() *stubOutsourcingOrderJSONRPCRepo {
	return &stubOutsourcingOrderJSONRPCRepo{
		orders:             map[int]*biz.OutsourcingOrder{},
		items:              map[int]*biz.OutsourcingOrderItem{},
		nextOrderID:        1,
		nextItemID:         1,
		supplierActive:     true,
		productActive:      true,
		unitActive:         true,
		processActive:      true,
		processOutsourcing: true,
	}
}

func (s *stubOutsourcingOrderJSONRPCRepo) GetOutsourcingOrder(_ context.Context, id int) (*biz.OutsourcingOrder, error) {
	order, ok := s.orders[id]
	if !ok {
		return nil, biz.ErrOutsourcingOrderNotFound
	}
	return order, nil
}

func (s *stubOutsourcingOrderJSONRPCRepo) ListOutsourcingOrders(_ context.Context, filter biz.OutsourcingOrderFilter) ([]*biz.OutsourcingOrder, int, error) {
	s.lastFilter = filter
	out := make([]*biz.OutsourcingOrder, 0, len(s.orders))
	for _, order := range s.orders {
		out = append(out, order)
	}
	return out, len(out), nil
}

func (s *stubOutsourcingOrderJSONRPCRepo) UpdateOutsourcingOrderLifecycle(_ context.Context, id int, lifecycleStatus string) (*biz.OutsourcingOrder, error) {
	order, ok := s.orders[id]
	if !ok {
		return nil, biz.ErrOutsourcingOrderNotFound
	}
	order.LifecycleStatus = lifecycleStatus
	order.UpdatedAt = time.Unix(2, 0)
	return order, nil
}

func (s *stubOutsourcingOrderJSONRPCRepo) SaveOutsourcingOrderWithItems(_ context.Context, id int, order *biz.OutsourcingOrderMutation, items []*biz.OutsourcingOrderItemSaveMutation) (*biz.OutsourcingOrderWithItems, error) {
	orderID := id
	if orderID == 0 {
		orderID = s.nextOrderID
		s.nextOrderID++
	}
	s.orders[orderID] = outsourcingOrderFromMutation(orderID, biz.OutsourcingOrderStatusDraft, order)
	out := &biz.OutsourcingOrderWithItems{Order: s.orders[orderID], Items: make([]*biz.OutsourcingOrderItem, 0, len(items))}
	for _, item := range items {
		itemID := item.ID
		if itemID == 0 {
			itemID = s.nextItemID
			s.nextItemID++
		}
		mutation := item.OutsourcingOrderItemMutation
		mutation.OutsourcingOrderID = orderID
		outItem := outsourcingOrderItemFromMutation(itemID, orderID, &mutation)
		s.items[itemID] = outItem
		out.Items = append(out.Items, outItem)
	}
	return out, nil
}

func (s *stubOutsourcingOrderJSONRPCRepo) ListOutsourcingOrderItems(_ context.Context, filter biz.OutsourcingOrderItemFilter) ([]*biz.OutsourcingOrderItem, int, error) {
	s.lastItemFilter = filter
	out := []*biz.OutsourcingOrderItem{}
	for _, item := range s.items {
		if item.OutsourcingOrderID == filter.OutsourcingOrderID {
			out = append(out, item)
		}
	}
	return out, len(out), nil
}

func (s *stubOutsourcingOrderJSONRPCRepo) GetOutsourcingOrderItem(_ context.Context, id int) (*biz.OutsourcingOrderItem, error) {
	item, ok := s.items[id]
	if !ok {
		return nil, biz.ErrOutsourcingOrderItemNotFound
	}
	return item, nil
}

func (s *stubOutsourcingOrderJSONRPCRepo) SupplierIsActive(context.Context, int) (bool, error) {
	return s.supplierActive, nil
}

func (s *stubOutsourcingOrderJSONRPCRepo) ProductIsActive(context.Context, int) (bool, error) {
	return s.productActive, nil
}

func (s *stubOutsourcingOrderJSONRPCRepo) UnitIsActive(context.Context, int) (bool, error) {
	return s.unitActive, nil
}

func (s *stubOutsourcingOrderJSONRPCRepo) ProcessIsUsableForOutsourcing(context.Context, int) (bool, bool, error) {
	return s.processActive, s.processOutsourcing, nil
}

func TestJsonrpcDispatcher_OutsourcingOrderAPISavesListsAndTransitions(t *testing.T) {
	repo := newStubOutsourcingOrderJSONRPCRepo()
	j := newOutsourcingOrderJSONRPCTestData(repo, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionOutsourcingOrderCreate,
		biz.PermissionOutsourcingOrderRead,
		biz.PermissionOutsourcingOrderUpdate,
		biz.PermissionOutsourcingOrderConfirm,
	))
	ctx := workflowJSONRPCAdminContext()

	_, saveRes, err := j.handleOutsourcingOrder(ctx, "save_outsourcing_order_with_items", "1", mustJSONRPCStruct(t, map[string]any{
		"outsourcing_order_no": "OUT-JSONRPC-001",
		"supplier_id":          float64(1),
		"supplier_snapshot":    map[string]any{"name": "加工厂"},
		"source_order_no":      "SO-JSONRPC-001",
		"order_date":           "2026-06-17",
		"items": []any{
			map[string]any{
				"line_no":                   float64(1),
				"product_id":                float64(2),
				"process_id":                float64(3),
				"unit_id":                   float64(4),
				"product_no_snapshot":       "PROD-JSONRPC",
				"product_name_snapshot":     "半成品",
				"process_name_snapshot":     "车缝",
				"process_category_snapshot": "委外车缝",
				"unit_name_snapshot":        "只",
				"outsourcing_quantity":      "12.5",
				"unit_price":                "3.2",
				"amount":                    "40",
			},
		},
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if saveRes == nil || saveRes.Code != errcode.OK.Code {
		t.Fatalf("expected save OK, got %#v", saveRes)
	}
	order := jsonRPCNestedMap(t, saveRes, "outsourcing_order")
	orderID := jsonRPCInt(t, order, "id")
	if status := order["lifecycle_status"]; status != biz.OutsourcingOrderStatusDraft {
		t.Fatalf("expected draft outsourcing order, got %#v", status)
	}
	items, ok := saveRes.Data.AsMap()["outsourcing_order_items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one outsourcing order item, got %#v", saveRes.Data.AsMap()["outsourcing_order_items"])
	}
	item := items[0].(map[string]any)
	if processName := item["process_name_snapshot"]; processName != "车缝" {
		t.Fatalf("expected process snapshot, got %#v", processName)
	}

	_, listRes, err := j.handleOutsourcingOrder(ctx, "list_outsourcing_orders", "2", mustJSONRPCStruct(t, map[string]any{
		"keyword":        "OUT-JSONRPC",
		"date_field":     "order_date",
		"date_from":      "2026-06-01",
		"date_to":        "2026-06-30",
		"sort_by":        "expected_return_date",
		"sort_direction": "asc",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list OK, got %#v", listRes)
	}
	if total := jsonRPCInt(t, listRes.Data.AsMap(), "total"); total != 1 {
		t.Fatalf("expected one outsourcing order in list, got %d", total)
	}
	if repo.lastFilter.DateField != "order_date" ||
		repo.lastFilter.Keyword != "OUT-JSONRPC" ||
		repo.lastFilter.SortBy != "expected_return_date" ||
		repo.lastFilter.SortDirection != "asc" {
		t.Fatalf("expected outsourcing order filter to be mapped, got %#v", repo.lastFilter)
	}
	_, reversedListRes, err := j.handleOutsourcingOrder(ctx, "list_outsourcing_orders", "reversed-date", mustJSONRPCStruct(t, map[string]any{
		"date_from": "2026-06-30",
		"date_to":   "2026-06-01",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if reversedListRes == nil || reversedListRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for reversed outsourcing order date filter, got %#v", reversedListRes)
	}

	_, itemListRes, err := j.handleOutsourcingOrder(ctx, "list_outsourcing_order_items", "3", mustJSONRPCStruct(t, map[string]any{
		"outsourcing_order_id": float64(orderID),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if itemListRes == nil || itemListRes.Code != errcode.OK.Code {
		t.Fatalf("expected item list OK, got %#v", itemListRes)
	}
	if total := jsonRPCInt(t, itemListRes.Data.AsMap(), "total"); total != 1 {
		t.Fatalf("expected one outsourcing order item in list, got %d", total)
	}

	for _, tc := range []struct {
		method string
		want   string
	}{
		{method: "submit_outsourcing_order", want: biz.OutsourcingOrderStatusSubmitted},
		{method: "confirm_outsourcing_order", want: biz.OutsourcingOrderStatusConfirmed},
		{method: "close_outsourcing_order", want: biz.OutsourcingOrderStatusClosed},
	} {
		_, lifecycleRes, err := j.handleOutsourcingOrder(ctx, tc.method, tc.method, mustJSONRPCStruct(t, map[string]any{"id": float64(orderID)}))
		if err != nil {
			t.Fatalf("%s expected nil err, got %v", tc.method, err)
		}
		if lifecycleRes == nil || lifecycleRes.Code != errcode.OK.Code {
			t.Fatalf("%s expected OK, got %#v", tc.method, lifecycleRes)
		}
		got := jsonRPCNestedMap(t, lifecycleRes, "outsourcing_order")["lifecycle_status"]
		if got != tc.want {
			t.Fatalf("%s expected status %s, got %#v", tc.method, tc.want, got)
		}
	}
}

func newOutsourcingOrderJSONRPCTestData(repo *stubOutsourcingOrderJSONRPCRepo, admin *biz.AdminUser) *jsonrpcDispatcher {
	logger := log.NewStdLogger(io.Discard)
	return &jsonrpcDispatcher{
		log:                log.NewHelper(log.With(logger, "module", "service.jsonrpc.outsourcing_order.test")),
		adminReader:        stubAdminAccountReader{admin: admin},
		outsourcingOrderUC: biz.NewOutsourcingOrderUsecase(repo),
	}
}

func outsourcingOrderFromMutation(id int, status string, in *biz.OutsourcingOrderMutation) *biz.OutsourcingOrder {
	return &biz.OutsourcingOrder{
		ID:                 id,
		OutsourcingOrderNo: in.OutsourcingOrderNo,
		SupplierID:         in.SupplierID,
		SupplierSnapshot:   in.SupplierSnapshot,
		SourceOrderNo:      in.SourceOrderNo,
		SourceSalesOrderID: in.SourceSalesOrderID,
		OrderDate:          in.OrderDate,
		ExpectedReturnDate: in.ExpectedReturnDate,
		LifecycleStatus:    status,
		Note:               in.Note,
		CreatedAt:          time.Unix(1, 0),
		UpdatedAt:          time.Unix(1, 0),
	}
}

func outsourcingOrderItemFromMutation(id int, orderID int, in *biz.OutsourcingOrderItemMutation) *biz.OutsourcingOrderItem {
	return &biz.OutsourcingOrderItem{
		ID:                      id,
		OutsourcingOrderID:      orderID,
		LineNo:                  in.LineNo,
		ProductID:               in.ProductID,
		ProcessID:               in.ProcessID,
		UnitID:                  in.UnitID,
		ProductNoSnapshot:       in.ProductNoSnapshot,
		ProductNameSnapshot:     in.ProductNameSnapshot,
		ProcessNameSnapshot:     in.ProcessNameSnapshot,
		ProcessCategorySnapshot: in.ProcessCategorySnapshot,
		UnitNameSnapshot:        in.UnitNameSnapshot,
		OutsourcingQuantity:     in.OutsourcingQuantity,
		UnitPrice:               in.UnitPrice,
		Amount:                  in.Amount,
		ExpectedReturnDate:      in.ExpectedReturnDate,
		LineStatus:              biz.OutsourcingOrderItemStatusOpen,
		Note:                    in.Note,
		CreatedAt:               time.Unix(1, 0),
		UpdatedAt:               time.Unix(1, 0),
	}
}
