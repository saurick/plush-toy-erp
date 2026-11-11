package biz

import (
	"context"
	"strings"
	"unicode/utf8"
)

const (
	WarehouseProductionKindReturn     = "RETURN"
	WarehouseProductionKindReceipt    = "RECEIPT"
	WarehouseProductionStageReturn    = "AWAITING_RETURN"
	WarehouseProductionStageInbound   = "AWAITING_INBOUND"
	WarehouseProductionStageQuality   = "AWAITING_QUALITY"
	WarehouseProductionStagePackaging = "AWAITING_PACKAGING"
	WarehouseProductionStageReady     = "READY"
	WarehouseProductionStageCompleted = "COMPLETED"
	WarehouseProductionStageRejected  = "REJECTED"
	WarehouseProductionStageCancelled = "CANCELLED"
)

// These rows only locate existing facts and WIP batches. Writes continue through
// the original receipt and WIP usecases with their current permissions and CAS.
type WarehouseProductionWork struct {
	ID                        int    `json:"id"`
	Kind                      string `json:"kind"`
	Stage                     string `json:"stage"`
	ProductionOrderID         int    `json:"production_order_id"`
	ProductionOrderItemID     int    `json:"production_order_item_id"`
	OrderNo                   string `json:"order_no"`
	FactID                    int    `json:"fact_id"`
	FactNo                    string `json:"fact_no"`
	FactStatus                string `json:"fact_status"`
	FactVersion               int    `json:"fact_version"`
	BatchID                   int    `json:"production_wip_batch_id"`
	BatchNo                   string `json:"batch_no"`
	OperationName             string `json:"operation_name"`
	ProductID                 int    `json:"product_id"`
	ProductName               string `json:"product_name"`
	ProductCode               string `json:"product_code"`
	SKUCode                   string `json:"sku_code"`
	UnitName                  string `json:"unit_name"`
	WarehouseID               int    `json:"warehouse_id"`
	WarehouseName             string `json:"warehouse_name"`
	LotNo                     string `json:"lot_no"`
	Quantity                  string `json:"quantity"`
	PendingInspectionQuantity string `json:"pending_inspection_quantity"`
	PendingPackagingQuantity  string `json:"pending_packaging_quantity"`
	PackagingConfirmed        bool   `json:"packaging_confirmed"`
	ActionBatchID             int    `json:"action_batch_id"`
	Action                    string `json:"action"`
}

const WarehouseProductionSortQuantity = "quantity"

type WarehouseProductionWorkFilter struct {
	Kind, Stage, Keyword  string
	SortBy, SortDirection string
	Limit, Offset         int
}

type WarehouseProductionWorkPage struct {
	Items  []*WarehouseProductionWork `json:"items"`
	Total  int                        `json:"total"`
	Counts map[string]int             `json:"counts"`
}

type WarehouseProductionWorkRepo interface {
	ListWarehouseProductionWork(context.Context, WarehouseProductionWorkFilter) (*WarehouseProductionWorkPage, error)
}

func NormalizeWarehouseProductionWorkFilter(in WarehouseProductionWorkFilter) (WarehouseProductionWorkFilter, error) {
	in.Keyword = strings.TrimSpace(in.Keyword)
	if in.Limit == 0 {
		in.Limit = 20
	}
	if in.Kind != WarehouseProductionKindReturn && in.Kind != WarehouseProductionKindReceipt || in.Limit < 1 || in.Limit > 100 || in.Offset < 0 || in.Offset > 1000000 || utf8.RuneCountInString(in.Keyword) > 100 {
		return in, ErrBadParam
	}
	allowed := map[string]bool{"": true, WarehouseProductionStageQuality: true, WarehouseProductionStageCompleted: true, WarehouseProductionStageRejected: true, WarehouseProductionStageCancelled: true}
	if in.Kind == WarehouseProductionKindReturn {
		allowed[WarehouseProductionStageReturn] = true
	} else {
		allowed[WarehouseProductionStageInbound] = true
		allowed[WarehouseProductionStagePackaging] = true
		allowed[WarehouseProductionStageReady] = true
	}
	if !allowed[in.Stage] || !validBusinessListSort(in.SortBy, in.SortDirection, WarehouseProductionSortQuantity) {
		return in, ErrBadParam
	}
	return in, nil
}

func (uc *ProductionOrderUsecase) ListWarehouseProductionWork(ctx context.Context, filter WarehouseProductionWorkFilter) (*WarehouseProductionWorkPage, error) {
	filter, err := NormalizeWarehouseProductionWorkFilter(filter)
	if err != nil {
		return nil, err
	}
	if uc == nil || uc.repo == nil {
		return nil, ErrProductionWIPUnavailable
	}
	repo, ok := uc.repo.(WarehouseProductionWorkRepo)
	if !ok {
		return nil, ErrProductionWIPUnavailable
	}
	return repo.ListWarehouseProductionWork(ctx, filter)
}
