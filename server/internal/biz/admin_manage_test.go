package biz

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	"golang.org/x/crypto/bcrypt"
)

type stubAdminManageRepo struct {
	adminsByID    map[int]*AdminUser
	adminsByName  map[string]*AdminUser
	adminsByPhone map[string]*AdminUser
	rolePerms     map[string][]string
	auditEvents   []RuntimeAuditEvent
	nextID        int
}

func newStubAdminManageRepo() *stubAdminManageRepo {
	return &stubAdminManageRepo{
		adminsByID:    map[int]*AdminUser{},
		adminsByName:  map[string]*AdminUser{},
		adminsByPhone: map[string]*AdminUser{},
		rolePerms:     map[string][]string{},
		auditEvents:   []RuntimeAuditEvent{},
		nextID:        10,
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
			return AdminRole{
				Key:         role.Key,
				Name:        role.Name,
				Description: role.Description,
				Builtin:     role.Builtin,
				Disabled:    role.Disabled,
				SortOrder:   role.SortOrder,
				Permissions: NormalizePermissionKeys(permissions),
			}
		}
	}
	return AdminRole{}
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

func (r *stubAdminManageRepo) CreateAdmin(_ context.Context, admin *AdminCreate) (*AdminUser, error) {
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
	return r.clone(created), nil
}

func (r *stubAdminManageRepo) UpdateAdminRoles(_ context.Context, id int, roleKeys []string) error {
	admin, ok := r.adminsByID[id]
	if !ok {
		return ErrAdminNotFound
	}
	r.applyAdminRoles(admin, roleKeys)
	return nil
}

func (r *stubAdminManageRepo) ListRoles(_ context.Context) ([]AdminRole, error) {
	defs := BuiltinRoles()
	out := make([]AdminRole, 0, len(defs))
	for _, role := range defs {
		out = append(out, r.roleByKey(role.Key))
	}
	return out, nil
}

func (r *stubAdminManageRepo) ListPermissions(_ context.Context) ([]AdminPermission, error) {
	defs := BuiltinPermissions()
	out := make([]AdminPermission, 0, len(defs))
	for _, permission := range defs {
		out = append(out, AdminPermission{
			Key:         permission.Key,
			Name:        permission.Name,
			Description: permission.Description,
			Module:      permission.Module,
			Action:      permission.Action,
			Resource:    permission.Resource,
			Builtin:     permission.Builtin,
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

func (r *stubAdminManageRepo) UpdateRolePermissions(_ context.Context, roleKey string, permissionKeys []string) error {
	role := r.roleByKey(roleKey)
	if role.Key == "" {
		return ErrRoleNotFound
	}
	r.rolePerms[role.Key] = NormalizePermissionKeys(permissionKeys)
	for _, admin := range r.adminsByID {
		roleKeys := make([]string, 0, len(admin.Roles))
		for _, item := range admin.Roles {
			roleKeys = append(roleKeys, item.Key)
		}
		r.applyAdminRoles(admin, roleKeys)
	}
	return nil
}

func (r *stubAdminManageRepo) UpdateAdminPhone(_ context.Context, id int, phone string) error {
	admin, ok := r.adminsByID[id]
	if !ok {
		return ErrAdminNotFound
	}
	if admin.Phone != "" {
		delete(r.adminsByPhone, admin.Phone)
	}
	admin.Phone = phone
	if phone != "" {
		r.adminsByPhone[phone] = admin
	}
	return nil
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

func (r *stubAdminManageRepo) SetAdminDisabled(_ context.Context, id int, disabled bool) error {
	admin, ok := r.adminsByID[id]
	if !ok {
		return ErrAdminNotFound
	}
	admin.Disabled = disabled
	return nil
}

func (r *stubAdminManageRepo) UpdateAdminPasswordHash(_ context.Context, id int, passwordHash string) error {
	admin, ok := r.adminsByID[id]
	if !ok {
		return ErrAdminNotFound
	}
	admin.PasswordHash = passwordHash
	return nil
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

func TestAdminManageUsecase_SetRolesRejectsSuperAdmin(t *testing.T) {
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
	if !errors.Is(err, ErrNoPermission) {
		t.Fatalf("expected ErrNoPermission, got %v", err)
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

	_, err := uc.SetRolePermissions(ctx, WarehouseRoleKey, []string{PermissionWarehouseInventoryRead})
	if err != nil {
		t.Fatalf("SetRolePermissions() error = %v", err)
	}
	if len(repo.auditEvents) != 1 {
		t.Fatalf("expected role permission audit event, got %d", len(repo.auditEvents))
	}
	if repo.auditEvents[0].EventKey != "role.permissions.set" {
		t.Fatalf("unexpected audit event key %q", repo.auditEvents[0].EventKey)
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
