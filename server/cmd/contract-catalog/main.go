package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"

	"server/internal/biz"
	"server/internal/core/status"
)

func main() {
	payload := map[string]any{
		"processDefinitions": biz.CanonicalCustomerProcessContractDefinitions(),
		"branchTargets":      biz.CanonicalProcessBranchTargets(),
		"stateTransitions":   canonicalStateTransitions(),
	}
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		fmt.Fprintf(os.Stderr, "encode canonical contract catalog: %v\n", err)
		os.Exit(1)
	}
}

// Evaluate the production predicates; the observer must not maintain another
// transition table for these contracts. Self transitions are idempotent replay.
func canonicalStateTransitions() map[string][]string {
	result := map[string][]string{}
	add := func(key, from, to string, allowed bool) {
		if allowed && from != to {
			result[key] = append(result[key], from+"->"+to)
		}
	}
	for _, from := range biz.WorkflowTaskStates() {
		for _, to := range biz.WorkflowTaskStates() {
			add("workflow.task", from.Key, to.Key, biz.CanTransitionWorkflowTaskStatus(from.Key, to.Key))
		}
	}
	for key, actions := range map[string][]func(string) (status.PostingDocumentTransition, bool){
		"fact.purchase_receipt":            {status.PostPurchaseReceipt, status.CancelPurchaseReceipt},
		"fact.purchase_return":             {status.PostPurchaseReturn, status.CancelPurchaseReturn},
		"fact.purchase_receipt_adjustment": {status.PostPurchaseReceiptAdjustment, status.CancelPurchaseReceiptAdjustment},
	} {
		for _, from := range []string{status.PurchaseReceiptDraft, status.PurchaseReceiptPosted, status.PurchaseReceiptCancelled} {
			for _, action := range actions {
				transition, ok := action(from)
				add(key, from, transition.Target, ok && transition.Changed)
			}
		}
	}
	for _, from := range []string{status.QualityInspectionDraft, status.QualityInspectionSubmitted, status.QualityInspectionPassed, status.QualityInspectionRejected, status.QualityInspectionCancelled} {
		for _, action := range []func(string) (status.QualityInspectionTransition, bool){status.SubmitQualityInspection, status.CancelQualityInspection} {
			transition, ok := action(from)
			add("fact.quality_inspection", from, transition.Target, ok && transition.Changed)
		}
		for _, target := range []string{status.QualityInspectionPassed, status.QualityInspectionRejected} {
			transition, ok := status.DecideQualityInspection(from, target)
			add("fact.quality_inspection", from, transition.Target, ok && transition.Changed)
		}
	}
	for _, from := range []string{status.ShipmentDraft, status.ShipmentShipped, status.ShipmentCancelled} {
		for _, action := range []func(string) (status.ShipmentTransition, bool){status.ShipShipment, status.CancelShipment} {
			transition, ok := action(from)
			add("fact.shipment", from, transition.Target, ok && transition.Changed)
		}
	}
	for key := range result {
		sort.Strings(result[key])
	}
	return result
}
