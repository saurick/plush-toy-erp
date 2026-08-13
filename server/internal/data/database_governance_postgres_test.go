package data

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/shopspring/decimal"
)

func TestDatabaseGovernancePostgresInventoryConstraints(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	now := time.Now().UTC()
	suffix := postgresTestSuffix()

	createTxn := func(key string) int {
		t.Helper()
		txn, err := client.InventoryTxn.Create().
			SetSubjectType("MATERIAL").
			SetSubjectID(fixtures.materialID).
			SetWarehouseID(fixtures.warehouseID).
			SetTxnType("IN").
			SetDirection(1).
			SetQuantity(decimal.NewFromInt(1)).
			SetUnitID(fixtures.unitID).
			SetSourceType("DATABASE_GOVERNANCE_TEST").
			SetIdempotencyKey(key).
			SetOccurredAt(now).
			Save(ctx)
		if err != nil {
			t.Fatalf("create valid inventory txn: %v", err)
		}
		return txn.ID
	}
	txnID := createTxn("db-governance-txn-" + suffix)
	otherTxnID := createTxn("db-governance-other-txn-" + suffix)

	inventoryCases := []struct {
		name       string
		code       string
		constraint string
		query      string
		args       []any
	}{
		{
			name:       "unknown subject type",
			code:       "23514",
			constraint: "inventory_txns_subject_type_allowed",
			query:      `UPDATE inventory_txns SET subject_type = 'SERVICE' WHERE id = $1`,
			args:       []any{txnID},
		},
		{
			name:  "unknown transaction type",
			code:  "23514",
			query: `UPDATE inventory_txns SET txn_type = 'UNKNOWN' WHERE id = $1`,
			args:  []any{txnID},
		},
		{
			name:  "invalid direction",
			code:  "23514",
			query: `UPDATE inventory_txns SET direction = 0 WHERE id = $1`,
			args:  []any{txnID},
		},
		{
			name:       "non-positive quantity",
			code:       "23514",
			constraint: "inventory_txns_quantity_positive",
			query:      `UPDATE inventory_txns SET quantity = 0 WHERE id = $1`,
			args:       []any{txnID},
		},
		{
			name:       "direction does not match transaction type",
			code:       "23514",
			constraint: "inventory_txns_direction_matches_type",
			query:      `UPDATE inventory_txns SET txn_type = 'OUT' WHERE id = $1`,
			args:       []any{txnID},
		},
		{
			name:       "reversal missing original transaction",
			code:       "23514",
			constraint: "inventory_txns_reversal_shape",
			query:      `UPDATE inventory_txns SET txn_type = 'REVERSAL' WHERE id = $1`,
			args:       []any{txnID},
		},
		{
			name:       "non-reversal carries original transaction",
			code:       "23514",
			constraint: "inventory_txns_reversal_shape",
			query:      `UPDATE inventory_txns SET reversal_of_txn_id = $2 WHERE id = $1`,
			args:       []any{txnID, otherTxnID},
		},
		{
			name:       "self reversal",
			code:       "23514",
			constraint: "inventory_txns_reversal_not_self",
			query:      `UPDATE inventory_txns SET txn_type = 'REVERSAL', reversal_of_txn_id = id WHERE id = $1`,
			args:       []any{txnID},
		},
		{
			name:       "unknown original transaction",
			code:       "23503",
			constraint: "inventory_txns_inventory_txns_reversals",
			query:      `UPDATE inventory_txns SET txn_type = 'REVERSAL', reversal_of_txn_id = 9223372036854770000 WHERE id = $1`,
			args:       []any{txnID},
		},
	}
	for _, test := range inventoryCases {
		t.Run(test.name, func(t *testing.T) {
			_, err := data.sqldb.ExecContext(ctx, test.query, test.args...)
			assertDatabaseGovernancePGError(t, err, test.code, test.constraint)
		})
	}

	balance, err := client.InventoryBalance.Create().
		SetSubjectType("MATERIAL").
		SetSubjectID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		SetUnitID(fixtures.unitID).
		SetQuantity(decimal.NewFromInt(1)).
		Save(ctx)
	if err != nil {
		t.Fatalf("create valid inventory balance: %v", err)
	}
	_, err = data.sqldb.ExecContext(ctx, `UPDATE inventory_balances SET subject_type = 'SERVICE' WHERE id = $1`, balance.ID)
	assertDatabaseGovernancePGError(t, err, "23514", "inventory_balances_subject_type_allowed")
	_, err = data.sqldb.ExecContext(ctx, `UPDATE inventory_balances SET quantity = -0.1 WHERE id = $1`, balance.ID)
	assertDatabaseGovernancePGError(t, err, "23514", "inventory_balances_quantity_nonnegative")

	lot, err := client.InventoryLot.Create().
		SetSubjectType("MATERIAL").
		SetSubjectID(fixtures.materialID).
		SetLotNo("DB-GOV-LOT-" + suffix).
		Save(ctx)
	if err != nil {
		t.Fatalf("create valid inventory lot: %v", err)
	}
	_, err = data.sqldb.ExecContext(ctx, `UPDATE inventory_lots SET subject_type = 'SERVICE' WHERE id = $1`, lot.ID)
	assertDatabaseGovernancePGError(t, err, "23514", "inventory_lots_subject_type_allowed")
	_, err = data.sqldb.ExecContext(ctx, `UPDATE inventory_lots SET status = 'UNKNOWN' WHERE id = $1`, lot.ID)
	assertDatabaseGovernancePGError(t, err, "23514", "inventory_lots_status_allowed")
	_, err = data.sqldb.ExecContext(ctx, `UPDATE inventory_lots SET version = 0 WHERE id = $1`, lot.ID)
	assertDatabaseGovernancePGError(t, err, "23514", "inventory_lots_version_positive")
}

func TestDatabaseGovernancePostgresPurchaseStatusConstraints(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	now := time.Now().UTC()
	suffix := postgresTestSuffix()

	receipt, err := client.PurchaseReceipt.Create().
		SetReceiptNo("DB-GOV-RECEIPT-" + suffix).
		SetSupplierName("数据库治理测试供应商").
		SetReceivedAt(now).
		Save(ctx)
	if err != nil {
		t.Fatalf("create valid purchase receipt: %v", err)
	}
	returnRow, err := client.PurchaseReturn.Create().
		SetReturnNo("DB-GOV-RETURN-" + suffix).
		SetSupplierName("数据库治理测试供应商").
		SetReturnedAt(now).
		Save(ctx)
	if err != nil {
		t.Fatalf("create valid purchase return: %v", err)
	}
	adjustment, err := client.PurchaseReceiptAdjustment.Create().
		SetAdjustmentNo("DB-GOV-ADJUSTMENT-" + suffix).
		SetPurchaseReceiptID(receipt.ID).
		SetAdjustedAt(now).
		Save(ctx)
	if err != nil {
		t.Fatalf("create valid purchase receipt adjustment: %v", err)
	}

	statusCases := []struct {
		name       string
		constraint string
		query      string
		args       []any
	}{
		{
			name:  "receipt unknown status",
			query: `UPDATE purchase_receipts SET status = 'UNKNOWN' WHERE id = $1`,
			args:  []any{receipt.ID},
		},
		{
			name:       "receipt posted without timestamp",
			constraint: "purchase_receipts_posted_shape",
			query:      `UPDATE purchase_receipts SET status = 'POSTED', posted_at = NULL WHERE id = $1`,
			args:       []any{receipt.ID},
		},
		{
			name:  "return unknown status",
			query: `UPDATE purchase_returns SET status = 'UNKNOWN' WHERE id = $1`,
			args:  []any{returnRow.ID},
		},
		{
			name:       "return draft with posted timestamp",
			constraint: "purchase_returns_posted_shape",
			query:      `UPDATE purchase_returns SET posted_at = $2 WHERE id = $1`,
			args:       []any{returnRow.ID, now},
		},
		{
			name:  "adjustment unknown status",
			query: `UPDATE purchase_receipt_adjustments SET status = 'UNKNOWN' WHERE id = $1`,
			args:  []any{adjustment.ID},
		},
		{
			name:       "adjustment posted without timestamp",
			constraint: "purchase_receipt_adjustments_posted_shape",
			query:      `UPDATE purchase_receipt_adjustments SET status = 'POSTED', posted_at = NULL WHERE id = $1`,
			args:       []any{adjustment.ID},
		},
	}
	for _, test := range statusCases {
		t.Run(test.name, func(t *testing.T) {
			_, err := data.sqldb.ExecContext(ctx, test.query, test.args...)
			assertDatabaseGovernancePGError(t, err, "23514", test.constraint)
		})
	}
}

func TestDatabaseGovernancePostgresQualityAndAttachmentConstraints(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	now := time.Now().UTC()
	suffix := postgresTestSuffix()

	lot, err := client.InventoryLot.Create().
		SetSubjectType("MATERIAL").
		SetSubjectID(fixtures.materialID).
		SetLotNo("DB-GOV-QA-LOT-" + suffix).
		Save(ctx)
	if err != nil {
		t.Fatalf("create quality inspection lot: %v", err)
	}
	inspection, err := client.QualityInspection.Create().
		SetInspectionNo("DB-GOV-QA-" + suffix).
		SetInventoryLotID(lot.ID).
		SetMaterialID(fixtures.materialID).
		SetWarehouseID(fixtures.warehouseID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create valid quality inspection: %v", err)
	}

	qualityCases := []struct {
		name       string
		constraint string
		query      string
		args       []any
	}{
		{
			name:  "unknown quality status",
			query: `UPDATE quality_inspections SET status = 'UNKNOWN' WHERE id = $1`,
			args:  []any{inspection.ID},
		},
		{
			name:  "unknown quality result",
			query: `UPDATE quality_inspections SET result = 'UNKNOWN' WHERE id = $1`,
			args:  []any{inspection.ID},
		},
		{
			name:       "passed inspection with rejection result",
			constraint: "quality_inspections_lifecycle_shape",
			query:      `UPDATE quality_inspections SET status = 'PASSED', result = 'REJECT', inspected_at = $2 WHERE id = $1`,
			args:       []any{inspection.ID, now},
		},
		{
			name:       "passed inspection without timestamp",
			constraint: "quality_inspections_lifecycle_shape",
			query:      `UPDATE quality_inspections SET status = 'PASSED', result = 'PASS', inspected_at = NULL WHERE id = $1`,
			args:       []any{inspection.ID},
		},
	}
	for _, test := range qualityCases {
		t.Run(test.name, func(t *testing.T) {
			_, err := data.sqldb.ExecContext(ctx, test.query, test.args...)
			assertDatabaseGovernancePGError(t, err, "23514", test.constraint)
		})
	}

	content := []byte("abc")
	attachment, err := client.BusinessAttachment.Create().
		SetOwnerType("sales_order").
		SetOwnerID(1).
		SetFileName("db-governance.txt").
		SetMimeType("text/plain").
		SetFileSize(len(content)).
		SetSha256(strings.Repeat("a", 64)).
		SetContent(content).
		Save(ctx)
	if err != nil {
		t.Fatalf("create valid business attachment: %v", err)
	}
	_, err = data.sqldb.ExecContext(ctx, `UPDATE business_attachments SET content = $2 WHERE id = $1`, attachment.ID, []byte("abcd"))
	assertDatabaseGovernancePGError(t, err, "23514", "business_attachments_content_size_matches")
	_, err = data.sqldb.ExecContext(ctx, `UPDATE business_attachments SET sha256 = 'NOT-A-SHA256' WHERE id = $1`, attachment.ID)
	assertDatabaseGovernancePGError(t, err, "23514", "business_attachments_sha256_lower_hex")
	tooLarge := make([]byte, 5*1024*1024+1)
	_, err = data.sqldb.ExecContext(ctx, `UPDATE business_attachments SET file_size = $2, content = $3 WHERE id = $1`, attachment.ID, len(tooLarge), tooLarge)
	assertDatabaseGovernancePGError(t, err, "23514", "business_attachments_file_size_max")
}

func TestDatabaseGovernanceWorkflowTaskEventHookRejectsMutation(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	_, client := openPurchaseReceiptPostgresTestData(t)
	suffix := postgresTestSuffix()

	task, err := client.WorkflowTask.Create().
		SetTaskCode("DB-GOV-TASK-" + suffix).
		SetTaskGroup("database-governance").
		SetTaskName("数据库治理事件不可变测试").
		SetSourceType("database_governance_test").
		SetSourceID(1).
		SetTaskStatusKey("ready").
		SetOwnerRoleKey("admin").
		Save(ctx)
	if err != nil {
		t.Fatalf("create workflow task: %v", err)
	}
	event, err := client.WorkflowTaskEvent.Create().
		SetTaskID(task.ID).
		SetEventType("created").
		Save(ctx)
	if err != nil {
		t.Fatalf("create workflow task event: %v", err)
	}

	if _, err := event.Update().SetReason("must not mutate").Save(ctx); err == nil || !strings.Contains(err.Error(), "workflow_task_events are immutable event facts") {
		t.Fatalf("workflow task event update error = %v, want immutable event rejection", err)
	}
	if err := client.WorkflowTaskEvent.DeleteOneID(event.ID).Exec(ctx); err == nil || !strings.Contains(err.Error(), "workflow_task_events are immutable event facts") {
		t.Fatalf("workflow task event delete error = %v, want immutable event rejection", err)
	}
}

func assertDatabaseGovernancePGError(t *testing.T, err error, code string, constraint string) {
	t.Helper()
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != code {
		t.Fatalf("PostgreSQL error = %v, want SQLSTATE %s", err, code)
	}
	if constraint != "" && pgErr.ConstraintName != constraint {
		t.Fatalf("PostgreSQL constraint = %q, want %q (error: %v)", pgErr.ConstraintName, constraint, err)
	}
}
