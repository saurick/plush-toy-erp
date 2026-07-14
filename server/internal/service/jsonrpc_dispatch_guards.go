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
	case biz.AuthUnavailable:
		return nil, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
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
		default:
			d.log.WithContext(ctx).Errorf("[auth] requireAdmin verify current admin failed err=%v", err)
			return nil, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
		}
	}
	if !admin.IsActive() {
		return nil, &v1.JsonrpcResult{Code: errcode.AdminDisabled.Code, Message: errcode.AdminDisabled.Message}
	}

	return c, nil
}

func (d *jsonrpcDispatcher) getCurrentAdmin(ctx context.Context, claims *biz.AuthClaims) (*biz.AdminUser, error) {
	if claims == nil {
		return nil, errors.New("missing auth claims")
	}
	if admin, ok := biz.GetCurrentAdminFromContext(ctx); ok {
		if admin.ID != claims.UserID {
			return nil, errors.New("verified admin does not match auth claims")
		}
		return admin, nil
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
