package service

import (
	"context"
	"os"
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

func TestAllCustomerConfigExecuteMethodsUseProcessRevisionBoundary(t *testing.T) {
	source, err := os.ReadFile("jsonrpc_customer_config.go")
	if err != nil {
		t.Fatalf("read source: %v", err)
	}
	text := string(source)
	methods := []string{
		"execute_sales_order_acceptance_submit",
		"execute_finished_goods_delivery_quality_decide",
		"execute_finished_goods_delivery_finance_release",
		"execute_finished_goods_delivery_shipment_ship",
		"execute_finished_goods_delivery_receivable_lead",
		"execute_material_supply_purchase_receipt_create",
		"execute_material_supply_quality_gate",
		"execute_material_supply_post_inbound",
	}
	for index, method := range methods {
		start := strings.Index(text, `case "`+method+`":`)
		if start < 0 {
			t.Fatalf("missing method %s", method)
		}
		end := len(text)
		if index+1 < len(methods) {
			if next := strings.Index(text[start+1:], `case "`+methods[index+1]+`":`); next >= 0 {
				end = start + 1 + next
			}
		}
		block := text[start:end]
		if !strings.Contains(block, "requireCustomerConfigProcessDomainCommandAllowed") ||
			!strings.Contains(block, "customerConfigProcessRuntimeBoundary(runtimeRevision") {
			t.Fatalf("%s does not use the process revision authorization boundary", method)
		}
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
