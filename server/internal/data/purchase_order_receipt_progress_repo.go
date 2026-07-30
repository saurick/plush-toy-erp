package data

import (
	"context"
	"fmt"
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/purchaseorder"
	"server/internal/data/model/ent/purchaseorderitem"

	"github.com/shopspring/decimal"
)

var _ biz.PurchaseOrderReceiptProgressRepo = (*purchaseOrderRepo)(nil)

func (r *purchaseOrderRepo) GetPurchaseOrderReceiptProgress(
	ctx context.Context,
	id int,
) (*biz.PurchaseOrderReceiptProgress, error) {
	if r == nil || r.data == nil || id <= 0 {
		return nil, biz.ErrBadParam
	}
	snapshot, err := beginReadSnapshot(ctx, r.data)
	if err != nil {
		return nil, err
	}
	defer snapshot.Rollback()

	order, err := snapshot.client.PurchaseOrder.Query().
		Where(purchaseorder.ID(id)).
		WithItems(func(query *ent.PurchaseOrderItemQuery) {
			query.
				WithMaterial().
				WithUnit().
				Order(
					purchaseorderitem.ByLineNo(),
					purchaseorderitem.ByID(),
				)
		}).
		Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrPurchaseOrderNotFound
		}
		return nil, err
	}
	items, err := order.Edges.ItemsOrErr()
	if err != nil {
		return nil, err
	}
	itemIDs := make([]int, 0, len(items))
	for _, item := range items {
		itemIDs = append(itemIDs, item.ID)
	}
	effectiveByItemID, err := purchaseOrderEffectiveReceivedQuantities(
		ctx,
		snapshot.client,
		itemIDs,
		0,
		0,
	)
	if err != nil {
		return nil, err
	}
	draftReservedByItemID, err := purchaseOrderDraftReservedQuantities(
		ctx,
		snapshot.client,
		itemIDs,
	)
	if err != nil {
		return nil, err
	}

	result := &biz.PurchaseOrderReceiptProgress{
		PurchaseOrderID: order.ID,
		PurchaseOrderNo: order.PurchaseOrderNo,
		LifecycleStatus: order.LifecycleStatus,
		Items:           make([]*biz.PurchaseOrderReceiptProgressItem, 0, len(items)),
	}
	for _, item := range items {
		effectiveReceived := effectiveByItemID[item.ID]
		if effectiveReceived.IsNegative() ||
			effectiveReceived.Cmp(item.PurchasedQuantity) > 0 {
			return nil, fmt.Errorf(
				"%w: purchase order item %d has effective received quantity %s for purchased quantity %s",
				biz.ErrPurchaseOrderReceiptProgressInvalid,
				item.ID,
				effectiveReceived.String(),
				item.PurchasedQuantity.String(),
			)
		}
		draftReserved := draftReservedByItemID[item.ID]
		remainingReceivable := item.PurchasedQuantity.Sub(effectiveReceived)
		remainingGeneratable := remainingReceivable.Sub(draftReserved)
		if remainingGeneratable.IsNegative() {
			remainingGeneratable = decimal.Zero
		}

		material, materialErr := item.Edges.MaterialOrErr()
		if materialErr != nil {
			return nil, materialErr
		}
		unit, unitErr := item.Edges.UnitOrErr()
		if unitErr != nil {
			return nil, unitErr
		}
		materialCode := strings.TrimSpace(purchaseOrderReceiptProgressSnapshotValue(item.MaterialCodeSnapshot))
		if materialCode == "" {
			materialCode = material.Code
		}
		materialName := strings.TrimSpace(purchaseOrderReceiptProgressSnapshotValue(item.MaterialNameSnapshot))
		if materialName == "" {
			materialName = material.Name
		}
		canGenerate, disabledReason := purchaseOrderReceiptProgressAvailability(
			order.LifecycleStatus,
			item.LineStatus,
			effectiveReceived,
			item.PurchasedQuantity,
			draftReserved,
			remainingReceivable,
		)
		result.Items = append(result.Items, &biz.PurchaseOrderReceiptProgressItem{
			PurchaseOrderItemID:          item.ID,
			LineNo:                       item.LineNo,
			MaterialID:                   item.MaterialID,
			MaterialCode:                 materialCode,
			MaterialName:                 materialName,
			UnitID:                       item.UnitID,
			UnitCode:                     unit.Code,
			UnitName:                     unit.Name,
			LineStatus:                   item.LineStatus,
			PurchasedQuantity:            item.PurchasedQuantity,
			EffectiveReceivedQuantity:    effectiveReceived,
			DraftReservedQuantity:        draftReserved,
			RemainingReceivableQuantity:  remainingReceivable,
			RemainingGeneratableQuantity: remainingGeneratable,
			CanGenerate:                  canGenerate,
			DisabledReason:               disabledReason,
		})
	}
	if err := snapshot.Commit(); err != nil {
		return nil, err
	}
	return result, nil
}

func purchaseOrderReceiptProgressSnapshotValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func purchaseOrderReceiptProgressAvailability(
	orderStatus string,
	lineStatus string,
	effectiveReceived decimal.Decimal,
	purchased decimal.Decimal,
	draftReserved decimal.Decimal,
	remainingReceivable decimal.Decimal,
) (bool, string) {
	switch {
	case orderStatus != biz.PurchaseOrderStatusApproved:
		return false, "采购订单不是已批准状态，不能生成入库草稿"
	case lineStatus != biz.PurchaseOrderItemStatusOpen:
		return false, "采购订单行不是开放状态，不能生成入库草稿"
	case effectiveReceived.Equal(purchased):
		return false, "采购订单行已全部入库"
	case draftReserved.Cmp(remainingReceivable) > 0:
		return false, "现有入库草稿占用超过剩余可收数量，请先处理草稿"
	case draftReserved.Equal(remainingReceivable):
		return false, "现有入库草稿已占用全部剩余可收数量"
	default:
		return true, ""
	}
}
