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
