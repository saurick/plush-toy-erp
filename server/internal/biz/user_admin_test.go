package biz

import (
	"context"
	"io"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	tracesdk "go.opentelemetry.io/otel/sdk/trace"
	"golang.org/x/crypto/bcrypt"
)

type stubUserAdminRepo struct {
	users map[int]*User
}

func newStubUserAdminRepo() *stubUserAdminRepo {
	return &stubUserAdminRepo{users: map[int]*User{}}
}

func (r *stubUserAdminRepo) ListUsers(_ context.Context, _, _ int, _ string) ([]*User, int, error) {
	out := make([]*User, 0, len(r.users))
	for _, user := range r.users {
		cloned := *user
		out = append(out, &cloned)
	}
	return out, len(out), nil
}

func (r *stubUserAdminRepo) SetUserDisabled(_ context.Context, userID int, disabled bool) error {
	user, ok := r.users[userID]
	if !ok {
		return ErrUserNotFound
	}
	user.Disabled = disabled
	return nil
}

func (r *stubUserAdminRepo) UpdateUserPasswordHash(_ context.Context, userID int, passwordHash string) error {
	user, ok := r.users[userID]
	if !ok {
		return ErrUserNotFound
	}
	user.PasswordHash = passwordHash
	return nil
}

func TestUserAdminUsecase_ResetPasswordUpdatesUserHash(t *testing.T) {
	repo := newStubUserAdminRepo()
	repo.users[8] = &User{ID: 8, Username: "worker", PasswordHash: "old"}

	uc := NewUserAdminUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())
	ctx := NewContextWithClaims(context.Background(), &AuthClaims{
		UserID:   1,
		Username: "root",
		Role:     RoleAdmin,
	})

	if err := uc.ResetPassword(ctx, 8, "new-secret"); err != nil {
		t.Fatalf("ResetPassword() error = %v", err)
	}
	if repo.users[8].PasswordHash == "old" {
		t.Fatalf("expected password hash to change")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(repo.users[8].PasswordHash), []byte("new-secret")); err != nil {
		t.Fatalf("stored hash does not match new password: %v", err)
	}
}

func TestUserAdminUsecase_ResetPasswordRequiresAdmin(t *testing.T) {
	repo := newStubUserAdminRepo()
	repo.users[8] = &User{ID: 8, Username: "worker", PasswordHash: "old"}

	uc := NewUserAdminUsecase(repo, log.NewStdLogger(io.Discard), tracesdk.NewTracerProvider())

	err := uc.ResetPassword(context.Background(), 8, "new-secret")
	if err != ErrForbidden {
		t.Fatalf("expected ErrForbidden, got %v", err)
	}
	if repo.users[8].PasswordHash != "old" {
		t.Fatalf("password hash should not change without admin claims")
	}
}
