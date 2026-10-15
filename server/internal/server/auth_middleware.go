// server/internal/server/auth_middleware.go
package server

import (
	"context"
	"errors"
	"strings"

	"server/internal/biz"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/go-kratos/kratos/v2/middleware"
	"github.com/go-kratos/kratos/v2/transport"
	"github.com/golang-jwt/jwt/v5"
)

type adminAuthFailureReason string

const (
	adminAuthFailureTokenExpired     adminAuthFailureReason = "token_expired"
	adminAuthFailureSessionExpired   adminAuthFailureReason = "session_expired"
	adminAuthFailureSessionRevoked   adminAuthFailureReason = "session_revoked"
	adminAuthFailureAuthVersionStale adminAuthFailureReason = "auth_version_stale"
	adminAuthFailureAccountInactive  adminAuthFailureReason = "account_inactive"
	adminAuthFailureSessionNotFound  adminAuthFailureReason = "session_not_found"
	adminAuthFailureAccountNotFound  adminAuthFailureReason = "account_not_found"
	adminAuthFailureTokenInvalid     adminAuthFailureReason = "token_invalid"
	adminAuthFailureBackendError     adminAuthFailureReason = "authentication_backend_error"
	adminAuthFailureResultIncomplete adminAuthFailureReason = "authentication_result_incomplete"
)

func classifyAdminAuthFailure(err error) (biz.AuthState, adminAuthFailureReason) {
	switch {
	case errors.Is(err, jwt.ErrTokenExpired):
		return biz.AuthExpired, adminAuthFailureTokenExpired
	case errors.Is(err, biz.ErrSessionExpired):
		return biz.AuthExpired, adminAuthFailureSessionExpired
	case errors.Is(err, biz.ErrSessionRevoked):
		return biz.AuthInvalid, adminAuthFailureSessionRevoked
	case errors.Is(err, biz.ErrAuthVersionStale):
		return biz.AuthInvalid, adminAuthFailureAuthVersionStale
	case errors.Is(err, biz.ErrUserDisabled):
		return biz.AuthInvalid, adminAuthFailureAccountInactive
	case errors.Is(err, biz.ErrSessionNotFound):
		return biz.AuthInvalid, adminAuthFailureSessionNotFound
	case errors.Is(err, biz.ErrUserNotFound):
		return biz.AuthInvalid, adminAuthFailureAccountNotFound
	case isAdminTokenValidationError(err):
		return biz.AuthInvalid, adminAuthFailureTokenInvalid
	case err == nil:
		return biz.AuthInvalid, adminAuthFailureResultIncomplete
	default:
		return biz.AuthUnavailable, adminAuthFailureBackendError
	}
}

func isAdminTokenValidationError(err error) bool {
	return errors.Is(err, jwt.ErrTokenMalformed) ||
		errors.Is(err, jwt.ErrTokenUnverifiable) ||
		errors.Is(err, jwt.ErrTokenSignatureInvalid) ||
		errors.Is(err, jwt.ErrSignatureInvalid) ||
		errors.Is(err, jwt.ErrTokenRequiredClaimMissing) ||
		errors.Is(err, jwt.ErrTokenInvalidAudience) ||
		errors.Is(err, jwt.ErrTokenUsedBeforeIssued) ||
		errors.Is(err, jwt.ErrTokenInvalidIssuer) ||
		errors.Is(err, jwt.ErrTokenInvalidSubject) ||
		errors.Is(err, jwt.ErrTokenNotValidYet) ||
		errors.Is(err, jwt.ErrTokenInvalidId) ||
		errors.Is(err, jwt.ErrTokenInvalidClaims) ||
		errors.Is(err, jwt.ErrInvalidType)
}

func bearerToken(auth string) string {
	auth = strings.TrimSpace(auth)
	if auth == "" {
		return ""
	}
	if len(auth) > 7 && strings.EqualFold(auth[:7], "Bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	return ""
}

// AuthClaimsMiddleware：解析 JWT -> 注入 ctx claims（不做授权）
func AuthClaimsMiddleware(authUC *biz.AdminAuthUsecase, logger log.Logger) middleware.Middleware {
	helper := log.NewHelper(log.With(logger, "module", "server.auth"))

	if authUC == nil {
		helper.Warn("auth middleware disabled (missing admin auth usecase)")
		return func(next middleware.Handler) middleware.Handler {
			return func(ctx context.Context, req any) (any, error) {
				// 未开启鉴权：视为无登录状态
				ctx = biz.WithAuthState(ctx, biz.AuthNone)
				return next(ctx, req)
			}
		}
	}

	return func(next middleware.Handler) middleware.Handler {
		return func(ctx context.Context, req any) (any, error) {
			// 默认：没登录
			ctx = biz.WithAuthState(ctx, biz.AuthNone)

			tr, ok := transport.FromServerContext(ctx)
			if !ok || tr == nil {
				return next(ctx, req)
			}

			auth := tr.RequestHeader().Get("Authorization")
			tok := bearerToken(auth)
			if tok == "" {
				// 没带 token：AuthNone
				return next(ctx, req)
			}

			claims, admin, err := authUC.Authenticate(ctx, tok)
			if err == nil && claims != nil && admin != nil {
				ctx = biz.NewContextWithClaims(ctx, claims)
				ctx = biz.WithCurrentAdmin(ctx, admin)
				ctx = biz.WithAuthState(ctx, biz.AuthOK)
				return next(ctx, req)
			}

			// 对外仅区分过期与无效；细分原因只进入结构化日志，不泄露 token 或会话标识。
			state, reason := classifyAdminAuthFailure(err)
			ctx = biz.WithAuthState(ctx, state)
			helper.WithContext(ctx).Warnw(
				"msg", "admin authentication rejected",
				"reason", string(reason),
			)

			return next(ctx, req)
		}
	}
}

// AdminAuthClaimsMiddleware：解析管理员 JWT -> 注入 ctx claims（不做授权）
// 当前与普通用户统一使用 data.auth.jwtSecret。
func AdminAuthClaimsMiddleware(authUC *biz.AdminAuthUsecase, logger log.Logger) middleware.Middleware {
	return AuthClaimsMiddleware(authUC, logger)
}
