package service

import (
	"context"
	"io"
	"reflect"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/types/known/structpb"
)

func TestRolePermissionPolicyRPCAndReadOnlyProjection(t *testing.T) {
	repo := newMemAdminManageRepoForData()
	repo.admins[1] = &biz.AdminUser{ID: 1, Username: "root", IsSuperAdmin: true}
	logger := log.NewStdLogger(io.Discard)
	dispatcher := &jsonrpcDispatcher{log: log.NewHelper(logger), adminReader: repo,
		adminManageUC:    biz.NewAdminManageUsecase(repo, logger, nil),
		customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}
	ctx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 1, Role: biz.RoleAdmin})
	for _, method := range []string{"set_role_settings", "effective_role_access"} {
		params, _ := structpb.NewStruct(map[string]any{
			"role_key": biz.WarehouseRoleKey, "permission_keys": []any{biz.PermissionWarehouseInventoryRead},
			"expected_version": 1, "data_scopes": []any{map[string]any{"resource_type": "warehouse", "mode": "ALL", "resource_ids": []any{}}}, "primary_menu_paths": []any{}, "secondary_menu_paths": []any{},
		})
		if method == "effective_role_access" {
			params, _ = structpb.NewStruct(map[string]any{"role_key": biz.WarehouseRoleKey, "permission_keys": []any{biz.PermissionWarehouseInventoryRead}})
		}
		_, result, err := dispatcher.handleAdmin(ctx, method, "policy-denied", params)
		if err != nil || result.Code != errcode.PermissionDenied.Code || repo.lastRoleSettingsChange != nil {
			t.Fatalf("%s: result=%#v err=%v changed=%#v", method, result, err, repo.lastRoleSettingsChange)
		}
	}
	role := repo.roleByKey(biz.WarehouseRoleKey)
	formal := adminRoleToMap(role, true)
	snapshot := PermissionRelationshipSnapshot(nil, []biz.AdminRole{role}, nil, nil, nil, nil)
	observed := snapshot["roles"].([]any)[0].(map[string]any)
	if !reflect.DeepEqual(formal["permission_policy"], observed["permission_policy"]) || observed["permissions_editable"] != false {
		t.Fatal("workbench must share the role policy and remain read-only")
	}
}
