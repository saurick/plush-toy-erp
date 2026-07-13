package biz

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
)

type memAdminAuthRepo struct {
	mu        sync.Mutex
	admins    map[string]*AdminUser
	phones    map[string]*AdminUser
	sessions  map[string]*AdminSession
	lastLogin map[int]time.Time
}

func newMemAdminAuthRepo() *memAdminAuthRepo {
	return &memAdminAuthRepo{
		admins:    make(map[string]*AdminUser),
		phones:    make(map[string]*AdminUser),
		sessions:  make(map[string]*AdminSession),
		lastLogin: make(map[int]time.Time),
	}
}

func (r *memAdminAuthRepo) GetAdminByID(_ context.Context, id int) (*AdminUser, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, admin := range r.admins {
		if admin.ID == id {
			cp := *admin
			return &cp, nil
		}
	}
	return nil, ErrUserNotFound
}

func (r *memAdminAuthRepo) CreateAdminSession(_ context.Context, session *AdminSession) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := *session
	r.sessions[session.SessionKey] = &cp
	return nil
}

func (r *memAdminAuthRepo) GetAdminSession(_ context.Context, sessionKey string) (*AdminSession, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	session := r.sessions[sessionKey]
	if session == nil {
		return nil, ErrSessionNotFound
	}
	cp := *session
	return &cp, nil
}

func (r *memAdminAuthRepo) RevokeAdminSession(_ context.Context, sessionKey, reason string, revokedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if session := r.sessions[sessionKey]; session != nil {
		session.RevokedAt = &revokedAt
		session.RevokeReason = reason
	}
	return nil
}

func (r *memAdminAuthRepo) GetAdminByUsername(_ context.Context, username string) (*AdminUser, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	admin := r.admins[username]
	if admin == nil {
		return nil, errors.New("not found")
	}
	cp := *admin
	cp.Roles = append([]AdminRole(nil), admin.Roles...)
	cp.Permissions = append([]string(nil), admin.Permissions...)
	return &cp, nil
}

func (r *memAdminAuthRepo) GetAdminByPhone(_ context.Context, phone string) (*AdminUser, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	admin := r.phones[phone]
	if admin == nil {
		return nil, errors.New("not found")
	}
	cp := *admin
	cp.Roles = append([]AdminRole(nil), admin.Roles...)
	cp.Permissions = append([]string(nil), admin.Permissions...)
	return &cp, nil
}

func (r *memAdminAuthRepo) UpdateAdminLastLogin(_ context.Context, id int, t time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.lastLogin[id] = t
	return nil
}

func TestAdminAuthUsecase_SMSLogin_Success(t *testing.T) {
	repo := newMemAdminAuthRepo()
	repo.admins["13800138000"] = &AdminUser{
		ID:          1,
		Username:    "sms-admin",
		Phone:       "13800138000",
		AuthVersion: 1,
		Roles: []AdminRole{
			{Key: PurchaseRoleKey, Name: "采购"},
		},
		Permissions: []string{PermissionMobilePurchaseAccess},
	}
	repo.phones["13800138000"] = repo.admins["13800138000"]

	logger := log.NewStdLogger(io.Discard)
	tp := tracesdk.NewTracerProvider()
	uc := NewAdminAuthUsecase(repo, func(input AdminTokenInput) (string, time.Time, error) {
		return "tok-admin-sms", time.Now().Add(time.Hour), nil
	}, nil, nil, logger, tp)

	challenge, err := uc.RequestSMSLoginCode(context.Background(), "13800138000", "purchase")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}

	token, _, admin, err := uc.LoginWithSMSCode(context.Background(), "13800138000", challenge.MockCode, "purchase")
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if token != "tok-admin-sms" {
		t.Fatalf("unexpected token: %s", token)
	}
	if admin == nil || admin.Username != "sms-admin" {
		t.Fatalf("unexpected admin: %+v", admin)
	}
	if repo.lastLogin[1].IsZero() {
		t.Fatalf("expected last login updated")
	}
}
