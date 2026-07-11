package biz

import (
	"context"
	"strings"
)

const (
	ProcessDomainCommandIncomingQualityGate                  = "quality_inspection.aggregate_gate"
	IncomingQualityGateProcessCommandOutcomePassed           = "quality_inspection.aggregate_passed"
	IncomingQualityGateProcessCommandOutcomeRejected         = "quality_inspection.aggregate_rejected"
	FinishedGoodsQualityProcessCommandOutcomePassed          = "finished_goods_quality.passed"
	FinishedGoodsQualityProcessCommandOutcomeRejected        = "finished_goods_quality.rejected"
	FinishedGoodsQualityProcessCommandOutcomeConcession      = "finished_goods_quality.concession_accepted"
	qualityInspectionProcessCommandBusinessRefType           = "purchase_receipt"
	finishedGoodsQualityProcessCommandBusinessRefType        = "shipment"
	qualityInspectionProcessCommandPayloadInspectionID       = "quality_inspection_id"
	qualityInspectionProcessCommandPayloadPurchaseReceiptID  = "purchase_receipt_id"
	qualityInspectionProcessCommandPayloadShipmentID         = "shipment_id"
	qualityInspectionProcessCommandPayloadFinishedGoodsLotID = "finished_goods_lot_id"
	qualityInspectionProcessCommandPayloadResult             = "result"
	qualityInspectionProcessCommandPayloadInspectedAt        = "inspected_at"
	qualityInspectionProcessCommandPayloadDecisionNote       = "decision_note"
)

type incomingQualityGateProcessCommandHandler struct {
	uc *InventoryUsecase
}

type finishedGoodsQualityDecideProcessCommandHandler struct {
	uc *InventoryUsecase
}

type QualityInspectionProcessCommandRepo interface {
	EvaluatePurchaseReceiptQualityGateForProcessCommand(ctx context.Context, receiptID int, command *ProcessDomainCommandInput, actorID int) (*PurchaseReceiptQualityGate, error)
	PassQualityInspectionForProcessCommand(ctx context.Context, decision *QualityInspectionDecision, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*QualityInspection, error)
	RejectQualityInspectionForProcessCommand(ctx context.Context, decision *QualityInspectionDecision, command *ProcessDomainCommandInput, result *ProcessDomainCommandResult, actorID int) (*QualityInspection, error)
}

func RegisterQualityInspectionProcessDomainCommandHandlers(processRuntimeUC *ProcessRuntimeUsecase, inventoryUC *InventoryUsecase) error {
	if processRuntimeUC == nil || inventoryUC == nil {
		return ErrBadParam
	}
	if err := processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandIncomingQualityGate,
		&incomingQualityGateProcessCommandHandler{uc: inventoryUC},
	); err != nil {
		return err
	}
	return processRuntimeUC.RegisterDomainCommandHandler(
		ProcessDomainCommandFinishedGoodsQualityDecide,
		&finishedGoodsQualityDecideProcessCommandHandler{uc: inventoryUC},
	)
}

func (h *incomingQualityGateProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandIncomingQualityGate {
		return ErrBadParam
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload, qualityInspectionProcessCommandPayloadPurchaseReceiptID); err != nil {
		return err
	}
	receiptID, hasReceiptID, err := processCommandPositiveIntFromPayload(in.Payload, qualityInspectionProcessCommandPayloadPurchaseReceiptID)
	if err != nil {
		return err
	}
	if !hasReceiptID || !ProcessInstanceHasBusinessRef(in.ProcessInstance, qualityInspectionProcessCommandBusinessRefType, receiptID) {
		return ErrBadParam
	}
	gate, err := h.uc.EvaluatePurchaseReceiptQualityGate(ctx, receiptID)
	if err != nil {
		return err
	}
	if gate == nil || gate.PurchaseReceiptID != receiptID || gate.TotalLines <= 0 {
		return ErrBadParam
	}
	if gate.Outcome == PurchaseReceiptQualityGatePending {
		return ErrPurchaseReceiptQualityPending
	}
	if gate.Outcome != PurchaseReceiptQualityGateReady && gate.Outcome != PurchaseReceiptQualityGateRejected {
		return ErrBadParam
	}
	return nil
}

func (h *incomingQualityGateProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	receiptID, _, _ := processCommandPositiveIntFromPayload(in.Payload, qualityInspectionProcessCommandPayloadPurchaseReceiptID)
	var gate *PurchaseReceiptQualityGate
	var err error
	if repo, ok := h.uc.repo.(QualityInspectionProcessCommandRepo); ok {
		gate, err = repo.EvaluatePurchaseReceiptQualityGateForProcessCommand(ctx, receiptID, in, actorID)
	} else {
		gate, err = h.uc.EvaluatePurchaseReceiptQualityGate(ctx, receiptID)
	}
	if err != nil {
		return nil, err
	}
	return IncomingQualityGateProcessCommandResult(gate)
}

func IncomingQualityGateProcessCommandResult(gate *PurchaseReceiptQualityGate) (*ProcessDomainCommandResult, error) {
	if gate == nil || gate.PurchaseReceiptID <= 0 || gate.TotalLines <= 0 {
		return nil, ErrBadParam
	}
	switch gate.Outcome {
	case PurchaseReceiptQualityGateReady:
		return &ProcessDomainCommandResult{Outcome: IncomingQualityGateProcessCommandOutcomePassed, EffectState: ProcessDomainCommandEffectStateNone}, nil
	case PurchaseReceiptQualityGateRejected:
		return &ProcessDomainCommandResult{
			Outcome:     IncomingQualityGateProcessCommandOutcomeRejected,
			BlockReason: "来料质检存在拒收行，采购入库流程已阻塞",
			EffectState: ProcessDomainCommandEffectStateNone,
		}, nil
	case PurchaseReceiptQualityGatePending:
		return nil, ErrPurchaseReceiptQualityPending
	default:
		return nil, ErrBadParam
	}
}

func (h *finishedGoodsQualityDecideProcessCommandHandler) ValidateProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) error {
	if h == nil || h.uc == nil || in == nil || in.ProcessInstance == nil {
		return ErrBadParam
	}
	if strings.TrimSpace(in.CommandKey) != ProcessDomainCommandFinishedGoodsQualityDecide {
		return ErrBadParam
	}
	if actorID <= 0 {
		return ErrBadParam
	}
	if err := validateProcessDomainCommandPayloadKeys(in.Payload,
		qualityInspectionProcessCommandPayloadShipmentID,
		qualityInspectionProcessCommandPayloadInspectionID,
		qualityInspectionProcessCommandPayloadFinishedGoodsLotID,
		qualityInspectionProcessCommandPayloadResult,
		qualityInspectionProcessCommandPayloadInspectedAt,
		qualityInspectionProcessCommandPayloadDecisionNote,
	); err != nil {
		return err
	}
	shipmentID, err := processCommandRequiredPositiveIntFromPayload(in.Payload, qualityInspectionProcessCommandPayloadShipmentID)
	if err != nil {
		return err
	}
	if !ProcessInstanceHasBusinessRef(in.ProcessInstance, finishedGoodsQualityProcessCommandBusinessRefType, shipmentID) {
		return ErrBadParam
	}
	inspectionID, err := qualityInspectionIDFromProcessCommandPayload(in.Payload)
	if err != nil {
		return err
	}
	result := strings.ToUpper(processCommandStringFromPayload(in.Payload, qualityInspectionProcessCommandPayloadResult))
	if !IsValidQualityInspectionResult(result) {
		return ErrBadParam
	}
	inspection, err := h.uc.GetQualityInspection(ctx, inspectionID)
	if err != nil {
		return err
	}
	if !isShipmentLinkedFinishedGoodsQualityInspection(inspection, shipmentID) {
		return ErrBadParam
	}
	payloadFinishedGoodsLotID, hasFinishedGoodsLotID, err := processCommandPositiveIntFromPayload(in.Payload, qualityInspectionProcessCommandPayloadFinishedGoodsLotID)
	if err != nil {
		return err
	}
	if hasFinishedGoodsLotID && payloadFinishedGoodsLotID != inspection.InventoryLotID {
		return ErrBadParam
	}
	inspectedAt, err := processCommandOptionalTimeFromPayload(in.Payload, qualityInspectionProcessCommandPayloadInspectedAt)
	if err != nil {
		return err
	}
	if inspection.Status == QualityInspectionStatusSubmitted {
		return nil
	}
	targetStatus := QualityInspectionStatusPassed
	if result == QualityInspectionResultReject {
		targetStatus = QualityInspectionStatusRejected
	}
	if inspection.Status != targetStatus || inspection.Result == nil || strings.TrimSpace(*inspection.Result) != result {
		return ErrIdempotencyConflict
	}
	if inspection.InspectorID == nil || *inspection.InspectorID != actorID {
		return ErrIdempotencyConflict
	}
	if !inspectedAt.IsZero() && (inspection.InspectedAt == nil || !inspection.InspectedAt.Equal(inspectedAt)) {
		return ErrIdempotencyConflict
	}
	if note := processCommandOptionalStringPtrFromPayload(in.Payload, qualityInspectionProcessCommandPayloadDecisionNote); note != nil {
		if inspection.DecisionNote == nil || strings.TrimSpace(*inspection.DecisionNote) != *note {
			return ErrIdempotencyConflict
		}
	}
	if inspectedAt.IsZero() && !finishedGoodsQualityProcessCommandHasCurrentClaim(in) {
		return ErrProcessDomainCommandRecoveryRequired
	}
	return nil
}

func finishedGoodsQualityProcessCommandHasCurrentClaim(in *ProcessDomainCommandInput) bool {
	if in == nil || in.ProcessInstance == nil || in.Node == nil ||
		in.Node.ProcessInstanceID != in.ProcessInstance.ID ||
		in.Node.NodeType != ProcessNodeTypeDomainCommand ||
		in.Node.Status != ProcessNodeStatusActive ||
		processDomainCommandKeyFromNode(in.Node) != ProcessDomainCommandFinishedGoodsQualityDecide ||
		in.Node.DomainCommandFingerprint == nil ||
		in.Node.DomainCommandProtocolVersion == nil ||
		*in.Node.DomainCommandProtocolVersion != ProcessDomainCommandProtocolVersionCurrent {
		return false
	}
	fingerprint, err := processDomainCommandFingerprint(in.CommandKey, in.IdempotencyKey, in.Payload)
	return err == nil && *in.Node.DomainCommandFingerprint == fingerprint
}

func (h *finishedGoodsQualityDecideProcessCommandHandler) ExecuteProcessDomainCommand(ctx context.Context, in *ProcessDomainCommandInput, actorID int) (*ProcessDomainCommandResult, error) {
	if err := h.ValidateProcessDomainCommand(ctx, in, actorID); err != nil {
		return nil, err
	}
	inspectionID, _ := qualityInspectionIDFromProcessCommandPayload(in.Payload)
	result := strings.ToUpper(processCommandStringFromPayload(in.Payload, qualityInspectionProcessCommandPayloadResult))
	inspectedAt, _ := processCommandOptionalTimeFromPayload(in.Payload, qualityInspectionProcessCommandPayloadInspectedAt)
	inspectorID := actorID
	decision := &QualityInspectionDecision{
		InspectionID: inspectionID,
		Result:       result,
		InspectedAt:  inspectedAt,
		InspectorID:  &inspectorID,
		DecisionNote: processCommandOptionalStringPtrFromPayload(in.Payload, qualityInspectionProcessCommandPayloadDecisionNote),
	}
	normalizedDecision, err := normalizeQualityInspectionDecision(*decision, result)
	if err != nil {
		return nil, err
	}
	decision = &normalizedDecision
	processResult := &ProcessDomainCommandResult{
		EffectState: ProcessDomainCommandEffectStateApplied,
		EffectRef:   &ProcessBusinessRef{RefType: "quality_inspection", RefID: inspectionID},
	}
	switch result {
	case QualityInspectionResultPass:
		processResult.Outcome = FinishedGoodsQualityProcessCommandOutcomePassed
		if repo, ok := h.uc.repo.(QualityInspectionProcessCommandRepo); ok {
			if _, err := repo.PassQualityInspectionForProcessCommand(ctx, decision, in, processResult, actorID); err != nil {
				return nil, err
			}
		} else if _, err := h.uc.PassQualityInspection(ctx, decision); err != nil {
			return nil, err
		}
		return processResult, nil
	case QualityInspectionResultConcession:
		processResult.Outcome = FinishedGoodsQualityProcessCommandOutcomeConcession
		if repo, ok := h.uc.repo.(QualityInspectionProcessCommandRepo); ok {
			if _, err := repo.PassQualityInspectionForProcessCommand(ctx, decision, in, processResult, actorID); err != nil {
				return nil, err
			}
		} else if _, err := h.uc.PassQualityInspection(ctx, decision); err != nil {
			return nil, err
		}
		return processResult, nil
	case QualityInspectionResultReject:
		processResult.Outcome = FinishedGoodsQualityProcessCommandOutcomeRejected
		if repo, ok := h.uc.repo.(QualityInspectionProcessCommandRepo); ok {
			if _, err := repo.RejectQualityInspectionForProcessCommand(ctx, decision, in, processResult, actorID); err != nil {
				return nil, err
			}
		} else if _, err := h.uc.RejectQualityInspection(ctx, decision); err != nil {
			return nil, err
		}
		return processResult, nil
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
