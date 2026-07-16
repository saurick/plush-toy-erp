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
		if res := rejectUnknownAdminParams(pm); res != nil {
			return id, res, nil
		}
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
		if res := rejectUnknownAdminParams(pm); res != nil {
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
		if res := rejectUnknownAdminParams(pm, "username", "phone", "password", "role_keys"); res != nil {
			return id, res, nil
		}
		username := getString(pm, "username")
		phone := getString(pm, "phone")
		password := getString(pm, "password")
		if biz.ValidateAdminPassword(password) != nil {
			return id, invalidAdminPasswordResult(), nil
		}
		roleKeys, ok := getStrictStringSlice(pm, "role_keys", false)
		if !ok {
			return id, invalidAdminParamResult(), nil
		}
		if len(biz.NormalizeAdminRoleKeys(roleKeys)) > 0 {
			if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserRoleAssign); res != nil {
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
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemRoleRead); res != nil {
			return id, res, nil
		}
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemPermissionRead); res != nil {
			return id, res, nil
		}
		if res := rejectUnknownAdminParams(pm); res != nil {
			return id, res, nil
		}
		roles, roleAccess, err := d.adminManageUC.ListRolesWithAccess(ctx)
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
				"roles":              roleOptionsToAny(roles, roleAccess),
				"permissions":        permissionOptionsToAny(permissions),
				"menus":              menuOptionsToAny(biz.BuiltinAdminMenus()),
				"role_options":       roleOptionsToAny(roles, roleAccess),
				"permission_options": permissionOptionsToAny(permissions),
				"menu_options":       menuOptionsToAny(biz.BuiltinAdminMenus()),
			}),
		}, nil

	case "set_roles":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserRoleAssign); res != nil {
			return id, res, nil
		}
		if res := rejectUnknownAdminParams(pm, "id", "role_keys"); res != nil {
			return id, res, nil
		}
		adminID := getInt(pm, "id", 0)
		roleKeys, ok := getStrictStringSlice(pm, "role_keys", true)
		if !ok {
			return id, invalidAdminParamResult(), nil
		}
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
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemRolePermissionManage); res != nil {
			return id, res, nil
		}
		if res := rejectUnknownAdminParams(pm, "role_key", "permission_keys", "expected_version"); res != nil {
			return id, res, nil
		}
		permissionKeys, ok := getStrictStringSlice(pm, "permission_keys", true)
		if !ok {
			return id, invalidAdminParamResult(), nil
		}
		expectedVersion, ok := getRequiredJSONRPCPositiveInt(pm, "expected_version")
		if !ok {
			return id, invalidAdminParamResult(), nil
		}
		role, err := d.adminManageUC.SetRolePermissions(ctx, getString(pm, "role_key"), permissionKeys, expectedVersion)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"role": adminRoleToMap(*role, true),
			}),
		}, nil

	case "set_phone":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserUpdate); res != nil {
			return id, res, nil
		}
		if res := rejectUnknownAdminParams(pm, "id", "phone"); res != nil {
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
		if res := rejectUnknownAdminParams(pm, "module_key", "order"); res != nil {
			return id, res, nil
		}
		moduleKey := getString(pm, "module_key")
		order, ok := getStrictStringSlice(pm, "order", true)
		if !ok {
			return id, invalidAdminParamResult(), nil
		}
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
		if res := rejectUnknownAdminParams(pm, "source", "event_type", "event_key", "actor_key", "target_type", "target_key", "keyword", "created_from", "created_to", "limit", "offset"); res != nil {
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
		if res := rejectUnknownAdminParams(pm, "id", "disabled", "reason"); res != nil {
			return id, res, nil
		}
		adminID := getInt(pm, "id", 0)
		disabled, ok := pm["disabled"].(bool)
		if !ok {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		admin, err := d.adminManageUC.SetDisabled(ctx, adminID, disabled, getString(pm, "reason"))
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

	case "revoke":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserRevoke); res != nil {
			return id, res, nil
		}
		if res := rejectUnknownAdminParams(pm, "id", "reason"); res != nil {
			return id, res, nil
		}
		admin, releasedTaskCount, err := d.adminManageUC.Revoke(ctx, getInt(pm, "id", 0), getString(pm, "reason"))
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code: errcode.OK.Code, Message: "账号已注销",
			Data: newDataStruct(map[string]any{
				"admin":               adminListItemToMap(admin),
				"released_task_count": releasedTaskCount,
			}),
		}, nil

	case "reset_password":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserUpdate); res != nil {
			return id, res, nil
		}
		if res := rejectUnknownAdminParams(pm, "id", "password"); res != nil {
			return id, res, nil
		}
		adminID := getInt(pm, "id", 0)
		password := getString(pm, "password")
		if adminID <= 0 {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}, nil
		}
		if biz.ValidateAdminPassword(password) != nil {
			return id, invalidAdminPasswordResult(), nil
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

func invalidAdminPasswordResult() *v1.JsonrpcResult {
	return &v1.JsonrpcResult{
		Code: errcode.InvalidParam.Code,
		Message: fmt.Sprintf(
			"密码应为 %d 到 %d 位",
			biz.AdminPasswordMinLength,
			biz.AdminPasswordMaxLength,
		),
	}
}

func invalidAdminParamResult() *v1.JsonrpcResult {
	return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
}

func rejectUnknownAdminParams(pm map[string]any, allowedKeys ...string) *v1.JsonrpcResult {
	allowed := make(map[string]struct{}, len(allowedKeys))
	for _, key := range allowedKeys {
		allowed[key] = struct{}{}
	}
	for key := range pm {
		if _, ok := allowed[key]; !ok {
			return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
		}
	}
	return nil
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
	case errors.Is(err, biz.ErrPermissionNotFound):
		l.Warnf("[admin] permission not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "权限不存在"}
	case errors.Is(err, biz.ErrAdminSelfRoleChangeForbidden):
		l.Warnf("[admin] self role change denied err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: "不能修改当前登录账号的角色"}
	case errors.Is(err, biz.ErrAdminSelfRolePermissionForbidden):
		l.Warnf("[admin] own role permission change denied err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: "不能修改当前登录账号正在使用的角色权限"}
	case errors.Is(err, biz.ErrPrivilegedRoleAssignmentForbidden):
		l.Warnf("[admin] privileged role assignment denied err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: "该角色受系统保护，当前账号不能分配"}
	case errors.Is(err, biz.ErrPrivilegedAdminTargetForbidden):
		l.Warnf("[admin] privileged admin target denied err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: "该系统账号受保护，只有超级管理员可以维护"}
	case errors.Is(err, biz.ErrSystemRoleImmutable):
		l.Warnf("[admin] system role mutation denied err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: "产品系统角色只能查看，不能修改权限"}
	case errors.Is(err, biz.ErrPermissionNotDelegable):
		l.Warnf("[admin] permission not delegable err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "该权限不能分配给业务角色"}
	case errors.Is(err, biz.ErrDebugRoleProductionForbidden):
		l.Warnf("[admin] debug role rejected by environment err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "当前环境不能分配调试角色"}
	case errors.Is(err, biz.ErrRoleVersionConflict):
		l.Warnf("[admin] role version conflict err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.ResourceVersionConflict.Code, Message: "角色权限刚刚发生变化，请刷新后重试"}
	case errors.Is(err, biz.ErrRoleExists):
		l.Warnf("[admin] role exists err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "角色已存在"}
	case errors.Is(err, biz.ErrAdminExists):
		l.Warnf("[admin] exists err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.AdminExists.Code, Message: errcode.AdminExists.Message}
	case errors.Is(err, biz.ErrAdminPhoneExists):
		l.Warnf("[admin] phone exists err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.AdminPhoneExists.Code, Message: errcode.AdminPhoneExists.Message}
	case errors.Is(err, biz.ErrAdminRevoked):
		return &v1.JsonrpcResult{Code: errcode.AdminAccountRevoked.Code, Message: errcode.AdminAccountRevoked.Message}
	case errors.Is(err, biz.ErrWorkflowTaskConflict):
		return &v1.JsonrpcResult{Code: errcode.ResourceVersionConflict.Code, Message: "待办状态刚刚发生变化，请刷新后重试注销"}
	case errors.Is(err, biz.ErrUserDisabled):
		l.Warnf("[admin] disabled err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.AdminDisabled.Code, Message: errcode.AdminDisabled.Message}
	default:
		l.Errorf("[admin] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}
