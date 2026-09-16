package service

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestJsonrpcAdminPasswordContracts(t *testing.T) {
	for _, tc := range []struct {
		name   string
		method string
		params map[string]any
		super  bool
		noAuth bool
		want   int32
	}{
		{name: "self change without management permissions", method: "change_password", params: map[string]any{"old_password": "old-password", "new_password": "new-password"}, want: errcode.OK.Code},
		{name: "super self change", method: "change_password", super: true, params: map[string]any{"old_password": "old-password", "new_password": "new-password"}, want: errcode.OK.Code},
		{name: "wrong old password", method: "change_password", params: map[string]any{"old_password": "wrong-password", "new_password": "new-password"}, want: errcode.AuthInvalidPassword.Code},
		{name: "cannot target another account", method: "change_password", params: map[string]any{"id": 2, "old_password": "old-password", "new_password": "new-password"}, want: errcode.InvalidParam.Code},
		{name: "cannot override credential version", method: "change_password", params: map[string]any{"auth_version": 2, "old_password": "old-password", "new_password": "new-password"}, want: errcode.InvalidParam.Code},
		{name: "password type is strict", method: "change_password", params: map[string]any{"old_password": "old-password", "new_password": 12345678}, want: errcode.InvalidParam.Code},
		{name: "short password", method: "change_password", params: map[string]any{"old_password": "old-password", "new_password": "123"}, want: errcode.InvalidParam.Code},
		{name: "unauthenticated change", method: "change_password", noAuth: true, params: map[string]any{"old_password": "old-password", "new_password": "new-password"}, want: errcode.AuthRequired.Code},
		{name: "super default reset", method: "reset_default_password", super: true, params: map[string]any{"id": 2}, want: errcode.OK.Code},
		{name: "manager cannot use default reset", method: "reset_default_password", params: map[string]any{"id": 2}, want: errcode.PermissionDenied.Code},
		{name: "default password cannot be supplied", method: "reset_default_password", super: true, params: map[string]any{"id": 2, "password": "other-password"}, want: errcode.InvalidParam.Code},
		{name: "fractional target rejected", method: "reset_default_password", super: true, params: map[string]any{"id": 2.1}, want: errcode.InvalidParam.Code},
		{name: "super target remains protected", method: "reset_default_password", super: true, params: map[string]any{"id": 1}, want: errcode.PermissionDenied.Code},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := newMemAdminManageRepoForData()
			hash, err := bcrypt.GenerateFromPassword([]byte("old-password"), bcrypt.MinCost)
			if err != nil {
				t.Fatal(err)
			}
			permissions := []string{}
			if tc.method == "reset_default_password" {
				permissions = []string{biz.PermissionSystemUserUpdate}
			}
			repo.admins[1] = &biz.AdminUser{ID: 1, Username: "password_actor", PasswordHash: string(hash), AuthVersion: 1, IsSuperAdmin: tc.super, Permissions: permissions}
			repo.admins[2] = &biz.AdminUser{ID: 2, Username: "password_target", PasswordHash: "other-hash", AuthVersion: 1}
			logger := log.NewStdLogger(io.Discard)
			d := &jsonrpcDispatcher{log: log.NewHelper(logger), adminReader: repo, adminManageUC: biz.NewAdminManageUsecase(repo, logger, nil)}
			ctx := context.Background()
			if !tc.noAuth {
				ctx = biz.NewContextWithClaims(ctx, &biz.AuthClaims{UserID: 1, Role: biz.RoleAdmin, AuthVersion: 1})
			}
			params, err := structpb.NewStruct(tc.params)
			if err != nil {
				t.Fatal(err)
			}
			_, result, err := d.handleAdmin(ctx, tc.method, "password-request", params)
			if err != nil || result == nil || result.Code != tc.want {
				t.Fatalf("result = %v, err = %v, want code %d", result, err, tc.want)
			}
			if tc.want != errcode.OK.Code {
				if repo.admins[1].PasswordHash != string(hash) || repo.admins[2].PasswordHash != "other-hash" {
					t.Fatal("rejected request changed credentials")
				}
			} else {
				accountID, password := 1, "new-password"
				if tc.method == "reset_default_password" {
					accountID, password = 2, "12345678"
				}
				if bcrypt.CompareHashAndPassword([]byte(repo.admins[accountID].PasswordHash), []byte(password)) != nil {
					t.Fatal("stored password differs from request contract")
				}
				if result.Data != nil {
					t.Fatal("password operations must return no account or credential payload")
				}
			}
		})
	}
}
