package biz

import (
	"context"
	"strings"
	"time"
)

const (
	QualityInspectionStatusDraft     = "DRAFT"
	QualityInspectionStatusSubmitted = "SUBMITTED"
	QualityInspectionStatusPassed    = "PASSED"
	QualityInspectionStatusRejected  = "REJECTED"
	QualityInspectionStatusCancelled = "CANCELLED"

	QualityInspectionResultPass       = "PASS"
	QualityInspectionResultReject     = "REJECT"
	QualityInspectionResultConcession = "CONCESSION"
)

var (
	qualityInspectionStatuses = map[string]struct{}{
		QualityInspectionStatusDraft:     {},
		QualityInspectionStatusSubmitted: {},
		QualityInspectionStatusPassed:    {},
		QualityInspectionStatusRejected:  {},
		QualityInspectionStatusCancelled: {},
	}
	qualityInspectionResults = map[string]struct{}{
		QualityInspectionResultPass:       {},
		QualityInspectionResultReject:     {},
		QualityInspectionResultConcession: {},
	}
)

type QualityInspection struct {
	ID                    int
	InspectionNo          string
	PurchaseReceiptID     int
	PurchaseReceiptItemID *int
	InventoryLotID        int
	MaterialID            int
	WarehouseID           int
	Status                string
	Result                *string
	OriginalLotStatus     string
	InspectedAt           *time.Time
	InspectorID           *int
	DecisionNote          *string
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

type QualityInspectionCreate struct {
	InspectionNo          string
	PurchaseReceiptID     int
	PurchaseReceiptItemID *int
	InventoryLotID        int
	MaterialID            int
	WarehouseID           int
	InspectorID           *int
	DecisionNote          *string
}

type QualityInspectionDecision struct {
	InspectionID int
	Result       string
	InspectedAt  time.Time
	InspectorID  *int
	DecisionNote *string
}

func (uc *InventoryUsecase) CreateQualityInspectionDraft(ctx context.Context, in *QualityInspectionCreate) (*QualityInspection, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeQualityInspectionCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateQualityInspectionDraft(ctx, &normalized)
}

func (uc *InventoryUsecase) SubmitQualityInspection(ctx context.Context, inspectionID int) (*QualityInspection, error) {
	if uc == nil || uc.repo == nil || inspectionID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.SubmitQualityInspection(ctx, inspectionID)
}

func (uc *InventoryUsecase) PassQualityInspection(ctx context.Context, in *QualityInspectionDecision) (*QualityInspection, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeQualityInspectionDecision(*in, QualityInspectionResultPass)
	if err != nil {
		return nil, err
	}
	if normalized.Result != QualityInspectionResultPass && normalized.Result != QualityInspectionResultConcession {
		return nil, ErrBadParam
	}
	return uc.repo.PassQualityInspection(ctx, &normalized)
}

func (uc *InventoryUsecase) RejectQualityInspection(ctx context.Context, in *QualityInspectionDecision) (*QualityInspection, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeQualityInspectionDecision(*in, QualityInspectionResultReject)
	if err != nil {
		return nil, err
	}
	if normalized.Result != QualityInspectionResultReject {
		return nil, ErrBadParam
	}
	return uc.repo.RejectQualityInspection(ctx, &normalized)
}

func (uc *InventoryUsecase) CancelQualityInspection(ctx context.Context, inspectionID int, decisionNote *string) (*QualityInspection, error) {
	if uc == nil || uc.repo == nil || inspectionID <= 0 {
		return nil, ErrBadParam
	}
	decisionNote = normalizeOptionalString(decisionNote)
	return uc.repo.CancelQualityInspection(ctx, inspectionID, decisionNote)
}

func (uc *InventoryUsecase) GetQualityInspection(ctx context.Context, id int) (*QualityInspection, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetQualityInspection(ctx, id)
}

func IsValidQualityInspectionStatus(value string) bool {
	_, ok := qualityInspectionStatuses[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func IsValidQualityInspectionResult(value string) bool {
	_, ok := qualityInspectionResults[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func normalizeQualityInspectionCreate(in QualityInspectionCreate) (QualityInspectionCreate, error) {
	in.InspectionNo = strings.TrimSpace(in.InspectionNo)
	in.DecisionNote = normalizeOptionalString(in.DecisionNote)
	if in.PurchaseReceiptItemID != nil && *in.PurchaseReceiptItemID <= 0 {
		in.PurchaseReceiptItemID = nil
	}
	if in.InspectorID != nil && *in.InspectorID <= 0 {
		in.InspectorID = nil
	}
	if in.InspectionNo == "" ||
		in.PurchaseReceiptID <= 0 ||
		in.InventoryLotID <= 0 ||
		in.MaterialID <= 0 ||
		in.WarehouseID <= 0 {
		return QualityInspectionCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizeQualityInspectionDecision(in QualityInspectionDecision, defaultResult string) (QualityInspectionDecision, error) {
	in.Result = strings.ToUpper(strings.TrimSpace(in.Result))
	if in.Result == "" {
		in.Result = defaultResult
	}
	in.DecisionNote = normalizeOptionalString(in.DecisionNote)
	if in.InspectorID != nil && *in.InspectorID <= 0 {
		in.InspectorID = nil
	}
	if in.InspectionID <= 0 || !IsValidQualityInspectionResult(in.Result) {
		return QualityInspectionDecision{}, ErrBadParam
	}
	if in.InspectedAt.IsZero() {
		in.InspectedAt = time.Now()
	}
	return in, nil
}
