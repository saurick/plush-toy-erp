package data

import (
	"context"
	"reflect"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomheader"
	"server/internal/data/model/ent/businessattachment"
)

func salesOrderProductPointer(id int) *int {
	if id <= 0 {
		return nil
	}
	return &id
}

func populateSalesOrderItemDisplay(ctx context.Context, client *ent.Client, items []*biz.SalesOrderItem) error {
	productIDs, bomIDs := []int{}, []int{}
	sourceOrders := make(map[int]int, len(items))
	for _, item := range items {
		sourceOrders[item.ID] = item.SalesOrderID
		if item.ProductID > 0 {
			productIDs = append(productIDs, item.ProductID)
		}
		if item.SampleBOMID != nil {
			bomIDs = append(bomIDs, *item.SampleBOMID)
		}
	}
	quantities, err := loadShipmentSourceLineQuantities(ctx, client, sourceOrders)
	if err != nil {
		return err
	}
	designers := map[int]*string{}
	images := map[int]int{}
	if len(bomIDs) > 0 {
		rows, err := client.BOMHeader.Query().Where(bomheader.IDIn(bomIDs...)).Select(bomheader.FieldID, bomheader.FieldDesigner).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			designers[row.ID] = row.Designer
		}
	}
	if len(productIDs) > 0 {
		rows, err := client.BusinessAttachment.Query().Where(
			businessattachment.OwnerTypeEQ(biz.BusinessAttachmentOwnerProduct), businessattachment.OwnerIDIn(productIDs...),
			businessattachment.AttachmentTypeEQ(biz.BusinessAttachmentTypeProductImage),
			businessattachment.SlotKeyEQ(biz.BusinessAttachmentProductImageSlotPrimary), businessattachment.WithdrawnAtIsNil(),
		).Select(businessattachment.FieldID, businessattachment.FieldOwnerID).All(ctx)
		if err != nil {
			return err
		}
		for _, row := range rows {
			images[row.OwnerID] = row.ID
		}
	}
	for _, item := range items {
		quantity := quantities[item.ID]
		if !quantity.sourceMismatch {
			shipped := quantity.shipped
			remaining := decimal.Max(decimal.Zero, item.OrderedQuantity.Sub(shipped))
			item.ShippedQuantity, item.UnshippedQuantity = &shipped, &remaining
		}
		if item.SampleBOMID != nil {
			item.Designer = designers[*item.SampleBOMID]
		}
		if id := images[item.ProductID]; id > 0 {
			item.ProductImageAttachmentID = &id
		}
	}
	return nil
}

func setSalesOrderDemandFieldsOnUpdate(update *ent.SalesOrderItemUpdateOne, in *biz.SalesOrderItemMutation) {
	if in.ProductID == 0 {
		update.ClearProductID()
	}
	update.SetOrderCategory(in.OrderCategory).SetPreShipmentSampleQuantity(in.PreShipmentSampleQuantity)
	if in.RequestedProductName == nil {
		update.ClearRequestedProductName()
	} else {
		update.SetRequestedProductName(*in.RequestedProductName)
	}
	if in.CustomerProductNo == nil {
		update.ClearCustomerProductNo()
	} else {
		update.SetCustomerProductNo(*in.CustomerProductNo)
	}
	if in.ProcessRequirement == nil {
		update.ClearProcessRequirement()
	} else {
		update.SetProcessRequirement(*in.ProcessRequirement)
	}
}

func validateSalesOrderCommercialEngineeringChange(ctx context.Context, client *ent.Client, id int, in *biz.SalesOrderItemMutation) error {
	current, err := client.SalesOrderItem.Get(ctx, id)
	if err != nil {
		return err
	}
	if in.ImportSource != nil && !reflect.DeepEqual(current.ImportSource, in.ImportSource) {
		return biz.ErrBadParam
	}
	if current.SampleBomID != nil || current.EngineeringStatus != biz.SalesOrderEngineeringPreparing {
		if current.ProductID != in.ProductID || !sameOptionalInt(current.ProductSkuID, in.ProductSkuID) {
			return biz.ErrSalesOrderEngineeringTransition
		}
	}
	if current.EngineeringStatus != biz.SalesOrderEngineeringPreparing && (!sameOptionalString(current.ProcessRequirement, in.ProcessRequirement) || !sameOptionalString(current.RequestedProductName, in.RequestedProductName)) {
		return biz.ErrSalesOrderEngineeringTransition
	}
	return nil
}
