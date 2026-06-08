package biz

import (
	"context"
	"errors"
	"testing"
)

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

func TestNormalizeBusinessRecordFilterAllowsPayloadDateFields(t *testing.T) {
	filter := normalizeBusinessRecordFilter(BusinessRecordFilter{
		DateFilterKey:  "payload.source_date",
		DateRangeStart: "2026-04-01",
		DateRangeEnd:   "2026-04-30",
	})

	if filter.DateFilterKey != "payload.source_date" {
		t.Fatalf("expected payload date filter key retained, got %q", filter.DateFilterKey)
	}
	if filter.DateRangeStart != "2026-04-01" || filter.DateRangeEnd != "2026-04-30" {
		t.Fatalf("expected normalized date range retained, got %q-%q", filter.DateRangeStart, filter.DateRangeEnd)
	}

	unsafeFilter := normalizeBusinessRecordFilter(BusinessRecordFilter{
		DateFilterKey: "payload.source_date;drop",
	})
	if unsafeFilter.DateFilterKey != "" {
		t.Fatalf("expected unsafe payload date filter key cleared, got %q", unsafeFilter.DateFilterKey)
	}
}

func TestBusinessRecordUsecaseRejectsRetiredModuleWrites(t *testing.T) {
	ctx := context.Background()
	uc := NewBusinessRecordUsecase(&businessRecordRepoSpy{})

	for _, moduleKey := range []string{"partners", "project-orders"} {
		t.Run("create_"+moduleKey, func(t *testing.T) {
			_, err := uc.CreateRecord(ctx, &BusinessRecordMutation{
				ModuleKey:         moduleKey,
				Title:             "旧入口写入",
				BusinessStatusKey: "project_pending",
				OwnerRoleKey:      "sales",
				Payload:           map[string]any{},
			}, 1)
			if !errors.Is(err, ErrBusinessRecordModuleRetired) {
				t.Fatalf("expected retired module error, got %v", err)
			}
		})

		t.Run("update_"+moduleKey, func(t *testing.T) {
			_, err := uc.UpdateRecord(ctx, 1, &BusinessRecordMutation{
				ModuleKey:         moduleKey,
				Title:             "旧入口更新",
				BusinessStatusKey: "project_pending",
				OwnerRoleKey:      "sales",
				Payload:           map[string]any{},
			}, 1)
			if !errors.Is(err, ErrBusinessRecordModuleRetired) {
				t.Fatalf("expected retired module error, got %v", err)
			}
		})
	}
}

type businessRecordRepoSpy struct {
	createCalled bool
	updateCalled bool
}

func (r *businessRecordRepoSpy) ListBusinessRecords(context.Context, BusinessRecordFilter) ([]*BusinessRecord, int, error) {
	return nil, 0, nil
}

func (r *businessRecordRepoSpy) CountBusinessRecordsByModuleAndStatus(context.Context) ([]BusinessRecordModuleStatusCount, error) {
	return nil, nil
}

func (r *businessRecordRepoSpy) CreateBusinessRecord(context.Context, *BusinessRecordMutation, int) (*BusinessRecord, error) {
	r.createCalled = true
	return &BusinessRecord{}, nil
}

func (r *businessRecordRepoSpy) UpdateBusinessRecord(context.Context, int, *BusinessRecordMutation, int) (*BusinessRecord, error) {
	r.updateCalled = true
	return &BusinessRecord{}, nil
}

func (r *businessRecordRepoSpy) DeleteBusinessRecords(context.Context, []int, string, int) (int, error) {
	return 0, nil
}

func (r *businessRecordRepoSpy) RestoreBusinessRecord(context.Context, int, int) (*BusinessRecord, error) {
	return &BusinessRecord{}, nil
}
