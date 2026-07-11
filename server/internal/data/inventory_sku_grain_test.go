package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorytxn"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func createInventoryTestSKU(t *testing.T, ctx context.Context, client *ent.Client, productID, unitID int, code string) *ent.ProductSKU {
	t.Helper()
	row, err := client.ProductSKU.Create().
		SetProductID(productID).
		SetSkuCode(code).
		SetDefaultUnitID(unitID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create product SKU %s: %v", code, err)
	}
	return row
}

func TestInventorySKUGrainIsolationLotAndReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "inventory_sku_grain_isolation")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	skuA := createInventoryTestSKU(t, ctx, client, fixtures.productID, fixtures.unitID, "SKU-GRAIN-A")
	skuB := createInventoryTestSKU(t, ctx, client, fixtures.productID, fixtures.unitID, "SKU-GRAIN-B")

	apply := func(key string, skuID *int, txnType string, direction int, quantity int64, reversalOf *int, lotID *int) (*biz.InventoryTxnApplyResult, error) {
		return uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType:     biz.InventorySubjectProduct,
			SubjectID:       fixtures.productID,
			ProductSkuID:    skuID,
			WarehouseID:     fixtures.warehouseID,
			LotID:           lotID,
			TxnType:         txnType,
			Direction:       direction,
			Quantity:        decimal.NewFromInt(quantity),
			UnitID:          fixtures.unitID,
			SourceType:      "SKU_GRAIN_TEST",
			IdempotencyKey:  key,
			ReversalOfTxnID: reversalOf,
		})
	}

	if _, err := apply("sku-grain-legacy-in", nil, biz.InventoryTxnIn, 1, 10, nil, nil); err != nil {
		t.Fatalf("seed unspecified product stock: %v", err)
	}
	if _, err := apply("sku-grain-a-in", &skuA.ID, biz.InventoryTxnIn, 1, 5, nil, nil); err != nil {
		t.Fatalf("seed SKU A stock: %v", err)
	}
	if _, err := apply("sku-grain-b-in", &skuB.ID, biz.InventoryTxnIn, 1, 7, nil, nil); err != nil {
		t.Fatalf("seed SKU B stock: %v", err)
	}
	balances, total, err := uc.ListInventoryBalances(ctx, biz.InventoryBalanceFilter{
		SubjectType: biz.InventorySubjectProduct,
		SubjectID:   fixtures.productID,
		Limit:       20,
	})
	if err != nil || total != 3 || len(balances) != 3 {
		t.Fatalf("list distinct SKU balances total=%d len=%d err=%v", total, len(balances), err)
	}

	outA, err := apply("sku-grain-a-out", &skuA.ID, biz.InventoryTxnOut, -1, 2, nil, nil)
	if err != nil {
		t.Fatalf("deduct SKU A: %v", err)
	}
	if _, err := apply("sku-grain-a-over", &skuA.ID, biz.InventoryTxnOut, -1, 4, nil, nil); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("SKU A must not consume SKU B or unspecified stock, got %v", err)
	}
	reversalOf := outA.Txn.ID
	if _, err := apply("sku-grain-a-reversal", &skuA.ID, biz.InventoryTxnReversal, 1, 2, &reversalOf, nil); err != nil {
		t.Fatalf("reverse SKU A deduction: %v", err)
	}
	if _, err := apply("sku-grain-a-in", &skuB.ID, biz.InventoryTxnIn, 1, 5, nil, nil); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("same idempotency key with a different SKU must conflict, got %v", err)
	}

	lotA, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType:  biz.InventorySubjectProduct,
		SubjectID:    fixtures.productID,
		ProductSkuID: &skuA.ID,
		LotNo:        "LOT-SKU-GRAIN-A",
	})
	if err != nil {
		t.Fatalf("create SKU A lot: %v", err)
	}
	if lotA.ProductSkuID == nil || *lotA.ProductSkuID != skuA.ID {
		t.Fatalf("lot SKU = %v, want %d", lotA.ProductSkuID, skuA.ID)
	}
	if _, err := apply("sku-grain-wrong-lot", &skuB.ID, biz.InventoryTxnIn, 1, 1, nil, &lotA.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("SKU B must not post to SKU A lot, got %v", err)
	}
	if _, err := apply("sku-grain-right-lot", &skuA.ID, biz.InventoryTxnIn, 1, 1, nil, &lotA.ID); err != nil {
		t.Fatalf("SKU A post to matching lot: %v", err)
	}
	if _, err := uc.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType:  biz.InventorySubjectMaterial,
		SubjectID:    fixtures.materialID,
		ProductSkuID: &skuA.ID,
		LotNo:        "MATERIAL-MUST-NOT-HAVE-SKU",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("material lot with product SKU must fail, got %v", err)
	}
}

func TestOperationalFactsPostAndReverseExactSKUGrain(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_sku_grain")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	sku := createInventoryTestSKU(t, ctx, client, fixtures.productID, fixtures.unitID, "SKU-FACT-A")

	production, err := uc.CreateProductionFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "PF-SKU-GRAIN",
		FactType:       biz.ProductionFactFinishedGoodsReceipt,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		ProductSkuID:   &sku.ID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(3),
		IdempotencyKey: "PF-SKU-GRAIN",
	})
	if err != nil {
		t.Fatalf("create SKU production fact: %v", err)
	}
	if _, err := uc.PostProductionFact(ctx, production.ID); err != nil {
		t.Fatalf("post SKU production fact: %v", err)
	}
	outsourcing, err := uc.CreateOutsourcingFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "OF-SKU-GRAIN",
		FactType:       biz.OutsourcingFactReturnReceipt,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		ProductSkuID:   &sku.ID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(2),
		IdempotencyKey: "OF-SKU-GRAIN",
	})
	if err != nil {
		t.Fatalf("create SKU outsourcing fact: %v", err)
	}
	if _, err := uc.PostOutsourcingFact(ctx, outsourcing.ID); err != nil {
		t.Fatalf("post SKU outsourcing fact: %v", err)
	}
	balance, err := biz.NewInventoryUsecase(NewInventoryRepo(data, logger)).GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType:  biz.InventorySubjectProduct,
		SubjectID:    fixtures.productID,
		ProductSkuID: &sku.ID,
		WarehouseID:  fixtures.warehouseID,
		UnitID:       fixtures.unitID,
	})
	if err != nil || !balance.Quantity.Equal(decimal.NewFromInt(5)) {
		t.Fatalf("SKU fact balance=%v err=%v, want 5", balance, err)
	}
	if _, err := uc.CancelPostedProductionFact(ctx, production.ID); err != nil {
		t.Fatalf("cancel SKU production fact: %v", err)
	}
	reversal, err := client.InventoryTxn.Query().Where(inventorytxn.IdempotencyKey(
		biz.OperationalFactInventoryIdempotencyKey(biz.ProductionFactSourceType, production.ID, production.ID, "REVERSAL"),
	)).Only(ctx)
	if err != nil || reversal.ProductSkuID == nil || *reversal.ProductSkuID != sku.ID {
		t.Fatalf("production reversal SKU=%v err=%v", reversal, err)
	}

	if _, err := uc.CreateProductionFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo: "PF-MATERIAL-WITH-SKU", FactType: biz.ProductionFactMaterialIssue,
		SubjectType: biz.InventorySubjectMaterial, SubjectID: fixtures.materialID, ProductSkuID: &sku.ID,
		WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
		Quantity: decimal.NewFromInt(1), IdempotencyKey: "PF-MATERIAL-WITH-SKU",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("material production fact with SKU must fail, got %v", err)
	}
}

func TestShipmentAndReservationUseExactSKUAvailability(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "shipment_reservation_sku_grain")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	skuA := createInventoryTestSKU(t, ctx, client, fixtures.productID, fixtures.unitID, "SKU-ALLOC-A")
	skuB := createInventoryTestSKU(t, ctx, client, fixtures.productID, fixtures.unitID, "SKU-ALLOC-B")
	for index, item := range []struct {
		sku      *int
		quantity int64
	}{{&skuA.ID, 2}, {&skuB.ID, 5}, {nil, 9}} {
		if _, err := inventoryUC.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, ProductSkuID: item.sku,
			WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
			TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(item.quantity),
			SourceType: "SKU_ALLOCATION_TEST", IdempotencyKey: fmt.Sprintf("SKU-ALLOC-IN-%d", index),
		}); err != nil {
			t.Fatalf("seed SKU allocation stock %d: %v", index, err)
		}
	}
	reservation, err := operationalUC.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo: "RSV-SKU-A", ProductID: fixtures.productID, ProductSkuID: &skuA.ID,
		WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
		Quantity: decimal.NewFromInt(2), IdempotencyKey: "RSV-SKU-A",
	})
	if err != nil {
		t.Fatalf("reserve SKU A: %v", err)
	}

	ship := func(no string, skuID *int, quantity int64) (*biz.Shipment, error) {
		shipment, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
			Shipment: &biz.ShipmentCreate{ShipmentNo: no, IdempotencyKey: no},
			Items: []*biz.ShipmentItemCreate{{
				ProductID: fixtures.productID, ProductSkuID: skuID, WarehouseID: fixtures.warehouseID,
				UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(quantity),
			}},
		})
		if err != nil {
			return nil, err
		}
		return operationalUC.ShipShipment(ctx, shipment.ID)
	}
	if _, err := ship("SHIP-SKU-B", &skuB.ID, 5); err != nil {
		t.Fatalf("SKU A reservation must not reduce SKU B availability: %v", err)
	}
	if _, err := ship("SHIP-SKU-A-BLOCKED", &skuA.ID, 1); !errors.Is(err, biz.ErrInventoryInsufficientStock) {
		t.Fatalf("SKU A reserved stock must remain unavailable even with legacy stock, got %v", err)
	}
	if _, err := operationalUC.ReleaseStockReservation(ctx, reservation.ID); err != nil {
		t.Fatalf("release SKU A reservation: %v", err)
	}
	if _, err := ship("SHIP-SKU-A", &skuA.ID, 2); err != nil {
		t.Fatalf("ship released SKU A stock: %v", err)
	}
}

func TestProductSKUProductOwnershipCannotDrift(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "product_sku_immutable_product")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	otherProduct := createTestProduct(t, ctx, client, fixtures.unitID, "PRD-SKU-OTHER")
	masterUC := biz.NewMasterDataUsecase(NewMasterDataRepo(data, log.NewStdLogger(io.Discard)))
	sku := createInventoryTestSKU(t, ctx, client, fixtures.productID, fixtures.unitID, "SKU-IMMUTABLE-PRODUCT")

	if _, err := masterUC.UpdateProductSKU(ctx, sku.ID, &biz.ProductSKUMutation{
		ProductID: otherProduct.ID, SKUCode: sku.SkuCode, DefaultUnitID: &fixtures.unitID,
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("moving SKU to another product must fail, got %v", err)
	}
	row := client.ProductSKU.GetX(ctx, sku.ID)
	if row.ProductID != fixtures.productID {
		t.Fatalf("SKU product changed to %d, want %d", row.ProductID, fixtures.productID)
	}

	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SKU-OWNERSHIP", true)
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-SKU-OWNERSHIP", CustomerID: customer.ID, OrderDate: row.CreatedAt,
	})
	if err != nil {
		t.Fatalf("create sales order: %v", err)
	}
	if _, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: order.ID, LineNo: 1, ProductID: otherProduct.ID, ProductSkuID: &sku.ID,
		UnitID: fixtures.unitID, OrderedQuantity: decimal.NewFromInt(1),
	}); !errors.Is(err, biz.ErrProductSKUNotFound) {
		t.Fatalf("sales order product/SKU mismatch must fail, got %v", err)
	}
}
