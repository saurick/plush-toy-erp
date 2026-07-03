package biz

import (
	"context"
	"strings"
)

const (
	ShipmentProcessCommandOutcomeShipped          = "shipment.shipped"
	ShipmentProcessCommandOutcomeFinanceReleased  = "shipment.finance_released"
	shipmentProcessCommandBusinessRefType         = "shipment"
	shipmentProcessCommandPayloadShipmentID       = "shipment_id"
	shipmentProcessCommandPayloadShipmentNo       = "shipment_no"
	shipmentProcessCommandPayloadWarehouseID      = "warehouse_id"
	shipmentProcessCommandPayloadOperatorID       = "operator_id"
	shipmentProcessCommandPayloadShippedAt        = "shipped_at"
	shipmentProcessCommandPayloadCarrier          = "carrier"
	shipmentProcessCommandPayloadTrackingNo       = "tracking_no"
	shipmentProcessCommandPayloadShipmentNote     = "ship_note"
	shipmentProcessCommandPayloadFinanceReleaseNo = "finance_release_no"
	shipmentProcessCommandPayloadApprovedByID     = "approved_by_id"
	shipmentProcessCommandPayloadReleasedAt       = "released_at"
	shipmentProcessCommandPayloadReleaseNote      = "release_note"
)

type shipmentFinanceReleaseProcessCommandHandler struct {
	uc *OperationalFactUsecase
}

type shipmentShipProcessCommandHandler struct {
	uc *OperationalFactUsecase
}

func RegisterShipmentProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, operationalFactUC *OperationalFactUsecase) error {
	if processRuntimeUC == nil || operationalFactUC == nil {
		return ErrBadParam
	}
	if err := processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandShipmentFinanceRelease,
		&shipmentFinanceReleaseProcessCommandHandler{uc: operationalFactUC},
	); err != nil {
		return err
	}
	return processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandShipmentShip,
		&shipmentShipProcessCommandHandler{uc: operationalFactUC},
	)
}

func (h *shipmentFinanceReleaseProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return nil, ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandShipmentFinanceRelease {
		return nil, ErrBadParam
	}
	shipmentID, err := shipmentIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return nil, err
	}
	if !ProcessInstanceHasBusinessRef(in.ProcessInstance, shipmentProcessCommandBusinessRefType, shipmentID) {
		return nil, ErrBadParam
	}
	if _, hasReleaseNo := in.Payload[shipmentProcessCommandPayloadFinanceReleaseNo]; hasReleaseNo {
		if processCommandStringFromPayload(in.Payload, shipmentProcessCommandPayloadFinanceReleaseNo) == "" {
			return nil, ErrBadParam
		}
	}
	if _, _, err := processCommandPositiveIntFromPayload(in.Payload, shipmentProcessCommandPayloadApprovedByID); err != nil {
		return nil, err
	}
	if _, err := processCommandOptionalTimeFromPayload(in.Payload, shipmentProcessCommandPayloadReleasedAt); err != nil {
		return nil, err
	}
	_ = processCommandOptionalStringPtrFromPayload(in.Payload, shipmentProcessCommandPayloadReleaseNote)
	shipment, err := h.uc.GetShipment(ctx, shipmentID)
	if err != nil {
		return nil, err
	}
	if shipment == nil || shipment.ID != shipmentID || shipment.Status != ShipmentStatusDraft {
		return nil, ErrBadParam
	}
	return &ProcessDomainCommandResult{Outcome: ShipmentProcessCommandOutcomeFinanceReleased}, nil
}

func (h *shipmentShipProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return nil, ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandShipmentShip {
		return nil, ErrBadParam
	}
	shipmentID, err := shipmentIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return nil, err
	}
	if !ProcessInstanceHasBusinessRef(in.ProcessInstance, shipmentProcessCommandBusinessRefType, shipmentID) {
		return nil, ErrBadParam
	}
	if _, hasShipmentNo := in.Payload[shipmentProcessCommandPayloadShipmentNo]; hasShipmentNo {
		if processCommandStringFromPayload(in.Payload, shipmentProcessCommandPayloadShipmentNo) == "" {
			return nil, ErrBadParam
		}
	}
	if _, _, err := processCommandPositiveIntFromPayload(in.Payload, shipmentProcessCommandPayloadWarehouseID); err != nil {
		return nil, err
	}
	if _, _, err := processCommandPositiveIntFromPayload(in.Payload, shipmentProcessCommandPayloadOperatorID); err != nil {
		return nil, err
	}
	if _, err := processCommandOptionalTimeFromPayload(in.Payload, shipmentProcessCommandPayloadShippedAt); err != nil {
		return nil, err
	}
	_ = processCommandOptionalStringPtrFromPayload(in.Payload, shipmentProcessCommandPayloadCarrier)
	_ = processCommandOptionalStringPtrFromPayload(in.Payload, shipmentProcessCommandPayloadTrackingNo)
	_ = processCommandOptionalStringPtrFromPayload(in.Payload, shipmentProcessCommandPayloadShipmentNote)
	if _, err := h.uc.ShipShipment(ctx, shipmentID); err != nil {
		return nil, err
	}
	return &ProcessDomainCommandResult{Outcome: ShipmentProcessCommandOutcomeShipped}, nil
}

func shipmentIDFromProcessCommandPayload(payload map[string]any) (int, error) {
	shipmentID, hasShipmentID, err := processCommandPositiveIntFromPayload(payload, shipmentProcessCommandPayloadShipmentID)
	if err != nil {
		return 0, err
	}
	if hasShipmentID {
		return shipmentID, nil
	}
	return 0, ErrBadParam
}
