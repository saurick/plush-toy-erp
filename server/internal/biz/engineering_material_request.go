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
	OrderStatus        string                             `json:"order_status"`
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
	ID               int             `json:"id"`
	MaterialID       int             `json:"material_id"`
	UnitID           int             `json:"unit_id"`
	SupplierID       int             `json:"supplier_id"`
	MaterialCode     string          `json:"material_code"`
	MaterialName     string          `json:"material_name"`
	SupplierName     string          `json:"supplier_name"`
	SupplierItemNo   *string         `json:"supplier_item_no"`
	Color            *string         `json:"color"`
	Spec             *string         `json:"spec"`
	UnitName         string          `json:"unit_name"`
	RequiredQuantity decimal.Decimal `json:"required_quantity"`
}
type EngineeringMaterialPurchaseOrder struct {
	ID              int    `json:"id"`
	PurchaseOrderNo string `json:"purchase_order_no"`
	SupplierID      int    `json:"supplier_id"`
	SupplierName    string `json:"supplier_name"`
}
type EngineeringMaterialSubmit struct {
	SalesOrderID        int
	ExpectedVersion     int
	ExpectedSourceHash  string
	ActorID             int
	WorkflowTaskID      int
	ExpectedTaskVersion int
}
type EngineeringMaterialReview struct {
	ID                  int
	ExpectedVersion     int
	ActorID             int
	Action              string
	ReviewStage         string
	Note                *string
	WorkflowTaskID      int
	ExpectedTaskVersion int
}
type EngineeringMaterialRequestRepo interface {
	GetEngineeringMaterialRequest(context.Context, int, bool) (*EngineeringMaterialRequest, error)
	SubmitEngineeringMaterialRequest(context.Context, *EngineeringMaterialSubmit) (*EngineeringMaterialRequest, error)
	ReviewEngineeringMaterialRequest(context.Context, *EngineeringMaterialReview) (*EngineeringMaterialRequest, error)
}

func (uc *SalesOrderUsecase) GetEngineeringMaterialRequestByID(ctx context.Context, orderID, requestID int) (*EngineeringMaterialRequest, error) {
	repo, ok := uc.repo.(interface {
		GetEngineeringMaterialRequestByID(context.Context, int, int) (*EngineeringMaterialRequest, error)
	})
	if !ok || orderID <= 0 || requestID <= 0 {
		return nil, ErrBadParam
	}
	return repo.GetEngineeringMaterialRequestByID(ctx, orderID, requestID)
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
	if !validMaterialTaskVersion(in.WorkflowTaskID, in.ExpectedTaskVersion) {
		return nil, ErrBadParam
	}
	return repo.SubmitEngineeringMaterialRequest(ctx, in)
}
func (uc *SalesOrderUsecase) ReviewEngineeringMaterialRequest(ctx context.Context, in *EngineeringMaterialReview) (*EngineeringMaterialRequest, error) {
	repo, ok := uc.repo.(EngineeringMaterialRequestRepo)
	if !ok || in == nil || in.ID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 {
		return nil, ErrBadParam
	}
	if !validMaterialTaskVersion(in.WorkflowTaskID, in.ExpectedTaskVersion) {
		return nil, ErrBadParam
	}
	copy := *in
	copy.Note = normalizeOptionalString(in.Note)
	if copy.Note != nil && len(*copy.Note) > 255 {
		return nil, ErrBadParam
	}
	if copy.Action == "REJECT" && (copy.Note == nil || (copy.ReviewStage != "BOSS" && copy.ReviewStage != "FINANCE")) {
		return nil, ErrMaterialRequestReviewInvalid
	}
	switch copy.Action {
	case "BOSS_APPROVE", "FINANCE_APPROVE", "REJECT":
	default:
		return nil, ErrBadParam
	}
	return repo.ReviewEngineeringMaterialRequest(ctx, &copy)
}

func validMaterialTaskVersion(taskID, version int) bool {
	return (taskID == 0 && version == 0) || (taskID > 0 && version > 0)
}

// MaterialPartUsage matches the engineering sheet: usage already includes the
// piece count for that position. Multiplying piece_count again would double count.
func MaterialPartUsage(productionQuantity, unitUsage, lossRate decimal.Decimal) decimal.Decimal {
	return productionQuantity.Mul(unitUsage).Mul(decimal.NewFromInt(1).Add(lossRate)).Round(6)
}
