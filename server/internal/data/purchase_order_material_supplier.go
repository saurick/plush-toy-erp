package data

import (
	"context"

	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/purchaseorderitem"
)

// Unbound materials are shared catalog entries. A supplier-bound identity may
// only be purchased from that supplier, including after a draft supplier change.
func validatePurchaseMaterialSupplier(ctx context.Context, client *ent.Client, supplierID int, materialIDs []int) error {
	if len(materialIDs) == 0 {
		return nil
	}
	rows, err := client.Material.Query().Where(material.IDIn(materialIDs...)).Order(ent.Asc(material.FieldID)).Where(func(s *sql.Selector) {
		if s.Dialect() == dialect.Postgres {
			s.ForShare()
		}
	}).All(ctx)
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row.SupplierID != nil && *row.SupplierID != supplierID {
			return biz.ErrPurchaseOrderMaterialSupplierMismatch
		}
	}
	return nil
}

func validatePurchaseOrderMaterialSuppliers(ctx context.Context, client *ent.Client, orderID, supplierID int) error {
	items, err := client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(orderID), purchaseorderitem.LineStatusNEQ(biz.PurchaseOrderItemStatusCanceled)).Select(purchaseorderitem.FieldMaterialID).All(ctx)
	if err != nil {
		return err
	}
	ids := make([]int, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.MaterialID)
	}
	return validatePurchaseMaterialSupplier(ctx, client, supplierID, ids)
}
