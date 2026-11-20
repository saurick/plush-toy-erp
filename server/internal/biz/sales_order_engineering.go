package biz

import (
	"context"
	"errors"
)

var (
	ErrSalesOrderEngineeringNotReady   = errors.New("sales order engineering BOM is not ready")
	ErrSalesOrderEngineeringTransition = errors.New("sales order engineering source change invalid")
	ErrSalesOrderEngineeringDependency = errors.New("sales order engineering has downstream dependencies")
)

type SalesOrderEngineeringItemMutation struct {
	ID                 int
	ProductID          int
	ProductSkuID       *int
	BOMID              *int
	ExpectedBOMVersion int64
}

type SalesOrderEngineeringMutation struct {
	SalesOrderID    int
	ExpectedVersion int
	ActorID         int
	Complete        bool
	Items           []SalesOrderEngineeringItemMutation
}

type SalesOrderEngineeringRepo interface {
	SaveSalesOrderEngineering(context.Context, *SalesOrderEngineeringMutation) (*SalesOrderWithItems, error)
}

func (uc *SalesOrderUsecase) SaveSalesOrderEngineering(ctx context.Context, in *SalesOrderEngineeringMutation) (*SalesOrderWithItems, error) {
	if uc == nil || in == nil || in.SalesOrderID <= 0 || in.ExpectedVersion <= 0 || in.ActorID <= 0 || len(in.Items) == 0 {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(SalesOrderEngineeringRepo)
	if !ok {
		return nil, ErrBadParam
	}
	normalized := *in
	normalized.Items = append([]SalesOrderEngineeringItemMutation(nil), in.Items...)
	seen := map[int]bool{}
	productBOMs := map[int]int{}
	for i := range normalized.Items {
		item := &normalized.Items[i]
		if item.ID <= 0 || seen[item.ID] || item.ProductID < 0 ||
			(item.ProductSkuID != nil && (*item.ProductSkuID <= 0 || item.ProductID == 0)) ||
			(item.BOMID != nil && (*item.BOMID <= 0 || item.ProductID == 0 || item.ExpectedBOMVersion <= 0)) {
			return nil, ErrBadParam
		}
		seen[item.ID] = true
		if in.Complete && item.BOMID != nil {
			if prior, exists := productBOMs[item.ProductID]; exists && prior != *item.BOMID {
				return nil, ErrBOMActiveConflict
			}
			productBOMs[item.ProductID] = *item.BOMID
		}
		if in.Complete && (item.ProductID == 0 || item.BOMID == nil) {
			return nil, ErrSalesOrderEngineeringNotReady
		}
	}
	return repo.SaveSalesOrderEngineering(ctx, &normalized)
}
