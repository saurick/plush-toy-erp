package data

import (
	"fmt"
	"io"
	"reflect"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestFactDocumentListsBatchItems(t *testing.T) {
	runFactDocumentListsBatchItems(t, false)
}

func TestOperationalFactPostgresDocumentListsBatchItems(t *testing.T) {
	runFactDocumentListsBatchItems(t, true)
}

func openPerformanceReadTestData(t *testing.T, name string, postgres bool) (*Data, *ent.Client, *sourceDocumentListQueryCapture, inventoryTestFixtures, string) {
	t.Helper()
	capture := &sourceDocumentListQueryCapture{}
	var data *Data
	var client *ent.Client
	if postgres {
		data, _ = openInventoryPostgresTestData(t)
		// The existing PostgreSQL helper owns and closes the shared SQL handle.
		client = ent.NewClient(ent.Driver(entsql.OpenDB(dialect.Postgres, data.sqldb)), ent.Debug(), ent.Log(capture.log))
		data.postgres = client
	} else {
		data, client = openInventoryRepoTestData(t, name, ent.Debug(), ent.Log(capture.log))
	}
	f := createInventoryPostgresFixtures(t, t.Context(), client)
	return data, client, capture, inventoryTestFixtures{
		unitID: f.unitID, materialID: f.materialID, productID: f.productID,
		warehouseID: f.warehouseID, productWarehouseID: f.productWarehouseID,
	}, "BATCH-" + f.suffix
}

func runFactDocumentListsBatchItems(t *testing.T, postgres bool) {
	t.Helper()
	ctx := t.Context()
	data, client, capture, f, prefix := openPerformanceReadTestData(t, "fact_document_list_batch", postgres)
	inventory := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	facts := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	receipt := client.PurchaseReceipt.Create().SetReceiptNo(prefix + "-RECEIPT").SetSupplierName("历史供应商").SetReceivedAt(time.Now()).SaveX(ctx)
	source := client.PurchaseReceiptItem.Create().SetReceiptID(receipt.ID).SetMaterialID(f.materialID).SetWarehouseID(f.warehouseID).SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(1000)).SaveX(ctx)
	for i := 1; i <= 500; i++ {
		no := fmt.Sprintf("%s-%04d", prefix, i)
		shipment := client.Shipment.Create().SetShipmentNo(no).SetIdempotencyKey(no).SaveX(ctx)
		returned := client.PurchaseReturn.Create().SetReturnNo(no).SetSupplierName("历史供应商").SetReturnedAt(time.Now()).SaveX(ctx)
		adjustment := client.PurchaseReceiptAdjustment.Create().SetAdjustmentNo(no).SetPurchaseReceiptID(receipt.ID).SetAdjustedAt(time.Now()).SaveX(ctx)
		for j := 1; j <= 2; j++ {
			quantity := decimal.NewFromInt(int64(j))
			client.ShipmentItem.Create().SetShipmentID(shipment.ID).SetProductID(f.productID).SetWarehouseID(f.productWarehouseID).SetUnitID(f.unitID).SetQuantity(quantity).SaveX(ctx)
			client.PurchaseReturnItem.Create().SetReturnID(returned.ID).SetMaterialID(f.materialID).SetWarehouseID(f.warehouseID).SetUnitID(f.unitID).SetQuantity(quantity).SaveX(ctx)
			client.PurchaseReceiptAdjustmentItem.Create().SetAdjustmentID(adjustment.ID).SetPurchaseReceiptItemID(source.ID).SetAdjustType("SUPPLEMENT").SetMaterialID(f.materialID).SetWarehouseID(f.warehouseID).SetUnitID(f.unitID).SetQuantity(quantity).SaveX(ctx)
		}
	}
	for _, limit := range []int{1, 50, 500} {
		t.Run(fmt.Sprint(limit), func(t *testing.T) {
			checkCount := func(name string, rows, total int, err error) {
				t.Helper()
				if err != nil || rows != limit || total != 500 {
					t.Fatalf("%s rows=%d total=%d err=%v", name, rows, total, err)
				}
				count := capture.selectCount()
				t.Logf("%s rows=%d SELECTs=%d", name, rows, count)
				if count != 3 {
					t.Fatalf("%s: expected count + headers + items, got %d SELECTs", name, count)
				}
			}
			capture.reset()
			shipments, total, err := facts.ListShipments(ctx, biz.OperationalFactFilter{Limit: limit, Keyword: prefix})
			checkCount("shipments", len(shipments), total, err)
			for _, row := range shipments {
				detail, err := facts.GetShipment(ctx, row.ID)
				if err != nil || !reflect.DeepEqual(row, detail) || len(row.Items) != 2 {
					t.Fatalf("shipment list differs from detail: id=%d err=%v", row.ID, err)
				}
			}
			capture.reset()
			returns, total, err := inventory.ListPurchaseReturns(ctx, biz.PurchaseReturnFilter{Limit: limit, Keyword: prefix})
			checkCount("purchase returns", len(returns), total, err)
			for _, row := range returns {
				detail, err := inventory.GetPurchaseReturn(ctx, row.ID)
				if err != nil || !reflect.DeepEqual(row, detail) || len(row.Items) != 2 {
					t.Fatalf("return list differs from detail: id=%d err=%v", row.ID, err)
				}
			}
			capture.reset()
			adjustments, total, err := inventory.ListPurchaseReceiptAdjustments(ctx, biz.PurchaseReceiptAdjustmentFilter{Limit: limit, Keyword: prefix})
			checkCount("receipt adjustments", len(adjustments), total, err)
			for _, row := range adjustments {
				detail, err := inventory.GetPurchaseReceiptAdjustment(ctx, row.ID)
				if err != nil || !reflect.DeepEqual(row, detail) || len(row.Items) != 2 {
					t.Fatalf("adjustment list differs from detail: id=%d err=%v", row.ID, err)
				}
			}
		})
	}
}

func TestProductionReceiptDeductionsBatchQueries(t *testing.T) {
	runProductionReceiptDeductionsBatchQueries(t, false)
}

func TestInventoryPostgresProductionReceiptDeductionsBatchQueries(t *testing.T) {
	runProductionReceiptDeductionsBatchQueries(t, true)
}

func runProductionReceiptDeductionsBatchQueries(t *testing.T, postgres bool) {
	t.Helper()
	ctx := t.Context()
	_, client, capture, f, prefix := openPerformanceReadTestData(t, "production_receipt_deduction_batch", postgres)
	ids := make([]int, 500)
	for i := range ids {
		no := fmt.Sprintf("%s-%d", prefix, i)
		receipt := client.ProductionFact.Create().SetFactNo(no).SetFactType(biz.ProductionFactFinishedGoodsReceipt).
			SetSubjectType(biz.InventorySubjectProduct).SetSubjectID(f.productID).SetWarehouseID(f.productWarehouseID).
			SetUnitID(f.unitID).SetQuantity(decimal.NewFromInt(3)).SetIdempotencyKey(no).SaveX(ctx)
		ids[i] = receipt.ID
		for _, direction := range []int{-1, 1} {
			kind, quantity := "OUT", int64(2)
			if direction > 0 {
				kind, quantity = "IN", 1
			}
			client.InventoryTxn.Create().SetSubjectType("PRODUCT").SetSubjectID(f.productID).SetWarehouseID(f.productWarehouseID).SetUnitID(f.unitID).
				SetTxnType(kind).SetDirection(direction).SetQuantity(decimal.NewFromInt(quantity)).SetSourceType(biz.ProductionExceptionSourceType).
				SetSourceLineID(ids[i]).SetIdempotencyKey(fmt.Sprintf("%s-%d", no, direction)).SaveX(ctx)
		}
	}
	for _, size := range []int{0, 1, 50, 500} {
		capture.reset()
		quantities, err := productionReceiptReworkedQuantities(ctx, client, ids[:size])
		if err != nil || len(quantities) != size {
			t.Fatalf("size=%d results=%d err=%v", size, len(quantities), err)
		}
		for _, id := range ids[:size] {
			assertDecimalEqual(t, quantities[id], "1")
		}
		want := 2
		if size == 0 {
			want = 0
		}
		if got := capture.selectCount(); got != want {
			t.Fatalf("receipts=%d SELECTs=%d want=%d", size, got, want)
		}
		t.Logf("receipts=%d SELECTs=%d", size, capture.selectCount())
	}
}

func TestMasterDataExactReferencesKeepHistoryAndFilters(t *testing.T) {
	runMasterDataExactReferencesKeepHistoryAndFilters(t, false)
}

func TestMasterDataSchemaPostgresExactReferencesKeepHistoryAndFilters(t *testing.T) {
	runMasterDataExactReferencesKeepHistoryAndFilters(t, true)
}

func runMasterDataExactReferencesKeepHistoryAndFilters(t *testing.T, postgres bool) {
	t.Helper()
	ctx := t.Context()
	data, client, _, _, prefix := openPerformanceReadTestData(t, "masterdata_exact_reference_history", postgres)
	uc := biz.NewMasterDataUsecase(NewMasterDataRepo(data, log.NewStdLogger(io.Discard)))
	historical := client.Customer.Create().SetCode(prefix + "-HISTORY").SetName("历史客户").SetIsActive(false).SaveX(ctx)
	client.Customer.Create().SetCode(prefix + "-UNRELATED").SetName("其他客户").SaveX(ctx)
	rows, total, err := uc.ListCustomers(ctx, biz.MasterDataFilter{IDs: []int{historical.ID}, Limit: 200})
	if err != nil || total != 1 || len(rows) != 1 || rows[0].IsActive || rows[0].ID != historical.ID {
		t.Fatalf("historical reference lost: total=%d rows=%v err=%v", total, rows, err)
	}
	for _, filter := range []biz.MasterDataFilter{
		{IDs: []int{historical.ID}, ActiveOnly: true},
		{IDs: []int{historical.ID}, Keyword: "UNRELATED"},
		{IDs: []int{historical.ID}, LifecycleScope: biz.LifecycleScopeCurrent},
		{IDs: []int{999999}},
	} {
		rows, total, err := uc.ListCustomers(ctx, filter)
		if err != nil || total != 0 || len(rows) != 0 {
			t.Fatalf("exact IDs bypassed filters: total=%d rows=%v err=%v", total, rows, err)
		}
	}
	for _, ids := range [][]int{{}, {0}, {historical.ID, historical.ID}, make([]int, 201)} {
		if _, _, err := uc.ListCustomers(ctx, biz.MasterDataFilter{IDs: ids}); err == nil {
			t.Fatalf("invalid batch accepted: %v", ids)
		}
	}
}

func TestInventoryPostgresExactReferencesKeepWarehouseScope(t *testing.T) {
	ctx := t.Context()
	data, client, _, f, prefix := openPerformanceReadTestData(t, "exact_reference_warehouse_scope", true)
	other := createTestProductWarehouse(t, ctx, client, prefix+"-OTHER")
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	ids := make([]int, 0, 2)
	for i, warehouseID := range []int{f.productWarehouseID, other.ID} {
		no := fmt.Sprintf("%s-%d", prefix, i)
		lot := createTestInventoryLot(t, ctx, uc, biz.InventorySubjectProduct, f.productID, no)
		_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType: biz.InventorySubjectProduct, SubjectID: f.productID, WarehouseID: warehouseID,
			LotID: &lot.ID, UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1,
			Quantity: decimal.NewFromInt(2), SourceType: "TEST", IdempotencyKey: no,
		})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, lot.ID)
	}
	assigned := biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.productWarehouseID}}
	for _, scope := range []biz.WarehouseDataScope{assigned, {Mode: biz.DataScopeModeNone}, {Mode: biz.DataScopeModeAssigned}} {
		rows, total, err := uc.ListInventoryLotsForAccess(ctx, biz.InventoryLotFilter{IDs: ids, Limit: 200}, scope)
		want := 0
		if len(scope.WarehouseIDs) > 0 {
			want = 1
		}
		if err != nil || total != want || len(rows) != want || (want == 1 && rows[0].ID != ids[0]) {
			t.Fatalf("exact lot IDs bypassed warehouse scope: scope=%+v rows=%v total=%d err=%v", scope, rows, total, err)
		}
	}
	master := biz.NewMasterDataUsecase(NewMasterDataRepo(data, log.NewStdLogger(io.Discard)))
	rows, total, err := master.ListWarehousesForAccess(ctx, biz.MasterDataFilter{IDs: []int{f.productWarehouseID, other.ID}}, assigned)
	if err != nil || total != 1 || len(rows) != 1 || rows[0].ID != f.productWarehouseID {
		t.Fatalf("exact warehouse IDs bypassed scope: rows=%v total=%d err=%v", rows, total, err)
	}
}
