package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleMasterDataSupplier(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "save_supplier_with_contacts", "saveSupplierWithContacts":
		ownerID := getInt(pm, "id", 0)
		if ownerID > 0 {
			if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierUpdate); res != nil {
				return id, res, nil
			}
		} else if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireContactAggregatePermissions(ctx); res != nil {
			return id, res, nil
		}
		contacts, ok := contactSaveMutationsFromParams(pm)
		if !ok {
			return id, d.mapMasterDataError(ctx, biz.ErrBadParam), nil
		}
		item, err := d.masterDataUC.SaveSupplierWithContacts(ctx, ownerID, supplierMutationFromParams(pm), contacts)
		return id, supplierWithContactsMutationResult(ctx, d, item, err), nil
	case "create_supplier", "createSupplier":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierCreate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateSupplier(ctx, supplierMutationFromParams(pm))
		return id, supplierMutationResult(ctx, d, item, err), nil
	case "update_supplier", "updateSupplier":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateSupplier(ctx, getInt(pm, "id", 0), supplierMutationFromParams(pm))
		return id, supplierMutationResult(ctx, d, item, err), nil
	case "get_supplier", "getSupplier":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetSupplier(ctx, getInt(pm, "id", 0))
		return id, supplierMutationResult(ctx, d, item, err), nil
	case "list_suppliers", "listSuppliers":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListSuppliers(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"suppliers": suppliersToAny(items),
			"total":     total,
			"limit":     normalizedLimit(pm),
			"offset":    normalizedOffset(pm),
		})}, nil
	case "set_supplier_active", "setSupplierActive":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierDisable); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetSupplierActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, supplierMutationResult(ctx, d, item, err), nil
	default:
		return id, unknownMasterDataResult(method), nil
	}
}

func supplierMutationFromParams(pm map[string]any) *biz.SupplierMutation {
	return &biz.SupplierMutation{
		Code:         getString(pm, "code"),
		Name:         getString(pm, "name"),
		ShortName:    getWorkflowStringPtr(pm, "short_name"),
		SupplierType: getWorkflowStringPtr(pm, "supplier_type"),
		TaxNo:        getWorkflowStringPtr(pm, "tax_no"),
		Note:         getWorkflowStringPtr(pm, "note"),
	}
}

func supplierMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Supplier, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"supplier": supplierToMap(item)})}
}

func supplierWithContactsMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.SupplierWithContacts, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
		"supplier": supplierToMap(item.Supplier),
		"contacts": contactsToAny(item.Contacts),
	})}
}

func supplierToMap(item *biz.Supplier) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":            item.ID,
		"code":          item.Code,
		"name":          item.Name,
		"short_name":    optionalStringValue(item.ShortName),
		"supplier_type": optionalStringValue(item.SupplierType),
		"tax_no":        optionalStringValue(item.TaxNo),
		"is_active":     item.IsActive,
		"note":          optionalStringValue(item.Note),
		"created_at":    item.CreatedAt.Unix(),
		"updated_at":    item.UpdatedAt.Unix(),
	}
}

func suppliersToAny(items []*biz.Supplier) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, supplierToMap(item))
	}
	return out
}
