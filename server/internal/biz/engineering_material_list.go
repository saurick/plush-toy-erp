package biz

import (
	"context"
	"strings"
	"time"
)

type EngineeringMaterialListFilter struct {
	Keyword               string
	Status                string
	SortBy, SortDirection string
	Page                  int
	Limit                 int
	IncludeProductRefs    bool
}

// The list identifies submitted snapshots; detail reads retain the exact request ID.
type EngineeringMaterialListItem struct {
	ID           int                       `json:"id"`
	SalesOrderID int                       `json:"sales_order_id"`
	OrderNo      string                    `json:"order_no"`
	OrderStatus  string                    `json:"order_status"`
	Products     []string                  `json:"products"`
	ProductRefs  []DocumentProductIdentity `json:"product_refs,omitempty"`
	Status       string                    `json:"status"`
	SubmittedAt  time.Time                 `json:"submitted_at"`
}

type EngineeringMaterialList struct {
	Items []*EngineeringMaterialListItem `json:"items"`
	Total int                            `json:"total"`
}

func (uc *SalesOrderUsecase) ListEngineeringMaterialRequests(ctx context.Context, filter EngineeringMaterialListFilter) (*EngineeringMaterialList, error) {
	repo, ok := uc.repo.(interface {
		ListEngineeringMaterialRequests(context.Context, EngineeringMaterialListFilter) (*EngineeringMaterialList, error)
	})
	filter.Keyword = strings.TrimSpace(filter.Keyword)
	if !ok || !validWorkbenchSummarySort(filter.SortBy, filter.SortDirection, WorkbenchSummarySortOrderNo, WorkbenchSummarySortSubmittedAt) ||
		len([]rune(filter.Keyword)) > 100 || filter.Page < 1 || filter.Page > 100000 || filter.Limit < 1 || filter.Limit > 100 {
		return nil, ErrBadParam
	}
	switch filter.Status {
	case "", MaterialRequestSubmitted, MaterialRequestBossApproved, MaterialRequestApproved, MaterialRequestRejected:
	default:
		return nil, ErrBadParam
	}
	return repo.ListEngineeringMaterialRequests(ctx, filter)
}
