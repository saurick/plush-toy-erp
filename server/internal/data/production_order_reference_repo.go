package data

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomheader"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/salesorder"
	"server/internal/data/model/ent/salesorderitem"
	"server/internal/data/model/ent/unit"
)

func (r *productionOrderRepo) ListProductionOrderReferenceOptions(ctx context.Context, filter biz.ProductionOrderReferenceFilter) ([]*biz.ProductionOrderReferenceOption, int, error) {
	if r == nil || r.data == nil || r.data.postgres == nil {
		return nil, 0, biz.ErrBadParam
	}
	switch filter.ReferenceType {
	case biz.ProductionOrderReferenceProduct:
		return r.listProductionOrderProductOptions(ctx, filter)
	case biz.ProductionOrderReferenceProductSKU:
		return r.listProductionOrderSKUOptions(ctx, filter)
	case biz.ProductionOrderReferenceUnit:
		return r.listProductionOrderUnitOptions(ctx, filter)
	case biz.ProductionOrderReferenceSalesOrderItem:
		return r.listProductionOrderSalesItemOptions(ctx, filter)
	case biz.ProductionOrderReferenceActiveBOM:
		return r.listProductionOrderBOMOptions(ctx, filter)
	default:
		return nil, 0, biz.ErrBadParam
	}
}

func (r *productionOrderRepo) listProductionOrderProductOptions(ctx context.Context, filter biz.ProductionOrderReferenceFilter) ([]*biz.ProductionOrderReferenceOption, int, error) {
	query := r.data.postgres.Product.Query().WithDefaultUnit()
	selected := len(filter.SelectedIDs) > 0
	if selected {
		query = query.Where(product.IDIn(filter.SelectedIDs...))
	} else {
		query = query.Where(product.IsActive(true))
		if filter.Keyword != "" {
			query = query.Where(product.Or(product.CodeContainsFold(filter.Keyword), product.NameContainsFold(filter.Keyword), product.StyleNoContainsFold(filter.Keyword), product.CustomerStyleNoContainsFold(filter.Keyword)))
		}
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Asc(product.FieldCode), ent.Asc(product.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	options := make([]*biz.ProductionOrderReferenceOption, 0, len(rows))
	for _, row := range rows {
		option := &biz.ProductionOrderReferenceOption{ReferenceType: filter.ReferenceType, Value: row.ID, Selectable: row.IsActive, Code: productionOrderStringPtr(row.Code), Name: productionOrderStringPtr(row.Name), StyleNo: row.StyleNo, CustomerStyleNo: row.CustomerStyleNo}
		if row.Edges.DefaultUnit != nil && row.Edges.DefaultUnit.IsActive {
			setReferenceUnit(option, row.Edges.DefaultUnit)
		}
		option.Label = compactProductionOrderReferenceLabel(row.Code, row.Name, productionOrderStringValue(row.StyleNo))
		markHistoricalReference(option)
		options = append(options, option)
	}
	return completeSelectedReferenceOptions(filter, options, total), selectedReferenceTotal(filter, total), nil
}

func (r *productionOrderRepo) listProductionOrderSKUOptions(ctx context.Context, filter biz.ProductionOrderReferenceFilter) ([]*biz.ProductionOrderReferenceOption, int, error) {
	query := r.data.postgres.ProductSKU.Query().WithProduct(func(q *ent.ProductQuery) { q.WithDefaultUnit() }).WithDefaultUnit()
	selected := len(filter.SelectedIDs) > 0
	if selected {
		query = query.Where(productsku.IDIn(filter.SelectedIDs...))
	} else {
		query = query.Where(productsku.ProductID(filter.ProductID))
		query = query.Where(productsku.IsActive(true), productsku.HasProductWith(product.IsActive(true)))
		if filter.Keyword != "" {
			query = query.Where(productsku.Or(productsku.SkuCodeContainsFold(filter.Keyword), productsku.SkuNameContainsFold(filter.Keyword), productsku.BarcodeContainsFold(filter.Keyword), productsku.CustomerSkuContainsFold(filter.Keyword), productsku.ColorContainsFold(filter.Keyword), productsku.ColorNoContainsFold(filter.Keyword), productsku.SizeContainsFold(filter.Keyword), productsku.PackagingVersionContainsFold(filter.Keyword)))
		}
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Asc(productsku.FieldSkuCode), ent.Asc(productsku.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	options := make([]*biz.ProductionOrderReferenceOption, 0, len(rows))
	for _, row := range rows {
		productRow := row.Edges.Product
		selectable := row.IsActive && productRow != nil && productRow.IsActive
		option := &biz.ProductionOrderReferenceOption{ReferenceType: filter.ReferenceType, Value: row.ID, Selectable: selectable, ProductValue: productionOrderIntPtr(row.ProductID), SKUCode: productionOrderStringPtr(row.SkuCode), SKUName: row.SkuName, Color: row.Color, ColorNo: row.ColorNo, Size: row.Size, PackagingVersion: row.PackagingVersion}
		if row.Edges.DefaultUnit != nil && row.Edges.DefaultUnit.IsActive {
			setReferenceUnit(option, row.Edges.DefaultUnit)
		} else if productRow != nil && productRow.Edges.DefaultUnit != nil && productRow.Edges.DefaultUnit.IsActive {
			setReferenceUnit(option, productRow.Edges.DefaultUnit)
		}
		if productRow != nil {
			option.Code = productionOrderStringPtr(productRow.Code)
			option.Name = productionOrderStringPtr(productRow.Name)
		}
		option.Label = compactProductionOrderReferenceLabel(row.SkuCode, productionOrderStringValue(row.SkuName), productionOrderStringValue(row.Color), productionOrderStringValue(row.ColorNo), productionOrderStringValue(row.Size), productionOrderStringValue(row.PackagingVersion))
		markHistoricalReference(option)
		options = append(options, option)
	}
	return completeSelectedReferenceOptions(filter, options, total), selectedReferenceTotal(filter, total), nil
}

func (r *productionOrderRepo) listProductionOrderUnitOptions(ctx context.Context, filter biz.ProductionOrderReferenceFilter) ([]*biz.ProductionOrderReferenceOption, int, error) {
	query := r.data.postgres.Unit.Query()
	selected := len(filter.SelectedIDs) > 0
	if selected {
		query = query.Where(unit.IDIn(filter.SelectedIDs...))
	} else {
		query = query.Where(unit.IsActive(true))
		if filter.Keyword != "" {
			query = query.Where(unit.Or(unit.CodeContainsFold(filter.Keyword), unit.NameContainsFold(filter.Keyword)))
		}
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Asc(unit.FieldCode), ent.Asc(unit.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	options := make([]*biz.ProductionOrderReferenceOption, 0, len(rows))
	for _, row := range rows {
		option := &biz.ProductionOrderReferenceOption{ReferenceType: filter.ReferenceType, Value: row.ID, Selectable: row.IsActive, UnitValue: productionOrderIntPtr(row.ID), UnitCode: productionOrderStringPtr(row.Code), UnitName: productionOrderStringPtr(row.Name), UnitPrecision: productionOrderIntPtr(row.Precision), Label: compactProductionOrderReferenceLabel(row.Name, row.Code)}
		markHistoricalReference(option)
		options = append(options, option)
	}
	return completeSelectedReferenceOptions(filter, options, total), selectedReferenceTotal(filter, total), nil
}

func (r *productionOrderRepo) listProductionOrderSalesItemOptions(ctx context.Context, filter biz.ProductionOrderReferenceFilter) ([]*biz.ProductionOrderReferenceOption, int, error) {
	query := r.data.postgres.SalesOrderItem.Query().WithSalesOrder().WithProduct().WithProductSku().WithUnit()
	selected := len(filter.SelectedIDs) > 0
	if selected {
		query = query.Where(salesorderitem.IDIn(filter.SelectedIDs...))
	} else {
		if filter.ProductID > 0 {
			query = query.Where(salesorderitem.ProductID(filter.ProductID))
		}
		if filter.UnitID > 0 {
			query = query.Where(salesorderitem.UnitID(filter.UnitID))
		}
		if filter.ProductSKUID > 0 {
			query = query.Where(salesorderitem.ProductSkuID(filter.ProductSKUID))
		}
		query = query.Where(
			salesorderitem.LineStatus(biz.SalesOrderItemStatusOpen),
			salesorderitem.HasSalesOrderWith(salesorder.LifecycleStatus(biz.SalesOrderStatusActive)),
			salesorderitem.HasProductWith(product.IsActive(true)),
			salesorderitem.HasUnitWith(unit.IsActive(true)),
			salesorderitem.Or(
				salesorderitem.ProductSkuIDIsNil(),
				salesorderitem.HasProductSkuWith(productsku.IsActive(true)),
			),
		)
		if filter.Keyword != "" {
			predicates := []predicate.SalesOrderItem{
				salesorderitem.HasSalesOrderWith(salesorder.Or(salesorder.OrderNoContainsFold(filter.Keyword), salesorder.CustomerOrderNoContainsFold(filter.Keyword))),
				salesorderitem.ProductCodeSnapshotContainsFold(filter.Keyword),
				salesorderitem.ProductNameSnapshotContainsFold(filter.Keyword),
			}
			if lineNo, err := strconv.Atoi(filter.Keyword); err == nil && lineNo > 0 {
				predicates = append(predicates, salesorderitem.LineNo(lineNo))
			}
			query = query.Where(salesorderitem.Or(predicates...))
		}
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Asc(salesorderitem.FieldSalesOrderID), ent.Asc(salesorderitem.FieldLineNo), ent.Asc(salesorderitem.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	options := make([]*biz.ProductionOrderReferenceOption, 0, len(rows))
	for _, row := range rows {
		orderRow, productRow, skuRow, unitRow := row.Edges.SalesOrder, row.Edges.Product, row.Edges.ProductSku, row.Edges.Unit
		selectable := orderRow != nil && orderRow.LifecycleStatus == biz.SalesOrderStatusActive && row.LineStatus == biz.SalesOrderItemStatusOpen && productRow != nil && productRow.IsActive && unitRow != nil && unitRow.IsActive
		if row.ProductSkuID != nil {
			selectable = selectable && skuRow != nil && skuRow.IsActive
		}
		option := &biz.ProductionOrderReferenceOption{ReferenceType: filter.ReferenceType, Value: row.ID, Selectable: selectable, ProductValue: productionOrderIntPtr(row.ProductID), SKUValue: row.ProductSkuID, UnitValue: productionOrderIntPtr(row.UnitID), SalesLineNo: productionOrderIntPtr(row.LineNo), OrderedQuantity: productionOrderStringPtr(row.OrderedQuantity.String()), PlannedDeliveryAt: row.PlannedDeliveryDate, SalesLineStatus: productionOrderStringPtr(row.LineStatus)}
		if orderRow != nil {
			option.SalesOrderNo = productionOrderStringPtr(orderRow.OrderNo)
			option.SalesOrderStatus = productionOrderStringPtr(orderRow.LifecycleStatus)
		}
		if productRow != nil {
			option.Code, option.Name = productionOrderStringPtr(productRow.Code), productionOrderStringPtr(productRow.Name)
		}
		if skuRow != nil {
			option.SKUCode, option.SKUName = productionOrderStringPtr(skuRow.SkuCode), skuRow.SkuName
		}
		if unitRow != nil {
			setReferenceUnit(option, unitRow)
		}
		option.Label = compactProductionOrderReferenceLabel(productionOrderStringValue(option.SalesOrderNo), fmt.Sprintf("第 %d 行", row.LineNo), productionOrderStringValue(option.Name), productionOrderStringValue(option.SKUCode), row.OrderedQuantity.String(), productionOrderStringValue(option.UnitName))
		markHistoricalReference(option)
		options = append(options, option)
	}
	return completeSelectedReferenceOptions(filter, options, total), selectedReferenceTotal(filter, total), nil
}

func (r *productionOrderRepo) listProductionOrderBOMOptions(ctx context.Context, filter biz.ProductionOrderReferenceFilter) ([]*biz.ProductionOrderReferenceOption, int, error) {
	query := r.data.postgres.BOMHeader.Query().WithProduct()
	selected := len(filter.SelectedIDs) > 0
	if selected {
		query = query.Where(bomheader.IDIn(filter.SelectedIDs...))
	} else {
		query = query.Where(bomheader.ProductID(filter.ProductID))
		query = query.Where(bomheader.Status(biz.BOMStatusActive), bomheader.HasProductWith(product.IsActive(true)))
		if filter.Keyword != "" {
			query = query.Where(bomheader.Or(bomheader.VersionContainsFold(filter.Keyword), bomheader.SourceOrderNoContainsFold(filter.Keyword)))
		}
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Asc(bomheader.FieldVersion), ent.Asc(bomheader.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	options := make([]*biz.ProductionOrderReferenceOption, 0, len(rows))
	for _, row := range rows {
		productRow := row.Edges.Product
		option := &biz.ProductionOrderReferenceOption{ReferenceType: filter.ReferenceType, Value: row.ID, Selectable: row.Status == biz.BOMStatusActive && productRow != nil && productRow.IsActive, ProductValue: productionOrderIntPtr(row.ProductID), BOMVersion: productionOrderStringPtr(row.Version), EffectiveFrom: row.EffectiveFrom, EffectiveTo: row.EffectiveTo}
		if productRow != nil {
			option.Code, option.Name = productionOrderStringPtr(productRow.Code), productionOrderStringPtr(productRow.Name)
		}
		option.Label = compactProductionOrderReferenceLabel(productionOrderStringValue(option.Code), productionOrderStringValue(option.Name), "BOM "+row.Version)
		markHistoricalReference(option)
		options = append(options, option)
	}
	return completeSelectedReferenceOptions(filter, options, total), selectedReferenceTotal(filter, total), nil
}

func completeSelectedReferenceOptions(filter biz.ProductionOrderReferenceFilter, options []*biz.ProductionOrderReferenceOption, _ int) []*biz.ProductionOrderReferenceOption {
	if len(filter.SelectedIDs) == 0 {
		return options
	}
	byID := make(map[int]*biz.ProductionOrderReferenceOption, len(options))
	for _, option := range options {
		byID[option.Value] = option
	}
	out := make([]*biz.ProductionOrderReferenceOption, 0, len(filter.SelectedIDs))
	for _, id := range filter.SelectedIDs {
		if option := byID[id]; option != nil {
			out = append(out, option)
			continue
		}
		reason := "原关联记录已不可用"
		out = append(out, &biz.ProductionOrderReferenceOption{ReferenceType: filter.ReferenceType, Value: id, Label: reason, Selectable: false, Reason: &reason})
	}
	return out
}

func selectedReferenceTotal(filter biz.ProductionOrderReferenceFilter, total int) int {
	if len(filter.SelectedIDs) > 0 {
		return len(filter.SelectedIDs)
	}
	return total
}

func markHistoricalReference(option *biz.ProductionOrderReferenceOption) {
	if option == nil || option.Selectable {
		return
	}
	reason := "历史关联，仅供查看"
	option.Reason = &reason
}

func setReferenceUnit(option *biz.ProductionOrderReferenceOption, row *ent.Unit) {
	if option == nil || row == nil {
		return
	}
	option.UnitValue = productionOrderIntPtr(row.ID)
	option.UnitCode = productionOrderStringPtr(row.Code)
	option.UnitName = productionOrderStringPtr(row.Name)
	option.UnitPrecision = productionOrderIntPtr(row.Precision)
}

func compactProductionOrderReferenceLabel(parts ...string) string {
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if value := strings.TrimSpace(part); value != "" {
			out = append(out, value)
		}
	}
	return strings.Join(out, " / ")
}

func productionOrderStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func productionOrderStringPtr(value string) *string { return &value }
func productionOrderIntPtr(value int) *int          { return &value }

func sortReferenceIDs(values []int) []int {
	out := append([]int(nil), values...)
	sort.Ints(out)
	return out
}
