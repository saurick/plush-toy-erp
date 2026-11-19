package biz

import (
	"context"
	"errors"
)

var (
	ErrWarehouseNotFound  = errors.New("warehouse not found")
	ErrWarehouseInactive  = errors.New("warehouse inactive")
	ErrProductSKUInactive = errors.New("product sku inactive")
)

type activeReferenceCheck func(context.Context, int) (bool, error)

func requireActiveReference(ctx context.Context, id int, check activeReferenceCheck, inactiveErr error) error {
	if id <= 0 || check == nil {
		return ErrBadParam
	}
	active, err := check(ctx, id)
	if err != nil {
		return err
	}
	if !active {
		return inactiveErr
	}
	return nil
}

func requireOptionalActiveReference(ctx context.Context, id *int, check activeReferenceCheck, inactiveErr error) error {
	if id == nil {
		return nil
	}
	return requireActiveReference(ctx, *id, check, inactiveErr)
}

func (uc *OperationalFactUsecase) validateSalesLineReferences(ctx context.Context, sourceItemID *int, productID int, skuID *int, unitID, warehouseID int) error {
	if sourceItemID == nil {
		if err := requireActiveReference(ctx, productID, uc.repo.ProductIsActive, ErrProductInactive); err != nil {
			return err
		}
		if err := requireOptionalActiveReference(ctx, skuID, uc.repo.ProductSKUIsActive, ErrProductSKUInactive); err != nil {
			return err
		}
		if err := requireActiveReference(ctx, unitID, uc.repo.UnitIsActive, ErrUnitInactive); err != nil {
			return err
		}
	}
	return requireActiveReference(ctx, warehouseID, uc.repo.WarehouseIsActive, ErrWarehouseInactive)
}
