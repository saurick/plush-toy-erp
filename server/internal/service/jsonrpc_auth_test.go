package service

import (
	"context"
	"fmt"
	"testing"
	"time"

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

func TestJsonrpcDispatcher_AuthSMSSendProviderErrors(t *testing.T) {
	tests := []struct {
		name    string
		err     error
		code    int32
		message string
	}{
		{
			name:    "cooldown",
			err:     fmt.Errorf("wrapped provider error: %w", biz.ErrSMSCodeCooldown),
			code:    errcode.AuthSMSCodeTooFrequent.Code,
			message: errcode.AuthSMSCodeTooFrequent.Message,
		},
		{
			name:    "quota exceeded",
			err:     fmt.Errorf("wrapped provider error: %w", biz.ErrSMSServiceQuotaExceeded),
			code:    errcode.AuthSMSServiceQuotaExceeded.Code,
			message: errcode.AuthSMSServiceQuotaExceeded.Message,
		},
		{
			name:    "service unavailable",
			err:     fmt.Errorf("wrapped provider error: %w", biz.ErrSMSServiceUnavailable),
			code:    errcode.AuthSMSServiceUnavailable.Code,
			message: errcode.AuthSMSServiceUnavailable.Message,
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
			if res == nil || res.Code != tt.code {
				t.Fatalf("expected code %d, got %+v", tt.code, res)
			}
			if res.Message != tt.message {
				t.Fatalf("unexpected message: %q", res.Message)
			}
		})
	}
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

func (r *memAdminAuthRepoForData) CreateAdminSession(_ context.Context, session *biz.AdminSession) error {
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
