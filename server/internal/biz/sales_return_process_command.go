package biz

import (
	"context"
	"strings"
)

const (
	SalesReturnProcessCommandOutcomeApproved = "sales_return.approved"
	SalesReturnProcessCommandOutcomeRejected = "sales_return.rejected"
	SalesReturnProcessCommandOutcomeReceived = "sales_return.received"
	salesReturnProcessBusinessRefType        = "sales_return"
	salesReturnProcessPayloadID              = "sales_return_id"
	processDecisionPayloadReason             = "reason"
)

type salesReturnProcessCommandHandler struct {
	uc         *OperationalFactUsecase
	commandKey string
}

type SalesReturnProcessCommandRepo interface {
	ApproveSalesReturnForProcessCommand(ctx context.Context, id int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int, reason string) (*SalesReturn, error)
	RejectSalesReturnForProcessCommand(ctx context.Context, id int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int, reason string) (*SalesReturn, error)
	ReceiveSalesReturnForProcessCommand(ctx context.Context, id int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*SalesReturn, error)
}

func RegisterSalesReturnProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, operationalFactUC *OperationalFactUsecase) error {
	if processRuntimeUC == nil || operationalFactUC == nil {
		return ErrBadParam
	}
	for _, commandKey := range []string{
		ProcessDomainCommandSalesReturnApprove,
		ProcessDomainCommandSalesReturnReject,
		ProcessDomainCommandSalesReturnReceive,
	} {
		if err := processRuntimeUC.RegisterDomainCommandHandler(commandKey, &salesReturnProcessCommandHandler{
			uc:         operationalFactUC,
			commandKey: commandKey,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (h *salesReturnProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil ||
		strings.TrimSpace(in.CommandKey) != h.commandKey || actorID <= 0 {
		return ErrBadParam
	}
	allowed := []string{salesReturnProcessPayloadID}
	if h.commandKey != ProcessDomainCommandSalesReturnReceive {
		allowed = append(allowed, processDecisionPayloadReason)
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, allowed...); err != nil {
		return err
	}
	id, ok, err := processCommandPositiveIntFromPayload(in.Payload, salesReturnProcessPayloadID)
	if err != nil || !ok || !ProcessInstanceHasBusinessRef(in.ProcessInstance, salesReturnProcessBusinessRefType, id) {
		return ErrBadParam
	}
	item, err := h.uc.GetSalesReturn(ctx, id)
	if err != nil {
		return err
	}
	if item == nil || item.ID != id {
		return ErrBadParam
	}
	reason := strings.TrimSpace(processCommandStringFromPayload(in.Payload, processDecisionPayloadReason))
	switch h.commandKey {
	case ProcessDomainCommandSalesReturnApprove:
		if item.Status != SalesReturnStatusDraft || item.CreatedBy == actorID ||
			reason == "" || len([]rune(reason)) > 255 {
			return ErrBadParam
		}
	case ProcessDomainCommandSalesReturnReject:
		if item.Status != SalesReturnStatusDraft || item.CreatedBy == actorID ||
			reason == "" || len([]rune(reason)) > 255 {
			return ErrBadParam
		}
	case ProcessDomainCommandSalesReturnReceive:
		if item.Status != SalesReturnStatusApproved {
			return ErrBadParam
		}
	default:
		return ErrBadParam
	}
	return nil
}

func (h *salesReturnProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	id, _, _ := processCommandPositiveIntFromPayload(in.Payload, salesReturnProcessPayloadID)
	result := &ProcessDomainCommandResult{
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: salesReturnProcessBusinessRefType, RefID: id},
	}
	switch h.commandKey {
	case ProcessDomainCommandSalesReturnApprove:
		result.Outcome = SalesReturnProcessCommandOutcomeApproved
	case ProcessDomainCommandSalesReturnReject:
		result.Outcome = SalesReturnProcessCommandOutcomeRejected
	case ProcessDomainCommandSalesReturnReceive:
		result.Outcome = SalesReturnProcessCommandOutcomeReceived
	default:
		return nil, ErrBadParam
	}
	repo, ok := h.uc.repo.(SalesReturnProcessCommandRepo)
	if !ok {
		return nil, ErrProcessDomainCommandHandlerNotFound
	}
	reason := strings.TrimSpace(processCommandStringFromPayload(in.Payload, processDecisionPayloadReason))
	var err error
	switch h.commandKey {
	case ProcessDomainCommandSalesReturnApprove:
		_, err = repo.ApproveSalesReturnForProcessCommand(ctx, id, in, result, actorID, reason)
	case ProcessDomainCommandSalesReturnReject:
		_, err = repo.RejectSalesReturnForProcessCommand(ctx, id, in, result, actorID, reason)
	case ProcessDomainCommandSalesReturnReceive:
		_, err = repo.ReceiveSalesReturnForProcessCommand(ctx, id, in, result, actorID)
	}
	if err != nil {
		return nil, err
	}
	return result, nil
}
