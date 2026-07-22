package data

import (
	"context"
	"sort"
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/outsourcingfact"
	"server/internal/data/model/ent/outsourcingorder"
	"server/internal/data/model/ent/productionfact"
	"server/internal/data/model/ent/productionorder"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/salesreturn"
	"server/internal/data/model/ent/shipment"
)

type businessSourceReference struct {
	sourceType *string
	sourceID   *int
}

type businessSourceKey struct {
	sourceType string
	sourceID   int
}

func resolveBusinessSourceNos(
	ctx context.Context,
	client *ent.Client,
	references []businessSourceReference,
) (map[businessSourceKey]string, error) {
	idsByType := make(map[string]map[int]struct{})
	for _, reference := range references {
		key, ok := resolvableBusinessSourceKey(reference.sourceType, reference.sourceID)
		if !ok {
			continue
		}
		if idsByType[key.sourceType] == nil {
			idsByType[key.sourceType] = make(map[int]struct{})
		}
		idsByType[key.sourceType][key.sourceID] = struct{}{}
	}

	resolved := make(map[businessSourceKey]string)
	for sourceType, idSet := range idsByType {
		ids := make([]int, 0, len(idSet))
		for id := range idSet {
			ids = append(ids, id)
		}
		sort.Ints(ids)

		switch sourceType {
		case biz.ProductionOrderSourceType:
			rows, err := client.ProductionOrder.Query().
				Where(productionorder.IDIn(ids...)).
				Select(productionorder.FieldID, productionorder.FieldOrderNo).
				All(ctx)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				resolved[businessSourceKey{sourceType: sourceType, sourceID: row.ID}] = row.OrderNo
			}
		case biz.ProductionFactSourceType:
			rows, err := client.ProductionFact.Query().
				Where(productionfact.IDIn(ids...)).
				Select(productionfact.FieldID, productionfact.FieldFactNo).
				All(ctx)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				resolved[businessSourceKey{sourceType: sourceType, sourceID: row.ID}] = row.FactNo
			}
		case biz.OutsourcingOrderSourceType:
			rows, err := client.OutsourcingOrder.Query().
				Where(outsourcingorder.IDIn(ids...)).
				Select(outsourcingorder.FieldID, outsourcingorder.FieldOutsourcingOrderNo).
				All(ctx)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				resolved[businessSourceKey{sourceType: sourceType, sourceID: row.ID}] = row.OutsourcingOrderNo
			}
		case biz.OutsourcingFactSourceType:
			rows, err := client.OutsourcingFact.Query().
				Where(outsourcingfact.IDIn(ids...)).
				Select(outsourcingfact.FieldID, outsourcingfact.FieldFactNo).
				All(ctx)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				resolved[businessSourceKey{sourceType: sourceType, sourceID: row.ID}] = row.FactNo
			}
		case biz.ShipmentSourceType:
			rows, err := client.Shipment.Query().
				Where(shipment.IDIn(ids...)).
				Select(shipment.FieldID, shipment.FieldShipmentNo).
				All(ctx)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				resolved[businessSourceKey{sourceType: sourceType, sourceID: row.ID}] = row.ShipmentNo
			}
		case biz.PurchaseReceiptSourceType:
			rows, err := client.PurchaseReceipt.Query().
				Where(purchasereceipt.IDIn(ids...)).
				Select(purchasereceipt.FieldID, purchasereceipt.FieldReceiptNo).
				All(ctx)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				resolved[businessSourceKey{sourceType: sourceType, sourceID: row.ID}] = row.ReceiptNo
			}
		case biz.FinanceFactSourceType:
			rows, err := client.FinanceFact.Query().
				Where(financefact.IDIn(ids...)).
				Select(financefact.FieldID, financefact.FieldFactNo).
				All(ctx)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				resolved[businessSourceKey{sourceType: sourceType, sourceID: row.ID}] = row.FactNo
			}
		case biz.SalesReturnSourceType:
			rows, err := client.SalesReturn.Query().Where(salesreturn.IDIn(ids...)).Select(salesreturn.FieldID, salesreturn.FieldReturnNo).All(ctx)
			if err != nil {
				return nil, err
			}
			for _, row := range rows {
				resolved[businessSourceKey{sourceType: sourceType, sourceID: row.ID}] = row.ReturnNo
			}
		}
	}
	return resolved, nil
}

func businessSourceNo(
	resolved map[businessSourceKey]string,
	sourceType *string,
	sourceID *int,
) *string {
	key, ok := resolvableBusinessSourceKey(sourceType, sourceID)
	if !ok {
		return nil
	}
	value, ok := resolved[key]
	if !ok || strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func resolvableBusinessSourceKey(sourceType *string, sourceID *int) (businessSourceKey, bool) {
	if sourceType == nil || sourceID == nil || *sourceID <= 0 {
		return businessSourceKey{}, false
	}
	normalizedType := strings.ToUpper(strings.TrimSpace(*sourceType))
	switch normalizedType {
	case biz.ProductionOrderSourceType,
		biz.ProductionFactSourceType,
		biz.OutsourcingOrderSourceType,
		biz.OutsourcingFactSourceType,
		biz.ShipmentSourceType,
		biz.PurchaseReceiptSourceType,
		biz.FinanceFactSourceType,
		biz.SalesReturnSourceType:
		return businessSourceKey{sourceType: normalizedType, sourceID: *sourceID}, true
	default:
		return businessSourceKey{}, false
	}
}
