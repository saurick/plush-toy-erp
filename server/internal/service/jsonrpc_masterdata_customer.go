package service

import (
	"context"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleMasterDataCustomer(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "save_customer_with_contacts", "saveCustomerWithContacts":
		ownerID := getInt(pm, "id", 0)
		if ownerID > 0 {
			if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerUpdate); res != nil {
				return id, res, nil
			}
		} else if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireContactAggregatePermissions(ctx); res != nil {
			return id, res, nil
		}
		contacts, ok := contactSaveMutationsFromParams(pm)
		if !ok {
			return id, d.mapMasterDataError(ctx, biz.ErrBadParam), nil
		}
		item, err := d.masterDataUC.SaveCustomerWithContacts(ctx, ownerID, customerMutationFromParams(pm), contacts)
		return id, customerWithContactsMutationResult(ctx, d, item, err), nil
	case "create_customer", "createCustomer":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerCreate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateCustomer(ctx, customerMutationFromParams(pm))
		return id, customerMutationResult(ctx, d, item, err), nil
	case "update_customer", "updateCustomer":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateCustomer(ctx, getInt(pm, "id", 0), customerMutationFromParams(pm))
		return id, customerMutationResult(ctx, d, item, err), nil
	case "get_customer", "getCustomer":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetCustomer(ctx, getInt(pm, "id", 0))
		return id, customerMutationResult(ctx, d, item, err), nil
	case "list_customers", "listCustomers":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListCustomers(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"customers": customersToAny(items),
			"total":     total,
			"limit":     normalizedLimit(pm),
			"offset":    normalizedOffset(pm),
		})}, nil
	case "set_customer_active", "setCustomerActive":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerDisable); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetCustomerActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, customerMutationResult(ctx, d, item, err), nil
	default:
		return id, unknownMasterDataResult(method), nil
	}
}

func customerMutationFromParams(pm map[string]any) *biz.CustomerMutation {
	return &biz.CustomerMutation{
		Code:                   getString(pm, "code"),
		Name:                   getString(pm, "name"),
		ShortName:              getWorkflowStringPtr(pm, "short_name"),
		DefaultPaymentMethod:   getWorkflowStringPtr(pm, "default_payment_method"),
		DefaultPaymentTermDays: getOptionalNonNegativeInt(pm, "default_payment_term_days"),
		TaxNo:                  getWorkflowStringPtr(pm, "tax_no"),
		Note:                   getWorkflowStringPtr(pm, "note"),
	}
}

func customerMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Customer, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"customer": customerToMap(item)})}
}

func customerWithContactsMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.CustomerWithContacts, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
		"customer": customerToMap(item.Customer),
		"contacts": contactsToAny(item.Contacts),
	})}
}

func customerToMap(item *biz.Customer) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                        item.ID,
		"code":                      item.Code,
		"name":                      item.Name,
		"short_name":                optionalStringValue(item.ShortName),
		"default_payment_method":    optionalStringValue(item.DefaultPaymentMethod),
		"default_payment_term_days": optionalIntValue(item.DefaultPaymentTermDays),
		"tax_no":                    optionalStringValue(item.TaxNo),
		"is_active":                 item.IsActive,
		"note":                      optionalStringValue(item.Note),
		"created_at":                item.CreatedAt.Unix(),
		"updated_at":                item.UpdatedAt.Unix(),
	}
}

func customersToAny(items []*biz.Customer) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, customerToMap(item))
	}
	return out
}
