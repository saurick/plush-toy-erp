package biz

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"sort"
	"time"
)

var ErrProductionWIPPreparedContractDependency = errors.New("production batch has prepared outsourcing contract")

type ProductionOutsourcingPrepare struct {
	BatchID            int
	ExpectedVersion    int
	SupplierID         int
	RequirementIDs     []int
	ExpectedReturnDate time.Time
	ActorID            int
	IntentHash         string
}
type ProductionOutsourcingPrepared struct {
	OutsourcingOrderID int    `json:"outsourcing_order_id"`
	OutsourcingOrderNo string `json:"outsourcing_order_no"`
}
type ProductionOutsourcingPrepareRepo interface {
	PrepareProductionOutsourcing(context.Context, *ProductionOutsourcingPrepare) (*ProductionOutsourcingPrepared, error)
}

func (uc *ProductionOrderUsecase) PrepareProductionOutsourcing(ctx context.Context, in *ProductionOutsourcingPrepare) (*ProductionOutsourcingPrepared, error) {
	repo, ok := uc.repo.(ProductionOutsourcingPrepareRepo)
	if !ok || in == nil || in.BatchID <= 0 || in.ExpectedVersion <= 0 || in.SupplierID <= 0 || in.ActorID <= 0 || in.ExpectedReturnDate.IsZero() || len(in.RequirementIDs) > 200 {
		return nil, ErrBadParam
	}
	copy := *in
	copy.RequirementIDs = append([]int{}, in.RequirementIDs...)
	sort.Ints(copy.RequirementIDs)
	for i, id := range copy.RequirementIDs {
		if id <= 0 || (i > 0 && id == copy.RequirementIDs[i-1]) {
			return nil, ErrBadParam
		}
	}
	payload, err := json.Marshal([]any{copy.BatchID, copy.ExpectedVersion, copy.SupplierID, copy.RequirementIDs, copy.ExpectedReturnDate.Format("2006-01-02")})
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(payload)
	copy.IntentHash = hex.EncodeToString(sum[:])
	return repo.PrepareProductionOutsourcing(ctx, &copy)
}
