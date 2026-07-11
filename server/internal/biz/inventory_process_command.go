package biz

import (
	"context"
	"strings"
)

const (
	ProcessDomainCommandInventoryPostInbound           = "inventory.post_inbound"
	InventoryProcessCommandOutcomeInboundPosted        = "inventory.inbound_posted"
	inventoryPostInboundProcessCommandBusinessRefType  = "purchase_receipt"
	inventoryPostInboundProcessCommandPayloadReceiptID = "purchase_receipt_id"
)

type inventoryPostInboundProcessCommandHandler struct {
	uc *InventoryUsecase
}

type InventoryPostInboundProcessCommandRepo interface {
	PostPurchaseReceiptForProcessCommand(ctx context.Context, receiptID int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*PurchaseReceipt, error)
}

func RegisterInventoryProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, inventoryUC *InventoryUsecase) error {
	if processRuntimeUC == nil || inventoryUC == nil {
		return ErrBadParam
	}
	return processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandInventoryPostInbound,
		&inventoryPostInboundProcessCommandHandler{uc: inventoryUC},
	)
}

func (h *inventoryPostInboundProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandInventoryPostInbound {
		return ErrBadParam
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, inventoryPostInboundProcessCommandPayloadReceiptID); err != nil {
		return err
	}
	receiptID, err := purchaseReceiptIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return err
	}
	if !ProcessInstanceHasBusinessRef(in.ProcessInstance, inventoryPostInboundProcessCommandBusinessRefType, receiptID) {
		return ErrBadParam
	}
	receipt, err := h.uc.GetPurchaseReceipt(ctx, receiptID)
	if err != nil {
		return err
	}
	if receipt == nil || (receipt.Status != PurchaseReceiptStatusDraft && receipt.Status != PurchaseReceiptStatusPosted) {
		return ErrBadParam
	}
	if receipt.Status == PurchaseReceiptStatusDraft {
		gate, err := h.uc.EvaluatePurchaseReceiptQualityGate(ctx, receiptID)
		if err != nil {
			return err
		}
		if gate == nil || gate.PurchaseReceiptID != receiptID || gate.TotalLines <= 0 {
			return ErrBadParam
		}
		switch gate.Outcome {
		case PurchaseReceiptQualityGateReady:
		case PurchaseReceiptQualityGatePending:
			return ErrPurchaseReceiptQualityPending
		case PurchaseReceiptQualityGateRejected:
			return ErrPurchaseReceiptQualityRejected
		default:
			return ErrBadParam
		}
	}
	return nil
}

func (h *inventoryPostInboundProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	receiptID, _ := purchaseReceiptIDFromProcessCommandPayload(in.Payload)
	result := &ProcessDomainCommandResult{
		Outcome:     InventoryProcessCommandOutcomeInboundPosted,
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: inventoryPostInboundProcessCommandBusinessRefType, RefID: receiptID},
	}
	if repo, ok := h.uc.repo.(InventoryPostInboundProcessCommandRepo); ok {
		if _, err := repo.PostPurchaseReceiptForProcessCommand(ctx, receiptID, in, result, actorID); err != nil {
			return nil, err
		}
		return result, nil
	}
	if _, err := h.uc.PostPurchaseReceipt(ctx, receiptID); err != nil {
		return nil, err
	}
	return result, nil
}

func purchaseReceiptIDFromProcessCommandPayload(payload map[string]any) (int, error) {
	receiptID, hasReceiptID, err := processCommandPositiveIntFromPayload(payload, inventoryPostInboundProcessCommandPayloadReceiptID)
	if err != nil {
		return 0, err
	}
	if hasReceiptID {
		return receiptID, nil
	}
	return 0, ErrBadParam
}
