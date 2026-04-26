package data

import (
	"testing"

	"server/internal/data/model/ent/businessrecord"
	"server/internal/data/model/ent/workflowtask"
)

func TestEntRuntimeDefaultsInitialized(t *testing.T) {
	if businessrecord.DefaultCreatedAt == nil || businessrecord.DefaultUpdatedAt == nil {
		t.Fatalf("business record ent runtime defaults are not initialized")
	}
	if workflowtask.DefaultCreatedAt == nil || workflowtask.DefaultUpdatedAt == nil {
		t.Fatalf("workflow task ent runtime defaults are not initialized")
	}
}
