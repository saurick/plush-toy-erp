package biz

import (
	"context"
	"math"
	"strings"
)

const (
	ProcessDomainCommandSalesOrderSubmit        = "sales_order.submit"
	SalesOrderProcessCommandOutcomeSubmitted    = "sales_order.submitted"
	salesOrderProcessCommandBusinessRefType     = "sales_order"
	salesOrderProcessCommandPayloadSalesOrderID = "sales_order_id"
)

type salesOrderSubmitProcessCommandHandler struct {
	uc *SalesOrderUsecase
}

// SalesOrderSubmitProcessCommandRepo is implemented by the production data
// repository so the lifecycle transition and durable ProcessRuntime result are
// committed by one database transaction.
type SalesOrderSubmitProcessCommandRepo interface {
	SubmitSalesOrderForProcessCommand(ctx context.Context, salesOrderID int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*SalesOrder, error)
}

func RegisterSalesOrderProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, salesOrderUC *SalesOrderUsecase) error {
	if processRuntimeUC == nil || salesOrderUC == nil {
		return ErrBadParam
	}
	return processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandSalesOrderSubmit,
		&salesOrderSubmitProcessCommandHandler{uc: salesOrderUC},
	)
}

func (h *salesOrderSubmitProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandSalesOrderSubmit {
		return ErrBadParam
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, salesOrderProcessCommandPayloadSalesOrderID); err != nil {
		return err
	}
	if in.ProcessInstance.BusinessRefType != salesOrderProcessCommandBusinessRefType || in.ProcessInstance.BusinessRefID <= 0 {
		return ErrBadParam
	}
	payloadSalesOrderID, hasPayloadSalesOrderID, err := salesOrderIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return err
	}
	if hasPayloadSalesOrderID && payloadSalesOrderID != in.ProcessInstance.BusinessRefID {
		return ErrBadParam
	}
	order, err := h.uc.GetSalesOrder(ctx, in.ProcessInstance.BusinessRefID)
	if err != nil {
		return err
	}
	if order == nil || (order.LifecycleStatus != SalesOrderStatusDraft && order.LifecycleStatus != SalesOrderStatusSubmitted) {
		return ErrBadParam
	}
	return nil
}

func (h *salesOrderSubmitProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	orderID := in.ProcessInstance.BusinessRefID
	result := &ProcessDomainCommandResult{
		Outcome:     SalesOrderProcessCommandOutcomeSubmitted,
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: salesOrderProcessCommandBusinessRefType, RefID: orderID},
	}
	if repo, ok := h.uc.repo.(SalesOrderSubmitProcessCommandRepo); ok {
		if _, err := repo.SubmitSalesOrderForProcessCommand(ctx, orderID, in, result, actorID); err != nil {
			return nil, err
		}
		return result, nil
	}
	if _, err := h.uc.SubmitSalesOrder(ctx, orderID); err != nil {
		return nil, err
	}
	return result, nil
}

func salesOrderIDFromProcessCommandPayload(payload map[string]any) (int, bool, error) {
	raw, ok := payload[salesOrderProcessCommandPayloadSalesOrderID]
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

func maxProcessCommandInt() int {
	return int(^uint(0) >> 1)
}
