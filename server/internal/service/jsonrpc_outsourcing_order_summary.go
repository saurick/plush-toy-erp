package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleOutsourcingOrderSummary(ctx context.Context, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	if res := d.RequireAdminPermission(ctx, biz.PermissionOutsourcingOrderRead); res != nil {
		return id, res, nil
	}
	if !sourceOrderAllowsOnly(pm, "keyword", "supplier_id", "process_id", "lifecycle_status", "lifecycle_scope", "date_field", "date_from", "date_to", "limit", "offset") {
		return id, invalidParamResult(), nil
	}
	filter := biz.OutsourcingOrderSummaryFilter{OutsourcingOrderFilter: biz.OutsourcingOrderFilter{Limit: 20}}
	for key, target := range map[string]*string{"keyword": &filter.Keyword, "lifecycle_status": &filter.LifecycleStatus, "lifecycle_scope": &filter.LifecycleScope, "date_field": &filter.DateField} {
		if raw, exists := pm[key]; exists {
			value, ok := raw.(string)
			if !ok {
				return id, invalidParamResult(), nil
			}
			*target = value
		}
	}
	for key, target := range map[string]*int{"supplier_id": &filter.SupplierID, "process_id": &filter.ProcessID, "limit": &filter.Limit, "offset": &filter.Offset} {
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
	rows, total, err := d.outsourcingOrderUC.ListOutsourcingOrderSummary(ctx, filter)
	if err != nil {
		return id, d.mapOutsourcingOrderError(ctx, err), nil
	}
	items := make([]any, 0, len(rows))
	for _, row := range rows {
		mapped := outsourcingOrderItemToMap(row.Item)
		mapped["outsourcing_order_no"] = row.Order.OutsourcingOrderNo
		mapped["supplier_id"] = row.Order.SupplierID
		mapped["supplier_name"] = row.Order.SupplierSnapshot["name"]
		mapped["supplier_short_name"] = row.Order.SupplierSnapshot["short_name"]
		mapped["buyer_contact"] = row.Order.ContractPartySnapshot["buyerContact"]
		mapped["buyer_phone"] = row.Order.ContractPartySnapshot["buyerPhone"]
		mapped["source_order_no"] = optionalStringValue(row.Order.SourceOrderNo)
		mapped["currency"] = row.Order.Currency
		mapped["order_date"] = row.Order.OrderDate.Unix()
		mapped["lifecycle_status"] = row.Order.LifecycleStatus
		items = append(items, mapped)
	}
	return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
		"items": items, "total": total, "limit": filter.Limit, "offset": filter.Offset,
	})}, nil
}
