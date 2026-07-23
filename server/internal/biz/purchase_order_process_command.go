package biz

import (
	"context"
	"strings"
)

const (
	ProcessDomainCommandPurchaseOrderApprove     = "purchase_order.approve_after_workflow"
	PurchaseOrderProcessCommandOutcomeApproved   = "purchase_order.approved"
	purchaseOrderProcessCommandBusinessRefType   = "purchase_order"
	purchaseOrderProcessCommandPayloadPurchaseID = "purchase_order_id"
)

type purchaseOrderApproveProcessCommandHandler struct {
	uc *PurchaseOrderUsecase
}

type PurchaseOrderApproveProcessCommandRepo interface {
	ApprovePurchaseOrderForProcessCommand(ctx context.Context, purchaseOrderID int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*PurchaseOrder, error)
}

func RegisterPurchaseOrderProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, purchaseOrderUC *PurchaseOrderUsecase) error {
	if processRuntimeUC == nil || purchaseOrderUC == nil {
		return ErrBadParam
	}
	return processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandPurchaseOrderApprove,
		&purchaseOrderApproveProcessCommandHandler{uc: purchaseOrderUC},
	)
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
