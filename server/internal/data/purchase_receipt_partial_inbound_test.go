package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceiptitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type partialInboundFixture struct {
	data        *Data
	client      *ent.Client
	inv         *biz.InventoryUsecase
	fixtures    inventoryTestFixtures
	orderID     int
	receipt     *biz.PurchaseReceipt
	items       map[int64]*ent.PurchaseReceiptItem
	inspections map[int64]*biz.QualityInspection
}

func newPartialInboundFixture(t *testing.T, key string) partialInboundFixture {
	t.Helper()
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, key)
	f := createInventoryTestFixtures(t, ctx, client)
	return partialInboundFixtureWithData(t, data, client, f, key)
}

func partialInboundFixtureWithData(t *testing.T, data *Data, client *ent.Client, f inventoryTestFixtures, key string) partialInboundFixture {
	t.Helper()
	ctx := t.Context()
	supplier := client.Supplier.Create().SetCode(key).SetName("模拟材料厂").SaveX(ctx)
	order := client.PurchaseOrder.Create().SetPurchaseOrderNo(key).SetSupplierID(supplier.ID).SetCurrency("CNY").SetPaymentTermDays(0).SetSupplierSnapshot(map[string]any{"name": supplier.Name}).SetPurchaseDate(time.Now()).SetLifecycleStatus(biz.PurchaseOrderStatusApproved).SaveX(ctx)
	for i, quantity := range []int64{4, 6} {
		client.PurchaseOrderItem.Create().SetPurchaseOrderID(order.ID).SetLineNo(i + 1).SetMaterialID(f.materialID).SetUnitID(f.unitID).SetPurchasedQuantity(decimal.NewFromInt(quantity)).SetUnitPrice(decimal.NewFromInt(2)).SetAmount(decimal.NewFromInt(quantity * 2)).SaveX(ctx)
	}
	inv := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt, err := inv.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: order.ID, ReceiptNo: "PR-" + key, WarehouseID: f.warehouseID, AllRemaining: true, IdempotencyKey: key})
	if err != nil {
		t.Fatal(err)
	}
	inspections, _, err := inv.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: receipt.ID, Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	out := partialInboundFixture{data: data, client: client, inv: inv, fixtures: f, orderID: order.ID, receipt: receipt, items: map[int64]*ent.PurchaseReceiptItem{}, inspections: map[int64]*biz.QualityInspection{}}
	for _, inspection := range inspections {
		item := client.PurchaseReceiptItem.GetX(ctx, *inspection.PurchaseReceiptItemID)
		out.items[item.Quantity.IntPart()] = item
		out.inspections[item.Quantity.IntPart()] = inspection
	}
	return out
}

func (f partialInboundFixture) decide(t *testing.T, quantity int64, pass bool) {
	t.Helper()
	input := approximateQualityInspectionDecision(f.inspections[quantity].ID, biz.QualityInspectionResultPass)
	var err error
	if pass {
		_, err = f.inv.PassQualityInspection(t.Context(), input)
	} else {
		input = approximateQualityInspectionDecision(f.inspections[quantity].ID, biz.QualityInspectionResultReject)
		_, err = f.inv.RejectQualityInspection(t.Context(), input)
	}
	if err != nil {
		t.Fatal(err)
	}
}

func (f partialInboundFixture) dispose(t *testing.T) {
	t.Helper()
	created, err := f.inv.CreatePurchaseRejectionDisposition(t.Context(), &biz.PurchaseRejectionDispositionCreate{DispositionNo: "PRD-" + f.receipt.ReceiptNo, QualityInspectionID: f.inspections[6].ID, DispositionType: biz.PurchaseRejectionReturnToVendor, Quantity: decimal.NewFromInt(6), Reason: "模拟拒收退厂", IdempotencyKey: "dispose-" + f.receipt.ReceiptNo, CreatedBy: 1})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.inv.PostPurchaseRejectionDisposition(t.Context(), &biz.PurchaseRejectionDispositionMutation{ID: created.ID, ExpectedVersion: created.Version, ActorID: 2}); err != nil {
		t.Fatal(err)
	}
}

func TestPurchaseReceiptMixedQualityPostsOnlyPassedLinesAndSettlesIndependently(t *testing.T) {
	for _, dispositionFirst := range []bool{false, true} {
		name := "post_first"
		if dispositionFirst {
			name = "dispose_first"
		}
		t.Run(name, func(t *testing.T) {
			f := newPartialInboundFixture(t, "mixed_"+name)
			f.decide(t, 4, true)
			f.decide(t, 6, false)
			if dispositionFirst {
				f.dispose(t)
			}
			posted, err := f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID)
			if err != nil || posted.PostedLines != 1 {
				t.Fatalf("partial inbound=%+v err=%v", posted, err)
			}
			if !dispositionFirst {
				assertFulfillmentTask(t, t.Context(), f.client, "receipt_inbound", f.receipt.ID, "blocked", biz.WarehouseRoleKey)
				f.dispose(t)
			}
			assertFulfillmentTask(t, t.Context(), f.client, "receipt_inbound", f.receipt.ID, "done", biz.WarehouseRoleKey)
			current, err := f.inv.GetPurchaseReceipt(t.Context(), f.receipt.ID)
			if err != nil || current.PendingInboundLines != 0 || current.CanPost {
				t.Fatalf("settled=%+v err=%v", current, err)
			}
			for _, item := range current.Items {
				if item.RejectionDisposed != (item.ID == f.items[6].ID) || item.Posted != (item.ID == f.items[4].ID) {
					t.Fatalf("line settlement projection=%+v", item)
				}
			}
			if _, err = f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID); err != nil {
				t.Fatalf("post replay=%v", err)
			}
			if count := f.client.InventoryTxn.Query().Where(inventorytxn.TxnType(biz.InventoryTxnIn)).CountX(t.Context()); count != 1 {
				t.Fatalf("inbound txns=%d", count)
			}
			balance, err := f.inv.GetInventoryBalance(t.Context(), biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.fixtures.materialID, WarehouseID: f.fixtures.warehouseID, LotID: f.items[4].LotID, UnitID: f.fixtures.unitID})
			if err != nil || !balance.Quantity.Equal(decimal.NewFromInt(4)) {
				t.Fatalf("passed balance=%+v err=%v", balance, err)
			}
			po := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(f.data, log.NewStdLogger(io.Discard)))
			progress, err := po.GetPurchaseOrderReceiptProgress(t.Context(), f.orderID)
			if err != nil {
				t.Fatal(err)
			}
			total := decimal.Zero
			reserved := decimal.Zero
			for _, item := range progress.Items {
				total = total.Add(item.EffectiveReceivedQuantity)
				reserved = reserved.Add(item.DraftReservedQuantity)
			}
			if total.String() != "4" || !reserved.IsZero() {
				t.Fatalf("received=%s reserved=%s", total, reserved)
			}
			facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
			payable, err := facts.CreatePayableFromPurchaseReceipt(t.Context(), &biz.FinanceFactFromPurchaseReceiptCreate{FactNo: "AP-MIXED", PurchaseReceiptID: f.receipt.ID, IdempotencyKey: "ap-mixed"})
			if err != nil || payable.Amount.String() != "8" {
				t.Fatalf("payable=%+v err=%v", payable, err)
			}
			disposition := f.client.PurchaseRejectionDisposition.Query().FirstX(t.Context())
			if _, err := f.inv.CancelPurchaseRejectionDisposition(t.Context(), &biz.PurchaseRejectionDispositionMutation{ID: disposition.ID, ExpectedVersion: disposition.Version, ActorID: 3, Reason: "模拟撤销"}); !errors.Is(err, biz.ErrPurchaseReceiptFinanceDependency) {
				t.Fatalf("payable source reopened=%v", err)
			}
			_, err = f.inv.CreatePurchaseReturnFromReceipt(t.Context(), &biz.PurchaseReturnFromReceiptCreate{PurchaseReceiptID: f.receipt.ID, ReturnNo: "RETURN-UNPOSTED", IdempotencyKey: "return-unposted", Items: []biz.PurchaseReturnFromReceiptItemCreate{{PurchaseReceiptItemID: f.items[6].ID, Quantity: decimal.NewFromInt(1)}}})
			if err == nil {
				t.Fatal("unposted rejected line created a return")
			}
		})
	}
}

func TestPurchaseReceiptPendingLineCanPassAndPostAfterPartialInbound(t *testing.T) {
	f := newPartialInboundFixture(t, "partial_pending")
	f.decide(t, 4, true)
	first, err := f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID)
	if err != nil || first.PendingInboundLines != 1 {
		t.Fatalf("first=%+v err=%v", first, err)
	}
	facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
	if _, err := facts.CreatePayableFromPurchaseReceipt(t.Context(), &biz.FinanceFactFromPurchaseReceiptCreate{FactNo: "AP-PENDING", PurchaseReceiptID: f.receipt.ID, IdempotencyKey: "ap-pending"}); !errors.Is(err, biz.ErrPurchaseReceiptInboundIncomplete) {
		t.Fatalf("premature payable=%v", err)
	}
	f.decide(t, 6, true)
	second, err := f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID)
	if err != nil || second.PostedLines != 2 || second.PendingInboundLines != 0 || !second.PostedAt.Equal(*first.PostedAt) {
		t.Fatalf("second=%+v err=%v", second, err)
	}
	if count := f.client.InventoryTxn.Query().Where(inventorytxn.TxnType(biz.InventoryTxnIn)).CountX(t.Context()); count != 2 {
		t.Fatalf("line postings=%d", count)
	}
	if _, err = facts.CreatePayableFromPurchaseReceipt(t.Context(), &biz.FinanceFactFromPurchaseReceiptCreate{FactNo: "AP-COMPLETE", PurchaseReceiptID: f.receipt.ID, IdempotencyKey: "ap-complete"}); err != nil {
		t.Fatal(err)
	}
}

func TestPurchaseReceiptPartialCancellationReversesOnlyPostedLines(t *testing.T) {
	f := newPartialInboundFixture(t, "partial_cancel")
	f.decide(t, 4, true)
	if _, err := f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.inv.CancelPostedPurchaseReceipt(t.Context(), f.receipt.ID); err != nil {
		t.Fatalf("partial cancellation=%v", err)
	}
	if count := f.client.InventoryTxn.Query().Where(inventorytxn.TxnType(biz.InventoryTxnReversal)).CountX(t.Context()); count != 1 {
		t.Fatalf("reversals=%d", count)
	}
	inspection := f.client.QualityInspection.GetX(t.Context(), f.inspections[6].ID)
	if inspection.Status != biz.QualityInspectionStatusCancelled {
		t.Fatalf("pending inspection=%s", inspection.Status)
	}
	if _, err := f.inv.CancelPostedPurchaseReceipt(t.Context(), f.receipt.ID); err != nil {
		t.Fatal(err)
	}
	if count := f.client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(f.receipt.ID)).CountX(t.Context()); count != 2 {
		t.Fatal("cancellation removed source lines")
	}
}

func TestPurchaseReceiptReadyLinesRollbackTogetherAndRetry(t *testing.T) {
	const fixtureKey = "partial_rollback"
	f := newPartialInboundFixture(t, fixtureKey)
	f.decide(t, 4, true)
	f.decide(t, 6, true)
	fault := injectSecondInboundFailure(t, f.data, fixtureKey)
	if _, err := f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID); !errors.Is(err, fault.injected) {
		t.Fatalf("inbound failure=%v", err)
	}
	if fault.inserts != 2 {
		t.Fatalf("fault reached after %d ledger inserts, want 2", fault.inserts)
	}

	if f.client.InventoryTxn.Query().CountX(t.Context()) != 0 {
		t.Fatal("failed inbound leaked a ledger entry")
	}
	if f.client.PurchaseReceipt.GetX(t.Context(), f.receipt.ID).Status != biz.PurchaseReceiptStatusDraft {
		t.Fatal("failed inbound changed the header")
	}
	fault.enabled = false
	if _, err := f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID); err != nil {
		t.Fatalf("inbound retry=%v", err)
	}
	if f.client.InventoryTxn.Query().Where(inventorytxn.TxnType(biz.InventoryTxnIn)).CountX(t.Context()) != 2 {
		t.Fatal("retry did not post exactly two source lines")
	}
}

func TestPurchaseReceiptPartialReplacementKeepsExceptionOpen(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "partial_replacement_exception")
	fixtures := createInventoryTestFixtures(t, t.Context(), client)
	testPurchaseReceiptPartialReplacementKeepsExceptionOpen(t, data, client, fixtures)
}

func testPurchaseReceiptPartialReplacementKeepsExceptionOpen(t *testing.T, data *Data, client *ent.Client, fixtures inventoryTestFixtures) {
	t.Helper()
	ctx := t.Context()
	key := "partial-rpl-" + postgresTestSuffix()
	inv := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	line := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, key, decimal.NewFromInt(10))
	receipt, err := inv.CreatePurchaseReceiptFromPurchaseOrder(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: line.PurchaseOrderID, AllRemaining: true, ReceiptNo: "PR-" + key, WarehouseID: fixtures.warehouseID, IdempotencyKey: key})
	if err != nil {
		t.Fatal(err)
	}
	inspection := receipt.QualityInspections[0]
	if _, err := inv.RejectQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultReject)); err != nil {
		t.Fatal(err)
	}
	var replacementID, replacementTaskID int
	for index, kind := range []string{biz.PurchaseRejectionReturnToVendor, biz.PurchaseRejectionReplace} {
		quantity := decimal.NewFromInt(int64(4 + index*2))
		disposition, err := inv.CreatePurchaseRejectionDisposition(ctx, &biz.PurchaseRejectionDispositionCreate{DispositionNo: key + kind, QualityInspectionID: inspection.ID, DispositionType: kind, Quantity: quantity, Reason: "模拟部分退厂及补换", IdempotencyKey: key + kind, CreatedBy: 1})
		if err != nil {
			t.Fatal(err)
		}
		input := &biz.PurchaseRejectionDispositionMutation{ID: disposition.ID, ExpectedVersion: disposition.Version, ActorID: 2}
		if kind == biz.PurchaseRejectionReplace {
			input.CountedQuantity = &quantity
		}
		posted, err := inv.PostPurchaseRejectionDisposition(ctx, input)
		if err != nil {
			t.Fatal(err)
		}
		if posted.ReplacementReceiptID != nil {
			replacementID = *posted.ReplacementReceiptID
			replacementTaskID = assertFulfillmentTask(t, ctx, client, "receipt_replacement", posted.ID, "done", biz.WarehouseRoleKey).ID
		}
	}
	// The returned four units can arrive on another line of this same purchase
	// order. The replacement receipt then has independently inspected lines.
	added, err := inv.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{ReceiptID: replacementID, PurchaseOrderItemID: &line.ID, MaterialID: fixtures.materialID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(4), IdempotencyKey: key + "-extra-arrival"})
	if err != nil {
		t.Fatal(err)
	}
	inspections, _, err := inv.ListQualityInspections(ctx, biz.QualityInspectionFilter{PurchaseReceiptID: replacementID, Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	var pendingID int
	for _, iqc := range inspections {
		if *iqc.PurchaseReceiptItemID == added.ID {
			pendingID = iqc.ID
			continue
		}
		if _, err := inv.PassQualityInspection(ctx, approximateQualityInspectionDecision(iqc.ID, biz.QualityInspectionResultPass)); err != nil {
			t.Fatal(err)
		}
	}
	if pendingID == 0 {
		t.Fatal("the additional arrival must have its own pending inspection")
	}
	workflow := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	query := biz.WorkflowExceptionQuery{Limit: 10, Visibility: &biz.WorkflowTaskVisibilityScope{StandaloneAllowAllOwnerRoles: true}, TrackingRef: &biz.WorkflowTrackingRef{Kind: "task", ID: replacementTaskID}}
	assertState := func(closed int) {
		t.Helper()
		board, err := workflow.ListWorkflowExceptions(ctx, query)
		if err != nil || board.Total != 1 || board.Closed != closed {
			t.Fatalf("replacement exception closed=%d: %+v err=%v", closed, board, err)
		}
	}
	if _, err := inv.PostPurchaseReceipt(ctx, replacementID); err != nil {
		t.Fatal(err)
	}
	assertState(0)
	if _, err := inv.PassQualityInspection(ctx, approximateQualityInspectionDecision(pendingID, biz.QualityInspectionResultPass)); err != nil {
		t.Fatal(err)
	}
	if _, err := inv.PostPurchaseReceipt(ctx, replacementID); err != nil {
		t.Fatal(err)
	}
	assertState(1)
}
