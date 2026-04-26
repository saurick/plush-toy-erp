package biz

import (
	"context"
	"errors"
	"strings"

	"github.com/go-kratos/kratos/v2/log"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrAdminNotFound    = errors.New("admin not found")
	ErrAdminExists      = errors.New("admin already exists")
	ErrAdminPhoneExists = errors.New("admin phone already exists")
	ErrRoleNotFound     = errors.New("role not found")
	ErrRoleExists       = errors.New("role already exists")
)

type AdminCreate struct {
	Username     string
	Phone        string
	PasswordHash string
	RoleKeys     []string
}

type AdminManageRepo interface {
	GetAdminByID(ctx context.Context, id int) (*AdminUser, error)
	GetAdminByUsername(ctx context.Context, username string) (*AdminUser, error)
	GetAdminByPhone(ctx context.Context, phone string) (*AdminUser, error)
	ListAdmins(ctx context.Context) ([]*AdminUser, error)
	CreateAdmin(ctx context.Context, admin *AdminCreate) (*AdminUser, error)
	UpdateAdminRoles(ctx context.Context, id int, roleKeys []string) error
	ListRoles(ctx context.Context) ([]AdminRole, error)
	ListPermissions(ctx context.Context) ([]AdminPermission, error)
	GetRoleByKey(ctx context.Context, roleKey string) (*AdminRole, error)
	UpdateRolePermissions(ctx context.Context, roleKey string, permissionKeys []string) error
	UpdateAdminERPColumnOrder(ctx context.Context, id int, moduleKey string, order []string) error
	UpdateAdminPhone(ctx context.Context, id int, phone string) error
	SetAdminDisabled(ctx context.Context, id int, disabled bool) error
	UpdateAdminPasswordHash(ctx context.Context, id int, passwordHash string) error
}

type AdminManageUsecase struct {
	repo   AdminManageRepo
	log    *log.Helper
	tracer trace.Tracer
}

func NewAdminManageUsecase(repo AdminManageRepo, logger log.Logger, tp *tracesdk.TracerProvider) *AdminManageUsecase {
	helper := log.NewHelper(log.With(logger, "module", "biz.admin_manage"))
	var tr trace.Tracer
	if tp != nil {
		tr = tp.Tracer("biz.admin_manage")
	} else {
		tr = otel.Tracer("biz.admin_manage")
	}
	return &AdminManageUsecase{
		repo:   repo,
		log:    helper,
		tracer: tr,
	}
}

func (uc *AdminManageUsecase) Tracer() trace.Tracer {
	if uc.tracer != nil {
		return uc.tracer
	}
	return otel.Tracer("biz.admin_manage")
}

func (uc *AdminManageUsecase) requireAdmin(ctx context.Context) (*AuthClaims, error) {
	c, ok := GetClaimsFromContext(ctx)
	if !ok || c == nil {
		return nil, ErrForbidden
	}
	if c.Role != RoleAdmin {
		return nil, ErrForbidden
	}
	return c, nil
}

func (uc *AdminManageUsecase) getCurrentAdmin(ctx context.Context) (*AdminUser, error) {
	claims, err := uc.requireAdmin(ctx)
	if err != nil {
		return nil, err
	}

	admin, err := uc.repo.GetAdminByID(ctx, claims.UserID)
	if err == nil && admin != nil {
		return admin, nil
	}
	if err != nil && !errors.Is(err, ErrAdminNotFound) {
		return nil, err
	}
	if strings.TrimSpace(claims.Username) == "" {
		return nil, ErrAdminNotFound
	}
	return uc.repo.GetAdminByUsername(ctx, claims.Username)
}

func (uc *AdminManageUsecase) requireActiveAdmin(ctx context.Context) (*AdminUser, error) {
	admin, err := uc.getCurrentAdmin(ctx)
	if err != nil {
		return nil, err
	}
	if admin.Disabled {
		return nil, ErrUserDisabled
	}
	return admin, nil
}

func (uc *AdminManageUsecase) GetCurrent(ctx context.Context) (admin *AdminUser, err error) {
	ctx, span := uc.Tracer().Start(ctx, "admin_manage.get_current")
	defer span.End()

	admin, err = uc.requireActiveAdmin(ctx)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	span.SetAttributes(
		attribute.Int("admin.id", admin.ID),
		attribute.Bool("admin.is_super_admin", admin.IsSuperAdmin),
	)
	span.SetStatus(codes.Ok, "OK")
	return admin, nil
}

func (uc *AdminManageUsecase) List(ctx context.Context) (list []*AdminUser, err error) {
	ctx, span := uc.Tracer().Start(ctx, "admin_manage.list")
	defer span.End()

	_, err = uc.requireActiveAdmin(ctx)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	list, err = uc.repo.ListAdmins(ctx)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	span.SetAttributes(attribute.Int("admin_manage.count", len(list)))
	span.SetStatus(codes.Ok, "OK")
	return list, nil
}

func (uc *AdminManageUsecase) Create(
	ctx context.Context,
	username string,
	phone string,
	password string,
	roleKeys []string,
) (created *AdminUser, err error) {
	ctx, span := uc.Tracer().Start(ctx, "admin_manage.create",
		trace.WithAttributes(
			attribute.String("admin.username", strings.TrimSpace(username)),
			attribute.Int("admin.role_count", len(roleKeys)),
		),
	)
	defer span.End()

	if _, err = uc.requireActiveAdmin(ctx); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	username = strings.TrimSpace(username)
	phone = strings.TrimSpace(phone)
	if username == "" || password == "" {
		span.SetStatus(codes.Error, ErrBadParam.Error())
		return nil, ErrBadParam
	}
	normalizedPhone := ""
	if phone != "" {
		normalizedPhone, err = NormalizeLoginPhone(phone)
		if err != nil {
			span.SetStatus(codes.Error, err.Error())
			return nil, err
		}
	}
	if len(password) < 6 {
		span.SetStatus(codes.Error, ErrBadParam.Error())
		return nil, ErrBadParam
	}
	normalizedRoleKeys := NormalizeAdminRoleKeys(roleKeys)

	if existing, checkErr := uc.repo.GetAdminByUsername(ctx, username); checkErr == nil && existing != nil {
		span.SetStatus(codes.Error, ErrAdminExists.Error())
		return nil, ErrAdminExists
	} else if checkErr != nil && !errors.Is(checkErr, ErrAdminNotFound) && !errors.Is(checkErr, ErrBadParam) {
		span.RecordError(checkErr)
		span.SetStatus(codes.Error, checkErr.Error())
		return nil, checkErr
	}
	if normalizedPhone != "" {
		if existing, checkErr := uc.repo.GetAdminByPhone(ctx, normalizedPhone); checkErr == nil && existing != nil {
			span.SetStatus(codes.Error, ErrAdminPhoneExists.Error())
			return nil, ErrAdminPhoneExists
		} else if checkErr != nil && !errors.Is(checkErr, ErrAdminNotFound) && !errors.Is(checkErr, ErrBadParam) {
			span.RecordError(checkErr)
			span.SetStatus(codes.Error, checkErr.Error())
			return nil, checkErr
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	created, err = uc.repo.CreateAdmin(ctx, &AdminCreate{
		Username:     username,
		Phone:        normalizedPhone,
		PasswordHash: string(hash),
		RoleKeys:     normalizedRoleKeys,
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	span.SetStatus(codes.Ok, "OK")
	return created, nil
}

func (uc *AdminManageUsecase) SetRoles(
	ctx context.Context,
	adminID int,
	roleKeys []string,
) (updated *AdminUser, err error) {
	ctx, span := uc.Tracer().Start(ctx, "admin_manage.set_roles",
		trace.WithAttributes(
			attribute.Int("admin.id", adminID),
			attribute.Int("admin.role_count", len(roleKeys)),
		),
	)
	defer span.End()

	if _, err = uc.requireActiveAdmin(ctx); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if adminID <= 0 {
		span.SetStatus(codes.Error, ErrBadParam.Error())
		return nil, ErrBadParam
	}

	target, err := uc.repo.GetAdminByID(ctx, adminID)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if target.IsSuperAdmin {
		span.SetStatus(codes.Error, ErrNoPermission.Error())
		return nil, ErrNoPermission
	}

	normalizedRoleKeys := NormalizeAdminRoleKeys(roleKeys)
	if err = uc.repo.UpdateAdminRoles(ctx, adminID, normalizedRoleKeys); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	target, err = uc.repo.GetAdminByID(ctx, adminID)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	span.SetStatus(codes.Ok, "OK")
	return target, nil
}

func (uc *AdminManageUsecase) ListRoles(ctx context.Context) ([]AdminRole, error) {
	if _, err := uc.requireActiveAdmin(ctx); err != nil {
		return nil, err
	}
	return uc.repo.ListRoles(ctx)
}

func (uc *AdminManageUsecase) ListPermissions(ctx context.Context) ([]AdminPermission, error) {
	if _, err := uc.requireActiveAdmin(ctx); err != nil {
		return nil, err
	}
	return uc.repo.ListPermissions(ctx)
}

func (uc *AdminManageUsecase) SetRolePermissions(ctx context.Context, roleKey string, permissionKeys []string) (*AdminRole, error) {
	if _, err := uc.requireActiveAdmin(ctx); err != nil {
		return nil, err
	}
	roleKey = NormalizeRoleKey(roleKey)
	if roleKey == "" {
		return nil, ErrBadParam
	}
	role, err := uc.repo.GetRoleByKey(ctx, roleKey)
	if err != nil {
		return nil, err
	}
	if role == nil || role.Disabled {
		return nil, ErrRoleNotFound
	}
	if err := uc.repo.UpdateRolePermissions(ctx, roleKey, NormalizePermissionKeys(permissionKeys)); err != nil {
		return nil, err
	}
	return uc.repo.GetRoleByKey(ctx, roleKey)
}

func (uc *AdminManageUsecase) SetPhone(
	ctx context.Context,
	adminID int,
	phone string,
) (updated *AdminUser, err error) {
	ctx, span := uc.Tracer().Start(ctx, "admin_manage.set_phone",
		trace.WithAttributes(attribute.Int("admin.id", adminID)),
	)
	defer span.End()

	if _, err = uc.requireActiveAdmin(ctx); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if adminID <= 0 {
		span.SetStatus(codes.Error, ErrBadParam.Error())
		return nil, ErrBadParam
	}

	target, err := uc.repo.GetAdminByID(ctx, adminID)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if target.IsSuperAdmin {
		span.SetStatus(codes.Error, ErrNoPermission.Error())
		return nil, ErrNoPermission
	}

	normalizedPhone := ""
	if strings.TrimSpace(phone) != "" {
		normalizedPhone, err = NormalizeLoginPhone(phone)
		if err != nil {
			span.SetStatus(codes.Error, err.Error())
			return nil, err
		}
		if existing, checkErr := uc.repo.GetAdminByPhone(ctx, normalizedPhone); checkErr == nil && existing != nil && existing.ID != adminID {
			span.SetStatus(codes.Error, ErrAdminPhoneExists.Error())
			return nil, ErrAdminPhoneExists
		} else if checkErr != nil && !errors.Is(checkErr, ErrAdminNotFound) && !errors.Is(checkErr, ErrBadParam) {
			span.RecordError(checkErr)
			span.SetStatus(codes.Error, checkErr.Error())
			return nil, checkErr
		}
	}

	if err = uc.repo.UpdateAdminPhone(ctx, adminID, normalizedPhone); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	target.Phone = normalizedPhone
	span.SetStatus(codes.Ok, "OK")
	return target, nil
}

func (uc *AdminManageUsecase) SetCurrentERPColumnOrder(
	ctx context.Context,
	moduleKey string,
	order []string,
) (admin *AdminUser, err error) {
	ctx, span := uc.Tracer().Start(ctx, "admin_manage.set_erp_column_order",
		trace.WithAttributes(
			attribute.String("erp.module_key", strings.TrimSpace(moduleKey)),
			attribute.Int("erp.column_order_count", len(order)),
		),
	)
	defer span.End()

	moduleKey = normalizeAdminERPPreferenceModuleKey(moduleKey)
	if moduleKey == "" {
		span.SetStatus(codes.Error, ErrBadParam.Error())
		return nil, ErrBadParam
	}
	normalizedOrder := NormalizeAdminERPColumnOrder(order)

	currentAdmin, err := uc.getCurrentAdmin(ctx)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if currentAdmin.Disabled {
		span.SetStatus(codes.Error, ErrUserDisabled.Error())
		return nil, ErrUserDisabled
	}

	if err = uc.repo.UpdateAdminERPColumnOrder(ctx, currentAdmin.ID, moduleKey, normalizedOrder); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	admin, err = uc.repo.GetAdminByID(ctx, currentAdmin.ID)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	admin.ERPPreferences = NormalizeAdminERPPreferences(admin.ERPPreferences)
	span.SetAttributes(attribute.Int("admin.id", admin.ID))
	span.SetStatus(codes.Ok, "OK")
	return admin, nil
}

func (uc *AdminManageUsecase) SetDisabled(
	ctx context.Context,
	adminID int,
	disabled bool,
) (updated *AdminUser, err error) {
	ctx, span := uc.Tracer().Start(ctx, "admin_manage.set_disabled",
		trace.WithAttributes(
			attribute.Int("admin.id", adminID),
			attribute.Bool("admin.disabled", disabled),
		),
	)
	defer span.End()

	operator, err := uc.requireActiveAdmin(ctx)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if adminID <= 0 {
		span.SetStatus(codes.Error, ErrBadParam.Error())
		return nil, ErrBadParam
	}

	target, err := uc.repo.GetAdminByID(ctx, adminID)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if target.IsSuperAdmin {
		span.SetStatus(codes.Error, ErrNoPermission.Error())
		return nil, ErrNoPermission
	}
	if operator.ID == target.ID {
		span.SetStatus(codes.Error, ErrNoPermission.Error())
		return nil, ErrNoPermission
	}

	if err = uc.repo.SetAdminDisabled(ctx, adminID, disabled); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	target.Disabled = disabled
	span.SetStatus(codes.Ok, "OK")
	return target, nil
}

func (uc *AdminManageUsecase) ResetPassword(
	ctx context.Context,
	adminID int,
	password string,
) (updated *AdminUser, err error) {
	ctx, span := uc.Tracer().Start(ctx, "admin_manage.reset_password",
		trace.WithAttributes(attribute.Int("admin.id", adminID)),
	)
	defer span.End()

	if _, err = uc.requireActiveAdmin(ctx); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if adminID <= 0 || len(password) < 6 {
		span.SetStatus(codes.Error, ErrBadParam.Error())
		return nil, ErrBadParam
	}

	target, err := uc.repo.GetAdminByID(ctx, adminID)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if target.IsSuperAdmin {
		span.SetStatus(codes.Error, ErrNoPermission.Error())
		return nil, ErrNoPermission
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	if err = uc.repo.UpdateAdminPasswordHash(ctx, adminID, string(hash)); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	updated, err = uc.repo.GetAdminByID(ctx, adminID)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	span.SetStatus(codes.Ok, "OK")
	return updated, nil
}
