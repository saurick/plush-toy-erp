package status

import "testing"

func TestPurchaseOrderStatusValues(t *testing.T) {
	for _, value := range []string{PurchaseOrderDraft, PurchaseOrderSubmitted, PurchaseOrderApproved, PurchaseOrderClosed, PurchaseOrderCanceled} {
		if !IsPurchaseOrderStatus(value) {
			t.Fatalf("expected %q to be valid purchase order status", value)
		}
	}
	if IsPurchaseOrderStatus("posted") {
		t.Fatal("posted must not be a purchase order lifecycle status")
	}
	for _, value := range []string{PurchaseOrderItemOpen, PurchaseOrderItemClosed, PurchaseOrderItemCanceled} {
		if !IsPurchaseOrderItemStatus(value) {
			t.Fatalf("expected %q to be valid purchase order item status", value)
		}
	}
}

func TestCanChangePurchaseOrderLifecycle(t *testing.T) {
	tests := []struct {
		name    string
		current string
		next    string
		want    bool
	}{
		{name: "same status idempotent", current: PurchaseOrderDraft, next: PurchaseOrderDraft, want: true},
		{name: "draft submits", current: PurchaseOrderDraft, next: PurchaseOrderSubmitted, want: true},
		{name: "draft cancels", current: PurchaseOrderDraft, next: PurchaseOrderCanceled, want: true},
		{name: "submitted approves", current: PurchaseOrderSubmitted, next: PurchaseOrderApproved, want: true},
		{name: "submitted cancels", current: PurchaseOrderSubmitted, next: PurchaseOrderCanceled, want: true},
		{name: "approved closes", current: PurchaseOrderApproved, next: PurchaseOrderClosed, want: true},
		{name: "approved cancels", current: PurchaseOrderApproved, next: PurchaseOrderCanceled, want: true},
		{name: "draft cannot approve", current: PurchaseOrderDraft, next: PurchaseOrderApproved},
		{name: "closed cannot reopen", current: PurchaseOrderClosed, next: PurchaseOrderApproved},
		{name: "invalid target", current: PurchaseOrderApproved, next: "posted"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := CanChangePurchaseOrderLifecycle(tt.current, tt.next); got != tt.want {
				t.Fatalf("CanChangePurchaseOrderLifecycle(%q, %q)=%v, want %v", tt.current, tt.next, got, tt.want)
			}
		})
	}
}

func TestIsPurchaseOrderSettled(t *testing.T) {
	for _, value := range []string{PurchaseOrderClosed, PurchaseOrderCanceled, " closed "} {
		if !IsPurchaseOrderSettled(value) {
			t.Fatalf("expected %q to be settled", value)
		}
	}
	for _, value := range []string{PurchaseOrderDraft, PurchaseOrderSubmitted, PurchaseOrderApproved, "posted"} {
		if IsPurchaseOrderSettled(value) {
			t.Fatalf("expected %q to be unsettled", value)
		}
	}
}
