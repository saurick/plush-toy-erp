package data

import (
	"context"
	"io"
	"net"
	"os"
	"strings"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"
)

// These exports are compiled only into data's external tests. HTTP consumers
// reuse the existing migrated PostgreSQL fixtures without a production fixture API.
func OpenIntegrationPostgresData(t *testing.T) (*Data, *ent.Client) {
	t.Helper()
	if os.Getenv("PURCHASE_RECEIPT_PG_TEST") != "1" {
		t.Skip("integration consumers require the disposable PostgreSQL gate")
	}
	dsn := os.Getenv("PURCHASE_RECEIPT_PG_TEST_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("PURCHASE_RECEIPT_PG_DB_URL")
	}
	config, err := pgx.ParseConfig(dsn)
	if err != nil || config == nil || !strings.HasPrefix(config.Database, "plush_erp_ci_") ||
		(config.Host != "localhost" && (net.ParseIP(config.Host) == nil || !net.ParseIP(config.Host).IsLoopback())) {
		t.Fatal("integration consumers require a generated loopback ci database")
	}
	d, client := openPurchaseReceiptPostgresTestData(t)
	if err := InitRBACIfNeeded(t.Context(), d, log.NewHelper(log.NewStdLogger(io.Discard))); err != nil {
		t.Fatal(err)
	}
	return d, client
}

func IntegrationPurchaseLine(t *testing.T, client *ent.Client) (*ent.PurchaseOrderItem, int) {
	t.Helper()
	pg := createInventoryPostgresFixtures(t, t.Context(), client)
	f := inventoryTestFixtures{unitID: pg.unitID, materialID: pg.materialID, productID: pg.productID, warehouseID: pg.warehouseID, productWarehouseID: pg.productWarehouseID}
	line := createApprovedPurchaseOrderItemForReceiptTest(t, t.Context(), client, f, postgresTestSuffix(), decimal.NewFromInt(10))
	return line, f.warehouseID
}

func IntegrationReceivable(t *testing.T, d *Data, client *ent.Client) *biz.FinanceFact {
	t.Helper()
	return createPostedFinanceFactForCreditType(t, t.Context(), d, client, biz.FinanceFactReceivable)
}

func IntegrationSaleStock(t *testing.T, d *Data, client *ent.Client, unitID int) (int, int) {
	t.Helper()
	ctx := t.Context()
	suffix := postgresTestSuffix()
	product := createTestProduct(t, ctx, client, unitID, "SIM-P-"+suffix)
	warehouse := createTestProductWarehouse(t, ctx, client, "SIM-FG-"+suffix)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(d, log.NewStdLogger(io.Discard)))
	if _, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: product.ID, WarehouseID: warehouse.ID,
		UnitID: unitID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(10),
		SourceType: "TEST_INTEGRATION_OPENING", IdempotencyKey: "sim-sale-opening-" + suffix,
	}); err != nil {
		t.Fatal(err)
	}
	return product.ID, warehouse.ID
}

func IntegrationPostedPayment(t *testing.T, d *Data, client *ent.Client, fact *biz.FinanceFact, actorID int) *biz.FinancePayment {
	t.Helper()
	suffix := postgresTestSuffix()
	approver := client.AdminUser.Create().SetUsername("integration-approve-" + suffix).SetPasswordHash("fixture-not-a-login").SaveX(t.Context())
	repo := NewOperationalFactRepo(d, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	if fact.SourceID == nil || fact.SourceType == nil || *fact.SourceType != biz.ShipmentSourceType {
		t.Fatal("finance integration fixture requires a shipped source")
	}
	shipment := client.Shipment.GetX(t.Context(), *fact.SourceID)
	payment, err := uc.CreateFinancePayment(t.Context(), &biz.FinancePaymentCreate{
		PaymentNo: "SIM-PAY-" + suffix, Direction: biz.FinancePaymentDirectionReceipt,
		Kind: biz.FinancePaymentKindAdvance, SourceType: "sales_order", SourceID: *shipment.SalesOrderID,
		CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: *fact.CounterpartyID,
		Amount: decimal.NewFromInt(10), Currency: "CNY", AccountRef: "SIM-BANK", EvidenceRef: "SIM-FLOW", IdempotencyKey: "sim-payment-" + suffix,
	}, actorID)
	if err != nil {
		t.Fatal(err)
	}
	payment = approveFinancePaymentForRepoTest(t, t.Context(), client, payment.ID, approver.ID)
	posted, err := repo.postFinancePayment(t.Context(), &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: payment.Version}, actorID, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	return posted
}

func IntegrationInventoryTransfer(t *testing.T, d *Data, client *ent.Client, actorID int) (*biz.InventoryOperation, int, int, int) {
	t.Helper()
	ctx := context.Background()
	f := createInventoryPostgresFixtures(t, ctx, client)
	to := createTestWarehouse(t, ctx, client, "SIM-TO-"+f.suffix)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(d, log.NewStdLogger(io.Discard)))
	_, err := uc.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, WarehouseID: f.warehouseID,
		UnitID: f.unitID, TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(10),
		SourceType: "TEST_INTEGRATION_OPENING", IdempotencyKey: "sim-opening-" + f.suffix,
	})
	if err != nil {
		t.Fatal(err)
	}
	op, err := uc.CreateInventoryOperation(ctx, &biz.InventoryOperationCreate{
		OperationNo: "SIM-TRANSFER-" + f.suffix, OperationType: biz.InventoryOperationTransfer,
		Reason: "模拟 WMS 仓间调拨", CreatedBy: actorID, IdempotencyKey: "sim-transfer-" + f.suffix,
		Items: []biz.InventoryOperationItemCreate{{LineNo: "1", SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID,
			FromWarehouseID: f.warehouseID, ToWarehouseID: &to.ID, UnitID: f.unitID, AdjustmentQuantity: decimal.NewFromInt(3)}},
	})
	if err != nil {
		t.Fatal(err)
	}
	return op, f.materialID, f.warehouseID, to.ID
}
