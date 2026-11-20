package data

import (
	"context"
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productionorderitem"
)

// Hydrate only identities for the facts already selected by the authorized query.
// Existing source snapshots take precedence over current master-data names.
func hydrateProductionFactIdentities(ctx context.Context, client *ent.Client, facts []*biz.ProductionFact) error {
	productIDs, materialIDs, itemIDs := []int{}, []int{}, []int{}
	for _, fact := range facts {
		switch fact.SubjectType {
		case biz.InventorySubjectProduct:
			productIDs = append(productIDs, fact.SubjectID)
		case biz.InventorySubjectMaterial:
			materialIDs = append(materialIDs, fact.SubjectID)
		}
		if fact.ProductionOrderItemID != nil {
			itemIDs = append(itemIDs, *fact.ProductionOrderItemID)
		}
	}
	products, materials, items := map[int]*ent.Product{}, map[int]*ent.Material{}, map[int]*ent.ProductionOrderItem{}
	if len(productIDs) > 0 {
		rows, err := client.Product.Query().Where(product.IDIn(productIDs...)).Select(product.FieldID, product.FieldName, product.FieldCode).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			products[row.ID] = row
		}
	}
	if len(materialIDs) > 0 {
		rows, err := client.Material.Query().Where(material.IDIn(materialIDs...)).Select(material.FieldID, material.FieldName, material.FieldCode).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			materials[row.ID] = row
		}
	}
	if len(itemIDs) > 0 {
		rows, err := client.ProductionOrderItem.Query().Where(productionorderitem.IDIn(itemIDs...)).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			items[row.ID] = row
		}
	}
	for _, fact := range facts {
		switch fact.SubjectType {
		case biz.InventorySubjectProduct:
			if row := products[fact.SubjectID]; row != nil {
				fact.SubjectName, fact.SubjectCode = row.Name, row.Code
			}
		case biz.InventorySubjectMaterial:
			if row := materials[fact.SubjectID]; row != nil {
				fact.SubjectName, fact.SubjectCode = row.Name, row.Code
			}
		}
		if fact.SubjectType != biz.InventorySubjectProduct || fact.ProductionOrderItemID == nil || fact.ProductionOrderID == nil {
			continue
		}
		item := items[*fact.ProductionOrderItemID]
		if item == nil || item.ProductionOrderID != *fact.ProductionOrderID || item.ProductID != fact.SubjectID || !sameOptionalInt(item.ProductSkuID, fact.ProductSkuID) {
			continue
		}
		for _, pair := range []struct {
			source *string
			target *string
		}{
			{item.ProductNameSnapshot, &fact.SubjectName},
			{item.ProductCodeSnapshot, &fact.SubjectCode},
			{item.SkuCodeSnapshot, &fact.SKUCodeSnapshot},
		} {
			if pair.source != nil && strings.TrimSpace(*pair.source) != "" {
				*pair.target = *pair.source
			}
		}
		if item.UnitID == fact.UnitID && item.UnitNameSnapshot != nil && strings.TrimSpace(*item.UnitNameSnapshot) != "" {
			fact.UnitName = *item.UnitNameSnapshot
		}
	}
	return nil
}
