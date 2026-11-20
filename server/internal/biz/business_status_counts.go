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

func (uc *QualityInspectionUsecase) CountQualityInspectionsByStatus(ctx context.Context, filter QualityInspectionFilter) (map[string]int, error) {
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

func (uc *QualityInspectionUsecase) CountFinishedGoodsQualityInspectionsByStatus(ctx context.Context, filter QualityInspectionFilter) (map[string]int, error) {
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

func (uc *QualityInspectionUsecase) CountOutsourcingReturnQualityInspectionsByStatus(ctx context.Context, filter QualityInspectionFilter) (map[string]int, error) {
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

func (uc *QualityInspectionUsecase) CountProductionStageQualityInspectionsByStatus(ctx context.Context, filter QualityInspectionFilter) (map[string]int, error) {
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

type PurchaseReceiptsStatusCounter interface {
	CountPurchaseReceiptsByStatus(context.Context, PurchaseReceiptFilter) (map[string]int, error)
}

func (uc *PurchaseReceiptUsecase) CountPurchaseReceiptsByStatus(ctx context.Context, filter PurchaseReceiptFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(PurchaseReceiptsStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizePurchaseReceiptFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountPurchaseReceiptsByStatus(ctx, normalized)
}

type BOMHeadersStatusCounter interface {
	CountBOMHeadersByStatus(context.Context, BOMHeaderFilter) (map[string]int, error)
}

func (uc *InventoryUsecase) CountBOMHeadersByStatus(ctx context.Context, filter BOMHeaderFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(BOMHeadersStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeBOMHeaderFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountBOMHeadersByStatus(ctx, normalized)
}

type WorkflowTasksStatusCounter interface {
	CountWorkflowTasksByStatus(context.Context, WorkflowTaskFilter) (map[string]int, error)
}

func (uc *WorkflowUsecase) CountWorkflowTasksByStatus(ctx context.Context, filter WorkflowTaskFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(WorkflowTasksStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeWorkflowTaskListFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountWorkflowTasksByStatus(ctx, normalized)
}

type ProductionFactsStatusCounter interface {
	CountProductionFactsByStatus(context.Context, OperationalFactFilter) (map[string]int, error)
}

func (uc *OperationalFactUsecase) CountProductionFactsByStatus(ctx context.Context, filter OperationalFactFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(ProductionFactsStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductionFactFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountProductionFactsByStatus(ctx, normalized)
}

type ProductionExceptionsStatusCounter interface {
	CountProductionExceptionsByStatus(context.Context, ProductionExceptionFilter) (map[string]int, error)
}

func (uc *OperationalFactUsecase) CountProductionExceptionsByStatus(ctx context.Context, filter ProductionExceptionFilter) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(ProductionExceptionsStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductionExceptionFilter(filter)
	if err != nil {
		return nil, err
	}
	return repo.CountProductionExceptionsByStatus(ctx, normalized)
}

type InventoryLotsStatusCounter interface {
	CountInventoryLotsByStatusForAccess(context.Context, InventoryLotFilter, WarehouseDataScope) (map[string]int, error)
}

func (uc *InventoryUsecase) CountInventoryLotsByStatusForAccess(ctx context.Context, filter InventoryLotFilter, scope WarehouseDataScope) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(InventoryLotsStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeInventoryLotFilter(filter)
	if err != nil {
		return nil, err
	}
	scope = NormalizeWarehouseDataScope(scope)
	if err := ValidateWarehouseDataScopeAccess(scope, normalized.WarehouseID); err != nil {
		return nil, err
	}
	return repo.CountInventoryLotsByStatusForAccess(ctx, normalized, scope)
}

type StockReservationsStatusCounter interface {
	CountStockReservationsByStatusForAccess(context.Context, OperationalFactFilter, StockReservationReadScope) (map[string]int, error)
}

func (uc *OperationalFactUsecase) CountStockReservationsByStatusForAccess(ctx context.Context, filter OperationalFactFilter, scope StockReservationReadScope) (map[string]int, error) {
	if uc == nil {
		return nil, ErrBadParam
	}
	repo, ok := uc.repo.(StockReservationsStatusCounter)
	if !ok {
		return nil, ErrBadParam
	}
	normalized, err := normalizeStockReservationFilter(filter)
	if err != nil {
		return nil, err
	}

	return repo.CountStockReservationsByStatusForAccess(ctx, normalized, scope)
}
