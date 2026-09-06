package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

type processRevisionSalesSubmitHandler struct {
	wantRevision string
	executed     int
}

func (h *processRevisionSalesSubmitHandler) ValidateProcessDomainCommand(_ context.Context, in *biz.ProcessDomainCommandInput, _ int) error {
	if in == nil || in.ProcessInstance == nil || in.ProcessInstance.ConfigRevision != h.wantRevision {
		return biz.ErrBadParam
	}
	return nil
}

func (h *processRevisionSalesSubmitHandler) ExecuteProcessDomainCommand(_ context.Context, _ *biz.ProcessDomainCommandInput, _ int) (*biz.ProcessDomainCommandResult, error) {
	h.executed++
	return &biz.ProcessDomainCommandResult{Outcome: "submitted"}, nil
}

func TestExecuteProcessDomainCommandUsesInstanceRevisionAfterActiveSwitch(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	ctx := customerConfigAdminCtx(7, "sales-r1")
	activatedAt := time.Date(2026, 7, 14, 9, 0, 0, 0, time.UTC)
	admin := &biz.AdminUser{ID: 7, Username: "sales-r1", CreatedAt: activatedAt, UpdatedAt: activatedAt}
	dispatcher := newCustomerConfigTestDispatcher(admin, []string{biz.SalesRoleKey})

	configRepo := newServiceCustomerConfigRepo()
	configUC := biz.NewCustomerConfigUsecase(configRepo)
	configRepo.revisions[serviceCustomerConfigKey("yoyoosun", "r1")] = &biz.CustomerConfigRevision{
		CustomerKey: "yoyoosun", Revision: "r1", Status: biz.CustomerConfigStatusActive, ActivatedAt: &activatedAt,
	}
	configRepo.revisions[serviceCustomerConfigKey("yoyoosun", "r2")] = &biz.CustomerConfigRevision{
		CustomerKey: "yoyoosun", Revision: "r2", Status: biz.CustomerConfigStatusPublished,
	}
	configRepo.modules[serviceCustomerConfigKey("yoyoosun", "r1")] = serviceProcessRuntimeSalesSubmitModules("enabled")
	configRepo.modules[serviceCustomerConfigKey("yoyoosun", "r2")] = serviceProcessRuntimeSalesSubmitModules("disabled")
	configRepo.profiles[serviceCustomerConfigKey("yoyoosun", "r1")] = []biz.RoleProfileInput{{RoleKey: biz.SalesRoleKey, DisplayName: "销售"}}
	configRepo.profiles[serviceCustomerConfigKey("yoyoosun", "r2")] = []biz.RoleProfileInput{{RoleKey: biz.SalesRoleKey, DisplayName: "销售"}}
	configRepo.entitlements[serviceCustomerConfigKey("yoyoosun", "r1")] = []biz.AccessEntitlementInput{{
		RoleKey: biz.SalesRoleKey, CapabilityKey: biz.PermissionSalesOrderSubmit,
		ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true,
	}}

	processRepo := newServiceProcessRuntimeRepo()
	processUC := biz.NewProcessRuntimeUsecase(processRepo, newServiceWorkflowRepo(), configUC)
	handler := &processRevisionSalesSubmitHandler{wantRevision: "r1"}
	if err := processUC.RegisterDomainCommandHandler(biz.ProcessDomainCommandSalesOrderSubmit, handler); err != nil {
		t.Fatalf("register handler: %v", err)
	}
	instance, _, err := processUC.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      biz.ProcessKeySalesOrderAcceptance,
		ProcessVersion:  "v1",
		ConfigRevision:  "r1",
		DefinitionHash:  strings.Repeat("a", 64),
		BusinessRefType: "sales_order",
		BusinessRefID:   1001,
		IdempotencyKey:  "start-r1",
		ModuleContractSnapshot: map[string]any{
			"source":          "active_customer_config",
			"customer_key":    "yoyoosun",
			"config_revision": "r1",
		},
		Nodes: []biz.ProcessNodeInstanceCreate{
			{NodeKey: "submit", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1, Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{"command_key": biz.ProcessDomainCommandSalesOrderSubmit}},
			{NodeKey: "end", NodeType: biz.ProcessNodeTypeEnd, Attempt: 1, Status: biz.ProcessNodeStatusWaiting},
		},
	}, admin.ID)
	if err != nil {
		t.Fatalf("create R1 process: %v", err)
	}
	started, err := processUC.StartProcessInstance(ctx, &biz.ProcessInstanceStart{ID: instance.ID}, admin.ID)
	if err != nil {
		t.Fatalf("start R1 process: %v", err)
	}

	configRepo.revisions[serviceCustomerConfigKey("yoyoosun", "r1")].Status = biz.CustomerConfigStatusSuperseded
	configRepo.revisions[serviceCustomerConfigKey("yoyoosun", "r2")].Status = biz.CustomerConfigStatusActive
	configRepo.revisions[serviceCustomerConfigKey("yoyoosun", "r2")].ActivatedAt = &activatedAt
	dispatcher.customerConfigUC = configUC
	dispatcher.processRuntimeUC = processUC

	params, err := structpb.NewStruct(map[string]any{
		"customer_key":             "yoyoosun",
		"process_instance_id":      instance.ID,
		"process_node_instance_id": started.ID,
		"expected_version":         started.Version,
		"sales_order_id":           1001,
		"idempotency_key":          "execute-r1-submit",
	})
	if err != nil {
		t.Fatalf("params: %v", err)
	}
	_, result, err := dispatcher.handleCustomerConfig(ctx, "execute_sales_order_acceptance_submit", "execute-r1", params)
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("execute R1 after R2 activation result=%#v err=%v", result, err)
	}
	if handler.executed != 1 {
		t.Fatalf("R1 handler executions = %d", handler.executed)
	}
	data := result.Data.AsMap()
	boundary, ok := data["runtime_boundary"].(map[string]any)
	if !ok || boundary["source"] != "process_instance_config_revision" || boundary["config_revision"] != "r1" {
		t.Fatalf("runtime boundary = %#v", data["runtime_boundary"])
	}
}

func TestCustomerConfigExecuteMethodsAuthorizeInstanceRevision(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	cases := []struct {
		method, command, process, source string
		params                           map[string]any
	}{
		{"execute_sales_order_acceptance_submit", biz.ProcessDomainCommandSalesOrderSubmit, biz.ProcessKeySalesOrderAcceptance, "sales_order", map[string]any{"sales_order_id": 1001}},
		{"execute_material_supply_purchase_order_submit", biz.ProcessDomainCommandPurchaseOrderSubmit, biz.ProcessKeyMaterialSupply, "purchase_order", map[string]any{"purchase_order_id": 1001}},
		{"execute_material_supply_purchase_receipt_create", biz.ProcessDomainCommandPurchaseReceiptCreate, biz.ProcessKeyMaterialSupply, "purchase_order", map[string]any{"purchase_order_id": 1001, "receipt_no": "RCPT-test", "warehouse_id": 1}},
		{"execute_material_supply_quality_gate", biz.ProcessDomainCommandIncomingQualityGate, biz.ProcessKeyMaterialSupply, "purchase_order", map[string]any{"purchase_receipt_id": 1001}},
		{"execute_material_supply_post_inbound", biz.ProcessDomainCommandInventoryPostInbound, biz.ProcessKeyMaterialSupply, "purchase_order", map[string]any{"purchase_receipt_id": 1001}},
		{"execute_finished_goods_delivery_quality_decide", biz.ProcessDomainCommandFinishedGoodsQualityDecide, biz.ProcessKeyFinishedGoodsDelivery, "shipment", map[string]any{"shipment_id": 1001, "quality_inspection_id": 1, "result": "PASS"}},
		{"execute_finished_goods_delivery_shipment_ship", biz.ProcessDomainCommandShipmentShip, biz.ProcessKeyFinishedGoodsDelivery, "shipment", map[string]any{"shipment_id": 1001}},
		{"execute_finished_goods_delivery_receivable_lead", biz.ProcessDomainCommandFinanceReceivableLead, biz.ProcessKeyFinishedGoodsDelivery, "shipment", map[string]any{"shipment_id": 1001, "receivable_source_no": "AR-test", "expected_amount": "1"}},
	}
	for _, tc := range cases {
		for _, allowed := range []bool{true, false} {
			name := tc.method + "/instance-enabled"
			if !allowed {
				name = tc.method + "/instance-disabled"
			}
			t.Run(name, func(t *testing.T) {
				ctx := customerConfigAdminCtx(7, "process-test")
				activatedAt := time.Date(2026, 7, 17, 9, 0, 0, 0, time.UTC)
				admin := &biz.AdminUser{ID: 7, Username: "process-test", IsSuperAdmin: true, CreatedAt: activatedAt, UpdatedAt: activatedAt}
				dispatcher := newCustomerConfigTestDispatcher(admin, []string{biz.AdminRoleKey})
				configRepo := newServiceCustomerConfigRepo()
				configUC := biz.NewCustomerConfigUsecase(configRepo)
				for _, revision := range []string{"r1", "r2"} {
					configRepo.revisions[serviceCustomerConfigKey("yoyoosun", revision)] = &biz.CustomerConfigRevision{CustomerKey: "yoyoosun", Revision: revision, Status: biz.CustomerConfigStatusActive, ActivatedAt: &activatedAt}
					for _, key := range []string{"customers", "products", "suppliers", "materials", "sales_orders", "purchase_orders", "purchase_receipts", "quality_inspections", "inventory", "shipments", "finance", "workflow_tasks"} {
						configRepo.modules[serviceCustomerConfigKey("yoyoosun", revision)] = append(configRepo.modules[serviceCustomerConfigKey("yoyoosun", revision)], biz.DeploymentModuleStateInput{ModuleKey: key, State: "enabled"})
					}
				}
				processRepo := newServiceProcessRuntimeRepo()
				processUC := biz.NewProcessRuntimeUsecase(processRepo, newServiceWorkflowRepo(), configUC)
				handler := &processRevisionSalesSubmitHandler{wantRevision: "r1"}
				if err := processUC.RegisterDomainCommandHandler(tc.command, handler); err != nil {
					t.Fatal(err)
				}
				instance, _, err := processUC.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{ProcessKey: tc.process, ProcessVersion: "v1", ConfigRevision: "r1", DefinitionHash: strings.Repeat("a", 64), BusinessRefType: tc.source, BusinessRefID: 1001, IdempotencyKey: "start-r1", ModuleContractSnapshot: map[string]any{"source": "active_customer_config", "customer_key": "yoyoosun", "config_revision": "r1"}, Nodes: []biz.ProcessNodeInstanceCreate{{NodeKey: "execute", NodeType: biz.ProcessNodeTypeDomainCommand, Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{"command_key": tc.command}}, {NodeKey: "end", NodeType: biz.ProcessNodeTypeEnd, Status: biz.ProcessNodeStatusWaiting}}}, admin.ID)
				if err != nil {
					t.Fatal(err)
				}
				node, err := processUC.StartProcessInstance(ctx, &biz.ProcessInstanceStart{ID: instance.ID}, admin.ID)
				if err != nil {
					t.Fatal(err)
				}
				configRepo.revisions[serviceCustomerConfigKey("yoyoosun", "r1")].Status = biz.CustomerConfigStatusSuperseded
				disabledRevision := "r2"
				if !allowed {
					disabledRevision = "r1"
				}
				for i := range configRepo.modules[serviceCustomerConfigKey("yoyoosun", disabledRevision)] {
					configRepo.modules[serviceCustomerConfigKey("yoyoosun", disabledRevision)][i].State = "disabled"
				}
				dispatcher.customerConfigUC = configUC
				dispatcher.processRuntimeUC = processUC
				pm := map[string]any{"customer_key": "yoyoosun", "process_instance_id": instance.ID, "process_node_instance_id": node.ID, "expected_version": node.Version, "idempotency_key": "execute-r1"}
				for key, value := range tc.params {
					pm[key] = value
				}
				params, err := structpb.NewStruct(pm)
				if err != nil {
					t.Fatal(err)
				}
				_, result, err := dispatcher.handleCustomerConfig(ctx, tc.method, "execute-r1", params)
				if err != nil || result == nil {
					t.Fatalf("result=%#v err=%v", result, err)
				}
				if !allowed {
					if result.Code != errcode.InvalidParam.Code || handler.executed != 0 {
						t.Fatalf("disabled instance revision reached command: result=%#v executions=%d", result, handler.executed)
					}
					return
				}
				if result.Code != errcode.OK.Code || handler.executed != 1 {
					t.Fatalf("instance revision must authorize command despite disabled active revision: result=%#v executions=%d", result, handler.executed)
				}
				boundary, ok := result.Data.AsMap()["runtime_boundary"].(map[string]any)
				if !ok || boundary["source"] != "process_instance_config_revision" || boundary["config_revision"] != "r1" {
					t.Fatalf("runtime boundary=%#v", boundary)
				}
			})
		}
	}
}

func TestExecuteShipmentShipRejectsReadOnlyWorkflowTasksAtInstanceRevision(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	ctx := customerConfigAdminCtx(7, "shipment-admin")
	activatedAt := time.Date(2026, 7, 17, 9, 0, 0, 0, time.UTC)
	admin := &biz.AdminUser{
		ID:           7,
		Username:     "shipment-admin",
		IsSuperAdmin: true,
		CreatedAt:    activatedAt,
		UpdatedAt:    activatedAt,
	}
	dispatcher := newCustomerConfigTestDispatcher(admin, []string{biz.AdminRoleKey})

	configRepo := newServiceCustomerConfigRepo()
	configRepo.revisions[serviceCustomerConfigKey("yoyoosun", "shipment-r1")] = &biz.CustomerConfigRevision{
		CustomerKey: "yoyoosun",
		Revision:    "shipment-r1",
		Status:      biz.CustomerConfigStatusActive,
		ActivatedAt: &activatedAt,
	}
	configRepo.modules[serviceCustomerConfigKey("yoyoosun", "shipment-r1")] = serviceProcessRuntimeShipmentShipModules("read_only")
	configUC := biz.NewCustomerConfigUsecase(configRepo)

	processRepo := newServiceProcessRuntimeRepo()
	processUC := biz.NewProcessRuntimeUsecase(processRepo, newServiceWorkflowRepo(), configUC)
	handler := &processRevisionSalesSubmitHandler{wantRevision: "shipment-r1"}
	if err := processUC.RegisterDomainCommandHandler(biz.ProcessDomainCommandShipmentShip, handler); err != nil {
		t.Fatalf("register shipment handler: %v", err)
	}
	instance, _, err := processUC.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      biz.ProcessKeyFinishedGoodsDelivery,
		ProcessVersion:  "v1",
		ConfigRevision:  "shipment-r1",
		DefinitionHash:  strings.Repeat("b", 64),
		BusinessRefType: "shipment",
		BusinessRefID:   9001,
		IdempotencyKey:  "shipment-r1-create",
		ModuleContractSnapshot: map[string]any{
			"source":          "active_customer_config",
			"customer_key":    "yoyoosun",
			"config_revision": "shipment-r1",
		},
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey:        "shipment_execution",
				NodeType:       biz.ProcessNodeTypeDomainCommand,
				Status:         biz.ProcessNodeStatusWaiting,
				PolicySnapshot: map[string]any{"command_key": biz.ProcessDomainCommandShipmentShip},
			},
			{NodeKey: "end", NodeType: biz.ProcessNodeTypeEnd, Status: biz.ProcessNodeStatusWaiting},
		},
	}, admin.ID)
	if err != nil {
		t.Fatalf("create process: %v", err)
	}
	activeNode, err := processUC.StartProcessInstance(ctx, &biz.ProcessInstanceStart{ID: instance.ID}, admin.ID)
	if err != nil {
		t.Fatalf("start process: %v", err)
	}
	dispatcher.customerConfigUC = configUC
	dispatcher.processRuntimeUC = processUC

	params, err := structpb.NewStruct(map[string]any{
		"customer_key":             "yoyoosun",
		"process_instance_id":      instance.ID,
		"process_node_instance_id": activeNode.ID,
		"expected_version":         activeNode.Version,
		"shipment_id":              9001,
		"idempotency_key":          "shipment-r1-ship",
	})
	if err != nil {
		t.Fatalf("params: %v", err)
	}
	_, result, err := dispatcher.handleCustomerConfig(ctx, "execute_finished_goods_delivery_shipment_ship", "shipment-r1-ship", params)
	if err != nil {
		t.Fatalf("execute err: %v", err)
	}
	if result == nil || result.Code != errcode.InvalidParam.Code {
		t.Fatalf("read_only workflow_tasks result=%#v, want invalid param", result)
	}
	if handler.executed != 0 {
		t.Fatalf("read_only workflow_tasks executed shipment handler %d times", handler.executed)
	}
}

func serviceProcessRuntimeSalesSubmitModules(workflowState string) []biz.DeploymentModuleStateInput {
	return []biz.DeploymentModuleStateInput{
		{ModuleKey: "customers", State: "enabled"},
		{ModuleKey: "products", State: "enabled"},
		{ModuleKey: "sales_orders", State: "enabled"},
		{ModuleKey: "workflow_tasks", State: workflowState},
	}
}

func serviceProcessRuntimeShipmentShipModules(workflowState string) []biz.DeploymentModuleStateInput {
	return []biz.DeploymentModuleStateInput{
		{ModuleKey: "customers", State: "enabled"},
		{ModuleKey: "products", State: "enabled"},
		{ModuleKey: "sales_orders", State: "enabled"},
		{ModuleKey: "inventory", State: "enabled"},
		{ModuleKey: "shipments", State: "enabled"},
		{ModuleKey: "workflow_tasks", State: workflowState},
	}
}
