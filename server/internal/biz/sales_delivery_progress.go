package biz

import (
	"context"
	"time"
)

type SalesDeliveryMilestone struct {
	Label    string `json:"label"`
	Role     string `json:"role"`
	Assignee string `json:"assignee"`
	Status   string `json:"status"`
	Date     string `json:"date"`
	Reason   string `json:"reason"`
}

type SalesDeliveryProgress struct {
	OrderID        int                      `json:"order_id"`
	Label          string                   `json:"label"`
	Status         string                   `json:"status"`
	Customer       string                   `json:"customer"`
	Owner          string                   `json:"owner"`
	SnapshotAt     time.Time                `json:"snapshot_at"`
	Lines          []*BusinessProgressRow   `json:"lines"`
	Total          int                      `json:"total"`
	TasksAvailable bool                     `json:"tasks_available"`
	Current        *SalesDeliveryMilestone  `json:"current"`
	Recent         []SalesDeliveryMilestone `json:"recent"`
}

func (uc *BusinessProgressUsecase) SalesDelivery(ctx context.Context, orderID, limit, offset int, visibility *WorkflowTaskVisibilityScope) (*SalesDeliveryProgress, error) {
	if orderID <= 0 || uc == nil || uc.repo == nil {
		return nil, ErrBadParam
	}
	query := BusinessProgressQuery{
		ID: orderID, View: "orders", Scope: "all", Display: "lines", Limit: limit, Offset: offset, SnapshotAt: time.Now().UTC(),
		Access: BusinessProgressAccess{Sales: true}, TaskVisibility: visibility,
	}
	query, err := normalizeBusinessProgressQuery(query)
	if err != nil {
		return nil, err
	}
	return uc.repo.GetSalesDeliveryProgress(ctx, query)
}
