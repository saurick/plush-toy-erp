package data

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

const sourceFinanceSnapshotBackfillMigration = "20260714114623_backfill_source_finance_snapshots.sql"

func TestSourceFinanceSnapshotBackfillMigrationPostgres(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)

	migrationSQL, err := os.ReadFile(filepath.Join("model", "migrate", sourceFinanceSnapshotBackfillMigration))
	if err != nil {
		t.Fatalf("read source finance snapshot migration: %v", err)
	}

	fixtures := createPurchaseReceiptPostgresFixtures(t, ctx, client)
	suffix := fixtures.suffix
	supplierA := createPurchaseOrderTestSupplier(t, ctx, client, "PG-BACKFILL-A-"+suffix, true)
	supplierB := createPurchaseOrderTestSupplier(t, ctx, client, "PG-BACKFILL-B-"+suffix, true)
	orderA, err := client.PurchaseOrder.Create().
		SetPurchaseOrderNo("PG-PO-BACKFILL-A-" + suffix).
		SetSupplierID(supplierA.ID).
		SetPurchaseDate(time.Now().UTC()).
		Save(ctx)
	if err != nil {
		t.Fatalf("create source purchase order A: %v", err)
	}
	orderB, err := client.PurchaseOrder.Create().
		SetPurchaseOrderNo("PG-PO-BACKFILL-B-" + suffix).
		SetSupplierID(supplierB.ID).
		SetPurchaseDate(time.Now().UTC()).
		Save(ctx)
	if err != nil {
		t.Fatalf("create source purchase order B: %v", err)
	}
	orderItemA1, err := client.PurchaseOrderItem.Create().
		SetPurchaseOrderID(orderA.ID).
		SetLineNo(1).
		SetMaterialID(fixtures.materialID).
		SetUnitID(fixtures.unitID).
		SetPurchasedQuantity(decimal.NewFromInt(10)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create source purchase order item A1: %v", err)
	}
	orderItemA2, err := client.PurchaseOrderItem.Create().
		SetPurchaseOrderID(orderA.ID).
		SetLineNo(2).
		SetMaterialID(fixtures.materialID).
		SetUnitID(fixtures.unitID).
		SetPurchasedQuantity(decimal.NewFromInt(10)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create source purchase order item A2: %v", err)
	}
	orderItemB, err := client.PurchaseOrderItem.Create().
		SetPurchaseOrderID(orderB.ID).
		SetLineNo(1).
		SetMaterialID(fixtures.materialID).
		SetUnitID(fixtures.unitID).
		SetPurchasedQuantity(decimal.NewFromInt(10)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create source purchase order item B: %v", err)
	}

	customer := createSalesOrderTestCustomer(t, ctx, client, "PG-BACKFILL-C-"+suffix, true)
	salesOrderA, err := client.SalesOrder.Create().
		SetOrderNo("PG-SO-BACKFILL-A-" + suffix).
		SetCustomerID(customer.ID).
		SetOrderDate(time.Now().UTC()).
		Save(ctx)
	if err != nil {
		t.Fatalf("create source sales order A: %v", err)
	}
	salesOrderB, err := client.SalesOrder.Create().
		SetOrderNo("PG-SO-BACKFILL-B-" + suffix).
		SetCustomerID(customer.ID).
		SetOrderDate(time.Now().UTC()).
		Save(ctx)
	if err != nil {
		t.Fatalf("create source sales order B: %v", err)
	}
	sourceSKU := createSalesOrderTestProductSKU(t, ctx, client, fixtures.productID, fixtures.unitID, "PG-SKU-BACKFILL-A-"+suffix)
	otherSKU := createSalesOrderTestProductSKU(t, ctx, client, fixtures.productID, fixtures.unitID, "PG-SKU-BACKFILL-B-"+suffix)
	otherProduct := createTestProduct(t, ctx, client, fixtures.unitID, "PG-PRD-BACKFILL-"+suffix)
	otherUnit := createTestUnit(t, ctx, client, "PG-U-BACKFILL-"+suffix)
	salesOrderItem, err := client.SalesOrderItem.Create().
		SetSalesOrderID(salesOrderA.ID).
		SetLineNo(1).
		SetProductID(fixtures.productID).
		SetProductSkuID(sourceSKU.ID).
		SetUnitID(fixtures.unitID).
		SetOrderedQuantity(decimal.NewFromInt(4)).
		SetUnitPrice(decimal.NewFromInt(12)).
		SetAmount(decimal.NewFromInt(40)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create source sales order item: %v", err)
	}

	tx, err := data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin source finance backfill transaction: %v", err)
	}
	defer func() {
		if err := tx.Rollback(); err != nil && err != sql.ErrTxDone {
			t.Errorf("rollback source finance backfill transaction: %v", err)
		}
	}()

	allLinkedReceiptID := insertHistoricalReceipt(t, ctx, tx, "PG-RCV-BACKFILL-ALL-"+suffix)
	insertHistoricalReceiptItem(t, ctx, tx, allLinkedReceiptID, fixtures, &orderItemA1.ID)
	insertHistoricalReceiptItem(t, ctx, tx, allLinkedReceiptID, fixtures, &orderItemA2.ID)

	mixedManualReceiptID := insertHistoricalReceipt(t, ctx, tx, "PG-RCV-BACKFILL-MANUAL-"+suffix)
	insertHistoricalReceiptItem(t, ctx, tx, mixedManualReceiptID, fixtures, &orderItemA1.ID)
	insertHistoricalReceiptItem(t, ctx, tx, mixedManualReceiptID, fixtures, nil)

	multiSupplierReceiptID := insertHistoricalReceipt(t, ctx, tx, "PG-RCV-BACKFILL-MULTI-"+suffix)
	insertHistoricalReceiptItem(t, ctx, tx, multiSupplierReceiptID, fixtures, &orderItemA1.ID)
	insertHistoricalReceiptItem(t, ctx, tx, multiSupplierReceiptID, fixtures, &orderItemB.ID)

	matchingShipmentID := insertHistoricalShipment(t, ctx, tx, "PG-SHP-BACKFILL-MATCH-"+suffix, salesOrderA.ID)
	matchingItemID := insertHistoricalShipmentItem(t, ctx, tx, matchingShipmentID, salesOrderItem.ID, fixtures.productID, sourceSKU.ID, fixtures.warehouseID, fixtures.unitID, nil, nil)

	wrongHeaderShipmentID := insertHistoricalShipment(t, ctx, tx, "PG-SHP-BACKFILL-HEADER-"+suffix, salesOrderB.ID)
	wrongHeaderItemID := insertHistoricalShipmentItem(t, ctx, tx, wrongHeaderShipmentID, salesOrderItem.ID, fixtures.productID, sourceSKU.ID, fixtures.warehouseID, fixtures.unitID, nil, nil)

	wrongProductShipmentID := insertHistoricalShipment(t, ctx, tx, "PG-SHP-BACKFILL-PRODUCT-"+suffix, salesOrderA.ID)
	wrongProductItemID := insertHistoricalShipmentItem(t, ctx, tx, wrongProductShipmentID, salesOrderItem.ID, otherProduct.ID, sourceSKU.ID, fixtures.warehouseID, fixtures.unitID, nil, nil)

	wrongSKUShipmentID := insertHistoricalShipment(t, ctx, tx, "PG-SHP-BACKFILL-SKU-"+suffix, salesOrderA.ID)
	wrongSKUItemID := insertHistoricalShipmentItem(t, ctx, tx, wrongSKUShipmentID, salesOrderItem.ID, fixtures.productID, otherSKU.ID, fixtures.warehouseID, fixtures.unitID, nil, nil)

	wrongUnitShipmentID := insertHistoricalShipment(t, ctx, tx, "PG-SHP-BACKFILL-UNIT-"+suffix, salesOrderA.ID)
	wrongUnitItemID := insertHistoricalShipmentItem(t, ctx, tx, wrongUnitShipmentID, salesOrderItem.ID, fixtures.productID, sourceSKU.ID, fixtures.warehouseID, otherUnit.ID, nil, nil)

	existingUnitPrice := "77"
	pricePreservedShipmentID := insertHistoricalShipment(t, ctx, tx, "PG-SHP-BACKFILL-PRICE-"+suffix, salesOrderA.ID)
	pricePreservedItemID := insertHistoricalShipmentItem(t, ctx, tx, pricePreservedShipmentID, salesOrderItem.ID, fixtures.productID, sourceSKU.ID, fixtures.warehouseID, fixtures.unitID, &existingUnitPrice, nil)

	existingAmount := "88"
	amountPreservedShipmentID := insertHistoricalShipment(t, ctx, tx, "PG-SHP-BACKFILL-AMOUNT-"+suffix, salesOrderA.ID)
	amountPreservedItemID := insertHistoricalShipmentItem(t, ctx, tx, amountPreservedShipmentID, salesOrderItem.ID, fixtures.productID, sourceSKU.ID, fixtures.warehouseID, fixtures.unitID, nil, &existingAmount)

	if _, err := tx.ExecContext(ctx, string(migrationSQL)); err != nil {
		t.Fatalf("execute source finance snapshot migration: %v", err)
	}

	assertHistoricalReceiptSupplier(t, ctx, tx, allLinkedReceiptID, supplierA.ID)
	assertHistoricalReceiptSupplierMissing(t, ctx, tx, mixedManualReceiptID)
	assertHistoricalReceiptSupplierMissing(t, ctx, tx, multiSupplierReceiptID)

	assertHistoricalShipmentSnapshots(t, ctx, tx, matchingItemID, stringPointer("12"), stringPointer("20"))
	assertHistoricalShipmentSnapshots(t, ctx, tx, wrongHeaderItemID, nil, nil)
	assertHistoricalShipmentSnapshots(t, ctx, tx, wrongProductItemID, nil, nil)
	assertHistoricalShipmentSnapshots(t, ctx, tx, wrongSKUItemID, nil, nil)
	assertHistoricalShipmentSnapshots(t, ctx, tx, wrongUnitItemID, nil, nil)
	assertHistoricalShipmentSnapshots(t, ctx, tx, pricePreservedItemID, &existingUnitPrice, stringPointer("20"))
	assertHistoricalShipmentSnapshots(t, ctx, tx, amountPreservedItemID, stringPointer("12"), &existingAmount)
}

func insertHistoricalReceipt(t *testing.T, ctx context.Context, tx *sql.Tx, receiptNo string) int {
	t.Helper()
	var id int
	err := tx.QueryRowContext(ctx, `
INSERT INTO purchase_receipts (
  receipt_no, supplier_name, status, received_at, created_at, updated_at
) VALUES ($1, '历史供应商快照', 'POSTED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING id`, receiptNo).Scan(&id)
	if err != nil {
		t.Fatalf("insert historical receipt %s: %v", receiptNo, err)
	}
	return id
}

func insertHistoricalReceiptItem(
	t *testing.T,
	ctx context.Context,
	tx *sql.Tx,
	receiptID int,
	fixtures purchaseReceiptPostgresFixtures,
	purchaseOrderItemID *int,
) {
	t.Helper()
	var sourceItemID any
	if purchaseOrderItemID != nil {
		sourceItemID = *purchaseOrderItemID
	}
	_, err := tx.ExecContext(ctx, `
INSERT INTO purchase_receipt_items (
  receipt_id, material_id, warehouse_id, unit_id, purchase_order_item_id,
  quantity, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
		receiptID,
		fixtures.materialID,
		fixtures.warehouseID,
		fixtures.unitID,
		sourceItemID,
	)
	if err != nil {
		t.Fatalf("insert historical receipt item for receipt %d: %v", receiptID, err)
	}
}

func insertHistoricalShipment(t *testing.T, ctx context.Context, tx *sql.Tx, shipmentNo string, salesOrderID int) int {
	t.Helper()
	var id int
	err := tx.QueryRowContext(ctx, `
INSERT INTO shipments (
  shipment_no, sales_order_id, status, idempotency_key, created_at, updated_at
) VALUES ($1, $2, 'DRAFT', $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING id`, shipmentNo, salesOrderID).Scan(&id)
	if err != nil {
		t.Fatalf("insert historical shipment %s: %v", shipmentNo, err)
	}
	return id
}

func insertHistoricalShipmentItem(
	t *testing.T,
	ctx context.Context,
	tx *sql.Tx,
	shipmentID int,
	salesOrderItemID int,
	productID int,
	productSKUID int,
	warehouseID int,
	unitID int,
	unitPriceSnapshot *string,
	amountSnapshot *string,
) int {
	t.Helper()
	var id int
	err := tx.QueryRowContext(ctx, `
INSERT INTO shipment_items (
  shipment_id, sales_order_item_id, product_id, product_sku_id, warehouse_id, unit_id,
  quantity, unit_price_snapshot, amount_snapshot, currency_snapshot, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, 2, $7::numeric, $8::numeric, 'CNY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
RETURNING id`,
		shipmentID,
		salesOrderItemID,
		productID,
		productSKUID,
		warehouseID,
		unitID,
		unitPriceSnapshot,
		amountSnapshot,
	).Scan(&id)
	if err != nil {
		t.Fatalf("insert historical shipment item for shipment %d: %v", shipmentID, err)
	}
	return id
}

func assertHistoricalReceiptSupplier(t *testing.T, ctx context.Context, tx *sql.Tx, receiptID int, wantSupplierID int) {
	t.Helper()
	var got sql.NullInt64
	if err := tx.QueryRowContext(ctx, `SELECT supplier_id FROM purchase_receipts WHERE id = $1`, receiptID).Scan(&got); err != nil {
		t.Fatalf("read receipt %d supplier snapshot: %v", receiptID, err)
	}
	if !got.Valid || int(got.Int64) != wantSupplierID {
		t.Fatalf("receipt %d supplier_id = %#v, want %d", receiptID, got, wantSupplierID)
	}
}

func assertHistoricalReceiptSupplierMissing(t *testing.T, ctx context.Context, tx *sql.Tx, receiptID int) {
	t.Helper()
	var got sql.NullInt64
	if err := tx.QueryRowContext(ctx, `SELECT supplier_id FROM purchase_receipts WHERE id = $1`, receiptID).Scan(&got); err != nil {
		t.Fatalf("read receipt %d supplier snapshot: %v", receiptID, err)
	}
	if got.Valid {
		t.Fatalf("receipt %d supplier_id = %d, want NULL", receiptID, got.Int64)
	}
}

func assertHistoricalShipmentSnapshots(
	t *testing.T,
	ctx context.Context,
	tx *sql.Tx,
	shipmentItemID int,
	wantUnitPrice *string,
	wantAmount *string,
) {
	t.Helper()
	var gotUnitPrice, gotAmount sql.NullString
	if err := tx.QueryRowContext(ctx, `
SELECT unit_price_snapshot, amount_snapshot
FROM shipment_items
WHERE id = $1`, shipmentItemID).Scan(&gotUnitPrice, &gotAmount); err != nil {
		t.Fatalf("read shipment item %d snapshots: %v", shipmentItemID, err)
	}
	assertNullableDecimalString(t, "unit_price_snapshot", shipmentItemID, gotUnitPrice, wantUnitPrice)
	assertNullableDecimalString(t, "amount_snapshot", shipmentItemID, gotAmount, wantAmount)
}

func assertNullableDecimalString(t *testing.T, field string, shipmentItemID int, got sql.NullString, want *string) {
	t.Helper()
	if want == nil {
		if got.Valid {
			t.Fatalf("shipment item %d %s = %s, want NULL", shipmentItemID, field, got.String)
		}
		return
	}
	if !got.Valid {
		t.Fatalf("shipment item %d %s = NULL, want %s", shipmentItemID, field, *want)
	}
	gotDecimal, err := decimal.NewFromString(got.String)
	if err != nil {
		t.Fatalf("shipment item %d %s is not decimal: %q", shipmentItemID, field, got.String)
	}
	wantDecimal, err := decimal.NewFromString(*want)
	if err != nil {
		t.Fatalf("invalid test expectation for %s: %q", field, *want)
	}
	if !gotDecimal.Equal(wantDecimal) {
		t.Fatalf("shipment item %d %s = %s, want %s", shipmentItemID, field, gotDecimal, wantDecimal)
	}
}

func stringPointer(value string) *string {
	return &value
}
