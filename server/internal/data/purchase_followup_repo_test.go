package data

import (
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func followupQuery(view string) biz.PurchaseFollowupQuery {
	return biz.PurchaseFollowupQuery{View: view, SnapshotAt: time.Date(2026, 10, 26, 4, 0, 0, 0, time.UTC), Limit: 25, Access: biz.PurchaseFollowupAccess{Quality: true, Commercial: true, Finance: true}, WarehouseScope: biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}}
}

func TestPurchaseFollowupsUseReceiptQualityAndDispositionFacts(t *testing.T) {
	f := newPartialInboundFixture(t, "FOLLOWUP-PARTIAL")
	assertPurchaseFollowupReceiptFacts(t, f)
}

func assertPurchaseFollowupReceiptFacts(t *testing.T, f partialInboundFixture) {
	t.Helper()
	uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(f.data, log.NewStdLogger(io.Discard)))
	query := func(view string) biz.PurchaseFollowupQuery { q := followupQuery(view); q.OrderID = f.orderID; return q }
	list := func(view string) *biz.PurchaseFollowupBoard {
		t.Helper()
		out, err := uc.ListPurchaseFollowups(t.Context(), query(view))
		if err != nil {
			t.Fatal(err)
		}
		return out
	}
	if out := list("arrival"); out.Total != 0 {
		t.Fatalf("registered arrivals must not be overdue: %+v", out)
	}
	if out := list("exceptions"); out.Counts["pending_inspection"] != 2 {
		t.Fatalf("pending inspection: %+v", out)
	}
	for _, scope := range []biz.WarehouseDataScope{{Mode: biz.DataScopeModeNone}, {Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.fixtures.productWarehouseID}}} {
		q := query("exceptions")
		q.WarehouseScope = scope
		if out, err := uc.ListPurchaseFollowups(t.Context(), q); err != nil || out.Counts["pending_inspection"] != 0 {
			t.Fatalf("hidden warehouse quality: %+v %v", out, err)
		}
	}
	qVisible := query("exceptions")
	qVisible.WarehouseScope = biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.fixtures.warehouseID}}
	if out, err := uc.ListPurchaseFollowups(t.Context(), qVisible); err != nil || out.Counts["pending_inspection"] != 2 {
		t.Fatalf("assigned warehouse: %+v %v", out, err)
	}
	f.decide(t, 4, true)
	f.decide(t, 6, false)
	if out := list("exceptions"); out.Counts["ready_inbound"] != 1 || out.Counts["rejected"] != 1 || out.Counts["unsettled"] != 0 {
		t.Fatalf("mixed quality: %+v", out)
	}
	if _, err := f.inv.PostPurchaseReceipt(t.Context(), f.receipt.ID); err != nil {
		t.Fatal(err)
	}
	if out := list("exceptions"); out.Counts["ready_inbound"] != 0 || out.Counts["rejected"] != 1 || out.Counts["unsettled"] != 0 {
		t.Fatalf("partial posting is not complete: %+v", out)
	}
	f.dispose(t)
	if out := list("exceptions"); out.Counts["rejected"] != 0 || out.Counts["unsettled"] != 1 {
		t.Fatalf("disposed source ready for finance review: %+v", out)
	}
	if out := list("arrival"); out.Total != 1 || out.Rows[0].Quantity != "6" {
		t.Fatalf("returned rejection reopens existing remaining receipt capacity: %+v", out)
	}
	payable, err := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard))).CreatePayableFromPurchaseReceipt(t.Context(), &biz.FinanceFactFromPurchaseReceiptCreate{PurchaseReceiptID: f.receipt.ID, FactNo: "AP-" + f.receipt.ReceiptNo, IdempotencyKey: "ap-" + f.receipt.ReceiptNo})
	if err != nil {
		t.Fatal(err)
	}
	if payable == nil {
		t.Fatal("missing payable")
	}
	if out := list("exceptions"); out.Counts["unsettled"] != 0 {
		t.Fatalf("existing payable must leave queue: %+v", out)
	}
	q := followupQuery("exceptions")
	q.WarehouseScope = biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}
	if out, err := uc.ListPurchaseFollowups(t.Context(), q); err != nil || out.Counts["rejected"] != 0 || out.Counts["unsettled"] != 0 {
		t.Fatalf("warehouse scope: %+v %v", out, err)
	}
}

func TestPurchaseFollowupsLineDatesFilterBeforePaginationAndHideUnavailableCategories(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "FOLLOWUP-DATES")
	f := createInventoryTestFixtures(t, t.Context(), client)
	assertPurchaseFollowupDates(t, data, client, f, "FOLLOWUP")
}

func assertPurchaseFollowupDates(t *testing.T, data *Data, client *ent.Client, f inventoryTestFixtures, key string) {
	t.Helper()
	first := createApprovedPurchaseOrderItemForReceiptTest(t, t.Context(), client, f, key+"-A", decimal.NewFromInt(10))
	second := createApprovedPurchaseOrderItemForReceiptTest(t, t.Context(), client, f, key+"-B", decimal.NewFromInt(20))
	supplierID := client.PurchaseOrder.GetX(t.Context(), first.PurchaseOrderID).SupplierID
	client.PurchaseOrder.UpdateOneID(second.PurchaseOrderID).SetSupplierID(supplierID).SaveX(t.Context())
	overdue := time.Date(2026, 10, 24, 0, 0, 0, 0, time.UTC)
	future := time.Date(2026, 11, 10, 0, 0, 0, 0, time.UTC)
	client.PurchaseOrder.UpdateOneID(first.PurchaseOrderID).SetSupplierConfirmedArrivalDate(future).SaveX(t.Context())
	client.PurchaseOrderItem.UpdateOneID(first.ID).SetExpectedArrivalDate(overdue).ClearUnitPrice().ClearAmount().SaveX(t.Context())
	client.PurchaseOrderItem.UpdateOneID(second.ID).SetExpectedArrivalDate(future).SaveX(t.Context())
	uc := biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, log.NewStdLogger(io.Discard)))
	q := followupQuery("arrival")
	q.SupplierID = supplierID
	q.Limit = 1
	out, err := uc.ListPurchaseFollowups(t.Context(), q)
	if err != nil || out.Total != 2 || out.Counts["overdue"] != 1 || out.Rows[0].LineID != first.ID || out.Rows[0].DueDate != "2026-10-24" || out.Rows[0].DateSource != "line" {
		t.Fatalf("line override and global counts: %+v %v", out, err)
	}
	q.Offset = 1
	out, err = uc.ListPurchaseFollowups(t.Context(), q)
	if err != nil || len(out.Rows) != 1 || out.Rows[0].LineID != second.ID {
		t.Fatalf("page: %+v %v", out, err)
	}
	q.Kind = "overdue"
	q.Offset = 0
	out, err = uc.ListPurchaseFollowups(t.Context(), q)
	if err != nil || out.Total != 1 {
		t.Fatalf("filter before page: %+v %v", out, err)
	}
	client.PurchaseOrderItem.UpdateOneID(first.ID).ClearExpectedArrivalDate().SaveX(t.Context())
	q.Kind = "date"
	q.SelectedDate = "2026-11-10"
	q.StartDate = "2026-11-01"
	out, err = uc.ListPurchaseFollowups(t.Context(), q)
	if err != nil || out.Total != 2 || out.Days["2026-11-10"] != 2 || out.Rows[0].DateSource != "confirmed" {
		t.Fatalf("header fallback and calendar: %+v %v", out, err)
	}
	q.Confirmation = "confirmed"
	out, err = uc.ListPurchaseFollowups(t.Context(), q)
	if err != nil || out.Total != 1 {
		t.Fatalf("date source filter: %+v %v", out, err)
	}
	q.Confirmation = "all"
	q.Keyword = "no%match_"
	out, err = uc.ListPurchaseFollowups(t.Context(), q)
	if err != nil || out.Total != 0 {
		t.Fatalf("literal keyword: %+v %v", out, err)
	}
	q.Keyword = ""
	q.Kind = "all"
	q.View = "exceptions"
	q.Access = biz.PurchaseFollowupAccess{}
	out, err = uc.ListPurchaseFollowups(t.Context(), q)
	if err != nil || out.Counts["missing_price"] != 0 {
		t.Fatalf("hidden price state: %+v %v", out, err)
	}
	client.PurchaseOrder.UpdateOneID(first.PurchaseOrderID).SetLifecycleStatus(biz.PurchaseOrderStatusDraft).SaveX(t.Context())
	client.PurchaseOrderItem.UpdateOneID(second.ID).SetLineStatus(biz.PurchaseOrderItemStatusClosed).SaveX(t.Context())
	q.View = "arrival"
	out, err = uc.ListPurchaseFollowups(t.Context(), q)
	if err != nil || out.Total != 0 {
		t.Fatalf("draft and closed lines excluded: %+v %v", out, err)
	}
}

func TestPurchaseFollowupsPostgresDatesAndReceiptFacts(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	pg := createInventoryPostgresFixtures(t, t.Context(), client)
	f := inventoryTestFixtures{unitID: pg.unitID, materialID: pg.materialID, warehouseID: pg.warehouseID, productWarehouseID: pg.productWarehouseID, productID: pg.productID}
	assertPurchaseFollowupDates(t, data, client, f, "PG-FU-"+pg.suffix)
	assertPurchaseFollowupReceiptFacts(t, partialInboundFixtureWithData(t, data, client, f, "PG-FUR-"+pg.suffix))
}
