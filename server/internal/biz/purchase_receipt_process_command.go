package biz

import (
	"context"
	"math"
	"strings"
	"time"
)

const (
	ProcessDomainCommandPurchaseReceiptCreate           = "purchase_receipt.create"
	PurchaseReceiptProcessCommandOutcomeCreated         = "purchase_receipt.created"
	purchaseReceiptProcessCommandBusinessRefType        = "purchase_order"
	purchaseReceiptProcessCommandPayloadPurchaseOrderID = "purchase_order_id"
	purchaseReceiptProcessCommandPayloadReceiptNo       = "receipt_no"
	purchaseReceiptProcessCommandPayloadWarehouseID     = "warehouse_id"
	purchaseReceiptProcessCommandPayloadReceivedAt      = "received_at"
	purchaseReceiptProcessCommandPayloadNote            = "note"
	processCommandDateLayout                            = "2006-01-02"
)

type purchaseReceiptCreateProcessCommandHandler struct {
	uc *InventoryUsecase
}

type PurchaseReceiptCreateProcessCommandRepo interface {
	CreatePurchaseReceiptFromPurchaseOrderForProcessCommand(ctx context.Context, in *PurchaseReceiptFromPurchaseOrderCreate, command *ProcessDomainCommandInput, actorID int) (*PurchaseReceipt, error)
}

type purchaseReceiptFromPurchaseOrderProcessPreflight interface {
	ValidatePurchaseReceiptFromPurchaseOrder(ctx context.Context, in *PurchaseReceiptFromPurchaseOrderCreate) error
}

func RegisterPurchaseReceiptProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, inventoryUC *InventoryUsecase) error {
	if processRuntimeUC == nil || inventoryUC == nil {
		return ErrBadParam
	}
	return processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandPurchaseReceiptCreate,
		&purchaseReceiptCreateProcessCommandHandler{uc: inventoryUC},
	)
}

func (h *purchaseReceiptCreateProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandPurchaseReceiptCreate {
		return ErrBadParam
	}
	create, err := purchaseReceiptCreateFromProcessCommandInput(in)
	if err != nil {
		return err
	}
	normalized, err := normalizePurchaseReceiptFromPurchaseOrderCreate(*create)
	if err != nil {
		return err
	}
	if normalized.IdempotencyKey != "" {
		if _, found, err := h.uc.repo.ResolvePurchaseReceiptFromPurchaseOrderReplay(ctx, &normalized); err != nil || found {
			return err
		}
	}
	if err := requireActiveReference(ctx, normalized.WarehouseID, h.uc.repo.WarehouseIsActive, ErrWarehouseInactive); err != nil {
		return err
	}
	if preflight, ok := h.uc.repo.(purchaseReceiptFromPurchaseOrderProcessPreflight); ok {
		return preflight.ValidatePurchaseReceiptFromPurchaseOrder(ctx, &normalized)
	}
	return nil
}

func (h *purchaseReceiptCreateProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	create, err := purchaseReceiptCreateFromProcessCommandInput(in)
	if err != nil {
		return nil, err
	}
	var receipt *PurchaseReceipt
	if repo, ok := h.uc.repo.(PurchaseReceiptCreateProcessCommandRepo); ok {
		normalized, normalizeErr := normalizePurchaseReceiptFromPurchaseOrderCreate(*create)
		if normalizeErr != nil {
			return nil, normalizeErr
		}
		receipt, err = repo.CreatePurchaseReceiptFromPurchaseOrderForProcessCommand(ctx, &normalized, in, actorID)
	} else {
		receipt, err = h.uc.CreatePurchaseReceiptFromPurchaseOrder(ctx, create)
	}
	if err != nil {
		return nil, err
	}
	return PurchaseReceiptProcessCommandResult(receipt)
}

func PurchaseReceiptProcessCommandResult(receipt *PurchaseReceipt) (*ProcessDomainCommandResult, error) {
	if receipt == nil || receipt.ID <= 0 {
		return nil, ErrBadParam
	}
	var receiptNo *string
	if strings.TrimSpace(receipt.ReceiptNo) != "" {
		value := strings.TrimSpace(receipt.ReceiptNo)
		receiptNo = &value
	}
	linkedRefs := []ProcessBusinessRef{
		{RefType: "purchase_receipt", RefID: receipt.ID, RefNo: receiptNo},
	}
	for _, inspection := range receipt.QualityInspections {
		if inspection == nil || inspection.ID <= 0 {
			return nil, ErrBadParam
		}
		inspectionNo := strings.TrimSpace(inspection.InspectionNo)
		var inspectionNoPtr *string
		if inspectionNo != "" {
			inspectionNoPtr = &inspectionNo
		}
		linkedRefs = append(linkedRefs, ProcessBusinessRef{
			RefType: "quality_inspection",
			RefID:   inspection.ID,
			RefNo:   inspectionNoPtr,
		})
	}
	if len(linkedRefs) != len(receipt.Items)+1 {
		return nil, ErrBadParam
	}
	return &ProcessDomainCommandResult{
		Outcome:            PurchaseReceiptProcessCommandOutcomeCreated,
		LinkedBusinessRefs: linkedRefs,
		EffectState:        ProcessDomainCommandEffectStateApplied,
		EffectRef:          &ProcessBusinessRef{RefType: "purchase_receipt", RefID: receipt.ID, RefNo: receiptNo},
	}, nil
}

func purchaseReceiptCreateFromProcessCommandInput(in *ProcessDomainCommandInput) (*PurchaseReceiptFromPurchaseOrderCreate, error) {
	if in == nil || in.ProcessInstance == nil || strings.TrimSpace(in.IdempotencyKey) == "" {
		return nil, ErrBadParam
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload,
		purchaseReceiptProcessCommandPayloadPurchaseOrderID,
		purchaseReceiptProcessCommandPayloadReceiptNo,
		purchaseReceiptProcessCommandPayloadWarehouseID,
		purchaseReceiptProcessCommandPayloadReceivedAt,
		purchaseReceiptProcessCommandPayloadNote,
	); err != nil {
		return nil, err
	}
	if in.ProcessInstance.BusinessRefType != purchaseReceiptProcessCommandBusinessRefType || in.ProcessInstance.BusinessRefID <= 0 {
		return nil, ErrBadParam
	}
	payloadPurchaseOrderID, hasPayloadPurchaseOrderID, err := processCommandPositiveIntFromPayload(in.Payload, purchaseReceiptProcessCommandPayloadPurchaseOrderID)
	if err != nil {
		return nil, err
	}
	if hasPayloadPurchaseOrderID && payloadPurchaseOrderID != in.ProcessInstance.BusinessRefID {
		return nil, ErrBadParam
	}
	warehouseID, hasWarehouseID, err := processCommandPositiveIntFromPayload(in.Payload, purchaseReceiptProcessCommandPayloadWarehouseID)
	if err != nil || !hasWarehouseID {
		if err != nil {
			return nil, err
		}
		return nil, ErrBadParam
	}
	receivedAt, err := processCommandOptionalTimeFromPayload(in.Payload, purchaseReceiptProcessCommandPayloadReceivedAt)
	if err != nil {
		return nil, err
	}
	return &PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID: in.ProcessInstance.BusinessRefID,
		ReceiptNo:       processCommandStringFromPayload(in.Payload, purchaseReceiptProcessCommandPayloadReceiptNo),
		WarehouseID:     warehouseID,
		ReceivedAt:      receivedAt,
		Note:            processCommandOptionalStringPtrFromPayload(in.Payload, purchaseReceiptProcessCommandPayloadNote),
		IdempotencyKey:  strings.TrimSpace(in.IdempotencyKey),
	}, nil
}

func processCommandPositiveIntFromPayload(payload map[string]any, key string) (int, bool, error) {
	raw, ok := payload[key]
	if !ok || raw == nil {
		return 0, false, nil
	}
	switch value := raw.(type) {
	case int:
		if value <= 0 {
			return 0, true, ErrBadParam
		}
		return value, true, nil
	case int64:
		if value <= 0 || value > int64(maxProcessCommandInt()) {
			return 0, true, ErrBadParam
		}
		return int(value), true, nil
	case float64:
		if value <= 0 || math.Trunc(value) != value || value > float64(maxProcessCommandInt()) {
			return 0, true, ErrBadParam
		}
		return int(value), true, nil
	default:
		return 0, true, ErrBadParam
	}
}

func processCommandStringFromPayload(payload map[string]any, key string) string {
	raw, ok := payload[key]
	if !ok || raw == nil {
		return ""
	}
	value, ok := raw.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func processCommandOptionalStringPtrFromPayload(payload map[string]any, key string) *string {
	value := processCommandStringFromPayload(payload, key)
	if value == "" {
		return nil
	}
	return &value
}

func processCommandOptionalTimeFromPayload(payload map[string]any, key string) (time.Time, error) {
	normalize := func(value time.Time) time.Time {
		if value.IsZero() {
			return time.Time{}
		}
		return value.UTC().Truncate(time.Microsecond)
	}
	raw, ok := payload[key]
	if !ok || raw == nil {
		return time.Time{}, nil
	}
	switch value := raw.(type) {
	case time.Time:
		return normalize(value), nil
	case string:
		value = strings.TrimSpace(value)
		if value == "" {
			return time.Time{}, nil
		}
		if parsed, err := time.Parse(time.RFC3339, value); err == nil {
			return normalize(parsed), nil
		}
		if parsed, err := time.Parse(processCommandDateLayout, value); err == nil {
			return normalize(parsed), nil
		}
		return time.Time{}, ErrBadParam
	default:
		return time.Time{}, ErrBadParam
	}
}
