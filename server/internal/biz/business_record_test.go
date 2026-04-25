package biz

import "testing"

func TestBusinessRecordModuleRegistryIncludesFinanceAndQualityV1(t *testing.T) {
	tests := []struct {
		moduleKey string
		prefix    string
	}{
		{moduleKey: "quality-inspections", prefix: "QC"},
		{moduleKey: "receivables", prefix: "AR"},
		{moduleKey: "invoices", prefix: "INV"},
	}

	for _, tt := range tests {
		t.Run(tt.moduleKey, func(t *testing.T) {
			if !IsValidBusinessRecordModule(tt.moduleKey) {
				t.Fatalf("expected %s to be a valid business record module", tt.moduleKey)
			}
			if got := BusinessRecordDocumentPrefix(tt.moduleKey); got != tt.prefix {
				t.Fatalf("expected prefix %s, got %s", tt.prefix, got)
			}
		})
	}
}

func TestBusinessRecordModuleRegistryListsFinanceAndQualityV1(t *testing.T) {
	keys := ListBusinessRecordModuleKeys()
	keySet := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		keySet[key] = struct{}{}
	}

	for _, key := range []string{"quality-inspections", "receivables", "invoices"} {
		if _, ok := keySet[key]; !ok {
			t.Fatalf("expected %s in ordered module key list", key)
		}
	}
}
