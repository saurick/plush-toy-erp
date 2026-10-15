package biz

import (
	"context"
	"sort"
	"strings"

	"github.com/shopspring/decimal"
)

const (
	FinancePaymentProcessCommandOutcomeApproved = "finance_payment.approved"
	FinancePaymentProcessCommandOutcomeRejected = "finance_payment.rejected"
	FinancePaymentProcessCommandOutcomePosted   = "finance_payment.posted"
	financePaymentProcessBusinessRefType        = "finance_payment"
	financePaymentProcessPayloadID              = "finance_payment_id"
	financePaymentProcessPayloadAllocations     = "allocations"
)

type financePaymentProcessCommandHandler struct {
	uc         *OperationalFactUsecase
	commandKey string
}

type FinancePaymentProcessCommandRepo interface {
	ApproveFinancePaymentForProcessCommand(ctx context.Context, id int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int, reason string) (*FinancePayment, error)
	RejectFinancePaymentForProcessCommand(ctx context.Context, id int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int, reason string) (*FinancePayment, error)
	PostFinancePaymentForProcessCommand(ctx context.Context, in *FinancePaymentPost, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*FinancePayment, error)
}

func RegisterFinancePaymentProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, operationalFactUC *OperationalFactUsecase) error {
	if processRuntimeUC == nil || operationalFactUC == nil {
		return ErrBadParam
	}
	for _, commandKey := range []string{
		ProcessDomainCommandFinancePaymentApprove,
		ProcessDomainCommandFinancePaymentReject,
		ProcessDomainCommandFinancePaymentPost,
	} {
		if err := processRuntimeUC.RegisterDomainCommandHandler(commandKey, &financePaymentProcessCommandHandler{
			uc:         operationalFactUC,
			commandKey: commandKey,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (h *financePaymentProcessCommandHandler) NormalizeProcessDomainCommandPayload(payload map[string]any) (map[string]any, error) {
	if h == nil || h.commandKey != ProcessDomainCommandFinancePaymentPost {
		return payload, nil
	}
	if err := validateProcessDomainCommandPayloadKeys(payload, financePaymentProcessPayloadID, financePaymentProcessPayloadAllocations); err != nil {
		return nil, err
	}
	id, ok, err := processCommandPositiveIntFromPayload(payload, financePaymentProcessPayloadID)
	if err != nil || !ok {
		return nil, ErrBadParam
	}
	allocations, err := financePaymentAllocationsFromProcessPayload(payload)
	if err != nil {
		return nil, err
	}
	out := make([]any, 0, len(allocations))
	for _, allocation := range allocations {
		out = append(out, map[string]any{
			"finance_fact_id": allocation.FinanceFactID,
			"amount":          allocation.Amount.String(),
		})
	}
	return map[string]any{
		financePaymentProcessPayloadID:          id,
		financePaymentProcessPayloadAllocations: out,
	}, nil
}

func (h *financePaymentProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil ||
		strings.TrimSpace(in.CommandKey) != h.commandKey || actorID <= 0 {
		return ErrBadParam
	}
	allowed := []string{financePaymentProcessPayloadID}
	if h.commandKey == ProcessDomainCommandFinancePaymentPost {
		allowed = append(allowed, financePaymentProcessPayloadAllocations)
	} else {
		allowed = append(allowed, processDecisionPayloadReason)
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, allowed...); err != nil {
		return err
	}
	id, ok, err := processCommandPositiveIntFromPayload(in.Payload, financePaymentProcessPayloadID)
	if err != nil || !ok || !ProcessInstanceHasBusinessRef(in.ProcessInstance, financePaymentProcessBusinessRefType, id) {
		return ErrBadParam
	}
	item, err := h.uc.GetFinancePayment(ctx, id)
	if err != nil {
		return err
	}
	if item == nil || item.ID != id {
		return ErrBadParam
	}
	reason := strings.TrimSpace(processCommandStringFromPayload(in.Payload, processDecisionPayloadReason))
	switch h.commandKey {
	case ProcessDomainCommandFinancePaymentApprove, ProcessDomainCommandFinancePaymentReject:
		if item.Status != FinancePaymentStatusDraft || item.CreatedBy == actorID ||
			reason == "" || len([]rune(reason)) > 255 {
			return ErrBadParam
		}
	case ProcessDomainCommandFinancePaymentPost:
		if item.Status != FinancePaymentStatusApproved {
			return ErrBadParam
		}
		allocations, err := financePaymentAllocationsFromProcessPayload(in.Payload)
		if err != nil {
			return err
		}
		total := decimal.Zero
		for _, allocation := range allocations {
			total = total.Add(allocation.Amount)
		}
		if !total.Equal(item.Amount) {
			return ErrBadParam
		}
	default:
		return ErrBadParam
	}
	return nil
}

func (h *financePaymentProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	id, _, _ := processCommandPositiveIntFromPayload(in.Payload, financePaymentProcessPayloadID)
	result := &ProcessDomainCommandResult{
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: financePaymentProcessBusinessRefType, RefID: id},
	}
	switch h.commandKey {
	case ProcessDomainCommandFinancePaymentApprove:
		result.Outcome = FinancePaymentProcessCommandOutcomeApproved
	case ProcessDomainCommandFinancePaymentReject:
		result.Outcome = FinancePaymentProcessCommandOutcomeRejected
	case ProcessDomainCommandFinancePaymentPost:
		result.Outcome = FinancePaymentProcessCommandOutcomePosted
	default:
		return nil, ErrBadParam
	}
	repo, ok := h.uc.repo.(FinancePaymentProcessCommandRepo)
	if !ok {
		return nil, ErrProcessDomainCommandHandlerNotFound
	}
	reason := strings.TrimSpace(processCommandStringFromPayload(in.Payload, processDecisionPayloadReason))
	var err error
	switch h.commandKey {
	case ProcessDomainCommandFinancePaymentApprove:
		_, err = repo.ApproveFinancePaymentForProcessCommand(ctx, id, in, result, actorID, reason)
	case ProcessDomainCommandFinancePaymentReject:
		_, err = repo.RejectFinancePaymentForProcessCommand(ctx, id, in, result, actorID, reason)
	case ProcessDomainCommandFinancePaymentPost:
		allocations, parseErr := financePaymentAllocationsFromProcessPayload(in.Payload)
		if parseErr != nil {
			return nil, parseErr
		}
		_, err = repo.PostFinancePaymentForProcessCommand(ctx, &FinancePaymentPost{
			ID:          id,
			Allocations: allocations,
		}, in, result, actorID)
	}
	if err != nil {
		return nil, err
	}
	return result, nil
}

func financePaymentAllocationsFromProcessPayload(payload map[string]any) ([]FinancePaymentAllocationInput, error) {
	raw, ok := payload[financePaymentProcessPayloadAllocations].([]any)
	if !ok || len(raw) == 0 {
		return nil, ErrBadParam
	}
	out := make([]FinancePaymentAllocationInput, 0, len(raw))
	seen := map[int]struct{}{}
	for _, value := range raw {
		item, ok := value.(map[string]any)
		if !ok || len(item) != 2 {
			return nil, ErrBadParam
		}
		id, hasID, err := processCommandPositiveIntFromPayload(item, "finance_fact_id")
		if err != nil || !hasID {
			return nil, ErrBadParam
		}
		amountText, ok := item["amount"].(string)
		amount, valid := parsePositiveNumeric20Scale6Contract(amountText)
		if !ok || !valid {
			return nil, ErrBadParam
		}
		if _, exists := seen[id]; exists {
			return nil, ErrBadParam
		}
		seen[id] = struct{}{}
		out = append(out, FinancePaymentAllocationInput{FinanceFactID: id, Amount: amount})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].FinanceFactID < out[j].FinanceFactID })
	return out, nil
}
