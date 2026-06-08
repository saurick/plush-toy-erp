package biz

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

const (
	Phase8StatusDraft     = "DRAFT"
	Phase8StatusPosted    = "POSTED"
	Phase8StatusCancelled = "CANCELLED"
	Phase8StatusSettled   = "SETTLED"

	ProductionFactSourceType           = "PRODUCTION_FACT"
	ProductionFactMaterialIssue        = "MATERIAL_ISSUE"
	ProductionFactFinishedGoodsReceipt = "FINISHED_GOODS_RECEIPT"
	ProductionFactRework               = "REWORK"

	OutsourcingFactSourceType    = "OUTSOURCING_FACT"
	OutsourcingFactMaterialIssue = "MATERIAL_ISSUE"
	OutsourcingFactReturnReceipt = "RETURN_RECEIPT"

	ShipmentSourceType      = "SHIPMENT"
	ShipmentStatusDraft     = "DRAFT"
	ShipmentStatusShipped   = "SHIPPED"
	ShipmentStatusCancelled = "CANCELLED"

	StockReservationStatusActive    = "ACTIVE"
	StockReservationStatusReleased  = "RELEASED"
	StockReservationStatusConsumed  = "CONSUMED"
	StockReservationStatusCancelled = "CANCELLED"

	FinanceFactReceivable       = "RECEIVABLE"
	FinanceFactPayable          = "PAYABLE"
	FinanceFactInvoice          = "INVOICE"
	FinanceFactPayment          = "PAYMENT"
	FinanceFactReconciliation   = "RECONCILIATION"
	FinanceCounterpartyCustomer = "CUSTOMER"
	FinanceCounterpartySupplier = "SUPPLIER"
	FinanceCounterpartyOther    = "OTHER"
)

var (
	ErrProductionFactNotFound   = errors.New("production fact not found")
	ErrOutsourcingFactNotFound  = errors.New("outsourcing fact not found")
	ErrShipmentNotFound         = errors.New("shipment not found")
	ErrShipmentItemNotFound     = errors.New("shipment item not found")
	ErrStockReservationNotFound = errors.New("stock reservation not found")
	ErrFinanceFactNotFound      = errors.New("finance fact not found")
)

type ProductionFact struct {
	ID             int
	FactNo         string
	FactType       string
	Status         string
	SubjectType    string
	SubjectID      int
	WarehouseID    int
	UnitID         int
	LotID          *int
	Quantity       decimal.Decimal
	SourceType     *string
	SourceID       *int
	SourceLineID   *int
	IdempotencyKey string
	OccurredAt     time.Time
	PostedAt       *time.Time
	Note           *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type OutsourcingFact struct {
	ID             int
	FactNo         string
	FactType       string
	Status         string
	SubjectType    string
	SubjectID      int
	WarehouseID    int
	UnitID         int
	LotID          *int
	Quantity       decimal.Decimal
	SupplierID     *int
	SupplierName   *string
	SourceType     *string
	SourceID       *int
	SourceLineID   *int
	IdempotencyKey string
	OccurredAt     time.Time
	PostedAt       *time.Time
	Note           *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type Shipment struct {
	ID               int
	ShipmentNo       string
	SalesOrderID     *int
	CustomerID       *int
	CustomerSnapshot *string
	Status           string
	IdempotencyKey   string
	PlannedShipAt    *time.Time
	ShippedAt        *time.Time
	Note             *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
	Items            []*ShipmentItem
}

type ShipmentItem struct {
	ID               int
	ShipmentID       int
	SalesOrderItemID *int
	ProductID        int
	WarehouseID      int
	UnitID           int
	LotID            *int
	Quantity         decimal.Decimal
	Note             *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type StockReservation struct {
	ID               int
	ReservationNo    string
	Status           string
	SalesOrderID     *int
	SalesOrderItemID *int
	ProductID        int
	WarehouseID      int
	UnitID           int
	LotID            *int
	Quantity         decimal.Decimal
	IdempotencyKey   string
	ReservedAt       time.Time
	ReleasedAt       *time.Time
	ConsumedAt       *time.Time
	Note             *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type FinanceFact struct {
	ID               int
	FactNo           string
	FactType         string
	Status           string
	CounterpartyType string
	CounterpartyID   *int
	Amount           decimal.Decimal
	Currency         string
	SourceType       *string
	SourceID         *int
	SourceLineID     *int
	IdempotencyKey   string
	OccurredAt       time.Time
	PostedAt         *time.Time
	SettledAt        *time.Time
	Note             *string
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type Phase8FactMutation struct {
	FactNo         string
	FactType       string
	SubjectType    string
	SubjectID      int
	WarehouseID    int
	UnitID         int
	LotID          *int
	Quantity       decimal.Decimal
	SupplierID     *int
	SupplierName   *string
	SourceType     *string
	SourceID       *int
	SourceLineID   *int
	IdempotencyKey string
	OccurredAt     time.Time
	Note           *string
}

type ShipmentCreate struct {
	ShipmentNo       string
	SalesOrderID     *int
	CustomerID       *int
	CustomerSnapshot *string
	IdempotencyKey   string
	PlannedShipAt    *time.Time
	Note             *string
}

type ShipmentItemCreate struct {
	ShipmentID       int
	SalesOrderItemID *int
	ProductID        int
	WarehouseID      int
	UnitID           int
	LotID            *int
	Quantity         decimal.Decimal
	Note             *string
}

type StockReservationCreate struct {
	ReservationNo    string
	SalesOrderID     *int
	SalesOrderItemID *int
	ProductID        int
	WarehouseID      int
	UnitID           int
	LotID            *int
	Quantity         decimal.Decimal
	IdempotencyKey   string
	ReservedAt       time.Time
	Note             *string
}

type FinanceFactCreate struct {
	FactNo           string
	FactType         string
	CounterpartyType string
	CounterpartyID   *int
	Amount           decimal.Decimal
	Currency         string
	SourceType       *string
	SourceID         *int
	SourceLineID     *int
	IdempotencyKey   string
	OccurredAt       time.Time
	Note             *string
}

type Phase8Filter struct {
	Status string
	Limit  int
	Offset int
}

type Phase8Repo interface {
	CreateProductionFactDraft(ctx context.Context, in *Phase8FactMutation) (*ProductionFact, error)
	PostProductionFact(ctx context.Context, id int) (*ProductionFact, error)
	CancelPostedProductionFact(ctx context.Context, id int) (*ProductionFact, error)
	ListProductionFacts(ctx context.Context, filter Phase8Filter) ([]*ProductionFact, int, error)

	CreateOutsourcingFactDraft(ctx context.Context, in *Phase8FactMutation) (*OutsourcingFact, error)
	PostOutsourcingFact(ctx context.Context, id int) (*OutsourcingFact, error)
	CancelPostedOutsourcingFact(ctx context.Context, id int) (*OutsourcingFact, error)
	ListOutsourcingFacts(ctx context.Context, filter Phase8Filter) ([]*OutsourcingFact, int, error)

	CreateShipmentDraft(ctx context.Context, in *ShipmentCreate) (*Shipment, error)
	AddShipmentItem(ctx context.Context, in *ShipmentItemCreate) (*ShipmentItem, error)
	ShipShipment(ctx context.Context, id int) (*Shipment, error)
	CancelShippedShipment(ctx context.Context, id int) (*Shipment, error)
	GetShipment(ctx context.Context, id int) (*Shipment, error)
	ListShipments(ctx context.Context, filter Phase8Filter) ([]*Shipment, int, error)

	CreateStockReservation(ctx context.Context, in *StockReservationCreate) (*StockReservation, error)
	ReleaseStockReservation(ctx context.Context, id int) (*StockReservation, error)
	ConsumeStockReservation(ctx context.Context, id int) (*StockReservation, error)
	ListStockReservations(ctx context.Context, filter Phase8Filter) ([]*StockReservation, int, error)

	CreateFinanceFactDraft(ctx context.Context, in *FinanceFactCreate) (*FinanceFact, error)
	PostFinanceFact(ctx context.Context, id int) (*FinanceFact, error)
	SettleFinanceFact(ctx context.Context, id int) (*FinanceFact, error)
	CancelPostedFinanceFact(ctx context.Context, id int) (*FinanceFact, error)
	ListFinanceFacts(ctx context.Context, filter Phase8Filter) ([]*FinanceFact, int, error)
}

type Phase8Usecase struct {
	repo Phase8Repo
}

func NewPhase8Usecase(repo Phase8Repo) *Phase8Usecase {
	return &Phase8Usecase{repo: repo}
}

func (uc *Phase8Usecase) CreateProductionFactDraft(ctx context.Context, in *Phase8FactMutation) (*ProductionFact, error) {
	normalized, err := normalizePhase8FactMutation(in, productionFactTypes)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateProductionFactDraft(ctx, normalized)
}

func (uc *Phase8Usecase) PostProductionFact(ctx context.Context, id int) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.PostProductionFact(ctx, id)
}

func (uc *Phase8Usecase) CancelPostedProductionFact(ctx context.Context, id int) (*ProductionFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedProductionFact(ctx, id)
}

func (uc *Phase8Usecase) ListProductionFacts(ctx context.Context, filter Phase8Filter) ([]*ProductionFact, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListProductionFacts(ctx, normalizePhase8Filter(filter))
}

func (uc *Phase8Usecase) CreateOutsourcingFactDraft(ctx context.Context, in *Phase8FactMutation) (*OutsourcingFact, error) {
	normalized, err := normalizePhase8FactMutation(in, outsourcingFactTypes)
	if err != nil {
		return nil, err
	}
	normalized.SupplierName = normalizeOptionalString(normalized.SupplierName)
	return uc.repo.CreateOutsourcingFactDraft(ctx, normalized)
}

func (uc *Phase8Usecase) PostOutsourcingFact(ctx context.Context, id int) (*OutsourcingFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.PostOutsourcingFact(ctx, id)
}

func (uc *Phase8Usecase) CancelPostedOutsourcingFact(ctx context.Context, id int) (*OutsourcingFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedOutsourcingFact(ctx, id)
}

func (uc *Phase8Usecase) ListOutsourcingFacts(ctx context.Context, filter Phase8Filter) ([]*OutsourcingFact, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListOutsourcingFacts(ctx, normalizePhase8Filter(filter))
}

func (uc *Phase8Usecase) CreateShipmentDraft(ctx context.Context, in *ShipmentCreate) (*Shipment, error) {
	normalized, err := normalizeShipmentCreate(in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateShipmentDraft(ctx, normalized)
}

func (uc *Phase8Usecase) AddShipmentItem(ctx context.Context, in *ShipmentItemCreate) (*ShipmentItem, error) {
	normalized, err := normalizeShipmentItemCreate(in)
	if err != nil {
		return nil, err
	}
	return uc.repo.AddShipmentItem(ctx, normalized)
}

func (uc *Phase8Usecase) ShipShipment(ctx context.Context, id int) (*Shipment, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.ShipShipment(ctx, id)
}

func (uc *Phase8Usecase) CancelShippedShipment(ctx context.Context, id int) (*Shipment, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelShippedShipment(ctx, id)
}

func (uc *Phase8Usecase) ListShipments(ctx context.Context, filter Phase8Filter) ([]*Shipment, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListShipments(ctx, normalizePhase8Filter(filter))
}

func (uc *Phase8Usecase) CreateStockReservation(ctx context.Context, in *StockReservationCreate) (*StockReservation, error) {
	normalized, err := normalizeStockReservationCreate(in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateStockReservation(ctx, normalized)
}

func (uc *Phase8Usecase) ReleaseStockReservation(ctx context.Context, id int) (*StockReservation, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.ReleaseStockReservation(ctx, id)
}

func (uc *Phase8Usecase) ConsumeStockReservation(ctx context.Context, id int) (*StockReservation, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.ConsumeStockReservation(ctx, id)
}

func (uc *Phase8Usecase) ListStockReservations(ctx context.Context, filter Phase8Filter) ([]*StockReservation, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListStockReservations(ctx, normalizePhase8Filter(filter))
}

func (uc *Phase8Usecase) CreateFinanceFactDraft(ctx context.Context, in *FinanceFactCreate) (*FinanceFact, error) {
	normalized, err := normalizeFinanceFactCreate(in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateFinanceFactDraft(ctx, normalized)
}

func (uc *Phase8Usecase) PostFinanceFact(ctx context.Context, id int) (*FinanceFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.PostFinanceFact(ctx, id)
}

func (uc *Phase8Usecase) SettleFinanceFact(ctx context.Context, id int) (*FinanceFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.SettleFinanceFact(ctx, id)
}

func (uc *Phase8Usecase) CancelPostedFinanceFact(ctx context.Context, id int) (*FinanceFact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedFinanceFact(ctx, id)
}

func (uc *Phase8Usecase) ListFinanceFacts(ctx context.Context, filter Phase8Filter) ([]*FinanceFact, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListFinanceFacts(ctx, normalizePhase8Filter(filter))
}

var productionFactTypes = map[string]struct{}{
	ProductionFactMaterialIssue:        {},
	ProductionFactFinishedGoodsReceipt: {},
	ProductionFactRework:               {},
}

var outsourcingFactTypes = map[string]struct{}{
	OutsourcingFactMaterialIssue: {},
	OutsourcingFactReturnReceipt: {},
}

var financeFactTypes = map[string]struct{}{
	FinanceFactReceivable:     {},
	FinanceFactPayable:        {},
	FinanceFactInvoice:        {},
	FinanceFactPayment:        {},
	FinanceFactReconciliation: {},
}

var financeCounterpartyTypes = map[string]struct{}{
	FinanceCounterpartyCustomer: {},
	FinanceCounterpartySupplier: {},
	FinanceCounterpartyOther:    {},
}

func normalizePhase8FactMutation(in *Phase8FactMutation, allowedTypes map[string]struct{}) (*Phase8FactMutation, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.FactType = strings.ToUpper(strings.TrimSpace(out.FactType))
	out.SubjectType = strings.ToUpper(strings.TrimSpace(out.SubjectType))
	out.SourceType = normalizeOptionalUpperString(out.SourceType)
	out.Note = normalizeOptionalString(out.Note)
	out.IdempotencyKey = strings.TrimSpace(out.IdempotencyKey)
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.SourceID != nil && *out.SourceID <= 0 {
		out.SourceID = nil
	}
	if out.SourceLineID != nil && *out.SourceLineID <= 0 {
		out.SourceLineID = nil
	}
	if _, ok := allowedTypes[out.FactType]; !ok {
		return nil, ErrBadParam
	}
	if _, ok := inventorySubjectTypes[out.SubjectType]; !ok {
		return nil, ErrBadParam
	}
	if out.FactNo == "" ||
		out.SubjectID <= 0 ||
		out.WarehouseID <= 0 ||
		out.UnitID <= 0 ||
		out.Quantity.Cmp(decimal.Zero) <= 0 ||
		out.IdempotencyKey == "" {
		return nil, ErrBadParam
	}
	if out.OccurredAt.IsZero() {
		out.OccurredAt = time.Now()
	}
	return &out, nil
}

func normalizeShipmentCreate(in *ShipmentCreate) (*ShipmentCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.ShipmentNo = strings.TrimSpace(out.ShipmentNo)
	out.CustomerSnapshot = normalizeOptionalString(out.CustomerSnapshot)
	out.Note = normalizeOptionalString(out.Note)
	out.IdempotencyKey = strings.TrimSpace(out.IdempotencyKey)
	if out.SalesOrderID != nil && *out.SalesOrderID <= 0 {
		out.SalesOrderID = nil
	}
	if out.CustomerID != nil && *out.CustomerID <= 0 {
		out.CustomerID = nil
	}
	if out.ShipmentNo == "" || out.IdempotencyKey == "" {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeShipmentItemCreate(in *ShipmentItemCreate) (*ShipmentItemCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.Note = normalizeOptionalString(out.Note)
	if out.SalesOrderItemID != nil && *out.SalesOrderItemID <= 0 {
		out.SalesOrderItemID = nil
	}
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.ShipmentID <= 0 || out.ProductID <= 0 || out.WarehouseID <= 0 || out.UnitID <= 0 || out.Quantity.Cmp(decimal.Zero) <= 0 {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeStockReservationCreate(in *StockReservationCreate) (*StockReservationCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.ReservationNo = strings.TrimSpace(out.ReservationNo)
	out.IdempotencyKey = strings.TrimSpace(out.IdempotencyKey)
	out.Note = normalizeOptionalString(out.Note)
	if out.SalesOrderID != nil && *out.SalesOrderID <= 0 {
		out.SalesOrderID = nil
	}
	if out.SalesOrderItemID != nil && *out.SalesOrderItemID <= 0 {
		out.SalesOrderItemID = nil
	}
	if out.LotID != nil && *out.LotID <= 0 {
		out.LotID = nil
	}
	if out.ReservedAt.IsZero() {
		out.ReservedAt = time.Now()
	}
	if out.ReservationNo == "" || out.IdempotencyKey == "" || out.ProductID <= 0 || out.WarehouseID <= 0 || out.UnitID <= 0 || out.Quantity.Cmp(decimal.Zero) <= 0 {
		return nil, ErrBadParam
	}
	return &out, nil
}

func normalizeFinanceFactCreate(in *FinanceFactCreate) (*FinanceFactCreate, error) {
	if in == nil {
		return nil, ErrBadParam
	}
	out := *in
	out.FactNo = strings.TrimSpace(out.FactNo)
	out.FactType = strings.ToUpper(strings.TrimSpace(out.FactType))
	out.CounterpartyType = strings.ToUpper(strings.TrimSpace(out.CounterpartyType))
	out.Currency = strings.ToUpper(strings.TrimSpace(out.Currency))
	out.SourceType = normalizeOptionalUpperString(out.SourceType)
	out.Note = normalizeOptionalString(out.Note)
	out.IdempotencyKey = strings.TrimSpace(out.IdempotencyKey)
	if out.CounterpartyID != nil && *out.CounterpartyID <= 0 {
		out.CounterpartyID = nil
	}
	if out.SourceID != nil && *out.SourceID <= 0 {
		out.SourceID = nil
	}
	if out.SourceLineID != nil && *out.SourceLineID <= 0 {
		out.SourceLineID = nil
	}
	if out.Currency == "" {
		out.Currency = "CNY"
	}
	if _, ok := financeFactTypes[out.FactType]; !ok {
		return nil, ErrBadParam
	}
	if _, ok := financeCounterpartyTypes[out.CounterpartyType]; !ok {
		return nil, ErrBadParam
	}
	if out.FactNo == "" || out.IdempotencyKey == "" || out.Amount.Cmp(decimal.Zero) <= 0 {
		return nil, ErrBadParam
	}
	if out.OccurredAt.IsZero() {
		out.OccurredAt = time.Now()
	}
	return &out, nil
}

func normalizePhase8Filter(in Phase8Filter) Phase8Filter {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in
}

func normalizeOptionalUpperString(value *string) *string {
	value = normalizeOptionalString(value)
	if value == nil {
		return nil
	}
	upper := strings.ToUpper(*value)
	return &upper
}

func Phase8InventoryIdempotencyKey(sourceType string, sourceID int, sourceLineID int, action string) string {
	return fmt.Sprintf("%s:%d:%d:%s", sourceType, sourceID, sourceLineID, action)
}
