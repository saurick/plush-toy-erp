package data

import (
	"context"
	"server/internal/biz"
)

// Counts share the list predicates, but never its selected status or pagination.
func scanBusinessStatusCounts(ctx context.Context, scan func(context.Context, any) error) (map[string]int, error) {
	var rows []struct {
		Status          string `json:"status"`
		LifecycleStatus string `json:"lifecycle_status"`
		Count           int    `json:"count"`
	}
	if err := scan(ctx, &rows); err != nil {
		return nil, err
	}
	counts := make(map[string]int, len(rows))
	for _, row := range rows {
		status := row.Status
		if status == "" {
			status = row.LifecycleStatus
		}
		counts[status] = row.Count
	}
	return counts, nil
}

var (
	_ biz.SalesOrdersStatusCounter        = (*salesOrderRepo)(nil)
	_ biz.PurchaseOrdersStatusCounter     = (*purchaseOrderRepo)(nil)
	_ biz.OutsourcingOrdersStatusCounter  = (*outsourcingOrderRepo)(nil)
	_ biz.ProductionOrdersStatusCounter   = (*productionOrderRepo)(nil)
	_ biz.QualityInspectionsStatusCounter = (*inventoryRepo)(nil)
	_ biz.ShipmentsStatusCounter          = (*operationalFactRepo)(nil)
	_ biz.FinancePaymentsStatusCounter    = (*operationalFactRepo)(nil)
	_ biz.FinanceCreditNotesStatusCounter = (*operationalFactRepo)(nil)
)

var _ biz.FinanceFactsStatusCounter = (*operationalFactRepo)(nil)
