// server/internal/biz/admin_auth.go
package biz

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/google/uuid"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/crypto/bcrypt"
)

type AdminAuthRepo interface {
	AdminAccountReader
	GetAdminByUsername(ctx context.Context, username string) (*AdminUser, error)
	GetAdminByPhone(ctx context.Context, phone string) (*AdminUser, error)
	UpdateAdminLastLogin(ctx context.Context, id int, t time.Time) error
	CreateAdminSession(ctx context.Context, session *AdminSession) error
	GetAdminSession(ctx context.Context, sessionKey string) (*AdminSession, error)
	RevokeAdminSession(ctx context.Context, sessionKey, reason string, revokedAt time.Time) error
}

type AdminAccountReader interface {
	GetAdminByID(ctx context.Context, id int) (*AdminUser, error)
}

type AdminUser struct {
	ID              int
	Username        string
	Phone           string
	PasswordHash    string
	IsSuperAdmin    bool
	Roles           []AdminRole
	Permissions     []string
	ERPPreferences  AdminERPPreferences
	Disabled        bool
	AuthVersion     int64
	RevokedAt       *time.Time
	StatusReason    string
	StatusChangedAt *time.Time
	StatusChangedBy *int
	LastLoginAt     *time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type AdminSession struct {
	SessionKey   string
	AdminUserID  int
	AuthVersion  int64
	IssuedAt     time.Time
	ExpiresAt    time.Time
	RevokedAt    *time.Time
	RevokeReason string
}

type AdminAccountStatus string

const (
	AdminAccountStatusActive    AdminAccountStatus = "active"
	AdminAccountStatusSuspended AdminAccountStatus = "suspended"
	AdminAccountStatusRevoked   AdminAccountStatus = "revoked"
)

func (a *AdminUser) AccountStatus() AdminAccountStatus {
	if a != nil && a.RevokedAt != nil {
		return AdminAccountStatusRevoked
	}
	if a != nil && a.Disabled {
		return AdminAccountStatusSuspended
	}
	return AdminAccountStatusActive
}

func (a *AdminUser) IsActive() bool {
	return a != nil && a.AccountStatus() == AdminAccountStatusActive
}

type AdminAuthUsecase struct {
	log      *log.Helper
	logger   log.Logger
	tp       *tracesdk.TracerProvider
	tracer   trace.Tracer
	repo     AdminAuthRepo
	genTok   AdminTokenGenerator
	parseTok AdminTokenParser
	smsCodes SMSLoginCodeProvider
}

func NewAdminAuthUsecase(repo AdminAuthRepo, genTok AdminTokenGenerator, parseTok AdminTokenParser, smsCodes SMSLoginCodeProvider, logger log.Logger, tp *tracesdk.TracerProvider) *AdminAuthUsecase {
	helper := log.NewHelper(log.With(logger, "module", "biz.admin_auth"))

	var tr trace.Tracer
	if tp != nil {
		tr = tp.Tracer("biz.admin_auth")
	} else {
		tr = otel.Tracer("biz.admin_auth")
	}
	if smsCodes == nil {
		smsCodes = NewLocalSMSLoginCodeProvider("admin")
	}

	return &AdminAuthUsecase{
		repo:     repo,
		genTok:   genTok,
		parseTok: parseTok,
		smsCodes: smsCodes,
		log:      helper,
		logger:   logger,
		tp:       tp,
		tracer:   tr,
	}
}

func (uc *AdminAuthUsecase) createSessionToken(ctx context.Context, admin *AdminUser) (string, time.Time, error) {
	if admin == nil || admin.ID <= 0 || admin.AuthVersion <= 0 {
		return "", time.Time{}, ErrUserNotFound
	}
	now := time.Now()
	sessionKey := uuid.NewString()
	token, expiresAt, err := uc.genTok(AdminTokenInput{
		UserID: admin.ID, SessionKey: sessionKey, AuthVersion: admin.AuthVersion, IssuedAt: now,
	})
	if err != nil {
		return "", time.Time{}, err
	}
	if err := uc.repo.CreateAdminSession(ctx, &AdminSession{
		SessionKey: sessionKey, AdminUserID: admin.ID, AuthVersion: admin.AuthVersion,
		IssuedAt: now, ExpiresAt: expiresAt,
	}); err != nil {
		return "", time.Time{}, err
	}
	return token, expiresAt, nil
}

func (uc *AdminAuthUsecase) Authenticate(ctx context.Context, rawToken string) (*AuthClaims, *AdminUser, error) {
	if uc == nil || uc.parseTok == nil {
		return nil, nil, ErrSessionNotFound
	}
	claims, err := uc.parseTok(strings.TrimSpace(rawToken))
	if err != nil || claims == nil || claims.UserID <= 0 || claims.SessionKey == "" || claims.AuthVersion <= 0 {
		return nil, nil, err
	}
	session, err := uc.repo.GetAdminSession(ctx, claims.SessionKey)
	if err != nil || session == nil {
		return nil, nil, ErrSessionNotFound
	}
	now := time.Now()
	if session.RevokedAt != nil {
		return nil, nil, ErrSessionRevoked
	}
	if !session.ExpiresAt.After(now) {
		return nil, nil, ErrSessionExpired
	}
	if session.AdminUserID != claims.UserID || session.AuthVersion != claims.AuthVersion {
		return nil, nil, ErrAuthVersionStale
	}
	admin, err := uc.repo.GetAdminByID(ctx, claims.UserID)
	if err != nil || admin == nil {
		return nil, nil, ErrUserNotFound
	}
	if !admin.IsActive() {
		return nil, nil, ErrUserDisabled
	}
	if admin.AuthVersion != claims.AuthVersion {
		return nil, nil, ErrAuthVersionStale
	}
	claims.Username = admin.Username
	claims.Role = RoleAdmin
	return claims, admin, nil
}

func (uc *AdminAuthUsecase) Logout(ctx context.Context, sessionKey string) error {
	if strings.TrimSpace(sessionKey) == "" {
		return nil
	}
	return uc.repo.RevokeAdminSession(ctx, sessionKey, "logout", time.Now())
}

func (uc *AdminAuthUsecase) Tracer(opts ...trace.TracerOption) trace.Tracer {
	if uc.tracer != nil {
		return uc.tracer
	}
	return otel.Tracer("biz.admin_auth", opts...)
}

func (uc *AdminAuthUsecase) Login(ctx context.Context, username, password string) (token string, expireAt time.Time, u *AdminUser, err error) {
	ctx, span := uc.Tracer().Start(ctx, "admin_auth.login")
	defer span.End()

	l := uc.log.WithContext(ctx)

	if username == "" || password == "" {
		err = errors.New("missing username or password")
		span.RecordError(err)
		span.SetStatus(codes.Error, "invalid argument")
		l.Warnf("Login invalid args username=%q", username)
		return "", time.Time{}, nil, err
	}

	admin, e := uc.repo.GetAdminByUsername(ctx, username)
	if e != nil || admin == nil {
		err = ErrUserNotFound
		span.RecordError(e)
		span.SetStatus(codes.Error, err.Error())
		l.Infof("Login admin not found username=%s err=%v", username, e)
		return "", time.Time{}, nil, err
	}

	span.SetAttributes(attribute.Int("admin_auth.admin_id", admin.ID))

	if !admin.IsActive() {
		err = ErrUserDisabled
		span.SetStatus(codes.Error, err.Error())
		l.Infof("Login admin disabled admin_id=%d username=%s", admin.ID, username)
		return "", time.Time{}, nil, err
	}

	if bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(password)) != nil {
		err = ErrInvalidPassword
		span.SetStatus(codes.Error, err.Error())
		l.Infof("Login admin invalid password admin_id=%d username=%s", admin.ID, username)
		return "", time.Time{}, nil, err
	}

	token, expireAt, e = uc.createSessionToken(ctx, admin)
	if e != nil {
		err = e
		span.RecordError(err)
		span.SetStatus(codes.Error, "generate token failed")
		l.Errorf("Login admin generate token failed admin_id=%d username=%s err=%v", admin.ID, admin.Username, err)
		return "", time.Time{}, nil, err
	}

	span.SetAttributes(attribute.Int64("admin_auth.token_expires_at", expireAt.Unix()))

	if e := uc.repo.UpdateAdminLastLogin(ctx, admin.ID, time.Now()); e != nil {
		span.RecordError(e)
		l.Warnf("Login admin update last_login_at failed admin_id=%d err=%v", admin.ID, e)
	}

	span.SetStatus(codes.Ok, "OK")
	l.Infof("Login admin success admin_id=%d username=%s", admin.ID, admin.Username)

	return token, expireAt, admin, nil
}

func (uc *AdminAuthUsecase) RequestSMSLoginCode(ctx context.Context, phone, mobileRoleKey string) (challenge *SMSLoginChallenge, err error) {
	normalizedPhone, err := NormalizeLoginPhone(phone)
	if err != nil {
		return nil, err
	}
	mobileRoleKey = strings.TrimSpace(mobileRoleKey)

	ctx, span := uc.Tracer().Start(ctx, "admin_auth.request_sms_login_code",
		trace.WithAttributes(attribute.String("admin_auth.phone_masked", maskPhone(normalizedPhone))),
	)
	defer span.End()

	l := uc.log.WithContext(ctx)
	admin, e := uc.repo.GetAdminByPhone(ctx, normalizedPhone)
	if e != nil || admin == nil {
		err = ErrPhoneNotBound
		if e != nil {
			span.RecordError(e)
		}
		span.SetStatus(codes.Error, err.Error())
		l.Infof("RequestSMSLoginCode admin not found phone=%s err=%v", maskPhone(normalizedPhone), e)
		return nil, err
	}
	if !admin.IsActive() {
		err = ErrUserDisabled
		span.SetStatus(codes.Error, err.Error())
		l.Infof("RequestSMSLoginCode admin disabled admin_id=%d phone=%s", admin.ID, maskPhone(normalizedPhone))
		return nil, err
	}
	if !AdminCanAccessMobileRole(admin, mobileRoleKey) {
		err = ErrMobileRoleDenied
		span.SetStatus(codes.Error, err.Error())
		l.Infof("RequestSMSLoginCode admin mobile role denied admin_id=%d phone=%s mobile_role_key=%s", admin.ID, maskPhone(normalizedPhone), mobileRoleKey)
		return nil, err
	}

	challenge, err = uc.smsCodes.Request(ctx, normalizedPhone)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		l.Warnf("RequestSMSLoginCode admin failed phone=%s err=%v", maskPhone(normalizedPhone), err)
		return nil, err
	}

	span.SetAttributes(
		attribute.Int("admin_auth.admin_id", admin.ID),
		attribute.Int64("admin_auth.sms_expires_at", challenge.ExpiresAt.Unix()),
	)
	span.SetStatus(codes.Ok, "OK")
	l.Infof("RequestSMSLoginCode admin success admin_id=%d phone=%s mock_delivery=%t", admin.ID, maskPhone(normalizedPhone), challenge.MockDelivery)
	return challenge, nil
}

func (uc *AdminAuthUsecase) LoginWithSMSCode(ctx context.Context, phone, code, mobileRoleKey string) (token string, expireAt time.Time, u *AdminUser, err error) {
	normalizedPhone, err := NormalizeLoginPhone(phone)
	if err != nil {
		return "", time.Time{}, nil, err
	}
	mobileRoleKey = strings.TrimSpace(mobileRoleKey)

	ctx, span := uc.Tracer().Start(ctx, "admin_auth.sms_login",
		trace.WithAttributes(attribute.String("admin_auth.phone_masked", maskPhone(normalizedPhone))),
	)
	defer span.End()

	l := uc.log.WithContext(ctx)
	admin, e := uc.repo.GetAdminByPhone(ctx, normalizedPhone)
	if e != nil || admin == nil {
		err = ErrPhoneNotBound
		if e != nil {
			span.RecordError(e)
		}
		span.SetStatus(codes.Error, err.Error())
		l.Infof("SMSLogin admin not found phone=%s err=%v", maskPhone(normalizedPhone), e)
		return "", time.Time{}, nil, err
	}

	span.SetAttributes(attribute.Int("admin_auth.admin_id", admin.ID))

	if !admin.IsActive() {
		err = ErrUserDisabled
		span.SetStatus(codes.Error, err.Error())
		l.Infof("SMSLogin admin disabled admin_id=%d phone=%s", admin.ID, maskPhone(normalizedPhone))
		return "", time.Time{}, nil, err
	}
	if !AdminCanAccessMobileRole(admin, mobileRoleKey) {
		err = ErrMobileRoleDenied
		span.SetStatus(codes.Error, err.Error())
		l.Infof("SMSLogin admin mobile role denied admin_id=%d phone=%s mobile_role_key=%s", admin.ID, maskPhone(normalizedPhone), mobileRoleKey)
		return "", time.Time{}, nil, err
	}

	if _, err = uc.smsCodes.Verify(ctx, normalizedPhone, code); err != nil {
		span.SetStatus(codes.Error, err.Error())
		l.Infof("SMSLogin admin verify failed admin_id=%d phone=%s err=%v", admin.ID, maskPhone(normalizedPhone), err)
		return "", time.Time{}, nil, err
	}

	token, expireAt, e = uc.createSessionToken(ctx, admin)
	if e != nil {
		err = e
		span.RecordError(err)
		span.SetStatus(codes.Error, "generate token failed")
		l.Errorf("SMSLogin admin generate token failed admin_id=%d username=%s err=%v", admin.ID, admin.Username, err)
		return "", time.Time{}, nil, err
	}

	span.SetAttributes(attribute.Int64("admin_auth.token_expires_at", expireAt.Unix()))

	if e := uc.repo.UpdateAdminLastLogin(ctx, admin.ID, time.Now()); e != nil {
		span.RecordError(e)
		l.Warnf("SMSLogin admin update last_login_at failed admin_id=%d err=%v", admin.ID, e)
	}

	span.SetStatus(codes.Ok, "OK")
	l.Infof("SMSLogin admin success admin_id=%d phone=%s", admin.ID, maskPhone(normalizedPhone))
	return token, expireAt, admin, nil
}
