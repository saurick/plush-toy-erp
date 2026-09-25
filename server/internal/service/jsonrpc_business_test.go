package service

import (
	"context"
	"server/internal/biz"
)

type stubBusinessDashboardOperationalFactRepo struct{ biz.OperationalFactRepo }

func (s *stubBusinessDashboardOperationalFactRepo) CustomerIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrCustomerNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) MaterialIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrMaterialNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) ProductIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrProductNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) ProductSKUIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrProductSKUNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) SupplierIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrSupplierNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) UnitIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrUnitNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) WarehouseIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrWarehouseNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateProductionFactDraft(context.Context, *biz.OperationalFactMutation) (*biz.ProductionFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) PostProductionFact(context.Context, *biz.OperationalFactStatusMutation) (*biz.ProductionFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelPostedProductionFact(context.Context, *biz.OperationalFactStatusMutation) (*biz.ProductionFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListProductionFacts(context.Context, biz.OperationalFactFilter) ([]*biz.ProductionFact, int, error) {
	return nil, 4, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateOutsourcingFactDraft(context.Context, *biz.OperationalFactMutation) (*biz.OutsourcingFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) PostOutsourcingFact(context.Context, *biz.OperationalFactStatusMutation) (*biz.OutsourcingFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelPostedOutsourcingFact(context.Context, *biz.OperationalFactStatusMutation) (*biz.OutsourcingFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListOutsourcingFacts(context.Context, biz.OperationalFactFilter) ([]*biz.OutsourcingFact, int, error) {
	return nil, 2, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateShipmentDraftWithItems(context.Context, *biz.ShipmentCreateWithItems) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ShipShipment(context.Context, int) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ShipShipmentWithActor(ctx context.Context, id int, _ int) (*biz.Shipment, error) {
	return s.ShipShipment(ctx, id)
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelShippedShipment(context.Context, int) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelShippedShipmentWithActor(ctx context.Context, id int, _ int) (*biz.Shipment, error) {
	return s.CancelShippedShipment(ctx, id)
}

func (s *stubBusinessDashboardOperationalFactRepo) GetShipment(context.Context, int) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListShipments(context.Context, biz.OperationalFactFilter) ([]*biz.Shipment, int, error) {
	return nil, 3, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateStockReservation(context.Context, *biz.StockReservationCreate) (*biz.StockReservation, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateStockReservationFromSalesOrder(context.Context, *biz.StockReservationFromSalesOrderCreate) (*biz.StockReservation, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ReleaseStockReservation(context.Context, int) (*biz.StockReservation, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListStockReservations(context.Context, biz.OperationalFactFilter) ([]*biz.StockReservation, int, error) {
	return nil, 5, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateFinanceFactDraft(context.Context, *biz.FinanceFactCreate) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) PostFinanceFact(context.Context, *biz.OperationalFactStatusMutation) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) SettleFinanceFact(context.Context, *biz.OperationalFactStatusMutation) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelPostedFinanceFact(context.Context, *biz.OperationalFactStatusMutation) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListFinanceFacts(context.Context, biz.OperationalFactFilter) ([]*biz.FinanceFact, int, error) {
	return nil, 6, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) ListStockReservationsForAccess(ctx context.Context, filter biz.OperationalFactFilter, _ biz.StockReservationReadScope) ([]*biz.StockReservation, int, error) {
	return s.ListStockReservations(ctx, filter)
}
