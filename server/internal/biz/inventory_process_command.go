package biz

import (
	"context"
	"strings"
)

const (
	ProcessDomainCommandInventoryPostInbound              = "inventory.post_inbound"
	InventoryProcessCommandOutcomeInboundPosted           = "inventory.inbound_posted"
	inventoryPostInboundProcessCommandBusinessRefType     = "purchase_receipt"
	inventoryPostInboundProcessCommandPayloadReceiptID    = "purchase_receipt_id"
	inventoryPostInboundProcessCommandPayloadLegacyID     = "id"
	inventoryPostInboundProcessCommandPayloadReceiptNo    = "receipt_no"
	inventoryPostInboundProcessCommandPayloadWarehouseID  = "warehouse_id"
	inventoryPostInboundProcessCommandPayloadInventoryLot = "inventory_lot_id"
)

type inventoryPostInboundProcessCommandHandler struct {
	uc *InventoryUsecase
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

func (h *inventoryPostInboundProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return nil, ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandInventoryPostInbound {
		return nil, ErrBadParam
	}
	receiptID, err := purchaseReceiptIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return nil, err
	}
	if !ProcessInstanceHasBusinessRef(in.ProcessInstance, inventoryPostInboundProcessCommandBusinessRefType, receiptID) {
		return nil, ErrBadParam
	}
	if _, hasReceiptNo := in.Payload[inventoryPostInboundProcessCommandPayloadReceiptNo]; hasReceiptNo {
		if processCommandStringFromPayload(in.Payload, inventoryPostInboundProcessCommandPayloadReceiptNo) == "" {
			return nil, ErrBadParam
		}
	}
	if _, _, err := processCommandPositiveIntFromPayload(in.Payload, inventoryPostInboundProcessCommandPayloadWarehouseID); err != nil {
		return nil, err
	}
	if _, _, err := processCommandPositiveIntFromPayload(in.Payload, inventoryPostInboundProcessCommandPayloadInventoryLot); err != nil {
		return nil, err
	}
	if _, err := h.uc.PostPurchaseReceipt(ctx, receiptID); err != nil {
		return nil, err
	}
	return &ProcessDomainCommandResult{Outcome: InventoryProcessCommandOutcomeInboundPosted}, nil
}

func purchaseReceiptIDFromProcessCommandPayload(payload map[string]any) (int, error) {
	receiptID, hasReceiptID, err := processCommandPositiveIntFromPayload(payload, inventoryPostInboundProcessCommandPayloadReceiptID)
	if err != nil {
		return 0, err
	}
	if hasReceiptID {
		return receiptID, nil
	}
	legacyID, hasLegacyID, err := processCommandPositiveIntFromPayload(payload, inventoryPostInboundProcessCommandPayloadLegacyID)
	if err != nil {
		return 0, err
	}
	if hasLegacyID {
		return legacyID, nil
	}
	return 0, ErrBadParam
}
