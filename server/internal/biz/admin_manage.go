package biz

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

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

type RuntimeAuditEventCreate struct {
	EventType string
	EventKey  string
	Source    string
	Payload   map[string]any
}

type RuntimeAuditEventListFilter struct {
	Source      string
	EventType   string
	EventKey    string
	ActorKey    string
	TargetType  string
	TargetKey   string
	Keyword     string
	CreatedFrom time.Time
	CreatedTo   time.Time
	Limit       int
	Offset      int
}

type RuntimeAuditEvent struct {
	ID          int
	EventType   string
	EventKey    string
	Source      string
	Payload     map[string]any
	RiskLevel   string
	ActionLabel string
	Summary     string
	ActorKey    string
	TargetType  string
	TargetKey   string
	CreatedAt   time.Time
}

type RuntimeAuditEventListResult struct {
	Events []RuntimeAuditEvent
	Total  int
	Limit  int
	Offset int
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
	RecordRuntimeAuditEvent(ctx context.Context, event *RuntimeAuditEventCreate) error
	ListRuntimeAuditEvents(ctx context.Context, filter RuntimeAuditEventListFilter) (RuntimeAuditEventListResult, error)
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

const (
	adminControlAuditEventType = "admin_control_plane"
	adminControlAuditSource    = "admin_manage"
)

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

func (uc *AdminManageUsecase) recordAdminControlAudit(
	ctx context.Context,
	operator *AdminUser,
	action string,
	targetType string,
	targetID int,
	targetKey string,
	before map[string]any,
	after map[string]any,
) error {
	if operator == nil {
		return ErrForbidden
	}
	action = strings.TrimSpace(action)
	targetType = strings.TrimSpace(targetType)
	targetKey = strings.TrimSpace(targetKey)
	if action == "" || targetType == "" {
		return ErrBadParam
	}
	payload := map[string]any{
		"action": action,
		"actor": map[string]any{
			"id":       operator.ID,
			"username": operator.Username,
		},
		"target": map[string]any{
			"type": targetType,
			"id":   targetID,
			"key":  targetKey,
		},
		"before": before,
		"after":  after,
	}
	return uc.repo.RecordRuntimeAuditEvent(ctx, &RuntimeAuditEventCreate{
		EventType: adminControlAuditEventType,
		EventKey:  action,
		Source:    adminControlAuditSource,
		Payload:   payload,
	})
}

func adminAuditUserSnapshot(admin *AdminUser) map[string]any {
	if admin == nil {
		return nil
	}
	return map[string]any{
		"id":             admin.ID,
		"username":       admin.Username,
		"phone":          admin.Phone,
		"role_keys":      AdminRoleKeys(admin),
		"disabled":       admin.Disabled,
		"is_super_admin": admin.IsSuperAdmin,
	}
}

func adminAuditRoleSnapshot(role *AdminRole) map[string]any {
	if role == nil {
		return nil
	}
	return map[string]any{
		"role_key":        role.Key,
		"name":            role.Name,
		"disabled":        role.Disabled,
		"permission_keys": NormalizePermissionKeys(role.Permissions),
	}
}

func EnrichRuntimeAuditEvent(event RuntimeAuditEvent) RuntimeAuditEvent {
	event.ActorKey = auditPayloadActorKey(event.Payload)
	event.TargetType = auditPayloadTargetValue(event.Payload, "type")
	event.TargetKey = auditPayloadTargetValue(event.Payload, "key")
	event.ActionLabel, event.RiskLevel = runtimeAuditActionLabelAndRisk(event.EventKey)
	event.Summary = runtimeAuditSummary(event)
	return event
}

func auditPayloadActorKey(payload map[string]any) string {
	actor, _ := payload["actor"].(map[string]any)
	return strings.TrimSpace(anyToString(actor["username"]))
}

func auditPayloadTargetValue(payload map[string]any, key string) string {
	target, _ := payload["target"].(map[string]any)
	return strings.TrimSpace(anyToString(target[key]))
}

func runtimeAuditActionLabelAndRisk(eventKey string) (string, string) {
	switch strings.TrimSpace(eventKey) {
	case "admin_user.create":
		return "新建管理员", "warning"
	case "admin_user.roles.set":
		return "账号角色变更", "warning"
	case "admin_user.phone.set":
		return "账号手机号变更", "normal"
	case "admin_user.disabled.set":
		return "账号启停变更", "high"
	case "admin_user.password.reset":
		return "密码重置", "high"
	case "role.permissions.set":
		return "角色权限变更", "high"
	case "admin_bootstrap.completed":
		return "初始化完成", "normal"
	case "admin_bootstrap.blocked":
		return "初始化阻止", "high"
	default:
		if strings.TrimSpace(eventKey) == "" {
			return "未知动作", "normal"
		}
		return strings.TrimSpace(eventKey), "normal"
	}
}

func runtimeAuditSummary(event RuntimeAuditEvent) string {
	actor := event.ActorKey
	if actor == "" {
		actor = "-"
	}
	target := event.TargetKey
	if target == "" {
		target = "-"
	}
	after, _ := event.Payload["after"].(map[string]any)
	switch event.EventKey {
	case "admin_user.password.reset":
		return actor + " 重置了 " + target + " 的密码"
	case "admin_user.disabled.set":
		if boolValue(after["disabled"]) {
			return actor + " 禁用了 " + target
		}
		return actor + " 恢复了 " + target
	case "admin_user.roles.set":
		return actor + " 调整了 " + target + " 的账号角色"
	case "role.permissions.set":
		return actor + " 调整了 " + target + " 的角色权限"
	case "admin_bootstrap.blocked":
		if reason := strings.TrimSpace(anyToString(event.Payload["reason"])); reason != "" {
			return "启动初始化被阻止：" + reason
		}
		return "启动初始化被阻止"
	default:
		if actor == "-" && target == "-" {
			return event.ActionLabel
		}
		if target == "-" {
			return actor + " 执行了 " + event.ActionLabel
		}
		return actor + " 对 " + target + " 执行了 " + event.ActionLabel
	}
}

func anyToString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", typed)
	}
}

func boolValue(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		return strings.EqualFold(strings.TrimSpace(typed), "true")
	default:
		return false
	}
}

func (uc *AdminManageUsecase) ListRuntimeAuditEvents(
	ctx context.Context,
	filter RuntimeAuditEventListFilter,
) (RuntimeAuditEventListResult, error) {
	if _, err := uc.requireActiveAdmin(ctx); err != nil {
		return RuntimeAuditEventListResult{}, err
	}
	result, err := uc.repo.ListRuntimeAuditEvents(ctx, filter)
	if err != nil {
		return RuntimeAuditEventListResult{}, err
	}
	for i := range result.Events {
		result.Events[i] = EnrichRuntimeAuditEvent(result.Events[i])
	}
	return result, nil
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
			attribute.Int("admin.role_count", len(roleKeys)),
		),
	)
	defer span.End()

	operator, err := uc.requireActiveAdmin(ctx)
	if err != nil {
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
	if err = uc.recordAdminControlAudit(
		ctx,
		operator,
		"admin_user.create",
		"admin_user",
		created.ID,
		created.Username,
		nil,
		adminAuditUserSnapshot(created),
	); err != nil {
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
	before := adminAuditUserSnapshot(target)

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
	if err = uc.recordAdminControlAudit(
		ctx,
		operator,
		"admin_user.roles.set",
		"admin_user",
		target.ID,
		target.Username,
		before,
		adminAuditUserSnapshot(target),
	); err != nil {
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
	operator, err := uc.requireActiveAdmin(ctx)
	if err != nil {
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
	before := adminAuditRoleSnapshot(role)
	if err := uc.repo.UpdateRolePermissions(ctx, roleKey, NormalizePermissionKeys(permissionKeys)); err != nil {
		return nil, err
	}
	updated, err := uc.repo.GetRoleByKey(ctx, roleKey)
	if err != nil {
		return nil, err
	}
	if err := uc.recordAdminControlAudit(
		ctx,
		operator,
		"role.permissions.set",
		"role",
		updated.ID,
		updated.Key,
		before,
		adminAuditRoleSnapshot(updated),
	); err != nil {
		return nil, err
	}
	return updated, nil
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
	before := adminAuditUserSnapshot(target)

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
	if err = uc.recordAdminControlAudit(
		ctx,
		operator,
		"admin_user.phone.set",
		"admin_user",
		target.ID,
		target.Username,
		before,
		adminAuditUserSnapshot(target),
	); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
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
	before := adminAuditUserSnapshot(target)

	if err = uc.repo.SetAdminDisabled(ctx, adminID, disabled); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	target.Disabled = disabled
	if err = uc.recordAdminControlAudit(
		ctx,
		operator,
		"admin_user.disabled.set",
		"admin_user",
		target.ID,
		target.Username,
		before,
		adminAuditUserSnapshot(target),
	); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
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

	operator, err := uc.requireActiveAdmin(ctx)
	if err != nil {
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
	if err = uc.recordAdminControlAudit(
		ctx,
		operator,
		"admin_user.password.reset",
		"admin_user",
		updated.ID,
		updated.Username,
		map[string]any{"password_reset": false},
		map[string]any{"password_reset": true},
	); err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	span.SetStatus(codes.Ok, "OK")
	return updated, nil
}
