package service

import (
	"context"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

type allWarehouseScopeAdminRepo struct {
	*memAdminManageRepoForData
}

func TestCurrentWarehouseDataScopeFailsClosedWithoutAdminManageUsecase(t *testing.T) {
	dispatcher := &jsonrpcDispatcher{}
	scope, result := dispatcher.currentWarehouseDataScope(context.Background())
	if result == nil || result.Code != errcode.Internal.Code {
		t.Fatalf("missing scope resolver result = %#v", result)
	}
	if scope.Mode != biz.DataScopeModeNone {
		t.Fatalf("missing scope resolver mode = %q", scope.Mode)
	}
}

func TestGetStrictRoleDataScopes(t *testing.T) {
	scopes, ok := getStrictRoleDataScopes(map[string]any{
		"data_scopes": []any{map[string]any{
			"resource_type": "warehouse",
			"mode":          "ASSIGNED",
			"resource_ids":  []any{float64(2), float64(1), float64(2)},
		}},
	}, "data_scopes")
	if !ok || len(scopes) != 1 || scopes[0].Mode != biz.DataScopeModeAssigned || len(scopes[0].ResourceIDs) != 2 || scopes[0].ResourceIDs[0] != 1 {
		t.Fatalf("parsed scopes = %#v ok=%v", scopes, ok)
	}
	if _, ok := getStrictRoleDataScopes(map[string]any{
		"data_scopes": []any{map[string]any{"resource_type": "warehouse", "mode": "ASSIGNED", "resource_ids": []any{float64(0)}}},
	}, "data_scopes"); ok {
		t.Fatal("non-positive warehouse id must be rejected")
	}
}

func (r *allWarehouseScopeAdminRepo) ListRoleDataScopesByRoleKeys(context.Context, []string) ([]biz.RoleDataScope, error) {
	return []biz.RoleDataScope{{ResourceType: biz.DataScopeResourceWarehouse, Mode: biz.DataScopeModeAll}}, nil
}

func (r *allWarehouseScopeAdminRepo) SetRoleDataScopesWithAudit(context.Context, *biz.RoleDataScopesChangeCommand) (*biz.AdminRole, error) {
	return nil, biz.ErrBadParam
}

func newAllWarehouseScopeAdminUsecase() *biz.AdminManageUsecase {
	return biz.NewAdminManageUsecase(
		&allWarehouseScopeAdminRepo{memAdminManageRepoForData: newMemAdminManageRepoForData()},
		log.NewStdLogger(io.Discard),
		nil,
	)
}
