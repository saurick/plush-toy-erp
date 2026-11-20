package status

import "testing"

func TestPostingDocumentStatuses(t *testing.T) {
	for _, value := range []string{"DRAFT", "POSTED", "CANCELLED", " posted "} {
		if !IsPostingDocumentStatus(value) {
			t.Fatalf("expected %q to be valid posting document status", value)
		}
	}
	for _, value := range []string{"", "SUBMITTED", "SHIPPED"} {
		if IsPostingDocumentStatus(value) {
			t.Fatalf("expected %q to be invalid posting document status", value)
		}
	}
}

func TestPostingDocumentItemGuards(t *testing.T) {
	if !CanAddPurchaseReceiptItem(PurchaseReceiptDraft) || CanAddPurchaseReceiptItem(PurchaseReceiptPosted) {
		t.Fatalf("purchase receipt item guard drifted")
	}
	if !CanAddPurchaseReturnItem(PurchaseReturnDraft) || CanAddPurchaseReturnItem(PurchaseReturnCancelled) {
		t.Fatalf("purchase return item guard drifted")
	}
	if !CanAddPurchaseReceiptAdjustmentItem(PurchaseReceiptAdjustmentDraft) || CanAddPurchaseReceiptAdjustmentItem(PurchaseReceiptAdjustmentPosted) {
		t.Fatalf("purchase receipt adjustment item guard drifted")
	}
}

func TestPostingDocumentPostTransitions(t *testing.T) {
	tests := []struct {
		name        string
		fn          func(string) (PostingDocumentTransition, bool)
		current     string
		wantTarget  string
		wantChanged bool
		wantOK      bool
	}{
		{name: "receipt draft posts", fn: PostPurchaseReceipt, current: PurchaseReceiptDraft, wantTarget: PurchaseReceiptPosted, wantChanged: true, wantOK: true},
		{name: "receipt posted idempotent", fn: PostPurchaseReceipt, current: PurchaseReceiptPosted, wantTarget: PurchaseReceiptPosted, wantOK: true},
		{name: "receipt cancelled cannot post", fn: PostPurchaseReceipt, current: PurchaseReceiptCancelled},
		{name: "return draft posts", fn: PostPurchaseReturn, current: PurchaseReturnDraft, wantTarget: PurchaseReturnPosted, wantChanged: true, wantOK: true},
		{name: "adjustment draft posts", fn: PostPurchaseReceiptAdjustment, current: PurchaseReceiptAdjustmentDraft, wantTarget: PurchaseReceiptAdjustmentPosted, wantChanged: true, wantOK: true},
		{name: "unknown rejected", fn: PostPurchaseReceiptAdjustment, current: "READY"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := tt.fn(tt.current)
			if ok != tt.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tt.wantOK)
			}
			if !ok {
				return
			}
			if got.Target != tt.wantTarget || got.Changed != tt.wantChanged {
				t.Fatalf("transition = %+v, want target=%q changed=%v", got, tt.wantTarget, tt.wantChanged)
			}
		})
	}
}

func TestPostingDocumentCancelTransitions(t *testing.T) {
	tests := []struct {
		name        string
		fn          func(string) (PostingDocumentTransition, bool)
		current     string
		wantTarget  string
		wantChanged bool
		wantOK      bool
	}{
		{name: "receipt draft cancels", fn: CancelPurchaseReceipt, current: PurchaseReceiptDraft, wantTarget: PurchaseReceiptCancelled, wantChanged: true, wantOK: true},
		{name: "receipt posted cancels", fn: CancelPurchaseReceipt, current: PurchaseReceiptPosted, wantTarget: PurchaseReceiptCancelled, wantChanged: true, wantOK: true},
		{name: "receipt cancelled idempotent", fn: CancelPurchaseReceipt, current: PurchaseReceiptCancelled, wantTarget: PurchaseReceiptCancelled, wantOK: true},
		{name: "return draft cancels", fn: CancelPurchaseReturn, current: PurchaseReturnDraft, wantTarget: PurchaseReturnCancelled, wantChanged: true, wantOK: true},
		{name: "return posted cancels", fn: CancelPurchaseReturn, current: PurchaseReturnPosted, wantTarget: PurchaseReturnCancelled, wantChanged: true, wantOK: true},
		{name: "return cancelled idempotent", fn: CancelPurchaseReturn, current: PurchaseReturnCancelled, wantTarget: PurchaseReturnCancelled, wantOK: true},
		{name: "adjustment draft cancels", fn: CancelPurchaseReceiptAdjustment, current: PurchaseReceiptAdjustmentDraft, wantTarget: PurchaseReceiptAdjustmentCancelled, wantChanged: true, wantOK: true},
		{name: "adjustment posted cancels", fn: CancelPurchaseReceiptAdjustment, current: PurchaseReceiptAdjustmentPosted, wantTarget: PurchaseReceiptAdjustmentCancelled, wantChanged: true, wantOK: true},
		{name: "adjustment cancelled idempotent", fn: CancelPurchaseReceiptAdjustment, current: PurchaseReceiptAdjustmentCancelled, wantTarget: PurchaseReceiptAdjustmentCancelled, wantOK: true},
		{name: "unknown rejected", fn: CancelPurchaseReturn, current: "READY"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := tt.fn(tt.current)
			if ok != tt.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tt.wantOK)
			}
			if !ok {
				return
			}
			if got.Target != tt.wantTarget || got.Changed != tt.wantChanged {
				t.Fatalf("transition = %+v, want target=%q changed=%v", got, tt.wantTarget, tt.wantChanged)
			}
		})
	}
}
