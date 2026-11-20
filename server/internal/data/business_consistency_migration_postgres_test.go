package data

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"server/internal/biz"

	"github.com/shopspring/decimal"
)

func TestSourceDocumentPostgresCommercialSnapshotMigration(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	suffix := "CONS-MIG-" + postgresTestSuffix()
	repo, uc, batch, actor := prepareShipmentFinanceSource(t, ctx, data, client, suffix)
	request := &biz.FinanceFactFromShipmentCreate{FactNo: "AR-" + suffix, ShipmentID: batch.ID, IdempotencyKey: "AR-" + suffix}
	ar, err := uc.CreateReceivableFromShipment(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	ar, err = uc.PostFinanceFact(ctx, operationalFactStatusMutation(ar.ID, ar.Version, actor.ID, ""))
	if err != nil {
		t.Fatal(err)
	}
	// Simulate the old defect: frozen source tax/freight existed, but the shipment
	// and posted receivable carried only goods. No current business mutation does this.
	if _, err := data.sqldb.ExecContext(ctx, `UPDATE sales_orders SET tax_mode='EXCLUSIVE', tax_rate=13, goods_amount=50, quoted_freight_amount=5, freight_terms='EXCLUDED', tax_amount=7.15, order_total=62.15 WHERE id=$1`, *batch.SalesOrderID); err != nil {
		t.Fatal(err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `UPDATE shipments SET receivable_amount_snapshot=NULL, tax_amount_snapshot=NULL, quoted_freight_amount_snapshot=NULL, tax_mode_snapshot=NULL WHERE id=$1`, batch.ID); err != nil {
		t.Fatal(err)
	}
	contents, err := os.ReadFile(filepath.Join("model", "migrate", "20261023044447_freeze_shipment_commercial_snapshots.sql"))
	if err != nil {
		t.Fatal(err)
	}
	tx, err := data.sqldb.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	_, runErr := tx.ExecContext(ctx, string(contents))
	_ = tx.Rollback()
	if runErr == nil || !strings.Contains(runErr.Error(), "business consistency upgrade blocked") {
		t.Fatalf("mispriced posted fact not blocked: %v", runErr)
	}
	if row := client.Shipment.GetX(ctx, batch.ID); row.ReceivableAmountSnapshot != nil {
		t.Fatal("failed upgrade partially filled snapshot")
	}
	if _, err := uc.CancelPostedFinanceFact(ctx, operationalFactStatusMutation(ar.ID, ar.Version, actor.ID, "金额复核")); err != nil {
		t.Fatal(err)
	}
	if _, err := data.sqldb.ExecContext(ctx, string(contents)); err != nil {
		t.Fatal(err)
	}
	got, err := repo.GetShipment(ctx, batch.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ReceivableAmountSnapshot == nil || !got.ReceivableAmountSnapshot.Equal(decimal.RequireFromString("24.86")) || !got.QuotedFreightAmountSnapshot.Equal(decimal.NewFromInt(2)) || !got.TaxAmountSnapshot.Equal(decimal.RequireFromString("2.86")) {
		t.Fatalf("backfill=%#v", got)
	}
	if !got.Items[0].AmountSnapshot.Equal(decimal.NewFromInt(20)) || !client.FinanceFact.GetX(ctx, ar.ID).Amount.Equal(decimal.NewFromInt(20)) {
		t.Fatal("upgrade rewrote frozen goods or financial facts")
	}
	if _, err := data.sqldb.ExecContext(ctx, string(contents)); err != nil {
		t.Fatalf("backfill replay: %v", err)
	}
	// A frozen order without commercial terms remains unknown, never zero-filled.
	_, _, unknown, _ := prepareShipmentFinanceSource(t, ctx, data, client, suffix+"-UNK")
	if _, err := data.sqldb.ExecContext(ctx, `UPDATE sales_orders SET tax_mode=NULL, tax_amount=NULL, order_total=NULL WHERE id=$1`, *unknown.SalesOrderID); err != nil {
		t.Fatal(err)
	}
	if _, err := data.sqldb.ExecContext(ctx, `UPDATE shipments SET receivable_amount_snapshot=NULL, tax_amount_snapshot=NULL, quoted_freight_amount_snapshot=NULL, tax_mode_snapshot=NULL WHERE id=$1`, unknown.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := data.sqldb.ExecContext(ctx, string(contents)); err != nil {
		t.Fatal(err)
	}
	if client.Shipment.GetX(ctx, unknown.ID).ReceivableAmountSnapshot != nil {
		t.Fatal("unknown historical terms fabricated")
	}
}
