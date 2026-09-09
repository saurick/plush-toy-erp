package biz

import (
	"context"
	"errors"
	"strings"
)

const (
	SalesOrderEngineeringPreparing = "PREPARING"
	SalesOrderEngineeringSampling  = "SAMPLING"
	SalesOrderEngineeringConfirmed = "CONFIRMED"
)

var (
	ErrSalesOrderEngineeringNotReady   = errors.New("sales order engineering requires product image and BOM")
	ErrSalesOrderEngineeringTransition = errors.New("sales order sampling transition invalid")
	ErrSalesOrderEngineeringDependency = errors.New("sales order engineering has downstream dependencies")
)

type SalesOrderEngineeringItemMutation struct {
	ID                   int
	ProductID            int
	ProductSkuID         *int
	SampleBOMID          *int
	ExpectedBOMVersion   int64
	ReuseConfirmedSample bool
	EngineeringStatus    string
	SampleNote           *string
}

type SalesOrderEngineeringMutation struct {
	SalesOrderID    int
	ExpectedVersion int
	ActorID         int
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
	for i := range normalized.Items {
		item := &normalized.Items[i]
		item.EngineeringStatus = strings.ToUpper(strings.TrimSpace(item.EngineeringStatus))
		item.SampleNote = normalizeOptionalString(item.SampleNote)
		if item.ID <= 0 || seen[item.ID] || item.ProductID < 0 ||
			(item.ProductSkuID != nil && (*item.ProductSkuID <= 0 || item.ProductID == 0)) ||
			(item.SampleBOMID != nil && (*item.SampleBOMID <= 0 || item.ProductID == 0 || item.ExpectedBOMVersion <= 0)) ||
			(item.SampleNote != nil && len([]rune(*item.SampleNote)) > 255) {
			return nil, ErrBadParam
		}
		seen[item.ID] = true
		switch item.EngineeringStatus {
		case SalesOrderEngineeringPreparing:
		case SalesOrderEngineeringSampling, SalesOrderEngineeringConfirmed:
			if item.ProductID == 0 || item.SampleBOMID == nil {
				return nil, ErrSalesOrderEngineeringNotReady
			}
		default:
			return nil, ErrBadParam
		}
	}
	return repo.SaveSalesOrderEngineering(ctx, &normalized)
}
