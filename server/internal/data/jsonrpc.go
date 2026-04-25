// server/internal/data/jsonrpc.go
package data

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/conf"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	"google.golang.org/protobuf/types/known/structpb"
)

type adminAccountReader interface {
	GetAdminByID(ctx context.Context, id int) (*biz.AdminUser, error)
}

// JsonrpcData 是 JSON-RPC 的唯一业务入口，当前只保留通用鉴权和账号目录能力。
type JsonrpcData struct {
	data *Data
	log  *log.Helper
	cfg  *conf.Data

	authUC        *biz.AuthUsecase
	adminAuthUC   *biz.AdminAuthUsecase
	adminManageUC *biz.AdminManageUsecase
	userAdminUC   *biz.UserAdminUsecase
	workflowUC    *biz.WorkflowUsecase
	businessUC    *biz.BusinessRecordUsecase
	debugUC       *biz.DebugUsecase

	adminReader adminAccountReader
}

// NewJsonrpcData：由 wire 注入底层 repo，再在入口层组装 usecase，保持当前“入口聚合”风格。
func NewJsonrpcData(
	data *Data,
	c *conf.Data,
	logger log.Logger,
	authRepo *authRepo,
	adminAuthRepo *adminAuthRepo,
	tokenGenerator biz.TokenGenerator,
	adminTokenGenerator biz.AdminTokenGenerator,
	adminManageRepo biz.AdminManageRepo,
	userAdminRepo biz.UserAdminRepo,
	tracerProvider *tracesdk.TracerProvider,
) *JsonrpcData {
	helper := log.NewHelper(log.With(logger, "module", "data.jsonrpc"))

	if authRepo == nil {
		panic("NewJsonrpcData: authRepo is nil")
	}
	if adminAuthRepo == nil {
		panic("NewJsonrpcData: adminAuthRepo is nil")
	}
	if userAdminRepo == nil {
		panic("NewJsonrpcData: userAdminRepo is nil")
	}
	if tokenGenerator == nil {
		panic("NewJsonrpcData: tokenGenerator is nil")
	}
	if adminTokenGenerator == nil {
		panic("NewJsonrpcData: adminTokenGenerator is nil")
	}
	if adminManageRepo == nil {
		panic("NewJsonrpcData: adminManageRepo is nil")
	}
	if tracerProvider == nil {
		panic("NewJsonrpcData: tracerProvider is nil")
	}

	authUC := biz.NewAuthUsecase(authRepo, tokenGenerator, logger, tracerProvider)
	adminAuthUC := biz.NewAdminAuthUsecase(adminAuthRepo, adminTokenGenerator, logger, tracerProvider)
	adminManageUC := biz.NewAdminManageUsecase(adminManageRepo, logger, tracerProvider)
	userAdminUC := biz.NewUserAdminUsecase(userAdminRepo, logger, tracerProvider)
	workflowUC := biz.NewWorkflowUsecase(NewWorkflowRepo(data, logger))
	businessUC := biz.NewBusinessRecordUsecase(NewBusinessRecordRepo(data, logger))
	debugUC := biz.NewDebugUsecase(NewDebugSeedRepo(data, logger), newDebugSafetyConfig(c))

	helper.Info("JsonrpcData created (auth/admin auth/user admin usecases constructed inside)")

	return &JsonrpcData{
		data:          data,
		log:           helper,
		cfg:           c,
		authUC:        authUC,
		adminAuthUC:   adminAuthUC,
		adminManageUC: adminManageUC,
		userAdminUC:   userAdminUC,
		workflowUC:    workflowUC,
		businessUC:    businessUC,
		debugUC:       debugUC,
		adminReader:   adminAuthRepo,
	}
}

var _ biz.JsonrpcRepo = (*JsonrpcData)(nil)

func (d *JsonrpcData) Handle(
	ctx context.Context,
	url, jsonrpc, method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	d.log.WithContext(ctx).Infof(
		"[jsonrpc] handle url=%s jsonrpc=%s method=%s id=%s",
		url, jsonrpc, method, id,
	)

	if params == nil {
		d.log.WithContext(ctx).Info("[jsonrpc] params=<nil>")
	} else {
		b, _ := json.MarshalIndent(redactRPCParams(params.AsMap()), "", "  ")
		d.log.WithContext(ctx).Infof("[jsonrpc] params=%s", string(b))
	}

	if !d.isPublic(url, method) {
		if _, res := d.requireLogin(ctx); res != nil {
			return id, res, nil
		}
	}

	switch url {
	case "system":
		return d.handleSystem(ctx, id, method, params)
	case "auth":
		return d.handleAuth(ctx, method, id, params)
	case "admin":
		return d.handleAdmin(ctx, method, id, params)
	case "user":
		return d.handleUser(ctx, method, id, params)
	case "workflow":
		return d.handleWorkflow(ctx, method, id, params)
	case "business":
		return d.handleBusiness(ctx, method, id, params)
	case "debug":
		return d.handleDebug(ctx, method, id, params)
	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.JSONRPCUnknownURL.Code,
			Message: fmt.Sprintf("unknown jsonrpc url=%s", url),
		}, nil
	}
}

func (r *JsonrpcData) handleSystem(
	ctx context.Context,
	id, method string,
	_ *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	logger := r.log.WithContext(ctx)
	logger.Info("Jsonrpc.system: start", "method", method, "id", id)

	switch method {
	case "ping":
		data := newDataStruct(map[string]any{"pong": "pong"})
		logger.Info("Jsonrpc.system.ping: success", "id", id)
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: data}, nil
	case "version":
		data := newDataStruct(map[string]any{"version": "1.0.0"})
		logger.Info("Jsonrpc.system.version: success", "id", id)
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: data}, nil
	default:
		logger.Warn("Jsonrpc.system: unknown method", "method", method, "id", id)
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("unknown system method: %s", method),
		}, nil
	}
}

func (d *JsonrpcData) handleAuth(
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
				Data: newDataStruct(map[string]any{
					"user_id":                 admin.ID,
					"username":                admin.Username,
					"phone":                   admin.Phone,
					"access_token":            token,
					"expires_at":              expireAt.Unix(),
					"token_type":              "Bearer",
					"issued_at":               time.Now().Unix(),
					"admin_level":             admin.Level,
					"menu_permissions":        toAnySliceString(biz.EffectiveAdminMenuPermissions(biz.AdminLevel(admin.Level), admin.MenuPermissions)),
					"mobile_role_permissions": toAnySliceString(biz.EffectiveAdminMobileRolePermissions(biz.AdminLevel(admin.Level), admin.MobileRolePermissions)),
					"erp_preferences": map[string]any{
						"column_orders": toAnyMapStringSlice(admin.ERPPreferences.ColumnOrders),
					},
				}),
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
			Data: newDataStruct(map[string]any{
				"user_id":                 admin.ID,
				"username":                admin.Username,
				"phone":                   admin.Phone,
				"access_token":            token,
				"expires_at":              expireAt.Unix(),
				"token_type":              "Bearer",
				"issued_at":               time.Now().Unix(),
				"admin_level":             admin.Level,
				"menu_permissions":        toAnySliceString(biz.EffectiveAdminMenuPermissions(biz.AdminLevel(admin.Level), admin.MenuPermissions)),
				"mobile_role_permissions": toAnySliceString(biz.EffectiveAdminMobileRolePermissions(biz.AdminLevel(admin.Level), admin.MobileRolePermissions)),
				"erp_preferences": map[string]any{
					"column_orders": toAnyMapStringSlice(admin.ERPPreferences.ColumnOrders),
				},
			}),
		}, nil

	case "register":
		username := getString(pm, "username")
		password := getString(pm, "password")

		if username == "" || password == "" {
			return id, &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "缺少用户名或密码"}, nil
		}

		token, expireAt, user, err := d.authUC.Register(ctx, username, password)
		if err != nil {
			return id, d.mapAuthError(ctx, err), nil
		}

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: "注册成功",
			Data: newDataStruct(map[string]any{
				"user_id":      user.ID,
				"username":     user.Username,
				"access_token": token,
				"expires_at":   expireAt.Unix(),
				"token_type":   "Bearer",
				"issued_at":    time.Now().Unix(),
			}),
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
				Data: newDataStruct(map[string]any{
					"id":                      admin.ID,
					"username":                admin.Username,
					"phone":                   admin.Phone,
					"role":                    int(biz.RoleAdmin),
					"disabled":                admin.Disabled,
					"level":                   admin.Level,
					"menu_permissions":        toAnySliceString(biz.EffectiveAdminMenuPermissions(biz.AdminLevel(admin.Level), admin.MenuPermissions)),
					"mobile_role_permissions": toAnySliceString(biz.EffectiveAdminMobileRolePermissions(biz.AdminLevel(admin.Level), admin.MobileRolePermissions)),
					"erp_preferences": map[string]any{
						"column_orders": toAnyMapStringSlice(admin.ERPPreferences.ColumnOrders),
					},
				}),
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

func (d *JsonrpcData) mapAuthError(ctx context.Context, err error) *v1.JsonrpcResult {
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

func getString(m map[string]any, key string) string {
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return fmt.Sprintf("%.0f", x)
	default:
		return fmt.Sprintf("%v", x)
	}
}

func redactRPCParams(value any) any {
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, item := range v {
			if isSensitiveRPCParamKey(key) {
				out[key] = "<redacted>"
				continue
			}
			out[key] = redactRPCParams(item)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = redactRPCParams(item)
		}
		return out
	default:
		return value
	}
}

func isSensitiveRPCParamKey(key string) bool {
	normalized := strings.ToLower(strings.TrimSpace(key))
	return strings.Contains(normalized, "password") ||
		strings.Contains(normalized, "token") ||
		strings.Contains(normalized, "secret") ||
		normalized == "code" ||
		strings.Contains(normalized, "sms_code") ||
		strings.Contains(normalized, "captcha") ||
		strings.Contains(normalized, "verification_code")
}

func getAuthLoginScope(m map[string]any) (string, error) {
	scope := strings.ToLower(strings.TrimSpace(getString(m, "scope")))
	switch scope {
	case "", "user":
		return "user", nil
	case "admin":
		return "admin", nil
	default:
		return "", fmt.Errorf("invalid auth scope: %s", scope)
	}
}

func getInt(m map[string]any, key string, def int) int {
	v, ok := m[key]
	if !ok || v == nil {
		return def
	}
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	default:
		return def
	}
}

func getBool(m map[string]any, key string, def bool) bool {
	v, ok := m[key]
	if !ok || v == nil {
		return def
	}
	if b, ok := v.(bool); ok {
		return b
	}
	return def
}

func getStringSlice(m map[string]any, key string) []string {
	v, ok := m[key]
	if !ok || v == nil {
		return nil
	}
	rawItems, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(rawItems))
	for _, item := range rawItems {
		text := strings.TrimSpace(getString(map[string]any{"value": item}, "value"))
		if text == "" {
			continue
		}
		out = append(out, text)
	}
	return out
}

func toAnySliceString(items []string) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, item)
	}
	return out
}

func toAnyMapStringSlice(values map[string][]string) map[string]any {
	if len(values) == 0 {
		return map[string]any{}
	}
	out := make(map[string]any, len(values))
	for key, items := range values {
		out[key] = toAnySliceString(items)
	}
	return out
}

func newDataStruct(m map[string]any) *structpb.Struct {
	if m == nil {
		return nil
	}
	s, err := structpb.NewStruct(m)
	if err != nil {
		return nil
	}
	return s
}

func (d *JsonrpcData) requireLogin(ctx context.Context) (*biz.AuthClaims, *v1.JsonrpcResult) {
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

func (d *JsonrpcData) requireAdmin(ctx context.Context) (*biz.AuthClaims, *v1.JsonrpcResult) {
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

func (d *JsonrpcData) getCurrentAdmin(ctx context.Context, claims *biz.AuthClaims) (*biz.AdminUser, error) {
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

func (d *JsonrpcData) isPublic(url, method string) bool {
	if url == "system" && (method == "ping" || method == "version") {
		return true
	}
	if url == "auth" && (method == "login" || method == "admin_login" || method == "register" || method == "send_sms_code" || method == "sms_login" || method == "logout") {
		return true
	}
	return false
}

func (d *JsonrpcData) handleUser(
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

func (d *JsonrpcData) handleAdmin(
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
		lastLogin := int64(0)
		if admin.LastLoginAt != nil {
			lastLogin = admin.LastLoginAt.Unix()
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"id":                      admin.ID,
				"username":                admin.Username,
				"phone":                   admin.Phone,
				"level":                   admin.Level,
				"disabled":                admin.Disabled,
				"last_login_at":           lastLogin,
				"created_at":              admin.CreatedAt.Unix(),
				"updated_at":              admin.UpdatedAt.Unix(),
				"menu_permissions":        toAnySliceString(admin.MenuPermissions),
				"mobile_role_permissions": toAnySliceString(admin.MobileRolePermissions),
				"erp_preferences": map[string]any{
					"column_orders": toAnyMapStringSlice(admin.ERPPreferences.ColumnOrders),
				},
			}),
		}, nil

	case "list":
		admins, err := d.adminManageUC.List(ctx)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		arr := make([]any, 0, len(admins))
		for _, admin := range admins {
			lastLogin := int64(0)
			if admin.LastLoginAt != nil {
				lastLogin = admin.LastLoginAt.Unix()
			}
			arr = append(arr, map[string]any{
				"id":                      admin.ID,
				"username":                admin.Username,
				"phone":                   admin.Phone,
				"level":                   admin.Level,
				"disabled":                admin.Disabled,
				"last_login_at":           lastLogin,
				"created_at":              admin.CreatedAt.Unix(),
				"updated_at":              admin.UpdatedAt.Unix(),
				"menu_permissions":        toAnySliceString(admin.MenuPermissions),
				"mobile_role_permissions": toAnySliceString(admin.MobileRolePermissions),
			})
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data:    newDataStruct(map[string]any{"admins": arr}),
		}, nil

	case "create":
		username := getString(pm, "username")
		phone := getString(pm, "phone")
		password := getString(pm, "password")
		level := biz.AdminLevel(getInt(pm, "level", int(biz.AdminLevelStandard)))
		menuPermissions := getStringSlice(pm, "menu_permissions")
		mobileRolePermissions := getStringSlice(pm, "mobile_role_permissions")

		admin, err := d.adminManageUC.Create(ctx, username, phone, password, level, menuPermissions, mobileRolePermissions)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}

		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"admin": map[string]any{
					"id":                      admin.ID,
					"username":                admin.Username,
					"phone":                   admin.Phone,
					"level":                   admin.Level,
					"disabled":                admin.Disabled,
					"menu_permissions":        toAnySliceString(admin.MenuPermissions),
					"mobile_role_permissions": toAnySliceString(admin.MobileRolePermissions),
				},
			}),
		}, nil

	case "menu_options":
		options := biz.AdminMenuPermissionOptions()
		menuOptions := make([]any, 0, len(options))
		for _, item := range options {
			menuOptions = append(menuOptions, map[string]any{
				"key":   item.Key,
				"label": item.Label,
			})
		}
		mobileRoleOptions := make([]any, 0, len(biz.AdminMobileRolePermissionOptions()))
		for _, item := range biz.AdminMobileRolePermissionOptions() {
			mobileRoleOptions = append(mobileRoleOptions, map[string]any{
				"key":   item.Key,
				"label": item.Label,
			})
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"menu_options":        menuOptions,
				"mobile_role_options": mobileRoleOptions,
			}),
		}, nil

	case "set_permissions":
		adminID := getInt(pm, "id", 0)
		menuPermissions := getStringSlice(pm, "menu_permissions")
		mobileRolePermissions := getStringSlice(pm, "mobile_role_permissions")
		admin, err := d.adminManageUC.SetPermissions(ctx, adminID, menuPermissions, mobileRolePermissions)
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"admin": map[string]any{
					"id":                      admin.ID,
					"username":                admin.Username,
					"phone":                   admin.Phone,
					"level":                   admin.Level,
					"disabled":                admin.Disabled,
					"menu_permissions":        toAnySliceString(admin.MenuPermissions),
					"mobile_role_permissions": toAnySliceString(admin.MobileRolePermissions),
				},
			}),
		}, nil

	case "set_phone":
		adminID := getInt(pm, "id", 0)
		admin, err := d.adminManageUC.SetPhone(ctx, adminID, getString(pm, "phone"))
		if err != nil {
			return id, d.mapAdminManageError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{
			Code:    errcode.OK.Code,
			Message: errcode.OK.Message,
			Data: newDataStruct(map[string]any{
				"admin": map[string]any{
					"id":                      admin.ID,
					"username":                admin.Username,
					"phone":                   admin.Phone,
					"level":                   admin.Level,
					"disabled":                admin.Disabled,
					"menu_permissions":        toAnySliceString(admin.MenuPermissions),
					"mobile_role_permissions": toAnySliceString(admin.MobileRolePermissions),
				},
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

	case "set_disabled":
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
				"admin": map[string]any{
					"id":                      admin.ID,
					"username":                admin.Username,
					"phone":                   admin.Phone,
					"level":                   admin.Level,
					"disabled":                admin.Disabled,
					"menu_permissions":        toAnySliceString(admin.MenuPermissions),
					"mobile_role_permissions": toAnySliceString(admin.MobileRolePermissions),
				},
			}),
		}, nil

	case "reset_password":
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
				"admin": map[string]any{
					"id":                      admin.ID,
					"username":                admin.Username,
					"phone":                   admin.Phone,
					"level":                   admin.Level,
					"disabled":                admin.Disabled,
					"menu_permissions":        toAnySliceString(admin.MenuPermissions),
					"mobile_role_permissions": toAnySliceString(admin.MobileRolePermissions),
				},
			}),
		}, nil

	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知管理员接口 method=%s", method),
		}, nil
	}
}

func (d *JsonrpcData) mapAdminManageError(ctx context.Context, err error) *v1.JsonrpcResult {
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
	case errors.Is(err, biz.ErrAdminInvalidLevel):
		l.Warnf("[admin] invalid level err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.AdminInvalidLevel.Code, Message: errcode.AdminInvalidLevel.Message}
	case errors.Is(err, biz.ErrAdminNotFound):
		l.Warnf("[admin] not found err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.AdminNotFound.Code, Message: errcode.AdminNotFound.Message}
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

func (d *JsonrpcData) mapUserAdminError(ctx context.Context, err error) *v1.JsonrpcResult {
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
