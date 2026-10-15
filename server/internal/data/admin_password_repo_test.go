package data

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/conf"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/runtimeauditevent"

	"github.com/go-kratos/kratos/v2/log"
	"golang.org/x/crypto/bcrypt"
)

func TestAdminPasswordChangeAndDefaultResetInvalidateSessions(t *testing.T) {
	for _, mode := range []string{"employee self", "super admin self", "default reset"} {
		t.Run(mode, func(t *testing.T) {
			fx := newAdminManageAtomicFixture(t)
			admin := fx.target
			if mode == "super admin self" {
				admin = fx.operator
			}
			hash, err := bcrypt.GenerateFromPassword([]byte("old-password"), bcrypt.MinCost)
			if err != nil {
				t.Fatal(err)
			}
			admin = fx.client.AdminUser.UpdateOneID(admin.ID).SetPasswordHash(string(hash)).SaveX(fx.ctx)
			logger := log.NewStdLogger(io.Discard)
			config := &conf.Data{Auth: &conf.Data_Auth{JwtSecret: "password-change-isolated-test-secret", JwtExpireSeconds: 3600}}
			auth := biz.NewAdminAuthUsecase(NewAdminAuthRepo(fx.repo.data, logger), NewAdminTokenGenerator(config, logger), NewAdminTokenParser(config), nil, logger, nil)
			tokens := []string{}
			for range 2 {
				token, _, _, err := auth.Login(fx.ctx, admin.Username, "old-password")
				if err != nil {
					t.Fatal(err)
				}
				tokens = append(tokens, token)
			}
			claims, _, err := auth.Authenticate(fx.ctx, tokens[0])
			if err != nil {
				t.Fatal(err)
			}
			uc := biz.NewAdminManageUsecase(fx.repo, logger, nil)
			newPassword, eventKey, reason := "new-password", "admin_user.password.change", adminSessionRevokeReasonPasswordChange
			if mode == "default reset" {
				newPassword, eventKey, reason = "12345678", "admin_user.password.reset", adminSessionRevokeReasonPasswordReset
				ctx := biz.NewContextWithClaims(fx.ctx, &biz.AuthClaims{UserID: fx.operator.ID, Role: biz.RoleAdmin, AuthVersion: 1})
				_, err = uc.ResetDefaultPassword(ctx, admin.ID)
			} else {
				err = uc.ChangePassword(biz.NewContextWithClaims(fx.ctx, claims), "old-password", newPassword)
			}
			if err != nil {
				t.Fatal(err)
			}
			for _, token := range tokens {
				if _, _, err := auth.Authenticate(fx.ctx, token); !errors.Is(err, biz.ErrSessionRevoked) {
					t.Fatalf("old token error = %v, want ErrSessionRevoked", err)
				}
			}
			if _, _, _, err := auth.Login(fx.ctx, admin.Username, "old-password"); !errors.Is(err, biz.ErrInvalidPassword) {
				t.Fatalf("old password error = %v, want ErrInvalidPassword", err)
			}
			newToken, _, _, err := auth.Login(fx.ctx, admin.Username, newPassword)
			if err != nil {
				t.Fatal(err)
			}
			if _, _, err := auth.Authenticate(fx.ctx, newToken); err != nil {
				t.Fatal(err)
			}
			event := fx.client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey(eventKey)).OnlyX(fx.ctx)
			assertAdminAuditSessionRevocation(t, event, 2, reason, tokens)
			for _, secret := range []string{"old-password", newPassword, string(hash), newToken} {
				if strings.Contains(event.Payload, secret) {
					t.Fatal("audit contains credential material")
				}
			}
			if mode == "default reset" && !strings.Contains(event.Payload, `"reset_to_default":true`) {
				t.Fatal("default reset is not distinguishable in audit")
			}
		})
	}
}

func TestAdminPasswordChangeRejectsStaleOrDisabledAccount(t *testing.T) {
	for _, mode := range []string{"hash changed", "version changed", "disabled"} {
		t.Run(mode, func(t *testing.T) {
			fx := newAdminManageAtomicFixture(t)
			command := &biz.AdminPasswordChange{AdminID: fx.target.ID, ExpectedAuthVersion: fx.target.AuthVersion, ExpectedPasswordHash: fx.target.PasswordHash, PasswordHash: "candidate-hash"}
			want := biz.ErrAuthVersionStale
			switch mode {
			case "hash changed":
				fx.client.AdminUser.UpdateOneID(fx.target.ID).SetPasswordHash("concurrent-hash").SaveX(fx.ctx)
			case "version changed":
				fx.client.AdminUser.UpdateOneID(fx.target.ID).AddAuthVersion(1).SaveX(fx.ctx)
			case "disabled":
				fx.client.AdminUser.UpdateOneID(fx.target.ID).SetDisabled(true).SaveX(fx.ctx)
				want = biz.ErrUserDisabled
			}
			before := fx.client.AdminUser.GetX(fx.ctx, fx.target.ID)
			if err := fx.repo.ChangeAdminPasswordWithAudit(fx.ctx, command); !errors.Is(err, want) {
				t.Fatalf("error = %v, want %v", err, want)
			}
			after := fx.client.AdminUser.GetX(fx.ctx, fx.target.ID)
			if after.PasswordHash != before.PasswordHash || after.AuthVersion != before.AuthVersion || fx.client.RuntimeAuditEvent.Query().CountX(fx.ctx) != 0 {
				t.Fatal("rejected change wrote data")
			}
		})
	}
}

func TestAdminPasswordChangeRollsBackWhenAuditFails(t *testing.T) {
	fx := newAdminManageAtomicFixture(t)
	session := fx.client.AdminSession.Create().SetSessionKey("password-rollback-session").SetAdminUserID(fx.target.ID).SetAuthVersion(fx.target.AuthVersion).SetIssuedAt(time.Now()).SetExpiresAt(time.Now().Add(time.Hour)).SaveX(fx.ctx)
	injectedErr := errors.New("injected audit failure")
	fx.client.RuntimeAuditEvent.Use(func(next ent.Mutator) ent.Mutator {
		return ent.MutateFunc(func(ctx context.Context, mutation ent.Mutation) (ent.Value, error) {
			if mutation.Op().Is(ent.OpCreate) {
				return nil, injectedErr
			}
			return next.Mutate(ctx, mutation)
		})
	})
	err := fx.repo.ChangeAdminPasswordWithAudit(fx.ctx, &biz.AdminPasswordChange{AdminID: fx.target.ID, ExpectedAuthVersion: fx.target.AuthVersion, ExpectedPasswordHash: fx.target.PasswordHash, PasswordHash: "new-hash"})
	if !errors.Is(err, injectedErr) {
		t.Fatalf("password change error = %v, want injected audit failure", err)
	}
	after := fx.client.AdminUser.GetX(fx.ctx, fx.target.ID)
	if after.PasswordHash != fx.target.PasswordHash || after.AuthVersion != fx.target.AuthVersion || fx.client.AdminSession.GetX(fx.ctx, session.ID).RevokedAt != nil {
		t.Fatal("credential and session writes were not rolled back")
	}
	if fx.client.RuntimeAuditEvent.Query().CountX(fx.ctx) != 0 {
		t.Fatal("failed password change wrote an audit event")
	}
}

func TestAdminDefaultPasswordResetRechecksSuperAdminInsideTransaction(t *testing.T) {
	fx := newAdminManageAtomicFixture(t)
	fx.client.AdminUser.UpdateOneID(fx.operator.ID).SetIsSuperAdmin(false).SaveX(fx.ctx)
	_, err := fx.repo.ResetAdminPasswordWithAudit(fx.ctx, &biz.AdminPasswordReset{AdminID: fx.target.ID, OperatorID: fx.operator.ID, PasswordHash: "candidate-default-hash", UseDefaultPassword: true})
	if !errors.Is(err, biz.ErrNoPermission) {
		t.Fatalf("error = %v, want ErrNoPermission", err)
	}
	if fx.client.AdminUser.GetX(fx.ctx, fx.target.ID).PasswordHash != fx.target.PasswordHash || fx.client.RuntimeAuditEvent.Query().CountX(fx.ctx) != 0 {
		t.Fatal("unauthorized default reset wrote data")
	}
}
