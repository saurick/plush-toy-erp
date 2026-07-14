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

const dummyAdminPasswordHash = "$2a$10$Kc6eV.QK.PvLk6HhBySgz.mI3aMIbdKper1j8IcyBuOnx1HcCkDLa"

type AdminAuthRepo interface {
	AdminAccountReader
	GetAdminByUsername(ctx context.Context, username string) (*AdminUser, error)
	GetAdminByPhone(ctx context.Context, phone string) (*AdminUser, error)
	UpdateAdminLastLogin(ctx context.Context, id int, t time.Time) error
	CreateAdminSession(ctx context.Context, session *AdminSession, constraint AdminSessionIssueConstraint) error
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

type AdminSessionIssueConstraint struct {
	ExpectedPhone      string
	RequiredPermission string
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
	log             *log.Helper
	logger          log.Logger
	tp              *tracesdk.TracerProvider
	tracer          trace.Tracer
	repo            AdminAuthRepo
	genTok          AdminTokenGenerator
	parseTok        AdminTokenParser
	smsCodes        SMSLoginCodeProvider
	comparePassword func(hashedPassword, password []byte) error
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
		repo:            repo,
		genTok:          genTok,
		parseTok:        parseTok,
		smsCodes:        smsCodes,
		log:             helper,
		logger:          logger,
		tp:              tp,
		tracer:          tr,
		comparePassword: bcrypt.CompareHashAndPassword,
	}
}

func (uc *AdminAuthUsecase) compareAdminPassword(hashedPassword, password []byte) error {
	if uc != nil && uc.comparePassword != nil {
		return uc.comparePassword(hashedPassword, password)
	}
	return bcrypt.CompareHashAndPassword(hashedPassword, password)
}

func newDecoySMSLoginChallenge(phone string) (*SMSLoginChallenge, error) {
	code, err := generateSMSLoginCode()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	return &SMSLoginChallenge{
		Phone:        phone,
		ExpiresAt:    now.Add(smsLoginCodeTTL),
		ResendAfter:  now.Add(smsLoginCodeCooldown),
		MockDelivery: true,
		MockCode:     code,
	}, nil
}

func (uc *AdminAuthUsecase) createSessionToken(
	ctx context.Context,
	admin *AdminUser,
	constraint AdminSessionIssueConstraint,
) (string, time.Time, error) {
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
	}, constraint); err != nil {
		return "", time.Time{}, err
	}
	return token, expiresAt, nil
}

func (uc *AdminAuthUsecase) Authenticate(ctx context.Context, rawToken string) (*AuthClaims, *AdminUser, error) {
	if uc == nil || uc.parseTok == nil {
		return nil, nil, ErrSessionNotFound
	}
	claims, err := uc.parseTok(strings.TrimSpace(rawToken))
	if err != nil {
		return nil, nil, err
	}
	if claims == nil || claims.UserID <= 0 || claims.SessionKey == "" || claims.AuthVersion <= 0 {
		return nil, nil, ErrSessionNotFound
	}
	session, err := uc.repo.GetAdminSession(ctx, claims.SessionKey)
	if err != nil {
		if errors.Is(err, ErrSessionNotFound) {
			return nil, nil, ErrSessionNotFound
		}
		return nil, nil, err
	}
	if session == nil {
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
	if err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return nil, nil, ErrUserNotFound
		}
		return nil, nil, err
	}
	if admin == nil {
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
		l.Warn("Login invalid args reason=missing_credentials")
		return "", time.Time{}, nil, err
	}

	admin, e := uc.repo.GetAdminByUsername(ctx, username)
	if e != nil || admin == nil {
		_ = uc.compareAdminPassword([]byte(dummyAdminPasswordHash), []byte(password))
		if e != nil && !errors.Is(e, ErrUserNotFound) {
			err = e
			span.RecordError(err)
			span.SetStatus(codes.Error, "account lookup failed")
			l.Errorf("Login admin lookup failed err=%v", err)
			return "", time.Time{}, nil, err
		}
		err = ErrUserNotFound
		span.SetStatus(codes.Error, err.Error())
		l.Info("Login admin rejected reason=account_not_found")
		return "", time.Time{}, nil, err
	}

	span.SetAttributes(attribute.Int("admin_auth.admin_id", admin.ID))

	if uc.compareAdminPassword([]byte(admin.PasswordHash), []byte(password)) != nil {
		err = ErrInvalidPassword
		span.SetStatus(codes.Error, err.Error())
		l.Infof("Login admin rejected admin_id=%d reason=password_invalid", admin.ID)
		return "", time.Time{}, nil, err
	}
	if !admin.IsActive() {
		err = ErrUserDisabled
		span.SetStatus(codes.Error, err.Error())
		l.Infof("Login admin rejected admin_id=%d reason=account_inactive", admin.ID)
		return "", time.Time{}, nil, err
	}

	credentialAuthVersion := admin.AuthVersion
	credentialPasswordHash := admin.PasswordHash
	admin, e = uc.repo.GetAdminByID(ctx, admin.ID)
	if e != nil {
		err = e
		span.RecordError(err)
		span.SetStatus(codes.Error, "account reload failed")
		l.Errorf("Login admin reload failed err=%v", err)
		return "", time.Time{}, nil, err
	}
	if admin == nil {
		err = ErrUserNotFound
		span.SetStatus(codes.Error, err.Error())
		l.Info("Login admin rejected reason=account_not_found_after_credentials")
		return "", time.Time{}, nil, err
	}
	if admin.AuthVersion != credentialAuthVersion || admin.PasswordHash != credentialPasswordHash {
		err = ErrAuthVersionStale
		span.SetStatus(codes.Error, err.Error())
		l.Infof("Login admin rejected admin_id=%d reason=credentials_changed", admin.ID)
		return "", time.Time{}, nil, err
	}
	if !admin.IsActive() {
		err = ErrUserDisabled
		span.SetStatus(codes.Error, err.Error())
		l.Infof("Login admin rejected admin_id=%d reason=account_inactive", admin.ID)
		return "", time.Time{}, nil, err
	}

	token, expireAt, e = uc.createSessionToken(ctx, admin, AdminSessionIssueConstraint{})
	if e != nil {
		err = e
		span.RecordError(err)
		span.SetStatus(codes.Error, "generate token failed")
		l.Errorf("Login admin generate token failed admin_id=%d err=%v", admin.ID, err)
		return "", time.Time{}, nil, err
	}

	span.SetAttributes(attribute.Int64("admin_auth.token_expires_at", expireAt.Unix()))

	if e := uc.repo.UpdateAdminLastLogin(ctx, admin.ID, time.Now()); e != nil {
		span.RecordError(e)
		l.Warnf("Login admin update last_login_at failed admin_id=%d err=%v", admin.ID, e)
	}

	span.SetStatus(codes.Ok, "OK")
	l.Infof("Login admin success admin_id=%d", admin.ID)

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
		if e != nil && !errors.Is(e, ErrPhoneNotBound) && !errors.Is(e, ErrUserNotFound) {
			span.RecordError(e)
			l.Errorf("RequestSMSLoginCode suppressed account lookup failure phone=%s err=%v", maskPhone(normalizedPhone), e)
		} else {
			l.Infof("RequestSMSLoginCode accepted phone=%s delivery_eligible=false reason=phone_not_bound", maskPhone(normalizedPhone))
		}
		span.SetAttributes(attribute.Bool("admin_auth.sms_delivery_eligible", false))
		span.SetStatus(codes.Ok, "accepted")
		return newDecoySMSLoginChallenge(normalizedPhone)
	}
	if !admin.IsActive() {
		span.SetAttributes(attribute.Int("admin_auth.admin_id", admin.ID), attribute.Bool("admin_auth.sms_delivery_eligible", false))
		span.SetStatus(codes.Ok, "accepted")
		l.Infof("RequestSMSLoginCode accepted admin_id=%d phone=%s delivery_eligible=false reason=account_inactive", admin.ID, maskPhone(normalizedPhone))
		return newDecoySMSLoginChallenge(normalizedPhone)
	}
	if !AdminCanAccessMobileRole(admin, mobileRoleKey) {
		span.SetAttributes(attribute.Int("admin_auth.admin_id", admin.ID), attribute.Bool("admin_auth.sms_delivery_eligible", false))
		span.SetStatus(codes.Ok, "accepted")
		l.Infof("RequestSMSLoginCode accepted admin_id=%d phone=%s delivery_eligible=false reason=mobile_role_denied mobile_role_key=%s", admin.ID, maskPhone(normalizedPhone), mobileRoleKey)
		return newDecoySMSLoginChallenge(normalizedPhone)
	}

	challenge, err = uc.smsCodes.Request(ctx, normalizedPhone)
	if err != nil {
		span.RecordError(err)
		span.SetAttributes(attribute.Int("admin_auth.admin_id", admin.ID), attribute.Bool("admin_auth.sms_delivery_eligible", true))
		span.SetStatus(codes.Error, "sms delivery failed")
		l.Warnf("RequestSMSLoginCode suppressed delivery failure admin_id=%d phone=%s err=%v", admin.ID, maskPhone(normalizedPhone), err)
		return newDecoySMSLoginChallenge(normalizedPhone)
	}

	span.SetAttributes(
		attribute.Int("admin_auth.admin_id", admin.ID),
		attribute.Bool("admin_auth.sms_delivery_eligible", true),
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
	if _, err = uc.smsCodes.Verify(ctx, normalizedPhone, code); err != nil {
		span.SetStatus(codes.Error, err.Error())
		l.Infof("SMSLogin verification rejected phone=%s reason=%s", maskPhone(normalizedPhone), smsLoginFailureReason(err))
		return "", time.Time{}, nil, err
	}

	admin, e := uc.repo.GetAdminByPhone(ctx, normalizedPhone)
	if e != nil || admin == nil {
		if e != nil && !errors.Is(e, ErrPhoneNotBound) && !errors.Is(e, ErrUserNotFound) {
			span.RecordError(e)
			span.SetStatus(codes.Error, "account lookup failed")
			l.Errorf("SMSLogin admin lookup failed err=%v", e)
			return "", time.Time{}, nil, e
		}
		err = ErrPhoneNotBound
		span.SetStatus(codes.Error, err.Error())
		l.Infof("SMSLogin identity rejected phone=%s reason=phone_not_bound", maskPhone(normalizedPhone))
		return "", time.Time{}, nil, err
	}

	span.SetAttributes(attribute.Int("admin_auth.admin_id", admin.ID))
	if !admin.IsActive() {
		err = ErrUserDisabled
		span.SetStatus(codes.Error, err.Error())
		l.Infof("SMSLogin identity rejected admin_id=%d phone=%s reason=account_inactive", admin.ID, maskPhone(normalizedPhone))
		return "", time.Time{}, nil, err
	}
	if !AdminCanAccessMobileRole(admin, mobileRoleKey) {
		err = ErrMobileRoleDenied
		span.SetStatus(codes.Error, err.Error())
		l.Infof("SMSLogin identity rejected admin_id=%d phone=%s reason=mobile_role_denied mobile_role_key=%s", admin.ID, maskPhone(normalizedPhone), mobileRoleKey)
		return "", time.Time{}, nil, err
	}

	verifiedAuthVersion := admin.AuthVersion
	admin, e = uc.repo.GetAdminByID(ctx, admin.ID)
	if e != nil {
		err = e
		span.RecordError(err)
		span.SetStatus(codes.Error, "account reload failed")
		l.Errorf("SMSLogin admin reload failed err=%v", err)
		return "", time.Time{}, nil, err
	}
	if admin == nil {
		err = ErrUserNotFound
		span.SetStatus(codes.Error, err.Error())
		l.Info("SMSLogin admin rejected reason=account_not_found_after_verification")
		return "", time.Time{}, nil, err
	}
	if !admin.IsActive() {
		err = ErrUserDisabled
		span.SetStatus(codes.Error, err.Error())
		l.Infof("SMSLogin admin rejected admin_id=%d reason=account_inactive_after_verification", admin.ID)
		return "", time.Time{}, nil, err
	}
	currentPhone, phoneErr := NormalizeLoginPhone(admin.Phone)
	if admin.AuthVersion != verifiedAuthVersion || phoneErr != nil || currentPhone != normalizedPhone {
		err = ErrAuthVersionStale
		span.SetStatus(codes.Error, err.Error())
		l.Infof("SMSLogin admin rejected admin_id=%d reason=credentials_changed", admin.ID)
		return "", time.Time{}, nil, err
	}
	if !AdminCanAccessMobileRole(admin, mobileRoleKey) {
		err = ErrMobileRoleDenied
		span.SetStatus(codes.Error, err.Error())
		l.Infof("SMSLogin admin rejected admin_id=%d reason=mobile_role_changed mobile_role_key=%s", admin.ID, mobileRoleKey)
		return "", time.Time{}, nil, err
	}

	token, expireAt, e = uc.createSessionToken(ctx, admin, AdminSessionIssueConstraint{
		ExpectedPhone:      normalizedPhone,
		RequiredPermission: MobileRoleAccessPermission(mobileRoleKey),
	})
	if e != nil {
		err = e
		span.RecordError(err)
		span.SetStatus(codes.Error, "generate token failed")
		l.Errorf("SMSLogin admin generate token failed admin_id=%d err=%v", admin.ID, err)
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

func smsLoginFailureReason(err error) string {
	switch {
	case errors.Is(err, ErrSMSCodeNotFound):
		return "code_not_found"
	case errors.Is(err, ErrSMSCodeExpired):
		return "code_expired"
	case errors.Is(err, ErrSMSCodeInvalid):
		return "code_invalid"
	case errors.Is(err, ErrSMSCodeAttemptsExceeded):
		return "attempts_exceeded"
	case errors.Is(err, ErrSMSServiceUnavailable):
		return "service_unavailable"
	case errors.Is(err, ErrSMSServiceQuotaExceeded):
		return "quota_exceeded"
	default:
		return "verification_failed"
	}
}
