package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleSalesOrderSummary(ctx context.Context, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	for _, permission := range []string{biz.PermissionERPWorkbenchRead, biz.PermissionSalesOrderRead, biz.PermissionSalesOrderItemRead} {
		if res := d.RequireAdminPermission(ctx, permission); res != nil {
			return id, res, nil
		}
	}
	if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), "sales_orders"); res != nil {
		return id, res, nil
	}
	if !sourceOrderAllowsOnly(pm, "customer_key", "keyword", "customer", "sales_owner", "lifecycle_status", "date_field", "date_from", "date_to", "limit", "offset") {
		return id, invalidParamResult(), nil
	}
	filter := biz.SalesOrderSummaryFilter{SalesOrderFilter: biz.SalesOrderFilter{Limit: 20, LifecycleScope: "all"}}
	for key, target := range map[string]*string{"keyword": &filter.Keyword, "customer": &filter.Customer, "sales_owner": &filter.SalesOwner, "lifecycle_status": &filter.LifecycleStatus, "date_field": &filter.DateField} {
		if raw, exists := pm[key]; exists {
			value, ok := raw.(string)
			if !ok {
				return id, invalidParamResult(), nil
			}
			*target = value
		}
	}
	for key, target := range map[string]*int{"limit": &filter.Limit, "offset": &filter.Offset} {
		if raw, exists := pm[key]; exists {
			value, ok := raw.(float64)
			if !ok || value < 0 || value > 10000000 || value != float64(int(value)) {
				return id, invalidParamResult(), nil
			}
			*target = int(value)
		}
	}
	var ok bool
	filter.DateFrom, ok = getOptionalJSONRPCTime(pm, "date_from")
	if !ok {
		return id, invalidParamResult(), nil
	}
	filter.DateTo, ok = getOptionalJSONRPCTime(pm, "date_to")
	if !ok {
		return id, invalidParamResult(), nil
	}
	rows, total, err := d.salesOrderUC.ListSalesOrderSummary(ctx, filter)
	if err != nil {
		return id, d.mapSalesOrderError(ctx, err), nil
	}
	items := make([]any, 0, len(rows))
	for _, row := range rows {
		mapped := salesOrderItemToMap(row.Item)
		delete(mapped, "import_source")
		mapped["order_no"] = row.Order.OrderNo
		mapped["customer_name"] = row.Order.CustomerSnapshot["name"]
		mapped["customer_order_no"] = optionalStringValue(row.Order.CustomerOrderNo)
		mapped["sales_owner"] = optionalStringValue(row.Order.SalesOwner)
		mapped["currency"] = row.Order.Currency
		mapped["order_date"] = row.Order.OrderDate.Unix()
		mapped["lifecycle_status"] = row.Order.LifecycleStatus
		mapped["unit_name"] = row.UnitName
		items = append(items, mapped)
	}
	return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
		"items": items, "total": total, "limit": filter.Limit, "offset": filter.Offset,
	})}, nil
}
