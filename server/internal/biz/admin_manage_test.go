package biz

import (
	"context"
	"errors"
	"io"
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
	nextID        int
}

func newStubAdminManageRepo() *stubAdminManageRepo {
	return &stubAdminManageRepo{
		adminsByID:    map[int]*AdminUser{},
		adminsByName:  map[string]*AdminUser{},
		adminsByPhone: map[string]*AdminUser{},
		nextID:        10,
	}
}

func (r *stubAdminManageRepo) clone(admin *AdminUser) *AdminUser {
	if admin == nil {
		return nil
	}
	cloned := *admin
	cloned.MenuPermissions = append([]string(nil), admin.MenuPermissions...)
	cloned.MobileRolePermissions = append([]string(nil), admin.MobileRolePermissions...)
	cloned.ERPPreferences = NormalizeAdminERPPreferences(admin.ERPPreferences)
	return &cloned
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
		ID:                    r.nextID,
		Username:              admin.Username,
		Phone:                 admin.Phone,
		PasswordHash:          admin.PasswordHash,
		Level:                 int8(admin.Level),
		MenuPermissions:       append([]string(nil), admin.MenuPermissions...),
		MobileRolePermissions: append([]string(nil), admin.MobileRolePermissions...),
		Disabled:              false,
		CreatedAt:             now,
		UpdatedAt:             now,
	}
	r.adminsByID[created.ID] = created
	r.adminsByName[created.Username] = created
	if created.Phone != "" {
		r.adminsByPhone[created.Phone] = created
	}
	return r.clone(created), nil
}

func (r *stubAdminManageRepo) UpdateAdminPermissions(_ context.Context, id int, menuPermissions []string, mobileRolePermissions []string) error {
	admin, ok := r.adminsByID[id]
	if !ok {
		return ErrAdminNotFound
	}
	admin.MenuPermissions = append([]string(nil), menuPermissions...)
	admin.MobileRolePermissions = append([]string(nil), mobileRolePermissions...)
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

func TestAdminManageUsecase_CreateDefaultsMenusForStandardAdmin(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", Level: int8(AdminLevelSuper)}
	repo.adminsByName["root"] = repo.adminsByID[1]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	created, err := uc.Create(ctx, "manager", "13800138000", "secret123", AdminLevelStandard, nil, []string{"purchasing"})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if len(created.MenuPermissions) == 0 {
		t.Fatalf("expected default menu permissions")
	}
	if created.Phone != "13800138000" {
		t.Fatalf("expected normalized phone, got %q", created.Phone)
	}
	if len(created.MobileRolePermissions) != 1 || created.MobileRolePermissions[0] != "purchasing" {
		t.Fatalf("expected purchasing mobile permission, got %#v", created.MobileRolePermissions)
	}
	for _, key := range created.MenuPermissions {
		if key == "/erp/system/permissions" {
			t.Fatalf("default menu permissions must exclude permission center")
		}
	}
}

func TestAdminManageUsecase_ResetPasswordUpdatesStandardAdminHash(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", Level: int8(AdminLevelSuper)}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "manager", Level: int8(AdminLevelStandard), PasswordHash: "old"}
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
}

func TestAdminManageUsecase_ResetPasswordRejectsSuperAdminTarget(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", Level: int8(AdminLevelSuper), PasswordHash: "old"}
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

func TestAdminManageUsecase_SetPermissionsRejectsSuperAdmin(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", Level: int8(AdminLevelSuper)}
	repo.adminsByName["root"] = repo.adminsByID[1]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	_, err := uc.SetMenuPermissions(ctx, 1, []string{"/erp/help-center"})
	if !errors.Is(err, ErrNoPermission) {
		t.Fatalf("expected ErrNoPermission, got %v", err)
	}
}

func TestAdminManageUsecase_SetMenuPermissionsPreservesMobileRoles(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", Level: int8(AdminLevelSuper)}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{
		ID:                    2,
		Username:              "manager",
		Level:                 int8(AdminLevelStandard),
		MobileRolePermissions: []string{"purchasing"},
	}
	repo.adminsByName["manager"] = repo.adminsByID[2]

	uc := NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	updated, err := uc.SetMenuPermissions(ctx, 2, []string{"/erp/help-center"})
	if err != nil {
		t.Fatalf("SetMenuPermissions() error = %v", err)
	}
	if len(updated.MobileRolePermissions) != 1 || updated.MobileRolePermissions[0] != "purchasing" {
		t.Fatalf("expected mobile role permissions to be preserved, got %#v", updated.MobileRolePermissions)
	}
}

func TestAdminManageUsecase_SetPhoneRejectsDuplicatePhone(t *testing.T) {
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "root", Level: int8(AdminLevelSuper)}
	repo.adminsByName["root"] = repo.adminsByID[1]
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "manager", Level: int8(AdminLevelStandard)}
	repo.adminsByName["manager"] = repo.adminsByID[2]
	repo.adminsByID[3] = &AdminUser{ID: 3, Username: "buyer", Phone: "13800138000", Level: int8(AdminLevelStandard)}
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
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "manager", Level: int8(AdminLevelStandard)}
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
