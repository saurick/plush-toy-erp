package data

import (
	"context"
	"io"
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
	admins    map[int]*biz.AdminUser
	rolePerms map[string][]string
}

func newMemAdminManageRepoForData() *memAdminManageRepoForData {
	return &memAdminManageRepoForData{
		admins:    map[int]*biz.AdminUser{},
		rolePerms: map[string][]string{},
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

func (r *memAdminManageRepoForData) SetAdminDisabled(_ context.Context, id int, disabled bool) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	admin.Disabled = disabled
	return nil
}

func (r *memAdminManageRepoForData) UpdateAdminPasswordHash(_ context.Context, id int, passwordHash string) error {
	admin, ok := r.admins[id]
	if !ok {
		return biz.ErrAdminNotFound
	}
	admin.PasswordHash = passwordHash
	return nil
}

func TestJsonrpcData_AdminMe_ReturnsERPPreferences(t *testing.T) {
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
	j := &JsonrpcData{
		log:           log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
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

func TestJsonrpcData_AdminResetPassword(t *testing.T) {
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
	j := &JsonrpcData{
		log:           log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
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

func TestJsonrpcData_AdminSetERPColumnOrder(t *testing.T) {
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
	j := &JsonrpcData{
		log:           log.NewHelper(log.With(logger, "module", "data.jsonrpc.test")),
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
