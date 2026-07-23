package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

type customerConfigSalesOrderSourceRepoStub struct {
	biz.SalesOrderRepo
	order *biz.SalesOrder
	err   error
	calls int
}

func (r *customerConfigSalesOrderSourceRepoStub) GetSalesOrder(context.Context, int) (*biz.SalesOrder, error) {
	r.calls++
	return r.order, r.err
}

type customerConfigPurchaseOrderSourceRepoStub struct {
	biz.PurchaseOrderRepo
	order *biz.PurchaseOrder
	err   error
	calls int
}

func (r *customerConfigPurchaseOrderSourceRepoStub) GetPurchaseOrder(context.Context, int) (*biz.PurchaseOrder, error) {
	r.calls++
	return r.order, r.err
}

type customerConfigShipmentSourceRepoStub struct {
	biz.OperationalFactRepo
	shipment *biz.Shipment
	err      error
	calls    int
}

func (r *customerConfigShipmentSourceRepoStub) GetShipment(context.Context, int) (*biz.Shipment, error) {
	r.calls++
	return r.shipment, r.err
}

func TestCustomerConfigProcessSourceValidationUsesDomainTruth(t *testing.T) {
	ctx := context.Background()
	t.Run("sales order", func(t *testing.T) {
		for _, tt := range []struct {
			name  string
			order *biz.SalesOrder
			err   error
			want  string
		}{
			{name: "not found", err: biz.ErrSalesOrderNotFound},
			{name: "wrong id", order: &biz.SalesOrder{ID: 43, OrderNo: "SO-43", LifecycleStatus: biz.SalesOrderStatusDraft}, err: biz.ErrBadParam},
			{name: "wrong state", order: &biz.SalesOrder{ID: 42, OrderNo: "SO-42", LifecycleStatus: biz.SalesOrderStatusClosed}, err: biz.ErrBadParam},
			{name: "draft", order: &biz.SalesOrder{ID: 42, OrderNo: " SO-42 ", LifecycleStatus: biz.SalesOrderStatusDraft}, want: "SO-42"},
			{name: "submitted replay", order: &biz.SalesOrder{ID: 42, OrderNo: "SO-42", LifecycleStatus: biz.SalesOrderStatusSubmitted}, want: "SO-42"},
		} {
			t.Run(tt.name, func(t *testing.T) {
				d := &jsonrpcDispatcher{salesOrderUC: biz.NewSalesOrderUsecase(&customerConfigSalesOrderSourceRepoStub{order: tt.order, err: func() error {
					if tt.name == "not found" {
						return biz.ErrSalesOrderNotFound
					}
					return nil
				}()})}
				got, err := d.salesOrderProcessSourceRefNo(ctx, 42)
				assertCustomerConfigSourceRefResult(t, got, err, tt.err, tt.want)
			})
		}
	})

	t.Run("purchase order", func(t *testing.T) {
		for _, tt := range []struct {
			name  string
			order *biz.PurchaseOrder
			err   error
			want  string
		}{
			{name: "not found", err: biz.ErrPurchaseOrderNotFound},
			{name: "wrong id", order: &biz.PurchaseOrder{ID: 5002, PurchaseOrderNo: "PO-5002", LifecycleStatus: biz.PurchaseOrderStatusApproved}, err: biz.ErrBadParam},
			{name: "wrong state", order: &biz.PurchaseOrder{ID: 5001, PurchaseOrderNo: "PO-5001", LifecycleStatus: biz.PurchaseOrderStatusDraft}, err: biz.ErrBadParam},
			{name: "submitted", order: &biz.PurchaseOrder{ID: 5001, PurchaseOrderNo: " PO-5001 ", LifecycleStatus: biz.PurchaseOrderStatusSubmitted}, want: "PO-5001"},
		} {
			t.Run(tt.name, func(t *testing.T) {
				repo := &customerConfigPurchaseOrderSourceRepoStub{order: tt.order}
				if tt.name == "not found" {
					repo.err = biz.ErrPurchaseOrderNotFound
				}
				d := &jsonrpcDispatcher{purchaseOrderUC: biz.NewPurchaseOrderUsecase(repo)}
				got, err := d.purchaseOrderProcessSourceRefNo(ctx, 5001)
				assertCustomerConfigSourceRefResult(t, got, err, tt.err, tt.want)
			})
		}
	})

	t.Run("shipment", func(t *testing.T) {
		for _, tt := range []struct {
			name     string
			shipment *biz.Shipment
			err      error
			want     string
		}{
			{name: "not found", err: biz.ErrShipmentNotFound},
			{name: "wrong id", shipment: &biz.Shipment{ID: 9002, ShipmentNo: "SHIP-9002", Status: biz.ShipmentStatusDraft}, err: biz.ErrBadParam},
			{name: "wrong state", shipment: &biz.Shipment{ID: 9001, ShipmentNo: "SHIP-9001", Status: biz.ShipmentStatusCancelled}, err: biz.ErrBadParam},
			{name: "draft", shipment: &biz.Shipment{ID: 9001, ShipmentNo: " SHIP-9001 ", Status: biz.ShipmentStatusDraft}, want: "SHIP-9001"},
			{name: "shipped replay", shipment: &biz.Shipment{ID: 9001, ShipmentNo: "SHIP-9001", Status: biz.ShipmentStatusShipped}, want: "SHIP-9001"},
		} {
			t.Run(tt.name, func(t *testing.T) {
				repo := &customerConfigShipmentSourceRepoStub{shipment: tt.shipment}
				if tt.name == "not found" {
					repo.err = biz.ErrShipmentNotFound
				}
				d := &jsonrpcDispatcher{operationalFactUC: biz.NewOperationalFactUsecase(repo)}
				got, err := d.shipmentProcessSourceRefNo(ctx, 9001)
				assertCustomerConfigSourceRefResult(t, got, err, tt.err, tt.want)
			})
		}
	})
}

func assertCustomerConfigSourceRefResult(t *testing.T, got *string, err, wantErr error, want string) {
	t.Helper()
	if wantErr != nil {
		if !errors.Is(err, wantErr) {
			t.Fatalf("error = %v, want %v", err, wantErr)
		}
		return
	}
	if err != nil || got == nil || *got != want {
		t.Fatalf("source ref = %#v, %v, want %q", got, err, want)
	}
}

func TestCustomerConfigProcessStartsRequireSourceReadPermissionBeforeRuntime(t *testing.T) {
	tests := []struct {
		name       string
		permission string
		method     string
		params     map[string]any
	}{
		{name: "sales", permission: biz.PermissionSalesOrderSubmit, method: "start_sales_order_acceptance_process", params: map[string]any{"sales_order_id": float64(42), "idempotency_key": "test"}},
		{name: "purchase", permission: biz.PermissionPurchaseReceiptCreate, method: "start_material_supply_purchase_order_process", params: map[string]any{"purchase_order_id": float64(5001), "idempotency_key": "test"}},
		{name: "shipment", permission: biz.PermissionShipmentCreate, method: "start_finished_goods_delivery_process", params: map[string]any{"shipment_id": float64(9001), "idempotency_key": "test"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dispatcher, runtimeRepo := newCustomerConfigTestDispatcherWithRuntimeRepo(
				&biz.AdminUser{ID: 1, Username: tt.name, CreatedAt: time.Now(), UpdatedAt: time.Now()}, nil,
			)
			adminRepo := dispatcher.adminReader.(*memAdminManageRepoForData)
			adminRepo.admins[1].Permissions = []string{tt.permission}
			params := map[string]any{"customer_key": biz.DefaultCustomerKey}
			for key, value := range tt.params {
				params[key] = value
			}
			pb, err := structpb.NewStruct(params)
			if err != nil {
				t.Fatalf("NewStruct: %v", err)
			}
			_, result, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, tt.name), tt.method, "permission", pb)
			if err != nil || result.Code != errcode.PermissionDenied.Code {
				t.Fatalf("result = %#v, err=%v, want permission denied", result, err)
			}
			if len(runtimeRepo.processes) != 0 || len(runtimeRepo.nodes) != 0 {
				t.Fatalf("missing source read permission touched runtime: processes=%d nodes=%d", len(runtimeRepo.processes), len(runtimeRepo.nodes))
			}
		})
	}
}

func TestCustomerConfigProcessStartsRequireEnabledSourceModuleBeforeSourceOrRuntime(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "")
	tests := []struct {
		name    string
		method  string
		params  map[string]any
		modules []biz.DeploymentModuleStateInput
		setup   func(*jsonrpcDispatcher) func() int
	}{
		{
			name:   "sales module missing",
			method: "start_sales_order_acceptance_process",
			params: map[string]any{"sales_order_id": float64(42), "idempotency_key": "module/sales"},
			modules: []biz.DeploymentModuleStateInput{
				{ModuleKey: "customers", State: "enabled"},
				{ModuleKey: "products", State: "enabled"},
			},
			setup: func(d *jsonrpcDispatcher) func() int {
				repo := &customerConfigSalesOrderSourceRepoStub{}
				d.salesOrderUC = biz.NewSalesOrderUsecase(repo)
				return func() int { return repo.calls }
			},
		},
		{
			name:   "purchase module read only",
			method: "start_material_supply_purchase_order_process",
			params: map[string]any{"purchase_order_id": float64(5001), "idempotency_key": "module/purchase"},
			modules: []biz.DeploymentModuleStateInput{
				{ModuleKey: "suppliers", State: "enabled"},
				{ModuleKey: "materials", State: "enabled"},
				{ModuleKey: "purchase_orders", State: "read_only"},
			},
			setup: func(d *jsonrpcDispatcher) func() int {
				repo := &customerConfigPurchaseOrderSourceRepoStub{}
				d.purchaseOrderUC = biz.NewPurchaseOrderUsecase(repo)
				return func() int { return repo.calls }
			},
		},
		{
			name:   "shipment module disabled",
			method: "start_finished_goods_delivery_process",
			params: map[string]any{"shipment_id": float64(9001), "idempotency_key": "module/shipment"},
			modules: []biz.DeploymentModuleStateInput{
				{ModuleKey: "customers", State: "enabled"},
				{ModuleKey: "products", State: "enabled"},
				{ModuleKey: "sales_orders", State: "enabled"},
				{ModuleKey: "inventory", State: "enabled"},
				{ModuleKey: "shipments", State: "disabled"},
			},
			setup: func(d *jsonrpcDispatcher) func() int {
				repo := &customerConfigShipmentSourceRepoStub{}
				d.operationalFactUC = biz.NewOperationalFactUsecase(repo)
				return func() int { return repo.calls }
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dispatcher, runtimeRepo := newCustomerConfigTestDispatcherWithRuntimeRepo(
				&biz.AdminUser{ID: 1, Username: tt.name, IsSuperAdmin: true, CreatedAt: time.Now(), UpdatedAt: time.Now()}, nil,
			)
			configRepo := newServiceCustomerConfigRepo()
			revision := "source-module-gate/" + tt.name
			key := serviceCustomerConfigKey(biz.DefaultCustomerKey, revision)
			configRepo.revisions[key] = &biz.CustomerConfigRevision{
				CustomerKey: biz.DefaultCustomerKey,
				Revision:    revision,
				Status:      biz.CustomerConfigStatusActive,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}
			configRepo.modules[key] = tt.modules
			dispatcher.customerConfigUC = biz.NewCustomerConfigUsecase(configRepo)
			sourceCalls := tt.setup(dispatcher)
			params := map[string]any{"customer_key": biz.DefaultCustomerKey}
			for key, value := range tt.params {
				params[key] = value
			}
			pb, err := structpb.NewStruct(params)
			if err != nil {
				t.Fatalf("NewStruct: %v", err)
			}
			_, result, err := dispatcher.handleCustomerConfig(customerConfigAdminCtx(1, tt.name), tt.method, "module", pb)
			if err != nil || result.Code != errcode.InvalidParam.Code {
				t.Fatalf("result = %#v, err=%v, want invalid param", result, err)
			}
			if calls := sourceCalls(); calls != 0 {
				t.Fatalf("invalid source module reached source repository %d times", calls)
			}
			if len(runtimeRepo.processes) != 0 || len(runtimeRepo.nodes) != 0 {
				t.Fatalf("invalid source module touched runtime: processes=%d nodes=%d", len(runtimeRepo.processes), len(runtimeRepo.nodes))
			}
		})
	}
}

func TestMapCustomerConfigErrorPurchaseOrderNotFound(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(nil, nil)
	result := dispatcher.mapCustomerConfigError(context.Background(), biz.ErrPurchaseOrderNotFound)
	if result.Code != errcode.InvalidParam.Code || result.Message != "采购订单不存在" {
		t.Fatalf("result = %#v", result)
	}
}
