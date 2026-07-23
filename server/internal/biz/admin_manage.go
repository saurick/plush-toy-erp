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
	ErrAdminNotFound                     = errors.New("admin not found")
	ErrAdminExists                       = errors.New("admin already exists")
	ErrAdminPhoneExists                  = errors.New("admin phone already exists")
	ErrAdminRevoked                      = errors.New("admin account revoked")
	ErrRoleNotFound                      = errors.New("role not found")
	ErrRoleExists                        = errors.New("role already exists")
	ErrPermissionNotFound                = errors.New("permission not found")
	ErrAdminSelfRoleChangeForbidden      = errors.New("admin cannot change own roles")
	ErrAdminSelfRolePermissionForbidden  = errors.New("admin cannot change permissions of own role")
	ErrPrivilegedAdminTargetForbidden    = errors.New("privileged admin target is protected")
	ErrPrivilegedRoleAssignmentForbidden = errors.New("privileged role assignment forbidden")
	ErrSystemRoleImmutable               = errors.New("system role is immutable")
	ErrPermissionNotDelegable            = errors.New("permission is not delegable")
	ErrDebugRoleProductionForbidden      = errors.New("debug role is forbidden outside non-production")
	ErrRoleVersionConflict               = errors.New("role version conflict")
	ErrRoleDataScopeResourceNotFound     = errors.New("role data scope resource not found")
)

type AdminRoleAssignmentContext struct {
	Environment string
}

type AdminRoleAccess struct {
	Assignable                   bool
	AssignmentBlockedReason      string
	PermissionsEditable          bool
	PermissionsEditBlockedReason string
}

type AdminCreate struct {
	Username     string
	Phone        string
	PasswordHash string
	RoleKeys     []string
}

type AdminLifecycleChange struct {
	AdminID    int
	OperatorID int
	Disabled   bool
	Revoke     bool
	Reason     string
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
	CreateAdminWithAudit(ctx context.Context, command *AdminCreateCommand) (*AdminUser, error)
	SetAdminRolesWithAudit(ctx context.Context, change *AdminRolesChange) (*AdminUser, error)
	ListRoles(ctx context.Context) ([]AdminRole, error)
	ListPermissions(ctx context.Context) ([]AdminPermission, error)
	GetRoleByKey(ctx context.Context, roleKey string) (*AdminRole, error)
	SetRolePermissionsWithAudit(ctx context.Context, change *RolePermissionsChange) (*AdminRole, error)
	SetRoleNavigationWithAudit(ctx context.Context, change *RoleNavigationChange) (*AdminRole, error)
	UpdateAdminERPColumnOrder(ctx context.Context, id int, moduleKey string, order []string) error
	SetAdminPhoneWithAudit(ctx context.Context, change *AdminPhoneChange) (*AdminUser, error)
	ChangeAdminLifecycle(ctx context.Context, change *AdminLifecycleChange) (updated *AdminUser, releasedTaskCount int, err error)
	ResetAdminPasswordWithAudit(ctx context.Context, reset *AdminPasswordReset) (*AdminUser, error)
	RecordRuntimeAuditEvent(ctx context.Context, event *RuntimeAuditEventCreate) error
	ListRuntimeAuditEvents(ctx context.Context, filter RuntimeAuditEventListFilter) (RuntimeAuditEventListResult, error)
}

type AdminManageUsecase struct {
	repo                  AdminManageRepo
	log                   *log.Helper
	tracer                trace.Tracer
	roleAssignmentContext AdminRoleAssignmentContext
}

func NewAdminManageUsecase(
	repo AdminManageRepo,
	logger log.Logger,
	tp *tracesdk.TracerProvider,
	roleAssignmentContexts ...AdminRoleAssignmentContext,
) *AdminManageUsecase {
	helper := log.NewHelper(log.With(logger, "module", "biz.admin_manage"))
	var tr trace.Tracer
	if tp != nil {
		tr = tp.Tracer("biz.admin_manage")
	} else {
		tr = otel.Tracer("biz.admin_manage")
	}
	assignmentContext := AdminRoleAssignmentContext{Environment: "production"}
	if len(roleAssignmentContexts) > 0 {
		assignmentContext = roleAssignmentContexts[0]
		if strings.TrimSpace(assignmentContext.Environment) == "" {
			assignmentContext.Environment = "production"
		}
	}
	return &AdminManageUsecase{
		repo:                  repo,
		log:                   helper,
		tracer:                tr,
		roleAssignmentContext: assignmentContext,
	}
}

func NewAdminManageUsecaseForWire(
	repo AdminManageRepo,
	logger log.Logger,
	tp *tracesdk.TracerProvider,
	debugSafetyConfig DebugSafetyConfig,
) *AdminManageUsecase {
	return NewAdminManageUsecase(
		repo,
		logger,
		tp,
		AdminRoleAssignmentContext{Environment: debugSafetyConfig.Environment},
	)
}

const (
	adminControlAuditEventType  = "admin_control_plane"
	adminControlAuditSource     = "admin_manage"
	workflowBreakGlassEventType = "workflow_break_glass"
	workflowBreakGlassEventKey  = "workflow_task.break_glass"
	workflowBreakGlassSource    = "workflow"
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
	if !c.IsAdmin() {
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
	return nil, ErrAdminNotFound
}

func (uc *AdminManageUsecase) requireActiveAdmin(ctx context.Context) (*AdminUser, error) {
	admin, err := uc.getCurrentAdmin(ctx)
	if err != nil {
		return nil, err
	}
	if !admin.IsActive() {
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

func BuildAdminControlAuditEvent(
	operator *AdminUser,
	action string,
	targetType string,
	targetID int,
	targetKey string,
	before map[string]any,
	after map[string]any,
) (*RuntimeAuditEventCreate, error) {
	if operator == nil {
		return nil, ErrForbidden
	}
	action = strings.TrimSpace(action)
	targetType = strings.TrimSpace(targetType)
	targetKey = strings.TrimSpace(targetKey)
	if action == "" || targetType == "" {
		return nil, ErrBadParam
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
	return &RuntimeAuditEventCreate{
		EventType: adminControlAuditEventType,
		EventKey:  action,
		Source:    adminControlAuditSource,
		Payload:   payload,
	}, nil
}

func AdminAuditUserSnapshot(admin *AdminUser) map[string]any {
	if admin == nil {
		return nil
	}
	return map[string]any{
		"id":             admin.ID,
		"username":       admin.Username,
		"phone":          maskAdminAuditPhone(admin.Phone),
		"role_keys":      AdminRoleKeys(admin),
		"disabled":       admin.Disabled,
		"account_status": string(admin.AccountStatus()),
		"status_reason":  admin.StatusReason,
		"is_super_admin": admin.IsSuperAdmin,
	}
}

func maskAdminAuditPhone(phone string) string {
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return ""
	}
	runes := []rune(phone)
	if len(runes) >= 7 {
		return string(runes[:3]) + "****" + string(runes[len(runes)-4:])
	}
	if len(runes) >= 3 {
		return string(runes[:1]) + "***" + string(runes[len(runes)-1:])
	}
	return "****"
}

func AdminAuditRoleSnapshot(role *AdminRole) map[string]any {
	if role == nil {
		return nil
	}
	return map[string]any{
		"role_key":           role.Key,
		"name":               role.Name,
		"role_type":          role.Type,
		"version":            role.Version,
		"disabled":           role.Disabled,
		"navigation_mode":    role.NavigationMode,
		"primary_menu_paths": append([]string(nil), role.PrimaryMenuPaths...),
		"permission_keys":    NormalizePermissionKeys(role.Permissions),
		"data_scopes":        role.DataScopes,
	}
}

func (uc *AdminManageUsecase) EffectiveWarehouseDataScope(ctx context.Context, admin *AdminUser) (WarehouseDataScope, error) {
	if admin == nil || !admin.IsActive() {
		return WarehouseDataScope{Mode: DataScopeModeNone, WarehouseIDs: []int{}}, ErrForbidden
	}
	if admin.IsSuperAdmin {
		return EffectiveWarehouseDataScope(true, nil), nil
	}
	roleKeys := AdminRoleKeys(admin)
	if len(roleKeys) == 0 {
		return EffectiveWarehouseDataScope(false, nil), nil
	}
	scopeRepo, ok := uc.repo.(RoleDataScopeRepo)
	if !ok {
		return EffectiveWarehouseDataScope(false, nil), nil
	}
	scopes, err := scopeRepo.ListRoleDataScopesByRoleKeys(ctx, roleKeys)
	if err != nil {
		return WarehouseDataScope{}, err
	}
	return EffectiveWarehouseDataScope(false, scopes), nil
}

func (uc *AdminManageUsecase) SetRoleDataScopes(
	ctx context.Context,
	roleKey string,
	scopes []RoleDataScope,
	expectedVersion int,
) (*AdminRole, error) {
	operator, err := uc.requireActiveAdmin(ctx)
	if err != nil {
		return nil, err
	}
	roleKey = NormalizeRoleKey(roleKey)
	if roleKey == "" || expectedVersion <= 0 {
		return nil, ErrBadParam
	}
	if !operator.IsSuperAdmin && AdminHasRole(operator, roleKey) {
		return nil, ErrAdminSelfRolePermissionForbidden
	}
	role, err := uc.repo.GetRoleByKey(ctx, roleKey)
	if err != nil {
		return nil, err
	}
	if role == nil || role.Disabled {
		return nil, ErrRoleNotFound
	}
	if IsSystemManagedRole(*role) {
		return nil, ErrSystemRoleImmutable
	}
	if role.Version != expectedVersion {
		return nil, ErrRoleVersionConflict
	}
	normalized, err := NormalizeRoleDataScopes(scopes)
	if err != nil {
		return nil, err
	}
	scopeRepo, ok := uc.repo.(RoleDataScopeRepo)
	if !ok {
		return nil, ErrBadParam
	}
	return scopeRepo.SetRoleDataScopesWithAudit(ctx, &RoleDataScopesChangeCommand{
		RoleKey: roleKey, OperatorID: operator.ID, ExpectedVersion: expectedVersion, Scopes: normalized,
	})
}

func (uc *AdminManageUsecase) RecordWorkflowBreakGlassAudit(
	ctx context.Context,
	operator *AdminUser,
	task *WorkflowTask,
	actionKey string,
	nextStatusKey string,
	reason string,
	expiresAt time.Time,
) error {
	event, err := BuildWorkflowBreakGlassAuditEvent(operator, task, actionKey, nextStatusKey, reason, expiresAt)
	if err != nil {
		return err
	}
	return uc.repo.RecordRuntimeAuditEvent(ctx, event)
}

func BuildWorkflowBreakGlassAuditEvent(
	operator *AdminUser,
	task *WorkflowTask,
	actionKey string,
	nextStatusKey string,
	reason string,
	expiresAt time.Time,
) (*RuntimeAuditEventCreate, error) {
	if operator == nil || task == nil {
		return nil, ErrBadParam
	}
	actionKey = strings.TrimSpace(actionKey)
	nextStatusKey = strings.TrimSpace(nextStatusKey)
	reason = strings.TrimSpace(reason)
	if actionKey == "" || nextStatusKey == "" || reason == "" || expiresAt.IsZero() {
		return nil, ErrBadParam
	}
	targetKey := fmt.Sprintf("workflow_task/%d", task.ID)
	if strings.TrimSpace(task.TaskCode) != "" {
		targetKey = strings.TrimSpace(task.TaskCode)
	}
	payload := map[string]any{
		"action": workflowBreakGlassEventKey,
		"actor": map[string]any{
			"id":             operator.ID,
			"username":       operator.Username,
			"role_keys":      AdminRoleKeys(operator),
			"is_super_admin": operator.IsSuperAdmin,
		},
		"target": map[string]any{
			"type": "workflow_task",
			"id":   task.ID,
			"key":  targetKey,
		},
		"break_glass": map[string]any{
			"action_key":                actionKey,
			"reason":                    reason,
			"expires_at":                expiresAt.UTC().Format(time.RFC3339),
			"requested_next_status_key": nextStatusKey,
		},
		"task": map[string]any{
			"task_group":      task.TaskGroup,
			"source_type":     task.SourceType,
			"source_id":       task.SourceID,
			"owner_role_key":  task.OwnerRoleKey,
			"task_status_key": task.TaskStatusKey,
		},
	}
	return &RuntimeAuditEventCreate{
		EventType: workflowBreakGlassEventType,
		EventKey:  workflowBreakGlassEventKey,
		Source:    workflowBreakGlassSource,
		Payload:   payload,
	}, nil
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
	if username := strings.TrimSpace(anyToString(actor["username"])); username != "" {
		return username
	}
	return strings.TrimSpace(anyToString(actor["id"]))
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
	case "admin_user.revoked":
		return "账号正式注销", "high"
	case "admin_user.password.reset":
		return "密码重置", "high"
	case "role.permissions.set":
		return "角色权限变更", "high"
	case "role.navigation.set":
		return "岗位菜单布局变更", "warning"
	case "customer_config.publish":
		return "客户配置发布", "high"
	case "customer_config.activate":
		return "客户配置激活", "high"
	case "customer_config.rollback":
		return "客户配置回滚", "high"
	case workflowBreakGlassEventKey:
		return "Workflow break-glass 请求", "high"
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
	case "admin_user.revoked":
		return actor + " 正式注销了 " + target
	case "admin_user.roles.set":
		return actor + " 调整了 " + target + " 的账号角色"
	case "role.permissions.set":
		return actor + " 调整了 " + target + " 的角色权限"
	case "role.navigation.set":
		return actor + " 调整了 " + target + " 的岗位菜单布局"
	case "customer_config.publish":
		return actor + " 发布了客户配置 " + target
	case "customer_config.activate":
		return actor + " 激活了客户配置 " + target
	case "customer_config.rollback":
		return actor + " 回滚了客户配置 " + target
	case workflowBreakGlassEventKey:
		return actor + " 对 " + target + " 发起了 Workflow break-glass 请求"
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
	if err := ValidateAdminPassword(password); err != nil {
		span.SetStatus(codes.Error, ErrBadParam.Error())
		return nil, ErrBadParam
	}
	normalizedRoleKeys, err := uc.normalizeAssignableAdminRoleKeys(ctx, roleKeys, operator)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

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

	created, err = uc.repo.CreateAdminWithAudit(ctx, &AdminCreateCommand{
		OperatorID: operator.ID,
		Admin: &AdminCreate{
			Username:     username,
			Phone:        normalizedPhone,
			PasswordHash: string(hash),
			RoleKeys:     normalizedRoleKeys,
		},
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
	if operator.ID == target.ID {
		return nil, ErrAdminSelfRoleChangeForbidden
	}
	if target.IsSuperAdmin {
		return nil, ErrNoPermission
	}
	if err := ValidateAdminControlTarget(operator, target); err != nil {
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if target.AccountStatus() == AdminAccountStatusRevoked {
		return nil, ErrAdminRevoked
	}
	normalizedRoleKeys, err := uc.normalizeAssignableAdminRoleKeys(ctx, roleKeys, operator)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	target, err = uc.repo.SetAdminRolesWithAudit(ctx, &AdminRolesChange{
		AdminID: adminID, OperatorID: operator.ID, RoleKeys: normalizedRoleKeys,
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	span.SetStatus(codes.Ok, "OK")
	return target, nil
}

func (uc *AdminManageUsecase) normalizeAssignableAdminRoleKeys(
	ctx context.Context,
	roleKeys []string,
	operator *AdminUser,
) ([]string, error) {
	if operator == nil {
		return nil, ErrForbidden
	}
	normalizedRoleKeys := NormalizeAdminRoleKeys(roleKeys)
	if len(normalizedRoleKeys) == 0 {
		return normalizedRoleKeys, nil
	}
	roles, err := uc.repo.ListRoles(ctx)
	if err != nil {
		return nil, err
	}
	assignable := map[string]AdminRole{}
	for _, role := range roles {
		key := NormalizeRoleKey(role.Key)
		if key == "" || role.Disabled {
			continue
		}
		assignable[key] = role
	}
	for _, key := range normalizedRoleKeys {
		role, ok := assignable[key]
		if !ok {
			return nil, ErrRoleNotFound
		}
		if err := ValidateRoleAssignment(
			role,
			operator.IsSuperAdmin,
			uc.roleAssignmentContext.Environment,
		); err != nil {
			return nil, err
		}
	}
	return normalizedRoleKeys, nil
}

func (uc *AdminManageUsecase) ListRoles(ctx context.Context) ([]AdminRole, error) {
	roles, _, err := uc.ListRolesWithAccess(ctx)
	return roles, err
}

func (uc *AdminManageUsecase) GetRoleForAccessExplanation(ctx context.Context, roleKey string) (*AdminRole, error) {
	if _, err := uc.requireActiveAdmin(ctx); err != nil {
		return nil, err
	}
	roleKey = NormalizeRoleKey(roleKey)
	if roleKey == "" {
		return nil, ErrRoleNotFound
	}
	return uc.repo.GetRoleByKey(ctx, roleKey)
}

func (uc *AdminManageUsecase) ListRolesWithAccess(ctx context.Context) ([]AdminRole, map[string]AdminRoleAccess, error) {
	operator, err := uc.requireActiveAdmin(ctx)
	if err != nil {
		return nil, nil, err
	}
	roles, err := uc.repo.ListRoles(ctx)
	if err != nil {
		return nil, nil, err
	}
	accessByRoleKey := make(map[string]AdminRoleAccess, len(roles))
	for _, role := range roles {
		roleKey := NormalizeRoleKey(role.Key)
		if roleKey == "" {
			continue
		}
		accessByRoleKey[roleKey] = uc.roleAccessForOperator(role, operator)
	}
	return roles, accessByRoleKey, nil
}

func (uc *AdminManageUsecase) roleAccessForOperator(role AdminRole, operator *AdminUser) AdminRoleAccess {
	access := AdminRoleAccess{}
	if operator == nil || !operator.IsActive() {
		access.AssignmentBlockedReason = "当前账号不可用"
		access.PermissionsEditBlockedReason = "当前账号不可用"
		return access
	}

	if !AdminHasPermission(operator, PermissionSystemUserRoleAssign) {
		access.AssignmentBlockedReason = "当前账号没有分配角色的权限"
	} else if err := ValidateRoleAssignment(
		role,
		operator.IsSuperAdmin,
		uc.roleAssignmentContext.Environment,
	); err != nil {
		access.AssignmentBlockedReason = adminRoleAssignmentBlockedReason(err)
	} else {
		access.Assignable = true
	}

	switch {
	case !AdminHasPermission(operator, PermissionSystemRolePermissionManage):
		access.PermissionsEditBlockedReason = "当前账号没有维护角色权限的权限"
	case role.Disabled:
		access.PermissionsEditBlockedReason = "该角色已经停用"
	case IsSystemManagedRole(role):
		access.PermissionsEditBlockedReason = "产品系统角色由系统统一维护"
	case !operator.IsSuperAdmin && AdminHasRole(operator, role.Key):
		access.PermissionsEditBlockedReason = "当前登录账号正在使用该角色"
	default:
		access.PermissionsEditable = true
	}
	return access
}

func adminRoleAssignmentBlockedReason(err error) string {
	switch {
	case errors.Is(err, ErrRoleNotFound):
		return "角色已停用或资料不完整"
	case errors.Is(err, ErrPrivilegedRoleAssignmentForbidden):
		return "只有超级管理员可以分配产品系统角色"
	case errors.Is(err, ErrDebugRoleProductionForbidden):
		return "当前部署环境不开放调试角色"
	case errors.Is(err, ErrPermissionNotDelegable):
		return "角色包含不可委派的系统或调试权限"
	default:
		return "当前账号不能分配该角色"
	}
}

func (uc *AdminManageUsecase) ListPermissions(ctx context.Context) ([]AdminPermission, error) {
	if _, err := uc.requireActiveAdmin(ctx); err != nil {
		return nil, err
	}
	return uc.repo.ListPermissions(ctx)
}

func (uc *AdminManageUsecase) SetRolePermissions(
	ctx context.Context,
	roleKey string,
	permissionKeys []string,
	expectedVersion int,
) (*AdminRole, error) {
	operator, err := uc.requireActiveAdmin(ctx)
	if err != nil {
		return nil, err
	}
	roleKey = NormalizeRoleKey(roleKey)
	if roleKey == "" || expectedVersion <= 0 {
		return nil, ErrBadParam
	}
	if !operator.IsSuperAdmin && AdminHasRole(operator, roleKey) {
		return nil, ErrAdminSelfRolePermissionForbidden
	}
	role, err := uc.repo.GetRoleByKey(ctx, roleKey)
	if err != nil {
		return nil, err
	}
	if role == nil || role.Disabled {
		return nil, ErrRoleNotFound
	}
	if IsSystemManagedRole(*role) {
		return nil, ErrSystemRoleImmutable
	}
	if role.Version != expectedVersion {
		return nil, ErrRoleVersionConflict
	}
	normalizedPermissionKeys, err := NormalizePermissionKeysStrict(permissionKeys)
	if err != nil {
		return nil, err
	}
	if err := ValidateAssignablePermissionKeys(normalizedPermissionKeys); err != nil {
		return nil, err
	}
	updated, err := uc.repo.SetRolePermissionsWithAudit(ctx, &RolePermissionsChange{
		RoleKey: roleKey, OperatorID: operator.ID, ExpectedVersion: expectedVersion,
		PermissionKeys: normalizedPermissionKeys,
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

func (uc *AdminManageUsecase) SetRoleNavigation(
	ctx context.Context,
	roleKey string,
	mode RoleNavigationMode,
	primaryMenuPaths []string,
	expectedVersion int,
) (*AdminRole, error) {
	operator, err := uc.requireActiveAdmin(ctx)
	if err != nil {
		return nil, err
	}
	roleKey = NormalizeRoleKey(roleKey)
	if roleKey == "" || expectedVersion <= 0 {
		return nil, ErrBadParam
	}
	if !operator.IsSuperAdmin && AdminHasRole(operator, roleKey) {
		return nil, ErrAdminSelfRolePermissionForbidden
	}
	role, err := uc.repo.GetRoleByKey(ctx, roleKey)
	if err != nil {
		return nil, err
	}
	if role == nil || role.Disabled {
		return nil, ErrRoleNotFound
	}
	if IsSystemManagedRole(*role) {
		return nil, ErrSystemRoleImmutable
	}
	if role.Version != expectedVersion {
		return nil, ErrRoleVersionConflict
	}
	settings, err := NormalizeRoleNavigationSettings(mode, primaryMenuPaths)
	if err != nil {
		return nil, err
	}
	return uc.repo.SetRoleNavigationWithAudit(ctx, &RoleNavigationChange{
		RoleKey:          roleKey,
		OperatorID:       operator.ID,
		ExpectedVersion:  expectedVersion,
		Mode:             settings.Mode,
		PrimaryMenuPaths: settings.PrimaryMenuPaths,
	})
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
	if err := ValidateAdminControlTarget(operator, target); err != nil {
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if target.AccountStatus() == AdminAccountStatusRevoked {
		return nil, ErrAdminRevoked
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

	updated, err = uc.repo.SetAdminPhoneWithAudit(ctx, &AdminPhoneChange{
		AdminID: adminID, OperatorID: operator.ID, Phone: normalizedPhone,
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	span.SetStatus(codes.Ok, "OK")
	return updated, nil
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
	reason string,
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
	if err := ValidateAdminControlTarget(operator, target); err != nil {
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if operator.ID == target.ID {
		span.SetStatus(codes.Error, ErrNoPermission.Error())
		return nil, ErrNoPermission
	}
	if target.AccountStatus() == AdminAccountStatusRevoked {
		span.SetStatus(codes.Error, ErrAdminRevoked.Error())
		return nil, ErrAdminRevoked
	}
	reason = strings.TrimSpace(reason)
	if disabled && reason == "" {
		span.SetStatus(codes.Error, ErrBadParam.Error())
		return nil, ErrBadParam
	}
	if len([]rune(reason)) > 255 {
		span.SetStatus(codes.Error, ErrBadParam.Error())
		return nil, ErrBadParam
	}
	updated, _, err = uc.repo.ChangeAdminLifecycle(ctx, &AdminLifecycleChange{
		AdminID: adminID, OperatorID: operator.ID, Disabled: disabled,
		Reason: reason,
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	span.SetStatus(codes.Ok, "OK")
	return updated, nil
}

func (uc *AdminManageUsecase) Revoke(ctx context.Context, adminID int, reason string) (*AdminUser, int, error) {
	operator, err := uc.requireActiveAdmin(ctx)
	if err != nil {
		return nil, 0, err
	}
	if adminID <= 0 || strings.TrimSpace(reason) == "" || len([]rune(strings.TrimSpace(reason))) > 255 {
		return nil, 0, ErrBadParam
	}
	target, err := uc.repo.GetAdminByID(ctx, adminID)
	if err != nil {
		return nil, 0, err
	}
	if operator.ID == target.ID {
		return nil, 0, ErrNoPermission
	}
	if err := ValidateAdminControlTarget(operator, target); err != nil {
		return nil, 0, err
	}
	if target.AccountStatus() == AdminAccountStatusRevoked {
		return nil, 0, ErrAdminRevoked
	}
	reason = strings.TrimSpace(reason)
	updated, released, err := uc.repo.ChangeAdminLifecycle(ctx, &AdminLifecycleChange{
		AdminID: adminID, OperatorID: operator.ID, Disabled: true, Revoke: true,
		Reason: reason,
	})
	if err != nil {
		return nil, 0, err
	}
	return updated, released, nil
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
	if adminID <= 0 || ValidateAdminPassword(password) != nil {
		span.SetStatus(codes.Error, ErrBadParam.Error())
		return nil, ErrBadParam
	}

	target, err := uc.repo.GetAdminByID(ctx, adminID)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if err := ValidateAdminControlTarget(operator, target); err != nil {
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}
	if target.AccountStatus() == AdminAccountStatusRevoked {
		return nil, ErrAdminRevoked
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	updated, err = uc.repo.ResetAdminPasswordWithAudit(ctx, &AdminPasswordReset{
		AdminID: adminID, OperatorID: operator.ID, PasswordHash: string(hash),
	})
	if err != nil {
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		return nil, err
	}

	span.SetStatus(codes.Ok, "OK")
	return updated, nil
}
