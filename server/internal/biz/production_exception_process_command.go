package biz

import (
	"context"
	"strings"
)

const (
	ProductionExceptionProcessCommandOutcomeApprovedOverIssue = "production_exception.approved_over_issue"
	ProductionExceptionProcessCommandOutcomeApprovedWIP       = "production_exception.approved_wip"
	ProductionExceptionProcessCommandOutcomeRejected          = "production_exception.rejected"
	ProductionExceptionProcessCommandOutcomeExecuted          = "production_exception.executed"
	productionExceptionProcessBusinessRefType                 = "production_exception_decision"
	productionExceptionProcessPayloadID                       = "production_exception_id"
	productionExceptionProcessPayloadApprovedQuantity         = "approved_quantity"
)

type productionExceptionProcessCommandHandler struct {
	uc         *OperationalFactUsecase
	commandKey string
}

type ProductionExceptionProcessCommandRepo interface {
	ApproveProductionExceptionForProcessCommand(ctx context.Context, in *ProductionExceptionMutation, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult) (*ProductionExceptionDecision, error)
	RejectProductionExceptionForProcessCommand(ctx context.Context, in *ProductionExceptionMutation, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult) (*ProductionExceptionDecision, error)
	ExecuteProductionExceptionForProcessCommand(ctx context.Context, in *ProductionExceptionMutation, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult) (*ProductionExceptionDecision, error)
}

func RegisterProductionExceptionProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, operationalFactUC *OperationalFactUsecase) error {
	if processRuntimeUC == nil || operationalFactUC == nil {
		return ErrBadParam
	}
	for _, commandKey := range []string{
		ProcessDomainCommandProductionExceptionApprove,
		ProcessDomainCommandProductionExceptionReject,
		ProcessDomainCommandProductionExceptionExecute,
	} {
		if err := processRuntimeUC.RegisterDomainCommandHandler(commandKey, &productionExceptionProcessCommandHandler{
			uc:         operationalFactUC,
			commandKey: commandKey,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (h *productionExceptionProcessCommandHandler) NormalizeProcessDomainCommandPayload(payload map[string]any) (map[string]any, error) {
	if h == nil || h.commandKey != ProcessDomainCommandProductionExceptionApprove {
		return payload, nil
	}
	if err := validateProcessDomainCommandPayloadKeys(
		payload,
		productionExceptionProcessPayloadID,
		processDecisionPayloadReason,
		productionExceptionProcessPayloadApprovedQuantity,
	); err != nil {
		return nil, err
	}
	id, ok, err := processCommandPositiveIntFromPayload(payload, productionExceptionProcessPayloadID)
	if err != nil || !ok {
		return nil, ErrBadParam
	}
	reason := strings.TrimSpace(processCommandStringFromPayload(payload, processDecisionPayloadReason))
	if reason == "" || len([]rune(reason)) > 255 {
		return nil, ErrBadParam
	}
	out := map[string]any{
		productionExceptionProcessPayloadID: id,
		processDecisionPayloadReason:        reason,
	}
	if raw, exists := payload[productionExceptionProcessPayloadApprovedQuantity]; exists && raw != nil {
		text, ok := raw.(string)
		if !ok {
			return nil, ErrBadParam
		}
		quantity, ok := parsePositiveNumeric20Scale6Contract(text)
		if !ok {
			return nil, ErrBadParam
		}
		out[productionExceptionProcessPayloadApprovedQuantity] = quantity.String()
	}
	return out, nil
}

func (h *productionExceptionProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil ||
		strings.TrimSpace(in.CommandKey) != h.commandKey || actorID <= 0 {
		return ErrBadParam
	}
	allowed := []string{productionExceptionProcessPayloadID, processDecisionPayloadReason}
	if h.commandKey == ProcessDomainCommandProductionExceptionApprove {
		allowed = append(allowed, productionExceptionProcessPayloadApprovedQuantity)
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, allowed...); err != nil {
		return err
	}
	id, ok, err := processCommandPositiveIntFromPayload(in.Payload, productionExceptionProcessPayloadID)
	if err != nil || !ok || !ProcessInstanceHasBusinessRef(in.ProcessInstance, productionExceptionProcessBusinessRefType, id) {
		return ErrBadParam
	}
	item, err := h.uc.GetProductionException(ctx, id)
	if err != nil {
		return err
	}
	if item == nil || item.ID != id {
		return ErrBadParam
	}
	reason := strings.TrimSpace(processCommandStringFromPayload(in.Payload, processDecisionPayloadReason))
	if reason == "" || len([]rune(reason)) > 255 {
		return ErrBadParam
	}
	switch h.commandKey {
	case ProcessDomainCommandProductionExceptionApprove:
		if item.Status != ProductionExceptionSubmitted || item.RequestedBy == actorID {
			return ErrBadParam
		}
		approved := item.RequestedQuantity
		if raw, exists := in.Payload[productionExceptionProcessPayloadApprovedQuantity]; exists && raw != nil {
			text, ok := raw.(string)
			if !ok {
				return ErrBadParam
			}
			var valid bool
			approved, valid = parsePositiveNumeric20Scale6Contract(text)
			if !valid {
				return ErrBadParam
			}
		}
		if !approved.IsPositive() || approved.GreaterThan(item.RequestedQuantity) ||
			(item.DecisionType != ProductionExceptionOverIssue && !approved.Equal(item.RequestedQuantity)) {
			return ErrProductionExceptionApprovalAmount
		}
	case ProcessDomainCommandProductionExceptionReject:
		if item.Status != ProductionExceptionSubmitted || item.RequestedBy == actorID {
			return ErrBadParam
		}
	case ProcessDomainCommandProductionExceptionExecute:
		if item.Status != ProductionExceptionApproved ||
			item.ExecutionStatus != ProductionExceptionExecutionPending ||
			item.DecisionType == ProductionExceptionOverIssue {
			return ErrBadParam
		}
	default:
		return ErrBadParam
	}
	return nil
}

func (h *productionExceptionProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	id, _, _ := processCommandPositiveIntFromPayload(in.Payload, productionExceptionProcessPayloadID)
	item, err := h.uc.GetProductionException(ctx, id)
	if err != nil {
		return nil, err
	}
	result := &ProcessDomainCommandResult{
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: productionExceptionProcessBusinessRefType, RefID: id},
	}
	switch h.commandKey {
	case ProcessDomainCommandProductionExceptionApprove:
		if item.DecisionType == ProductionExceptionOverIssue {
			result.Outcome = ProductionExceptionProcessCommandOutcomeApprovedOverIssue
		} else {
			result.Outcome = ProductionExceptionProcessCommandOutcomeApprovedWIP
		}
	case ProcessDomainCommandProductionExceptionReject:
		result.Outcome = ProductionExceptionProcessCommandOutcomeRejected
	case ProcessDomainCommandProductionExceptionExecute:
		result.Outcome = ProductionExceptionProcessCommandOutcomeExecuted
	default:
		return nil, ErrBadParam
	}
	repo, ok := h.uc.repo.(ProductionExceptionProcessCommandRepo)
	if !ok {
		return nil, ErrProcessDomainCommandHandlerNotFound
	}
	mutation := &ProductionExceptionMutation{
		ID:      id,
		ActorID: actorID,
		Reason:  strings.TrimSpace(processCommandStringFromPayload(in.Payload, processDecisionPayloadReason)),
	}
	if h.commandKey == ProcessDomainCommandProductionExceptionApprove {
		if raw, exists := in.Payload[productionExceptionProcessPayloadApprovedQuantity]; exists && raw != nil {
			text, ok := raw.(string)
			if !ok {
				return nil, ErrBadParam
			}
			quantity, valid := parsePositiveNumeric20Scale6Contract(text)
			if !valid {
				return nil, ErrBadParam
			}
			mutation.ApprovedQuantity = &quantity
		}
	}
	switch h.commandKey {
	case ProcessDomainCommandProductionExceptionApprove:
		_, err = repo.ApproveProductionExceptionForProcessCommand(ctx, mutation, in, result)
	case ProcessDomainCommandProductionExceptionReject:
		_, err = repo.RejectProductionExceptionForProcessCommand(ctx, mutation, in, result)
	case ProcessDomainCommandProductionExceptionExecute:
		_, err = repo.ExecuteProductionExceptionForProcessCommand(ctx, mutation, in, result)
	}
	if err != nil {
		return nil, err
	}
	return result, nil
}
