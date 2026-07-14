package server

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/conf"
	"server/internal/data"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/go-kratos/kratos/v2/transport"
)

type authMiddlewareRepo struct {
	admin      *biz.AdminUser
	session    *biz.AdminSession
	sessionErr error
}

func (r *authMiddlewareRepo) GetAdminByID(_ context.Context, id int) (*biz.AdminUser, error) {
	if r.admin == nil || r.admin.ID != id {
		return nil, biz.ErrUserNotFound
	}
	return r.admin, nil
}

func (r *authMiddlewareRepo) GetAdminByUsername(_ context.Context, username string) (*biz.AdminUser, error) {
	if r.admin == nil || r.admin.Username != username {
		return nil, biz.ErrUserNotFound
	}
	return r.admin, nil
}

func (r *authMiddlewareRepo) GetAdminByPhone(_ context.Context, phone string) (*biz.AdminUser, error) {
	if r.admin == nil || r.admin.Phone != phone {
		return nil, biz.ErrUserNotFound
	}
	return r.admin, nil
}

func (*authMiddlewareRepo) UpdateAdminLastLogin(context.Context, int, time.Time) error {
	return nil
}

func (r *authMiddlewareRepo) CreateAdminSession(_ context.Context, session *biz.AdminSession, _ biz.AdminSessionIssueConstraint) error {
	r.session = session
	return nil
}

func (r *authMiddlewareRepo) GetAdminSession(_ context.Context, sessionKey string) (*biz.AdminSession, error) {
	if r.sessionErr != nil {
		return nil, r.sessionErr
	}
	if r.session == nil || r.session.SessionKey != sessionKey {
		return nil, biz.ErrSessionNotFound
	}
	return r.session, nil
}

func (r *authMiddlewareRepo) RevokeAdminSession(_ context.Context, sessionKey, reason string, revokedAt time.Time) error {
	if r.session == nil || r.session.SessionKey != sessionKey {
		return biz.ErrSessionNotFound
	}
	r.session.RevokedAt = &revokedAt
	r.session.RevokeReason = reason
	return nil
}

type authMiddlewareHeader http.Header

func (h authMiddlewareHeader) Get(key string) string {
	return http.Header(h).Get(key)
}

func (h authMiddlewareHeader) Set(key, value string) {
	http.Header(h).Set(key, value)
}

func (h authMiddlewareHeader) Add(key, value string) {
	http.Header(h).Add(key, value)
}

func (h authMiddlewareHeader) Keys() []string {
	keys := make([]string, 0, len(h))
	for key := range h {
		keys = append(keys, key)
	}
	return keys
}

func (h authMiddlewareHeader) Values(key string) []string {
	return http.Header(h).Values(key)
}

type authMiddlewareTransport struct {
	requestHeader authMiddlewareHeader
	replyHeader   authMiddlewareHeader
}

func (*authMiddlewareTransport) Kind() transport.Kind { return transport.KindHTTP }
func (*authMiddlewareTransport) Endpoint() string     { return "http://localhost/rpc" }
func (*authMiddlewareTransport) Operation() string    { return "/erp.v1.JsonrpcService/Jsonrpc" }
func (t *authMiddlewareTransport) RequestHeader() transport.Header {
	return t.requestHeader
}
func (t *authMiddlewareTransport) ReplyHeader() transport.Header { return t.replyHeader }

type authMiddlewareLogEntry struct {
	level   log.Level
	keyvals []any
}

type authMiddlewareCaptureLogger struct {
	entries []authMiddlewareLogEntry
}

func (l *authMiddlewareCaptureLogger) Log(level log.Level, keyvals ...any) error {
	l.entries = append(l.entries, authMiddlewareLogEntry{
		level:   level,
		keyvals: append([]any(nil), keyvals...),
	})
	return nil
}

func (l *authMiddlewareCaptureLogger) latestValue(key string) (any, bool) {
	for entryIndex := len(l.entries) - 1; entryIndex >= 0; entryIndex-- {
		entry := l.entries[entryIndex]
		for i := 0; i+1 < len(entry.keyvals); i += 2 {
			if fmt.Sprint(entry.keyvals[i]) == key {
				return entry.keyvals[i+1], true
			}
		}
	}
	return nil, false
}

func (l *authMiddlewareCaptureLogger) containsValue(value string) bool {
	for _, entry := range l.entries {
		for _, field := range entry.keyvals {
			if fmt.Sprint(field) == value {
				return true
			}
		}
	}
	return false
}

type authMiddlewareFixture struct {
	repo  *authMiddlewareRepo
	auth  *biz.AdminAuthUsecase
	token string
}

func newAuthMiddlewareFixture(t *testing.T, issuedAt, tokenExpiresAt time.Time) *authMiddlewareFixture {
	t.Helper()

	logger := log.NewStdLogger(io.Discard)
	config := &conf.Data{Auth: &conf.Data_Auth{
		JwtSecret:        "auth-middleware-contract-secret",
		JwtExpireSeconds: 3600,
	}}
	generator := data.NewAdminTokenGenerator(config, logger)
	parser := data.NewAdminTokenParser(config)

	const (
		adminID     = 17
		sessionKey  = "session-auth-middleware-17"
		authVersion = int64(3)
	)
	token, _, err := generator(biz.AdminTokenInput{
		UserID:      adminID,
		SessionKey:  sessionKey,
		AuthVersion: authVersion,
		IssuedAt:    issuedAt,
		ExpiresAt:   tokenExpiresAt,
	})
	if err != nil {
		t.Fatalf("generate real admin JWT: %v", err)
	}

	repo := &authMiddlewareRepo{
		admin: &biz.AdminUser{
			ID:          adminID,
			Username:    "middleware-admin",
			Phone:       "13800000017",
			AuthVersion: authVersion,
			Roles:       []biz.AdminRole{{Key: "business_manager", Name: "业务管理员"}},
			Permissions: []string{"system.user.read"},
		},
		session: &biz.AdminSession{
			SessionKey:  sessionKey,
			AdminUserID: adminID,
			AuthVersion: authVersion,
			IssuedAt:    issuedAt,
			ExpiresAt:   tokenExpiresAt,
		},
	}
	return &authMiddlewareFixture{
		repo:  repo,
		auth:  biz.NewAdminAuthUsecase(repo, generator, parser, nil, logger, nil),
		token: token,
	}
}

func runAuthMiddleware(t *testing.T, auth *biz.AdminAuthUsecase, logger log.Logger, token string) context.Context {
	t.Helper()

	tr := &authMiddlewareTransport{
		requestHeader: authMiddlewareHeader(http.Header{
			"Authorization": []string{"Bearer " + token},
		}),
		replyHeader: authMiddlewareHeader(http.Header{}),
	}
	requestContext := transport.NewServerContext(context.Background(), tr)
	var handlerContext context.Context
	handler := AuthClaimsMiddleware(auth, logger)(func(ctx context.Context, req any) (any, error) {
		handlerContext = ctx
		return req, nil
	})
	response, err := handler(requestContext, "request")
	if err != nil {
		t.Fatalf("run auth middleware: %v", err)
	}
	if response != "request" {
		t.Fatalf("unexpected middleware response: %v", response)
	}
	if handlerContext == nil {
		t.Fatal("downstream handler did not receive a context")
	}
	return handlerContext
}

func TestAuthClaimsMiddlewareRealJWTSessionChainInjectsVerifiedAdmin(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	fixture := newAuthMiddlewareFixture(t, now.Add(-time.Minute), now.Add(time.Hour))

	ctx := runAuthMiddleware(t, fixture.auth, log.NewStdLogger(io.Discard), fixture.token)
	if state := biz.AuthStateFrom(ctx); state != biz.AuthOK {
		t.Fatalf("auth state = %v, want AuthOK", state)
	}
	claims, ok := biz.GetClaimsFromContext(ctx)
	if !ok || claims == nil {
		t.Fatal("verified claims missing from downstream context")
	}
	if claims.UserID != fixture.repo.admin.ID || claims.SessionKey != fixture.repo.session.SessionKey || claims.AuthVersion != fixture.repo.admin.AuthVersion {
		t.Fatalf("unexpected verified claims: %+v", claims)
	}
	if claims.Username != fixture.repo.admin.Username || claims.Role != biz.RoleAdmin {
		t.Fatalf("authenticated account projection not applied: %+v", claims)
	}
	admin, ok := biz.GetCurrentAdminFromContext(ctx)
	if !ok || admin == nil {
		t.Fatal("verified administrator missing from downstream context")
	}
	if admin.ID != fixture.repo.admin.ID || len(admin.Permissions) != 1 || admin.Permissions[0] != "system.user.read" {
		t.Fatalf("unexpected verified administrator: %+v", admin)
	}
}

func TestAuthClaimsMiddlewareRealJWTSessionChainRejectsInvalidStates(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	tests := []struct {
		name       string
		issuedAt   time.Time
		tokenUntil time.Time
		mutate     func(*authMiddlewareFixture)
		wantState  biz.AuthState
		wantReason adminAuthFailureReason
	}{
		{
			name:       "session revoked",
			issuedAt:   now.Add(-time.Minute),
			tokenUntil: now.Add(time.Hour),
			mutate: func(fixture *authMiddlewareFixture) {
				revokedAt := now
				fixture.repo.session.RevokedAt = &revokedAt
			},
			wantState:  biz.AuthInvalid,
			wantReason: adminAuthFailureSessionRevoked,
		},
		{
			name:       "session expired",
			issuedAt:   now.Add(-time.Minute),
			tokenUntil: now.Add(time.Hour),
			mutate: func(fixture *authMiddlewareFixture) {
				fixture.repo.session.ExpiresAt = now.Add(-time.Second)
			},
			wantState:  biz.AuthExpired,
			wantReason: adminAuthFailureSessionExpired,
		},
		{
			name:       "auth version mismatch",
			issuedAt:   now.Add(-time.Minute),
			tokenUntil: now.Add(time.Hour),
			mutate: func(fixture *authMiddlewareFixture) {
				fixture.repo.admin.AuthVersion++
			},
			wantState:  biz.AuthInvalid,
			wantReason: adminAuthFailureAuthVersionStale,
		},
		{
			name:       "disabled administrator",
			issuedAt:   now.Add(-time.Minute),
			tokenUntil: now.Add(time.Hour),
			mutate: func(fixture *authMiddlewareFixture) {
				fixture.repo.admin.Disabled = true
			},
			wantState:  biz.AuthInvalid,
			wantReason: adminAuthFailureAccountInactive,
		},
		{
			name:       "revoked administrator",
			issuedAt:   now.Add(-time.Minute),
			tokenUntil: now.Add(time.Hour),
			mutate: func(fixture *authMiddlewareFixture) {
				revokedAt := now
				fixture.repo.admin.RevokedAt = &revokedAt
			},
			wantState:  biz.AuthInvalid,
			wantReason: adminAuthFailureAccountInactive,
		},
		{
			name:       "expired JWT",
			issuedAt:   now.Add(-2 * time.Hour),
			tokenUntil: now.Add(-time.Hour),
			mutate: func(fixture *authMiddlewareFixture) {
				fixture.repo.session.ExpiresAt = now.Add(time.Hour)
			},
			wantState:  biz.AuthExpired,
			wantReason: adminAuthFailureTokenExpired,
		},
		{
			name:       "malformed JWT",
			issuedAt:   now.Add(-time.Minute),
			tokenUntil: now.Add(time.Hour),
			mutate: func(fixture *authMiddlewareFixture) {
				fixture.token = "not-a-jwt"
			},
			wantState:  biz.AuthInvalid,
			wantReason: adminAuthFailureTokenInvalid,
		},
		{
			name:       "authentication backend unavailable",
			issuedAt:   now.Add(-time.Minute),
			tokenUntil: now.Add(time.Hour),
			mutate: func(fixture *authMiddlewareFixture) {
				fixture.repo.sessionErr = errors.New("session storage unavailable")
			},
			wantState:  biz.AuthUnavailable,
			wantReason: adminAuthFailureBackendError,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fixture := newAuthMiddlewareFixture(t, tt.issuedAt, tt.tokenUntil)
			tt.mutate(fixture)
			capture := &authMiddlewareCaptureLogger{}

			ctx := runAuthMiddleware(t, fixture.auth, capture, fixture.token)
			if state := biz.AuthStateFrom(ctx); state != tt.wantState {
				t.Fatalf("auth state = %v, want %v", state, tt.wantState)
			}
			if claims, ok := biz.GetClaimsFromContext(ctx); ok || claims != nil {
				t.Fatalf("unverified claims leaked to downstream context: %+v", claims)
			}
			if admin, ok := biz.GetCurrentAdminFromContext(ctx); ok || admin != nil {
				t.Fatalf("unverified administrator leaked to downstream context: %+v", admin)
			}
			reason, ok := capture.latestValue("reason")
			if !ok || fmt.Sprint(reason) != string(tt.wantReason) {
				t.Fatalf("structured failure reason = %v, want %q; logs=%+v", reason, tt.wantReason, capture.entries)
			}
			if capture.containsValue(fixture.token) {
				t.Fatal("raw JWT must not be written to authentication logs")
			}
		})
	}
}
