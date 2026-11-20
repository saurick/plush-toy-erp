package biz

import (
	"context"
	"strings"
)

const (
	ProcessDomainCommandPurchaseOrderSubmit      = "purchase_order.submit"
	ProcessDomainCommandPurchaseOrderApprove     = "purchase_order.approve_after_workflow"
	ProcessDomainCommandPurchaseOrderReject      = "purchase_order.reject_after_workflow"
	PurchaseOrderProcessCommandOutcomeSubmitted  = "purchase_order.submitted"
	PurchaseOrderProcessCommandOutcomeApproved   = "purchase_order.approved"
	PurchaseOrderProcessCommandOutcomeRejected   = "purchase_order.rejected"
	purchaseOrderProcessCommandBusinessRefType   = "purchase_order"
	purchaseOrderProcessCommandPayloadPurchaseID = "purchase_order_id"
)

type purchaseOrderSubmitProcessCommandHandler struct {
	uc *PurchaseOrderUsecase
}

type purchaseOrderApproveProcessCommandHandler struct {
	uc *PurchaseOrderUsecase
}

type purchaseOrderRejectProcessCommandHandler struct {
	uc *PurchaseOrderUsecase
}

// PurchaseOrderSubmitProcessCommandRepo keeps the source transition and durable
// ProcessRuntime result in one database transaction.
type PurchaseOrderSubmitProcessCommandRepo interface {
	SubmitPurchaseOrderForProcessCommand(ctx context.Context, purchaseOrderID int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*PurchaseOrder, error)
}

type PurchaseOrderApproveProcessCommandRepo interface {
	ApprovePurchaseOrderForProcessCommand(ctx context.Context, purchaseOrderID int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*PurchaseOrder, error)
}

type PurchaseOrderRejectProcessCommandRepo interface {
	RejectPurchaseOrderForProcessCommand(ctx context.Context, purchaseOrderID int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int, reason string) (*PurchaseOrder, error)
}

func RegisterPurchaseOrderProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, purchaseOrderUC *PurchaseOrderUsecase) error {
	if processRuntimeUC == nil || purchaseOrderUC == nil {
		return ErrBadParam
	}
	if err := processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandPurchaseOrderSubmit,
		&purchaseOrderSubmitProcessCommandHandler{uc: purchaseOrderUC},
	); err != nil {
		return err
	}
	if err := processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandPurchaseOrderApprove,
		&purchaseOrderApproveProcessCommandHandler{uc: purchaseOrderUC},
	); err != nil {
		return err
	}
	return processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandPurchaseOrderReject,
		&purchaseOrderRejectProcessCommandHandler{uc: purchaseOrderUC},
	)
}

func (h *purchaseOrderRejectProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil || actorID <= 0 ||
		strings.TrimSpace(in.CommandKey) != ProcessDomainCommandPurchaseOrderReject ||
		in.ProcessInstance.ProcessKey != ProcessKeyMaterialSupply ||
		in.ProcessInstance.BusinessRefType != purchaseOrderProcessCommandBusinessRefType ||
		in.ProcessInstance.BusinessRefID <= 0 {
		return ErrBadParam
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, purchaseOrderProcessCommandPayloadPurchaseID, processDecisionPayloadReason); err != nil {
		return err
	}
	purchaseOrderID, present, err := processCommandPositiveIntFromPayload(in.Payload, purchaseOrderProcessCommandPayloadPurchaseID)
	if err != nil || (present && purchaseOrderID != in.ProcessInstance.BusinessRefID) {
		return ErrBadParam
	}
	reason := strings.TrimSpace(processCommandStringFromPayload(in.Payload, processDecisionPayloadReason))
	if reason == "" || len([]rune(reason)) > 255 {
		return ErrBadParam
	}
	order, err := h.uc.GetPurchaseOrder(ctx, in.ProcessInstance.BusinessRefID)
	if err != nil {
		return err
	}
	if order == nil || order.LifecycleStatus != PurchaseOrderStatusSubmitted {
		return ErrBadParam
	}
	return nil
}

func (h *purchaseOrderRejectProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	orderID := in.ProcessInstance.BusinessRefID
	result := &ProcessDomainCommandResult{
		Outcome:     PurchaseOrderProcessCommandOutcomeRejected,
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: purchaseOrderProcessCommandBusinessRefType, RefID: orderID},
	}
	repo, ok := h.uc.repo.(PurchaseOrderRejectProcessCommandRepo)
	if !ok {
		return nil, ErrProcessDomainCommandHandlerNotFound
	}
	reason := strings.TrimSpace(processCommandStringFromPayload(in.Payload, processDecisionPayloadReason))
	if _, err := repo.RejectPurchaseOrderForProcessCommand(ctx, orderID, in, result, actorID, reason); err != nil {
		return nil, err
	}
	return result, nil
}

func (h *purchaseOrderSubmitProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil ||
		strings.TrimSpace(in.CommandKey) != ProcessDomainCommandPurchaseOrderSubmit ||
		in.ProcessInstance.ProcessKey != ProcessKeyMaterialSupply ||
		in.ProcessInstance.BusinessRefType != purchaseOrderProcessCommandBusinessRefType ||
		in.ProcessInstance.BusinessRefID <= 0 {
		return ErrBadParam
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, purchaseOrderProcessCommandPayloadPurchaseID); err != nil {
		return err
	}
	purchaseOrderID, present, err := processCommandPositiveIntFromPayload(in.Payload, purchaseOrderProcessCommandPayloadPurchaseID)
	if err != nil || (present && purchaseOrderID != in.ProcessInstance.BusinessRefID) {
		return ErrBadParam
	}
	order, err := h.uc.GetPurchaseOrder(ctx, in.ProcessInstance.BusinessRefID)
	if err != nil {
		return err
	}
	if order == nil || (order.LifecycleStatus != PurchaseOrderStatusDraft && order.LifecycleStatus != PurchaseOrderStatusSubmitted) {
		return ErrBadParam
	}
	return nil
}

func (h *purchaseOrderSubmitProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	orderID := in.ProcessInstance.BusinessRefID
	result := &ProcessDomainCommandResult{
		Outcome:     PurchaseOrderProcessCommandOutcomeSubmitted,
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: purchaseOrderProcessCommandBusinessRefType, RefID: orderID},
	}
	return result, h.uc.SubmitPurchaseOrderForProcessCommand(ctx, orderID, in, result, actorID)
}

func (h *purchaseOrderApproveProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil ||
		strings.TrimSpace(in.CommandKey) != ProcessDomainCommandPurchaseOrderApprove ||
		in.ProcessInstance.ProcessKey != ProcessKeyMaterialSupply ||
		in.ProcessInstance.BusinessRefType != purchaseOrderProcessCommandBusinessRefType ||
		in.ProcessInstance.BusinessRefID <= 0 {
		return ErrBadParam
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, purchaseOrderProcessCommandPayloadPurchaseID); err != nil {
		return err
	}
	purchaseOrderID, present, err := processCommandPositiveIntFromPayload(in.Payload, purchaseOrderProcessCommandPayloadPurchaseID)
	if err != nil || (present && purchaseOrderID != in.ProcessInstance.BusinessRefID) {
		return ErrBadParam
	}
	order, err := h.uc.GetPurchaseOrder(ctx, in.ProcessInstance.BusinessRefID)
	if err != nil {
		return err
	}
	if order == nil || order.LifecycleStatus != PurchaseOrderStatusSubmitted {
		return ErrBadParam
	}
	return nil
}

func (h *purchaseOrderApproveProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	orderID := in.ProcessInstance.BusinessRefID
	result := &ProcessDomainCommandResult{
		Outcome:     PurchaseOrderProcessCommandOutcomeApproved,
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: purchaseOrderProcessCommandBusinessRefType, RefID: orderID},
	}
	return result, h.uc.ApprovePurchaseOrderForProcessCommand(ctx, orderID, in, result, actorID)
}
