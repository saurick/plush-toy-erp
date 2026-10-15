package biz

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"golang.org/x/crypto/bcrypt"
)

func passwordChangeUsecaseFixture(t *testing.T) (*AdminManageUsecase, *stubAdminManageRepo, context.Context) {
	t.Helper()
	hash, err := bcrypt.GenerateFromPassword([]byte("old-password"), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	repo := newStubAdminManageRepo()
	repo.adminsByID[1] = &AdminUser{ID: 1, Username: "password_employee", PasswordHash: string(hash), AuthVersion: 1}
	repo.adminsByID[2] = &AdminUser{ID: 2, Username: "password_other", PasswordHash: "other-hash", AuthVersion: 1}
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{UserID: 1, Role: RoleAdmin, AuthVersion: 1})
	return NewAdminManageUsecase(repo, log.NewStdLogger(io.Discard), nil), repo, ctx
}

func TestAdminManageUsecaseChangeOwnPasswordWithoutManagementPermission(t *testing.T) {
	for _, superAdmin := range []bool{false, true} {
		t.Run(map[bool]string{false: "employee", true: "super admin"}[superAdmin], func(t *testing.T) {
			uc, repo, ctx := passwordChangeUsecaseFixture(t)
			repo.adminsByID[1].IsSuperAdmin = superAdmin
			if err := uc.ChangePassword(ctx, "old-password", "新-password-1"); err != nil {
				t.Fatal(err)
			}
			admin := repo.adminsByID[1]
			if err := bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte("新-password-1")); err != nil {
				t.Fatal("new password does not match stored credentials")
			}
			if admin.AuthVersion != 2 || repo.adminsByID[2].PasswordHash != "other-hash" {
				t.Fatal("password change must invalidate only the current account's old credentials")
			}
			if len(repo.auditEvents) != 1 || repo.auditEvents[0].EventKey != "admin_user.password.change" {
				t.Fatal("expected one self-service password audit event")
			}
		})
	}
}

func TestAdminManageUsecaseChangePasswordRejectsInvalidAttempts(t *testing.T) {
	for _, tc := range []struct {
		name   string
		old    string
		new    string
		change func(*stubAdminManageRepo, context.Context) context.Context
		want   error
	}{
		{name: "wrong old password", old: "wrong-password", new: "new-password", want: ErrInvalidPassword},
		{name: "old password is not trimmed", old: " old-password ", new: "new-password", want: ErrInvalidPassword},
		{name: "missing old password", new: "new-password", want: ErrBadParam},
		{name: "short new password", old: "old-password", new: "1234567", want: ErrBadParam},
		{name: "same new password", old: "old-password", new: "old-password", want: ErrAdminPasswordUnchanged},
		{name: "unauthenticated", old: "old-password", new: "new-password", want: ErrForbidden,
			change: func(_ *stubAdminManageRepo, _ context.Context) context.Context { return context.Background() }},
		{name: "disabled", old: "old-password", new: "new-password", want: ErrUserDisabled,
			change: func(r *stubAdminManageRepo, ctx context.Context) context.Context {
				r.adminsByID[1].Disabled = true
				return ctx
			}},
		{name: "revoked", old: "old-password", new: "new-password", want: ErrUserDisabled,
			change: func(r *stubAdminManageRepo, ctx context.Context) context.Context {
				now := time.Now()
				r.adminsByID[1].RevokedAt = &now
				return ctx
			}},
		{name: "session credentials changed", old: "old-password", new: "new-password", want: ErrAuthVersionStale,
			change: func(r *stubAdminManageRepo, ctx context.Context) context.Context {
				r.adminsByID[1].AuthVersion++
				return ctx
			}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			uc, repo, ctx := passwordChangeUsecaseFixture(t)
			if tc.change != nil {
				ctx = tc.change(repo, ctx)
			}
			beforeHash, beforeVersion := repo.adminsByID[1].PasswordHash, repo.adminsByID[1].AuthVersion
			if err := uc.ChangePassword(ctx, tc.old, tc.new); !errors.Is(err, tc.want) {
				t.Fatalf("error = %v, want %v", err, tc.want)
			}
			if repo.adminsByID[1].PasswordHash != beforeHash || repo.adminsByID[1].AuthVersion != beforeVersion || len(repo.auditEvents) != 0 {
				t.Fatal("rejected password change must not mutate credentials or audit")
			}
		})
	}
}

func TestAdminManageUsecaseResetDefaultPasswordRequiresSuperAdmin(t *testing.T) {
	uc, repo, ctx := passwordChangeUsecaseFixture(t)
	repo.adminsByID[1].Permissions = []string{PermissionSystemUserUpdate}
	if _, err := uc.ResetDefaultPassword(ctx, 2); !errors.Is(err, ErrNoPermission) {
		t.Fatalf("ordinary manager error = %v, want ErrNoPermission", err)
	}
	if repo.adminsByID[2].PasswordHash != "other-hash" || len(repo.auditEvents) != 0 {
		t.Fatal("unauthorized reset wrote data")
	}
	repo.adminsByID[1].IsSuperAdmin = true
	if _, err := uc.ResetDefaultPassword(ctx, 2); err != nil {
		t.Fatal(err)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(repo.adminsByID[2].PasswordHash), []byte("12345678")); err != nil {
		t.Fatal("default reset must use exactly 12345678")
	}
	if _, err := uc.ResetDefaultPassword(ctx, 1); !errors.Is(err, ErrNoPermission) {
		t.Fatalf("super admin target error = %v, want ErrNoPermission", err)
	}
	repo.adminsByID[2].RevokedAt = new(time.Time)
	if _, err := uc.ResetDefaultPassword(ctx, 2); !errors.Is(err, ErrAdminRevoked) {
		t.Fatalf("revoked target error = %v, want ErrAdminRevoked", err)
	}
}
