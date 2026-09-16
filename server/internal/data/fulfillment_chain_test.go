package data

import (
	"context"
	"fmt"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/qualityinspection"
)

// Master data and the released route come from fixtures; all receiving,
// processing, inspection and stock mutations below use the domain usecases.
func TestFulfillmentArrivalThroughFinishedGoodsInbound(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "fulfillment_chain")
	createProductionWIPRouteProcesses(t, ctx, f.client)
	wip := releaseProductionWIPRoute(t, ctx, f, "MO-HANDOFF-CHAIN", 10, true)
	root := wip.Batches[0]
	assertFulfillmentTask(t, ctx, f.client, "production_execute", root.ID, "ready", biz.ProductionRoleKey)
	logger := log.NewStdLogger(io.Discard)
	inv := biz.NewInventoryUsecase(NewInventoryRepo(f.data, logger))
	facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, logger))
	contracts := biz.NewOutsourcingOrderUsecase(NewOutsourcingOrderRepo(f.data, logger))
	warehouse := f.client.Warehouse.Create().SetCode("HANDOFF-MATERIAL").SetName("测试材料仓").SetType("MATERIAL").SaveX(ctx)
	vendor := f.client.Supplier.Create().SetCode("HANDOFF-VENDOR").SetName("测试加工厂").SetSupplierType("outsourcing").SaveX(ctx)

	sourceItem := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, f.client, inventoryTestFixtures{materialID: f.materialID, unitID: f.unitID, warehouseID: warehouse.ID}, "CHAIN", wip.MaterialRequirements[0].PlannedQuantity)
	receipt, err := inv.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: sourceItem.PurchaseOrderID, ReceiptNo: "PR-HANDOFF-CHAIN", WarehouseID: warehouse.ID, IdempotencyKey: "chain-arrival"})
	if err != nil {
		t.Fatal(err)
	}
	passAllPurchaseReceiptQualityInspections(t, ctx, inv, receipt.ID)
	if _, err = inv.PostPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, f.client, "receipt_inbound", receipt.ID, "done", biz.WarehouseRoleKey)

	prepared, err := f.uc.PrepareProductionOutsourcing(ctx, &biz.ProductionOutsourcingPrepare{BatchID: root.ID, ExpectedVersion: root.Version, SupplierID: vendor.ID, RequirementIDs: []int{wip.MaterialRequirements[0].ID}, ExpectedReturnDate: time.Now().AddDate(0, 0, 7), ActorID: f.actorID})
	if err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, f.client, "outsourcing_contract", prepared.OutsourcingOrderID, "ready", biz.FinanceRoleKey)
	order := f.client.OutsourcingOrder.GetX(ctx, prepared.OutsourcingOrderID)
	line := f.client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.OutsourcingOrderID(order.ID)).OnlyX(ctx)
	price := decimal.NewFromInt(2)
	_, err = contracts.SaveOutsourcingOrderWithItems(ctx, order.ID, &biz.OutsourcingOrderMutation{ExpectedVersion: order.Version, OutsourcingOrderNo: order.OutsourcingOrderNo, SupplierID: vendor.ID, Currency: order.Currency, PaymentTermDays: order.PaymentTermDays, SupplierSnapshot: map[string]any{"name": "测试加工厂", "contact_name": "测试联系人", "contact_phone": "000", "address": "测试加工地址"}, ContractPartySnapshot: map[string]any{"buyerCompany": "测试委托方", "buyerContact": "测试经办", "buyerPhone": "000", "buyerAddress": "测试收货地址"}, OrderDate: order.OrderDate, ExpectedReturnDate: order.ExpectedReturnDate}, []*biz.OutsourcingOrderItemSaveMutation{{ID: line.ID, OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{LineNo: 1, SubjectType: line.SubjectType, MaterialID: line.MaterialID, ProcessID: line.ProcessID, UnitID: line.UnitID, OutsourcingQuantity: line.OutsourcingQuantity, UnitPrice: &price, ProcessingItem: stringPtr("测试裁片加工")}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = contracts.SubmitOutsourcingOrder(ctx, order.ID); err != nil {
		t.Fatal(err)
	}
	if _, err = contracts.ConfirmOutsourcingOrder(ctx, order.ID); err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, f.client, "outsourcing_contract", order.ID, "done", biz.FinanceRoleKey)
	assertFulfillmentTask(t, ctx, f.client, "outsourcing_issue", order.ID, "ready", biz.WarehouseRoleKey)
	wip, err = f.uc.AssignProductionWIPExecution(ctx, &biz.ProductionWIPAction{ProductionOrderID: wip.ProductionOrderID, BatchID: root.ID, ExpectedVersion: root.Version, ActorID: f.actorID, IdempotencyKey: "chain-assign-fabric", ExecutionMode: biz.ProductionWIPExecutionOutsourced, OutsourcingAllocations: []biz.ProductionWIPOutsourcingAllocationInput{{OutsourcingOrderItemID: line.ID, ProductionOrderMaterialRequirementID: &wip.MaterialRequirements[0].ID}}})
	if err != nil {
		t.Fatal(err)
	}
	items, err := f.client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(receipt.ID)).All(ctx)
	if err != nil {
		t.Fatal(err)
	}
	issue, err := facts.CreateOutsourcingMaterialIssueFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{FactNo: "ISSUE-HANDOFF", OutsourcingOrderID: order.ID, OutsourcingOrderItemID: line.ID, WarehouseID: warehouse.ID, LotID: items[0].LotID, Quantity: line.OutsourcingQuantity, IdempotencyKey: "chain-issue"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = facts.PostOutsourcingFact(ctx, operationalFactStatusMutation(issue.ID, issue.Version, f.actorID, "")); err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, f.client, "outsourcing_issue", order.ID, "done", biz.WarehouseRoleKey)

	current := productionWIPBatchByID(t, wip, root.ID)
	for index, code := range []string{biz.ProductionWIPOperationFabricProcessing, biz.ProductionWIPOperationSewing, biz.ProductionWIPOperationHandwork, biz.ProductionWIPOperationPackaging} {
		action := func(suffix string) *biz.ProductionWIPAction {
			return &biz.ProductionWIPAction{ProductionOrderID: wip.ProductionOrderID, BatchID: current.ID, ExpectedVersion: current.Version, ActorID: f.actorID, IdempotencyKey: fmt.Sprintf("chain-%d-%s", index, suffix)}
		}
		if index > 0 {
			input := action("assign")
			input.ExecutionMode = biz.ProductionWIPExecutionInHouse
			wip, err = f.uc.AssignProductionWIPExecution(ctx, input)
			if err != nil {
				t.Fatal(err)
			}
			current = productionWIPBatchByID(t, wip, current.ID)
		}
		if code == biz.ProductionWIPOperationPackaging {
			confirmation := wip.PackagingConfirmations[0]
			assertFulfillmentTask(t, ctx, f.client, "production_packaging", confirmation.ID, "ready", biz.SalesRoleKey)
			if _, err = f.uc.StartProductionWIPOperation(ctx, action("premature")); err == nil {
				t.Fatal("packaging started before sales confirmation")
			}
			version := "测试包装版 V1"
			wip, err = f.uc.ConfirmProductionWIPPackagingMaterial(ctx, &biz.ProductionWIPAction{ProductionOrderID: wip.ProductionOrderID, ProductionOrderItemID: current.ProductionOrderItemID, ExpectedVersion: confirmation.Version, ActorID: f.actorID, IdempotencyKey: "chain-packaging-confirm", PackagingVersionSnapshot: &version})
			if err != nil {
				t.Fatal(err)
			}
			assertFulfillmentTask(t, ctx, f.client, "production_packaging", confirmation.ID, "done", biz.SalesRoleKey)
		}
		wip, err = f.uc.StartProductionWIPOperation(ctx, action("start"))
		if err != nil {
			t.Fatal(err)
		}
		current = productionWIPBatchByID(t, wip, current.ID)
		if index == 0 {
			assertFulfillmentTask(t, ctx, f.client, "production_return", current.ID, "ready", biz.WarehouseRoleKey)
			wip, err = f.uc.ReceiveProductionWIPOutsourcingReturn(ctx, action("return"))
		} else {
			wip, err = f.uc.CompleteProductionWIPOperation(ctx, action("complete"))
		}
		if err != nil {
			t.Fatal(err)
		}
		for {
			pending, err := f.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(current.ID), qualityinspection.Status(biz.QualityInspectionStatusDraft)).All(ctx)
			if err != nil {
				t.Fatal(err)
			}
			if len(pending) == 0 {
				break
			}
			if len(pending) != 1 {
				t.Fatal("quality gates must run sequentially")
			}
			qi := pending[0]
			assertFulfillmentTask(t, ctx, f.client, "production_quality", qi.ID, "ready", biz.QualityRoleKey)
			if _, err = inv.SubmitQualityInspection(ctx, qi.ID); err != nil {
				t.Fatal(err)
			}
			if _, err = inv.PassQualityInspection(ctx, approximateQualityInspectionDecision(qi.ID, biz.QualityInspectionResultPass)); err != nil {
				t.Fatal(err)
			}
			assertFulfillmentTask(t, ctx, f.client, "production_quality", qi.ID, "done", biz.QualityRoleKey)
		}
		wip, err = f.uc.GetProductionWIP(ctx, wip.ProductionOrderID)
		if err != nil {
			t.Fatal(err)
		}
		current = productionWIPBatchByID(t, wip, current.ID)
		if current.Status != biz.ProductionWIPStatusAccepted {
			t.Fatalf("%s not accepted: %s", code, current.Status)
		}
		if index < 3 {
			assertFulfillmentTask(t, ctx, f.client, "production_transfer", current.ID, "ready", biz.ProductionRoleKey)
			next := wip.Operations[index+1]
			input := action("transfer")
			input.TargetOperationID = next.ID
			input.Quantity = current.Quantity
			wip, err = f.uc.TransferProductionWIPToNextOperation(ctx, input)
			if err != nil {
				t.Fatal(err)
			}
			assertFulfillmentTask(t, ctx, f.client, "production_transfer", current.ID, "done", biz.ProductionRoleKey)
			current = productionWIPBatchForOperation(t, wip, next.ID)
		}
	}
	assertFulfillmentTask(t, ctx, f.client, "production_completion", current.ID, "ready", biz.ProductionRoleKey)
	finishedWarehouse := f.client.Warehouse.Create().SetCode("HANDOFF-FINISHED").SetName("测试成品仓").SetType("FINISHED_GOODS").SaveX(ctx)
	lotNo := "FG-HANDOFF"
	completion, err := facts.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{FactNo: "FG-RECEIPT-HANDOFF", ProductionOrderID: wip.ProductionOrderID, ProductionOrderItemID: current.ProductionOrderItemID, ProductionWIPBatchID: current.ID, WarehouseID: finishedWarehouse.ID, NewLotNo: &lotNo, Quantity: current.Quantity, IdempotencyKey: "chain-completion"})
	if err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, f.client, "production_completion", current.ID, "done", biz.ProductionRoleKey)
	assertFulfillmentTask(t, ctx, f.client, "production_inbound", completion.ID, "ready", biz.WarehouseRoleKey)
	assertInventoryTxnCount(t, ctx, f.client, 2)
	if _, err = facts.CancelPostedProductionFact(ctx, operationalFactStatusMutation(completion.ID, completion.Version, f.actorID, "更正完工登记")); err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, f.client, "production_inbound", completion.ID, "withdrawn", biz.WarehouseRoleKey)
	assertFulfillmentTask(t, ctx, f.client, "production_completion", current.ID, "ready", biz.ProductionRoleKey)
	assertInventoryTxnCount(t, ctx, f.client, 2)
	completion, err = facts.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{FactNo: "FG-RECEIPT-CORRECTED", ProductionOrderID: wip.ProductionOrderID, ProductionOrderItemID: current.ProductionOrderItemID, ProductionWIPBatchID: current.ID, WarehouseID: finishedWarehouse.ID, LotID: completion.LotID, Quantity: current.Quantity, IdempotencyKey: "chain-corrected-completion"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = facts.PostProductionFact(ctx, operationalFactStatusMutation(completion.ID, completion.Version, f.actorID, "")); err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, f.client, "production_inbound", completion.ID, "done", biz.WarehouseRoleKey)
	assertInventoryTxnCount(t, ctx, f.client, 3)
}
