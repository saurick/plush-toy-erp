package biz

import (
	"context"
	"strings"
)

const (
	ShipmentProcessCommandOutcomeShipped         = "shipment.shipped"
	ShipmentProcessCommandOutcomeFinanceReleased = "shipment.finance_released"
	ShipmentProcessCommandOutcomeFinanceRejected = "shipment.finance_rejected"
	shipmentProcessCommandBusinessRefType        = "shipment"
	shipmentProcessCommandPayloadShipmentID      = "shipment_id"
)

type shipmentFinanceReleaseProcessCommandHandler struct {
	uc *OperationalFactUsecase
}

type shipmentFinanceRejectProcessCommandHandler struct {
	uc *OperationalFactUsecase
}

type shipmentShipProcessCommandHandler struct {
	uc *OperationalFactUsecase
}

type ShipmentProcessCommandRepo interface {
	RecordShipmentFinanceReleaseProcessCommand(ctx context.Context, shipmentID int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*Shipment, error)
	ShipShipmentForProcessCommand(ctx context.Context, shipmentID int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*Shipment, error)
}

type ShipmentFinanceRejectProcessCommandRepo interface {
	RecordShipmentFinanceRejectionProcessCommand(ctx context.Context, shipmentID int, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int, reason string) (*Shipment, error)
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
	if err := processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandShipmentFinanceReject,
		&shipmentFinanceRejectProcessCommandHandler{uc: operationalFactUC},
	); err != nil {
		return err
	}
	return processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandShipmentShip,
		&shipmentShipProcessCommandHandler{uc: operationalFactUC},
	)
}

func (h *shipmentFinanceRejectProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil || actorID <= 0 ||
		strings.TrimSpace(in.CommandKey) != ProcessDomainCommandShipmentFinanceReject {
		return ErrBadParam
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, shipmentProcessCommandPayloadShipmentID, processDecisionPayloadReason); err != nil {
		return err
	}
	shipmentID, err := shipmentIDFromProcessCommandPayload(in.Payload)
	if err != nil || !ProcessInstanceHasBusinessRef(in.ProcessInstance, shipmentProcessCommandBusinessRefType, shipmentID) {
		return ErrBadParam
	}
	reason := strings.TrimSpace(processCommandStringFromPayload(in.Payload, processDecisionPayloadReason))
	if reason == "" || len([]rune(reason)) > 255 {
		return ErrBadParam
	}
	shipment, err := h.uc.GetShipment(ctx, shipmentID)
	if err != nil {
		return err
	}
	if shipment == nil || shipment.ID != shipmentID || shipment.Purpose != ShipmentPurposeSalesDelivery || shipment.Status != ShipmentStatusDraft ||
		(shipment.FinanceReleaseStatus != ShipmentFinanceReleaseStatusPending && shipment.FinanceReleaseStatus != ShipmentFinanceReleaseStatusRejected) {
		return ErrBadParam
	}
	return nil
}

func (h *shipmentFinanceRejectProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	shipmentID, _ := shipmentIDFromProcessCommandPayload(in.Payload)
	result := &ProcessDomainCommandResult{
		Outcome:     ShipmentProcessCommandOutcomeFinanceRejected,
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: shipmentProcessCommandBusinessRefType, RefID: shipmentID},
	}
	repo, ok := h.uc.repo.(ShipmentFinanceRejectProcessCommandRepo)
	if !ok {
		return nil, ErrProcessDomainCommandHandlerNotFound
	}
	reason := strings.TrimSpace(processCommandStringFromPayload(in.Payload, processDecisionPayloadReason))
	if _, err := repo.RecordShipmentFinanceRejectionProcessCommand(ctx, shipmentID, in, result, actorID, reason); err != nil {
		return nil, err
	}
	return result, nil
}

func (h *shipmentFinanceReleaseProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandShipmentFinanceRelease {
		return ErrBadParam
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, shipmentProcessCommandPayloadShipmentID); err != nil {
		return err
	}
	shipmentID, err := shipmentIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return err
	}
	if !ProcessInstanceHasBusinessRef(in.ProcessInstance, shipmentProcessCommandBusinessRefType, shipmentID) {
		return ErrBadParam
	}
	shipment, err := h.uc.GetShipment(ctx, shipmentID)
	if err != nil {
		return err
	}
	if shipment == nil || shipment.ID != shipmentID || shipment.Purpose != ShipmentPurposeSalesDelivery || shipment.Status != ShipmentStatusDraft ||
		(shipment.FinanceReleaseStatus != ShipmentFinanceReleaseStatusPending && shipment.FinanceReleaseStatus != ShipmentFinanceReleaseStatusApproved) {
		return ErrBadParam
	}
	return nil
}

func (h *shipmentFinanceReleaseProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	shipmentID, _ := shipmentIDFromProcessCommandPayload(in.Payload)
	result := &ProcessDomainCommandResult{
		Outcome:     ShipmentProcessCommandOutcomeFinanceReleased,
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: shipmentProcessCommandBusinessRefType, RefID: shipmentID},
	}
	if repo, ok := h.uc.repo.(ShipmentProcessCommandRepo); ok {
		if _, err := repo.RecordShipmentFinanceReleaseProcessCommand(ctx, shipmentID, in, result, actorID); err != nil {
			return nil, err
		}
		return result, nil
	}
	return nil, ErrProcessDomainCommandHandlerNotFound
}

func (h *shipmentShipProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandShipmentShip {
		return ErrBadParam
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, shipmentProcessCommandPayloadShipmentID); err != nil {
		return err
	}
	shipmentID, err := shipmentIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return err
	}
	if !ProcessInstanceHasBusinessRef(in.ProcessInstance, shipmentProcessCommandBusinessRefType, shipmentID) {
		return ErrBadParam
	}
	shipment, err := h.uc.GetShipment(ctx, shipmentID)
	if err != nil {
		return err
	}
	if shipment == nil || shipment.ID != shipmentID || shipment.Purpose != ShipmentPurposeSalesDelivery || (shipment.Status != ShipmentStatusDraft && shipment.Status != ShipmentStatusShipped) {
		return ErrBadParam
	}
	if shipment.Status == ShipmentStatusDraft {
		if shipment.FinanceReleaseStatus != ShipmentFinanceReleaseStatusApproved {
			return ErrShipmentFinanceReleaseRequired
		}
	}
	return nil
}

func (h *shipmentShipProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	shipmentID, _ := shipmentIDFromProcessCommandPayload(in.Payload)
	result := &ProcessDomainCommandResult{
		Outcome:     ShipmentProcessCommandOutcomeShipped,
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: shipmentProcessCommandBusinessRefType, RefID: shipmentID},
	}
	if repo, ok := h.uc.repo.(ShipmentProcessCommandRepo); ok {
		if _, err := repo.ShipShipmentForProcessCommand(ctx, shipmentID, in, result, actorID); err != nil {
			return nil, err
		}
		return result, nil
	}
	if _, err := h.uc.ShipShipment(ctx, shipmentID); err != nil {
		return nil, err
	}
	return result, nil
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
