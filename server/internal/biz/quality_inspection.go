package biz

import (
	"context"
	"strings"
	"time"

	corestatus "server/internal/core/status"
)

const (
	QualityInspectionStatusDraft     = corestatus.QualityInspectionDraft
	QualityInspectionStatusSubmitted = corestatus.QualityInspectionSubmitted
	QualityInspectionStatusPassed    = corestatus.QualityInspectionPassed
	QualityInspectionStatusRejected  = corestatus.QualityInspectionRejected
	QualityInspectionStatusCancelled = corestatus.QualityInspectionCancelled

	QualityInspectionResultPass       = "PASS"
	QualityInspectionResultReject     = "REJECT"
	QualityInspectionResultConcession = "CONCESSION"

	QualityInspectionSourcePurchaseReceipt = "PURCHASE_RECEIPT"
	QualityInspectionSourceShipment        = ShipmentSourceType
	QualityInspectionTypeIncoming          = "INCOMING"
	QualityInspectionTypeFinishedGoods     = "FINISHED_GOODS"
	QualityInspectionSubjectMaterial       = "MATERIAL"
	QualityInspectionSubjectProduct        = InventorySubjectProduct
)

var (
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
	SourceType            *string
	SourceID              *int
	InspectionType        *string
	SubjectType           *string
	SubjectID             *int
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
	SourceType            string
	SourceID              int
	InspectionType        string
	SubjectType           string
	SubjectID             int
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

type QualityInspectionFilter struct {
	Status                string
	Result                string
	Keyword               string
	DateFrom              *time.Time
	DateTo                *time.Time
	PurchaseReceiptID     int
	PurchaseReceiptItemID int
	PurchaseOrderID       int
	InventoryLotID        int
	MaterialID            int
	WarehouseID           int
	SourceType            string
	SourceID              int
	InspectionType        string
	SubjectType           string
	SubjectID             int
	Limit                 int
	Offset                int
}

func (uc *InventoryUsecase) CreateQualityInspectionDraft(ctx context.Context, in *QualityInspectionCreate) (*QualityInspection, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeIncomingQualityInspectionCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateQualityInspectionDraft(ctx, &normalized)
}

func (uc *InventoryUsecase) CreateFinishedGoodsQualityInspectionDraft(ctx context.Context, in *QualityInspectionCreate) (*QualityInspection, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeFinishedGoodsQualityInspectionCreate(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateFinishedGoodsQualityInspectionDraft(ctx, &normalized)
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

func (uc *InventoryUsecase) ListQualityInspections(ctx context.Context, filter QualityInspectionFilter) ([]*QualityInspection, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeQualityInspectionFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListQualityInspections(ctx, normalized)
}

func (uc *InventoryUsecase) ListFinishedGoodsQualityInspections(ctx context.Context, filter QualityInspectionFilter) ([]*QualityInspection, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeFinishedGoodsQualityInspectionFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListQualityInspections(ctx, normalized)
}

func IsValidQualityInspectionStatus(value string) bool {
	return corestatus.IsQualityInspectionStatus(value)
}

func IsValidQualityInspectionResult(value string) bool {
	_, ok := qualityInspectionResults[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func normalizeQualityInspectionCreateBase(in QualityInspectionCreate) QualityInspectionCreate {
	in.InspectionNo = strings.TrimSpace(in.InspectionNo)
	in.SourceType = strings.ToUpper(strings.TrimSpace(in.SourceType))
	in.InspectionType = strings.ToUpper(strings.TrimSpace(in.InspectionType))
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.DecisionNote = normalizeOptionalString(in.DecisionNote)
	if in.PurchaseReceiptItemID != nil && *in.PurchaseReceiptItemID <= 0 {
		in.PurchaseReceiptItemID = nil
	}
	if in.InspectorID != nil && *in.InspectorID <= 0 {
		in.InspectorID = nil
	}
	return in
}

func normalizeIncomingQualityInspectionCreate(in QualityInspectionCreate) (QualityInspectionCreate, error) {
	in = normalizeQualityInspectionCreateBase(in)
	if in.InspectionNo == "" ||
		in.PurchaseReceiptID <= 0 ||
		in.InventoryLotID <= 0 ||
		in.MaterialID <= 0 ||
		in.WarehouseID <= 0 {
		return QualityInspectionCreate{}, ErrBadParam
	}
	if in.SourceType == "" {
		in.SourceType = QualityInspectionSourcePurchaseReceipt
	}
	if in.SourceID <= 0 {
		in.SourceID = in.PurchaseReceiptID
	}
	if in.InspectionType == "" {
		in.InspectionType = QualityInspectionTypeIncoming
	}
	if in.SubjectType == "" {
		in.SubjectType = QualityInspectionSubjectMaterial
	}
	if in.SubjectID <= 0 {
		in.SubjectID = in.MaterialID
	}
	if in.SourceType != QualityInspectionSourcePurchaseReceipt ||
		in.SourceID != in.PurchaseReceiptID ||
		in.InspectionType != QualityInspectionTypeIncoming ||
		in.SubjectType != QualityInspectionSubjectMaterial ||
		in.SubjectID != in.MaterialID {
		return QualityInspectionCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizeFinishedGoodsQualityInspectionCreate(in QualityInspectionCreate) (QualityInspectionCreate, error) {
	in = normalizeQualityInspectionCreateBase(in)
	if in.InspectionNo == "" ||
		in.SourceID <= 0 ||
		in.InventoryLotID <= 0 ||
		in.WarehouseID <= 0 ||
		in.SubjectID <= 0 {
		return QualityInspectionCreate{}, ErrBadParam
	}
	if in.SourceType == "" {
		in.SourceType = QualityInspectionSourceShipment
	}
	if in.InspectionType == "" {
		in.InspectionType = QualityInspectionTypeFinishedGoods
	}
	if in.SubjectType == "" {
		in.SubjectType = QualityInspectionSubjectProduct
	}
	if in.SourceType != QualityInspectionSourceShipment ||
		in.InspectionType != QualityInspectionTypeFinishedGoods ||
		in.SubjectType != QualityInspectionSubjectProduct {
		return QualityInspectionCreate{}, ErrBadParam
	}
	in.PurchaseReceiptID = 0
	in.PurchaseReceiptItemID = nil
	in.MaterialID = 0
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

func normalizeQualityInspectionFilter(in QualityInspectionFilter) (QualityInspectionFilter, error) {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.Result = strings.ToUpper(strings.TrimSpace(in.Result))
	in.SourceType = strings.ToUpper(strings.TrimSpace(in.SourceType))
	in.InspectionType = strings.ToUpper(strings.TrimSpace(in.InspectionType))
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.Keyword = strings.TrimSpace(in.Keyword)
	if in.Status != "" && !IsValidQualityInspectionStatus(in.Status) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.Result != "" && !IsValidQualityInspectionResult(in.Result) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.SourceType != "" && in.SourceType != QualityInspectionSourcePurchaseReceipt {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.InspectionType != "" && in.InspectionType != QualityInspectionTypeIncoming {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.SubjectType != "" && in.SubjectType != QualityInspectionSubjectMaterial {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}

func normalizeFinishedGoodsQualityInspectionFilter(in QualityInspectionFilter) (QualityInspectionFilter, error) {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.Result = strings.ToUpper(strings.TrimSpace(in.Result))
	in.SourceType = strings.ToUpper(strings.TrimSpace(in.SourceType))
	in.InspectionType = strings.ToUpper(strings.TrimSpace(in.InspectionType))
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.Keyword = strings.TrimSpace(in.Keyword)
	if in.Status != "" && !IsValidQualityInspectionStatus(in.Status) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.Result != "" && !IsValidQualityInspectionResult(in.Result) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.SourceType == "" {
		in.SourceType = QualityInspectionSourceShipment
	}
	if in.InspectionType == "" {
		in.InspectionType = QualityInspectionTypeFinishedGoods
	}
	if in.SubjectType == "" {
		in.SubjectType = QualityInspectionSubjectProduct
	}
	if in.SourceType != QualityInspectionSourceShipment ||
		in.InspectionType != QualityInspectionTypeFinishedGoods ||
		in.SubjectType != QualityInspectionSubjectProduct {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.PurchaseReceiptID > 0 || in.PurchaseReceiptItemID > 0 || in.PurchaseOrderID > 0 || in.MaterialID > 0 {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}
