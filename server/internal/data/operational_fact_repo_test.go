package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/shipment"
	"server/internal/data/model/ent/stockreservation"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOperationalFactRepo_ProductionFactPostAndCancelWritesInventoryReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_production")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))

	fact, err := repo.CreateProductionFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "PF-001",
		FactType:       biz.ProductionFactFinishedGoodsReceipt,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(3),
		IdempotencyKey: "PF-001",
	})
	if err != nil {
		t.Fatalf("create production fact failed: %v", err)
	}
	posted, err := repo.PostProductionFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("post production fact failed: %v", err)
	}
	if posted.Status != biz.OperationalFactStatusPosted {
		t.Fatalf("expected POSTED, got %s", posted.Status)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ProductionFactSourceType)).CountX(ctx); count != 1 {
		t.Fatalf("expected one production inventory txn, got %d", count)
	}
	cancelled, err := repo.CancelPostedProductionFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("cancel production fact failed: %v", err)
	}
	if cancelled.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("expected CANCELLED, got %s", cancelled.Status)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ProductionFactSourceType)).CountX(ctx); count != 2 {
		t.Fatalf("expected original + reversal production txns, got %d", count)
	}
}

func TestOperationalFactUsecase_RejectsInactiveNewReferencesAndKeepsHistoricalActionsAllowed(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_inactive_refs")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))

	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_INACTIVE_REFS",
		IdempotencyKey: "TEST_INACTIVE_REFS:IN",
	}); err != nil {
		t.Fatalf("seed product inventory failed: %v", err)
	}
	fact, err := uc.CreateProductionFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "PF-INACTIVE-HISTORY",
		FactType:       biz.ProductionFactFinishedGoodsReceipt,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(1),
		IdempotencyKey: "PF-INACTIVE-HISTORY",
	})
	if err != nil {
		t.Fatalf("create production fact failed: %v", err)
	}
	if _, err := uc.PostProductionFact(ctx, fact.ID); err != nil {
		t.Fatalf("post production fact failed: %v", err)
	}
	reservation, err := uc.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo:  "RSV-INACTIVE-HISTORY",
		ProductID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(1),
		IdempotencyKey: "RSV-INACTIVE-HISTORY",
	})
	if err != nil {
		t.Fatalf("create stock reservation failed: %v", err)
	}

	if _, err := client.Product.UpdateOneID(fixtures.productID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable product failed: %v", err)
	}
	if cancelled, err := uc.CancelPostedProductionFact(ctx, fact.ID); err != nil {
		t.Fatalf("cancel posted production fact should not be blocked by inactive product: %v", err)
	} else if cancelled.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("expected cancelled production fact, got %s", cancelled.Status)
	}
	if released, err := uc.ReleaseStockReservation(ctx, reservation.ID); err != nil {
		t.Fatalf("release reservation should not be blocked by inactive product: %v", err)
	} else if released.Status != biz.StockReservationStatusReleased {
		t.Fatalf("expected released reservation, got %s", released.Status)
	}
	if _, err := uc.CreateProductionFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "PF-INACTIVE-NEW",
		FactType:       biz.ProductionFactFinishedGoodsReceipt,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(1),
		IdempotencyKey: "PF-INACTIVE-NEW",
	}); !errors.Is(err, biz.ErrProductInactive) {
		t.Fatalf("expected inactive product rejected for new production fact, got %v", err)
	}

	activeProduct := createTestProduct(t, ctx, client, fixtures.unitID, "PRD-OP-ACTIVE")
	if _, err := client.Warehouse.UpdateOneID(fixtures.warehouseID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable warehouse failed: %v", err)
	}
	if _, err := uc.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo:  "RSV-INACTIVE-NEW",
		ProductID:      activeProduct.ID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(1),
		IdempotencyKey: "RSV-INACTIVE-NEW",
	}); !errors.Is(err, biz.ErrWarehouseInactive) {
		t.Fatalf("expected inactive warehouse rejected for new reservation, got %v", err)
	}
}

func TestOperationalFactUsecase_ShipmentRejectsInactiveManualReferences(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_shipment_inactive_refs")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))

	customer, err := client.Customer.Create().SetCode("C-SHIP-INACTIVE").SetName("停用客户").SetIsActive(false).Save(ctx)
	if err != nil {
		t.Fatalf("create inactive customer failed: %v", err)
	}
	if _, err := uc.CreateShipmentDraft(ctx, &biz.ShipmentCreate{
		ShipmentNo:     "SHP-INACTIVE-CUSTOMER",
		CustomerID:     &customer.ID,
		IdempotencyKey: "SHP-INACTIVE-CUSTOMER",
	}); !errors.Is(err, biz.ErrCustomerInactive) {
		t.Fatalf("expected inactive customer rejected for manual shipment, got %v", err)
	}

	shipment, err := uc.CreateShipmentDraft(ctx, &biz.ShipmentCreate{
		ShipmentNo:     "SHP-INACTIVE-ITEM",
		IdempotencyKey: "SHP-INACTIVE-ITEM",
	})
	if err != nil {
		t.Fatalf("create shipment failed: %v", err)
	}
	if _, err := client.Product.UpdateOneID(fixtures.productID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable product failed: %v", err)
	}
	if _, err := uc.AddShipmentItem(ctx, &biz.ShipmentItemCreate{
		ShipmentID:  shipment.ID,
		ProductID:   fixtures.productID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		Quantity:    decimal.NewFromInt(1),
	}); !errors.Is(err, biz.ErrProductInactive) {
		t.Fatalf("expected inactive product rejected for manual shipment item, got %v", err)
	}

	activeProduct := createTestProduct(t, ctx, client, fixtures.unitID, "PRD-SHIP-SKU-ACTIVE")
	inactiveSKU, err := client.ProductSKU.Create().
		SetProductID(activeProduct.ID).
		SetSkuCode("SKU-SHIP-INACTIVE").
		SetSkuName("停用 SKU").
		SetDefaultUnitID(fixtures.unitID).
		SetIsActive(false).
		Save(ctx)
	if err != nil {
		t.Fatalf("create inactive product SKU failed: %v", err)
	}
	if _, err := uc.AddShipmentItem(ctx, &biz.ShipmentItemCreate{
		ShipmentID:   shipment.ID,
		ProductID:    activeProduct.ID,
		ProductSkuID: &inactiveSKU.ID,
		WarehouseID:  fixtures.warehouseID,
		UnitID:       fixtures.unitID,
		Quantity:     decimal.NewFromInt(1),
	}); !errors.Is(err, biz.ErrProductSKUInactive) {
		t.Fatalf("expected inactive product SKU rejected for manual shipment item, got %v", err)
	}
}

func TestOperationalFactUsecase_SourceLinkedShipmentAndReservationAllowInactiveOrderReferences(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_source_linked_inactive_refs")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))

	customer := createSalesOrderTestCustomer(t, ctx, client, "C-SOURCE-INACTIVE", true)
	productSKU, err := client.ProductSKU.Create().
		SetProductID(fixtures.productID).
		SetSkuCode("SKU-SOURCE-INACTIVE").
		SetSkuName("来源 SKU").
		SetDefaultUnitID(fixtures.unitID).
		SetIsActive(true).
		Save(ctx)
	if err != nil {
		t.Fatalf("create source product SKU failed: %v", err)
	}
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo:    "SO-SOURCE-INACTIVE",
		CustomerID: customer.ID,
		OrderDate:  time.Date(2026, 6, 18, 0, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create sales order failed: %v", err)
	}
	item, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID:    order.ID,
		LineNo:          1,
		ProductID:       fixtures.productID,
		ProductSkuID:    &productSKU.ID,
		UnitID:          fixtures.unitID,
		OrderedQuantity: decimal.NewFromInt(2),
	})
	if err != nil {
		t.Fatalf("add sales order item failed: %v", err)
	}

	if _, err := client.Customer.UpdateOneID(customer.ID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable customer failed: %v", err)
	}
	if _, err := client.Product.UpdateOneID(fixtures.productID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable product failed: %v", err)
	}
	if _, err := client.ProductSKU.UpdateOneID(productSKU.ID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable product SKU failed: %v", err)
	}
	if _, err := client.Unit.UpdateOneID(fixtures.unitID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable unit failed: %v", err)
	}
	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_SOURCE_LINKED_INACTIVE",
		IdempotencyKey: "TEST_SOURCE_LINKED_INACTIVE:IN",
	}); err != nil {
		t.Fatalf("internal inventory source write should keep historical inactive references readable: %v", err)
	}

	shipment, err := uc.CreateShipmentDraft(ctx, &biz.ShipmentCreate{
		ShipmentNo:     "SHP-SOURCE-INACTIVE",
		SalesOrderID:   &order.ID,
		CustomerID:     &customer.ID,
		IdempotencyKey: "SHP-SOURCE-INACTIVE",
	})
	if err != nil {
		t.Fatalf("source-linked shipment header should allow inactive historical customer: %v", err)
	}
	if _, err := uc.AddShipmentItem(ctx, &biz.ShipmentItemCreate{
		ShipmentID:       shipment.ID,
		SalesOrderItemID: &item.ID,
		ProductID:        fixtures.productID,
		ProductSkuID:     &productSKU.ID,
		WarehouseID:      fixtures.warehouseID,
		UnitID:           fixtures.unitID,
		Quantity:         decimal.NewFromInt(1),
	}); err != nil {
		t.Fatalf("source-linked shipment item should allow inactive historical product/SKU/unit: %v", err)
	}
	reservation, err := uc.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo:    "RSV-SOURCE-INACTIVE",
		SalesOrderID:     &order.ID,
		SalesOrderItemID: &item.ID,
		ProductID:        fixtures.productID,
		WarehouseID:      fixtures.warehouseID,
		UnitID:           fixtures.unitID,
		Quantity:         decimal.NewFromInt(1),
		IdempotencyKey:   "RSV-SOURCE-INACTIVE",
	})
	if err != nil {
		t.Fatalf("source-linked reservation should allow inactive historical product/unit: %v", err)
	}
	if count := client.StockReservation.Query().Where(stockreservation.ID(reservation.ID)).CountX(ctx); count != 1 {
		t.Fatalf("expected source-linked reservation persisted, got %d rows", count)
	}
}

func ptrString(value string) *string {
	return &value
}

func TestOperationalFactRepo_StockReservationChecksAvailableQuantity(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_reservation")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))

	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_STOCK",
		IdempotencyKey: "TEST_STOCK:IN",
	}); err != nil {
		t.Fatalf("seed product inventory failed: %v", err)
	}
	if _, err := repo.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo:  "RSV-001",
		ProductID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(4),
		IdempotencyKey: "RSV-001",
	}); err != nil {
		t.Fatalf("create stock reservation failed: %v", err)
	}
	if _, err := repo.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo:  "RSV-002",
		ProductID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(2),
		IdempotencyKey: "RSV-002",
	}); err != biz.ErrInventoryInsufficientStock {
		t.Fatalf("expected insufficient stock, got %v", err)
	}
}

func TestOperationalFactRepo_OutsourcingMaterialIssueWithoutLotPostAndCancel(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_outsourcing")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))

	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_OUTSOURCING",
		IdempotencyKey: "TEST_OUTSOURCING:IN",
	}); err != nil {
		t.Fatalf("seed product inventory failed: %v", err)
	}
	fact, err := repo.CreateOutsourcingFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "OF-001",
		FactType:       biz.OutsourcingFactMaterialIssue,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(2),
		IdempotencyKey: "OF-001",
	})
	if err != nil {
		t.Fatalf("create outsourcing fact failed: %v", err)
	}
	posted, err := repo.PostOutsourcingFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("post outsourcing fact failed: %v", err)
	}
	if posted.Status != biz.OperationalFactStatusPosted {
		t.Fatalf("expected POSTED, got %s", posted.Status)
	}
	cancelled, err := repo.CancelPostedOutsourcingFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("cancel outsourcing fact failed: %v", err)
	}
	if cancelled.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("expected CANCELLED, got %s", cancelled.Status)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.OutsourcingFactSourceType)).CountX(ctx); count != 2 {
		t.Fatalf("expected outbound + reversal outsourcing txns, got %d", count)
	}
}

func TestOperationalFactUsecase_OutsourcingRejectsInactiveNewReferencesAndKeepsCancelAllowed(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_outsourcing_inactive_refs")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))

	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_OUTSOURCING_INACTIVE",
		IdempotencyKey: "TEST_OUTSOURCING_INACTIVE:IN",
	}); err != nil {
		t.Fatalf("seed product inventory failed: %v", err)
	}
	fact, err := uc.CreateOutsourcingFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "OF-INACTIVE-HISTORY",
		FactType:       biz.OutsourcingFactMaterialIssue,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(1),
		IdempotencyKey: "OF-INACTIVE-HISTORY",
	})
	if err != nil {
		t.Fatalf("create outsourcing fact failed: %v", err)
	}
	if _, err := uc.PostOutsourcingFact(ctx, fact.ID); err != nil {
		t.Fatalf("post outsourcing fact failed: %v", err)
	}
	if _, err := client.Product.UpdateOneID(fixtures.productID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable product failed: %v", err)
	}
	if cancelled, err := uc.CancelPostedOutsourcingFact(ctx, fact.ID); err != nil {
		t.Fatalf("cancel posted outsourcing fact should not be blocked by inactive product: %v", err)
	} else if cancelled.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("expected cancelled outsourcing fact, got %s", cancelled.Status)
	}
	if _, err := uc.CreateOutsourcingFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "OF-INACTIVE-PRODUCT",
		FactType:       biz.OutsourcingFactMaterialIssue,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(1),
		IdempotencyKey: "OF-INACTIVE-PRODUCT",
	}); !errors.Is(err, biz.ErrProductInactive) {
		t.Fatalf("expected inactive product rejected for new outsourcing fact, got %v", err)
	}

	if _, err := client.Material.UpdateOneID(fixtures.materialID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable material failed: %v", err)
	}
	if _, err := uc.CreateOutsourcingFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "OF-INACTIVE-MATERIAL",
		FactType:       biz.OutsourcingFactReturnReceipt,
		SubjectType:    biz.InventorySubjectMaterial,
		SubjectID:      fixtures.materialID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(1),
		IdempotencyKey: "OF-INACTIVE-MATERIAL",
	}); !errors.Is(err, biz.ErrMaterialInactive) {
		t.Fatalf("expected inactive material rejected for new outsourcing fact, got %v", err)
	}

	activeProduct := createTestProduct(t, ctx, client, fixtures.unitID, "PRD-OF-ACTIVE")
	inactiveSupplier, err := client.Supplier.Create().
		SetCode("SUP-OF-INACTIVE").
		SetName("停用委外供应商").
		SetIsActive(false).
		Save(ctx)
	if err != nil {
		t.Fatalf("create inactive supplier failed: %v", err)
	}
	if _, err := uc.CreateOutsourcingFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "OF-INACTIVE-SUPPLIER",
		FactType:       biz.OutsourcingFactMaterialIssue,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      activeProduct.ID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		SupplierID:     &inactiveSupplier.ID,
		Quantity:       decimal.NewFromInt(1),
		IdempotencyKey: "OF-INACTIVE-SUPPLIER",
	}); !errors.Is(err, biz.ErrSupplierInactive) {
		t.Fatalf("expected inactive supplier rejected for new outsourcing fact, got %v", err)
	}
	if _, err := client.Warehouse.UpdateOneID(fixtures.warehouseID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable warehouse failed: %v", err)
	}
	if _, err := uc.CreateOutsourcingFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "OF-INACTIVE-WAREHOUSE",
		FactType:       biz.OutsourcingFactMaterialIssue,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      activeProduct.ID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(1),
		IdempotencyKey: "OF-INACTIVE-WAREHOUSE",
	}); !errors.Is(err, biz.ErrWarehouseInactive) {
		t.Fatalf("expected inactive warehouse rejected for new outsourcing fact, got %v", err)
	}
	if _, err := client.Warehouse.UpdateOneID(fixtures.warehouseID).SetIsActive(true).Save(ctx); err != nil {
		t.Fatalf("reactivate warehouse failed: %v", err)
	}
	if _, err := client.Unit.UpdateOneID(fixtures.unitID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable unit failed: %v", err)
	}
	if _, err := uc.CreateOutsourcingFactDraft(ctx, &biz.OperationalFactMutation{
		FactNo:         "OF-INACTIVE-UNIT",
		FactType:       biz.OutsourcingFactMaterialIssue,
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      activeProduct.ID,
		WarehouseID:    fixtures.warehouseID,
		UnitID:         fixtures.unitID,
		Quantity:       decimal.NewFromInt(1),
		IdempotencyKey: "OF-INACTIVE-UNIT",
	}); !errors.Is(err, biz.ErrUnitInactive) {
		t.Fatalf("expected inactive unit rejected for new outsourcing fact, got %v", err)
	}
}

func TestOperationalFactRepo_ShipShipmentAndCancelWritesOutboundReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_shipment")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))

	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_SHIPMENT",
		IdempotencyKey: "TEST_SHIPMENT:IN",
	}); err != nil {
		t.Fatalf("seed product inventory failed: %v", err)
	}
	shipment, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:     "SHP-001",
			IdempotencyKey: "SHP-001",
		},
		Items: []*biz.ShipmentItemCreate{
			{
				ProductID:   fixtures.productID,
				WarehouseID: fixtures.warehouseID,
				UnitID:      fixtures.unitID,
				Quantity:    decimal.NewFromInt(2),
			},
		},
	})
	if err != nil {
		t.Fatalf("create shipment with items failed: %v", err)
	}
	if len(shipment.Items) != 1 {
		t.Fatalf("expected one shipment item, got %d", len(shipment.Items))
	}
	if _, err := repo.CancelShippedShipment(ctx, shipment.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("cancel draft shipment error = %v, want ErrBadParam", err)
	}
	shipped, err := repo.ShipShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("ship shipment failed: %v", err)
	}
	if shipped.Status != biz.ShipmentStatusShipped {
		t.Fatalf("expected SHIPPED, got %s", shipped.Status)
	}
	repeatedShipped, err := repo.ShipShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("repeat ship shipment failed: %v", err)
	}
	if repeatedShipped.Status != biz.ShipmentStatusShipped {
		t.Fatalf("expected repeated ship to stay SHIPPED, got %s", repeatedShipped.Status)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ShipmentSourceType)).CountX(ctx); count != 1 {
		t.Fatalf("expected one outbound shipment txn after repeated ship, got %d", count)
	}
	cancelled, err := repo.CancelShippedShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("cancel shipped shipment failed: %v", err)
	}
	if cancelled.Status != biz.ShipmentStatusCancelled {
		t.Fatalf("expected CANCELLED, got %s", cancelled.Status)
	}
	repeatedCancelled, err := repo.CancelShippedShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("repeat cancel shipment failed: %v", err)
	}
	if repeatedCancelled.Status != biz.ShipmentStatusCancelled {
		t.Fatalf("expected repeated cancel to stay CANCELLED, got %s", repeatedCancelled.Status)
	}
	if _, err := repo.ShipShipment(ctx, shipment.ID); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("ship cancelled shipment error = %v, want ErrBadParam", err)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ShipmentSourceType)).CountX(ctx); count != 2 {
		t.Fatalf("expected outbound + reversal shipment txns, got %d", count)
	}
}

func TestOperationalFactRepo_CreateShipmentDraftWithItemsRollsBackWhenItemFails(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_shipment_with_items_rollback")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))

	_, err := repo.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:     "SHP-TX-ROLLBACK-001",
			IdempotencyKey: "SHP-TX-ROLLBACK-001",
		},
		Items: []*biz.ShipmentItemCreate{
			{
				ProductID:   fixtures.productID,
				WarehouseID: fixtures.warehouseID,
				UnitID:      fixtures.unitID,
				Quantity:    decimal.NewFromInt(1),
			},
			{
				ProductID:   fixtures.productID,
				WarehouseID: fixtures.warehouseID,
				UnitID:      0,
				Quantity:    decimal.NewFromInt(1),
			},
		},
	})
	if err == nil {
		t.Fatal("expected create shipment with invalid item to fail")
	}
	if count := client.Shipment.Query().Where(shipment.ShipmentNo("SHP-TX-ROLLBACK-001")).CountX(ctx); count != 0 {
		t.Fatalf("expected shipment header to rollback after item failure, got %d rows", count)
	}
}

func TestOperationalFactRepo_ListShipmentsFiltersByPlannedShipDate(t *testing.T) {
	ctx := context.Background()
	data, _ := openInventoryRepoTestData(t, "operational_fact_shipment_date_filter")
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	earlyDate := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	targetDate := time.Date(2026, 6, 15, 0, 0, 0, 0, time.UTC)
	lateDate := time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC)

	for _, item := range []struct {
		no            string
		plannedShipAt time.Time
	}{
		{no: "SHP-DATE-EARLY", plannedShipAt: earlyDate},
		{no: "SHP-DATE-TARGET", plannedShipAt: targetDate},
		{no: "SHP-DATE-LATE", plannedShipAt: lateDate},
	} {
		plannedShipAt := item.plannedShipAt
		if _, err := repo.CreateShipmentDraft(ctx, &biz.ShipmentCreate{
			ShipmentNo:     item.no,
			PlannedShipAt:  &plannedShipAt,
			IdempotencyKey: item.no,
		}); err != nil {
			t.Fatalf("create shipment %s failed: %v", item.no, err)
		}
	}

	rows, total, err := repo.ListShipments(ctx, biz.OperationalFactFilter{
		DateField: "planned_ship_at",
		DateFrom:  &targetDate,
		DateTo:    &targetDate,
		Limit:     20,
	})
	if err != nil {
		t.Fatalf("list shipments by planned date failed: %v", err)
	}
	if total != 1 || len(rows) != 1 || rows[0].ShipmentNo != "SHP-DATE-TARGET" {
		t.Fatalf("expected only target planned shipment, total=%d rows=%#v", total, rows)
	}
}

func TestOperationalFactUsecase_ReceivableAndInvoiceRequireShippedShipment(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_shipment_finance")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)

	if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType:    biz.InventorySubjectProduct,
		SubjectID:      fixtures.productID,
		WarehouseID:    fixtures.warehouseID,
		TxnType:        biz.InventoryTxnIn,
		Direction:      1,
		Quantity:       decimal.NewFromInt(5),
		UnitID:         fixtures.unitID,
		SourceType:     "TEST_SHIPMENT_FINANCE",
		IdempotencyKey: "TEST_SHIPMENT_FINANCE:IN",
	}); err != nil {
		t.Fatalf("seed product inventory failed: %v", err)
	}

	shipmentSourceType := biz.ShipmentSourceType
	shippingReleaseSourceType := "SHIPPING-RELEASE"
	shipment, err := uc.CreateShipmentDraft(ctx, &biz.ShipmentCreate{
		ShipmentNo:     "SHP-FIN-001",
		IdempotencyKey: "SHP-FIN-001",
	})
	if err != nil {
		t.Fatalf("create shipment failed: %v", err)
	}
	if _, err := uc.AddShipmentItem(ctx, &biz.ShipmentItemCreate{
		ShipmentID:  shipment.ID,
		ProductID:   fixtures.productID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		Quantity:    decimal.NewFromInt(2),
	}); err != nil {
		t.Fatalf("add shipment item failed: %v", err)
	}

	if _, err := uc.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo:           "AR-MISSING-SOURCE",
		FactType:         biz.FinanceFactReceivable,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		Amount:           decimal.NewFromInt(100),
		IdempotencyKey:   "AR-MISSING-SOURCE",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("receivable without shipment source error = %v, want ErrBadParam", err)
	}

	if _, err := uc.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo:           "AR-WRONG-SOURCE",
		FactType:         biz.FinanceFactReceivable,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		Amount:           decimal.NewFromInt(100),
		SourceType:       &shippingReleaseSourceType,
		SourceID:         &shipment.ID,
		IdempotencyKey:   "AR-WRONG-SOURCE",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("receivable from shipping release source error = %v, want ErrBadParam", err)
	}

	if _, err := uc.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo:           "AR-DRAFT-SHIPMENT",
		FactType:         biz.FinanceFactReceivable,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		Amount:           decimal.NewFromInt(100),
		SourceType:       &shipmentSourceType,
		SourceID:         &shipment.ID,
		IdempotencyKey:   "AR-DRAFT-SHIPMENT",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("receivable from draft shipment error = %v, want ErrBadParam", err)
	}

	shipped, err := uc.ShipShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("ship shipment failed: %v", err)
	}
	if shipped.Status != biz.ShipmentStatusShipped {
		t.Fatalf("expected shipment SHIPPED, got %s", shipped.Status)
	}
	customer, err := client.Customer.Create().
		SetCode("C-FIN-SOURCE-INACTIVE").
		SetName("已停用来源客户").
		SetIsActive(true).
		Save(ctx)
	if err != nil {
		t.Fatalf("create finance source customer failed: %v", err)
	}
	if _, err := client.Customer.UpdateOneID(customer.ID).SetIsActive(false).Save(ctx); err != nil {
		t.Fatalf("disable finance source customer failed: %v", err)
	}

	receivable, err := uc.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo:           "AR-SHIPPED-001",
		FactType:         biz.FinanceFactReceivable,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		CounterpartyID:   &customer.ID,
		Amount:           decimal.NewFromInt(100),
		FeeAmount:        decimal.NewFromFloat(2.5),
		Currency:         biz.FinanceCurrencyUSD,
		CollectionType:   ptrString(biz.FinanceCollectionAccountsReceivable),
		PaymentTerm:      ptrString(biz.FinancePaymentTermEOM30),
		InvoiceCategory:  ptrString(biz.FinanceInvoiceCategoryNone),
		SourceType:       &shipmentSourceType,
		SourceID:         &shipment.ID,
		IdempotencyKey:   "AR-SHIPPED-001",
	})
	if err != nil {
		t.Fatalf("create receivable from shipped shipment failed: %v", err)
	}
	if receivable.Status != biz.OperationalFactStatusDraft || receivable.SourceID == nil || *receivable.SourceID != shipment.ID {
		t.Fatalf("unexpected receivable fact %#v", receivable)
	}
	if !receivable.FeeAmount.Equal(decimal.NewFromFloat(2.5)) || receivable.Currency != biz.FinanceCurrencyUSD {
		t.Fatalf("expected receivable fee/currency persisted, got fee=%s currency=%s", receivable.FeeAmount, receivable.Currency)
	}
	if receivable.CollectionType == nil || *receivable.CollectionType != biz.FinanceCollectionAccountsReceivable {
		t.Fatalf("expected receivable collection type persisted, got %#v", receivable.CollectionType)
	}
	if receivable.PaymentTerm == nil || *receivable.PaymentTerm != biz.FinancePaymentTermEOM30 || receivable.PaymentTermDays == nil || *receivable.PaymentTermDays != 30 {
		t.Fatalf("expected receivable payment term persisted, got term=%#v days=%#v", receivable.PaymentTerm, receivable.PaymentTermDays)
	}
	if receivable.InvoiceCategory == nil || *receivable.InvoiceCategory != biz.FinanceInvoiceCategoryNone {
		t.Fatalf("expected receivable invoice category persisted, got %#v", receivable.InvoiceCategory)
	}
	posted, err := uc.PostFinanceFact(ctx, receivable.ID)
	if err != nil {
		t.Fatalf("post receivable failed: %v", err)
	}
	if posted.Status != biz.OperationalFactStatusPosted {
		t.Fatalf("expected posted receivable, got %s", posted.Status)
	}
	settled, err := uc.SettleFinanceFact(ctx, receivable.ID)
	if err != nil {
		t.Fatalf("settle receivable failed: %v", err)
	}
	if settled.Status != biz.OperationalFactStatusSettled {
		t.Fatalf("expected settled receivable, got %s", settled.Status)
	}

	invoice, err := uc.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo:           "INV-SHIPPED-001",
		FactType:         biz.FinanceFactInvoice,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		CounterpartyID:   &customer.ID,
		Amount:           decimal.NewFromInt(100),
		SourceType:       &shipmentSourceType,
		SourceID:         &shipment.ID,
		IdempotencyKey:   "INV-SHIPPED-001",
	})
	if err != nil {
		t.Fatalf("create invoice from shipped shipment failed: %v", err)
	}
	if invoice.Status != biz.OperationalFactStatusDraft || invoice.SourceID == nil || *invoice.SourceID != shipment.ID {
		t.Fatalf("unexpected invoice fact %#v", invoice)
	}
	if count := client.FinanceFact.Query().Where(financefact.SourceType(biz.ShipmentSourceType), financefact.SourceID(shipment.ID)).CountX(ctx); count != 2 {
		t.Fatalf("expected two finance facts linked to shipped shipment, got %d", count)
	}
}

func TestOperationalFactUsecase_FinanceRejectsInactiveManualCounterparties(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "operational_fact_finance_inactive_counterparty")
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))

	customer, err := client.Customer.Create().
		SetCode("C-FIN-INACTIVE").
		SetName("停用客户").
		SetIsActive(false).
		Save(ctx)
	if err != nil {
		t.Fatalf("create inactive customer failed: %v", err)
	}
	supplier, err := client.Supplier.Create().
		SetCode("SUP-FIN-INACTIVE").
		SetName("停用供应商").
		SetIsActive(false).
		Save(ctx)
	if err != nil {
		t.Fatalf("create inactive supplier failed: %v", err)
	}
	if _, err := uc.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo:           "FIN-INACTIVE-CUSTOMER",
		FactType:         biz.FinanceFactPayment,
		CounterpartyType: biz.FinanceCounterpartyCustomer,
		CounterpartyID:   &customer.ID,
		Amount:           decimal.NewFromInt(100),
		IdempotencyKey:   "FIN-INACTIVE-CUSTOMER",
	}); !errors.Is(err, biz.ErrCustomerInactive) {
		t.Fatalf("expected inactive customer rejected for manual finance fact, got %v", err)
	}
	if _, err := uc.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
		FactNo:           "FIN-INACTIVE-SUPPLIER",
		FactType:         biz.FinanceFactPayable,
		CounterpartyType: biz.FinanceCounterpartySupplier,
		CounterpartyID:   &supplier.ID,
		Amount:           decimal.NewFromInt(100),
		IdempotencyKey:   "FIN-INACTIVE-SUPPLIER",
	}); !errors.Is(err, biz.ErrSupplierInactive) {
		t.Fatalf("expected inactive supplier rejected for manual finance fact, got %v", err)
	}
}
