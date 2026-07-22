package biz

import (
	"context"
	"strings"
	"time"

	corestatus "server/internal/core/status"

	"github.com/shopspring/decimal"
)

const (
	QualityInspectionStatusDraft     = corestatus.QualityInspectionDraft
	QualityInspectionStatusSubmitted = corestatus.QualityInspectionSubmitted
	QualityInspectionStatusPassed    = corestatus.QualityInspectionPassed
	QualityInspectionStatusRejected  = corestatus.QualityInspectionRejected
	QualityInspectionStatusCancelled = corestatus.QualityInspectionCancelled

	QualityInspectionResultPass               = "PASS"
	QualityInspectionResultReject             = "REJECT"
	QualityInspectionResultConcession         = "CONCESSION"
	QualityInspectionDefectRateOperatorApprox = "APPROX"
	QualityInspectionDefectRateOperatorGT     = "GT"

	QualityInspectionSourcePurchaseReceipt = "PURCHASE_RECEIPT"
	QualityInspectionSourceShipment        = ShipmentSourceType
	QualityInspectionSourceOutsourcingFact = OutsourcingFactSourceType
	QualityInspectionSourceProductionWIP   = ProductionWIPQualitySourceType
	QualityInspectionSourceSalesReturn     = SalesReturnSourceType
	QualityInspectionTypeIncoming          = "INCOMING"
	QualityInspectionTypeFinishedGoods     = "FINISHED_GOODS"
	QualityInspectionTypeOutsourcingReturn = "OUTSOURCING_RETURN"
	QualityInspectionTypeProductionStage   = ProductionWIPQualityInspectionType
	QualityInspectionTypeCustomerReturn    = "CUSTOMER_RETURN"
	QualityInspectionSubjectMaterial       = "MATERIAL"
	QualityInspectionSubjectProduct        = InventorySubjectProduct
	QualityInspectionSubjectWIP            = ProductionWIPQualitySubjectType
)

var (
	qualityInspectionResults = map[string]struct{}{
		QualityInspectionResultPass:       {},
		QualityInspectionResultReject:     {},
		QualityInspectionResultConcession: {},
	}
	qualityInspectionDefectRateOperators = map[string]struct{}{
		QualityInspectionDefectRateOperatorApprox: {},
		QualityInspectionDefectRateOperatorGT:     {},
	}
)

type QualityInspection struct {
	ID                       int
	InspectionNo             string
	PurchaseReceiptID        int
	PurchaseReceiptItemID    *int
	InventoryLotID           int
	ProductionWIPBatchID     *int
	GateCode                 *string
	MaterialID               int
	WarehouseID              int
	SourceType               *string
	SourceID                 *int
	SourceNo                 *string
	InspectionType           *string
	SubjectType              *string
	SubjectID                *int
	Status                   string
	Result                   *string
	OriginalLotStatus        string
	InspectedAt              *time.Time
	InspectorID              *int
	DefectRateOperator       *string
	DefectRatePercent        *decimal.Decimal
	DecisionNote             *string
	CorrectionOfInspectionID *int
	SupersededAt             *time.Time
	SupersededBy             *int
	SupersededReason         *string
	// Production-stage list projections are resolved from the immutable route
	// snapshot and WIP batch. They are read-only display fields, not quality
	// decision inputs.
	ProductionOrderNo     *string
	ProductionOrderItemID *int
	ProductCode           *string
	ProductName           *string
	OperationCode         *string
	OperationName         *string
	WIPBatchNo            *string
	BatchQuantity         *decimal.Decimal
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

type QualityInspectionCreate struct {
	InspectionNo          string
	PurchaseReceiptID     int
	PurchaseReceiptItemID *int
	InventoryLotID        int
	ProductionWIPBatchID  int
	GateCode              string
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

// QualityInspectionFromPurchaseReceiptCreate contains only operator-owned
// fields. Material, warehouse, lot and source anchors are derived from the
// locked purchase receipt item.
type QualityInspectionFromPurchaseReceiptCreate struct {
	InspectionNo          string
	PurchaseReceiptID     int
	PurchaseReceiptItemID int
	DecisionNote          *string
}

// QualityInspectionFromOutsourcingReturnCreate contains only operator-owned
// fields. Product, warehouse, lot and source anchors are derived from the
// locked posted outsourcing return fact.
type QualityInspectionFromOutsourcingReturnCreate struct {
	InspectionNo      string
	OutsourcingFactID int
	DecisionNote      *string
}

type QualityInspectionDecision struct {
	InspectionID int
	Result       string
	InspectedAt  time.Time
	// InspectedAtDefaulted means the input omitted inspected_at and this value was generated locally.
	InspectedAtDefaulted bool
	InspectorID          *int
	DefectRateOperator   *string
	DefectRatePercent    *decimal.Decimal
	DecisionNote         *string
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
	ProductionWIPBatchID  int
	GateCode              string
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

const (
	PurchaseReceiptQualityGateReady    = "READY"
	PurchaseReceiptQualityGatePending  = "PENDING"
	PurchaseReceiptQualityGateRejected = "REJECTED"
)

// PurchaseReceiptQualityGate is a read model over line-level incoming quality
// facts. It does not decide inspections and does not write inventory facts.
type PurchaseReceiptQualityGate struct {
	PurchaseReceiptID int
	Outcome           string
	TotalLines        int
	PassedLines       int
	PendingLineIDs    []int
	RejectedLineIDs   []int
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

func (uc *InventoryUsecase) CreateQualityInspectionFromPurchaseReceipt(ctx context.Context, in *QualityInspectionFromPurchaseReceiptCreate) (*QualityInspection, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized := *in
	normalized.InspectionNo = strings.TrimSpace(normalized.InspectionNo)
	normalized.DecisionNote = normalizeOptionalString(normalized.DecisionNote)
	if normalized.InspectionNo == "" || normalized.PurchaseReceiptID <= 0 || normalized.PurchaseReceiptItemID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(QualityInspectionSourceRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.CreateQualityInspectionFromPurchaseReceipt(ctx, &normalized)
}

func (uc *InventoryUsecase) CreateQualityInspectionFromOutsourcingReturn(ctx context.Context, in *QualityInspectionFromOutsourcingReturnCreate) (*QualityInspection, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized := *in
	normalized.InspectionNo = strings.TrimSpace(normalized.InspectionNo)
	normalized.DecisionNote = normalizeOptionalString(normalized.DecisionNote)
	if normalized.InspectionNo == "" || normalized.OutsourcingFactID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(QualityInspectionSourceRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return repo.CreateQualityInspectionFromOutsourcingReturn(ctx, &normalized)
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

func (uc *InventoryUsecase) ListOutsourcingReturnQualityInspections(ctx context.Context, filter QualityInspectionFilter) ([]*QualityInspection, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeOutsourcingReturnQualityInspectionFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListQualityInspections(ctx, normalized)
}

func (uc *InventoryUsecase) ListProductionStageQualityInspections(ctx context.Context, filter QualityInspectionFilter) ([]*QualityInspection, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeProductionStageQualityInspectionFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListQualityInspections(ctx, normalized)
}

func (uc *InventoryUsecase) EvaluatePurchaseReceiptQualityGate(ctx context.Context, receiptID int) (*PurchaseReceiptQualityGate, error) {
	if uc == nil || uc.repo == nil || receiptID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.EvaluatePurchaseReceiptQualityGate(ctx, receiptID)
}

func IsValidQualityInspectionStatus(value string) bool {
	return corestatus.IsQualityInspectionStatus(value)
}

func IsValidQualityInspectionResult(value string) bool {
	_, ok := qualityInspectionResults[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

func IsValidQualityInspectionDefectRateOperator(value string) bool {
	_, ok := qualityInspectionDefectRateOperators[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}

// NormalizeQualityInspectionDefectRate keeps the approximate defect-rate pair
// canonical across direct decisions, process-command fingerprints and storage.
// required is applied only when a new SUBMITTED inspection is being decided;
// terminal historical rows may legitimately have no pair.
func NormalizeQualityInspectionDefectRate(operator *string, percent *decimal.Decimal, required bool) (*string, *decimal.Decimal, error) {
	if operator == nil && percent == nil {
		if required {
			return nil, nil, ErrBadParam
		}
		return nil, nil, nil
	}
	if operator == nil || percent == nil {
		return nil, nil, ErrBadParam
	}
	normalizedOperator := strings.ToUpper(strings.TrimSpace(*operator))
	if !IsValidQualityInspectionDefectRateOperator(normalizedOperator) {
		return nil, nil, ErrBadParam
	}
	normalizedPercent, err := decimal.NewFromString(percent.String())
	if err != nil || normalizedPercent.IsNegative() || normalizedPercent.GreaterThan(decimal.NewFromInt(100)) ||
		!normalizedPercent.Equal(normalizedPercent.Truncate(6)) ||
		(normalizedOperator == QualityInspectionDefectRateOperatorGT && !normalizedPercent.LessThan(decimal.NewFromInt(100))) {
		return nil, nil, ErrBadParam
	}
	return &normalizedOperator, &normalizedPercent, nil
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
	defectRateOperator, defectRatePercent, err := NormalizeQualityInspectionDefectRate(in.DefectRateOperator, in.DefectRatePercent, false)
	if err != nil {
		return QualityInspectionDecision{}, err
	}
	in.DefectRateOperator = defectRateOperator
	in.DefectRatePercent = defectRatePercent
	if in.InspectionID <= 0 || !IsValidQualityInspectionResult(in.Result) {
		return QualityInspectionDecision{}, ErrBadParam
	}
	if in.InspectedAt.IsZero() {
		in.InspectedAtDefaulted = true
		in.InspectedAt = time.Now()
	}
	in.InspectedAt = in.InspectedAt.UTC().Truncate(time.Microsecond)
	return in, nil
}

func normalizeQualityInspectionFilter(in QualityInspectionFilter) (QualityInspectionFilter, error) {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.Result = strings.ToUpper(strings.TrimSpace(in.Result))
	in.SourceType = strings.ToUpper(strings.TrimSpace(in.SourceType))
	in.InspectionType = strings.ToUpper(strings.TrimSpace(in.InspectionType))
	in.SubjectType = strings.ToUpper(strings.TrimSpace(in.SubjectType))
	in.GateCode = strings.ToUpper(strings.TrimSpace(in.GateCode))
	in.Keyword = strings.TrimSpace(in.Keyword)
	if in.Status != "" && !IsValidQualityInspectionStatus(in.Status) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.Result != "" && !IsValidQualityInspectionResult(in.Result) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.SourceType == "" {
		in.SourceType = QualityInspectionSourcePurchaseReceipt
	}
	if in.InspectionType == "" {
		in.InspectionType = QualityInspectionTypeIncoming
	}
	if in.SubjectType == "" {
		in.SubjectType = QualityInspectionSubjectMaterial
	}
	if in.SourceType != QualityInspectionSourcePurchaseReceipt {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.InspectionType != QualityInspectionTypeIncoming {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.SubjectType != QualityInspectionSubjectMaterial {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.ProductionWIPBatchID > 0 || in.GateCode != "" {
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

func normalizeOutsourcingReturnQualityInspectionFilter(in QualityInspectionFilter) (QualityInspectionFilter, error) {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.Result = strings.ToUpper(strings.TrimSpace(in.Result))
	in.Keyword = strings.TrimSpace(in.Keyword)
	if in.Status != "" && !IsValidQualityInspectionStatus(in.Status) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.Result != "" && !IsValidQualityInspectionResult(in.Result) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.PurchaseReceiptID > 0 || in.PurchaseReceiptItemID > 0 || in.PurchaseOrderID > 0 || in.MaterialID > 0 {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	in.SourceType = QualityInspectionSourceOutsourcingFact
	in.InspectionType = QualityInspectionTypeOutsourcingReturn
	in.SubjectType = QualityInspectionSubjectProduct
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}

func normalizeProductionStageQualityInspectionFilter(in QualityInspectionFilter) (QualityInspectionFilter, error) {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.Result = strings.ToUpper(strings.TrimSpace(in.Result))
	in.GateCode = strings.ToUpper(strings.TrimSpace(in.GateCode))
	in.Keyword = strings.TrimSpace(in.Keyword)
	if in.Status != "" && !IsValidQualityInspectionStatus(in.Status) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.Result != "" && !IsValidQualityInspectionResult(in.Result) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.GateCode != "" && !isProductionWIPQualityGate(in.GateCode) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.PurchaseReceiptID > 0 || in.PurchaseReceiptItemID > 0 || in.PurchaseOrderID > 0 ||
		in.InventoryLotID > 0 || in.MaterialID > 0 || in.WarehouseID > 0 || in.SubjectID > 0 {
		return QualityInspectionFilter{}, ErrBadParam
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return QualityInspectionFilter{}, ErrBadParam
	}
	in.SourceType = QualityInspectionSourceProductionWIP
	in.InspectionType = QualityInspectionTypeProductionStage
	in.SubjectType = QualityInspectionSubjectWIP
	if in.ProductionWIPBatchID > 0 {
		in.SourceID = in.ProductionWIPBatchID
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}
