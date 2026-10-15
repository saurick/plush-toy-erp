package data

import (
	"context"
	"encoding/json"
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/purchaseorder"
)

type purchaseEngineeringSource struct {
	MaterialID        int    `json:"material_id"`
	UnitID            int    `json:"unit_id"`
	CustomerProductNo string `json:"customer_product_no"`
	ProductCode       string `json:"product_code"`
	ProductName       string `json:"product_name"`
	MaterialNote      string `json:"material_note"`
}

// Generated orders retain the approval as their immutable display source. Reading
// that source also preserves all products when several BOMs share one material.
func purchaseOrderItemsWithEngineeringSource(ctx context.Context, client *ent.Client, orderID int, items []*biz.PurchaseOrderItem) ([]*biz.PurchaseOrderItem, error) {
	if len(items) == 0 {
		return items, nil
	}
	order, err := client.PurchaseOrder.Query().Where(purchaseorder.ID(orderID)).WithEngineeringMaterialRequest().Only(ctx)
	if err != nil {
		return nil, err
	}
	if order.EngineeringMaterialRequestID == nil {
		return items, nil
	}
	request := order.Edges.EngineeringMaterialRequest
	if request == nil || request.Status != biz.MaterialRequestApproved {
		return nil, biz.ErrMaterialRequestNotReady
	}
	encoded, err := json.Marshal(request.SourceSnapshot)
	if err != nil {
		return nil, err
	}
	var sources []purchaseEngineeringSource
	if err := json.Unmarshal(encoded, &sources); err != nil {
		return nil, err
	}
	byMaterial := make(map[[2]int][]purchaseEngineeringSource)
	for _, source := range sources {
		key := [2]int{source.MaterialID, source.UnitID}
		byMaterial[key] = append(byMaterial[key], source)
	}
	for _, item := range items {
		sources := byMaterial[[2]int{item.MaterialID, item.UnitID}]
		if len(sources) == 0 {
			return nil, biz.ErrMaterialRequestNotReady
		}
		var productNos, productNames, notes []string
		for _, source := range sources {
			productNo := strings.TrimSpace(source.CustomerProductNo)
			if productNo == "" {
				productNo = source.ProductCode
			}
			productNos = append(productNos, productNo)
			productNames = append(productNames, source.ProductName)
			notes = append(notes, source.MaterialNote)
		}
		item.ProductOrderNoSnapshot = joinedEngineeringPurchaseValues([]string{request.OrderNoSnapshot})
		item.ProductNoSnapshot = joinedEngineeringPurchaseValues(productNos)
		item.ProductNameSnapshot = joinedEngineeringPurchaseValues(productNames)
		item.Note = joinedEngineeringPurchaseValues(notes)
	}
	return items, nil
}

func joinedEngineeringPurchaseValues(values []string) *string {
	seen := make(map[string]bool)
	var distinct []string
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" && !seen[value] {
			seen[value] = true
			distinct = append(distinct, value)
		}
	}
	if len(distinct) == 0 {
		return nil
	}
	value := strings.Join(distinct, "\n")
	return &value
}
