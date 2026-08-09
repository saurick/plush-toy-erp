package biz

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

const (
	ReworkIntakeSourceType      = "REWORK_INTAKE"
	ReworkIntakeStatusDraft     = "DRAFT"
	ReworkIntakeStatusReceived  = "RECEIVED"
	ReworkIntakeStatusCancelled = "CANCELLED"
	ReworkIntakeStatusReversed  = "REVERSED"

	ReworkIntakeStageWaitingReceive = "WAITING_RECEIVE"
	ReworkIntakeStageWaitingRework  = "WAITING_REWORK"
	ReworkIntakeStageReworking      = "REWORKING"
	ReworkIntakeStageWaitingReship  = "WAITING_RESHIP"
	ReworkIntakeStageReshipped      = "RESHIPPED"
	ReworkIntakeStageClosed         = "CLOSED"
)

type ReworkIntake struct {
	ID                     int
	IntakeNo               string
	SourceShipmentID       int
	SourceShipmentNo       string
	CustomerID             int
	CustomerSnapshot       string
	Status                 string
	ProgressStage          string
	Reason                 string
	IdempotencyKey         string
	IdempotencyPayloadHash string
	Version                int
	ReceivedAt             *time.Time
	ReceivedBy             *int
	CancelledAt            *time.Time
	CancelledBy            *int
	CancelReason           *string
	ReversedAt             *time.Time
	ReversedBy             *int
	ReverseReason          *string
	CreatedBy              int
	CreatedAt              time.Time
	UpdatedAt              time.Time
	Items                  []*ReworkIntakeItem
}

type ReworkIntakeItem struct {
	ID                          int
	ReworkIntakeID              int
	LineNo                      string
	SourceShipmentItemID        int
	TargetProductionOrderID     int
	TargetProductionOrderNo     string
	TargetProductionOrderItemID int
	ProductID                   int
	ProductCode                 string
	ProductName                 string
	ProductSkuID                *int
	ProductSkuCode              *string
	ProductSkuName              *string
	ReceivingWarehouseID        int
	ReceivingWarehouseCode      string
	ReceivingWarehouseName      string
	UnitID                      int
	UnitCode                    string
	UnitName                    string
	ReceivedLotID               *int
	ReceivedLotNo               *string
	Quantity                    decimal.Decimal
	SourceShippedQuantity       decimal.Decimal
	ActiveIntakeQuantity        decimal.Decimal
	RemainingIntakeQuantity     decimal.Decimal
	ActiveReworkQuantity        decimal.Decimal
	CompletedQuantity           decimal.Decimal
	ActiveReshipmentQuantity    decimal.Decimal
	ReshippedQuantity           decimal.Decimal
	ProgressStage               string
	Note                        *string
	CompletionCandidates        []*ReworkCompletionCandidate
}

type ReworkCompletionCandidate struct {
	ProductionFactID     int
	ProductionFactNo     string
	WarehouseID          int
	LotID                int
	LotNo                string
	CompletedQuantity    decimal.Decimal
	ActiveReshipQuantity decimal.Decimal
	RemainingQuantity    decimal.Decimal
	Selectable           bool
	DisabledReason       *string
}

type ReworkIntakeCreate struct {
	IntakeNo         string
	SourceShipmentID int
	Reason           string
	IdempotencyKey   string
	Items            []ReworkIntakeItemCreate
}

type ReworkIntakeDraftSave struct {
	ID               int
	ExpectedVersion  int
	IntakeNo         string
	SourceShipmentID int
	Reason           string
	Items            []ReworkIntakeItemCreate
}

type ReworkIntakeItemCreate struct {
	SourceShipmentItemID        int
	TargetProductionOrderItemID int
	Quantity                    decimal.Decimal
	Note                        *string
}

type ReworkIntakeTransition struct {
	ID              int
	ExpectedVersion int
	Reason          string
}

type ReworkIntakeFilter struct {
	Status           string
	SourceShipmentID int
	CustomerID       int
	Keyword          string
	Limit            int
	Offset           int
}

type ReworkIntakeSourceCandidateFilter struct {
	Keyword                    string
	SourceShipmentID           int
	EditingReworkIntakeDraftID int
	Limit                      int
	Offset                     int
}

type ReworkIntakeSourceCandidate struct {
	SourceShipmentID            int
	SourceShipmentNo            string
	CustomerID                  int
	CustomerSnapshot            string
	SourceShipmentItemID        int
	SalesOrderItemID            int
	TargetProductionOrderID     int
	TargetProductionOrderNo     string
	TargetProductionOrderItemID int
	ProductID                   int
	ProductCode                 string
	ProductName                 string
	ProductSkuID                *int
	ProductSkuCode              *string
	ProductSkuName              *string
	WarehouseID                 int
	WarehouseCode               string
	WarehouseName               string
	UnitID                      int
	UnitCode                    string
	UnitName                    string
	ShippedQuantity             decimal.Decimal
	ActiveIntakeQuantity        decimal.Decimal
	RemainingIntakeQuantity     decimal.Decimal
	Selectable                  bool
	DisabledReason              *string
}

type ProductionReworkFromIntakeCreate struct {
	FactNo              string
	ReworkIntakeItemID  int
	Quantity            decimal.Decimal
	IdempotencyKey      string
	OccurredAt          time.Time
	OccurredAtSpecified bool
	Reason              string
}

type ReworkReshipmentItemCreate struct {
	ReworkCompletionFactID int
	Quantity               decimal.Decimal
	Note                   *string
}

type ReworkReshipmentCreate struct {
	ShipmentNo     string
	ReworkIntakeID int
	IdempotencyKey string
	PlannedShipAt  *time.Time
	Note           *string
	Items          []ReworkReshipmentItemCreate
}

type ReworkIntakeRepo interface {
	CreateReworkIntake(ctx context.Context, in *ReworkIntakeCreate, actorID int, payloadHash string) (*ReworkIntake, error)
	SaveReworkIntakeDraft(ctx context.Context, in *ReworkIntakeDraftSave) (*ReworkIntake, error)
	ReceiveReworkIntake(ctx context.Context, in *ReworkIntakeTransition, actorID int) (*ReworkIntake, error)
	CancelReworkIntake(ctx context.Context, in *ReworkIntakeTransition, actorID int) (*ReworkIntake, error)
	ReverseReworkIntake(ctx context.Context, in *ReworkIntakeTransition, actorID int) (*ReworkIntake, error)
	GetReworkIntake(ctx context.Context, id int) (*ReworkIntake, error)
	ListReworkIntakes(ctx context.Context, filter ReworkIntakeFilter) ([]*ReworkIntake, int, error)
	ListReworkIntakeSourceCandidates(ctx context.Context, filter ReworkIntakeSourceCandidateFilter) ([]*ReworkIntakeSourceCandidate, int, error)
	CreateProductionReworkFromIntake(ctx context.Context, in *ProductionReworkFromIntakeCreate) (*ProductionFact, error)
	CreateReworkReshipment(ctx context.Context, in *ReworkReshipmentCreate) (*Shipment, error)
}

func (uc *OperationalFactUsecase) CreateReworkIntake(ctx context.Context, in *ReworkIntakeCreate, actorID int) (*ReworkIntake, error) {
	repo, ok := uc.reworkIntakeRepo()
	if !ok || in == nil || actorID <= 0 {
		return nil, ErrBadParam
	}
	normalized, hash, err := normalizeReworkIntakeCreate(*in)
	if err != nil {
		return nil, err
	}
	return repo.CreateReworkIntake(ctx, &normalized, actorID, hash)
}

func (uc *OperationalFactUsecase) SaveReworkIntakeDraft(ctx context.Context, in *ReworkIntakeDraftSave, actorID int) (*ReworkIntake, error) {
	repo, ok := uc.reworkIntakeRepo()
	if !ok || in == nil || actorID <= 0 {
		return nil, ErrBadParam
	}
	normalized, err := normalizeReworkIntakeDraftSave(*in)
	if err != nil {
		return nil, err
	}
	return repo.SaveReworkIntakeDraft(ctx, &normalized)
}

func (uc *OperationalFactUsecase) ReceiveReworkIntake(ctx context.Context, in *ReworkIntakeTransition, actorID int) (*ReworkIntake, error) {
	repo, ok := uc.reworkIntakeRepo()
	if !ok || !validReworkIntakeTransition(in, actorID, false) {
		return nil, ErrBadParam
	}
	return repo.ReceiveReworkIntake(ctx, in, actorID)
}

func (uc *OperationalFactUsecase) CancelReworkIntake(ctx context.Context, in *ReworkIntakeTransition, actorID int) (*ReworkIntake, error) {
	repo, ok := uc.reworkIntakeRepo()
	if !ok || !validReworkIntakeTransition(in, actorID, true) {
		return nil, ErrBadParam
	}
	in.Reason = strings.TrimSpace(in.Reason)
	return repo.CancelReworkIntake(ctx, in, actorID)
}

func (uc *OperationalFactUsecase) ReverseReworkIntake(ctx context.Context, in *ReworkIntakeTransition, actorID int) (*ReworkIntake, error) {
	repo, ok := uc.reworkIntakeRepo()
	if !ok || !validReworkIntakeTransition(in, actorID, true) {
		return nil, ErrBadParam
	}
	in.Reason = strings.TrimSpace(in.Reason)
	return repo.ReverseReworkIntake(ctx, in, actorID)
}

func (uc *OperationalFactUsecase) GetReworkIntake(ctx context.Context, id int) (*ReworkIntake, error) {
	repo, ok := uc.reworkIntakeRepo()
	if !ok || id <= 0 {
		return nil, ErrBadParam
	}
	return repo.GetReworkIntake(ctx, id)
}

func (uc *OperationalFactUsecase) ListReworkIntakes(ctx context.Context, filter ReworkIntakeFilter) ([]*ReworkIntake, int, error) {
	repo, ok := uc.reworkIntakeRepo()
	if !ok {
		return nil, 0, ErrBadParam
	}
	filter = normalizeReworkIntakeFilter(filter)
	switch filter.Status {
	case "", ReworkIntakeStatusDraft, ReworkIntakeStatusReceived, ReworkIntakeStatusCancelled, ReworkIntakeStatusReversed:
	default:
		return nil, 0, ErrBadParam
	}
	return repo.ListReworkIntakes(ctx, filter)
}

func (uc *OperationalFactUsecase) ListReworkIntakeSourceCandidates(ctx context.Context, filter ReworkIntakeSourceCandidateFilter) ([]*ReworkIntakeSourceCandidate, int, error) {
	repo, ok := uc.reworkIntakeRepo()
	if !ok || filter.SourceShipmentID < 0 || filter.EditingReworkIntakeDraftID < 0 || filter.Offset < 0 {
		return nil, 0, ErrBadParam
	}
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	if filter.Limit <= 0 || filter.Limit > 200 {
		filter.Limit = 50
	}
	return repo.ListReworkIntakeSourceCandidates(ctx, filter)
}

func (uc *OperationalFactUsecase) CreateProductionReworkFromIntake(ctx context.Context, in *ProductionReworkFromIntakeCreate) (*ProductionFact, error) {
	repo, ok := uc.reworkIntakeRepo()
	if !ok || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductionReworkFromIntakeCreate(*in)
	if err != nil {
		return nil, err
	}
	return repo.CreateProductionReworkFromIntake(ctx, &normalized)
}

func (uc *OperationalFactUsecase) CreateReworkReshipment(ctx context.Context, in *ReworkReshipmentCreate) (*Shipment, error) {
	repo, ok := uc.reworkIntakeRepo()
	if !ok || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeReworkReshipmentCreate(*in)
	if err != nil {
		return nil, err
	}
	return repo.CreateReworkReshipment(ctx, &normalized)
}

func (uc *OperationalFactUsecase) reworkIntakeRepo() (ReworkIntakeRepo, bool) {
	if uc == nil || uc.repo == nil {
		return nil, false
	}
	repo, ok := uc.repo.(ReworkIntakeRepo)
	return repo, ok
}

func validReworkIntakeTransition(in *ReworkIntakeTransition, actorID int, requireReason bool) bool {
	if in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || actorID <= 0 {
		return false
	}
	reason := strings.TrimSpace(in.Reason)
	if requireReason && reason == "" {
		return false
	}
	return len([]rune(reason)) <= 255
}

func normalizeReworkIntakeFilter(filter ReworkIntakeFilter) ReworkIntakeFilter {
	if filter.Limit <= 0 || filter.Limit > 200 {
		filter.Limit = 50
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}
	filter.Status = strings.ToUpper(strings.TrimSpace(filter.Status))
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	return filter
}

func normalizeReworkIntakeCreate(in ReworkIntakeCreate) (ReworkIntakeCreate, string, error) {
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	if in.IdempotencyKey == "" || len([]rune(in.IdempotencyKey)) > 128 {
		return ReworkIntakeCreate{}, "", ErrBadParam
	}
	intakeNo, sourceShipmentID, reason, items, err := normalizeReworkIntakeEditableFields(
		in.IntakeNo,
		in.SourceShipmentID,
		in.Reason,
		in.Items,
	)
	if err != nil {
		return ReworkIntakeCreate{}, "", err
	}
	in.IntakeNo = intakeNo
	in.SourceShipmentID = sourceShipmentID
	in.Reason = reason
	in.Items = items
	payload := struct {
		IntakeNo         string                   `json:"intake_no"`
		SourceShipmentID int                      `json:"source_shipment_id"`
		Reason           string                   `json:"reason"`
		Items            []ReworkIntakeItemCreate `json:"items"`
	}{in.IntakeNo, in.SourceShipmentID, in.Reason, in.Items}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return ReworkIntakeCreate{}, "", err
	}
	sum := sha256.Sum256(encoded)
	return in, hex.EncodeToString(sum[:]), nil
}

func normalizeReworkIntakeDraftSave(in ReworkIntakeDraftSave) (ReworkIntakeDraftSave, error) {
	if in.ID <= 0 || in.ExpectedVersion <= 0 {
		return ReworkIntakeDraftSave{}, ErrBadParam
	}
	intakeNo, sourceShipmentID, reason, items, err := normalizeReworkIntakeEditableFields(
		in.IntakeNo,
		in.SourceShipmentID,
		in.Reason,
		in.Items,
	)
	if err != nil {
		return ReworkIntakeDraftSave{}, err
	}
	in.IntakeNo = intakeNo
	in.SourceShipmentID = sourceShipmentID
	in.Reason = reason
	in.Items = items
	return in, nil
}

func normalizeReworkIntakeEditableFields(
	intakeNo string,
	sourceShipmentID int,
	reason string,
	items []ReworkIntakeItemCreate,
) (string, int, string, []ReworkIntakeItemCreate, error) {
	intakeNo = strings.TrimSpace(intakeNo)
	reason = strings.TrimSpace(reason)
	if intakeNo == "" || reason == "" || len(items) == 0 || sourceShipmentID <= 0 ||
		len([]rune(intakeNo)) > 64 || len([]rune(reason)) > 255 {
		return "", 0, "", nil, ErrBadParam
	}
	normalizedItems := append([]ReworkIntakeItemCreate(nil), items...)
	sort.Slice(normalizedItems, func(i, j int) bool {
		if normalizedItems[i].SourceShipmentItemID == normalizedItems[j].SourceShipmentItemID {
			return normalizedItems[i].TargetProductionOrderItemID < normalizedItems[j].TargetProductionOrderItemID
		}
		return normalizedItems[i].SourceShipmentItemID < normalizedItems[j].SourceShipmentItemID
	})
	seen := map[int]struct{}{}
	for i := range normalizedItems {
		item := &normalizedItems[i]
		if item.SourceShipmentItemID <= 0 || item.TargetProductionOrderItemID <= 0 || !validShipmentNetWeightQuantity(item.Quantity) {
			return "", 0, "", nil, ErrBadParam
		}
		if _, exists := seen[item.SourceShipmentItemID]; exists {
			return "", 0, "", nil, ErrBadParam
		}
		seen[item.SourceShipmentItemID] = struct{}{}
		item.Note = normalizeOptionalString(item.Note)
		if item.Note != nil && len([]rune(*item.Note)) > 255 {
			return "", 0, "", nil, ErrBadParam
		}
	}
	return intakeNo, sourceShipmentID, reason, normalizedItems, nil
}

func normalizeProductionReworkFromIntakeCreate(in ProductionReworkFromIntakeCreate) (ProductionReworkFromIntakeCreate, error) {
	in.FactNo = strings.TrimSpace(in.FactNo)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.Reason = strings.TrimSpace(in.Reason)
	if in.FactNo == "" || in.IdempotencyKey == "" || in.Reason == "" || in.ReworkIntakeItemID <= 0 || !validShipmentNetWeightQuantity(in.Quantity) ||
		len([]rune(in.FactNo)) > 64 || len([]rune(in.IdempotencyKey)) > 128 || len([]rune(in.Reason)) > 255 {
		return ProductionReworkFromIntakeCreate{}, ErrBadParam
	}
	if !in.OccurredAtSpecified {
		in.OccurredAt = time.Now().UTC().Truncate(time.Microsecond)
	} else if in.OccurredAt.IsZero() {
		return ProductionReworkFromIntakeCreate{}, ErrBadParam
	} else {
		in.OccurredAt = in.OccurredAt.UTC().Truncate(time.Microsecond)
	}
	return in, nil
}

func normalizeReworkReshipmentCreate(in ReworkReshipmentCreate) (ReworkReshipmentCreate, error) {
	in.ShipmentNo = strings.TrimSpace(in.ShipmentNo)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.Note = normalizeOptionalString(in.Note)
	if in.ShipmentNo == "" || in.IdempotencyKey == "" || in.ReworkIntakeID <= 0 || len(in.Items) == 0 ||
		len([]rune(in.ShipmentNo)) > 64 || len([]rune(in.IdempotencyKey)) > 128 || (in.Note != nil && len([]rune(*in.Note)) > 255) {
		return ReworkReshipmentCreate{}, ErrBadParam
	}
	if in.PlannedShipAt != nil && in.PlannedShipAt.IsZero() {
		return ReworkReshipmentCreate{}, ErrBadParam
	}
	if in.PlannedShipAt != nil {
		planned := in.PlannedShipAt.UTC().Truncate(time.Microsecond)
		in.PlannedShipAt = &planned
	}
	in.Items = append([]ReworkReshipmentItemCreate(nil), in.Items...)
	sort.Slice(in.Items, func(i, j int) bool { return in.Items[i].ReworkCompletionFactID < in.Items[j].ReworkCompletionFactID })
	seen := map[int]struct{}{}
	for index := range in.Items {
		item := &in.Items[index]
		if item.ReworkCompletionFactID <= 0 || !validShipmentNetWeightQuantity(item.Quantity) {
			return ReworkReshipmentCreate{}, ErrBadParam
		}
		if _, exists := seen[item.ReworkCompletionFactID]; exists {
			return ReworkReshipmentCreate{}, ErrBadParam
		}
		seen[item.ReworkCompletionFactID] = struct{}{}
		item.Note = normalizeOptionalString(item.Note)
		if item.Note != nil && len([]rune(*item.Note)) > 255 {
			return ReworkReshipmentCreate{}, ErrBadParam
		}
	}
	return in, nil
}
