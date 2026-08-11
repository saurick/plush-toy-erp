package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorylotstatusevent"
	"server/internal/data/model/ent/sourceorderlifecycleevent"
	"server/internal/data/model/ent/workflowtaskevent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestSourceOrderLifecyclePostgresCancellationResolvesActiveProcessAndKeepsLineEvidence(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	salesRepo := NewSalesOrderRepo(data, logger)
	processRepo := NewProcessRuntimeRepo(data, logger)
	workflowRepo := NewWorkflowRepo(data, logger)
	suffix := postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, "SRC-CANCEL-U-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "SRC-CANCEL-P-"+suffix)
	customer := createSalesOrderTestCustomer(t, ctx, client, "SRC-CANCEL-C-"+suffix, true)
	order := client.SalesOrder.Create().
		SetOrderNo("SO-SRC-CANCEL-" + suffix).
		SetCustomerID(customer.ID).
		SetOrderDate(time.Now().UTC()).
		SetLifecycleStatus(biz.SalesOrderStatusActive).
		SaveX(ctx)
	line := client.SalesOrderItem.Create().
		SetSalesOrderID(order.ID).
		SetLineNo(1).
		SetProductID(product.ID).
		SetUnitID(unit.ID).
		SetOrderedQuantity(decimal.NewFromInt(10)).
		SaveX(ctx)
	instance, nodes, err := processRepo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      biz.ProcessKeySalesOrderAcceptance,
		ProcessVersion:  "v1",
		ConfigRevision:  "source-cancel-test",
		DefinitionHash:  "sha256:source-cancel-" + suffix,
		BusinessRefType: "sales_order",
		BusinessRefID:   order.ID,
		IdempotencyKey:  "source-cancel-process/" + suffix,
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{{
			NodeKey: "approval", NodeType: biz.ProcessNodeTypeApproval,
			Attempt: 1, Status: biz.ProcessNodeStatusWaiting,
		}},
	}, 7)
	if err != nil {
		t.Fatalf("create active source process: %v", err)
	}
	activeNode := activateProcessNodeForTest(t, ctx, processRepo, instance, nodes[0])
	linkedTask, err := workflowRepo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode: "WF-SRC-CANCEL-" + suffix, TaskGroup: "source-cancel-test", TaskName: "待系统撤回审批",
		SourceType: "sales_order", SourceID: order.ID, TaskStatusKey: "ready", OwnerRoleKey: biz.SalesRoleKey,
		ProcessInstanceID: &instance.ID, ProcessNodeInstanceID: &activeNode.ID, Payload: map[string]any{},
	}, 7)
	if err != nil {
		t.Fatalf("create linked source task: %v", err)
	}
	action, err := biz.NormalizeSourceOrderLifecycleAction(biz.SourceOrderLifecycleAction{
		ID: order.ID, ExpectedVersion: order.Version,
		IdempotencyKey: "sales-cancel/" + suffix,
		Reason:         "客户取消订单",
		ActorID:        7,
	}, biz.SourceOrderActionCancel)
	if err != nil {
		t.Fatalf("normalize cancel action: %v", err)
	}
	cancelled, err := salesRepo.ApplySalesOrderLifecycleAction(ctx, &action, biz.SalesOrderStatusCanceled)
	if err != nil {
		t.Fatalf("cancel source with active process: %v", err)
	}
	if cancelled.LifecycleStatus != biz.SalesOrderStatusCanceled || cancelled.Version != order.Version+1 ||
		cancelled.SettlementReason == nil || *cancelled.SettlementReason != action.Reason {
		t.Fatalf("cancelled source evidence=%#v", cancelled)
	}
	storedLine := client.SalesOrderItem.GetX(ctx, line.ID)
	if storedLine.LineStatus != biz.SalesOrderItemStatusCanceled {
		t.Fatalf("line status=%s, want canceled", storedLine.LineStatus)
	}
	resolved, err := processRepo.GetProcessInstance(ctx, instance.ID)
	if err != nil || resolved.Status != biz.ProcessStatusCompleted || resolved.ResolutionKind == nil ||
		*resolved.ResolutionKind != biz.ProcessResolutionCancelled {
		t.Fatalf("resolved process=%#v err=%v", resolved, err)
	}
	withdrawn, err := processRepo.GetProcessNodeInstance(ctx, activeNode.ID)
	if err != nil || withdrawn.Status != biz.ProcessNodeStatusWithdrawn {
		t.Fatalf("withdrawn node=%#v err=%v", withdrawn, err)
	}
	withdrawnTask, err := workflowRepo.GetWorkflowTask(ctx, linkedTask.ID)
	if err != nil || withdrawnTask.TaskStatusKey != "withdrawn" || withdrawnTask.BlockedReason == nil ||
		*withdrawnTask.BlockedReason != action.Reason {
		t.Fatalf("withdrawn task=%#v err=%v", withdrawnTask, err)
	}
	withdrawEvent := client.WorkflowTaskEvent.Query().Where(
		workflowtaskevent.TaskID(linkedTask.ID),
		workflowtaskevent.EventType("source_cancelled_withdrawal"),
	).OnlyX(ctx)
	if withdrawEvent.ToStatusKey == nil || *withdrawEvent.ToStatusKey != "withdrawn" || withdrawEvent.Reason == nil ||
		*withdrawEvent.Reason != action.Reason {
		t.Fatalf("withdraw task event=%#v", withdrawEvent)
	}
	event := client.SourceOrderLifecycleEvent.Query().Where(
		sourceorderlifecycleevent.SourceType("sales_order"),
		sourceorderlifecycleevent.SourceID(order.ID),
	).OnlyX(ctx)
	if event.ResultContract != sourceOrderLifecycleResultContract || event.ActionKey != biz.SourceOrderActionCancel {
		t.Fatalf("source receipt=%#v", event)
	}
	assertSourceOrderLineResult(t, event.MutationResult, line.ID, "10", "0", "10", biz.SalesOrderItemStatusCanceled)
}

func TestProcessRuntimePostgresReconciliationKeepsCompletedUnroutedWorkflowNodeVisible(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	processRepo := NewProcessRuntimeRepo(data, logger)
	workflowRepo := NewWorkflowRepo(data, logger)
	suffix := postgresTestSuffix()
	instance, nodes, err := processRepo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      biz.ProcessKeySalesOrderAcceptance,
		ProcessVersion:  "v1",
		ConfigRevision:  "workflow-reconcile-test",
		DefinitionHash:  "sha256:workflow-reconcile-" + suffix,
		BusinessRefType: "sales_order",
		BusinessRefID:   900000 + int(time.Now().UnixNano()%99999),
		IdempotencyKey:  "workflow-reconcile/" + suffix,
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{{
			NodeKey: "approval", NodeType: biz.ProcessNodeTypeApproval,
			Attempt: 1, Status: biz.ProcessNodeStatusWaiting,
		}},
	}, 11)
	if err != nil {
		t.Fatalf("create process: %v", err)
	}
	active := activateProcessNodeForTest(t, ctx, processRepo, instance, nodes[0])
	completed, err := processRepo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
		ID: active.ID, ProcessInstanceID: instance.ID, ExpectedVersion: active.Version, Outcome: "approved",
	}, 11)
	if err != nil {
		t.Fatalf("complete workflow node before routing: %v", err)
	}
	now := time.Now().UTC()
	task := client.WorkflowTask.Create().
		SetTaskCode("WF-RECONCILE-" + suffix).
		SetTaskGroup("process_runtime").
		SetTaskName("流程对账测试").
		SetSourceType("sales_order").
		SetSourceID(instance.BusinessRefID).
		SetTaskStatusKey("done").
		SetOwnerRoleKey("boss").
		SetProcessInstanceID(instance.ID).
		SetProcessNodeInstanceID(completed.ID).
		SetCompletedAt(now).
		SetCreatedBy(11).
		SetUpdatedBy(11).
		SaveX(ctx)

	candidates, err := workflowRepo.ListPendingLinkedWorkflowTaskSettlements(ctx, task.ID-1, 10)
	if err != nil {
		t.Fatalf("list completed-but-unrouted workflow candidate: %v", err)
	}
	if len(candidates) != 1 || candidates[0].ID != task.ID {
		t.Fatalf("candidates=%#v, want task %d", candidates, task.ID)
	}
	if _, err := processRepo.MarkProcessNodeRoutingCompleted(ctx, &biz.ProcessNodeRoutingCompletion{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: completed.ID,
	}, 11); err != nil {
		t.Fatalf("mark routing receipt: %v", err)
	}
	candidates, err = workflowRepo.ListPendingLinkedWorkflowTaskSettlements(ctx, task.ID-1, 10)
	if err != nil {
		t.Fatalf("list after routing receipt: %v", err)
	}
	if len(candidates) != 0 {
		t.Fatalf("routed task must leave reconciliation queue, got %#v", candidates)
	}
}

func TestProcessRuntimePostgresSalesApprovalRejectionTerminatesSourceAndProcess(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	processRepo := NewProcessRuntimeRepo(data, logger)
	workflowRepo := NewWorkflowRepo(data, logger)
	salesRepo := NewSalesOrderRepo(data, logger)
	suffix := postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, "SALES-REJECT-U-"+suffix)
	product := createTestProduct(t, ctx, client, unit.ID, "SALES-REJECT-P-"+suffix)
	customer := createSalesOrderTestCustomer(t, ctx, client, "SALES-REJECT-C-"+suffix, true)
	order := client.SalesOrder.Create().
		SetOrderNo("SO-REJECT-" + suffix).
		SetCustomerID(customer.ID).
		SetOrderDate(time.Now().UTC()).
		SetLifecycleStatus(biz.SalesOrderStatusSubmitted).
		SaveX(ctx)
	line := client.SalesOrderItem.Create().
		SetSalesOrderID(order.ID).
		SetLineNo(1).
		SetProductID(product.ID).
		SetUnitID(unit.ID).
		SetOrderedQuantity(decimal.NewFromInt(4)).
		SaveX(ctx)
	instance, nodes, err := processRepo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      biz.ProcessKeySalesOrderAcceptance,
		ProcessVersion:  "v1",
		ConfigRevision:  "sales-reject-test",
		DefinitionHash:  "sha256:sales-reject-" + suffix,
		BusinessRefType: "sales_order",
		BusinessRefID:   order.ID,
		IdempotencyKey:  "sales-reject-process/" + suffix,
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey: "order_approval", NodeType: biz.ProcessNodeTypeApproval, Attempt: 1,
				Status:         biz.ProcessNodeStatusWaiting,
				PolicySnapshot: map[string]any{"branch_policy_key": biz.ProcessBranchPolicySalesOrderApproval},
			},
			{
				NodeKey: "reject_sales_order", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1,
				Status: biz.ProcessNodeStatusWaiting,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandSalesOrderReject, "execute_after_approval": true,
				},
			},
			{NodeKey: "sales_order_rejected_end", NodeType: biz.ProcessNodeTypeEnd, Attempt: 1, Status: biz.ProcessNodeStatusWaiting},
		},
	}, 13)
	if err != nil {
		t.Fatalf("create sales rejection process: %v", err)
	}
	approval := activateProcessNodeForTest(t, ctx, processRepo, instance, nodes[0])
	reason := "审批资料不完整"
	task := client.WorkflowTask.Create().
		SetTaskCode("SALES-REJECT-TASK-" + suffix).
		SetTaskGroup("sales_order_acceptance").
		SetTaskName("销售订单审批").
		SetSourceType("sales_order").
		SetSourceID(order.ID).
		SetTaskStatusKey("rejected").
		SetOwnerRoleKey("boss").
		SetBlockedReason(reason).
		SetProcessInstanceID(instance.ID).
		SetProcessNodeInstanceID(approval.ID).
		SetCompletedAt(time.Now().UTC()).
		SetCreatedBy(13).
		SetUpdatedBy(13).
		SaveX(ctx)
	runtimeUC := biz.NewProcessRuntimeUsecase(processRepo, workflowRepo)
	if err := biz.RegisterExceptionApprovalProcessBranchPolicyHandlers(runtimeUC); err != nil {
		t.Fatalf("register approval branches: %v", err)
	}
	if err := biz.RegisterSalesOrderProcessDomainCommandHandlers(runtimeUC, biz.NewSalesOrderUsecase(salesRepo)); err != nil {
		t.Fatalf("register sales process commands: %v", err)
	}
	if _, err := runtimeUC.CompleteLinkedWorkflowTask(ctx, &biz.ProcessLinkedWorkflowTaskCompletion{WorkflowTaskID: task.ID}, 13); err != nil {
		t.Fatalf("settle rejected sales approval: %v", err)
	}
	storedOrder := client.SalesOrder.GetX(ctx, order.ID)
	if storedOrder.LifecycleStatus != biz.SalesOrderStatusCanceled || storedOrder.SettlementAction == nil ||
		*storedOrder.SettlementAction != biz.SourceOrderSettlementActionWorkflowReject || storedOrder.SettlementReason == nil ||
		*storedOrder.SettlementReason != reason {
		t.Fatalf("rejected sales order=%#v", storedOrder)
	}
	if got := client.SalesOrderItem.GetX(ctx, line.ID).LineStatus; got != biz.SalesOrderItemStatusCanceled {
		t.Fatalf("rejected sales line status=%s", got)
	}
	resolved := client.ProcessInstance.GetX(ctx, instance.ID)
	if resolved.Status != biz.ProcessStatusCompleted || resolved.ResolutionKind == nil ||
		*resolved.ResolutionKind != biz.ProcessResolutionRejected {
		t.Fatalf("rejected sales process=%#v", resolved)
	}
}

func TestProcessRuntimePostgresPurchaseApprovalRejectionTerminatesSourceAndProcess(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	processRepo := NewProcessRuntimeRepo(data, logger)
	workflowRepo := NewWorkflowRepo(data, logger)
	purchaseRepo := NewPurchaseOrderRepo(data, logger)
	suffix := postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, "PURCHASE-REJECT-U-"+suffix)
	material := createTestMaterial(t, ctx, client, unit.ID, "PURCHASE-REJECT-M-"+suffix)
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "PURCHASE-REJECT-S-"+suffix, true)
	order := client.PurchaseOrder.Create().
		SetPurchaseOrderNo("PO-REJECT-" + suffix).
		SetSupplierID(supplier.ID).
		SetPurchaseDate(time.Now().UTC()).
		SetLifecycleStatus(biz.PurchaseOrderStatusSubmitted).
		SaveX(ctx)
	line := client.PurchaseOrderItem.Create().
		SetPurchaseOrderID(order.ID).
		SetLineNo(1).
		SetMaterialID(material.ID).
		SetUnitID(unit.ID).
		SetPurchasedQuantity(decimal.NewFromInt(6)).
		SaveX(ctx)
	instance, nodes, err := processRepo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      biz.ProcessKeyMaterialSupply,
		ProcessVersion:  "v1",
		ConfigRevision:  "purchase-reject-test",
		DefinitionHash:  "sha256:purchase-reject-" + suffix,
		BusinessRefType: "purchase_order",
		BusinessRefID:   order.ID,
		IdempotencyKey:  "purchase-reject-process/" + suffix,
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey: "purchase_order_approval", NodeType: biz.ProcessNodeTypeApproval, Attempt: 1,
				Status:         biz.ProcessNodeStatusWaiting,
				PolicySnapshot: map[string]any{"branch_policy_key": biz.ProcessBranchPolicyPurchaseOrderApproval},
			},
			{
				NodeKey: "reject_purchase_order", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1,
				Status: biz.ProcessNodeStatusWaiting,
				PolicySnapshot: map[string]any{
					"command_key": biz.ProcessDomainCommandPurchaseOrderReject, "execute_after_approval": true,
				},
			},
			{NodeKey: "purchase_order_rejected_end", NodeType: biz.ProcessNodeTypeEnd, Attempt: 1, Status: biz.ProcessNodeStatusWaiting},
		},
	}, 14)
	if err != nil {
		t.Fatalf("create purchase rejection process: %v", err)
	}
	approval := activateProcessNodeForTest(t, ctx, processRepo, instance, nodes[0])
	reason := "采购条件未获批准"
	task := client.WorkflowTask.Create().
		SetTaskCode("PURCHASE-REJECT-TASK-" + suffix).
		SetTaskGroup("material_supply").
		SetTaskName("采购订单审批").
		SetSourceType("purchase_order").
		SetSourceID(order.ID).
		SetTaskStatusKey("rejected").
		SetOwnerRoleKey("boss").
		SetBlockedReason(reason).
		SetProcessInstanceID(instance.ID).
		SetProcessNodeInstanceID(approval.ID).
		SetCompletedAt(time.Now().UTC()).
		SetCreatedBy(14).
		SetUpdatedBy(14).
		SaveX(ctx)
	runtimeUC := biz.NewProcessRuntimeUsecase(processRepo, workflowRepo)
	if err := biz.RegisterExceptionApprovalProcessBranchPolicyHandlers(runtimeUC); err != nil {
		t.Fatalf("register approval branches: %v", err)
	}
	if err := biz.RegisterPurchaseOrderProcessDomainCommandHandlers(runtimeUC, biz.NewPurchaseOrderUsecase(purchaseRepo)); err != nil {
		t.Fatalf("register purchase process commands: %v", err)
	}
	if _, err := runtimeUC.CompleteLinkedWorkflowTask(ctx, &biz.ProcessLinkedWorkflowTaskCompletion{WorkflowTaskID: task.ID}, 14); err != nil {
		t.Fatalf("settle rejected purchase approval: %v", err)
	}
	storedOrder := client.PurchaseOrder.GetX(ctx, order.ID)
	if storedOrder.LifecycleStatus != biz.PurchaseOrderStatusCanceled || storedOrder.SettlementAction == nil ||
		*storedOrder.SettlementAction != biz.SourceOrderSettlementActionWorkflowReject || storedOrder.SettlementReason == nil ||
		*storedOrder.SettlementReason != reason {
		t.Fatalf("rejected purchase order=%#v", storedOrder)
	}
	if got := client.PurchaseOrderItem.GetX(ctx, line.ID).LineStatus; got != biz.PurchaseOrderItemStatusCanceled {
		t.Fatalf("rejected purchase line status=%s", got)
	}
	resolved := client.ProcessInstance.GetX(ctx, instance.ID)
	if resolved.Status != biz.ProcessStatusCompleted || resolved.ResolutionKind == nil ||
		*resolved.ResolutionKind != biz.ProcessResolutionRejected {
		t.Fatalf("rejected purchase process=%#v", resolved)
	}
}

func TestSourceOrderLifecyclePostgresNormalAndShortCloseContracts(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	repo := NewPurchaseOrderRepo(data, logger)
	suffix := postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, "SRC-CLOSE-U-"+suffix)
	material := createTestMaterial(t, ctx, client, unit.ID, "SRC-CLOSE-M-"+suffix)
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "SRC-CLOSE-S-"+suffix, true)
	order := client.PurchaseOrder.Create().
		SetPurchaseOrderNo("PO-SRC-CLOSE-" + suffix).
		SetSupplierID(supplier.ID).
		SetPurchaseDate(time.Now().UTC()).
		SetLifecycleStatus(biz.PurchaseOrderStatusApproved).
		SaveX(ctx)
	line := client.PurchaseOrderItem.Create().
		SetPurchaseOrderID(order.ID).
		SetLineNo(1).
		SetMaterialID(material.ID).
		SetUnitID(unit.ID).
		SetPurchasedQuantity(decimal.NewFromInt(10)).
		SaveX(ctx)
	normal, err := biz.NormalizeSourceOrderLifecycleAction(biz.SourceOrderLifecycleAction{
		ID: order.ID, ExpectedVersion: order.Version,
		IdempotencyKey: "purchase-normal-close/" + suffix,
		CloseMode:      biz.SourceOrderCloseModeNormal,
		ActorID:        9,
	}, biz.SourceOrderActionClose)
	if err != nil {
		t.Fatalf("normalize normal close: %v", err)
	}
	if _, err := repo.ApplyPurchaseOrderLifecycleAction(ctx, &normal, biz.PurchaseOrderStatusClosed); !errors.Is(err, biz.ErrSourceOrderNormalCloseIncomplete) {
		t.Fatalf("normal close without receipt error=%v", err)
	}
	short, err := biz.NormalizeSourceOrderLifecycleAction(biz.SourceOrderLifecycleAction{
		ID: order.ID, ExpectedVersion: order.Version,
		IdempotencyKey: "purchase-short-close/" + suffix,
		CloseMode:      biz.SourceOrderCloseModeShort,
		Reason:         "供应商无法继续交付",
		ActorID:        9,
	}, biz.SourceOrderActionClose)
	if err != nil {
		t.Fatalf("normalize short close: %v", err)
	}
	closed, err := repo.ApplyPurchaseOrderLifecycleAction(ctx, &short, biz.PurchaseOrderStatusClosed)
	if err != nil {
		t.Fatalf("short close: %v", err)
	}
	if closed.LifecycleStatus != biz.PurchaseOrderStatusClosed || closed.SettlementMode == nil ||
		*closed.SettlementMode != biz.SourceOrderCloseModeShort {
		t.Fatalf("closed purchase order=%#v", closed)
	}
	if replay, err := repo.ApplyPurchaseOrderLifecycleAction(ctx, &short, biz.PurchaseOrderStatusClosed); err != nil || replay.ID != order.ID {
		t.Fatalf("same close replay=%#v err=%v", replay, err)
	}
	if got := client.SourceOrderLifecycleEvent.Query().Where(
		sourceorderlifecycleevent.SourceType("purchase_order"),
		sourceorderlifecycleevent.SourceID(order.ID),
	).CountX(ctx); got != 1 {
		t.Fatalf("receipt count=%d, want 1", got)
	}
	event := client.SourceOrderLifecycleEvent.Query().Where(
		sourceorderlifecycleevent.SourceType("purchase_order"),
		sourceorderlifecycleevent.SourceID(order.ID),
	).OnlyX(ctx)
	assertSourceOrderLineResult(t, event.MutationResult, line.ID, "10", "0", "10", biz.PurchaseOrderItemStatusClosed)
}

func TestInventoryLotStatusPostgresQualityDecisionWritesNamedEvidence(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	suffix := postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, "LOT-EVIDENCE-U-"+suffix)
	material := createTestMaterial(t, ctx, client, unit.ID, "LOT-EVIDENCE-M-"+suffix)
	warehouse := createTestWarehouse(t, ctx, client, "LOT-EVIDENCE-W-"+suffix)
	actor := client.AdminUser.Create().SetUsername("lot-evidence-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	lot := client.InventoryLot.Create().
		SetSubjectType(biz.InventorySubjectMaterial).
		SetSubjectID(material.ID).
		SetLotNo("LOT-EVIDENCE-" + suffix).
		SetStatus(biz.InventoryLotHold).
		SaveX(ctx)
	inspection := client.QualityInspection.Create().
		SetInspectionNo("QI-LOT-EVIDENCE-" + suffix).
		SetInventoryLotID(lot.ID).
		SetMaterialID(material.ID).
		SetWarehouseID(warehouse.ID).
		SetStatus(biz.QualityInspectionStatusSubmitted).
		SetOriginalLotStatus(biz.InventoryLotActive).
		SaveX(ctx)
	operator := biz.QualityInspectionDefectRateOperatorGT
	percent := decimal.NewFromInt(50)
	if _, err := uc.RejectQualityInspection(ctx, &biz.QualityInspectionDecision{
		InspectionID: inspection.ID, Result: biz.QualityInspectionResultReject,
		InspectorID: &actor.ID, DefectRateOperator: &operator, DefectRatePercent: &percent,
		DecisionNote: processTestStringPointer("抽检不合格"),
	}); err != nil {
		t.Fatalf("reject quality inspection: %v", err)
	}
	event := client.InventoryLotStatusEvent.Query().Where(
		inventorylotstatusevent.InventoryLotID(lot.ID),
	).OnlyX(ctx)
	if event.ActionKey != biz.InventoryLotActionRejectFromQuality || event.QualityInspectionID == nil ||
		*event.QualityInspectionID != inspection.ID || event.ActorID == nil || *event.ActorID != actor.ID ||
		event.FromStatus != biz.InventoryLotHold || event.ToStatus != biz.InventoryLotRejected {
		t.Fatalf("lot status evidence=%#v", event)
	}
}

func TestOutsourcingNormalClosePostgresCountsOnlyReturnReceipts(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	suffix := postgresTestSuffix()
	unit := createTestUnit(t, ctx, client, "OUT-CLOSE-U-"+suffix)
	material := createTestMaterial(t, ctx, client, unit.ID, "OUT-CLOSE-M-"+suffix)
	warehouse := createTestWarehouse(t, ctx, client, "OUT-CLOSE-W-"+suffix)
	supplier := createPurchaseOrderTestSupplier(t, ctx, client, "OUT-CLOSE-S-"+suffix, true)
	process := client.Process.Create().
		SetCode("OUT-CLOSE-PROC-" + suffix).
		SetName("外协测试工序").
		SetCategory("测试").
		SetOutsourcingEnabled(true).
		SaveX(ctx)
	actor := client.AdminUser.Create().SetUsername("out-close-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	order := client.OutsourcingOrder.Create().
		SetOutsourcingOrderNo("OUT-CLOSE-" + suffix).
		SetSupplierID(supplier.ID).
		SetOrderDate(time.Now().UTC()).
		SetLifecycleStatus(biz.OutsourcingOrderStatusConfirmed).
		SaveX(ctx)
	line := client.OutsourcingOrderItem.Create().
		SetOutsourcingOrderID(order.ID).
		SetLineNo(1).
		SetSubjectType(biz.InventorySubjectMaterial).
		SetMaterialID(material.ID).
		SetProcessID(process.ID).
		SetUnitID(unit.ID).
		SetOutsourcingQuantity(decimal.NewFromInt(10)).
		SaveX(ctx)
	createPostedFact := func(factNo string, factType string) {
		t.Helper()
		fact := client.OutsourcingFact.Create().
			SetFactNo(factNo).
			SetFactType(factType).
			SetSubjectType(biz.InventorySubjectMaterial).
			SetSubjectID(material.ID).
			SetWarehouseID(warehouse.ID).
			SetUnitID(unit.ID).
			SetQuantity(decimal.NewFromInt(10)).
			SetSourceType(biz.OutsourcingOrderSourceType).
			SetSourceID(order.ID).
			SetSourceLineID(line.ID).
			SetIdempotencyKey(factNo).
			SaveX(ctx)
		if _, err := data.sqldb.ExecContext(ctx,
			`UPDATE outsourcing_facts SET status = 'POSTED', posted_at = $1, posted_by = $2 WHERE id = $3`,
			time.Now().UTC(), actor.ID, fact.ID,
		); err != nil {
			t.Fatalf("post outsourcing fact fixture: %v", err)
		}
	}
	createPostedFact("OUT-MATERIAL-"+suffix, biz.OutsourcingFactMaterialIssue)
	if err := validateOutsourcingOrderFullySettled(ctx, client, order.ID); !errors.Is(err, biz.ErrSourceOrderNormalCloseIncomplete) {
		t.Fatalf("material issue must not satisfy return quantity, got %v", err)
	}
	createPostedFact("OUT-RETURN-"+suffix, biz.OutsourcingFactReturnReceipt)
	if err := validateOutsourcingOrderFullySettled(ctx, client, order.ID); err != nil {
		t.Fatalf("posted return receipt should satisfy return quantity: %v", err)
	}
}

func assertSourceOrderLineResult(
	t *testing.T,
	result map[string]any,
	lineID int,
	planned string,
	fulfilled string,
	remaining string,
	status string,
) {
	t.Helper()
	rawLines, ok := result["lines"].([]any)
	if !ok || len(rawLines) != 1 {
		t.Fatalf("line results=%#v", result["lines"])
	}
	line, ok := rawLines[0].(map[string]any)
	if !ok || int(line["line_id"].(float64)) != lineID || line["planned_quantity"] != planned ||
		line["fulfilled_quantity"] != fulfilled || line["remaining_quantity"] != remaining || line["terminal_status"] != status {
		t.Fatalf("line result=%#v", rawLines[0])
	}
}

func processTestStringPointer(value string) *string {
	return &value
}
