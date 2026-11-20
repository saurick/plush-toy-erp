package service

import (
	"context"
	"errors"

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
	includeProducts, valid := getOptionalJSONRPCBool(pm, "include_products")
	if !valid {
		return invalidParamResult()
	}
	options := biz.DocumentProductPreviewOptions{IncludeProducts: includeProducts != nil && *includeProducts}
	if _, exists := pm["expected_version"]; exists {
		version, valid := positiveSafeIntegerParam(pm, "expected_version")
		if !valid {
			return invalidParamResult()
		}
		options.ExpectedVersion = version
	}
	rows, err := d.attachmentUC.ListDocumentProductPreviews(ctx, source, ids, options)
	if err != nil {
		if errors.Is(err, biz.ErrOutsourcingOrderConflict) {
			return d.mapOutsourcingOrderError(ctx, err)
		}
		return d.mapBusinessAttachmentError(ctx, err)
	}
	items := make([]any, 0, len(rows))
	for _, row := range rows {
		preview := map[string]any{
			"document_id": row.DocumentID, "product_count": row.ProductCount,
			"product_id": row.ProductID, "product_name": row.ProductName, "product_code": row.ProductCode,
			"style_no": row.StyleNo, "customer_style_no": row.CustomerStyleNo,
		}
		if options.IncludeProducts {
			products := make([]any, 0, len(row.Products))
			for _, product := range row.Products {
				products = append(products, map[string]any{"product_id": product.ProductID, "product_name": product.ProductName, "product_code": product.ProductCode})
			}
			preview["products"] = products
		}
		items = append(items, preview)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"previews": items})}
}
