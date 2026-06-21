package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleAdmin(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	l := d.log.WithContext(ctx)

	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}

	if _, res := d.requireAdmin(ctx); res != nil {
		l.Warnf("[admin] requireAdmin denied method=%s id=%s code=%d msg=%s", method, id, res.Code, res.Message)
		return id, res, nil
	}

	switch method {
	case "me":
		admin, err := d.adminManageUC.GetCurrent(ctx)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(adminProfileToMap(admin, nil)),
		}, nil

	case "list":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserRead); res != nil {
			return id, res, nil
		}
		admins, err := d.adminManageUC.List(ctx)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		arr := make([]any, 0, len(admins))
		for _, admin := range admins {
			arr = append(arr, adminListItemToMap(admin))
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"admins": arr}),
		}, nil

	case "create":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserCreate); res != nil {
			return id, res, nil
		}
		username := getString(pm, "username")
		phone := getString(pm, "phone")
		password := getString(pm, "password")
		roleKeys := getStringSlice(pm, "role_keys")
		if len(biz.NormalizeAdminRoleKeys(roleKeys)) > 0 {
			if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserUpdate); res != nil {
				return id, res, nil
			}
		}

		admin, err := d.adminManageUC.Create(ctx, username, phone, password, roleKeys)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"admin": adminListItemToMap(admin),
			}),
		}, nil

	case "rbac_options", "menu_options":
		if res := d.RequireAdminAnyPermission(ctx, biz.PermissionSystemRoleRead, biz.PermissionSystemPermissionRead); res != nil {
			return id, res, nil
		}
		roles, err := d.adminManageUC.ListRoles(ctx)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		permissions, err := d.adminManageUC.ListPermissions(ctx)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"roles":              roleOptionsToAny(roles),
				"permissions":        permissionOptionsToAny(permissions),
				"menus":              menuOptionsToAny(biz.BuiltinAdminMenus()),
				"role_options":       roleOptionsToAny(roles),
				"permission_options": permissionOptionsToAny(permissions),
				"menu_options":       menuOptionsToAny(biz.BuiltinAdminMenus()),
			}),
		}, nil

	case "set_roles":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserUpdate); res != nil {
			return id, res, nil
		}
		adminID := getInt(pm, "id", 0)
		roleKeys := getStringSlice(pm, "role_keys")
		admin, err := d.adminManageUC.SetRoles(ctx, adminID, roleKeys)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"admin": adminListItemToMap(admin),
			}),
		}, nil

	case "set_role_permissions":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemPermissionManage); res != nil {
			return id, res, nil
		}
		role, err := d.adminManageUC.SetRolePermissions(ctx, getString(pm, "role_key"), getStringSlice(pm, "permission_keys"))
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"role": map[string]any{
					"id":          role.ID,
					"role_key":    role.Key,
					"name":        role.Name,
					"description": role.Description,
					"builtin":     role.Builtin,
					"disabled":    role.Disabled,
					"sort_order":  role.SortOrder,
				},
			}),
		}, nil

	case "set_phone":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserUpdate); res != nil {
			return id, res, nil
		}
		adminID := getInt(pm, "id", 0)
		admin, err := d.adminManageUC.SetPhone(ctx, adminID, getString(pm, "phone"))
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"admin": adminListItemToMap(admin),
			}),
		}, nil

	case "set_erp_column_order":
		moduleKey := getString(pm, "module_key")
		order := getStringSlice(pm, "order")
		admin, err := d.adminManageUC.SetCurrentERPColumnOrder(ctx, moduleKey, order)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"erp_preferences": map[string]any{
					"column_orders": toAnyMapStringSlice(admin.ERPPreferences.ColumnOrders),
				},
			}),
		}, nil

	case "audit_logs":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemAuditRead); res != nil {
			return id, res, nil
		}
		createdFrom, ok := getOptionalJSONRPCTime(pm, "created_from")
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		createdTo, ok := getOptionalJSONRPCTime(pm, "created_to")
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		var createdFromValue time.Time
		if createdFrom != nil {
			createdFromValue = *createdFrom
		}
		var createdToValue time.Time
		if createdTo != nil {
			createdToValue = *createdTo
		}
		result, err := d.adminManageUC.ListRuntimeAuditEvents(ctx, biz.RuntimeAuditEventListFilter{
			Source:      getString(pm, "source"),
			EventType:   getString(pm, "event_type"),
			EventKey:    getString(pm, "event_key"),
			ActorKey:    getString(pm, "actor_key"),
			TargetType:  getString(pm, "target_type"),
			TargetKey:   getString(pm, "target_key"),
			Keyword:     getString(pm, "keyword"),
			CreatedFrom: createdFromValue,
			CreatedTo:   createdToValue,
			Limit:       getInt(pm, "limit", 50),
			Offset:      getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"events": runtimeAuditEventsToAny(result.Events),
				"total":  result.Total,
				"limit":  result.Limit,
				"offset": result.Offset,
			}),
		}, nil

	case "set_disabled":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserDisable); res != nil {
			return id, res, nil
		}
		adminID := getInt(pm, "id", 0)
		disabled, ok := pm["disabled"].(bool)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		admin, err := d.adminManageUC.SetDisabled(ctx, adminID, disabled)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"admin": adminListItemToMap(admin),
			}),
		}, nil

	case "reset_password":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserUpdate); res != nil {
			return id, res, nil
		}
		adminID := getInt(pm, "id", 0)
		password := getString(pm, "password")
		if adminID <= 0 || len(password) < 6 {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		admin, err := d.adminManageUC.ResetPassword(ctx, adminID, password)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "密码已重置",
			Data: newDataStruct(map[string]any{
				"admin": adminListItemToMap(admin),
			}),
		}, nil

	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知管理员接口 method=%s", method),
		}, nil
	}
}

func (d *jsonrpcDispatcher) mapAdminManageError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)

	switch {
	case errors.Is(err, biz.ErrForbidden), errors.Is(err, biz.ErrNoPermission):
		l.Warnf("[admin] permission denied err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[admin] invalid param err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	case errors.Is(err, biz.ErrInvalidPhoneNumber):
		l.Warnf("[admin] invalid phone err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.AuthInvalidPhone.Code, Message: errcode.AuthInvalidPhone.Message}
	case errors.Is(err, biz.ErrAdminNotFound):
		l.Warnf("[admin] not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.AdminNotFound.Code, Message: errcode.AdminNotFound.Message}
	case errors.Is(err, biz.ErrRoleNotFound):
		l.Warnf("[admin] role not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "角色不存在"}
	case errors.Is(err, biz.ErrRoleExists):
		l.Warnf("[admin] role exists err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "角色已存在"}
	case errors.Is(err, biz.ErrAdminExists):
		l.Warnf("[admin] exists err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.AdminExists.Code, Message: errcode.AdminExists.Message}
	case errors.Is(err, biz.ErrAdminPhoneExists):
		l.Warnf("[admin] phone exists err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.AdminPhoneExists.Code, Message: errcode.AdminPhoneExists.Message}
	case errors.Is(err, biz.ErrUserDisabled):
		l.Warnf("[admin] disabled err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.AdminDisabled.Code, Message: errcode.AdminDisabled.Message}
	default:
		l.Errorf("[admin] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}
