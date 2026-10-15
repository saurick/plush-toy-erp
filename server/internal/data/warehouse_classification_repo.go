package data

import (
	"context"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/warehouse"
)

func warehouseReferenceShareLock(s *sql.Selector) {
	if s.Dialect() == dialect.Postgres {
		s.ForShare()
	}
}

func warehouseReferenceUpdateLock(s *sql.Selector) {
	if s.Dialect() == dialect.Postgres {
		s.ForUpdate()
	}
}

func validateIncomingWarehouse(ctx context.Context, client *ent.Client, warehouseID int, subjectType string, subjectID int) error {
	w, err := client.Warehouse.Query().Where(warehouse.ID(warehouseID), warehouseReferenceShareLock).Only(ctx)
	if ent.IsNotFound(err) {
		return biz.ErrWarehouseNotFound
	}
	if err != nil {
		return err
	}
	if !w.IsActive {
		return biz.ErrWarehouseInactive
	}
	category := ""
	if subjectType == biz.InventorySubjectMaterial {
		m, err := client.Material.Query().Where(material.ID(subjectID), warehouseReferenceShareLock).Only(ctx)
		if ent.IsNotFound(err) {
			return biz.ErrMaterialNotFound
		}
		if err != nil {
			return err
		}
		category = m.StockCategory
	}
	return biz.ValidateWarehouseCategory(w.Type, subjectType, category)
}

func validateMaterialWarehouseChange(ctx context.Context, client *ent.Client, id int, in *biz.MaterialMutation) error {
	if id > 0 {
		current, err := client.Material.Query().Where(material.ID(id), warehouseReferenceUpdateLock).Only(ctx)
		if ent.IsNotFound(err) {
			return biz.ErrMaterialNotFound
		}
		if err != nil {
			return err
		}
		if current.StockCategory != in.StockCategory {
			balances, err := client.InventoryBalance.Query().Where(inventorybalance.SubjectType(biz.InventorySubjectMaterial), inventorybalance.SubjectID(id), inventorybalance.QuantityGT(decimal.Zero)).All(ctx)
			if err != nil {
				return err
			}
			for _, balance := range balances {
				w, err := client.Warehouse.Query().Where(warehouse.ID(balance.WarehouseID), warehouseReferenceShareLock).Only(ctx)
				if err != nil {
					return err
				}
				// Unclassified warehouses are repaired through warehouse settings; do not guess their physical use.
				if w.Type != biz.WarehouseUnclassified && biz.ValidateWarehouseCategory(w.Type, biz.InventorySubjectMaterial, in.StockCategory) != nil {
					return biz.ErrWarehouseClassificationInUse
				}
			}
		}

	}
	if in.DefaultWarehouseID != nil {
		w, err := client.Warehouse.Query().Where(warehouse.ID(*in.DefaultWarehouseID), warehouseReferenceShareLock).Only(ctx)
		if ent.IsNotFound(err) {
			return biz.ErrWarehouseNotFound
		}
		if err != nil {
			return err
		}
		if !w.IsActive {
			return biz.ErrWarehouseInactive
		}
		return biz.ValidateWarehouseCategory(w.Type, biz.InventorySubjectMaterial, in.StockCategory)
	}
	return nil
}

func (r *masterDataRepo) SaveWarehouse(ctx context.Context, id int, in *biz.WarehouseMutation, scope biz.WarehouseDataScope) (_ *biz.Warehouse, resultErr error) {
	defer func() { resultErr = mapInventoryPersistenceError(resultErr, biz.ErrWarehouseCodeConflict) }()
	if id == 0 && !scope.IsAll() || id > 0 && !scope.Allows(id) {
		return nil, biz.ErrDataScopeForbidden
	}
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { rollbackMasterDataEntTx(ctx, tx, r.log) }()
	client := tx.Client()
	var row *ent.Warehouse
	if id == 0 {
		row, err = client.Warehouse.Create().SetCode(in.Code).SetName(in.Name).SetType(in.Type).SetIsActive(in.IsActive).Save(ctx)
	} else {
		current, readErr := client.Warehouse.Query().Where(warehouse.ID(id), warehouseReferenceUpdateLock).Only(ctx)
		if ent.IsNotFound(readErr) {
			return nil, biz.ErrWarehouseNotFound
		}
		if readErr != nil {
			return nil, readErr
		}
		if current.Type != in.Type || current.IsActive && !in.IsActive {
			balances, readErr := client.InventoryBalance.Query().Where(inventorybalance.WarehouseID(id), inventorybalance.QuantityGT(decimal.Zero)).All(ctx)
			if readErr != nil {
				return nil, readErr
			}
			for _, balance := range balances {
				category := ""
				if balance.SubjectType == biz.InventorySubjectMaterial {
					m, readErr := client.Material.Get(ctx, balance.SubjectID)
					if readErr != nil {
						return nil, readErr
					}
					category = m.StockCategory
				}
				if !in.IsActive || biz.ValidateWarehouseCategory(in.Type, balance.SubjectType, category) != nil {
					return nil, biz.ErrWarehouseClassificationInUse
				}
			}
			defaults, readErr := client.Material.Query().Where(material.DefaultWarehouseID(id)).All(ctx)
			if readErr != nil {
				return nil, readErr
			}
			for _, m := range defaults {
				if !in.IsActive || biz.ValidateWarehouseCategory(in.Type, biz.InventorySubjectMaterial, m.StockCategory) != nil {
					return nil, biz.ErrWarehouseClassificationInUse
				}
			}
		}
		row, err = client.Warehouse.UpdateOneID(id).SetCode(in.Code).SetName(in.Name).SetType(in.Type).SetIsActive(in.IsActive).Save(ctx)
	}
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return entWarehouseToBiz(row), nil
}

// Filter the canonical material catalog before counting and paging each stock view.
func inventoryMaterialCategoryPredicate(category string) func(*sql.Selector) {
	return func(s *sql.Selector) {
		m := sql.Table(material.Table)
		s.Where(sql.And(sql.EQ(s.C("subject_type"), biz.InventorySubjectMaterial), sql.In(s.C("subject_id"), sql.Select(m.C(material.FieldID)).From(m).Where(sql.EQ(m.C(material.FieldStockCategory), category)))))
	}
}

func loadInventoryMaterialStockCategories(ctx context.Context, client *ent.Client, ids []int) (map[int]string, error) {
	result := map[int]string{}
	if len(ids) == 0 {
		return result, nil
	}
	rows, err := client.Material.Query().Where(material.IDIn(ids...)).Select(material.FieldID, material.FieldStockCategory).All(ctx)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.ID] = row.StockCategory
	}
	return result, nil
}
