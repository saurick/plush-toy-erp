package biz

import (
	"context"
	"errors"
	"strings"
	"time"

	corestatus "server/internal/core/status"
	"server/internal/core/value"

	"github.com/shopspring/decimal"
)

const (
	PurchaseOrderStatusDraft     = corestatus.PurchaseOrderDraft
	PurchaseOrderStatusSubmitted = corestatus.PurchaseOrderSubmitted
	PurchaseOrderStatusApproved  = corestatus.PurchaseOrderApproved
	PurchaseOrderStatusClosed    = corestatus.PurchaseOrderClosed
	PurchaseOrderStatusCanceled  = corestatus.PurchaseOrderCanceled

	PurchaseOrderItemStatusOpen     = corestatus.PurchaseOrderItemOpen
	PurchaseOrderItemStatusClosed   = corestatus.PurchaseOrderItemClosed
	PurchaseOrderItemStatusCanceled = corestatus.PurchaseOrderItemCanceled
)

var (
	ErrPurchaseOrderNotFound                    = errors.New("purchase order not found")
	ErrPurchaseOrderItemNotFound                = errors.New("purchase order item not found")
	ErrPurchaseOrderConflict                    = errors.New("purchase order version conflict")
	ErrPurchaseOrderCloseDraftReceiptDependency = errors.New("purchase order close blocked by draft receipt")
	ErrPurchaseOrderCancelReceiptDependency     = errors.New("purchase order cancellation blocked by receipt")
	ErrPurchaseOrderLifecycleProcessDependency  = errors.New("purchase order lifecycle blocked by active process")
	ErrMaterialInactive                         = errors.New("material inactive")
	ErrSupplierInactive                         = errors.New("supplier inactive")
)

type PurchaseOrder struct {
	ID                      int
	PurchaseOrderNo         string
	SupplierID              int
	SupplierPurchaseOrderNo *string
	SupplierSnapshot        map[string]any
	ContractPartySnapshot   map[string]any
	PurchaseDate            time.Time
	ExpectedArrivalDate     *time.Time
	LifecycleStatus         string
	Version                 int
	Note                    *string
	CreatedAt               time.Time
	UpdatedAt               time.Time
	// ItemCount is populated only by the list read model. Nil means the
	// repository did not load the detail count for this response.
	ItemCount *int
}

type PurchaseOrderItem struct {
	ID                     int
	PurchaseOrderID        int
	LineNo                 int
	MaterialID             int
	UnitID                 int
	MaterialCodeSnapshot   *string
	MaterialNameSnapshot   *string
	ColorSnapshot          *string
	ProductOrderNoSnapshot *string
	ProductNoSnapshot      *string
	ProductNameSnapshot    *string
	PurchasedQuantity      decimal.Decimal
	UnitPrice              *decimal.Decimal
	Amount                 *decimal.Decimal
	ExpectedArrivalDate    *time.Time
	LineStatus             string
	Note                   *string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

type PurchaseOrderMutation struct {
	ExpectedVersion         int
	PurchaseOrderNo         string
	SupplierID              int
	SupplierPurchaseOrderNo *string
	SupplierSnapshot        map[string]any
	ContractPartySnapshot   map[string]any
	PurchaseDate            time.Time
	ExpectedArrivalDate     *time.Time
	Note                    *string
}

type PurchaseOrderItemMutation struct {
	PurchaseOrderID        int
	LineNo                 int
	MaterialID             int
	UnitID                 int
	MaterialCodeSnapshot   *string
	MaterialNameSnapshot   *string
	ColorSnapshot          *string
	ProductOrderNoSnapshot *string
	ProductNoSnapshot      *string
	ProductNameSnapshot    *string
	PurchasedQuantity      decimal.Decimal
	UnitPrice              *decimal.Decimal
	Amount                 *decimal.Decimal
	ExpectedArrivalDate    *time.Time
	Note                   *string
}

type PurchaseOrderItemSaveMutation struct {
	ID int
	PurchaseOrderItemMutation
}

type PurchaseOrderWithItems struct {
	Order *PurchaseOrder
	Items []*PurchaseOrderItem
}

type PurchaseOrderFilter struct {
	Keyword         string
	SupplierID      int
	LifecycleStatus string
	DateField       string
	DateFrom        *time.Time
	DateTo          *time.Time
	SortBy          string
	SortDirection   string
	Limit           int
	Offset          int
}

type PurchaseOrderItemFilter struct {
	PurchaseOrderID int
	LineStatus      string
	Limit           int
	Offset          int
}

type PurchaseOrderRepo interface {
	CreatePurchaseOrder(ctx context.Context, in *PurchaseOrderMutation) (*PurchaseOrder, error)
	UpdatePurchaseOrder(ctx context.Context, id int, in *PurchaseOrderMutation) (*PurchaseOrder, error)
	GetPurchaseOrder(ctx context.Context, id int) (*PurchaseOrder, error)
	ListPurchaseOrders(ctx context.Context, filter PurchaseOrderFilter) ([]*PurchaseOrder, int, error)
	UpdatePurchaseOrderLifecycle(ctx context.Context, id int, lifecycleStatus string) (*PurchaseOrder, error)

	AddPurchaseOrderItem(ctx context.Context, in *PurchaseOrderItemMutation) (*PurchaseOrderItem, error)
	UpdatePurchaseOrderItem(ctx context.Context, id int, in *PurchaseOrderItemMutation) (*PurchaseOrderItem, error)
	GetPurchaseOrderItem(ctx context.Context, id int) (*PurchaseOrderItem, error)
	UpdatePurchaseOrderItemStatus(ctx context.Context, id int, lineStatus string) (*PurchaseOrderItem, error)
	ListPurchaseOrderItems(ctx context.Context, filter PurchaseOrderItemFilter) ([]*PurchaseOrderItem, int, error)
	SavePurchaseOrderWithItems(ctx context.Context, id int, order *PurchaseOrderMutation, items []*PurchaseOrderItemSaveMutation) (*PurchaseOrderWithItems, error)

	SupplierIsActive(ctx context.Context, id int) (bool, error)
	MaterialIsActive(ctx context.Context, id int) (bool, error)
	UnitIsActive(ctx context.Context, id int) (bool, error)
}

type PurchaseOrderUsecase struct {
	repo PurchaseOrderRepo
}

func NewPurchaseOrderUsecase(repo PurchaseOrderRepo) *PurchaseOrderUsecase {
	return &PurchaseOrderUsecase{repo: repo}
}

func (uc *PurchaseOrderUsecase) CreatePurchaseOrder(ctx context.Context, in *PurchaseOrderMutation) (*PurchaseOrder, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseOrderMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateSupplierActive(ctx, normalized.SupplierID); err != nil {
		return nil, err
	}
	return uc.repo.CreatePurchaseOrder(ctx, &normalized)
}

func (uc *PurchaseOrderUsecase) UpdatePurchaseOrder(ctx context.Context, id int, in *PurchaseOrderMutation) (*PurchaseOrder, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	current, err := uc.repo.GetPurchaseOrder(ctx, id)
	if err != nil {
		return nil, err
	}
	if !corestatus.IsPurchaseOrderEditable(current.LifecycleStatus) {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseOrderMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateSupplierActive(ctx, normalized.SupplierID); err != nil {
		return nil, err
	}
	return uc.repo.UpdatePurchaseOrder(ctx, id, &normalized)
}

func (uc *PurchaseOrderUsecase) GetPurchaseOrder(ctx context.Context, id int) (*PurchaseOrder, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetPurchaseOrder(ctx, id)
}

func (uc *PurchaseOrderUsecase) ListPurchaseOrders(ctx context.Context, filter PurchaseOrderFilter) ([]*PurchaseOrder, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizePurchaseOrderFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListPurchaseOrders(ctx, normalized)
}

func (uc *PurchaseOrderUsecase) SubmitPurchaseOrder(ctx context.Context, id int) (*PurchaseOrder, error) {
	return uc.changePurchaseOrderLifecycle(ctx, id, PurchaseOrderStatusSubmitted)
}

func (uc *PurchaseOrderUsecase) ApprovePurchaseOrder(ctx context.Context, id int) (*PurchaseOrder, error) {
	return uc.changePurchaseOrderLifecycle(ctx, id, PurchaseOrderStatusApproved)
}

func (uc *PurchaseOrderUsecase) ClosePurchaseOrder(ctx context.Context, id int) (*PurchaseOrder, error) {
	return uc.changePurchaseOrderLifecycle(ctx, id, PurchaseOrderStatusClosed)
}

func (uc *PurchaseOrderUsecase) CancelPurchaseOrder(ctx context.Context, id int) (*PurchaseOrder, error) {
	return uc.changePurchaseOrderLifecycle(ctx, id, PurchaseOrderStatusCanceled)
}

func (uc *PurchaseOrderUsecase) AddPurchaseOrderItem(ctx context.Context, in *PurchaseOrderItemMutation) (*PurchaseOrderItem, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseOrderItemMutation(*in)
	if err != nil {
		return nil, err
	}
	order, err := uc.openPurchaseOrder(ctx, normalized.PurchaseOrderID)
	if err != nil {
		return nil, err
	}
	if err := validateOptionalDateNotBefore(order.PurchaseDate, normalized.ExpectedArrivalDate); err != nil {
		return nil, err
	}
	if err := uc.validateMaterialAndUnitActive(ctx, normalized.MaterialID, normalized.UnitID); err != nil {
		return nil, err
	}
	return uc.repo.AddPurchaseOrderItem(ctx, &normalized)
}

func (uc *PurchaseOrderUsecase) UpdatePurchaseOrderItem(ctx context.Context, id int, in *PurchaseOrderItemMutation) (*PurchaseOrderItem, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	current, err := uc.repo.GetPurchaseOrderItem(ctx, id)
	if err != nil {
		return nil, err
	}
	if current.LineStatus == PurchaseOrderItemStatusCanceled || current.LineStatus == PurchaseOrderItemStatusClosed {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseOrderItemMutation(*in)
	if err != nil {
		return nil, err
	}
	order, err := uc.openPurchaseOrder(ctx, normalized.PurchaseOrderID)
	if err != nil {
		return nil, err
	}
	if err := validateOptionalDateNotBefore(order.PurchaseDate, normalized.ExpectedArrivalDate); err != nil {
		return nil, err
	}
	if err := uc.validateMaterialAndUnitActive(ctx, normalized.MaterialID, normalized.UnitID); err != nil {
		return nil, err
	}
	return uc.repo.UpdatePurchaseOrderItem(ctx, id, &normalized)
}

func (uc *PurchaseOrderUsecase) RemovePurchaseOrderItem(ctx context.Context, id int) (*PurchaseOrderItem, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	current, err := uc.repo.GetPurchaseOrderItem(ctx, id)
	if err != nil {
		return nil, err
	}
	if current.LineStatus == PurchaseOrderItemStatusCanceled {
		return current, nil
	}
	if current.LineStatus == PurchaseOrderItemStatusClosed {
		return nil, ErrBadParam
	}
	if err := uc.validateOpenPurchaseOrder(ctx, current.PurchaseOrderID); err != nil {
		return nil, err
	}
	return uc.repo.UpdatePurchaseOrderItemStatus(ctx, id, PurchaseOrderItemStatusCanceled)
}

func (uc *PurchaseOrderUsecase) SavePurchaseOrderWithItems(ctx context.Context, id int, order *PurchaseOrderMutation, items []*PurchaseOrderItemSaveMutation) (*PurchaseOrderWithItems, error) {
	if uc == nil || uc.repo == nil || id < 0 || order == nil {
		return nil, ErrBadParam
	}
	if id > 0 {
		if order.ExpectedVersion <= 0 {
			return nil, ErrBadParam
		}
		current, err := uc.repo.GetPurchaseOrder(ctx, id)
		if err != nil {
			return nil, err
		}
		if !corestatus.IsPurchaseOrderEditable(current.LifecycleStatus) {
			return nil, ErrBadParam
		}
	}
	if id == 0 {
		order.ExpectedVersion = 0
	}
	normalizedOrder, err := normalizePurchaseOrderMutation(*order)
	if err != nil {
		return nil, err
	}
	if err := uc.validateSupplierActive(ctx, normalizedOrder.SupplierID); err != nil {
		return nil, err
	}

	normalizedItems := make([]*PurchaseOrderItemSaveMutation, 0, len(items))
	seenIDs := map[int]struct{}{}
	for _, item := range items {
		if item == nil || item.ID < 0 {
			return nil, ErrBadParam
		}
		if id == 0 && item.ID > 0 {
			return nil, ErrBadParam
		}
		if item.ID > 0 {
			if _, ok := seenIDs[item.ID]; ok {
				return nil, ErrBadParam
			}
			seenIDs[item.ID] = struct{}{}
			current, err := uc.repo.GetPurchaseOrderItem(ctx, item.ID)
			if err != nil {
				return nil, err
			}
			if current.PurchaseOrderID != id || current.LineStatus == PurchaseOrderItemStatusCanceled || current.LineStatus == PurchaseOrderItemStatusClosed {
				return nil, ErrBadParam
			}
		}
		mutation := item.PurchaseOrderItemMutation
		if id > 0 {
			if mutation.PurchaseOrderID != 0 && mutation.PurchaseOrderID != id {
				return nil, ErrBadParam
			}
			mutation.PurchaseOrderID = id
		} else {
			mutation.PurchaseOrderID = 0
		}
		normalizedItem, err := normalizePurchaseOrderItemFields(mutation)
		if err != nil {
			return nil, err
		}
		if err := validateOptionalDateNotBefore(normalizedOrder.PurchaseDate, normalizedItem.ExpectedArrivalDate); err != nil {
			return nil, err
		}
		if err := uc.validateMaterialAndUnitActive(ctx, normalizedItem.MaterialID, normalizedItem.UnitID); err != nil {
			return nil, err
		}
		normalizedItems = append(normalizedItems, &PurchaseOrderItemSaveMutation{
			ID:                        item.ID,
			PurchaseOrderItemMutation: normalizedItem,
		})
	}

	return uc.repo.SavePurchaseOrderWithItems(ctx, id, &normalizedOrder, normalizedItems)
}

func (uc *PurchaseOrderUsecase) ListPurchaseOrderItems(ctx context.Context, filter PurchaseOrderItemFilter) ([]*PurchaseOrderItem, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizePurchaseOrderItemFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListPurchaseOrderItems(ctx, normalized)
}

func (uc *PurchaseOrderUsecase) changePurchaseOrderLifecycle(ctx context.Context, id int, next string) (*PurchaseOrder, error) {
	if uc == nil || uc.repo == nil || id <= 0 || !IsValidPurchaseOrderStatus(next) {
		return nil, ErrBadParam
	}
	current, err := uc.repo.GetPurchaseOrder(ctx, id)
	if err != nil {
		return nil, err
	}
	if !IsPurchaseOrderLifecycleTransitionAllowed(current.LifecycleStatus, next) {
		return nil, ErrBadParam
	}
	if current.LifecycleStatus == next {
		return current, nil
	}
	return uc.repo.UpdatePurchaseOrderLifecycle(ctx, id, next)
}

func (uc *PurchaseOrderUsecase) validateSupplierActive(ctx context.Context, id int) error {
	active, err := uc.repo.SupplierIsActive(ctx, id)
	if err != nil {
		return err
	}
	if !active {
		return ErrSupplierInactive
	}
	return nil
}

func (uc *PurchaseOrderUsecase) validateOpenPurchaseOrder(ctx context.Context, id int) error {
	_, err := uc.openPurchaseOrder(ctx, id)
	return err
}

func (uc *PurchaseOrderUsecase) openPurchaseOrder(ctx context.Context, id int) (*PurchaseOrder, error) {
	order, err := uc.repo.GetPurchaseOrder(ctx, id)
	if err != nil {
		return nil, err
	}
	if !corestatus.IsPurchaseOrderEditable(order.LifecycleStatus) {
		return nil, ErrBadParam
	}
	return order, nil
}

func (uc *PurchaseOrderUsecase) validateMaterialAndUnitActive(ctx context.Context, materialID int, unitID int) error {
	materialActive, err := uc.repo.MaterialIsActive(ctx, materialID)
	if err != nil {
		return err
	}
	if !materialActive {
		return ErrMaterialInactive
	}
	unitActive, err := uc.repo.UnitIsActive(ctx, unitID)
	if err != nil {
		return err
	}
	if !unitActive {
		return ErrUnitInactive
	}
	return nil
}

func normalizePurchaseOrderMutation(in PurchaseOrderMutation) (PurchaseOrderMutation, error) {
	in.PurchaseOrderNo = strings.TrimSpace(in.PurchaseOrderNo)
	in.SupplierPurchaseOrderNo = normalizeOptionalString(in.SupplierPurchaseOrderNo)
	in.Note = normalizeOptionalString(in.Note)
	if in.SupplierSnapshot == nil {
		in.SupplierSnapshot = map[string]any{}
	}
	if in.ContractPartySnapshot == nil {
		in.ContractPartySnapshot = map[string]any{}
	}
	if in.PurchaseOrderNo == "" || in.SupplierID <= 0 || in.PurchaseDate.IsZero() {
		return PurchaseOrderMutation{}, ErrBadParam
	}
	if err := validateOptionalDateNotBefore(in.PurchaseDate, in.ExpectedArrivalDate); err != nil {
		return PurchaseOrderMutation{}, err
	}
	return in, nil
}

func normalizePurchaseOrderItemMutation(in PurchaseOrderItemMutation) (PurchaseOrderItemMutation, error) {
	in, err := normalizePurchaseOrderItemFields(in)
	if err != nil {
		return PurchaseOrderItemMutation{}, err
	}
	if in.PurchaseOrderID <= 0 {
		return PurchaseOrderItemMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizePurchaseOrderItemFields(in PurchaseOrderItemMutation) (PurchaseOrderItemMutation, error) {
	in.MaterialCodeSnapshot = normalizeOptionalString(in.MaterialCodeSnapshot)
	in.MaterialNameSnapshot = normalizeOptionalString(in.MaterialNameSnapshot)
	in.ColorSnapshot = normalizeOptionalString(in.ColorSnapshot)
	in.ProductOrderNoSnapshot = normalizeOptionalString(in.ProductOrderNoSnapshot)
	in.ProductNoSnapshot = normalizeOptionalString(in.ProductNoSnapshot)
	in.ProductNameSnapshot = normalizeOptionalString(in.ProductNameSnapshot)
	in.Note = normalizeOptionalString(in.Note)
	if in.PurchaseOrderID < 0 || in.LineNo <= 0 || in.MaterialID <= 0 || in.UnitID <= 0 {
		return PurchaseOrderItemMutation{}, ErrBadParam
	}
	if _, err := value.NewPositiveQuantity(in.PurchasedQuantity); err != nil {
		return PurchaseOrderItemMutation{}, ErrBadParam
	}
	if err := value.ValidateOptionalNonNegativeMoney(in.UnitPrice); err != nil {
		return PurchaseOrderItemMutation{}, ErrBadParam
	}
	if err := value.ValidateOptionalNonNegativeMoney(in.Amount); err != nil {
		return PurchaseOrderItemMutation{}, ErrBadParam
	}
	normalizedAmount, err := normalizeCalculatedLineAmount(in.PurchasedQuantity, in.UnitPrice, in.Amount)
	if err != nil {
		return PurchaseOrderItemMutation{}, ErrBadParam
	}
	in.Amount = normalizedAmount
	return in, nil
}

func normalizePurchaseOrderFilter(in PurchaseOrderFilter) (PurchaseOrderFilter, error) {
	in.Keyword = strings.TrimSpace(in.Keyword)
	in.LifecycleStatus = strings.ToLower(strings.TrimSpace(in.LifecycleStatus))
	in.DateField = strings.TrimSpace(in.DateField)
	in.SortBy = strings.TrimSpace(in.SortBy)
	in.SortDirection = strings.ToLower(strings.TrimSpace(in.SortDirection))
	if in.LifecycleStatus != "" && !IsValidPurchaseOrderStatus(in.LifecycleStatus) {
		return PurchaseOrderFilter{}, ErrBadParam
	}
	if in.SupplierID < 0 {
		return PurchaseOrderFilter{}, ErrBadParam
	}
	switch in.DateField {
	case "", "purchase_date", "expected_arrival_date":
	default:
		return PurchaseOrderFilter{}, ErrBadParam
	}
	if in.DateField == "" && (in.DateFrom != nil || in.DateTo != nil) {
		in.DateField = "purchase_date"
	}
	if in.DateFrom != nil && in.DateTo != nil && in.DateFrom.After(*in.DateTo) {
		return PurchaseOrderFilter{}, ErrBadParam
	}
	switch in.SortBy {
	case "":
		in.SortBy = "updated_at"
	case "purchase_date", "expected_arrival_date", "updated_at":
	default:
		return PurchaseOrderFilter{}, ErrBadParam
	}
	switch in.SortDirection {
	case "":
		in.SortDirection = "desc"
	case "asc", "desc":
	default:
		return PurchaseOrderFilter{}, ErrBadParam
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}

func normalizePurchaseOrderItemFilter(in PurchaseOrderItemFilter) (PurchaseOrderItemFilter, error) {
	in.LineStatus = strings.ToLower(strings.TrimSpace(in.LineStatus))
	if in.PurchaseOrderID <= 0 {
		return PurchaseOrderItemFilter{}, ErrBadParam
	}
	if in.LineStatus != "" && !IsValidPurchaseOrderItemStatus(in.LineStatus) {
		return PurchaseOrderItemFilter{}, ErrBadParam
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in, nil
}

func IsValidPurchaseOrderStatus(value string) bool {
	return corestatus.IsPurchaseOrderStatus(value)
}

func IsValidPurchaseOrderItemStatus(value string) bool {
	return corestatus.IsPurchaseOrderItemStatus(value)
}

func IsPurchaseOrderLifecycleTransitionAllowed(current string, next string) bool {
	return corestatus.CanChangePurchaseOrderLifecycle(current, next)
}

func isPurchaseOrderSettled(status string) bool {
	return corestatus.IsPurchaseOrderSettled(status)
}
