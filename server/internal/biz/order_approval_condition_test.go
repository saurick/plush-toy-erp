package biz

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/shopspring/decimal"
)

func TestOrderApprovalConditionNormalization(t *testing.T) {
	for _, tc := range []struct {
		name, key string
		rule      ApprovalCondition
		mode      string
		invalid   bool
	}{
		{"default", ApprovalSettingSalesOrder, ApprovalCondition{}, "all", false},
		{"clear threshold", ApprovalSettingSalesOrder, ApprovalCondition{Mode: "all", Amount: "999", Currency: "USD"}, "all", false},
		{"zero", ApprovalSettingPurchaseOrder, ApprovalCondition{Mode: "amount", Amount: "0.000000", Currency: "CNY"}, "all", false},
		{"decimal", ApprovalSettingSalesOrder, ApprovalCondition{Mode: "amount", Amount: "10000.010000", Currency: "cny"}, "amount", false},
		{"negative", ApprovalSettingSalesOrder, ApprovalCondition{Mode: "amount", Amount: "-1", Currency: "CNY"}, "", true},
		{"exponent", ApprovalSettingSalesOrder, ApprovalCondition{Mode: "amount", Amount: "1e9", Currency: "CNY"}, "", true},
		{"precision", ApprovalSettingSalesOrder, ApprovalCondition{Mode: "amount", Amount: "1.0000001", Currency: "CNY"}, "", true},
		{"overflow", ApprovalSettingSalesOrder, ApprovalCondition{Mode: "amount", Amount: "100000000000000", Currency: "CNY"}, "", true},
		{"missing currency", ApprovalSettingPurchaseOrder, ApprovalCondition{Mode: "amount", Amount: "1"}, "", true},
		{"unknown currency", ApprovalSettingPurchaseOrder, ApprovalCondition{Mode: "amount", Amount: "1", Currency: "XYZ"}, "", true},
		{"shipment", ApprovalSettingShipmentFinance, ApprovalCondition{Mode: "amount", Amount: "1", Currency: "CNY"}, "", true},
		{"unknown mode", ApprovalSettingSalesOrder, ApprovalCondition{Mode: "expression"}, "", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizeApprovalCondition(tc.key, tc.rule)
			if (err != nil) != tc.invalid {
				t.Fatalf("rule=%+v err=%v", got, err)
			}
			if !tc.invalid && got.Mode != tc.mode {
				t.Fatalf("mode=%q", got.Mode)
			}
			if !tc.invalid && got.Mode == "all" && (got.Amount != "" || got.Currency != "") {
				t.Fatalf("stale threshold: %+v", got)
			}
		})
	}
}

func TestOrderApprovalDecisionThresholdAndDurableBranch(t *testing.T) {
	for _, key := range []string{ApprovalSettingSalesOrder, ApprovalSettingPurchaseOrder} {
		for _, tc := range []struct {
			name, amount, currency, mode, reason string
			required                             bool
		}{
			{"below", "9999.999999", "CNY", "amount", "below_threshold", false},
			{"equal", "10000", "CNY", "amount", "threshold_reached", true},
			{"above", "10000.000001", "CNY", "amount", "threshold_reached", true},
			{"zero amount", "0", "CNY", "amount", "below_threshold", false},
			{"missing", "", "CNY", "amount", "amount_unavailable", true},
			{"negative source", "-1", "CNY", "amount", "amount_unavailable", true},
			{"large total", "100000000000000", "CNY", "amount", "threshold_reached", true},
			{"other currency", "1", "USD", "amount", "currency_mismatch", true},
			{"all", "1", "CNY", "all", "all_orders", true},
		} {
			t.Run(key+"/"+tc.name, func(t *testing.T) {
				commandKey := ProcessDomainCommandSalesOrderSubmit
				if key == ApprovalSettingPurchaseOrder {
					commandKey = ProcessDomainCommandPurchaseOrderSubmit
				}
				rule, _ := NormalizeApprovalCondition(key, ApprovalCondition{Mode: tc.mode, Amount: "10000", Currency: "CNY"})
				fingerprint := strings.Repeat("a", 64)
				node := &ProcessNodeInstance{ID: 2, ProcessInstanceID: 1, Version: 1, PolicySnapshot: map[string]any{"command_key": commandKey, "approval_condition": rule.Snapshot()}, DomainCommandFingerprint: &fingerprint}
				result := &ProcessDomainCommandResult{EffectState: ProcessDomainCommandEffectStateApplied}
				var amount *decimal.Decimal
				if tc.amount != "" {
					v := decimal.RequireFromString(tc.amount)
					amount = &v
				}
				if err := ApplyOrderApprovalDecision(&ProcessDomainCommandInput{CommandKey: commandKey, Node: node}, result, tc.currency, amount, 3); err != nil {
					t.Fatal(err)
				}
				if result.ApprovalDecision.Required != tc.required || result.ApprovalDecision.Reason != tc.reason {
					t.Fatalf("decision=%+v", result.ApprovalDecision)
				}
				record, err := processDomainCommandResultRecord(node, commandKey, fingerprint, result)
				if err != nil {
					t.Fatal(err)
				}
				// Round-trip through JSON, as the durable database result does.
				payload, _ := json.Marshal(record.Result)
				if err := json.Unmarshal(payload, &node.DomainCommandResult); err != nil {
					t.Fatal(err)
				}
				node.DomainCommandResultState = &record.ResultState
				node.DomainCommandResultHash = &record.ResultHash
				node.DomainCommandEffectState = &record.EffectState
				handler := orderApprovalRequirementBranchHandler{key, "manual", "effective"}
				branch, err := handler.ResolveProcessBranch(context.Background(), &ProcessBranchPolicyInput{CompletedNode: node}, 7)
				if err != nil {
					t.Fatal(err)
				}
				want := "manual"
				if !tc.required {
					want = "effective"
				}
				if branch.NextNodeKey != want {
					t.Fatalf("branch=%+v", branch)
				}
				node.DomainCommandResult["approval_decision"].(map[string]any)["required"] = !tc.required
				if _, err := handler.ResolveProcessBranch(context.Background(), &ProcessBranchPolicyInput{CompletedNode: node}, 7); err == nil {
					t.Fatal("tampered decision accepted")
				}
			})
		}
	}
}

func TestApprovalSettingsConditionPreviewAndFrozenContract(t *testing.T) {
	uc, _, _, active := activeApprovalSettingsFixture(t)
	in := validApprovalSettingsRevision(active)
	in.Items[0].Condition = ApprovalCondition{Mode: "amount", Amount: "10000.000000", Currency: "CNY"}
	preview, err := uc.PreviewApprovalSettingsRevision(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	if preview.Items[0].Condition.Amount != "10000" {
		t.Fatalf("condition lost: %+v", preview.Items[0])
	}
	contract, err := applyApprovalSettingsToCustomerProcessContract(preview.PublishInput.CompiledSnapshot, newSalesOrderAcceptanceContract(CustomerProcessVariantSalesApprovalPMC, false))
	if err != nil {
		t.Fatal(err)
	}
	if contract.Nodes[0].PolicySnapshot["branch_policy_key"] != ProcessBranchPolicySalesOrderRequirement {
		t.Fatalf("submit routing=%+v", contract.Nodes[0])
	}
	in.Items[0].Condition = ApprovalCondition{Mode: "all", Amount: "20000", Currency: "USD"}
	second, err := uc.PreviewApprovalSettingsRevision(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	if second.Items[0].Condition.Mode != "all" || second.Items[0].Condition.Amount != "" {
		t.Fatalf("not cleared: %+v", second.Items[0])
	}
	if contract.Nodes[0].PolicySnapshot["approval_condition"].(map[string]any)["amount"] != "10000" {
		t.Fatal("frozen rule changed")
	}
	// The generic publishing path must reject invalid conditions as well.
	raw := second.PublishInput.CompiledSnapshot["approval_settings"].(map[string]any)["items"].([]any)[0].(map[string]any)
	raw["condition"] = map[string]any{"mode": "amount", "amount": "-1", "currency": "CNY"}
	if err := validateApprovalSettingsPublishInput(*second.PublishInput); err == nil {
		t.Fatal("invalid generic publish accepted")
	}
}
