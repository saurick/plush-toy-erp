package service

import (
	"context"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) handleMasterDataContact(
	ctx context.Context,
	method, id string,
	pm map[string]any,
) (string, *v1.JsonrpcResult, error) {
	switch method {
	case "create_contact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireContactOwnerModuleEnabled(ctx, getString(pm, "customer_key"), getString(pm, "owner_type")); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateContact(ctx, contactMutationFromParams(pm))
		return id, contactMutationResult(ctx, d, item, err), nil
	case "update_contact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactUpdate); res != nil {
			return id, res, nil
		}
		if res := d.requireContactOwnerModuleEnabled(ctx, getString(pm, "customer_key"), getString(pm, "owner_type")); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateContact(ctx, getInt(pm, "id", 0), contactMutationFromParams(pm))
		return id, contactMutationResult(ctx, d, item, err), nil
	case "get_contact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetContact(ctx, getInt(pm, "id", 0))
		return id, contactMutationResult(ctx, d, item, err), nil
	case "list_contacts_by_owner":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListContactsByOwner(ctx, biz.ContactFilter{
			OwnerType:  getString(pm, "owner_type"),
			OwnerID:    getInt(pm, "owner_id", 0),
			ActiveOnly: getBool(pm, "active_only", false),
			Limit:      getInt(pm, "limit", 50),
			Offset:     getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"contacts": contactsToAny(items),
			"total":    total,
			"limit":    normalizedLimit(pm),
			"offset":   normalizedOffset(pm),
		})}, nil
	case "set_primary_contact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactSetPrimary); res != nil {
			return id, res, nil
		}
		if res := d.requireExistingContactOwnerModuleEnabled(ctx, getString(pm, "customer_key"), getInt(pm, "id", 0)); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetPrimaryContact(ctx, getInt(pm, "id", 0))
		return id, contactMutationResult(ctx, d, item, err), nil
	case "disable_contact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactDisable); res != nil {
			return id, res, nil
		}
		if res := d.requireExistingContactOwnerModuleEnabled(ctx, getString(pm, "customer_key"), getInt(pm, "id", 0)); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.DisableContact(ctx, getInt(pm, "id", 0))
		return id, contactMutationResult(ctx, d, item, err), nil
	default:
		return id, unknownMasterDataResult(method), nil
	}
}

func contactMutationFromParams(pm map[string]any) *biz.ContactMutation {
	return &biz.ContactMutation{
		OwnerType: getString(pm, "owner_type"),
		OwnerID:   getInt(pm, "owner_id", 0),
		Name:      getString(pm, "name"),
		Phone:     getWorkflowStringPtr(pm, "phone"),
		Mobile:    getWorkflowStringPtr(pm, "mobile"),
		Email:     getWorkflowStringPtr(pm, "email"),
		Title:     getWorkflowStringPtr(pm, "title"),
		IsPrimary: getBool(pm, "is_primary", false),
		Note:      getWorkflowStringPtr(pm, "note"),
	}
}

func contactSaveMutationsFromParams(pm map[string]any) ([]*biz.ContactSaveMutation, bool) {
	raw, ok := pm["contacts"]
	if !ok {
		return nil, false
	}
	rawItems, ok := raw.([]any)
	if !ok {
		return nil, false
	}
	contacts := make([]*biz.ContactSaveMutation, 0, len(rawItems))
	for _, rawItem := range rawItems {
		itemMap, ok := rawItem.(map[string]any)
		if !ok {
			return nil, false
		}
		contacts = append(contacts, &biz.ContactSaveMutation{
			ID:              getInt(itemMap, "id", 0),
			ContactMutation: *contactMutationFromParams(itemMap),
		})
	}
	return contacts, true
}

func (d *jsonrpcDispatcher) requireContactAggregatePermissions(ctx context.Context) *v1.JsonrpcResult {
	for _, permission := range []string{
		biz.PermissionContactCreate,
		biz.PermissionContactUpdate,
		biz.PermissionContactDisable,
	} {
		if res := d.RequireAdminPermission(ctx, permission); res != nil {
			return res
		}
	}
	return nil
}

func (d *jsonrpcDispatcher) requireContactOwnerModuleEnabled(ctx context.Context, customerKey string, ownerType string) *v1.JsonrpcResult {
	moduleKey := masterDataContactOwnerModuleKey(strings.ToUpper(strings.TrimSpace(ownerType)))
	if moduleKey == "" {
		return d.mapMasterDataError(ctx, biz.ErrBadParam)
	}
	return d.requireCustomerConfigModulesEnabled(ctx, customerKey, moduleKey)
}

func (d *jsonrpcDispatcher) requireExistingContactOwnerModuleEnabled(ctx context.Context, customerKey string, contactID int) *v1.JsonrpcResult {
	item, err := d.masterDataUC.GetContact(ctx, contactID)
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	if item == nil {
		return d.mapMasterDataError(ctx, biz.ErrContactNotFound)
	}
	return d.requireContactOwnerModuleEnabled(ctx, customerKey, item.OwnerType)
}

func contactMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Contact, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"contact": contactToMap(item)})}
}

func contactToMap(item *biz.Contact) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":         item.ID,
		"owner_type": item.OwnerType,
		"owner_id":   item.OwnerID,
		"name":       item.Name,
		"phone":      optionalStringValue(item.Phone),
		"mobile":     optionalStringValue(item.Mobile),
		"email":      optionalStringValue(item.Email),
		"title":      optionalStringValue(item.Title),
		"is_primary": item.IsPrimary,
		"is_active":  item.IsActive,
		"note":       optionalStringValue(item.Note),
		"created_at": item.CreatedAt.Unix(),
		"updated_at": item.UpdatedAt.Unix(),
	}
}

func contactsToAny(items []*biz.Contact) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, contactToMap(item))
	}
	return out
}
