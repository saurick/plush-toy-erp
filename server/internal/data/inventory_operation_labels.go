package data

import (
	"context"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/inventorylot"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/unit"
	"server/internal/data/model/ent/warehouse"
)

func hydrateInventoryOperationLabels(ctx context.Context, client *ent.Client, operation *biz.InventoryOperation) error {
	materialIDs, productIDs, warehouseIDs, lotIDs, unitIDs, skuIDs := []int{}, []int{}, []int{}, []int{}, []int{}, []int{}
	for _, item := range operation.Items {
		if item.SubjectType == biz.InventorySubjectMaterial {
			materialIDs = append(materialIDs, item.SubjectID)
		} else {
			productIDs = append(productIDs, item.SubjectID)
		}
		warehouseIDs = append(warehouseIDs, item.FromWarehouseID)
		if item.ToWarehouseID != nil {
			warehouseIDs = append(warehouseIDs, *item.ToWarehouseID)
		}
		unitIDs = append(unitIDs, item.UnitID)
		if item.FromLotID != nil {
			lotIDs = append(lotIDs, *item.FromLotID)
		}
		if item.ProductSkuID != nil {
			skuIDs = append(skuIDs, *item.ProductSkuID)
		}
	}
	materialNames := map[int]string{}
	if len(materialIDs) > 0 {
		rows, err := client.Material.Query().Where(material.IDIn(materialIDs...)).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			materialNames[row.ID] = row.Name
		}
	}
	productNames := map[int]string{}
	if len(productIDs) > 0 {
		rows, err := client.Product.Query().Where(product.IDIn(productIDs...)).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			productNames[row.ID] = row.Name
		}
	}
	warehouseNames := map[int]string{}
	if len(warehouseIDs) > 0 {
		rows, err := client.Warehouse.Query().Where(warehouse.IDIn(warehouseIDs...)).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			warehouseNames[row.ID] = row.Name
		}
	}
	lotNames := map[int]string{}
	if len(lotIDs) > 0 {
		rows, err := client.InventoryLot.Query().Where(inventorylot.IDIn(lotIDs...)).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			lotNames[row.ID] = row.LotNo
		}
	}
	unitNames := map[int]string{}
	if len(unitIDs) > 0 {
		rows, err := client.Unit.Query().Where(unit.IDIn(unitIDs...)).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			unitNames[row.ID] = row.Name
		}
	}
	skuNames := map[int]string{}
	if len(skuIDs) > 0 {
		rows, err := client.ProductSKU.Query().Where(productsku.IDIn(skuIDs...)).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			skuNames[row.ID] = row.SkuCode
		}
	}
	for _, item := range operation.Items {
		if item.SubjectType == biz.InventorySubjectMaterial {
			item.SubjectName = materialNames[item.SubjectID]
		} else {
			item.SubjectName = productNames[item.SubjectID]
		}
		item.WarehouseName, item.UnitName = warehouseNames[item.FromWarehouseID], unitNames[item.UnitID]
		if item.ToWarehouseID != nil {
			item.ToWarehouseName = warehouseNames[*item.ToWarehouseID]
		}
		if item.FromLotID != nil {
			item.LotNo = lotNames[*item.FromLotID]
		}
		if item.ProductSkuID != nil {
			item.SKUCode = skuNames[*item.ProductSkuID]
		}
	}
	return nil
}
