package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
)

func (d *Data) customerIsActive(ctx context.Context, id int) (bool, error) {
	row, err := d.postgres.Customer.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrCustomerNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (d *Data) materialIsActive(ctx context.Context, id int) (bool, error) {
	row, err := d.postgres.Material.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrMaterialNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (d *Data) productIsActive(ctx context.Context, id int) (bool, error) {
	row, err := d.postgres.Product.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrProductNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (d *Data) supplierIsActive(ctx context.Context, id int) (bool, error) {
	row, err := d.postgres.Supplier.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrSupplierNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (d *Data) unitIsActive(ctx context.Context, id int) (bool, error) {
	row, err := d.postgres.Unit.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrUnitNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (d *Data) warehouseIsActive(ctx context.Context, id int) (bool, error) {
	row, err := d.postgres.Warehouse.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrWarehouseNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}
