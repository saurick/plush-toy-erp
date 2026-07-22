package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestJsonrpcDispatcher_AuthLogin_Removed(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.DefaultLogger)}

	_, res, err := d.handleAuth(context.Background(), "login", "1", mustAuthStruct(t, map[string]any{
		"username": "demo",
		"password": "secret",
	}))
	if err != nil {
		t.Fatalf("handle auth.login: %v", err)
	}
	if res == nil || res.Code != errcode.UnknownMethod.Code {
		t.Fatalf("expected auth.login removed as unknown method, got %+v", res)
	}
}

func TestJsonrpcDispatcher_AuthSMSScopeUser_Removed(t *testing.T) {
	repo := newMemAdminAuthRepoForData()
	d := &jsonrpcDispatcher{
		log:         log.NewHelper(log.DefaultLogger),
		adminAuthUC: newAdminAuthUsecaseForTest(repo),
		authSMS:     normalizeAuthSMSRuntimeConfig(authSMSModeMock),
	}

	_, res, err := d.handleAuth(context.Background(), "send_sms_code", "1", mustAuthStruct(t, map[string]any{
		"phone": "13800138000",
		"scope": "user",
	}))
	if err != nil {
		t.Fatalf("handle auth.send_sms_code: %v", err)
	}
	if res == nil || res.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected user sms scope rejected, got %+v", res)
	}
}

func TestJsonrpcDispatcher_AuthSMSLogin_AdminOK(t *testing.T) {
	repo := newMemAdminAuthRepoForData()
	if err := repo.putAdmin("boss", "13800138000", "secret", false); err != nil {
		t.Fatalf("put admin: %v", err)
	}
	d := &jsonrpcDispatcher{
		log:         log.NewHelper(log.DefaultLogger),
		adminAuthUC: newAdminAuthUsecaseForTest(repo),
		authSMS:     normalizeAuthSMSRuntimeConfig(authSMSModeMock),
	}

	_, sendRes, err := d.handleAuth(context.Background(), "send_sms_code", "1", mustAuthStruct(t, map[string]any{
		"phone": "13800138000",
		"scope": "admin",
	}))
	if err != nil {
		t.Fatalf("handle auth.send_sms_code: %v", err)
	}
	if sendRes == nil || sendRes.Code != errcode.OK.Code {
		t.Fatalf("expected send sms ok, got %+v", sendRes)
	}
	code := getNestedString(sendRes.Data.AsMap(), "mock_code")
	if code == "" {
		t.Fatalf("expected mock sms code in response, got %+v", sendRes.Data.AsMap())
	}

	_, loginRes, err := d.handleAuth(context.Background(), "sms_login", "2", mustAuthStruct(t, map[string]any{
		"phone": "13800138000",
		"code":  code,
		"scope": "admin",
	}))
	if err != nil {
		t.Fatalf("handle auth.sms_login: %v", err)
	}
	if loginRes == nil || loginRes.Code != errcode.OK.Code {
		t.Fatalf("expected sms login ok, got %+v", loginRes)
	}
	data := loginRes.Data.AsMap()
	if data["access_token"] == "" || data["username"] != "boss" {
		t.Fatalf("unexpected sms login data: %+v", data)
	}
}

func TestJsonrpcDispatcher_SMSIdentityResponsesPreventEnumeration(t *testing.T) {
	repo := newMemAdminAuthRepoForData()
	for _, account := range []struct {
		username string
		phone    string
		disabled bool
	}{
		{username: "eligible", phone: "13800138000"},
		{username: "disabled", phone: "13900139000", disabled: true},
		{username: "no-role", phone: "13700137000"},
	} {
		if err := repo.putAdmin(account.username, account.phone, "secret", account.disabled); err != nil {
			t.Fatalf("put admin %s: %v", account.username, err)
		}
	}
	repo.byUsername["eligible"].Roles = []biz.AdminRole{{Key: biz.PurchaseRoleKey}}
	repo.byUsername["no-role"].IsSuperAdmin = false
	provider := &recordingSMSLoginCodeProvider{delegate: biz.NewLocalSMSLoginCodeProvider("admin")}
	d := &jsonrpcDispatcher{
		log:         log.NewHelper(log.NewStdLogger(io.Discard)),
		adminAuthUC: newAdminAuthUsecaseForTestWithSMSProvider(repo, provider),
		authSMS:     normalizeAuthSMSRuntimeConfig(authSMSModeMock),
	}

	phones := []string{"13800138000", "13600136000", "13900139000", "13700137000"}
	codes := make(map[string]string, len(phones))
	for index, phone := range phones {
		_, result, err := d.handleAuth(context.Background(), "send_sms_code", fmt.Sprint(index+1), mustAuthStruct(t, map[string]any{
			"phone":           phone,
			"scope":           "admin",
			"mobile_role_key": "purchase",
		}))
		if err != nil {
			t.Fatalf("send_sms_code(%s): %v", phone, err)
		}
		assertExactSMSSendAcceptedResponse(t, result, phone)
		codes[phone] = getNestedString(result.Data.AsMap(), "mock_code")
	}
	if len(provider.requestPhones) != 1 || provider.requestPhones[0] != "13800138000" {
		t.Fatalf("actual SMS delivery requests = %#v, want eligible phone only", provider.requestPhones)
	}

	validCode := codes["13800138000"]
	wrongCode := "000000"
	if validCode == wrongCode {
		wrongCode = "000001"
	}
	failures := []struct {
		name  string
		phone string
		code  string
	}{
		{name: "unknown phone", phone: "13600136000", code: codes["13600136000"]},
		{name: "disabled account", phone: "13900139000", code: codes["13900139000"]},
		{name: "missing mobile role", phone: "13700137000", code: codes["13700137000"]},
		{name: "eligible account wrong code", phone: "13800138000", code: wrongCode},
	}
	for index, failure := range failures {
		t.Run(failure.name, func(t *testing.T) {
			_, result, err := d.handleAuth(context.Background(), "sms_login", fmt.Sprintf("f-%d", index), mustAuthStruct(t, map[string]any{
				"phone":           failure.phone,
				"code":            failure.code,
				"scope":           "admin",
				"mobile_role_key": "purchase",
			}))
			if err != nil {
				t.Fatalf("sms_login: %v", err)
			}
			assertExactSMSIdentityFailureResponse(t, result)
		})
	}

	expiredDispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.NewStdLogger(io.Discard)),
		adminAuthUC: newAdminAuthUsecaseForTestWithSMSProvider(repo, unavailableSMSLoginCodeProvider{
			err: biz.ErrSMSCodeExpired,
		}),
		authSMS: normalizeAuthSMSRuntimeConfig(authSMSModeProvider),
	}
	_, expiredResult, err := expiredDispatcher.handleAuth(context.Background(), "sms_login", "expired", mustAuthStruct(t, map[string]any{
		"phone": "13800138000", "code": "123456", "scope": "admin", "mobile_role_key": "purchase",
	}))
	if err != nil {
		t.Fatalf("expired sms_login: %v", err)
	}
	assertExactSMSIdentityFailureResponse(t, expiredResult)

	_, success, err := d.handleAuth(context.Background(), "sms_login", "success", mustAuthStruct(t, map[string]any{
		"phone": "13800138000", "code": validCode, "scope": "admin", "mobile_role_key": "purchase",
	}))
	if err != nil {
		t.Fatalf("successful sms_login: %v", err)
	}
	if success == nil || success.Code != errcode.OK.Code || success.Message != "登录成功" || getNestedString(success.Data.AsMap(), "access_token") == "" {
		t.Fatalf("unexpected successful sms response: %#v", success)
	}
}

func TestJsonrpcDispatcher_AuthMe_StaleUserTokenRejected(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.DefaultLogger)}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "old-user",
		Role:     biz.RoleUser,
	})

	_, res, err := d.handleAuth(ctx, "me", "1", nil)
	if err != nil {
		t.Fatalf("handle auth.me: %v", err)
	}
	if res == nil || res.Code != errcode.AuthRequired.Code {
		t.Fatalf("expected stale user token rejected, got %+v", res)
	}
}

func TestJsonrpcDispatcher_LogoutFailsWhenAuthenticationBackendIsUnavailable(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.DefaultLogger)}
	ctx := biz.WithAuthState(context.Background(), biz.AuthUnavailable)

	_, res, err := d.handleAuth(ctx, "logout", "1", nil)
	if err != nil {
		t.Fatalf("handle auth.logout: %v", err)
	}
	if res == nil || res.Code != errcode.Internal.Code {
		t.Fatalf("authentication backend failure must not report logout success: %+v", res)
	}
}

func TestJsonrpcDispatcher_ProtectedRequestFailsRetryablyWhenAuthenticationBackendIsUnavailable(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.DefaultLogger)}
	ctx := biz.WithAuthState(context.Background(), biz.AuthUnavailable)

	claims, res := d.requireLogin(ctx)
	if claims != nil || res == nil || res.Code != errcode.Internal.Code {
		t.Fatalf("authentication backend failure must not be downgraded to login required: claims=%#v result=%#v", claims, res)
	}
}

func TestJsonrpcDispatcher_AuthSMSLogin_DisabledByConfig(t *testing.T) {
	d := &jsonrpcDispatcher{
		log:     log.NewHelper(log.DefaultLogger),
		authSMS: normalizeAuthSMSRuntimeConfig(authSMSModeDisabled),
	}

	_, res, err := d.handleAuth(context.Background(), "send_sms_code", "1", mustAuthStruct(t, map[string]any{
		"phone": "13800138000",
		"scope": "admin",
	}))
	if err != nil {
		t.Fatalf("handle auth.send_sms_code: %v", err)
	}
	if res == nil || res.Code != errcode.AuthSMSLoginDisabled.Code {
		t.Fatalf("expected sms disabled, got %+v", res)
	}
}

func TestJsonrpcDispatcher_AuthSMSSendProviderErrorsAreSuppressed(t *testing.T) {
	tests := []struct {
		name string
		err  error
	}{
		{
			name: "cooldown",
			err:  fmt.Errorf("wrapped provider error: %w", biz.ErrSMSCodeCooldown),
		},
		{
			name: "quota exceeded",
			err:  fmt.Errorf("wrapped provider error: %w", biz.ErrSMSServiceQuotaExceeded),
		},
		{
			name: "service unavailable",
			err:  fmt.Errorf("wrapped provider error: %w", biz.ErrSMSServiceUnavailable),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newMemAdminAuthRepoForData()
			if err := repo.putAdmin("boss", "13800138000", "secret", false); err != nil {
				t.Fatalf("put admin: %v", err)
			}
			d := &jsonrpcDispatcher{
				log: log.NewHelper(log.DefaultLogger),
				adminAuthUC: newAdminAuthUsecaseForTestWithSMSProvider(repo, unavailableSMSLoginCodeProvider{
					err: tt.err,
				}),
				authSMS: normalizeAuthSMSRuntimeConfig(authSMSModeProvider),
			}

			_, res, err := d.handleAuth(context.Background(), "send_sms_code", "1", mustAuthStruct(t, map[string]any{
				"phone": "13800138000",
				"scope": "admin",
			}))
			if err != nil {
				t.Fatalf("handle auth.send_sms_code: %v", err)
			}
			if res == nil || res.Code != errcode.OK.Code || res.Message != "验证码已发送" {
				t.Fatalf("provider error leaked through public response: %+v", res)
			}
			data := res.Data.AsMap()
			if data["mock_delivery"] != false || getNestedString(data, "mock_code") != "" {
				t.Fatalf("provider response exposed mock details: %+v", data)
			}
		})
	}
}

func TestJsonrpcDispatcher_AdminLoginIdentityFailuresUseSingleExternalContract(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard))}

	for _, err := range []error{
		biz.ErrUserNotFound,
		biz.ErrInvalidPassword,
		biz.ErrUserDisabled,
		biz.ErrPhoneNotBound,
		biz.ErrMobileRoleDenied,
		biz.ErrAuthVersionStale,
		biz.ErrSMSCodeNotFound,
		biz.ErrSMSCodeInvalid,
		biz.ErrSMSCodeExpired,
		biz.ErrSMSCodeAttemptsExceeded,
	} {
		result := d.mapAdminLoginError(context.Background(), fmt.Errorf("wrapped: %w", err))
		if result.Code != errcode.AuthLoginRejected.Code || result.Message != errcode.AuthLoginRejected.Message {
			t.Fatalf("mapAdminLoginError(%v) = %#v", err, result)
		}
	}

	storageErr := errors.New("authentication storage unavailable")
	result := d.mapAdminLoginError(context.Background(), storageErr)
	if result.Code != errcode.Internal.Code || result.Message != errcode.Internal.Message {
		t.Fatalf("storage error must remain internal: %#v", result)
	}
}

func TestJsonrpcDispatcher_AdminPasswordLoginFailuresUsePreciseExternalContract(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard))}
	tests := []struct {
		err  error
		want errcode.Definition
	}{
		{err: biz.ErrUserNotFound, want: errcode.AuthUserNotFound},
		{err: biz.ErrInvalidPassword, want: errcode.AuthInvalidPassword},
		{err: biz.ErrUserDisabled, want: errcode.AuthUserDisabled},
		{err: biz.ErrUserRevoked, want: errcode.AuthAccountRevoked},
		{err: biz.ErrAuthVersionStale, want: errcode.AuthCredentialsChanged},
	}
	for _, tt := range tests {
		result := d.mapAdminPasswordLoginError(context.Background(), fmt.Errorf("wrapped: %w", tt.err))
		if result.Code != tt.want.Code || result.Message != tt.want.Message || result.Data != nil {
			t.Fatalf("mapAdminPasswordLoginError(%v) = %#v, want %#v", tt.err, result, tt.want)
		}
	}

	storageErr := errors.New("authentication storage unavailable")
	result := d.mapAdminPasswordLoginError(context.Background(), storageErr)
	if result.Code != errcode.Internal.Code || result.Message != errcode.Internal.Message {
		t.Fatalf("storage error must remain internal: %#v", result)
	}
}

func assertExactSMSSendAcceptedResponse(t *testing.T, result *v1.JsonrpcResult, phone string) {
	t.Helper()
	if result == nil || result.Code != errcode.OK.Code || result.Message != "验证码已发送" || result.Data == nil {
		t.Fatalf("unexpected send response: %#v", result)
	}
	data := result.Data.AsMap()
	if len(data) != 5 || getNestedString(data, "phone") != phone || data["mock_delivery"] != true {
		t.Fatalf("unexpected send response data: %#v", data)
	}
	if expiresAt, ok := data["expires_at"].(float64); !ok || expiresAt <= 0 {
		t.Fatalf("invalid expires_at: %#v", data["expires_at"])
	}
	if resendAfter, ok := data["resend_after"].(float64); !ok || resendAfter <= 0 {
		t.Fatalf("invalid resend_after: %#v", data["resend_after"])
	}
	code := getNestedString(data, "mock_code")
	if len(code) != smsLoginCodeDigitsForContract || !isASCIIDigits(code) {
		t.Fatalf("invalid mock code contract: %q", code)
	}
}

func assertExactSMSIdentityFailureResponse(t *testing.T, result *v1.JsonrpcResult) {
	t.Helper()
	if result == nil || result.Code != errcode.AuthLoginRejected.Code || result.Message != errcode.AuthLoginRejected.Message || result.Data != nil {
		t.Fatalf("unexpected SMS identity failure response: %#v", result)
	}
}

const smsLoginCodeDigitsForContract = 6

func isASCIIDigits(value string) bool {
	for _, char := range value {
		if char < '0' || char > '9' {
			return false
		}
	}
	return value != ""
}

func mustAuthStruct(t *testing.T, values map[string]any) *structpb.Struct {
	t.Helper()
	st, err := structpb.NewStruct(values)
	if err != nil {
		t.Fatalf("new struct: %v", err)
	}
	return st
}

func getNestedString(values map[string]any, key string) string {
	if nested, ok := values["data"].(map[string]any); ok {
		if v, ok := nested[key].(string); ok {
			return v
		}
	}
	if v, ok := values[key].(string); ok {
		return v
	}
	return ""
}

func newAdminAuthUsecaseForTest(repo *memAdminAuthRepoForData) *biz.AdminAuthUsecase {
	return biz.NewAdminAuthUsecase(repo, func(input biz.AdminTokenInput) (string, time.Time, error) {
		return "admin-token", time.Now().Add(time.Hour), nil
	}, nil, nil, log.DefaultLogger, nil)
}

func newAdminAuthUsecaseForTestWithSMSProvider(repo *memAdminAuthRepoForData, smsProvider biz.SMSLoginCodeProvider) *biz.AdminAuthUsecase {
	return biz.NewAdminAuthUsecase(repo, func(input biz.AdminTokenInput) (string, time.Time, error) {
		return "admin-token", time.Now().Add(time.Hour), nil
	}, nil, smsProvider, log.DefaultLogger, nil)
}

type unavailableSMSLoginCodeProvider struct {
	err error
}

type recordingSMSLoginCodeProvider struct {
	delegate      biz.SMSLoginCodeProvider
	requestPhones []string
}

func (p *recordingSMSLoginCodeProvider) Request(ctx context.Context, phone string) (*biz.SMSLoginChallenge, error) {
	p.requestPhones = append(p.requestPhones, phone)
	return p.delegate.Request(ctx, phone)
}

func (p *recordingSMSLoginCodeProvider) Verify(ctx context.Context, phone, code string) (string, error) {
	return p.delegate.Verify(ctx, phone, code)
}

func (p unavailableSMSLoginCodeProvider) Request(context.Context, string) (*biz.SMSLoginChallenge, error) {
	return nil, p.err
}

func (p unavailableSMSLoginCodeProvider) Verify(context.Context, string, string) (string, error) {
	return "", p.err
}

type memAdminAuthRepoForData struct {
	byUsername map[string]*biz.AdminUser
	byPhone    map[string]*biz.AdminUser
	sessions   map[string]*biz.AdminSession
}

func newMemAdminAuthRepoForData() *memAdminAuthRepoForData {
	return &memAdminAuthRepoForData{
		byUsername: make(map[string]*biz.AdminUser),
		byPhone:    make(map[string]*biz.AdminUser),
		sessions:   make(map[string]*biz.AdminSession),
	}
}

func (r *memAdminAuthRepoForData) putAdmin(username, phone, password string, disabled bool) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	admin := &biz.AdminUser{
		ID:           len(r.byUsername) + 1,
		Username:     username,
		Phone:        phone,
		PasswordHash: string(hash),
		IsSuperAdmin: true,
		Disabled:     disabled,
		AuthVersion:  1,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	r.byUsername[username] = admin
	if phone != "" {
		r.byPhone[phone] = admin
	}
	return nil
}

func (r *memAdminAuthRepoForData) GetAdminByID(_ context.Context, id int) (*biz.AdminUser, error) {
	for _, admin := range r.byUsername {
		if admin.ID == id {
			return admin, nil
		}
	}
	return nil, biz.ErrUserNotFound
}

func (r *memAdminAuthRepoForData) CreateAdminSession(_ context.Context, session *biz.AdminSession, _ biz.AdminSessionIssueConstraint) error {
	cp := *session
	r.sessions[session.SessionKey] = &cp
	return nil
}

func (r *memAdminAuthRepoForData) GetAdminSession(_ context.Context, key string) (*biz.AdminSession, error) {
	s := r.sessions[key]
	if s == nil {
		return nil, biz.ErrSessionNotFound
	}
	cp := *s
	return &cp, nil
}

func (r *memAdminAuthRepoForData) RevokeAdminSession(_ context.Context, key, reason string, at time.Time) error {
	if s := r.sessions[key]; s != nil {
		s.RevokedAt = &at
		s.RevokeReason = reason
	}
	return nil
}

func (r *memAdminAuthRepoForData) GetAdminByUsername(_ context.Context, username string) (*biz.AdminUser, error) {
	admin := r.byUsername[username]
	if admin == nil {
		return nil, biz.ErrUserNotFound
	}
	return admin, nil
}

func (r *memAdminAuthRepoForData) GetAdminByPhone(_ context.Context, phone string) (*biz.AdminUser, error) {
	admin := r.byPhone[phone]
	if admin == nil {
		return nil, biz.ErrPhoneNotBound
	}
	return admin, nil
}

func (r *memAdminAuthRepoForData) UpdateAdminLastLogin(_ context.Context, id int, at time.Time) error {
	for _, admin := range r.byUsername {
		if admin.ID == id {
			admin.LastLoginAt = &at
			return nil
		}
	}
	return biz.ErrUserNotFound
}
