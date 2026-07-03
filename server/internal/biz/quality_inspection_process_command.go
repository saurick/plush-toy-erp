package biz

import (
	"context"
	"strings"
)

const (
	ProcessDomainCommandQualityInspectionDecide              = "quality_inspection.decide"
	QualityInspectionProcessCommandOutcomePassed             = "quality_inspection.passed"
	QualityInspectionProcessCommandOutcomeRejected           = "quality_inspection.rejected"
	QualityInspectionProcessCommandOutcomeConcession         = "quality_inspection.concession_accepted"
	FinishedGoodsQualityProcessCommandOutcomePassed          = "finished_goods_quality.passed"
	FinishedGoodsQualityProcessCommandOutcomeRejected        = "finished_goods_quality.rejected"
	FinishedGoodsQualityProcessCommandOutcomeConcession      = "finished_goods_quality.concession_accepted"
	qualityInspectionProcessCommandBusinessRefType           = "purchase_receipt"
	finishedGoodsQualityProcessCommandBusinessRefType        = "shipment"
	qualityInspectionProcessCommandPayloadInspectionID       = "quality_inspection_id"
	qualityInspectionProcessCommandPayloadPurchaseReceiptID  = "purchase_receipt_id"
	qualityInspectionProcessCommandPayloadInventoryLotID     = "inventory_lot_id"
	qualityInspectionProcessCommandPayloadShipmentID         = "shipment_id"
	qualityInspectionProcessCommandPayloadFinishedGoodsLotID = "finished_goods_lot_id"
	qualityInspectionProcessCommandPayloadResult             = "result"
	qualityInspectionProcessCommandPayloadInspectedAt        = "inspected_at"
	qualityInspectionProcessCommandPayloadInspectorID        = "inspector_id"
	qualityInspectionProcessCommandPayloadDecisionNote       = "decision_note"
)

type qualityInspectionDecideProcessCommandHandler struct {
	uc *InventoryUsecase
}

type finishedGoodsQualityDecideProcessCommandHandler struct {
	uc *InventoryUsecase
}

func RegisterQualityInspectionProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, inventoryUC *InventoryUsecase) error {
	if processRuntimeUC == nil || inventoryUC == nil {
		return ErrBadParam
	}
	if err := processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandQualityInspectionDecide,
		&qualityInspectionDecideProcessCommandHandler{uc: inventoryUC},
	); err != nil {
		return err
	}
	return processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandFinishedGoodsQualityDecide,
		&finishedGoodsQualityDecideProcessCommandHandler{uc: inventoryUC},
	)
}

func (h *qualityInspectionDecideProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return nil, ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandQualityInspectionDecide {
		return nil, ErrBadParam
	}
	inspectionID, err := qualityInspectionIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return nil, err
	}
	result := strings.ToUpper(processCommandStringFromPayload(in.Payload, qualityInspectionProcessCommandPayloadResult))
	if !IsValidQualityInspectionResult(result) {
		return nil, ErrBadParam
	}
	inspection, err := h.uc.GetQualityInspection(ctx, inspectionID)
	if err != nil {
		return nil, err
	}
	if inspection == nil || !ProcessInstanceHasBusinessRef(in.ProcessInstance, qualityInspectionProcessCommandBusinessRefType, inspection.PurchaseReceiptID) {
		return nil, ErrBadParam
	}
	payloadPurchaseReceiptID, hasPurchaseReceiptID, err := processCommandPositiveIntFromPayload(in.Payload, qualityInspectionProcessCommandPayloadPurchaseReceiptID)
	if err != nil {
		return nil, err
	}
	if hasPurchaseReceiptID && payloadPurchaseReceiptID != inspection.PurchaseReceiptID {
		return nil, ErrBadParam
	}
	payloadInventoryLotID, hasInventoryLotID, err := processCommandPositiveIntFromPayload(in.Payload, qualityInspectionProcessCommandPayloadInventoryLotID)
	if err != nil {
		return nil, err
	}
	if hasInventoryLotID && payloadInventoryLotID != inspection.InventoryLotID {
		return nil, ErrBadParam
	}
	inspectedAt, err := processCommandOptionalTimeFromPayload(in.Payload, qualityInspectionProcessCommandPayloadInspectedAt)
	if err != nil {
		return nil, err
	}
	inspectorID, err := processCommandOptionalPositiveIntPtrFromPayload(in.Payload, qualityInspectionProcessCommandPayloadInspectorID)
	if err != nil {
		return nil, err
	}
	decision := &QualityInspectionDecision{
		InspectionID: inspectionID,
		Result:       result,
		InspectedAt:  inspectedAt,
		InspectorID:  inspectorID,
		DecisionNote: processCommandOptionalStringPtrFromPayload(in.Payload, qualityInspectionProcessCommandPayloadDecisionNote),
	}
	switch result {
	case QualityInspectionResultPass:
		if _, err := h.uc.PassQualityInspection(ctx, decision); err != nil {
			return nil, err
		}
		return &ProcessDomainCommandResult{Outcome: QualityInspectionProcessCommandOutcomePassed}, nil
	case QualityInspectionResultConcession:
		if _, err := h.uc.PassQualityInspection(ctx, decision); err != nil {
			return nil, err
		}
		return &ProcessDomainCommandResult{Outcome: QualityInspectionProcessCommandOutcomeConcession}, nil
	case QualityInspectionResultReject:
		if _, err := h.uc.RejectQualityInspection(ctx, decision); err != nil {
			return nil, err
		}
		return &ProcessDomainCommandResult{Outcome: QualityInspectionProcessCommandOutcomeRejected}, nil
	default:
		return nil, ErrBadParam
	}
}

func (h *finishedGoodsQualityDecideProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return nil, ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandFinishedGoodsQualityDecide {
		return nil, ErrBadParam
	}
	shipmentID, err := processCommandRequiredPositiveIntFromPayload(in.Payload, qualityInspectionProcessCommandPayloadShipmentID)
	if err != nil {
		return nil, err
	}
	if !ProcessInstanceHasBusinessRef(in.ProcessInstance, finishedGoodsQualityProcessCommandBusinessRefType, shipmentID) {
		return nil, ErrBadParam
	}
	inspectionID, err := qualityInspectionIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return nil, err
	}
	result := strings.ToUpper(processCommandStringFromPayload(in.Payload, qualityInspectionProcessCommandPayloadResult))
	if !IsValidQualityInspectionResult(result) {
		return nil, ErrBadParam
	}
	inspection, err := h.uc.GetQualityInspection(ctx, inspectionID)
	if err != nil {
		return nil, err
	}
	if !isShipmentLinkedFinishedGoodsQualityInspection(inspection, shipmentID) {
		return nil, ErrBadParam
	}
	payloadFinishedGoodsLotID, hasFinishedGoodsLotID, err := processCommandPositiveIntFromPayload(in.Payload, qualityInspectionProcessCommandPayloadFinishedGoodsLotID)
	if err != nil {
		return nil, err
	}
	if hasFinishedGoodsLotID && payloadFinishedGoodsLotID != inspection.InventoryLotID {
		return nil, ErrBadParam
	}
	inspectedAt, err := processCommandOptionalTimeFromPayload(in.Payload, qualityInspectionProcessCommandPayloadInspectedAt)
	if err != nil {
		return nil, err
	}
	inspectorID, err := processCommandOptionalPositiveIntPtrFromPayload(in.Payload, qualityInspectionProcessCommandPayloadInspectorID)
	if err != nil {
		return nil, err
	}
	decision := &QualityInspectionDecision{
		InspectionID: inspectionID,
		Result:       result,
		InspectedAt:  inspectedAt,
		InspectorID:  inspectorID,
		DecisionNote: processCommandOptionalStringPtrFromPayload(in.Payload, qualityInspectionProcessCommandPayloadDecisionNote),
	}
	switch result {
	case QualityInspectionResultPass:
		if _, err := h.uc.PassQualityInspection(ctx, decision); err != nil {
			return nil, err
		}
		return &ProcessDomainCommandResult{Outcome: FinishedGoodsQualityProcessCommandOutcomePassed}, nil
	case QualityInspectionResultConcession:
		if _, err := h.uc.PassQualityInspection(ctx, decision); err != nil {
			return nil, err
		}
		return &ProcessDomainCommandResult{Outcome: FinishedGoodsQualityProcessCommandOutcomeConcession}, nil
	case QualityInspectionResultReject:
		if _, err := h.uc.RejectQualityInspection(ctx, decision); err != nil {
			return nil, err
		}
		return &ProcessDomainCommandResult{Outcome: FinishedGoodsQualityProcessCommandOutcomeRejected}, nil
	default:
		return nil, ErrBadParam
	}
}

func qualityInspectionIDFromProcessCommandPayload(payload map[string]any) (int, error) {
	inspectionID, hasInspectionID, err := processCommandPositiveIntFromPayload(payload, qualityInspectionProcessCommandPayloadInspectionID)
	if err != nil {
		return 0, err
	}
	if hasInspectionID {
		return inspectionID, nil
	}
	return 0, ErrBadParam
}

func processCommandRequiredPositiveIntFromPayload(payload map[string]any, key string) (int, error) {
	value, ok, err := processCommandPositiveIntFromPayload(payload, key)
	if err != nil {
		return 0, err
	}
	if !ok {
		return 0, ErrBadParam
	}
	return value, nil
}

func isShipmentLinkedFinishedGoodsQualityInspection(inspection *QualityInspection, shipmentID int) bool {
	if inspection == nil || shipmentID <= 0 {
		return false
	}
	if inspection.SourceType == nil || strings.TrimSpace(*inspection.SourceType) != QualityInspectionSourceShipment {
		return false
	}
	if inspection.SourceID == nil || *inspection.SourceID != shipmentID {
		return false
	}
	if inspection.InspectionType == nil || strings.TrimSpace(*inspection.InspectionType) != QualityInspectionTypeFinishedGoods {
		return false
	}
	return true
}

func processCommandOptionalPositiveIntPtrFromPayload(payload map[string]any, key string) (*int, error) {
	value, ok, err := processCommandPositiveIntFromPayload(payload, key)
	if err != nil || !ok {
		return nil, err
	}
	return &value, nil
}
