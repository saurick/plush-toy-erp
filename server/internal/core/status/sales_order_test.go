package status

import "testing"

func TestSalesOrderStatusValues(t *testing.T) {
	for _, value := range []string{"draft", "submitted", "active", "closed", "canceled", " ACTIVE "} {
		if !IsSalesOrderStatus(value) {
			t.Fatalf("expected %q to be valid sales order status", value)
		}
	}
	if IsSalesOrderStatus("shipped") {
		t.Fatal("shipped must not be a sales order lifecycle status")
	}
	for _, value := range []string{"open", "closed", "canceled", " CANCELED "} {
		if !IsSalesOrderItemStatus(value) {
			t.Fatalf("expected %q to be valid sales order item status", value)
		}
	}
}

func TestCanChangeSalesOrderLifecycle(t *testing.T) {
	tests := []struct {
		name    string
		current string
		next    string
		want    bool
	}{
		{name: "same status idempotent", current: SalesOrderDraft, next: SalesOrderDraft, want: true},
		{name: "draft submits", current: SalesOrderDraft, next: SalesOrderSubmitted, want: true},
		{name: "draft cancels", current: SalesOrderDraft, next: SalesOrderCanceled, want: true},
		{name: "submitted activates", current: SalesOrderSubmitted, next: SalesOrderActive, want: true},
		{name: "submitted cancels", current: SalesOrderSubmitted, next: SalesOrderCanceled, want: true},
		{name: "active closes", current: SalesOrderActive, next: SalesOrderClosed, want: true},
		{name: "active cancels", current: SalesOrderActive, next: SalesOrderCanceled, want: true},
		{name: "draft cannot activate", current: SalesOrderDraft, next: SalesOrderActive},
		{name: "closed cannot reopen", current: SalesOrderClosed, next: SalesOrderActive},
		{name: "canceled cannot reopen", current: SalesOrderCanceled, next: SalesOrderDraft},
		{name: "invalid target", current: SalesOrderActive, next: "shipped"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := CanChangeSalesOrderLifecycle(tt.current, tt.next); got != tt.want {
				t.Fatalf("allowed = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsSalesOrderSettled(t *testing.T) {
	for _, value := range []string{SalesOrderClosed, SalesOrderCanceled, " closed "} {
		if !IsSalesOrderSettled(value) {
			t.Fatalf("expected %q to be settled", value)
		}
	}
	for _, value := range []string{SalesOrderDraft, SalesOrderSubmitted, SalesOrderActive, "shipped"} {
		if IsSalesOrderSettled(value) {
			t.Fatalf("expected %q not to be settled", value)
		}
	}
}
