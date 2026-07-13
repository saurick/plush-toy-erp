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
	admins          map[int]*biz.AdminUser
	rolePerms       map[string][]string
	auditLogs       []biz.RuntimeAuditEvent
	lastAuditFilter biz.RuntimeAuditEventListFilter
	lifecycleErr    error
}

func newMemAdminManageRepoForData() *memAdminManageRepoForData {
	return &memAdminManageRepoForData{
		admins:    map[int]*biz.AdminUser{},
		rolePerms: map[string][]string{},
		auditLogs: []biz.RuntimeAuditEvent{},
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
			return biz.AdminRole{
				Key:         role.Key,
				Name:        role.Name,
				Description: role.Description,
				Builtin:     role.Builtin,
				Disabled:    role.Disabled,
				SortOrder:   role.SortOrder,
				Permissions: biz.NormalizePermissionKeys(permissions),
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

func (r *memAdminManageRepoForData) UpdateAdminRoles(_ context.Context, id int, roleKeys []string) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	r.applyAdminRoles(admin, roleKeys)
	return nil
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

func (r *memAdminManageRepoForData) UpdateAdminPhone(_ context.Context, id int, phone string) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	admin.Phone = phone
	return nil
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

func (r *memAdminManageRepoForData) ChangeAdminLifecycle(_ context.Context, change *biz.AdminLifecycleChange) (int, error) {
	if change == nil {
		return 0, biz.ErrBadParam
	}
	if r.lifecycleErr != nil {
		return 0, r.lifecycleErr
	}
	admin, ok := r.admins[change.AdminID]
	if !ok {
		return 0, biz.ErrAdminNotFound
	}
	admin.Disabled = change.Disabled
	admin.StatusReason = change.Reason
	now := time.Now()
	admin.StatusChangedAt = &now
	admin.StatusChangedBy = &change.OperatorID
	if change.Revoke {
		admin.RevokedAt = &now
	}
	return 0, nil
}

func (r *memAdminManageRepoForData) UpdateAdminPasswordHash(_ context.Context, id int, passwordHash string) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	admin.PasswordHash = passwordHash
	return nil
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

func TestJsonrpcDispatcher_AdminCreateWithRolesRequiresUpdatePermission(t *testing.T) {
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

	repo.admins[1].Permissions = append(repo.admins[1].Permissions, biz.PermissionSystemUserUpdate)
	_, res, err = j.handleAdmin(ctx, "create", "3", withRoleParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected create with roles to succeed after update permission, got %+v", res)
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
		{method: "set_role_permissions", params: map[string]any{"role_key": "sales", "permission_keys": []any{}, "customer_key": "other"}},
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
