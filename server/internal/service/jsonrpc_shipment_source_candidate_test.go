package service

import (
	"context"
	"io"
	"reflect"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type shipmentSourceCandidateJSONRPCRepo struct {
	stubBusinessDashboardOperationalFactRepo
	candidateCalls int
	createCalls    int
	filter         biz.ShipmentSourceCandidateFilter
}

func (r *shipmentSourceCandidateJSONRPCRepo) ListShipmentSourceCandidates(
	_ context.Context,
	filter biz.ShipmentSourceCandidateFilter,
) ([]*biz.ShipmentSourceCandidate, int, error) {
	r.candidateCalls++
	r.filter = filter
	productSkuID := 5
	productCode := "P-001"
	productName := "毛绒熊"
	color := "棕"
	skuCode := "SKU-001"
	skuName := "棕色款"
	return []*biz.ShipmentSourceCandidate{{
		SalesOrderID:        1,
		OrderNo:             "SO-001",
		OrderStatus:         biz.SalesOrderStatusActive,
		OrderVersion:        3,
		CustomerID:          2,
		CustomerSnapshot:    map[string]any{"name": "订单客户"},
		CustomerName:        "当前客户",
		SalesOrderItemID:    4,
		LineNo:              1,
		LineStatus:          biz.SalesOrderItemStatusOpen,
		ProductID:           3,
		ProductSkuID:        &productSkuID,
		ProductCode:         "P-CURRENT",
		ProductName:         "当前毛绒熊",
		ProductCodeSnapshot: &productCode,
		ProductNameSnapshot: &productName,
		ColorSnapshot:       &color,
		SKUCode:             &skuCode,
		SKUName:             &skuName,
		UnitID:              6,
		UnitCode:            "PCS",
		UnitName:            "只",
		OrderedQuantity:     decimal.NewFromInt(10),
		ShippedQuantity:     decimal.NewFromInt(2),
		RemainingQuantity:   decimal.NewFromInt(8),
		Selectable:          true,
	}}, 1, nil
}

func (r *shipmentSourceCandidateJSONRPCRepo) WarehouseIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentSourceCandidateJSONRPCRepo) CustomerIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentSourceCandidateJSONRPCRepo) ProductIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentSourceCandidateJSONRPCRepo) ProductSKUIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentSourceCandidateJSONRPCRepo) UnitIsActive(context.Context, int) (bool, error) {
	return true, nil
}

func (r *shipmentSourceCandidateJSONRPCRepo) CreateShipmentDraftWithItems(_ context.Context, in *biz.ShipmentCreateWithItems) (*biz.Shipment, error) {
	r.createCalls++
	return &biz.Shipment{ShipmentNo: in.Shipment.ShipmentNo, Items: []*biz.ShipmentItem{}}, nil
}

func shipmentSourceCandidateAdmin(permissions ...string) *biz.AdminUser {
	return workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, permissions...)
}

func shipmentCreateWithItemsParams(sourceHeader, sourceItem bool) map[string]any {
	params := map[string]any{
		"shipment_no":     "SHP-SOURCE-PERMISSION",
		"customer_id":     2,
		"idempotency_key": "SHP-SOURCE-PERMISSION",
		"items": []any{map[string]any{
			"product_id":   3,
			"warehouse_id": 5,
			"unit_id":      6,
			"quantity":     "1",
		}},
	}
	if sourceHeader {
		params["sales_order_id"] = 1
	}
	if sourceItem {
		params["items"].([]any)[0].(map[string]any)["sales_order_item_id"] = 4
	}
	return params
}

func TestJSONRPCListShipmentSourceCandidatesContract(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	repo := &shipmentSourceCandidateJSONRPCRepo{}
	admin := shipmentSourceCandidateAdmin(
		biz.PermissionShipmentCreate,
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderItemRead,
	)
	dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)
	_, result, err := dispatcher.handleOperationalFact(ctx, "list_shipment_source_candidates", "candidate", mustJSONRPCStruct(t, map[string]any{
		"keyword":        "  SO-001  ",
		"sales_order_id": 1,
		"limit":          200,
		"offset":         50,
	}))
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("candidate response=%#v err=%v", result, err)
	}
	if repo.candidateCalls != 1 || repo.filter.Keyword != "SO-001" || repo.filter.SalesOrderID != 1 || repo.filter.Limit != 200 || repo.filter.Offset != 50 {
		t.Fatalf("candidate filter/calls=%#v/%d", repo.filter, repo.candidateCalls)
	}
	data := result.Data.AsMap()
	if data["total"] != float64(1) || data["limit"] != float64(200) || data["offset"] != float64(50) {
		t.Fatalf("candidate page metadata=%#v", data)
	}
	rows, ok := data["shipment_source_candidates"].([]any)
	if !ok || len(rows) != 1 {
		t.Fatalf("candidate rows=%#v", data["shipment_source_candidates"])
	}
	row := rows[0].(map[string]any)
	want := map[string]any{
		"sales_order_id":        float64(1),
		"order_no":              "SO-001",
		"order_status":          biz.SalesOrderStatusActive,
		"order_version":         float64(3),
		"customer_id":           float64(2),
		"customer_snapshot":     map[string]any{"name": "订单客户"},
		"customer_name":         "当前客户",
		"sales_order_item_id":   float64(4),
		"line_no":               float64(1),
		"line_status":           biz.SalesOrderItemStatusOpen,
		"product_id":            float64(3),
		"product_sku_id":        float64(5),
		"product_code":          "P-CURRENT",
		"product_name":          "当前毛绒熊",
		"product_code_snapshot": "P-001",
		"product_name_snapshot": "毛绒熊",
		"color_snapshot":        "棕",
		"sku_code":              "SKU-001",
		"sku_name":              "棕色款",
		"unit_id":               float64(6),
		"unit_code":             "PCS",
		"unit_name":             "只",
		"ordered_quantity":      "10",
		"shipped_quantity":      "2",
		"remaining_quantity":    "8",
		"selectable":            true,
		"disabled_reason":       "",
	}
	if !reflect.DeepEqual(row, want) {
		t.Fatalf("candidate row=%#v, want=%#v", row, want)
	}
}

func TestShipmentSourceCandidateResponseKeepsMissingSnapshotsDistinctFromCurrentMaster(t *testing.T) {
	mapped := shipmentSourceCandidateToAny(&biz.ShipmentSourceCandidate{
		CustomerSnapshot: map[string]any{},
		CustomerName:     "当前客户",
		ProductCode:      "P-CURRENT",
		ProductName:      "当前产品",
		UnitCode:         "PCS",
		UnitName:         "只",
	})
	if snapshot, ok := mapped["customer_snapshot"].(map[string]any); !ok || len(snapshot) != 0 {
		t.Fatalf("empty customer snapshot must remain an empty map: %#v", mapped["customer_snapshot"])
	}
	for _, field := range []string{"product_code_snapshot", "product_name_snapshot", "color_snapshot"} {
		if mapped[field] != nil {
			t.Fatalf("missing %s must remain null, got %#v", field, mapped[field])
		}
	}
	if mapped["customer_name"] != "当前客户" || mapped["product_code"] != "P-CURRENT" || mapped["product_name"] != "当前产品" || mapped["unit_code"] != "PCS" || mapped["unit_name"] != "只" {
		t.Fatalf("current-master fallback projection incomplete: %#v", mapped)
	}
}

func TestJSONRPCListShipmentSourceCandidatesRequiresAllPermissions(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	required := []string{
		biz.PermissionShipmentCreate,
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderItemRead,
	}
	for missingIndex, missing := range required {
		t.Run(missing, func(t *testing.T) {
			permissions := append([]string(nil), required[:missingIndex]...)
			permissions = append(permissions, required[missingIndex+1:]...)
			repo := &shipmentSourceCandidateJSONRPCRepo{}
			dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, shipmentSourceCandidateAdmin(permissions...), repo)
			_, result, err := dispatcher.handleOperationalFact(ctx, "list_shipment_source_candidates", "permission", mustJSONRPCStruct(t, map[string]any{}))
			if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
				t.Fatalf("missing %s response=%#v err=%v", missing, result, err)
			}
			if repo.candidateCalls != 0 {
				t.Fatalf("missing %s reached repository", missing)
			}
		})
	}
}

func TestJSONRPCListShipmentSourceCandidatesAuthMatrix(t *testing.T) {
	adminContext := workflowJSONRPCAdminContext()
	nonAdminContext := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   7,
		Username: "admin",
		Role:     biz.RoleUser,
	})
	permissions := []string{
		biz.PermissionShipmentCreate,
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderItemRead,
	}
	tests := []struct {
		name          string
		ctx           context.Context
		admin         *biz.AdminUser
		wantCode      int32
		wantRepoCalls int
	}{
		{
			name:     "unauthenticated",
			ctx:      context.Background(),
			admin:    shipmentSourceCandidateAdmin(permissions...),
			wantCode: errcode.AuthRequired.Code,
		},
		{
			name:     "non admin",
			ctx:      nonAdminContext,
			admin:    shipmentSourceCandidateAdmin(permissions...),
			wantCode: errcode.AdminRequired.Code,
		},
		{
			name: "disabled admin",
			ctx:  adminContext,
			admin: &biz.AdminUser{
				ID:          7,
				Username:    "admin",
				Disabled:    true,
				Roles:       []biz.AdminRole{{Key: biz.SalesRoleKey}},
				Permissions: permissions,
			},
			wantCode: errcode.AdminDisabled.Code,
		},
		{
			name:          "super admin",
			ctx:           adminContext,
			admin:         &biz.AdminUser{ID: 7, Username: "admin", IsSuperAdmin: true},
			wantCode:      errcode.OK.Code,
			wantRepoCalls: 1,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &shipmentSourceCandidateJSONRPCRepo{}
			dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, tt.admin, repo)
			_, result, err := dispatcher.handleOperationalFact(tt.ctx, "list_shipment_source_candidates", "auth", mustJSONRPCStruct(t, map[string]any{}))
			if err != nil || result == nil || result.Code != tt.wantCode {
				t.Fatalf("response=%#v err=%v, want code=%d", result, err, tt.wantCode)
			}
			if repo.candidateCalls != tt.wantRepoCalls {
				t.Fatalf("candidate repository calls=%d, want %d", repo.candidateCalls, tt.wantRepoCalls)
			}
		})
	}
}

func TestJSONRPCListShipmentSourceCandidatesRequiresEnabledShipmentAndSalesOrderModules(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := shipmentSourceCandidateAdmin(
		biz.PermissionShipmentCreate,
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderItemRead,
	)

	t.Run("sales orders disabled fails closed even if runtime state drift bypassed config closure", func(t *testing.T) {
		repo := &shipmentSourceCandidateJSONRPCRepo{}
		configRepo := newServiceCustomerConfigRepo()
		revision := "2026.07.18.shipment-candidate-invalid-runtime-state"
		key := serviceCustomerConfigKey(biz.DefaultCustomerKey, revision)
		configRepo.revisions[key] = &biz.CustomerConfigRevision{
			CustomerKey: biz.DefaultCustomerKey,
			Revision:    revision,
			Status:      biz.CustomerConfigStatusActive,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
		configRepo.modules[key] = []biz.DeploymentModuleStateInput{
			{ModuleKey: "shipments", State: "enabled"},
			{ModuleKey: "sales_orders", State: "disabled"},
		}
		dispatcher := &jsonrpcDispatcher{
			log:               log.NewHelper(log.NewStdLogger(io.Discard)),
			adminReader:       stubAdminAccountReader{admin: admin},
			operationalFactUC: biz.NewOperationalFactUsecase(repo),
			customerConfigUC:  biz.NewCustomerConfigUsecase(configRepo),
		}
		_, result, err := dispatcher.handleOperationalFact(ctx, "list_shipment_source_candidates", "disabled-source", mustJSONRPCStruct(t, map[string]any{}))
		// The deliberately inconsistent active revision removes sales-order
		// entitlements before the narrower module-state guard runs. Permission
		// denial is therefore the first fail-closed boundary for this fixture.
		if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
			t.Fatalf("disabled sales order source response=%#v err=%v", result, err)
		}
		if repo.candidateCalls != 0 {
			t.Fatalf("disabled sales order source reached candidate repository")
		}
	})

	t.Run("sales orders read only dependency drift fails closed", func(t *testing.T) {
		repo := &shipmentSourceCandidateJSONRPCRepo{}
		configRepo := newServiceCustomerConfigRepo()
		dispatcher := &jsonrpcDispatcher{
			log:               log.NewHelper(log.NewStdLogger(io.Discard)),
			adminReader:       stubAdminAccountReader{admin: admin},
			operationalFactUC: biz.NewOperationalFactUsecase(repo),
			customerConfigUC:  biz.NewCustomerConfigUsecase(configRepo),
		}
		params := customerConfigPublishParams(t)
		activateOperationalFactTestCustomerConfig(t, dispatcher, params)
		revision, _ := params.AsMap()["revision"].(string)
		key := serviceCustomerConfigKey(biz.DefaultCustomerKey, revision)
		modules := configRepo.modules[key]
		foundSalesOrders := false
		for index := range modules {
			if modules[index].ModuleKey == "sales_orders" {
				modules[index].State = "read_only"
				foundSalesOrders = true
			}
		}
		if !foundSalesOrders {
			t.Fatalf("sales_orders module missing from active runtime fixture")
		}
		configRepo.modules[key] = modules

		_, result, err := dispatcher.handleOperationalFact(ctx, "list_shipment_source_candidates", "sales-order-read-only", mustJSONRPCStruct(t, map[string]any{}))
		if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
			t.Fatalf("read-only sales order source response=%#v err=%v", result, err)
		}
		if repo.candidateCalls != 0 {
			t.Fatalf("read-only sales order source reached candidate repository")
		}
	})

	t.Run("shipments read only rejects create candidate", func(t *testing.T) {
		repo := &shipmentSourceCandidateJSONRPCRepo{}
		dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)
		readOnlyShipments := customerConfigPublishParamsWithRevisionAndModuleState(
			t,
			customerConfigPublishParams(t),
			"2026.07.18.shipment-candidate-shipments-read-only",
			"shipments",
			"read_only",
		)
		activateOperationalFactTestCustomerConfig(t, dispatcher, readOnlyShipments)
		_, result, err := dispatcher.handleOperationalFact(ctx, "list_shipment_source_candidates", "shipment-read-only", mustJSONRPCStruct(t, map[string]any{}))
		if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
			t.Fatalf("read-only shipments response=%#v err=%v", result, err)
		}
		if repo.candidateCalls != 0 {
			t.Fatalf("read-only shipments reached candidate repository")
		}
	})
}

func TestJSONRPCCreateShipmentWithItemsRequiresSalesSourcePermissionsConditionally(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	requiredSourcePermissions := []string{
		biz.PermissionShipmentCreate,
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderItemRead,
	}

	for missingIndex, missing := range requiredSourcePermissions {
		t.Run("source missing "+missing, func(t *testing.T) {
			permissions := append([]string(nil), requiredSourcePermissions[:missingIndex]...)
			permissions = append(permissions, requiredSourcePermissions[missingIndex+1:]...)
			repo := &shipmentSourceCandidateJSONRPCRepo{}
			dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, shipmentSourceCandidateAdmin(permissions...), repo)
			_, result, err := dispatcher.handleOperationalFact(ctx, "create_shipment_with_items", "source-permission", mustJSONRPCStruct(t, shipmentCreateWithItemsParams(true, true)))
			if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
				t.Fatalf("missing %s response=%#v err=%v", missing, result, err)
			}
			if repo.createCalls != 0 {
				t.Fatalf("missing %s reached shipment repository", missing)
			}
		})
	}

	for _, sourceShape := range []struct {
		name         string
		sourceHeader bool
		sourceItem   bool
	}{
		{name: "source header", sourceHeader: true},
		{name: "source item", sourceItem: true},
	} {
		t.Run(sourceShape.name+" is source bound", func(t *testing.T) {
			repo := &shipmentSourceCandidateJSONRPCRepo{}
			dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, shipmentSourceCandidateAdmin(biz.PermissionShipmentCreate), repo)
			_, result, err := dispatcher.handleOperationalFact(ctx, "create_shipment_with_items", "source-shape", mustJSONRPCStruct(t, shipmentCreateWithItemsParams(sourceShape.sourceHeader, sourceShape.sourceItem)))
			if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
				t.Fatalf("source shape response=%#v err=%v", result, err)
			}
			if repo.createCalls != 0 {
				t.Fatalf("source shape reached shipment repository")
			}
		})
	}

	t.Run("manual shipment keeps shipment create only boundary", func(t *testing.T) {
		repo := &shipmentSourceCandidateJSONRPCRepo{}
		dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, shipmentSourceCandidateAdmin(biz.PermissionShipmentCreate), repo)
		_, result, err := dispatcher.handleOperationalFact(ctx, "create_shipment_with_items", "manual", mustJSONRPCStruct(t, shipmentCreateWithItemsParams(false, false)))
		if err != nil || result == nil || result.Code != errcode.OK.Code {
			t.Fatalf("manual shipment response=%#v err=%v", result, err)
		}
		if repo.createCalls != 1 {
			t.Fatalf("manual shipment create calls=%d, want 1", repo.createCalls)
		}
	})

	t.Run("source shipment succeeds with all permissions", func(t *testing.T) {
		repo := &shipmentSourceCandidateJSONRPCRepo{}
		dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, shipmentSourceCandidateAdmin(requiredSourcePermissions...), repo)
		_, result, err := dispatcher.handleOperationalFact(ctx, "create_shipment_with_items", "source-success", mustJSONRPCStruct(t, shipmentCreateWithItemsParams(true, true)))
		if err != nil || result == nil || result.Code != errcode.OK.Code {
			t.Fatalf("source shipment response=%#v err=%v", result, err)
		}
		if repo.createCalls != 1 {
			t.Fatalf("source shipment create calls=%d, want 1", repo.createCalls)
		}
	})
}

func TestJSONRPCCreateShipmentWithItemsRequiresWritableShipmentDependencyClosureForSource(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := shipmentSourceCandidateAdmin(
		biz.PermissionShipmentCreate,
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderItemRead,
	)

	t.Run("read only sales orders blocks writable shipment dependency", func(t *testing.T) {
		repo := &shipmentSourceCandidateJSONRPCRepo{}
		dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)
		readOnly := customerConfigPublishParamsWithRevisionAndModuleState(
			t,
			customerConfigPublishParams(t),
			"2026.07.18.shipment-source-create-sales-orders-read-only",
			"sales_orders",
			"read_only",
		)
		activateOperationalFactTestCustomerConfig(t, dispatcher, readOnly)
		_, result, err := dispatcher.handleOperationalFact(ctx, "create_shipment_with_items", "read-only-source", mustJSONRPCStruct(t, shipmentCreateWithItemsParams(true, true)))
		if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
			t.Fatalf("read-only sales orders source response=%#v err=%v", result, err)
		}
		if repo.createCalls != 0 {
			t.Fatalf("read-only sales orders source reached shipment repository")
		}
	})

	for _, moduleShape := range []struct {
		name  string
		state string
	}{
		{name: "disabled", state: "disabled"},
		{name: "missing"},
	} {
		t.Run(moduleShape.name+" sales orders fails closed", func(t *testing.T) {
			repo := &shipmentSourceCandidateJSONRPCRepo{}
			configRepo := newServiceCustomerConfigRepo()
			revision := "2026.07.18.shipment-source-create-sales-orders-" + moduleShape.name
			key := serviceCustomerConfigKey(biz.DefaultCustomerKey, revision)
			configRepo.revisions[key] = &biz.CustomerConfigRevision{
				CustomerKey: biz.DefaultCustomerKey,
				Revision:    revision,
				Status:      biz.CustomerConfigStatusActive,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}
			configRepo.modules[key] = []biz.DeploymentModuleStateInput{{ModuleKey: "shipments", State: "enabled"}}
			if moduleShape.state != "" {
				configRepo.modules[key] = append(configRepo.modules[key], biz.DeploymentModuleStateInput{ModuleKey: "sales_orders", State: moduleShape.state})
			}
			dispatcher := &jsonrpcDispatcher{
				log:               log.NewHelper(log.NewStdLogger(io.Discard)),
				adminReader:       stubAdminAccountReader{admin: admin},
				operationalFactUC: biz.NewOperationalFactUsecase(repo),
				customerConfigUC:  biz.NewCustomerConfigUsecase(configRepo),
			}
			_, result, err := dispatcher.handleOperationalFact(ctx, "create_shipment_with_items", "blocked-source", mustJSONRPCStruct(t, shipmentCreateWithItemsParams(true, true)))
			if err != nil || result == nil || result.Code == errcode.OK.Code {
				t.Fatalf("%s sales orders source response=%#v err=%v", moduleShape.name, result, err)
			}
			if repo.createCalls != 0 {
				t.Fatalf("%s sales orders source reached shipment repository", moduleShape.name)
			}
		})
	}
}

func TestJSONRPCListShipmentSourceCandidatesRejectsUnknownAndInvalidPagination(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := shipmentSourceCandidateAdmin(
		biz.PermissionShipmentCreate,
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderItemRead,
	)
	tests := []map[string]any{
		{"unknown": true},
		{"keyword": 1},
		{"keyword": strings.Repeat("界", 129)},
		{"sales_order_id": 0},
		{"sales_order_id": 1.5},
		{"limit": 0},
		{"limit": 201},
		{"limit": 1.5},
		{"limit": "50"},
		{"offset": -1},
		{"offset": 1.5},
		{"offset": "0"},
	}
	for index, params := range tests {
		t.Run(strings.ReplaceAll(strings.TrimSpace(strings.Repeat("x", index+1)), " ", "_"), func(t *testing.T) {
			repo := &shipmentSourceCandidateJSONRPCRepo{}
			dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)
			_, result, err := dispatcher.handleOperationalFact(ctx, "list_shipment_source_candidates", "invalid", mustJSONRPCStruct(t, params))
			if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
				t.Fatalf("params=%#v response=%#v err=%v", params, result, err)
			}
			if repo.candidateCalls != 0 {
				t.Fatalf("invalid params reached repository: %#v", params)
			}
		})
	}
}

func TestJSONRPCShipmentAggregateRejectsUnknownFieldsAndInvalidSourceTypes(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := shipmentSourceCandidateAdmin(biz.PermissionShipmentCreate)
	tests := []map[string]any{
		{"planned_ship_at": "not-a-date"},
		{"planned_ship_at": 1.5},
		{"unexpected": true},
		{"sales_order_id": 1.5},
		{"customer_id": "2"},
		{"customer_snapshot": map[string]any{"name": "forged"}},
		{"note": map[string]any{}},
		{"customer_key": 123},
	}
	for index, extra := range tests {
		t.Run(strings.Repeat("x", index+1), func(t *testing.T) {
			repo := &shipmentSourceCandidateJSONRPCRepo{}
			dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)
			params := map[string]any{
				"shipment_no":     "SHP-STRICT",
				"sales_order_id":  1,
				"customer_id":     2,
				"idempotency_key": "SHP-STRICT",
				"items": []any{map[string]any{
					"sales_order_item_id": 3,
					"product_id":          4,
					"warehouse_id":        5,
					"unit_id":             6,
					"quantity":            "1",
				}},
			}
			for key, value := range extra {
				params[key] = value
			}
			_, result, err := dispatcher.handleOperationalFact(ctx, "create_shipment_with_items", "strict", mustJSONRPCStruct(t, params))
			if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
				t.Fatalf("extra=%#v response=%#v err=%v", extra, result, err)
			}
			if repo.createCalls != 0 {
				t.Fatalf("invalid aggregate reached repository: %#v", extra)
			}
		})
	}
}

func TestShipmentItemCreateParserRejectsInvalidIdentifiers(t *testing.T) {
	base := map[string]any{
		"sales_order_item_id": float64(3),
		"product_id":          float64(4),
		"product_sku_id":      float64(5),
		"warehouse_id":        float64(6),
		"unit_id":             float64(7),
		"lot_id":              float64(8),
		"quantity":            "1",
	}
	tests := []struct {
		field string
		value any
	}{
		{field: "sales_order_item_id", value: 3.5},
		{field: "product_id", value: "4"},
		{field: "product_sku_id", value: 0},
		{field: "warehouse_id", value: 6.5},
		{field: "unit_id", value: nil},
		{field: "lot_id", value: -1},
		{field: "unexpected", value: true},
	}
	for _, tt := range tests {
		t.Run(tt.field, func(t *testing.T) {
			params := make(map[string]any, len(base)+1)
			for key, value := range base {
				params[key] = value
			}
			params[tt.field] = tt.value
			if parsed, ok := shipmentItemCreateFromParams(params); ok || parsed != nil {
				t.Fatalf("invalid %s=%#v parsed as %#v", tt.field, tt.value, parsed)
			}
		})
	}
}
