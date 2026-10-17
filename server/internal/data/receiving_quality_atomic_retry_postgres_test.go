package data

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/purchasereturnitem"
	"server/internal/data/model/ent/qualityinspection"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

// Inventory repositories open a dedicated SQL transaction client. Inject at
// that connection, after PostgreSQL returns an inserted row, so rollback is
// tested without changing runtime hooks, schema or business commands.
type receivingFaultConnector struct {
	driver.Connector
	armed    *bool
	failures *int
	table    string
	injected error
}
type receivingFaultConn struct {
	driver.Conn
	fault *receivingFaultConnector
}

func (c *receivingFaultConnector) Connect(ctx context.Context) (driver.Conn, error) {
	conn, err := c.Connector.Connect(ctx)
	if err != nil {
		return nil, err
	}
	return &receivingFaultConn{Conn: conn, fault: c}, nil
}
func (c *receivingFaultConn) BeginTx(ctx context.Context, options driver.TxOptions) (driver.Tx, error) {
	return c.Conn.(driver.ConnBeginTx).BeginTx(ctx, options)
}
func (c *receivingFaultConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	return c.Conn.(driver.ExecerContext).ExecContext(ctx, query, args)
}
func (c *receivingFaultConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	rows, err := c.Conn.(driver.QueryerContext).QueryContext(ctx, query, args)
	if err != nil || !*c.fault.armed || !strings.HasPrefix(query, `INSERT INTO "`+c.fault.table+`"`) {
		return rows, err
	}
	values := make([]driver.Value, len(rows.Columns()))
	if err := rows.Next(values); err != nil {
		return nil, errors.Join(err, rows.Close())
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	*c.fault.failures++
	return nil, c.fault.injected
}
func receivingInjectStoredRowFailure(t *testing.T, data *Data, table string, armed *bool, failures *int, injected error) {
	t.Helper()
	dsn := os.Getenv("PURCHASE_RECEIPT_PG_TEST_DB_URL")
	if dsn == "" {
		dsn = os.Getenv("INVENTORY_PG_TEST_DB_URL")
	}
	if dsn == "" {
		t.Fatal("isolated PostgreSQL test URL is required")
	}
	connector, err := data.sqldb.Driver().(driver.DriverContext).OpenConnector(dsn)
	if err != nil {
		t.Fatal("open isolated PostgreSQL fault connector")
	}
	wrapped := sql.OpenDB(&receivingFaultConnector{Connector: connector, armed: armed, failures: failures, table: table, injected: injected})
	original := data.sqldb
	var actual, expected string
	if err := original.QueryRow("SELECT current_database()").Scan(&expected); err != nil {
		t.Fatal(err)
	}
	if err := wrapped.QueryRow("SELECT current_database()").Scan(&actual); err != nil {
		t.Fatal(err)
	}
	if actual != expected {
		_ = wrapped.Close()
		t.Fatal("fault connector targeted a different database")
	}
	data.sqldb = wrapped
	t.Cleanup(func() {
		data.sqldb = original
		if err := wrapped.Close(); err != nil {
			t.Errorf("close receiving fault database: %v", err)
		}
	})
}

func receivingJSON(t *testing.T, value any) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(encoded)
}

func TestPurchaseReceiptPostgresArrivalFailureRollsBackAndRetries(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	f := createPurchaseReceiptPostgresFixtures(t, ctx, client)
	fixtures := inventoryTestFixtures{unitID: f.unitID, materialID: f.materialID, productID: f.productID, warehouseID: f.warehouseID}
	line := createApprovedPurchaseOrderItemForReceiptTest(t, ctx, client, fixtures, "ATOMIC-ARRIVAL-"+f.suffix, decimal.NewFromInt(10))
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	in := &biz.PurchaseReceiptFromPurchaseOrderCreate{PurchaseOrderID: line.PurchaseOrderID, ReceiptNo: "ATOMIC-ARRIVAL-" + f.suffix, ReceivedAt: time.Now().UTC().Truncate(time.Microsecond), IdempotencyKey: "atomic-arrival:" + f.suffix, Lines: []biz.PurchaseReceiptOrderLine{
		{PurchaseOrderItemID: line.ID, WarehouseID: f.warehouseID, Quantity: decimal.NewFromInt(4), DeclaredQuantity: new(decimal.NewFromInt(5))},
		{PurchaseOrderItemID: line.ID, WarehouseID: f.warehouseID, Quantity: decimal.NewFromInt(3), DeclaredQuantity: new(decimal.NewFromInt(3))},
	}}
	beforeLots := client.InventoryLot.Query().CountX(ctx)
	beforeQI := client.QualityInspection.Query().CountX(ctx)
	injected := errors.New("simulated initial quality persistence failure")
	armed, failures := true, 0
	receivingInjectStoredRowFailure(t, data, "quality_inspections", &armed, &failures, injected)
	if _, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, in); !errors.Is(err, injected) {
		t.Fatalf("arrival failure=%v", err)
	}
	if failures != 1 {
		t.Fatalf("expected one stored inspection fault, got %d", failures)
	}
	if client.PurchaseReceipt.Query().Where(purchasereceipt.ReceiptNo(in.ReceiptNo)).CountX(ctx) != 0 || client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.PurchaseOrderItemID(line.ID)).CountX(ctx) != 0 || client.InventoryLot.Query().CountX(ctx) != beforeLots || client.QualityInspection.Query().CountX(ctx) != beforeQI {
		t.Fatal("arrival failure left a header, item, lot or inspection")
	}
	armed = false
	receipt, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, in)
	if err != nil || len(receipt.Items) != 2 {
		t.Fatalf("arrival retry=%#v err=%v", receipt, err)
	}
	if receipt.Items[0].LotID == nil || receipt.Items[1].LotID == nil || *receipt.Items[0].LotID == *receipt.Items[1].LotID {
		t.Fatal("package lots must remain distinct")
	}
	if client.QualityInspection.Query().Where(qualityinspection.PurchaseReceiptID(receipt.ID)).CountX(ctx) != 2 {
		t.Fatal("each package needs one initial inspection")
	}
	read := func() string {
		return receivingJSON(t, []any{client.PurchaseReceipt.GetX(ctx, receipt.ID), client.PurchaseReceiptItem.Query().Where(purchasereceiptitem.ReceiptID(receipt.ID)).AllX(ctx), client.QualityInspection.Query().Where(qualityinspection.PurchaseReceiptID(receipt.ID)).AllX(ctx)})
	}
	before := read()
	replayed, err := uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, in)
	if err != nil || replayed.ID != receipt.ID || read() != before {
		t.Fatalf("arrival replay changed aggregate: %v", err)
	}
}

func TestPurchaseReturnPostgresLedgerFailureRollsBackAndRetries(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	f := createPurchaseReceiptPostgresFixtures(t, ctx, client)
	fixtures := inventoryTestFixtures{unitID: f.unitID, materialID: f.materialID, productID: f.productID, warehouseID: f.warehouseID}
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	receipt := createAndPostPurchaseReceipt(t, ctx, uc, "ATOMIC-RETURN-IN-"+f.suffix, fixtures, stringPtr("ATOMIC-RETURN-LOT-"+f.suffix), decimal.NewFromInt(10))
	ctx = biz.WithWarehouseDataScope(ctx, biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: []int{f.warehouseID}})
	ret, err := uc.CreatePurchaseReturnFromReceipt(ctx, &biz.PurchaseReturnFromReceiptCreate{ReturnNo: "ATOMIC-RETURN-" + f.suffix, PurchaseReceiptID: receipt.ID, ReturnedAt: time.Now().UTC().Truncate(time.Microsecond), IdempotencyKey: "atomic-return:" + f.suffix, Items: []biz.PurchaseReturnFromReceiptItemCreate{{PurchaseReceiptItemID: receipt.Items[0].ID, Quantity: decimal.NewFromInt(3)}}})
	if err != nil {
		t.Fatal(err)
	}
	readReturn := func() string {
		return receivingJSON(t, []any{client.PurchaseReturn.GetX(ctx, ret.ID), client.PurchaseReturnItem.Query().Where(purchasereturnitem.ReturnID(ret.ID)).AllX(ctx)})
	}
	beforeReturn := readReturn()
	key := biz.InventoryBalanceKey{SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID, WarehouseID: f.warehouseID, UnitID: f.unitID, LotID: receipt.Items[0].LotID}
	beforeBalance, err := uc.GetInventoryBalance(ctx, key)
	if err != nil {
		t.Fatal(err)
	}
	injected := errors.New("simulated return ledger persistence failure")
	armed, failures := true, 0
	receivingInjectStoredRowFailure(t, data, "inventory_txns", &armed, &failures, injected)
	if _, err := uc.PostPurchaseReturn(ctx, ret.ID); !errors.Is(err, injected) {
		t.Fatalf("return post failure=%v", err)
	}
	stored, err := uc.GetPurchaseReturn(ctx, ret.ID)
	if err != nil || stored.Status != biz.PurchaseReturnStatusDraft || readReturn() != beforeReturn {
		t.Fatalf("return header/items changed on failed post: %v", err)
	}
	balance, err := uc.GetInventoryBalance(ctx, key)
	if err != nil || receivingJSON(t, balance) != receivingJSON(t, beforeBalance) {
		t.Fatalf("balance changed on failed post: %v", err)
	}
	if failures != 1 || client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReturnSourceType), inventorytxn.SourceID(ret.ID)).CountX(ctx) != 0 {
		t.Fatal("return failure did not roll back its ledger entry")
	}
	armed = false
	posted, err := uc.PostPurchaseReturn(ctx, ret.ID)
	if err != nil || posted.Status != biz.PurchaseReturnStatusPosted {
		t.Fatalf("return retry=%#v err=%v", posted, err)
	}
	if _, err := uc.PostPurchaseReturn(ctx, ret.ID); err != nil {
		t.Fatal(err)
	}
	balance, err = uc.GetInventoryBalance(ctx, key)
	if err != nil || !balance.Quantity.Equal(decimal.NewFromInt(7)) {
		t.Fatalf("retry balance=%#v err=%v", balance, err)
	}
	if client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReturnSourceType), inventorytxn.SourceID(ret.ID)).CountX(ctx) != 1 {
		t.Fatal("post replay duplicated ledger")
	}
	if _, err := uc.CancelPostedPurchaseReturn(ctx, ret.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.CancelPostedPurchaseReturn(ctx, ret.ID); err != nil {
		t.Fatal(err)
	}
	balance, err = uc.GetInventoryBalance(ctx, key)
	if err != nil || !balance.Quantity.Equal(decimal.NewFromInt(10)) {
		t.Fatalf("cancel balance=%#v err=%v", balance, err)
	}
	if client.InventoryTxn.Query().Where(inventorytxn.SourceType(biz.PurchaseReturnSourceType), inventorytxn.SourceID(ret.ID)).CountX(ctx) != 2 {
		t.Fatal("cancel replay duplicated reversal")
	}
}

func TestQualityInspectionFromOutsourcingReturnPostgresFailureRollsBackAndRetries(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	f := createInventoryPostgresFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	uc := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	operational := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	actor := client.AdminUser.Create().SetUsername("atomic-quality-" + f.suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	fact := createPostgresOutsourcingReturnForQuality(t, ctx, client, uc, operational, f, actor.ID, "ATOMIC-"+f.suffix)
	requestTask := assertFulfillmentTask(t, ctx, client, "outsourcing_quality_request", fact.ID, "ready", biz.QualityRoleKey)
	in := &biz.QualityInspectionFromOutsourcingReturnCreate{InspectionNo: "ATOMIC-OUT-QI-" + f.suffix, OutsourcingFactID: fact.ID}
	beforeLot := receivingJSON(t, client.InventoryLot.GetX(ctx, *fact.LotID))
	beforeFact := receivingJSON(t, client.OutsourcingFact.GetX(ctx, fact.ID))
	injected := errors.New("simulated outsourcing inspection persistence failure")
	armed, failures := true, 0
	receivingInjectStoredRowFailure(t, data, "quality_inspections", &armed, &failures, injected)
	if _, err := uc.CreateQualityInspectionFromOutsourcingReturn(ctx, in); !errors.Is(err, injected) {
		t.Fatalf("quality create failure=%v", err)
	}
	if failures != 1 || client.QualityInspection.Query().Where(qualityinspection.SourceType(biz.QualityInspectionSourceOutsourcingFact), qualityinspection.SourceID(fact.ID)).CountX(ctx) != 0 {
		t.Fatal("failed quality create left source claim or inspection")
	}
	if receivingJSON(t, client.InventoryLot.GetX(ctx, *fact.LotID)) != beforeLot || receivingJSON(t, client.OutsourcingFact.GetX(ctx, fact.ID)) != beforeFact {
		t.Fatal("quality create failure changed its source")
	}
	if unchanged := assertFulfillmentTask(t, ctx, client, "outsourcing_quality_request", fact.ID, "ready", biz.QualityRoleKey); unchanged.ID != requestTask.ID || unchanged.Version != requestTask.Version {
		t.Fatal("failed quality creation consumed or changed its source task")
	}
	armed = false
	inspection, err := uc.CreateQualityInspectionFromOutsourcingReturn(ctx, in)
	if err != nil || inspection.InventoryLotID != *fact.LotID {
		t.Fatalf("quality retry=%#v err=%v", inspection, err)
	}
	doneTask := assertFulfillmentTask(t, ctx, client, "outsourcing_quality_request", fact.ID, "done", biz.QualityRoleKey)
	assertFulfillmentTask(t, ctx, client, "outsourcing_quality", inspection.ID, "ready", biz.QualityRoleKey)
	replayed, err := uc.CreateQualityInspectionFromOutsourcingReturn(ctx, in)
	if err != nil || receivingJSON(t, replayed) != receivingJSON(t, inspection) {
		t.Fatalf("quality replay changed inspection: err=%v initial=%s replay=%s", err, receivingJSON(t, inspection), receivingJSON(t, replayed))
	}
	if unchanged := assertFulfillmentTask(t, ctx, client, "outsourcing_quality_request", fact.ID, "done", biz.QualityRoleKey); unchanged.ID != doneTask.ID || unchanged.Version != doneTask.Version {
		t.Fatal("quality replay changed its completed source request")
	}
	conflict := *in
	conflict.InspectionNo += "-OTHER"
	if _, err := uc.CreateQualityInspectionFromOutsourcingReturn(ctx, &conflict); !errors.Is(err, biz.ErrQualityInspectionSourceConflict) {
		t.Fatalf("changed inspection intent=%v", err)
	}
	if client.QualityInspection.Query().Where(qualityinspection.SourceType(biz.QualityInspectionSourceOutsourcingFact), qualityinspection.SourceID(fact.ID)).CountX(ctx) != 1 {
		t.Fatal("quality replay duplicated source")
	}
}
