package service

import (
	"context"
	"fmt"
	"io"
	"testing"

	"server/internal/biz"
	datarepo "server/internal/data"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func newProductionOrderJSONRPCTestData(t *testing.T, permissions ...string) (*jsonrpcDispatcher, int, int) {
	t.Helper()
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "jsonrpc_production_order_"+t.Name())
	for index := 1; index <= 7; index++ {
		username := fmt.Sprintf("production-api-admin-%d", index)
		if index == 7 {
			username = "admin"
		}
		client.AdminUser.Create().SetUsername(username).SetPasswordHash("test-password-hash").SaveX(ctx)
	}
	unit := createTestUnit(t, ctx, client, "PO-UNIT")
	product := createTestProduct(t, ctx, client, unit.ID, "PO-PRODUCT")
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:               log.NewHelper(log.With(logger, "module", "service.jsonrpc.production_order.test")),
		adminReader:       stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, permissions...)},
		productionOrderUC: biz.NewProductionOrderUsecase(datarepo.NewProductionOrderRepo(data, logger)),
		workflowUC:        biz.NewWorkflowUsecase(datarepo.NewWorkflowRepo(data, logger)),
		customerConfigUC:  biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}
	activateOperationalFactTestCustomerConfig(t, dispatcher, customerConfigPublishParamsWithRevisionAndModuleState(
		t, customerConfigPublishParams(t), "2026.07.12.production-order-api", productionOrderModuleKey, "enabled",
	))
	return dispatcher, product.ID, unit.ID
}

func productionOrderCreateParams(productID, unitID int, key string) map[string]any {
	return map[string]any{
		"order_no":         "MO-API-001",
		"idempotency_key":  key,
		"planned_start_at": float64(1783785600),
		"items": []any{map[string]any{
			"line_no": float64(1), "product_id": float64(productID), "unit_id": float64(unitID), "planned_quantity": "10.50",
		}},
	}
}

type productionOrderActionModuleGateRepo struct {
	biz.ProductionOrderRepo
	actionCalls int
}

func (r *productionOrderActionModuleGateRepo) ApplyProductionOrderAction(context.Context, *biz.ProductionOrderActionCommand) (*biz.ProductionOrderAggregate, error) {
	r.actionCalls++
	return nil, biz.ErrBadParam
}

func TestProductionOrderJSONRPCCanonicalLifecycleReadAndReplay(t *testing.T) {
	d, productID, unitID := newProductionOrderJSONRPCTestData(
		t,
		biz.PermissionPMCPlanRead,
		biz.PermissionPMCPlanCreate,
		biz.PermissionPMCPlanUpdate,
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskComplete,
	)
	ctx := workflowJSONRPCAdminContext()
	params := productionOrderCreateParams(productID, unitID, "api-create-1")
	_, created, err := d.handleProductionOrder(ctx, "create_production_order", "create", mustJSONRPCStruct(t, params))
	if err != nil || created.Code != errcode.OK.Code {
		t.Fatalf("create result=%#v err=%v", created, err)
	}
	order := jsonRPCNestedMap(t, created, "production_order")
	orderID := jsonRPCInt(t, order, "id")
	if order["created_by"] != float64(7) || order["status"] != biz.ProductionOrderStatusDraft || order["version"] != float64(1) {
		t.Fatalf("created order=%#v", order)
	}
	if _, exists := order["item_count"]; exists {
		t.Fatalf("create response must not report an unloaded list item count: %#v", order)
	}
	items := created.Data.AsMap()["production_order_items"].([]any)
	if len(items) != 1 || items[0].(map[string]any)["planned_quantity"] != "10.5" {
		t.Fatalf("created items=%#v", items)
	}

	_, replayed, _ := d.handleProductionOrder(ctx, "create_production_order", "replay", mustJSONRPCStruct(t, params))
	if replayed.Code != errcode.OK.Code || jsonRPCInt(t, jsonRPCNestedMap(t, replayed, "production_order"), "id") != orderID {
		t.Fatalf("create replay=%#v", replayed)
	}
	changed := productionOrderCreateParams(productID, unitID, "api-create-1")
	changed["order_no"] = "MO-API-CHANGED"
	_, conflict, _ := d.handleProductionOrder(ctx, "create_production_order", "changed", mustJSONRPCStruct(t, changed))
	if conflict.Code != errcode.IdempotencyConflict.Code {
		t.Fatalf("changed intent=%#v", conflict)
	}

	save := productionOrderCreateParams(productID, unitID, "api-save-1")
	save["production_order_id"] = float64(orderID)
	save["expected_version"] = float64(1)
	save["note"] = "排产备注"
	_, saved, _ := d.handleProductionOrder(ctx, "save_production_order", "save", mustJSONRPCStruct(t, save))
	if saved.Code != errcode.OK.Code || jsonRPCNestedMap(t, saved, "production_order")["version"] != float64(2) {
		t.Fatalf("save=%#v", saved)
	}
	_, stale, _ := d.handleProductionOrder(ctx, "release_production_order", "stale", mustJSONRPCStruct(t, map[string]any{
		"production_order_id": float64(orderID), "expected_version": float64(1), "idempotency_key": "api-release-stale",
	}))
	if stale.Code != errcode.ResourceVersionConflict.Code {
		t.Fatalf("stale release=%#v", stale)
	}
	_, released, _ := d.handleProductionOrder(ctx, "release_production_order", "release", mustJSONRPCStruct(t, map[string]any{
		"production_order_id": float64(orderID), "expected_version": float64(2), "idempotency_key": "api-release-1",
	}))
	if released.Code != errcode.OK.Code || jsonRPCNestedMap(t, released, "production_order")["status"] != biz.ProductionOrderStatusReleased {
		t.Fatalf("release=%#v", released)
	}
	_, schedulingTasks, err := d.handleWorkflow(ctx, "list_tasks", "list-scheduling-task", mustJSONRPCStruct(t, map[string]any{
		"task_group":  biz.WorkflowSourceTaskProductionSchedulingGroup,
		"source_type": biz.WorkflowSourceTaskProductionOrderSourceType,
		"source_id":   float64(orderID),
		"limit":       float64(20),
	}))
	if err != nil || schedulingTasks.Code != errcode.OK.Code {
		t.Fatalf("list source scheduling task result=%#v err=%v", schedulingTasks, err)
	}
	tasks := schedulingTasks.Data.AsMap()["tasks"].([]any)
	if len(tasks) != 1 {
		t.Fatalf("source scheduling tasks=%#v", tasks)
	}
	schedulingTask := tasks[0].(map[string]any)
	payload := schedulingTask["payload"].(map[string]any)
	if schedulingTask["task_code"] != biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskProductionSchedulingGroup, orderID) ||
		schedulingTask["owner_role_key"] != biz.PMCRoleKey ||
		payload["source_task_contract"] != biz.WorkflowSourceTaskContractV1 ||
		payload["source_task_producer"] != biz.WorkflowSourceTaskProductionOrderReleaseProducer {
		t.Fatalf("source scheduling task lineage=%#v", schedulingTask)
	}
	_, completedScheduling, err := d.handleWorkflow(ctx, "complete_task_action", "complete-scheduling-task", mustJSONRPCStruct(t, map[string]any{
		"task_id":          schedulingTask["id"],
		"expected_version": schedulingTask["version"],
		"idempotency_key":  "api-complete-scheduling-1",
		"action_key":       "complete",
		"payload":          map[string]any{"feedback": "排产已确认"},
	}))
	if err != nil || completedScheduling.Code != errcode.OK.Code || jsonRPCNestedMap(t, completedScheduling, "task")["task_status_key"] != "done" {
		t.Fatalf("complete source scheduling task result=%#v err=%v", completedScheduling, err)
	}
	reason := "试产结束，按当前数量短关闭"
	_, closed, _ := d.handleProductionOrder(ctx, "close_production_order", "close", mustJSONRPCStruct(t, map[string]any{
		"production_order_id": float64(orderID), "expected_version": float64(3), "idempotency_key": "api-close-1", "reason": reason,
	}))
	if closed.Code != errcode.OK.Code || jsonRPCNestedMap(t, closed, "production_order")["close_reason"] != reason {
		t.Fatalf("close=%#v", closed)
	}

	_, detail, _ := d.handleProductionOrder(ctx, "get_production_order", "get", mustJSONRPCStruct(t, map[string]any{"production_order_id": float64(orderID)}))
	if detail.Code != errcode.OK.Code || len(detail.Data.AsMap()["production_order_items"].([]any)) != 1 {
		t.Fatalf("detail=%#v", detail)
	}
	_, list, _ := d.handleProductionOrder(ctx, "list_production_orders", "list", mustJSONRPCStruct(t, map[string]any{
		"keyword": "MO-API", "status": biz.ProductionOrderStatusClosed, "sort_by": "order_no", "sort_direction": "asc", "limit": float64(20), "offset": float64(0),
	}))
	if list.Code != errcode.OK.Code || list.Data.AsMap()["total"] != float64(1) || len(list.Data.AsMap()["production_orders"].([]any)) != 1 {
		t.Fatalf("list=%#v", list)
	}
	listedOrder := list.Data.AsMap()["production_orders"].([]any)[0].(map[string]any)
	if listedOrder["item_count"] != float64(1) {
		t.Fatalf("list item_count=%#v, want 1", listedOrder["item_count"])
	}
}

func TestProductionOrderJSONRPCStrictCanonicalParams(t *testing.T) {
	d, productID, unitID := newProductionOrderJSONRPCTestData(
		t,
		biz.PermissionPMCPlanRead,
		biz.PermissionPMCPlanCreate,
		biz.PermissionPMCPlanUpdate,
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderItemRead,
	)
	d.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin(
		[]string{biz.PMCRoleKey, biz.SalesRoleKey},
		biz.PermissionPMCPlanRead,
		biz.PermissionPMCPlanCreate,
		biz.PermissionPMCPlanUpdate,
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderItemRead,
	)}
	ctx := workflowJSONRPCAdminContext()
	for _, method := range []string{"createProductionOrder", "saveProductionOrder", "getProductionOrder", "listProductionOrders", "listProductionOrderReferenceOptions"} {
		_, res, _ := d.handleProductionOrder(ctx, method, method, mustJSONRPCStruct(t, map[string]any{}))
		if res.Code != errcode.UnknownMethod.Code {
			t.Fatalf("alias %s result=%#v", method, res)
		}
	}
	invalidCreate := productionOrderCreateParams(productID, unitID, "strict-create")
	invalidCreate["actor_id"] = float64(99)
	_, unknownField, _ := d.handleProductionOrder(ctx, "create_production_order", "unknown", mustJSONRPCStruct(t, invalidCreate))
	if unknownField.Code != errcode.InvalidParam.Code {
		t.Fatalf("unknown field=%#v", unknownField)
	}

	tests := []map[string]any{
		{"production_order_id": float64(1), "expected_version": float64(1), "idempotency_key": "k", "id": float64(1)},
		{"production_order_id": float64(1), "expected_version": "1", "idempotency_key": "k"},
		{"production_order_id": float64(9007199254740992), "expected_version": float64(1), "idempotency_key": "k"},
		{"production_order_id": float64(1), "expected_version": float64(1), "idempotency_key": " key-with-space "},
	}
	for index, params := range tests {
		_, res, _ := d.handleProductionOrder(ctx, "release_production_order", "invalid", mustJSONRPCStruct(t, params))
		if res.Code != errcode.InvalidParam.Code {
			t.Fatalf("invalid action %d=%#v", index, res)
		}
	}

	invalidDecimal := productionOrderCreateParams(productID, unitID, "strict-decimal")
	invalidDecimal["items"].([]any)[0].(map[string]any)["planned_quantity"] = float64(10)
	_, decimalResult, _ := d.handleProductionOrder(ctx, "create_production_order", "decimal", mustJSONRPCStruct(t, invalidDecimal))
	if decimalResult.Code != errcode.InvalidParam.Code {
		t.Fatalf("numeric decimal=%#v", decimalResult)
	}
	_, invalidList, _ := d.handleProductionOrder(ctx, "list_production_orders", "list", mustJSONRPCStruct(t, map[string]any{"limit": float64(201)}))
	if invalidList.Code != errcode.InvalidParam.Code {
		t.Fatalf("invalid list=%#v", invalidList)
	}
	_, productOptions, _ := d.handleProductionOrder(ctx, "list_production_order_reference_options", "product-options", mustJSONRPCStruct(t, map[string]any{
		"reference_type": biz.ProductionOrderReferenceProduct, "keyword": "PO-PRODUCT", "limit": float64(20), "offset": float64(0),
	}))
	if productOptions.Code != errcode.OK.Code || productOptions.Data.AsMap()["total"] != float64(1) {
		t.Fatalf("product options=%#v", productOptions)
	}
	for index, params := range []map[string]any{
		{"reference_type": biz.ProductionOrderReferenceSalesOrderItem, "id": float64(1)},
		{"reference_type": biz.ProductionOrderReferenceProduct, "selected_ids": []any{}},
		{"reference_type": biz.ProductionOrderReferenceProduct, "selected_ids": []any{float64(1)}, "product_id": float64(productID)},
		{"reference_type": biz.ProductionOrderReferenceSalesOrderItem, "selected_ids": []any{float64(1)}, "keyword": "SO"},
	} {
		_, result, _ := d.handleProductionOrder(ctx, "list_production_order_reference_options", "invalid-options", mustJSONRPCStruct(t, params))
		if result.Code != errcode.InvalidParam.Code {
			t.Fatalf("invalid reference options %d=%#v", index, result)
		}
	}
	_, sourceFirst, _ := d.handleProductionOrder(ctx, "list_production_order_reference_options", "sales-source-first", mustJSONRPCStruct(t, map[string]any{
		"reference_type": biz.ProductionOrderReferenceSalesOrderItem, "keyword": "SO", "limit": float64(20), "offset": float64(0),
	}))
	if sourceFirst.Code != errcode.OK.Code {
		t.Fatalf("sales source-first options=%#v", sourceFirst)
	}
}

func TestProductionOrderJSONRPCAuthAndPermissions(t *testing.T) {
	d, productID, unitID := newProductionOrderJSONRPCTestData(t, biz.PermissionPMCPlanRead)
	params := mustJSONRPCStruct(t, productionOrderCreateParams(productID, unitID, "permission-create"))
	_, noLogin, _ := d.handleProductionOrder(context.Background(), "create_production_order", "no-login", params)
	if noLogin.Code != errcode.AuthRequired.Code {
		t.Fatalf("no login=%#v", noLogin)
	}
	nonAdminCtx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Username: "admin", Role: biz.RoleUser})
	_, nonAdmin, _ := d.handleProductionOrder(nonAdminCtx, "create_production_order", "non-admin", params)
	if nonAdmin.Code != errcode.AdminRequired.Code {
		t.Fatalf("non admin=%#v", nonAdmin)
	}
	_, denied, _ := d.handleProductionOrder(workflowJSONRPCAdminContext(), "create_production_order", "denied", params)
	if denied.Code != errcode.PermissionDenied.Code {
		t.Fatalf("permission denied=%#v", denied)
	}
	d.adminReader = stubAdminAccountReader{admin: &biz.AdminUser{ID: 1, Username: "admin", Disabled: true}}
	_, disabled, _ := d.handleProductionOrder(workflowJSONRPCAdminContext(), "list_production_orders", "disabled", mustJSONRPCStruct(t, map[string]any{}))
	if disabled.Code != errcode.AdminDisabled.Code {
		t.Fatalf("disabled=%#v", disabled)
	}
	d.adminReader = stubAdminAccountReader{admin: &biz.AdminUser{ID: 1, Username: "admin", IsSuperAdmin: true}}
	_, superList, _ := d.handleProductionOrder(workflowJSONRPCAdminContext(), "list_production_orders", "super", mustJSONRPCStruct(t, map[string]any{}))
	if superList.Code != errcode.OK.Code {
		t.Fatalf("super admin local list=%#v", superList)
	}
}

func TestProductionOrderJSONRPCWIPReadCanReadButCannotMaintainPlan(t *testing.T) {
	d, productID, unitID := newProductionOrderJSONRPCTestData(
		t,
		biz.PermissionPMCPlanRead,
		biz.PermissionPMCPlanCreate,
	)
	ctx := workflowJSONRPCAdminContext()
	_, created, _ := d.handleProductionOrder(ctx, "create_production_order", "create-for-wip-reader", mustJSONRPCStruct(t, productionOrderCreateParams(productID, unitID, "create-for-wip-reader")))
	if created.Code != errcode.OK.Code {
		t.Fatalf("create production order=%#v", created)
	}
	orderID := jsonRPCInt(t, jsonRPCNestedMap(t, created, "production_order"), "id")

	d.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionProductionWIPRead,
		biz.PermissionPackagingMaterialConfirm,
	)}
	_, list, _ := d.handleProductionOrder(ctx, "list_production_orders", "wip-list", mustJSONRPCStruct(t, map[string]any{}))
	if list.Code != errcode.OK.Code {
		t.Fatalf("WIP reader list=%#v", list)
	}
	_, detail, _ := d.handleProductionOrder(ctx, "get_production_order", "wip-detail", mustJSONRPCStruct(t, map[string]any{"production_order_id": float64(orderID)}))
	if detail.Code != errcode.OK.Code {
		t.Fatalf("WIP reader detail=%#v", detail)
	}
	_, options, _ := d.handleProductionOrder(ctx, "list_production_order_reference_options", "wip-options", mustJSONRPCStruct(t, map[string]any{
		"reference_type": biz.ProductionOrderReferenceProduct,
		"limit":          float64(20),
		"offset":         float64(0),
	}))
	if options.Code != errcode.PermissionDenied.Code {
		t.Fatalf("WIP reader reference options=%#v", options)
	}
	_, createDenied, _ := d.handleProductionOrder(ctx, "create_production_order", "wip-create", mustJSONRPCStruct(t, productionOrderCreateParams(productID, unitID, "wip-create")))
	if createDenied.Code != errcode.PermissionDenied.Code {
		t.Fatalf("WIP reader create=%#v", createDenied)
	}
}

func TestProductionOrderJSONRPCModuleStatesAndRoleMatrix(t *testing.T) {
	d, productID, unitID := newProductionOrderJSONRPCTestData(t, biz.PermissionPMCPlanRead, biz.PermissionPMCPlanUpdate)
	ctx := workflowJSONRPCAdminContext()
	d.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.ProductionRoleKey}, biz.PermissionPMCPlanRead, biz.PermissionPMCPlanUpdate)}
	_, productionCreate, _ := d.handleProductionOrder(ctx, "create_production_order", "production-create", mustJSONRPCStruct(t, productionOrderCreateParams(productID, unitID, "production-create")))
	if productionCreate.Code != errcode.PermissionDenied.Code {
		t.Fatalf("production role create=%#v", productionCreate)
	}
	_, productionRead, _ := d.handleProductionOrder(ctx, "list_production_orders", "production-read", mustJSONRPCStruct(t, map[string]any{}))
	if productionRead.Code != errcode.OK.Code {
		t.Fatalf("production role read=%#v", productionRead)
	}
	optionParams := mustJSONRPCStruct(t, map[string]any{"reference_type": biz.ProductionOrderReferenceProduct, "limit": float64(20), "offset": float64(0)})
	_, productionOptions, _ := d.handleProductionOrder(ctx, "list_production_order_reference_options", "production-options", optionParams)
	if productionOptions.Code != errcode.OK.Code {
		t.Fatalf("production role options=%#v", productionOptions)
	}

	readOnly := customerConfigPublishParamsWithRevisionAndModuleState(t, customerConfigPublishParams(t), "2026.07.12.production-read-only", productionOrderModuleKey, "read_only")
	activateOperationalFactTestCustomerConfig(t, d, readOnly)
	_, readOnlyList, _ := d.handleProductionOrder(ctx, "list_production_orders", "read-only-list", mustJSONRPCStruct(t, map[string]any{}))
	if readOnlyList.Code != errcode.OK.Code {
		t.Fatalf("read_only list=%#v", readOnlyList)
	}
	_, readOnlyOptions, _ := d.handleProductionOrder(ctx, "list_production_order_reference_options", "read-only-options", optionParams)
	if readOnlyOptions.Code != errcode.OK.Code {
		t.Fatalf("read_only options=%#v", readOnlyOptions)
	}
	_, readOnlySave, _ := d.handleProductionOrder(ctx, "release_production_order", "read-only-write", mustJSONRPCStruct(t, map[string]any{
		"production_order_id": float64(1), "expected_version": float64(1), "idempotency_key": "read-only-write",
	}))
	if readOnlySave.Code != errcode.InvalidParam.Code {
		t.Fatalf("read_only write=%#v", readOnlySave)
	}

	disabled := customerConfigPublishParamsWithRevisionAndModuleState(t, customerConfigPublishParams(t), "2026.07.12.production-disabled", productionOrderModuleKey, "disabled")
	activateOperationalFactTestCustomerConfig(t, d, disabled)
	_, disabledList, _ := d.handleProductionOrder(ctx, "list_production_orders", "disabled-list", mustJSONRPCStruct(t, map[string]any{}))
	if disabledList.Code != errcode.InvalidParam.Code {
		t.Fatalf("disabled list=%#v", disabledList)
	}
	_, disabledOptions, _ := d.handleProductionOrder(ctx, "list_production_order_reference_options", "disabled-options", optionParams)
	if disabledOptions.Code != errcode.InvalidParam.Code {
		t.Fatalf("disabled options=%#v", disabledOptions)
	}
}

func TestProductionOrderJSONRPCSourceTaskActionsRequireWritableWorkflowModule(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	for _, workflowState := range []string{"read_only", "disabled"} {
		t.Run(workflowState, func(t *testing.T) {
			repo := &productionOrderActionModuleGateRepo{}
			logger := log.NewStdLogger(io.Discard)
			d := &jsonrpcDispatcher{
				log:               log.NewHelper(log.With(logger, "module", "service.jsonrpc.production_order.module_gate.test")),
				adminReader:       stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, biz.PermissionPMCPlanUpdate)},
				productionOrderUC: biz.NewProductionOrderUsecase(repo),
				customerConfigUC:  biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
			}
			activateOperationalFactTestCustomerConfig(t, d, customerConfigPublishParamsWithRevisionAndModuleState(
				t,
				customerConfigPublishParams(t),
				fmt.Sprintf("2026.07.17.production-actions-workflow-%s", workflowState),
				workflowModuleKeyTasks,
				workflowState,
			))

			for _, action := range []struct {
				method string
				reason bool
			}{
				{method: "release_production_order"},
				{method: "close_production_order", reason: true},
				{method: "cancel_production_order", reason: true},
			} {
				params := map[string]any{
					"production_order_id": float64(41),
					"expected_version":    float64(3),
					"idempotency_key":     workflowState + "-" + action.method,
				}
				if action.reason {
					params["reason"] = "模块门禁契约验证"
				}
				_, result, err := d.handleProductionOrder(ctx, action.method, action.method, mustJSONRPCStruct(t, params))
				if err != nil || result == nil || result.Code != errcode.InvalidParam.Code {
					t.Fatalf("%s workflow %s gate result=%#v err=%v", action.method, workflowState, result, err)
				}
			}
			if repo.actionCalls != 0 {
				t.Fatalf("workflow %s must stop production order source-task actions before usecase, calls=%d", workflowState, repo.actionCalls)
			}
		})
	}
}

func TestProductionOrderJSONRPCFixedCustomerSuperAdminFailsClosedWithoutActiveRevision(t *testing.T) {
	d, _, _ := newProductionOrderJSONRPCTestData(t, biz.PermissionPMCPlanRead)
	d.adminReader = stubAdminAccountReader{admin: &biz.AdminUser{ID: 7, Username: "admin", IsSuperAdmin: true}}
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	_, result, _ := d.handleProductionOrder(workflowJSONRPCAdminContext(), "list_production_orders", "fixed-super", mustJSONRPCStruct(t, map[string]any{}))
	if result.Code != errcode.PermissionDenied.Code {
		t.Fatalf("fixed customer super admin without active revision=%#v", result)
	}
}

func TestMapProductionOrderErrorUsesSharedVersionConflict(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard))}
	result := d.mapProductionOrderError(context.Background(), biz.ErrProductionOrderConflict)
	if result.Code != errcode.ResourceVersionConflict.Code || result.Message != errcode.ResourceVersionConflict.Message {
		t.Fatalf("version conflict=%#v", result)
	}
	wipResult := d.mapProductionOrderError(context.Background(), biz.ErrProductionOrderWIPActive)
	if wipResult.Code != errcode.InvalidParam.Code || wipResult.Message != "仍有未结束的在制批次，请先完成对应工序、外发回仓或质量处理后再关闭生产订单" {
		t.Fatalf("active WIP=%#v", wipResult)
	}
}

func TestProductionOrderRPCLogSummaryExcludesBusinessText(t *testing.T) {
	summary := productionOrderRPCLogSummary(map[string]any{
		"production_order_id": float64(12), "expected_version": float64(3), "order_no": "MO-SECRET", "note": "客户业务备注",
		"keyword": "客户关键词", "idempotency_key": "secret-key", "items": []any{map[string]any{"note": "行备注"}},
	})
	if summary["production_order_id"] != float64(12) || summary["expected_version"] != float64(3) || summary["item_count"] != 1 || summary["idempotency_key"] != "<redacted>" {
		t.Fatalf("summary identifiers=%#v", summary)
	}
	for _, forbidden := range []string{"order_no", "note", "keyword", "items"} {
		if _, exists := summary[forbidden]; exists {
			t.Fatalf("summary leaked %s: %#v", forbidden, summary)
		}
	}
}
