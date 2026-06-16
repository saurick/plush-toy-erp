package data

import (
	"context"
	"testing"

	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	_ "github.com/mattn/go-sqlite3"
)

func TestRuntimeAuditEventIsAppendOnly(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:runtime_audit_event_append_only?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	event, err := client.RuntimeAuditEvent.Create().
		SetEventType(adminBootstrapEventCompleted).
		SetEventKey(adminBootstrapMarkerKey).
		SetSource(adminBootstrapAuditSource).
		SetPayload(`{"username":"admin"}`).
		Save(ctx)
	if err != nil {
		t.Fatalf("create runtime audit event failed: %v", err)
	}

	if err := client.RuntimeAuditEvent.UpdateOneID(event.ID).SetPayload(`{}`).Exec(ctx); err == nil {
		t.Fatal("expected runtime audit event update to be rejected")
	}
	if err := client.RuntimeAuditEvent.DeleteOneID(event.ID).Exec(ctx); err == nil {
		t.Fatal("expected runtime audit event delete to be rejected")
	}
}

func TestRuntimeMarkerIsImmutable(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:runtime_marker_immutable?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	marker, err := client.RuntimeMarker.Create().
		SetMarkerKey(adminBootstrapMarkerKey).
		SetMarkerValue(`{"username":"admin"}`).
		Save(ctx)
	if err != nil {
		t.Fatalf("create runtime marker failed: %v", err)
	}

	if err := client.RuntimeMarker.UpdateOneID(marker.ID).SetMarkerValue(`{}`).Exec(ctx); err == nil {
		t.Fatal("expected runtime marker update to be rejected")
	}
	if err := client.RuntimeMarker.DeleteOneID(marker.ID).Exec(ctx); err == nil {
		t.Fatal("expected runtime marker delete to be rejected")
	}
}
