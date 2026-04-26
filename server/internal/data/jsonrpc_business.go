package data

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *JsonrpcData) handleBusiness(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	l := d.log.WithContext(ctx)

	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}

	claims, res := d.requireAdmin(ctx)
	if res != nil {
		l.Warnf("[business] requireAdmin denied method=%s id=%s code=%d msg=%s", method, id, res.Code, res.Message)
		return id, res, nil
	}
	if d.businessUC == nil {
		l.Errorf("[business] usecase is nil method=%s id=%s", method, id)
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "dashboard_stats":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBusinessRecordRead); res != nil {
			return id, res, nil
		}
		stats, err := d.businessUC.DashboardStats(ctx)
		if err != nil {
			return id, d.mapBusinessRecordError(ctx, err), nil
		}
		modules := make([]map[string]any, 0, len(stats))
		for _, item := range stats {
			statusCounts := make(map[string]any, len(item.StatusCounts))
			for statusKey, count := range item.StatusCounts {
				statusCounts[statusKey] = count
			}
			modules = append(modules, map[string]any{
				"module_key":    item.ModuleKey,
				"total":         item.TotalRecords,
				"status_counts": statusCounts,
			})
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"modules": modules,
			}),
		}, nil

	case "list_records":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBusinessRecordRead); res != nil {
			return id, res, nil
		}
		limit := getWorkflowLimit(pm)
		offset := getWorkflowOffset(pm)
		records, total, err := d.businessUC.ListRecords(ctx, biz.BusinessRecordFilter{
			ModuleKey:          getString(pm, "module_key"),
			BusinessStatusKey:  getString(pm, "business_status_key"),
			BusinessStatusKeys: getStringSlice(pm, "business_status_keys"),
			OwnerRoleKey:       getString(pm, "owner_role_key"),
			IncludeDeleted:     getBool(pm, "include_deleted", false),
			DeletedOnly:        getBool(pm, "deleted_only", false),
			Keyword:            getString(pm, "keyword"),
			DateFilterKey:      getString(pm, "date_filter_key"),
			DateRangeStart:     getString(pm, "date_range_start"),
			DateRangeEnd:       getString(pm, "date_range_end"),
			SortOrder:          getString(pm, "sort_order"),
			Limit:              limit,
			Offset:             offset,
		})
		if err != nil {
			return id, d.mapBusinessRecordError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"records": businessRecordsToAny(records),
				"total":   total,
				"limit":   limit,
				"offset":  offset,
			}),
		}, nil

	case "create_record":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBusinessRecordCreate); res != nil {
			return id, res, nil
		}
		mutation, ok := businessRecordMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "业务单据参数不合法"}, nil
		}
		record, err := d.businessUC.CreateRecord(ctx, &mutation, claims.UserID)
		if err != nil {
			return id, d.mapBusinessRecordError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "业务记录已创建",
			Data:    newDataStruct(map[string]any{"record": businessRecordToMap(record)}),
		}, nil

	case "update_record":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBusinessRecordUpdate); res != nil {
			return id, res, nil
		}
		mutation, ok := businessRecordMutationFromParams(pm)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "业务单据参数不合法"}, nil
		}
		record, err := d.businessUC.UpdateRecord(ctx, getInt(pm, "id", 0), &mutation, claims.UserID)
		if err != nil {
			return id, d.mapBusinessRecordError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "业务记录已更新",
			Data:    newDataStruct(map[string]any{"record": businessRecordToMap(record)}),
		}, nil

	case "delete_records":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBusinessRecordDelete); res != nil {
			return id, res, nil
		}
		affected, err := d.businessUC.DeleteRecords(ctx, getBusinessRecordIDs(pm), getString(pm, "delete_reason"), claims.UserID)
		if err != nil {
			return id, d.mapBusinessRecordError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "业务记录已移入回收站",
			Data:    newDataStruct(map[string]any{"affected": affected}),
		}, nil

	case "restore_record":
		if res := d.RequireAdminPermission(ctx, biz.PermissionBusinessRecordDelete); res != nil {
			return id, res, nil
		}
		record, err := d.businessUC.RestoreRecord(ctx, getInt(pm, "id", 0), claims.UserID)
		if err != nil {
			return id, d.mapBusinessRecordError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "业务记录已恢复",
			Data:    newDataStruct(map[string]any{"record": businessRecordToMap(record)}),
		}, nil

	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 business 接口 method=%s", method),
		}, nil
	}
}

func (d *JsonrpcData) mapBusinessRecordError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)

	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[business] invalid param err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	case errors.Is(err, biz.ErrBusinessRecordNotFound):
		l.Warnf("[business] record not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "业务记录不存在"}
	case errors.Is(err, biz.ErrBusinessRecordExists):
		l.Warnf("[business] record exists err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "同模块单据号已存在"}
	case errors.Is(err, biz.ErrBusinessRecordVersionConflict):
		l.Warnf("[business] version conflict err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "业务记录已被其他人更新，请刷新后重试"}
	default:
		l.Errorf("[business] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func businessRecordMutationFromParams(pm map[string]any) (biz.BusinessRecordMutation, bool) {
	payload, ok := getWorkflowPayload(pm, "payload")
	if !ok {
		return biz.BusinessRecordMutation{}, false
	}
	items, ok := getBusinessRecordItems(pm)
	if !ok {
		return biz.BusinessRecordMutation{}, false
	}
	return biz.BusinessRecordMutation{
		ModuleKey:          getString(pm, "module_key"),
		DocumentNo:         getWorkflowStringPtr(pm, "document_no"),
		Title:              getString(pm, "title"),
		BusinessStatusKey:  getString(pm, "business_status_key"),
		OwnerRoleKey:       getString(pm, "owner_role_key"),
		SourceNo:           getWorkflowStringPtr(pm, "source_no"),
		CustomerName:       getWorkflowStringPtr(pm, "customer_name"),
		SupplierName:       getWorkflowStringPtr(pm, "supplier_name"),
		StyleNo:            getWorkflowStringPtr(pm, "style_no"),
		ProductNo:          getWorkflowStringPtr(pm, "product_no"),
		ProductName:        getWorkflowStringPtr(pm, "product_name"),
		MaterialName:       getWorkflowStringPtr(pm, "material_name"),
		WarehouseLocation:  getWorkflowStringPtr(pm, "warehouse_location"),
		Quantity:           getBusinessRecordFloatPtr(pm, "quantity"),
		Unit:               getWorkflowStringPtr(pm, "unit"),
		Amount:             getBusinessRecordFloatPtr(pm, "amount"),
		DocumentDate:       getWorkflowStringPtr(pm, "document_date"),
		DueDate:            getWorkflowStringPtr(pm, "due_date"),
		Payload:            payload,
		Items:              items,
		ExpectedRowVersion: int64(getInt(pm, "row_version", 0)),
	}, true
}

func getBusinessRecordItems(pm map[string]any) ([]*biz.BusinessRecordItemMutation, bool) {
	raw, ok := pm["items"]
	if !ok || raw == nil {
		return nil, true
	}
	rawItems, ok := raw.([]any)
	if !ok {
		return nil, false
	}
	out := make([]*biz.BusinessRecordItemMutation, 0, len(rawItems))
	for index, rawItem := range rawItems {
		itemMap, ok := rawItem.(map[string]any)
		if !ok {
			return nil, false
		}
		payload, ok := getWorkflowPayload(itemMap, "payload")
		if !ok {
			return nil, false
		}
		out = append(out, &biz.BusinessRecordItemMutation{
			LineNo:            getInt(itemMap, "line_no", index+1),
			ItemName:          getWorkflowStringPtr(itemMap, "item_name"),
			MaterialName:      getWorkflowStringPtr(itemMap, "material_name"),
			Spec:              getWorkflowStringPtr(itemMap, "spec"),
			Unit:              getWorkflowStringPtr(itemMap, "unit"),
			Quantity:          getBusinessRecordFloatPtr(itemMap, "quantity"),
			UnitPrice:         getBusinessRecordFloatPtr(itemMap, "unit_price"),
			Amount:            getBusinessRecordFloatPtr(itemMap, "amount"),
			SupplierName:      getWorkflowStringPtr(itemMap, "supplier_name"),
			WarehouseLocation: getWorkflowStringPtr(itemMap, "warehouse_location"),
			Payload:           payload,
		})
	}
	return out, true
}

func getBusinessRecordFloatPtr(m map[string]any, key string) *float64 {
	raw, ok := m[key]
	if !ok || raw == nil {
		return nil
	}
	switch value := raw.(type) {
	case float64:
		return &value
	case int:
		converted := float64(value)
		return &converted
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return nil
		}
		parsed, err := strconv.ParseFloat(trimmed, 64)
		if err != nil {
			return nil
		}
		return &parsed
	default:
		return nil
	}
}

func getBusinessRecordIDs(m map[string]any) []int {
	raw, ok := m["ids"]
	if !ok || raw == nil {
		id := getInt(m, "id", 0)
		if id <= 0 {
			return nil
		}
		return []int{id}
	}
	rawItems, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]int, 0, len(rawItems))
	for _, item := range rawItems {
		switch value := item.(type) {
		case float64:
			out = append(out, int(value))
		case int:
			out = append(out, value)
		}
	}
	return out
}

func businessRecordsToAny(items []*biz.BusinessRecord) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, businessRecordToMap(item))
	}
	return out
}

func businessRecordToMap(record *biz.BusinessRecord) map[string]any {
	if record == nil {
		return nil
	}
	return map[string]any{
		"id":                  record.ID,
		"module_key":          record.ModuleKey,
		"document_no":         workflowStringValue(record.DocumentNo),
		"title":               record.Title,
		"business_status_key": record.BusinessStatusKey,
		"owner_role_key":      record.OwnerRoleKey,
		"source_no":           workflowStringValue(record.SourceNo),
		"customer_name":       workflowStringValue(record.CustomerName),
		"supplier_name":       workflowStringValue(record.SupplierName),
		"style_no":            workflowStringValue(record.StyleNo),
		"product_no":          workflowStringValue(record.ProductNo),
		"product_name":        workflowStringValue(record.ProductName),
		"material_name":       workflowStringValue(record.MaterialName),
		"warehouse_location":  workflowStringValue(record.WarehouseLocation),
		"quantity":            businessFloatValue(record.Quantity),
		"unit":                workflowStringValue(record.Unit),
		"amount":              businessFloatValue(record.Amount),
		"document_date":       workflowStringValue(record.DocumentDate),
		"due_date":            workflowStringValue(record.DueDate),
		"payload":             workflowMapValue(record.Payload),
		"items":               businessRecordItemsToAny(record.Items),
		"row_version":         record.RowVersion,
		"created_by":          workflowIntValue(record.CreatedBy),
		"updated_by":          workflowIntValue(record.UpdatedBy),
		"created_at":          record.CreatedAt.Unix(),
		"updated_at":          record.UpdatedAt.Unix(),
		"deleted_at":          businessUnixValue(record.DeletedAt),
		"deleted_by":          workflowIntValue(record.DeletedBy),
		"delete_reason":       workflowStringValue(record.DeleteReason),
	}
}

func businessRecordItemsToAny(items []*biz.BusinessRecordItem) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, map[string]any{
			"id":                 item.ID,
			"record_id":          item.RecordID,
			"module_key":         item.ModuleKey,
			"line_no":            item.LineNo,
			"item_name":          workflowStringValue(item.ItemName),
			"material_name":      workflowStringValue(item.MaterialName),
			"spec":               workflowStringValue(item.Spec),
			"unit":               workflowStringValue(item.Unit),
			"quantity":           businessFloatValue(item.Quantity),
			"unit_price":         businessFloatValue(item.UnitPrice),
			"amount":             businessFloatValue(item.Amount),
			"supplier_name":      workflowStringValue(item.SupplierName),
			"warehouse_location": workflowStringValue(item.WarehouseLocation),
			"payload":            workflowMapValue(item.Payload),
			"created_at":         item.CreatedAt.Unix(),
			"updated_at":         item.UpdatedAt.Unix(),
		})
	}
	return out
}

func businessFloatValue(value *float64) any {
	if value == nil {
		return nil
	}
	return *value
}

func businessUnixValue(value *time.Time) any {
	if value == nil {
		return nil
	}
	return value.Unix()
}
