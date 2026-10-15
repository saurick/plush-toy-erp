package biz

import "testing"

func TestNormalizeLifecycleScope(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input string
		want  string
		ok    bool
	}{
		{name: "legacy empty", input: "", want: "", ok: true},
		{name: "current normalized", input: " CURRENT ", want: LifecycleScopeCurrent, ok: true},
		{name: "history", input: LifecycleScopeHistory, want: LifecycleScopeHistory, ok: true},
		{name: "all", input: LifecycleScopeAll, want: LifecycleScopeAll, ok: true},
		{name: "unknown", input: "archived", want: "", ok: false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			got, ok := NormalizeLifecycleScope(test.input)
			if got != test.want || ok != test.ok {
				t.Fatalf("NormalizeLifecycleScope(%q) = %q, %v; want %q, %v", test.input, got, ok, test.want, test.ok)
			}
		})
	}
}

func TestLifecycleScopeAllowsStatus(t *testing.T) {
	t.Parallel()

	current := []string{"draft", "active"}
	history := []string{"closed", "canceled"}
	if !LifecycleScopeAllowsStatus(LifecycleScopeCurrent, "draft", current, history) {
		t.Fatal("current scope must accept current status")
	}
	if LifecycleScopeAllowsStatus(LifecycleScopeCurrent, "closed", current, history) {
		t.Fatal("current scope must reject history status")
	}
	if !LifecycleScopeAllowsStatus(LifecycleScopeHistory, "closed", current, history) {
		t.Fatal("history scope must accept history status")
	}
	if !LifecycleScopeAllowsStatus(LifecycleScopeAll, "closed", current, history) {
		t.Fatal("all scope must accept every known status")
	}
	if !LifecycleScopeAllowsStatus("", "closed", current, history) {
		t.Fatal("legacy empty scope must preserve existing status filtering")
	}
}

func TestLifecycleFiltersRejectIncompatibleStatusAndScope(t *testing.T) {
	t.Parallel()

	if _, err := normalizeSalesOrderFilter(SalesOrderFilter{
		LifecycleScope:  LifecycleScopeHistory,
		LifecycleStatus: SalesOrderStatusActive,
	}); err == nil {
		t.Fatal("sales filter accepted a current status in history scope")
	}
	if _, err := normalizePurchaseOrderFilter(PurchaseOrderFilter{
		LifecycleScope:  LifecycleScopeCurrent,
		LifecycleStatus: PurchaseOrderStatusClosed,
	}); err == nil {
		t.Fatal("purchase filter accepted a history status in current scope")
	}
	if _, err := normalizeOutsourcingOrderFilter(OutsourcingOrderFilter{
		LifecycleScope:  LifecycleScopeHistory,
		LifecycleStatus: OutsourcingOrderStatusConfirmed,
	}); err == nil {
		t.Fatal("outsourcing filter accepted a current status in history scope")
	}
	if _, err := normalizeMasterDataFilter(MasterDataFilter{LifecycleScope: "archive"}); err == nil {
		t.Fatal("master-data filter accepted an unknown lifecycle scope")
	}
	if _, err := normalizeProductSKUFilter(ProductSKUFilter{LifecycleScope: "archive"}); err == nil {
		t.Fatal("product SKU filter accepted an unknown lifecycle scope")
	}
}

func TestLifecycleActiveState(t *testing.T) {
	t.Parallel()

	if active, scoped := LifecycleActiveState(LifecycleScopeCurrent); !scoped || !active {
		t.Fatalf("current active state = %v, %v; want true, true", active, scoped)
	}
	if active, scoped := LifecycleActiveState(LifecycleScopeHistory); !scoped || active {
		t.Fatalf("history active state = %v, %v; want false, true", active, scoped)
	}
	if _, scoped := LifecycleActiveState(LifecycleScopeAll); scoped {
		t.Fatal("all scope must not add an active predicate")
	}
}
