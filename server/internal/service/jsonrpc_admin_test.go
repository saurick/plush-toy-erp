package service

import (
	"context"
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/protobuf/types/known/structpb"
)

type memAdminManageRepoForData struct {
	admins                    map[int]*biz.AdminUser
	rolePerms                 map[string][]string
	roleNavigation            map[string]biz.RoleNavigationSettings
	roleVersions              map[string]int
	lastRolePermissionsChange *biz.RolePermissionsChange
	lastRoleNavigationChange  *biz.RoleNavigationChange
	auditLogs                 []biz.RuntimeAuditEvent
	lastAuditFilter           biz.RuntimeAuditEventListFilter
	lifecycleErr              error
}

var _ biz.AdminManageRepo = (*memAdminManageRepoForData)(nil)

func newMemAdminManageRepoForData() *memAdminManageRepoForData {
	return &memAdminManageRepoForData{
		admins:         map[int]*biz.AdminUser{},
		rolePerms:      map[string][]string{},
		roleNavigation: map[string]biz.RoleNavigationSettings{},
		roleVersions:   map[string]int{},
		auditLogs:      []biz.RuntimeAuditEvent{},
	}
}

func (r *memAdminManageRepoForData) clone(admin *biz.AdminUser) *biz.AdminUser {
	if admin == nil {
		return nil
	}
	cloned := *admin
	cloned.Roles = append([]biz.AdminRole(nil), admin.Roles...)
	cloned.Permissions = append([]string(nil), admin.Permissions...)
	cloned.ERPPreferences = biz.NormalizeAdminERPPreferences(admin.ERPPreferences)
	return &cloned
}

func (r *memAdminManageRepoForData) roleByKey(roleKey string) biz.AdminRole {
	normalized := biz.NormalizeRoleKey(roleKey)
	for _, role := range biz.BuiltinRoles() {
		if role.Key == normalized {
			permissions := r.rolePerms[role.Key]
			if permissions == nil {
				permissions = role.Permissions
			}
			navigation := biz.RoleNavigationSettings{
				Mode:             biz.RoleNavigationModeRecommended,
				PrimaryMenuPaths: []string{},
			}
			if configured, ok := r.roleNavigation[role.Key]; ok {
				navigation = configured
			}
			version := r.roleVersions[role.Key]
			if version <= 0 {
				version = role.Version
			}
			return biz.AdminRole{
				Key:              role.Key,
				Name:             role.Name,
				Description:      role.Description,
				Builtin:          role.Builtin,
				Disabled:         role.Disabled,
				SortOrder:        role.SortOrder,
				Type:             role.Type,
				Version:          version,
				NavigationMode:   navigation.Mode,
				PrimaryMenuPaths: navigation.PrimaryMenuPaths,
				Permissions:      biz.NormalizePermissionKeys(permissions),
			}
		}
	}
	return biz.AdminRole{}
}

func (r *memAdminManageRepoForData) permissionsForRoleKeys(roleKeys []string) []string {
	permissionSet := map[string]struct{}{}
	for _, roleKey := range biz.NormalizeAdminRoleKeys(roleKeys) {
		perms, ok := r.rolePerms[roleKey]
		if !ok {
			for _, role := range biz.BuiltinRoles() {
				if role.Key == roleKey {
					perms = role.Permissions
					break
				}
			}
		}
		for _, permissionKey := range biz.NormalizePermissionKeys(perms) {
			permissionSet[permissionKey] = struct{}{}
		}
	}
	out := make([]string, 0, len(permissionSet))
	for _, permissionKey := range biz.AllPermissionKeys() {
		if _, ok := permissionSet[permissionKey]; ok {
			out = append(out, permissionKey)
		}
	}
	return out
}

func (r *memAdminManageRepoForData) applyAdminRoles(admin *biz.AdminUser, roleKeys []string) {
	admin.Roles = admin.Roles[:0]
	for _, roleKey := range biz.NormalizeAdminRoleKeys(roleKeys) {
		admin.Roles = append(admin.Roles, r.roleByKey(roleKey))
	}
	admin.Permissions = r.permissionsForRoleKeys(roleKeys)
}

func (r *memAdminManageRepoForData) GetAdminByID(_ context.Context, id int) (*biz.AdminUser, error) {
	admin, ok := r.admins[id]
	if !ok {
		return nil, biz.ErrAdminNotFound
	}
	return r.clone(admin), nil
}

func (r *memAdminManageRepoForData) GetAdminByUsername(_ context.Context, username string) (*biz.AdminUser, error) {
	for _, admin := range r.admins {
		if admin.Username == username {
			return r.clone(admin), nil
		}
	}
	return nil, biz.ErrAdminNotFound
}

func (r *memAdminManageRepoForData) GetAdminByPhone(_ context.Context, phone string) (*biz.AdminUser, error) {
	for _, admin := range r.admins {
		if admin.Phone == phone {
			return r.clone(admin), nil
		}
	}
	return nil, biz.ErrAdminNotFound
}

func (r *memAdminManageRepoForData) ListAdmins(_ context.Context) ([]*biz.AdminUser, error) {
	out := make([]*biz.AdminUser, 0, len(r.admins))
	for _, admin := range r.admins {
		out = append(out, r.clone(admin))
	}
	return out, nil
}

func (r *memAdminManageRepoForData) CreateAdmin(_ context.Context, admin *biz.AdminCreate) (*biz.AdminUser, error) {
	now := time.Now()
	created := &biz.AdminUser{
		ID:           len(r.admins) + 1,
		Username:     admin.Username,
		Phone:        admin.Phone,
		PasswordHash: admin.PasswordHash,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	r.applyAdminRoles(created, admin.RoleKeys)
	r.admins[created.ID] = created
	return r.clone(created), nil
}

func (r *memAdminManageRepoForData) CreateAdminWithAudit(ctx context.Context, command *biz.AdminCreateCommand) (*biz.AdminUser, error) {
	if command == nil || command.Admin == nil {
		return nil, biz.ErrBadParam
	}
	return r.CreateAdmin(ctx, command.Admin)
}

func (r *memAdminManageRepoForData) UpdateAdminRoles(_ context.Context, id int, roleKeys []string) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	r.applyAdminRoles(admin, roleKeys)
	return nil
}

func (r *memAdminManageRepoForData) SetAdminRolesWithAudit(ctx context.Context, change *biz.AdminRolesChange) (*biz.AdminUser, error) {
	if change == nil {
		return nil, biz.ErrBadParam
	}
	if err := r.UpdateAdminRoles(ctx, change.AdminID, change.RoleKeys); err != nil {
		return nil, err
	}
	return r.GetAdminByID(ctx, change.AdminID)
}

func (r *memAdminManageRepoForData) ListRoles(_ context.Context) ([]biz.AdminRole, error) {
	defs := biz.BuiltinRoles()
	out := make([]biz.AdminRole, 0, len(defs))
	for _, role := range defs {
		out = append(out, r.roleByKey(role.Key))
	}
	return out, nil
}

func (r *memAdminManageRepoForData) ListPermissions(_ context.Context) ([]biz.AdminPermission, error) {
	defs := biz.BuiltinPermissions()
	out := make([]biz.AdminPermission, 0, len(defs))
	for _, permission := range defs {
		out = append(out, biz.AdminPermission{
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

func (r *memAdminManageRepoForData) GetRoleByKey(_ context.Context, roleKey string) (*biz.AdminRole, error) {
	role := r.roleByKey(roleKey)
	if role.Key == "" {
		return nil, biz.ErrRoleNotFound
	}
	return &role, nil
}

func (r *memAdminManageRepoForData) UpdateRolePermissions(_ context.Context, roleKey string, permissionKeys []string) error {
	role := r.roleByKey(roleKey)
	if role.Key == "" {
		return biz.ErrRoleNotFound
	}
	r.rolePerms[role.Key] = biz.NormalizePermissionKeys(permissionKeys)
	for _, admin := range r.admins {
		roleKeys := make([]string, 0, len(admin.Roles))
		for _, item := range admin.Roles {
			roleKeys = append(roleKeys, item.Key)
		}
		r.applyAdminRoles(admin, roleKeys)
	}
	return nil
}

func (r *memAdminManageRepoForData) SetRolePermissionsWithAudit(ctx context.Context, change *biz.RolePermissionsChange) (*biz.AdminRole, error) {
	if change == nil || change.ExpectedVersion <= 0 {
		return nil, biz.ErrBadParam
	}
	role := r.roleByKey(change.RoleKey)
	if role.Key == "" {
		return nil, biz.ErrRoleNotFound
	}
	if role.Version != change.ExpectedVersion {
		return nil, biz.ErrRoleVersionConflict
	}
	cloned := *change
	cloned.PermissionKeys = append([]string(nil), change.PermissionKeys...)
	r.lastRolePermissionsChange = &cloned
	if err := r.UpdateRolePermissions(ctx, change.RoleKey, change.PermissionKeys); err != nil {
		return nil, err
	}
	r.roleVersions[role.Key] = role.Version + 1
	updated := r.roleByKey(role.Key)
	return &updated, nil
}

func (r *memAdminManageRepoForData) SetRoleNavigationWithAudit(
	_ context.Context,
	change *biz.RoleNavigationChange,
) (*biz.AdminRole, error) {
	if change == nil || change.ExpectedVersion <= 0 {
		return nil, biz.ErrBadParam
	}
	role := r.roleByKey(change.RoleKey)
	if role.Key == "" {
		return nil, biz.ErrRoleNotFound
	}
	if role.Version != change.ExpectedVersion {
		return nil, biz.ErrRoleVersionConflict
	}
	settings, err := biz.NormalizeRoleNavigationSettings(
		change.Mode,
		change.PrimaryMenuPaths,
	)
	if err != nil {
		return nil, err
	}
	cloned := *change
	cloned.PrimaryMenuPaths = append([]string(nil), change.PrimaryMenuPaths...)
	r.lastRoleNavigationChange = &cloned
	r.roleNavigation[role.Key] = settings
	r.roleVersions[role.Key] = role.Version + 1
	updated := r.roleByKey(role.Key)
	return &updated, nil
}

func (r *memAdminManageRepoForData) UpdateAdminPhone(_ context.Context, id int, phone string) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	admin.Phone = phone
	return nil
}

func (r *memAdminManageRepoForData) SetAdminPhoneWithAudit(ctx context.Context, change *biz.AdminPhoneChange) (*biz.AdminUser, error) {
	if change == nil {
		return nil, biz.ErrBadParam
	}
	if err := r.UpdateAdminPhone(ctx, change.AdminID, change.Phone); err != nil {
		return nil, err
	}
	return r.GetAdminByID(ctx, change.AdminID)
}

func (r *memAdminManageRepoForData) UpdateAdminERPColumnOrder(_ context.Context, id int, moduleKey string, order []string) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	preferences := biz.NormalizeAdminERPPreferences(admin.ERPPreferences)
	if preferences.ColumnOrders == nil {
		preferences.ColumnOrders = map[string][]string{}
	}
	normalizedOrder := biz.NormalizeAdminERPColumnOrder(order)
	if len(normalizedOrder) == 0 {
		delete(preferences.ColumnOrders, moduleKey)
	} else {
		preferences.ColumnOrders[moduleKey] = normalizedOrder
	}
	admin.ERPPreferences = biz.NormalizeAdminERPPreferences(preferences)
	return nil
}

func (r *memAdminManageRepoForData) ChangeAdminLifecycle(_ context.Context, change *biz.AdminLifecycleChange) (*biz.AdminUser, int, error) {
	if change == nil {
		return nil, 0, biz.ErrBadParam
	}
	if r.lifecycleErr != nil {
		return nil, 0, r.lifecycleErr
	}
	admin, ok := r.admins[change.AdminID]
	if !ok {
		return nil, 0, biz.ErrAdminNotFound
	}
	admin.Disabled = change.Disabled
	admin.StatusReason = change.Reason
	now := time.Now()
	admin.StatusChangedAt = &now
	admin.StatusChangedBy = &change.OperatorID
	if change.Revoke {
		admin.RevokedAt = &now
	}
	return r.clone(admin), 0, nil
}

func (r *memAdminManageRepoForData) UpdateAdminPasswordHash(_ context.Context, id int, passwordHash string) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	admin.PasswordHash = passwordHash
	return nil
}

func (r *memAdminManageRepoForData) ResetAdminPasswordWithAudit(ctx context.Context, reset *biz.AdminPasswordReset) (*biz.AdminUser, error) {
	if reset == nil {
		return nil, biz.ErrBadParam
	}
	if err := r.UpdateAdminPasswordHash(ctx, reset.AdminID, reset.PasswordHash); err != nil {
		return nil, err
	}
	return r.GetAdminByID(ctx, reset.AdminID)
}

func (r *memAdminManageRepoForData) RecordRuntimeAuditEvent(_ context.Context, event *biz.RuntimeAuditEventCreate) error {
	if event == nil {
		return biz.ErrBadParam
	}
	r.auditLogs = append(r.auditLogs, biz.RuntimeAuditEvent{
		ID:        len(r.auditLogs) + 1,
		EventType: event.EventType,
		EventKey:  event.EventKey,
		Source:    event.Source,
		Payload:   event.Payload,
		CreatedAt: time.Now(),
	})
	return nil
}

func (r *memAdminManageRepoForData) ListRuntimeAuditEvents(_ context.Context, filter biz.RuntimeAuditEventListFilter) (biz.RuntimeAuditEventListResult, error) {
	r.lastAuditFilter = filter
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}
	filtered := make([]biz.RuntimeAuditEvent, 0, len(r.auditLogs))
	for _, event := range r.auditLogs {
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
		payloadText := strings.ToLower(anyMapString(event.Payload))
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
			haystack := strings.ToLower(event.EventType + " " + event.EventKey + " " + event.Source + " " + anyMapString(event.Payload))
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
	return biz.RuntimeAuditEventListResult{
		Events: filtered[offset:end],
		Total:  len(filtered),
		Limit:  limit,
		Offset: offset,
	}, nil
}

func anyMapString(value any) string {
	if value == nil {
		return ""
	}
	return fmt.Sprintf("%v", value)
}

func TestJsonrpcDispatcher_AdminMe_ReturnsERPPreferences(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID:           1,
		Username:     "admin",
		IsSuperAdmin: true,
		ERPPreferences: biz.AdminERPPreferences{
			ColumnOrders: map[string][]string{
				"project-orders": {"customer_name", "document_no"},
			},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	logger := log.NewStdLogger(io.Discard)
	j := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})

	_, res, err := j.handleAdmin(ctx, "me", "1", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected ok result, got %+v", res)
	}
	preferences, ok := res.Data.AsMap()["erp_preferences"].(map[string]any)
	if !ok {
		t.Fatalf("expected erp_preferences object, got %#v", res.Data.AsMap()["erp_preferences"])
	}
	columnOrders, ok := preferences["column_orders"].(map[string]any)
	if !ok {
		t.Fatalf("expected column_orders object, got %#v", preferences["column_orders"])
	}
	rawOrder, ok := columnOrders["project-orders"].([]any)
	if !ok || len(rawOrder) != 2 {
		t.Fatalf("expected project-orders order, got %#v", columnOrders["project-orders"])
	}
}

func TestJsonrpcDispatcher_AdminListUsesMinimalAccountProjection(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID: 1, Username: "root", IsSuperAdmin: true, CreatedAt: now, UpdatedAt: now,
	}
	repo.admins[2] = &biz.AdminUser{
		ID:           2,
		Username:     "worker",
		Phone:        "13800138000",
		PasswordHash: "sentinel-password-hash",
		AuthVersion:  88,
		StatusReason: "临时离岗",
		Roles: []biz.AdminRole{{
			Key: biz.SalesRoleKey, Name: "业务员", Type: biz.RoleTypeBusinessDefault,
			Version: 7, Permissions: []string{biz.PermissionCustomerRead},
		}},
		Permissions: []string{biz.PermissionCustomerRead, biz.PermissionSystemAuditRead},
		ERPPreferences: biz.AdminERPPreferences{
			ColumnOrders: map[string][]string{"sentinel-module": {"sentinel-column"}},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID: 1, Username: "root", Role: biz.RoleAdmin,
	})

	_, result, err := dispatcher.handleAdmin(ctx, "list", "minimal", nil)
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("admin.list result=%#v err=%v", result, err)
	}
	var worker map[string]any
	for _, raw := range result.Data.AsMap()["admins"].([]any) {
		item := raw.(map[string]any)
		if item["username"] == "worker" {
			worker = item
			break
		}
	}
	if worker == nil {
		t.Fatal("worker projection not found")
	}
	wantKeys := map[string]struct{}{
		"id": {}, "username": {}, "phone": {}, "is_super_admin": {},
		"account_status": {}, "status_reason": {}, "roles": {}, "permission_count": {},
	}
	if len(worker) != len(wantKeys) {
		t.Fatalf("admin.list keys = %#v, want exact minimal projection", worker)
	}
	for key := range worker {
		if _, ok := wantKeys[key]; !ok {
			t.Fatalf("admin.list exposed unexpected key %q: %#v", key, worker)
		}
	}
	if worker["permission_count"] != float64(2) {
		t.Fatalf("permission_count = %#v, want 2", worker["permission_count"])
	}
	roles := worker["roles"].([]any)
	if len(roles) != 1 {
		t.Fatalf("roles = %#v, want one role", roles)
	}
	role := roles[0].(map[string]any)
	if len(role) != 2 || role["role_key"] != biz.SalesRoleKey || role["name"] != "业务员" {
		t.Fatalf("role projection = %#v", role)
	}
	serialized := fmt.Sprint(result.Data.AsMap())
	for _, forbidden := range []string{
		"sentinel-password-hash", "sentinel-module", "sentinel-column",
		biz.PermissionCustomerRead, biz.PermissionSystemAuditRead,
	} {
		if strings.Contains(serialized, forbidden) {
			t.Fatalf("admin.list exposed forbidden value %q: %s", forbidden, serialized)
		}
	}
}

func TestJsonrpcDispatcher_AdminResetPassword(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID:           1,
		Username:     "root",
		IsSuperAdmin: true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	repo.admins[2] = &biz.AdminUser{
		ID:           2,
		Username:     "manager",
		PasswordHash: "old",
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	logger := log.NewStdLogger(io.Discard)
	j := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     biz.RoleAdmin,
	})
	params, _ := structpb.NewStruct(map[string]any{
		"id":       2,
		"password": "new-secret",
	})

	_, res, err := j.handleAdmin(ctx, "reset_password", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected ok result, got %+v", res)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(repo.admins[2].PasswordHash), []byte("new-secret")); err != nil {
		t.Fatalf("stored hash does not match new password: %v", err)
	}
}

func TestJsonrpcDispatcher_AdminRevokeRequiresDedicatedPermission(t *testing.T) {
	newDispatcher := func(permissionKeys ...string) (*jsonrpcDispatcher, *memAdminManageRepoForData, context.Context) {
		repo := newMemAdminManageRepoForData()
		now := time.Now()
		repo.admins[1] = &biz.AdminUser{ID: 1, Username: "operator", Permissions: permissionKeys, CreatedAt: now, UpdatedAt: now}
		repo.admins[2] = &biz.AdminUser{ID: 2, Username: "leaver", CreatedAt: now, UpdatedAt: now}
		logger := log.NewStdLogger(io.Discard)
		dispatcher := &jsonrpcDispatcher{
			log: log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")), adminReader: repo,
			adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
		}
		ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Username: "operator", Role: biz.RoleAdmin})
		return dispatcher, repo, ctx
	}
	params, _ := structpb.NewStruct(map[string]any{"id": 2, "reason": "员工离职"})

	deniedDispatcher, deniedRepo, deniedCtx := newDispatcher(biz.PermissionSystemUserDisable)
	_, denied, err := deniedDispatcher.handleAdmin(deniedCtx, "revoke", "1", params)
	if err != nil || denied.Code != errcode.PermissionDenied.Code || deniedRepo.admins[2].RevokedAt != nil {
		t.Fatalf("revoke without permission = %#v err=%v admin=%#v", denied, err, deniedRepo.admins[2])
	}
	allowedDispatcher, allowedRepo, allowedCtx := newDispatcher(biz.PermissionSystemUserRevoke)
	_, allowed, err := allowedDispatcher.handleAdmin(allowedCtx, "revoke", "2", params)
	if err != nil || allowed.Code != errcode.OK.Code || allowedRepo.admins[2].AccountStatus() != biz.AdminAccountStatusRevoked {
		t.Fatalf("revoke with permission = %#v err=%v admin=%#v", allowed, err, allowedRepo.admins[2])
	}
}

func TestJsonrpcDispatcher_AdminRevokeMapsConcurrentTaskChange(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{ID: 1, Username: "operator", Permissions: []string{biz.PermissionSystemUserRevoke}, CreatedAt: now, UpdatedAt: now}
	repo.admins[2] = &biz.AdminUser{ID: 2, Username: "leaver", CreatedAt: now, UpdatedAt: now}
	repo.lifecycleErr = biz.ErrWorkflowTaskConflict
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")), adminReader: repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Username: "operator", Role: biz.RoleAdmin})
	params, _ := structpb.NewStruct(map[string]any{"id": 2, "reason": "员工离职"})

	_, result, err := dispatcher.handleAdmin(ctx, "revoke", "conflict", params)
	if err != nil || result.Code != errcode.ResourceVersionConflict.Code || repo.admins[2].RevokedAt != nil {
		t.Fatalf("revoke task conflict = %#v err=%v admin=%#v", result, err, repo.admins[2])
	}
}

func TestJsonrpcDispatcher_AdminCreateWithRolesRequiresRoleAssignPermission(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID:          1,
		Username:    "admin",
		Permissions: []string{biz.PermissionSystemUserCreate},
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	logger := log.NewStdLogger(io.Discard)
	j := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	withRoleParams, _ := structpb.NewStruct(map[string]any{
		"username":  "operator-with-role",
		"password":  "new-secret",
		"role_keys": []any{biz.WarehouseRoleKey},
	})

	_, res, err := j.handleAdmin(ctx, "create", "1", withRoleParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %+v", res)
	}

	withoutRoleParams, _ := structpb.NewStruct(map[string]any{
		"username": "operator-no-role",
		"password": "new-secret",
	})
	_, res, err = j.handleAdmin(ctx, "create", "2", withoutRoleParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected create without roles to succeed, got %+v", res)
	}

	repo.admins[1].Permissions = append(repo.admins[1].Permissions, biz.PermissionSystemUserRoleAssign)
	_, res, err = j.handleAdmin(ctx, "create", "3", withRoleParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected create with roles to succeed after role assignment permission, got %+v", res)
	}
}

func TestJsonrpcDispatcher_AdminSetRolesRequiresRoleAssignPermission(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID: 1, Username: "operator", Permissions: []string{biz.PermissionSystemUserUpdate}, CreatedAt: now, UpdatedAt: now,
	}
	repo.admins[2] = &biz.AdminUser{ID: 2, Username: "worker", CreatedAt: now, UpdatedAt: now}
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Username: "operator", Role: biz.RoleAdmin})
	params, _ := structpb.NewStruct(map[string]any{"id": 2, "role_keys": []any{biz.SalesRoleKey}})

	_, denied, err := dispatcher.handleAdmin(ctx, "set_roles", "1", params)
	if err != nil || denied.Code != errcode.PermissionDenied.Code || len(repo.admins[2].Roles) != 0 {
		t.Fatalf("set roles with legacy update permission = %#v err=%v admin=%#v", denied, err, repo.admins[2])
	}
	repo.admins[1].Permissions = append(repo.admins[1].Permissions, biz.PermissionSystemUserRoleAssign)
	_, allowed, err := dispatcher.handleAdmin(ctx, "set_roles", "2", params)
	if err != nil || allowed.Code != errcode.OK.Code || len(repo.admins[2].Roles) != 1 || repo.admins[2].Roles[0].Key != biz.SalesRoleKey {
		t.Fatalf("set roles with assignment permission = %#v err=%v admin=%#v", allowed, err, repo.admins[2])
	}
}

func TestJsonrpcDispatcher_AdminSetRolePermissionsRequiresDedicatedPermissionAndVersion(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID:          1,
		Username:    "operator",
		Roles:       []biz.AdminRole{{Key: biz.AdminRoleKey}},
		Permissions: []string{"system.permission.manage"},
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Username: "operator", Role: biz.RoleAdmin})
	validParams := map[string]any{
		"role_key":         biz.WarehouseRoleKey,
		"permission_keys":  []any{biz.PermissionWarehouseInventoryRead},
		"expected_version": float64(1),
	}
	params, _ := structpb.NewStruct(validParams)

	_, denied, err := dispatcher.handleAdmin(ctx, "set_role_permissions", "1", params)
	if err != nil || denied.Code != errcode.PermissionDenied.Code || repo.lastRolePermissionsChange != nil {
		t.Fatalf("set role permissions with legacy permission = %#v err=%v change=%#v", denied, err, repo.lastRolePermissionsChange)
	}
	repo.admins[1].Permissions = append(repo.admins[1].Permissions, biz.PermissionSystemRolePermissionManage)

	invalidVersions := []struct {
		name    string
		present bool
		value   any
	}{
		{name: "missing"},
		{name: "zero", present: true, value: float64(0)},
		{name: "negative", present: true, value: float64(-1)},
		{name: "fraction", present: true, value: float64(1.5)},
		{name: "string", present: true, value: "1"},
	}
	for _, tt := range invalidVersions {
		t.Run(tt.name, func(t *testing.T) {
			payload := map[string]any{
				"role_key":        biz.WarehouseRoleKey,
				"permission_keys": []any{biz.PermissionWarehouseInventoryRead},
			}
			if tt.present {
				payload["expected_version"] = tt.value
			}
			invalidParams, paramErr := structpb.NewStruct(payload)
			if paramErr != nil {
				t.Fatalf("params error = %v", paramErr)
			}
			_, result, callErr := dispatcher.handleAdmin(ctx, "set_role_permissions", tt.name, invalidParams)
			if callErr != nil || result.Code != errcode.InvalidParam.Code || repo.lastRolePermissionsChange != nil {
				t.Fatalf("version %s result=%#v err=%v change=%#v", tt.name, result, callErr, repo.lastRolePermissionsChange)
			}
		})
	}

	_, allowed, err := dispatcher.handleAdmin(ctx, "set_role_permissions", "2", params)
	if err != nil || allowed.Code != errcode.OK.Code || repo.lastRolePermissionsChange == nil || repo.lastRolePermissionsChange.ExpectedVersion != 1 {
		t.Fatalf("set role permissions with version = %#v err=%v change=%#v", allowed, err, repo.lastRolePermissionsChange)
	}
	role := allowed.Data.AsMap()["role"].(map[string]any)
	if role["version"] != float64(2) || role["permissions_editable"] != true || role["assignable"] != true {
		t.Fatalf("updated role metadata = %#v", role)
	}

	_, conflict, err := dispatcher.handleAdmin(ctx, "set_role_permissions", "3", params)
	if err != nil || conflict.Code != errcode.ResourceVersionConflict.Code {
		t.Fatalf("stale role version = %#v err=%v", conflict, err)
	}
}

func TestJsonrpcDispatcher_AdminSetRoleNavigationUsesRoleManagePermissionAndVersion(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID:        1,
		Username:  "operator",
		CreatedAt: now,
		UpdatedAt: now,
	}
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(
		context.Background(),
		&biz.AuthClaims{UserID: 1, Username: "operator", Role: biz.RoleAdmin},
	)
	params, _ := structpb.NewStruct(map[string]any{
		"role_key": biz.FinanceRoleKey,
		"mode":     string(biz.RoleNavigationModeCustom),
		"primary_menu_paths": []any{
			"/erp/finance/payables",
			"/erp/finance/receivables",
			"/erp/finance/invoices",
			"/erp/finance/reconciliation",
		},
		"expected_version": float64(1),
	})

	_, denied, err := dispatcher.handleAdmin(ctx, "set_role_navigation", "1", params)
	if err != nil || denied.Code != errcode.PermissionDenied.Code || repo.lastRoleNavigationChange != nil {
		t.Fatalf("set role navigation without permission = %#v err=%v change=%#v", denied, err, repo.lastRoleNavigationChange)
	}
	repo.admins[1].Permissions = []string{biz.PermissionSystemRolePermissionManage}
	_, allowed, err := dispatcher.handleAdmin(ctx, "set_role_navigation", "2", params)
	if err != nil || allowed.Code != errcode.OK.Code || repo.lastRoleNavigationChange == nil {
		t.Fatalf("set role navigation = %#v err=%v change=%#v", allowed, err, repo.lastRoleNavigationChange)
	}
	role := allowed.Data.AsMap()["role"].(map[string]any)
	if role["version"] != float64(2) ||
		role["navigation_mode"] != string(biz.RoleNavigationModeCustom) ||
		len(role["primary_menu_paths"].([]any)) != 4 {
		t.Fatalf("updated role navigation metadata = %#v", role)
	}

	_, conflict, err := dispatcher.handleAdmin(ctx, "set_role_navigation", "3", params)
	if err != nil || conflict.Code != errcode.ResourceVersionConflict.Code {
		t.Fatalf("stale role navigation version = %#v err=%v", conflict, err)
	}
}

func TestJsonrpcDispatcher_AdminRBACOptionsExposeRoleAndPermissionMetadata(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{ID: 1, Username: "root", IsSuperAdmin: true, CreatedAt: now, UpdatedAt: now}
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Username: "root", Role: biz.RoleAdmin})

	_, result, err := dispatcher.handleAdmin(ctx, "rbac_options", "1", nil)
	if err != nil || result.Code != errcode.OK.Code {
		t.Fatalf("rbac_options = %#v err=%v", result, err)
	}
	data := result.Data.AsMap()
	find := func(items []any, keyField string, key string) map[string]any {
		t.Helper()
		for _, raw := range items {
			item := raw.(map[string]any)
			if item[keyField] == key {
				return item
			}
		}
		t.Fatalf("%s=%q not found", keyField, key)
		return nil
	}
	roles := data["role_options"].([]any)
	sales := find(roles, "role_key", biz.SalesRoleKey)
	if sales["role_type"] != string(biz.RoleTypeBusinessDefault) ||
		sales["version"] != float64(1) ||
		sales["navigation_mode"] != string(biz.RoleNavigationModeRecommended) ||
		len(sales["primary_menu_paths"].([]any)) != 0 ||
		sales["permissions_editable_by_current_admin"] != true ||
		sales["assignable_by_current_admin"] != true {
		t.Fatalf("sales role metadata = %#v", sales)
	}
	admin := find(roles, "role_key", biz.AdminRoleKey)
	if admin["role_type"] != string(biz.RoleTypeSystem) || admin["permissions_editable_by_current_admin"] != false || admin["assignable_by_current_admin"] != true {
		t.Fatalf("admin role metadata = %#v", admin)
	}
	debugRole := find(roles, "role_key", biz.DebugOperatorRoleKey)
	if debugRole["role_type"] != string(biz.RoleTypeSystem) || debugRole["permissions_editable_by_current_admin"] != false || debugRole["assignable_by_current_admin"] != false || debugRole["non_production_only"] != true || strings.TrimSpace(fmt.Sprint(debugRole["assignment_blocked_reason"])) == "" {
		t.Fatalf("debug role metadata = %#v", debugRole)
	}

	permissions := data["permission_options"].([]any)
	for _, permissionKey := range []string{biz.PermissionSystemUserRoleAssign, biz.PermissionSystemRolePermissionManage, biz.PermissionProcessRuntimeRecover} {
		permission := find(permissions, "permission_key", permissionKey)
		if permission["class"] != string(biz.PermissionClassControlPlane) || permission["assignable"] != false {
			t.Fatalf("control-plane permission metadata for %s = %#v", permissionKey, permission)
		}
	}
	businessPermission := find(permissions, "permission_key", biz.PermissionWarehouseInventoryRead)
	if businessPermission["class"] != string(biz.PermissionClassBusiness) ||
		businessPermission["assignable"] != true ||
		businessPermission["non_production_only"] != false ||
		businessPermission["module_name"] != "仓储" {
		t.Fatalf("business permission metadata = %#v", businessPermission)
	}
	debugPermission := find(permissions, "permission_key", biz.PermissionDebugSeed)
	if debugPermission["class"] != string(biz.PermissionClassDebug) || debugPermission["assignable"] != false || debugPermission["non_production_only"] != true {
		t.Fatalf("debug permission metadata = %#v", debugPermission)
	}
}

func TestJsonrpcDispatcher_AdminRBACOptionsRequireRoleAndPermissionRead(t *testing.T) {
	for _, permissions := range [][]string{
		{biz.PermissionSystemRoleRead},
		{biz.PermissionSystemPermissionRead},
	} {
		t.Run(strings.Join(permissions, "+"), func(t *testing.T) {
			repo := newMemAdminManageRepoForData()
			now := time.Now()
			repo.admins[1] = &biz.AdminUser{
				ID: 1, Username: "reader", Permissions: permissions, CreatedAt: now, UpdatedAt: now,
			}
			logger := log.NewStdLogger(io.Discard)
			dispatcher := &jsonrpcDispatcher{
				log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
				adminReader:   repo,
				adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
			}
			ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Username: "reader", Role: biz.RoleAdmin})

			_, result, err := dispatcher.handleAdmin(ctx, "rbac_options", "1", nil)
			if err != nil || result.Code != errcode.PermissionDenied.Code {
				t.Fatalf("single read permission exposed complete RBAC options: result=%#v err=%v", result, err)
			}
		})
	}
}

func TestJsonrpcDispatcher_AdminEffectiveRoleAccessPreviewsPermissionDraftWithoutSaving(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "")
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID:           1,
		Username:     "root",
		IsSuperAdmin: true,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:      repo,
		adminManageUC:    biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
		customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}
	ctx := biz.NewContextWithClaims(
		context.Background(),
		&biz.AuthClaims{UserID: 1, Username: "root", Role: biz.RoleAdmin},
	)

	previewReceivables := func(permissionKeys ...string) map[string]any {
		t.Helper()
		rawPermissionKeys := make([]any, 0, len(permissionKeys))
		for _, permissionKey := range permissionKeys {
			rawPermissionKeys = append(rawPermissionKeys, permissionKey)
		}
		params, _ := structpb.NewStruct(map[string]any{
			"role_key":        biz.FinanceRoleKey,
			"permission_keys": rawPermissionKeys,
		})
		_, result, err := dispatcher.handleAdmin(ctx, "effective_role_access", "1", params)
		if err != nil || result.Code != errcode.OK.Code {
			t.Fatalf("effective_role_access preview = %#v err=%v", result, err)
		}
		access := result.Data.AsMap()["effective_access"].(map[string]any)
		if access["is_preview"] != true {
			t.Fatalf("preview marker = %#v", access["is_preview"])
		}
		for _, rawPage := range access["pages"].([]any) {
			page := rawPage.(map[string]any)
			if page["key"] == "receivables" {
				return page
			}
		}
		t.Fatal("receivables page missing from access explanation")
		return nil
	}

	confirmOnly := previewReceivables(biz.PermissionFinanceReceivableConfirm)
	if confirmOnly["rbac_granted"] != false {
		t.Fatalf("confirm-only receivables decision = %#v", confirmOnly)
	}
	withEntry := previewReceivables(
		biz.PermissionFinanceReceivableConfirm,
		biz.PermissionFinanceReceivableRead,
	)
	if withEntry["rbac_granted"] != true {
		t.Fatalf("receivables entry decision = %#v", withEntry)
	}
	if repo.lastRolePermissionsChange != nil {
		t.Fatalf("preview persisted role permissions: %#v", repo.lastRolePermissionsChange)
	}

	invalidParams, _ := structpb.NewStruct(map[string]any{
		"role_key":        biz.FinanceRoleKey,
		"permission_keys": []any{float64(1)},
	})
	_, invalid, err := dispatcher.handleAdmin(ctx, "effective_role_access", "3", invalidParams)
	if err != nil || invalid.Code != errcode.InvalidParam.Code {
		t.Fatalf("non-string preview permission = %#v err=%v", invalid, err)
	}

	unknownParams, _ := structpb.NewStruct(map[string]any{
		"role_key":        biz.FinanceRoleKey,
		"permission_keys": []any{"finance.receivable.unsupported"},
	})
	_, unknown, err := dispatcher.handleAdmin(ctx, "effective_role_access", "4", unknownParams)
	if err != nil || unknown.Code != errcode.InvalidParam.Code {
		t.Fatalf("unknown preview permission = %#v err=%v", unknown, err)
	}

	repo.admins[2] = &biz.AdminUser{
		ID:       2,
		Username: "rbac-reader",
		Permissions: []string{
			biz.PermissionSystemRoleRead,
			biz.PermissionSystemPermissionRead,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	deniedCtx := biz.NewContextWithClaims(
		context.Background(),
		&biz.AuthClaims{UserID: 2, Username: "rbac-reader", Role: biz.RoleAdmin},
	)
	deniedParams, _ := structpb.NewStruct(map[string]any{
		"role_key":        biz.FinanceRoleKey,
		"permission_keys": []any{biz.PermissionFinanceReceivableRead},
	})
	_, denied, err := dispatcher.handleAdmin(
		deniedCtx,
		"effective_role_access",
		"5",
		deniedParams,
	)
	if err != nil || denied.Code != errcode.PermissionDenied.Code {
		t.Fatalf("preview without customer config read = %#v err=%v", denied, err)
	}
}

func TestJsonrpcDispatcher_AdminManageErrorsMapToExplicitContracts(t *testing.T) {
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{log: log.NewHelper(log.With(logger, "module", "service.jsonrpc.test"))}
	tests := []struct {
		name string
		err  error
		code int32
	}{
		{name: "self role", err: biz.ErrAdminSelfRoleChangeForbidden, code: errcode.PermissionDenied.Code},
		{name: "own role permissions", err: biz.ErrAdminSelfRolePermissionForbidden, code: errcode.PermissionDenied.Code},
		{name: "privileged role", err: biz.ErrPrivilegedRoleAssignmentForbidden, code: errcode.PermissionDenied.Code},
		{name: "privileged target", err: biz.ErrPrivilegedAdminTargetForbidden, code: errcode.PermissionDenied.Code},
		{name: "system role", err: biz.ErrSystemRoleImmutable, code: errcode.PermissionDenied.Code},
		{name: "permission not delegable", err: biz.ErrPermissionNotDelegable, code: errcode.InvalidParam.Code},
		{name: "debug role environment", err: biz.ErrDebugRoleProductionForbidden, code: errcode.InvalidParam.Code},
		{name: "role version", err: biz.ErrRoleVersionConflict, code: errcode.ResourceVersionConflict.Code},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := dispatcher.mapAdminManageError(context.Background(), tt.err)
			if result.Code != tt.code || strings.TrimSpace(result.Message) == "" {
				t.Fatalf("mapped result = %#v, want code %d", result, tt.code)
			}
		})
	}
}

func TestJsonrpcDispatcher_AdminSetERPColumnOrder(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID:       1,
		Username: "admin",
		Roles:    []biz.AdminRole{{Key: biz.AdminRoleKey, Name: "系统管理员"}},
		Permissions: []string{
			biz.PermissionSystemUserRead,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	logger := log.NewStdLogger(io.Discard)
	j := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, _ := structpb.NewStruct(map[string]any{
		"module_key": "project-orders",
		"order":      []any{"customer_name", "", "document_no", "customer_name"},
	})

	_, res, err := j.handleAdmin(ctx, "set_erp_column_order", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected ok result, got %+v", res)
	}
	order := repo.admins[1].ERPPreferences.ColumnOrders["project-orders"]
	if len(order) != 2 || order[0] != "customer_name" || order[1] != "document_no" {
		t.Fatalf("unexpected stored order: %#v", repo.admins[1].ERPPreferences.ColumnOrders)
	}
}

func TestJsonrpcDispatcher_AdminAuditLogsRequiresPermission(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID:          1,
		Username:    "admin",
		Permissions: []string{biz.PermissionSystemUserRead},
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	logger := log.NewStdLogger(io.Discard)
	j := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})

	_, res, err := j.handleAdmin(ctx, "audit_logs", "1", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %+v", res)
	}
}

func TestJsonrpcDispatcher_AdminAuditLogsReturnsEvents(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID:          1,
		Username:    "admin",
		Permissions: []string{biz.PermissionSystemAuditRead},
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	repo.auditLogs = append(repo.auditLogs, biz.RuntimeAuditEvent{
		ID:        1,
		EventType: "admin_control_plane",
		EventKey:  "admin_user.password.reset",
		Source:    "admin_manage",
		Payload: map[string]any{
			"action": "admin_user.password.reset",
			"actor":  map[string]any{"username": "admin"},
			"target": map[string]any{"type": "admin_user", "key": "demo_debug"},
			"before": map[string]any{"password_reset": false},
			"after":  map[string]any{"password_reset": true},
		},
		CreatedAt: now,
	})

	logger := log.NewStdLogger(io.Discard)
	j := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{
		UserID:   1,
		Username: "admin",
		Role:     biz.RoleAdmin,
	})
	params, _ := structpb.NewStruct(map[string]any{
		"source":       "admin_manage",
		"actor_key":    "admin",
		"target_type":  "admin_user",
		"target_key":   "demo_debug",
		"keyword":      "password",
		"created_from": now.Add(-time.Minute).Format(time.RFC3339),
		"created_to":   now.Add(time.Minute).Format(time.RFC3339),
		"limit":        10,
	})

	_, res, err := j.handleAdmin(ctx, "audit_logs", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected ok result, got %+v", res)
	}
	data := res.Data.AsMap()
	events, ok := data["events"].([]any)
	if !ok || len(events) != 1 {
		t.Fatalf("expected one audit event, got %#v", data["events"])
	}
	event, ok := events[0].(map[string]any)
	if !ok || event["event_key"] != "admin_user.password.reset" {
		t.Fatalf("unexpected audit event payload %#v", events[0])
	}
	if event["risk_level"] != "high" || event["action_label"] != "密码重置" {
		t.Fatalf("unexpected audit metadata %#v", event)
	}
	if event["summary"] != "admin 重置了 demo_debug 的密码" {
		t.Fatalf("unexpected audit summary %#v", event["summary"])
	}
	if event["actor_key"] != "admin" || event["target_type"] != "admin_user" || event["target_key"] != "demo_debug" {
		t.Fatalf("unexpected actor target metadata %#v", event)
	}
	if repo.lastAuditFilter.ActorKey != "admin" ||
		repo.lastAuditFilter.TargetType != "admin_user" ||
		repo.lastAuditFilter.TargetKey != "demo_debug" ||
		repo.lastAuditFilter.Keyword != "password" ||
		repo.lastAuditFilter.CreatedFrom.IsZero() ||
		repo.lastAuditFilter.CreatedTo.IsZero() {
		t.Fatalf("audit filter was not passed through: %#v", repo.lastAuditFilter)
	}
}

func TestJsonrpcDispatcher_AdminMutationsRejectUnknownParams(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	now := time.Now()
	repo.admins[1] = &biz.AdminUser{
		ID: 1, Username: "admin", IsSuperAdmin: true, CreatedAt: now, UpdatedAt: now,
	}
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{
		log:           log.NewHelper(log.With(logger, "module", "service.jsonrpc.test")),
		adminReader:   repo,
		adminManageUC: biz.NewAdminManageUsecase(repo, logger, tracesdk.NewTracerProvider()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Role: biz.RoleAdmin})

	tests := []struct {
		method string
		params map[string]any
	}{
		{method: "create", params: map[string]any{"username": "worker", "password": "123456", "actor_id": 9}},
		{method: "set_roles", params: map[string]any{"id": 2, "role_keys": []any{"sales"}, "permissions": []any{"system.audit.read"}}},
		{method: "set_role_permissions", params: map[string]any{"role_key": "sales", "permission_keys": []any{}, "expected_version": 1, "customer_key": "other"}},
		{method: "set_role_navigation", params: map[string]any{"role_key": "sales", "mode": "recommended", "primary_menu_paths": []any{}, "expected_version": 1, "customer_key": "other"}},
		{method: "set_disabled", params: map[string]any{"id": 2, "disabled": true, "reason": "离岗", "revoked_at": now.Format(time.RFC3339)}},
		{method: "revoke", params: map[string]any{"id": 2, "reason": "离职", "released_task_count": 999}},
		{method: "reset_password", params: map[string]any{"id": 2, "password": "123456", "auth_version": 999}},
	}
	for _, tt := range tests {
		t.Run(tt.method, func(t *testing.T) {
			params, err := structpb.NewStruct(tt.params)
			if err != nil {
				t.Fatalf("params error = %v", err)
			}
			_, result, err := dispatcher.handleAdmin(ctx, tt.method, "1", params)
			if err != nil {
				t.Fatalf("handleAdmin() error = %v", err)
			}
			if result == nil || result.Code != errcode.InvalidParam.Code {
				t.Fatalf("result = %#v, want invalid param", result)
			}
		})
	}
}
