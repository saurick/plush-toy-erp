package data

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestPhase8Repo_ProductionFactPostAndCancelWritesInventoryReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "phase8_production_fact")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	repo := NewPhase8Repo(data, log.NewStdLogger(io.Discard))

	fact, err := repo.CreateProductionFactDraft(ctx, &biz.Phase8FactMutation{
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
	if posted.Status != biz.Phase8StatusPosted {
		t.Fatalf("expected POSTED, got %s", posted.Status)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ProductionFactSourceType)).CountX(ctx); count != 1 {
		t.Fatalf("expected one production inventory txn, got %d", count)
	}
	cancelled, err := repo.CancelPostedProductionFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("cancel production fact failed: %v", err)
	}
	if cancelled.Status != biz.Phase8StatusCancelled {
		t.Fatalf("expected CANCELLED, got %s", cancelled.Status)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ProductionFactSourceType)).CountX(ctx); count != 2 {
		t.Fatalf("expected original + reversal production txns, got %d", count)
	}
}

func TestPhase8Repo_StockReservationChecksAvailableQuantity(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "phase8_stock_reservation")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewPhase8Repo(data, log.NewStdLogger(io.Discard))

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

func TestPhase8Repo_OutsourcingMaterialIssueWithoutLotPostAndCancel(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "phase8_outsourcing_no_lot")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewPhase8Repo(data, log.NewStdLogger(io.Discard))

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
	fact, err := repo.CreateOutsourcingFactDraft(ctx, &biz.Phase8FactMutation{
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
	if posted.Status != biz.Phase8StatusPosted {
		t.Fatalf("expected POSTED, got %s", posted.Status)
	}
	cancelled, err := repo.CancelPostedOutsourcingFact(ctx, fact.ID)
	if err != nil {
		t.Fatalf("cancel outsourcing fact failed: %v", err)
	}
	if cancelled.Status != biz.Phase8StatusCancelled {
		t.Fatalf("expected CANCELLED, got %s", cancelled.Status)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.OutsourcingFactSourceType)).CountX(ctx); count != 2 {
		t.Fatalf("expected outbound + reversal outsourcing txns, got %d", count)
	}
}

func TestPhase8Repo_ShipShipmentAndCancelWritesOutboundReversal(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "phase8_shipment")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
	repo := NewPhase8Repo(data, log.NewStdLogger(io.Discard))

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
	shipment, err := repo.CreateShipmentDraft(ctx, &biz.ShipmentCreate{
		ShipmentNo:     "SHP-001",
		IdempotencyKey: "SHP-001",
	})
	if err != nil {
		t.Fatalf("create shipment failed: %v", err)
	}
	if _, err := repo.AddShipmentItem(ctx, &biz.ShipmentItemCreate{
		ShipmentID:  shipment.ID,
		ProductID:   fixtures.productID,
		WarehouseID: fixtures.warehouseID,
		UnitID:      fixtures.unitID,
		Quantity:    decimal.NewFromInt(2),
	}); err != nil {
		t.Fatalf("add shipment item failed: %v", err)
	}
	shipped, err := repo.ShipShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("ship shipment failed: %v", err)
	}
	if shipped.Status != biz.ShipmentStatusShipped {
		t.Fatalf("expected SHIPPED, got %s", shipped.Status)
	}
	cancelled, err := repo.CancelShippedShipment(ctx, shipment.ID)
	if err != nil {
		t.Fatalf("cancel shipped shipment failed: %v", err)
	}
	if cancelled.Status != biz.ShipmentStatusCancelled {
		t.Fatalf("expected CANCELLED, got %s", cancelled.Status)
	}
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.ShipmentSourceType)).CountX(ctx); count != 2 {
		t.Fatalf("expected outbound + reversal shipment txns, got %d", count)
	}
}
