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

func (d *jsonrpcDispatcher) handleAuth(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	d.log.WithContext(ctx).Infof("[auth] method=%s id=%s", method, id)

	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}

	switch method {
	case "capabilities":
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(d.authCapabilitiesToMap()),
		}, nil

	case "send_sms_code":
		if !d.authSMS.Enabled {
			return id, &v1.JsonrpcResult{
				Code:    errcode.AuthSMSLoginDisabled.Code,
				Message: errcode.AuthSMSLoginDisabled.Message,
				Data:    newDataStruct(authSMSCapabilitiesToMap(d.authSMS)),
			}, nil
		}
		phone := getString(pm, "phone")
		mobileRoleKey := getString(pm, "mobile_role_key")
		scope, scopeErr := getAuthLoginScope(pm)
		if scopeErr != nil {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "登录类型不合法"}, nil
		}
		if scope != "admin" {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "普通用户短信登录已停用"}, nil
		}
		if phone == "" {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "缺少手机号"}, nil
		}

		challenge, err := d.adminAuthUC.RequestSMSLoginCode(ctx, phone, mobileRoleKey)
		if err != nil {
			return id, d.mapAdminLoginError(ctx, err), nil
		}
		mockCode := ""
		if d.authSMS.MockDelivery {
			mockCode = challenge.MockCode
		}

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "验证码已发送",
			Data: newDataStruct(map[string]any{
				"phone":         challenge.Phone,
				"expires_at":    challenge.ExpiresAt.Unix(),
				"resend_after":  challenge.ResendAfter.Unix(),
				"mock_delivery": d.authSMS.MockDelivery,
				"mock_code":     mockCode,
			}),
		}, nil

	case "sms_login":
		if !d.authSMS.Enabled {
			return id, &v1.JsonrpcResult{
				Code:    errcode.AuthSMSLoginDisabled.Code,
				Message: errcode.AuthSMSLoginDisabled.Message,
				Data:    newDataStruct(authSMSCapabilitiesToMap(d.authSMS)),
			}, nil
		}
		phone := getString(pm, "phone")
		code := getString(pm, "code")
		mobileRoleKey := getString(pm, "mobile_role_key")
		scope, scopeErr := getAuthLoginScope(pm)
		if scopeErr != nil {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "登录类型不合法"}, nil
		}
		if scope != "admin" {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "普通用户短信登录已停用"}, nil
		}
		if phone == "" || code == "" {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "缺少手机号或验证码"}, nil
		}

		token, expireAt, admin, err := d.adminAuthUC.LoginWithSMSCode(ctx, phone, code, mobileRoleKey)
		if err != nil {
			return id, d.mapAdminLoginError(ctx, err), nil
		}

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "登录成功",
			Data: newDataStruct(adminProfileToMap(admin, map[string]any{
				"access_token": token,
				"expires_at":   expireAt.Unix(),
				"token_type":   "Bearer",
				"issued_at":    time.Now().Unix(),
			})),
		}, nil

	case "admin_login":
		username := getString(pm, "username")
		password := getString(pm, "password")

		if username == "" || password == "" {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "缺少用户名或密码"}, nil
		}

		token, expireAt, admin, err := d.adminAuthUC.Login(ctx, username, password)
		if err != nil {
			return id, d.mapAdminPasswordLoginError(ctx, err), nil
		}

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "登录成功",
			Data: newDataStruct(adminProfileToMap(admin, map[string]any{
				"access_token": token,
				"expires_at":   expireAt.Unix(),
				"token_type":   "Bearer",
				"issued_at":    time.Now().Unix(),
			})),
		}, nil

	case "logout":
		claims, _ := biz.GetClaimsFromContext(ctx)
		if claims != nil {
			if err := d.adminAuthUC.Logout(ctx, claims.SessionKey); err != nil {
				d.log.WithContext(ctx).Errorf("[auth] revoke session failed uid=%d err=%v", claims.UserID, err)
				return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
			}
			d.log.WithContext(ctx).Infof("[auth] user logout uid=%d id=%s", claims.UserID, id)
		} else if biz.AuthStateFrom(ctx) == biz.AuthUnavailable {
			d.log.WithContext(ctx).Errorf("[auth] logout rejected because authentication backend is unavailable id=%s", id)
			return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
		} else {
			d.log.WithContext(ctx).Warnf("[auth] user logout without claims id=%s", id)
		}

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
		}, nil

	case "me":
		claims, ok := biz.GetClaimsFromContext(ctx)
		if !ok || claims == nil {
			return id, &v1.JsonrpcResult{Code: errcode.AuthRequired.Code, Message: errcode.AuthRequired.Message}, nil
		}

		if claims.IsAdmin() {
			admin, err := d.getCurrentAdmin(ctx, claims)
			if err != nil {
				d.log.WithContext(ctx).Warnf("auth.me GetCurrentAdmin failed uid=%d err=%v", claims.UserID, err)
				return id, &v1.JsonrpcResult{Code: errcode.AuthCurrentUserFailed.Code, Message: errcode.AuthCurrentUserFailed.Message}, nil
			}

			return id, &v1.JsonrpcResult{
				Code:    errcode.OK.Code,
				Message: errcode.OK.Message,
				Data:    newDataStruct(adminProfileToMap(admin, nil)),
			}, nil
		}

		return id, &v1.JsonrpcResult{Code: errcode.AuthRequired.Code, Message: errcode.AuthRequired.Message}, nil

	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("auth: 未知方法=%s", method),
		}, nil
	}
}

func (d *jsonrpcDispatcher) mapAdminPasswordLoginError(ctx context.Context, err error) *v1.JsonrpcResult {
	logger := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrUserRevoked):
		logger.Warn("[auth] admin password login rejected reason=account_revoked")
		return &v1.JsonrpcResult{Code: errcode.AuthAccountRevoked.Code, Message: errcode.AuthAccountRevoked.Message}
	case errors.Is(err, biz.ErrAuthVersionStale):
		logger.Warn("[auth] admin password login rejected reason=credentials_changed")
		return &v1.JsonrpcResult{Code: errcode.AuthCredentialsChanged.Code, Message: errcode.AuthCredentialsChanged.Message}
	default:
		return d.mapAuthError(ctx, err)
	}
}

func (d *jsonrpcDispatcher) mapAdminLoginError(ctx context.Context, err error) *v1.JsonrpcResult {
	reason := ""
	switch {
	case errors.Is(err, biz.ErrUserNotFound):
		reason = "account_not_found"
	case errors.Is(err, biz.ErrInvalidPassword):
		reason = "password_invalid"
	case errors.Is(err, biz.ErrUserDisabled):
		reason = "account_inactive"
	case errors.Is(err, biz.ErrPhoneNotBound):
		reason = "phone_not_bound"
	case errors.Is(err, biz.ErrMobileRoleDenied):
		reason = "mobile_role_denied"
	case errors.Is(err, biz.ErrAuthVersionStale):
		reason = "credentials_changed"
	case errors.Is(err, biz.ErrSMSCodeNotFound),
		errors.Is(err, biz.ErrSMSCodeExpired),
		errors.Is(err, biz.ErrSMSCodeInvalid),
		errors.Is(err, biz.ErrSMSCodeAttemptsExceeded):
		reason = "sms_verification_failed"
	}
	if reason == "" {
		return d.mapAuthError(ctx, err)
	}
	d.log.WithContext(ctx).Warnf("[auth] admin login rejected reason=%s", reason)
	return &v1.JsonrpcResult{
		Code:    errcode.AuthLoginRejected.Code,
		Message: errcode.AuthLoginRejected.Message,
	}
}

func (d *jsonrpcDispatcher) mapAuthError(ctx context.Context, err error) *v1.JsonrpcResult {
	logger := d.log.WithContext(ctx)

	switch {
	case errors.Is(err, biz.ErrUserNotFound):
		logger.Warn("[auth] user not found")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthUserNotFound.Code,
			Message: errcode.AuthUserNotFound.Message,
		}
	case errors.Is(err, biz.ErrPhoneNotBound):
		logger.Warn("[auth] phone not bound")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthPhoneNotBound.Code,
			Message: errcode.AuthPhoneNotBound.Message,
		}
	case errors.Is(err, biz.ErrMobileRoleDenied):
		logger.Warn("[auth] mobile role denied")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthMobileRoleDenied.Code,
			Message: errcode.AuthMobileRoleDenied.Message,
		}
	case errors.Is(err, biz.ErrInvalidPassword):
		logger.Warn("[auth] invalid password")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthInvalidPassword.Code,
			Message: errcode.AuthInvalidPassword.Message,
		}
	case errors.Is(err, biz.ErrUserDisabled):
		logger.Warn("[auth] user disabled")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthUserDisabled.Code,
			Message: errcode.AuthUserDisabled.Message,
		}
	case errors.Is(err, biz.ErrUserRevoked):
		logger.Warn("[auth] user revoked")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthAccountRevoked.Code,
			Message: errcode.AuthAccountRevoked.Message,
		}
	case errors.Is(err, biz.ErrInvalidPhoneNumber):
		logger.Warn("[auth] invalid phone number")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthInvalidPhone.Code,
			Message: errcode.AuthInvalidPhone.Message,
		}
	case errors.Is(err, biz.ErrSMSCodeCooldown):
		logger.Warn("[auth] sms code cooldown")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthSMSCodeTooFrequent.Code,
			Message: errcode.AuthSMSCodeTooFrequent.Message,
		}
	case errors.Is(err, biz.ErrSMSCodeExpired):
		logger.Warn("[auth] sms code expired")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthSMSCodeExpired.Code,
			Message: errcode.AuthSMSCodeExpired.Message,
		}
	case errors.Is(err, biz.ErrSMSCodeInvalid), errors.Is(err, biz.ErrSMSCodeNotFound):
		logger.Warn("[auth] sms code invalid")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthInvalidSMSCode.Code,
			Message: errcode.AuthInvalidSMSCode.Message,
		}
	case errors.Is(err, biz.ErrSMSCodeAttemptsExceeded):
		logger.Warn("[auth] sms code attempts exceeded")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthSMSCodeAttemptsExceeded.Code,
			Message: errcode.AuthSMSCodeAttemptsExceeded.Message,
		}
	case errors.Is(err, biz.ErrSMSServiceUnavailable):
		logger.Warn("[auth] sms service unavailable")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthSMSServiceUnavailable.Code,
			Message: errcode.AuthSMSServiceUnavailable.Message,
		}
	case errors.Is(err, biz.ErrSMSServiceQuotaExceeded):
		logger.Warn("[auth] sms service quota exceeded")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthSMSServiceQuotaExceeded.Code,
			Message: errcode.AuthSMSServiceQuotaExceeded.Message,
		}
	default:
		logger.Errorf("[auth] internal error: %v", err)
		return &v1.JsonrpcResult{
			Code:    errcode.Internal.Code,
			Message: errcode.Internal.Message,
		}
	}
}
