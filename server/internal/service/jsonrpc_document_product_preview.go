package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) listDocumentProductPreviews(ctx context.Context, pm map[string]any) *v1.JsonrpcResult {
	source := getString(pm, "source_type")
	permissions := biz.DocumentProductPreviewPermissions(source)
	if len(permissions) == 0 {
		return invalidParamResult()
	}
	for _, permission := range permissions {
		if res := d.RequireAdminPermission(ctx, permission); res != nil {
			return res
		}
	}
	values, ok := pm["document_ids"].([]any)
	if !ok || len(values) == 0 || len(values) > biz.DocumentProductPreviewBatchLimit {
		return invalidParamResult()
	}
	ids := make([]int, 0, len(values))
	for _, value := range values {
		id, valid := positiveSafeIntegerParam(map[string]any{"id": value}, "id")
		if !valid {
			return invalidParamResult()
		}
		ids = append(ids, id)
	}
	rows, err := d.attachmentUC.ListDocumentProductPreviews(ctx, source, ids)
	if err != nil {
		return d.mapBusinessAttachmentError(ctx, err)
	}
	items := make([]any, 0, len(rows))
	for _, row := range rows {
		items = append(items, map[string]any{
			"document_id": row.DocumentID, "product_count": row.ProductCount,
			"product_id": row.ProductID, "product_name": row.ProductName, "product_code": row.ProductCode,
		})
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"previews": items})}
}
