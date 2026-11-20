package data

import (
	"strings"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"

	_ "github.com/mattn/go-sqlite3"
)

func TestProductionOrderSchemaLifecycleAndAppendOnlyHooks(t *testing.T) {
	client := enttest.Open(t, dialect.SQLite, "file:production_order_schema?mode=memory&cache=shared&_fk=1", enttest.WithOptions(ent.Log(t.Log)))
	t.Cleanup(func() { _ = client.Close() })

	actor := client.AdminUser.Create().
		SetUsername("production-order-schema-actor").
		SetPasswordHash("test-password-hash").
		SaveX(t.Context())
	order := client.ProductionOrder.Create().
		SetOrderNo("PO-SCHEMA-001").
		SetCreatedBy(actor.ID).
		SaveX(t.Context())

	if err := client.ProductionOrder.DeleteOneID(order.ID).Exec(t.Context()); err == nil || !strings.Contains(err.Error(), "cancel them instead of deleting") {
		t.Fatalf("delete production order error = %v, want lifecycle delete guard", err)
	}

	event := client.ProductionOrderEvent.Create().
		SetProductionOrderID(order.ID).
		SetActorID(actor.ID).
		SetCommandKey("CREATE").
		SetToStatus("DRAFT").
		SetOrderVersion(1).
		SetIdempotencyKey("production-order-create-key").
		SetIntentHash(strings.Repeat("a", 64)).
		SetResultContract("production.order-mutation-result/v1").
		SetMutationResult(map[string]any{"order_id": order.ID}).
		SaveX(t.Context())

	if _, err := client.ProductionOrderEvent.UpdateOneID(event.ID).Save(t.Context()); err == nil || !strings.Contains(err.Error(), "append-only") {
		t.Fatalf("update production order event error = %v, want append-only guard", err)
	}
	if err := client.ProductionOrderEvent.DeleteOneID(event.ID).Exec(t.Context()); err == nil || !strings.Contains(err.Error(), "append-only") {
		t.Fatalf("delete production order event error = %v, want append-only guard", err)
	}
}

func TestProductionOrderSchemaPortableChecks(t *testing.T) {
	client := enttest.Open(t, dialect.SQLite, "file:production_order_checks?mode=memory&cache=shared&_fk=1", enttest.WithOptions(ent.Log(t.Log)))
	t.Cleanup(func() { _ = client.Close() })

	actor := client.AdminUser.Create().
		SetUsername("production-order-check-actor").
		SetPasswordHash("test-password-hash").
		SaveX(t.Context())

	if _, err := client.ProductionOrder.Create().
		SetOrderNo("PO-BAD-CANCEL").
		SetStatus("CANCELLED").
		SetCreatedBy(actor.ID).
		SetCancelledBy(actor.ID).
		SetCancelledAt(time.Now().UTC()).
		Save(t.Context()); err == nil {
		t.Fatal("cancelled production order without reason must fail")
	}

	order := client.ProductionOrder.Create().
		SetOrderNo("PO-CHECK-001").
		SetCreatedBy(actor.ID).
		SaveX(t.Context())
	if _, err := client.ProductionOrderEvent.Create().
		SetProductionOrderID(order.ID).
		SetActorID(actor.ID).
		SetCommandKey("CANCEL").
		SetFromStatus("DRAFT").
		SetToStatus("CANCELLED").
		SetOrderVersion(2).
		SetIdempotencyKey("production-order-cancel-key").
		SetIntentHash(strings.Repeat("b", 64)).
		SetResultContract("production.order-mutation-result/v1").
		SetMutationResult(map[string]any{"order_id": order.ID}).
		Save(t.Context()); err == nil {
		t.Fatal("cancel receipt without reason must fail")
	}
}
