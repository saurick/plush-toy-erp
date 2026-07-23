package service

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/types/known/structpb"
)

type stubPurchaseOrderJSONRPCRepo struct {
	orders         map[int]*biz.PurchaseOrder
	items          map[int]*biz.PurchaseOrderItem
	nextOrderID    int
	nextItemID     int
	supplierActive bool
	materialActive bool
	unitActive     bool
	lastFilter     biz.PurchaseOrderFilter
	lifecycleCalls int
	saveErr        error
	saveCalls      int
}

func newStubPurchaseOrderJSONRPCRepo() *stubPurchaseOrderJSONRPCRepo {
	return &stubPurchaseOrderJSONRPCRepo{
		orders:         map[int]*biz.PurchaseOrder{},
		items:          map[int]*biz.PurchaseOrderItem{},
		nextOrderID:    1,
		nextItemID:     1,
		supplierActive: true,
		materialActive: true,
		unitActive:     true,
	}
}

func (s *stubPurchaseOrderJSONRPCRepo) CreatePurchaseOrder(_ context.Context, in *biz.PurchaseOrderMutation) (*biz.PurchaseOrder, error) {
	id := s.nextOrderID
	s.nextOrderID++
	order := purchaseOrderFromMutation(id, biz.PurchaseOrderStatusDraft, in)
	s.orders[id] = order
	return order, nil
}

func (s *stubPurchaseOrderJSONRPCRepo) UpdatePurchaseOrder(_ context.Context, id int, in *biz.PurchaseOrderMutation) (*biz.PurchaseOrder, error) {
	current, ok := s.orders[id]
	if !ok {
		return nil, biz.ErrPurchaseOrderNotFound
	}
	order := purchaseOrderFromMutation(id, current.LifecycleStatus, in)
	s.orders[id] = order
	return order, nil
}

func (s *stubPurchaseOrderJSONRPCRepo) GetPurchaseOrder(_ context.Context, id int) (*biz.PurchaseOrder, error) {
	order, ok := s.orders[id]
	if !ok {
		return nil, biz.ErrPurchaseOrderNotFound
	}
	return order, nil
}

func (s *stubPurchaseOrderJSONRPCRepo) ListPurchaseOrders(_ context.Context, filter biz.PurchaseOrderFilter) ([]*biz.PurchaseOrder, int, error) {
	s.lastFilter = filter
	out := make([]*biz.PurchaseOrder, 0, len(s.orders))
	for _, order := range s.orders {
		count := 0
		for _, item := range s.items {
			if item.PurchaseOrderID == order.ID {
				count++
			}
		}
		order.ItemCount = &count
		out = append(out, order)
	}
	return out, len(out), nil
}

func (s *stubPurchaseOrderJSONRPCRepo) UpdatePurchaseOrderLifecycle(_ context.Context, id int, lifecycleStatus string) (*biz.PurchaseOrder, error) {
	s.lifecycleCalls++
	order, ok := s.orders[id]
	if !ok {
		return nil, biz.ErrPurchaseOrderNotFound
	}
	order.LifecycleStatus = lifecycleStatus
	order.UpdatedAt = time.Unix(2, 0)
	return order, nil
}

func (s *stubPurchaseOrderJSONRPCRepo) AddPurchaseOrderItem(_ context.Context, in *biz.PurchaseOrderItemMutation) (*biz.PurchaseOrderItem, error) {
	id := s.nextItemID
	s.nextItemID++
	item := purchaseOrderItemFromMutation(id, in.PurchaseOrderID, in)
	s.items[id] = item
	return item, nil
}

func (s *stubPurchaseOrderJSONRPCRepo) UpdatePurchaseOrderItem(_ context.Context, id int, in *biz.PurchaseOrderItemMutation) (*biz.PurchaseOrderItem, error) {
	if _, ok := s.items[id]; !ok {
		return nil, biz.ErrPurchaseOrderItemNotFound
	}
	item := purchaseOrderItemFromMutation(id, in.PurchaseOrderID, in)
	s.items[id] = item
	return item, nil
}

func (s *stubPurchaseOrderJSONRPCRepo) GetPurchaseOrderItem(_ context.Context, id int) (*biz.PurchaseOrderItem, error) {
	item, ok := s.items[id]
	if !ok {
		return nil, biz.ErrPurchaseOrderItemNotFound
	}
	return item, nil
}

func (s *stubPurchaseOrderJSONRPCRepo) UpdatePurchaseOrderItemStatus(_ context.Context, id int, lineStatus string) (*biz.PurchaseOrderItem, error) {
	item, ok := s.items[id]
	if !ok {
		return nil, biz.ErrPurchaseOrderItemNotFound
	}
	item.LineStatus = lineStatus
	return item, nil
}

func (s *stubPurchaseOrderJSONRPCRepo) ListPurchaseOrderItems(_ context.Context, filter biz.PurchaseOrderItemFilter) ([]*biz.PurchaseOrderItem, int, error) {
	out := []*biz.PurchaseOrderItem{}
	for _, item := range s.items {
		if item.PurchaseOrderID == filter.PurchaseOrderID {
			out = append(out, item)
		}
	}
	return out, len(out), nil
}

func (s *stubPurchaseOrderJSONRPCRepo) SavePurchaseOrderWithItems(_ context.Context, id int, order *biz.PurchaseOrderMutation, items []*biz.PurchaseOrderItemSaveMutation) (*biz.PurchaseOrderWithItems, error) {
	s.saveCalls++
	if s.saveErr != nil {
		return nil, s.saveErr
	}
	orderID := id
	if orderID == 0 {
		orderID = s.nextOrderID
		s.nextOrderID++
	}
	s.orders[orderID] = purchaseOrderFromMutation(orderID, biz.PurchaseOrderStatusDraft, order)
	out := &biz.PurchaseOrderWithItems{Order: s.orders[orderID], Items: make([]*biz.PurchaseOrderItem, 0, len(items))}
	for _, item := range items {
		itemID := item.ID
		if itemID == 0 {
			itemID = s.nextItemID
			s.nextItemID++
		}
		mutation := item.PurchaseOrderItemMutation
		mutation.PurchaseOrderID = orderID
		outItem := purchaseOrderItemFromMutation(itemID, orderID, &mutation)
		s.items[itemID] = outItem
		out.Items = append(out.Items, outItem)
	}
	return out, nil
}

func (s *stubPurchaseOrderJSONRPCRepo) SupplierIsActive(context.Context, int) (bool, error) {
	return s.supplierActive, nil
}

func (s *stubPurchaseOrderJSONRPCRepo) MaterialIsActive(context.Context, int) (bool, error) {
	return s.materialActive, nil
}

func (s *stubPurchaseOrderJSONRPCRepo) UnitIsActive(context.Context, int) (bool, error) {
	return s.unitActive, nil
}

func TestJsonrpcDispatcher_PurchaseOrderAPISavesListsAndTransitions(t *testing.T) {
	repo := newStubPurchaseOrderJSONRPCRepo()
	j := newPurchaseOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey, biz.BossRoleKey},
		biz.PermissionPurchaseOrderCreate,
		biz.PermissionPurchaseOrderRead,
		biz.PermissionPurchaseOrderUpdate,
		biz.PermissionPurchaseOrderApprove,
	))
	ctx := workflowJSONRPCAdminContext()

	_, saveRes, err := j.handlePurchaseOrder(ctx, "save_purchase_order_with_items", "1", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_no": "PO-JSONRPC-001",
		"supplier_id":       float64(1),
		"supplier_snapshot": map[string]any{"name": "布料供应商"},
		"contract_party_snapshot": map[string]any{
			"buyerCompany": "永绅",
			"buyerContact": "采购负责人",
			"buyerPhone":   "13500000000",
		},
		"purchase_date": "2026-06-15",
		"items": []any{
			map[string]any{
				"line_no":                   float64(1),
				"material_id":               float64(2),
				"unit_id":                   float64(3),
				"material_code_snapshot":    "MAT-JSONRPC-PO",
				"material_name_snapshot":    "短毛绒",
				"product_order_no_snapshot": " SO-JSONRPC-001 ",
				"product_no_snapshot":       " P-JSONRPC-001 ",
				"product_name_snapshot":     " 毛绒兔 ",
				"purchased_quantity":        "12.5",
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
	order := jsonRPCNestedMap(t, saveRes, "purchase_order")
	orderID := jsonRPCInt(t, order, "id")
	if version := jsonRPCInt(t, order, "version"); version != 1 {
		t.Fatalf("created purchase order version = %d, want 1", version)
	}
	if status := order["lifecycle_status"]; status != biz.PurchaseOrderStatusDraft {
		t.Fatalf("expected draft purchase order, got %#v", status)
	}
	if _, exists := order["item_count"]; exists {
		t.Fatalf("save response must not claim an unloaded purchase order item count, got %#v", order)
	}
	partySnapshot, ok := order["contract_party_snapshot"].(map[string]any)
	if !ok || partySnapshot["buyerCompany"] != "永绅" || partySnapshot["buyerContact"] != "采购负责人" {
		t.Fatalf("expected contract party snapshot on purchase order, got %#v", order["contract_party_snapshot"])
	}
	items, ok := saveRes.Data.AsMap()["purchase_order_items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one purchase order item, got %#v", saveRes.Data.AsMap()["purchase_order_items"])
	}
	item := items[0].(map[string]any)
	if qty := item["purchased_quantity"]; qty != "12.5" {
		t.Fatalf("expected purchased quantity 12.5, got %#v", qty)
	}
	if productOrderNo := item["product_order_no_snapshot"]; productOrderNo != "SO-JSONRPC-001" {
		t.Fatalf("expected product order no snapshot, got %#v", productOrderNo)
	}
	if productNo := item["product_no_snapshot"]; productNo != "P-JSONRPC-001" {
		t.Fatalf("expected product no snapshot, got %#v", productNo)
	}
	if productName := item["product_name_snapshot"]; productName != "毛绒兔" {
		t.Fatalf("expected product name snapshot, got %#v", productName)
	}

	_, listRes, err := j.handlePurchaseOrder(ctx, "list_purchase_orders", "2", mustJSONRPCStruct(t, map[string]any{
		"keyword":    "PO-JSONRPC",
		"date_field": "purchase_date",
		"date_from":  "2026-06-01",
		"date_to":    "2026-06-30",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list OK, got %#v", listRes)
	}
	if total := jsonRPCInt(t, listRes.Data.AsMap(), "total"); total != 1 {
		t.Fatalf("expected one purchase order in list, got %d", total)
	}
	listedOrders := listRes.Data.AsMap()["purchase_orders"].([]any)
	if itemCount := jsonRPCInt(t, listedOrders[0].(map[string]any), "item_count"); itemCount != 1 {
		t.Fatalf("expected purchase order item_count 1, got %d", itemCount)
	}
	if repo.lastFilter.DateField != "purchase_date" || repo.lastFilter.Keyword != "PO-JSONRPC" {
		t.Fatalf("expected purchase order filter to be mapped, got %#v", repo.lastFilter)
	}
	_, reversedListRes, err := j.handlePurchaseOrder(ctx, "list_purchase_orders", "reversed-date", mustJSONRPCStruct(t, map[string]any{
		"date_from": "2026-06-30",
		"date_to":   "2026-06-01",
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if reversedListRes == nil || reversedListRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for reversed purchase order date filter, got %#v", reversedListRes)
	}

	_, itemListRes, err := j.handlePurchaseOrder(ctx, "list_purchase_order_items", "3", mustJSONRPCStruct(t, map[string]any{
		"purchase_order_id": float64(orderID),
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if itemListRes == nil || itemListRes.Code != errcode.OK.Code {
		t.Fatalf("expected item list OK, got %#v", itemListRes)
	}
	if total := jsonRPCInt(t, itemListRes.Data.AsMap(), "total"); total != 1 {
		t.Fatalf("expected one purchase order item in list, got %d", total)
	}

	for _, tc := range []struct {
		method string
		want   string
	}{
		{method: "submit_purchase_order", want: biz.PurchaseOrderStatusSubmitted},
	} {
		_, lifecycleRes, err := j.handlePurchaseOrder(ctx, tc.method, tc.method, mustJSONRPCStruct(t, map[string]any{"id": float64(orderID)}))
		if err != nil {
			t.Fatalf("%s expected nil err, got %v", tc.method, err)
		}
		if lifecycleRes == nil || lifecycleRes.Code != errcode.OK.Code {
			t.Fatalf("%s expected OK, got %#v", tc.method, lifecycleRes)
		}
		got := jsonRPCNestedMap(t, lifecycleRes, "purchase_order")["lifecycle_status"]
		if got != tc.want {
			t.Fatalf("%s expected status %s, got %#v", tc.method, tc.want, got)
		}
	}
	_, removedApproveRes, err := j.handlePurchaseOrder(ctx, "approve_purchase_order", "approve-removed", mustJSONRPCStruct(t, map[string]any{"id": float64(orderID)}))
	if err != nil || removedApproveRes == nil || removedApproveRes.Code != errcode.UnknownMethod.Code {
		t.Fatalf("direct purchase approval must stay removed, res=%#v err=%v", removedApproveRes, err)
	}
}

func TestJsonrpcDispatcher_PurchaseOrderAPIRequiresDomainPermissions(t *testing.T) {
	repo := newStubPurchaseOrderJSONRPCRepo()
	j := newPurchaseOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionPurchaseOrderRead))
	ctx := workflowJSONRPCAdminContext()

	_, createRes, err := j.handlePurchaseOrder(ctx, "save_purchase_order_with_items", "1", purchaseOrderJSONRPCParams(t))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected create permission denied, got %#v", createRes)
	}

	j.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionPurchaseOrderCreate)}
	_, createRes, err = j.handlePurchaseOrder(ctx, "save_purchase_order_with_items", "2", purchaseOrderJSONRPCParams(t))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.OK.Code {
		t.Fatalf("expected create OK, got %#v", createRes)
	}
	orderID := jsonRPCInt(t, jsonRPCNestedMap(t, createRes, "purchase_order"), "id")

	for _, removedMethod := range []string{
		"create_purchase_order",
		"update_purchase_order",
		"add_purchase_order_item",
		"update_purchase_order_item",
		"remove_purchase_order_item",
	} {
		_, removedRes, removedErr := j.handlePurchaseOrder(ctx, removedMethod, "removed", purchaseOrderJSONRPCParams(t))
		if removedErr != nil {
			t.Fatalf("%s expected nil err, got %v", removedMethod, removedErr)
		}
		if removedRes == nil || removedRes.Code != errcode.UnknownMethod.Code {
			t.Fatalf("legacy split write method %s must stay removed, got %#v", removedMethod, removedRes)
		}
	}

	_, listRes, err := j.handlePurchaseOrder(ctx, "list_purchase_orders", "3", mustJSONRPCStruct(t, map[string]any{"limit": float64(20)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected list permission denied, got %#v", listRes)
	}

	_, approveRes, err := j.handlePurchaseOrder(ctx, "approve_purchase_order", "4", mustJSONRPCStruct(t, map[string]any{"id": float64(orderID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if approveRes == nil || approveRes.Code != errcode.UnknownMethod.Code {
		t.Fatalf("direct approval endpoint must be absent regardless of permission, got %#v", approveRes)
	}

	j.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionPurchaseOrderApprove)}
	_, approveRes, err = j.handlePurchaseOrder(ctx, "approve_purchase_order", "5", mustJSONRPCStruct(t, map[string]any{"id": float64(orderID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if approveRes == nil || approveRes.Code != errcode.UnknownMethod.Code {
		t.Fatalf("workflow approval must not reopen the direct approval endpoint, got %#v", approveRes)
	}
}

func TestJsonrpcDispatcher_PurchaseOrderDraftVersionContract(t *testing.T) {
	repo := newStubPurchaseOrderJSONRPCRepo()
	j := newPurchaseOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionPurchaseOrderUpdate,
	))
	ctx := workflowJSONRPCAdminContext()
	repo.orders[1] = &biz.PurchaseOrder{
		ID:              1,
		PurchaseOrderNo: "PO-VERSION-CONTRACT",
		SupplierID:      1,
		PurchaseDate:    time.Date(2026, 7, 14, 0, 0, 0, 0, time.UTC),
		LifecycleStatus: biz.PurchaseOrderStatusDraft,
		Version:         1,
	}
	repo.items[1] = &biz.PurchaseOrderItem{
		ID:                1,
		PurchaseOrderID:   1,
		LineNo:            1,
		MaterialID:        1,
		UnitID:            1,
		PurchasedQuantity: mustDecimal(t, "1"),
		LineStatus:        biz.PurchaseOrderItemStatusOpen,
	}
	paramsForAttempt := func() map[string]any {
		return map[string]any{
			"id":                float64(1),
			"purchase_order_no": "PO-VERSION-CONTRACT",
			"supplier_id":       float64(1),
			"purchase_date":     "2026-07-14",
			"items": []any{map[string]any{
				"id":                 float64(1),
				"line_no":            float64(1),
				"material_id":        float64(1),
				"unit_id":            float64(1),
				"purchased_quantity": "1",
			}},
		}
	}

	for name, value := range map[string]any{"missing": nil, "zero": float64(0), "fraction": float64(1.5), "string": "1"} {
		params := paramsForAttempt()
		if value != nil {
			params["expected_version"] = value
		}
		_, res, err := j.handlePurchaseOrder(ctx, "save_purchase_order_with_items", name, mustJSONRPCStruct(t, params))
		if err != nil || res == nil || res.Code != errcode.InvalidParam.Code || repo.saveCalls != 0 {
			t.Fatalf("%s expected_version must fail before save: res=%#v err=%v orders=%#v", name, res, err, repo.orders)
		}
	}

	update := paramsForAttempt()
	update["expected_version"] = float64(1)
	_, updateRes, err := j.handlePurchaseOrder(ctx, "save_purchase_order_with_items", "update", mustJSONRPCStruct(t, update))
	if err != nil || updateRes == nil || updateRes.Code != errcode.OK.Code {
		t.Fatalf("positive expected_version must update purchase order: res=%#v err=%v", updateRes, err)
	}
	if version := jsonRPCInt(t, jsonRPCNestedMap(t, updateRes, "purchase_order"), "version"); version != 2 {
		t.Fatalf("updated purchase order version = %d, want 2", version)
	}

	repo.saveErr = biz.ErrPurchaseOrderConflict
	_, conflictRes, err := j.handlePurchaseOrder(ctx, "save_purchase_order_with_items", "conflict", mustJSONRPCStruct(t, update))
	if err != nil || conflictRes == nil || conflictRes.Code != errcode.ResourceVersionConflict.Code {
		t.Fatalf("purchase version conflict must map to 40922: res=%#v err=%v", conflictRes, err)
	}
}

func TestJsonrpcDispatcher_PurchaseOrderAPIRequiresEnabledModule(t *testing.T) {
	repo := newStubPurchaseOrderJSONRPCRepo()
	j := newPurchaseOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionPurchaseOrderCreate,
		biz.PermissionPurchaseOrderRead,
		biz.PermissionPurchaseOrderUpdate,
		biz.PermissionPurchaseOrderApprove,
	))
	ctx := workflowJSONRPCAdminContext()
	saveParams := mustJSONRPCStruct(t, map[string]any{
		"purchase_order_no": "PO-MODULE-GATE-SAVE",
		"supplier_id":       float64(1),
		"purchase_date":     "2026-06-15",
		"items": []any{
			map[string]any{
				"line_no":            float64(1),
				"material_id":        float64(1),
				"unit_id":            float64(1),
				"purchased_quantity": "12.5",
			},
		},
	})

	readOnlyConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.purchase-orders-read-only",
		"purchase_orders",
		"read_only",
	)
	activateOperationalFactTestCustomerConfig(t, j, readOnlyConfig)

	_, saveRes, err := j.handlePurchaseOrder(ctx, "save_purchase_order_with_items", "read-only-save", saveParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if saveRes == nil || saveRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only purchase_orders save rejected, got %#v", saveRes)
	}
	if len(repo.items) != 0 {
		t.Fatalf("read_only purchase_orders must not save items, got %#v", repo.items)
	}
	_, listRes, err := j.handlePurchaseOrder(ctx, "list_purchase_orders", "read-after-read-only", mustJSONRPCStruct(t, map[string]any{"limit": 20}))
	if err != nil {
		t.Fatalf("expected nil err listing historical purchase orders, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_purchase_orders to remain available for historical read, got %#v", listRes)
	}

	enabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.purchase-orders-enabled",
		"purchase_orders",
		"enabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, enabledConfig)
	_, saveRes, err = j.handlePurchaseOrder(ctx, "save_purchase_order_with_items", "enabled-save", saveParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if saveRes == nil || saveRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled purchase_orders save OK, got %#v", saveRes)
	}
	orderID := jsonRPCInt(t, jsonRPCNestedMap(t, saveRes, "purchase_order"), "id")
	_, submitRes, err := j.handlePurchaseOrder(ctx, "submit_purchase_order", "enabled-submit", mustJSONRPCStruct(t, map[string]any{"id": float64(orderID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if submitRes == nil || submitRes.Code != errcode.OK.Code || repo.orders[orderID].LifecycleStatus != biz.PurchaseOrderStatusSubmitted {
		t.Fatalf("expected enabled purchase_orders submit OK, res=%#v order=%#v", submitRes, repo.orders[orderID])
	}

	disabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.purchase-orders-disabled",
		"purchase_orders",
		"disabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, disabledConfig)
	beforeLifecycleCalls := repo.lifecycleCalls
	beforeOrderCount := len(repo.orders)
	beforeItemCount := len(repo.items)
	_, saveRes, err = j.handlePurchaseOrder(ctx, "save_purchase_order_with_items", "disabled-save", saveParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if saveRes == nil || saveRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected disabled purchase_orders aggregate save rejected, got %#v", saveRes)
	}
	if len(repo.orders) != beforeOrderCount || len(repo.items) != beforeItemCount {
		t.Fatalf("disabled purchase_orders must not reach aggregate save, orders=%#v items=%#v", repo.orders, repo.items)
	}
	_, itemListRes, err := j.handlePurchaseOrder(ctx, "list_purchase_order_items", "read-items-after-disabled", mustJSONRPCStruct(t, map[string]any{"purchase_order_id": float64(orderID)}))
	if err != nil {
		t.Fatalf("expected nil err listing historical purchase order items, got %v", err)
	}
	if itemListRes == nil || itemListRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_purchase_order_items to remain available for historical read, got %#v", itemListRes)
	}
	_, cancelRes, err := j.handlePurchaseOrder(ctx, "cancel_purchase_order", "disabled-cancel", mustJSONRPCStruct(t, map[string]any{"id": float64(orderID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if cancelRes == nil || cancelRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected disabled purchase_orders cancel rejected, got %#v", cancelRes)
	}
	if repo.lifecycleCalls != beforeLifecycleCalls || repo.orders[orderID].LifecycleStatus != biz.PurchaseOrderStatusSubmitted {
		t.Fatalf("disabled purchase_orders must not update lifecycle, calls=%d order=%#v", repo.lifecycleCalls, repo.orders[orderID])
	}
}

func newPurchaseOrderJSONRPCTestData(t *testing.T, repo *stubPurchaseOrderJSONRPCRepo, admin *biz.AdminUser) *jsonrpcDispatcher {
	t.Helper()
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(logger, "module", "service.jsonrpc.purchase_order.test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		purchaseOrderUC:  biz.NewPurchaseOrderUsecase(repo),
		customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}
	activateOperationalFactTestCustomerConfig(t, dispatcher, customerConfigPublishParams(t))
	return dispatcher
}

func purchaseOrderJSONRPCParams(t *testing.T) *structpb.Struct {
	t.Helper()
	return mustJSONRPCStruct(t, map[string]any{
		"purchase_order_no": "PO-JSONRPC-PERM",
		"supplier_id":       float64(1),
		"purchase_date":     "2026-06-15",
	})
}

func purchaseOrderFromMutation(id int, status string, in *biz.PurchaseOrderMutation) *biz.PurchaseOrder {
	version := 1
	if in.ExpectedVersion > 0 {
		version = in.ExpectedVersion + 1
	}
	return &biz.PurchaseOrder{
		ID:                      id,
		PurchaseOrderNo:         in.PurchaseOrderNo,
		SupplierID:              in.SupplierID,
		SupplierPurchaseOrderNo: in.SupplierPurchaseOrderNo,
		SupplierSnapshot:        in.SupplierSnapshot,
		ContractPartySnapshot:   in.ContractPartySnapshot,
		PurchaseDate:            in.PurchaseDate,
		ExpectedArrivalDate:     in.ExpectedArrivalDate,
		LifecycleStatus:         status,
		Version:                 version,
		Note:                    in.Note,
		CreatedAt:               time.Unix(1, 0),
		UpdatedAt:               time.Unix(1, 0),
	}
}

func purchaseOrderItemFromMutation(id int, orderID int, in *biz.PurchaseOrderItemMutation) *biz.PurchaseOrderItem {
	return &biz.PurchaseOrderItem{
		ID:                     id,
		PurchaseOrderID:        orderID,
		LineNo:                 in.LineNo,
		MaterialID:             in.MaterialID,
		UnitID:                 in.UnitID,
		MaterialCodeSnapshot:   in.MaterialCodeSnapshot,
		MaterialNameSnapshot:   in.MaterialNameSnapshot,
		ColorSnapshot:          in.ColorSnapshot,
		ProductOrderNoSnapshot: in.ProductOrderNoSnapshot,
		ProductNoSnapshot:      in.ProductNoSnapshot,
		ProductNameSnapshot:    in.ProductNameSnapshot,
		PurchasedQuantity:      in.PurchasedQuantity,
		UnitPrice:              in.UnitPrice,
		Amount:                 in.Amount,
		ExpectedArrivalDate:    in.ExpectedArrivalDate,
		LineStatus:             biz.PurchaseOrderItemStatusOpen,
		Note:                   in.Note,
		CreatedAt:              time.Unix(1, 0),
		UpdatedAt:              time.Unix(1, 0),
	}
}
