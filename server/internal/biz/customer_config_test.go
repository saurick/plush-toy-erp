package biz

import (
	"context"
	"errors"
	"testing"
	"time"
)

type memCustomerConfigRepo struct {
	revisions     map[string]*CustomerConfigRevision
	modules       map[string][]DeploymentModuleStateInput
	roles         map[string][]RoleProfileInput
	entitlements  map[string][]AccessEntitlementInput
	pools         map[string][]WorkPoolInput
	memberships   map[string][]WorkPoolMembershipInput
	processCount  map[string]int
	taskCount     map[string]int
	businessCount map[string]int
}

func newMemCustomerConfigRepo() *memCustomerConfigRepo {
	return &memCustomerConfigRepo{
		revisions:     map[string]*CustomerConfigRevision{},
		modules:       map[string][]DeploymentModuleStateInput{},
		roles:         map[string][]RoleProfileInput{},
		entitlements:  map[string][]AccessEntitlementInput{},
		pools:         map[string][]WorkPoolInput{},
		memberships:   map[string][]WorkPoolMembershipInput{},
		processCount:  map[string]int{},
		taskCount:     map[string]int{},
		businessCount: map[string]int{},
	}
}

func customerRevisionKey(customerKey, revision string) string {
	return customerKey + "/" + revision
}

func (r *memCustomerConfigRepo) GetCustomerConfigRevision(_ context.Context, customerKey, revision string) (*CustomerConfigRevision, error) {
	item := r.revisions[customerRevisionKey(customerKey, revision)]
	if item == nil {
		return nil, ErrCustomerConfigNotFound
	}
	cloned := *item
	return &cloned, nil
}

func (r *memCustomerConfigRepo) GetActiveCustomerConfigRevision(_ context.Context, customerKey string) (*CustomerConfigRevision, error) {
	for _, item := range r.revisions {
		if item.CustomerKey == customerKey && item.Status == CustomerConfigStatusActive {
			cloned := *item
			return &cloned, nil
		}
	}
	return nil, ErrCustomerConfigNotFound
}

func (r *memCustomerConfigRepo) PublishCustomerConfig(_ context.Context, in CustomerConfigPublishInput, configHash string, publishedBy int, publishedAt time.Time) (*CustomerConfigRevision, error) {
	item := &CustomerConfigRevision{
		ID:               len(r.revisions) + 1,
		CustomerKey:      in.CustomerKey,
		Revision:         in.Revision,
		ProductVersion:   in.ProductVersion,
		ConfigHash:       configHash,
		Status:           CustomerConfigStatusPublished,
		CompiledSnapshot: in.CompiledSnapshot,
		PublishedBy:      &publishedBy,
		PublishedAt:      &publishedAt,
		CreatedAt:        publishedAt,
		UpdatedAt:        publishedAt,
	}
	key := customerRevisionKey(in.CustomerKey, in.Revision)
	r.revisions[key] = item
	r.modules[key] = append([]DeploymentModuleStateInput(nil), in.ModuleStates...)
	r.roles[key] = append([]RoleProfileInput(nil), in.RoleProfiles...)
	r.entitlements[key] = append([]AccessEntitlementInput(nil), in.AccessEntitlements...)
	r.pools[key] = append([]WorkPoolInput(nil), in.WorkPools...)
	r.memberships[key] = append([]WorkPoolMembershipInput(nil), in.WorkPoolMemberships...)
	cloned := *item
	return &cloned, nil
}

func (r *memCustomerConfigRepo) ActivateCustomerConfig(_ context.Context, customerKey, revision string, activatedBy int, activatedAt time.Time) (*CustomerConfigRevision, error) {
	return r.switchActiveCustomerConfigRevision(customerKey, revision, activatedBy, activatedAt)
}

func (r *memCustomerConfigRepo) RollbackCustomerConfig(_ context.Context, customerKey, targetRevision string, actorID int, rolledBackAt time.Time) (*CustomerConfigRevision, error) {
	return r.switchActiveCustomerConfigRevision(customerKey, targetRevision, actorID, rolledBackAt)
}

func (r *memCustomerConfigRepo) switchActiveCustomerConfigRevision(customerKey, revision string, actorID int, activatedAt time.Time) (*CustomerConfigRevision, error) {
	target := r.revisions[customerRevisionKey(customerKey, revision)]
	if target == nil {
		return nil, ErrCustomerConfigNotFound
	}
	for _, item := range r.revisions {
		if item.CustomerKey == customerKey && item.Status == CustomerConfigStatusActive && item.Revision != revision {
			item.Status = CustomerConfigStatusSuperseded
		}
	}
	target.Status = CustomerConfigStatusActive
	target.ActivatedBy = &actorID
	target.ActivatedAt = &activatedAt
	cloned := *target
	return &cloned, nil
}

func (r *memCustomerConfigRepo) ListDeploymentModuleStates(_ context.Context, customerKey, revision string) ([]DeploymentModuleStateInput, error) {
	return append([]DeploymentModuleStateInput(nil), r.modules[customerRevisionKey(customerKey, revision)]...), nil
}

func (r *memCustomerConfigRepo) ListRoleProfiles(_ context.Context, customerKey, revision string) ([]RoleProfileInput, error) {
	return append([]RoleProfileInput(nil), r.roles[customerRevisionKey(customerKey, revision)]...), nil
}

func (r *memCustomerConfigRepo) ListAccessEntitlements(_ context.Context, customerKey, revision string, roleKeys []string) ([]AccessEntitlementInput, error) {
	allowed := map[string]struct{}{}
	for _, key := range NormalizeAdminRoleKeys(roleKeys) {
		allowed[key] = struct{}{}
	}
	out := []AccessEntitlementInput{}
	for _, item := range r.entitlements[customerRevisionKey(customerKey, revision)] {
		if _, ok := allowed[item.RoleKey]; ok {
			out = append(out, item)
		}
	}
	return out, nil
}

func (r *memCustomerConfigRepo) ListWorkPools(_ context.Context, customerKey, revision string) ([]WorkPoolInput, error) {
	return append([]WorkPoolInput(nil), r.pools[customerRevisionKey(customerKey, revision)]...), nil
}

func (r *memCustomerConfigRepo) ListWorkPoolMemberships(_ context.Context, customerKey, revision string, roleKeys []string, userID int) ([]WorkPoolMembershipInput, error) {
	allowed := map[string]struct{}{}
	for _, key := range NormalizeAdminRoleKeys(roleKeys) {
		allowed[key] = struct{}{}
	}
	out := []WorkPoolMembershipInput{}
	for _, item := range r.memberships[customerRevisionKey(customerKey, revision)] {
		_, roleOK := allowed[item.RoleKey]
		if roleOK || (item.UserID > 0 && item.UserID == userID) {
			out = append(out, item)
		}
	}
	return out, nil
}

func (r *memCustomerConfigRepo) ListWorkPoolMembershipsByPools(_ context.Context, customerKey, revision string, poolKeys []string) ([]WorkPoolMembershipInput, error) {
	allowed := map[string]struct{}{}
	for _, key := range normalizeStringList(poolKeys) {
		allowed[key] = struct{}{}
	}
	out := []WorkPoolMembershipInput{}
	for _, item := range r.memberships[customerRevisionKey(customerKey, revision)] {
		if _, ok := allowed[item.PoolKey]; ok {
			out = append(out, item)
		}
	}
	return out, nil
}

func (r *memCustomerConfigRepo) CountInFlightProcessInstances(_ context.Context, customerKey, revision string, processKeys []string) (int, error) {
	count := 0
	for _, processKey := range normalizeStringList(processKeys) {
		count += r.processCount[customerRevisionKey(customerKey, revision)+"/"+processKey]
	}
	return count, nil
}

func (r *memCustomerConfigRepo) CountOpenWorkflowTasksByPools(_ context.Context, customerKey, revision string, poolKeys []string) (int, error) {
	count := 0
	for _, poolKey := range normalizeStringList(poolKeys) {
		count += r.taskCount[customerRevisionKey(customerKey, revision)+"/"+poolKey]
	}
	return count, nil
}

func (r *memCustomerConfigRepo) CountOpenBusinessDocumentsByModules(_ context.Context, customerKey string, moduleKeys []string) (int, error) {
	count := 0
	for _, moduleKey := range normalizeStringList(moduleKeys) {
		count += r.businessCount[customerKey+"/"+moduleKey]
	}
	return count, nil
}

func validCustomerConfigInput() CustomerConfigPublishInput {
	return CustomerConfigPublishInput{
		CustomerKey:    "yoyoosun",
		Revision:       "2026.06.28.1",
		ProductVersion: "local-test",
		CompiledSnapshot: map[string]any{
			"customer": map[string]any{"key": "yoyoosun", "name": "永绅"},
			"pages":    []any{"sales-orders", "permission-center"},
			"workflows": []any{
				map[string]any{
					"key":           "sales_order_approval",
					"sourceModules": []any{"sales_orders"},
				},
			},
			"businessFlows": []any{
				map[string]any{
					"key":     "sales_to_production",
					"modules": []any{"sales_orders", "workflow_tasks"},
				},
			},
			"fieldPolicies": map[string]any{
				"sales_orders.default": map[string]any{
					"source_no": map[string]any{"visible": false, "editable": false},
				},
			},
		},
		ModuleStates: []DeploymentModuleStateInput{
			{ModuleKey: "customers", State: "enabled"},
			{ModuleKey: "products", State: "enabled"},
			{ModuleKey: "sales_orders", State: "enabled"},
			{ModuleKey: "workflow_tasks", State: "enabled"},
			{ModuleKey: "purchase_orders", State: "enabled"},
			{ModuleKey: "purchase_receipts", State: "enabled"},
			{ModuleKey: "quality_inspections", State: "enabled"},
			{ModuleKey: "inventory", State: "enabled"},
			{ModuleKey: "shipments", State: "enabled"},
			{ModuleKey: "finance", State: "enabled"},
			{ModuleKey: "production", State: "read_only"},
		},
		RoleProfiles: []RoleProfileInput{
			{RoleKey: SalesRoleKey, DisplayName: "业务"},
			{RoleKey: FinanceRoleKey, DisplayName: "财务"},
		},
		AccessEntitlements: []AccessEntitlementInput{
			{RoleKey: SalesRoleKey, CapabilityKey: PermissionSalesOrderRead, Enabled: true},
			{RoleKey: FinanceRoleKey, CapabilityKey: PermissionFinancePayableRead, Enabled: true},
		},
		WorkPools: []WorkPoolInput{
			{PoolKey: "sales", ModuleKey: "sales_orders", DisplayName: "业务池"},
			{PoolKey: "finance", ModuleKey: "finance", DisplayName: "财务池"},
		},
		WorkPoolMemberships: []WorkPoolMembershipInput{
			{PoolKey: "sales", RoleKey: SalesRoleKey, Enabled: true},
			{PoolKey: "finance", RoleKey: FinanceRoleKey, Enabled: true},
		},
	}
}

func validSalesOrderAcceptanceProcessDefinition() map[string]any {
	return map[string]any{
		"process_key":            ProcessKeySalesOrderAcceptance,
		"process_version":        "v1",
		"variant_key":            "default",
		"manifest_status":        "runtime_loader_ready",
		"runtime_loader_enabled": true,
		"business_ref_type":      "sales_order",
		"domain_boundary":        "source_document_command_only",
		"fact_boundary":          "no_fact_posting",
		"config_revision_source": "runtime_manifest",
		"definition_hash_source": "compiled_customer_package",
		"source_workflow_key":    "sales_order_approval",
		"source_status":          "workflow_only",
		"guardrail":              "test process definition must not post facts",
		"nodes": []any{
			map[string]any{
				"node_key":                "submit_sales_order",
				"node_type":               ProcessNodeTypeDomainCommand,
				"source_owner_pool_key":   "sales",
				"required_capability_key": PermissionSalesOrderSubmit,
				"policy_snapshot": map[string]any{
					"command_key":              ProcessDomainCommandSalesOrderSubmit,
					"source_command_key":       "submit_sales_order",
					"handler":                  "SalesOrderUsecase.SubmitSalesOrder",
					"idempotency_key_required": true,
					"writes_fact":              false,
				},
			},
			map[string]any{
				"node_key":                "order_approval",
				"node_type":               ProcessNodeTypeApproval,
				"source_owner_pool_key":   "boss",
				"owner_pool_key":          "order_approval",
				"required_capability_key": PermissionWorkflowTaskApprove,
				"form_profile_key":        "sales_order_approval.default",
				"action_set_key":          "sales_order_approval",
			},
			map[string]any{
				"node_key":                "order_review",
				"node_type":               ProcessNodeTypeHumanTask,
				"source_owner_pool_key":   "pmc",
				"owner_pool_key":          "order_review",
				"required_capability_key": PermissionWorkflowTaskComplete,
				"form_profile_key":        "sales_order_review.default",
				"action_set_key":          "sales_order_review",
			},
			map[string]any{
				"node_key":  "end",
				"node_type": ProcessNodeTypeEnd,
			},
		},
	}
}

func validMaterialSupplyRuntimeProcessDefinition() map[string]any {
	return map[string]any{
		"process_key":            ProcessKeyMaterialSupply,
		"process_version":        "v1",
		"variant_key":            "purchase_receipt_iqc_inbound",
		"manifest_status":        "runtime_loader_ready",
		"runtime_loader_enabled": true,
		"business_ref_type":      "purchase_receipt",
		"domain_boundary":        "explicit_fact_command_api",
		"fact_boundary":          "no_fact_posting",
		"config_revision_source": "runtime_manifest",
		"definition_hash_source": "compiled_customer_package",
		"source_status":          "explicit_api_only",
		"nodes": []any{
			map[string]any{
				"node_key":                "incoming_qc",
				"node_type":               ProcessNodeTypeDomainCommand,
				"required_capability_key": PermissionQualityInspectionUpdate,
				"policy_snapshot": map[string]any{
					"command_key":              ProcessDomainCommandQualityInspectionDecide,
					"handler":                  "InventoryUsecase.PassQualityInspection/RejectQualityInspection",
					"idempotency_key_required": true,
					"writes_fact":              false,
				},
			},
			map[string]any{
				"node_key":                "warehouse_inbound",
				"node_type":               ProcessNodeTypeDomainCommand,
				"required_capability_key": PermissionWarehouseInboundConfirm,
				"policy_snapshot": map[string]any{
					"command_key":              ProcessDomainCommandInventoryPostInbound,
					"handler":                  "InventoryUsecase.PostPurchaseReceipt",
					"idempotency_key_required": true,
					"writes_fact":              false,
				},
			},
			map[string]any{
				"node_key":  "end",
				"node_type": ProcessNodeTypeEnd,
			},
		},
	}
}

func validMaterialSupplyPurchaseOrderRuntimeProcessDefinition() map[string]any {
	return map[string]any{
		"process_key":            ProcessKeyMaterialSupply,
		"process_version":        "v1",
		"variant_key":            "purchase_order_receipt_iqc_inbound",
		"manifest_status":        "runtime_loader_ready",
		"runtime_loader_enabled": true,
		"business_ref_type":      "purchase_order",
		"domain_boundary":        "explicit_fact_command_api",
		"fact_boundary":          "no_fact_posting",
		"config_revision_source": "runtime_manifest",
		"definition_hash_source": "compiled_customer_package",
		"source_status":          "explicit_api_only",
		"nodes": []any{
			map[string]any{
				"node_key":                "purchase_receipt_source",
				"node_type":               ProcessNodeTypeDomainCommand,
				"required_capability_key": PermissionPurchaseReceiptCreate,
				"policy_snapshot": map[string]any{
					"command_key":              ProcessDomainCommandPurchaseReceiptCreate,
					"handler":                  "InventoryUsecase.CreatePurchaseReceiptFromPurchaseOrder",
					"idempotency_key_required": true,
					"writes_fact":              false,
				},
			},
			map[string]any{
				"node_key":                "incoming_qc",
				"node_type":               ProcessNodeTypeDomainCommand,
				"required_capability_key": PermissionQualityInspectionUpdate,
				"policy_snapshot": map[string]any{
					"command_key":              ProcessDomainCommandQualityInspectionDecide,
					"handler":                  "InventoryUsecase.PassQualityInspection/RejectQualityInspection",
					"idempotency_key_required": true,
					"writes_fact":              false,
				},
			},
			map[string]any{
				"node_key":                "warehouse_inbound",
				"node_type":               ProcessNodeTypeDomainCommand,
				"required_capability_key": PermissionWarehouseInboundConfirm,
				"policy_snapshot": map[string]any{
					"command_key":              ProcessDomainCommandInventoryPostInbound,
					"handler":                  "InventoryUsecase.PostPurchaseReceipt",
					"idempotency_key_required": true,
					"writes_fact":              false,
				},
			},
			map[string]any{
				"node_key":  "end",
				"node_type": ProcessNodeTypeEnd,
			},
		},
	}
}

func validFinishedGoodsDeliveryStartReadyProcessDefinition() map[string]any {
	blockers := []any{
		"domain_command_handler_not_registered",
		"target_evidence_missing",
	}
	shipmentExecutionBlockers := []any{
		"target_evidence_missing",
	}
	registeredHandlerBlockers := []any{
		"target_evidence_missing",
	}
	return map[string]any{
		"process_key":            ProcessKeyFinishedGoodsDelivery,
		"process_version":        "v1",
		"variant_key":            "quality_finance_ship_receivable",
		"manifest_status":        "runtime_loader_start_ready",
		"runtime_loader_enabled": true,
		"business_ref_type":      "shipment",
		"domain_boundary":        "contract_preflight_only",
		"fact_boundary":          "no_fact_posting",
		"source_workflow_key":    "finished_goods_delivery",
		"source_status":          "workflow_preview",
		"nodes": []any{
			map[string]any{
				"node_key":                "finished_goods_quality",
				"node_type":               ProcessNodeTypeDomainCommand,
				"owner_pool_key":          "finished_goods_quality",
				"required_capability_key": PermissionQualityInspectionUpdate,
				"policy_snapshot": map[string]any{
					"command_key": "finished_goods_quality.decide",
					"writes_fact": false,
				},
				"fact_command_contract": map[string]any{
					"command_key":                        "finished_goods_quality.decide",
					"runtime_binding_status":             "contract_preflight_only",
					"process_runtime_handler_registered": false,
					"runtime_loader_blockers":            []any{},
					"runtime_execute_blockers":           blockers,
					"writes_fact":                        false,
				},
			},
			map[string]any{
				"node_key":                "shipment_finance_release",
				"node_type":               ProcessNodeTypeDomainCommand,
				"owner_pool_key":          "shipment_finance_release",
				"required_capability_key": PermissionFinanceReceivableConfirm,
				"policy_snapshot": map[string]any{
					"command_key": "shipment.finance_release",
					"writes_fact": false,
				},
				"fact_command_contract": map[string]any{
					"command_key":                        "shipment.finance_release",
					"runtime_binding_status":             "process_runtime_handler_registered",
					"process_runtime_handler_registered": true,
					"runtime_loader_blockers":            []any{},
					"runtime_execute_blockers":           registeredHandlerBlockers,
					"writes_fact":                        false,
				},
			},
			map[string]any{
				"node_key":                "shipment_execution",
				"node_type":               ProcessNodeTypeDomainCommand,
				"owner_pool_key":          "shipment_execution",
				"required_capability_key": PermissionShipmentShip,
				"policy_snapshot": map[string]any{
					"command_key": "shipment.ship",
					"writes_fact": false,
				},
				"fact_command_contract": map[string]any{
					"command_key":                        "shipment.ship",
					"runtime_binding_status":             "process_runtime_handler_registered",
					"process_runtime_handler_registered": true,
					"runtime_loader_blockers":            []any{},
					"runtime_execute_blockers":           shipmentExecutionBlockers,
					"writes_fact":                        false,
				},
			},
			map[string]any{
				"node_key":                "receivable_lead",
				"node_type":               ProcessNodeTypeDomainCommand,
				"owner_pool_key":          "receivable_lead",
				"required_capability_key": PermissionFinanceReceivableConfirm,
				"policy_snapshot": map[string]any{
					"command_key": "finance.receivable_lead",
					"writes_fact": false,
				},
				"fact_command_contract": map[string]any{
					"command_key":                        "finance.receivable_lead",
					"runtime_binding_status":             "contract_preflight_only",
					"process_runtime_handler_registered": false,
					"runtime_loader_blockers":            []any{},
					"runtime_execute_blockers":           blockers,
					"writes_fact":                        false,
				},
			},
			map[string]any{
				"node_key":  "end",
				"node_type": ProcessNodeTypeEnd,
			},
		},
	}
}

func TestCustomerConfigUsecasePublishActivateAndEffectiveSession(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)

	published, err := uc.PublishCustomerConfig(ctx, validCustomerConfigInput(), 99)
	if err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if published.Status != CustomerConfigStatusPublished {
		t.Fatalf("published status = %s", published.Status)
	}
	activated, err := uc.ActivateCustomerConfig(ctx, "yoyoosun", "2026.06.28.1", 99)
	if err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}
	if activated.Status != CustomerConfigStatusActive {
		t.Fatalf("activated status = %s", activated.Status)
	}

	session, err := uc.GetEffectiveSession(ctx, "yoyoosun", &AdminUser{
		ID: 7,
		Roles: []AdminRole{
			{Key: SalesRoleKey},
		},
		Permissions: []string{PermissionSalesOrderRead},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if session.ConfigRevision != "2026.06.28.1" {
		t.Fatalf("ConfigRevision = %s", session.ConfigRevision)
	}
	if session.Customer.Name != "永绅" {
		t.Fatalf("customer name = %s", session.Customer.Name)
	}
	if session.Modules["production"] != "read_only" {
		t.Fatalf("production module state = %s", session.Modules["production"])
	}
	if len(session.Actions) != 1 || session.Actions[0] != PermissionSalesOrderRead {
		t.Fatalf("actions = %#v", session.Actions)
	}
	if len(session.WorkPools) != 1 || session.WorkPools[0] != "sales" {
		t.Fatalf("work pools = %#v", session.WorkPools)
	}
	if len(session.Pages) != 1 || session.Pages[0] != "sales-orders" {
		t.Fatalf("pages must be RBAC and config intersection, got %#v", session.Pages)
	}
	salesOrderPolicies, ok := session.FieldPolicies["sales_orders.default"].(map[string]any)
	if !ok {
		t.Fatalf("sales order field policies missing: %#v", session.FieldPolicies)
	}
	if _, ok := salesOrderPolicies["source_no"]; !ok {
		t.Fatalf("source_no field policy missing: %#v", salesOrderPolicies)
	}
}

func TestCustomerConfigUsecaseEffectiveSessionFiltersProjectionByEnabledModules(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	for index := range in.ModuleStates {
		if in.ModuleStates[index].ModuleKey == "sales_orders" {
			in.ModuleStates[index].State = "read_only"
		}
	}
	in.AccessEntitlements = append(in.AccessEntitlements,
		AccessEntitlementInput{RoleKey: SalesRoleKey, CapabilityKey: "page.sales-orders.read", Enabled: true},
		AccessEntitlementInput{RoleKey: SalesRoleKey, CapabilityKey: PermissionSystemUserRead, Enabled: true},
	)
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, "yoyoosun", "2026.06.28.1", 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	session, err := uc.GetEffectiveSession(ctx, "yoyoosun", &AdminUser{
		ID: 7,
		Roles: []AdminRole{
			{Key: SalesRoleKey},
		},
		Permissions: []string{PermissionSalesOrderRead, PermissionSystemUserRead},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if session.Modules["sales_orders"] != "read_only" {
		t.Fatalf("sales_orders module state = %s", session.Modules["sales_orders"])
	}
	if len(session.Pages) != 1 || session.Pages[0] != "permission-center" {
		t.Fatalf("module-owned sales page must be filtered while system page remains, got %#v", session.Pages)
	}
	if len(session.Actions) != 1 || session.Actions[0] != PermissionSystemUserRead {
		t.Fatalf("module-owned sales actions must be filtered while system action remains, got %#v", session.Actions)
	}
	if len(session.WorkPools) != 0 {
		t.Fatalf("sales work pool must be filtered when sales_orders is read_only, got %#v", session.WorkPools)
	}
	if _, ok := session.FieldPolicies["sales_orders.default"]; ok {
		t.Fatalf("sales order field policy must be filtered when sales_orders is read_only: %#v", session.FieldPolicies)
	}
}

func TestCustomerConfigUsecaseBuildsProcessInstanceCreateFromActiveProcessDefinition(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.CompiledSnapshot["processDefinitions"] = map[string]any{
		ProcessKeySalesOrderAcceptance: validSalesOrderAcceptanceProcessDefinition(),
	}
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	refNo := "SO-1001"
	create, err := uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
		CustomerKey:     in.CustomerKey,
		ProcessKey:      ProcessKeySalesOrderAcceptance,
		BusinessRefType: "sales_order",
		BusinessRefID:   1001,
		BusinessRefNo:   &refNo,
		IdempotencyKey:  "sales_order:1001:sales_order_acceptance:v1",
	})
	if err != nil {
		t.Fatalf("BuildProcessInstanceCreateFromActiveCustomerConfig error = %v", err)
	}
	if create.ProcessKey != ProcessKeySalesOrderAcceptance || create.ProcessVersion != "v1" {
		t.Fatalf("process identity = %#v", create)
	}
	if create.ConfigRevision != in.Revision {
		t.Fatalf("config revision = %s", create.ConfigRevision)
	}
	if create.DefinitionHash == "" {
		t.Fatalf("definition hash must be set")
	}
	if create.ModuleContractSnapshot["source"] != "active_customer_config" {
		t.Fatalf("module contract snapshot = %#v", create.ModuleContractSnapshot)
	}
	if len(create.Nodes) != 4 {
		t.Fatalf("nodes = %#v", create.Nodes)
	}
	if create.Nodes[0].NodeKey != "submit_sales_order" ||
		create.Nodes[0].NodeType != ProcessNodeTypeDomainCommand ||
		create.Nodes[0].PolicySnapshot["command_key"] != ProcessDomainCommandSalesOrderSubmit {
		t.Fatalf("submit node = %#v", create.Nodes[0])
	}
	if create.Nodes[1].OwnerPoolKey == nil || *create.Nodes[1].OwnerPoolKey != "order_approval" {
		t.Fatalf("approval owner pool = %#v", create.Nodes[1].OwnerPoolKey)
	}
	if create.Nodes[2].RequiredCapabilityKey == nil || *create.Nodes[2].RequiredCapabilityKey != PermissionWorkflowTaskComplete {
		t.Fatalf("review capability = %#v", create.Nodes[2].RequiredCapabilityKey)
	}

	processRepo := &memProcessRuntimeRepo{}
	processRuntimeUC := NewProcessRuntimeUsecase(processRepo, &stubWorkflowRepo{})
	if _, _, err := processRuntimeUC.CreateProcessInstance(ctx, create, 99); err != nil {
		t.Fatalf("CreateProcessInstance from active customer config error = %v", err)
	}
	if processRepo.created == nil || processRepo.created.ConfigRevision != in.Revision {
		t.Fatalf("created process input = %#v", processRepo.created)
	}
}

func TestCustomerConfigUsecaseBuildsMaterialSupplyProcessInstanceCreateFromActiveProcessDefinition(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.CompiledSnapshot["processDefinitions"] = map[string]any{
		ProcessKeyMaterialSupply: validMaterialSupplyRuntimeProcessDefinition(),
	}
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	refNo := "PR-6001"
	create, err := uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
		CustomerKey:     in.CustomerKey,
		ProcessKey:      ProcessKeyMaterialSupply,
		BusinessRefType: "purchase_receipt",
		BusinessRefID:   6001,
		BusinessRefNo:   &refNo,
		IdempotencyKey:  "purchase_receipt:6001:material_supply:v1",
	})
	if err != nil {
		t.Fatalf("BuildProcessInstanceCreateFromActiveCustomerConfig error = %v", err)
	}
	if create.ProcessKey != ProcessKeyMaterialSupply || create.ProcessVersion != "v1" {
		t.Fatalf("process identity = %#v", create)
	}
	if create.BusinessRefType != "purchase_receipt" || create.BusinessRefID != 6001 {
		t.Fatalf("business ref = %#v", create)
	}
	if len(create.Nodes) != 3 {
		t.Fatalf("nodes = %#v", create.Nodes)
	}
	if create.Nodes[0].NodeKey != "incoming_qc" ||
		create.Nodes[0].NodeType != ProcessNodeTypeDomainCommand ||
		create.Nodes[0].PolicySnapshot["command_key"] != ProcessDomainCommandQualityInspectionDecide {
		t.Fatalf("incoming qc node = %#v", create.Nodes[0])
	}
	if create.Nodes[1].NodeKey != "warehouse_inbound" ||
		create.Nodes[1].NodeType != ProcessNodeTypeDomainCommand ||
		create.Nodes[1].PolicySnapshot["command_key"] != ProcessDomainCommandInventoryPostInbound {
		t.Fatalf("warehouse inbound node = %#v", create.Nodes[1])
	}
}

func TestCustomerConfigUsecaseBuildsMaterialSupplyPurchaseOrderProcessInstanceCreateFromActiveProcessDefinition(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.CompiledSnapshot["processDefinitions"] = map[string]any{
		ProcessKeyMaterialSupply: validMaterialSupplyPurchaseOrderRuntimeProcessDefinition(),
	}
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	refNo := "PO-5001"
	create, err := uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
		CustomerKey:     in.CustomerKey,
		ProcessKey:      ProcessKeyMaterialSupply,
		BusinessRefType: "purchase_order",
		BusinessRefID:   5001,
		BusinessRefNo:   &refNo,
		IdempotencyKey:  "purchase_order:5001:material_supply:v1",
	})
	if err != nil {
		t.Fatalf("BuildProcessInstanceCreateFromActiveCustomerConfig error = %v", err)
	}
	if create.ProcessKey != ProcessKeyMaterialSupply || create.ProcessVersion != "v1" {
		t.Fatalf("process identity = %#v", create)
	}
	if create.BusinessRefType != "purchase_order" || create.BusinessRefID != 5001 {
		t.Fatalf("business ref = %#v", create)
	}
	if len(create.Nodes) != 4 {
		t.Fatalf("nodes = %#v", create.Nodes)
	}
	if create.Nodes[0].NodeKey != "purchase_receipt_source" ||
		create.Nodes[0].NodeType != ProcessNodeTypeDomainCommand ||
		create.Nodes[0].PolicySnapshot["command_key"] != ProcessDomainCommandPurchaseReceiptCreate {
		t.Fatalf("purchase receipt source node = %#v", create.Nodes[0])
	}
	if create.Nodes[1].NodeKey != "incoming_qc" ||
		create.Nodes[1].PolicySnapshot["command_key"] != ProcessDomainCommandQualityInspectionDecide {
		t.Fatalf("incoming qc node = %#v", create.Nodes[1])
	}
	if create.Nodes[2].NodeKey != "warehouse_inbound" ||
		create.Nodes[2].PolicySnapshot["command_key"] != ProcessDomainCommandInventoryPostInbound {
		t.Fatalf("warehouse inbound node = %#v", create.Nodes[2])
	}
}

func TestCustomerConfigUsecaseRejectsUnsafeMaterialSupplyProcessDefinitionLoader(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{
			name: "purchase receipt create not accepted inside purchase receipt process",
			mutate: func(definition map[string]any) {
				nodes := definition["nodes"].([]any)
				first := nodes[0].(map[string]any)
				first["node_key"] = "purchase_receipt_source"
				policy := first["policy_snapshot"].(map[string]any)
				policy["command_key"] = ProcessDomainCommandPurchaseReceiptCreate
			},
		},
		{
			name: "purchase order process cannot skip purchase receipt source node",
			mutate: func(definition map[string]any) {
				definition["business_ref_type"] = "purchase_order"
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newMemCustomerConfigRepo()
			uc := NewCustomerConfigUsecase(repo)
			in := validCustomerConfigInput()
			definition := validMaterialSupplyRuntimeProcessDefinition()
			tt.mutate(definition)
			in.CompiledSnapshot["processDefinitions"] = map[string]any{
				ProcessKeyMaterialSupply: definition,
			}
			if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
				t.Fatalf("PublishCustomerConfig error = %v", err)
			}
			if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
				t.Fatalf("ActivateCustomerConfig error = %v", err)
			}
			_, err := uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
				CustomerKey:     in.CustomerKey,
				ProcessKey:      ProcessKeyMaterialSupply,
				BusinessRefType: getStringFromAnyMap(definition, "business_ref_type"),
				BusinessRefID:   6001,
				IdempotencyKey:  "purchase_receipt:6001:material_supply:v1",
			})
			if !errors.Is(err, ErrBadParam) {
				t.Fatalf("expected ErrBadParam, got %v", err)
			}
		})
	}
}

func TestCustomerConfigUsecaseRejectsUnsafeActiveProcessDefinitionLoader(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name   string
		mutate func(map[string]any)
	}{
		{
			name: "runtime loader disabled",
			mutate: func(definition map[string]any) {
				definition["runtime_loader_enabled"] = false
			},
		},
		{
			name: "fact boundary changed",
			mutate: func(definition map[string]any) {
				definition["fact_boundary"] = "fact_posting"
			},
		},
		{
			name: "unknown command key",
			mutate: func(definition map[string]any) {
				nodes := definition["nodes"].([]any)
				first := nodes[0].(map[string]any)
				policy := first["policy_snapshot"].(map[string]any)
				policy["command_key"] = "inventory.post"
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newMemCustomerConfigRepo()
			uc := NewCustomerConfigUsecase(repo)
			in := validCustomerConfigInput()
			definition := validSalesOrderAcceptanceProcessDefinition()
			tt.mutate(definition)
			in.CompiledSnapshot["processDefinitions"] = map[string]any{
				ProcessKeySalesOrderAcceptance: definition,
			}
			if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
				t.Fatalf("PublishCustomerConfig error = %v", err)
			}
			if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
				t.Fatalf("ActivateCustomerConfig error = %v", err)
			}
			_, err := uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
				CustomerKey:     in.CustomerKey,
				ProcessKey:      ProcessKeySalesOrderAcceptance,
				BusinessRefType: "sales_order",
				BusinessRefID:   1001,
				IdempotencyKey:  "sales_order:1001:sales_order_acceptance:v1",
			})
			if !errors.Is(err, ErrBadParam) {
				t.Fatalf("expected ErrBadParam, got %v", err)
			}
		})
	}
}

func TestCustomerConfigUsecaseRejectsProcessStartWhenReferencedModuleNotEnabled(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name             string
		mutateModules    func([]DeploymentModuleStateInput) []DeploymentModuleStateInput
		wantBlockedState string
	}{
		{
			name: "referenced source module read only",
			mutateModules: func(items []DeploymentModuleStateInput) []DeploymentModuleStateInput {
				for index := range items {
					if items[index].ModuleKey == "sales_orders" {
						items[index].State = "read_only"
					}
				}
				return items
			},
			wantBlockedState: "read_only",
		},
		{
			name: "workflow module disabled",
			mutateModules: func(items []DeploymentModuleStateInput) []DeploymentModuleStateInput {
				for index := range items {
					if items[index].ModuleKey == "workflow_tasks" {
						items[index].State = "disabled"
					}
				}
				return items
			},
			wantBlockedState: "disabled",
		},
		{
			name: "referenced module missing",
			mutateModules: func(items []DeploymentModuleStateInput) []DeploymentModuleStateInput {
				out := []DeploymentModuleStateInput{}
				for _, item := range items {
					if item.ModuleKey != "sales_orders" {
						out = append(out, item)
					}
				}
				return out
			},
			wantBlockedState: "missing",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newMemCustomerConfigRepo()
			uc := NewCustomerConfigUsecase(repo)
			in := validCustomerConfigInput()
			in.ModuleStates = tt.mutateModules(in.ModuleStates)
			in.CompiledSnapshot["processDefinitions"] = map[string]any{
				ProcessKeySalesOrderAcceptance: validSalesOrderAcceptanceProcessDefinition(),
			}
			if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
				t.Fatalf("PublishCustomerConfig error = %v", err)
			}
			if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
				t.Fatalf("ActivateCustomerConfig error = %v", err)
			}
			_, err := uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
				CustomerKey:     in.CustomerKey,
				ProcessKey:      ProcessKeySalesOrderAcceptance,
				BusinessRefType: "sales_order",
				BusinessRefID:   1001,
				IdempotencyKey:  "sales_order:1001:sales_order_acceptance:v1",
			})
			if !errors.Is(err, ErrBadParam) {
				t.Fatalf("expected ErrBadParam for %s module, got %v", tt.wantBlockedState, err)
			}
		})
	}
}

func TestCustomerConfigUsecaseRejectsUnsupportedFieldPolicies(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.CompiledSnapshot["fieldPolicies"] = map[string]any{
		"sales_order_items.default": map[string]any{
			"style_no": map[string]any{"visible": true},
		},
	}
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("unsupported field policy error = %v", err)
	}

	in = validCustomerConfigInput()
	in.CompiledSnapshot["fieldPolicies"] = map[string]any{
		"sales_orders.default": map[string]any{
			"style_no": map[string]any{"visible": true},
		},
	}
	if _, err := uc.ValidateCustomerConfig(ctx, in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("unsupported field key validation error = %v", err)
	}
}

func TestCustomerConfigUsecaseRejectsMissingOrUnknownPages(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	delete(in.CompiledSnapshot, "pages")
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("missing pages error = %v", err)
	}

	in = validCustomerConfigInput()
	in.CompiledSnapshot["pages"] = []any{"sales-orders", "unknown-page"}
	if _, err := uc.ValidateCustomerConfig(ctx, in); !errors.Is(err, ErrBadParam) {
		t.Fatalf("unknown page validation error = %v", err)
	}

	in = validCustomerConfigInput()
	in.CompiledSnapshot["pages"] = []any{}
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("empty pages error = %v", err)
	}
}

func TestCustomerConfigUsecaseExplainModuleStatus(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.ModuleStates = append(in.ModuleStates,
		DeploymentModuleStateInput{ModuleKey: "customers", State: "enabled"},
		DeploymentModuleStateInput{ModuleKey: "products", State: "enabled"},
	)
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	status, err := uc.ExplainModuleStatus(ctx, in.CustomerKey, "sales_orders")
	if err != nil {
		t.Fatalf("ExplainModuleStatus error = %v", err)
	}
	if status.CustomerState != "enabled" {
		t.Fatalf("customer state = %s", status.CustomerState)
	}
	if !status.ProductIncluded || status.ProductLayer != "SourceDocument" {
		t.Fatalf("product catalog fields = %#v", status)
	}
	if !status.DependenciesSatisfied {
		t.Fatalf("dependencies should be satisfied, missing=%#v", status.MissingDependencies)
	}
	if status.CanEnable {
		t.Fatalf("enabled module must not be enable-able")
	}
	if status.CanDisable {
		t.Fatalf("disable must stay blocked until full module enforcement connects")
	}
	if len(status.DisableBlockedReasons) != 1 || status.DisableBlockedReasons[0] != "module_disable_full_enforcement_not_connected" {
		t.Fatalf("disable blocked reasons = %#v", status.DisableBlockedReasons)
	}
	if status.RuntimeCountSource != "process_workflow_business_partial" ||
		status.InFlightProcessCount != 0 ||
		status.OpenTaskCount != 0 ||
		status.OpenBusinessDocCount != 0 {
		t.Fatalf("runtime counts = source:%s process:%d tasks:%d business:%d", status.RuntimeCountSource, status.InFlightProcessCount, status.OpenTaskCount, status.OpenBusinessDocCount)
	}
	if len(status.ReferencedWorkPoolKeys) != 1 || status.ReferencedWorkPoolKeys[0] != "sales" {
		t.Fatalf("work pool refs = %#v", status.ReferencedWorkPoolKeys)
	}
	if len(status.ReferencedRoleKeys) != 1 || status.ReferencedRoleKeys[0] != SalesRoleKey {
		t.Fatalf("role refs = %#v", status.ReferencedRoleKeys)
	}
	if len(status.ReferencedPageKeys) != 1 || status.ReferencedPageKeys[0] != "sales-orders" {
		t.Fatalf("page refs = %#v", status.ReferencedPageKeys)
	}
	processRefs := map[string]bool{}
	for _, key := range status.ReferencedProcessKeys {
		processRefs[key] = true
	}
	if !processRefs["sales_order_approval"] || !processRefs["sales_to_production"] {
		t.Fatalf("process refs = %#v", status.ReferencedProcessKeys)
	}
}

func TestCustomerConfigUsecaseExplainModuleStatusCountsRuntimeGuards(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	revisionKey := customerRevisionKey(in.CustomerKey, in.Revision)
	repo.processCount[revisionKey+"/"+ProcessKeySalesOrderAcceptance] = 2
	repo.taskCount[revisionKey+"/sales"] = 3
	repo.businessCount[in.CustomerKey+"/sales_orders"] = 4
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	status, err := uc.ExplainModuleStatus(ctx, in.CustomerKey, "sales_orders")
	if err != nil {
		t.Fatalf("ExplainModuleStatus error = %v", err)
	}
	if status.RuntimeCountSource != "process_workflow_business_partial" {
		t.Fatalf("runtime source = %s", status.RuntimeCountSource)
	}
	if status.InFlightProcessCount != 2 || status.OpenTaskCount != 3 || status.OpenBusinessDocCount != 4 {
		t.Fatalf("runtime counts = %#v", status)
	}
	reasons := map[string]bool{}
	for _, reason := range status.DisableBlockedReasons {
		reasons[reason] = true
	}
	for _, want := range []string{
		"in_flight_processes_present",
		"open_workflow_tasks_present",
		"open_business_documents_present",
		"module_disable_full_enforcement_not_connected",
	} {
		if !reasons[want] {
			t.Fatalf("missing disable reason %q in %#v", want, status.DisableBlockedReasons)
		}
	}
	if status.CanDisable {
		t.Fatalf("module must stay blocked while runtime/business counts are incomplete")
	}
}

func TestCustomerConfigUsecaseExplainProcessDefinitionFinishedGoodsDeliveryStartReady(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.CompiledSnapshot["processDefinitions"] = map[string]any{
		ProcessKeyFinishedGoodsDelivery: validFinishedGoodsDeliveryStartReadyProcessDefinition(),
	}
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	explanation, err := uc.ExplainProcessDefinition(ctx, in.CustomerKey, ProcessKeyFinishedGoodsDelivery)
	if err != nil {
		t.Fatalf("ExplainProcessDefinition error = %v", err)
	}
	if explanation.ProcessKey != ProcessKeyFinishedGoodsDelivery ||
		explanation.VariantKey != "quality_finance_ship_receivable" ||
		explanation.ManifestStatus != "runtime_loader_start_ready" {
		t.Fatalf("definition identity = %#v", explanation)
	}
	if !explanation.RuntimeLoaderEnabled || !explanation.CanStartRuntime {
		t.Fatalf("finished_goods_delivery must be start-ready: %#v", explanation)
	}
	if explanation.CanExecuteRuntimeCommands {
		t.Fatalf("finished_goods_delivery commands must remain execute-blocked: %#v", explanation)
	}
	if len(explanation.Nodes) != 5 {
		t.Fatalf("nodes = %#v", explanation.Nodes)
	}
	nodeByKey := map[string]CustomerProcessDefinitionNodeExplanation{}
	for _, node := range explanation.Nodes {
		nodeByKey[node.NodeKey] = node
	}
	shipmentNode := nodeByKey["shipment_execution"]
	if shipmentNode.CommandKey != "shipment.ship" ||
		shipmentNode.RuntimeBindingStatus != "process_runtime_handler_registered" ||
		!shipmentNode.ProcessRuntimeHandlerRegistered {
		t.Fatalf("shipment node = %#v", shipmentNode)
	}
	if len(explanation.StartBlockedReasons) != 0 {
		t.Fatalf("start blocked reasons = %#v", explanation.StartBlockedReasons)
	}
	executeReasons := map[string]bool{}
	for _, reason := range explanation.ExecuteBlockedReasons {
		executeReasons[reason] = true
	}
	for _, want := range []string{
		"domain_command_handler_not_registered",
		"target_evidence_missing",
	} {
		if !executeReasons[want] {
			t.Fatalf("missing execute blocked reason %q in %#v", want, explanation.ExecuteBlockedReasons)
		}
	}
}

func TestCustomerConfigUsecaseBuildFinishedGoodsDeliveryStartOnlyProcess(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.CompiledSnapshot["processDefinitions"] = map[string]any{
		ProcessKeyFinishedGoodsDelivery: validFinishedGoodsDeliveryStartReadyProcessDefinition(),
	}
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	create, err := uc.BuildProcessInstanceCreateFromActiveCustomerConfig(ctx, ProcessInstanceFromCustomerConfigInput{
		CustomerKey:     in.CustomerKey,
		ProcessKey:      ProcessKeyFinishedGoodsDelivery,
		BusinessRefType: "shipment",
		BusinessRefID:   9001,
		BusinessRefNo:   ptrString("SHIP-9001"),
		IdempotencyKey:  "finished-goods-delivery/SHIP-9001",
	})
	if err != nil {
		t.Fatalf("BuildProcessInstanceCreateFromActiveCustomerConfig error = %v", err)
	}
	if create.ProcessKey != ProcessKeyFinishedGoodsDelivery ||
		create.BusinessRefType != "shipment" ||
		create.BusinessRefID != 9001 {
		t.Fatalf("create = %#v", create)
	}
	if len(create.Nodes) != 5 {
		t.Fatalf("nodes = %#v", create.Nodes)
	}
	if create.Nodes[0].NodeKey != "finished_goods_quality" ||
		create.Nodes[0].PolicySnapshot["command_key"] != ProcessDomainCommandFinishedGoodsQualityDecide {
		t.Fatalf("first node = %#v", create.Nodes[0])
	}
	if create.Nodes[1].PolicySnapshot["command_key"] != ProcessDomainCommandShipmentFinanceRelease ||
		create.Nodes[2].PolicySnapshot["command_key"] != ProcessDomainCommandShipmentShip ||
		create.Nodes[3].PolicySnapshot["command_key"] != ProcessDomainCommandFinanceReceivableLead {
		t.Fatalf("command nodes = %#v", create.Nodes)
	}
	if create.ModuleContractSnapshot["fact_boundary"] != "no_fact_posting" {
		t.Fatalf("module contract snapshot = %#v", create.ModuleContractSnapshot)
	}
}

func TestCustomerConfigUsecaseExplainModuleStatusReportsMissingDependencies(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	moduleStates := []DeploymentModuleStateInput{}
	for _, item := range in.ModuleStates {
		if item.ModuleKey != "customers" && item.ModuleKey != "products" {
			moduleStates = append(moduleStates, item)
		}
	}
	in.ModuleStates = moduleStates
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	status, err := uc.ExplainModuleStatus(ctx, in.CustomerKey, "sales_orders")
	if err != nil {
		t.Fatalf("ExplainModuleStatus error = %v", err)
	}
	if status.DependenciesSatisfied {
		t.Fatalf("dependencies should be missing")
	}
	if len(status.MissingDependencies) != 2 || status.MissingDependencies[0] != "customers" || status.MissingDependencies[1] != "products" {
		t.Fatalf("missing dependencies = %#v", status.MissingDependencies)
	}
	if status.CanEnable {
		t.Fatalf("cannot enable with missing dependencies")
	}
}

func TestCustomerConfigUsecaseExplainModuleStatusWithoutActiveRevision(t *testing.T) {
	status, err := NewCustomerConfigUsecase(newMemCustomerConfigRepo()).ExplainModuleStatus(context.Background(), "", "sales_orders")
	if err != nil {
		t.Fatalf("ExplainModuleStatus error = %v", err)
	}
	if status.Source != "no_active_customer_config" {
		t.Fatalf("source = %s", status.Source)
	}
	if status.CustomerKey != DefaultCustomerKey || status.CustomerState != "not_configured" {
		t.Fatalf("status = %#v", status)
	}
	if len(status.EnableBlockedReasons) != 1 || status.EnableBlockedReasons[0] != "active_revision_missing" {
		t.Fatalf("enable reasons = %#v", status.EnableBlockedReasons)
	}
}

func TestCustomerConfigUsecaseEffectiveSessionFiltersLegacyFieldPolicies(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	key := customerRevisionKey(in.CustomerKey, in.Revision)
	repo.revisions[key].CompiledSnapshot["fieldPolicies"] = map[string]any{
		"sales_orders.default": map[string]any{
			"source_no": map[string]any{"visible": false},
			"style_no":  map[string]any{"visible": true},
		},
		"sales_order_items.default": map[string]any{
			"style_no": map[string]any{"visible": true},
		},
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	session, err := uc.GetEffectiveSession(ctx, in.CustomerKey, &AdminUser{
		ID:          7,
		Roles:       []AdminRole{{Key: SalesRoleKey}},
		Permissions: []string{PermissionSalesOrderRead},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if _, ok := session.FieldPolicies["sales_order_items.default"]; ok {
		t.Fatalf("sales_order_items field policy must be filtered: %#v", session.FieldPolicies)
	}
	salesOrderPolicies, ok := session.FieldPolicies["sales_orders.default"].(map[string]any)
	if !ok {
		t.Fatalf("sales order field policies missing: %#v", session.FieldPolicies)
	}
	if _, ok := salesOrderPolicies["source_no"]; !ok {
		t.Fatalf("source_no policy missing: %#v", salesOrderPolicies)
	}
	if _, ok := salesOrderPolicies["style_no"]; ok {
		t.Fatalf("unsupported field policy must be filtered: %#v", salesOrderPolicies)
	}
}

func TestCustomerConfigUsecaseEffectiveSessionDoesNotFallbackToRBACWhenLegacyPagesMissing(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	key := customerRevisionKey(in.CustomerKey, in.Revision)
	delete(repo.revisions[key].CompiledSnapshot, "pages")
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	session, err := uc.GetEffectiveSession(ctx, in.CustomerKey, &AdminUser{
		ID:          7,
		Roles:       []AdminRole{{Key: SalesRoleKey}},
		Permissions: []string{PermissionSalesOrderRead},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if len(session.Pages) != 0 {
		t.Fatalf("legacy active revision without pages must not fallback to RBAC pages, got %#v", session.Pages)
	}
}

func TestCustomerConfigUsecaseRejectsForbiddenPayloadAndActiveOverwrite(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.CompiledSnapshot["secret"] = "bad"
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrBadParam) {
		t.Fatalf("forbidden payload error = %v", err)
	}

	in = validCustomerConfigInput()
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); !errors.Is(err, ErrCustomerConfigActiveRevision) {
		t.Fatalf("active overwrite error = %v", err)
	}
}

func TestCustomerConfigUsecaseRollbackActivatesTargetRevision(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)

	first := validCustomerConfigInput()
	first.Revision = "2026.06.28.1"
	second := validCustomerConfigInput()
	second.Revision = "2026.06.28.2"
	second.CompiledSnapshot = map[string]any{
		"customer": map[string]any{"key": "yoyoosun", "name": "永绅"},
		"pages":    []any{"permission-center"},
	}

	if _, err := uc.PublishCustomerConfig(ctx, first, 99); err != nil {
		t.Fatalf("PublishCustomerConfig first error = %v", err)
	}
	if _, err := uc.PublishCustomerConfig(ctx, second, 99); err != nil {
		t.Fatalf("PublishCustomerConfig second error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, second.CustomerKey, second.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	rolledBack, err := uc.RollbackCustomerConfig(ctx, first.CustomerKey, first.Revision, 99)
	if err != nil {
		t.Fatalf("RollbackCustomerConfig error = %v", err)
	}
	if rolledBack.Revision != first.Revision || rolledBack.Status != CustomerConfigStatusActive {
		t.Fatalf("rolledBack = %#v", rolledBack)
	}
	oldActive, err := uc.repo.GetCustomerConfigRevision(ctx, second.CustomerKey, second.Revision)
	if err != nil {
		t.Fatalf("GetCustomerConfigRevision old active error = %v", err)
	}
	if oldActive.Status != CustomerConfigStatusSuperseded {
		t.Fatalf("old active status = %s", oldActive.Status)
	}
}

func TestCustomerConfigUsecaseFallsBackWhenNoActiveRevision(t *testing.T) {
	uc := NewCustomerConfigUsecase(newMemCustomerConfigRepo())
	session, err := uc.GetEffectiveSession(context.Background(), "", &AdminUser{
		ID:          1,
		Roles:       []AdminRole{{Key: AdminRoleKey}},
		Permissions: []string{PermissionSystemUserRead},
	})
	if err != nil {
		t.Fatalf("GetEffectiveSession error = %v", err)
	}
	if session.Source != "builtin_rbac_fallback" {
		t.Fatalf("source = %s", session.Source)
	}
	if session.Customer.Key != DefaultCustomerKey {
		t.Fatalf("customer key = %s", session.Customer.Key)
	}
}

func TestCustomerConfigUsecaseWorkflowVisibleOwnerRoleKeysIncludesWorkPoolMembership(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.WorkPoolMemberships = append(in.WorkPoolMemberships, WorkPoolMembershipInput{
		PoolKey:  "warehouse",
		RoleKey:  WarehouseRoleKey,
		UserID:   7,
		Strategy: "direct_user_pool",
		Enabled:  true,
	})
	in.AccessEntitlements = append(in.AccessEntitlements,
		AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
		AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
	)
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	roleKeys, err := uc.WorkflowVisibleOwnerRoleKeys(ctx, "yoyoosun", &AdminUser{
		ID:    7,
		Roles: []AdminRole{{Key: SalesRoleKey}},
	})
	if err != nil {
		t.Fatalf("WorkflowVisibleOwnerRoleKeys error = %v", err)
	}
	got := map[string]bool{}
	for _, roleKey := range roleKeys {
		got[roleKey] = true
	}
	if !got[SalesRoleKey] || !got[WarehouseRoleKey] {
		t.Fatalf("expected sales and warehouse visibility, got %#v", roleKeys)
	}
	if got[FinanceRoleKey] {
		t.Fatalf("finance must not be visible without matching role or membership: %#v", roleKeys)
	}

	completeRoleKeys, err := uc.WorkflowVisibleOwnerRoleKeys(ctx, "yoyoosun", &AdminUser{
		ID:    7,
		Roles: []AdminRole{{Key: SalesRoleKey}},
	}, PermissionWorkflowTaskComplete)
	if err != nil {
		t.Fatalf("WorkflowVisibleOwnerRoleKeys complete error = %v", err)
	}
	completeGot := map[string]bool{}
	for _, roleKey := range completeRoleKeys {
		completeGot[roleKey] = true
	}
	if completeGot[WarehouseRoleKey] {
		t.Fatalf("warehouse must not be visible for complete without same-role entitlement: %#v", completeRoleKeys)
	}
}

func TestCustomerConfigUsecaseWorkflowVisibleOwnerRoleKeysRequiresTaskEntitlement(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.WorkPoolMemberships = append(in.WorkPoolMemberships, WorkPoolMembershipInput{
		PoolKey:  "warehouse",
		RoleKey:  WarehouseRoleKey,
		UserID:   7,
		Strategy: "direct_user_pool",
		Enabled:  true,
	})
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	roleKeys, err := uc.WorkflowVisibleOwnerRoleKeys(ctx, "yoyoosun", &AdminUser{
		ID:    7,
		Roles: []AdminRole{{Key: SalesRoleKey}},
	}, PermissionWorkflowTaskRead)
	if err != nil {
		t.Fatalf("WorkflowVisibleOwnerRoleKeys error = %v", err)
	}
	got := map[string]bool{}
	for _, roleKey := range roleKeys {
		got[roleKey] = true
	}
	if got[WarehouseRoleKey] {
		t.Fatalf("warehouse must not be visible without workflow task entitlement: %#v", roleKeys)
	}
}

func TestCustomerConfigUsecaseWorkflowVisibleOwnerRoleKeysRequiresMatchingEntitlementScope(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.WorkPoolMemberships = append(in.WorkPoolMemberships, WorkPoolMembershipInput{
		PoolKey:  "warehouse",
		RoleKey:  WarehouseRoleKey,
		UserID:   7,
		Strategy: "direct_user_pool",
		Enabled:  true,
	})
	in.AccessEntitlements = append(in.AccessEntitlements,
		AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: "other_customer", Enabled: true},
		AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskUpdate, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
	)
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	roleKeys, err := uc.WorkflowVisibleOwnerRoleKeys(ctx, "yoyoosun", &AdminUser{
		ID:    7,
		Roles: []AdminRole{{Key: SalesRoleKey}},
	}, PermissionWorkflowTaskRead)
	if err != nil {
		t.Fatalf("WorkflowVisibleOwnerRoleKeys error = %v", err)
	}
	got := map[string]bool{}
	for _, roleKey := range roleKeys {
		got[roleKey] = true
	}
	if got[WarehouseRoleKey] {
		t.Fatalf("warehouse must not be visible when workflow.task.read only matches another customer scope: %#v", roleKeys)
	}
	if !got[SalesRoleKey] {
		t.Fatalf("base admin role visibility must remain available, got %#v", roleKeys)
	}
}

func TestCustomerConfigUsecaseWorkflowCandidateOwnerRoleKeysRequiresCapabilityAndScope(t *testing.T) {
	ctx := context.Background()
	repo := newMemCustomerConfigRepo()
	uc := NewCustomerConfigUsecase(repo)
	in := validCustomerConfigInput()
	in.WorkPoolMemberships = append(in.WorkPoolMemberships,
		WorkPoolMembershipInput{PoolKey: "warehouse", RoleKey: WarehouseRoleKey, UserID: 7, Strategy: "direct_user_pool", Enabled: true},
		WorkPoolMembershipInput{PoolKey: "warehouse", RoleKey: FinanceRoleKey, UserID: 0, Strategy: "role_pool", Enabled: true},
	)
	in.AccessEntitlements = append(in.AccessEntitlements,
		AccessEntitlementInput{RoleKey: WarehouseRoleKey, CapabilityKey: PermissionWorkflowTaskComplete, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
		AccessEntitlementInput{RoleKey: FinanceRoleKey, CapabilityKey: PermissionWorkflowTaskComplete, ScopeType: "customer", ScopeValue: "other_customer", Enabled: true},
		AccessEntitlementInput{RoleKey: FinanceRoleKey, CapabilityKey: PermissionWorkflowTaskRead, ScopeType: "customer", ScopeValue: "yoyoosun", Enabled: true},
	)
	if _, err := uc.PublishCustomerConfig(ctx, in, 99); err != nil {
		t.Fatalf("PublishCustomerConfig error = %v", err)
	}
	if _, err := uc.ActivateCustomerConfig(ctx, in.CustomerKey, in.Revision, 99); err != nil {
		t.Fatalf("ActivateCustomerConfig error = %v", err)
	}

	explanation, err := uc.WorkflowCandidateOwnerRoleKeys(ctx, "yoyoosun", "warehouse", PermissionWorkflowTaskComplete)
	if err != nil {
		t.Fatalf("WorkflowCandidateOwnerRoleKeys error = %v", err)
	}
	if explanation.Source != "active_customer_config" {
		t.Fatalf("source = %s", explanation.Source)
	}
	if explanation.ConfigRevision != in.Revision {
		t.Fatalf("config revision = %s", explanation.ConfigRevision)
	}
	if len(explanation.MembershipRoleKeys) != 2 || explanation.MembershipRoleKeys[0] != WarehouseRoleKey || explanation.MembershipRoleKeys[1] != FinanceRoleKey {
		t.Fatalf("membership role keys = %#v", explanation.MembershipRoleKeys)
	}
	if len(explanation.EntitledRoleKeys) != 1 || explanation.EntitledRoleKeys[0] != WarehouseRoleKey {
		t.Fatalf("entitled role keys = %#v", explanation.EntitledRoleKeys)
	}
	if len(explanation.CandidateOwnerRoleKeys) != 1 || explanation.CandidateOwnerRoleKeys[0] != WarehouseRoleKey {
		t.Fatalf("candidate owner role keys = %#v", explanation.CandidateOwnerRoleKeys)
	}
}

func TestCustomerConfigUsecaseWorkflowCandidateOwnerRoleKeysNoActiveConfig(t *testing.T) {
	uc := NewCustomerConfigUsecase(newMemCustomerConfigRepo())
	explanation, err := uc.WorkflowCandidateOwnerRoleKeys(context.Background(), "yoyoosun", "warehouse", PermissionWorkflowTaskComplete)
	if err != nil {
		t.Fatalf("WorkflowCandidateOwnerRoleKeys error = %v", err)
	}
	if explanation.Source != "no_active_customer_config" {
		t.Fatalf("source = %s", explanation.Source)
	}
	if len(explanation.CandidateOwnerRoleKeys) != 0 {
		t.Fatalf("candidate owner role keys = %#v", explanation.CandidateOwnerRoleKeys)
	}
}
