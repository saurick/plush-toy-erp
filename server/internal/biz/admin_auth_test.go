package biz

import (
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
)

type memAdminAuthRepo struct {
	mu                    sync.Mutex
	admins                map[string]*AdminUser
	phones                map[string]*AdminUser
	sessions              map[string]*AdminSession
	lastLogin             map[int]time.Time
	getAdminByIDErr       error
	getAdminByUsernameErr error
	getAdminSessionErr    error
	revokeAdminSessionErr error
	afterGetAdminByPhone  func()
}

type hookSMSLoginCodeProvider struct {
	verify func()
}

type recordingBizSMSLoginCodeProvider struct {
	delegate      SMSLoginCodeProvider
	requestPhones []string
}

func (p *recordingBizSMSLoginCodeProvider) Request(ctx context.Context, phone string) (*SMSLoginChallenge, error) {
	p.requestPhones = append(p.requestPhones, phone)
	return p.delegate.Request(ctx, phone)
}

func (p *recordingBizSMSLoginCodeProvider) Verify(ctx context.Context, phone, code string) (string, error) {
	return p.delegate.Verify(ctx, phone, code)
}

type errorSMSLoginCodeProvider struct {
	err error
}

func (p errorSMSLoginCodeProvider) Request(context.Context, string) (*SMSLoginChallenge, error) {
	return nil, p.err
}

func (p errorSMSLoginCodeProvider) Verify(context.Context, string, string) (string, error) {
	return "", p.err
}

func (p hookSMSLoginCodeProvider) Request(context.Context, string) (*SMSLoginChallenge, error) {
	return nil, errors.New("request not implemented")
}

func (p hookSMSLoginCodeProvider) Verify(_ context.Context, phone, _ string) (string, error) {
	if p.verify != nil {
		p.verify()
	}
	return phone, nil
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
	if r.getAdminByIDErr != nil {
		return nil, r.getAdminByIDErr
	}
	for _, admin := range r.admins {
		if admin.ID == id {
			cp := *admin
			return &cp, nil
		}
	}
	return nil, ErrUserNotFound
}

func (r *memAdminAuthRepo) CreateAdminSession(
	_ context.Context,
	session *AdminSession,
	constraint AdminSessionIssueConstraint,
) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	var admin *AdminUser
	for _, candidate := range r.admins {
		if candidate.ID == session.AdminUserID {
			admin = candidate
			break
		}
	}
	if admin == nil || !admin.IsActive() || admin.AuthVersion != session.AuthVersion {
		return ErrAuthVersionStale
	}
	if expectedPhone := strings.TrimSpace(constraint.ExpectedPhone); expectedPhone != "" {
		currentPhone, err := NormalizeLoginPhone(admin.Phone)
		if err != nil || currentPhone != expectedPhone {
			return ErrAuthVersionStale
		}
	}
	if requiredPermission := strings.TrimSpace(constraint.RequiredPermission); requiredPermission != "" && !AdminHasPermission(admin, requiredPermission) {
		return ErrMobileRoleDenied
	}
	cp := *session
	r.sessions[session.SessionKey] = &cp
	return nil
}

func (r *memAdminAuthRepo) GetAdminSession(_ context.Context, sessionKey string) (*AdminSession, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.getAdminSessionErr != nil {
		return nil, r.getAdminSessionErr
	}
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
	if r.revokeAdminSessionErr != nil {
		return r.revokeAdminSessionErr
	}
	if session := r.sessions[sessionKey]; session != nil {
		session.RevokedAt = &revokedAt
		session.RevokeReason = reason
	}
	return nil
}

func (r *memAdminAuthRepo) GetAdminByUsername(_ context.Context, username string) (*AdminUser, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.getAdminByUsernameErr != nil {
		return nil, r.getAdminByUsernameErr
	}

	admin := r.admins[username]
	if admin == nil {
		return nil, ErrUserNotFound
	}
	cp := *admin
	cp.Roles = append([]AdminRole(nil), admin.Roles...)
	cp.Permissions = append([]string(nil), admin.Permissions...)
	return &cp, nil
}

func TestAdminAuthUsecase_LoginUsesOnePasswordComparisonAndPreservesStorageErrors(t *testing.T) {
	t.Parallel()

	storageErr := errors.New("storage unavailable")
	tests := []struct {
		name             string
		admin            *AdminUser
		lookupErr        error
		compareErr       error
		wantErr          error
		wantCompareHash  string
		wantCompareCalls int
	}{
		{
			name:             "account not found",
			wantErr:          ErrUserNotFound,
			wantCompareHash:  dummyAdminPasswordHash,
			wantCompareCalls: 1,
		},
		{
			name:             "password invalid",
			admin:            &AdminUser{ID: 7, Username: "operator", PasswordHash: "stored-hash", AuthVersion: 1},
			compareErr:       errors.New("password mismatch"),
			wantErr:          ErrInvalidPassword,
			wantCompareHash:  "stored-hash",
			wantCompareCalls: 1,
		},
		{
			name:             "inactive account still compares password",
			admin:            &AdminUser{ID: 7, Username: "operator", PasswordHash: "stored-hash", AuthVersion: 1, Disabled: true},
			wantErr:          ErrUserDisabled,
			wantCompareHash:  "stored-hash",
			wantCompareCalls: 1,
		},
		{
			name:             "storage failure remains internal",
			lookupErr:        storageErr,
			wantErr:          storageErr,
			wantCompareHash:  dummyAdminPasswordHash,
			wantCompareCalls: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newMemAdminAuthRepo()
			if tt.admin != nil {
				repo.admins[tt.admin.Username] = tt.admin
			}
			repo.getAdminByUsernameErr = tt.lookupErr
			uc := NewAdminAuthUsecase(repo, nil, nil, nil, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
			compareCalls := 0
			comparedHash := ""
			uc.comparePassword = func(hash, password []byte) error {
				compareCalls++
				comparedHash = string(hash)
				if string(password) != "supplied-password" {
					t.Fatalf("password comparator input = %q", password)
				}
				return tt.compareErr
			}

			_, _, _, err := uc.Login(context.Background(), "operator", "supplied-password")
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("Login() error = %v, want %v", err, tt.wantErr)
			}
			if compareCalls != tt.wantCompareCalls || comparedHash != tt.wantCompareHash {
				t.Fatalf("password comparisons = %d hash=%q, want %d hash=%q", compareCalls, comparedHash, tt.wantCompareCalls, tt.wantCompareHash)
			}
		})
	}
}

func (r *memAdminAuthRepo) GetAdminByPhone(_ context.Context, phone string) (*AdminUser, error) {
	r.mu.Lock()
	admin := r.phones[phone]
	if admin == nil {
		r.mu.Unlock()
		return nil, errors.New("not found")
	}
	cp := *admin
	cp.Roles = append([]AdminRole(nil), admin.Roles...)
	cp.Permissions = append([]string(nil), admin.Permissions...)
	afterLookup := r.afterGetAdminByPhone
	r.afterGetAdminByPhone = nil
	r.mu.Unlock()
	if afterLookup != nil {
		afterLookup()
	}
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

func TestAdminAuthUsecase_SMSRequestDoesNotExposeAccountEligibility(t *testing.T) {
	repo := newMemAdminAuthRepo()
	eligible := &AdminUser{
		ID: 1, Username: "eligible", Phone: "13800138000", AuthVersion: 1,
		Roles: []AdminRole{{Key: PurchaseRoleKey}}, Permissions: []string{PermissionMobilePurchaseAccess},
	}
	disabled := &AdminUser{
		ID: 2, Username: "disabled", Phone: "13900139000", AuthVersion: 1, Disabled: true,
		Roles: []AdminRole{{Key: PurchaseRoleKey}}, Permissions: []string{PermissionMobilePurchaseAccess},
	}
	denied := &AdminUser{ID: 3, Username: "denied", Phone: "13700137000", AuthVersion: 1}
	for _, admin := range []*AdminUser{eligible, disabled, denied} {
		repo.admins[admin.Username] = admin
		repo.phones[admin.Phone] = admin
	}
	provider := &recordingBizSMSLoginCodeProvider{delegate: NewLocalSMSLoginCodeProvider("admin")}
	uc := NewAdminAuthUsecase(repo, nil, nil, provider, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())

	for _, phone := range []string{eligible.Phone, "13600136000", disabled.Phone, denied.Phone} {
		challenge, err := uc.RequestSMSLoginCode(context.Background(), phone, "purchase")
		if err != nil {
			t.Fatalf("RequestSMSLoginCode(%s) error = %v", phone, err)
		}
		if challenge == nil || challenge.Phone != phone || len(challenge.MockCode) != smsLoginCodeDigits || challenge.ExpiresAt.IsZero() || challenge.ResendAfter.IsZero() {
			t.Fatalf("RequestSMSLoginCode(%s) challenge = %#v", phone, challenge)
		}
	}
	if len(provider.requestPhones) != 1 || provider.requestPhones[0] != eligible.Phone {
		t.Fatalf("actual SMS requests = %#v, want eligible phone only", provider.requestPhones)
	}
}

func TestAdminAuthUsecase_SMSRequestSuppressesDeliveryFailures(t *testing.T) {
	repo := newMemAdminAuthRepo()
	admin := &AdminUser{ID: 1, Username: "eligible", Phone: "13800138000", AuthVersion: 1, IsSuperAdmin: true}
	repo.admins[admin.Username] = admin
	repo.phones[admin.Phone] = admin
	uc := NewAdminAuthUsecase(
		repo,
		nil,
		nil,
		errorSMSLoginCodeProvider{err: ErrSMSServiceUnavailable},
		log.NewStdLogger(io.Discard),
		tracesdk.NewTracerProvider(),
	)

	challenge, err := uc.RequestSMSLoginCode(context.Background(), admin.Phone, "purchase")
	if err != nil || challenge == nil || len(challenge.MockCode) != smsLoginCodeDigits {
		t.Fatalf("suppressed delivery failure challenge=%#v err=%v", challenge, err)
	}
}

func TestAdminAuthUsecase_SMSLoginVerifiesCodeBeforeAccountLookup(t *testing.T) {
	uc := NewAdminAuthUsecase(
		newMemAdminAuthRepo(),
		nil,
		nil,
		errorSMSLoginCodeProvider{err: ErrSMSCodeInvalid},
		log.NewStdLogger(io.Discard),
		tracesdk.NewTracerProvider(),
	)

	_, _, _, err := uc.LoginWithSMSCode(context.Background(), "13600136000", "000000", "purchase")
	if !errors.Is(err, ErrSMSCodeInvalid) {
		t.Fatalf("LoginWithSMSCode() error = %v, want verification failure before account lookup", err)
	}
}

func TestAdminAuthUsecase_SMSLoginRechecksAccountAfterCodeVerification(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		mutate  func(*AdminUser)
		wantErr error
	}{
		{
			name: "password reset advances auth version",
			mutate: func(admin *AdminUser) {
				admin.AuthVersion++
			},
			wantErr: ErrAuthVersionStale,
		},
		{
			name: "account disabled",
			mutate: func(admin *AdminUser) {
				admin.Disabled = true
				admin.AuthVersion++
			},
			wantErr: ErrUserDisabled,
		},
		{
			name: "account revoked",
			mutate: func(admin *AdminUser) {
				revokedAt := time.Now()
				admin.RevokedAt = &revokedAt
				admin.AuthVersion++
			},
			wantErr: ErrUserDisabled,
		},
		{
			name: "phone changed",
			mutate: func(admin *AdminUser) {
				admin.Phone = "13900139000"
			},
			wantErr: ErrAuthVersionStale,
		},
		{
			name: "mobile role removed",
			mutate: func(admin *AdminUser) {
				admin.Roles = nil
				admin.Permissions = nil
			},
			wantErr: ErrMobileRoleDenied,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newMemAdminAuthRepo()
			admin := &AdminUser{
				ID:          1,
				Username:    "sms-admin",
				Phone:       "13800138000",
				AuthVersion: 1,
				Roles:       []AdminRole{{Key: PurchaseRoleKey, Name: "采购"}},
				Permissions: []string{PermissionMobilePurchaseAccess},
			}
			repo.admins[admin.Username] = admin
			repo.phones[admin.Phone] = admin
			repo.afterGetAdminByPhone = func() { tt.mutate(admin) }
			tokenCalls := 0
			uc := NewAdminAuthUsecase(
				repo,
				func(AdminTokenInput) (string, time.Time, error) {
					tokenCalls++
					return "must-not-be-issued", time.Now().Add(time.Hour), nil
				},
				nil,
				hookSMSLoginCodeProvider{},
				log.NewStdLogger(io.Discard),
				tracesdk.NewTracerProvider(),
			)

			_, _, gotAdmin, err := uc.LoginWithSMSCode(
				context.Background(),
				"13800138000",
				"123456",
				"purchase",
			)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("LoginWithSMSCode() error = %v, want %v", err, tt.wantErr)
			}
			if gotAdmin != nil || tokenCalls != 0 || len(repo.sessions) != 0 {
				t.Fatalf("stale SMS login issued credentials: admin=%#v token_calls=%d sessions=%d", gotAdmin, tokenCalls, len(repo.sessions))
			}
		})
	}
}

func TestAdminAuthUsecase_SMSLoginSessionIssueChecksCurrentAccountAtomically(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		mutate  func(*AdminUser)
		wantErr error
	}{
		{
			name: "auth version changes before insert",
			mutate: func(admin *AdminUser) {
				admin.AuthVersion++
			},
			wantErr: ErrAuthVersionStale,
		},
		{
			name: "account is disabled before insert",
			mutate: func(admin *AdminUser) {
				admin.Disabled = true
				admin.AuthVersion++
			},
			wantErr: ErrAuthVersionStale,
		},
		{
			name: "phone changes before insert",
			mutate: func(admin *AdminUser) {
				admin.Phone = "13900139000"
			},
			wantErr: ErrAuthVersionStale,
		},
		{
			name: "mobile permission changes before insert",
			mutate: func(admin *AdminUser) {
				admin.Permissions = nil
			},
			wantErr: ErrMobileRoleDenied,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newMemAdminAuthRepo()
			admin := &AdminUser{
				ID:          1,
				Username:    "sms-admin",
				Phone:       "13800138000",
				AuthVersion: 1,
				Roles:       []AdminRole{{Key: PurchaseRoleKey, Name: "采购"}},
				Permissions: []string{PermissionMobilePurchaseAccess},
			}
			repo.admins[admin.Username] = admin
			repo.phones[admin.Phone] = admin
			tokenCalls := 0
			uc := NewAdminAuthUsecase(
				repo,
				func(AdminTokenInput) (string, time.Time, error) {
					tokenCalls++
					tt.mutate(admin)
					return "must-not-be-issued", time.Now().Add(time.Hour), nil
				},
				nil,
				hookSMSLoginCodeProvider{},
				log.NewStdLogger(io.Discard),
				tracesdk.NewTracerProvider(),
			)

			_, _, gotAdmin, err := uc.LoginWithSMSCode(
				context.Background(),
				"13800138000",
				"123456",
				"purchase",
			)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("LoginWithSMSCode() error = %v, want %v", err, tt.wantErr)
			}
			if gotAdmin != nil || tokenCalls != 1 || len(repo.sessions) != 0 {
				t.Fatalf("conditional session issue failed: admin=%#v token_calls=%d sessions=%d", gotAdmin, tokenCalls, len(repo.sessions))
			}
		})
	}
}

func TestAdminAuthUsecase_AuthenticateValidatesSessionAccountAndAuthVersion(t *testing.T) {
	t.Parallel()

	now := time.Now()
	baseAdmin := &AdminUser{
		ID:          7,
		Username:    "session-admin",
		AuthVersion: 3,
	}
	baseSession := &AdminSession{
		SessionKey:  "session-7",
		AdminUserID: 7,
		AuthVersion: 3,
		IssuedAt:    now.Add(-time.Minute),
		ExpiresAt:   now.Add(time.Hour),
	}
	baseClaims := &AuthClaims{UserID: 7, SessionKey: "session-7", AuthVersion: 3}
	storageUnavailable := errors.New("authentication storage unavailable")

	tests := []struct {
		name       string
		mutateRepo func(*memAdminAuthRepo)
		mutate     func(*AuthClaims)
		wantErr    error
	}{
		{name: "active session"},
		{
			name: "missing session",
			mutateRepo: func(repo *memAdminAuthRepo) {
				delete(repo.sessions, "session-7")
			},
			wantErr: ErrSessionNotFound,
		},
		{
			name: "session store unavailable",
			mutateRepo: func(repo *memAdminAuthRepo) {
				repo.getAdminSessionErr = storageUnavailable
			},
			wantErr: storageUnavailable,
		},
		{
			name: "revoked session",
			mutateRepo: func(repo *memAdminAuthRepo) {
				revokedAt := now
				repo.sessions["session-7"].RevokedAt = &revokedAt
			},
			wantErr: ErrSessionRevoked,
		},
		{
			name: "expired session",
			mutateRepo: func(repo *memAdminAuthRepo) {
				repo.sessions["session-7"].ExpiresAt = now.Add(-time.Minute)
			},
			wantErr: ErrSessionExpired,
		},
		{
			name: "session belongs to another account",
			mutateRepo: func(repo *memAdminAuthRepo) {
				repo.sessions["session-7"].AdminUserID = 8
			},
			wantErr: ErrAuthVersionStale,
		},
		{
			name: "session generation differs from token",
			mutateRepo: func(repo *memAdminAuthRepo) {
				repo.sessions["session-7"].AuthVersion = 2
			},
			wantErr: ErrAuthVersionStale,
		},
		{
			name: "account generation advanced",
			mutateRepo: func(repo *memAdminAuthRepo) {
				repo.admins["session-admin"].AuthVersion = 4
			},
			wantErr: ErrAuthVersionStale,
		},
		{
			name: "account store unavailable",
			mutateRepo: func(repo *memAdminAuthRepo) {
				repo.getAdminByIDErr = storageUnavailable
			},
			wantErr: storageUnavailable,
		},
		{
			name: "suspended account",
			mutateRepo: func(repo *memAdminAuthRepo) {
				repo.admins["session-admin"].Disabled = true
			},
			wantErr: ErrUserDisabled,
		},
		{
			name: "revoked account",
			mutateRepo: func(repo *memAdminAuthRepo) {
				revokedAt := now
				repo.admins["session-admin"].RevokedAt = &revokedAt
			},
			wantErr: ErrUserDisabled,
		},
		{
			name: "invalid token claims",
			mutate: func(claims *AuthClaims) {
				claims.SessionKey = ""
			},
			wantErr: ErrSessionNotFound,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newMemAdminAuthRepo()
			admin := *baseAdmin
			repo.admins[admin.Username] = &admin
			session := *baseSession
			repo.sessions[session.SessionKey] = &session
			if tt.mutateRepo != nil {
				tt.mutateRepo(repo)
			}
			claims := *baseClaims
			if tt.mutate != nil {
				tt.mutate(&claims)
			}
			uc := NewAdminAuthUsecase(
				repo,
				nil,
				func(string) (*AuthClaims, error) { return &claims, nil },
				nil,
				log.NewStdLogger(io.Discard),
				tracesdk.NewTracerProvider(),
			)

			gotClaims, gotAdmin, err := uc.Authenticate(context.Background(), "token")
			if tt.wantErr != nil {
				if !errors.Is(err, tt.wantErr) {
					t.Fatalf("Authenticate() error = %v, want %v", err, tt.wantErr)
				}
				if gotClaims != nil || gotAdmin != nil {
					t.Fatalf("Authenticate() returned data on failure: claims=%#v admin=%#v", gotClaims, gotAdmin)
				}
				return
			}
			if err != nil {
				t.Fatalf("Authenticate() error = %v", err)
			}
			if gotClaims == nil || gotClaims.Username != admin.Username || gotClaims.Role != RoleAdmin {
				t.Fatalf("Authenticate() claims = %#v", gotClaims)
			}
			if gotAdmin == nil || gotAdmin.ID != admin.ID {
				t.Fatalf("Authenticate() admin = %#v", gotAdmin)
			}
		})
	}
}

func TestAdminAuthUsecase_LogoutRevokesOnlyRequestedSession(t *testing.T) {
	t.Parallel()

	repo := newMemAdminAuthRepo()
	now := time.Now()
	repo.sessions["current"] = &AdminSession{
		SessionKey: "current", AdminUserID: 9, AuthVersion: 1,
		IssuedAt: now, ExpiresAt: now.Add(time.Hour),
	}
	repo.sessions["other"] = &AdminSession{
		SessionKey: "other", AdminUserID: 9, AuthVersion: 1,
		IssuedAt: now, ExpiresAt: now.Add(time.Hour),
	}
	uc := NewAdminAuthUsecase(repo, nil, nil, nil, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())

	if err := uc.Logout(context.Background(), "current"); err != nil {
		t.Fatalf("Logout() error = %v", err)
	}
	if repo.sessions["current"].RevokedAt == nil || repo.sessions["current"].RevokeReason != "logout" {
		t.Fatalf("current session not revoked: %#v", repo.sessions["current"])
	}
	if repo.sessions["other"].RevokedAt != nil {
		t.Fatalf("other session was revoked: %#v", repo.sessions["other"])
	}
	storageUnavailable := errors.New("authentication storage unavailable")
	repo.revokeAdminSessionErr = storageUnavailable
	if err := uc.Logout(context.Background(), "other"); !errors.Is(err, storageUnavailable) {
		t.Fatalf("Logout() storage error = %v, want %v", err, storageUnavailable)
	}
	if repo.sessions["other"].RevokedAt != nil {
		t.Fatalf("failed logout revoked session: %#v", repo.sessions["other"])
	}
	repo.revokeAdminSessionErr = nil
	if err := uc.Logout(context.Background(), ""); err != nil {
		t.Fatalf("empty Logout() error = %v", err)
	}
}
