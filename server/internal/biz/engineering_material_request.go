package biz

import (
	"context"
	"errors"
	"github.com/shopspring/decimal"
	"time"
)

const (
	MaterialRequestSubmitted    = "SUBMITTED"
	MaterialRequestBossApproved = "BOSS_APPROVED"
	MaterialRequestApproved     = "APPROVED"
	MaterialRequestRejected     = "REJECTED"
)

var (
	ErrMaterialRequestNotReady      = errors.New("engineering material request sources not ready")
	ErrMaterialRequestConflict      = errors.New("engineering material request changed")
	ErrMaterialRequestReviewInvalid = errors.New("engineering material request review invalid")
)

type EngineeringMaterialRequest struct {
	ID                 int                                `json:"id"`
	SalesOrderID       int                                `json:"sales_order_id"`
	OrderNo            string                             `json:"order_no"`
	SourceOrderVersion int                                `json:"source_order_version"`
	SourceHash         string                             `json:"source_hash"`
	Status             string                             `json:"status"`
	Version            int                                `json:"version"`
	Sources            []map[string]any                   `json:"sources"`
	Items              []*EngineeringMaterialRequestItem  `json:"items"`
	Issues             []string                           `json:"issues"`
	SubmittedBy        int                                `json:"submitted_by"`
	SubmittedAt        *time.Time                         `json:"submitted_at"`
	BossReviewedBy     *int                               `json:"boss_reviewed_by"`
	BossReviewedAt     *time.Time                         `json:"boss_reviewed_at"`
	FinanceReviewedBy  *int                               `json:"finance_reviewed_by"`
	FinanceReviewedAt  *time.Time                         `json:"finance_reviewed_at"`
	RejectedBy         *int                               `json:"rejected_by"`
	RejectedAt         *time.Time                         `json:"rejected_at"`
	ReviewNote         *string                            `json:"review_note"`
	BossReviewNote     *string                            `json:"boss_review_note"`
	FinanceReviewNote  *string                            `json:"finance_review_note"`
	PurchaseOrders     []EngineeringMaterialPurchaseOrder `json:"purchase_orders"`
}
type EngineeringMaterialRequestItem struct {
	ID                  int              `json:"id"`
	MaterialID          int              `json:"material_id"`
	UnitID              int              `json:"unit_id"`
	SupplierID          int              `json:"supplier_id"`
	MaterialCode        string           `json:"material_code"`
	MaterialName        string           `json:"material_name"`
	SupplierName        string           `json:"supplier_name"`
	SupplierItemNo      *string          `json:"supplier_item_no"`
	Color               *string          `json:"color"`
	Spec                *string          `json:"spec"`
	UnitName            string           `json:"unit_name"`
	RequiredQuantity    decimal.Decimal  `json:"required_quantity"`
	PurchaseQuantity    *decimal.Decimal `json:"purchase_quantity"`
	UnitPrice           *decimal.Decimal `json:"unit_price"`
	ExpectedArrivalDate *time.Time       `json:"expected_arrival_date"`
	Note                *string          `json:"note"`
}
type EngineeringMaterialPurchaseOrder struct {
	ID              int    `json:"id"`
	PurchaseOrderNo string `json:"purchase_order_no"`
	SupplierID      int    `json:"supplier_id"`
}
type EngineeringMaterialSubmit struct {
	SalesOrderID       int
	ExpectedVersion    int
	ExpectedSourceHash string
	ActorID            int
}
type EngineeringMaterialReview struct {
	ID              int
	ExpectedVersion int
	ActorID         int
	Action          string
	ReviewStage     string
	Note            *string
	Items           []EngineeringMaterialFinanceLine
}
type EngineeringMaterialFinanceLine struct {
	ID                  int
	PurchaseQuantity    decimal.Decimal
	UnitPrice           decimal.Decimal
	ExpectedArrivalDate time.Time
	Note                *string
}
type EngineeringMaterialRequestRepo interface {
	GetEngineeringMaterialRequest(context.Context, int, bool) (*EngineeringMaterialRequest, error)
	SubmitEngineeringMaterialRequest(context.Context, *EngineeringMaterialSubmit) (*EngineeringMaterialRequest, error)
	ReviewEngineeringMaterialRequest(context.Context, *EngineeringMaterialReview) (*EngineeringMaterialRequest, error)
}

func (uc *SalesOrderUsecase) GetEngineeringMaterialRequest(ctx context.Context, orderID int, preview bool) (*EngineeringMaterialRequest, error) {
	repo, ok := uc.repo.(EngineeringMaterialRequestRepo)
	if !ok || orderID <= 0 {
		return nil, ErrBadParam
	}
	return repo.GetEngineeringMaterialRequest(ctx, orderID, preview)
}
func (uc *SalesOrderUsecase) SubmitEngineeringMaterialRequest(ctx context.Context, in *EngineeringMaterialSubmit) (*EngineeringMaterialRequest, error) {
	repo, ok := uc.repo.(EngineeringMaterialRequestRepo)
	if !ok || in == nil || in.SalesOrderID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 || len(in.ExpectedSourceHash) != 64 {
		return nil, ErrBadParam
	}
	return repo.SubmitEngineeringMaterialRequest(ctx, in)
}
func (uc *SalesOrderUsecase) ReviewEngineeringMaterialRequest(ctx context.Context, in *EngineeringMaterialReview) (*EngineeringMaterialRequest, error) {
	repo, ok := uc.repo.(EngineeringMaterialRequestRepo)
	if !ok || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 {
		return nil, ErrBadParam
	}
	copy := *in
	copy.Note = normalizeOptionalString(in.Note)
	if copy.Note != nil && len([]rune(*copy.Note)) > 255 {
		return nil, ErrBadParam
	}
	if copy.Action == "REJECT" && (copy.Note == nil || (copy.ReviewStage != "BOSS" && copy.ReviewStage != "FINANCE")) {
		return nil, ErrMaterialRequestReviewInvalid
	}
	switch copy.Action {
	case "BOSS_APPROVE", "REJECT":
		if len(copy.Items) != 0 {
			return nil, ErrBadParam
		}
	case "FINANCE_APPROVE":
		if len(copy.Items) == 0 || len(copy.Items) > 2000 {
			return nil, ErrBadParam
		}
		copy.Items = append([]EngineeringMaterialFinanceLine(nil), in.Items...)
		seen := map[int]bool{}
		for i := range copy.Items {
			line := &copy.Items[i]
			line.Note = normalizeOptionalString(line.Note)
			if line.ID <= 0 || seen[line.ID] || line.PurchaseQuantity.IsNegative() || !line.PurchaseQuantity.Equal(line.PurchaseQuantity.Round(6)) || line.UnitPrice.IsNegative() || !line.UnitPrice.Equal(line.UnitPrice.Round(6)) || line.ExpectedArrivalDate.IsZero() || (line.Note != nil && len([]rune(*line.Note)) > 255) {
				return nil, ErrBadParam
			}
			if line.PurchaseQuantity.GreaterThanOrEqual(decimal.New(1, 14)) || line.UnitPrice.GreaterThanOrEqual(decimal.New(1, 14)) || line.PurchaseQuantity.Mul(line.UnitPrice).GreaterThanOrEqual(decimal.New(1, 14)) {
				return nil, ErrBadParam
			}
			seen[line.ID] = true
		}
	default:
		return nil, ErrBadParam
	}
	return repo.ReviewEngineeringMaterialRequest(ctx, &copy)
}

// MaterialPartUsage matches the engineering sheet: usage already includes the
// piece count for that position. Multiplying piece_count again would double count.
func MaterialPartUsage(productionQuantity, unitUsage, lossRate decimal.Decimal) decimal.Decimal {
	return productionQuantity.Mul(unitUsage).Mul(decimal.NewFromInt(1).Add(lossRate)).Round(6)
}
