package biz

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
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

func (r *stubAdminManageRepo) SetAdminDisabled(_ context.Context, id int, disabled bool) error {
	admin, ok := r.adminsByID[id]
	if !ok {
		return ErrAdminNotFound
	}
	admin.Disabled = disabled
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
