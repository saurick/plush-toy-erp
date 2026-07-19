package service

import (
	"context"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type productionWIPJSONRPCRepo struct {
	biz.ProductionOrderRepo
	aggregate  *biz.ProductionWIPAggregate
	err        error
	actionCall *biz.ProductionWIPCommand
}

func (r *productionWIPJSONRPCRepo) GetProductionWIP(context.Context, int) (*biz.ProductionWIPAggregate, error) {
	return r.aggregate, r.err
}

func (r *productionWIPJSONRPCRepo) ApplyProductionWIPCommand(_ context.Context, in *biz.ProductionWIPCommand) (*biz.ProductionWIPAggregate, error) {
	if in != nil {
		copy := *in
		copy.Splits = append([]biz.ProductionWIPSplit(nil), in.Splits...)
		copy.OutsourcingAllocations = append([]biz.ProductionWIPOutsourcingAllocationInput(nil), in.OutsourcingAllocations...)
		r.actionCall = &copy
	}
	return r.aggregate, r.err
}

func productionWIPJSONRPCAggregate() *biz.ProductionWIPAggregate {
	now := time.Unix(1784246400, 0)
	routeCode := biz.ProductionWIPRoutePlushSewHandV1
	mode := biz.ProductionWIPExecutionInHouse
	fabricOperation := biz.ProductionWIPOperationFabricProcessing
	packagingVersion := "PKG-V3"
	confirmedBy := 7
	confirmedAt := now
	return &biz.ProductionWIPAggregate{
		ProductionOrderID: 1,
		ProductionOrder: &biz.ProductionOrder{
			ID: 1, OrderNo: "MO-WIP-001", Status: biz.ProductionOrderStatusReleased, Version: 2,
			CreatedBy: 7, CreatedAt: now, UpdatedAt: now,
		},
		ProductionOrderItems: []*biz.ProductionOrderItem{{
			ID: 11, ProductionOrderID: 1, LineNo: 1, ProductID: 21, UnitID: 31,
			PlannedQuantity: decimal.RequireFromString("10.5"), RouteCode: &routeCode,
			CustomerInspectionRequired: true, CreatedAt: now, UpdatedAt: now,
		}},
		MaterialRequirements: []*biz.ProductionOrderMaterialRequirement{{
			ID: 51, ProductionOrderID: 1, ProductionOrderItemID: 11, BOMHeaderID: 61, BOMItemID: 71,
			MaterialID: 81, UnitID: 31, ProductionOperationCode: &fabricOperation,
			PlannedQuantity: decimal.RequireFromString("12"), MaterialCodeSnapshot: "FAB-01", MaterialNameSnapshot: "短毛绒",
			UnitNameSnapshot: "米", CreatedAt: now, UpdatedAt: now,
		}},
		Operations: []*biz.ProductionOrderOperation{{
			ID: 101, ProductionOrderID: 1, ProductionOrderItemID: 11,
			RouteCode: routeCode, RouteVersion: 1, StepNo: 20,
			OperationCode: biz.ProductionWIPOperationSewing, ProcessID: 41,
			ProcessCodeSnapshot: "SEWING", ProcessNameSnapshot: "车缝",
			OutputCode: biz.ProductionWIPOutputShell, InhouseAllowed: true, OutsourcingAllowed: true,
			PlannedQuantity:      decimal.RequireFromString("10.5"),
			RequiredQualityGates: []string{biz.ProductionWIPQualityGateShell}, CreatedAt: now,
		}},
		Batches: []*biz.ProductionWIPBatch{{
			ID: 201, ProductionOrderID: 1, ProductionOrderItemID: 11, ProductionOrderOperationID: 101,
			BatchNo: "WIP-1-11-20-001", FlowType: biz.ProductionWIPFlowNormal,
			ExecutionMode: &mode, Status: biz.ProductionWIPStatusInProgress, Version: 3,
			Quantity: decimal.RequireFromString("10.5"), CreatedBy: 7, CreatedAt: now, UpdatedAt: now,
		}},
		PackagingConfirmations: []*biz.ProductionPackagingConfirmation{{
			ID: 301, ProductionOrderID: 1, ProductionOrderItemID: 11,
			Status: biz.ProductionPackagingConfirmationConfirmed, Version: 2,
			PackagingVersionSnapshot: &packagingVersion, ConfirmedBy: &confirmedBy, ConfirmedAt: &confirmedAt,
			CreatedAt: now, UpdatedAt: now,
		}},
		QualityInspections: []*biz.ProductionWIPQualityInspectionSummary{{
			ID: 401, ProductionWIPBatchID: 201, GateCode: biz.ProductionWIPQualityGateShell,
			Status: biz.QualityInspectionStatusPassed,
		}},
	}
}

func newProductionWIPJSONRPCTestDispatcher(t *testing.T, repo *productionWIPJSONRPCRepo, admin *biz.AdminUser) *jsonrpcDispatcher {
	t.Helper()
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:               log.NewHelper(log.With(logger, "module", "service.jsonrpc.production_wip.test")),
		adminReader:       stubAdminAccountReader{admin: admin},
		productionOrderUC: biz.NewProductionOrderUsecase(repo),
		customerConfigUC:  biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}
	activateOperationalFactTestCustomerConfig(t, dispatcher, customerConfigPublishParamsForRevision(t, "2026.07.17.production-wip"))
	return dispatcher
}

func TestProductionWIPJSONRPCCanonicalReadCancelAndSplit(t *testing.T) {
	repo := &productionWIPJSONRPCRepo{aggregate: productionWIPJSONRPCAggregate()}
	dispatcher := newProductionWIPJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin(
		[]string{biz.ProductionRoleKey, biz.SalesRoleKey},
		biz.PermissionProductionWIPRead,
		biz.PermissionProductionWIPAssign,
	))
	ctx := workflowJSONRPCAdminContext()

	_, read, err := dispatcher.handleProductionWIP(ctx, "get_production_wip", "read", mustJSONRPCStruct(t, map[string]any{
		"production_order_id": float64(1),
	}))
	if err != nil || read.Code != errcode.OK.Code {
		t.Fatalf("read result=%#v err=%v", read, err)
	}
	data := read.Data.AsMap()
	if data["production_order"].(map[string]any)["order_no"] != "MO-WIP-001" ||
		data["production_order_operations"].([]any)[0].(map[string]any)["operation_code"] != biz.ProductionWIPOperationSewing ||
		data["production_wip_batches"].([]any)[0].(map[string]any)["quantity"] != "10.5" ||
		data["material_requirements"].([]any)[0].(map[string]any)["production_operation_code"] != biz.ProductionWIPOperationFabricProcessing {
		t.Fatalf("unexpected aggregate=%#v", data)
	}

	_, removedInitialize, _ := dispatcher.handleProductionWIP(ctx, "initialize_production_wip", "initialize", mustJSONRPCStruct(t, map[string]any{}))
	if removedInitialize.Code != errcode.UnknownMethod.Code {
		t.Fatalf("removed initialize result=%#v", removedInitialize)
	}

	_, cancelled, _ := dispatcher.handleProductionWIP(ctx, "execute_production_wip_action", "cancel", mustJSONRPCStruct(t, map[string]any{
		"action": biz.ProductionWIPActionCancelBatch, "production_order_id": float64(1),
		"production_wip_batch_id": float64(201), "expected_version": float64(3), "idempotency_key": "wip-cancel-1",
		"reason": "排程取消",
	}))
	if cancelled.Code != errcode.OK.Code || repo.actionCall == nil || repo.actionCall.Action != biz.ProductionWIPActionCancelBatch ||
		repo.actionCall.Reason == nil || *repo.actionCall.Reason != "排程取消" || repo.actionCall.IntentHash == "" {
		t.Fatalf("cancel result=%#v call=%#v", cancelled, repo.actionCall)
	}

	_, split, _ := dispatcher.handleProductionWIP(ctx, "execute_production_wip_action", "split", mustJSONRPCStruct(t, map[string]any{
		"action": biz.ProductionWIPActionSplitBatch, "production_order_id": float64(1),
		"production_wip_batch_id": float64(201), "expected_version": float64(3), "idempotency_key": "wip-split-1",
		"splits": []any{map[string]any{"quantity": "4.5"}, map[string]any{"quantity": "6"}},
	}))
	if split.Code != errcode.OK.Code || repo.actionCall == nil || repo.actionCall.ActorID != 7 || len(repo.actionCall.Splits) != 2 ||
		!repo.actionCall.Splits[0].Quantity.Equal(decimal.RequireFromString("4.5")) || repo.actionCall.IntentHash == "" {
		t.Fatalf("split result=%#v call=%#v", split, repo.actionCall)
	}
}

func TestProductionWIPJSONRPCStrictActionContracts(t *testing.T) {
	repo := &productionWIPJSONRPCRepo{aggregate: productionWIPJSONRPCAggregate()}
	dispatcher := newProductionWIPJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin(
		[]string{biz.ProductionRoleKey, biz.SalesRoleKey},
		biz.PermissionProductionWIPAssign,
		biz.PermissionProductionWIPExecute,
		biz.PermissionProductionWIPRework,
		biz.PermissionPackagingMaterialConfirm,
	))
	ctx := workflowJSONRPCAdminContext()
	invalid := []map[string]any{
		{"action": "split_batch", "production_order_id": float64(1), "production_wip_batch_id": float64(201), "expected_version": float64(3), "idempotency_key": "k", "splits": []any{map[string]any{"quantity": "4"}, map[string]any{"quantity": "6.5"}}},
		{"action": biz.ProductionWIPActionSplitBatch, "production_order_id": float64(1), "production_wip_batch_id": float64(201), "expected_version": float64(3), "idempotency_key": "k", "splits": []any{map[string]any{"quantity": "10.5"}}},
		{"action": biz.ProductionWIPActionTransferToNextOperation, "production_order_id": float64(1), "production_wip_batch_id": float64(201), "target_operation_id": float64(102), "quantity": float64(10.5), "expected_version": float64(3), "idempotency_key": "k"},
		{"action": biz.ProductionWIPActionConfirmPackagingMaterial, "production_order_id": float64(1), "production_order_item_id": float64(11), "packaging_version_snapshot": "", "expected_version": float64(1), "idempotency_key": "k"},
		{"action": biz.ProductionWIPActionCancelBatch, "production_order_id": float64(1), "production_wip_batch_id": float64(201), "expected_version": float64(3), "idempotency_key": "k"},
		{"action": biz.ProductionWIPActionStartOperation, "production_order_id": float64(1), "production_wip_batch_id": float64(201), "expected_version": float64(3), "idempotency_key": "k", "actor_id": float64(99)},
	}
	for index, params := range invalid {
		_, result, _ := dispatcher.handleProductionWIP(ctx, "execute_production_wip_action", "invalid", mustJSONRPCStruct(t, params))
		if result.Code != errcode.InvalidParam.Code {
			t.Fatalf("invalid[%d] result=%#v", index, result)
		}
	}
	_, alias, _ := dispatcher.handleProductionWIP(ctx, "executeProductionWIPAction", "alias", mustJSONRPCStruct(t, map[string]any{}))
	if alias.Code != errcode.UnknownMethod.Code {
		t.Fatalf("alias result=%#v", alias)
	}
}

func TestProductionWIPJSONRPCAuthPermissionAndOutsourcingModule(t *testing.T) {
	repo := &productionWIPJSONRPCRepo{aggregate: productionWIPJSONRPCAggregate()}
	dispatcher := newProductionWIPJSONRPCTestDispatcher(t, repo, workflowJSONRPCAdmin([]string{biz.ProductionRoleKey}))
	readParams := mustJSONRPCStruct(t, map[string]any{"production_order_id": float64(1)})

	_, noLogin, _ := dispatcher.handleProductionWIP(context.Background(), "get_production_wip", "no-login", readParams)
	if noLogin.Code != errcode.AuthRequired.Code {
		t.Fatalf("no login=%#v", noLogin)
	}
	nonAdminCtx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 7, Username: "admin", Role: biz.RoleUser})
	_, nonAdmin, _ := dispatcher.handleProductionWIP(nonAdminCtx, "get_production_wip", "non-admin", readParams)
	if nonAdmin.Code != errcode.AdminRequired.Code {
		t.Fatalf("non admin=%#v", nonAdmin)
	}
	_, denied, _ := dispatcher.handleProductionWIP(workflowJSONRPCAdminContext(), "get_production_wip", "denied", readParams)
	if denied.Code != errcode.PermissionDenied.Code {
		t.Fatalf("denied=%#v", denied)
	}

	dispatcher.adminReader = stubAdminAccountReader{admin: workflowJSONRPCAdmin(
		[]string{biz.ProductionRoleKey},
		biz.PermissionProductionWIPAssign,
		biz.PermissionProductionWIPRead,
		biz.PermissionOutsourcingOrderRead,
	)}
	assignParams := mustJSONRPCStruct(t, map[string]any{
		"action": biz.ProductionWIPActionAssignExecution, "production_order_id": float64(1),
		"production_wip_batch_id": float64(201), "expected_version": float64(3), "idempotency_key": "assign-outsourced-1",
		"execution_mode":          biz.ProductionWIPExecutionOutsourced,
		"outsourcing_allocations": []any{map[string]any{"outsourcing_order_item_id": float64(501)}},
	})
	_, moduleDenied, _ := dispatcher.handleProductionWIP(workflowJSONRPCAdminContext(), "execute_production_wip_action", "module-denied", assignParams)
	if moduleDenied.Code != errcode.InvalidParam.Code || repo.actionCall != nil {
		t.Fatalf("module denied=%#v call=%#v", moduleDenied, repo.actionCall)
	}

	enabled := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParamsForRevision(t, "2026.07.17.production-wip-outsourcing"),
		"2026.07.17.production-wip-outsourcing",
		"outsourcing_orders",
		"enabled",
	)
	activateOperationalFactTestCustomerConfig(t, dispatcher, enabled)
	_, assigned, _ := dispatcher.handleProductionWIP(workflowJSONRPCAdminContext(), "execute_production_wip_action", "assigned", assignParams)
	if assigned.Code != errcode.OK.Code || repo.actionCall == nil || repo.actionCall.ExecutionMode != biz.ProductionWIPExecutionOutsourced ||
		len(repo.actionCall.OutsourcingAllocations) != 1 || repo.actionCall.OutsourcingAllocations[0].OutsourcingOrderItemID != 501 {
		t.Fatalf("assigned=%#v call=%#v", assigned, repo.actionCall)
	}

	dispatcher.adminReader = stubAdminAccountReader{admin: &biz.AdminUser{ID: 7, Username: "admin", IsSuperAdmin: true}}
	_, superRead, _ := dispatcher.handleProductionWIP(workflowJSONRPCAdminContext(), "get_production_wip", "super", readParams)
	if superRead.Code != errcode.OK.Code {
		t.Fatalf("super read=%#v", superRead)
	}
}

func TestProductionWIPPackagingConfirmationDoesNotDependOnQualityModule(t *testing.T) {
	_, modules, allowed, ok := productionWIPActionContract(biz.ProductionWIPActionConfirmPackagingMaterial)
	if !ok || len(modules) != 1 || modules[0] != productionOrderModuleKey {
		t.Fatalf("modules=%v ok=%v", modules, ok)
	}
	for _, field := range allowed {
		if field == "quality_inspections" {
			t.Fatalf("quality module leaked into allowed fields: %v", allowed)
		}
	}
}

func TestProductionWIPJSONRPCDistinguishesAllocationAndMaterialIssueErrors(t *testing.T) {
	dispatcher := newProductionWIPJSONRPCTestDispatcher(t, &productionWIPJSONRPCRepo{}, workflowJSONRPCAdmin([]string{biz.ProductionRoleKey}))
	allocation := dispatcher.mapProductionWIPError(context.Background(), biz.ErrProductionWIPOutsourcingAllocationInvalid)
	issue := dispatcher.mapProductionWIPError(context.Background(), biz.ErrProductionWIPOutsourcingMaterialIssuePending)
	if allocation.Code != errcode.InvalidParam.Code || issue.Code != errcode.InvalidParam.Code || allocation.Message == issue.Message ||
		issue.Message != "布料加工材料尚未完成外发发料，不能开工" {
		t.Fatalf("allocation=%#v issue=%#v", allocation, issue)
	}
}
