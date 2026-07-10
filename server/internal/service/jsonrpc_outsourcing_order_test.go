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

type stubOutsourcingOrderJSONRPCRepo struct {
	orders             map[int]*biz.OutsourcingOrder
	items              map[int]*biz.OutsourcingOrderItem
	nextOrderID        int
	nextItemID         int
	supplierActive     bool
	productActive      bool
	materialActive     bool
	unitActive         bool
	processActive      bool
	processOutsourcing bool
	lastFilter         biz.OutsourcingOrderFilter
	lastItemFilter     biz.OutsourcingOrderItemFilter
	lifecycleCalls     int
}

func newStubOutsourcingOrderJSONRPCRepo() *stubOutsourcingOrderJSONRPCRepo {
	return &stubOutsourcingOrderJSONRPCRepo{
		orders:             map[int]*biz.OutsourcingOrder{},
		items:              map[int]*biz.OutsourcingOrderItem{},
		nextOrderID:        1,
		nextItemID:         1,
		supplierActive:     true,
		productActive:      true,
		materialActive:     true,
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
	s.lifecycleCalls++
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

func (s *stubOutsourcingOrderJSONRPCRepo) MaterialIsActive(context.Context, int) (bool, error) {
	return s.materialActive, nil
}

func (s *stubOutsourcingOrderJSONRPCRepo) UnitIsActive(context.Context, int) (bool, error) {
	return s.unitActive, nil
}

func (s *stubOutsourcingOrderJSONRPCRepo) ProcessIsUsableForOutsourcing(context.Context, int) (bool, bool, error) {
	return s.processActive, s.processOutsourcing, nil
}

func TestJsonrpcDispatcher_OutsourcingOrderAPISavesListsAndTransitions(t *testing.T) {
	repo := newStubOutsourcingOrderJSONRPCRepo()
	j := newOutsourcingOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin(
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
		"contract_party_snapshot": map[string]any{
			"buyerCompany": "永绅",
			"buyerContact": "委外负责人",
			"buyerPhone":   "13600000000",
		},
		"source_order_no": "SO-JSONRPC-001",
		"order_date":      "2026-06-17",
		"items": []any{
			map[string]any{
				"line_no":                   float64(1),
				"subject_type":              biz.OutsourcingOrderSubjectProduct,
				"product_id":                float64(2),
				"process_id":                float64(3),
				"unit_id":                   float64(4),
				"product_no_snapshot":       "PROD-JSONRPC",
				"product_order_no_snapshot": " SO-JSONRPC-001 ",
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
	partySnapshot, ok := order["contract_party_snapshot"].(map[string]any)
	if !ok || partySnapshot["buyerCompany"] != "永绅" || partySnapshot["buyerContact"] != "委外负责人" {
		t.Fatalf("expected contract party snapshot on outsourcing order, got %#v", order["contract_party_snapshot"])
	}
	items, ok := saveRes.Data.AsMap()["outsourcing_order_items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected one outsourcing order item, got %#v", saveRes.Data.AsMap()["outsourcing_order_items"])
	}
	item := items[0].(map[string]any)
	if processName := item["process_name_snapshot"]; processName != "车缝" {
		t.Fatalf("expected process snapshot, got %#v", processName)
	}
	if productOrderNo := item["product_order_no_snapshot"]; productOrderNo != "SO-JSONRPC-001" {
		t.Fatalf("expected product order no snapshot, got %#v", productOrderNo)
	}
	if subjectType := item["subject_type"]; subjectType != biz.OutsourcingOrderSubjectProduct || item["material_id"] != nil {
		t.Fatalf("expected product subject DTO with nil material id, got %#v", item)
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

func TestJsonrpcDispatcher_OutsourcingOrderAPISavesMaterialSubjectAndRequiresMaterialModule(t *testing.T) {
	repo := newStubOutsourcingOrderJSONRPCRepo()
	j := newOutsourcingOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionOutsourcingOrderCreate,
		biz.PermissionOutsourcingOrderRead,
	))
	ctx := workflowJSONRPCAdminContext()

	readOnlyMaterials := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.07.10.outsourcing-materials-read-only",
		"outsourcing_orders",
		"enabled",
	)
	readOnlyMaterials = customerConfigPublishParamsWithRevisionAndModuleState(t, readOnlyMaterials, "", "materials", "read_only")
	activateOperationalFactTestCustomerConfig(t, j, readOnlyMaterials)
	_, blocked, err := j.handleOutsourcingOrder(ctx, "save_outsourcing_order_with_items", "material-read-only", outsourcingOrderMaterialJSONRPCSaveParams(t, "OUT-MATERIAL-BLOCKED"))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if blocked == nil || blocked.Code != errcode.InvalidParam.Code || len(repo.orders) != 0 {
		t.Fatalf("expected material subject blocked when materials module is read_only, res=%#v orders=%#v", blocked, repo.orders)
	}

	enabledMaterials := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.07.10.outsourcing-materials-enabled",
		"outsourcing_orders",
		"enabled",
	)
	enabledMaterials = customerConfigPublishParamsWithRevisionAndModuleState(t, enabledMaterials, "", "materials", "enabled")
	activateOperationalFactTestCustomerConfig(t, j, enabledMaterials)
	_, saved, err := j.handleOutsourcingOrder(ctx, "save_outsourcing_order_with_items", "material-enabled", outsourcingOrderMaterialJSONRPCSaveParams(t, "OUT-MATERIAL-001"))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if saved == nil || saved.Code != errcode.OK.Code {
		t.Fatalf("expected material outsourcing order save OK, got %#v", saved)
	}
	rawItems, ok := saved.Data.AsMap()["outsourcing_order_items"].([]any)
	if !ok || len(rawItems) != 1 {
		t.Fatalf("expected one material outsourcing item, got %#v", saved.Data.AsMap()["outsourcing_order_items"])
	}
	item, ok := rawItems[0].(map[string]any)
	if !ok {
		t.Fatalf("expected material item map, got %#v", rawItems[0])
	}
	if item["subject_type"] != biz.OutsourcingOrderSubjectMaterial || item["product_id"] != nil || jsonRPCInt(t, item, "material_id") != 7 {
		t.Fatalf("expected material subject DTO with exactly one material id, got %#v", item)
	}
	if item["material_code_snapshot"] != "MAT-FABRIC-007" || item["material_name_snapshot"] != "短毛绒布料" || item["product_name_snapshot"] != nil {
		t.Fatalf("expected material print snapshots without product residue, got %#v", item)
	}

	invalidBoth := outsourcingOrderMaterialJSONRPCSaveParams(t, "OUT-MATERIAL-BOTH")
	payload := invalidBoth.AsMap()
	items := payload["items"].([]any)
	items[0].(map[string]any)["product_id"] = float64(9)
	invalidBoth, err = structpb.NewStruct(payload)
	if err != nil {
		t.Fatalf("NewStruct invalid both ids: %v", err)
	}
	_, rejected, err := j.handleOutsourcingOrder(ctx, "save_outsourcing_order_with_items", "material-both-ids", invalidBoth)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if rejected == nil || rejected.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected both subject ids rejected, got %#v", rejected)
	}
}

func TestJsonrpcDispatcher_OutsourcingOrderAPIRequiresEnabledModule(t *testing.T) {
	repo := newStubOutsourcingOrderJSONRPCRepo()
	j := newOutsourcingOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin(
		[]string{biz.PurchaseRoleKey},
		biz.PermissionOutsourcingOrderCreate,
		biz.PermissionOutsourcingOrderRead,
		biz.PermissionOutsourcingOrderUpdate,
		biz.PermissionOutsourcingOrderConfirm,
	))
	ctx := workflowJSONRPCAdminContext()
	saveParams := outsourcingOrderJSONRPCSaveParams(t, "OUT-MODULE-GATE-SAVE")

	readOnlyConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.outsourcing-orders-read-only",
		"outsourcing_orders",
		"read_only",
	)
	activateOperationalFactTestCustomerConfig(t, j, readOnlyConfig)
	_, saveRes, err := j.handleOutsourcingOrder(ctx, "save_outsourcing_order_with_items", "read-only-save", saveParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if saveRes == nil || saveRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only outsourcing_orders save rejected, got %#v", saveRes)
	}
	if len(repo.orders) != 0 || len(repo.items) != 0 {
		t.Fatalf("read_only outsourcing_orders must not save order/items, orders=%#v items=%#v", repo.orders, repo.items)
	}
	_, listRes, err := j.handleOutsourcingOrder(ctx, "list_outsourcing_orders", "read-after-read-only", mustJSONRPCStruct(t, map[string]any{"limit": 20}))
	if err != nil {
		t.Fatalf("expected nil err listing historical outsourcing orders, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_outsourcing_orders to remain available for historical read, got %#v", listRes)
	}

	enabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.outsourcing-orders-enabled",
		"outsourcing_orders",
		"enabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, enabledConfig)
	_, saveRes, err = j.handleOutsourcingOrder(ctx, "save_outsourcing_order_with_items", "enabled-save", saveParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if saveRes == nil || saveRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled outsourcing_orders save OK, got %#v", saveRes)
	}
	orderID := jsonRPCInt(t, jsonRPCNestedMap(t, saveRes, "outsourcing_order"), "id")
	_, submitRes, err := j.handleOutsourcingOrder(ctx, "submit_outsourcing_order", "enabled-submit", mustJSONRPCStruct(t, map[string]any{"id": float64(orderID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if submitRes == nil || submitRes.Code != errcode.OK.Code || repo.orders[orderID].LifecycleStatus != biz.OutsourcingOrderStatusSubmitted {
		t.Fatalf("expected enabled outsourcing_orders submit OK, res=%#v order=%#v", submitRes, repo.orders[orderID])
	}

	disabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.outsourcing-orders-disabled",
		"outsourcing_orders",
		"disabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, disabledConfig)
	beforeLifecycleCalls := repo.lifecycleCalls
	_, confirmRes, err := j.handleOutsourcingOrder(ctx, "confirm_outsourcing_order", "disabled-confirm", mustJSONRPCStruct(t, map[string]any{"id": float64(orderID)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if confirmRes == nil || confirmRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected disabled outsourcing_orders confirm rejected, got %#v", confirmRes)
	}
	if repo.lifecycleCalls != beforeLifecycleCalls || repo.orders[orderID].LifecycleStatus != biz.OutsourcingOrderStatusSubmitted {
		t.Fatalf("disabled outsourcing_orders must not update lifecycle, calls=%d order=%#v", repo.lifecycleCalls, repo.orders[orderID])
	}
	_, itemListRes, err := j.handleOutsourcingOrder(ctx, "list_outsourcing_order_items", "read-items-after-disabled", mustJSONRPCStruct(t, map[string]any{"outsourcing_order_id": float64(orderID)}))
	if err != nil {
		t.Fatalf("expected nil err listing historical outsourcing order items, got %v", err)
	}
	if itemListRes == nil || itemListRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_outsourcing_order_items to remain available for historical read, got %#v", itemListRes)
	}
}

func newOutsourcingOrderJSONRPCTestData(t *testing.T, repo *stubOutsourcingOrderJSONRPCRepo, admin *biz.AdminUser) *jsonrpcDispatcher {
	t.Helper()
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:                log.NewHelper(log.With(logger, "module", "service.jsonrpc.outsourcing_order.test")),
		adminReader:        stubAdminAccountReader{admin: admin},
		outsourcingOrderUC: biz.NewOutsourcingOrderUsecase(repo),
		customerConfigUC:   biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}
	activateOperationalFactTestCustomerConfig(t, dispatcher, customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.outsourcing-orders-default-enabled",
		"outsourcing_orders",
		"enabled",
	))
	return dispatcher
}

func outsourcingOrderJSONRPCSaveParams(t *testing.T, orderNo string) *structpb.Struct {
	t.Helper()
	return mustJSONRPCStruct(t, map[string]any{
		"outsourcing_order_no": orderNo,
		"supplier_id":          float64(1),
		"source_order_no":      "SO-MODULE-GATE",
		"order_date":           "2026-06-17",
		"items": []any{
			map[string]any{
				"line_no":               float64(1),
				"subject_type":          biz.OutsourcingOrderSubjectProduct,
				"product_id":            float64(1),
				"process_id":            float64(1),
				"unit_id":               float64(1),
				"outsourcing_quantity":  "12.5",
				"product_no_snapshot":   "PROD-MODULE-GATE",
				"product_name_snapshot": "半成品",
				"process_name_snapshot": "车缝",
				"unit_name_snapshot":    "只",
			},
		},
	})
}

func outsourcingOrderMaterialJSONRPCSaveParams(t *testing.T, orderNo string) *structpb.Struct {
	t.Helper()
	return mustJSONRPCStruct(t, map[string]any{
		"outsourcing_order_no": orderNo,
		"supplier_id":          float64(1),
		"source_order_no":      "ENG-MATERIAL-001",
		"order_date":           "2026-07-10",
		"items": []any{
			map[string]any{
				"line_no":                   float64(1),
				"subject_type":              biz.OutsourcingOrderSubjectMaterial,
				"material_id":               float64(7),
				"process_id":                float64(3),
				"unit_id":                   float64(4),
				"material_code_snapshot":    " MAT-FABRIC-007 ",
				"material_name_snapshot":    " 短毛绒布料 ",
				"product_name_snapshot":     "不应保留",
				"outsourcing_quantity":      "20",
				"unit_price":                "2.5",
				"amount":                    "50",
				"process_name_snapshot":     "布料加工",
				"process_category_snapshot": "委外布料加工",
				"unit_name_snapshot":        "米",
			},
		},
	})
}

func outsourcingOrderFromMutation(id int, status string, in *biz.OutsourcingOrderMutation) *biz.OutsourcingOrder {
	return &biz.OutsourcingOrder{
		ID:                    id,
		OutsourcingOrderNo:    in.OutsourcingOrderNo,
		SupplierID:            in.SupplierID,
		SupplierSnapshot:      in.SupplierSnapshot,
		ContractPartySnapshot: in.ContractPartySnapshot,
		SourceOrderNo:         in.SourceOrderNo,
		SourceSalesOrderID:    in.SourceSalesOrderID,
		OrderDate:             in.OrderDate,
		ExpectedReturnDate:    in.ExpectedReturnDate,
		LifecycleStatus:       status,
		Note:                  in.Note,
		CreatedAt:             time.Unix(1, 0),
		UpdatedAt:             time.Unix(1, 0),
	}
}

func outsourcingOrderItemFromMutation(id int, orderID int, in *biz.OutsourcingOrderItemMutation) *biz.OutsourcingOrderItem {
	return &biz.OutsourcingOrderItem{
		ID:                      id,
		OutsourcingOrderID:      orderID,
		LineNo:                  in.LineNo,
		SubjectType:             in.SubjectType,
		ProductID:               in.ProductID,
		MaterialID:              in.MaterialID,
		ProcessID:               in.ProcessID,
		UnitID:                  in.UnitID,
		ProductNoSnapshot:       in.ProductNoSnapshot,
		ProductOrderNoSnapshot:  in.ProductOrderNoSnapshot,
		ProductNameSnapshot:     in.ProductNameSnapshot,
		MaterialCodeSnapshot:    in.MaterialCodeSnapshot,
		MaterialNameSnapshot:    in.MaterialNameSnapshot,
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
