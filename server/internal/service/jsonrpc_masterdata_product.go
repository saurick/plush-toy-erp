package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleMasterDataProduct(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_product":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), masterDataModuleKeyProducts); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateProduct(ctx, productMutationFromParams(pm))
		return id, productMutationResult(ctx, d, item, err), nil
	case "update_product":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), masterDataModuleKeyProducts); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateProduct(ctx, getInt(pm, "id", 0), productMutationFromParams(pm))
		return id, productMutationResult(ctx, d, item, err), nil
	case "get_product":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetProduct(ctx, getInt(pm, "id", 0))
		return id, productMutationResult(ctx, d, item, err), nil
	case "list_products":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListProducts(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"products": productsToAny(items),
			"total":    total,
			"limit":    normalizedLimit(pm),
			"offset":   normalizedOffset(pm),
		})}, nil
	case "set_product_active":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductDisable); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), masterDataModuleKeyProducts); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetProductActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, productMutationResult(ctx, d, item, err), nil
	case "create_product_sku":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductSKUCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), masterDataModuleKeyProducts); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateProductSKU(ctx, productSKUMutationFromParams(pm))
		return id, productSKUMutationResult(ctx, d, item, err), nil
	case "update_product_sku":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductSKUUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), masterDataModuleKeyProducts); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateProductSKU(ctx, getInt(pm, "id", 0), productSKUMutationFromParams(pm))
		return id, productSKUMutationResult(ctx, d, item, err), nil
	case "get_product_sku":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductSKURead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetProductSKU(ctx, getInt(pm, "id", 0))
		return id, productSKUMutationResult(ctx, d, item, err), nil
	case "list_product_skus":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductSKURead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListProductSKUs(ctx, productSKUFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"product_skus": productSKUsToAny(items),
			"total":        total,
			"limit":        normalizedLimit(pm),
			"offset":       normalizedOffset(pm),
		})}, nil
	case "set_product_sku_active":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductSKUDisable); res != nil {
			return id, res, nil
		}
		if res := d.requireCustomerConfigModulesEnabled(ctx, getString(pm, "customer_key"), masterDataModuleKeyProducts); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetProductSKUActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, productSKUMutationResult(ctx, d, item, err), nil
	default:
		return id, unknownMasterDataResult(method), nil
	}
}

func productMutationFromParams(pm map[string]any) *biz.ProductMutation {
	return &biz.ProductMutation{
		Code:            getString(pm, "code"),
		Name:            getString(pm, "name"),
		StyleNo:         getWorkflowStringPtr(pm, "style_no"),
		CustomerStyleNo: getWorkflowStringPtr(pm, "customer_style_no"),
		DefaultUnitID:   getInt(pm, "default_unit_id", 0),
	}
}

func productSKUMutationFromParams(pm map[string]any) *biz.ProductSKUMutation {
	return &biz.ProductSKUMutation{
		ProductID:        getInt(pm, "product_id", 0),
		SKUCode:          getString(pm, "sku_code"),
		SKUName:          getWorkflowStringPtr(pm, "sku_name"),
		Barcode:          getWorkflowStringPtr(pm, "barcode"),
		CustomerSKU:      getWorkflowStringPtr(pm, "customer_sku"),
		Color:            getWorkflowStringPtr(pm, "color"),
		ColorNo:          getWorkflowStringPtr(pm, "color_no"),
		Size:             getWorkflowStringPtr(pm, "size"),
		PackagingVersion: getWorkflowStringPtr(pm, "packaging_version"),
		DefaultUnitID:    getOptionalPositiveIntPtr(pm, "default_unit_id"),
	}
}

func productSKUFilterFromParams(pm map[string]any) biz.ProductSKUFilter {
	return biz.ProductSKUFilter{
		ProductID:  getInt(pm, "product_id", 0),
		Keyword:    getString(pm, "keyword"),
		ActiveOnly: getBool(pm, "active_only", false),
		Limit:      getInt(pm, "limit", 50),
		Offset:     getInt(pm, "offset", 0),
	}
}

func productMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Product, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"product": productToMap(item)})}
}

func productSKUMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.ProductSKU, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"product_sku": productSKUToMap(item)})}
}

func productToMap(item *biz.Product) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                item.ID,
		"code":              item.Code,
		"name":              item.Name,
		"style_no":          optionalStringValue(item.StyleNo),
		"customer_style_no": optionalStringValue(item.CustomerStyleNo),
		"default_unit_id":   item.DefaultUnitID,
		"is_active":         item.IsActive,
		"created_at":        item.CreatedAt.Unix(),
		"updated_at":        item.UpdatedAt.Unix(),
	}
}

func productsToAny(items []*biz.Product) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, productToMap(item))
	}
	return out
}

func productSKUToMap(item *biz.ProductSKU) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                item.ID,
		"product_id":        item.ProductID,
		"sku_code":          item.SKUCode,
		"sku_name":          optionalStringValue(item.SKUName),
		"barcode":           optionalStringValue(item.Barcode),
		"customer_sku":      optionalStringValue(item.CustomerSKU),
		"color":             optionalStringValue(item.Color),
		"color_no":          optionalStringValue(item.ColorNo),
		"size":              optionalStringValue(item.Size),
		"packaging_version": optionalStringValue(item.PackagingVersion),
		"default_unit_id":   optionalIntValue(item.DefaultUnitID),
		"is_active":         item.IsActive,
		"created_at":        item.CreatedAt.Unix(),
		"updated_at":        item.UpdatedAt.Unix(),
	}
}

func productSKUsToAny(items []*biz.ProductSKU) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, productSKUToMap(item))
	}
	return out
}
