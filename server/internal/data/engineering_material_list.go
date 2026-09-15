package data

import (
	"context"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/engineeringmaterialrequest"
	"server/internal/data/model/ent/salesorder"
	"strings"
)

func (r *salesOrderRepo) ListEngineeringMaterialRequests(ctx context.Context, filter biz.EngineeringMaterialListFilter) (*biz.EngineeringMaterialList, error) {
	query := r.data.postgres.EngineeringMaterialRequest.Query()
	if filter.Keyword != "" {
		query.Where(engineeringmaterialrequest.OrderNoSnapshotContainsFold(filter.Keyword))
	}
	if filter.Status != "" {
		query.Where(engineeringmaterialrequest.Status(filter.Status))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := query.Order(ent.Desc(engineeringmaterialrequest.FieldID)).Offset((filter.Page - 1) * filter.Limit).Limit(filter.Limit).
		WithSalesOrder(func(q *ent.SalesOrderQuery) { q.Select(salesorder.FieldID, salesorder.FieldLifecycleStatus) }).All(ctx)
	if err != nil {
		return nil, err
	}
	result := &biz.EngineeringMaterialList{Items: []*biz.EngineeringMaterialListItem{}, Total: total}
	for _, row := range rows {
		item := &biz.EngineeringMaterialListItem{ID: row.ID, SalesOrderID: row.SalesOrderID, OrderNo: row.OrderNoSnapshot, Status: row.Status, SubmittedAt: row.SubmittedAt, Products: []string{}}
		if row.Edges.SalesOrder != nil {
			item.OrderStatus = row.Edges.SalesOrder.LifecycleStatus
		}
		seen := map[string]bool{}
		for _, source := range row.SourceSnapshot {
			name, _ := source["product_name"].(string)
			name = strings.TrimSpace(name)
			if name != "" && !seen[name] {
				item.Products = append(item.Products, name)
				seen[name] = true
			}
		}
		result.Items = append(result.Items, item)
	}
	return result, nil
}
