package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func TestProductionFinishedGoodsPartialPackingAndShipment(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "partial_packing_shipment")
	createProductionWIPRouteProcesses(t, ctx, f.client)
	testProductionFinishedGoodsPartialPackingAndShipment(t, f)
}

func TestProductionOrderPostgresFinishedGoodsReadiness(t *testing.T) {
	pg := openProductionOrderPGFixture(t)
	ensureProductionWIPRouteProcessesForPostgresRace(t, context.Background(), pg.client, pg.suffix)
	f := productionOrderTestFixture{uc: pg.uc, data: pg.data, client: pg.client, actorID: pg.actorID, unitID: pg.unitID, materialID: pg.materialID, productID: pg.productID, skuID: pg.skuID, salesItemID: pg.salesItemID, bomID: *pg.item.BOMHeaderID}
	testProductionFinishedGoodsPartialPackingAndShipment(t, f)
}

func testProductionFinishedGoodsPartialPackingAndShipment(t *testing.T, f productionOrderTestFixture) {
	t.Helper()
	ctx := context.Background()
	suffix := postgresTestSuffix()
	flow := releaseProductionWIPRoute(t, ctx, f, "MO-PACK-PART-"+suffix, 10, false)
	flow, handwork := acceptProductionHandworkBatchForReworkTest(t, ctx, f.client, f.uc, f.actorID, flow, "partial-packing-"+suffix)
	warehouse := createTestProductWarehouse(t, ctx, f.client, "PACK-PART-WH-"+suffix)
	facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
	inv := biz.NewInventoryUsecase(NewInventoryRepo(f.data, log.NewStdLogger(io.Discard)))
	createReceipt := func(no string, quantity int64) *biz.ProductionFact {
		t.Helper()
		lot := no + "-LOT"
		receipt, err := facts.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
			FactNo: no, ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: handwork.ProductionOrderItemID,
			ProductionWIPBatchID: handwork.ID, WarehouseID: warehouse.ID, NewLotNo: &lot, Quantity: decimal.NewFromInt(quantity), IdempotencyKey: no,
		})
		if err != nil {
			t.Fatal(err)
		}
		return receipt
	}
	first, second := createReceipt("PF-PACK-FIRST-"+suffix, 6), createReceipt("PF-PACK-SECOND-"+suffix, 4)
	packOperation := productionWIPOperationForCode(t, flow, biz.ProductionWIPOperationPackaging)
	transfer := func(receiptID int, quantity int64, key string) (*biz.ProductionWIPAggregate, error) {
		current := f.client.ProductionWIPBatch.GetX(ctx, handwork.ID)
		return f.uc.TransferProductionWIPToNextOperation(ctx, &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: handwork.ID, TargetOperationID: packOperation.ID, FinishedGoodsReceiptID: receiptID, ExpectedVersion: current.Version, ActorID: f.actorID, IdempotencyKey: key, Quantity: decimal.NewFromInt(quantity)})
	}
	if _, err := transfer(first.ID, 3, "packing-draft-source"); !errors.Is(err, biz.ErrProductionOrderFactSourceInvalid) {
		t.Fatalf("unposted source allowed: %v", err)
	}
	for _, receipt := range []*biz.ProductionFact{first, second} {
		if _, err := facts.PostProductionFact(ctx, operationalFactStatusMutation(receipt.ID, receipt.Version, f.actorID, "")); err != nil {
			t.Fatal(err)
		}
	}
	readiness := func(receipt *biz.ProductionFact, want string) {
		t.Helper()
		value, err := productionFinishedGoodsReadiness(ctx, f.client, biz.InventoryBalanceKey{SubjectType: receipt.SubjectType, SubjectID: receipt.SubjectID, ProductSkuID: receipt.ProductSkuID, WarehouseID: receipt.WarehouseID, LotID: receipt.LotID, UnitID: receipt.UnitID})
		if err != nil || value.PendingPackaging.String() != want {
			t.Fatalf("readiness %s=%+v err=%v want pending %s", receipt.FactNo, value, err, want)
		}
	}
	readiness(first, "6")
	readiness(second, "4")
	if _, err := transfer(0, 3, "packing-missing-source"); !errors.Is(err, biz.ErrProductionOrderFactSourceInvalid) {
		t.Fatalf("missing source: %v", err)
	}
	if _, err := transfer(first.ID, 7, "packing-over-source"); !errors.Is(err, biz.ErrProductionWIPQuantityExceeded) {
		t.Fatalf("receipt over-allocation: %v", err)
	}
	flow, err := transfer(first.ID, 3, "packing-first-half")
	if err != nil {
		t.Fatal(err)
	}
	batch := productionWIPBatchForOperation(t, flow, packOperation.ID)
	if batch.FinishedGoodsReceiptID == nil || *batch.FinishedGoodsReceiptID != first.ID {
		t.Fatal("packing lost exact receipt")
	}
	cancelReason := "重新安排查货包装"
	if _, err = f.uc.ApplyProductionWIPAction(ctx, &biz.ProductionWIPAction{Action: biz.ProductionWIPActionCancelBatch, ProductionOrderID: flow.ProductionOrderID, BatchID: batch.ID, ExpectedVersion: batch.Version, ActorID: f.actorID, IdempotencyKey: "partial-cancel", Reason: &cancelReason}); err != nil {
		t.Fatal(err)
	}
	cancelledID, cancelledNo := batch.ID, batch.BatchNo
	flow, err = transfer(first.ID, 3, "packing-reallocate-cancelled")
	if err != nil {
		t.Fatalf("reallocate after cancellation: %v", err)
	}
	batch = productionWIPBatchForOperation(t, flow, packOperation.ID)
	if batch.ID == cancelledID || batch.BatchNo == cancelledNo {
		t.Fatal("reallocation reused cancelled batch identity")
	}
	confirmation := flow.PackagingConfirmations[0]
	version := "彩盒确认版"
	if _, err = f.uc.ConfirmProductionWIPPackagingMaterial(ctx, &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: handwork.ProductionOrderItemID, ExpectedVersion: confirmation.Version, ActorID: f.actorID, IdempotencyKey: "partial-confirm", PackagingVersionSnapshot: &version}); err != nil {
		t.Fatal(err)
	}
	for _, action := range []string{biz.ProductionWIPActionAssignExecution, biz.ProductionWIPActionStartOperation, biz.ProductionWIPActionCompleteOperation} {
		current := f.client.ProductionWIPBatch.GetX(ctx, batch.ID)
		input := &biz.ProductionWIPAction{Action: action, ProductionOrderID: flow.ProductionOrderID, BatchID: batch.ID, ExpectedVersion: current.Version, ActorID: f.actorID, IdempotencyKey: "partial-" + action}
		if action == biz.ProductionWIPActionAssignExecution {
			input.ExecutionMode = biz.ProductionWIPExecutionInHouse
		}
		if _, err = f.uc.ApplyProductionWIPAction(ctx, input); err != nil {
			t.Fatal(err)
		}
	}
	readiness(first, "3")
	readiness(second, "4")
	shipment := func(receipt *biz.ProductionFact, quantity int64) *biz.Shipment {
		t.Helper()
		no := fmt.Sprintf("SHIP-%d-%d", receipt.ID, quantity)
		row, err := facts.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{Shipment: &biz.ShipmentCreate{ShipmentNo: no, IdempotencyKey: no}, Items: []*biz.ShipmentItemCreate{{ProductID: receipt.SubjectID, ProductSkuID: receipt.ProductSkuID, WarehouseID: receipt.WarehouseID, LotID: receipt.LotID, UnitID: receipt.UnitID, Quantity: decimal.NewFromInt(quantity)}}})
		if err != nil {
			t.Fatal(err)
		}
		submitAndCompleteShipmentReleaseTaskForTest(t, ctx, f.data, f.client, row.ID)
		return row
	}
	tooMuch, wrongLot, ready := shipment(first, 4), shipment(second, 1), shipment(first, 3)
	for _, row := range []*biz.Shipment{tooMuch, wrongLot} {
		if _, err = facts.ShipShipment(ctx, row.ID); !errors.Is(err, biz.ErrShipmentPackingPending) {
			t.Fatalf("unpacked shipment: %v", err)
		}
	}
	if _, err = facts.ShipShipment(ctx, ready.ID); err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, f.client, "shipment_execute", ready.ID, "done", biz.SalesRoleKey)
	assertFulfillmentTask(t, ctx, f.client, "shipment_execute", wrongLot.ID, "ready", biz.SalesRoleKey)
	if _, err = facts.ShipShipment(ctx, ready.ID); err != nil {
		t.Fatalf("shipment replay: %v", err)
	}
	readiness(first, "3")
	if _, err = inv.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{SubjectType: first.SubjectType, SubjectID: first.SubjectID, ProductSkuID: first.ProductSkuID, WarehouseID: first.WarehouseID, LotID: first.LotID, UnitID: first.UnitID, Quantity: decimal.NewFromInt(1), Direction: -1, TxnType: biz.InventoryTxnTransferOut, SourceType: "TEST_TRANSFER", IdempotencyKey: "unpacked-transfer"}); !errors.Is(err, biz.ErrShipmentPackingPending) {
		t.Fatalf("generic stock transfer bypassed packing: %v", err)
	}
}

func TestProductionOrderPostgresPackingAllocationSerializesReceiptCapacity(t *testing.T) {
	ctx := context.Background()
	pg := openProductionOrderPGFixture(t)
	ensureProductionWIPRouteProcessesForPostgresRace(t, ctx, pg.client, pg.suffix)
	f := productionOrderTestFixture{uc: pg.uc, data: pg.data, client: pg.client, actorID: pg.actorID, unitID: pg.unitID, materialID: pg.materialID, productID: pg.productID, skuID: pg.skuID, salesItemID: pg.salesItemID, bomID: *pg.item.BOMHeaderID}
	flow := releaseProductionWIPRoute(t, ctx, f, "PG-PACK-CAP-"+pg.suffix, 10, false)
	flow, batch := acceptProductionHandworkBatchForReworkTest(t, ctx, f.client, f.uc, f.actorID, flow, "pack-cap-"+pg.suffix)
	lot := "PG-PACK-CAP-LOT-" + pg.suffix
	receipt, err := pg.factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{FactNo: lot, ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: batch.ProductionOrderItemID, ProductionWIPBatchID: batch.ID, WarehouseID: pg.warehouseID, NewLotNo: &lot, Quantity: decimal.NewFromInt(10), IdempotencyKey: lot})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = pg.factUC.PostProductionFact(ctx, operationalFactStatusMutation(receipt.ID, receipt.Version, f.actorID, "")); err != nil {
		t.Fatal(err)
	}
	targetOperationID := productionWIPOperationForCode(t, flow, biz.ProductionWIPOperationPackaging).ID
	start, results := make(chan struct{}), make(chan error, 2)
	var workers sync.WaitGroup
	for index := 0; index < 2; index++ {
		workers.Add(1)
		go func(index int) {
			defer workers.Done()
			<-start
			_, err := f.uc.TransferProductionWIPToNextOperation(ctx, &biz.ProductionWIPAction{ProductionOrderID: flow.ProductionOrderID, BatchID: batch.ID, TargetOperationID: targetOperationID, FinishedGoodsReceiptID: receipt.ID, Quantity: decimal.NewFromInt(6), ExpectedVersion: batch.Version, ActorID: f.actorID, IdempotencyKey: fmt.Sprintf("pack-cap-%s-%d", pg.suffix, index)})
			results <- err
		}(index)
	}
	close(start)
	workers.Wait()
	close(results)
	succeeded := 0
	for err := range results {
		if err == nil {
			succeeded++
		} else if !errors.Is(err, biz.ErrProductionWIPInvalidTransition) && !errors.Is(err, biz.ErrProductionWIPQuantityExceeded) {
			t.Fatalf("unexpected allocation race error: %v", err)
		}
	}
	rows, err := productionReceiptPackagingBatches(ctx, f.client, receipt.ID)
	if err != nil || succeeded != 1 || sumProductionWIPBatchQuantity(rows).String() != "6" {
		t.Fatalf("receipt capacity exceeded: successes=%d rows=%v err=%v", succeeded, rows, err)
	}
}

func TestProductionFinishedGoodsHistoricalPackagingOccupiesHandworkCapacity(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "legacy_packaging_receipt")
	createProductionWIPRouteProcesses(t, ctx, f.client)
	flow := releaseProductionWIPRoute(t, ctx, f, "MO-LEGACY-PACK", 10, false)
	flow, handwork := acceptProductionHandworkBatchForReworkTest(t, ctx, f.client, f.uc, f.actorID, flow, "legacy-pack")
	warehouse := createTestProductWarehouse(t, ctx, f.client, "LEGACY-PACK-WH")
	facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
	lot := "LEGACY-PACK-LOT"
	input := &biz.ProductionCompletionFromOrderCreate{FactNo: "LEGACY-RCV", ProductionOrderID: flow.ProductionOrderID, ProductionOrderItemID: handwork.ProductionOrderItemID, ProductionWIPBatchID: handwork.ID, WarehouseID: warehouse.ID, NewLotNo: &lot, Quantity: decimal.NewFromInt(6), IdempotencyKey: "legacy-receipt"}
	receipt, err := facts.CreateProductionCompletionFromOrder(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = facts.PostProductionFact(ctx, operationalFactStatusMutation(receipt.ID, receipt.Version, f.actorID, "")); err != nil {
		t.Fatal(err)
	}
	operation := productionWIPOperationForCode(t, flow, biz.ProductionWIPOperationPackaging)
	// Synthesize only the historical source link: old versions received after packing.
	legacy := f.client.ProductionWIPBatch.Create().SetProductionOrderID(flow.ProductionOrderID).SetProductionOrderItemID(handwork.ProductionOrderItemID).SetProductionOrderOperationID(operation.ID).SetSourceBatchID(handwork.ID).SetBatchNo("LEGACY-PACKED").SetFlowType(biz.ProductionWIPFlowNormal).SetStatus(biz.ProductionWIPStatusAccepted).SetQuantity(decimal.NewFromInt(6)).SetCreatedBy(f.actorID).SaveX(ctx)
	if _, err = f.data.sqldb.ExecContext(ctx, "UPDATE production_facts SET production_wip_batch_id = ? WHERE id = ?", legacy.ID, receipt.ID); err != nil {
		t.Fatal(err)
	}
	if err = syncProductionHandoffs(ctx, f.client, flow.ProductionOrderID, f.actorID); err != nil {
		t.Fatal(err)
	}
	input.FactNo, input.IdempotencyKey = "NEW-RCV", "new-receipt"
	input.Quantity = decimal.NewFromInt(5)
	if _, err = facts.CreateProductionCompletionFromOrder(ctx, input); !errors.Is(err, biz.ErrProductionWIPQuantityExceeded) {
		t.Fatalf("historical stock duplicated: %v", err)
	}
	input.Quantity = decimal.NewFromInt(4)
	if _, err = facts.CreateProductionCompletionFromOrder(ctx, input); err != nil {
		t.Fatal(err)
	}
	assertFulfillmentTask(t, ctx, f.client, "production_completion", handwork.ID, "done", biz.WarehouseRoleKey)
}
