package service

import (
	"context"
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

	case "login":
		username := getString(pm, "username")
		password := getString(pm, "password")

		if username == "" || password == "" {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "缺少用户名或密码"}, nil
		}

		token, expireAt, user, err := d.authUC.Login(ctx, username, password)
		if err != nil {
			return id, d.mapAuthError(ctx, err), nil
		}

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "登录成功",
			Data: newDataStruct(map[string]any{
				"user_id":      user.ID,
				"username":     user.Username,
				"access_token": token,
				"expires_at":   expireAt.Unix(),
				"token_type":   "Bearer",
				"issued_at":    time.Now().Unix(),
			}),
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
		if phone == "" {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "缺少手机号"}, nil
		}

		var (
			challenge *biz.SMSLoginChallenge
			err       error
		)
		if scope == "admin" {
			challenge, err = d.adminAuthUC.RequestSMSLoginCode(ctx, phone, mobileRoleKey)
		} else {
			challenge, err = d.authUC.RequestSMSLoginCode(ctx, phone)
		}
		if err != nil {
			return id, d.mapAuthError(ctx, err), nil
		}

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "验证码已发送",
			Data: newDataStruct(map[string]any{
				"phone":         challenge.Phone,
				"expires_at":    challenge.ExpiresAt.Unix(),
				"resend_after":  challenge.ResendAfter.Unix(),
				"mock_delivery": challenge.MockDelivery,
				"mock_code":     challenge.MockCode,
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
		if phone == "" || code == "" {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "缺少手机号或验证码"}, nil
		}

		if scope == "admin" {
			token, expireAt, admin, err := d.adminAuthUC.LoginWithSMSCode(ctx, phone, code, mobileRoleKey)
			if err != nil {
				return id, d.mapAuthError(ctx, err), nil
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
		}

		token, expireAt, user, err := d.authUC.LoginWithSMSCode(ctx, phone, code)
		if err != nil {
			return id, d.mapAuthError(ctx, err), nil
		}

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "登录成功",
			Data: newDataStruct(map[string]any{
				"user_id":      user.ID,
				"username":     user.Username,
				"access_token": token,
				"expires_at":   expireAt.Unix(),
				"token_type":   "Bearer",
				"issued_at":    time.Now().Unix(),
			}),
		}, nil

	case "admin_login":
		username := getString(pm, "username")
		password := getString(pm, "password")

		if username == "" || password == "" {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "缺少用户名或密码"}, nil
		}

		token, expireAt, admin, err := d.adminAuthUC.Login(ctx, username, password)
		if err != nil {
			return id, d.mapAuthError(ctx, err), nil
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
			d.log.WithContext(ctx).Infof(
				"[auth] user logout uid=%d uname=%s role=%d id=%s",
				claims.UserID,
				claims.Username,
				claims.Role,
				id,
			)
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

		if claims.Role == biz.RoleAdmin {
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

		u, err := d.authUC.GetCurrentUser(ctx, claims.UserID)
		if err != nil {
			d.log.WithContext(ctx).Warnf("auth.me GetCurrentUser failed uid=%d err=%v", claims.UserID, err)
			return id, &v1.JsonrpcResult{Code: errcode.AuthCurrentUserFailed.Code, Message: errcode.AuthCurrentUserFailed.Message}, nil
		}

		data := map[string]any{
			"id":         u.ID,
			"username":   u.Username,
			"role":       u.Role,
			"disabled":   u.Disabled,
			"created_at": u.CreatedAt.Unix(),
		}
		if u.LastLoginAt != nil {
			data["last_login_at"] = u.LastLoginAt.Unix()
		}

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(data),
		}, nil

	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("auth: 未知方法=%s", method),
		}, nil
	}
}

func (d *jsonrpcDispatcher) mapAuthError(ctx context.Context, err error) *v1.JsonrpcResult {
	logger := d.log.WithContext(ctx)

	switch err {
	case biz.ErrUserNotFound:
		logger.Warn("[auth] user not found")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthUserNotFound.Code,
			Message: errcode.AuthUserNotFound.Message,
		}
	case biz.ErrPhoneNotBound:
		logger.Warn("[auth] phone not bound")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthPhoneNotBound.Code,
			Message: errcode.AuthPhoneNotBound.Message,
		}
	case biz.ErrMobileRoleDenied:
		logger.Warn("[auth] mobile role denied")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthMobileRoleDenied.Code,
			Message: errcode.AuthMobileRoleDenied.Message,
		}
	case biz.ErrInvalidPassword:
		logger.Warn("[auth] invalid password")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthInvalidPassword.Code,
			Message: errcode.AuthInvalidPassword.Message,
		}
	case biz.ErrUserDisabled:
		logger.Warn("[auth] user disabled")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthUserDisabled.Code,
			Message: errcode.AuthUserDisabled.Message,
		}
	case biz.ErrUserExists:
		logger.Warn("[auth] user already exists")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthUserExists.Code,
			Message: errcode.AuthUserExists.Message,
		}
	case biz.ErrInvalidPhoneNumber:
		logger.Warn("[auth] invalid phone number")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthInvalidPhone.Code,
			Message: errcode.AuthInvalidPhone.Message,
		}
	case biz.ErrSMSCodeCooldown:
		logger.Warn("[auth] sms code cooldown")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthSMSCodeTooFrequent.Code,
			Message: errcode.AuthSMSCodeTooFrequent.Message,
		}
	case biz.ErrSMSCodeExpired:
		logger.Warn("[auth] sms code expired")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthSMSCodeExpired.Code,
			Message: errcode.AuthSMSCodeExpired.Message,
		}
	case biz.ErrSMSCodeInvalid, biz.ErrSMSCodeNotFound:
		logger.Warn("[auth] sms code invalid")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthInvalidSMSCode.Code,
			Message: errcode.AuthInvalidSMSCode.Message,
		}
	case biz.ErrSMSCodeAttemptsExceeded:
		logger.Warn("[auth] sms code attempts exceeded")
		return &v1.JsonrpcResult{
			Code:    errcode.AuthSMSCodeAttemptsExceeded.Code,
			Message: errcode.AuthSMSCodeAttemptsExceeded.Message,
		}
	default:
		logger.Errorf("[auth] internal error: %v", err)
		return &v1.JsonrpcResult{
			Code:    errcode.Internal.Code,
			Message: errcode.Internal.Message,
		}
	}
}
