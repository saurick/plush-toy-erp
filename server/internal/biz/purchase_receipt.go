package biz

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	corestatus "server/internal/core/status"
	"server/internal/core/value"

	"github.com/shopspring/decimal"
)

type PurchaseReceipt struct {
	ID           int
	ReceiptNo    string
	SupplierID   *int
	SupplierName string
	Status       string
	ReceivedAt   time.Time
	PostedAt     *time.Time
	Note         *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	Items        []*PurchaseReceiptItem
	// QualityInspections is populated by the receipt preparation command so the
	// process runtime can record every generated line inspection as a linked ref.
	QualityInspections []*QualityInspection
}

type PurchaseReceiptItem struct {
	ID                  int
	ReceiptID           int
	MaterialID          int
	WarehouseID         int
	UnitID              int
	LotID               *int
	PurchaseOrderItemID *int
	LotNo               *string
	Quantity            decimal.Decimal
	UnitPrice           *decimal.Decimal
	Amount              *decimal.Decimal
	SourceLineNo        *string
	Note                *string
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type PurchaseReceiptCreate struct {
	ReceiptNo    string
	SupplierID   *int
	SupplierName string
	ReceivedAt   time.Time
	Note         *string
}

type PurchaseReceiptFromPurchaseOrderCreate struct {
	PurchaseOrderID        int
	ReceiptNo              string
	WarehouseID            int
	ReceivedAt             time.Time
	Note                   *string
	IdempotencyKey         string
	IdempotencyPayloadHash string
}

type PurchaseReceiptItemCreate struct {
	ReceiptID              int
	MaterialID             int
	WarehouseID            int
	UnitID                 int
	LotID                  *int
	PurchaseOrderItemID    *int
	LotNo                  *string
	Quantity               decimal.Decimal
	UnitPrice              *decimal.Decimal
	Amount                 *decimal.Decimal
	SourceLineNo           *string
	Note                   *string
	IdempotencyKey         string
	IdempotencyPayloadHash string
}

type PurchaseReceiptFilter struct {
	Status              string
	Keyword             string
	SupplierID          int
	SupplierName        string
	DateFrom            *time.Time
	DateTo              *time.Time
	MaterialID          int
	WarehouseID         int
	LotID               int
	PurchaseOrderID     int
	PurchaseOrderItemID int
	Limit               int
	Offset              int
}

func (uc *InventoryUsecase) CreatePurchaseReceiptDraft(ctx context.Context, in *PurchaseReceiptCreate) (*PurchaseReceipt, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptCreate(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validatePurchaseReceiptSupplierIdentity(ctx, &normalized); err != nil {
		return nil, err
	}
	return uc.repo.CreatePurchaseReceiptDraft(ctx, &normalized)
}

func (uc *InventoryUsecase) CreatePurchaseReceiptWithItems(ctx context.Context, in *PurchaseReceiptCreate, items []*PurchaseReceiptItemCreate) (*PurchaseReceipt, error) {
	if uc == nil || uc.repo == nil || in == nil || len(items) == 0 {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptCreate(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validatePurchaseReceiptSupplierIdentity(ctx, &normalized); err != nil {
		return nil, err
	}
	normalizedItems := make([]*PurchaseReceiptItemCreate, 0, len(items))
	for _, item := range items {
		if item == nil {
			return nil, ErrBadParam
		}
		normalizedItem, err := normalizePurchaseReceiptItemCreateForReceipt(*item, false)
		if err != nil {
			return nil, err
		}
		if err := uc.validatePurchaseReceiptItemActiveReferences(ctx, &normalizedItem); err != nil {
			return nil, err
		}
		normalizedItems = append(normalizedItems, &normalizedItem)
	}
	return uc.repo.CreatePurchaseReceiptWithItems(ctx, &normalized, normalizedItems)
}

func (uc *InventoryUsecase) CreatePurchaseReceiptFromPurchaseOrder(ctx context.Context, in *PurchaseReceiptFromPurchaseOrderCreate) (*PurchaseReceipt, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptFromPurchaseOrderCreate(*in)
	if err != nil {
		return nil, err
	}
	if normalized.IdempotencyKey != "" {
		replayed, found, err := uc.repo.ResolvePurchaseReceiptFromPurchaseOrderReplay(ctx, &normalized)
		if err != nil {
			return nil, err
		}
		if found {
			return replayed, nil
		}
	}
	if err := requireActiveReference(ctx, normalized.WarehouseID, uc.repo.WarehouseIsActive, ErrWarehouseInactive); err != nil {
		return nil, err
	}
	return uc.repo.CreatePurchaseReceiptFromPurchaseOrder(ctx, &normalized)
}

func (uc *InventoryUsecase) AddPurchaseReceiptItem(ctx context.Context, in *PurchaseReceiptItemCreate) (*PurchaseReceiptItem, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptItemCreate(*in)
	if err != nil {
		return nil, err
	}
	replayed, found, err := uc.repo.ResolvePurchaseReceiptItemReplay(ctx, &normalized)
	if err != nil {
		return nil, err
	}
	if found {
		return replayed, nil
	}
	if err := uc.validatePurchaseReceiptItemActiveReferences(ctx, &normalized); err != nil {
		return nil, err
	}
	return uc.repo.AddPurchaseReceiptItem(ctx, &normalized)
}

func (uc *InventoryUsecase) PostPurchaseReceipt(ctx context.Context, receiptID int) (*PurchaseReceipt, error) {
	if uc == nil || uc.repo == nil || receiptID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.PostPurchaseReceipt(ctx, receiptID)
}

func (uc *InventoryUsecase) CancelPostedPurchaseReceipt(ctx context.Context, receiptID int) (*PurchaseReceipt, error) {
	if uc == nil || uc.repo == nil || receiptID <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.CancelPostedPurchaseReceipt(ctx, receiptID)
}

func (uc *InventoryUsecase) CancelPostedPurchaseReceiptWithActor(ctx context.Context, receiptID int, actorID int) (*PurchaseReceipt, error) {
	if uc == nil || uc.repo == nil || receiptID <= 0 || actorID <= 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(PurchaseReceiptCancellationActorRepo)
	if !ok {
		return nil, ErrActorAwareCancellationUnavailable
	}
	return repo.CancelPostedPurchaseReceiptWithActor(ctx, receiptID, actorID)
}

func (uc *InventoryUsecase) GetPurchaseReceipt(ctx context.Context, id int) (*PurchaseReceipt, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetPurchaseReceipt(ctx, id)
}

func (uc *InventoryUsecase) ListPurchaseReceipts(ctx context.Context, filter PurchaseReceiptFilter) ([]*PurchaseReceipt, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListPurchaseReceipts(ctx, normalized)
}

func IsValidPurchaseReceiptStatus(value string) bool {
	return corestatus.IsPurchaseReceiptStatus(value)
}

func PurchaseReceiptInboundIdempotencyKey(receiptID, itemID int) string {
	return fmt.Sprintf("%s:%d:%d:IN", PurchaseReceiptSourceType, receiptID, itemID)
}

func PurchaseReceiptReversalIdempotencyKey(receiptID, itemID int) string {
	return fmt.Sprintf("%s:%d:%d:REVERSAL", PurchaseReceiptSourceType, receiptID, itemID)
}

func normalizePurchaseReceiptCreate(in PurchaseReceiptCreate) (PurchaseReceiptCreate, error) {
	in.ReceiptNo = strings.TrimSpace(in.ReceiptNo)
	in.SupplierName = strings.TrimSpace(in.SupplierName)
	in.Note = normalizeOptionalString(in.Note)
	if in.SupplierID != nil && *in.SupplierID <= 0 {
		return PurchaseReceiptCreate{}, ErrBadParam
	}
	if in.ReceivedAt.IsZero() {
		in.ReceivedAt = time.Now()
	}
	if in.ReceiptNo == "" || in.SupplierName == "" {
		return PurchaseReceiptCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizePurchaseReceiptFromPurchaseOrderCreate(in PurchaseReceiptFromPurchaseOrderCreate) (PurchaseReceiptFromPurchaseOrderCreate, error) {
	in.ReceiptNo = strings.TrimSpace(in.ReceiptNo)
	in.Note = normalizeOptionalString(in.Note)
	in.IdempotencyKey = strings.TrimSpace(in.IdempotencyKey)
	in.IdempotencyPayloadHash = ""
	if len(in.IdempotencyKey) > 128 {
		return PurchaseReceiptFromPurchaseOrderCreate{}, ErrBadParam
	}
	if in.IdempotencyKey != "" {
		in.IdempotencyPayloadHash = purchaseReceiptFromPurchaseOrderPayloadHash(in)
	}
	if in.ReceivedAt.IsZero() {
		in.ReceivedAt = time.Now()
	}
	if in.PurchaseOrderID <= 0 || in.WarehouseID <= 0 || in.ReceiptNo == "" {
		return PurchaseReceiptFromPurchaseOrderCreate{}, ErrBadParam
	}
	return in, nil
}

func purchaseReceiptFromPurchaseOrderPayloadHash(in PurchaseReceiptFromPurchaseOrderCreate) string {
	receivedAt := ""
	if !in.ReceivedAt.IsZero() {
		receivedAt = in.ReceivedAt.UTC().Format(time.RFC3339Nano)
	}
	payload := struct {
		PurchaseOrderID int     `json:"purchase_order_id"`
		ReceiptNo       string  `json:"receipt_no"`
		WarehouseID     int     `json:"warehouse_id"`
		ReceivedAt      string  `json:"received_at"`
		Note            *string `json:"note"`
	}{
		PurchaseOrderID: in.PurchaseOrderID,
		ReceiptNo:       in.ReceiptNo,
		WarehouseID:     in.WarehouseID,
		ReceivedAt:      receivedAt,
		Note:            in.Note,
	}
	encoded, _ := json.Marshal(payload)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func normalizePurchaseReceiptItemCreate(in PurchaseReceiptItemCreate) (PurchaseReceiptItemCreate, error) {
	normalized, err := normalizePurchaseReceiptItemCreateForReceipt(in, true)
	if err != nil {
		return PurchaseReceiptItemCreate{}, err
	}
	normalized.IdempotencyKey = strings.TrimSpace(normalized.IdempotencyKey)
	normalized.IdempotencyPayloadHash = ""
	if normalized.IdempotencyKey == "" || len(normalized.IdempotencyKey) > 128 {
		return PurchaseReceiptItemCreate{}, ErrBadParam
	}
	// The linked purchase-order line owns source_line_no. Ignore a stale or
	// forged client snapshot when binding the append intent.
	if normalized.PurchaseOrderItemID != nil {
		normalized.SourceLineNo = nil
	}
	normalized.IdempotencyPayloadHash = purchaseReceiptItemPayloadHash(normalized)
	return normalized, nil
}

func purchaseReceiptItemPayloadHash(in PurchaseReceiptItemCreate) string {
	payload := struct {
		ReceiptID           int     `json:"receipt_id"`
		MaterialID          int     `json:"material_id"`
		WarehouseID         int     `json:"warehouse_id"`
		UnitID              int     `json:"unit_id"`
		LotID               *int    `json:"lot_id"`
		PurchaseOrderItemID *int    `json:"purchase_order_item_id"`
		LotNo               *string `json:"lot_no"`
		Quantity            string  `json:"quantity"`
		UnitPrice           *string `json:"unit_price"`
		Amount              *string `json:"amount"`
		SourceLineNo        *string `json:"source_line_no"`
		Note                *string `json:"note"`
	}{
		ReceiptID:           in.ReceiptID,
		MaterialID:          in.MaterialID,
		WarehouseID:         in.WarehouseID,
		UnitID:              in.UnitID,
		LotID:               in.LotID,
		PurchaseOrderItemID: in.PurchaseOrderItemID,
		LotNo:               in.LotNo,
		Quantity:            in.Quantity.String(),
		UnitPrice:           canonicalOptionalDecimal(in.UnitPrice),
		Amount:              canonicalOptionalDecimal(in.Amount),
		SourceLineNo:        in.SourceLineNo,
		Note:                in.Note,
	}
	encoded, _ := json.Marshal(payload)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func canonicalOptionalDecimal(value *decimal.Decimal) *string {
	if value == nil {
		return nil
	}
	text := value.String()
	return &text
}

func normalizePurchaseReceiptItemCreateForReceipt(in PurchaseReceiptItemCreate, requireReceiptID bool) (PurchaseReceiptItemCreate, error) {
	in.LotNo = normalizeOptionalString(in.LotNo)
	in.SourceLineNo = normalizeOptionalString(in.SourceLineNo)
	in.Note = normalizeOptionalString(in.Note)
	if in.LotID != nil && *in.LotID <= 0 {
		in.LotID = nil
	}
	if in.PurchaseOrderItemID != nil && *in.PurchaseOrderItemID <= 0 {
		in.PurchaseOrderItemID = nil
	}
	if err := value.ValidateOptionalNonNegativeMoney(in.UnitPrice); err != nil {
		return PurchaseReceiptItemCreate{}, ErrBadParam
	}
	if err := value.ValidateOptionalNonNegativeMoney(in.Amount); err != nil {
		return PurchaseReceiptItemCreate{}, ErrBadParam
	}
	if (requireReceiptID && in.ReceiptID <= 0) ||
		in.MaterialID <= 0 ||
		in.WarehouseID <= 0 ||
		in.UnitID <= 0 {
		return PurchaseReceiptItemCreate{}, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(in.Quantity); err != nil {
		return PurchaseReceiptItemCreate{}, ErrBadParam
	}
	return in, nil
}

func normalizePurchaseReceiptFilter(in PurchaseReceiptFilter) (PurchaseReceiptFilter, error) {
	in.Status = strings.ToUpper(strings.TrimSpace(in.Status))
	in.Keyword = strings.TrimSpace(in.Keyword)
	in.SupplierName = strings.TrimSpace(in.SupplierName)
	if in.Status != "" && !IsValidPurchaseReceiptStatus(in.Status) {
		return PurchaseReceiptFilter{}, ErrBadParam
	}
	if in.SupplierID < 0 {
		return PurchaseReceiptFilter{}, ErrBadParam
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return PurchaseReceiptFilter{}, ErrBadParam
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}

func (uc *InventoryUsecase) validatePurchaseReceiptItemActiveReferences(ctx context.Context, item *PurchaseReceiptItemCreate) error {
	if item == nil {
		return ErrBadParam
	}
	if item.PurchaseOrderItemID == nil {
		if err := requireActiveReference(ctx, item.MaterialID, uc.repo.MaterialIsActive, ErrMaterialInactive); err != nil {
			return err
		}
		if err := requireActiveReference(ctx, item.UnitID, uc.repo.UnitIsActive, ErrUnitInactive); err != nil {
			return err
		}
	}
	return requireActiveReference(ctx, item.WarehouseID, uc.repo.WarehouseIsActive, ErrWarehouseInactive)
}

func (uc *InventoryUsecase) validatePurchaseReceiptSupplierIdentity(ctx context.Context, in *PurchaseReceiptCreate) error {
	if uc == nil || uc.repo == nil || in == nil {
		return ErrBadParam
	}
	if in.SupplierID == nil {
		return nil
	}
	supplier, err := uc.repo.GetSupplier(ctx, *in.SupplierID)
	if err != nil {
		return err
	}
	if supplier == nil || !supplier.IsActive {
		return ErrSupplierInactive
	}
	if strings.TrimSpace(supplier.Name) != in.SupplierName {
		return ErrBadParam
	}
	return nil
}
