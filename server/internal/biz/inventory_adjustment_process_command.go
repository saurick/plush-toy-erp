package biz

import (
	"context"
	"strings"
)

const (
	InventoryAdjustmentProcessCommandOutcomeSubmitted = "inventory_adjustment.submitted"
	InventoryAdjustmentProcessCommandOutcomeApproved  = "inventory_adjustment.approved"
	InventoryAdjustmentProcessCommandOutcomeRejected  = "inventory_adjustment.rejected"
	InventoryAdjustmentProcessCommandOutcomePosted    = "inventory_adjustment.posted"
	inventoryAdjustmentProcessBusinessRefType         = "inventory_operation"
	inventoryAdjustmentProcessPayloadID               = "inventory_operation_id"
)

type inventoryAdjustmentProcessCommandHandler struct {
	uc         *InventoryUsecase
	commandKey string
}

type InventoryAdjustmentProcessCommandRepo interface {
	SubmitInventoryOperationForProcessCommand(ctx context.Context, id int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*InventoryOperation, error)
	ApproveInventoryOperationForProcessCommand(ctx context.Context, id int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int, reason string) (*InventoryOperation, error)
	RejectInventoryOperationForProcessCommand(ctx context.Context, id int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int, reason string) (*InventoryOperation, error)
	PostInventoryOperationForProcessCommand(ctx context.Context, id int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*InventoryOperation, error)
}

func RegisterInventoryAdjustmentProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, inventoryUC *InventoryUsecase) error {
	if processRuntimeUC == nil || inventoryUC == nil {
		return ErrBadParam
	}
	for _, commandKey := range []string{
		ProcessDomainCommandInventoryAdjustmentSubmit,
		ProcessDomainCommandInventoryAdjustmentApprove,
		ProcessDomainCommandInventoryAdjustmentReject,
		ProcessDomainCommandInventoryAdjustmentPost,
	} {
		if err := processRuntimeUC.RegisterDomainCommandHandler(commandKey, &inventoryAdjustmentProcessCommandHandler{
			uc:         inventoryUC,
			commandKey: commandKey,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (h *inventoryAdjustmentProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil ||
		strings.TrimSpace(in.CommandKey) != h.commandKey || actorID <= 0 {
		return ErrBadParam
	}
	allowed := []string{inventoryAdjustmentProcessPayloadID}
	if h.commandKey == ProcessDomainCommandInventoryAdjustmentApprove ||
		h.commandKey == ProcessDomainCommandInventoryAdjustmentReject {
		allowed = append(allowed, processDecisionPayloadReason)
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, allowed...); err != nil {
		return err
	}
	id, ok, err := processCommandPositiveIntFromPayload(in.Payload, inventoryAdjustmentProcessPayloadID)
	if err != nil || !ok || !ProcessInstanceHasBusinessRef(in.ProcessInstance, inventoryAdjustmentProcessBusinessRefType, id) {
		return ErrBadParam
	}
	item, err := h.uc.GetInventoryOperation(ctx, id)
	if err != nil {
		return err
	}
	if item == nil || item.ID != id || item.OperationType != InventoryOperationManualAdjustment {
		return ErrBadParam
	}
	reason := strings.TrimSpace(processCommandStringFromPayload(in.Payload, processDecisionPayloadReason))
	switch h.commandKey {
	case ProcessDomainCommandInventoryAdjustmentSubmit:
		if item.Status != InventoryOperationStatusDraft || item.CreatedBy != actorID {
			return ErrBadParam
		}
	case ProcessDomainCommandInventoryAdjustmentApprove, ProcessDomainCommandInventoryAdjustmentReject:
		if item.Status != InventoryOperationStatusSubmitted || item.CreatedBy == actorID || reason == "" || len([]rune(reason)) > 255 {
			return ErrBadParam
		}
	case ProcessDomainCommandInventoryAdjustmentPost:
		if item.Status != InventoryOperationStatusApproved {
			return ErrBadParam
		}
	default:
		return ErrBadParam
	}
	return nil
}

func (h *inventoryAdjustmentProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	id, _, _ := processCommandPositiveIntFromPayload(in.Payload, inventoryAdjustmentProcessPayloadID)
	result := &ProcessDomainCommandResult{
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: inventoryAdjustmentProcessBusinessRefType, RefID: id},
	}
	switch h.commandKey {
	case ProcessDomainCommandInventoryAdjustmentSubmit:
		result.Outcome = InventoryAdjustmentProcessCommandOutcomeSubmitted
	case ProcessDomainCommandInventoryAdjustmentApprove:
		result.Outcome = InventoryAdjustmentProcessCommandOutcomeApproved
	case ProcessDomainCommandInventoryAdjustmentReject:
		result.Outcome = InventoryAdjustmentProcessCommandOutcomeRejected
	case ProcessDomainCommandInventoryAdjustmentPost:
		result.Outcome = InventoryAdjustmentProcessCommandOutcomePosted
	default:
		return nil, ErrBadParam
	}
	repo, ok := any(h.uc.repo).(InventoryAdjustmentProcessCommandRepo)
	if !ok {
		return nil, ErrProcessDomainCommandHandlerNotFound
	}
	reason := strings.TrimSpace(processCommandStringFromPayload(in.Payload, processDecisionPayloadReason))
	var err error
	switch h.commandKey {
	case ProcessDomainCommandInventoryAdjustmentSubmit:
		_, err = repo.SubmitInventoryOperationForProcessCommand(ctx, id, in, result, actorID)
	case ProcessDomainCommandInventoryAdjustmentApprove:
		_, err = repo.ApproveInventoryOperationForProcessCommand(ctx, id, in, result, actorID, reason)
	case ProcessDomainCommandInventoryAdjustmentReject:
		_, err = repo.RejectInventoryOperationForProcessCommand(ctx, id, in, result, actorID, reason)
	case ProcessDomainCommandInventoryAdjustmentPost:
		_, err = repo.PostInventoryOperationForProcessCommand(ctx, id, in, result, actorID)
	}
	if err != nil {
		return nil, err
	}
	return result, nil
}
