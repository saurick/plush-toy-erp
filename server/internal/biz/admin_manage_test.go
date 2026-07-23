package biz

import (
	"context"
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	"golang.org/x/crypto/bcrypt"
)

type stubAdminManageRepo struct {
	adminsByID           map[int]*AdminUser
	adminsByName         map[string]*AdminUser
	adminsByPhone        map[string]*AdminUser
	customRoles          map[string]AdminRole
	rolePerms            map[string][]string
	roleNavigation       map[string]RoleNavigationSettings
	roleVersions         map[string]int
	auditEvents          []RuntimeAuditEvent
	nextID               int
	getAdminByIDCalls    int
	getAdminByIDErrAfter int
	getAdminByIDErr      error
}

var _ AdminManageRepo = (*stubAdminManageRepo)(nil)

func newStubAdminManageRepo() *stubAdminManageRepo {
	return &stubAdminManageRepo{
		adminsByID:     map[int]*AdminUser{},
		adminsByName:   map[string]*AdminUser{},
		adminsByPhone:  map[string]*AdminUser{},
		customRoles:    map[string]AdminRole{},
		rolePerms:      map[string][]string{},
		roleNavigation: map[string]RoleNavigationSettings{},
		roleVersions:   map[string]int{},
		auditEvents:    []RuntimeAuditEvent{},
		nextID:         10,
	}
}

func (r *stubAdminManageRepo) clone(admin *AdminUser) *AdminUser {
	if admin == nil {
		return nil
	}
	cloned := *admin
	cloned.Roles = append([]AdminRole(nil), admin.Roles...)
	cloned.Permissions = append([]string(nil), admin.Permissions...)
	cloned.ERPPreferences = NormalizeAdminERPPreferences(admin.ERPPreferences)
	return &cloned
}

func (r *stubAdminManageRepo) roleByKey(roleKey string) AdminRole {
	normalized := NormalizeRoleKey(roleKey)
	for _, role := range BuiltinRoles() {
		if role.Key == normalized {
			permissions := r.rolePerms[role.Key]
			if permissions == nil {
				permissions = role.Permissions
			}
			navigation := RoleNavigationSettings{
				Mode:             RoleNavigationModeRecommended,
				PrimaryMenuPaths: []string{},
			}
			if configured, ok := r.roleNavigation[role.Key]; ok {
				navigation = configured
			}
			return AdminRole{
				Key:              role.Key,
				Name:             role.Name,
				Description:      role.Description,
				Builtin:          role.Builtin,
				Disabled:         role.Disabled,
				SortOrder:        role.SortOrder,
				Type:             role.Type,
				Version:          max(role.Version, r.roleVersions[role.Key]),
				NavigationMode:   navigation.Mode,
				PrimaryMenuPaths: navigation.PrimaryMenuPaths,
				Permissions:      NormalizePermissionKeys(permissions),
			}
		}
	}
	if role, ok := r.customRoles[normalized]; ok {
		permissions := r.rolePerms[role.Key]
		if permissions == nil {
			permissions = role.Permissions
		}
		role.Permissions = NormalizePermissionKeys(permissions)
		return role
	}
	return AdminRole{}
}

func (r *stubAdminManageRepo) addCustomRole(role AdminRole) {
	role.Key = NormalizeRoleKey(role.Key)
	if role.Key == "" {
		return
	}
	role.Builtin = false
	role.Type = NormalizeRoleType(role.Type, role.Key, role.Builtin)
	if role.Version <= 0 {
		role.Version = 1
	}
	role.Permissions = NormalizePermissionKeys(role.Permissions)
	r.customRoles[role.Key] = role
}

func (r *stubAdminManageRepo) permissionsForRoleKeys(roleKeys []string) []string {
	permissionSet := map[string]struct{}{}
	for _, roleKey := range NormalizeAdminRoleKeys(roleKeys) {
		perms, ok := r.rolePerms[roleKey]
		if !ok {
			for _, role := range BuiltinRoles() {
				if role.Key == roleKey {
					perms = role.Permissions
					break
				}
			}
			if role, exists := r.customRoles[roleKey]; exists {
				perms = role.Permissions
			}
		}
		for _, permissionKey := range NormalizePermissionKeys(perms) {
			permissionSet[permissionKey] = struct{}{}
		}
	}
	out := make([]string, 0, len(permissionSet))
	for _, permissionKey := range AllPermissionKeys() {
		if _, ok := permissionSet[permissionKey]; ok {
			out = append(out, permissionKey)
		}
	}
	return out
}

func (r *stubAdminManageRepo) applyAdminRoles(admin *AdminUser, roleKeys []string) {
	normalized := NormalizeAdminRoleKeys(roleKeys)
	admin.Roles = admin.Roles[:0]
	for _, roleKey := range normalized {
		admin.Roles = append(admin.Roles, r.roleByKey(roleKey))
	}
	admin.Permissions = r.permissionsForRoleKeys(normalized)
}

func (r *stubAdminManageRepo) GetAdminByID(_ context.Context, id int) (*AdminUser, error) {
	r.getAdminByIDCalls++
	if r.getAdminByIDErrAfter > 0 && r.getAdminByIDCalls > r.getAdminByIDErrAfter {
		if r.getAdminByIDErr != nil {
			return nil, r.getAdminByIDErr
		}
		return nil, errors.New("unexpected post-commit admin read")
	}
	admin, ok := r.adminsByID[id]
	if !ok {
		return nil, ErrAdminNotFound
	}
	return r.clone(admin), nil
}

func (r *stubAdminManageRepo) GetAdminByUsername(_ context.Context, username string) (*AdminUser, error) {
	admin, ok := r.adminsByName[username]
	if !ok {
		return nil, ErrAdminNotFound
	}
	return r.clone(admin), nil
}

func (r *stubAdminManageRepo) GetAdminByPhone(_ context.Context, phone string) (*AdminUser, error) {
	admin, ok := r.adminsByPhone[phone]
	if !ok {
		return nil, ErrAdminNotFound
	}
	return r.clone(admin), nil
}

func (r *stubAdminManageRepo) ListAdmins(_ context.Context) ([]*AdminUser, error) {
	out := make([]*AdminUser, 0, len(r.adminsByID))
	for _, admin := range r.adminsByID {
		out = append(out, r.clone(admin))
	}
	return out, nil
}

func (r *stubAdminManageRepo) CreateAdminWithAudit(ctx context.Context, command *AdminCreateCommand) (*AdminUser, error) {
	if command == nil || command.Admin == nil {
		return nil, ErrBadParam
	}
	operator, ok := r.adminsByID[command.OperatorID]
	if !ok {
		return nil, ErrAdminNotFound
	}
	admin := command.Admin
	if _, exists := r.adminsByName[admin.Username]; exists {
		return nil, ErrAdminExists
	}
	r.nextID++
	now := time.Now()
	created := &AdminUser{
		ID:           r.nextID,
		Username:     admin.Username,
		Phone:        admin.Phone,
		PasswordHash: admin.PasswordHash,
		Disabled:     false,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	r.applyAdminRoles(created, admin.RoleKeys)
	r.adminsByID[created.ID] = created
	r.adminsByName[created.Username] = created
	if created.Phone != "" {
		r.adminsByPhone[created.Phone] = created
	}
	event, err := BuildAdminControlAuditEvent(
		operator, "admin_user.create", "admin_user", created.ID, created.Username,
		nil, AdminAuditUserSnapshot(created),
	)
	if err != nil {
		return nil, err
	}
	if err := r.RecordRuntimeAuditEvent(ctx, event); err != nil {
		return nil, err
	}
	return r.clone(created), nil
}

func (r *stubAdminManageRepo) SetAdminRolesWithAudit(ctx context.Context, change *AdminRolesChange) (*AdminUser, error) {
	if change == nil {
		return nil, ErrBadParam
	}
	admin, ok := r.adminsByID[change.AdminID]
	if !ok {
		return nil, ErrAdminNotFound
	}
	operator, ok := r.adminsByID[change.OperatorID]
	if !ok {
		return nil, ErrAdminNotFound
	}
	before := AdminAuditUserSnapshot(admin)
	r.applyAdminRoles(admin, change.RoleKeys)
	admin.UpdatedAt = time.Now()
	event, err := BuildAdminControlAuditEvent(
		operator, "admin_user.roles.set", "admin_user", admin.ID, admin.Username,
		before, AdminAuditUserSnapshot(admin),
	)
	if err != nil {
		return nil, err
	}
	if err := r.RecordRuntimeAuditEvent(ctx, event); err != nil {
		return nil, err
	}
	return r.clone(admin), nil
}

func (r *stubAdminManageRepo) ListRoles(_ context.Context) ([]AdminRole, error) {
	defs := BuiltinRoles()
	out := make([]AdminRole, 0, len(defs)+len(r.customRoles))
	for _, role := range defs {
		out = append(out, r.roleByKey(role.Key))
	}
	for _, role := range r.customRoles {
		out = append(out, r.roleByKey(role.Key))
	}
	return out, nil
}

func (r *stubAdminManageRepo) ListPermissions(_ context.Context) ([]AdminPermission, error) {
	defs := BuiltinPermissions()
	out := make([]AdminPermission, 0, len(defs))
	for _, permission := range defs {
		out = append(out, AdminPermission{
			Key:               permission.Key,
			Name:              permission.Name,
			Description:       permission.Description,
			Module:            permission.Module,
			Action:            permission.Action,
			Resource:          permission.Resource,
			Builtin:           permission.Builtin,
			Class:             permission.Class,
			Assignable:        permission.Assignable,
			NonProductionOnly: permission.NonProductionOnly,
		})
	}
	return out, nil
}

func (r *stubAdminManageRepo) GetRoleByKey(_ context.Context, roleKey string) (*AdminRole, error) {
	role := r.roleByKey(roleKey)
	if role.Key == "" {
		return nil, ErrRoleNotFound
	}
	return &role, nil
}

func (r *stubAdminManageRepo) SetRolePermissionsWithAudit(ctx context.Context, change *RolePermissionsChange) (*AdminRole, error) {
	if change == nil {
		return nil, ErrBadParam
	}
	role := r.roleByKey(change.RoleKey)
	if role.Key == "" {
		return nil, ErrRoleNotFound
	}
	if role.Version != change.ExpectedVersion {
		return nil, ErrRoleVersionConflict
	}
	operator, ok := r.adminsByID[change.OperatorID]
	if !ok {
		return nil, ErrAdminNotFound
	}
	before := AdminAuditRoleSnapshot(&role)
	r.rolePerms[role.Key] = NormalizePermissionKeys(change.PermissionKeys)
	nextVersion := role.Version + 1
	r.roleVersions[role.Key] = nextVersion
	if customRole, ok := r.customRoles[role.Key]; ok {
		customRole.Version = nextVersion
		r.customRoles[role.Key] = customRole
	}
	for _, admin := range r.adminsByID {
		roleKeys := make([]string, 0, len(admin.Roles))
		for _, item := range admin.Roles {
			roleKeys = append(roleKeys, item.Key)
		}
		r.applyAdminRoles(admin, roleKeys)
	}
	updated := r.roleByKey(role.Key)
	event, err := BuildAdminControlAuditEvent(
		operator, "role.permissions.set", "role", updated.ID, updated.Key,
		before, AdminAuditRoleSnapshot(&updated),
	)
	if err != nil {
		return nil, err
	}
	if err := r.RecordRuntimeAuditEvent(ctx, event); err != nil {
		return nil, err
	}
	return &updated, nil
}

func (r *stubAdminManageRepo) SetRoleNavigationWithAudit(
	_ context.Context,
	change *RoleNavigationChange,
) (*AdminRole, error) {
	if change == nil || change.ExpectedVersion <= 0 {
		return nil, ErrBadParam
	}
	role := r.roleByKey(change.RoleKey)
	if role.Key == "" {
		return nil, ErrRoleNotFound
	}
	if role.Version != change.ExpectedVersion {
		return nil, ErrRoleVersionConflict
	}
	settings, err := NormalizeRoleNavigationSettings(
		change.Mode,
		change.PrimaryMenuPaths,
	)
	if err != nil {
		return nil, err
	}
	r.roleNavigation[role.Key] = settings
	r.roleVersions[role.Key] = role.Version + 1
	updated := r.roleByKey(role.Key)
	return &updated, nil
}

func (r *stubAdminManageRepo) SetAdminPhoneWithAudit(ctx context.Context, change *AdminPhoneChange) (*AdminUser, error) {
	if change == nil {
		return nil, ErrBadParam
	}
	admin, ok := r.adminsByID[change.AdminID]
	if !ok {
		return nil, ErrAdminNotFound
	}
	operator, ok := r.adminsByID[change.OperatorID]
	if !ok {
		return nil, ErrAdminNotFound
	}
	before := AdminAuditUserSnapshot(admin)
	if admin.Phone != "" {
		delete(r.adminsByPhone, admin.Phone)
	}
	admin.Phone = change.Phone
	if change.Phone != "" {
		r.adminsByPhone[change.Phone] = admin
	}
	event, err := BuildAdminControlAuditEvent(
		operator, "admin_user.phone.set", "admin_user", admin.ID, admin.Username,
		before, AdminAuditUserSnapshot(admin),
	)
	if err != nil {
		return nil, err
	}
	if err := r.RecordRuntimeAuditEvent(ctx, event); err != nil {
		return nil, err
	}
	return r.clone(admin), nil
}

func (r *stubAdminManageRepo) UpdateAdminERPColumnOrder(_ context.Context, id int, moduleKey string, order []string) error {
	admin, ok := r.adminsByID[id]
	if !ok {
		return ErrAdminNotFound
	}
	preferences := NormalizeAdminERPPreferences(admin.ERPPreferences)
	if preferences.ColumnOrders == nil {
		preferences.ColumnOrders = map[string][]string{}
	}
	normalizedOrder := NormalizeAdminERPColumnOrder(order)
	if len(normalizedOrder) == 0 {
		delete(preferences.ColumnOrders, moduleKey)
	} else {
		preferences.ColumnOrders[moduleKey] = normalizedOrder
	}
	admin.ERPPreferences = NormalizeAdminERPPreferences(preferences)
	return nil
}

func (r *stubAdminManageRepo) ChangeAdminLifecycle(ctx context.Context, change *AdminLifecycleChange) (*AdminUser, int, error) {
	if change == nil {
		return nil, 0, ErrBadParam
	}
	admin, ok := r.adminsByID[change.AdminID]
	if !ok {
		return nil, 0, ErrAdminNotFound
	}
	operator, ok := r.adminsByID[change.OperatorID]
	if !ok {
		return nil, 0, ErrAdminNotFound
	}
	if !change.Revoke && admin.Disabled == change.Disabled {
		return r.clone(admin), 0, nil
	}
	before := AdminAuditUserSnapshot(admin)
	admin.Disabled = change.Disabled
	admin.AuthVersion++
	admin.StatusReason = change.Reason
	now := time.Now()
	admin.StatusChangedAt = &now
	admin.StatusChangedBy = &change.OperatorID
	if change.Revoke {
		admin.RevokedAt = &now
	}
	action := "admin_user.disabled.set"
	if change.Revoke {
		action = "admin_user.revoked"
	}
	event, err := BuildAdminControlAuditEvent(
		operator, action, "admin_user", admin.ID, admin.Username,
		before, AdminAuditUserSnapshot(admin),
	)
	if err != nil {
		return nil, 0, err
	}
	if err := r.RecordRuntimeAuditEvent(ctx, event); err != nil {
		return nil, 0, err
	}
	return r.clone(admin), 0, nil
}

func (r *stubAdminManageRepo) ResetAdminPasswordWithAudit(ctx context.Context, reset *AdminPasswordReset) (*AdminUser, error) {
	if reset == nil {
		return nil, ErrBadParam
	}
	admin, ok := r.adminsByID[reset.AdminID]
	if !ok {
		return nil, ErrAdminNotFound
	}
	operator, ok := r.adminsByID[reset.OperatorID]
	if !ok {
		return nil, ErrAdminNotFound
	}
	admin.PasswordHash = reset.PasswordHash
	admin.AuthVersion++
	event, err := BuildAdminControlAuditEvent(
		operator, "admin_user.password.reset", "admin_user", admin.ID, admin.Username,
		map[string]any{"password_reset": false}, map[string]any{"password_reset": true},
	)
	if err != nil {
		return nil, err
	}
	if err := r.RecordRuntimeAuditEvent(ctx, event); err != nil {
		return nil, err
	}
	return r.clone(admin), nil
}

func (r *stubAdminManageRepo) RecordRuntimeAuditEvent(_ context.Context, event *RuntimeAuditEventCreate) error {
	if event == nil {
		return ErrBadParam
	}
	payload := map[string]any{}
	for key, value := range event.Payload {
		payload[key] = value
	}
	r.auditEvents = append(r.auditEvents, RuntimeAuditEvent{
		ID:        len(r.auditEvents) + 1,
		EventType: event.EventType,
		EventKey:  event.EventKey,
		Source:    event.Source,
		Payload:   payload,
		CreatedAt: time.Now(),
	})
	return nil
}

func (r *stubAdminManageRepo) ListRuntimeAuditEvents(_ context.Context, filter RuntimeAuditEventListFilter) (RuntimeAuditEventListResult, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}
	filtered := make([]RuntimeAuditEvent, 0, len(r.auditEvents))
	for _, event := range r.auditEvents {
		if filter.Source != "" && event.Source != filter.Source {
			continue
		}
		if filter.EventType != "" && event.EventType != filter.EventType {
			continue
		}
		if filter.EventKey != "" && event.EventKey != filter.EventKey {
			continue
		}
		if !filter.CreatedFrom.IsZero() && event.CreatedAt.Before(filter.CreatedFrom) {
			continue
		}
		if !filter.CreatedTo.IsZero() && event.CreatedAt.After(filter.CreatedTo) {
			continue
		}
		payloadText := strings.ToLower(anyToString(event.Payload))
		if filter.ActorKey != "" && !strings.Contains(payloadText, strings.ToLower(filter.ActorKey)) {
			continue
		}
		if filter.TargetType != "" && !strings.Contains(payloadText, strings.ToLower(filter.TargetType)) {
			continue
		}
		if filter.TargetKey != "" && !strings.Contains(payloadText, strings.ToLower(filter.TargetKey)) {
			continue
		}
		if keyword := strings.ToLower(strings.TrimSpace(filter.Keyword)); keyword != "" {
			haystack := strings.ToLower(event.EventType + " " + event.EventKey + " " + event.Source + " " + anyToString(event.Payload))
			if !strings.Contains(haystack, keyword) {
				continue
			}
		}
		filtered = append(filtered, event)
	}
	end := offset + limit
	if offset > len(filtered) {
		offset = len(filtered)
	}
	if end > len(filtered) {
		end = len(filtered)
	}
	return RuntimeAuditEventListResult{
		Events: filtered[offset:end],
		Total:  len(filtered),
		Limit:  limit,
		Offset: offset,
	}, nil
}

func TestAdminManageUsecase_ListRuntimeAuditEventsEnrichesEvents(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{
		ID:          1,
		Username:    "root",
		Permissions: []string{PermissionSystemAuditRead},
	}
	repo.adminsByName["root"] = repo.adminsByID[1]
	now := time.Now()
	repo.auditEvents = append(repo.auditEvents, RuntimeAuditEvent{
		ID:        1,
		EventType: "admin_control_plane",
		EventKey:  "admin_user.disabled.set",
		Source:    "admin_manage",
		Payload: map[string]any{
			"actor": map[string]any{"username": "root"},
			"target": map[string]any{
				"type": "admin_user",
				"key":  "demo_debug",
			},
			"after": map[string]any{"disabled": true},
		},
		CreatedAt: now,
	})

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})
	result, err := uc.ListRuntimeAuditEvents(ctx, RuntimeAuditEventListFilter{
		ActorKey:   "root",
		TargetKey:  "demo_debug",
		TargetType: "admin_user",
		Keyword:    "disabled",
	})
	if err != nil {
		t.Fatalf("ListRuntimeAuditEvents() error = %v", err)
	}
	if len(result.Events) != 1 {
		t.Fatalf("expected one event, got %#v", result.Events)
	}
	event := result.Events[0]
	if event.RiskLevel != "high" || event.ActionLabel != "账号启停变更" {
		t.Fatalf("unexpected audit metadata: %#v", event)
	}
	if event.ActorKey != "root" || event.TargetType != "admin_user" || event.TargetKey != "demo_debug" {
		t.Fatalf("unexpected actor/target metadata: %#v", event)
	}
	if event.Summary != "root 禁用了 demo_debug" {
		t.Fatalf("unexpected summary: %q", event.Summary)
	}
}

func TestAdminManageUsecase_CreateAssignsRolesForStandardAdmin(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	created, err := uc.Create(ctx, "manager", "13800138000", "secret123", []string{"purchase"})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if created.Phone != "13800138000" {
		t.Fatalf("expected normalized phone, got %q", created.Phone)
	}
	if len(created.Roles) != 1 || created.Roles[0].Key != PurchaseRoleKey {
		t.Fatalf("expected purchase role, got %#v", created.Roles)
	}
	if !AdminHasPermission(created, PermissionPurchaseOrderRead) {
		t.Fatalf("expected purchase role to grant purchase permissions")
	}
	if len(repo.auditEvents) != 1 {
		t.Fatalf("expected create audit event, got %d", len(repo.auditEvents))
	}
	if repo.auditEvents[0].EventKey != "admin_user.create" {
		t.Fatalf("unexpected audit event key %q", repo.auditEvents[0].EventKey)
	}
}

func TestAdminManageUsecase_ResetPasswordUpdatesStandardAdminHash(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "manager", PasswordHash: "old"}
	repo.adminsByName["manager"] = repo.adminsByID[2]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	updated, err := uc.ResetPassword(ctx, 2, "new-secret")
	if err != nil {
		t.Fatalf("ResetPassword() error = %v", err)
	}
	if updated.PasswordHash == "old" {
		t.Fatalf("expected password hash to change")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(repo.adminsByID[2].PasswordHash), []byte("new-secret")); err != nil {
		t.Fatalf("stored hash does not match new password: %v", err)
	}
	if len(repo.auditEvents) != 1 {
		t.Fatalf("expected reset password audit event, got %d", len(repo.auditEvents))
	}
	event := repo.auditEvents[0]
	if event.EventKey != "admin_user.password.reset" {
		t.Fatalf("unexpected audit event key %q", event.EventKey)
	}
	if _, ok := event.Payload["password"]; ok {
		t.Fatalf("audit payload must not contain password")
	}
	if _, ok := event.Payload["password_hash"]; ok {
		t.Fatalf("audit payload must not contain password hash")
	}
}

func TestAdminManageUsecase_ResetPasswordRejectsSuperAdminTarget(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true, PasswordHash: "old"}
	repo.adminsByName["root"] = repo.adminsByID[1]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	_, err := uc.ResetPassword(ctx, 1, "new-secret")
	if !errors.Is(err, ErrNoPermission) {
		t.Fatalf("expected ErrNoPermission, got %v", err)
	}
	if repo.adminsByID[1].PasswordHash != "old" {
		t.Fatalf("super admin password hash should not change")
	}
}

func TestAdminManageUsecase_SetDisabledRequiresReasonAndCannotRestoreRevoked(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "worker"}
	repo.adminsByName["worker"] = repo.adminsByID[2]
	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Username: "root", Role: RoleAdmin})

	if _, err := uc.SetDisabled(ctx, 2, true, ""); !errors.Is(err, ErrBadParam) {
		t.Fatalf("missing disable reason error = %v, want ErrBadParam", err)
	}
	updated, err := uc.SetDisabled(ctx, 2, true, "临时离岗")
	if err != nil || updated.AccountStatus() != AdminAccountStatusSuspended || updated.StatusReason != "临时离岗" {
		t.Fatalf("unexpected suspended account: %#v err=%v", updated, err)
	}
	disabledAuthVersion := updated.AuthVersion
	disabledAuditCount := len(repo.auditEvents)
	idempotent, err := uc.SetDisabled(ctx, 2, true, "重复请求不应覆盖")
	if err != nil {
		t.Fatalf("idempotent SetDisabled() error = %v", err)
	}
	if idempotent.AuthVersion != disabledAuthVersion || idempotent.StatusReason != "临时离岗" {
		t.Fatalf("idempotent SetDisabled() changed account: %#v", idempotent)
	}
	if len(repo.auditEvents) != disabledAuditCount {
		t.Fatalf("idempotent SetDisabled() audit count = %d, want %d", len(repo.auditEvents), disabledAuditCount)
	}
	now := time.Now()
	repo.adminsByID[2].RevokedAt = &now
	if _, err := uc.SetDisabled(ctx, 2, false, "恢复"); !errors.Is(err, ErrAdminRevoked) {
		t.Fatalf("restore revoked error = %v, want ErrAdminRevoked", err)
	}
	if _, err := uc.SetRoles(ctx, 2, nil); !errors.Is(err, ErrAdminRevoked) {
		t.Fatalf("set roles on revoked error = %v, want ErrAdminRevoked", err)
	}
	if _, err := uc.SetPhone(ctx, 2, "13800138000"); !errors.Is(err, ErrAdminRevoked) {
		t.Fatalf("set phone on revoked error = %v, want ErrAdminRevoked", err)
	}
	if _, err := uc.ResetPassword(ctx, 2, "new-secret"); !errors.Is(err, ErrAdminRevoked) {
		t.Fatalf("reset revoked password error = %v, want ErrAdminRevoked", err)
	}
}

func TestAdminManageUsecase_RevokePreservesIdentityAndAudits(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "leaver"}
	repo.adminsByName["leaver"] = repo.adminsByID[2]
	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Username: "root", Role: RoleAdmin})

	updated, _, err := uc.Revoke(ctx, 2, "员工离职")
	if err != nil {
		t.Fatalf("Revoke() error = %v", err)
	}
	if updated.ID != 2 || updated.Username != "leaver" || updated.AccountStatus() != AdminAccountStatusRevoked {
		t.Fatalf("identity/status changed unexpectedly: %#v", updated)
	}
	if len(repo.auditEvents) != 1 || repo.auditEvents[0].EventKey != "admin_user.revoked" {
		t.Fatalf("unexpected revoke audit events: %#v", repo.auditEvents)
	}
}

func TestAdminManageUsecase_SetRolesRejectsSuperAdminSelfChangeWithStableError(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	_, err := uc.SetRoles(ctx, 1, []string{AdminRoleKey})
	if !errors.Is(err, ErrAdminSelfRoleChangeForbidden) {
		t.Fatalf("expected ErrAdminSelfRoleChangeForbidden, got %v", err)
	}
}

func TestAdminManageUsecase_SetRolesReplacesUserRoles(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "manager"}
	repo.applyAdminRoles(repo.adminsByID[2], []string{PurchaseRoleKey})
	repo.adminsByName["manager"] = repo.adminsByID[2]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	updated, err := uc.SetRoles(ctx, 2, []string{WarehouseRoleKey})
	if err != nil {
		t.Fatalf("SetRoles() error = %v", err)
	}
	if len(updated.Roles) != 1 || updated.Roles[0].Key != WarehouseRoleKey {
		t.Fatalf("expected warehouse role, got %#v", updated.Roles)
	}
	if AdminHasPermission(updated, PermissionPurchaseOrderRead) {
		t.Fatalf("expected purchase permissions to be removed")
	}
	if !AdminHasPermission(updated, PermissionWarehouseInventoryRead) {
		t.Fatalf("expected warehouse permissions to be granted")
	}
	if len(repo.auditEvents) != 1 {
		t.Fatalf("expected set roles audit event, got %d", len(repo.auditEvents))
	}
	if repo.auditEvents[0].EventKey != "admin_user.roles.set" {
		t.Fatalf("unexpected audit event key %q", repo.auditEvents[0].EventKey)
	}
}

func TestAdminManageUsecase_SetRolesComposesFinanceAndPurchaseResponsibilities(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "finance-buyer"}
	repo.adminsByName["finance-buyer"] = repo.adminsByID[2]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	updated, err := uc.SetRoles(ctx, 2, []string{FinanceRoleKey, PurchaseRoleKey})
	if err != nil {
		t.Fatalf("SetRoles() error = %v", err)
	}
	if !AdminHasRole(updated, FinanceRoleKey) || !AdminHasRole(updated, PurchaseRoleKey) {
		t.Fatalf("expected finance and purchase roles, got %#v", updated.Roles)
	}
	if !AdminHasPermission(updated, PermissionFinancePayableRead) {
		t.Fatalf("expected finance permission from finance role")
	}
	if !AdminHasPermission(updated, PermissionPurchaseOrderCreate) {
		t.Fatalf("expected purchase permission from purchase role")
	}
	if AdminHasPermission(updated, PermissionPurchaseOrderApprove) {
		t.Fatalf("finance plus purchase operator must not inherit boss approval permission")
	}
}

func TestAdminManageUsecase_SetRolesAllowsConfiguredCustomRole(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "manager"}
	repo.adminsByName["manager"] = repo.adminsByID[2]
	repo.addCustomRole(AdminRole{
		Key:         "sample_room_manager",
		Name:        "样品室主管",
		Description: "客户配置中的样品室角色",
		Permissions: []string{PermissionWorkflowTaskRead, PermissionMaterialRead},
	})

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	updated, err := uc.SetRoles(ctx, 2, []string{" sample_room_manager "})
	if err != nil {
		t.Fatalf("SetRoles() error = %v", err)
	}
	if !AdminHasRole(updated, "sample_room_manager") {
		t.Fatalf("expected configured custom role, got %#v", updated.Roles)
	}
	if !AdminHasPermission(updated, PermissionWorkflowTaskRead) {
		t.Fatalf("expected custom role permission to be granted")
	}
}

func TestAdminManageUsecase_SetRolesRejectsMissingOrDisabledRole(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "manager"}
	repo.applyAdminRoles(repo.adminsByID[2], []string{PurchaseRoleKey})
	repo.adminsByName["manager"] = repo.adminsByID[2]
	repo.addCustomRole(AdminRole{
		Key:      "disabled_custom_role",
		Name:     "已停用角色",
		Disabled: true,
	})

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	for _, roleKey := range []string{"missing_custom_role", "disabled_custom_role"} {
		if _, err := uc.SetRoles(ctx, 2, []string{roleKey}); !errors.Is(err, ErrRoleNotFound) {
			t.Fatalf("expected ErrRoleNotFound for %s, got %v", roleKey, err)
		}
		if !AdminHasRole(repo.adminsByID[2], PurchaseRoleKey) {
			t.Fatalf("existing role should remain after rejected %s assignment", roleKey)
		}
	}
}

func TestAdminManageUsecase_SetRolePermissionsRecordsAudit(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	role := repo.roleByKey(WarehouseRoleKey)
	updated, err := uc.SetRolePermissions(ctx, WarehouseRoleKey, []string{PermissionWarehouseInventoryRead}, role.Version)
	if err != nil {
		t.Fatalf("SetRolePermissions() error = %v", err)
	}
	if updated.Version != role.Version+1 {
		t.Fatalf("role version = %d, want %d", updated.Version, role.Version+1)
	}
	if len(repo.auditEvents) != 1 {
		t.Fatalf("expected role permission audit event, got %d", len(repo.auditEvents))
	}
	if repo.auditEvents[0].EventKey != "role.permissions.set" {
		t.Fatalf("unexpected audit event key %q", repo.auditEvents[0].EventKey)
	}
}

func TestAdminManageUsecase_SetRolePermissionsRejectsUnknownPermission(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin})
	before := append([]string(nil), repo.roleByKey(WarehouseRoleKey).Permissions...)

	role := repo.roleByKey(WarehouseRoleKey)
	_, err := uc.SetRolePermissions(ctx, WarehouseRoleKey, []string{
		PermissionWarehouseInventoryRead,
		"warehouse.inventory.unsupported_action",
	}, role.Version)
	if !errors.Is(err, ErrPermissionNotFound) {
		t.Fatalf("SetRolePermissions() error = %v, want ErrPermissionNotFound", err)
	}
	if got := repo.roleByKey(WarehouseRoleKey).Permissions; !slices.Equal(got, before) {
		t.Fatalf("unknown permission changed role permissions: got %#v want %#v", got, before)
	}
	if len(repo.auditEvents) != 0 {
		t.Fatalf("rejected permission change wrote audit events: %#v", repo.auditEvents)
	}
}

func TestAdminManageUsecase_SetRolesRejectsSelfEscalationAndSystemRoles(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "operator"}
	repo.applyAdminRoles(repo.adminsByID[1], []string{AdminRoleKey})
	repo.adminsByName["operator"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "manager"}
	repo.adminsByName["manager"] = repo.adminsByID[2]
	repo.adminsByID[3] = &AdminUser{ID: 3, Username: "system-operator"}
	repo.applyAdminRoles(repo.adminsByID[3], []string{AdminRoleKey})
	repo.adminsByName["system-operator"] = repo.adminsByID[3]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin})

	if _, err := uc.SetRoles(ctx, 1, []string{BossRoleKey}); !errors.Is(err, ErrAdminSelfRoleChangeForbidden) {
		t.Fatalf("self role change error = %v, want ErrAdminSelfRoleChangeForbidden", err)
	}
	repo.adminsByID[4] = &AdminUser{ID: 4, Username: "super", IsSuperAdmin: true}
	repo.adminsByName["super"] = repo.adminsByID[4]
	superCtx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 4, Role: RoleAdmin})
	if _, err := uc.SetRoles(superCtx, 4, []string{BossRoleKey}); !errors.Is(err, ErrAdminSelfRoleChangeForbidden) {
		t.Fatalf("super self role change error = %v, want ErrAdminSelfRoleChangeForbidden", err)
	}
	if _, err := uc.SetRoles(ctx, 2, []string{AdminRoleKey}); !errors.Is(err, ErrPrivilegedRoleAssignmentForbidden) {
		t.Fatalf("system role assignment error = %v, want ErrPrivilegedRoleAssignmentForbidden", err)
	}
	if _, err := uc.SetRoles(ctx, 3, []string{WarehouseRoleKey}); !errors.Is(err, ErrPrivilegedAdminTargetForbidden) {
		t.Fatalf("system role target change error = %v, want ErrPrivilegedAdminTargetForbidden", err)
	}
	if _, err := uc.SetPhone(ctx, 3, "13800138000"); !errors.Is(err, ErrPrivilegedAdminTargetForbidden) {
		t.Fatalf("system role target phone error = %v, want ErrPrivilegedAdminTargetForbidden", err)
	}
	if _, err := uc.SetDisabled(ctx, 3, true, "临时停用"); !errors.Is(err, ErrPrivilegedAdminTargetForbidden) {
		t.Fatalf("system role target disable error = %v, want ErrPrivilegedAdminTargetForbidden", err)
	}
	if _, _, err := uc.Revoke(ctx, 3, "员工离职"); !errors.Is(err, ErrPrivilegedAdminTargetForbidden) {
		t.Fatalf("system role target revoke error = %v, want ErrPrivilegedAdminTargetForbidden", err)
	}
	if _, err := uc.ResetPassword(ctx, 3, "new-secret"); !errors.Is(err, ErrPrivilegedAdminTargetForbidden) {
		t.Fatalf("system role target password error = %v, want ErrPrivilegedAdminTargetForbidden", err)
	}
	if len(repo.auditEvents) != 0 {
		t.Fatalf("rejected system target changes wrote audit events: %#v", repo.auditEvents)
	}
}

func TestAdminManageUsecase_SuperAdminCanMaintainSystemRoleTarget(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "system-operator", PasswordHash: "old"}
	repo.applyAdminRoles(repo.adminsByID[2], []string{AdminRoleKey})
	repo.adminsByName["system-operator"] = repo.adminsByID[2]
	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin})

	if _, err := uc.SetPhone(ctx, 2, "13800138000"); err != nil {
		t.Fatalf("super SetPhone(system target) error = %v", err)
	}
	if _, err := uc.ResetPassword(ctx, 2, "new-secret"); err != nil {
		t.Fatalf("super ResetPassword(system target) error = %v", err)
	}
	if _, err := uc.SetDisabled(ctx, 2, true, "临时停用"); err != nil {
		t.Fatalf("super SetDisabled(system target) error = %v", err)
	}
	updated, _, err := uc.Revoke(ctx, 2, "员工离职")
	if err != nil || updated.AccountStatus() != AdminAccountStatusRevoked {
		t.Fatalf("super Revoke(system target) admin=%#v err=%v", updated, err)
	}
}

func TestAdminManageUsecase_LifecycleReturnsTransactionSnapshotWithoutPostCommitRead(t *testing.T) {
	for _, revoke := range []bool{false, true} {
		t.Run(fmt.Sprintf("revoke=%t", revoke), func(t *testing.T) {
			repo := newStubAdminManageRepo()
			repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
			repo.adminsByName["root"] = repo.adminsByID[1]
			repo.adminsByID[2] = &AdminUser{ID: 2, Username: "worker"}
			repo.adminsByName["worker"] = repo.adminsByID[2]
			repo.getAdminByIDErrAfter = 2
			repo.getAdminByIDErr = errors.New("sentinel post-commit read")
			uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
			ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin})

			var updated *AdminUser
			var err error
			if revoke {
				updated, _, err = uc.Revoke(ctx, 2, "员工离职")
			} else {
				updated, err = uc.SetDisabled(ctx, 2, true, "临时停用")
			}
			if err != nil || updated == nil {
				t.Fatalf("lifecycle result=%#v err=%v", updated, err)
			}
			if repo.getAdminByIDCalls != 2 {
				t.Fatalf("GetAdminByID calls = %d, want 2 pre-transaction reads", repo.getAdminByIDCalls)
			}
		})
	}
}

func TestAdminManageUsecase_DebugRoleAssignmentIsNonProductionOnly(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "debugger"}
	repo.adminsByName["debugger"] = repo.adminsByID[2]
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin})

	production := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	if _, err := production.SetRoles(ctx, 2, []string{DebugOperatorRoleKey}); !errors.Is(err, ErrDebugRoleProductionForbidden) {
		t.Fatalf("production debug role assignment error = %v, want ErrDebugRoleProductionForbidden", err)
	}

	development := NewAdminManageUsecase(
		repo,
		log.NewStdLogger(io.Discard),
		tracesdk.NewTracerProvider(),
		AdminRoleAssignmentContext{Environment: "development"},
	)
	updated, err := development.SetRoles(ctx, 2, []string{DebugOperatorRoleKey})
	if err != nil {
		t.Fatalf("development debug role assignment error = %v", err)
	}
	if !AdminHasRole(updated, DebugOperatorRoleKey) {
		t.Fatalf("expected debug role in development, got %#v", updated.Roles)
	}
}

func TestAdminManageUsecase_SetRolePermissionsEnforcesRoleBoundaryAndVersion(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin})

	adminRole := repo.roleByKey(AdminRoleKey)
	if _, err := uc.SetRolePermissions(ctx, AdminRoleKey, []string{PermissionWarehouseInventoryRead}, adminRole.Version); !errors.Is(err, ErrSystemRoleImmutable) {
		t.Fatalf("system role mutation error = %v, want ErrSystemRoleImmutable", err)
	}
	warehouseRole := repo.roleByKey(WarehouseRoleKey)
	if _, err := uc.SetRolePermissions(ctx, WarehouseRoleKey, []string{PermissionSystemUserRead}, warehouseRole.Version); !errors.Is(err, ErrPermissionNotDelegable) {
		t.Fatalf("control-plane permission delegation error = %v, want ErrPermissionNotDelegable", err)
	}
	if _, err := uc.SetRolePermissions(ctx, WarehouseRoleKey, []string{PermissionWarehouseInventoryRead}, warehouseRole.Version+1); !errors.Is(err, ErrRoleVersionConflict) {
		t.Fatalf("stale role version error = %v, want ErrRoleVersionConflict", err)
	}
	if len(repo.auditEvents) != 0 {
		t.Fatalf("rejected permission changes wrote audit events: %#v", repo.auditEvents)
	}
}

func TestAdminManageUsecase_SetRolePermissionsRejectsOwnBusinessRole(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "operator"}
	repo.applyAdminRoles(repo.adminsByID[1], []string{AdminRoleKey, WarehouseRoleKey})
	repo.adminsByName["operator"] = repo.adminsByID[1]
	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin})
	warehouseRole := repo.roleByKey(WarehouseRoleKey)

	if _, err := uc.SetRolePermissions(
		ctx,
		WarehouseRoleKey,
		[]string{PermissionWarehouseInventoryRead, PermissionPurchaseOrderRead},
		warehouseRole.Version,
	); !errors.Is(err, ErrAdminSelfRolePermissionForbidden) {
		t.Fatalf("own business role permission change error = %v, want ErrAdminSelfRolePermissionForbidden", err)
	}
	if len(repo.auditEvents) != 0 {
		t.Fatalf("rejected own-role permission change wrote audit events: %#v", repo.auditEvents)
	}
}

func TestAdminManageUsecase_SetRoleNavigationEnforcesRoleBoundaryAndVersion(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin})

	adminRole := repo.roleByKey(AdminRoleKey)
	if _, err := uc.SetRoleNavigation(
		ctx,
		AdminRoleKey,
		RoleNavigationModeCustom,
		[]string{"/erp/system/permissions"},
		adminRole.Version,
	); !errors.Is(err, ErrSystemRoleImmutable) {
		t.Fatalf("system role navigation mutation error = %v, want ErrSystemRoleImmutable", err)
	}
	financeRole := repo.roleByKey(FinanceRoleKey)
	if _, err := uc.SetRoleNavigation(
		ctx,
		FinanceRoleKey,
		RoleNavigationModeCustom,
		[]string{"/erp/finance/reconciliation"},
		financeRole.Version+1,
	); !errors.Is(err, ErrRoleVersionConflict) {
		t.Fatalf("stale role navigation version error = %v, want ErrRoleVersionConflict", err)
	}
	updated, err := uc.SetRoleNavigation(
		ctx,
		FinanceRoleKey,
		RoleNavigationModeCustom,
		[]string{
			"/erp/finance/payables",
			"/erp/finance/reconciliation",
		},
		financeRole.Version,
	)
	if err != nil {
		t.Fatalf("SetRoleNavigation() error = %v", err)
	}
	if updated.NavigationMode != RoleNavigationModeCustom ||
		!slices.Equal(updated.PrimaryMenuPaths, []string{
			"/erp/finance/payables",
			"/erp/finance/reconciliation",
		}) {
		t.Fatalf("updated role navigation = %#v", updated)
	}
}

func TestAdminManageUsecase_SetRoleNavigationRejectsOwnBusinessRole(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "operator"}
	repo.applyAdminRoles(repo.adminsByID[1], []string{AdminRoleKey, FinanceRoleKey})
	repo.adminsByName["operator"] = repo.adminsByID[1]
	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin})
	financeRole := repo.roleByKey(FinanceRoleKey)

	if _, err := uc.SetRoleNavigation(
		ctx,
		FinanceRoleKey,
		RoleNavigationModeCustom,
		[]string{"/erp/finance/reconciliation"},
		financeRole.Version,
	); !errors.Is(err, ErrAdminSelfRolePermissionForbidden) {
		t.Fatalf("own business role navigation change error = %v, want ErrAdminSelfRolePermissionForbidden", err)
	}
}

func TestAdminManageUsecase_ListRolesWithAccessUsesCurrentAdminAndEnvironment(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "operator"}
	repo.applyAdminRoles(repo.adminsByID[2], []string{AdminRoleKey, SalesRoleKey})
	repo.adminsByName["operator"] = repo.adminsByID[2]
	repo.addCustomRole(AdminRole{
		Key:         "legacy_polluted_role",
		Name:        "待修复角色",
		Permissions: []string{PermissionSystemUserRead},
	})

	production := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	superContext := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin})
	_, superAccess, err := production.ListRolesWithAccess(superContext)
	if err != nil {
		t.Fatalf("ListRolesWithAccess(super) error = %v", err)
	}
	if !superAccess[AdminRoleKey].Assignable || superAccess[AdminRoleKey].PermissionsEditable {
		t.Fatalf("super admin system-role access = %#v", superAccess[AdminRoleKey])
	}
	if superAccess[DebugOperatorRoleKey].Assignable || superAccess[DebugOperatorRoleKey].AssignmentBlockedReason == "" {
		t.Fatalf("production debug-role access = %#v", superAccess[DebugOperatorRoleKey])
	}

	operatorContext := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 2, Role: RoleAdmin})
	_, operatorAccess, err := production.ListRolesWithAccess(operatorContext)
	if err != nil {
		t.Fatalf("ListRolesWithAccess(operator) error = %v", err)
	}
	if operatorAccess[AdminRoleKey].Assignable {
		t.Fatalf("non-super system-role access = %#v", operatorAccess[AdminRoleKey])
	}
	if !operatorAccess[SalesRoleKey].Assignable || operatorAccess[SalesRoleKey].PermissionsEditable {
		t.Fatalf("operator own business-role access = %#v", operatorAccess[SalesRoleKey])
	}
	if operatorAccess["legacy_polluted_role"].Assignable || !operatorAccess["legacy_polluted_role"].PermissionsEditable {
		t.Fatalf("legacy polluted role access = %#v", operatorAccess["legacy_polluted_role"])
	}

	development := NewAdminManageUsecase(
		repo,
		log.NewStdLogger(io.Discard),
		tracesdk.NewTracerProvider(),
		AdminRoleAssignmentContext{Environment: "dev"},
	)
	_, developmentAccess, err := development.ListRolesWithAccess(superContext)
	if err != nil {
		t.Fatalf("ListRolesWithAccess(development) error = %v", err)
	}
	if !developmentAccess[DebugOperatorRoleKey].Assignable {
		t.Fatalf("development debug-role access = %#v", developmentAccess[DebugOperatorRoleKey])
	}
}

func TestAdminManageUsecase_SetPhoneRejectsDuplicatePhone(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "manager"}
	repo.adminsByName["manager"] = repo.adminsByID[2]
	repo.adminsByID[3] = &AdminUser{ID: 3, Username: "buyer", Phone: "13800138000"}
	repo.adminsByName["buyer"] = repo.adminsByID[3]
	repo.adminsByPhone["13800138000"] = repo.adminsByID[3]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	_, err := uc.SetPhone(ctx, 2, "13800138000")
	if !errors.Is(err, ErrAdminPhoneExists) {
		t.Fatalf("expected ErrAdminPhoneExists, got %v", err)
	}
}

func TestAdminAuditUserSnapshotMasksPhone(t *testing.T) {
	snapshot := AdminAuditUserSnapshot(&AdminUser{ID: 2, Username: "worker", Phone: "13800138000"})
	if snapshot["phone"] != "138****8000" {
		t.Fatalf("masked phone = %#v, want 138****8000", snapshot["phone"])
	}
	if strings.Contains(fmt.Sprint(snapshot), "13800138000") {
		t.Fatalf("audit snapshot exposed raw phone: %#v", snapshot)
	}
}

func TestAdminManageUsecase_SetCurrentERPColumnOrder(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "manager"}
	repo.adminsByName["manager"] = repo.adminsByID[2]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   2,
		Username: "manager",
		Role:     RoleAdmin,
	})

	updated, err := uc.SetCurrentERPColumnOrder(ctx, " project-orders ", []string{
		"customer_name",
		"",
		"document_no",
		"customer_name",
	})
	if err != nil {
		t.Fatalf("SetCurrentERPColumnOrder() error = %v", err)
	}
	order := updated.ERPPreferences.ColumnOrders["project-orders"]
	if len(order) != 2 || order[0] != "customer_name" || order[1] != "document_no" {
		t.Fatalf("unexpected column order: %#v", updated.ERPPreferences.ColumnOrders)
	}

	updated, err = uc.SetCurrentERPColumnOrder(ctx, "project-orders", nil)
	if err != nil {
		t.Fatalf("SetCurrentERPColumnOrder(clear) error = %v", err)
	}
	if len(updated.ERPPreferences.ColumnOrders) != 0 {
		t.Fatalf("expected cleared column order, got %#v", updated.ERPPreferences.ColumnOrders)
	}
}
