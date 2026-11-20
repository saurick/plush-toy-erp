package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/productionwipbatch"
	"server/internal/data/model/ent/qualityinspection"
)

func TestProductionExceptionBranchesKeepStockAndSupplierHistory(t *testing.T) {
	for _, kind := range []string{biz.ProductionExceptionScrap, biz.ProductionExceptionReworkOriginal, biz.ProductionExceptionReworkSwitch, biz.ProductionExceptionRemake} {
		t.Run(kind, func(t *testing.T) {
			ctx := context.Background()
			f := openProductionOrderRepoTest(t, "exception_execution_"+kind)
			createProductionWIPRouteProcesses(t, ctx, f.client)
			flow := releaseProductionWIPRoute(t, ctx, f, "EX-BRANCH-"+kind, 10, false)
			flow, handwork := acceptProductionHandworkBatchForReworkTest(t, ctx, f.client, f.uc, f.actorID, flow, "branch-"+kind)
			source := f.client.ProductionWIPBatch.UpdateOneID(handwork.ID).SetStatus(biz.ProductionWIPStatusWaitingQuality).SaveX(ctx)
			operation := f.client.ProductionOrderOperation.GetX(ctx, source.ProductionOrderOperationID)
			if err := ensureProductionWIPQualityDraft(ctx, f.client, source, operation); err != nil {
				t.Fatal(err)
			}
			warehouse := createTestProductWarehouse(t, ctx, f.client, "EX-WH-"+kind)
			repo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
			uc := biz.NewOperationalFactUsecase(repo)
			lot := "EX-LOT-" + kind
			receipt, err := uc.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{FactNo: "EX-RCV-" + kind, ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: source.ProductionOrderItemID, ProductionWIPBatchID: source.ID, WarehouseID: warehouse.ID, NewLotNo: &lot, Quantity: decimal.NewFromInt(6), IdempotencyKey: "ex-rcv-" + kind})
			if err != nil {
				t.Fatal(err)
			}
			if _, err = uc.PostProductionFact(ctx, operationalFactStatusMutation(receipt.ID, receipt.Version, f.actorID, "")); err != nil {
				t.Fatal(err)
			}
			inspection := f.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(source.ID)).OnlyX(ctx)
			quality := biz.NewInventoryUsecase(NewInventoryRepo(f.data, log.NewStdLogger(io.Discard)))
			if _, err = quality.SubmitQualityInspection(ctx, inspection.ID); err != nil {
				t.Fatal(err)
			}
			if _, err = quality.RejectQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultReject)); err != nil {
				t.Fatal(err)
			}
			if _, err = uc.CreateProductionReworkFromCompletion(ctx, &biz.ProductionReworkFromCompletionCreate{FactNo: "BYPASS-" + kind, SourceCompletionFactID: receipt.ID, Quantity: decimal.NewFromInt(1), IdempotencyKey: "bypass-" + kind, Reason: "不得绕过异常决策"}); !errors.Is(err, biz.ErrProductionReworkSourceState) {
				t.Fatalf("failed IQC allowed direct stock rework: %v", err)
			}
			input := &biz.ProductionExceptionSubmit{DecisionNo: "EX-DECISION-" + kind, DecisionType: kind, ProductionWIPBatchID: &source.ID, QualityInspectionID: &inspection.ID, RequestedQuantity: source.Quantity, Reason: "颜色及尺寸不符合要求", IdempotencyKey: "ex-submit-" + kind, RequestedBy: f.actorID}
			vendor := f.client.Supplier.Create().SetCode("EX-VENDOR-" + kind).SetName("新加工厂").SetSupplierType("outsourcing").SaveX(ctx)
			if biz.ProductionExceptionCreatesBatch(kind) {
				input.TargetOperationID = &operation.ID
				if kind == biz.ProductionExceptionRemake {
					input.TargetOperationID = &productionWIPOperationForCode(t, flow, biz.ProductionWIPOperationFabricProcessing).ID
				}
				if kind != biz.ProductionExceptionReworkOriginal {
					input.TargetSupplierID = &vendor.ID
				}
			}
			decision, err := uc.SubmitProductionException(ctx, input)
			if err != nil {
				t.Fatal(err)
			}
			approver := f.client.AdminUser.Create().SetUsername("exception-approver-" + kind).SetPasswordHash("test-password-hash").SaveX(ctx)
			approved, err := repo.decideProductionException(ctx, &biz.ProductionExceptionMutation{WarehouseScope: &biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}, ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID, Reason: "批准处置"}, biz.ProductionExceptionApproved, nil, nil)
			if err != nil {
				t.Fatal(err)
			}
			command := &biz.ProductionExceptionMutation{WarehouseScope: &biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}, ID: approved.ID, ExpectedVersion: approved.Version, ActorID: f.actorID, Reason: "按方案处理此批货"}
			for _, scope := range []*biz.WarehouseDataScope{nil, {Mode: biz.DataScopeModeNone}, {Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{warehouse.ID + 10000}}} {
				denied := *command
				denied.WarehouseScope = scope
				if _, err = repo.executeProductionException(ctx, &denied, nil, nil); !errors.Is(err, biz.ErrNoPermission) && !errors.Is(err, biz.ErrDataScopeForbidden) {
					t.Fatalf("invalid warehouse scope applied stock disposition: %v", err)
				}
			}
			oldNodeCommand := *command
			if _, err = repo.executeProductionException(ctx, &oldNodeCommand, &biz.ProcessDomainCommandInput{WarehouseScope: command.WarehouseScope, Node: &biz.ProcessNodeInstance{NodeKey: "execute_production_exception"}}, nil); !errors.Is(err, biz.ErrNoPermission) {
				t.Fatalf("production-only node disposed warehouse stock: %v", err)
			}
			applied, err := repo.executeProductionException(ctx, command, nil, nil)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = repo.executeProductionException(ctx, command, nil, nil); err != nil {
				t.Fatalf("execution retry: %v", err)
			}
			deniedReplay := *command
			deniedReplay.WarehouseScope = &biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}
			if _, err = repo.executeProductionException(ctx, &deniedReplay, nil, nil); !errors.Is(err, biz.ErrDataScopeForbidden) {
				t.Fatalf("replay bypassed current warehouse scope: %v", err)
			}
			if _, err = uc.ReverseProductionException(ctx, &biz.ProductionExceptionMutation{WarehouseScope: deniedReplay.WarehouseScope, ID: applied.ID, ExpectedVersion: applied.Version, ActorID: f.actorID, Reason: "越权冲正"}); !errors.Is(err, biz.ErrDataScopeForbidden) {
				t.Fatalf("reversal bypassed warehouse scope: %v", err)
			}
			balance, err := NewInventoryRepo(f.data, log.NewStdLogger(io.Discard)).GetInventoryBalance(ctx, biz.InventoryBalanceKey{SubjectType: receipt.SubjectType, SubjectID: receipt.SubjectID, ProductSkuID: receipt.ProductSkuID, WarehouseID: receipt.WarehouseID, LotID: receipt.LotID, UnitID: receipt.UnitID})
			if err != nil || !balance.Quantity.IsZero() {
				t.Fatalf("disposed stock=%+v err=%v", balance, err)
			}
			if f.client.ProductionFact.GetX(ctx, receipt.ID).Status != biz.OperationalFactStatusPosted || f.client.QualityInspection.GetX(ctx, inspection.ID).Status != biz.QualityInspectionStatusRejected {
				t.Fatal("exception rewrote original receipt or inspection")
			}
			if _, err = f.uc.GetProductionWIP(ctx, flow.ProductionOrderID); err != nil {
				t.Fatalf("branch aggregate: %v", err)
			}
			if biz.ProductionExceptionCreatesBatch(kind) {
				batch := f.client.ProductionWIPBatch.Query().Where(productionwipbatch.OriginExceptionDecisionID(decision.ID)).OnlyX(ctx)
				if batch.SourceBatchID == nil || *batch.SourceBatchID != source.ID || !batch.Quantity.Equal(source.Quantity) {
					t.Fatal("exception branch lost lineage")
				}
				if kind != biz.ProductionExceptionReworkOriginal {
					wrongVendor := f.client.Supplier.Create().SetCode("WRONG-" + kind).SetName("非决策厂商").SaveX(ctx)
					prepare := &biz.ProductionOutsourcingPrepare{BatchID: batch.ID, ExpectedVersion: batch.Version, SupplierID: wrongVendor.ID, ActorID: f.actorID, ExpectedReturnDate: time.Now().Add(24 * time.Hour)}
					if kind == biz.ProductionExceptionRemake {
						for _, requirement := range flow.MaterialRequirements {
							prepare.RequirementIDs = append(prepare.RequirementIDs, requirement.ID)
						}
					}
					if _, err = f.uc.PrepareProductionOutsourcing(ctx, prepare); !errors.Is(err, biz.ErrProductionExceptionSourceInvalid) {
						t.Fatalf("changed approved supplier: %v", err)
					}
					prepare.SupplierID = vendor.ID
					prepared, err := f.uc.PrepareProductionOutsourcing(ctx, prepare)
					if err != nil {
						t.Fatal(err)
					}
					lines := f.client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.OutsourcingOrderID(prepared.OutsourcingOrderID)).AllX(ctx)
					for _, line := range lines {
						if kind == biz.ProductionExceptionRemake && (line.SubjectType != biz.InventorySubjectMaterial || line.MaterialID == nil) {
							t.Fatal("fresh-material remake reused product rework")
						}
						if kind == biz.ProductionExceptionReworkSwitch && line.SubjectType != biz.InventorySubjectProduct {
							t.Fatal("vendor switch lost original goods")
						}
					}
					if _, err = uc.ReverseProductionException(ctx, &biz.ProductionExceptionMutation{WarehouseScope: &biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}, ID: applied.ID, ExpectedVersion: applied.Version, ActorID: f.actorID, Reason: "已有合同仍尝试冲正"}); !errors.Is(err, biz.ErrProductionWIPPreparedContractDependency) {
						t.Fatalf("contract dependency: %v", err)
					}
					verifyExceptionOutsourcingExecution(t, ctx, f, flow, batch, prepared.OutsourcingOrderID)
					return
				}
			}
			reversed, err := uc.ReverseProductionException(ctx, &biz.ProductionExceptionMutation{WarehouseScope: &biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}, ID: applied.ID, ExpectedVersion: applied.Version, ActorID: f.actorID, Reason: "未执行加工，撤回处置"})
			if err != nil || reversed.ExecutionStatus != biz.ProductionExceptionExecutionReversed {
				t.Fatalf("reverse=%+v err=%v", reversed, err)
			}
			disposed, err := productionReceiptExceptionDisposedQuantity(ctx, f.client, receipt.ID)
			if err != nil || !disposed.IsZero() || f.client.ProductionWIPBatch.GetX(ctx, source.ID).Status != biz.ProductionWIPStatusRejected {
				t.Fatalf("reverse failed to restore stock hold: %s %v", disposed, err)
			}
		})
	}
}

func TestProductionExceptionOriginalSupplierExecutesNewContract(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "exception_original_outsourced")
	createProductionWIPRouteProcesses(t, ctx, f.client)
	flow := releaseProductionWIPRoute(t, ctx, f, "EX-ORIGINAL", 10, false)
	flow, handwork := acceptProductionHandworkBatchForReworkTest(t, ctx, f.client, f.uc, f.actorID, flow, "original")
	source := f.client.ProductionWIPBatch.UpdateOneID(handwork.ID).SetStatus(biz.ProductionWIPStatusPlanned).SaveX(ctx)
	vendor := f.client.Supplier.Create().SetCode("ORIGINAL-VENDOR").SetName("原加工厂").SetSupplierType("outsourcing").SaveX(ctx)
	prepared, err := f.uc.PrepareProductionOutsourcing(ctx, &biz.ProductionOutsourcingPrepare{BatchID: source.ID, ExpectedVersion: source.Version, SupplierID: vendor.ID, ActorID: f.actorID, ExpectedReturnDate: time.Now().Add(24 * time.Hour)})
	if err != nil {
		t.Fatal(err)
	}
	verifyExceptionOutsourcingExecution(t, ctx, f, flow, source, prepared.OutsourcingOrderID, true)
	source = f.client.ProductionWIPBatch.GetX(ctx, source.ID)
	inspection := f.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(source.ID), qualityinspection.Status(biz.QualityInspectionStatusRejected)).OnlyX(ctx)
	repo := NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	decision, err := uc.SubmitProductionException(ctx, &biz.ProductionExceptionSubmit{DecisionNo: "EX-ORIGINAL-DECISION", DecisionType: biz.ProductionExceptionReworkOriginal, ProductionWIPBatchID: &source.ID, QualityInspectionID: &inspection.ID, RequestedQuantity: source.Quantity, TargetSupplierID: &vendor.ID, TargetOperationID: &source.ProductionOrderOperationID, Reason: "由原加工厂返工修正颜色", IdempotencyKey: "original-decision", RequestedBy: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	approver := f.client.AdminUser.Create().SetUsername("original-approver").SetPasswordHash("test-password-hash").SaveX(ctx)
	approved, err := repo.decideProductionException(ctx, &biz.ProductionExceptionMutation{ID: decision.ID, ExpectedVersion: decision.Version, ActorID: approver.ID, Reason: "按原厂方案执行"}, biz.ProductionExceptionApproved, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = repo.executeProductionException(ctx, &biz.ProductionExceptionMutation{ID: approved.ID, ExpectedVersion: approved.Version, ActorID: f.actorID, Reason: "原厂返工"}, nil, nil); err != nil {
		t.Fatal(err)
	}
	branch := f.client.ProductionWIPBatch.Query().Where(productionwipbatch.OriginExceptionDecisionID(decision.ID)).OnlyX(ctx)
	reworkContract, err := f.uc.PrepareProductionOutsourcing(ctx, &biz.ProductionOutsourcingPrepare{BatchID: branch.ID, ExpectedVersion: branch.Version, SupplierID: vendor.ID, ActorID: f.actorID, ExpectedReturnDate: time.Now().Add(24 * time.Hour)})
	if err != nil {
		t.Fatal(err)
	}
	if reworkContract.OutsourcingOrderID == prepared.OutsourcingOrderID {
		t.Fatal("rework rewrote original processing contract")
	}
	verifyExceptionOutsourcingExecution(t, ctx, f, flow, branch, reworkContract.OutsourcingOrderID)
	if f.client.QualityInspection.GetX(ctx, inspection.ID).Status != biz.QualityInspectionStatusRejected {
		t.Fatal("rework rewrote original rejection")
	}
	anchor := f.client.WorkflowTask.Create().SetTaskCode("original-chain-anchor").SetTaskGroup("production_exception_review").SetTaskName("异常方案审核").SetSourceType("production_exception_decision").SetSourceID(decision.ID).SetOwnerRoleKey("sales").SetTaskStatusKey("done").SaveX(ctx)
	chain, err := NewWorkflowRepo(f.data, log.NewStdLogger(io.Discard)).GetWorkflowHandlingChain(ctx, anchor.ID, biz.WorkflowHandlingChainTaskView, &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true})
	if err != nil {
		t.Fatal(err)
	}
	var sourceFound, childFound bool
	for _, item := range chain.Items {
		if item.ExceptionID != decision.ID {
			t.Fatalf("exception detail contains another task chain: %+v", item)
		}
		if item.ExceptionNo != decision.DecisionNo || item.ExceptionOperationCode != biz.ProductionWIPOperationHandwork {
			t.Fatalf("exception identity=%+v", item)
		}
		if item.Group == "handoff_production_exception" && item.BatchNo == source.BatchNo {
			sourceFound = true
		}
		if item.BatchNo == branch.BatchNo {
			childFound = true
		}
	}
	if !sourceFound || !childFound {
		t.Fatalf("source and execution must share branch: source=%v child=%v", sourceFound, childFound)
	}
}

func verifyExceptionOutsourcingExecution(t *testing.T, ctx context.Context, f productionOrderTestFixture, flow *biz.ProductionWIPAggregate, batch *ent.ProductionWIPBatch, contractID int, rejectFirst ...bool) {
	t.Helper()
	logger := log.NewStdLogger(io.Discard)
	contracts := biz.NewOutsourcingOrderUsecase(NewOutsourcingOrderRepo(f.data, logger))
	facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, logger))
	inventory := biz.NewInventoryUsecase(NewInventoryRepo(f.data, logger))
	order := f.client.OutsourcingOrder.GetX(ctx, contractID)
	lines := f.client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.OutsourcingOrderID(contractID)).AllX(ctx)
	price := decimal.NewFromInt(2)
	mutations := make([]*biz.OutsourcingOrderItemSaveMutation, 0, len(lines))
	allocations := make([]biz.ProductionWIPOutsourcingAllocationInput, 0, len(lines))
	for _, line := range lines {
		mutations = append(mutations, &biz.OutsourcingOrderItemSaveMutation{ID: line.ID, OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{LineNo: line.LineNo, SubjectType: line.SubjectType, MaterialID: line.MaterialID, ProductID: line.ProductID, ProductSKUID: line.ProductSkuID, ProcessID: line.ProcessID, UnitID: line.UnitID, OutsourcingQuantity: line.OutsourcingQuantity, UnitPrice: &price, ProcessingItem: stringPtr("异常方案加工")}})
		allocation := biz.ProductionWIPOutsourcingAllocationInput{OutsourcingOrderItemID: line.ID}
		if line.MaterialID != nil {
			for _, requirement := range flow.MaterialRequirements {
				if requirement.MaterialID == *line.MaterialID {
					id := requirement.ID
					allocation.ProductionOrderMaterialRequirementID = &id
				}
			}
		}
		allocations = append(allocations, allocation)
	}
	_, err := contracts.SaveOutsourcingOrderWithItems(ctx, order.ID, &biz.OutsourcingOrderMutation{ExpectedVersion: order.Version, OutsourcingOrderNo: order.OutsourcingOrderNo, SupplierID: order.SupplierID, Currency: order.Currency, PaymentTermDays: order.PaymentTermDays, SupplierSnapshot: map[string]any{"name": "测试加工厂", "contact_name": "测试联系人", "contact_phone": "000", "address": "测试地址"}, ContractPartySnapshot: map[string]any{"buyerCompany": "测试委托方", "buyerContact": "测试经办", "buyerPhone": "000", "buyerAddress": "测试收货地址"}, OrderDate: order.OrderDate, ExpectedReturnDate: order.ExpectedReturnDate}, mutations)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = applyOutsourcingLifecycleUsecaseForTest(ctx, contracts, order.ID, biz.SourceOrderActionSubmit); err != nil {
		t.Fatal(err)
	}
	if _, err = applyOutsourcingLifecycleUsecaseForTest(ctx, contracts, order.ID, biz.SourceOrderActionConfirm); err != nil {
		t.Fatal(err)
	}
	action := &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: batch.ID, ExpectedVersion: batch.Version, ActorID: f.actorID, IdempotencyKey: "exception-assign", ExecutionMode: biz.ProductionWIPExecutionOutsourced, OutsourcingAllocations: allocations}
	if _, err = f.uc.AssignProductionWIPExecution(ctx, action); err != nil {
		t.Fatal(err)
	}
	if batch.FlowType == biz.ProductionWIPFlowRemake {
		warehouse := f.client.Warehouse.Create().SetCode("EX-NEW-MATERIAL").SetName("补料仓").SetType("MATERIAL").SetIsActive(true).SaveX(ctx)
		for _, line := range lines {
			lot := f.client.InventoryLot.Create().SetSubjectType(biz.InventorySubjectMaterial).SetSubjectID(*line.MaterialID).SetLotNo("EX-NEW-MATERIAL-LOT").SetStatus(biz.InventoryLotActive).SaveX(ctx)
			if _, err = inventory.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: biz.InventorySubjectMaterial, SubjectID: *line.MaterialID, WarehouseID: warehouse.ID, LotID: &lot.ID, UnitID: line.UnitID, Quantity: line.OutsourcingQuantity, Direction: 1, TxnType: biz.InventoryTxnIn, SourceType: "EXCEPTION_TEST_SEED", IdempotencyKey: "exception-material-seed"}); err != nil {
				t.Fatal(err)
			}
			issue, err := facts.CreateOutsourcingMaterialIssueFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{FactNo: "EX-NEW-ISSUE", OutsourcingOrderID: order.ID, OutsourcingOrderItemID: line.ID, WarehouseID: warehouse.ID, LotID: &lot.ID, Quantity: line.OutsourcingQuantity, IdempotencyKey: "exception-material-issue"})
			if err != nil {
				t.Fatal(err)
			}
			if _, err = facts.PostOutsourcingFact(ctx, operationalFactStatusMutation(issue.ID, issue.Version, f.actorID, "")); err != nil {
				t.Fatal(err)
			}
		}
	}
	if batch.FlowType == biz.ProductionWIPFlowRemake {
		requirements, err := facts.ListProductionOrderMaterialRequirements(ctx, flow.ProductionOrderID)
		if err != nil {
			t.Fatal(err)
		}
		for _, requirement := range requirements {
			if !requirement.IssuedQuantity.IsZero() {
				t.Fatal("approved remake consumed normal material allowance")
			}
		}
	}
	for _, command := range []string{biz.ProductionWIPActionStartOperation, biz.ProductionWIPActionReceiveOutsourcingReturn} {
		current := f.client.ProductionWIPBatch.GetX(ctx, batch.ID)
		input := &biz.ProductionWIPAction{Action: command, ProductionOrderID: flow.ProductionOrderID, BatchID: batch.ID, ExpectedVersion: current.Version, ActorID: f.actorID, IdempotencyKey: "exception-" + command}
		if command == biz.ProductionWIPActionReceiveOutsourcingReturn {
			input.Quantity = current.Quantity
		}
		if _, err = f.uc.ApplyProductionWIPAction(ctx, input); err != nil {
			t.Fatal(err)
		}
	}
	for {
		rows := f.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(batch.ID), qualityinspection.Status(biz.QualityInspectionStatusDraft)).AllX(ctx)
		if len(rows) == 0 {
			break
		}
		if len(rows) != 1 {
			t.Fatal("quality gates must advance one at a time")
		}
		if _, err = inventory.SubmitQualityInspection(ctx, rows[0].ID); err != nil {
			t.Fatal(err)
		}
		if len(rejectFirst) > 0 && rejectFirst[0] {
			if _, err = inventory.RejectQualityInspection(ctx, approximateQualityInspectionDecision(rows[0].ID, biz.QualityInspectionResultReject)); err != nil {
				t.Fatal(err)
			}
			return
		}
		if _, err = inventory.PassQualityInspection(ctx, approximateQualityInspectionDecision(rows[0].ID, biz.QualityInspectionResultPass)); err != nil {
			t.Fatal(err)
		}
	}
	if current := f.client.ProductionWIPBatch.GetX(ctx, batch.ID); current.Status != biz.ProductionWIPStatusAccepted || current.OriginExceptionDecisionID == nil {
		t.Fatalf("exception execution did not close quality chain: %+v", current)
	}
}
