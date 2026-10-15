package data

import (
	"testing"

	"server/internal/data/model/ent/workflowtask"
)

func TestEntRuntimeDefaultsInitialized(t *testing.T) {
	if workflowtask.DefaultCreatedAt == nil || workflowtask.DefaultUpdatedAt == nil {
		t.Fatalf("workflow task ent runtime defaults are not initialized")
	}
}
