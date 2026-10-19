package data_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/conf"
	"server/internal/data"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/adminuserrole"
	"server/internal/data/model/ent/financeallocation"
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/role"
	"server/internal/data/model/ent/roledatascope"
	"server/internal/data/model/ent/sourceorderlifecycleevent"
	"server/internal/errcode"
	appserver "server/internal/server"
	"server/internal/service"

	"github.com/go-kratos/kratos/v2/log"
	httpx "github.com/go-kratos/kratos/v2/transport/http"
	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/types/known/structpb"
)

type integrationRPC struct {
	endpoint string
	token    string
	client   *http.Client
	sequence atomic.Int64
}

// This is an independent HTTP consumer: no repository, usecase or database handle.
func (c *integrationRPC) call(ctx context.Context, domain, method string, params map[string]any) (*v1.PostJsonrpcReply, error) {
	id := fmt.Sprintf("sim-%d", c.sequence.Add(1))
	body, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint+"/rpc/"+domain, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Request-ID", "integration-"+id)
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	response, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected transport status %d", response.StatusCode)
	}
	if response.Header.Get("X-Request-ID") != "integration-"+id {
		return nil, fmt.Errorf("request correlation was not preserved")
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return nil, err
	}
	var reply v1.PostJsonrpcReply
	if err := protojson.Unmarshal(raw, &reply); err != nil {
		return nil, err
	}
	if reply.Id != id || reply.Jsonrpc != "2.0" || reply.Result == nil {
		return nil, fmt.Errorf("RPC envelope correlation failed")
	}
	return &reply, nil
}

type integrationHTTPFixture struct {
	db       *data.Data
	client   *ent.Client
	endpoint string
	password string
}

func newIntegrationHTTP(t *testing.T) *integrationHTTPFixture {
	t.Helper()
	db, client := data.OpenIntegrationPostgresData(t)
	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")
	customerKey := "integration-" + suffix[:12]
	t.Setenv("ERP_CUSTOMER_KEY", customerKey)
	logger := log.NewStdLogger(io.Discard)
	config := &conf.Data{Auth: &conf.Data_Auth{JwtSecret: uuid.NewString(), JwtExpireSeconds: 3600}}
	authRepo := data.NewAdminAuthRepo(db, logger)
	auth := biz.NewAdminAuthUsecase(authRepo, data.NewAdminTokenGenerator(config, logger), data.NewAdminTokenParser(config), nil, logger, nil)
	adminRepo := data.NewAdminManageRepo(db, logger)
	admin := biz.NewAdminManageUsecaseForWire(adminRepo, logger, nil, data.NewDebugSafetyConfig(config))
	workflowRepo := data.NewWorkflowRepo(db, logger)
	workflow := biz.NewWorkflowUsecase(workflowRepo)
	configRepo := data.NewCustomerConfigRepo(db, logger)
	customerConfig := biz.NewCustomerConfigUsecaseForWire(configRepo, adminRepo)
	process := biz.NewProcessRuntimeUsecaseForWire(data.NewProcessRuntimeRepo(db, logger), workflowRepo, customerConfig)
	input := biz.CustomerConfigPublishInput{CustomerKey: customerKey, Revision: "integration-fixture", ProductVersion: "product-v1", CompiledSnapshot: map[string]any{
		"customer": map[string]any{"key": customerKey}, "pages": []any{"global-dashboard"},
		"manifest_schema_version":  biz.CustomerConfigManifestSchemaVersionCurrent,
		"process_contract_version": biz.CustomerProcessContractVersionCurrent,
		"manifest_status":          "runtime_compile_ready", "runtime_enabled": true, "publishable": true,
		"runtimeProcessSelections": []any{
			map[string]any{"process_key": biz.ProcessKeySalesOrderAcceptance, "process_version": "v1", "variant_key": biz.CustomerProcessVariantSalesApprovalPMC, "business_ref_type": "sales_order"},
			map[string]any{"process_key": biz.ProcessKeyFinishedGoodsDelivery, "process_version": "v1", "variant_key": biz.CustomerProcessVariantShipmentFinanceApproval, "business_ref_type": "shipment"},
		},
		"approval_settings": map[string]any{"schema_version": biz.ApprovalSettingsSchemaVersion, "items": []any{
			map[string]any{"approval_key": biz.ApprovalSettingSalesOrder, "enabled": true},
			map[string]any{"approval_key": biz.ApprovalSettingPurchaseOrder, "enabled": false},
			map[string]any{"approval_key": biz.ApprovalSettingShipmentFinance, "enabled": true},
		}},
	}}
	for _, key := range []string{"customers", "suppliers", "products", "materials", "sales_orders", "purchase_orders", "purchase_receipts", "quality_inspections", "inventory", "finance", "finance_payments", "workflow_tasks", "shipments"} {
		input.ModuleStates = append(input.ModuleStates, biz.DeploymentModuleStateInput{ModuleKey: key, ContractVersion: "v1", State: "enabled"})
	}
	for _, registered := range biz.BuiltinRoles() {
		input.RoleProfiles = append(input.RoleProfiles, biz.RoleProfileInput{RoleKey: registered.Key, DisplayName: registered.Name, Disabled: registered.Disabled})
		for _, permission := range registered.Permissions {
			input.AccessEntitlements = append(input.AccessEntitlements, biz.AccessEntitlementInput{RoleKey: registered.Key, CapabilityKey: permission, ScopeType: "customer", ScopeValue: customerKey, Enabled: true})
		}
		input.WorkPools = append(input.WorkPools, biz.WorkPoolInput{PoolKey: registered.Key, ModuleKey: "system", DisplayName: registered.Name})
		input.WorkPoolMemberships = append(input.WorkPoolMemberships, biz.WorkPoolMembershipInput{PoolKey: registered.Key, RoleKey: registered.Key, Strategy: "role_pool", Enabled: true})
	}
	for pool, roleKey := range map[string]string{"order_review": biz.PMCRoleKey, "shipment_finance_release": biz.FinanceRoleKey, "approval.sales_order": biz.BossRoleKey, "approval.shipment_finance": biz.FinanceRoleKey} {
		module := "system"
		if pool == "approval.sales_order" {
			module = "sales_orders"
		}
		if pool == "approval.shipment_finance" {
			module = "shipments"
		}
		input.WorkPools = append(input.WorkPools, biz.WorkPoolInput{PoolKey: pool, ModuleKey: module, DisplayName: pool})
		input.WorkPoolMemberships = append(input.WorkPoolMemberships, biz.WorkPoolMembershipInput{PoolKey: pool, RoleKey: roleKey, Strategy: "primary", Priority: 100, Enabled: true})
	}
	revision, err := customerConfig.PublishCustomerConfig(t.Context(), input, 1)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := customerConfig.ActivateCustomerConfig(t.Context(), customerKey, input.Revision, revision.ConfigHash, input.ProductVersion, "", 1); err != nil {
		t.Fatal(err)
	}
	sales := biz.NewSalesOrderUsecase(data.NewSalesOrderRepo(db, logger))
	purchase := biz.NewPurchaseOrderUsecase(data.NewPurchaseOrderRepo(db, logger))
	inventory := biz.NewInventoryUsecase(data.NewInventoryRepo(db, logger))
	facts := biz.NewOperationalFactUsecase(data.NewOperationalFactRepo(db, logger))
	svc := service.NewJsonrpcService(config, logger, auth, admin, workflow, process,
		biz.NewDebugUsecase(data.NewDebugSeedRepo(db, logger), data.NewDebugSafetyConfig(config)),
		biz.NewMasterDataUsecase(data.NewMasterDataRepo(db, logger)), sales, purchase,
		biz.NewProductionOrderUsecase(data.NewProductionOrderRepo(db, logger)),
		biz.NewOutsourcingOrderUsecase(data.NewOutsourcingOrderRepo(db, logger)), inventory, facts,
		biz.NewBusinessAttachmentUsecase(data.NewBusinessAttachmentRepo(db, nil, logger)), customerConfig, authRepo,
		biz.NewBusinessProgressUsecase(data.NewBusinessProgressRepo(db)), biz.NewBusinessStatisticsUsecase(data.NewBusinessStatisticsRepo(db)), data.NewHelpContentRepo(db), biz.NewPartnerReadUsecase(data.NewPartnerReadRepo(db)))
	srv := appserver.NewHTTPServer(&conf.Server{}, logger, svc, nil, db, customerConfig, auth, config)
	host := httptest.NewServer(srv)
	t.Cleanup(host.Close)
	return &integrationHTTPFixture{db: db, client: client, endpoint: host.URL, password: "Simulation-" + uuid.NewString()}
}

func (f *integrationHTTPFixture) actor(t *testing.T, roleKeys ...string) (*integrationRPC, int) {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte(f.password), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	account := f.client.AdminUser.Create().SetUsername("sim_" + strings.ReplaceAll(uuid.NewString(), "-", "")).SetDisplayName("模拟接入操作员").SetPasswordHash(string(hash)).SaveX(t.Context())
	for _, key := range roleKeys {
		registered := f.client.Role.Query().Where(role.RoleKey(key)).OnlyX(t.Context())
		f.client.AdminUserRole.Create().SetAdminUserID(account.ID).SetRoleID(registered.ID).SaveX(t.Context())
		if key == biz.WarehouseRoleKey {
			// Warehouse access is explicit fixture configuration, independent of
			// function permissions. Restore the shared role's prior scope afterward.
			scopes := f.client.RoleDataScope.Query().Where(roledatascope.RoleID(registered.ID), roledatascope.ResourceType("warehouse")).AllX(t.Context())
			if len(scopes) == 0 {
				scope := f.client.RoleDataScope.Create().SetRoleID(registered.ID).SetResourceType("warehouse").SetMode("ALL").SaveX(t.Context())
				t.Cleanup(func() { f.client.RoleDataScope.DeleteOneID(scope.ID).ExecX(context.Background()) })
			} else {
				scope := scopes[0]
				f.client.RoleDataScope.UpdateOne(scope).SetMode("ALL").SetResourceIds([]int{}).SaveX(t.Context())
				t.Cleanup(func() {
					f.client.RoleDataScope.UpdateOneID(scope.ID).SetMode(scope.Mode).SetResourceIds(scope.ResourceIds).SaveX(context.Background())
				})
			}
		}
	}
	caller := &integrationRPC{endpoint: f.endpoint, client: &http.Client{Timeout: 10 * time.Second}}
	reply := requireIntegrationCode(t, caller, "auth", "admin_login", map[string]any{"username": account.Username, "password": f.password}, errcode.OK.Code)
	caller.token = reply.Result.Data.AsMap()["access_token"].(string)
	return caller, account.ID
}

func requireIntegrationCode(t *testing.T, c *integrationRPC, domain, method string, params map[string]any, code int32) *v1.PostJsonrpcReply {
	t.Helper()
	reply, err := c.call(t.Context(), domain, method, params)
	if err != nil {
		t.Fatalf("%s.%s transport: %v", domain, method, err)
	}
	if reply.Result.Code != code {
		t.Fatalf("%s.%s code=%d want=%d message=%s", domain, method, reply.Result.Code, code, reply.Result.Message)
	}
	return reply
}

func concurrentIntegrationCalls(t *testing.T, c *integrationRPC, domain, method string, params map[string]any) []*v1.PostJsonrpcReply {
	t.Helper()
	start := make(chan struct{})
	results := make([]*v1.PostJsonrpcReply, 2)
	errors := make([]error, 2)
	var wg sync.WaitGroup
	for index := range results {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			results[index], errors[index] = c.call(t.Context(), domain, method, params)
		}()
	}
	close(start)
	wg.Wait()
	for index, result := range results {
		if errors[index] != nil {
			t.Fatalf("%s.%s concurrent transport: %v", domain, method, errors[index])
		}
		if result == nil || result.Result == nil || result.GetResult().GetCode() != errcode.OK.Code {
			t.Fatalf("%s.%s concurrent code=%d", domain, method, result.GetResult().GetCode())
		}
	}
	return results
}

func integrationResult(t *testing.T, reply *v1.PostJsonrpcReply, key string) map[string]any {
	t.Helper()
	result, ok := reply.Result.Data.AsMap()[key].(map[string]any)
	if !ok {
		t.Fatalf("missing %s result", key)
	}
	return result
}

// The upstream commit completes, then the connection to the consumer is cut.
// The consumer sees an actual transport failure and has no success response.
func integrationDropResponse(t *testing.T, endpoint string) string {
	t.Helper()
	target, err := url.Parse(endpoint)
	if err != nil {
		t.Fatal(err)
	}
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		forward := r.Clone(r.Context())
		forward.URL.Scheme, forward.URL.Host, forward.RequestURI = target.Scheme, target.Host, ""
		response, err := (&http.Client{Timeout: 10 * time.Second}).Do(forward)
		if err != nil {
			http.Error(w, "simulated upstream unavailable", http.StatusBadGateway)
			return
		}
		defer func() { _ = response.Body.Close() }()
		_, _ = io.Copy(io.Discard, response.Body)
		connection, _, err := w.(http.Hijacker).Hijack()
		if err == nil {
			_ = connection.Close()
		}
	}))
	t.Cleanup(proxy.Close)
	return proxy.URL
}

func TestSourceDocumentPostgresIntegrationOrderConsumers(t *testing.T) {
	f := newIntegrationHTTP(t)
	caller, actorID := f.actor(t, biz.SalesRoleKey)
	ctx := t.Context()
	customer := f.client.Customer.Create().SetCode("SIM-C-" + uuid.NewString()).SetName("模拟下游客户").SaveX(ctx)
	order := f.client.SalesOrder.Create().SetOrderNo("SIM-SO-" + uuid.NewString()).SetCustomerID(customer.ID).SetOrderDate(time.Now()).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
	read := requireIntegrationCode(t, caller, "sales_order", "get_sales_order", map[string]any{"id": order.ID}, errcode.OK.Code)
	if int(integrationResult(t, read, "sales_order")["id"].(float64)) != order.ID {
		t.Fatal("downstream read returned a different order")
	}
	// A generated client can replace the independent wire client without changing ERP.
	transport, err := httpx.NewClient(context.Background(), httpx.WithEndpoint(f.endpoint))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = transport.Close() })
	generated := v1.NewJsonrpcHTTPClient(transport)
	params, _ := structpb.NewStruct(map[string]any{"id": order.ID})
	generatedReply, err := generated.PostJsonrpc(t.Context(), &v1.PostJsonrpcRequest{Url: "sales_order", Jsonrpc: "2.0", Id: "generated", Method: "get_sales_order", Params: params}, httpx.Header(&http.Header{"Authorization": []string{"Bearer " + caller.token}}))
	if err != nil || generatedReply.Result.Code != 0 {
		t.Fatalf("generated consumer failed: %v", err)
	}
	if !reflect.DeepEqual(integrationResult(t, read, "sales_order"), integrationResult(t, generatedReply, "sales_order")) {
		t.Fatal("independent and generated consumers returned different order projections")
	}
	for _, value := range []any{float64(order.ID) + .5, fmt.Sprint(order.ID), true} {
		requireIntegrationCode(t, caller, "sales_order", "get_sales_order", map[string]any{"id": value}, errcode.InvalidParam.Code)
	}
	anonymous := &integrationRPC{endpoint: f.endpoint, client: caller.client}
	requireIntegrationCode(t, anonymous, "sales_order", "get_sales_order", map[string]any{"id": order.ID}, errcode.AuthRequired.Code)
	unauthorized, _ := f.actor(t, biz.PurchaseRoleKey)
	requireIntegrationCode(t, unauthorized, "sales_order", "cancel_sales_order", map[string]any{"id": order.ID, "expected_version": order.Version, "idempotency_key": "denied", "reason": "模拟客户取消"}, errcode.PermissionDenied.Code)
	intent := map[string]any{"id": order.ID, "expected_version": order.Version, "idempotency_key": "sim-cancel-" + uuid.NewString(), "reason": "模拟客户取消未履行订单"}
	for _, field := range []string{"actor_id", "role", "intent_hash"} {
		bad := map[string]any{}
		for k, v := range intent {
			bad[k] = v
		}
		bad[field] = "spoof"
		requireIntegrationCode(t, caller, "sales_order", "cancel_sales_order", bad, errcode.InvalidParam.Code)
	}
	concurrentIntegrationCalls(t, caller, "sales_order", "cancel_sales_order", intent)
	requireIntegrationCode(t, caller, "sales_order", "cancel_sales_order", intent, errcode.OK.Code)
	event := f.client.SourceOrderLifecycleEvent.Query().Where(sourceorderlifecycleevent.SourceType("sales_order"), sourceorderlifecycleevent.SourceID(order.ID)).OnlyX(ctx)
	if event.ActorID != actorID || event.SourceVersion != order.Version+1 {
		t.Fatal("cancel receipt lost authenticated actor or version")
	}
	changed := map[string]any{}
	for k, v := range intent {
		changed[k] = v
	}
	changed["reason"] = "另一份取消意图"
	requireIntegrationCode(t, caller, "sales_order", "cancel_sales_order", changed, errcode.IdempotencyConflict.Code)
	changed["idempotency_key"] = "another-intent"
	requireIntegrationCode(t, caller, "sales_order", "cancel_sales_order", changed, errcode.ResourceVersionConflict.Code)
	if f.client.SalesOrder.GetX(ctx, order.ID).Version != order.Version+1 {
		t.Fatal("replay produced another transition")
	}
	lostOrder := f.client.SalesOrder.Create().SetOrderNo("SIM-LOST-" + uuid.NewString()).SetCustomerID(customer.ID).SetOrderDate(time.Now()).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
	lostIntent := map[string]any{"id": lostOrder.ID, "expected_version": lostOrder.Version, "idempotency_key": "sim-lost-" + uuid.NewString(), "reason": "模拟下游断线后的取消回读"}
	disconnected := &integrationRPC{endpoint: integrationDropResponse(t, f.endpoint), token: caller.token, client: caller.client}
	if _, err := disconnected.call(ctx, "sales_order", "cancel_sales_order", lostIntent); err == nil {
		t.Fatal("fault injection did not disconnect the consumer")
	}
	if f.client.SalesOrder.GetX(ctx, lostOrder.ID).LifecycleStatus != biz.SalesOrderStatusCanceled {
		t.Fatal("upstream had not committed before response loss")
	}
	requireIntegrationCode(t, caller, "sales_order", "cancel_sales_order", lostIntent, errcode.OK.Code)
	if count := f.client.SourceOrderLifecycleEvent.Query().Where(sourceorderlifecycleevent.SourceType("sales_order"), sourceorderlifecycleevent.SourceID(lostOrder.ID)).CountX(ctx); count != 1 {
		t.Fatal("lost response recovery duplicated its receipt")
	}
	f.client.AdminUserRole.Delete().Where(adminuserrole.AdminUserID(actorID)).ExecX(ctx)
	requireIntegrationCode(t, caller, "sales_order", "cancel_sales_order", intent, errcode.PermissionDenied.Code)
}

func TestSourceDocumentPostgresIntegrationSupplierDelivery(t *testing.T) {
	f := newIntegrationHTTP(t)
	caller, _ := f.actor(t, biz.WarehouseRoleKey)
	line, warehouseID := data.IntegrationPurchaseLine(t, f.client)
	for _, value := range []any{float64(line.PurchaseOrderID) + .25, fmt.Sprint(line.PurchaseOrderID), true} {
		requireIntegrationCode(t, caller, "purchase_order", "get_purchase_order", map[string]any{"id": value}, errcode.InvalidParam.Code)
	}
	request := map[string]any{"purchase_order_id": line.PurchaseOrderID, "receipt_no": "SIM-ASN-" + uuid.NewString(), "idempotency_key": "sim-asn-" + uuid.NewString(), "received_at": "2026-10-18T09:00:00+08:00", "items": []any{map[string]any{"purchase_order_item_id": line.ID, "warehouse_id": warehouseID, "quantity": "3", "declared_quantity": "4", "lot_no": "SIM-LOT"}}}
	createdPair := concurrentIntegrationCalls(t, caller, "purchase", "create_purchase_receipt_from_purchase_order", request)
	created := createdPair[0]
	receipt := integrationResult(t, created, "purchase_receipt")
	if integrationResult(t, createdPair[1], "purchase_receipt")["id"] != receipt["id"] {
		t.Fatal("concurrent delivery created different receipt identities")
	}
	items := receipt["items"].([]any)
	item := items[0].(map[string]any)
	if item["quantity"] != "3" || item["declared_quantity"] != "4" {
		t.Fatal("arrival lost the declaration versus counted quantity")
	}
	replayed := requireIntegrationCode(t, caller, "purchase", "create_purchase_receipt_from_purchase_order", request, errcode.OK.Code)
	if integrationResult(t, replayed, "purchase_receipt")["id"] != receipt["id"] {
		t.Fatal("replayed ASN created a different receipt")
	}
	if count := f.client.PurchaseReceipt.Query().Where(purchasereceipt.IdempotencyKey(request["idempotency_key"].(string))).CountX(t.Context()); count != 1 {
		t.Fatal("ASN did not persist exactly once")
	}
	// Supplier-provided quantities are declarations. They cannot bypass ERP count,
	// quality acceptance or create an inventory ledger posting.
	requireIntegrationCode(t, caller, "purchase", "post_purchase_receipt", map[string]any{"id": receipt["id"]}, errcode.InvalidParam.Code)
	if count := f.client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReceiptSourceType), inventorytxn.SourceID(int(receipt["id"].(float64)))).CountX(t.Context()); count != 0 {
		t.Fatal("unaccepted delivery wrote inventory")
	}
	changed := map[string]any{}
	for k, v := range request {
		changed[k] = v
	}
	changed["items"] = []any{map[string]any{"purchase_order_item_id": line.ID, "warehouse_id": warehouseID, "quantity": "4", "declared_quantity": "4", "lot_no": "SIM-LOT"}}
	requireIntegrationCode(t, caller, "purchase", "create_purchase_receipt_from_purchase_order", changed, errcode.IdempotencyConflict.Code)
	changed["idempotency_key"] = "sim-over-delivery-" + uuid.NewString()
	changed["receipt_no"] = "SIM-OVER-" + uuid.NewString()
	changed["items"] = []any{map[string]any{"purchase_order_item_id": line.ID, "warehouse_id": warehouseID, "quantity": "11", "lot_no": "SIM-LOT-2"}}
	requireIntegrationCode(t, caller, "purchase", "create_purchase_receipt_from_purchase_order", changed, errcode.InvalidParam.Code)
	if f.client.PurchaseReceipt.Query().Where(purchasereceipt.IdempotencyKey(changed["idempotency_key"].(string))).CountX(t.Context()) != 0 {
		t.Fatal("over-delivery left a partial receipt")
	}
	quality, _ := f.actor(t, biz.QualityRoleKey)
	inspections := receipt["quality_inspections"].([]any)
	if len(inspections) != 1 {
		t.Fatal("arrival must create one canonical incoming inspection")
	}
	inspection := inspections[0].(map[string]any)
	requireIntegrationCode(t, caller, "quality", "pass_quality_inspection", map[string]any{"id": inspection["id"], "result": biz.QualityInspectionResultPass}, errcode.PermissionDenied.Code)
	decision := map[string]any{
		"id": inspection["id"], "result": biz.QualityInspectionResultPass, "decision_note": "模拟到货检验合格",
		"defect_rate_operator": "approx", "defect_rate_percent": "0",
		"check_items": []any{map[string]any{"name": "外观", "requirement": "符合样品", "observation": "模拟逐件检验符合约定", "result": "PASS", "scope": "FULL"}},
	}
	for _, bad := range []any{inspection["id"].(float64) + .5, fmt.Sprint(inspection["id"]), true, nil} {
		decision["id"] = bad
		requireIntegrationCode(t, quality, "quality", "pass_quality_inspection", decision, errcode.InvalidParam.Code)
	}
	decision["id"] = inspection["id"]
	concurrentIntegrationCalls(t, quality, "quality", "pass_quality_inspection", decision)
	for _, bad := range []any{receipt["id"].(float64) + .5, fmt.Sprint(receipt["id"]), true, nil} {
		requireIntegrationCode(t, caller, "purchase", "post_purchase_receipt", map[string]any{"id": bad}, errcode.InvalidParam.Code)
	}
	concurrentIntegrationCalls(t, caller, "purchase", "post_purchase_receipt", map[string]any{"id": receipt["id"]})
	storedItem := f.client.PurchaseReceiptItem.GetX(t.Context(), int(item["id"].(float64)))
	balance := f.client.InventoryBalance.Query().Where(inventorybalance.SubjectType(biz.InventorySubjectMaterial), inventorybalance.SubjectID(storedItem.MaterialID), inventorybalance.WarehouseID(warehouseID)).OnlyX(t.Context())
	if !balance.Quantity.Equal(decimal.NewFromInt(3)) || f.client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReceiptSourceType), inventorytxn.SourceID(int(receipt["id"].(float64)))).CountX(t.Context()) != 1 {
		t.Fatal("accepted arrival did not post exactly the counted quantity once")
	}
	readBack := integrationResult(t, requireIntegrationCode(t, caller, "purchase", "get_purchase_receipt", map[string]any{"id": receipt["id"]}, errcode.OK.Code), "purchase_receipt")
	if readBack["status"] != biz.PurchaseReceiptStatusPosted || readBack["items"].([]any)[0].(map[string]any)["declared_quantity"] != "4" {
		t.Fatal("posted receipt lost its source or declaration")
	}
	// Current authorization is checked even when the business result already exists.
	warehouseRole := f.client.Role.Query().Where(role.RoleKey(biz.WarehouseRoleKey)).OnlyX(t.Context())
	f.client.RoleDataScope.Update().Where(roledatascope.RoleID(warehouseRole.ID), roledatascope.ResourceType("warehouse")).SetMode("NONE").SetResourceIds([]int{}).ExecX(t.Context())
	requireIntegrationCode(t, caller, "purchase", "create_purchase_receipt_from_purchase_order", request, errcode.PermissionDenied.Code)
	requireIntegrationCode(t, caller, "purchase", "post_purchase_receipt", map[string]any{"id": receipt["id"]}, errcode.PermissionDenied.Code)
	requireIntegrationCode(t, caller, "purchase", "get_purchase_receipt", map[string]any{"id": receipt["id"]}, errcode.PermissionDenied.Code)
}

func TestSourceDocumentPostgresIntegrationDraftDataCorrection(t *testing.T) {
	f := newIntegrationHTTP(t)
	caller, _ := f.actor(t, biz.SalesRoleKey)
	customer := f.client.Customer.Create().SetCode("SIM-CHECK-" + uuid.NewString()).SetName("模拟订单校对客户").SaveX(t.Context())
	unit := f.client.Unit.Create().SetCode("SIMU" + uuid.NewString()[:8]).SetName("个").SetPrecision(0).SaveX(t.Context())
	productID, warehouseID := data.IntegrationSaleStock(t, f.db, f.client, unit.ID)
	line := map[string]any{"line_no": 1, "product_id": productID, "requested_product_name": "模拟毛绒兔", "unit_id": unit.ID, "ordered_quantity": "10", "unit_price": "1.23", "amount": "12.30"}
	request := map[string]any{"order_no": "SIM-WEB-" + uuid.NewString(), "customer_id": customer.ID, "customer_order_no": "SIM-UPSTREAM-19", "order_date": "2026-10-18T09:00:00+08:00", "currency": "CNY", "payment_term_days": 30, "tax_mode": biz.SalesOrderTaxModeNone, "freight_terms": biz.SalesOrderFreightTermsExcluded, "quoted_freight_amount": "0", "note": "待校对颜色", "items": []any{line}}
	created := requireIntegrationCode(t, caller, "sales_order", "save_sales_order_with_items", request, errcode.OK.Code)
	order := integrationResult(t, created, "sales_order")
	items := created.Result.Data.AsMap()["sales_order_items"].([]any)
	line["id"] = items[0].(map[string]any)["id"]
	request["id"], request["expected_version"], request["note"] = order["id"], order["version"], ""
	updated := requireIntegrationCode(t, caller, "sales_order", "save_sales_order_with_items", request, errcode.OK.Code)
	next := integrationResult(t, updated, "sales_order")
	if next["note"] != nil && next["note"] != "" {
		t.Fatal("cleared collaboration note retained its prior value")
	}
	stored := f.client.SalesOrder.GetX(t.Context(), int(order["id"].(float64)))
	if stored.Note != nil && *stored.Note != "" {
		t.Fatal("cleared collaboration note remained in the database")
	}
	if next["version"].(float64) != order["version"].(float64)+1 {
		t.Fatal("draft correction did not advance once")
	}
	requireIntegrationCode(t, caller, "sales_order", "save_sales_order_with_items", request, errcode.ResourceVersionConflict.Code)
	request["expected_version"] = next["version"]
	request["id"] = order["id"].(float64) + .25
	requireIntegrationCode(t, caller, "sales_order", "save_sales_order_with_items", request, errcode.InvalidParam.Code)
	request["id"] = order["id"]
	line["ordered_quantity"] = 10
	requireIntegrationCode(t, caller, "sales_order", "save_sales_order_with_items", request, errcode.InvalidParam.Code)
	if f.client.SalesOrder.GetX(t.Context(), int(order["id"].(float64))).Version != int(next["version"].(float64)) {
		t.Fatal("invalid adapter payload changed the draft")
	}
	integrationDownstreamFulfillment(t, f, caller, next, items[0].(map[string]any), productID, unit.ID, warehouseID)
}

func TestSourceDocumentPostgresIntegrationWarehouseTransfer(t *testing.T) {
	f := newIntegrationHTTP(t)
	caller, actorID := f.actor(t, biz.WarehouseRoleKey)
	op, materialID, fromID, toID := data.IntegrationInventoryTransfer(t, f.db, f.client, actorID)
	ctx := t.Context()
	request := map[string]any{"id": op.ID, "expected_version": op.Version}
	posted := requireIntegrationCode(t, caller, "inventory", "post_inventory_operation", request, errcode.OK.Code)
	requireIntegrationCode(t, caller, "inventory", "post_inventory_operation", request, errcode.OK.Code)
	if f.client.InventoryOperation.GetX(ctx, op.ID).Version != op.Version+1 {
		t.Fatal("transfer replay advanced the stored operation version")
	}
	if int(integrationResult(t, posted, "inventory_operation")["version"].(float64)) != op.Version+1 {
		t.Fatal("transfer did not advance once")
	}
	for warehouseID, expected := range map[int]string{fromID: "7", toID: "3"} {
		row := f.client.InventoryBalance.Query().Where(inventorybalance.SubjectType(biz.InventorySubjectMaterial), inventorybalance.SubjectID(materialID), inventorybalance.WarehouseID(warehouseID)).OnlyX(ctx)
		if !row.Quantity.Equal(decimal.RequireFromString(expected)) {
			t.Fatalf("warehouse quantity=%s want=%s", row.Quantity, expected)
		}
	}
	if count := f.client.InventoryTxn.Query().Where(inventorytxn.SubjectID(materialID), inventorytxn.SubjectType(biz.InventorySubjectMaterial)).CountX(ctx); count != 3 {
		t.Fatalf("transfer ledger count=%d want opening plus two entries", count)
	}
	warehouseRole := f.client.Role.Query().Where(role.RoleKey(biz.WarehouseRoleKey)).OnlyX(ctx)
	scope := f.client.RoleDataScope.Query().Where(roledatascope.RoleID(warehouseRole.ID), roledatascope.ResourceType("warehouse")).OnlyX(ctx)
	f.client.RoleDataScope.UpdateOne(scope).SetMode("ASSIGNED").SetResourceIds([]int{fromID}).SaveX(ctx)
	t.Cleanup(func() {
		f.client.RoleDataScope.UpdateOneID(scope.ID).SetMode(scope.Mode).SetResourceIds(scope.ResourceIds).SaveX(context.Background())
	})
	requireIntegrationCode(t, caller, "inventory", "get_inventory_operation", map[string]any{"id": op.ID}, errcode.PermissionDenied.Code)
	requireIntegrationCode(t, caller, "inventory", "post_inventory_operation", request, errcode.PermissionDenied.Code)
}

func TestSourceDocumentPostgresIntegrationFinanceAllocation(t *testing.T) {
	f := newIntegrationHTTP(t)
	caller, actorID := f.actor(t, biz.FinanceRoleKey)
	fact := data.IntegrationReceivable(t, f.db, f.client)
	payment := data.IntegrationPostedPayment(t, f.db, f.client, fact, actorID)
	request := map[string]any{"id": payment.ID, "expected_version": payment.Version, "idempotency_key": "sim-reconcile-" + uuid.NewString(), "allocations": []any{map[string]any{"finance_fact_id": fact.ID, "amount": "6"}}}
	requireIntegrationCode(t, caller, "operational_fact", "allocate_finance_payment", request, errcode.OK.Code)
	requireIntegrationCode(t, caller, "operational_fact", "allocate_finance_payment", request, errcode.OK.Code)
	allocations := f.client.FinanceAllocation.Query().Where(financeallocation.PaymentID(payment.ID)).AllX(t.Context())
	var allocated decimal.Decimal
	for _, allocation := range allocations {
		allocated = allocated.Add(allocation.Amount)
	}
	if len(allocations) != 1 || !allocated.Equal(decimal.NewFromInt(6)) {
		t.Fatal("replayed reconciliation duplicated settlement")
	}
	if f.client.FinancePayment.GetX(t.Context(), payment.ID).Version != payment.Version+1 {
		t.Fatal("reconciliation replay advanced payment")
	}
	changed := map[string]any{}
	for k, v := range request {
		changed[k] = v
	}
	changed["allocations"] = []any{map[string]any{"finance_fact_id": fact.ID, "amount": "7"}}
	requireIntegrationCode(t, caller, "operational_fact", "allocate_finance_payment", changed, errcode.IdempotencyConflict.Code)
	changed["idempotency_key"] = "sim-numeric-" + uuid.NewString()
	changed["allocations"] = []any{map[string]any{"finance_fact_id": fact.ID, "amount": 1.5}}
	requireIntegrationCode(t, caller, "operational_fact", "allocate_finance_payment", changed, errcode.InvalidParam.Code)
	other := data.IntegrationReceivable(t, f.db, f.client)
	failed := map[string]any{"id": payment.ID, "expected_version": payment.Version + 1, "idempotency_key": "sim-rollback-" + uuid.NewString(), "allocations": []any{map[string]any{"finance_fact_id": fact.ID, "amount": "2"}, map[string]any{"finance_fact_id": other.ID, "amount": "1"}}}
	// The first allocation is valid, but the second belongs to another customer.
	// Neither a partial settlement nor a consumed version/key may survive.
	requireIntegrationCode(t, caller, "operational_fact", "allocate_finance_payment", failed, errcode.InvalidParam.Code)
	if f.client.FinanceAllocation.Query().Where(financeallocation.PaymentID(payment.ID)).CountX(t.Context()) != 1 || f.client.FinancePayment.GetX(t.Context(), payment.ID).Version != payment.Version+1 {
		t.Fatal("failed reconciliation left a partial write")
	}
	failed["allocations"] = []any{map[string]any{"finance_fact_id": fact.ID, "amount": "2"}}
	requireIntegrationCode(t, caller, "operational_fact", "allocate_finance_payment", failed, errcode.OK.Code)
	requireIntegrationCode(t, caller, "operational_fact", "allocate_finance_payment", failed, errcode.OK.Code)
	if f.client.FinanceAllocation.Query().Where(financeallocation.PaymentID(payment.ID)).CountX(t.Context()) != 2 {
		t.Fatal("recovered reconciliation duplicated or lost an allocation")
	}
	if f.client.FinancePayment.GetX(t.Context(), payment.ID).Version != payment.Version+2 {
		t.Fatal("reconciliation replay advanced the stored payment version")
	}
	readback := requireIntegrationCode(t, caller, "operational_fact", "get_finance_payment", map[string]any{"id": payment.ID}, errcode.OK.Code)
	balance := integrationResult(t, readback, "payment")
	if balance["amount"] != "10" || balance["available_amount"] != "2" {
		t.Fatal("reconciliation changed the cash amount or lost its remaining balance")
	}
}

func TestSourceDocumentPostgresIntegrationTransportBoundary(t *testing.T) {
	f := newIntegrationHTTP(t)
	caller, _ := f.actor(t, biz.SalesRoleKey)
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{
		{http.MethodGet, "/rpc/system", "", http.StatusNotFound},
		{http.MethodPost, "/rpc/sales_order", `{"jsonrpc":"2.0",`, http.StatusBadRequest},
	} {
		req, err := http.NewRequestWithContext(t.Context(), tc.method, f.endpoint+tc.path, strings.NewReader(tc.body))
		if err != nil {
			t.Fatal("invalid transport fixture")
		}
		req.Header.Set("Content-Type", "application/json")
		response, err := caller.client.Do(req)
		if err != nil {
			t.Fatal("transport boundary fixture unavailable")
		}
		_ = response.Body.Close()
		if response.StatusCode != tc.status {
			t.Fatalf("transport boundary status=%d want=%d", response.StatusCode, tc.status)
		}
	}
	request, err := http.NewRequestWithContext(t.Context(), http.MethodPost, f.endpoint+"/rpc/sales_order?access_token="+url.QueryEscape(caller.token), strings.NewReader(`{"jsonrpc":"2.0","id":"query-token","method":"get_sales_order","params":{"id":1}}`))
	if err != nil {
		t.Fatal("invalid query authentication fixture")
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := caller.client.Do(request)
	if err != nil {
		t.Fatal("query authentication fixture unavailable")
	}
	defer func() { _ = response.Body.Close() }()
	raw, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal("query authentication result unavailable")
	}
	var reply v1.PostJsonrpcReply
	if protojson.Unmarshal(raw, &reply) != nil || reply.GetResult().GetCode() != errcode.AuthRequired.Code {
		t.Fatal("query-string credential expanded authentication")
	}
	anonymous := &integrationRPC{endpoint: f.endpoint, client: caller.client}
	requireIntegrationCode(t, anonymous, "auth", "integration_login", map[string]any{}, errcode.AuthRequired.Code)
	requireIntegrationCode(t, caller, "auth", "integration_login", map[string]any{}, errcode.UnknownMethod.Code)
}
