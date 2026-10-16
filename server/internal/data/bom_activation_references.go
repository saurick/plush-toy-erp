package data

import (
	"context"
	entsql "entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/unit"
)

func validateBOMActivationReferences(ctx context.Context, client *ent.Client, header *ent.BOMHeader, items []*ent.BOMItem, lock bool) error {
	productQuery := client.Product.Query().Where(product.ID(header.ProductID))
	if lock {
		productQuery.Where(func(s *entsql.Selector) { s.ForShare() })
	}
	productRow, err := productQuery.Only(ctx)
	if ent.IsNotFound(err) {
		return biz.ErrProductInactive
	}
	if err != nil {
		return err
	}
	if !productRow.IsActive {
		return biz.ErrProductInactive
	}
	materialIDs, unitIDs := make([]int, 0, len(items)), make([]int, 0, len(items))
	for _, item := range items {
		materialIDs = append(materialIDs, item.MaterialID)
		unitIDs = append(unitIDs, item.UnitID)
	}
	materials := client.Material.Query().Where(material.IDIn(materialIDs...)).Order(ent.Asc(material.FieldID))
	units := client.Unit.Query().Where(unit.IDIn(unitIDs...)).Order(ent.Asc(unit.FieldID))
	if lock {
		materials.Where(func(s *entsql.Selector) { s.ForShare() })
		units.Where(func(s *entsql.Selector) { s.ForShare() })
	}
	materialRows, err := materials.All(ctx)
	if err != nil {
		return err
	}
	activeMaterials := map[int]bool{}
	for _, row := range materialRows {
		activeMaterials[row.ID] = row.IsActive
	}
	unitRows, err := units.All(ctx)
	if err != nil {
		return err
	}
	activeUnits := map[int]bool{}
	for _, row := range unitRows {
		activeUnits[row.ID] = row.IsActive
	}
	for _, item := range items {
		if !activeMaterials[item.MaterialID] {
			return biz.ErrMaterialInactive
		}
		if !activeUnits[item.UnitID] {
			return biz.ErrUnitInactive
		}
	}
	return nil
}
