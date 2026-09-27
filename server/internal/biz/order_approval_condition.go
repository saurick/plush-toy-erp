package biz

import (
	"context"
	"encoding/json"
	"reflect"
	"regexp"
	"strings"

	"github.com/shopspring/decimal"
)

const (
	ApprovalConditionAll                        = "all"
	ApprovalConditionAmount                     = "amount"
	ProcessBranchPolicySalesOrderRequirement    = "sales_order.approval_requirement"
	ProcessBranchPolicyPurchaseOrderRequirement = "purchase_order.approval_requirement"
	SalesOrderOutcomeApprovalExempted           = "sales_order.submitted_without_approval"
	PurchaseOrderOutcomeApprovalExempted        = "purchase_order.submitted_without_approval"
)

// ApprovalCondition belongs to the immutable customer revision. Amounts are
// decimal strings in the selected currency; no implicit currency conversion.
type ApprovalCondition struct {
	Mode     string `json:"mode"`
	Amount   string `json:"amount"`
	Currency string `json:"currency"`
}

var approvalAmountPattern = regexp.MustCompile(`^(0|[1-9][0-9]{0,13})(\.[0-9]{1,6})?$`)

func NormalizeApprovalCondition(approvalKey string, rule ApprovalCondition) (ApprovalCondition, error) {
	rule.Mode = strings.TrimSpace(rule.Mode)
	rule.Amount = strings.TrimSpace(rule.Amount)
	rule.Currency = strings.TrimSpace(rule.Currency)
	if rule.Mode == "" {
		rule.Mode = ApprovalConditionAll
	}
	if rule.Mode == ApprovalConditionAll {
		// Switching back to all explicitly clears obsolete threshold fields.
		return ApprovalCondition{Mode: ApprovalConditionAll}, nil
	}
	if rule.Mode != ApprovalConditionAmount || (approvalKey != ApprovalSettingSalesOrder && approvalKey != ApprovalSettingPurchaseOrder) || !approvalAmountPattern.MatchString(rule.Amount) {
		return ApprovalCondition{}, ErrBadParam
	}
	amount, err := decimal.NewFromString(rule.Amount)
	if err != nil {
		return ApprovalCondition{}, ErrBadParam
	}
	if amount.IsZero() {
		return ApprovalCondition{Mode: ApprovalConditionAll}, nil
	}
	currency, valid := normalizeSourceOrderCurrency(rule.Currency, false)
	if !valid {
		return ApprovalCondition{}, ErrBadParam
	}
	return ApprovalCondition{Mode: ApprovalConditionAmount, Amount: amount.String(), Currency: currency}, nil
}

func ApprovalConditionFromMap(raw any) (ApprovalCondition, error) {
	if raw == nil {
		return ApprovalCondition{Mode: ApprovalConditionAll}, nil
	}
	values, ok := raw.(map[string]any)
	if !ok {
		return ApprovalCondition{}, ErrBadParam
	}
	for key, value := range values {
		if key != "mode" && key != "amount" && key != "currency" {
			return ApprovalCondition{}, ErrBadParam
		}
		if _, ok := value.(string); !ok {
			return ApprovalCondition{}, ErrBadParam
		}
	}
	return ApprovalCondition{Mode: getStringFromAnyMap(values, "mode"), Amount: getStringFromAnyMap(values, "amount"), Currency: getStringFromAnyMap(values, "currency")}, nil
}

func (rule ApprovalCondition) Snapshot() map[string]any {
	return map[string]any{"mode": rule.Mode, "amount": rule.Amount, "currency": rule.Currency}
}

func approvalConditionsFromSnapshot(snapshot map[string]any) (map[string]ApprovalCondition, error) {
	settings, _ := snapshot["approval_settings"].(map[string]any)
	out := map[string]ApprovalCondition{}
	for _, raw := range anyListFromMap(settings, "items") {
		item, ok := raw.(map[string]any)
		if !ok {
			return nil, ErrBadParam
		}
		if _, configured := item["condition"]; !configured {
			continue
		}
		key := getStringFromAnyMap(item, "approval_key")
		rule, err := ApprovalConditionFromMap(item["condition"])
		if err != nil {
			return nil, err
		}
		rule, err = NormalizeApprovalCondition(key, rule)
		if err != nil {
			return nil, err
		}
		out[key] = rule
	}
	return out, nil
}

// OrderApprovalDecision is persisted with the source submission transaction and
// covered by its durable result hash. The submitter is not a human approver.
type OrderApprovalDecision struct {
	ApprovalKey   string `json:"approval_key"`
	SourceVersion int    `json:"source_version"`
	Currency      string `json:"currency"`
	Amount        string `json:"amount"`
	Required      bool   `json:"required"`
	Reason        string `json:"reason"`
}

func (decision *OrderApprovalDecision) snapshot() map[string]any {
	return map[string]any{
		"approval_key": decision.ApprovalKey, "source_version": decision.SourceVersion,
		"currency": decision.Currency, "amount": decision.Amount,
		"required": decision.Required, "reason": decision.Reason,
	}
}

func decideOrderApproval(key string, rule ApprovalCondition, currency string, amount *decimal.Decimal, version int) *OrderApprovalDecision {
	decision := &OrderApprovalDecision{ApprovalKey: key, SourceVersion: version, Currency: currency, Required: true, Reason: "all_orders"}
	if amount != nil && !amount.IsNegative() {
		decision.Amount = amount.String()
	}
	if rule.Mode != ApprovalConditionAmount {
		return decision
	}
	if amount == nil || amount.IsNegative() {
		decision.Reason = "amount_unavailable"
		return decision
	}
	if currency != rule.Currency {
		decision.Reason = "currency_mismatch"
		return decision
	}
	threshold, _ := decimal.NewFromString(rule.Amount)
	decision.Required = amount.GreaterThanOrEqual(threshold)
	decision.Reason = "threshold_reached"
	if !decision.Required {
		decision.Reason = "below_threshold"
	}
	return decision
}

func orderApprovalCommandKeys(commandKey string) (key, submitted, exempted string) {
	switch commandKey {
	case ProcessDomainCommandSalesOrderSubmit:
		return ApprovalSettingSalesOrder, SalesOrderProcessCommandOutcomeSubmitted, SalesOrderOutcomeApprovalExempted
	case ProcessDomainCommandPurchaseOrderSubmit:
		return ApprovalSettingPurchaseOrder, PurchaseOrderProcessCommandOutcomeSubmitted, PurchaseOrderOutcomeApprovalExempted
	default:
		return "", "", ""
	}
}

// ApplyOrderApprovalDecision must be called by the owning source repository
// after locking the order, using the same transaction's amount and version.
func ApplyOrderApprovalDecision(command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, currency string, amount *decimal.Decimal, version int) error {
	if command == nil || command.Node == nil || result == nil {
		return ErrBadParam
	}
	raw, configured := command.Node.PolicySnapshot["approval_condition"]
	if !configured {
		return nil
	}
	key, submitted, exempted := orderApprovalCommandKeys(command.CommandKey)
	if key == "" || version <= 0 {
		return ErrBadParam
	}
	rule, err := ApprovalConditionFromMap(raw)
	if err != nil {
		return err
	}
	rule, err = NormalizeApprovalCondition(key, rule)
	if err != nil {
		return err
	}
	result.ApprovalDecision = decideOrderApproval(key, rule, currency, amount, version)
	result.Outcome = submitted
	if !result.ApprovalDecision.Required {
		result.Outcome = exempted
	}
	return nil
}

func validateOrderApprovalDecision(node *ProcessNodeInstance, commandKey string, result *ProcessDomainCommandResult) error {
	decision := result.ApprovalDecision
	if decision == nil {
		return nil
	}
	key, submitted, exempted := orderApprovalCommandKeys(commandKey)
	if key == "" || decision.ApprovalKey != key || decision.SourceVersion <= 0 {
		return ErrBadParam
	}
	raw, exists := node.PolicySnapshot["approval_condition"]
	if !exists {
		return ErrBadParam
	}
	rule, err := ApprovalConditionFromMap(raw)
	if err != nil {
		return err
	}
	rule, err = NormalizeApprovalCondition(key, rule)
	if err != nil {
		return err
	}
	var amount *decimal.Decimal
	if decision.Amount != "" {
		parsed, err := decimal.NewFromString(decision.Amount)
		if err != nil || parsed.IsNegative() || parsed.String() != decision.Amount {
			return ErrBadParam
		}
		amount = &parsed
	}
	expected := decideOrderApproval(key, rule, decision.Currency, amount, decision.SourceVersion)
	if !reflect.DeepEqual(expected, decision) {
		return ErrBadParam
	}
	outcome := submitted
	if !expected.Required {
		outcome = exempted
	}
	if result.Outcome != outcome {
		return ErrBadParam
	}
	return nil
}

func orderApprovalDecisionFromResult(raw any) (*OrderApprovalDecision, error) {
	if raw == nil {
		return nil, nil
	}
	payload, err := json.Marshal(raw)
	if err != nil {
		return nil, ErrBadParam
	}
	var decision OrderApprovalDecision
	decoder := json.NewDecoder(strings.NewReader(string(payload)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&decision); err != nil {
		return nil, ErrBadParam
	}
	return &decision, nil
}

type orderApprovalRequirementBranchHandler struct {
	approvalKey   string
	approvalNode  string
	effectiveNode string
}

func (h orderApprovalRequirementBranchHandler) ResolveProcessBranch(_ context.Context, in *ProcessBranchPolicyInput, _ int) (*ProcessBranchPolicyResult, error) {
	if in == nil || in.CompletedNode == nil {
		return nil, ErrBadParam
	}
	result, err := processDomainCommandResultFromNode(in.CompletedNode)
	if err != nil {
		return nil, err
	}
	if result.ApprovalDecision == nil || result.ApprovalDecision.ApprovalKey != h.approvalKey {
		return nil, ErrBadParam
	}
	next := h.approvalNode
	if !result.ApprovalDecision.Required {
		next = h.effectiveNode
	}
	return &ProcessBranchPolicyResult{NextNodeKey: next}, nil
}
