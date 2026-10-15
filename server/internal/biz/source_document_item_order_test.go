package biz

import (
	"errors"
	"strings"
	"testing"
)

func TestNormalizeSourceDocumentItemOrderMutation(t *testing.T) {
	input := &SourceDocumentItemOrderMutation{ExpectedVersion: 3, ItemIDs: []int{7, 2, 9}}
	normalized, err := normalizeSourceDocumentItemOrderMutation(11, input)
	if err != nil {
		t.Fatalf("normalize valid source document item order: %v", err)
	}
	if normalized.ExpectedVersion != 3 || len(normalized.ItemIDs) != 3 || normalized.ItemIDs[0] != 7 || normalized.ItemIDs[2] != 9 {
		t.Fatalf("unexpected normalized order: %#v", normalized)
	}
	normalized.ItemIDs[0] = 99
	if input.ItemIDs[0] != 7 {
		t.Fatalf("normalization must not alias caller item ids: %#v", input.ItemIDs)
	}

	for name, tc := range map[string]struct {
		id int
		in *SourceDocumentItemOrderMutation
	}{
		"missing document": {in: input},
		"missing mutation": {id: 1},
		"missing version":  {id: 1, in: &SourceDocumentItemOrderMutation{ItemIDs: []int{1}}},
		"empty items":      {id: 1, in: &SourceDocumentItemOrderMutation{ExpectedVersion: 1}},
		"non-positive item": {id: 1, in: &SourceDocumentItemOrderMutation{
			ExpectedVersion: 1,
			ItemIDs:         []int{1, 0},
		}},
		"duplicate item": {id: 1, in: &SourceDocumentItemOrderMutation{
			ExpectedVersion: 1,
			ItemIDs:         []int{1, 1},
		}},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := normalizeSourceDocumentItemOrderMutation(tc.id, tc.in); !errors.Is(err, ErrBadParam) {
				t.Fatalf("expected bad param, got %v", err)
			}
		})
	}
}

func TestSourceDocumentItemOrderLifecycleGuards(t *testing.T) {
	tests := []struct {
		name    string
		can     func(string) bool
		allowed []string
		blocked []string
	}{
		{
			name:    "sales order",
			can:     CanReorderSalesOrderItems,
			allowed: []string{SalesOrderStatusDraft, SalesOrderStatusSubmitted, SalesOrderStatusActive},
			blocked: []string{SalesOrderStatusClosed, SalesOrderStatusCanceled, "", "unknown"},
		},
		{
			name:    "purchase order",
			can:     CanReorderPurchaseOrderItems,
			allowed: []string{PurchaseOrderStatusDraft, PurchaseOrderStatusSubmitted, PurchaseOrderStatusApproved},
			blocked: []string{PurchaseOrderStatusClosed, PurchaseOrderStatusCanceled, "", "unknown"},
		},
		{
			name:    "outsourcing order",
			can:     CanReorderOutsourcingOrderItems,
			allowed: []string{OutsourcingOrderStatusDraft, OutsourcingOrderStatusSubmitted, OutsourcingOrderStatusConfirmed},
			blocked: []string{OutsourcingOrderStatusClosed, OutsourcingOrderStatusCanceled, "", "unknown"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			for _, status := range tc.allowed {
				if !tc.can("  " + strings.ToUpper(status) + "  ") {
					t.Fatalf("expected %q to allow item reordering", status)
				}
			}
			for _, status := range tc.blocked {
				if tc.can(status) {
					t.Fatalf("expected %q to block item reordering", status)
				}
			}
		})
	}
}
