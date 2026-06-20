package service

import (
	"context"
	"database/sql"
	"errors"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"
)

func (d *jsonrpcDispatcher) requireLogin(ctx context.Context) (*biz.AuthClaims, *v1.JsonrpcResult) {
	if c, ok := biz.GetClaimsFromContext(ctx); ok && c != nil {
		return c, nil
	}

	switch biz.AuthStateFrom(ctx) {
	case biz.AuthExpired:
		return nil, &v1.JsonrpcResult{Code: errcode.AuthExpired.Code, Message: errcode.AuthExpired.Message}
	case biz.AuthInvalid:
		return nil, &v1.JsonrpcResult{Code: errcode.AuthInvalid.Code, Message: errcode.AuthInvalid.Message}
	default:
		return nil, &v1.JsonrpcResult{Code: errcode.AuthRequired.Code, Message: errcode.AuthRequired.Message}
	}
}

func (d *jsonrpcDispatcher) requireAdmin(ctx context.Context) (*biz.AuthClaims, *v1.JsonrpcResult) {
	c, res := d.requireLogin(ctx)
	if res != nil {
		return nil, res
	}
	if c.Role != biz.RoleAdmin {
		return nil, &v1.JsonrpcResult{Code: errcode.AdminRequired.Code, Message: errcode.AdminRequired.Message}
	}

	admin, err := d.getCurrentAdmin(ctx, c)
	if err != nil {
		switch {
		case errors.Is(err, sql.ErrNoRows):
			return nil, &v1.JsonrpcResult{Code: errcode.AdminRequired.Code, Message: errcode.AdminRequired.Message}
		case errors.Is(err, errAdminUsernameMismatch):
			return nil, &v1.JsonrpcResult{Code: errcode.AdminRequired.Code, Message: errcode.AdminRequired.Message}
		default:
			d.log.WithContext(ctx).Errorf("[auth] requireAdmin verify current admin failed err=%v", err)
			return nil, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
		}
	}
	if admin.Disabled {
		return nil, &v1.JsonrpcResult{Code: errcode.AdminDisabled.Code, Message: errcode.AdminDisabled.Message}
	}

	return c, nil
}

var errAdminUsernameMismatch = errors.New("admin username mismatch")

func (d *jsonrpcDispatcher) getCurrentAdmin(ctx context.Context, claims *biz.AuthClaims) (*biz.AdminUser, error) {
	if claims == nil {
		return nil, errors.New("missing auth claims")
	}
	if d.adminReader == nil {
		return nil, errors.New("admin reader is nil")
	}

	admin, err := d.adminReader.GetAdminByID(ctx, claims.UserID)
	if err != nil {
		return nil, err
	}
	if admin == nil {
		return nil, sql.ErrNoRows
	}
	// 安全兜底：管理员 token 的 uid/uname 必须同时匹配，避免旧 token 在账号重建后误复用。
	if admin.Username != claims.Username {
		return nil, errAdminUsernameMismatch
	}
	return admin, nil
}

func (d *jsonrpcDispatcher) authCapabilitiesToMap() map[string]any {
	return authSMSCapabilitiesToMap(d.authSMS)
}

func (d *jsonrpcDispatcher) isPublic(url, method string) bool {
	if url == "system" && (method == "ping" || method == "version") {
		return true
	}
	if url == "auth" && (method == "capabilities" || method == "admin_login" || method == "send_sms_code" || method == "sms_login" || method == "logout") {
		return true
	}
	return false
}
