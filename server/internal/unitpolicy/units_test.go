package unitpolicy

import "testing"

func TestStandardCatalog(t *testing.T) {
	units := Standards()
	if len(units) != 8 {
		t.Fatalf("expected 8 distinct business units, got %d", len(units))
	}
	seen := map[string]bool{}
	for _, unit := range units {
		if seen[unit.Code] || unit.Name == "" || unit.Precision < 0 || unit.Precision > 6 {
			t.Fatalf("invalid standard: %#v", unit)
		}
		seen[unit.Code] = true
	}
	for source, expected := range map[string]string{" PCS ": "个", "件": "个", "Y": "码", "kg": "千克", "公斤": "千克", "套": "套", "对": "对", "米": "米", "0": "0"} {
		if got := CanonicalLabel(source); got != expected {
			t.Errorf("%s = %s, want %s", source, got, expected)
		}
	}
}
