package service

import (
	"context"
	"fmt"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleUser(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	l := d.log.WithContext(ctx)

	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}

	var opUID int
	var opUname string
	var opRole biz.Role
	if c, ok := biz.GetClaimsFromContext(ctx); ok && c != nil {
		opUID, opUname, opRole = c.UserID, c.Username, c.Role
	}

	l.Infof("[user] handle start method=%s id=%s operator_uid=%d operator_uname=%s operator_role=%d",
		method, id, opUID, opUname, opRole,
	)

	if _, res := d.requireAdmin(ctx); res != nil {
		l.Warnf("[user] requireAdmin denied method=%s id=%s operator_uid=%d code=%d msg=%s",
			method, id, opUID, res.Code, res.Message,
		)
		return id, res, nil
	}

	switch method {
	case "list":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserRead); res != nil {
			return id, res, nil
		}
		limit := getInt(pm, "limit", 30)
		offset := getInt(pm, "offset", 0)
		search := strings.TrimSpace(getString(pm, "search"))

		l.Infof("[user] list start id=%s operator_uid=%d limit=%d offset=%d search=%q",
			id, opUID, limit, offset, search,
		)

		list, total, err := d.userAdminUC.List(ctx, limit, offset, search)
		if err != nil {
			l.Errorf("[user] list failed id=%s operator_uid=%d limit=%d offset=%d search=%q err=%v",
				id, opUID, limit, offset, search, err,
			)
			return id, &v1.JsonrpcResult{Code: errcode.UserListFailed.Code, Message: errcode.UserListFailed.Message}, nil
		}

		arr := make([]any, 0, len(list))
		for _, u := range list {
			lastLogin := int64(0)
			if u.LastLoginAt != nil {
				lastLogin = u.LastLoginAt.Unix()
			}
			arr = append(arr, map[string]any{
				"id":            u.ID,
				"username":      u.Username,
				"disabled":      u.Disabled,
				"last_login_at": lastLogin,
				"created_at":    u.CreatedAt.Unix(),
			})
		}

		l.Infof("[user] list success id=%s operator_uid=%d count=%d total=%d search=%q",
			id, opUID, len(list), total, search,
		)

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "获取账号列表成功",
			Data: newDataStruct(map[string]any{
				"users":  arr,
				"total":  total,
				"limit":  limit,
				"offset": offset,
				"search": search,
			}),
		}, nil

	case "set_disabled":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserDisable); res != nil {
			return id, res, nil
		}
		userID := getInt(pm, "user_id", 0)
		if userID <= 0 {
			l.Warnf("[user] set_disabled bad param id=%s operator_uid=%d user_id=%d", id, opUID, userID)
			return id, &v1.JsonrpcResult{
				Code:    errcode.UserSetDisabledInvalid.Code,
				Message: errcode.UserSetDisabledInvalid.Message,
			}, nil
		}

		disabled := getBool(pm, "disabled", false)

		l.Infof("[user] set_disabled start id=%s operator_uid=%d target_uid=%d disabled=%v",
			id, opUID, userID, disabled,
		)

		if err := d.userAdminUC.SetDisabled(ctx, userID, disabled); err != nil {
			l.Errorf("[user] set_disabled failed id=%s operator_uid=%d target_uid=%d disabled=%v err=%v",
				id, opUID, userID, disabled, err,
			)
			return id, d.mapUserAdminError(ctx, err), nil
		}

		msg := "启用成功"
		if disabled {
			msg = "禁用成功"
		}

		l.Infof("[user] set_disabled success id=%s operator_uid=%d target_uid=%d disabled=%v",
			id, opUID, userID, disabled,
		)

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: msg,
			Data: newDataStruct(map[string]any{
				"success":  true,
				"user_id":  userID,
				"disabled": disabled,
			}),
		}, nil

	case "reset_password":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSystemUserUpdate); res != nil {
			return id, res, nil
		}
		userID := getInt(pm, "user_id", 0)
		password := getString(pm, "password")
		if userID <= 0 || len(password) < 6 {
			l.Warnf("[user] reset_password bad param id=%s operator_uid=%d user_id=%d", id, opUID, userID)
			return id, &v1.JsonrpcResult{
				Code:    errcode.UserInvalidParam.Code,
				Message: errcode.UserInvalidParam.Message,
			}, nil
		}

		l.Infof("[user] reset_password start id=%s operator_uid=%d target_uid=%d", id, opUID, userID)

		if err := d.userAdminUC.ResetPassword(ctx, userID, password); err != nil {
			l.Errorf("[user] reset_password failed id=%s operator_uid=%d target_uid=%d err=%v",
				id, opUID, userID, err,
			)
			return id, d.mapUserAdminError(ctx, err), nil
		}

		l.Infof("[user] reset_password success id=%s operator_uid=%d target_uid=%d", id, opUID, userID)

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "密码已重置",
			Data: newDataStruct(map[string]any{
				"success": true,
				"user_id": userID,
			}),
		}, nil

	default:
		l.Warnf("[user] unknown method=%s id=%s operator_uid=%d", method, id, opUID)
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知用户接口 method=%s", method),
		}, nil
	}
}

func (d *jsonrpcDispatcher) mapUserAdminError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)

	switch err {
	case biz.ErrUserNotFound:
		return &v1.JsonrpcResult{Code: errcode.AuthUserNotFound.Code, Message: errcode.AuthUserNotFound.Message}
	case biz.ErrBadParam:
		return &v1.JsonrpcResult{Code: errcode.UserInvalidParam.Code, Message: errcode.UserInvalidParam.Message}
	case biz.ErrForbidden:
		return &v1.JsonrpcResult{Code: errcode.AdminRequired.Code, Message: errcode.AdminRequired.Message}
	case biz.ErrNoPermission:
		return &v1.JsonrpcResult{Code: errcode.PermissionDenied.Code, Message: errcode.PermissionDenied.Message}
	default:
		l.Errorf("[user] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}
