package biz

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/shopspring/decimal"
)

const (
	ProductionOrderStatusDraft     = "DRAFT"
	ProductionOrderStatusReleased  = "RELEASED"
	ProductionOrderStatusClosed    = "CLOSED"
	ProductionOrderStatusCancelled = "CANCELLED"

	ProductionOrderCommandCreate  = "CREATE"
	ProductionOrderCommandSave    = "SAVE"
	ProductionOrderCommandRelease = "RELEASE"
	ProductionOrderCommandClose   = "CLOSE"
	ProductionOrderCommandCancel  = "CANCEL"

	ProductionOrderMaterialRequirementsNotRequired = "NOT_REQUIRED"
	ProductionOrderMaterialRequirementsReady       = "READY"
	ProductionOrderMaterialRequirementsNeedsReview = "NEEDS_REVIEW"

	ProductionOrderMutationResultV1 = "production.order-mutation-result/v1"
	ProductionOrderSourceType       = "PRODUCTION_ORDER"

	ProductionOrderReferenceProduct        = "product"
	ProductionOrderReferenceProductSKU     = "product_sku"
	ProductionOrderReferenceUnit           = "unit"
	ProductionOrderReferenceSalesOrderItem = "sales_order_item"
	ProductionOrderReferenceActiveBOM      = "active_bom"
)

var (
	ErrProductionOrderNotFound                       = errors.New("production order not found")
	ErrProductionOrderConflict                       = errors.New("production order version conflict")
	ErrProductionOrderInvalidState                   = errors.New("production order invalid state")
	ErrProductionOrderReferenceInvalid               = errors.New("production order reference invalid")
	ErrProductionOrderReceiptCorrupt                 = errors.New("production order receipt corrupt")
	ErrProductionOrderFactSourceInvalid              = errors.New("production order fact source invalid")
	ErrProductionOrderQuantityExceeded               = errors.New("production order finished quantity exceeded")
	ErrProductionOrderMaterialRequirementNotFound    = errors.New("production order material requirement not found")
	ErrProductionOrderMaterialRequirementInvalid     = errors.New("production order material requirement invalid")
	ErrProductionOrderMaterialRequirementsNeedReview = errors.New("production order material requirements need review")
	ErrProductionOrderMaterialIssueQuantityExceeded  = errors.New("production order material issue quantity exceeded")
	ErrProductionOrderHasPostedFacts                 = errors.New("production order has posted facts")
	ErrProductionOrderCloseReasonRequired            = errors.New("production order close reason required")
)

type ProductionOrder struct {
	ID             int        `json:"id"`
	OrderNo        string     `json:"order_no"`
	Status         string     `json:"status"`
	Version        int        `json:"version"`
	ItemCount      *int       `json:"item_count,omitempty"` // List-only projection; nil when the count was not loaded.
	PlannedStartAt *time.Time `json:"planned_start_at,omitempty"`
	PlannedEndAt   *time.Time `json:"planned_end_at,omitempty"`
	Note           *string    `json:"note,omitempty"`
	CloseReason    *string    `json:"close_reason,omitempty"`
	CancelReason   *string    `json:"cancel_reason,omitempty"`
	CreatedBy      int        `json:"created_by"`
	ReleasedBy     *int       `json:"released_by,omitempty"`
	ClosedBy       *int       `json:"closed_by,omitempty"`
	CancelledBy    *int       `json:"cancelled_by,omitempty"`
	ReleasedAt     *time.Time `json:"released_at,omitempty"`
	ClosedAt       *time.Time `json:"closed_at,omitempty"`
	CancelledAt    *time.Time `json:"cancelled_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type ProductionOrderItem struct {
	ID                  int             `json:"id"`
	ProductionOrderID   int             `json:"production_order_id"`
	LineNo              int             `json:"line_no"`
	ProductID           int             `json:"product_id"`
	ProductSKUID        *int            `json:"product_sku_id,omitempty"`
	UnitID              int             `json:"unit_id"`
	PlannedQuantity     decimal.Decimal `json:"planned_quantity"`
	SalesOrderItemID    *int            `json:"sales_order_item_id,omitempty"`
	BOMHeaderID         *int            `json:"bom_header_id,omitempty"`
	ProductCodeSnapshot *string         `json:"product_code_snapshot,omitempty"`
	ProductNameSnapshot *string         `json:"product_name_snapshot,omitempty"`
	SKUCodeSnapshot     *string         `json:"sku_code_snapshot,omitempty"`
	UnitNameSnapshot    *string         `json:"unit_name_snapshot,omitempty"`
	BOMVersionSnapshot  *string         `json:"bom_version_snapshot,omitempty"`
	Note                *string         `json:"note,omitempty"`
	CreatedAt           time.Time       `json:"created_at"`
	UpdatedAt           time.Time       `json:"updated_at"`
}

// ProductionOrderMaterialRequirement is an immutable release-time BOM
// snapshot. IssuedQuantity and RemainingQuantity are query projections derived
// from posted production material issues.
type ProductionOrderMaterialRequirement struct {
	ID                    int             `json:"id"`
	ProductionOrderID     int             `json:"production_order_id"`
	ProductionOrderItemID int             `json:"production_order_item_id"`
	BOMHeaderID           int             `json:"bom_header_id"`
	BOMItemID             int             `json:"bom_item_id"`
	MaterialID            int             `json:"material_id"`
	UnitID                int             `json:"unit_id"`
	UnitQuantitySnapshot  decimal.Decimal `json:"unit_quantity_snapshot"`
	LossRateSnapshot      decimal.Decimal `json:"loss_rate_snapshot"`
	PlannedQuantity       decimal.Decimal `json:"planned_quantity"`
	IssuedQuantity        decimal.Decimal `json:"issued_quantity"`
	RemainingQuantity     decimal.Decimal `json:"remaining_quantity"`
	MaterialCodeSnapshot  string          `json:"material_code_snapshot"`
	MaterialNameSnapshot  string          `json:"material_name_snapshot"`
	UnitCodeSnapshot      string          `json:"unit_code_snapshot"`
	UnitNameSnapshot      string          `json:"unit_name_snapshot"`
	CreatedAt             time.Time       `json:"created_at"`
	UpdatedAt             time.Time       `json:"updated_at"`
}

type ProductionOrderAggregate struct {
	Order                     *ProductionOrder                      `json:"order"`
	Items                     []*ProductionOrderItem                `json:"items"`
	MaterialRequirements      []*ProductionOrderMaterialRequirement `json:"material_requirements"`
	MaterialRequirementsState string                                `json:"material_requirements_state"`
}

type ProductionOrderDraftItem struct {
	LineNo           int
	ProductID        int
	ProductSKUID     *int
	UnitID           int
	PlannedQuantity  decimal.Decimal
	SalesOrderItemID *int
	BOMHeaderID      *int
	Note             *string
}

type ProductionOrderDraft struct {
	OrderNo        string
	PlannedStartAt *time.Time
	PlannedEndAt   *time.Time
	Note           *string
	Items          []ProductionOrderDraftItem
}

type ProductionOrderCreate struct {
	Draft          ProductionOrderDraft
	ActorID        int
	IdempotencyKey string
}

type ProductionOrderSave struct {
	ID              int
	ExpectedVersion int
	Draft           ProductionOrderDraft
	ActorID         int
	IdempotencyKey  string
}

type ProductionOrderAction struct {
	ID              int
	ExpectedVersion int
	ActorID         int
	IdempotencyKey  string
	Reason          *string
}

type ProductionOrderCreateCommand struct {
	Draft          ProductionOrderDraft
	ActorID        int
	IdempotencyKey string
	IntentHash     string
}

type ProductionOrderSaveCommand struct {
	ID              int
	ExpectedVersion int
	Draft           ProductionOrderDraft
	ActorID         int
	IdempotencyKey  string
	IntentHash      string
}

type ProductionOrderActionCommand struct {
	ID              int
	ExpectedVersion int
	ActorID         int
	IdempotencyKey  string
	IntentHash      string
	Reason          *string
	CommandKey      string
}

type ProductionOrderFilter struct {
	Keyword       string
	Status        string
	DateField     string
	DateFrom      *time.Time
	DateTo        *time.Time
	SortBy        string
	SortDirection string
	Limit         int
	Offset        int
}

type ProductionOrderReferenceFilter struct {
	ReferenceType string
	Keyword       string
	ProductID     int
	ProductSKUID  int
	UnitID        int
	SelectedIDs   []int
	Limit         int
	Offset        int
}

type ProductionOrderReferenceOption struct {
	ReferenceType     string
	Value             int
	Label             string
	Selectable        bool
	Reason            *string
	ProductValue      *int
	SKUValue          *int
	UnitValue         *int
	Code              *string
	Name              *string
	StyleNo           *string
	CustomerStyleNo   *string
	SKUCode           *string
	SKUName           *string
	Color             *string
	ColorNo           *string
	Size              *string
	PackagingVersion  *string
	UnitCode          *string
	UnitName          *string
	UnitPrecision     *int
	SalesOrderNo      *string
	SalesLineNo       *int
	OrderedQuantity   *string
	PlannedDeliveryAt *time.Time
	SalesOrderStatus  *string
	SalesLineStatus   *string
	BOMVersion        *string
	EffectiveFrom     *time.Time
	EffectiveTo       *time.Time
}

type ProductionOrderRepo interface {
	CreateProductionOrderDraft(ctx context.Context, in *ProductionOrderCreateCommand) (*ProductionOrderAggregate, error)
	SaveProductionOrderDraft(ctx context.Context, in *ProductionOrderSaveCommand) (*ProductionOrderAggregate, error)
	ApplyProductionOrderAction(ctx context.Context, in *ProductionOrderActionCommand) (*ProductionOrderAggregate, error)
	GetProductionOrderAggregate(ctx context.Context, id int) (*ProductionOrderAggregate, error)
	ListProductionOrders(ctx context.Context, filter ProductionOrderFilter) ([]*ProductionOrder, int, error)
	ListProductionOrderReferenceOptions(ctx context.Context, filter ProductionOrderReferenceFilter) ([]*ProductionOrderReferenceOption, int, error)
}

func (uc *ProductionOrderUsecase) Get(ctx context.Context, id int) (*ProductionOrderAggregate, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetProductionOrderAggregate(ctx, id)
}

func (uc *ProductionOrderUsecase) List(ctx context.Context, filter ProductionOrderFilter) ([]*ProductionOrder, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	filter.Status = strings.TrimSpace(filter.Status)
	filter.DateField = strings.TrimSpace(filter.DateField)
	filter.SortBy = strings.TrimSpace(filter.SortBy)
	filter.SortDirection = strings.ToLower(strings.TrimSpace(filter.SortDirection))
	if filter.Limit <= 0 || filter.Limit > 200 || filter.Offset < 0 ||
		(filter.DateFrom != nil && filter.DateTo != nil && filter.DateFrom.After(*filter.DateTo)) ||
		!validProductionOrderStatusFilter(filter.Status) || !validProductionOrderDateField(filter.DateField) ||
		!validProductionOrderSort(filter.SortBy, filter.SortDirection) {
		return nil, 0, ErrBadParam
	}
	if filter.DateField == "" && (filter.DateFrom != nil || filter.DateTo != nil) {
		filter.DateField = "planned_start_at"
	}
	if filter.SortBy == "" {
		filter.SortBy = "updated_at"
	}
	if filter.SortDirection == "" {
		filter.SortDirection = "desc"
	}
	return uc.repo.ListProductionOrders(ctx, filter)
}

func (uc *ProductionOrderUsecase) ListReferenceOptions(ctx context.Context, filter ProductionOrderReferenceFilter) ([]*ProductionOrderReferenceOption, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	filter.ReferenceType = strings.TrimSpace(filter.ReferenceType)
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	if !validProductionOrderReferenceType(filter.ReferenceType) || filter.Limit < 1 || filter.Limit > 50 || filter.Offset < 0 || len(filter.SelectedIDs) > 50 {
		return nil, 0, ErrBadParam
	}
	if len(filter.SelectedIDs) > 0 && (filter.Keyword != "" || filter.Offset != 0) {
		return nil, 0, ErrBadParam
	}
	seen := make(map[int]struct{}, len(filter.SelectedIDs))
	for _, id := range filter.SelectedIDs {
		if id <= 0 {
			return nil, 0, ErrBadParam
		}
		if _, exists := seen[id]; exists {
			return nil, 0, ErrBadParam
		}
		seen[id] = struct{}{}
	}
	if len(filter.SelectedIDs) > 0 {
		if filter.ProductID != 0 || filter.ProductSKUID != 0 || filter.UnitID != 0 {
			return nil, 0, ErrBadParam
		}
		// 历史回显按已保存引用批量解析，不受当前级联选择状态影响。
		filter.Limit = len(filter.SelectedIDs)
		return uc.repo.ListProductionOrderReferenceOptions(ctx, filter)
	}
	switch filter.ReferenceType {
	case ProductionOrderReferenceProduct, ProductionOrderReferenceUnit:
		if filter.ProductID != 0 || filter.ProductSKUID != 0 || filter.UnitID != 0 {
			return nil, 0, ErrBadParam
		}
	case ProductionOrderReferenceProductSKU, ProductionOrderReferenceActiveBOM:
		if filter.ProductID <= 0 || filter.ProductSKUID != 0 || filter.UnitID != 0 {
			return nil, 0, ErrBadParam
		}
	case ProductionOrderReferenceSalesOrderItem:
		if filter.ProductID < 0 || filter.UnitID < 0 || filter.ProductSKUID < 0 {
			return nil, 0, ErrBadParam
		}
	default:
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListProductionOrderReferenceOptions(ctx, filter)
}

func validProductionOrderReferenceType(value string) bool {
	switch value {
	case ProductionOrderReferenceProduct, ProductionOrderReferenceProductSKU, ProductionOrderReferenceUnit, ProductionOrderReferenceSalesOrderItem, ProductionOrderReferenceActiveBOM:
		return true
	default:
		return false
	}
}

func validProductionOrderStatusFilter(status string) bool {
	switch status {
	case "", ProductionOrderStatusDraft, ProductionOrderStatusReleased, ProductionOrderStatusClosed, ProductionOrderStatusCancelled:
		return true
	default:
		return false
	}
}

func validProductionOrderDateField(field string) bool {
	switch field {
	case "", "planned_start_at", "planned_end_at", "created_at", "updated_at":
		return true
	default:
		return false
	}
}

func validProductionOrderSort(field, direction string) bool {
	switch field {
	case "", "order_no", "planned_start_at", "planned_end_at", "created_at", "updated_at":
	default:
		return false
	}
	return direction == "" || direction == "asc" || direction == "desc"
}

type ProductionOrderUsecase struct {
	repo ProductionOrderRepo
}

func NewProductionOrderUsecase(repo ProductionOrderRepo) *ProductionOrderUsecase {
	return &ProductionOrderUsecase{repo: repo}
}

func (uc *ProductionOrderUsecase) CreateDraft(ctx context.Context, in *ProductionOrderCreate) (*ProductionOrderAggregate, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	draft, key, err := normalizeProductionOrderCommand(in.Draft, in.ActorID, in.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	hash, err := productionOrderIntentHash(ProductionOrderCommandCreate, draft, nil)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateProductionOrderDraft(ctx, &ProductionOrderCreateCommand{Draft: draft, ActorID: in.ActorID, IdempotencyKey: key, IntentHash: hash})
}

func (uc *ProductionOrderUsecase) SaveDraft(ctx context.Context, in *ProductionOrderSave) (*ProductionOrderAggregate, error) {
	if uc == nil || uc.repo == nil || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 {
		return nil, ErrBadParam
	}
	draft, key, err := normalizeProductionOrderCommand(in.Draft, in.ActorID, in.IdempotencyKey)
	if err != nil {
		return nil, err
	}
	hash, err := productionOrderIntentHash(ProductionOrderCommandSave, draft, nil)
	if err != nil {
		return nil, err
	}
	return uc.repo.SaveProductionOrderDraft(ctx, &ProductionOrderSaveCommand{ID: in.ID, ExpectedVersion: in.ExpectedVersion, Draft: draft, ActorID: in.ActorID, IdempotencyKey: key, IntentHash: hash})
}

func (uc *ProductionOrderUsecase) Release(ctx context.Context, in *ProductionOrderAction) (*ProductionOrderAggregate, error) {
	return uc.applyAction(ctx, in, ProductionOrderCommandRelease)
}

func (uc *ProductionOrderUsecase) Close(ctx context.Context, in *ProductionOrderAction) (*ProductionOrderAggregate, error) {
	return uc.applyAction(ctx, in, ProductionOrderCommandClose)
}

func (uc *ProductionOrderUsecase) Cancel(ctx context.Context, in *ProductionOrderAction) (*ProductionOrderAggregate, error) {
	return uc.applyAction(ctx, in, ProductionOrderCommandCancel)
}

func (uc *ProductionOrderUsecase) applyAction(ctx context.Context, in *ProductionOrderAction, command string) (*ProductionOrderAggregate, error) {
	if uc == nil || uc.repo == nil || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 {
		return nil, ErrBadParam
	}
	key := strings.TrimSpace(in.IdempotencyKey)
	if key == "" || len(key) > 128 {
		return nil, ErrBadParam
	}
	reason := normalizeOptionalProductionOrderText(in.Reason)
	if reason != nil && len(*reason) > 255 {
		return nil, ErrBadParam
	}
	if command == ProductionOrderCommandCancel && reason == nil {
		return nil, ErrBadParam
	}
	if command == ProductionOrderCommandRelease && reason != nil {
		return nil, ErrBadParam
	}
	hash, err := productionOrderIntentHash(command, ProductionOrderDraft{}, reason)
	if err != nil {
		return nil, err
	}
	return uc.repo.ApplyProductionOrderAction(ctx, &ProductionOrderActionCommand{
		ID: in.ID, ExpectedVersion: in.ExpectedVersion, ActorID: in.ActorID,
		IdempotencyKey: key, IntentHash: hash, Reason: reason, CommandKey: command,
	})
}

func normalizeProductionOrderCommand(draft ProductionOrderDraft, actorID int, rawKey string) (ProductionOrderDraft, string, error) {
	key := strings.TrimSpace(rawKey)
	draft.OrderNo = strings.TrimSpace(draft.OrderNo)
	draft.Note = normalizeOptionalProductionOrderText(draft.Note)
	draft.PlannedStartAt = normalizeProductionOrderTime(draft.PlannedStartAt)
	draft.PlannedEndAt = normalizeProductionOrderTime(draft.PlannedEndAt)
	if actorID <= 0 || key == "" || len(key) > 128 || draft.OrderNo == "" || len(draft.OrderNo) > 64 || (draft.Note != nil && len(*draft.Note) > 255) || len(draft.Items) == 0 {
		return ProductionOrderDraft{}, "", ErrBadParam
	}
	if draft.PlannedStartAt != nil && draft.PlannedEndAt != nil && draft.PlannedEndAt.Before(*draft.PlannedStartAt) {
		return ProductionOrderDraft{}, "", ErrBadParam
	}
	seen := make(map[int]struct{}, len(draft.Items))
	items := append([]ProductionOrderDraftItem(nil), draft.Items...)
	for i := range items {
		item := &items[i]
		item.Note = normalizeOptionalProductionOrderText(item.Note)
		if item.LineNo <= 0 || item.ProductID <= 0 || item.UnitID <= 0 || !item.PlannedQuantity.GreaterThan(decimal.Zero) || (item.Note != nil && len(*item.Note) > 255) {
			return ProductionOrderDraft{}, "", ErrBadParam
		}
		if _, ok := seen[item.LineNo]; ok {
			return ProductionOrderDraft{}, "", ErrBadParam
		}
		seen[item.LineNo] = struct{}{}
		if (item.ProductSKUID != nil && *item.ProductSKUID <= 0) || (item.SalesOrderItemID != nil && *item.SalesOrderItemID <= 0) || (item.BOMHeaderID != nil && *item.BOMHeaderID <= 0) {
			return ProductionOrderDraft{}, "", ErrBadParam
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].LineNo < items[j].LineNo })
	draft.Items = items
	return draft, key, nil
}

func normalizeProductionOrderTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	normalized := value.UTC()
	return &normalized
}

func normalizeOptionalProductionOrderText(value *string) *string {
	if value == nil {
		return nil
	}
	normalized := strings.TrimSpace(*value)
	if normalized == "" {
		return nil
	}
	return &normalized
}

type productionOrderIntentItem struct {
	LineNo           int     `json:"line_no"`
	ProductID        int     `json:"product_id"`
	ProductSKUID     *int    `json:"product_sku_id,omitempty"`
	UnitID           int     `json:"unit_id"`
	PlannedQuantity  string  `json:"planned_quantity"`
	SalesOrderItemID *int    `json:"sales_order_item_id,omitempty"`
	BOMHeaderID      *int    `json:"bom_header_id,omitempty"`
	Note             *string `json:"note,omitempty"`
}

func productionOrderIntentHash(command string, draft ProductionOrderDraft, reason *string) (string, error) {
	intent := struct {
		Command      string                      `json:"command"`
		OrderNo      string                      `json:"order_no,omitempty"`
		PlannedStart *time.Time                  `json:"planned_start_at,omitempty"`
		PlannedEnd   *time.Time                  `json:"planned_end_at,omitempty"`
		Note         *string                     `json:"note,omitempty"`
		Items        []productionOrderIntentItem `json:"items,omitempty"`
		Reason       *string                     `json:"reason,omitempty"`
	}{Command: command, OrderNo: draft.OrderNo, PlannedStart: draft.PlannedStartAt, PlannedEnd: draft.PlannedEndAt, Note: draft.Note, Reason: reason}
	if len(draft.Items) > 0 {
		intent.Items = make([]productionOrderIntentItem, 0, len(draft.Items))
		for _, item := range draft.Items {
			intent.Items = append(intent.Items, productionOrderIntentItem{
				LineNo: item.LineNo, ProductID: item.ProductID, ProductSKUID: item.ProductSKUID,
				UnitID: item.UnitID, PlannedQuantity: item.PlannedQuantity.String(),
				SalesOrderItemID: item.SalesOrderItemID, BOMHeaderID: item.BOMHeaderID, Note: item.Note,
			})
		}
	}
	payload, err := json.Marshal(intent)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}
