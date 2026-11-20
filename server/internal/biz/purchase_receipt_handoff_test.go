package biz

import (
	"errors"
	"testing"
)

func TestPurchaseReceiptInboundCompletionKeepsAggregateQualitySeparate(t *testing.T) {
	tests := []struct {
		name string
		gate PurchaseReceiptQualityGate
		want error
	}{
		{name: "unknown quality outcome", gate: PurchaseReceiptQualityGate{Outcome: "UNKNOWN", TotalLines: 1, ReadyLineIDs: []int{1}}, want: ErrBadParam},
		{name: "passed and pending", gate: PurchaseReceiptQualityGate{Outcome: PurchaseReceiptQualityGatePending, TotalLines: 2, PassedLines: 1, ReadyLineIDs: []int{1}, PendingLineIDs: []int{2}}, want: ErrPurchaseReceiptQualityPending},
		{name: "passed and rejected", gate: PurchaseReceiptQualityGate{Outcome: PurchaseReceiptQualityGateRejected, TotalLines: 2, PassedLines: 1, ReadyLineIDs: []int{1}, RejectedLineIDs: []int{2}}, want: ErrPurchaseReceiptQualityRejected},
		{name: "ready with disposed rejection", gate: PurchaseReceiptQualityGate{Outcome: PurchaseReceiptQualityGateRejected, TotalLines: 2, PassedLines: 1, ReadyLineIDs: []int{1}, RejectedLineIDs: []int{2}, DisposedLineIDs: []int{2}}},
		{name: "posted and pending", gate: PurchaseReceiptQualityGate{Outcome: PurchaseReceiptQualityGatePending, TotalLines: 2, PassedLines: 1, PostedLines: 1, PendingLineIDs: []int{2}}, want: ErrPurchaseReceiptQualityPending},
		{name: "posted with disposed rejection", gate: PurchaseReceiptQualityGate{Outcome: PurchaseReceiptQualityGateRejected, TotalLines: 2, PassedLines: 1, PostedLines: 1, RejectedLineIDs: []int{2}, DisposedLineIDs: []int{2}}},
		{name: "already fully posted", gate: PurchaseReceiptQualityGate{Outcome: PurchaseReceiptQualityGateReady, TotalLines: 2, PassedLines: 2, PostedLines: 2}},
		{name: "all rejected without inbound", gate: PurchaseReceiptQualityGate{Outcome: PurchaseReceiptQualityGateRejected, TotalLines: 1, RejectedLineIDs: []int{1}, DisposedLineIDs: []int{1}}, want: ErrPurchaseReceiptQualityRejected},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			test.gate.PurchaseReceiptID = 1
			if err := test.gate.ValidateInboundCompletion(); !errors.Is(err, test.want) {
				t.Fatalf("inbound handoff validation=%v want=%v", err, test.want)
			}
		})
	}
}

func TestInventoryProcessCommandUsesInboundCompletionInsteadOfAggregateOutcome(t *testing.T) {
	for _, disposed := range []bool{false, true} {
		t.Run(map[bool]string{false: "unhandled rejection", true: "disposed rejection"}[disposed], func(t *testing.T) {
			gate := &PurchaseReceiptQualityGate{PurchaseReceiptID: 6001, Outcome: PurchaseReceiptQualityGateRejected, TotalLines: 2, PassedLines: 1, ReadyLineIDs: []int{1}, RejectedLineIDs: []int{2}}
			if disposed {
				gate.DisposedLineIDs = []int{2}
			}
			repo := &inventoryPostInboundProcessInventoryRepoStub{postedReceipt: &PurchaseReceipt{ID: 6001, Status: PurchaseReceiptStatusDraft}, qualityGate: gate}
			handler := &inventoryPostInboundProcessCommandHandler{uc: NewInventoryUsecase(repo)}
			result, err := handler.ExecuteProcessDomainCommand(t.Context(), &ProcessDomainCommandInput{
				ProcessInstance: &ProcessInstance{ID: 10, BusinessRefType: "purchase_receipt", BusinessRefID: 6001},
				CommandKey:      ProcessDomainCommandInventoryPostInbound,
				IdempotencyKey:  "inventory-post-completion",
				Payload:         map[string]any{"purchase_receipt_id": float64(6001)},
			}, 7)
			if disposed {
				if err != nil || result.Outcome != InventoryProcessCommandOutcomeInboundPosted || repo.postedReceiptID != 6001 {
					t.Fatalf("resolved rejection blocked inbound: result=%+v err=%v posted=%d", result, err, repo.postedReceiptID)
				}
			} else if !errors.Is(err, ErrPurchaseReceiptQualityRejected) || repo.postedReceiptID != 0 {
				t.Fatalf("unhandled rejection completed inbound: result=%+v err=%v posted=%d", result, err, repo.postedReceiptID)
			}
		})
	}
}
