package data

import (
	"context"
	"io"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/qualityinspection"
	"server/internal/data/model/ent/workflowtask"
)

func assertFulfillmentTask(t *testing.T, ctx context.Context, client *ent.Client, kind string, id int, status, role string) *ent.WorkflowTask {
	t.Helper()
	task := client.WorkflowTask.Query().Where(workflowtask.TaskCode(biz.WorkflowSourceTaskCode("handoff_"+kind, id))).OnlyX(ctx)
	if task.TaskStatusKey != status || task.OwnerRoleKey != role {
		t.Fatalf("%s: status=%s owner=%s, expected %s/%s", kind, task.TaskStatusKey, task.OwnerRoleKey, status, role)
	}
	if !biz.IsTrustedFulfillmentTask(entWorkflowTaskToBiz(task)) {
		t.Fatalf("untrusted %s task", kind)
	}
	return task
}

func TestFulfillmentReceiptQualityInboundAndReplay(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "fulfillment_receipt")
	f := createInventoryTestFixtures(t, ctx, client)
	item := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, f, "HANDOFF", mustDecimal(t, "10"))
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	if _, err := NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)).UpdatePurchaseOrderLifecycle(ctx, item.PurchaseOrderID, biz.PurchaseOrderStatusApproved); err != nil {
		t.Fatal(err)
	}
	in := &biz.PurchaseReceiptFromPurchaseOrderCreate{AllRemaining: true, PurchaseOrderID: item.PurchaseOrderID, ReceiptNo: "PR-HANDOFF", WarehouseID: f.warehouseID, IdempotencyKey: "handoff-receipt"}
	receipt, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, client, "purchase_arrival", item.PurchaseOrderID, "done", biz.QualityRoleKey)
	assertFulfillmentTask(t, ctx, client, "receipt_quality", receipt.QualityInspections[0].ID, "ready", biz.QualityRoleKey)
	assertFulfillmentTask(t, ctx, client, "receipt_inbound", receipt.ID, "blocked", biz.WarehouseRoleKey)
	assertInventoryTxnCount(t, ctx, client, 0)
	count := client.WorkflowTask.Query().CountX(ctx)
	if _, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, in); err != nil {
		t.Fatal(err)
	}
	if client.WorkflowTask.Query().CountX(ctx) != count {
		t.Fatal("retry duplicated tasks")
	}
	passAllPurchaseReceiptQualityInspections(t, ctx, uc, receipt.ID)
	assertFulfillmentTask(t, ctx, client, "receipt_quality", receipt.QualityInspections[0].ID, "done", biz.QualityRoleKey)
	assertFulfillmentTask(t, ctx, client, "receipt_inbound", receipt.ID, "ready", biz.WarehouseRoleKey)
	assertInventoryTxnCount(t, ctx, client, 0)
	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatal(err)
	}
	done := assertFulfillmentTask(t, ctx, client, "receipt_inbound", receipt.ID, "done", biz.WarehouseRoleKey)
	assertInventoryTxnCount(t, ctx, client, 1)
	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatal(err)
	}
	if again := assertFulfillmentTask(t, ctx, client, "receipt_inbound", receipt.ID, "done", biz.WarehouseRoleKey); again.Version != done.Version {
		t.Fatal("replay changed task history")
	}
}

func TestFulfillmentReceiptRejectCorrectionAndCancellation(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "fulfillment_rejection")
	f := createInventoryTestFixtures(t, ctx, client)
	item := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, f, "REJECT", mustDecimal(t, "10"))
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{AllRemaining: true, PurchaseOrderID: item.PurchaseOrderID, ReceiptNo: "PR-REJECT", WarehouseID: f.warehouseID})
	if err != nil {
		t.Fatal(err)
	}
	qi := receipt.QualityInspections[0]
	if _, err := uc.RejectQualityInspection(ctx, approximateQualityInspectionDecision(qi.ID, biz.QualityInspectionResultReject)); err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, client, "receipt_exception", receipt.ID, "ready", biz.PurchaseRoleKey)
	if _, err := uc.PostPurchaseReceipt(ctx, receipt.ID); err == nil {
		t.Fatal("rejected arrival was posted")
	}
	if _, err := uc.CancelPostedPurchaseReceipt(ctx, receipt.ID); err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, client, "receipt_inbound", receipt.ID, "withdrawn", biz.WarehouseRoleKey)
	assertFulfillmentTask(t, ctx, client, "receipt_exception", receipt.ID, "withdrawn", biz.PurchaseRoleKey)
	assertFulfillmentTask(t, ctx, client, "purchase_arrival", item.PurchaseOrderID, "ready", biz.QualityRoleKey)
	assertInventoryTxnCount(t, ctx, client, 0)
}

func TestFulfillmentTaskConflictRollsBackReceiving(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "fulfillment_atomic")
	f := createInventoryTestFixtures(t, ctx, client)
	item := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, f, "ATOMIC", mustDecimal(t, "10"))
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	client.WorkflowTask.Create().SetTaskCode(biz.WorkflowSourceTaskCode("handoff_receipt_quality", 1)).SetTaskName("冲突任务").SetTaskStatusKey("ready").SetTaskGroup("manual").SetSourceType("manual").SetSourceID(1).SetOwnerRoleKey(biz.QualityRoleKey).SaveX(ctx)

	_, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{AllRemaining: true, PurchaseOrderID: item.PurchaseOrderID, ReceiptNo: "PR-ATOMIC", WarehouseID: f.warehouseID})
	if err == nil {
		t.Fatal("expected source task conflict")
	}
	if client.PurchaseReceipt.Query().CountX(ctx) != 0 || client.QualityInspection.Query().CountX(ctx) != 0 || client.WorkflowTask.Query().CountX(ctx) != 1 {
		t.Fatal("source or task escaped rollback")
	}
}

func TestFulfillmentSequentialQualityHandsOffToProduction(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "fulfillment_wip_quality")
	b := f.createWaitingBatch(t, "HANDOFF", []string{biz.ProductionWIPQualityGateFinishedGoods, biz.ProductionWIPQualityGateNeedle, biz.ProductionWIPQualityGateSampling})
	current := b.inspection
	for step := 0; step < 3; step++ {
		if _, err := f.uc.SubmitQualityInspection(f.ctx, current.ID); err != nil {
			t.Fatal(err)
		}
		assertFulfillmentTask(t, f.ctx, f.client, "production_quality", current.ID, "ready", biz.QualityRoleKey)
		if _, err := f.uc.PassQualityInspection(f.ctx, approximateQualityInspectionDecision(current.ID, biz.QualityInspectionResultPass)); err != nil {
			t.Fatal(err)
		}
		assertFulfillmentTask(t, f.ctx, f.client, "production_quality", current.ID, "done", biz.QualityRoleKey)
		if step < 2 {
			current = f.client.QualityInspection.Query().Where(qualityinspection.ProductionWipBatchID(b.batch.ID), qualityinspection.Status("DRAFT")).OnlyX(f.ctx)
			assertFulfillmentTask(t, f.ctx, f.client, "production_quality", current.ID, "ready", biz.QualityRoleKey)
		}
	}
	assertFulfillmentTask(t, f.ctx, f.client, "production_transfer", b.batch.ID, "ready", biz.ProductionRoleKey)
	assertInventoryTxnCount(t, f.ctx, f.client, 0)
}
