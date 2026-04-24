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
	adminsByID   map[int]*AdminUser
	adminsByName map[string]*AdminUser
	nextID       int
}

func newStubAdminManageRepo() *stubAdminManageRepo {
	return &stubAdminManageRepo{
		adminsByID:   map[int]*AdminUser{},
		adminsByName: map[string]*AdminUser{},
		nextID:       10,
	}
}

func (r *stubAdminManageRepo) clone(admin *AdminUser) *AdminUser {
	if admin == nil {
		return nil
	}
	cloned := *admin
	cloned.MenuPermissions = append([]string(nil), admin.MenuPermissions...)
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
		ID:              r.nextID,
		Username:        admin.Username,
		PasswordHash:    admin.PasswordHash,
		Level:           int8(admin.Level),
		MenuPermissions: append([]string(nil), admin.MenuPermissions...),
		Disabled:        false,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	r.adminsByID[created.ID] = created
	r.adminsByName[created.Username] = created
	return r.clone(created), nil
}

func (r *stubAdminManageRepo) UpdateAdminMenuPermissions(_ context.Context, id int, menuPermissions []string) error {
	admin, ok := r.adminsByID[id]
	if !ok {
		return ErrAdminNotFound
	}
	admin.MenuPermissions = append([]string(nil), menuPermissions...)
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

	created, err := uc.Create(ctx, "manager", "secret123", AdminLevelStandard, nil)
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if len(created.MenuPermissions) == 0 {
		t.Fatalf("expected default menu permissions")
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
