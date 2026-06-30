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

func RegisterSalesOrderProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, salesOrderUC *SalesOrderUsecase) error {
	if processRuntimeUC == nil || salesOrderUC == nil {
		return ErrBadParam
	}
	return processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandSalesOrderSubmit,
		&salesOrderSubmitProcessCommandHandler{uc: salesOrderUC},
	)
}

func (h *salesOrderSubmitProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return nil, ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandSalesOrderSubmit {
		return nil, ErrBadParam
	}
	if in.ProcessInstance.BusinessRefType != salesOrderProcessCommandBusinessRefType || in.ProcessInstance.BusinessRefID <= 0 {
		return nil, ErrBadParam
	}
	payloadSalesOrderID, hasPayloadSalesOrderID, err := salesOrderIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return nil, err
	}
	if hasPayloadSalesOrderID && payloadSalesOrderID != in.ProcessInstance.BusinessRefID {
		return nil, ErrBadParam
	}
	if _, err := h.uc.SubmitSalesOrder(ctx, in.ProcessInstance.BusinessRefID); err != nil {
		return nil, err
	}
	return &ProcessDomainCommandResult{Outcome: SalesOrderProcessCommandOutcomeSubmitted}, nil
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
