package biz

import (
	"context"
	"time"

	"github.com/shopspring/decimal"
)

type Shipment struct {
	ID                              int
	ShipmentNo                      string
	SalesOrderID                    *int
	CustomerID                      *int
	CustomerSnapshot                *string
	DeliverySnapshot                map[string]any
	ReceivableAmountSnapshot        *decimal.Decimal
	QuotedFreightAmountSnapshot     *decimal.Decimal
	TaxAmountSnapshot               *decimal.Decimal
	TaxModeSnapshot                 *string
	Status                          string
	Version                         int
	FinanceReleaseStatus            string
	FinanceReleaseVersion           int
	FinanceReleasedAt               *time.Time
	FinanceReleasedBy               *int
	FinanceReleaseProcessInstanceID *int
	FinanceReleaseProcessNodeID     *int
	FinanceReleaseNote              *string
	IdempotencyKey                  string
	PlannedShipAt                   *time.Time
	ShippedAt                       *time.Time
	TransportMethod                 *string
	CarrierName                     *string
	TrackingNo                      *string
	PackageCount                    *int
	GrossWeightKg                   *decimal.Decimal
	VolumeM3                        *decimal.Decimal
	ShippingMark                    *string
	FreightAmount                   *decimal.Decimal
	FreightCurrency                 *string
	TotalNetWeightG                 *decimal.Decimal
	Note                            *string
	CreatedAt                       time.Time
	UpdatedAt                       time.Time
	Items                           []*ShipmentItem
}

type ShipmentItem struct {
	ID                     int
	ShipmentID             int
	SalesOrderItemID       *int
	ProductID              int
	ProductSkuID           *int
	WarehouseID            int
	UnitID                 int
	LotID                  *int
	Quantity               decimal.Decimal
	UnitNetWeightGSnapshot *decimal.Decimal
	UnitPriceSnapshot      *decimal.Decimal
	AmountSnapshot         *decimal.Decimal
	CurrencySnapshot       *string
	PackageDescription     *string
	CaseNo                 *string
	Note                   *string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

type ShipmentCreate struct {
	ShipmentNo       string
	SalesOrderID     *int
	CustomerID       *int
	CustomerSnapshot *string
	DeliverySnapshot map[string]any
	IdempotencyKey   string
	PlannedShipAt    *time.Time
	TransportMethod  *string
	CarrierName      *string
	TrackingNo       *string
	PackageCount     *int
	GrossWeightKg    *decimal.Decimal
	VolumeM3         *decimal.Decimal
	ShippingMark     *string
	FreightAmount    *decimal.Decimal
	FreightCurrency  *string
	TotalNetWeightG  *decimal.Decimal
	Note             *string
}

type ShipmentItemCreate struct {
	SalesOrderItemID   *int
	ProductID          int
	ProductSkuID       *int
	WarehouseID        int
	UnitID             int
	LotID              *int
	Quantity           decimal.Decimal
	PackageDescription *string
	CaseNo             *string
	Note               *string
}

type ShipmentCreateWithItems struct {
	Shipment *ShipmentCreate
	Items    []*ShipmentItemCreate
}

// ShipmentDraftSave contains the complete editable DRAFT aggregate. Source
// snapshots are still resolved and validated by the repository transaction.
type ShipmentDraftSave struct {
	ID               int
	ExpectedVersion  int
	ShipmentNo       string
	SalesOrderID     *int
	CustomerID       *int
	CustomerSnapshot *string
	DeliverySnapshot map[string]any
	PlannedShipAt    *time.Time
	TransportMethod  *string
	CarrierName      *string
	TrackingNo       *string
	PackageCount     *int
	GrossWeightKg    *decimal.Decimal
	VolumeM3         *decimal.Decimal
	ShippingMark     *string
	FreightAmount    *decimal.Decimal
	FreightCurrency  *string
	TotalNetWeightG  *decimal.Decimal
	Note             *string
	Items            []*ShipmentItemCreate
}

type ShipmentRepo interface {
	ShipmentDraftSaveRepo
	ShipmentReleaseSourceRepo
	OperationalFactShipmentActorRepo
	OperationalFactCancellationActorRepo
	CreateShipmentDraftWithItems(ctx context.Context, in *ShipmentCreateWithItems) (*Shipment, error)
	ShipShipment(ctx context.Context, id int) (*Shipment, error)
	CancelShippedShipment(ctx context.Context, id int) (*Shipment, error)
	GetShipment(ctx context.Context, id int) (*Shipment, error)
	ListShipments(ctx context.Context, filter OperationalFactFilter) ([]*Shipment, int, error)
}

// ShipmentDraftSaveRepo owns protected replacement of a complete shipment draft.
type ShipmentDraftSaveRepo interface {
	SaveShipmentDraftWithItems(ctx context.Context, in *ShipmentDraftSave) (*Shipment, error)
}

// OperationalFactCancellationActorRepo is the authenticated path for shipment
// cancellation and, when already shipped, inventory compensation evidence.
type OperationalFactCancellationActorRepo interface {
	CancelShippedShipmentWithActor(ctx context.Context, id int, actorID int) (*Shipment, error)
}

// OperationalFactShipmentActorRepo is the authenticated direct-shipping path.
// Shipment repositories must preserve the authenticated actor in their write.
type OperationalFactShipmentActorRepo interface {
	ShipShipmentWithActor(ctx context.Context, id int, actorID int) (*Shipment, error)
}

// ShipmentReleaseSourceRepo owns the DRAFT shipment lock and creates the
// source-generated release task, event and coordination state atomically.
type ShipmentReleaseSourceRepo interface {
	SubmitShipmentRelease(ctx context.Context, id int, actorID int) (*WorkflowTask, bool, error)
	ValidateShipmentReleaseForShipping(ctx context.Context, id int) error
}

func (uc *OperationalFactUsecase) CreateShipmentDraftWithItems(ctx context.Context, in *ShipmentCreateWithItems) (*Shipment, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeShipmentCreateWithItems(in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateShipmentHeaderActiveReferences(ctx, normalized.Shipment); err != nil {
		return nil, err
	}
	for _, item := range normalized.Items {
		if err := uc.validateSalesLineReferences(ctx, item.SalesOrderItemID, item.ProductID, item.ProductSkuID, item.UnitID, item.WarehouseID); err != nil {
			return nil, err
		}
	}
	return uc.repo.CreateShipmentDraftWithItems(ctx, normalized)
}

func (uc *OperationalFactUsecase) SaveShipmentDraftWithItems(ctx context.Context, in *ShipmentDraftSave) (*Shipment, error) {
	if uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeShipmentDraftSave(in)
	if err != nil {
		return nil, err
	}
	header := &ShipmentCreate{
		ShipmentNo:       normalized.ShipmentNo,
		SalesOrderID:     normalized.SalesOrderID,
		CustomerID:       normalized.CustomerID,
		CustomerSnapshot: normalized.CustomerSnapshot,
		DeliverySnapshot: normalized.DeliverySnapshot,
		PlannedShipAt:    normalized.PlannedShipAt,
		TransportMethod:  normalized.TransportMethod,
		CarrierName:      normalized.CarrierName,
		TrackingNo:       normalized.TrackingNo,
		PackageCount:     normalized.PackageCount,
		GrossWeightKg:    normalized.GrossWeightKg,
		VolumeM3:         normalized.VolumeM3,
		ShippingMark:     normalized.ShippingMark,
		FreightAmount:    normalized.FreightAmount,
		FreightCurrency:  normalized.FreightCurrency,
		TotalNetWeightG:  normalized.TotalNetWeightG,
		Note:             normalized.Note,
	}
	if err := uc.validateShipmentHeaderActiveReferences(ctx, header); err != nil {
		return nil, err
	}
	for _, item := range normalized.Items {
		if err := uc.validateSalesLineReferences(ctx, item.SalesOrderItemID, item.ProductID, item.ProductSkuID, item.UnitID, item.WarehouseID); err != nil {
			return nil, err
		}
	}
	repo := uc.repo
	return repo.SaveShipmentDraftWithItems(ctx, normalized)
}

func (uc *OperationalFactUsecase) SubmitShipmentRelease(ctx context.Context, id int, actorID int) (*WorkflowTask, bool, error) {
	if uc == nil || uc.repo == nil || id <= 0 || actorID <= 0 {
		return nil, false, ErrBadParam
	}
	repo := uc.repo
	return repo.SubmitShipmentRelease(ctx, id, actorID)
}

func (uc *OperationalFactUsecase) ValidateShipmentReleaseForShipping(ctx context.Context, id int) error {
	if uc == nil || uc.repo == nil || id <= 0 {
		return ErrBadParam
	}
	repo := uc.repo
	return repo.ValidateShipmentReleaseForShipping(ctx, id)
}

func (uc *OperationalFactUsecase) ShipShipment(ctx context.Context, id int) (_ *Shipment, err error) {
	ctx, finish := startBusinessTrace(ctx, "shipment.ship")
	defer func() { finish(err) }()
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.ShipShipment(ctx, id)
}

func (uc *OperationalFactUsecase) ShipShipmentWithActor(ctx context.Context, id int, actorID int) (_ *Shipment, err error) {
	ctx, finish := startBusinessTrace(ctx, "shipment.ship")
	defer func() { finish(err) }()
	if uc == nil || uc.repo == nil || id <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	repo := uc.repo
	return repo.ShipShipmentWithActor(ctx, id, actorID)
}

func (uc *OperationalFactUsecase) GetShipment(ctx context.Context, id int) (*Shipment, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetShipment(ctx, id)
}

func (uc *OperationalFactUsecase) CancelShippedShipment(ctx context.Context, id int) (*Shipment, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelShippedShipment(ctx, id)
}

func (uc *OperationalFactUsecase) CancelShippedShipmentWithActor(ctx context.Context, id int, actorID int) (*Shipment, error) {
	if uc == nil || uc.repo == nil || id <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	repo := uc.repo
	return repo.CancelShippedShipmentWithActor(ctx, id, actorID)
}

func (uc *OperationalFactUsecase) ListShipments(ctx context.Context, filter OperationalFactFilter) ([]*Shipment, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeShipmentFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListShipments(ctx, normalized)
}

var shipmentStatuses = map[string]struct{}{
	ShipmentStatusDraft:     {},
	ShipmentStatusShipped:   {},
	ShipmentStatusCancelled: {},
}

func (uc *OperationalFactUsecase) validateShipmentHeaderActiveReferences(ctx context.Context, in *ShipmentCreate) error {
	if in == nil {
		return ErrBadParam
	}
	if in.SalesOrderID != nil {
		return nil
	}
	return requireOptionalActiveReference(ctx, in.CustomerID, uc.repo.CustomerIsActive, ErrCustomerInactive)
}
