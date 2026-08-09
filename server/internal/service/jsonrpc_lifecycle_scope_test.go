package service

import (
	"testing"

	"server/internal/biz"
)

func TestLifecycleScopeParsers(t *testing.T) {
	t.Parallel()

	masterFilter := masterDataFilterFromParams(map[string]any{
		"lifecycle_scope": biz.LifecycleScopeHistory,
	})
	if masterFilter.LifecycleScope != biz.LifecycleScopeHistory {
		t.Fatalf("master lifecycle scope = %q", masterFilter.LifecycleScope)
	}

	skuFilter := productSKUFilterFromParams(map[string]any{
		"lifecycle_scope": biz.LifecycleScopeCurrent,
	})
	if skuFilter.LifecycleScope != biz.LifecycleScopeCurrent {
		t.Fatalf("product SKU lifecycle scope = %q", skuFilter.LifecycleScope)
	}

	bomFilter := bomHeaderFilterFromParams(map[string]any{
		"lifecycle_scope": biz.LifecycleScopeAll,
	})
	if bomFilter.LifecycleScope != biz.LifecycleScopeAll {
		t.Fatalf("BOM lifecycle scope = %q", bomFilter.LifecycleScope)
	}

	productionFilter, ok := productionOrderFilterFromParams(map[string]any{
		"lifecycle_scope": biz.LifecycleScopeHistory,
		"limit":           float64(50),
		"offset":          float64(0),
	})
	if !ok || productionFilter.LifecycleScope != biz.LifecycleScopeHistory {
		t.Fatalf("production lifecycle filter = %#v, ok=%v", productionFilter, ok)
	}
}

func TestProductionOrderLifecycleScopeIsStrictlyParsed(t *testing.T) {
	t.Parallel()

	if productionOrderAllowsOnly(map[string]any{"lifecycle_scope": "history"}, "keyword") {
		t.Fatal("strict-key guard accepted lifecycle_scope when it was not declared")
	}
	if _, ok := productionOrderFilterFromParams(map[string]any{
		"lifecycle_scope": true,
		"limit":           float64(50),
		"offset":          float64(0),
	}); ok {
		t.Fatal("production filter accepted non-string lifecycle_scope")
	}
}
