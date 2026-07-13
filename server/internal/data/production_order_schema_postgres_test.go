package data

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestProductionOrderSchemaPostgresConstraintsAndReceiptIndexes(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	data, _ := openPurchaseReceiptPostgresTestData(t)
	suffix := strings.ToLower(postgresTestSuffix())
	now := time.Now().UTC()

	var actorID int
	if err := data.sqldb.QueryRowContext(ctx, `
INSERT INTO admin_users (username, password_hash, created_at, updated_at)
VALUES ($1, 'test-password-hash', $2, $2)
RETURNING id`, "production-order-actor-"+suffix, now).Scan(&actorID); err != nil {
		t.Fatalf("insert actor: %v", err)
	}
	var unitID int
	if err := data.sqldb.QueryRowContext(ctx, `
INSERT INTO units (code, name, created_at, updated_at)
VALUES ($1, '只', $2, $2)
RETURNING id`, "PO-UNIT-"+suffix, now).Scan(&unitID); err != nil {
		t.Fatalf("insert unit: %v", err)
	}
	var productID int
	if err := data.sqldb.QueryRowContext(ctx, `
INSERT INTO products (code, name, default_unit_id, created_at, updated_at)
VALUES ($1, '生产订单测试产品', $2, $3, $3)
RETURNING id`, "PO-PRODUCT-"+suffix, unitID, now).Scan(&productID); err != nil {
		t.Fatalf("insert product: %v", err)
	}

	insertDraftOrder := func(orderNo string) int {
		t.Helper()
		var orderID int
		if err := data.sqldb.QueryRowContext(ctx, `
INSERT INTO production_orders (order_no, status, version, created_by, created_at, updated_at)
VALUES ($1, 'DRAFT', 1, $2, $3, $3)
RETURNING id`, orderNo, actorID, now).Scan(&orderID); err != nil {
			t.Fatalf("insert production order %s: %v", orderNo, err)
		}
		return orderID
	}
	orderID := insertDraftOrder("PO-PG-" + suffix)
	secondOrderID := insertDraftOrder("PO-PG-SECOND-" + suffix)

	assertPGCode := func(name string, want string, query string, args ...any) {
		t.Helper()
		_, err := data.sqldb.ExecContext(ctx, query, args...)
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != want {
			t.Fatalf("%s error = %v, want PostgreSQL %s", name, err, want)
		}
	}

	assertPGCode("cancelled order without reason", "23514", `
INSERT INTO production_orders
  (order_no, status, version, created_by, cancelled_by, cancelled_at, created_at, updated_at)
VALUES ($1, 'CANCELLED', 1, $2, $2, $3, $3, $3)`, "PO-PG-BAD-CANCEL-"+suffix, actorID, now)
	assertPGCode("duplicate order number", "23505", `
INSERT INTO production_orders (order_no, status, version, created_by, created_at, updated_at)
VALUES ($1, 'DRAFT', 1, $2, $3, $3)`, "PO-PG-"+suffix, actorID, now)
	assertPGCode("released order without release actor", "23514", `
INSERT INTO production_orders (order_no, status, version, created_by, created_at, updated_at)
VALUES ($1, 'RELEASED', 1, $2, $3, $3)`, "PO-PG-BAD-RELEASE-"+suffix, actorID, now)
	assertPGCode("reversed planned dates", "23514", `
INSERT INTO production_orders
  (order_no, status, version, planned_start_at, planned_end_at, created_by, created_at, updated_at)
VALUES ($1, 'DRAFT', 1, $3, $2, $4, $2, $2)`, "PO-PG-BAD-DATES-"+suffix, now, now.Add(time.Hour), actorID)

	if _, err := data.sqldb.ExecContext(ctx, `
INSERT INTO production_order_items
  (production_order_id, line_no, product_id, unit_id, planned_quantity, created_at, updated_at)
VALUES ($1, 1, $2, $3, 10, $4, $4)`, orderID, productID, unitID, now); err != nil {
		t.Fatalf("insert valid production order item: %v", err)
	}
	assertPGCode("duplicate line number", "23505", `
INSERT INTO production_order_items
  (production_order_id, line_no, product_id, unit_id, planned_quantity, created_at, updated_at)
VALUES ($1, 1, $2, $3, 5, $4, $4)`, orderID, productID, unitID, now)
	assertPGCode("non-positive planned quantity", "23514", `
INSERT INTO production_order_items
  (production_order_id, line_no, product_id, unit_id, planned_quantity, created_at, updated_at)
VALUES ($1, 2, $2, $3, 0, $4, $4)`, orderID, productID, unitID, now)
	assertPGCode("unknown product foreign key", "23503", `
INSERT INTO production_order_items
  (production_order_id, line_no, product_id, unit_id, planned_quantity, created_at, updated_at)
VALUES ($1, 2, 9223372036854770000, $2, 1, $3, $3)`, orderID, unitID, now)

	insertEvent := func(targetOrderID int, commandKey string, fromStatus *string, toStatus string, version int, key string, hash string, reason *string) error {
		_, err := data.sqldb.ExecContext(ctx, `
INSERT INTO production_order_events
  (production_order_id, actor_id, command_key, from_status, to_status, order_version,
   idempotency_key, intent_hash, result_contract, mutation_result, reason, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
        'production.order-mutation-result/v1', $9::jsonb, $10, $11)`,
			targetOrderID, actorID, commandKey, fromStatus, toStatus, version, key, hash,
			fmt.Sprintf(`{"contract":"production.order-mutation-result/v1","order_id":%d}`, targetOrderID), reason, now)
		return err
	}
	if err := insertEvent(orderID, "CREATE", nil, "DRAFT", 1, "create-key-"+suffix, strings.Repeat("a", 64), nil); err != nil {
		t.Fatalf("insert valid create receipt: %v", err)
	}
	if err := insertEvent(secondOrderID, "CREATE", nil, "DRAFT", 1, "create-key-"+suffix, strings.Repeat("a", 64), nil); err == nil {
		t.Fatal("duplicate CREATE receipt must be rejected independent of order id")
	} else {
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
			t.Fatalf("duplicate CREATE receipt error = %v, want PostgreSQL 23505", err)
		}
	}
	fromDraft := "DRAFT"
	if err := insertEvent(secondOrderID, "SAVE", &fromDraft, "DRAFT", 2, "save-key-"+suffix, strings.Repeat("d", 64), nil); err != nil {
		t.Fatalf("insert valid SAVE receipt: %v", err)
	}
	if err := insertEvent(secondOrderID, "SAVE", &fromDraft, "DRAFT", 3, "save-key-"+suffix, strings.Repeat("d", 64), nil); err == nil {
		t.Fatal("duplicate non-CREATE receipt for the same order must be rejected")
	} else {
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
			t.Fatalf("duplicate non-CREATE receipt error = %v, want PostgreSQL 23505", err)
		}
	}
	if err := insertEvent(secondOrderID, "CANCEL", &fromDraft, "CANCELLED", 4, "cancel-key-"+suffix, strings.Repeat("b", 64), nil); err == nil {
		t.Fatal("CANCEL receipt without reason must fail")
	} else {
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
			t.Fatalf("CANCEL receipt without reason error = %v, want PostgreSQL 23514", err)
		}
	}
	assertPGCode("partial receipt missing mutation result", "23502", `
INSERT INTO production_order_events
  (production_order_id, actor_id, command_key, to_status, order_version,
   idempotency_key, intent_hash, result_contract, created_at)
VALUES ($1, $2, 'CREATE', 'DRAFT', 1, $3, $4,
        'production.order-mutation-result/v1', $5)`, secondOrderID, actorID, "partial-key-"+suffix, strings.Repeat("c", 64), now)

	assertPGCode("delete referenced production order", "23503", `DELETE FROM production_orders WHERE id = $1`, orderID)
}
