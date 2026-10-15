package biz

import "context"

// SalesOrdersStatusCounter reads a grouped projection of the existing list source.
type SalesOrdersStatusCounter interface {
	CountSalesOrdersByStatus(context.Context, SalesOrderFilter) (map[string]int, error)
}

func (uc *SalesOrderUsecase) CountSalesOrdersByStatus(ctx context.Context, filter SalesOrderFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(SalesOrdersStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeSalesOrderFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountSalesOrdersByStatus(ctx, normalized)
}

// PurchaseOrdersStatusCounter reads a grouped projection of the existing list source.
type PurchaseOrdersStatusCounter interface {
	CountPurchaseOrdersByStatus(context.Context, PurchaseOrderFilter) (map[string]int, error)
}

func (uc *PurchaseOrderUsecase) CountPurchaseOrdersByStatus(ctx context.Context, filter PurchaseOrderFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(PurchaseOrdersStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseOrderFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountPurchaseOrdersByStatus(ctx, normalized)
}

// OutsourcingOrdersStatusCounter reads a grouped projection of the existing list source.
type OutsourcingOrdersStatusCounter interface {
	CountOutsourcingOrdersByStatus(context.Context, OutsourcingOrderFilter) (map[string]int, error)
}

func (uc *OutsourcingOrderUsecase) CountOutsourcingOrdersByStatus(ctx context.Context, filter OutsourcingOrderFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(OutsourcingOrdersStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeOutsourcingOrderFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountOutsourcingOrdersByStatus(ctx, normalized)
}

// ProductionOrdersStatusCounter reads a grouped projection of the existing list source.
type ProductionOrdersStatusCounter interface {
	CountProductionOrdersByStatus(context.Context, ProductionOrderFilter) (map[string]int, error)
}

func (uc *ProductionOrderUsecase) CountProductionOrdersByStatus(ctx context.Context, filter ProductionOrderFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(ProductionOrdersStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductionOrderListFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountProductionOrdersByStatus(ctx, normalized)
}

// QualityInspectionsStatusCounter reads a grouped projection of the existing list source.
type QualityInspectionsStatusCounter interface {
	CountQualityInspectionsByStatus(context.Context, QualityInspectionFilter) (map[string]int, error)
}

func (uc *InventoryUsecase) CountQualityInspectionsByStatus(ctx context.Context, filter QualityInspectionFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(QualityInspectionsStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeQualityInspectionFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountQualityInspectionsByStatus(ctx, normalized)
}

// ShipmentsStatusCounter reads a grouped projection of the existing list source.
type ShipmentsStatusCounter interface {
	CountShipmentsByStatus(context.Context, OperationalFactFilter) (map[string]int, error)
}

func (uc *OperationalFactUsecase) CountShipmentsByStatus(ctx context.Context, filter OperationalFactFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(ShipmentsStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeShipmentFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountShipmentsByStatus(ctx, normalized)
}

// FinancePaymentsStatusCounter reads a grouped projection of the existing list source.
type FinancePaymentsStatusCounter interface {
	CountFinancePaymentsByStatus(context.Context, FinancePaymentFilter) (map[string]int, error)
}

func (uc *OperationalFactUsecase) CountFinancePaymentsByStatus(ctx context.Context, filter FinancePaymentFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(FinancePaymentsStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeFinancePaymentListFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountFinancePaymentsByStatus(ctx, normalized)
}

// FinanceCreditNotesStatusCounter reads a grouped projection of the existing list source.
type FinanceCreditNotesStatusCounter interface {
	CountFinanceCreditNotesByStatus(context.Context, FinanceCreditNoteFilter) (map[string]int, error)
}

func (uc *OperationalFactUsecase) CountFinanceCreditNotesByStatus(ctx context.Context, filter FinanceCreditNoteFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(FinanceCreditNotesStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeFinanceCreditNoteListFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountFinanceCreditNotesByStatus(ctx, normalized)
}

func (uc *InventoryUsecase) CountFinishedGoodsQualityInspectionsByStatus(ctx context.Context, filter QualityInspectionFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(QualityInspectionsStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeFinishedGoodsQualityInspectionFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountQualityInspectionsByStatus(ctx, normalized)
}

func (uc *InventoryUsecase) CountOutsourcingReturnQualityInspectionsByStatus(ctx context.Context, filter QualityInspectionFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(QualityInspectionsStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeOutsourcingReturnQualityInspectionFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountQualityInspectionsByStatus(ctx, normalized)
}

func (uc *InventoryUsecase) CountProductionStageQualityInspectionsByStatus(ctx context.Context, filter QualityInspectionFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(QualityInspectionsStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductionStageQualityInspectionFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountQualityInspectionsByStatus(ctx, normalized)
}

type FinanceFactsStatusCounter interface {
	CountFinanceFactsByStatusForAccess(context.Context, OperationalFactFilter, FinanceFactAccessScope) (map[string]int, error)
}

func (uc *OperationalFactUsecase) CountFinanceFactsByStatusForAccess(ctx context.Context, filter OperationalFactFilter, scope FinanceFactAccessScope) (map[string]int, error) {
	if uc == nil || scope.Empty() {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(FinanceFactsStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeFinanceFactFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountFinanceFactsByStatusForAccess(ctx, normalized, scope)
}
